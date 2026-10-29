import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { AssetIcon } from "../icons.jsx";

const STORE = "orion-nova-chat";
const SUGGESTIONS = [
  "Analiza mi portafolio y dime cómo mejorarlo",
  "¿Qué acciones o ETF de dividendos me recomiendas para tener flujo de caja?",
  "¿Cómo invierto en empresas colombianas desde aquí?",
  "Arma un plan para invertir cada mes según mi perfil",
  "Explícame qué es un ETF y por qué diversificar",
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
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[A-Z0-9./]{1,12}\]\])/g);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
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

export default function NovaChat({ me, onOpenAsset }) {
  const [msgs, setMsgs] = useState(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(undefined);
  const [remaining, setRemaining] = useState(null);
  const end = useRef(null);

  useEffect(() => {
    api.novaProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

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
      const res = await api.nova(next.map(({ role, content }) => ({ role, content })));
      setMsgs([...next, { role: "assistant", content: res.reply }]);
      setRemaining(res.remaining);
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
          <p className="muted small">Tu analista de inversiones con IA · Orion Nova Technologies</p>
        </div>
        {msgs.length > 0 && (
          <button className="link small nova-new" onClick={() => setMsgs([])}>
            Nueva charla
          </button>
        )}
      </div>

      {profile !== undefined && <Profile profile={profile} onSaved={setProfile} />}

      <div className="nova-msgs">
        {msgs.length === 0 && (
          <div className="nova-bubble assistant">
            <p>
              ¡Hola! Soy <strong>NOVA</strong> 👋. Reviso tu portafolio y el mercado en vivo para ayudarte a invertir con buen
              flujo de caja, en Colombia y en el exterior. ¿Por dónde empezamos?
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
            <span>NOVA está analizando el mercado</span>
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
        NOVA analiza y sugiere, pero no compra por ti{me.environment === "live" ? " (estás en tu cuenta REAL)" : ""}. Invertir
        tiene riesgo.{remaining != null && ` · Te quedan ${remaining} mensajes hoy.`}
      </p>
    </section>
  );
}
