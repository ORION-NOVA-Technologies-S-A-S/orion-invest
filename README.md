# Orion Invest

Plataforma web de inversión de **Orion Nova Technologies** para comprar y vender **acciones, ETF y criptomonedas** de EE. UU. con dinero real a través de [Alpaca](https://alpaca.markets).

**Web:** https://orion-nova-technologies-s-a-s.github.io/orion-invest/

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, publicado en GitHub Pages |
| Backend | Supabase Edge Function `invest` (TypeScript / Deno) |
| Base de datos | PostgreSQL de Supabase, esquema privado `invest` |
| Inicio de sesión | Supabase Auth |
| Broker | Alpaca (acciones, ETF, cripto) |
| CI/CD | GitHub Actions |

## Cómo está protegida

- **Las claves de Alpaca nunca llegan al navegador.** Son secretos de la Edge Function en Supabase.
- **Esquema privado `invest`**, sin exponer en la API pública de Supabase. Solo la función lo lee y escribe, por conexión directa a la base. Está aislado de las tablas del otro sitio del mismo proyecto.
- **Lista de usuarios autorizados** (`invest.allowed_users`): aunque alguien tenga cuenta en el proyecto, no puede operar si no está en la lista.
- **Límites de riesgo en el servidor:** máximo por orden y máximo de compras al día. Por defecto US$50 y US$200.
- **Confirmación escrita:** en modo real, cada orden exige escribir **CONFIRMAR**.
- **Origen restringido (CORS):** la función solo responde a la página oficial y a `localhost` para desarrollo.
- **Auditoría:** cada orden queda en `invest.order_log`, incluidas las rechazadas.

## Configuración (una sola vez)

### 1. Secretos de la función en Supabase

En Supabase → *Edge Functions → Secrets* del proyecto, crea:

| Secreto | Valor |
|---|---|
| `ALPACA_KEY_ID` | Tu Key ID de Alpaca |
| `ALPACA_SECRET_KEY` | Tu Secret Key de Alpaca |
| `ALPACA_ENV` | `paper` (simulado) o `live` (dinero real) |
| `MAX_ORDER_USD` | Opcional. Máximo por orden (por defecto 50) |
| `MAX_DAILY_USD` | Opcional. Máximo de compras al día (por defecto 200) |
| `TRADING_ENABLED` | Opcional. `false` apaga todas las operaciones |

Las claves Paper y Live son distintas en Alpaca: usa las que correspondan al `ALPACA_ENV`.

### 2. Autorizar tu cuenta

Crea tu usuario en Supabase → *Authentication → Users → Add user* (marca *Auto Confirm*). Luego, en el *SQL Editor*:

```sql
insert into invest.allowed_users (user_id, note)
select id, 'Carlos' from auth.users where email = 'TU_CORREO';
```

### 3. Activar GitHub Pages

En GitHub → *Settings → Pages → Build and deployment → Source*, elige **GitHub Actions**.

### 4. (Opcional) Despliegue automático de la función

Crea un token en Supabase → *Account → Access Tokens* y guárdalo en GitHub → *Settings → Secrets and variables → Actions* como `SUPABASE_ACCESS_TOKEN`.

## CI/CD

`.github/workflows/ci-cd.yml` corre en cada push y pull request a `main`:

| Etapa | Qué hace |
|---|---|
| Frontend | Compila React y audita dependencias |
| Edge Function | Revisa tipos con Deno y corre las pruebas de las reglas de riesgo |
| Secretos | `gitleaks` verifica que no se haya subido ninguna clave |
| Publicar web | Si todo pasa en `main`, publica en GitHub Pages |
| Desplegar función | Si existe `SUPABASE_ACCESS_TOKEN`, despliega la función `invest` en Supabase |

## Desarrollo local

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

La web local usa la misma función de Supabase (que permite `localhost:5173`).

## Pasar a dinero real

1. Prueba con claves **Paper** y `ALPACA_ENV=paper`.
2. Confirma con Alpaca que tu cuenta desde Colombia puede operar acciones y ETF (cripto sí aparece habilitado para Colombia).
3. Cambia a las claves **Live** y `ALPACA_ENV=live`.
4. Sube `MAX_ORDER_USD` y `MAX_DAILY_USD` poco a poco.

> Invertir implica riesgo de pérdida. Alpaca opera mercados de EE. UU.; las ganancias y dividendos en el exterior se declaran en Colombia.

## Estructura

```
frontend/                       # React + Vite
  src/components/               # Dashboard, QuotePanel, OrderForm, Watchlist, Positions, Orders, LineChart
supabase/
  functions/invest/             # Edge Function: index.ts, alpaca.ts, risk.ts (+ pruebas)
  migrations/                   # Esquema privado invest
.github/workflows/ci-cd.yml
```

---
© Orion Nova Technologies
