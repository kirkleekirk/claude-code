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
import { setMipRenderer } from './gfx/arrayMips.js';
import { buildIcons, buildCmzIcons } from './items/icons.js';
import { loadUiSheet } from './ui/sheet.js';
import { Input } from './core/input.js';
import { injectCSS } from './ui/style.js';
import { Menus, MENU_CSS } from './ui/menus.js';
import { CRAFT_CSS } from './ui/crafting.js';
import { TouchControls, TOUCH_CSS } from './ui/touch.js';
import { Game } from './game/game.js';
import { Awards } from './game/awards.js';
import { listWorlds, loadWorld, saveWorld, deleteWorld, eraseWorlds, newWorldId, worldName, worldInfo, updateWorldInfo, migrateOldSave } from './game/save.js';
import { RULES } from './game/modes.js';
import { loadAvatarAssets } from './entities/avatar/assets.js';
import { loadCmzBodies } from './entities/cmz/bodies.js';
import { loadCmzClips } from './entities/cmz/avatarAnim.js';
import { loadCmzItems } from './entities/cmz/held.js';
import { PRESETS } from './entities/avatar/looks.js';
import { Audio } from './core/audio.js';
import { Link, cleanCode, onlineSupported, CODE_LENGTH } from './net/link.js';
import { PROTOCOL, cleanName, cleanProfile } from './net/online.js';

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
// Edge on an Xbox: a controller, no mouse, and a console's share of the GPU
const isXbox = /xbox/i.test(navigator.userAgent);
const SIMFAST = Math.max(1, parseInt(params.get('simfast') || '1', 10));
// (tests: every new world from this seed)
const SEED = params.has('seed') ? parseInt(params.get('seed'), 10) : null;
const newSeed = () => (Number.isFinite(SEED) ? SEED : (Math.random() * 2 ** 31) | 0);
const ATTRACT_SEED = 1337;

