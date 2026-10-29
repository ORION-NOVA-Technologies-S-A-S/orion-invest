// NOVA conversa sin IA de pago: entiende la intención por palabras clave (como en NOVA COURSE)
// y responde con lo que APRENDIÓ del mercado (brain.ts), tu portafolio real y tu perfil.
import { type Brain, describe, type Signal, UNIVERSE } from "./brain.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export interface ChatContext {
  name: string;
  mode: "paper" | "live";
  fx: number | null;
  account: { equity: number; cash: number; buying_power: number } | null;
  positions: { symbol: string; asset_class: string; market_value: number; unrealized_pl: number; unrealized_plpc: number }[];
  profile: { goal?: string; horizon?: string; risk?: string; monthly_cop?: number; notes?: string } | null;
  record: { total: number; aciertos: number; pendientes: number };
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[¿?¡!.,;:()]/g, " ").replace(/\s+/g, " ").trim();
const has = (t: string, ...w: string[]) => w.some((x) => t.includes(x));
const n2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString("es-CO");
const cop = (usd: number, fx: number | null) =>
  fx ? `$${Math.round(usd * fx).toLocaleString("es-CO")} COP` : `US$${n2(usd)}`;
const sym = (s: string) => `[[${s}]]`;
const CLOSE = "\n\n_Recuerda: esto es lo que NOVA aprendió de la historia del mercado; el pasado no garantiza el futuro._";

// Palabras con las que el usuario puede nombrar cada activo
const ALIASES: Record<string, string[]> = {
  "BTC/USD": ["bitcoin", "btc"], "ETH/USD": ["ethereum", "eth"], "SOL/USD": ["solana"],
  AAPL: ["apple", "iphone"], MSFT: ["microsoft"], NVDA: ["nvidia"], GOOGL: ["google", "alphabet"], AMZN: ["amazon"],
  META: ["facebook", "instagram"], TSLA: ["tesla"], JPM: ["jpmorgan", "jp morgan"], V: ["visa"],
  KO: ["coca cola", "coca-cola", "cocacola"], PEP: ["pepsi"], JNJ: ["johnson"], PG: ["procter"], XOM: ["exxon"],
  WMT: ["walmart"], MCD: ["mcdonald"], EC: ["ecopetrol"], CIB: ["cibest", "bancolombia"], AVAL: ["grupo aval", "aval"],
  COLO: ["colo"], VOO: ["voo", "s&p", "sp500", "s p 500"], QQQ: ["qqq", "nasdaq"], DIA: ["dow jones"], SCHD: ["schd"],
  VYM: ["vym"], VIG: ["vig"], VT: ["mercado mundial"], GLD: ["oro", "gold"], TLT: ["bonos"], VNQ: ["bienes raices", "reit"],
  EWZ: ["brasil"], EWW: ["mexico"], EWJ: ["japon"], INDA: ["india"], MCHI: ["china"],
};

function findAsset(raw: string, t: string): string | null {
  for (const a of UNIVERSE) {
    const base = a.symbol.replace("/USD", "");
    // El símbolo tal como el usuario lo escribió en mayúsculas (ej. "AAPL", "VOO", "EC")
    if (base.length >= 2 && new RegExp(`(^|[^A-Za-z])${base.replace(".", "\\.")}([^A-Za-z]|$)`).test(raw)) return a.symbol;
  }
  for (const [s, words] of Object.entries(ALIASES)) if (words.some((w) => t.includes(w))) return s;
  return null;
}

// --------- Perfil → qué le conviene ---------
function fits(s: Signal, p: ChatContext["profile"]) {
  const risk = p?.risk ?? "medio";
  if (risk === "bajo" && (s.kind === "cripto" || s.vol_pct > 30)) return false;
  if (risk === "medio" && s.vol_pct > 70) return false;
  if (p?.goal === "preservar" && (s.kind === "cripto" || s.vol_pct > 25)) return false;
  return true;
}

function score(s: Signal, p: ChatContext["profile"]) {
  let v = s.esperado_pct * (s.acierto_pct / 50) - s.vol_pct / 100;
  if (p?.goal === "dividendos" && s.dividend) v += 1;
  if (p?.goal === "crecimiento" && s.kind !== "etf") v += 0.3;
  if (p?.goal === "equilibrio" && s.kind === "etf") v += 0.3;
  return v;
}

