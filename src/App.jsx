import { useEffect, useMemo, useRef, useState } from "react";
import { lazy, Suspense } from "react";
// CesiumJS (±1,1 MB gzip) dimuat terpisah: panel & data tampil dulu, peta 3D menyusul
const mapImport = import("./MapView.jsx");          // mulai unduh segera, paralel dengan data
const MapView = lazy(() => mapImport);
import { loadAll, stateAt, fmt } from "./data.js";
import { Icon, Logo } from "./icons.jsx";
import { Chip } from "./ui.jsx";
import { BASEMAPS, thumbUrl } from "./basemaps.js";
import { Brand, PetaPanel, SensorPanel, GempaPanel, InaCORSPanel, LaporanPanel } from "./panels.jsx";
import { DataPanel } from "./olah.jsx";

const VIEWS = [
  ["peta", "Peta", "peta"], ["sensor", "Sensor", "sensor"], ["gempa", "Gempa", "gempa"],
  ["data", "Data GNSS", "data"], ["inacors", "InaCORS", "inacors"], ["laporan", "Laporan", "laporan"],
];

export default function App() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadAll().then(setData).catch((e) => setErr(String(e))); }, []);
  if (err) return <div className="boot">Gagal memuat data: {err}</div>;
  if (!data) return <div className="boot"><Logo size={56} /><p>Memuat GNSSTwin…</p></div>;
  return <Shell data={data} />;
}

