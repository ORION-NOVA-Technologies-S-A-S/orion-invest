import { useMemo, useState } from "react";

// Gráfica de línea en SVG, sin librerías externas.
// points:  [{ t, v }]                      (t = fecha ISO o milisegundos)
// markers: [{ t, v, side: "buy"|"sell" }]  (tus compras y ventas, se dibujan como puntos)
// intraday: muestra la hora en vez de la fecha
export default function LineChart({ points, markers = [], height = 180, intraday = false, format = (v) => v.toFixed(2) }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const pad = 10;

  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;
    const times = points.map((p) => new Date(p.t).getTime());
    const t0 = times[0];
    const t1 = times[times.length - 1];
    // Solo los marcadores que caen dentro del rango de la gráfica
    // Si el marcador no trae valor (v = null), se pone sobre la línea en ese momento
    const nearest = (ms) => {
      let k = 0;
      for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - ms) < Math.abs(times[k] - ms)) k = i;
      return points[k].v;
    };
    const marks = markers
      .map((m) => ({ ...m, ms: new Date(m.t).getTime() }))
      .filter((m) => Number.isFinite(m.ms) && m.ms >= t0 - 60000 && m.ms <= t1 + 15 * 60000)
      .map((m) => ({ ...m, v: m.v > 0 ? m.v : nearest(m.ms) }));
    const vs = [...points.map((p) => p.v), ...marks.map((m) => m.v)];
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const x = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
    const xt = (ms) => pad + (Math.min(Math.max(ms, t0), t1) - t0) / ((t1 - t0) || 1) * (W - pad * 2);
    const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${x(points.length - 1)},${H}L${x(0)},${H}Z`;
    const up = points[points.length - 1].v >= points[0].v;
    return { x, xt, y, line, area, up, marks, times };
  }, [points, markers, H]);

  if (!geo) return <div className="chart-empty muted">Sin datos suficientes para graficar</div>;

  const color = geo.up ? "var(--up)" : "var(--down)";
  const active = hover != null ? points[hover] : null;
  const last = points[points.length - 1];

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  const when = (t) =>
    intraday
      ? new Date(t).toLocaleString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })
      : new Date(t).toLocaleDateString("es-CO");

  return (
    <div className="chart">
      <div className="chart-tip">
        {active ? (
          <>
            <strong>{format(active.v)}</strong> <span className="muted">{when(active.t)}</span>
          </>
        ) : (
          <span className="muted">Desliza sobre la gráfica</span>
        )}
      </div>
      <div className="chart-box">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) onMove({ clientX: t.clientX, currentTarget: e.currentTarget });
          }}
          onMouseLeave={() => setHover(null)}
          onTouchEnd={() => setHover(null)}
          role="img"
          aria-label="Gráfica de precio"
        >
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill="url(#fill)" />
          <path d={geo.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {active && <line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} stroke="var(--line)" vectorEffect="non-scaling-stroke" />}
        </svg>

        {/* Puntos en HTML para que se vean redondos aunque la gráfica se estire */}
        {active && (
          <span className="dot-pt" style={{ left: `${(geo.x(hover) / W) * 100}%`, top: `${(geo.y(active.v) / H) * 100}%`, background: color }} />
        )}
        {!active && (
          <span className="dot-pt live" style={{ left: `${(geo.x(points.length - 1) / W) * 100}%`, top: `${(geo.y(last.v) / H) * 100}%`, background: color }} />
        )}
        {geo.marks.map((m, i) => (
          <span
            key={i}
            className={`trade-pt ${m.side}`}
            style={{ left: `${(geo.xt(m.ms) / W) * 100}%`, top: `${(geo.y(m.v) / H) * 100}%` }}
            title={`${m.side === "buy" ? "Compraste" : "Vendiste"} a ${format(m.v)}`}
          >
            {m.side === "buy" ? "C" : "V"}
          </span>
        ))}
      </div>
    </div>
  );
}
