// Cliente de Alpaca (acciones, ETF y cripto de EE. UU.). Docs: https://docs.alpaca.markets
//
// Dos cuentas separadas:
// - "paper" (Demo): dinero simulado. Claves: secretos ALPACA_KEY_ID / ALPACA_SECRET_KEY
//                   o Vault alpaca_key_id / alpaca_secret_key.
// - "live" (Cuenta real): dinero real. Claves: secretos ALPACA_LIVE_KEY_ID / ALPACA_LIVE_SECRET_KEY
//                   o Vault alpaca_live_key_id / alpaca_live_secret_key.
import { HttpError, isCrypto } from "./risk.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const DATA_URL = "https://data.alpaca.markets";
const FEED = env("ALPACA_STOCK_FEED", "iex");

export type Mode = "paper" | "live";
interface Creds {
  key: string;
  secret: string;
}

let vaultLoader: (() => Promise<Record<string, string>>) | null = null;
let vaultCache: { v: Record<string, string>; at: number } | null = null;

export function setVaultLoader(fn: () => Promise<Record<string, string>>) {
  vaultLoader = fn;
}

async function vault(): Promise<Record<string, string>> {
  if (vaultCache && Date.now() - vaultCache.at < 5 * 60_000) return vaultCache.v;
  let v: Record<string, string> = {};
  if (vaultLoader) {
    try {
      v = await vaultLoader();
    } catch (e) {
      console.error("No se pudo leer Vault", e);
      return vaultCache?.v ?? {};
    }
  }
  vaultCache = { v, at: Date.now() };
  return v;
}

async function creds(mode: Mode): Promise<Creds> {
  const v = await vault();
  if (mode === "live") {
    return {
      key: env("ALPACA_LIVE_KEY_ID") || v.alpaca_live_key_id || "",
      secret: env("ALPACA_LIVE_SECRET_KEY") || v.alpaca_live_secret_key || "",
    };
  }
  return {
    key: env("ALPACA_KEY_ID") || v.alpaca_key_id || "",
    secret: env("ALPACA_SECRET_KEY") || v.alpaca_secret_key || "",
  };
}

/** ¿Qué cuentas tienen claves configuradas? */
export async function availableModes(): Promise<Record<Mode, boolean>> {
  const [p, l] = await Promise.all([creds("paper"), creds("live")]);
  return { paper: !!(p.key && p.secret), live: !!(l.key && l.secret) };
}

async function call(
  mode: Mode,
  kind: "trade" | "data",
  path: string,
  init: RequestInit = {},
  params?: Record<string, string>,
) {
  let c = await creds(mode);
  // Los precios (datos de mercado) sirven con las claves de cualquiera de las dos cuentas
  if ((!c.key || !c.secret) && kind === "data") c = await creds(mode === "live" ? "paper" : "live");
  if (!c.key || !c.secret) {
    throw new HttpError(
      503,
      mode === "live"
        ? "La cuenta real aún no está configurada (faltan las claves Live de Alpaca)."
        : "Faltan las claves de la cuenta Demo de Alpaca.",
    );
  }
  const base =
    kind === "data" ? DATA_URL : mode === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";

  const url = new URL(path, base);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "APCA-API-KEY-ID": c.key,
        "APCA-API-SECRET-KEY": c.secret,
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

const enc = encodeURIComponent;

/** Cliente de Alpaca para una de las dos cuentas (Demo o Real). */
export function alpacaFor(mode: Mode) {
  const trade = (path: string, init?: RequestInit, params?: Record<string, string>) =>
    call(mode, "trade", path, init, params);
  const data = (path: string, params?: Record<string, string>) => call(mode, "data", path, {}, params);

  return {
    account: () => trade("/v2/account"),
    positions: () => trade("/v2/positions"),
    history: (period: string) => trade("/v2/account/portfolio/history", {}, { period, timeframe: "1D" }),
    orders: () => trade("/v2/orders", {}, { status: "all", limit: "50", direction: "desc" }),
    submitOrder: (payload: unknown) => trade("/v2/orders", { method: "POST", body: JSON.stringify(payload) }),
    cancelOrder: (id: string) => trade(`/v2/orders/${enc(id)}`, { method: "DELETE" }),
    asset: (symbol: string) => trade(`/v2/assets/${enc(symbol)}`),
    clock: () => trade("/v2/clock"),
    // Vende todas las posiciones y cancela las órdenes abiertas
    closeAll: () => trade("/v2/positions", { method: "DELETE" }, { cancel_orders: "true" }),

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
}