function Shell({ data }) {
  const T = data.skenario.waktu_s;
  const t0idx = T.indexOf(0);
  const [view, setView] = useState("peta");
  const [mode, setMode] = useState("normal");          // normal | gempa
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(null);
  const urai = false;   // jembatan selalu tampil utuh; dampak ditunjukkan dengan warna komponen
  const [layers, setLayers] = useState({ Sensor: true, InaCORS: false, "Bangunan LOD1": true });
  const [basemap, setBasemap] = useState("ortho");
  const [dim, setDim] = useState("3d");
  const [bmOpen, setBmOpen] = useState(false);
  const [tileErr, setTileErr] = useState(null);
  const viewer = useRef(null);

  // replay: mode normal berputar di data sebelum gempa; mode gempa berjalan sampai akhir
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setI((k) => {
        if (mode === "normal") return k + 1 >= t0idx ? 0 : k + 1;
        if (k + 1 >= T.length) { setPlaying(false); return k; }
        return k + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, mode, t0idx, T.length]);

  // data asli hasil RTKLIB (Data GNSS) diputar di sensor GNSS-P2: 1 epoch (30 dtk) tiap 0,1 dtk
  const [asli, setAsli] = useState(null);
  const [ai, setAi] = useState(0);
  useEffect(() => { setAi(asli ? Math.max(0, asli.q.indexOf(1)) : 0); }, [asli]);   // mulai dari epoch fix pertama
  useEffect(() => {
    if (!asli || !playing) return;
    const id = setInterval(() => setAi((k) => (k + 1) % asli.t.length), 100);
    return () => clearInterval(id);
  }, [asli, playing]);

  const st0 = useMemo(() => stateAt(data, i, mode), [data, i, mode]);
  const st = useMemo(() => {
    if (!asli || mode !== "normal") return st0;
    let k = ai; while (k > 0 && asli.q[k] !== 1) k--;          // tahan nilai fix terakhir
    if (asli.q[k] !== 1) return st0;
    const e = asli.de[k] / 10, n = asli.dn[k] / 10, u = asli.du[k] / 10;
    return { ...st0, sensors: st0.sensors.map((s) => s.id === "GNSS-P2" ? { ...s, nilai: { dE: e, dN: n, dU: u, hz: Math.hypot(e, n) }, sumber: "asli" } : s) };
  }, [st0, asli, ai, mode]);
  const jamAsli = asli ? new Date(asli.t0 + asli.t[ai] * 1000).toISOString().slice(11, 16) : null;
  const focus = view === "inacors" ? "region" : "bridge";   // gempa tetap di jembatan agar getaran terlihat

  const runScenario = () => {
    setMode("gempa"); setI(t0idx - 10); setSpeed(5); setPlaying(true);
    setLayers((l) => ({ ...l, InaCORS: true })); setView("gempa");
  };
  const reset = () => { setMode("normal"); setI(0); setSpeed(1); setPlaying(true); };
  const select = (id) => {
    setSelected(id);
    if (id?.startsWith("STA-")) setView("inacors");
    else if (id) setView("sensor");
  };
  const zoom = (f) => { const v = viewer.current; if (!v) return; f > 0 ? v.camera.zoomIn(120) : v.camera.zoomOut(120); };

  const panel = {
    peta: <PetaPanel data={data} st={st} onSelect={setSelected} setView={setView} />,
    sensor: <SensorPanel data={data} st={st} i={i} selected={selected} onSelect={setSelected} />,
    gempa: <GempaPanel data={data} st={st} mode={mode} onRun={runScenario} setView={setView} onSelect={setSelected} />,
    inacors: <InaCORSPanel data={data} st={st} selected={selected} onSelect={setSelected} />,
    laporan: <LaporanPanel data={data} st={st} mode={mode} />,
  }[view];

  const danger = st.aktif && st.worst === "bahaya";
  const topBad = st.aktif ? data.skenario.status_komponen.daftar[0] : null;

  return (
    <div className="app">
      <nav className="rail" aria-label="Navigasi utama">
        <Logo />
        <div className="gap" />
        {VIEWS.map(([id, label, icon]) => (
          <button key={id} className={`ri ${view === id ? "on" : ""}`} onClick={() => setView(id)}>
            <Icon name={icon} size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>

      <aside className="panel">
        <Brand mode={mode} />
        {panel}
        {/* Data GNSS tetap terpasang agar file & hasil olahan tidak hilang saat pindah menu */}
        <div style={{ display: view === "data" ? "contents" : "none" }}><DataPanel aktif={view === "data"} onAsli={setAsli} asliAktif={!!asli} /></div>
      </aside>

      <main className="map">
        <Suspense fallback={<div className="mapload"><span className="spin" />Memuat peta 3D…</div>}>
        <MapView data={data} st={st} layers={layers} urai={urai} selected={selected} onSelect={select} focus={focus} dim={dim} basemap={basemap} playing={playing} mode={mode} onTileError={setTileErr}
          onReady={(v) => (viewer.current = v)} />
        </Suspense>

        {danger && (
          <div className="banner">
            <Icon name="alert" size={22} />
            <div><b>Pergeseran tanah terdeteksi oleh InaCORS</b><small>{data.aset.nama} · {data.aset.komponen.find((k) => k.id === topBad.komponen)?.nama || topBad.komponen}: {topBad.indikator} {fmt(topBad.nilai_cm)} cm melewati ambang · koreksi suhu {fmt(data.skenario.koreksi_suhu_cm)} cm</small></div>
            <button onClick={() => { const s = data.aset.sensor.find((x) => x.komponen === topBad.komponen && x.jenis === "GNSS"); setSelected(s?.id); setView("sensor"); }}>Lihat detail sensor</button>
          </div>
        )}

        <div className={`layerchips ${danger ? "low" : ""}`}>
          <div className="seg" role="group" aria-label="Mode tampilan">
            {["2d", "3d"].map((d) => <button key={d} className={dim === d ? "on" : ""} onClick={() => { setDim(d); if (view === "inacors") setView("peta"); }}>{d.toUpperCase()}</button>)}
          </div>
          {Object.keys(layers).map((k) => <Chip key={k} active={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}>{k}</Chip>)}
        </div>

        <div className={`tools ${danger ? "low" : ""}`}>
          <div className="tgroup">
            <button aria-label="Perbesar" onClick={() => zoom(1)}><Icon name="plus" /></button>
            <button aria-label="Perkecil" onClick={() => zoom(-1)}><Icon name="minus" /></button>
          </div>
          <div className="tgroup">
            <button aria-label="Fokus jembatan" title="Fokus jembatan" onClick={() => setView("peta")}><Icon name="locate" /></button>
            <button aria-label="Tampilan regional" title="Tampilan regional InaCORS" onClick={() => { setLayers((l) => ({ ...l, InaCORS: true })); setView("inacors"); }}><Icon name="globe" /></button>
            <button aria-label="Peta dasar" title="Peta dasar" className={bmOpen ? "on" : ""} onClick={() => setBmOpen((o) => !o)}><Icon name="layers" /></button>
          </div>
          {bmOpen && (
            <div className="bmpick">
              <b>Peta dasar</b>
              <div className="bmgrid">
                {Object.entries(BASEMAPS).map(([k, b]) => (
                  <button key={k} className={basemap === k ? "on" : ""} onClick={() => setBasemap(k)}>
                    <span className="thumb" style={{ background: b.fallback, backgroundImage: b.url ? `url(${thumbUrl(b.url, data.aset.model.lat, data.aset.model.lon)})` : "none" }} />
                    {b.nama}
                  </button>
                ))}
              </div>
              <small>Tanpa internet, peta Natural Earth tetap tampil.</small>
            </div>
          )}
        </div>

        {tileErr && (
          <div className={`toast ${danger ? "low" : ""}`} role="status">
            <Icon name="globe" size={16} />
            <span>Peta {tileErr} tidak bisa dimuat (tanpa internet atau diblokir). Tampilan memakai dasar polos.</span>
            <button aria-label="Tutup" onClick={() => setTileErr(null)}>×</button>
          </div>
        )}

        <div className="legend">
          <b>Status</b>
          <span><i className="aman" />Aman</span><span><i className="waspada" />Waspada</span><span><i className="bahaya" />Bahaya</span>
          {mode === "gempa" && <small className="exag">Jembatan tetap utuh: dampak tiap komponen ditunjukkan dengan warna (aman / waspada / bahaya). Getaran diperbesar agar terlihat; angka di panel nilai asli.</small>}
          <small>{BASEMAPS[basemap].credit} · Bangunan © OpenStreetMap · Natural Earth · CesiumJS</small>
        </div>

        <div className="timeline">
          <button className="play" aria-label={playing ? "Jeda" : "Putar"} onClick={() => setPlaying((p) => !p)}><Icon name={playing ? "pause" : "play"} size={18} /></button>
          <div className="tlt">
            <small className={mode === "gempa" ? "sim" : "live"}>{mode === "gempa" ? `REPLAY ×${speed}` : asli ? `DATA ASLI ${asli.meta.rover.kode} · RTKLIB` : "LIVE (data contoh)"}</small>
            <b>{mode === "gempa" ? `t ${st.t >= 0 ? "+" : ""}${st.t} dtk dari awal gempa` : asli ? `GNSS-P2 ← ${asli.meta.rover.kode} · ${jamAsli} GPST` : "Kondisi normal"}</b>
          </div>
          <input type="range" min={0} max={T.length - 1} value={i} aria-label="Waktu replay"
            onChange={(e) => { setI(+e.target.value); if (mode === "normal") setMode("gempa"); setPlaying(false); }} />
          {[1, 5, 20].map((s) => <Chip key={s} active={speed === s} onClick={() => setSpeed(s)}>{s}×</Chip>)}
          {mode === "gempa" ? <button className="btn ghost" onClick={reset}>Reset</button> : <button className="btn" onClick={runScenario}>Simulasi gempa</button>}
        </div>
      </main>
    </div>
  );
}

