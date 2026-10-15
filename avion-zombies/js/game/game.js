import * as THREE from '../../vendor/three.module.min.js';
import { settings, loadRecords, saveRecords } from '../settings.js';
import { audio } from '../engine/audio.js';
import { Input } from '../engine/input.js';
import { PostFX } from '../engine/post.js';
import { Particles } from '../engine/particles.js';
import { World } from '../world/world.js';
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
    this.menus.setBoot(0.06, 'Shaping the Olympic Peninsula');
    this.world = new World(this.scene, q);
    this.map = this.world.map;
    const worldP = this.world.build((p) => this.menus.setBoot(0.06 + p * 0.5, p < 0.4 ? 'Raising the ridge' : p < 0.7 ? 'Growing Douglas firs' : 'Mapping zombie paths'));
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
    this.daybreak = new Daybreak(this);
    this.interact = new Interactables(this);
    this.hud = new HUD(this);
    this.touch = new TouchControls(this);
    this.viewmodel.resize(this.camera.aspect);
    this.applyQuality();
    this.world.setPower(false);
    this.world.sky.setRound(1, true);
    this.refreshEnvironment();
    this._buildMenuScene();
    this._buildCryoSubjects();
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
    this.menuShots = [
      { from: [-33, 2.2, 36], to: [-40, 2.0, 22], look: [-80, 6, 8], dur: 22 },
      { from: [-50, 9.5, -12], to: [-62, 9.8, -20], look: [-140, 4, -30], dur: 22 },
      { from: [-4, 3, 40], to: [10, 3.4, 30], look: [24, 2, 10], dur: 20 },
    ];
    this.menuShot = 0;
    this.menuT = 0;
    this.menuZombies = [];
    const spots = [[-48, 14], [-44, 9], [-52, 22], [-58, -14], [-64, -26], [-70, -18]];
    spots.forEach(([x, z], i) => {
      const fig = this.avatars.figures[i % this.avatars.figures.length];
      const mat = makeZombieMaterial(this.avatars);
      const body = buildBody(fig, mat);
      const y = this.world.terrain.heightAt(x, z);
      body.mesh.position.set(x, y, z);
      body.mesh.rotation.y = Math.atan2(-30 - x, 30 - z) + rand(-0.4, 0.4);
      body.bones.head.scale.setScalar(0.86);
      this.scene.add(body.mesh);
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
      this.scene.add(body.mesh);
    });
  }

  _updateMenuCamera(dt) {
    const shot = this.menuShots[this.menuShot];
    this.menuT += dt;
    const k = clamp(this.menuT / shot.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    const cam = this.camera;
    const y0 = this.world.terrain.heightAt(shot.from[0], shot.from[2]);
    const y1 = this.world.terrain.heightAt(shot.to[0], shot.to[2]);
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
  async startMatch(freeRoam = false) {
    this.freeRoam = freeRoam;
    this.menus.closeAll();
    audio.fadeOutMusic(1.2);
    audio.stopAll();
    this.state = 'intro';
    this.hud.show(false);
    this.resetMatch();
    if (!freeRoam) await this.menus.intro([
      { text: 'RAINSHADOW', cls: 'big', speed: 70, pause: 500 },
      { text: 'AVION EXO RESEARCH SITE 9 — OLYMPIC PENINSULA, WA', speed: 24 },
      { text: 'OCT 13 — 18:47 PDT', speed: 30, pause: 600 },
      { text: 'Containment failure in the exo test program. Site has gone dark.', cls: 'dim', speed: 22 },
      { text: 'Survive.', cls: 'accent', speed: 60 },
    ]);
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
    this.hud.message(freeRoam ? 'FREE ROAM' : 'RAINSHADOW', 'Avion Exo Research Site 9', 3);
  }

  setupFreeRoam() {
    for (const d of this.world.doors) {
      this.world.openDoor(d, true);
      for (const z of d.data.zones) this.zoneOpen[z] = true;
    }
    this.zombies.markFlowDirty();
    if (!this.world.power) this.turnOnPower();
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
    this.daybreak.reset();
    this.particles.clear();
    this.grenades.reset();
    this.powerups.reset();
    this.world.resetDoors();
    this.world.setPower(false);
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
    this.world.setPower(true);
    audio.play('power_on', { volume: 1 });
    audio.loop('alarm', 'alarm', { bus: 'ambience', volume: 0.18 });
    setTimeout(() => audio.stopLoop('alarm', 2), 4500);
    setTimeout(() => audio.announce('Power restored. Containment protocols offline.'), 1200);
    this.hud.message('POWER ON', 'Exo upgrades and the Weapon Forge are online', 4.5);
    this.player.addShake(0.3, 0.6);
    this.flash(0.2, 0xffe2b0);
    this.objective();
  }

  objective() {
    const p = this.player;
    let text = '';
    if (this.daybreak && this.daybreak.fighting) text = 'Defeat the Nightwarden';
    else if (this.freeRoam) text = 'Free roam: explore Rainshadow';
    else if (!p.exo.has) text = this.zoneOpen[1] ? 'Equip the Exo Suit in the Checkpoint armory' : 'Reach the facility checkpoint and find an Exo Suit';
    else if (!this.world.power) text = 'Restore power in Hangar 2';
    else if (!this.weapons.inv.some((w) => w.level > 0)) text = 'Upgrade a weapon at the Weapon Forge';
    else text = 'Survive';
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
    if (n === 1) audio.announce('Containment breach. All personnel to evacuation points.');
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
    if (z.minion) this.daybreak.onMinionKilled();
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
    const rec = loadRecords();
    const record = round > rec.bestRound;
    rec.bestRound = Math.max(rec.bestRound, round);
    rec.bestKills = Math.max(rec.bestKills, this.stats.kills);
    rec.games++;
    saveRecords(rec);
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
    this.daybreak.update(dt);
    this.grenades.update(dt);
    this.powerups.update(dt);
    this.particles.update(dt);
    this.world.update(dt, this.camera.position, p.pos);
    this.world.sky.update(dt, p.pos, this.time);
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
    // forest ambience
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
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
    // eyes adjust indoors: lamp-lit rooms are far dimmer than the open sky
    this.post.u.uExposure.value = this.world.sky.exposure * (1 + 0.8 * (this.indoorK || 0));
    this.post.u.uGrain.value = settings.get('filmGrain') ? 0.022 : 0;
    this.post.updateSun(cam, this.world.sky.sunDir);
    // viewmodel lighting tracks the world
    if (this.viewmodel && this.state === 'play') {
      const vm = this.viewmodel;
      vm.hemi.color.copy(this.world.sky.hemi.color);
      vm.hemi.groundColor.copy(this.world.sky.hemi.groundColor);
      vm.hemi.intensity = this.world.sky.hemi.intensity * 1.3;
      const indoor = this.indoorK || 0;
      vm.dir.color.copy(this.world.sky.sun.color);
      vm.dir.intensity = this.world.sky.sun.intensity * (1 - indoor * 0.8) * 0.8;
      const ld = this.world.sky.lightDir.clone().applyQuaternion(cam.quaternion.clone().invert());
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
