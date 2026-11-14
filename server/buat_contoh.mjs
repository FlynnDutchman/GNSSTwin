// Hasil olahan tersimpan (dipakai panel sebelum pengguna mengolah datanya sendiri): CPTS DOY 296, G+R, 3 lapis
import fs from "node:fs";
import { olahSesi } from "./server.mjs";
const r = await olahSesi("00000000296", { rover: "cpts2960.26o", base: "cbtl2960.26o", nav: ["BRDC00WRD_S_20262960000_01D_MN.rnx"], sistem: "GR", mode: "kinematic" });
const b = r.baris, t0 = b[0].t; delete r.baris;
const kol = { meta: r, t0, t: b.map((x) => (x.t - t0) / 1000) };
for (const k of ["de", "dn", "du"]) kol[k] = b.map((x) => Math.round(x[k] * 10000) / 10);
kol.q = b.map((x) => x.q); kol.ns = b.map((x) => x.ns);
fs.writeFileSync(process.argv[2], JSON.stringify(kol));
console.log(process.argv[2], (fs.statSync(process.argv[2]).size / 1024).toFixed(0) + " KB", r.status);
