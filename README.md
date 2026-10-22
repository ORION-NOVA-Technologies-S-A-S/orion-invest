# Orion Invest

Plataforma web de inversión de **Orion Nova Technologies** para comprar y vender **acciones, ETF y criptomonedas** de EE. UU. a través de la API de [Alpaca](https://alpaca.markets).

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Python 3.12 + FastAPI |
| Base de datos | PostgreSQL 16 |
| Broker | Alpaca (acciones, ETF, cripto) |
| CI/CD | GitHub Actions + GitHub Packages (Docker) |

## Funciones

- Resumen del portafolio: valor total, efectivo, poder de compra, variación del día y gráfica histórica.
- Cotizaciones y gráfica de precios (1M a 5A) para acciones, ETF y cripto (`BTC/USD`, `ETH/USD`…).
- Lista de seguimiento guardada en PostgreSQL.
- Órdenes a mercado (por monto en USD o cantidad, con fracciones) y órdenes límite.
- Posiciones con ganancia/pérdida y órdenes recientes con opción de cancelar.
- Modo **simulado (paper)** y modo **dinero real (live)** con un solo cambio en `.env`.

## Seguridad

- Las claves de Alpaca **solo viven en el servidor**; el navegador nunca las ve.
- Sin registro público: los usuarios se crean por consola.
- Contraseñas con `scrypt`, sesión en cookie `HttpOnly` + `SameSite=Strict`, defensa CSRF por encabezado y bloqueo tras 5 intentos fallidos.
- Límites de riesgo aplicados en el backend: máximo por orden (`MAX_ORDER_USD`), máximo de compras diarias (`MAX_DAILY_USD`) e interruptor general (`TRADING_ENABLED`).
- En modo real, cada orden exige escribir **CONFIRMAR**.
- Cada orden queda registrada en la tabla `order_log` para auditoría.

## Puesta en marcha (Docker, recomendado)

```bash
git clone https://github.com/ORION-NOVA-Technologies-S-A-S/orion-invest.git
cd orion-invest
cp .env.example .env          # llena SECRET_KEY, POSTGRES_PASSWORD y claves de Alpaca
docker compose up -d --build
docker compose exec backend python -m app.create_user tu@correo.com
```

Abre <http://localhost:8080>.

## Desarrollo local (sin Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
# exporta las variables de .env (incluye DATABASE_URL apuntando a tu PostgreSQL)
python -m app.create_user tu@correo.com
uvicorn app.main:app --reload

# Frontend (otra terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Documentación de la API: <http://localhost:8000/api/docs>

## Pasar de simulado a dinero real

1. Abre tu cuenta en Alpaca y completa la verificación de identidad.
2. Prueba primero con las claves **Paper** (`ALPACA_ENV=paper`).
3. Cuando estés listo, genera las claves **Live**, ponlas en `.env` y cambia `ALPACA_ENV=live`.
4. Ajusta `MAX_ORDER_USD` y `MAX_DAILY_USD` a lo que estés dispuesto a mover.
5. Reinicia el backend: `docker compose up -d backend`.

> Invertir implica riesgo de pérdida. Alpaca opera mercados de EE. UU.; los impuestos sobre ganancias y dividendos en el exterior se declaran en Colombia.

## CI/CD

El flujo `.github/workflows/ci-cd.yml` corre en cada push y pull request a `main`:

| Etapa | Qué hace |
|---|---|
| Backend | `ruff` (estilo + reglas de seguridad), `pytest` contra PostgreSQL real, `pip-audit` |
| Frontend | `npm run build` y `npm audit` |
| Secretos | `gitleaks` revisa que no se haya subido ninguna clave |
| Publicar | Si todo pasa en `main`, construye y publica las imágenes Docker en GitHub Packages (`ghcr.io`) |
| Desplegar | Opcional: actualiza tu servidor por SSH |

### Activar el despliegue automático

En GitHub → *Settings → Secrets and variables → Actions*, crea:

- `DEPLOY_HOST`: IP o dominio del servidor
- `DEPLOY_USER`: usuario SSH
- `DEPLOY_SSH_KEY`: llave privada SSH
- `DEPLOY_PATH`: carpeta donde clonaste el repo en el servidor (con su `.env`)

En el servidor, inicia sesión una vez en el registro para poder descargar las imágenes privadas:
`docker login ghcr.io -u TU_USUARIO` (con un token de GitHub con permiso `read:packages`).

Sin esos secretos, el despliegue se omite y el resto del flujo sigue funcionando.

## Estructura

```
backend/
  app/
    main.py            # FastAPI, CORS, CSRF, encabezados de seguridad
    config.py          # variables de entorno
    db.py, models.py   # PostgreSQL (users, watchlist, order_log)
    security.py        # contraseñas, sesión, anti fuerza bruta
    risk.py            # límites por orden y diarios
    broker/alpaca.py   # cliente de Alpaca
    routers/           # auth, market, trading
    create_user.py
  tests/
frontend/
  src/components/      # Dashboard, QuotePanel, OrderForm, Watchlist, Positions, Orders, LineChart
docker-compose.yml
.github/workflows/ci-cd.yml
```

---
© Orion Nova Technologies
