import * as THREE from 'three';
import { Magnolia } from '../scenes/Magnolia.js';
import { Player } from '../entities/Player.js';
import { zoneById } from '../data/zones.js';
import { STASH_CAP, packCapacity, maxHealthFor, addToList, saveProfile, refreshContracts, removeFrom, countIn, canFit } from './Profile.js';
import { makeItem, def } from '../data/items.js';
import { objective, LOG, countOwned, atLeast, CREW } from '../data/story.js';
import { DialoguePanel } from '../ui/hub/DialoguePanel.js';
import { esc } from '../ui/hub/common.js';
import { easeInOut } from '../core/math.js';
import { CraftPanel } from '../ui/hub/CraftPanel.js';
import { GunsmithPanel } from '../ui/hub/GunsmithPanel.js';
import { BoardPanel, drawBoard } from '../ui/hub/BoardPanel.js';
import { StashPanel } from '../ui/hub/StashPanel.js';
import { RecyclerPanel, JournalPanel, SkiffPanel } from '../ui/hub/MiscPanels.js';

// Home: the Magnolia as a place you walk around. The title screen floats a camera
// around her; once you're aboard you walk the deck in first person and use the
// stations. Using one settles the camera over it and opens its panel beside it.

const PANELS = {
  workshop: CraftPanel, reloading: CraftPanel, infirmary: CraftPanel, galley: CraftPanel,
  gunsmith: GunsmithPanel, board: BoardPanel, stash: StashPanel, recycler: RecyclerPanel, journal: JournalPanel, skiff: SkiffPanel,
};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function lookQuat(pos, target, out) {
  _m.lookAt(pos, target, UP);
  return out.setFromRotationMatrix(_m);
}

