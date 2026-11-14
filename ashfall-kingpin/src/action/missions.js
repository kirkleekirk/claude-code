// Missions in action mode: vault raids, the 10 contract kinds, camp boss fights, Hollow defense
// (incl. Operation Daybreak waves) and the Council Hall finale. Results feed the pure sim.
import { PLACE, WORLD_W } from '../data/places.js';
import { CONTRACT } from '../data/contracts.js';
import { COMPOSITION } from '../data/enemies.js';
import { RAMPS, SEM } from '../data/palette.js';
import { T, dist, freeAt, angleTo, moveBox } from './core.js';
import { makeNPC, startHunt } from './ai.js';
import { drawText } from '../render/font.js';
import { log, stat, earn, addRep, fx } from '../sim/state.js';
import { addHeat } from '../sim/heat.js';
import { finishContract, raidAftermath, vaultLoot, campHit, payPlanCosts } from '../sim/jobs.js';
import { resolveDefense, bossDefeated, rivalPower } from '../sim/rivals.js';
import { winEnding } from '../sim/endgame.js';
import { onJob, combatPower, crewName } from '../sim/crew.js';
import { addItem } from '../sim/inventory.js';
import { astar } from '../world/pathfind.js';
import { WORLD_H } from '../data/places.js';

const footprint = (p) => ({ x0: p.at[0] * T, y0: p.at[1] * T, x1: (p.at[0] + p.w) * T, y1: (p.at[1] + p.h) * T });
const outsideBy = (P, p, tiles) => { const f = footprint(p); const m = tiles * T; return P.x < f.x0 - m || P.x > f.x1 + m || P.y < f.y0 - m || P.y > f.y1 + m; };
const center = (p) => ({ x: (p.at[0] + p.w / 2) * T, y: (p.at[1] + p.h / 2) * T });

export class MissionRunner {
  constructor(world) { this.w = world; this.marks = []; this.objs = []; }
  get M() { return this.w.S.mission; }
  holds(placeId) { const M = this.M; return !!M && (M.target === placeId || (M.place && M.place === placeId)); }
  objects() { return this.objs; }

  // ---------- starting ----------
  startRaid(plan) {
    const S = this.w.S;
    const why = payPlanCosts(S, plan);
    if (why) return { ok: false, msg: why };
    const p = PLACE[plan.target];
    const camp = p.kind === 'camp';
    S.mission = { type: camp ? 'camp' : 'raid', target: plan.target, place: plan.target, approach: plan.approach, inside: !!plan.inside, recon: plan.recon || 0, crew: plan.crew, vehicle: plan.vehicle, phase: 'go', spotted: false, kills: 0, looted: false, day: S.day, title: camp ? `Hit ${p.name}` : `Rob the ${p.hq.name}` };
    for (const id of plan.crew) { const c = S.crew.find((x) => x.id === id); if (c && c.job !== 'squad') { c.prevJob = c.job; c.job = 'squad'; } }
    this.objective(camp ? `Break into ${p.name}. Take ${S.rivals[Object.keys(S.rivals).find((r) => S.rivals[r].camp === plan.target)].leader} down or crack the strongbox, then get out.` : `Crack the vault in the ${p.hq.name}, then leave ${p.name}.`);
    this.w.updateLocks(true);
    return { ok: true, msg: 'Raid is on. Travel to the target.' };
  }

  startContract(o) {
    const S = this.w.S;
    const tpl = CONTRACT[o.tpl];
    S.contracts.board = S.contracts.board.filter((x) => x.cid !== o.cid);
    const place = o.place === 'road' ? o.from : o.place;
    S.mission = { type: 'contract', kind: tpl.kind, contract: o, target: place, place, phase: 'go', spotted: false, kills: 0, day: S.day, deadline: S.total + (tpl.kind === 'delivery' ? 14 : 48) * 60, title: tpl.name };
    if (tpl.need) { /* goods are handed over at the drop */ }
    this.objective(this.kindObjective(tpl, o));
    return { ok: true, msg: `Job accepted: ${tpl.name}.` };
  }

  kindObjective(tpl, o) {
    const where = o.place === 'road' ? 'the road' : PLACE[o.place].name;
    return {
      heist: `Find the marked safe in ${where}, crack it, get out.`, convoy: `Intercept the convoy near ${where}. Wreck it and grab the cargo.`, assault: `Storm ${where} and take down the commander.`,
      delivery: `Bring the goods to the drop in ${where} before the deadline.`, hit: `Find the target in ${where} and take them out.`, rescue: `Free the prisoner in ${where} and walk them out.`,
      sabotage: `Wreck the 3 marked targets at ${where}.`, scavenge: `Strip every crate at ${where}.`, collect: `Find the debtor in ${where} and collect.`, defend: `Hold ${where} until the attackers give up.`,
    }[tpl.kind];
  }