function picks(sig: Signal[], p: ChatContext["profile"], filter: (s: Signal) => boolean = () => true, k = 4) {
  return sig
    .filter((s) => s.señal === "comprar" && fits(s, p) && filter(s))
    .sort((a, b) => score(b, p) - score(a, p))
    .slice(0, k);
}

const line = (s: Signal) =>
  `- ${sym(s.symbol)} ${s.name}: en esta situación ganó en promedio **${n2(s.esperado_pct)} %** a 20 días y acertó **${n2(
    s.acierto_pct,
  )} %** de ${s.veces} veces. Volatilidad ${n2(s.vol_pct)} %.`;

function monthlyPlan(p: ChatContext["profile"], fx: number | null) {
  const m = Number(p?.monthly_cop) || 0;
  if (!m) return "";
  const risk = p?.risk ?? "medio";
  const split = risk === "bajo" ? [70, 30, 0] : risk === "alto" ? [50, 35, 15] : [60, 32, 8];
  const usd = fx ? m / fx : null;
  return (
    `\n\n**Plan para tus ${Math.round(m).toLocaleString("es-CO")} COP al mes**${usd ? ` (≈ US$${n2(usd)})` : ""}:\n` +
    `- ${split[0]} % a la base: un ETF amplio como ${sym("VOO")} o ${sym("VT")}, todos los meses sin importar el precio.\n` +
    `- ${split[1]} % a las ideas que NOVA ve hoy con mejor situación.\n` +
    (split[2] ? `- ${split[2]} % como máximo a cripto (${sym("BTC/USD")}), solo si aceptas que puede caer mucho.\n` : "") +
    `- Antes de todo: ten un fondo de emergencia de 3 a 6 meses de gastos.`
  );
}

// --------- Respuestas ---------
function hello(c: ChatContext) {
  return (
    `¡Hola${c.name ? `, ${c.name}` : ""}! Soy **NOVA** 🤖. Aprendí del mercado yo sola, por **prueba y error**: practiqué miles de decisiones de comprar o esperar con la historia real y corregí mis errores.\n\n` +
    `Puedo:\n- Analizar tu portafolio.\n- Decirte qué veo hoy para comprar según tu perfil.\n- Explicarte un activo (escribe su nombre, por ejemplo "Apple" o "Ecopetrol").\n- Hablarte de dividendos y flujo de caja.\n- Contarte cómo aprendí y qué tan acertada soy.`
  );
}

function howILearn(b: Brain, c: ChatContext) {
  const first = b.curva[0];
  const last = b.curva[b.curva.length - 1];
  const ex = b.examen;
  const rec = c.record.total
    ? `En vivo llevo **${c.record.aciertos} aciertos de ${c.record.total}** predicciones revisadas (${n2(
        (c.record.aciertos / c.record.total) * 100,
      )} %), y tengo ${c.record.pendientes} esperando su resultado.`
    : `Ya empecé a anotar mis predicciones en vivo; en unos 20 días hábiles podré mostrarte mi récord real (tengo ${c.record.pendientes} esperando).`;
  return (
    `**Así aprendí, por prueba y error:**\n` +
    `- Estudié ${b.activos} activos y practiqué **${b.muestras.toLocaleString("es-CO")} decisiones** con su historia real.\n` +
    `- En cada momento miré la situación (tendencia, si cayó o subió mucho y qué tan agitado estaba) y decidí comprar o esperar. Después vi qué pasó 20 días hábiles más tarde y corregí lo que esperaba de esa situación.\n` +
    `- Al principio exploraba al azar (${first.exploracion_pct} %) y acertaba **${n2(first.acierto_pct)} %**. En la vuelta ${last.vuelta} ya usaba lo aprendido y acerté **${n2(last.acierto_pct)} %**.\n` +
    `- **Examen honesto** con datos que no vi (desde ${ex.desde}): acerté **${n2(ex.acierto_pct)} %**. Siguiéndome se ganaba en promedio ${n2(ex.ganancia_nova_pct)} % por decisión, contra ${n2(ex.ganancia_siempre_comprar_pct)} % de comprar siempre.\n` +
    `- ${rec}\n` +
    `- Me reentreno cada día con lo más reciente del mercado. Última vez: ${new Date(b.trained_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}` +
    (ex.ganancia_nova_pct < ex.ganancia_siempre_comprar_pct
      ? `\n\nTe soy sincera: en el examen, invertir de forma constante en todo el mercado ganó más que mis señales. Por eso te recomiendo que la base de tu dinero vaya a un ETF amplio y uses mis señales solo para una parte.`
      : "")
  );
}

