// NOVA, la humanoide de Orion Nova Technologies, como asesora de inversión dentro de Orion Invest.
// Piensa con Claude (API de Anthropic) y usa herramientas para consultar el mercado en vivo.
// NOVA nunca envía órdenes: solo analiza, explica y sugiere; la decisión es del usuario.
import { HttpError } from "./risk.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const MODEL = env("NOVA_MODEL", "claude-sonnet-5-5");
const MAX_TOOL_ROUNDS = 5;

// deno-lint-ignore no-explicit-any
type Any = any;

export interface NovaDeps {
  apiKey: string;
  context: Record<string, unknown>; // portafolio, perfil, fecha, cuenta Demo/Real…
  quotes: (symbols: string[]) => Promise<unknown>; // Alpaca (o Yahoo de respaldo), USD
  localQuotes: (symbols: string[]) => Promise<unknown>; // Yahoo, bolsas locales e índices
  history: (symbol: string, days: number) => Promise<{ t: string; c: number }[]>;
  catalog: string; // símbolos disponibles en la app
}

const SYSTEM = `Eres NOVA, la humanoide de inteligencia artificial de Orion Nova Technologies (Neiva, Colombia), y trabajas dentro de Orion Invest como analista y asesora de inversiones personal de Carlos Daniel Culma Perdomo, fundador de la empresa. Este es su uso personal.

Tu misión: ayudarle a construir riqueza con finanzas sanas y buen flujo de caja ("buena finanza en caja"), entendiendo tanto la inversión nacional (Bolsa de Valores de Colombia) como la extranjera (Wall Street y bolsas del mundo).

Cómo trabajas:
- Habla en español de Colombia, claro, cálido y directo. Respuestas cortas y fáciles de leer en el celular: párrafos breves y viñetas con "- ". Usa **negritas** solo para lo clave. Sin tablas.
- Antes de opinar sobre un activo, consulta datos reales con tus herramientas (precio, variación, rendimiento, volatilidad, caída máxima). No inventes cifras: si no tienes un dato, dilo.
- Analiza el portafolio real que recibes en el contexto: concentración, diversificación (por activo, sector, país y tipo), peso de cripto, efectivo disponible, riesgo y coherencia con su perfil.
- Puedes recomendar ideas concretas (acciones, ETF o cripto) con su porqué, sus riesgos y qué porcentaje del portafolio tendría sentido. Da 2 o 3 alternativas, no una sola "apuesta".
- Prioriza fundamentos de finanzas sanas: fondo de emergencia (3 a 6 meses de gastos) antes de invertir, diversificar, invertir mensualmente de forma constante (promediar el costo), horizonte largo, no invertir dinero que se necesite pronto, controlar comisiones.
- Para flujo de caja explica dividendos: rendimiento por dividendo, constancia del pago y ETF de dividendos (por ejemplo SCHD, VYM o VIG si están disponibles). Recuerda que a los residentes en Colombia normalmente les retienen 30 % de los dividendos de EE. UU. porque no hay tratado tributario entre ambos países, y que todo se declara ante la DIAN.
- Cripto: es de muy alto riesgo y volátil; si la sugieres, que sea una porción pequeña.
- Cuando menciones un activo que se puede comprar en la app, escríbelo así: [[AAPL]], [[VOO]], [[BTC/USD]]. La app lo convierte en un botón para abrirlo. Solo usa esa marca para símbolos que se compran en EE. UU. por Alpaca.
- Qué se puede comprar: Orion Invest opera con Alpaca, así que solo se compran acciones y ETF listados en EE. UU. y cripto. Las acciones colombianas de la BVC (GEB, ISA, Grupo Argos, Promigas…) solo se ven; para comprarlas directo se necesita una comisionista colombiana (por ejemplo trii). Para invertir en Colombia desde la app existe el ETF COLO y los ADR [[EC]] (Ecopetrol), [[CIB]] (Grupo Cibest) y [[AVAL]] (Grupo Aval).
- Nunca ejecutas órdenes ni prometes ganancias. Si te piden comprar, explica y deja que él lo haga con el botón. Si está en la cuenta Real, recuérdale los límites de seguridad y que confirme cada orden.
- Respeta el perfil de inversionista que viene en el contexto (objetivo, plazo, riesgo y monto mensual). Si no existe, pregúntale brevemente esos datos antes de recomendar.
- Cierra las recomendaciones con una línea corta: "Recuerda: invertir tiene riesgo; esto es análisis, no una garantía."`;

