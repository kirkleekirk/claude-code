import * as THREE from 'three';
import { loadModels } from './engine/assets.js';
import { Renderer } from './engine/renderer.js';
import { ThirdPersonCamera } from './engine/camera.js';
import { Input } from './engine/input.js';
import { clamp, damp, rand, yawOf, dirFromYawPitch } from './engine/math.js';
import { Arena, ARENA } from './world/arena.js';
import { World } from './world/world.js';
import { Effects } from './vfx/effects.js';
import { AudioEngine } from './audio/audio.js';
import { Hero } from './heroes/hero.js';
import { HERO_KEYS, HEROES } from './heroes/data.js';
import { InvincibleKit } from './heroes/kits/invincible.js';
import { EveKit } from './heroes/kits/eve.js';
import { OmniKit } from './heroes/kits/omniman.js';
import { Bot } from './ai/bot.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const KITS = { invincible: InvincibleKit, eve: EveKit, omniman: OmniKit };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const PARAMS = new URLSearchParams(location.search);
// phones and tablets without a mouse: a bot plays the player's hero so the match can be watched
const TOUCH_ONLY = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

class PlayerController {
  constructor(game) { this.g = game; }
  update(dt, h) {
    const g = this.g, inp = g.input, it = h.intents, cam = g.camRig;
    const k = (c) => inp.isDown(c);
    it.mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    it.mz = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    it.jump = inp.wasPressed('Space');
    it.jumpHeld = k('Space');
    it.flyToggle = inp.wasDouble('Space');
    it.up = k('Space') && h.mode === 'fly';
    it.down = k('ControlLeft') || k('KeyC') || k('ControlRight');
    it.primary = inp.mouse.b[0]; it.primaryPressed = inp.mouse.pb[0];
    it.secondary = inp.mouse.b[2]; it.secondaryPressed = inp.mouse.pb[2];
    it.a1 = inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight');
    it.a2 = inp.wasPressed('KeyE');
    it.a3 = inp.wasPressed('KeyF');
    it.ult = inp.wasPressed('KeyQ');
    it.choice = null;
    // aim from camera
    const c = cam.cam;
    c.getWorldDirection(it.aimDir);
    const skip = c.position.distanceTo(cam.pivot) * 0.95;
    it.aimOrigin.copy(c.position).addScaledVector(it.aimDir, skip);
    const enemy = g.world.rayHeroes(it.aimOrigin, it.aimDir, 300, (x) => x !== h, 0.15);
    const wh = g.world.rayWorld(it.aimOrigin, it.aimDir, 300);
    let dist = 300;
    it.aimHero = null;
    if (wh) dist = wh.dist;
    if (enemy && enemy.dist < dist) { dist = enemy.dist; it.aimHero = enemy.hero; }
    it.aimPoint.copy(it.aimOrigin).addScaledVector(it.aimDir, dist);
  }
}

export class Game {
  constructor() {
    this.state = 'loading';
    this.canvas = document.getElementById('game');
    this.time = 0;
    this.bots = [];
    this.player = null;
    this.preview = null;
    this.loadSettings();
  }

