// One game in progress: the world, the player, what they carry, the enemies, and the rules
// of Endurance (see how far from the start tower you can get, one night at a time).

import * as THREE from 'three';
import { World } from '../world/world.js';
import { B, BLOCKS, SOLID, HEIGHT, isTorch } from '../world/blocks.js';
import { BIOMES } from '../world/gen.js';
import { Player } from '../entities/player.js';
import { Inventory } from '../items/inventory.js';
import { ITEMS, dropFor, digTime, weaponDamage } from '../items/items.js';
import { getZombie, TYPES } from '../entities/cmz/types.js';
import { ViewModel } from '../gfx/viewModel.js';
import { BlockHighlight, Debris, Sprites, Tracers } from '../gfx/effects.js';
import { BlockItemMaterials, blockItemGeometry } from '../gfx/blockItem.js';
import { makePropMaterial } from '../gfx/propMaterial.js';
import { Drops } from './drops.js';
import { Enemies } from './enemies.js';
import { HUD } from '../ui/hud.js';
import { Crafting } from '../ui/crafting.js';
import { AvatarModel } from '../entities/avatar/model.js';
import { PRESETS } from '../entities/avatar/looks.js';
import { zombieLook } from '../entities/avatar/zombie.js';
import { skeletonLook } from '../entities/avatar/skeleton.js';

const testParams = new URLSearchParams(location.search);

// a new game starts in the middle of the morning, as the original's does
const START_TIME = 0.4;
// when the grace period ends: early on the first afternoon
const GRACE_ENDS = 0.62;

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

// input with nothing pressed (the player stands still while a screen has the controls)
const IDLE = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, wheel: 0, lastDevice: 'keyboard', isHeld: () => false, pressed: () => false, consume: () => false };

export class Game {
  // attract: the world behind the menus (no player, no HUD, no enemies; a camera drifting by)
  constructor(app, { seed = 1337, save = null, mode = 'endurance', attract = false } = {}) {
    this.app = app;
    this.mode = mode;
    this.attract = attract;
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
    this.enemies = new Enemies(this);
    this.audio = app.audio;
    this.look = null;
    this.playerModel = null;
    this.preview = null;
    this.lockFree = false;
    if (attract) {
      this.hud.el.style.display = 'none';
      this.viewModel.hidden = true;
    }
    if (testParams.has('play')) window.__game = this;

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
    // the first day under the clear alien sky; late in the afternoon the storm rolls in for
    // good. (The sky only: the dead come for you from the start, as in the original.)
    this.grace = !save && !attract;
    if (save) {
      this.grace = !!save.grace;
      sky.setTime(save.time, save.day);
      this.inventory.load(save.inventory);
      this.maxDistance = save.maxDistance || 0;
      Object.assign(this.stats, save.stats || {});
      const p = save.player;
      this.player.spawn(p.x, p.y, p.z);
      this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.health = p.health ?? 100;
    } else if (attract) {
      // late afternoon under the storm: a low sun through the clouds
      sky.setTime(0.69, 1);
      const sp = this.world.gen.spawnPoint();
      this.player.spawn(sp.x, sp.y, sp.z);
    } else {
      sky.setTime(START_TIME, 1);
      const sp = this.world.gen.spawnPoint();
      this.player.spawn(sp.x, sp.y, sp.z);
      // facing the giant planet
      this.player.yaw = Math.PI;
      this.player.pitch = 0.12;
      this.starterKit();
    }
    sky.setGloom(this.grace ? 0 : 1, true);
    if (testParams.has('gloom')) sky.setGloom(parseFloat(testParams.get('gloom')), true);
    this.lastDay = this.dayNumber;
    this.depth = 0;
    this.spawnAt = this.world.gen.spawnPoint();
    // distance is counted from the tower, as in the original (you start about 30 out)
    this.towerAt = { x: 0.5, z: 0.5 };
    this.player.onStep = (block, sprint) => this.audio?.step(block, sprint);
    this.player.onLand = (speed, block) => { if (speed > 6) this.audio?.land(block, speed); };
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
    this.crafting?.dispose?.();
    for (const m of [this.playerModel, this.preview]) if (m) { m.dispose(); m.material.dispose(); m.root.removeFromParent(); }
  }

