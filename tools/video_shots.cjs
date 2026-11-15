// Tangkapan layar berurutan untuk video demo GNSSTwin (dijalankan di GitHub Actions agar peta Ortho termuat).
const { chromium } = require("playwright");
const fs = require("fs");
const URL = process.env.GT_URL || "https://flynndutchman.github.io/GNSSTwin/";
const OUT = process.argv[2] || "shots";
const log = [];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.GT_CHROME || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  p.setDefaultTimeout(60000);
  const tunggu = async (ms = 30000) => {
    if (process.env.GT_FAST) ms = 1500;
    const t0 = Date.now(); let ok = 0;
    while (Date.now() - t0 < ms) {
      const s = await p.evaluate(() => { const v = window.__gnsstwin; if (!v) return false; v.scene.requestRender(); return v.scene.globe.tilesLoaded; }).catch(() => false);
      ok = s ? ok + 1 : 0; if (ok >= 3) break; await p.waitForTimeout(400);
    }
    await p.waitForTimeout(600);
  };
  const info = () => p.evaluate(() => (document.querySelector(".timeline .tlt b") || {}).textContent || "").catch(() => "");
  const snap = async (n) => { await p.screenshot({ path: `${OUT}/${n}.jpg`, type: "jpeg", quality: 90 }); const t = await info(); log.push({ n, t, ms: Date.now() }); console.log("ok", n, t); };
  const nav = async (t) => { await p.click(`.rail >> text=${t}`); await p.waitForTimeout(1200); };
  const chip = (t) => p.click(`.layerchips >> text=${t}`);
  // kamera: heading/pitch (derajat), jarak (m) dari titik target [lon, lat, h]
  const kamera = (lon, lat, h, hd, pt, r) => p.evaluate(([lon, lat, h, hd, pt, r]) => {
    const A = 6378137, E2 = 0.00669437999014, rad = Math.PI / 180;
    const la = lat * rad, lo = lon * rad, N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
    const X = (N + h) * Math.cos(la) * Math.cos(lo), Y = (N + h) * Math.cos(la) * Math.sin(lo), Z = (N * (1 - E2) + h) * Math.sin(la);
    const H = hd * rad, P = pt * rad;
    const e = -r * Math.sin(H) * Math.cos(P), n = -r * Math.cos(H) * Math.cos(P), u = -r * Math.sin(P);
    const sl = Math.sin(la), cl = Math.cos(la), so = Math.sin(lo), co = Math.cos(lo);
    const dx = -so * e - sl * co * n + cl * co * u, dy = co * e - sl * so * n + cl * so * u, dz = cl * n + sl * u;
    const v = window.__gnsstwin; v.camera.cancelFlight?.();
    v.camera.setView({ destination: { x: X + dx, y: Y + dy, z: Z + dz }, orientation: { heading: H, pitch: P, roll: 0 } });
    v.scene.requestRender();
  }, [lon, lat, h, hd, pt, r]);
  const PUSAT = [110.31540, -7.98946, 10], G2T = [110.3154365, -7.98953075, 13.2];
  const FAST = !!process.env.GT_FAST;

  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__gnsstwin, null, { timeout: 120000 });
  await tunggu(60000);
  // ---------- A. tampilan awal
  await p.click(".timeline .play").catch(() => {});            // jeda replay agar tampilan stabil
  await snap("a01_awal"); await p.waitForTimeout(800);
  for (const [k, j] of [["a02_chip_acc", "Akselerometer"], ["a03_chip_tilt", "Tiltmeter"], ["a04_chip_gnss", "GNSS"]]) {
    await p.click(`aside.panel .chips >> text=${j}`).catch(() => {}); await p.waitForTimeout(700); await snap(k);
  }
  // ---------- B. kamera mendekat ke stasiun GNSS-2T (dipakai juga untuk adegan rover)
  const jalur = [430, 280, 170, 100, 58, 33, 19, 11];
  if (!FAST) for (let k = 0; k < jalur.length; k++) {
    const f = k / (jalur.length - 1);
    const c = PUSAT.map((v, i) => v + (G2T[i] - v) * Math.min(1, f * 1.5));
    await kamera(c[0], c[1], c[2], -55 - 5 * f, -22, jalur[k]); await tunggu(20000);
    await snap(`b${String(k + 1).padStart(2, "0")}_zoom`);
  }
  await chip("Sensor"); await tunggu(8000); await snap("b20_rover_tanpa_pin");
  await kamera(...G2T, -120, -9, 9); await tunggu(15000); await snap("b21_rover_samping");
  await kamera(...G2T, 200, -15, 11); await tunggu(15000); await snap("b22_rover_sepanjang");
  await kamera(...G2T, -60, -14, 7); await tunggu(15000); await snap("b23_rover_dekat");
  await chip("Sensor");
  await kamera(...PUSAT, -55, -22, 430); await tunggu(15000);
  // ---------- C. sensor GNSS-2T, grafik berjalan (mode normal, 5x)
  await nav("Sensor"); await p.click(`aside.panel .row:has-text("GNSS-2T")`); await p.waitForTimeout(800);
  await kamera(...PUSAT, -55, -22, 430);
  await p.click(".timeline .play").catch(() => {}); await p.click(".timeline >> text=5×").catch(() => {});
  for (let k = 0; k < 14; k++) { await snap(`c${String(k + 1).padStart(2, "0")}_grafik`); await p.waitForTimeout(250); }
  await p.click(".timeline .play").catch(() => {});             // jeda
  // ---------- D. lapisan peta
  await nav("Peta"); await kamera(...PUSAT, -55, -22, 430); await tunggu(10000);
  await chip("InaCORS"); await tunggu(8000); await snap("d01_inacors");
  await chip("Bangunan LOD1"); await kamera(...PUSAT, -40, -32, 900); await tunggu(25000); await snap("d02_lod1");
  await chip("Titik gempa"); await tunggu(8000); await snap("d03_titik_gempa");
  await p.click('button[aria-label="Tampilan regional"]'); await p.waitForTimeout(2500); await tunggu(25000); await snap("d04_regional");
  await p.click('button[aria-label="Peta dasar"]'); await p.waitForTimeout(1500); await snap("d05_peta_dasar"); await p.click('button[aria-label="Peta dasar"]');
  // ---------- E. simulasi gempa Sesar Opak
  await nav("Gempa"); await p.click(`aside.panel .row:has-text("Sesar Opak")`).catch(async () => { await p.click(".gempa-list .row >> nth=0"); });
  await p.waitForTimeout(2500); await tunggu(20000); await snap("e01_gempa_pilih");
  await chip("Bangunan LOD1"); await chip("Titik gempa");      // matikan agar jembatan jelas
  await p.click(".timeline >> text=Simulasi gempa"); await p.waitForTimeout(1500);
  await p.click(".timeline >> text=1×").catch(() => {});
  await tunggu(6000);
  for (let k = 0; k < 48; k++) { await snap(`e${String(k + 2).padStart(2, "0")}_sim`); const t = await info(); if (/\+7[0-7] dtk/.test(t)) break; }
  await p.click(".timeline .play").catch(() => {});
  await nav("Sensor"); await p.waitForTimeout(800); await snap("e90_sensor_gempa");
  // ---------- F. laporan
  await nav("Laporan"); await p.waitForTimeout(800); await snap("f01_laporan");
  await p.evaluate(() => { window.__lap = null; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.tagName === "IFRAME") { const fr = n; setTimeout(() => { window.__lap = fr.contentDocument.documentElement.outerHTML; }, 400); } }).observe(document.body, { childList: true }); window.print = () => {}; });
  await p.click("text=Unduh laporan sensor (PDF)"); await p.waitForTimeout(1200); await snap("f02_laporan_proses");
  let html = null; for (let k = 0; k < 60 && !html; k++) { await p.waitForTimeout(1000); html = await p.evaluate(() => window.__lap); }
  if (html) {
    fs.writeFileSync(`${OUT}/f_laporan.html`, html);
    const q = await b.newPage(); await q.goto(URL); await q.setContent(html); await q.waitForTimeout(2500);
    await q.pdf({ path: `${OUT}/f_laporan.pdf`, preferCSSPageSize: true, printBackground: true });
  }
  fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1));
  await b.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/galat.txt`, String(e.stack || e)); fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1)); process.exit(0); });
