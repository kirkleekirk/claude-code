// Shared Playwright harness: serves the game, maps the A-Frame CDN to a local copy, collects errors.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const AFRAME = process.env.AFRAME_JS || path.join(ROOT, 'tests', '.cache', 'aframe-master.min.js');
function serve() {
  return new Promise(res => { const srv = http.createServer((req, rsp) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; } rsp.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/javascript' }); fs.createReadStream(f).pipe(rsp); });
    srv.listen(0, () => res(srv)); });
}
async function launch(opts = {}) {
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/aframe.io/**', r => r.fulfill({ path: AFRAME, contentType: 'application/javascript' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/cdn.aframe.io/**', r => r.abort());
  await page.goto(`http://localhost:${port}/index.html?test=1${opts.query || ''}`);
  await page.waitForFunction(() => window.GAME || window.BOOT_ERROR, null, { timeout: 120000 });
  const bootErr = await page.evaluate(() => window.BOOT_ERROR); if (bootErr) throw new Error('BOOT: ' + bootErr);
  // software GL is far slower than a real GPU: stop the free-running loop and render on demand
  await page.evaluate(() => { const s = GAME.G.sceneEl; s.renderer.setAnimationLoop(null); window.__render = () => { const t = performance.now(); s.renderer.render(s.object3D, s.camera); const gl = s.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t; }; });
  return { browser, page, errors, close: async () => { await browser.close(); srv.close(); } };
}
// advance the simulation deterministically by calling the main tick directly
async function step(page, seconds, dt = 1 / 30) { await page.evaluate(([s, dt]) => { const n = Math.round(s / dt); for (let i = 0; i < n; i++) GAME.Main.tick(dt); }, [seconds, dt]); }
async function render(page) { return page.evaluate(() => window.__render()); }
async function shot(page, file) { await render(page); await page.screenshot({ path: file, timeout: 60000 }); }
async function startGame(page, profile) {
  await page.evaluate((p) => { document.getElementById('title').classList.add('hidden'); GAME.Boot.newGame(p); }, profile);
  await page.click('#storySkip').catch(() => {}); await page.evaluate(() => { if (GAME.G.ui.storyOpen) document.getElementById('storySkip').click(); });
}
module.exports = { launch, step, render, shot, startGame, ROOT };
