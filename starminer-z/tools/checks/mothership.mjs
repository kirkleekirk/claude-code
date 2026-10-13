// The alien ship (game/mothership.js), in headless Chromium: it comes in over you, shines its
// light and sends its drones down; a drone's eye shot from on top sends you up into the hall;
// the light lets you down gently; the nodes, the shield and the core, its shots and its aliens;
// the ship brought down, you let down, and its loot; kept on the ground when saved up there;
// another that's left alone, leaving; and when one may come.
//   node tools/checks/mothership.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
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
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 5).join('\n')}`));
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const E = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { await E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png` }); };

// (out in the Desert, where it's flat; ?ufo: one comes at once)
await page.goto(`${base}/?play&ufo&time=0.45&rd=6&q=low&x=1300.5&z=0.5&y=69${extra}`);
await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
await E(async () => {
  const app = window.__app, g = app.game, p = g.player, I = app.input;
  app.onLockChange = () => {};
  for (const e of g.enemies.list) e.gone = true;
  g.enemies.spawning = () => {};
  const { ITEMS } = await import('/src/items/items.js');
  for (const it of Object.values(ITEMS)) if (it.kind === 'gun') { it.inaccuracy = 0; it.recoil = 0; }
  const { SHIP } = await import('/src/game/mothership.js');
  const { B } = await import('/src/world/blocks.js');
  window.SHIP = SHIP; window.B = B;
  // what hurts the player, counted (and kept from killing them)
  window.hurts = [];
  const hurt = p.hurt.bind(p);
  p.hurt = (amount, from, kind) => { window.hurts.push({ amount, kind }); if (window.realHurt) hurt(amount, from, kind); };
  window.T = {
    step(sec, dt = 1 / 30) { for (let t = 0; t < sec - 1e-9; t += dt) { g.update(dt, I); I.endFrame(); } },
    aim(tx, ty, tz) { const e = p.eye, dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz); p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(dy / l); },
    hold(id, n = 1) { g.inventory.slots[0] = g.inventory.make(id, n); g.inventory.select(0); g.cooldown = 0; this.step(0.1); },
    // one shot at (x, y, z), the gun kept loaded
    shoot(x, y, z) { this.aim(x, y, z); g.reloading = 0; if (g.inventory.held) g.inventory.held.mag = 30; g.cooldown = 0; I.down('primary'); this.step(1 / 30); I.up('primary'); this.step(0.1); },
    at(x, y, z) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallStart = null; this.step(0.2); },
  };
});

// ---- it comes -------------------------------------------------------------------------------
const s1 = await E(() => {
  const g = window.__app.game, M = g.mothership, v = M.visit, p = g.player;
  if (!v) return null;
  const far = v.shipAt(new p.pos.constructor()).distanceTo(v.origin);
  // (on its way in: how near it comes to right over you, and how high it is then)
  let over = Infinity, overY = 0;
  for (let t = 0; t <= SHIP.ARRIVE; t += 0.05) {
    v.t = t;
    const at = v.shipAt(new p.pos.constructor()), d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z);
    if (d < over) { over = d; overY = at.y; }
  }
  v.t = SHIP.ARRIVE + 0.5; T.step(0.1);
  const here = v.shipAt(new p.pos.constructor()).distanceTo(v.origin);
  const away = Math.hypot(v.origin.x - p.pos.x, v.origin.z - p.pos.z);
  v.t = SHIP.BEAM_ON + 3; T.step(1.5);
  const beam = g.app.terrain.uniforms.uBeam.value;
  return { far, here, away, over, overY, y: v.origin.y, beam: v.beam.beam.visible, light: beam.w, hull: g.world.getBlock(v.hx + 3, SHIP.FLOOR - 1, v.hz), hole: g.world.getBlock(v.hx, SHIP.FLOOR - 1, v.hz), msg: g.hud.feed.map((f) => f.el.textContent) };
});
console.log(JSON.stringify(s1));
ok(!!s1, 'with ?ufo, a ship comes as soon as the game starts');
ok(s1 && s1.far > 300 && s1.here < 1, `in from far off (${s1?.far.toFixed(0)} m), to where it stops`);
ok(s1 && s1.over < 1 && s1.overY > 128, `on its way in it flies right over you (${s1?.over.toFixed(2)} m off, at y ${s1?.overY.toFixed(0)})`);
ok(s1 && s1.away > 15 && s1.away < 30 && s1.y > 128, `and stops about 20 m past you (${s1?.away.toFixed(1)}), over the top of the world (y ${s1?.y})`);
ok(s1 && s1.msg.includes('An alien ship has come'), 'its alarm, and word of it');
ok(s1 && s1.beam && s1.light > 0.3, `its light shines down, on the ground too (${s1?.light.toFixed(2)})`);
ok(s1 && s1.hull === B_HULL() && s1.hole === 0, "its floor is solid hull, but for the hole in its middle");
function B_HULL() { return 46; }
await E(() => { const g = window.__app.game, v = g.mothership.visit, p = g.player; T.aim(v.origin.x, v.origin.y - 3, v.origin.z); });
await snap('1-overhead');

