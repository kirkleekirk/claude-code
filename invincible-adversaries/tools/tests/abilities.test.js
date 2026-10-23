// Abilities: every ability of every hero connects for about its listed damage, goes on cooldown,
// can't be recast early, and leaves no state behind. Then the edge cases: targets and casters
// dying mid-ability, swapping hero mid-ability, mirror matchups, walls, arena edges and the ceiling.
const BIG = 5000;

/** attacker (player, team 0) at `at` facing +z, an idle enemy `dist` ahead */
function duel(key, foeKey, dist, o = {}) {
  const at = o.at || [0, 0, 0];
  const [h, foe] = T.stage([
    { key, player: true, at, face: o.face || [0, 1], fly: o.fly },
    { key: foeKey, team: 1, at: o.foeAt || [at[0], at[1] + (o.foeUp || 0), at[2] + dist], face: [0, -1], fly: o.foeFly },
  ]);
  foe.maxHp = foe.hp = o.foeHp ?? BIG;
  return [h, foe];
}
/** press (or hold) an ability while aiming at the foe; extra(k) can add intents each frame */
function cast(h, foe, slot, frames, { hold = false, aimAt, extra } = {}) {
  return T.run(frames, (k) => {
    T.clr(h.intents);
    T.aim(h, aimAt ? aimAt() : T.center(foe));
    h.intents.aimHero = foe && foe.team !== h.team ? foe : null;
    if (slot === 'primary') { h.intents.primary = hold || k === 0; h.intents.primaryPressed = k === 0; }
    else if (slot === 'secondary') { h.intents.secondaryPressed = k === 0; h.intents.secondary = k === 0; }
    else if (slot) h.intents[slot] = k === 0;
    extra && extra(k);
  });
}
const expectClean = (label, hs) => { for (const h of hs) for (const m of T.cleanIssues(h)) T.fail(`${label}: ${h.key} ${m}`); };
// scene objects other than crater decals (those persist on purpose, in a capped pool)
const sceneCount = () => T.g.scene.children.length - T.g.fx.decals.length;

// [slot, enemy distance, frames, damage min, max, options]
const SPECS = {
  invincible: [
    ['primary', 2.4, 110, 120, 360, { hold: true }],
    ['secondary', 8, 40, 45, 90],
    ['a1', 10, 60, 55, 100],
    ['a2', 15, 90, 55, 110, { aimAt: (h, foe) => foe.pos.clone() }],
    ['a3', 3, 200, 70, 170],
    ['ult', 20, 420, 250, 470],
  ],
  eve: [
    ['primary', 12, 70, 70, 230, { hold: true }],
    ['secondary', 10, 60, 60, 120],
    ['a2', 10, 120, 0, 0],
    ['ult', 12, 600, 300, 3000, { extra: (h, k) => { if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true; } }],
  ],
  omniman: [
    ['primary', 2.4, 110, 150, 330, { hold: true }],
    ['secondary', 15, 90, 80, 170],
    ['a1', 10, 90, 90, 150],
    ['a2', 10, 40, 60, 110],
    // with fewer than three enemies the blitz revisits one: 3 x 150 + the 80 finisher
    ['ult', 15, 420, 450, 620],
  ],
  rex: [
    ['primary', 12, 70, 60, 220, { hold: true }],
    // the rod sticks to him and blows on its own 3 s later: 110 at the centre + 30 for being stuck
    ['secondary', 10, 260, 110, 165],
    ['a1', 2.5, 40, 25, 50],
    ['a2', 10, 120, 40, 90, { aimAt: (h, foe) => foe.pos.clone() }],
    ['a3', 6, 50, 60, 230],
    ['ult', 6, 200, 150, 380],
  ],
  battlebeast: [
    ['primary', 2.4, 110, 150, 380, { hold: true }],
    ['secondary', 8, 40, 0, 0],
    ['a1', 15, 90, 55, 100],
    ['a2', 8, 60, 15, 30],
    ['a3', 3, 200, 120, 145],
    ['ult', 6, 60, 15, 30],
  ],
  robot: [
    ['primary', 12, 70, 70, 260, { hold: true }],
    ['secondary', 12, 130, 60, 230],
    ['a1', 10, 40, 0, 0],
    ['a2', 10, 140, 30, 60, { aimAt: (h, foe) => foe.pos.clone() }],
    ['a3', 10, 60, 0, 0],
    ['ult', 12, 200, 15, 40],
  ],
};

for (const key of Object.keys(SPECS)) {
  for (const [slot, dist, frames, min, max, o = {}] of SPECS[key]) {
    T.test(`${key} ${slot}: connects, goes on cooldown, leaves nothing behind`, () => {
      const [h, foe] = duel(key, 'omniman', dist);
      T.run(10, () => { T.clr(h.intents); T.aim(h, T.center(foe)); });
      const def = h.def.abilities[slot];
      if (slot === 'ult') h.ult = h.def.ultCost;
      const base = sceneCount(), t0 = T.w.time;
      cast(h, foe, slot, frames, { hold: o.hold, aimAt: o.aimAt && (() => o.aimAt(h, foe)), extra: o.extra && ((k) => o.extra(h, k)) });
      const dealt = T.dmgTo(foe, t0);
      T.info(`${dealt.toFixed(0)} damage`);
      if (max > 0) T.expect(dealt >= min && dealt <= max, `dealt ${dealt.toFixed(0)}, expected ${min}-${max}`);
      if (slot === 'ult') T.expect(h.ult < h.def.ultCost * 0.1, `ult charge not spent (${h.ult.toFixed(0)})`);
      else if (def.cd) {
        const left = def.charges ? (h.charges[slot] < def.charges) : h.cd[slot] > 0;
        T.expect(left, `${slot} did not go on cooldown`);
      }
      // the ability must finish and clean up (heroes knocked around get time to land)
      const f = T.settle([h, foe], 900);
      T.expect(f >= 0, `did not settle within 15 s (override ${!!h.override}, foe ${foe.mode})`);
      T.run(30, () => { T.clr(h.intents); T.clr(foe.intents); });
      expectClean(`${slot} afterwards`, [h, foe]);
      // lingering zones (Eve's field), barriers and drones run out
      for (let k = 0; k < 420 && (T.w.zones.length || T.w.barriers.length || (h.kit.drones && h.kit.drones.length) || (h.kit.rods && (h.kit.rods.length || h.kit.grenades.length))); k++) T.run(1);
      T.expect(sceneCount() <= base + 1, `scene grew by ${sceneCount() - base} objects`);
      if (slot !== 'ult' && def.cd && !def.charges) {
        // pressing again on cooldown does nothing
        const cd0 = h.cd[slot], tA = T.w.time;
        cast(h, foe, slot, 5);
        T.expect(h.cd[slot] <= cd0, `${slot} recast while on cooldown`);
        T.expect(!h.override, `${slot} started again while on cooldown`);
        void tA;
      }
    });
  }
}

T.test('invincible secondary: two charges, then cooldown', () => {
  const [h, foe] = duel('invincible', 'omniman', 8);
  const t0 = T.w.time;
  for (let i = 0; i < 3; i++) { cast(h, foe, 'secondary', 40); }
  T.expect(h.charges.secondary === 0, `charges left: ${h.charges.secondary}`);
  const hits = T.log.damage.filter((e) => e.target === foe && e.t > t0).length;
  T.expect(hits === 2, `third clap went off on an empty charge (${hits} hits)`);
  T.run(Math.ceil(h.def.abilities.secondary.cd * 60) + 10);
  T.expect(h.charges.secondary >= 1, 'a charge did not come back after the cooldown');
});

