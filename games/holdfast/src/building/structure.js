// A Structure is a set of grid pieces with an origin. World buildings and
// player bases are both Structures, so anything built by the world generator
// can be altered by the player once it sits inside their claim.
import * as THREE from 'three';
import { GeoBuilder, rgb, mulc } from '../geom.js';
import { materialForBucket as materialFor } from '../atlas.js';
import { meshStructure } from './mesher.js';
import { CELL, STORY, getStyle } from './defs.js';
import { hashStr, mulberry32 } from '../util.js';

let NEXT_ID = 1;
export function bumpStructureIds(n) { NEXT_ID = Math.max(NEXT_ID, n); }

export class Structure {
  constructor(opts = {}) {
    this.id = opts.id || 'S' + NEXT_ID++;
    this.name = opts.name || 'Building';
    this.kind = opts.kind || 'house';
    // origin: local (0,0) cell corner in world; oy = world height of level-0 floor top
    this.ox = opts.ox || 0;
    this.oz = opts.oz || 0;
    this.oy = opts.oy || 0;
    this.floors = new Map();
    this.walls = new Map();
    this.roofs = new Map();
    this.stairs = new Map();
    this.columns = new Map();
    this.props = [];
    this.group = new THREE.Group();
    this.group.name = 'structure:' + this.id;
    this.boxes = [];      // world-space collision boxes
    this.doors = [];      // Door objects
    this.interact = [];   // interactables (loot containers etc.)
    this.dirty = true;
    this.owner = opts.owner || null; // claim id when inside a claim
  }

  // ---------- editing ----------
  setFloor(x, z, l, style = 'wood', found = 'concrete') { this.floors.set(`${x},${z},${l}`, { style, found }); this.dirty = true; }
  setWall(x, z, l, a, shape = 'solid', style = 'white_siding', flip = false, extra = {}) {
    this.walls.set(`${x},${z},${l},${a}`, { shape, style, flip, ...extra }); this.dirty = true;
  }
  setRoof(x, z, l, dir, pitch = 1, style = 'black_shingle') { this.roofs.set(`${x},${z},${l}`, { dir, pitch, style }); this.dirty = true; }
  setStair(x, z, l, dir, color) { this.stairs.set(`${x},${z},${l}`, { dir, color }); this.dirty = true; }
  setColumn(x, z, l, color = '#f4f2ec') { this.columns.set(`${x},${z},${l}`, { color }); this.dirty = true; }
  addProp(type, x, y, z, rot = 0, data = {}) {
    const p = { type, x, y, z, rot, ...data };
    this.props.push(p);
    this.dirty = true;
    return p;
  }

  // Convert world point -> local metres
  toLocal(wx, wy, wz) { return [wx - this.ox, wy - this.oy, wz - this.oz]; }
  levelY(l) { return this.oy + l * STORY; }

