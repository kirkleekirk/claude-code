// AI survivors. Far away they're simulated abstractly (travel, loot, fight, get overrun);
// near the player they become physical with full movement, looting, combat and
// OG-style panic building.
import * as THREE from 'three';
import { Survivor } from './survivor.js';
import { ITEMS, WEAPONS, AMMO, clampRarity } from '../data/items.js';
import { gunStats, randomMods } from '../data/gunmods.js';
import { POIS } from '../world/layout.js';
import { RNG } from '../core/rng.js';
import { clamp, wrapAngle, dampAngle } from '../core/math.js';
import { randomOutfit } from '../data/cosmetics.js';
import { CLASSES } from '../data/classes.js';

const PHYS_IN = 250, PHYS_OUT = 330;
const NAME_A = ['Corn', 'Bayou', 'Rusty', 'Dusty', 'Hollow', 'Gravel', 'Possum', 'Moon', 'Cedar', 'Prairie', 'Barn', 'Okra', 'Biscuit', 'Tumble', 'Copper', 'Ghost', 'Swamp', 'Hay', 'Thunder', 'Muddy', 'Pecan', 'Catfish', 'Lantern', 'Whiskey', 'Gator', 'Rattler'];
const NAME_B = ['Dog', 'Bandit', 'Ranger', 'Queen', 'Kid', 'Boots', 'Hawk', 'Jack', 'Sally', 'Rider', 'Slinger', 'Belle', 'Hound', 'Baron', 'Witch', 'Duke', 'Runner', 'Tex', 'Mae', 'Hunter', 'Crow', 'Fox'];

export function botName(rng) {
  const a = rng.pick(NAME_A), b = rng.pick(NAME_B);
  const style = rng.int(0, 3);
  return style === 0 ? `${a}${b}${rng.int(1, 99)}` : style === 1 ? `${a}_${b}` : style === 2 ? `xX${a}${b}Xx` : `${a}${b}`;
}

