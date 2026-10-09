// Everything that wants the player dead, and where it comes from: Endurance's rules, after
// CastleMiner Z's. The dead climb up out of the ground on the surface (never in caves): at
// night all around you, sprinting, more of them the further out you are; by day, as you push
// further out, every fifty meters of new ground. Down in the pitch dark (caves, the shade
// under the islands, the Underworld) the skeletons come, and light keeps them away. Everything
// gets tougher with distance from the tower and every fifth day; from day five the red dead
// walk too. Nothing follows you far: a body that falls well behind is let go.

import * as THREE from 'three';
import { Enemy } from '../entities/enemy.js';
import { zombieLook } from '../entities/avatar/zombie.js';
import { skeletonLook } from '../entities/avatar/skeleton.js';
import { buildAvatarGeometry } from '../entities/avatar/model.js';
import { SOLID, B } from '../world/blocks.js';
import { digTierAt } from '../entities/enemy.js';
import { UNDER } from '../world/gen.js';

const ZOMBIE_LOOKS = 8;

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geos = new Map();
    this.spawnT = 6;
    this.caveT = 4;
    this.dayT = 30;
    this.nextMark = null; // the next 50 m of new ground that brings the dead up by day
  }

  // the horde shares a handful of built bodies; each has a material of its own
  shared(look) {
    let s = this.geos.get(look);
    if (!s) { s = { geo: buildAvatarGeometry(look) }; this.geos.set(look, s); }
    return s;
  }

  // how hard things are out here: further from the tower, and every fifth day, tougher
  scaleAt(x, z, red = false) {
    const g = this.game, sp = g.towerAt;
    const dist = Math.hypot(x - sp.x, z - sp.z);
    const day = g.app.sky.day;
    const fifth = Math.floor((day - 1) / 5);
    return {
      hp: (1 + dist / 550) * (1 + fifth * 0.3) * (red ? 1.7 : 1),
      damage: (1 + dist / 900) * (1 + fifth * 0.15) * (red ? 1.4 : 1),
      speed: 1 + Math.min(0.5, dist / 1700 + fifth * 0.04) + (red ? 0.08 : 0),
      digTier: digTierAt(dist) + (red ? 1 : 0),
    };
  }

  spawn(kind, x, y, z, opts = {}) {
    const day = this.game.app.sky.day;
    // from day five, some of the dead are red, and stronger for it
    const red = kind === 'zombie' && (opts.red ?? (day >= 5 && Math.random() < Math.min(0.5, 0.12 + (day - 5) * 0.06)));
    const look = kind === 'skeleton' ? skeletonLook(1) : zombieLook(opts.look ?? 1 + Math.floor(Math.random() * ZOMBIE_LOOKS), red);
    const scale = { ...(opts.scale || this.scaleAt(x, z, red)), rise: opts.rise };
    const e = new Enemy(this.game, kind, look, this.shared(look), x, y, z, scale);
    e.red = red;
    e.sprint = !!opts.sprint;
    this.game.scene.add(e.root);
    this.list.push(e);
    return e;
  }

  update(dt, active) {
    if (!active) return;
    const g = this.game, p = g.player, sky = g.app.sky;
    this.spawning(dt);
    const ctx = { player: p };
    for (const e of this.list) e.update(dt, ctx);

    // keep out of each other, and out of the player
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (Math.abs(b.pos.y - a.pos.y) > 1.5) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.42 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (0.65 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        if (!a.collides(a.pos.x - nx * push, a.pos.y, a.pos.z - nz * push)) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
        if (!b.collides(b.pos.x + nx * push, b.pos.y, b.pos.z + nz * push)) { b.pos.x += nx * push; b.pos.z += nz * push; }
      }
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.36 && d2 > 1e-6 && Math.abs(a.pos.y - p.pos.y) < 1.7) {
        const d = Math.sqrt(d2), push = 0.6 - d;
        if (!a.collides(a.pos.x + dx / d * push, a.pos.y, a.pos.z + dz / d * push)) { a.pos.x += dx / d * push; a.pos.z += dz / d * push; }
      }
    }

    // the night's dead sprint; by day they walk
    const night = sky.isNight;
    for (const e of L) if (e.kind === 'zombie') e.sprint = night;

    // let go of what's gone, or far behind
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      const far = (e.dist ?? 0) > (e.kind === 'skeleton' ? 50 : 76);
      if (e.gone || far) { e.dispose(); L.splice(i, 1); }
    }
  }

  spawning(dt) {
    const g = this.game, p = g.player, sky = g.app.sky, w = g.world;
    if (p.dead || g.grace) return;
    const dist = g.distance ?? 0;
    const day = sky.day;
    const night = sky.isNight;
    const L = w.lightAt(p.pos.x, p.pos.y + 1.6, p.pos.z);
    const surface = w.surfaceY(p.pos.x, p.pos.z);
    const depth = surface - p.pos.y;
    const underground = L.sky <= 5 && depth > 3;
    let zombies = 0, skeletons = 0;
    for (const e of this.list) if (!e.dead) { if (e.kind === 'zombie') zombies++; else skeletons++; }
    const group = () => 1 + (Math.random() < 0.35 + Math.min(0.4, dist / 2000) ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    const rise = (n, opts = {}) => {
      const at = this.surfaceSpot(opts.ahead);
      if (!at) return;
      for (let k = 0; k < n; k++) {
        const o = k ? 1.5 + Math.random() * 2 : 0, a = Math.random() * 6.28;
        this.spawn('zombie', at.x + Math.sin(a) * o, at.y, at.z + Math.cos(a) * o, { sprint: night });
      }
    };

    // the dead, on the surface
    if (!underground) {
      if (night) {
        const cap = Math.min(32, 4 + day * 2 + Math.floor(dist / 110));
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = Math.max(0.7, 4.5 - day * 0.25 - dist / 600) * (0.7 + Math.random() * 0.6);
          if (zombies < cap) rise(Math.min(group(), cap - zombies));
        }
      } else {
        // by day: every fifty meters of new ground brings some up, ahead of you
        const mark = (Math.floor(g.maxDistance / 50) + 1) * 50;
        if (this.nextMark == null) this.nextMark = mark;
        if (g.maxDistance >= this.nextMark) {
          this.nextMark = mark;
          if (zombies < 12) rise(group(), { ahead: true });
        }
        // and a straggler now and then, out past the Hills
        this.dayT -= dt;
        if (this.dayT <= 0) {
          this.dayT = 35 + Math.random() * 30;
          if (dist > 200 && zombies < Math.min(6, 1 + Math.floor(dist / 400))) rise(1);
        }
      }
    }

    // skeletons in the pitch dark, wherever it is: caves, under the islands, the Underworld
    const dark = L.sky <= 3 || (night && L.sky <= 8);
    const capS = dark ? Math.min(12, 2 + Math.floor(Math.max(0, depth) / 12) + Math.floor(dist / 300)) : 0;
    this.caveT -= dt;
    if (this.caveT <= 0) {
      this.caveT = 2.5 + Math.random() * 3.5;
      if (skeletons < capS) {
        const at = this.caveSpot();
        if (at) this.spawn('skeleton', at.x, at.y, at.z);
      }
    }
  }

  // somewhere out in the open, around the player but not on top of them (ahead: in front)
  surfaceSpot(ahead = false) {
    const g = this.game, p = g.player, w = g.world;
    for (let i = 0; i < 10; i++) {
      const a = ahead ? Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const r = (ahead ? 16 : 18) + Math.random() * 18;
      const x = Math.floor(p.pos.x + Math.sin(a) * r) + 0.5, z = Math.floor(p.pos.z + Math.cos(a) * r) + 0.5;
      if (!w.isLoaded(x, z)) continue;
      const y = w.surfaceY(x, z);
      if (y < 1) continue;
      const top = w.getBlock(x, y, z);
      if (top === B.LAVA || top === B.LEAVES) continue;
      if (w.getBlock(x, y + 1, z) !== B.AIR || w.getBlock(x, y + 2, z) !== B.AIR) continue;
      if (w.lightAt(x, y + 1, z).sky < 10) continue;
      return new THREE.Vector3(x, y + 1 + 0.001, z);
    }
    return null;
  }

  // a dark floor in the caves near the player
  caveSpot() {
    const g = this.game, p = g.player, w = g.world;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 16;
      const x = Math.floor(p.pos.x + Math.sin(a) * r) + 0.5, z = Math.floor(p.pos.z + Math.cos(a) * r) + 0.5;
      if (!w.isLoaded(x, z)) continue;
      const y0 = Math.floor(p.pos.y);
      for (let dy = 6; dy >= -6; dy--) {
        const y = y0 + dy;
        if (y < 2) continue;
        if (!SOLID[w.getBlock(x, y - 1, z)] || w.getBlock(x, y - 1, z) === B.LAVA) continue;
        if (w.getBlock(x, y, z) !== B.AIR || w.getBlock(x, y + 1, z) !== B.AIR) continue;
        const l = w.lightAt(x, y, z);
        if (l.sky > 2 || l.block > 1) continue;
        // in the Underworld they fall from the ceiling
        if (y < UNDER.ceil + 2) {
          let top = y + 1;
          while (top < y + 14 && w.getBlock(x, top + 1, z) === B.AIR) top++;
          return new THREE.Vector3(x, top - 1.8, z);
        }
        return new THREE.Vector3(x, y + 0.001, z);
      }
    }
    return null;
  }

  // The first body along a ray: { enemy, dist, head } or null.
  raycast(o, d, maxDist, blockDist = Infinity) {
    const lim = Math.min(maxDist, blockDist);
    let best = null;
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
      if (dx * dx + dz * dz > (lim + 1.5) * (lim + 1.5)) continue;
      const h = e.intersect(o, d, lim);
      if (h && (!best || h.dist < best.dist)) best = { enemy: e, dist: h.dist, head: h.head };
    }
    return best;
  }

  occupies(x, y, z) {
    for (const e of this.list) if (e.occupies(x, y, z)) return true;
    return false;
  }

  clearNear(at, r) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < r) { e.dispose(); this.list.splice(i, 1); }
    }
  }

  get count() { return this.list.filter((e) => !e.dead).length; }

  dispose() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    for (const s of this.geos.values()) s.geo.dispose();
    this.geos.clear();
  }
}
