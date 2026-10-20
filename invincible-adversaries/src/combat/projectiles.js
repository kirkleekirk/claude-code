import * as THREE from 'three';
import { segSegDist2 } from '../engine/math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * Swept-sphere projectile. o: { owner, pos, vel, radius, gravity, life, onHitHero(h, p), onHitWorld(p, n), onUpdate(dt, p), onEnd(), pierce, hitAllies }
 */
export class Projectile {
  constructor(world, o) {
    this.world = world;
    this.owner = o.owner; this.team = o.owner ? o.owner.team : -1;
    this.pos = o.pos.clone(); this.prev = o.pos.clone();
    this.vel = o.vel.clone();
    this.radius = o.radius ?? 0.2;
    this.gravity = o.gravity ?? 0;
    this.life = o.life ?? 3;
    this.age = 0;
    this.o = o;
    this.dead = false;
    this.hitSet = new Set();
  }
  update(dt) {
    if (this.dead) return false;
    this.age += dt;
    if (this.age > this.life) { this.end(null); return false; }
    this.prev.copy(this.pos);
    this.vel.y -= this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    const w = this.world;
    // heroes
    for (const h of w.heroes) {
      if (!h.targetable || this.hitSet.has(h)) continue;
      const ally = h.team === this.team;
      if (h === this.owner) continue;
      if (ally && !this.o.hitAllies) continue;
      const R = this.radius + h.radius;
      if (segSegDist2(this.prev, this.pos, h.capA, h.capB) <= R * R) {
        this.hitSet.add(h);
        // contact point: closest on path to hero center
        _c.copy(h.center || h.pos);
        const t = closestT(this.prev, this.pos, _c);
        _a.copy(this.prev).lerp(this.pos, t);
        const stop = this.o.onHitHero ? this.o.onHitHero(h, _a, this) : true;
        if (!this.o.pierce || stop === true) { this.pos.copy(_a); this.end(h); return false; }
      }
    }
    // world
    const hit = w.sweepWorld(this.prev, this.pos, this.radius);
    if (hit) {
      this.pos.copy(hit.point);
      this.o.onHitWorld && this.o.onHitWorld(hit.point, hit.normal, this);
      this.end(null, hit);
      return false;
    }
    this.o.onUpdate && this.o.onUpdate(dt, this.pos, this);
    return true;
  }
  end(hero, hit) {
    if (this.dead) return;
    this.dead = true;
    this.o.onEnd && this.o.onEnd(this, hero, hit);
  }
}

function closestT(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  if (l2 < 1e-9) return 0;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
