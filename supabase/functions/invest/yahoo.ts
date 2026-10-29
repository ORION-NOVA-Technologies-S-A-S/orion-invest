// Índices bursátiles del mundo (solo para mostrar: no se pueden comprar).
// Fuente: endpoint público de gráficas de Yahoo Finance. Se guarda 5 minutos en memoria.
import { HttpError } from "./risk.ts";

const INDEX_RE = /^\^?[A-Z0-9.=-]{1,20}$/;
const cache = new Map<string, { at: number; data: IndexQuote | null }>();
const TTL = 5 * 60_000;

export interface IndexQuote {
  symbol: string;
  price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  currency: string | null;
  open: boolean | null;
}

async function fetchOne(symbol: string): Promise<IndexQuote | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data: IndexQuote | null = null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (OrionInvest)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (meta) {
      const price = Number(meta.regularMarketPrice);
      // Cierre del día anterior = penúltima barra diaria (chartPreviousClose es el cierre de hace 5 días)
      const closes = ((j.chart.result[0].indicators?.quote?.[0]?.close ?? []) as (number | null)[]).filter(
        (c): c is number => c != null,
      );
      const prev = Number(closes.length >= 2 ? closes[closes.length - 2] : meta.previousClose ?? meta.chartPreviousClose);
      const reg = meta.currentTradingPeriod?.regular;
      const now = Date.now() / 1000;
      data = {
        symbol,
        price: Number.isFinite(price) ? price : null,
        prev_close: Number.isFinite(prev) ? prev : null,
        change_pct: Number.isFinite(price) && prev > 0 ? ((price - prev) / prev) * 100 : null,
        currency: meta.currency ?? null,
        open: reg?.start && reg?.end ? now >= reg.start && now <= reg.end : null,
      };
    }
  } catch {
    data = hit?.data ?? null; // si falla, devolvemos lo último conocido
  }
  cache.set(symbol, { at: Date.now(), data });
  return data;
}

// ---- Respaldo para ver precios cuando Alpaca no está configurado (solo para mostrar) ----
// Alpaca usa "BRK.B" y "BTC/USD"; Yahoo usa "BRK-B" y "BTC-USD".
const toYahoo = (s: string) => s.replace("/", "-").replace(".", "-");

export async function yahooSnapshots(symbols: string[]) {
  const res = await Promise.all(symbols.map((s) => fetchOne(toYahoo(s))));
  return Object.fromEntries(
    symbols.map((s, i) => [s, res[i] ? { price: res[i]!.price, change_pct: res[i]!.change_pct, source: "yahoo" } : null]),
  );
}

export async function yahooSnapshot(symbol: string) {
  const q = await fetchOne(toYahoo(symbol));
  if (!q?.price) throw new HttpError(404, `No hay datos para ${symbol}`);
  const change = q.prev_close ? q.price - q.prev_close : null;
  return {
    symbol,
    asset_class: symbol.includes("/") ? "crypto" : "us_equity",
    price: q.price,
    prev_close: q.prev_close,
    change,
    change_pct: q.change_pct,
    day_high: null,
    day_low: null,
    bid: null,
    ask: null,
    source: "yahoo",
  };
}

export async function yahooBars(symbol: string, days: number, live = false) {
  const range = live
    ? "1d"
    : days <= 31
      ? "1mo"
      : days <= 92
        ? "3mo"
        : days <= 183
          ? "6mo"
          : days <= 366
            ? "1y"
            : "5y";
  const interval = live ? "5m" : "1d";
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahoo(symbol))}?range=${range}&interval=${interval}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (OrionInvest)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const close: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    return ts
      .map((t, i) => ({ t: new Date(t * 1000).toISOString(), o: null, h: null, l: null, c: close[i], v: null }))
      .filter((b) => b.c != null);
  } catch {
    return [];
  }
}

export async function indexQuotes(raw: string | null): Promise<Record<string, IndexQuote | null>> {
  const symbols = (raw ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > 40) throw new HttpError(400, "Entre 1 y 40 índices.");
  for (const s of symbols) if (!INDEX_RE.test(s)) throw new HttpError(400, `Índice no válido: ${s}`);
  const results = await Promise.all(symbols.map(fetchOne));
  return Object.fromEntries(symbols.map((s, i) => [s, results[i]]));
}
