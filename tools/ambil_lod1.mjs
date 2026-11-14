// Mengambil bangunan OpenStreetMap di sekitar Jembatan Kretek I dan menyusunnya sebagai LOD1
// (footprint diekstrusi setinggi bangunan). Dijalankan otomatis di GitHub Actions sebelum build.
//
// Tinggi (m): tag `height` → `building:levels` × 3,2 + 1 → nilai baku per jenis bangunan.
// Sumber: OSM API 0.6 /map (4 petak ±1,6 × 1,6 km). © OpenStreetMap contributors, ODbL.
//
// Pemakaian: node tools/ambil_lod1.mjs public/data/bangunan_lod1.json
import fs from "node:fs";

const BBOX = [110.3010, -8.0035, 110.3300, -7.9755];          // barat, selatan, timur, utara
const BAKU = { house: 4.5, residential: 4.5, detached: 4.5, yes: 4.5, hut: 3, shed: 3, roof: 3.5, garage: 3, kiosk: 3,
  retail: 5, commercial: 6, school: 7, mosque: 9, religious: 8, public: 6, office: 7, warehouse: 7, industrial: 7,
  farm_auxiliary: 3.5, hotel: 9, hospital: 8, government: 7, dormitory: 7, apartments: 10, clinic: 6, marketplace: 6 };
const UA = { "User-Agent": "GNSSTwin/1.0 (RGPD Challenge BIG Bhumireka 2026; github.com/FlynnDutchman/gnsstwin)" };

export function susunLod1(elemenList) {
  const N = new Map(), W = new Map(), R = new Map();
  for (const els of elemenList) for (const e of els) {
    if (e.type === "node") N.set(e.id, [e.lon, e.lat]); else if (e.type === "way") W.set(e.id, e); else R.set(e.id, e);
  }
  const asal = { height: 0, levels: 0, baku: 0 }, out = [];
  const tambah = (t, ids) => {
    let g = ids.map((id) => N.get(id));
    if (g.some((p) => !p)) return;
    if (g.length > 1 && ids[0] === ids[ids.length - 1]) g = g.slice(0, -1);
    if (g.length < 3) return;
    const kx = 111320 * Math.cos((g[0][1] * Math.PI) / 180), ky = 110574;
    let a = 0;
    for (let i = 0; i < g.length; i++) { const p = g[i], q = g[(i + 1) % g.length]; a += p[0] * kx * q[1] * ky - q[0] * kx * p[1] * ky; }
    if (Math.abs(a) / 2 < 8) return;                                   // abaikan poligon < 8 m²
    let h, s;
    const hh = parseFloat(String(t.height || "").replace("m", "")), lv = parseFloat(t["building:levels"]);
    if (!isNaN(hh)) { h = hh; s = "height"; } else if (!isNaN(lv)) { h = lv * 3.2 + 1; s = "levels"; } else { h = BAKU[t.building] ?? 4.5; s = "baku"; }
    asal[s]++;
    out.push({ h: Math.round(h * 10) / 10, j: t.building, p: g.flatMap((p) => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]) });
  };
  for (const w of W.values()) if (w.tags?.building) tambah(w.tags, w.nodes);
  for (const r of R.values()) if (r.tags?.building) for (const m of r.members) if (m.type === "way" && m.role === "outer" && W.has(m.ref)) tambah(r.tags, W.get(m.ref).nodes);
  return { sumber: `© OpenStreetMap contributors (ODbL), OSM API ${new Date().toISOString().slice(0, 10)}`, lod: 1,
    aturan_tinggi: "height → levels×3,2+1 → baku per jenis", bbox: BBOX, jumlah: out.length, asal_tinggi: asal, ...ringkas(out) };
}

// Format ringkas (±5× lebih kecil): titik asal + bilangan bulat 1e-6° (±0,1 m) yang di-delta per bangunan.
// b = [[tinggi×10, x0, y0, dx1, dy1, ...], ...]
export const ASAL = [110.31539, -7.99062];
function ringkas(out) {
  return { format: "delta-1e-6", asal: ASAL, b: out.map((o) => {
    const v = [Math.round(o.h * 10)]; let px = 0, py = 0;
    for (let i = 0; i < o.p.length; i += 2) {
      const x = Math.round((o.p[i] - ASAL[0]) * 1e6), y = Math.round((o.p[i + 1] - ASAL[1]) * 1e6);
      v.push(x - px, y - py); px = x; py = y;
    }
    return v;
  }) };
}

async function main(dst) {
  const [w, s, e, n] = BBOX, mx = (w + e) / 2, my = (s + n) / 2;
  const petak = [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]];
  const hasil = [];
  for (const b of petak) {
    let ok = false;
    for (let coba = 1; coba <= 3 && !ok; coba++) {
      try {
        const r = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.join(",")}`, { headers: UA });
        if (!r.ok) throw new Error("HTTP " + r.status);
        hasil.push((await r.json()).elements); ok = true;
      } catch (err) { console.warn(`petak ${b} percobaan ${coba}: ${err.message}`); await new Promise((z) => setTimeout(z, 3000 * coba)); }
    }
    if (!ok) { console.warn("OSM tidak terjangkau; LOD1 dilewati (aplikasi tetap jalan tanpa bangunan)."); return; }
  }
  const d = susunLod1(hasil);
  fs.writeFileSync(dst, JSON.stringify(d));
  console.log(`${d.jumlah} bangunan LOD1 → ${dst}`, d.asal_tinggi);
}

if (process.argv[1]?.endsWith("ambil_lod1.mjs")) await main(process.argv[2] || "public/data/bangunan_lod1.json");
