// Game rules: shields, overhealth, damage modifiers, lifesteal, ult charge, respawns, health orbs,
// regeneration, the training toggles, friendly fire and Omni-Man's unstoppable passive.
const pair = (a, b, o = {}) => {
  const hs = T.stage([{ key: a, player: true, at: [0, 0, 0], face: [0, 1] }, { key: b, team: o.sameTeam ? 0 : 1, at: [0, 0, o.dist ?? 6], face: [0, -1] }], { settings: o.settings || {} });
  for (const h of hs) { h.lastHurt = T.w.time; }
  return hs;
};
const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

T.test('bubble: absorbs exactly 225, then breaks and lets damage through; expires after 4 s', () => {
  const [eve, foe] = pair('eve', 'omniman');
  eve.kit.applyBubble(eve);
  const hp0 = eve.hp;
  T.w.damage(foe, eve, 200, { noLifesteal: true });
  T.expect(near(eve.bubble && eve.bubble.amt, 25), `bubble left ${eve.bubble && eve.bubble.amt}`);
  T.expect(eve.hp === hp0, 'damage reached HP through an intact bubble');
  T.w.damage(foe, eve, 60, { noLifesteal: true });
  T.expect(!eve.bubble, 'bubble did not break at 0');
  T.expect(near(hp0 - eve.hp, 35), `overflow took ${(hp0 - eve.hp).toFixed(1)} HP, expected 35`);
  eve.kit.applyBubble(eve);
  T.run(4 * 60 + 5);
  T.expect(!eve.bubble, 'bubble outlived 4 s');
});

T.test('overhealth absorbs before HP and decays once its timer runs out', () => {
  const [omni, foe] = pair('omniman', 'invincible');
  omni.overhealth = 225; omni.ohT = 5;
  const hp0 = omni.hp;
  T.w.damage(foe, omni, 100);
  T.expect(near(omni.overhealth, 125) && omni.hp === hp0, `overhealth ${omni.overhealth}, hp lost ${hp0 - omni.hp}`);
  T.run(4.8 * 60);
  T.expect(near(omni.overhealth, 125, 1), `overhealth decayed early (${omni.overhealth.toFixed(1)})`);
  T.run(3 * 60);
  T.expect(omni.overhealth === 0, `overhealth did not decay (${omni.overhealth.toFixed(1)})`);
});

T.test('damage modifiers stack: vulnerability, damage boost, damage reduction, spawn protection', () => {
  const [a, b] = pair('invincible', 'omniman');
  b.status.vuln = 0.25; b.status.vulnT = 5;
  T.expect(near(T.w.damage(a, b, 100, { noLifesteal: true }), 125, 0.01), 'vuln +25%');
  a.status.boost = 0.2; a.status.boostT = 5;
  T.expect(near(T.w.damage(a, b, 100), 150, 0.01), 'boost x vuln = 1.2 x 1.25');
  b.status.dr = 0.3; b.status.drT = 5;
  T.expect(near(T.w.damage(a, b, 100), 105, 0.01), 'boost x vuln x (1 - dr)');
  b.status.vuln = b.status.dr = 0; a.status.boost = 0;
  b.spawnProtect = 1;
  T.expect(near(T.w.damage(a, b, 100), 30, 0.01), 'spawn protection takes 70% off');
  b.spawnProtect = 0; b.invuln = 0.5;
  T.expect(T.w.damage(a, b, 100) === 0, 'invulnerable hero took damage');
  b.invuln = 0; b.untargetable = true;
  T.expect(T.w.damage(a, b, 100) === 0, 'untargetable hero took damage');
});

T.test('no friendly fire; the dead take no damage or healing', () => {
  const [a, b] = pair('omniman', 'eve', { sameTeam: true });
  const hp = b.hp;
  T.expect(T.w.damage(a, b, 100) === 0 && b.hp === hp, 'teammate took damage');
  T.w.kill(null, b);
  T.expect(T.w.damage(a, b, 50) === 0 && T.w.heal(a, b, 50) === 0, 'dead hero was damaged or healed');
});

