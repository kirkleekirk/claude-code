// The later version's dragons, in headless Chromium.
//   node tools/checks/dragons.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
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
const snap = async (name) => { await E(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.png` }); };

await page.goto(`${base}/?play&time=0.45&rd=4&q=low${extra}`);
ok(await waitFor(() => E(() => window.__app?.state === 'playing' && window.__app.game?.ready)), 'game starts');
await page.waitForTimeout(1000);

// the bench: a bedrock floor round the player, open to the sky; the dead off; helpers
await E(async () => {
  const { B } = await import('/src/world/blocks.js');
  const { ITEMS } = await import('/src/items/items.js');
  const app = window.__app, g = app.game, p = g.player, w = g.world, I = app.input;
  window.B = B; window.ITEMS = ITEMS;
  const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
  for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
    w.setBlock(x0 + dx, y0, z0 + dz, B.BEDROCK);
    w.setBlock(x0 + dx, y0 - 1, z0 + dz, B.BEDROCK);
    for (let y = y0 + 1; y < 128; y++) if (w.getBlock(x0 + dx, y, z0 + dz) !== B.AIR) w.setBlock(x0 + dx, y, z0 + dz, B.AIR);
  }
  p.pos.set(x0 + 0.5, y0 + 1, z0 + 0.5);
  p.vel.set(0, 0, 0);
  for (const e of g.enemies.list) e.gone = true;
  g.enemies.spawning = () => {};
  app.onLockChange = () => {};
  for (const it of Object.values(ITEMS)) if (it.kind === 'gun') { it.inaccuracy = 0; it.recoil = 0; }
  // what hurts the player, kept count of (and kept from killing them)
  window.hurts = [];
  p.hurt = (amount, from, kind) => { window.hurts.push({ amount, kind }); };
  const D = g.dragons;
  window.T = {
    x0, y0, z0, D,
    step(sec, dt = 1 / 30) { for (let t = 0; t < sec - 1e-9; t += dt) { g.update(dt, I); I.endFrame(); } },
    aim(tx, ty, tz) {
      const e = p.eye, dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.asin(dy / l);
    },
    hold(id, n = 1) { g.inventory.slots[0] = g.inventory.make(id, n); g.inventory.select(0); g.cooldown = 0; this.step(0.1); },
    press(a, sec = 0.05) { I.down(a); this.step(sec); I.up(a); this.step(1 / 30); },
    resume() { if (window.__app.state === 'paused') window.__app.resume(); },
    // a dragon of this type, flown here (brain and client both on this machine)
    spawn(type) {
      if (D.client) D.removeDragon();
      // (and any fireballs still about)
      for (const f of [...D.fireballs]) f.remove();
      D.pending = false;
      D.spawnDragon(type, true);
      return D.brain;
    },
    // the brain held still at (x, y, z) facing yaw (its states off)
    freeze(x, y, z, yaw = 0) {
      const b = D.brain;
      b.change = () => {};
      b.state = { update() {} };
      b.pos.set(x, y, z);
      b.yaw = b.targetYaw = yaw; b.pitch = b.targetPitch = 0; b.roll = b.targetRoll = 0;
      b.velocity = b.targetVelocity = 0;
      b.targetAltitude = y;
      b.orient();
      // the client: straight there
      const c = D.client;
      c.waypoints.length = 0; c.interpT = 0; c.got = false;
      this.step(0.8);
      return c;
    },
    ahead(dist, up) {
      const f = p.forward(new (p.pos.constructor)());
      f.y = 0; f.normalize();
      return { x: p.pos.x + f.x * dist, y: p.pos.y + up, z: p.pos.z + f.z * dist };
    },
    // somewhere that far off and that high with nothing in the way from the eye (turning the
    // player to face it)
    clear(dist, up) {
      const V = p.pos.constructor;
      for (let k = 0; k < 16; k++) {
        const a = p.yaw + (k * Math.PI) / 8, at = new V(p.pos.x - Math.sin(a) * dist, p.pos.y + up, p.pos.z - Math.cos(a) * dist);
        if (!D.blocked(p.eye, at)) { p.yaw = a; return at; }
      }
      return this.ahead(dist, up);
    },
  };
  T.step(0.3);
});
await page.waitForTimeout(500);

// ---- one comes: 750 m off at cruising height, its client following its word -------------------
const s1 = await E(() => {
  T.resume();
  const g = window.__app.game, D = T.D, p = g.player.pos;
  const b = T.spawn(0), c = D.client;
  const d0 = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
  const st0 = b.stateName, y0 = b.pos.y;
  T.step(1.2);
  return { has: !!b && !!c, st0, d0, y0, wps: c.waypoints.length, got: c.got, vis: c.root.visible, name: c.T.name, health: c.health, model: c.model.constructor.name, sent: b.updatesSent, dist: Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) };
});
console.log(JSON.stringify(s1));
ok(s1.has && s1.st0 === 'default', 'a Fire Dragon starts, on its way over');
ok(Math.abs(s1.d0 - 750) < 1 && s1.y0 === 184, `750 m off (${s1.d0.toFixed(1)}), 120 m up (y ${s1.y0})`);
ok(s1.got && s1.vis && s1.sent >= 5, `every fifth of a second it says where it is, and is shown once three are in (${s1.sent} sent)`);
ok(s1.dist < 25, `the shown one is a little behind the flown one (${s1.dist.toFixed(1)} m)`);
ok(s1.health === 20, 'with 20 of health');

// ---- it sees you: a scream, and it comes for you; strafing, hovering, loitering, fireballs -----
const s2 = await E(() => {
  const g = window.__app.game, D = T.D, b = D.brain, p = g.player.pos;
  // 150 m off, coming this way
  b.pos.set(p.x, 184, p.z - 150);
  b.yaw = b.targetYaw = b.defaultHeading = Math.PI;
  b.orient();
  b.change('default');
  let screamed = false, seen = null;
  const states = new Set(), shots = [];
  const origScream = D.sound.bind(D);
  D.sound = (name, at) => { if (name === 'DragonScream') screamed = true; return origScream(name, at); };
  for (let k = 0; k < 40 * 10 && D.client; k++) {
    T.step(0.1);
    states.add(b.stateName);
    if (!seen && b.target) seen = { t: k / 10, chances: b.chances };
    for (const f of D.fireballs) if (!shots.includes(f)) shots.push(f);
  }
  D.sound = origScream;
  const f = shots[0];
  return { seen, screamed, states: [...states], shots: shots.length, hurts: window.hurts.length, alive: !!D.client, brain: !!D.brain, fv: f ? f.vel.length() : 0 };
});
console.log(JSON.stringify(s2));
ok(!!s2.seen && s2.seen.chances === 0, `it sees the player out under the sky, and it's angry (${s2.seen?.t}s)`);
ok(s2.screamed, 'it screams');
ok(s2.states.includes('strafe') || s2.states.includes('hoverAttack'), `it comes for them (${s2.states.join(', ')})`);
ok(s2.states.includes('loiter') && (s2.states.includes('loiterLeft') || s2.states.includes('loiterRight') || s2.states.includes('hover')), 'past them, it circles round or hovers');
ok(s2.shots > 0 && Math.abs(s2.fv - 30) < 0.01, `fireballs, at 30 m/s (${s2.shots} in 40 s)`);
ok(s2.hurts > 0, `some of them hurt (${s2.hurts} hits)`);

// ---- a fireball: what it breaks, who it hurts; an iceball's ice -------------------------------
const s3 = await E(async () => {
  const g = window.__app.game, D = T.D, w = g.world, B = window.B, p = g.player;
  const out = {};
  const pad = (dx, dz, id) => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let y = -1; y <= 0; y++) w.setBlock(T.x0 + dx + a, T.y0 + y, T.z0 + dz + b, id); };
  const count = (dx, dz, id) => { let n = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let y = -1; y <= 0; y++) if (w.getBlock(T.x0 + dx + a, T.y0 + y, T.z0 + dz + b) === id) n++; return n; };
  // a pad of dirt 9 m off, with rock in it, a Fire Dragon over it
  pad(9, 0, B.DIRT);
  w.setBlock(T.x0 + 9, T.y0, T.z0 + 1, B.ROCK);
  T.spawn(0);
  const c = T.freeze(T.x0 + 9.5, T.y0 + 30, T.z0 + 0.5);
  window.hurts.length = 0;
  c.shoot(new (p.pos.constructor)(T.x0 + 9.5, T.y0 + 1, T.z0 + 0.5));
  const f = D.fireballs[0];
  T.step(1.5);
  out.fire = { flew: !!f, left: D.fireballs.length, dirt: count(9, 0, B.DIRT), rock: w.getBlock(T.x0 + 9, T.y0, T.z0 + 1) === B.ROCK, hurt: window.hurts.length };
  // one at the player: hurt
  c.shoot(new (p.pos.constructor)(p.pos.x, p.pos.y + 1, p.pos.z));
  T.step(1.5);
  out.me = { hurts: window.hurts.map((h) => +h.amount.toFixed(1)), kind: window.hurts[0]?.kind, max: p.maxHealth };
  // the Ice Dragon's: ice
  pad(-9, 0, B.DIRT);
  T.spawn(3);
  const c2 = T.freeze(T.x0 - 8.5, T.y0 + 30, T.z0 + 0.5);
  c2.shoot(new (p.pos.constructor)(T.x0 - 8.5, T.y0 + 1, T.z0 + 0.5));
  const f2 = D.fireballs[0];
  T.step(1.5);
  out.ice = { speed: f2 ? f2.vel.length() : 0, ice: count(-9, 0, B.ICE), dirt: count(-9, 0, B.DIRT) };
  D.removeDragon();
  return out;
});
console.log(JSON.stringify(s3));
ok(s3.fire.flew && s3.fire.left === 0, 'a fireball flies down and goes off');
ok(s3.fire.dirt < 30 && s3.fire.dirt > 0, `it breaks the dirt within 3 m (${50 - s3.fire.dirt} of 50 gone)`);
ok(s3.fire.rock, "but not the Fire Dragon's rock");
ok(s3.fire.hurt === 0, 'nine metres off, the player is not hurt');
ok(s3.me.hurts.length === 1 && s3.me.hurts[0] > 0.3 * s3.me.max && s3.me.hurts[0] <= 0.4 * s3.me.max && s3.me.kind === 'fireball', `one at the player: up to 0.4 of their health, less the further from it (${s3.me.hurts})`);
ok(Math.abs(s3.ice.speed - 60) < 1e-6 && s3.ice.ice > 0 && s3.ice.dirt < 50 - s3.ice.ice + 1, `an iceball (60 m/s) turns what it hits to ice (${s3.ice.ice} blocks)`);

