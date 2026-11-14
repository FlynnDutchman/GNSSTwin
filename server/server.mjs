// GNSSTwin – server pengolah data GNSS (opsional; versi website mengolah di browser dengan RTKLIB WebAssembly)
// Mesin: RTKLIB rnx2rtkp (demo5) TANPA modifikasi. Logika pengolahan ada di src/gnss/inti.js,
// dipakai sama persis oleh server ini dan oleh browser.
// Jalankan:  node server/server.mjs   →  http://localhost:8787
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "../src/gnss/inti.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KERJA = path.join(DIR, "kerja");
const STATIK = path.join(DIR, "..", "dist");
const PORT = Number(process.env.PORT || 8787);
const BIN = path.join(DIR, "bin", process.platform === "win32" ? "rnx2rtkp.exe" : "rnx2rtkp");
const ATX = path.join(DIR, "data", "igs14.atx");
const STASIUN = JSON.parse(fs.readFileSync(path.join(DIR, "data", "stasiun.json"), "utf8"));
fs.mkdirSync(KERJA, { recursive: true });
export { G };

export function bacaHeader(file) {
  const fd = fs.openSync(file, "r"), size = fs.fstatSync(fd).size;
  const kepala = Buffer.alloc(Math.min(64 * 1024, size)), ekor = Buffer.alloc(Math.min(64 * 1024, size));
  fs.readSync(fd, kepala, 0, kepala.length, 0); fs.readSync(fd, ekor, 0, ekor.length, size - ekor.length); fs.closeSync(fd);
  return G.bacaHeaderTeks(kepala.toString("latin1"), ekor.toString("latin1"));
}

function rnx2rtkp(args) {
  return new Promise((ok, gagal) => {
    const t0 = process.hrtime.bigint();
    const p = spawn(BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", gagal);
    p.on("close", (code) => ok({ code, detik: Number(process.hrtime.bigint() - t0) / 1e9, err }));
  });
}

/** Menjalankan alur lengkap untuk satu sesi. */
export async function olahSesi(sesi, j) {
  const d = path.join(KERJA, sesi);
  const f = (nama) => { const p = path.join(d, path.basename(nama)); if (!fs.existsSync(p)) throw new Error("file belum diunggah: " + nama); return p; };
  const roverFile = f(j.rover), baseFile = f(j.base), navFiles = (j.nav || []).map(f);
  if (!navFiles.length) throw new Error("file navigasi belum ada");
  const rv = bacaHeader(roverFile), bs = bacaHeader(baseFile);
  const o = G.siapkanOpsi(STASIUN, rv, bs, navFiles.map(bacaHeader), j);
  const konf = {};
  let n = 0;
  const jalankan = async ({ lapis, ts, te }) => {
    const conf = path.join(d, `${lapis}.conf`);
    if (!konf[lapis]) { konf[lapis] = G.konfigurasiTeks(o, ATX, lapis); fs.writeFileSync(conf, konf[lapis]); }
    const out = path.join(d, `${lapis}_${++n}.pos`);
    const args = ["-k", conf, "-o", out];
    if (ts) args.push("-ts", ...G.fmtWaktu(ts));
    if (te) args.push("-te", ...G.fmtWaktu(te));
    args.push(roverFile, baseFile, ...navFiles);
    const r = await rnx2rtkp(args);
    return { teks: fs.existsSync(out) ? fs.readFileSync(out, "latin1") : "", detik: r.detik };
  };
  const h = await G.olahLengkap(o, rv, bs, jalankan, () => {});
  const r = G.ringkas(h, o, rv, bs, STASIUN, `RTKLIB rnx2rtkp (demo5, ${path.basename(BIN)})`);
  r.konfigurasi = Object.fromEntries(Object.entries(konf).map(([k, v]) => [k, v.replace(ATX, "igs14.atx")]));
  fs.writeFileSync(path.join(d, j.lapisLengkap === false ? "hasil_epoch.json" : "hasil.json"), JSON.stringify(r));
  return r;
}

// ---------------------------------------------------------------- HTTP
const sesiBaru = () => crypto.randomBytes(6).toString("hex");
const kirim = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".atx": "text/plain" };
async function bodyJSON(req) { let s = ""; for await (const c of req) s += c; return JSON.parse(s || "{}"); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" }); return res.end(); }
    if (u.pathname === "/api/status")
      return kirim(res, 200, { ok: true, mesin: path.basename(BIN), ada_mesin: fs.existsSync(BIN), stasiun: Object.keys(STASIUN).filter((k) => /^[A-Z]{4}$/.test(k)), sistem: Object.keys(G.SYS) });
    if (u.pathname === "/api/sesi" && req.method === "POST") {
      const s = sesiBaru(); fs.mkdirSync(path.join(KERJA, s)); return kirim(res, 200, { sesi: s });
    }
    // unggah satu file: POST /api/unggah?sesi=..&nama=cpts2960.26o   (body = isi file, .gz otomatis diekstrak)
    if (u.pathname === "/api/unggah" && req.method === "POST") {
      const s = u.searchParams.get("sesi"); let nama = path.basename(u.searchParams.get("nama") || "");
      if (!/^[0-9a-f]{12}$/.test(s) || !nama) return kirim(res, 400, { error: "sesi/nama tidak valid" });
      const gz = /\.gz$/i.test(nama); if (gz) nama = nama.replace(/\.gz$/i, "");
      if (/\.(crx|\d\dd)$/i.test(nama)) return kirim(res, 400, { error: "format Hatanaka (.crx/.d) belum didukung, ekstrak dulu ke RINEX biasa" });
      const p = path.join(KERJA, s, nama);
      await new Promise((ok, no) => { const w = fs.createWriteStream(p); (gz ? req.pipe(zlib.createGunzip()) : req).pipe(w); w.on("finish", ok); w.on("error", no); });
      const h = bacaHeader(p);
      return kirim(res, 200, { nama, ukuran: fs.statSync(p).size, header: h, dikenal: !!STASIUN[h.marker] });
    }
    if (u.pathname === "/api/olah" && req.method === "POST") {
      const j = await bodyJSON(req);
      return kirim(res, 200, await olahSesi(j.sesi, j));
    }
    if (u.pathname.startsWith("/api/pos/")) {   // keluaran asli RTKLIB, untuk diperiksa
      const [, , , s, n] = u.pathname.split("/");
      const p = path.join(KERJA, s, path.basename(n || "epoch_1.pos"));
      if (!/^[0-9a-f]{12}$/.test(s) || !fs.existsSync(p)) return kirim(res, 404, { error: "tidak ada" });
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return fs.createReadStream(p).pipe(res);
    }
    let p = path.join(STATIK, decodeURIComponent(u.pathname));
    if (!p.startsWith(STATIK)) return kirim(res, 403, {});
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) return kirim(res, 404, { error: "tidak ada" });
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    kirim(res, 500, { error: String(e.message || e) });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  server.listen(PORT, () => console.log(`GNSSTwin server: http://localhost:${PORT}  (mesin ${path.basename(BIN)})`));
export { server, KERJA, STASIUN };
