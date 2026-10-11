// The later version's crash sites, the aliens round them, and the Felguard, in headless Chromium.
//   node tools/checks/crash-sites.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const waitFor = async (fn, arg, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(400); } return false; };
const E = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { await E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png` }); };

// the crater found nearest the tower (by the generator: x -150, z 288)
const CX = -160, CZ = 288;
await page.goto(`${base}/?play&time=0.45&rd=4&q=low&x=${CX + 0.5}&y=120&z=${CZ + 30.5}&yaw=0&pitch=-0.35${extra}`);
ok(await waitFor(() => window.__app?.state === 'playing' && window.__app.game?.ready), 'game starts by the crater');
await page.waitForTimeout(1500);

const site = await E(([cx, cz]) => {
  const g = window.__app.game, w = g.world, gen = w.gen;
  const c = gen.crater(cx, cz);
  const col = [];
  let rock = 0, goo = 0, rockTop = -1;
  for (let y = 0; y < 128; y++) {
    const id = w.getBlock(cx, y, cz);
    if (id === 35) { rock++; rockTop = y; }
    if (id === 34) goo++;
  }
  // round about: how much rock and goo in the asteroid
  let all = 0, allGoo = 0;
  for (let dx = -24; dx <= 24; dx += 2) for (let dz = -24; dz <= 24; dz += 2) for (let y = 20; y < 110; y++) {
    const id = w.getBlock(cx + dx, y, cz + dz);
    if (id === 35) all++; else if (id === 34) allGoo++;
  }
  const above = w.getBlock(cx, rockTop + 1, cz), sky = w.getBlock(cx, rockTop + 20, cz);
  return { c, rock, rockTop, above, sky, all, allGoo };
}, [CX, CZ]);
ok(!!site.c && site.c.rock > 0, `the generator puts an asteroid here (depth ${site.c?.depth}, rock ${site.c?.rock})`);
ok(site.rock > 5 && site.rockTop <= 66 - site.c.depth + site.c.rock - 1 && site.rockTop > 40, `a column of space rock, up to its top or a cave through it (${site.rock} blocks, top ${site.rockTop})`);
ok(site.above === 0 && site.sky === 0, 'and open air over it');
ok(site.all > 1000, `the asteroid is big (${site.all} rock blocks sampled, ${site.allGoo} of goo)`);

// stand on the rock and look round: the aliens come
const aliens = await E(([cx, cz, top]) => {
  const g = window.__app.game, p = g.player, en = g.enemies, I = window.__app.input;
  window.__app.onLockChange = () => {};
  if (window.__app.state === 'paused') window.__app.resume();
  // on the crater's rim, east of the asteroid, a dozen metres off it
  const w = g.world;
  let rx = cx + 40, ry = 0;
  for (let x = cx; x < cx + 80; x++) { let r = false; for (let y = 20; y < 110; y++) if (w.getBlock(x, y, cz) === 35) r = true; if (!r) { rx = x + 13; break; } }
  for (let y = 126; y > 1; y--) if (w.getBlock(rx, y, cz) !== 0) { ry = y + 1; break; }
  p.pos.set(rx + 0.5, ry + 0.1, cz + 0.5); p.vel.set(0, 0, 0); p.fallStart = null;
  const step = (sec, dt = 1 / 30) => { for (let t = 0; t < sec - 1e-9; t += dt) { g.update(dt, I); I.endFrame(); } };
  window.step = step;
  for (const e of en.list) e.gone = true;
  step(0.2);
  // (the dead off: only what's being tested comes)
  en.spawnAboveground = () => {}; en.spawnBelowground = () => {}; en.spawnRandomZombies = () => {};
  // a look round for space rock (three seconds apart, a slice a frame): a fresh one from here
  en.rock.scan = null; en.rock.wait = 0;
  step(2.5);
  const R = { near: en.rock.near, inside: en.rock.inside, closest: en.rock.closest };
  // a wait till the next: then one comes
  en.tAlien = 0; en.nextAlien = 0.5;
  for (let k = 0; k < 20 && !en.list.some((e) => e.type === 51); k++) step(0.25);
  const a = en.list.find((e) => e.type === 51);
  const clip0 = a?.clip.name;
  step(2.5);
  const under = a ? w.getBlock(Math.floor(a.pos.x), Math.floor(a.pos.y) - 1, Math.floor(a.pos.z)) : -1;
  return { R, n: en.list.filter((e) => e.type === 51).length, local: en.localAliens, clip0, clip1: a?.clip.name, state: a?.state.name, dist: a ? Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) : -1, enc: g.stats.alienEncounters, aroused: en.aroused, next: en.nextAlien, under };
}, [CX, CZ, site.rockTop]);
ok(aliens.R.near && aliens.R.closest > 10 && aliens.R.closest < 20, `from the rim, the look round finds the space rock (${aliens.R.closest?.toFixed(1)} away)`);
ok(aliens.n === 1 && aliens.local === 1, `an alien comes (${aliens.n}, counted ${aliens.local})`);
ok(aliens.clip0 === 'Jump', `it comes out jumping (${aliens.clip0}), on the asteroid's face (on ${aliens.under})`);
ok(aliens.clip1 === 'MoveLoop' || aliens.state === 'attack', `and scuttles at the player (${aliens.clip1}, ${aliens.state}, ${aliens.dist.toFixed(1)} m)`);
ok(aliens.enc === 1, `an alien encounter is counted (${aliens.enc})`);
ok(!aliens.aroused && aliens.next >= 10 && aliens.next <= 20, `unroused, the next is 10 to 20 s off (${aliens.next.toFixed(1)})`);
await snap('alien');

// digging the rock rouses them: 10 a block dug, over 20 and they're roused
const rouse = await E(([cx, cz, top]) => {
  const g = window.__app.game, en = g.enemies;
  g.breakBlock({ x: cx + 2, y: top, z: cz, id: 35 }, null);
  const s1 = en.sound;
  g.breakBlock({ x: cx - 2, y: top, z: cz, id: 35 }, null);
  g.breakBlock({ x: cx, y: top, z: cz + 2, id: 35 }, null);
  return { s1, s: en.sound, aroused: en.aroused, next: en.nextAlien };
}, [CX, CZ, site.rockTop]);
ok(rouse.s1 === 10 && rouse.s === 20 && rouse.aroused, `digging the rock is noise: ${rouse.s1}, then ${rouse.s}, and they're roused`);
ok(rouse.next >= 3 && rouse.next <= 7, `roused, the next comes 3 to 7 s on (${rouse.next.toFixed(1)})`);

// the alien takes a quarter of a piercing hit, and dies as its own
const hurt = await E(() => {
  const g = window.__app.game, a = g.enemies.list.find((e) => e.type === 51);
  if (!a) return null;
  const h0 = a.health;
  a.takeDamage(a.pos.y + 1, { dmg: 4, type: 2 });
  const h1 = a.health;
  const hitClip = a.clip.name;
  a.takeDamage(a.pos.y + 1, { dmg: 100, type: 8 });
  window.step(0.2);
  return { h0, h1, hitClip, dead: a.dead, die: a.clip.name };
});
ok(hurt && hurt.h0 === 70 && Math.abs(hurt.h0 - hurt.h1 - 1) < 1e-6, `70 health, and a piercing 4 takes 1 (${hurt?.h0} -> ${hurt?.h1})`);
ok(hurt && /^Damage[12]$/.test(hurt.hitClip), `hit, it reels (${hurt?.hitClip})`);
ok(hurt && hurt.dead && hurt.die === 'Death', `killed, it dies (${hurt?.die})`);

// the Felguard: deep and far out underground, once its timer's out, the first time for sure
const fel = await E(() => {
  const g = window.__app.game, en = g.enemies;
  const early = [0, 0, 0, 0, 0].map(() => en.belowgroundType(50, 3500));
  // (that deep it's the top of the range: two times in five)
  let first = 0;
  for (let k = 0; k < 40 && first !== 50; k++) { en.felguardT = 0; first = en.belowgroundType(50, 3500); }
  const met = en.felguardMet, reset = en.felguardT;
  // and on the surface, once met, now and then
  en.felguardT = 0;
  let surface = 0;
  for (let k = 0; k < 400 && !surface; k++) { if (en.zombieType(100) === 50) surface = k + 1; en.felguardT = 0; }
  return { early, first, met, reset, surface };
});
ok(!fel.early.includes(50), `not before its five minutes are up (${fel.early.join(',')})`);
ok(fel.first === 50 && fel.met && fel.reset === 300, `then deep and far out, the Felguard (${fel.first}), and its timer starts again (${fel.reset} s)`);
ok(fel.surface > 0, `once met, one of the dead on the surface may be one (after ${fel.surface} tries)`);

const felguard = await E(([cx, cz, top]) => {
  const g = window.__app.game, p = g.player, en = g.enemies;
  for (const e of en.list) e.gone = true;
  window.step(0.1);
  const f = en.spawn(50, cx + 6.5, top + 1.1, cz + 0.5, 0);
  const clip0 = f.clip.name, hp = f.health;
  window.step(3.6);
  const clip1 = f.clip.name;
  f.takeDamage(f.pos.y + 1, { dmg: 10, type: 2 });
  const afterPierce = f.health;
  const T = f.T;
  return { clip0, clip1, hp, afterPierce, state: f.state.name, kind: f.kind, strike: T.bulletStrike, r: T.spawnRadius };
}, [CX, CZ, site.rockTop]);
ok(felguard.kind === 'felguard' && felguard.hp === 140 && felguard.strike === 0.6, `the Felguard: 140 health, bullets through it four times in ten (${felguard.hp}, ${felguard.strike})`);
ok(felguard.clip0 === 'Idle', `it comes in standing (${felguard.clip0})`);
ok(/^(walk|run|Attack1|atack_3|Idle)$/.test(felguard.clip1), `then comes at the player (${felguard.clip1}, ${felguard.state})`);
ok(felguard.hp - felguard.afterPierce === 5, `a piercing 10 takes 5 off it (${felguard.hp} -> ${felguard.afterPierce})`);
await snap('felguard');

// a view of the crater from its rim
await E(([cx, cz, top]) => {
  const g = window.__app.game, p = g.player, en = g.enemies;
  for (const e of en.list) if (e.type !== 50) e.gone = true;
  p.pos.set(cx + 0.5, top + 14, cz + 34.5); p.vel.set(0, 0, 0);
  p.yaw = 0; p.pitch = -0.32;
  window.step(0.3);
}, [CX, CZ, site.rockTop]);
await page.waitForTimeout(2500);
await snap('crater');

const errs = logs.filter((l) => !/favicon|GPU stall|WebGL|Automatic fallback/.test(l));
ok(errs.length === 0, `no errors${errs.length ? `: ${errs.slice(0, 4).join(' | ')}` : ''}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
