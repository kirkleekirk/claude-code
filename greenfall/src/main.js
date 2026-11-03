// Greenfall — app bootstrap: loading, lobby, match lifecycle and the frame loop.
import * as THREE from 'three';
import './ui/styles.css';
import { Graphics, QUALITY } from './game/graphics.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Profile } from './core/profile.js';
import { WorldData } from './world/worldgen.js';
import { Terrain } from './world/terrain.js';
import { makeTerrainMaterial, U } from './world/materials.js';
import { Sky, DayNight } from './world/sky.js';
import { Water } from './world/water.js';
import { WorldView } from './world/world.js';
import { Grass } from './world/vegetation.js';
import { Physics } from './game/physics.js';
import { Player } from './game/player.js';
import { BotManager } from './game/bots.js';
import { Zombies } from './game/zombies.js';
import { Hordes } from './game/hordes.js';
import { Weapons } from './game/weapons.js';
import { Interact } from './game/interact.js';
import { Builds } from './game/building.js';
import { FX } from './game/fx.js';
import { Animals } from './game/animals.js';
import { Match, PRESETS } from './game/match.js';
import { Character, buildWeaponModel } from './game/character.js';
import { HUD, buildMapCanvas } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { Lobby } from './ui/lobby.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { cosmeticsFor } from './data/cosmetics.js';
import { POIS } from './world/layout.js';
import { clamp, lerp } from './core/math.js';

