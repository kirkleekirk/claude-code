// Headless screenshot harness. Usage:
//   node tools/shot.mjs '<json array of shots>' [width] [height]
// Each shot: { name, planet?, view:[x,y,z,yaw,pitch,fov?], time?, steps?, eval? }
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright');

const shots = JSON.parse(process.argv[2] || '[]');
const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
const query = process.env.QUERY || '';
const out = path.resolve('shots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-web-security'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); else if (process.env.LOG) console.log("[page]", m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('file://' + path.resolve('index.html') + (query ? '?' + query : ''));
await page.waitForFunction(() => window.FS && window.FS.ready, null, { timeout: 180000 });
await page.evaluate(() => { window.FS.manual = true; });
let curPlanet = null;
for (const s of shots) {
  const t0 = Date.now();
  if (s.planet && s.planet !== curPlanet) {
    await page.evaluate((p) => window.FS.load(p), s.planet);
    curPlanet = s.planet;
  }
  await page.evaluate((s) => {
    const FS = window.FS;
    FS.freeze = true;
    if (s.time !== undefined) FS.sky.time = s.time;
    if (s.view) FS.view(...s.view);
    if (s.eval) (0, eval)(s.eval);
    const n = s.steps || 4;
    for (let i = 0; i < n; i++) FS.step(1 / 30);
  }, s);
  await page.screenshot({ path: path.join(out, s.name + '.png') });
  console.log(`shot ${s.name} ${Date.now() - t0}ms`);
}
if (errors.length) console.log('CONSOLE:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