function portfolio(sig: Signal[], c: ChatContext) {
  if (!c.account) return "No pude leer tu cuenta en este momento. Intenta de nuevo en un minuto.";
  const eq = c.account.equity || 0;
  const pos = c.positions;
  if (!pos.length) {
    return (
      `Todavía no tienes inversiones: todo está en efectivo (${cop(c.account.cash, c.fx)}).\n\n` +
      `Para empezar con buena base:\n- Arma primero tu fondo de emergencia.\n- Empieza con un ETF amplio como ${sym("VOO")} o ${sym("VT")}.\n- Pregúntame "¿qué me recomiendas?" y te digo qué veo hoy según tu perfil.` +
      monthlyPlan(c.profile, c.fx)
    );
  }
  const invested = pos.reduce((a, p) => a + p.market_value, 0);
  const crypto = pos.filter((p) => p.asset_class === "crypto").reduce((a, p) => a + p.market_value, 0);
  const biggest = [...pos].sort((a, b) => b.market_value - a.market_value)[0];
  const cashPct = eq ? (c.account.cash / eq) * 100 : 0;
  const lines: string[] = [
    `**Tu portafolio** (${c.mode === "live" ? "cuenta real" : "Demo"}): ${pos.length} posición(es), invertido ${cop(invested, c.fx)}, efectivo ${n2(cashPct)} %.`,
  ];
  if (invested && biggest.market_value / invested > 0.4 && pos.length > 1)
    lines.push(`- ⚠️ **Concentración:** ${biggest.symbol} pesa ${n2((biggest.market_value / invested) * 100)} % de lo invertido. Lo sano es que ninguna acción pase de 10-15 %.`);
  if (invested && crypto / invested > 0.15)
    lines.push(`- ⚠️ **Cripto** es ${n2((crypto / invested) * 100)} % de lo invertido. Para un perfil ${c.profile?.risk ?? "medio"}, más de 5-10 % es mucho riesgo.`);
  if (pos.length < 3) lines.push(`- Tienes pocas posiciones: diversifica con un ETF amplio como ${sym("VT")} (todo el mundo) o ${sym("VOO")}.`);
  if (cashPct > 80) lines.push(`- Casi todo está en efectivo. Si ya tienes fondo de emergencia, puedes invertir poco a poco cada mes.`);
  lines.push(`\n**Lo que veo hoy de lo que tienes:**`);
  for (const p of pos) {
    const s = sig.find((x) => x.symbol.replace("/", "") === p.symbol.replace("/", ""));
    const res = `${p.unrealized_pl >= 0 ? "ganas" : "pierdes"} ${n2(Math.abs(p.unrealized_plpc))} %`; // ya viene en %
    if (!s) lines.push(`- ${p.symbol}: ${res}. Aún no lo estudio en mi práctica.`);
    else
      lines.push(
        `- ${sym(s.symbol)}: ${res}. Situación: ${describe(s.parts)}. ${
          s.señal === "comprar"
            ? "Históricamente esta situación fue favorable: puedes mantener o sumar poco a poco."
            : s.señal === "esperar"
              ? "Esta situación no fue favorable en la historia: no sumaría más por ahora; mantén si tu plan es de largo plazo."
              : "Todavía no tengo suficientes casos de esta situación para opinar."
        }`,
      );
  }
  return lines.join("\n") + CLOSE;
}