export class Hub {
  constructor(app) {
    this.app = app;
    this.boat = new Magnolia();
    this.scene = this.boat.scene;
    this.camera = this.boat.camera;
    this.player = new Player({ camera: this.camera, world: this.boat.world, audio: app.audio, input: app.input });
    this.player.spawn(this.boat.spawn.pos, this.boat.spawn.yaw);
    this.mode = 'title';
    this.t = 0;
    this.tween = null;
    this.panel = null;
    this.target = null;
    this.hud = this._buildHud();
    this.ray = new THREE.Raycaster();
    const canvas = app.renderer.domElement;
    this._onMove = (e) => this._canvasPointer(e, false);
    this._onClick = (e) => this._canvasPointer(e, true);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('click', this._onClick);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  get p() { return this.app.profile; }
  get audio() { return this.app.audio; }
  save() { saveProfile(this.p); }
  lists() { return [this.p.stash, this.p.backpack]; }

  // Put crafted or salvaged things in the stash, spilling into the pack.
  give(item) {
    const p = this.p;
    let left = addToList(p.stash, STASH_CAP, item);
    if (left > 0) left = addToList(p.backpack, packCapacity(p), { ...item, qty: left });
    return left === 0;
  }

  // Things the crew hands you go straight in your pack, so you have them ashore.
  givePack(item) {
    const p = this.p;
    let left = addToList(p.backpack, packCapacity(p), item);
    if (left > 0) left = addToList(p.stash, STASH_CAP, { ...item, qty: left });
    return left === 0;
  }

  // ---- story ---------------------------------------------------------------------------

  advanceStory(step) {
    const p = this.p, s = p.story;
    if (s.step === step) return;
    s.step = step;
    if (LOG[step]) s.log.push({ day: p.day, step, text: LOG[step] });
    this.save();
    this._objFlash = true;
  }

  // What a conversation can see and do. `note` reports what changed hands.
  storyCtx(note = () => {}) {
    const hub = this, p = this.p;
    return {
      p,
      get step() { return p.story.step; },
      get maxHealth() { return maxHealthFor(p.nourishment); },
      at: (id) => atLeast(p, id),
      have: (id) => countOwned(p, id),
      take: (id, n = 1) => {
        removeFrom([p.backpack, p.stash], id, n);
        note({ html: `Handed over ${n > 1 ? n + '× ' : ''}${esc(def(id).name)}`, kind: 'give' });
      },
      give: (id, qty = 1, opts = {}) => {
        hub.givePack(makeItem(id, qty, opts));
        note({ html: `Received ${esc(def(id).name)}${qty > 1 ? ' ×' + qty : ''} <small>in your pack</small>`, kind: 'get' });
      },
      advance: (step) => {
        hub.advanceStory(step);
        const o = objective(p);
        note({ html: o ? `<span>Journal</span> <b>${esc(o.chapter)}</b> — ${esc(o.text)}` : '<span>Journal</span> <b>The story so far is over.</b> The parish goes on.', kind: 'obj' });
      },
      heal: () => {
        p.health = maxHealthFor(p.nourishment);
        p.story.healedDay = p.day;
        hub.save();
        note({ html: 'Health restored', kind: 'get' });
      },
      radio: () => hub.audio.radio(),
    };
  }

  // Before a trip: pack what the story needs there if it's sitting in the stash.
  _packFor(zoneId) {
    const p = this.p, s = p.story, notes = [];
    const move = (id) => {
      if (countIn([p.backpack], id) > 0) return;
      const i = p.stash.findIndex((it) => it.id === id);
      if (i < 0) return;
      const it = { ...p.stash[i], qty: 1 };
      if (!canFit(p.backpack, packCapacity(p), it)) { notes.push(`No room in your pack for the ${def(id).name}`); return; }
      removeFrom([p.stash], id, 1);
      addToList(p.backpack, packCapacity(p), it);
      notes.push(`You packed the ${def(id).name}`);
    };
    if (s.step === 'codebook' && zoneId === 'quarter') move('keycard');
    if (s.step === 'mast' && zoneId === 'outpost') move('demo_charge');
    return notes;
  }

  // ---- modes ---------------------------------------------------------------------------

  showTitle() {
    this._closePanel();
    this.mode = 'title';
    this.hud.root.style.display = 'none';
    this.app.input.exitLock();
  }

  // From the title (or back from a trip): onto the deck.
  board(fromRaid = false) {
    const p = this.p;
    refreshContracts(p);
    // with the relay down the herder mast on the skyline stays dark
    if (p.story && p.story.mastDown) this.boat.env.mastOff(true);
    else this.boat.env.mastDead = false;
    this.save();
    this.hud.root.style.display = '';
    drawBoard(this.boat, p);
    this.audio.startAmbience();
    this.audio.setAmbience({ wind: 0.1, insects: 0.7, drone: 0 });
    if (fromRaid) {
      this.player.spawn(new THREE.Vector3(-3.7, 0, -8.6), -Math.PI / 2);
    } else if (this.mode === 'title') {
      this.player.spawn(this.boat.spawn.pos, this.boat.spawn.yaw);
    }
    this.player.health = this.player.maxHealth = 100;
    this.player.stamina = 100;
    // fly from wherever the camera is into the survivor's eyes
    this.player.applyCamera(this.t);
    const toPos = this.camera.position.clone(), toQ = this.camera.quaternion.clone();
    if (this.mode === 'title') {
      this.camera.position.copy(this.titlePos || toPos);
      if (this.titleQ) this.camera.quaternion.copy(this.titleQ);
      this._tweenTo(toPos, toQ, 1.6, () => { this.mode = 'walk'; this._lockHint(true); });
      this.mode = 'intro';
    } else {
      this.mode = 'walk';
      this._lockHint(true);
    }
    this._status();
  }

  _tweenTo(pos, quat, dur, done) {
    this.tween = { fromP: this.camera.position.clone(), fromQ: this.camera.quaternion.clone(), toP: pos.clone(), toQ: quat.clone(), t: 0, dur, done };
  }

  openStation(st) {
    const P = st.npc ? DialoguePanel : PANELS[st.id];
    if (!P) return;
    this.mode = 'station';
    this.station = st;
    this.app.input.exitLock();
    this.hud.prompt.innerHTML = '';
    this.hud.root.style.display = 'none';
    if (!st.npc) this.audio.mech('bench');
    if (st.id === 'stash') this.lidOpen = 1;
    const from = this.camera.position.clone();
    this.panel = new P(this, st);
    // frame the station in the part of the screen its panel leaves open
    const view = st.npc ? this.boat.crew.talkView(st.id, from) : this._frame(st, this.panel.el);
    this._tweenTo(view.pos, lookQuat(view.pos, view.look, new THREE.Quaternion()), 0.55, null);
  }

  _frame(st, el) {
    const pos = st.view.pos.clone(), look = st.view.look.clone();
    const r = el.getBoundingClientRect();
    const W = window.innerWidth;
    if (r.width < W * 0.8 && r.width > 0) {
      const left = r.left < W / 2 - r.width / 2;
      const free = left ? (r.right + W) / 2 : r.left / 2; // centre of the open space, in px
      const off = free / W - 0.5; // -0.5..0.5 of the screen
      const dist = pos.distanceTo(look);
      const half = dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
      const fwd = look.clone().sub(pos).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const shift = right.multiplyScalar(-off * 2 * half);
      // stations seen through a gap (the gangway) turn the camera instead of sliding it
      if (!st.pivot) pos.add(shift);
      look.add(shift);
    }
    return { pos, look };
  }

  closeStation() {
    if (this.mode !== 'station') return;
    this._closePanel();
    this.hud.root.style.display = '';
    this.lidOpen = 0;
    this.mode = 'returning';
    // settle back behind the survivor's eyes
    const fromP = this.camera.position.clone(), fromQ = this.camera.quaternion.clone();
    this.player.applyCamera(this.t);
    const toP = this.camera.position.clone(), toQ = this.camera.quaternion.clone();
    this.camera.position.copy(fromP);
    this.camera.quaternion.copy(fromQ);
    this._tweenTo(toP, toQ, 0.45, () => { this.mode = 'walk'; this._lockHint(true); });
    this._status();
  }

  _closePanel() {
    if (this.panel) this.panel.dispose();
    this.panel = null;
  }

  // Off the boat: nothing aboard listens or shows while a raid runs.
  leave() {
    this._closePanel();
    this.mode = 'away';
    this.hud.root.style.display = 'none';
  }

  deploy(zoneId) {
    this.leave();
    this.p.lastZone = zoneId;
    this.app.raidNotes = this._packFor(zoneId);
    this.save();
    this.app.startRaid(zoneId);
  }

  // Esc while walking: the pause menu.
  pause() {
    if (this.mode !== 'walk') return;
    this.mode = 'menu';
    this.app.showHubMenu();
  }

  resume() {
    this.mode = 'walk';
    this._lockHint(true);
  }

  // ---- input -------------------------------------------------------------------------------

  onLockChange(locked) {
    if (locked) { this._lockHint(false); return; }
    if (this.mode === 'walk') this.pause();
  }

  _lockHint(v) {
    this.hud.lock.style.display = v && !this.app.input.locked ? '' : 'none';
  }

  _key(e) {
    if (this.mode === 'station' && this.panel) {
      if (e.code === 'Escape' || (e.code === 'Tab' && !e.target.closest('input'))) { e.preventDefault(); this.closeStation(); return; }
      this.panel.onKey?.(e);
    }
  }

  _canvasPointer(e, click) {
    if (this.mode === 'walk' && click && !this.app.input.locked) {
      this.app.audio.init();
      this.app.input.requestLock();
      return;
    }
    if (this.mode !== 'station' || !this.panel) return;
    const r = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    if (click) this.panel.onCanvasClick?.(this.ray, e);
    else this.panel.onCanvasMove?.(this.ray, e);
  }

  // ---- frame -------------------------------------------------------------------------------

  update(dt) {
    const input = this.app.input;
    this.t += dt;
    if (this.mode === 'title') this._titleCam(dt);
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = easeInOut(Math.min(1, tw.t / tw.dur));
      this.camera.position.lerpVectors(tw.fromP, tw.toP, k);
      this.camera.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, k);
      if (tw.t >= tw.dur) { this.tween = null; tw.done?.(); }
    }
    if (this.mode === 'walk') {
      this._barks(dt);
      this.objT = (this.objT || 0) - dt;
      if (this.objT <= 0) { this.objT = 1; this._objective(); }
      const look = input.consumeLook();
      if (input.locked) this.player.lookInput(look.x, look.y);
      this.player.update(dt, {
        moveX: input.moveX, moveZ: input.moveZ, sprint: input.isDown('ShiftLeft'),
        crouchToggle: input.wasPressed('KeyC') || input.wasPressed('ControlLeft'), speedMul: 0.9, time: this.t,
      });
      this.player.health = this.player.maxHealth;
      this.player.applyCamera(this.t);
      this.camera.updateMatrixWorld();
      this._aimAtStation();
      if (input.wasPressed('KeyE') && this.target) this.openStation(this.target);
      if (input.wasPressed('Tab') && this.boat.stations) {
        const st = this.boat.stations.find((s) => s.id === 'stash');
        if (st) this.openStation(st);
      }
    } else input.consumeLook();
    if (this.panel) this.panel.update?.(dt);
    this._marker();
    // the stash lid
    const lid = this.boat.stashLid;
    if (lid) lid.rotation.x += ((this.lidOpen ? -1.2 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
    this.boat.update(dt, this.camera.position);
    this._ambience(dt);
  }

  _titleCam() {
    const t = this.t;
    const a = 0.72 + Math.sin(t * 0.045) * 0.35;
    const r = 25 + Math.sin(t * 0.07) * 2;
    this.camera.position.set(Math.sin(a) * r + 2, 5.2 + Math.sin(t * 0.21) * 0.25, -Math.cos(a) * r - 2);
    // the boat sits to the right of the title
    this.camera.lookAt(6, 3.2, 6);
    this.titlePos = this.camera.position.clone();
    this.titleQ = this.camera.quaternion.clone();
  }

  _aimAtStation() {
    const cam = this.camera;
    cam.getWorldPosition(_v);
    const o = _v.clone();
    const d = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bt = 2.6;
    for (const s of this.boat.stations) {
      const t = rayBox(o, d, s.hit);
      if (t !== null && t < bt) { bt = t; best = s; }
    }
    this.target = best;
    let html = '';
    if (best) {
      let sub = '';
      if (best.id === 'skiff') sub = ` — ${zoneById(this.p.lastZone || 'cypress').name}`;
      html = `<span class="key">E</span><span>${best.verb}<b>${best.label}${sub}</b></span>`;
    }
    if (this.hud.prompt.dataset.h !== html) { this.hud.prompt.innerHTML = html; this.hud.prompt.dataset.h = html; }
  }

  _ambience(dt) {
    if (this.mode === 'title' || !this.app.audio.enabled) return;
    this.ambT = (this.ambT ?? 6) - dt;
    if (this.ambT > 0) return;
    this.ambT = 7 + Math.random() * 14;
    const r = Math.random();
    if (r < 0.45) this.audio.frogs();
    else if (r < 0.7) this.audio.creak();
    else if (r < 0.85) this.audio.chime();
    else this.audio.gatorBellow();
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.boat.resize(w, h);
  }

  // ---- hub HUD -----------------------------------------------------------------------------

  _buildHud() {
    const root = document.createElement('div');
    root.id = 'hubhud';
    root.className = 'layer';
    root.style.display = 'none';
    root.innerHTML = `
      <div class="hh-where"><span class="hh-boat">The Magnolia</span><span class="hh-day"></span></div>
      <div class="hh-obj"></div>
      <div class="hh-mark"><i></i><span></span></div>
      <div class="hh-bark"></div>
      <div class="hh-dot"></div>
      <div class="hh-prompt"></div>
      <div class="hh-lock">Click to look around</div>
      <div class="hh-status"></div>
      <div class="hh-keys"><span class="key">WASD</span> walk <span class="key">E</span> use <span class="key">Tab</span> stash <span class="key">Esc</span> menu</div>`;
    this.app.uiRoot.appendChild(root);
    return {
      root, prompt: root.querySelector('.hh-prompt'), lock: root.querySelector('.hh-lock'), status: root.querySelector('.hh-status'), day: root.querySelector('.hh-day'),
      obj: root.querySelector('.hh-obj'), mark: root.querySelector('.hh-mark'), markTxt: root.querySelector('.hh-mark span'), bark: root.querySelector('.hh-bark'),
    };
  }

  _status() {
    const p = this.p;
    const maxH = maxHealthFor(p.nourishment);
    const z = zoneById(p.lastZone || 'cypress');
    this.hud.day.textContent = `Day ${p.day}`;
    this.hud.status.innerHTML = `
      <div class="row"><span class="label">Health</span><div class="bar hp"><em style="left:${maxH}%;right:0"></em><span style="width:${p.health}%"></span></div><span class="v num">${Math.ceil(p.health)}</span></div>
      <div class="row"><span class="label">Fed</span><div class="bar st"><span style="width:${p.nourishment}%"></span></div><span class="v num">${Math.round(p.nourishment)}</span></div>
      <div class="hh-next"><span class="label">Next trip</span> ${z.name}</div>`;
    this._objective();
  }

  refreshStatus() { this._status(); }

  // The story objective, top left, and a marker over whatever it points at aboard.
  _objective() {
    const o = objective(this.p);
    this.obj = o;
    const el = this.hud.obj;
    if (!o) { el.innerHTML = ''; el.dataset.h = ''; this.objWhere = null; return; }
    const away = o.zone || o.zones;
    const html = `<span class="hh-ch">${esc(o.chapter)}</span><b>${esc(o.text)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}${away && !o.where ? '<small class="go">Plan the trip at the bulletin board</small>' : ''}`;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    if (this._objFlash) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      this._objFlash = false;
    }
    this.objWhere = o.where || (away ? 'board' : null);
  }

