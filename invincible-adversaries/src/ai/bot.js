import * as THREE from 'three';
import { clamp, clamp01, rand, randSign, yawOf, damp, noise1 } from '../engine/math.js';
import { ARENA, terrainY } from '../world/arena.js';
import { NavGrid } from './nav.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

const DIFF = {
  easy: { react: 0.45, aimErr: 0.11, turn: 4, aggression: 0.5, abilityRate: 0.35 },
  normal: { react: 0.28, aimErr: 0.06, turn: 7, aggression: 0.75, abilityRate: 0.65 },
  hard: { react: 0.16, aimErr: 0.03, turn: 11, aggression: 1, abilityRate: 1 },
};

export class Bot {
  constructor(hero, world) {
    this.h = hero; this.w = world;
    this.target = null; this.retarget = 0;
    this.strafe = randSign(); this.strafeT = rand(0.6, 1.8);
    this.thinkT = 0;
    this.aim = new THREE.Vector3(0, 0, 1);
    this.errPhase = rand(0, 100);
    this.flyWant = false; this.flyT = rand(2, 5);
    this.jumpT = rand(1, 4);
    this.decisionCD = {};
    this.seen = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.ultT = 0;
    this.preferRange = { invincible: 2.2, omniman: 2.5, eve: 18, robot: 16, rex: 13, battlebeast: 2.6 }[hero.key];
    this.ranged = hero.key === 'eve' || hero.key === 'robot' || hero.key === 'rex';
    this.braceFor = 0;
    this.paths = {}; // per purpose (the objective, a target): { path, i, repathT, goal }
    this.noFlyT = 0; this.descendT = 0; this.descendDir = null;
  }
  get d() { return DIFF[this.w.settings.difficulty] || DIFF.normal; }

  update(dt) {
    const h = this.h, w = this.w, it = h.intents;
    // reset one-shot intents
    it.jump = false; it.flyToggle = false; it.primaryPressed = false; it.secondaryPressed = false;
    it.a1 = it.a2 = it.a3 = it.ult = false; it.choice = null;
    it.primary = false; it.secondary = false; it.up = false; it.down = false;
    it.mx = 0; it.mz = 0;
    if (h.dead) return;
    const mode = w.settings.bots;
    if (mode === 'idle') { this.faceDefault(it); return; }
    // target selection
    this.retarget -= dt;
    const obj = w.mode ? w.mode.objective(h.team) : null;
    this.obj = obj;
    if (this.retarget <= 0 || !this.target || !this.target.targetable) { this.pickTarget(); this.retarget = rand(0.6, 1.2); }
    const t = this.target;
    // a match objective: travel to it along the ground paths unless a fight is right here
    if (obj && this.toObjective(dt, it, obj, t)) return;
    if (!t) { this.wander(dt, it); this.faceDefault(it); return; }
    // perception delay
    this.seen = Math.min(1, this.seen + dt / this.d.react);
    const tp = t.center || t.pos;
    const dist = h.pos.distanceTo(t.pos);
    // aim (with lead for projectile heroes)
    const lead = h.key === 'eve' ? clamp(dist / 95, 0, 0.5) : h.key === 'robot' ? clamp(dist / 140, 0, 0.4) : h.key === 'rex' ? clamp(dist / 75, 0, 0.6) : (h.key === 'omniman' ? clamp(dist / 42, 0, 0.8) : 0);
    _v.copy(tp).addScaledVector(t.vel, lead);
    if (h.key === 'omniman' && dist > 8) _v.y += dist * 0.012;
    if (h.key === 'rex' && dist > 10) _v.y += dist * 0.004;
    // error noise
    const e = this.d.aimErr * (1.2 - this.seen * 0.4);
    this.errPhase += dt * 1.3;
    _w.set(noise1(this.errPhase), noise1(this.errPhase + 37), noise1(this.errPhase + 71)).multiplyScalar(e * Math.max(3, dist));
    _v.add(_w);
    const origin = _u.copy(h.pos); origin.y += h.height * 0.85;
    const want = _w.subVectors(_v, origin).normalize();
    this.aim.lerp(want, clamp(this.d.turn * dt, 0, 1)).normalize();
    it.aimDir.copy(this.aim);
    it.aimOrigin.copy(origin);
    it.aimPoint.copy(origin).addScaledVector(this.aim, Math.max(1, origin.distanceTo(_v)));
    it.aimHero = this.aim.dot(want) > 0.97 ? t : null;
    // hit and run: the squishier heroes break off a trade they are losing, recover (regen, orbs)
    // and come back, instead of trading blows until they drop
    const hpf = h.hp / h.maxHp, thpf = t.hp / t.maxHp;
    if (h.key !== 'omniman') {
      if (!this.regroup && hpf < 0.45 && thpf > hpf + 0.1 && w.time - h.lastHurt < 2) this.regroup = true;
      else if (this.regroup && (hpf > 0.85 || thpf < 0.2)) this.regroup = false;
    }
    // movement & tactics
    this.navigate(dt, it, t, dist);
    if (obj) this.leash(dt, it, obj);
    this.keepOutOfSpawn(it);
    if (mode === 'passive') return;
    this.fight(dt, it, t, dist);
  }

