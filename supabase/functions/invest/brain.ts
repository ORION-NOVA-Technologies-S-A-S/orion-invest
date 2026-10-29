// Cerebro de NOVA: aprende del mercado por PRUEBA Y ERROR (aprendizaje por refuerzo).
//
// Cómo aprende:
//  1. Recorre la historia real de cada activo. En cada momento describe la "situación" del mercado
//     (estado): tendencia corta, tendencia de fondo, si cayó o subió mucho (RSI) y qué tan agitado está.
//  2. En cada situación decide COMPRAR o ESPERAR. Al principio prueba mucho al azar (explora);
//     con cada vuelta usa más lo que aprendió (explota).
//  3. Si compró, mira qué pasó 20 días hábiles después: esa ganancia o pérdida es su recompensa.
//     Con ella corrige lo que espera de esa situación (Q). Así aprende de sus aciertos y errores.
//  4. Se examina con los meses más recientes, que NO usó para aprender, y reporta su acierto real.
// Todo es código propio: no usa ninguna API de inteligencia artificial.

export type Kind = "accion" | "etf" | "cripto";

export interface Asset {
  symbol: string;
  name: string;
  kind: Kind;
  dividend?: boolean; // paga dividendos de forma constante (flujo de caja)
  country?: string;
}

// Activos con los que NOVA practica (todos se pueden comprar en la app vía Alpaca)
export const UNIVERSE: Asset[] = [
  { symbol: "VOO", name: "S&P 500 (Vanguard)", kind: "etf", dividend: true },
  { symbol: "QQQ", name: "Nasdaq 100", kind: "etf" },
  { symbol: "DIA", name: "Dow Jones", kind: "etf", dividend: true },
  { symbol: "IWM", name: "Russell 2000", kind: "etf" },
  { symbol: "VT", name: "Todo el mercado mundial", kind: "etf", dividend: true },
  { symbol: "SCHD", name: "Dividendos EE. UU. (Schwab)", kind: "etf", dividend: true },
  { symbol: "VYM", name: "Alto dividendo (Vanguard)", kind: "etf", dividend: true },
  { symbol: "VIG", name: "Dividendos crecientes (Vanguard)", kind: "etf", dividend: true },
  { symbol: "VNQ", name: "Bienes raíces (REIT)", kind: "etf", dividend: true },
  { symbol: "GLD", name: "Oro", kind: "etf" },
  { symbol: "TLT", name: "Bonos del Tesoro 20+ años", kind: "etf", dividend: true },
  { symbol: "AAPL", name: "Apple", kind: "accion", dividend: true },
  { symbol: "MSFT", name: "Microsoft", kind: "accion", dividend: true },
  { symbol: "NVDA", name: "Nvidia", kind: "accion" },
  { symbol: "GOOGL", name: "Alphabet (Google)", kind: "accion" },
  { symbol: "AMZN", name: "Amazon", kind: "accion" },
  { symbol: "META", name: "Meta", kind: "accion" },
  { symbol: "TSLA", name: "Tesla", kind: "accion" },
  { symbol: "JPM", name: "JPMorgan", kind: "accion", dividend: true },
  { symbol: "V", name: "Visa", kind: "accion", dividend: true },
  { symbol: "KO", name: "Coca-Cola", kind: "accion", dividend: true },
  { symbol: "PEP", name: "PepsiCo", kind: "accion", dividend: true },
  { symbol: "JNJ", name: "Johnson & Johnson", kind: "accion", dividend: true },
  { symbol: "PG", name: "Procter & Gamble", kind: "accion", dividend: true },
  { symbol: "XOM", name: "ExxonMobil", kind: "accion", dividend: true },
  { symbol: "WMT", name: "Walmart", kind: "accion", dividend: true },
  { symbol: "MCD", name: "McDonald's", kind: "accion", dividend: true },
  { symbol: "COLO", name: "ETF de Colombia", kind: "etf", country: "Colombia" },
  { symbol: "EC", name: "Ecopetrol (ADR)", kind: "accion", dividend: true, country: "Colombia" },
  { symbol: "CIB", name: "Grupo Cibest / Bancolombia (ADR)", kind: "accion", dividend: true, country: "Colombia" },
  { symbol: "AVAL", name: "Grupo Aval (ADR)", kind: "accion", dividend: true, country: "Colombia" },
  { symbol: "EWZ", name: "ETF de Brasil", kind: "etf", country: "Brasil" },
  { symbol: "EWW", name: "ETF de México", kind: "etf", country: "México" },
  { symbol: "EWJ", name: "ETF de Japón", kind: "etf", country: "Japón" },
  { symbol: "INDA", name: "ETF de India", kind: "etf", country: "India" },
  { symbol: "MCHI", name: "ETF de China", kind: "etf", country: "China" },
  { symbol: "BTC/USD", name: "Bitcoin", kind: "cripto" },
  { symbol: "ETH/USD", name: "Ethereum", kind: "cripto" },
  { symbol: "SOL/USD", name: "Solana", kind: "cripto" },
];