T.test('eve a1: bubbles herself or the ally under the crosshair, two charges', () => {
  const [eve, ally, foe] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'invincible', team: 0, at: [0, 0, 8] }, { key: 'omniman', team: 1, at: [20, 0, 20] }]);
  T.run(10, () => { T.clr(eve.intents); T.aim(eve, T.center(ally)); });
  cast(eve, null, 'a1', 40, { aimAt: () => T.center(ally), extra: () => { eve.intents.aimHero = ally; } });
  T.expect(ally.bubble && Math.abs(ally.bubble.amt - 225) < 1, `ally not bubbled for 225 (${ally.bubble && ally.bubble.amt})`);
  cast(eve, null, 'a1', 40, { aimAt: () => eve.pos.clone().add(T.V(10, 1, 0)) });
  T.expect(!!eve.bubble, 'self bubble missing when no ally is aimed at');
  T.expect(eve.charges.a1 === 0, `charges left ${eve.charges.a1}`);
  const n = [ally.bubble, eve.bubble].filter(Boolean).length;
  cast(eve, null, 'a1', 40, { aimAt: () => T.center(ally), extra: () => { eve.intents.aimHero = ally; } });
  T.expect(n === 2, 'expected two bubbles');
  T.run(4.2 * 60);
  T.expect(!ally.bubble && !eve.bubble, 'bubbles outlived their 4 s');
  T.run(30);
  T.expect(T.g.fx.updaters.length < 40, `${T.g.fx.updaters.length} fx updaters left running`);
});

T.test('eve a2: the field makes enemies take 25% more damage and slows them', () => {
  const [eve, foe] = duel('eve', 'invincible', 10);
  cast(eve, foe, 'a2', 90);
  T.expect(Math.abs(foe.status.vuln - 0.25) < 0.01, `vuln ${foe.status.vuln}`);
  T.expect(foe.status.slow > 0, 'field did not slow');
  const got = T.w.damage(eve, foe, 100, { type: 'test' });
  T.expect(Math.abs(got - 125) < 0.5, `100 damage became ${got.toFixed(1)} in the field`);
});

T.test('eve a3: restoration pulse heals nearby allies and cleanses slows', () => {
  const [eve, ally, far] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0] }, { key: 'omniman', team: 0, at: [6, 0, 0] }, { key: 'invincible', team: 0, at: [40, 0, 0] }]);
  ally.hp = ally.maxHp - 200; far.hp = far.maxHp - 200;
  ally.status.slow = 0.3; ally.status.slowT = 5;
  ally.lastHurt = far.lastHurt = T.w.time; // no passive regen during the test
  const a0 = ally.hp, f0 = far.hp;
  cast(eve, null, 'a3', 150, { aimAt: () => T.center(ally), extra: () => { ally.lastHurt = far.lastHurt = T.w.time; } });
  T.expect(ally.hp - a0 >= 110, `ally healed ${(ally.hp - a0).toFixed(0)} (expected 80 + 40 over 2 s)`);
  T.expect(far.hp - f0 < 1, 'ally 40 m away was healed');
  T.expect(ally.status.slow === 0, 'slow not cleansed');
});

T.test('eve ult: reconstruction revives fallen allies', () => {
  const [eve, ally, foe] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0] }, { key: 'invincible', team: 0, at: [5, 0, 0] }, { key: 'omniman', team: 1, at: [0, 0, 30] }]);
  T.w.kill(foe, ally);
  T.run(10);
  eve.ult = eve.def.ultCost;
  cast(eve, null, 'ult', 300, { aimAt: () => eve.pos.clone().add(T.V(0, 1, 10)), extra: () => { if (eve.kit.ultState && eve.kit.ultState.phase === 'choose') eve.intents.secondaryPressed = true; } });
  T.expect(!ally.dead && ally.hp > 0, 'fallen ally was not revived');
  T.expect(T.settle([eve, ally], 600) >= 0, 'did not settle');
  expectClean('reconstruction afterwards', [eve, ally]);
});

T.test('omniman a3: conqueror grants overhealth, damage and damage reduction', () => {
  const [h, foe] = duel('omniman', 'invincible', 6);
  cast(h, foe, 'a3', 30);
  T.expect(Math.abs(h.overhealth - 150) < 30, `overhealth ${h.overhealth}`);
  T.expect(Math.abs(h.status.boost - 0.2) < 0.01 && Math.abs(h.status.dr - 0.2) < 0.01, `boost ${h.status.boost} dr ${h.status.dr}`);
  const got = T.w.damage(foe, h, 100, { noLifesteal: true });
  T.expect(Math.abs(got - 80) < 0.5, `100 damage became ${got.toFixed(1)} under 20% DR`);
  T.run(4.5 * 60);
  T.expect(h.status.boost === 0 && h.status.dr === 0, 'buff outlived its 4 s');
});

T.test('robot a1: the barrier stops enemy fire from either side and lets allies shoot through', () => {
  const [rb, foe, ally] = T.stage([
    { key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] },
    { key: 'eve', team: 1, at: [0, 0, 12], face: [0, -1] },
    { key: 'eve', team: 0, at: [1.2, 0, -1], face: [0, 1] },
  ]);
  foe.maxHp = foe.hp = BIG;
  cast(rb, foe, 'a1', 40);
  const br = T.w.barriers[0];
  T.expect(!!br && br.team === rb.team && br.alive, 'no barrier went up');
  if (!br) return;
  T.expect(Math.abs(br.c.z - 4) < 0.5 && Math.abs(br.c.x) < 0.5, `barrier at (${br.c.x.toFixed(1)}, ${br.c.z.toFixed(1)}), expected 4 m ahead`);
  const hp0 = br.hp;
  let t0 = T.w.time;
  // the enemy shoots at Robot and his ally: the wall takes all of it
  T.run(75, (k) => { T.clr(foe.intents); T.aim(foe, T.center(k % 40 < 20 ? rb : ally)); foe.intents.primary = true; });
  const through = T.dmgTo(rb, t0) + T.dmgTo(ally, t0);
  T.expect(through === 0, `enemy fire got through (${through.toFixed(0)})`);
  T.expect(hp0 - br.hp > 100, `the barrier took only ${(hp0 - br.hp).toFixed(0)}`);
  // allies shoot out through it
  t0 = T.w.time;
  T.run(75, () => { T.clr(foe.intents); T.clr(ally.intents); T.aim(ally, T.center(foe)); ally.intents.primary = true; });
  T.expect(T.dmgTo(foe, t0) > 50, `the ally's shots were stopped (${T.dmgTo(foe, t0).toFixed(0)})`);
  // from behind: an enemy on Robot's side can't shoot an ally beyond the wall either
  T.teleport(foe, T.V(0, 0, 1.5)); T.teleport(ally, T.V(0, 0, 9));
  t0 = T.w.time;
  T.run(60, () => { T.clr(foe.intents); T.clr(ally.intents); T.aim(foe, T.center(ally)); foe.intents.primary = true; });
  T.expect(T.dmgTo(ally, t0) === 0, `fire from behind the wall got through (${T.dmgTo(ally, t0).toFixed(0)})`);
});

T.test('robot a1: fat projectiles and blasts do not reach heroes hugging the far side', () => {
  for (const foeKey of ['omniman', 'eve', 'robot']) {
    const [rb, foe, ally] = T.stage([
      { key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] },
      { key: foeKey, team: 1, at: [0, 0, 16], face: [0, -1] },
      { key: 'invincible', team: 0, at: [0.4, 0, 3.4] },
    ]);
    foe.maxHp = foe.hp = BIG;
    cast(rb, foe, 'a1', 40);
    const t0 = T.w.time;
    // boulder, Eve's fist, an EMP
    const slot = foeKey === 'robot' ? 'a2' : 'secondary';
    cast(foe, ally, slot, 150, { aimAt: () => T.center(ally) });
    T.expect(T.dmgTo(ally, t0) === 0 && T.dmgTo(rb, t0) === 0, `${foeKey} ${slot} reached behind the barrier (ally ${T.dmgTo(ally, t0).toFixed(0)}, robot ${T.dmgTo(rb, t0).toFixed(0)})`);
    T.expect(!ally.disrupted, `${foeKey} ${slot}: the EMP disrupted through the barrier`);
    T.expect(T.w.barriers.length === 0 || T.w.barriers[0].hp < T.w.barriers[0].maxHp, `${foeKey} ${slot} missed the barrier`);
  }
});

