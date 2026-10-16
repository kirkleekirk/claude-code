import * as THREE from '../../vendor/three.module.min.js';
import { settings, loadRecords, saveRecords, mapRecord } from '../settings.js';
import { audio } from '../engine/audio.js';
import { Input } from '../engine/input.js';
import { PostFX } from '../engine/post.js';
import { Particles } from '../engine/particles.js';
import { World } from '../world/world.js';
import { getMap } from '../world/maps.js';
import { loadAvatars, buildBody, makeZombieMaterial } from './avatar.js';
import { ZombieManager } from './zombies.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { Director } from './director.js';
import { Interactables } from './interact.js';
import { Powerups } from './powerups.js';
import { Grenades } from './grenades.js';
import { Nightwarden } from './boss.js';
import { Daybreak } from './daybreak.js';
import { PERKS } from './weapons_data.js';
import { HUD } from '../ui/hud.js';
import { Menus } from '../ui/menus.js';
import { TouchControls } from '../ui/touch.js';
import { clamp, lerp, damp, rand, isTouchDevice } from '../util.js';

const BASE = './';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = settings;
    this.audio = audio;
    this.state = 'boot';
    this.inMatch = false;
    this.paused = false;
    this.over = false;
    this.time = 0;
    this.frame = 0;
  }

  // ------------------------------------------------------------------------------------------
  async boot() {
    const q = settings.preset;
    this.menus = new Menus(this);
    this.menus.open('boot', false);
    this.menus.setBoot(0.02, 'Initializing renderer');
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setClearColor(0x000000, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2500);
    this.camera.rotation.order = 'YXZ';
    this.input = new Input(this.canvas);
    this.input.onUnlock = () => {
      if (this.inMatch && !this.paused && !this.over && !this.touch.enabled) this.pause();
    };
    this.post = new PostFX(renderer);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    audio.init();
    const first = getMap(settings.get('lastMap'));
    this.menus.setBoot(0.06, first.INFO.loading[0]);
    const worldP = this._buildWorld(first.INFO.id, (p, label) => this.menus.setBoot(0.06 + p * 0.5, label));
    const audioP = audio.load(BASE + 'assets/audio/', (p) => (this._audioP = p));
    const avatarP = loadAvatars(BASE + 'assets/models/avatars.json', {
      diffuse: BASE + 'assets/textures/zombie_diffuse.png',
      emissive: BASE + 'assets/textures/zombie_emissive.png',
    });
    await worldP;
    this.menus.setBoot(0.6, 'Waking the test subjects');
    const [avatars] = await Promise.all([avatarP, audioP.catch((e) => console.warn('audio load', e))]);
    this.avatars = avatars;
    this.menus.setBoot(0.9, 'Calibrating exo suits');

    this.particles = new Particles(this.scene);
    this.world.particles = this.particles;
    this.viewmodel = new ViewModel(renderer);
    this.zombies = new ZombieManager(this, avatars);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.director = new Director(this);
    this.powerups = new Powerups(this);
    this.grenades = new Grenades(this);
    this.boss = new Nightwarden(this);
    this.zombies.extra.push(this.boss, ...this.boss.orbs);
    this.hud = new HUD(this);
    this.touch = new TouchControls(this);
    this.viewmodel.resize(this.camera.aspect);
    this._setupMap();
    this.applyQuality();
    // warm up shaders so the first fight doesn't hitch
    this.menus.setBoot(0.96, 'Compiling shaders');
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* compile is best-effort */
    }
    this.menus.setBoot(1, 'Ready');
    this.clock = new THREE.Clock();
    this.state = 'title';
    this.loop();
    document.body.classList.add('loaded');
    this.menus.open('title', false);
    await this.menus.waitForStart();
    audio.resume();
    audio.playMusic(BASE + 'assets/audio/music/menu_theme.mp3', { volume: 0.85, fadeIn: 2.5 });
    audio.loop('wind', 'wind_loop', { bus: 'ambience', volume: 0.4 });
    this.state = 'menu';
    this.menus.open('main', false);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inMatch && !this.paused && !this.over) this.pause();
    });
  }

  // ---- maps ---------------------------------------------------------------------------------
  async _buildWorld(id, onProgress) {
    const map = getMap(id);
    const steps = map.INFO.loading;
    const world = new World(this.scene, settings.preset, map);
    await world.build((p) => onProgress(p, steps[Math.min(steps.length - 1, 1 + Math.floor(p * (steps.length - 1)))]));
    this.world = world;
    this.map = map;
    this.mapId = map.INFO.id;
    return world;
  }

  // Everything that belongs to one map but is made by the game: buyables, the Daybreak quest,
  // props built from the avatar rigs, the menu backdrop.
  _setupMap() {
    this.mapRoot = new THREE.Group();
    this.mapRoot.name = 'map-objects';
    this.scene.add(this.mapRoot);
    this.world.particles = this.particles;
    this.zombies.world = this.world;
    this.daybreak = this.map.DAYBREAK ? new Daybreak(this) : null;
    this.interact = new Interactables(this);
    this.world.resetPower();
    this.world.sky.setRound(1, true);
    this.player.reset(this.map.PLAYER_START);
    this.refreshEnvironment();
    this._buildMenuScene();
    this._buildCryoSubjects();
    // caves: an exo helmet light that comes on in the dark
    this.headLight = null;
    this.headFill = null;
    this.caveK = 0;
    this.headK = 0;
    if (this.world.lightVol) {
      this.headLight = new THREE.SpotLight(0xe8efff, 0, 32, 0.68, 0.85, 1.5);
      // what the beam throws back off the rock: a dim glow all round
      this.headFill = new THREE.PointLight(0xc8d2dc, 0, 12, 2);
      this.mapRoot.add(this.headLight, this.headLight.target, this.headFill);
    }
  }

  // Underground: eyes adapt, the helmet light switches itself on, the open air is skipped.
  _updateCaveView(dt) {
    const W = this.world;
    if (!W.lightVol) return;
    const cam = this.camera.position;
    const L = this.map.LIGHTING;
    const [amb] = L.skyAt(cam.x, cam.z);
    this.caveK = damp(this.caveK, 1 - amb, 1.4, dt);
    const s = W.lightAt(cam.x, cam.y, cam.z, this._camLight || (this._camLight = {}));
    let lum = s.r * 0.3 + s.g * 0.59 + s.b * 0.11;
    // the real lamps nearby count too (rooms lit by them aren't dark)
    for (const slot of W.lightPool) {
      const l = slot.light;
      if (!slot.anchor || l.intensity <= 0) continue;
      const d2 = l.position.distanceToSquared(cam);
      if (d2 > l.distance * l.distance) continue;
      lum += (0.25 * l.intensity * (l.color.r * 0.3 + l.color.g * 0.59 + l.color.b * 0.11)) / Math.max(1, d2);
    }
    this.camLum = lum;
    const want = this.state === 'play' && amb < 0.35 && lum < (L.headLightBelow ?? 0.35) ? 1 : 0;
    this.headK = damp(this.headK, want, want ? 2.5 : 1.2, dt);
    const hl = this.headLight;
    if (hl) {
      hl.intensity = this.headK * (L.headLight ?? 26);
      const fwd = this._hlF || (this._hlF = new THREE.Vector3());
      this.camera.getWorldDirection(fwd);
      hl.position.set(cam.x + fwd.z * 0.15, cam.y + 0.12, cam.z - fwd.x * 0.15);
      // a head lamp sits a little low of the eyeline
      hl.target.position.copy(cam).addScaledVector(fwd, 12);
      hl.target.position.y -= 1.1;
      hl.target.updateMatrixWorld();
      this.headFill.intensity = this.headK * (L.headFill ?? 1.6);
      this.headFill.position.set(cam.x + fwd.x * 1.5, cam.y - 0.2, cam.z + fwd.z * 1.5);
    }
    // deep enough that no opening is in sight: skip the sky, the mountain and sun shadows
    const deep = W.depthAt(cam.x, cam.z) > (L.deepAt ?? 60);
    if (deep !== this._deep) {
      this._deep = deep;
      W.sky.mesh.visible = !deep;
      W.terrainMesh.visible = !deep;
      if (W.vegetation) W.vegetation.group.visible = !deep;
      if (W.surfaceGroup) W.surfaceGroup.visible = !deep;
    }
    this.renderer.shadowMap.autoUpdate = !deep;
  }

  // Swap the world for another map (no-op if it is already loaded).
  async loadMap(id) {
    const map = getMap(id);
    if (this.world && this.mapId === map.INFO.id) return;
    const prevState = this.state;
    this.state = 'loading';
    this.menus.open('boot', false);
    this.menus.setBoot(0.02, map.INFO.loading[0]);
    await new Promise((r) => setTimeout(r, 30));
    this.zombies.reset();
    if (this.daybreak) this.daybreak.reset();
    this.particles.clear();
    this.grenades.reset();
    this.powerups.reset();
    this.scene.remove(this.mapRoot);
    disposeTree(this.mapRoot);
    this.world.dispose();
    await this._buildWorld(map.INFO.id, (p, label) => this.menus.setBoot(0.04 + p * 0.9, label));
    this._setupMap();
    this.applyQuality();
    settings.set('lastMap', this.mapId);
    this.menus.setBoot(0.97, 'Compiling shaders');
    await new Promise((r) => setTimeout(r, 0));
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* compile is best-effort */
    }
    this.menus.setBoot(1, 'Ready');
    this.state = prevState === 'loading' ? 'menu' : prevState;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = settings.preset;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * q.pixelRatio;
    this.renderer.setPixelRatio(Math.min(pr, isTouchDevice() ? 1.25 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewmodel) this.viewmodel.resize(w / h);
  }

  applyQuality() {
    const q = settings.preset;
    this.world.sky.setShadowSize(q.shadowSize, q.shadows);
    this.world.sky.setDetail(q.envLight !== false);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.post.configure({ bloom: q.bloom, godrays: q.godrays, msaa: q.msaa });
    this.resize();
    if (this.viewmodel && this.viewmodel.envTarget) this.refreshEnvironment();
  }

  // ---- menu background: slow dolly through the trees with silhouettes in the fog ------------
  _buildMenuScene() {
    const info = this.map.INFO;
    this.menuShots = info.menuShots;
    this.menuShot = 0;
    this.menuT = 0;
    this.menuZombies = [];
    const [fx, fz] = info.menuZombieFace || [0, 0];
    info.menuZombies.forEach(([x, z], i) => {
      const fig = this.avatars.figures[i % this.avatars.figures.length];
      const mat = makeZombieMaterial(this.avatars);
      const body = buildBody(fig, mat);
      const y = this.world.terrain.heightAt(x, z);
      body.mesh.position.set(x, y, z);
      body.mesh.rotation.y = Math.atan2(fx - x, fz - z) + rand(-0.4, 0.4);
      body.bones.head.scale.setScalar(0.86);
      this.mapRoot.add(body.mesh);
      this.menuZombies.push({ body, phase: Math.random() * 10 });
    });
  }

  // Frozen test subjects floating in the research wing's cryo pods.
  _buildCryoSubjects() {
    const pods = this.world.fxPoints.cryo || [];
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const arm = (bone, left, x, y, z) => {
      v.set(left ? x : -x, y, z).normalize();
      q.setFromUnitVectors(new THREE.Vector3(left ? 1 : -1, 0, 0), v);
      bone.quaternion.premultiply(q);
    };
    pods.forEach((c, i) => {
      const fig = this.avatars.figures[(i * 3 + 1) % this.avatars.figures.length];
      const mat = makeZombieMaterial(this.avatars, { tint: 0x86a2aa, eye: 0x3d7a80, eyeIntensity: 0.8 });
      const body = buildBody(fig, mat);
      const B = body.bones;
      q.setFromEuler(new THREE.Euler(0.38 + (i % 3) * 0.08, (i % 2 ? 0.2 : -0.15), (i % 2 ? 0.08 : -0.06)));
      B.head.quaternion.multiply(q);
      q.setFromEuler(new THREE.Euler(0.06, 0, (i % 2 ? 0.04 : -0.04)));
      B.spine.quaternion.multiply(q);
      arm(B.shoulderL, true, 0.18, -0.95, 0.12 + (i % 3) * 0.05);
      arm(B.shoulderR, false, 0.18, -0.95, 0.2);
      q.setFromEuler(new THREE.Euler(0.12, 0, 0));
      B.kneeL.quaternion.multiply(q);
      body.mesh.position.set(c.x, c.y - 0.02, c.z);
      body.mesh.rotation.y = c.x < 13.5 ? Math.PI / 2 : -Math.PI / 2;
      body.mesh.scale.setScalar(0.94);
      body.mesh.castShadow = false;
      this.mapRoot.add(body.mesh);
    });
  }

  _updateMenuCamera(dt) {
    const shot = this.menuShots[this.menuShot];
    this.menuT += dt;
    const k = clamp(this.menuT / shot.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    const cam = this.camera;
    const y0 = shot.abs ? 0 : this.world.terrain.heightAt(shot.from[0], shot.from[2]);
    const y1 = shot.abs ? 0 : this.world.terrain.heightAt(shot.to[0], shot.to[2]);
    cam.position.set(lerp(shot.from[0], shot.to[0], e), lerp(y0 + shot.from[1], y1 + shot.to[1], e), lerp(shot.from[2], shot.to[2], e));
    cam.lookAt(shot.look[0], shot.look[1], shot.look[2]);
    cam.fov = 52;
    cam.updateProjectionMatrix();
    if (this.menuT >= shot.dur) {
      this.menuT = 0;
      this.menuShot = (this.menuShot + 1) % this.menuShots.length;
    }
    // idle sway for the silhouettes
    for (const z of this.menuZombies) {
      z.phase += dt;
      const B = z.body.bones;
      for (const b of Object.values(B)) b.quaternion.copy(b.userData.bindQ);
      const s = Math.sin(z.phase * 0.9);
      const q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(0.25 + s * 0.04, 0, s * 0.06));
      B.spine.quaternion.multiply(q);
      q.setFromEuler(new THREE.Euler(-0.2, Math.sin(z.phase * 0.4) * 0.3, 0.3));
      B.head.quaternion.multiply(q);
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.2, -0.85, 0.3).normalize());
      B.shoulderL.quaternion.premultiply(q);
      q.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-0.15, -0.3 + s * 0.05, 0.9).normalize());
      B.shoulderR.quaternion.premultiply(q);
    }
  }

  setMenuZombiesVisible(v) {
    for (const z of this.menuZombies) z.body.mesh.visible = v;
  }

  // ------------------------------------------------------------------------------------------
  // freeRoam: no zombies, every door open, power on, exo suit on, points to spend
  async startMatch(freeRoam = false, mapId = this.mapId) {
    this.freeRoam = freeRoam;
    this.menus.closeAll();
    audio.fadeOutMusic(1.2);
    audio.stopAll();
    if (getMap(mapId).INFO.id !== this.mapId) await this.loadMap(mapId);
    this.menus.closeAll();
    this.state = 'intro';
    this.hud.show(false);
    this.resetMatch();
    if (!freeRoam) await this.menus.intro(this.map.INFO.intro);
    this.menus.closeAll();
    this.state = 'play';
    this.inMatch = true;
    this.paused = false;
    this.over = false;
    this.setMenuZombiesVisible(false);
    this.hud.show(true);
    this.hud.reset();
    if (freeRoam) this.setupFreeRoam();
    else this.director.start();
    audio.loop('wind', 'wind_loop', { bus: 'ambience', volume: 0.4 });
    audio.loop('bed', 'ambient_bed', { bus: 'music', volume: 0.32 });
    this.ambientT = 8;
    if (this.input.lastDevice === 'touch' || isTouchDevice()) this.touch.enable(true);
    else this.input.requestLock();
    this.input.enabled = true;
    this.objective();
    this.hud.message(freeRoam ? 'FREE ROAM' : this.map.INFO.name, this.map.INFO.subtitle, 3);
  }

  setupFreeRoam() {
    for (const d of this.world.doors) {
      this.world.openDoor(d, true);
      for (const z of d.data.zones) this.zoneOpen[z] = true;
    }
    this.zombies.markFlowDirty();
    for (const id of Object.keys(this.world.circuits)) if (!this.world.powered(id)) this.turnOnCircuit(id, true);
    // already suited up: no injection animation or announcement
    if (!this.player.exo.has) {
      this.player.equipExo();
      this.viewmodel.setExo(true);
      this.interact.exo.suit.visible = false;
    }
    this.player.points = 50000;
  }

  resetMatch() {
    this.zombies.reset();
    if (this.daybreak) this.daybreak.reset();
    this.particles.clear();
    this.grenades.reset();
    this.powerups.reset();
    this.world.resetDoors();
    this.world.resetPower();
    this.world.sky.setRound(1, true);
    this.world.sky.fogBoost = this.world.sky.fogBoostTarget = 0;
    this.refreshEnvironment();
    this.zoneOpen = this.map.ZONES.map((z) => z.id === 0);
    this.player.reset(this.map.PLAYER_START);
    this.weapons.reset();
    this.viewmodel.setExo(false);
    this.interact.reset();
    this.director.reset();
    this.stats = { kills: 0, headshots: 0, earned: 0, downs: 0, time: 0, doors: 0 };
    this.flashAmt = 0;
    this.post.u.uEmp.value = 0;
    this.post.u.uDowned.value = 0;
    this.post.u.uDamage.value = 0;
    this.post.u.uLowHealth.value = 0;
    this.player.zone = 0;
  }

  pause() {
    if (!this.inMatch || this.over || this.paused) return;
    this.paused = true;
    this.input.exitLock();
    this.input.enabled = false;
    this.menus.open('pause', false);
    const s = this.stats;
    document.getElementById('pause-stats').textContent = `ROUND ${this.director.round || 1}  •  ${s.kills} KILLS  •  ${this.player.points} POINTS`;
    if (audio.ctx) audio.ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this.paused) return;
    this.menus.closeAll();
    this.paused = false;
    this.input.enabled = true;
    this.input.clear();
    if (audio.ctx) audio.ctx.resume().catch(() => {});
    if (!this.touch.enabled) this.input.requestLock();
    this.clock.getDelta();
  }

  quitToMenu() {
    this.inMatch = false;
    this.paused = false;
    this.over = false;
    this.input.enabled = false;
    this.input.exitLock();
    this.touch.enable(false);
    if (audio.ctx) audio.ctx.resume().catch(() => {});
    audio.stopAll();
    this.resetMatch();
    this.hud.show(false);
    this.hud.setScope(false);
    this.state = 'menu';
    this.setMenuZombiesVisible(true);
    audio.playMusic(BASE + 'assets/audio/music/menu_theme.mp3', { volume: 0.85, fadeIn: 2 });
    audio.loop('wind', 'wind_loop', { bus: 'ambience', volume: 0.4 });
    this.menus.closeAll();
    this.menus.open('main', false);
  }

  // ---- economy ------------------------------------------------------------------------------
  addPoints(n, applyDouble = true, refund = false) {
    const doubled = applyDouble && this.powerups.active('double');
    const v = doubled ? n * 2 : n;
    this.player.points += v;
    if (!refund) this.stats.earned += v;
    this.hud.pointsPop(v, doubled);
  }

  spend(cost) {
    if (cost <= 0) return true;
    if (this.player.points < cost) {
      audio.play('deny', { bus: 'ui', volume: 0.8 });
      this.hud.message('', 'Not enough points', 1.2, 'small');
      return false;
    }
    this.player.points -= cost;
    this.hud.pointsPop(-cost, false);
    audio.play('buy', { bus: 'ui', volume: 0.8 });
    return true;
  }

  // ---- world events -------------------------------------------------------------------------
  doorBetweenOpen(a, b) {
    return this.world.doors.some((d) => d.open && d.data.zones.includes(a) && d.data.zones.includes(b));
  }

  openDoor(door) {
    this.world.openDoor(door);
    for (const z of door.data.zones) this.zoneOpen[z] = true;
    this.zombies.markFlowDirty();
    this.stats.doors++;
    this.objective();
  }

  equipExo() {
    this.player.equipExo();
    this.viewmodel.setExo(true);
    this.viewmodel.play('inject', 0.9);
    audio.play('exo_equip', { volume: 0.9 });
    audio.announce('Exo suit online.');
    this.hud.message('EXO SUIT ONLINE', 'Jump twice to boost • Dodge mid-air • Crouch in the air to slam', 5, 'exo');
    this.flash(0.25, 0x6fc8ff);
    this.objective();
  }

  givePerk(id) {
    const p = this.player;
    p.perks.add(id);
    this.hud.addPerk(id);
    this.viewmodel.play('inject', 0.9);
    audio.play('perk_buy', { volume: 0.85 });
    if (id === 'health') {
      p.maxHealth = 250;
      p.health = 250;
    }
    if (id === 'medic') p.medicUses++;
    this.hud.message(PERKS[id].name, PERKS[id].desc, 3.5, 'perk');
  }

  turnOnPower() {
    this.turnOnCircuit(this.world.mainCircuit);
  }

  // Throw one circuit's switch. quiet: no fanfare (free roam powers everything at once).
  turnOnCircuit(id, quiet = false) {
    const w = this.world;
    if (w.powered(id)) return;
    w.setCircuit(id, true);
    const c = w.circuits[id] || {};
    if (!quiet) {
      const main = id === w.mainCircuit && !c.label;
      const info = this.map.INFO;
      audio.play(c.sound || 'power_on', { volume: 1 });
      if (main) {
        audio.loop('alarm', 'alarm', { bus: 'ambience', volume: 0.18 });
        setTimeout(() => audio.stopLoop('alarm', 2), 4500);
      }
      const say = c.announce || (main ? info.powerAnnounce : null);
      if (say) setTimeout(() => audio.announce(say), 1200);
      const [title, sub] = c.message || info.powerMessage;
      this.hud.message(title, sub, 4.5);
      this.player.addShake(main ? 0.3 : 0.15, 0.6);
      this.flash(main ? 0.2 : 0.1, 0xffe2b0);
    }
    if (this.map.onPower) this.map.onPower(this, id, quiet);
    this.objective();
  }

  objective() {
    const p = this.player;
    let text = '';
    if (this.daybreak && this.daybreak.fighting) text = 'Defeat the Nightwarden';
    else if (this.freeRoam) text = this.map.INFO.freeObjective;
    else text = this.map.objective(this);
    void p;
    this.hud.objective(text);
  }

  // Sky-coloured image-based light for the world and the weapon, rebuilt as the time of day moves.
  refreshEnvironment() {
    const sky = this.world.sky;
    this.viewmodel.updateEnvironment(sky);
    // the low preset skips image-based light for the world (a stronger sky light stands in)
    this.scene.environment = settings.preset.envLight === false ? null : this.viewmodel.envTarget.texture;
    this._envT = sky.t;
    this._envBoost = sky.fogBoost;
    this._envOvr = sky.overrideSig;
    this._envAt = this.time;
  }

  // Keep the ambient light in step with the sky; thin the haze and sky light indoors.
  updateAmbience(dt, x, z) {
    const sky = this.world.sky;
    // forced day/night swings fast, so the sky light follows it more often while it moves
    const ovrMoved = Math.abs(sky.overrideSig - (this._envOvr || 0)) > 0.05;
    const gap = ovrMoved && sky.transitioning ? 0.25 : 1;
    if ((Math.abs(sky.t - this._envT) > 0.02 || Math.abs(sky.fogBoost - this._envBoost) > 0.08 || ovrMoved) && this.time - this._envAt > gap) this.refreshEnvironment();
    const target = x === undefined ? 0 : this.map.indoorAt(x, z);
    this.indoorK = damp(this.indoorK || 0, target, 2.5, dt);
    sky.setIndoor(this.indoorK);
    this.scene.environmentIntensity = sky.envInt * (1 - 0.45 * this.indoorK);
    sky.hemiBoost = this.scene.environment ? 1 : 1.45;
  }

  onRoundStart(n) {
    if (n === 1 && this.map.INFO.roundOneAnnounce) audio.announce(this.map.INFO.roundOneAnnounce);
    this.refreshEnvironment();
  }

  onZombieKilled(z, info) {
    const s = this.stats;
    s.kills++;
    if (info.part === 'head' && info.source === 'bullet') s.headshots++;
    let pts = 60;
    if (info.source === 'melee') pts = 130;
    else if (info.part === 'head' && info.source === 'bullet') pts = 100;
    else if (info.source === 'explosive' || info.source === 'microwave') pts = 50;
    if (info.source !== 'nuke') this.addPoints(pts);
    if (z.minion) {
      if (this.daybreak) this.daybreak.onMinionKilled();
    }
    else this.director.onKilled(z);
    if (info.source !== 'nuke') this.powerups.maybeDrop(z.root.position);
  }

  onExoSlam(pos, height) {
    const p = this.player;
    const strong = p.perks.has('slam') || p.exo.surge;
    const radius = strong ? 6 : 3;
    audio.play('exo_slam', { volume: strong ? 1 : 0.7 });
    p.addShake(strong ? 0.6 : 0.3, 0.45);
    this.particles.dust(pos.x, pos.y + 0.1, pos.z, 0, 1, 0, [0.42, 0.38, 0.34], strong ? 14 : 6, strong ? 3 : 1.6);
    if (strong) {
      this.world.boom(pos, 0.6);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        this.particles.add.spawn({ x: pos.x + Math.cos(a) * 0.5, y: pos.y + 0.2, z: pos.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 12, vy: 0.5, vz: Math.sin(a) * 12, life: 0.35, size: 0.3, size1: 0.6, r: 1.2, g: 2.6, b: 5, a: 0.9, a1: 0, drag: 4, cell: 0 });
      }
    }
    const dmgBase = strong ? 900 + this.director.round * 160 + height * 60 : 60;
    for (const z of this.zombies.alive) {
      const d = Math.hypot(z.ch.x - pos.x, z.ch.z - pos.z);
      if (d > radius || Math.abs(z.ch.y - pos.y) > 2.5) continue;
      const k = 1 - d / radius;
      const dir = new THREE.Vector3(z.ch.x - pos.x, 0, z.ch.z - pos.z).normalize();
      this.zombies.damage(z, dmgBase * (0.4 + 0.6 * k), { source: strong ? 'explosive' : 'slam-light', part: 'torso', dir, point: z.root.position.clone().setY(z.ch.y + 1), knock: strong ? 7 : 4 });
    }
    for (const t of this.zombies.extra) if (t.alive) t.blast(pos, radius, dmgBase, strong ? 'explosive' : 'slam-light');
  }

  explode(pos, radius, damage, opts = {}) {
    const P = this.particles;
    if (opts.toxic) {
      for (let i = 0; i < 30; i++) {
        P.alpha.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-3, 3), vy: rand(0, 2), vz: rand(-3, 3), life: rand(1.5, 3), size: 0.5, size1: rand(2, 3.5), r: 0.4, g: 0.55, b: 0.12, a: 0.55, a1: 0, drag: 1.5, cell: 1 });
      }
      P.gib(pos.x, pos.y, pos.z, 1.5);
      audio.play3D('explosion', pos, { volume: 0.6, rate: 1.3, refDistance: 6 });
    } else if (opts.small) {
      P.explosion(pos.x, pos.y - 0.3, pos.z, 0.35);
      if (Math.random() < 0.6) audio.play3D('explosion', pos, { volume: 0.35, rate: 1.5, refDistance: 4 });
    } else {
      P.explosion(pos.x, pos.y, pos.z, 1);
      audio.play3D('explosion', pos, { volume: 1.2, refDistance: 9, maxDistance: 120 });
      this.world.boom(pos, 1);
    }
    const p = this.player;
    const pd = Math.hypot(p.ch.x - pos.x, p.ch.y + 1 - pos.y, p.ch.z - pos.z);
    if (!opts.small) p.addShake(clamp(1.2 - pd / 20, 0, 1) * 0.7, 0.5);
    if (!opts.noSelf && pd < radius * 0.75 && !opts.small) {
      const dmg = (opts.toxic ? 30 : 45) * (1 - pd / (radius * 0.75));
      if (dmg > 3) this.hurtPlayer(dmg, pos.x, pos.z, true);
    }
    for (const z of this.zombies.alive) {
      const d = Math.hypot(z.ch.x - pos.x, z.ch.y + 1 - pos.y, z.ch.z - pos.z);
      if (d > radius) continue;
      const k = Math.pow(1 - d / radius, 0.7);
      const dir = new THREE.Vector3(z.ch.x - pos.x, 0.5, z.ch.z - pos.z).normalize();
      this.zombies.damage(z, damage * k, { source: 'explosive', part: 'torso', dir, point: z.root.position.clone().setY(z.ch.y + 1), knock: 5 * k });
    }
    for (const t of this.zombies.extra) if (t.alive) t.blast(pos, radius, damage, 'explosive');
  }

  nuke() {
    this.addPoints(400);
    audio.play('explosion', { volume: 1, rate: 0.6 });
    this.player.addShake(0.5, 0.8);
    let delay = 0;
    for (const z of this.zombies.alive) {
      delay += 40;
      setTimeout(() => {
        if (z.alive) {
          this.zombies.kill(z, { source: 'nuke', part: 'torso', dir: new THREE.Vector3(0, 1, 0) });
          this.particles.explosion(z.ch.x, z.ch.y + 0.5, z.ch.z, 0.25);
        }
      }, delay);
    }
  }

  flash(amount, color) {
    this.flashAmt = Math.max(this.flashAmt || 0, amount);
    this.post.u.uFlashColor.value.set(color);
  }

  noise() {}

  empPlayer(seconds) {
    const p = this.player;
    if (!p.exo.has || p.exo.surge) return;
    p.exo.emp = Math.max(p.exo.emp, seconds);
    p.exo.slamming = false;
    audio.play('emp', { volume: 0.9 });
    this.hud.message('EXO OFFLINE', 'EMP discharge — rebooting', 2.5, 'danger');
  }

  hurtPlayer(amount, fromX, fromZ, explosive = false) {
    const p = this.player;
    if (p.downed || p.dead || this.over) return;
    const downed = p.damage(amount, fromX, fromZ);
    const ang = Math.atan2(fromX - p.ch.x, fromZ - p.ch.z) - Math.atan2(-p.forward.x, -p.forward.z);
    this.hud.damageFrom(-ang);
    if (!explosive && !downed) audio.play('melee_hit', { volume: 0.7, rate: 0.8 });
  }

  downPlayer() {
    const p = this.player;
    this.stats.downs++;
    if (p.medicUses > 0) {
      p.medicUses--;
      p.downed = true;
      p.downT = 6;
      p.crouched = false;
      p.slideT = 0;
      for (const id of [...p.perks]) if (id !== 'medic') p.perks.delete(id);
      p.perks.delete('medic');
      p.maxHealth = 100;
      this.hud.clearPerks();
      this.hud.setDown(true);
      this.weapons.enterLastStand();
      audio.play('heartbeat', { volume: 1 });
      audio.zombie('taunt', p.eye, { volume: 0.9, force: true });
      this.hud.message('DOWN', 'Exo Medic auto-injector engaged', 2.5, 'danger');
    } else {
      this.gameOver();
    }
  }

  revivePlayer() {
    const p = this.player;
    p.downed = false;
    p.health = p.maxHealth;
    p.invuln = 2;
    this.hud.setDown(false);
    this.weapons.exitLastStand();
    audio.play('revive', { volume: 0.9 });
    // shove nearby zombies back so you get a moment
    for (const z of this.zombies.alive) {
      const d = Math.hypot(z.ch.x - p.ch.x, z.ch.z - p.ch.z);
      if (d < 4) {
        z.stagger = 1;
        const dir = new THREE.Vector3(z.ch.x - p.ch.x, 0, z.ch.z - p.ch.z).normalize();
        z.ch.vx = dir.x * 6;
        z.ch.vz = dir.z * 6;
      }
    }
    this.objective();
  }

  gameOver() {
    const p = this.player;
    p.dead = true;
    p.downed = true;
    this.over = true;
    this.input.enabled = false;
    this.input.exitLock();
    this.touch.enable(false);
    audio.stopLoop('bed', 1.5);
    audio.play('game_over', { bus: 'music', volume: 1 });
    setTimeout(() => audio.zombie('laugh', p.eye, { volume: 1, force: true }), 1800);
    const round = Math.max(1, this.director.round);
    const all = loadRecords();
    const rec = mapRecord(all, this.mapId);
    const record = round > rec.bestRound;
    rec.bestRound = Math.max(rec.bestRound, round);
    rec.bestKills = Math.max(rec.bestKills, this.stats.kills);
    rec.games++;
    saveRecords(all);
    this.hud.setDown(false);
    setTimeout(() => {
      this.hud.show(false);
      this.menus.gameOver(this.stats, round, record);
      audio.playMusic(BASE + 'assets/audio/music/menu_theme.mp3', { volume: 0.7, fadeIn: 4 });
    }, 3200);
  }

  // Test hook: advance the simulation without rendering (used by the headless checks).
  stepSim(seconds, dt = 1 / 30) {
    const n = Math.ceil(seconds / dt);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.time += dt;
      this.frame++;
      if (this.state === 'play' && !this.paused) this.updatePlay(dt);
    }
    return performance.now() - t0;
  }

  // ------------------------------------------------------------------------------------------
  loop() {
    requestAnimationFrame(() => this.loop());
    let dt = this.clock.getDelta();
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.frame++;
    this.menus.update(dt);
    if (this.state === 'play' && !this.paused) this.updatePlay(dt);
    else if (this.state === 'menu' || this.state === 'title' || this.state === 'intro') this.updateMenu(dt);
    this.render(dt);
  }

  updateMenu(dt) {
    this._updateMenuCamera(dt);
    this.updateAmbience(dt);
    this._updateCaveView(dt);
    this.world.update(dt, this.camera.position, this.camera.position);
    this.world.sky.update(dt, this.camera.position, this.time);
    this.particles.update(dt);
    audio.updateListener(this.camera);
  }

  updatePlay(dt) {
    const input = this.input;
    input.update(dt);
    if (input.pressed.pause && !this.over) {
      this.pause();
      return;
    }
    // embedded views can refuse pointer lock: explain free look once
    if (input.lockBlocked && !this.lockHintShown) {
      this.lockHintT = (this.lockHintT || 0) + dt;
      if (this.lockHintT > 0.75) {
        this.lockHintShown = true;
        this.hud.message('FREE MOUSE LOOK', 'This view blocks mouse capture. Rest the cursor at an edge to keep turning.', 6);
      }
    }
    const p = this.player;
    this.stats.time += dt;
    // which zone are we in?
    const zid = this.world.zoneAt(p.ch.x, p.ch.z);
    if (zid >= 0) p.zone = zid;
    this.updateAmbience(dt, p.ch.x, p.ch.z);
    if (!this.over) {
      const assist = this.weapons.aimAssist(input);
      p.update(dt, input, { aimAssist: assist });
      this.weapons.update(dt, input);
      this.interact.update(dt, input);
    } else {
      // death cam: slump to the ground
      p.ch.h = Math.max(0.35, p.ch.h - dt * 1.2);
      p.eyeH = Math.max(0.3, p.eyeH - dt * 1.0);
      p.roll = lerp(p.roll, 0.6, dt * 1.5);
      p.updateCamera(dt, {});
    }
    if (!this.freeRoam) this.director.update(dt);
    this.zombies.update(dt);
    this.boss.update(dt);
    if (this.daybreak) this.daybreak.update(dt);
    this.grenades.update(dt);
    this.powerups.update(dt);
    this.particles.update(dt);
    this.world.update(dt, this.camera.position, p.pos);
    this.world.sky.update(dt, p.pos, this.time);
    this._updateCaveView(dt);
    this.viewmodel.update({
      dt, ads: this.weapons.ads, sprinting: p.sprinting, speed: p.speed, grounded: p.ch.grounded,
      lookX: p.lookX, lookY: p.lookY, sliding: p.slideT > 0,
    });
    this.hud.update(dt);
    this.touch.update();
    audio.updateListener(this.camera);
    audio.setIndoor(this.map.ZONES[Math.max(0, p.zone)].indoor);
    // post overlays
    const u = this.post.u;
    u.uDamage.value = Math.max(0, p.hurtFlash * 0.8);
    u.uLowHealth.value = p.downed ? 0 : clamp(1 - p.health / (p.maxHealth * 0.6), 0, 1) * (p.health < p.maxHealth ? 1 : 0);
    u.uDowned.value = lerp(u.uDowned.value, p.downed ? 1 : 0, dt * 3);
    u.uEmp.value = Math.max(p.exo.emp > 0 ? 0.35 + 0.25 * Math.sin(this.time * 20) : 0, u.uEmp.value - dt * 2);
    this.flashAmt = Math.max(0, (this.flashAmt || 0) - dt * 1.5);
    u.uFlash.value = this.flashAmt;
    audio.setMuffle(p.downed ? 0.8 : clamp((1 - p.health / p.maxHealth) - 0.4, 0, 0.6));
    // heartbeat at low health
    this._hbT = (this._hbT || 0) - dt;
    if (p.health < p.maxHealth * 0.35 && !p.downed && this._hbT <= 0) {
      this._hbT = 0.9;
      audio.play('heartbeat', { bus: 'ui', volume: 0.7 });
    }
    // forest ambience (maps can bring their own)
    this.ambientT -= dt;
    if (this.map.ambience) this.map.ambience(this, dt);
    else if (this.ambientT <= 0) {
      this.ambientT = rand(14, 30);
      const a = Math.random() * Math.PI * 2;
      const pos = new THREE.Vector3(p.ch.x + Math.cos(a) * 30, p.ch.y + 10, p.ch.z + Math.sin(a) * 30);
      const t = this.world.sky.t;
      const pick = Math.random();
      if (t > 0.45 && pick < 0.4) audio.play3D('owl', pos, { bus: 'ambience', volume: 0.6, refDistance: 18 });
      else if (pick < 0.6) audio.play3D('creak', pos, { bus: 'ambience', volume: 0.5, refDistance: 15 });
      else if (t > 0.6 && pick < 0.75) audio.play3D('howl', pos.multiplyScalar(1), { bus: 'ambience', volume: 0.35, refDistance: 30 });
      else if (pick < 0.85) audio.play('thunder', { bus: 'ambience', volume: 0.25 });
    }
  }

  render(dt) {
    const cam = this.camera;
    const q = settings.preset;
    // eyes adjust indoors: lamp-lit rooms are far dimmer than the open sky; caves even more so
    const caveK = this.caveK || 0;
    const caveExp = this.world.lightVol ? this.map.LIGHTING.exposure ?? 1.9 : 1;
    this.post.u.uExposure.value = lerp(this.world.sky.exposure * (1 + 0.8 * (this.indoorK || 0)), caveExp, caveK);
    this.post.u.uGrain.value = settings.get('filmGrain') ? 0.022 : 0;
    this.post.updateSun(cam, this.world.sky.sunDir);
    // viewmodel lighting tracks the world
    if (this.viewmodel && this.state === 'play') {
      const vm = this.viewmodel;
      vm.hemi.color.copy(this.world.sky.hemi.color);
      vm.hemi.groundColor.copy(this.world.sky.hemi.groundColor);
      vm.hemi.intensity = this.world.sky.hemi.intensity * 1.3 * (1 - caveK);
      const indoor = this.indoorK || 0;
      vm.dir.color.copy(this.world.sky.sun.color);
      vm.dir.intensity = this.world.sky.sun.intensity * (1 - indoor * 0.8) * 0.8 * (1 - caveK);
      let ld = this.world.sky.lightDir;
      vm.fill.intensity = 1.4;
      vm.scene.environmentIntensity = 0.45;
      if (caveK > 0.01 && this._camLight) {
        // underground the weapon is lit by the lamps around you (and your helmet light)
        const s = this._camLight;
        const lum = Math.max(1e-4, s.r * 0.3 + s.g * 0.59 + s.b * 0.11);
        const k = Math.min(1, lum * 2.2);
        vm.hemi.color.setRGB(s.r / lum, s.g / lum, s.b / lum).multiplyScalar(0.5);
        vm.hemi.groundColor.copy(vm.hemi.color).multiplyScalar(0.4);
        vm.hemi.intensity += caveK * (0.08 + 1.1 * k);
        if (s.strength > 0.15 && k > 0.05) {
          vm.dir.color.setRGB(s.r / lum, s.g / lum, s.b / lum);
          vm.dir.intensity = lerp(vm.dir.intensity, 1.6 * k * s.strength, caveK);
          ld = this._ldTmp || (this._ldTmp = new THREE.Vector3());
          ld.set(s.dx, s.dy, s.dz);
        }
        vm.fill.intensity = 1.4 * (1 - caveK) + caveK * (0.12 + 0.9 * k + 0.75 * this.headK);
        vm.scene.environmentIntensity = 0.45 * (1 - caveK) + caveK * 0.06;
      }
      ld = ld.clone().applyQuaternion(cam.quaternion.clone().invert());
      vm.dir.position.copy(ld).multiplyScalar(5);
      vm.dir.target.position.set(0, 0, 0);
      vm.dir.target.updateMatrixWorld();
      this.post.render(this.scene, cam, vm.scene, vm.camera, this.time);
    } else {
      this.post.render(this.scene, cam, null, null, this.time);
    }
    void q;
    void dt;
  }
}

// Free the GPU buffers of a group made per map (meshes, their own materials and textures).
function disposeTree(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m) || m.userData.shared) continue;
      seen.add(m);
      for (const k of ['map', 'emissiveMap', 'normalMap']) if (m[k] && !m[k].userData.shared && !seen.has(m[k])) {
        seen.add(m[k]);
        m[k].dispose();
      }
      m.dispose();
    }
  });
}
