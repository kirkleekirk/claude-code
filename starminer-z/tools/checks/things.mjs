// The later version's new things, in headless Chromium: bullets and bolts in flight, TNT and C4,
// grenades, rockets, doors, crates, the locator and teleporter, the clock.
//   node tools/checks/things.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
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
const waitFor = async (fn, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(400); } return false; };
const E = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`${base}/?play&time=0.45&rd=4&q=low${extra}`);
ok(await waitFor(() => E(() => window.__app?.state === 'playing' && window.__app.game?.ready)), 'game starts');
await page.waitForTimeout(1000);

// the test bench: a stone floor round the player, clear above; helpers to aim, to step the game
// on without drawing, and to press things
await E(async () => {
  const { B } = await import('/src/world/blocks.js');
  const app = window.__app, g = app.game, p = g.player, w = g.world, I = app.input;
  window.B = B;
  const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
    w.setBlock(x0 + dx, y0, z0 + dz, B.BEDROCK);
    w.setBlock(x0 + dx, y0 - 1, z0 + dz, B.BEDROCK);
    for (let y = y0 + 1; y <= y0 + 8; y++) w.setBlock(x0 + dx, y, z0 + dz, B.AIR);
  }
  p.pos.set(x0 + 0.5, y0 + 1, z0 + 0.5);
  p.vel.set(0, 0, 0);
  for (const e of g.enemies.list) e.gone = true;
  g.enemies.spawning = () => {};
  // (headless, the mouse is never really taken: don't pause for it)
  app.onLockChange = () => {};
  window.T = {
    x0, y0, z0,
    step(sec, dt = 1 / 30) { for (let t = 0; t < sec - 1e-9; t += dt) { g.update(dt, I); I.endFrame(); } },
    aim(tx, ty, tz) {
      const e = p.eye, dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(dy / l);
    },
    hold(id, n = 1) { g.inventory.slots[0] = g.inventory.make(id, n); g.inventory.select(0); g.cooldown = 0; this.step(0.1); },
    press(a, sec = 0.05) { I.down(a); this.step(sec); I.up(a); this.step(1 / 30); },
    at(dx, dy, dz) { return w.getBlock(x0 + dx, y0 + dy, z0 + dz); },
    set(dx, dy, dz, id) { w.setBlock(x0 + dx, y0 + dy, z0 + dz, id); },
    reset(dx = 0, dz = 0) {
      for (let a = -12; a <= 12; a++) for (let b = -12; b <= 12; b++) {
        if (w.getBlock(x0 + a, y0, z0 + b) !== B.BEDROCK) w.setBlock(x0 + a, y0, z0 + b, B.BEDROCK);
        for (let y = y0 + 1; y <= y0 + 8; y++) if (w.getBlock(x0 + a, y, z0 + b) !== B.AIR) w.setBlock(x0 + a, y, z0 + b, B.AIR);
      }
      for (const e of g.enemies.list) e.gone = true;
      g.projectiles.bullets.length = 0; for (const k of ['bolts', 'grenades', 'rockets']) { for (const o of g.projectiles[k]) o.mesh.removeFromParent(); g.projectiles[k].length = 0; }
      g.explosives.fuses.length = 0;
      g.drops.clear();
      if (p.dead) g.respawn();
      // (headless, the mouse can't be taken back after a screen: the game pauses itself)
      if (window.__app.state === 'paused') window.__app.resume();
      p.dead = false; p.health = p.maxHealth;
      p.pos.set(x0 + dx + 0.5, y0 + 1, z0 + dz + 0.5); p.vel.set(0, 0, 0); p.fallStart = null;
      g.recoil.identity(); g.cooldown = 0; g.reloading = 0; g.grenade = null; g.spent = null;
      this.step(0.1);
      return { dead: p.dead, state: window.__app.state };
    },
  };
  // (the guns shoot straight for the tests)
  const { ITEMS } = await import('/src/items/items.js');
  for (const it of Object.values(ITEMS)) if (it.kind === 'gun') { it.inaccuracy = 0; it.recoil = 0; }
  T.step(0.3);
});
await page.waitForTimeout(600);

