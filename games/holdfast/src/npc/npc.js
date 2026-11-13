// A survivor: identity, needs, relationships, movement, combat and the
// animated body. What they decide to do comes from their brain (camp life,
// following you, a stranger's day, a raider's camp).
import * as THREE from 'three';
import { Character, makeWeaponMeshes } from '../characters.js';
import { PERSONALITIES, BACKGROUND_BY_ID } from './people.js';
import { Pack, GUNS } from '../items.js';
import { maybeInjure, maxHealthOf, conditionMods } from '../condition.js';
import { deriveStats, statEffects, statSkill, bodyMods } from '../stats.js';

const R = 0.28;
const VAULT_IGNORE = new Set(['door', 'fence']);
const tmpV = new THREE.Vector3();

export class NPC {
  constructor(soc, person, opts = {}) {
    this.soc = soc;
    this.game = soc.game;
    this.person = person;
    this.faction = opts.faction || 'camp';
    this.char = new Character(person.model, person.palette);
    this.game.scene.add(this.char.root);
    this.items = makeWeaponMeshes();
    this.items.setItem(null);
    this.game.scene.add(this.items.group);
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.pos.y = this.game.physics.groundAt(this.pos.x, this.pos.z, (opts.y ?? this.game.world.terrain.height(this.pos.x, this.pos.z)) + 0.6);
    this.visualY = this.pos.y;
    this.vel = new THREE.Vector3();
    this.facing = opts.facing || 0;
    // what they carry and how worn down they are
    this.leader = !!person.leader;
    this.pack = new Pack(this.leader ? 30 : 24).load(person.pack);
    this.gear = person.gear ? { gun: person.gear.gun && GUNS[person.gear.gun.id] ? { ...person.gear.gun } : null } : { gun: null };
    this.fatigue = person.fatigue || 0;
    this.injuries = (person.injuries || []).map((i) => ({ ...i }));
    // what they're good for (the leader's come from the survivor screen)
    this.stats = person.stats ? { ...person.stats } : deriveStats(person, BACKGROUND_BY_ID[person.background], PERSONALITIES[person.personality]);
    this.xp = person.xp ? { ...person.xp } : {};
    this.baseHealth = statEffects(this.stats).health;
    this.maxHealth = maxHealthOf(this); this.health = Math.min(this.maxHealth, person.health ?? 100);
    this.stamina = 100;
    this.needs = { hunger: 20 + Math.random() * 20, energy: 70 + Math.random() * 20, social: 50, stress: 20 + Math.random() * 20 };
    this.rels = person.rels || {};
    this.knows = person.knows || {};
    this.mode = opts.mode || 'camp';
    this.role = person.role;
    this.task = null;
    this.path = null; this.pathI = 0;
    this.anim = { act: null, item: null, seatH: 0, lie: false };
    // a gun to start with, if they know how to use one
    if (!person.gear && (opts.weapon === 'gun' || (opts.weapon == null && this.skill('shooting') >= 2))) this.giveGun(opts.gunId || '1911', true);
    this.reloadT = 0;
    this.attackT = -1; this.attackCd = 0; this.stagger = 0;
    this.dead = false; this.deadT = 0;
    this.speaking = 0; this.lookAt = null;
    this.stuckT = 0; this.lastTasks = [];
    this.openedDoors = [];
    this.t = Math.random() * 10;
  }
  // fighting with a gun while there's something to shoot it with
  get weapon() {
    const g = this.gear.gun;
    return g && (g.mag > 0 || this.reloadT > 0 || this.pack.count('ammo', GUNS[g.id].ammo) > 0) ? 'gun' : 'bat';
  }
  get gunDef() { return this.gear.gun ? GUNS[this.gear.gun.id] : null; }
  giveGun(id, withAmmo = false) {
    const def = GUNS[id];
    this.gear.gun = { id, mag: withAmmo ? def.mag : 0 };
    if (withAmmo) this.pack.add('ammo', def.ammo, def.mag * (this.faction === 'raider' ? 1 + Math.floor(Math.random() * 3) : 1));
  }
  mods() { return bodyMods(this, this.leader ? this.game.profile : null); }
  get pers() { return PERSONALITIES[this.person.personality]; }
  get tr() { return this.pers.t; }
  get bg() { return BACKGROUND_BY_ID[this.person.background]; }
  get first() { return this.person.name.split(' ')[0]; }
  // 0..3: fighting, shooting, scavenging and leading come from their stats;
  // the trades (medicine, cooking, building...) from their past
  skill(k) {
    const st = this.stats;
    if (st) { if (k === 'combat') return statSkill(st.fight); if (k === 'shooting') return statSkill(st.shoot); if (k === 'scavenging') return statSkill(st.scav); if (k === 'leadership') return statSkill(st.charm); }
    return (this.bg && this.bg.skills[k]) || 0;
  }
  rel(id) { return this.rels[id] ?? 0; }
  adjust(id, d) { this.rels[id] = Math.max(-1, Math.min(1, this.rel(id) + d)); }
  // how much of their story they'll tell someone they like this much
  storyLimit(other) {
    const r = other === 'player' ? this.rel('player') : this.rel(other.person.id);
    return r > 0.6 ? 4 : r > 0.35 ? 3 : r > 0.12 ? 2 : 1;
  }
  needsLow() { return this.needs.hunger > 60 || this.needs.energy < 30; }
  get mood() {
    const n = this.needs;
    let m = 0.78 - n.hunger / 250 - Math.max(0, 40 - n.energy) / 120 - n.stress / 200 - Math.max(0, 30 - n.social) / 150 - (1 - this.health / this.maxHealth) * 0.3;
    m += this.tr.optimism * 0.15 - this.tr.anxiety * 0.08;
    return Math.max(0, Math.min(1, m));
  }
  say(text, dur) {
    if (!text) return;
    this.speaking = dur || Math.min(7, 2.4 + text.length * 0.045);
    this.soc.bubble(this, text, this.speaking);
  }