  // Footprint in cells (for occupancy / terrain levelling)
  footprintCells() {
    const set = new Set();
    for (const k of this.floors.keys()) {
      const [x, z, l] = k.split(',').map(Number);
      if (l === 0) set.add(`${x},${z}`);
    }
    return set;
  }
  bounds() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, l1 = 0;
    const eat = (x, z, l) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x + 1); z1 = Math.max(z1, z + 1); l1 = Math.max(l1, l); };
    for (const m of [this.floors, this.roofs, this.stairs]) for (const k of m.keys()) { const [x, z, l] = k.split(',').map(Number); eat(x, z, l); }
    for (const k of this.walls.keys()) { const [x, z, l] = k.split(',').map(Number); eat(x, z, l); }
    if (x0 === Infinity) return null;
    return { x0, z0, x1, z1, levels: l1 + 1,
      wx0: this.ox + x0 * CELL, wz0: this.oz + z0 * CELL, wx1: this.ox + x1 * CELL, wz1: this.oz + z1 * CELL };
  }

  // ---------- meshing ----------
  // ground(wx, wz) -> world terrain height
  rebuild(ground, opts = {}) {
    // dispose old
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
    for (const d of this.doors) d.dispose();
    this.doors = [];
    const origin = [this.ox, this.oy, this.oz];
    const lvl = new Map(), caps = new Map();
    const builders = {
      get: (l) => { if (!lvl.has(l)) lvl.set(l, new GeoBuilder(origin)); return lvl.get(l); },
      cap: (l) => { if (!caps.has(l)) caps.set(l, new GeoBuilder(origin)); return caps.get(l); },
    };
    const localGround = (lx, lz) => ground(lx + this.ox, lz + this.oz) - this.oy;
    const out = meshStructure(this, builders, localGround);
    this.levelGroups = [];
    this.capGroups = [];
    const addMeshes = (builder, group) => {
      for (const [key, geo] of builder.build()) {
        const mesh = new THREE.Mesh(geo, materialFor(key));
        mesh.castShadow = key !== 'glass';
        mesh.receiveShadow = true;
        if (key === 'glass') mesh.renderOrder = 2;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    };
    const maxL = Math.max(0, ...lvl.keys(), ...caps.keys());
    for (let l = 0; l <= maxL; l++) {
      const g = new THREE.Group();
      g.name = 'level' + l;
      g.userData.level = l;
      if (lvl.has(l)) addMeshes(lvl.get(l), g);
      this.levelGroups.push(g);
      this.group.add(g);
      const c = new THREE.Group();
      c.name = 'cap' + l;
      c.visible = false;
      if (caps.has(l)) addMeshes(caps.get(l), c);
      this.capGroups.push(c);
      this.group.add(c);
    }
    this.group.position.set(this.ox, this.oy, this.oz);
    this.group.updateMatrixWorld(true);
    // collision boxes -> world space
    this.boxes = out.boxes.map((b) => ({
      min: [b.min[0] + this.ox, b.min[1] + this.oy, b.min[2] + this.oz],
      max: [b.max[0] + this.ox, b.max[1] + this.oy, b.max[2] + this.oz],
      kind: b.kind, owner: this,
    }));
    // doors
    const rng = mulberry32(hashStr(this.id));
    for (const d of out.doors) {
      const door = new Door(this, d, rng);
      this.doors.push(door);
      (this.levelGroups[d.level] || this.group).add(door.pivot);
    }
    if (this.cutaway != null) this.setCutaway(this.cutaway);
    this.interact = out.interact.map((it) => ({ ...it, owner: this,
      pos: [it.pos[0] + this.ox, it.pos[1] + this.oy, it.pos[2] + this.oz] }));
    this.dirty = false;
    return this;
  }

  // Show levels up to `level` (with wall caps on top); null shows everything.
  setCutaway(level) {
    this.cutaway = level;
    (this.levelGroups || []).forEach((g, l) => { g.visible = level == null || l <= level; });
    (this.capGroups || []).forEach((g, l) => { g.visible = level != null && l === level; });
  }

  // ---------- serialisation ----------
  toJSON() {
    return {
      id: this.id, name: this.name, kind: this.kind, ox: this.ox, oy: this.oy, oz: this.oz, owner: this.owner,
      floors: [...this.floors], walls: [...this.walls], roofs: [...this.roofs],
      stairs: [...this.stairs], columns: [...this.columns], props: this.props,
    };
  }
  static fromJSON(j) {
    const s = new Structure(j);
    s.floors = new Map(j.floors); s.walls = new Map(j.walls); s.roofs = new Map(j.roofs);
    s.stairs = new Map(j.stairs); s.columns = new Map(j.columns); s.props = j.props || [];
    return s;
  }
}