// ---- its drones -------------------------------------------------------------------------------
const s2 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, w = g.world;
  v.t = SHIP.DRONE_FIRST + SHIP.DRONE_FALL * 0.5; T.step(0.1);
  const falling = v.drones[0].state;
  v.t = SHIP.DRONE_FIRST + 7 * SHIP.DRONE_EVERY + SHIP.DRONE_FALL + 1; T.step(0.3);
  const ds = v.drones.map((d) => ({ st: d.state, r: Math.hypot(d.lx + 0.5 - v.origin.x, d.lz + 0.5 - v.origin.z), body: w.getBlock(d.lx + 1, d.base, d.lz - 1), top: w.getBlock(d.lx, d.base + 1, d.lz), above: w.getBlock(d.lx, d.base + 2, d.lz) }));
  return { falling, ds };
});
console.log(JSON.stringify(s2));
ok(s2.falling === 'falling', 'a drone dives out of it');
ok(s2.ds.length === 8 && s2.ds.every((d) => d.st === 'landed'), `eight of them, one every ${'9'} seconds (${s2.ds.map((d) => d.st).join(', ')})`);
ok(s2.ds.every((d) => d.r > 6 && d.r < 12.5), `round the foot of the light (${s2.ds.map((d) => d.r.toFixed(1)).join(', ')} m out)`);
ok(s2.ds.every((d) => d.body === 46 && d.top === 46 && d.above === 0), 'each a solid pod, two blocks high, to stand on');
await E(() => { const g = window.__app.game, v = g.mothership.visit, d = v.drones[0]; T.at(v.origin.x + 14, 69, v.origin.z + 2); T.aim(d.lx + 0.5, d.base + 1, d.lz + 0.5); });
await snap('2-drones');

// ---- up --------------------------------------------------------------------------------------
const s3 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, p = g.player;
  const d = v.drones.find((x) => x.state === 'landed' && !x.spent);
  T.hold('pistol', 1);
  // from the ground: it shrugs it off
  T.at(d.lx + 3.5, d.base, d.lz + 0.5);
  for (let k = 0; k < 6; k++) T.shoot(d.lx + 0.5, d.base + 2.42, d.lz + 0.5);
  const fromGround = { hits: d.hits, spent: d.spent, hint: g.hud.hintEl.textContent };
  // from on top of it
  T.at(d.lx + 1.4, d.base + 2.02, d.lz + 0.5);
  const on = v.standingOn(d, p);
  let k = 0;
  for (; k < 8 && !v.lift; k++) T.shoot(d.lx + 0.5, d.base + 2.42, d.lz + 0.5);
  const lifting = !!v.lift && p.carried;
  return { fromGround, on, shots: k, spent: d.spent, lifting, i: d.i };
});
console.log(JSON.stringify(s3));
ok(s3.fromGround.hits === 0 && !s3.fromGround.spent && /get on top/.test(s3.fromGround.hint), `shot from the ground, a drone's eye shrugs it off ("${s3.fromGround.hint}")`);
ok(s3.on && s3.shots === 5 && s3.spent && s3.lifting, `stood on, five shots in its eye and it gives way, and the light takes you up (${s3.shots})`);
await snap('3-lifting');
const s4 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, p = g.player;
  T.step(5);
  return { lift: !!v.lift, carried: p.carried, y: p.pos.y, inside: v.inside(), under: g.world.getBlock(p.pos.x, p.pos.y - 0.5, p.pos.z), boss: g.hud.bossEl.classList.contains('on'), hint: g.hud.hintEl.textContent };
});
console.log(JSON.stringify(s4));
ok(!s4.lift && !s4.carried && s4.inside && Math.abs(s4.y - SHIP_FLOOR()) < 0.05 && s4.under === 46, `up through the middle of the ship, onto the hall's floor (y ${s4.y.toFixed(2)})`);
function SHIP_FLOOR() { return 134; }
ok(s4.boss && /power nodes/.test(s4.hint), `the core's bar, and what to do ("${s4.hint}")`);
await E(() => { const g = window.__app.game, v = g.mothership.visit; T.aim(v.origin.x, SHIP.FLOOR + SHIP.CORE_Y, v.origin.z); });
await snap('4-hall');