const WORLD_SEED = 20261103;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.uiRoot = document.getElementById('ui');
    this.profile = new Profile();
    const S = this.profile.data.settings;
    this.touchMode = S.touch === 'on' || (S.touch === 'auto' && isTouchDevice());
    const autoQ = this.touchMode ? 'low' : 'medium';
    const qParam = new URLSearchParams(location.search).get('q');
    this.gfx = new Graphics(this.canvas, qParam || S.quality || autoQ);
    this.renderer = this.gfx.renderer;
    this.scene = this.gfx.scene;
    this.camera = this.gfx.camera;
    this.input = new Input(this.canvas);
    this.input.sensitivity = S.sens; this.input.invertY = S.invertY; this.input.touchMode = this.touchMode;
    this.audio = new AudioEngine();
    this.applyAudio();
    this.settings = { fov: S.fov, showFps: S.showFps };
    this.ui = new UI(this, this.uiRoot);
    this.time = 0; this.frame = 0; this.fps = 60;
    this.inMatch = false; this.paused = false;
    this.survivors = [];
    this.CharacterClass = Character;
    this.models = { throwable: (m) => buildWeaponModel(m, 0) };
    // unlock audio on first gesture
    const unlock = () => { this.audio.init(); this.applyAudio(); if (!this.inMatch) this.audio.startMusic('lobby'); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.input.onUnlock = () => { if (this.inMatch && !this.ui.isOpen() && this.player?.alive && !this.player.extracted && !this.match?.result) this.ui.openPause(); };
    this.canvas.addEventListener('click', () => { if (this.inMatch && !this.ui.isOpen() && !this.touchMode) this.input.requestLock(); });
    window.__game = this;
    this.boot();
  }
  applyAudio() {
    const S = this.profile.data.settings;
    this.audio.vol = { master: S.master, sfx: S.sfx, music: S.music, ambient: S.ambient };
    this.audio.applyVolumes();
  }
  applyTouch() {
    const S = this.profile.data.settings;
    this.touchMode = S.touch === 'on' || (S.touch === 'auto' && isTouchDevice());
    this.input.touchMode = this.touchMode;
    this.touch?.show(this.inMatch && this.touchMode);
  }
  setQuality(q) {
    this.gfx.setQuality(q);
    // rebuild quality-dependent bits next match; grass now
    if (this.grass) { this.scene.remove(this.grass.mesh); this.grass = null; }
    if (this.gfx.q.grass > 0 && this.inMatch) { this.grass = new Grass(this.world, this.terrain, this.gfx.q.grass); this.scene.add(this.grass.mesh); }
  }

  // ---------------- loading ----------------
  async boot() {
    const step = (p, s) => new Promise((res) => { this.ui.setLoading(p, s); setTimeout(res, 16); });
    await step(0.02, 'Waking up Greenfall County...');
    try { await document.fonts.load('40px "Lilita One"'); } catch (e) { /* ignore */ }
    this.world = new WorldData(WORLD_SEED);
    const gen = this.world;
    const steps = ['computeCoast', 'computeBaseHeight', 'buildRoads', 'carveLakeAndQuarry', 'flattenTowns', 'applyRoads', 'placeContent', 'flattenPads', 'classifySurface', 'placeTrees', 'placeRoadside'];
    const labels = ['Charting the coastline', 'Raising the hills', 'Laying Route 9', 'Filling Lake Wren', 'Grading town lots', 'Paving the roads', 'Raising farms, towns & Bellerose', 'Pouring foundations', 'Painting the land', 'Planting forests & orchards', 'Stringing power lines'];
    for (let i = 0; i < steps.length; i++) { await step(0.05 + (i / steps.length) * 0.45, labels[i] + '...'); gen[steps[i]](); }
    await step(0.52, 'Shaping terrain...');
    this.terrainMat = makeTerrainMaterial({ lambert: this.gfx.q.lambert });
    this.terrain = new Terrain(this.world, this.terrainMat);
    this.scene.add(this.terrain.group);
    await step(0.62, 'Building the skyline...');
    this.physics = new Physics(this.world);
    this.view = new WorldView(this.world, this.physics, this.gfx.q);
    this.view.qGetter = () => this.gfx.q;
    this.view.buildStatic();
    this.scene.add(this.view.group);
    await step(0.78, 'Filling the ocean...');
    this.water = new Water(this.world);
    this.scene.add(this.water.group);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.dayNight = new DayNight();
    this.dayNight.onThunder = (delay) => setTimeout(() => this.audio.play('thunder', null, { vol: 0.9, bus: 'ambient' }), delay * 1000);
    // warm night lights: Bellerose gas lamps, farmhouse porches, barn doors
    this.lampSpots = [];
    for (const p of this.world.props) if (p.type === 'lamp') this.lampSpots.push({ x: p.x, y: p.y + 3.7, z: p.z, c: 0xffc070 });
    for (const b of this.world.buildings) {
      if (b.kind !== 'farmhouse' && b.kind !== 'barn' && b.kind !== 'gas' && b.kind !== 'diner') continue;
      const fx = Math.sin(b.rot), fz = Math.cos(b.rot);
      const off = b.d / 2 + (b.kind === 'farmhouse' ? 1.6 : 0.6);
      this.lampSpots.push({ x: b.x + fx * off, y: b.y + (b.kind === 'barn' ? 5.2 : 2.7), z: b.z + fz * off, c: b.kind === 'barn' ? 0xffd890 : 0xffb060 });
    }
    this.fillLight = new THREE.PointLight(0xb8e8c0, 0, 14, 1.4);
    this.scene.add(this.fillLight);
    this.lampLights = [];
    const nLamps = this.gfx.q.lambert ? 3 : 6;
    for (let i = 0; i < nLamps; i++) { const l = new THREE.PointLight(0xffc070, 0, 26, 1.6); this.scene.add(l); this.lampLights.push(l); }
    await step(0.86, 'Drawing the map...');
    this.mapCanvas = buildMapCanvas(this.world);
    this.hud = new HUD(this, this.uiRoot);
    this.hud.setMap(this.mapCanvas);
    this.hud.show(false);
    this.touch = new TouchControls(this, this.uiRoot);
    await step(0.93, 'Setting up the lobby...');
    this.lobby = new Lobby(this.gfx);
    this.lobby.setCosmetics(this.profile.data.equipped);
    // drag to rotate lobby character
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { if (!this.inMatch) { drag = e.clientX; this.lobby.dragging = true; } });
    window.addEventListener('pointermove', (e) => { if (drag !== null && !this.inMatch) { this.lobby.yaw += (e.clientX - drag) * 0.01; drag = e.clientX; } });
    window.addEventListener('pointerup', () => { drag = null; if (this.lobby) this.lobby.dragging = false; });
    await step(1, 'Ready');
    this.ui.hideLoading();
    this.ui.showLobby();
    this.ready = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.loop());
    if (new URLSearchParams(location.search).has('autoplay')) this.startMatch(new URLSearchParams(location.search).get('autoplay') || 'quick');
  }
  onCosmeticsChanged() { this.lobby.setCosmetics(this.profile.data.equipped); }
  poiAt(x, z) { for (const p of POIS) if (Math.hypot(p.x - x, p.z - z) < p.r) return p; return null; }

  // ---------------- match lifecycle ----------------
  resetWorldState() {
    const w = this.world;
    if (this._removedTrees?.size) {
      for (const ch of this.view.chunks) if (ch._treesDirty) { this.view.group.remove(ch.farT); for (const m of ch.farT.children) m.dispose(); const t = this.view.veg.buildCell(ch.x0, ch.z0, ch.x1, ch.z1, 1); for (const m of t.group.children) { m.castShadow = false; m.receiveShadow = false; } ch.farT = t.group; ch.farTreeLookup = t.lookup; this.view.group.add(ch.farT); ch._treesDirty = false; }
    }
    w.trees.alive.fill(1);
    this._removedTrees = new Set();
    for (const ch of this.view.chunks) if (ch.state === 'near') this.view.dropNear(ch);
    for (const b of w.buildings) { b.rt = null; b.lootSpawned = false; }
    for (const p of w.props) p.alarmUsed = false;
    this.physics = new Physics(w);
    this.view.physics = this.physics;
  }
  startMatch(presetKey = 'standard') {
    this.audio.init();
    this.audio.stopMusic();
    this.ui.hideLobby();
    this.ui.setLoading(0.1, 'Preparing the drop...');
    setTimeout(() => this._startMatch(presetKey), 30);
  }
  _startMatch(presetKey) {
    this.seed = (Math.random() * 1e9) | 0;
    this.resetWorldState();
    // removed-tree tracking for reset
    if (!this.view._origRemoveTree) this.view._origRemoveTree = this.view.removeTree.bind(this.view);
    const origRemove = this.view._origRemoveTree;
    this.view.removeTree = (i) => { this._removedTrees.add(i); const ch = this.view.chunkOf(this.world.trees.x[i], this.world.trees.z[i]); ch._treesDirty = true; origRemove(i); };
    this.survivors = [];
    this.fx = new FX(this); this.scene.add(this.fx.group);
    this.zombies = new Zombies(this, this.gfx.q.maxZombies); this.scene.add(this.zombies.group);
    this.hordes = new Hordes(this); this.scene.add(this.hordes.group);
    this.weapons = new Weapons(this);
    this.inter = new Interact(this); this.scene.add(this.inter.group);
    this.builds = new Builds(this); this.scene.add(this.builds.group);
    this.animals = new Animals(this); this.scene.add(this.animals.group);
    this.view.onChunkNear = (ch) => this.inter.onChunkNear(ch);
    this.view.onChunkFar = (ch) => this.inter.onChunkFar(ch);
    this.match = new Match(this, presetKey);
    const cos = cosmeticsFor(this.profile.data.equipped);
    this.player = new Player(this, { name: this.profile.data.name, outfit: cos.outfit, cosmetics: cos.cosmetics, emote: cos.emote, team: 1 });
    this.scene.add(this.player.character.root);
    this.survivors.push(this.player);
    this.player.pos.copy(this.match.plane.pos);
    this.player.camYaw = Math.atan2(-this.match.plane.vel.x, -this.match.plane.vel.z) + 0.6;
    this.player.camPitch = -0.35;
    this.bots = new BotManager(this);
    this.bots.create(this.match.preset.players - 1);
    this.bots.planDrop(this.match.plane);
    if (this.gfx.q.grass > 0) { this.grass = new Grass(this.world, this.terrain, this.gfx.q.grass); this.scene.add(this.grass.mesh); }
    this.inMatch = true;
    this.paused = false;
    this.time = 0;
    this.ui.hideLoading();
    this.hud.show(true);
    this.touch.show(this.touchMode);
    this.hud.announce('PRESS SPACE TO JUMP', 'yellow', 6);
    this.hud.setObjective('Ride the plane. Jump over the island.');
    this.audio.loop('wind', true, 0.4);
    if (!this.touchMode) this.input.requestLock();
    if (!this.profile.data.seenTutorial) { this.hud.hint('WASD move · Mouse aim · E interact · Tab inventory · M map · Q build · H heal · X eat · L flashlight', 12); this.profile.data.seenTutorial = true; this.profile.save(); }
  }
  teardownMatch() {
    for (const g of [this.fx?.group, this.zombies?.group, this.hordes?.group, this.inter?.group, this.builds?.group, this.animals?.group, this.match?.group, this.weapons?.projGroup]) if (g) this.scene.remove(g);
    for (const s of this.survivors) if (s.character) this.scene.remove(s.character.root);
    if (this.player?.spot) { this.scene.remove(this.player.spot); this.scene.remove(this.player.spot.target); }
    if (this.grass) { this.scene.remove(this.grass.mesh); this.grass = null; }
    this.audio.stopAll();
    this.inMatch = false;
    this.survivors = [];
    U.uHordeCount.value = 0;
  }
  returnToLobby() {
    this.teardownMatch();
    this.hud.show(false);
    this.touch.show(false);
    this.input.exitLock();
    this.ui.showLobby();
    this.audio.startMusic('lobby');
  }
  onMatchEnd(r) {
    const P = this.profile, d = P.data;
    d.shards += r.shards;
    const ups = P.addXp(r.xp);
    d.stats.matches++;
    d.stats.kills += r.kills;
    d.stats.zombieKills += r.zombieKills;
    d.stats.timePlayed += r.time;
    d.stats.bestTime = Math.max(d.stats.bestTime, r.time);
    if (r.outcome === 'extracted') { d.stats.extractions++; d.stats.lootExtracted += r.loot; if (r.how === 'boat') d.stats.boatEscapes++; else d.stats.heliEscapes++; }
    else d.stats.deaths++;
    d.history.unshift({ outcome: r.outcome, placement: r.placement, total: r.total, kills: r.kills, zombieKills: r.zombieKills, time: r.time, shards: r.shards, at: Date.now() });
    d.history = d.history.slice(0, 20);
    P.save();
    this.input.exitLock();
    this.audio.play(r.outcome === 'extracted' ? 'extract' : 'death', null, { vol: 0.8, bus: 'ui' });
    setTimeout(() => this.ui.showResults(r, ups), 600);
  }

  // ---------------- world events ----------------
  emitNoise(x, z, radius, src, kind, big = false) {
    if (!this.inMatch) return;
    this.zombies.hear(x, z, radius, src, kind);
    this.hordes.noise(x, z, radius, src, kind);
    if (kind === 'gunshot' || kind === 'explosion') {
      for (const b of this.bots.bots) {
        if (!b.physical || !b.alive || b === src || b.state === 'fight') continue;
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d < radius * 0.6 && src && src.alive && b.rng.chance(b.aggression)) { b.goal = { x, z }; b.path = null; b.state = 'travel'; }
      }
    }
    void big;
  }
  onSurvivorDeath(s, src, opts) {
    this.hud.kill(s, src, opts);
    if (src && src !== s && src.stats) src.stats.kills++;
    if (s.physical && opts?.type !== 'left') {
      // loot explosion
      const drop = (it) => this.inter.dropItem(it, s.pos.x, s.pos.y + 0.5, s.pos.z);
      for (const L of [s.inv.slots, s.inv.pack]) for (let i = 0; i < L.length; i++) if (L[i]) { drop({ ...L[i] }); L[i] = null; }
      for (const k in s.inv.ammo) if (s.inv.ammo[k] > 0) drop({ id: k, n: s.inv.ammo[k], r: 0 });
      for (const k in s.inv.mats) if (s.inv.mats[k] > 0) drop({ id: k, n: Math.min(s.inv.mats[k], 200), r: 0 });
    }
    if (s === this.player) {
      this.player.mode = 'dead';
      this.player.killedBy = src && src !== s ? src.name : opts?.type === 'zombie' ? 'the dead' : null;
      this.hud.announce(src && src !== s ? `ELIMINATED BY ${src.name}` : 'YOU DIED', 'red', 5);
      this.audio.play('death', null, { vol: 0.7, bus: 'ui' });
      this.player.buildMode = false; this.builds.showGhost(null);
    } else if (s.physical && s.character) {
      setTimeout(() => { if (s.character && !s.alive) this.scene.remove(s.character.root); }, 12000);
    }
  }
  onHordeSpawn(h) { void h; }

  // ---------------- frame ----------------
  loop() {
    const now = performance.now();
    this.frameMs = now - (this._lastFrameStart || now);
    this._lastFrameStart = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.05);
    this.frame++;
    if (!this.inMatch) {
      this.lobby.update(dt);
      U.uTime.value += dt;
      this.gfx.renderer.toneMappingExposure = 1.0;
      if (this.gfx.composer) { this.gfx.renderPass.scene = this.lobby.scene; this.gfx.renderPass.camera = this.lobby.camera; if (this.gfx.grade) { this.gfx.grade.uniforms.uHorde.value = 0; this.gfx.grade.uniforms.uDamage.value = 0; this.gfx.grade.uniforms.uDesat.value = 0; this.gfx.grade.uniforms.uExposure.value = 1.05; } this.gfx.composer.render(); }
      else this.renderer.render(this.lobby.scene, this.lobby.camera);
      this.input.endFrame();
      return;
    }
    if (this.gfx.composer) { this.gfx.renderPass.scene = this.scene; this.gfx.renderPass.camera = this.camera; }
    this.handleGlobalKeys();
    if (!this.paused) this.tick(dt);
    this.updateEnv(dt);
    this.hud.update(dt);
    const tr = performance.now();
    this.gfx.render();
    this.renderMs = performance.now() - tr;
    this.cpuMs = tr - now;
    this.input.endFrame();
  }
  handleGlobalKeys() {
    const I = this.input;
    if (I.pressed('pause')) { if (this.ui.overlayKind === 'results') return; this.ui.togglePause(); }
    if (this.ui.overlayKind === 'results' || this.paused) return;
    if (I.pressed('inventory') && this.player.mode !== 'plane') this.ui.toggleInventory();
    if (I.pressed('map')) this.ui.toggleMap();
  }
  tick(dt) {
    this.time += dt;
    const P = this.player;
    U.uTime.value += dt;
    // freeze player input while an overlay is open
    this.input.enabled = !this.ui.isOpen();
    P.update(dt);
    this.input.enabled = true;
    // extraction boarding (player)
    const board = this.match.checkBoarding(P);
    if (board && this.input.down('interact') && !this.ui.isOpen()) {
      if (!P.action) P.startAction('hold', 2, () => this.match.board(P, board), { label: 'board' });
    }
    this.bots.update(dt);
    for (const b of this.bots.bots) { if (b.physical && b.alive && !b.extracted) { const bb = this.match.checkBoarding(b); if (bb) this.match.board(b, bb); } }
    this.zombies.update(dt);
    this.hordes.update(dt);
    this.weapons.update(dt);
    this.inter.update(dt);
    this.builds.update(dt);
    this.animals.update(dt);
    this.match.update(dt);
    // keep the camera's surroundings streamed in
    const focus = [P.pos];
    for (const b of this.bots.bots) if (b.physical && b.alive) focus.push(b.pos);
    const fast = P.mode === 'skydive' || P.mode === 'glide';
    this.view.update(this.camera.position, focus, fast ? 9 : 5);
    this.terrain.update(this.camera.position, fast ? 6 : 3);
    if (this.grass) this.grass.update(this.camera.position);
    this.fx.update(dt, this.camera.position, this.env);
    this.zombies.render(dt, this.camera.position);
    // ambience
    const inH = this.hordes.inside(P.pos.x, P.pos.z);
    this.audio.loop('horde', !!inH && P.alive, 0.5);
    this.audio.loop('crickets', this.env && this.env.night > 0.5 && this.env.storm < 0.9, 0.35);
    this.audio.loop('rain', this.fx.rainAmount > 0.1, this.fx.rainAmount * 0.5);
    // low health heartbeat
    if (P.alive && P.health < 30 && this.frame % 70 === 0) this.audio.play('heartbeat', null, { vol: 0.6, bus: 'ui' });
  }
  updateEnv(dt) {
    const dn = this.dayNight;
    const e = (this.env = dn.compute());
    const P = this.player;
    const flash = dn.updateLightning(this.paused ? 0 : dt, e.storm > 0.6);
    // horde influence
    const z = this.hordes.zoneAt(this.camera.position.x, this.camera.position.z);
    const hordeK = z.horde ? clamp(1 - (z.edge + 20) / 80, 0, 1) : 0;
    this.hordeK = lerp(this.hordeK || 0, hordeK, Math.min(1, dt * 2));
    const hk = this.hordeK;
    const fogCol = e.fog.clone().lerp(new THREE.Color(0x2c4a1e), hk * 0.75);
    const altitude = clamp((this.camera.position.y - 120) / 450, 0, 1);
    const fogD = e.fogD * (1 + hk * 1.6) * lerp(1, 0.18, altitude);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = fogD;
    const su = this.sky.uniforms;
    su.uZenith.value.copy(e.zenith).lerp(new THREE.Color(0x1a3a1a), hk * 0.5);
    su.uHorizon.value.copy(e.horizon).lerp(new THREE.Color(0x6aa04a), hk * 0.5);
    su.uFogColor.value.copy(fogCol);
    su.uSunDir.value.copy(e.sunDir); su.uMoonDir.value.copy(e.moonDir); su.uSunColor.value.copy(e.sun);
    su.uCloudCol.value.copy(e.cloudCol); su.uCloud.value = e.cloud; su.uStars.value = e.stars; su.uSunVis.value = e.sunVis; su.uStorm.value = Math.max(e.storm, hk);
    su.uFlash.value = flash; su.uTime.value += dt;
    this.sky.update(this.camera);
    const g = this.gfx;
    g.hemi.color.copy(e.hemiSky); g.hemi.groundColor.copy(e.hemiGround); g.hemi.intensity = e.hemiI;
    g.sun.color.copy(e.sun); g.sun.intensity = e.sunI;
    g.flashLight.intensity = flash * 1.6;
    const focus = P && P.mode !== 'plane' ? P.pos : this.camera.position;
    g.updateShadowFocus(focus, e.lightDir);
    this.water.update(this.paused ? 0 : dt, this.camera, e);
    this.water.uniforms.uFlash.value = flash;
    U.uLampGlow.value = e.lamp;
    this.view.setLampGlow(e.lamp);
    if (this.fillLight && P) {
      const cp = this.camera.position;
      this.fillLight.position.set(cp.x * 0.6 + P.pos.x * 0.4, Math.max(cp.y, P.pos.y + 1.8) + 0.6, cp.z * 0.6 + P.pos.z * 0.4);
      this.fillLight.intensity = e.night * 2.2 + 0.15;
    }
    if (e.lamp > 0.05 && this.lampSpots) {
      if ((this.frame & 15) === 0 || !this._lampSorted) {
        const cp = this.camera.position;
        this._lampSorted = this.lampSpots.filter((l) => Math.abs(l.x - cp.x) < 140 && Math.abs(l.z - cp.z) < 140).sort((a, b) => Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z));
      }
      for (let i = 0; i < this.lampLights.length; i++) {
        const L = this.lampLights[i], s = this._lampSorted[i];
        if (s) { L.position.set(s.x, s.y, s.z); L.color.setHex(s.c); L.intensity = e.lamp * 5.5; } else L.intensity = 0;
      }
    } else if (this.lampLights) for (const L of this.lampLights) L.intensity = 0;
    if (g.grade) {
      const gu = g.grade.uniforms;
      gu.uTime.value += dt;
      gu.uHorde.value = hk;
      gu.uExposure.value = 1.12 + e.night * 0.18;
      gu.uTint.value.setRGB(0.85, 1.08, 0.86); gu.uTintAmt.value = e.night * 0.35;
      gu.uDesat.value = P && P.alive ? clamp((35 - P.health) / 35, 0, 1) * 0.7 : 0.6;
      this.hud.flashDamage = Math.max(0, (this.hud.flashDamage || 0) - dt * 1.5);
      gu.uDamage.value = this.hud.flashDamage + (P && P.alive && P.health < 25 ? 0.25 + Math.sin(this.time * 4) * 0.1 : 0);
      gu.uVignette.value = 0.28 + e.night * 0.15;
    } else {
      g.renderer.toneMappingExposure = 1.12 + e.night * 0.2;
    }
  }
}

new Game();
