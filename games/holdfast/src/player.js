// Player: capsule physics against boxes + terrain, movement relative to the
// camera, stamina, health, melee & pistol combat, interaction.
import * as THREE from 'three';
import { T } from './world/terrain.js';

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
    const g = new THREE.CylinderGeometry(0.035, 0.02, 0.85, 8);
    g.translate(0, 0.32, 0);
    g.rotateX(Math.PI / 2);
    const bat = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 }));
    bat.castShadow = true;
    const gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.4, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.2), dark); body.position.set(0, 0.02, 0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), dark); grip.position.set(0, -0.03, 0); grip.rotation.x = 0.25;
    gun.add(body, grip);
    this.weaponMesh = new THREE.Group();
    this.weaponMesh.add(bat, gun);
    this.batMesh = bat; this.gunMesh = gun;
    this.game.scene.add(this.weaponMesh);
  }
  spawn(x, z) {
    const g = this.game.physics.groundAt(x, z, 1e9);
    this.pos.set(x, g, z);
    this.vel.set(0, 0, 0);
    this.visualY = g;
    this.lastSafe.copy(this.pos);
    this.health = this.maxHealth; this.stamina = this.maxStamina; this.dead = false;
  }
  update(dt, input, cam) {
    const ph = this.game.physics;
    if (this.dead) { this.char.animate(dt, { mode: 'dead' }); this.syncModel(dt); return; }
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
    this.char.animate(dt, {
      speed: hs, mode: hs > 0.2 ? 'walk' : 'idle', crouch: this.crouch,
      attack: this.attackT >= 0 ? this.attackT : null, aim: this.aiming && this.weapon.kind === 'gun', holding: true,
    });
    this.syncModel(dt);
    this.inside = ph.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 1.9, 0.1) < this.pos.y + 6;
  }
  syncModel(dt) {
    // smooth stair steps
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 18);
    if (Math.abs(this.pos.y - this.visualY) > 1) this.visualY = this.pos.y;
    this.char.root.position.set(this.pos.x, this.visualY, this.pos.z);
    this.char.root.rotation.y = this.facing;
    // weapon follows the right hand
    const h = this.char.handWorld(new THREE.Vector3());
    this.weaponMesh.position.copy(h);
    const fw = this.char.bones.handR.getWorldQuaternion(new THREE.Quaternion());
    this.weaponMesh.quaternion.copy(fw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.3, 0, 0)));
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
