// Camera: the view must never snap. The mouse filter drops the bogus pointer-lock deltas Chrome
// sometimes reports without eating real flicks. The rig's boom, follow point and view direction stay
// continuous through walking past pillars, backing into cover, flight, every ability and ult,
// knockback and death; respawns and hero swaps are the only cuts.
const cam = T.g.camRig, inp = T.g.input, V = T.V, THREE = T.THREE;
const HEROES = ['invincible', 'eve', 'robot', 'omniman'];
// per-frame limits at 60 fps
const LIM = {
  boom: 0.34, // m the boom length may change in one frame
  lift: 0.2, // m the camera may rise or sink over a low wall in one frame
  view: 0.02, // rad the view may turn by itself in one frame (no mouse input)
  inside: 8, // frames the camera may stay inside a wall or pillar
  hidden: 60, // frames the hero may stay hidden behind geometry
};

// ---------------------------------------------------------------- mouse filter
/** feed (dx, dy, ms) events 8 ms apart through the input's filter; returns the summed output */
function feed(events, t0 = 1e5) {
  inp.filter.reset(); inp.endFrame();
  let t = t0, sx = 0, sy = 0;
  for (const [dx, dy, dt = 8] of events) { t += dt; inp.move(dx, dy, t); }
  inp.flushMove(t + 100);
  sx += inp.mouse.dx; sy += inp.mouse.dy; inp.endFrame();
  return [sx, sy];
}
T.test('mouse filter: drops pointer-lock spikes, keeps real motion and flicks', () => {
  inp.filter.reset();
  // steady motion with isolated bogus spikes, some against the motion
  const steady = [];
  for (let i = 0; i < 60; i++) steady.push([20, 3]);
  const spiky = steady.slice(); spiky.splice(10, 0, [-640, 12]); spiky.splice(30, 0, [700, -300]); spiky.splice(45, 0, [0, 520]);
  const [ax, ay] = feed(spiky);
  T.expect(Math.abs(ax - 1200) < 25 && Math.abs(ay - 180) < 25, `spikes leaked through: got (${ax}, ${ay}), want (1200, 180)`);
  // a hard flick from rest builds up over several events and must pass whole
  const flick = [8, 30, 90, 180, 300, 420, 460, 380, 240, 110, 40, 10].map((v) => [v, -v * 0.2]);
  const want = flick.reduce((a, e) => a + e[0], 0);
  const [fx] = feed(flick);
  T.expect(Math.abs(fx - want) < 1, `flick lost motion: ${fx} of ${want}`);
  // the very first event of a sudden fast start is held one event, not dropped
  const start = [[260, 0], [300, 10], [280, 0], [150, 0]];
  const [sx] = feed(start);
  T.expect(Math.abs(sx - 990) < 1, `sudden start lost motion: ${sx} of 990`);
  // a lone huge delta with nothing after it is a spike
  const [lx] = feed([[3, 0], [2, 0], [0, 0, 300], [900, 0]]);
  T.expect(Math.abs(lx - 5) < 1, `lone spike applied: ${lx}`);
  // events right after the lock is taken carry the cursor's jump to the centre
  inp.filter.settle(7e5);
  inp.endFrame(); inp.move(450, -200, 7e5 + 10); inp.move(5, 0, 7e5 + 30);
  T.expect(inp.mouse.dx === 0, `post-lock jump applied: ${inp.mouse.dx}`);
  inp.endFrame(); inp.filter.reset();
});

// ---------------------------------------------------------------- rig continuity
const blocked = (p) => p.y < 0.02 || T.w.obstacles.some((o) => (o.type === 'cyl'
  ? p.y < o.h && Math.hypot(p.x - o.x, p.z - o.z) < o.r
  : p.x > o.min.x && p.x < o.max.x && p.y > o.min.y && p.y < o.max.y && p.z > o.min.z && p.z < o.max.z));