// ---- shot down: bullets take its health; dead, it falls, lies, and leaves loot ---------------
const s4 = await E(() => {
  const g = window.__app.game, D = T.D, p = g.player;
  window.hurts.length = 0;
  g.drops.clear();
  const k0 = g.stats.kills;
  const at = T.clear(50, 18);
  T.spawn(0);
  const c = T.freeze(at.x, at.y, at.z, p.yaw);
  T.aim(c.pos.x, c.pos.y + 1.5, c.pos.z);
  T.hold('pistol', 1);
  const h0 = c.health;
  T.press('primary', 1 / 30);
  T.step(1.0);
  const h1 = c.health, chances = D.brain?.chances;
  // the rest of it, with something heavier
  T.hold('assault_bloodstone', 1);
  for (let k = 0; k < 6 && !c.dead; k++) { T.aim(c.pos.x, c.pos.y + 1.2, c.pos.z); T.press('primary', 1 / 30); T.step(0.6); }
  const killed = c.dead, brainGone = !D.brain;
  const deaths = [];
  let landed = null;
  for (let k = 0; k < 200 && D.client; k++) {
    T.step(0.1);
    if (!deaths.includes(c.death)) deaths.push(c.death);
    if (!landed && c.onGround) landed = { y: c.pos.y };
  }
  const ids = g.drops.list.map((d) => d.id);
  return { h0, h1, chances, killed, brainGone, deaths, landed, gone: !D.client, ids, powder: ids.filter((i) => i === 'explosive_powder').length, fire: g.stats.fireDragonKills, kills: g.stats.kills - k0, ground: T.y0 + 1 };
});
console.log(JSON.stringify(s4));
ok(Math.abs(s4.h0 - s4.h1 - 0.3) < 1e-6, `a pistol bullet takes 0.3 off it (${s4.h0} -> ${s4.h1})`);
ok(s4.chances === 0, 'and makes it angry');
ok(s4.killed && s4.brainGone, 'shot down');
ok(s4.deaths.join() === '1,2,3', `it dies in the air, falls, and lies there (${s4.deaths})`);
ok(!!s4.landed, `it comes down to the ground (y ${s4.landed?.y.toFixed(1)})`);
ok(s4.gone && s4.powder >= 2 && s4.ids.length - s4.powder >= 2, `then it's gone, leaving explosive powder and more (${s4.ids.join(', ')})`);
ok(s4.fire === 1 && s4.kills === 1, 'a Fire Dragon kill counted');

