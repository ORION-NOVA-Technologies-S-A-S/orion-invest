import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..broker.alpaca import alpaca, is_crypto
from ..config import settings
from ..db import get_db
from ..models import OrderLog, User
from ..risk import check_order, spent_today
from ..security import current_user
from .market import clean_symbol

router = APIRouter(prefix="/api/trading", tags=["trading"])


@router.get("/account")
async def account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = await alpaca.account()
    equity = float(a.get("equity") or 0)
    last_equity = float(a.get("last_equity") or 0)
    return {
        "environment": settings.alpaca_env,
        "status": a.get("status"),
        "crypto_status": a.get("crypto_status"),
        "currency": a.get("currency", "USD"),
        "equity": equity,
        "cash": float(a.get("cash") or 0),
        "buying_power": float(a.get("buying_power") or 0),
        "day_change": equity - last_equity,
        "day_change_pct": ((equity - last_equity) / last_equity * 100) if last_equity else 0,
        "trading_blocked": a.get("trading_blocked"),
        "spent_today": spent_today(db, user.id),
        "max_daily_usd": settings.max_daily_usd,
        "max_order_usd": settings.max_order_usd,
    }


@router.get("/positions")
async def positions(_: User = Depends(current_user)):
    out = []
    for p in await alpaca.positions():
        out.append(
            {
                "symbol": p["symbol"],
                "asset_class": p.get("asset_class"),
                "qty": float(p["qty"]),
                "avg_entry_price": float(p["avg_entry_price"]),
                "current_price": float(p.get("current_price") or 0),
                "market_value": float(p.get("market_value") or 0),
                "unrealized_pl": float(p.get("unrealized_pl") or 0),
                "unrealized_plpc": float(p.get("unrealized_plpc") or 0) * 100,
                "change_today_pct": float(p.get("change_today") or 0) * 100,
            }
        )
    return sorted(out, key=lambda x: x["market_value"], reverse=True)


@router.get("/history")
async def history(period: Literal["1W", "1M", "3M", "1A"] = "1M", _: User = Depends(current_user)):
    h = await alpaca.portfolio_history(period=period, timeframe="1D")
    return [
        {"t": t, "equity": e}
        for t, e in zip(h.get("timestamp") or [], h.get("equity") or [])
        if e is not None
    ]


@router.get("/orders")
async def orders(_: User = Depends(current_user)):
    return [
        {
            "id": o["id"],
            "symbol": o["symbol"],
            "side": o["side"],
            "type": o["type"],
            "qty": o.get("qty"),
            "notional": o.get("notional"),
            "filled_qty": o.get("filled_qty"),
            "filled_avg_price": o.get("filled_avg_price"),
            "limit_price": o.get("limit_price"),
            "status": o["status"],
            "submitted_at": o.get("submitted_at"),
        }
        for o in await alpaca.orders()
    ]


class OrderIn(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"] = "market"
    # "notional" = monto en dólares, "qty" = cantidad de acciones / monedas
    amount_mode: Literal["notional", "qty"] = "notional"
    amount: float = Field(gt=0)
    limit_price: float | None = Field(default=None, gt=0)
    confirm: bool = False

    @model_validator(mode="after")
    def _rules(self):
        if self.order_type == "limit" and not self.limit_price:
            raise ValueError("Una orden límite necesita precio límite.")
        if self.order_type == "limit" and self.amount_mode == "notional":
            raise ValueError("Las órdenes límite se hacen por cantidad, no por monto en dólares.")
        return self


@router.post("/orders")
async def place_order(data: OrderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    symbol = clean_symbol(data.symbol)
    crypto = is_crypto(symbol)

    # Precio de referencia para estimar el valor en dólares
    if data.order_type == "limit":
        ref_price = data.limit_price
    else:
        ref_price = (await alpaca.snapshot(symbol))["price"]
    if not ref_price:
        raise HTTPException(400, "No hay precio disponible para estimar la orden.")

    estimated = data.amount if data.amount_mode == "notional" else data.amount * ref_price
    check_order(db, user.id, data.side, estimated, data.confirm)

    payload: dict = {
        "symbol": symbol,
        "side": data.side,
        "type": data.order_type,
        # Cripto opera 24/7 (gtc); acciones fraccionadas por monto solo admiten "day"
        "time_in_force": "gtc" if crypto else "day",
        "client_order_id": f"orion-{uuid.uuid4().hex[:24]}",
    }
    if data.amount_mode == "notional":
        payload["notional"] = f"{data.amount:.2f}"
    else:
        payload["qty"] = f"{data.amount:.9f}".rstrip("0").rstrip(".")
    if data.order_type == "limit":
        payload["limit_price"] = f"{data.limit_price:.2f}" if data.limit_price >= 1 else f"{data.limit_price:.6f}"

    log = OrderLog(
        user_id=user.id,
        environment=settings.alpaca_env,
        symbol=symbol,
        side=data.side,
        order_type=data.order_type,
        qty=data.amount if data.amount_mode == "qty" else None,
        notional=data.amount if data.amount_mode == "notional" else None,
        limit_price=data.limit_price,
        estimated_usd=round(estimated, 2),
        status="pending",
    )
    db.add(log)
    db.commit()

    try:
        order = await alpaca.submit_order(payload)
    except HTTPException as exc:
        log.status = "error"
        log.error = str(exc.detail)[:500]
        db.commit()
        raise

    log.broker_order_id = order.get("id")
    log.status = order.get("status", "submitted")
    db.commit()
    return {"id": order.get("id"), "status": order.get("status"), "estimated_usd": round(estimated, 2)}


@router.delete("/orders/{order_id}")
async def cancel(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(400, "Id de orden no válido.")
    await alpaca.cancel_order(order_id)
    log = db.scalar(select(OrderLog).where(OrderLog.broker_order_id == order_id, OrderLog.user_id == user.id))
    if log:
        log.status = "canceled"
        db.commit()
    return {"ok": True}
