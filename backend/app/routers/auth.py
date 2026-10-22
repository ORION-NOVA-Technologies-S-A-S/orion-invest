from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User
from ..security import (
    COOKIE_NAME,
    check_login_rate,
    clear_login_attempts,
    create_token,
    current_user,
    register_failed_login,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "desconocida"
    check_login_rate(ip)
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if not user or not verify_password(data.password, user.password_hash):
        register_failed_login(ip)
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    clear_login_attempts(ip)
    response.set_cookie(
        COOKIE_NAME,
        create_token(user.id),
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return {"email": user.email}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {
        "email": user.email,
        "environment": settings.alpaca_env,
        "trading_enabled": settings.trading_enabled,
        "max_order_usd": settings.max_order_usd,
        "max_daily_usd": settings.max_daily_usd,
    }