// (an Xbox's Edge has a small share of the console: Low there, with the resolution drawn down
// further while it's slow)
const SETTINGS_VERSION = 2;
const DEFAULTS = {
  v: SETTINGS_VERSION,
  quality: isXbox ? 'low' : isTouch ? 'medium' : 'high',
  brightness: 1,
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
  // settings from before the Xbox started on Low: its old start (Medium) goes
  if ((s.v || 1) < 2 && isXbox && s.quality === 'medium') { out.quality = DEFAULTS.quality; out.renderDistance = null; }
  out.v = SETTINGS_VERSION;
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
    this.isXbox = isXbox;
    root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none';
    this.canvas.tabIndex = 0;
    root.appendChild(this.canvas);
    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'ui';
    // keep the HUD clear of a phone's notch and home bar
    this.uiRoot.style.inset = 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
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
    this.worlds = listWorlds();
    // the kept world being played, to carry on in after the page is updated mid-game
    this.session = null;
    try { this.session = JSON.parse(localStorage.getItem('starminer.current') || 'null'); } catch { /* storage blocked */ }
  }

  setSession(s) {
    this.session = s;
    try { if (s) localStorage.setItem('starminer.current', JSON.stringify(s)); else localStorage.removeItem('starminer.current'); } catch { /* storage blocked */ }
  }

  saveSettings() {
    try { localStorage.setItem('starminer.settings', JSON.stringify(this.settings)); } catch { /* storage blocked */ }
  }

  // boot: { resume } carries on in the saved game after the page was updated mid-play
  async start(boot = {}) {
    injectCSS(MENU_CSS + CRAFT_CSS + TOUCH_CSS);
    this.renderer = new Renderer(this.canvas, this.settings.quality);
    // (?fixedres: always the setting's own resolution, for screenshots)
    this.renderer.fixed = params.has('fixedres');
    setMipRenderer(this.renderer.gl);
    // the browser can take the graphics away (a GPU short of memory, say): the world is kept, and
    // the game waits, saying so, till they're back or the page is reloaded
    this.canvas.addEventListener('webglcontextlost', () => this.graphicsLost(true));
    this.canvas.addEventListener('webglcontextrestored', () => this.graphicsLost(false));
    const gl = this.renderer.gl;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 1200);
    this.input = new Input(this.canvas);
    if (isXbox) this.input.lastDevice = 'pad';
    this.input.sens = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.menus = new Menus(this);
    this.touch = isTouch || params.has('touch') ? new TouchControls(this) : null;
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
    // the original's own bodies for the dead, and its clips and items for the player, if the
    // ripped files are there
    const cmzOn = !params.has('nocmz');
    const [, cmz, clips, items] = await Promise.all([loadAvatarAssets(), cmzOn && loadCmzBodies(), cmzOn && loadCmzClips(), cmzOn && loadCmzItems(), cmzOn && loadUiSheet()]);
    this.cmzBodies = cmz || null;
    this.cmzPlayer = clips && items ? { clips, items } : null;
    // the icons from the original's own models
    if (items) buildCmzIcons(gl, items);
    this.menus.setLoading(0.6);
    this.audio = new Audio(this);
    // sound can only start once the player has done something
    const unlock = () => this.audio.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
    this.sky.onThunder = () => this.audio.thunder();
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(); });
    window.addEventListener('pagehide', () => { this.autosave(); this.game?.online?.close(); });
    this.last = performance.now();
    this.frames = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.loop = this.loop.bind(this);
    // (the one world kept before there were several: into the list)
    await migrateOldSave();
    this.worlds = listWorlds();
    const S = this.session;
    if (params.has('play') || params.has('test')) {
      // straight into a world (tests and screenshots: mode=, diff=, creative)
      this.startGame({ seed: parseInt(params.get('seed') || '1337', 10), mode: params.get('mode') || 'endurance', difficulty: params.get('diff') || 'easy', creative: params.has('creative') });
    } else if (boot.resume && S?.id && worldInfo(S.id)) {
      const save = await loadWorld(S.id);
      if (save) this.startGame({ save, worldId: S.id, mode: S.mode, difficulty: S.difficulty }); else this.attract();
    } else {
      this.attract();
    }
    requestAnimationFrame(this.loop);
  }

  // ---- the front end ---------------------------------------------------------------------------

  // A world turning behind the menus: the one you played last, if there is one.
  attract() {
    if (this.game) this.game.dispose();
    this.setSession(null);
    this.game = new Game(this, { seed: this.worlds[0]?.seed ?? ATTRACT_SEED, attract: true });
    this.state = 'boot';
    this.applySettings();
  }

  onMenuScreen(s) {
    this.game?.showPreview?.(s.avatar ? this.look() : null);
  }

  // the name the others see online: the one you gave, or your avatar's
  netName() {
    return cleanName(this.profile.name) || (PRESETS[this.profile.preset] || PRESETS[0]).name;
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

  // the name the others see online (empty: the avatar's)
  setName(v) {
    this.profile.name = String(v ?? '').slice(0, 16);
    try { localStorage.setItem('starminer.profile', JSON.stringify(this.profile)); } catch { /* storage blocked */ }
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

  // Endurance: a new world every time, not kept (host: open it to friends once it's loaded)
  startEndurance({ host = false } = {}) {
    this.input.requestLock();
    this.setSession(null);
    this.startGame({ seed: newSeed(), mode: 'endurance', difficulty: 'easy', host });
  }

  // Survival, Dragon Endurance or Creative, in one of your worlds (id) or a new one; a world
  // first played in Creative stays a Creative world
  async startWorld({ id = null, mode, difficulty, creative = false, host = false }) {
    this.input.requestLock();
    this.menus.reset('loading');
    if (id) {
      const save = await loadWorld(id);
      if (!save) { this.menus.notice("Couldn't Load That World", 'It may have been made by a newer copy of the game, or storage is blocked here.'); return; }
      if (creative && !save.creative) { save.creative = true; updateWorldInfo(id, { creative: true }); }
      this.setSession({ id, mode, difficulty });
      this.startGame({ save, worldId: id, mode, difficulty, creative, host });
      return;
    }
    id = newWorldId();
    this.pendingWorld = { id, name: worldName(cleanName(this.profile.name) || null), creative };
    this.setSession({ id, mode, difficulty });
    this.startGame({ seed: newSeed(), worldId: id, mode, difficulty, creative, host });
  }

  async deleteWorld(id) {
    await deleteWorld(id);
    this.worlds = listWorlds();
  }

  // Erase Storage: all the worlds, and the awards
  async eraseStorage() {
    await eraseWorlds();
    this.awards.erase();
    this.worlds = [];
  }

  startGame(opts) {
    if (this.game) this.game.dispose();
    this.menus.reset('loading', opts.online ? 'Joining Game...' : undefined);
    this.pendingHost = !!opts.host;
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
    if (params.has('third')) this.thirdPerson = true;
    this.applySettings();
    this.saveTimer = 0;
  }

  // the world is built: in we go
  enterGame() {
    this.state = 'playing';
    this.menus.hide();
    this.menuOpen = false;
    this.game.paused = false;
    if (this.pendingHost) { this.pendingHost = false; this.hostOnline(); }
    if (params.has('craft')) this.game.openCrafting();
    if (params.has('pause')) { this.pause(); if (params.get('pause')) this.menus.open(params.get('pause')); }
    if (!this.isTouch && this.input.lastDevice !== 'pad' && !this.input.locked) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    // (online the game goes on behind the menu)
    this.game.paused = !this.game.online;
    this.menuOpen = true;
    this.game.crafting?.close?.(true);
    this.menus.reset('pause');
    this.input.exitLock();
    this.autosave();
  }

  // The original's on-screen keyboard (Guide.BeginShowKeyboardInput) over the game: a name to
  // type, given to done(name) unless it's backed out of.
  askName(title, sub, value, max, done) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.game.paused = !this.game.online;
    this.menuOpen = true;
    this.game.crafting?.close?.(true);
    this.nameAsk = { title, sub, value, max, done };
    this.menus.reset('name');
    this.input.exitLock();
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
    // in a friend's world: it's theirs to save, and they keep what you have
    if (g.online && !g.online.host) { g.online.keep(); return; }
    // (an Endurance world isn't kept)
    if (!RULES.kept(g) || !g.worldId) return;
    const data = g.serialize();
    const was = worldInfo(g.worldId) || (this.pendingWorld?.id === g.worldId ? this.pendingWorld : null);
    await saveWorld(g.worldId, data, { name: was?.name || worldName(null), creative: g.creative });
    this.worlds = listWorlds();
  }

  // ---- online ------------------------------------------------------------------------------------

  // Open the game in progress to friends: they join with the code it gets.
  async hostOnline() {
    const g = this.game;
    if (!g || g.attract || g.online || this.hosting) return;
    if (!onlineSupported()) { this.hostError = "This browser can't play online."; g.hud.message(this.hostError); this.onOnlineChange(); return; }
    this.hosting = true;
    this.hostError = '';
    this.onOnlineChange();
    g.hud.message('Opening your game to friends...');
    const link = new Link();
    try {
      await link.host();
    } catch (e) {
      link.close();
      this.hosting = false;
      this.hostError = e.message;
      if (this.game === g) g.hud.message(`Couldn't open your game online. ${e.message}`);
      this.onOnlineChange();
      return;
    }
    this.hosting = false;
    if (this.game !== g) { link.close(); return; }
    g.startHosting(link);
    g.hud.message(`Your game is open to friends. Code: ${link.code}`);
    this.onOnlineChange();
  }

  // Join a friend's game by its code.
  async joinOnline(code) {
    code = cleanCode(code);
    if (code.length !== CODE_LENGTH) { this.menus.notice("That's Not A Code", `A game code is ${CODE_LENGTH} letters and numbers, like K7M2Q.`, 'join'); return; }
    if (!onlineSupported()) { this.menus.notice("Can't Play Online", "This browser can't play online.", 'join'); return; }
    this.menus.reset('loading', 'Connecting...');
    const link = new Link();
    let welcome;
    try {
      welcome = await link.join(code, { v: PROTOCOL, name: this.netName(), prof: cleanProfile(this.profile) });
    } catch (e) {
      link.close();
      this.menus.notice("Couldn't Join", e.message, 'join');
      return;
    }
    this.input.requestLock();
    this.startGame({ online: { link, welcome } });
  }

  // A guest whose host has gone: back to the menu, saying why.
  lostHost(why) {
    const o = this.game?.online;
    if (!o || o.host || o.closed) return;
    o.close(true);
    this.pendingNotice = { title: 'Disconnected', sub: why };
    this.hideDeath();
    this.input.exitLock();
    this.menus.reset('loading');
    this.attract();
  }

  // Put out of a friend's game by its host.
  kicked(ban) {
    const o = this.game?.online;
    if (!o || o.host || o.closed) return;
    o.close(true);
    this.pendingNotice = ban ? { title: 'Banned', sub: 'The host banned you from this game.' } : { title: 'Kicked', sub: 'The host kicked you from the game.' };
    this.hideDeath();
    this.input.exitLock();
    this.menus.reset('loading');
    this.attract();
  }

  // Leave a friend's game (what you have goes to them first).
  leaveOnline() {
    this.game?.online?.close();
    this.menus.reset('loading');
    this.attract();
  }

  // who's in, the code: the menus showing them redraw
  onOnlineChange() {
    if (this.menus?.visible && ['pause', 'invite', 'teleport', 'teleportMenu', 'hostOptions', 'pickPlayer'].includes(this.menus.id)) this.menus.refresh();
  }

  // The host's ban list (the original keeps it with the player's stats): name -> when
  bans() {
    try { return JSON.parse(localStorage.getItem('starminer.bans') || '{}') || {}; } catch { return {}; }
  }

  ban(name) {
    const b = this.bans();
    b[name] = Date.now();
    try { localStorage.setItem('starminer.bans', JSON.stringify(b)); } catch { /* storage blocked */ }
  }

  clearBans() {
    try { localStorage.removeItem('starminer.bans'); } catch { /* storage blocked */ }
  }

  onLockChange() {
    this.input.locked = document.pointerLockElement === this.canvas;
    // losing the mouse (Esc) while playing pauses, unless the game let go of it on purpose
    if (!this.input.locked && this.state === 'playing' && !this.isTouch && this.input.lastDevice !== 'pad' && !this.game?.lockFree) this.pause();
  }

  // The death screen (InGameHUD's): in Endurance how far you got, and what pressing will do:
  // respawn, restart, or (online, everyone down) wait for the host; or how long till you can
  showDeath({ lines = [], press = null, count = null } = {}) {
    if (!this.deathEl) {
      this.deathEl = document.createElement('div');
      this.deathEl.className = 'death ui txt';
      this.uiRoot.appendChild(this.deathEl);
      this.deathEl.addEventListener('pointerdown', () => this.input.down('accept'));
    }
    const dev = this.isTouch ? 'touch' : this.input.lastDevice === 'pad' ? 'pad' : 'key';
    const key = `${lines.join('|')}|${press}|${count}|${dev}`;
    if (key !== this.deathKey) {
      this.deathKey = key;
      const what = press === 'Restart' ? 'Restart' : 'Respawn';
      const prompt = press === 'wait' ? 'Waiting For Host To Restart'
        : count != null ? `Respawn In: ${count}`
          : !press ? ''
            : dev === 'touch' ? `Tap To ${what}` : dev === 'pad' ? `Press <span class="btn a">A</span> To ${what}` : `Press <span class="key">Space</span> To ${what}`;
      this.deathEl.innerHTML = `${lines.map((l) => `<div>${l}</div>`).join('')}<div class="press">${prompt}</div>`;
    }
    if (!this.deathEl.classList.contains('on')) {
      this.deathEl.classList.add('on');
      if (this.game) this.game.lockFree = true;
      this.input.exitLock();
    }
  }

  hideDeath() {
    this.deathKey = '';
    this.deathEl?.classList.remove('on');
    if (this.game) this.game.lockFree = false;
    this.input.requestLock();
  }

  graphicsLost(lost) {
    this.lostGfx = lost;
    if (!lost) { this.sky?.rebake(); this.lostEl?.remove(); this.lostEl = null; return; }
    const g = this.game, kept = g && !g.attract && RULES.kept(g) && g.worldId;
    this.autosave();
    this.input.exitLock();
    if (this.lostEl) return;
    const el = document.createElement('div');
    el.className = 'ui txt';
    el.style.cssText = 'position:absolute;inset:0;z-index:20;display:grid;place-content:center;gap:0.7em;padding:6%;background:rgba(0,0,0,0.88);text-align:center;font-size:1.5em;font-weight:700';
    el.innerHTML = `<div>The browser stopped the game's graphics (it may have run short of memory).</div><div>${kept ? 'Your world has been saved. ' : ''}Close any other tabs, then press A, Enter or tap here to reload.</div>`;
    el.addEventListener('pointerdown', () => location.reload());
    this.uiRoot.appendChild(el);
    this.lostEl = el;
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
    // (no graphics: nothing goes on, but a press reloads the page)
    if (this.lostGfx) {
      this.input.poll(dt);
      if (this.input.consume('accept') || this.input.consume('jump') || this.input.consume('pause')) location.reload();
      this.input.endFrame();
      return;
    }
    this.frames++;
    this.fpsAcc += rawDt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.input.poll(dt);
    // the front end takes the input first
    if (this.menus.visible) this.menus.update(dt, this.input);
    // (B too: on an Xbox, Edge may keep the Menu button for itself; but B on a door, a crate or
    // TNT is the original's Activate)
    else if (this.state === 'playing' && !this.game?.screenUp && (this.input.consume('pause') || (!this.game?.player.dead && !this.game?.wantsActivate() && this.input.consume('back_btn')))) this.pause();
    const g = this.game;
    if (g) {
      // tests can run the game faster than it renders (simfast=N updates a frame)
      for (let k = 0; k < SIMFAST; k++) g.update(SIMFAST > 1 ? 1 / 30 : dt, this.input);
      const ready = g.ready ? 1 : g.world.readiness(g.player.pos.x, g.player.pos.z, 2);
      if (this.state === 'boot' && g.attract) {
        this.menus.setLoading(0.6 + ready * 0.4);
        if (g.ready) {
          this.state = 'menu';
          this.menus.reset(params.get('menu') || (this.titleShown ? 'main' : 'title'));
          this.titleShown = true;
          if (this.pendingNotice) { const n = this.pendingNotice; this.pendingNotice = null; this.menus.notice(n.title, n.sub); }
        }
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
      this.touch?.setVisible(this.state === 'playing' && !g.screenUp && !g.player.dead);
      const p = g.player;
      this.audio.update(dt, this.camera, {
        menu: g.attract || this.state === 'menu' || this.state === 'boot' || this.state === 'loading',
        time: this.sky.time, depth: g.depth || 0, y: p.pos.y, pos: p.pos, rock: g.underRock || 0,
      });
      this.renderer.adapt(rawDt);
      // (Brightness, the original's setting, on top of the eye's own)
      this.renderer.exposure = parseFloat(params.get('ex') || this.autoExposure(dt)) * (this.settings.brightness ?? 1);
      g.sprites.setScale(this.renderer.size.H, this.camera.fov);
      this.renderer.render(g.scene, this.camera, g.viewModel.scene, g.viewModel.camera);
      window.__readiness = ready;
    }
    this.input.endFrame();
  }
}