  // ---- the player's avatar ---------------------------------------------------------------------

  setLook(look) {
    this.look = look;
    if (this.playerModel) { this.playerModel.dispose(); this.playerModel.material.dispose(); this.playerModel.root.removeFromParent(); this.playerModel = null; }
    this.viewModel.setArmColors?.(look.skin, look.top?.tint);
  }

  // The avatar on show in the Choose Avatar screen, standing in front of the camera.
  showPreview(look) {
    if (this.preview && (!look || this.preview.look !== look)) {
      this.preview.dispose(); this.preview.material.dispose(); this.preview.root.removeFromParent(); this.preview = null;
    }
    if (!look || this.preview) return;
    this.preview = new AvatarModel(look, this.app.sky.uniforms, this.app.terrain.uniforms);
    this.preview.play('idle');
    this.preview.spin = 0;
    this.scene.add(this.preview.root);
  }

  updatePreview(dt) {
    const m = this.preview;
    if (!m) return;
    const cam = this.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    f.y = 0; f.normalize();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    m.root.position.copy(cam.position).addScaledVector(f, 2.7).addScaledVector(right, 0.85);
    m.root.position.y -= 1.12;
    m.spin += dt * 0.5;
    m.root.rotation.y = Math.atan2(-f.x, -f.z) + Math.sin(m.spin) * 0.5;
    m.setLight(1, 0);
    m.update(dt);
  }

  // Third person: the avatar walks where the player does.
  updatePlayerModel(dt) {
    const p = this.player;
    const show = this.app.thirdPerson && !p.dead && this.look;
    if (!show) { if (this.playerModel) this.playerModel.root.visible = false; return; }
    if (!this.playerModel) {
      this.playerModel = new AvatarModel(this.look, this.app.sky.uniforms, this.app.terrain.uniforms);
      this.scene.add(this.playerModel.root);
    }
    const m = this.playerModel;
    m.root.visible = true;
    m.root.position.copy(p.pos);
    m.root.rotation.y = p.yaw + Math.PI;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (!p.onGround && Math.abs(p.vel.y) > 2) m.play('jump', { fade: 0.15, once: true });
    else if (sp > 5.2) m.play('run', { fade: 0.2, speed: sp / 6 });
    else if (sp > 0.4) m.play('walk', { fade: 0.2, speed: Math.min(2.4, sp / 1.6) });
    else m.play('idle', { fade: 0.3 });
    m.layer.pitch = -p.pitch * 0.5;
    const L = this.world.lightAt(p.pos.x, p.pos.y + 1.4, p.pos.z);
    m.setLight(L.sky / 15, L.block / 15);
    m.update(dt);
  }

  // ---- crafting -------------------------------------------------------------------------------------

  openCrafting() {
    if (!this.crafting) this.crafting = new Crafting(this.app.uiRoot, this);
    this.crafting.open();
    this.lockFree = true;
    this.app.input.exitLock();
    this.audio?.ui?.('open');
  }

  closedCrafting(quiet = false) {
    this.lockFree = false;
    if (quiet) return;
    this.app.input.requestLock();
    this.audio?.ui?.('back');
  }

  // ---- the attract mode ---------------------------------------------------------------------------

