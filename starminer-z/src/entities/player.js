// The player's body: walking, sprinting, jumping, auto-climbing one-block steps the way
// CastleMiner Z's "Auto Climb" option does, falling, lava, and the camera bob that goes with it.

import * as THREE from 'three';
import { B, SOLID, BLOCKS } from '../world/blocks.js';

const EPS = 0.001;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.3;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.onGround = false;
    this.wasOnGround = false;
    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;
    this.sprinting = false;
    this.crouching = false;
    this.autoClimb = true;
    this.stepSmooth = 0; // camera lag after an auto-climb, so the view eases up
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.fallStart = null;
    this.hurtTimer = 0;
    this.regenTimer = 0;
    this.inLava = false;
    this.onStep = null; // footstep callback (material)
    this.onLand = null;
    this.onHurt = null;
    this.noclip = false;
    this.knock = new THREE.Vector3();
  }

  spawn(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.dead = false;
    this.fallStart = null;
    this.stepSmooth = 0;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight - (this.crouching ? 0.25 : 0) - this.stepSmooth, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // Does the player's box at (x, y, z) overlap anything solid?
  collides(x, y, z) {
    const r = this.radius, w = this.world;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r - EPS);
    const y0 = Math.floor(y), y1 = Math.floor(y + this.height - EPS);
    const z0 = Math.floor(z - r), z1 = Math.floor(z + r - EPS);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (SOLID[w.getBlock(bx, by, bz)]) return true;
    }
    return false;
  }

  hurt(amount, from = null, kind = 'hit') {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.45;
    // the original: health starts coming back three seconds after the last hit
    this.regenTimer = 3;
    if (from) {
      const k = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z);
      if (k.lengthSq() > 1e-4) k.normalize().multiplyScalar(5.5);
      this.knock.add(k);
      this.vel.y = Math.max(this.vel.y, 3.2);
    }
    if (this.onHurt) this.onHurt(amount, kind);
    if (this.health <= 0) this.dead = true;
  }

  update(dt, input, look = true) {
    if (this.dead) return;
    // look
    if (look) {
      this.yaw -= input.look.x;
      this.pitch -= input.look.y;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    // health comes back once you've been left alone (the original: three quarters of it a second)
    this.regenTimer -= dt;
    if (this.regenTimer <= 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 0.75 * this.maxHealth);
    }

    const w = this.world;
    const feet = w.getBlock(this.pos.x, this.pos.y + 0.1, this.pos.z);
    const body = w.getBlock(this.pos.x, this.pos.y + 1.0, this.pos.z);
    this.inLava = feet === B.LAVA || body === B.LAVA;
    if (this.inLava) {
      this.lavaTick = (this.lavaTick || 0) - dt;
      if (this.lavaTick <= 0) { this.lavaTick = 0.5; this.hurt(BLOCKS[B.LAVA].damage * 0.5, null, 'lava'); }
    }

    // movement intent in the yaw frame
    this.crouching = input.isHeld('crouch');
    // keyboard: hold to sprint; pad: click the stick to toggle; touch: push the stick to the edge
    if (input.pressed('sprint') && input.lastDevice === 'pad') this.sprintToggle = !this.sprintToggle;
    const wantSprint = input.lastDevice === 'pad' ? this.sprintToggle : input.isHeld('sprint');
    const mx = input.move.x, my = input.move.y;
    this.sprinting = wantSprint && my > 0.5 && !this.crouching;
    if (Math.hypot(mx, my) < 0.1) this.sprintToggle = false;
    let speed = this.crouching ? 1.9 : this.sprinting ? 6.6 : 4.4;
    if (this.inLava) speed *= 0.45;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * my + cy * mx) * speed, tz = (-cy * my - sy * mx) * speed;
    const accel = this.onGround ? (Math.hypot(mx, my) > 0.05 ? 46 : 34) : 9;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dv = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dv > maxDv) { this.vel.x += (dvx / dv) * maxDv; this.vel.z += (dvz / dv) * maxDv; }
    else { this.vel.x = tx; this.vel.z = tz; }
    // knockback fades
    this.vel.x += this.knock.x; this.vel.z += this.knock.z;
    this.knock.multiplyScalar(0);

    if (this.noclip) {
      const f = this.forward();
      const s = input.isHeld('sprint') ? 40 : 14;
      this.pos.addScaledVector(f, my * s * dt);
      this.pos.x += cy * mx * s * dt; this.pos.z -= sy * mx * s * dt;
      if (input.isHeld('jump')) this.pos.y += s * dt;
      if (input.isHeld('crouch')) this.pos.y -= s * dt;
      this.vel.set(0, 0, 0);
      return;
    }

    // gravity and jumping
    if (input.isHeld('jump') && (this.onGround || (this.inLava && this.vel.y < 1))) {
      this.vel.y = this.inLava ? 3.5 : 8.6;
      this.onGround = false;
      this.jumped = true;
    }
    this.vel.y -= (this.inLava ? 9 : 27) * dt;
    if (this.vel.y < -52) this.vel.y = -52;

    // move, in small steps so nothing tunnels; the dead you push into hold you back (crowd, set
    // by the enemies: the original's AttentuateVelocity)
    const steps = Math.max(1, Math.ceil((Math.abs(this.vel.x) + Math.abs(this.vel.y) + Math.abs(this.vel.z)) * dt / 0.35));
    const crowd = this.crowd ?? 1;
    const h = dt / steps, hy = this.vel.y > 0 ? h * crowd : h;
    this.wasOnGround = this.onGround;
    let landedSpeed = 0;
    for (let i = 0; i < steps; i++) {
      // horizontal, with an auto-climb up one-block steps
      for (const axis of ['x', 'z']) {
        const d = this.vel[axis] * h * crowd;
        if (!d) continue;
        const nx = axis === 'x' ? this.pos.x + d : this.pos.x;
        const nz = axis === 'z' ? this.pos.z + d : this.pos.z;
        if (!this.collides(nx, this.pos.y, nz)) { this.pos.x = nx; this.pos.z = nz; continue; }
        // a step up?
        const canClimb = (this.autoClimb || this.jumped) && (this.onGround || this.wasOnGround) && !this.crouching;
        if (canClimb) {
          let up = 0;
          for (const s of [0.55, 1.05]) if (!this.collides(nx, this.pos.y + s, nz) && !this.collides(this.pos.x, this.pos.y + s, this.pos.z)) { up = s; break; }
          if (up && this.autoClimb) {
            // settle onto the step
            let y = this.pos.y + up;
            while (!this.collides(nx, y - 0.05, nz) && y > this.pos.y) y -= 0.05;
            this.stepSmooth += y - this.pos.y;
            this.pos.y = y; this.pos.x = nx; this.pos.z = nz;
            continue;
          }
        }
        // slide flush against the block
        const p = this.pos[axis];
        const r = this.radius;
        this.pos[axis] = d > 0 ? Math.floor(p + r + d) - r - EPS : Math.floor(p - r + d) + 1 + r + EPS;
        if (this.collides(this.pos.x, this.pos.y, this.pos.z)) this.pos[axis] = p;
        this.vel[axis] = 0;
      }
      // vertical
      const dy = this.vel.y * hy;
      if (dy) {
        if (!this.collides(this.pos.x, this.pos.y + dy, this.pos.z)) {
          this.pos.y += dy;
          this.onGround = false;
        } else {
          if (dy < 0) {
            this.pos.y = Math.floor(this.pos.y + dy) + 1 + EPS;
            if (this.collides(this.pos.x, this.pos.y, this.pos.z)) this.pos.y = Math.ceil(this.pos.y);
            if (!this.onGround) landedSpeed = Math.min(landedSpeed, this.vel.y);
            this.onGround = true;
          } else {
            this.pos.y = Math.floor(this.pos.y + this.height + dy) - this.height - EPS;
          }
          this.vel.y = 0;
        }
      }
    }
    if (this.onGround) this.jumped = false;
    // ground check when standing still
    if (this.vel.y === 0 && !this.collides(this.pos.x, this.pos.y - 0.05, this.pos.z)) this.onGround = false;

    // landing
    if (landedSpeed < 0) {
      if (landedSpeed < -14 && !this.inLava) this.hurt(Math.round((-landedSpeed - 14) * 3.2), null, 'fall');
      if (this.onLand) this.onLand(-landedSpeed, this.groundBlock());
    }

    // the camera eases up after a step
    this.stepSmooth = Math.max(0, this.stepSmooth - dt * 6 * Math.max(0.6, this.stepSmooth * 2));

    // head bob and footsteps
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && hv > 0.5;
    this.bobAmount += ((moving ? Math.min(1, hv / 4.4) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (moving) {
      const prev = this.bobPhase;
      this.bobPhase += dt * hv * 1.75;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && this.onStep) this.onStep(this.groundBlock(), this.sprinting);
    }
  }

  groundBlock() {
    return this.world.getBlock(this.pos.x, this.pos.y - 0.2, this.pos.z);
  }

  // Would a block at (x, y, z) overlap the player?
  occupies(x, y, z) {
    const r = this.radius;
    return x + 1 > this.pos.x - r && x < this.pos.x + r && z + 1 > this.pos.z - r && z < this.pos.z + r && y + 1 > this.pos.y && y < this.pos.y + this.height;
  }
}
