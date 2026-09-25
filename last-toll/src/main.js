import './ui/styles.css';
import * as THREE from 'three';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { HubScene } from './scenes/HubScene.js';
import { HubUI, HOWTO } from './ui/HubUI.js';
import { Raid } from './game/Raid.js';
import { zoneById } from './data/zones.js';
import { def } from './data/items.js';
import {
  newProfile, loadProfile, saveProfile, clearSave, maxHealthFor, applyRaidToContracts, refreshContracts,
} from './game/Profile.js';
import { fmtSec } from './ui/HUD.js';

// App shell: title → hub (the Magnolia) → raid → summary → hub.
// Everything renders into one WebGL canvas with DOM overlays for UI.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

class App {
  constructor() {
    this.root = document.getElementById('app');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.autoClear = false;
    renderer.domElement.className = 'game';
    this.root.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'layer';
    this.root.appendChild(this.uiRoot);

    this.input = new Input(renderer.domElement);
    this.audio = new Audio();
    this.profile = loadProfile();
    this.hasSave = !!this.profile;
    if (!this.profile) this.profile = newProfile();
    this.applySettings();

    this.hubScene = new HubScene();
    this.state = 'title';
    this.raid = null;
    this.hubUI = null;
    this.overlay = null;

    this.input.onLockChange = (locked) => this._lockChanged(locked);
    window.addEventListener('resize', () => this._resize());
    this.input.onKey = (e) => {
      if (this.state === 'raid' && this.raid && this.raid.uiOpen && e.code === 'Escape') this.raid.toggleInventory(false);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'raid' && this.raid && !this.raid.ended) this._showPause();
    });

    this.showTitle();
    this.last = performance.now();
    renderer.setAnimationLoop(() => this._tick());
  }

  applySettings() {
    const s = this.profile.settings;
    this.input.sensitivity = s.sens;
    this.audio.setVolume(s.volume);
    if (this.raid) {
      this.raid.baseFov = s.fov;
    }
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.hubScene.resize(w, h);
    if (this.raid) this.raid.onResize(w, h);
  }

  _tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const r = this.renderer;
    r.clear();
    if (this.state === 'raid' && this.raid) {
      this.raid.update(dt);
      if (this.raid) this.raid.render(r);
    } else {
      this.hubScene.update(dt);
      this.hubScene.render(r);
    }
    this.input.endFrame();
  }

  _clearOverlay() {
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }

  _overlay(html, cls = 'overlay') {
    this._clearOverlay();
    const o = document.createElement('div');
    o.className = cls;
    o.innerHTML = html;
    this.uiRoot.appendChild(o);
    this.overlay = o;
    return o;
  }

  // ---- title --------------------------------------------------------------------

  showTitle() {
    this.state = 'title';
    const p = this.profile;
    const o = this._overlay(`
      <div id="title">
        <h1><span>the</span>Last Toll</h1>
        <p class="tag">A flooded parish. A bell that wakes the dead. Scavenge what you can and get back to the water before it rings.</p>
        <div class="acts">
          ${this.hasSave ? `<button class="btn primary go" data-t="continue">Continue · Day ${p.day}</button><button class="btn go" data-t="new">New game</button>` : '<button class="btn primary go" data-t="new">Begin</button>'}
          <button class="btn go" data-t="howto">How to play</button>
        </div>
        <p class="fine">Desktop build · mouse and keyboard · headphones recommended. Built to move to VR (WebXR) next.</p>
      </div>`, 'layer interactive');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      this.audio.init();
      this.audio.ui();
      if (b.dataset.t === 'continue') this.startHub();
      else if (b.dataset.t === 'new') {
        if (this.hasSave && b.dataset.confirm !== '1') {
          b.dataset.confirm = '1';
          b.textContent = 'Erase your save?';
          return;
        }
        clearSave();
        this.profile = newProfile();
        this.hasSave = true;
        saveProfile(this.profile);
        this.applySettings();
        this.startHub();
      } else if (b.dataset.t === 'howto') this._howto(() => this.showTitle());
    });
  }

  _howto(back) {
    const o = this._overlay(`<div class="sheet"><div class="sheet-head"><div><h2>How to survive</h2><p class="sub">Plays like a VR survival game, on a mouse and keyboard.</p></div><button class="btn" data-t="back">Back</button></div>${HOWTO}</div>`);
    o.addEventListener('click', (e) => {
      if (e.target.closest('[data-t="back"]') || e.target === o) back();
    });
  }

  // ---- hub ------------------------------------------------------------------------

  startHub() {
    this._clearOverlay();
    this.state = 'hub';
    this.input.exitLock();
    refreshContracts(this.profile);
    saveProfile(this.profile);
    if (this.hubUI) this.hubUI.dispose();
    this.hubUI = new HubUI(this.uiRoot, this);
  }

  resetGame() {
    clearSave();
    this.profile = newProfile();
    saveProfile(this.profile);
    this.applySettings();
    this.startHub();
  }

  // ---- raid -----------------------------------------------------------------------

  startRaid(zoneId) {
    const zone = zoneById(zoneId);
    if (this.hubUI) { this.hubUI.dispose(); this.hubUI = null; }
    this._overlay(`<div class="sheet pause-card"><h2>${esc(zone.name)}</h2><p class="sub">The skiff noses into the flood line…</p></div>`);
    // let the loading card paint before the (synchronous) world build
    setTimeout(() => {
      this.profile.stats.raids++;
      this.raid = new Raid(this, { zone, profile: this.profile });
      this.raid.start();
      this.state = 'raid';
      this.raid.setPaused(true);
      this._showPause(true);
    }, 40);
  }

  _lockChanged(locked) {
    if (this.state !== 'raid' || !this.raid || this.raid.ended) return;
    if (locked) {
      this._clearOverlay();
      this.raid.setPaused(false);
      this.audio.init();
    } else if (!this.raid.uiOpen) {
      this._showPause();
    }
  }

  _showPause(first = false) {
    const raid = this.raid;
    if (!raid || raid.ended) return;
    raid.setPaused(true);
    if (raid.uiOpen) raid.toggleInventory(false);
    const s = this.profile.settings;
    const o = this._overlay(`
      <div class="sheet pause-card">
        <h2>${first ? esc(raid.zone.name) : 'Paused'}</h2>
        <p class="sub">${first ? `The bell tolls in ${fmtSec(raid.zone.tollMinutes * 60)}. Skiffs are marked on your compass.` : 'The dead are waiting.'}</p>
        <div class="keys">
          <span class="key">Mouse L</span><span>Swing / stab — hold to wind up · fire</span>
          <span class="key">Q</span><span>Grab by the collar, then stab · <span class="key">V</span> shove</span>
          <span class="key">R</span><span>Reload one step (hold for all)</span>
          <span class="key">E</span><span>Search · take · <span class="key">Tab</span> backpack · <span class="key">M</span> map</span>
          <span class="key">F</span><span>Flashlight · <span class="key">H</span> heal · <span class="key">C</span> crouch</span>
        </div>
        <button class="btn primary go" data-p="resume">${first ? 'Click to begin' : 'Resume'}</button>
        <div class="settings">
          <label for="p-sens">Mouse sensitivity<input id="p-sens" type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}" data-set="sens"><span class="num">${s.sens.toFixed(2)}</span></label>
          <label for="p-vol">Volume<input id="p-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume"><span class="num">${Math.round(s.volume * 100)}</span></label>
        </div>
        ${first ? '' : '<button class="btn danger small" data-p="abandon">Abandon the trip (lose what you carry)</button>'}
        <p class="fine lock-err" style="color:#e39a90;display:none">Your browser blocked mouse capture. Click again.</p>
      </div>`);
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      this.audio.init();
      if (b.dataset.p === 'resume') this.input.requestLock();
      else if (b.dataset.p === 'abandon') {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Click again to abandon'; return; }
        this._clearOverlay();
        raid.finish('abandoned');
      }
    });
    o.addEventListener('input', (e) => {
      const k = e.target.dataset.set;
      if (!k) return;
      const v = parseFloat(e.target.value);
      this.profile.settings[k] = v;
      this.applySettings();
      e.target.nextElementSibling.textContent = k === 'volume' ? Math.round(v * 100) : v.toFixed(2);
      saveProfile(this.profile);
    });
  }

  onRaidEnd(out) {
    const p = this.profile;
    const raid = this.raid;
    this.input.exitLock();
    const survived = out.result === 'extracted';
    const before = { day: p.day };
    if (survived) {
      p.stats.extracted++;
      p.loadout = out.loadout;
      p.backpack = out.backpack;
      p.health = out.health;
      p.battery = out.battery;
      p.stats.kills += out.kills;
      p.stats.stabKills += out.stabKills;
      p.stats.headKills += out.headKills;
      applyRaidToContracts(p, out);
    } else {
      p.stats.deaths++;
      p.loadout = { knife: null, melee: null, sidearm: null, long: null };
      p.backpack = [];
      p.health = maxHealthFor(p.nourishment) * 0.5;
      p.battery = 100;
    }
    p.nourishment = Math.max(0, Math.min(100, p.nourishment + out.nourishGain));
    // the night passes aboard the Magnolia
    p.day++;
    p.nourishment = Math.max(0, p.nourishment - 15);
    p.health = Math.min(maxHealthFor(p.nourishment), p.health + 25);
    p.lastResult = out.result;
    saveProfile(p);

    const haul = out.carried.map((it) => `<span>${esc(def(it.id).name)}${it.qty > 1 ? ' ×' + it.qty : ''}</span>`).join('') || '<span>Nothing</span>';
    const verdict = survived ? 'Made it back' : out.result === 'abandoned' ? 'Lost in the flood' : 'You died';
    const line = survived
      ? `The skiff pulls away from ${esc(out.dock || 'the dock')} as the dead reach the water's edge.`
      : out.result === 'abandoned' ? 'You dropped everything and swam for it.' : 'Whatever you carried is somewhere on the streets of the parish now.';
    this.state = 'summary';
    const o = this._overlay(`
      <div class="sheet summary">
        <p class="label">${esc(out.zoneName)} · Day ${before.day}</p>
        <h2 class="verdict ${survived ? 'ok' : 'dead'}">${verdict}</h2>
        <p class="sub">${line}</p>
        <div class="facts">
          <div><span class="label">Time out</span><b>${fmtSec(out.time)}</b></div>
          <div><span class="label">Put down</span><b>${out.kills}</b></div>
          <div><span class="label">Blade kills</span><b>${out.stabKills}</b></div>
          <div><span class="label">Searched</span><b>${out.searched}</b></div>
          <div><span class="label">Bites</span><b>${out.bites}</b></div>
        </div>
        <h3>${survived ? 'Brought home' : 'Lost'}</h3>
        <div class="haul">${haul}</div>
        <p class="sub" style="margin-top:18px">You sleep aboard the Magnolia. Day ${p.day} — nourishment ${Math.round(p.nourishment)}, health ${Math.ceil(p.health)}/${maxHealthFor(p.nourishment)}.</p>
        <div style="margin-top:18px"><button class="btn primary go" data-s="back">Back to the Magnolia</button></div>
      </div>`);
    o.addEventListener('click', (e) => {
      if (!e.target.closest('[data-s]')) return;
      this.audio.ui();
      this._endRaid();
      this.startHub();
    });
    raid.dispose();
  }

  _endRaid() {
    this.raid = null;
  }
}

// Exposed for debugging from the console.
window.__lastToll = new App();
