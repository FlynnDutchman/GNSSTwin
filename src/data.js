// Memuat data sesuai kontrak (CONTRACT.md) dan menurunkan keadaan pada waktu t.
// Tampilan TIDAK menghitung status sendiri: status diambil dari keluaran mesin (file skenario).

export async function loadAll() {
  const base = "./data/";
  const [aset, stasiun, skenario] = await Promise.all([
    fetch(base + "aset_kretek1.json").then((r) => r.json()),
    fetch(base + "stasiun.json").then((r) => r.json()),
    fetch(base + "skenario_opak_contoh.json").then((r) => r.json()),
  ]);
  return { aset, stasiun, skenario };
}

export const RANK = { bahaya: 0, waspada: 1, aman: 2 };

/** Keadaan sistem pada indeks waktu i. mode "normal" = sebelum gempa (aman). */
export function stateAt(data, i, mode) {
  const { aset, skenario } = data;
  const t = skenario.waktu_s[i];
  const aktif = mode === "gempa" && t >= skenario.status_komponen.berlaku_mulai_t;
  const komp = {};
  for (const k of aset.komponen) komp[k.id] = { status: "aman", nilai_cm: null, indikator: null };
  if (aktif) for (const d of skenario.status_komponen.daftar) komp[d.komponen] = d;

  const sensors = aset.sensor.map((s) => {
    const seri = skenario.sensor[s.id] || {};
    let nilai = null;
    if (s.jenis === "GNSS" && seri.dE) {
      const e = seri.dE[i], n = seri.dN[i];
      nilai = { dE: e, dN: n, dU: seri.dU[i], hz: Math.hypot(e, n) };
    } else if (seri.a_g) nilai = { a_g: seri.a_g[i] };
    else if (seri.deg) nilai = { deg: seri.deg[i] };
    return { ...s, nilai, status: komp[s.komponen]?.status || "aman" };
  });

  const worst = Object.values(komp).reduce((w, k) => (RANK[k.status] < RANK[w] ? k.status : w), "aman");
  const mwRows = skenario.mw_estimasi.filter((m) => m.t <= t);
  const mw = mode === "gempa" && mwRows.length ? mwRows[mwRows.length - 1].mw : null;
  const deteksi = mode === "gempa"
    ? Object.entries(skenario.stasiun).filter(([, s]) => t >= s.t_deteksi_s).map(([k]) => k)
    : [];
  return { t, komp, sensors, worst, mw, deteksi, aktif };
}

export const fmt = (v, d = 1) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
export const fmtSigned = (v, d = 1) => (v == null ? "–" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d).replace(".", ","));
