// Headless driver. Usage:
//   node tools/play.mjs <scenario.mjs> [width] [height]
// The scenario default-exports an array of steps: { run?: string (page JS, async), shot?: name }.
// Inside `run`, FS is the game and step(n, dt) advances the simulation.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium, devices } = require('playwright');

const scenario = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
const query = process.env.QUERY ?? 'nointro';
const out = path.resolve('shots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctxOpts = process.env.PHONE ? { viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 };
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') { if (!/GPU stall|fonts.googleapis|ERR_|Failed to load resource/.test(t)) errors.push(t); } else if (process.env.LOG) console.log('[page]', t); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto('file://' + path.resolve('index.html') + (query ? '?' + query : ''));
await page.waitForFunction(() => window.FS && window.FS.ready, null, { timeout: 240000 });
await page.evaluate((RENDER) => {
  window.FS.manual = true;
  window.RENDER = RENDER;
  window.step = (n = 1, dt = 1 / 30) => { window.FS.noRender = !window.RENDER; for (let i = 0; i < n; i++) window.FS.update(dt, true); window.FS.noRender = false; };
  window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
}, !!process.env.RENDER);
for (const s of scenario) {
  const t0 = Date.now();
  try {
    if (s.run) {
      const res = await page.evaluate(`(async () => { ${s.run} })()`);
      if (res !== undefined && res !== null) console.log('  =>', typeof res === 'string' ? res : JSON.stringify(res));
    }
    if (s.shot) { await page.evaluate(() => { window.FS.noRender = false; window.FS.update(1 / 60, true); window.FS.update(1 / 60, true); }); await page.screenshot({ path: path.join(out, s.shot + '.png'), animations: 'disabled', timeout: 90000 }); console.log(`shot ${s.shot} ${Date.now() - t0}ms`); }
  } catch (e) { console.log('STEP FAILED:', (s.shot || s.run || '').slice(0, 80), '\n', e.message.split('\n').slice(0, 6).join('\n')); }
}
if (errors.length) console.log('CONSOLE ERRORS:\n' + [...new Set(errors)].slice(0, 25).join('\n'));
else console.log('no console errors');
await browser.close();
