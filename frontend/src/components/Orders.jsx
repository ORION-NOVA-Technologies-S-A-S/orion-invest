import { useState } from "react";
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

export default function Orders({ orders, onChange }) {
  const [error, setError] = useState("");

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
          {orders.slice(0, 25).map((o) => (
            <li key={o.id}>
              <div>
                <span className={o.side === "buy" ? "up" : "down"}>{o.side === "buy" ? "Compra" : "Venta"}</span>{" "}
                <strong>{o.symbol}</strong>
                <div className="muted small">
                  {o.notional ? usd(+o.notional) : `${num(o.qty)} u.`}
                  {o.filled_avg_price && ` · a ${usd(+o.filled_avg_price)}`}
                  {o.submitted_at && ` · ${new Date(o.submitted_at).toLocaleString("es-CO")}`}
                </div>
              </div>
              <div className="right">
                <span className={`pill ${o.status}`}>{STATUS[o.status] || o.status}</span>
                {OPEN.includes(o.status) && (
                  <button className="link" onClick={() => cancel(o.id)}>
                    Cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