T.test('robot a1: the barrier breaks after 700 damage and fades after 5 s', () => {
  const [rb, foe] = duel('robot', 'omniman', 12);
  cast(rb, foe, 'a1', 40);
  let br = T.w.barriers[0];
  T.expect(!!br, 'no barrier went up');
  if (!br) return;
  const hp0 = rb.hp;
  for (let i = 0; i < 2; i++) T.expect(T.w.damage(foe, rb, 300) === 0, `hit ${i + 1} was not blocked`);
  T.expect(Math.abs(br.hp - 100) < 0.5 && br.alive, `barrier at ${br.hp} HP after 600 damage`);
  T.w.damage(foe, rb, 300);
  T.expect(!br.alive, 'barrier did not break at 0 HP');
  T.expect(rb.hp === hp0, 'the breaking hit carried through');
  T.expect(T.w.damage(foe, rb, 50, { noLifesteal: true }) > 0, 'damage still blocked after the barrier broke');
  T.run(30);
  T.expect(T.w.barriers.length === 0 && !br.mesh.parent, 'broken barrier still in the scene');
  // (the breaking hit only counts for the 100 HP the wall had left)
  const soak = 700 * T.RULES.ultPerShield;
  T.expect(rb.ult > soak - 1 && rb.ult < soak + 10, `soaking 700 charged the ult ${rb.ult.toFixed(0)} (expected ${soak} + passive)`);
  // a fresh one times out after 5 s
  for (const k in rb.cd) rb.cd[k] = 0;
  cast(rb, foe, 'a1', 40);
  br = T.w.barriers[0];
  T.run(4.2 * 60);
  T.expect(br && br.alive, 'barrier gone before 5 s');
  T.run(60);
  T.expect(T.w.barriers.length === 0, 'barrier outlived 5 s');
});

T.test('robot a2: the EMP pops bubbles and overhealth and locks abilities and flight for 2 s', () => {
  const [rb, eve, omni] = T.stage([
    { key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] },
    { key: 'eve', team: 1, at: [-1, 3, 10], fly: true, face: [0, -1] },
    { key: 'omniman', team: 1, at: [2, 0, 10], face: [0, -1] },
  ]);
  eve.maxHp = eve.hp = omni.maxHp = omni.hp = BIG;
  eve.kit.applyBubble(eve);
  omni.overhealth = 150; omni.ohT = 5;
  const keepFlying = () => { T.clr(eve.intents); eve.intents.up = eve.pos.y < 3; };
  cast(rb, null, 'a2', 70, { aimAt: () => T.V(0.5, 0.5, 10), extra: keepFlying });
  T.expect(!eve.bubble, 'bubble survived the EMP');
  T.expect(omni.overhealth === 0, `overhealth left: ${omni.overhealth}`);
  T.expect(eve.status.disruptT > 1 && omni.status.disruptT > 1, `disrupt ${eve.status.disruptT.toFixed(2)} / ${omni.status.disruptT.toFixed(2)} s`);
  T.expect(eve.mode !== 'fly', `the flier kept flying (${eve.mode})`);
  // locked out of abilities, the ult and flight; weapons still fire
  omni.ult = omni.def.ultCost;
  const t0 = T.w.time;
  T.run(30, (k) => {
    T.clr(omni.intents); T.aim(omni, T.center(rb)); omni.intents.a1 = omni.intents.a2 = omni.intents.a3 = k === 0; omni.intents.ult = k === 4;
    T.clr(eve.intents); T.aim(eve, T.center(rb)); eve.intents.flyToggle = eve.intents.jump = k === 2; eve.intents.a3 = k === 6; eve.intents.primary = true;
  });
  T.expect(!omni.override && omni.ult === omni.def.ultCost && omni.cd.a1 === 0 && omni.cd.a3 === 0, `Omni-Man used an ability while disrupted (cd ${JSON.stringify(omni.cd)})`);
  T.expect(eve.mode !== 'fly', 'Eve took off while disrupted');
  T.expect(eve.cd.a3 === 0, 'Eve used an ability while disrupted');
  T.expect(T.dmgBy(eve, t0) > 0, 'weapons stopped firing while disrupted');
  T.run(100, () => { T.clr(omni.intents); T.clr(eve.intents); });
  T.expect(!omni.disrupted && !eve.disrupted, 'the disrupt outlived 2 s');
  T.run(5, (k) => { T.clr(omni.intents); T.aim(omni, T.center(rb)); omni.intents.a3 = k === 0; });
  T.expect(omni.cd.a3 > 0, 'abilities still locked after the disrupt');
});

T.test('robot a3: repair drones heal the most hurt allies and cut the damage they take', () => {
  const [rb, a, b, foe] = T.stage([
    { key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] },
    { key: 'invincible', team: 0, at: [5, 0, 0] },
    { key: 'omniman', team: 0, at: [-5, 0, 0] },
    { key: 'eve', team: 1, at: [0, 0, 30] },
  ]);
  a.hp = a.maxHp - 260; b.hp = b.maxHp - 100;
  const a0 = a.hp, b0 = b.hp, r0 = rb.hp;
  const quiet = () => { for (const x of [rb, a, b]) x.lastHurt = T.w.time; }; // no passive regeneration
  cast(rb, null, 'a3', 40, { aimAt: () => T.V(0, 1, 10), extra: quiet });
  const on = (x) => rb.kit.drones.filter((d) => d.target === x).length;
  T.expect(rb.kit.drones.length === 3 && on(a) === 2 && on(b) === 1, `drones on ${rb.kit.drones.map((d) => d.target.key)} (want invincible x2, omniman)`);
  T.run(60, quiet);
  T.expect(a.status.dr >= 0.15 && b.status.dr >= 0.15, `no damage reduction while repairing (${a.status.dr}, ${b.status.dr})`);
  const got = T.w.damage(foe, a, 100, { noLifesteal: true });
  a.hp += got; a.healingDone = 0; // (undo it)
  T.expect(Math.abs(got - 85) < 0.5, `100 damage became ${got.toFixed(1)} under repair`);
  T.run(5 * 60, quiet);
  T.expect(Math.abs(a.hp - a0 - 200) < 8, `two drones healed ${(a.hp - a0).toFixed(0)} (expected 2 x 25 HP/s x 4 s)`);
  T.expect(b.hp === b.maxHp && rb.hp === r0, `one drone healed ${(b.hp - b0).toFixed(0)} of 100; Robot ${(rb.hp - r0).toFixed(0)}`);
  T.expect(rb.kit.drones.length === 0, `${rb.kit.drones.length} drones still out`);
  T.expect(sceneCount() < 200, 'scene not cleaned');
  // a drone whose patient dies moves on to the next most hurt ally
  for (const k in rb.cd) rb.cd[k] = 0;
  a.hp = a.maxHp - 200; b.hp = b.maxHp - 150;
  cast(rb, null, 'a3', 40, { aimAt: () => T.V(0, 1, 10), extra: quiet });
  T.w.kill(foe, a);
  T.run(30, quiet);
  T.expect(rb.kit.drones.length === 3 && rb.kit.drones.every((d) => d.target === b || d.target === rb), `drones after the patient died: ${rb.kit.drones.map((d) => d.target && d.target.key)}`);
});

