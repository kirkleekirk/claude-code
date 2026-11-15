// NPC construction + finite-state AI: Calm (idle/patrol/post/wander) -> Suspicious -> Hunting
// -> Retreat/Search. Vision cones, hearing, squad calls, flanking, archetype quirks, bosses.
import { ARCHETYPES, BOSSES } from '../data/enemies.js';
import { BP } from '../data/guns.js';
import { FACTION_LOOK, randomLook } from '../data/looks.js';
import { T, raycast, moveBox, angleTo, dist, dirFromAngle, freeAt } from './core.js';
import { astar } from '../world/pathfind.js';
import { WORLD_W, WORLD_H } from '../data/places.js';

let NEXT = 1;

// Virtual gun stats for NPCs: iron 3-star build of the blueprint, scaled by faction arms.
export function npcGun(bp, armsMult = 1, acc = 0.7) {
  const b = BP[bp];
  return {
    family: b.family, ammo: b.ammo, pellets: b.pellets, dmg: b.dmg * armsMult * 0.85, acc: Math.min(97, b.acc * acc * (0.85 + 0.15 * armsMult)), range: b.range, rpm: b.rpm,
    mag: b.mag, reload: b.reload * 1.2, noise: { None: 0, Low: 6, Med: 12, High: 18, 'V.High': 24, Extreme: 32 }[b.noise], handling: 1, recoil: (b.dmg * b.pellets / 40 + b.rpm / 1200), jam: 0.002, spread: 1, flash: 1, melee: 10, wear: 0,
  };
}

export function makeNPC(world, arch, x, y, opts = {}) {
  const A = ARCHETYPES[arch] || ARCHETYPES.militia;
  const faction = opts.faction || 'compact';
  const enemy = world.enemyMult();
  const arms = world.armsMult(faction);
  const look = A.dog ? null : randomLook(Math.random, { ...(FACTION_LOOK[opts.lookAs || A.look] || {}), ...(opts.look || {}) });
  const e = {
    id: NEXT++, kind: A.dog ? 'dog' : 'npc', arch, name: opts.name || A.name, x, y, r: A.dog ? 5 : 6,
    hp: Math.round(A.hp * enemy * (opts.hpMult || 1)), maxHp: Math.round(A.hp * enemy * (opts.hpMult || 1)), armor: A.armor, alive: true, ko: false, hittable: true,
    faction, place: opts.place || null, role: opts.role || 'guard', look, dog: !!A.dog, dir: 0, anim: 0, moving: false,
    speed: A.speed * T * (opts.speedMult || 1), vision: A.vision * T, hearing: A.hearing, react: A.react, A,
    weapon: A.gun ? { st: npcGun(A.gun, arms, A.acc), loaded: BP[A.gun].mag, reloadT: 0, cd: Math.random(), bloom: 0, jammed: false, gun: null } : null,
    melee: A.melee ? A.melee * enemy : 0, meleeCd: 0, slowT: 0, flashT: 0,
    ai: { state: opts.state || 'post', alert: 0, target: null, last: null, route: opts.route || null, ri: 0, home: { x, y }, timer: Math.random() * 3, path: null, pathT: 0, strafe: Math.random() < 0.5 ? 1 : -1, flank: 0, called: false, telegraph: 0, aim: 0, stuck: 0, molotovT: 3 + Math.random() * 4 },
    hostileToPlayer: !!opts.hostile, civilian: !!opts.civilian, witness: null, loot: opts.loot || null, boss: null, protectedNPC: !!opts.protected,
    elevated: !!opts.elevated, phase: 0, minion: !!opts.minion, mission: opts.mission || null, tag: opts.tag || null,
  };
  if (A.ai === 'sniper') { e.ai.state = 'post'; e.speed = 0; }
  if (opts.boss) makeBoss(e, opts.boss, world);
  return e;
}

