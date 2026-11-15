// Laporan sensor (PDF): daftar sensor + koordinat, lalu grafik & pergeseran tiap sensor.
// Laporan dibuat di iframe tersembunyi lalu dicetak; pengguna memilih "Simpan sebagai PDF".
import { keUTM } from "./gnss/utm.js";
import { fmt, fmtSigned } from "./data.js";
import jks400 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2?url";
import jks600 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2?url";
import jks700 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2?url";
import jks800 from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2?url";
import mono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url";

const RAD = Math.PI / 180;
const WARNA = { e: "#1479BB", n: "#7A4FD0", u: "#0F9D8A", hz: "#1479BB", aman: "#1E8A5A", waspada: "#B86B00", bahaya: "#C8323A" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? "–" : v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fs = (v, d = 1) => (v == null ? "–" : (v >= 0 ? "+" : "−") + f(Math.abs(v), d));
const badge = (st) => `<span class="bd ${st}">${st.toUpperCase()}</span>`;

// ---------------------------------------------------------------- tangkapan 3D
/** Bingkai kamera ke seluruh jembatan, render sekali, potong kanvas ke jembatan + pin sensor, lalu kembalikan kamera. */
export async function tangkapJembatan(viewer, aset) {
  if (!viewer || viewer.isDestroyed?.()) return null;
  const { BoundingSphere, Cartesian3, HeadingPitchRange, Math: CM, Matrix4 } = await import("@cesium/engine");
  const scene = viewer.scene, cam = viewer.camera, canvas = scene.canvas;
  const simpan = { destination: cam.positionWC.clone(), orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll } };
  try {
    cam.cancelFlight?.();
    const pusat = Cartesian3.fromDegrees(110.31540, -7.98946, 10);
    cam.viewBoundingSphere(new BoundingSphere(pusat, 150), new HeadingPitchRange(CM.toRadians(-55), CM.toRadians(-24), 470));
    cam.lookAtTransform(Matrix4.IDENTITY);
    // beberapa frame agar model, pin, dan label selesai digambar di posisi kamera baru
    for (let k = 0; k < 4; k++) { scene.render(); await new Promise((r) => requestAnimationFrame(r)); }
    scene.render();
    // titik-titik yang wajib masuk bingkai: kedua ujung jembatan + setiap sensor (dengan ruang untuk pin di atasnya)
    const m = aset.model, hd = (m.heading_deg || 0) * RAD, L = 284;
    const ujungU = { lat: m.lat + (L * Math.cos(hd)) / 110574, lon: m.lon + (L * Math.sin(hd)) / (111320 * Math.cos(m.lat * RAD)) };
    const titik = [[m.lat, m.lon, 0], [ujungU.lat, ujungU.lon, 0], ...aset.sensor.map((s) => [s.lat, s.lon, (s.h_lokal_m || 0) + 4])];
    const sx = canvas.width / canvas.clientWidth, sy = canvas.height / canvas.clientHeight;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [la, lo, h] of titik) {
      const p = scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(lo, la, h));
      if (!p) continue;
      x0 = Math.min(x0, p.x * sx); x1 = Math.max(x1, p.x * sx); y0 = Math.min(y0, p.y * sy); y1 = Math.max(y1, p.y * sy);
    }
    const src = canvas.toDataURL("image/png");   // harus langsung setelah render (buffer WebGL belum dibersihkan)
    const img = new Image(); img.src = src; await img.decode();
    if (!Number.isFinite(x0)) return src;
    // ruang tambahan: pin sensor ±70 px di atas titiknya, label, dan tepi
    const padX = (x1 - x0) * 0.08 + 40 * sx, padTop = 90 * sy, padBot = 50 * sy;
    let cx0 = Math.max(0, x0 - padX), cx1 = Math.min(canvas.width, x1 + padX);
    let cy0 = Math.max(0, y0 - padTop), cy1 = Math.min(canvas.height, y1 + padBot);
    // rasio minimal 2:1 agar pas di halaman A4
    const minH = (cx1 - cx0) / 2.2;
    if (cy1 - cy0 < minH) { const c = (cy0 + cy1) / 2; cy0 = Math.max(0, c - minH / 2); cy1 = Math.min(canvas.height, c + minH / 2); }
    const out = document.createElement("canvas"); out.width = cx1 - cx0; out.height = cy1 - cy0;
    out.getContext("2d").drawImage(img, cx0, cy0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.92);
  } finally {
    cam.setView(simpan); scene.requestRender();
  }
}

