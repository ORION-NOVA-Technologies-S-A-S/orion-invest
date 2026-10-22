import { useEffect, useState } from "react";
import { api } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = cargando, null = sin sesión

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="splash">Cargando…</div>;
  if (!me) return <Login onLogin={() => api.me().then(setMe)} />;
  return <Dashboard me={me} onLogout={() => api.logout().finally(() => setMe(null))} />;
}
