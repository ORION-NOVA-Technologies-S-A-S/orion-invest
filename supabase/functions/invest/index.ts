// Edge Function "invest": único punto de acceso de la app web.
// - Verifica la sesión de Supabase y que el usuario esté en invest.allowed_users
// - Guarda las claves de Alpaca como secretos (nunca llegan al navegador)
// - Aplica límites de riesgo y registra cada orden en invest.order_log
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import postgres from "npm:postgres@3.4.5";
import { alpaca, ALPACA_ENV } from "./alpaca.ts";
import { buildAlpacaOrder, checkOrder, cleanSymbol, HttpError, parseOrder, type RiskConfig } from "./risk.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => {
  const v = Number(env(k, String(d)));
  return Number.isFinite(v) && v > 0 ? v : d;
};

const RISK: RiskConfig = {
  tradingEnabled: !["false", "0", "no"].includes(env("TRADING_ENABLED", "true").toLowerCase()),
  live: ALPACA_ENV === "live",
  // Valores conservadores por defecto; súbelos con secretos cuando confíes en la app
  maxOrderUsd: num("MAX_ORDER_USD", 50),
  maxDailyUsd: num("MAX_DAILY_USD", 200),
};

const ALLOWED_ORIGINS = env(
  "ALLOWED_ORIGINS",
  "https://orion-nova-technologies-s-a-s.github.io,http://localhost:5173",
).split(",").map((s) => s.trim()).filter(Boolean);

const DEFAULT_WATCHLIST = ["SPY", "VOO", "QQQ", "AAPL", "MSFT", "NVDA", "BTC/USD", "ETH/USD"];

// Conexión directa al esquema privado (SUPABASE_DB_URL la provee Supabase)
const sql = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 3, idle_timeout: 20 });
const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function authenticate(req: Request): Promise<string> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Inicia sesión.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sesión no válida. Inicia sesión de nuevo.");
  const rows = await sql`select 1 from invest.allowed_users where user_id = ${data.user.id}`;
  if (rows.length === 0) throw new HttpError(403, "Tu cuenta no está autorizada para Orion Invest.");
  return data.user.id;
}

async function spentToday(userId: string): Promise<number> {
  const [row] = await sql`
    select coalesce(sum(estimated_usd), 0)::float8 as total
    from invest.order_log
    where user_id = ${userId}
      and side = 'buy'
      and environment = ${ALPACA_ENV}
      and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      and status not in ('rejected', 'canceled', 'error', 'expired')`;
  return Number(row?.total ?? 0);
}

// deno-lint-ignore no-explicit-any
type Any = any;
const f = (v: unknown) => Number(v ?? 0);