// ---- the light lets you down gently ----------------------------------------------------------
const s5 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, p = g.player;
  window.hurts.length = 0;
  T.at(v.origin.x, SHIP.FLOOR + 0.1, v.origin.z);
  let fastest = 0, n = 0;
  while (!p.onGround && n++ < 900) { T.step(1 / 30); fastest = Math.min(fastest, p.vel.y); }
  // (the fall's: an alien by the hole may land a blow on the way, and that's as it should be)
  const fall = { fastest, y: p.pos.y, hurt: window.hurts.filter((h) => h.kind === 'fall').length, kinds: window.hurts.map((h) => h.kind), on: g.world.getBlock(p.pos.x, p.pos.y - 0.5, p.pos.z) };
  // back up (another drone)
  const d = v.drones.find((x) => x.state === 'landed' && !x.spent);
  T.at(d.lx + 1.4, d.base + 2.02, d.lz + 0.5);
  for (let k = 0; k < 8 && !v.lift; k++) T.shoot(d.lx + 0.5, d.base + 2.42, d.lz + 0.5);
  T.step(5);
  return { ...fall, back: v.inside() };
});
console.log(JSON.stringify(s5));
ok(s5.fastest > -3.7 && s5.y < SHIP_FLOOR() - 20 && s5.hurt === 0, `down the hole, the light lets you down slowly, unhurt by the fall (at most ${(-s5.fastest).toFixed(2)} m/s, to y ${s5.y.toFixed(1)}; hurt by ${s5.kinds.join(', ') || 'nothing'})`);
ok(s5.back, 'and another drone takes you up again');

// ---- inside: the nodes, the shield, the core; its shots and aliens ------------------------------
const s6 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, p = g.player;
  window.hurts.length = 0;
  T.hold('laser_assault_diamond', 1);
  // the core, shielded: nothing
  T.at(v.origin.x + 6, SHIP.FLOOR + 0.001, v.origin.z + 1);
  for (let k = 0; k < 5; k++) T.shoot(v.origin.x, SHIP.FLOOR + SHIP.CORE_Y, v.origin.z);
  const shielded = { core: v.core, shielded: v.shielded };
  // its nodes, from beside each
  const nodes = [];
  SHIP.NODES.forEach(([x, z], k) => {
    const l = Math.hypot(x, z);
    T.at(v.origin.x + x + (x / l) * 2.5 + 1.2, SHIP.FLOOR + 0.001, v.origin.z + z + (z / l) * 2.5 + 1.2);
    let n = 0;
    while (v.nodes[k] > 0 && n++ < 40) T.shoot(v.origin.x + x, SHIP.FLOOR + SHIP.NODE_Y, v.origin.z + z);
    nodes.push(n);
  });
  const bar = g.hud.bossEl.classList.contains('shielded');
  const bolts = window.hurts.filter((h) => h.kind === 'bolt').length;
  const aliens = v.aliens.length;
  return { shielded, nodes, after: { shielded: v.shielded, bar, msg: g.hud.feed.map((f) => f.el.textContent) }, bolts, aliens };
});
console.log(JSON.stringify(s6));
ok(s6.shielded.core === 600 && s6.shielded.shielded, 'the core, while its nodes stand, is shielded: shots do nothing to it');
ok(s6.nodes.every((n) => n === 10), `its four power nodes break (10 diamond laser shots each: ${s6.nodes.join(', ')})`);
ok(!s6.after.shielded && !s6.after.bar && s6.after.msg.includes("The core's shield is down!"), 'and its shield drops');
ok(s6.bolts > 0, `the core shoots at whoever's in the hall (${s6.bolts} hits)`);
ok(s6.aliens > 0, `and aliens beam in (${s6.aliens})`);
await E(() => { const g = window.__app.game, v = g.mothership.visit; T.at(v.origin.x + 6, SHIP.FLOOR + 0.001, v.origin.z + 1); T.aim(v.origin.x, SHIP.FLOOR + SHIP.CORE_Y, v.origin.z); });
await snap('5-bare-core');
const s7 = await E(() => {
  const g = window.__app.game, v = g.mothership.visit, p = g.player;
  const before = new Set(g.inventory.slots.filter(Boolean).map((s) => s.id));
  let n = 0;
  while (v.core > 0 && n++ < 80) T.shoot(v.origin.x, SHIP.FLOOR + SHIP.CORE_Y, v.origin.z);
  const down = { shots: n, end: v.end };
  T.step(1);
  const msg = g.hud.feed.map((f) => f.el.textContent);
  T.step(7);
  const got = g.inventory.slots.filter(Boolean).map((s) => s.id).filter((id) => !before.has(id) || id === 'diamond' || id === 'bullets_laser');
  // (what's under their feet: the columns they stand over, on the edge of one maybe)
  const r = p.radius, under = [[-r, -r], [r, -r], [-r, r], [r, r]].map(([dx, dz]) => g.world.getBlock(p.pos.x + dx, p.pos.y - 0.5, p.pos.z + dz));
  return { ...down, msg, y: p.pos.y, carried: p.carried, onGround: p.onGround, under, got };
});
console.log(JSON.stringify(s7));
ok(s7.end === 'down' && s7.shots === 40, `the core taken down (${s7.shots} shots): the ship's going down`);
ok(s7.msg.includes('The ship is going down!'), 'and its alarm');
ok(!s7.carried && s7.onGround && s7.y < SHIP_FLOOR() - 20 && s7.under.some((id) => id) && !s7.under.includes(46), `you're let down the light to the ground (y ${s7.y.toFixed(1)}, on ${s7.under.join(' ')})`);
ok(s7.got.some((id) => /^laser_.*_diamond$/.test(id)) && s7.got.includes('slime') && s7.got.includes('diamond') && s7.got.includes('bullets_laser'), `its loot: ${s7.got.join(', ')}`);
await E(() => { const g = window.__app.game, p = g.player; p.pitch = 0.9; });
await snap('6-gone');
const s8 = await E(() => { const g = window.__app.game; T.step(5); return { visit: !!g.mothership.visit, overlay: !!g.world.overlay, light: g.app.terrain.uniforms.uBeam.value.w }; });
ok(!s8.visit && !s8.overlay && s8.light === 0, 'then it all goes: the ship, its hull, its light');

