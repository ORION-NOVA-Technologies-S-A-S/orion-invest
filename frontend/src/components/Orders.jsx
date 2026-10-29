import { useEffect, useState } from "react";
import { api, num, usd } from "../api.js";

const OPEN = ["new", "accepted", "pending_new", "partially_filled", "held"];
const STATUS = {
  filled: "Ejecutada",
  partially_filled: "Parcial",
  new: "Abierta",
  accepted: "Aceptada",
  pending_new: "Pendiente",
  canceled: "Cancelada",
  expired: "Vencida",
  rejected: "Rechazada",
};

// "mañana 8:30 a. m." / "lunes 8:30 a. m." en hora de Colombia
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
  return `${label} a las ${time} (hora Colombia)`;
}

export default function Orders({ orders, onChange }) {
  const [error, setError] = useState("");
  const [clock, setClock] = useState(null);

  useEffect(() => {
    const load = () => api.clock().then(setClock).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60000);
    return () => clearInterval(id);
  }, []);

  async function cancel(id) {
    setError("");
    try {
      await api.cancelOrder(id);
      onChange();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="card">
      <h2>Órdenes recientes</h2>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 ? (
        <p className="muted">Sin órdenes todavía.</p>
      ) : (
        <ul className="orders">
          {orders.slice(0, 25).map((o) => {
            const pending = OPEN.includes(o.status);
            const waitsMarket = pending && !o.symbol.includes("/") && clock && !clock.is_open;
            return (
              <li key={o.id}>
                <div>
                  <span className={o.side === "buy" ? "up" : "down"}>{o.side === "buy" ? "Compra" : "Venta"}</span>{" "}
                  <strong>{o.symbol}</strong>
                  <div className="muted small">
                    {o.notional ? usd(+o.notional) : `${num(o.qty)} u.`}
                    {o.filled_avg_price && ` · a ${usd(+o.filled_avg_price)}`}
                    {o.submitted_at && ` · ${new Date(o.submitted_at).toLocaleString("es-CO")}`}
                  </div>
                  {waitsMarket && (
                    <div className="wait small">
                      ⏳ La bolsa está cerrada. Se ejecuta {whenOpens(clock.next_open)}.
                    </div>
                  )}
                </div>
                <div className="right">
                  <span className={`pill ${o.status}`}>{STATUS[o.status] || o.status}</span>
                  {pending && (
                    <button className="link" onClick={() => cancel(o.id)}>
                      Cancelar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {clock && (
        <p className="muted small">
          Bolsa de EE. UU.: {clock.is_open ? "🟢 abierta" : `🔴 cerrada · abre ${whenOpens(clock.next_open)}`}. Las
          criptomonedas operan 24/7.
        </p>
      )}
    </section>
  );
}