// ---- a bullet: it flies, it takes time to get there, it hits the dead -------------------------
const bullet = await E(async () => {
  const g = window.__app.game, p = g.player;
  T.reset();
  T.hold('pistol');
  // a zombie 8 m out
  const z = g.enemies.spawn(1, T.x0 + 0.5, T.y0 + 1, T.z0 - 7.5, 0);
  z.hittable = true; z.change = () => {}; z.update = () => {}; z.health = 100;
  T.aim(T.x0 + 0.5, T.y0 + 2.2, T.z0 - 7.5);
  T.press('primary', 1 / 30);
  const inAir = g.projectiles.bullets.length;
  const hp0 = z.health;
  T.step(0.5);
  return { inAir, hp0, hp: z.health, left: g.projectiles.bullets.length };
});
ok(bullet.inAir === 1, `a pistol shot is a bullet in the air (${bullet.inAir})`);
ok(bullet.hp < bullet.hp0, `it reaches the zombie and hurts it (${bullet.hp0} -> ${bullet.hp.toFixed(2)})`);

// ---- a laser bolt: it flies, and knocks out the block it stops in -----------------------------
const bolt = await E(async () => {
  const g = window.__app.game;
  T.reset();
  let made = 0;
  const mk = g.projectiles.bolt.bind(g.projectiles);
  g.projectiles.bolt = (...a) => { made++; return mk(...a); };
  T.set(0, 1, -6, B.DIRT); T.set(0, 2, -6, B.DIRT);
  T.hold('laser_pistol');
  T.aim(T.x0 + 0.5, T.y0 + 1.5, T.z0 - 5.5);
  const before = T.at(0, 1, -6);
  T.press('primary', 1 / 30);
  T.step(0.4);
  g.projectiles.bolt = mk;
  return { inAir: made, before, after: T.at(0, 1, -6), left: g.projectiles.bolts.length };
});
ok(bolt.inAir === 1, `a laser pistol shot is a bolt in the air (${bolt.inAir})`);
ok(bolt.before === 2, `the dirt is there before (${bolt.before})`);
ok(bolt.after === 0, `the bolt knocks out the dirt it stops in (now ${bolt.after})`);

// ---- TNT: lit with Activate, it flashes, goes off four seconds on, takes blocks, hurts ----------
const tnt = await E(async () => {
  const g = window.__app.game, p = g.player;
  T.reset();
  T.set(0, 1, -3, B.TNT);
  for (const [dx, dz] of [[1, -3], [-1, -3], [0, -4]]) T.set(dx, 1, dz, B.DIRT);
  T.hold('torch', 1);
  T.aim(T.x0 + 0.5, T.y0 + 1.5, T.z0 - 2.5);
  T.step(0.05);
  const looking = g.lookHit && g.lookHit.id === B.TNT;
  T.press('activate', 1 / 30);
  const lit = g.explosives.fuses.length, flashing = g.explosives.flashes.size;
  // stand back, but not out of its reach (6 m)
  p.pos.set(T.x0 + 0.5, T.y0 + 1, T.z0 + 1.5);
  const hp = p.health;
  T.step(3.5);
  const still = T.at(0, 1, -3);
  T.step(0.8);
  return { looking, lit, flashing, still, after: T.at(0, 1, -3), side: T.at(1, 1, -3), back: T.at(0, 1, -4), floor: T.at(0, 0, -3), hp, hpAfter: p.health };
});
ok(tnt.looking, 'looking at the TNT');
ok(tnt.lit === 1 && tnt.flashing === 1, `Activate lights it, and it flashes (${tnt.lit}, ${tnt.flashing})`);
ok(tnt.still === 32, `3.5 s on it hasn't gone off (${tnt.still})`);
ok(tnt.after === 0 && tnt.side === 0 && tnt.back === 0, `four seconds on it's gone off, and the dirt round it with it (${tnt.after} ${tnt.side} ${tnt.back})`);
ok(tnt.hpAfter < tnt.hp && tnt.hpAfter > 0, `standing 4 m off, the player's hurt (not killed) (${tnt.hp} -> ${tnt.hpAfter.toFixed(1)})`);

