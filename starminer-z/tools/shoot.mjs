// Screenshots of the running game in headless Chromium (software WebGL), for checking the look.
//   node tools/shoot.mjs <base url> <out dir> name=query [name=query ...]
// e.g. node tools/shoot.mjs http://localhost:5173 tools/out day="time=0.3&yaw=3.14"
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, outDir, ...shots] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const W = parseInt(process.env.W || '1280', 10), H = parseInt(process.env.H || '720', 10);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs = [];
for (const s of shots) {
  const i = s.indexOf('=');
  const name = s.slice(0, i), q = s.slice(i + 1);
  const t0 = Date.now();
  // a fresh page each time: a busy one can take too long to navigate away from
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/?${q}`, { waitUntil: 'load', timeout: 120000 });
  const wait = parseInt(process.env.WAIT || '90000', 10);
  try {
    await page.waitForFunction(() => (window.__readiness || 0) >= 1 || window.__shotReady === true, null, { timeout: wait, polling: 500 });
  } catch { logs.push(`[timeout] ${name} readiness=${await page.evaluate(() => window.__readiness)}`); }
  await page.waitForTimeout(parseInt(process.env.SETTLE || '2500', 10));
  try { await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 120000 }); }
  catch (e) { logs.push(`[screenshot failed] ${name}: ${e.message.split('\n')[0]}`); }
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.close();
}
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
