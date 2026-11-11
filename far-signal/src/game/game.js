import * as THREE from 'three';
import { Gfx } from '../gfx/renderer.js';
import { G, resetLights, commitLights } from '../gfx/globals.js';
import { bakeNoiseTexture } from '../gfx/textures.js';
import { Sky } from '../gfx/sky.js';
import { Water } from '../gfx/water.js';
import { Particles } from '../gfx/particles.js';
import { generateWorld } from '../world/gen.js';
import { PLANETS } from '../world/planets.js';
import { PlanetWorld, VAULTS } from '../world/world.js';
import { Vault } from '../world/vault.js';
import { Player } from '../entities/player.js';
import { Creature, Spawner } from '../entities/creatures.js';
import { Combat } from '../entities/combat.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { UI } from '../ui/ui.js';
import { RECIPES, QUESTS, NOTES, SUITS, ITEMS, STATIONS } from './data.js';
import { Intro } from '../intro.js';

const SAVE_KEY = 'farsignal.save.v1', SET_KEY = 'farsignal.settings.v1';
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
};

const freshState = () => ({ v: 1, inv: {}, unlocks: {}, stations: {}, suit: 0, keystones: 0, flags: {}, visited: { veyra: true }, quest: 0, notes: ['signal', 'arrival'], planet: 'veyra', pos: null, t: null, vit: null });

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.params = new URLSearchParams(location.search);
    const touchy = (navigator.maxTouchPoints || 0) > 0 && Math.min(window.innerWidth, window.innerHeight) < 900;
    this.settings = Object.assign({ quality: touchy ? 'medium' : 'high', sens: 1, invertY: false, volume: 0.8 }, store.get(SET_KEY) || {});
    if (this.params.get('q')) this.settings.quality = this.params.get('q');
    this.state = freshState();
    this.phase = 'boot'; this.paused = false; this.busy = false; this.loadingWorld = false;
    this.time = 0; this.shakeAmt = 0; this.saveT = 0; this.questT = 0; this.manual = false;
    this.creatures = []; this.boss = null; this.world = null; this.outer = null; this.cache = {};
    this.audio = new Audio();
    this.audio.volume = this.settings.volume;
    this.input = new Input(canvas);
    this.input.sens = +this.settings.sens; this.input.invertY = this.settings.invertY === true || this.settings.invertY === 'true';
    this.input.onFirstGesture = () => this.audio.unlock();
    this.ui = new UI(this, uiRoot);
    this.ui.setTouch(touchy || this.params.has('touch'));
    if (touchy) this.input.isTouch = true;
    window.addEventListener('touchstart', () => { if (!this.ui.touch) { this.ui.setTouch(true); this.input.isTouch = true; } }, { passive: true, once: true });
  }

  async init() {
    const ui = this.ui;
    ui.loading(true, 'Tuning the array', 0.02);
    this.gfx = new Gfx(this.canvas, this.settings.quality);
    G.uNoise.value = bakeNoiseTexture(256);
    G.uNoise.value.anisotropy = Math.min(8, this.gfx.maxAniso);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, this.gfx.aspect, 0.25, 9000);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.water = new Water(this.gfx);
    this.scene.add(this.water.mesh);
    this.particles = new Particles(this.gfx.q.maxDpr > 1.2 ? 1800 : 1100);
    this.scene.add(this.particles.points);
    this.combat = new Combat(this);
    this.scene.add(this.combat.group);
    this.player = new Player(this);
    this.player.attach(this.scene);
    this.spawner = new Spawner(this);
    await this.loadPlanet('veyra', (p) => ui.loading(true, 'Resolving Veyra', 0.05 + p * 0.9));
    const saved = store.get(SAVE_KEY);
    this.hasSave = !!(saved && saved.v === 1);
    this.toTitle();
    ui.loading(false);
    this.ready = true;
  }

  // --- settings / saving ---------------------------------------------------------------
  setSetting(k, v) {
    if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v) && v !== '') v = +v;
    this.settings[k] = v;
    store.set(SET_KEY, this.settings);
    if (k === 'quality') { this.gfx.setQuality(v); }
    else if (k === 'sens') this.input.sens = v;
    else if (k === 'invertY') this.input.invertY = v;
    else if (k === 'volume') { this.audio.setVolume(v); this.audio.play('ui'); }
  }

  save() {
    if (this.phase !== 'play') return;
    const s = this.state, p = this.player;
    const w = this.world;
    if (w.type === 'planet') { s.planet = w.def.id; s.pos = [p.pos.x, p.pos.y, p.pos.z, p.camYaw]; }
    else if (this.vaultReturn) { s.planet = 'veyra'; s.pos = [this.vaultReturn.x, this.vaultReturn.y, this.vaultReturn.z, 0]; }
    s.t = this.sky.time; s.vit = [p.hp, p.energy, p.o2];
    store.set(SAVE_KEY, s);
    this.hasSave = true;
  }

  // --- world management ------------------------------------------------------------------
  clearEntities() {
    for (const c of this.creatures) this.scene.remove(c.group);
    this.creatures.length = 0; this.boss = null;
    this.combat.clear(); this.particles.clear();
  }

  async loadPlanet(id, onProgress) {
    this.loadingWorld = true;
    this.clearEntities();
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); this.world = null; }
    const def = PLANETS[id];
    if (!this.cache[id]) this.cache[id] = await generateWorld(def, onProgress);
    this.world = new PlanetWorld(this, def, this.cache[id]);
    this.scene.add(this.world.group);
    this._activatePlanet();
    this.sky.time = def.sky.startTime;
    this.audio.setAmbient(id);
    this.loadingWorld = false;
  }

  _activatePlanet() {
    const w = this.world;
    G.uInterior.value = 0;
    w.terrain.activate();
    this.water.setWorld(w.terrain, w.def);
    this.sky.setPlanet(w.def.sky);
    this.sky.mesh.visible = true;
    w.terrain.bakeShadow(this.sky.keyDir, true);
  }

  async travel(dest) {
    if (this.busy) return;
    this.busy = true;
    this.input.setEnabled(false);
    this.audio.play('warp');
    this.warp = 1;
    await this.ui.fade(1, 1500, '#e6fdff');
    this.save();
    await this.loadPlanet(dest);
    const sp = this.world.spawnPoint();
    this.player.place(sp.pos, sp.yaw);
    this.state.visited[dest] = true; this.state.planet = dest;
    this.world.flora.warm(this.player.pos);
    this.warp = 0;
    this.stepOnce();
    await this.ui.fade(0, 1100, '#e6fdff');
    this.ui.banner(this.world.def.name.toUpperCase(), this.world.def.subtitle);
    this.busy = false;
    if (!this.paused) this.input.setEnabled(true);
    this.save();
  }

  async enterVault(id) {
    if (this.busy) return;
    this.busy = true;
    this.input.setEnabled(false);
    this.audio.play('door');
    await this.ui.fade(1, 700);
    const p = this.player;
    this.vaultReturn = p.pos.clone();
    this.vaultReturnYaw = p.camYaw + Math.PI;
    this.clearEntities();
    this.outer = this.world;
    this.scene.remove(this.outer.group);
    this.sky.mesh.visible = false; this.water.mesh.visible = false;
    this.world = new Vault(this, id);
    this.scene.add(this.world.group);
    this.world.activate();
    const sp = this.world.spawnPoint();
    p.place(sp.pos, sp.yaw);
    this.world.populate();
    this.audio.setAmbient('vault');
    this.stepOnce();
    await this.ui.fade(0, 800);
    this.ui.banner(VAULTS[id].name.toUpperCase(), 'Attune the rings. Clear the halls.');
    if (!this.state.notes.includes('vault')) this.addNote('vault');
    this.busy = false;
    if (!this.paused) this.input.setEnabled(true);
  }

  async leaveVault(dead = false) {
    if (this.busy && !dead) return;
    this.busy = true;
    this.input.setEnabled(false);
    await this.ui.fade(1, 600);
    this.clearEntities();
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.world = this.outer; this.outer = null;
    this.scene.add(this.world.group);
    this._activatePlanet();
    this.world.refresh();
    this.audio.setAmbient(this.world.def.id);
    if (dead) { const sp = this.world.spawnPoint(); this.player.place(sp.pos, sp.yaw); }
    else this.player.place(this.vaultReturn, this.vaultReturnYaw);
    this.vaultReturn = null;
    this.stepOnce();
    await this.ui.fade(0, 800);
    this.busy = false;
    if (!this.paused) this.input.setEnabled(true);
    this.save();
  }

  spawnCreature(type, x, y, z, opts) {
    const c = new Creature(this, type, x, y, z, opts);
    this.scene.add(c.group);
    this.creatures.push(c);
    if (type === 'warden') this.boss = c;
    return c;
  }

  // --- progression ---------------------------------------------------------------------------
  give(item, n = 1) {
    this.state.inv[item] = (this.state.inv[item] || 0) + n;
    this.ui.pickup(item, n);
    this.audio.play('pickup', 0.7);
  }

  addNote(id) { if (!this.state.notes.includes(id)) { this.state.notes.push(id); this.ui.toast('Field note added: ' + (NOTES[id] ? NOTES[id].title : 'Workshop'), 'good'); } }

  atCamp() {
    const w = this.world;
    return w && w.type === 'planet' && w.def.kind === 'veyra' && w.safeAt(this.player.pos.x, this.player.pos.z, 12);
  }

  recipeState(r) {
    const s = this.state;
    const g = r.gives;
    const done = g.unlock ? !!s.unlocks[g.unlock] : g.station ? !!s.stations[g.station] : g.suit !== undefined ? s.suit >= g.suit : false;
    let visible = !r.station || !!s.stations[r.station];
    for (const n of r.need || []) {
      if (n.startsWith('st:')) visible = visible && !!s.stations[n.slice(3)];
      else if (n.startsWith('suit:')) visible = visible && s.suit >= +n.slice(5);
      else visible = visible && !!s.unlocks[n];
    }
    if (g.suit !== undefined && s.suit > g.suit) visible = false;
    let why = null;
    if ((r.station || r.cat === 'build') && !this.atCamp()) why = 'Return to camp';
    let has = true;
    for (const k in r.cost) if ((s.inv[k] || 0) < r.cost[k]) has = false;
    return { visible, done, why: done ? null : why, can: visible && !done && has && !why };
  }

  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r || !this.recipeState(r).can) return;
    const s = this.state, g = r.gives, p = this.player;
    for (const k in r.cost) s.inv[k] -= r.cost[k];
    if (g.unlock) {
      s.unlocks[g.unlock] = true;
      if (g.unlock === 'gauntlet' || g.unlock === 'boots') p.rebuild();
      this.ui.toast(r.name + ' online', 'good');
      this.audio.play('craft');
    } else if (g.station) {
      s.stations[g.station] = true;
      this.world.refresh(g.station);
      this.ui.toast(STATIONS[g.station].name + (g.station === 'gate' ? ' repaired' : ' built at camp'), 'good');
      this.audio.play('build');
      const st = this.world.stations && this.world.stations[g.station];
      const at = st ? st.mesh.position : this.world.base;
      this.particles.burst(new THREE.Vector3(at.x, at.y + 1.5, at.z), 70, 7, 1.2, 1.2, 0.5, 1, 0.95, { gravity: -1 });
    } else if (g.suit !== undefined) {
      s.suit = g.suit;
      p.rebuild(); p.fullRestore();
      this.ui.toast(SUITS[g.suit].name + ' sealed and running', 'good');
      this.audio.play('build');
      this.particles.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), 60, 5, 1.0, 1.1, 0.6, 0.9, 1, { gravity: -1 });
    } else if (g.item) {
      s.inv[g.item] = (s.inv[g.item] || 0) + (g.n || 1);
      this.ui.toast(`${r.name} x${g.n || 1}`, 'good', ITEMS[g.item].color);
      this.audio.play('craft');
    }
    if (r.note && !s.notes.includes('r:' + r.id)) s.notes.push('r:' + r.id);
    this.ui.dirty = true;
    this.checkQuests(true);
    this.ui.renderPanel();
    this.save();
  }

  questMarker() {
    const w = this.world, q = QUESTS[this.state.quest];
    if (!w || w.type !== 'planet') return null;
    if (w.def.kind !== 'veyra') return q.marker ? w.base : null;
    const m = q.marker;
    if (!m) return null;
    if (m === 'landing') return w.base;
    if (m === 'lagoon' || m === 'mesa') {
      w.mk = w.mk || {};
      if (!w.mk[m]) {
        const type = m === 'lagoon' ? 'pod' : 'emberglass';
        let best = null, bd = 1e9;
        for (const nd of w.nodes.list) { if (nd.type !== type) continue; const d = Math.hypot(nd.x - w.base.x, nd.z - w.base.z); if (d < bd) { bd = d; best = nd; } }
        w.mk[m] = best ? { x: best.x, z: best.z } : w.base;
      }
      return w.mk[m];
    }
    const p = w.def.pois[m];
    return p ? p : null;
  }

  checkQuests(silent) {
    const s = this.state;
    let advanced = false;
    while (s.quest < QUESTS.length - 1 && QUESTS[s.quest].done(s)) { s.quest++; advanced = true; }
    if (advanced) {
      const q = QUESTS[s.quest];
      this.ui.el.objective.classList.remove('flash'); void this.ui.el.objective.offsetWidth; this.ui.el.objective.classList.add('flash');
      this.audio.play('quest');
      if (q.note) this.addNote(q.note);
      if (q.say) setTimeout(() => this.ui.say(q.say), silent ? 1200 : 300);
      this.ui.dirty = true;
      this.save();
    }
  }

  onCreatureDeath(c) {
    if (this.world.onCreatureDeath) this.world.onCreatureDeath(c);
    if (c.type === 'warden') {
      this.state.flags.wardenDead = true;
      this.ui.toast('The Warden falls silent', 'good');
      this.ui.say('It was not guarding the Spire from me. It was checking I was ready for it.');
      this.shake(1);
      this.save();
    }
  }

  onKeystone(key) {
    const s = this.state;
    s.keystones = Math.max(s.keystones, key);
    s.inv.keystone = s.keystones;
    this.audio.play('key');
    this.ui.banner('KEYSTONE ' + ['I', 'II', 'III'][key - 1], `${s.keystones} of 3 recovered`);
    this.ui.say(key === 3 ? 'Three keys. The murals all end at the same tower.' : 'It is cut to fit a socket. Somewhere there is a lock this size.');
    this.checkQuests(true);
    this.save();
  }

  activateSpire() {
    const s = this.state;
    s.flags.spireAwake = true;
    this.world.refresh();
    this.audio.play('warp'); this.audio.play('key');
    this.shake(1.2);
    this.addNote('ending');
    this.sky.uniforms.uBeam.value = 1;
    this.ui.banner('THE SPIRE WAKES', 'Alignment pending');
    setTimeout(() => this.ui.say(NOTES.ending.text), 2500);
    this.checkQuests(true);
    this.save();
  }

  onPlayerDeath() {
    const vault = this.world.type === 'vault';
    this.input.setEnabled(false);
    this.audio.loop('beam', 0); this.audio.loop('thrust', 0);
    this.ui.death(vault ? 'The vault lets you go. You wake outside its door.' : "The Gate's tether drags you back to camp.");
    this.busy = true;
    setTimeout(async () => {
      const p = this.player;
      if (vault) await this.leaveVault(true);
      else { await this.ui.fade(1, 500); this.clearEntities(); const sp = this.world.spawnPoint(); p.place(sp.pos, sp.yaw); await this.ui.fade(0, 700); }
      p.dead = false; p.fullRestore(); p.invuln = 2;
      this.ui.hideDeath();
      this.busy = false;
      if (!this.paused) this.input.setEnabled(true);
    }, 2400);
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // --- phases ----------------------------------------------------------------------------------
  setPaused(on) {
    this.paused = on;
    this.input.setEnabled(!on && this.phase === 'play' && !this.busy);
    if (on) { this.audio.loop('beam', 0); this.audio.loop('thrust', 0); }
  }

  toTitle() {
    this.phase = 'title';
    this.input.setEnabled(false);
    this.player.group.visible = false; this.player.rig.blob.visible = false;
    this.ui.showTitle(this.hasSave);
    this.ui.showHud(false);
    this.audio.setAmbient('title');
    this.sky.time = PLANETS.veyra.sky.startTime + 0.02;
  }

  async quitToTitle() {
    this.save();
    this.busy = true;
    await this.ui.fade(1, 500);
    if (this.world.type === 'vault') { this.clearEntities(); this.scene.remove(this.world.group); this.world.dispose(); this.world = this.outer; this.outer = null; this.scene.add(this.world.group); this._activatePlanet(); }
    if (this.world.def.id !== 'veyra') await this.loadPlanet('veyra');
    this.clearEntities();
    this.toTitle();
    this.busy = false;
    await this.ui.fade(0, 500);
  }

  async newGame() {
    if (this.busy) return;
    this.busy = true;
    this.state = freshState();
    this.ui.hideTitle();
    await this.ui.fade(1, 700);
    if (this.params.has('nointro')) { await this.beginPlay(true); return; }
    this.phase = 'intro';
    this.intro = new Intro(this);
    this.intro.start(async () => {
      this.intro.dispose(); this.intro = null;
      this._activatePlanet();
      await this.beginPlay(true);
    });
    this.busy = false;
    await this.ui.fade(0, 900);
  }

  async continueGame() {
    if (this.busy) return;
    const saved = store.get(SAVE_KEY);
    if (!saved) return this.newGame();
    this.busy = true;
    this.state = Object.assign(freshState(), saved);
    this.ui.hideTitle();
    await this.ui.fade(1, 600);
    await this.beginPlay(false);
  }

  async beginPlay(fresh) {
    const s = this.state, p = this.player;
    if (this.world.def.id !== s.planet) await this.loadPlanet(s.planet);
    this.world.refresh();
    p.rebuild();
    p.group.visible = true;
    p.dead = false;
    if (!fresh && s.pos) { p.place(new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]), s.pos[3] || 0); if (s.t != null) this.sky.time = s.t; }
    else { const sp = this.world.spawnPoint(); p.place(sp.pos, sp.yaw); this.sky.time = this.world.def.sky.startTime; }
    p.fullRestore();
    if (!fresh && s.vit) { p.hp = Math.max(20, s.vit[0]); p.energy = s.vit[1]; p.o2 = Math.max(25, s.vit[2]); }
    if (fresh) p.hp = 72;
    this.sky.uniforms.uBeam.value = s.flags.spireAwake ? 1 : 0;
    this.phase = 'play';
    this.ui.showHud(true);
    this.ui.dirty = true;
    this.audio.setAmbient(this.world.def.id);
    this.world.flora.warm(p.pos);
    this.stepOnce();
    this.busy = false;
    this.setPaused(false);
    await this.ui.fade(0, fresh ? 2200 : 800, fresh ? '#e6fdff' : '#000');
    this.ui.banner(this.world.def.name.toUpperCase(), this.world.def.subtitle);
    if (fresh) setTimeout(() => this.ui.say(QUESTS[0].say), 2500);
    this.save();
  }

  // --- frame ------------------------------------------------------------------------------------
  stepOnce() { this.update(1 / 60, true); }

  update(dt, force = false) {
    const inp = this.input;
    inp.poll();
    if (inp.consume('menu')) { if (this.ui.panel) this.ui.closePanel(); else this.ui.openPanel('menu'); }
    if (this.phase === 'play') {
      if (inp.consume('craft')) this.ui.togglePanel('craft');
      if (inp.consume('journal')) this.ui.togglePanel('journal');
      if (inp.consume('map')) { if (this.ui.panel === 'journal') this.ui.closePanel(); else this.ui.openPanel('journal', 'map'); }
    }
    this.gfx.resize();
    if (this.loadingWorld) { inp.endFrame(); return; }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    if (this.phase === 'intro' && this.intro) this.intro.update(dt);
    else if (this.phase === 'title') this.updateTitle(dt);
    else if (this.phase === 'play' && ((!this.paused && !this.busy) || force)) this.updatePlay(dt);
    if (!this.noRender) this.render(dt);
    this.ui.update(dt, this.intro ? this.intro.camera : this.camera);
    inp.endFrame();
  }

  updateTitle(dt) {
    const w = this.world;
    this.time += dt; G.uTime.value = this.time;
    resetLights();
    this.sky.update(dt * 0.25);
    G.uNight.value = this.sky.night;
    const t = this.time * 0.035;
    const b = w.base;
    this.camera.position.set(b.x + Math.sin(t) * 30 + 6, b.y + 6.5 + Math.sin(t * 0.7) * 1.5, b.z + 34 + Math.cos(t) * 8);
    this.camera.fov = this.gfx.aspect < 1 ? 80 : 58;
    this.camera.lookAt(b.x - 8, b.y + 13, b.z - 60);
    w.update(dt, this.camera.position, this.camera.position);
    w.terrain.bakeShadow(this.sky.keyDir);
    this.particles.update(dt, this.gfx.ph, this.camera.fov);
    commitLights(this.camera.position.x, this.camera.position.y, this.camera.position.z);
  }

  updatePlay(dt) {
    const w = this.world, p = this.player;
    this.time += dt; G.uTime.value = this.time;
    resetLights();
    if (w.type === 'planet') {
      this.sky.update(dt);
      G.uNight.value = this.sky.night;
      w.terrain.bakeShadow(this.sky.keyDir);
    }
    p.update(dt, this.camera);
    w.update(dt, this.camera.position, p.pos);
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      c.update(dt);
      if (c.remove) { this.scene.remove(c.group); this.creatures.splice(i, 1); if (c === this.boss) this.boss = null; }
    }
    // keep creatures from stacking
    for (let i = 0; i < this.creatures.length; i++) for (let j = i + 1; j < this.creatures.length; j++) {
      const a = this.creatures[i], b = this.creatures[j];
      if (a.dead || b.dead || a.T.kind === 'boss' || b.T.kind === 'boss') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
      if (d < m && d > 1e-3) { const k = ((m - d) / d) * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
    }
    this.spawner.update(dt);
    this.combat.update(dt);
    this._ambient(dt);
    this.particles.update(dt, this.gfx.ph, this.camera.fov);
    G.uPlayer.value.set(p.pos.x, p.pos.y, p.pos.z, 1);
    commitLights(p.pos.x, p.pos.y + 1, p.pos.z);
    this.questT -= dt;
    if (this.questT <= 0) { this.questT = 0.4; this._flags(); this.checkQuests(); }
    this.saveT += dt;
    if (this.saveT > 20) { this.saveT = 0; this.save(); }
  }

  _flags() {
    const w = this.world, s = this.state, p = this.player;
    if (w.type !== 'planet' || w.def.kind !== 'veyra') return;
    const sb = w.spireBase;
    const d = Math.hypot(p.pos.x - sb.x, p.pos.z - sb.z);
    if (d < 75 && !s.flags.reachedSpire) { s.flags.reachedSpire = true; this.ui.banner('THE SPIRE', 'It goes up past the sky'); }
    if (!s.flags.wardenDead && s.keystones >= 3 && !this.boss && d < 37 && p.pos.y > sb.y + 2) {
      this.spawnCreature('warden', sb.x, sb.y + 16, sb.z + 16, {});
      this.boss.home.set(sb.x, sb.y, sb.z);
      this.ui.banner('THE WARDEN', 'Keeper of the Spire');
      this.audio.play('boom', 0.6);
    }
  }

  _ambient(dt) {
    const w = this.world, p = this.player;
    if (w.type !== 'planet') return;
    const night = this.sky.night;
    const korr = w.def.kind === 'korr';
    const rate = korr ? 5 : 9 + night * 16;
    if (Math.random() < dt * rate) {
      const x = p.pos.x + (Math.random() - 0.5) * 46, z = p.pos.z + (Math.random() - 0.5) * 46;
      const h = w.terrain.heightAt(x, z);
      if (h > w.sea) {
        const pink = Math.random() < 0.3;
        const b = 0.5 + night * 0.9;
        if (korr) this.particles.emit(x, h + Math.random() * 3, z, 0.4, 0.1, 0.2, 5, 0.16, 0.6, 0.4, 0.3, 0, 0);
        else this.particles.emit(x, h + 0.2 + Math.random() * 2.5, z, (Math.random() - 0.5) * 0.4, 0.12 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 5 + Math.random() * 3, 0.2, pink ? b : 0.35 * b, pink ? 0.45 * b : b, pink ? 0.9 * b : 0.85 * b, -0.02, 0);
      }
    }
  }

  render(dt) {
    const gfx = this.gfx;
    const f = gfx.mFinal.uniforms;
    f.uDamage.value = this.ui.damage * 0.8 + (this.phase === 'play' && this.player.o2 <= 0 ? 0.35 : 0);
    this.warpAmt = (this.warpAmt || 0) + (((this.warp || 0) - (this.warpAmt || 0)) * Math.min(1, dt * 1.6));
    f.uWarp.value = this.warpAmt * 2.2;
    if (this.intro) { this.intro.render(gfx); gfx.adapt(dt); return; }
    const w = this.world, cam = this.camera;
    cam.aspect = gfx.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.sky.follow(cam);
    this.water.follow(cam);
    const planet = w.type === 'planet';
    f.uExposure.value = planet ? this.sky.exposure : 1.35;
    gfx.render(this.scene, cam, {
      seaY: planet && w.def.hasWater && !w.def.lava ? w.def.sea : undefined,
      sunDir: planet ? this.sky.sunDir : null,
      rayStrength: planet ? Math.max(0, 1 - this.sky.night) * 0.5 : 0,
    });
    if (!this.manual) gfx.adapt(dt);
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (this.manual || !this.ready) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      this.update(dt);
    };
    requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.save(); if (this.phase === 'play' && !this.ui.panel && !this.busy) this.ui.openPanel('menu'); } });
    window.addEventListener('pagehide', () => this.save());
  }
}
