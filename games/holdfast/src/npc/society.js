// Everyone who isn't you or dead: your camp, the strangers on the roads and
// the raider crews. Owns the NPC list and the shared services their brains
// use (paths, sight, shooting, who's a threat), followers, and the fires.
import * as THREE from 'three';
import { NPC } from './npc.js';
import { maxHealthOf } from '../condition.js';
import { Camp } from './camp.js';
import { Speech } from './dialogue.js';
import { makePerson, registerLeader } from './people.js';
import { profilePalette } from '../survivor.js';
import { Raiders } from './raiders.js';
import { Strangers } from './strangers.js';
import { Missions } from './missions.js';
import { Jobs } from './jobs.js';
import { WorldNav } from './worldnav.js';
import { Tactics } from './tactics.js';
import { NpcUI } from './ui.js';
import { rollLoot, GUNS } from '../items.js';

const v3 = new THREE.Vector3();

export class Society {
  constructor(game) {
    this.game = game;
    this.speech = new Speech();
    this.npcs = [];
    this.trail = [];
    this.lootables = [];
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7 });
    this.camp = new Camp(this);
    this.raiders = new Raiders(this);
    this.strangers = new Strangers(this);
    this.missions = new Missions(this);
    this.jobs = new Jobs(this);
    this.ui = new NpcUI(this);
    this.fires = new Fires(this);
    // routes anywhere on the map, a few new searches a frame
    this.nav = new WorldNav(game);
    this.pathBudget = 3;
    this.tactics = new Tactics(this);
    // edits to the camp's structure rebuild its stations and paths
    const w = game.world, attach = w.attach.bind(w);
    w.attach = (S) => { attach(S); if (this.camp.claim && this.camp.claim.structure === S) this.camp.dirty = true; };
  }
  get clock() { return (this.game.day - 1) * 24 + this.game.sky.time; }
  playerName() { return this.game.profile ? this.game.profile.name : 'friend'; }
  spawn(person, opts) { const n = new NPC(this, person, opts); this.npcs.push(n); return n; }
  drop(n) {
    n.dispose();
    this.ui.forget(n);
    this.npcs = this.npcs.filter((o) => o !== n);
  }

  // ---------------- services for brains ----------------
  takePath() { if (this.pathBudget > 0) { this.pathBudget--; return true; } return false; }
  navFor(ax, az, bx, bz) {
    const nav = this.camp.nav;
    if (nav && nav.contains(ax, az) && nav.contains(bx, bz)) return nav;
    return null;
  }
  near(npc, r) {
    const out = [];
    for (const o of this.npcs) {
      if (o === npc || o.dead || o.mode === 'away' || o.controlled) continue;
      const dx = o.pos.x - npc.pos.x, dz = o.pos.z - npc.pos.z;
      if (dx * dx + dz * dz < r * r) out.push(o);
    }
    return out;
  }
  bubble(npc, text, dur) {
    this.ui.bubble(npc, text, dur);
    // what you hear goes in the Overheard log
    if (npc.faction !== 'stranger' && this.playerNear(npc.pos, 30) && !this.ui.talking) {
      const o = this.camp.overheard;
      o.push({ day: this.game.day, time: this.game.sky.time, who: npc.faction === 'raider' ? `${npc.first} (${npc.rcamp ? npc.rcamp.name : 'raider'})` : npc.person.name, text });
      if (o.length > 60) o.shift();
    }
  }
  playerNear(pos, r) { const p = this.game.player.pos; return Math.hypot(p.x - pos.x, p.z - pos.z) < r; }
  notice(text, npc) { this.game.hud.toast(text, 4.5); }
  // nothing solid between two points at chest height
  clear(a, b, h = 1.2) {
    const ox = a.x, oy = a.y + h, oz = a.z;
    const dx = b.x - ox, dy = b.y + h - oy, dz = b.z - oz, len = Math.hypot(dx, dy, dz);
    if (len < 0.3) return true;
    const hit = this.game.physics.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len, { skipGlass: true, noTerrain: false,
      filter: (bx) => bx.kind !== 'door' && bx.kind !== 'walk' && bx.kind !== 'tree' });
    return hit.dist >= len - 0.3;
  }
  onScreen(pos, maxD = 60) {
    const cam = this.game.camera;
    v3.set(pos.x, pos.y + 1, pos.z);
    if (v3.distanceTo(cam.position) > maxD) return false;
    v3.project(cam);
    return v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
  }
  // the thing near an NPC that most needs dealing with: the dead on top of
  // a friend first, then whatever's coming for them, then the nearest; a
  // target already being fought keeps a little priority so they don't
  // flip-flop
  threatNear(m, r, pos = m.pos) {
    const pl = this.game.player;
    let best = null, bs = Infinity;
    for (const z of this.game.zombies.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z);
      if (d >= r || Math.abs(z.pos.y - pos.y) > 2.5 || !(z.state === 'chase' || d < 7)) continue;
      let s = d;
      const prey = z.prey;
      if (prey === m) s -= 3;
      else if (prey && prey !== m && (prey === pl || prey.faction === m.faction) && !prey.dead) s -= Math.hypot(z.pos.x - prey.pos.x, z.pos.z - prey.pos.z) < 2.2 ? 6 : 1;
      if (m.combatTarget === z) s -= 1.5;
      if (z.health < 30) s -= 0.8;
      if (s < bs) { bs = s; best = z; }
    }
    for (const o of this.npcs) {
      if (o.dead || o === m || o.downed || !this.enemies(m, o)) continue;
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
      if (d >= r * 1.6 || Math.abs(o.pos.y - pos.y) > 3) continue;
      let s = d / 1.6;
      const ct = o.combatTarget;
      if (ct && (ct === m || ct === pl || ct.faction === m.faction)) s -= 2.5;
      if (m.combatTarget === o) s -= 1.5;
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }
  enemies(a, b) {
    const fa = a.faction, fb = b.faction;
    if (fa === fb) return false;
    if (fa === 'raider') return b.faction === 'camp' ? a.isHostile : b.angry && a.isHostile;
    if (fb === 'raider') return b.isHostile;
    if (fa === 'stranger') return a.angry && fb === 'camp';
    if (fb === 'stranger') return b.angry;
    return false;
  }
  // how they fight: see tactics.js
  fight(m, t, dt) { return this.tactics.fight(m, t, dt); }
  // one shot from an NPC's gun: every pellet rolls to hit; shotguns
  // catch whatever is crowded around the target too
  shoot(m, t) {
    if (t.dead) return;
    const g = this.game, def = m.gunDef || GUNS['1911'];
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    const sk = m.skill('shooting');
    const moving = t.vel ? Math.hypot(t.vel.x, t.vel.z) : 0;
    const fall = Math.max(0, d - def.range) / def.range;
    const base = def.pellets > 1 ? Math.max(0.15, 0.95 - d / (def.range * 1.3)) : 0.5 + sk * 0.12 - d / (def.range * 1.6) - def.spread * 2;
    const self = Math.hypot(m.vel.x, m.vel.z);
    const p = Math.max(0.1, Math.min(0.92, base - moving * 0.04 - g.sky.darkness * 0.12 - fall * 0.3 - (self > 0.8 ? 0.12 : 0)));
    m.items.group.updateMatrixWorld(true);
    const from = this.items_muzzle(m);
    let hits = 0;
    for (let i = 0; i < def.pellets; i++) if (Math.random() < p) hits++;
    const lines = Math.min(3, def.pellets);
    for (let i = 0; i < lines; i++) {
      const to = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z);
      if (!hits || i > 0) to.add(new THREE.Vector3((Math.random() - 0.5) * (1 + def.pellets * 0.15), (Math.random() - 0.3) * 1.0, (Math.random() - 0.5) * (1 + def.pellets * 0.15)));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), this.tracerMat);
      g.scene.add(line);
      this.tracers.push({ line, t: 0.06 });
    }
    const pd = Math.hypot(g.player.pos.x - m.pos.x, g.player.pos.z - m.pos.z);
    if (pd < 160) g.audio && g.audio.gunshot(Math.max(0.15, 1 - pd / 160) * Math.min(1.2, def.noise / 75));
    const hurtIt = (x, dmg) => {
      const ex = x.pos.x - m.pos.x, ez = x.pos.z - m.pos.z, ed = Math.hypot(ex, ez) || 1;
      if (x.hurt) x.hurt(dmg, ex / ed, ez / ed, def.knock ? 'melee' : 'shot');
      // people take cover and keep moving: gunfire between people is less sure than at the dead
      else x.damage(x === g.player ? dmg * 0.45 : Math.min(60, dmg * 0.7), m);
    };
    if (hits) {
      const head = def.pellets === 1 && Math.random() < 0.1 + sk * 0.04;
      hurtIt(t, def.dmg * hits * (head ? 2.4 : 1) * (1 - Math.min(0.6, fall * 0.5)) * (m.faction === 'raider' ? 0.8 : 1));
    }
    // a shotgun blast hits the crowd around the target too
    if (def.pellets > 1 && t.hurt) {
      for (const z of g.zombies.list) {
        if (z === t || z.dead) continue;
        const zx = z.pos.x - m.pos.x, zz = z.pos.z - m.pos.z, zd = Math.hypot(zx, zz);
        if (zd > def.range || (zx * dx + zz * dz) / (zd * d) < 0.93) continue;
        const k = Math.floor(def.pellets * (0.25 + Math.random() * 0.3));
        if (k) hurtIt(z, def.dmg * k);
      }
    }
    g.zombies.alertNoise(m.pos, def.noise * 0.6);
    this.raiders.hear(m.pos, def.noise, m);
  }
  items_muzzle(m) {
    if (m.items.group.visible && m.items.muzzle) return m.items.muzzle.clone().applyMatrix4(m.items.group.matrixWorld);
    return new THREE.Vector3(m.pos.x + Math.sin(m.facing) * 0.4, m.pos.y + 1.35, m.pos.z + Math.cos(m.facing) * 0.4);
  }
  // living people (not in a building far away) the dead can smell
  humansNear(pos, r) {
    const out = [];
    for (const o of this.npcs) {
      if (o.dead || o.mode === 'away' || o.controlled || !o.char.root.visible) continue;
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
      if (d < r) out.push([d, o]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, 3).map((e) => e[1]);
  }
  // player weapons can hit these
  hittable() { return this.npcs.filter((o) => !o.dead && o.faction !== 'camp' && o.mode !== 'away'); }
  onDeath(npc, src) {
    if (npc.faction === 'camp') this.camp.onDeath(npc, src);
    else if (npc.faction === 'raider') this.raiders.onDeath(npc, src);
    else this.strangers.onDeath(npc, src);
    for (const o of this.npcs) if (o.combatTarget === npc) o.combatTarget = null;
  }
  onPlayerHit(npc) {
    if (npc.faction === 'raider') this.raiders.provoked(npc);
    else if (npc.faction === 'stranger') this.strangers.provoked(npc);
  }
  // a follower who searches beside you finds more
  searchBonus(item) {
    const g = this.game, p = g.player.pos;
    const out = [];
    const f = this.npcs.find((o) => o.mode === 'follow' && !o.dead && o.skill('scavenging') >= 2 && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 14);
    if (f && Math.random() < 0.35 + f.skill('scavenging') * 0.08) {
      const { got } = g.giveLoot(f, rollLoot(item.table, 0.7));
      if (got.length) { out.push(`${f.first} turned up ${got.join(', ')}`); if (Math.random() < 0.5) f.say(this.speech.line(f, 't_loot')); }
    }
    this.missions.onSearched(item);
    this.raiders.onSearched(item);
    return out;
  }

  // ---------------- followers ----------------
  followBrain(m, dt, near) {
    m.locked = false;
    if (m.rescue) return this.rescueBrain(m, dt);
    // told to go after something
    if (m.orderTarget) { if (!m.orderTarget.dead && !(m.orderTarget.downed && m.orderTarget.faction !== 'raider')) return this.fight(m, m.orderTarget, dt); m.orderTarget = null; }
    if (m.task) { if (m.task.slot && m.task.slot.user === m) m.task.slot.user = null; m.task = null; }
    m.sleeping = false;
    const pl = this.game.player, pp = pl.pos;
    if (m.healing) return this.healBrain(m, dt);
    if (m.anim.act && !m.convo) m.setAct(null);
    let threat = this.threatNear(m, 15) || this.threatNear(m, 11, pp);
    // don't get dragged off chasing things far from you
    const lead = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
    if (threat && lead > 24 && threat.prey !== m && Math.hypot(threat.pos.x - pp.x, threat.pos.z - pp.z) > 14) threat = null;
    const coward = m.tr.bravery < 0.3 && m.health < 45;
    if (threat && !coward) {
      if (!m.combatTarget && Math.random() < 0.3) m.say(this.speech.line(m, threat.hurt ? 't_zombie' : 't_raiders'));
      this.fight(m, threat, dt);
      return;
    }
    if (m.combatTarget && !threat && Math.random() < 0.25) m.say(this.speech.line(m, 't_kill'));
    m.combatTarget = null; m.aiming = false; m.faceTarget = null;
    m.crouch = pl.crouch;
    this.tactics.idle(m, dt);
    // standing where you're aiming: step out of the way
    if (pl.aiming && !pl.released && !m.path) {
      const yaw = this.game.tpc.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = m.pos.x - pp.x, rz = m.pos.z - pp.z, along = rx * fx + rz * fz, across = rx * fz - rz * fx;
      if (along > 0.5 && along < 25 && Math.abs(across) < 1.3) {
        const sgn = across >= 0 ? 1 : -1, p = { x: m.pos.x + fz * sgn * 2, y: m.pos.y, z: m.pos.z - fx * sgn * 2 };
        if (this.nav.lineClear(m.pos, p)) { m.goTo(p.x, p.y, p.z, true); m.followT = 1.2; }
      }
    }
    const d = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z), dy = Math.abs(pp.y - m.pos.y);
    // left far behind: catch up out of sight
    if ((d > 55 || (dy > 5 && d > 18)) && !this.onScreen(m.pos)) { this.placeNearPlayer(m); return; }
    // a medic patches you up when you're hurting
    if (m.skill('medicine') >= 2 && pl.health < pl.maxHealth * 0.5 && !pl.dead && this.clock > (m.healCd || 0) && !threat) {
      m.healing = { t: 0 }; m.say(m.tr.warmth > 0.6 ? "You're bleeding. Hold still, let me look." : 'Stop moving. You’re hurt.');
      return;
    }
    const idx = this.npcs.filter((o) => o.mode === 'follow').indexOf(m);
    const keep = 2.2 + idx * 0.9;
    m.followT = (m.followT || 0) - dt;
    if (m.followT <= 0) {
      m.followT = 0.4;
      if (d > keep + 0.8 || dy > 1.2) {
        const spot = this.followSpot(m, idx, keep);
        m.goTo(spot.x, spot.y, spot.z, d > 7 || pl.speed > 4);
      } else if (d < keep) m.stop();
    }
    if (!m.path) { m.lookAt = d < 8 ? pp : null; if (d < 3 && Math.hypot(pl.vel.x, pl.vel.z) < 0.2) m.faceTarget = pp; }
    m.chatT = (m.chatT ?? 30 + Math.random() * 40) - dt;
    if (m.chatT <= 0) {
      m.chatT = 50 + Math.random() * 70;
      const c = this.camp.center();
      const far = c && Math.hypot(c.x - pp.x, c.z - pp.z) > 200;
      const t = far && Math.random() < 0.5 ? this.speech.line(m, 't_far') : Math.random() < 0.5 ? this.speech.flavor(m) : this.speech.line(m, 'o_small');
      if (t && !this.ui.talking) m.say(t);
    }
  }
  healBrain(m, dt) {
    const pl = this.game.player, pp = pl.pos;
    const d = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
    if (this.threatNear(m, 10)) { m.healing = null; m.setAct(null); return; }
    if (d > 1.3) { if (!m.path || (m.healRepath = (m.healRepath || 0) - dt) <= 0) { m.healRepath = 0.4; m.goTo(pp.x, pp.y, pp.z, d > 5); } return; }
    m.stop(); m.faceTarget = pp; m.setAct('inspect');
    m.healing.t += dt;
    if (m.healing.t > 2.4) {
      const n = 22 + m.skill('medicine') * 8;
      pl.heal(n);
      m.healing = null; m.setAct(null);
      m.healCd = this.clock + 2;
      m.say(['There. Try not to do that again.', 'Patched. You owe me.', "That'll hold. Keep it clean.", 'Done. Go easy for a bit.'][Math.floor(Math.random() * 4)]);
      this.game.hud.toast(`${m.first} patched you up (+${n} health)`, 2.5);
      m.adjust('player', 0.02);
    }
  }
  // where a follower should stand: a few steps back along the way you came
  // (always somewhere you could walk), a little to one side
  followSpot(m, idx, keep) {
    const pp = this.game.player.pos, tr = this.trail;
    let acc = 0, prev = pp, at = null;
    for (let i = tr.length - 1; i >= 0; i--) {
      const t = tr[i];
      if (Math.abs(t.y - pp.y) > 1.5) break;
      acc += Math.hypot(t.x - prev.x, t.z - prev.z);
      prev = t;
      if (acc >= keep) { at = t; break; }
    }
    if (!at) at = prev !== pp ? prev : pp;
    // a little apart from each other
    const dx = pp.x - at.x, dz = pp.z - at.z, d = Math.hypot(dx, dz) || 1;
    const side = idx === 0 ? 0 : (idx % 2 ? 0.8 : -0.8) * Math.ceil(idx / 2);
    const sp = { x: at.x - dz / d * side, y: at.y, z: at.z + dx / d * side };
    return side && this.nav.lineClear(at, sp) ? sp : { x: at.x, y: at.y, z: at.z };
  }
  // the way you came: through the doors and halls you walked, ending a
  // few steps short of you
  trailPath(m, keep) {
    const pp = this.game.player.pos, tr = this.trail;
    const d = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
    const stopAt = (p) => Math.hypot(p.x - pp.x, p.z - pp.z) < keep && Math.abs(p.y - pp.y) < 1;
    if (d < 10 && Math.abs(pp.y - m.pos.y) < 0.8 && this.clear(m.pos, pp, 0.9)) {
      const k = (d - keep) / d;
      return [{ x: m.pos.x + (pp.x - m.pos.x) * k, y: pp.y, z: m.pos.z + (pp.z - m.pos.z) * k }];
    }
    let bi = -1, bd = 1e9;
    for (let i = 0; i < tr.length; i++) {
      const t = tr[i], dd = Math.hypot(t.x - m.pos.x, t.z - m.pos.z) + Math.abs(t.y - m.pos.y) * 2;
      if (dd < bd) { bd = dd; bi = i; }
    }
    if (bi < 0 || bd > 8) return [{ x: pp.x, y: pp.y, z: pp.z }];
    const out = [];
    for (let i = bi + 1; i < tr.length; i++) { if (stopAt(tr[i])) break; out.push(tr[i]); }
    if (!out.length) out.push(tr[Math.min(tr.length - 1, bi + 1)]);
    return out;
  }
  placeNearPlayer(m) {
    const pp = this.game.player.pos, tr = this.trail;
    let at = null;
    for (let i = tr.length - 4; i >= Math.max(0, tr.length - 14); i--) { if (!this.onScreen(tr[i])) { at = tr[i]; break; } }
    if (!at) at = { x: pp.x - Math.sin(this.game.tpc.yaw) * 3, y: pp.y, z: pp.z - Math.cos(this.game.tpc.yaw) * 3 };
    m.pos.set(at.x, this.game.physics.groundAt(at.x, at.z, at.y + 0.6), at.z);
    m.visualY = m.pos.y; m.stop(); m.vel.set(0, 0, 0);
  }
  waitBrain(m, dt, near) {
    m.locked = false;
    if (m.rescue) return this.rescueBrain(m, dt);
    if (m.orderTarget) { if (!m.orderTarget.dead) return this.fight(m, m.orderTarget, dt); m.orderTarget = null; }
    // walking to where they were sent
    if (m.path && m.waitAt) { m.combatTarget = null; m.aiming = false; if (m.anim.act) m.setAct(null); const t = this.threatNear(m, 6); if (t) return this.fight(m, t, dt); return; }
    const threat = this.threatNear(m, 12);
    if (threat) return this.fight(m, threat, dt);
    m.combatTarget = null; m.aiming = false; m.faceTarget = null;
    this.tactics.idle(m, dt);
    if (m.waitAt && !m.path && Math.hypot(m.waitAt.x - m.pos.x, m.waitAt.z - m.pos.z) > 1.5) m.goTo(m.waitAt.x, m.waitAt.y, m.waitAt.z);
    if (!m.path && !m.anim.act) m.setAct(['idle_crossed', 'lean', 'idle_hips', 'smoke'][m.person.seed % (m.smoker ? 4 : 3)], m.smoker && m.person.seed % 4 === 3 ? 'cigarette' : null);
    m.lookAt = this.playerNear(m.pos, 10) ? this.game.player.pos : null;
  }
  // someone went down: the nearest friend (a medic if there is one) runs over
  onDowned(m, src) {
    if (m.faction !== 'camp') return;
    this.camp.log(`${m.person.name} went down${src && src.hurt ? ' under the dead' : src && src.faction === 'raider' ? ' in a firefight' : ''}.`, 'hurt');
    this.notice(this.playerNear(m.pos, 60) ? `${m.first} is down! Get to them (hold ${this.game.quality.mobile ? 'Use' : 'E'}).` : `${m.first} is down at camp.`);
    const helpers = this.camp.members.filter((o) => o !== m && !o.dead && !o.downed && !o.rescue && ['camp', 'follow', 'wait'].includes(o.mode) && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 45);
    helpers.sort((a, b) => (b.skill('medicine') - a.skill('medicine')) * 8 + Math.hypot(a.pos.x - m.pos.x, a.pos.z - m.pos.z) - Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z));
    const h = helpers.find((o) => o.tr.bravery > 0.3 || o.rel(m.person.id) > 0.3) || helpers[0];
    if (h) { h.rescue = m; h.say(`${m.first}! Hang on, I'm coming!`); }
  }
  rescueBrain(m, dt) {
    const v = m.rescue;
    if (!v || v.dead || !v.downed) { m.rescue = null; m.rescueT = 0; if (m.anim.act === 'kneel_work') m.setAct(null); return; }
    if (m.task && m.task.slot && m.task.slot.user === m) m.task.slot.user = null;
    m.task = null; m.sleeping = false;
    const threat = this.threatNear(m, 5);
    if (threat) return this.fight(m, threat, dt);
    m.combatTarget = null; m.aiming = false;
    const d = Math.hypot(v.pos.x - m.pos.x, v.pos.z - m.pos.z);
    if (d > 1.15) {
      m.rescueRepath = (m.rescueRepath || 0) - dt;
      if (!m.path || m.rescueRepath <= 0) { m.rescueRepath = 0.6; m.goTo(v.pos.x + 0.7, v.pos.y, v.pos.z, true); }
      if (m.anim.act) m.setAct(null);
      return;
    }
    m.stop(); m.faceTarget = v.pos; m.setAct('kneel_work');
    m.rescueT = (m.rescueT || 0) + dt;
    if (m.rescueT > 3.2) {
      m.rescueT = 0; m.rescue = null; m.setAct(null);
      v.revive(m);
      m.say(m.skill('medicine') >= 2 ? 'Pressure on it. You\u2019ll live.' : 'Up. Come on, up. I\u2019ve got you.');
      this.camp.log(`${m.person.name} got ${v.person.name} back on their feet.`, 'hurt');
    }
  }
  leave(m) {
    this.camp.remove(m);
    m.mode = 'leaving';
    const c = this.camp.center() || m.pos;
    const a = Math.random() * Math.PI * 2;
    const tx = c.x + Math.cos(a) * 140, tz = c.z + Math.sin(a) * 140;
    m.brain = (dt) => {
      m.locked = false; m.setAct(null);
      if (!m.path) m.goTo(tx, this.game.world.terrain.height(tx, tz), tz);
      if (!this.playerNear(m.pos, 90) || Math.hypot(m.pos.x - tx, m.pos.z - tz) < 3) m.gone = true;
    };
  }

  // a new camp member near the camp (debugging and tests)
  addMember(opts = {}) {
    const p = makePerson(Math.random, this.camp.usedBackgrounds(), { lastNames: this.camp.usedLastNames(), firstNames: this.camp.usedFirstNames(), ...opts });
    const c = this.camp.center() || this.game.player.pos;
    const n = this.spawn(p, { x: c.x + 3, z: c.z + 3, y: c.y, faction: 'camp', mode: this.camp.claim ? 'camp' : 'follow' });
    n.rels.player = 0.15;
    this.camp.add(n, true);
    n.mode = this.camp.claim ? 'camp' : 'follow';
    return n;
  }

  // the leader's body (made from the survivor screen), created once
  ensureLeader(p) {
    registerLeader(p);
    const model = p.model === 'woman' ? 'woman' : 'man', palette = profilePalette(p);
    let L = this.camp.members.find((m) => m.leader && !m.dead);
    if (L) {
      L.person.name = p.name;
      if (L.person.model !== model || L.person.palette.join() !== palette.join()) L.setLook(model, palette);
      return L;
    }
    const at = this.game.player.pos;
    const person = { id: 'LEADER', name: p.name, model, age: 33, palette, personality: 'rock', background: 'leader', role: 'guard', kin: '', kinRel: '', story: 0, seed: 7, leader: true };
    L = this.spawn(person, { x: at.x, y: at.y, z: at.z, faction: 'camp', mode: 'controlled', weapon: 'bat' });
    this.camp.add(L);
    L.mode = 'controlled';
    return L;
  }
  // after loading: back into whoever you were playing
  restoreControl(id) {
    const g = this.game;
    const b = (id && this.camp.members.find((m) => m.person.id === id && !m.dead)) || this.camp.members.find((m) => m.leader && !m.dead);
    if (b) { g.player.body && (g.player.body.controlled = false); g.player.body = null; g.switchTo(b, true); }
    // only one of them is yours
    const home = this.camp.claim;
    for (const m of this.camp.members) if (m !== b && (m.controlled || m.mode === 'controlled')) { m.controlled = false; m.mode = home && this.camp.inside(m.pos.x, m.pos.z, 2) ? 'camp' : home ? 'travel' : 'follow'; }
  }

  // ---------------- new game ----------------
  // two people you found on the first morning
  startingCompanions(near) {
    const used = new Set();
    const rng = Math.random;
    const roles = [['cook', 'medic', 'farmer'], ['guard', 'builder', 'mechanic', 'scavenger', 'hunter']];
    const out = [];
    for (let i = 0; i < 2; i++) {
      const p = makePerson(rng, used, { roles: roles[i], lastNames: new Set(out.map((o) => o.person.name.split(' ').slice(-1)[0])), firstNames: new Set(out.map((o) => o.first)) });
      used.add(p.background);
      const a = -Math.PI / 2 + (i ? 0.9 : -0.9);
      const x = near.x + Math.cos(a) * 3, z = near.z + Math.sin(a) * 3;
      const n = this.spawn(p, { x, z, y: near.y, faction: 'camp', mode: 'follow' });
      n.rels.player = 0.2 + Math.random() * 0.15;
      this.camp.add(n);
      n.mode = 'follow';
      out.push(n);
    }
    // they've known each other a few days
    out[0].adjust(out[1].person.id, 0.15); out[1].adjust(out[0].person.id, 0.15);
    out[0].knows[out[1].person.id] = 1; out[1].knows[out[0].person.id] = 1;
    this.camp.log(`${out[0].person.name} and ${out[1].person.name} threw in with you on the road.`, 'join');
    setTimeout(() => out[0].say(this.speech.line(out[0], 'joined', { player: this.playerName() })), 2500);
    return out;
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game, p = g.player;
    this.pathBudget = 3;
    this.trimT = (this.trimT || 0) - dt;
    if (this.trimT <= 0) { this.trimT = 20; this.nav.trim(); }
    // the player's trail, for followers to retrace through doors and halls
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(p.pos.x - last.x, p.pos.z - last.z) > 25) this.trail.length = 0;
    if (!p.dead && p.onGround && (!last || Math.hypot(p.pos.x - last.x, p.pos.z - last.z) > 0.6 || Math.abs(p.pos.y - last.y) > 0.35)) {
      this.trail.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z });
      if (this.trail.length > 140) this.trail.shift();
    }
    // the first claim is home
    const claim = g.claims.list[0] || null;
    if (claim !== this.camp.claim) {
      const had = !!this.camp.claim;
      this.camp.setClaim(claim);
      if (claim) for (const m of this.camp.members) {
        if (m.mode === 'follow' && !had) { m.mode = 'camp'; m.task = null; }
      }
      if (claim && !had && this.camp.members.length) {
        const m = this.camp.members.find((x) => !x.dead);
        m && m.say(m.tr.optimism > 0.5 ? "This'll do. I'll start setting up." : 'Fine. Here it is, then.');
        this.camp.log(`You planted a flag. The camp has a home.`, 'camp');
      }
      if (!claim) for (const m of this.camp.members) if (m.mode === 'camp' || m.mode === 'travel') { m.mode = 'follow'; m.task = null; m.setAct(null); }
    }
    this.camp.update(dt);
    this.raiders.update(dt);
    this.strangers.update(dt);
    this.missions.update(dt);
    this.jobs.update(dt);
    const far = g.quality.level === 'low' ? 85 : 120;
    // the world is alive around you, and wherever you're looking from above
    const cf = g.command && g.command.active ? g.command.focusPoint : null;
    for (const n of [...this.npcs]) {
      const d = Math.min(Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z), cf ? Math.hypot(n.pos.x - cf.x, n.pos.z - cf.z) : Infinity);
      const keep = n.update(dt, d < far);
      if (!keep || n.gone) this.drop(n);
    }
    if (this.lootables.length > 30) this.lootables = this.lootables.filter((l) => !l.searched && this.clock < (l.until ?? Infinity));
    for (const t of this.tracers) { t.t -= dt; if (t.t <= 0) { g.scene.remove(t.line); t.line.geometry.dispose(); } }
    this.tracers = this.tracers.filter((t) => t.t > 0);
    this.fires.update(dt);
    this.ui.update(dt);
  }

  // ---------------- saving ----------------
  toJSON() {
    return {
      v: 1,
      members: this.camp.members.filter((m) => !m.dead).map((m) => ({ ...m.toJSON(), role: m.role, mode: ['away', 'talk', 'leaving', 'controlled', 'mission'].includes(m.mode) ? (this.camp.claim ? 'camp' : 'follow') : m.mode, x: m.pos.x, y: m.pos.y, z: m.pos.z, smoker: m.smoker })),
      controlled: this.game.player.body ? this.game.player.body.person.id : null,
      camp: this.camp.toJSON(),
      raiders: this.raiders.toJSON(),
      missions: this.missions.toJSON(),
    };
  }
  load(j) {
    if (!j || j.v !== 1) return false;
    for (const d of j.members || []) {
      const { x, y, z, mode, role, needs, smoker, ...person } = d;
      // the leader's body already exists (made from the profile): fill it in
      const L = person.leader && this.camp.members.find((m) => m.leader);
      if (L) {
        L.pos.set(x, y, z); L.visualY = y;
        L.rels = person.rels || {}; L.knows = person.knows || {};
        L.pack.load(person.pack); L.gear = person.gear ? { gun: person.gear.gun ? { ...person.gear.gun } : null } : L.gear;
        L.fatigue = person.fatigue || 0; L.injuries = person.injuries || []; L.maxHealth = maxHealthOf(L); L.health = Math.min(L.maxHealth, person.health ?? 100);
        if (needs) Object.assign(L.needs, needs);
        L.mode = mode || 'camp';
        continue;
      }
      const n = this.spawn(person, { x, y, z, faction: 'camp', mode: mode || 'camp' });
      n.role = role || person.role;
      if (needs) Object.assign(n.needs, needs);
      n.smoker = smoker;
      this.camp.add(n);
      n.mode = mode || 'camp';
    }
    this.savedControl = j.controlled || null;
    this.camp.load(j.camp || {});
    this.raiders.load(j.raiders || []);
    this.missions.load(j.missions || {});
    return true;
  }
}