  startCouncil() {
    const S = this.w.S;
    S.mission = { type: 'council', target: 'newhaven', place: 'newhaven', phase: 'go', spotted: true, kills: 0, day: S.day, title: 'Storm the Council Hall' };
    this.objective('Fight into the Council Hall in New Haven. Destroy the shield pylons, then end Chancellor Hale.');
    return { ok: true, msg: 'Final assault: New Haven.' };
  }

  objective(text) { this.w.S.mission.objective = text; this.w.toast(text, 'mission'); }

  abort(reason = 'Mission aborted.') {
    const M = this.M;
    if (!M) return;
    if (M.type === 'contract') finishContract(this.w.S, M.contract, false, {});
    if (M.type === 'defense') { resolveDefense(this.w.S, false, false); }
    this.cleanup();
    this.w.toast(reason, 'bad');
  }

  cleanup() {
    const S = this.w.S;
    if (S.mission && S.mission.crew) for (const id of S.mission.crew) { const c = S.crew.find((x) => x.id === id); if (c && c.prevJob) { c.job = c.prevJob; delete c.prevJob; } }
    for (const o of this.objs) if (o.ent) o.ent.objective = false;
    this.objs = [];
    this.marks = [];
    S.mission = null;
    this.w.updateLocks(true);
  }

  // ---------- spawning mission content when the target place streams in ----------
  onPlaceSpawned(p, list) {
    const M = this.M;
    if (!M || M.place !== p.id || M.spawnedFor === p.id) return;
    M.spawnedFor = p.id;
    const W = this.w.W;
    const L = W.layouts[p.id];
    const add = (e) => { if (e && this.w.add(e)) list.push(e); return e; };
    if (M.type === 'raid' && M.inside) { let cut = Math.floor(list.filter((e) => e.faction === 'compact').length * 0.3); for (const e of list) if (cut > 0 && e.faction === 'compact' && e.ai.state === 'wander') { e.alive = false; e.deadT = 99; cut--; } }
    if (M.type === 'camp' || M.type === 'council') { if (M.type === 'camp') this.w.campAlert[p.id] = 9999; }
    if (M.type === 'council') this.setupCouncil(p, L, add);
    if (M.type !== 'contract') return;
    const o = M.contract;
    const tpl = CONTRACT[o.tpl];
    const bld = tpl.role ? W.buildings.find((b) => b.place === p.id && (b.role === tpl.role || (tpl.role === 'hq' && b.hq))) : null;
    const inner = bld ? { x: (bld.x + Math.floor(bld.w / 2)) * T + 8, y: (bld.y + 1) * T + 12 } : center(p);
    const near = (pt, k) => this.freeNear(pt.x, pt.y, k);
    const hostile = { hostile: true, place: p.id, faction: p.kind === 'camp' ? o.rival || 'wild' : 'wild' };
    switch (tpl.kind) {
      case 'heist': this.objs.push(this.objEnt(add, inner, 'safe', 'Crack the safe', { safe: true })); for (let i = 0; i < 2; i++) { const q = near(inner, 2 + i); add(makeNPC(this.w, p.kind === 'camp' ? (COMPOSITION[o.rival] || COMPOSITION.compact)[i] : 'militia', q.x, q.y, { faction: p.kind === 'camp' ? o.rival : 'compact', place: p.id, state: 'post' })); } break;
      case 'hit': { const t = add(makeNPC(this.w, 'captain', inner.x, inner.y, { ...hostile, name: 'The Target', state: 'wander', hpMult: 1.3 })); t.markTarget = true; M.targetEnt = t; for (let i = 0; i < 2 + Math.floor(tpl.diff / 4); i++) { const q = near(inner, 2); add(makeNPC(this.w, 'scav', q.x, q.y, { ...hostile, state: 'wander' })); } break; }
      case 'rescue': { const pr = this.w.civilian(inner.x, inner.y, p.id, { role: 'prisoner', name: 'Prisoner' }); add(pr); pr.objective = true; pr.objKind = 'free'; M.prisoner = pr; for (let i = 0; i < 2; i++) { const q = near(inner, 2); add(makeNPC(this.w, p.kind === 'camp' ? (COMPOSITION[o.rival] || ['raider'])[0] : 'militia', q.x, q.y, { faction: p.kind === 'camp' ? o.rival : 'compact', place: p.id, state: 'post' })); } break; }
      case 'sabotage': { const spots = [inner, near(center(p), 3), near(center(p), 5)]; M.targets = 3; for (const s of spots) { const e = this.objEnt(add, s, 'target', 'Plant a charge', { hp: 60, target: true }); this.objs.push(e); } break; }
      case 'scavenge': M.crates = this.w.statics.filter((s) => s.kind === 'loot' && s.place === p.id).map((s) => s.id); break;
      case 'collect': { const c = center(p); const d = this.w.civilian(c.x, c.y, p.id, { role: 'debtor', name: 'Debtor' }); add(d); d.objective = true; d.objKind = 'collect'; M.debtor = d; break; }
      case 'defend': { const c = center(p); const k = this.w.civilian(c.x, c.y, p.id, { role: 'contact', name: 'Your contact' }); k.hp = k.maxHp = 80; add(k); k.protected = true; M.contact = k; M.waves = 3; M.wave = 0; M.waveT = 4; break; }
      case 'assault': { const t = add(makeNPC(this.w, 'captain', inner.x, inner.y, { faction: 'compact', place: p.id, name: 'Garrison Commander', hpMult: 2, hostile: true })); t.markTarget = true; M.targetEnt = t; this.w.alertTown(p.id, 9999); break; }
      case 'delivery': { const c = center(p); this.objs.push({ kind: 'drop', x: c.x, y: c.y, r: 26, label: 'Hand over the goods' }); break; }
      default: break;
    }
  }