// ---- the guided launcher: it locks on at the shoulder, and only then fires; the missile chases -
const s5 = await E(() => {
  const g = window.__app.game, D = T.D, p = g.player, I = window.__app.input;
  const at = T.clear(85, 62);
  T.spawn(1);
  const c = T.freeze(at.x, at.y, at.z, p.yaw + 1.2);
  T.hold('rocket_launcher_guided', 1);
  T.aim(c.pos.x, c.pos.y, c.pos.z);
  I.down('secondary');
  T.step(1.0);
  const early = { t: D.lock.t, locked: D.lock.locked, rect: !!D.lock.rect };
  // not locked: the trigger does nothing
  I.down('primary'); T.step(1 / 30); I.up('primary'); T.step(1 / 30);
  const firedEarly = g.projectiles.rockets.length;
  let lockedAt = null;
  for (let k = 0; k < 80 && !D.lock.locked; k++) { T.aim(c.pos.x, c.pos.y, c.pos.z); T.step(0.1); }
  lockedAt = D.lock.t;
  const hud = g.hud.lockEl.className;
  T.step(0.2);
  I.down('primary'); T.step(1 / 30); I.up('primary');
  const fired = g.projectiles.rockets.length;
  I.up('secondary');
  // it starts to fly off: the missile turns after it
  D.brain.velocity = D.brain.targetVelocity = 12;
  let hit = false;
  for (let k = 0; k < 100 && !c.dead; k++) T.step(0.1);
  hit = c.dead;
  for (let k = 0; k < 150 && D.client; k++) T.step(0.1);
  return { early, firedEarly, lockedAt, hud, fired, hit, guided: g.stats.dragonsKilledWithGuidedMissile, forest: g.stats.forestDragonKills };
});
console.log(JSON.stringify(s5));
ok(!s5.early.locked && s5.early.rect && s5.early.t > 0, 'at the shoulder the launcher starts locking on, with its box round the dragon');
ok(s5.firedEarly === 0, "and won't fire till it has");
ok(s5.lockedAt > 1.5 + 4 * 0.4 && s5.lockedAt < 6.5, `it locks on after a while, longer further off (${s5.lockedAt.toFixed(2)} s at ~105 m)`);
ok(/locked/.test(s5.hud), `the box goes red (${s5.hud})`);
ok(s5.fired === 1, 'then it fires');
ok(s5.hit && s5.guided === 1 && s5.forest === 1, 'the missile chases the dragon down and kills it (a Forest Dragon, 100 of health)');

