import './ui/styles.css';
import * as THREE from 'three';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { Hub } from './game/Hub.js';
import { HOWTO } from './ui/howto.js';
import { Raid } from './game/Raid.js';
import { zoneById } from './data/zones.js';
import { def, makeItem } from './data/items.js';
import { weaponStats } from './game/weapons.js';
import {
  newProfile, loadProfile, saveProfile, clearSave, maxHealthFor, applyRaidToContracts,
} from './game/Profile.js';
import { fmtSec } from './ui/HUD.js';
import { objective, LOG } from './data/story.js';

// App shell: title → aboard the Magnolia → raid → summary → back aboard.
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

    this.state = 'title';
    this.raid = null;
    this.overlay = null;
    this.hub = new Hub(this);
    // handles for the console and for automated tests
    this.debug = { def, makeItem, weaponStats };

    this.input.onLockChange = (locked) => {
      if (this.state === 'hub') this.hub.onLockChange(locked);
      else this._lockChanged(locked);
    };
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
    this.hub.resize(w, h);
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
      this.hub.update(dt);
      this.hub.render(r);
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
    this.hub.showTitle();
    const p = this.profile;
    const o = this._overlay(`
      <div id="title">
        <div class="t-block">
          <p class="t-kicker">A Southern gothic survival game</p>
          <h1><span>the</span>Last Toll</h1>
          <p class="tag">A flooded parish, the dead, and the Living Guard: an army rebuilt on the old government's secrets that turned on everyone outside its walls. Every night it sweeps the parish, and whoever is still out there pays the toll.</p>
          <nav class="t-menu">
            ${this.hasSave ? `<button class="t-item primary" data-t="continue"><span>Continue</span><small>Day ${p.day} aboard the Magnolia</small></button><button class="t-item" data-t="new"><span>New game</span><small>Start over from the skiff</small></button>` : '<button class="t-item primary" data-t="new"><span>Begin</span><small>Wake up aboard the Magnolia</small></button>'}
            <button class="t-item" data-t="howto"><span>How to survive</span><small>Weapons, tiers, the workbench, the Guard</small></button>
          </nav>
        </div>
        <p class="t-fine">Desktop build · mouse and keyboard · headphones recommended · made to move to VR</p>
      </div>`, 'layer interactive title-layer');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      this.audio.init();
      this.audio.ui();
      if (b.dataset.t === 'continue') this.startHub();
      else if (b.dataset.t === 'new') {
        if (this.hasSave && b.dataset.confirm !== '1') {
          b.dataset.confirm = '1';
          b.querySelector('span').textContent = 'Erase your save?';
          b.querySelector('small').textContent = 'Click again to start over';
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

  // ---- aboard the Magnolia ----------------------------------------------------------

  startHub(fromRaid = false) {
    this._clearOverlay();
    this.state = 'hub';
    this.hub.board(fromRaid);
  }

  // Esc while walking the deck.
  showHubMenu() {
    const s = this.profile.settings;
    const o = this._overlay(`
      <div class="sheet pause-card">
        <h2>The Magnolia</h2>
        <p class="sub">Day ${this.profile.day}. The river's quiet tonight.</p>
        <button class="btn primary go" data-m="resume">Back on deck</button>
        <div class="settings">
          <label for="h-sens">Mouse sensitivity<input id="h-sens" type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}" data-set="sens"><span class="num">${s.sens.toFixed(2)}</span></label>
          <label for="h-vol">Volume<input id="h-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}" data-set="volume"><span class="num">${Math.round(s.volume * 100)}</span></label>
          <label for="h-fov">Field of view<input id="h-fov" type="range" min="60" max="100" step="1" value="${s.fov}" data-set="fov"><span class="num">${s.fov}</span></label>
        </div>
        <div class="pause-row"><button class="btn small" data-m="howto">How to survive</button><button class="btn small" data-m="title">Quit to title</button></div>
      </div>`);
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      this.audio.init();
      this.audio.ui();
      if (b.dataset.m === 'resume') { this._clearOverlay(); this.hub.resume(); this.input.requestLock(); }
      else if (b.dataset.m === 'howto') this._howto(() => this.showHubMenu());
      else if (b.dataset.m === 'title') { saveProfile(this.profile); this.hasSave = true; this.showTitle(); }
    });
    o.addEventListener('input', (e) => {
      const k = e.target.dataset.set;
      if (!k) return;
      const v = parseFloat(e.target.value);
      this.profile.settings[k] = v;
      this.applySettings();
      e.target.nextElementSibling.textContent = k === 'volume' ? Math.round(v * 100) : k === 'sens' ? v.toFixed(2) : String(v);
      saveProfile(this.profile);
    });
  }

  resetGame() {
    clearSave();
    this.profile = newProfile();
    saveProfile(this.profile);
    this.applySettings();
    this.hub._closePanel();
    this.startHub();
  }

  // ---- raid -----------------------------------------------------------------------

  startRaid(zoneId, seed) {
    const zone = zoneById(zoneId);
    this.input.exitLock();
    this.state = 'loading';
    this.hub.leave();
    this._overlay(`<div class="sheet pause-card"><h2>${esc(zone.name)}</h2><p class="sub">The skiff noses into the flood line…</p></div>`);
    // let the loading card paint before the (synchronous) world build
    setTimeout(() => {
      this.profile.stats.raids++;
      this.raid = new Raid(this, { zone, profile: this.profile, seed });
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
        <p class="sub">${first ? `The Guard sweeps this sector in ${fmtSec(raid.zone.sweepMinutes * 60)}. Skiffs are marked on your compass; the red mark is their mast.` : 'The dead are waiting.'}</p>
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
    // what happened out there happened, whether or not you made it back
    let storyLine = '';
    if ((out.storyEvents || []).includes('mastDown') && !p.story.mastDown) {
      p.story.mastDown = true;
      if (p.story.step === 'mast') {
        p.story.step = 'report';
        p.story.log.push({ day: p.day, step: 'report', text: LOG.report });
      }
      storyLine = survived
        ? 'The relay at Outpost 9 is down. Every herder horn in the parish has gone quiet. Hale will want to hear it from you.'
        : 'The relay at Outpost 9 came down behind you. Every herder horn in the parish has gone quiet. Somebody fished you out of the water; Hale will want to hear it from you.';
    } else if (survived) {
      const o = objective(p);
      if (o && o.where && p.story.step !== 'hale') storyLine = `${o.chapter}: ${o.text}.`;
    }
    // the night passes aboard the Magnolia
    p.day++;
    p.nourishment = Math.max(0, p.nourishment - 15);
    p.health = Math.min(maxHealthFor(p.nourishment), p.health + 25);
    p.lastResult = out.result;
    saveProfile(p);

    const haul = out.carried.map((it) => `<span>${esc(def(it.id).name)}${it.qty > 1 ? ' ×' + it.qty : ''}</span>`).join('') || '<span>Nothing</span>';
    const verdict = survived ? 'Made it back' : out.result === 'abandoned' ? 'Lost in the flood' : 'You died';
    const line = survived
      ? (out.dock && out.dock !== 'Your Skiff' ? `You push off from ${esc(out.dock)} as the dead reach the water's edge.` : 'The skiff pulls away from the landing as the dead reach the water\'s edge.')
      : out.result === 'abandoned' ? 'You dropped everything and swam for it.' : 'Whatever you carried is somewhere on the streets of the parish now.';
    this.state = 'summary';
    const o = this._overlay(`
      <div class="sheet summary">
        <p class="label">${esc(out.zoneName)} · Day ${before.day}</p>
        <h2 class="verdict ${survived ? 'ok' : 'dead'}">${verdict}</h2>
        <p class="sub">${line}</p>
        ${storyLine ? `<p class="storyline"><span>Story</span> ${esc(storyLine)}</p>` : ''}
        <div class="facts">
          <div><span class="label">Time out</span><b>${fmtSec(out.time)}</b></div>
          <div><span class="label">Put down</span><b>${out.kills}</b></div>
          <div><span class="label">Blade kills</span><b>${out.stabKills}</b></div>
          <div><span class="label">Searched</span><b>${out.searched}</b></div>
          <div><span class="label">Bites</span><b>${out.bites}</b></div>
          ${out.guardKills ? `<div><span class="label">Guardsmen</span><b>${out.guardKills}</b></div>` : ''}
          ${out.drones ? `<div><span class="label">Drones downed</span><b>${out.drones}</b></div>` : ''}
          ${out.drowned ? `<div><span class="label">Drowned</span><b>${out.drowned}</b></div>` : ''}
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
      this.startHub(true);
    });
    raid.dispose();
  }

  _endRaid() {
    this.raid = null;
  }
}

// Exposed for debugging from the console.
window.__lastToll = new App();