  objEnt(add, pt, kind, label, o = {}) {
    const e = { id: 700000 + Math.floor(Math.random() * 1e6), kind: 'npc', civilian: false, faction: 'object', name: label, x: pt.x, y: pt.y, r: 7, hp: o.hp || 1, maxHp: o.hp || 1, armor: 0, alive: true, ko: false, hittable: !!o.target, objective: true, objKind: kind, label, place: this.M.place, look: null, prop: true, ai: { state: 'post' }, A: {} };
    add(e);
    return { kind: 'objective', ent: e, x: pt.x, y: pt.y, r: 18 };
  }

  freeNear(x, y, k = 2) {
    for (let i = 0; i < 20; i++) { const a = Math.random() * Math.PI * 2, r = (1 + Math.random() * k) * T; const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r; if (freeAt(this.w.Q, nx, ny)) return { x: nx, y: ny }; }
    return { x, y };
  }

  setupCouncil(p, L, add) {
    const hq = this.w.W.buildings.find((b) => b.place === 'newhaven' && b.hq);
    const c = { x: (hq.x + Math.floor(hq.w / 2)) * T + 8, y: (hq.y + 2) * T + 8 };
    const boss = add(makeNPC(this.w, 'captain', c.x, c.y, { faction: 'compact', place: 'newhaven', boss: 'compact', hostile: true }));
    boss.shielded = true;
    this.M.boss = boss;
    this.M.pylons = [];
    for (const dx of [-3, 3]) { const pe = this.objEnt(add, { x: c.x + dx * T, y: c.y + T }, 'pylon', 'Shield pylon', { hp: 140, target: true }); pe.ent.hittable = true; this.M.pylons.push(pe.ent); this.objs.push(pe); }
    for (let i = 0; i < 6; i++) { const q = this.freeNear(c.x, c.y + 3 * T, 3); add(makeNPC(this.w, i % 2 ? 'warden' : 'shield', q.x, q.y, { faction: 'compact', place: 'newhaven', hostile: true, state: 'post' })); }
    this.w.alertTown('newhaven', 9999);
  }