// ---- too far from everyone, it goes -------------------------------------------------------------
const s6 = await E(() => {
  const g = window.__app.game, D = T.D, p = g.player.pos;
  const b = T.spawn(2);
  b.pos.set(p.x + 1000, 184, p.z);
  T.step(3.5);
  return { gone: !D.client && !D.brain, allowed: D.nextAllowed - D.t };
});
ok(s6.gone, 'a dragon with no one within 937 m of it is gone');
ok(s6.allowed > 6 && s6.allowed <= 8, `and the next can't come for 8 seconds (${s6.allowed.toFixed(2)} left)`);

// ---- when they come: out past 100 m; and after staying put -------------------------------------
const s7 = await E(() => {
  const g = window.__app.game, D = T.D, p = g.player;
  T.step(8.5);
  D.distIndex = 0;
  const was = p.pos.clone();
  p.pos.x = 150 + 0.5;
  T.step(1 / 30);
  const first = { client: D.client?.type, idx: D.distIndex, forBiome: D.client?.forBiome };
  p.pos.copy(was);
  D.removeDragon();
  // the square you stay in: a dragon 28 to 36 minutes on
  D.initBox = true;
  T.step(1 / 30);
  const wait = (D.nextSpawnT - D.t) / 60;
  // time's up: the kind due comes, and the one after next
  D.nextAllowed = 0;
  D.nextTimedType = 2;
  D.nextSpawnT = D.t - 1;
  T.step(1 / 30);
  const timed = { type: D.client?.type, next: D.nextTimedType, wait: (D.nextSpawnT - D.t) / 60 };
  D.removeDragon();
  return { first, wait, timed };
});
console.log(JSON.stringify(s7));
ok(s7.first.client === 0 && s7.first.idx === 1 && s7.first.forBiome === true, 'past 100 m out, the Fire Dragon comes');
ok(s7.wait >= 28 && s7.wait <= 36, `stay in one square and one comes 28 to 36 minutes on (${s7.wait.toFixed(1)})`);
ok(s7.timed.type === 2 && s7.timed.next === 3 && s7.timed.wait >= 76 && s7.timed.wait <= 84, `then the kind due (${JSON.stringify(s7.timed)})`);

