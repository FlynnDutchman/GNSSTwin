// Inti pengolahan GNSSTwin – dipakai bersama oleh server (Node, rnx2rtkp native) dan browser (rnx2rtkp WebAssembly).
// Modul ini tidak menyentuh file atau proses; menjalankan RTKLIB diserahkan ke fungsi `jalankan` dari pemanggil.
//
// Tiga lapis pemantauan (hasil uji 4 hari CBTL→CPTS 13 km, lihat RINGKASAN_VALIDASI.md):
//   epoch  : kinematik 30 dtk, fix-and-hold, est-stec   → ±1 cm H, 2–3 cm V   → gerakan besar / gempa
//   jam2   : statik 2 jam, fix, est-stec                → ±5 mm H, 13 mm V     → pergeseran 2–4 cm
//   harian : statik 24 jam, iono-free float, est-ztd    → 2–6 mm               → gerakan lambat < 1 cm
// Titik nol = solusi harian; semua lapis dihitung relatif terhadapnya (bias koordinat acuan tidak berpengaruh).

export const SYS = { G: 1, GR: 5, GE: 9, GRE: 13 };

export const LAPIS = {
  epoch:  { mode: "kinematic", ionoopt: "est-stec",  tropopt: "saas",    armode: "fix-and-hold" },
  jam2:   { mode: "static",    ionoopt: "est-stec",  tropopt: "saas",    armode: "fix-and-hold" },
  harian: { mode: "static",    ionoopt: "dual-freq", tropopt: "est-ztd", armode: "off" },
};

// ---------------------------------------------------------------- geodesi
export function ecef2enuMat([x, y, z]) {
  const lon = Math.atan2(y, x), p = Math.hypot(x, y);
  const a = 6378137.0, f = 1 / 298.257223563, e2 = f * (2 - f);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * N * Math.sin(lat), p);
  }
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return [[-so, co, 0], [-sl * co, -sl * so, cl], [cl * co, cl * so, sl]];
}
export const mul = (R, v) => R.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const rata = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const sb = (a) => { const m = rata(a); return Math.sqrt(rata(a.map((x) => (x - m) ** 2))); };
export function median3(arr) {
  return [0, 1, 2].map((k) => { const s = arr.map((v) => v[k]).sort((a, b) => a - b); return s[s.length >> 1]; });
}

export function tahunDesimal(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  return y + (ms - Date.UTC(y, 0, 1)) / 86400000 / 365.0;
}
export function koordinatResmi(STASIUN, kode, tahun) {
  const s = STASIUN[kode];
  if (!s) return null;
  const dt = tahun - STASIUN.epoch0;
  return s.xyz.map((x, i) => x + s.v[i] * dt);
}

// ---------------------------------------------------------------- RINEX
/** kepala = teks awal file (≥ header), ekor = teks akhir file (untuk epoch terakhir) */
export function bacaHeaderTeks(kepala, ekor = "") {
  const h = { versi: null, tipe: null, sistem: null, marker: null, antena: null, tinggi: null, interval: null, mulai: null, akhir: null, obs: [] };
  for (const l of kepala.split(/\r?\n/)) {
    const lab = l.slice(60).trim(), v = l.slice(0, 60);
    if (lab === "RINEX VERSION / TYPE") { h.versi = parseFloat(v.slice(0, 9)); h.tipe = v.slice(20, 21); h.sistem = v.slice(40, 41); }
    else if (lab === "MARKER NAME") h.marker = v.trim().slice(0, 4).toUpperCase();
    else if (lab === "ANT # / TYPE") h.antena = v.slice(20, 40).trim();
    else if (lab === "ANTENNA: DELTA H/E/N") h.tinggi = parseFloat(v.slice(0, 14));
    else if (lab === "INTERVAL") h.interval = parseFloat(v);
    else if (lab === "TIME OF FIRST OBS") h.mulai = waktuHeader(v);
    else if (lab === "TIME OF LAST OBS") h.akhir = waktuHeader(v);
    else if (lab === "# / TYPES OF OBSERV" || lab === "SYS / # / OBS TYPES") h.obs.push(...v.slice(6).trim().split(/\s+/).filter((s) => /^[A-Z]\d/.test(s)));
    if (lab === "END OF HEADER") break;
  }
  if (!h.akhir && h.tipe === "O" && ekor) {
    const t = ekor.split(/\r?\n/);
    for (let i = t.length - 1; i >= 0; i--) {
      const m = h.versi >= 3 ? t[i].match(/^> (\d{4}) +(\d+) +(\d+) +(\d+) +(\d+) +([\d.]+)/)
                             : t[i].match(/^ (\d\d) +(\d+) +(\d+) +(\d+) +(\d+) +([\d.]+) +[0-6] /);
      if (m) { const y = +m[1] < 100 ? 2000 + +m[1] : +m[1]; h.akhir = Date.UTC(y, m[2] - 1, +m[3], +m[4], +m[5], 0) + parseFloat(m[6]) * 1000; break; }
    }
  }
  return h;
}
function waktuHeader(v) {
  const p = v.trim().split(/\s+/).map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], 0) + p[5] * 1000;
}
export const fmtWaktu = (ms) => { const d = new Date(ms), z = (n) => String(n).padStart(2, "0");
  return [`${d.getUTCFullYear()}/${z(d.getUTCMonth() + 1)}/${z(d.getUTCDate())}`, `${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}`]; };

