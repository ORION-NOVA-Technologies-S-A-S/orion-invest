import { cop, num, pct, usd } from "../api.js";

// Mis posiciones en tarjetas (se leen bien en el celular)
export default function Positions({ positions, rate, onSelect }) {
  return (
    <section className="card">
      <h2>Mis posiciones</h2>
      {positions.length === 0 ? (
        <p className="muted">Aún no tienes posiciones. Cuando se ejecute una compra aparecerá aquí.</p>
      ) : (
        <ul className="ord-list">
          {positions.map((p) => {
            const symbol = p.asset_class === "crypto" ? p.symbol.replace(/USD$/, "/USD") : p.symbol;
            const up = p.unrealized_pl >= 0;
            return (
              <li key={p.symbol} className="ord pos" onClick={() => onSelect(symbol)}>
                <div className="ord-top">
                  <div>
                    <strong className="ord-sym">{symbol}</strong>
                    {p.asset_class === "crypto" && <span className="tag">cripto</span>}
                  </div>
                  <span className={`mono ${up ? "up" : "down"}`}>
                    {up ? "▲" : "▼"} {pct(p.unrealized_plpc)}
                  </span>
                </div>
                <div className="ord-info three">
                  <div>
                    <span className="muted small">Valor</span>
                    <span className="mono">{usd(p.market_value)}</span>
                    <span className="muted small mono">{cop(p.market_value, rate)}</span>
                  </div>
                  <div>
                    <span className="muted small">Ganancia</span>
                    <span className={`mono ${up ? "up" : "down"}`}>{usd(p.unrealized_pl)}</span>
                    <span className="muted small mono">{cop(p.unrealized_pl, rate)}</span>
                  </div>
                  <div>
                    <span className="muted small">Cantidad</span>
                    <span className="mono">{num(p.qty)}</span>
                    <span className="muted small mono">a {usd(p.avg_entry_price)}</span>
                  </div>
                </div>
                <span className="pos-cta small">Ver gráfica en vivo ›</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
