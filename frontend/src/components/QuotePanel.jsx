import { useEffect, useMemo, useState } from "react";
import { api, cop, num, pct, usd } from "../api.js";
import LineChart from "./LineChart.jsx";
import OrderForm from "./OrderForm.jsx";

const RANGES = [
  { label: "● En vivo", days: 0 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "5A", days: 1825 },
];
const LIVE_MS = 15000; // refresco en vivo

// "BTCUSD" (posiciones) y "BTC/USD" (órdenes) son el mismo activo
const same = (a, b) => a.replace("/", "") === b.replace("/", "");

export default function QuotePanel({ symbol, me, rate, orders = [], positions = [], onOrderPlaced }) {
  const [quote, setQuote] = useState(null);
  const [info, setInfo] = useState(null);
  const [bars, setBars] = useState([]);
  const [days, setDays] = useState(0);
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState("");
  const live = days === 0;

  useEffect(() => {
    setQuote(null);
    setInfo(null);
    setError("");
    api.asset(symbol).then(setInfo).catch(() => {});
  }, [symbol]);

  // Precio: se refresca cada 15 s en vivo
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .quote(symbol)
        .then((q) => alive && (setQuote(q), setUpdated(new Date())))
        .catch((e) => alive && setError(e.message));
    load();
    const id = live ? setInterval(load, LIVE_MS) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [symbol, live]);

  // Gráfica: intradía en vivo, o histórica
  useEffect(() => {
    let alive = true;
    setBars([]);
    const load = () =>
      (live ? api.liveBars(symbol) : api.bars(symbol, days))
        .then((b) => alive && setBars(b.map((x) => ({ t: x.t, v: x.c }))))
        .catch(() => alive && setBars([]));
    load();
    const id = live ? setInterval(load, LIVE_MS) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [symbol, days, live]);

  // En vivo, el último punto sigue al precio actual
  const points = useMemo(() => {
    if (!live || !quote?.price || bars.length === 0) return bars;
    return [...bars, { t: new Date().toISOString(), v: quote.price }];
  }, [bars, quote, live]);

  // Tus compras y ventas ejecutadas de este activo
  const markers = useMemo(
    () =>
      orders
        .filter((o) => same(o.symbol, symbol) && o.filled_at && o.filled_avg_price)
        .map((o) => ({ t: o.filled_at, v: +o.filled_avg_price, side: o.side })),
    [orders, symbol]
  );
  const pending = orders.filter((o) => same(o.symbol, symbol) && ["new", "accepted", "pending_new", "held"].includes(o.status));
  const position = positions.find((p) => same(p.symbol, symbol));

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

      {/* Estado de tu operación en este activo */}
      {position && (
        <div className="hold">
          <div>
            <span className="muted small">Tienes</span>
            <strong className="mono">{num(position.qty)}</strong>
          </div>
          <div>
            <span className="muted small">Valor</span>
            <strong className="mono">{usd(position.market_value)}</strong>
          </div>
          <div>
            <span className="muted small">Ganancia</span>
            <strong className={`mono ${position.unrealized_pl >= 0 ? "up" : "down"}`}>
              {usd(position.unrealized_pl)} ({pct(position.unrealized_plpc)})
            </strong>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <p className="ord-wait">⏳ Tienes {pending.length} orden(es) pendiente(s) en {symbol}. Aparecerán en la gráfica al ejecutarse.</p>
      )}

      <div className="tabs scroll">
        {RANGES.map((r) => (
          <button key={r.label} className={`${days === r.days ? "on" : ""} ${r.days === 0 ? "live-tab" : ""}`} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>
      <LineChart points={points} markers={markers} intraday={live} format={(v) => usd(v, digits)} />
      <div className="chart-legend muted small">
        {live && updated && <span className="live-dot">En vivo · {updated.toLocaleTimeString("es-CO")}</span>}
        <span>
          <span className="trade-pt buy static">C</span> tu compra
        </span>
        <span>
          <span className="trade-pt sell static">V</span> tu venta
        </span>
      </div>

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
