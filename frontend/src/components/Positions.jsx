import { cop, num, pct, usd } from "../api.js";

export default function Positions({ positions, rate, onSelect }) {
  return (
    <section className="card">
      <h2>Mis posiciones</h2>
      {positions.length === 0 ? (
        <p className="muted">Aún no tienes posiciones.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th>Cantidad</th>
                <th>Precio prom.</th>
                <th>Valor</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} onClick={() => onSelect(p.asset_class === "crypto" ? p.symbol.replace(/USD$/, "/USD") : p.symbol)}>
                  <td className="sym">{p.symbol}</td>
                  <td className="mono">{num(p.qty)}</td>
                  <td className="mono">{usd(p.avg_entry_price)}</td>
                  <td className="mono">
                    {usd(p.market_value)}
                    <br />
                    <small className="muted">{cop(p.market_value, rate)}</small>
                  </td>
                  <td className={`mono ${p.unrealized_pl >= 0 ? "up" : "down"}`}>
                    {usd(p.unrealized_pl)}
                    <br />
                    <small>{pct(p.unrealized_plpc)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