export const HORIZON = 20; // días hábiles que NOVA espera para ver si acertó
const STEP = 5; // cada cuántos días toma una decisión al practicar
const COST = 0.001; // costo de operar (0,1 %)
const EPOCHS = 4; // vueltas de práctica

export interface Series {
  symbol: string;
  kind: Kind;
  dates: string[];
  closes: number[];
}

export interface StateParts {
  tendencia: "alcista" | "bajista"; // precio frente a su promedio de 50 días
  fondo: "positivo" | "negativo"; // promedio de 50 días frente al de 200
  rsi: "sobrevendido" | "neutral" | "sobrecomprado";
  ritmo: "calma" | "agitado"; // volatilidad frente a su normal
}

export interface QCell {
  buy: number; // ganancia promedio esperada al comprar en esta situación (fracción)
  n: number; // cuántas veces lo probó
  wins: number; // cuántas veces ganó
}

export interface EpochStat {
  vuelta: number;
  exploracion_pct: number;
  acierto_pct: number;
  ganancia_prom_pct: number;
}

export interface Brain {
  version: 1;
  trained_at: string;
  activos: number;
  muestras: number;
  situaciones: number;
  curva: EpochStat[]; // cómo fue mejorando en cada vuelta
  examen: {
    muestras: number;
    acierto_pct: number; // acierto en datos que NO vio
    ganancia_nova_pct: number; // ganancia promedio por decisión siguiendo a NOVA
    ganancia_siempre_comprar_pct: number; // referencia: comprar siempre
    desde: string;
  };
  q: Record<string, QCell>;
}

// ---------------- Indicadores (solo usan datos pasados) ----------------
function mean(a: number[], from: number, to: number) {
  let s = 0;
  for (let k = from; k <= to; k++) s += a[k];
  return s / (to - from + 1);
}

export function rsiAt(c: number[], i: number, n = 14): number {
  if (i < n) return 50;
  let up = 0;
  let down = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = c[k] - c[k - 1];
    if (d > 0) up += d;
    else down -= d;
  }
  if (down === 0) return 100;
  const rs = up / down;
  return 100 - 100 / (1 + rs);
}