T.test('omni-man heals for 25% of damage dealt', () => {
  const [omni, foe] = pair('omniman', 'invincible');
  omni.hp = omni.maxHp - 200;
  const hp0 = omni.hp;
  const dealt = T.w.damage(omni, foe, 100);
  T.expect(near(omni.hp - hp0, dealt * 0.25, 0.01), `healed ${(omni.hp - hp0).toFixed(2)} for ${dealt} dealt`);
});

T.test('ult charge: damage, healing, shields, kills and time; capped; ults do not refill themselves', () => {
  const [eve, foe, ally] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0] }, { key: 'omniman', team: 1, at: [0, 0, 6] }, { key: 'invincible', team: 0, at: [4, 0, 0] }]);
  const R = T.RULES;
  eve.ult = 0;
  T.w.damage(eve, foe, 100);
  T.expect(near(eve.ult, 100 * R.ultPerDamage, 0.01), `damage charge ${eve.ult}`);
  eve.ult = 0; ally.hp = ally.maxHp - 100;
  T.w.heal(eve, ally, 60);
  T.expect(near(eve.ult, 60 * R.ultPerHeal, 0.01), `heal charge ${eve.ult}`);
  eve.ult = 0; eve.kit.applyBubble(ally);
  T.w.damage(foe, ally, 100, { noLifesteal: true });
  T.expect(near(eve.ult, 100 * R.ultPerShield, 0.01), `shield charge ${eve.ult}`);
  eve.ult = 0; T.w.damage(eve, foe, 100, { type: 'ult' });
  T.expect(eve.ult === 0, `ult damage charged the ult (${eve.ult})`);
  eve.ult = 0; foe.hp = 1; T.w.damage(eve, foe, 10);
  T.expect(near(eve.ult, R.killUlt + 1, 0.01), `kill charge ${eve.ult}`);
  eve.ult = 0; T.run(600);
  T.expect(near(eve.ult, R.ultPassive * 10, 1), `passive charge over 10 s: ${eve.ult.toFixed(1)}`);
  eve.ult = eve.def.ultCost - 5; ally.hp = ally.maxHp - 100;
  T.w.heal(eve, ally, 999);
  T.expect(eve.ult <= eve.def.ultCost, `heal charge broke the cap (${eve.ult})`);
  eve.ult = eve.def.ultCost - 5; eve.kit.applyBubble(ally); T.w.damage(foe, ally, 200, { noLifesteal: true });
  T.expect(eve.ult <= eve.def.ultCost, `shield charge broke the cap (${eve.ult})`);
});

T.test('killed heroes respawn at their team spawn after the respawn time', () => {
  const [a, b] = pair('invincible', 'omniman');
  T.w.kill(b, a);
  const score = T.w.score[1];
  T.expect(score === 1, `kill did not score (${T.w.score})`);
  T.run(Math.floor(T.RULES.respawn * 60) - 10);
  T.expect(a.dead, 'respawned early');
  T.run(20);
  T.expect(!a.dead && a.hp === a.maxHp, 'did not respawn on time at full health');
  const sp = T.ARENA.spawns[a.team];
  T.expect(Math.hypot(a.pos.x - sp.x, a.pos.z - sp.z) < 6, `respawned ${Math.hypot(a.pos.x - sp.x, a.pos.z - sp.z).toFixed(1)} m from the team spawn`);
  T.expect(a.spawnProtect > 0 && a.invuln > 0, 'no spawn protection after respawning');
});

T.test('health orbs heal 150, ignore full-health heroes and come back after 15 s', () => {
  const [h] = T.stage([{ key: 'omniman', player: true, at: [0, 0, 0] }]);
  const orb = T.w.orbs[0];
  T.teleport(h, T.V(orb.pos.x, 0, orb.pos.z));
  T.run(10);
  T.expect(orb.active, 'orb used by a full-health hero');
  h.hp = h.maxHp - 300; h.lastHurt = T.w.time;
  T.run(2, () => { h.lastHurt = T.w.time; });
  T.expect(!orb.active, 'orb not picked up');
  T.expect(near(h.hp, h.maxHp - 150, 1), `orb healed ${(h.hp - (h.maxHp - 300)).toFixed(0)}`);
  T.run(T.RULES.orbRespawn * 60 + 10, () => { h.lastHurt = T.w.time; T.teleport(h, T.V(0, 0, 0)); });
  T.expect(orb.active, 'orb did not come back');
});

