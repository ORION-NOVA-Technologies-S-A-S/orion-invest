import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildAlpacaOrder, checkOrder, cleanSymbol, HttpError, parseOrder, type RiskConfig } from "./risk.ts";

const cfg: RiskConfig = { tradingEnabled: true, live: true, maxOrderUsd: 50, maxDailyUsd: 200 };

Deno.test("rechaza orden mayor al máximo", () => {
  assertThrows(() => checkOrder(cfg, "buy", 60, 0, true), HttpError, "máximo por orden");
});

Deno.test("dinero real exige confirmación", () => {
  assertThrows(() => checkOrder(cfg, "buy", 10, 0, false), HttpError, "confirmación");
});

Deno.test("límite diario solo cuenta compras", () => {
  checkOrder(cfg, "buy", 50, 150, true); // 200 exacto: permitido
  assertThrows(() => checkOrder(cfg, "buy", 1, 200, true), HttpError, "límite diario");
  checkOrder(cfg, "sell", 40, 200, true);
});

Deno.test("interruptor general", () => {
  assertThrows(() => checkOrder({ ...cfg, tradingEnabled: false }, "buy", 1, 0, true), HttpError, "desactivadas");
});

Deno.test("normaliza símbolos", () => {
  assertEquals(cleanSymbol(" voo "), "VOO");
  assertEquals(cleanSymbol("btcusd"), "BTC/USD");
  assertEquals(cleanSymbol("eth-usd"), "ETH/USD");
  assertThrows(() => cleanSymbol("DROP TABLE"), HttpError);
});

Deno.test("orden límite requiere precio y cantidad", () => {
  assertThrows(() => parseOrder({ symbol: "AAPL", side: "buy", order_type: "limit", amount_mode: "qty", amount: 1 }));
  assertThrows(() =>
    parseOrder({ symbol: "AAPL", side: "buy", order_type: "limit", amount_mode: "notional", amount: 10, limit_price: 9 })
  );
});

Deno.test("arma la orden para Alpaca", () => {
  const stock = buildAlpacaOrder(
    parseOrder({ symbol: "VOO", side: "buy", amount_mode: "notional", amount: 25 }),
    "x",
  );
  assertEquals(stock, { symbol: "VOO", side: "buy", type: "market", time_in_force: "day", client_order_id: "x", notional: "25.00" });
  const btc = buildAlpacaOrder(
    parseOrder({ symbol: "BTC/USD", side: "buy", order_type: "limit", amount_mode: "qty", amount: 0.0005, limit_price: 60000 }),
    "y",
  );
  assertEquals(btc.time_in_force, "gtc");
  assertEquals(btc.qty, "0.0005");
  assertEquals(btc.limit_price, "60000.00");
});
