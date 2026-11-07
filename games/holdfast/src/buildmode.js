// Build mode: an architect camera over your claim, a ghost preview snapped to
// the 2 m grid, and tools for floors, walls, roofs, stairs, columns and
// furniture. Placing onto an existing piece alters it; Remove salvages it.
import * as THREE from 'three';
import { Structure } from './building/structure.js';
import { GeoBuilder } from './geom.js';
import { meshStructure } from './building/mesher.js';
import {
  CELL, STORY, shapes, styles, FLOOR_STYLES, FOUNDATIONS, ROOF_STYLES, PITCHES, MAT_COST_KIND, getStyle, shapeGrid,
  CELL_SOLID, CELL_WINDOW, CELL_DOOR,
} from './building/defs.js';
import { FURNITURE_CATALOG } from './building/furniture.js';
import { WallDesigner } from './designer.js';
import { isTouch } from './platform.js';

const TOOLS = [
  ['floor', 'Floor'], ['wall', 'Wall'], ['roof', 'Roof'], ['stairs', 'Stairs'], ['column', 'Post'], ['furniture', 'Furnish'], ['remove', 'Remove'],
];
const MAX_LEVEL = 4;

export class BuildMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tool = 'wall';
    this.level = 0;
    this.opt = {
      floor: 'wood', found: 'concrete', shape: 'window', style: 'white_siding', flip: false, mirror: false,
      roofStyle: 'black_shingle', pitch: 1.0, dir: 0, furniture: 'bed', frot: 0, columnColor: '#f4f2ec',
    };
    this.cam = { yaw: 0, pitch: -0.95, dist: 26, pivot: new THREE.Vector3() };
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(0, 0);
    this.ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x7fd07a, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xe0583a, transparent: true, opacity: 0.5, depthWrite: false });
    this.ghost = new THREE.Group();
    this.ghost.renderOrder = 5;
    game.scene.add(this.ghost);
    this.gridLines = null;
    this.designer = new WallDesigner(game, this);
    this.buildUI();
    this.bindInput();
  }

  // ---------------- UI ----------------
  buildUI() {
    const el = this.el = document.createElement('div');
    el.className = 'build-ui';
    el.hidden = true;
    el.innerHTML = `
      <div class="b-top">
        <div class="b-title"><b>Building</b><span id="b-claim"></span></div>
        <div class="b-level"><button id="b-lvl-dn" aria-label="Level down">−</button><span id="b-lvl">Ground floor</span><button id="b-lvl-up" aria-label="Level up">+</button></div>
        <button id="b-done" class="primary">Done</button>
      </div>
      <div class="b-bottom">
        <div class="b-opts" id="b-opts"></div>
        <div class="b-tools" id="b-tools">${TOOLS.map(([k, n]) => `<button data-tool="${k}">${n}</button>`).join('')}<button id="b-hide" title="Show or hide options">Options ▾</button></div>
      </div>
      <div class="b-info" id="b-info"></div>
      <div class="b-touch" ${isTouch ? '' : 'hidden'}>
        <button id="b-rot">Rotate</button><button id="b-flip">Flip</button><button id="b-place" class="primary">Place</button>
      </div>`;
    document.getElementById('ui').appendChild(el);
    const $ = (id) => el.querySelector('#' + id);
    this.$ = $;
    $('b-done').addEventListener('click', () => this.exit());
    $('b-hide').addEventListener('click', () => { const o = $('b-opts'); o.classList.toggle('collapsed'); $('b-hide').textContent = o.classList.contains('collapsed') ? 'Options ▴' : 'Options ▾'; });
    $('b-lvl-up').addEventListener('click', () => this.setLevel(this.level + 1));
    $('b-lvl-dn').addEventListener('click', () => this.setLevel(this.level - 1));
    for (const b of el.querySelectorAll('[data-tool]')) b.addEventListener('click', () => this.setTool(b.dataset.tool));
    if (isTouch) {
      $('b-rot').addEventListener('click', () => this.rotate());
      $('b-flip').addEventListener('click', () => this.flip());
      $('b-place').addEventListener('click', () => this.apply());
    }
  }
  setTool(t) {
    this.tool = t;
    for (const b of this.el.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    this.renderOptions();
    this.dirtyGhost = true;
  }
  setLevel(l) {
    this.level = Math.max(0, Math.min(MAX_LEVEL, l));
    const names = ['Ground floor', 'Second floor', 'Third floor', 'Fourth floor', 'Roof line'];
    this.$('b-lvl').textContent = names[this.level] || 'Level ' + (this.level + 1);
    if (this.claim) this.claim.structure.setCutaway(this.level);
    this.updateGridLines();
    this.dirtyGhost = true;
  }
  swatch(color, label, active, data, compact = false) {
    return `<button class="sw ${compact ? 'compact' : ''} ${active ? 'on' : ''}" ${data} title="${label}" aria-label="${label}"><span class="chip" style="background:${color}"></span><span>${label}</span></button>`;
  }
  renderOptions() {
    const o = this.opt, box = this.$('b-opts');
    let h = '';
    if (this.tool === 'floor') {
      h += `<div class="row">${Object.entries(FLOOR_STYLES).filter(([k]) => k !== 'attic').map(([k, f]) => this.swatch(f.top.color === '#ffffff' ? matColor(f.top.mat) : f.top.color, f.name, o.floor === k, `data-floor="${k}"`)).join('')}</div>`;
      h += `<div class="row small">Foundation: ${Object.entries(FOUNDATIONS).map(([k, f]) => `<button class="chipbtn ${o.found === k ? 'on' : ''}" data-found="${k}">${f.name}</button>`).join('')}</div>`;
    } else if (this.tool === 'wall') {
      h += `<div class="row shapes">${Object.entries(shapes).map(([k, s]) => `<button class="shape ${o.shape === k ? 'on' : ''}" data-shape="${k}" title="${s.name}"><canvas width="32" height="48" data-thumb="${k}"></canvas><span>${s.name}</span></button>`).join('')}</div>`;
      h += `<div class="row swatches">${Object.entries(styles).map(([k, st]) => this.swatch(st.a.color === '#ffffff' ? matColor(st.a.mat) : st.a.color, st.name, o.style === k, `data-style="${k}"`, true)).join('')}<span class="b-cur">${(styles[o.style] || {}).name || ''}</span></div>`;
      h += `<div class="row small"><button class="chipbtn ${o.flip ? 'on' : ''}" data-act="flip">Flip inside/outside (F)</button><button class="chipbtn ${o.mirror ? 'on' : ''}" data-act="mirror">Mirror (M)</button><button class="chipbtn accent" data-act="design">Wall designer…</button></div>`;
    } else if (this.tool === 'roof') {
      h += `<div class="row">${Object.entries(ROOF_STYLES).map(([k, r]) => this.swatch(r.top.color === '#ffffff' ? matColor(r.top.mat) : r.top.color, r.name, o.roofStyle === k, `data-roof="${k}"`)).join('')}</div>`;
      h += `<div class="row small">Pitch: ${PITCHES.map((p) => `<button class="chipbtn ${o.pitch === p ? 'on' : ''}" data-pitch="${p}">${({ 0.5: 'Low', 1: 'Normal', 1.5: 'Steep', 2: 'Barn', 2.5: 'Very steep' })[p]}</button>`).join('')} <button class="chipbtn" data-act="rotate">Turn downhill side (R)</button></div>`;
    } else if (this.tool === 'stairs') {
      h += `<div class="row small">Stairs run 4 m and climb one floor. Leave the floor above open over them. <button class="chipbtn" data-act="rotate">Turn (R)</button></div>`;
    } else if (this.tool === 'column') {
      h += `<div class="row small">Posts stand on grid corners and hold up porch roofs.</div>`;
    } else if (this.tool === 'furniture') {
      h += `<div class="row">${FURNITURE_CATALOG.map((f) => `<button class="chipbtn ${o.furniture === f.type ? 'on' : ''}" data-furn="${f.type}">${f.name} <small>${costText(f.cost)}</small></button>`).join('')}</div>`;
      h += `<div class="row small"><button class="chipbtn" data-act="rotate">Turn (R)</button></div>`;
    } else if (this.tool === 'remove') {
      h += `<div class="row small">Click a piece to take it down. You get its materials back.</div>`;
    }
    box.innerHTML = h;
    for (const b of box.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        const d = b.dataset;
        if (d.floor) o.floor = d.floor;
        if (d.found) o.found = d.found;
        if (d.shape) o.shape = d.shape;
        if (d.style) o.style = d.style;
        if (d.roof) o.roofStyle = d.roof;
        if (d.pitch) o.pitch = +d.pitch;
        if (d.furn) o.furniture = d.furn;
        if (d.act === 'flip') this.flip();
        if (d.act === 'mirror') { o.mirror = !o.mirror; }
        if (d.act === 'rotate') this.rotate();
        if (d.act === 'design') { this.designer.open(o.shape, o.style); return; }
        this.renderOptions();
        this.dirtyGhost = true;
      });
    }
    for (const c of box.querySelectorAll('canvas[data-thumb]')) drawShapeThumb(c, c.dataset.thumb, getStyle(o.style));
  }

  // ---------------- enter / exit ----------------
  enter(claim) {
    const g = this.game;
    this.claim = claim;
    this.active = true;
    g.input.exitLock();
    g.hud.setVisible(false);
    this.el.hidden = false;
    this.$('b-claim').textContent = ' · ' + (claim.structure.name || 'Your base');
    this.cam.pivot.copy(g.player.pos);
    this.cam.yaw = g.tpc.yaw;
    this.level = Math.max(0, Math.min(MAX_LEVEL, Math.round((g.player.pos.y - claim.structure.oy) / STORY)));
    this.setLevel(this.level);
    this.setTool(this.tool);
    g.input.uiCapture = false;
    // clear the view: no trees over the claim, no grass tufts
    if (g.world.trees) g.world.trees.setHidden([claim.x0 - 6, claim.z0 - 6, claim.x1 + 6, claim.z1 + 6]);
    if (g.world.grass) for (const m of g.world.grass.meshes) m.visible = false;
    this.updateCam(0);
  }
  exit() {
    const g = this.game;
    this.active = false;
    this.el.hidden = true;
    g.hud.setVisible(true);
    if (this.claim) this.claim.structure.setCutaway(null);
    if (g.world.trees) g.world.trees.setHidden(null);
    if (g.world.grass) for (const m of g.world.grass.meshes) m.visible = true;
    this.clearGhost();
    if (this.gridLines) { g.scene.remove(this.gridLines); this.gridLines.geometry.dispose(); this.gridLines = null; }
    g.markDirty && g.markDirty();
  }

  // ---------------- input ----------------
  bindInput() {
    const cv = this.game.renderer.domElement;
    let drag = null;
    cv.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) this.pan(-dx * this.cam.dist * 0.0018, -dy * this.cam.dist * 0.0018);
        else if (drag.orbit) { this.cam.yaw -= dx * 0.005; this.cam.pitch = Math.max(-1.45, Math.min(-0.15, this.cam.pitch - dy * 0.004)); }
      }
      this.dirtyGhost = true;
    });
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const touch = e.pointerType === 'touch';
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button, orbit: e.button === 2 || touch, pan: e.button === 1, touch };
      this.dirtyGhost = true;
    });
    addEventListener('pointerup', (e) => {
      if (!this.active || !drag) { drag = null; return; }
      if (!drag.moved && drag.button === 0) {
        if (drag.touch) { this.dirtyGhost = true; this.updateGhost(); } // tap aims; Place button commits
        else this.apply();
      }
      if (!drag.moved && drag.button === 2) this.removeAtCursor();
      drag = null;
    });
    cv.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.cam.dist = Math.max(6, Math.min(70, this.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: true });
    // pinch zoom
    let pinch = null;
    cv.addEventListener('touchstart', (e) => { if (this.active && e.touches.length === 2) { pinch = dist2(e.touches); drag = null; } }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (!this.active || !pinch || e.touches.length !== 2) return;
      const d = dist2(e.touches);
      this.cam.dist = Math.max(6, Math.min(70, this.cam.dist * pinch / d));
      pinch = d;
    }, { passive: true });
    cv.addEventListener('touchend', () => { pinch = null; });
  }
  pan(dx, dz) {
    // dx: screen right, dz: toward the camera
    const c = Math.cos(this.cam.yaw), s = Math.sin(this.cam.yaw);
    this.cam.pivot.x += dx * c + dz * s;
    this.cam.pivot.z += -dx * s + dz * c;
    this.clampPivot();
  }
  clampPivot() {
    const c = this.claim;
    this.cam.pivot.x = Math.max(c.x0 - 8, Math.min(c.x1 + 8, this.cam.pivot.x));
    this.cam.pivot.z = Math.max(c.z0 - 8, Math.min(c.z1 + 8, this.cam.pivot.z));
  }
  rotate() {
    const o = this.opt;
    if (this.tool === 'roof' || this.tool === 'stairs') o.dir = (o.dir + 1) % 4;
    else if (this.tool === 'furniture') o.frot = (o.frot + 1) % 4;
    else if (this.tool === 'wall') o.flip = !o.flip;
    this.dirtyGhost = true;
  }
  flip() { this.opt.flip = !this.opt.flip; this.renderOptions(); this.dirtyGhost = true; }

  update(dt) {
    if (!this.active) return;
    const inp = this.game.input;
    // keyboard
    const sp = this.cam.dist * 0.9 * dt;
    if (inp.down('KeyW')) this.pan(0, -sp);
    if (inp.down('KeyS')) this.pan(0, sp);
    if (inp.down('KeyA')) this.pan(-sp, 0);
    if (inp.down('KeyD')) this.pan(sp, 0);
    if (inp.pressed('KeyR')) this.rotate();
    if (inp.pressed('KeyF')) this.flip();
    if (inp.pressed('KeyM')) { this.opt.mirror = !this.opt.mirror; this.renderOptions(); this.dirtyGhost = true; }
    if (inp.pressed('KeyX') || inp.pressed('Delete')) this.removeAtCursor();
    if (inp.pressed('KeyE') || inp.pressed('PageUp')) this.setLevel(this.level + 1);
    if (inp.pressed('KeyQ') || inp.pressed('PageDown')) this.setLevel(this.level - 1);
    for (let i = 0; i < TOOLS.length; i++) if (inp.pressed('Digit' + (i + 1))) this.setTool(TOOLS[i][0]);
    if (inp.pressed('Escape') || inp.pressed('KeyB')) { this.exit(); return; }
    this.updateCam(dt);
    if (this.dirtyGhost) this.updateGhost();
  }
  updateCam() {
    const c = this.cam, cam = this.game.camera;
    const y = this.claim.structure.oy + this.level * STORY;
    c.pivot.y = y;
    const cp = Math.cos(c.pitch);
    cam.position.set(c.pivot.x + Math.sin(c.yaw) * cp * c.dist, y - Math.sin(c.pitch) * c.dist, c.pivot.z + Math.cos(c.yaw) * cp * c.dist);
    cam.lookAt(c.pivot);
    cam.fov = 55;
    cam.updateProjectionMatrix();
  }

  // ---------------- targeting ----------------
  // returns {wx, wz, lx, lz} on the current level plane, or null
  pick() {
    const S = this.claim.structure;
    this.ray.setFromCamera(this.mouse, this.game.camera);
    const y = S.oy + this.level * STORY;
    const r = this.ray.ray;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (y - r.origin.y) / r.direction.y;
    if (t < 0) return null;
    const wx = r.origin.x + r.direction.x * t, wz = r.origin.z + r.direction.z * t;
    return { wx, wz, lx: wx - S.ox, lz: wz - S.oz };
  }
  inClaim(lx0, lz0, lx1, lz1) {
    const S = this.claim.structure, c = this.claim;
    return S.ox + lx0 >= c.x0 - 1e-6 && S.ox + lx1 <= c.x1 + 1e-6 && S.oz + lz0 >= c.z0 - 1e-6 && S.oz + lz1 <= c.z1 + 1e-6;
  }
  // Compute the candidate action at the cursor.
  target() {
    const p = this.pick();
    if (!p) return null;
    const S = this.claim.structure, o = this.opt, l = this.level;
    const cx = Math.floor(p.lx / CELL), cz = Math.floor(p.lz / CELL);
    if (this.tool === 'floor') {
      return { type: 'floor', key: `${cx},${cz},${l}`, cells: [[cx, cz]], val: { style: o.floor, found: o.found }, ok: this.inClaim(cx * CELL, cz * CELL, cx * CELL + CELL, cz * CELL + CELL) };
    }
    if (this.tool === 'wall') {
      const fx = p.lx - cx * CELL, fz = p.lz - cz * CELL;
      const d = [fx, CELL - fx, fz, CELL - fz];
      const m = d.indexOf(Math.min(...d));
      const e = [[cx, cz, 1], [cx + 1, cz, 1], [cx, cz, 0], [cx, cz + 1, 0]][m];
      const [ex, ez, a] = e;
      const ok = this.inClaim(ex * CELL - (a === 1 ? 0.1 : 0), ez * CELL - (a === 0 ? 0.1 : 0), ex * CELL + (a === 0 ? CELL : 0.1), ez * CELL + (a === 1 ? CELL : 0.1));
      return { type: 'wall', key: `${ex},${ez},${l},${a}`, cells: [[cx, cz]], val: { shape: o.shape, style: o.style, flip: this.flipFor(ex, ez, a), mirror: o.mirror }, ok };
    }
    if (this.tool === 'roof') {
      return { type: 'roof', key: `${cx},${cz},${l}`, cells: [[cx, cz]], val: { dir: o.dir, pitch: o.pitch, style: o.roofStyle }, ok: this.inClaim(cx * CELL, cz * CELL, cx * CELL + CELL, cz * CELL + CELL) };
    }
    if (this.tool === 'stairs') {
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][o.dir];
      const c2 = [cx + D[0], cz + D[1]];
      const ok = this.inClaim(Math.min(cx, c2[0]) * CELL, Math.min(cz, c2[1]) * CELL, (Math.max(cx, c2[0]) + 1) * CELL, (Math.max(cz, c2[1]) + 1) * CELL) && l < MAX_LEVEL;
      return { type: 'stairs', key: `${cx},${cz},${l}`, cells: [[cx, cz], c2], val: { dir: o.dir }, ok };
    }
    if (this.tool === 'column') {
      const vx = Math.round(p.lx / CELL), vz = Math.round(p.lz / CELL);
      return { type: 'column', key: `${vx},${vz},${l}`, cells: [], val: { color: o.columnColor }, ok: this.inClaim(vx * CELL - 0.1, vz * CELL - 0.1, vx * CELL + 0.1, vz * CELL + 0.1) };
    }
    if (this.tool === 'furniture') {
      const sx = Math.round(p.lx / 0.25) * 0.25, sz = Math.round(p.lz / 0.25) * 0.25;
      return { type: 'prop', prop: { type: o.furniture, x: sx, y: l * STORY, z: sz, rot: o.frot }, cells: [], ok: this.inClaim(sx - 0.5, sz - 0.5, sx + 0.5, sz + 0.5) };
    }
    if (this.tool === 'remove') return this.removeTarget(p);
    return null;
  }
  // which side of a wall faces out: side A points away from the nearest existing floor
  flipFor(ex, ez, a) {
    const S = this.claim.structure, l = this.level;
    const neg = a === 0 ? S.floors.has(`${ex},${ez - 1},${l}`) : S.floors.has(`${ex - 1},${ez},${l}`);
    const pos = a === 0 ? S.floors.has(`${ex},${ez},${l}`) : S.floors.has(`${ex},${ez},${l}`);
    let flip = false; // side A faces -axis
    if (neg && !pos) flip = true; // inside is on the -axis side, so A (outside) faces +axis
    return this.opt.flip ? !flip : flip;
  }
  removeTarget(p) {
    const S = this.claim.structure, l = this.level;
    const cx = Math.floor(p.lx / CELL), cz = Math.floor(p.lz / CELL);
    // props near the point
    let best = null, bd = 0.8;
    for (const pr of S.props) {
      if (Math.abs(pr.y - l * STORY) > 0.5 || pr.type.startsWith('anchor') || pr.type === 'ceiling_light') continue;
      const d = Math.hypot(pr.x - p.lx, pr.z - p.lz);
      if (d < bd) { bd = d; best = pr; }
    }
    if (best) return { type: 'remove-prop', prop: best, ok: true };
    const fx = p.lx - cx * CELL, fz = p.lz - cz * CELL;
    const d = [fx, CELL - fx, fz, CELL - fz];
    const m = d.indexOf(Math.min(...d));
    if (d[m] < 0.45) {
      const [ex, ez, a] = [[cx, cz, 1], [cx + 1, cz, 1], [cx, cz, 0], [cx, cz + 1, 0]][m];
      const k = `${ex},${ez},${l},${a}`;
      if (S.walls.has(k)) return { type: 'remove', map: 'walls', key: k, ok: true };
    }
    const vk = `${Math.round(p.lx / CELL)},${Math.round(p.lz / CELL)},${l}`;
    if (S.columns.has(vk) && Math.hypot(p.lx - Math.round(p.lx / CELL) * CELL, p.lz - Math.round(p.lz / CELL) * CELL) < 0.4) return { type: 'remove', map: 'columns', key: vk, ok: true };
    for (const [k, st] of S.stairs) {
      const [sx, sz, sl] = k.split(',').map(Number);
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][st.dir];
      if (sl === l && ((sx === cx && sz === cz) || (sx + D[0] === cx && sz + D[1] === cz))) return { type: 'remove', map: 'stairs', key: k, ok: true };
    }
    const ck = `${cx},${cz},${l}`;
    if (S.roofs.has(ck)) return { type: 'remove', map: 'roofs', key: ck, ok: true };
    if (S.floors.has(ck)) return { type: 'remove', map: 'floors', key: ck, ok: true };
    return null;
  }

  // ---------------- costs ----------------
  cost(t) {
    if (!t) return {};
    if (t.type === 'floor') return t.key.endsWith(',0') ? { stone: 2, wood: 1 } : { wood: 2 };
    if (t.type === 'wall') return wallCost(t.val.shape, t.val.style);
    if (t.type === 'roof') return ROOF_STYLES[t.val.style].top.mat === 'roofMetal' ? { wood: 1, metal: 2 } : { wood: 2, stone: 1 };
    if (t.type === 'stairs') return { wood: 6 };
    if (t.type === 'column') return { wood: 1 };
    if (t.type === 'prop') return (FURNITURE_CATALOG.find((f) => f.type === t.prop.type) || {}).cost || { wood: 2 };
    return {};
  }
  refund(map, key, S, prop) {
    if (prop) return (FURNITURE_CATALOG.find((f) => f.type === prop.type) || {}).cost || { wood: 1 };
    const v = S[map].get(key);
    if (map === 'walls') return wallCost(v.shape, v.style);
    if (map === 'floors') return key.endsWith(',0') ? { stone: 2, wood: 1 } : { wood: 2 };
    if (map === 'roofs') return ROOF_STYLES[v.style] && ROOF_STYLES[v.style].top.mat === 'roofMetal' ? { wood: 1, metal: 2 } : { wood: 2, stone: 1 };
    if (map === 'stairs') return { wood: 6 };
    return { wood: 1 };
  }

  // ---------------- ghost ----------------
  clearGhost() {
    for (const c of [...this.ghost.children]) { this.ghost.remove(c); c.geometry && c.geometry.dispose(); }
  }
  updateGhost() {
    this.dirtyGhost = false;
    this.clearGhost();
    const t = this.cur = this.target();
    const info = this.$('b-info');
    if (!t) { info.textContent = ''; return; }
    const S = this.claim.structure;
    const G = new Structure({ id: 'ghost', ox: S.ox, oy: S.oy, oz: S.oz });
    let removing = false;
    if (t.type === 'floor') G.floors.set(t.key, t.val);
    else if (t.type === 'wall') G.walls.set(t.key, t.val);
    else if (t.type === 'roof') G.roofs.set(t.key, t.val);
    else if (t.type === 'stairs') G.stairs.set(t.key, t.val);
    else if (t.type === 'column') G.columns.set(t.key, t.val);
    else if (t.type === 'prop') G.props.push({ ...t.prop });
    else if (t.type === 'remove') { G[t.map].set(t.key, S[t.map].get(t.key)); removing = true; }
    else if (t.type === 'remove-prop') { G.props.push({ ...t.prop }); removing = true; }
    const lvl = new Map();
    const builders = { get: (l) => { if (!lvl.has(l)) lvl.set(l, new GeoBuilder([S.ox, S.oy, S.oz])); return lvl.get(l); }, cap: () => builders.get(99) };
    try { meshStructure(G, builders, () => -50); } catch (e) { console.warn(e); }
    const cost = removing ? null : this.cost(t);
    const afford = !cost || this.game.inventory.can(cost);
    const ok = t.ok && afford;
    const mat = removing ? this.ghostMatBad : ok ? this.ghostMatOk : this.ghostMatBad;
    for (const b of lvl.values()) for (const [, geo] of b.build()) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(S.ox, S.oy, S.oz);
      m.renderOrder = 5;
      this.ghost.add(m);
    }
    const replacing = (t.type === 'wall' && S.walls.has(t.key)) || (t.type === 'floor' && S.floors.has(t.key)) || (t.type === 'roof' && S.roofs.has(t.key));
    if (removing) info.innerHTML = `Take down · get back <b>${costText(t.type === 'remove-prop' ? this.refund(null, null, S, t.prop) : this.refund(t.map, t.key, S))}</b>`;
    else info.innerHTML = `${!t.ok ? '<span class="bad">Outside your claim</span> · ' : ''}${replacing ? 'Replace · ' : ''}Cost <b class="${afford ? '' : 'bad'}">${costText(cost)}</b>`;
  }

  // ---------------- apply ----------------
  apply() {
    const t = this.cur || this.target();
    if (!t) return;
    if (t.type === 'remove' || t.type === 'remove-prop') return this.doRemove(t);
    if (!t.ok) { this.game.hud.toast('That spot is outside your claim.', 2); return; }
    const S = this.claim.structure, inv = this.game.inventory;
    const cost = this.cost(t);
    // replacing refunds the old piece first
    let refund = null;
    if (t.type === 'wall' && S.walls.has(t.key)) refund = this.refund('walls', t.key, S);
    if (t.type === 'floor' && S.floors.has(t.key)) refund = this.refund('floors', t.key, S);
    if (t.type === 'roof' && S.roofs.has(t.key)) refund = this.refund('roofs', t.key, S);
    if (refund) inv.add(refund);
    if (!inv.pay(cost)) { if (refund) inv.pay(refund); this.game.hud.toast('Not enough materials: ' + costText(cost), 2.5); return; }
    if (t.type === 'floor') S.floors.set(t.key, t.val);
    else if (t.type === 'wall') S.walls.set(t.key, t.val);
    else if (t.type === 'roof') S.roofs.set(t.key, t.val);
    else if (t.type === 'stairs') {
      S.stairs.set(t.key, t.val);
      // open the floor above the stairwell
      for (const [cx, cz] of t.cells) S.floors.delete(`${cx},${cz},${this.level + 1}`);
    } else if (t.type === 'column') S.columns.set(t.key, t.val);
    else if (t.type === 'prop') S.props.push({ ...t.prop });
    this.commit(S, t);
    this.game.audio && this.game.audio.build();
  }
  removeAtCursor() {
    const p = this.pick();
    if (!p) return;
    const t = this.removeTarget(p);
    if (t) this.doRemove(t);
  }
  doRemove(t) {
    const S = this.claim.structure, inv = this.game.inventory;
    if (t.type === 'remove-prop') {
      inv.add(this.refund(null, null, S, t.prop));
      S.props.splice(S.props.indexOf(t.prop), 1);
    } else {
      inv.add(this.refund(t.map, t.key, S));
      S[t.map].delete(t.key);
    }
    this.commit(S, t);
    this.game.audio && this.game.audio.salvage();
  }
  commit(S, t) {
    const g = this.game, w = g.world;
    S.modified = true;
    // keep the ground below new foundations
    if (t.type === 'floor' && t.key.endsWith(',0')) {
      const [cx, cz] = t.key.split(',').map(Number);
      const x0 = S.ox + cx * CELL, z0 = S.oz + cz * CELL;
      w.terrain.clampBelow(x0, z0, x0 + CELL, z0 + CELL, S.oy - 0.12);
      w.terrain.refresh(x0 - 2, z0 - 2, x0 + CELL + 2, z0 + CELL + 2);
      w.clearVegetation(x0 - 0.5, z0 - 0.5, x0 + CELL + 0.5, z0 + CELL + 0.5);
    }
    w.attach(S);
    S._bb = null;
    S.setCutaway(this.level);
    this.dirtyGhost = true;
    g.markDirty && g.markDirty();
  }
  updateGridLines() {
    const g = this.game, c = this.claim;
    if (this.gridLines) { g.scene.remove(this.gridLines); this.gridLines.geometry.dispose(); }
    const y = c.structure.oy + this.level * STORY + 0.03;
    const pos = [];
    for (let x = c.x0; x <= c.x1; x += CELL) pos.push(x, y, c.z0, x, y, c.z1);
    for (let z = c.z0; z <= c.z1; z += CELL) pos.push(c.x0, y, z, c.x1, y, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.gridLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf3efe4, transparent: true, opacity: 0.28, depthWrite: false }));
    this.gridLines.renderOrder = 4;
    g.scene.add(this.gridLines);
  }
}

