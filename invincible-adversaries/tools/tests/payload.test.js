// Payload in destroyed Chicago: the mode's rules (setup, pushing, contesting, rollback, checkpoints,
// overtime, delivery, spawn rooms, riders), the map's sanity (spawns and the route reachable on foot,
// the route clear for the cart), movement abilities thrown at the buildings, the 6v6 lineups, and a
// whole 6v6 bot match on hard with the camera following the player through the city.
// (the runner injects test files as plain scripts: modules load inside the tests)
let M = null;
async function mods() {
  if (M) return M;
  const u = (p) => new URL(p, location.href).href;
  M = {};
  for (const f of ['src/world/city/layout.js', 'src/world/city/route.js', 'src/world/arena.js', 'src/modes/payload.js', 'src/game.js', 'src/heroes/data.js']) Object.assign(M, await import(u(f)));
  return M;
}

/** a payload match against idle bots (or active ones), the player's controller switched off */
async function payload({ key = 'invincible', side = 'attack', bots = 'idle', difficulty = 'normal' } = {}) {
  await mods();
  const g = T.g;
  g.modeKey = 'payload'; g.side = side;
  T.resetFx();
  await g.startPayload(key);
  g.script = () => {}; g.camOverride = null;
  Object.assign(T.w.settings, { bots, noCooldowns: false, fastUlt: false, godMode: false, difficulty, comic: true });
  for (const k in T.log) T.log[k].length = 0;
  return g.mode;
}
/** everyone but keep out of the picture: dead, and not coming back */
function only(m, keep) {
  T.w.respawnTime = [1e9, 1e9];
  for (const h of T.w.heroes) if (!keep.includes(h)) { h.invuln = 0; h.spawnProtect = 0; T.w.kill(null, h); }
}
/** a spot beside the cart, `side` metres off its flank (on the floor there: under the L, not on it) */
function besideCart(m, side = 3.6) {
  const x = m.pos.x + Math.cos(m.yaw) * side, z = m.pos.z - Math.sin(m.yaw) * side;
  return T.V(x, T.w.floorAt(x, z, m.pos.y + 1), z);
}
const att = (m) => T.w.heroes.filter((h) => h.team === m.att);
const dfn = (m) => T.w.heroes.filter((h) => h.team === m.dfn);
const live = (m) => { m.clock = 0.01; T.run(3); };
const boxesNear = (x, z) => T.w.obstaclesNear(x, z, 0, []).filter((o) => o.type === 'box');
const insideBox = (p, pad = 0.05, up = 1) => boxesNear(p.x, p.z).find((o) => p.x > o.min.x + pad && p.x < o.max.x - pad && p.z > o.min.z + pad && p.z < o.max.z - pad && p.y < o.max.y - 0.2 && p.y + up > o.min.y);

T.test('payload: setup holds the attackers in their room behind a solid door, then it opens', async () => {
  const m = await payload(), { PAYLOAD } = M;
  T.expect(m.state === 'setup' && Math.abs(m.clock - PAYLOAD.setup) < 0.5, `state ${m.state}, clock ${m.clock.toFixed(1)}`);
  const room = m.rooms()[m.att].room, a = att(m)[0];
  T.teleport(a, T.V(room[0] - 15, 0, room[1] - 15));
  T.run(2);
  T.expect(a.pos.x >= room[0] && a.pos.x <= room[2] && a.pos.z >= room[1] && a.pos.z <= room[3], `attacker got out during setup (${a.pos.x.toFixed(1)}, ${a.pos.z.toFixed(1)})`);
  T.expect(T.w.dynamic.length > m.cart.boxes.length, 'no door collider during setup');
  // defenders are free to set up anywhere
  const d = dfn(m)[0], p = besideCart(m, 12);
  T.teleport(d, p); T.run(2);
  T.expect(d.pos.distanceTo(p) < 1, 'defender held during setup');
  T.run(Math.ceil(PAYLOAD.setup * 60));
  T.expect(m.state === 'live' && T.w.dynamic.length === m.cart.boxes.length, `after setup: ${m.state}, ${T.w.dynamic.length} dynamic boxes`);
});

