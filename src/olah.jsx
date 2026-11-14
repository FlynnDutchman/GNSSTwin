// Panel "Data GNSS": file RINEX mentah → RTKLIB → tiga lapis pemantauan (per epoch, 2 jam, harian).
// Mesin default: RTKLIB WebAssembly di browser (file tidak keluar dari komputer pengguna).
// Bila server lokal aktif (node server/server.mjs), bisa memakai rnx2rtkp native.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Badge } from "./ui.jsx";
import { fmt } from "./data.js";
import { periksaBerkas, olahDiBrowser, KONSTELASI } from "./gnss/browser.js";

async function cariServer() {
  for (const s of ["", "http://localhost:8787"]) {
    try {
      if (s === "" && !/^https?:/.test(location.protocol)) continue;
      const r = await fetch(s + "/api/status", { signal: AbortSignal.timeout(1200) });
      if (r.ok) { const j = await r.json(); if (j.ok) return { url: s, ...j }; }
    } catch { /* lanjut */ }
  }
  return null;
}

/** hasil (baris objek, meter) → kolom ringkas (mm) */
export function keKolom(r) {
  const b = r.baris || [];
  const t0 = b[0]?.t ?? 0;
  const kol = { t: b.map((x) => (x.t - t0) / 1000) };
  for (const k of ["de", "dn", "du"]) kol[k] = b.map((x) => Math.round(x[k] * 10000) / 10);
  kol.q = b.map((x) => x.q); kol.ns = b.map((x) => x.ns);
  const { baris, ...meta } = r;
  return { meta, t0, ...kol };
}

const PERAN = { O: "Observasi", N: "Navigasi", G: "Navigasi GLONASS", M: "Navigasi" };

