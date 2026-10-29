// Ícono que identifica cada producto por lo que hace (no son logos de las marcas).
import { WORLD } from "./markets.js";

const BY_SYMBOL = {
  // ---- Tecnología ----
  AAPL: "📱", MSFT: "💻", NVDA: "🎮", GOOGL: "🔍", META: "👥", AMZN: "📦", AVGO: "🔌", AMD: "🖥️",
  ORCL: "🗄️", CRM: "☁️", NFLX: "🎬", PLTR: "🛰️", SHOP: "🛒", ASML: "🔬", SAP: "🧩", TSM: "🔌",
  UMC: "🔌", ASX: "🔌", SONY: "🎧", INFY: "💻", WIT: "💻", GLOB: "💻", SE: "🛍️", GRAB: "🛵",
  NICE: "📞", CHKP: "🛡️", BABA: "🛍️", PDD: "🛍️", JD: "📦", BIDU: "🔍", MELI: "🛒",
  // ---- Pagos y finanzas ----
  V: "💳", MA: "💳", "BRK.B": "🏛️", JPM: "🏦", BAC: "🏦", GS: "🏦", NU: "💜", CIB: "🏦", AVAL: "🏦",
  ITUB: "🏦", BBD: "🏦", BCH: "🏦", BSAC: "🏦", BAP: "🏦", IFS: "🏦", GGAL: "🏦", BMA: "🏦", RY: "🏦",
  TD: "🏦", BMO: "🏦", BN: "🏢", HSBC: "🏦", SAN: "🏦", BBVA: "🏦", ING: "🏦", UBS: "🏦", DB: "🏦",
  MUFG: "🏦", HDB: "🏦", IBN: "🏦", KB: "🏦", SHG: "🏦",
  // ---- Consumo ----
  TSLA: "🚗", WMT: "🛒", KO: "🥤", PEP: "🥤", MCD: "🍔", NKE: "👟", DIS: "🏰", ABEV: "🍺", FMX: "🏪",
  KOF: "🥤", DEO: "🥃", BTI: "🚬", UL: "🧴", TM: "🚗", HMC: "🚗", RACE: "🏎️", STLA: "🚗", NIO: "🔋",
  // ---- Salud ----
  JNJ: "🩹", LLY: "💊", PFE: "💊", AZN: "💊", GSK: "💊", SNY: "💊", NVS: "💊", TEVA: "💊",
  // ---- Energía y materiales ----
  XOM: "🛢️", CVX: "🛢️", EC: "🛢️", PBR: "🛢️", YPF: "🛢️", SHEL: "🛢️", BP: "🛢️", TTE: "🛢️", VIST: "🛢️",
  CNQ: "🛢️", ENB: "⛽", SSL: "🛢️", PAM: "⚡", CEPU: "⚡", ENIC: "⚡", VALE: "⛏️", SCCO: "⛏️", BVN: "⛏️",
  RIO: "⛏️", BHP: "⛏️", GFI: "🥇", SQM: "🔋", GGB: "🏗️", PKX: "🏗️", CX: "🏗️", TGLS: "🪟",
  // ---- Industria, transporte y telecomunicaciones ----
  BA: "✈️", CAT: "🚜", GE: "✈️", ERJ: "✈️", LTM: "✈️", PAC: "🛫", CNI: "🚆", AMX: "📶", TEO: "📶",
  TEF: "📶", PHG: "💡", ESLT: "🛡️",
  // ---- ETF ----
  SPY: "📊", VOO: "📊", QQQ: "📊", DIA: "📊", IWM: "📊", VTI: "📊", VT: "🌍", SCHD: "💵", VNQ: "🏠",
  XLK: "💻", XLE: "🛢️", GLD: "🥇", SLV: "🥈", TLT: "📜", VGK: "🇪🇺", FEZ: "🇪🇺", EZU: "🇪🇺",
  FXI: "🇨🇳", MCHI: "🇨🇳", KWEB: "🌐", ASHR: "🇨🇳", DXJ: "🇯🇵", EPI: "🇮🇳", EWZS: "🇧🇷",
  // ---- Cripto ----
  "BTC/USD": "₿", "ETH/USD": "💠", "SOL/USD": "☀️", "XRP/USD": "💧", "LTC/USD": "🪙", "DOGE/USD": "🐕",
  "LINK/USD": "🔗", "AVAX/USD": "🏔️", "DOT/USD": "⚪", "UNI/USD": "🦄",
};

// ETF de cada país → su bandera (sale del catálogo de bolsas del mundo)
for (const r of WORLD) for (const m of r.markets) for (const e of m.etfs) BY_SYMBOL[e.symbol] ??= m.flag;

// Empresas que solo cotizan en su bolsa local: se reconoce el sector por el nombre
const BY_WORDS = [
  [/banc|bank|financ|cibest|aval|davivienda|credicorp|itaú|bradesco|santander|bbva|hsbc|dbs|ocbc|uob|icici|hdfc|leumi|firstrand|rajhi|macquarie|westpac|commonwealth|intesa|unicredit|bnp|ing\b|allianz|zurich|aia|ping an|insurance|seguros/i, "🏦"],
  [/el[eé]ctric|enel|iberdrola|celsia|\bisa\b|\bgeb\b|energía bogotá|energia bogota|power|delta/i, "⚡"],
  [/petro|oil|ecopetrol|aramco|repsol|eni\b|terpel|copec|sasol|reliance/i, "🛢️"],
  [/gas|promigas/i, "🔥"],
  [/cement|cemex|argos|construc/i, "🏗️"],
  [/miner|mining|vale|rio tinto|bhp|gold|oro|grupo méxico/i, "⛏️"],
  [/telecom|tel[eé]fon|mobile|móvil|movil|airtel|singtel|mtn|stc|telekom/i, "📶"],
  [/air|aero|airbus|latam|airlines/i, "✈️"],
  [/auto|motor|toyota|honda|hyundai|bmw|mercedes|volkswagen|byd|ferrari|stellantis/i, "🚗"],
  [/pharma|novartis|roche|sanofi|astrazeneca|gsk|csl|teva|salud/i, "💊"],
  [/samsung|hynix|tsmc|mediatek|foxconn|hon hai|semicon|electron|keyence|hitachi|xiaomi|sony/i, "🔌"],
  [/tencent|naver|meituan|prosus|naspers|internet|software|tcs|consultancy|infosys|wipro/i, "🌐"],
  [/nintendo|game/i, "🎮"],
  [/walmart|falabella|cencosud|wesfarmers|ahold|inditex|zara|retail|bimbo|femsa|moutai|nestl|heineken|ambev|l'oréal|lvmh|hermès|adidas/i, "🛍️"],
  [/railway|tren|aeroportuario/i, "🚆"],
  [/b3\b|bolsa|exchange|bvc/i, "📈"],
];

export function iconFor(symbol = "", name = "") {
  const s = String(symbol).toUpperCase();
  if (BY_SYMBOL[s]) return BY_SYMBOL[s];
  const asCrypto = s.endsWith("USD") && !s.includes("/") ? s.replace(/USD$/, "/USD") : s; // "BTCUSD" de posiciones
  if (BY_SYMBOL[asCrypto]) return BY_SYMBOL[asCrypto];
  for (const [re, icon] of BY_WORDS) if (re.test(name)) return icon;
  if (s.includes("/")) return "🪙";
  return "🏢";
}

// Burbuja redonda con el ícono
export function AssetIcon({ symbol, name, size = "md" }) {
  return (
    <span className={`asset-ic ${size}`} aria-hidden="true">
      {iconFor(symbol, name)}
    </span>
  );
}