function recommend(sig: Signal[], c: ChatContext, onlyDividends = false) {
  if (!c.profile)
    return `Antes de recomendarte, llena tu **perfil de inversionista** arriba (objetivo, plazo, riesgo y cuánto inviertes al mes). Así ajusto mis consejos a ti.`;
  const list = picks(sig, c.profile, onlyDividends ? (s) => s.dividend : undefined);
  const head = onlyDividends
    ? `**Para flujo de caja con dividendos**, esto es lo que hoy está en una situación que históricamente fue favorable:`
    : `**Según tu perfil** (${c.profile.goal ?? "—"}, plazo ${c.profile.horizon ?? "—"}, riesgo ${c.profile.risk ?? "—"}), esto es lo que hoy veo mejor:`;
  const body = list.length
    ? list.map(line).join("\n")
    : `- Hoy ninguna situación me parece claramente favorable para comprar de golpe. Es un buen momento para seguir tu aporte mensual en un ETF amplio como ${sym("VOO")} o ${sym("VT")} y esperar.`;
  const divNote = onlyDividends
    ? `\n\n**Sobre dividendos:** los ETF como ${sym("SCHD")}, ${sym("VYM")} y ${sym("VIG")} reparten pagos varias veces al año. Como resides en Colombia, EE. UU. normalmente retiene **30 %** de cada dividendo (no hay tratado tributario) y debes declararlos ante la DIAN.`
    : "";
  return `${head}\n${body}${divNote}${monthlyPlan(c.profile, c.fx)}${CLOSE}`;
}

function explainAsset(s: Signal | undefined, symbol: string) {
  if (!s) return `Todavía no tengo historia suficiente de ${symbol} para opinar. Pregúntame por otro o ábrelo en Invertir para ver su gráfica: ${sym(symbol)}`;
  const verdict =
    s.señal === "comprar"
      ? `**Lo que aprendí:** en esta situación, en el pasado ganó en promedio **${n2(s.esperado_pct)} %** en 20 días y acerté **${n2(s.acierto_pct)} %** de ${s.veces} veces. Me parece **favorable**, sin garantía.`
      : s.señal === "esperar"
        ? `**Lo que aprendí:** en esta situación, en el pasado el resultado promedio fue **${n2(s.esperado_pct)} %** en 20 días (${n2(s.acierto_pct)} % de aciertos en ${s.veces} casos). **Yo esperaría** antes de comprar de golpe.`
        : `Aún tengo pocos casos (${s.veces}) de esta situación, así que todavía estoy aprendiendo sobre ella.`;
  return (
    `**${s.name}** ${sym(s.symbol)}\n` +
    `- Hoy ${describe(s.parts)}.\n` +
    `- En el último año: ${s.rend_1a_pct >= 0 ? "+" : ""}${n2(s.rend_1a_pct)} %, con una caída máxima de ${n2(s.caida_max_pct)} % y volatilidad de ${n2(s.vol_pct)} %.\n` +
    `- ${verdict}` +
    (s.dividend ? `\n- Paga **dividendos**, bueno para tu flujo de caja.` : "") +
    (s.kind === "cripto" ? `\n- Es **cripto**: muy volátil. Solo una porción pequeña de tu dinero.` : "") +
    CLOSE
  );
}

function colombia(sig: Signal[]) {
  const co = sig.filter((s) => s.country === "Colombia");
  return (
    `**Invertir en Colombia desde Orion Invest:**\n` +
    `- Las acciones de la BVC (GEB, ISA, Grupo Argos, Promigas…) solo se compran con una comisionista colombiana, como trii.\n` +
    `- Desde aquí puedes usar el ETF ${sym("COLO")} (las grandes del país) y los ADR que cotizan en Nueva York: ${sym("EC")} Ecopetrol, ${sym("CIB")} Grupo Cibest y ${sym("AVAL")} Grupo Aval.\n\n` +
    `**Lo que veo hoy:**\n` +
    co.map((s) => `- ${sym(s.symbol)}: ${s.señal === "comprar" ? "situación favorable" : s.señal === "esperar" ? "mejor esperar" : "aprendiendo"} (${describe(s.parts)}).`).join("\n") +
    CLOSE
  );
}

function crypto(sig: Signal[]) {
  const cr = sig.filter((s) => s.kind === "cripto");
  return (
    `**Cripto** se mueve muchísimo: puede subir o caer 20-50 % en semanas.\n` +
    cr.map((s) => `- ${sym(s.symbol)}: volatilidad ${n2(s.vol_pct)} %; ${s.señal === "comprar" ? "hoy en situación favorable" : s.señal === "esperar" ? "hoy mejor esperar" : "aún aprendiendo"}.`).join("\n") +
    `\n\nMi consejo: máximo 5-10 % de tu portafolio y solo dinero que no vayas a necesitar.` +
    CLOSE
  );
}

