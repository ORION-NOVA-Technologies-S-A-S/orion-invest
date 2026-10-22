import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..broker.alpaca import alpaca, normalize_symbol
from ..db import get_db
from ..models import User, WatchlistItem
from ..security import current_user

router = APIRouter(prefix="/api/market", tags=["market"])

SYMBOL_RE = re.compile(r"^[A-Z0-9.]{1,10}(/[A-Z]{3,4})?$")
DEFAULT_WATCHLIST = ["SPY", "VOO", "QQQ", "AAPL", "MSFT", "NVDA", "BTC/USD", "ETH/USD"]


def clean_symbol(symbol: str) -> str:
    s = normalize_symbol(symbol)
    if not SYMBOL_RE.match(s):
        raise HTTPException(400, "Símbolo no válido. Ejemplos: AAPL, VOO, BTC/USD")
    return s


@router.get("/quote")
async def quote(symbol: str = Query(...), _: User = Depends(current_user)):
    return await alpaca.snapshot(clean_symbol(symbol))


@router.get("/bars")
async def bars(
    symbol: str = Query(...), days: int = Query(180, ge=5, le=1825), _: User = Depends(current_user)
):
    return await alpaca.bars(clean_symbol(symbol), days)


@router.get("/asset")
async def asset(symbol: str = Query(...), _: User = Depends(current_user)):
    a = await alpaca.asset(clean_symbol(symbol))
    return {
        "symbol": a.get("symbol"),
        "name": a.get("name"),
        "class": a.get("class"),
        "exchange": a.get("exchange"),
        "tradable": a.get("tradable"),
        "fractionable": a.get("fractionable"),
    }


# ---------- Lista de seguimiento guardada en PostgreSQL ----------
@router.get("/watchlist")
def get_watchlist(user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = db.scalars(
        select(WatchlistItem).where(WatchlistItem.user_id == user.id).order_by(WatchlistItem.created_at)
    ).all()
    if not items:
        for s in DEFAULT_WATCHLIST:
            db.add(WatchlistItem(user_id=user.id, symbol=s))
        db.commit()
        return DEFAULT_WATCHLIST
    return [i.symbol for i in items]


@router.post("/watchlist/{symbol:path}")
def add_watch(symbol: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = clean_symbol(symbol)
    exists = db.scalar(
        select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.symbol == s)
    )
    if not exists:
        db.add(WatchlistItem(user_id=user.id, symbol=s))
        db.commit()
    return {"symbol": s}


@router.delete("/watchlist/{symbol:path}")
def remove_watch(symbol: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = clean_symbol(symbol)
    item = db.scalar(
        select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.symbol == s)
    )
    if item:
        db.delete(item)
        db.commit()
    return {"ok": True}
