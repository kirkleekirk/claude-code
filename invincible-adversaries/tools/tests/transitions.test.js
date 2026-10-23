// Mode transitions: every way a hero leaves and re-enters the ground must end in a sane pose.
const KEYS = ['invincible', 'rex', 'eve', 'robot', 'omniman', 'battlebeast'];
const ahead = (h) => h.pos.clone().add(T.V(Math.sin(h.yaw) * 10, 1.4, Math.cos(h.yaw) * 10));

for (const key of KEYS) {
  T.test(`${key}: drops from 1-15 m land on both feet`, () => {
    for (const [hgt, vy] of [[1, 0], [3, -6], [9, -24], [15, -35]]) {
      const [h] = T.stage([{ key, player: true, at: [0, hgt, 0] }]);
      h.mode = 'air'; h.vel.set(0, vy, 0);
      const r = T.watch([h], 140, () => { T.clr(h.intents); T.aim(h, T.V(0, 1.5, 12)); });
      T.report(`${hgt} m drop`, r);
      T.expect(h.grounded && h.mode === 'ground', `${hgt} m drop: not grounded afterwards (${h.mode})`);
    }
  });

  T.test(`${key}: jump, double-tap flight, landing and running out of flight`, () => {
    const [h] = T.stage([{ key, player: true, at: [0, 0, 0] }]);
    let r = T.watch([h], 100, (k) => { T.clr(h.intents); T.aim(h, ahead(h)); h.intents.jump = k === 0; h.intents.mz = k < 50 ? 1 : 0; });
    T.report('jump', r);
    r = T.watch([h], 90, (k) => { T.clr(h.intents); T.aim(h, ahead(h)); h.intents.flyToggle = k === 0; h.intents.up = k > 2 && k < 40; h.intents.mz = 1; });
    T.report('take off + fly', r);
    // (Rex and Battle Beast can't fly: the double-tap does nothing)
    if (!h.def.flight) { T.expect(h.mode !== 'fly', `${key} took off without flight`); return; }
    T.expect(h.mode === 'fly', `expected flying, got ${h.mode}`);
    r = T.watch([h], 200, () => { T.clr(h.intents); T.aim(h, ahead(h)); h.intents.down = true; });
    T.report('descend + land', r);
    T.expect(h.mode === 'ground', `did not land (mode ${h.mode}, y ${h.pos.y.toFixed(2)})`);
    if (!h.def.flight.unlimited) {
      T.teleport(h, T.V(h.pos.x, 6, h.pos.z)); h.mode = 'fly'; h.grounded = false; h.flyEnergy = 0.02;
      r = T.watch([h], 160, () => { T.clr(h.intents); T.aim(h, ahead(h)); h.intents.mz = 1; });
      T.report('flight energy runs out', r);
      T.expect(h.mode === 'ground', `after running out of flight: mode ${h.mode}`);
    }
  });

  T.test(`${key}: knockback tumbles recover on the ground and in the air`, () => {
    // several knocks: each one gets a different random spin
    const knocks = [[14, 9, 0], [-10, 12, 6], [0, 5, -16], [8, 14, 8], [-16, 3, 0], [4, 10, -12]];
    for (const [i, kv] of knocks.entries()) {
      const [h] = T.stage([{ key, player: true, at: [0, 0, 0] }]);
      T.run(30, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
      h.knock(T.V(...kv), { force: true });
      let r = T.watch([h], 200, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
      T.report(`ground tumble ${i}`, r);
      T.expect(h.mode === 'ground', `tumble ${i} did not end on the ground (${h.mode})`);
      if (h.def.flight) {
        T.teleport(h, T.V(h.pos.x, 12, h.pos.z)); h.mode = 'fly'; h.grounded = false;
        h.knock(T.V(-kv[0], kv[1] * 0.6, -kv[2]), { force: true });
        r = T.watch([h], 120, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
        T.report(`air tumble ${i}`, r);
        T.expect(h.mode === 'fly', `flier knocked out of flight (${i}) did not recover into flight (${h.mode})`);
      }
    }
  });

  T.test(`${key}: death, respawn, revive and teleport`, () => {
    const [h, foe] = T.stage([{ key, player: true, at: [0, 0, 0] }, { key: 'omniman', team: 1, at: [0, 0, 6] }]);
    T.run(20, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
    T.w.kill(foe, h);
    T.expect(h.dead, 'not dead after kill');
    T.run(Math.ceil((T.RULES.respawn) * 60) + 30, () => { T.clr(h.intents); });
    T.expect(!h.dead, 'did not respawn within respawn time + 0.5 s');
    let r = T.watch([h], 60, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
    T.report('after respawn', r);
    T.w.kill(foe, h); T.run(30);
    h.revive(T.V(5, 0, 5), 1);
    r = T.watch([h], 60, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
    T.report('after revive', r);
    T.expect(h.hp === h.maxHp && !h.dead, 'revive did not restore the hero');
    // a teleport carries the world-space cape/hair simulation along rigidly
    T.run(40, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
    const shape = () => h.anim.chains.chains.map((c) => c.p.map((q) => q.clone().sub(h.pos)));
    const before = shape(), yaw0 = h.yaw;
    h.spawnAt(T.V(-30, 0, 20));
    const turn = new T.THREE.Matrix4().makeRotationY(h.yaw - yaw0), after = shape();
    let worst = 0;
    before.forEach((c, i) => c.forEach((q, j) => { worst = Math.max(worst, q.applyMatrix4(turn).distanceTo(after[i][j])); }));
    T.expect(worst < 1e-3, `spawnAt changed the cape/hair shape by ${worst.toFixed(3)} m`);
    r = T.watch([h], 60, () => { T.clr(h.intents); T.aim(h, ahead(h)); });
    T.report('after teleport', r);
  });
}

T.test('omniman: cape stays behind the body through combat, charge, flight and landing', () => {
  const [h, foe] = T.stage([{ key: 'omniman', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'invincible', team: 1, at: [0, 0, 4], face: [0, -1] }]);
  let r = T.watch([h], 160, () => { T.clr(h.intents); T.aim(h, T.center(foe)); h.intents.primary = true; }, { cape: true });
  T.report('combo with lunges', r);
  foe.pos.set(0, 0, 14); foe.vel.set(0, 0, 0); foe.mode = 'ground'; foe.status.stunT = 0;
  r = T.watch([h], 120, (k) => { T.clr(h.intents); T.aim(h, T.center(foe)); h.intents.a1 = k === 2; });
  T.report('charge', r);
  r = T.watch([h], 160, (k) => { T.clr(h.intents); T.aim(h, h.pos.clone().add(T.V(10, 2, 10))); h.intents.flyToggle = k === 0; h.intents.mz = 1; h.intents.up = k < 30; });
  T.report('flight', r);
  r = T.watch([h], 220, () => { T.clr(h.intents); T.aim(h, h.pos.clone().add(T.V(10, -4, 10))); h.intents.down = true; });
  T.report('dive + landing', r);
  let yaw = 0;
  r = T.watch([h], 180, () => { T.clr(h.intents); yaw += 0.06; T.aim(h, h.pos.clone().add(T.V(Math.sin(yaw) * 10, 1.4, Math.cos(yaw) * 10))); });
  T.report('turning in place', r);
});