// ---- saved up there: kept on the ground ------------------------------------------------------
const s9 = await E(() => {
  const g = window.__app.game, M = g.mothership, p = g.player;
  M.begin(12345, Math.floor(p.pos.x) + 20, Math.floor(p.pos.z), SHIP.DRONE_FIRST + 30);
  const v = M.visit;
  T.step(0.3);
  T.at(v.origin.x + 4, SHIP.FLOOR + 0.001, v.origin.z);
  const kept = g.serialize().player;
  // left alone, it goes
  v.t = SHIP.LEAVE_AT - 1;
  T.step(2);
  const end = v.end;
  T.step(4);
  const letDown = { y: p.pos.y, inside: v.inside() };
  T.step(30);
  return { kept, end, letDown, over: !M.visit, overlay: !!g.world.overlay };
});
console.log(JSON.stringify(s9));
ok(s9.kept.y < SHIP_FLOOR() - 20, `saved while up there, you're kept on the ground under it (y ${s9.kept.y.toFixed(1)})`);
ok(s9.end === 'gone' && !s9.letDown.inside, 'left alone, it leaves when its time is up, letting down whoever is in it');
ok(s9.over && !s9.overlay, 'and goes');

// ---- when one comes ----------------------------------------------------------------------------
// (without ?ufo: from the second day on, not with No Enemies, nor in Dragon Endurance)
await page.goto(`${base}/?play&time=0.45&rd=4&q=low${extra}`);
await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });
const s10 = await E(() => {
  const app = window.__app, g = app.game, M = g.mothership, I = app.input;
  app.onLockChange = () => {};
  // (just the ship's part of a frame: nothing else is to happen meanwhile)
  const tryNow = () => { M.wait = 0; for (let k = 0; k < 6; k++) M.update(1 / 30, true); const came = !!M.visit; M.clear(); return came; };
  const r = { firstDay: tryNow() };
  app.sky.setTime(0.5, 3);
  r.thirdDay = tryNow();
  r.next = M.wait;
  const diff = g.difficulty, mode = g.mode;
  g.difficulty = 'noenemies';
  r.noEnemies = tryNow();
  g.difficulty = diff;
  g.mode = 'dragon';
  r.dragon = tryNow();
  g.mode = mode;
  // and only to someone up in the open, not down a mine
  g.player.pos.y = 30;
  M.wait = 0; M.update(1 / 30, true);
  r.mine = !!M.visit; r.retry = M.wait;
  M.clear();
  return r;
});
console.log(JSON.stringify(s10));
ok(!s10.firstDay && s10.thirdDay, 'without ?ufo: none on the first day; after it, one comes when its time is up');
ok(s10.next >= 20 * 60 && s10.next < 60 * 60, `the next 20 to 60 minutes of play off (${(s10.next / 60).toFixed(1)})`);
ok(!s10.noEnemies && !s10.dragon, 'none with No Enemies, nor in Dragon Endurance');
ok(!s10.mine && s10.retry === 30, 'and none to someone down a mine (another look in half a minute)');
ok(logs.length === 0, `no errors${logs.length ? ': ' + logs.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
