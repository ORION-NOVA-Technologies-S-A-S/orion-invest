from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import Base, engine
from .routers import auth, market, trading

app = FastAPI(title="Orion Invest API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-Orion-Client"],
)


@app.middleware("http")
async def security_headers_and_csrf(request: Request, call_next):
    # Defensa CSRF: las peticiones que cambian algo deben traer este encabezado,
    # que un formulario de otro sitio no puede enviar.
    if request.method in {"POST", "DELETE", "PUT", "PATCH"} and request.url.path.startswith("/api/"):
        if request.headers.get("X-Orion-Client") != "web":
            return JSONResponse({"detail": "Solicitud rechazada."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health():
    return {"ok": True, "environment": settings.alpaca_env}


app.include_router(auth.router)
app.include_router(market.router)
app.include_router(trading.router)
