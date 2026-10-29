import { useCallback, useEffect, useState } from "react";
import { api, cop, pct, usd } from "../api.js";
import LineChart from "./LineChart.jsx";
import Markets from "./Markets.jsx";
import Orders from "./Orders.jsx";
import Positions from "./Positions.jsx";
import QuotePanel from "./QuotePanel.jsx";
import Watchlist from "./Watchlist.jsx";

const PERIODS = ["1W", "1M", "3M", "1A"];

export default function Dashboard({ me, onLogout }) {
  const live = me.environment === "live";
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [period, setPeriod] = useState("1M");
  const [selected, setSelected] = useState("VOO");
  const [error, setError] = useState("");
  const [fx, setFx] = useState(null); // { usd_cop, updated }
  const [view, setView] = useState("inicio"); // inicio | mercados
  const [picked, setPicked] = useState(false); // ¿eligió un activo desde Mercados?

  const pickFromMarkets = (symbol) => {
    setSelected(symbol);
    setPicked(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const load = () => api.fx().then(setFx).catch(() => {});
    load();
    const id = setInterval(load, 3600000);
    return () => clearInterval(id);
  }, []);
  const rate = fx?.usd_cop;

  const refresh = useCallback(async () => {
    try {
      const [a, p, o] = await Promise.all([api.account(), api.positions(), api.orders()]);
      setAccount(a);
      setPositions(p);
      setOrders(o);
      setError("");
    } catch (e) {
      if (e.status === 401) return onLogout();
      setError(e.message);
    }
  }, [onLogout]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    api
      .history(period)
      .then((h) => setHistory(h.map((x) => ({ t: x.t * 1000, v: x.equity }))))
      .catch(() => setHistory([]));
  }, [period]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <strong>Orion Invest</strong>
        </div>
        <span className={`badge ${live ? "live" : "paper"}`}>{live ? "DINERO REAL" : "SIMULADO"}</span>
        <button className="link" onClick={onLogout}>
          Salir
        </button>
      </header>

      <nav className="menu">
        <button className={view === "inicio" ? "on" : ""} onClick={() => setView("inicio")}>
          Mi portafolio
        </button>
        <button
          className={view === "mercados" ? "on" : ""}
          onClick={() => {
            setView("mercados");
            setPicked(false);
          }}
        >
          Mercados
        </button>
      </nav>

      {error && <p className="error banner">{error}</p>}

      {view === "mercados" && (
        <div className="grid">
          <div className="col">
            {picked && (
              <>
                <button className="link back" onClick={() => setPicked(false)}>
                  ← Volver a mercados
                </button>
                <QuotePanel symbol={selected} me={me} rate={rate} onOrderPlaced={refresh} />
              </>
            )}
            {!picked && <Markets rate={rate} onSelect={pickFromMarkets} />}
          </div>
          <div className="col">
            <Watchlist selected={selected} onSelect={pickFromMarkets} />
          </div>
        </div>
      )}

      {view === "inicio" && (
      <>
      <section className="card summary">
        <span className="muted">Valor total del portafolio</span>
        <div className="big mono">{usd(account?.equity)}</div>
        <div className="mono muted">≈ {cop(account?.equity, rate)}</div>
        <div className={`mono ${account?.day_change >= 0 ? "up" : "down"}`}>
          {usd(account?.day_change)} ({pct(account?.day_change_pct)}) hoy · {cop(account?.day_change, rate)}
        </div>
        <p className="muted small">
          {rate
            ? `Tasa de referencia: 1 USD = ${cop(1, rate)} · ${new Date(fx.updated).toLocaleDateString("es-CO")}`
            : "Cargando tasa USD/COP…"}
        </p>
        <div className="tabs">
          {PERIODS.map((p) => (
            <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <LineChart points={history} height={140} format={(v) => usd(v)} />
        <div className="stats">
          <div>
            <span className="muted">Efectivo</span>
            <span className="mono">{usd(account?.cash)}</span>
            <span className="mono muted small">{cop(account?.cash, rate)}</span>
          </div>
          <div>
            <span className="muted">Poder de compra</span>
            <span className="mono">{usd(account?.buying_power)}</span>
            <span className="mono muted small">{cop(account?.buying_power, rate)}</span>
          </div>
          <div>
            <span className="muted">Comprado hoy</span>
            <span className="mono">
              {usd(account?.spent_today, 0)} / {usd(account?.max_daily_usd, 0)}
            </span>
          </div>
        </div>
        {account?.crypto_status && account.crypto_status !== "ACTIVE" && (
          <p className="muted small">Cripto en tu cuenta: {account.crypto_status}</p>
        )}
      </section>

      <div className="grid">
        <div className="col">
          <QuotePanel symbol={selected} me={me} rate={rate} onOrderPlaced={refresh} />
          <Positions positions={positions} rate={rate} onSelect={setSelected} />
        </div>
        <div className="col">
          <Watchlist selected={selected} onSelect={setSelected} />
          <Orders orders={orders} onChange={refresh} />
        </div>
      </div>
      </>
      )}

      <footer className="muted small foot">
        Orion Nova Technologies · Operado a través de Alpaca Securities. Invertir implica riesgo de pérdida.
      </footer>
    </div>
  );
}
