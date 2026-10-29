import { useEffect, useState } from "react";

/* global __APP_VERSION__ */
const CURRENT = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

// Revisa cada 2 minutos (y al volver a la app) si se publicó una versión nueva
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (CURRENT === "dev") return;
    const check = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
        const { version } = await r.json();
        if (version && version !== CURRENT) setAvailable(true);
      } catch {
        /* sin conexión: se intenta luego */
      }
    };
    check();
    const id = setInterval(check, 2 * 60000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="update">
      <span>✨ Hay una nueva versión de Orion Invest</span>
      <button className="btn primary" onClick={() => window.location.reload()}>
        Actualizar
      </button>
    </div>
  );
}