  async boot(onProgress) {
    window.__capture = PARAMS.has('capture');
    if (window.__capture) window.THREE = THREE;
    this.renderer = new Renderer(this.canvas, PARAMS.get('quality') || this.saved.quality || (TOUCH_ONLY ? 'low' : 'medium'));
    this.scene = new THREE.Scene();
    this.camRig = new ThirdPersonCamera(innerWidth / innerHeight);
    this.camRig.sens = this.saved.sens ?? this.camRig.sens;
    this.camRig.invertY = !!this.saved.invertY;
    this.renderer.build(this.scene, this.camRig.cam);
    onProgress && onProgress(0.08, 'Building arena');
    this.arena = new Arena(this.scene, this.renderer);
    this.fx = new Effects(this.scene, this.renderer, this.camRig, this.renderer.q.particles);
    this.audio = new AudioEngine();
    this.audio.volume = this.saved.volume ?? 0.8;
    this.world = new World({ scene: this.scene, fx: this.fx, audio: this.audio, renderer: this.renderer, camRig: this.camRig, obstacles: this.arena.obstacles });
    // a respawn moves the player across the map: cut rather than chase
    this.world.on('respawn', (e) => { if (e.hero === this.player) this.camRig.cut(); });
    this.input = new Input(this.canvas);
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'playing' && !this._noPause) this.pause(); };
    this.pc = new PlayerController(this);
    await loadModels('', (p, k) => onProgress && onProgress(0.1 + p * 0.65, 'Loading ' + (HEROES[k] ? HEROES[k].name : k)));
    onProgress && onProgress(0.8, 'Warming up shaders');
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    await this.warmup();
    onProgress && onProgress(1, 'Ready');
    window.__game = this;
    this.last = performance.now();
    if (!PARAMS.has('manual')) requestAnimationFrame((t) => this.loop(t));
    const auto = PARAMS.get('auto');
    if (auto && HEROES[auto]) { this.startMatch(auto); }
    else this.toTitle();
  }

  async ensureAudio() {
    try { await this.audio.init(); this.audio.resume(); } catch (e) { console.warn('audio init failed', e); }
  }

  async warmup() {
    // spawn one of each hero + common effects and render once so shaders compile up front
    const tmp = HERO_KEYS.map((k, i) => { const h = new Hero(this.world, k, i % 2); h.pos.set(i * 3 - 3, 0, 0); h.kit = new KITS[k](h); h.update(0.016, 0); return h; });
    const p = new THREE.Vector3(0, 1, 5);
    this.fx.punchImpact(p, new THREE.Vector3(0, 0, 1));
    this.fx.groundSlam(p, { power: 0.5 });
    this.fx.sonicBoom(p, new THREE.Vector3(0, 0, 1));
    this.fx.energyBurst(p);
    this.fx.pillar(p);
    this.fx.decal(p, 2, 'scorch', 0.1); this.fx.decal(p, 2, 'atom', 0.1);
    this.fx.comic(p, 'POW!');
    this.fx.update(0.016);
    this.camRig.cam.position.set(0, 3, 14); this.camRig.cam.lookAt(0, 1, 0);
    this.renderer.r.compile(this.scene, this.camRig.cam);
    this.renderer.render(0.016, 0);
    await new Promise((r) => setTimeout(r, 30));
    for (const h of tmp) this.world.remove(h);
    this.fx.update(5);
  }

  // ------------------------------------------------------------------ flow
  clearWorld() {
    for (const h of [...this.world.heroes]) this.world.remove(h);
    this.bots = [];
    this.player = null; this.playerBot = null;
    this.world.projectiles = [];
    this.world.score = [0, 0];
    this.world.feed = [];
    if (this.preview) { this.scene.remove(this.preview.root); this.preview = null; }
  }
  spawn(key, team, { isPlayer = false, name } = {}) {
    const h = new Hero(this.world, key, team, { isPlayer, name });
    h.kit = new KITS[key](h);
    this.world.add(h);
    if (!isPlayer) this.bots.push(new Bot(h, this.world));
    return h;
  }

  toTitle() {
    this.clearWorld();
    this.state = 'title';
    this.input.unlock();
    this.menus.show('title');
    this.hud.show(false);
    // attract mode: bots brawling behind the logo
    for (const k of HERO_KEYS) { this.spawn(k, 0); this.spawn(k, 1); }
    for (const h of this.world.heroes) { h.pos.z *= 0.35; }
    this.world.settings.bots = 'active';
    this.orbit = 0;
  }

  toSelect(fromGame = false) {
    this.state = 'select';
    this.fromGame = fromGame && !!this.player;
    this.input.unlock();
    this.menus.show('select');
    this.hud.show(false);
    if (!this.fromGame) this.clearWorld();
    this.previewHero(this.menus.selected);
  }

  previewHero(k) {
    if (this.state !== 'select') return;
    if (this.preview && this.preview.key === k) return;
    if (this.preview) { this.world.remove(this.preview); }
    const h = new Hero(this.world, k, 0, { name: HEROES[k].name });
    h.kit = new KITS[k](h);
    h.pos.set(0, 0, -38); h.yaw = 0;
    h.combatStance = 0;
    this.preview = h;
    h.dissolve = 1; h.dissolveTarget = 0;
    this.fx.pillar(h.pos, { color: HEROES[k].color, height: 16, radius: 1.3, life: 1.2 });
    this.fx.ring(h.pos, { color: HEROES[k].color, r1: 4, life: 0.5, intensity: 2 });
    this.audio.ready && this.audio.play('respawn', { ui: true, vol: 0.4 });
    this.previewT = 0;
    this.previewPose = 0;
  }

  startMatch(key) {
    if (this.fromGame && this.player) { this.changeHero(key); this.fromGame = false; return; }
    this.clearWorld();
    this.state = 'playing';
    this.menus.show(null);
    this.hud.show(true);
    this.player = this.spawn(key, 0, { isPlayer: true, name: 'YOU' });
    for (const k of HERO_KEYS) if (k !== key) this.spawn(k, 0);
    for (const k of HERO_KEYS) this.spawn(k, 1);
    this.camRig.yaw = 0; this.camRig.pitch = -0.12; this.camRig.cut();
    if (!PARAMS.has('capture')) this.input.lock();
    this.ensureAudio();
    this.hud.toast(TOUCH_ONLY ? 'A bot is playing your hero. Use a keyboard and mouse to play yourself.' : 'Fight! ESC for menu & training options');
    if (PARAMS.has('autobot') || TOUCH_ONLY) this.bots.push(this.playerBot = new Bot(this.player, this.world));
  }

  changeHero(key) {
    const old = this.player;
    if (!old || old.key === key) { this.resume(); return; }
    const oldKey = old.key;
    const pos = old.dead ? ARENA.spawns[0].clone() : old.pos.clone();
    this.world.remove(old);
    this.player = new Hero(this.world, key, 0, { isPlayer: true, name: 'YOU' });
    this.player.kit = new KITS[key](this.player);
    this.player.pos.copy(pos);
    this.world.add(this.player);
    if (old.dead) this.camRig.cut();
    this.fx.pillar(pos, { color: HEROES[key].color, height: 16, radius: 1.3, life: 1.2 });
    this.player.dissolve = 1; this.player.dissolveTarget = 0;
    if (this.playerBot) {
      this.bots = this.bots.filter((b) => b !== this.playerBot);
      this.bots.push(this.playerBot = new Bot(this.player, this.world));
    }
    // keep team composition varied: an ally bot using the same hero swaps to the old one
    const dup = this.world.heroes.find((h) => h !== this.player && h.team === 0 && h.key === key);
    if (dup) {
      const p2 = dup.pos.clone();
      this.bots = this.bots.filter((b) => b.h !== dup);
      this.world.remove(dup);
      const nh = this.spawn(oldKey, 0); nh.pos.copy(p2);
    }
    this.state = 'playing';
    this.menus.show(null);
    this.hud.show(true);
    this.input.lock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menus.show('pause');
    this.input.unlock();
  }
  resume(lock = true) {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.show(null);
    if (lock) this.input.lock();
  }
  onKey(e) {
    if (e.code === 'Escape') {
      if (this.state === 'paused') this.resume();
      else if (this.state === 'select' && this.fromGame) { this.state = 'paused'; this.resume(); }
    }
    if (e.code === 'KeyH' && this.state === 'playing') { this._noPause = true; this.toSelect(true); setTimeout(() => { this._noPause = false; }, 50); }
    if (e.code === 'KeyU' && this.state === 'playing' && this.player) this.player.ult = this.player.def.ultCost;
  }

  setQuality(q) {
    this.renderer.setQuality(q);
    this.arena.setShadowRes(this.renderer.q.shadow);
    this.saveSettings();
  }
  loadSettings() { try { this.saved = JSON.parse(localStorage.getItem('ia-settings') || '{}'); } catch (e) { this.saved = {}; } }
  saveSettings() {
    try { localStorage.setItem('ia-settings', JSON.stringify({ quality: this.renderer.qualityName, sens: this.camRig.sens, invertY: this.camRig.invertY, volume: this.audio.volume })); } catch (e) { /* storage unavailable */ }
  }

  // ------------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (PARAMS.has('fixeddt')) dt = 1 / 60;
    this.step(dt);
  }

  step(dt) {
    this.time += dt;
    const w = this.world;
    const playing = this.state === 'playing';
    if (playing && this.player) {
      if (this.input.locked) this.camRig.look(this.input.mouse.dx, this.input.mouse.dy);
      if (this.script) this.script(this, dt);
      else if (!this.playerBot) this.pc.update(dt, this.player);
    }
    if (this.state !== 'paused') for (const b of this.bots) b.update(dt);
    if (this.playerBot && this.player) { this.camRig.yaw = damp(this.camRig.yaw, this.camRig.yaw + wrapA(yawOf(this.player.intents.aimDir) - this.camRig.yaw), 6, dt); this.camRig.pitch = damp(this.camRig.pitch, Math.asin(clamp(this.player.intents.aimDir.y, -1, 1)) * 0.6 - 0.1, 4, dt); }
    let gdt = dt;
    if (w.hitstopT > 0) { w.hitstopT -= dt; gdt = dt * 0.06; }
    w.realDt = dt;
    if (this.state !== 'paused') {
      w.update(gdt);
      this.fx.update(gdt);
    }
    if (this.preview && this.state === 'select') this.updatePreview(dt);
    this.updateCamera(dt);
    const focus = this.player ? this.player.pos : (this.preview ? this.preview.pos : _v.set(0, 0, 0));
    this.arena.update(dt, this.time, focus);
    if (this.audio.ready) {
      this.audio.setListener(this.camRig.cam);
      const p = this.player;
      const sp = p && !p.dead && p.mode === 'fly' ? p.vel.length() : (p && p.override ? p.vel.length() * 0.7 : 0);
      this.audio.setWind(this.state === 'playing' ? sp : 0, p && p.override && p.override.boost ? 1 : 0);
      this.audio.setMuffle(p && p.dead ? 0.85 : 0);
    }
    if (this.state === 'playing' || this.state === 'paused') this.hud.update(dt);
    this.renderer.fx.desat = this.player && this.player.dead ? Math.min(0.7, this.renderer.fx.desat + dt) : Math.max(0, this.renderer.fx.desat - dt * 2);
    if (!this.noRender) this.renderer.render(dt, this.time);
    this.renderer.advance(dt);
    this.input.endFrame();
  }

  // clear distance along a ray, for camera collision
  camRay = (from, dir, dist) => {
    const hit = this.world.rayWorld(from, dir, dist);
    return hit ? hit.dist : dist;
  };

  updateCamera(dt) {
    const cr = this.camRig;
    if (this.camOverride) {
      const o = this.camOverride, c = cr.cam;
      const pos = typeof o.pos === 'function' ? o.pos(this) : o.pos, look = typeof o.look === 'function' ? o.look(this) : o.look;
      c.position.copy(pos); c.lookAt(look); c.fov = o.fov || 50; c.updateProjectionMatrix(); c.updateMatrixWorld();
      return;
    }
    if (this.state === 'title' || this.state === 'loading') {
      this.orbit = (this.orbit || 0) + dt * 0.06;
      const c = cr.cam;
      // follow the brawl's centroid
      const alive = this.world.heroes.filter((h) => !h.dead);
      const cen = _u.set(0, 0, 0);
      for (const h of alive) cen.add(h.pos);
      if (alive.length) cen.multiplyScalar(1 / alive.length);
      this._titleFocus = this._titleFocus ? this._titleFocus.lerp(cen, 1 - Math.exp(-dt * 1.2)) : cen.clone();
      const f = this._titleFocus;
      c.position.set(f.x + Math.sin(this.orbit) * 24, 7 + Math.sin(this.orbit * 0.7) * 2, f.z + Math.cos(this.orbit) * 24);
      c.lookAt(f.x, 2.5, f.z);
      c.fov = 50; c.updateProjectionMatrix();
      return;
    }
    if (this.state === 'select' && this.preview) {
      const h = this.preview, c = cr.cam;
      this.previewOrbit = (this.previewOrbit || 0) + dt * 0.15;
      const a = Math.sin(this.previewOrbit) * 0.35;
      const tgt = _v.copy(h.pos); tgt.y += h.height * 0.55;
      c.position.set(h.pos.x + Math.sin(a) * 4.8, h.pos.y + 1.35, h.pos.z + Math.cos(a) * 4.8);
      c.lookAt(tgt.x + 0.32, tgt.y, tgt.z);
      c.fov = 42; c.updateProjectionMatrix();
      return;
    }
    const p = this.player;
    if (!p) return;
    if (p.dead) {
      // slow orbit around the fallen hero
      cr.yaw += dt * 0.25;
      cr.pitch = damp(cr.pitch, -0.35, 2, dt);
    }
    const speed = p.override ? p.vel.length() : (p.mode === 'fly' ? p.vel.length() : 0);
    const highAlt = p.pos.y > 60;
    cr.zoom = damp(cr.zoom, 0, 6, dt);
    const tgt = { root: p.root, camHeight: p.camHeight, camDist: p.camDist * (highAlt ? 2.6 : 1) * (p.dead ? 1.6 : 1) };
    cr.update(dt, tgt, this.camRay, { speed, flying: p.mode === 'fly', boost: !!(p.override && p.override.boost) });
  }

  updatePreview(dt) {
    const h = this.preview;
    this.previewT += dt;
    h.intents.aimDir.set(0, -0.05, 1).normalize();
    h.intents.aimOrigin.copy(h.pos);
    h.intents.aimPoint.copy(h.pos).add(_v.set(0, 1, 10));
    h.yaw = 0;
    // show off: cycle idle -> flourish
    if (this.previewT > 2.2 && h.kit && !h.override) {
      this.previewT = -1.5;
      const k = h.key, c = h.kit.clips;
      const seqs = { invincible: ['jab', 'cross', 'uppercut'], omniman: ['roar', 'hammer'], eve: ['pulse', 'fistCast'] }[k];
      const name = seqs[this.previewPose++ % seqs.length];
      if (c[name]) h.anim.play(c[name]);
      if (k === 'eve') { h.glowTarget = 0.35; setTimeout(() => { if (h) h.glowTarget = 0; }, 900); }
    }
    h.combatStance = damp(h.combatStance, 1, 1, dt);
    h.lastCombat = this.world.time;
    h.update(dt, this.world.time);
  }
}

function wrapA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
