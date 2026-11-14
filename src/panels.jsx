import { useState } from "react";
import { Icon, Logo } from "./icons.jsx";
import { Badge, Chip, LineChart } from "./ui.jsx";
import { fmt, fmtSigned } from "./data.js";

export function Brand({ mode }) {
  return (
    <div className="brand">
      <div className="wordmark"><span className="g">GNSS</span><span className="b">Twin</span></div>
      <span className={`live ${mode === "gempa" ? "sim" : ""}`}><i />{mode === "gempa" ? "MODE SIMULASI" : "LIVE · OFFLINE"}</span>
    </div>
  );
}

function Search() {
  return <label className="search"><Icon name="search" /><input placeholder="Cari jembatan, sensor, atau stasiun" aria-label="Cari" /></label>;
}

function SensorRow({ s, onClick, active }) {
  const val = s.nilai?.hz != null ? `${fmt(s.nilai.hz)} cm` : s.nilai?.a_g != null ? `${fmt(Math.abs(s.nilai.a_g), 3)} g` : s.nilai?.deg != null ? `${fmt(s.nilai.deg, 2)}°` : "–";
  return (
    <button className={`row ${active ? "active" : ""}`} onClick={onClick}>
      <span className={`dot-ic ${s.jenis}`} />
      <span className="rt"><b>{s.id}</b><small>{s.keterangan} · {s.komponen}</small></span>
      <span className="rv"><span className="mono">{val}</span><Badge status={s.status} /></span>
    </button>
  );
}

export function PetaPanel({ data, st, onSelect, setView }) {
  const [jenis, setJenis] = useState("GNSS");
  const list = st.sensors.filter((s) => s.jenis === jenis);
  const n = (j) => st.sensors.filter((s) => s.jenis === j).length;
  return (
    <>
      <Search />
      <div className="card hero photo" style={{ backgroundImage: "linear-gradient(180deg, rgba(20,121,187,.15) 0%, rgba(20,121,187,.85) 48%, #1479BB 70%), url(./img/kretek1.webp)" }}>
        <small className="eyebrow">ASET DIPANTAU</small>
        <h2>{data.aset.nama}</h2>
        <p>{data.aset.lokasi}</p>
        <div className="stats">
          <div><b className={st.worst}>{st.worst.toUpperCase()}</b><small>Status jembatan</small></div>
          <div><b>{n("GNSS")}/{n("GNSS")}</b><small>GNSS online</small></div>
          <div><b>G+R+E</b><small>Konstelasi</small></div>
        </div>
      </div>
      <div className="chips">
        {["GNSS", "Akselerometer", "Tiltmeter"].map((j) => <Chip key={j} active={jenis === j} onClick={() => setJenis(j)}>{j} · {n(j)}</Chip>)}
      </div>
      <div className="label">{jenis === "GNSS" ? "SENSOR GNSS · DASAR KEPUTUSAN STATUS" : "SENSOR PENDUKUNG · KONFIRMASI"}</div>
      <div className="list">{list.map((s) => <SensorRow key={s.id} s={s} onClick={() => { onSelect(s.id); setView("sensor"); }} />)}</div>
    </>
  );
}

