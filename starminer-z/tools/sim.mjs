// Run the game headless for a while and report what the enemies did (for checking the AI).
//   node tools/sim.mjs <base url> "<query>" <seconds>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [base, q, secs = '20'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/?${q}`);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 120000, polling: 500 });
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < parseFloat(secs)) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    return {
      t: g.time.toFixed(1), hp: Math.round(p.health), dead: p.dead, fps: g.app.fps,
      player: [p.pos.x, p.pos.y, p.pos.z].map((v) => v.toFixed(1)).join(','),
      enemies: g.enemies.list.map((e) => `${e.kind[0]}${e.dead ? 'x' : ''} d=${(e.dist ?? 0).toFixed(1)} y=${(e.pos.y - p.pos.y).toFixed(1)} hp=${e.hp} ${e.hunting ? 'H' : ''}${e.strikeT > 0 ? 'S' : ''}`).join(' | '),
    };
  });
  console.log(JSON.stringify(s));
}
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
