// Survivor: shared base for the player and AI teams — inventory, survival stats,
// damage/conditions and the character movement integrator.
import * as THREE from 'three';
import { ITEMS, WEAPONS, AMMO, MAT_CAP } from '../data/items.js';
import { Character } from './character.js';
import { CLASS_BY_ID, makeMods } from '../data/classes.js';
import { gunStats } from '../data/gunmods.js';
import { clamp, lerp } from '../core/math.js';

export const HOTBAR = 5, PACK = 8;
export const MOVE = { walk: 3.6, run: 5.4, sprint: 7.8, crouch: 2.3, swim: 2.8, gravity: 22, jump: 7.3, radius: 0.36, height: 1.8, crouchHeight: 1.2, stepUp: 0.55 };

let NEXT_ID = 1;
export class Survivor {
  constructor(G, opts = {}) {
    this.G = G;
    this.id = NEXT_ID++;
    this.name = opts.name || 'Survivor';
    this.team = opts.team ?? this.id;
    this.isPlayer = !!opts.isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.cls = CLASS_BY_ID[opts.classId] || CLASS_BY_ID.survivor;
    this.mods = makeMods(this.cls);
    this.maxHealth = Math.round(100 * this.mods.get('maxHealth'));
    this.health = this.maxHealth; this.armor = 0; this.alive = true; this.extracted = false;
    this.vehicle = null;
    this.blueprints = new Set(); // advanced gun mods this survivor has learned
    this.hunger = 100; this.thirst = 100; this.stamina = 100;
    this.bleed = 0; this.fracture = false; this.infection = 0; this.sick = 0; this.painkill = 0; this.boost = 0;
    this.onGround = false; this.crouch = false; this.sprinting = false; this.swimming = false; this.airTime = 0;
    this.height = MOVE.height;
    this.inv = { slots: new Array(HOTBAR).fill(null), pack: new Array(Math.max(2, PACK + this.mods.get('packSlots'))).fill(null), active: 0, mats: { wood: 0, stone: 0, metal: 0 }, ammo: Object.fromEntries(Object.keys(AMMO).map((k) => [k, 0])) };
    this.ws = { cd: 0, reload: 0, bloom: 0, shotsFired: 0, lastShot: -9 };
    this.action = null;
    this.stats = { kills: 0, zombieKills: 0, damage: 0, damageTaken: 0, healed: 0, eaten: 0, built: 0, boarded: 0, searched: 0, distance: 0, timeAlive: 0 };
    this.lastDamager = null;
    this.lastHitT = -99;
    this.noiseCooldown = 0;
    this.cosmetics = opts.cosmetics || {};
    this.character = opts.noModel ? null : new Character(opts.outfit, { shadow: opts.shadow ?? true });
    if (this.character) {
      if (this.cosmetics.backbling) this.character.setBackBling(this.cosmetics.backbling);
      this.character.setPickaxe(this.cosmetics.pickaxe || 'shovel');
      this.character.setGlider(this.cosmetics.glider || 'canvas');
    }
  }
  get feetY() { return this.pos.y; }
  get headY() { return this.pos.y + (this.crouch ? 1.15 : 1.62); }
  get chestY() { return this.pos.y + (this.crouch ? 0.85 : 1.2); }

