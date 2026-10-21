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
    ['primary', 2.4, 110, 100, 260, { hold: true }],
    ['secondary', 8, 40, 35, 80],
    ['a1', 10, 60, 45, 90],
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
      for (let k = 0; k < 360 && T.w.zones.length; k++) T.run(1); // lingering zones (Eve's field) expire
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
  T.expect(Math.abs(h.overhealth - 225) < 30, `overhealth ${h.overhealth}`);
  T.expect(Math.abs(h.status.boost - 0.2) < 0.01 && Math.abs(h.status.dr - 0.3) < 0.01, `boost ${h.status.boost} dr ${h.status.dr}`);
  const got = T.w.damage(foe, h, 100, { noLifesteal: true });
  T.expect(Math.abs(got - 70) < 0.5, `100 damage became ${got.toFixed(1)} under 30% DR`);
  T.run(4.5 * 60);
  T.expect(h.status.boost === 0 && h.status.dr === 0, 'buff outlived its 4 s');
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

const CASTS = { invincible: ['a1', 'a2', 'a3', 'ult'], eve: ['a2', 'secondary', 'ult'], omniman: ['a1', 'secondary', 'ult'] };
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
        const fired = slot === 'secondary';
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

for (const [key, slot, dist] of [['invincible', 'a3', 3], ['omniman', 'a1', 7], ['invincible', 'ult', 10], ['eve', 'ult', 10], ['eve', 'a1', 5]]) {
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
  const cases = [['invincible', 'a1'], ['invincible', 'a2'], ['invincible', 'ult'], ['omniman', 'a1'], ['omniman', 'ult'], ['eve', 'secondary']];
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
  for (const [key, slot] of [['invincible', 'a1'], ['omniman', 'a1'], ['invincible', 'a2']]) {
    const [h, foe] = T.stage([{ key, player: true, at: [c.x, 0, c.z - 12], face: [0, 1] }, { key: 'eve', team: 1, at: [c.x + 30, 0, c.z + 30] }]);
    cast(h, foe, slot, 120, { aimAt: () => T.V(c.x, 0.8, c.z) });
    T.expect(T.settle([h], 600) >= 0, `${key} ${slot} into a wall: did not settle`);
    expectClean(`${key} ${slot} into a wall`, [h]);
    const inside = h.pos.x > box.min.x + 0.05 && h.pos.x < box.max.x - 0.05 && h.pos.z > box.min.z + 0.05 && h.pos.z < box.max.z - 0.05 && h.pos.y < box.max.y - 0.3;
    T.expect(!inside, `${key} ${slot}: ended inside the cover box`);
  }
  for (const [key, slot] of [['invincible', 'a3'], ['invincible', 'ult'], ['eve', 'ult']]) {
    const top = T.ARENA.ceiling - 4;
    const [h, foe] = T.stage([{ key, player: true, at: [0, top, 0], fly: true, face: [0, 1] }, { key: 'eve', team: 1, at: [0, top, 2.5], fly: true }]);
    h.ult = h.def.ultCost;
    cast(h, foe, slot, 400, { extra: () => { if (h.kit.ultState && h.kit.ultState.phase === 'choose') h.intents.primaryPressed = true; } });
    T.expect(T.settle([h, foe], 900) >= 0, `${key} ${slot} under the ceiling: did not settle`);
    expectClean(`${key} ${slot} under the ceiling`, [h, foe]);
  }
});

T.test('stunned heroes cannot start abilities', () => {
  for (const key of ['invincible', 'eve', 'omniman']) {
    const [h, foe] = duel(key, 'omniman', 8);
    h.status.stunT = 1;
    const t0 = T.w.time;
    for (const slot of ['a1', 'a2', 'a3', 'secondary']) cast(h, foe, slot, 3);
    T.expect(!h.override && T.dmgBy(h, t0) === 0, `${key} used an ability while stunned`);
    for (const slot of ['a1', 'a2', 'a3']) if (h.def.abilities[slot].cd && !h.def.abilities[slot].charges) T.expect(h.cd[slot] === 0, `${key} ${slot} went on cooldown while stunned`);
  }
});
