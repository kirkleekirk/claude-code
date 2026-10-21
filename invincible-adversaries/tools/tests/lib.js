// Test helpers, injected into the game page (?manual&capture) by run.mjs.
// A test file calls T.test(name, fn); fn stages a scenario, steps the simulation and records
// failures with T.expect / T.fail. Nothing is rendered, so tests run far faster than real time.
window.T = (() => {
  const g = window.__game, THREE = window.THREE, w = g.world;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tests = [];
  let ctx = null;
  const test = (name, fn) => tests.push({ name, fn });
  const expect = (cond, msg) => { if (!cond) ctx.fail.push(msg); return !!cond; };
  const fail = (msg) => ctx.fail.push(msg);
  const info = (msg) => ctx.info.push(msg);
  window.addEventListener('error', (e) => ctx && ctx.fail.push('page error: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => ctx && ctx.fail.push('unhandled rejection: ' + (e.reason && e.reason.message || e.reason)));

  const clr = (it) => {
    it.primaryPressed = it.secondaryPressed = it.a1 = it.a2 = it.a3 = it.ult = false;
    it.primary = it.secondary = false; it.jump = it.jumpHeld = it.flyToggle = false;
    it.choice = null; it.mx = it.mz = 0; it.up = it.down = false;
  };
  function resetFx() {
    const fx = g.fx; fx.add.n = 0; fx.alpha.n = 0;
    for (const it of fx.items) it.dispose(fx.scene); fx.items = [];
    for (const t of fx.trails) t.dispose(); fx.trails = [];
    for (const d of fx.decals) { fx.scene.remove(d.mesh); d.mesh.material.dispose(); } fx.decals = [];
    fx.updaters = [];
    w.hitstopT = 0;
  }
  /**
   * Stage heroes. spec: [{ key, team, at:[x,y,z], fly, player, bot, face:[x,z], hp }]
   * Bots run only for entries with bot:true; everyone else is driven through intents.
   */
  function stage(spec, { bots = 'idle', settings = {} } = {}) {
    g.clearWorld(); resetFx();
    g.state = 'playing'; g.menus.show(null); g.hud.show(false);
    Object.assign(w.settings, { bots, noCooldowns: false, fastUlt: false, godMode: false, comic: true, difficulty: 'normal' }, settings);
    w.score = [0, 0];
    const hs = [];
    for (const s of spec) {
      const h = g.spawn(s.key, s.team ?? 0, { isPlayer: !!s.player });
      if (s.player) g.player = h;
      h.pos.set(...s.at); h.vel.set(0, 0, 0);
      const gy = w.groundAt(h.pos.x, h.pos.z);
      if (s.fly) { h.mode = 'fly'; h.grounded = false; } else { h.pos.y = Math.max(h.pos.y, gy); h.mode = h.pos.y > gy + 0.05 ? 'air' : 'ground'; h.grounded = h.mode === 'ground'; }
      const f = s.face ? V(s.face[0], 0, s.face[1]).normalize() : V(0, 0, 1);
      h.intents.aimDir.copy(f); h.aimDir.copy(f); h.yaw = h.visYaw = Math.atan2(f.x, f.z);
      if (s.hp != null) h.hp = s.hp;
      h.spawnProtect = 0; h.invuln = 0;
      hs.push(h);
    }
    if (!g.player) g.player = hs[0];
    const keep = new Set(spec.map((s, i) => (s.bot ? hs[i] : null)).filter(Boolean));
    g.bots = g.bots.filter((b) => keep.has(b.h));
    g.playerBot = null; g.script = () => {}; g.camOverride = null;
    for (const h of hs) clr(h.intents);
    g.noRender = true; g.step(1 / 120);
    return hs;
  }
  function aim(h, pt) { const it = h.intents; it.aimOrigin.copy(h.pos).add(V(0, 1.5, 0)); it.aimDir.copy(pt).sub(it.aimOrigin).normalize(); it.aimPoint.copy(pt); it.aimHero = null; }
  const center = (h) => (h.center ? h.center.clone() : h.pos.clone().add(V(0, 1, 0)));
  /** step n frames at 60 Hz; fn(k) runs before each step (return false to stop early) */
  let frame = 0;
  function run(n, fn) { for (let k = 0; k < n; k++) { if (fn && fn(k) === false) return k; g.noRender = true; g.step(1 / 60); frame++; } return n; }
  /** move a hero instantly, carrying its world-space cape/hair simulation along (as spawnAt does) */
  function teleport(h, pt) {
    h.root.updateMatrixWorld(true);
    const from = h.root.matrixWorld.clone();
    h.pos.copy(pt); h.root.updateMatrixWorld(true);
    h.anim.chains.transform(from.invert().premultiply(h.root.matrixWorld));
  }
  /** hold an aim and press one intent on the first frame */
  function press(h, key, n = 1, target) { run(n, (k) => { clr(h.intents); if (target) aim(h, target); if (k === 0) h.intents[key] = true; }); }

  // ---------------------------------------------------------------- skeleton probes
  const _p = new THREE.Vector3();
  const bw = (bone) => { bone.updateWorldMatrix(true, false); return _p.setFromMatrixPosition(bone.matrixWorld).clone(); };
  function skel(h) {
    const r = h.rig, o = { hips: bw(r.hips.bone), head: bw(r.head.bone), neck: bw(r.neck.bone) };
    for (const s of ['L', 'R']) {
      const sd = r.side[s];
      o[s] = { thigh: bw(sd.thigh.bone), shin: bw(sd.shin.bone), foot: bw(sd.foot.bone), toe: sd.toe ? bw(sd.toe.bone) : null, upper: bw(sd.upper.bone), fore: bw(sd.fore.bone), hand: bw(sd.hand.bone) };
    }
    return o;
  }
  function boneNaN(h) {
    let bad = 0;
    h.root.traverse((o) => { if (o.isBone) { const q = o.quaternion, p = o.position; if (![q.x, q.y, q.z, q.w, p.x, p.y, p.z].every(Number.isFinite)) bad++; } });
    return bad;
  }
  const lens = {};
  /** returns a list of problems with the current pose of h ([] when fine) */
  function poseIssues(h, { allowLift = false } = {}) {
    const s = skel(h), out = [];
    if (boneNaN(h)) { out.push('NaN in bone transforms'); return out; }
    if (![h.pos.x, h.pos.y, h.pos.z].every(Number.isFinite)) { out.push('NaN position'); return out; }
    const L0 = (lens[h.key] ||= {});
    for (const side of ['L', 'R']) {
      const b = s[side];
      const leg = b.thigh.distanceTo(b.shin) + b.shin.distanceTo(b.foot);
      const arm = b.upper.distanceTo(b.fore) + b.fore.distanceTo(b.hand);
      const ref = (L0[side] ||= { leg, arm });
      if (Math.abs(leg - ref.leg) > 0.02 * ref.leg + 0.01) out.push(`${side} leg stretched ${ref.leg.toFixed(3)}->${leg.toFixed(3)}`);
      if (Math.abs(arm - ref.arm) > 0.02 * ref.arm + 0.01) out.push(`${side} arm stretched ${ref.arm.toFixed(3)}->${arm.toFixed(3)}`);
    }
    const standing = h.mode === 'ground' && !h.dead && !h.carriedBy && !h.override;
    if (standing) {
      // the surface the hero stands on (cover tops count, unlike w.groundAt)
      const gy = h.groundY ?? w.groundAt(h.pos.x, h.pos.z);
      const fy = [s.L.foot.y, s.R.foot.y];
      // a foot near hip height is only wrong while the hips are up (crouches and getups bring them down)
      const hipsUp = s.hips.y - gy > 0.7 * h.rig.hipsHeight;
      for (const [i, side] of [[0, 'L'], [1, 'R']]) {
        if (fy[i] > s.hips.y + 0.05 || (hipsUp && fy[i] > s.hips.y - 0.25)) out.push(`${side} foot at/above hips (foot ${fy[i].toFixed(2)}, hips ${s.hips.y.toFixed(2)})`);
        if (fy[i] < gy - 0.1) out.push(`${side} foot ${(gy - fy[i]).toFixed(2)} m under the ground`);
      }
      // (while the body is still rotating upright out of flight the legs are on their way down)
      const tilt = 2 * Math.acos(Math.min(1, Math.abs(h.visual.quaternion.w)));
      if (!allowLift && tilt < 0.45 && Math.min(fy[0], fy[1]) > gy + 0.35) out.push(`no foot on the ground (lowest ${(Math.min(...fy) - gy).toFixed(2)} m up)`);
      if (s.head.y < s.hips.y + 0.25) out.push(`head not above hips`);
      // knees bend forward relative to the pelvis, never backwards
      const legYaw = h.yaw + (h.anim.legYaw || 0);
      const fwd = V(Math.sin(legYaw), 0, Math.cos(legYaw));
      for (const side of ['L', 'R']) {
        const b = s[side];
        const toeDir = fwd;
        const ha = b.foot.clone().sub(b.thigh), t = THREE.MathUtils.clamp(b.shin.clone().sub(b.thigh).dot(ha) / ha.lengthSq(), 0, 1);
        const off = b.shin.clone().sub(b.thigh.clone().addScaledVector(ha, t));
        const bend = off.dot(toeDir);
        if (off.length() > 0.04 && bend < -0.03) out.push(`${side} knee bends backwards (${bend.toFixed(3)})`);
      }
    }
    return out;
  }
  /** cape chains: points must stay behind the torso and not rise above their anchor */
  function capeIssues(h) {
    const out = [], s = skel(h);
    const up = s.neck.clone().sub(s.hips).normalize();
    // chest direction: the rig's facing axis, which tilts with the body in flight
    const m = h.rig.space.matrixWorld.elements;
    const fwd = V(m[8], m[9], m[10]); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    for (const c of h.anim.chains.chains) {
      if (!/cape/i.test(c.def.name) || h.key !== 'omniman') continue;
      const a = c.p[0];
      let worstF = -9, worstU = -9;
      for (let i = 2; i < c.count; i++) { const d = c.p[i].clone().sub(a); worstF = Math.max(worstF, d.dot(fwd)); worstU = Math.max(worstU, d.dot(up)); }
      if (worstF > 0.18) out.push(`${c.def.name} swung in front of the body by ${worstF.toFixed(2)} m`);
      if (worstU > 0.2) out.push(`${c.def.name} rose ${worstU.toFixed(2)} m above its anchor`);
    }
    return out;
  }
  /**
   * pose pops: the head, hips or a hand/foot jumping relative to the body faster than any motion
   * the animation can produce (a clip snapping in, a body orientation reset). Teleports, deaths
   * and respawns are deliberate cuts and skipped.
   */
  const prevPose = new WeakMap();
  // per-frame limits; hands get the most room because strike keys ('snap' easing) are meant to
  // land in a frame or two
  const POP = { head: 0.4, hips: 0.4, hand: 1.0, foot: 0.7 };
  const _yq = new THREE.Quaternion(), _up = V(0, 1, 0);
  function popIssues(h) {
    const s = skel(h), out = [];
    // head and hands in the facing frame (an aim flick turns the whole hero, which is fine);
    // feet in world space relative to the hips, since planted feet must not move when it turns
    _yq.setFromAxisAngle(_up, -(h.visYaw ?? h.yaw));
    const loc = (p) => p.clone().sub(s.hips).applyQuaternion(_yq);
    const rel = {
      head: loc(s.head), hips: s.hips.clone().sub(h.pos),
      handL: loc(s.L.hand), handR: loc(s.R.hand),
      footL: s.L.foot.clone().sub(s.hips), footR: s.R.foot.clone().sub(s.hips),
    };
    const prev = prevPose.get(h);
    const cut = h.dead || h.dissolve > 0.05 || !prev || prev.f !== frame - 1 || prev.pos.distanceTo(h.pos) > 3;
    if (!cut) {
      for (const k in rel) {
        const lim = POP[k.replace(/[LR]$/, '')], d = rel[k].distanceTo(prev.rel[k]);
        if (d > lim) out.push(`${k} popped ${d.toFixed(2)} m in one frame`);
      }
    }
    prevPose.set(h, { rel, pos: h.pos.clone(), f: frame });
    return out;
  }
  /** run n frames, checking pose (and cape) each frame; returns first problems and counts */
  function watch(hs, n, fn, opts = {}) {
    const firsts = [], counts = {};
    run(n, (k) => {
      if (fn && fn(k) === false) return false;
      for (const h of hs) {
        const iss = [...poseIssues(h, opts), ...(opts.pop === false ? [] : popIssues(h)), ...(opts.cape === false ? [] : capeIssues(h))];
        for (const m of iss) {
          const key = h.key + ': ' + m.replace(/[-\d.]+/g, '#');
          counts[key] = (counts[key] || 0) + 1;
          if (counts[key] === 1) firsts.push(`f${k} ${h.key}[${h.mode}${h.override ? '/override' : ''}${h.anim.action ? '/' + h.anim.action.clip.name : ''}]: ${m}`);
        }
      }
    });
    return { firsts, counts };
  }
  const report = (label, r, maxFrames = 0) => {
    for (const f of r.firsts) {
      const key = Object.keys(r.counts).find((k) => f.includes(k.split(': ')[1].split('#')[0]));
      fail(`${label}: ${f}${key ? ` (x${r.counts[key]} frames)` : ''}`);
    }
  };

  async function runAll(filter) {
    const results = [];
    for (const t of tests) {
      if (filter && !t.name.includes(filter)) continue;
      ctx = { fail: [], info: [] };
      const t0 = performance.now();
      try { await t.fn(); } catch (e) { ctx.fail.push('threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
      results.push({ name: t.name, ms: Math.round(performance.now() - t0), fail: ctx.fail, info: ctx.info });
    }
    ctx = null;
    return results;
  }
  return { g, w, THREE, V, test, expect, fail, info, clr, stage, aim, center, run, press, teleport, skel, boneNaN, poseIssues, popIssues, capeIssues, watch, report, resetFx, runAll };
})();