  updateAttract(dt) {
    const app = this.app, sky = app.sky, cam = this.camera;
    sky.advance(dt * 0.4);
    const base = this.world.gen.towerBase();
    this.orbit = (this.orbit ?? 0) + dt * 0.045;
    const sway = Math.sin(this.orbit);
    // south of the tower, looking north past it to Ember; the menus sit on the left
    const cx = 15 + sway * 5, cz = -36 + Math.cos(this.orbit * 0.7) * 3;
    cam.position.set(cx, base + 9 + Math.sin(this.orbit * 1.3) * 1.2, cz);
    cam.rotation.set(0.16 + Math.sin(this.orbit * 0.8) * 0.03, Math.PI - 0.1 + sway * 0.06, 0, 'YXZ');
    if (cam.fov !== app.settings.fov) { cam.fov = app.settings.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.world.update(cx, cz);
    this.world.flushUrgent();
    if (!this.ready && this.world.readiness(cx, cz, 2) >= 1 && this.world.readiness(0, 0, 2) >= 1) this.ready = true;
    this.light = new THREE.Vector2(1, 0);
    this.blockMats.setLight(this.light);
    this.propMat.uniforms.uObjLight.value.copy(this.light);
    this.sprites.update(dt);
    this.viewModel.hidden = true;
    this.viewModel.update(dt, { camera: cam, yaw: 0, pitch: 0, bob: 0, bobPhase: 0, ads: false, sprinting: false, light: this.light, toTower: 0 });
    this.updatePreview(dt);
  }

  // ---- the frame --------------------------------------------------------------------------

  update(dt, input) {
    if (this.attract) { this.updateAttract(dt); return; }
    const app = this.app, sky = app.sky, p = this.player;
    this.time += dt;
    const playing = !this.paused && !app.menuOpen;

    // the clock, and the endless night of the deep Edge and Hell on Earth
    if (playing && this.ready) sky.advance(dt);
    this.nightT = (this.nightT || 0) - dt;
    if (this.nightT <= 0) {
      this.nightT = 0.25;
      const gen = this.world.gen;
      sky.endless = gen.endlessNight(p.pos.x, p.pos.z);
      sky.lavaGlow = gen.w[6];
    }
    if (this.nightT === 0.25) {
      // how much ground is overhead: the dripping of the caves, and no lightning down there
      this.depth = this.depthUnderGround(p.pos);
      sky.outdoors = this.depth <= 2 && p.pos.y > 32;
    }
    if (this.grace && (sky.day > 1 || sky.time > GRACE_ENDS)) {
      this.grace = false;
      sky.setGloom(1, false);
      this.hud.message('The sky is turning...');
      this.audio?.storm?.();
    }
    const day = this.dayNumber;
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.stats.days = Math.max(this.stats.days, day);
      this.hud.showDay(day);
      this.audio?.dawn();
    }

    // the player (standing still while the crafting screen is up; the world goes on)
    const crafting = this.crafting?.isOpen;
    if (playing && this.ready && !p.dead) {
      if (crafting) {
        p.update(dt, IDLE, false);
        this.crafting.update(dt, input);
      } else {
        if (input.consume('inventory')) this.openCrafting();
        if (input.consume('view')) app.thirdPerson = !app.thirdPerson;
        p.update(dt, input, true);
        this.handleItems(dt, input);
      }
    }
    if (p.inLava && !this.wasInLava) this.audio?.douse();
    this.wasInLava = p.inLava;
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
    if (app.thirdPerson && !p.dead) {
      // behind the shoulder, pulled in short of any wall
      const back = p.forward(_v).negate();
      const hit = this.world.raycast(eye.x, eye.y, eye.z, back.x, back.y, back.z, 3.6, (id) => SOLID[id] === 1);
      const d = Math.max(0.3, (hit ? hit.dist : 3.6) - 0.25);
      cam.position.addScaledVector(back, d);
      cam.position.y += 0.25;
    }
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
    this.updatePlayerModel(dt);
    this.updatePreview(dt);
    if (this.testAvatars) for (const m of this.testAvatars) {
      m.update(dt);
      const L = this.world.lightAt(m.root.position.x, m.root.position.y + 1.4, m.root.position.z);
      m.setLight(L.sky / 15, L.block / 15);
    }

    // the view model
    const held = this.inventory.held;
    this.viewModel.setItem(held ? held.id : null);
    const toTower = Math.atan2(this.towerAt.x - p.pos.x, this.towerAt.z - p.pos.z) - p.yaw + Math.PI;
    this.viewModel.update(dt, {
      camera: cam, yaw: p.yaw, pitch: p.pitch, bob: bob, bobPhase: p.bobPhase,
      ads: this.ads && !p.sprinting, sprinting: p.sprinting && !this.viewModel.swinging, light: this.light, toTower,
    });
    this.viewModel.hidden = app.thirdPerson || p.dead;

    // distance from the tower
    const dist = Math.floor(Math.hypot(p.pos.x - this.towerAt.x, p.pos.z - this.towerAt.z));
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
    if (testParams.has('avatars') && !this.testAvatars) this.spawnTestAvatars();
    // a crowd to test against, round the player at hdist: horde=N zombies (the type for the
    // distance), skel=N cave skeletons, archer=N archers, or etype=a,b,c (types by number)
    const r = parseFloat(testParams.get('hdist') || '9');
    const types = [];
    for (let i = 0; i < parseInt(testParams.get('horde') || '0', 10); i++) types.push(getZombie(this.enemies.playerDistance()));
    for (let i = 0; i < parseInt(testParams.get('skel') || '0', 10); i++) types.push(26 + (i * 5) % 24);
    for (let i = 0; i < parseInt(testParams.get('archer') || '0', 10); i++) types.push(18 + i % 8);
    if (testParams.get('etype')) types.push(...testParams.get('etype').split(',').map(Number).filter((t) => TYPES[t]));
    types.forEach((type, i) => {
      const n = types.length, off = (i - (n - 1) / 2) * 1.4, yaw = this.player.yaw;
      const x = Math.floor(this.player.pos.x - Math.sin(yaw) * r + off * Math.cos(yaw)) + 0.5;
      const z = Math.floor(this.player.pos.z - Math.cos(yaw) * r - off * Math.sin(yaw)) + 0.5;
      const y = this.world.surfaceY(x, z) + 1.1;
      this.enemies.spawn(type, x, y, z, 0.5);
    });
    // make sure the player is standing on the ground, not inside it
    const p = this.player;
    for (let i = 0; i < 120 && p.collides(p.pos.x, p.pos.y, p.pos.z); i++) p.pos.y += 1;
    if (!this.lastDayShown) { this.lastDayShown = true; this.hud.showDay(this.dayNumber); }
  }