// ---- how it looks -------------------------------------------------------------------------------
await E(() => {
  const g = window.__app.game, D = T.D, p = g.player;
  p.pitch = 0.25;
  const at = T.ahead(34, 12);
  T.spawn(0);
  const c = T.freeze(at.x, at.y, at.z, p.yaw + 1.3);
  T.aim(c.pos.x, c.pos.y - 2, c.pos.z);
  const b = D.brain;
  b.anim = b.nextAnim = 1;
});
await snap('dragon-fire');
await E(() => {
  const g = window.__app.game, D = T.D, p = g.player;
  const at = T.ahead(40, 14);
  T.spawn(3);
  const c = T.freeze(at.x, at.y, at.z, p.yaw - 1.0);
  T.aim(c.pos.x, c.pos.y - 3, c.pos.z);
  D.brain.anim = D.brain.nextAnim = 3;
  T.step(1.5);
});
await snap('dragon-ice-hover');
await E(() => {
  const g = window.__app.game, D = T.D, p = g.player;
  const c = D.client;
  c.kill(false);
  for (let k = 0; k < 60 && c.death < 3; k++) T.step(0.1);
  T.step(1.5);
  T.aim(c.pos.x, c.pos.y + 1, c.pos.z);
});
await snap('dragon-dead');
await E(() => {
  const g = window.__app.game, D = T.D, p = g.player, I = window.__app.input;
  D.removeDragon();
  T.step(9);
  const at = T.clear(90, 50);
  T.spawn(4);
  const c = T.freeze(at.x, at.y, at.z, p.yaw + 1.5);
  T.hold('rocket_launcher_guided', 1);
  T.aim(c.pos.x + 4, c.pos.y + 3, c.pos.z);
  I.down('secondary');
  T.step(2.0);
});
await snap('dragon-locking');
await E(() => { const I = window.__app.input; I.up('secondary'); T.D.removeDragon(); });

console.log(logs.length ? logs.slice(0, 15).join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
process.exit(fails ? 1 : 0);