export function bacaPosTeks(teks) {
  const ep = [];
  for (const l of teks.split(/\r?\n/)) {
    if (!l || l[0] === "%") continue;
    const a = l.trim().split(/\s+/);
    if (a.length < 10) continue;
    const [Y, M, D] = a[0].split("/").map(Number), [h, m, s] = a[1].split(":").map(Number);
    ep.push({ t: Date.UTC(Y, M - 1, D, h, m, 0) + Math.round(s * 1000), xyz: [+a[2], +a[3], +a[4]], q: +a[5], ns: +a[6], sd: [+a[7], +a[8], +a[9]] });
  }
  return ep;
}

// ---------------------------------------------------------------- opsi & konfigurasi
/** Menyusun opsi pengolahan dari header + daftar stasiun resmi. j = pilihan pengguna. */
export function siapkanOpsi(STASIUN, rv, bs, navHeaders, j = {}) {
  const roverKode = j.roverKode || rv.marker, baseKode = j.baseKode || bs.marker;
  const sb_ = STASIUN[baseKode], sr = STASIUN[roverKode], peringatan = [];
  if (!sb_ && !j.baseXYZ) throw new Error(`base ${baseKode} tidak ada di daftar stasiun, isi koordinat base`);
  const tMid = (Math.max(rv.mulai, bs.mulai) + Math.min(rv.akhir ?? rv.mulai, bs.akhir ?? bs.mulai)) / 2;
  const baseXYZ = j.baseXYZ || koordinatResmi(STASIUN, baseKode, tahunDesimal(tMid));
  const roverH = j.roverH ?? sr?.h ?? rv.tinggi ?? 0, baseH = j.baseH ?? sb_?.h ?? bs.tinggi ?? 0;
  for (const [k, hdr, pakai] of [[roverKode, rv, roverH], [baseKode, bs, baseH]])
    if (hdr.tinggi != null && Math.abs(hdr.tinggi - pakai) > 0.0005)
      peringatan.push(`${k}: tinggi antena di header RINEX ${hdr.tinggi.toFixed(3)} m ≠ yang dipakai ${pakai.toFixed(3)} m (lembar deskripsi BIG)`);
  const sistem = j.sistem || "GR";
  if (sistem.includes("R") && !navHeaders.some((h) => h.tipe === "G" || h.sistem === "M" || h.sistem === "R"))
    peringatan.push("navigasi hanya GPS (file .n): GLONASS tidak ikut terolah, pakai BRDC gabungan atau tambah file .g");
  if (sistem.includes("E") && rv.versi < 3) peringatan.push("RINEX 2.11: Galileo hanya satu frekuensi, ambiguitas Galileo tidak bisa di-fix");
  return {
    mode: j.mode === "static" ? "static" : "kinematic", sistem, elmask: j.elmask ?? 15,
    roverKode, baseKode, baseXYZ,
    roverAnt: j.roverAnt || sr?.ant || rv.antena || "", baseAnt: j.baseAnt || sb_?.ant || bs.antena || "",
    roverH, baseH, resetOtomatis: j.resetOtomatis !== false, peringatan,
    lapisLengkap: j.lapisLengkap !== false,
  };
}

