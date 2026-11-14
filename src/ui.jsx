import { fmt } from "./data.js";

export function Badge({ status }) {
  return <span className={`badge ${status}`}><i />{status.toUpperCase()}</span>;
}

export function Chip({ active, children, onClick }) {
  return <button className={`chip ${active ? "on" : ""}`} onClick={onClick}>{children}</button>;
}

/** Grafik garis sederhana (SVG) untuk satu seri, dengan garis ambang dan penanda waktu sekarang. */
export function LineChart({ t, y, upto, thresholds = [], unit = "cm", height = 190, zeroAt = 0 }) {
  const W = 368, H = height, L = 36, R = 10, T = 12, B = 26;
  const xs = t.slice(0, upto + 1), ys = y.slice(0, upto + 1);
  const all = [...y, ...thresholds.map((h) => h.v), 0];
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const X = (v) => L + ((v - t[0]) / (t[t.length - 1] - t[0])) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = xs.map((v, i) => `${X(v).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" ");
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Grafik pergeseran">
      {ticks.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={4} y={Y(v) + 4} className="ax">{fmt(v)}</text></g>)}
      {thresholds.map((h) => <line key={h.v} x1={L} x2={W - R} y1={Y(h.v)} y2={Y(h.v)} stroke={h.c} strokeDasharray="5 4" strokeWidth="1.5" />)}
      <line x1={X(zeroAt)} x2={X(zeroAt)} y1={T} y2={H - B} className="t0" />
      <polyline points={pts} fill="none" stroke="#1479BB" strokeWidth="2" strokeLinejoin="round" />
      {xs.length > 0 && <circle cx={X(xs[xs.length - 1])} cy={Y(ys[ys.length - 1])} r="4" fill="#1479BB" stroke="#fff" strokeWidth="2" />}
      <text x={L} y={H - 6} className="ax">{t[0]} dtk</text>
      <text x={X(zeroAt) + 4} y={T + 10} className="ax strong">gempa</text>
      <text x={W - R} y={H - 6} className="ax" textAnchor="end">+{t[t.length - 1]} dtk · {unit}</text>
    </svg>
  );
}