  // The original's clock: its Day counts up from 0.4, so each new day begins 0.4 of the way
  // through one (mid-morning), when "Day N" shows and the stinger plays.
  get cmzDay() { const s = this.app.sky; return s.day - 1 + s.time; }
  get dayNumber() { return Math.max(1, Math.floor(this.cmzDay + 0.6 + 1e-9)); }

  // Solid blocks over the player's feet (the original's BlockTerrain.DepthUnderGround).
  depthUnderGround(pos) {
    const x = Math.floor(pos.x), z = Math.floor(pos.z);
    let n = 0;
    for (let y = Math.max(0, Math.floor(pos.y)); y < HEIGHT; y++) if (SOLID[this.world.getBlock(x, y, z)]) n++;
    return n;
  }

  // A line-up of the player avatars in front of the camera (tools/shoot.mjs uses it).
  spawnTestAvatars() {
    const p = this.player;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const kind = testParams.get('avatars');
    const z = kind === 'z' || kind === 's';
    const zs = parseInt(testParams.get('zseed') || '0', 10);
    const list = kind === 'z' ? [1, 2, 3, 4].map((s) => zombieLook(s + zs)) : kind === 's' ? [1, 1, 1, 1].map((s) => skeletonLook(s + zs)) : PRESETS;
    this.testAvatars = list.map((look, i) => {
      const m = new AvatarModel(look, this.app.sky.uniforms, this.app.terrain.uniforms);
      if (z) { m.layer.reach = 0.9; m.layer.lean = 0.15; m.layer.tilt = (i - 1.5) * 0.15; }
      const at = p.pos.clone().addScaledVector(fwd, parseFloat(testParams.get('adist') || '2.2')).addScaledVector(right, (i - 1.5) * 0.75);
      at.y = this.world.surfaceY(at.x, at.z) + 1 + parseFloat(testParams.get('ay') || '0');
      m.root.position.copy(at);
      m.root.rotation.y = p.yaw;
      m.play(testParams.get('anim') || 'idle');
      this.scene.add(m.root);
      return m;
    });
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
      const rate = it && it.kind === 'melee' ? it.rate : 0.45;
      vm.startSwing(it ? (it.kind === 'melee' ? 'stab' : 'tool') : 'punch', rate * 0.9);
      this.cooldown = rate;
      if (target.enemy.takeDamage(target.y, weaponDamage(it))) this.onKill(target.enemy);
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
    this.audio?.breakBlock(hit.id);
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
    const target = this.enemies?.raycast(eye, dir, maxD, maxD, true);
    let end;
    if (target) {
      end = eye.clone().addScaledVector(dir, target.dist);
      if (target.enemy.takeDamage(target.y, weaponDamage(it))) this.onKill(target.enemy);
      this.hud.hitMarker();
      this.audio?.bulletHit(end);
      const blood = target.enemy.kind === 'zombie' ? 0x5a0805 : 0xcfc6ac;
      for (let i = 0; i < 6; i++) this.sprites.emit('blood', end.x, end.y, end.z, { color: blood, size: 0.1, life: 0.5, spread: 2.2, gravity: 9, alpha: 0.95 });
    } else {
      end = eye.clone().addScaledVector(dir, maxD);
      if (block) {
        const def = BLOCKS[block.id];
        const px = end.x - dir.x * 0.02, py = end.y - dir.y * 0.02, pz = end.z - dir.z * 0.02;
        for (let i = 0; i < 5; i++) this.sprites.emit('dust', px, py, pz, { color: def.color, size: 0.07, life: 0.6, spread: 2, gravity: 8, alpha: 0.9 });
        this.sprites.emit('spark', px, py, pz, { color: 0xffc070, size: 0.05, life: 0.12, spread: 3 });
        this.audio?.impact(block.id, end);
        // glass shatters
        if (block.id === B.GLASS) this.breakBlock(block);
      }
    }
    this.tracers.add(muzzle, end);
  }

