// Every action clip of every hero, played on a grounded hero: the skeleton must stay sane
// (no NaN, no stretched limbs, a supporting foot on the ground, knees bending the right way).
const KEYS = ['invincible', 'eve', 'omniman'];
// clips whose whole point is leaving the ground or lying down
const AIRBORNE = new Set(['ultRise', 'divePrep', 'carry', 'slamThrow', 'chargePose', 'blitz', 'unbound', 'beam', 'revive', 'getup', 'superland', 'land']);

for (const key of KEYS) {
  T.test(`${key}: every clip keeps a sane skeleton`, () => {
    const [h] = T.stage([{ key, player: true, at: [0, 0, 0], face: [0, 1] }]);
    const clips = h.kit.clips;
    T.info(`${Object.keys(clips).length} clips`);
    for (const name in clips) {
      const [hh] = T.stage([{ key, player: true, at: [0, 0, 0], face: [0, 1] }]);
      T.run(20, () => { T.clr(hh.intents); T.aim(hh, T.V(0, 1.4, 10)); });
      hh.anim.play(clips[name], { hold: false });
      const frames = Math.ceil((clips[name].duration + 0.4) * 60);
      const r = T.watch([hh], frames, () => { T.clr(hh.intents); T.aim(hh, T.V(0, 1.4, 10)); }, { allowLift: AIRBORNE.has(name), cape: false });
      T.report(`${name}`, r);
    }
  });
}

for (const key of KEYS) {
  T.test(`${key}: idle, walk, run, strafe, backpedal and turn keep feet planted`, () => {
    const [h] = T.stage([{ key, player: true, at: [0, 0, 0], face: [0, 1] }]);
    const dirs = [['idle', 0, 0], ['walk', 0, 0.4], ['run', 0, 1], ['strafeL', -1, 0], ['strafeR', 1, 0], ['back', 0, -1], ['diag', 0.7, 0.7]];
    for (const [label, mx, mz] of dirs) {
      let yaw = h.yaw;
      // foot slide: a foot in the middle of its stance (by the gait's own phase) must stay put on the
      // ground while the body moves over it
      let slid = 0, planted = 0, moved = 0;
      const prev = {};
      const r = T.watch([h], 150, (k) => {
        T.clr(h.intents); h.intents.mx = mx; h.intents.mz = mz; T.aim(h, h.pos.clone().add(T.V(Math.sin(yaw) * 10, 1.4, Math.cos(yaw) * 10))); if (label === 'diag') yaw += 0.02;
        const a = h.anim, sk = T.skel(h), v = Math.hypot(h.vel.x, h.vel.z);
        for (const side of ['L', 'R']) {
          const ph = a.footPhase[side], u = ph / (a.gaitBeta || 1);
          const mid = k > 40 && a.moveBlend > 0.9 && v > 1 && ph < a.gaitBeta && u > 0.1 && u < 0.9;
          const f = sk[side].foot;
          if (mid && prev[side]) { slid += Math.hypot(f.x - prev[side].x, f.z - prev[side].z); planted += 1 / 60; moved += v / 60; }
          prev[side] = mid ? f.clone() : null;
        }
      });
      T.report(label, r);
      if (planted > 0.1) {
        const pct = slid / moved * 100;
        T.info(`${label}: planted feet slide ${pct.toFixed(0)}% of body speed`);
        T.expect(pct < 12, `${label}: planted feet slide ${pct.toFixed(0)}% of body speed`);
      }
    }
    // turning in place (starting from the current facing: a test-made aim jump would be a pop)
    let yaw = h.yaw;
    const r = T.watch([h], 180, () => { T.clr(h.intents); yaw += 0.05; T.aim(h, h.pos.clone().add(T.V(Math.sin(yaw) * 10, 1.4, Math.cos(yaw) * 10))); });
    T.report('turn in place', r);
  });
}