// ---------------------------------------------------------------- grafik SVG
function ticks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => span / s <= n) || 10 * p;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return { out, step };
}
function grafik({ seri, x, xlabel, ylabel, ambang = [], vline = null, W = 680, H = 150, judul }) {
  const L = 52, R = 14, T = judul ? 26 : 12, B = 34;
  const ys = seri.flatMap((s) => s.y.filter((v) => v != null && Number.isFinite(v)));
  let lo = Math.min(0, ...ys, ...ambang.map((a) => a.v)), hi = Math.max(0, ...ys, ...ambang.map((a) => a.v));
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const xa = x[0], xb = x[x.length - 1] === xa ? xa + 1 : x[x.length - 1];
  const X = (v) => L + ((v - xa) / (xb - xa)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ty = ticks(lo, hi, 4), tx = ticks(xa, xb, 8);
  const dy = ty.step < 0.01 ? 3 : ty.step < 0.1 ? 2 : ty.step < 1 ? 1 : 0, dx = tx.step < 1 ? 1 : 0;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="gr">`;
  if (judul) s += `<text x="${L}" y="14" class="gt">${esc(judul)}</text>`;
  for (const v of ty.out) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gg"/><text x="${L - 6}" y="${Y(v) + 3.5}" class="ga" text-anchor="end">${f(v, dy)}</text>`;
  for (const v of tx.out) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - B}" y2="${H - B + 4}" stroke="#AAB4C2"/><text x="${X(v)}" y="${H - B + 15}" class="ga" text-anchor="middle">${f(v, dx)}</text>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#C9D2DD"/>`;
  for (const a of ambang) s += `<line x1="${L}" x2="${W - R}" y1="${Y(a.v)}" y2="${Y(a.v)}" stroke="${a.c}" stroke-dasharray="6 4" stroke-width="1.2"/><text x="${W - R - 2}" y="${Y(a.v) - 3}" class="ga" text-anchor="end" fill="${a.c}">${esc(a.label)}</text>`;
  if (vline != null && vline >= xa && vline <= xb) s += `<line x1="${X(vline)}" x2="${X(vline)}" y1="${T}" y2="${H - B}" stroke="#C8323A" stroke-dasharray="2 3"/><text x="${X(vline) + 4}" y="${T + 9}" class="ga" fill="#C8323A">awal gempa</text>`;
  for (const sr of seri) {
    let d = "", pen = false;
    sr.y.forEach((v, k) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(x[k]).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true;
    });
    if (sr.isi) s += `<path d="${d}L${X(x[x.length - 1]).toFixed(1)} ${Y(0)}L${X(x[0]).toFixed(1)} ${Y(0)}Z" fill="${sr.c}" opacity=".10"/>`;
    s += `<path d="${d}" fill="none" stroke="${sr.c}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  let lx = L + 4;
  if (seri.length > 1) for (const sr of seri) { s += `<rect x="${lx}" y="${H - 11}" width="12" height="3" fill="${sr.c}"/><text x="${lx + 16}" y="${H - 7}" class="ga">${esc(sr.label)}</text>`; lx += 92; }
  s += `<text x="${W - R}" y="${H - 4}" class="ga" text-anchor="end">${esc(xlabel)}</text>`;
  s += `<text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" class="ga" text-anchor="middle">${esc(ylabel)}</text></svg>`;
  return s;
}

