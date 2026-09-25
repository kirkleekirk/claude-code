import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/math.js';

// First-person survivor: movement, stamina, health, hunger-capped max health,
// being grabbed by walkers and struggling free.

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
  }

  spawn(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.grabbers = [];
    this.dead = false;
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

  update(dt, { moveX, moveZ, sprint, crouchToggle, speedMul = 1, time }) {
    if (this.dead) return;
    const input = this.input;
    if (crouchToggle) this.crouched = !this.crouched;

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
    this.pos.x += (this.vel.x + this.nudgeV.x * 6) * dt;
    this.pos.z += (this.vel.z + this.nudgeV.y * 6) * dt;
    this.nudgeV.multiplyScalar(Math.exp(-dt * 12));
    this.world.resolveCircle(this.pos, this.radius, 0.35, this.crouched ? 1.1 : 1.7);

    // stamina
    if (this.adrenaline > 0) {
      this.adrenaline -= dt;
      this.stamina = this.maxStamina;
    }
    if (this.sprinting) this.spendStamina(13 * dt);
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && !this.grabbed) {
      const regen = (this.crouched ? 26 : 20) * (this.regenBoost > 0 ? 2 : 1) * (len < 0.1 ? 1.25 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }
    if (this.regenBoost > 0) this.regenBoost -= dt;
    if (this.disguise > 0) this.disguise = Math.max(0, this.disguise - dt);

    // heal over time
    if (this.heal.remaining > 0) {
      const h = Math.min(this.heal.remaining, this.heal.rate * dt);
      this.heal.remaining -= h;
      this.health = Math.min(this.maxHealth, this.health + h);
    }

    // head bob, footsteps, noise
    const moving = Math.hypot(this.vel.x, this.vel.z);
    const targetEye = this.crouched ? 1.08 : 1.62;
    this.eyeH = damp(this.eyeH, targetEye, 10, dt);
    this.bobAmt = damp(this.bobAmt, clamp(moving / 3, 0, 1.6), 8, dt);
    this.bob += dt * (moving > 0.2 ? 2 + moving * 1.6 : 0);
    if (moving > 0.6) {
      this.stepT -= dt * (0.9 + moving * 0.5);
      if (this.stepT <= 0) {
        this.stepT = 1.0;
        const surface = this.world.surfaceAt(this.pos.x, this.pos.z);
        const intensity = this.sprinting ? 1 : this.crouched ? 0.15 : 0.5;
        this.audio.footstep(intensity, surface === 'wood' ? 'wood' : surface === 'metal' ? 'metal' : 'ground');
        const r = this.sprinting ? 11 : this.crouched ? 0 : 4.5;
        if (r > 0) this.noise?.(this.pos, r);
      }
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

    this.eye.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
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
