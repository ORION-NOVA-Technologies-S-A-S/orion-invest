import { useMemo, useState } from "react";

// Gráfica de línea en SVG, sin librerías externas. points: [{ t, v }]
export default function LineChart({ points, height = 180, format = (v) => v.toFixed(2) }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const pad = 8;

  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;
    const vs = points.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const x = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${x(points.length - 1)},${H}L${x(0)},${H}Z`;
    const up = points[points.length - 1].v >= points[0].v;
    return { x, y, line, area, up };
  }, [points, H]);

  if (!geo) return <div className="chart-empty muted">Sin datos suficientes para graficar</div>;

  const color = geo.up ? "var(--up)" : "var(--down)";
  const active = hover != null ? points[hover] : null;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  return (
    <div className="chart">
      <div className="chart-tip">
        {active ? (
          <>
            <strong>{format(active.v)}</strong>{" "}
            <span className="muted">{new Date(active.t).toLocaleDateString("es-CO")}</span>
          </>
        ) : (
          <span className="muted">Desliza sobre la gráfica</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) onMove({ clientX: t.clientX, currentTarget: e.currentTarget });
        }}
        onMouseLeave={() => setHover(null)}
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
        {active && (
          <>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
            <circle cx={geo.x(hover)} cy={geo.y(active.v)} r="4" fill={color} />
          </>
        )}
      </svg>
    </div>
  );
}