export function SensorPanel({ data, st, i, selected, onSelect }) {
  const [comp, setComp] = useState("dE");
  const s = st.sensors.find((x) => x.id === selected);
  if (!s) {
    return (<><h3 className="title">Sensor</h3><div className="list">{st.sensors.map((x) => <SensorRow key={x.id} s={x} onClick={() => onSelect(x.id)} />)}</div></>);
  }
  const seri = data.skenario.sensor[s.id] || {};
  const amb = data.aset.ambang.geser_perletakan_cm;
  const isG = s.jenis === "GNSS";
  const key = isG ? comp : seri.a_g ? "a_g" : "deg";
  const kinfo = st.komp[s.komponen];
  return (
    <>
      <button className="back" onClick={() => onSelect(null)}><Icon name="back" size={16} /> Kembali ke daftar sensor</button>
      <div className="dhead"><div><h3>{s.id}</h3><small>{s.keterangan} · komponen {s.komponen}{s.base ? ` · base ${s.base}` : ""}</small></div><Badge status={s.status} /></div>
      {isG && <div className="chips">{["dE", "dN", "dU"].map((c) => <Chip key={c} active={comp === c} onClick={() => setComp(c)}>{{ dE: "Timur (E)", dN: "Utara (N)", dU: "Tinggi (U)" }[c]}</Chip>)}</div>}
      <div className="card flat">
        {seri[key] ? <LineChart t={data.skenario.waktu_s} y={seri[key]} upto={i} unit={isG ? "cm" : key === "a_g" ? "g" : "°"}
          thresholds={isG && comp !== "dU" ? [{ v: amb.waspada, c: "#B86B00" }, { v: amb.bahaya, c: "#C8323A" }] : []} /> : <p className="muted">Belum ada data.</p>}
      </div>
      {isG && s.nilai && (
        <div className="table">
          <div className="tr th"><span>PERGESERAN</span><span>NILAI</span></div>
          <div className="tr"><span>Δ Timur (E)</span><span className="mono">{fmtSigned(s.nilai.dE)} cm</span></div>
          <div className="tr"><span>Δ Utara (N)</span><span className="mono">{fmtSigned(s.nilai.dN)} cm</span></div>
          <div className="tr"><span>Δ Tinggi (U)</span><span className="mono">{fmtSigned(s.nilai.dU)} cm</span></div>
          <div className="tr"><span>Horizontal</span><span className="mono">{fmt(s.nilai.hz)} cm</span></div>
          {kinfo?.indikator && <div className="tr"><span>{kinfo.indikator} (komponen {s.komponen})</span><span className={`mono ${kinfo.status}`}>{fmt(kinfo.nilai_cm, kinfo.satuan === "°" ? 2 : 1)} {kinfo.satuan || "cm"}</span></div>}
          <div className="tr"><span>Koreksi suhu</span><span className="mono">{fmt(data.skenario.koreksi_suhu_cm)} cm</span></div>
        </div>
      )}
      <p className="muted small">Ambang: waspada {fmt(amb.waspada)} cm, bahaya {fmt(amb.bahaya)} cm ({data.aset.ambang.catatan})</p>
    </>
  );
}

export function GempaPanel({ data, st, mode, onRun, setView, onSelect }) {
  const r = data.skenario.ringkasan;
  const daftar = st.aktif ? data.skenario.status_komponen.daftar : [];
  return (
    <>
      <div className="card hero">
        <div className="hrow"><div><small className="eyebrow">{mode === "gempa" ? "GEMPA TERDETEKSI · SKENARIO" : "SKENARIO SIAP DIJALANKAN"}</small><h2>{data.skenario.meta.sumber}</h2></div>{st.aktif && <Badge status={st.worst} />}</div>
        <div className="stats">
          <div><b>{st.mw ? fmt(st.mw) : "–"}</b><small>Mw estimasi</small></div>
          <div><b>{mode === "gempa" && st.deteksi.length ? `${r.waktu_deteksi_s} dtk` : "–"}</b><small>Deteksi</small></div>
          <div><b>{st.deteksi.length}/{data.stasiun.length}</b><small>Stasiun</small></div>
        </div>
        <p className="note">Input skenario: Mw {fmt(data.skenario.meta.mw_input)} · kedalaman {data.skenario.meta.kedalaman_km} km · magnitudo dari PGD (Hardy dkk. 2025)</p>
        {mode !== "gempa" && <button className="btn light" onClick={onRun}>Jalankan skenario gempa</button>}
      </div>
      <div className="label">STATUS KOMPONEN KRETEK I · DARI GNSS</div>
      <div className="list">
        {daftar.length === 0 && <p className="muted pad">Semua komponen aman.</p>}
        {daftar.map((d) => (
          <button key={d.komponen} className="row" onClick={() => { const s = data.aset.sensor.find((x) => x.komponen === d.komponen && x.jenis === "GNSS"); if (s) { onSelect(s.id); setView("sensor"); } }}>
            <span className="dot-ic GNSS" />
            <span className="rt"><b>{data.aset.komponen.find((k) => k.id === d.komponen)?.nama}</b><small>{d.indikator}</small></span>
            <span className="rv"><span className="mono">{fmt(d.nilai_cm, d.satuan === "°" ? 2 : 1)} {d.satuan || "cm"}</span><Badge status={d.status} /></span>
          </button>
        ))}
      </div>
      {st.worst === "bahaya" && (
        <div className="card route">
          <div className="routeh"><Icon name="route" /><b>Jalur aman Bantul → Parangtritis</b></div>
          <p>{r.rute.ditutup.join(", ")} ditutup sementara. Lalu lintas dialihkan lewat {r.rute.alternatif}.</p>
        </div>
      )}
    </>
  );
}

