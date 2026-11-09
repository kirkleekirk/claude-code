// The dead: spawning around the player, perception (sight & noise), steering
// with collision, banging down doors, melee attacks and death.
import * as THREE from 'three';
import { Character, randomPalette } from './characters.js';
import { T } from './world/terrain.js';
import { mulberry32 } from './util.js';

const R = 0.32;

class Zombie {
  constructor(mgr, x, z, rng) {
    this.mgr = mgr;
    const model = rng() < 0.5 ? 'man' : 'woman';
    // most shamble, some lurch along fast, a few run
    const r = rng();
    this.type = r < 0.08 ? 'runner' : r < 0.32 ? 'lurcher' : 'shambler';
    const build = rng() < 0.22 ? 1.12 + rng() * 0.08 : rng() < 0.35 ? 0.85 + rng() * 0.06 : 1;
    this.char = new Character(model, randomPalette(rng, true), {
      zombie: { seed: rng() * 8, decay: rng(), blood: 0.3 + rng() * 0.7, tear: 0.35 + rng() * 0.65, build },
    });
    this.char.zv.type = this.type;
    this.char.setGore(0.1 + rng() * 0.25);
    mgr.game.scene.add(this.char.root);
    const y = mgr.game.physics.groundAt(x, z, 1e9);
    this.pos = new THREE.Vector3(x, y, z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.facing = rng() * Math.PI * 2;
    this.health = this.type === 'runner' ? 60 + rng() * 20 : this.type === 'lurcher' ? 80 + rng() * 30 : 95 + rng() * 40;
    this.state = 'wander';
    this.speed = 0;
    this.chaseSpeed = this.type === 'runner' ? 3.7 + rng() * 0.5 : this.type === 'lurcher' ? 2.0 + rng() * 0.6 : 1.15 + rng() * 0.7;
    this.downT = 0;
    this.target = null;
    this.wanderT = 0;
    this.attackCd = 0;
    this.attackT = -1;
    this.stagger = 0;
    this.dead = false;
    this.deadT = 0;
    this.blocked = 0;
    this.sideDir = rng() < 0.5 ? 1 : -1;
    this.memory = 0;
    this.groanT = rng() * 8;
    this.visualY = y;
  }
  hurt(dmg, kx, kz, kind) {
    if (this.dead) return;
    this.health -= dmg;
    this.stagger = kind === 'melee' ? 0.45 : 0.25;
    // hit from behind: they go down on their face, otherwise on their back
    this.fallDir = (kx * Math.sin(this.facing) + kz * Math.cos(this.facing)) > 0.3 ? 1 : -1;
    // a solid bat hit can knock a shambler or lurcher off its feet
    const kd = 0.25 * ((this.mgr.game.mods && this.mgr.game.mods.knockdown) || 1);
    if (kind === 'melee' && this.health > 0 && this.downT <= 0 && this.type !== 'runner' && Math.random() < kd) { this.downT = 2.6; this.fallDir = -1; }
    this.vel.x += kx * (kind === 'melee' ? 4 : 2); this.vel.z += kz * (kind === 'melee' ? 4 : 2);
    this.state = 'chase';
    this.memory = 8;
    this.char.setGore(Math.min(1, (this.char.material.userData.gore || 0) + 0.2));
    if (this.health <= 0) {
      this.dead = true;
      this.deadT = 0;
      this.mgr.game.onKill && this.mgr.game.onKill(this);
    }
  }
  update(dt, player, full) {
    const g = this.mgr.game, ph = g.physics;
    if (this.dead) {
      this.deadT += dt;
      // knees go, then the body tips over backwards and goes limp
      const k = Math.min(1, Math.max(0, this.deadT - 0.12) * 2.4);
      const fall = Math.sin(k * Math.PI / 2);
      const fd = this.fallDir || -1;
      this.char.root.rotation.x = fd * fall * Math.PI / 2 * 0.98;
      this.char.root.position.y = this.visualY + 0.12 * fall - Math.max(0, this.deadT - 20) * 0.2;
      if (this.deadT < 2) this.char.animate(dt, { mode: 'dead', deadDir: fd });
      return this.deadT < 26;
    }
    if (this.downT > 0) {
      // knocked down: fall back, lie there, get up again
      this.downT -= dt;
      const t = 2.6 - this.downT;
      const k = t < 0.45 ? Math.sin(Math.min(1, t / 0.45) * Math.PI / 2) : this.downT < 0.8 ? Math.max(0, this.downT / 0.8) : 1;
      this.char.root.rotation.x = -k * Math.PI / 2 * 0.98;
      this.char.root.position.set(this.pos.x, this.visualY + 0.12 * k, this.pos.z);
      this.char.animate(dt, { mode: this.downT > 0.8 ? 'dead' : 'zombie', speed: 0, deadDir: -1 });
      if (this.downT <= 0) { this.char.root.rotation.x = 0; this.state = 'chase'; this.memory = 6; }
      return true;
    }
    // who it's after: you, or whichever living person is closest in view
    if (this.prey && (this.prey.dead || (this.prey !== player && !this.prey.char.root.visible))) this.prey = null;
    let prey = this.prey || player;
    // perception (throttled)
    this.senseT = (this.senseT || 0) - dt;
    if (this.senseT <= 0) {
      this.senseT = full ? 0.25 : 1;
      const dark = g.sky.darkness;
      const cands = g.society ? [...(player.released ? [] : [player]), ...g.society.humansNear(this.pos, 26)] : [player];
      let seen = null, sd = Infinity;
      for (const t of cands) {
        if (t.dead) continue;
        const tp = t.pos, isP = t === player;
        const tx = tp.x - this.pos.x, tz = tp.z - this.pos.z, td = Math.hypot(tx, tz);
        const sight = ((isP ? player.crouch : t.crouch) ? 14 : 24) * (1 - dark * 0.45) * (isP && player.flashlightOn && dark > 0.5 ? 1.5 : 1) * (isP && dark > 0.5 && g.mods ? g.mods.nightSight : 1);
        if (td > sight || td > sd || Math.abs(tp.y - this.pos.y) > 4) continue;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        if ((tx * fx + tz * fz) / (td || 1) < -0.2 && td > 3) continue;
        const ox = this.pos.x, oy = this.pos.y + 1.6, oz = this.pos.z;
        const ty = tp.y + 1.4;
        const len = Math.hypot(tx, ty - oy, tz);
        const hit = ph.raycast(ox, oy, oz, tx / len, (ty - oy) / len, tz / len, len, { skipGlass: true, noTerrain: false, filter: (b) => b.kind !== 'tree' && b.kind !== 'fence' && b.kind !== 'prop' });
        if (hit.dist >= len - 0.5) { seen = t; sd = td; }
      }
      if (seen) { this.state = 'chase'; this.memory = 6; this.prey = seen; prey = seen; this.target = seen.pos.clone(); }
      else if (this.state === 'chase') { this.memory -= this.senseT > 0 ? 0.25 : 1; if (this.memory <= 0) { this.state = 'investigate'; this.prey = null; } }
      const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (!player.dead && pd < player.noise && this.state === 'wander') { this.state = 'investigate'; this.target = player.pos.clone(); }
    }
    const pp = prey.pos;
    const dx = pp.x - this.pos.x, dz = pp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.state === 'chase' && !prey.dead) this.target = pp.clone();
    // choose desired direction
    let tx = 0, tz = 0, speed = 0;
    if (this.stagger > 0) { this.stagger -= dt; }
    else if (this.state === 'chase' || this.state === 'investigate') {
      // stuck against something, or the prey's on another floor: a real
      // route (through doors, up stairs, around fences); a doorway guess if
      // there's no time to think this frame
      const soc = g.society;
      const otherFloor = this.state === 'chase' && Math.abs(this.target.y - this.pos.y) > 1.6 && dist < 30;
      this.navCd = (this.navCd || 0) - dt;
      if ((this.blocked > 0.8 || otherFloor) && !this.waypoint && full && soc && soc.nav && this.navCd <= 0 && soc.takePath()) {
        this.navCd = 2.5;
        const r = soc.nav.path(this.pos, this.target, { budget: 5000, noVault: true, near: 1.2 });
        if (r && r.pts.length) { this.waypoint = r.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)); this.wpStage = 0; this.wpT = 4 + r.pts.length * 2; this.blocked = 0; }
      }
      if (this.blocked > 1.0 && !this.waypoint) this.findDoorway(this.target);
      // close and on the same floor: straight at them
      if (this.waypoint && this.state === 'chase' && dist < 3 && Math.abs(pp.y - this.pos.y) < 1) this.waypoint = null;
      if (this.waypoint) {
        this.wpT -= dt;
        const w = this.waypoint[this.wpStage];
        if (Math.hypot(w.x - this.pos.x, w.z - this.pos.z) < 0.7) { this.wpStage++; this.blocked = 0; }
        if (this.wpStage >= this.waypoint.length || this.wpT <= 0) this.waypoint = null;
      }
      const t = this.waypoint ? this.waypoint[this.wpStage] : this.target;
      const ex = t.x - this.pos.x, ez = t.z - this.pos.z;
      const el = Math.hypot(ex, ez);
      if (this.state === 'investigate' && !this.waypoint && el < 1.5) { this.state = 'wander'; this.home.copy(this.pos); }
      tx = ex / (el || 1); tz = ez / (el || 1);
      speed = this.state === 'chase' ? this.chaseSpeed : 0.9;
      if (this.state === 'chase' && dist < 1.25 && Math.abs(pp.y - this.pos.y) < 1.2) { speed = 0; this.tryAttack(prey); }
    } else {
      this.waypoint = null;
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 6;
        if (Math.random() < 0.4) this.wanderDir = null;
        else {
          const a = Math.random() * Math.PI * 2;
          const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
          this.wanderDir = [Math.cos(a) + hx * 0.05, Math.sin(a) + hz * 0.05];
        }
      }
      if (this.wanderDir) { const l = Math.hypot(...this.wanderDir); tx = this.wanderDir[0] / l; tz = this.wanderDir[1] / l; speed = 0.55; }
    }
    // obstacle sidestep when blocked
    if (this.blocked > 0.6 && speed > 0) {
      const a = this.sideDir * 1.1;
      const c = Math.cos(a), s = Math.sin(a);
      [tx, tz] = [tx * c - tz * s, tx * s + tz * c];
      if (this.blocked > 2.2) { this.sideDir *= -1; this.blocked = 0.7; }
    }
    // doors in the way get pounded on
    if (speed > 0 && (this.state === 'chase' || this.state === 'investigate')) this.checkDoor(tx, tz, dt);
    const acc = 6;
    this.vel.x += (tx * speed - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (tz * speed - this.vel.z) * Math.min(1, acc * dt);
    const ox = this.pos.x, oz = this.pos.z;
    let nx = ox + this.vel.x * dt, nz = oz + this.vel.z * dt;
    [nx, nz] = ph.collide(nx, nz, R, this.pos.y, this.pos.y + 1.7, 0.45);
    // keep out of deep water
    if (ph.terrain.height(nx, nz) < T.water - 0.6) { nx = ox; nz = oz; }
    // separation from other zombies
    if (full) for (const o of this.mgr.list) {
      if (o === this || o.dead) continue;
      const sx = nx - o.pos.x, sz = nz - o.pos.z, d2 = sx * sx + sz * sz;
      if (d2 < 0.45 && d2 > 1e-6) { const d = Math.sqrt(d2); nx += sx / d * (0.67 - d) * 0.5; nz += sz / d * (0.67 - d) * 0.5; }
    }
    const moved = Math.hypot(nx - ox, nz - oz);
    if (speed > 0.3 && moved < speed * dt * 0.3) this.blocked += dt; else this.blocked = Math.max(0, this.blocked - dt);
    const gy = ph.groundAt(nx, nz, this.pos.y + 0.5, 0.15);
    this.pos.set(nx, gy > this.pos.y - 6 ? gy : this.pos.y, nz);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.15 && this.attackT < 0) this.facing = turn(this.facing, Math.atan2(this.vel.x, this.vel.z), dt * 5);
    else if (this.state === 'chase') this.facing = turn(this.facing, Math.atan2(dx, dz), dt * 6);
    // attack anim
    this.attackCd -= dt;
    if (this.attackT >= 0) {
      this.attackT += dt / 0.9;
      if (!this.hitDone && this.attackT > 0.45) {
        this.hitDone = true;
        if (dist < 1.6 && Math.abs(pp.y - this.pos.y) < 1.3 && !prey.dead) prey.damage(9 + Math.random() * 6, this);
      }
      if (this.attackT >= 1) this.attackT = -1;
    }
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 5 + Math.random() * 10; if (dist < 30) g.audio && g.audio.groan(this.pos, dist); }
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 12);
    if (full || !this.lastAnim || performance.now() - this.lastAnim > 120) {
      this.char.animate(full ? dt : dt * 4, { mode: 'zombie', speed: hs, attack: this.attackT >= 0 ? this.attackT : null,
        stagger: this.stagger > 0 ? Math.min(1, this.stagger / 0.3) : 0 });
      this.lastAnim = performance.now();
    }
    this.char.root.position.set(this.pos.x, this.visualY, this.pos.z);
    this.char.root.rotation.y = this.facing;
    return true;
  }
  // Pick the door that best links us to the target; walk to a point just
  // outside it, then through it.
  findDoorway(target) {
    const g = this.mgr.game;
    let best = null, bs = Infinity;
    for (const d of g.world.doors) {
      const c = d.center;
      if (Math.abs(c[1] - 1 - this.pos.y) > 1.5) continue;
      const dz = Math.hypot(c[0] - this.pos.x, c[2] - this.pos.z);
      if (dz > 18) continue;
      const s = dz + Math.hypot(c[0] - target.x, c[2] - target.z);
      if (s < bs) { bs = s; best = d; }
    }
    if (!best) return;
    const c = best.center, n = best.def.nAxis;
    const side = Math.sign((this.pos.x - c[0]) * n[0] + (this.pos.z - c[2]) * n[2]) || 1;
    this.waypoint = [
      new THREE.Vector3(c[0] + n[0] * side * 1.3, c[1], c[2] + n[2] * side * 1.3),
      new THREE.Vector3(c[0] - n[0] * side * 0.9, c[1], c[2] - n[2] * side * 0.9),
    ];
    this.wpStage = 0; this.wpT = 9;
  }
  tryAttack(player) {
    if (this.attackCd > 0) return;
    this.attackCd = 1.3 + Math.random() * 0.5;
    this.attackT = 0; this.hitDone = false;
  }
  checkDoor(tx, tz, dt) {
    const g = this.mgr.game;
    for (const d of g.world.doors) {
      if (d.open || d.broken) continue;
      const c = d.center;
      const ddx = c[0] - this.pos.x, ddz = c[2] - this.pos.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd > 1.3 || Math.abs(c[1] - 1 - this.pos.y) > 1.2) continue;
      if ((ddx * tx + ddz * tz) / dd < 0.3) continue;
      d.health -= dt * 9;
      this.bangT = (this.bangT || 0) - dt;
      if (this.bangT <= 0) { this.bangT = 0.8; g.audio && g.audio.bang(c); this.attackT = 0; this.hitDone = true; }
      if (d.health <= 0) {
        d.broken = true;
        if (!d.open) g.world.toggleDoor(d);
        g.hud && g.hud.toast('Something broke through a door nearby.', 2);
      }
      return;
    }
  }
  dispose() {
    this.mgr.game.scene.remove(this.char.root);
  }
}

