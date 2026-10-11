// Walk the front end with key presses, the way a player would, and screenshot each step.
//   node tools/flow.mjs <base url> <out dir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const state = () => page.evaluate(() => ({ state: window.__app?.state, menu: window.__app?.menus?.id, crafting: !!window.__app?.game?.crafting?.isOpen }));
const waitFor = async (pred, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await state(); if (pred(s)) return s; await page.waitForTimeout(500); } throw new Error(`timed out; last ${JSON.stringify(await state())}`); };
const key = async (k) => { await page.keyboard.down(k); await page.waitForTimeout(150); await page.keyboard.up(k); await page.waitForTimeout(350); };
const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png`, timeout: 120000 }); console.log('shot', n, JSON.stringify(await state())); };
await page.goto(`${base}/`);
await waitFor((s) => s.menu === 'title');
await key('Enter');
await waitFor((s) => s.menu === 'main');
await key('Enter');
await waitFor((s) => s.menu === 'play');
await shot('f1_play');
await key('Enter'); // New World (or Continue)
await waitFor((s) => s.state === 'playing', 180000);
await page.waitForTimeout(2500);
await shot('f2_playing');
await key('KeyE');
await waitFor((s) => s.crafting);
await key('ArrowUp');
await key('ArrowRight');
await shot('f3_craft');
await key('Escape');
await waitFor((s) => !s.crafting);
await key('Escape');
await waitFor((s) => s.state === 'paused');
await shot('f4_pause');
await key('ArrowDown'); await key('Enter');
await waitFor((s) => s.menu === 'options');
await shot('f5_options');
await key('Escape');
await waitFor((s) => s.menu === 'pause');
for (let i = 0; i < 5; i++) await key('ArrowDown');
await key('Enter'); // Save And Quit
await waitFor((s) => s.state === 'menu', 180000);
await shot('f6_back_to_menu');
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