export class Bot extends Survivor {
  constructor(G, opts) {
    super(G, { ...opts, noModel: true });
    this.rng = new RNG(opts.seed || this.id * 977);
    this.skill = clamp(this.rng.range(0.15, 0.9) * (G.match?.botSkill ?? 1), 0.05, 0.95);
    this.aggression = this.rng.range(0.2, 0.95);
    this.outfitDef = opts.outfit;
    this.physical = false;
    this.gear = 0;
    this.state = 'drop';
    this.goal = null;
    this.stateT = 0;
    this.thinkT = 0;
    this.target = null;
    this.seenT = 0;
    this.lootedBuildings = new Set();
    this.dropT = 0;
    this.landed = false;
    this.strafe = 1; this.strafeT = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.path = null; this.pathI = 0;
    this.extractGoal = null;
  }
  // ---------- representation ----------
  makePhysical() {
    const G = this.G;
    if (this.physical) return;
    this.physical = true;
    if (!this.character) {
      this.character = new (G.CharacterClass)(this.outfitDef, { shadow: true });
      this.character.setBackBling(this.cosmetics.backbling || 'pack');
      this.character.setPickaxe(this.cosmetics.pickaxe || 'shovel');
      this.character.setGlider(this.cosmetics.glider || 'canvas');
    }
    if (!this.equipped) this.generateLoadout();
    // drop on ground safely
    if (this.landed) {
      const g = G.physics.groundAt(this.pos.x, this.pos.z, 999, 0.4);
      this.pos.y = g;
      G.physics.pushOut(this.pos, 0.4, 1.8, 0.5);
    }
    G.scene.add(this.character.root);
    this.refreshModel();
  }
  makeAbstract() {
    if (!this.physical) return;
    this.physical = false;
    if (this.character) this.G.scene.remove(this.character.root);
    this.target = null;
  }
  generateLoadout() {
    this.equipped = true;
    const r = this.rng, g = this.gear;
    const rar = () => clamp(Math.floor(g * 3.2 + r.range(-0.6, 1.2)), 0, 4);
    const pickW = (opts) => r.weighted(opts);
    // better-geared survivors have found a workbench or two
    const give = (id, ammo) => {
      const nm = g > 0.35 && r.chance(g * 0.8) ? 1 + (g > 0.7 && r.chance(0.5) ? 1 : 0) : 0;
      this.addItem(id, 1, clampRarity(id, rar()), null, nm ? randomMods(id, r, nm) : null);
      this.inv.ammo[WEAPONS[id].ammo] += ammo;
    };
    if (g > 0.05 || r.chance(0.6)) {
      const w1 = pickW([['m4', 4], ['ak', g > 0.3 ? 3 : 1], ['mp5', 2], ['pistol', 2], ['snub', 1], ['longrev', g > 0.5 ? 1 : 0]]);
      give(w1, w1 === 'snub' || w1 === 'longrev' ? 16 + Math.floor(g * 30) : 40 + Math.floor(g * 120));
    }
    if (g > 0.25 || r.chance(0.35)) give('pump', 10 + Math.floor(g * 25));
    if (g > 0.55 && r.chance(0.4)) give(r.chance(0.6) ? 'scout' : 'longrifle', 8 + Math.floor(g * 10));
    if (g > 0.15) this.addItem('bandage', r.int(2, 6));
    if (g > 0.4 && r.chance(0.6)) this.addItem('medkit', 1);
    if (g > 0.3) { this.armor = Math.floor(r.range(0, 1) * g * 100); }
    this.inv.mats.wood = Math.floor(30 + g * 300); this.inv.mats.stone = Math.floor(g * 120);
    if (r.chance(0.3)) this.addItem(r.pick(['cash', 'locket', 'watch', 'coin']), 1);
    if (r.chance(0.5)) this.addItem('beans', 1);
    this.equipBest(10);
  }
  equipBest(dist) {
    let best = -1, bs = -1;
    for (let i = 0; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (!s) continue;
      const def = WEAPONS[s.id];
      if (!def || def.melee) continue;
      if ((s.mag <= 0) && (this.inv.ammo[def.ammo] || 0) <= 0) continue;
      const st = gunStats(s);
      let score = st.dmg * st.rate * (st.pellets || 1) * 0.1;
      if (st.pellets) score *= dist < 12 ? 3 : dist < 25 ? 0.8 : 0.1;
      if (st.scope) score *= dist > 60 ? 3 : dist < 20 ? 0.1 : 0.6;
      if (st.range < 100 && !st.pellets) score *= dist > 60 ? 0.3 : 1.2;
      if (score > bs) { bs = score; best = i; }
    }
    this.equip(best >= 0 ? best + 1 : 0);
  }