function turn(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

export class Zombies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rng = mulberry32(1234);
    this.spawnT = 2;
    this.maxDay = game.quality.level === 'low' ? 10 : 18;
    this.maxNight = game.quality.level === 'low' ? 16 : 28;
    this.kills = 0;
  }
  get target() {
    const d = this.game.sky.darkness;
    // how many of the dead (chosen on the survivor screen)
    return Math.round((this.maxDay + (this.maxNight - this.maxDay) * d) * (this.mult || 1));
  }
  density(x, z) {
    // more of them in town
    if (x > T.town.x0 - 10 && x < T.floodwallX && Math.abs(z) < T.town.z1) return 2.2;
    if (this.game.world.inOccupied(x, z, 25)) return 1.4;
    return 0.6;
  }
  // around you, or (in the top view) wherever you're watching
  trySpawn() {
    const g = this.game, cf = g.command && g.command.active ? g.command.focusPoint : null;
    const p = cf && Math.random() < 0.6 ? cf : g.player.pos;
    for (let k = 0; k < 12; k++) {
      const a = this.rng() * Math.PI * 2, r = 45 + this.rng() * 85;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const B = T.play;
      if (x < B.x0 + 4 || x > B.x1 - 4 || z < B.z0 + 4 || z > B.z1 - 4) continue;
      if (g.world.terrain.height(x, z) < T.water + 0.8) continue;
      if (this.rng() > this.density(x, z) / 2.2) continue;
      if (g.claims && g.claims.at(x, z, 8)) continue;
      // not inside solid geometry
      // outdoors on the ground (never on a roof or inside a building)
      if (g.world.nearBuilding(x, z, 1)) continue;
      const boxes = g.physics.query(x - 0.4, z - 0.4, x + 0.4, z + 0.4, []);
      const gy = g.physics.groundAt(x, z, g.world.terrain.height(x, z) + 0.5);
      if (boxes.some((b) => b.min[1] < gy + 1.7 && b.max[1] > gy + 0.3)) continue;
      // don't pop in right in front of the camera
      const cam = g.camera.position, f = new THREE.Vector3(); g.camera.getWorldDirection(f);
      const vx = x - cam.x, vz = z - cam.z, vl = Math.hypot(vx, vz);
      if (vl < 70 && (vx * f.x + vz * f.z) / vl > 0.5) continue;
      this.list.push(new Zombie(this, x, z, this.rng));
      return true;
    }
    return false;
  }
  // lurkers placed inside a building (called on start for some structures)
  spawnAt(x, z) { this.list.push(new Zombie(this, x, z, this.rng)); }
  alertNoise(pos, radius) {
    for (const z of this.list) {
      if (z.dead) continue;
      if (z.pos.distanceTo(pos) < radius) { if (z.state !== 'chase') { z.state = 'investigate'; z.target = pos.clone(); } }
    }
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.spawnT -= dt;
    const alive = this.list.filter((z) => !z.dead).length;
    if (this.spawnT <= 0 && alive < this.target && !g.peaceful) { this.spawnT = 1.5; this.trySpawn(); }
    const keep = [];
    for (const z of this.list) {
      const cf = g.command && g.command.active ? g.command.focusPoint : null;
      const d = Math.min(z.pos.distanceTo(p.pos), cf ? Math.hypot(z.pos.x - cf.x, z.pos.z - cf.z) : Infinity);
      if (d > 175 && !z.dead) { z.dispose(); continue; }
      const full = d < 60;
      const alive2 = z.update(dt, p, full);
      if (!alive2) { z.dispose(); continue; }
      keep.push(z);
    }
    this.list = keep;
  }
  clear() { for (const z of this.list) z.dispose(); this.list = []; }
}
