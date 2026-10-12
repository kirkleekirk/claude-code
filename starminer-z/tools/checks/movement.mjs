// The player's movement against the original's numbers (FPSRig, Player.UpdateAnimation and
// ResolveCollsion), in headless Chromium: how high a jump goes, which ledges it gets you onto,
// walking, running, strafing and in the air, stopping, Auto Climb, falls, and no knockback.
//   node tools/checks/movement.mjs <dev server url> <out dir> [extra query, e.g. &nocmz]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const [base, out, extra = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const E = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`${base}/?play&rd=4&q=low${extra}`);
await page.waitForFunction(() => window.__app?.state === 'playing' && window.__app.game?.ready, null, { timeout: 300000 });

// a flat floor, open above; the game held still (its own loop leaves the player alone) and the
// player driven by hand
await E(async () => {
  const { B } = await import('/src/world/blocks.js');
  const app = window.__app, g = app.game, p = g.player, w = g.world;
  app.onLockChange = () => {};
  g.paused = true;
  for (const e of g.enemies.list) e.gone = true;
  g.enemies.spawning = () => {};
  const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = Math.floor(p.pos.y) - 1;
  for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) {
    w.setBlock(x0 + dx, y0, z0 + dz, B.BEDROCK);
    for (let y = y0 + 1; y < y0 + 30; y++) if (w.getBlock(x0 + dx, y, z0 + dz) !== B.AIR) w.setBlock(x0 + dx, y, z0 + dz, B.AIR);
  }
  window.B = B;
  window.T = {
    x0, y0, z0, p, w,
    keys: new Set(), presses: new Set(), move: { x: 0, y: 0 },
    input() {
      const T = window.T;
      return {
        move: T.move, look: { x: 0, y: 0 }, wheel: 0, lastDevice: 'keyboard',
        isHeld: (a) => T.keys.has(a), pressed: (a) => T.presses.has(a), consume: (a) => T.presses.delete(a),
      };
    },
    // run the player for sec seconds; f(t) each step
    run(sec, f = null, dt = 1 / 60) {
      const I = this.input();
      for (let t = 0; t < sec - 1e-9; t += dt) { p.update(dt, I); this.presses.clear(); f?.(t + dt); }
    },
    reset(x = x0 + 0.5, z = z0 + 0.5, yaw = 0) {
      p.pos.set(x, y0 + 1 + 0.001, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = 0; p.onGround = true;
      p.health = p.maxHealth; p.dead = false; this.move.x = this.move.y = 0; this.keys.clear(); this.presses.clear();
      this.run(0.2);
    },
  };
});

// a jump: how high, standing still
const jump = await E(() => {
  const { p, y0 } = T;
  T.reset();
  let top = 0;
  T.presses.add('jump');
  T.run(1.5, () => { top = Math.max(top, p.pos.y - (y0 + 1)); });
  return { top, landed: p.onGround };
});
ok(jump.top > 2.35 && jump.top <= 2.5 && jump.landed, `a jump goes two and a half metres up (${jump.top.toFixed(2)} m)`);

// holding jump doesn't keep jumping; a press in the air does nothing
const held = await E(() => {
  const { p } = T;
  T.reset();
  T.presses.add('jump'); T.keys.add('jump');
  let lands = 0, was = true;
  T.run(2.5, () => { if (p.onGround && !was) lands++; was = p.onGround; });
  T.keys.clear();
  T.reset();
  T.presses.add('jump');
  T.run(0.3);
  const vy = p.vel.y;
  T.presses.add('jump');
  T.run(1 / 60);
  return { lands, again: p.vel.y > vy + 5 };
});
ok(held.lands === 1, `holding jump jumps once (${held.lands} landing in 2.5 s)`);
ok(!held.again, 'and a press in the air does nothing');

