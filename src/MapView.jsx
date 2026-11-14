import { useEffect, useRef, useState } from "react";
import {
  Axis, BillboardGraphics, BoundingSphere, CallbackPositionProperty, Cartesian2, Cartesian3, Cartographic, Color, ColorBlendMode, ColorGeometryInstanceAttribute, EllipsoidTerrainProvider, GeometryInstance, HeadingPitchRange, HeadingPitchRoll, HorizontalOrigin, ImageryLayer, Ion, Math as CesiumMath, Matrix3, Matrix4, Model, PerInstanceColorAppearance, PolygonGeometry, PolygonHierarchy, Primitive, Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType, SingleTileImageryProvider, TileMapServiceImageryProvider, Transforms, UrlTemplateImageryProvider, VerticalOrigin, CesiumWidget, buildModuleUrl,
} from "@cesium/engine";
import { EXAG_GESER } from "./konstanta.js";
export { EXAG_GESER };
const Cesium = { Axis, BillboardGraphics, BoundingSphere, CallbackPositionProperty, Cartesian2, Cartesian3, Cartographic, Color, ColorBlendMode, ColorGeometryInstanceAttribute, EllipsoidTerrainProvider, GeometryInstance, HeadingPitchRange, HeadingPitchRoll, HorizontalOrigin, ImageryLayer, Ion, Math: CesiumMath, Matrix3, Matrix4, Model, PerInstanceColorAppearance, PolygonGeometry, PolygonHierarchy, Primitive, Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType, SingleTileImageryProvider, TileMapServiceImageryProvider, Transforms, UrlTemplateImageryProvider, VerticalOrigin, CesiumWidget, buildModuleUrl };
import { BASEMAPS } from "./basemaps.js";

const STATUS_COLOR = { aman: "#1E8A5A", waspada: "#E0A100", bahaya: "#C8323A" };
const JENIS_COLOR = { GNSS: "#1479BB", Tiltmeter: "#B86B00", Akselerometer: "#1E8A5A" };

// Skala visual. Pergeseran nyata hanya beberapa cm, jadi dibesarkan agar terlihat di layar.
const EXAG_GETAR = 25;             // getaran: 0,1 g tampil ±2,5 m
const F_GETAR = 1.8;               // frekuensi getar visual (Hz), kira-kira mode lateral bentang

// Urutan komponen sepanjang sumbu jembatan (selatan → utara) untuk tampilan urai
const URUT = ["AS", "B1", "P1", "B2", "P2", "B3", "P3", "B4", "AU"];
function uraiOffset(id) {
  const i = URUT.indexOf(id); if (i < 0) return [0, 0, 0];
  const y = (i - 4) * 7;                       // renggang sepanjang sumbu
  const z = id.startsWith("B") ? 22 : id.startsWith("P") ? -4 : 0;   // bentang terangkat, pilar turun sedikit
  return [0, y, z];
}

// ---------- ikon pin (canvas resolusi 3×, ukuran tampil pas = tajam)
const GLYPH = {
  GNSS: ["M13 7 9 3 5 7l4 4", "m17 11 4 4-4 4-4-4", "m8 12 4 4 6-6-4-4Z", "m16 8 3-3", "M9 21a6 6 0 0 0-6-6"],
  Akselerometer: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  Tiltmeter: ["M4 20h16", "M6 20 18 6", "M14 20a8 8 0 0 0-3-6"],
  STA: ["M4.9 19.1C1 15.2 1 8.8 4.9 4.9", "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5", "M14 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0",
    "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5", "M19.1 4.9C23 8.8 23 15.1 19.1 19"],
};
const DPR = 3;
const pinCache = new Map();
/** d = diameter lingkaran (px tampil), stem = panjang tangkai (px). Mengembalikan {canvas, w, h}. */
function pin(glyph, color, d, stem) {
  const key = [glyph, color, d, stem].join("|");
  if (pinCache.has(key)) return pinCache.get(key);
  const pad = 3, w = d + pad * 2, h = d + pad * 2 + stem, r = d / 2, cx = w / 2, cy = pad + r;
  const c = document.createElement("canvas"); c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext("2d"); g.scale(DPR, DPR);
  if (stem) {
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy + r); g.lineTo(cx, h - 3); g.stroke();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(cx, h - 3, 3, 0, 7); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(cx, h - 3, 1.8, 0, 7); g.fill();
  }
  g.fillStyle = "#fff"; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(cx, cy, r - 2.5, 0, 7); g.fill();
  const s = (d * 0.56) / 24;
  g.save(); g.translate(cx - 12 * s, cy - 12 * s); g.scale(s, s);
  g.strokeStyle = "#fff"; g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round";
  for (const p of GLYPH[glyph]) g.stroke(new Path2D(p));
  g.restore();
  const out = { canvas: c, w, h, key };
  pinCache.set(key, out);
  return out;
}

