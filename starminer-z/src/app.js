// The game shell: the renderer and sky, settings, the front end, and the game in progress. One
// requestAnimationFrame loop drives everything.
//
// States: boot (loading assets) -> menu (the title and menus over a world turning behind them)
// -> loading (a world being built) -> playing <-> paused, and back to the menu.

import * as THREE from 'three';
import { Renderer, QUALITY } from './gfx/renderer.js';
import { Sky } from './gfx/sky.js';
import { makeTerrainMaterials } from './gfx/terrainMaterial.js';
import { blockTextureArray } from './gfx/blockTextures.js';
import { buildIcons } from './items/icons.js';
import { Input } from './core/input.js';
import { injectCSS } from './ui/style.js';
import { Menus, MENU_CSS } from './ui/menus.js';
import { CRAFT_CSS } from './ui/crafting.js';
import { Game } from './game/game.js';
import { Awards } from './game/awards.js';
import { saveGame, loadGame, deleteSave, saveMeta } from './game/save.js';
import { loadAvatarAssets } from './entities/avatar/assets.js';
import { PRESETS } from './entities/avatar/looks.js';

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const SIMFAST = Math.max(1, parseInt(params.get('simfast') || '1', 10));
const ATTRACT_SEED = 1337;

const DEFAULTS = {
  quality: isTouch ? 'medium' : 'high',
  renderDistance: null,
  fov: 72,
  sensitivity: 1,
  invertY: false,
  autoClimb: true,
  viewBob: true,
  showFps: false,
  music: 0.6,
  sound: 0.9,
  shadows: true,
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('starminer.settings') || '{}'); } catch { /* storage blocked */ }
  const out = { ...DEFAULTS, ...s };
  if (params.get('q')) out.quality = params.get('q');
  if (!QUALITY[out.quality]) out.quality = DEFAULTS.quality;
  if (!out.renderDistance) out.renderDistance = QUALITY[out.quality].distance;
  if (params.get('rd')) out.renderDistance = parseInt(params.get('rd'), 10);
  return out;
}

function loadProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('starminer.profile') || '{}'); } catch { /* storage blocked */ }
  return { preset: 0, skin: null, hair: null, shirt: null, ...p };
}

export class App {
  constructor(root) {
    this.root = root;
    this.isTouch = isTouch;
    root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none';
    this.canvas.tabIndex = 0;
    root.appendChild(this.canvas);
    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'ui';
    root.appendChild(this.uiRoot);
    this.settings = loadSettings();
    this.profile = loadProfile();
    this.awards = new Awards();
    this.state = 'boot';
    this.menuOpen = false;
    this.menuShowsHud = false;
    this.thirdPerson = false;
    this.fps = 60;
    this.game = null;
    this.saveTimer = 0;
    this.meta = saveMeta();
  }

  saveSettings() {
    try { localStorage.setItem('starminer.settings', JSON.stringify(this.settings)); } catch { /* storage blocked */ }
  }