export function DataPanel({ aktif, onAsli, asliAktif }) {
  const [server, setServer] = useState(null);
  const [mesin, setMesin] = useState("browser");
  const [berkas, setBerkas] = useState([]);
  const [base, setBase] = useState(""); const [rover, setRover] = useState("");
  const [tab, setTab] = useState("GR"); const reset = true;
  const [proses, setProses] = useState(null); const [galat, setGalat] = useState(null);
  const [maju, setMaju] = useState(null);           // {G:0..1, GR:.., GRE:..}
  const [hasil, setHasil] = useState(null);          // {G: kolom, GR: kolom, GRE: kolom}
  const pembatal = useRef(null);
  const [uji, setUji] = useState(null);
  const [deteksi, setDeteksi] = useState(null);
  const [lihatBukti, setLihatBukti] = useState(false);
  const [manual, setManual] = useState(false);     // true bila pengguna memilih base/rover sendiri
  const inp = useRef(null);
  const keHasil = useRef(null);

  const [dimuat, setDimuat] = useState(false);
  useEffect(() => { if (aktif) setDimuat(true); }, [aktif]);
  useEffect(() => {
    if (!dimuat) return;                    // data panel baru diambil saat menu Data GNSS dibuka
    cariServer().then(setServer);
    fetch("./data/uji_deteksi.json?v=" + __VERSI__).then((r) => (r.ok ? r.json() : null)).then(setDeteksi).catch(() => {});
    fetch("./data/uji_integritas.json?v=" + __VERSI__).then((r) => (r.ok ? r.json() : null)).then(setUji).catch(() => {});
  }, [dimuat]);

  async function tambah(list) {
    setGalat(null); setProses("Membaca header RINEX…");
    try {
      const b = await periksaBerkas(list);
      const semua = [...berkas.filter((y) => !b.some((z) => z.nama === y.nama)), ...b];
      setBerkas(semua);
      // base otomatis: CBTL bila ada, kalau tidak stasiun Ina-CORS pertama yang dikenal; rover = observasi lainnya
      const o = semua.filter((f) => f.header.tipe === "O");
      const bs = (manual && semua.find((f) => f.nama === base)) || o.find((f) => f.header.marker === "CBTL") || o.find((f) => f.dikenal) || o[0];
      const rv = (manual && semua.find((f) => f.nama === rover && f.nama !== bs?.nama)) || o.find((f) => f !== bs && f.header.marker === "CPTS") || o.find((f) => f !== bs);
      setBase(bs?.nama || ""); setRover(rv?.nama || "");
      const bukan = b.filter((f) => !["O", "N", "G", "M"].includes(f.header.tipe));
      if (bukan.length) setGalat(`${bukan.map((f) => f.nama).join(", ")}: bukan file RINEX observasi/navigasi`);
    } catch (e) { setGalat(String(e.message || e)); }
    setProses(null);
  }

  // Sekali olah = ketiga konstelasi (GPS, GPS+GLONASS, GPS+GLONASS+Galileo) dihitung paralel
  async function olah() {
    setGalat(null); setHasil(null); onAsli?.(null);
    const ac = new AbortController(); pembatal.current = ac;
    const pilihan = { base, rover, mode: "kinematic", resetOtomatis: reset, konstelasi: tersedia };
    const t0 = performance.now();
    setMaju(Object.fromEntries(tersedia.map((k) => [k, 0]))); setProses("Mengolah");
    try {
      let r = {};
      if (mesin === "server" && server) {
        const { sesi } = await (await fetch(server.url + "/api/sesi", { method: "POST" })).json();
        for (const b of berkas) await fetch(`${server.url}/api/unggah?sesi=${sesi}&nama=${encodeURIComponent(b.nama)}`, { method: "POST", body: b.isi, signal: ac.signal });
        for (const k of tersedia) {
          const res = await fetch(server.url + "/api/olah", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
            body: JSON.stringify({ sesi, ...pilihan, sistem: k, nav: berkas.filter((b) => b.header.tipe !== "O").map((b) => b.nama) }) });
          r[k] = await res.json(); if (!res.ok) throw new Error(r[k].error);
          setMaju((m) => ({ ...m, [k]: 1 }));
        }
      } else {
        r = await olahDiBrowser(berkas, pilihan, setMaju, ac.signal);
      }
      setHasil({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keKolom(v)])), detik: (performance.now() - t0) / 1000 });
      setTab(tersedia.includes("GR") ? "GR" : "G");
      setTimeout(() => keHasil.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);   // langsung tampilkan hasil
    } catch (e) {
      setGalat(ac.signal.aborted ? "Pengolahan dibatalkan." : String(e.message || e));
    }
    setProses(null); setMaju(null); pembatal.current = null;
  }

  const obs = berkas.filter((f) => f.header.tipe === "O");
  const nav = berkas.filter((f) => f.header.tipe !== "O");
  // orbit satelit (ephemeris) per sistem: .n = GPS saja, .g = GLONASS, BRDC gabungan (M) = semua
  const adaGlo = nav.some((f) => f.header.sistem === "M" || f.header.tipe === "G" || f.header.sistem === "R");
  const adaGal = nav.some((f) => f.header.sistem === "M" || f.header.sistem === "E");
  const tersedia = ["G", ...(adaGlo ? ["GR"] : []), ...(adaGlo && adaGal ? ["GRE"] : [])];
  const bisa = base && rover && base !== rover && nav.length && !proses;
  const kurang = obs.length < 2 ? "Tambahkan 2 file observasi (.26o): satu stasiun base dan satu rover."
    : !nav.length ? "Tambahkan file navigasi (.26n / .26g / BRDC…rnx.gz)."
    : base === rover ? "Base dan rover harus berbeda." : "Pilih base dan rover.";

  return (
    <>
      <h3 className="title">Data GNSS</h3>
      <p className="muted">Masukkan file RINEX Ina-CORS (base, rover, navigasi), lalu tekan <b>Olah data</b>. Pengolahan memakai RTKLIB di browser; file tidak dikirim ke mana pun.</p>

      <div className="drop" role="button" tabIndex={0} onClick={() => inp.current?.click()} onKeyDown={(e) => e.key === "Enter" && inp.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); tambah([...e.dataTransfer.files]); }}>
        <Icon name="upload" size={28} /><b>Seret file RINEX ke sini</b>
        <small>Observasi base &amp; rover (.26o / .rnx) dan navigasi (.26n / .26g / BRDC .rnx.gz)</small>
        <input ref={inp} type="file" multiple hidden onChange={(e) => { tambah([...e.target.files]); e.target.value = ""; }} />
      </div>

      {berkas.length > 0 && (
        <div className="table">
          <div className="tr th"><span>FILE</span><span>ISI HEADER</span></div>
          {berkas.map((f) => (
            <div className="tr fi" key={f.nama}>
              <span><b className="mono">{f.nama}</b><small>{PERAN[f.header.tipe] || f.header.tipe} · RINEX {f.header.versi} · {(f.ukuran / 1e6).toFixed(1)} MB</small></span>
              <span className="r">{f.header.tipe === "O"
                ? <>{f.header.marker}{f.dikenal ? " ✓" : ""} · {f.header.antena}<small>tinggi header {fmt(f.header.tinggi, 3)} m{f.header.interval ? ` · ${f.header.interval} dtk` : ""}</small></>
                : <small>{f.header.sistem === "M" ? "gabungan GPS+GLONASS+Galileo+BeiDou" : f.header.tipe === "G" ? "GLONASS" : "GPS"}</small>}</span>
            </div>
          ))}
        </div>
      )}

      {berkas.length > 0 && <>
        <div className="cek">
          {[["Observasi base", !!base], ["Observasi rover", !!rover && rover !== base], ["Navigasi", nav.length > 0]].map(([l, ok]) => (
            <span key={l} className={ok ? "ok" : ""}>{ok ? "✓" : "○"} {l}</span>))}
        </div>
        {obs.length >= 1 && (
          <div className="form">
            <label>Base (titik acuan, koordinat resmi BIG)<select value={base} onChange={(e) => { setBase(e.target.value); setManual(true); }}><option value="">pilih</option>{obs.map((f) => <option key={f.nama} value={f.nama}>{f.header.marker} · {f.nama}</option>)}</select></label>
            <label>Rover (titik yang dipantau)<select value={rover} onChange={(e) => { setRover(e.target.value); setManual(true); }}><option value="">pilih</option>{obs.map((f) => <option key={f.nama} value={f.nama}>{f.header.marker} · {f.nama}</option>)}</select></label>
            {server && <>
              <div className="lbl">Mesin</div>
              <div className="seg sm">{[["browser", "Browser"], ["server", "Server lokal"]].map(([k, l]) => <button key={k} className={mesin === k ? "on" : ""} onClick={() => setMesin(k)}>{l}</button>)}</div>
            </>}
          </div>
        )}
        {!proses && <button className="btn besar" id="tombol-olah" disabled={!bisa} onClick={olah}>{hasil ? "↻ Olah ulang" : "▶ Olah data"}</button>}
        {!proses && bisa && tersedia.length === 3 && <p className="muted small">Sekali olah langsung menghitung 3 pilihan satelit: GPS, GPS+GLONASS, dan GPS+GLONASS+Galileo.</p>}
        {!proses && nav.length > 0 && tersedia.length < 3 && <div className="warnbox"><p>⚠ File navigasi yang dimasukkan hanya berisi orbit satelit <b>{tersedia.length === 1 ? "GPS" : "GPS dan GLONASS"}</b>, jadi {tersedia.length === 1 ? "GLONASS dan Galileo" : "Galileo"} tidak bisa ikut dihitung.</p><p>Untuk membandingkan multi-GNSS, tambahkan file navigasi gabungan <b>BRDC00WRD_S_…_MN.rnx.gz</b> (hari yang sama).</p></div>}
        {!bisa && !proses && <p className="muted small">{kurang}</p>}
        {!proses && <button className="linkbtn" onClick={() => { setBerkas([]); setBase(""); setRover(""); setManual(false); setHasil(null); setGalat(null); onAsli?.(null); }}>Hapus semua file</button>}
      </>}
      {proses && maju && <Progres maju={maju} onBatal={() => pembatal.current?.abort()} />}
      {galat && <p className="err">{galat}</p>}

      <div ref={keHasil} />
      {hasil && <>
        <Banding hasil={hasil} />
        <div className="seg sm full tabk">{Object.entries(KONSTELASI).map(([k, l]) => hasil[k] && <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); onAsli?.(null); }}>{k === "GRE" ? "G+R+Galileo" : l}</button>)}</div>
        <Hasil h={hasil[tab]} onAsli={onAsli} asliAktif={asliAktif} />
      </>}
      {uji && <button className="linkbtn" onClick={() => setLihatBukti((x) => !x)}>{lihatBukti ? "Sembunyikan" : "Lihat"} bukti validasi pengolahan</button>}
      {uji && lihatBukti && <Integritas uji={uji} deteksi={deteksi} />}
    </>
  );
}

