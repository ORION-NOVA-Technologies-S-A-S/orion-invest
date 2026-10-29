import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { AssetIcon } from "../icons.jsx";

const STORE = "orion-nova-chat";
const SUGGESTIONS = [
  "Analiza mi portafolio",
  "¿Qué me recomiendas comprar?",
  "Dividendos para flujo de caja",
  "¿Cómo invierto en Colombia?",
  "Explícame Apple",
  "¿Cómo aprendiste?",
];
const GOALS = { dividendos: "Dividendos (flujo de caja)", crecimiento: "Crecimiento", equilibrio: "Equilibrio", preservar: "Preservar capital" };
const HORIZONS = { corto: "Corto (< 2 años)", medio: "Medio (2-5 años)", largo: "Largo (5+ años)" };
const RISKS = { bajo: "Bajo", medio: "Medio", alto: "Alto" };

const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE)) || [];
  } catch {
    return [];
  }
};
const save = (msgs) => {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
  } catch {
    /* sin almacenamiento */
  }
};

// Texto de NOVA → párrafos, viñetas, **negritas** y botones [[SÍMBOLO]] (sin HTML crudo)
function inline(text, onOpen, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[A-Z0-9./]{1,12}\]\]|_[^_]+_)/g);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={k} className="muted">{p.slice(1, -1)}</em>;
    const m = p.match(/^\[\[([A-Z0-9./]{1,12})\]\]$/);
    if (m)
      return (
        <button key={k} className="nova-sym" onClick={() => onOpen(m[1])}>
          <AssetIcon symbol={m[1]} size="sm" /> {m[1]}
        </button>
      );
    return <span key={k}>{p}</span>;
  });
}