T.test('payload: the cart moves with attackers on it, faster with more, stops when contested, rolls back when left', async () => {
  const m = await payload(), { PAYLOAD } = M;
  live(m);
  const A = att(m).slice(0, 3), D = dfn(m)[0];
  only(m, [...A, D]);
  T.teleport(D, besideCart(m, 40));
  const push = (n, sec) => {
    const s0 = m.s;
    T.run(Math.round(sec * 60), () => { A.forEach((h, i) => { T.teleport(h, i < n ? besideCart(m, i % 2 ? -3.6 : 3.6) : besideCart(m, 40 + i * 3)); h.vel.set(0, 0, 0); }); });
    return (m.s - s0) / sec;
  };
  for (let n = 1; n <= 3; n++) {
    const v = push(n, 1);
    T.expect(Math.abs(v - PAYLOAD.speeds[n]) < 0.15, `${n} pushing: ${v.toFixed(2)} m/s, expected ${PAYLOAD.speeds[n]}`);
  }
  // a defender on it stops it
  const s0 = m.s;
  T.run(60, () => { T.teleport(A[0], besideCart(m, 3.6)); T.teleport(D, besideCart(m, -3.6)); });
  T.expect(Math.abs(m.s - s0) < 0.01 && m.att_n > 0 && m.def_n > 0, `contested cart moved ${(m.s - s0).toFixed(2)} m`);
  // left alone it waits, then rolls back
  for (const h of [...A, D]) T.teleport(h, besideCart(m, 40));
  const s1 = m.s;
  T.run(Math.round((PAYLOAD.rollbackDelay - 1) * 60));
  T.expect(Math.abs(m.s - s1) < 0.01, 'rolled back before the delay');
  T.run(Math.round(3 * 60));
  const back = s1 - m.s;
  T.expect(back > PAYLOAD.rollback * 1.5 && back < PAYLOAD.rollback * 2.2, `rolled back ${back.toFixed(2)} m in ~2 s`);
  T.run(60 * 20);
  T.expect(m.s >= m.floorS - 1e-6, 'rolled back past the start');
});

T.test('payload: a checkpoint adds time, moves both spawns up, and the cart never rolls back past it', async () => {
  const m = await payload(), { PAYLOAD, SPAWNS } = M;
  live(m);
  const A = att(m)[0];
  only(m, [A]);
  const cp = m.path.cps[0];
  m.s = cp - 1; m.placeCart(m.s);
  const t0 = m.timeLeft;
  T.run(60, () => { T.teleport(A, besideCart(m)); });
  T.expect(m.phase === 1 && m.floorS === cp, `phase ${m.phase}, floor ${m.floorS}`);
  T.expect(Math.abs(m.timeLeft - (t0 + PAYLOAD.time[1] - 1)) < 0.6, `clock ${t0.toFixed(1)} -> ${m.timeLeft.toFixed(1)}`);
  const sp = T.ARENA.spawns[m.att];
  T.expect(Math.hypot(sp.x - SPAWNS.attack[1].at[0], sp.z - SPAWNS.attack[1].at[1]) < 0.1, 'attackers still spawn at the start');
  T.teleport(A, besideCart(m, 50));
  T.run(60 * (PAYLOAD.rollbackDelay + 8));
  T.expect(m.s >= cp - 1e-6, `rolled back to ${m.s.toFixed(1)} past the checkpoint at ${cp.toFixed(1)}`);
});

T.test('payload: overtime holds while an attacker touches the cart and ends 3 s after the last one leaves', async () => {
  const m = await payload(), { PAYLOAD } = M;
  live(m);
  const A = att(m)[0];
  only(m, [A]);
  m.timeLeft = 0.3;
  T.run(40, () => { T.teleport(A, besideCart(m)); });
  T.expect(m.state === 'overtime' && !m.result, `state ${m.state}`);
  T.run(60 * 5, () => { T.teleport(A, besideCart(m)); });
  T.expect(m.state === 'overtime', 'overtime ended with an attacker still on the cart');
  T.teleport(A, besideCart(m, 50));
  T.run(Math.round((PAYLOAD.overtimeGrace - 0.5) * 60));
  T.expect(!m.result, 'ended before the grace ran out');
  T.run(60);
  T.expect(m.result && m.result.winner === m.dfn && m.result.why === 'time', `result ${JSON.stringify(m.result)}`);
  T.expect(T.g.ended, 'the game did not end the match');
});

T.test('payload: delivering the cart to the final point wins it for the attackers', async () => {
  const m = await payload({ side: 'defend' });
  live(m);
  const A = att(m)[0];
  only(m, [A]);
  m.phase = 2; m.floorS = m.path.cps[1]; m.s = m.path.len - 0.6; m.placeCart(m.s);
  T.run(40, () => { T.teleport(A, besideCart(m)); });
  T.expect(m.result && m.result.winner === m.att && m.result.why === 'delivered', `result ${JSON.stringify(m.result)}`);
  T.expect(T.g.ended && T.g.player.team !== m.att, 'not ended, or the player was not defending');
});

