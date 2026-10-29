// Edge Function "invest": único punto de acceso de la app web.
// - Verifica la sesión de Supabase y que el usuario esté en invest.allowed_users
// - Guarda las claves de Alpaca como secretos (nunca llegan al navegador)
// - Aplica límites de riesgo y registra cada orden en invest.order_log
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import postgres from "npm:postgres@3.4.5";
import { alpacaFor, availableModes, type Mode, setVaultLoader } from "./alpaca.ts";
import { type Brain, HORIZON, type Series, type Signal, signalsToday, train, UNIVERSE } from "./brain.ts";
import { brainSummary, type ChatContext, reply } from "./chat.ts";
import { buildAlpacaOrder, checkOrder, cleanSymbol, HttpError, parseOrder, type RiskConfig } from "./risk.ts";
import { indexQuotes, yahooBars, yahooSnapshot, yahooSnapshots } from "./yahoo.ts";

// Si Alpaca no tiene claves (503), los precios se muestran desde Yahoo. Comprar sigue requiriendo Alpaca.
async function withFallback(primary: () => Promise<unknown>, fallback: () => Promise<unknown>): Promise<unknown> {
  try {
    return await primary();
  } catch (e) {
    if (e instanceof HttpError && e.status === 503) return await fallback();
    throw e;
  }
}

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => {
  const v = Number(env(k, String(d)));
  return Number.isFinite(v) && v > 0 ? v : d;
};