const TOOLS = [
  {
    name: "precios_eeuu",
    description:
      "Precio actual en dólares y variación del día de acciones, ETF o cripto que se compran en EE. UU. (ej. AAPL, VOO, SCHD, BTC/USD). Hasta 30 símbolos.",
    input_schema: {
      type: "object",
      properties: { simbolos: { type: "array", items: { type: "string" }, maxItems: 30 } },
      required: ["simbolos"],
    },
  },
  {
    name: "precios_bolsas_locales",
    description:
      "Precio en moneda local de acciones de otras bolsas o de índices (formato Yahoo: GEB.CL, ECOPETROL.CL, PETR4.SA, 7203.T, ^GSPC, ^N225). Solo consulta, no se pueden comprar en la app. Hasta 30.",
    input_schema: {
      type: "object",
      properties: { simbolos: { type: "array", items: { type: "string" }, maxItems: 30 } },
      required: ["simbolos"],
    },
  },
  {
    name: "historial",
    description:
      "Resumen del comportamiento de un activo de EE. UU. o cripto en un periodo: rendimiento, volatilidad anualizada, caída máxima, máximo y mínimo. Úsalo para evaluar riesgo y tendencia.",
    input_schema: {
      type: "object",
      properties: {
        simbolo: { type: "string" },
        dias: { type: "integer", minimum: 30, maximum: 1825, description: "30, 90, 180, 365 o 1825" },
      },
      required: ["simbolo"],
    },
  },
];

function summarize(symbol: string, bars: { t: string; c: number }[]) {
  const closes = bars.map((b) => b.c).filter((c) => c > 0);
  if (closes.length < 5) return { simbolo: symbol, error: "Sin historial suficiente" };
  const first = closes[0];
  const last = closes[closes.length - 1];
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  let peak = closes[0];
  let mdd = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    mdd = Math.min(mdd, c / peak - 1);
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    simbolo: symbol,
    desde: bars[0].t.slice(0, 10),
    hasta: bars[bars.length - 1].t.slice(0, 10),
    precio_inicial: r(first),
    precio_actual: r(last),
    rendimiento_pct: r((last / first - 1) * 100),
    volatilidad_anual_pct: r(sd * Math.sqrt(symbol.includes("/") ? 365 : 252) * 100),
    caida_maxima_pct: r(mdd * 100),
    maximo: r(Math.max(...closes)),
    minimo: r(Math.min(...closes)),
  };
}

async function runTool(name: string, input: Any, deps: NovaDeps): Promise<unknown> {
  try {
    if (name === "precios_eeuu") {
      const list = (input?.simbolos ?? []).slice(0, 30).map((s: string) => String(s).toUpperCase());
      return await deps.quotes(list);
    }
    if (name === "precios_bolsas_locales") {
      const list = (input?.simbolos ?? []).slice(0, 30).map((s: string) => String(s).toUpperCase());
      return await deps.localQuotes(list);
    }
    if (name === "historial") {
      const s = String(input?.simbolo ?? "").toUpperCase();
      const days = Math.min(Math.max(Number(input?.dias) || 365, 30), 1825);
      return summarize(s, await deps.history(s, days));
    }
    return { error: "Herramienta desconocida" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar" };
  }
}

async function callClaude(apiKey: string, body: unknown): Promise<Any> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new HttpError(502, "NOVA no pudo conectarse con su motor de IA. Intenta de nuevo.");
  }
  const data: Any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? `Error ${res.status}`;
    if (res.status === 401) throw new HttpError(503, "La clave de la IA de NOVA no es válida. Revisa ANTHROPIC_API_KEY.");
    if (res.status === 429) throw new HttpError(429, "NOVA está recibiendo muchas consultas. Espera un momento.");
    throw new HttpError(502, `Motor de IA: ${String(msg).slice(0, 200)}`);
  }
  return data;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function parseMessages(body: unknown): ChatMessage[] {
  const raw = (body as Any)?.messages;
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "Escribe un mensaje para NOVA.");
  const msgs = raw
    .slice(-16)
    .filter((m: Any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m: Any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new HttpError(400, "El último mensaje debe ser tuyo.");
  return msgs;
}

/** Conversa con NOVA: hace las consultas de mercado que necesite y devuelve su respuesta. */
export async function askNova(messages: ChatMessage[], deps: NovaDeps): Promise<{ reply: string; tools: string[] }> {
  if (!deps.apiKey) {
    throw new HttpError(503, "NOVA aún no tiene su motor de IA activado (falta la clave ANTHROPIC_API_KEY).");
  }
  const system = [
    SYSTEM,
    `Símbolos que la app muestra en Mercados (puedes sugerir otros listados en EE. UU.): ${deps.catalog}`,
    `Contexto actual del usuario (datos reales de Orion Invest, en JSON):\n${JSON.stringify(deps.context)}`,
  ].join("\n\n");

  // deno-lint-ignore no-explicit-any
  const convo: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const used: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await callClaude(deps.apiKey, {
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: TOOLS,
      // En la última vuelta ya no consulta más: responde con lo que tiene
      ...(round === MAX_TOOL_ROUNDS ? { tool_choice: { type: "none" } } : {}),
      messages: convo,
    });
    const blocks: Any[] = data?.content ?? [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (data?.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "No tengo una respuesta en este momento. ¿Puedes reformular la pregunta?", tools: used };
    }
    convo.push({ role: "assistant", content: blocks });
    const results = await Promise.all(
      toolUses.map(async (t) => {
        used.push(t.name);
        return {
          type: "tool_result",
          tool_use_id: t.id,
          content: JSON.stringify(await runTool(t.name, t.input, deps)).slice(0, 12000),
        };
      }),
    );
    convo.push({ role: "user", content: results });
  }
  return { reply: "Consulté muchos datos y no alcancé a terminar el análisis. Pregúntame algo más específico.", tools: used };
}