  // ---------- defense ----------
  startDefense() {
    const S = this.w.S;
    const d = S.defense;
    if (!d) return false;
    S.mission = { type: 'defense', target: 'hollow', place: 'hollow', phase: 'active', wave: 0, waveT: 3, remain: 0, title: d.name, spotted: true, kills: 0, day: S.day, steal: 0 };
    this.objective(`${d.name} attack the Hollow! Hold the walls. Don't let them reach the stash.`);
    this.w.game.audio.setMood('raid');
    const L = this.w.W.layouts.hollow;
    const guards = onJob(S, 'guard').filter((c) => c.injured === 0);
    guards.forEach((c, i) => { const sp = L.spawns.defend[i % L.spawns.defend.length]; const e = this.w.civilian(sp[0] * T + 8, sp[1] * T + 10, 'hollow', { name: crewName(c), look: c.look }); Object.assign(e, { civilian: false, faction: 'crew', crewRef: c, slot: i, role: 'guard', weapon: { st: { family: 'rifle', ammo: 'medium', pellets: 1, dmg: 18 + c.skills.gunplay * 2, acc: 55 + c.skills.gunplay * 4, range: 16, rpm: 120, mag: 99, reload: 2, noise: 18, handling: 1, recoil: 0.5, jam: 0, spread: 1, flash: 1, melee: 10, wear: 0 }, loaded: 99, reloadT: 0, cd: 0, bloom: 0, jammed: false }, hp: 90, maxHp: 90, speed: 2.8 * T, holdPos: { x: sp[0] * T + 8, y: sp[1] * T + 10 } }); this.w.add(e); });
    for (const [i, cell] of S.hollow.cells.entries()) if (cell && cell.fac === 'turret') { const gc = this.w.W.layouts.hollow.gridCells.find((g) => g.j * 6 + g.i === i); const e = makeNPC(this.w, 'sniper', gc.x * T + 16, gc.y * T + 20, { faction: 'crew', place: 'hollow', name: 'Turret' }); e.turret = true; e.speed = 0; e.weapon.st = { ...e.weapon.st, rpm: 200, dmg: 14, acc: 75, range: 14 }; e.faction = 'crew'; e.slot = 9; e.look = null; e.dog = false; this.w.add(e); }
    for (const [i, cell] of S.hollow.cells.entries()) if (cell && cell.fac === 'traps') { const gc = this.w.W.layouts.hollow.gridCells.find((g) => g.j * 6 + g.i === i); void gc; const gate = this.w.W.layouts.hollow.gate; this.w.combat.addZone('caltrops', gate.x * T + 8 + (Math.random() - 0.5) * 30, (gate.y - 3) * T, 26, 200, this.w.player); }
    return true;
  }

  spawnWave() {
    const S = this.w.S, M = this.M, d = S.defense;
    const L = this.w.W.layouts.hollow;
    const n = Math.max(3, Math.min(14, Math.round(d.power / 9)));
    const fac = d.by === 'compact' ? 'compact' : d.by;
    const comp = d.by === 'compact' ? COMPOSITION.warden : COMPOSITION[d.by];
    const gate = L.gate;
    for (let i = 0; i < n; i++) {
      const side = i % 3;
      const x = side === 0 ? (gate.x + (i % 5) - 2) * T + 8 : side === 1 ? (L.box.x - 3) * T : (L.box.x + L.box.w + 2) * T;
      const y = side === 0 ? (gate.y - 6 - (i % 3)) * T : (L.box.y + 6 + (i % 8) * 2) * T;
      const e = makeNPC(this.w, comp[i % comp.length], x, y, { faction: fac, place: 'hollow', hostile: true, minion: true });
      e.raider = true;
      if (this.w.add(e)) { startHunt(this.w, e, this.w.player); M.remain++; }
    }
    M.wave++;
    this.w.toast(`Wave ${M.wave}${d.waves > 1 ? ' of ' + d.waves : ''}: ${n} attackers!`, 'bad');
    this.w.sfx('siren');
  }

  // ---------- per-frame ----------
  update(dt) {
    const M = this.M;
    for (const m of this.marks) { m.t -= dt; if (m.t <= 0 && !m.done) { m.done = true; this.w.combat.explode(m.x, m.y, 2 * T, 45, m.src); } }
    this.marks = this.marks.filter((m) => !m.done);
    if (!M) return;
    const S = this.w.S, P = this.w.player;
    if (M.deadline && S.total > M.deadline && M.phase !== 'done') return this.fail('Too late. The job fell through.');
    const place = PLACE[M.place];
    if (M.type === 'defense') return this.updateDefense(dt);
    if (M.phase === 'go' && place && !outsideBy(P, place, 0)) { M.phase = 'active'; if (M.type === 'raid' && M.recon >= 1) this.w.toast(`Recon: about ${this.w.ents.filter((e) => e.place === M.place && e.faction === 'compact' && e.alive).length} guards inside.`); }
    if (M.type === 'contract') this.updateContract(dt, M, place);
    if (M.type === 'council' && M.boss) { const up = M.pylons.filter((p) => p.alive).length; M.boss.shielded = up > 0; }
    if (M.phase === 'extract') {
      const v = P.vehicle;
      const out = place ? outsideBy(P, place, 4) : true;
      if (out || (v && M.vehicle)) this.succeed();
    }
  }