// Flames and firelight for campfires near you (two pooled lights, so the
// shaders never recompile when a fire comes into view).
class Fires {
  constructor(soc) {
    this.soc = soc;
    const g = soc.game;
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xff9a40, 0, 14, 1.6); g.scene.add(l); return l; });
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flames = new Map();
    this.cone = new THREE.ConeGeometry(0.22, 0.7, 7, 1, true);
    this.cone.translate(0, 0.35, 0);
    this.t = 0;
  }
  list() {
    const out = [];
    for (const S of this.soc.game.world.structures) {
      if (!S.props.length) continue;
      for (const p of S.props) if (p.type === 'campfire') out.push({ key: p, x: S.ox + p.x, y: S.oy + p.y, z: S.oz + p.z, S });
    }
    return out;
  }
  update(dt) {
    this.t += dt;
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0) { this.scanT = 2; this.cached = this.list(); }
    const g = this.soc.game, p = g.player.pos;
    const fires = (this.cached || []).map((f) => [Math.hypot(f.x - p.x, f.z - p.z), f]).filter((e) => e[0] < 90).sort((a, b) => a[0] - b[0]);
    const live = new Set();
    for (const [, f] of fires.slice(0, 6)) {
      live.add(f.key);
      let m = this.flames.get(f.key);
      if (!m) {
        m = new THREE.Group();
        const a = new THREE.Mesh(this.cone, this.flameMat), b = new THREE.Mesh(this.cone, this.coreMat);
        b.scale.set(0.55, 0.6, 0.55);
        m.add(a, b);
        g.scene.add(m);
        this.flames.set(f.key, m);
      }
      m.position.set(f.x, f.y + 0.08, f.z);
      const k = 0.85 + Math.sin(this.t * 13 + f.x) * 0.1 + Math.sin(this.t * 7.3 + f.z) * 0.08;
      m.scale.set(1, k, 1);
      m.rotation.y = this.t * 0.7;
    }
    for (const [k, m] of this.flames) if (!live.has(k)) { g.scene.remove(m); this.flames.delete(k); }
    const dark = g.sky.darkness;
    this.lights.forEach((l, i) => {
      const e = fires[i];
      if (!e || e[0] > 70) { l.intensity = 0; return; }
      const f = e[1];
      l.position.set(f.x, f.y + 0.8, f.z);
      l.intensity = (2 + dark * 14) * (0.85 + Math.sin(this.t * 17 + i) * 0.08 + Math.sin(this.t * 5.1 + i * 2) * 0.07);
    });
  }
}