// ---- a bullet on TNT sets it off at once; a swing of a pick lights it; a spade digs it ---------
const tnt2 = await E(async () => {
  const g = window.__app.game, p = g.player;
  T.reset();
  const hits = [];
  const sh = g.shotHit.bind(g);
  g.shotHit = (h, ...a) => { hits.push(h.block ? h.block.id : 'enemy'); return sh(h, ...a); };
  T.set(0, 1, -8, B.TNT);
  T.hold('pistol');
  T.aim(T.x0 + 0.5, T.y0 + 1.5, T.z0 - 7.5);
  T.press('primary', 1 / 30);
  T.step(0.3);
  const shot = T.at(0, 1, -8);
  g.shotHit = sh;
  T.reset();
  T.set(0, 1, -3, B.TNT);
  T.hold('pick_iron');
  T.aim(T.x0 + 0.5, T.y0 + 1.5, T.z0 - 2.5);
  T.press('primary', 1 / 30);
  const picked = g.explosives.fuses.length;
  g.explosives.fuses.length = 0;
  T.step(0.1);
  T.hold('spade_iron');
  const I = window.__app.input;
  I.down('primary'); T.step(1.5); I.up('primary'); T.step(0.1);
  return { shot, picked, dug: T.at(0, 1, -3), drops: g.drops.list.filter((d) => d.id === 'tnt').length, hits: hits.join(',') };
}).catch((e) => ({ err: e.message }));
ok(tnt2.shot === 0, `a bullet on TNT sets it off at once (${tnt2.shot ?? tnt2.err}; hit ${tnt2.hits})`);
ok(tnt2.picked === 1, `a pick swung at TNT lights it (${tnt2.picked})`);
ok(tnt2.dug === 0, `a spade digs it out instead (${tnt2.dug})`);

// ---- a grenade: pressed and let go, it's thrown once the throw's swung, and goes off ------------
const gren = await E(async () => {
  const g = window.__app.game, p = g.player, I = window.__app.input;
  T.reset();
  for (let dx = -2; dx <= 2; dx++) T.set(dx, 1, -7, B.DIRT);
  T.hold('grenade', 3);
  const blasts = [];
  const blast = g.explosives.blast.bind(g.explosives);
  g.explosives.blast = (c, ...a) => { blasts.push(c.clone()); return blast(c, ...a); };
  T.aim(T.x0 + 0.5, T.y0 + 1.6, T.z0 - 6.5);
  I.down('primary'); T.step(0.2); I.up('primary');
  T.step(0.5);
  const early = g.projectiles.grenades.length;
  T.step(0.7);
  const thrown = g.projectiles.grenades.length, left = g.inventory.slots[0]?.count;
  const n = g.projectiles.grenades[0];
  const fuse = n ? n.left : null;
  // run away
  p.pos.set(T.x0 + 0.5, T.y0 + 1, T.z0 + 11.5);
  T.step(5);
  g.explosives.blast = blast;
  const c = blasts[0];
  // what's soft within a block of where it went off is gone
  let left2 = 0;
  if (c) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (g.world.getBlock(Math.floor(c.x) + dx, Math.floor(c.y) + dy, Math.floor(c.z) + dz) === B.DIRT) left2++;
  return { early, thrown, left, fuse, gone: g.projectiles.grenades.length, at: c && [c.x, c.y, c.z].map((v) => v.toFixed(1)).join(','), dirtLeft: left2 };
});
ok(gren.early === 0, `not out of the hand while the pin's coming out (${gren.early})`);
ok(gren.thrown === 1 && gren.left === 2, `thrown after the cook and the throw (${gren.thrown} in the air, ${gren.left} left)`);
ok(gren.fuse > 4.3 && gren.fuse < 4.9, `with five seconds less the cook on its fuse (${gren.fuse?.toFixed(2)})`);
ok(gren.gone === 0 && !!gren.at && gren.dirtLeft === 0, `it goes off (at ${gren.at}) and takes the dirt round it (${gren.dirtLeft} left)`);

// ---- a rocket: it pops out, flies, goes off where it hits; the launcher's spent ----------------
const rocket = await E(async () => {
  const g = window.__app.game, p = g.player;
  T.reset(0, 6);
  const blasts = [];
  const blast = g.explosives.blast.bind(g.explosives);
  g.explosives.blast = (c, ...a) => { blasts.push([c.x, c.y, c.z].map((v) => (v - [T.x0, T.y0, T.z0][blasts.length ? 0 : 0]).toFixed(1)).join(',')); return blast(c, ...a); };
  for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) T.set(dx, dy, -10, B.DIRT);
  T.hold('rocket_launcher');
  T.aim(T.x0 + 0.5, T.y0 + 2, T.z0 - 9.5);
  T.press('primary', 1 / 30);
  const flying = g.projectiles.rockets.length;
  const inHand = g.inventory.slots[0]?.id;
  T.step(1.6);
  g.explosives.blast = blast;
  return { flying, inHand, after: g.inventory.slots[0]?.id ?? null, gone: g.projectiles.rockets.length, wall: [-1, 0, 1].map((dx) => T.at(dx, 2, -10)), blasts: blasts.join(' | '), dead: p.dead, hp: p.health, rel: [T.x0, T.y0, T.z0].join(',') };
});
ok(rocket.flying === 1, `a rocket in the air (${rocket.flying})`);
ok(rocket.inHand === 'rocket_launcher' && rocket.after === null, `the launcher stays in hand, spent, then it's gone (${rocket.inHand} -> ${rocket.after})`);
ok(rocket.gone === 0 && rocket.wall.every((d) => d === 0), `the rocket goes off at the wall and takes it (${rocket.wall.join(',')}; blast at ${rocket.blasts} from ${rocket.rel})`);
ok(!rocket.dead, `16 m off, the player's fine (${rocket.hp})`);

