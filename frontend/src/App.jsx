import { useCallback, useEffect, useState } from "react";
import { api, supabase } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = cargando, null = sin sesión
  const [notice, setNotice] = useState("");

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setNotice("");
    } catch (e) {
      if (e.status === 403) {
        setNotice(e.message);
        await supabase.auth.signOut();
      }
      setMe(null);
    }
  }, []);

  useEffect(() => {
    loadMe();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, [loadMe]);

  if (me === undefined) return <div className="splash">Cargando…</div>;
  if (!me) return <Login notice={notice} onLogin={loadMe} />;
  return <Dashboard me={me} onLogout={() => api.logout()} />;
}
