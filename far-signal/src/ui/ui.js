import * as THREE from 'three';
import { ITEMS, RECIPES, STATIONS, SUITS, HEROES, NOTES, QUESTS, RESOURCE_ORDER, CONSUMABLES } from '../game/data.js';
import { QUALITY } from '../gfx/renderer.js';
import { VAULTS } from '../world/world.js';

const ICONS = {
  plate: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" fill="none" stroke="rgba(0,0,0,.35)" />',
  rock: '<path d="M5 15l2-7 6-4 6 5 1 7-5 4H8z" /><path d="M7 8l5 4 7-3M12 12l-1 8" fill="none" stroke="rgba(0,0,0,.35)" />',
  shard: '<path d="M12 2l4 8-4 12-4-12z" /><path d="M17 9l3 5-4 7 1-7zM7 9l-3 5 4 7-1-7z" opacity=".7" />',
  leaf: '<path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16z" /><path d="M5 19l10-10" fill="none" stroke="rgba(0,0,0,.4)" />',
  orb: '<circle cx="12" cy="12" r="8" /><circle cx="9.5" cy="9.5" r="2.5" fill="rgba(255,255,255,.55)" />',
  flower: '<circle cx="12" cy="6" r="3.6" /><circle cx="17.5" cy="10.5" r="3.6" /><circle cx="15.5" cy="17" r="3.6" /><circle cx="8.5" cy="17" r="3.6" /><circle cx="6.5" cy="10.5" r="3.6" /><circle cx="12" cy="12" r="2.6" fill="#fff6b0" />',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />',
  ingot: '<path d="M6 9h12l3 8H3z" /><path d="M6 9l1.5 8M18 9l-1.5 8" fill="none" stroke="rgba(0,0,0,.35)" />',
  gem: '<path d="M12 2l7 6-7 14L5 8z" /><path d="M5 8h14M12 2v20" fill="none" stroke="rgba(0,0,0,.35)" />',
  cell: '<rect x="7" y="5" width="10" height="16" rx="2" /><rect x="10" y="2.5" width="4" height="3" /><rect x="9" y="9" width="6" height="2" fill="rgba(0,0,0,.4)" />',
  vial: '<path d="M9 3h6v2l-1 1v4l4 8a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l4-8V6L9 5z" /><path d="M8 16h8" stroke="rgba(0,0,0,.4)" />',
  dash: '<path d="M3 12h9M8 7l5 5-5 5M14 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />',
  arc: '<path d="M13 2L5 13h6l-1 9 9-12h-6z" />',
  aegis: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 6v12" stroke="currentColor" stroke-width="1.5" />',
};
const icon = (name, color) => `<svg viewBox="0 0 24 24" fill="${color}" style="color:${color}">${ICONS[name] || ICONS.orb}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const QUICK = ['serumRegen', 'serumQuick', 'serumIron', 'oxycell'];
const ABIL = [
  { id: 'dash', unlock: 'dash', key: 'F', icon: 'dash', color: '#c69cff', cd: (p) => p.dashCool / 2.0 },
  { id: 'arc', unlock: 'arc', key: 'Q', icon: 'arc', color: '#8fb4ff', cd: (p) => p.arcCool / 3.5 },
  { id: 'shield', unlock: 'aegis', key: 'R', icon: 'aegis', color: '#6fd0ff', cd: (p) => p.shieldCool / 10 },
];
const CATS = [['build', 'Build'], ['gear', 'Gear'], ['suit', 'Frames'], ['serum', 'Serums'], ['supply', 'Supplies']];

export class UI {
  constructor(game, root) {
    this.game = game; this.root = root;
    const $ = (id) => root.querySelector('#' + id);
    this.el = {};
    ['hud', 'suitTag', 'hpFill', 'hpNum', 'enFill', 'enNum', 'o2Fill', 'o2Num', 'buffs', 'compass', 'objective', 'objTitle', 'objText', 'cross', 'target', 'targetName', 'targetFill',
      'prompt', 'toasts', 'say', 'banner', 'hotbar', 'touch', 'stick', 'tFire', 'tJump', 'tUse', 'floats', 'bossbar', 'bossFill', 'panel', 'panelTitle', 'panelTabs', 'panelBody',
      'title', 'btnContinue', 'btnNew', 'btnSettings', 'titleHelp', 'loading', 'loadText', 'loadFill', 'cine', 'cineText', 'cineSkip', 'cineAction', 'death', 'deathText', 'fade'].forEach((k) => { this.el[k] = $(k); });
    this.panel = null; this.tab = null; this.dirty = true;
    this.hints = {}; this.floats = []; this.damage = 0; this.sayT = 0; this.pick = {}; this.pickT = 0;
    this.slots = []; this.lastObj = ''; this.mapCache = {};
    this._v = new THREE.Vector3();
    this._bind();
    this._compass();
  }

  _bind() {
    const g = this.game, e = this.el;
    this.root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      g.audio.unlock();
      const act = b.dataset.act;
      if (act === 'close') this.closePanel();
      else if (act === 'craft') this.openPanel('craft');
      else if (act === 'journal') this.openPanel('journal');
      else if (act === 'menu') this.openPanel('menu');
      else if (act === 'tab') { this.tab = b.dataset.tab; g.audio.play('ui'); this.renderPanel(); }
      else if (act === 'make') g.craft(b.dataset.id);
      else if (act === 'set') { g.setSetting(b.dataset.k, b.dataset.v); this.renderPanel(); }
      else if (act === 'resume') this.closePanel();
      else if (act === 'quit') { this.closePanel(); g.quitToTitle(); }
      else if (act === 'slot') { g.audio.unlock(); g.input.press(b.dataset.a); }
    });
    e.panel.addEventListener('click', (ev) => { if (ev.target === e.panel) this.closePanel(); });
    e.btnNew.addEventListener('click', () => { g.audio.unlock(); g.newGame(); });
    e.btnContinue.addEventListener('click', () => { g.audio.unlock(); g.continueGame(); });
    e.btnSettings.addEventListener('click', () => { g.audio.unlock(); this.openPanel('menu', 'settings'); });
    // touch buttons
    const hold = (el, down, up, look) => {
      let id = null, lx = 0, ly = 0;
      el.addEventListener('touchstart', (ev) => { ev.preventDefault(); g.audio.unlock(); const t = ev.changedTouches[0]; id = t.identifier; lx = t.clientX; ly = t.clientY; el.classList.add('on'); down(); }, { passive: false });
      el.addEventListener('touchmove', (ev) => {
        ev.preventDefault();
        if (!look) return;
        for (const t of ev.changedTouches) if (t.identifier === id) { g.input.look.x += (t.clientX - lx) * 1.9; g.input.look.y += (t.clientY - ly) * 1.9; lx = t.clientX; ly = t.clientY; }
      }, { passive: false });
      const end = (ev) => { ev.preventDefault(); el.classList.remove('on'); id = null; up(); };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    };
    hold(e.tFire, () => g.input.hold('fire', true), () => g.input.hold('fire', false), true);
    hold(e.tJump, () => { g.input.press('jump'); g.input.hold('jump', true); }, () => g.input.hold('jump', false), true);
    hold(e.tUse, () => g.input.press('interact'), () => {}, false);
  }

  _compass() {
    const c = this.el.compass;
    this.ticks = [];
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = 0; d < 360; d += 15) {
      const t = document.createElement('div');
      t.className = 'tick' + (d % 90 === 0 ? ' major' : '');
      t.textContent = names[d] || '·';
      c.appendChild(t);
      this.ticks.push({ el: t, deg: d });
    }
    this.mkQuest = document.createElement('div'); this.mkQuest.className = 'mk'; c.appendChild(this.mkQuest);
    this.mkCamp = document.createElement('div'); this.mkCamp.className = 'mk camp'; c.appendChild(this.mkCamp);
  }

  setTouch(on) {
    document.body.classList.toggle('touch', on);
    this.el.touch.hidden = !on;
    this.touch = on;
  }

  // --- screens ---------------------------------------------------------------------
  loading(on, text, pct) {
    this.el.loading.hidden = !on;
    if (text) this.el.loadText.textContent = text;
    if (pct !== undefined) this.el.loadFill.style.width = Math.round(pct * 100) + '%';
  }

  showTitle(hasSave) {
    const e = this.el;
    e.title.hidden = false; e.hud.hidden = true;
    e.btnContinue.hidden = !hasSave;
    e.btnNew.classList.toggle('primary', !hasSave);
    e.titleHelp.textContent = this.touch ? 'Left thumb moves. Right thumb looks. Turn your phone sideways for the widest view.' : 'WASD move · Mouse look · Click fire and mine · Space jump · E interact · Tab craft';
  }
  hideTitle() { this.el.title.hidden = true; }
  showHud(on) { this.el.hud.hidden = !on; }

  fade(to, ms = 600, color = '#000') {
    const f = this.el.fade;
    f.style.background = color;
    f.style.transitionDuration = ms + 'ms';
    void f.offsetWidth;
    f.style.opacity = to;
    return new Promise((r) => setTimeout(r, ms + 30));
  }

  banner(title, sub) {
    const b = this.el.banner;
    b.hidden = true; void b.offsetWidth;
    b.querySelector('.bt').textContent = title;
    b.querySelector('.bs').textContent = sub || '';
    b.hidden = false;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { b.hidden = true; }, 5200);
  }

  cine(on) { this.el.cine.hidden = !on; }
  cineText(text, big = false) {
    const t = this.el.cineText;
    t.style.opacity = 0;
    clearTimeout(this._ct);
    this._ct = setTimeout(() => { t.textContent = text; t.classList.toggle('big', big); t.style.opacity = text ? 1 : 0; }, text ? 350 : 0);
  }
  cineAction(label, fn) {
    const b = this.el.cineAction;
    if (!label) { b.hidden = true; return; }
    b.textContent = label; b.hidden = false;
    b.onclick = () => { this.game.audio.unlock(); b.hidden = true; fn(); };
  }

  death(text) {
    this.el.deathText.textContent = text;
    this.el.death.hidden = false;
  }
  hideDeath() { this.el.death.hidden = true; }

  // --- messages -----------------------------------------------------------------------
  toast(text, kind = '', color) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = (color ? `<i class="ic" style="background:${color}"></i>` : '') + esc(text);
    const box = this.el.toasts;
    box.appendChild(t);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4100);
    return t;
  }

  hint(key, text) {
    const now = performance.now();
    if (this.hints[key] && now - this.hints[key] < 7000) return;
    this.hints[key] = now;
    this.toast(text, 'warn');
  }

  pickup(item, n) {
    const p = this.pick[item];
    const total = this.game.state.inv[item] || 0;
    if (p && p.el.isConnected && performance.now() - p.t < 2500) {
      p.n += n; p.t = performance.now();
      p.el.lastChild.textContent = `+${p.n} ${ITEMS[item].name}  (${total})`;
    } else {
      const el = this.toast(`+${n} ${ITEMS[item].name}  (${total})`, 'good', ITEMS[item].color);
      this.pick[item] = { el, n, t: performance.now() };
    }
    this.dirty = true;
  }

  say(text) {
    const s = this.el.say;
    s.hidden = true; void s.offsetWidth;
    s.textContent = text;
    s.hidden = false;
    this.sayT = 3.5 + text.length * 0.055;
  }

  floatText(pos, text, color = '#fff') {
    if (this.floats.length > 14) { const o = this.floats.shift(); o.el.remove(); }
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    this.el.floats.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0 });
  }

  hurt(n) { this.damage = Math.min(1, this.damage + 0.25 + n * 0.02); }

  // --- panels ---------------------------------------------------------------------------
  openPanel(name, tab) {
    const g = this.game;
    if (g.phase === 'intro' || g.busy) return;
    if (g.phase === 'title' && name !== 'menu') return;
    this.panel = name;
    this.tab = tab || (name === 'craft' ? this._bestCraftTab() : name === 'journal' ? 'objectives' : g.phase === 'title' ? 'settings' : 'menu');
    this.el.panel.hidden = false;
    g.setPaused(true);
    g.audio.play('ui');
    this.renderPanel();
  }

  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    this.el.panel.hidden = true;
    this.game.setPaused(false);
  }

  togglePanel(name) { if (this.panel === name) this.closePanel(); else { if (this.panel) this.closePanel(); this.openPanel(name); } }

  _bestCraftTab() {
    const g = this.game;
    for (const [cat] of CATS) if (RECIPES.some((r) => r.cat === cat && g.recipeState(r).can)) return cat;
    return 'build';
  }

  renderPanel() {
    if (!this.panel) return;
    const e = this.el;
    const tabs = (list) => { e.panelTabs.innerHTML = list.map(([id, label, dot]) => `<button class="ptab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`).join(''); };
    const g = this.game;
    const top = e.panelBody.scrollTop;
    if (this.panel === 'craft') {
      e.panelTitle.textContent = 'CRAFT';
      tabs(CATS.map(([id, label]) => [id, label, RECIPES.some((r) => r.cat === id && g.recipeState(r).can)]));
      e.panelBody.innerHTML = this._craftHTML();
    } else if (this.panel === 'journal') {
      e.panelTitle.textContent = 'FIELD LOG';
      tabs([['objectives', 'Objectives'], ['notes', 'Notes'], ['map', 'Map']]);
      if (this.tab === 'objectives') e.panelBody.innerHTML = this._questHTML();
      else if (this.tab === 'notes') e.panelBody.innerHTML = this._notesHTML();
      else { e.panelBody.innerHTML = this._mapHTML(); this._drawMap(); }
    } else {
      e.panelTitle.textContent = g.phase === 'title' ? 'SETTINGS' : 'PAUSED';
      tabs(g.phase === 'title' ? [['settings', 'Settings'], ['controls', 'Controls']] : [['menu', 'Game'], ['settings', 'Settings'], ['controls', 'Controls']]);
      e.panelBody.innerHTML = this._menuHTML();
    }
    e.panelBody.scrollTop = this._lastPanel === this.panel + this.tab ? top : 0;
    this._lastPanel = this.panel + this.tab;
  }

  _chip(id, have, need) {
    const it = ITEMS[id];
    const short = need !== undefined && have < need;
    return `<span class="chip${short ? ' short' : ''}${need === undefined && !have ? ' zero' : ''}">${icon(it.icon, it.color)}<span>${esc(it.name)}</span><b>${need !== undefined ? have + '/' + need : have}</b></span>`;
  }

  _craftHTML() {
    const g = this.game, s = g.state;
    let inv = '<div class="inv">';
    let any = false;
    for (const id of [...RESOURCE_ORDER, ...CONSUMABLES]) { const n = s.inv[id] || 0; if (n > 0) { inv += this._chip(id, n); any = true; } }
    if (!any) inv += '<span class="chip zero">Nothing carried yet</span>';
    inv += '</div>';
    const list = RECIPES.filter((r) => r.cat === this.tab && g.recipeState(r).visible);
    if (!list.length) return inv + '<div class="empty">Nothing to make here yet. Keep exploring.</div>';
    let html = inv + '<div class="recipes">';
    for (const r of list) {
      const st = g.recipeState(r);
      const hero = r.hero ? HEROES[r.hero] : null;
      html += `<div class="rcp${st.can ? ' can' : ''}${st.done ? ' done' : ''}">`;
      if (hero) html += `<div class="hero" style="color:${hero.color}">From ${esc(hero.name)} · ${esc(hero.role)}</div>`;
      html += `<h3>${esc(r.name)}</h3><p>${esc(r.desc)}</p>`;
      if (r.note && !st.done) html += `<p class="note">${esc(r.note)}</p>`;
      html += '<div class="cost">' + Object.keys(r.cost).map((k) => this._chip(k, s.inv[k] || 0, r.cost[k])).join('') + '</div>';
      const where = st.done ? 'Done' : st.why || (r.station ? 'At the ' + STATIONS[r.station].name : r.cat === 'build' ? 'Built at camp' : 'Made by hand');
      html += `<div class="foot"><span class="where${st.why ? ' miss' : ''}">${esc(where)}</span><button class="cbtn" data-act="make" data-id="${r.id}"${st.can ? '' : ' disabled'}>${st.done ? 'Built' : r.cat === 'build' ? 'Build' : 'Make'}</button></div></div>`;
    }
    return html + '</div>';
  }

  _questHTML() {
    const s = this.game.state;
    let html = '<div class="qlist">';
    for (let i = Math.max(0, s.quest - 6); i <= s.quest && i < QUESTS.length; i++) {
      const q = QUESTS[i], cur = i === s.quest;
      const cnt = cur && q.count ? q.count(s) : null;
      html += `<div class="qrow${cur ? ' cur' : ''}"><span class="mark">${cur ? '▸' : '✓'}</span><span>${esc(q.text)}${cnt ? ` (${cnt[0]}/${cnt[1]})` : ''}</span></div>`;
    }
    html += '</div>';
    const suit = SUITS[s.suit];
    html += `<div class="notes" style="margin-top:18px"><div class="notecard"><h3>${esc(suit.name)}</h3><p>${esc(suit.blurb)} Health ${suit.hp}, power ${suit.energy}, air ${suit.o2}, armor ${Math.round(suit.armor * 100)}%.</p></div>`;
    html += `<div class="notecard"><h3>KEYSTONES</h3><p>${s.keystones} of 3 recovered.</p></div></div>`;
    return html;
  }

  _notesHTML() {
    const s = this.game.state;
    let html = '<div class="notes">';
    for (const id of [...s.notes].reverse()) {
      if (id.startsWith('r:')) {
        const r = RECIPES.find((x) => x.id === id.slice(2));
        if (!r || !r.note) continue;
        const h = r.hero ? HEROES[r.hero] : null;
        html += `<div class="notecard"><div class="by"${h ? ` style="color:${h.color}"` : ''}>${h ? esc(h.name + ' · ' + h.role) : 'Workshop'}</div><h3>${esc(r.name.toUpperCase())}</h3><p>${esc(r.note)}</p></div>`;
      } else if (NOTES[id]) html += `<div class="notecard"><h3>${esc(NOTES[id].title.toUpperCase())}</h3><p>${esc(NOTES[id].text)}</p></div>`;
    }
    return html + '</div>';
  }

  _mapHTML() {
    const w = this.game.world;
    if (!w || w.type !== 'planet') return '<div class="empty">No survey data inside the vault.</div>';
    return `<div class="mapwrap"><canvas id="mapCanvas" width="640" height="640"></canvas><div class="legend"><span><i style="background:#fff"></i>You</span><span><i style="background:#54e6e0"></i>Camp</span><span><i style="background:#ffb35a"></i>Objective</span><span><i style="background:#c69cff"></i>Vault</span><span><i style="background:#ffe9a8"></i>Spire</span></div></div>`;
  }

  _drawMap() {
    const g = this.game, w = g.world;
    const cv = this.el.panelBody.querySelector('#mapCanvas');
    if (!cv || !w || w.type !== 'planet') return;
    const key = w.def.id;
    if (!this.mapCache[key]) {
      const N = 320, d = w.terrain.data, img = new ImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const ix = Math.min(d.N - 1, Math.round((x / (N - 1)) * (d.N - 1))), iz = Math.min(d.N - 1, Math.round((y / (N - 1)) * (d.N - 1)));
        const i = iz * d.N + ix, h = d.heights[i];
        const c = d.splat[i * 4] / 255, e = d.splat[i * 4 + 1] / 255, m = d.splat[i * 4 + 2] / 255, b = Math.max(0, 1 - c - e - m);
        const sh = (d.norm[i * 4] / 255 - 0.5) * 1.6 + 0.85;
        let r, gg, bl;
        if (w.def.kind === 'korr') { r = 70 + m * 40 + e * 60; gg = 52 + m * 30 + e * 50 + c * 20; bl = 48 + m * 40 + c * 90; if (h < w.sea) { r = 255; gg = 110; bl = 20; } }
        else { r = b * 96 + c * 46 + e * 190 + m * 86; gg = b * 62 + c * 60 + e * 104 + m * 100; bl = b * 96 + c * 130 + e * 56 + m * 140; if (h < w.sea) { const dp = Math.min(1, (w.sea - h) / 20); r = 22 - dp * 12; gg = 70 - dp * 40; bl = 110 - dp * 50; } }
        const k = h < w.sea ? 1 : sh * (0.8 + Math.min(0.5, h / 300));
        const o = (y * N + x) * 4;
        img.data[o] = Math.min(255, r * k); img.data[o + 1] = Math.min(255, gg * k); img.data[o + 2] = Math.min(255, bl * k); img.data[o + 3] = 255;
      }
      const off = document.createElement('canvas'); off.width = off.height = N;
      off.getContext('2d').putImageData(img, 0, 0);
      this.mapCache[key] = off;
    }
    const ctx = cv.getContext('2d'), S = cv.width;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapCache[key], 0, 0, S, S);
    const P = (x, z) => [((x + w.terrain.half) / w.terrain.size) * S, ((z + w.terrain.half) / w.terrain.size) * S];
    const diamond = (x, z, color, size = 7, label) => {
      const [px, py] = P(x, z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color; ctx.strokeStyle = '#05060f'; ctx.lineWidth = 2;
      ctx.fillRect(-size / 2, -size / 2, size, size); ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      if (label) { ctx.font = '600 13px Rajdhani, sans-serif'; ctx.fillStyle = '#e6f4f6'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.strokeText(label, px + 9, py + 4); ctx.fillText(label, px + 9, py + 4); }
    };
    diamond(w.base.x, w.base.z, '#54e6e0', 9, 'Camp');
    if (w.def.kind === 'veyra') {
      for (const id in VAULTS) { const p = w.def.pois[VAULTS[id].poi]; diamond(p.x, p.z, '#c69cff', 8, VAULTS[id].name.replace('Vault of ', '')); }
      const sp = w.def.pois.spire; diamond(sp.x, sp.z, '#ffe9a8', 10, 'Spire');
    }
    const mk = g.questMarker();
    if (mk) diamond(mk.x, mk.z, '#ffb35a', 11);
    const [px, py] = P(g.player.pos.x, g.player.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-g.player.camYaw);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#05060f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  _menuHTML() {
    const g = this.game, st = g.settings;
    if (this.tab === 'controls') {
      return `<div class="menu controls">
        <p><b>Keyboard and mouse</b><br><kbd>W A S D</kbd> move · <kbd>Mouse</kbd> look · <kbd>Left click</kbd> fire, or mine when the ring appears · <kbd>Space</kbd> jump, again in the air with Grav Boots, hold to fly with the Mk III frame · <kbd>Shift</kbd> sprint · <kbd>E</kbd> interact · <kbd>F</kbd> Phase Dash · <kbd>Q</kbd> Arc Caster · <kbd>R</kbd> Aegis Barrier · <kbd>1-4</kbd> serums and Oxy-Cells · <kbd>Tab</kbd> craft · <kbd>J</kbd> log · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</p>
        <p><b>Touch</b><br>Left thumb steers; push to the edge to sprint. Drag anywhere on the right to look. Hold FIRE to shoot or mine and keep dragging to aim. Ability and serum buttons sit above FIRE once you have built them.</p>
        <p><b>Surviving</b><br>Air drains away from camp. Mine by aiming at a deposit until the ring appears, then hold fire. Everything you build stands at camp, and camp is safe ground.</p></div>`;
    }
    if (this.tab === 'settings') {
      const seg = (k, opts) => `<div class="seg">${opts.map(([v, label]) => `<button data-act="set" data-k="${k}" data-v="${v}" class="${String(st[k]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
      return `<div class="menu">
        <div class="setrow"><label>Graphics</label>${seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div>
        <div class="setrow"><label>Look speed</label>${seg('sens', [[0.6, 'Slow'], [1, 'Normal'], [1.5, 'Fast'], [2.1, 'Faster']])}</div>
        <div class="setrow"><label>Invert look</label>${seg('invertY', [[false, 'Off'], [true, 'On']])}</div>
        <div class="setrow"><label>Sound</label>${seg('volume', [[0, 'Off'], [0.4, 'Low'], [0.8, 'Full']])}</div>
        <p class="controls">Graphics: ${esc(QUALITY[g.gfx.qualityKey].name)}. Resolution adapts on its own to hold a steady frame rate.</p></div>`;
    }
    return `<div class="menu">
      <button class="mbtn primary" data-act="resume">Resume</button>
      <button class="mbtn" data-act="tab" data-tab="settings">Settings</button>
      <button class="mbtn" data-act="tab" data-tab="controls">Controls</button>
      <button class="mbtn ghost" data-act="quit">Save and quit to title</button>
      <p class="controls">Progress saves on this device as you play.</p></div>`;
  }

  // --- per-frame HUD ---------------------------------------------------------------------
  _hotbar() {
    const g = this.game, s = g.state;
    let html = '';
    this.slots = [];
    for (const a of ABIL) {
      if (!s.unlocks[a.unlock]) continue;
      html += `<button class="slot" data-act="slot" data-a="${a.id}" data-s="${a.id}">${icon(a.icon, a.color)}<span class="key">${a.key}</span><i class="cd"></i></button>`;
    }
    let first = true;
    QUICK.forEach((id, i) => {
      const n = s.inv[id] || 0;
      if (!n) return;
      if (first && html) html += '<i class="slot gap"></i>';
      first = false;
      html += `<button class="slot ready" data-act="slot" data-a="use${i + 1}">${icon(ITEMS[id].icon, ITEMS[id].color)}<span class="key">${i + 1}</span><span class="cnt">${n}</span></button>`;
    });
    this.el.hotbar.innerHTML = html;
    for (const a of ABIL) { const el = this.el.hotbar.querySelector(`[data-s="${a.id}"]`); if (el) this.slots.push({ a, el, cd: el.querySelector('.cd') }); }
  }

  update(dt, camera) {
    const g = this.game, e = this.el;
    this.damage = Math.max(0, this.damage - dt * 1.4);
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) e.say.hidden = true; }
    // floating combat numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 0.9) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const v = this._v.copy(f.pos); v.y += f.t * 1.6; v.project(camera);
      if (v.z > 1) { f.el.style.opacity = 0; continue; }
      f.el.style.transform = `translate(-50%,-50%) translate(${((v.x * 0.5 + 0.5) * g.gfx.cssW).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * g.gfx.cssH).toFixed(1)}px)`;
      f.el.style.opacity = 1 - f.t / 0.9;
    }
    if (g.phase !== 'play' || e.hud.hidden) return;
    const p = g.player, S = p.stats, s = g.state;
    const bar = (fill, num, v, max, wrap) => {
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, v / max)).toFixed(3)})`;
      const t = String(Math.ceil(v)); if (num.textContent !== t) num.textContent = t;
      if (wrap) wrap.classList.toggle('low', v / max < 0.22);
    };
    bar(e.hpFill, e.hpNum, p.hp, S.hp, e.hpFill.closest('.bar'));
    bar(e.enFill, e.enNum, p.energy, S.energy);
    bar(e.o2Fill, e.o2Num, p.o2, S.o2, e.o2Fill.closest('.bar'));
    this._acc = (this._acc || 0) + dt;
    if (this.dirty || this._acc > 0.25) {
      this._acc = 0;
      if (this.dirty) { this._hotbar(); if (this.panel === 'craft') this.renderPanel(); }
      this.dirty = false;
      e.suitTag.textContent = S.short + ' · ' + S.name.replace(/^Mk [IV]+ /, '').toUpperCase();
      let bf = '';
      if (p.buffs.regen > 0) bf += `<span class="buff" style="color:#9dfca8">REGEN ${Math.ceil(p.buffs.regen)}</span>`;
      if (p.buffs.quick > 0) bf += `<span class="buff" style="color:#8fb4ff">QUICK ${Math.ceil(p.buffs.quick)}</span>`;
      if (p.buffs.iron > 0) bf += `<span class="buff" style="color:#ffb35a">IRON ${Math.ceil(p.buffs.iron)}</span>`;
      if (p.shieldT > 0) bf += `<span class="buff" style="color:#6fd0ff">AEGIS ${Math.ceil(p.shieldT)}</span>`;
      if (e.buffs.innerHTML !== bf) e.buffs.innerHTML = bf;
      // objective
      const q = QUESTS[s.quest];
      const cnt = q.count ? q.count(s) : null;
      const mk = g.questMarker();
      const dist = mk ? Math.round(Math.hypot(mk.x - p.pos.x, mk.z - p.pos.z)) : 0;
      const txt = q.title + '|' + q.text + (cnt ? cnt.join('/') : '') + (dist > 25 ? dist : '');
      if (txt !== this.lastObj) {
        this.lastObj = txt;
        e.objTitle.textContent = q.title;
        e.objText.innerHTML = esc(q.text) + (cnt ? `<em>${cnt[0]}/${cnt[1]}</em>` : '') + (dist > 25 ? `<div class="dist">${dist} m</div>` : '');
      }
      const craftable = RECIPES.some((r) => g.recipeState(r).can && (r.cat === 'build' || r.cat === 'gear' || r.cat === 'suit'));
      this.root.querySelector('[data-act="craft"]').classList.toggle('attn', craftable);
    }
    for (const sl of this.slots) {
      const k = Math.max(0, Math.min(1, sl.a.cd(p)));
      sl.cd.style.height = (k * 100).toFixed(0) + '%';
      sl.el.classList.toggle('ready', k <= 0);
    }
    // compass
    const W = e.compass.clientWidth, span = 110;
    const heading = (((-p.camYaw * 180) / Math.PI) % 360 + 360) % 360;
    const place = (el, deg, clamp) => {
      let d = ((deg - heading + 540) % 360) - 180;
      if (clamp) d = Math.max(-span / 2 + 4, Math.min(span / 2 - 4, d));
      const vis = Math.abs(d) <= span / 2;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.left = ((d / span + 0.5) * W).toFixed(1) + 'px';
    };
    for (const t of this.ticks) place(t.el, t.deg);
    const bearing = (x, z) => ((Math.atan2(x - p.pos.x, -(z - p.pos.z)) * 180) / Math.PI + 360) % 360;
    const mk = g.questMarker();
    if (mk) { this.mkQuest.style.visibility = ''; place(this.mkQuest, bearing(mk.x, mk.z), true); } else this.mkQuest.style.visibility = 'hidden';
    const w = g.world;
    if (w.type === 'planet' && Math.hypot(w.base.x - p.pos.x, w.base.z - p.pos.z) > 40) { this.mkCamp.style.visibility = ''; place(this.mkCamp, bearing(w.base.x, w.base.z), true); } else this.mkCamp.style.visibility = 'hidden';
    // crosshair, target, prompt
    const tc = p.targetCreature, tn = p.targetNode;
    e.cross.className = 'cross' + (tn ? ' node' : tc ? ' enemy' : '');
    if (tc && !tc.dead) {
      e.target.hidden = false;
      if (e.targetName.textContent !== tc.T.name) e.targetName.textContent = tc.T.name;
      e.targetFill.style.transform = `scaleX(${Math.max(0, tc.hp / tc.maxHp).toFixed(3)})`;
    } else if (tn) {
      e.target.hidden = false;
      if (e.targetName.textContent !== tn.T.label) e.targetName.textContent = tn.T.label;
      e.targetFill.style.transform = `scaleX(${Math.max(0, tn.hp / tn.T.hp).toFixed(3)})`;
    } else e.target.hidden = true;
    const pr = p.prompt;
    if (pr && !p.dead) {
      const html = `<kbd>E</kbd>${esc(pr.label)}`;
      if (this._pr !== html) { this._pr = html; e.prompt.innerHTML = html; }
      e.prompt.hidden = false;
      e.tUse.hidden = !this.touch;
    } else { e.prompt.hidden = true; e.tUse.hidden = true; this._pr = ''; }
    // touch stick visual
    if (this.touch) {
      const tm = g.input.touchMove, st = e.stick;
      if (tm.active) { st.style.left = tm.ox + 'px'; st.style.top = tm.oy + 'px'; st.style.bottom = 'auto'; st.firstElementChild.style.transform = `translate(${(tm.x * 40).toFixed(0)}px,${(-tm.y * 40).toFixed(0)}px)`; st.style.opacity = 1; }
      else { st.style.left = ''; st.style.top = ''; st.style.bottom = ''; st.firstElementChild.style.transform = ''; st.style.opacity = ''; }
    }
    // boss bar
    const boss = g.boss;
    if (boss && !boss.dead) { e.bossbar.hidden = false; e.bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp).toFixed(3)})`; e.target.hidden = true; }
    else e.bossbar.hidden = true;
  }
}
