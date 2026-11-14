// Web Worker: menjalankan RTKLIB rnx2rtkp (dikompilasi ke WebAssembly dari sumber yang sama) di browser.
import { WASI, File, OpenFile, PreopenDirectory, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

let modul = null;
const berkas = new Map();      // nama → Uint8Array

onmessage = async ({ data: m }) => {
  try {
    if (m.jenis === "init") {
      modul = await WebAssembly.compileStreaming(fetch(m.url));
      postMessage({ id: m.id, ok: true });
    } else if (m.jenis === "simpan") {
      berkas.set(m.nama, m.isi);
      postMessage({ id: m.id, ok: true });
    } else if (m.jenis === "jalankan") {
      const dir = new Map([...berkas].map(([n, b]) => [n, new File(b, { readonly: true })]));
      let akhir = "", hitung = 0;
      const err = ConsoleStdout.lineBuffered((l) => {
        // "processing : 2026/10/23 01:02:30 Q=1" → kabar kemajuan, dibatasi agar tidak membanjiri
        if (++hitung % 120 === 0) { const t = l.match(/(\d\d:\d\d):\d\d/); if (t && t[1] !== akhir) { akhir = t[1]; postMessage({ id: m.id, kemajuan: akhir }); } }
      });
      const wasi = new WASI(["rnx2rtkp", ...m.args], [], [new OpenFile(new File([])), ConsoleStdout.lineBuffered(() => {}), err, new PreopenDirectory("/", dir)]);
      const inst = await WebAssembly.instantiate(modul, { wasi_snapshot_preview1: wasi.wasiImport });
      const t0 = performance.now();
      let kode = 0;
      try { kode = wasi.start(inst); } catch (e) { kode = String(e); }
      const out = dir.get(m.keluaran);
      postMessage({ id: m.id, ok: true, kode, detik: (performance.now() - t0) / 1000, teks: out ? new TextDecoder("latin1").decode(out.data) : "" });
    }
  } catch (e) {
    postMessage({ id: m.id, ok: false, error: String(e?.message || e) });
  }
};