const ETF_TEXT =
  `Un **ETF** es una canasta de muchas acciones que se compra como si fuera una sola. Por ejemplo ${sym("VOO")} tiene las 500 empresas más grandes de EE. UU. y ${sym("VT")} tiene empresas de todo el mundo.\n\n` +
  `**Por qué sirven:**\n- Diversificas al instante: si una empresa cae, las demás amortiguan.\n- Cobran comisiones muy bajas.\n- Son ideales para invertir cada mes de forma constante.`;

const BASICS =
  `**Finanzas sanas antes de invertir:**\n` +
  `- **Fondo de emergencia:** 3 a 6 meses de gastos en una cuenta de ahorro (por ejemplo una cajita de Nu).\n` +
  `- **Invierte cada mes la misma cantidad** (promedias el costo y no tienes que adivinar el momento).\n` +
  `- **Diversifica:** ninguna acción debería pesar más de 10-15 % de tu portafolio.\n` +
  `- **Piensa a largo plazo:** el dinero que vas a necesitar en menos de 2 años no va a la bolsa.\n` +
  `- **Flujo de caja:** las empresas y ETF de dividendos te pagan por tenerlos.`;

/** Respuesta de NOVA a un mensaje. */
export function reply(message: string, brain: Brain | null, sig: Signal[], c: ChatContext): string {
  const raw = message.slice(0, 1000);
  const t = norm(raw);
  if (!brain) return "Estoy estudiando el mercado por primera vez. Dame unos segundos y vuelve a preguntarme.";
  if (!t || has(t, "hola", "buenas", "buenos dias", "buenas tardes", "que puedes", "ayuda", "quien eres")) return hello(c);
  if (has(t, "aprend", "entren", "prueba y error", "acert", "precision", "confiable", "como funcionas", "como sabes"))
    return howILearn(brain, c);
  if (has(t, "portafolio", "portfolio", "mis inversiones", "analiza", "como voy", "mis acciones", "mejorar")) return portfolio(sig, c);
  if (has(t, "dividend", "flujo de caja", "en caja", "renta", "pagos mensuales", "ingreso pasivo")) return recommend(sig, c, true);
  if (has(t, "colombia", "colombian", "bvc", "geb", "isa ", "argos", "promigas")) return colombia(sig);
  const asset = findAsset(raw, t);
  if (asset && !has(t, "recomiend", "que compro")) {
    if (asset.includes("/") && has(t, "cripto")) return crypto(sig);
    return explainAsset(sig.find((s) => s.symbol === asset), asset);
  }
  if (has(t, "cripto", "crypto")) return crypto(sig);
  if (has(t, "recomiend", "que compro", "que compra", "en que invierto", "mejor accion", "mejores acciones", "aconsej", "plan", "cada mes", "mensual"))
    return recommend(sig, c);
  if (has(t, "etf", "fondo indexado", "indice")) return ETF_TEXT;
  if (has(t, "riesgo", "diversific", "emergencia", "ahorr", "finanzas", "empezar", "principiante", "meta", "consejo")) return BASICS;
  if (has(t, "gracias", "listo", "chao", "adios")) return "¡Con gusto! Aquí estaré estudiando el mercado. 📈";
  return (
    `No entendí del todo. Puedes preguntarme, por ejemplo:\n- "Analiza mi portafolio"\n- "¿Qué me recomiendas?"\n- "Dividendos para flujo de caja"\n- "Explícame Apple" o "¿Y Ecopetrol?"\n- "¿Cómo aprendiste?"`
  );
}

// Para el panel de la app: lo esencial del cerebro sin la tabla completa
export function brainSummary(b: Brain, sig: Signal[], c: Pick<ChatContext, "profile" | "record">) {
  return {
    trained_at: b.trained_at,
    activos: b.activos,
    muestras: b.muestras,
    situaciones: b.situaciones,
    curva: b.curva,
    examen: b.examen,
    record: c.record,
    hoy: picks(sig, c.profile, undefined, 5).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      esperado_pct: s.esperado_pct,
      acierto_pct: s.acierto_pct,
      veces: s.veces,
    })),
    señales: { comprar: sig.filter((s) => s.señal === "comprar").length, esperar: sig.filter((s) => s.señal === "esperar").length },
  } as Any;
}