// ledges: two blocks up, from a run at it; not three
const ledge = await E(() => {
  const { x0, y0, z0, w, p } = T;
  const wall = (h) => { for (let dx = -3; dx <= 3; dx++) for (let k = 0; k < 4; k++) for (let dz = 0; dz < 3; dz++) w.setBlock(x0 + dx, y0 + 1 + k, z0 - 4 - dz, k < h ? B.ROCK : B.AIR); };
  // (the highest it stands, on the ground: it runs on, and off the far side)
  const tryIt = (h) => {
    wall(h);
    T.reset(x0 + 0.5, z0 + 0.5, 0);
    T.move.y = 1;
    T.run(0.6);
    T.presses.add('jump');
    let stood = 0;
    T.run(1.5, () => { if (p.onGround) stood = Math.max(stood, p.pos.y - (y0 + 1)); });
    return stood;
  };
  p.autoClimb = false;
  const two = tryIt(2), three = tryIt(3);
  wall(0);
  p.autoClimb = true;
  return { two, three };
});
ok(Math.abs(ledge.two - 2) < 0.05, `a jump gets you up onto a ledge two blocks high (${ledge.two.toFixed(2)} m)`);
ok(ledge.three < 0.1, `but not three (${ledge.three.toFixed(2)} m)`);

// with Auto Climb, from right up against that ledge, pressing jump over and over: it climbs the
// last of it, and the step part way up isn't ground to jump again from (no second jump, 5 m up)
const mash = await E(() => {
  const { x0, y0, z0, w, p } = T;
  const wall = (id) => { for (let dx = -3; dx <= 3; dx++) for (let k = 0; k < 2; k++) for (let dz = 0; dz < 3; dz++) w.setBlock(x0 + dx, y0 + 1 + k, z0 - 4 - dz, id); };
  wall(B.ROCK);
  T.reset(x0 + 0.5, z0 - 2.6, 0);
  T.move.y = 1;
  let top = 0, stood = false, climbed = false;
  T.run(1.5, () => {
    if (p.onGround && p.vel.y <= 0 && p.pos.y - (y0 + 1) > 1.99) stood = true;
    if (stood) return;
    if (p.climbing || (p.onGround && p.pos.y - (y0 + 1) > 1.5)) climbed = true;
    top = Math.max(top, p.pos.y - (y0 + 1));
    T.presses.add('jump');
  });
  wall(B.AIR);
  return { top, stood, climbed };
});
ok(mash.stood && mash.climbed && mash.top < 3, `pressing jump against a two-block ledge: climbed up onto it (${mash.climbed}), no higher than a jump goes (${mash.top.toFixed(2)} m)`);

// speeds on the ground: a key all the way runs at 4 m/s; half a stick walks; strafing; both keys
const speeds = await E(() => {
  const { p } = T;
  const speed = (mx, my) => {
    T.reset();
    T.move.x = mx; T.move.y = my;
    T.run(0.1);
    const a = p.pos.clone();
    T.run(1);
    return Math.hypot(p.pos.x - a.x, p.pos.z - a.z);
  };
  return { run: speed(0, 1), back: speed(0, -1), walk: speed(0, 0.5), slow: speed(0, 0.3), strafe: speed(1, 0), both: speed(1, 1), none: speed(0, 0.05) };
});
console.log(JSON.stringify(speeds));
ok(Math.abs(speeds.run - 4) < 0.05 && Math.abs(speeds.back - 4) < 0.05, `running, forward or back: 4 m/s (${speeds.run.toFixed(2)}, ${speeds.back.toFixed(2)})`);
ok(Math.abs(speeds.walk - 0.947) < 0.03 && Math.abs(speeds.slow - 0.947 * 0.5) < 0.03, `walking, half a stick: 0.95 m/s; less, slower (${speeds.walk.toFixed(2)}, ${speeds.slow.toFixed(2)})`);
ok(Math.abs(speeds.strafe - 4) < 0.05, `strafing: 4 m/s (${speeds.strafe.toFixed(2)})`);
ok(Math.abs(speeds.both - Math.hypot(4, 4)) < 0.08, `two keys at once go further, as the original's do (${speeds.both.toFixed(2)})`);
ok(speeds.none < 0.01, `a touch of the stick: standing still (${speeds.none.toFixed(3)})`);

