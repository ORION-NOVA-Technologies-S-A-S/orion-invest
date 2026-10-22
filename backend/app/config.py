"""Configuración leída de variables de entorno (archivo .env).

Las claves del broker SOLO viven en el servidor. Nunca se envían al navegador.
"""
import os


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "si", "sí", "yes"}


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


class Settings:
    # Base de datos PostgreSQL
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://orion:orion@localhost:5432/orion_invest"
    )

    # Seguridad de la sesión
    secret_key: str = os.getenv("SECRET_KEY", "")
    session_hours: int = int(os.getenv("SESSION_HOURS", "12"))
    cookie_secure: bool = _bool("COOKIE_SECURE", False)  # True en producción (HTTPS)

    # Broker Alpaca
    alpaca_key_id: str = os.getenv("ALPACA_KEY_ID", "")
    alpaca_secret_key: str = os.getenv("ALPACA_SECRET_KEY", "")
    # "paper" = dinero simulado, "live" = dinero real
    alpaca_env: str = os.getenv("ALPACA_ENV", "paper").strip().lower()
    alpaca_stock_feed: str = os.getenv("ALPACA_STOCK_FEED", "iex")

    # Controles de riesgo (se aplican en el servidor, no se pueden saltar desde la web)
    trading_enabled: bool = _bool("TRADING_ENABLED", True)
    max_order_usd: float = _float("MAX_ORDER_USD", 500)
    max_daily_usd: float = _float("MAX_DAILY_USD", 1500)

    # Orígenes permitidos para el frontend
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]

    @property
    def is_live(self) -> bool:
        return self.alpaca_env == "live"

    @property
    def trading_base_url(self) -> str:
        return "https://api.alpaca.markets" if self.is_live else "https://paper-api.alpaca.markets"

    data_base_url: str = "https://data.alpaca.markets"


settings = Settings()

if len(settings.secret_key) < 32:
    raise RuntimeError(
        "SECRET_KEY debe tener al menos 32 caracteres. Genera una con: "
        "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )
if settings.alpaca_env not in {"paper", "live"}:
    raise RuntimeError("ALPACA_ENV debe ser 'paper' o 'live'")
