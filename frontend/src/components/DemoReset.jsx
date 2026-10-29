import { useState } from "react";
import { api } from "../api.js";

// Solo en la cuenta Demo: vende todo, cancela órdenes y deja el saldo en efectivo
export default function DemoReset({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      await api.resetDemo();
      setMsg({ ok: "Listo: se vendieron tus posiciones de prueba y se cancelaron las órdenes." });
      setOpen(false);
      setTimeout(onDone, 1500);
    } catch (e) {
      setMsg({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>🧪 Cuenta Demo</h2>
      <p className="muted small">Practica sin riesgo con dinero simulado. Si quieres empezar de nuevo, reinicia la Demo.</p>
      <button className="btn full-btn" onClick={() => setOpen(true)}>
        🔄 Reiniciar Demo
      </button>
      {msg?.ok && <p className="ok">{msg.ok}</p>}
      {msg?.error && <p className="error">{msg.error}</p>}

      {open && (
        <div className="modal-bg" onClick={() => !busy && setOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Reiniciar cuenta Demo</h3>
            <p className="muted">
              Se <strong>venderán todas tus posiciones de prueba</strong> y se <strong>cancelarán las órdenes pendientes</strong>.
              Todo vuelve a quedar en efectivo simulado.
            </p>
            <p className="muted small">
              Nota: el efectivo queda con lo que hayas ganado o perdido practicando. Para volver exactamente a US$100.000,
              Alpaca exige crear una cuenta Paper nueva desde su página (eso cambia las claves de la Demo).
            </p>
            <div className="row">
              <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn primary" onClick={run} disabled={busy}>
                {busy ? "Reiniciando…" : "Reiniciar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