// ---- a door: between two walls it goes across them; Activate opens and shuts both halves;
// dug, it's gone whole and drops one door --------------------------------------------------------
const door = await E(async () => {
  const g = window.__app.game, p = g.player;
  const r0 = T.reset(-4, -1);
  // a gap in a wall along x: its sides at x -5 and -3
  for (let dy = 1; dy <= 2; dy++) { T.set(-5, dy, -4, B.ROCK); T.set(-3, dy, -4, B.ROCK); }
  T.hold('door', 2);
  T.aim(T.x0 - 3.5, T.y0 + 0.999, T.z0 - 3.5);
  T.step(0.05);
  T.press('primary', 1 / 30);
  const lower = T.at(-4, 1, -4), upper = T.at(-4, 2, -4), left = g.inventory.slots[0]?.count;
  T.aim(T.x0 - 3.5, T.y0 + 1.5, T.z0 - 3.5);
  T.step(0.05);
  T.press('activate', 1 / 30);
  const openL = T.at(-4, 1, -4), openU = T.at(-4, 2, -4);
  T.aim(T.x0 - 3.5, T.y0 + 2.5, T.z0 - 3.5);
  T.step(0.05);
  T.press('activate', 1 / 30);
  const shutL = T.at(-4, 1, -4), shutU = T.at(-4, 2, -4);
  const dropsBefore = g.drops.list.filter((d) => d.id === 'door').length;
  g.breakBlock(g.world.raycast(p.eye.x, p.eye.y, p.eye.z, ...p.forward().toArray(), 6, (id) => id !== 0), null);
  return { r0, lower, upper, left, openL, openU, shutL, shutU, gone: [T.at(-4, 1, -4), T.at(-4, 2, -4)], drops: g.drops.list.filter((d) => d.id === 'door').length - dropsBefore };
});
ok(door.lower === 38 && door.upper === 40 && door.left === 1, `a door between walls either side along x goes across them, both halves (${door.lower}, ${door.upper}; ${JSON.stringify(door.r0)})`);
ok(door.openL === 42 && door.openU === 44, `Activate opens both halves (${door.openL}, ${door.openU})`);
ok(door.shutL === 38 && door.shutU === 40, `and on the top half shuts them (${door.shutL}, ${door.shutU})`);
ok(door.gone[0] === 0 && door.gone[1] === 0 && door.drops === 1, `dug, it's gone whole and drops one door (${door.gone}, ${door.drops})`);

// ---- a crate: placed, opened, filled, kept in the save, spilled when it's broken ---------------
const crate = await E(async () => {
  const g = window.__app.game, p = g.player, inv = g.inventory;
  T.reset();
  T.hold('crate', 1);
  T.aim(T.x0 + 0.5, T.y0 + 0.999, T.z0 - 1.5);
  T.step(0.05);
  T.press('primary', 1 / 30);
  const placed = T.at(0, 1, -2);
  inv.slots[1] = inv.make('diamond', 7);
  T.aim(T.x0 + 0.5, T.y0 + 1.5, T.z0 - 1.5);
  T.step(0.05);
  T.press('activate', 1 / 30);
  const open = g.crafting?.isOpen && g.crafting.page === 'box';
  // the diamonds into the crate's first slot: lifted, put down
  const c = g.crafting;
  c.slotDown({ box: inv.slots, i: 1, crate: false }, { clientX: 0, clientY: 0, button: 0 });
  c.slotDown({ box: c.crate.slots, i: 0, crate: true }, { clientX: 0, clientY: 0, button: 0 });
  const inCrate = c.crate.slots[0] && `${c.crate.slots[0].id}x${c.crate.slots[0].count}`;
  c.close();
  const saved = g.serialize().crates;
  const key = `${T.x0},${T.y0 + 1},${T.z0 - 2}`;
  const before = g.drops.list.length;
  g.breakBlock({ x: T.x0, y: T.y0 + 1, z: T.z0 - 2, id: B.CRATE }, null);
  const spilled = g.drops.list.slice(before).map((d) => `${d.id}x${d.count}`);
  return { placed, open, inCrate, saved: saved[key]?.[0]?.id, spilled, after: g.crates.get(T.x0, T.y0 + 1, T.z0 - 2, false) };
});
ok(crate.placed === 25, `the crate goes down (${crate.placed})`);
ok(crate.open, 'Activate opens its screen');
ok(crate.inCrate === 'diamondx7', `the diamonds go in (${crate.inCrate})`);
ok(crate.saved === 'diamond', `the crate's in the save, with them (${crate.saved})`);
ok(crate.spilled.includes('diamondx7') && crate.after === null, `broken, it spills them (${crate.spilled.join(' ')})`);

