"""Crea (o actualiza la contraseña de) el usuario que entra a la app.

Uso:  python -m app.create_user tu@correo.com
No hay registro público: solo entran los usuarios que crees con este comando.
"""
import getpass
import sys

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import User
from .security import hash_password


def main() -> None:
    if len(sys.argv) != 2:
        print("Uso: python -m app.create_user tu@correo.com")
        sys.exit(1)
    email = sys.argv[1].strip().lower()
    password = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
    if len(password) < 12:
        print("La contraseña debe tener al menos 12 caracteres.")
        sys.exit(1)
    if password != getpass.getpass("Repite la contraseña: "):
        print("Las contraseñas no coinciden.")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.password_hash = hash_password(password)
            print(f"Contraseña actualizada para {email}")
        else:
            db.add(User(email=email, password_hash=hash_password(password)))
            print(f"Usuario creado: {email}")
        db.commit()


if __name__ == "__main__":
    main()
