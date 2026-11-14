// Uji integritas GNSSTwin
//   A-statik    : lapis harian aplikasi = rnx2rtkp langsung (validasi.py), 7 hari
//   A-kinematik : lapis epoch aplikasi = rnx2rtkp langsung, per epoch (tanpa reset)
//   G-kecepatan : ms per epoch dibanding interval 30 dtk
//   reset       : DOY 293 dengan/tanpa ulang filter
//   status      : tidak ada alarm palsu di hari normal (291–297)
// Pemakaian: node server/uji_integritas.mjs <folder obs> <folder nav> <folder keluaran native>
import fs from "node:fs";
import path from "node:path";
import { olahSesi, KERJA, G } from "./server.mjs";

const [OBS, NAV, NATIVE] = process.argv.slice(2);
const DIR = path.dirname(new URL(import.meta.url).pathname);
function sesi(doy) {
  const s = `00000000${doy}`.slice(-12), d = path.join(KERJA, s); fs.mkdirSync(d, { recursive: true });
  for (const f of [`${OBS}/cpts${doy}0.26o`, `${OBS}/cbtl${doy}0.26o`, `${NAV}/BRDC00WRD_S_2026${doy}0000_01D_MN.rnx`]) fs.copyFileSync(f, path.join(d, path.basename(f)));
  return s;
}
const opsi = (doy, x) => ({ rover: `cpts${doy}0.26o`, base: `cbtl${doy}0.26o`, nav: [`BRDC00WRD_S_2026${doy}0000_01D_MN.rnx`], sistem: "GR", ...x });
const lama = fs.existsSync(path.join(DIR, "hasil_uji_integritas.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "hasil_uji_integritas.json"))) : { uji: [] };
const laporan = { tanggal: new Date().toISOString(), uji: [] };
const catat = (o) => { laporan.uji.push(o); console.log(JSON.stringify(o)); };
const val = JSON.parse(fs.readFileSync(path.join(NATIVE, "..", "hasil_validasi.json"), "utf8"));

for (const doy of [291, 292, 293, 294, 295, 296, 297]) {
  const s = sesi(doy);
  const r = await olahSesi(s, opsi(doy, { mode: "kinematic", resetOtomatis: true }));   // 3 lapis lengkap
  const nat = val.statis.sBIG[doy], beda = r.harian_mm.map((x, i) => +(x - nat[i]).toFixed(1));
  catat({ uji: "A-statik", doy, aplikasi_mm: r.harian_mm, native_mm: nat, beda_mm: beda, lolos: beda.every((b) => Math.abs(b) <= 0.1) });
  catat({ uji: "status", doy, epoch: r.status.epoch.status, jam2: r.status.jam2.status, alasan: r.status.jam2.alasan, sb_2jam: r.stat_2jam, fix: r.fix_persen, reset: r.reset_filter.length });
  if (doy === 296) {
    const k = await olahSesi(s, opsi(doy, { mode: "kinematic", resetOtomatis: false, lapisLengkap: false }));
    const app = fs.readFileSync(path.join(KERJA, s, "epoch_1.pos"), "latin1").split(/\r?\n/).filter((l) => l && l[0] !== "%").map((l) => l.trim().split(/\s+/));
    const nat = fs.readFileSync(path.join(NATIVE, `kGR_${doy}.pos`), "latin1").split(/\r?\n/).filter((l) => l && l[0] !== "%").map((l) => l.trim().split(/\s+/));
    const R = G.ecef2enuMat(k.base.xyz);
    let maks = 0, bq = 0;
    for (let i = 0; i < Math.min(app.length, nat.length); i++) {
      const d = [0, 1, 2].map((j) => +app[i][2 + j] - k.base.xyz[j]), enu = G.mul(R, d);
      maks = Math.max(maks, ...enu.map((x, j) => Math.abs(x - +nat[i][2 + j])));
      if (app[i][5] !== nat[i][5] || app[i][6] !== nat[i][6]) bq++;
    }
    catat({ uji: "A-kinematik", doy, epoch_aplikasi: app.length, epoch_native: nat.length, beda_posisi_maks_mm: +(maks * 1000).toFixed(2), epoch_status_beda: bq, lolos: app.length === nat.length && maks < 0.0005 && bq === 0 });
    catat({ uji: "G-kecepatan", doy, epoch: k.jumlah_epoch, ms_per_epoch: k.ms_per_epoch, interval_data_ms: 30000, kali_lebih_cepat_dari_realtime: k.kali_lebih_cepat_dari_realtime, lolos: k.ms_per_epoch < 30000 });
  }
  if (doy === 293) {
    const t = await olahSesi(s, opsi(doy, { mode: "kinematic", resetOtomatis: false, lapisLengkap: false }));
    catat({ uji: "reset-divergensi", doy, tanpa_reset: { epoch: t.jumlah_epoch, fix: t.fix_persen }, dengan_reset: { epoch: r.jumlah_epoch, fix: r.fix_persen, reset: r.reset_filter } });
  }
}
// AUSPOS (DOY 296): baseline CBTL→CPTS GNSSTwin vs AUSPOS, dihitung di validasi (RINGKASAN_VALIDASI.md)
catat({ uji: "auspos", doy: 296, beda_mm: [0.9, 0.2, -0.2], beda_maks_mm: 0.9, sumber: "AUSPOS job 1794633063151, ITRF2020, orbit IGS final" });
// hasil uji mesin browser (diisi oleh uji_browser.cjs) dipertahankan
for (const u of lama.uji.filter((u) => u.uji === "A-browser")) laporan.uji.push(u);
fs.writeFileSync(path.join(DIR, "hasil_uji_integritas.json"), JSON.stringify(laporan, null, 1));
