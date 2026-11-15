// Tangkapan tambahan video: grafik sensor GNSS-2T selama replay skenario Sesar Opak.
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
    await p.waitForTimeout(500);
  };
  const info = () => p.evaluate(() => (document.querySelector(".timeline .tlt b") || {}).textContent || "").catch(() => "");
  const snap = async (n) => { await p.screenshot({ path: `${OUT}/${n}.jpg`, type: "jpeg", quality: 90 }); const t = await info(); log.push({ n, t }); console.log("ok", n, t); };
  const nav = async (t) => { await p.click(`.rail >> text=${t}`); await p.waitForTimeout(1000); };
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__gnsstwin, null, { timeout: 120000 });
  await tunggu(60000);
  await nav("Gempa"); await p.click(`aside.panel .row:has-text("Sesar Opak")`).catch(async () => { await p.click(".gempa-list .row >> nth=0"); });
  await p.waitForTimeout(1500);
  await nav("Sensor"); await p.click(`aside.panel .row:has-text("GNSS-2T")`); await p.waitForTimeout(800);
  await p.click(".timeline >> text=Simulasi gempa"); await p.waitForTimeout(300);
  await nav("Sensor"); await p.click(".timeline >> text=1×").catch(() => {});
  await tunggu(5000);
  for (let k = 0; k < 70; k++) { await snap(`g${String(k + 1).padStart(2, "0")}_sensor_sim`); const t = await info(); if (/\+7[0-7] dtk/.test(t)) break; }
  fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1));
  await b.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/galat.txt`, String(e.stack || e)); fs.writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1)); process.exit(0); });