export function volAt(c: number[], i: number, n = 20, kind: Kind = "accion"): number {
  if (i < n) return 0;
  const r: number[] = [];
  for (let k = i - n + 1; k <= i; k++) r.push(Math.log(c[k] / c[k - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  return sd * Math.sqrt(kind === "cripto" ? 365 : 252);
}

function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export function partsAt(c: number[], i: number, kind: Kind, volMedian: number): StateParts | null {
  if (i < 200 || i >= c.length) return null;
  const sma50 = mean(c, i - 49, i);
  const sma200 = mean(c, i - 199, i);
  const r = rsiAt(c, i);
  return {
    tendencia: c[i] >= sma50 ? "alcista" : "bajista",
    fondo: sma50 >= sma200 ? "positivo" : "negativo",
    rsi: r < 35 ? "sobrevendido" : r > 65 ? "sobrecomprado" : "neutral",
    ritmo: volAt(c, i, 20, kind) > volMedian ? "agitado" : "calma",
  };
}

export const keyOf = (kind: Kind, p: StateParts) => `${kind}|${p.tendencia}|${p.fondo}|${p.rsi}|${p.ritmo}`;

function volMedianOf(s: Series) {
  const v: number[] = [];
  for (let i = 21; i < s.closes.length; i++) v.push(volAt(s.closes, i, 20, s.kind));
  return median(v);
}

// Generador pseudoaleatorio con semilla: el entrenamiento es reproducible
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sample {
  key: string;
  fwd: number;
  date: string;
}

function samplesOf(series: Series[]): Sample[] {
  const out: Sample[] = [];
  for (const s of series) {
    const vm = volMedianOf(s);
    for (let i = 200; i + HORIZON < s.closes.length; i += STEP) {
      const p = partsAt(s.closes, i, s.kind, vm);
      if (!p) continue;
      out.push({ key: keyOf(s.kind, p), fwd: s.closes[i + HORIZON] / s.closes[i] - 1, date: s.dates[i] });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const decide = (q: QCell | undefined) => (!q || q.n < 3 ? "buy" : q.buy > 0 ? "buy" : "wait");

function learn(q: Record<string, QCell>, s: Sample) {
  const cell = (q[s.key] ??= { buy: 0, n: 0, wins: 0 });
  const reward = s.fwd - COST;
  cell.n += 1;
  cell.buy += (reward - cell.buy) / cell.n; // promedio incremental: corrige con cada acierto o error
  if (s.fwd > 0) cell.wins += 1;
}

const pct = (x: number) => Math.round(x * 10000) / 100;

/** Entrena a NOVA por prueba y error con la historia de cada activo. */
export function train(series: Series[], seed = 2026): Brain {
  const all = samplesOf(series);
  if (all.length < 50) throw new Error("No hay suficiente historia del mercado para aprender.");

  const cut = Math.floor(all.length * 0.8); // 80 % para practicar, 20 % más reciente para el examen
  const practice = all.slice(0, cut);
  const exam = all.slice(cut);
  const q: Record<string, QCell> = {};
  const rand = rng(seed);
  const curva: EpochStat[] = [];

  for (let e = 0; e < EPOCHS; e++) {
    const eps = Math.max(0.05, 0.6 * (1 - e / (EPOCHS - 1))); // explora mucho al inicio, poco al final
    let correct = 0;
    let gain = 0;
    for (const s of practice) {
      const action = rand() < eps ? (rand() < 0.5 ? "buy" : "wait") : decide(q[s.key]);
      if (action === "buy") {
        learn(q, s);
        gain += s.fwd - COST;
      }
      if ((action === "buy") === s.fwd > 0) correct += 1;
    }
    curva.push({
      vuelta: e + 1,
      exploracion_pct: Math.round(eps * 100),
      acierto_pct: pct(correct / practice.length),
      ganancia_prom_pct: pct(gain / practice.length),
    });
  }

  // Examen con datos que NO vio: solo usa lo aprendido (sin azar)
  let ok = 0;
  let gainNova = 0;
  let gainAlways = 0;
  for (const s of exam) {
    const action = decide(q[s.key]);
    if ((action === "buy") === s.fwd > 0) ok += 1;
    if (action === "buy") gainNova += s.fwd - COST;
    gainAlways += s.fwd - COST;
  }
  // Después del examen, aprende también de lo más reciente
  for (const s of exam) learn(q, s);

  return {
    version: 1,
    trained_at: new Date().toISOString(),
    activos: series.length,
    muestras: all.length,
    situaciones: Object.keys(q).length,
    curva,
    examen: {
      muestras: exam.length,
      acierto_pct: pct(ok / Math.max(exam.length, 1)),
      ganancia_nova_pct: pct(gainNova / Math.max(exam.length, 1)),
      ganancia_siempre_comprar_pct: pct(gainAlways / Math.max(exam.length, 1)),
      desde: exam[0]?.date?.slice(0, 10) ?? "",
    },
    q,
  };
}

export interface Signal {
  symbol: string;
  name: string;
  kind: Kind;
  dividend: boolean;
  country?: string;
  price: number;
  state: string;
  parts: StateParts;
  señal: "comprar" | "esperar" | "aprendiendo";
  esperado_pct: number; // ganancia promedio que NOVA vio en esta situación (20 días)
  acierto_pct: number; // % de veces que esta situación terminó en ganancia
  veces: number; // cuántas veces lo practicó
  rend_1a_pct: number;
  vol_pct: number;
  caida_max_pct: number;
}

/** Lo que NOVA piensa HOY de cada activo, según lo que aprendió. */
export function signalsToday(series: Series[], brain: Brain): Signal[] {
  const out: Signal[] = [];
  for (const s of series) {
    const asset = UNIVERSE.find((a) => a.symbol === s.symbol);
    const c = s.closes;
    const i = c.length - 1;
    const p = partsAt(c, i, s.kind, volMedianOf(s));
    if (!asset || !p) continue;
    const key = keyOf(s.kind, p);
    const cell = brain.q[key];
    const y = Math.max(0, i - 252);
    let peak = c[y];
    let mdd = 0;
    for (let k = y; k <= i; k++) {
      peak = Math.max(peak, c[k]);
      mdd = Math.min(mdd, c[k] / peak - 1);
    }
    out.push({
      symbol: s.symbol,
      name: asset.name,
      kind: s.kind,
      dividend: !!asset.dividend,
      country: asset.country,
      price: c[i],
      state: key,
      parts: p,
      señal: !cell || cell.n < 15 ? "aprendiendo" : cell.buy > 0.002 ? "comprar" : "esperar",
      esperado_pct: cell ? pct(cell.buy) : 0,
      acierto_pct: cell && cell.n ? pct(cell.wins / cell.n) : 0,
      veces: cell?.n ?? 0,
      rend_1a_pct: pct(c[i] / c[y] - 1),
      vol_pct: pct(volAt(c, i, 60, s.kind)),
      caida_max_pct: pct(mdd),
    });
  }
  return out;
}

/** Explica una situación en palabras sencillas. */
export function describe(p: StateParts): string {
  const t = p.tendencia === "alcista" ? "va subiendo (está sobre su promedio de 50 días)" : "va bajando (está bajo su promedio de 50 días)";
  const f = p.fondo === "positivo" ? "con tendencia de fondo positiva" : "con tendencia de fondo negativa";
  const r =
    p.rsi === "sobrevendido"
      ? "cayó fuerte hace poco (sobrevendido, podría rebotar)"
      : p.rsi === "sobrecomprado"
        ? "subió fuerte hace poco (sobrecomprado, podría corregir)"
        : "sin excesos recientes";
  const v = p.ritmo === "agitado" ? "y se está moviendo más de lo normal" : "y está en calma";
  return `${t}, ${f}; ${r}, ${v}`;
}