T.test('payload: spawn rooms burn enemies and heal their own team', async () => {
  const m = await payload(), { PAYLOAD } = M;
  live(m);
  const A = att(m)[0], D = dfn(m)[0];
  only(m, [A, D]);
  const [ra, rd] = m.rooms();
  const mid = (r) => { const x = (r.room[0] + r.room[2]) / 2, z = (r.room[1] + r.room[3]) / 2; return T.V(x, T.w.groundAt(x, z), z); };
  A.maxHp = A.hp = 5000;
  D.hp = D.maxHp * 0.3;
  const t0 = T.w.time, hp0 = D.hp;
  T.run(60, () => { T.teleport(A, mid(rd)); T.teleport(D, mid(rd)); });
  T.expect(Math.abs(T.dmgTo(A, t0) - PAYLOAD.spawnDamage) < 15, `attacker in the defenders' room took ${T.dmgTo(A, t0).toFixed(0)} in 1 s`);
  T.expect(D.hp - hp0 > PAYLOAD.spawnHeal * 0.8, `defender in their room healed ${(D.hp - hp0).toFixed(0)} in 1 s`);
  void ra;
});

T.test('payload: heroes standing on the cart ride along with it', async () => {
  const m = await payload();
  live(m);
  const [A, R] = att(m);
  only(m, [A, R]);
  const top = Math.max(...m.cart.boxes.map((b) => b.max.y));
  const b = m.cart.boxes.find((x) => x.max.y === top);
  T.teleport(R, T.V((b.min.x + b.max.x) / 2, top, (b.min.z + b.max.z) / 2)); R.vel.set(0, 0, 0);
  T.run(10);
  const rel0 = R.pos.clone().sub(m.pos);
  T.run(180, () => { T.teleport(A, besideCart(m)); });
  const rel = R.pos.clone().sub(m.pos);
  T.expect(m.s > 5, `cart only moved ${m.s.toFixed(1)} m`);
  T.expect(rel.distanceTo(rel0) < 1.5 && R.pos.y > top - 0.5, `rider left behind (moved ${rel.distanceTo(rel0).toFixed(1)} m against the cart, y ${R.pos.y.toFixed(1)})`);
});

// ---------------------------------------------------------------- the map
T.test('chicago: every spawn reaches every checkpoint on foot, and the route is clear for the cart', async () => {
  const m = await payload(), { SPAWNS, pathAt, terrainY } = M;
  const nav = T.w.nav, w = T.w;
  const goals = [0, ...m.path.cps].map((s) => { const p = pathAt(m.path, s); return T.V(p.x, terrainY(p.x, p.z), p.z); });
  for (const side of ['attack', 'defend']) for (const [i, sp] of SPAWNS[side].entries()) {
    const a = T.V(sp.at[0], terrainY(sp.at[0], sp.at[1]), sp.at[1]);
    T.expect(!w.blocked(a, 0.5), `${side} spawn ${i} is inside something`);
    for (const [k, b] of goals.entries()) {
      const path = nav.find(a, b);
      const end = path && path[path.length - 1];
      T.expect(path && end.distanceTo(b) < 4, `${side} spawn ${i} has no way on foot to route point ${k}${end ? ` (ends ${end.distanceTo(b).toFixed(0)} m short)` : ''}`);
    }
  }
  // the cart's way: open for its width (moving things aside), no cliffs under it
  const dyn = w.dynamic; w.dynamic = [];
  let blocked = 0, steep = 0, prevY = null;
  for (let s = 0; s <= m.path.len; s += 1.5) {
    const p = pathAt(m.path, s), y = terrainY(p.x, p.z);
    if (w.blocked(T.V(p.x, y, p.z), 1.3)) { if (blocked++ < 3) T.fail(`route blocked at s ${s.toFixed(0)} (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`); }
    if (prevY != null && Math.abs(y - prevY) / 1.5 > 0.45) { if (steep++ < 3) T.fail(`route too steep at s ${s.toFixed(0)}: ${(Math.abs(y - prevY) / 1.5).toFixed(2)}`); }
    prevY = y;
  }
  w.dynamic = dyn;
  T.info(`route ${m.path.len.toFixed(0)} m, checkpoints at ${m.path.cps.map((c) => c.toFixed(0)).join(', ')}`);
});

