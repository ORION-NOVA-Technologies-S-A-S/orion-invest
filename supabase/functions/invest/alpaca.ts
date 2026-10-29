// Cliente de Alpaca (acciones, ETF y cripto de EE. UU.). Docs: https://docs.alpaca.markets
import { HttpError, isCrypto } from "./risk.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const DATA_URL = "https://data.alpaca.markets";
const FEED = env("ALPACA_STOCK_FEED", "iex");

// ---- Credenciales: primero los secretos de la función; si no existen, Supabase Vault (cifrado) ----
type Env = "paper" | "live";
interface Creds {
  key: string;
  secret: string;
  env: Env;
}
let vaultLoader: (() => Promise<Record<string, string>>) | null = null;
let cached: { c: Creds; at: number } | null = null;

export function setVaultLoader(fn: () => Promise<Record<string, string>>) {
  vaultLoader = fn;
}

async function creds(): Promise<Creds> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.c;
  let key = env("ALPACA_KEY_ID");
  let secret = env("ALPACA_SECRET_KEY");
  let mode = env("ALPACA_ENV");
  if ((!key || !secret) && vaultLoader) {
    try {
      const v = await vaultLoader();
      key = key || v.alpaca_key_id || "";
      secret = secret || v.alpaca_secret_key || "";
      mode = mode || v.alpaca_env || "";
    } catch (e) {
      console.error("No se pudo leer Vault", e);
    }
  }
  const c: Creds = { key, secret, env: mode.trim().toLowerCase() === "live" ? "live" : "paper" };
  if (key && secret) cached = { c, at: Date.now() };
  return c;
}

export async function alpacaEnv(): Promise<Env> {
  return (await creds()).env;
}

async function call(kind: "trade" | "data", path: string, init: RequestInit = {}, params?: Record<string, string>) {
  const { key, secret, env: mode } = await creds();
  if (!key || !secret) throw new HttpError(503, "Faltan las claves de Alpaca (ALPACA_KEY_ID y ALPACA_SECRET_KEY).");
  const base =
    kind === "data" ? DATA_URL : mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";

  const url = new URL(path, base);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "No se pudo conectar con Alpaca.");
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? text.slice(0, 200);
    throw new HttpError([400, 403, 404, 422].includes(res.status) ? res.status : 502, `Alpaca: ${msg}`);
  }
  return data;
}

const trade = (path: string, init?: RequestInit, params?: Record<string, string>) =>
  call("trade", path, init, params);
const data = (path: string, params?: Record<string, string>) => call("data", path, {}, params);
const enc = encodeURIComponent;

export const alpaca = {
  account: () => trade("/v2/account"),
  positions: () => trade("/v2/positions"),
  history: (period: string) => trade("/v2/account/portfolio/history", {}, { period, timeframe: "1D" }),
  orders: () => trade("/v2/orders", {}, { status: "all", limit: "50", direction: "desc" }),
  submitOrder: (payload: unknown) => trade("/v2/orders", { method: "POST", body: JSON.stringify(payload) }),
  cancelOrder: (id: string) => trade(`/v2/orders/${enc(id)}`, { method: "DELETE" }),
  asset: (symbol: string) => trade(`/v2/assets/${enc(symbol)}`),

  async snapshot(symbol: string) {
    // deno-lint-ignore no-explicit-any
    let snap: any;
    if (isCrypto(symbol)) {
      // deno-lint-ignore no-explicit-any
      const d: any = await data("/v1beta3/crypto/us/snapshots", { symbols: symbol });
      snap = d?.snapshots?.[symbol];
    } else {
      snap = await data(`/v2/stocks/${enc(symbol)}/snapshot`, { feed: FEED });
    }
    if (!snap) throw new HttpError(404, `No hay datos para ${symbol}`);
    const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
    const prev = snap.prevDailyBar?.c ?? null;
    const change = price != null && prev ? price - prev : null;
    return {
      symbol,
      asset_class: isCrypto(symbol) ? "crypto" : "us_equity",
      price,
      prev_close: prev,
      change,
      change_pct: change != null && prev ? (change / prev) * 100 : null,
      day_high: snap.dailyBar?.h ?? null,
      day_low: snap.dailyBar?.l ?? null,
      bid: snap.latestQuote?.bp ?? null,
      ask: snap.latestQuote?.ap ?? null,
    };
  },

  // Precio y variación de muchos símbolos en 1-2 llamadas (acciones/ETF y cripto por separado)
  async snapshots(symbols: string[]) {
    const stocks = symbols.filter((s) => !isCrypto(s));
    const cryptos = symbols.filter(isCrypto);
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any> = {};
    // deno-lint-ignore no-explicit-any
    const read = (s: string, snap: any) => {
      if (!snap) return (out[s] = null);
      const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
      const prev = snap.prevDailyBar?.c ?? null;
      out[s] = { price, change_pct: price != null && prev ? ((price - prev) / prev) * 100 : null };
    };
    const [st, cr] = await Promise.all([
      stocks.length ? data("/v2/stocks/snapshots", { symbols: stocks.join(","), feed: FEED }) : null,
      cryptos.length ? data("/v1beta3/crypto/us/snapshots", { symbols: cryptos.join(",") }) : null,
    ]);
    // deno-lint-ignore no-explicit-any
    stocks.forEach((s) => read(s, (st as any)?.[s]));
    // deno-lint-ignore no-explicit-any
    cryptos.forEach((s) => read(s, (cr as any)?.snapshots?.[s]));
    return out;
  },

  async bars(symbol: string, days: number) {
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) + "T00:00:00Z";
    // deno-lint-ignore no-explicit-any
    let raw: any[] = [];
    if (isCrypto(symbol)) {
      // deno-lint-ignore no-explicit-any
      const d: any = await data("/v1beta3/crypto/us/bars", { symbols: symbol, timeframe: "1Day", start, limit: "1000" });
      raw = d?.bars?.[symbol] ?? [];
    } else {
      // deno-lint-ignore no-explicit-any
      const d: any = await data(`/v2/stocks/${enc(symbol)}/bars`, {
        timeframe: "1Day",
        start,
        limit: "1000",
        adjustment: "all",
        feed: FEED,
      });
      raw = d?.bars ?? [];
    }
    return raw.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  },
};
