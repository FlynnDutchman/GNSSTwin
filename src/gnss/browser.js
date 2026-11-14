// Pengolahan di browser: file RINEX dibaca lokal (tidak diunggah ke mana pun), RTKLIB WebAssembly di Web Worker.
import * as G from "./inti.js";

let worker = null, nomor = 0;
const tunggu = new Map();
function kirim(pesan, kemajuan) {
  return new Promise((ok, gagal) => {
    const id = ++nomor;
    tunggu.set(id, { ok, gagal, kemajuan });
    worker.postMessage({ ...pesan, id }, pesan.isi ? [pesan.isi.buffer] : []);
  });
}
async function siapkanWorker() {
  if (worker) return;
  worker = new Worker(new URL("./rtklib.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data: d }) => {
    const t = tunggu.get(d.id); if (!t) return;
    if (d.kemajuan) return t.kemajuan?.(d.kemajuan);
    tunggu.delete(d.id); d.ok ? t.ok(d) : t.gagal(new Error(d.error));
  };
  await kirim({ jenis: "init", url: new URL("./wasm/rnx2rtkp.wasm", document.baseURI).href });
}

async function bacaBerkas(f) {
  let nama = f.name, b = new Uint8Array(await f.arrayBuffer());
  if (/\.gz$/i.test(nama)) {
    b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    nama = nama.replace(/\.gz$/i, "");
  }
  if (/\.(crx|\d\dd)$/i.test(nama)) throw new Error(`${nama}: format Hatanaka belum didukung, ekstrak dulu ke RINEX biasa`);
  const dek = new TextDecoder("latin1");
  const header = G.bacaHeaderTeks(dek.decode(b.subarray(0, 65536)), dek.decode(b.subarray(Math.max(0, b.length - 65536))));
  return { nama, isi: b, ukuran: b.length, header };
}

let STASIUN = null;
async function stasiun() { return STASIUN ??= await (await fetch("./data/stasiun_resmi.json?v=" + __VERSI__)).json(); }

/** Membaca daftar File → info header (dipakai panel sebelum mengolah). */
export async function periksaBerkas(files) {
  const S = await stasiun();
  const hasil = [];
  for (const f of files) {
    const b = await bacaBerkas(f);
    hasil.push({ ...b, dikenal: !!S[b.header.marker] });
  }
  return hasil;
}

/** Model antena penerima (igs14.atx) hanya untuk antena yang dipakai, agar ringan. */
async function atxUntuk(antenaList) {
  const idx = await (await fetch("./atx/index.json")).json();
  let teks = await (await fetch("./atx/_header.atx")).text();
  for (const a of new Set(antenaList)) {
    const k = a.trim().replace(/\s+/g, " "), f = idx[k] || idx[k.split(" ")[0] + " NONE"];
    if (f) teks += await (await fetch("./atx/" + f)).text();
  }
  return new TextEncoder().encode(teks);
}

/** Olah lengkap di browser. berkas = hasil periksaBerkas; pilihan = {base, rover, sistem, mode, resetOtomatis}. */
export async function olahDiBrowser(berkas, pilihan, kabar = () => {}) {
  const S = await stasiun();
  kabar("Menyiapkan mesin RTKLIB (WebAssembly)…");
  await siapkanWorker();
  const cari = (n) => berkas.find((b) => b.nama === n);
  const rvB = cari(pilihan.rover), bsB = cari(pilihan.base);
  const navB = berkas.filter((b) => b.header.tipe !== "O");
  if (!rvB || !bsB || !navB.length) throw new Error("perlu file observasi base, rover, dan navigasi");
  const o = G.siapkanOpsi(S, rvB.header, bsB.header, navB.map((b) => b.header), pilihan);
  kabar("Menyalin data ke mesin…");
  for (const b of [rvB, bsB, ...navB]) await kirim({ jenis: "simpan", nama: b.nama, isi: b.isi.slice() });
  await kirim({ jenis: "simpan", nama: "antena.atx", isi: await atxUntuk([o.roverAnt, o.baseAnt]) });
  const konf = {};
  let n = 0, label = "";
  const jalankan = async ({ lapis, ts, te }) => {
    if (!konf[lapis]) { konf[lapis] = G.konfigurasiTeks(o, "/antena.atx", lapis); await kirim({ jenis: "simpan", nama: `${lapis}.conf`, isi: new TextEncoder().encode(konf[lapis]) }); }
    const out = `${lapis}_${++n}.pos`;
    const args = ["-k", `/${lapis}.conf`, "-o", `/${out}`];
    if (ts) args.push("-ts", ...G.fmtWaktu(ts));
    if (te) args.push("-te", ...G.fmtWaktu(te));
    args.push("/" + rvB.nama, "/" + bsB.nama, ...navB.map((b) => "/" + b.nama));
    const r = await kirim({ jenis: "jalankan", args, keluaran: out }, (jam) => kabar(`${label} ${jam} GPST`));
    return { teks: r.teks, detik: r.detik };
  };
  const h = await G.olahLengkap(o, rvB.header, bsB.header, jalankan, (s) => { label = s; kabar(s); });
  const r = G.ringkas(h, o, rvB.header, bsB.header, S, "RTKLIB rnx2rtkp (demo5, WebAssembly di browser)");
  r.konfigurasi = Object.fromEntries(Object.entries(konf).map(([k, v]) => [k, v.replace("/antena.atx", "igs14.atx")]));
  return r;
}
