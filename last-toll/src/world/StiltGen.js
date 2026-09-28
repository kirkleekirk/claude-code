import * as THREE from 'three';
import { CityGen, C, T } from './CityGen.js';
import { Batcher } from './Batcher.js';
import { rollItem } from '../data/loot.js';
import { CONTAINER_SPECS } from '../game/containers.js';

// Marais Noir: a fishing village on stilts out in the black water.
// Everything walkable is deck at y = 0: a spine of boardwalk with branches out
// to shacks, fish houses, a bait shop and a chapel, all on pilings. The swamp
// below is deep; anything shoved off the edge goes under.

const HALF = 64;
const WALK = 3.2; // boardwalk width
const PILING = 0x2e261c;
const DECK = 0x5a4632;
const DECK_DARK = 0x3e3024;
const RAIL = 0x4a3a2a;
const WEATHERED = [0x5e5a4e, 0x4e5448, 0x5a4c40, 0x646058, 0x4a4a44, 0x6a5a48];
const TIN = [0x5a5048, 0x4a4a46, 0x6a4a36, 0x3e4240];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class StiltGen extends CityGen {
  _layout() {
    const r = this.rng;
    this.map.stilts = true;
    this.decks = [];
    this.candidates.emerge = [];
    this.waterY = -1.6;

    // the spine: a boardwalk wandering west from the landing, jogging north and south
    let x = 58, z = r.range(-14, 14);
    const startZ = z;
    const spine = [];
    let first = true, square = false;
    for (;;) {
      // one long stretch through the middle of the village for the chapel square
      const long = !square && x < 34 && x > 0;
      if (long) square = true;
      const len = Math.min(long ? r.range(30, 34) : r.range(16, 26), x + 56);
      // after a jog the new stretch reaches back over the jog's footprint
      const x1 = first ? x : x + WALK;
      spine.push(this._deck(x - len, z - WALK / 2, x1, z + WALK / 2, { kind: 'walk' }));
      x -= len;
      first = false;
      if (x <= -54) break;
      const dz = r.range(8, 16) * (z > 16 ? -1 : z < -16 ? 1 : r.sign());
      const za = dz > 0 ? z + WALK / 2 : z + dz + WALK / 2;
      const zb = dz > 0 ? z + dz - WALK / 2 : z - WALK / 2;
      spine.push(this._deck(x, za, x + WALK, zb, { kind: 'walk', alongX: false }));
      z += dz;
    }

    this.docks = [this._stiltDock(58, startZ, 1, true), this._stiltDock(x, z, -1, false)];

    // the chapel plaza off the middle of the spine
    const mids = spine.filter((s) => s.alongX && s.x1 - s.x0 > 23).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
    for (const seg of mids) if (this._plaza(seg)) break;

    // back lanes: walkways out to a second row of the village
    const streets = spine.filter((s) => s.alongX);
    for (let k = 0; k < 3; k++) {
      const lane = this._lane(r.pick(streets));
      if (lane) streets.push(lane);
    }

    // branches out to platforms, and platforms right off the boardwalk
    for (const seg of streets) {
      for (let k = r.int(3, 4); k > 0; k--) this._branch(seg, false);
      if (r.chance(0.85)) this._branch(seg, true);
    }
    for (const seg of streets) this.candidates.patrol.push({ x: (seg.x0 + seg.x1) / 2, z: (seg.z0 + seg.z1) / 2 });

    this._edges();
    this._swamp();
    this._horizon();
  }

  // ---- deck ----------------------------------------------------------------------

  _free(rect, pad, ...ignore) {
    for (const q of this.decks) {
      if (ignore.includes(q)) continue;
      if (rect.x0 - pad < q.x1 && rect.x1 + pad > q.x0 && rect.z0 - pad < q.z1 && rect.z1 + pad > q.z0) return false;
    }
    return Math.abs(rect.z0) < HALF && Math.abs(rect.z1) < HALF && rect.x0 > -HALF - 6 && rect.x1 < HALF;
  }

  // A rectangle of deck on pilings. Rails, lanterns and climb-out points are added
  // later by _edges() once every deck is known, so no junction gets railed off.
  _deck(x0, z0, x1, z1, opts = {}) {
    const r = this.rng;
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const alongX = opts.alongX ?? x1 - x0 >= z1 - z0;
    const rect = { x0, z0, x1, z1, alongX, rail: opts.rail !== false, kind: opts.kind || 'deck' };
    this.decks.push(rect);
    this.world.addFloor(x0, z0, x1, z1);
    this.map.roads.push({ x0, z0, x1, z1 });
    const len = alongX ? x1 - x0 : z1 - z0;
    const wid = alongX ? z1 - z0 : x1 - x0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // planks laid across, the odd one gone
    const n = Math.max(1, Math.round(len / 0.32));
    const pw = len / n;
    for (let i = 0; i < n; i++) {
      if (!opts.solid && r.chance(0.02)) continue;
      const col = r.chance(0.2) ? DECK_DARK : DECK;
      const a = (alongX ? x0 : z0) + (i + 0.5) * pw;
      if (alongX) this.batch.box(a, -0.04, cz, pw - 0.03, 0.08, wid, col, { jitter: 0.12, ao: 1 });
      else this.batch.box(cx, -0.04, a, wid, 0.08, pw - 0.03, col, { jitter: 0.12, ao: 1 });
    }
    // joists under the planks, so gaps show shadow rather than a view straight down
    this.batch.box(cx, -0.12, cz, x1 - x0 - 0.02, 0.03, z1 - z0 - 0.02, 0x16120e, { jitter: 0, ao: 1 });
    for (const e of [-1, 1]) {
      if (alongX) this.batch.box(cx, -0.2, e > 0 ? z1 - 0.1 : z0 + 0.1, len, 0.18, 0.14, 0x2a2018, { ao: 1 });
      else this.batch.box(e > 0 ? x1 - 0.1 : x0 + 0.1, -0.2, cz, 0.14, 0.18, len, 0x2a2018, { ao: 1 });
    }
    const pn = Math.max(1, Math.round(len / 2.6));
    const wn = Math.max(1, Math.floor(wid / 3));
    for (let i = 0; i <= pn; i++) {
      const a = (alongX ? x0 : z0) + 0.15 + (i * (len - 0.3)) / pn;
      for (let k = 0; k <= wn; k++) {
        const b = (alongX ? z0 : x0) + 0.12 + (k * (wid - 0.24)) / wn;
        this.batch.cylinder(alongX ? a : b, -1.5, alongX ? b : a, 0.12, 0.15, 3, PILING, 6);
      }
    }
    return rect;
  }

  // Rails, lanterns and the places the dead climb up, along every edge of deck
  // that faces open water.
  _edges() {
    const r = this.rng;
    const onOther = (x, z, self) => this.decks.some((q) => q !== self && x > q.x0 - 0.05 && x < q.x1 + 0.05 && z > q.z0 - 0.05 && z < q.z1 + 0.05);
    for (const q of this.decks) {
      const sides = [
        { ax: true, fixed: q.z0, a0: q.x0, a1: q.x1, n: [0, -1] },
        { ax: true, fixed: q.z1, a0: q.x0, a1: q.x1, n: [0, 1] },
        { ax: false, fixed: q.x0, a0: q.z0, a1: q.z1, n: [-1, 0] },
        { ax: false, fixed: q.x1, a0: q.z0, a1: q.z1, n: [1, 0] },
      ];
      for (const s of sides) {
        // stretches of this edge with open water beyond; a junction breaks them
        const runs = [];
        let run = null;
        const step = 0.25;
        for (let a = s.a0 + step / 2; a < s.a1; a += step) {
          const ox = s.ax ? a : s.fixed + s.n[0] * 0.3, oz = s.ax ? s.fixed + s.n[1] * 0.3 : a;
          const open = !onOther(ox, oz, q);
          if (open && !run) run = [a - step / 2, a + step / 2];
          else if (open) run[1] = a + step / 2;
          else if (run) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        // a point on this edge, `inset` metres in from it (negative = out over the water)
        const P = (a, inset) => (s.ax ? [a, s.fixed - s.n[1] * inset] : [s.fixed - s.n[0] * inset, a]);
        for (const [b0, b1] of runs) {
          // hold rails back from junctions so the gap reads as a way through
          const c0 = b0 > s.a0 + 0.1 ? b0 + 0.4 : b0 + 0.05, c1 = b1 < s.a1 - 0.1 ? b1 - 0.4 : b1 - 0.05;
          if (q.rail) {
            let a = c0;
            while (a < c1 - 0.8) {
              const len = Math.min(c1 - a, r.range(2.5, 7));
              if (r.chance(0.7)) {
                const [mx, mz] = P(a + len / 2, 0.06);
                const broke = r.chance(0.15);
                this.batch.box(mx, broke ? 0.72 : 0.98, mz, s.ax ? len : 0.07, 0.07, s.ax ? 0.07 : len, RAIL, { jitter: 0.12 });
                this.batch.box(mx, 0.5, mz, s.ax ? len : 0.05, 0.05, s.ax ? 0.05 : len, RAIL, { jitter: 0.12 });
                const posts = Math.max(1, Math.round(len / 1.3));
                for (let i = 0; i <= posts; i++) {
                  const [px, pz] = P(a + (i * len) / posts, 0.06);
                  this.batch.box(px, 0.5, pz, 0.08, 1.02, 0.08, 0x3a2e22);
                }
              }
              a += len + r.range(0.6, 2.6);
            }
          }
          // lantern posts, some still burning
          for (let a = c0 + r.range(2, 6); a < c1 - 1; a += r.range(11, 18)) {
            const [px, pz] = P(a, 0.12);
            const [lx, lz] = P(a, 0.5);
            this.batch.box(px, 1.2, pz, 0.1, 2.4, 0.1, 0x2a2018);
            this.batch.box((px + lx) / 2, 2.36, (pz + lz) / 2, s.ax ? 0.05 : 0.42, 0.05, s.ax ? 0.42 : 0.05, 0x2a2018);
            this.batch.box(lx, 2.1, lz, 0.17, 0.26, 0.17, 0x1a1a18);
            if (r.chance(0.5)) this.glow.box(lx, 2.1, lz, 0.1, 0.17, 0.1, 0xffae4a, { jitter: 0.12 });
            this.world.addBoxC(px, 1.2, pz, 0.14, 2.4, 0.14, { occlude: false, kind: 'pole' });
          }
          // climb-out points
          for (let a = c0 + 1.5; a < c1 - 1.5; a += 6.5) {
            const [tx, tz] = P(a, 0.7);
            const [fx, fz] = P(a, -1.2);
            this.candidates.emerge.push({ to: { x: tx, z: tz }, from: { x: fx, z: fz } });
          }
        }
      }
      if (q.kind === 'walk') {
        const len = q.alongX ? q.x1 - q.x0 : q.z1 - q.z0;
        for (let a = 2; a < len - 2; a += 6) this.candidates.street.push({ x: q.alongX ? q.x0 + a : (q.x0 + q.x1) / 2, z: q.alongX ? (q.z0 + q.z1) / 2 : q.z0 + a });
      }
    }
    // walkers that arrive mid-raid come up out of the water
    for (const e of this.candidates.emerge) if (r.chance(0.35)) this.candidates.edge.push({ x: e.to.x, z: e.to.z });
  }

  // A narrower boardwalk running parallel to the spine, reached by a cross walk.
  _lane(seg) {
    const r = this.rng;
    for (let attempt = 0; attempt < 6; attempt++) {
      const dir = r.sign();
      const edge = dir > 0 ? seg.z1 : seg.z0;
      const bx = r.range(seg.x0 + 2, seg.x1 - 2);
      const len = r.range(12, 18);
      const cross = { x0: bx - 1.2, x1: bx + 1.2, z0: dir > 0 ? edge : edge - len, z1: dir > 0 ? edge + len : edge };
      const L = r.range(24, 38), lw = 2.8;
      const lx0 = bx - L * r.range(0.3, 0.7);
      const tip = dir > 0 ? cross.z1 : cross.z0;
      const lane = { x0: lx0, x1: lx0 + L, z0: dir > 0 ? tip : tip - lw, z1: dir > 0 ? tip + lw : tip };
      if (!this._free(cross, 1.2, seg) || !this._free(lane, 2.5)) continue;
      this._deck(cross.x0, cross.z0, cross.x1, cross.z1, { kind: 'walk', alongX: false });
      return this._deck(lane.x0, lane.z0, lane.x1, lane.z1, { kind: 'walk', alongX: true });
    }
    return null;
  }

  // A walkway off a spine segment out to a platform (or a platform flush against it).
  _branch(seg, flush) {
    const r = this.rng;
    const type = r.weighted([['shack', 6], ['fishhouse', 1.4], ['bait', 1], ['boathouse', 0.8]]);
    const W = type === 'bait' ? r.range(10, 12) : type === 'fishhouse' ? r.range(9, 11) : r.range(8.5, 10.5);
    const D = type === 'bait' ? r.range(9.5, 11) : r.range(8.5, 10.5);
    for (let attempt = 0; attempt < 6; attempt++) {
      const dir = r.sign();
      const edge = dir > 0 ? seg.z1 : seg.z0;
      const bx = r.range(seg.x0 + 2, seg.x1 - 2);
      const len = flush ? r.range(1.2, 2.2) : r.range(3.5, 12);
      const walk = { x0: bx - 1.1, x1: bx + 1.1, z0: dir > 0 ? edge : edge - len, z1: dir > 0 ? edge + len : edge };
      const px0 = bx - W / 2 + r.range(-W / 2 + 1.8, W / 2 - 1.8);
      const tip = dir > 0 ? walk.z1 : walk.z0;
      const plat = { x0: px0, x1: px0 + W, z0: dir > 0 ? tip : tip - D, z1: dir > 0 ? tip + D : tip };
      if (!this._free(walk, 0.8, seg) || !this._free(plat, 1.3)) continue;
      this._deck(walk.x0, walk.z0, walk.x1, walk.z1, { kind: 'walk', alongX: false });
      const p = this._deck(plat.x0, plat.z0, plat.x1, plat.z1, { kind: type, alongX: true });
      const front = dir > 0 ? 'n' : 's';
      // keep the landing clear of furniture
      this.clear = [{ x0: bx - 1.6, x1: bx + 1.6, z0: tip - 2.4, z1: tip + 2.4 }];
      if (type === 'shack') this._shack(p, front, bx);
      else if (type === 'fishhouse') this._fishHouse(p, front);
      else if (type === 'bait') this._baitShop(p, front, bx);
      else this._boathouse(p, bx);
      return;
    }
  }

  // ---- buildings on the platforms ---------------------------------------------------

  _shack(p, front, doorX) {
    const r = this.rng;
    const W = Math.min(7.2, p.x1 - p.x0 - 1.8), D = Math.min(6.6, p.z1 - p.z0 - 2.6);
    const x0 = (p.x0 + p.x1) / 2 - W / 2, x1 = x0 + W;
    const z0 = front === 'n' ? p.z0 + 2.1 : p.z1 - 2.1 - D, z1 = z0 + D;
    const dX = Math.max(x0 + 1, Math.min(x1 - 1, doorX));
    const two = D > 5.6 && r.chance(0.6);
    const cut = (z0 + z1) / 2 + r.range(-0.4, 0.4);
    const back = front === 'n' ? 's' : 'n';
    const openings = { w: [{ c: (z0 + z1) / 2, w: 0.9, kind: 'window' }], e: [{ c: (z0 + z1) / 2, w: 0.9, kind: 'window' }] };
    openings[front] = [{ c: dX, w: 1.05, kind: 'door' }, { c: dX + (dX > (x0 + x1) / 2 ? -2.1 : 2.1), w: 0.9, kind: 'window' }];
    openings[back] = r.chance(0.5) ? [{ c: (x0 + x1) / 2, w: 0.9, kind: 'window' }] : [];
    const roof = r.pick(TIN);
    const inner = this._building({
      x0, z0, x1, z1, h: 2.8, wall: r.pick(WEATHERED), inner: 0x5a5244, roof, floor: DECK_DARK, openings, kind: 'house',
      partitions: two ? [{ axis: 'x', at: cut, from: x0 + T / 2, to: x1 - T / 2, doors: [x0 + W * r.range(0.3, 0.7)] }] : [],
    });
    const plan = this.lastPlan[front];
    const doorOp = plan.find((o) => o.kind === 'door');
    const doorC = doorOp ? doorOp.c : dX;
    // porch roof on two posts, clear of the door
    const fz = front === 'n' ? z0 : z1, out = front === 'n' ? -1 : 1;
    this.batch.box((x0 + x1) / 2, 2.62, fz + out * 1.05, W + 0.3, 0.07, 2.1, roof, { ao: 1 });
    for (const px of [x0 + 0.15, x1 - 0.15]) {
      if (Math.abs(px - doorC) < 1.1) continue;
      this.batch.box(px, 1.3, fz + out * 1.9, 0.12, 2.6, 0.12, 0x3a2e22);
      this.world.addBoxC(px, 1.3, fz + out * 1.9, 0.16, 2.6, 0.16, { occlude: false, kind: 'pole' });
    }
    const rooms = two
      ? [this._room(inner.x0, inner.z0, inner.x1, cut - 0.06), this._room(inner.x0, cut + 0.06, inner.x1, inner.z1)]
      : [this._room(inner.x0, inner.z0, inner.x1, inner.z1)];
    // the room by the door is the kitchen; the one further in has the bed
    if (front === 's') rooms.reverse();
    rooms.forEach((rm, i) => {
      if (i === 0) {
        this._container('kitchen', rm, 'kitchen');
        if (rooms.length === 1 || r.chance(0.4)) this._container('dresser', rm, 'stilt');
        this._prop('table', rm);
      }
      if (i === rooms.length - 1) {
        this._prop('bed', rm);
        this._container('dresser', rm, 'stilt');
        if (r.chance(0.6)) this._container('medcab', rm, 'medcab');
      }
      this._floorLoot(rm, 0.35);
      this._markInterior(rm, 0.3);
    });
    // an X-code beside the door, on solid wall
    if (doorOp && r.chance(0.6)) {
      const side = doorOp.c - x0 > x1 - doorOp.c ? -1 : 1;
      const xc = doorOp.c + side * (doorOp.w / 2 + 0.55);
      if (xc > x0 + 0.5 && xc < x1 - 0.5 && !plan.some((o) => o !== doorOp && Math.abs(o.c - xc) < o.w / 2 + 0.5)) {
        this.decals.add('xcode', xc, 1.7, fz + out * (T / 2), 0, out, 0.9, 0.45);
      }
    }
    if (r.chance(0.2)) this._candles(x0 + 0.5, fz + out * 0.6, 0.02);
    if (r.chance(0.2)) this._bottleTree(p.x1 - 0.5, front === 'n' ? p.z0 + 0.55 : p.z1 - 0.55);
    if (r.chance(0.12) && Math.abs(x1 - 0.8 - doorC) > 1.2) this._hanged(x1 - 0.8, fz + out * 1.4, 2.58, front === 'n' ? Math.PI : 0);
  }

  _fishHouse(p, front) {
    const r = this.rng;
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    const W = p.x1 - p.x0 - 1.2, D = p.z1 - p.z0 - 1.2;
    const room = this._room(p.x0 + 0.5, p.z0 + 0.5, p.x1 - 0.5, p.z1 - 0.5);
    // an open shed: six posts and a tin roof
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]]) {
      const px = cx + (sx * W) / 2, pz = cz + (sz * D) / 2;
      this.batch.box(px, 1.45, pz, 0.14, 2.9, 0.14, 0x3a2e22);
      this.world.addBoxC(px, 1.45, pz, 0.2, 2.9, 0.2, { occlude: false, kind: 'pole' });
      room.occ.push({ x0: px - 0.35, x1: px + 0.35, z0: pz - 0.35, z1: pz + 0.35 });
    }
    this.batch.box(cx, 2.95, cz, W + 0.8, 0.1, D + 0.8, r.pick(TIN), { ao: 1 });
    this.world.addBox(cx - W / 2 - 0.4, 2.9, cz - D / 2 - 0.4, cx + W / 2 + 0.4, 3.0, cz + D / 2 + 0.4, { collide: false });
    this.world.interiors.push({ x0: cx - W / 2, z0: cz - D / 2, x1: cx + W / 2, z1: cz + D / 2, surface: 'wood' });
    this.map.buildings.push({ x0: cx - W / 2, z0: cz - D / 2, x1: cx + W / 2, z1: cz + D / 2, kind: 'shed' });
    // drying racks with the last catch still on them
    const rw = W * 0.62;
    for (let i = 0; i < 2; i++) {
      const rz = cz + (i === 0 ? -1 : 1) * D * 0.14;
      this.batch.box(cx, 1.9, rz, rw, 0.05, 0.05, RAIL);
      for (const sx of [-1, 1]) this.batch.box(cx + (sx * rw) / 2, 0.95, rz, 0.06, 1.9, 0.06, RAIL);
      for (let f = 0; f < 9; f++) {
        if (r.chance(0.3)) continue;
        this.batch.box(cx - rw * 0.45 + f * ((rw * 0.9) / 8), 1.6, rz, 0.09, 0.5, 0.03, r.pick([0x5a4a32, 0x6a5a3a, 0x3a3226]), { rotY: r.range(-0.3, 0.3) });
      }
      this.world.addBoxC(cx, 1, rz, rw, 2, 0.24, { occlude: false, kind: 'rack' });
      room.occ.push({ x0: cx - rw / 2 - 0.2, x1: cx + rw / 2 + 0.2, z0: rz - 0.5, z1: rz + 0.5 });
    }
    // a gutting table at the back and a pile of net
    const tz = front === 'n' ? p.z1 - 1.3 : p.z0 + 1.3;
    this.batch.box(cx, 0.86, tz, 2.2, 0.08, 0.8, 0x4a3a2a, { top: 0x3a1a14 });
    for (const sx of [-1, 1]) this.batch.box(cx + sx * 0.95, 0.42, tz, 0.08, 0.84, 0.7, RAIL);
    this.world.addBoxC(cx, 0.45, tz, 2.2, 0.9, 0.8, { occlude: false, kind: 'furniture' });
    room.occ.push({ x0: cx - 1.3, x1: cx + 1.3, z0: tz - 0.6, z1: tz + 0.6 });
    const nx = p.x0 + 1.3, nz = cz + r.range(-1, 1);
    this.batch.ico(nx, 0.1, nz, 0.7, 0x5a5a48, 0.25);
    room.occ.push({ x0: nx - 0.8, x1: nx + 0.8, z0: nz - 0.8, z1: nz + 0.8 });
    this._container('crate', room, 'stilt');
    if (r.chance(0.5)) this._container('toolbox', room, 'toolbox');
    else this._container('crate', room, 'stilt');
    this._markInterior(room, 0.25);
    if (r.chance(0.45)) this._hanged(cx + r.range(-1, 1), cz, 2.9, r.range(0, 6));
  }

  _baitShop(p, front, doorX) {
    const W = p.x1 - p.x0 - 1.2, D = p.z1 - p.z0 - 2.2;
    const x0 = p.x0 + 0.6, x1 = x0 + W;
    const z0 = front === 'n' ? p.z0 + 1.8 : p.z1 - 1.8 - D, z1 = z0 + D;
    const dX = Math.max(x0 + 1.3, Math.min(x1 - 1.3, doorX));
    const openings = { w: [], e: [] };
    openings[front] = [{ c: dX, w: 1.4, kind: 'door' }, { c: dX + (dX > (x0 + x1) / 2 ? -2.8 : 2.8), w: 1.8, kind: 'window', sill: 0.8, top: 2.2 }];
    const inner = this._building({ x0, z0, x1, z1, h: 3.1, wall: 0x6a5a48, inner: 0x7a6a56, roof: 0x4a4440, floor: DECK_DARK, openings, kind: 'shop', trim: 0x8a2a1a });
    const out = front === 'n' ? -1 : 1, fz = front === 'n' ? z0 : z1;
    const doorOp = this.lastPlan[front].find((o) => o.kind === 'door');
    const doorC = doorOp ? doorOp.c : dX;
    // a sign board above the door
    this.batch.box(doorC, 2.7, fz + out * (T / 2 + 0.05), 2.4, 0.42, 0.07, 0x2a4a3a);
    this.batch.box(doorC, 2.7, fz + out * (T / 2 + 0.09), 2.0, 0.08, 0.02, 0xc8b88a);
    const room = this._room(inner.x0, inner.z0, inner.x1, inner.z1);
    const midZ = (room.z0 + room.z1) / 2;
    const shelfX = doorC > (x0 + x1) / 2 ? room.x0 + 2.2 : room.x1 - 2.2;
    const shelfLen = Math.min(2.6, room.z1 - room.z0 - 3.4);
    this._freeShelf(shelfX, midZ, 0.6, shelfLen, true);
    room.occ.push({ x0: shelfX - 1.1, x1: shelfX + 1.1, z0: midZ - shelfLen / 2 - 0.8, z1: midZ + shelfLen / 2 + 0.8 });
    this._prop('counter', room, [front === 'n' ? 's' : 'n']);
    this._container('desk', room, 'desk');
    this._container('locker', room, 'locker');
    this._container('fridge', room, 'fridge');
    this._floorLoot(room, 0.5);
    this._markInterior(room, 0.3);
    this.decals.add('graffiti', (x0 + x1) / 2, 1.5, front === 'n' ? z1 + T / 2 : z0 - T / 2, 0, -out, 2, 1, 8);
  }

  _boathouse(p, doorX) {
    const r = this.rng;
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    const W = p.x1 - p.x0, D = p.z1 - p.z0;
    const room = this._room(p.x0 + 0.5, p.z0 + 0.5, p.x1 - 0.5, p.z1 - 0.5);
    this.batch.box(cx, 3.15, cz, W + 0.4, 0.1, D + 0.4, r.pick(TIN), { ao: 1 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + (sx * (W - 0.3)) / 2, pz = cz + (sz * (D - 0.3)) / 2;
      this.batch.box(px, 1.575, pz, 0.16, 3.15, 0.16, 0x3a2e22);
      room.occ.push({ x0: px - 0.4, x1: px + 0.4, z0: pz - 0.4, z1: pz + 0.4 });
    }
    // a flat-bottom boat up on sawhorses, a hole stove in its side
    const side = doorX > cx ? -1 : 1;
    const bxp = cx + side * 1.4;
    for (const sz of [-1.2, 1.2]) {
      this.batch.box(bxp, 0.3, cz + sz, 1.6, 0.06, 0.1, RAIL);
      for (const sx of [-0.7, 0.7]) this.batch.box(bxp + sx, 0.15, cz + sz, 0.06, 0.3, 0.3, RAIL);
    }
    this.batch.box(bxp, 0.56, cz, 1.5, 0.46, 4.2, 0x3a4a3a, { ao: 1, top: 0x1e2620 });
    this.batch.box(bxp, 0.84, cz - 2.05, 1.3, 0.1, 0.12, 0x5a3a2a);
    this.batch.box(bxp + 0.76, 0.6, cz + 0.6, 0.02, 0.3, 0.5, 0x0c0c0a);
    this.world.addBoxC(bxp, 0.45, cz, 1.6, 0.9, 4.3, { occlude: false, kind: 'furniture' });
    // an outboard motor on its stand
    const mx = bxp + side * 1.5;
    this.batch.box(mx, 0.6, cz - 1, 0.35, 1.2, 0.35, 0x1a1a1a);
    this.world.addBoxC(mx, 0.6, cz - 1, 0.4, 1.2, 0.4, { occlude: false, kind: 'junk' });
    room.occ.push({ x0: Math.min(bxp, mx) - 1.2, x1: Math.max(bxp, mx) + 1.2, z0: cz - 2.6, z1: cz + 2.6 });
    this._container('toolbox', room, 'toolbox');
    if (r.chance(0.7)) this._container('crate', room, 'stilt');
    this.world.interiors.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, surface: 'wood' });
    this.map.buildings.push({ x0: p.x0 + 0.3, z0: p.z0 + 0.3, x1: p.x1 - 0.3, z1: p.z1 - 0.3, kind: 'shed' });
    this._markInterior(room, 0.2);
  }

  // The chapel on its plaza, and the Guard's gallows out front.
  _plaza(seg) {
    const W = 22, D = 19;
    const cx = Math.max(seg.x0 + W / 2, Math.min(seg.x1 - W / 2, (seg.x0 + seg.x1) / 2));
    for (const dir of this.rng.shuffle([1, -1])) {
      const z0 = dir > 0 ? seg.z1 : seg.z0 - D;
      const rect = { x0: cx - W / 2, z0, x1: cx + W / 2, z1: z0 + D };
      if (!this._free(rect, 1.2, seg)) continue;
      this._deck(rect.x0, rect.z0, rect.x1, rect.z1, { kind: 'plaza', alongX: true });
      this._chapel(rect, dir, cx);
      return true;
    }
    return false;
  }

  _chapel(rect, dir, cx) {
    const r = this.rng;
    const cw = 7.6, cd = 10;
    const bx0 = cx - cw / 2;
    const bz0 = dir > 0 ? rect.z1 - cd - 0.9 : rect.z0 + 0.9;
    const front = dir > 0 ? 'n' : 's';
    const out = dir > 0 ? -1 : 1; // outward from the chapel's front wall, toward the boardwalk
    const fz = dir > 0 ? bz0 : bz0 + cd;
    const nearZ = dir > 0 ? rect.z0 : rect.z1;
    this.clear = [{ x0: cx - 1.8, x1: cx + 1.8, z0: Math.min(fz, nearZ), z1: Math.max(fz, nearZ) }];
    const win = (c) => ({ c, w: 0.8, kind: 'window', sill: 1.35, top: 2.9 });
    const openings = { w: [win(bz0 + 3), win(bz0 + 7)], e: [win(bz0 + 3), win(bz0 + 7)] };
    openings[front] = [{ c: cx, w: 1.6, kind: 'door' }];
    const inner = this._building({ x0: bx0, z0: bz0, x1: bx0 + cw, z1: bz0 + cd, h: 4.2, wall: 0x9a968a, inner: 0x6a6456, roof: 0x3a3634, floor: DECK_DARK, openings, kind: 'chapel', trim: 0xc8c0b0 });
    // steeple over the door, its bell long gone
    const sz = fz - out * 1.2;
    this.batch.box(cx, 5.5, sz, 2.2, 2.6, 2.2, 0x9a968a);
    this._pyramid(cx, 8.2, sz, 1.75, 2.8, 0x3a3634);
    this.batch.box(cx, 10.05, sz, 0.12, 0.95, 0.12, 0x2a2622);
    this.batch.box(cx, 10.2, sz, 0.55, 0.1, 0.12, 0x2a2622);
    this.batch.box(cx, 5.7, sz + out * 1.11, 0.9, 1.2, 0.03, 0x0a0a0a);
    // pews, the altar, and the ones still kneeling
    const room = this._room(inner.x0, inner.z0, inner.x1, inner.z1);
    const altarZ = dir > 0 ? inner.z1 - 1 : inner.z0 + 1;
    this.batch.box(cx, 0.5, altarZ, 2.2, 1.0, 0.8, 0x5a4232, { top: 0xc8c0b0 });
    this.world.addBoxC(cx, 0.5, altarZ, 2.2, 1.0, 0.8, { occlude: false, kind: 'furniture' });
    this._candles(cx - 0.55, altarZ, 1.0);
    this._candles(cx + 0.55, altarZ, 1.0);
    const backZ = dir > 0 ? inner.z1 - 0.02 : inner.z0 + 0.02;
    this.batch.box(cx, 2.6, backZ, 0.12, 1.6, 0.04, 0x2a2622);
    this.batch.box(cx, 2.95, backZ, 0.8, 0.12, 0.04, 0x2a2622);
    for (let i = 0; i < 4; i++) {
      const pz = fz - out * (T / 2 + 2.3 + i * 1.5);
      for (const side of [-1, 1]) {
        const px = cx + side * 1.95;
        this.batch.box(px, 0.45, pz, 2.4, 0.08, 0.45, 0x4a3626);
        this.batch.box(px, 0.78, pz + out * 0.24, 2.4, 0.6, 0.06, 0x4a3626);
        for (const lx of [-1.1, 1.1]) this.batch.box(px + lx, 0.22, pz, 0.06, 0.44, 0.42, 0x3a2a1e);
        this.world.addBoxC(px, 0.5, pz, 2.4, 1.0, 0.55, { occlude: false, kind: 'furniture' });
        if (r.chance(0.3)) this.candidates.dormant.push({ x: cx + side * 0.4, z: pz });
      }
    }
    // the offering chest beside the altar
    const chest = { ...CONTAINER_SPECS.crate, label: 'Offering Chest', color: 0x4a3426, inner: 0x3a2a1e };
    const items = [rollItem(r, 'crypt', 2), rollItem(r, 'stilt', 2), rollItem(r, 'crypt', 2)];
    this.story.offering = this.loot.addContainer({ kind: 'crate', spec: chest, x: cx + 2.15, z: altarZ, y0: 0, rotY: dir > 0 ? Math.PI : 0, items });
    this.world.addBoxC(cx + 2.15, 0.39, altarZ, 0.95, 0.78, 0.95, { occlude: false, kind: 'furniture' });
    this._markInterior(room, 0);
    const wz = fz + out * (T / 2);
    this.decals.add('guardsign', cx, 2.75, wz, 0, out, 1.3, 0.65, 2);
    this.decals.add('graffiti', bx0 + 1.5, 1.4, wz, 0, out, 1.6, 0.8, 9);
    // the gallows, off to one side of the path to the door
    const side = r.sign();
    const gx = cx + side * 6.6, gz = (nearZ + fz) / 2;
    this.batch.box(gx, 0.5, gz, 4.4, 1.0, 2.2, 0x3a2e22, { top: 0x4a3a2a });
    this.world.addBoxC(gx, 0.5, gz, 4.4, 1.0, 2.2, { occlude: false, kind: 'furniture' });
    for (const sx of [-2, 2]) this.batch.box(gx + sx, 2.9, gz, 0.18, 3.8, 0.18, 0x2e241a);
    this.batch.box(gx, 4.85, gz, 4.4, 0.18, 0.18, 0x2e241a);
    for (let i = 0; i < 3; i++) this._hanged(gx - 1.3 + i * 1.3, gz, 4.76, dir > 0 ? Math.PI : 0);
    this.decals.add('guardsign', gx, 0.5, gz + out * 1.11, 0, out, 1.2, 0.6, 0);
    this._fireBarrel(cx - side * 5.5, gz);
    this._bottleTree(cx - side * 8.5, nearZ - out * 1.2);
    this.candidates.patrol.push({ x: cx, z: gz });
  }

  _pyramid(x, y, z, r, h, hex) {
    const g = Batcher._cache.pyr4 || (Batcher._cache.pyr4 = new THREE.ConeGeometry(1, 1, 4, 1));
    _e.set(0, Math.PI / 4, 0);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(r, h, r));
    this.batch.geo(g, _m, hex, 0.04);
  }

  // Blue bottles on a dead branch, to catch spirits.
  _bottleTree(x, z) {
    const r = this.rng;
    this.batch.cylinder(x, 1.1, z, 0.06, 0.1, 2.2, 0x2e2822, 5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r.range(-0.2, 0.2), y = 1.1 + (i % 4) * 0.28;
      const bx = x + Math.cos(a) * 0.36, bz = z + Math.sin(a) * 0.36;
      this.batch.cylinder((x + bx) / 2, y, (z + bz) / 2, 0.015, 0.015, 0.4, 0x2e2822, 4, { rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 });
      this.batch.cylinder(bx, y + 0.12, bz, 0.035, 0.035, 0.16, r.pick([0x2a4a8a, 0x3a6a9a, 0x2a5a4a]), 6);
    }
    this.world.addBoxC(x, 1, z, 0.5, 2, 0.5, { occlude: false, kind: 'junk' });
  }

  // ---- docks, water, trees ----------------------------------------------------------

  _stiltDock(x, z, dir, insertion) {
    const L = 10;
    const x0 = dir > 0 ? x : x - L, x1 = dir > 0 ? x + L : x;
    this._deck(x0, z - WALK / 2, x1, z + WALK / 2, { kind: 'dock', solid: true });
    // a skiff tied up alongside, a ladder down to it
    const sx = dir > 0 ? x1 - 2.8 : x0 + 2.8, sz = z + WALK / 2 + 1.1;
    this.batch.box(sx, this.waterY + 0.18, sz, 4.6, 0.5, 1.5, 0x3a4a3a, { ao: 1, top: 0x2a2a24 });
    this.batch.box(sx, this.waterY + 0.46, sz, 4.7, 0.1, 1.6, 0x5a3a2a, { ao: 1 });
    this.batch.box(sx + dir * 2.3, this.waterY + 0.7, sz, 0.4, 0.6, 0.4, 0x1a1a1a);
    for (let i = 0; i < 5; i++) this.batch.box(sx, -0.3 * i - 0.15, z + WALK / 2 + 0.06, 0.6, 0.05, 0.05, 0x3a2e22);
    for (const e of [-0.3, 0.3]) this.batch.box(sx + e, -0.7, z + WALK / 2 + 0.06, 0.05, 1.5, 0.05, 0x3a2e22);
    const lx = dir > 0 ? x1 - 0.3 : x0 + 0.3, lz = z - WALK / 2 + 0.3;
    this.batch.box(lx, 1.1, lz, 0.1, 2.2, 0.1, C.wood);
    const center = new THREE.Vector3(dir > 0 ? x1 - 3 : x0 + 3, 0, z);
    this.map.docks.push({ x: center.x, z: center.z, insertion });
    const yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return {
      name: insertion ? 'Your Skiff' : this.rng.pick(['Boudreaux Landing', 'The Bait Pier', 'Old Ferry Stage']),
      center,
      radius: 2.4,
      lantern: new THREE.Vector3(lx, 2.25, lz),
      spawn: new THREE.Vector3(dir > 0 ? x0 + 1.2 : x1 - 1.2, 0, z),
      yaw,
      facing: yaw,
      insertion,
    };
  }

  _swamp() {
    const r = this.rng;
    const wy = this.waterY;
    const onDeck = (x, z, pad) => this.decks.some((q) => x > q.x0 - pad && x < q.x1 + pad && z > q.z0 - pad && z < q.z1 + pad);
    // bald cypress standing in the water: flared trunks, knees, hanging moss
    for (let i = 0; i < 150; i++) {
      const x = r.range(-HALF - 24, HALF + 24), z = r.range(-HALF - 24, HALF + 24);
      if (onDeck(x, z, 3)) continue;
      const h = Math.round(r.range(7, 15));
      const dead = r.chance(0.25);
      this.batch.cylinder(x, wy + h / 2, z, dead ? 0.14 : 0.22, 0.55, h, dead ? 0x2a2622 : 0x3a2e24, 7);
      this.batch.cone(x, wy + 0.5, z, 0.95, 1.2, 0x3a2e24, 6);
      for (let k = 0; k < 3; k++) this.batch.cone(x + r.range(-1.8, 1.8), wy + 0.25, z + r.range(-1.8, 1.8), 0.14, 0.6, 0x3a2e24, 5);
      if (!dead) for (let k = 0; k < 3; k++) this.batch.ico(x + r.range(-1.4, 1.4), wy + h * r.range(0.74, 0.95), z + r.range(-1.4, 1.4), r.range(1.6, 2.6), r.pick([0x1e2a1a, 0x24301c, 0x1a2418]), 0.5);
      for (let k = 0; k < 6; k++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0.6, 2.2), ml = r.range(1.2, 3.2);
        this.batch.box(x + Math.cos(a) * d, wy + h * 0.68 - ml / 2, z + Math.sin(a) * d, 0.16, ml, 0.05, 0x6a7258, { rotY: a, jitter: 0.2, ao: 1 });
      }
      if (Math.abs(x) < HALF && Math.abs(z) < HALF) this.world.addBoxC(x, 3, z, 0.8, 6, 0.8, { occlude: true, collide: false, kind: 'tree' });
    }
    // lily pads, deadfall, drowned cars, half-sunk skiffs
    for (let i = 0; i < 280; i++) {
      const x = r.range(-HALF, HALF), z = r.range(-HALF, HALF);
      if (onDeck(x, z, 0.6)) continue;
      this.batch.ico(x, wy + 0.01, z, r.range(0.2, 0.45), r.pick([0x2a3a1e, 0x34441e, 0x3a3a1a]), 0.04);
    }
    for (let i = 0; i < 20; i++) {
      const x = r.range(-HALF, HALF), z = r.range(-HALF, HALF);
      if (onDeck(x, z, 2.5)) continue;
      const k = r.next();
      if (k < 0.4) this.batch.cylinder(x, wy + 0.1, z, 0.22, 0.3, Math.round(r.range(4, 9)), 0x2a241e, 6, { rz: Math.PI / 2 - 0.08, ry: r.range(0, 3) });
      else if (k < 0.7) this.batch.box(x, wy + 0.15, z, 1.7, 0.4, 2.2, r.pick(C.cars), { rotY: r.range(0, 3), top: 0x2a2a2a });
      else this.batch.box(x, wy + 0.05, z, 1.4, 0.35, 4.2, 0x3a4a3a, { rotY: r.range(0, 3) });
    }
    // the ones the Guard left floating
    for (let i = 0; i < 10; i++) {
      const x = r.range(-HALF, HALF), z = r.range(-HALF, HALF);
      if (onDeck(x, z, 1.5)) continue;
      const a = r.range(0, Math.PI * 2);
      this.batch.box(x, wy + 0.04, z, 0.45, 0.14, 1.5, r.pick([0x3a3226, 0x2e3440, 0x4a4a42]), { rotY: a, jitter: 0.1 });
      this.batch.box(x + Math.sin(a) * 0.9, wy + 0.05, z + Math.cos(a) * 0.9, 0.2, 0.14, 0.22, 0x6a6458, { rotY: a });
    }
  }

  // Beyond the village: a wall of cypress in the fog and a few dead shacks.
  _horizon() {
    const r = this.rng;
    const main = this.batch;
    this.batch = new Batcher();
    const wy = this.waterY;
    for (let i = 0; i < 110; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(92, 170);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (r.chance(0.12)) {
        const w = r.range(4, 7);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.batch.box(x + (sx * w) / 2.4, wy + 1, z + (sz * w) / 2.4, 0.2, 2.2, 0.2, PILING);
        this.batch.box(x, wy + 3, z, w, 2.6, w * 0.8, r.pick(WEATHERED), { rotY: a, ao: 0.5 });
        this.batch.box(x, wy + 4.4, z, w + 0.6, 0.2, w, r.pick(TIN), { rotY: a });
      } else {
        const h = Math.round(r.range(10, 18));
        this.batch.cylinder(x, wy + h / 2, z, 0.3, 0.7, h, 0x241e18, 5);
        this.batch.ico(x, wy + h * 0.85, z, r.range(2.4, 4), r.pick([0x1a2418, 0x1e2a1a]), 0.45);
      }
    }
    this.horizon = this.batch;
    this.batch = main;
  }
}
