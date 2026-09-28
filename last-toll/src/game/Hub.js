import * as THREE from 'three';
import { Magnolia } from '../scenes/Magnolia.js';
import { Player } from '../entities/Player.js';
import { zoneById } from '../data/zones.js';
import { STASH_CAP, packCapacity, maxHealthFor, addToList, saveProfile, refreshContracts } from './Profile.js';
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
    const P = PANELS[st.id];
    if (!P) return;
    this.mode = 'station';
    this.station = st;
    this.app.input.exitLock();
    this.hud.prompt.innerHTML = '';
    this.hud.root.style.display = 'none';
    this.audio.mech('bench');
    if (st.id === 'stash') this.lidOpen = 1;
    this.panel = new P(this, st);
    // frame the station in the part of the screen its panel leaves open
    const view = this._frame(st, this.panel.el);
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
      <div class="hh-dot"></div>
      <div class="hh-prompt"></div>
      <div class="hh-lock">Click to look around</div>
      <div class="hh-status"></div>
      <div class="hh-keys"><span class="key">WASD</span> walk <span class="key">E</span> use <span class="key">Tab</span> stash <span class="key">Esc</span> menu</div>`;
    this.app.uiRoot.appendChild(root);
    return { root, prompt: root.querySelector('.hh-prompt'), lock: root.querySelector('.hh-lock'), status: root.querySelector('.hh-status'), day: root.querySelector('.hh-day') };
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
  }

  refreshStatus() { this._status(); }

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
