import { assert, assertEquals } from "jsr:@std/assert@1";
import { describe, partsAt, rsiAt, type Series, signalsToday, train } from "./brain.ts";
import { reply } from "./chat.ts";

// Mercado sintético: después de caídas fuertes tiende a rebotar
function gen(seed: number, n = 520): Series {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const c = [100];
  for (let i = 1; i < n; i++) {
    const p = c.slice(-15);
    const drift = p[p.length - 1] / p[0] - 1 < -0.08 ? 0.006 : 0.0004;
    c.push(c[i - 1] * Math.exp(drift + (r() - 0.5) * 0.04));
  }
  const dates = c.map((_, i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString());
  return { symbol: seed === 7 ? "VOO" : `T${seed}`, kind: "accion", dates, closes: c };
}
const series = Array.from({ length: 30 }, (_, k) => gen(k + 7));

Deno.test("RSI entre 0 y 100", () => {
  const v = rsiAt(series[0].closes, 300);
  assert(v >= 0 && v <= 100);
});

Deno.test("no usa datos del futuro para describir la situación", () => {
  const c = series[0].closes;
  const a = partsAt(c, 300, "accion", 0.2);
  const b = partsAt([...c.slice(0, 301), ...c.slice(301).map((x) => x * 5)], 300, "accion", 0.2);
  assertEquals(a, b);
});

Deno.test("NOVA mejora con la práctica (prueba y error)", () => {
  const b = train(series);
  assertEquals(b.curva.length, 4);
  assert(b.curva[3].acierto_pct > b.curva[0].acierto_pct, "el acierto debe subir de la primera a la última vuelta");
  assert(b.examen.muestras > 0);
});

Deno.test("señales de hoy y explicación", () => {
  const b = train(series);
  const s = signalsToday([series[0]], b);
  assertEquals(s.length, 1);
  assert(["comprar", "esperar", "aprendiendo"].includes(s[0].señal));
  assert(describe(s[0].parts).length > 20);
});

Deno.test("NOVA responde por intención", () => {
  const b = train(series);
  const sig = signalsToday([series[0]], b);
  const ctx = { name: "", mode: "paper" as const, fx: 4000, account: { equity: 1000, cash: 1000, buying_power: 1000 }, positions: [], profile: null, record: { total: 0, aciertos: 0, pendientes: 0 } };
  assert(reply("¿Cómo aprendiste?", b, sig, ctx).includes("prueba y error"));
  assert(reply("analiza mi portafolio", b, sig, ctx).includes("efectivo"));
  assert(reply("qué me recomiendas", b, sig, ctx).includes("perfil"));
  assert(reply("Explícame VOO", b, sig, ctx).includes("[[VOO]]"));
});