async function route(req: Request, userId: string): Promise<unknown> {
  const url = new URL(req.url);
  // La ruta llega como /invest/<recurso>[/<id>]
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("invest");
  const [resource, ...rest] = parts.slice(i + 1);
  const m = req.method;

  if (resource === "me" && m === "GET") {
    return {
      environment: ALPACA_ENV,
      trading_enabled: RISK.tradingEnabled,
      max_order_usd: RISK.maxOrderUsd,
      max_daily_usd: RISK.maxDailyUsd,
    };
  }

  if (resource === "account" && m === "GET") {
    const a: Any = await alpaca.account();
    const equity = f(a.equity);
    const last = f(a.last_equity);
    return {
      environment: ALPACA_ENV,
      status: a.status,
      crypto_status: a.crypto_status,
      equity,
      cash: f(a.cash),
      buying_power: f(a.buying_power),
      day_change: equity - last,
      day_change_pct: last ? ((equity - last) / last) * 100 : 0,
      trading_blocked: a.trading_blocked,
      spent_today: await spentToday(userId),
      max_daily_usd: RISK.maxDailyUsd,
      max_order_usd: RISK.maxOrderUsd,
    };
  }

  if (resource === "positions" && m === "GET") {
    const list: Any[] = (await alpaca.positions()) as Any[];
    return list
      .map((p) => ({
        symbol: p.symbol,
        asset_class: p.asset_class,
        qty: f(p.qty),
        avg_entry_price: f(p.avg_entry_price),
        current_price: f(p.current_price),
        market_value: f(p.market_value),
        unrealized_pl: f(p.unrealized_pl),
        unrealized_plpc: f(p.unrealized_plpc) * 100,
        change_today_pct: f(p.change_today) * 100,
      }))
      .sort((a, b) => b.market_value - a.market_value);
  }

  if (resource === "history" && m === "GET") {
    const period = url.searchParams.get("period") ?? "1M";
    if (!["1W", "1M", "3M", "1A"].includes(period)) throw new HttpError(400, "Periodo no válido.");
    const h: Any = await alpaca.history(period);
    const ts: number[] = h?.timestamp ?? [];
    const eq: (number | null)[] = h?.equity ?? [];
    return ts.map((t, k) => ({ t, equity: eq[k] })).filter((x) => x.equity != null);
  }

  if (resource === "orders" && m === "GET") {
    const list: Any[] = (await alpaca.orders()) as Any[];
    return list.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      qty: o.qty,
      notional: o.notional,
      filled_qty: o.filled_qty,
      filled_avg_price: o.filled_avg_price,
      limit_price: o.limit_price,
      status: o.status,
      submitted_at: o.submitted_at,
    }));
  }

  if (resource === "orders" && m === "POST") {
    const o = parseOrder(await req.json().catch(() => null));
    const ref = o.order_type === "limit" ? o.limit_price : (await alpaca.snapshot(o.symbol)).price;
    if (!ref) throw new HttpError(400, "No hay precio disponible para estimar la orden.");
    const estimated = o.amount_mode === "notional" ? o.amount : o.amount * ref;

    checkOrder(RISK, o.side, estimated, await spentToday(userId), o.confirm);

    const payload = buildAlpacaOrder(o, `orion-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
    const [log] = await sql`
      insert into invest.order_log
        (user_id, environment, symbol, side, order_type, qty, notional, limit_price, estimated_usd, status)
      values
        (${userId}, ${ALPACA_ENV}, ${o.symbol}, ${o.side}, ${o.order_type},
         ${o.amount_mode === "qty" ? o.amount : null}, ${o.amount_mode === "notional" ? o.amount : null},
         ${o.limit_price}, ${Math.round(estimated * 100) / 100}, 'pending')
      returning id`;

    try {
      const res: Any = await alpaca.submitOrder(payload);
      await sql`update invest.order_log set broker_order_id = ${res.id}, status = ${res.status ?? "submitted"}
                where id = ${log.id}`;
      return { id: res.id, status: res.status, estimated_usd: Math.round(estimated * 100) / 100 };
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 500) : "error";
      await sql`update invest.order_log set status = 'error', error = ${msg} where id = ${log.id}`;
      throw e;
    }
  }

  if (resource === "orders" && m === "DELETE" && rest[0]) {
    const id = rest[0];
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Id de orden no válido.");
    await alpaca.cancelOrder(id);
    await sql`update invest.order_log set status = 'canceled'
              where broker_order_id = ${id} and user_id = ${userId}`;
    return { ok: true };
  }

  if (resource === "quote" && m === "GET") {
    return await alpaca.snapshot(cleanSymbol(url.searchParams.get("symbol")));
  }

  if (resource === "bars" && m === "GET") {
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 180) || 180, 5), 1825);
    return await alpaca.bars(cleanSymbol(url.searchParams.get("symbol")), days);
  }

  if (resource === "asset" && m === "GET") {
    const a: Any = await alpaca.asset(cleanSymbol(url.searchParams.get("symbol")));
    return {
      symbol: a.symbol,
      name: a.name,
      class: a.class,
      exchange: a.exchange,
      tradable: a.tradable,
      fractionable: a.fractionable,
    };
  }

  if (resource === "watchlist") {
    if (m === "GET") {
      const rows = await sql`select symbol from invest.watchlist where user_id = ${userId} order by created_at`;
      if (rows.length === 0) {
        for (const s of DEFAULT_WATCHLIST) {
          await sql`insert into invest.watchlist (user_id, symbol) values (${userId}, ${s}) on conflict do nothing`;
        }
        return DEFAULT_WATCHLIST;
      }
      return rows.map((r) => r.symbol);
    }
    const symbol = cleanSymbol(url.searchParams.get("symbol"));
    if (m === "POST") {
      await sql`insert into invest.watchlist (user_id, symbol) values (${userId}, ${symbol}) on conflict do nothing`;
      return { symbol };
    }
    if (m === "DELETE") {
      await sql`delete from invest.watchlist where user_id = ${userId} and symbol = ${symbol}`;
      return { ok: true };
    }
  }

  if (resource === "fx" && m === "GET") return await usdCop();

  throw new HttpError(404, "Ruta no encontrada.");
}

// Tasa USD/COP de referencia (no requiere claves). Se guarda 1 hora en memoria.
let fxCache: { rate: number; updated: string; at: number } | null = null;

async function usdCop() {
  if (!fxCache || Date.now() - fxCache.at > 3600_000) {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
      const d: Any = await r.json();
      const rate = Number(d?.rates?.COP);
      if (!(rate > 0)) throw new Error("tasa inválida");
      fxCache = { rate, updated: d?.time_last_update_utc ?? new Date().toISOString(), at: Date.now() };
    } catch {
      if (!fxCache) throw new HttpError(502, "No se pudo obtener la tasa USD/COP.");
    }
  }
  const c = fxCache!;
  return { usd_cop: c.rate, updated: c.updated, source: "open.er-api.com" };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ detail: "Origen no permitido." }, 403, origin);

  try {
    const userId = await authenticate(req);
    return json(await route(req, userId), 200, origin);
  } catch (e) {
    if (e instanceof HttpError) return json({ detail: e.message }, e.status, origin);
    console.error(e);
    return json({ detail: "Error interno." }, 500, origin);
  }
});
