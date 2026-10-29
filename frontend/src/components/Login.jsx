import { useState } from "react";
import { api } from "../api.js";

export default function Login({ onLogin, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email.trim(), password);
      setPassword("");
      await onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-wrap">
        <div className="login-hero">
          <span className="brand-mark big-mark">◆</span>
          <h1>Orion Invest</h1>
          <p className="muted">Invierte en Wall Street, bolsas del mundo y cripto, en pesos o dólares.</p>
        </div>

        <form className="card login-card" onSubmit={submit}>
          <h2>Iniciar sesión</h2>
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="username"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <div className="pass">
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="link" onClick={() => setShow((s) => !s)}>
                {show ? "Ocultar" : "Ver"}
              </button>
            </div>
          </label>
          {(error || notice) && <p className="error">{error || notice}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <p className="muted small center">
            🔒 Acceso solo para cuentas autorizadas. La sesión se cierra sola tras 15 minutos sin uso.
          </p>
        </form>

        <p className="muted small center">Orion Nova Technologies</p>
      </div>
    </main>
  );
}