  // ---------------- inventory ----------------
  activeSlot() { return this.inv.active === 0 ? null : this.inv.slots[this.inv.active - 1]; }
  activeDef() { const s = this.activeSlot(); return s ? ITEMS[s.id] : null; }
  activeWeapon() { const s = this.activeSlot(); return s && WEAPONS[s.id] ? s : null; }
  equip(idx) {
    if (idx < 0 || idx > HOTBAR) return;
    if (this.inv.active === idx) return;
    this.inv.active = idx;
    this.ws.reload = 0;
    this.ws.cd = Math.max(this.ws.cd, 0.25);
    this.cancelAction();
    this.refreshModel();
  }
  refreshModel() {
    if (!this.character) return;
    const s = this.activeSlot();
    if (this.inv.active === 0) this.character.setWeapon('pickaxe');
    else if (!s) this.character.setWeapon('none');
    else {
      const def = ITEMS[s.id];
      if (def.type === 'weapon') this.character.setWeapon(def.model, s.r, this.cosmetics.wrap || null, s.mods);
      else if (def.type === 'throw') this.character.setWeapon(def.model, 0);
      else this.character.setWeapon('item');
    }
  }
  // returns leftover count (0 = all picked)
  addItem(id, n = 1, r = 0, mag = null, mods = null) {
    if (AMMO[id]) { this.inv.ammo[id] = Math.min(999, this.inv.ammo[id] + n); return 0; }
    if (id === 'wood' || id === 'stone' || id === 'metal') { const take = Math.min(n, MAT_CAP - this.inv.mats[id]); this.inv.mats[id] += take; return n - take; }
    const def = ITEMS[id];
    if (!def) return n;
    if (def.type === 'blueprint') { // learned on the spot, never takes a slot
      if (!this.isPlayer || this.mods.has('blueprints') || this.blueprints.has(def.mod)) return n;
      this.blueprints.add(def.mod);
      return 0;
    }
    const stack = def.stack || 1;
    const lists = [this.inv.slots, this.inv.pack];
    // merge into existing stacks first
    if (stack > 1) for (const L of lists) for (const s of L) {
      if (s && s.id === id && s.n < stack) { const take = Math.min(n, stack - s.n); s.n += take; n -= take; if (!n) return 0; }
    }
    // empty slots: weapons prefer hotbar, survival items prefer hotbar then pack
    for (const L of lists) for (let i = 0; i < L.length; i++) {
      if (!L[i]) {
        const take = Math.min(n, stack);
        L[i] = def.type === 'weapon' ? { id, n: take, r, mag: 0, mods: mods ? { ...mods } : {} } : { id, n: take, r, mag: null };
        if (def.type === 'weapon') L[i].mag = mag ?? (def.melee ? 0 : gunStats(L[i]).mag);
        n -= take;
        if (L === this.inv.slots && this.inv.active === i + 1) this.refreshModel();
        if (!n) return 0;
      }
    }
    return n;
  }
  freeSlotFor(id) {
    const def = ITEMS[id];
    if (!def) return true;
    if (AMMO[id] || id === 'wood' || id === 'stone' || id === 'metal') return true;
    for (const L of [this.inv.slots, this.inv.pack]) for (const s of L) { if (!s) return true; if (s.id === id && s.n < (def.stack || 1)) return true; }
    return false;
  }
  countItem(id) {
    let n = 0;
    for (const L of [this.inv.slots, this.inv.pack]) for (const s of L) if (s && s.id === id) n += s.n;
    return n;
  }
  takeItem(id, n = 1) {
    for (const L of [this.inv.pack, this.inv.slots]) for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (!s || s.id !== id) continue;
      const t = Math.min(n, s.n);
      s.n -= t; n -= t;
      if (s.n <= 0) { L[i] = null; if (L === this.inv.slots && this.inv.active === i + 1) this.refreshModel(); }
      if (!n) return true;
    }
    return n === 0;
  }
  findItem(pred) {
    for (const L of [this.inv.slots, this.inv.pack]) for (let i = 0; i < L.length; i++) if (L[i] && pred(L[i], ITEMS[L[i].id])) return { list: L, i, slot: L[i] };
    return null;
  }
  lootValue() {
    let v = 0;
    for (const L of [this.inv.slots, this.inv.pack]) for (const s of L) if (s) v += (ITEMS[s.id]?.value || 0) * s.n * (1 + (s.r || 0) * 0.5);
    return Math.round(v);
  }

  // ---------------- actions (timed item use, searching, boarding) ----------------
  startAction(kind, dur, onDone, data = {}) {
    if (this.action) return false;
    this.action = { kind, t: 0, dur, onDone, ...data };
    return true;
  }
  cancelAction() { if (this.action) { const a = this.action; this.action = null; if (a.onCancel) a.onCancel(); } }
  useItem(ref) {
    const s = ref.slot, def = ITEMS[s.id];
    if (!def || this.action) return false;
    if (def.type === 'heal') {
      const cap = this.healCapOf(def);
      if (def.heal && !def.stopBleed && this.health >= cap && !def.painkill) return false;
      if (def.heal && def.healCap && this.health >= cap && !(def.stopBleed && this.bleed) && !def.painkill) { this.G.hud?.toast(this.isPlayer, `Can't heal above ${Math.round(cap)} with ${def.name}`); return false; }
      if (def.armor && this.armor >= 100) return false;
      if (def.fixFracture && !this.fracture) { this.G.hud?.toast(this.isPlayer, 'No fracture to splint'); return false; }
      if ((def.cureInfection) && !this.infection && !this.sick) { this.G.hud?.toast(this.isPlayer, 'You feel fine'); return false; }
    }
    if (def.type === 'food' && (def.food || 0) > 0 && this.hunger > 97 && !(def.water > 0 && this.thirst < 95)) { this.G.hud?.toast(this.isPlayer, "You're full"); return false; }
    if (def.type === 'food' && !(def.food > 0) && def.water > 0 && this.thirst > 97) { this.G.hud?.toast(this.isPlayer, 'Not thirsty'); return false; }
    const anim = def.type === 'food' ? 'consume' : def.fixFracture || def.stopBleed ? 'bandage' : 'consume';
    const useTime = def.type === 'heal' ? def.time / this.mods.get('healSpeed') : def.time;
    this.character?.playAction(anim, useTime);
    this.G.audio?.play(def.type === 'food' ? 'eat' : 'bandage', this.pos, { vol: 0.6 });
    return this.startAction('use', useTime, () => {
      if (!ref.list[ref.i] || ref.list[ref.i].id !== s.id) return;
      this.applyItem(def);
      s.n--;
      if (s.n <= 0) { ref.list[ref.i] = null; if (ref.list === this.inv.slots && this.inv.active === ref.i + 1) this.refreshModel(); }
    }, { item: s.id });
  }
  applyItem(def) {
    if (def.heal) { const before = this.health; this.health = Math.max(this.health, Math.min(this.healCapOf(def), this.health + def.heal * this.mods.get('healPower'))); this.stats.healed += this.health - before; }
    if (def.stopBleed) { this.bleed = 0; if (this.mods.has('fieldMedic') && this.infection > 0) this.infection = Math.max(1, this.infection - 25); }
    if (def.armor) this.armor = Math.min(100, this.armor + def.armor * this.mods.get('healPower'));
    if (def.fixFracture) { this.fracture = false; this.G.hud?.toast(this.isPlayer, 'Leg splinted'); }
    if (def.cureInfection) { this.infection = 0; this.sick = 0; }
    if (def.painkill) this.painkill = def.painkill;
    if (def.food) { this.hunger = clamp(this.hunger + def.food, 0, 100); this.stats.eaten++; }
    if (def.water) this.thirst = clamp(this.thirst + def.water, 0, 100);
    if (def.stamina) { this.stamina = 100; this.boost = Math.max(this.boost, def.stamina); }
    if (def.sick && !this.mods.has('ironStomach') && Math.random() < def.sick) { this.sick = 90; this.G.hud?.toast(this.isPlayer, 'Your stomach turns... food poisoning'); }
  }

  healCapOf(def) { return ((def.healCap || 100) / 100) * this.maxHealth; }
  get hpFrac() { return this.health / this.maxHealth; }
  giveKit() {
    for (const [id, n, r] of this.cls.kit || []) this.addItem(id, n, r ?? 0);
  }
  // ---------------- damage ----------------
  takeDamage(amount, src = null, opts = {}) {
    if (!this.alive || this.extracted || amount <= 0) return 0;
    if (this.G.match && this.G.match.godMode && this.isPlayer) return 0;
    let dmg = amount;
    const melee = opts.type === 'zombie' || opts.type === 'melee';
    if (this.armor > 0 && opts.type !== 'fall' && opts.type !== 'bleed' && opts.type !== 'starve' && opts.type !== 'fire') {
      const absorb = melee ? dmg * 0.5 : dmg;
      const a = Math.min(this.armor, absorb);
      this.armor -= a;
      dmg -= a;
    }
    this.health -= dmg;
    this.stats.damageTaken += amount;
    this.lastHitT = this.G.time;
    if (src && src !== this) this.lastDamager = src;
    // conditions
    if (opts.type === 'zombie') {
      if (Math.random() < 0.3) this.bleed = Math.max(this.bleed, 1);
      if (Math.random() < (opts.infect ?? 0.1) / this.mods.get('infection')) { if (!this.infection) this.G.hud?.toast(this.isPlayer, 'You were bitten — infection is spreading'); this.infection = Math.max(this.infection, 1); }
      if (opts.heavy && Math.random() < 0.25) this.breakLeg();
    } else if (opts.type === 'bullet' && amount >= 22 && Math.random() < 0.28) this.bleed = Math.max(this.bleed, amount > 60 ? 2 : 1);
    if (this.action && this.action.kind !== 'use') this.cancelAction();
    this.character?.playAction('hit', 0.25);
    if (this.health <= 0) { this.health = 0; this.die(src, opts); }
    if (this.onDamaged) this.onDamaged(amount, src, opts);
    return amount;
  }
  breakLeg() {
    if (this.fracture) return;
    this.fracture = true;
    this.G.hud?.toast(this.isPlayer, 'Your leg is fractured! Use a splint');
    this.G.audio?.play('bone', this.pos, { vol: 0.8 });
  }
  die(src, opts) {
    if (!this.alive) return;
    this.alive = false;
    this.cancelAction();
    if (this.character) this.character.anim.dead = 0.001;
    this.G.onSurvivorDeath?.(this, src, opts);
  }

  // ---------------- survival tick ----------------
  updateSurvival(dt) {
    if (!this.alive || this.extracted) return;
    const sc = this.G.match?.survivalScale ?? 1;
    const exert = (this.sprinting ? 1.6 : 1) * this.mods.get('hunger');
    this.hunger = Math.max(0, this.hunger - dt * 0.062 * sc * exert * (this.sick > 0 ? 1.4 : 1));
    this.thirst = Math.max(0, this.thirst - dt * 0.09 * sc * exert * (this.sick > 0 ? 3 : 1));
    let dmg = 0;
    if (this.hunger <= 0) dmg += 0.4;
    if (this.thirst <= 0) dmg += 0.6;
    if (this.bleed) dmg += this.bleed === 2 ? 1.5 : 0.65;
    if (this.infection > 0) {
      this.infection = Math.min(100, this.infection + dt / (7 * this.mods.get('infection')));
      if (this.infection > 50) dmg += this.infection >= 100 ? 0.6 : 0.2;
    }
    if (this.sick > 0) { this.sick = Math.max(0, this.sick - dt); if (Math.random() < dt * 0.04) { this.G.emitNoise?.(this.pos.x, this.pos.z, 20, this, 'cough'); this.G.audio?.play('cough', this.pos, { vol: 0.7 }); } }
    if (this.painkill > 0) this.painkill = Math.max(0, this.painkill - dt);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (dmg > 0) {
      this._dot = (this._dot || 0) + dmg * dt;
      if (this._dot >= 1) { const d = Math.floor(this._dot); this._dot -= d; this.takeDamage(d, null, { type: this.bleed ? 'bleed' : 'starve' }); }
    } else if (this.hunger > 60 && this.thirst > 60 && !this.bleed && this.infection < 50 && this.G.time - this.lastHitT > 8) {
      this.health = Math.min(this.maxHealth, this.health + dt * 0.15);
    }
    // stamina
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * (this.boost > 0 ? 5 : 13) / this.mods.get('stamina'));
    else this.stamina = Math.min(100, this.stamina + dt * (this.boost > 0 ? 30 : 16) * (this.thirst < 20 ? 0.5 : 1));
    this.stats.timeAlive += dt;
  }
  get legsHurt() { return this.fracture && this.painkill <= 0; }

  // ---------------- movement ----------------
  // wish: {x,z} world-space unit-ish direction; speed target; jump bool
  move(dt, wishX, wishZ, speed, jump) {
    const G = this.G, P = G.physics, w = G.world;
    const r = MOVE.radius;
    const targetH = this.crouch ? MOVE.crouchHeight : MOVE.height;
    this.height = lerp(this.height, targetH, Math.min(1, dt * 12));
    const accel = this.onGround ? 42 : this.swimming ? 10 : 7;
    const vx = wishX * speed, vz = wishZ * speed;
    const k = Math.min(1, accel * dt / Math.max(0.5, speed || 1));
    this.vel.x += (vx - this.vel.x) * (this.onGround || this.swimming ? Math.min(1, dt * 14) : k * 1.2);
    this.vel.z += (vz - this.vel.z) * (this.onGround || this.swimming ? Math.min(1, dt * 14) : k * 1.2);
    // water
    const wl = w.waterLevelAt(this.pos.x, this.pos.z);
    const depth = wl - w.heightAt(this.pos.x, this.pos.z);
    this.swimming = depth > 1.3 && this.pos.y < wl - 1.0;
    if (this.swimming) {
      const targetY = wl - 1.35;
      this.vel.y += (targetY - this.pos.y) * dt * 6 - this.vel.y * dt * 3;
      if (jump) this.vel.y = 1.5;
    } else {
      this.vel.y -= MOVE.gravity * dt;
      if (jump && this.onGround) {
        this.vel.y = this.legsHurt ? MOVE.jump * 0.55 : MOVE.jump;
        this.onGround = false;
        G.audio?.play('jump', this.pos, { vol: 0.35 });
      }
    }
    const ox = this.pos.x, oz = this.pos.z, oy = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;
    // ceiling
    if (this.vel.y > 0) {
      const ceil = P.ceilingAt(this.pos.x, this.pos.z, oy + this.height - 0.05, ny + this.height + 0.05, r);
      if (ceil < ny + this.height) { ny = ceil - this.height - 0.01; this.vel.y = 0; }
    }
    this.pos.y = ny;
    P.pushOut(this.pos, r, this.height - 0.05, MOVE.stepUp);
    const g = P.groundAt(this.pos.x, this.pos.z, Math.max(oy, this.pos.y) + MOVE.stepUp, r);
    const wasGround = this.onGround;
    if (this.pos.y <= g + 0.02 && this.vel.y <= 0.01) {
      if (!wasGround && !this.swimming) this.land(-this.vel.y);
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
      this.airTime = 0;
    } else if (wasGround && this.vel.y <= 0 && this.pos.y - g < 0.45 && !this.swimming) {
      // stick to slopes / stairs going down
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else {
      this.onGround = this.swimming;
      this.airTime += dt;
    }
    // world bounds
    const W = 4800, H = 3000, m = -400;
    this.pos.x = clamp(this.pos.x, m, W - m); this.pos.z = clamp(this.pos.z, m, H - m);
    this.stats.distance += Math.hypot(this.pos.x - ox, this.pos.z - oz);
    return Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
  }
  land(vy) {
    const G = this.G;
    if (vy > 13.5) {
      const dmg = Math.round((vy - 13.5) * 9);
      this.takeDamage(dmg, null, { type: 'fall' });
      if (vy > 17 && Math.random() < 0.7) this.breakLeg();
      G.audio?.play('land_hard', this.pos, { vol: 0.8 });
    } else if (vy > 4) G.audio?.play('land', this.pos, { vol: 0.4 });
    if (vy > 4) G.emitNoise?.(this.pos.x, this.pos.z, Math.min(30, vy * 1.5), this, 'land');
  }
  syncModel(dt, speed) {
    const ch = this.character;
    if (!ch) return;
    ch.root.position.copy(this.pos);
    ch.root.rotation.y = this.yaw;
    const a = ch.anim;
    a.speed = speed;
    a.crouch = lerp(a.crouch, this.crouch ? 1 : 0, Math.min(1, dt * 10));
    a.air = this.onGround ? 0 : Math.min(1, this.airTime * 3);
    a.aimPitch = this.lookPitch;
    if (!this.alive) a.dead = Math.min(1, (a.dead || 0) + dt * 2.2);
    ch.update(dt);
  }
}
