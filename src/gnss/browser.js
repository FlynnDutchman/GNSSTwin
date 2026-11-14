// Pengolahan di browser: file RINEX dibaca lokal (tidak diunggah ke mana pun), RTKLIB WebAssembly di Web Worker.
import * as G from "./inti.js";

// Satu mesin = satu Web Worker berisi RTKLIB WebAssembly. Dibuat baru setiap kali mengolah dan ditutup
// sesudahnya (atau saat dibatalkan), sehingga pengolahan bisa diulang kapan saja.
class Mesin {
  constructor() {
    this.w = new Worker(new URL("./rtklib.worker.js", import.meta.url), { type: "module" });
    this.n = 0; this.tunggu = new Map();
    this.w.onmessage = ({ data: d }) => {
      const t = this.tunggu.get(d.id); if (!t) return;
      if (d.kemajuan) return t.kemajuan?.(d.kemajuan);
      this.tunggu.delete(d.id); d.ok ? t.ok(d) : t.gagal(new Error(d.error));
    };
  }
  kirim(pesan, kemajuan) {
    return new Promise((ok, gagal) => {
      const id = ++this.n; this.tunggu.set(id, { ok, gagal, kemajuan });
      this.w.postMessage({ ...pesan, id }, pesan.isi ? [pesan.isi.buffer] : []);
    });
  }
  tutup(alasan = "dibatalkan") {
    this.w.terminate();
    for (const t of this.tunggu.values()) t.gagal(new Error(alasan));
    this.tunggu.clear();
  }
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

export const KONSTELASI = { G: "GPS", GR: "GPS+GLONASS", GRE: "GPS+GLONASS+Galileo" };

/** Olah satu konstelasi di satu mesin. maju(f) menerima kemajuan 0–1. */
async function olahSatu(mesin, data, o, S, maju, sinyal) {
  const { rvB, bsB, navB, atx } = data;
  maju(0.005);
  await mesin.kirim({ jenis: "init", url: new URL("./wasm/rnx2rtkp.wasm", document.baseURI).href });
  maju(0.01);
  for (const b of [rvB, bsB, ...navB]) await mesin.kirim({ jenis: "simpan", nama: b.nama, isi: b.isi.slice() });
  maju(0.02);
  await mesin.kirim({ jenis: "simpan", nama: "antena.atx", isi: atx.slice() });
  const t0 = Math.max(rvB.header.mulai, bsB.header.mulai), t1 = Math.min(rvB.header.akhir, bsB.header.akhir), span = Math.max(1, t1 - t0);
  const BOBOT = { epoch: [0, 0.45], jam2: [0.45, 0.45], harian: [0.9, 0.1] };   // porsi waktu tiap lapis
  const konf = {};
  let n = 0;
  const jalankan = async ({ lapis, ts, te }) => {
    if (sinyal.aborted) throw new Error("dibatalkan");
    if (!konf[lapis]) { konf[lapis] = G.konfigurasiTeks(o, "/antena.atx", lapis); await mesin.kirim({ jenis: "simpan", nama: `${lapis}.conf`, isi: new TextEncoder().encode(konf[lapis]) }); }
    const out = `${lapis}_${++n}.pos`;
    const args = ["-k", `/${lapis}.conf`, "-o", `/${out}`];
    if (ts) args.push("-ts", ...G.fmtWaktu(ts));
    if (te) args.push("-te", ...G.fmtWaktu(te));
    args.push("/" + rvB.nama, "/" + bsB.nama, ...navB.map((b) => "/" + b.nama));
    const [a0, w] = BOBOT[lapis];
    const hari = new Date(t0); hari.setUTCHours(0, 0, 0, 0);
    const r = await mesin.kirim({ jenis: "jalankan", args, keluaran: out }, (jam) => {
      const [hh, mm] = jam.split(":").map(Number), t = hari.getTime() + (hh * 60 + mm) * 60e3;
      maju(a0 + w * Math.min(1, Math.max(0, (t - t0) / span)));
    });
    return { teks: r.teks, detik: r.detik };
  };
  const h = await G.olahLengkap(o, rvB.header, bsB.header, jalankan, () => {});
  maju(1);
  const r = G.ringkas(h, o, rvB.header, bsB.header, S, "RTKLIB rnx2rtkp (demo5, WebAssembly di browser)");
  r.konfigurasi = Object.fromEntries(Object.entries(konf).map(([k, v]) => [k, v.replace("/antena.atx", "igs14.atx")]));
  return r;
}

/**
 * Olah lengkap di browser untuk ketiga konstelasi sekaligus (G, G+R, G+R+E), masing-masing di Web Worker
 * sendiri sehingga berjalan paralel. maju({G:0..1, GR:.., GRE:..}); sinyal = AbortSignal untuk membatalkan.
 */
export async function olahDiBrowser(berkas, pilihan, maju = () => {}, sinyal = new AbortController().signal) {
  const S = await stasiun();
  const cari = (n) => berkas.find((b) => b.nama === n);
  const rvB = cari(pilihan.rover), bsB = cari(pilihan.base);
  const navB = berkas.filter((b) => b.header.tipe !== "O");
  if (!rvB || !bsB || !navB.length) throw new Error("perlu file observasi base, rover, dan navigasi");
  const o0 = G.siapkanOpsi(S, rvB.header, bsB.header, navB.map((b) => b.header), { ...pilihan, sistem: "GR" });
  const atx = await atxUntuk([o0.roverAnt, o0.baseAnt]);
  const data = { rvB, bsB, navB, atx };
  const daftar = pilihan.konstelasi || Object.keys(KONSTELASI);
  const mesin = daftar.map(() => new Mesin());
  const batal = () => mesin.forEach((m) => m.tutup());
  sinyal.addEventListener("abort", batal, { once: true });
  const prog = Object.fromEntries(daftar.map((k) => [k, 0]));
  try {
    const hasil = await Promise.all(daftar.map((k, i) => {
      const o = G.siapkanOpsi(S, rvB.header, bsB.header, navB.map((b) => b.header), { ...pilihan, sistem: k });
      return olahSatu(mesin[i], data, o, S, (f) => { prog[k] = f; maju({ ...prog }); }, sinyal);
    }));
    return Object.fromEntries(daftar.map((k, i) => [k, hasil[i]]));
  } finally {
    sinyal.removeEventListener("abort", batal);
    batal();                    // tutup semua worker → memori dibebaskan, siap diolah ulang
  }
}