T.test('chicago: dashes, charges, dives and pounces thrown at the buildings never end inside one or out of bounds', async () => {
  await payload();
  const { HEROES, terrainY } = M;
  const nav = T.w.nav, A = T.ARENA, w = T.w;
  const moves = [['invincible', 'a1'], ['invincible', 'a2'], ['omniman', 'a1'], ['battlebeast', 'a1'], ['allen', 'a1'], ['immortal', 'a1'], ['immortal', 'a3'], ['rex', 'a1']];
  let n = 0;
  for (const [key, slot] of moves) for (let trial = 0; trial < 6; trial++) {
    // a random open spot, sometimes up in the air, aimed at a random point (often a wall)
    let x, z;
    for (let k = 0; k < 50; k++) { x = A.rect.minX + Math.random() * (A.rect.maxX - A.rect.minX); z = A.rect.minZ + Math.random() * (A.rect.maxZ - A.rect.minZ); const [i, c] = nav.cell(x, z); if (nav.isOpen(i, c)) break; }
    // (up in the air: somewhere free, not in the floors over a spawn room or a lobby)
    let air = HEROES[key].flight && Math.random() < 0.5, y = 0;
    if (air) { y = terrainY(x, z) + 6 + Math.random() * 30; if (w.blocked(T.V(x, y, z), 0.8)) air = false, y = 0; }
    const [h] = T.stage([{ key, player: true, at: [x, y, z], fly: air }]);
    const yaw = Math.random() * Math.PI * 2, far = 20 + Math.random() * 40;
    const target = T.V(x + Math.sin(yaw) * far, terrainY(x, z) + Math.random() * 25, z + Math.cos(yaw) * far);
    T.run(120, (k) => { T.clr(h.intents); T.aim(h, target); h.intents[slot] = k === 0; });
    T.settle([h], 600);
    T.run(30);
    const bad = insideBox(h.pos);
    const out = h.pos.x < A.rect.minX - 0.5 || h.pos.x > A.rect.maxX + 0.5 || h.pos.z < A.rect.minZ - 0.5 || h.pos.z > A.rect.maxZ + 0.5;
    if (bad || out || h.pos.y > A.ceiling + 0.1) T.fail(`${key} ${slot} from (${x.toFixed(0)}, ${z.toFixed(0)}) ended at (${h.pos.x.toFixed(1)}, ${h.pos.y.toFixed(1)}, ${h.pos.z.toFixed(1)})${bad ? ' inside a building' : ''}${out ? ' out of bounds' : ''}`);
    // (the arena's checks, minus its round bounds; and in the city "ground" is the floor under you,
    // not the L's deck over your head)
    for (const msg of T.cleanIssues(h)) if (!/outside the arena|below the ground/.test(msg)) T.fail(`${key} ${slot}: ${msg}`);
    if (h.pos.y < w.floorAt(h.pos.x, h.pos.z, h.pos.y + 0.3) - 0.15) T.fail(`${key} ${slot}: sunk into the floor at (${h.pos.x.toFixed(1)}, ${h.pos.y.toFixed(2)}, ${h.pos.z.toFixed(1)})`);
    n++;
  }
  T.info(`${n} casts`);
});

T.test('chicago: spawns spread across every spawn room, and the health orbs stand clear on the floor', async () => {
  // (spawn rooms are carved into buildings, and an orb's spot can be under the L or a roof: the
  // floor there is what counts, not the top of what's over it)
  const m = await payload();
  const w = T.w, A = T.ARENA, UP = T.V(0, 1, 0);
  for (let p = 0; p < 3; p++) {
    m.phase = p; m.applySpawns();
    for (const team of [0, 1]) {
      const c = A.spawns[team], pts = Array.from({ length: 30 }, () => w.spawnPoint(team));
      const tag = `phase ${p} team ${team} (${c.x}, ${c.z})`;
      T.expect(pts.filter((q) => q.distanceTo(c) < 1e-6).length < 4, `${tag}: spawns keep falling back to the room's centre`);
      const bad = pts.find((q) => w.blocked(q) || Math.abs(q.y - c.y) > 0.05);
      if (bad) T.fail(`${tag}: a spawn at (${bad.x.toFixed(1)}, ${bad.y.toFixed(2)}, ${bad.z.toFixed(1)})`);
      // (and a hero put there stays there: nothing nudges them into the room's walls or columns)
      const hh = w.heroes.find((x) => x.team === team);
      for (let k = 0; k < 20; k++) { hh.spawnAt(w.spawnPoint(team)); if (w.blocked(hh.pos)) { T.fail(`${tag}: a hero spawned into something at (${hh.pos.x.toFixed(1)}, ${hh.pos.z.toFixed(1)})`); break; } }
    }
  }
  m.phase = 0; m.applySpawns();
  for (const o of w.orbs) {
    const b = T.V(o.pos.x, o.y0 - 1.2, o.pos.z), tag = `orb at (${o.pos.x}, ${o.pos.z})`;
    T.expect(!w.blocked(b, 1.2), `${tag}: its base runs into something`);
    for (const [dx, dz] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) T.expect(Math.abs(w.floorAt(b.x + dx, b.z + dz, b.y) - b.y) < 0.3, `${tag}: its base overhangs an edge`);
    T.expect(!w.rayWorld(o.pos, UP, 1.5), `${tag}: no headroom over it`);
  }
});