T.test('robot ult: the override wave disrupts and exposes enemies and overclocks allies', () => {
  const [rb, ally, foe, far] = T.stage([
    { key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] },
    { key: 'invincible', team: 0, at: [6, 0, 0] },
    { key: 'omniman', team: 1, at: [0, 0, 20] },
    { key: 'eve', team: 1, at: [0, 0, -45] },
  ]);
  foe.maxHp = foe.hp = BIG;
  ally.cd.a1 = 5; ally.charges.secondary = 0;
  rb.ult = rb.def.ultCost;
  const t0 = T.w.time;
  cast(rb, foe, 'ult', 100);
  T.expect(foe.status.disruptT > 2.2, `disrupt ${foe.status.disruptT.toFixed(2)} s`);
  T.expect(Math.abs(foe.status.vuln - 0.2) < 0.01, `vuln ${foe.status.vuln}`);
  // (Robot's own overclock lands first, so the wave hits for 20 x 1.2)
  T.expect(Math.abs(T.dmgTo(foe, t0) - 24) < 1, `wave dealt ${T.dmgTo(foe, t0).toFixed(1)}`);
  T.expect(!far.disrupted && T.dmgTo(far, t0) === 0, 'the wave reached 45 m');
  T.expect(ally.cd.a1 === 0 && ally.charges.secondary === ally.def.abilities.secondary.charges, `ally cooldowns not reset (a1 ${ally.cd.a1}, charges ${ally.charges.secondary})`);
  for (const x of [ally, rb]) T.expect(Math.abs(x.status.boost - 0.2) < 0.01 && Math.abs(x.status.haste - 0.2) < 0.01, `${x.key} overclock: boost ${x.status.boost}, haste ${x.status.haste}`);
  T.expect(T.settle([rb], 300) >= 0, 'the ult did not end');
  expectClean('override afterwards', [rb, foe]);
  // overclocked allies run 20% faster
  T.run(60, () => { T.clr(ally.intents); ally.intents.mz = 1; T.aim(ally, ally.pos.clone().add(T.V(0, 1.4, 10))); });
  const v = Math.hypot(ally.vel.x, ally.vel.z);
  T.expect(Math.abs(v / ally.def.speed - 1.2) < 0.06, `overclocked speed ${v.toFixed(2)} vs ${ally.def.speed}`);
  T.run(5.2 * 60);
  T.expect(ally.status.haste === 0 && ally.status.boost === 0, 'overclock outlived 6 s');
  T.expect(!foe.disrupted && foe.status.vuln === 0, 'the override outlived 3 s');
});

T.test('robot passive: he and allies within 20 m recharge abilities 20% faster', () => {
  const [rb, near, far] = T.stage([
    { key: 'robot', player: true, at: [0, 0, 0] },
    { key: 'omniman', team: 0, at: [8, 0, 0] },
    { key: 'omniman', team: 0, at: [-30, 0, 0] },
  ]);
  rb.cd.a1 = near.cd.a1 = far.cd.a1 = 6;
  T.run(240);
  T.expect(Math.abs(near.cd.a1 - 1.2) < 0.05 && Math.abs(rb.cd.a1 - 1.2) < 0.05, `in range: ${near.cd.a1.toFixed(2)} / ${rb.cd.a1.toFixed(2)} s left of 6 after 4 s (expected 1.2)`);
  T.expect(Math.abs(far.cd.a1 - 2) < 0.05, `out of range: ${far.cd.a1.toFixed(2)} s left (expected 2)`);
  T.w.kill(null, rb);
  near.cd.a1 = 6; T.run(60);
  T.expect(Math.abs(near.cd.a1 - 5) < 0.05, `uplink kept working after Robot died (${near.cd.a1.toFixed(2)})`);
});

T.test('robot hoverbike: comes in on take-off, peels away on landing, crashes if he dies on it', () => {
  const [rb] = T.stage([{ key: 'robot', player: true, at: [0, 0, 0], face: [0, 1] }]);
  const bike = rb.kit.bike;
  T.expect(bike.ok, 'no hoverbike mesh in the model');
  const base = sceneCount();
  T.run(50, (k) => { T.clr(rb.intents); rb.intents.flyToggle = rb.intents.jump = k === 0; rb.intents.up = k > 2 && k < 30; });
  T.expect(rb.mode === 'fly' && bike.state === 'on' && bike.root.visible && bike.U.uDissolve.value === 0, `not riding the bike (mode ${rb.mode}, bike ${bike.state})`);
  T.run(300, () => { if (rb.mode === 'ground') return false; T.clr(rb.intents); rb.intents.down = true; });
  T.expect(rb.mode === 'ground' && bike.state === 'off' && !bike.root.visible, `bike still out after landing (mode ${rb.mode}, bike ${bike.state})`);
  T.expect(bike.ghosts.length === 1 && bike.ghosts[0].how === 'away', 'the bike did not peel away');
  T.run(90);
  T.expect(bike.ghosts.length === 0 && sceneCount() <= base, `bike left behind (${bike.ghosts.length} ghosts, scene +${sceneCount() - base})`);
  // killed in the air: it falls and blows up
  T.teleport(rb, T.V(0, 10, 0)); rb.mode = 'fly'; rb.grounded = false;
  T.run(30);
  rb.invuln = 0; T.w.kill(null, rb);
  T.run(2);
  T.expect(bike.ghosts.length === 1 && bike.ghosts[0].how === 'crash', `no crash (${bike.ghosts.map((g) => g.how)})`);
  T.run(4 * 60);
  T.expect(bike.ghosts.length === 0, 'the crashed bike was never cleaned up');
  // knocked out of the sky by an EMP: the bike leaves
  T.run(Math.ceil(T.RULES.respawn) * 60);
  T.teleport(rb, T.V(0, 6, 0)); rb.mode = 'fly'; rb.grounded = false;
  T.run(30);
  rb.status.disruptT = 2;
  T.run(3);
  T.expect(rb.mode !== 'fly' && bike.state === 'off', `still on the bike while disrupted (${rb.mode}, ${bike.state})`);
  T.settle([rb], 300);
  T.run(120);
  T.expect(sceneCount() <= base + 1, `scene grew by ${sceneCount() - base}`);
});

T.test('robot: swapping hero mid-flight takes the bike, drones and barrier with him', () => {
  const [rb, foe] = duel('robot', 'omniman', 10);
  const base = sceneCount();
  T.g.fromGame = true;
  cast(rb, foe, 'a1', 40);
  for (const k in rb.cd) rb.cd[k] = 0;
  rb.hp -= 100;
  cast(rb, foe, 'a3', 15);
  T.run(40, (k) => { T.clr(rb.intents); rb.intents.flyToggle = rb.intents.jump = k === 0; rb.intents.up = k > 2; });
  T.expect(rb.kit.bike.riding && rb.kit.drones.length === 3 && T.w.barriers.length === 1, `setup: bike ${rb.kit.bike.state}, ${rb.kit.drones.length} drones, ${T.w.barriers.length} barriers`);
  T.g.changeHero('eve');
  T.run(60);
  T.expect(T.w.barriers.length === 0, 'barrier outlived the swap');
  T.expect(sceneCount() <= base + 1, `scene grew by ${sceneCount() - base} objects`);
});

T.test("eve's beam stops at a robot barrier until it breaks", () => {
  const [eve, rb] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'robot', team: 1, at: [0, 0, 16], face: [0, -1] }]);
  rb.maxHp = rb.hp = BIG;
  cast(rb, eve, 'a1', 30);
  const br = T.w.barriers[0];
  T.expect(!!br, 'no barrier went up');
  if (!br) return;
  eve.ult = eve.def.ultCost;
  const t0 = T.w.time;
  let before = null;
  cast(eve, rb, 'ult', 330, { extra: () => {
    if (eve.kit.ultState && eve.kit.ultState.phase === 'choose') eve.intents.primaryPressed = true;
    if (before === null && !br.alive) before = T.dmgTo(rb, t0);
  } });
  T.expect(before !== null, 'the beam never broke the barrier');
  T.expect(before === 0, `${before && before.toFixed(0)} beam damage went through the barrier`);
  T.expect(T.dmgTo(rb, t0) > 100, `the beam did not reach Robot once the barrier broke (${T.dmgTo(rb, t0).toFixed(0)})`);
});

