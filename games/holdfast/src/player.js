// Player: capsule physics against boxes + terrain, movement relative to the
// camera, stamina, health, melee & pistol combat, interaction.
import * as THREE from 'three';
import { T } from './world/terrain.js';
import { makeWeaponMeshes } from './characters.js';

const RADIUS = 0.32, HEIGHT = 1.75, STEP = 0.48, GRAV = 22;

export class Player {
  constructor(game, character) {
    this.game = game;
    this.char = character;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.health = 100; this.maxHealth = 100;
    this.stamina = 100; this.maxStamina = 100;
    this.visualY = 0;
    this.attackT = -1;
    this.attackCd = 0;
    this.hitDone = false;
    this.crouch = false;
    this.aiming = false;
    this.dead = false;
    this.speed = 0;
    this.lastSafe = new THREE.Vector3();
    this.hurtFlash = 0;
    this.noise = 0;
    this.weapon = { kind: 'bat', name: 'Baseball bat', damage: 34, reach: 2.0, speed: 0.62, durability: 100 };
    this.inside = false;
    this.makeWeaponMesh();
  }
  makeWeaponMesh() {
    const w = makeWeaponMeshes();
    this.weaponMesh = w.group;
    this.batMesh = w.bat; this.gunMesh = w.gun; this.muzzleLocal = w.muzzle;
    this.game.scene.add(this.weaponMesh);
  }
  // world position of the pistol's muzzle (or the hand)
  muzzleWorld(out = new THREE.Vector3()) {
    this.weaponMesh.updateMatrixWorld(true);
    return out.copy(this.muzzleLocal).applyMatrix4(this.weaponMesh.matrixWorld);
  }
  // y: the height to look for ground below (defaults to the terrain, so a
  // spawn point never lands on a roof)
  spawn(x, z, y = null) {
    const ph = this.game.physics;
    const top = (y == null ? ph.terrain.height(x, z) : y) + 0.9;
    const g = ph.groundAt(x, z, top);
    this.pos.set(x, g, z);
    this.vel.set(0, 0, 0);
    this.visualY = g;
    this.lastSafe.copy(this.pos);
    this.health = this.maxHealth; this.stamina = this.maxStamina; this.dead = false;
    this.deadT = 0; this.airT = 0; this.attackT = -1;
    this.char.root.rotation.x = 0;
  }
  update(dt, input, cam) {
    const ph = this.game.physics;
    if (this.dead) { this.deadT = (this.deadT || 0) + dt; this.char.animate(dt, { mode: 'dead' }); this.syncModel(dt); return; }
    const ax = input.moveAxis();
    const sprintHeld = input.down('ShiftLeft') || input.down('ShiftRight') || input.btn('sprint') || input.btn('sprint-stick');
    if (input.pressed('KeyC') || input.pressed('ControlLeft')) this.crouch = !this.crouch;
    this.aiming = (input.mouse.buttons & 4) !== 0 || input.btn('aim');
    const moving = Math.hypot(ax.x, ax.y) > 0.1;
    let speed = this.crouch ? 1.6 : 3.4;
    const canSprint = this.stamina > 4 && moving && !this.crouch && !this.aiming;
    const sprinting = sprintHeld && canSprint;
    if (sprinting) { speed = 6.0; this.stamina = Math.max(0, this.stamina - dt * 14); }
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * (moving ? 9 : 16));
    if (this.aiming) speed = Math.min(speed, 2.2);
    // desired horizontal velocity
    const f = cam.forward, r = cam.right;
    const dx = r.x * ax.x + f.x * ax.y, dz = r.z * ax.x + f.z * ax.y;
    const dl = Math.hypot(dx, dz);
    const tx = dl > 0.01 ? (dx / Math.max(dl, 1)) * speed : 0, tz = dl > 0.01 ? (dz / Math.max(dl, 1)) * speed : 0;
    const acc = this.onGround ? 14 : 3;
    this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt);
    // jump (vaults low fences in front)
    if (input.pressed('Space') && this.onGround && this.stamina > 8) {
      this.vel.y = 6.2; this.onGround = false; this.stamina -= 8;
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      const near = ph.query(this.pos.x + fx * 0.8 - 0.6, this.pos.z + fz * 0.8 - 0.6, this.pos.x + fx * 0.8 + 0.6, this.pos.z + fz * 0.8 + 0.6, []);
      if (near.some((b) => b.kind === 'fence')) { this.vaultT = 0.7; this.vel.y = 5.2; }
    }
    this.vaultT = Math.max(0, (this.vaultT || 0) - dt);
    this.vel.y -= GRAV * dt;
    // integrate horizontally, then collide
    const ox = this.pos.x, oz = this.pos.z;
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = ph.collide(nx, nz, RADIUS, this.pos.y, this.pos.y + (this.crouch ? 1.2 : HEIGHT), STEP, null, this.vaultT > 0 ? 'fence' : null);
    // deep water & world edge
    const terr = ph.terrain.height(nx, nz);
    if (terr < T.water - 1.15) { nx = ox; nz = oz; this.vel.x = 0; this.vel.z = 0; this.game.hud && this.game.hud.toast('The current is too strong to swim here.', 2); }
    // vertical
    const fallSpeed = -this.vel.y;
    let ny = this.pos.y + this.vel.y * dt;
    const g = ph.groundAt(nx, nz, Math.max(this.pos.y, ny) + STEP, 0.18);
    if (ny <= g + 0.02) {
      // landing / stepping
      if (this.vel.y < -14) this.damage((-this.vel.y - 14) * 6, null);
      if (g - this.pos.y > 0.05 && g - this.pos.y <= STEP) this.visualY -= 0; // smoothed below
      ny = g; this.vel.y = 0; this.onGround = true;
    } else {
      this.onGround = ny - g < 0.08 && this.vel.y <= 0;
      if (this.onGround) { ny = g; this.vel.y = 0; }
    }
    // ceiling
    if (this.vel.y > 0) {
      const c = ph.ceilingAt(nx, nz, ny + 0.5, 0.25);
      if (ny + HEIGHT > c) { ny = Math.min(ny, c - HEIGHT); this.vel.y = 0; }
    }
    this.pos.set(nx, ny, nz);
    // airborne only counts after a moment (steps and slopes flicker)
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    if (this.onGround && this.wasAirborne) this.landV = fallSpeed;
    else if (!this.onGround) this.landV = 0;
    this.wasAirborne = this.airT > 0.12;
    if (this.onGround) this.lastSafe.copy(this.pos);
    if (this.pos.y < T.water - 6) this.pos.copy(this.lastSafe);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    // facing
    if (this.aiming || this.attackT >= 0) this.facing = turnTo(this.facing, Math.atan2(f.x, f.z), dt * 14);
    else if (hs > 0.3) this.facing = turnTo(this.facing, Math.atan2(this.vel.x, this.vel.z), dt * 10);
    // noise level (zombies hear running)
    this.noise = sprinting ? 22 : moving ? (this.crouch ? 3 : 9) : 1;
    // attacks
    this.attackCd -= dt;
    const attackPressed = input.pressed(input.locked ? 'Mouse0' : 'Mouse0Click') || input.pressed('TouchAttack');
    if (attackPressed && this.attackCd <= 0 && !input.uiCapture && this.stamina > 6) {
      this.attackT = 0; this.attackCd = this.weapon.speed; this.hitDone = false;
      this.stamina -= 7;
      this.noise = Math.max(this.noise, 12);
    }
    if (this.attackT >= 0) {
      this.attackT += dt / this.weapon.speed;
      if (!this.hitDone && this.attackT > 0.42) { this.hitDone = true; if (this.weapon.kind !== 'gun' && this.game.combat) this.game.combat.melee(this); }
      if (this.attackT >= 1) this.attackT = -1;
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    // head turns toward where the camera looks
    let look = Math.atan2(f.x, f.z) - this.facing;
    while (look > Math.PI) look -= Math.PI * 2;
    while (look < -Math.PI) look += Math.PI * 2;
    if (Math.abs(look) > 2.2) look = 0;
    const it = this.game.interaction;
    const searching = !!(it && it.target && it.target.kind === 'loot' && it.hold > 0.05);
    this.char.animate(dt, {
      speed: hs, mode: hs > 0.2 ? 'walk' : 'idle', crouch: this.crouch,
      attack: this.attackT >= 0 ? this.attackT : null,
      weapon: this.weapon.kind === 'gun' ? 'gun' : this.weapon.kind === 'bat' ? 'bat' : null,
      aim: this.aiming && this.weapon.kind === 'gun', aimPitch: cam.pitch != null ? cam.pitch + 0.12 : 0,
      air: this.airT > 0.12, vy: this.vel.y, landV: this.landV || 0, search: searching && hs < 0.5,
      lookYaw: this.aiming ? 0 : look,
      stagger: this.hurtFlash > 0 ? (this.hurtFlash / 0.35) * 0.55 : 0,
    });
    this.landV = 0;
    this.syncModel(dt);
    this.inside = ph.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 1.9, 0.1) < this.pos.y + 6;
  }
  syncModel(dt) {
    // smooth stair steps
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 18);
    if (Math.abs(this.pos.y - this.visualY) > 1) this.visualY = this.pos.y;
    const root = this.char.root;
    root.position.set(this.pos.x, this.visualY, this.pos.z);
    root.rotation.y = this.facing;
    // a dead survivor falls onto their back
    const fall = this.dead ? Math.min(1, (this.deadT || 0) * 2.2) : 0;
    root.rotation.x = -Math.sin(fall * Math.PI / 2) * Math.PI / 2 * 0.98;
    root.position.y += 0.12 * fall;
    root.updateMatrixWorld(true);
    // weapon sits in the right fist, oriented by the animation
    const gp = this.char.grip;
    this.weaponMesh.position.copy(gp.pos).applyMatrix4(root.matrixWorld);
    this.weaponMesh.quaternion.copy(root.quaternion).multiply(gp.quat);
    this.weaponMesh.visible = !this.dead && this.weapon.kind !== 'none';
    this.batMesh.visible = this.weapon.kind !== 'gun';
    this.gunMesh.visible = this.weapon.kind === 'gun';
  }
  damage(n, source) {
    if (this.dead || this.godMode) return;
    this.health -= n;
    this.hurtFlash = 0.35;
    if (this.game.hud) this.game.hud.hurt();
    if (this.health <= 0) { this.health = 0; this.dead = true; this.game.onPlayerDeath && this.game.onPlayerDeath(source); }
  }
  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  get head() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z); }
}

function turnTo(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
