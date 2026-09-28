import * as THREE from 'three';
import { ChunkedBatcher, Batcher } from './Batcher.js';
import { DecalBatch } from './Decals.js';
import { World } from './World.js';
import { RNG } from '../core/rng.js';
import { rollContainer, rollItem } from '../data/loot.js';
import { grimeTexture, groundTexture } from './Textures.js';
import { CONTAINER_SPECS, containerHeight } from '../game/containers.js';

// Procedural flooded-parish city. A 4x4 grid of blocks separated by streets,
// bounded by a levee with two docks where the skiffs wait.
//   north = -z, south = +z, west = -x, east = +x

export const CITY_HALF = 76;
export const WORLD_HALF = 94;
const ROADS = [-72, -36, 0, 36, 72];
const ROAD_HW = 4;
const SIDEWALK = 1.5;
const T = 0.22; // exterior wall thickness

const C = {
  asphalt: 0x2d2e2f, line: 0x8f8455, sidewalk: 0x6c6a63, grass: 0x3d4829, dirt: 0x4f4534, gravel: 0x5a5852,
  roofs: [0x3a3634, 0x4a3a30, 0x55463a, 0x303a3a, 0x5a4a3a],
  house: [0x6f9088, 0xb09a5c, 0xa27464, 0x857599, 0x93a174, 0xbab2a2, 0x6886a2, 0x9a6656],
  trim: 0xcfc6b4, intWall: [0xa39a82, 0x8a9585, 0x9d8878, 0x9696a3, 0xa8a088], floor: [0x5a4030, 0x684a34, 0x4a3a2e],
  brick: [0x76483a, 0x684034, 0x815848], clinic: 0xb6b4aa, warehouse: [0x66706e, 0x5c6763, 0x76716a], concrete: 0x75736c,
  containers: [0x8a3a2a, 0x2a5a7a, 0x3a6a4a, 0xa0702a, 0x646868, 0x7a2a4a],
  cars: [0x6a2a24, 0x2a3a5a, 0x5a5a52, 0xa5a59d, 0x2a4a3a, 0x8a7a4a, 0x232323],
  wood: 0x5a4330, woodLight: 0x7a5c40, metal: 0x4a4c4e, olive: 0x4d5233, sand: 0x857656, tent: 0x565a3c,
  foliage: [0x2c3a20, 0x34401e, 0x394426, 0x283420], trunk: 0x3a2e22, moss: 0x7a8166, white: 0xcfcbbf,
};

const LOT_SCALE = { house: 'quarter', yard: 'quarter', shop: 'half', clinic: 'half', warehouse: 'whole', containers: 'whole', park: 'whole', checkpoint: 'whole', cemetery: 'whole', compound: 'whole' };

export { C, T, ROADS };

export class CityGen {
  // force: lot types that must appear (the story needs a checkpoint or a compound)
  constructor({ zone, seed, scene, loot, force = [] }) {
    this.zone = zone;
    this.force = force.slice();
    this.story = { signals: [], offering: null, relays: [] };
    this.rng = new RNG(seed);
    this.scene = scene;
    this.loot = loot;
    this.world = new World(WORLD_HALF);
    this.batch = new ChunkedBatcher(36);
    loot.batch = this.batch;
    this.clear = [];
    this.winClear = [];
    this.candidates = { street: [], interior: [], dormant: [], edge: [], checkpoint: [], guardPost: [], patrol: [] };
    this.decals = new DecalBatch();
    this.glow = new Batcher();
    this.floods = [];
    this.map = { roads: [], buildings: [], docks: [], props: [] };
    this.fires = [];
    this.extraLights = [];
  }

  build() {
    this._layout();
    return this._finish();
  }

  _layout() {
    this._ground();
    this._streets();
    // forced lots go in the middle of town, away from the levee and the skiffs
    const forced = {};
    for (const t of this.force) {
      for (let k = 0; k < 8; k++) {
        const key = `${this.rng.int(1, 2)},${this.rng.int(1, 2)}`;
        if (!forced[key]) { forced[key] = t; break; }
      }
    }
    for (let bi = 0; bi < 4; bi++) {
      for (let bj = 0; bj < 4; bj++) {
        const x0 = ROADS[bi] + ROAD_HW, x1 = ROADS[bi + 1] - ROAD_HW;
        const z0 = ROADS[bj] + ROAD_HW, z1 = ROADS[bj + 1] - ROAD_HW;
        this._block(x0, z0, x1, z1, forced[`${bi},${bj}`]);
      }
    }
    this._levee();
    this._horizon();
  }