  updateContract(dt, M, place) {
    const S = this.w.S, P = this.w.player;
    switch (M.kind) {
      case 'scavenge': if (M.crates && M.phase === 'active' && M.crates.every((id) => this.w.opened[id] && S.day - this.w.opened[id] < 3)) this.succeed(); break;
      case 'rescue': if (M.prisoner) { if (!M.prisoner.alive) return this.fail('The prisoner died.'); if (M.freed) { const pr = M.prisoner; const d = dist(pr, P); if (d > 18) { const a = angleTo(pr, P); moveBox(this.w.Q, pr, Math.cos(a) * 3.2 * T * dt, Math.sin(a) * 3.2 * T * dt); pr.moving = true; } else pr.moving = false; if (outsideBy(P, place, 4) && outsideBy(pr, place, 2)) this.succeed(); } } break;
      case 'defend': if (M.contact) { if (!M.contact.alive) return this.fail('Your contact was killed.'); if (M.phase === 'active') { M.waveT -= dt; const alive = this.w.ents.filter((e) => e.raider && e.alive).length; if (M.waveT <= 0 && alive === 0) { if (M.wave >= M.waves) return this.succeed(); M.wave++; M.waveT = 8; const n = 3 + M.wave + Math.floor(M.contract.diff / 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; const q = this.freeNear(M.contact.x + Math.cos(a) * 9 * T, M.contact.y + Math.sin(a) * 7 * T, 2); const e = makeNPC(this.w, COMPOSITION.raiders[i % 4], q.x, q.y, { faction: 'wild', place: M.place, hostile: true, lookAs: 'rustjaw' }); e.raider = true; if (this.w.add(e)) startHunt(this.w, e, P); } this.w.toast(`Attackers inbound (wave ${M.wave}/${M.waves})!`, 'bad'); } } } break;
      case 'convoy': this.updateConvoy(dt, M); break;
      case 'delivery': if (!M.ambushed && M.phase === 'go' && Math.random() < dt * 0.01) { M.ambushed = true; for (let i = 0; i < 3; i++) { const q = this.freeNear(P.x + 8 * T, P.y, 3); const e = makeNPC(this.w, 'raider', q.x, q.y, { faction: 'wild', hostile: true, lookAs: 'rustjaw' }); if (this.w.add(e)) startHunt(this.w, e, P); } this.w.toast('Ambush on the road!', 'bad'); } break;
      default: break;
    }
  }

  updateConvoy(dt, M) {
    const P = this.w.player;
    if (!M.convoy) {
      const o = M.contract;
      const a = PLACE[o.from], b = PLACE[o.to];
      const ca = center(a), cb = center(b);
      if (Math.hypot(P.x - (ca.x + cb.x) / 2, P.y - (ca.y + cb.y) / 2) > 40 * T && Math.hypot(P.x - ca.x, P.y - ca.y) > 30 * T) return;
      const start = this.findRoad(ca, cb);
      if (!start) return;
      const path = astar(WORLD_W, WORLD_H, Math.floor(start.a.x / T), Math.floor(start.a.y / T), Math.floor(start.b.x / T), Math.floor(start.b.y / T), (x, y) => this.w.W.road[y * WORLD_W + x] > 0 || !this.w.Q.blocksMove(x, y), 6000) || [];
      const v = { id: 800001, kind: 'vehicle', type: 'convoy', convoy: true, x: start.a.x, y: start.a.y, angle: 0, speed: 0, path, pi: 0, alive: true, hittable: true, r: 12, faction: o.rival || 'compact', hp: 220 + o.diff * 30, maxHp: 220 + o.diff * 30 };
      M.convoy = v;
      this.w.vehicles.push(v);
      for (let i = 0; i < 2 + Math.floor(o.diff / 2); i++) { const q = this.freeNear(v.x, v.y, 2); const e = makeNPC(this.w, o.rival ? (COMPOSITION[o.rival] || ['raider'])[i % 3] : i % 3 === 2 ? 'shield' : 'militia', q.x, q.y, { faction: o.rival || 'compact', hostile: true, state: 'post' }); e.escort = true; this.w.add(e); }
      this.w.toast('The convoy is rolling. Intercept it!', 'mission');
      M.phase = 'active';
    }
    const v = M.convoy;
    if (v.hp > 0 && v.pi < v.path.length) {
      const [tx, ty] = v.path[v.pi];
      const gx = tx * T + 8, gy = ty * T + 8;
      const a = Math.atan2(gy - v.y, gx - v.x);
      v.angle = a;
      v.x += Math.cos(a) * 2.2 * T * dt; v.y += Math.sin(a) * 2.2 * T * dt;
      if (Math.hypot(gx - v.x, gy - v.y) < 6) v.pi++;
      for (const e of this.w.ents) if (e.escort && e.alive && e.ai.state !== 'hunt') { const d = dist(e, v); if (d > 24) { const b = angleTo(e, v); moveBox(this.w.Q, e, Math.cos(b) * e.speed * 0.9 * dt, Math.sin(b) * e.speed * 0.9 * dt); e.moving = true; } }
      if (v.pi >= v.path.length) return this.fail('The convoy got away.');
    }
    if (v.hp <= 0 && !M.cargo) { M.cargo = true; this.objs.push({ kind: 'cargo', x: v.x, y: v.y + 12, r: 22, label: 'Grab the cargo' }); this.w.toast('Convoy stopped! Grab the cargo.', 'good'); for (const e of this.w.ents) if (e.escort && e.alive) startHunt(this.w, e, P); }
  }