function Rich({ text, onOpen }) {
  const blocks = [];
  let list = [];
  const flush = (i) => {
    if (list.length) blocks.push(<ul key={`ul${i}`}>{list}</ul>);
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (/^[-•*]\s+/.test(t)) list.push(<li key={i}>{inline(t.replace(/^[-•*]\s+/, ""), onOpen, i)}</li>);
    else {
      flush(i);
      if (t) blocks.push(<p key={i}>{inline(t.replace(/^#+\s*/, ""), onOpen, i)}</p>);
    }
  });
  flush("end");
  return <div className="nova-rich">{blocks}</div>;
}

function Profile({ profile, onSaved }) {
  const [open, setOpen] = useState(!profile);
  const [p, setP] = useState(profile || { goal: "dividendos", horizon: "largo", risk: "medio", monthly_cop: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api.saveNovaProfile({ ...p, monthly_cop: Number(p.monthly_cop) || 0 });
      onSaved(p);
      setOpen(false);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="nova-profile-sum">
        <span className="muted small">
          🎯 {GOALS[profile?.goal] || "Sin objetivo"} · ⏳ {HORIZONS[profile?.horizon] || "—"} · ⚖️ Riesgo {RISKS[profile?.risk] || "—"}
        </span>
        <button className="link small" onClick={() => setOpen(true)}>
          Editar perfil
        </button>
      </div>
    );

  return (
    <form className="nova-profile" onSubmit={submit}>
      <p className="small">
        <strong>Tu perfil de inversionista</strong> — NOVA lo usa para ajustar sus consejos.
      </p>
      <label>
        Objetivo
        <select value={p.goal || ""} onChange={(e) => setP({ ...p, goal: e.target.value })}>
          {Object.entries(GOALS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Plazo
          <select value={p.horizon || ""} onChange={(e) => setP({ ...p, horizon: e.target.value })}>
            {Object.entries(HORIZONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Riesgo
          <select value={p.risk || ""} onChange={(e) => setP({ ...p, risk: e.target.value })}>
            {Object.entries(RISKS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        ¿Cuánto puedes invertir al mes? (COP)
        <input
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Ej: 500000"
          value={p.monthly_cop ?? ""}
          onChange={(e) => setP({ ...p, monthly_cop: e.target.value })}
        />
      </label>
      <label>
        Notas para NOVA (opcional)
        <input
          maxLength={300}
          placeholder="Ej: ya tengo acciones colombianas en trii, quiero dividendos"
          value={p.notes ?? ""}
          onChange={(e) => setP({ ...p, notes: e.target.value })}
        />
      </label>
      {msg && <p className="error">{msg}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Guardando…" : "Guardar perfil"}
      </button>
    </form>
  );
}

function BrainPanel({ brain, training, onTrain, onOpen }) {
  const [open, setOpen] = useState(false);
  if (!brain)
    return (
      <div className="brain">
        <p className="small">
          🧠 <strong>NOVA está estudiando el mercado</strong> por primera vez: practica miles de decisiones con la historia real
          de {"~"}40 activos. Tarda unos segundos…
        </p>
        <div className="brain-bar loading">
          <span />
        </div>
      </div>
    );
  const first = brain.curva[0];
  const last = brain.curva[brain.curva.length - 1];
  const max = Math.max(...brain.curva.map((c) => c.acierto_pct), 60);
  return (
    <div className="brain">
      <button className="brain-head" onClick={() => setOpen((o) => !o)}>
        <span>
          🧠 <strong>Lo que aprendió NOVA</strong>
          <span className="muted small"> · {brain.muestras.toLocaleString("es-CO")} decisiones practicadas</span>
        </span>
        <span className="muted">{open ? "▲" : "▼"}</span>
      </button>
      <div className="brain-kpis">
        <div>
          <span className="muted small">Acierto al empezar</span>
          <strong className="mono">{first.acierto_pct.toFixed(1)} %</strong>
        </div>
        <div>
          <span className="muted small">Tras practicar</span>
          <strong className="mono up">{last.acierto_pct.toFixed(1)} %</strong>
        </div>
        <div>
          <span className="muted small">Examen (datos nuevos)</span>
          <strong className="mono">{brain.examen.acierto_pct.toFixed(1)} %</strong>
        </div>
      </div>
      {open && (
        <>
          <p className="muted small">Cómo mejoró en cada vuelta de práctica (prueba y error):</p>
          <div className="curve">
            {brain.curva.map((c) => (
              <div key={c.vuelta} className="curve-row">
                <span className="small">Vuelta {c.vuelta}</span>
                <span className="curve-track">
                  <span style={{ width: `${(c.acierto_pct / max) * 100}%` }} />
                </span>
                <span className="mono small">{c.acierto_pct.toFixed(1)} %</span>
                <span className="muted small">azar {c.exploracion_pct} %</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Examen con {brain.examen.muestras} decisiones desde {brain.examen.desde} que no vio al practicar: siguiéndola se
            ganaba {brain.examen.ganancia_nova_pct} % por decisión, contra {brain.examen.ganancia_siempre_comprar_pct} % de
            comprar siempre.
          </p>
          <p className="muted small">
            Récord en vivo:{" "}
            {brain.record.total
              ? `${brain.record.aciertos} aciertos de ${brain.record.total} predicciones revisadas`
              : "aún sin resultados (revisa sus predicciones a los 20 días hábiles)"}{" "}
            · {brain.record.pendientes} esperando.
          </p>
        </>
      )}
      {brain.hoy?.length > 0 && (
        <div className="brain-today">
          <span className="muted small">Hoy ve favorable:</span>
          {brain.hoy.map((h) => (
            <button key={h.symbol} className="nova-sym" onClick={() => onOpen(h.symbol)}>
              <AssetIcon symbol={h.symbol} size="sm" /> {h.symbol}
            </button>
          ))}
        </div>
      )}
      <div className="brain-foot">
        <span className="muted small">
          Estudió: {new Date(brain.trained_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </span>
        <button className="link small" onClick={onTrain} disabled={training}>
          {training ? "Estudiando…" : "🔄 Volver a estudiar"}
        </button>
      </div>
    </div>
  );
}

export default function NovaChat({ me, onOpenAsset }) {
  const [msgs, setMsgs] = useState(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(undefined);
  const [brain, setBrain] = useState(null);
  const [training, setTraining] = useState(false);
  const end = useRef(null);

  const loadBrain = () => api.novaBrain().then(setBrain).catch((e) => setError(e.message));
  useEffect(() => {
    api.novaProfile().then(setProfile).catch(() => setProfile(null));
    loadBrain();
  }, []);

  async function retrain() {
    setTraining(true);
    setError("");
    try {
      setBrain(await api.novaTrain());
    } catch (e) {
      setError(e.message);
    } finally {
      setTraining(false);
    }
  }

  useEffect(() => {
    save(msgs);
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError("");
    setInput("");
    const next = [...msgs, { role: "user", content }];
    setMsgs(next);
    setBusy(true);
    try {
      const res = await api.nova(content);
      setMsgs([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setError(e.message);
      setMsgs(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card nova">
      <div className="nova-head">
        <div className="nova-avatar" aria-hidden="true">
          🤖
        </div>
        <div>
          <h2>NOVA</h2>
          <p className="muted small">Aprende sola del mercado por prueba y error · Orion Nova Technologies</p>
        </div>
        {msgs.length > 0 && (
          <button className="link small nova-new" onClick={() => setMsgs([])}>
            Nueva charla
          </button>
        )}
      </div>

      <BrainPanel brain={brain} training={training} onTrain={retrain} onOpen={onOpenAsset} />

      {profile !== undefined && (
        <Profile
          profile={profile}
          onSaved={(p) => {
            setProfile(p);
            loadBrain();
          }}
        />
      )}

      <div className="nova-msgs">
        {msgs.length === 0 && (
          <div className="nova-bubble assistant">
            <p>
              ¡Hola! Soy <strong>NOVA</strong> 👋. Aprendí del mercado yo sola, por prueba y error, y con eso reviso tu
              portafolio para ayudarte a invertir con buen flujo de caja, en Colombia y en el exterior. ¿Por dónde empezamos?
            </p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`nova-bubble ${m.role}`}>
            {m.role === "assistant" ? <Rich text={m.content} onOpen={onOpenAsset} /> : <p>{m.content}</p>}
          </div>
        ))}
        {busy && (
          <div className="nova-bubble assistant typing">
            <span>NOVA está pensando</span>
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={end} />
      </div>

      {msgs.length === 0 && (
        <div className="nova-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip-btn ghost" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <form
        className="nova-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={1}
          maxLength={2000}
          placeholder="Pregúntale a NOVA…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
      <p className="muted small">
        NOVA aconseja con lo que aprendió de la historia, pero no compra por ti
        {me.environment === "live" ? " (estás en tu cuenta REAL)" : ""}. El pasado no garantiza el futuro.
      </p>
    </section>
  );
}
