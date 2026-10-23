// node timeline.mjs <director.js> <out.json>: prints the shot list and total length
import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`${process.env.GAME_URL || 'http://localhost:5173/'}?manual&capture&quality=low`);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 240000 });
await page.addScriptTag({ path: process.argv[2] });
const r = await page.evaluate(() => ({ total: TR.total, list: TR.list() }));
fs.writeFileSync(process.argv[3], JSON.stringify(r, null, 1));
for (const s of r.list) console.log(String(s.i).padStart(2), s.t0.toFixed(2).padStart(6), (s.t0 + s.dur).toFixed(2).padStart(6), s.id);
console.log('total', r.total);
await browser.close();