  // ---------------- movement ----------------
  // go to (x,y,z): on the camp's grid inside camp, the world's grid
  // everywhere else (when nobody can see them, a straight line does)
  goTo(x, y, z, run = false) {
    const d0 = this.dest;
    this.run = run;
    // same place as a moment ago and the route still holds: keep it
    if (d0 && this.path && this.navPath && !this.stuckN && this.t - (this.planT || -9) < 3 && Math.hypot(d0.x - x, d0.z - z) < 1.2 && Math.abs(d0.y - y) < 1) {
      this.dest = { x, y, z };
      const last = this.path[this.path.length - 1];
      if (!last.vault && !this.partial) { last.x = x; last.y = y; last.z = z; }
      return;
    }
    this.dest = { x, y, z };
    this.pathI = 0; this.stuckT = 0; this.navPath = false; this.pathPending = false; this.partial = false;
    const camp = this.soc.navFor(this.pos.x, this.pos.z, x, z);
    if (camp) { this.path = camp.path(this.pos.x, this.pos.y, this.pos.z, x, y, z) || [{ x, y, z }]; this.navPath = true; this.planT = this.t; return; }
    this.path = [{ x, y, z }];
    if (this.isNear) this.plan();
  }
  // a route on the world grid; when this frame's searching is spent, a
  // straight line now and the route next frame
  plan(force = false) {
    const nav = this.soc.nav, dst = this.dest;
    if (!nav || !dst) return;
    this.planT = this.t;
    const d = Math.hypot(dst.x - this.pos.x, dst.z - this.pos.z);
    if (d < 1 && Math.abs(dst.y - this.pos.y) < 0.6) return;
    if (!force && d < 45 && Math.abs(dst.y - this.pos.y) < 1.2 && nav.lineClear(this.pos, dst)) { this.path = [{ x: dst.x, y: dst.y, z: dst.z }]; this.pathI = 0; this.navPath = true; this.pathPending = false; return; }
    // last time there was no way there, and it's barely moved: don't search again yet
    const f = this.failed;
    if (!force && f && this.t - f.t < 4 && Math.hypot(f.x - dst.x, f.z - dst.z) < 6) { this.path = f.path ? f.path.slice() : [{ x: dst.x, y: dst.y, z: dst.z }]; this.pathI = 0; this.navPath = true; this.partial = true; return; }
    if (!this.soc.takePath()) { this.pathPending = true; return; }
    this.pathPending = false;
    const r = nav.path(this.pos, dst, { budget: d < 30 ? 4000 : d < 80 ? 10000 : 22000 });
    this.navPath = true;
    if (r && r.pts.length) { this.path = r.pts; this.pathI = 0; this.partial = r.partial; }
    this.failed = !r || r.partial ? { t: this.t, x: dst.x, z: dst.z, path: r && r.pts } : null;
  }
  stop() { this.path = null; this.dest = null; this.pathPending = false; }
  arrived(r = 0.35) { return !this.path && this.dest == null; }
  // advance along the path; returns desired horizontal velocity
  steer(dt) {
    if (!this.path) return [0, 0];
    let wp = this.path[this.pathI];
    const last = this.pathI === this.path.length - 1;
    let dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    let d = Math.hypot(dx, dz);
    // a waypoint counts as reached at its height too (on stairs the next
    // few sit almost on top of each other)
    while (!last && d < 0.45 && Math.abs(wp.y - this.pos.y) < (wp.vault ? 0.6 : 0.9)) {
      this.pathI++;
      wp = this.path[this.pathI];
      dx = wp.x - this.pos.x; dz = wp.z - this.pos.z; d = Math.hypot(dx, dz);
      if (this.pathI === this.path.length - 1) break;
    }
    if (this.pathI === this.path.length - 1 && d < 0.18 && Math.abs(wp.y - this.pos.y) < 1.2) { this.path = null; this.dest = null; return [0, 0]; }
    if (d < 1e-4) return [0, 0];
    // over a fence: a quick hop across
    if (wp.vault && d < 1.7 && !(this.vaultT > 0)) { this.vaultT = 0.6; this.vaultFrom = this.pos.y; }
    const cm = conditionMods(this);
    let sp = (this.run && cm.sprint ? 3.6 : this.run ? 2.2 : 1.35) * (this.health < 35 ? 0.7 : 1) * cm.speed;
    if (this.vaultT > 0) sp = Math.max(sp, 2.8);
    const slow = this.pathI === this.path.length - 1 ? Math.min(1, d / 0.8) : 1;
    return [dx / d * sp * Math.max(0.35, slow), dz / d * sp * Math.max(0.35, slow)];
  }
  // stuck against something: a proper route, then a step aside, then give up
  // (or, where nobody's looking, just get on with it)
  unstick(dt) {
    this.stuckT = 0; this.stuckN = (this.stuckN || 0) + 1;
    const dst = this.dest;
    if (!dst) { this.stop(); return; }
    if (this.stuckN === 1) { this.plan(true); return; }
    if (this.stuckN === 2) {
      const wp = this.path ? this.path[this.pathI] : dst, dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      const side = (this.person.seed % 2 ? 1 : -1) * 1.1;
      const sx = this.pos.x - dz / d * side, sz = this.pos.z + dx / d * side;
      const nav = this.soc.nav;
      if (nav && nav.lineClear(this.pos, { x: sx, y: this.pos.y, z: sz })) { this.path = [{ x: sx, y: this.pos.y, z: sz }, ...(this.path ? this.path.slice(this.pathI) : [dst])]; this.pathI = 0; }
      else this.plan(true);
      return;
    }
    this.stuckN = 0;
    if (!this.soc.onScreen(this.pos, 80)) {
      const wp = this.path ? this.path[Math.min(this.path.length - 1, this.pathI)] : dst;
      this.pos.set(wp.x, this.game.physics.groundAt(wp.x, wp.z, wp.y + 0.6), wp.z); this.visualY = this.pos.y;
      if (this.path && this.pathI < this.path.length - 1) this.pathI++; else this.stop();
    } else { this.stop(); this.blockedT = this.t; }
  }