  // ---------- abstract simulation (cheap, runs every ~2s) ----------
  abstractTick(dt) {
    const G = this.G;
    this.stateT += dt;
    this.updateSurvivalAbstract(dt);
    if (this.state === 'drop') return;
    if (!this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 15) {
      if (this.state === 'travel') { this.state = 'loot'; this.stateT = 0; }
      if (this.state === 'loot' && this.stateT > this.rng.range(120, 360) / (G.match?.speed || 1)) this.pickPoiGoal();
      if (this.state === 'extract') return;
    }
    if (this.state === 'loot') {
      this.gear = Math.min(1, this.gear + dt * 0.0016 * (G.poiAt(this.pos.x, this.pos.z)?.loot || 0.6));
      // amble around the POI
      if (this.rng.chance(dt * 0.05)) this.goal = { x: this.pos.x + this.rng.range(-60, 60), z: this.pos.z + this.rng.range(-60, 60) };
    }
    // flee hordes
    const h = G.hordes.inside(this.pos.x, this.pos.z);
    if (h && this.state !== 'extract') {
      const dx = this.pos.x - h.x, dz = this.pos.z - h.z, d = Math.hypot(dx, dz) || 1;
      this.goal = { x: h.x + dx / d * (h.r + 80), z: h.z + dz / d * (h.r + 80) };
      this.state = 'travel';
    }
    if (this.goal) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 1) { const sp = Math.min(d, 4.8 * dt); this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; }
    }
    this.pos.y = G.world.heightAt(this.pos.x, this.pos.z);
  }
  updateSurvivalAbstract(dt) { this.stats.timeAlive += dt; }
  pickPoiGoal() {
    const G = this.G;
    let best = null, bs = -1e9;
    for (const p of POIS) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 50) continue;
      if (G.hordes.inside(p.x, p.z)) continue;
      const s = p.loot * 400 - d * 0.6 + this.rng.range(0, 500) + (p.major ? 150 : 0);
      if (s > bs) { bs = s; best = p; }
    }
    if (best) { this.goal = { x: best.x + this.rng.range(-best.r * 0.6, best.r * 0.6), z: best.z + this.rng.range(-best.r * 0.6, best.r * 0.6) }; this.state = 'travel'; this.stateT = 0; }
  }

  // ---------- physical AI ----------
  physicalTick(dt) {
    const G = this.G;
    if (!this.alive) { this.syncModel(dt, 0); return; }
    if (!this.landed) return this.airTick(dt);
    this.updateSurvival(dt);
    G.weapons.updateShooter(this, dt);
    this.stateT += dt;
    this.thinkT -= dt;
    this.indoor = G.inter.buildingAt(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (this.thinkT <= 0) { this.thinkT = 0.35 + this.rng.next() * 0.3; this.think(); }
    // actions (healing)
    if (this.action) { this.action.t += dt; if (this.action.t >= this.action.dur) { const a = this.action; this.action = null; a.onDone?.(); } }
    let wish = null, speed = 5.4, jump = false;
    const t = this.target;
    if (this.state === 'fight' && t && t.alive) {
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const slot = this.activeSlot();
      const def = slot && WEAPONS[slot.id];
      const ideal = !def ? 2 : def.pellets ? 6 : def.scope ? 80 : def.range < 100 ? 18 : 35;
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = this.rng.sign(); this.strafeT = this.rng.range(0.6, 2); if (this.rng.chance(0.15 * this.skill) && this.onGround) jump = true; }
      let fx = dx / (d || 1), fz = dz / (d || 1);
      const toward = d > ideal * 1.3 ? 1 : d < ideal * 0.6 ? -0.8 : 0;
      wish = { x: fx * toward + -fz * this.strafe * 0.8, z: fz * toward + fx * this.strafe * 0.8 };
      speed = 4.6;
      // shooting
      this.seenT += dt;
      if (this.seenT > 0.55 - this.skill * 0.35 && slot && def) {
        if (def.melee || !def) { /* */ }
        else if (slot.mag <= 0) G.weapons.startReload(this);
        else {
          const err = (0.06 + d * 0.012) * (1.25 - this.skill) * (Math.hypot(t.vel.x, t.vel.z) > 2 ? 1.6 : 1);
          const aim = new THREE.Vector3(t.pos.x + (this.rng.next() - 0.5) * err * 4, t.pos.y + (this.rng.chance(0.15 * this.skill) ? 1.6 : 1.15) + (this.rng.next() - 0.5) * err * 3, t.pos.z + (this.rng.next() - 0.5) * err * 4);
          const canSee = G.physics.lineOfSight(this.pos.x, this.pos.y + 1.4, this.pos.z, aim.x, aim.y, aim.z);
          if (canSee && (def.auto || this.ws.cd <= -0.05 - this.rng.next() * 0.25 * (1 - this.skill))) G.weapons.fire(this, aim, { ads: d > 25, spreadMul: 1.1 });
        }
      }
    } else if (this.state === 'zombies' && this.zTarget) {
      const z = this.zTarget;
      const dx = z.pos.x - this.pos.x, dz = z.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
      const slot = this.activeSlot();
      if (d < 9 && slot && WEAPONS[slot.id] && !WEAPONS[slot.id].melee && slot.mag > 0) {
        const aim = new THREE.Vector3(z.pos.x, z.pos.y + 1.3 * z.scale, z.pos.z);
        if (this.ws.cd <= 0) G.weapons.fire(this, aim, { spreadMul: 1.4 });
        wish = { x: -dx / (d || 1), z: -dz / (d || 1) }; speed = 3;
      } else if (d < 2.5) { G.weapons.swingPickaxe(this, new THREE.Vector3(z.pos.x, z.pos.y + 1.2, z.pos.z)); }
      else { wish = { x: -dx / (d || 1), z: -dz / (d || 1) }; speed = 6.5; }
    } else if (this.goal) {
      const wp = this.nextWaypoint();
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.6) { wish = { x: dx / d, z: dz / d }; this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt); }
      speed = this.state === 'flee' || this.state === 'extract' ? 7.6 : 5.4;
      this.sprinting = speed > 7;
    }
    if (this.action) speed = Math.min(speed, 2);
    if (this.legsHurt) speed *= 0.62;
    speed *= this.mods.get('moveSpeed');
    const sp = this.move(dt, wish ? wish.x : 0, wish ? wish.z : 0, wish ? speed : 0, jump);
    // stuck → hop / detour
    if (wish && sp < 0.6) {
      this.stuckT += dt;
      if (this.stuckT > 0.8) { this.stuckT = 0; if (this.onGround && this.rng.chance(0.5)) this.vel.y = 7; else { this.goal = { x: this.pos.x + this.rng.range(-12, 12), z: this.pos.z + this.rng.range(-12, 12) }; this.path = null; } }
    } else this.stuckT = 0;
    // pick up nearby loot
    if ((this.G.frame + this.id) % 20 === 0) this.lootNearby();
    // footstep noise
    if (sp > 1 && (this.G.frame + this.id) % 30 === 0) G.emitNoise(this.pos.x, this.pos.z, this.sprinting ? 16 : 7, this, 'step');
    if (sp > 1 && (this.G.frame + this.id) % 18 === 0) G.audio?.play('footstep', this.pos, { vol: 0.5 });
    this.syncModel(dt, sp);
  }
  airTick(dt) {
    const G = this.G;
    // descend to chosen landing spot
    const goal = this.dropGoal;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
    const ground = G.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, 0.4);
    const h = this.pos.y - ground;
    const glide = h < 110;
    this.character.anim.state = glide ? 'glide' : 'skydive';
    const hs = glide ? 13 : 18;
    this.vel.x += ((d > 2 ? dx / d : 0) * hs - this.vel.x) * Math.min(1, dt);
    this.vel.z += ((d > 2 ? dz / d : 0) * hs - this.vel.z) * Math.min(1, dt);
    this.vel.y += ((glide ? -6.5 : -38) - this.vel.y) * Math.min(1, dt * 2);
    this.pos.addScaledVector(this.vel, dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 3, dt);
    if (glide) G.physics.pushOut(this.pos, 0.4, 1.7, 0.3);
    const g = G.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.4);
    if (this.pos.y <= g + 0.05) { this.pos.y = g; this.vel.set(0, 0, 0); this.landed = true; this.character.anim.state = 'ground'; this.state = 'loot'; this.stateT = 0; this.onGround = true; this.goal = null; }
    this.syncModel(dt, 0);
  }
  think() {
    const G = this.G;
    // enemies
    const slot = this.activeSlot();
    let enemy = null, ed = 1e9;
    for (const s of G.survivors) {
      if (s === this || !s.alive || s.extracted || !s.physical || s.team === this.team) continue;
      const d = Math.hypot(s.pos.x - this.pos.x, s.pos.z - this.pos.z);
      const range = s === this.target ? 140 : 95 * (s.crouch ? 0.7 : 1);
      if (d > range || d > ed) continue;
      if (!G.physics.lineOfSight(this.pos.x, this.pos.y + 1.5, this.pos.z, s.pos.x, s.pos.y + 1.3, s.pos.z)) continue;
      enemy = s; ed = d;
    }
    const hasGun = this.inv.slots.some((s) => s && WEAPONS[s.id] && !WEAPONS[s.id].melee && (s.mag > 0 || this.inv.ammo[WEAPONS[s.id].ammo] > 0));
    // healing
    if (!this.action && this.hpFrac < 0.55 && (!enemy || G.time - this.lastHitT > 3)) {
      const ref = this.findItem((s) => s.id === 'medkit' || s.id === 'bandage');
      if (ref && this.health < this.healCapOf(ITEMS[ref.slot.id])) { this.useItem(ref); return; }
    }
    if (this.bleed && !this.action) { const ref = this.findItem((s) => s.id === 'bandage' || s.id === 'medkit'); if (ref) { this.useItem(ref); return; } }
    if (enemy && hasGun && (this.aggression > 0.35 || enemy === this.target || ed < 30)) {
      if (this.target !== enemy) { this.seenT = 0; this.target = enemy; }
      this.state = 'fight';
      this.equipBest(ed);
      return;
    }
    if (this.state === 'fight' && (!this.target || !this.target.alive || this.target.extracted)) { this.state = 'loot'; this.target = null; }
    if (this.state === 'fight' && this.target) {
      const d = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
      if (d > 150) { this.state = 'loot'; this.target = null; }
      else return;
    }
    // zombies close
    let zt = null, zd = 1e9;
    for (const z of G.zombies.list) {
      if (z.state === 'dead') continue;
      const d = Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z);
      if (d < zd && d < 14 && (z.target === this || d < 6)) { zd = d; zt = z; }
    }
    if (zt) { this.state = 'zombies'; this.zTarget = zt; if (hasGun) this.equipBest(zd); return; }
    if (this.state === 'zombies') this.state = 'loot';
    // extraction
    const ex = G.match.extractionTarget?.(this);
    if (ex) { this.state = 'extract'; this.goal = ex; this.path = null; return; }
    // hordes
    const h = G.hordes.inside(this.pos.x, this.pos.z) || G.hordes.list.find((hh) => Math.hypot(hh.x - this.pos.x, hh.z - this.pos.z) < hh.r + 25);
    if (h) {
      const dx = this.pos.x - h.x, dz = this.pos.z - h.z, d = Math.hypot(dx, dz) || 1;
      this.state = 'flee';
      this.goal = { x: h.x + dx / d * (h.r + 70), z: h.z + dz / d * (h.r + 70) };
      this.path = null;
      return;
    }
    // looting: walk into nearby unlooted buildings
    if (this.state !== 'travel' || !this.goal) {
      if (!this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 2 || this.stateT > 40) {
        this.stateT = 0;
        const blds = G.inter.nearbyBuildings(this.pos.x, this.pos.z, 90).filter((b) => b.rt && !this.lootedBuildings.has(b.id));
        if (blds.length && this.rng.chance(0.8)) {
          const b = blds[Math.floor(this.rng.next() * Math.min(3, blds.length))];
          this.lootedBuildings.add(b.id);
          const room = b.rt.rooms[Math.floor(this.rng.next() * b.rt.rooms.length)];
          if (room) {
            const n = b.rt.nav.nodes[room.nav];
            this.goal = { x: n.x, y: n.y, z: n.z, building: b };
            this.path = G.inter.findPath(b, this.pos, n, this.indoor && this.indoor.b === b ? this.indoor : null, { b, floor: room.floor, room: b.rt.rooms.indexOf(room) });
            this.pathI = 0;
            this.state = 'loot';
          }
        } else {
          this.pickPoiGoal();
          this.path = null;
        }
      }
    }
  }
  nextWaypoint() {
    if (this.path && this.pathI < this.path.length) {
      const n = this.path[this.pathI];
      if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 1.0) {
        if (n.vaultTo) { // vault through window
          const to = n.vaultTo;
          this.pos.set(to.x, to.y, to.z);
          this.pathI += 2;
        } else this.pathI++;
      }
      if (this.pathI < this.path.length) return this.path[this.pathI];
    }
    return this.goal;
  }
  lootNearby() {
    const G = this.G;
    for (const it of G.inter.items) {
      if (Math.abs(it.x - this.pos.x) > 2.2 || Math.abs(it.z - this.pos.z) > 2.2 || Math.abs(it.y - this.pos.y) > 2) continue;
      const def = ITEMS[it.id];
      const left = this.addItem(it.id, it.n, it.r, it.mag, it.mods);
      if (left < it.n) {
        if (left <= 0) G.inter.removeWorldItem(it); else it.n = left;
        if (def?.type === 'weapon') this.gear = Math.min(1, this.gear + 0.05 + it.r * 0.04);
        break;
      }
    }
    for (const c of G.inter.crates) if (!c.opened && Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 2.5) G.inter.openCrate(c, this);
  }
  onShotBy(shooter) {
    if (!this.alive || !shooter) return;
    if (shooter !== this.target && (!this.target || this.rng.chance(0.6))) { this.target = shooter; this.state = 'fight'; this.seenT = 0.2; }
    // OG panic wall
    if (this.inv.mats.wood >= 10 && this.rng.chance(0.35 + this.skill * 0.4) && this.G.time - (this.lastWall || 0) > 2.5) {
      this.lastWall = this.G.time;
      const yaw = Math.atan2(shooter.pos.x - this.pos.x, shooter.pos.z - this.pos.z) + Math.PI;
      const p = this.G.builds.target(this, 'wall', yaw, 0, 0);
      this.G.builds.place(this, p, this.inv.mats.stone >= 10 && this.rng.chance(0.4) ? 'stone' : 'wood');
      if (this.rng.chance(0.4 * this.skill) && this.inv.mats.wood >= 10) {
        const r = this.G.builds.target(this, 'ramp', yaw, 0, 0);
        this.G.builds.place(this, r, 'wood');
      }
    }
  }
}

