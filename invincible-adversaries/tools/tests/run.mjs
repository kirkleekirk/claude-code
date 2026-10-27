// Headless game tests. Serve the game (npm start), then: node tests/run.mjs [nameFilter] [--file x.test.js]
// GAME_URL overrides http://localhost:5173/. Exits non-zero when any test fails.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const filter = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--file') || '';
const files = fileArg ? [fileArg] : fs.readdirSync(here).filter((f) => f.endsWith('.test.js')).sort();
const GAME = process.env.GAME_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let failed = 0, total = 0;
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(`${GAME}?manual&capture&quality=low`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 240000 });
  await page.addScriptTag({ path: path.join(here, 'lib.js') });
  await page.addScriptTag({ path: path.join(here, f) });
  const t0 = Date.now();
  const results = await page.evaluate((flt) => window.T.runAll(flt), filter);
  console.log(`\n${f}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const r of results) {
    total++;
    const ok = r.fail.length === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.ms} ms`);
    for (const m of r.info) console.log(`        · ${m}`);
    for (const m of r.fail.slice(0, 12)) console.log(`        ✗ ${m}`);
    if (r.fail.length > 12) console.log(`        … ${r.fail.length - 12} more`);
  }
  if (consoleErrors.length) { failed++; console.log(`  FAIL  console errors in ${f}:`); for (const e of consoleErrors.slice(0, 10)) console.log(`        ✗ ${e}`); }
  await page.close();
}
await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