  _finish() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grimeTexture() });
    const mesh = this.batch.build(mat);
    mesh.add(this.decals.build());
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (this.glow.vcount) mesh.add(this.glow.build(this.glowMat));
    const far = this.horizon.build(mat);
    far.castShadow = false;
    mesh.add(far);
    for (const rl of this.story.relays) {
      rl.group = new THREE.Group();
      rl.group.position.set(rl.x, 0, rl.z);
      const rm = rl.b.build(mat);
      rm.castShadow = true;
      rl.group.add(rm);
      rl.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2a18 }));
      rl.lamp.position.set(0, 14.7, 0);
      rl.group.add(rl.lamp);
      delete rl.b;
      mesh.add(rl.group);
    }
    this.scene.add(mesh);
    this.loot.finalize();
    this.world.buildNav(0.5);

    const w = this.world;
    const filt = (arr) => arr.filter((p) => w.isWalkable(p.x, p.z));
    const spawns = {
      street: filt(this.candidates.street),
      interior: filt(this.candidates.interior),
      dormant: filt(this.candidates.dormant),
      edge: filt(this.candidates.edge),
      checkpoint: filt(this.candidates.checkpoint),
      guardPost: this.candidates.guardPost.filter((p) => w.isWalkable(p.x, p.z)),
      patrol: filt(this.candidates.patrol),
      emerge: (this.candidates.emerge || []).filter((e) => w.isWalkable(e.to.x, e.to.z)),
    };
    return { world: this.world, mesh, docks: this.docks, spawns, map: this.map, fires: this.fires, floods: this.floods, glowMat: this.glowMat, story: this.story };
  }

  // ---- helpers ---------------------------------------------------------------

  _solid(cx, cy, cz, sx, sy, sz, color, opts = {}) {
    this.batch.box(cx, cy, cz, sx, sy, sz, color, opts);
    this.world.addBoxC(cx, cy, cz, sx, sy, sz, { collide: opts.collide !== false, occlude: opts.occlude !== false, kind: opts.kind });
  }

  _overlapsClear(x0, z0, x1, z1, extra = []) {
    for (const r of this.clear) if (x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0) return true;
    for (const r of extra) if (x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0) return true;
    return false;
  }

  // Wall along an axis with door/window openings.
  //   axis 'x': runs along x from a0..a1 at z=fixed. axis 'z': along z at x=fixed.
  //   out: +1/-1 outward direction for two-tone exterior walls (0 = partition).
  _wall(axis, fixed, a0, a1, t, h, openings, color, inner, out, opts = {}) {
    const ops = openings.slice().sort((p, q) => p.c - q.c);
    const sill = opts.sill ?? 0.95, top = opts.top ?? 2.0;
    const seg = (s, e, y0, y1, occlude = true) => {
      if (e - s < 0.02 || y1 - y0 < 0.02) return;
      const c = (s + e) / 2, len = e - s, cy = (y0 + y1) / 2, hy = y1 - y0;
      if (inner != null && out) {
        const off = t / 4;
        if (axis === 'x') {
          this.batch.box(c, cy, fixed + out * off, len, hy, t / 2, color);
          this.batch.box(c, cy, fixed - out * off, len, hy, t / 2, inner, { ao: 0.85 });
        } else {
          this.batch.box(fixed + out * off, cy, c, t / 2, hy, len, color);
          this.batch.box(fixed - out * off, cy, c, t / 2, hy, len, inner, { ao: 0.85 });
        }
      } else if (axis === 'x') this.batch.box(c, cy, fixed, len, hy, t, color);
      else this.batch.box(fixed, cy, c, t, hy, len, color);
      if (axis === 'x') this.world.addBox(s, y0, fixed - t / 2, e, y1, fixed + t / 2, { occlude });
      else this.world.addBox(fixed - t / 2, y0, s, fixed + t / 2, y1, e, { occlude });
    };
    let cur = a0;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      const s = Math.max(cur, o.c - o.w / 2), e = Math.min(a1, o.c + o.w / 2);
      if (e <= s) continue;
      seg(cur, s, 0, h);
      // free wall on either side of this opening (for shutters and boards)
      const prevEnd = i > 0 ? ops[i - 1].c + ops[i - 1].w / 2 : a0;
      const nextStart = i < ops.length - 1 ? ops[i + 1].c - ops[i + 1].w / 2 : a1;
      const gapL = s - prevEnd, gapR = nextStart - e;
      if (o.kind === 'door') {
        seg(s, e, 2.2, h);
        const cz = 1.3;
        if (axis === 'x') this.clear.push({ x0: s - 0.25, x1: e + 0.25, z0: fixed - cz, z1: fixed + cz });
        else this.clear.push({ z0: s - 0.25, z1: e + 0.25, x0: fixed - cz, x1: fixed + cz });
      } else if (o.kind === 'window') {
        if (axis === 'x') this.winClear.push({ x0: s - 0.1, x1: e + 0.1, z0: fixed - 0.5, z1: fixed + 0.5 });
        else this.winClear.push({ z0: s - 0.1, z1: e + 0.1, x0: fixed - 0.5, x1: fixed + 0.5 });
        const wsill = o.sill ?? sill, wtop = o.top ?? top;
        seg(s, e, 0, wsill);
        seg(s, e, wtop, h);
        if (opts.shutters && out) {
          // shutters only where there is solid wall for them to hang on
          const sh = wtop - wsill, sy = (wtop + wsill) / 2;
          const oz = out * (t / 2 + 0.03);
          const swL = Math.min(0.36, gapL - 0.1), swR = Math.min(0.36, gapR - 0.1);
          if (axis === 'x') {
            if (swL >= 0.18) this.batch.box(s - swL / 2, sy, fixed + oz, swL, sh, 0.04, opts.shutters);
            if (swR >= 0.18) this.batch.box(e + swR / 2, sy, fixed + oz, swR, sh, 0.04, opts.shutters);
          } else {
            if (swL >= 0.18) this.batch.box(fixed + oz, sy, s - swL / 2, 0.04, sh, swL, opts.shutters);
            if (swR >= 0.18) this.batch.box(fixed + oz, sy, e + swR / 2, 0.04, sh, swR, opts.shutters);
          }
        }
        if (this.rng.chance(0.35)) {
          // boarded window: planks overlap the frame but never the neighbouring opening
          const over = Math.max(0, Math.min(0.1, gapL - 0.05, gapR - 0.05));
          const oz = (out || 1) * (t / 2 + 0.02);
          for (let k = 0; k < 2; k++) {
            const py = wsill + 0.25 + k * 0.45 + this.rng.next() * 0.15;
            if (axis === 'x') this.batch.box((s + e) / 2, py, fixed + oz, e - s + over * 2, 0.13, 0.03, C.woodLight, { rotY: 0 });
            else this.batch.box(fixed + oz, py, (s + e) / 2, 0.03, 0.13, e - s + over * 2, C.woodLight);
          }
        }
      }
      cur = e;
    }
    seg(cur, a1, 0, h);
  }

  // Lay out openings on a wall span so nothing overlaps: doors first, then windows.
  // Keeps clear of the wall ends and of junctions with interior walls, and leaves room
  // for shutters. Windows that can't fit are dropped; doors slide to the nearest free spot.
  _plan(a0, a1, reqs, blocked = [], shutters = false) {
    const placed = [];
    const endPad = 0.45;
    const sorted = reqs.slice().sort((p, q) => (p.kind === 'door' ? 0 : 1) - (q.kind === 'door' ? 0 : 1));
    for (const r of sorted) {
      const fits = (c) => {
        const s0 = c - r.w / 2, e0 = c + r.w / 2;
        if (s0 < a0 + endPad || e0 > a1 - endPad) return false;
        for (const b of blocked) if (s0 < b[1] + 0.35 && e0 > b[0] - 0.35) return false;
        for (const p of placed) {
          const need = shutters && (p.kind === 'window' || r.kind === 'window') ? 0.95 : 0.6;
          if (s0 < p.c + p.w / 2 + need && e0 > p.c - p.w / 2 - need) return false;
        }
        return true;
      };
      const reach = r.kind === 'door' ? Math.max(a1 - a0, 2) : 1.2;
      let found = null;
      for (let k = 0; found === null && k <= 80; k++) {
        const off = k === 0 ? 0 : Math.ceil(k / 2) * 0.2 * (k % 2 ? 1 : -1);
        if (Math.abs(off) > reach) break;
        if (fits(r.c + off)) found = r.c + off;
      }
      if (found !== null) placed.push({ ...r, c: found });
    }
    return placed;
  }

  // A rectangular building shell. Returns the interior rect.
  _building(b) {
    const { x0, z0, x1, z1, h } = b;
    const op = b.openings;
    const parts = b.partitions || [];
    // where interior walls meet each exterior wall
    const junction = { n: [], s: [], w: [], e: [] };
    for (const p of parts) {
      if (p.axis === 'x') {
        if (p.from <= x0 + T + 0.05) junction.w.push([p.at - 0.06, p.at + 0.06]);
        if (p.to >= x1 - T - 0.05) junction.e.push([p.at - 0.06, p.at + 0.06]);
      } else {
        if (p.from <= z0 + T + 0.05) junction.n.push([p.at - 0.06, p.at + 0.06]);
        if (p.to >= z1 - T - 0.05) junction.s.push([p.at - 0.06, p.at + 0.06]);
      }
    }
    const sh = !!b.shutters;
    const plan = {
      n: this._plan(x0, x1, op.n || [], junction.n, sh), s: this._plan(x0, x1, op.s || [], junction.s, sh),
      w: this._plan(z0, z1, op.w || [], junction.w, sh), e: this._plan(z0, z1, op.e || [], junction.e, sh),
    };
    this._wall('x', z0, x0 - T / 2, x1 + T / 2, T, h, plan.n, b.wall, b.inner, -1, b);
    this._wall('x', z1, x0 - T / 2, x1 + T / 2, T, h, plan.s, b.wall, b.inner, 1, b);
    this._wall('z', x0, z0 + T / 2, z1 - T / 2, T, h, plan.w, b.wall, b.inner, -1, b);
    this._wall('z', x1, z0 + T / 2, z1 - T / 2, T, h, plan.e, b.wall, b.inner, 1, b);
    this.lastPlan = plan;
    this._dressWalls(b, plan);
    for (const p of parts) {
      // doors in an interior wall must also dodge walls that cross or butt into it
      const blocked = [];
      for (const q of parts) {
        if (q === p || q.axis === p.axis) continue;
        if (q.at > p.from && q.at < p.to && p.at >= q.from - 0.25 && p.at <= q.to + 0.25) blocked.push([q.at - 0.06, q.at + 0.06]);
      }
      const doors = this._plan(p.from, p.to, p.doors.map((c) => ({ c, w: 1.15, kind: 'door' })), blocked);
      this._wall(p.axis, p.at, p.from, p.to, 0.12, h, doors, b.inner, null, 0);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.batch.box(cx, 0.05, cz, w, 0.06, d, b.floor, { jitter: 0.02, ao: 1 });
    // roof slab + ceiling
    this.batch.box(cx, h + 0.14, cz, w + 0.7, 0.28, d + 0.7, b.roof, { ao: 1 });
    this.world.addBox(x0 - 0.35, h, z0 - 0.35, x1 + 0.35, h + 0.28, z1 + 0.35, { collide: false });
    if (b.trim) {
      this.batch.box(cx, h - 0.1, z0 - T / 2 - 0.03, w + 0.3, 0.2, 0.06, b.trim);
      this.batch.box(cx, h - 0.1, z1 + T / 2 + 0.03, w + 0.3, 0.2, 0.06, b.trim);
    }
    this.world.interiors.push({ x0, z0, x1, z1, surface: b.surface || 'wood' });
    this.map.buildings.push({ x0, z0, x1, z1, kind: b.kind || 'house' });
    return { x0: x0 + T / 2, z0: z0 + T / 2, x1: x1 - T / 2, z1: z1 - T / 2 };
  }

  // Find a spot against a wall of the room for a w x d footprint.
  _againstWall(room, w, d, sides = ['n', 's', 'e', 'w'], extraGap = 0, avoidWindows = false) {
    const r = this.rng;
    for (let attempt = 0; attempt < 14; attempt++) {
      const side = r.pick(sides);
      let x0, z0, x1, z1, fx = 0, fz = 0;
      if (side === 'n' || side === 's') {
        if (room.x1 - room.x0 < w + 0.2) continue;
        const c = r.range(room.x0 + w / 2 + 0.05, room.x1 - w / 2 - 0.05);
        x0 = c - w / 2; x1 = c + w / 2;
        if (side === 'n') { z0 = room.z0 + extraGap; z1 = z0 + d; fz = 1; } else { z1 = room.z1 - extraGap; z0 = z1 - d; fz = -1; }
      } else {
        if (room.z1 - room.z0 < w + 0.2) continue;
        const c = r.range(room.z0 + w / 2 + 0.05, room.z1 - w / 2 - 0.05);
        z0 = c - w / 2; z1 = c + w / 2;
        if (side === 'w') { x0 = room.x0 + extraGap; x1 = x0 + d; fx = 1; } else { x1 = room.x1 - extraGap; x0 = x1 - d; fx = -1; }
      }
      if (this._overlapsClear(x0, z0, x1, z1, room.occ)) continue;
      if (avoidWindows && this._overlapsClear(x0, z0, x1, z1, this.winClear)) continue;
      room.occ.push({ x0: x0 - 0.1, z0: z0 - 0.1, x1: x1 + 0.1, z1: z1 + 0.1 });
      return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, fx, fz, rotY: Math.atan2(fx, fz), x0, z0, x1, z1 };
    }
    return null;
  }

  _room(x0, z0, x1, z1, type) {
    return { x0, z0, x1, z1, type, occ: [] };
  }

  // ---- furniture -------------------------------------------------------------

  _container(kind, room, table, sides, label) {
    const spec = CONTAINER_SPECS[kind];
    const fw = spec.footW || spec.w;
    const spot = this._againstWall(room, fw, spec.d, sides, 0, !!spec.mount || spec.h > 1.2);
    if (!spot) return null;
    const y0 = spec.mount || 0;
    const s = spot;
    if (!spec.mount) {
      const ex = s.fx !== 0;
      this.world.addBoxC(s.cx, containerHeight(spec) / 2, s.cz, ex ? spec.d : fw, containerHeight(spec), ex ? fw : spec.d, { occlude: spec.h > 1.2, kind: 'furniture' });
    }
    const loot = rollContainer(this.rng, table, this.zone.lootTier);
    s.c = this.loot.addContainer({ kind, spec, x: s.cx, z: s.cz, y0, rotY: s.rotY, items: loot, label });
    return s;
  }


  _prop(kind, room, sides) {
    const r = this.rng;
    if (kind === 'bed') {
      const s = this._againstWall(room, 1.4, 2.0, sides);
      if (!s) return;
      const ex = s.fx !== 0;
      this.batch.box(s.cx, 0.2, s.cz, ex ? 2.0 : 1.4, 0.4, ex ? 1.4 : 2.0, C.wood);
      this.batch.box(s.cx, 0.47, s.cz, ex ? 1.9 : 1.3, 0.16, ex ? 1.3 : 1.9, r.pick([0xa8a290, 0x8a7a6a, 0x9a8a8a]), { top: 0xb4ab96 });
      this.batch.box(s.cx - s.fx * 0.75, 0.6, s.cz - s.fz * 0.75, ex ? 0.3 : 1.0, 0.12, ex ? 1.0 : 0.3, 0xc8c0b0);
      if (r.chance(0.5)) this.batch.box(s.cx + s.fx * 0.2 + (r.next() - 0.5) * 0.4, 0.56, s.cz + s.fz * 0.2, 0.5, 0.02, 0.4, 0x4a0a0a, { jitter: 0.1 });
      this.world.addBoxC(s.cx, 0.3, s.cz, ex ? 2.0 : 1.4, 0.6, ex ? 1.4 : 2.0, { occlude: false, kind: 'furniture' });
    } else if (kind === 'sofa') {
      const s = this._againstWall(room, 1.9, 0.85, sides);
      if (!s) return;
      const ex = s.fx !== 0;
      const col = r.pick([0x5a4a3a, 0x3a4a5a, 0x6a3a3a, 0x4a5a3a]);
      this.batch.box(s.cx, 0.22, s.cz, ex ? 0.85 : 1.9, 0.44, ex ? 1.9 : 0.85, col);
      this.batch.box(s.cx - s.fx * 0.33, 0.6, s.cz - s.fz * 0.33, ex ? 0.2 : 1.9, 0.5, ex ? 1.9 : 0.2, col);
      this.world.addBoxC(s.cx, 0.4, s.cz, ex ? 0.85 : 1.9, 0.8, ex ? 1.9 : 0.85, { occlude: false, kind: 'furniture' });
    } else if (kind === 'tub') {
      const s = this._againstWall(room, 0.8, 1.6, sides);
      if (!s) return;
      const ex = s.fx !== 0;
      this.batch.box(s.cx, 0.28, s.cz, ex ? 1.6 : 0.8, 0.56, ex ? 0.8 : 1.6, C.white, { top: 0x3a3a34 });
      this.world.addBoxC(s.cx, 0.28, s.cz, ex ? 1.6 : 0.8, 0.56, ex ? 0.8 : 1.6, { occlude: false, kind: 'furniture' });
    } else if (kind === 'table') {
      const w = room.x1 - room.x0, d = room.z1 - room.z0;
      if (w < 3.2 || d < 3.2) return;
      const cx = (room.x0 + room.x1) / 2 + r.range(-0.4, 0.4), cz = (room.z0 + room.z1) / 2 + r.range(-0.4, 0.4);
      if (this._overlapsClear(cx - 0.8, cz - 0.6, cx + 0.8, cz + 0.6, room.occ)) return;
      room.occ.push({ x0: cx - 0.9, z0: cz - 0.7, x1: cx + 0.9, z1: cz + 0.7 });
      this.batch.box(cx, 0.74, cz, 1.3, 0.05, 0.85, C.woodLight);
      for (const [lx, lz] of [[-0.58, -0.36], [0.58, -0.36], [-0.58, 0.36], [0.58, 0.36]]) this.batch.box(cx + lx, 0.36, cz + lz, 0.06, 0.72, 0.06, C.wood);
      for (const sz of [-1, 1]) {
        if (r.chance(0.3)) continue;
        this.batch.box(cx + r.range(-0.3, 0.3), 0.23, cz + sz * 0.62, 0.42, 0.46, 0.42, C.wood, { rotY: r.range(-0.4, 0.4) });
      }
      this.world.addBoxC(cx, 0.4, cz, 1.3, 0.8, 0.85, { occlude: false, kind: 'furniture' });
      if (r.chance(0.4)) this.loot.spawnItem(rollItem(r, 'floor', this.zone.lootTier), new THREE.Vector3(cx + r.range(-0.4, 0.4), 0.77, cz + r.range(-0.2, 0.2)));
    } else if (kind === 'counter') {
      const s = this._againstWall(room, 2.2, 0.7, sides, 1.6);
      if (!s) return;
      const ex = s.fx !== 0;
      this.batch.box(s.cx, 0.5, s.cz, ex ? 0.7 : 2.2, 1.0, ex ? 2.2 : 0.7, C.wood, { top: 0x6a5a48 });
      this.world.addBoxC(s.cx, 0.5, s.cz, ex ? 0.7 : 2.2, 1.0, ex ? 2.2 : 0.7, { occlude: false, kind: 'furniture' });
    }
  }

  _floorLoot(room, chance = 0.3) {
    const r = this.rng;
    if (!r.chance(chance)) return;
    for (let i = 0; i < 4; i++) {
      const x = r.range(room.x0 + 0.5, room.x1 - 0.5), z = r.range(room.z0 + 0.5, room.z1 - 0.5);
      let bad = false;
      for (const o of room.occ) if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) bad = true;
      if (bad) continue;
      this.loot.spawnItem(rollItem(r, 'floor', this.zone.lootTier), new THREE.Vector3(x, 0.08, z), r.range(0, Math.PI * 2));
      return;
    }
  }

  _markInterior(room, dormantChance = 0.22) {
    if (this.rng.chance(0.16)) {
      const side = this.rng.int(0, 3);
      const kind = this.rng.chance(0.6) ? 'hands' : 'smear';
      const x = this.rng.range(room.x0 + 0.8, Math.max(room.x0 + 0.9, room.x1 - 0.8));
      const z = this.rng.range(room.z0 + 0.8, Math.max(room.z0 + 0.9, room.z1 - 0.8));
      const y = this.rng.range(0.9, 1.5);
      if (side === 0) this.decals.add(kind, x, y, room.z0 + 0.01, 0, 1, 1.1, 0.55);
      else if (side === 1) this.decals.add(kind, x, y, room.z1 - 0.01, 0, -1, 1.1, 0.55);
      else if (side === 2) this.decals.add(kind, room.x0 + 0.01, y, z, 1, 0, 1.1, 0.55);
      else this.decals.add(kind, room.x1 - 0.01, y, z, -1, 0, 1.1, 0.55);
    }
    const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
    this.candidates.interior.push({ x: cx, z: cz });
    if (this.rng.chance(dormantChance)) this.candidates.dormant.push({ x: cx + this.rng.range(-0.6, 0.6), z: cz + this.rng.range(-0.6, 0.6) });
  }

  // ---- ground & streets --------------------------------------------------------

  _ground() {
    const tex = groundTexture();
    tex.repeat.set(24, 24);
    const g = new THREE.PlaneGeometry(CITY_HALF * 2 + 2, CITY_HALF * 2 + 2);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, color: 0xb8b8a8 }));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  _streets() {
    const b = this.batch;
    const L = CITY_HALF * 2;
    for (const c of ROADS) {
      b.box(c, 0.005, 0, ROAD_HW * 2, 0.01, L, C.asphalt, { jitter: 0 });
      b.box(0, 0.006, c, L, 0.012, ROAD_HW * 2, C.asphalt, { jitter: 0 });
      this.map.roads.push({ x0: c - ROAD_HW, x1: c + ROAD_HW, z0: -CITY_HALF, z1: CITY_HALF });
      this.map.roads.push({ z0: c - ROAD_HW, z1: c + ROAD_HW, x0: -CITY_HALF, x1: CITY_HALF });
      // dashed center lines between intersections
      for (let s = -CITY_HALF; s < CITY_HALF; s += 3) {
        const nearX = ROADS.some((rc) => Math.abs(s + 0.75 - rc) < ROAD_HW + 0.5);
        if (nearX) continue;
        b.box(c, 0.014, s + 0.75, 0.12, 0.01, 1.5, C.line, { jitter: 0.15 });
        b.box(s + 0.75, 0.015, c, 1.5, 0.01, 0.12, C.line, { jitter: 0.15 });
      }
    }
    for (const a of ROADS) for (const b2 of ROADS) if (Math.abs(a) < CITY_HALF - 2 && Math.abs(b2) < CITY_HALF - 2) this.candidates.patrol.push({ x: a, z: b2 });
    // cars, wrecks and roadblocks along each road segment
    const r = this.rng;
    for (let i = 0; i < ROADS.length; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        const s0 = ROADS[j] + ROAD_HW + 1, s1 = ROADS[j + 1] - ROAD_HW - 1;
        const n = r.int(0, 2);
        for (let k = 0; k < n; k++) {
          const along = r.range(s0 + 2.5, s1 - 2.5);
          const lane = r.sign() * r.range(1.2, 2.2);
          const ang = r.range(-0.35, 0.35) + (r.chance(0.5) ? Math.PI : 0);
          this._car(ROADS[i] + lane, along, ang, r.chance(0.12));
          this._car(along, ROADS[i] + lane, ang + Math.PI / 2, r.chance(0.12));
        }
        if (r.chance(0.12)) this._roadblock(ROADS[i], (s0 + s1) / 2, true);
        if (r.chance(0.12)) this._roadblock((s0 + s1) / 2, ROADS[i], false);
        // spawn candidates on the road
        for (let k = 0; k < 3; k++) {
          const along = r.range(s0, s1);
          this.candidates.street.push({ x: ROADS[i] + r.range(-3, 3), z: along });
          this.candidates.street.push({ x: along, z: ROADS[i] + r.range(-3, 3) });
        }
      }
      // edge spawns for the horde: ends of each road at the levee
      for (const e of [-CITY_HALF + 3, CITY_HALF - 3]) {
        if (Math.abs(ROADS[i]) < CITY_HALF - 5) {
          this.candidates.edge.push({ x: ROADS[i], z: e });
          this.candidates.edge.push({ x: e, z: ROADS[i] });
        }
      }
    }
  }

  _car(x, z, ang, burned = false) {
    const r = this.rng;
    const col = burned ? 0x1c1a18 : r.pick(C.cars);
    const L = 4.3, W = 1.8;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // car-local (lx along the width, lz along the length; +lz is the rear) to world
    const at = (lx, lz) => [x + lx * ca + lz * sa, z - lx * sa + lz * ca];
    const trunk = !burned && r.chance(0.55);
    const TL = 0.97;
    if (trunk) {
      // solid front, and a hollow trunk well at the rear
      const [fx, fz] = at(0, -TL / 2);
      this.batch.box(fx, 0.55, fz, W, 0.62, L - TL, col, { rotY: ang, ao: 1 });
      const [bx, bz] = at(0, L / 2 - TL / 2);
      this.batch.box(bx, 0.37, bz, W, 0.26, TL, col, { rotY: ang, ao: 1 });
    } else this.batch.box(x, 0.55, z, W, 0.62, L, col, { rotY: ang, ao: 1 });
    const [cx, cz] = at(0, -0.2);
    this.batch.box(cx, 1.1, cz, W - 0.14, 0.5, L * 0.48, burned ? 0x121110 : 0x1d2327, { rotY: ang, ao: 1, top: col });
    for (const [lx, lz] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.35], [0.85, 1.35]]) {
      const [wx, wz] = at(lx, lz);
      this.batch.box(wx, 0.32, wz, 0.24, 0.64, 0.64, 0x151515, { rotY: ang, ao: 1 });
    }
    for (const lx of [-0.72, 0.72]) {
      const [tx, tz] = at(lx, L / 2 + 0.01);
      this.batch.box(tx, 0.72, tz, 0.26, 0.1, 0.03, burned ? 0x1a1414 : 0x6a1410, { rotY: ang, ao: 1 });
    }
    const ex = Math.abs(sa) * L + Math.abs(ca) * W, ez = Math.abs(ca) * L + Math.abs(sa) * W;
    this.world.addBoxC(x, 0.7, z, ex * 0.8, 1.4, ez * 0.8, { occlude: false, kind: 'car' });
    this.map.props.push({ x, z, w: ex * 0.8, d: ez * 0.8 });
    if (trunk) {
      const [tx, tz] = at(0, L / 2 - TL / 2);
      this.loot.addContainer({
        kind: 'trunk', spec: { ...CONTAINER_SPECS.trunk, w: W, d: TL, h: 0.36, color: col }, x: tx, z: tz, y0: 0.5, rotY: ang,
        items: rollContainer(r, 'trunk', this.zone.lootTier),
      });
    }
  }


  _roadblock(x, z, alongZ) {
    const r = this.rng;
    const n = r.int(2, 3);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 2.2 + r.range(-0.3, 0.3);
      const bx = alongZ ? x + off : x, bz = alongZ ? z : z + off;
      if (alongZ) this._solid(bx, 0.45, bz, 2.0, 0.9, 0.6, C.concrete, { occlude: false, kind: 'barrier' });
      else this._solid(bx, 0.45, bz, 0.6, 0.9, 2.0, C.concrete, { occlude: false, kind: 'barrier' });
    }
  }

  _sidewalks(x0, z0, x1, z1) {
    const b = this.batch;
    const w = x1 - x0, d = z1 - z0;
    b.box((x0 + x1) / 2, 0.06, z0 + SIDEWALK / 2, w, 0.12, SIDEWALK, C.sidewalk, { jitter: 0.02, ao: 1 });
    b.box((x0 + x1) / 2, 0.06, z1 - SIDEWALK / 2, w, 0.12, SIDEWALK, C.sidewalk, { jitter: 0.02, ao: 1 });
    b.box(x0 + SIDEWALK / 2, 0.061, (z0 + z1) / 2, SIDEWALK, 0.12, d - SIDEWALK * 2, C.sidewalk, { jitter: 0.02, ao: 1 });
    b.box(x1 - SIDEWALK / 2, 0.061, (z0 + z1) / 2, SIDEWALK, 0.12, d - SIDEWALK * 2, C.sidewalk, { jitter: 0.02, ao: 1 });
    // street lamps and poles at the corners
    const r = this.rng;
    for (const [px, pz] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z1 - 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z0 + 0.5]]) {
      if (r.chance(0.45)) continue;
      this.batch.cylinder(px, 2.6, pz, 0.08, 0.11, 5.2, 0x3a3a38, 6);
      this.batch.box(px + (px < (x0 + x1) / 2 ? -0.5 : 0.5), 5.1, pz, 1.1, 0.08, 0.08, 0x3a3a38);
      this.world.addBoxC(px, 2.6, pz, 0.25, 5.2, 0.25, { occlude: false, kind: 'pole' });
      if (r.chance(0.12)) this._hanged(px + (px < (x0 + x1) / 2 ? -0.95 : 0.95), pz, 5.05, r.range(0, Math.PI * 2));
    }
  }

  _block(x0, z0, x1, z1, forced = null) {
    this._sidewalks(x0, z0, x1, z1);
    const ix0 = x0 + SIDEWALK, iz0 = z0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz1 = z1 - SIDEWALK;
    const type = forced || this.rng.weighted(this.zone.lots);
    const scale = LOT_SCALE[type];
    if (scale === 'whole') {
      this._lot(type, ix0, iz0, ix1, iz1, 'n', true);
      return;
    }
    const midZ = (iz0 + iz1) / 2;
    const halves = [[iz0, midZ, 'n'], [midZ, iz1, 's']];
    let first = true;
    for (const [hz0, hz1, front] of halves) {
      let t = first ? type : this.rng.weighted(this.zone.lots.filter(([k]) => LOT_SCALE[k] !== 'whole'));
      first = false;
      if (LOT_SCALE[t] === 'half') {
        this._lot(t, ix0, hz0, ix1, hz1, front);
      } else {
        const midX = (ix0 + ix1) / 2;
        this._lot(t, ix0, hz0, midX, hz1, front);
        const t2 = this.rng.weighted(this.zone.lots.filter(([k]) => LOT_SCALE[k] === 'quarter'));
        this._lot(t2 || 'house', midX, hz0, ix1, hz1, front);
      }
    }
  }

  _lot(type, x0, z0, x1, z1, front, whole = false) {
    const b = this.batch;
    const groundCol = type === 'park' || type === 'house' ? C.grass : type === 'cemetery' ? 0x333a26 : type === 'checkpoint' || type === 'containers' || type === 'warehouse' || type === 'compound' ? C.gravel : C.dirt;
    b.box((x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, groundCol, { jitter: 0.04, ao: 1 });
    switch (type) {
      case 'house': this._house(x0, z0, x1, z1, front); break;
      case 'shop': this._shop(x0, z0, x1, z1, front); break;
      case 'clinic': this._clinic(x0, z0, x1, z1, front); break;
      case 'warehouse': this._warehouse(x0, z0, x1, z1); break;
      case 'containers': this._containerYard(x0, z0, x1, z1); break;
      case 'park': this._park(x0, z0, x1, z1); break;
      case 'checkpoint': this._checkpoint(x0, z0, x1, z1); break;
      case 'cemetery': this._cemetery(x0, z0, x1, z1); break;
      case 'compound': this._compound(x0, z0, x1, z1); break;
      default: this._yard(x0, z0, x1, z1, front);
    }
    // street spawn candidates within the lot's open ground
    for (let i = 0; i < (whole ? 5 : 2); i++) this.candidates.street.push({ x: this.rng.range(x0 + 1, x1 - 1), z: this.rng.range(z0 + 1, z1 - 1) });
  }

  // ---- lot types -----------------------------------------------------------------

  _house(x0, z0, x1, z1, front) {
    const r = this.rng;
    this.clear = [];
    const W = r.range(6.4, Math.min(8.6, x1 - x0 - 2.5));
    const D = r.range(9.2, Math.min(11.2, z1 - z0 - 3.2));
    const cx = (x0 + x1) / 2 + r.range(-0.6, 0.6);
    const bx0 = cx - W / 2, bx1 = cx + W / 2;
    const bz0 = front === 'n' ? z0 + 2.6 : z1 - 2.6 - D;
    const bz1 = bz0 + D;
    const wall = r.pick(C.house), inner = r.pick(C.intWall), roof = r.pick(C.roofs);
    const k = D > 9 && r.chance(0.55) ? 3 : 2;
    const cuts = [];
    for (let i = 1; i < k; i++) cuts.push(bz0 + (D * i) / k + r.range(-0.4, 0.4));
    const doorX = bx0 + W * r.range(0.3, 0.7);
    const frontZ = front === 'n' ? bz0 : bz1;
    const backZ = front === 'n' ? bz1 : bz0;
    const frontOps = [{ c: doorX, w: 1.1, kind: 'door' }];
    if (doorX - bx0 > 2.4) frontOps.push({ c: bx0 + (doorX - bx0) / 2, w: 1.1, kind: 'window' });
    if (bx1 - doorX > 2.4) frontOps.push({ c: doorX + (bx1 - doorX) / 2, w: 1.1, kind: 'window' });
    const backOps = r.chance(0.6) ? [{ c: bx0 + W * r.range(0.25, 0.75), w: 1.0, kind: 'door' }] : [{ c: cx, w: 1.0, kind: 'window' }];
    // side windows, one per room span
    const spans = [bz0, ...cuts, bz1];
    const sideW = [], sideE = [];
    for (let i = 0; i < spans.length - 1; i++) {
      const c = (spans[i] + spans[i + 1]) / 2;
      if (spans[i + 1] - spans[i] > 2.2) {
        if (r.chance(0.65)) sideW.push({ c, w: 1.0, kind: 'window' });
        if (r.chance(0.65)) sideE.push({ c, w: 1.0, kind: 'window' });
      }
    }
    const partitions = cuts.map((z) => ({ axis: 'x', at: z, from: bx0 + T / 2, to: bx1 - T / 2, doors: [bx0 + W * r.range(0.25, 0.75)] }));
    const openings = { w: sideW, e: sideE };
    openings[front] = frontOps;
    openings[front === 'n' ? 's' : 'n'] = backOps;
    this._building({
      x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 3.0, wall, inner, roof, floor: r.pick(C.floor), trim: C.trim,
      openings, partitions, shutters: r.pick([0x2a3a2a, 0x3a2a2a, 0x2a2a3a, C.trim]), kind: 'house',
    });
    // porch with columns
    const pz = front === 'n' ? bz0 - 1.1 : bz1 + 1.1;
    this.batch.box(cx, 0.06, pz, W + 0.4, 0.12, 2.2, C.wood, { ao: 1 });
    this.batch.box(cx, 2.95, pz, W + 0.6, 0.12, 2.3, roof, { ao: 1 });
    for (const px of [bx0 + 0.15, bx1 - 0.15]) {
      const cz2 = front === 'n' ? bz0 - 2.05 : bz1 + 2.05;
      this.batch.box(px, 1.5, cz2, 0.16, 2.9, 0.16, C.trim);
      this.world.addBoxC(px, 1.5, cz2, 0.2, 2.9, 0.2, { occlude: false, kind: 'pole' });
    }
    if (r.chance(0.1)) this._candles(bx0 + 0.7, front === 'n' ? bz0 - 0.6 : bz1 + 0.6, 0.12);
    if (r.chance(0.05)) this._hanged(cx + r.range(-1.5, 1.5), front === 'n' ? bz0 - 1.6 : bz1 + 1.6, 2.88, r.range(0, 6));
    // search-team X-code by the door
    if (r.chance(0.55)) {
      const f = front === 'n' ? { z: bz0 - T / 2, nz: -1 } : { z: bz1 + T / 2, nz: 1 };
      const side = doorX > cx ? -1 : 1;
      const xx = Math.max(bx0 + 0.7, Math.min(bx1 - 0.7, doorX + side * 1.2));
      this.decals.add('xcode', xx, 2.35, f.z, 0, f.nz, 1.1, 0.55);
    }
    // candlelight in a window: somebody is still here, or was
    if (r.chance(0.12)) {
      const sides = Object.keys(this.lastPlan).filter((k) => this.lastPlan[k].some((o) => o.kind === 'window'));
      if (sides.length) {
        const sd = r.pick(sides);
        const win = this.lastPlan[sd].find((o) => o.kind === 'window');
        const inset = 0.16;
        const gx = sd === 'w' ? bx0 + inset : sd === 'e' ? bx1 - inset : win.c;
        const gz = sd === 'n' ? bz0 + inset : sd === 's' ? bz1 - inset : win.c;
        const along = sd === 'n' || sd === 's';
        this.glow.box(gx, 1.45, gz, along ? win.w - 0.1 : 0.02, 0.95, along ? 0.02 : win.w - 0.1, 0x9a5a20, { jitter: 0.1, ao: 1 });
      }
    }
    // rooms front to back
    const rooms = [];
    for (let i = 0; i < spans.length - 1; i++) {
      const a = spans[i], bb = spans[i + 1];
      rooms.push(this._room(bx0 + T / 2, a + (i === 0 ? T / 2 : 0.06), bx1 - T / 2, bb - (i === spans.length - 2 ? T / 2 : 0.06), null));
    }
    if (front === 's') rooms.reverse(); // front room first
    const types = k === 3 ? ['living', 'bed', 'kitchen'] : ['living', 'kitchen'];
    rooms.forEach((rm, i) => {
      rm.type = types[i];
      if (rm.type === 'living') {
        this._prop('sofa', rm);
        if (r.chance(0.7)) this._container('desk', rm, 'desk');
        if (r.chance(0.4)) this._container('dresser', rm, 'dresser');
      } else if (rm.type === 'bed') {
        this._prop('bed', rm);
        this._container('dresser', rm, 'dresser');
        this._container('medcab', rm, 'medcab');
      } else {
        this._container('kitchen', rm, 'kitchen');
        if (r.chance(0.7)) this._container('fridge', rm, 'fridge');
        this._prop('table', rm);
        if (k === 2) this._container('medcab', rm, 'medcab');
        if (r.chance(0.35)) this._container('toolbox', rm, 'toolbox');
      }
      this._floorLoot(rm, 0.3);
      this._markInterior(rm);
    });
    // yard: fence, trees, junk
    this._yardDressing(x0, z0, x1, z1, front, { x0: bx0, z0: bz0 - (front === 'n' ? 2.3 : 0), x1: bx1, z1: bz1 + (front === 's' ? 2.3 : 0) }, doorX);
  }

  _yardDressing(x0, z0, x1, z1, front, house, doorX) {
    const r = this.rng;
    if (r.chance(0.55)) {
      const fz = front === 'n' ? z0 + 0.3 : z1 - 0.3;
      const col = r.pick([C.trim, 0x5a4a3a, 0x8a8478]);
      // front fence with a gate gap aligned to the door
      const g0 = doorX - 0.8, g1 = doorX + 0.8;
      this._fence(x0 + 0.2, fz, g0, fz, col);
      this._fence(g1, fz, x1 - 0.2, fz, col);
    }
    // trees in the open part of the lot
    const n = r.int(0, 2);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 6; a++) {
        const tx = r.range(x0 + 1, x1 - 1), tz = r.range(z0 + 1, z1 - 1);
        if (tx > house.x0 - 1.2 && tx < house.x1 + 1.2 && tz > house.z0 - 1.2 && tz < house.z1 + 1.2) continue;
        this._tree(tx, tz);
        break;
      }
    }
    if (r.chance(0.4)) {
      const tx = r.range(x0 + 1, x1 - 1), tz = front === 'n' ? r.range(house.z1 + 0.8, z1 - 0.5) : r.range(z0 + 0.5, house.z0 - 0.8);
      if (Math.abs(tz - (z0 + z1) / 2) < (z1 - z0) / 2) this._junk(tx, tz);
    }
  }

  _fence(ax, az, bx, bz, col) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) return;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    // rails + pickets
    if (alongX) {
      this.batch.box(cx, 0.35, cz, len, 0.07, 0.05, col);
      this.batch.box(cx, 0.8, cz, len, 0.07, 0.05, col);
      for (let s = 0; s < len; s += 0.3) this.batch.box(Math.min(ax, bx) + s + 0.15, 0.55, cz, 0.08, 1.1, 0.03, col, { jitter: 0.1 });
      this.world.addBoxC(cx, 0.55, cz, len, 1.1, 0.12, { occlude: false, kind: 'fence' });
    } else {
      this.batch.box(cx, 0.35, cz, 0.05, 0.07, len, col);
      this.batch.box(cx, 0.8, cz, 0.05, 0.07, len, col);
      for (let s = 0; s < len; s += 0.3) this.batch.box(cx, 0.55, Math.min(az, bz) + s + 0.15, 0.03, 1.1, 0.08, col, { jitter: 0.1 });
      this.world.addBoxC(cx, 0.55, cz, 0.12, 1.1, len, { occlude: false, kind: 'fence' });
    }
  }

  _chainFence(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const col = 0x6a6e70;
    if (alongX) {
      this.batch.box(cx, 1.9, cz, len, 0.05, 0.05, col);
      this.batch.box(cx, 1.0, cz, len, 1.8, 0.015, 0x4a4e50, { jitter: 0 });
      for (let s = 0; s <= len; s += 3) this.batch.cylinder(Math.min(ax, bx) + s, 1.0, cz, 0.04, 0.04, 2.0, col, 5);
      this.world.addBoxC(cx, 1.0, cz, len, 2.0, 0.12, { occlude: false, kind: 'fence' });
    } else {
      this.batch.box(cx, 1.9, cz, 0.05, 0.05, len, col);
      this.batch.box(cx, 1.0, cz, 0.015, 1.8, len, 0x4a4e50, { jitter: 0 });
      for (let s = 0; s <= len; s += 3) this.batch.cylinder(cx, 1.0, Math.min(az, bz) + s, 0.04, 0.04, 2.0, col, 5);
      this.world.addBoxC(cx, 1.0, cz, 0.12, 2.0, len, { occlude: false, kind: 'fence' });
    }
  }

  _tree(x, z, big = false) {
    const r = this.rng;
    const kind = r.next();
    const h = big ? r.range(6, 8) : r.range(4, 6.5);
    if (kind < 0.55) {
      // live oak with hanging moss
      this.batch.cylinder(x, h * 0.35, z, 0.18, 0.3, h * 0.7, C.trunk, 7);
      const n = r.int(3, 5);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0.4, 1.8);
        this.batch.ico(x + Math.cos(a) * d, h * r.range(0.65, 0.95), z + Math.sin(a) * d, r.range(1.2, 2.2), r.pick(C.foliage), 0.6);
      }
      for (let i = 0; i < 7; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0.8, 2.4), ml = r.range(0.8, 1.8);
        this.batch.box(x + Math.cos(a) * d, h * 0.62 - ml / 2, z + Math.sin(a) * d, 0.12, ml, 0.05, C.moss, { rotY: a, jitter: 0.15, ao: 1 });
      }
    } else if (kind < 0.8) {
      // bald cypress
      this.batch.cylinder(x, h * 0.5, z, 0.14, 0.36, h, C.trunk, 7);
      this.batch.cone(x, h * 0.75, z, 1.3, h * 0.7, r.pick(C.foliage));
    } else {
      // dead tree
      this.batch.cylinder(x, h * 0.4, z, 0.1, 0.24, h * 0.8, 0x2e2822, 6);
      for (let i = 0; i < 3; i++) {
        const a = r.range(0, Math.PI * 2);
        this.batch.cylinder(x + Math.cos(a) * 0.5, h * r.range(0.5, 0.75), z + Math.sin(a) * 0.5, 0.03, 0.07, 1.6, 0x2e2822, 4, { rz: Math.cos(a) * 0.8, rx: -Math.sin(a) * 0.8 });
      }
    }
    this.world.addBoxC(x, 1.5, z, 0.5, 3, 0.5, { occlude: true, kind: 'tree' });
  }

  _junk(x, z) {
    const r = this.rng;
    const k = r.next();
    if (k < 0.3) {
      // tire stack
      for (let i = 0; i < r.int(2, 4); i++) this.batch.cylinder(x, 0.12 + i * 0.24, z, 0.36, 0.36, 0.24, 0x161616, 8);
      this.world.addBoxC(x, 0.5, z, 0.7, 1.0, 0.7, { occlude: false, kind: 'junk' });
    } else if (k < 0.55) {
      // trash bags
      for (let i = 0; i < 4; i++) this.batch.ico(x + r.range(-0.5, 0.5), 0.25, z + r.range(-0.5, 0.5), r.range(0.28, 0.38), 0x1a1c1a, 0.8);
    } else if (k < 0.8) {
      // barrels
      for (let i = 0; i < r.int(1, 3); i++) {
        const bx = x + r.range(-0.6, 0.6), bz = z + r.range(-0.6, 0.6);
        this.batch.cylinder(bx, 0.45, bz, 0.3, 0.3, 0.9, r.pick([0x3a4a5a, 0x7a3a22, 0x4d5233]), 8);
        this.world.addBoxC(bx, 0.45, bz, 0.55, 0.9, 0.55, { occlude: false, kind: 'junk' });
      }
    } else {
      // pallet pile
      for (let i = 0; i < r.int(1, 4); i++) this.batch.box(x, 0.07 + i * 0.14, z, 1.2, 0.12, 1.0, C.woodLight, { rotY: r.range(-0.3, 0.3) });
    }
  }

  _yard(x0, z0, x1, z1, front) {
    const r = this.rng;
    this.clear = [];
    // a shed with a tool chest
    if (r.chance(0.75)) {
      const sw = 3.2, sd = 3.0;
      const sx = r.range(x0 + 2, x1 - 2 - sw), sz = front === 'n' ? z1 - sd - 1.5 : z0 + 1.5;
      const doorSide = front === 'n' ? 'n' : 's';
      const ops = {};
      ops[doorSide] = [{ c: sx + sw / 2, w: 1.1, kind: 'door' }];
      const inner = this._building({ x0: sx, z0: sz, x1: sx + sw, z1: sz + sd, h: 2.5, wall: 0x5a4a3a, inner: 0x4a3c30, roof: 0x5a5048, floor: 0x3a3028, openings: ops, kind: 'shed' });
      const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'shed');
      this._container('toolbox', rm, 'toolbox', [doorSide === 'n' ? 's' : 'n', 'e', 'w']);
      if (r.chance(0.5)) this._container('crate', rm, 'crate');
      this._markInterior(rm, 0.3);
    }
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) this._junk(r.range(x0 + 1.5, x1 - 1.5), r.range(z0 + 1.5, z1 - 1.5));
    if (r.chance(0.6)) this._car(r.range(x0 + 3, x1 - 3), front === 'n' ? z0 + 3 : z1 - 3, r.range(0, Math.PI * 2), r.chance(0.3));
    if (r.chance(0.5)) this._tree(r.range(x0 + 1.5, x1 - 1.5), r.range(z0 + 1.5, z1 - 1.5));
    if (r.chance(0.5)) this.loot.spawnItem(rollItem(r, 'floor', this.zone.lootTier), new THREE.Vector3(r.range(x0 + 1, x1 - 1), 0.04, r.range(z0 + 1, z1 - 1)), r.range(0, 6));
  }

  _shop(x0, z0, x1, z1, front) {
    const r = this.rng;
    this.clear = [];
    const W = r.range(14, Math.min(20, x1 - x0 - 3)), D = r.range(8.6, Math.min(10.4, z1 - z0 - 2));
    const cx = (x0 + x1) / 2 + r.range(-1, 1);
    const bx0 = cx - W / 2, bx1 = cx + W / 2;
    const bz0 = front === 'n' ? z0 + 1.0 : z1 - 1.0 - D, bz1 = bz0 + D;
    const storeCut = front === 'n' ? bz0 + D * 0.66 : bz1 - D * 0.66;
    const frontOps = [{ c: cx, w: 2.2, kind: 'door' }];
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const c = cx + s * (2.4 + i * 2.8);
      if (c - 1.2 > bx0 + 0.5 && c + 1.2 < bx1 - 0.5) frontOps.push({ c, w: 2.2, kind: 'window', sill: 0.7, top: 2.4 });
    }
    const openings = { w: [], e: [] };
    openings[front] = frontOps;
    openings[front === 'n' ? 's' : 'n'] = [{ c: bx0 + W * r.range(0.2, 0.8), w: 1.1, kind: 'door' }];
    const wall = r.pick(C.brick);
    this._building({
      x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 3.6, wall, inner: 0x9a9486, roof: 0x3a3634, floor: 0x5a5a54, trim: C.trim,
      openings, partitions: [{ axis: 'x', at: storeCut, from: bx0 + T / 2, to: bx1 - T / 2, doors: [bx0 + W * r.range(0.2, 0.8)] }],
      kind: 'shop', surface: 'ground',
    });
    // storefront sign
    const sz = front === 'n' ? bz0 - T / 2 - 0.08 : bz1 + T / 2 + 0.08;
    this.batch.box(cx, 3.05, sz, Math.min(W - 2, 7), 0.6, 0.1, r.pick([0x7a2a22, 0x2a4a6a, 0x3a5a3a, 0x8a6a2a]));
    const salesZ0 = front === 'n' ? bz0 + T / 2 : storeCut + 0.06, salesZ1 = front === 'n' ? storeCut - 0.06 : bz1 - T / 2;
    const storeZ0 = front === 'n' ? storeCut + 0.06 : bz0 + T / 2, storeZ1 = front === 'n' ? bz1 - T / 2 : storeCut - 0.06;
    const sales = this._room(bx0 + T / 2, salesZ0, bx1 - T / 2, salesZ1, 'sales');
    const store = this._room(bx0 + T / 2, storeZ0, bx1 - T / 2, storeZ1, 'store');
    // shelf rows in the sales floor
    const rows = Math.floor((sales.x1 - sales.x0 - 2) / 3.2);
    const midZ = (sales.z0 + sales.z1) / 2;
    for (let i = 0; i < rows; i++) {
      const sx = sales.x0 + 1.8 + i * 3.2;
      if (Math.abs(sx - cx) < 1.4) continue;
      this._freeShelf(sx, midZ, 0.6, Math.min(2.6, sales.z1 - sales.z0 - 3.2), true);
    }
    this._prop('counter', sales, [front === 'n' ? 'e' : 'w']);
    this._container('desk', sales, 'desk', ['e', 'w']);
    this._container('locker', store, 'locker');
    this._container('crate', store, 'crate');
    if (r.chance(0.6)) this._container('crate', store, 'shelf');
    if (r.chance(0.5)) this._container('toolbox', store, 'toolbox');
    this._floorLoot(sales, 0.5);
    this._markInterior(sales, 0.3);
    this._markInterior(store, 0.3);
    for (let i = 0; i < 2; i++) this._junk(r.range(x0 + 1, x1 - 1), front === 'n' ? r.range(bz1 + 0.8, z1 - 0.5) : r.range(z0 + 0.5, bz0 - 0.8));
  }

  // Freestanding store shelf (container), long axis along z or x.
  _freeShelf(x, z, w, len, alongZ) {
    const sx = alongZ ? w : len, sz = alongZ ? len : w;
    const col = 0x5a5e62;
    for (let i = 0; i < 4; i++) this.batch.box(x, 0.15 + i * 0.48, z, sx, 0.04, sz, col, { jitter: 0.02 });
    for (const a of [-1, 1]) for (const b of [-1, 1]) this.batch.box(x + a * (sx / 2 - 0.03), 0.85, z + b * (sz / 2 - 0.03), 0.05, 1.7, 0.05, 0x3a3e42);
    const r = this.rng;
    // leftover stock on the bottom and top boards
    for (let i = 0; i < 6; i++) {
      if (r.chance(0.35)) continue;
      const lvl = r.chance(0.5) ? 0 : 3;
      const along = r.range(-len / 2 + 0.2, len / 2 - 0.2);
      this.batch.box(x + (alongZ ? 0 : along), 0.26 + lvl * 0.48, z + (alongZ ? along : 0), 0.2, 0.18, 0.2, r.pick([0x8a3a22, 0xc0a060, 0x3a5a7a, 0xb8b0a0]), { jitter: 0.1 });
    }
    this.world.addBoxC(x, 0.85, z, sx, 1.7, sz, { occlude: false, kind: 'furniture' });
    // loot sits on the two middle boards, in plain sight
    const items = rollContainer(r, 'shelf', this.zone.lootTier).concat(r.chance(0.5) ? rollContainer(r, 'shelf', this.zone.lootTier) : []);
    const spots = [];
    for (const lvl of [1, 2]) for (const k of [-1, 0, 1]) spots.push([lvl, k]);
    r.shuffle(spots);
    items.slice(0, spots.length).forEach((it, i) => {
      const [lvl, k] = spots[i];
      const along = (k * len) / 3;
      const slot = { max: [len / 3 - 0.06, 0.4, w - 0.08] };
      const fit = this.loot._fit(it.id, slot);
      const pos = new THREE.Vector3(x + (alongZ ? 0 : along), 0.17 + lvl * 0.48, z + (alongZ ? along : 0));
      this.loot.spawnItem(it, pos, fit.rot + (alongZ ? Math.PI / 2 : 0), { scale: fit.scale });
    });
  }


  _clinic(x0, z0, x1, z1, front) {
    const r = this.rng;
    this.clear = [];
    const W = r.range(15, Math.min(20, x1 - x0 - 3)), D = r.range(9.5, Math.min(11, z1 - z0 - 1.6));
    const cx = (x0 + x1) / 2 + r.range(-0.8, 0.8);
    const bx0 = cx - W / 2, bx1 = cx + W / 2;
    const bz0 = front === 'n' ? z0 + 0.8 : z1 - 0.8 - D, bz1 = bz0 + D;
    const lobbyD = 4.0;
    const cut = front === 'n' ? bz0 + lobbyD : bz1 - lobbyD;
    const nRooms = W > 17.5 ? 3 : 2;
    const roomW = W / nRooms;
    const doors = [];
    const parts = [];
    for (let i = 0; i < nRooms; i++) doors.push(bx0 + roomW * (i + 0.5) + r.range(-0.8, 0.8));
    for (let i = 1; i < nRooms; i++) {
      const at = bx0 + roomW * i;
      parts.push({ axis: 'z', at, from: front === 'n' ? cut + 0.06 : bz0 + T / 2, to: front === 'n' ? bz1 - T / 2 : cut - 0.06, doors: [] });
    }
    parts.push({ axis: 'x', at: cut, from: bx0 + T / 2, to: bx1 - T / 2, doors });
    const openings = { w: [{ c: (bz0 + bz1) / 2, w: 1.0, kind: 'window' }], e: [{ c: (bz0 + bz1) / 2, w: 1.0, kind: 'window' }] };
    openings[front] = [{ c: cx, w: 1.8, kind: 'door' }, { c: cx - 3.5, w: 1.6, kind: 'window' }, { c: cx + 3.5, w: 1.6, kind: 'window' }];
    const back = [];
    for (let i = 0; i < nRooms; i++) if (r.chance(0.6)) back.push({ c: bx0 + roomW * (i + 0.5), w: 1.0, kind: 'window' });
    openings[front === 'n' ? 's' : 'n'] = back;
    this._building({
      x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 3.4, wall: C.clinic, inner: 0xc4c6be, roof: 0x4a4a48, floor: 0x7a7a72, trim: 0x8a2a22,
      openings, partitions: parts, kind: 'clinic', surface: 'ground',
    });
    // red cross sign
    const sz = front === 'n' ? bz0 - T / 2 - 0.06 : bz1 + T / 2 + 0.06;
    this.batch.box(cx, 2.9, sz, 1.1, 0.34, 0.06, 0xa82a22);
    this.batch.box(cx, 2.9, sz, 0.34, 1.1, 0.06, 0xa82a22);
    const lz0 = front === 'n' ? bz0 + T / 2 : cut + 0.06, lz1 = front === 'n' ? cut - 0.06 : bz1 - T / 2;
    const lobby = this._room(bx0 + T / 2, lz0, bx1 - T / 2, lz1, 'lobby');
    this._container('desk', lobby, 'desk', [front === 'n' ? 's' : 'n']);
    this._markInterior(lobby, 0.2);
    for (let i = 0; i < nRooms; i++) {
      const rx0 = bx0 + roomW * i + (i === 0 ? T / 2 : 0.06), rx1 = bx0 + roomW * (i + 1) - (i === nRooms - 1 ? T / 2 : 0.06);
      const rz0 = front === 'n' ? cut + 0.06 : bz0 + T / 2, rz1 = front === 'n' ? bz1 - T / 2 : cut - 0.06;
      const rm = this._room(rx0, rz0, rx1, rz1, 'exam');
      this._container('medcab', rm, 'medcab');
      if (r.chance(0.6)) this._container('medcab', rm, 'medcab');
      this._prop('bed', rm);
      if (r.chance(0.5)) this._container('locker', rm, 'locker');
      this._floorLoot(rm, 0.35);
      this._markInterior(rm, 0.35);
    }
  }

  _warehouse(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    const W = r.range(19, x1 - x0 - 3), D = r.range(15, z1 - z0 - 5);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + r.range(-1, 1);
    const bx0 = cx - W / 2, bx1 = cx + W / 2, bz0 = cz - D / 2, bz1 = cz + D / 2;
    const hw = { kind: 'window', w: 2.0, sill: 3.2, top: 4.2 };
    const openings = {
      n: [{ c: cx + r.range(-3, 3), w: 3.6, kind: 'door' }, { ...hw, c: bx0 + 3 }, { ...hw, c: bx1 - 3 }],
      s: [{ c: bx0 + r.range(3, W - 3), w: 1.2, kind: 'door' }, { ...hw, c: cx }],
      e: [{ ...hw, c: cz }, { c: bz0 + D * 0.7, w: 3.6, kind: 'door' }],
      w: [{ ...hw, c: cz }],
    };
    const wall = r.pick(C.warehouse);
    this._building({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 5.4, wall, inner: wall, roof: 0x3e4242, floor: 0x5c5a54, openings, partitions: [], kind: 'warehouse', surface: 'ground' });
    // office in the south-west corner
    const ow = 4.4, od = 4.0;
    const ox1 = bx0 + T / 2 + ow, oz0 = bz1 - T / 2 - od;
    this._wall('z', ox1, oz0, bz1 - T / 2, 0.14, 2.8, [{ c: oz0 + od / 2, w: 1.1, kind: 'door' }], 0x8a8478, null, 0);
    this._wall('x', oz0, bx0 + T / 2, ox1 + 0.07, 0.14, 2.8, [{ c: bx0 + ow / 2, w: 1.6, kind: 'window', sill: 1.0, top: 2.1 }], 0x8a8478, null, 0);
    this.batch.box(bx0 + T / 2 + ow / 2, 2.85, oz0 + od / 2, ow + 0.1, 0.1, od + 0.1, 0x5a5850);
    const office = this._room(bx0 + T / 2, oz0 + 0.07, ox1 - 0.07, bz1 - T / 2, 'office');
    this._container('desk', office, 'desk');
    this._container('locker', office, 'locker');
    if (r.chance(0.5)) this._container('toolbox', office, 'toolbox');
    this._markInterior(office, 0.3);
    // racks with crates in rows along x
    const hall = this._room(bx0 + T / 2, bz0 + T / 2, bx1 - T / 2, bz1 - T / 2, 'hall');
    hall.occ.push({ x0: office.x0 - 0.2, z0: office.z0 - 1.4, x1: office.x1 + 1.4, z1: office.z1 });
    const rows = Math.floor((D - 6) / 3.6);
    for (let i = 0; i < rows; i++) {
      const rz = bz0 + 3 + i * 3.6;
      const rx0 = bx0 + 2.5, rx1 = bx1 - 2.5 - (rz > oz0 - 1.5 ? 0 : 0);
      if (rz > oz0 - 1.5) continue;
      this._rack(rx0, rz, rx1, rz);
      for (let k = 0; k < 2; k++) {
        const cxr = r.range(rx0 + 1, rx1 - 1);
        if (r.chance(0.7)) this._crateAt(cxr, rz + 1.0, r.chance(0.8) ? 'crate' : 'locker');
      }
    }
    this._container('toolbox', hall, 'toolbox', ['e']);
    this._floorLoot(hall, 0.6);
    this._markInterior(hall, 0.25);
    this._markInterior(hall, 0.25);
    // outside: trucks and pallets
    if (r.chance(0.7)) this._truck(r.range(x0 + 4, x1 - 4), z0 + 1.6, r.chance(0.5) ? 0 : Math.PI);
    for (let i = 0; i < 3; i++) this._junk(r.range(x0 + 1, x1 - 1), r.chance(0.5) ? r.range(z0 + 0.8, bz0 - 1) : r.range(bz1 + 1, z1 - 0.8));
  }

  _rack(x0, z, x1) {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    for (let i = 0; i < 3; i++) this.batch.box(cx, 0.2 + i * 0.9, z, len, 0.06, 1.0, 0x6a5a3a);
    for (let s = 0; s <= len; s += 2.5) {
      this.batch.box(x0 + s, 1.25, z - 0.48, 0.08, 2.5, 0.08, 0x2a4a7a);
      this.batch.box(x0 + s, 1.25, z + 0.48, 0.08, 2.5, 0.08, 0x2a4a7a);
    }
    const r = this.rng;
    for (let s = 0.6; s < len - 0.5; s += 1.1) {
      if (r.chance(0.35)) continue;
      const lvl = r.int(0, 2);
      this.batch.box(x0 + s, 0.23 + lvl * 0.9 + 0.3, z, 0.9, 0.6, 0.8, r.pick([C.woodLight, 0x8a7a5a, 0x6a6a5a]), { jitter: 0.1 });
    }
    this.world.addBoxC(cx, 1.25, z, len, 2.5, 1.0, { occlude: true, kind: 'rack' });
  }

  _crateAt(x, z, kind, rotY = 0) {
    const spec = CONTAINER_SPECS[kind];
    const ex = Math.abs(Math.sin(rotY)) > 0.5;
    this.world.addBoxC(x, spec.h / 2, z, ex ? spec.d : spec.w, spec.h, ex ? spec.w : spec.d, { occlude: false, kind: 'furniture' });
    const table = { military: 'military', locker: 'locker', guardlocker: 'military', crypt: 'crypt' }[kind] || 'crate';
    this.loot.addContainer({ kind, spec, x, z, y0: 0, rotY, items: rollContainer(this.rng, table, this.zone.lootTier) });
  }


  _truck(x, z, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const L = 7.5, W = 2.4;
    this.batch.box(x, 1.7, z + 0, L, 2.6, W, 0x8a8478, { rotY: ang + Math.PI / 2, ao: 1 });
    this.batch.box(x + ca * (L / 2 + 1.0), 1.3, z - sa * (L / 2 + 1.0), 2.0, 1.9, W, 0x5a2a22, { rotY: ang + Math.PI / 2, ao: 1 });
    const ex = Math.abs(ca) * (L + 2) + Math.abs(sa) * W, ez = Math.abs(sa) * (L + 2) + Math.abs(ca) * W;
    this.world.addBoxC(x + ca * 1.0, 1.5, z - sa * 1.0, ex, 3.0, ez, { occlude: true, kind: 'car' });
    this.map.props.push({ x, z, w: ex, d: ez });
  }

  _containerYard(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    const cols = [x0 + 4, (x0 + x1) / 2, x1 - 4];
    const rowsZ = [z0 + 3.5, z0 + 9.5, z1 - 9.5, z1 - 3.5];
    for (const cx of cols) {
      for (const cz of rowsZ) {
        if (r.chance(0.2)) continue;
        const open = r.chance(0.45);
        const col = r.pick(C.containers);
        const L = 6.1, W = 2.44, H = 2.6;
        const x0c = cx - L / 2, x1c = cx + L / 2, z0c = cz - W / 2, z1c = cz + W / 2;
        if (open) {
          const endE = r.chance(0.5);
          const ops = endE ? { e: [{ c: cz, w: W - 0.2, kind: 'gap' }] } : { w: [{ c: cz, w: W - 0.2, kind: 'gap' }] };
          const inner = this._building({ x0: x0c, z0: z0c, x1: x1c, z1: z1c, h: H, wall: col, inner: 0x3a3a38, roof: col, floor: 0x3a3a36, openings: ops, kind: 'container', surface: 'metal' });
          // door leaves swung open
          const ex = endE ? x1c : x0c;
          this.batch.box(ex + (endE ? 0.1 : -0.1), H / 2, z0c - 0.6, 0.06, H, 1.2, col, { rotY: 0 });
          const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'container');
          this._crateAt(endE ? inner.x0 + 0.7 : inner.x1 - 0.7, cz, r.chance(0.8) ? 'crate' : 'locker', endE ? Math.PI / 2 : -Math.PI / 2);
          this._floorLoot(rm, 0.4);
          if (r.chance(0.35)) this.candidates.dormant.push({ x: cx, z: cz });
        } else {
          this._solid(cx, H / 2, cz, L, H, W, col, { ao: 1, kind: 'container' });
          for (let s = -L / 2 + 0.3; s < L / 2; s += 0.3) {
            this.batch.box(cx + s, H / 2, z0c - 0.01, 0.05, H - 0.1, 0.02, col, { jitter: 0.12 });
            this.batch.box(cx + s, H / 2, z1c + 0.01, 0.05, H - 0.1, 0.02, col, { jitter: 0.12 });
          }
          this.map.buildings.push({ x0: x0c, z0: z0c, x1: x1c, z1: z1c, kind: 'container' });
          if (r.chance(0.35)) {
            this.batch.box(cx, H + H / 2, cz, L, H, W, r.pick(C.containers), { ao: 1 });
            this.world.addBoxC(cx, H + H / 2, cz, L, H, W, { collide: false });
          }
        }
      }
    }
    for (let i = 0; i < 4; i++) this._junk(r.range(x0 + 1, x1 - 1), r.range(z0 + 1, z1 - 1));
    this._chainFence(x0 + 0.3, z0 + 0.3, x0 + 8, z0 + 0.3);
    this._chainFence(x1 - 8, z1 - 0.3, x1 - 0.3, z1 - 0.3);
    // a fire barrel for light
    if (r.chance(0.6)) this._fireBarrel(r.range(x0 + 2, x1 - 2), (z0 + z1) / 2 + r.range(-1.5, 1.5));
  }

  _park(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    this.batch.box((x0 + x1) / 2, 0.045, (z0 + z1) / 2, 2.0, 0.01, z1 - z0, 0x6a6458, { jitter: 0.02 });
    this.batch.box((x0 + x1) / 2, 0.046, (z0 + z1) / 2, x1 - x0, 0.01, 2.0, 0x6a6458, { jitter: 0.02 });
    const n = r.int(5, 9);
    for (let i = 0; i < n; i++) {
      const tx = r.range(x0 + 2, x1 - 2), tz = r.range(z0 + 2, z1 - 2);
      if (Math.abs(tx - (x0 + x1) / 2) < 2 || Math.abs(tz - (z0 + z1) / 2) < 2) continue;
      this._tree(tx, tz, true);
    }
    // gazebo in the middle
    const gx = (x0 + x1) / 2, gz = (z0 + z1) / 2;
    this.batch.cylinder(gx, 0.15, gz, 3.0, 3.0, 0.3, C.wood, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = gx + Math.cos(a) * 2.7, pz = gz + Math.sin(a) * 2.7;
      this.batch.box(px, 1.6, pz, 0.14, 2.6, 0.14, C.trim);
      this.world.addBoxC(px, 1.6, pz, 0.2, 2.6, 0.2, { occlude: false, kind: 'pole' });
    }
    this.batch.cone(gx, 3.4, gz, 3.5, 1.4, 0x4a3a32, 8);
    // benches with loot on them
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bx = gx + Math.cos(a) * 6, bz = gz + Math.sin(a) * 6;
      this.batch.box(bx, 0.45, bz, 1.6, 0.08, 0.5, C.woodLight, { rotY: -a });
      this.world.addBoxC(bx, 0.3, bz, 1.2, 0.6, 1.2, { occlude: false, kind: 'furniture' });
      if (r.chance(0.35)) this.loot.spawnItem(rollItem(r, 'floor', this.zone.lootTier), new THREE.Vector3(bx, 0.49, bz), r.range(0, 6));
    }
    this._fireBarrel(gx + 1.2, gz + 0.4);
    for (let i = 0; i < 4; i++) this.candidates.street.push({ x: r.range(x0 + 2, x1 - 2), z: r.range(z0 + 2, z1 - 2) });
  }

  _checkpoint(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // sandbag perimeter with gaps
    const sand = (ax, az, bx, bz) => {
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      for (let row = 0; row < 3; row++) {
        for (let s = 0; s < len; s += 0.62) {
          const px = alongX ? Math.min(ax, bx) + s + 0.3 + (row % 2) * 0.3 : mx;
          const pz = alongX ? mz : Math.min(az, bz) + s + 0.3 + (row % 2) * 0.3;
          if ((alongX ? px : pz) > Math.max(alongX ? ax : az, alongX ? bx : bz)) continue;
          this.batch.box(px, 0.18 + row * 0.33, pz, alongX ? 0.62 : 0.5, 0.32, alongX ? 0.5 : 0.62, C.sand, { jitter: 0.08, ao: 1 });
        }
      }
      this.world.addBoxC(mx, 0.55, mz, alongX ? len : 0.6, 1.1, alongX ? 0.6 : len, { occlude: false, kind: 'sandbag' });
    };
    const m = 2.5;
    sand(x0 + m, z0 + m, cx - 2, z0 + m);
    sand(cx + 2, z0 + m, x1 - m, z0 + m);
    sand(x0 + m, z1 - m, cx - 2, z1 - m);
    sand(cx + 2, z1 - m, x1 - m, z1 - m);
    sand(x0 + m, z0 + m, x0 + m, cz - 2);
    sand(x0 + m, cz + 2, x0 + m, z1 - m);
    sand(x1 - m, z0 + m, x1 - m, cz - 2);
    sand(x1 - m, cz + 2, x1 - m, z1 - m);
    // two tents
    for (const s of [-1, 1]) {
      const tx0 = cx + s * 5 - 3, tz0 = cz - 2.2 + s * 4;
      const ops = { s: [{ c: tx0 + 3, w: 2.0, kind: 'door' }], n: [{ c: tx0 + 3, w: 2.0, kind: 'door' }] };
      const inner = this._building({ x0: tx0, z0: tz0, x1: tx0 + 6, z1: tz0 + 4, h: 2.4, wall: 0x3e454c, inner: 0x4a5058, roof: 0x353b41, floor: 0x3a3a2e, trim: 0x9a1e18, openings: ops, kind: 'tent', surface: 'ground' });
      this.decals.add('guardsign', tx0 + 1.4, 1.3, s < 0 ? tz0 - T / 2 : tz0 + 4 + T / 2, 0, s < 0 ? -1 : 1, 1.2, 0.6);
      const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'tent');
      // the command tent keeps the radio and a keycard locker for signals gear
      if (s < 0) {
        const sig = this._container('guardlocker', rm, 'guard', ['e', 'w'], 'Guard Signals Locker');
        if (sig) this.story.signals.push(sig.c);
        this.batch.box(inner.x0 + 1.4, 0.4, (inner.z0 + inner.z1) / 2, 1.0, 0.8, 0.6, 0x3d444a, { ao: 1 });
        this.batch.box(inner.x0 + 1.4, 0.95, (inner.z0 + inner.z1) / 2, 0.5, 0.3, 0.35, 0x2a2e33);
        this.glow.box(inner.x0 + 1.4, 0.98, (inner.z0 + inner.z1) / 2 + 0.18, 0.2, 0.06, 0.01, 0x70ff90, { jitter: 0 });
        this.world.addBoxC(inner.x0 + 1.4, 0.55, (inner.z0 + inner.z1) / 2, 1.0, 1.1, 0.6, { occlude: false, kind: 'furniture' });
      }
      this._container('military', rm, 'military', ['e', 'w']);
      if (r.chance(0.7)) this._container('military', rm, 'military', ['e', 'w']);
      this._prop('bed', rm, ['e', 'w']);
      this._markInterior(rm, 0.4);
    }
    // humvee + barriers + floodlight tower
    this._car(cx + r.range(-6, 6), z0 + 5.5, Math.PI / 2 + r.range(-0.2, 0.2), false);
    this._roadblock(cx, z0 + 1.2, true);
    this._crateAt(cx + 2.5, cz + 0.2, 'military');
    for (let i = 0; i < 6; i++) this.candidates.checkpoint.push({ x: r.range(x0 + 4, x1 - 4), z: r.range(z0 + 4, z1 - 4) });
    // body bags
    for (let i = 0; i < 5; i++) this.batch.box(r.range(x0 + 4, x1 - 4), 0.14, r.range(z0 + 4, z1 - 4), 0.6, 0.28, 1.8, 0x1e2418, { rotY: r.range(0, 3) });
    this._fireBarrel(cx - 1.5, cz + 0.5);
  }

  // Paint on the outside of a building: graffiti and Guard notices on bare wall.
  _dressWalls(b, plan) {
    const r = this.rng;
    const chance = { house: 0.18, shop: 0.4, warehouse: 0.55, clinic: 0.3, container: 0.3, shed: 0.2, barracks: 0.6 }[b.kind] ?? 0.1;
    if (!r.chance(chance)) return;
    const { x0, z0, x1, z1, h } = b;
    const sides = [['n', x0, x1], ['s', x0, x1], ['w', z0, z1], ['e', z0, z1]];
    const [side, a0, a1] = r.pick(sides);
    // largest stretch of solid wall on that side
    const ops = plan[side].slice().sort((p, q) => p.c - q.c);
    let best = null, prev = a0 + 0.3;
    for (const o of [...ops, { c: a1 - 0.3 + 1000, w: 2000 }]) {
      const s0 = prev, e0 = Math.min(a1 - 0.3, o.c - o.w / 2 - 0.2);
      if (e0 - s0 > (best ? best[1] - best[0] : 1.6)) best = [s0, e0];
      prev = o.c + o.w / 2 + 0.2;
    }
    if (!best) return;
    const w = Math.min(2.4, best[1] - best[0] - 0.2), c = (best[0] + best[1]) / 2;
    const kind = b.kind === 'barracks' || (b.kind !== 'house' && r.chance(0.2)) ? 'guardsign' : 'graffiti';
    const hh = kind === 'guardsign' ? Math.min(w * 0.5, 0.8) : w * 0.5;
    const ww = hh * 2;
    const y = Math.min(h - hh / 2 - 0.25, 1.55);
    if (side === 'n') this.decals.add(kind, c, y, z0 - T / 2, 0, -1, ww, hh);
    else if (side === 's') this.decals.add(kind, c, y, z1 + T / 2, 0, 1, ww, hh);
    else if (side === 'w') this.decals.add(kind, x0 - T / 2, y, c, -1, 0, ww, hh);
    else this.decals.add(kind, x1 + T / 2, y, c, 1, 0, ww, hh);
  }

  // The Living Guard's justice: a body on a rope with a placard.
  _hanged(x, z, topY, face) {
    const r = this.rng;
    const b = this.batch;
    const neck = topY - 0.75;
    const clothes = r.pick([0x4a4a42, 0x3a3226, 0x5a4a3a, 0x2e3440, 0x6a5a4a]);
    const skin = r.pick([0x7a7a6a, 0x6a6458, 0x8a7a6a]);
    b.box(x, topY - 0.36, z, 0.03, 0.72, 0.03, 0x8a7a5a, { jitter: 0.05 });
    b.box(x, neck - 0.12, z, 0.2, 0.24, 0.21, skin, { rotY: face, ao: 1 });
    b.box(x, neck - 0.52, z, 0.38, 0.56, 0.22, clothes, { rotY: face, ao: 1 });
    const cs = Math.cos(face), sn = Math.sin(face);
    for (const sx of [-1, 1]) {
      b.box(x + sx * 0.25 * cs, neck - 0.5, z - sx * 0.25 * sn, 0.09, 0.6, 0.09, clothes, { rotY: face, ao: 1 });
      b.box(x + sx * 0.1 * cs, neck - 1.2, z - sx * 0.1 * sn, 0.13, 0.85, 0.14, 0x2a2a28, { rotY: face, ao: 1 });
    }
    // the placard hangs on the chest, facing out
    this.decals.add('placard', x + sn * 0.13, neck - 0.45, z + cs * 0.13, sn, cs, 0.44, 0.22);
  }

  _candles(x, z, y = 0.1) {
    const r = this.rng;
    const n = r.int(3, 7);
    for (let i = 0; i < n; i++) {
      const cx = x + r.range(-0.3, 0.3), cz = z + r.range(-0.3, 0.3), h = r.range(0.06, 0.22);
      this.batch.cylinder(cx, y + h / 2, cz, 0.025, 0.028, h, 0xd8ccb0, 6);
      this.glow.box(cx, y + h + 0.025, cz, 0.018, 0.04, 0.018, 0xffa040, { jitter: 0.15, ao: 1 });
    }
  }

  // A New Orleans city of the dead: whitewashed tombs above the waterline.
  _cemetery(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // wrought-iron fence with two gates
    const iron = 0x16181a;
    const fenceSide = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      for (let s0 = 0; s0 <= len; s0 += 0.22) {
        const px = alongX ? Math.min(ax, bx) + s0 : ax, pz = alongX ? az : Math.min(az, bz) + s0;
        this.batch.box(px, 0.8, pz, 0.03, 1.6, 0.03, iron, { jitter: 0 });
        this.batch.box(px, 1.64, pz, 0.05, 0.08, 0.05, iron, { jitter: 0 });
      }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      for (const y of [0.25, 1.45]) this.batch.box(mx, y, mz, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, iron, { jitter: 0 });
      this.world.addBoxC(mx, 0.8, mz, alongX ? len : 0.12, 1.6, alongX ? 0.12 : len, { occlude: false, kind: 'fence' });
    };
    const m = 0.4;
    fenceSide(x0 + m, z0 + m, cx - 1.4, z0 + m);
    fenceSide(cx + 1.4, z0 + m, x1 - m, z0 + m);
    fenceSide(x0 + m, z1 - m, cx - 1.4, z1 - m);
    fenceSide(cx + 1.4, z1 - m, x1 - m, z1 - m);
    fenceSide(x0 + m, z0 + m, x0 + m, z1 - m);
    fenceSide(x1 - m, z0 + m, x1 - m, z1 - m);
    // two mausoleums at the far corners, each with a burial vault inside
    const mausos = [[x0 + 3.2, z1 - 6.2, 's'], [x1 - 6.8, z0 + 2.2, 'n']];
    for (const [mx, mz, face] of mausos) {
      const ops = {};
      ops[face] = [{ c: mx + 1.8, w: 1.1, kind: 'door' }];
      const inner = this._building({ x0: mx, z0: mz, x1: mx + 3.6, z1: mz + 4, h: 3.1, wall: 0xa8a498, inner: 0x5a5850, roof: 0x6a6660, floor: 0x4a4844, openings: ops, kind: 'crypt', surface: 'ground' });
      this._crateAt((inner.x0 + inner.x1) / 2, (inner.z0 + inner.z1) / 2 + (face === 's' ? -0.4 : 0.4), 'crypt', 0);
      this._candles(inner.x0 + 0.5, face === 's' ? inner.z1 - 0.5 : inner.z0 + 0.5, 0.08);
      this.batch.box(mx + 1.8, 3.6, face === 's' ? mz + 4.05 : mz - 0.05, 0.12, 0.8, 0.12, 0x8a8680);
      this.batch.box(mx + 1.8, 3.7, face === 's' ? mz + 4.05 : mz - 0.05, 0.5, 0.12, 0.12, 0x8a8680);
      this.candidates.dormant.push({ x: (inner.x0 + inner.x1) / 2, z: (inner.z0 + inner.z1) / 2 });
    }
    const inMauso = (x, z) => mausos.some(([mx, mz]) => x > mx - 1.2 && x < mx + 4.8 && z > mz - 1.8 && z < mz + 5.8);
    // rows of tombs, with an aisle down the middle
    for (let z = z0 + 3; z < z1 - 3; z += 3.4) {
      for (let x = x0 + 2.4; x < x1 - 2.2; x += 2.2) {
        if (Math.abs(x - cx) < 1.6 || inMauso(x, z) || r.chance(0.22)) continue;
        const col = r.pick([0xbab6aa, 0xa8a498, 0xc4c0b4, 0x9a968a]);
        this.batch.box(x, 0.12, z, 1.3, 0.24, 2.4, 0x7a766c, { ao: 1 });
        this.batch.box(x, 0.8, z, 1.05, 1.15, 2.1, col, { jitter: 0.12 });
        this.batch.box(x, 1.45, z, 1.2, 0.16, 2.25, col, { jitter: 0.08 });
        this.batch.box(x, 1.6, z, 0.5, 0.14, 2.15, col, { jitter: 0.08 });
        if (r.chance(0.4)) {
          this.batch.box(x, 2.05, z - 0.9, 0.08, 0.75, 0.08, col);
          this.batch.box(x, 2.18, z - 0.9, 0.42, 0.08, 0.08, col);
        }
        this.world.addBoxC(x, 0.8, z, 1.3, 1.6, 2.4, { occlude: true, kind: 'tomb' });
        if (r.chance(0.16)) this._candles(x, z - 1.4, 0.02);
        if (r.chance(0.08)) this.loot.spawnItem(rollItem(r, 'crypt', this.zone.lootTier), new THREE.Vector3(x + r.range(-0.2, 0.2), 1.53, z + r.range(-0.6, 0.6)), r.range(0, 6));
        if (r.chance(0.18)) this.candidates.dormant.push({ x: x + 1.1, z: z + r.range(-0.8, 0.8) });
      }
      for (let k = 0; k < 2; k++) this.candidates.street.push({ x: cx + r.range(-1, 1), z });
    }
    // a weeping angel over the aisle
    this.batch.box(cx, 0.6, cz, 0.9, 1.2, 0.9, 0x8a8a84);
    this.batch.box(cx, 1.75, cz, 0.36, 1.1, 0.3, 0x9a9a92);
    this.batch.box(cx, 2.45, cz + 0.02, 0.22, 0.26, 0.24, 0x9a9a92);
    this.batch.box(cx - 0.32, 1.9, cz - 0.12, 0.5, 0.9, 0.06, 0x8e8e86, { rotY: -0.5 });
    this.batch.box(cx + 0.32, 1.9, cz - 0.12, 0.5, 0.9, 0.06, 0x8e8e86, { rotY: 0.5 });
    this.world.addBoxC(cx, 1.2, cz, 0.95, 2.4, 0.95, { occlude: true, kind: 'statue' });
    this._candles(cx, cz + 0.8, 0.02);
    for (let i = 0; i < 3; i++) this._tree(r.chance(0.5) ? x0 + 1.5 : x1 - 1.5, r.range(z0 + 2, z1 - 2));
  }

  _hesco(x, z, alongX, len) {
    const col = 0x8f8262;
    for (let s0 = 0; s0 < len; s0 += 1.1) {
      const px = alongX ? x - len / 2 + s0 + 0.55 : x, pz = alongX ? z : z - len / 2 + s0 + 0.55;
      this.batch.box(px, 0.95, pz, 1.08, 1.9, 1.08, col, { jitter: 0.07, top: 0x6a5e44 });
    }
    this.world.addBoxC(x, 0.95, z, alongX ? len : 1.1, 1.9, alongX ? 1.1 : len, { occlude: true, kind: 'hesco' });
  }

  _apc(x, z, ang) {
    const at = (lx, lz) => [x + lx * Math.cos(ang) + lz * Math.sin(ang), z - lx * Math.sin(ang) + lz * Math.cos(ang)];
    this.batch.box(x, 1.2, z, 2.6, 1.6, 6.0, 0x2e343a, { rotY: ang, ao: 1 });
    const [tx, tz] = at(0, -0.6);
    this.batch.box(tx, 2.25, tz, 1.4, 0.5, 1.8, 0x262b30, { rotY: ang, ao: 1 });
    const [bx, bz] = at(0, -1.8);
    this.batch.box(bx, 2.3, bz, 0.12, 0.12, 1.8, 0x1a1d20, { rotY: ang });
    for (const lz of [-2.1, 0, 2.1]) for (const lx of [-1.35, 1.35]) {
      const [wx, wz] = at(lx, lz);
      this.batch.box(wx, 0.5, wz, 0.3, 1.0, 1.0, 0x121212, { rotY: ang, ao: 1 });
    }
    const [sx, sz] = at(1.31, 0);
    this.batch.box(sx, 1.5, sz, 0.02, 0.18, 5.2, 0x9a1e18, { rotY: ang });
    const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
    this.world.addBoxC(x, 1.2, z, 2.6 * ca + 6 * sa, 2.4, 2.6 * sa + 6 * ca, { occlude: true, kind: 'car' });
    this.map.props.push({ x, z, w: 2.6 * ca + 6 * sa, d: 2.6 * sa + 6 * ca });
  }

  // An active Living Guard compound: Hesco walls, barracks, a comms mast, soldiers.
  _compound(x0, z0, x1, z1) {
    const r = this.rng;
    this.clear = [];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const m = 1.2;
    const gate = 4.5;
    // walls with a gate on the north and south faces
    this._hesco((x0 + m + cx - gate / 2) / 2, z0 + m, true, cx - gate / 2 - x0 - m);
    this._hesco((cx + gate / 2 + x1 - m) / 2, z0 + m, true, x1 - m - cx - gate / 2);
    this._hesco((x0 + m + cx - gate / 2) / 2, z1 - m, true, cx - gate / 2 - x0 - m);
    this._hesco((cx + gate / 2 + x1 - m) / 2, z1 - m, true, x1 - m - cx - gate / 2);
    this._hesco(x0 + m, cz, false, z1 - z0 - 2 * m - 1.1);
    this._hesco(x1 - m, cz, false, z1 - z0 - 2 * m - 1.1);
    this.decals.add('guardsign', cx - gate / 2 - 1.6, 1.2, z0 + m - 0.56, 0, -1, 1.6, 0.8, 0);
    this.decals.add('guardsign', cx + gate / 2 + 1.6, 1.2, z1 - m + 0.56, 0, 1, 1.6, 0.8, 1);
    // soldiers on both gates
    for (const [gz, face] of [[z0 + m - 1.4, Math.PI], [z1 - m + 1.4, 0]]) {
      this.candidates.guardPost.push({ x: cx - 1.4, z: gz, facing: face });
      this.candidates.guardPost.push({ x: cx + 1.4, z: gz, facing: face });
    }
    // two barracks
    for (const side of [-1, 1]) {
      const bw = 8, bd = 5.2;
      const bx0 = cx + side * 5.2 - bw / 2, bz0 = cz - bd / 2 + side * 3.6;
      const face = side < 0 ? 's' : 'n';
      const ops = { e: [], w: [] };
      ops[face] = [{ c: bx0 + bw / 2, w: 1.2, kind: 'door' }, { c: bx0 + 1.6, w: 1.0, kind: 'window' }, { c: bx0 + bw - 1.6, w: 1.0, kind: 'window' }];
      const inner = this._building({ x0: bx0, z0: bz0, x1: bx0 + bw, z1: bz0 + bd, h: 3.0, wall: 0x3a4046, inner: 0x5a6068, roof: 0x2a2e33, floor: 0x3a3a38, trim: 0x9a1e18, openings: ops, kind: 'barracks', surface: 'metal' });
      const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'barracks');
      const back = face === 's' ? 'n' : 's';
      this._prop('bed', rm, [back]);
      this._prop('bed', rm, [back]);
      this._container('guardlocker', rm, 'guard', ['e', 'w']);
      if (r.chance(0.7)) this._container('military', rm, 'guard', [back, 'e', 'w']);
      this._container('desk', rm, 'desk', ['e', 'w', back]);
      this._markInterior(rm, 0.05);
      this.candidates.guardPost.push({ x: bx0 + bw / 2 + r.range(-2, 2), z: face === 's' ? bz0 + bd + 1.6 : bz0 - 1.6, facing: face === 's' ? 0 : Math.PI });
    }
    // the relay mast: a lattice tower of dishes and horn drivers with a red light.
    // It's built as its own piece, local to its foot, so it can be brought down.
    const mx = x0 + m + 3.2, mz = z0 + m + 3.2;
    const mb = new Batcher();
    for (let i = 0; i < 6; i++) {
      const w = 1.6 - i * 0.22, y = i * 2.4 + 1.2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.box((sx * w) / 2, y, (sz * w) / 2, 0.08, 2.4, 0.08, 0x2a2e33);
      mb.box(0, y + 1.2, 0, w + 0.1, 0.06, w + 0.1, 0x2a2e33);
      mb.box(0, y, 0, w + 0.08, 0.05, 0.05, 0x2a2e33);
      mb.box(0, y, 0, 0.05, 0.05, w + 0.08, 0x2a2e33);
    }
    mb.cylinder(0.55, 10.6, 0, 0.5, 0.2, 0.2, 0x5a5e62, 10, { rz: Math.PI / 2 });
    mb.cylinder(-0.5, 12.8, 0.2, 0.36, 0.16, 0.45, 0x3a3e42, 8, { rz: -Math.PI / 2 });
    mb.box(0, 0.6, 0.85, 0.7, 1.2, 0.3, 0x3d444a);
    mb.box(0, 0.9, 1.01, 0.3, 0.12, 0.02, 0x9a1e18);
    this.story.relays.push({ x: mx, z: mz, b: mb, compound: { x0, z0, x1, z1 } });
    // the stump stays when the tower goes
    this.batch.box(mx, 0.08, mz, 1.9, 0.16, 1.9, 0x5a5852, { ao: 1 });
    this.world.addBoxC(mx, 1.2, mz, 1.8, 2.4, 1.8, { occlude: false, kind: 'mast' });
    // floodlights, an APC, a generator, supplies
    for (const [fx, fz] of [[x1 - m - 1.6, z0 + m + 1.6], [x0 + m + 1.6, z1 - m - 1.6]]) {
      this.batch.cylinder(fx, 3, fz, 0.1, 0.14, 6, 0x2a2e33, 6);
      this.batch.box(fx, 6.1, fz, 1.2, 0.5, 0.3, 0x1e2226, { rotY: Math.atan2(cx - fx, cz - fz) });
      this.glow.box(fx + Math.sign(cx - fx) * 0.12, 6.1, fz + Math.sign(cz - fz) * 0.12, 1.0, 0.36, 0.34, 0xfff2d8, { rotY: Math.atan2(cx - fx, cz - fz), jitter: 0 });
      this.world.addBoxC(fx, 3, fz, 0.3, 6, 0.3, { occlude: false, kind: 'pole' });
      this.floods.push({ pos: new THREE.Vector3(fx, 5.9, fz), target: new THREE.Vector3(cx, 0, cz) });
    }
    this._apc(x1 - m - 2.3, cz - 3.2, r.chance(0.5) ? 0 : Math.PI);
    this.batch.box(x0 + m + 2.2, 0.7, cz + 4.5, 1.6, 1.4, 1.0, 0x3d444a, { ao: 1 });
    this.glow.box(x0 + m + 2.2, 1.1, cz + 5.01, 0.12, 0.08, 0.02, 0x40ff60, { jitter: 0 });
    this.world.addBoxC(x0 + m + 2.2, 0.7, cz + 4.5, 1.6, 1.4, 1.0, { occlude: false, kind: 'junk' });
    this._crateAt(cx + r.range(-2, 2), cz, 'military', 0);
    this._crateAt(x0 + m + 2.2, cz - 3.5, 'military', Math.PI / 2);
    this._crateAt(cx + 5, z0 + m + 1.3, 'guardlocker', 0);
    for (let i = 0; i < 3; i++) this.batch.box(x0 + m + 5 + i * 1.3, 0.45, z1 - m - 2.2, 1.1, 0.9, 1.1, 0x4d5233, { rotY: r.range(-0.2, 0.2) });
    for (let i = 0; i < 4; i++) this.candidates.patrol.push({ x: r.range(x0 + 4, x1 - 4), z: r.range(z0 + 4, z1 - 4) });
  }

  _fireBarrel(x, z) {
    this.batch.cylinder(x, 0.45, z, 0.3, 0.3, 0.9, 0x3a2a1e, 8);
    this.world.addBoxC(x, 0.45, z, 0.55, 0.9, 0.55, { occlude: false, kind: 'junk' });
    this.fires.push(new THREE.Vector3(x, 1.1, z));
  }

  _levee() {
    const r = this.rng;
    const E = CITY_HALF + 0.6;
    // pick dock positions on opposite edges at road ends
    const side = r.int(0, 1);
    const roadsInner = [-36, 0, 36];
    const aRoad = r.pick(roadsInner), bRoad = r.pick(roadsInner);
    const docks = side === 0
      ? [{ axis: 'x', sign: 1, along: aRoad }, { axis: 'x', sign: -1, along: bRoad }]
      : [{ axis: 'z', sign: 1, along: aRoad }, { axis: 'z', sign: -1, along: bRoad }];
    if (r.chance(0.5)) docks.reverse();
    const gapW = 3.4;
    const wallH = 1.05;
    const leveeCol = 0x6a675e;
    const seg = (axis, fixed, a0, a1) => {
      if (a1 - a0 < 0.05) return;
      const c = (a0 + a1) / 2, len = a1 - a0;
      if (axis === 'x') this._solid(fixed, wallH / 2, c, 0.7, wallH, len, leveeCol, { occlude: false, kind: 'levee', ao: 1 });
      else this._solid(c, wallH / 2, fixed, len, wallH, 0.7, leveeCol, { occlude: false, kind: 'levee', ao: 1 });
      // paint on the city side of the levee
      for (let a = a0 + 3; a < a1 - 3; a += r.range(14, 30)) {
        if (!r.chance(0.55)) continue;
        const inward = -Math.sign(fixed);
        const kind = r.chance(0.8) ? 'graffiti' : 'guardsign';
        if (axis === 'x') this.decals.add(kind, fixed + inward * 0.36, 0.55, a, inward, 0, 1.5, 0.75);
        else this.decals.add(kind, a, 0.55, fixed + inward * 0.36, 0, inward, 1.5, 0.75);
      }
    };
    for (const axis of ['x', 'z']) {
      for (const sign of [-1, 1]) {
        const gaps = docks.filter((d) => d.axis === axis && d.sign === sign).map((d) => d.along).sort((a, b) => a - b);
        let cur = -E - 0.35;
        for (const g of gaps) {
          seg(axis, sign * E, cur, g - gapW / 2);
          cur = g + gapW / 2;
        }
        seg(axis, sign * E, cur, E + 0.35);
      }
    }
    // invisible outer boundary so nothing leaves the map except via docks
    const H = WORLD_HALF - 1;
    this.world.addBox(-H - 1, 0, -H - 1, H + 1, 4, -H, { occlude: false });
    this.world.addBox(-H - 1, 0, H, H + 1, 4, H + 1, { occlude: false });
    this.world.addBox(-H - 1, 0, -H, -H, 4, H, { occlude: false });
    this.world.addBox(H, 0, -H, H + 1, 4, H, { occlude: false });

    this.docks = docks.map((d, i) => this._dock(d, i === 0));
  }

  _dock(d, insertion) {
    const r = this.rng;
    const L = 13, Wd = 3.2;
    const start = CITY_HALF + 0.3;
    const dir = d.sign;
    // local frame: along = dock axis outward
    const P = (along, across) => (d.axis === 'x' ? { x: dir * along, z: d.along + across } : { x: d.along + across, z: dir * along });
    const box = (a0, a1, c0, c1, y0, y1, col, opts = {}) => {
      const p0 = P(a0, c0), p1 = P(a1, c1);
      const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), z0 = Math.min(p0.z, p1.z), z1 = Math.max(p0.z, p1.z);
      if (opts.draw !== false) this.batch.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, { jitter: 0.1, ao: 1 });
      if (opts.collide) this.world.addBox(x0, y0, z0, x1, y1, z1, { occlude: false, kind: 'dock' });
    };
    // deck planks
    for (let a = start; a < start + L; a += 0.5) box(a, a + 0.46, -Wd / 2, Wd / 2, -0.05, 0.08, C.woodLight);
    // pilings, posts and an open rail (the rail is solid to the touch)
    for (let a = start; a <= start + L; a += 2.6) {
      for (const s of [-1, 1]) {
        const p = P(a, s * (Wd / 2 + 0.1));
        this.batch.cylinder(p.x, -0.2, p.z, 0.12, 0.14, 2.2, C.wood, 6);
      }
    }
    for (let a = start; a <= start + L + 0.01; a += 1.3) {
      box(a, a + 0.1, -Wd / 2 - 0.12, -Wd / 2, 0.08, 1.05, C.wood);
      box(a, a + 0.1, Wd / 2, Wd / 2 + 0.12, 0.08, 1.05, C.wood);
    }
    box(start, start + L, -Wd / 2 - 0.14, -Wd / 2, 0.98, 1.06, C.woodLight);
    box(start, start + L, Wd / 2, Wd / 2 + 0.14, 0.98, 1.06, C.woodLight);
    box(start, start + L, -Wd / 2 - 0.1, -Wd / 2, 0.5, 0.56, C.woodLight);
    box(start, start + L, Wd / 2, Wd / 2 + 0.1, 0.5, 0.56, C.woodLight);
    box(start, start + L, -Wd / 2 - 0.15, -Wd / 2, 0.08, 1.05, 0, { collide: true, draw: false });
    box(start, start + L, Wd / 2, Wd / 2 + 0.15, 0.08, 1.05, 0, { collide: true, draw: false });
    box(start + L, start + L + 0.2, -Wd / 2, Wd / 2, 0.08, 1.05, C.wood, { collide: true, draw: false });
    box(start + L, start + L + 0.12, -Wd / 2, Wd / 2, 0.98, 1.06, C.woodLight);
    // skiff moored alongside the end
    const sp = P(start + L - 2.5, Wd / 2 + 1.3);
    const rot = d.axis === 'x' ? Math.PI / 2 : 0;
    this.batch.box(sp.x, -0.2, sp.z, 1.5, 0.5, 4.6, 0x3a4a3a, { rotY: rot, ao: 1, top: 0x2a2a24 });
    this.batch.box(sp.x, 0.1, sp.z, 1.6, 0.12, 4.7, 0x5a3a2a, { rotY: rot, ao: 1 });
    const motor = P(start + L - 0.3, Wd / 2 + 1.3);
    this.batch.box(motor.x, 0.2, motor.z, 0.4, 0.6, 0.4, 0x1a1a1a);
    // lantern post
    const lp = P(start + L - 0.4, -Wd / 2 + 0.2);
    this.batch.box(lp.x, 1.1, lp.z, 0.1, 2.2, 0.1, C.wood);
    const zoneCenter = P(start + L - 3.2, 0);
    const lantern = new THREE.Vector3(lp.x, 2.25, lp.z);
    this.map.docks.push({ x: zoneCenter.x, z: zoneCenter.z, insertion });
    // spawn point on the dock facing the city
    const spawn = P(start + 1.2, 0);
    const facing = d.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    // camera yaw looking toward the city (negative dock direction)
    const yaw = d.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    return {
      name: insertion ? 'Your Skiff' : this.rng.pick(['Lambert\'s Skiff', 'Old Ferry Dock', 'Bait Shop Pier']),
      center: new THREE.Vector3(zoneCenter.x, 0, zoneCenter.z),
      radius: 2.4,
      lantern,
      spawn: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw,
      facing,
      insertion,
    };
  }

  // Silhouettes beyond the levee: drowned rooftops, poles and dead trees.
  _horizon() {
    const r = this.rng;
    const cityBatch = this.batch;
    this.batch = new Batcher();
    for (let i = 0; i < 70; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(95, 170);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const k = r.next();
      if (k < 0.5) {
        const w = r.range(5, 12), h = r.range(0.5, 3.5);
        this.batch.box(x, h / 2 - 0.4, z, w, h, r.range(5, 10), r.pick(C.house), { rotY: r.range(-0.3, 0.3), ao: 0.4 });
        this.batch.box(x, h - 0.2, z, w + 0.8, 0.4, 8, r.pick(C.roofs), { rotY: r.range(-0.3, 0.3) });
      } else if (k < 0.8) {
        this.batch.cylinder(x, 3, z, 0.12, 0.16, 7, 0x2e2822, 5);
        this.batch.box(x, 6.2, z, 2.0, 0.1, 0.1, 0x2e2822, { rotY: a });
      } else {
        this.batch.cone(x, r.range(3, 6), z, r.range(1.5, 3), r.range(6, 11), r.pick(C.foliage));
      }
    }
    this.horizon = this.batch;
    this.batch = cityBatch;
  }
}
