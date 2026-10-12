// The player's body, moving as CastleMiner Z's does (its FPSRig and Player, and their
// UpdateAnimation and ResolveCollsion):
//
//  - on the ground, forward and back at up to 4 m/s once the stick is past 80% (running; a key
//    is all the way), slower short of it (walking: (stick - 0.1) / 0.4 x 0.947 m/s), and 4 m/s
//    from side to side, all set outright each frame;
//  - in the air, 5 m/s wherever the stick points (so a jump goes a little further);
//  - let go and you stop at once, in the air too;
//  - a 10 m/s jump on the press, against 20 m/s2 of gravity: two and a half metres up;
//  - with Auto Climb, walking into a block-high step lifts you up it at 5 m/s;
//  - landing at more than 15 m/s hurts: a fifteenth of your health for each m/s over.
//
// No sprinting and no crouching: the original has neither. (Its slight drift backwards while
// strafing straight sideways isn't copied.) Lava, which here you sink into, slows you.

import * as THREE from 'three';
import { B, SOLID, BLOCKS } from '../world/blocks.js';

const EPS = 0.001;
const RUN = 4, WALK = 0.947, AIR = 5, JUMP = 10, GRAVITY = 20, CLIMB = 5;
const FALL_SAFE = 15, FALL_HURT = 1 / 15;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    // (the original's PlayerAABB: 0.7 across, 1.7 high)
    this.radius = 0.35;
    this.height = 1.7;
    this.eyeHeight = 1.62;
    this.onGround = false;
    this.wasOnGround = false;
    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;
    // (kept for what reads them: the original has no sprint or crouch)
    this.sprinting = false;
    this.crouching = false;
    // past 80% on the stick: running (the faster footsteps)
    this.running = false;
    this.autoClimb = true;
    this.stepSmooth = 0;
    this.stepT = 0; // the footstep timer (the original's _footStepTimer)
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
    // (no knockback: the original's ApplyDamage doesn't push the player)
    if (this.onHurt) this.onHurt(amount, kind, from);
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

    // movement, in the yaw frame (x: strafe, y: forward), as UpdateAnimation sets it
    this.crouching = false;
    this.sprinting = false;
    const mx = input.move.x, my = input.move.y;
    const fwd = Math.abs(my), side = Math.abs(mx), moving = Math.max(fwd, side) >= 0.1;
    this.running = moving && fwd >= 0.8;
    let vx = 0, vz = 0; // local: x to the right, z forward
    if (moving) {
      if (this.onGround) {
        const f = fwd >= 0.8 ? fwd * RUN : Math.max(0, (fwd - 0.1) / 0.4) * WALK;
        vz = Math.sign(my) * f;
        vx = mx * RUN;
      } else {
        vz = my * AIR;
        vx = mx * AIR;
      }
    }
    if (this.inLava) { vx *= 0.45; vz *= 0.45; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.vel.x = -sy * vz + cy * vx;
    this.vel.z = -cy * vz - sy * vx;

    if (this.noclip) {
      const fw = this.forward();
      const sp = 14;
      this.pos.addScaledVector(fw, my * sp * dt);
      this.pos.x += cy * mx * sp * dt; this.pos.z -= sy * mx * sp * dt;
      if (input.isHeld('jump')) this.pos.y += sp * dt;
      if (input.isHeld('crouch')) this.pos.y -= sp * dt;
      this.vel.set(0, 0, 0);
      return;
    }

    // jumping (on the press, standing on something) and gravity; lava, here, you swim up through
    if (this.inLava) {
      if (input.isHeld('jump') && this.vel.y < 1) this.vel.y = 3.5;
      this.vel.y -= 9 * dt;
    } else {
      if (input.pressed('jump') && this.onGround) {
        this.vel.y += JUMP;
        this.onGround = false;
      }
      this.vel.y -= GRAVITY * dt;
    }

    // move, in small steps so nothing tunnels; the dead you push into hold you back (crowd, set
    // by the enemies: the original's AttentuateVelocity)
    const steps = Math.max(1, Math.ceil((Math.abs(this.vel.x) + Math.abs(this.vel.y) + Math.abs(this.vel.z)) * dt / 0.35));
    const crowd = this.crowd ?? 1;
    const h = dt / steps, hy = this.vel.y > 0 ? h * crowd : h;
    this.wasOnGround = this.onGround;
    let landedSpeed = 0, climbed = false;
    for (let i = 0; i < steps; i++) {
      // horizontal, walking up block-high steps with Auto Climb (the original's sloped sides:
      // not while rising fast from a jump)
      for (const axis of ['x', 'z']) {
        const d = this.vel[axis] * h * crowd;
        if (!d) continue;
        const nx = axis === 'x' ? this.pos.x + d : this.pos.x;
        const nz = axis === 'z' ? this.pos.z + d : this.pos.z;
        if (!this.collides(nx, this.pos.y, nz)) { this.pos.x = nx; this.pos.z = nz; continue; }
        if (this.autoClimb && this.vel.y < JUMP * 0.5) {
          const top = Math.floor(this.pos.y + EPS) + 1 + EPS;
          if (top - this.pos.y <= 1 + 2 * EPS && !this.collides(nx, top, nz) && !this.collides(this.pos.x, top, this.pos.z)) {
            // up it at 5 m/s, standing on it all the while; across once on top
            this.pos.y = Math.min(top, this.pos.y + CLIMB * h);
            if (this.vel.y < 0) this.vel.y = 0;
            this.onGround = true;
            this.climbing = climbed = true;
            if (!this.collides(nx, this.pos.y, nz)) { this.pos.x = nx; this.pos.z = nz; }
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
          if (!this.climbing) this.onGround = false;
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
      this.climbing = false;
    }
    // standing on something, or walked off it (part way up a step is standing, as the original
    // has it)
    if (this.vel.y <= 0 && !climbed) this.onGround = this.collides(this.pos.x, this.pos.y - 0.05, this.pos.z);

    // landing
    if (landedSpeed < 0) {
      if (-landedSpeed > FALL_SAFE && !this.inLava) this.hurt((-landedSpeed - FALL_SAFE) * FALL_HURT * this.maxHealth, null, 'fall');
      if (this.onLand) this.onLand(-landedSpeed, this.groundBlock());
    }

    // head bob, and footsteps by the original's timer: half a second apart walking, 0.4 running,
    // the clock running as fast as the stick is pushed
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const walking = this.onGround && moving && hv > 0.3;
    this.bobAmount += ((walking ? Math.min(1, hv / RUN) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (walking) this.bobPhase += dt * hv * 1.75;
    if (moving) {
      const pace = this.running ? fwd : Math.max(side, (fwd - 0.1) / 0.4);
      this.stepT += dt * Math.max(0, pace);
      if (this.stepT >= (this.stepEvery ?? 0.5)) {
        this.stepT = 0;
        if (this.onGround && this.onStep) this.onStep(this.groundBlock(), this.running);
        this.stepEvery = this.running ? 0.4 : 0.5;
      }
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
