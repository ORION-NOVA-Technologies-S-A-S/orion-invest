import { useCallback, useEffect, useState } from "react";
import { api, cop, pct, usd } from "../api.js";
import Allocation from "./Allocation.jsx";
import LineChart from "./LineChart.jsx";
import Markets from "./Markets.jsx";
import ModeSwitch from "./ModeSwitch.jsx";
import DemoReset from "./DemoReset.jsx";
import Orders from "./Orders.jsx";
import Positions from "./Positions.jsx";
import QuotePanel from "./QuotePanel.jsx";
import Watchlist from "./Watchlist.jsx";

const PERIODS = ["1W", "1M", "3M", "1A"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function Dashboard({ me, onLogout }) {
  const live = me.environment === "live";
  const userName = (me.email || "").split("@")[0];

  const [view, setView] = useState("portafolio"); // portafolio | invertir
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [period, setPeriod] = useState("1M");
  const [selected, setSelected] = useState(null); // activo abierto en "Invertir"
  const [error, setError] = useState("");
  const [fx, setFx] = useState(null);
  const rate = fx?.usd_cop;

  useEffect(() => {
    const load = () => api.fx().then(setFx).catch(() => {});
    load();
    const id = setInterval(load, 3600000);
    return () => clearInterval(id);
  }, []);

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

  // Abrir un activo en la sección Invertir (desde mercados, lista o posiciones)
  const openAsset = (symbol) => {
    setSelected(symbol);
    setView("invertir");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const invested = positions.reduce((s, p) => s + p.market_value, 0);
  const totalPl = positions.reduce((s, p) => s + p.unrealized_pl, 0);
  const cost = invested - totalPl;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <strong>Orion Invest</strong>
        </div>
        <div className="user">
          <span className="avatar">{userName.slice(0, 1).toUpperCase()}</span>
          <button className="link" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <ModeSwitch me={me} />
      {live ? (
        <p className="mode-note real">💰 Estás en tu <strong>cuenta real</strong>: las órdenes usan dinero real.</p>
      ) : (
        <p className="mode-note demo">🧪 Estás en <strong>Demo</strong>: practicas con dinero simulado, sin riesgo.</p>
      )}

      <nav className="menu">
        <button className={view === "portafolio" ? "on" : ""} onClick={() => setView("portafolio")}>
          💼 Mi portafolio
        </button>
        <button
          className={view === "invertir" ? "on" : ""}
          onClick={() => {
            setView("invertir");
            setSelected(null);
          }}
        >
          📈 Invertir
        </button>
      </nav>

      {error && <p className="error banner">{error}</p>}

      {/* ---------------- MI PORTAFOLIO ---------------- */}
      {view === "portafolio" && (
        <>
          <p className="hello">
            {greeting()}, <strong>{userName}</strong>
          </p>

          <section className="card summary">
            <span className="muted">Valor total del portafolio</span>
            <div className="big mono">{usd(account?.equity)}</div>
            <div className="mono muted">≈ {cop(account?.equity, rate)}</div>
            <div className={`mono ${account?.day_change >= 0 ? "up" : "down"}`}>
              {usd(account?.day_change)} ({pct(account?.day_change_pct)}) hoy · {cop(account?.day_change, rate)}
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
                <span className="muted">Invertido</span>
                <span className="mono">{usd(invested)}</span>
                <span className="mono muted small">{cop(invested, rate)}</span>
              </div>
              <div>
                <span className="muted">Ganancia total</span>
                <span className={`mono ${totalPl >= 0 ? "up" : "down"}`}>{usd(totalPl)}</span>
                <span className={`mono small ${totalPl >= 0 ? "up" : "down"}`}>
                  {cost > 0 ? pct((totalPl / cost) * 100) : "—"}
                </span>
              </div>
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
            </div>
            <p className="muted small">
              {rate
                ? `Tasa de referencia: 1 USD = ${cop(1, rate)} · ${new Date(fx.updated).toLocaleDateString("es-CO")}`
                : "Cargando tasa USD/COP…"}
            </p>
          </section>

          <div className="grid">
            <div className="col">
              <Positions positions={positions} rate={rate} onSelect={openAsset} />
              <Orders orders={orders} onChange={refresh} />
            </div>
            <div className="col">
              <Allocation positions={positions} cash={account?.cash} rate={rate} />
              <section className="card">
                <h2>Límites de seguridad</h2>
                <div className="stats">
                  <div>
                    <span className="muted">Comprado hoy</span>
                    <span className="mono">
                      {usd(account?.spent_today, 0)} / {usd(account?.max_daily_usd, 0)}
                    </span>
                  </div>
                  <div>
                    <span className="muted">Máx. por orden</span>
                    <span className="mono">{usd(me.max_order_usd, 0)}</span>
                  </div>
                </div>
              </section>
              {!live && <DemoReset onDone={refresh} />}
              <button className="btn primary full-btn" onClick={() => setView("invertir")}>
                📈 Ir a invertir
              </button>
            </div>
          </div>
        </>
      )}

      {/* ---------------- INVERTIR ---------------- */}
      {view === "invertir" && (
        <div className="grid">
          <div className="col">
            {selected ? (
              <>
                <button className="link back" onClick={() => setSelected(null)}>
                  ← Volver a mercados
                </button>
                <QuotePanel symbol={selected} me={me} rate={rate} onOrderPlaced={refresh} />
              </>
            ) : (
              <Markets rate={rate} onSelect={openAsset} />
            )}
          </div>
          <div className="col">
            <section className="card mini">
              <span className="muted small">Disponible para invertir</span>
              <div className="mono big-2">{usd(account?.buying_power)}</div>
              <div className="mono muted small">≈ {cop(account?.buying_power, rate)}</div>
            </section>
            <Watchlist selected={selected} onSelect={openAsset} />
          </div>
        </div>
      )}

      <footer className="muted small foot">
        Orion Nova Technologies · Operado a través de Alpaca Securities. Invertir implica riesgo de pérdida.
      </footer>
    </div>
  );
}
