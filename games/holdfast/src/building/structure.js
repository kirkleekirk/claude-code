// A Structure is a set of grid pieces with an origin. World buildings and
// player bases are both Structures, so anything built by the world generator
// can be altered by the player once it sits inside their claim.
import * as THREE from 'three';
import { GeoBuilder, rgb, mulc } from '../geom.js';
import { materialForBucket as materialFor } from '../atlas.js';
import { meshStructure } from './mesher.js';
import { CELL, STORY, getStyle } from './defs.js';
import { hashStr, mulberry32 } from '../util.js';
import { doorPool } from './doors.js';

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
  setStair(x, z, l, dir, color, side) { this.stairs.set(`${x},${z},${l}`, side ? { dir, color, side } : { dir, color }); this.dirty = true; }
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
    for (const d of this.doors) d.setVisible(level == null || d.def.level <= level);
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
    this.health = d.barn ? 160 : 100;
    const sgnE = d.hingeLow ? 1 : -1;
    const st = getStyle(d.style);
    this.color = new THREE.Color(d.barn ? st.a.color : (d.color || DOOR_COLORS[Math.floor(rng() * DOOR_COLORS.length)]));
    // orient: local X along the wall's e axis, local Z along normal axis
    this.baseYaw = d.a === 0 ? 0 : -Math.PI / 2; // e axis +X (a=0) or +Z (a=1)
    // opening direction: rotating +90deg about Y moves local +X toward -Z (local)
    const localNormalSign = d.a === 0 ? d.swing : -d.swing; // map wall normal axis to local Z
    this.openDir = sgnE * (localNormalSign > 0 ? -1 : 1);
    const pool = doorPool();
    if (pool) pool.alloc(this);
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
  setVisible(v) {
    const pool = doorPool();
    if (!pool || !this.slots) return;
    this.hidden = !v;
    if (v) pool.place(this);
    else { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (const { p, i } of this.slots) { p.mesh.setMatrixAt(i, z); p.mesh.instanceMatrix.needsUpdate = true; } }
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
    const pool = doorPool();
    if (pool && this.slots && !this.hidden) pool.place(this);
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
    const pool = doorPool();
    if (pool && this.slots) pool.free(this);
  }
}