T.test('chicago: under a roof, abilities go by the floor under the hero, not the roof over them', async () => {
  await payload();
  const w = T.w;
  // open floor under a slab 26 m up
  const S = T.V(-46, 0, 45), roof = w.groundAt(S.x, S.z);
  T.expect(roof > 20 && Math.abs(w.floorAt(S.x, S.z, 1)) < 0.05, `no roof over (${S.x}, ${S.z}): top ${roof.toFixed(1)}`);
  const at = (h) => `(${h.pos.x.toFixed(1)}, ${h.pos.y.toFixed(1)}, ${h.pos.z.toFixed(1)})`;
  // (staging stands everyone on the highest surface, the roof: bring them down to the floor)
  const stage = (spec) => {
    const hs = T.stage(spec);
    for (const h of hs) { T.teleport(h, T.V(h.pos.x, w.floorAt(h.pos.x, h.pos.z, 0.3), h.pos.z)); h.mode = 'ground'; h.grounded = true; h.vel.set(0, 0, 0); }
    T.run(2);
    return hs;
  };
  const clean = (h, what) => { if (w.inside(T.center(h)) || h.pos.y > 10) T.fail(`${what}: ${h.key} ended at ${at(h)}`); };
  // Eve's ult hovers a few metres over the floor
  {
    const [eve, foe] = stage([{ key: 'eve', player: true, at: S.toArray(), face: [0, 1] }, { key: 'rex', team: 1, at: [S.x, 0, S.z + 7] }]);
    eve.ult = eve.def.ultCost;
    let top = 0;
    T.run(300, (k) => {
      T.clr(eve.intents); T.aim(eve, T.center(foe)); eve.intents.ult = k === 0;
      if (eve.kit.ultState && eve.kit.ultState.phase === 'choose') eve.intents.primaryPressed = true;
      top = Math.max(top, eve.pos.y);
    });
    T.expect(top > 2 && top < 6, `Eve's ult hovered at ${top.toFixed(1)} m (the roof's top is at ${roof.toFixed(1)})`);
    clean(eve, 'Eve\'s ult');
  }
  // ...and her Reconstruction brings a fallen ally back where they fell, on the floor
  {
    const [eve, ally] = stage([{ key: 'eve', player: true, at: S.toArray() }, { key: 'rex', at: [S.x + 3, 0, S.z] }, { key: 'omniman', team: 1, at: [S.x + 60, 0, S.z] }]);
    w.respawnTime = [1e9, 1e9];
    ally.invuln = 0; ally.spawnProtect = 0; w.kill(null, ally);
    eve.ult = eve.def.ultCost;
    T.run(240, (k) => {
      T.clr(eve.intents); T.aim(eve, T.V(S.x, 1, S.z + 10)); eve.intents.ult = k === 0;
      if (eve.kit.ultState && eve.kit.ultState.phase === 'choose') eve.intents.secondaryPressed = true;
    });
    T.expect(!ally.dead && ally.pos.y < 1, `the revived ally is ${ally.dead ? 'still dead' : 'at ' + at(ally)}`);
  }
  // Robot's barrier stands on the floor
  {
    const [rb] = stage([{ key: 'robot', player: true, at: S.toArray(), face: [0, 1] }, { key: 'rex', team: 1, at: [S.x + 60, 0, S.z] }]);
    T.run(40, (k) => { T.clr(rb.intents); T.aim(rb, T.V(S.x, 1.5, S.z + 10)); rb.intents.a1 = k === 0; });
    const b = w.barriers[w.barriers.length - 1];
    T.expect(!!b && b.c.y < 4, `Robot's barrier went up at ${b ? b.c.y.toFixed(1) : '-'} m`);
  }
  // Battle Beast pounces on a foe standing in there; Invincible's Meteor Dive lands on the floor
  {
    const [bb, foe] = stage([{ key: 'battlebeast', player: true, at: S.toArray(), face: [0, 1] }, { key: 'rex', team: 1, at: [S.x, 0, S.z + 7] }]);
    foe.maxHp = foe.hp = 5000;
    T.run(90, (k) => { T.clr(bb.intents); T.aim(bb, T.center(foe)); bb.intents.aimHero = foe; bb.intents.a1 = k === 0; });
    T.settle([bb], 300);
    T.expect(bb.pos.y < 1.5 && bb.pos.distanceTo(foe.pos) < 5, `Battle Beast's pounce ended at ${at(bb)}, the foe at ${at(foe)}`);
    clean(bb, 'Battle Beast\'s pounce');
  }
  // Mach Breaker needs open sky: under the roof it is refused, and the ult is kept
  {
    const [inv, foe] = stage([{ key: 'invincible', player: true, at: S.toArray(), face: [0, 1] }, { key: 'rex', team: 1, at: [S.x, 0, S.z + 8] }]);
    inv.ult = inv.def.ultCost;
    let top = 0;
    T.run(60, (k) => { T.clr(inv.intents); T.aim(inv, T.center(foe)); inv.intents.ult = k === 0; top = Math.max(top, inv.pos.y); });
    T.expect(top < 3 && inv.ult >= inv.def.ultCost && !inv.override, `Mach Breaker under the roof: rose to ${top.toFixed(1)} m, ult at ${inv.ult.toFixed(0)}`);
  }
  // Skyward Slam in the concourse (its roof 14 m up): the one carried up over his head stops under it
  {
    const C = T.V(-63, 0, -10), roofY = 1 + w.rayWorld(T.V(C.x, 1, C.z), T.V(0, 1, 0), 40).dist;
    T.expect(roofY < 20 && Math.abs(w.floorAt(C.x, C.z, 1)) < 0.05, `no low roof over the concourse at (${C.x}, ${C.z}): ${roofY.toFixed(1)}`);
    // (both up in the air, so the climb would carry Robot well past the roof)
    const [inv, foe] = stage([{ key: 'invincible', player: true, at: C.toArray(), face: [0, 1] }, { key: 'robot', team: 1, at: [C.x, 0, C.z + 1.6] }]);
    for (const x of [inv, foe]) { T.teleport(x, T.V(x.pos.x, 5, x.pos.z)); x.mode = 'fly'; x.grounded = false; }
    T.run(2);
    foe.maxHp = foe.hp = 5000;
    let worst = -9, inside = 0;
    T.run(150, (k) => {
      T.clr(inv.intents); T.aim(inv, T.center(foe)); inv.intents.a3 = k === 0;
      worst = Math.max(worst, foe.pos.y + foe.height - roofY);
      if (w.inside(T.center(foe)) || w.inside(T.center(inv))) inside++;
    });
    T.expect(T.dmgTo(foe) >= 110, `the slam didn't land (${T.dmgTo(foe).toFixed(0)} damage)`);
    T.expect(worst < 0.1 && !inside, `the slam carried them ${worst.toFixed(2)} m into the roof (${inside} frames inside it)`);
    clean(inv, 'Skyward Slam'); clean(foe, 'Skyward Slam\'s victim');
  }
  {
    const [inv] = stage([{ key: 'invincible', player: true, at: S.toArray(), face: [0, -1] }, { key: 'rex', team: 1, at: [S.x + 60, 0, S.z] }]);
    const tgt = T.V(S.x, 0, S.z - 7);
    T.run(90, (k) => { T.clr(inv.intents); T.aim(inv, tgt); inv.intents.a2 = k === 0; });
    T.settle([inv], 300);
    T.expect(inv.pos.y < 1.5 && Math.hypot(inv.pos.x - tgt.x, inv.pos.z - tgt.z) < 3, `the Meteor Dive ended at ${at(inv)}`);
    clean(inv, 'the Meteor Dive');
  }
});