export function InaCORSPanel({ data, st, selected, onSelect }) {
  const sel = data.stasiun.find((s) => "STA-" + s.kode === selected) || data.stasiun[0];
  const lbl = { online: "Online", offline: "Offline", lokasi: "Lokasi saja" };
  return (
    <>
      <h3 className="title">Jaringan InaCORS</h3>
      <p className="muted">6 stasiun di sekitar Sesar Opak · acuan koordinat jembatan dan pendeteksi gempa</p>
      <div className="list">
        {data.stasiun.map((s) => (
          <button key={s.kode} className={`row ${sel.kode === s.kode ? "active" : ""}`} onClick={() => onSelect("STA-" + s.kode)}>
            <span className="tri" />
            <span className="rt"><b>{s.kode}{st.deteksi.includes(s.kode) ? " · terdeteksi" : ""}</b><small>{s.nama} · {s.peran}</small></span>
            <span className={`pill ${s.status}`}>{lbl[s.status]}</span>
          </button>
        ))}
      </div>
      <div className="table">
        <div className="tr th blue"><span>Detail {sel.kode}</span><span>{sel.koordinat}</span></div>
        <div className="tr"><span>Lintang, bujur</span><span className="mono">{sel.lat.toFixed(5)}, {sel.lon.toFixed(5)}</span></div>
        <div className="tr"><span>Tinggi elipsoid</span><span className="mono">{sel.h_m != null ? `${fmt(sel.h_m)} m` : "–"}</span></div>
        <div className="tr"><span>Receiver</span><span>{sel.receiver || "–"}</span></div>
        <div className="tr"><span>Konstelasi</span><span>{sel.konstelasi?.join(" · ") || "–"}</span></div>
      </div>
    </>
  );
}

export function LaporanPanel({ data, st, mode }) {
  const r = data.skenario.ringkasan;
  return (
    <>
      <h3 className="title">Laporan</h3>
      <p className="muted">Dibuat otomatis dari hasil analisis GNSS.</p>
      {mode === "gempa" && st.aktif ? (
        <div className="report">
          <div className="hrow"><Logo size={28} /><div><b>GNSSTwin · Laporan Kejadian</b><small>{data.skenario.meta.nama}</small></div></div>
          <p><b>Mw {fmt(r.mw_akhir)}</b> (skenario {fmt(data.skenario.meta.mw_input)}) · terdeteksi {r.waktu_deteksi_s} dtk · {r.stasiun_mendeteksi} stasiun</p>
          <ol>{r.rekomendasi.map((x) => <li key={x}>{x}</li>)}</ol>
          <p className="muted small">{data.skenario.meta.catatan}</p>
          <button className="btn" onClick={() => window.print()}>Cetak / simpan PDF</button>
        </div>
      ) : <p className="muted pad">Belum ada kejadian. Jalankan skenario gempa dulu.</p>}
    </>
  );
}
