import os

# Variables de prueba ANTES de importar la app
os.environ.setdefault("SECRET_KEY", "x" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://orion:orion@localhost:5432/orion_test")
os.environ.setdefault("ALPACA_ENV", "paper")
os.environ.setdefault("MAX_ORDER_USD", "500")
os.environ.setdefault("MAX_DAILY_USD", "1000")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def user(db):
    u = User(email="carlos@orion.test", password_hash=hash_password("clave-segura-123"))
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c