T.test('chicago: backed against a tall wall the camera comes in to the hero\'s head, hiding the hero, not into the wall', async () => {
  await payload();
  const w = T.w, cr = T.g.camRig, f = T.V(0, 0, 0), UP = T.V(0, 1, 0);
  // the east face of a building far taller than the follow point (so no lifting over it), with open
  // street in front of it and open sky above
  const open = (x, z) => w.groundAt(x, z) < 0.3 && !w.blocked(T.V(x, 0, z), 0.6) && !w.rayWorld(T.V(x, 1, z), UP, 30);
  let wall = null, z = 0;
  for (const o of w.obstacles) {
    if (o.type !== 'box' || o.max.y < 20 || o.max.z - o.min.z < 8) continue;
    z = (o.min.z + o.max.z) / 2;
    if ([0.8, 2, 3.5, 5].every((d) => open(o.max.x + d, z) && open(o.max.x + d, z - 1.5) && open(o.max.x + d, z + 1.5))) { wall = o; break; }
  }
  T.expect(!!wall, 'no tall building with open street beside it');
  if (!wall) return;
  const [h] = T.stage([{ key: 'allen', player: true, at: [wall.max.x + 4, 0, z], face: [1, 0] }]);
  cr.yaw = Math.PI / 2; cr.pitch = -0.1; cr.cut();
  const drive = (n, mz) => T.run(n, () => {
    T.clr(h.intents); h.intents.mz = mz;
    cr.forward(f); h.intents.aimDir.copy(f); h.intents.aimOrigin.copy(cr.cam.position); h.intents.aimPoint.copy(cr.cam.position).addScaledVector(f, 60);
  });
  // walk backwards until the hero's back is to the wall
  drive(150, -1);
  const c = cr.cam.position;
  T.expect(h.pos.x - wall.max.x < h.radius + 0.2, `the hero stopped ${(h.pos.x - wall.max.x).toFixed(2)} m from the wall`);
  T.expect(c.x > wall.max.x + 0.1, `the camera is in the wall: x ${c.x.toFixed(2)}, the wall's face at ${wall.max.x.toFixed(2)}`);
  T.expect(cr.close && !h.root.visible, `the camera is ${cr.curDist.toFixed(2)} m from the head and the hero is ${h.root.visible ? 'still drawn' : 'hidden'}`);
  // step away again: the boom eases back out and the hero reappears
  drive(150, 1);
  T.expect(!cr.close && h.root.visible && cr.curDist > 2, `after stepping away the boom is ${cr.curDist.toFixed(2)} m and the hero is ${h.root.visible ? 'drawn' : 'hidden'}`);
});