// ------------------------------------------------------------------
// Doors: hinged leaves that open toward one side.
// ------------------------------------------------------------------
const DOOR_COLORS = ['#7a2a24', '#2f4a3a', '#efece4', '#1f2d3d', '#6b4a32', '#8a6a3a', '#3d3d3d'];
export class Door {
  constructor(structure, d, rng) {
    this.structure = structure;
    this.def = d;
    this.open = false;
    this.angle = 0;       // current
    this.target = 0;
    this.pivot = new THREE.Group();
    this.pivot.position.set(d.hinge[0], d.hinge[1], d.hinge[2]);
    this.health = d.barn ? 160 : 100;
    const b = new GeoBuilder([0, 0, 0]);
    const w = d.width - 0.01, h = d.height - 0.01, t = 0.05;
    // leaf geometry in pivot space: along local +X from hinge (or -X), thickness in Z
    const sgnE = d.hingeLow ? 1 : -1;
    const x0 = sgnE > 0 ? 0.005 : -w - 0.005, x1 = x0 + w;
    const st = getStyle(d.style);
    if (d.barn) {
      const c = rgb(st.a.color);
      b.box(st.a.mat, x0, 0.005, -t / 2, x1, h, t / 2, c);
      // Z brace and frame in white trim
      const tc = rgb(st.trim);
      const fr = 0.12;
      for (const s of [-1, 1]) {
        const z = s * (t / 2 + 0.015);
        const zz0 = Math.min(z, s * t / 2), zz1 = Math.max(z, s * t / 2);
        b.box('plain:paint', x0, 0.005, zz0, x1, fr, zz1, tc);
        b.box('plain:paint', x0, h - fr, zz0, x1, h, zz1, tc);
        b.box('plain:paint', x0, h / 2 - fr / 2, zz0, x1, h / 2 + fr / 2, zz1, tc);
        b.box('plain:paint', x0, fr, zz0, x0 + fr, h - fr, zz1, tc);
        b.box('plain:paint', x1 - fr, fr, zz0, x1, h - fr, zz1, tc);
        // diagonal brace (approximated by stepped boxes)
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const ta = i / steps, tb = (i + 1) / steps;
          const xa = x0 + fr + (x1 - x0 - 2 * fr) * ta, xb = x0 + fr + (x1 - x0 - 2 * fr) * tb;
          const ya = fr + (h / 2 - 1.5 * fr) * ta, yb = fr + (h / 2 - 1.5 * fr) * tb + fr * 0.7;
          b.box('plain:paint', xa, ya, zz0, xb, yb, zz1, tc);
        }
      }
    } else if (d.glass) {
      const c = rgb('#2b2f33');
      const f = 0.09;
      b.box('plain:metal', x0, 0.005, -t / 2, x1, f * 1.4, t / 2, c);
      b.box('plain:metal', x0, h - f, -t / 2, x1, h, t / 2, c);
      b.box('plain:metal', x0, f * 1.4, -t / 2, x0 + f, h - f, t / 2, c);
      b.box('plain:metal', x1 - f, f * 1.4, -t / 2, x1, h - f, t / 2, c);
      b.box('plain:metal', x0 + f, 0.95, -t / 2 - 0.01, x1 - f, 1.02, t / 2 + 0.01, mulc(c, 1.6));
      b.quad('glass', [x0 + f, f * 1.4, 0], [x1 - f, f * 1.4, 0], [x1 - f, h - f, 0], [x0 + f, h - f, 0], [1, 1, 1]);
    } else {
      const col = rgb(d.color || DOOR_COLORS[Math.floor(rng() * DOOR_COLORS.length)]);
      b.box('plain:paint', x0, 0.005, -t / 2, x1, h, t / 2, col);
      // raised panels on both faces
      const pw = (w - 0.3) / 2;
      for (const s of [-1, 1]) {
        const z0 = s > 0 ? t / 2 : -t / 2 - 0.012, z1 = s > 0 ? t / 2 + 0.012 : -t / 2;
        const panels = [[0.12, 0.12 + pw, 0.15, h * 0.42], [w - 0.12 - pw, w - 0.12, 0.15, h * 0.42],
          [0.12, 0.12 + pw, h * 0.5, h - 0.15], [w - 0.12 - pw, w - 0.12, h * 0.5, h - 0.15]];
        for (const [a0, a1, b0, b1] of panels) b.box('plain:paint', x0 + a0, b0, z0, x0 + a1, b1, z1, mulc(col, 0.88));
      }
      // knob on the far side from the hinge
      const kx = sgnE > 0 ? x1 - 0.08 : x0 + 0.08;
      for (const s of [-1, 1]) {
        const kz = s * (t / 2 + 0.03);
        b.box('plain:chrome', kx - 0.03, 0.95, Math.min(kz, s * t / 2) - 0.01, kx + 0.03, 1.01, Math.max(kz, s * t / 2) + 0.01, [0.85, 0.75, 0.45]);
      }
    }
    this.leaf = new THREE.Group();
    for (const [key, geo] of b.build()) {
      const m = new THREE.Mesh(geo, materialFor(key));
      m.castShadow = key !== 'glass';
      m.receiveShadow = true;
      this.leaf.add(m);
    }
    // orient: local X along the wall's e axis, local Z along normal axis
    const yaw = d.a === 0 ? 0 : -Math.PI / 2; // e axis +X (a=0) or +Z (a=1)
    this.baseYaw = yaw;
    this.pivot.rotation.y = yaw;
    this.pivot.add(this.leaf);
    // opening direction: rotate so the free edge moves toward swing side
    // rotating +90deg about Y moves local +X toward -Z (local)
    const localNormalSign = d.a === 0 ? d.swing : -d.swing; // map wall normal axis to local Z
    this.openDir = (sgnE > 0 ? 1 : -1) * (localNormalSign > 0 ? -1 : 1);
  }
  get worldHinge() {
    const s = this.structure;
    return [this.def.hinge[0] + s.ox, this.def.hinge[1] + s.oy, this.def.hinge[2] + s.oz];
  }
  // centre of the doorway (world)
  get center() {
    const s = this.structure, d = this.def;
    const e = d.hingeLow ? d.width / 2 : -d.width / 2;
    return [d.hinge[0] + d.eAxis[0] * e + s.ox, d.hinge[1] + 1 + s.oy, d.hinge[2] + d.eAxis[2] * e + s.oz];
  }
  toggle() { this.setOpen(!this.open); }
  setOpen(v) {
    this.open = v;
    this.target = v ? (Math.PI / 2) * 0.96 * this.openDir : 0;
  }
  update(dt) {
    if (Math.abs(this.angle - this.target) < 1e-3) return false;
    const sp = 4.5 * dt;
    this.angle += Math.max(-sp, Math.min(sp, this.target - this.angle));
    this.leaf.rotation.y = this.angle;
    return true;
  }
  // Collision box (world) of the leaf in its current target state.
  collider() {
    const s = this.structure, d = this.def;
    const hx = d.hinge[0] + s.ox, hy = d.hinge[1] + s.oy, hz = d.hinge[2] + s.oz;
    const e = d.eAxis, n = d.nAxis;
    const se = d.hingeLow ? 1 : -1;
    const t = 0.06;
    let ax, az, bx, bz;
    if (!this.open) {
      ax = hx; az = hz;
      bx = hx + e[0] * d.width * se; bz = hz + e[2] * d.width * se;
      const minx = Math.min(ax, bx) - n[0] * t, maxx = Math.max(ax, bx) + n[0] * t;
      const minz = Math.min(az, bz) - n[2] * t, maxz = Math.max(az, bz) + n[2] * t;
      return { min: [minx, hy, minz], max: [maxx, hy + d.height, maxz], kind: 'door', owner: s, door: this };
    }
    // open: leaf along the normal axis on the swing side
    const sw = d.swing;
    ax = hx; az = hz;
    bx = hx + n[0] * d.width * sw; bz = hz + n[2] * d.width * sw;
    const off = 0.06 * se;
    const minx = Math.min(ax, bx) - e[0] * t + e[0] * off, maxx = Math.max(ax, bx) + e[0] * t + e[0] * off;
    const minz = Math.min(az, bz) - e[2] * t + e[2] * off, maxz = Math.max(az, bz) + e[2] * t + e[2] * off;
    return { min: [Math.min(minx, maxx), hy, Math.min(minz, maxz)], max: [Math.max(minx, maxx), hy + d.height, Math.max(minz, maxz)], kind: 'door', owner: s, door: this };
  }
  dispose() {
    this.leaf.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.pivot.parent) this.pivot.parent.remove(this.pivot);
  }
}
