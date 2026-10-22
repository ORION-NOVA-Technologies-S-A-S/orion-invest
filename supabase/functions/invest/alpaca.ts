// Cliente de Alpaca (acciones, ETF y cripto de EE. UU.). Docs: https://docs.alpaca.markets
import { HttpError, isCrypto } from "./risk.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

export const ALPACA_ENV = env("ALPACA_ENV", "paper").trim().toLowerCase() === "live" ? "live" : "paper";
const TRADING_URL = ALPACA_ENV === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
const DATA_URL = "https://data.alpaca.markets";
const FEED = env("ALPACA_STOCK_FEED", "iex");

async function call(base: string, path: string, init: RequestInit = {}, params?: Record<string, string>) {
  const key = env("ALPACA_KEY_ID");
  const secret = env("ALPACA_SECRET_KEY");
  if (!key || !secret) throw new HttpError(503, "Faltan los secretos ALPACA_KEY_ID y ALPACA_SECRET_KEY en Supabase.");

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
  call(TRADING_URL, path, init, params);
const data = (path: string, params?: Record<string, string>) => call(DATA_URL, path, {}, params);
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