/** checks the rig every frame; tracks issues by kind with the first occurrence and the worst value */
function cameraWatch({ view = true } = {}) {
  let prev = null, inside = 0, hidden = 0;
  const issues = {};
  const flag = (kind, v, msg) => { const e = issues[kind] ||= { n: 0, worst: 0, first: msg }; e.n++; if (v > e.worst) e.worst = v; };
  return {
    issues,
    /** call after each step; label names the current phase */
    sample(label, h, wantYaw, wantPitch) {
      const s = { dist: cam.curDist, lift: cam.lift, gap: cam.pivot.distanceTo(cam.pivotSmooth), pivot: cam.pivot.clone(), cuts: cam.cuts };
      if (prev && prev.cuts === s.cuts && !h.dead) {
        const boom = Math.abs(s.dist - prev.dist);
        if (boom > LIM.boom) flag('boom', boom, `${label}: boom length jumped ${prev.dist.toFixed(2)} -> ${s.dist.toFixed(2)} m in one frame`);
        const lift = Math.abs(s.lift - prev.lift);
        if (lift > LIM.lift) flag('lift', lift, `${label}: camera lift jumped ${prev.lift.toFixed(2)} -> ${s.lift.toFixed(2)} m in one frame`);
        const moved = s.pivot.distanceTo(prev.pivot);
        if (prev.gap > 1 && s.gap < 0.4 * prev.gap && moved < prev.gap) flag('follow', prev.gap, `${label}: follow point snapped ${prev.gap.toFixed(2)} m onto the hero`);
      }
      if (view && wantYaw != null && !h.dead) {
        const d = Math.max(Math.abs(cam.yaw - wantYaw), Math.abs(cam.pitch - wantPitch));
        if (d > LIM.view) flag('view', d, `${label}: view turned ${(d * 57.3).toFixed(1)}° by itself`);
      }
      const c = cam.cam.position;
      inside = blocked(c) ? inside + 1 : 0;
      if (inside > LIM.inside) flag('inside', inside, `${label}: camera inside geometry for ${inside} frames at (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
      // the hero counts as hidden when the line to its head (the follow point) is blocked
      const to = cam.pivot.clone(), dir = to.clone().sub(c), len = dir.length();
      const hit = !h.dead && len > 0.3 ? T.w.rayWorld(c, dir.normalize(), len - 0.3) : null;
      hidden = hit ? hidden + 1 : 0;
      if (hidden > LIM.hidden) flag('hidden', hidden, `${label}: hero hidden behind geometry for ${hidden} frames`);
      prev = s;
    },
    report(prefix) { for (const k in issues) { const e = issues[k]; T.fail(`${prefix}${e.first} (x${e.n}, worst ${e.worst.toFixed(2)})`); } },
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * Drives the player like a mouse and keyboard would: the camera turns toward look at a bounded rate,
 * the hero aims where the camera looks, and fn(k, look) sets the movement and ability intents
 * (returning false ends the phase). The rig is checked after every frame.
 */
function driver(h, watch) {
  const look = { yaw: cam.yaw, pitch: cam.pitch };
  const f = new THREE.Vector3();
  const step = (label, n, fn) => {
    for (let k = 0; k < n; k++) {
      T.clr(h.intents);
      if (fn && fn(k, look) === false) return k;
      if (!h.dead) {
        cam.yaw += THREE.MathUtils.clamp(wrap(look.yaw - cam.yaw), -0.07, 0.07);
        cam.pitch = THREE.MathUtils.clamp(cam.pitch + THREE.MathUtils.clamp(look.pitch - cam.pitch, -0.05, 0.05), -1.45, 1.38);
      }
      const it = h.intents;
      cam.forward(f);
      it.aimDir.copy(f); it.aimOrigin.copy(cam.cam.position).addScaledVector(f, cam.curDist * 0.95);
      it.aimPoint.copy(it.aimOrigin).addScaledVector(f, 60); it.aimHero = null;
      const yaw = cam.yaw, pitch = cam.pitch;
      T.run(1);
      watch.sample(label, h, yaw, pitch);
    }
    return n;
  };
  return { step, look };
}
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function gauntlet(key) {
  const watch = cameraWatch();
  const pillar = T.w.obstacles.find((o) => o.type === 'cyl' && Math.abs(o.x) < 0.5 && o.z > 0);
  const wall = T.w.obstacles.find((o) => o.type === 'box' && o.min.z > 25);
  const start = V(pillar.x + 5, 0, pillar.z);
  const [h, ...foes] = T.stage([
    { key, player: true, at: start.toArray(), face: [0, -1] },
    { key: 'omniman', team: 1, at: [pillar.x + 9, 0, pillar.z - 12], face: [0, 1] },
    { key: 'eve', team: 1, at: [pillar.x - 6, 0, pillar.z - 14], face: [0, 1] },
    { key: 'invincible', team: 1, at: [pillar.x + 2, 0, pillar.z - 18], face: [0, 1] },
  ]);
  for (const f of foes) f.maxHp = f.hp = 20000;
  T.w.settings.godMode = true;
  cam.yaw = Math.PI; cam.pitch = -0.12; cam.cut();
  const { step, look } = driver(h, watch);
  // 1. circle the pillar, keeping it in view, so the boom sweeps through it again and again
  step('circling a pillar', 300, (k, l) => { l.yaw = yawTo(h.pos, V(pillar.x, 0, pillar.z)); l.pitch = -0.1; h.intents.mx = 1; h.intents.mz = 0.3; });
  // 2. strafe past the pillar with it between the camera and the hero
  T.teleport(h, V(pillar.x + 6, 0, pillar.z - 4)); cam.cut();
  step('strafing past a pillar', 160, (k, l) => { l.yaw = Math.PI * 0.5; l.pitch = -0.08; h.intents.mx = k < 80 ? -1 : 1; });
  // 3. back into a cover wall, then swing the camera across it
  T.teleport(h, V(0, 0, wall.min.z - 4)); cam.yaw = Math.PI; cam.cut();
  step('backing into cover', 120, (k, l) => { l.yaw = Math.PI; l.pitch = -0.3; h.intents.mz = -1; });
  step('swinging the camera over cover', 150, (k, l) => { l.yaw = Math.PI + Math.sin(k * 0.06) * 1.4; l.pitch = -0.2 + Math.sin(k * 0.05) * 0.4; });
  // 4. take off, cruise, turn, dive and land
  T.teleport(h, V(0, 0, 10)); cam.cut();
  step('taking off', 40, (k, l) => { l.yaw = 0; l.pitch = 0.1; h.intents.flyToggle = k === 0 || k === 3; h.intents.jump = k === 0 || k === 3; h.intents.jumpHeld = true; h.intents.up = k > 3; });
  step('cruising', 140, (k, l) => { l.yaw = k < 70 ? 0 : Math.PI * 0.6; l.pitch = 0.05; h.intents.mz = 1; });
  step('diving to land', 240, (k, l) => { l.pitch = -0.9; h.intents.mz = 1; h.intents.down = true; return h.mode === 'ground' && k > 20 ? false : undefined; });
  step('after landing', 60, (k, l) => { l.pitch = -0.12; });
  // 5. every ability, aimed at the nearest enemy
  const near = () => foes.reduce((a, b) => (a.pos.distanceTo(h.pos) < b.pos.distanceTo(h.pos) ? a : b));
  const aimAt = (l) => { const f = near(); const d = T.center(f).sub(cam.cam.position); l.yaw = Math.atan2(d.x, d.z); l.pitch = Math.asin(THREE.MathUtils.clamp(d.normalize().y, -1, 1)); };
  T.teleport(h, V(foes[0].pos.x - 1, 0, foes[0].pos.z + 9)); cam.cut();
  step('aiming', 30, (k, l) => aimAt(l));
  for (const slot of ['secondary', 'a1', 'a2', 'a3', 'primary']) {
    for (const c in h.cd) h.cd[c] = 0;
    step(slot, slot === 'primary' ? 100 : 20, (k, l) => {
      aimAt(l);
      if (slot === 'primary') { h.intents.primary = true; h.intents.primaryPressed = k === 0; }
      else if (slot === 'secondary') { h.intents.secondary = k === 0; h.intents.secondaryPressed = k === 0; }
      else h.intents[slot] = k === 0;
    });
    step(slot + ' (recovering)', 400, (k, l) => { aimAt(l); if (k > 30 && !h.override && !h.carrying && !h.carriedBy && h.mode !== 'tumble' && (!h.kit || h.kit.free)) return false; });
  }
  // 6. the ult (Eve picks the beam)
  h.ult = h.def.ultCost;
  step('ult', 900, (k, l) => {
    aimAt(l);
    h.intents.ult = k === 0;
    if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true;
    if (k > 60 && !h.override && !(h.kit && h.kit.ultState) && h.mode !== 'tumble' && !h.carrying) return false;
  });
  step('after the ult', 90, (k, l) => { l.pitch = -0.12; });
  // 7. knocked flying
  if (key !== 'omniman') {
    T.w.damage(foes[0], h, 1, { knock: V(-14, 13, -9), power: 2 });
    step('knocked back', 300, () => (h.mode === 'ground' && !h.override && h.mode !== 'tumble' ? false : undefined));
  }
  // 8. killed, respawned (a cut), back in the fight
  T.w.settings.godMode = false; h.invuln = 0; h.spawnProtect = 0;
  T.w.kill(foes[0], h);
  step('dead', 60 * (T.RULES.respawn + 1), () => (h.dead ? undefined : false));
  T.expect(!h.dead, `${key} did not respawn`);
  step('respawned', 90, (k, l) => { h.intents.mz = 1; });
  return watch;
}
for (const key of HEROES) {
  T.test(`camera stays continuous through a ${key} gauntlet`, () => {
    const watch = gauntlet(key);
    watch.report(`${key}: `);
  });
}

T.test('camera stays continuous in a bot-driven 3v3 (2 minutes)', () => {
  // every hero on the field, as the game's lineups do; the camera follows the fastest flier
  const LINEUPS = [['invincible', 'robot', 'eve'], ['omniman', 'robot', 'invincible']];
  const spec = [];
  for (const team of [0, 1]) for (const [i, key] of LINEUPS[team].entries()) spec.push({ key, team, bot: true, at: [(i - 1) * 6, 0, team ? 40 : -40], face: [0, team ? -1 : 1] });
  spec[0].player = true; spec[0].bot = false;
  const hs = T.stage(spec, { bots: 'active', settings: { difficulty: 'hard' } });
  const Bot = T.g.bots[0].constructor;
  T.g.bots.push(T.g.playerBot = new Bot(hs[0], T.w));
  cam.cut();
  const watch = cameraWatch({ view: false });
  for (let f = 0; f < 7200; f++) { T.run(1); watch.sample('3v3', hs[0]); }
  watch.report('');
  T.g.playerBot = null;
});