T.test('rex secondary: the rod sticks to an enemy, RMB sets it off early, and it blows by itself after 3 s', () => {
  let [rx, foe] = duel('rex', 'omniman', 10);
  cast(rx, foe, 'secondary', 40);
  const rod = rx.kit.rods[0];
  T.expect(rod && rod.armed && rod.stuck === foe, `rod not stuck to the target (armed ${rod && rod.armed}, stuck ${rod && rod.stuck && rod.stuck.key})`);
  // it rides along on him
  T.teleport(foe, foe.pos.clone().add(T.V(4, 0, 0)));
  T.run(2);
  T.expect(rod && rod.pos.distanceTo(foe.pos) < 2.5, 'the rod did not move with its target');
  const t0 = T.w.time;
  T.run(1, () => { T.clr(rx.intents); T.aim(rx, T.center(foe)); rx.intents.secondaryPressed = rx.intents.secondary = true; });
  T.expect(rx.kit.rods.length === 0, 'RMB did not detonate the rod');
  const got = T.dmgTo(foe, t0);
  T.expect(got > 125 && got < 145, `stuck detonation dealt ${got.toFixed(0)} (expected 110 + 30)`);
  // a rod on the floor goes off by itself
  [rx, foe] = duel('rex', 'omniman', 10);
  cast(rx, foe, 'secondary', 40, { aimAt: () => T.V(0, 0, 6) });
  T.expect(rx.kit.rods.length === 1 && !rx.kit.rods[0].stuck, 'rod not on the floor');
  T.run(2.6 * 60);
  T.expect(rx.kit.rods.length === 1, 'rod went off early');
  T.run(40);
  T.expect(rx.kit.rods.length === 0, 'rod never went off');
});

T.test("rex passive: his own blasts never hurt him and throw him around (rocket jumps)", () => {
  const [rx, foe] = duel('rex', 'omniman', 30);
  T.run(10);
  const hp0 = rx.hp;
  // a rod at his feet, set off
  cast(rx, foe, 'secondary', 40, { aimAt: () => rx.pos.clone().add(T.V(0, 0, 1.2)) });
  T.expect(rx.kit.rods.length === 1, 'no rod');
  const y0 = rx.pos.y;
  T.run(1, () => { T.clr(rx.intents); rx.intents.secondaryPressed = rx.intents.secondary = true; });
  let top = y0;
  T.run(60, () => { T.clr(rx.intents); top = Math.max(top, rx.pos.y); });
  T.expect(rx.hp === hp0, `Rex took ${(hp0 - rx.hp).toFixed(0)} from his own blast`);
  T.expect(top - y0 > 1.5, `the blast only lifted him ${(top - y0).toFixed(2)} m`);
  T.expect(T.settle([rx], 300) >= 0, 'did not land');
  expectClean('after a rocket jump', [rx]);
});

T.test('rex a1: blast jumps carry him ~17 m, chain in mid-air, and hurt enemies where he left', () => {
  const [rx, foe] = duel('rex', 'omniman', 2.5);
  const p0 = rx.pos.clone(), t0 = T.w.time;
  // aim level along +z with no keys held: straight ahead
  cast(rx, null, 'a1', 1, { aimAt: () => rx.pos.clone().add(T.V(0, 1.5, 20)) });
  let air = 0;
  T.run(150, () => { T.clr(rx.intents); T.aim(rx, rx.pos.clone().add(T.V(0, 1.5, 20))); if (!rx.grounded) air++; return rx.grounded && air > 5 ? false : undefined; });
  const flat = Math.hypot(rx.pos.x - p0.x, rx.pos.z - p0.z);
  T.info(`blast jump carried him ${flat.toFixed(1)} m`);
  T.expect(flat > 14 && flat < 22, `blast jump carried him ${flat.toFixed(1)} m`);
  T.expect(T.dmgTo(foe, t0) > 20, `the take-off blast dealt ${T.dmgTo(foe, t0).toFixed(0)} to the enemy next to him`);
  T.expect(rx.hp === rx.maxHp, 'Rex hurt by his own blast jump');
  // two in a row: the second one goes off in mid-air
  T.run(60);
  for (const k in rx.cd) rx.cd[k] = 0;
  rx.charges.a1 = 2;
  cast(rx, null, 'a1', 20, { aimAt: () => rx.pos.clone().add(T.V(0, 1.5, 20)) });
  const y1 = rx.pos.y;
  cast(rx, null, 'a1', 1, { aimAt: () => rx.pos.clone().add(T.V(0, 1.5, 20)) });
  T.expect(rx.charges.a1 === 0, `charges left ${rx.charges.a1}`);
  let top = y1;
  T.run(40, () => { T.clr(rx.intents); top = Math.max(top, rx.pos.y); });
  T.expect(top > y1 + 2, `the mid-air jump did not lift him (${(top - y1).toFixed(2)} m)`);
  T.expect(T.settle([rx], 300) >= 0, 'did not land');
});

T.test('rex a2: the grenade bounces, launches and slows enemies, and leaves his belt until it is back', () => {
  const [rx, foe] = T.stage([{ key: 'rex', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'invincible', team: 1, at: [0, 0, 11], face: [0, -1] }]);
  foe.maxHp = foe.hp = BIG;
  const bone = rx.kit.grenadeBone;
  T.expect(!!bone && bone.scale.x > 0.5 * rx.kit.grenadeScale.x, 'no grenade on his belt');
  const t0 = T.w.time;
  cast(rx, foe, 'a2', 100, { aimAt: () => foe.pos.clone().add(T.V(0, 0, -2)) });
  T.expect(rx.kit.grenades.length === 0, 'the grenade never went off');
  T.expect(T.dmgTo(foe, t0) > 40, `grenade dealt ${T.dmgTo(foe, t0).toFixed(0)}`);
  T.expect(foe.status.slow > 0.3, `not slowed (${foe.status.slow})`);
  T.expect(bone.scale.x < 0.01, 'the belt grenade is still there while it recharges');
  T.run(Math.ceil(rx.def.abilities.a2.cd * 60) + 30);
  T.expect(bone.scale.x > 0.99 * rx.kit.grenadeScale.x, 'the belt grenade did not come back');
});

T.test('rex ult: SPLODE! charges 2 s (unstoppable), then hits 12 m around him; he survives it', () => {
  let [rx, foe] = duel('rex', 'omniman', 5);
  const far = T.stage.length; void far;
  rx.ult = rx.def.ultCost;
  cast(rx, foe, 'ult', 30);
  T.expect(!!rx.kit.ultState && rx.unstoppable, 'not charging');
  const hp0 = rx.hp, t0 = T.w.time;
  // he can't be knocked about while charging
  const p0 = rx.pos.clone();
  T.w.damage(foe, rx, 1, { knock: T.V(15, 8, 0), noLifesteal: true });
  T.run(5);
  T.expect(rx.pos.distanceTo(p0) < 0.5, `knocked ${rx.pos.distanceTo(p0).toFixed(2)} m while charging`);
  T.run(110);
  T.expect(!rx.kit.ultState && !rx.unstoppable, 'still charging after 2 s');
  const got = T.dmgTo(foe, t0);
  T.expect(got > 200 && got < 380, `SPLODE dealt ${got.toFixed(0)} at 5 m`);
  T.expect(!rx.dead && rx.hp >= hp0 - 1.5, `Rex hurt by his own ult (${(hp0 - rx.hp).toFixed(0)})`);
  T.expect(T.settle([rx], 400) >= 0, 'did not come back down');
  expectClean('after SPLODE', [rx]);
  // killed while charging: it fizzles
  [rx, foe] = duel('rex', 'omniman', 5);
  rx.ult = rx.def.ultCost;
  cast(rx, foe, 'ult', 30);
  rx.invuln = 0;
  T.w.kill(foe, rx);
  const t1 = T.w.time;
  T.run(150);
  T.expect(T.dmgTo(foe, t1) === 0 && !rx.kit.ultState, 'a dead Rex still went off');
});