  faceDefault(it) {
    const h = this.h;
    it.aimDir.set(-h.pos.x, 0, -h.pos.z).normalize();
    if (it.aimDir.lengthSq() < 0.5) it.aimDir.set(0, 0, 1);
    it.aimOrigin.copy(h.pos); it.aimPoint.copy(h.pos).addScaledVector(it.aimDir, 10);
  }

  pickTarget() {
    const h = this.h, w = this.w, obj = this.obj;
    let best = null, bs = -Infinity;
    for (const e of w.heroes) {
      if (e.team === h.team || !e.targetable) continue;
      const d = e.pos.distanceTo(h.pos);
      let s = -d - (e.hp / e.maxHp) * 15;
      // with an objective, the enemies on it matter most
      if (obj) s -= e.pos.distanceTo(obj.pos) * 0.6;
      if (e.isPlayer) s += 6; // favour the player a bit so testing is lively
      if (e === this.target) s += 5;
      if (s > bs) { bs = s; best = e; }
    }
    if (best !== this.target) this.seen = 0;
    this.target = best;
  }

  /** the map's nav grid (built on first use, rebuilt when the map changes) */
  nav() {
    const w = this.w;
    if (!w.nav || w.navFor !== w.obstacles) { w.nav = new NavGrid(w); w.navFor = w.obstacles; }
    return w.nav;
  }
  /** the next waypoint toward goal, repathing as the goal moves or the path goes stale */
  waypoint(dt, goal, slot = 'obj') {
    const h = this.h;
    const st = this.paths[slot] || (this.paths[slot] = { path: null, i: 0, repathT: 0, goal: new THREE.Vector3(1e9, 0, 0), t: 0 });
    st.repathT -= this.w.time - st.t; st.t = this.w.time;
    if (!st.path || st.repathT <= 0 || st.goal.distanceToSquared(goal) > 25) {
      st.path = this.nav().find(h.pos, goal) || [goal.clone()];
      st.goal.copy(goal); st.repathT = rand(1.4, 2.2); st.i = 0;
    }
    const P = st.path;
    while (st.i < P.length - 1 && Math.hypot(P[st.i].x - h.pos.x, P[st.i].z - h.pos.z) < 2.4) st.i++;
    return P[st.i];
  }
  /** steer the move intents toward point p (relative to the aim) */
  steer(it, p, k = 1) {
    const h = this.h;
    const toP = yawOf(_w.set(p.x - h.pos.x, 0, p.z - h.pos.z)) - yawOf(it.aimDir);
    it.mz += Math.cos(toP) * k; it.mx += -Math.sin(toP) * k;
  }
  /**
   * Objective play: with no fight at hand, travel to the objective (fliers low over the path);
   * returns true when it took the frame. Fighting near it is the normal combat code, leashed.
   */
  toObjective(dt, it, obj, t) {
    const h = this.h, w = this.w;
    const dObj = Math.hypot(obj.pos.x - h.pos.x, obj.pos.z - h.pos.z);
    const dT = t ? h.pos.distanceTo(t.pos) : Infinity;
    const visible = t && dT < 34 && w.lineOfSight(_u.copy(h.pos).setY(h.pos.y + h.height * 0.85), t.center || t.pos);
    const engage = t && (dT < 13 || (visible && dObj < obj.radius + 30));
    if (engage) return false;
    // stranded up on a roof over it: get down
    const above = h.pos.y - obj.pos.y;
    if (above > 4 && h.grounded && dObj < 40 && this.descend(dt, it)) return true;
    // on it with nobody to fight: hold there, facing where they'll come from
    if (dObj < obj.radius && Math.abs(above) < 4) {
      if (t) { _v.subVectors(t.pos, h.pos).setY(0); if (_v.lengthSq() > 1e-4) it.aimDir.copy(_v.normalize()); it.aimOrigin.copy(h.pos); it.aimPoint.copy(h.pos).addScaledVector(it.aimDir, 10); }
      else this.faceDefault(it);
      if (h.mode === 'fly' && !h.override && h.pos.y - obj.pos.y > 3) it.down = true;
      return true;
    }
    // on the way: aim and move along the path
    const wp = this.waypoint(dt, obj.pos);
    const fly = h.def.flight && !h.disrupted && (h.def.flight.unlimited || h.flyEnergy > 0.35) && dObj > 35;
    const alt = fly ? 4.5 : 0;
    _v.set(wp.x, wp.y + alt + h.height * 0.6, wp.z);
    const origin = _u.copy(h.pos); origin.y += h.height * 0.85;
    const dir = _w.subVectors(_v, origin);
    if (!fly) dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    this.aim.lerp(dir, clamp(this.d.turn * dt, 0, 1)).normalize();
    it.aimDir.copy(this.aim); it.aimOrigin.copy(origin); it.aimPoint.copy(origin).addScaledVector(this.aim, 10);
    it.mz = 1; it.mx = 0;
    if (fly) {
      if (h.mode !== 'fly') { if (h.grounded) it.jump = true; else it.flyToggle = true; }
      const dy = wp.y + alt - h.pos.y;
      if (dy > 1) it.up = true; else if (dy < -1.5) it.down = true;
    } else if (h.mode === 'fly' && !h.override) it.down = true;
    // stuck on something: hop, then repath
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.lastPos.distanceTo(h.pos) < 0.7) { it.jump = true; for (const k in this.paths) this.paths[k].repathT = 0; }
      this.lastPos.copy(h.pos); this.stuckT = 0;
    }
    return true;
  }
  /** a move straight into a wall turns along it instead (toward whichever side is open) */
  slide(it) {
    const h = this.h, nav = this.nav();
    const l = Math.hypot(it.mx, it.mz);
    if (l < 0.2 || h.pos.y - terrainY(h.pos.x, h.pos.z) > 1.5) return;
    const ay = yawOf(it.aimDir);
    const yaw = ay + Math.atan2(-it.mx, it.mz);
    const open = (yy) => { const [i, k] = nav.cell(h.pos.x + Math.sin(yy) * 2.2, h.pos.z + Math.cos(yy) * 2.2); return nav.isOpen(i, k); };
    if (open(yaw)) return;
    for (const d of [0.6, -0.6, 1.2, -1.2, 1.57, -1.57]) {
      const sd = this.strafe < 0 ? -d : d;
      if (open(yaw + sd)) { const rel = yaw + sd - ay; it.mz = Math.cos(rel) * l; it.mx = -Math.sin(rel) * l; return; }
    }
  }
  /**
   * Up on a roof (or a wreck) with business below: walk off the nearest edge. Probes around for
   * the direction where the ground drops back to street level soonest.
   */
  descend(dt, it) {
    const h = this.h, w = this.w;
    this.descendT -= dt;
    if (this.descendT <= 0 || !this.descendDir) {
      this.descendT = 1;
      let best = null, bd = Infinity;
      for (let a = 0; a < 16; a++) {
        const yy = (a / 16) * Math.PI * 2;
        for (const r of [2, 4, 7, 11, 16]) {
          const x = h.pos.x + Math.sin(yy) * r, z = h.pos.z + Math.cos(yy) * r;
          if (w.groundAt(x, z) - terrainY(x, z) < 0.6) { if (r < bd) { bd = r; best = yy; } break; }
        }
      }
      this.descendDir = best;
    }
    if (this.descendDir == null) return false;
    const rel = this.descendDir - yawOf(it.aimDir);
    it.mz = Math.cos(rel); it.mx = -Math.sin(rel);
    if (h.mode === 'fly') it.down = true;
    return true;
  }

  /** never wander into the enemy's spawn room (it burns) */
  keepOutOfSpawn(it) {
    const w = this.w, h = this.h;
    if (!w.mode || !w.mode.enemyRoom) return;
    const r = w.mode.enemyRoom(h.team), m = 3;
    if (h.pos.x < r[0] - m || h.pos.x > r[2] + m || h.pos.z < r[1] - m || h.pos.z > r[3] + m) return;
    // step back the way out: away from the room's middle
    const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
    it.mx = 0; it.mz = 0;
    this.steer(it, _v.set(h.pos.x + (h.pos.x - cx), 0, h.pos.z + (h.pos.z - cz)), 1);
  }
  /** fighting near the objective: don't let the fight drag the bot away from it */
  leash(dt, it, obj) {
    const h = this.h;
    const dObj = Math.hypot(obj.pos.x - h.pos.x, obj.pos.z - h.pos.z);
    const far = obj.radius + (obj.attack ? 3 : 10);
    if (dObj < far) return;
    const wp = this.waypoint(dt, obj.pos);
    const k = clamp((dObj - far) / 10, 0.35, 1.2);
    this.steer(it, wp, k);
    const l = Math.hypot(it.mx, it.mz); if (l > 1) { it.mx /= l; it.mz /= l; }
  }

  wander(dt, it) {
    const h = this.h;
    _v.set(-h.pos.x, 0, -h.pos.z);
    if (_v.length() > 20) { _v.normalize(); it.mz = 1; }
  }

  navigate(dt, it, t, dist) {
    const h = this.h, w = this.w, d = this.d;
    const k = h.key;
    // strafing rhythm
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = Math.random() < 0.15 ? 0 : randSign(); this.strafeT = rand(0.6, 1.8); }
    // flight decisions
    this.flyT -= dt;
    if (this.flyT <= 0) {
      this.flyT = rand(2.5, 6);
      const p = !h.def.flight ? 0 : k === 'invincible' ? 0.55 : k === 'eve' ? 0.35 : k === 'robot' ? 0.3 : 0.25;
      this.flyWant = !!h.def.flight && (Math.random() < p || t.mode === 'fly' && t.pos.y > 4);
    }
    if (this.regroup && k === 'invincible') this.flyWant = true;
    if (h.def.flight && !h.def.flight.unlimited && h.flyEnergy < 0.15) this.flyWant = false;
    this.noFlyT -= dt;
    if (this.noFlyT > 0) this.flyWant = false;
    if (this.flyWant && h.mode !== 'fly') { if (h.grounded) it.jump = true; else it.flyToggle = true; }
    if (!this.flyWant && h.mode === 'fly' && !h.override) it.down = true;
    // desired range
    let range = this.preferRange;
    if (this.ranged) range = clamp(range, 12, 26);
    const low = h.hp / h.maxHp < 0.3;
    if (low && k !== 'omniman') range += 12;
    if (this.regroup) range = Math.max(range, 34);
    // Rex charging up runs straight at them
    if (k === 'rex' && h.kit.ultState) range = 1;
    // move toward / away
    _v.subVectors(t.pos, h.pos); _v.y = 0;
    const flat = _v.length();
    const yawToT = yawOf(_v);
    const aimYaw = yawOf(it.aimDir);
    let fwd = 0;
    if (flat > range + 2) fwd = 1;
    else if (flat < range - 2 && (this.ranged || this.regroup)) fwd = -1;
    else if (!this.ranged && !this.regroup) fwd = flat > 1.6 ? 1 : 0;
    // convert desired movement (toward target + strafe) into intents relative to aim yaw
    let rel = yawToT - aimYaw;
    // (on a map with walls between them, closing in follows the ground path instead)
    if (fwd > 0 && ARENA.rect && h.mode !== 'fly' && flat > 6 && !this.nav().walkable(h.pos.x, h.pos.z, t.pos.x, t.pos.z)) {
      const wp = this.waypoint(dt, t.pos, 'tgt');
      rel = yawOf(_w.set(wp.x - h.pos.x, 0, wp.z - h.pos.z)) - aimYaw;
    }
    const mz = Math.cos(rel) * fwd, mx = -Math.sin(rel) * fwd;
    it.mz = mz; it.mx = mx;
    const strafeAmt = this.ranged ? 0.9 : (flat < 6 ? 0.6 : 0.35);
    it.mx += this.strafe * strafeAmt;
    // vertical matching in flight
    if (h.mode === 'fly') {
      const dy = (t.pos.y + (k === 'eve' ? 3 : k === 'robot' ? 1.5 : 0.5)) - h.pos.y;
      if (dy > 1.5) it.up = true; else if (dy < -1.5) it.down = true;
      if (h.pos.y > 40) it.down = true;
    }
    // occasional jumps on ground
    this.jumpT -= dt;
    if (this.jumpT <= 0 && h.grounded) { this.jumpT = rand(1.5, 4); if (Math.random() < 0.4) it.jump = true; }
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.lastPos.distanceTo(h.pos) < 0.6 && (Math.abs(it.mx) + Math.abs(it.mz)) > 0.5) {
        it.jump = true; this.strafe = -this.strafe || 1;
        // (a flier pinned against a roof or a wall lands and walks round instead)
        if (h.mode === 'fly' && ARENA.rect) { this.flyWant = false; this.noFlyT = rand(3, 5); }
      }
      this.lastPos.copy(h.pos); this.stuckT = 0;
    }
    if (ARENA.rect && h.mode !== 'fly') this.slide(it);
    // keep away from boundary
    const R = Math.hypot(h.pos.x, h.pos.z);
    if (!ARENA.rect && R > ARENA.plazaR * 1.2) { const toC = yawOf(_w.set(-h.pos.x, 0, -h.pos.z)) - aimYaw; it.mz += Math.cos(toC); it.mx += -Math.sin(toC); }
    // health orbs when low and not engaged
    if (low && k !== 'omniman') {
      let best = null, bd = 60;
      for (const o of w.orbs) if (o.active) { const dd = o.pos.distanceTo(h.pos); if (dd < bd) { bd = dd; best = o; } }
      if (best) { const toO = yawOf(_w.subVectors(best.pos, h.pos)) - aimYaw; it.mz = Math.cos(toO); it.mx = -Math.sin(toO); if (h.mode === 'fly') it.down = true; }
    }
    const l = Math.hypot(it.mx, it.mz); if (l > 1) { it.mx /= l; it.mz /= l; }
  }

  can(key, chance = 1) {
    const kit = this.h.kit;
    if (!kit.ready(key)) return false;
    this.decisionCD[key] = (this.decisionCD[key] || 0);
    if (this.w.time < this.decisionCD[key]) return false;
    if (Math.random() > chance * this.d.abilityRate) { this.decisionCD[key] = this.w.time + rand(0.3, 0.9); return false; }
    this.decisionCD[key] = this.w.time + rand(0.8, 1.6);
    return true;
  }

  fight(dt, it, t, dist) {
    const h = this.h, w = this.w, k = h.key;
    if (this.seen < 0.6) return;
    const aimed = it.aimHero === t;
    const los = w.lineOfSight(it.aimOrigin, t.center || t.pos);
    const allies = w.alliesOf(h);
    const enemiesNear = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(h.pos) < 12).length;
    // ---- ultimates ----
    if (h.ultReady) {
      this.ultT += dt;
      if (this.ultT > 1.2 && Math.random() < dt * 1.5) {
        if (k === 'eve') {
          const deadAlly = w.heroes.some((x) => x.team === h.team && x.dead);
          if (deadAlly || (los && dist < 45)) { it.ult = true; this.ultChoice = deadAlly ? 'revive' : 'beam'; }
        } else if (k === 'omniman') { if (dist < 30 && los) it.ult = true; }
        else if (k === 'rex') {
          const close = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(h.pos) < 13).length;
          if (close >= 2 || dist < 7 || (dist < 16 && this.ultT > 5)) it.ult = true;
        } else if (k === 'battlebeast') {
          const close = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(h.pos) < 15).length;
          if ((close >= 2 || h.hp / h.maxHp < 0.5 || this.ultT > 5) && dist < 15) it.ult = true;
        }
        else if (k === 'robot') {
          // the override pays off with several heroes in the wave
          const foes = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(h.pos) < 30).length;
          const mates = allies.filter((a) => a.pos.distanceTo(h.pos) < 30).length;
          if (foes >= 2 || (foes >= 1 && mates >= 1) || (dist < 20 && this.ultT > 4)) it.ult = true;
        }
        else if (dist < 40) it.ult = true;
      }
    } else this.ultT = 0;
    // during Eve's choice
    if (k === 'eve' && h.kit.ultState && h.kit.ultState.phase === 'choose') { it.choice = this.ultChoice || 'beam'; return; }
    if (k === 'eve' && h.kit.ultState && h.kit.ultState.phase === 'beam') { it.primary = true; return; }
    // during Invincible's ult aim phase
    if (k === 'invincible' && h.override && h.kit.seq && h.override === h.kit.seq && h.kit.seq.phase === 'aim') {
      it.aimPoint.copy(t.pos).addScaledVector(t.vel, 0.7);
      if (h.kit.seq.t > 0.9) it.primaryPressed = true;
      return;
    }
    if (h.override) return;
    if (this.regroup && k === 'invincible' && dist > 3) return; // disengaging (still swings if cornered)
    if (k === 'invincible') {
      if (dist < 3.6) { it.primary = true; if (dist < 3 && this.can('a3', 0.25)) it.a3 = true; }
      else if (dist < 15 && los && aimed && this.can('secondary', 0.4)) it.secondaryPressed = true;
      if (dist > 12 && dist < 32 && los && this.can('a1', 0.5)) it.a1 = true;
      else if (dist > 9 && dist < 42 && t.grounded && this.can('a2', 0.45)) { it.a2 = true; it.aimHero = t; it.aimPoint.copy(t.pos); }
      if (dist < 7.5 && aimed) it.primary = true;
    } else if (k === 'omniman') {
      if (dist < 3.8) it.primary = true;
      if (dist < 6 && aimed) it.primary = true;
      if (dist > 8 && dist < 38 && los && aimed && this.can('secondary', 0.5)) it.secondaryPressed = true;
      if (dist > 7 && dist < 22 && los && this.can('a1', 0.45)) it.a1 = true;
      if (dist < 16 && aimed && (enemiesNear >= 2 || Math.random() < 0.4) && this.can('a2', 0.5)) it.a2 = true;
      if ((h.hp / h.maxHp < 0.6 || enemiesNear >= 2) && dist < 12 && this.can('a3', 0.6)) it.a3 = true;
    } else if (k === 'eve') {
      if (los && dist < 60 && it.aimDir.dot(_v.subVectors(t.center, it.aimOrigin).normalize()) > 0.93) it.primary = true;
      if (los && dist < 35 && aimed && this.can('secondary', 0.4)) it.secondaryPressed = true;
      // bubble an ally under pressure, or self
      if (this.h.kit.ready('a1')) {
        let pick = null;
        for (const a of allies) if (a.hp / a.maxHp < 0.6 && w.time - a.lastHurt < 1.2 && !a.bubble && a.pos.distanceTo(h.pos) < 40) { pick = a; break; }
        if (!pick && h.hp / h.maxHp < 0.5 && w.time - h.lastHurt < 1 && !h.bubble) pick = h;
        if (pick && this.can('a1', 0.8)) {
          it.a1 = true;
          if (pick !== h) { it.aimDir.copy(_w.subVectors(pick.center, it.aimOrigin).normalize()); }
          else it.aimDir.set(0, -1, 0);
        }
      }
      if (dist < 26 && los && (enemiesNear >= 2 || t.key === 'omniman') && this.can('a2', 0.35)) it.a2 = true;
      const hurt = allies.concat([h]).filter((a) => a.pos.distanceTo(h.pos) < 15 && a.hp / a.maxHp < 0.65).length;
      if (hurt >= 1 && this.can('a3', 0.6)) it.a3 = true;
    } else if (k === 'rex') {
      // a rod is out: set it off when someone is in its blast
      const armed = h.kit.rods.filter((r) => r.armed);
      if (armed.some((r) => r.stuck || w.heroes.some((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(r.pos) < 4))) it.secondaryPressed = true;
      else if (!armed.length && los && dist < 26 && aimed && this.can('secondary', 0.5)) it.secondaryPressed = true;
      if (los && dist < 60 && it.aimDir.dot(_v.subVectors(t.center, it.aimOrigin).normalize()) > 0.95) it.primary = true;
      const grouped = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(t.pos) < 6).length;
      // someone diving onto him gets the grenade at their feet (it blows them up and away, and him clear)
      // and the coin fan in the face, instead of being chased down while he backs off
      const onHim = dist < 7;
      if (dist < 22 && los && (t.grounded || grouped >= 2 || onHim) && this.can('a2', onHim ? 0.8 : 0.5)) it.a2 = true;
      if (dist < 9 && los && aimed && this.can('a3', dist < 5 ? 0.9 : 0.6)) it.a3 = true;
      // blast jumps: close in on a far target, or get out when it goes badly (the movement keys aim the jump)
      const hurt = h.hp / h.maxHp;
      if ((dist > 28 || (hurt < 0.5 && onHim) || (hurt < 0.35 && dist < 10) || t.pos.y - h.pos.y > 6) && this.can('a1', 0.4)) it.a1 = true;
    } else if (k === 'battlebeast') {
      // brace against fire while closing the gap; let go when he gets there
      if (this.braceFor > 0) {
        this.braceFor -= dt;
        if (dist > 4 && this.braceFor > 0) { it.secondary = true; return; }
        this.braceFor = 0;
      }
      if (dist < 4) it.primary = true;
      if (dist < 6.5 && aimed) it.primary = true;
      if (dist > 8 && dist < 30 && los && this.can('a1', 0.5)) { it.a1 = true; it.aimHero = t; }
      if ((enemiesNear >= 2 || h.hp / h.maxHp < 0.6) && dist < 12 && this.can('a2', 0.5)) it.a2 = true;
      if (dist < 3.6 && aimed && this.can('a3', 0.4)) it.a3 = true;
      if (!h.kit.bracing && dist > 7 && w.time - h.lastHurt < 0.4 && h.hp / h.maxHp < 0.85 && this.can('secondary', 0.35)) { it.secondary = true; this.braceFor = rand(0.8, 1.6); }
    } else if (k === 'robot') {
      if (los && dist < 70 && it.aimDir.dot(_v.subVectors(t.center, it.aimOrigin).normalize()) > 0.95) it.primary = true;
      if (los && dist < 45 && aimed && this.can('secondary', 0.45)) it.secondaryPressed = true;
      // a barrier toward the target when the team is taking fire
      const pressed = allies.concat([h]).some((a) => w.time - a.lastHurt < 0.8 && a.pos.distanceTo(h.pos) < 14);
      if (pressed && dist > 7 && dist < 40 && los && this.can('a1', 0.6)) it.a1 = true;
      // EMP a group, a flier, a target hiding behind a bubble or overhealth, or a diver closing in
      const grouped = w.heroes.filter((e) => e.team !== h.team && e.targetable && e.pos.distanceTo(t.pos) < 7).length;
      if (dist < 28 && los && (grouped >= 2 || t.mode === 'fly' || t.bubble || t.overhealth > 50 || (dist < 12 && (t.key === 'invincible' || t.key === 'omniman'))) && this.can('a2', 0.55)) it.a2 = true;
      const hurt = allies.concat([h]).filter((a) => a.pos.distanceTo(h.pos) < 25 && a.hp / a.maxHp < 0.7).length;
      if (hurt >= 1 && this.can('a3', 0.6)) it.a3 = true;
    }
  }
}