function Progres({ maju, onBatal }) {
  const total = (Object.values(maju).reduce((a, b) => a + b, 0) / Object.keys(maju).length) || 0;
  return (
    <div className="progres2">
      <div className="ph"><b><span className="spin" />Mengolah dengan RTKLIB… {Math.round(total * 100)}%</b><button className="batal" onClick={onBatal}>Batalkan</button></div>
      <div className="bar"><i style={{ width: `${total * 100}%` }} /></div>
      {Object.entries(maju).map(([k, f]) => (
        <div className="sub" key={k}><span>{KONSTELASI[k]}</span><div className="bar kecil"><i style={{ width: `${f * 100}%` }} /></div><span className="mono">{Math.round(f * 100)}%</span></div>
      ))}
      <small>{Object.keys(maju).length > 1 ? `${Object.keys(maju).length} pilihan satelit diolah bersamaan. ` : ""}Data 24 jam ±1–2 menit; jangan tutup halaman.</small>
    </div>
  );
}

/** Perbandingan ketiga konstelasi dari data yang sama: inilah manfaat multi-GNSS. */
function Banding({ hasil }) {
  const ks = Object.keys(KONSTELASI);
  const m = (k) => hasil[k].meta;
  const h = (k) => { const s = m(k).stat_epoch; return s?.e ? Math.hypot(s.e.sb_robust_mm, s.n.sb_robust_mm) / 10 : null; };
  const v = (k) => m(k).stat_epoch?.u ? m(k).stat_epoch.u.sb_robust_mm / 10 : null;
  const baris = [
    ["Satelit terlihat (rata-rata)", (k) => fmt(m(k).satelit_rata), "lebih banyak = lebih kuat"],
    ["Ambiguitas fix", (k) => `${fmt(m(k).fix_persen)}%`, "makin tinggi makin teliti"],
    ["Ketelitian horizontal per epoch", (k) => (h(k) != null ? `±${fmt(h(k))} cm` : "tidak fix"), "makin kecil makin baik"],
    ["Ketelitian vertikal per epoch", (k) => (v(k) != null ? `±${fmt(v(k))} cm` : "tidak fix"), "makin kecil makin baik"],
    ["Filter diulang (divergen)", (k) => `${m(k).reset_filter.length}×`, ""],
  ];
  return (
    <>
      <div className="label">PERBANDINGAN PILIHAN SATELIT · DATA YANG SAMA</div>
      <div className="table banding">
        <div className="tr th"><span>Dari data yang sama</span>{ks.map((k) => <span key={k}>{k === "G" ? "GPS" : k === "GR" ? "G+R" : "G+R+E"}</span>)}</div>
        {baris.map(([l, f]) => <div className="tr" key={l}><span>{l}</span>{ks.map((k) => <span key={k} className="mono">{hasil[k] ? f(k) : "–"}</span>)}</div>)}
      </div>
      {ks.some((k) => !hasil[k]) && <p className="warnbox">Kolom “–”: file navigasi untuk sistem satelit itu tidak ada. Tambahkan file BRDC gabungan lalu olah ulang.</p>}
      <p className="muted small">Pada data Ina-CORS ini (RINEX 2.11) Galileo hanya satu frekuensi, jadi Galileo menambah jumlah satelit tetapi belum bisa di-fix; hasil terbaik biasanya GPS+GLONASS. Klik tab di bawah untuk melihat detail tiap pilihan.</p>
    </>
  );
}

