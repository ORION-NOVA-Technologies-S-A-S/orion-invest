"""Controles de riesgo aplicados en el servidor antes de enviar cualquier orden."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import OrderLog

# Estados en los que la orden no consumió cupo
_NOT_COUNTED = ("rejected", "canceled", "error", "expired")


def spent_today(db: Session, user_id: int) -> float:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total = db.scalar(
        select(func.coalesce(func.sum(OrderLog.estimated_usd), 0.0)).where(
            OrderLog.user_id == user_id,
            OrderLog.side == "buy",
            OrderLog.environment == settings.alpaca_env,
            OrderLog.created_at >= start,
            OrderLog.status.not_in(_NOT_COUNTED),
        )
    )
    return float(total or 0)


def check_order(db: Session, user_id: int, side: str, estimated_usd: float, confirmed: bool) -> None:
    if not settings.trading_enabled:
        raise HTTPException(403, "Las operaciones están desactivadas (TRADING_ENABLED=false).")

    if settings.is_live and not confirmed:
        raise HTTPException(400, "Las órdenes con dinero real requieren confirmación explícita.")

    if estimated_usd <= 0:
        raise HTTPException(400, "No se pudo estimar el valor de la orden.")

    if estimated_usd > settings.max_order_usd:
        raise HTTPException(
            400,
            f"La orden (~US${estimated_usd:,.2f}) supera el máximo por orden de US${settings.max_order_usd:,.2f}.",
        )

    if side == "buy":
        used = spent_today(db, user_id)
        if used + estimated_usd > settings.max_daily_usd:
            disponible = max(settings.max_daily_usd - used, 0)
            raise HTTPException(
                400,
                f"Superarías el límite diario de compras (US${settings.max_daily_usd:,.2f}). "
                f"Te quedan US${disponible:,.2f} hoy.",
            )