function makeBoss(e, id, world) {
  const B = BOSSES[id];
  e.boss = id;
  e.name = B.name;
  e.maxHp = e.hp = Math.round(B.hp * world.enemyMult());
  e.armor = B.armor;
  e.speed = B.speed * T;
  e.look = randomLook(Math.random, B.look);
  e.weapon = { st: npcGun(B.gun, world.armsMult(e.faction), 0.85), loaded: BP[B.gun].mag, reloadT: 0, cd: 1, bloom: 0, jammed: false, gun: null };
  e.vision = 14 * T;
  e.r = 7;
  e.ai.state = 'post';
  e.phase = 0;
}

// ---------- perception ----------
export function canSee(world, e, t) {
  if (!t || !t.alive) return false;
  const d = dist(e, t);
  let range = e.vision * (world.night ? 0.62 : 1);
  if (t.sneaking) range *= 0.6;
  if (t.isPlayer && world.perk('fx_ghost')) range *= 0.85;
  if (t.inLight) range = Math.max(range, e.vision * 0.9);
  if (d > range) return false;
  if (d > 2.2 * T && !e.dog) {
    const a = angleTo(e, t);
    let df = Math.abs(((a - e.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (df > 1.0) return false;
  }
  const blocked = raycast(e.x, e.y, t.x, t.y, (tx, ty) => world.Q.blocksSight(tx, ty), e.elevated ? 24 : 0);
  if (blocked) return false;
  if (world.combat.smokeBlocks(e.x, e.y, t.x, t.y)) return false;
  return true;
}

function setFace(e, a) { e.face = a; e.dir = dirFromAngle(a); }

// ---------- movement helpers ----------
function steer(world, e, tx, ty, dt, speedMult = 1) {
  const d = Math.hypot(tx - e.x, ty - e.y);
  if (d < 3) { e.moving = false; return true; }
  let goal = { x: tx, y: ty };
  if (e.ai.path && e.ai.path.length) {
    const p = e.ai.path[0];
    goal = { x: p[0] * T + 8, y: p[1] * T + 10 };
    if (Math.hypot(goal.x - e.x, goal.y - e.y) < 5) e.ai.path.shift();
  }
  const a = Math.atan2(goal.y - e.y, goal.x - e.x);
  const sp = e.speed * speedMult * (e.slowT > 0 ? 0.5 : 1) * dt;
  const moved = moveBox(world.Q, e, Math.cos(a) * sp, Math.sin(a) * sp);
  e.moving = true;
  if (e.ai.state !== 'hunt' || !e.weapon) setFace(e, a);
  if (!moved || (e.ai.lastX !== undefined && Math.hypot(e.x - e.ai.lastX, e.y - e.ai.lastY) < sp * 0.2)) e.ai.stuck += dt; else e.ai.stuck = 0;
  e.ai.lastX = e.x; e.ai.lastY = e.y;
  if (e.ai.stuck > 0.4 && world.time > e.ai.pathT) {
    e.ai.pathT = world.time + 1.2;
    e.ai.stuck = 0;
    const p = astar(WORLD_W, WORLD_H, Math.floor(e.x / T), Math.floor(e.y / T), Math.floor(tx / T), Math.floor(ty / T), (x, y) => !world.Q.blocksMove(x, y), 1800);
    e.ai.path = p ? p.slice(1) : null;
  }
  return false;
}

// ---------- main think ----------
export function think(world, e, dt) {
  const ai = e.ai;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.meleeCd > 0) e.meleeCd -= dt;
  if (e.flashT > 0) e.flashT -= dt;
  if (e.weapon) world.combat.updateWeapon(e, e.weapon, dt);
  if (e.civilian) return thinkCivilian(world, e, dt);
  if (e.faction === 'crew') return thinkCrew(world, e, dt);
  if (e.boss) bossPhase(world, e);
  ai.timer -= dt;
  const targets = world.targetsFor(e);
  // Perception: pick the nearest visible hostile target.
  let seen = null, sd = Infinity;
  if (world.time >= (ai.nextLook || 0)) {
    ai.nextLook = world.time + 0.12;
    for (const t of targets) { const d = dist(e, t); if (d < sd && canSee(world, e, t)) { seen = t; sd = d; } }
    ai.seen = seen;
  } else seen = ai.seen && ai.seen.alive ? ai.seen : null;
  if (seen) {
    if (ai.state !== 'hunt') {
      const rate = (1 / Math.max(0.25, e.react)) * (1.4 - Math.min(1, sd / e.vision)) * (world.perk('fx_ghost') && seen.isPlayer ? 0.75 : 1) * (seen.sneaking ? 0.6 : 1);
      ai.alert = Math.min(1, ai.alert + rate * dt * 1.6);
      if (ai.state !== 'suspicious' && ai.alert > 0.25) { ai.state = 'suspicious'; world.onSuspicious(e); }
      ai.last = { x: seen.x, y: seen.y };
      setFace(e, angleTo(e, seen));
      if (ai.alert >= 1 || sd < 1.5 * T) startHunt(world, e, seen);
    } else { ai.target = seen; ai.last = { x: seen.x, y: seen.y, t: world.time }; }
  } else if (ai.state === 'suspicious') {
    ai.alert = Math.max(0, ai.alert - dt * 0.25);
    if (ai.last) steer(world, e, ai.last.x, ai.last.y, dt, 0.6);
    if (ai.alert <= 0) { ai.state = ai.route ? 'patrol' : 'post'; world.onCalm(e); }
  }
  // Hearing.
  for (const n of world.combat.noises) {
    if (n.src === e || (n.src && n.src.faction === e.faction)) continue;
    if (Math.hypot(n.x - e.x, n.y - e.y) <= n.r * e.hearing) {
      if (world.hostileTo(e, n.src)) { if (ai.state !== 'hunt') startHunt(world, e, n.src, true); }
      else if (ai.state === 'post' || ai.state === 'patrol') { ai.state = 'suspicious'; ai.alert = 0.4; ai.last = { x: n.x, y: n.y }; world.onSuspicious(e); }
    }
  }
  switch (ai.state) {
    case 'post': if (ai.home && Math.hypot(e.x - ai.home.x, e.y - ai.home.y) > 6) steer(world, e, ai.home.x, ai.home.y, dt, 0.5); else { e.moving = false; if (ai.timer <= 0) { ai.timer = 2 + Math.random() * 3; setFace(e, (e.face || 0) + (Math.random() - 0.5) * 2.4); } } break;
    case 'patrol': {
      const r = ai.route;
      if (!r || !r.length) { ai.state = 'post'; break; }
      const p = r[ai.ri % r.length];
      if (steer(world, e, p[0] * T + 8, p[1] * T + 10, dt, 0.45)) { ai.ri++; ai.path = null; }
      break;
    }
    case 'wander': if (ai.timer <= 0 || !ai.wp) { ai.timer = 3 + Math.random() * 4; ai.wp = { x: ai.home.x + (Math.random() - 0.5) * 120, y: ai.home.y + (Math.random() - 0.5) * 120 }; } steer(world, e, ai.wp.x, ai.wp.y, dt, 0.4); break;
    case 'hunt': hunt(world, e, dt); break;
    case 'search':
      if (ai.timer <= 0) { ai.state = ai.route ? 'patrol' : 'post'; ai.alert = 0.3; world.onCalm(e); break; }
      if (!ai.wp || Math.hypot(ai.wp.x - e.x, ai.wp.y - e.y) < 6) ai.wp = { x: (ai.last ? ai.last.x : e.x) + (Math.random() - 0.5) * 96, y: (ai.last ? ai.last.y : e.y) + (Math.random() - 0.5) * 96 };
      steer(world, e, ai.wp.x, ai.wp.y, dt, 0.7);
      break;
    case 'retreat': {
      const away = ai.target ? angleTo(ai.target, e) : 0;
      moveBox(world.Q, e, Math.cos(away) * e.speed * dt, Math.sin(away) * e.speed * dt);
      e.moving = true;
      if (ai.timer <= 0) { ai.state = 'hunt'; ai.timer = 4; }
      if (e.weapon && ai.target && canSee(world, e, ai.target) && Math.random() < 0.3) fireAt(world, e, ai.target);
      break;
    }
    default: break;
  }
  // Medic: heal hurt allies nearby.
  if (e.A.heals && ai.state !== 'retreat' && world.time > (ai.healT || 0)) {
    ai.healT = world.time + 3;
    for (const o of world.hash.query(e.x, e.y, 5 * T, [])) if (o !== e && o.alive && o.faction === e.faction && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + e.A.heals); world.R.fx.text(o.x, o.y, '+' + e.A.heals, '#7cbf62', 26); break; }
  }
}

export function startHunt(world, e, target, heard = false) {
  const ai = e.ai;
  if (!target) return;
  const was = ai.state;
  ai.state = 'hunt';
  ai.alert = 1;
  ai.target = target;
  ai.last = { x: target.x, y: target.y, t: world.time };
  ai.timer = 6;
  if (was !== 'hunt') {
    world.onHunt(e, target, heard);
    if (!ai.called) {
      ai.called = true;
      for (const o of world.hash.query(e.x, e.y, 12 * T, [])) if (o !== e && o.alive && !o.ko && o.faction === e.faction && o.ai && o.ai.state !== 'hunt' && !o.civilian) { o.ai.called = true; startHunt(world, o, target, true); }
    }
  }
}

function fireAt(world, e, t) {
  if (!e.weapon || world.time < (e.ai.reactUntil || 0)) return;
  let accMult = 1;
  for (const o of world.hash.query(e.x, e.y, 6 * T, [])) if (o.alive && o.faction === e.faction && o.A && o.A.buff) accMult = 1 + o.A.buff;
  const lead = 0.12;
  const ok = world.combat.tryFire(e, e.weapon, t.x + (t.vx || 0) * lead, t.y + (t.vy || 0) * lead, { accMult, autoReload: true });
  if (!ok && e.weapon.loaded <= 0) world.combat.startReload(e, e.weapon);
}

function hunt(world, e, dt) {
  const ai = e.ai;
  const t = ai.target;
  if (!t || !t.alive || t.ko) { ai.state = 'search'; ai.timer = 5; ai.target = null; return; }
  const d = dist(e, t);
  const sees = ai.seen === t;
  if (!sees) {
    if (ai.last && Math.hypot(ai.last.x - e.x, ai.last.y - e.y) > 8) steer(world, e, ai.last.x, ai.last.y, dt, 0.9);
    else { ai.state = 'search'; ai.timer = 6; }
    return;
  }
  ai.timer = 6;
  setFace(e, angleTo(e, t));
  if (!e.boss && !e.A.fearless && e.hp < e.maxHp * 0.28 && !ai.retreated) { ai.retreated = true; ai.state = 'retreat'; ai.timer = 2.5; return; }
  // Captains call reinforcements once.
  if (e.A.calls && !ai.reinforced && world.time - (ai.huntStart || (ai.huntStart = world.time)) > 7) { ai.reinforced = true; world.reinforce(e); }
  // Melee chargers (dogs, brutes).
  if (e.melee && !e.weapon) {
    if (d > 13) steer(world, e, t.x, t.y, dt, 1.0);
    else if (e.meleeCd <= 0) { e.meleeCd = e.dog ? 0.8 : 1.2; world.damage(t, e.melee, e, { melee: true, dir: angleTo(e, t) }); world.sfx(e.dog ? 'dog_bark' : 'melee', e); }
    return;
  }
  // Zealots lob molotovs.
  if (e.A.molotov && d < 7 * T && d > 3 * T) { ai.molotovT -= dt; if (ai.molotovT <= 0) { ai.molotovT = 5 + Math.random() * 3; world.combat.throwItem(e, 'molotov', t.x, t.y); } }
  if (e.A.smoke && e.hp < e.maxHp * 0.5 && !ai.smoked) { ai.smoked = true; world.combat.throwItem(e, 'smokepot', e.x, e.y); }
  if (e.A.grenades && d < 7 * T && Math.random() < dt * 0.08) world.combat.throwItem(e, 'pipebomb', t.x, t.y);
  // Snipers telegraph with a laser before firing.
  if (e.A.telegraph) {
    ai.telegraph += dt;
    e.laser = { x: t.x, y: t.y };
    if (ai.telegraph >= e.A.telegraph) { ai.telegraph = 0; fireAt(world, e, t); e.laser = null; }
    return;
  }
  const pref = Math.min(e.weapon.st.range * T * 0.7, 9 * T);
  const flanker = e.A.ai === 'flanker' || e.boss;
  if (flanker && world.time > ai.flank) { ai.flank = world.time + 3 + Math.random() * 2; ai.strafe = -ai.strafe; }
  if (e.speed > 0) {
    const a = angleTo(e, t);
    let mx = 0, my = 0;
    if (d > pref * 1.15) { mx += Math.cos(a); my += Math.sin(a); }
    else if (d < pref * 0.6 && !e.A.shield) { mx -= Math.cos(a); my -= Math.sin(a); }
    const sa = a + Math.PI / 2 * ai.strafe;
    const sk = flanker ? 0.9 : 0.45;
    mx += Math.cos(sa) * sk; my += Math.sin(sa) * sk;
    const n = Math.hypot(mx, my) || 1;
    const sp = e.speed * (e.A.shield ? 0.7 : 0.8) * (e.slowT > 0 ? 0.5 : 1) * dt;
    if (!moveBox(world.Q, e, (mx / n) * sp, (my / n) * sp)) ai.strafe = -ai.strafe;
    e.moving = true;
  }
  if (world.time - (ai.huntStart || 0) > e.react * 0.6) fireAt(world, e, t);
}

function thinkCivilian(world, e, dt) {
  const ai = e.ai;
  if (ai.state === 'flee') {
    const from = ai.fear || world.player;
    const a = angleTo(from, e);
    moveBox(world.Q, e, Math.cos(a) * e.speed * 1.3 * dt, Math.sin(a) * e.speed * 1.3 * dt);
    e.moving = true; setFace(e, a);
    ai.timer -= dt;
    if (e.witness) {
      e.witness.t -= dt;
      if (e.witness.t <= 0) { world.witnessReport(e); e.witness = null; }
    }
    if (ai.timer <= 0) { ai.state = 'wander'; e.moving = false; }
    return;
  }
  ai.timer -= dt;
  if (ai.timer <= 0 || !ai.wp) { ai.timer = 3 + Math.random() * 6; ai.wp = { x: ai.home.x + (Math.random() - 0.5) * 140, y: ai.home.y + (Math.random() - 0.5) * 100 }; }
  if (e.role === 'merchant' || e.role === 'vendor' || e.role === 'prisoner') { e.moving = false; return; }
  if (steer(world, e, ai.wp.x, ai.wp.y, dt, 0.35)) ai.timer = Math.min(ai.timer, 1 + Math.random() * 2);
}

export function scare(world, e, from, witnessCrime) {
  if (!e.civilian || e.role === 'vendor' || e.role === 'prisoner') return;
  e.ai.state = 'flee';
  e.ai.timer = 4 + Math.random() * 3;
  e.ai.fear = from;
  if (witnessCrime && !e.witness && !world.noViolenceAt(e.x, e.y)) { e.witness = { t: 6 + Math.random() * 3 }; world.R.fx.text(e.x, e.y, '!', '#e2452a', 28); }
}

// ---------- crew AI (squad) ----------
function thinkCrew(world, e, dt) {
  const ai = e.ai;
  const P = world.player;
  const order = world.squadOrder;
  let foe = null, fd = Infinity;
  if (world.time >= (ai.nextLook || 0)) {
    ai.nextLook = world.time + 0.2;
    for (const t of world.targetsFor(e)) { const d = dist(e, t); if (d < 11 * T && d < fd && canSee(world, e, t)) { foe = t; fd = d; } }
    if (order.kind === 'focus' && order.target && order.target.alive) foe = order.target;
    ai.target = foe;
  } else foe = ai.target && ai.target.alive && !ai.target.ko ? ai.target : null;
  let gx = P.x, gy = P.y, keep = 2.5 * T;
  if (order.kind === 'hold' || order.kind === 'breach') { gx = order.x + (e.slot % 2 ? 10 : -10); gy = order.y + (e.slot > 1 ? 10 : -10); keep = 6; }
  const d = Math.hypot(gx - e.x, gy - e.y);
  if (d > keep) steer(world, e, gx, gy, dt, d > 6 * T ? 1.25 : 0.95); else e.moving = false;
  if (d > 18 * T && order.kind === 'follow') { e.x = P.x + (Math.random() - 0.5) * 20; e.y = P.y + 10; }
  if (foe && e.weapon) {
    setFace(e, angleTo(e, foe));
    const ok = world.combat.tryFire(e, e.weapon, foe.x, foe.y, { accMult: e.accMult || 1, dmgMult: e.dmgMult || 1 });
    if (!ok && e.weapon.loaded <= 0) world.combat.startReload(e, e.weapon);
  }
  if (e.coward && e.hp < e.maxHp * 0.5 && foe) { const a = angleTo(foe, e); moveBox(world.Q, e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt); }
}

// ---------- bosses ----------
function bossPhase(world, e) {
  const f = e.hp / e.maxHp;
  const want = f < 0.3 ? 2 : f < 0.62 ? 1 : 0;
  if (want <= e.phase) return;
  e.phase = want;
  const B = BOSSES[e.boss];
  world.toast(`${B.name}: ${B.phases[want]}`);
  world.shake(4);
  world.sfx('alert', e);
  switch (e.boss) {
    case 'rustjaw':
      if (want === 1) for (let i = 0; i < 3; i++) world.spawnMinion('brute', e, 'rustjaw');
      if (want === 2) { e.weapon.st.rpm *= 1.4; e.A = { ...e.A, molotov: true }; e.speed *= 1.25; }
      break;
    case 'palehand':
      if (want === 1) { world.combat.throwItem(e, 'smokepot', e.x, e.y); world.blinkBoss(e); for (let i = 0; i < 2; i++) world.spawnMinion('smuggler', e, 'palehand'); }
      if (want === 2) { e.weapon.st = npcGun('quiet_hand', world.armsMult('palehand'), 0.85); e.weapon.loaded = 20; e.A = { ...e.A, telegraph: 0 }; e.speed *= 1.3; }
      break;
    case 'ashchoir':
      if (want === 1) { for (let i = 0; i < 3; i++) world.spawnMinion('zealot', e, 'ashchoir'); for (let k = 0; k < 6; k++) world.combat.addZone('fire', e.x + Math.cos(k) * 40, e.y + Math.sin(k) * 30, 18, 8, e); }
      if (want === 2) { for (let k = 0; k < 10; k++) world.combat.addZone('fire', e.x + Math.cos(k * 0.63) * 70, e.y + Math.sin(k * 0.63) * 50, 16, 6, e); e.speed *= 1.2; }
      break;
    case 'compact':
      if (want === 1) { e.shielded = false; e.weapon.st.rpm *= 1.3; }
      if (want === 2) { for (let i = 0; i < 3; i++) world.spawnMinion('warden', e, 'compact'); world.artillery(e); }
      break;
    default: break;
  }
  if (e.boss === 'ashchoir') e.A = { ...e.A, molotov: true };
}

export { freeAt };