// in the air: 5 m/s along the stick, and stopped as soon as it's let go
const air = await E(() => {
  const { p } = T;
  T.reset();
  T.move.y = 1;
  T.presses.add('jump');
  T.run(0.05);
  const v = Math.hypot(p.vel.x, p.vel.z);
  T.move.y = 0;
  T.run(1 / 60);
  return { v, stopped: Math.hypot(p.vel.x, p.vel.z), up: !p.onGround };
});
ok(Math.abs(air.v - 5) < 0.01, `in the air: 5 m/s (${air.v.toFixed(2)})`);
ok(air.stopped < 1e-6 && air.up, 'let go in mid-air, and you stop where you are');

// Auto Climb: up a block-high step at 5 m/s, onto it; off, the step stops you
const climb = await E(() => {
  const { x0, y0, z0, w, p } = T;
  for (let dx = -3; dx <= 3; dx++) for (let dz = 0; dz < 4; dz++) w.setBlock(x0 + dx, y0 + 1, z0 - 3 - dz, B.ROCK);
  T.reset(x0 + 0.5, z0 + 0.5, 0);
  T.move.y = 1;
  let t0 = null, t1 = null, on = 0;
  T.run(1.2, (t) => {
    const h = p.pos.y - (y0 + 1);
    if (t0 == null && h > 0.01) t0 = t;
    if (t1 == null && h > 0.99) t1 = t;
    if (p.onGround && t1 != null) on = Math.max(on, h);
  });
  p.autoClimb = false;
  T.reset(x0 + 0.5, z0 + 0.5, 0);
  T.move.y = 1;
  T.run(1.5);
  const off = p.pos.y - (y0 + 1), stopped = p.pos.z > z0 - 3 + 0.5;
  p.autoClimb = true;
  for (let dx = -3; dx <= 3; dx++) for (let dz = 0; dz < 4; dz++) w.setBlock(x0 + dx, y0 + 1, z0 - 3 - dz, B.AIR);
  return { on, took: t1 != null && t0 != null ? t1 - t0 : null, off, stopped };
});
ok(Math.abs(climb.on - 1) < 0.01, `Auto Climb walks you up a step a block high (${climb.on.toFixed(2)} m)`);
ok(climb.took != null && climb.took > 0.17 && climb.took < 0.3, `rising at 5 m/s (${climb.took?.toFixed(2)} s for the metre)`);
ok(climb.off < 0.01 && climb.stopped, 'with it off, the step stops you');

// falls: landing above 15 m/s hurts, a fifteenth of your health a m/s over
const falls = await E(() => {
  const { p, y0 } = T;
  const fall = (h) => {
    T.reset();
    p.pos.y = y0 + 1 + h;
    p.onGround = false;
    let v = 0;
    T.run(3, () => { v = Math.min(v, p.vel.y); });
    return { hp: p.health, v };
  };
  return { five: fall(5), nine: fall(9) };
});
const expected = (-falls.nine.v - 15) / 15 * 100;
ok(falls.five.hp === 100, `a 5 m fall doesn't hurt (${falls.five.hp})`);
ok(Math.abs(100 - falls.nine.hp - expected) < 3, `a 9 m fall does: ${(100 - falls.nine.hp).toFixed(1)} (landing at ${(-falls.nine.v).toFixed(1)} m/s)`);

// no knockback: the original's ApplyDamage doesn't push you
const knock = await E(() => {
  const { p } = T;
  T.reset();
  const from = p.pos.clone(); from.x += 1;
  p.hurt(10, from, 'test');
  T.run(0.3);
  return Math.hypot(p.pos.x - (T.x0 + 0.5), p.pos.z - (T.z0 + 0.5));
});
ok(knock < 0.01, `hit, you stay where you are (${knock.toFixed(3)} m)`);

console.log(logs.length ? logs.join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close();
process.exit(fails ? 1 : 0);
