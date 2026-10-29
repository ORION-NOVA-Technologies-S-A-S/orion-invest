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
      const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
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

export async function indexQuotes(raw: string | null): Promise<Record<string, IndexQuote | null>> {
  const symbols = (raw ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > 40) throw new HttpError(400, "Entre 1 y 40 índices.");
  for (const s of symbols) if (!INDEX_RE.test(s)) throw new HttpError(400, `Índice no válido: ${s}`);
  const results = await Promise.all(symbols.map(fetchOne));
  return Object.fromEntries(symbols.map((s, i) => [s, results[i]]));
}