T.test('battlebeast secondary: bracing blocks 65% from the front only, slows him, and arms a counter', () => {
  const [bb, foe] = duel('battlebeast', 'omniman', 8);
  // (he keeps facing +z whatever the foe does)
  const hold = (n, fn) => T.run(n, (k) => { T.clr(bb.intents); T.aim(bb, bb.pos.clone().add(T.V(0, 1.6, 10))); bb.intents.secondary = true; bb.intents.secondaryPressed = k === 0; fn && fn(k); });
  hold(10);
  T.expect(bb.kit.bracing, 'not bracing');
  const front = T.w.damage(foe, bb, 100, { noLifesteal: true });
  T.expect(Math.abs(front - 35) < 0.6, `100 from the front became ${front.toFixed(1)}`);
  // walking braced is slow
  hold(40, () => { bb.intents.mz = 1; });
  const v = Math.hypot(bb.vel.x, bb.vel.z);
  T.expect(v < bb.def.speed * 0.6, `braced walk at ${v.toFixed(1)} m/s`);
  // from behind it doesn't help
  T.teleport(foe, bb.pos.clone().add(T.V(0, 0, -5)));
  hold(5);
  const back = T.w.damage(foe, bb, 100, { noLifesteal: true });
  T.expect(back > 99, `100 from behind became ${back.toFixed(1)}`);
  T.teleport(foe, bb.pos.clone().add(T.V(0, 0, 3)));
  hold(5);
  T.w.damage(foe, bb, 100, { noLifesteal: true });
  T.expect(bb.kit.counterReady, 'blocking 100 did not arm a counter');
  // let go into a claw: +50%
  T.run(3, () => { T.clr(bb.intents); T.aim(bb, T.center(foe)); });
  T.expect(!bb.kit.bracing && bb.cd.secondary > 0, 'brace did not end on release');
  const t0 = T.w.time;
  cast(bb, foe, 'primary', 18);
  const got = T.dmgTo(foe, t0);
  T.expect(Math.abs(got - 82.5) < 1, `counter claw dealt ${got.toFixed(1)} (expected 55 x 1.5)`);
  // and it lets go by itself after 4 s
  for (const k in bb.cd) bb.cd[k] = 0;
  hold(4.3 * 60);
  T.expect(!bb.kit.bracing, 'braced for more than 4 s');
});

T.test('battlebeast a1: pounce lands where he aims, pins the one he lands on, and catches fliers', () => {
  let [bb, foe] = duel('battlebeast', 'invincible', 18);
  const t0 = T.w.time;
  cast(bb, foe, 'a1', 90, { aimAt: () => foe.pos.clone() });
  T.expect(bb.pos.distanceTo(foe.pos) < 4, `landed ${bb.pos.distanceTo(foe.pos).toFixed(1)} m from the target`);
  T.expect(T.dmgTo(foe, t0) > 70, `pounce dealt ${T.dmgTo(foe, t0).toFixed(0)}`);
  // a flier in the leap's path is caught and slammed down
  [bb, foe] = T.stage([{ key: 'battlebeast', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'eve', team: 1, at: [0, 7, 12], fly: true, face: [0, -1] }]);
  foe.maxHp = foe.hp = BIG;
  const t1 = T.w.time;
  cast(bb, foe, 'a1', 60, { extra: () => { T.clr(foe.intents); foe.intents.up = foe.pos.y < 7; } });
  T.expect(T.dmgTo(foe, t1) >= 89, `swat dealt ${T.dmgTo(foe, t1).toFixed(0)}`);
  T.expect(foe.mode !== 'fly', `the flier is still flying (${foe.mode})`);
  T.expect(T.settle([bb, foe], 600) >= 0, 'did not settle');
  expectClean('after the swat', [bb, foe]);
});

