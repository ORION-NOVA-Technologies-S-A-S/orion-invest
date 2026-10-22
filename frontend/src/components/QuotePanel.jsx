import { useEffect, useState } from "react";
import { api, cop, pct, usd } from "../api.js";
import LineChart from "./LineChart.jsx";
import OrderForm from "./OrderForm.jsx";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "5A", days: 1825 },
];

export default function QuotePanel({ symbol, me, rate, onOrderPlaced }) {
  const [quote, setQuote] = useState(null);
  const [info, setInfo] = useState(null);
  const [bars, setBars] = useState([]);
  const [days, setDays] = useState(180);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuote(null);
    setInfo(null);
    setError("");
    api.quote(symbol).then(setQuote).catch((e) => setError(e.message));
    api.asset(symbol).then(setInfo).catch(() => {});
  }, [symbol]);

  useEffect(() => {
    api
      .bars(symbol, days)
      .then((b) => setBars(b.map((x) => ({ t: x.t, v: x.c }))))
      .catch(() => setBars([]));
  }, [symbol, days]);

  const digits = quote?.price < 1 ? 6 : 2;

  return (
    <section className="card">
      <div className="quote-head">
        <div>
          <h2 className="sym-title">{symbol}</h2>
          <p className="muted">{info?.name || (symbol.includes("/") ? "Criptomoneda" : "")}</p>
        </div>
        <div className="right">
          <div className="price mono">{usd(quote?.price, digits)}</div>
          <div className="mono muted small">≈ {cop(quote?.price, rate)}</div>
          <div className={`mono ${quote?.change >= 0 ? "up" : "down"}`}>
            {quote?.change != null && `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(digits)}`} {pct(quote?.change_pct)}
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="tabs">
        {RANGES.map((r) => (
          <button key={r.label} className={days === r.days ? "on" : ""} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>
      <LineChart points={bars} format={(v) => usd(v, digits)} />
      <div className="stats">
        <div>
          <span className="muted">Máx. día</span>
          <span className="mono">{usd(quote?.day_high, digits)}</span>
        </div>
        <div>
          <span className="muted">Mín. día</span>
          <span className="mono">{usd(quote?.day_low, digits)}</span>
        </div>
        <div>
          <span className="muted">Compra / Venta</span>
          <span className="mono">
            {usd(quote?.bid, digits)} / {usd(quote?.ask, digits)}
          </span>
        </div>
      </div>
      {info && info.tradable === false && <p className="error">Este activo no se puede operar en Alpaca.</p>}
      <OrderForm symbol={symbol} quote={quote} info={info} me={me} rate={rate} onPlaced={onOrderPlaced} />
    </section>
  );
}
