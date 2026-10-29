import { useEffect, useState } from "react";
import { api, cop, num, usd } from "../api.js";
import { AssetIcon } from "../icons.jsx";

const OPEN = ["new", "accepted", "pending_new", "partially_filled", "held"];
const DONE = ["filled"];
const STATUS = {
  filled: "Ejecutada",
  partially_filled: "Parcial",
  new: "Abierta",
  accepted: "Pendiente",
  pending_new: "Pendiente",
  held: "Pendiente",
  canceled: "Cancelada",
  expired: "Vencida",
  rejected: "Rechazada",
};
const FILTERS = [
  { id: "open", label: "Pendientes", test: (o) => OPEN.includes(o.status) },
  { id: "done", label: "Ejecutadas", test: (o) => DONE.includes(o.status) },
  { id: "all", label: "Todas", test: () => true },
];

// "hoy a las 8:30 a. m." / "mañana…" / "lunes…" en hora de Colombia
function whenOpens(iso) {
  if (!iso) return "cuando abra el mercado";
  const d = new Date(iso);
  const now = new Date();
  const day = (x) => x.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  const tomorrow = new Date(now.getTime() + 86400000);
  const time = d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
  const label =
    day(d) === day(now)
      ? "hoy"
      : day(d) === day(tomorrow)
        ? "mañana"
        : d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long" });
  return `${label} a las ${time}`;
}

const shortDate = (iso) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default function Orders({ orders, rate, onChange }) {
  const [error, setError] = useState("");
  const [clock, setClock] = useState(null);
  const [filter, setFilter] = useState("open");
  const [canceling, setCanceling] = useState(null);

  useEffect(() => {
    const load = () => api.clock().then(setClock).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60000);
    return () => clearInterval(id);
  }, []);

  async function cancel(id) {
    setError("");
    setCanceling(id);
    try {
      await api.cancelOrder(id);
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setCanceling(null);
    }
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, orders.filter(f.test).length]));
  const list = orders.filter(FILTERS.find((f) => f.id === filter).test).slice(0, 25);

  return (
    <section className="card">
      <div className="ord-head">
        <h2>Mis órdenes</h2>
        {clock && (
          <span className={`market ${clock.is_open ? "open" : ""}`}>
            {clock.is_open ? "Bolsa abierta" : "Bolsa cerrada"}
          </span>
        )}
      </div>

      <div className="seg three ord-tabs">
        {FILTERS.map((f) => (
          <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {list.length === 0 ? (
        <p className="muted">
          {filter === "open" ? "No tienes órdenes pendientes." : filter === "done" ? "Aún no hay órdenes ejecutadas." : "Sin órdenes todavía."}
        </p>
      ) : (
        <ul className="ord-list">
          {list.map((o) => {
            const pending = OPEN.includes(o.status);
            const waitsMarket = pending && !o.symbol.includes("/") && clock && !clock.is_open;
            const amount = o.notional ? +o.notional : o.filled_avg_price ? +o.qty * +o.filled_avg_price : null;
            return (
              <li key={o.id} className="ord">
                <div className="ord-top">
                  <div className="with-ic">
                    <AssetIcon symbol={o.symbol} size="sm" />
                    <span className={`side ${o.side}`}>{o.side === "buy" ? "Compra" : "Venta"}</span>
                    <strong className="ord-sym">{o.symbol}</strong>
                  </div>
                  <span className={`pill ${o.status}`}>{STATUS[o.status] || o.status}</span>
                </div>

                <div className="ord-info">
                  <div>
                    <span className="muted small">Monto</span>
                    <span className="mono">{o.notional ? usd(+o.notional) : `${num(o.qty)} u.`}</span>
                    {amount != null && <span className="muted small mono">{cop(amount, rate)}</span>}
                  </div>
                  <div>
                    <span className="muted small">{o.filled_avg_price ? "Precio ejecutado" : "Fecha"}</span>
                    <span className="mono">
                      {o.filled_avg_price ? usd(+o.filled_avg_price) : o.submitted_at ? shortDate(o.submitted_at) : "—"}
                    </span>
                  </div>
                </div>

                {waitsMarket && (
                  <p className="ord-wait">⏳ La bolsa está cerrada. Se ejecuta {whenOpens(clock.next_open)} (hora Colombia).</p>
                )}

                {pending && (
                  <button className="btn ghost-danger" onClick={() => cancel(o.id)} disabled={canceling === o.id}>
                    {canceling === o.id ? "Cancelando…" : "Cancelar orden"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {clock && !clock.is_open && (
        <p className="muted small">La bolsa de EE. UU. abre {whenOpens(clock.next_open)} (hora Colombia). Las criptomonedas operan 24/7.</p>
      )}
    </section>
  );
}
