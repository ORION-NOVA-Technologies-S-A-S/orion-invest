import { useCallback, useEffect, useState } from "react";
import { api, pct, usd } from "../api.js";
import LineChart from "./LineChart.jsx";
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

      {error && <p className="error banner">{error}</p>}

      <section className="card summary">
        <span className="muted">Valor total del portafolio</span>
        <div className="big mono">{usd(account?.equity)}</div>
        <div className={`mono ${account?.day_change >= 0 ? "up" : "down"}`}>
          {usd(account?.day_change)} ({pct(account?.day_change_pct)}) hoy
        </div>
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
          </div>
          <div>
            <span className="muted">Poder de compra</span>
            <span className="mono">{usd(account?.buying_power)}</span>
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
          <QuotePanel symbol={selected} me={me} onOrderPlaced={refresh} />
          <Positions positions={positions} onSelect={setSelected} />
        </div>
        <div className="col">
          <Watchlist selected={selected} onSelect={setSelected} />
          <Orders orders={orders} onChange={refresh} />
        </div>
      </div>

      <footer className="muted small foot">
        Orion Nova Technologies · Operado a través de Alpaca Securities. Invertir implica riesgo de pérdida.
      </footer>
    </div>
  );
}