  _marker() {
    const m = this.hud.mark;
    const st = this.mode === 'walk' && this.objWhere && this.boat.stations.find((s) => s.id === this.objWhere);
    if (!st) { m.style.display = 'none'; return; }
    const pos = st.npc ? _v.copy(this.boat.crew.get(st.id).head).setY(2.05) : _v.set((st.hit.x0 + st.hit.x1) / 2, st.hit.y1 + 0.15, (st.hit.z0 + st.hit.z1) / 2);
    const dist = Math.hypot(pos.x - this.camera.position.x, pos.z - this.camera.position.z);
    const local = pos.clone().applyMatrix4(this.camera.matrixWorldInverse);
    let x, y;
    if (local.z < -0.1) {
      pos.project(this.camera);
      x = pos.x; y = pos.y;
    } else {
      // behind you: pin it to the side you'd turn toward
      x = local.x >= 0 ? 1 : -1; y = 0;
    }
    const edge = Math.abs(x) > 0.92 || Math.abs(y) > 0.85;
    x = Math.max(-0.92, Math.min(0.92, x));
    y = Math.max(-0.85, Math.min(0.85, y));
    m.style.display = '';
    m.style.left = `${(x * 0.5 + 0.5) * 100}%`;
    m.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
    m.classList.toggle('edge', edge);
    const name = st.npc ? CREW[st.id].name.split(' ')[0] : st.label;
    const txt = dist < 2.2 ? name : `${name} · ${Math.round(dist)}m`;
    if (this.hud.markTxt.textContent !== txt) this.hud.markTxt.textContent = txt;
  }

