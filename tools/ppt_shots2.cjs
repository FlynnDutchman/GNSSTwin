// Tangkapan layar sensor (GNSS utama, akselerometer & tiltmeter) saat skenario Sesar Opak berjalan.
const { chromium } = require("playwright");
const fs = require("fs");
const URL = "https://flynndutchman.github.io/GNSSTwin/";
const OUT = process.argv[2] || "shots";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  p.setDefaultTimeout(300000);
  const tunggu = async (ms = 45000) => {
    const t0 = Date.now(); let ok = 0;
    while (Date.now() - t0 < ms) {
      const s = await p.evaluate(() => { const v = window.__gnsstwin; if (!v) return false; v.scene.requestRender(); return v.scene.globe.tilesLoaded; }).catch(() => false);
      ok = s ? ok + 1 : 0; if (ok >= 4) break; await p.waitForTimeout(500);
    }
    await p.waitForTimeout(1200);
  };
  const snap = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("ok", n); };
  const panel = async (n) => { await p.locator("aside.panel").screenshot({ path: `${OUT}/${n}.png` }); console.log("ok", n); };
  const nav = async (t) => { await p.click(`.rail >> text=${t}`); await p.waitForTimeout(1200); };
  const simpanKamera = () => p.evaluate(() => { const c = window.__gnsstwin.camera; window.__kam = { pos: c.position.clone(), h: c.heading, pi: c.pitch }; });
  const pulihKamera = () => p.evaluate(() => { const c = window.__gnsstwin.camera, k = window.__kam; c.setView({ destination: k.pos, orientation: { heading: k.h, pitch: k.pi, roll: 0 } }); });
  const pilih = async (id) => { await p.click(`aside.panel .row:has-text("${id}")`); await p.waitForTimeout(800); await pulihKamera(); };

  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__gnsstwin, null, { timeout: 120000 });
  await tunggu(60000); await simpanKamera();

  // kondisi normal: putar 20× agar grafik terisi
  await p.click("button:has-text('20')").catch(() => {});
  await nav("Sensor"); await pilih("GNSS-2T"); await p.waitForTimeout(25000); await pulihKamera(); await tunggu();
  await snap("t01_gnss_normal"); await panel("q01_gnss_normal");

  // skenario Sesar Opak
  await nav("Gempa"); await p.click(".gempa-list .row >> nth=0"); await p.waitForTimeout(2500);
  await p.click("text=Jalankan skenario gempa"); await p.waitForTimeout(9000);
  await nav("Sensor");
  await p.click("button.back").catch(() => {}); await pilih("GNSS-2T"); await p.waitForTimeout(12000); await pulihKamera(); await tunggu();
  await snap("t02_gnss_gempa"); await panel("q02_gnss_gempa");
  await p.click("button.back"); await p.waitForTimeout(600); await panel("q03_daftar_sensor");
  await pilih("ACC-2"); await p.waitForTimeout(1500); await panel("q04_acc");
  await p.click("button.back"); await pilih("TILT-P2T"); await p.waitForTimeout(1500); await panel("q05_tilt");
  await p.click("button.back"); await pilih("GNSS-2T"); await p.click("text=Tinggi (U)").catch(() => {}); await p.waitForTimeout(1500); await panel("q06_gnss_u");
  await b.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/galat.txt`, String(e.stack || e)); process.exit(0); });