// ---------- teks dengan halo (buffer putih mengikuti bentuk huruf), digambar 3× agar tidak pecah
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
function teks(text, color, size = 13, halo = 3.5) {
  const key = ["T", text, color, size, halo].join("|");
  if (pinCache.has(key)) return pinCache.get(key);
  const font = `700 ${size}px ${FONT}`;
  const m = document.createElement("canvas").getContext("2d"); m.font = font;
  const w = Math.ceil(m.measureText(text).width + halo * 2 + 2), h = Math.ceil(size * 1.35 + halo * 2);
  const c = document.createElement("canvas"); c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext("2d"); g.scale(DPR, DPR); g.font = font; g.textBaseline = "middle";
  g.lineJoin = "round"; g.miterLimit = 2; g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = halo * 2;
  g.strokeText(text, halo + 1, h / 2);
  g.fillStyle = color; g.fillText(text, halo + 1, h / 2);
  const out = { canvas: c, w, h, key };
  pinCache.set(key, out);
  return out;
}
/** Gabungkan teks di atas pin dalam satu gambar (titik jangkar tetap di ujung tangkai/tengah pin). */
function pinTeks(P, T, gap = 2) {
  const key = P.key + "#" + T.key + "#" + gap;
  if (pinCache.has(key)) return pinCache.get(key);
  const w = Math.max(P.w, T.w), h = P.h + T.h + gap;
  const c = document.createElement("canvas"); c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext("2d");
  g.drawImage(T.canvas, ((w - T.w) / 2) * DPR, 0);
  g.drawImage(P.canvas, ((w - P.w) / 2) * DPR, (T.h + gap) * DPR);
  const out = { canvas: c, w, h, key };
  pinCache.set(key, out);
  return out;
}

