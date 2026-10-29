import { useCallback, useEffect, useState } from "react";
import { api, setMode, supabase } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";

const IDLE_MS = 15 * 60 * 1000; // cierre de sesión por inactividad

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = cargando, null = sin sesión
  const [notice, setNotice] = useState("");

  const loadMe = useCallback(async () => {
    try {
      const [{ data }, info] = await Promise.all([supabase.auth.getUser(), api.me()]);
      // Si quedó elegida la cuenta real pero ya no tiene claves, vuelve a Demo
      if (info.environment === "live" && !info.modes?.live) {
        setMode("paper");
        return window.location.reload();
      }
      setMe({ ...info, email: data.user?.email ?? "" });
      setNotice("");
    } catch (e) {
      if (e.status === 403) {
        setNotice(e.message);
        await supabase.auth.signOut();
      }
      setMe(null);
    }
  }, []);

  const logout = useCallback(async (reason = "") => {
    await supabase.auth.signOut();
    setNotice(reason);
    setMe(null);
  }, []);

  useEffect(() => {
    loadMe();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, [loadMe]);

  // Cierra la sesión si no hay actividad durante 15 minutos
  useEffect(() => {
    if (!me) return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout("Tu sesión se cerró por inactividad. Vuelve a entrar."), IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [me, logout]);

  if (me === undefined) return <div className="splash">Cargando…</div>;
  if (!me) return <Login notice={notice} onLogin={loadMe} />;
  return <Dashboard me={me} onLogout={() => logout()} />;
}
