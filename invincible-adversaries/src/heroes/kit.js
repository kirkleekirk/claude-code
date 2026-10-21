import * as THREE from 'three';
import { clamp, clamp01, damp, dampT, rand, yawOf } from '../engine/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Base class for hero ability kits. */
export class Kit {
  constructor(hero) {
    this.h = hero; this.w = hero.world; this.fx = hero.world.fx;
    const ab = hero.def.abilities;
    for (const k in ab) {
      hero.cd[k] = 0;
      if (ab[k].charges) hero.charges[k] = ab[k].charges;
    }
    this.busyT = 0; // action lock (can't start other abilities)
    this.messages = [];
  }
  get anim() { return this.h.anim; }
  update(dt) {
    const h = this.h, ab = h.def.abilities;
    if (this.busyT > 0) this.busyT -= dt;
    for (const k in h.charges) {
      const max = ab[k].charges;
      if (h.charges[k] < max && h.cd[k] <= 0) { h.charges[k]++; if (h.charges[k] < max) h.cd[k] = this.cdOf(k); }
    }
  }
  cdOf(k) { return (this.h.def.abilities[k].cd || 0) * (this.w.settings.noCooldowns ? 0.02 : 1); }
  ready(k) {
    const h = this.h;
    // an EMP locks the abilities (weapons still fire)
    if (h.disrupted && k !== 'primary' && k !== 'secondary') return false;
    if (h.def.abilities[k].charges) return h.charges[k] > 0;
    return (h.cd[k] || 0) <= 0;
  }
  use(k, cdOverride) {
    const h = this.h, a = h.def.abilities[k];
    if (a.charges) {
      const wasFull = h.charges[k] === a.charges;
      h.charges[k]--;
      if (wasFull || h.cd[k] <= 0) h.cd[k] = cdOverride ?? this.cdOf(k);
    } else h.cd[k] = cdOverride ?? this.cdOf(k);
  }
  get free() { return this.busyT <= 0 && !this.h.override; }
  /** the ultimate can start now */
  ultOk() { return this.h.ultReady && !this.h.disrupted && this.free; }
  msg(text) { this.w.emit('message', { hero: this.h, text }); }

