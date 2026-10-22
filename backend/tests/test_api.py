import pytest
from fastapi import HTTPException

from app.models import OrderLog
from app.risk import check_order
from app.routers.trading import OrderIn

H = {"X-Orion-Client": "web"}


def test_health(client):
    assert client.get("/api/health").json()["ok"] is True


def test_csrf_header_required(client, user):
    r = client.post("/api/auth/login", json={"email": user.email, "password": "clave-segura-123"})
    assert r.status_code == 403


def test_login_and_me(client, user):
    bad = client.post("/api/auth/login", json={"email": user.email, "password": "mala"}, headers=H)
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"email": user.email, "password": "clave-segura-123"}, headers=H)
    assert ok.status_code == 200
    me = client.get("/api/auth/me").json()
    assert me["email"] == user.email
    assert me["environment"] == "paper"


def test_protected_without_session(client):
    assert client.get("/api/trading/account").status_code == 401


def test_max_order_limit(db, user):
    with pytest.raises(HTTPException) as e:
        check_order(db, user.id, "buy", 600, confirmed=True)
    assert "máximo por orden" in e.value.detail


def test_daily_limit(db, user):
    db.add(
        OrderLog(
            user_id=user.id, environment="paper", symbol="VOO", side="buy", order_type="market",
            notional=450, estimated_usd=450, status="filled",
        )
    )
    db.add(
        OrderLog(
            user_id=user.id, environment="paper", symbol="SPY", side="buy", order_type="market",
            notional=450, estimated_usd=450, status="filled",
        )
    )
    db.commit()
    check_order(db, user.id, "buy", 100, confirmed=True)  # 900 + 100 = 1000 → permitido
    with pytest.raises(HTTPException):
        check_order(db, user.id, "buy", 101, confirmed=True)
    check_order(db, user.id, "sell", 400, confirmed=True)  # las ventas no consumen cupo


def test_rejected_orders_do_not_count(db, user):
    db.add(
        OrderLog(
            user_id=user.id, environment="paper", symbol="VOO", side="buy", order_type="market",
            notional=490, estimated_usd=490, status="rejected",
        )
    )
    db.commit()
    check_order(db, user.id, "buy", 490, confirmed=True)


def test_limit_order_requires_price_and_qty():
    with pytest.raises(ValueError):
        OrderIn(symbol="AAPL", side="buy", order_type="limit", amount_mode="qty", amount=1)
    with pytest.raises(ValueError):
        OrderIn(symbol="AAPL", side="buy", order_type="limit", amount_mode="notional", amount=10, limit_price=100)