  findRoad(ca, cb) {
    const W = this.w.W;
    const near = (pt) => { let best = null, bd = Infinity; for (let y = Math.floor(pt.y / T) - 12; y <= Math.floor(pt.y / T) + 12; y++) for (let x = Math.floor(pt.x / T) - 12; x <= Math.floor(pt.x / T) + 12; x++) { if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H || W.road[y * WORLD_W + x] !== 1) continue; const d = Math.hypot(x * T - pt.x, y * T - pt.y); if (d < bd) { bd = d; best = { x: x * T + 8, y: y * T + 8 }; } } return best; };
    const a = near(ca), b = near(cb);
    return a && b ? { a, b } : null;
  }

  updateDefense(dt) {
    const S = this.w.S, M = this.M, P = this.w.player;
    const d = S.defense;
    if (!d) return this.cleanup();
    M.waveT -= dt;
    const raiders = this.w.ents.filter((e) => e.raider && e.alive);
    if (M.waveT <= 0 && raiders.length === 0 && M.wave < d.waves * (d.daybreak ? 1 : 1) + (d.daybreak ? 0 : 1)) {
      if (M.wave >= (d.daybreak ? d.waves : 2)) return this.finishDefense(true);
      this.spawnWave();
      M.waveT = 10;
    }
    // Raiders that reach the depot stash start stealing.
    const depot = this.w.W.layouts.hollow.buildings[0];
    const door = { x: depot.doors[0].x * T + 8, y: (depot.doors[0].y + 1) * T + 8 };
    for (const e of raiders) {
      if (e.ai.state !== 'hunt' || dist(e, P) > 9 * T) { const a = angleTo(e, door); moveBox(this.w.Q, e, Math.cos(a) * e.speed * 0.5 * dt, Math.sin(a) * e.speed * 0.5 * dt); e.moving = true; }
      if (dist(e, door) < 20) { M.steal += dt; if (M.steal > 8) return this.finishDefense(false); }
    }
    if (!P.alive) return this.finishDefense(false);
  }

  finishDefense(win) {
    const S = this.w.S;
    const d = S.defense;
    const res = resolveDefense(S, true, win);
    for (const e of this.w.ents) if (e.raider) { e.alive = false; e.deadT = 99; }
    this.w.ents = this.w.ents.filter((e) => !(e.faction === 'crew' && e.role === 'guard') && !e.turret);
    if (res && res.next) { this.M.wave = 0; this.M.waveT = 6; this.w.toast(`Next wave of ${d.name} in a few seconds...`, 'bad'); return; }
    this.cleanup();
    this.w.game.audio.setMood('hustle');
    if (win) { this.w.toast(res ? res.msg : 'Defense won.', 'good'); stat(S, 'defensesPlayed'); }
  }

  // ---------- hooks ----------
  onCrime() {}
  onAlarm(town) { const M = this.M; if (M && M.place === town) M.spotted = true; }
  onSpotted(e) { const M = this.M; if (M && (e.place === M.place)) M.spotted = true; }
  onKill(e, src) {
    const M = this.M;
    if (!M) return;
    if (e.place === M.place) M.kills++;
    if (e.raider && M.type === 'defense') { M.remain = Math.max(0, M.remain - 1); }
    if (M.targetEnt && e === M.targetEnt) { if (M.kind === 'assault') { this.w.S.towns[M.place].occupyReady = true; } M.phase = 'extract'; this.objective(M.kind === 'hit' ? 'Target down. Get clear.' : 'Commander down. Pull out.'); }
    if (e.objKind === 'target' && M.kind === 'sabotage') { M.targets--; this.objs = this.objs.filter((o) => o.ent !== e); this.w.combat.explode(e.x, e.y, 1.5 * T, 20, this.w.player); if (M.targets <= 0) { M.phase = 'extract'; this.objective('Targets wrecked. Get out.'); } }
    if (e.objKind === 'pylon') { this.objs = this.objs.filter((o) => o.ent !== e); this.w.toast('Pylon down!', 'good'); }
  }
  onCrewDown(e) { const c = e.crewRef; if (c) { c.hp = 0; c.injured = Math.max(c.injured, 3); this.w.toast(`${crewName(c)} is down! (out for a few days)`, 'bad'); } }
  onBossDown(e) {
    const M = this.M;
    const S = this.w.S;
    if (e.boss === 'compact') { winEnding(S, 'crown'); this.cleanup(); this.w.game.onEnding('crown'); return; }
    if (M && M.type === 'camp') { M.bossKilled = true; M.phase = 'extract'; this.objective('Their leader is down. Get out alive.'); }
    else bossDefeated(S, e.boss);
  }
  onExplosion(x, y, r) {
    const M = this.M;
    if (!M) return;
    for (const o of [...this.objs]) if (o.ent && o.ent.objKind === 'safe' && Math.hypot(o.ent.x - x, o.ent.y - y) < r + 8) this.openSafe(o.ent, true);
    if ((M.type === 'raid' || M.type === 'camp') && !M.looted) { const v = this.w.statics.find((s) => s.kind === 'vault' && s.place === M.place); if (v && Math.hypot(v.x - x, v.y - y) < r + 10) this.lootVault(v, true); }
  }
  onLoot() {}
  onPlayerDown() { if (this.M && this.M.type !== 'defense') this.fail('You went down. The job is blown.'); }

  // ---------- interactions ----------
  interact(f) {
    const M = this.M;
    if (!M) return false;
    if (f.kind === 'cargo') { this.objs = this.objs.filter((o) => o !== f); this.payout(); M.phase = 'extract'; this.succeed(); return true; }
    if (f.kind === 'drop') { this.succeed(); return true; }
    return false;
  }

  vaultInteract(f) {
    const S = this.w.S;
    const M = this.M;
    const place = PLACE[f.place];
    if (place.id === 'newhaven' && (!M || M.type !== 'council')) { this.w.toast('The Council vault is beyond you. For now.'); return; }
    if (!M || (M.type !== 'raid' && M.type !== 'camp') || M.place !== f.place) {
      if (S.mission) { this.w.toast('Finish your current job first.'); return; }
      if (place.kind === 'settlement' && S.towns[f.place].lootReady < 0.3) { this.w.toast('Empty. They are still recovering from the last hit.'); return; }
      S.mission = { type: place.kind === 'camp' ? 'camp' : 'raid', target: f.place, place: f.place, approach: 'stealth', inside: false, recon: 0, crew: [], phase: 'active', spotted: false, kills: 0, day: S.day, title: `Rob the ${place.hq ? place.hq.name : place.name}`, adhoc: true };
      this.objective('Improvised robbery: crack it and get out of town.');
    }
    if (M && M.looted) { this.w.toast('Already emptied.'); return; }
    this.w.game.startMinigame('safe', { vault: f, recon: (this.M && this.M.recon) || 0 });
    this.w.crime('safecracking', f.x, f.y);
  }

  lootVault(v, blown) {
    const S = this.w.S;
    const M = this.M;
    if (!M || M.looted) return;
    M.looted = true;
    const place = PLACE[v.place];
    if (place.kind === 'camp') {
      const r = Object.values(S.rivals).find((x) => x.camp === v.place);
      M.cash = Math.round(r.wealth * 0.6 + 400);
      earn(S, 'carried', M.cash, 'raids');
      r.wealth = Math.max(0, r.wealth - M.cash);
    } else {
      const L = vaultLoot(S, v.place);
      earn(S, 'carried', L.dirty, 'raids');
      for (const [k, n] of Object.entries(L.items)) S.player.carry[k] = (S.player.carry[k] || 0) + n;
      M.cash = L.dirty;
    }
    this.w.R.fx.coins(v.x, v.y, 14);
    this.w.sfx('kaching');
    if (blown) this.w.alertTown(v.place);
    M.phase = 'extract';
    this.objective(`Vault cracked: $${M.cash}. Now get out of ${place.name}!`);
  }

  openSafe(ent, blown) {
    const M = this.M;
    if (!M || !ent.alive) return;
    ent.alive = false;
    this.objs = this.objs.filter((o) => o.ent !== ent);
    this.payout();
    M.phase = 'extract';
    this.objective('Got it. Now get out.');
    if (blown) this.w.alertTown(M.place);
  }

  objectiveInteract(ent) {
    const M = this.M;
    if (!M) return;
    if (ent.objKind === 'safe') return this.w.game.startMinigame('safe', { objective: ent });
    if (ent.objKind === 'free') return this.w.game.startMinigame('lock', { prisoner: ent });
    if (ent.objKind === 'target') { this.w.toast('Charge planted... 3 seconds!'); const e = ent; setTimeout(() => { if (e.alive) { e.hp = 0; this.w.kill(e, this.w.player); } }, 3000); return; }
    if (ent.objKind === 'collect') return this.w.game.openInteraction({ kind: 'debtor', ent });
  }

  freePrisoner(ent) { const M = this.M; if (!M) return; ent.objective = false; M.freed = true; M.phase = 'extract'; this.objective('They are free. Walk them out of there.'); }

  collectDebt(ok) {
    const M = this.M;
    if (!M) return;
    M.debtor.objective = false;
    if (ok) { M.phase = 'extract'; this.succeed(); return; }
    for (let i = 0; i < 2; i++) { const q = this.freeNear(M.debtor.x, M.debtor.y, 2); const e = makeNPC(this.w, 'scav', q.x, q.y, { faction: 'wild', hostile: true }); if (this.w.add(e)) startHunt(this.w, e, this.w.player); e.markTarget = true; M.targetEnt = e; }
    this.w.toast('The debtor called his friends. Make them regret it.', 'bad');
  }

  payout() {
    const M = this.M;
    if (!M || M.type !== 'contract' || M.paid) return;
    M.paid = true;
  }

  succeed() {
    const S = this.w.S, M = this.M;
    if (!M || M.phase === 'done') return;
    M.phase = 'done';
    if (M.type === 'raid') {
      if (!M.looted) { this.cleanup(); return; }
      raidAftermath(S, M.place, M.approach === 'assault' || M.spotted ? 'assault' : 'stealth', M.kills);
      if (!M.spotted) { stat(S, 'ghostRaids'); this.w.toast('Ghost raid: nobody ever saw you.', 'good'); }
      this.w.toast(`Clean getaway from ${PLACE[M.place].name}! (+heat, +REP)`, 'good');
    } else if (M.type === 'camp') {
      if (M.looted || M.bossKilled) campHit(S, M.place, !!M.bossKilled, M.looted ? 0 : 0.5);
    } else if (M.type === 'contract') {
      finishContract(S, M.contract, true, { stealthy: !M.spotted });
      if (M.kind === 'delivery' && CONTRACT[M.contract.tpl].need) { /* need already handled on accept */ }
    }
    fx(S, 'missionDone', { ok: true, title: M.title });
    this.cleanup();
  }

  fail(reason) {
    const S = this.w.S, M = this.M;
    if (!M) return;
    if (M.type === 'contract') finishContract(S, M.contract, false, {});
    log(S, `MISSION FAILED: ${M.title}. ${reason}`, 'bad');
    fx(S, 'missionDone', { ok: false, title: M.title });
    this.cleanup();
  }

  // ---------- drawing ----------
  drawables() {
    const out = [];
    const M = this.M;
    for (const m of this.marks) out.push({ sy: m.y - 50, draw: (ctx, cx, cy) => { ctx.strokeStyle = SEM.enemy; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(m.t * 12); ctx.beginPath(); ctx.ellipse(Math.round(m.x - cx), Math.round(m.y - cy), 2 * T * (1 - m.t / 3), T * (1 - m.t / 3), 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; } });
    for (const o of this.objs) {
      const e = o.ent;
      if (e && !e.alive) continue;
      out.push({ sy: (e ? e.y : o.y), draw: (ctx, cx, cy) => {
        const x = Math.round((e ? e.x : o.x) - cx), y = Math.round((e ? e.y : o.y) - cy);
        if (e && e.objKind !== 'free' && e.objKind !== 'collect') { ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(x - 6, y - 12, 12, 12); ctx.fillStyle = e.objKind === 'pylon' ? RAMPS.teal[3] : e.objKind === 'target' ? RAMPS.heat[2] : RAMPS.ink[3]; ctx.fillRect(x - 5, y - 11, 10, 10); if (e.maxHp > 1) { ctx.fillStyle = SEM.enemy; ctx.fillRect(x - 6, y - 15, Math.round(12 * e.hp / e.maxHp), 2); } }
        const bob = Math.round(Math.sin(this.w.time * 5) * 2);
        ctx.fillStyle = RAMPS.gold[3]; ctx.fillRect(x - 1, y - 26 + bob, 3, 5); ctx.fillRect(x - 3, y - 26 + bob, 7, 2);
      } });
    }
    if (M && M.targetEnt && M.targetEnt.alive) { const t = M.targetEnt; out.push({ sy: t.y + 1, draw: (ctx, cx, cy) => drawText(ctx, '▼', Math.round(t.x - cx), Math.round(t.y - cy) - 38, SEM.enemy, { align: 'center', shadow: RAMPS.ink[0] }) }); }
    return out;
  }
}

export { center, outsideBy, combatPower, rivalPower, addRep, addHeat, addItem };
