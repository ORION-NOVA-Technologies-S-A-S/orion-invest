// Catálogo del menú "Mercados".
// - etf: fondo listado en EE. UU. que sigue esa bolsa → SE PUEDE COMPRAR con Alpaca (en USD)
// - index: índice local de esa bolsa → SOLO SE MUESTRA (fuente: Yahoo Finance)

export const WALL_STREET = {
  indices: [
    { name: "S&P 500", index: "^GSPC", etf: "SPY" },
    { name: "Nasdaq 100", index: "^NDX", etf: "QQQ" },
    { name: "Dow Jones", index: "^DJI", etf: "DIA" },
    { name: "Russell 2000", index: "^RUT", etf: "IWM" },
  ],
  stocks: [
    { symbol: "AAPL", name: "Apple" },
    { symbol: "MSFT", name: "Microsoft" },
    { symbol: "NVDA", name: "Nvidia" },
    { symbol: "AMZN", name: "Amazon" },
    { symbol: "GOOGL", name: "Alphabet (Google)" },
    { symbol: "META", name: "Meta" },
    { symbol: "TSLA", name: "Tesla" },
    { symbol: "BRK.B", name: "Berkshire Hathaway" },
    { symbol: "JPM", name: "JPMorgan" },
    { symbol: "V", name: "Visa" },
    { symbol: "KO", name: "Coca-Cola" },
    { symbol: "JNJ", name: "Johnson & Johnson" },
  ],
  etfs: [
    { symbol: "VOO", name: "Vanguard S&P 500" },
    { symbol: "VTI", name: "Todo el mercado de EE. UU." },
    { symbol: "VT", name: "Todo el mercado mundial" },
    { symbol: "SCHD", name: "Dividendos EE. UU." },
    { symbol: "GLD", name: "Oro" },
    { symbol: "TLT", name: "Bonos del Tesoro 20+ años" },
  ],
};

export const WORLD = [
  {
    region: "Latinoamérica",
    markets: [
      { flag: "🇨🇴", country: "Colombia", exchange: "Bolsa de Valores de Colombia", index: null, indexName: "COLCAP", etf: "COLO",
        extra: [{ symbol: "EC", name: "Ecopetrol (ADR)" }, { symbol: "CIB", name: "Grupo Cibest / Bancolombia (ADR)" }] },
      { flag: "🇧🇷", country: "Brasil", exchange: "B3 São Paulo", index: "^BVSP", indexName: "Ibovespa", etf: "EWZ" },
      { flag: "🇲🇽", country: "México", exchange: "Bolsa Mexicana", index: "^MXX", indexName: "S&P/BMV IPC", etf: "EWW" },
      { flag: "🇨🇱", country: "Chile", exchange: "Bolsa de Santiago", index: null, indexName: "IPSA", etf: "ECH" },
      { flag: "🇵🇪", country: "Perú", exchange: "Bolsa de Lima", index: null, indexName: "S&P/BVL", etf: "EPU" },
      { flag: "🇦🇷", country: "Argentina", exchange: "BYMA Buenos Aires", index: "^MERV", indexName: "Merval", etf: "ARGT" },
    ],
  },
  {
    region: "Norteamérica",
    markets: [{ flag: "🇨🇦", country: "Canadá", exchange: "Bolsa de Toronto", index: "^GSPTSE", indexName: "S&P/TSX", etf: "EWC" }],
  },
  {
    region: "Europa",
    markets: [
      { flag: "🇪🇺", country: "Eurozona", exchange: "Grandes empresas europeas", index: "^STOXX50E", indexName: "Euro Stoxx 50", etf: "EZU" },
      { flag: "🇬🇧", country: "Reino Unido", exchange: "Bolsa de Londres", index: "^FTSE", indexName: "FTSE 100", etf: "EWU" },
      { flag: "🇩🇪", country: "Alemania", exchange: "Bolsa de Fráncfort", index: "^GDAXI", indexName: "DAX", etf: "EWG" },
      { flag: "🇫🇷", country: "Francia", exchange: "Euronext París", index: "^FCHI", indexName: "CAC 40", etf: "EWQ" },
      { flag: "🇪🇸", country: "España", exchange: "Bolsa de Madrid", index: "^IBEX", indexName: "IBEX 35", etf: "EWP" },
      { flag: "🇮🇹", country: "Italia", exchange: "Bolsa de Milán", index: "FTSEMIB.MI", indexName: "FTSE MIB", etf: "EWI" },
      { flag: "🇨🇭", country: "Suiza", exchange: "SIX Zúrich", index: "^SSMI", indexName: "SMI", etf: "EWL" },
      { flag: "🇳🇱", country: "Países Bajos", exchange: "Euronext Ámsterdam", index: "^AEX", indexName: "AEX", etf: "EWN" },
    ],
  },
  {
    region: "Asia y Oceanía",
    markets: [
      { flag: "🇯🇵", country: "Japón", exchange: "Bolsa de Tokio", index: "^N225", indexName: "Nikkei 225", etf: "EWJ" },
      { flag: "🇨🇳", country: "China", exchange: "Shanghái / Shenzhen", index: "000001.SS", indexName: "Shanghai Composite", etf: "MCHI" },
      { flag: "🇭🇰", country: "Hong Kong", exchange: "Bolsa de Hong Kong", index: "^HSI", indexName: "Hang Seng", etf: "EWH" },
      { flag: "🇮🇳", country: "India", exchange: "NSE Bombay", index: "^NSEI", indexName: "Nifty 50", etf: "INDA" },
      { flag: "🇰🇷", country: "Corea del Sur", exchange: "Bolsa de Corea", index: "^KS11", indexName: "KOSPI", etf: "EWY" },
      { flag: "🇹🇼", country: "Taiwán", exchange: "Bolsa de Taiwán", index: "^TWII", indexName: "TAIEX", etf: "EWT" },
      { flag: "🇸🇬", country: "Singapur", exchange: "SGX", index: "^STI", indexName: "STI", etf: "EWS" },
      { flag: "🇦🇺", country: "Australia", exchange: "ASX Sídney", index: "^AXJO", indexName: "S&P/ASX 200", etf: "EWA" },
    ],
  },
  {
    region: "Medio Oriente y África",
    markets: [
      { flag: "🇸🇦", country: "Arabia Saudita", exchange: "Tadawul", index: null, indexName: "TASI", etf: "KSA" },
      { flag: "🇮🇱", country: "Israel", exchange: "Bolsa de Tel Aviv", index: null, indexName: "TA-125", etf: "EIS" },
      { flag: "🇿🇦", country: "Sudáfrica", exchange: "Bolsa de Johannesburgo", index: null, indexName: "JSE", etf: "EZA" },
    ],
  },
];

export const CRYPTO = [
  { symbol: "BTC/USD", name: "Bitcoin" },
  { symbol: "ETH/USD", name: "Ethereum" },
  { symbol: "SOL/USD", name: "Solana" },
  { symbol: "XRP/USD", name: "XRP" },
  { symbol: "LTC/USD", name: "Litecoin" },
  { symbol: "DOGE/USD", name: "Dogecoin" },
  { symbol: "LINK/USD", name: "Chainlink" },
  { symbol: "AVAX/USD", name: "Avalanche" },
];