T.test('passive regeneration starts after the delay at the listed rate', () => {
  for (const key of ['invincible', 'eve', 'omniman']) {
    const [h] = T.stage([{ key, player: true, at: [0, 0, 0] }]);
    const rg = h.def.regen;
    h.hp = h.maxHp - 200; h.lastHurt = T.w.time;
    T.run(Math.floor(rg.delay * 60) - 5);
    T.expect(h.hp === h.maxHp - 200, `${key} regenerated before ${rg.delay} s`);
    T.run(65);
    const got = h.hp - (h.maxHp - 200);
    T.expect(got > rg.rate * 0.8 && got < rg.rate * 1.25, `${key} regenerated ${got.toFixed(1)} in ~1 s (rate ${rg.rate})`);
  }
});

T.test('training toggles: god mode, no cooldowns, fast ult', () => {
  let [p, foe] = pair('eve', 'omniman', { settings: { godMode: true } });
  T.w.damage(foe, p, 5000);
  T.expect(!p.dead && p.hp >= 1, 'god mode player died');
  [p, foe] = pair('invincible', 'omniman', { settings: { noCooldowns: true } });
  T.run(1, () => { T.clr(p.intents); T.aim(p, T.center(foe)); p.intents.a1 = true; });
  T.expect(p.cd.a1 <= p.def.abilities.a1.cd * 0.021, `no-cooldowns a1 cd ${p.cd.a1}`);
  [p, foe] = pair('omniman', 'eve', { settings: { fastUlt: true } });
  p.ult = 0; T.run(120);
  T.expect(p.ult > T.RULES.ultPassive * 2 * 30, `fast ult charged only ${p.ult.toFixed(0)} in 2 s`);
});

T.test("omni-man is unstoppable: no knockback, no slows, stuns halved", () => {
  const [omni, foe] = pair('omniman', 'invincible');
  T.run(10);
  const p0 = omni.pos.clone();
  T.w.damage(foe, omni, 10, { knock: T.V(20, 8, 0), slow: 0.5, slowT: 2, stun: 1, noLifesteal: true });
  T.run(10);
  T.expect(omni.pos.distanceTo(p0) < 0.3, `knocked ${omni.pos.distanceTo(p0).toFixed(2)} m`);
  T.expect(omni.status.slow === 0, 'slowed');
  T.expect(omni.status.stunT <= 0.5 && omni.status.stunT > 0.2, `stun ${omni.status.stunT.toFixed(2)} s (expected half of 1 s)`);
  const [inv, foe2] = pair('invincible', 'omniman');
  T.run(10);
  const q0 = inv.pos.clone();
  T.w.damage(foe2, inv, 10, { knock: T.V(20, 8, 0), noLifesteal: true });
  T.run(10);
  T.expect(inv.pos.distanceTo(q0) > 1, 'regular heroes are knocked back');
});

T.test("eve's bolts mend allies near the impact, not Eve herself", () => {
  const [eve, foe, ally] = T.stage([{ key: 'eve', player: true, at: [0, 0, 0], face: [0, 1] }, { key: 'omniman', team: 1, at: [0, 0, 3] }, { key: 'invincible', team: 0, at: [1.5, 0, 3] }]);
  foe.maxHp = foe.hp = 5000;
  eve.hp = eve.maxHp - 100; ally.hp = ally.maxHp - 100;
  const e0 = eve.hp, a0 = ally.hp;
  T.run(60, () => { T.clr(eve.intents); T.aim(eve, T.center(foe)); eve.intents.primary = true; eve.lastHurt = ally.lastHurt = T.w.time; });
  T.expect(ally.hp > a0, 'ally next to the target was not mended');
  T.expect(ally.hp - a0 < 60, `ally mended ${(ally.hp - a0).toFixed(0)} in 1 s (should be weak)`);
  T.expect(eve.hp === e0, `Eve healed herself ${(eve.hp - e0).toFixed(0)}`);
});