// Manages all bots: drop, abstract sim, physical promotion, pacing deaths.
export class BotManager {
  constructor(G) {
    this.G = G;
    this.bots = [];
    this.rng = new RNG(G.seed + 31);
    this.abstractT = 0;
    this.fightT = 0;
  }
  create(n) {
    for (let i = 0; i < n; i++) {
      const outfit = randomOutfit(this.rng);
      const b = new Bot(this.G, { name: botName(this.rng), outfit: outfit.outfit, cosmetics: outfit.cosmetics, seed: this.rng.int(1, 1e9), classId: this.rng.pick(CLASSES).id });
      b.team = 1000 + i;
      this.bots.push(b);
      this.G.survivors.push(b);
    }
  }
  // place bots on the ground at their spawn points
  placeAt(spots) {
    this.bots.forEach((b, i) => {
      const sp = spots[i];
      b.pos.set(sp.x, this.G.world.heightAt(sp.x, sp.z), sp.z);
      b.yaw = sp.yaw;
      b.jumped = true; b.landed = true; b.state = 'loot'; b.stateT = 0; b.goal = null;
      b.giveKit();
    });
  }
  planDrop(plane) {
    for (const b of this.bots) {
      b.jumpAt = this.rng.range(0.08, 0.92);
      // destination: POI near the path or random
      let best = null, bs = -1e9;
      for (const p of POIS) {
        const s = p.loot * 300 + (p.major ? 200 : 0) + this.rng.range(0, 700);
        if (s > bs) { bs = s; best = p; }
      }
      b.dropGoal = { x: best.x + this.rng.range(-best.r, best.r), z: best.z + this.rng.range(-best.r, best.r) };
      if (this.rng.chance(0.25)) b.dropGoal = { x: this.rng.range(400, 3500), z: this.rng.range(300, 2700) };
      b.goal = b.dropGoal;
    }
  }
  update(dt) {
    const G = this.G;
    const plane = G.match.plane;
    const P = G.player;
    for (const b of this.bots) {
      if (!b.alive || b.extracted) { if (b.physical && !b.alive) b.physicalTick(dt); continue; }
      // jumping from plane
      if (b.state === 'drop' && !b.jumped) {
        if (plane && plane.t >= b.jumpAt) {
          b.jumped = true;
          b.pos.copy(plane.pos);
          b.vel.copy(plane.vel).multiplyScalar(0.3);
          b.dropT = 0;
        } else { if (plane) b.pos.copy(plane.pos); continue; }
      }
      const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
      const near = d < PHYS_IN || (P.mode === 'dead' && d < 120);
      if (!b.physical && near) b.makePhysical();
      else if (b.physical && d > PHYS_OUT) b.makeAbstract();
      if (b.physical) b.physicalTick(dt);
      else if (!b.landed) {
        // abstract fall: travel to drop goal, land after ~40s
        b.dropT += dt;
        const g = b.dropGoal, dx = g.x - b.pos.x, dz = g.z - b.pos.z, dd = Math.hypot(dx, dz);
        if (dd > 1) { const sp = Math.min(dd, 22 * dt); b.pos.x += dx / dd * sp; b.pos.z += dz / dd * sp; }
        b.pos.y = Math.max(G.world.heightAt(b.pos.x, b.pos.z), b.pos.y - 30 * dt);
        if (b.dropT > 35 && dd < 5) { b.landed = true; b.state = 'loot'; b.stateT = 0; b.pos.y = G.world.heightAt(b.pos.x, b.pos.z); }
      }
    }
    // abstract ticks at low rate
    this.abstractT += dt;
    if (this.abstractT > 1) {
      const step = this.abstractT; this.abstractT = 0;
      for (const b of this.bots) if (b.alive && !b.extracted && !b.physical && b.landed) b.abstractTick(step);
      this.abstractCombat(step);
    }
  }
  abstractCombat(dt) {
    const G = this.G;
    const alive = this.bots.filter((b) => b.alive && !b.extracted && !b.physical && b.landed);
    const pace = G.match.paceFactor();
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      // overrun by hordes
      const h = G.hordes.inside(a.pos.x, a.pos.z);
      if (h && this.rng.chance(dt * 0.006 * h.intensity * (1.2 - a.gear * 0.6) * pace)) { a.health = 0; a.die(null, { type: 'zombie' }); continue; }
      // starvation / bleeding-out late game
      if (G.match.progress > 0.5 && this.rng.chance(dt * 0.00025 * pace)) { a.health = 0; a.die(null, { type: 'starve' }); continue; }
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (!a.alive || !b.alive) continue;
        if (Math.abs(a.pos.x - b.pos.x) > 90 || Math.abs(a.pos.z - b.pos.z) > 90) continue;
        if (!this.rng.chance(dt * 0.012 * pace * (a.aggression + b.aggression))) continue;
        const sa = a.gear + a.skill * 0.8 + this.rng.next() * 0.9, sb = b.gear + b.skill * 0.8 + this.rng.next() * 0.9;
        const [w, l] = sa > sb ? [a, b] : [b, a];
        w.stats.kills++;
        w.gear = Math.min(1, w.gear + l.gear * 0.4 + 0.05);
        l.health = 0;
        l.die(w, { type: 'bullet', weapon: 'abstract' });
      }
    }
  }
}