const RISK: RiskConfig = {
  tradingEnabled: !["false", "0", "no"].includes(env("TRADING_ENABLED", "true").toLowerCase()),
  live: false, // se ajusta en cada petición según paper/live
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
// Claves de Alpaca guardadas cifradas en Supabase Vault (respaldo si no hay secretos de la función)
setVaultLoader(async () => {
  const rows = await sql`select name, decrypted_secret from vault.decrypted_secrets
                         where name in ('alpaca_key_id', 'alpaca_secret_key', 'alpaca_live_key_id', 'alpaca_live_secret_key')`;
  return Object.fromEntries(rows.map((r) => [r.name, r.decrypted_secret ?? ""]));
});

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-orion-mode",
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

async function spentToday(userId: string, mode: string): Promise<number> {
  const [row] = await sql`
    select coalesce(sum(estimated_usd), 0)::float8 as total
    from invest.order_log
    where user_id = ${userId}
      and side = 'buy'
      and environment = ${mode}
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
  // Cuenta elegida en la app: "paper" (Demo) o "live" (Cuenta real)
  const ENV: Mode = req.headers.get("x-orion-mode") === "live" ? "live" : "paper";
  const alpaca = alpacaFor(ENV);
  const risk: RiskConfig = { ...RISK, live: ENV === "live" };

  if (resource === "me" && m === "GET") {
    return {
      environment: ENV,
      modes: await availableModes(),
      trading_enabled: risk.tradingEnabled,
      max_order_usd: risk.maxOrderUsd,
      max_daily_usd: risk.maxDailyUsd,
    };
  }

  if (resource === "account" && m === "GET") {
    const a: Any = await alpaca.account();
    const equity = f(a.equity);
    const last = f(a.last_equity);
    return {
      environment: ENV,
      status: a.status,
      crypto_status: a.crypto_status,
      equity,
      cash: f(a.cash),
      buying_power: f(a.buying_power),
      day_change: equity - last,
      day_change_pct: last ? ((equity - last) / last) * 100 : 0,
      trading_blocked: a.trading_blocked,
      spent_today: await spentToday(userId, ENV),
      max_daily_usd: risk.maxDailyUsd,
      max_order_usd: risk.maxOrderUsd,
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
    if (!["1D", "1W", "1M", "3M", "1A"].includes(period)) throw new HttpError(400, "Periodo no válido.");
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
      filled_at: o.filled_at,
    }));
  }

  if (resource === "orders" && m === "POST") {
    const o = parseOrder(await req.json().catch(() => null));
    const ref = o.order_type === "limit" ? o.limit_price : (await alpaca.snapshot(o.symbol)).price;
    if (!ref) throw new HttpError(400, "No hay precio disponible para estimar la orden.");
    const estimated = o.amount_mode === "notional" ? o.amount : o.amount * ref;

    checkOrder(risk, o.side, estimated, await spentToday(userId, ENV), o.confirm);

    const payload = buildAlpacaOrder(o, `orion-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
    const [log] = await sql`
      insert into invest.order_log
        (user_id, environment, symbol, side, order_type, qty, notional, limit_price, estimated_usd, status)
      values
        (${userId}, ${ENV}, ${o.symbol}, ${o.side}, ${o.order_type},
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
    const s = cleanSymbol(url.searchParams.get("symbol"));
    return await withFallback(() => alpaca.snapshot(s), () => yahooSnapshot(s));
  }

  if (resource === "bars" && m === "GET") {
    const s = cleanSymbol(url.searchParams.get("symbol"));
    if (url.searchParams.get("live") === "1") {
      return await withFallback(() => alpaca.intraday(s), () => yahooBars(s, 1, true));
    }
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 180) || 180, 5), 1825);
    return await withFallback(() => alpaca.bars(s, days), () => yahooBars(s, days));
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

  // Horario de la bolsa de EE. UU. (para avisar cuándo se ejecutan las órdenes pendientes)
  if (resource === "clock" && m === "GET") {
    const c: Any = await alpaca.clock();
    return { is_open: !!c?.is_open, next_open: c?.next_open ?? null, next_close: c?.next_close ?? null };
  }

  // Reiniciar la cuenta Demo: vende todo y cancela órdenes. Nunca disponible en la cuenta real.
  if (resource === "demo-reset" && m === "POST") {
    if (ENV !== "paper") throw new HttpError(403, "Esta opción solo existe en la cuenta Demo.");
    await alpaca.closeAll();
    return { ok: true };
  }

  if (resource === "indices" && m === "GET") return await indexQuotes(url.searchParams.get("symbols"));

  // Varias cotizaciones de Alpaca en una sola llamada (para el menú Mercados)
  if (resource === "quotes" && m === "GET") {
    const list = (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
    if (list.length === 0 || list.length > 40) throw new HttpError(400, "Entre 1 y 40 símbolos.");
    const symbols = list.map(cleanSymbol);
    return await withFallback(() => alpaca.snapshots(symbols), () => yahooSnapshots(symbols));
  }

  // ---------------- NOVA: asesora de inversión con IA ----------------
  if (resource === "nova" && rest[0] === "profile") {
    if (m === "GET") {
      const [p] = await sql`select goal, horizon, risk, monthly_cop, notes from invest.nova_profile where user_id = ${userId}`;
      return p ?? null;
    }
    if (m === "POST") {
      const b: Any = (await req.json().catch(() => null)) ?? {};
      const pick = (v: unknown, ok: string[]) => (ok.includes(String(v)) ? String(v) : null);
      const goal = pick(b.goal, ["dividendos", "crecimiento", "equilibrio", "preservar"]);
      const horizon = pick(b.horizon, ["corto", "medio", "largo"]);
      const riskLevel = pick(b.risk, ["bajo", "medio", "alto"]);
      const monthly = Number(b.monthly_cop) >= 0 ? Math.round(Number(b.monthly_cop)) : null;
      const notes = typeof b.notes === "string" ? b.notes.slice(0, 1000) : null;
      await sql`
        insert into invest.nova_profile (user_id, goal, horizon, risk, monthly_cop, notes, updated_at)
        values (${userId}, ${goal}, ${horizon}, ${riskLevel}, ${monthly}, ${notes}, now())
        on conflict (user_id) do update set goal = excluded.goal, horizon = excluded.horizon, risk = excluded.risk,
          monthly_cop = excluded.monthly_cop, notes = excluded.notes, updated_at = now()`;
      return { ok: true };
    }
  }

  // Cerebro de NOVA: lo que aprendió (se reentrena solo si tiene más de 20 horas)
  if (resource === "nova" && rest[0] === "brain" && m === "GET") {
    const { brain, signals } = await ensureBrain(alpaca, false);
    return brainSummary(brain, signals, { profile: await novaProfile(userId), record: await novaRecord() });
  }

  // Entrenar a NOVA ahora (máximo una vez cada 10 minutos)
  if (resource === "nova" && rest[0] === "train" && m === "POST") {
    const [row] = await sql`select trained_at from invest.nova_brain where id = 'mercado'`;
    if (row && Date.now() - new Date(row.trained_at).getTime() < 10 * 60_000) {
      throw new HttpError(429, "NOVA acaba de estudiar el mercado. Vuelve a entrenarla en unos minutos.");
    }
    const { brain, signals } = await ensureBrain(alpaca, true);
    return brainSummary(brain, signals, { profile: await novaProfile(userId), record: await novaRecord() });
  }

  // Conversar con NOVA (sin IA de pago: usa lo que aprendió + tu portafolio + tu perfil)
  if (resource === "nova" && !rest[0] && m === "POST") {
    const body: Any = (await req.json().catch(() => null)) ?? {};
    const message = typeof body.message === "string" ? body.message : "";
    const limit = num("NOVA_DAILY_LIMIT", 300);
    const [u] = await sql`
      insert into invest.nova_usage (user_id, day, count) values (${userId}, (now() at time zone 'America/Bogota')::date, 1)
      on conflict (user_id, day) do update set count = invest.nova_usage.count + 1
      returning count`;
    if (u.count > limit) throw new HttpError(429, `Llegaste al límite de ${limit} mensajes con NOVA por hoy.`);

    const safe = async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };
    const [{ brain, signals }, acct, pos, profile, record, fx] = await Promise.all([
      ensureBrain(alpaca, false),
      safe(() => alpaca.account() as Promise<Any>),
      safe(() => alpaca.positions() as Promise<Any[]>),
      novaProfile(userId),
      novaRecord(),
      safe(() => usdCop()),
    ]);
    const ctx: ChatContext = {
      name: "",
      mode: ENV,
      fx: fx?.usd_cop ?? null,
      account: acct ? { equity: f(acct.equity), cash: f(acct.cash), buying_power: f(acct.buying_power) } : null,
      positions: (pos ?? []).map((p: Any) => ({
        symbol: p.asset_class === "crypto" ? String(p.symbol).replace(/USD$/, "/USD") : p.symbol,
        asset_class: p.asset_class,
        market_value: f(p.market_value),
        unrealized_pl: f(p.unrealized_pl),
        unrealized_plpc: f(p.unrealized_plpc) * 100,
      })),
      profile,
      record,
    };
    return { reply: reply(message, brain, signals, ctx) };
  }

  throw new HttpError(404, "Ruta no encontrada.");
}

// ---------------- Memoria y entrenamiento de NOVA ----------------
type AlpacaClient = ReturnType<typeof alpacaFor>;

async function novaProfile(userId: string) {
  const [p] = await sql`select goal, horizon, risk, monthly_cop, notes from invest.nova_profile where user_id = ${userId}`;
  return p ? { ...p, monthly_cop: p.monthly_cop == null ? undefined : Number(p.monthly_cop) } : null;
}

async function novaRecord() {
  const [r] = await sql`
    select count(*) filter (where resolved_at is not null)::int as total,
           count(*) filter (where correct)::int as aciertos,
           count(*) filter (where resolved_at is null)::int as pendientes
    from invest.nova_predictions`;
  return { total: r?.total ?? 0, aciertos: r?.aciertos ?? 0, pendientes: r?.pendientes ?? 0 };
}

// Historia diaria (unos 3 años) de cada activo con el que NOVA practica
async function loadSeries(alpaca: AlpacaClient): Promise<Series[]> {
  const out: Series[] = [];
  const queue = [...UNIVERSE];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift()!;
      try {
        // Alpaca entrega máximo 1000 barras: cripto (365 días/año) pide menos días para no perder lo reciente
        const days = a.kind === "cripto" ? 950 : 1100;
        const bars = (await withFallback(() => alpaca.bars(a.symbol, days), () => yahooBars(a.symbol, days))) as Any[];
        const clean = bars.filter((b) => Number(b.c) > 0);
        if (clean.length >= 230) {
          out.push({ symbol: a.symbol, kind: a.kind, dates: clean.map((b) => String(b.t)), closes: clean.map((b) => Number(b.c)) });
        }
      } catch (e) {
        console.error("NOVA no pudo leer", a.symbol, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

const STALE_MS = 20 * 3600_000;

async function ensureBrain(alpaca: AlpacaClient, force: boolean): Promise<{ brain: Brain; signals: Signal[] }> {
  const [row] = await sql`select trained_at, data from invest.nova_brain where id = 'mercado'`;
  if (row && !force && Date.now() - new Date(row.trained_at).getTime() < STALE_MS) {
    return row.data as { brain: Brain; signals: Signal[] };
  }
  const series = await loadSeries(alpaca);
  if (series.length < 5) {
    if (row) return row.data as { brain: Brain; signals: Signal[] }; // sin datos nuevos: usa lo último aprendido
    throw new HttpError(503, "NOVA no pudo leer suficiente historia del mercado. Intenta en unos minutos.");
  }
  const brain = train(series);
  const signals = signalsToday(series, brain);

  // Prueba y error en vivo: revisa las predicciones que ya cumplieron su plazo…
  const due = await sql`select id, symbol, price from invest.nova_predictions where resolved_at is null and due_on <= current_date`;
  for (const d of due) {
    const now = signals.find((s) => s.symbol === d.symbol)?.price;
    if (!now) continue;
    const outcome = (now / Number(d.price) - 1) * 100;
    await sql`update invest.nova_predictions
              set outcome_pct = ${Math.round(outcome * 100) / 100}, correct = ${outcome > 0}, resolved_at = now()
              where id = ${d.id}`;
  }
  // …y anota las de hoy (las situaciones que cree favorables)
  for (const s of signals.filter((x) => x.señal === "comprar")) {
    await sql`insert into invest.nova_predictions (symbol, made_on, price, state, expected_pct, due_on)
              values (${s.symbol}, current_date, ${s.price}, ${s.state}, ${s.esperado_pct}, current_date + ${Math.round(HORIZON * 1.45)}::int)
              on conflict (symbol, made_on) do nothing`;
  }

  const data = { brain, signals };
  await sql`insert into invest.nova_brain (id, trained_at, data) values ('mercado', now(), ${sql.json(data as Any)})
            on conflict (id) do update set trained_at = now(), data = excluded.data`;
  return data;
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