T.test('6v6 lineups: two of each role a side where the roster allows, nobody twice on a team', async () => {
  const { lineups6, HEROES, HERO_KEYS } = await mods();
  const roles = (t) => { const c = {}; for (const k of t) c[HEROES[k].role] = (c[HEROES[k].role] || 0) + 1; return c; };
  for (const key of HERO_KEYS) for (let n = 0; n < 30; n++) {
    const [a, b] = lineups6(key);
    const tag = `${key}: ${a} v ${b}`;
    T.expect(a.length === 6 && b.length === 6 && a[0] === key, `${tag}: bad teams`);
    T.expect(new Set(a).size === 6 && new Set(b).size === 6, `${tag}: a hero twice on a team`);
    for (const t of [a, b]) for (const [r, c] of Object.entries(roles(t))) T.expect(c === 2, `${tag}: ${c} ${r}s on a team`);
  }
});

// ---------------------------------------------------------------- a whole match
T.test('payload: a 6v6 bot match on hard plays out cleanly, and the camera stays out of the buildings', async () => {
  const m = await payload({ key: 'allen', side: 'attack', bots: 'active', difficulty: 'hard' });
  const g = T.g, w = T.w, A = T.ARENA;
  const Bot = g.bots[0].constructor;
  g.bots.push(g.playerBot = new Bot(g.player, w));
  const hs = [...w.heroes];
  const st = new Map(hs.map((h) => [h, { ovr: 0, tumble: 0, carried: 0, dead: 0, inside: 0, sunk: 0 }]));
  // inside a building or sunk into the floor: checked every frame; a fast ability can graze a wall
  // for a frame or two before the push-out catches it (counted, not failed), longer is a bug
  const GRAZE = 6;
  let grazes = 0;
  // (which ability: a Travel or Lunge by its class, a hand-made sequence by its phase)
  const ovr = (o) => (o.constructor.name !== 'Object' ? o.constructor.name : o.phase || 'sequence');
  const where = (h) => `(${h.pos.x.toFixed(1)}, ${h.pos.y.toFixed(1)}, ${h.pos.z.toFixed(1)}) [${h.mode}${h.override ? '/' + ovr(h.override) : ''}${h.carriedBy ? '/carried by ' + h.carriedBy.key : ''}]`;
  const issues = {};
  const flag = (h, msg) => { const k = `${h.key}/${h.team}: ${msg.replace(/[-\d.]+/g, '#')}`; if (!issues[k]) issues[k] = { n: 0, first: `${(w.time / 60).toFixed(2)} min ${h.key}/${h.team}: ${msg}` }; issues[k].n++; };
  const dt = 1 / 60, maxFrames = 13 * 3600;
  let camIn = 0, camN = 0, stepMs = 0, worst = 0, f = 0, tA = null;
  for (; f < maxFrames && !m.result; f++) {
    const t0 = performance.now();
    T.run(1);
    const ms = performance.now() - t0; stepMs += ms; worst = Math.max(worst, ms);
    if (m.phase >= 1 && tA == null) tA = w.time;
    for (const h of hs) {
      const s = st.get(h);
      s.ovr = h.override && !h.dead ? s.ovr + dt : 0;
      s.tumble = h.mode === 'tumble' && !h.carriedBy && !h.dead ? s.tumble + dt : 0;
      s.carried = h.carriedBy ? s.carried + dt : 0;
      s.dead = h.dead ? s.dead + dt : 0;
      if (s.ovr > 12) flag(h, `override stuck for ${s.ovr.toFixed(1)} s`);
      if (s.tumble > 6) flag(h, `tumbling for ${s.tumble.toFixed(1)} s`);
      if (s.carried > 8) flag(h, `carried for ${s.carried.toFixed(1)} s`);
      if (s.dead > Math.max(...w.respawnTime) + 1) flag(h, `dead for ${s.dead.toFixed(1)} s`);
      const inside = !h.dead && !!insideBox(h.pos), sunk = !h.dead && h.pos.y < w.floorAt(h.pos.x, h.pos.z, h.pos.y + 0.3) - 0.15;
      if (!inside && s.inside > 0 && s.inside <= GRAZE) grazes++;
      if (!sunk && s.sunk > 0 && s.sunk <= GRAZE) grazes++;
      s.inside = inside ? s.inside + 1 : 0; s.sunk = sunk ? s.sunk + 1 : 0;
      if (s.inside === GRAZE + 1) flag(h, `inside a building for more than ${GRAZE} frames at ${where(h)}`);
      if (s.sunk === GRAZE + 1) flag(h, `sunk into the floor for more than ${GRAZE} frames at ${where(h)}`);
      if (f % 30) continue;
      if (![h.pos.x, h.pos.y, h.pos.z, h.vel.x, h.vel.y, h.vel.z, h.hp, h.ult].every(Number.isFinite)) { flag(h, 'NaN state'); continue; }
      if (h.pos.x < A.rect.minX - 0.5 || h.pos.x > A.rect.maxX + 0.5 || h.pos.z < A.rect.minZ - 0.5 || h.pos.z > A.rect.maxZ + 0.5) flag(h, `out of bounds at (${h.pos.x.toFixed(0)}, ${h.pos.z.toFixed(0)})`);
      // (Mach Breaker climbs far above the ceiling on purpose and comes straight back down: its seq is
      // the one with a target)
      const machBreaker = h.key === 'invincible' && h.override && h.override.target;
      if (h.pos.y > A.ceiling + (machBreaker ? 120 : 0.5)) flag(h, `above the ceiling (${h.pos.y.toFixed(1)})`);
      if (h.hp < 0 || h.hp > h.maxHp + 0.01) flag(h, `hp out of range (${h.hp.toFixed(1)})`);
      if (T.boneNaN(h)) flag(h, 'NaN bones');
    }
    // the camera: never inside a building (a frame or two at a wall, while it pulls in, is allowed)
    if (f % 4 === 0 && g.player) {
      const c = g.camRig.cam.position;
      camN++;
      if (insideBox(c, 0.02, 0)) camIn++;
    }
  }
  for (const k in issues) T.fail(`${issues[k].first} (x${issues[k].n})`);
  T.expect(!!m.result, `no result after ${(f / 3600).toFixed(1)} min (cart at ${m.s.toFixed(0)} of ${m.path.len.toFixed(0)})`);
  const kills = T.log.kill.length, ults = T.log.ult.length;
  T.info(`${m.result ? (m.result.winner === m.att ? 'attack' : 'defence') + ' won (' + m.result.why + ')' : 'unfinished'} after ${(w.time / 60).toFixed(1)} min, cart ${m.s.toFixed(0)}/${m.path.len.toFixed(0)} m, A at ${tA ? (tA / 60).toFixed(1) + ' min' : '-'}; ${kills} kills, ${ults} ults`);
  T.info(`damage: ${hs.map((h) => `${h.key}/${h.team === m.att ? 'A' : 'D'} ${Math.round(T.dmgBy(h))}`).join(', ')}`);
  T.info(`step ${(stepMs / f).toFixed(2)} ms avg, ${worst.toFixed(1)} ms worst; camera inside a building ${camIn} of ${camN} checks; ${grazes} heroes grazing a wall or the floor for ${GRAZE} frames or fewer`);
  T.expect(kills >= 20, `only ${kills} kills: are the bots fighting?`);
  T.expect(m.s > 20, `the attackers barely moved the cart (${m.s.toFixed(0)} m)`);
  T.expect(camIn <= camN * 0.01, `camera inside a building in ${camIn} of ${camN} checks`);
  T.expect(stepMs / f < 20, `simulation step averages ${(stepMs / f).toFixed(1)} ms`);
});