T.test('battlebeast a1: pouncing on a jumping enemy, at a point in the air or onto cover ends in a landing slam', () => {
  const poses = [];
  const watchPose = (bb) => {
    const at = `[${bb.mode}${bb.anim.action ? '/' + bb.anim.action.clip.name : ''}, y ${bb.pos.y.toFixed(2)}, floor ${bb.groundY.toFixed(2)}]`;
    for (const m of T.poseIssues(bb)) poses.push(`${m} ${at}`);
    if (bb.mode === 'ground' && !bb.override && bb.pos.y > bb.groundY + 0.05) poses.push(`standing in mid-air ${at}`);
  };
  // an enemy caught mid-jump: he goes for the floor under them
  let [bb, foe] = duel('battlebeast', 'rex', 14);
  let t0 = T.w.time;
  cast(bb, foe, 'a1', 80, { aimAt: () => foe.pos.clone(), extra: (k) => { watchPose(bb); if (k === 0) { foe.vel.y = 11; foe.grounded = false; foe.mode = 'air'; } } });
  T.expect(bb.grounded && bb.pos.y < 0.01, `ended at y ${bb.pos.y.toFixed(2)} (${bb.mode})`);
  T.expect(T.dmgTo(foe, t0) > 50, `landing on the jumper dealt ${T.dmgTo(foe, t0).toFixed(0)}`);
  // aimed at a point a little above the floor, nobody under the crosshair: the leap ends in the air, he drops and slams
  [bb, foe] = T.stage([{ key: 'battlebeast', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'eve', team: 1, at: [4.5, 0, 15] }]);
  foe.maxHp = foe.hp = BIG;
  t0 = T.w.time;
  let slams = 0;
  cast(bb, null, 'a1', 90, { aimAt: () => T.V(0, 0.9, 15), extra: () => { watchPose(bb); if (bb.anim.action && bb.anim.action.clip === bb.kit.clips.pounceLand) slams++; } });
  T.expect(slams > 0, 'no landing slam after a leap that ended in the air');
  T.expect(T.dmgTo(foe, t0) > 50, `the slam next to her dealt ${T.dmgTo(foe, t0).toFixed(0)}`);
  T.expect(!bb.kit.landing, 'still waiting to land');
  // onto the top of a cover block (tops count as floor)
  const box = T.w.obstacles.find((o) => o.type !== 'cyl' && o.max.y > 1);
  const top = T.V((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  [bb] = T.stage([{ key: 'battlebeast', player: true, at: [top.x - 14, 0, top.z], face: [1, 0] }, { key: 'eve', team: 1, at: [top.x + 20, 0, top.z + 20] }]);
  slams = 0;
  cast(bb, null, 'a1', 90, { aimAt: () => top.clone(), extra: () => { watchPose(bb); if (bb.anim.action && bb.anim.action.clip === bb.kit.clips.pounceLand) slams++; } });
  T.expect(slams > 0, 'no landing slam on top of the cover');
  T.expect(bb.grounded && Math.abs(bb.pos.y - box.max.y) < 0.02, `ended at y ${bb.pos.y.toFixed(2)} (cover top ${box.max.y})`);
  for (const m of [...new Set(poses)].slice(0, 4)) T.fail(m);
  expectClean('after the pounces', [bb]);
});

T.test('battlebeast a2: the roar weakens and slows enemies in 15 m and gives him overhealth', () => {
  const [bb, near, far] = T.stage([{ key: 'battlebeast', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'invincible', team: 1, at: [0, 0, 10] }, { key: 'eve', team: 1, at: [0, 0, 24] }]);
  near.maxHp = near.hp = far.maxHp = far.hp = BIG;
  cast(bb, near, 'a2', 40);
  T.expect(Math.abs(near.status.weak - 0.3) < 0.01 && near.status.slow > 0.25, `weak ${near.status.weak}, slow ${near.status.slow}`);
  T.expect(far.status.weak === 0, 'roar reached 24 m');
  T.expect(bb.overhealth >= 149, `overhealth ${bb.overhealth}`);
  const got = T.w.damage(near, bb, 100, { noLifesteal: true });
  T.expect(Math.abs(got - 70) < 0.6, `a weakened 100 became ${got.toFixed(1)}`);
  T.run(3.2 * 60);
  T.expect(near.status.weak === 0, 'weakness outlived 3 s');
});

T.test('battlebeast a3: hurl throws the enemy ~20 m and the crash hurts', () => {
  const [bb, foe] = duel('battlebeast', 'eve', 2.6);
  const p0 = foe.pos.clone(), t0 = T.w.time;
  cast(bb, foe, 'a3', 60);
  T.expect(!bb.override && !foe.carriedBy, 'still holding them');
  T.expect(bb.kit.thrown.length === 1, 'nobody in flight');
  T.run(150);
  const flat = Math.hypot(foe.pos.x - p0.x, foe.pos.z - p0.z);
  T.info(`thrown ${flat.toFixed(1)} m`);
  T.expect(flat > 12 && flat < 26, `thrown ${flat.toFixed(1)} m`);
  T.expect(Math.abs(T.dmgTo(foe, t0) - 130) < 1, `hurl dealt ${T.dmgTo(foe, t0).toFixed(0)} (60 + 70)`);
  T.expect(T.settle([bb, foe], 600) >= 0, 'did not settle');
  expectClean('after the hurl', [bb, foe]);
});

T.test('battlebeast passive: below half health he goes berserk', () => {
  const [bb, foe] = duel('battlebeast', 'omniman', 6);
  bb.lastHurt = T.w.time;
  T.run(5);
  T.expect(bb.status.boost === 0 && bb.status.dr === 0, 'berserk at full health');
  bb.hp = bb.maxHp * 0.4;
  T.run(5, () => { bb.lastHurt = T.w.time; });
  T.expect(Math.abs(bb.status.boost - 0.25) < 0.01 && Math.abs(bb.status.dr - 0.25) < 0.01, `boost ${bb.status.boost}, dr ${bb.status.dr}`);
  const got = T.w.damage(foe, bb, 100, { noLifesteal: true });
  T.expect(Math.abs(got - 75) < 0.6, `100 became ${got.toFixed(1)} while berserk`);
  bb.hp = bb.maxHp * 0.8;
  T.run(20);
  T.expect(bb.status.boost === 0 && bb.status.dr === 0, 'still berserk after healing up');
});

T.test('battlebeast ult: 8 s berserk, bigger, unstoppable, 40% less damage, faster claws, Pounce every 2 s', () => {
  const [bb, foe] = duel('battlebeast', 'omniman', 6);
  bb.ult = bb.def.ultCost;
  cast(bb, foe, 'ult', 60);
  T.expect(!!bb.kit.ultState && bb.unstoppable, 'not berserk');
  T.expect(bb.visual.scale.x > 1.15, `scale ${bb.visual.scale.x.toFixed(2)}`);
  T.expect(foe.status.weak > 0.15, 'the berserk roar did not weaken the enemy');
  foe.status.weak = 0;
  const got = T.w.damage(foe, bb, 100, { noLifesteal: true });
  T.expect(Math.abs(got - 60) < 0.6, `100 became ${got.toFixed(1)} while berserk`);
  bb.cd.a1 = 8;
  T.run(1);
  T.expect(bb.cd.a1 <= 2, `pounce cooldown ${bb.cd.a1.toFixed(1)} s`);
  T.run(8 * 60);
  T.expect(!bb.kit.ultState && !bb.unstoppable, 'berserk outlived 8 s');
  T.run(60);
  T.expect(Math.abs(bb.visual.scale.x - 1) < 0.01, `scale stuck at ${bb.visual.scale.x.toFixed(2)}`);
});

T.test('rex and battlebeast cannot fly; double-tapping jump just jumps', () => {
  for (const key of ['rex', 'battlebeast']) {
    const [h] = T.stage([{ key, player: true, at: [0, 0, 0] }]);
    T.run(60, (k) => { T.clr(h.intents); h.intents.flyToggle = k === 0 || k === 6; h.intents.jump = k === 0 || k === 6; h.intents.up = true; });
    T.expect(h.mode !== 'fly', `${key} is flying`);
    T.expect(T.settle([h], 300) >= 0 && h.grounded, `${key} did not come back down`);
  }
});

// ---------------------------------------------------------------- edge cases
for (const [key, slot, dist] of [['invincible', 'a3', 3], ['omniman', 'a1', 7]]) {
  T.test(`${key} ${slot}: the carried target dying mid-carry ends the carry cleanly`, () => {
    const [h, foe] = duel(key, 'eve', dist, { foeHp: 300 });
    let grabbed = false;
    cast(h, foe, slot, 60, { extra: () => { if (!grabbed && foe.carriedBy === h) { grabbed = true; T.w.kill(h, foe); } } });
    T.expect(grabbed, 'never carried the target');
    T.expect(T.settle([h], 600) >= 0, 'caster did not settle');
    expectClean('after the target died', [h]);
    T.expect(!foe.carriedBy, 'dead target still marked as carried');
  });
}

const CASTS = { invincible: ['a1', 'a2', 'a3', 'ult'], eve: ['a2', 'secondary', 'ult'], omniman: ['a1', 'secondary', 'ult'], robot: ['secondary', 'a1', 'a2', 'a3', 'ult'], rex: ['secondary', 'a2', 'a3', 'ult'], battlebeast: ['a1', 'a2', 'a3', 'ult'] };
for (const key of Object.keys(CASTS)) {
  for (const slot of CASTS[key]) {
    T.test(`${key} ${slot}: the caster dying mid-ability leaves nothing behind`, () => {
      for (const at of [3, 12, 30, 70]) {
        const [h, foe] = duel(key, 'omniman', slot === 'a3' ? 3 : 8);
        if (slot === 'ult') h.ult = h.def.ultCost;
        const base = sceneCount();
        cast(h, foe, slot, at, { extra: key === 'eve' && slot === 'ult' ? () => { if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true; } : null });
        h.invuln = 0; h.untargetable = false;
        T.w.kill(foe, h);
        const tDeath = T.w.time;
        T.run(5);
        T.run(60, () => { T.clr(foe.intents); });
        const late = T.log.damage.filter((e) => e.src === h && e.t > tDeath && e.type !== 'proj' && e.type !== 'dot').reduce((a, e) => a + e.amount, 0);
        // (projectiles already in flight may still land; abilities the caster performs may not)
        // (an EMP, a rod or a grenade already thrown, or coins in the air, still go off)
        const fired = slot === 'secondary' || (key === 'robot' && slot === 'a2') || (key === 'rex' && (slot === 'a2' || slot === 'a3'));
        T.expect(late === 0 || fired, `${at}f: the dead caster still dealt ${late.toFixed(0)} damage`);
        T.expect(!h.override && !h.carrying && !h.untargetable, `${at}f: caster state left after death (override ${!!h.override})`);
        T.expect(!(h.kit.ultState), `${at}f: ult state left after death`);
        T.expect(T.settle([foe], 600) >= 0, `${at}f: target never recovered (${foe.mode}, carried ${!!foe.carriedBy})`);
        expectClean(`${at}f target`, [foe]);
        T.expect(T.g.renderer.fx.speedLines < 0.01, `${at}f: speed lines left on`);
        T.run(Math.ceil(T.RULES.respawn) * 60 + 40);
        T.expect(!h.dead, `${at}f: caster did not respawn`);
        T.expect(sceneCount() <= base + 1, `${at}f: scene grew by ${sceneCount() - base} objects`);
      }
    });
  }
}

for (const [key, slot, dist] of [['invincible', 'a3', 3], ['omniman', 'a1', 7], ['invincible', 'ult', 10], ['eve', 'ult', 10], ['eve', 'a1', 5], ['robot', 'a1', 8], ['robot', 'a3', 8], ['robot', 'ult', 10], ['rex', 'secondary', 8], ['rex', 'a2', 8], ['rex', 'ult', 6], ['battlebeast', 'a3', 3], ['battlebeast', 'a1', 12], ['battlebeast', 'ult', 6]]) {
  T.test(`${key} ${slot}: swapping hero mid-ability leaves nothing behind`, () => {
    const [h, foe] = duel(key, 'omniman', dist);
    if (slot === 'ult') h.ult = h.def.ultCost;
    const base = sceneCount();
    T.g.fromGame = true;
    cast(h, foe, slot, slot === 'ult' ? 90 : 12, { aimAt: slot === 'a1' && key === 'eve' ? () => T.center(h) : null });
    T.g.changeHero(key === 'invincible' ? 'eve' : 'invincible');
    const nh = T.g.player;
    T.expect(nh !== h && !T.w.heroes.includes(h), 'old hero still in the world');
    T.expect(T.settle([foe, nh], 600) >= 0, `target never recovered (${foe.mode}, carried ${!!foe.carriedBy})`);
    T.run(120);
    expectClean('after the swap', [foe, nh]);
    T.expect(T.g.renderer.fx.speedLines < 0.01, 'speed lines left on');
    T.expect(sceneCount() <= base + 1, `scene grew by ${sceneCount() - base} objects`);
  });
}

T.test('mirror matches: simultaneous charges, slams, dashes and ults resolve', () => {
  const pairs = [
    ['omniman', 'omniman', 'a1', 'a1', 12],
    ['invincible', 'invincible', 'a3', 'a3', 3],
    ['invincible', 'omniman', 'a1', 'a1', 12],
    ['omniman', 'invincible', 'a1', 'a3', 5],
    ['omniman', 'omniman', 'ult', 'ult', 15],
    ['invincible', 'omniman', 'ult', 'ult', 20],
    ['eve', 'omniman', 'ult', 'a1', 10],
    ['robot', 'robot', 'ult', 'ult', 12],
    ['robot', 'eve', 'a1', 'ult', 12],
    ['robot', 'omniman', 'a2', 'a1', 10],
    ['robot', 'invincible', 'ult', 'a3', 4],
    ['battlebeast', 'battlebeast', 'a3', 'a3', 3],
    ['battlebeast', 'omniman', 'a1', 'a1', 14],
    ['battlebeast', 'invincible', 'a3', 'a3', 3],
    ['rex', 'rex', 'ult', 'ult', 5],
    ['rex', 'battlebeast', 'a1', 'a1', 12],
  ];
  for (const [ka, kb, sa, sb, dist] of pairs) {
    const [a, b] = T.stage([{ key: ka, player: true, at: [0, 0, 0], face: [0, 1] }, { key: kb, team: 1, at: [0, 0, dist], face: [0, -1] }]);
    a.maxHp = a.hp = b.maxHp = b.hp = BIG;
    a.ult = a.def.ultCost; b.ult = b.def.ultCost;
    T.run(200, (k) => {
      for (const [h, o, sl] of [[a, b, sa], [b, a, sb]]) {
        T.clr(h.intents); T.aim(h, T.center(o)); h.intents.aimHero = o;
        h.intents[sl] = k === 0;
        if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true;
      }
      if (a.carriedBy === b && b.carriedBy === a) T.fail(`${ka} ${sa} vs ${kb} ${sb}: heroes carrying each other`);
    });
    const f = T.settle([a, b], 900);
    T.expect(f >= 0, `${ka} ${sa} vs ${kb} ${sb}: did not settle`);
    expectClean(`${ka} ${sa} vs ${kb} ${sb}`, [a, b]);
  }
});

T.test('dashes, charges, dives and ults at the arena edge stay inside it', () => {
  const R = T.ARENA.boundR - 6;
  const cases = [['invincible', 'a1'], ['invincible', 'a2'], ['invincible', 'ult'], ['omniman', 'a1'], ['omniman', 'ult'], ['eve', 'secondary'], ['robot', 'a1'], ['robot', 'secondary'], ['rex', 'a1'], ['rex', 'ult'], ['battlebeast', 'a1'], ['battlebeast', 'a3']];
  for (const [key, slot] of cases) {
    const [h, foe] = T.stage([{ key, player: true, at: [R, 0, 0], face: [1, 0] }, { key: 'eve', team: 1, at: [R - 6, 0, 3] }]);
    if (slot === 'ult') h.ult = h.def.ultCost;
    // aim far outside the arena
    cast(h, foe, slot, 300, { aimAt: () => T.V(R + 80, 1, 0) });
    T.expect(T.settle([h, foe], 900) >= 0, `${key} ${slot}: did not settle`);
    expectClean(`${key} ${slot} at the edge`, [h, foe]);
  }
});

T.test('abilities into walls and under the ceiling end cleanly', () => {
  // find a cover box to dash into
  const box = T.w.obstacles.find((o) => o.type === 'box' && o.max.y > 1.2);
  T.expect(!!box, 'no cover box in the arena');
  if (!box) return;
  const c = box.min.clone().add(box.max).multiplyScalar(0.5);
  for (const [key, slot] of [['invincible', 'a1'], ['omniman', 'a1'], ['invincible', 'a2'], ['rex', 'a1'], ['battlebeast', 'a1']]) {
    const [h, foe] = T.stage([{ key, player: true, at: [c.x, 0, c.z - 12], face: [0, 1] }, { key: 'eve', team: 1, at: [c.x + 30, 0, c.z + 30] }]);
    cast(h, foe, slot, 120, { aimAt: () => T.V(c.x, 0.8, c.z) });
    T.expect(T.settle([h], 600) >= 0, `${key} ${slot} into a wall: did not settle`);
    expectClean(`${key} ${slot} into a wall`, [h]);
    const inside = h.pos.x > box.min.x + 0.05 && h.pos.x < box.max.x - 0.05 && h.pos.z > box.min.z + 0.05 && h.pos.z < box.max.z - 0.05 && h.pos.y < box.max.y - 0.3;
    T.expect(!inside, `${key} ${slot}: ended inside the cover box`);
  }
  for (const [key, slot] of [['invincible', 'a3'], ['invincible', 'ult'], ['eve', 'ult'], ['robot', 'ult'], ['robot', 'a1'], ['rex', 'a1'], ['battlebeast', 'a1']]) {
    const top = T.ARENA.ceiling - 4;
    const [h, foe] = T.stage([{ key, player: true, at: [0, top, 0], fly: true, face: [0, 1] }, { key: 'eve', team: 1, at: [0, top, 2.5], fly: true }]);
    h.ult = h.def.ultCost;
    cast(h, foe, slot, 400, { extra: () => { if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true; } });
    T.expect(T.settle([h, foe], 900) >= 0, `${key} ${slot} under the ceiling: did not settle`);
    expectClean(`${key} ${slot} under the ceiling`, [h, foe]);
  }
});

T.test('stunned heroes cannot start abilities', () => {
  for (const key of ['invincible', 'rex', 'eve', 'robot', 'omniman', 'battlebeast']) {
    const [h, foe] = duel(key, 'omniman', 8);
    h.status.stunT = 1;
    const t0 = T.w.time;
    for (const slot of ['a1', 'a2', 'a3', 'secondary']) cast(h, foe, slot, 3);
    T.expect(!h.override && T.dmgBy(h, t0) === 0, `${key} used an ability while stunned`);
    for (const slot of ['a1', 'a2', 'a3']) if (h.def.abilities[slot].cd && !h.def.abilities[slot].charges) T.expect(h.cd[slot] === 0, `${key} ${slot} went on cooldown while stunned`);
  }
});