const LABEL_LAPIS = { epoch: ["Per epoch (30 dtk)", "gerakan besar / gempa"], jam2: ["Rata-rata 2 jam", "pergeseran 2–4 cm"], harian: ["Harian (24 jam)", "gerakan lambat < 1 cm"] };

function Hasil({ h, onAsli, asliAktif }) {
  const m = h.meta;
  const [conf, setConf] = useState(null);
  const st = m.status || {};
  const sE = m.stat_epoch, s2 = m.stat_2jam;
  return (
    <>
      <div className="label">HASIL OLAHAN</div>
      <div className="table">
        <div className="tr th blue"><span>{m.base.kode} → {m.rover.kode} · {m.sistem === "GR" ? "GPS+GLONASS" : m.sistem === "G" ? "GPS" : "G+R+Galileo"}</span><span>{m.mesin.includes("WebAssembly") ? "RTKLIB · browser" : "RTKLIB · native"}</span></div>
        <div className="tr"><span>Epoch terolah</span><span className="mono">{m.jumlah_epoch.toLocaleString("id")} / {m.epoch_harapan.toLocaleString("id")}</span></div>
        <div className="tr"><span>Ambiguitas fix · satelit</span><span className="mono">{fmt(m.fix_persen)}% · {fmt(m.satelit_rata)}</span></div>
        <div className="tr"><span>Waktu olah (3 lapis)</span><span className="mono">{fmt(m.waktu_olah_detik, 1)} dtk · {fmt(m.ms_per_epoch, 1)} ms/epoch</span></div>
        <div className="tr"><span>Filter diulang</span><span className="mono">{m.reset_filter.length ? m.reset_filter.map((r) => r.waktu.slice(11, 16)).join(", ") : "tidak perlu"}</span></div>
      </div>
      {m.peringatan?.length > 0 && <div className="warnbox">{m.peringatan.map((p) => <p key={p}>⚠ {p}</p>)}</div>}

      <div className="label">STATUS TIGA LAPIS · RELATIF TITIK NOL</div>
      <div className="lapis">
        {["epoch", "jam2", "harian"].map((k) => (
          <div key={k} className="lp">
            <div className="lph"><b>{LABEL_LAPIS[k][0]}</b>{k === "harian" ? <span className="badge acuan"><i />ACUAN</span> : <Badge status={st[k]?.status || "aman"} />}</div>
            <small>{LABEL_LAPIS[k][1]}</small>
            <span className="mono">
              {k === "epoch" && sE?.e && `σ ${fmt(sE.e.sb_robust_mm / 10)} / ${fmt(sE.n.sb_robust_mm / 10)} / ${fmt(sE.u.sb_robust_mm / 10)} cm`}
              {k === "jam2" && (s2 ? `σ ${fmt(s2.e.sb_robust_mm / 10)} / ${fmt(s2.n.sb_robust_mm / 10)} / ${fmt(s2.u.sb_robust_mm / 10)} cm` : "–")}
              {k === "harian" && m.harian_mm && "= titik nol"}
            </span>
            <small className="why">{k === "harian" ? "Solusi 24 jam menjadi titik nol; lapis lain dibandingkan dengannya." : st[k]?.alasan}</small>
          </div>
        ))}
      </div>

      <div className="label">PER EPOCH · E / N / U TERHADAP TITIK NOL</div>
      <EnuChart h={h} />
      <p className="muted small">Biru = ambiguitas fix, abu-abu = float. Garis putus = ±3σ (robust) data ini. Ambang alarm lapis ini 10 cm bertahan ≥ 10 menit (lompatan singkat akibat salah fix diabaikan).</p>

      {m.jendela_2jam?.length > 0 && <>
        <div className="label">RATA-RATA TIAP 2 JAM · AMBANG 2,5 / 5 CM</div>
        <JendelaChart w={m.jendela_2jam} />
        <p className="muted small">Satu titik = posisi rata-rata selama 2 jam (12 titik per hari). Merata-rata membuat derau per 30 detik hilang, sehingga pergeseran kecil 2–4 cm bisa terdeteksi. Garis oranye = waspada (2,5 cm), merah = bahaya (5 cm); vertikal memakai ambang 2×. Lingkaran kosong = solusi belum fix (diabaikan).</p>
      </>}

      {onAsli && h.t?.length > 0 && <button className={`btn ${asliAktif ? "ghost" : ""}`} onClick={() => onAsli(asliAktif ? null : h)}>{asliAktif ? "Hentikan data asli di digital twin" : `Putar data asli ${m.rover.kode} di GNSS-P2`}</button>}

      {m.konfigurasi && <div className="chips">{Object.keys(m.konfigurasi).map((k) => <button key={k} className={`chip ${conf === k ? "on" : ""}`} onClick={() => setConf(conf === k ? null : k)}>Konfigurasi {k === "jam2" ? "2 jam" : k}</button>)}</div>}
      {conf && <pre className="conf">{m.konfigurasi[conf]}</pre>}
    </>
  );
}