  // ---------------- per frame ----------------
  update(dt, near) {
    this.t += dt;
    const wasNear = this.isNear;
    this.isNear = near;
    // came into view on a straight line: find a real route now
    if (near && this.dest && this.path && !this.controlled && (!wasNear && !this.navPath || this.pathPending)) this.plan();
    if (this.vaultT > 0) this.vaultT -= dt;
    if (this.dead) return this.updateDead(dt);
    // the one you're playing: the controller moves and animates them
    if (this.controlled) { this.items.group.visible = false; this.char.root.visible = true; return true; }
    this.attackCd -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.reloadDone(); }
    this.speaking = Math.max(0, this.speaking - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.mode === 'away') { this.char.root.visible = false; this.items.group.visible = false; return true; }
    // riding in a car: the car seats and animates them
    if (this.riding) return true;
    // decide
    if (this.downed) {
      this.downT -= dt;
      this.locked = true; this.stop();
      if (this.downT <= 0) {
        // the leader always comes to at camp, as they do when you play them
        if (this.leader && this.game.wakeAtCamp) { this.game.wakeAtCamp(this); return true; }
        this.die(this.lastAttacker || null); return true;
      }
      if (this.downT % 6 < dt && Math.random() < 0.6) this.say(['Help me\u2026', 'Somebody\u2026 please\u2026', 'I can\u2019t get up\u2026', 'Don\u2019t leave me\u2026'][Math.floor(Math.random() * 4)]);
    } else if (this.talking) {
      // turned to face you while you talk
      this.stop(); this.locked = true;
      const pp = this.game.player.pos;
      this.lookAt = pp; this.faceTarget = this.seated || this.anim.lie ? null : pp;
      this.listening = this.speaking <= 0;
      if (this.combatTarget) { this.combatTarget = null; this.aiming = false; }
    } else if (this.brain) this.brain(dt, near);
    // move
    const ph = this.game.physics;
    let [tx, tz] = this.stagger > 0 ? [0, 0] : this.steer(dt);
    if (this.locked) { tx = 0; tz = 0; }
    const acc = 9;
    this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt);
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + this.vel.x * dt, nz = oz + this.vel.z * dt;
    if (near && !this.anim.lie && !this.seated) {
      this.openDoorsAhead();
      [nx, nz] = ph.collide(nx, nz, R, this.pos.y, this.pos.y + 1.7, 0.48, null, this.vaultT > 0 ? VAULT_IGNORE : 'door');
    }
    const moved = Math.hypot(nx - ox, nz - oz);
    const want = Math.hypot(tx, tz) * dt;
    if (this.path && want > 0.005 && moved < want * 0.25 && near) {
      this.stuckT += dt;
      if (this.stuckT > 1.1) { this.unstick(dt); nx = this.pos.x; nz = this.pos.z; }
    } else { this.stuckT = Math.max(0, this.stuckT - dt * 0.5); if (!this.path) this.stuckN = 0; }
    if (!this.anim.lie && !this.seated) {
      const gy = ph.groundAt(nx, nz, this.pos.y + 0.5, 0.15);
      this.pos.set(nx, gy > this.pos.y - 5 ? gy : this.pos.y, nz);
    } else this.pos.set(nx, this.pos.y, nz);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // facing: travel direction, else what they're looking at, else the task's facing
    let face = null;
    if (hs > 0.25) face = Math.atan2(this.vel.x, this.vel.z);
    else if (this.faceTarget) face = Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z);
    else if (this.taskFace != null) face = this.taskFace;
    const prev = this.facing;
    if (face != null) this.facing = turn(this.facing, face, dt * (hs > 0.25 ? 7 : 4));
    this.turnRate = (this.facing - prev) / Math.max(dt, 1e-4);
    // keep apart from the player and each other when walking about
    if (near && hs > 0.05 && !this.seated) this.separate();
    if (!near) { this.char.root.visible = false; this.items.group.visible = false; this.visualY = this.pos.y; return true; }
    this.char.root.visible = true;
    this.animateBody(dt, hs);
    return true;
  }
  separate() {
    const p = this.game.player.pos;
    for (const o of [{ pos: p }, ...this.soc.near(this, 1.0)]) {
      if (o === this || (o.dead)) continue;
      const sx = this.pos.x - o.pos.x, sz = this.pos.z - o.pos.z, d = Math.hypot(sx, sz);
      if (d < 0.62 && d > 1e-4 && Math.abs(o.pos.y - this.pos.y) < 1) { this.pos.x += sx / d * (0.62 - d) * 0.3; this.pos.z += sz / d * (0.62 - d) * 0.3; }
    }
  }
  openDoorsAhead() {
    const w = this.game.world;
    const vx = this.vel.x, vz = this.vel.z, vl = Math.hypot(vx, vz);
    if (vl > 0.2) {
      for (const d of w.doors) {
        if (d.open || d.broken) continue;
        const c = d.center;
        if (Math.abs(c[1] - 1 - this.pos.y) > 1.2) continue;
        const dx = c[0] - this.pos.x, dz = c[2] - this.pos.z, dd = Math.hypot(dx, dz);
        if (dd > 1.25 || (dx * vx + dz * vz) / (dd * vl) < 0.35) continue;
        w.toggleDoor(d);
        this.openedDoors.push(d);
      }
    }
    // close the ones we opened once we're through
    for (let i = this.openedDoors.length - 1; i >= 0; i--) {
      const d = this.openedDoors[i], c = d.center;
      if (Math.hypot(c[0] - this.pos.x, c[2] - this.pos.z) > 2.3) {
        const busy = Math.hypot(c[0] - this.game.player.pos.x, c[2] - this.game.player.pos.z) < 2.5 || this.soc.near({ pos: { x: c[0], y: c[1], z: c[2] } }, 2.0).length;
        if (!busy && d.open && !d.broken && this.faction !== 'raider') w.toggleDoor(d);
        this.openedDoors.splice(i, 1);
      }
    }
  }
  animateBody(dt, hs) {
    const a = this.anim;
    const fighting = this.attackT >= 0 || this.combatTarget || (this.ready && !a.act);
    const gdef = this.weapon === 'gun' ? this.gunDef : null;
    const weapon = fighting && !a.act ? (gdef ? (gdef.cls === 'long' ? 'rifle' : 'gun') : 'bat') : null;
    let lookYaw = 0;
    if (this.lookAt) {
      let d = Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z) - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.9) lookYaw = d;
    }
    let act = a.act;
    if (!act && this.speaking > 0 && hs < 0.2 && !fighting) act = 'talk';
    if (this.listening && !act && hs < 0.2) act = 'listen';
    this.char.animate(dt, {
      speed: hs, mode: hs > 0.15 ? 'walk' : 'idle', act, seatH: a.seatH, weapon, crouch: !!(this.crouch && !act),
      attack: this.attackT >= 0 ? this.attackT : null, aim: !!(this.aiming && gdef && this.reloadT <= 0), aimPitch: 0, recoil: gdef ? Math.min(1.2, gdef.recoil) : 1,
      lookYaw, turn: this.turnRate, stagger: this.stagger > 0 ? Math.min(1, this.stagger / 0.3) : 0,
      air: this.vaultT > 0.08, vy: this.vaultT > 0 ? (this.vaultT - 0.3) * 12 : 0,
      search: a.search,
    });
    // place the body
    const root = this.char.root;
    if (a.lie) {
      root.position.set(this.pos.x, a.lieY + 0.12, this.pos.z);
      root.rotation.set(-Math.PI / 2, this.facing, 0);
    } else {
      this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 14);
      if (Math.abs(this.pos.y - this.visualY) > 1) this.visualY = this.pos.y;
      const hop = this.vaultT > 0 ? Math.sin((1 - this.vaultT / 0.6) * Math.PI) * 0.6 : 0;
      root.position.set(this.pos.x, this.visualY + hop, this.pos.z);
      root.rotation.set(0, this.facing, 0);
    }
    root.updateMatrixWorld(true);
    // held item
    const item = (weapon && gdef ? this.gear.gun.id : weapon) || (this.attackT >= 0 && a.act === 'fight' ? null : a.item);
    this.items.setItem(item || null);
    this.items.group.visible = !!item;
    if (item) {
      this.items.group.position.copy(this.char.grip.pos).applyMatrix4(root.matrixWorld);
      this.items.group.quaternion.copy(root.quaternion).multiply(this.char.grip.quat);
    }
    // attack timing
    if (this.attackT >= 0) {
      this.attackT += dt / (this.attackDur || 0.75);
      if (!this.hitDone && this.attackT > 0.45) { this.hitDone = true; this.onHit && this.onHit(); }
      if (this.attackT >= 1) { this.attackT = -1; this.onHit = null; }
    }
  }
  // set what the body is doing (null = free standing)
  setAct(act, item = null, seatH = 0, lie = false, lieY = 0) {
    this.anim.act = act; this.anim.item = item; this.anim.seatH = seatH; this.anim.lie = lie; this.anim.lieY = lieY;
    this.seated = seatH > 0.01 || act === 'sit_ground' || act === 'sit_whittle' || /^sit_/.test(act || '');
  }

  // ---------------- combat ----------------
  damage(n, src) {
    if (this.dead || this.invulnerable) return;
    // the one you're playing takes hits through your controller
    if (this.controlled) return this.game.player.damage(n, src);
    this.health -= n;
    if (this.faction === 'camp' && this.health > 0) {
      const inj = maybeInjure(this, src && src.hurt ? 'zombie' : src && src.gear && src.weapon === 'gun' ? 'shot' : 'melee', n);
      if (inj && this.soc.playerNear(this.pos, 40)) this.say(`Agh! ${inj.ouch || inj.name + '!'}`, 2);
    }
    this.stagger = 0.35;
    if (this.anim.lie || this.seated) { this.setAct(null); this.task = null; }
    if (src && src !== this.game.player) this.lastAttacker = src;
    if (this.downed) { if (this.health <= 0) this.die(src); return; }
    if (this.health <= 0) {
      // your people usually go down before they die: get to them in time
      if (this.faction === 'camp' && (this.leader || Math.random() < 0.8)) return this.goDown(src);
      this.die(src);
    } else if (this.onHurt) this.onHurt(src, n);
  }
  goDown(src) {
    this.downed = true; this.downT = 50; this.health = 1;
    if (this.task && this.task.slot) this.task.slot.user = null;
    this.task = null; this.convo = null; this.combatTarget = null; this.aiming = false; this.ready = false;
    this.setAct('sleep', null, 0, true, this.pos.y);
    this.stagger = 0;
    this.say(this.tr.bravery > 0.6 ? 'I\u2019m hit! I\u2019m down!' : 'Help! Help me!', 3);
    this.soc.onDowned && this.soc.onDowned(this, src);
  }
  revive(by) {
    if (!this.downed || this.dead) return;
    this.downed = false; this.health = 25; this.locked = false;
    this.setAct(null);
    this.needs.stress = Math.min(100, this.needs.stress + 20);
    if (by) {
      const id = by === this.game.player ? 'player' : by.person.id;
      this.adjust(id, 0.15);
    }
    this.say(['Thank you. I thought that was it.', 'I owe you. I owe you big.', 'Ow. Okay. I\u2019m up.', 'Don\u2019t tell anyone I cried.'][Math.floor(Math.random() * 4)]);
  }
  die(src) {
    const wasDown = this.downed;
    this.downed = false;
    this.health = 0; this.dead = true; this.deadT = wasDown ? 1.5 : 0; this.talking = false;
    this.fallDir = -1;
    this.setAct(null);
    this.soc.onDeath(this, src);
  }
  updateDead(dt) {
    this.deadT += dt;
    const k = Math.min(1, Math.max(0, this.deadT - 0.1) * 2.4), f = Math.sin(k * Math.PI / 2);
    const root = this.char.root;
    root.rotation.set(-f * Math.PI / 2 * 0.98, this.facing, 0);
    root.position.set(this.pos.x, this.visualY + 0.12 * f, this.pos.z);
    if (this.deadT < 2) this.char.animate(dt, { mode: 'dead' });
    this.items.group.visible = false;
    return this.deadT < (this.faction === 'raider' ? 120 : 60);
  }
  // swing at or shoot a target ({pos, damage()})
  // load the gun from what's in the pack
  reloadDone() {
    const g = this.gear.gun;
    if (!g) return;
    const def = GUNS[g.id];
    const n = this.pack.take('ammo', def.ammo, def.mag - g.mag);
    g.mag += n;
  }
  attack(target) {
    if (this.attackCd > 0 || this.attackT >= 0 || this.reloadT > 0) return;
    const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    const g = this.gear.gun, def = g && GUNS[g.id];
    if (this.weapon === 'gun' && d > 2.2 && d < def.range * 1.4) {
      if (g.mag <= 0) { this.reloadT = def.reload * 1.2; return; }
      // bursts from automatics, aimed shots from the rest
      this.attackCd = def.auto ? def.rate * (1.5 + Math.random()) : def.rate + 0.35 + Math.random() * 0.5;
      this.attackT = 0; this.attackDur = Math.min(0.3, def.rate * 2); this.hitDone = false;
      this.onHit = () => { if (g.mag > 0) { g.mag--; this.soc.shoot(this, target); } };
      return;
    }
    if (d > 1.9) return;
    this.attackCd = 0.9 + Math.random() * 0.5;
    this.attackT = 0; this.attackDur = 0.7; this.hitDone = false;
    this.onHit = () => {
      if (target.dead) return;
      const dd = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      if (dd > 2.2) return;
      const dmg = (22 + Math.random() * 10) * statEffects(this.stats).melee;
      this.soc.trained && this.soc.trained(this, 'fight', target.hurt ? 1 : 1.5);
      if (target.hurt) target.hurt(dmg, (target.pos.x - this.pos.x) / dd, (target.pos.z - this.pos.z) / dd, 'melee');
      else target.damage(dmg, this);
      this.game.audio && this.game.audio.thud();
    };
  }
  dispose() {
    this.game.scene.remove(this.char.root);
    this.game.scene.remove(this.items.group);
  }
  toJSON() {
    const p = this.person;
    return { ...p, rels: this.rels, knows: this.knows, health: Math.round(this.health), needs: this.needs,
      leader: this.leader || undefined, pack: this.pack.toJSON(), gear: this.gear, fatigue: Math.round(this.fatigue), injuries: this.injuries,
      stats: this.stats, xp: Object.fromEntries(Object.entries(this.xp).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
  }
  // new body (the leader's look changed on the survivor screen)
  setLook(model, palette) {
    this.person.model = model; this.person.palette = palette;
    this.game.scene.remove(this.char.root);
    this.char = new Character(model, palette);
    this.game.scene.add(this.char.root);
    if (this.controlled) this.game.player.char = this.char;
  }
}

export function turn(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
export { R as NPC_RADIUS, tmpV };