  // One of the dead killed by the player: now and then it leaves something (the original's
  // BaseZombie.CreatePickup: further out, better things; in Hell, better still).
  onKill(e) {
    this.stats.kills++;
    const p = e.pos;
    const r = THREE.MathUtils.lerp(Math.min(1, Math.hypot(p.x, p.y - 64, p.z) / 5000), 1, Math.random());
    if (r < 0.5) return;
    const hell = p.y < 64 - 40;
    const table = hell ? [[0.7, 'copper_ore'], [0.8, 'copper'], [0.85, 'iron'], [0.9, 'gold_ore'], [1.01, 'diamond']]
      : [[0.7, 'wood'], [0.8, 'coal'], [0.85, 'copper_ore'], [0.9, 'copper'], [1.01, 'iron_ore']];
    const id = table.find(([k]) => r < k)[1];
    this.drops.spawn(id, 1, p.x, p.y + 1, p.z);
  }

  // A block the dead dig out: no drop, but what hangs on it falls.
  removeBlock(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR || !this.world.setBlock(x, y, z, B.AIR)) return;
    const L = this.world.lightAt(x, y + 1, z);
    this.debris.burst(x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].color, 10, Math.max(0.25, Math.max(L.sky / 15, L.block / 15)));
    for (const [dx, dy, dz, t] of [[0, 1, 0, B.TORCH], [1, 0, 0, B.TORCH_NX], [-1, 0, 0, B.TORCH_PX], [0, 0, 1, B.TORCH_NZ], [0, 0, -1, B.TORCH_PZ]]) {
      if (this.world.getBlock(x + dx, y + dy, z + dz) === t) {
        this.world.setBlock(x + dx, y + dy, z + dz, B.AIR);
        this.drops.spawn('torch', 1, x + dx + 0.5, y + dy + 0.5, z + dz + 0.5);
      }
    }
  }

  // ---- death -------------------------------------------------------------------------------

  onDeath() {
    this.deathShown = true;
    this.stats.deaths++;
    this.audio?.death();
    this.app.showDeath(this.maxDistance, this.dayNumber);
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
      days: this.dayNumber,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health },
      inventory: this.inventory.serialize(),
      maxDistance: this.maxDistance,
      grace: this.grace,
      stats: this.stats,
      edits: this.world.serializeEdits(),
      savedAt: Date.now(),
    };
  }
}