// ---------------- helpers ----------------
function dist2(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
export function costText(c) {
  const e = Object.entries(c || {}).filter(([, v]) => v > 0);
  return e.length ? e.map(([k, v]) => `${v} ${k}`).join(', ') : 'free';
}
export function wallCost(shapeId, styleId) {
  const st = getStyle(styleId);
  const kind = MAT_COST_KIND[st.a.mat] || 'wood';
  const g = shapeGrid(shapeId);
  let solid = 0, glass = 0, door = 0;
  for (const row of g) for (const c of row) { if (c === CELL_SOLID) solid++; else if (c === CELL_WINDOW) glass++; else if (c === CELL_DOOR) door++; }
  const frac = solid / 96;
  const c = { wood: 1 };
  c[kind] = (c[kind] || 0) + Math.max(1, Math.round(frac * 3));
  if (glass) c.metal = (c.metal || 0) + 1;
  if (door) c.wood += 1;
  return c;
}
const MAT_COLORS = {
  brick: '#9a4a36', paintedBrick: '#d8d0bf', siding: '#efece4', planks: '#a07a52', boardBatten: '#a3322a', metal: '#c4c7c9',
  cinder: '#c9c6c0', plaster: '#ebe4d2', wallpaper: '#e2d2ae', stone: '#a8a092', concrete: '#d0ccc4', woodFloor: '#a8784a',
  tileChecker: '#5a5a5a', tileWhite: '#f0f0ec', carpet: '#8c8070', linoleum: '#e9e2cc', shingles: '#4a4b4f', roofMetal: '#b8bcc0',
  shake: '#8a6a4c', tarRoof: '#3a3a3a',
};
export function matColor(m) { return MAT_COLORS[m] || '#999'; }
export function drawShapeThumb(cv, shapeId, style) {
  const ctx = cv.getContext('2d');
  const g = shapeGrid(shapeId);
  const W = cv.width, H = cv.height, cw = W / 8, ch = H / 12;
  ctx.clearRect(0, 0, W, H);
  const wall = style ? (style.a.color === '#ffffff' ? matColor(style.a.mat) : style.a.color) : '#ddd';
  for (let r = 0; r < 12; r++) for (let k = 0; k < 8; k++) {
    const c = g[r][k];
    ctx.fillStyle = c === '#' ? wall : c === 'w' ? '#8fb0c0' : c === 'd' ? '#6b4a32' : 'rgba(0,0,0,0)';
    ctx.fillRect(k * cw, H - (r + 1) * ch, cw + 0.5, ch + 0.5);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}
