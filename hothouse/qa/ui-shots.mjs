// UI screenshots from the lab: every screen (or a filtered list) at one resolution and UI scale.
// Usage: node qa/ui-shots.mjs [--size 1280x720] [--scale 100] [--input pointer|keyboard|gamepad] [--bg art|bright|night] [screen …]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, OUT, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const scale = opt('scale', '100');
const input = opt('input', 'pointer');
const bg = opt('bg', 'art');
const wait = Number(opt('wait', '900'));
const only = args;

const dir = resolve(OUT, 'ui', `${w}x${h}-${scale}${input !== 'pointer' ? `-${input}` : ''}${bg !== 'art' ? `-${bg}` : ''}`);
mkdirSync(dir, { recursive: true });

const server = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
await page.goto(`${server.url}ui-lab.html?qa=1&scale=${scale}&input=${input}&bg=${bg}&screen=components`);
await page.waitForFunction(() => globalThis.__UILAB__?.ready === true, null, { timeout: 60000 });
const screens = only.length ? only : await page.evaluate(() => [...globalThis.__UILAB__.screens]);
for (const s of screens) {
  await page.evaluate((id) => globalThis.__UILAB__.open(id), s);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: resolve(dir, `${s}.png`) });
}
console.log(`${screens.length} screenshots → ${dir}`);
if (problems.length) console.log(`console problems:\n${problems.join('\n')}`);
await browser.close();
await server.close();
process.exit(problems.length ? 1 : 0);