function niceScale(m) {
  const p = 10 ** Math.floor(Math.log10(m)), n = m / p;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * Viewport 3D. Status, nilai, dan percepatan dibaca dari props; MapView hanya menggambar.
 * Gerak (urai, pergeseran, getaran) dihitung tiap frame di preRender agar halus.
 */
export default function MapView({ data, st, layers, urai, selected, onSelect, focus, dim, basemap, playing, mode, onReady, onTileError }) {
  const el = useRef(null);
  const v = useRef(null);
  const models = useRef({});
  const lod1 = useRef(null);
  const online = useRef([]);
  const neLayer = useRef(null);
  const coordEl = useRef(null);
  const scaleBar = useRef(null);
  const scaleTxt = useRef(null);
  // keadaan gerak yang dibaca loop render
  const [fontSiap, setFontSiap] = useState(false);
  useEffect(() => {
    Promise.all([document.fonts.load(`700 13px ${FONT}`), document.fonts.load(`700 12px ${FONT}`)])
      .finally(() => { pinCache.clear(); setFontSiap(true); });
  }, []);
  const layersRef = useRef(layers); layersRef.current = layers;
  useEffect(() => { if (lod1.current) lod1.current.show = layers["Bangunan LOD1"] !== false; }, [layers]);
  // mode render sesuai kebutuhan: setiap perubahan props (data, status, layer, peta dasar) → gambar ulang sekali
  useEffect(() => { const vw = v.current; if (vw && !vw.isDestroyed()) vw.scene.requestRender(); });
  const mot = useRef({ uraiTarget: 0, uraiT: 0, shaking: false, target: {}, cur: {}, amp: {}, enu: {} });

  // ---------- inisialisasi sekali
  useEffect(() => {
    Cesium.Ion.defaultAccessToken = "";
    const ne = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"))
    );
    // CesiumWidget (tanpa paket widget Viewer) → unduhan JavaScript jauh lebih kecil; entitas tetap didukung
    const viewer = new Cesium.CesiumWidget(el.current, {
      baseLayer: ne, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      // ringan: gambar ulang hanya bila ada perubahan (kamera, data, animasi), bukan 60 fps terus-menerus
      requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 1,
    });
    neLayer.current = ne;
    viewer.useBrowserRecommendedResolution = false;   // render sesuai kepadatan layar → model, pin, label tajam
    viewer.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));   // HP dengan layar 3× dibatasi 2×
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#E4E9EE");
    viewer.scene.globe.showGroundAtmosphere = false;
    v.current = viewer;
    window.__gnsstwin = viewer;   // untuk pemeriksaan dari konsol
    onReady?.(viewer);

    // ortho offline (opsional): public/img/ortho.json → [{file, bbox:[w,s,e,n]}]
    fetch("./img/ortho.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
      list.forEach((o, k) => {
        Cesium.SingleTileImageryProvider.fromUrl("./img/" + o.file, { rectangle: Cesium.Rectangle.fromDegrees(...o.bbox) })
          .then((p) => { if (!viewer.isDestroyed()) viewer.imageryLayers.add(new Cesium.ImageryLayer(p), 1 + k); });
      });
    }).catch(() => {});

    const { model } = data.aset;
    const origin = Cesium.Cartesian3.fromDegrees(model.lon, model.lat, model.h_m);
    const ENU = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    const base = Cesium.Transforms.headingPitchRollToFixedFrame(
      origin, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(model.heading_deg), 0, 0));
    const R = Cesium.Matrix4.multiply(Cesium.Matrix4.inverse(ENU, new Cesium.Matrix4()), base, new Cesium.Matrix4());
    const Rrot = Cesium.Matrix4.getMatrix3(R, new Cesium.Matrix3());
    const ENUrot = Cesium.Matrix4.getMatrix3(ENU, new Cesium.Matrix3());
    mot.current.ENUrot = ENUrot;

    for (const k of data.aset.komponen) {
      mot.current.cur[k.id] = new Cesium.Cartesian3();
      mot.current.enu[k.id] = new Cesium.Cartesian3();
      Cesium.Model.fromGltfAsync({ url: "./" + k.model, modelMatrix: base, upAxis: Cesium.Axis.Z, forwardAxis: Cesium.Axis.X })
        .then((m) => { if (!viewer.isDestroyed()) { viewer.scene.primitives.add(m); models.current[k.id] = m; m.readyEvent.addEventListener(() => viewer.scene.requestRender()); } });
    }

    // ---------- bangunan LOD1 (footprint OpenStreetMap diekstrusi setinggi bangunan)
    // dimuat setelah jembatan tampil (tidak menghambat pembukaan), format ringkas delta 1e-6°
    const muatLod1 = () => fetch("./data/bangunan_lod1.json").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || viewer.isDestroyed()) return;
      const [x0, y0] = d.asal || [0, 0], inst = [];
      const warna = [Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#DCE3EA")),
                     Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#C9D3DE"))];
      for (const v of d.b) {
        const h = v[0] / 10, deg = []; let x = 0, y = 0;
        for (let i = 1; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; deg.push(x0 + x * 1e-6, y0 + y * 1e-6); }
        inst.push(new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({ polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(deg)), height: 0, extrudedHeight: h, vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT }),
          attributes: { color: warna[h >= 7 ? 1 : 0] },
        }));
      }
      const prim = viewer.scene.primitives.add(new Cesium.Primitive({ geometryInstances: inst, appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, flat: false }), asynchronous: true }));
      prim.show = layersRef.current["Bangunan LOD1"] !== false;
      lod1.current = prim;
      const tunggu = setInterval(() => { if (viewer.isDestroyed()) return clearInterval(tunggu); viewer.scene.requestRender(); if (prim.ready) clearInterval(tunggu); }, 150);
    }).catch(() => {});
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(muatLod1, { timeout: 2500 });

    // ---------- loop gerak
    const tmpL = new Cesium.Cartesian3(), tmpE = new Cesium.Cartesian3(), T = new Cesium.Matrix4(), M = new Cesium.Matrix4();
    let lastT = performance.now();
    const offMove = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      const m = mot.current, ts = now / 1000;
      // urai: animasi 0,9 dtk
      const dir = Math.sign(m.uraiTarget - m.uraiT);
      if (dir) m.uraiT = Math.min(1, Math.max(0, m.uraiT + dir * dt / 0.9));
      const u = ease(m.uraiT);
      let sibuk = m.shaking || (dir !== 0 && m.uraiT > 0 && m.uraiT < 1) || (dir !== 0 && m.uraiT !== m.uraiTarget);
      data.aset.komponen.forEach((k, idx) => {
        // pergeseran permanen: mendekati target dengan halus
        const cur = m.cur[k.id], tg = m.target[k.id] || Cesium.Cartesian3.ZERO;
        if (Cesium.Cartesian3.distanceSquared(cur, tg) > 1e-6) sibuk = true;
        Cesium.Cartesian3.lerp(cur, tg, Math.min(1, dt * 4), cur);
        // offset lokal = urai + getaran lateral/vertikal
        const [ux, uy, uz] = uraiOffset(k.id);
        const a = m.shaking ? (m.amp[k.id] || 0) : 0, ph = idx * 0.7;
        tmpL.x = ux * u + a * Math.sin(2 * Math.PI * F_GETAR * ts + ph);
        tmpL.y = uy * u + a * 0.25 * Math.sin(2 * Math.PI * 1.1 * ts + ph * 1.3);
        tmpL.z = uz * u + a * 0.35 * Math.sin(2 * Math.PI * 3.1 * ts + ph);
        Cesium.Matrix3.multiplyByVector(Rrot, tmpL, tmpE);
        Cesium.Cartesian3.add(tmpE, cur, m.enu[k.id]);
        const mdl = models.current[k.id];
        if (mdl) {
          Cesium.Matrix4.fromTranslation(m.enu[k.id], T);
          Cesium.Matrix4.multiply(ENU, T, M);
          mdl.modelMatrix = Cesium.Matrix4.multiply(M, R, new Cesium.Matrix4());   // setter → Cesium memperbarui posisi
        }
      });
      if (sibuk) setTimeout(() => !viewer.isDestroyed() && viewer.scene.requestRender(), 0);
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
      const id = viewer.scene.pick(e.position)?.id?.id;
      if (id && !id.startsWith("LBL-")) onSelect(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e) => {
      const c = viewer.camera.pickEllipsoid(e.endPosition);
      if (!c || !coordEl.current) return;
      const g = Cesium.Cartographic.fromCartesian(c);
      coordEl.current.textContent = `${Cesium.Math.toDegrees(g.latitude).toFixed(5)}, ${Cesium.Math.toDegrees(g.longitude).toFixed(5)}`.replace(/\./g, ",");
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // skala peta + Natural Earth hanya di tampilan regional (di skala jembatan ia cuma noda hijau buram)
    let last = 0;
    const offPost = viewer.scene.postRender.addEventListener(() => {
      const now = performance.now(); if (now - last < 300 || !scaleBar.current) return; last = now;
      ne.show = viewer.camera.positionCartographic.height > 25000;
      const cv = viewer.scene.canvas, y = cv.clientHeight / 2, x = cv.clientWidth / 2;
      const a = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(x, y)), b = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(x + 100, y));
      if (!a || !b) return;
      const per100 = Cesium.Cartesian3.distance(a, b), m = niceScale(per100 * 0.8);
      scaleBar.current.style.width = `${(m / per100) * 100}px`;
      scaleTxt.current.textContent = m >= 1000 ? `${m / 1000} km` : `${m} m`;
    });

    // pengaman mode render sesuai kebutuhan: gambar ulang selama ubin peta masih dimuat, saat ukuran berubah,
    // dan saat tab kembali terlihat (tanpa ini layar bisa hitam bila frame pertama terlewat)
    const jaga = setInterval(() => { if (!viewer.isDestroyed() && !viewer.scene.globe.tilesLoaded) viewer.scene.requestRender(); }, 250);
    const ro = new ResizeObserver(() => !viewer.isDestroyed() && viewer.scene.requestRender()); ro.observe(el.current);
    const lihat = () => !viewer.isDestroyed() && viewer.scene.requestRender(); document.addEventListener("visibilitychange", lihat);
    viewer.scene.requestRender();

    return () => { clearInterval(jaga); ro.disconnect(); document.removeEventListener("visibilitychange", lihat); offMove(); offPost(); handler.destroy(); viewer.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- target gerak dari data
  useEffect(() => {
    const m = mot.current;
    m.uraiTarget = urai ? 1 : 0;
    const gempa = mode === "gempa" && st.t >= 0;
    m.shaking = gempa && playing;
    const acc = {};
    for (const s of st.sensors) if (s.jenis === "Akselerometer") acc[s.komponen] = Math.abs(s.nilai?.a_g || 0);
    const near = (id) => {           // pilar/abutmen: rata-rata bentang di sebelahnya
      const i = URUT.indexOf(id); const n = [URUT[i - 1], URUT[i + 1]].map((x) => acc[x]).filter((x) => x != null);
      return n.length ? (0.6 * n.reduce((p, q) => p + q, 0)) / n.length : 0;
    };
    for (const k of data.aset.komponen) {
      m.amp[k.id] = k.id === "LAIN" ? 0 : (acc[k.id] ?? near(k.id)) * EXAG_GETAR;
      const g = st.sensors.find((s) => s.komponen === k.id && s.jenis === "GNSS");
      m.target[k.id] = gempa && g?.nilai?.dE != null
        ? new Cesium.Cartesian3((g.nilai.dE / 100) * EXAG_GESER, (g.nilai.dN / 100) * EXAG_GESER, (g.nilai.dU / 100) * EXAG_GESER)
        : Cesium.Cartesian3.ZERO;
    }
  }, [st, urai, mode, playing, data]);

  // ---------- peta dasar
  useEffect(() => {
    const viewer = v.current; if (!viewer) return;
    for (const l of online.current) viewer.imageryLayers.remove(l, true);
    online.current = [];
    const b = BASEMAPS[basemap]; if (!b?.url) { onTileError?.(null); return; }
    let gagal = 0;
    const mk = (url) => {
      const p = new Cesium.UrlTemplateImageryProvider({ url, subdomains: "abcd", maximumLevel: b.max });
      p.errorEvent.addEventListener(() => { if (++gagal === 6) onTileError?.(b.nama); });
      return p;
    };
    onTileError?.(null);
    online.current.push(viewer.imageryLayers.addImageryProvider(mk(b.url)));
    if (b.labels) online.current.push(viewer.imageryLayers.addImageryProvider(mk(b.labels)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // ---------- kamera
  useEffect(() => {
    const viewer = v.current; if (!viewer) return;
    viewer.scene.screenSpaceCameraController.enableTilt = dim === "3d";
    if (focus === "region") {
      viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(110.0, -8.4, 111.05, -7.2), duration: 1.4 });
    } else if (dim === "2d") {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(110.31540, -7.98946, 620),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }, duration: 1.2,
      });
    } else {
      const c = Cesium.Cartesian3.fromDegrees(110.31540, -7.98946, urai ? 18 : 10);
      // saat urai: kamera lebih rendah dan menyamping agar susunan komponen terbaca
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(c, 150), {
        offset: urai
          ? new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-72), Cesium.Math.toRadians(-16), 285)
          : new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-55), Cesium.Math.toRadians(-22), 430),
        duration: 1.2,
      });
    }
  }, [focus, dim, urai]);

  // ---------- warna komponen sesuai status
  useEffect(() => {
    for (const k of data.aset.komponen) {
      const m = models.current[k.id]; if (!m) continue;
      const s = st.komp[k.id]?.status || "aman";
      if (s === "aman") { m.color = Cesium.Color.WHITE; m.colorBlendAmount = 0; }
      else {
        m.color = Cesium.Color.fromCssColorString(STATUS_COLOR[s]);
        m.colorBlendMode = Cesium.ColorBlendMode.MIX; m.colorBlendAmount = 0.6;
      }
    }
  });

  // ---------- pin sensor, label komponen saat urai, stasiun
  useEffect(() => {
    const viewer = v.current; if (!viewer) return;
    const ents = viewer.entities, m = mot.current;
    const follow = (lon, lat, h, komp) => {
      const p0 = Cesium.Cartesian3.fromDegrees(lon, lat, h), out = new Cesium.Cartesian3(), d = new Cesium.Cartesian3();
      return new Cesium.CallbackPositionProperty(() => {
        const e = m.enu[komp]; if (!e || !m.ENUrot) return p0;
        Cesium.Matrix3.multiplyByVector(m.ENUrot, e, d);
        return Cesium.Cartesian3.add(p0, d, out);
      }, false);
    };
    ents.suspendEvents();
    for (const s of st.sensors) {
      const col = s.status === "aman" ? JENIS_COLOR[s.jenis] : STATUS_COLOR[s.status];
      const sel = selected === s.id, gnss = s.jenis === "GNSS";
      let P = pin(s.jenis, col, (gnss ? 30 : 22) + (sel ? 8 : 0), gnss ? 16 : 10);
      if (sel) P = pinTeks(P, teks(s.id, "#25245A", 13));
      let e = ents.getById(s.id);
      if (!e) e = ents.add({ id: s.id, position: follow(s.lon, s.lat, data.aset.model.h_m + s.h_lokal_m + 0.3, s.komponen) });
      e.show = layers.Sensor && focus !== "region";
      e.billboard = new Cesium.BillboardGraphics({
        image: P.canvas, width: P.w, height: P.h, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
    // label nama komponen saat urai
    for (const k of data.aset.komponen) {
      const g = data.aset.sensor.find((s) => s.komponen === k.id && s.jenis === "GNSS"); if (!g) continue;
      const id = "LBL-" + k.id;
      let e = ents.getById(id);
      if (!e) e = ents.add({ id, position: follow(g.lon + 0.00012, g.lat, data.aset.model.h_m + 2, k.id) });
      const s = st.komp[k.id]?.status || "aman";
      e.show = urai && focus !== "region";
      const T = teks(`${k.id} · ${k.nama}`, s === "aman" ? "#25245A" : STATUS_COLOR[s], 13);
      e.billboard = new Cesium.BillboardGraphics({
        image: T.canvas, width: T.w, height: T.h, horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.TOP, pixelOffset: new Cesium.Cartesian2(4, 4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
    for (const s of data.stasiun) {
      const id = "STA-" + s.kode;
      let e = ents.getById(id);
      if (!e) e = ents.add({ id, position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 0) });
      const det = st.deteksi.includes(s.kode);
      e.show = layers.InaCORS;
      const col = s.status === "offline" ? "#C8323A" : det ? "#E07B00" : s.status === "online" ? "#1479BB" : "#8C95A6";
      const P0 = pin("STA", col, selected === id ? 34 : 28, 0);
      const P = pinTeks(P0, teks(s.kode + (det ? " · terdeteksi" : ""), det ? "#B85F00" : "#25245A", 13));
      e.billboard = new Cesium.BillboardGraphics({
        image: P.canvas, width: P.w, height: P.h, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, P0.h / 2), disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
    ents.resumeEvents();
  }, [st, layers, urai, selected, data, focus, fontSiap]);

  return (
    <>
      <div ref={el} className="cesium" />
      <div className="readout">
        <span className="scale"><i ref={scaleBar} /><b ref={scaleTxt}>–</b></span>
        <span className="mono" ref={coordEl}>−7,98946, 110,31540</span>
      </div>
    </>
  );
}