// ---- the locator: marks a block, asks for a name, says how far; a marker stands there ----------
const gps = await E(async () => {
  const g = window.__app.game, p = g.player, app = window.__app;
  const r0 = T.reset();
  if (!app.nameAsk) app.nameAsk = null;
  T.hold('locator');
  T.aim(T.x0 + 3.5, T.y0 + 0.999, T.z0 - 3.5);
  T.step(0.05);
  T.press('primary', 1 / 30);
  const s = g.inventory.slots[0];
  const at = s.gps?.at?.join(','), dur = s.dur, asked = app.state === 'paused' && app.menus.id;
  if (!app.nameAsk) return { r0, at, dur, asked, state: app.state, held: g.inventory.held?.id, look: g.lookHit?.id };
  app.nameAsk.value = 'Home';
  app.nameAsk.done('Home');
  app.resume();
  T.step(0.1);
  return { at, dur, asked, name: s.gps?.name, hud: document.querySelector('.hud .iname')?.textContent, marker: !!g.marker?.visible, want: `${T.x0 + 3},${T.y0},${T.z0 - 4}` };
});
ok(gps.at === gps.want, `the locator marks the block looked at (${gps.at}; ${JSON.stringify(gps)})`);
ok(gps.dur === 9, `and wears a tenth (${gps.dur} left)`);
ok(!!gps.asked, `and asks for a name (${gps.asked})`);
ok(gps.name === 'Home' && /Locator: Home - Distance: \d+/.test(gps.hud || ''), `the HUD says where it points (${gps.hud})`);
ok(gps.marker, 'a marker stands where it points');

// ---- the teleporter: marks, then the left trigger takes you there, and it's used up ------------
const tele = await E(async () => {
  const g = window.__app.game, p = g.player, app = window.__app;
  T.reset();
  T.hold('teleporter');
  T.press('secondary', 1 / 30);
  const unset = g.inventory.slots[0]?.id;
  T.aim(T.x0 + 3.5, T.y0 + 0.999, T.z0 + 3.5);
  T.step(0.05);
  T.press('primary', 1 / 30);
  app.resume();
  T.step(0.05);
  T.press('secondary', 1 / 30);
  T.step(0.5);
  return { unset, at: [p.pos.x, p.pos.z].map((v) => v.toFixed(1)).join(','), y: p.pos.y - T.y0, want: `${(T.x0 + 3.5).toFixed(1)},${(T.z0 + 3.5).toFixed(1)}`, after: g.inventory.slots[0]?.id ?? null };
});
ok(tele.unset === 'teleporter', 'unset, it does nothing (but stays)');
ok(tele.at === tele.want && tele.y >= 0.99 && tele.y < 1.5, `set, it takes you there, on top of the block (${tele.at} vs ${tele.want}, ${tele.y.toFixed(2)} up)`);
ok(tele.after === null, `and it's used up (${tele.after})`);

// ---- the clock: it turns with the day -------------------------------------------------------------
const clock = await E(async () => {
  const g = window.__app.game, app = window.__app;
  await new Promise((r) => setTimeout(r, 1500));
  T.hold('clock');
  app.sky.setTime(0.25, app.sky.day);
  T.step(0.05);
  const part = () => (g.viewModel.item?.turn ?? g.viewModel.needle);
  const a = part()?.rotation.y;
  app.sky.setTime(0.5, app.sky.day);
  T.step(0.05);
  const b = part()?.rotation.y;
  return { a, b };
});
ok(clock.a != null && Math.abs(clock.b - clock.a + Math.PI / 2) < 0.05, `the clock turns a quarter for a quarter of a day (${clock.a?.toFixed(2)} -> ${clock.b?.toFixed(2)})`);

await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/p2-end.png` });
const errs = logs.filter((l) => !/favicon|GPU stall|WebGL|Automatic fallback/.test(l));
ok(errs.length === 0, `no errors${errs.length ? `: ${errs.slice(0, 4).join(' | ')}` : ''}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
