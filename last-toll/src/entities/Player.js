import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/math.js';

// First-person survivor: movement, stamina, health, hunger-capped max health,
// being grabbed by walkers and struggling free.
//
// On raised floors (a ship's deck, stairs) the survivor stands on whatever floor is
// underfoot and falls off ledges. Where the world has open water, walking off an
// edge drops you in: you swim at the surface, and with dive gear you can go under
// on a tank of air. Climbing ladders and riding in a boat are driven from outside
// (mode 'climb' and 'seat').

const _f = new THREE.Vector3();

export class Player {
  constructor({ camera, world, audio, input }) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.input = input;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeH = 1.62;
    this.radius = 0.34;
    this.crouched = false;
    this.sprinting = false;
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaDelay = 0;
    this.regenBoost = 0;
    this.adrenaline = 0;
    this.dead = false;
    this.grabbers = [];
    this.struggle = 0;
    this.stepT = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.shake = 0;
    this.kick = { pitch: 0, yaw: 0 };
    this.lookLock = 0;
    this.flashlightOn = false;
    this.disguise = 0;
    this.battery = 100;
    this.heal = { remaining: 0, rate: 0 };
    this.using = null; // { item, t, dur, onDone }
    this.hurtT = 0;
    this.speedMul = 1;
    this.nudgeV = new THREE.Vector2();
    this.onDamage = null;
    this.onDeath = null;
    this.onBitten = null;
    this.noise = null; // (pos, radius) => void
    this.heartT = 0;
    // walk | fall | swim | dive | climb | seat
    this.mode = 'walk';
    this.vy = 0;
    this.diveGear = false;
    this.air = 1; // dive tank, 0..1
    this.airTime = 150; // seconds of air in a full tank
    this.breath = 1; // held breath without gear
    this.drownT = 0;
    this.onSplash = null;
    this.onLand = null;
    this.wading = false;
  }

  get inWater() { return this.mode === 'swim' || this.mode === 'dive'; }
  get underwater() { return this.eye.y < this.world.waterY - 0.05; }

  spawn(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.mode = 'walk';
    this.grabbers = [];
    this.dead = false;
    if (this.world.floorMode) {
      const g = this.world.heightAt(pos.x, pos.z, pos.y + 0.3);
      if (g !== null) this.pos.y = g;
      else if (this.world.swim) { this.mode = 'swim'; this.pos.y = this.world.waterY - 1.3; }
    }
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  get grabbed() { return this.grabbers.length > 0; }

  canBeGrabbed(w) {
    return !this.dead && this.grabbers.length < 3 && !this.grabbers.includes(w);
  }

  addGrabber(w) {
    if (this.grabbers.includes(w)) return;
    this.grabbers.push(w);
    if (this.grabbers.length === 1) this.struggle = 0;
    this.audio.hurt();
    this.shake = Math.max(this.shake, 0.4);
  }

  releaseGrabber(w) {
    const i = this.grabbers.indexOf(w);
    if (i >= 0) this.grabbers.splice(i, 1);
    if (this.grabbers.length === 0) this.struggle = 0;
  }

  // Mash shove to break a grab.
  struggleStep() {
    if (!this.grabbed) return false;
    if (this.stamina < 4) {
      this.audio.breath(1.2);
      return false;
    }
    this.spendStamina(9);
    this.struggle += 0.26 / Math.max(1, this.grabbers.length * 0.75);
    this.shake = Math.max(this.shake, 0.15);
    if (this.struggle >= 1) {
      const gs = this.grabbers.slice();
      this.grabbers = [];
      this.struggle = 0;
      for (const w of gs) {
        const dx = w.pos.x - this.pos.x, dz = w.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        w.shove(dx / d, dz / d, 1.1, 1.0);
      }
      return true;
    }
    return false;
  }

  bite(w) {
    this.releaseGrabber(w);
    this.audio.bite();
    this.damage(w.fresh ? 34 : 28, 'bite', w);
    this.onBitten?.(w);
  }

  damage(amount, kind = 'hit', src = null) {
    if (this.dead) return;
    // the sandbox's "can't be hurt": you still feel it land
    if (this.invulnerable) {
      this.hurtT = 0.4;
      this.shake = Math.max(this.shake, 0.25);
      this.audio.hurt();
      return;
    }
    this.health -= amount;
    this.hurtT = 1;
    this.shake = Math.max(this.shake, 0.5);
    this.audio.hurt();
    this.onDamage?.(amount, kind, src);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.onDeath?.(kind, src);
    }
  }

  spendStamina(n) {
    if (this.adrenaline > 0) return;
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.9;
  }

  // 0..1 multiplier used for melee power and aim steadiness.
  get staminaFactor() {
    return this.stamina < 15 ? 0.55 : this.stamina < 35 ? 0.8 : 1;
  }

  nudge(dx, dz) {
    this.nudgeV.x += dx;
    this.nudgeV.y += dz;
  }

  lookInput(dx, dy) {
    const lockK = this.grabbed ? 0.35 : 1;
    this.yaw -= dx * lockK;
    this.pitch = clamp(this.pitch - dy * lockK, -1.45, 1.45);
  }

  update(dt, { moveX, moveZ, sprint, crouchToggle, rise = false, speedMul = 1, time }) {
    if (this.dead) return;
    const input = this.input;
    if (this.mode === 'climb' || this.mode === 'seat') {
      this.crouched = false;
      this.vel.set(0, 0, 0);
      this.eyeH = damp(this.eyeH, 1.62, 10, dt);
      this._timers(dt, 0);
      this.eye.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
      return;
    }
    const water = this.inWater;
    // in the water C takes you under (with a tank) instead of crouching
    if (crouchToggle) {
      if (this.mode === 'swim' && this.diveGear) { this.mode = 'dive'; this.vy = -1.2; }
      else if (!water) this.crouched = !this.crouched;
    }
    if (water) this.crouched = false;

    // grabbed: camera drawn toward the closest biter
    if (this.grabbed) {
      const w = this.grabbers[0];
      const hp = w.volumes().head;
      const dx = hp.x - this.pos.x, dz = hp.z - this.pos.z, dy = hp.y - (this.pos.y + this.eyeH);
      const targetYaw = Math.atan2(-dx, -dz);
      const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * 6);
      this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
      this.crouched = false;
    }

    // movement
    let mx = moveX, mz = moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const canSprint = sprint && mz > 0.1 && this.stamina > 5 && !this.crouched && !this.grabbed;
    this.sprinting = canSprint && len > 0.1;
    let speed = this.crouched ? 1.6 : this.sprinting ? 5.1 : 3.0;
    if (water) speed = this.sprinting ? 2.7 : this.mode === 'dive' ? 2.1 : 1.8;
    else if (this.wading) speed *= 0.62;
    if (mz < -0.1) speed *= 0.75;
    speed *= speedMul * this.speedMul;
    if (this.grabbed) speed *= 0.12;
    if (this.stamina < 10 && !this.adrenaline) speed *= 0.85;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = (mx * cy - mz * sy) * speed;
    const wz = (-mx * sy - mz * cy) * speed;
    const accel = len > 0.05 ? 12 : 10;
    this.vel.x = damp(this.vel.x, wx, accel, dt);
    this.vel.z = damp(this.vel.z, wz, accel, dt);
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += (this.vel.x + this.nudgeV.x * 6) * dt;
    this.pos.z += (this.vel.z + this.nudgeV.y * 6) * dt;
    this.nudgeV.multiplyScalar(Math.exp(-dt * 12));
    // diving: up and down with the look, Space to rise, C to sink
    if (this.mode === 'dive') {
      const want = Math.sin(this.pitch) * Math.max(0, mz) * speed + (rise ? 1.6 : 0);
      this.vy = damp(this.vy, want, 4, dt);
      this.pos.y += this.vy * dt;
    }
    // a diver is mostly head and shoulders; a swimmer rides at the surface
    if (this.mode === 'dive') this.world.resolveCircle(this.pos, this.radius, 0.9, 2.0);
    else this.world.resolveCircle(this.pos, this.radius, this.inWater ? -0.2 : 0.35, this.crouched ? 1.1 : 1.7);
    if (this.world.floorMode) this._vertical(dt, px, pz, rise);

    // stamina
    if (this.adrenaline > 0) {
      this.adrenaline -= dt;
      this.stamina = this.maxStamina;
    }
    if (this.sprinting) this.spendStamina((water ? 16 : 13) * dt);
    this._air(dt);
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && !this.grabbed) {
      const regen = (this.crouched ? 26 : 20) * (this.regenBoost > 0 ? 2 : 1) * (len < 0.1 ? 1.25 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }
    if (this.regenBoost > 0) this.regenBoost -= dt;
    if (this.disguise > 0) this.disguise = Math.max(0, this.disguise - dt);

    this._timers(dt, len);

    // head bob, footsteps, noise
    const moving = Math.hypot(this.vel.x, this.vel.z);
    const targetEye = this.crouched ? 1.08 : 1.62;
    this.eyeH = damp(this.eyeH, targetEye, 10, dt);
    this.bobAmt = damp(this.bobAmt, clamp(moving / 3, 0, 1.6) * (water ? 0.35 : 1), 8, dt);
    this.bob += dt * (moving > 0.2 ? 2 + moving * 1.6 : 0);
    if (moving > 0.6) {
      this.stepT -= dt * (0.9 + moving * 0.5);
      if (this.stepT <= 0) {
        this.stepT = water ? 1.6 : 1.0;
        if (water) {
          if (this.mode === 'swim') this.audio.splash?.(this.pos, 0.18);
        } else {
          const surface = this.world.surfaceAt(this.pos.x, this.pos.z, this.pos.y);
          const intensity = this.sprinting ? 1 : this.crouched ? 0.15 : 0.5;
          if (this.wading) this.audio.splash?.(this.pos, this.sprinting ? 0.35 : 0.2);
          else this.audio.footstep(intensity, surface === 'wood' ? 'wood' : surface === 'metal' ? 'metal' : 'ground');
          const r = this.sprinting ? 11 : this.crouched ? 0 : 4.5;
          if (r > 0) this.noise?.(this.pos, r);
        }
      }
    }

    this.eye.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }

  // Standing on floors at a height, stepping off ledges, dropping into the water and
  // climbing out onto a beach.
  _vertical(dt, px, pz, rise) {
    const W = this.world, pos = this.pos, wy = W.waterY;
    // a floor under deep water is the bottom, not somewhere to stand; a dry floor
    // (a ship's hold, below the waterline but inside the hull) is
    const deep = (h, x = pos.x, z = pos.z, y = pos.y) => {
      if (h === null) return true;
      if (!W.swim || h >= wy - 1.15) return false;
      const f = W.floorAt(x, z, y);
      return !(f && f.dry);
    };
    if (!W.swim && this.mode === 'walk') {
      // boardwalks over a swamp you can't swim in: stay on the planks
      W.constrainAt(pos, px, pz, this.radius * 0.8);
      const g = W.heightAt(pos.x, pos.z, pos.y);
      if (g !== null) pos.y = g;
      return;
    }
    if (this.mode === 'walk') {
      const g = W.heightAt(pos.x, pos.z, pos.y);
      if (!deep(g) && g >= pos.y - 0.6) {
        pos.y = g;
        this.vy = 0;
      } else {
        this.mode = 'fall';
        this.vy = 0;
      }
      this.wading = W.swim && g !== null && g < wy - 0.25;
    }
    if (this.mode !== 'walk') this.wading = false;
    if (this.mode === 'fall') {
      this.vy -= 18 * dt;
      pos.y += this.vy * dt;
      const g = W.heightAt(pos.x, pos.z, pos.y + 0.4, 0);
      if (!deep(g) && pos.y <= g) {
        const v = -this.vy;
        pos.y = g;
        this.vy = 0;
        this.mode = 'walk';
        this.onLand?.(v);
        if (v > 9.5) this.damage(Math.round((v - 9) * 9), 'fall');
      } else if (W.swim && pos.y <= wy - 1.3) {
        this.onSplash?.(pos, Math.min(1, -this.vy / 10));
        this.mode = 'swim';
        pos.y = wy - 1.3;
        // a long drop takes you under for a moment
        if (this.vy < -7 && this.diveGear) this.mode = 'dive';
        this.vy = 0;
      }
      return;
    }
    if (this.mode === 'swim') {
      pos.y = damp(pos.y, wy - 1.3 + Math.sin(performance.now() / 700) * 0.04, 6, dt);
      // shallow enough to stand: wade out
      const g = W.heightAt(pos.x, pos.z, wy - 0.2, 0);
      if (!deep(g)) {
        pos.y = g;
        this.mode = 'walk';
      }
      return;
    }
    if (this.mode === 'dive') {
      const bed = W.seabed ? W.seabed(pos.x, pos.z) : wy - 30;
      if (pos.y < bed + 0.2) { pos.y = bed + 0.2; if (this.vy < 0) this.vy = 0; }
      // floors over your head are ceilings; floors under you are the bottom
      const g = W.heightAt(pos.x, pos.z, pos.y + 0.2, 0);
      if (g !== null && pos.y < g && !deep(g)) { pos.y = g; this.mode = 'walk'; this.vy = 0; return; }
      if (pos.y >= wy - 1.3) {
        pos.y = wy - 1.3;
        if (this.vy > 0 && rise) { this.mode = 'swim'; this.vy = 0; }
        else if (this.vy > 0) this.vy = 0;
      }
    }
  }

  // Air: a dive tank empties while you're under; without one you hold your breath.
  _air(dt) {
    const under = this.mode === 'dive' && this.pos.y + this.eyeH < this.world.waterY - 0.05;
    if (under) {
      if (this.diveGear && this.air > 0) this.air = Math.max(0, this.air - dt / this.airTime);
      else this.breath = Math.max(0, this.breath - dt / 25);
      if ((this.diveGear ? this.air : this.breath) <= 0) {
        this.drownT -= dt;
        if (this.drownT <= 0) { this.drownT = 1.2; this.damage(12, 'drown'); }
      }
    } else {
      this.breath = Math.min(1, this.breath + dt / 4);
      this.drownT = 0;
    }
  }

  _timers(dt, len) {
    // heal over time
    if (this.heal.remaining > 0) {
      const h = Math.min(this.heal.remaining, this.heal.rate * dt);
      this.heal.remaining -= h;
      this.health = Math.min(this.maxHealth, this.health + h);
    }

    // flashlight battery
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - dt * 0.12);
      if (this.battery <= 0) this.flashlightOn = false;
    }

    // recoil and shake recovery
    this.kick.pitch = damp(this.kick.pitch, 0, 9, dt);
    this.kick.yaw = damp(this.kick.yaw, 0, 9, dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.2);

    // heartbeat at low health
    if (this.health < this.maxHealth * 0.35) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.55 + (this.health / this.maxHealth) * 1.2;
        this.audio.heartbeat(1 - this.health / this.maxHealth);
      }
    }
    if (this.stamina < 12 && Math.random() < dt * 1.2) this.audio.breath(1.5);
  }

  applyCamera(time) {
    const cam = this.camera;
    const bob = Math.sin(this.bob * 2) * 0.035 * this.bobAmt;
    const sway = Math.cos(this.bob) * 0.02 * this.bobAmt;
    const sh = this.shake * this.shake;
    const shx = (Math.sin(time * 47) + Math.sin(time * 31)) * 0.02 * sh;
    const shy = (Math.sin(time * 53) + Math.cos(time * 29)) * 0.02 * sh;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * sway, this.pos.y + this.eyeH + bob, this.pos.z - Math.sin(this.yaw) * sway);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + this.kick.yaw + shx;
    cam.rotation.x = this.pitch + this.kick.pitch + shy;
    cam.rotation.z = Math.sin(this.bob) * 0.006 * this.bobAmt + shx * 0.5;
    this.forward(_f);
  }
}
