// One game in progress: the world, the player, what they carry, the enemies, and the rules
// of Endurance (see how far from the start tower you can get, one night at a time).

import * as THREE from 'three';
import { World } from '../world/world.js';
import { B, BLOCKS, SOLID, isTorch } from '../world/blocks.js';
import { BIOMES } from '../world/gen.js';
import { Player } from '../entities/player.js';
import { Inventory } from '../items/inventory.js';
import { ITEMS, dropFor, digTime } from '../items/items.js';
import { ViewModel } from '../gfx/viewModel.js';
import { BlockHighlight, Debris, Sprites, Tracers } from '../gfx/effects.js';
import { BlockItemMaterials, blockItemGeometry } from '../gfx/blockItem.js';
import { makePropMaterial } from '../gfx/propMaterial.js';
import { Drops } from './drops.js';
import { HUD } from '../ui/hud.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export class Game {
  constructor(app, { seed = 1337, save = null, mode = 'endurance' } = {}) {
    this.app = app;
    this.mode = mode;
    this.seed = save ? save.seed : seed;
    const R = app.renderer;
    this.scene = new THREE.Scene();
    this.scene.add(app.sky.mesh);
    this.camera = app.camera;
    this.world = new World({ seed: this.seed, scene: this.scene, materials: app.terrain, renderDistance: app.settings.renderDistance, edits: save ? save.edits : null });
    this.player = new Player(this.world);
    this.player.autoClimb = app.settings.autoClimb;
    this.inventory = new Inventory();
    this.viewModel = new ViewModel(app.sky.uniforms, app.terrain.uniforms);
    this.highlight = new BlockHighlight(this.scene);
    this.debris = new Debris(this.scene, this.world);
    this.sprites = new Sprites(this.scene);
    this.tracers = new Tracers(this.scene);
    this.propMat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, { side: THREE.DoubleSide });
    this.blockMats = new BlockItemMaterials(app.sky.uniforms, app.terrain.uniforms);
    this.drops = new Drops(this.scene, this.world, this.propMat, (b) => this.blockMats.get(b), blockItemGeometry);
    this.hud = new HUD(app.uiRoot, this);
    this.enemies = null;
    this.audio = app.audio;

    // progress
    this.stats = { kills: 0, crafted: 0, dug: 0, placed: 0, shots: 0, deaths: 0, maxDistance: 0, days: 1 };
    this.maxDistance = 0;
    this.lastDay = 1;
    this.dig = { key: '', progress: 0 };
    this.cooldown = 0;
    this.reloading = 0;
    this.spread = 0;
    this.time = 0;
    this.lookHit = null;
    this.paused = false;
    this.ready = false;
    this.deathShown = false;

    const sky = app.sky;
    if (save) {
      sky.setTime(save.time, save.day);
      this.inventory.load(save.inventory);
      this.maxDistance = save.maxDistance || 0;
      Object.assign(this.stats, save.stats || {});
      const p = save.player;
      this.player.spawn(p.x, p.y, p.z);
      this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.health = p.health ?? 100;
      this.lastDay = save.day;
    } else {
      sky.setTime(0.27, 1);
      const sp = this.world.gen.spawnPoint();
      this.player.spawn(sp.x, sp.y, sp.z);
      // facing the giant planet
      this.player.yaw = Math.PI;
      this.player.pitch = 0.12;
      this.starterKit();
    }
    this.spawnAt = this.world.gen.spawnPoint();
    this.player.onStep = (block, sprint) => this.audio?.step(BLOCKS[block]?.sound || 'stone', sprint);
    this.player.onLand = (speed, block) => { if (speed > 6) this.audio?.land(BLOCKS[block]?.sound || 'stone', speed); };
    this.player.onHurt = (n, kind) => { this.hud.hurt(); this.audio?.hurt(kind); if (this.app.vibrate) this.app.vibrate(40); };
    this.inventory.onChange = () => {};
    this.viewModel.setItem(this.inventory.held?.id ?? null);
  }

  starterKit() {
    const inv = this.inventory;
    inv.slots.fill(null);
    inv.slots[0] = inv.make('pick_stone');
    inv.slots[1] = inv.make('compass');
    inv.slots[2] = inv.make('pistol');
    inv.slots[3] = inv.make('torch', 16);
    inv.slots[4] = inv.make('bullets', 200);
    inv.selected = 0;
  }

  dispose() {
    this.world.dispose();
    this.hud.el.remove();
    this.enemies?.dispose?.();
  }

  // ---- the frame --------------------------------------------------------------------------

  update(dt, input) {
    const app = this.app, sky = app.sky, p = this.player;
    this.time += dt;
    const playing = !this.paused && !app.menuOpen;

    // the clock
    if (playing && this.ready) sky.advance(dt);
    if (sky.day !== this.lastDay) {
      this.lastDay = sky.day;
      this.stats.days = Math.max(this.stats.days, sky.day);
      this.hud.showDay(sky.day);
      this.audio?.dawn();
    }

    // the player
    if (playing && this.ready && !p.dead) {
      p.update(dt, input, true);
      this.handleItems(dt, input);
    }
    if (p.dead && !this.deathShown) this.onDeath();
    if (p.dead && this.deathShown && (input.consume('jump') || input.consume('accept') || input.consume('primary'))) this.respawn();

    // camera
    const cam = this.camera;
    const eye = p.eye;
    const bob = p.bobAmount * (app.settings.viewBob ? 1 : 0);
    eye.y += Math.sin(p.bobPhase * 2) * 0.035 * bob;
    cam.position.copy(eye);
    const shake = p.hurtTimer > 0 ? p.hurtTimer * 0.03 : 0;
    cam.rotation.set(p.pitch + (Math.random() - 0.5) * shake, p.yaw + (Math.random() - 0.5) * shake, Math.cos(p.bobPhase) * 0.004 * bob, 'YXZ');
    const fov = app.settings.fov * (p.sprinting ? 1.06 : 1) / (this.viewModel.ads > 0.5 && this.viewModel.info.scope ? ITEMS[this.inventory.held?.id]?.zoom || 1 : 1 + this.viewModel.ads * 0.12);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // the world streams around the player
    this.world.update(p.pos.x, p.pos.z);
    this.world.flushUrgent();
    if (!this.ready && this.world.readiness(p.pos.x, p.pos.z, 2) >= 1) this.onReady();

    // light where the player is (for the held item, drops, exposure)
    const L = this.world.lightAt(eye.x, eye.y, eye.z);
    this.light = new THREE.Vector2(L.sky / 15, L.block / 15);
    this.blockMats.setLight(this.light);
    this.propMat.uniforms.uObjLight.value.copy(this.light);

    // effects
    this.debris.update(dt);
    this.sprites.update(dt);
    this.tracers.update(dt);
    for (const got of this.drops.update(dt, p, this.inventory)) this.audio?.pickup(got.id);
    this.enemies?.update(dt, playing && this.ready);

    // the view model
    const held = this.inventory.held;
    this.viewModel.setItem(held ? held.id : null);
    const toTower = Math.atan2(this.spawnAt.x - p.pos.x, this.spawnAt.z - p.pos.z) - p.yaw + Math.PI;
    this.viewModel.update(dt, {
      camera: cam, yaw: p.yaw, pitch: p.pitch, bob: bob, bobPhase: p.bobPhase,
      ads: this.ads && !p.sprinting, sprinting: p.sprinting && !this.viewModel.swinging, light: this.light, toTower,
    });
    this.viewModel.hidden = app.thirdPerson || p.dead;

    // distance from the tower
    const dist = Math.floor(Math.hypot(p.pos.x - this.spawnAt.x, p.pos.z - this.spawnAt.z));
    this.distance = dist;
    if (dist > this.maxDistance && !p.dead) { this.maxDistance = dist; this.stats.maxDistance = dist; }
    app.awards?.check(this);

    // HUD
    const it = held ? ITEMS[held.id] : null;
    this.hud.update(dt, {
      visible: !app.menuOpen || app.menuShowsHud,
      fps: app.settings.showFps ? `${app.fps}` : '',
      lookName: this.lookHit ? BLOCKS[this.lookHit.id].name : 'Air',
      distance: dist, maxDistance: this.maxDistance,
      health: p.health, maxHealth: p.maxHealth,
      spread: it && it.kind === 'gun' ? 0.25 + this.spread * 1.4 : 0,
      scoped: it && it.kind === 'gun' && it.zoom && this.viewModel.ads > 0.85,
    });
  }

  onReady() {
    this.ready = true;
    // make sure the player is standing on the ground, not inside it
    const p = this.player;
    for (let i = 0; i < 120 && p.collides(p.pos.x, p.pos.y, p.pos.z); i++) p.pos.y += 1;
    if (!this.lastDayShown) { this.lastDayShown = true; this.hud.showDay(this.app.sky.day); }
  }

  biomeName() {
    const p = this.player.pos;
    return BIOMES[this.world.gen.biomeAt(p.x, p.z)];
  }

  // ---- digging, placing, fighting -------------------------------------------------------------

  handleItems(dt, input) {
    const p = this.player, inv = this.inventory, vm = this.viewModel;
    // hotbar
    for (let i = 0; i < 8; i++) if (input.consume(`slot${i + 1}`)) inv.select(i);
    if (input.wheel) inv.select(inv.selected + input.wheel);
    if (input.consume('next')) inv.select(inv.selected + 1);
    if (input.consume('prev')) inv.select(inv.selected - 1);
    if (input.consume('rightpad')) inv.select(inv.selected + 1);
    if (input.consume('leftpad')) inv.select(inv.selected - 1);
    if (inv.selected !== this.lastSelected) { this.lastSelected = inv.selected; this.reloading = 0; this.dig.progress = 0; this.cooldown = Math.max(this.cooldown, 0.2); this.audio?.equip(inv.held?.id); }

    const eye = p.eye;
    const fwd = p.forward(_f);
    const hit = this.world.raycast(eye.x, eye.y, eye.z, fwd.x, fwd.y, fwd.z, 5.5, (id) => id !== B.LAVA);
    this.lookHit = hit;
    const held = inv.held;
    const it = held ? ITEMS[held.id] : null;
    this.cooldown -= dt;
    this.ads = false;

    if (it && it.kind === 'gun') {
      this.handleGun(dt, input, it, held, eye, fwd, hit);
      this.highlight.show(hit, 0);
      return;
    }
    this.spread = 0;

    // melee first: an enemy in reach takes the hit instead of the block behind it
    const target = this.enemies?.raycast(eye, fwd, it?.kind === 'melee' ? 2.6 : 2.3, hit ? hit.dist : 99);
    const primary = input.isHeld('primary');
    if (primary && target && this.cooldown <= 0) {
      const dmg = it ? (it.kind === 'melee' ? it.damage : it.melee || 4) : 4;
      const rate = it && it.kind === 'melee' ? it.rate : 0.45;
      vm.startSwing(it ? (it.kind === 'melee' ? 'stab' : 'tool') : 'punch', rate * 0.9);
      this.cooldown = rate;
      target.enemy.hurt(dmg, fwd, false, this);
      this.hud.hitMarker();
      this.audio?.melee(true);
      if (it && it.durability) inv.wearHeld(1);
      this.dig.progress = 0;
      this.highlight.show(hit, 0);
      return;
    }

    // digging
    if (primary && hit && BLOCKS[hit.id].breakable) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (this.dig.key !== key) { this.dig.key = key; this.dig.progress = 0; }
      const t = digTime(BLOCKS[hit.id], it);
      const kind = !it ? 'punch' : it.kind === 'melee' ? 'stab' : 'tool';
      if (vm.startSwing(kind, kind === 'punch' ? 0.3 : 0.34)) {
        this.audio?.dig(BLOCKS[hit.id].sound, t === Infinity);
        if (t !== Infinity) this.sprites.emit('dust', hit.x + 0.5 + hit.nx * 0.52, hit.y + 0.5 + hit.ny * 0.52, hit.z + 0.5 + hit.nz * 0.52, { color: BLOCKS[hit.id].color, size: 0.08, life: 0.5, spread: 1.6, gravity: 6, alpha: 0.9 });
      }
      if (t !== Infinity) {
        this.dig.progress += dt / t;
        if (this.dig.progress >= 1) {
          this.breakBlock(hit);
          this.dig.progress = 0;
          this.dig.key = '';
          if (it && it.durability) { if (inv.wearHeld(1)) this.audio?.toolBreak(); }
        }
      } else if (vm.swing < 0.05 && !this.toldTier) {
        this.toldTier = true;
        this.hud.hint(`You need a better pick to dig ${BLOCKS[hit.id].name}`, 2.5);
        setTimeout(() => { this.toldTier = false; }, 3000);
      }
    } else {
      if (primary && !hit) vm.startSwing(it ? 'tool' : 'punch', 0.32);
      this.dig.progress = Math.max(0, this.dig.progress - dt * 2);
      if (!primary) this.dig.key = '';
    }
    this.highlight.show(hit, this.dig.progress);

    // placing
    if (input.consume('secondary') && hit && it && it.kind === 'block') this.placeBlock(hit, it);
  }

  breakBlock(hit) {
    const def = BLOCKS[hit.id];
    this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    this.stats.dug++;
    const L = this.world.lightAt(hit.x, hit.y + 1, hit.z);
    const light = Math.max(0.25, Math.max(L.sky / 15, L.block / 15));
    this.debris.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, def.color, 14, light);
    this.audio?.breakBlock(def.sound);
    const drop = dropFor(hit.id);
    if (drop) this.drops.spawn(drop, 1, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    // torches resting on this block fall
    for (const [dx, dy, dz, id] of [[0, 1, 0, B.TORCH], [1, 0, 0, B.TORCH_NX], [-1, 0, 0, B.TORCH_PX], [0, 0, 1, B.TORCH_NZ], [0, 0, -1, B.TORCH_PZ]]) {
      if (this.world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz) === id) {
        this.world.setBlock(hit.x + dx, hit.y + dy, hit.z + dz, B.AIR);
        this.drops.spawn('torch', 1, hit.x + dx + 0.5, hit.y + dy + 0.5, hit.z + dz + 0.5);
      }
    }
  }

  placeBlock(hit, it) {
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && !isTorch(cur)) return;
    let id = it.block;
    if (id === B.TORCH) {
      // torches go on floors and walls, not ceilings
      if (hit.ny < 0) return;
      if (hit.nx === 1) id = B.TORCH_NX; else if (hit.nx === -1) id = B.TORCH_PX;
      else if (hit.nz === 1) id = B.TORCH_NZ; else if (hit.nz === -1) id = B.TORCH_PZ;
      if (!SOLID[hit.id]) return;
    } else {
      if (this.player.occupies(x, y, z)) return;
      if (this.enemies?.occupies(x, y, z)) return;
    }
    if (!this.world.setBlock(x, y, z, id)) return;
    this.inventory.useHeld(1);
    this.stats.placed++;
    this.viewModel.startSwing('place', 0.22);
    this.audio?.place(BLOCKS[id].sound);
  }

  handleGun(dt, input, it, held, eye, fwd, hit) {
    const vm = this.viewModel, inv = this.inventory;
    this.ads = input.isHeld('secondary');
    this.spread = Math.max(0, this.spread - dt * 3.5);
    // reload
    const ammoLeft = inv.count(it.ammo);
    const wantReload = input.consume('reload') || (input.isHeld('primary') && held.mag <= 0 && this.cooldown <= 0);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = it.mag - held.mag;
        const got = inv.remove(it.ammo, Math.min(need, inv.count(it.ammo)));
        held.mag += got;
        this.audio?.reloadDone(it.gun);
      }
      return;
    }
    if (wantReload && held.mag < it.mag && ammoLeft > 0) {
      this.reloading = it.reload;
      vm.startReload(it.reload);
      this.audio?.reload(it.gun);
      return;
    }
    if (wantReload && held.mag <= 0 && ammoLeft <= 0 && input.pressed('primary')) { this.audio?.dryFire(); this.hud.hint('Out of Bullets', 1.5); return; }
    // fire
    const trigger = it.auto ? input.isHeld('primary') : input.pressed('primary');
    if (trigger && this.cooldown <= 0 && held.mag > 0) {
      this.cooldown = 60 / it.rpm;
      held.mag--;
      this.stats.shots++;
      vm.fire(it.recoil * (this.ads ? 0.6 : 1));
      this.audio?.gunshot(it.gun, it.mat);
      const p = this.player;
      p.pitch += it.recoil * (this.ads ? 0.35 : 0.55) * (0.7 + Math.random() * 0.6);
      p.yaw += (Math.random() - 0.5) * it.recoil * 0.4;
      const spreadDeg = it.spread * (this.ads ? 0.35 : 1) * (p.onGround ? 1 : 1.8) + this.spread * 2.5;
      this.spread = Math.min(1.5, this.spread + it.recoil * 4);
      const muzzle = eye.clone().add(new THREE.Vector3(0.12, -0.1, 0).applyQuaternion(this.camera.quaternion)).addScaledVector(fwd, 0.6);
      for (let k = 0; k < it.pellets; k++) {
        const dir = fwd.clone();
        const a = Math.random() * Math.PI * 2, r = Math.tan(THREE.MathUtils.degToRad(spreadDeg)) * Math.sqrt(Math.random());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        dir.addScaledVector(up, Math.sin(a) * r).addScaledVector(right, Math.cos(a) * r).normalize();
        this.shoot(eye, dir, it, muzzle);
      }
      // smoke from the muzzle
      this.sprites.emit('smoke', muzzle.x, muzzle.y, muzzle.z, { color: 0x9a9a9a, size: 0.12, grow: 0.4, life: 0.7, alpha: 0.25, spread: 0.4, v: fwd.clone().multiplyScalar(1.2) });
      if (held.mag <= 0 && inv.count(it.ammo) > 0) setTimeout(() => {}, 0);
    } else if (trigger && held.mag <= 0) {
      this.audio?.dryFire();
    }
  }

  // One bullet: the first thing along the ray takes it.
  shoot(eye, dir, it, muzzle) {
    const range = it.range;
    const block = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, (id) => SOLID[id] || id === B.LEAVES || id === B.GLASS);
    const maxD = block ? block.dist : range;
    const target = this.enemies?.raycast(eye, dir, maxD, maxD);
    let end;
    if (target) {
      end = eye.clone().addScaledVector(dir, target.dist);
      const dmg = it.dmg * (target.head ? 2 : 1) * (target.dist > range * 0.6 ? 0.7 : 1);
      target.enemy.hurt(dmg, dir, target.head, this);
      this.hud.hitMarker();
      for (let i = 0; i < 6; i++) this.sprites.emit('blood', end.x, end.y, end.z, { color: target.enemy.bloodColor || 0x6a0a06, size: 0.1, life: 0.5, spread: 2.2, gravity: 9, alpha: 0.95 });
    } else {
      end = eye.clone().addScaledVector(dir, maxD);
      if (block) {
        const def = BLOCKS[block.id];
        const px = end.x - dir.x * 0.02, py = end.y - dir.y * 0.02, pz = end.z - dir.z * 0.02;
        for (let i = 0; i < 5; i++) this.sprites.emit('dust', px, py, pz, { color: def.color, size: 0.07, life: 0.6, spread: 2, gravity: 8, alpha: 0.9 });
        this.sprites.emit('spark', px, py, pz, { color: 0xffc070, size: 0.05, life: 0.12, spread: 3 });
        this.audio?.impact(def.sound, end);
        // glass shatters
        if (block.id === B.GLASS) this.breakBlock(block);
      }
    }
    this.tracers.add(muzzle, end);
  }

  // ---- death -------------------------------------------------------------------------------

  onDeath() {
    this.deathShown = true;
    this.stats.deaths++;
    this.audio?.death();
    this.app.showDeath(this.maxDistance, this.app.sky.day);
  }

  respawn() {
    this.deathShown = false;
    this.app.hideDeath();
    const sp = this.world.gen.spawnPoint();
    this.player.spawn(sp.x, sp.y, sp.z);
    this.player.yaw = Math.PI;
    this.enemies?.clearNear?.(sp, 40);
    this.ready = false;
  }

  // ---- saving --------------------------------------------------------------------------------

  serialize() {
    const p = this.player;
    return {
      v: 1,
      seed: this.seed,
      mode: this.mode,
      time: this.app.sky.time,
      day: this.app.sky.day,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health },
      inventory: this.inventory.serialize(),
      maxDistance: this.maxDistance,
      stats: this.stats,
      edits: this.world.serializeEdits(),
      savedAt: Date.now(),
    };
  }
}
