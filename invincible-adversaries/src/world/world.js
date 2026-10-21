import * as THREE from 'three';
import { Projectile } from '../combat/projectiles.js';
import { RULES } from '../heroes/data.js';
import { ARENA } from './arena.js';
import { clamp, clamp01, segSegDist2, rand, TAU } from '../engine/math.js';
import { SHAPE } from '../vfx/particles.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor({ scene, fx, audio, renderer, camRig, obstacles }) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.renderer = renderer; this.camRig = camRig;
    this.obstacles = obstacles;
    this.heroes = [];
    this.projectiles = [];
    this.zones = [];
    this.barriers = []; // hard-light walls: { team, segT(a, b), hit(point, amount), update(dt), dispose() }
    this.orbs = [];
    this.time = 0;
    this.hitstopT = 0;
    this.slowmo = { t: 0, scale: 1 };
    this.score = [0, 0];
    this.feed = [];
    this.listeners = {};
    this.settings = { noCooldowns: false, fastUlt: false, godMode: false, bots: 'active', difficulty: 'normal', gore: true, comic: true };
    this.makeOrbs();
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { const l = this.listeners[ev]; if (l) for (const f of l) f(...a); }

  add(h) { this.heroes.push(h); return h; }
  remove(h) {
    // end whatever the hero was in the middle of first (a carried enemy, an ult, a bubble...)
    h.endActions(true);
    this.heroes = this.heroes.filter((x) => x !== h);
    this.scene.remove(h.root);
    h.kit && h.kit.dispose && h.kit.dispose();
  }

  spawnProjectile(o) { const p = new Projectile(this, o); this.projectiles.push(p); return p; }

  // ------------------------------------------------------------------ queries
  enemiesOf(h) { return this.heroes.filter((x) => x.team !== h.team && x.targetable); }
  alliesOf(h, incSelf = false) { return this.heroes.filter((x) => x.team === h.team && (incSelf || x !== h) && !x.dead); }

  inSphere(center, r, filter) {
    const out = [];
    for (const h of this.heroes) {
      if (!h.targetable || (filter && !filter(h))) continue;
      const d2 = segPointDist2(h.capA, h.capB, center);
      const R = r + h.radius;
      if (d2 <= R * R) out.push(h);
    }
    return out;
  }
  inCone(origin, dir, range, halfAngle, filter) {
    const out = [];
    const cosA = Math.cos(halfAngle);
    for (const h of this.heroes) {
      if (!h.targetable || (filter && !filter(h))) continue;
      _v.copy(h.center || h.pos).sub(origin);
      const d = _v.length();
      if (d > range + h.radius) continue;
      if (d < h.radius + 0.6) { out.push(h); continue; }
      _v.multiplyScalar(1 / d);
      // widen by target radius
      const ang = Math.acos(clamp(_v.dot(dir), -1, 1)) - Math.atan2(h.radius, d);
      if (Math.cos(Math.max(0, ang)) >= cosA) out.push(h);
    }
    return out;
  }
  /** ray vs heroes; returns {hero, dist, point} */
  rayHeroes(origin, dir, maxDist, filter, pad = 0) {
    let best = null, bd = maxDist;
    _w.copy(origin).addScaledVector(dir, maxDist);
    for (const h of this.heroes) {
      if (!h.targetable || (filter && !filter(h))) continue;
      const R = h.radius + pad;
      // quick reject
      _v.copy(h.center || h.pos).sub(origin);
      const t = _v.dot(dir);
      if (t < -2 || t > maxDist + 2) continue;
      const d2 = segSegDist2(origin, _w, h.capA, h.capB);
      if (d2 <= R * R) {
        const dist = Math.max(0, t - Math.sqrt(Math.max(0, R * R - d2)));
        if (dist < bd) { bd = dist; best = h; }
      }
    }
    return best ? { hero: best, dist: bd, point: origin.clone().addScaledVector(dir, bd) } : null;
  }
  /** ray vs ground & obstacles; returns {dist, point, normal} */
  rayWorld(origin, dir, maxDist) {
    let bd = maxDist, n = null;
    if (dir.y < -1e-5) {
      const t = -origin.y / dir.y;
      if (t >= 0 && t < bd) { bd = t; n = UP; }
    }
    for (const o of this.obstacles) {
      if (o.type === 'cyl') {
        const t = rayCyl(origin, dir, o);
        if (t >= 0 && t < bd) { bd = t; n = _u.set(origin.x + dir.x * t - o.x, 0, origin.z + dir.z * t - o.z).normalize().clone(); }
      } else {
        const r = rayBox(origin, dir, o.min, o.max);
        if (r && r.t < bd) { bd = r.t; n = r.n; }
      }
    }
    return n ? { dist: bd, point: origin.clone().addScaledVector(dir, bd), normal: n } : null;
  }
  sweepWorld(a, b, radius) {
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 1e-6) return null;
    _v.multiplyScalar(1 / len);
    // ground with radius
    if (b.y < radius * 0.5) {
      const t = a.y > radius * 0.5 ? (a.y - radius * 0.5) / (a.y - b.y) : 0;
      const p = a.clone().lerp(b, t); p.y = Math.max(0.02, p.y);
      return { point: p, normal: UP };
    }
    const hit = this.rayWorld(a, _v, len);
    if (hit && hit.normal !== UP) return { point: hit.point.addScaledVector(_v, -radius * 0.5), normal: hit.normal };
    return null;
  }
  /** true when a hero-sized body at p would be inside a wall or cover (rather than on top of it) */
  blocked(p, r = 0.45) {
    for (const o of this.obstacles) {
      if (o.type === 'cyl') { if (p.y < o.h && Math.hypot(p.x - o.x, p.z - o.z) < o.r + r) return true; }
      else if (p.x > o.min.x - r && p.x < o.max.x + r && p.z > o.min.z - r && p.z < o.max.z + r && p.y < o.max.y - 0.35 && p.y + 1.8 > o.min.y) return true;
    }
    return false;
  }
  groundAt(x, z) {
    let y = 0;
    for (const o of this.obstacles) if (o.type === 'box' && x > o.min.x && x < o.max.x && z > o.min.z && z < o.max.z) y = Math.max(y, o.max.y);
    return y;
  }
  /** the first barrier not of `team` that the segment a->b crosses: { barrier, t, point } or null */
  barrierHit(a, b, team) {
    let best = null;
    for (const br of this.barriers) {
      if (br.team === team || !br.alive) continue;
      const t = br.segT(a, b);
      if (t >= 0 && (!best || t < best.t)) best = { barrier: br, t };
    }
    if (best) best.point = a.clone().lerp(b, best.t);
    return best;
  }
  /** the same along a ray: { barrier, dist, point } or null */
  barrierRay(origin, dir, maxDist, team) {
    if (!this.barriers.length) return null;
    const hit = this.barrierHit(origin, _u.copy(origin).addScaledVector(dir, maxDist), team);
    if (hit) hit.dist = hit.t * maxDist;
    return hit;
  }
  lineOfSight(a, b) {
    _v.subVectors(b, a); const d = _v.length(); _v.normalize();
    const hit = this.rayWorld(a, _v, d);
    return !hit || hit.dist > d - 0.3;
  }

  // ------------------------------------------------------------------ combat
  /**
   * o: { hitPos, dir, knock (Vector3), stun, slow, slowT, type, power (flinch), crit, silent, noLifesteal, label }
   */
  damage(src, target, amount, o = {}) {
    if (!target || target.dead || target.untargetable) return 0;
    if (target.invuln > 0) return 0;
    if (src && src !== target && src.team === target.team) return 0;
    let amt = amount;
    if (src && src.status.boost > 0) amt *= 1 + src.status.boost;
    // a hard-light barrier between the attacker (or o.from, e.g. a blast centre) and the target takes
    // the hit instead; damage over time from a zone the target stands in isn't blocked
    if (this.barriers.length && src && src !== target && o.type !== 'dot') {
      const bh = this.barrierHit(o.from || src.center || src.pos, target.center || target.pos, src.team);
      if (bh) { bh.barrier.hit(bh.point, amt, src); return 0; }
    }
    if (target.status.vuln > 0) amt *= 1 + target.status.vuln;
    if (target.status.dr > 0) amt *= 1 - target.status.dr;
    if (target.spawnProtect > 0) amt *= 0.3;
    let hitPos = o.hitPos;
    if (!hitPos) {
      // surface point facing the attacker
      hitPos = (target.center || target.pos).clone();
      if (src && src !== target) { _u.subVectors(src.center || src.pos, hitPos); if (_u.lengthSq() > 1e-6) hitPos.addScaledVector(_u.normalize(), target.radius * 0.9); }
      else hitPos.y += 0.3;
    }
    let absorbed = 0, dealt = 0;
    if (target.bubble && amt > 0) {
      const b = target.bubble;
      const a = Math.min(b.amt, amt);
      b.amt -= a; amt -= a; absorbed = a;
      b.fx && b.fx.hit(hitPos);
      this.sfx('bubble_hit', hitPos, { vol: 0.5, minGap: 0.05 });
      if (b.owner && b.owner !== target) b.owner.ult = Math.min(b.owner.def.ultCost, b.owner.ult + a * RULES.ultPerShield);
      if (b.owner) b.owner.healingDone += a;
      if (b.amt <= 0.5) { b.fx && b.fx.pop(true); target.bubble = null; this.sfx('bubble_break', hitPos, { vol: 0.8 }); }
    }
    if (amt > 0 && target.overhealth > 0) { const a = Math.min(target.overhealth, amt); target.overhealth -= a; amt -= a; dealt += a; }
    if (amt > 0) {
      let a = Math.min(target.hp, amt);
      if (this.settings.godMode && target.team === 0 && target.isPlayer) a = Math.min(a, Math.max(0, target.hp - 1));
      target.hp -= a; dealt += a;
    }
    const total = dealt + absorbed;
    const now = this.time;
    target.lastHurt = now; target.lastCombat = now;
    if (src) {
      src.lastCombat = now;
      src.damageDone += total;
      // an ultimate's own damage doesn't charge the next one
      if (src !== target && o.type !== 'ult') src.ult = Math.min(src.def.ultCost, src.ult + total * RULES.ultPerDamage);
      if (src.key === 'omniman' && !o.noLifesteal && total > 0) this.heal(src, src, total * RULES.omniLifesteal, { silent: true, noUlt: true });
    }
    // reactions
    const power = o.power ?? clamp(amount / 60, 0.3, 1.5);
    if (dealt > 0) {
      target.flash = Math.min(0.75, Math.max(target.flash, 0.1 + power * 0.32));
      target.flashColor.set(o.flashColor || 0xffffff);
    }
    const dir = o.dir || (src ? _v.subVectors(target.pos, src.pos).setY(0).normalize() : _v.set(0, 0, 1));
    // a hit the bubble swallowed whole doesn't reach the body, so it doesn't flinch it
    if (!o.noFlinch && !(dealt === 0 && absorbed > 0)) {
      _w.copy(dir);
      target.root.updateMatrixWorld();
      _q.copy(target.root.quaternion).invert();
      _w.applyQuaternion(_q);
      target.anim.hit(_w, power);
    }
    if (o.knock) target.knock(o.knock, { force: !!o.forceKnock });
    if (o.stun && !target.unstoppable) target.status.stunT = Math.max(target.status.stunT, o.stun);
    else if (o.stun && target.unstoppable) target.status.stunT = Math.max(target.status.stunT, o.stun * 0.5);
    if (o.slow && !target.unstoppable) { target.status.slow = Math.max(target.status.slow, o.slow); target.status.slowT = Math.max(target.status.slowT, o.slowT || 1.5); }
    this.emit('damage', { src, target, amount: total, absorbed, hitPos: hitPos.clone(), crit: o.crit, type: o.type });
    if (target.hp <= 0.01 && !target.dead) this.kill(src, target, dir);
    return total;
  }

  heal(src, target, amount, o = {}) {
    if (!target || target.dead) return 0;
    const a = Math.max(0, Math.min(amount, target.maxHp - target.hp));
    target.hp += a;
    if (src && !o.noUlt && src !== target) src.ult = Math.min(src.def.ultCost, src.ult + a * RULES.ultPerHeal);
    if (src) src.healingDone += a;
    if (a > 0.5 && !o.silent) this.emit('heal', { src, target, amount: a });
    return a;
  }

  kill(src, target, dir) {
    target.hp = 0;
    target.die(src, dir);
    if (src && src !== target) { src.kills++; src.ult = Math.min(src.def.ultCost, src.ult + RULES.killUlt); }
    this.score[1 - target.team] += 1;
    this.feed.push({ killer: src, victim: target, t: this.time });
    if (this.feed.length > 6) this.feed.shift();
    this.emit('kill', { killer: src, victim: target });
    const p = target.center || target.pos;
    this.sfx('death', p, { vol: 0.9, important: true });
    this.fx.sparks(p, UP, { n: 24, speed: 10, life: 0.6 });
    this.fx.glow(p, { color: [3, 3, 3, 1], size: 3, life: 0.25 });
    if (this.settings.comic && src && (src.isPlayer || target.isPlayer)) this.fx.comic(_v.copy(p).add(_w.set(0, 1.2, 0)), 'K.O.!', { fill: '#ffd400', size: 2.6, life: 0.9 });
  }

  respawn(h) {
    const sp = ARENA.spawns[h.team];
    h.revive(null, 1);
    h.spawnAt(sp);
    h.ult = h.ult; // keep ult
    this.fx.pillar(h.pos, { color: h.team === 0 ? 0x4fb4ff : 0xff3b4a, height: 18, radius: 1.4, life: 1.4 });
    this.fx.ring(h.pos, { color: h.team === 0 ? 0x4fb4ff : 0xff3b4a, r1: 5, life: 0.6, intensity: 2 });
    this.sfx('respawn', h.pos, { vol: 0.7 });
    this.emit('respawn', { hero: h });
  }

  // ------------------------------------------------------------------ fx helpers
  sfx(name, pos, o = {}) { if (!this.audio) return null; return this.audio.play(name, { pos, ...o }); }
  shakeAt(pos, amount) {
    if (!this.camRig) return;
    const d = this.camRig.cam.position.distanceTo(pos);
    const k = clamp(1 - d / 60, 0, 1);
    this.camRig.addTrauma(amount * (0.25 + 0.75 * k));
  }
  /**
   * Freeze the world briefly on a heavy hit, but only around the local player (src is the hitter).
   * Hitstop is global, so with six heroes brawling a freeze for every far-off hit would stall the
   * game ~15% of the time; bot-only scenes (the title brawl) skip it.
   */
  hitstop(t, src) {
    const p = this.heroes.find((x) => x.isPlayer);
    if (!p || !src || (src !== p && src.pos.distanceToSquared(p.pos) > 14 * 14)) return;
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  // ------------------------------------------------------------------ orbs
  makeOrbs() {
    const pts = [[-40, -18], [40, 18], [40, -18], [-40, 18]];
    const geo = new THREE.IcosahedronGeometry(0.42, 2);
    const ringGeo = new THREE.TorusGeometry(0.75, 0.04, 8, 48);
    for (const [x, z] of pts) {
      const g = new THREE.Group();
      g.position.set(x, 1.2, z);
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3.2, 1.6) }));
      const r1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 1.4), transparent: true, opacity: 0.9 }));
      const r2 = r1.clone();
      g.add(core, r1, r2);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6 }));
      base.position.set(x, 0.12, z); base.receiveShadow = true;
      this.scene.add(g, base);
      this.orbs.push({ g, core, r1, r2, pos: new THREE.Vector3(x, 1.2, z), t: 0, active: true });
    }
  }
  updateOrbs(dt) {
    for (const o of this.orbs) {
      o.t += dt;
      o.g.position.y = 1.2 + Math.sin(o.t * 2) * 0.15;
      o.r1.rotation.set(o.t * 1.3, o.t * 0.7, 0); o.r2.rotation.set(-o.t * 0.9, 0, o.t * 1.1);
      if (!o.active) {
        o.respawn -= dt;
        o.g.visible = false;
        if (o.respawn <= 0) { o.active = true; o.g.visible = true; this.fx.ring(o.pos, { color: 0x55ff99, r1: 2.5, life: 0.5 }); }
        continue;
      }
      if (Math.random() < dt * 8) this.fx.add.spawn({ p: [o.pos.x + rand(-0.4, 0.4), o.g.position.y + rand(-0.3, 0.3), o.pos.z + rand(-0.4, 0.4)], v: [0, rand(0.6, 1.4), 0], life: 0.8, size: 0.07, size1: 0.01, color: [0.6, 3, 1.4, 1], color1: [0.6, 3, 1.4, 0], shape: SHAPE.STAR });
      for (const h of this.heroes) {
        if (h.dead || h.hp >= h.maxHp - 1) continue;
        if (h.pos.distanceToSquared(_v.set(o.pos.x, h.pos.y, o.pos.z)) < 1.6 && Math.abs(h.pos.y - 0.5) < 2.2) {
          this.heal(null, h, RULES.orbHeal);
          o.active = false; o.respawn = RULES.orbRespawn;
          this.fx.healBurst(h.pos);
          this.fx.glow(o.pos, { color: [0.6, 3, 1.4, 1], size: 3, life: 0.3 });
          this.sfx('heal_pulse', o.pos, { vol: 0.6 });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    for (const h of this.heroes) h.update(dt, this.time);
    // hero-hero separation
    const H = this.heroes;
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
      const a = H[i], b = H[j];
      if (a.dead || b.dead || a.carriedBy === b || b.carriedBy === a || a.override || b.override) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      if (Math.abs(dy) > 1.6) continue;
      const d = Math.hypot(dx, dz), R = a.radius + b.radius;
      if (d < R && d > 1e-4) { const k = (R - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
    }
    this.projectiles = this.projectiles.filter((p) => p.update(dt));
    this.zones = this.zones.filter((z) => z.update(dt) !== false);
    this.barriers = this.barriers.filter((b) => b.update(dt) !== false);
    this.updateOrbs(dt);
  }
}

function segPointDist2(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t - p.x, y = a.y + aby * t - p.y, z = a.z + abz * t - p.z;
  return x * x + y * y + z * z;
}
function rayCyl(o, d, c) {
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return -1;
  const b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return -1;
  const y = o.y + d.y * t;
  return y >= 0 && y <= c.h ? t : -1;
}
function rayBox(o, d, mn, mx) {
  let tmin = -Infinity, tmax = Infinity, nAxis = -1, nSign = 0;
  for (let i = 0; i < 3; i++) {
    const k = ['x', 'y', 'z'][i];
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return null; continue; }
    let t1 = (mn[k] - o[k]) / d[k], t2 = (mx[k] - o[k]) / d[k];
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = i; nSign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;
  const n = new THREE.Vector3(); if (nAxis >= 0) n.setComponent(nAxis, nSign);
  return { t: tmin, n };
}