/** Teks konfigurasi RTKLIB. Lapis "epoch" dan "harian" sama persis dengan validasi.py. */
export function konfigurasiTeks(o, atx, lapis = o.mode === "static" ? "harian" : "epoch") {
  const L = LAPIS[lapis];
  return [
    `pos1-posmode       =${L.mode}`,
    `pos1-frequency     =l1+l2`,
    `pos1-soltype       =forward`,
    `pos1-elmask        =${o.elmask}`,
    `pos1-navsys        =${SYS[o.sistem]}`,
    `pos1-ionoopt       =${L.ionoopt}`,
    `pos1-tropopt       =${L.tropopt}`,
    `pos2-armode        =${L.armode}`,
    `pos2-arthres       =3`,
    `out-solformat      =xyz`,
    `out-outhead        =on`,
    `file-rcvantfile    =${atx}`,
    `ant1-anttype       =${o.roverAnt}`,
    `ant1-antdelu       =${o.roverH}`,
    `ant2-anttype       =${o.baseAnt}`,
    `ant2-antdelu       =${o.baseH}`,
    `ant2-postype       =xyz`,
    `ant2-pos1          =${o.baseXYZ[0].toFixed(4)}`,
    `ant2-pos2          =${o.baseXYZ[1].toFixed(4)}`,
    `ant2-pos3          =${o.baseXYZ[2].toFixed(4)}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- menjalankan
// jalankan({lapis, ts, te}) → Promise<{teks, detik}>; ts/te = ms GPST atau null.

/** Kinematik per epoch dengan deteksi filter divergen + ulang filter (-ts). */
export async function olahEpoch(o, rv, bs, jalankan, kabar = () => {}) {
  const interval = rv.interval || 30;
  const tAkhir = Math.min(rv.akhir ?? Infinity, bs.akhir ?? Infinity);
  const celahMaks = 10 * interval * 1000, lompatMaks = 1.0;
  let semua = [], reset = [], tMulai = null, detik = 0, putaran = 0;
  while (putaran++ < 30) {
    kabar(putaran === 1 ? "Kinematik per epoch…" : `Filter diulang dari ${fmtWaktu(tMulai)[1]}…`);
    const r = await jalankan({ lapis: "epoch", ts: tMulai, te: null }); detik += r.detik;
    let ep = bacaPosTeks(r.teks);
    if (!o.resetOtomatis) { semua = ep; break; }
    let gagal = null, fixRef = [], beruntun = 0;
    // celah singkat tidak memicu reset: filter RTKLIB biasanya pulih sendiri setelah data kembali
    for (let i = 0; i < ep.length; i++) {
      if (ep[i].q === 1) fixRef.push(ep[i].xyz);
      if (fixRef.length >= 20) {
        const m = median3(fixRef.slice(-120));
        if (Math.hypot(...sub(ep[i].xyz, m)) > lompatMaks) { if (++beruntun >= 5) { gagal = { t: ep[i - 4].t, sebab: "lompatan" }; ep = ep.slice(0, i - 4); break; } }
        else beruntun = 0;
      }
    }
    if (!gagal && ep.length && tAkhir - ep[ep.length - 1].t > celahMaks) gagal = { t: ep[ep.length - 1].t + interval * 1000, sebab: "berhenti" };
    semua = semua.concat(ep);
    if (!gagal || gagal.t >= tAkhir) break;
    reset.push({ t: gagal.t, sebab: gagal.sebab });
    tMulai = gagal.t;
  }
  return { epoch: semua, reset, detik, interval };
}

/** Statik berjendela (default 2 jam) + statik harian. */
export async function olahStatik(rv, bs, jalankan, jam = 2, kabar = () => {}) {
  const t0 = Math.max(rv.mulai, bs.mulai), t1 = Math.min(rv.akhir, bs.akhir);
  const interval = rv.interval || 30;
  const jendela = []; let detik = 0;
  for (let a = t0, i = 0; a < t1; a += jam * 3600e3, i++) {
    const b = Math.min(a + jam * 3600e3 - interval * 1000, t1);
    if (b - a < jam * 3600e3 * 0.75) break;       // jendela terakhir yang terlalu pendek dilewati
    kabar(`Statik ${jam} jam: jendela ${i + 1}…`);
    const r = await jalankan({ lapis: "jam2", ts: a, te: b }); detik += r.detik;
    const ep = bacaPosTeks(r.teks), akhir = ep[ep.length - 1];
    if (akhir) jendela.push({ t: (a + b) / 2, xyz: akhir.xyz, q: akhir.q, ns: rata(ep.map((e) => e.ns)) });
  }
  kabar("Statik harian (24 jam)…");
  const r = await jalankan({ lapis: "harian", ts: null, te: null }); detik += r.detik;
  const ep = bacaPosTeks(r.teks);
  return { jendela, harian: ep.length ? ep[ep.length - 1] : null, detik };
}

// ---------------------------------------------------------------- ringkasan untuk aplikasi
const mm = (x) => +(x * 1000).toFixed(1);

export function ringkas({ e: hE, s: hS }, o, rv, bs, STASIUN, mesin) {
  const ep = hE?.epoch ?? [];
  const tMid = (Math.max(rv.mulai, bs.mulai) + Math.min(rv.akhir ?? rv.mulai, bs.akhir ?? bs.mulai)) / 2;
  const thn = tahunDesimal(tMid);
  const resmi = o.roverKode ? koordinatResmi(STASIUN, o.roverKode, thn) : null;
  const fix = ep.filter((e) => e.q === 1);
  const acuan = resmi ?? hS?.harian?.xyz ?? median3((fix.length ? fix : ep).map((e) => e.xyz));
  const R = ecef2enuMat(acuan);
  const enu = (xyz) => mul(R, sub(xyz, acuan));
  // titik nol: solusi harian bila ada, kalau tidak median solusi fix
  const nol = hS?.harian ? enu(hS.harian.xyz) : fix.length ? median3(fix.map((e) => enu(e.xyz))) : [0, 0, 0];
  const baris = ep.map((e) => {
    const v = enu(e.xyz);
    return { t: e.t, e: v[0], n: v[1], u: v[2], q: e.q, ns: e.ns, de: v[0] - nol[0], dn: v[1] - nol[1], du: v[2] - nol[2] };
  });
  const bf = baris.filter((b) => b.q === 1);
  const robust = (a, min = 10) => { if (a.length < min) return null; const s = [...a].sort((x, y) => x - y), m = s[s.length >> 1]; const d = a.map((x) => Math.abs(x - m)).sort((x, y) => x - y); return 1.4826 * d[d.length >> 1]; };
  const statEpoch = Object.fromEntries(["e", "n", "u"].map((k) => [k, bf.length > 10 ? {
    rata_mm: mm(rata(bf.map((b) => b[k]))), sb_mm: mm(sb(bf.map((b) => b["d" + k]))), sb_robust_mm: mm(robust(bf.map((b) => b["d" + k]))),
  } : null]));
  const jendela = (hS?.jendela ?? []).map((w) => { const v = enu(w.xyz); return { t: w.t, q: w.q, ns: +w.ns.toFixed(1), de: mm(v[0] - nol[0]), dn: mm(v[1] - nol[1]), du: mm(v[2] - nol[2]) }; });
  const jf = jendela.filter((w) => w.q === 1);
  const statJam = jf.length >= 4 ? Object.fromEntries(["e", "n", "u"].map((k) => [k, { sb_mm: +sb(jf.map((w) => w["d" + k])).toFixed(1), sb_robust_mm: +robust(jf.map((w) => w["d" + k]), 4).toFixed(1) }])) : null;
  const detik = (hE?.detik ?? 0) + (hS?.detik ?? 0);
  const rentang = (Math.min(rv.akhir, bs.akhir) - Math.max(rv.mulai, bs.mulai)) / 1000;
  const interval = hE?.interval || rv.interval || 30;
  const r = {
    mesin, mode: o.mode, sistem: o.sistem, elmask: o.elmask,
    base: { kode: o.baseKode, ant: o.baseAnt, h: o.baseH, xyz: o.baseXYZ.map((x) => +x.toFixed(4)) },
    rover: { kode: o.roverKode, ant: o.roverAnt, h: o.roverH, acuan: resmi ? "koordinat resmi BIG (dipropagasi)" : "solusi harian", xyz_acuan: acuan.map((x) => +x.toFixed(4)) },
    tahun_epoch: +thn.toFixed(4),
    peringatan: o.peringatan,
    jumlah_epoch: ep.length, epoch_harapan: Math.round(rentang / interval) + 1,
    fix_persen: ep.length ? +(100 * fix.length / ep.length).toFixed(1) : 0,
    satelit_rata: ep.length ? +rata(ep.map((e) => e.ns)).toFixed(1) : 0,
    reset_filter: (hE?.reset ?? []).map((r) => ({ waktu: new Date(r.t).toISOString().slice(0, 19).replace("T", " ") + " GPST", sebab: r.sebab })),
    // titik nol relatif koordinat resmi (= bias koordinat acuan; tidak dipakai untuk status)
    titik_nol_mm: nol.map(mm),
    harian_mm: hS?.harian ? nol.map(mm) : null,
    stat_epoch: statEpoch,
    jendela_2jam: jendela, stat_2jam: statJam,
    statik_akhir_mm: o.mode === "static" && hS?.harian ? nol.map(mm) : null,
    waktu_olah_detik: +detik.toFixed(2),
    ms_per_epoch: ep.length && hE ? +(1000 * hE.detik / ep.length).toFixed(2) : null,
    kali_lebih_cepat_dari_realtime: hE?.detik ? Math.round(rentang / hE.detik) : null,
    baris,
  };
  r.status = statusLapis(r);
  return r;
}

/** Alur lengkap: kinematik (+reset) lalu statik 2 jam + harian. */
export async function olahLengkap(o, rv, bs, jalankan, kabar) {
  const e = o.mode === "kinematic" ? await olahEpoch(o, rv, bs, jalankan, kabar) : null;
  const s = o.mode === "static" || o.lapisLengkap ? await olahStatik(rv, bs, jalankan, 2, kabar) : null;
  return { e, s };
}

// ---------------------------------------------------------------- status per lapis
// Ambang (cm). Lapis 2 jam & harian memakai ambang 2,5 / 5 cm (horizontal) seperti proposal; vertikal 2× karena
// ketelitian vertikal GNSS ±2–3× lebih buruk. Lapis epoch hanya untuk gerakan besar (≥ 10 cm selama ≥ 10 menit).
export const AMBANG = {
  epoch: { waspada: 10, bahaya: 20, beruntun: 20 },          // horizontal, cm, epoch fix berturut-turut (20 × 30 dtk = 10 menit;
                                                              // salah fix ambiguitas teramati bertahan ≤ 5 menit, DOY 291)
  jam2: { h: [2.5, 5], v: [5, 10], beruntun: 2 },           // cm, jumlah jendela berturut-turut
};
const RANK = { aman: 0, waspada: 1, bahaya: 2 };
export function statusLapis(r) {
  const out = {};
  // epoch
  let run = 0, maks = 0, st = "aman";
  for (const b of r.baris || []) {
    if (b.q !== 1) continue;
    const h = Math.hypot(b.de, b.dn) * 100;
    run = h > AMBANG.epoch.waspada ? run + 1 : 0;
    if (run >= AMBANG.epoch.beruntun) { maks = Math.max(maks, h); st = h > AMBANG.epoch.bahaya ? "bahaya" : RANK[st] < 1 ? "waspada" : st; }
  }
  out.epoch = { status: st, alasan: st === "aman" ? "tidak ada gerakan ≥ 10 cm selama ≥ 10 menit" : `gerakan ${maks.toFixed(1)} cm bertahan ≥ 10 menit` };
  // jendela 2 jam
  const nilai = (w) => { const h = Math.hypot(w.de, w.dn) / 10, v = Math.abs(w.du) / 10;
    return h > AMBANG.jam2.h[1] || v > AMBANG.jam2.v[1] ? 2 : h > AMBANG.jam2.h[0] || v > AMBANG.jam2.v[0] ? 1 : 0; };
  const J = (r.jendela_2jam || []).filter((w) => w.q === 1);
  let s2 = 0, sendiri = 0;
  for (let i = 0; i < J.length; i++) {
    const a = nilai(J[i]); if (a) sendiri++;
    if (i >= 1) s2 = Math.max(s2, Math.min(a, nilai(J[i - 1])));
  }
  out.jam2 = { status: ["aman", "waspada", "bahaya"][s2], alasan: s2 ? "≥ 2 jendela berturut-turut melewati ambang" : sendiri ? `${sendiri} jendela tunggal melewati ambang (diabaikan, bukan berturut-turut)` : "semua jendela di bawah ambang" };
  return out;
}
