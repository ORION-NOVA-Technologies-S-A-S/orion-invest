// Reglas puras (sin red ni base de datos) para poder probarlas en CI.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface RiskConfig {
  tradingEnabled: boolean;
  live: boolean;
  maxOrderUsd: number;
  maxDailyUsd: number;
}

export function checkOrder(
  cfg: RiskConfig,
  side: "buy" | "sell",
  estimatedUsd: number,
  spentToday: number,
  confirmed: boolean,
): void {
  if (!cfg.tradingEnabled) throw new HttpError(403, "Las operaciones están desactivadas (TRADING_ENABLED=false).");
  if (cfg.live && !confirmed) throw new HttpError(400, "Las órdenes con dinero real requieren confirmación explícita.");
  if (!(estimatedUsd > 0)) throw new HttpError(400, "No se pudo estimar el valor de la orden.");
  if (estimatedUsd > cfg.maxOrderUsd) {
    throw new HttpError(
      400,
      `La orden (~US$${estimatedUsd.toFixed(2)}) supera el máximo por orden de US$${cfg.maxOrderUsd.toFixed(2)}.`,
    );
  }
  if (side === "buy" && spentToday + estimatedUsd > cfg.maxDailyUsd) {
    const left = Math.max(cfg.maxDailyUsd - spentToday, 0);
    throw new HttpError(
      400,
      `Superarías el límite diario de compras (US$${cfg.maxDailyUsd.toFixed(2)}). Te quedan US$${left.toFixed(2)} hoy.`,
    );
  }
}

const SYMBOL_RE = /^[A-Z0-9.]{1,10}(\/[A-Z]{3,4})?$/;

export function cleanSymbol(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "Falta el símbolo.");
  let s = raw.trim().toUpperCase().replace("-", "/");
  if (!s.includes("/") && s.endsWith("USD") && s.length > 5) s = s.slice(0, -3) + "/USD";
  if (!SYMBOL_RE.test(s)) throw new HttpError(400, "Símbolo no válido. Ejemplos: AAPL, VOO, BTC/USD");
  return s;
}

export const isCrypto = (symbol: string) => symbol.includes("/");

export interface OrderInput {
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit";
  amount_mode: "notional" | "qty";
  amount: number;
  limit_price: number | null;
  confirm: boolean;
}

export function parseOrder(body: unknown): OrderInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const side = b.side;
  const orderType = b.order_type ?? "market";
  const mode = b.amount_mode ?? "notional";
  const amount = Number(b.amount);
  const limit = b.limit_price == null ? null : Number(b.limit_price);

  if (side !== "buy" && side !== "sell") throw new HttpError(400, "Lado de la orden no válido.");
  if (orderType !== "market" && orderType !== "limit") throw new HttpError(400, "Tipo de orden no válido.");
  if (mode !== "notional" && mode !== "qty") throw new HttpError(400, "Modo de monto no válido.");
  if (!(amount > 0) || !Number.isFinite(amount)) throw new HttpError(400, "El monto debe ser mayor que cero.");
  if (orderType === "limit") {
    if (!(limit && limit > 0)) throw new HttpError(400, "Una orden límite necesita precio límite.");
    if (mode === "notional") throw new HttpError(400, "Las órdenes límite se hacen por cantidad, no por monto en dólares.");
  }
  return {
    symbol: cleanSymbol(b.symbol),
    side,
    order_type: orderType,
    amount_mode: mode,
    amount,
    limit_price: orderType === "limit" ? limit : null,
    confirm: b.confirm === true,
  };
}

export function buildAlpacaOrder(o: OrderInput, clientOrderId: string): Record<string, string> {
  const payload: Record<string, string> = {
    symbol: o.symbol,
    side: o.side,
    type: o.order_type,
    // Cripto opera 24/7 (gtc); acciones fraccionadas por monto solo admiten "day"
    time_in_force: isCrypto(o.symbol) ? "gtc" : "day",
    client_order_id: clientOrderId,
  };
  if (o.amount_mode === "notional") payload.notional = o.amount.toFixed(2);
  else payload.qty = o.amount.toFixed(9).replace(/\.?0+$/, "");
  if (o.order_type === "limit" && o.limit_price) {
    payload.limit_price = o.limit_price >= 1 ? o.limit_price.toFixed(2) : o.limit_price.toFixed(6);
  }
  return payload;
}