// ---------------------------------------------------------------- data per sensor
/** Seri waktu yang dipakai laporan = data yang sedang tampil di menu Sensor. */
function ambilSeri({ data, i, mode, asli }, s) {
  const T = data.skenario.waktu_s, t0idx = Math.max(1, T.indexOf(0));
  const akhir = mode === "gempa" ? i : t0idx - 1;          // normal: data sebelum gempa; gempa: sampai waktu replay
  const sl = (a) => (a ? a.slice(0, akhir + 1) : null);
  if (s.id === "GNSS-2T" && asli && mode === "normal") {
    const fix = asli.q.map((q) => q === 1);
    const pilih = (a) => a.map((v, k) => (fix[k] ? v / 10 : null));   // mm → cm, hanya solusi fix
    return { x: asli.t.map((v) => v / 3600), xlabel: `jam GPST · data asli ${asli.meta?.rover?.kode || ""} (RTKLIB)`, vline: null,
      dE: pilih(asli.de), dN: pilih(asli.dn), dU: pilih(asli.du), sumber: "asli" };
  }
  const seri = data.skenario.sensor[s.id] || {};
  return { x: T.slice(0, akhir + 1), xlabel: mode === "gempa" ? "detik relatif awal gempa" : "detik (data contoh sebelum gempa)",
    vline: mode === "gempa" ? 0 : null, dE: sl(seri.dE), dN: sl(seri.dN), dU: sl(seri.dU), a_g: sl(seri.a_g), deg: sl(seri.deg), sumber: "skenario" };
}
const absMax = (a) => a.reduce((m, v) => (v != null && Math.abs(v) > Math.abs(m) ? v : m), 0);
const last = (a) => { for (let k = a.length - 1; k >= 0; k--) if (a[k] != null) return a[k]; return null; };
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };

function koordinat(s) {
  const u = keUTM(s.lat * RAD, s.lon * RAD, 49);
  return { ...u, lat: s.lat, lon: s.lon };
}

// ---------------------------------------------------------------- HTML laporan
function blokSensor(ctx, s, nomor) {
  const { data } = ctx;
  const sr = ambilSeri(ctx, s), k = koordinat(s);
  const amb = data.aset.ambang.geser_perletakan_cm;
  const kepala = `<div class="sh"><div><span class="no">${nomor}</span><b>${esc(s.id)}</b><small>${esc(s.jenis)} · ${esc(s.keterangan)} · komponen ${esc(s.komponen)}${s.base ? ` · base ${esc(s.base)}` : ""}</small></div>${badge(s.status)}</div>
  <div class="kv4"><div><span>Lintang / Bujur</span><b>${f(k.lat, 7)}° / ${f(k.lon, 7)}°</b></div><div><span>UTM 49S E</span><b>${f(k.E, 3)} m</b></div><div><span>UTM 49S N</span><b>${f(k.N, 3)} m</b></div><div><span>Tinggi lokal</span><b>${f(s.h_lokal_m, 2)} m</b></div></div>`;
  if (s.jenis === "GNSS" && sr.dE) {
    const hz = sr.dE.map((e, k2) => (e == null || sr.dN[k2] == null ? null : Math.hypot(e, sr.dN[k2])));
    const g1 = grafik({ judul: "Pergeseran per komponen (cm)", x: sr.x, xlabel: sr.xlabel, ylabel: "cm", vline: sr.vline,
      seri: [{ y: sr.dE, c: WARNA.e, label: "ΔE timur" }, { y: sr.dN, c: WARNA.n, label: "ΔN utara" }, { y: sr.dU, c: WARNA.u, label: "ΔU tinggi" }] });
    const g2 = grafik({ judul: "Pergeseran horizontal terhadap ambang (cm)", x: sr.x, xlabel: sr.xlabel, ylabel: "cm", vline: sr.vline, H: 118,
      ambang: [{ v: amb.waspada, c: WARNA.waspada, label: `waspada ${f(amb.waspada)} cm` }, { v: amb.bahaya, c: WARNA.bahaya, label: `bahaya ${f(amb.bahaya)} cm` }],
      seri: [{ y: hz, c: WARNA.hz, label: "horizontal", isi: true }] });
    const kini = s.nilai || {};
    const tabel = `<table class="tp"><thead><tr><th>Pergeseran (cm)</th><th>ΔE timur</th><th>ΔN utara</th><th>ΔU tinggi</th><th>Horizontal</th></tr></thead><tbody>
      <tr><td>Nilai saat laporan dibuat</td><td>${fs(kini.dE ?? last(sr.dE))}</td><td>${fs(kini.dN ?? last(sr.dN))}</td><td>${fs(kini.dU ?? last(sr.dU))}</td><td><b>${f(kini.hz ?? last(hz))}</b></td></tr>
      <tr><td>Nilai ekstrem</td><td>${fs(absMax(sr.dE))}</td><td>${fs(absMax(sr.dN))}</td><td>${fs(absMax(sr.dU))}</td><td><b>${f(Math.max(0, ...hz.filter((v) => v != null)))}</b></td></tr>
      <tr><td>Rata-rata</td><td>${fs(mean(sr.dE))}</td><td>${fs(mean(sr.dN))}</td><td>${fs(mean(sr.dU))}</td><td>${f(mean(hz))}</td></tr></tbody></table>`;
    return `<section class="sb gnss">${kepala}<div class="g">${g1}</div><div class="g">${g2}</div>${tabel}</section>`;
  }
  const isA = !!sr.a_g, y = isA ? sr.a_g : sr.deg, sat = isA ? "g" : "°", d = isA ? 3 : 3;
  const amK = data.aset.ambang.pilar_kemiringan_deg;
  if (!y) return `<section class="sb">${kepala}<p class="mut">Belum ada data.</p></section>`;
  const g = grafik({ judul: isA ? "Percepatan (g)" : "Kemiringan (°)", x: sr.x, xlabel: sr.xlabel, ylabel: sat, vline: sr.vline, H: 125,
    ambang: !isA && amK ? [{ v: amK.waspada, c: WARNA.waspada, label: `waspada ${f(amK.waspada)}°` }, { v: amK.bahaya, c: WARNA.bahaya, label: `bahaya ${f(amK.bahaya)}°` }] : [],
    seri: [{ y, c: isA ? WARNA.aman : WARNA.waspada, label: isA ? "percepatan" : "kemiringan" }] });
  const tabel = `<table class="tp"><thead><tr><th>${isA ? "Percepatan" : "Kemiringan"} (${sat})</th><th>Saat laporan dibuat</th><th>Nilai ekstrem</th><th>Rata-rata</th></tr></thead><tbody>
    <tr><td>${isA ? "a" : "θ"}</td><td>${fs(last(y), d)}</td><td><b>${fs(absMax(y), d)}</b></td><td>${fs(mean(y), d)}</td></tr></tbody></table>`;
  return `<section class="sb">${kepala}<div class="g">${g}</div>${tabel}</section>`;
}

