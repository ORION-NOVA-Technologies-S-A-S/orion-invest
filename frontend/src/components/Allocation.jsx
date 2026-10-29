import { cop, usd } from "../api.js";

// Distribución del portafolio: acciones/ETF, cripto y efectivo
export default function Allocation({ positions, cash, rate }) {
  const stocks = positions.filter((p) => p.asset_class !== "crypto").reduce((s, p) => s + p.market_value, 0);
  const crypto = positions.filter((p) => p.asset_class === "crypto").reduce((s, p) => s + p.market_value, 0);
  const money = Math.max(Number(cash) || 0, 0);
  const total = stocks + crypto + money;

  const parts = [
    { label: "Acciones y ETF", value: stocks, color: "var(--accent)" },
    { label: "Cripto", value: crypto, color: "var(--warn)" },
    { label: "Efectivo", value: money, color: "var(--up)" },
  ];

  return (
    <section className="card">
      <h2>Distribución</h2>
      {total <= 0 ? (
        <p className="muted">Cuando tengas saldo o inversiones, verás aquí cómo está repartido tu dinero.</p>
      ) : (
        <>
          <div className="alloc-bar" role="img" aria-label="Distribución del portafolio">
            {parts.map((p) =>
              p.value > 0 ? <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null
            )}
          </div>
          <ul className="alloc-list">
            {parts.map((p) => (
              <li key={p.label}>
                <span className="sw" style={{ background: p.color }} />
                <span>{p.label}</span>
                <span className="mono">{((p.value / total) * 100).toFixed(1)}%</span>
                <span className="mono right">
                  {usd(p.value)}
                  <br />
                  <small className="muted">{cop(p.value, rate)}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