  // Something said in passing when you walk up to one of the crew.
  _barks(dt) {
    this.barkT = Math.max(0, (this.barkT || 0) - dt);
    if (this.barkT <= 0) this.hud.bark.classList.remove('show');
    for (const m of this.boat.crew.members) {
      if (!m.near) { if (m.barked && m.distFar) m.barked = false; continue; }
      if (m.barked || this.barkT > 0) continue;
      m.barked = true;
      const line = m.c.barks[Math.floor(Math.random() * m.c.barks.length)];
      this.hud.bark.innerHTML = `<b>${esc(m.c.name.split(' ')[0])}</b> ${esc(line)}`;
      this.hud.bark.classList.add('show');
      this.barkT = 3.2;
      m.talk = true;
      setTimeout(() => { m.talk = false; }, 900);
    }
  }

  dispose() {
    this._closePanel();
    this.hud.root.remove();
    const canvas = this.app.renderer.domElement;
    canvas.removeEventListener('mousemove', this._onMove);
    canvas.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
  }
}

// Ray against an axis-aligned box; returns the entry distance or null.
function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity;
  for (const [oa, da, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(da) < 1e-8) {
      if (oa < lo || oa > hi) return null;
    } else {
      let a = (lo - oa) / da, c = (hi - oa) / da;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

export { rayBox, lookQuat };
