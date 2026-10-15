import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, damp, rand, wrapAngle } from '../util.js';
import { settings } from '../settings.js';
import { audio } from '../engine/audio.js';

// First-person controller with the Avion exo suit: boost jump, boost dodge, exo slam, slide.
const G = 20;
const STAND_H = 1.8;
const CROUCH_H = 1.15;
const SLIDE_H = 0.95;
const DOWN_H = 0.55;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.ch = { x: 0, y: 0, z: 0, r: 0.34, h: STAND_H, vx: 0, vy: 0, vz: 0, grounded: true, landSpeed: 0 };
    this.pos = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.reset({ x: 0, z: 0, yaw: 0 });
  }

  reset(start) {
    const t = this.game.world.terrain;
    this.ch.x = start.x;
    this.ch.z = start.z;
    this.ch.y = t.heightAt(start.x, start.z) + 0.05;
    this.ch.vx = this.ch.vy = this.ch.vz = 0;
    this.ch.h = STAND_H;
    this.ch.grounded = true;
    this.yaw = start.yaw;
    this.pitch = 0;
    this.eyeH = STAND_H - 0.12;
    this.crouched = false;
    this.sprinting = false;
    this.sprintToggle = false;
    this.slideT = 0;
    this.slideDir = new THREE.Vector3();
    this.exo = { has: false, emp: 0, boostUsed: false, charges: 2, recharge: 0, dodgeT: 0, dodgeDir: new THREE.Vector3(), slamming: false, slamFromY: 0, thrustT: 0 };
    this.maxHealth = 100;
    this.health = 100;
    this.regenT = 0;
    this.downed = false;
    this.downT = 0;
    this.dead = false;
    this.medicUses = 0;
    this.perks = new Set();
    this.points = 500;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.roll = 0;
    this.landDip = 0;
    this.stepDist = 0;
    this.bob = 0;
    this.lastHurtDir = 0;
    this.hurtFlash = 0;
    this.airTime = 0;
    this.wasGrounded = true;
    this.lookX = 0;
    this.lookY = 0;
    this.speed = 0;
    this.invuln = 0;
    this.rooted = false;
    this.sync();
  }

  get position() {
    return this.pos;
  }

  sync() {
    this.pos.set(this.ch.x, this.ch.y, this.ch.z);
    this.eye.set(this.ch.x, this.ch.y + this.eyeH, this.ch.z);
  }

  equipExo() {
    this.exo.has = true;
    this.exo.charges = 2;
  }

  get exoOnline() {
    return this.exo.has && this.exo.emp <= 0 && !this.downed;
  }

  addShake(amount, time = 0.3) {
    this.shake = Math.max(this.shake, amount * settings.get('screenShake'));
    this.shakeT = Math.max(this.shakeT, time);
  }

  kickRecoil(pitchDeg, yawDeg) {
    this.recoilPitch += pitchDeg * (Math.PI / 180);
    this.recoilYaw += yawDeg * (Math.PI / 180);
  }

  update(dt, input, opts) {
    const ch = this.ch;
    const game = this.game;
    const W = game.weapons;
    const busy = this.dead;
    // rooted: can look around but not move (riding a lift)
    const still = busy || this.rooted;
    // ---- look ------------------------------------------------------------------------------
    let [lx, ly] = input.consumeLook();
    const zoom = W.currentZoom();
    const adsK = W.ads > 0.5 ? settings.get('adsSensitivity') / Math.pow(zoom, 0.6) : 1;
    lx *= adsK;
    ly *= adsK;
    if (opts.aimAssist) {
      lx *= opts.aimAssist.slow;
      ly *= opts.aimAssist.slow;
      lx += opts.aimAssist.dx;
      ly += opts.aimAssist.dy;
    }
    this.lookX = lx;
    this.lookY = ly;
    if (!busy) {
      this.yaw = wrapAngle(this.yaw + lx);
      this.pitch = clamp(this.pitch + ly, -1.48, 1.48);
    }

    // ---- exo timers ------------------------------------------------------------------------
    const ex = this.exo;
    if (ex.emp > 0) ex.emp -= dt;
    const velMul = this.perks.has('velocity') ? 1.9 : 1;
    if (ex.charges < 2) {
      ex.recharge += dt * velMul;
      if (ex.recharge >= 2.4) {
        ex.recharge = 0;
        ex.charges++;
        if (ex.has) audio.play('exo_ready', { bus: 'ui', volume: 0.5 });
      }
    }

    // ---- intents ---------------------------------------------------------------------------
    const ads = W.ads > 0.4;
    const mx = still ? 0 : input.moveX;
    const my = still ? 0 : input.moveY;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;
    let wishX = fwdX * my + rightX * mx;
    let wishZ = fwdZ * my + rightZ * mx;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    const grounded = ch.grounded;
    // sprint
    if (input.pressed.sprint && input.lastDevice === 'pad') this.sprintToggle = !this.sprintToggle;
    let wantSprint = settings.get('toggleSprint') || input.lastDevice === 'pad' ? this.sprintToggle : input.held.sprint;
    if (input.lastDevice === 'touch') wantSprint = input.moveMag > 0.92 && my > 0.5;
    if (input.lastDevice !== 'pad' && settings.get('toggleSprint') && input.pressed.sprint) {
      this.sprintToggle = !this.sprintToggle;
      wantSprint = this.sprintToggle;
    }
    this.sprinting = wantSprint && my > 0.35 && !ads && !this.downed && this.slideT <= 0 && !W.blocksSprint();
    if (this.sprinting && this.crouched) this.crouched = false;
    if (my < 0.2) this.sprintToggle = false;

    // jump / boost jump
    if (input.pressed.jump && !this.downed && !still) {
      if (grounded && this.slideT <= 0) {
        if (this.crouched) this.crouched = false;
        else {
          ch.vy = 6.6;
          ch.grounded = false;
          ex.boostUsed = false;
        }
      } else if (grounded && this.slideT > 0) {
        // slide-jump keeps the momentum
        this.slideT = 0;
        ch.vy = 6.6;
        ch.grounded = false;
      } else if (!grounded && this.exoOnline && !ex.boostUsed) {
        ex.boostUsed = true;
        ch.vy = Math.max(ch.vy, 0) * 0.3 + 8.4;
        ex.thrustT = 0.25;
        audio.play('exo_jump', { volume: 0.8, rateVar: 0.05 });
        game.viewmodel.joltKick(0, -0.25);
        this.addShake(0.12, 0.2);
        game.particles && this._thrusterBurst();
      }
    }
    // dodge: dedicated key, or sprint key while airborne
    const dodgePressed = input.pressed.dodge || (!grounded && input.pressed.sprint && input.lastDevice === 'kbm');
    if (dodgePressed && this.exoOnline && ex.charges > 0 && !still) {
      ex.charges--;
      ex.recharge = 0;
      let dx = wishX;
      let dz = wishZ;
      if (Math.hypot(dx, dz) < 0.2) {
        dx = fwdX;
        dz = fwdZ;
      }
      const l = Math.hypot(dx, dz);
      ex.dodgeDir.set(dx / l, 0, dz / l);
      ex.dodgeT = 0.2;
      if (!grounded) ch.vy = Math.max(ch.vy, 1.2);
      audio.play('exo_dodge', { volume: 0.75, rateVar: 0.06 });
      const side = dx * rightX + dz * rightZ;
      this.rollKick = -side * 0.09;
      game.viewmodel.joltKick(-side * 0.25, 0.05);
      this.addShake(0.06, 0.15);
    }
    // crouch / slide / slam
    const crouchPressed = input.pressed.crouch || (input.pressed.crouchHold && !settings.get('toggleCrouch'));
    if (crouchPressed && !busy && !this.downed) {
      const groundH = game.world.physics.groundHeight(ch.x, ch.z, ch.r * 0.7, ch.y + 0.1);
      if (!grounded && this.exoOnline && ch.y - groundH > 1.3 && !ex.slamming) {
        ex.slamming = true;
        ex.slamFromY = ch.y;
        ch.vy = -30;
        ex.dodgeT = 0;
        audio.play('exo_dodge', { volume: 0.8, rate: 0.7 });
      } else if (grounded && this.sprinting && this.speed > 5.2) {
        this.slideT = 0.85;
        const l = Math.hypot(ch.vx, ch.vz) || 1;
        this.slideDir.set(ch.vx / l, 0, ch.vz / l);
        const boost = Math.max(9.6, l * 1.18);
        ch.vx = this.slideDir.x * boost;
        ch.vz = this.slideDir.z * boost;
        this.sprinting = false;
        this.crouched = true;
        audio.play('melee_swing', { volume: 0.5, rate: 0.6 });
      } else if (grounded) {
        this.crouched = !this.crouched;
      }
    }
    if (!settings.get('toggleCrouch') && input.released.crouchHold && this.slideT <= 0) this.crouched = false;

    // ---- movement --------------------------------------------------------------------------
    const wMul = W.moveMul();
    let target = this.sprinting ? 7.1 : this.crouched ? 2.6 : 4.7;
    if (ads) target = Math.min(target, 2.9);
    target *= wMul * (this.perks.has('velocity') ? 1.1 : 1);
    if (this.downed) target = 0.6;
    const wishSpeed = target * Math.min(1, wishLen);
    if (ex.dodgeT > 0) {
      ex.dodgeT -= dt;
      const sp = 13.5;
      ch.vx = ex.dodgeDir.x * sp;
      ch.vz = ex.dodgeDir.z * sp;
      if (!grounded) ch.vy = Math.max(ch.vy - G * dt * 0.3, -1);
      if (ex.dodgeT <= 0) {
        // keep some momentum after the burst
        ch.vx *= 0.55;
        ch.vz *= 0.55;
      }
    } else if (grounded) {
      if (this.slideT > 0) {
        this.slideT -= dt;
        const l = Math.hypot(ch.vx, ch.vz);
        const nl = Math.max(0, l - 9 * dt);
        if (l > 0.01) {
          ch.vx *= nl / l;
          ch.vz *= nl / l;
        }
        // slight steering
        ch.vx += wishX * 3 * dt;
        ch.vz += wishZ * 3 * dt;
        if (nl < 3) this.slideT = 0;
      } else {
        const accel = this.downed ? 4 : 13;
        const k = 1 - Math.exp(-accel * dt);
        ch.vx += (wishX * wishSpeed - ch.vx) * k;
        ch.vz += (wishZ * wishSpeed - ch.vz) * k;
      }
    } else {
      // air control: steer, but keep exo momentum
      const cur = Math.hypot(ch.vx, ch.vz);
      const k = 1 - Math.exp(-2.5 * dt);
      const tx = wishX * Math.max(wishSpeed, Math.min(cur, 9));
      const tz = wishZ * Math.max(wishSpeed, Math.min(cur, 9));
      if (wishLen > 0.1) {
        ch.vx += (tx - ch.vx) * k;
        ch.vz += (tz - ch.vz) * k;
      }
    }
    if (!grounded) {
      if (ex.slamming) ch.vy = Math.min(ch.vy, -30);
      else ch.vy -= G * dt;
      if (ex.thrustT > 0) {
        ex.thrustT -= dt;
        ch.vy += 9 * dt;
      }
    }
    // height
    const targetH = this.downed ? DOWN_H : this.slideT > 0 ? SLIDE_H : this.crouched ? CROUCH_H : STAND_H;
    if (targetH > ch.h) {
      // standing up: make sure there is headroom
      const phys = game.world.physics;
      const cands = phys.query(ch.x, ch.z, ch.r);
      let ok = !phys.rockAt(ch.x, ch.y + targetH + 0.05, ch.z);
      for (const c of cands) {
        if (c.minY > ch.y + ch.h - 0.05 && c.minY < ch.y + targetH && phys.footprintOverlap(c, ch.x, ch.z, ch.r)) ok = false;
      }
      if (ok) ch.h = Math.min(targetH, ch.h + dt * 6);
      else this.crouched = true;
    } else ch.h = Math.max(targetH, ch.h - dt * 8);

    const prevGrounded = ch.grounded;
    game.world.physics.moveCharacter(ch, dt, 0.5);
    game.zombies.pushPlayer(ch);
    if (ch.y < (game.map.KILL_Y ?? -60)) {
      // fell off the world: put the player back at spawn
      const s = game.map.PLAYER_START;
      ch.x = s.x;
      ch.z = s.z;
      ch.y = game.world.terrain.heightAt(s.x, s.z) + 1;
      ch.vy = 0;
    }
    this.speed = Math.hypot(ch.vx, ch.vz);

    // landing
    if (!prevGrounded && ch.grounded) {
      ex.boostUsed = false;
      const ls = ch.landSpeed || 0;
      if (ex.slamming) {
        ex.slamming = false;
        game.onExoSlam(new THREE.Vector3(ch.x, ch.y, ch.z), ex.slamFromY - ch.y);
        this.landDip = 0.35;
      } else if (ls > 4) {
        this.landDip = Math.min(0.22, ls * 0.022);
        audio.play(ls > 9 ? 'exo_land' : 'land', { volume: Math.min(1, ls / 12), rateVar: 0.05 });
        game.viewmodel.joltKick(0, -Math.min(0.3, ls * 0.03));
      }
      this.airTime = 0;
    }
    if (!ch.grounded) this.airTime += dt;

    // footsteps
    if (ch.grounded && this.speed > 1.2 && this.slideT <= 0) {
      this.stepDist += this.speed * dt;
      const stride = this.sprinting ? 2.5 : 2.0;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const mat = ch.groundMaterial || 'dirt';
        const kind = mat === 'metal' ? 'foot_metal_' + (1 + Math.floor(Math.random() * 3)) : mat === 'concrete' || mat === 'rock' ? 'foot_hard_' + (1 + Math.floor(Math.random() * 4)) : 'foot_dirt_' + (1 + Math.floor(Math.random() * 4));
        audio.play(kind, { volume: (this.crouched ? 0.25 : this.sprinting ? 0.75 : 0.5), rateVar: 0.08 });
      }
    }

    // health regen
    if (this.regenT > 0) this.regenT -= dt;
    else if (!this.downed && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 110 * dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);

    // downed countdown (Exo Medic auto-revive)
    if (this.downed) {
      this.downT -= dt;
      if (this.downT <= 0) game.revivePlayer();
    }

    this.sync();
    this.updateCamera(dt, opts);
  }

  _thrusterBurst() {
    const P = this.game.particles;
    const ch = this.ch;
    for (let i = 0; i < 16; i++) {
      P.add.spawn({
        x: ch.x + rand(-0.2, 0.2), y: ch.y + 0.1, z: ch.z + rand(-0.2, 0.2), vx: rand(-1.5, 1.5), vy: rand(-6, -3), vz: rand(-1.5, 1.5),
        life: rand(0.2, 0.45), size: rand(0.08, 0.16), size1: 0.02, r: 1.2, g: 2.6, b: 5, a: 1, a1: 0, drag: 3, cell: 0,
      });
    }
    this.game.particles.dust(ch.x, ch.y, ch.z, 0, 0.3, 0, [0.4, 0.38, 0.4], 3, 1.2);
  }

  updateCamera(dt, opts) {
    const cam = this.camera;
    const ch = this.ch;
    const targetEye = ch.h - 0.12;
    this.eyeH = damp(this.eyeH, targetEye, 14, dt);
    this.landDip = damp(this.landDip, 0, 9, dt);
    // recoil recovers toward zero
    const rec = 1 - Math.exp(-7 * dt);
    const rp = this.recoilPitch * rec;
    const ry = this.recoilYaw * rec;
    this.recoilPitch -= rp;
    this.recoilYaw -= ry;
    // shake
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shake * Math.min(1, this.shakeT * 4);
      sx = (Math.random() - 0.5) * s * 0.1;
      sy = (Math.random() - 0.5) * s * 0.1;
    } else this.shake = 0;
    const rollTarget = (this.slideT > 0 ? -0.07 : 0) + (this.rollKick || 0) + (this.downed ? 0.22 : 0);
    this.rollKick = damp(this.rollKick || 0, 0, 7, dt);
    this.roll = damp(this.roll, rollTarget, 10, dt);
    // head bob (subtle; Ghosts-style weight)
    let bobY = 0;
    if (ch.grounded && this.speed > 0.5 && this.slideT <= 0) {
      this.bob += dt * (6 + this.speed * 0.9);
      bobY = Math.sin(this.bob * 2) * 0.018 * Math.min(1, this.speed / 5);
    }
    cam.position.set(ch.x, ch.y + this.eyeH - this.landDip + bobY, ch.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + this.recoilPitch + sy, this.yaw + this.recoilYaw + sx, this.roll);
    // fov: ads zoom + sprint widen + exo dodge punch
    const base = settings.get('fov');
    const zoom = this.game.weapons.currentZoom();
    const adsF = this.game.weapons.ads;
    let fov = base / lerp(1, zoom, adsF);
    if (this.sprinting) fov += 5;
    if (this.exo.dodgeT > 0) fov += 7;
    if (this.slideT > 0) fov += 4;
    // FOV setting is horizontal at 16:9; keep vertical constant so wider screens see more (Hor+)
    const vfov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / (16 / 9))) * (180 / Math.PI);
    cam.fov = damp(cam.fov, vfov, 16, dt);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.forward);
  }

  damage(amount, fromX, fromZ) {
    if (this.downed || this.dead || this.invuln > 0) return false;
    this.health -= amount;
    this.regenT = 2.6;
    this.hurtFlash = 1;
    const dx = fromX - this.ch.x;
    const dz = fromZ - this.ch.z;
    this.lastHurtDir = Math.atan2(dx, dz);
    this.addShake(0.25, 0.25);
    this.game.viewmodel.joltKick((Math.random() - 0.5) * 0.3, -0.2);
    if (this.health <= 0) {
      this.health = 0;
      this.game.downPlayer();
      return true;
    }
    return false;
  }
}
