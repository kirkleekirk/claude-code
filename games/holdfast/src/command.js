// Command view: your group from above, built for phones. Tap the ground to
// move, tap the dead or raiders to fight, tap a container or door to use it,
// tap a person to talk or give orders. Drag to pan, pinch to zoom, twist with
// two fingers to turn. Everything else (claim flag, building, camp, map,
// pack, eating, weapon, flashlight) sits on the action bar. Works with a
// mouse too: click, drag, right-drag to turn, wheel to zoom.
import * as THREE from 'three';
import { NavGrid } from './npc/nav.js';
import { STORY } from './building/defs.js';
import { CLAIM_HALF } from './claims.js';
import { isTouch } from './platform.js';

const v = new THREE.Vector3();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M14.5 14.5L20 20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  door: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="15" cy="12.5" r="1.4" fill="currentColor"/></svg>',
};

export class CommandView {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.cam = { x: 0, y: 0, z: 0, dist: 19, yaw: 0, pitch: 0.95, follow: true };
    this.sel = new Set(['player']);
    this.order = null;
    this.run = false;
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.rgt = new THREE.Vector3(1, 0, 0);
    this.move = 0;
    this.press = new Set();
    this.aim = false;
    const self = this;
    // the player is driven through the same controller as third person
    this.fakeIn = {
      moveAxis: () => ({ x: 0, y: self.move }),
      down: (k) => (k === 'ShiftLeft' ? self.wantRun : false),
      pressed: (k) => self.press.has(k),
      btn: (n) => (n === 'aim' ? self.aim : false),
      mouse: { buttons: 0 }, locked: false, uiCapture: false,
    };
    this.fakeCam = { forward: this.fwd, right: this.rgt, pitch: 0 };
    this.ptrs = new Map();
    this.opened = [];
    this.buildUI();
    this.bind();
    this.makeRings();
  }

  // ---------------- on / off ----------------
  toggle(on) {
    on = on == null ? !this.active : on;
    if (on === this.active) return;
    if (on) this.enter(); else this.exit();
    try { localStorage.setItem('holdfast.view', on ? 'command' : 'third'); } catch (e) { /* storage blocked */ }
  }
  enter() {
    const g = this.game;
    this.active = true;
    g.input.wantLock = false;
    g.input.exitLock();
    g.input.keys.clear();
    g.input.touch.move.x = 0; g.input.touch.move.y = 0; g.input.touch.active = false;
    const p = g.player.pos;
    Object.assign(this.cam, { x: p.x, y: p.y, z: p.z, yaw: g.tpc.yaw, follow: true });
    this.sel = new Set(['player']);
    this.order = null;
    this.camInit = false;
    document.getElementById('ui').classList.add('cmd-mode');
    g.hud.setPrompt(null);
    this.el.hidden = false;
    this.renderBar(true);
    if (!this.hinted) { this.hinted = true; this.hint(isTouch ? 'Tap the ground to move · drag to look around · pinch to zoom · tap people to talk' : 'Click the ground to move · drag to pan · right-drag to turn · wheel to zoom', 6); }
  }
  exit() {
    const g = this.game;
    this.active = false;
    g.input.wantLock = !g.quality.mobile;
    document.getElementById('ui').classList.remove('cmd-mode');
    this.el.hidden = true;
    this.closeMenu();
    this.setPlantMode(false);
    if (this.cutS) { this.cutS.setCutaway(null); this.cutS = null; }
    if (g.world.trees) g.world.trees.setHidden(null);
    if (g.world.grass) for (const m of g.world.grass.meshes) m.visible = true;
    this.hideRings();
    g.tpc.yaw = this.cam.yaw;
    g.hud.setPrompt(null);
    this.order = null; this.move = 0; this.aim = false;
    for (const m of this.followers()) m.orderTarget = null;
  }
  // keep our UI out of the way of build mode, talking and the setup screens
  sync() {
    const g = this.game;
    const show = this.active && !g.buildMode.active && !g.setupOpen && !(g.society && g.society.ui.talking);
    if (this.el.hidden === show) this.el.hidden = !show;
  }

  // ---------------- UI ----------------
  buildUI() {
    const el = this.el = document.createElement('div');
    el.className = 'cmd-ui';
    el.hidden = true;
    el.innerHTML = `
      <div class="cmd-bar" id="cmd-bar"></div>
      <div class="cmd-acts">
        <button data-a="third">3rd person</button><button data-a="center">Center</button>
        <button data-a="claim">Claim</button><button data-a="build">Build</button>
        <button data-a="camp">Camp</button><button data-a="map">Map</button>
        <button data-a="pack">Pack</button><button data-a="eat">Eat</button>
        <button data-a="weapon" id="cmd-weapon">Weapon</button><button data-a="light" id="cmd-light">Light</button>
        <button data-a="sneak" id="cmd-sneak">Sneak</button><button data-a="run" id="cmd-run">Run</button>
      </div>
      <div class="cmd-status" id="cmd-status"></div>
      <div class="cmd-marks" id="cmd-marks"></div>
      <div class="cmd-menu" id="cmd-menu" hidden></div>
      <div class="cmd-plant" id="cmd-plant" hidden><span id="cmd-plant-text">Tap where your camp should go.</span><button id="cmd-plant-ok" class="primary" hidden>Plant here</button><button id="cmd-plant-x">Cancel</button></div>`;
    document.getElementById('ui').appendChild(el);
    this.$ = (id) => el.querySelector('#' + id);
    for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', (e) => { e.stopPropagation(); this.action(b.dataset.a); });
    this.$('cmd-plant-x').addEventListener('click', () => this.setPlantMode(false));
    this.$('cmd-plant-ok').addEventListener('click', () => this.confirmPlant());
    this.marks = [];
  }
  hint(text, secs = 3) { this.game.hud.toast(text, secs); }
  action(a) {
    const g = this.game, inp = g.input;
    this.closeMenu();
    const key = (k) => { inp.pressedSet.add(k); };
    if (a === 'third') this.toggle(false);
    else if (a === 'center') { this.cam.follow = true; }
    else if (a === 'claim') this.setPlantMode(!this.planting);
    else if (a === 'build') g.openBuild();
    else if (a === 'camp') key('KeyJ');
    else if (a === 'map') key('KeyM');
    else if (a === 'pack') key('KeyI');
    else if (a === 'eat') key('KeyH');
    else if (a === 'weapon') key('KeyQ');
    else if (a === 'light') key('KeyF');
    else if (a === 'sneak') { g.player.crouch = !g.player.crouch; for (const m of this.followers()) m.crouch = g.player.crouch; }
    else if (a === 'run') { this.run = !this.run; }
  }
  followers() { const s = this.game.society; return s ? s.camp.members.filter((m) => !m.dead && (m.mode === 'follow' || m.mode === 'wait' || m.mode === 'inside')) : []; }
  renderBar(force) {
    const g = this.game, p = g.player;
    const units = [['player', 'You', p.health / p.maxHealth, this.playerState()], ...this.followers().map((m) => [m, m.first, m.health / m.maxHealth, this.npcState(m)])];
    const key = units.map((u) => (u[0] === 'player' ? 'p' : u[0].person.id) + (this.sel.has(u[0]) ? '*' : '') + u[3] + Math.round(u[2] * 20)).join('|') + (units.length > 1 ? '|g' : '');
    if (!force && key === this.barKey) return;
    this.barKey = key;
    const bar = this.$('cmd-bar');
    bar.innerHTML = units.map((u, i) => `<button class="cmd-card ${this.sel.has(u[0]) ? 'on' : ''}" data-i="${i}"><b>${esc(u[1])}</b><span class="hbar"><span class="fill hp" style="width:${Math.max(0, u[2] * 100).toFixed(0)}%"></span></span><small>${esc(u[3])}</small></button>`).join('') +
      (units.length > 1 ? `<button class="cmd-card all ${units.every((u) => this.sel.has(u[0])) ? 'on' : ''}" data-i="all"><b>Everyone</b><small>Select all</small></button>` : '');
    this.units = units;
    for (const b of bar.querySelectorAll('.cmd-card')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeMenu();
      if (b.dataset.i === 'all') { this.sel = new Set(this.units.map((u) => u[0])); this.renderBar(true); return; }
      const u = this.units[+b.dataset.i][0];
      // tap again to look at them
      if (this.sel.size === 1 && this.sel.has(u)) { this.cam.follow = true; this.focusOn = u; }
      this.sel = new Set([u]);
      this.focusOn = u;
      this.renderBar(true);
    });
    this.$('cmd-weapon').textContent = p.weapon.kind === 'gun' ? 'Pistol' : 'Bat';
    this.$('cmd-light').classList.toggle('on', !!p.flashlightOn);
    this.$('cmd-sneak').classList.toggle('on', !!p.crouch);
    this.$('cmd-run').classList.toggle('on', this.run);
  }
  playerState() {
    const o = this.order, p = this.game.player;
    if (p.dead) return 'Down';
    if (!o) return p.crouch ? 'Sneaking' : 'Ready';
    return { move: 'Moving', attack: 'Fighting', use: o.what === 'loot' ? 'Searching' : 'Opening', talk: 'Going to talk', plant: 'Planting a flag', revive: 'Helping' }[o.kind] || 'Busy';
  }
  npcState(m) {
    if (m.downed) return 'Down!';
    if (m.combatTarget) return 'Fighting';
    if (m.healing) return 'Patching you up';
    if (m.mode === 'wait') return m.path ? 'Moving' : 'Holding';
    if (m.mode === 'inside') return 'Talking them up';
    return m.path ? 'Following' : 'With you';
  }

  // ---------------- picking ----------------
  ray(sx, sy) {
    const cam = this.game.camera;
    v.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(cam);
    const d = v.clone().sub(cam.position).normalize();
    return { o: cam.position.clone(), d };
  }
  // the ground (or floor) under a screen point
  groundAt(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    const cutY = this.cutS ? this.cutS.oy + (this.cutL + 1) * STORY - 0.2 : Infinity;
    const hit = this.game.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 400, { skipGlass: true,
      filter: (b) => b.kind !== 'roof' && b.kind !== 'tree' && b.kind !== 'glass' && b.kind !== 'door' && b.min[1] < cutY });
    if (hit.dist >= 399) return null;
    const x = o.x + d.x * hit.dist, z = o.z + d.z * hit.dist, hy = o.y + d.y * hit.dist;
    const ph = this.game.physics, py = this.game.player.pos.y;
    let y = ph.groundAt(x, z, hy + 0.3);
    // tapped onto an upper floor from below: you meant the floor at your level
    if (y > py + 2.2) { const same = ph.groundAt(x, z, py + 1.7); if (same > ph.terrain.height(x, z) - 1.5) y = same; }
    return { x, y, z };
  }
  project(x, y, z) {
    v.set(x, y, z).project(this.game.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  pickUnit(sx, sy) {
    const g = this.game, s = g.society;
    const r = isTouch ? 34 : 24;
    let best = null, bd = r;
    const consider = (u, kind, x, y, z) => {
      const p = this.project(x, y + 0.9, z);
      if (!p) return;
      const d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bd) { bd = d; best = { u, kind }; }
    };
    consider('player', 'player', g.player.pos.x, g.player.pos.y, g.player.pos.z);
    if (s) for (const n of s.npcs) if (!n.dead && n.char.root.visible) consider(n, n.faction, n.pos.x, n.anim.lie ? n.anim.lieY - 0.6 : n.pos.y, n.pos.z);
    for (const z of g.zombies.list) if (!z.dead) consider(z, 'zombie', z.pos.x, z.pos.y, z.pos.z);
    return best;
  }

  // ---------------- input ----------------
  bind() {
    const cv = this.game.renderer.domElement;
    const P = this.ptrs;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active || this.game.buildMode.active || this.game.modalOpen) return;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, moved: false });
      if (P.size === 2) { this.gesture = this.twoFinger(); this.panFrom = null; }
      else if (e.button === 0) this.panFrom = this.planePoint(e.clientX, e.clientY);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = P.get(e.pointerId);
      if (!this.active || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > (e.pointerType === 'touch' ? 10 : 6)) p.moved = true;
      if (P.size === 2) {
        const gnow = this.twoFinger();
        if (this.gesture) {
          this.cam.dist = Math.max(10, Math.min(75, this.cam.dist * this.gesture.d / gnow.d));
          let da = gnow.a - this.gesture.a;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          this.cam.yaw -= da;
        }
        this.gesture = gnow;
        return;
      }
      if (p.button === 2) { this.cam.yaw -= dx * 0.006; this.cam.pitch = Math.max(0.55, Math.min(1.35, this.cam.pitch + dy * 0.004)); return; }
      if (p.moved && this.panFrom) {
        // the ground under the finger moves with it (both points through the same camera)
        const was = this.planePoint(e.clientX - dx, e.clientY - dy), now = this.planePoint(e.clientX, e.clientY);
        if (was && now) { this.cam.x += was.x - now.x; this.cam.z += was.z - now.z; this.cam.follow = false; this.focusOn = null; }
      }
    });
    const up = (e) => {
      const p = P.get(e.pointerId);
      if (!p) return;
      P.delete(e.pointerId);
      if (P.size < 2) this.gesture = null;
      if (!this.active || this.game.buildMode.active || this.game.modalOpen) return;
      if (!p.moved && p.button === 0 && performance.now() - p.t < 600 && !this.wasTwo) this.tap(p.sx, p.sy);
      if (P.size === 0) this.wasTwo = false;
      if (P.size === 1) { this.wasTwo = true; const q = [...P.values()][0]; this.panFrom = this.planePoint(q.x, q.y); }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { P.delete(e.pointerId); this.gesture = null; });
    cv.addEventListener('wheel', (e) => { if (this.active && !this.game.buildMode.active) this.cam.dist = Math.max(10, Math.min(75, this.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });
  }
  twoFinger() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), a: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  // a point on the horizontal plane through the focus (smooth panning)
  planePoint(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    if (d.y > -0.02) return null;
    const t = (this.cam.y - o.y) / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  // ---------------- taps ----------------
  tap(sx, sy) {
    const now = performance.now();
    const dbl = this.lastTap && now - this.lastTap.t < 330 && Math.hypot(sx - this.lastTap.x, sy - this.lastTap.y) < 30;
    this.lastTap = { t: now, x: sx, y: sy };
    if (!this.$('cmd-menu').hidden) { this.closeMenu(); return; }
    if (this.planting) { const p = this.groundAt(sx, sy); if (p) this.previewPlant(p); return; }
    const hit = this.pickUnit(sx, sy);
    if (hit) return this.tapUnit(hit, sx, sy);
    const p = this.groundAt(sx, sy);
    if (!p) return;
    this.moveSelected(p, dbl || this.run);
  }
  tapUnit(hit, sx, sy) {
    const { u, kind } = hit;
    const soc = this.game.society;
    if (kind === 'player') { this.sel = new Set(['player']); this.focusOn = 'player'; this.cam.follow = true; this.renderBar(true); return; }
    if (kind === 'zombie' || (kind === 'raider') || (u.angry)) return this.attackSelected(u);
    // one of your people, a stranger, someone down
    if (u.downed) return this.giveOrder({ kind: 'revive', target: u });
    const opts = [];
    const followerish = u.faction === 'camp' && ['follow', 'wait', 'inside'].includes(u.mode);
    opts.push(['Talk', () => this.giveOrder({ kind: 'talk', target: u })]);
    if (followerish) {
      opts.push(['Select', () => { this.sel = new Set([u]); this.focusOn = u; this.renderBar(true); }]);
      if (u.mode !== 'follow') opts.push(['Follow me', () => { u.mode = 'follow'; u.orderTarget = null; u.setAct(null); u.say(soc.speech.line(u, 'follow_yes')); }]);
      if (u.mode === 'follow') opts.push(['Hold here', () => { u.mode = 'wait'; u.waitAt = { x: u.pos.x, y: u.pos.y, z: u.pos.z }; u.stop(); u.say(soc.speech.line(u, 'wait')); }]);
      if (soc.camp.claim) opts.push(['Go home', () => { u.mode = 'travel'; u.orderTarget = null; u.setAct(null); u.say(soc.speech.line(u, 'home')); this.sel.delete(u); }]);
    } else if (u.faction === 'camp' && (u.mode === 'camp' || u.mode === 'travel')) {
      opts.push(['Come with me', () => { soc.ui.openTalk(u); soc.ui.askFollow(u); soc.ui.menu(); soc.ui.closeTalk(); }]);
    }
    this.openMenu(sx, sy, `${u.person.name}${u.faction === 'camp' ? '' : ' · stranger'}`, opts);
  }
  openMenu(sx, sy, title, opts) {
    const m = this.$('cmd-menu');
    m.innerHTML = `<div class="cmd-menu-t">${esc(title)}</div>` + opts.map((o, i) => `<button data-i="${i}">${esc(o[0])}</button>`).join('');
    m.hidden = false;
    const w = 180, h = 44 + opts.length * 46;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, sx - w / 2)) + 'px';
    m.style.top = Math.max(8, Math.min(innerHeight - h - 8, sy - h - 16)) + 'px';
    for (const b of m.querySelectorAll('button')) b.addEventListener('click', (e) => { e.stopPropagation(); this.closeMenu(); opts[+b.dataset.i][1](); });
  }
  closeMenu() { const m = this.$('cmd-menu'); if (m) m.hidden = true; }

  // ---------------- orders ----------------
  selected() { return [...this.sel].filter((u) => u === 'player' || (!u.dead && this.followers().includes(u))); }
  moveSelected(p, run) {
    const sel = this.selected();
    if (!sel.length) this.sel = new Set(['player']);
    const units = sel.length ? sel : ['player'];
    const npcs = units.filter((u) => u !== 'player');
    if (units.includes('player')) {
      this.giveOrder({ kind: 'move', to: p, run });
      // everyone selected with you comes along
      for (const m of npcs) { m.mode = 'follow'; m.orderTarget = null; }
    } else {
      // send them; they hold there
      npcs.forEach((m, i) => {
        const a = i * 2.4, r = i ? 1.3 : 0;
        const to = { x: p.x + Math.cos(a) * r, y: p.y, z: p.z + Math.sin(a) * r };
        m.mode = 'wait'; m.waitAt = to; m.orderTarget = null; m.setAct(null);
        const path = this.plan(m.pos, to);
        m.path = path || [to]; m.pathI = 0; m.dest = to; m.run = run; m.stuckT = 0;
      });
      const m0 = npcs[0];
      if (m0 && Math.random() < 0.6) m0.say(['On it.', 'Going.', 'Got it.', 'Moving.'][Math.floor(Math.random() * 4)]);
    }
    this.marker(p, 0xf3efe4);
  }
  attackSelected(t) {
    const units = this.selected().length ? this.selected() : ['player'];
    for (const u of units) {
      if (u === 'player') this.giveOrder({ kind: 'attack', target: t });
      else { u.orderTarget = t; if (u.mode === 'wait') u.mode = 'follow'; }
    }
    this.targetRing = t;
  }
  giveOrder(o) {
    this.order = { ...o, replanT: 0, stuckT: 0, tries: 0, last: null };
    this.closeMenu();
    if (o.kind !== 'attack') this.targetRing = null;
    if (o.kind === 'move') this.planTo(o.to);
  }
  planTo(to) {
    const p = this.game.player.pos;
    this.order.path = this.plan(p, to) || [to];
    this.order.pi = 0;
    this.order.goal = to;
  }
  // a path from a to b: straight if nothing is in the way, else around
  plan(a, b) {
    const ph = this.game.physics;
    if (Math.abs(a.y - b.y) < 0.8 && this.clearLine(a, b)) return [{ x: b.x, y: b.y, z: b.z }];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    let tx = b.x, tz = b.z, ty = b.y;
    // far away: plan the first stretch, the rest as we go
    if (d > 60) { tx = a.x + (b.x - a.x) / d * 55; tz = a.z + (b.z - a.z) / d * 55; ty = ph.groundAt(tx, tz, Math.max(a.y, b.y) + 3); }
    const m = 9;
    const g = new NavGrid(ph, Math.min(a.x, tx) - m, Math.min(a.z, tz) - m, Math.max(a.x, tx) + m, Math.max(a.z, tz) + m);
    const path = g.path(a.x, a.y, a.z, tx, ty, tz);
    if (path && (tx !== b.x || tz !== b.z)) path.push({ x: b.x, y: b.y, z: b.z });
    return path;
  }
  clearLine(a, b) {
    const ph = this.game.physics;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    for (const h of [0.55, 1.3]) {
      for (const off of [-0.3, 0.3]) {
        const ox = a.x - dz / d * off, oz = a.z + dx / d * off;
        const hit = ph.raycast(ox, a.y + h, oz, dx / d, (b.y - a.y) / d * 0.0, dz / d, d, { noTerrain: true, filter: (bx) => bx.kind !== 'walk' && bx.kind !== 'door' && bx.kind !== 'tree' });
        if (hit.dist < d - 0.4) return false;
      }
    }
    return true;
  }
  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game, pl = g.player;
    this.press.clear();
    this.move = 0; this.aim = false; this.wantRun = false;
    if (!pl.dead) this.runOrder(dt);
    // the controller does the rest: physics, stamina, animation, swings
    pl.update(dt, this.fakeIn, this.fakeCam);
    if (pl.weapon.kind === 'gun' && pl.attackT >= 0 && !pl._shotFired) { g.combat.shoot(pl, this.aimAt()); pl._shotFired = true; }
    if (pl.attackT < 0) pl._shotFired = false;
    pl.char.mesh.visible = true;
    // grass tufts read as noise from up here; the ground texture carries it
    if (g.world.grass) for (const m of g.world.grass.meshes) if (m.visible) m.visible = false;
    this.openDoors(dt);
    this.updateCamera(dt);
    this.updateCutaway();
    this.updateRings(dt);
    this.updateMarks();
    this.barT = (this.barT || 0) - dt;
    if (this.barT <= 0) { this.barT = 0.25; this.renderBar(false); this.status(); }
    // you're the one the world revolves around
    g.focus = pl.pos;
  }
  status() {
    const o = this.order;
    let t = '';
    if (this.planting) t = '';
    else if (o && o.kind === 'move') t = this.run || o.run ? 'Running' : 'Walking';
    else if (o && o.kind === 'attack') t = `Fighting${o.target && o.target.first ? ' ' + o.target.first : ''}`;
    else if (o && o.kind === 'talk') t = `Going to talk to ${o.target.first}`;
    else if (o && o.kind === 'use') t = o.what === 'loot' ? (o.searchT ? 'Searching' : 'Going to search') : 'Going to the door';
    const el = this.$('cmd-status');
    if (el.textContent !== t) el.textContent = t;
  }
  // steer along a path; 'moving' | 'arrived' | 'stuck'
  steer(dt, o, reach) {
    const p = this.game.player.pos;
    const path = o.path;
    if (!path || !path.length) return 'arrived';
    let wp = path[o.pi];
    let d = Math.hypot(wp.x - p.x, wp.z - p.z);
    while (o.pi < path.length - 1 && d < 0.5) { o.pi++; wp = path[o.pi]; d = Math.hypot(wp.x - p.x, wp.z - p.z); }
    const last = o.pi === path.length - 1;
    if (last && d < reach) return 'arrived';
    this.fwd.set(wp.x - p.x, 0, wp.z - p.z).normalize();
    this.rgt.set(this.fwd.z, 0, -this.fwd.x);
    this.move = last ? Math.max(0.4, Math.min(1, d / 1.2)) : 1;
    this.wantRun = (this.run || o.run) && d > 2;
    // not getting anywhere: vault a fence, re-plan, then give up (judged by
    // how far we actually moved, not how hard we're pushing)
    const moved = o.last ? Math.hypot(p.x - o.last.x, p.z - o.last.z) / Math.max(dt, 1e-3) : 1;
    o.last = { x: p.x, z: p.z };
    o.stuckT = moved < 0.35 ? o.stuckT + dt : Math.max(0, o.stuckT - dt);
    if (last && d < reach + 0.9 && o.stuckT > 0.4) return 'arrived'; // right up against it: close enough
    if (o.stuckT > 0.5 && this.fenceAhead()) { this.press.add('Space'); o.stuckT = 0; }
    if (o.stuckT > 1.4) {
      o.stuckT = 0; o.tries++;
      if (o.tries > 3) return 'stuck';
      const goal = path[path.length - 1];
      o.path = this.plan(p, goal) || [goal]; o.pi = 0;
    }
    return 'moving';
  }
  fenceAhead() {
    const p = this.game.player.pos, f = this.fwd;
    return this.game.physics.query(p.x + f.x * 0.8 - 0.5, p.z + f.z * 0.8 - 0.5, p.x + f.x * 0.8 + 0.5, p.z + f.z * 0.8 + 0.5, []).some((b) => b.kind === 'fence');
  }
  runOrder(dt) {
    const g = this.game, pl = g.player;
    let o = this.order;
    // with nothing to do, hit back at whatever is on you
    if (!o || o.kind === 'move' && o.done) {
      const t = this.threatAt(pl.pos, 2.3);
      if (t) { this.giveOrder({ kind: 'attack', target: t, auto: true }); o = this.order; }
    }
    if (!o) return;
    const p = pl.pos;
    if (o.kind === 'move') {
      if (o.done) { this.order = null; return; }
      const r = this.steer(dt, o, 0.5);
      if (r === 'arrived') o.done = true;
      if (r === 'stuck') { this.order = null; this.hint('Can’t find a way there.', 2); }
      return;
    }
    if (o.kind === 'attack') {
      const t = o.target;
      if (!t || t.dead || (t.downed && t.faction !== 'raider')) { this.order = null; this.targetRing = null; return; }
      const tp = t.pos, d = Math.hypot(tp.x - p.x, tp.z - p.z);
      const gun = pl.weapon.kind === 'gun' && g.inventory.res.ammo > 0;
      if (pl.weapon.kind === 'gun' && g.inventory.res.ammo <= 0) g.setWeapon('bat');
      const inReach = gun ? d < 20 && this.clearLine(p, tp) : d < 1.7 && Math.abs(tp.y - p.y) < 1.3;
      if (inReach) {
        this.fwd.set(tp.x - p.x, 0, tp.z - p.z).normalize();
        this.rgt.set(this.fwd.z, 0, -this.fwd.x);
        this.move = 0;
        if (gun) this.aim = true;
        if (pl.attackCd <= 0 && pl.attackT < 0 && pl.stamina > 6) this.press.add('TouchAttack');
        return;
      }
      // chase
      o.replanT -= dt;
      if (o.replanT <= 0 || !o.path) { o.replanT = 0.5; o.path = this.plan(p, tp) || [{ x: tp.x, y: tp.y, z: tp.z }]; o.pi = 0; }
      if (o.auto && d > 6) { this.order = null; return; }
      if (this.steer(dt, o, 0.2) === 'stuck') this.order = null;
      return;
    }
    if (o.kind === 'talk' || o.kind === 'revive' || o.kind === 'use' || o.kind === 'plant') {
      const tp = o.kind === 'use' ? { x: o.pos[0], y: o.pos[1] - 1, z: o.pos[2] } : o.kind === 'plant' ? o.to : o.target.pos;
      const reach = o.kind === 'talk' ? 2.2 : o.kind === 'revive' ? 1.2 : o.kind === 'plant' ? 1.5 : o.what === 'door' ? 1.6 : 1.8;
      const d = Math.hypot(tp.x - p.x, tp.z - p.z);
      if (o.kind !== 'use' && o.kind !== 'plant' && (o.target.dead || (o.kind === 'revive' && !o.target.downed))) { this.order = null; return; }
      // pressed up against it counts as there (furniture keeps you a step away)
      const there = (d <= reach || (o.at && d < reach + 1)) && !(o.kind === 'use' && Math.abs(tp.y - p.y) > 1.8);
      if (!there) {
        if (o.searchT) { o.searchT = 0; g.interaction.hold = 0; }
        o.replanT -= dt;
        const moving = o.kind === 'talk' || o.kind === 'revive';
        if (!o.path || (moving && o.replanT <= 0)) { o.replanT = 0.7; o.path = this.plan(p, tp) || [tp]; o.pi = 0; }
        const r = this.steer(dt, o, Math.max(0.3, reach - 0.3));
        if (r === 'arrived') o.at = true;
        if (r === 'stuck') { this.order = null; this.hint('Can\u2019t reach that.', 2); }
        return;
      }
      if (o.kind === 'talk') { this.order = null; g.society.ui.openTalk(o.target); return; }
      if (o.kind === 'plant') { this.order = null; const c = g.claims.plant(o.to.x, o.to.z, false, pl.pos.y); if (c) this.hint('Your camp has a home. Tap Build to start building.', 4); return; }
      if (o.kind === 'revive') {
        this.fwd.set(tp.x - p.x, 0, tp.z - p.z).normalize(); this.rgt.set(this.fwd.z, 0, -this.fwd.x);
        o.holdT = (o.holdT || 0) + dt;
        g.hud.setPrompt(`Helping ${o.target.first} up`, '', o.holdT / 1.6);
        if (o.holdT >= 1.6) { o.target.revive(pl); g.hud.setPrompt(null); this.order = null; }
        return;
      }
      // doors and containers
      this.fwd.set(tp.x - p.x, 0, tp.z - p.z).normalize(); this.rgt.set(this.fwd.z, 0, -this.fwd.x);
      if (o.what === 'door') { if (!o.ref.broken) g.world.toggleDoor(o.ref); this.order = null; return; }
      if (o.ref.searched) { this.order = null; g.hud.setPrompt(null); return; }
      o.searchT = (o.searchT || 0) + dt;
      const T = 1.3 * (g.mods ? g.mods.search : 1);
      g.interaction.target = { kind: 'loot', ref: o.ref };
      g.interaction.hold = o.searchT;
      pl.noise = Math.max(pl.noise, 4);
      g.hud.setPrompt(o.ref.label || 'Searching', '', o.searchT / T);
      if (o.searchT >= T) { g.interaction.finishSearch(o.ref); g.interaction.hold = 0; g.interaction.target = null; g.hud.setPrompt(null); this.order = null; }
    }
  }
  threatAt(pos, r) {
    const g = this.game;
    let best = null, bd = r;
    for (const z of g.zombies.list) { if (z.dead || z.downT > 0.8) continue; const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z); if (d < bd && Math.abs(z.pos.y - pos.y) < 1.4) { bd = d; best = z; } }
    if (g.society) for (const n of g.society.npcs) { if (n.dead || !(n.faction === 'raider' ? n.isHostile : n.angry)) continue; const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z); if (d < bd + 2) { bd = d; best = n; } }
    return best;
  }
  // where the pistol points: the target's chest
  aimAt() {
    const o = this.order, pl = this.game.player;
    const t = o && o.kind === 'attack' ? o.target : null;
    const from = pl.muzzleWorld ? pl.muzzleWorld(new THREE.Vector3()) : new THREE.Vector3(pl.pos.x, pl.pos.y + 1.35, pl.pos.z);
    const to = t ? new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z) : from.clone().add(new THREE.Vector3(Math.sin(pl.facing), 0, Math.cos(pl.facing)));
    return { origin: from, dir: to.sub(from).normalize() };
  }
  // doors on the way open and close behind you
  openDoors() {
    const g = this.game, p = g.player.pos, f = this.fwd;
    if (this.move > 0.1) for (const d of g.world.doors) {
      if (d.open || d.broken) continue;
      const c = d.center;
      if (Math.abs(c[1] - 1 - p.y) > 1.2) continue;
      const dx = c[0] - p.x, dz = c[2] - p.z, dd = Math.hypot(dx, dz);
      if (dd > 1.4 || (dx * f.x + dz * f.z) / dd < 0.3) continue;
      g.world.toggleDoor(d); this.opened.push(d);
    }
    for (let i = this.opened.length - 1; i >= 0; i--) {
      const d = this.opened[i], c = d.center;
      if (Math.hypot(c[0] - p.x, c[2] - p.z) < 2.4) continue;
      const busy = g.society && g.society.near({ pos: { x: c[0], y: c[1], z: c[2] } }, 2.2).length;
      if (!busy && d.open && !d.broken) g.world.toggleDoor(d);
      this.opened.splice(i, 1);
    }
  }

  // ---------------- camera ----------------
  updateCamera(dt) {
    const g = this.game, c = this.cam;
    const fo = this.focusOn && this.focusOn !== 'player' && !this.focusOn.dead ? this.focusOn.pos : g.player.pos;
    if (c.follow) {
      const k = this.camInit ? Math.min(1, dt * 4) : 1;
      c.x += (fo.x - c.x) * k; c.z += (fo.z - c.z) * k;
    }
    c.y += (g.physics.groundAt(c.x, c.z, (c.follow ? fo.y : c.y) + 2.5) - c.y) * (this.camInit ? Math.min(1, dt * 3) : 1);
    // keyboard panning on desktop
    const inp = g.input, sp = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let px = 0, pz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) { px += fx; pz += fz; }
    if (inp.down('KeyS') || inp.down('ArrowDown')) { px -= fx; pz -= fz; }
    if (inp.down('KeyD') || inp.down('ArrowRight')) { px += rx; pz += rz; }
    if (inp.down('KeyA') || inp.down('ArrowLeft')) { px -= rx; pz -= rz; }
    if (px || pz) { c.x += px * sp; c.z += pz * sp; c.follow = false; }
    const cp = Math.cos(c.pitch);
    const want = new THREE.Vector3(c.x + Math.sin(c.yaw) * cp * c.dist, c.y + 1 + Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    const cam = g.camera;
    if (!this.camInit) { cam.position.copy(want); this.camInit = true; } else cam.position.lerp(want, Math.min(1, dt * 8));
    cam.lookAt(c.x, c.y + 1, c.z);
    if (Math.abs(cam.fov - 50) > 0.1) { cam.fov = 50; cam.updateProjectionMatrix(); }
    // trees that would hide your people
    const tr = g.world.trees;
    if (tr && (!this.treeAt || Math.hypot(this.treeAt.x - fo.x, this.treeAt.z - fo.z) > 3)) {
      this.treeAt = { x: fo.x, z: fo.z };
      tr.setHidden([fo.x - 11, fo.z - 11, fo.x + 11, fo.z + 11]);
    }
  }
  // inside a building: lift off the roof and the floors above you
  updateCutaway() {
    const g = this.game, p = g.player.pos;
    let found = null, lvl = 0;
    for (const S of g.world.structures) {
      const b = S._bb || (S._bb = S.bounds());
      if (!b || p.x < b.wx0 - 0.3 || p.x > b.wx1 + 0.3 || p.z < b.wz0 - 0.3 || p.z > b.wz1 + 0.3) continue;
      if (p.y < S.oy - 1.5) continue;
      found = S; lvl = Math.max(0, Math.round((p.y - S.oy) / STORY - 0.2)); break;
    }
    if (found !== this.cutS || lvl !== this.cutL) {
      if (this.cutS && this.cutS !== found) this.cutS.setCutaway(null);
      this.cutS = found; this.cutL = lvl;
      if (found) found.setCutaway(lvl);
    }
  }

  // ---------------- markers ----------------
  makeRings() {
    const mk = (r0, r1, color, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, depthTest: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 10; m.visible = false;
      this.game.scene.add(m);
      return m;
    };
    this.selRings = [0, 1, 2, 3].map(() => mk(0.42, 0.52, 0xd9a441, 0.9));
    this.tgtRing = mk(0.48, 0.6, 0xe0583a, 0.95);
    this.dest = mk(0.25, 0.42, 0xf3efe4, 0.9);
    this.destT = 0;
  }
  hideRings() { for (const r of [...this.selRings, this.tgtRing, this.dest]) r.visible = false; for (const m of this.marks) m.el.hidden = true; }
  marker(p, color) { this.dest.position.set(p.x, p.y + 0.06, p.z); this.dest.material.color.setHex(color); this.destT = 1.2; }
  updateRings(dt) {
    const g = this.game;
    const sel = this.selected();
    this.selRings.forEach((r, i) => {
      const u = sel[i];
      if (!u) { r.visible = false; return; }
      const p = u === 'player' ? g.player.pos : u.pos;
      r.visible = true; r.position.set(p.x, (u === 'player' ? g.player.visualY : u.visualY) + 0.05, p.z);
    });
    const t = this.order && this.order.kind === 'attack' ? this.order.target : this.targetRing;
    this.tgtRing.visible = !!t && !t.dead;
    if (this.tgtRing.visible) this.tgtRing.position.set(t.pos.x, (t.visualY ?? t.pos.y) + 0.05, t.pos.z);
    this.destT -= dt;
    this.dest.visible = this.destT > 0;
    if (this.dest.visible) { const k = 1 + (1.2 - this.destT) * 0.6; this.dest.scale.set(k, k, k); this.dest.material.opacity = Math.min(0.9, this.destT); }
  }
  // tappable icons over containers and doors near the group
  updateMarks() {
    const g = this.game, f = this.cam.follow ? g.player.pos : this.cam;
    const want = [];
    if (this.cam.dist < 50) {
      const lim = 22;
      const add = (it, kind) => {
        const d = Math.hypot(it.pos[0] - f.x, it.pos[2] - f.z);
        if (d < lim && Math.abs(it.pos[1] - g.player.pos.y) < 4.5) want.push([d, it, kind]);
      };
      for (const S of g.world.structures) {
        const b = S._bb || (S._bb = S.bounds());
        if (!b || f.x < b.wx0 - lim || f.x > b.wx1 + lim || f.z < b.wz0 - lim || f.z > b.wz1 + lim) continue;
        // above the cut-away floor you can't see in
        for (const it of S.interact) if (!it.searched && !(this.cutS === S && it.pos[1] > S.oy + (this.cutL + 1) * STORY)) add(it, 'loot');
      }
      for (const it of g.world.carLoot || []) if (!it.searched) add(it, 'loot');
      if (g.society) for (const it of g.society.lootables) if (!it.searched) add(it, 'loot');
      if (this.cam.dist < 32) for (const d of g.world.doors) { const c = d.center; if (!d.broken && Math.hypot(c[0] - f.x, c[2] - f.z) < 12 && Math.abs(c[1] - 1 - g.player.pos.y) < 1.5) want.push([Math.hypot(c[0] - f.x, c[2] - f.z) + 4, { pos: c, door: d }, 'door']); }
    }
    want.sort((a, b) => a[0] - b[0]);
    const list = want.slice(0, 14);
    // keep icons out from under the HUD (measured now and then)
    this.blockT = (this.blockT || 0) - 1;
    if (this.blockT <= 0) {
      this.blockT = 30;
      this.blocked = ['.hud-res', '.cmd-acts', '.cmd-bar', '.hud-top-left', '.menu-btn'].map((q) => document.querySelector(q)).filter(Boolean).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    }
    const under = (x, y) => (this.blocked || []).some((r) => x > r.left - 14 && x < r.right + 14 && y > r.top - 14 && y < r.bottom + 14);
    while (this.marks.length < list.length) {
      const el = document.createElement('button');
      el.className = 'cmd-mark';
      this.$('cmd-marks').appendChild(el);
      const mk = { el, it: null, kind: null };
      el.addEventListener('click', (e) => { e.stopPropagation(); this.useMark(mk); });
      this.marks.push(mk);
    }
    this.marks.forEach((mk, i) => {
      const e = list[i];
      if (!e) { mk.el.hidden = true; mk.it = null; return; }
      const [, it, kind] = e;
      const p = this.project(it.pos[0], it.pos[1] + (kind === 'door' ? 0.2 : 0.35), it.pos[2]);
      if (!p || p[0] < 0 || p[1] < 0 || p[0] > innerWidth || p[1] > innerHeight || under(p[0], p[1])) { mk.el.hidden = true; return; }
      if (mk.kind !== kind || mk.it !== it) { mk.el.innerHTML = ICON[kind === 'door' ? 'door' : 'search']; mk.el.title = kind === 'door' ? (it.door.open ? 'Close door' : 'Open door') : (it.label || 'Search'); mk.el.classList.toggle('door', kind === 'door'); }
      mk.it = it; mk.kind = kind;
      mk.el.hidden = false;
      mk.el.classList.toggle('open', kind === 'door' && it.door.open);
      mk.el.style.transform = `translate(${p[0].toFixed(0)}px, ${p[1].toFixed(0)}px) translate(-50%, -50%)`;
    });
  }
  useMark(mk) {
    if (!mk.it) return;
    if (mk.kind === 'door') this.giveOrder({ kind: 'use', what: 'door', ref: mk.it.door, pos: mk.it.door.center });
    else this.giveOrder({ kind: 'use', what: 'loot', ref: mk.it, pos: mk.it.pos });
    this.marker({ x: mk.it.pos[0], y: mk.it.pos[1] - 0.6, z: mk.it.pos[2] }, 0xd9a441);
  }

  // ---------------- planting a claim ----------------
  setPlantMode(on) {
    // pull back so the whole square fits while you choose, then come back in
    if (on && !this.planting) this.distBefore = this.cam.dist;
    if (!on && this.planting && this.distBefore) { this.cam.dist = this.distBefore; this.cam.follow = true; }
    this.planting = on;
    this.$('cmd-plant').hidden = !on;
    this.$('cmd-plant-ok').hidden = true;
    this.$('cmd-plant-text').textContent = this.game.inventory.claimKits > 0 ? 'Tap where your camp should go.' : 'You need a claim kit. Search houses and sheds for one.';
    if (!on && this.plantLines) { this.game.scene.remove(this.plantLines); this.plantLines.geometry.dispose(); this.plantLines = null; }
    this.plantAt = null;
  }
  previewPlant(p) {
    const g = this.game;
    const r = g.claims.check(p.x, p.z);
    if (this.plantLines) { g.scene.remove(this.plantLines); this.plantLines.geometry.dispose(); this.plantLines = null; }
    const x0 = r.x0 ?? (Math.round(p.x / 2) - CLAIM_HALF) * 2, x1 = r.x1 ?? (Math.round(p.x / 2) + CLAIM_HALF) * 2;
    const z0 = r.z0 ?? (Math.round(p.z / 2) - CLAIM_HALF) * 2, z1 = r.z1 ?? (Math.round(p.z / 2) + CLAIM_HALF) * 2;
    const pts = [];
    const tr = g.world.terrain;
    const edge = (ax, az, bx, bz) => { for (let i = 0; i <= 20; i++) { const x = ax + (bx - ax) * i / 20, z = az + (bz - az) * i / 20; pts.push(new THREE.Vector3(x, tr.height(x, z) + 0.25, z)); } };
    edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
    this.plantLines = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.ok ? 0x8fd06a : 0xe0583a, depthTest: false }));
    this.plantLines.renderOrder = 11;
    g.scene.add(this.plantLines);
    this.plantAt = r.ok ? p : null;
    this.cam.follow = false;
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2;
    this.cam.dist = Math.max(this.cam.dist, innerHeight > innerWidth ? 78 : 52);
    this.$('cmd-plant-text').textContent = r.ok ? 'Your camp would cover this square.' : r.why;
    this.$('cmd-plant-ok').hidden = !r.ok;
  }
  confirmPlant() {
    const p = this.plantAt;
    this.setPlantMode(false);
    if (!p) return;
    const d = Math.hypot(p.x - this.game.player.pos.x, p.z - this.game.player.pos.z);
    // close by: plant it now; further: walk there first
    if (d < 6) { const c = this.game.claims.plant(p.x, p.z, false, this.game.player.pos.y); if (c) this.hint('Your camp has a home. Tap Build to start building.', 4); }
    else { this.giveOrder({ kind: 'plant', to: p }); this.marker(p, 0x8fd06a); }
  }
}
