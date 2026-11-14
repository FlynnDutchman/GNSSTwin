// Uji deteksi (uji E): sisipkan pergeseran buatan mulai tengah hari pada hasil olahan 7 hari,
// lalu periksa apakah status lapis berubah. Menguji logika ambang di atas derau GNSS yang nyata.
import fs from "node:fs";
import { statusLapis } from "../src/gnss/inti.js";
const DOY = [291, 292, 293, 294, 295, 296, 297];
const R = Object.fromEntries(DOY.map((d) => [d, JSON.parse(fs.readFileSync(`server/kerja/00000000${d}/hasil.json`))]));
function sisip(r, cmE, cmU = 0) {
  const t12 = r.baris[0].t + 12 * 3600e3;
  return { ...r,
    baris: r.baris.map((b) => b.t >= t12 ? { ...b, de: b.de + cmE / 100, du: b.du + cmU / 100 } : b),
    jendela_2jam: r.jendela_2jam.map((w) => w.t >= t12 ? { ...w, de: w.de + cmE * 10, du: w.du + cmU * 10 } : w) };
}
const hasil = [];
for (const [lapis, daftar] of [["jam2", [1, 2, 3, 4, 5, 6]], ["epoch", [5, 10, 15, 25]]]) for (const cm of daftar) {
  const st = DOY.map((d) => statusLapis(sisip(R[d], cm))[lapis].status);
  const n = st.filter((s) => s !== "aman").length;
  hasil.push({ lapis, geser_cm: cm, terdeteksi: `${n}/7`, status: st });
  console.log(lapis.padEnd(6), `${cm} cm`.padStart(6), `terdeteksi ${n}/7`, st.join(","));
}
const base = DOY.map((d) => statusLapis(R[d]));
console.log("tanpa sisipan (alarm palsu):", base.filter((s) => s.epoch.status !== "aman" || s.jam2.status !== "aman").length, "/ 7");
fs.writeFileSync("server/hasil_uji_deteksi.json", JSON.stringify({ catatan: "pergeseran horizontal (E) disisipkan mulai 12:00 GPST", alarm_palsu: base.filter((s) => s.epoch.status !== "aman" || s.jam2.status !== "aman").length, hasil }, null, 1));