  /** best enemy near crosshair within range & cone */
  aimTarget(range, cone = 0.5, from) {
    const h = this.h;
    const o = from || h.center || h.pos;
    let best = null, bs = -1;
    for (const e of this.w.heroes) {
      if (e.team === h.team || !e.targetable) continue;
      _v.copy(e.center || e.pos).sub(o);
      const d = _v.length();
      if (d > range) continue;
      _v.multiplyScalar(1 / Math.max(d, 1e-4));
      const dot = _v.dot(h.aimDir);
      if (dot < Math.cos(cone)) continue;
      const score = dot * 2 - d / range;
      if (score > bs) { bs = score; best = e; }
    }
    return best;
  }
  nearestEnemy(range, from) {
    const h = this.h, o = from || h.pos;
    let best = null, bd = range;
    for (const e of this.w.heroes) {
      if (e.team === h.team || !e.targetable) continue;
      const d = e.pos.distanceTo(o);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  enemyFilter() { const t = this.h.team; return (x) => x.team !== t; }
  allyFilter(incSelf = true) { const t = this.h.team, me = this.h; return (x) => x.team === t && (incSelf || x !== me); }

  /** resolve a melee strike: sphere in front of hero. returns hit heroes */
  melee({ reach = 1.7, radius = 1.35, dmg = 30, knock = 2, up = 0, power, onHit, hitSfx = 'punch_light', fxPower = 1, gore = true, cleave = false, label } = {}) {
    const h = this.h;
    const c = _v.copy(h.center || h.pos).addScaledVector(h.aimDir, reach);
    let hits = this.w.inSphere(c, radius, this.enemyFilter());
    if (!cleave && hits.length > 1) {
      hits.sort((a, b) => a.pos.distanceToSquared(c) - b.pos.distanceToSquared(c));
      hits = hits.slice(0, 2);
    }
    for (const e of hits) {
      const dir = _w.subVectors(e.center || e.pos, h.center || h.pos).normalize();
      // a bubbled target is struck on the bubble's surface (no blood: the shield took it)
      const sr = e.shieldRadius ? e.shieldRadius() : 0;
      const hp = sr > 0 ? e.bubbleCenter(_u).addScaledVector(dir, -sr) : _u.copy(e.center || e.pos).addScaledVector(dir, -e.radius * 0.8);
      const kv = dir.clone().multiplyScalar(knock); kv.y += up;
      this.w.damage(h, e, dmg, { hitPos: hp.clone(), dir: dir.clone(), knock: kv, power, type: 'melee' });
      this.fx.punchImpact(hp, dir, { power: fxPower, gore: sr === 0 && gore && this.w.settings.gore, color: sr > 0 ? 0xffc8f6 : 0xffffff });
      this.w.sfx(hitSfx, hp, { vol: 0.9 });
      onHit && onHit(e, hp, dir);
    }
    return hits;
  }
}

/** Movement override: lunge toward a target hero for a short time. */
export class Lunge {
  constructor(hero, target, { speed = 26, maxT = 0.16, stopDist = 1.5, animMode } = {}) {
    this.h = hero; this.target = target; this.speed = speed; this.t = 0; this.maxT = maxT; this.stopDist = stopDist;
    this.faceAim = true; this.animMode = animMode;
    this.slide = true; // the body moves faster than the step animation: feet travel with it
    this.animVel = new THREE.Vector3();
  }
  update(dt) {
    this.t += dt;
    const h = this.h, tg = this.target;
    if (!tg || tg.dead || this.t > this.maxT) return false;
    _v.copy(tg.center || tg.pos).sub(h.center || h.pos);
    if (h.mode !== 'fly') _v.y = 0;
    const d = _v.length();
    if (d <= this.stopDist + tg.radius) { h.vel.multiplyScalar(0.2); return false; }
    _v.multiplyScalar(1 / d);
    const step = Math.min(this.speed * dt, d - this.stopDist - tg.radius);
    h.vel.copy(_v).multiplyScalar(this.speed);
    h.pos.addScaledVector(_v, step);
    this.animVel.copy(_v).multiplyScalar(2.5);
    this.noLean = true;
    h.integrate(0);
    // face target
    h.aimDir.lerp(_v, 0.5).normalize();
    return true;
  }
}

/**
 * Generic travel (dashes, dives, charges): a straight line, or with toPoint + arc a leap that rises
 * `arc` metres above the chord and comes down on the point.
 */
export class Travel {
  constructor(hero, { dir, speed, dist, onStep, onEnd, animMode = 'fly', boost = 1, faceDir = true, stopOnWall = true, toPoint = null, flutter = 30, arc = 0 }) {
    this.h = hero; this.dir = dir.clone().normalize(); this.speed = speed; this.dist = dist; this.done = 0;
    this.onStep = onStep; this.onEnd = onEnd; this.animMode = animMode; this.boost = boost; this.faceDir = faceDir;
    this.stopOnWall = stopOnWall; this.toPoint = toPoint; this.flutter = flutter;
    this.faceAim = false;
    this.animVel = this.dir.clone().multiplyScalar(speed);
    this.prev = new THREE.Vector3();
    this.hitWall = false;
    if (toPoint && arc > 0) {
      this.arc = arc; this.start = hero.pos.clone(); this.chord = this.start.distanceTo(toPoint); this.u = 0;
      // chord speed that keeps the speed along the parabola about `speed`
      this.chordSpeed = speed / (1 + (8 / 3) * (arc / Math.max(this.chord, 1)) ** 2);
    }
  }
  update(dt) {
    const h = this.h;
    this.prev.copy(h.pos);
    if (this.arc) return this.updateArc(dt);
    let step = this.speed * dt;
    if (this.toPoint) { const d = h.pos.distanceTo(this.toPoint); if (d < step) step = d; this.dir.subVectors(this.toPoint, h.pos).normalize(); if (d < 0.05) return false; }
    else if (this.done + step > this.dist) step = this.dist - this.done;
    h.vel.copy(this.dir).multiplyScalar(this.speed);
    this.animVel.copy(h.vel);
    h.pos.addScaledVector(this.dir, step);
    this.done += step;
    const before = h.pos.clone();
    let wall = false;
    h.onWallHit = () => { wall = true; };
    h.integrate(0);
    h.onWallHit = null;
    if (this.faceDir) {
      _w.copy(this.dir); _w.y = 0;
      if (_w.lengthSq() > 0.01) h.yaw = yawOf(_w);
    }
    // onStep may end the travel by returning false (e.g. what is being carried hit a wall)
    if (this.onStep && this.onStep(this.prev, h.pos, dt) === false) return false;
    if (wall && this.stopOnWall) { this.hitWall = true; return false; }
    if (h.pos.y <= h.groundY + 0.01 && this.dir.y < -0.05) { this.hitGround = true; return false; }
    if (!this.toPoint && this.done >= this.dist - 1e-4) return false;
    void before;
    return true;
  }
  updateArc(dt) {
    const h = this.h;
    this.u = Math.min(1, this.u + this.chordSpeed * dt / Math.max(this.chord, 1e-3));
    const u = this.u;
    h.pos.lerpVectors(this.start, this.toPoint, u);
    h.pos.y += 4 * this.arc * u * (1 - u);
    this.dir.subVectors(h.pos, this.prev);
    const moved = this.dir.length();
    if (moved > 1e-5) this.dir.multiplyScalar(1 / moved);
    h.vel.copy(this.dir).multiplyScalar(moved / Math.max(dt, 1e-4));
    this.animVel.copy(h.vel);
    let wall = false;
    h.onWallHit = () => { wall = true; };
    h.integrate(0);
    h.onWallHit = null;
    if (this.faceDir) {
      _w.copy(this.dir); _w.y = 0;
      if (_w.lengthSq() > 0.01) h.yaw = yawOf(_w);
    }
    if (this.onStep && this.onStep(this.prev, h.pos, dt) === false) return false;
    if (wall && this.stopOnWall) { this.hitWall = true; return false; }
    if (u > 0.5 && h.pos.y <= h.groundY + 0.01 && this.dir.y < -0.05) { this.hitGround = true; return false; }
    return u < 1;
  }
}
