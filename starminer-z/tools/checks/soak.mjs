// A long unattended game in each mode, in headless Chromium: at night (the dead about), the
// clock sped up, someone at the controls at random (walking, jumping, shooting, digging, putting
// blocks down, changing what's in hand, the inventory, pausing, dying and coming back). Fails on
// any error in the page, or anything's position going to NaN.
//   node tools/checks/soak.mjs <dev server url> <out dir> [extra query, e.g. &nocmz] [seconds per mode]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = '', secs = '75'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const MODES = [
  ['Endurance', ''],
  ['Survival, Normal', '&mode=survival&diff=normal'],
  ['Survival, Hardcore', '&mode=survival&diff=hardcore'],
  ['Creative', '&mode=survival&diff=easy&creative'],
  ['Dragon Endurance', '&mode=dragon&diff=easy'],
];
for (const [name, q] of MODES) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message} ${e.stack?.split('\n')[1]?.trim() ?? ''}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`); });
  await page.goto(`${base}/?play&rd=4&q=low&time=0.9&simfast=3${q}${extra}`);
  await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
  // someone at the controls
  await page.evaluate(() => {
    const app = window.__app, I = app.input;
    app.onLockChange = () => {};
    const rnd = (a, b) => a + Math.random() * (b - a);
    const keys = ['fwd', 'back', 'left', 'right'];
    window.__soak = { deaths: 0, bad: [], ticks: 0 };
    const tick = () => {
      const g = app.game, p = g.player, S = window.__soak;
      S.ticks++;
      // (paused a moment, then back: nothing pressed on the menu, where it could pick anything)
      if (app.state === 'paused') { app.resume(); return; }
      if (app.state === 'playing' && Math.random() < 0.03) { for (const k of [...keys, 'jump', 'primary', 'secondary', 'reload']) I.up(k); app.pause(); return; }
      if (p.dead) { S.deaths += g.deathShown && !S.wasDead ? 1 : 0; S.wasDead = true; I.down('accept'); setTimeout(() => I.up('accept'), 60); return; }
      S.wasDead = false;
      for (const k of keys) I.up(k);
      if (Math.random() < 0.8) I.down(keys[Math.floor(Math.random() * 4)]);
      if (Math.random() < 0.6) I.down('fwd');
      if (Math.random() < 0.3) { I.down('jump'); setTimeout(() => I.up('jump'), 80); }
      p.yaw += rnd(-0.8, 0.8);
      p.pitch = rnd(-0.6, 0.3);
      if (Math.random() < 0.25) g.inventory.select(Math.floor(Math.random() * 8));
      if (Math.random() < 0.5) { I.down('primary'); setTimeout(() => I.up('primary'), rnd(100, 900)); }
      if (Math.random() < 0.15) { I.down('secondary'); setTimeout(() => I.up('secondary'), rnd(100, 600)); }
      if (Math.random() < 0.1) { I.down('reload'); setTimeout(() => I.up('reload'), 60); }
      if (Math.random() < 0.05) { g.openCrafting(); setTimeout(() => g.crafting?.close?.(), 500); }
      // anything gone to NaN
      const bad = (v, what) => { if (![v.x, v.y, v.z].every(Number.isFinite)) S.bad.push(what); };
      bad(p.pos, 'player'); bad(p.vel, 'player velocity');
      for (const e of g.enemies.list) bad(e.pos, `enemy ${e.type?.name ?? e.nid}`);
      if (g.dragons.client) bad(g.dragons.client.pos, 'dragon');
    };
    window.__soakIv = setInterval(tick, 400);
    // a few things to hand: a gun with bullets, blocks, a grenade, TNT
    const inv = app.game.inventory;
    inv.slots[2] = inv.make('assault', 1); inv.add('bullets', 400); inv.slots[5] = inv.make('dirt', 64); inv.slots[6] = inv.make('grenade', 8); inv.slots[7] = inv.make('tnt', 8);
  });
  await page.waitForTimeout(+secs * 1000);
  const r = await page.evaluate(() => {
    clearInterval(window.__soakIv);
    const g = window.__app.game, S = window.__soak;
    return { ticks: S.ticks, deaths: S.deaths, bad: [...new Set(S.bad)], day: g.dayNumber, enemies: g.enemies.list.length, dragon: !!g.dragons.client, kills: g.stats.kills, state: window.__app.state };
  });
  await page.screenshot({ path: `${out}/soak-${name.replace(/\W+/g, '-').toLowerCase()}.png`, timeout: 120000 });
  console.log(`${name}: ${JSON.stringify(r)}`);
  ok(errors.length === 0, `${name}: no errors in the page${errors.length ? `\n      ${[...new Set(errors)].slice(0, 6).join('\n      ')}` : ''}`);
  ok(r.bad.length === 0, `${name}: nothing's position went to NaN${r.bad.length ? ` (${r.bad.join(', ')})` : ''}`);
  ok(r.ticks > +secs * 0.6, `${name}: it kept playing (${r.ticks} turns at the controls)`);
  await ctx.close();
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
process.exit(fails ? 1 : 0);
