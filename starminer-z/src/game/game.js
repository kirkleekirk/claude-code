// One game in progress: the world, the player, what they carry, the enemies, and the rules
// of Endurance (see how far from the start tower you can get, one night at a time).

import * as THREE from 'three';
import { World } from '../world/world.js';
import { B, BLOCKS, SOLID, HEIGHT, isTorch, isDoor, DOOR, doorBlock } from '../world/blocks.js';
import { BIOMES } from '../world/gen.js';
import { Player } from '../entities/player.js';
import { Inventory } from '../items/inventory.js';
import { ITEMS, dropFor, digTime, weaponDamage, STARTER_KIT } from '../items/items.js';
import { getZombie, TYPES } from '../entities/cmz/types.js';
import { ViewModel } from '../gfx/viewModel.js';
import { CmzViewModel } from '../gfx/cmzViewModel.js';
import { Puppet } from '../entities/puppet.js';
import { BlockHighlight, Debris, Sprites } from '../gfx/effects.js';
import { BlockItemMaterials, blockItemGeometry } from '../gfx/blockItem.js';
import { makePropMaterial } from '../gfx/propMaterial.js';
import { Drops } from './drops.js';
import { Explosives, EXPLOSIVE } from './explosives.js';
import { Projectiles } from './projectiles.js';
import { Crates } from './crates.js';
import { Enemies } from './enemies.js';
import { Dragons } from './dragons.js';
import { HUD } from '../ui/hud.js';
import { Crafting } from '../ui/crafting.js';
import { AvatarModel } from '../entities/avatar/model.js';
import { PRESETS } from '../entities/avatar/looks.js';
import { zombieLook } from '../entities/avatar/zombie.js';
import { skeletonLook } from '../entities/avatar/skeleton.js';
import { Online } from '../net/online.js';

const testParams = new URLSearchParams(location.search);

// a new game starts in the middle of the morning, as the original's does
const START_TIME = 0.4;
// when the grace period ends: early on the first afternoon
const GRACE_ENDS = 0.62;

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _f2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), NO_TURN = new THREE.Quaternion();
const D2R = Math.PI / 180;
// how fast a gun's kick settles back (the original's recoilDecay, 30 degrees a second)
const RECOIL_DECAY = 30 * D2R;
const rand = (a, b) => a + Math.random() * (b - a);
// the grenade's clips: the pin out, the throw, the hand back (GrenadeCook, GrenadeThrow,
// GrenadeRelease)
const GRENADE_COOK = 0.983, GRENADE_THROW = 0.317, GRENADE_RESET = 0.317;
// what Activate works on: doors, crates, TNT and C4
const ACTIVATES = new Uint8Array(256);
for (let id = B.DOOR_LOWER_X; id <= B.DOOR_UPPER_OPEN_Z; id++) ACTIVATES[id] = 1;
ACTIVATES[B.CRATE] = ACTIVATES[B.TNT] = ACTIVATES[B.C4] = 1;

// input with nothing pressed (the player stands still while a screen has the controls)
const IDLE = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, wheel: 0, lastDevice: 'keyboard', isHeld: () => false, pressed: () => false, consume: () => false };

