import { useState } from "react";
import { setMode } from "../api.js";

// Selector de cuenta: 🧪 Demo (dinero simulado) / 💰 Cuenta real (dinero real)
export default function ModeSwitch({ me }) {
  const live = me.environment === "live";
  const [ask, setAsk] = useState(null); // null | "confirm" | "missing"
  const [typed, setTyped] = useState("");

  const change = (mode) => {
    setMode(mode);
    window.location.reload(); // recarga todo con la otra cuenta
  };

  const wantLive = () => {
    if (live) return;
    setTyped("");
    setAsk(me.modes?.live ? "confirm" : "missing");
  };

  return (
    <>
      <div className="mode">
        <button className={!live ? "on demo" : ""} onClick={() => live && change("paper")}>
          🧪 Demo
        </button>
        <button className={live ? "on real" : ""} onClick={wantLive}>
          💰 Cuenta real
        </button>
      </div>

      {ask && (
        <div className="modal-bg" onClick={() => setAsk(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            {ask === "missing" ? (
              <>
                <h3>Cuenta real aún no activada</h3>
                <p className="muted">
                  Para invertir dinero real necesitas tu cuenta <strong>Live</strong> aprobada en Alpaca y sus claves API
                  configuradas en Orion Invest. Mientras tanto puedes practicar en <strong>Demo</strong> con dinero
                  simulado.
                </p>
                <ol className="muted small steps">
                  <li>En Alpaca toca <strong>Open Live Account</strong> → <strong>Individual Account</strong> y completa la verificación.</li>
                  <li>Cuando te aprueben, cambia a la cuenta Live y genera sus <strong>API Keys</strong>.</li>
                  <li>Configúralas en Orion Invest (claves Live, separadas de las de Demo).</li>
                </ol>
                <button className="btn primary" onClick={() => setAsk(null)}>
                  Entendido
                </button>
              </>
            ) : (
              <>
                <h3>Cambiar a cuenta real</h3>
                <p className="badge live">DINERO REAL</p>
                <p className="muted">
                  Las compras y ventas usarán tu dinero real en Alpaca. Los límites de seguridad siguen activos y cada orden
                  te pedirá confirmación.
                </p>
                <label>
                  Escribe <strong>REAL</strong> para continuar
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
                </label>
                <div className="row">
                  <button className="btn" onClick={() => setAsk(null)}>
                    Cancelar
                  </button>
                  <button
                    className="btn sell"
                    disabled={typed.trim().toUpperCase() !== "REAL"}
                    onClick={() => change("live")}
                  >
                    Usar cuenta real
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