  async start() {
    injectCSS(MENU_CSS + CRAFT_CSS);
    this.renderer = new Renderer(this.canvas, this.settings.quality);
    const gl = this.renderer.gl;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 1200);
    this.input = new Input(this.canvas);
    this.input.sens = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.menus = new Menus(this);
    this.menus.show('loading');
    this.menus.setLoading(0.05);
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    await new Promise((r) => setTimeout(r, 0));
    this.sky = new Sky(gl);
    this.menus.setLoading(0.25);
    this.terrain = makeTerrainMaterials(this.sky.uniforms, blockTextureArray(gl));
    buildIcons(gl);
    this.menus.setLoading(0.4);
    await loadAvatarAssets();
    this.menus.setLoading(0.6);
    this.audio = null;
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
    window.addEventListener('pagehide', () => this.autosave());
    this.last = performance.now();
    this.frames = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.loop = this.loop.bind(this);
    if (params.has('play') || params.has('test')) {
      // straight into a world (tests and screenshots)
      this.startGame({ seed: parseInt(params.get('seed') || '1337', 10) });
    } else {
      this.attract();
    }
    requestAnimationFrame(this.loop);
  }

  // ---- the front end ---------------------------------------------------------------------------

  // A world turning behind the menus: the save's own world if there is one.
  attract() {
    if (this.game) this.game.dispose();
    this.game = new Game(this, { seed: this.meta?.seed ?? ATTRACT_SEED, attract: true });
    this.state = 'boot';
    this.applySettings();
  }

  saveInfo() { return this.meta; }

  onMenuScreen(s) {
    this.game?.showPreview?.(s.avatar ? this.look() : null);
  }

  look() {
    const p = this.profile, base = PRESETS[p.preset] || PRESETS[0];
    return {
      ...base,
      skin: p.skin ?? base.skin,
      hair: { ...base.hair, color: p.hair ?? base.hair.color },
      top: { ...base.top, tint: p.shirt ?? base.top.tint },
    };
  }

  setProfile(patch) {
    Object.assign(this.profile, patch);
    try { localStorage.setItem('starminer.profile', JSON.stringify(this.profile)); } catch { /* storage blocked */ }
    this.game?.setLook?.(this.look());
    this.game?.showPreview?.(this.look());
  }

  setSetting(key, v) {
    this.settings[key] = v;
    if (key === 'quality') {
      this.renderer.setQuality(v);
      this.settings.renderDistance = QUALITY[v].distance;
    }
    this.saveSettings();
    this.applySettings();
  }

  applySettings() {
    const S = this.settings;
    this.input.sens = S.sensitivity;
    this.input.invertY = S.invertY;
    this.audio?.setVolumes?.(S.sound, S.music);
    const g = this.game;
    if (!g) return;
    g.world.setRenderDistance(S.renderDistance);
    g.player.autoClimb = S.autoClimb;
    this.terrain.uniforms.uFogEnd.value = S.renderDistance * 16 - 6;
    this.terrain.uniforms.uFogStart.value = S.renderDistance * 16 * 0.45;
  }

  // ---- games -------------------------------------------------------------------------------------

  newWorld() {
    this.input.requestLock();
    deleteSave();
    this.meta = null;
    this.startGame({ seed: (Math.random() * 2 ** 31) | 0 });
  }

  async continueGame() {
    this.input.requestLock();
    this.menus.reset('loading');
    const save = await loadGame();
    if (!save) { this.newWorld(); return; }
    this.startGame({ save });
  }

  startGame(opts) {
    if (this.game) this.game.dispose();
    this.menus.reset('loading');
    this.game = new Game(this, opts);
    this.game.setLook(this.look());
    this.state = 'loading';
    if (params.has('time')) this.sky.setTime(parseFloat(params.get('time')));
    const g = this.game;
    if (params.has('x')) g.player.pos.set(parseFloat(params.get('x')), parseFloat(params.get('y') || 80), parseFloat(params.get('z') || 0));
    if (params.has('yaw')) g.player.yaw = parseFloat(params.get('yaw'));
    if (params.has('pitch')) g.player.pitch = parseFloat(params.get('pitch'));
    if (params.has('slot')) g.inventory.select(parseInt(params.get('slot'), 10));
    if (params.has('fly')) g.player.noclip = true;
    this.applySettings();
    this.saveTimer = 0;
  }

  // the world is built: in we go
  enterGame() {
    this.state = 'playing';
    this.menus.hide();
    this.menuOpen = false;
    this.game.paused = false;
    if (params.has('craft')) this.game.openCrafting();
    if (params.has('pause')) { this.pause(); if (params.get('pause')) this.menus.open(params.get('pause')); }
    if (!this.isTouch && this.input.lastDevice !== 'pad' && !this.input.locked) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.paused = true;
    this.menuOpen = true;
    this.game.crafting?.close?.(true);
    this.menus.reset('pause');
    this.input.exitLock();
    this.autosave();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.hide();
    this.menuOpen = false;
    this.game.paused = false;
    this.input.requestLock();
  }

  async quitToMenu() {
    await this.autosave();
    this.menus.reset('loading');
    this.attract();
  }

  async autosave() {
    const g = this.game;
    if (!g || g.attract || !g.ready || this.state === 'loading') return;
    const data = g.serialize();
    this.meta = { day: data.day, maxDistance: data.maxDistance, savedAt: data.savedAt, seed: data.seed };
    await saveGame(data);
  }

  onLockChange() {
    this.input.locked = document.pointerLockElement === this.canvas;
    // losing the mouse (Esc) while playing pauses, unless the game let go of it on purpose
    if (!this.input.locked && this.state === 'playing' && !this.isTouch && this.input.lastDevice !== 'pad' && !this.game?.lockFree) this.pause();
  }

  showDeath(dist, day) {
    if (!this.deathEl) {
      this.deathEl = document.createElement('div');
      this.deathEl.className = 'death ui txt';
      this.uiRoot.appendChild(this.deathEl);
      this.deathEl.addEventListener('pointerdown', () => this.input.down('accept'));
    }
    const press = this.isTouch ? 'Tap To Respawn' : this.input.lastDevice === 'pad' ? 'Press <span class="btn a">A</span> To Respawn' : 'Press <span class="key">Space</span> To Respawn';
    this.deathEl.innerHTML = `<div>Distance Traveled: ${dist}</div><div>In ${day} Day${day === 1 ? '' : 's'}</div><div class="press">${press}</div>`;
    this.deathEl.classList.add('on');
    if (this.game) this.game.lockFree = true;
    this.input.exitLock();
  }

  hideDeath() {
    this.deathEl?.classList.remove('on');
    if (this.game) this.game.lockFree = false;
    this.input.requestLock();
  }

  onResize() {
    this.renderer.resize();
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // one size for every bit of UI, from a 1280 x 720 layout
    const s = Math.min(w / 1280, h / 720) * (this.isTouch ? 1.3 : 1);
    const px = `${Math.max(9, Math.min(34, 16 * Math.max(0.6, s)))}px`;
    this.uiRoot.style.setProperty('--ui-size', px);
    document.documentElement.style.setProperty('--ui-size', px);
  }

  autoExposure(dt) {
    const s = this.sky;
    const lum = (v) => v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722;
    // what the eye sees around it: the sky's light where there's sky, torchlight where there isn't
    const l = this.game?.light || new THREE.Vector2(1, 0);
    const sky = l.x * l.x;
    const outdoor = lum(s.ambientUp) * 0.6 + lum(s.sunColor) * Math.max(0.12, s.sunDir.y) * 0.08 + lum(s.planetLight) * 0.5;
    const L = outdoor * Math.max(0.05, sky) + l.y * l.y * 0.55 + 0.01;
    // under the storm the nights stay dark: the eye only adapts so far
    const G = s.gloom || 0;
    const target = THREE.MathUtils.clamp((0.78 - 0.14 * G) / (L + 0.02), 0.06, 5.5 - 1.4 * G);
    // eyes adjust over a second or two
    this.exposure = this.exposure ?? target;
    const k = 1 - Math.exp(-dt * (target > this.exposure ? 0.9 : 1.8));
    this.exposure += (target - this.exposure) * k;
    return this.exposure;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.066, Math.max(0.0001, rawDt));
    this.frames++;
    this.fpsAcc += rawDt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.input.poll(dt);
    // the front end takes the input first
    if (this.menus.visible) this.menus.update(dt, this.input);
    else if (this.state === 'playing' && !this.game?.crafting?.isOpen && this.input.consume('pause')) this.pause();
    const g = this.game;
    if (g) {
      // tests can run the game faster than it renders (simfast=N updates a frame)
      for (let k = 0; k < SIMFAST; k++) g.update(SIMFAST > 1 ? 1 / 30 : dt, this.input);
      const ready = g.ready ? 1 : g.world.readiness(g.player.pos.x, g.player.pos.z, 2);
      if (this.state === 'boot' && g.attract) {
        this.menus.setLoading(0.6 + ready * 0.4);
        if (g.ready) { this.state = 'menu'; this.menus.reset(params.get('menu') || (this.titleShown ? 'main' : 'title')); this.titleShown = true; }
      } else if (this.state === 'loading') {
        this.menus.setLoading(ready);
        if (g.ready) this.enterGame();
      }
      if (this.state === 'playing' || this.state === 'paused') {
        this.saveTimer += dt;
        if (this.saveTimer > 60) { this.saveTimer = 0; this.autosave(); }
      }
      this.sky.update(this.frames < 3 ? 0 : dt);
      this.renderer.gloom = this.sky.gloom;
      this.renderer.exposure = parseFloat(params.get('ex') || this.autoExposure(dt));
      g.sprites.setScale(this.renderer.size.H, this.camera.fov);
      this.renderer.render(g.scene, this.camera, g.viewModel.scene, g.viewModel.camera);
      window.__readiness = ready;
    }
    this.input.endFrame();
  }
}