export class Game {
  // attract: the world behind the menus (no player, no HUD, no enemies; a camera drifting by)
  // online: { link, welcome }, joining a friend's world (see ../net/online.js)
  constructor(app, { seed = 1337, save = null, mode = 'endurance', attract = false, online = null } = {}) {
    this.app = app;
    this.mode = mode;
    this.attract = attract;
    const welcome = online?.welcome ?? null;
    this.seed = save ? save.seed : welcome ? welcome.seed : seed;
    this.scene = new THREE.Scene();
    this.scene.add(app.sky.mesh);
    this.camera = app.camera;
    this.world = new World({ seed: this.seed, scene: this.scene, materials: app.terrain, renderDistance: app.settings.renderDistance, edits: save ? save.edits : welcome ? welcome.edits : null });
    this.player = new Player(this.world);
    this.player.autoClimb = app.settings.autoClimb;
    this.inventory = new Inventory();
    // first person: the original's own arms, clips and items when they've been ripped
    const cmz = app.cmzPlayer;
    this.viewModel = cmz ? new CmzViewModel(app.sky.uniforms, app.terrain.uniforms, cmz.clips, cmz.items) : new ViewModel(app.sky.uniforms, app.terrain.uniforms);
    this.highlight = new BlockHighlight(this.scene);
    this.debris = new Debris(this.scene, this.world);
    this.sprites = new Sprites(this.scene);
    this.propMat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, { side: THREE.DoubleSide });
    this.blockMats = new BlockItemMaterials(app.sky.uniforms, app.terrain.uniforms);
    this.drops = new Drops(this.scene, this.world, this.propMat, (b) => this.blockMats.get(b), blockItemGeometry);
    // what's in the air, what's about to go off, and what's in the crates
    this.projectiles = new Projectiles(this);
    this.explosives = new Explosives(this);
    this.crates = new Crates(this, save ? save.crates : welcome ? welcome.crates : null);
    this.hud = new HUD(app.uiRoot, this);
    this.enemies = new Enemies(this);
    this.audio = app.audio;
    this.dragons = new Dragons(this, welcome);
    this.look = null;
    this.puppet = null;
    this.preview = null;
    this.lockFree = false;
    // online: the game in common (null playing alone); the friends who've played in this world,
    // what they had when they left (name -> { inventory, player, ... }); swings and shots so far
    this.online = null;
    this.guests = save?.guests || {};
    this.uses = 0;
    // what's changing blocks: 0 the player, 1 the dead digging (online, the others hear which)
    this.editKind = 0;
    this.world.onEdit = (x, y, z, id) => this.online?.blockSet(x, y, z, id, this.editKind);
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
    // a gun's kick: a turn of the view that settles back (the original's RecoilRotation)
    this.recoil = new THREE.Quaternion();
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
    } else if (welcome) {
      // a friend's world: its time and sky, and what you had there if you've played in it before
      this.grace = !!welcome.grace;
      sky.setTime(welcome.time, welcome.day);
      const you = welcome.you, at = you?.player;
      if (you?.inventory) this.inventory.load(you.inventory); else this.starterKit();
      if (you) { this.maxDistance = you.maxDistance || 0; Object.assign(this.stats, you.stats || {}); }
      if (at && at.health > 0 && [at.x, at.y, at.z].every(Number.isFinite)) {
        this.player.spawn(at.x, at.y, at.z);
        this.player.yaw = at.yaw || 0; this.player.pitch = at.pitch || 0;
        this.player.health = at.health;
      } else {
        const sp = this.spawnSpot(online.link.myId);
        this.player.spawn(sp.x, sp.y, sp.z);
        this.player.yaw = Math.PI;
        this.player.pitch = 0.12;
      }
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
    if (online) this.online = new Online(this, online.link, welcome);
  }

  // Open this game to friends (link: hosting, with its code).
  startHosting(link) {
    this.online = new Online(this, link);
  }

  // Where a player starts, and starts again after dying: the spawn point, and online a couple of
  // steps round it for each friend (id: their number), so no one starts inside anyone else.
  spawnSpot(id = this.online?.myId ?? 0) {
    const sp = this.world.gen.spawnPoint();
    if (!id) return sp;
    const a = id * 2.4;
    return { x: sp.x + Math.cos(a) * 1.6, y: sp.y + 0.5, z: sp.z + Math.sin(a) * 1.6 };
  }

  // The original's SetDefaultInventory: a stone pickaxe, the compass, a pistol and a knife, 200
  // bullets and 16 torches (on Hardcore, nothing at all).
  starterKit() {
    const inv = this.inventory;
    inv.slots.fill(null);
    inv.hand = null;
    if (this.difficulty !== 'hardcore') for (const [id, n] of STARTER_KIT) inv.add(id, n);
    inv.selected = 0;
  }

  dispose() {
    this.audio?.holding?.(null);
    this.online?.close();
    this.world.dispose();
    this.hud.el.remove();
    this.enemies?.dispose?.();
    this.dragons?.dispose();
    this.projectiles.dispose();
    this.explosives.dispose();
    this.marker?.removeFromParent();
    this.crafting?.dispose?.();
    this.viewModel.dispose?.();
    this.puppet?.dispose();
    if (this.preview) { this.preview.dispose(); this.preview.material.dispose(); this.preview.root.removeFromParent(); }
  }

  // ---- the player's avatar ---------------------------------------------------------------------

  setLook(look) {
    // (a change of look, not the first one: online, the others see it)
    if (this.look && this.online) this.online.sendLook();
    this.look = look;
    this.puppet?.dispose();
    this.puppet = null;
    this.viewModel.setArmColors?.(look.skin, look.top?.tint);
    this.viewModel.setLook?.(look);
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
    const p = this.player, stage = this.grenadeStage;
    this.grenadeStage = null;
    const show = this.app.thirdPerson && !p.dead && this.look;
    if (!show) { if (this.puppet) this.puppet.root.visible = false; return; }
    if (!this.puppet) { this.puppet = new Puppet(this.app, this.look); this.scene.add(this.puppet.root); }
    this.puppet.root.visible = true;
    const id = this.inventory.held?.id ?? null;
    const it = id ? ITEMS[id] : null, gun = it && it.kind === 'gun';
    const L = this.world.lightAt(p.pos.x, p.pos.y + 1.4, p.pos.z);
    this.puppet.update(dt, {
      pos: p.pos, yaw: p.yaw, pitch: p.pitch, vel: p.vel, onGround: p.onGround, held: id,
      use: !!this.viewModel.useNow, shoulder: gun && this.ads, reload: gun && this.reloading > 0, reloadTime: it?.reload,
      dead: false, light: { sky: L.sky / 15, block: L.block / 15 },
      grenade: stage, holdUse: !!this.grenade, time: this.app.sky.time,
    });
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
    // the tower too, as far round it as the view reaches from here (at the shortest view
    // distance the far side of a wider patch is never drawn, so it would never be ready)
    if (!this.ready && this.world.readiness(cx, cz, 2) >= 1 && this.world.readiness(0, 0, Math.min(2, this.world.radius - 3)) >= 1) this.ready = true;
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
    // online the world doesn't stop for anyone's menu
    const live = this.ready && (playing || !!this.online);

    // the clock, and the endless night of the deep Edge and Hell on Earth
    if (live) sky.advance(dt);
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
    if (this.grace && (sky.day > 1 || sky.time > GRACE_ENDS)) this.endGrace();
    const day = this.dayNumber;
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.stats.days = Math.max(this.stats.days, day);
      this.hud.showDay(day);
      this.audio?.dawn();
    }

    // the player (standing still while the crafting screen is up, or a menu online; the world
    // goes on)
    const crafting = this.crafting?.isOpen;
    if (live && !p.dead) {
      if (!playing) {
        p.update(dt, IDLE, false);
      } else if (crafting) {
        p.update(dt, IDLE, false);
        this.crafting.update(dt, input);
      } else {
        if (input.consume('inventory')) this.openCrafting();
        // (the d-pad too: on an Xbox, Edge takes the View button for itself)
        if (input.consume('view') || input.consume('up')) app.thirdPerson = !app.thirdPerson;
        p.update(dt, input, true);
        if (this.spent && (this.spent.t -= dt) <= 0) {
          const i = this.inventory.slots.indexOf(this.spent.slot);
          if (i >= 0) { this.inventory.slots[i] = null; this.inventory.changed(); }
          this.spent = null;
        }
        if (this.inventory.held && this.inventory.held === this.spent?.slot) { this.handleSpent(input); } else this.handleItems(dt, input);
        if (this.viewModel.useNow) this.uses++;
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
    // a gun's kick turns the view, and settles back at 30 degrees a second
    const kick = 2 * Math.acos(Math.min(1, Math.abs(this.recoil.w)));
    if (kick > 0) this.recoil.slerpQuaternions(NO_TURN, this.recoil, Math.max(0, kick - RECOIL_DECAY * dt) / kick);
    cam.quaternion.multiply(this.recoil);
    if (app.thirdPerson && !p.dead) {
      // behind the shoulder, pulled in short of any wall
      const back = p.forward(_v).negate();
      const hit = this.world.raycast(eye.x, eye.y, eye.z, back.x, back.y, back.z, 3.6, (id) => SOLID[id] === 1);
      const d = Math.max(0.3, (hit ? hit.dist : 3.6) - 0.25);
      cam.position.addScaledVector(back, d);
      cam.position.y += 0.25;
    }
    // at the shoulder a gun narrows the view by its magnification (the original's
    // ShoulderMagnification), as far as it's raised, and the aim slows (a quarter as fast on a
    // stick, as in the original; with a mouse, as far as the view narrows)
    const gunIn = ITEMS[this.inventory.held?.id], zoom = gunIn?.kind === 'gun' ? gunIn.zoom || 1 : 1;
    const base = app.settings.fov * (p.sprinting ? 1.06 : 1), up = this.viewModel.ads;
    const fov = THREE.MathUtils.lerp(base, base / zoom, up);
    if (up > 0) cam.fov = fov; else cam.fov += (fov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
    app.input.aim = up > 0 ? { pad: 0.25, mouse: 1 / THREE.MathUtils.lerp(1, zoom, up) } : null;
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
    if (live) { this.projectiles.update(dt); this.explosives.update(dt); }
    this.updateMarker();
    for (const got of this.drops.update(dt, p, this.inventory)) this.audio?.pickup(got.id);
    this.enemies?.update(dt, live);
    this.dragons?.update(dt, live);
    this.online?.update(dt);
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
    // the compass points to the tower; a locator to where it's set (unset, the world's middle,
    // as the original's GPSEntity points to its zero)
    const to = held?.gps ? (held.gps.at ? { x: held.gps.at[0] + 0.5, z: held.gps.at[2] + 0.5 } : { x: 0, z: 0 }) : this.towerAt;
    const toTower = Math.atan2(to.x - p.pos.x, to.z - p.pos.z) - p.yaw + Math.PI;
    this.viewModel.update(dt, {
      camera: cam, yaw: p.yaw, pitch: p.pitch, bob: bob, bobPhase: p.bobPhase,
      ads: this.ads && !p.sprinting, sprinting: p.sprinting && !this.viewModel.swinging, light: this.light, toTower,
      time: app.sky.time, grenade: !!this.grenade,
      move: Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4.4),
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
      // the crosshair opens with how far a shot can stray, and the kick
      spread: it && it.kind === 'gun' ? 0.25 + it.inaccuracy * 8 + this.spread * 1.4 : 0,
      scoped: !!(it && it.kind === 'gun' && it.scoped && this.viewModel.ads > 0.95),
      lock: it?.guided && this.dragons.lock.rect ? { ...this.dragons.lock.rect, locked: this.dragons.lock.locked } : null,
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

  // The first day's clear sky gives way to the storm, for good.
  endGrace() {
    if (!this.grace) return;
    this.grace = false;
    this.app.sky.setGloom(1, false);
    this.hud.message('The sky is turning...');
    this.audio?.storm?.();
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
    if (inv.selected !== this.lastSelected) {
      this.lastSelected = inv.selected;
      this.reloading = 0;
      this.dig.progress = 0;
      this.cooldown = Math.max(this.cooldown, 0.2);
      // (a grenade being cooked isn't thrown: the original sends it only if one's still in hand)
      this.grenade = null;
      this.audio?.equip(inv.held?.id);
      this.audio?.holding(inv.held ? ITEMS[inv.held.id] : null);
    }

    const eye = p.eye;
    const fwd = p.forward(_f);
    const hit = this.world.raycast(eye.x, eye.y, eye.z, fwd.x, fwd.y, fwd.z, 5.5, (id) => id !== B.LAVA);
    this.lookHit = hit;
    const held = inv.held;
    const it = held ? ITEMS[held.id] : null;
    this.cooldown -= dt;
    this.ads = false;
    // (put the guided launcher away and its lock goes)
    if (!it?.guided && (this.dragons.lock.t || this.dragons.lock.tone)) this.dragons.resetLock();

    // Q: one of what's in hand onto the ground in front (the original's DropOneSelectedTrayItem)
    if (input.consume('drop') && held && !this.grenade) {
      const one = { ...held, count: 1 };
      inv.useHeld(1);
      const f = p.forward(new THREE.Vector3());
      this.drops.spawn(one.id, 1, eye.x + f.x * 0.6, eye.y - 0.3, eye.z + f.z * 0.6, f.clone().multiplyScalar(4).setY(2), one, true);
      this.audio?.drop?.();
      return;
    }

    // B on a pad (the right mouse button): the original's Activate, on a door, a crate, or TNT
    // or C4, whatever's in hand
    if (hit && ACTIVATES[hit.id] && (input.consume('activate') || input.consume('back_btn'))) {
      input.consume('secondary');
      this.activate(hit);
    }

    if (it && it.kind === 'gun') {
      this.handleGun(dt, input, it, held, eye);
      this.highlight.show(hit, 0);
      return;
    }
    this.spread = 0;
    if (it && it.kind === 'grenade') { this.handleGrenade(dt, input); this.highlight.show(hit, 0); return; }
    if (it && (it.tool === 'locator' || it.tool === 'teleporter')) { this.handleGps(input, it, held, hit); this.highlight.show(hit, 0); return; }
    // a block in hand goes down with either trigger, and nothing's dug with it (the original's
    // BlockInventoryItem: Use or the left trigger, pressed)
    if (it && it.kind === 'block') {
      if ((input.pressed('primary') || input.consume('secondary')) && this.cooldown <= 0) {
        this.cooldown = it.cooldown;
        if (hit) this.placeBlock(hit, it);
      }
      this.highlight.show(hit, 0);
      return;
    }

    // Each use waits for the item's cooldown (bare hands, half a second). Holding the button
    // swings again each time it's up (the original's InventoryItem.ProcessInput): at an enemy in
    // reach, a hit; at a block, a dig, which wears what's swung and brings the block out once it's
    // been dug long enough (its TimeToDig with this item).
    const cooldown = it ? it.cooldown : 0.5;
    const swing = Math.min(0.6, Math.max(0.25, cooldown));
    const kind = !it ? 'punch' : it.kind === 'melee' ? 'stab' : 'tool';
    const wear = () => { if (it?.uses && inv.wearHeld(1)) this.audio?.toolBreak(); };
    const target = this.enemies?.raycast(eye, fwd, it?.kind === 'melee' ? 2.6 : 2.3, hit ? hit.dist : 99);
    const primary = input.isHeld('primary');
    // TNT or C4 swung at with anything but a spade: its fuse is lit
    if (input.pressed('primary') && hit && (hit.id === B.TNT || hit.id === B.C4) && it?.tool !== 'spade') this.explosives.light(hit.x, hit.y, hit.z);
    if (primary && target && this.cooldown <= 0) {
      vm.startSwing(kind, swing * 0.9);
      this.cooldown = cooldown;
      if (target.enemy.takeDamage(target.y, weaponDamage(it))) this.onKill(target.enemy);
      this.hud.hitMarker();
      this.audio?.melee(true);
      if (it?.laser) this.audio?.saberSwing();
      wear();
      this.dig.progress = 0;
      this.highlight.show(hit, 0);
      return;
    }

    // digging
    if (primary && hit && BLOCKS[hit.id].breakable) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (this.dig.key !== key) { this.dig.key = key; this.dig.progress = 0; }
      const t = digTime(BLOCKS[hit.id], it);
      if (t !== Infinity) this.dig.progress += t > 0 ? dt / t : 1;
      if (this.cooldown <= 0) {
        this.cooldown = cooldown;
        vm.startSwing(kind, swing);
        if (it?.laser) this.audio?.saberSwing();
        this.audio?.dig(BLOCKS[hit.id].sound, t === Infinity);
        if (t !== Infinity && this.dig.progress >= 1) {
          this.breakBlock(hit, it);
          this.dig.progress = 0;
          this.dig.key = '';
        } else if (t !== Infinity) {
          this.sprites.emit('dust', hit.x + 0.5 + hit.nx * 0.52, hit.y + 0.5 + hit.ny * 0.52, hit.z + 0.5 + hit.nz * 0.52, { color: BLOCKS[hit.id].color, size: 0.08, life: 0.5, spread: 1.6, gravity: 6, alpha: 0.9 });
          this.enemies?.noise('swing', hit.id, it);
        }
        wear();
      }
      if (t === Infinity && !this.toldTier && hit.id !== B.TNT && hit.id !== B.C4) {
        this.toldTier = true;
        this.hud.hint(`You need a better pick to dig ${BLOCKS[hit.id].name}`, 2.5);
        setTimeout(() => { this.toldTier = false; }, 3000);
      }
    } else {
      if (primary && !hit && this.cooldown <= 0) { this.cooldown = cooldown; vm.startSwing(kind, swing); }
      // (letting go, or looking away, starts the dig over, as in the original)
      this.dig.progress = 0;
      if (!primary) this.dig.key = '';
    }
    this.highlight.show(hit, Math.min(1, this.dig.progress));
  }

  // Is the player looking at something B (the right mouse button) would work? (Then it's not the
  // pause menu's.)
  wantsActivate() {
    const h = this.lookHit;
    return !!h && !!ACTIVATES[h.id] && !this.player.dead;
  }

  // The original's Activate (InGameHUD.OnPlayerInput): a door opens or shuts, both halves; a
  // crate opens; TNT or C4 is lit.
  activate(hit) {
    const w = this.world, id = hit.id;
    if (id === B.TNT || id === B.C4) { this.explosives.light(hit.x, hit.y, hit.z); return; }
    if (id === B.CRATE) {
      if (!this.crafting) this.crafting = new Crafting(this.app.uiRoot, this);
      this.crafting.openCrate(this.crates.get(hit.x, hit.y, hit.z));
      this.lockFree = true;
      this.app.input.exitLock();
      this.audio?.ui?.('click');
      return;
    }
    if (!isDoor(id)) return;
    const D = DOOR(id), y0 = D.upper ? hit.y - 1 : hit.y;
    const lower = w.getBlock(hit.x, y0, hit.z), upper = w.getBlock(hit.x, y0 + 1, hit.z);
    const open = !D.open, alongX = isDoor(lower) ? DOOR(lower).alongX : D.alongX;
    if (isDoor(lower) && !DOOR(lower).upper) w.setBlock(hit.x, y0, hit.z, doorBlock(false, open, alongX));
    if (isDoor(upper) && DOOR(upper).upper) w.setBlock(hit.x, y0 + 1, hit.z, doorBlock(true, open, alongX));
    this.audio?.play?.(open ? 'DoorOpen' : 'DoorClose', new THREE.Vector3(hit.x + 0.5, y0 + 0.5, hit.z + 0.5));
  }

  // A block dug out by the player (with `tool` in hand: what comes out of it goes by that). A
  // crate spills what's in it; a door goes whole; what hangs on it falls (InGameHUD.Dig).
  breakBlock(hit, tool = null) {
    const def = BLOCKS[hit.id], w = this.world;
    if (hit.id === B.CRATE) this.crates.spill(hit.x, hit.y, hit.z);
    w.setBlock(hit.x, hit.y, hit.z, B.AIR);
    this.stats.dug++;
    const L = w.lightAt(hit.x, hit.y + 1, hit.z);
    const light = Math.max(0.25, Math.max(L.sky / 15, L.block / 15));
    this.debris.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, def.color, 14, light);
    this.audio?.breakBlock(hit.id);
    const drop = dropFor(hit.id, tool);
    if (drop) this.drops.spawn(drop, 1, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    // (digging out the crash sites' rock is noise the aliens hear)
    this.enemies?.noise('dug', hit.id, tool);
    // the other half of a door
    if (isDoor(hit.id)) {
      const oy = DOOR(hit.id).upper ? hit.y - 1 : hit.y + 1;
      if (isDoor(w.getBlock(hit.x, oy, hit.z))) w.setBlock(hit.x, oy, hit.z, B.AIR);
    }
    this.dropHangers(hit.x, hit.y, hit.z);
  }

  // What hangs on a block that's gone, falling as what it is: the torches on it, and a door
  // standing on it.
  dropHangers(x, y, z) {
    const w = this.world;
    for (const [dx, dy, dz, id] of [[0, 1, 0, B.TORCH], [1, 0, 0, B.TORCH_NX], [-1, 0, 0, B.TORCH_PX], [0, 0, 1, B.TORCH_NZ], [0, 0, -1, B.TORCH_PZ]]) {
      if (w.getBlock(x + dx, y + dy, z + dz) === id) {
        w.setBlock(x + dx, y + dy, z + dz, B.AIR);
        this.drops.spawn('torch', 1, x + dx + 0.5, y + dy + 0.5, z + dz + 0.5);
      }
    }
    const above = w.getBlock(x, y + 1, z);
    if (isDoor(above) && !DOOR(above).upper) {
      w.setBlock(x, y + 1, z, B.AIR);
      if (isDoor(w.getBlock(x, y + 2, z))) w.setBlock(x, y + 2, z, B.AIR);
      this.drops.spawn('door', 1, x + 0.5, y + 1.5, z + 0.5);
    }
  }

  placeBlock(hit, it) {
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const w = this.world, cur = w.getBlock(x, y, z);
    if (cur !== B.AIR && !isTorch(cur)) return;
    let id = it.block;
    const blocked = (bx, by, bz) => this.player.occupies(bx, by, bz) || this.enemies?.occupies(bx, by, bz)
      || (this.online && [...this.online.players.values()].some((r) => r.occupies(bx, by, bz)));
    if (id === B.TORCH) {
      // torches go on floors and walls, not ceilings
      if (hit.ny < 0) return;
      if (hit.nx === 1) id = B.TORCH_NX; else if (hit.nx === -1) id = B.TORCH_PX;
      else if (hit.nz === 1) id = B.TORCH_NZ; else if (hit.nz === -1) id = B.TORCH_PZ;
      if (!SOLID[hit.id]) return;
    } else if (it.door) {
      // a door (the original's DoorInventoryitem): on something, with room above for its top
      // half, set across the way the walls either side of it run
      if (w.getBlock(x, y - 1, z) === B.AIR || w.getBlock(x, y + 1, z) !== B.AIR) return;
      if (blocked(x, y, z) || blocked(x, y + 1, z)) return;
      const full = (bx, bz) => w.getBlock(bx, y, bz) !== B.AIR;
      const xs = [full(x + 1, z), full(x - 1, z)], zs = [full(x, z + 1), full(x, z - 1)];
      const alongX = (xs[0] && xs[1]) || (!(zs[0] && zs[1]) && (xs[0] || xs[1]));
      if (!w.setBlock(x, y, z, doorBlock(false, false, alongX))) return;
      w.setBlock(x, y + 1, z, doorBlock(true, false, alongX));
      this.placed(it, B.DOOR_LOWER_X);
      return;
    } else if (blocked(x, y, z)) return;
    if (!w.setBlock(x, y, z, id)) return;
    this.placed(it, id);
  }

  placed(it, id) {
    this.inventory.useHeld(1);
    this.stats.placed++;
    this.viewModel.startSwing('place', 0.22);
    this.audio?.place(BLOCKS[id].sound);
  }

  // A gun in hand, by the original's GunInventoryItem.ProcessInput: the trigger fires once its
  // cooldown is up (held down, for an automatic); each shot kicks the view, wears the gun, and
  // an empty clip reloads itself. A reload loads what it can of the clip (a shotgun one shell at
  // a time, round again until it's full), and pulling the trigger stops it.
  handleGun(dt, input, it, held, eye) {
    const vm = this.viewModel, inv = this.inventory;
    this.ads = input.isHeld('secondary') || testParams.has('ads');
    this.spread = Math.max(0, this.spread - dt * 3.5);
    const ammoLeft = inv.count(it.ammo);
    const canReload = held.mag < it.mag && ammoLeft > 0;
    if (canReload && input.consume('reload') && !(this.reloading > 0)) this.startReload(it, !input.isHeld('primary'));
    if (this.reloading > 0) {
      if (this.reloadReleased && input.pressed('primary')) { this.reloading = 0; vm.reload = 0; }
      else {
        this.reloading -= dt;
        if (this.reloading <= 0) {
          const n = Math.min(it.mag - held.mag, inv.count(it.ammo), it.perReload);
          if (n > 0) held.mag += inv.remove(it.ammo, n);
          this.audio?.reloadDone(it);
          // more to load (a shotgun's next shell)
          if (held.mag < it.mag && inv.count(it.ammo) > 0) this.startReload(it, this.reloadReleased);
        }
        return;
      }
    }
    // the guided launcher locks on to the dragon at the shoulder, and fires only once it has
    if (it.guided) this.dragons.checkLock(dt, this.ads, eye, this.player.forward(_f2), this.camera);
    // fire
    const trigger = it.auto ? input.isHeld('primary') : input.pressed('primary');
    if (!trigger || this.cooldown > 0) return;
    if (it.guided && !this.dragons.lock.locked && held.mag > 0) return;
    if (held.mag <= 0) {
      if (canReload) this.startReload(it, false);
      else if (input.pressed('primary')) { this.audio?.dryFire(); this.hud.hint(`Out of ${ITEMS[it.ammo]?.name || 'ammo'}`, 1.5); }
      return;
    }
    this.cooldown = it.cooldown;
    held.mag--;
    this.stats.shots++;
    vm.fire(Math.min(0.12, it.recoil * D2R));
    this.audio?.gunshot(it);
    // the shot goes where the view points, kick and all (a bullet a touch above, for its fall);
    // each pellet strays up to the gun's inaccuracy right or left and up or down (the original's
    // GunshotMessage)
    const p = this.player;
    _q.setFromEuler(_e.set(p.pitch, p.yaw, 0, 'YXZ')).multiply(this.recoil);
    const fwd = _f.set(0, 0, -1).applyQuaternion(_q), up = _u.set(0, 1, 0).applyQuaternion(_q), right = _r.set(1, 0, 0).applyQuaternion(_q);
    const muzzle = this.muzzle(eye, fwd, up, right);
    const dirs = [];
    for (let k = 0; k < it.pellets; k++) {
      const dir = fwd.clone();
      if (!it.laser && it.gun !== 'rocket') dir.addScaledVector(up, 0.015);
      dirs.push(dir.addScaledVector(right, rand(-it.inaccuracy, it.inaccuracy)).addScaledVector(up, rand(-it.inaccuracy, it.inaccuracy)).normalize());
    }
    this.fire(it, eye, muzzle, dirs, true, this.online?.myId ?? 0);
    if (it.guided) this.dragons.resetLock();
    this.enemies?.noise('shot');
    this.applyRecoil(it.recoil);
    this.spread = Math.min(1.5, this.spread + it.recoil * D2R * 4);
    // online: the others hear it, and see it go
    this.online?.shot(it.id, eye, muzzle, dirs);
    // smoke from the muzzle
    if (!it.laser) this.sprites.emit('smoke', muzzle.x, muzzle.y, muzzle.z, { color: 0x9a9a9a, size: 0.12, grow: 0.4, life: 0.7, alpha: 0.25, spread: 0.4, v: fwd.clone().multiplyScalar(1.2) });
    // a rocket launcher fires its one rocket and it's spent: in hand, empty, till its clip's
    // played, then gone (RocketLauncherBaseItem.InflictDamage)
    if (it.gun === 'rocket') { this.spent = { slot: held, t: 0.98 }; vm.spend?.(); return; }
    // each shot wears the gun; worn through, it's gone
    if (inv.wearHeld(1)) { this.audio?.toolBreak(); this.reloading = 0; return; }
    if (held.mag <= 0 && inv.count(it.ammo) > 0) this.startReload(it, false);
  }

  // where a shot leaves the gun: its barrel's tip in first person, or near enough
  muzzle(eye, fwd, up, right) {
    const vm = this.viewModel, tip = !this.app.thirdPerson && vm.item?.muzzle;
    if (tip && vm.camera) {
      // the view model's own camera sits at the eye: its tip, from there, into the world
      tip.getWorldPosition(_v);
      vm.camera.worldToLocal(_v);
      const m = eye.clone().addScaledVector(right, _v.x).addScaledVector(up, _v.y).addScaledVector(fwd, -_v.z);
      if (m.distanceTo(eye) < 1.5) return m;
    }
    return eye.clone().addScaledVector(right, 0.12).addScaledVector(up, -0.1).addScaledVector(fwd, 0.6);
  }

  // A shot (anyone's, mine: this player's; shooter, whose): a rocket from the eye, laser bolts
  // from the gun's tip, bullets from the eye.
  fire(it, eye, muzzle, dirs, mine, shooter = 0) {
    for (const d of dirs) {
      if (it.gun === 'rocket') this.projectiles.rocket(eye, d, it, mine, shooter);
      else if (it.laser) this.projectiles.bolt(muzzle, d, it, mine, shooter);
      else this.projectiles.bullet(eye, d, it, mine, shooter);
    }
  }

  // an empty launcher in hand: nothing to do with it but look about (and change what's in hand)
  handleSpent(input) {
    const inv = this.inventory;
    for (let i = 0; i < 8; i++) if (input.consume(`slot${i + 1}`)) inv.select(i);
    if (input.wheel) inv.select(inv.selected + input.wheel);
    if (input.consume('next') || input.consume('rightpad')) inv.select(inv.selected + 1);
    if (input.consume('prev') || input.consume('leftpad')) inv.select(inv.selected - 1);
    this.ads = input.isHeld('secondary');
  }

  startReload(it, released) {
    this.reloading = it.reload;
    this.reloadReleased = released;
    this.viewModel.startReload(it.reload);
    this.audio?.reload(it);
  }

  // The original's ApplyRecoil: the view kicks up by half to all of the gun's recoil, and left or
  // right by up to a quarter of it.
  applyRecoil(deg) {
    const r = deg * D2R;
    this.recoil.multiply(_q2.setFromAxisAngle(X_AXIS, rand(0.5, 1) * r)).multiply(_q2.setFromAxisAngle(Y_AXIS, rand(-0.25, 0.25) * r));
  }

  // What a shot hit (a bullet's or a laser bolt's; mine: this player's, the one that hurts): one
  // of the dead takes it, a block shows it, glass breaks, and TNT or C4 goes off. The dragon
  // takes anyone's (each machine flies every shot).
  shotHit(hit, it, mine, shooter = 0) {
    const at = hit.at;
    if (hit.dragon) {
      // (a flash where it goes in, and no sound: the original's)
      this.dragons.shot(at, it, shooter);
      if (mine) this.hud.hitMarker();
      return;
    }
    if (hit.enemy) {
      if (mine) {
        if (hit.enemy.takeDamage(hit.y, weaponDamage(it))) this.onKill(hit.enemy);
        this.hud.hitMarker();
      }
      this.audio?.bulletHit(at);
      const blood = hit.enemy.kind === 'zombie' ? 0x5a0805 : 0xcfc6ac;
      for (let i = 0; i < 6; i++) this.sprites.emit('blood', at.x, at.y, at.z, { color: blood, size: 0.1, life: 0.5, spread: 2.2, gravity: 9, alpha: 0.95 });
      return;
    }
    const b = hit.block, def = BLOCKS[b.id], d = hit.dir;
    const px = at.x - d.x * 0.02, py = at.y - d.y * 0.02, pz = at.z - d.z * 0.02;
    for (let i = 0; i < 5; i++) this.sprites.emit('dust', px, py, pz, { color: def.color, size: 0.07, life: 0.6, spread: 2, gravity: 8, alpha: 0.9 });
    this.sprites.emit('spark', px, py, pz, { color: it?.laser ? it.color : 0xffc070, size: 0.05, life: 0.12, spread: 3 });
    this.audio?.impact(b.id, at);
    if (!mine) return;
    if (b.id === B.GLASS) this.breakBlock(b);
    else if (b.id === B.TNT || b.id === B.C4) this.explosives.detonate(b.x, b.y, b.z, b.id === B.C4 ? EXPLOSIVE.C4 : EXPLOSIVE.TNT, true, true);
  }

  // A grenade in hand (the original's GrenadeItem and Player.UpdateAnimation): the trigger
  // pulls the pin and it cooks; let go (or four seconds on) and, once the pin's out, the arm comes
  // over and it's thrown as the swing ends, with five seconds less however long it cooked.
  handleGrenade(dt, input) {
    let n = this.grenade;
    if (input.pressed('primary') && !n && this.cooldown <= 0) {
      n = this.grenade = { t: 0, cook: 0, ready: false, throwT: -1 };
      this.grenadeClip('cook');
      this.audio?.play?.('GrenadeArm');
    }
    if (!n) return;
    n.t += dt;
    if (!n.ready) {
      n.cook += dt;
      if (!input.isHeld('primary') || n.cook >= 4) n.ready = true;
    }
    if (n.ready && n.throwT < 0 && n.t >= GRENADE_COOK) { n.throwT = GRENADE_THROW; this.grenadeClip('throw'); }
    if (n.throwT < 0) return;
    n.throwT -= dt;
    if (n.throwT > 0) return;
    this.grenade = null;
    this.throwGrenade(5 - n.cook);
  }

  // a grenade clip, in first person and on the avatar in third
  grenadeClip(stage) {
    this.viewModel.grenade?.(stage);
    this.grenadeStage = stage;
  }

  // GrenadeMessage: from a metre out in front of the eye, at 15 m/s the way the view points
  throwGrenade(fuse) {
    const p = this.player, eye = p.eye;
    const dir = p.forward(new THREE.Vector3());
    const at = eye.clone().add(dir);
    this.projectiles.grenade(at, dir, fuse, true);
    this.online?.grenade(at, dir, fuse);
    this.grenadeClip('reset');
    // (the next can't be started till the hand's back)
    this.cooldown = GRENADE_RESET;
    if (!this.inventory.infinite) this.inventory.useHeld(1);
  }

  // A locator or a teleporter (the original's GPSItem): the trigger marks the block looked at and
  // asks for a name for it (a locator wears a tenth each time); reload renames it; a
  // teleporter's left trigger takes you to where it's marked, and that's it used up.
  handleGps(input, it, held, hit) {
    if (input.consume('reload')) { this.nameGps(held); return; }
    if (input.pressed('primary')) {
      if (!hit) return;
      this.audio?.play?.('locator');
      held.gps = { name: held.gps?.name ?? 'Alpha', at: [hit.x, hit.y, hit.z] };
      if (it.tool === 'locator' && this.inventory.wearHeld(1)) return;
      this.nameGps(held);
      return;
    }
    if (it.tool === 'teleporter' && input.consume('secondary')) {
      const at = held.gps?.at;
      if (!at) { this.audio?.ui?.('deny'); return; }
      this.audio?.play?.('Teleport');
      this.online?.say(`${this.online.myName} Teleported To ${held.gps.name}`);
      this.teleportToPoint(at[0] + 0.5, at[1], at[2] + 0.5);
      this.inventory.wearHeld(1);
    }
  }

  // The original's keyboard for a locator's name: ten letters at most.
  nameGps(slot) {
    this.app.askName?.('Name', 'Enter A Name For This Locator', slot.gps?.name ?? 'Alpha', 10, (name) => {
      if (name) slot.gps = { ...slot.gps, name: name.slice(0, 10) };
    });
  }

  // GameScreen.TeleportToLocation: there, once the ground's in (and out of whatever block it
  // was, on top of it)
  teleportToPoint(x, y, z) {
    const p = this.player;
    p.pos.set(x, y, z);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    if (this.enemies) this.enemies.cleared = 50;
    this.dragons?.resetDistance();
    this.ready = false;
  }

  // One of this machine's dead killed by an explosion someone set off: the kill is theirs
  // (KillEnemyMessage), here or on their machine (item: what did it, for the awards).
  killedBy(e, shooter, item) {
    const me = this.online ? shooter === this.online.myId : true;
    if (me) {
      if (item === 'tnt' || item === 'c4') this.stats.tntKills = (this.stats.tntKills || 0) + 1;
      else if (item === 'grenade') this.stats.grenadeKills = (this.stats.grenadeKills || 0) + 1;
      this.onKill(e);
    } else this.online.killedFor(shooter, e.pos);
  }

  // A laser bolt on a block: a spark of its colour
  boltSplash(at, it) {
    for (let i = 0; i < 4; i++) this.sprites.emit('spark', at.x, at.y, at.z, { color: it?.color ?? 0xff3030, size: 0.06, life: 0.15, spread: 3.5 });
  }

  // Is a screen of the game's up (the inventory, crafting, a crate)?
  get screenUp() { return !!this.crafting?.isOpen; }

  // The marker where the locator in hand points (the original's GPSMarkerEntity: its Marker
  // model, turning, in the locator's colour: gold, or a teleporter's bloodstone)
  updateMarker() {
    const s = this.inventory.held, at = s?.gps?.at;
    if (!at || this.player.dead) { if (this.marker) this.marker.visible = false; return; }
    if (!this.marker) this.marker = this.makeMarker();
    const m = this.marker;
    m.visible = true;
    m.position.set(at[0] + 0.5, at[1] + 1, at[2] + 0.5);
    m.rotation.y = (this.time * 2) % (Math.PI * 2);
    const tint = s.id === 'teleporter' ? 0x8b0000 : 0xffd700;
    if (m.userData.tint !== tint) {
      m.userData.tint = tint;
      m.traverse((o) => { if (o.isMesh && o.userData.recolor) o.material.color.setHex(tint); });
    }
  }

  makeMarker() {
    const M = this.app.cmzPlayer?.items?.models?.marker;
    let root;
    if (M) {
      root = M.scene.clone(true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.recolor = o.name.includes('recolor_');
        o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: o.material.map || null, transparent: true, opacity: 0.85, depthWrite: false });
        o.frustumCulled = false;
      });
    } else {
      // (without the original's model: a diamond on a stalk)
      root = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
      gem.position.y = 0.6;
      gem.userData.recolor = true;
      root.add(gem);
    }
    root.renderOrder = 18;
    this.scene.add(root);
    return root;
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
    this.editKind = 1;
    try { this.digOut(x, y, z); } finally { this.editKind = 0; }
  }

  digOut(x, y, z) {
    const w = this.world, id = w.getBlock(x, y, z);
    // (a crate spills what's in it, as the original's EnemyBreakBlocks has it)
    if (id === B.CRATE) this.crates.spill(x, y, z);
    if (id === B.AIR || !w.setBlock(x, y, z, B.AIR)) return;
    const L = w.lightAt(x, y + 1, z);
    this.debris.burst(x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].color, 10, Math.max(0.25, Math.max(L.sky / 15, L.block / 15)));
    if (isDoor(id)) {
      const oy = DOOR(id).upper ? y - 1 : y + 1;
      if (isDoor(w.getBlock(x, oy, z))) w.setBlock(x, oy, z, B.AIR);
      this.drops.spawn('door', 1, x + 0.5, y + 0.5, z + 0.5);
    }
    this.dropHangers(x, y, z);
  }

  // A block someone else changed, online (kind: 0 a player, 1 the dead digging): what it
  // looks and sounds like where it happens.
  remoteBlockFx(x, y, z, was, id, kind) {
    const L = this.world.lightAt(x, y + 1, z);
    const light = Math.max(0.25, Math.max(L.sky / 15, L.block / 15));
    const at = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    // a crate gone there is gone here (what was in it went where it was broken)
    if (was === B.CRATE && id !== B.CRATE) this.crates.remove(x, y, z);
    // a door opened or shut (the lower half's change makes the sound)
    if (isDoor(was) && isDoor(id)) {
      if (!DOOR(id).upper && DOOR(was).open !== DOOR(id).open) this.audio?.play?.(DOOR(id).open ? 'DoorOpen' : 'DoorClose', at);
      return;
    }
    // (an explosion's: its bang was heard)
    if (kind === 2) { if (was !== B.AIR && id === B.AIR) this.debris.burst(at.x, at.y, at.z, BLOCKS[was].color, 4, light); return; }
    if (id !== B.AIR) { if (!(isDoor(id) && DOOR(id).upper)) this.audio?.place?.(BLOCKS[id].sound, at); return; }
    if (was === B.AIR) return;
    this.debris.burst(at.x, at.y, at.z, BLOCKS[was].color, kind === 1 ? 10 : 14, light);
    if (kind === 1) this.audio?.enemyDig?.(at); else this.audio?.breakBlock?.(was, at);
  }

  // Online: over to another player (a few steps from them), once the ground there is in.
  teleportTo(id) {
    const r = this.online?.players.get(id), p = this.player;
    if (!r || p.dead) return false;
    p.pos.set(r.pos.x + 0.7, r.pos.y + 0.3, r.pos.z + 0.7);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    p.yaw = r.yaw;
    this.ready = false;
    return true;
  }

  // ---- death -------------------------------------------------------------------------------

  onDeath() {
    this.crafting?.close(true);
    this.deathShown = true;
    this.grenade = null;
    if (this.spent) { const i = this.inventory.slots.indexOf(this.spent.slot); if (i >= 0) this.inventory.slots[i] = null; this.spent = null; }
    this.stats.deaths++;
    // the original's KillPlayer: what's in the backpack falls where you died (on Hardcore,
    // everything, the hotbar too, and you start again with nothing)
    const p = this.player.pos, hard = this.difficulty === 'hardcore';
    for (const s of this.inventory.takeAll(hard)) this.drops.spawn(s.id, s.count, p.x, p.y + 1, p.z, null, s);
    if (hard) this.starterKit();
    this.audio?.death();
    this.app.showDeath(this.maxDistance, this.dayNumber);
  }

  respawn() {
    this.deathShown = false;
    this.app.hideDeath();
    const sp = this.spawnSpot();
    this.player.spawn(sp.x, sp.y, sp.z);
    this.player.yaw = Math.PI;
    this.enemies?.clearNear?.(sp, 40);
    this.dragons?.resetDistance();
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
      crates: this.crates.serialize(),
      guests: this.guests,
      savedAt: Date.now(),
    };
  }
}