export function buatHTMLLaporan(ctx, gambar) {
  const { data, st, mode, asli } = ctx;
  const sekarang = new Date();
  const tgl = sekarang.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
  const no = `GT-SNS-${sekarang.toISOString().slice(0, 10).replace(/-/g, "")}-${sekarang.toTimeString().slice(0, 5).replace(":", "")}`;
  const kondisi = mode === "gempa"
    ? `Replay ${esc(data.skenario.meta.nama)} · t ${st.t >= 0 ? "+" : ""}${st.t} dtk`
    : asli ? `Kondisi normal · GNSS-2T memutar data asli ${esc(asli.meta?.rover?.kode || "")} (RTKLIB)` : "Kondisi normal (data contoh)";
  const n = (j) => st.sensors.filter((s) => s.jenis === j).length;
  const baris = st.sensors.map((s) => {
    const k = koordinat(s);
    const v = s.nilai?.hz != null ? `${f(s.nilai.hz)} cm` : s.nilai?.a_g != null ? `${f(Math.abs(s.nilai.a_g), 3)} g` : s.nilai?.deg != null ? `${f(s.nilai.deg, 3)}°` : "–";
    return `<tr><td><b>${esc(s.id)}</b></td><td>${esc(s.jenis)}</td><td>${esc(s.komponen)}</td><td class="sm">${esc(s.keterangan)}</td>
      <td class="mo">${f(k.lat, 7)}<br>${f(k.lon, 7)}</td><td class="mo r">${f(k.E, 3)}<br>${f(k.N, 3)}</td><td class="mo r">${f(s.h_lokal_m, 2)}</td><td class="mo r">${v}</td><td>${badge(s.status)}</td></tr>`;
  }).join("");
  const urut = [...st.sensors];
  const detail = urut.map((s, k) => blokSensor(ctx, s, k + 1)).join("");
  const amb = data.aset.ambang;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Sensor GNSSTwin ${sekarang.toISOString().slice(0, 10)}</title><style>
@font-face{font-family:J;src:url(${new URL(jks400, location.href)});font-weight:400}
@font-face{font-family:J;src:url(${new URL(jks600, location.href)});font-weight:600}
@font-face{font-family:J;src:url(${new URL(jks700, location.href)});font-weight:700}
@font-face{font-family:J;src:url(${new URL(jks800, location.href)});font-weight:800}
@font-face{font-family:M;src:url(${new URL(mono500, location.href)});font-weight:500}
@page{size:A4;margin:13mm 12mm 15mm;@bottom-left{content:"GNSSTwin · Laporan Sensor ${no}";font:7pt J,sans-serif;color:#8590A6}@bottom-right{content:"Halaman " counter(page) " / " counter(pages);font:7pt J,sans-serif;color:#8590A6}}
*{box-sizing:border-box}body{margin:0;font:8.5pt J,system-ui,sans-serif;color:#1B1E3D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1479BB;padding-bottom:3mm}
.br{display:flex;gap:8px;align-items:center}.br svg{width:30px;height:30px}.br b{display:block;font-size:13pt;font-weight:800;color:#25245A}.br small{color:#566079;font-size:7.5pt}
.meta{text-align:right;font-size:7.5pt;color:#566079;line-height:1.45}
h1{font-size:17pt;font-weight:800;color:#25245A;margin:4mm 0 1mm}h2{font-size:10.5pt;font-weight:700;color:#25245A;margin:5mm 0 2mm}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm 5mm;background:#F3F5F8;border-radius:6px;padding:3mm 4mm;margin:3mm 0}
.kv span,.kv4 span{display:block;font-size:6.8pt;color:#566079}.kv b{font-weight:600;font-size:8.3pt}
.fig img{width:100%;display:block;border:1px solid #DDE3EA;border-radius:6px}.cap{font-size:7pt;color:#566079;margin-top:1.5mm}
.bd{display:inline-block;font-size:6.6pt;font-weight:700;letter-spacing:.05em;padding:2px 7px;border-radius:99px;white-space:nowrap}
.bd.aman{color:#1E8A5A;background:#E4F4EC}.bd.waspada{color:#B86B00;background:#FCF1DC}.bd.bahaya{color:#C8323A;background:#FBE6E7}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:6.8pt;color:#566079;font-weight:700;border-bottom:1.2px solid #DDE3EA;padding:1.3mm 1.5mm}
td{border-bottom:1px solid #EEF1F5;padding:.9mm 1.5mm;font-size:7.3pt;vertical-align:middle}td:first-child{white-space:nowrap}.r{text-align:right}.sm{font-size:6.7pt;color:#566079}
.mo{font-family:M,ui-monospace,monospace;font-size:6.8pt}.tl tr{break-inside:avoid}
.fn,.mut{font-size:7pt;color:#566079}
.sb{break-inside:avoid;border:1px solid #DDE3EA;border-radius:8px;padding:2.5mm 4mm;margin:0 0 3.5mm}
.sh{display:flex;justify-content:space-between;align-items:center}.sh b{font-size:11pt;font-weight:800;color:#25245A;margin-right:6px}.sh small{color:#566079;font-size:7.3pt}
.no{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#E8F2FA;color:#1479BB;font-weight:700;font-size:7pt;margin-right:6px}
.kv4{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:3mm;margin:2mm 0;background:#F3F5F8;border-radius:6px;padding:2mm 3mm}.kv4 b{font:500 7.6pt M,monospace}
.gr{width:100%;height:auto;display:block}.gt{font:700 8.5px J,sans-serif;fill:#1B1E3D}.ga{font:8px J,sans-serif;fill:#566079}.gg{stroke:#EDF1F5}
.tp td,.tp th{text-align:right}.tp td:first-child,.tp th:first-child{text-align:left}.tp td{font-family:M,monospace;font-size:7pt}.tp td:first-child{font-family:J,sans-serif}
.pb{break-before:page}
.cat{background:#E8F2FA;border-left:3px solid #1479BB;padding:2.5mm 4mm;border-radius:4px;font-size:7.6pt;margin:3mm 0}
</style></head><body>
<div class="hd"><div class="br">${LOGO}<div><b>GNSSTwin</b><small>Digital Twin Pemantauan Jembatan</small></div></div><div class="meta">No. ${no}<br>Dibuat ${esc(tgl)}</div></div>
<h1>Laporan Data Sensor</h1>
<div class="kv"><div><span>Aset</span><b>${esc(data.aset.nama)}</b></div><div><span>Lokasi</span><b>${esc(data.aset.lokasi)}</b></div><div><span>Tipe</span><b>${esc(data.aset.tipe)}</b></div>
<div><span>Status jembatan</span><b>${badge(st.worst)}</b></div><div><span>Sensor</span><b>${st.sensors.length} (${n("GNSS")} GNSS · ${n("Akselerometer")} akselerometer · ${n("Tiltmeter")} tiltmeter)</b></div><div><span>Data</span><b>${kondisi}</b></div></div>
${gambar ? `<div class="fig"><img src="${gambar}"><div class="cap">Gambar 1. Model 3D ${esc(data.aset.nama)} beserta posisi sensor, ditangkap dari peta GNSSTwin saat laporan dibuat.</div></div>` : ""}
<h2>Daftar sensor dan koordinat</h2>
<table class="tl"><thead><tr><th>ID</th><th>Jenis</th><th>Komp.</th><th>Posisi pemasangan</th><th>Lintang / Bujur (°)</th><th class="r">UTM 49S E / N (m)</th><th class="r">h lokal (m)</th><th class="r">Nilai kini</th><th>Status</th></tr></thead><tbody>${baris}</tbody></table>
<p class="fn">Koordinat geografis WGS84; UTM zona 49S. Nilai kini: GNSS = pergeseran horizontal, akselerometer = percepatan, tiltmeter = kemiringan. Ambang: geser perletakan waspada ${f(amb.geser_perletakan_cm.waspada)} cm / bahaya ${f(amb.geser_perletakan_cm.bahaya)} cm; kemiringan pilar waspada ${f(amb.pilar_kemiringan_deg.waspada)}° / bahaya ${f(amb.pilar_kemiringan_deg.bahaya)}° (${esc(amb.catatan)})</p>
<h2 class="pb">Detail tiap sensor</h2>
${detail}
<div class="cat">Laporan ini dibuat otomatis oleh GNSSTwin (flynndutchman.github.io/GNSSTwin) dari data yang sedang tampil di menu Sensor. Sensor di jembatan masih simulasi${asli && mode === "normal" ? "; sensor GNSS-2T memutar data asli Ina-CORS hasil RTKLIB" : ""}.</div>
</body></html>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2E9BE0"/><stop offset="1" stop-color="#1471B4"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#lg)"/><path d="M24 13 A12 12 0 0 0 24 37 Z" fill="#fff"/><path d="M24 13 A12 12 0 0 1 24 37" stroke="#fff" stroke-width="1.8"/><path d="M24 13 A5.5 12 0 0 1 24 37" stroke="#fff" stroke-width="1.4"/><path d="M24 19.5 H34.6 M24 25 H36 M24 30.5 H34.6" stroke="#fff" stroke-width="1.4"/></svg>`;

/** Susun laporan di iframe tersembunyi lalu buka dialog cetak (Simpan sebagai PDF). */
export async function unduhLaporanSensor(ctx) {
  const gambar = await tangkapJembatan(ctx.viewer, ctx.data.aset).catch(() => null);
  const html = buatHTMLLaporan(ctx, gambar);
  const fr = document.createElement("iframe");
  fr.setAttribute("aria-hidden", "true");
  Object.assign(fr.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(fr);
  const doc = fr.contentDocument; doc.open(); doc.write(html); doc.close();
  await doc.fonts?.ready;
  await Promise.all([...doc.images].map((im) => (im.complete ? 0 : im.decode().catch(() => 0))));
  const judulAsal = document.title; document.title = doc.title;   // nama file PDF bawaan mengikuti judul
  fr.contentWindow.focus(); fr.contentWindow.print();
  setTimeout(() => { document.title = judulAsal; fr.remove(); }, 1500);
}
