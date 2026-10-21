import * as THREE from 'three';
import { clamp, clamp01, rand, randSign, yawOf, damp, noise1 } from '../engine/math.js';
import { ARENA } from '../world/arena.js';

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
    this.preferRange = { invincible: 2.2, omniman: 2.5, eve: 18, robot: 16 }[hero.key];
    this.ranged = hero.key === 'eve' || hero.key === 'robot';
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
    if (this.retarget <= 0 || !this.target || !this.target.targetable) { this.pickTarget(); this.retarget = rand(0.6, 1.2); }
    const t = this.target;
    if (!t) { this.wander(dt, it); this.faceDefault(it); return; }
    // perception delay
    this.seen = Math.min(1, this.seen + dt / this.d.react);
    const tp = t.center || t.pos;
    const dist = h.pos.distanceTo(t.pos);
    // aim (with lead for projectile heroes)
    const lead = h.key === 'eve' ? clamp(dist / 95, 0, 0.5) : h.key === 'robot' ? clamp(dist / 140, 0, 0.4) : (h.key === 'omniman' ? clamp(dist / 42, 0, 0.8) : 0);
    _v.copy(tp).addScaledVector(t.vel, lead);
    if (h.key === 'omniman' && dist > 8) _v.y += dist * 0.012;
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
    const h = this.h, w = this.w;
    let best = null, bs = -Infinity;
    for (const e of w.heroes) {
      if (e.team === h.team || !e.targetable) continue;
      const d = e.pos.distanceTo(h.pos);
      let s = -d - (e.hp / e.maxHp) * 15;
      if (e.isPlayer) s += 6; // favour the player a bit so testing is lively
      if (e === this.target) s += 5;
      if (s > bs) { bs = s; best = e; }
    }
    if (best !== this.target) this.seen = 0;
    this.target = best;
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
      const p = k === 'invincible' ? 0.55 : k === 'eve' ? 0.35 : k === 'robot' ? 0.3 : 0.25;
      this.flyWant = Math.random() < p || t.mode === 'fly' && t.pos.y > 4;
    }
    if (this.regroup && k === 'invincible') this.flyWant = true;
    if (h.def.flight && !h.def.flight.unlimited && h.flyEnergy < 0.15) this.flyWant = false;
    if (this.flyWant && h.mode !== 'fly') { if (h.grounded) it.jump = true; else it.flyToggle = true; }
    if (!this.flyWant && h.mode === 'fly' && !h.override) it.down = true;
    // desired range
    let range = this.preferRange;
    if (this.ranged) range = clamp(range, 12, 26);
    const low = h.hp / h.maxHp < 0.3;
    if (low && k !== 'omniman') range += 12;
    if (this.regroup) range = Math.max(range, 34);
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
    const rel = yawToT - aimYaw;
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
      if (this.lastPos.distanceTo(h.pos) < 0.6 && (Math.abs(it.mx) + Math.abs(it.mz)) > 0.5) { it.jump = true; this.strafe = -this.strafe || 1; }
      this.lastPos.copy(h.pos); this.stuckT = 0;
    }
    // keep away from boundary
    const R = Math.hypot(h.pos.x, h.pos.z);
    if (R > ARENA.plazaR * 1.2) { const toC = yawOf(_w.set(-h.pos.x, 0, -h.pos.z)) - aimYaw; it.mz += Math.cos(toC); it.mx += -Math.sin(toC); }
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
