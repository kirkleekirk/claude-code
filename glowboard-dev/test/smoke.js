// Full-match smoke test through the real UI path (renderer, director, HUD) in headless Chromium.
// node test/smoke.js [games=12] [w=390] [h=844]
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

(async () => {
  const games = +(process.argv[2] || 12), w = +(process.argv[3] || 390), h = +(process.argv[4] || 844);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'glowboard.html') + '#autoplay=' + games);
  // frame-time probe
  await page.evaluate(() => { window.__ft = []; let last = performance.now(); const f = t => { window.__ft.push(t - last); last = t; if (window.__ft.length < 100000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t0 = Date.now();
  while (Date.now() - t0 < games * 90000) {
    await page.waitForTimeout(2000);
    const done = await page.evaluate(() => !!(window.CW && window.CW.done));
    if (done) break;
  }
  const res = await page.evaluate(() => {
    const ft = window.__ft.slice(10).sort((a, b) => a - b);
    const pct = p => ft[Math.min(ft.length - 1, Math.floor(ft.length * p))];
    return { stats: window.CW.stats, done: !!window.CW.done, frames: ft.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, nodes: document.getElementsByTagName('*').length };
  });
  console.log(JSON.stringify(res, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 30).join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length || !res.done ? 1 : 0);
})();
