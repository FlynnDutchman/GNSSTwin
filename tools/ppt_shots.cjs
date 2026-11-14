// Tangkapan layar situs GNSSTwin (online) untuk PPT. Dijalankan di GitHub Actions (butuh internet untuk peta dasar).
const { chromium } = require("playwright");
const fs = require("fs");
const URL = "https://flynndutchman.github.io/GNSSTwin/";
const OUT = process.argv[2] || "shots";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  p.setDefaultTimeout(900000);
  const log = [];
  p.on("pageerror", (e) => log.push(String(e)));
  const tunggu = async (ms = 45000) => {               // tunggu sampai semua ubin peta termuat
    const t0 = Date.now(); let ok = 0;
    while (Date.now() - t0 < ms) {
      const s = await p.evaluate(() => { const v = window.__gnsstwin; if (!v) return false; v.scene.requestRender(); return v.scene.globe.tilesLoaded; }).catch(() => false);
      ok = s ? ok + 1 : 0; if (ok >= 4) break; await p.waitForTimeout(500);
    }
    await p.waitForTimeout(1500);
  };
  const snap = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("ok", n); };
  const nav = async (t) => { await p.click(`.rail >> text=${t}`); await p.waitForTimeout(1500); };
  const panel = async (n) => { await p.locator("aside.panel").screenshot({ path: `${OUT}/${n}.png` }); console.log("ok", n); };
  const tutupToast = async () => { await p.evaluate(() => document.querySelectorAll(".toast button, .toast .x").forEach((x) => x.click())).catch(() => {}); };

  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__gnsstwin, null, { timeout: 120000 });
  await tunggu(60000); await snap("s01_peta");
  await panel("p01_peta");

  // LOD1 dari pandangan miring
  await p.click("button:has-text('Bangunan LOD1')");
  await p.evaluate(() => { const v = window.__gnsstwin, C3 = v.camera.position.constructor;
    v.camera.setView({ destination: C3.fromDegrees(110.3085, -8.0125, 1350), orientation: { heading: 0.31, pitch: -0.66, roll: 0 } }); });
  await p.waitForTimeout(3000); await tunggu(60000); await snap("s02_lod1");
  await p.click("button:has-text('Bangunan LOD1')"); await p.waitForTimeout(500);

  // Sensor
  await nav("Sensor"); await p.click("aside.panel >> text=GNSS-2T").catch(() => {}); await p.waitForTimeout(9000); await tunggu(); await snap("s03_sensor"); await panel("p03_sensor");

  // Gempa
  await nav("Gempa"); await tunggu(60000); await snap("s04_gempa_daftar"); await panel("p04_gempa_daftar");
  await p.click(".gempa-list .row >> nth=0"); await p.waitForTimeout(3500); await tunggu(60000); await snap("s05_gempa_opak"); await panel("p05_gempa_opak");
  await p.click("text=Jalankan skenario gempa"); await p.waitForTimeout(22000); await tunggu(); await snap("s06_gempa_jalan"); await panel("p06_gempa_jalan");
  await nav("Laporan"); await snap("s07_laporan"); await panel("p07_laporan");

  // InaCORS
  await nav("InaCORS"); await p.waitForTimeout(3000); await tunggu(60000); await snap("s08_inacors"); await panel("p08_inacors");

  // Data GNSS: olah RINEX asli DOY 296 (CBTL → CPTS)
  await nav("Data GNSS");
  const D = "data_ppt";
  await p.setInputFiles(".drop input[type=file]", [`${D}/cpts2960.26o.gz`, `${D}/cbtl2960.26o.gz`, `${D}/BRDC00WRD_S_20262960000_01D_MN.rnx.gz`]);
  await p.waitForFunction(() => document.querySelectorAll(".tr.fi").length === 3, null, { timeout: 120000 });
  await p.waitForTimeout(1000); await snap("s09_data_file"); await panel("p09_data_file");
  await p.click("#tombol-olah"); await p.waitForTimeout(15000); await snap("s10_data_proses"); await panel("p10_data_proses");
  await p.waitForSelector("text=HASIL OLAHAN", { timeout: 1500000 });
  await p.waitForTimeout(2000);
  await p.locator(".banding").scrollIntoViewIfNeeded().catch(() => {}); await snap("s11_data_banding"); await panel("p11_data_banding");
  await p.locator(".koord").scrollIntoViewIfNeeded(); await snap("s12_data_koord"); await panel("p12_data_koord");
  await p.locator("text=PERGERAKAN TERHADAP").scrollIntoViewIfNeeded(); await p.waitForTimeout(12000); await snap("s13_data_gerak"); await panel("p13_data_gerak");
  fs.writeFileSync(`${OUT}/log.txt`, log.join("\n"));
  await b.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/galat.txt`, String(e.stack || e)); process.exit(0); });