function rentang(arr, minAbs) {
  const s = [...arr].sort((a, b) => a - b);
  const lo = Math.min(-minAbs, s[Math.floor(s.length * 0.005)] ?? 0), hi = Math.max(minAbs, s[Math.min(s.length - 1, Math.floor(s.length * 0.995))] ?? 0);
  const pad = (hi - lo) * 0.1; return [lo - pad, hi + pad];
}

function EnuChart({ h }) {
  const W = 368, H = 92, L = 38, R = 8;
  const jam = h.t.map((s) => s / 3600), maxJ = Math.max(24, jam[jam.length - 1] || 24);
  const X = (v) => L + (v / maxJ) * (W - L - R);
  const sE = h.meta.stat_epoch || {};
  return (
    <div className="enu">
      {[["e", "E"], ["n", "N"], ["u", "U"]].map(([k, lab]) => {
        const y = h["d" + k], a = (sE[k]?.sb_robust_mm ?? 10) * 3;
        const [lo, hi] = rentang(y.filter((_, i) => h.q[i] === 1), a * 1.4);
        const Y = (v) => 6 + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - 22);
        let fx = "", fl = "";
        for (let i = 0; i < y.length; i++) { const p = `M${X(jam[i]).toFixed(1)} ${Y(y[i]).toFixed(1)}h0`; if (h.q[i] === 1) fx += p; else fl += p; }
        const tk = [Math.round(lo / 10) * 10, 0, Math.round(hi / 10) * 10];
        return (
          <svg key={k} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Komponen ${lab}`}>
            <text x={4} y={14} className="ax strong">{lab}</text>
            {tk.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={L - 4} y={Y(v) + 3} className="ax" textAnchor="end">{fmt(v / 10, 0)}</text></g>)}
            {[a, -a].map((v) => <line key={v} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#8A94A6" strokeDasharray="4 3" strokeWidth="1.1" />)}
            <path d={fl} stroke="#B9C1CC" strokeWidth="2.2" strokeLinecap="round" />
            <path d={fx} stroke="var(--blue-600)" strokeWidth="2.2" strokeLinecap="round" />
            {k === "u" && [0, 6, 12, 18, 24].map((j) => <text key={j} x={X(j)} y={H - 3} className="ax" textAnchor="middle">{j}h</text>)}
          </svg>
        );
      })}
      <small className="ax-unit">cm · jam GPST</small>
    </div>
  );
}

function JendelaChart({ w }) {
  const W = 368, H = 120, L = 38, R = 8, T = 8, B = 20;
  const t0 = w[0].t - 3600e3, X = (t) => L + ((t - t0) / 86400e3) * (W - L - R);
  const lo = -10, hi = 10, Y = (v) => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - T - B);
  const warna = { e: "#1479BB", n: "#25245A", u: "#B86B00" };
  return (
    <div className="enu">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Solusi jendela 2 jam">
        {[-10, -5, 0, 5, 10].map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={L - 4} y={Y(v) + 3} className="ax" textAnchor="end">{v}</text></g>)}
        {[2.5, -2.5].map((v) => <line key={v} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--waspada)" strokeDasharray="4 3" strokeWidth="1.2" />)}
        {[5, -5].map((v) => <line key={v} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--bahaya)" strokeDasharray="4 3" strokeWidth="1.2" />)}
        {["e", "n", "u"].map((k, j) => w.map((p, i) => {
          const x = X(p.t) + (j - 1) * 5, y = Y(p["d" + k] / 10);
          return p.q === 1 ? <circle key={k + i} cx={x} cy={y} r="3.2" fill={warna[k]} /> : <circle key={k + i} cx={x} cy={y} r="3" fill="#fff" stroke="#B9C1CC" strokeWidth="1.5" />;
        }))}
        {[0, 6, 12, 18, 24].map((j) => <text key={j} x={X(t0 + j * 3600e3)} y={H - 4} className="ax" textAnchor="middle">{j}h</text>)}
      </svg>
      <small className="ax-unit"><b style={{ color: warna.e }}>● E</b> <b style={{ color: warna.n }}>● N</b> <b style={{ color: warna.u }}>● U</b> · cm</small>
    </div>
  );
}

function Integritas({ uji, deteksi }) {
  const g = (k) => uji.uji.filter((u) => u.uji === k);
  const st = g("A-statik"), kin = g("A-kinematik")[0], wasm = g("A-browser"), kec = g("G-kecepatan")[0], rs = g("reset-divergensi").find((u) => u.doy === 293), ap = g("auspos")[0];
  return (
    <>
      <div className="label">UJI INTEGRITAS PENGOLAHAN</div>
      <div className="table">
        {st.length > 0 && <div className="tr"><span>Aplikasi = RTKLIB langsung · statik {st.length} hari</span><span className="ok">{st.every((u) => u.lolos) ? "LOLOS · 0,0 mm" : "GAGAL"}</span></div>}
        {kin && <div className="tr"><span>Aplikasi = RTKLIB langsung · {kin.epoch_aplikasi.toLocaleString("id")} epoch</span><span className="ok">{kin.lolos ? `LOLOS · ≤ ${fmt(kin.beda_posisi_maks_mm, 1)} mm` : "GAGAL"}</span></div>}
        {wasm.length > 0 && <div className="tr"><span>Mesin browser = native · harian {wasm.length} hari</span><span className="ok">{wasm.every((u) => u.lolos) ? `LOLOS · ≤ ${fmt(Math.max(...wasm.map((u) => u.beda_maks_mm)), 1)} mm` : "GAGAL"}</span></div>}
        {ap && <div className="tr"><span>GNSSTwin = AUSPOS (Geoscience Australia)</span><span className="ok">≤ {fmt(ap.beda_maks_mm, 1)} mm</span></div>}
        {kec && <div className="tr"><span>Kecepatan (syarat real-time 30 dtk/epoch)</span><span className="ok">{fmt(kec.ms_per_epoch, 1)} ms/epoch</span></div>}
        {rs && <div className="tr"><span>Filter divergen DOY 293 (G+R)</span><span className="mono">{rs.tanpa_reset.epoch} → {rs.dengan_reset.epoch.toLocaleString("id")} epoch</span></div>}
      </div>
      {deteksi && <>
        <div className="label">UJI DETEKSI · PERGESERAN BUATAN DISISIPKAN PUKUL 12.00, 7 HARI DATA ASLI</div>
        <div className="table">
          <div className="tr th"><span>Pergeseran</span><span>Lapis 2 jam · Lapis epoch</span></div>
          {[3, 4, 5, 10, 15, 25].map((cm) => { const a = deteksi.hasil.find((h) => h.lapis === "jam2" && h.geser_cm === cm), b = deteksi.hasil.find((h) => h.lapis === "epoch" && h.geser_cm === cm);
            return <div className="tr" key={cm}><span>{cm} cm</span><span className="mono">{a ? a.terdeteksi : "–"} · {b ? b.terdeteksi : "–"}</span></div>; })}
          <div className="tr"><span>Alarm palsu tanpa pergeseran</span><span className="ok">{deteksi.alarm_palsu} / 7 hari</span></div>
        </div>
      </>}
    </>
  );
}
