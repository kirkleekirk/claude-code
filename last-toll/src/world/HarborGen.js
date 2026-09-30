import * as THREE from 'three';
import { CityGen, C } from './CityGen.js';
import { Batcher } from './Batcher.js';
import { World } from './World.js';
import { rollContainer, rollItem } from '../data/loot.js';
import { CONTAINER_SPECS } from '../game/containers.js';
import { groundTexture } from './Textures.js';

// Port Lafitte: a Gulf harbor the Living Guard took for its supply line, and the
// freighter it anchored off the breakwater.
//
//   north = -z (the open Gulf, and the sunset), south = +z (the town and the road in)
//
// West to east along the shore: a beach with dunes and fishing camps on stilts,
// the marina and boat yard, a long concrete quay with two gantry cranes and the
// container yard behind it, warehouses, the fuel depot and a rock breakwater with
// the lighthouse at its head. The Guard checkpoint holds the road in from the south.
//
// The Covenant rides at anchor a hundred metres out. Her main deck is 6 m above the
// water, with three open holds down to the tank top, a forecastle at the bow and
// the accommodation block and bridge at the stern. The good stuff is in the aft
// hold, behind a cage.
//
// The world here has heights: the beach slopes into the sea, decks and stairs sit
// above the water, and the water is deep enough to swim and dive in.

export const HARBOR_HALF = 170;
export const WY = -1.6;
export const QUAY_Z = -24;

// The freighter. Bow to the west (-x), stern to the east; starboard faces the harbor.
export const SHIP = {
  x0: -60, x1: 50, z0: -127, z1: -107, deck: 4.4, keel: -7.6, hold: -3.6, fc: 6.8, bridge: 16.6,
  holds: [
    { name: 'Hold 1', x0: -44, x1: -24 },
    { name: 'Hold 2', x0: -20, x1: 0 },
    { name: 'Hold 3', x0: 4, x1: 22 },
  ],
  hz0: -123, hz1: -111,
  house: { x0: 30, x1: 44 },
  cz: -117,
};

const HULL = 0x3e454c, HULL_RED = 0x6a2420, DECK_COL = 0x84827a, DECK_DARK = 0x747a6e, RUST = 0x6a4a34;
const TLG_WHITE = 0xd4d1c6, TLG_RED = 0x9a1e18, SAND = 0xd2bf92, SAND_WET = 0x8e7c5c, CONCRETE = 0x9a968c;
const CONT = [0x8a3a2a, 0x2a5a7a, 0x3a6a4a, 0xa0702a, 0x646868, 0x7a2a4a, 0x3d444a, 0x9a8a6a];

export class HarborGen extends CityGen {
  constructor(opts) {
    super(opts);
    this.world = new World(HARBOR_HALF);
    this.world.swim = true;
    this.world.waterY = WY;
    this.world.seabed = seabed;
    this.heist = opts.heist || null;
    this.magnoliaModel = opts.magnoliaModel || null;
    this.map.half = HARBOR_HALF;
    this.map.harbor = true;
    this.map.land = [];
    this.map.ship = SHIP;
    this.climbs = [];
    this.uses = [];
    this.ship = { posts: [], routes: [], holdGuards: [], lights: [] };
    // lights that should read through the haze at night: the ship's, the lighthouse's, the quay's
    this.lamps = new Batcher();
    this.sites = {};
    // doors hang in their frames here, not just holes in the wall
    this.doorLeaves = true;
  }

  _layout() {
    this._groundHarbor();
    this._beach();
    this._marina();
    this._quay();
    this._cranes();
    this._yard();
    this._warehouses();
    this._depot();
    this._breakwater();
    this._town();
    this._covenant();
    if (this.heist && this.heist.approach === 'magnolia') this._magnolia();
    this._seafloor();
    this._docksHarbor();
    this._vista();
  }

  _finish() {
    const out = super._finish();
    if (this.lamps.vcount) {
      const lm = this.lamps.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
      lm.renderOrder = 2;
      out.mesh.add(lm);
    }
    // soldiers who stand on the ship's decks aren't on the ground nav: keep them
    out.ship = this.ship;
    out.climbs = this.climbs;
    out.uses = this.uses;
    out.sites = this.sites;
    out.harbor = true;
    return out;
  }

  // ---- helpers -----------------------------------------------------------------------

  // A slab whose top is at y, walkable.
  _slab(x0, z0, x1, z1, y, col, surface = 'ground', thick = 0.3, opts = {}) {
    this.batch.box((x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2, x1 - x0, thick, z1 - z0, col, { jitter: opts.jitter ?? 0.03, ao: 1, top: opts.top });
    return this.world.addFloor(x0, z0, x1, z1, surface, y);
  }

  // A rail along a line at deck height y; solid to the touch.
  _rail(x0, z0, x1, z1, y, col = 0x8a8a84, h = 1.05) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.batch.box(cx, y + h, cz, alongX ? len : 0.06, 0.06, alongX ? 0.06 : len, col, { jitter: 0.04 });
    this.batch.box(cx, y + h * 0.5, cz, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, col, { jitter: 0.04 });
    for (let s = 0; s <= len + 0.01; s += 1.6) {
      const px = alongX ? Math.min(x0, x1) + s : cx, pz = alongX ? cz : Math.min(z0, z1) + s;
      this.batch.box(px, y + h / 2, pz, 0.06, h, 0.06, col, { jitter: 0.04 });
    }
    this.world.addBox(alongX ? Math.min(x0, x1) : cx - 0.08, y, alongX ? cz - 0.08 : Math.min(z0, z1), alongX ? Math.max(x0, x1) : cx + 0.08, y + h + 0.05, alongX ? cz + 0.08 : Math.max(z0, z1), { occlude: false, kind: 'rail' });
  }

  // Stairs: a ramp from yLo at the low end to yHi at the high end. axis 'x' or 'z';
  // dir +1 means it climbs toward +axis. Rails on both long sides except the bottom
  // metre, and a block under the low part so nobody walks into its underside.
  _stairs(x0, z0, x1, z1, axis, dir, yLo, yHi, base, col = 0x5a5a56, opts = {}) {
    const ramp = dir > 0 ? { axis, y0: yLo, y1: yHi } : { axis, y0: yHi, y1: yLo };
    this.world.addFloor(x0, z0, x1, z1, 'metal', 0, ramp);
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const n = Math.max(2, Math.round(len / 0.3));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const y = yLo + (yHi - yLo) * (dir > 0 ? k : 1 - k);
      const a = (axis === 'x' ? x0 : z0) + k * len;
      if (axis === 'x') this.batch.box(a, y - 0.06, (z0 + z1) / 2, len / n + 0.02, 0.1, z1 - z0, col, { jitter: 0.05, ao: 1 });
      else this.batch.box((x0 + x1) / 2, y - 0.06, a, x1 - x0, 0.1, len / n + 0.02, col, { jitter: 0.05, ao: 1 });
    }
    // stringers and rails
    const segs = 8;
    for (const side of [0, 1]) {
      for (let i = 0; i < segs; i++) {
        const k0 = i / segs, k1 = (i + 1) / segs;
        const ya = yLo + (yHi - yLo) * (dir > 0 ? k0 : 1 - k1), yb = yLo + (yHi - yLo) * (dir > 0 ? k1 : 1 - k0);
        const a0 = (axis === 'x' ? x0 : z0) + k0 * len, a1 = (axis === 'x' ? x0 : z0) + k1 * len;
        const lowEnd = dir > 0 ? i === 0 : i === segs - 1;
        const c = axis === 'x' ? (side ? z1 : z0) : (side ? x1 : x0);
        const ym = (ya + yb) / 2;
        if (axis === 'x') {
          this.batch.box((a0 + a1) / 2, ym - 0.25, c, a1 - a0 + 0.05, 0.3, 0.08, col);
          if (opts.rails === false) continue;
          this.batch.box((a0 + a1) / 2, ym + 1.0, c, a1 - a0 + 0.05, 0.06, 0.06, 0x8a8a84);
          this.batch.box(a0, ym + 0.5, c, 0.05, 1.0, 0.05, 0x8a8a84);
          if (!lowEnd) this.world.addBox(a0, Math.min(ya, yb) - 0.6, c - 0.07, a1, Math.max(ya, yb) + 1.05, c + 0.07, { occlude: false, kind: 'rail' });
        } else {
          this.batch.box(c, ym - 0.25, (a0 + a1) / 2, 0.08, 0.3, a1 - a0 + 0.05, col);
          if (opts.rails === false) continue;
          this.batch.box(c, ym + 1.0, (a0 + a1) / 2, 0.06, 0.06, a1 - a0 + 0.05, 0x8a8a84);
          this.batch.box(c, ym + 0.5, a0, 0.05, 1.0, 0.05, 0x8a8a84);
          if (!lowEnd) this.world.addBox(c - 0.07, Math.min(ya, yb) - 0.6, a0, c + 0.07, Math.max(ya, yb) + 1.05, a1, { occlude: false, kind: 'rail' });
        }
      }
    }
    // under the low part, where the stairs are below head height
    if (base !== null && base !== undefined) {
      const clear = 2.0;
      for (let i = 0; i < segs; i++) {
        const k0 = i / segs, k1 = (i + 1) / segs;
        const yTop = yLo + (yHi - yLo) * (dir > 0 ? k0 : 1 - k1);
        if (yTop - base > clear) continue;
        if (yTop - base < 0.3) continue;
        const a0 = (axis === 'x' ? x0 : z0) + k0 * len, a1 = (axis === 'x' ? x0 : z0) + k1 * len;
        if (axis === 'x') this.world.addBox(a0, base, z0 + 0.05, a1, yTop - 0.4, z1 - 0.05, { occlude: false, kind: 'stairs' });
        else this.world.addBox(x0 + 0.05, base, a0, x1 - 0.05, yTop - 0.4, a1, { occlude: false, kind: 'stairs' });
      }
    }
  }

  // A wall with real doorways: a frame round each opening and the door itself swung
  // back flat against the wall, so nothing is a painted hole you walk through.
  //   axis 'x' runs along x at z = fixed; 'z' runs along z at x = fixed.
  //   doors: [{ c, w, h, out, hinge }]: out is the face the open leaf lies on (+1/-1,
  //   0 for an open doorway with no door), hinge the jamb it hangs from (-1/+1).
  //   opts.band: a window band { y0, y1, glass } (heights above y0) between the doors.
  _doorWall(axis, fixed, a0, a1, y0, h, t, col, doors = [], opts = {}) {
    const b = this.batch, W = this.world;
    const occlude = opts.occlude ?? true;
    const box = (s, e, ya, yb, { off = 0, th = t, c = col, collide = true, occ = occlude } = {}) => {
      if (e - s < 0.02 || yb - ya < 0.02) return;
      const m = (s + e) / 2, L = e - s, cy = (ya + yb) / 2, H = yb - ya;
      if (axis === 'x') b.box(m, cy, fixed + off, L, H, th, c, { jitter: 0.03 });
      else b.box(fixed + off, cy, m, th, H, L, c, { jitter: 0.03 });
      if (!collide) return;
      if (axis === 'x') W.addBox(s, ya, fixed + off - th / 2, e, yb, fixed + off + th / 2, { occlude: occ, kind: 'wall' });
      else W.addBox(fixed + off - th / 2, ya, s, fixed + off + th / 2, yb, e, { occlude: occ, kind: 'wall' });
    };
    const solid = (s, e) => {
      const g = opts.band;
      if (!g) { box(s, e, y0, y0 + h); return; }
      box(s, e, y0, y0 + g.y0);
      box(s, e, y0 + g.y1, y0 + h);
      if (e - s < 0.05) return;
      // open panes between mullions: you can see out, but not climb out
      if (axis === 'x') W.addBox(s, y0 + g.y0, fixed - t / 2, e, y0 + g.y1, fixed + t / 2, { occlude: false, kind: 'wall' });
      else W.addBox(fixed - t / 2, y0 + g.y0, s, fixed + t / 2, y0 + g.y1, e, { occlude: false, kind: 'wall' });
      const n = Math.max(1, Math.round((e - s) / 1.1));
      for (let k = 0; k <= n; k++) {
        const a = s + ((e - s) * k) / n;
        box(Math.max(s, a - 0.04), Math.min(e, a + 0.04), y0 + g.y0, y0 + g.y1, { th: t * 0.6, c: g.frame ?? 0x3a3e42, collide: false });
      }
      box(s, e, y0 + g.y0 - 0.02, y0 + g.y0 + 0.04, { th: t + 0.08, c: g.frame ?? 0x3a3e42, collide: false });
    };
    const fr = 0.08, fcol = opts.frame ?? 0x3a3e42;
    let cur = a0;
    for (const d of doors.slice().sort((p, q) => p.c - q.c)) {
      const dh = d.h ?? 2.05;
      const s = d.c - d.w / 2, e = d.c + d.w / 2;
      solid(cur, s - fr);
      // the frame: two jambs and a head, standing a little proud of the wall
      box(s - fr, s, y0, y0 + dh, { th: t + 0.05, c: fcol, occ: false });
      box(e, e + fr, y0, y0 + dh, { th: t + 0.05, c: fcol, occ: false });
      box(s - fr, e + fr, y0 + dh, y0 + dh + fr, { th: t + 0.05, c: fcol, collide: false });
      box(s - fr, e + fr, y0 + dh + fr, y0 + h);
      // a low sill to step over
      if (opts.sill) box(s, e, y0, y0 + opts.sill, { th: t + 0.03, c: fcol, collide: false });
      if (d.out) {
        const lw = d.w - 0.04, off = d.out * (t / 2 + 0.06);
        const ls = d.hinge > 0 ? e + fr + 0.02 : s - fr - 0.02 - lw;
        box(ls, ls + lw, y0 + 0.03, y0 + dh - 0.04, { off, th: 0.05, c: opts.leaf ?? col, occ: false });
        // its handle and, on a ship, the dogs that clamp it shut
        const hx = d.hinge > 0 ? ls + lw - 0.12 : ls + 0.12;
        box(hx - 0.03, hx + 0.03, y0 + 1.0, y0 + 1.14, { off: off + d.out * 0.04, th: 0.05, c: 0x2a2a2a, collide: false });
        if (opts.dogs) for (const yy of [0.35, 1.7]) box(hx - 0.04, hx + 0.04, y0 + yy, y0 + yy + 0.08, { off: off + d.out * 0.035, th: 0.04, c: 0x2a2a2a, collide: false });
      }
      cur = e + fr;
    }
    solid(cur, a1);
  }

  // Something to climb: a ladder, a rope, an anchor chain. from/to are the foot and the
  // head; off is where you step off at the top; label names it in the prompt.
  _climb(from, to, off, label, opts = {}) {
    const c = { from: new THREE.Vector3(from.x, from.y, from.z), to: new THREE.Vector3(to.x, to.y, to.z), off: new THREE.Vector3(off.x, off.y, off.z), label, ...opts };
    // where you stand (or tread water) to start up, and where you stand to go down
    c.base = opts.base ? new THREE.Vector3(opts.base.x, opts.base.y, opts.base.z) : c.from.clone();
    // a foot in the water: you tread water there, and you climb down into it
    c.water = Math.abs(c.base.y - (WY - 1.3)) < 0.05;
    this.climbs.push(c);
    if (opts.rungs !== false) {
      const len = c.from.distanceTo(c.to);
      const n = Math.floor(len / 0.32);
      const d = c.to.clone().sub(c.from);
      const side = new THREE.Vector3(-(c.off.z - c.to.z), 0, c.off.x - c.to.x).normalize().multiplyScalar(0.22);
      const col = opts.color ?? 0x7a7a74;
      for (let i = 1; i < n; i++) {
        const p = c.from.clone().addScaledVector(d, i / n);
        this.batch.box(p.x, p.y, p.z, Math.abs(side.x) * 2 + 0.04, 0.035, Math.abs(side.z) * 2 + 0.04, col, { jitter: 0.05 });
      }
      for (const s of [-1, 1]) {
        const a = c.from.clone().addScaledVector(side, s), b = c.to.clone().addScaledVector(side, s);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const L = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(0.025, 0.025, L, 5);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        m.compose(mid, q, new THREE.Vector3(1, 1, 1));
        this.batch.geo(g, m, col, 0.04);
      }
    }
    return c;
  }

  // A crate container at a height.
  _crateY(x, y, z, kind, rotY = 0, table = null, items = null, label = undefined) {
    const spec = CONTAINER_SPECS[kind];
    const ex = Math.abs(Math.sin(rotY)) > 0.5;
    this.world.addBoxC(x, y + spec.h / 2, z, ex ? spec.d : spec.w, spec.h, ex ? spec.w : spec.d, { occlude: false, kind: 'furniture' });
    const t = table || ({ military: 'military', locker: 'locker', guardlocker: 'guard', crypt: 'crypt' }[kind] || 'crate');
    return this.loot.addContainer({ kind, spec, x, z, y0: y, rotY, items: items || rollContainer(this.rng, t, this.zone.lootTier), label });
  }

  // A box stretched between two points (crane jibs, stays, braces).
  _beam(a, b2, w, h, col) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b2);
    const len = A.distanceTo(B);
    const g = new THREE.BoxGeometry(w, len, h);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.batch.geo(g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), col, 0.04);
  }

  // Painted words on a plane (a ship's name, a sign).
  _lettering(text, x, y, z, rotY, w, color = '#e8e4d8', bg = null) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 160;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = color;
    let px = 120;
    g.font = `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    while (g.measureText(text).width > c.width - 40 && px > 30) {
      px -= 6;
      g.font = `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 6);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * c.height) / c.width), new THREE.MeshLambertMaterial({ map: tex, transparent: !bg, depthWrite: !!bg }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    this.scene.add(m);
    return m;
  }

  _palm(x, z, y = 0) {
    const r = this.rng;
    const h = r.range(6, 10);
    const lean = r.range(-0.25, 0.25);
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      this.batch.cylinder(x + lean * h * k, y + h * (k + 1 / 12), z + lean * 0.5 * h * k, 0.16, 0.2, h / 6 + 0.05, 0x6a5a44, 6);
    }
    const tx = x + lean * h, tz = z + lean * 0.5 * h;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r.range(-0.2, 0.2);
      this.batch.box(tx + Math.cos(a) * 1.3, y + h - 0.2, tz + Math.sin(a) * 1.3, 2.8, 0.05, 0.5, r.pick([0x3a4a22, 0x4a5a2a, 0x445226]), { rotY: -a, jitter: 0.1 });
    }
    this.world.addBoxC(x, y + 1.5, z, 0.45, 3, 0.45, { occlude: false, kind: 'pole' });
  }

  // ---- ground -------------------------------------------------------------------------------

  _groundHarbor() {
    const H = HARBOR_HALF - 2;
    // the land south of the shore
    const tex = groundTexture();
    tex.repeat.set(40, 24);
    const g = new THREE.PlaneGeometry(H * 2, H + 10).rotateX(-Math.PI / 2).translate(0, 0, (H - 10) / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, color: 0xb0ab98 }));
    m.receiveShadow = true;
    this.scene.add(m);
    this.world.addFloor(-H, -10, H, H, 'ground', 0);
    this.map.land.push({ x0: -H, z0: -10, x1: H, z1: H, col: '#2e2f28' });
    // the invisible edge of the world, out in the water and along the land's edge
    const E = HARBOR_HALF - 1;
    this.world.addBox(-E - 1, -30, -E - 1, E + 1, 30, -E, { occlude: false });
    this.world.addBox(-E - 1, -30, E, E + 1, 30, E + 1, { occlude: false });
    this.world.addBox(-E - 1, -30, -E, -E, 30, E, { occlude: false });
    this.world.addBox(E, -30, -E, E + 1, 30, E, { occlude: false });
  }

  // The beach: a long sand slope into the Gulf, dunes with crossovers, camps on stilts.
  _beach() {
    const r = this.rng, x0 = -HARBOR_HALF + 2, x1 = -40;
    // the sand, sloping from the dune line (y 0) into the sea
    const zTop = -10, zBot = -64, yBot = -4.4;
    const seg = 24;
    const pos = [], idx = [], col = [];
    const cols = 40;
    const c1 = new THREE.Color(SAND), c2 = new THREE.Color(SAND_WET), c3 = new THREE.Color(0x3e4a3e);
    for (let j = 0; j <= seg; j++) {
      const k = j / seg;
      const z = zTop + (zBot - zTop) * k;
      const y = yBot * k;
      for (let i = 0; i <= cols; i++) {
        const x = x0 + ((x1 - x0) * i) / cols;
        pos.push(x, y + (j > 0 && j < seg ? (Math.sin(x * 0.3 + j) * 0.03) : 0), z);
        const wet = THREE.MathUtils.smoothstep(y, WY + 0.6, WY - 0.2);
        const deep = THREE.MathUtils.smoothstep(y, WY - 0.5, WY - 2.5);
        const c = c1.clone().lerp(c2, wet).lerp(c3, deep);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    const sand = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    sand.receiveShadow = true;
    this.scene.add(sand);
    this.world.addFloor(x0, zBot, x1, zTop, 'sand', 0, { axis: 'z', y0: yBot, y1: 0 });
    this.map.land.push({ x0, z0: -30, x1, z1: zTop, col: '#6e6450' });
    // a dry sand strip above the dunes
    this.batch.box((x0 + x1) / 2, 0.012, 0, x1 - x0, 0.02, 20, SAND, { jitter: 0.04 });
    // wrack line and shells
    for (let i = 0; i < 90; i++) {
      const x = r.range(x0 + 2, x1 - 2), z = r.range(-30, -24);
      const y = (yBot * (zTop - z)) / (zTop - zBot);
      this.batch.box(x, y + 0.02, z, r.range(0.3, 1.4), 0.04, r.range(0.1, 0.3), r.pick([0x3a3a24, 0x4a4630, 0x2e3222]), { rotY: r.range(-0.3, 0.3) });
    }
    // dunes with sea oats, broken by boardwalk crossovers every so often
    const gaps = [];
    for (let x = x0 + 18; x < x1 - 8; x += r.range(26, 34)) gaps.push(x);
    for (let x = x0 + 2; x < x1 - 2; x += 3.2) {
      if (gaps.some((g2) => Math.abs(g2 - x) < 3)) continue;
      const h = r.range(0.8, 1.6);
      this.batch.ico(x, 0.1, r.range(-4, 1), r.range(2.2, 3.2), r.pick([0xa8966c, 0xb09c70, 0x9e8c64]), h / 3);
      for (let k = 0; k < 5; k++) this.batch.box(x + r.range(-2, 2), h * 0.5 + 0.3, r.range(-5, 2), 0.05, r.range(0.6, 1.2), 0.05, r.pick([0x8a8a4a, 0x9a9458, 0x7a7a42]), { rotY: r.range(0, 3) });
    }
    for (let x = x0 + 2; x < x1 - 2; x += 3.2) {
      if (gaps.some((g2) => Math.abs(g2 - x) < 3)) continue;
      this.world.addBox(x - 1.7, 0, -4.5, x + 1.7, 1.2, 1.5, { occlude: false, kind: 'dune' });
    }
    for (const g2 of gaps) {
      // the crossover: planks and a pair of rails
      for (let z = -9; z < 6; z += 0.5) this.batch.box(g2, 0.1, z, 2.2, 0.06, 0.45, 0x8a7458, { jitter: 0.1 });
      for (const s of [-1, 1]) this.batch.box(g2 + s * 1.15, 0.6, -1.5, 0.06, 0.06, 15, 0x6a5a48);
      this.candidates.street.push({ x: g2, z: 10 });
    }
    // sand fences
    for (let x = x0 + 5; x < x1 - 5; x += 1.2) if (!gaps.some((g2) => Math.abs(g2 - x) < 3)) this.batch.box(x, 0.5, 3.5, 0.06, 1.0, 0.03, 0x6a5a48, { rotY: r.range(-0.1, 0.1) });
    // a lifeguard stand, a beached boat, umbrellas nobody closed
    const lx = x0 + 60;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.batch.box(lx + dx * 1.1, 1.3, -18 + dz * 1.1, 0.12, 2.6, 0.12, 0xd8d4c8);
    this.batch.box(lx, 2.7, -18, 2.6, 0.12, 2.6, 0xd8d4c8);
    this.batch.box(lx, 3.4, -18.9, 2.6, 1.3, 0.08, 0xc84a2a);
    this.batch.box(lx, 4.1, -18, 3.0, 0.1, 3.0, 0xc84a2a, { rotY: 0.02 });
    this.world.addBoxC(lx, 1.3, -18, 2.6, 2.6, 2.6, { occlude: false, kind: 'pole' });
    this.batch.box(x0 + 35, -0.35, -26, 2.0, 0.7, 5.5, 0x5a6a7a, { rotY: 0.6, top: 0x3a3a34 });
    this.world.addBoxC(x0 + 35, 0, -26, 4, 1.2, 4, { occlude: false, kind: 'junk' });
    for (let i = 0; i < 6; i++) {
      const ux = r.range(x0 + 10, x1 - 10), uz = r.range(-20, -12);
      const uy = (yBot * (zTop - uz)) / (zTop - zBot);
      this.batch.cylinder(ux, uy + 1.1, uz, 0.03, 0.03, 2.2, 0xcfcbbf, 5);
      this.batch.cone(ux, uy + 2.2, uz, 1.3, 0.5, r.pick([0xc84a2a, 0x2a6a9a, 0xd8b43a, 0xd8d4c8]), 8);
    }
    // fishing camps on stilts: stairs up to a porch, one room inside
    const camps = [x0 + 28, x0 + 70, x0 + 96].filter((x) => x < x1 - 10); // (the last clear of the dive shop)
    for (const cx of camps) this._camp(cx, r.range(18, 30));
    // the beach road with a few dead cars
    this.batch.box((x0 + x1) / 2, 0.01, 44, x1 - x0, 0.015, 8, C.asphalt, { jitter: 0 });
    this.map.roads.push({ x0, z0: 40, x1, z1: 48 });
    for (let i = 0; i < 4; i++) this._car(r.range(x0 + 10, x1 - 10), 44 + r.range(-2, 2), r.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, r.chance(0.3));
    for (let i = 0; i < 14; i++) this._palm(r.range(x0 + 4, x1 - 4), r.range(8, 60));
    for (let i = 0; i < 18; i++) this.candidates.street.push({ x: r.range(x0 + 6, x1 - 6), z: r.range(8, 58) });
    for (let i = 0; i < 6; i++) this.candidates.street.push({ x: r.range(x0 + 6, x1 - 6), z: r.range(-20, -12) });
    // the dive shop at the east end of the beach, by the marina
    this._diveShop(-58, 16);
    this.sites.beach = new THREE.Vector3(x0 + 40, 0, -20);
  }

  // A fishing camp: a house on stilts, stairs up to a porch, one room with loot.
  _camp(cx, cz) {
    const r = this.rng, y = 3.2, w = 8, d = 7;
    const x0 = cx - w / 2, z0 = cz - d / 2, x1 = cx + w / 2, z1 = cz + d / 2;
    const wall = r.pick([0x6f9088, 0xb09a5c, 0x857599, 0x6886a2, 0xbab2a2]);
    for (let px = x0; px <= x1 + 0.01; px += w / 3) for (const pz of [z0 - 2.1, z0, z0 + d / 2, z1]) {
      this.batch.box(px, y / 2, pz, 0.25, y, 0.25, 0x5a4a38);
      this.world.addBoxC(px, y / 2, pz, 0.3, y, 0.3, { occlude: false, kind: 'pole' });
    }
    // floor, porch toward the sea (north)
    this._slab(x0, z0 - 2.2, x1, z1, y, 0x6a5238, 'wood', 0.25);
    this._rail(x0, z0 - 2.2, x1, z0 - 2.2, y);
    this._rail(x0, z0 - 2.2, x0, z0, y);
    // stairs down the east side to the sand
    this._stairs(x1 + 0.1, z0 - 2.2, x1 + 1.5, z0 + 5.5, 'z', 1, y, 0, 0);
    this._rail(x1 + 0.1, z0 - 2.2, x1 + 1.5, z0 - 2.2, y);
    // walls with a door on the porch and windows
    const T2 = 0.14, h = 2.6, TRIM = 0xe2dccb;
    const leafCol = r.pick([0x3a5a6a, 0x8a3a2a, 0x2a4a3a, 0xd0c8b4, 0x5a4a6a]);
    // openings: [from, to, 'door' | 'win', inward (+1/-1, which side is the room)]
    const wallBox = (a0, a1, fixed, axis, gaps2, inward) => {
      const seg = (s0, e0, y0, y1, { col = wall, th = T2, solid = true, off = 0 } = {}) => {
        if (e0 - s0 < 0.02 || y1 - y0 < 0.02) return;
        const c = (s0 + e0) / 2, L = e0 - s0, cy = y + (y0 + y1) / 2, H = y1 - y0;
        const px = axis === 'x' ? c : fixed + off, pz = axis === 'x' ? fixed + off : c;
        const sx = axis === 'x' ? L : th, sz = axis === 'x' ? th : L;
        if (solid) this._solid(px, cy, pz, sx, H, sz, col, { ao: 1 });
        else this.batch.box(px, cy, pz, sx, H, sz, col);
      };
      let cur = a0;
      // in order along the wall, whatever order they were listed in
      for (const [g0, g1, kind] of gaps2.slice().sort((p, q) => p[0] - q[0]).concat([[a1, a1, 'end']])) {
        seg(cur, g0, 0, h);
        const tr = { col: TRIM, th: T2 + 0.04, solid: false };
        if (kind === 'win') {
          seg(g0, g1, 0, 0.9);
          seg(g0, g1, h - 0.6, h);
          seg(g0 - 0.06, g0, 0.84, h - 0.54, tr);
          seg(g1, g1 + 0.06, 0.84, h - 0.54, tr);
          seg(g0 - 0.06, g1 + 0.06, 0.84, 0.9, { ...tr, th: T2 + 0.1 });
          seg(g0 - 0.06, g1 + 0.06, h - 0.6, h - 0.54, tr);
        } else if (kind === 'door') {
          const dh = h - 0.5;
          seg(g0, g1, dh, h);
          seg(g0 - 0.07, g0, 0, dh, tr);
          seg(g1, g1 + 0.07, 0, dh, tr);
          seg(g0 - 0.07, g1 + 0.07, dh, dh + 0.07, tr);
          // the door, standing open into the room against its hinge jamb
          const lw = g1 - g0 - 0.06, hx2 = g1 - 0.05;
          if (axis === 'x') {
            const z2 = fixed + inward * (T2 / 2 + lw / 2 + 0.02);
            this._solid(hx2, y + dh / 2 - 0.02, z2, 0.045, dh - 0.06, lw, leafCol, { ao: 1 });
            this.batch.box(hx2 - 0.04, y + 1.0, fixed + inward * (T2 / 2 + lw - 0.1), 0.04, 0.06, 0.06, 0x2a2a2a);
          } else {
            const x2 = fixed + inward * (T2 / 2 + lw / 2 + 0.02);
            this._solid(x2, y + dh / 2 - 0.02, hx2, lw, dh - 0.06, 0.045, leafCol, { ao: 1 });
          }
        }
        cur = Math.max(cur, g1);
      }
    };
    wallBox(x0, x1, z0, 'x', [[cx - 0.6, cx + 0.6, 'door'], [x0 + 1.2, x0 + 2.6, 'win'], [x1 - 2.6, x1 - 1.2, 'win']], 1);
    wallBox(x0, x1, z1, 'x', [[cx - 0.8, cx + 0.8, 'win']], -1);
    wallBox(z0, z1, x0, 'z', [[cz - 0.7, cz + 0.7, 'win']], 1);
    wallBox(z0, z1, x1, 'z', [[cz - 0.7, cz + 0.7, 'win']], -1);
    // a lamp by the door and a doormat
    this.lamps.box(cx + 0.95, y + 2.25, z0 - 0.12, 0.14, 0.2, 0.1, 0xffd8a0, { jitter: 0 });
    this.batch.box(cx, y + 0.012, z0 - 0.55, 0.9, 0.02, 0.55, 0x6a4a34);
    // a low tin roof on the walls, a ridge beam, and a boarded ceiling inside
    this.batch.box(cx, y + h + 0.08, cz, w + 1.2, 0.12, d + 1.0, r.pick([0x5a5048, 0x6a4a36, 0x3e4240]), { rotY: 0 });
    this.batch.box(cx, y + h + 0.3, cz, 0.3, 0.32, d + 1.0, 0x4a4038);
    this.batch.box(cx, y + h - 0.03, cz, w - T2 - 0.02, 0.06, d - T2 - 0.02, 0xc8b89a, { jitter: 0.04 });
    this.world.addBox(x0 - 0.5, y + h, z0 - 0.5, x1 + 0.5, y + h + 1, z1 + 0.5, { collide: false });
    this.world.interiors.push({ x0, z0, x1, z1, surface: 'wood' });
    this.map.buildings.push({ x0, z0, x1, z1, kind: 'house' });
    // inside: a bunk, a table, a locker and a cabinet
    this._crateY(x0 + 0.6, y, z1 - 0.5, 'dresser', Math.PI, 'dresser');
    this._crateY(x1 - 0.5, y, z1 - 0.5, 'locker', Math.PI, 'stilt');
    this._crateY(x0 + 0.4, y, cz, 'kitchen', Math.PI / 2, 'kitchen');
    this.batch.box(x1 - 1.2, y + 0.3, z0 + 1.4, 1.4, 0.6, 2.0, C.wood);
    this.world.addBoxC(x1 - 1.2, y + 0.3, z0 + 1.4, 1.4, 0.6, 2.0, { occlude: false, kind: 'furniture' });
    if (r.chance(0.7)) this.loot.spawnItem(rollItem(r, 'floor', this.zone.lootTier), new THREE.Vector3(cx + 0.5, y + 0.08, cz - 0.5), r.range(0, 6));
    this.candidates.interior.push({ x: cx, z: cz });
    (this.sites.camps ||= []).push(new THREE.Vector3(cx, y, cz));
  }

  _diveShop(cx, cz) {
    const r = this.rng;
    const w = 12, d = 9;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const inner = this._building({
      x0, z0, x1, z1, h: 3.4, wall: 0x3a7a8a, inner: 0xa8b0a8, roof: 0x3e4242, floor: 0x5a5a52, trim: 0xe0d8c0,
      openings: { n: [{ c: cx - 2, w: 1.4, kind: 'door' }, { c: cx + 3, w: 2.4, kind: 'window', sill: 0.9, top: 2.3 }], s: [{ c: cx + 3, w: 1.1, kind: 'door' }], e: [{ c: cz, w: 1.6, kind: 'window', sill: 1.0, top: 2.2 }], w: [] },
      partitions: [], kind: 'shop', surface: 'wood',
    });
    // a painted sign over the door: a diver flag
    this.batch.box(cx - 2, 3.7, z0 - 0.2, 3.0, 0.8, 0.08, 0xc8201a);
    this.batch.box(cx - 2, 3.7, z0 - 0.25, 3.0, 0.14, 0.02, 0xf0f0f0, { rotY: 0.26 });
    const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'shop');
    // tanks on a rack, wetsuits on hangers
    for (let i = 0; i < 6; i++) this.batch.cylinder(x0 + 1 + i * 0.4, 0.7, z1 - 0.5, 0.1, 0.1, 1.2, r.pick([0xd8b43a, 0xc8c4b8, 0x2a2a2a]), 8);
    for (let i = 0; i < 5; i++) this.batch.box(x1 - 0.5, 1.4, z0 + 1.5 + i * 0.5, 0.1, 1.3, 0.45, 0x1a1a1e);
    this.world.addBoxC(x0 + 2.0, 0.7, z1 - 0.5, 2.6, 1.4, 0.5, { occlude: false, kind: 'furniture' });
    rm.occ.push({ x0: x0, z0: z1 - 1, x1: x0 + 3.5, z1 });
    const locker = this._container('locker', rm, 'locker', ['w', 's'], 'Dive Locker');
    this.sites.diveLocker = locker && locker.c;
    this._container('desk', rm, 'desk', ['e', 'w']);
    this._container('toolbox', rm, 'toolbox', ['e', 'w', 's']);
    this._floorLoot(rm, 0.5);
    this._markInterior(rm, 0.3);
    this.sites.diveShop = new THREE.Vector3(cx, 0, cz);
  }

  // ---- the marina and boat yard ----------------------------------------------------------

  _marina() {
    const r = this.rng;
    const dy = WY + 0.7; // floating dock deck
    const mx = -22;
    // the gangway down from the quay, and the main float out to the end
    this._stairs(mx - 1.2, QUAY_Z - 4, mx + 1.2, QUAY_Z + 0.2, 'z', 1, dy, 0, null, 0x6a6a64);
    this._slab(mx - 1.3, -70, mx + 1.3, QUAY_Z - 4, dy, 0x8a7a62, 'wood', 0.35);
    this.map.roads.push({ x0: mx - 1.3, z0: -70, x1: mx + 1.3, z1: QUAY_Z });
    for (let z = -70; z < QUAY_Z - 4; z += 4) {
      this.batch.box(mx - 1.4, dy - 0.3, z + 2, 0.2, 0.4, 4.0, 0xd8d4c8, { jitter: 0.05 });
      this.batch.box(mx + 1.4, dy - 0.3, z + 2, 0.2, 0.4, 4.0, 0xd8d4c8, { jitter: 0.05 });
    }
    // fingers and boats in the slips
    const boats = [];
    for (let z = -66; z < -30; z += 8) {
      for (const s of [-1, 1]) {
        const fx0 = s < 0 ? mx - 9.3 : mx + 1.3, fx1 = s < 0 ? mx - 1.3 : mx + 9.3;
        this._slab(fx0, z - 0.6, fx1, z + 0.6, dy, 0x8a7a62, 'wood', 0.3);
        this.map.roads.push({ x0: fx0, z0: z - 0.6, x1: fx1, z1: z + 0.6 });
        // a boat in the slip on the far side of the finger, or a gap where one sank
        if (r.chance(0.7)) boats.push({ x: (fx0 + fx1) / 2, z: z + 3.2, big: r.chance(0.3) });
        for (const px of [fx0, fx1]) this.batch.cylinder(px, dy - 0.2, z, 0.15, 0.15, 2.4, 0x3a3228, 6);
      }
    }
    for (const b of boats) this._pleasureBoat(b.x, b.z, b.big);
    // the end of the float: where a fast boat would wait
    this.sites.speedDock = new THREE.Vector3(mx, WY, -75.5);
    this.sites.marinaEnd = new THREE.Vector3(mx, dy, -69);
    // a stub of float at the very end where the fast boat ties up
    this._slab(mx - 1.3, -71.2, mx + 1.3, -70, dy, 0x8a7a62, 'wood', 0.35);
    // ladders out of the water at the float's end
    this._climb({ x: mx + 1.35, y: WY - 1.3, z: -68 }, { x: mx + 1.35, y: dy + 0.1, z: -68 }, { x: mx, y: dy, z: -68 }, 'the float', { base: { x: mx + 2.2, y: WY - 1.3, z: -68 } });
    for (let i = 0; i < 4; i++) this.candidates.street.push({ x: mx, z: r.range(-60, -30) });
    // the boat yard behind: boats up on stands, a travel lift, a shed
    const yx0 = -40, yx1 = -8, yz0 = 12, yz1 = 36;
    this.batch.box((yx0 + yx1) / 2, 0.01, (yz0 + yz1) / 2, yx1 - yx0, 0.015, yz1 - yz0, 0x4a4a46, { jitter: 0.02 });
    for (let i = 0; i < 4; i++) {
      const bx = yx0 + 4 + i * 7, bz = yz0 + 6 + (i % 2) * 7;
      const L = r.range(7, 10), W2 = r.range(2.4, 3.0);
      this.batch.box(bx, 1.8, bz, W2, 1.6, L, r.pick([0xd8d4c8, 0x2a4a6a, 0x8a2a24]), { ao: 1, top: 0xc8c4b8 });
      this.batch.box(bx, 0.9, bz, 0.6, 1.8, L * 0.8, 0x6a4a34);
      for (const s of [-1, 1]) this.batch.box(bx + s * (W2 / 2 + 0.1), 0.9, bz, 0.12, 1.8, 0.12, 0x3a3a3a);
      this.world.addBoxC(bx, 1.4, bz, W2 + 0.4, 2.8, L, { occlude: true, kind: 'boat' });
      this.map.props.push({ x: bx, z: bz, w: W2 + 0.4, d: L });
    }
    const shed = this._building({
      x0: yx1 - 11, z0: yz1 - 8, x1: yx1 - 1, z1: yz1, h: 3.6, wall: 0x7a6e5e, inner: 0x6a6252, roof: 0x4a4a46, floor: 0x5a5852,
      openings: { n: [{ c: yx1 - 6, w: 3.0, kind: 'door' }], w: [{ c: yz1 - 4, w: 1.2, kind: 'window', sill: 1.0, top: 2.1 }] }, partitions: [], kind: 'shed', surface: 'ground',
    });
    const srm = this._room(shed.x0, shed.z0, shed.x1, shed.z1, 'shed');
    const tb = this._container('toolbox', srm, 'toolbox', ['s', 'e'], 'Welder\'s Chest');
    this.sites.torchChest = tb && tb.c;
    this._container('locker', srm, 'locker', ['s', 'e']);
    this._floorLoot(srm, 0.5);
    this._markInterior(srm, 0.2);
    for (let i = 0; i < 6; i++) this.candidates.street.push({ x: r.range(yx0 + 2, yx1 - 2), z: r.range(yz0 + 2, yz1 - 2) });
    // the harbor master's office between the marina and the quay
    this._harborOffice(-15, 0);
  }

  _pleasureBoat(x, z, big) {
    const r = this.rng;
    const L = big ? 11 : r.range(6, 8), W2 = big ? 3.4 : 2.4;
    const hull = r.pick([0xd8d4c8, 0xc8c4b8, 0x2a4a6a, 0x3a5a4a]);
    this.batch.box(x, WY + 0.2, z, L, 1.0, W2, hull, { ao: 1, top: 0xb8b0a0 });
    this.batch.box(x - L / 2 - 0.5, WY + 0.35, z, 1.4, 0.7, W2 * 0.55, hull, { rotY: 0, ao: 1 });
    if (big) {
      this.batch.box(x + 0.8, WY + 1.5, z, 4, 1.6, W2 - 0.4, 0xd8d4c8, { ao: 1 });
      this.batch.box(x + 0.8, WY + 1.6, z, 4.02, 0.5, W2 - 0.38, 0x1a2a3a);
      this.batch.cylinder(x - 1, WY + 5, z, 0.08, 0.1, 8, 0xc8c4b8, 6);
    } else {
      this.batch.box(x + 0.6, WY + 1.0, z, 1.2, 0.8, W2 - 0.3, 0xc8c4b8);
      this.batch.box(x + L / 2 + 0.2, WY + 0.6, z, 0.5, 0.9, 0.5, 0x1a1a1a);
    }
    this.world.addBoxC(x, WY, z, L + 1.4, 3.2, W2, { occlude: false, kind: 'boat' });
  }

  _harborOffice(cx, cz) {
    const w = 12, d = 10;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const inner = this._building({
      x0, z0, x1, z1, h: 3.2, wall: 0xc8c0a8, inner: 0xa39a82, roof: 0x3a3634, floor: 0x5a4030, trim: 0x2a4a6a,
      openings: { n: [{ c: cx, w: 1.2, kind: 'door' }, { c: x0 + 2.4, w: 1.8, kind: 'window', sill: 0.9, top: 2.2 }, { c: x1 - 2.4, w: 1.8, kind: 'window', sill: 0.9, top: 2.2 }], s: [{ c: cx + 3, w: 1.1, kind: 'door' }], e: [{ c: cz, w: 1.4, kind: 'window', sill: 0.9, top: 2.2 }], w: [{ c: cz, w: 1.4, kind: 'window', sill: 0.9, top: 2.2 }] },
      partitions: [{ axis: 'z', at: cx, from: z0 + 0.1, to: z1 - 0.1, doors: [cz + 2] }], kind: 'clinic', surface: 'wood',
    });
    const a = this._room(inner.x0, inner.z0, cx - 0.07, inner.z1, 'office');
    const b = this._room(cx + 0.07, inner.z0, inner.x1, inner.z1, 'office');
    const desk = this._container('desk', a, 'desk', ['w', 's'], 'Harbor Master\'s Desk');
    this.sites.masterDesk = desk && desk.c;
    this._container('locker', a, 'locker', ['w', 's']);
    this._container('desk', b, 'desk', ['e', 's']);
    this._container('medcab', b, 'medcab', ['e']);
    this._floorLoot(a, 0.5);
    this._markInterior(a, 0.2);
    this._markInterior(b, 0.2);
    // a radio mast on the roof and the port's name board
    this.batch.cylinder(x1 - 1, 6, z1 - 1, 0.06, 0.08, 6, 0x9a9ea3, 5);
    this.batch.box(cx, 3.9, z0 - 0.12, 7, 0.9, 0.08, 0x2a4a6a);
    this.batch.box(cx, 3.9, z0 - 0.17, 6.4, 0.5, 0.02, 0xe0d8c0);
    this.sites.office = new THREE.Vector3(cx, 0, cz);
  }

  // ---- the quay -----------------------------------------------------------------------------

  _quay() {
    const r = this.rng;
    const x0 = -40, x1 = 150, z0 = QUAY_Z, z1 = -10;
    // the apron: concrete, rails for the cranes, tie-downs, painted lanes
    this._slab(x0, z0, x1, z1, 0, CONCRETE, 'ground', 0.4, { top: 0x8a877e });
    this.map.land.push({ x0, z0, x1, z1, col: '#44453e' });
    for (const rz of [-21, -7]) this.batch.box((x0 + x1) / 2, 0.015, rz, x1 - x0, 0.02, 0.2, 0x5a5a56, { jitter: 0 });
    for (let x = x0 + 4; x < x1; x += 12) this.batch.box(x, 0.012, -15, 6, 0.012, 0.16, 0xd8c84a, { jitter: 0 });
    // the quay wall and its face down to the harbor floor, with fenders and ladders
    const gaps = [[-23.4, -20.6]];
    let cur = x0;
    for (const [g0, g1] of gaps.concat([[x1, x1]])) {
      if (g0 > cur) {
        this.batch.box((cur + g0) / 2, -5, z0 - 0.5, g0 - cur, 10, 1.0, 0x6a6862, { ao: 0.7, jitter: 0.04 });
        this.world.addBox(cur, -12, z0 - 1.0, g0, 0, z0, { occlude: true, kind: 'quay' });
      }
      cur = g1;
    }
    for (let x = x0 + 6; x < x1 - 2; x += 10) {
      if (x > -26 && x < -18) continue;
      this.batch.cylinder(x, 0.35, z0 + 0.6, 0.22, 0.26, 0.7, 0x2a2a2a, 8);
      this.world.addBoxC(x, 0.35, z0 + 0.6, 0.5, 0.7, 0.5, { occlude: false, kind: 'bollard' });
      this.batch.cylinder(x + 5, -0.9, z0 - 1.25, 0.5, 0.5, 0.5, 0x1a1a1a, 10, { rz: Math.PI / 2 });
    }
    // ladders for anyone in the water
    for (const lx of [8, 42, 96, 132]) {
      this._climb({ x: lx, y: WY - 1.3, z: z0 - 1.1 }, { x: lx, y: 0.1, z: z0 - 1.1 }, { x: lx, y: 0, z: z0 + 0.7 }, 'the quay', { base: { x: lx, y: WY - 1.3, z: z0 - 1.8 }, color: 0x4a4a46 });
    }
    // what the Guard was loading: stacks of containers, a spreader, trucks, pallets
    for (let i = 0; i < 5; i++) {
      const cx = r.range(x0 + 30, x1 - 20), cz = r.range(-19, -12);
      if (Math.abs(cx - 20) < 12 || Math.abs(cx - 64) < 12) continue;
      this._box40(cx, cz, 0, r.int(1, 2), r.chance(0.5));
    }
    for (let i = 0; i < 3; i++) this._truck(r.range(x0 + 25, x1 - 20), r.range(-16, -12), r.chance(0.5) ? 0 : Math.PI);
    for (let i = 0; i < 8; i++) this._junk(r.range(x0 + 5, x1 - 5), r.range(-20, -11));
    for (let i = 0; i < 12; i++) this.candidates.street.push({ x: r.range(x0 + 10, x1 - 10), z: r.range(-20, -12) });
    for (let i = 0; i < 6; i++) this.candidates.patrol.push({ x: r.range(x0 + 20, x1 - 20), z: -16 });
    // lamp posts
    for (let x = x0 + 10; x < x1; x += 30) {
      this.batch.cylinder(x, 5, -11, 0.12, 0.16, 10, 0x3a3e42, 6);
      this.batch.box(x, 10, -11.6, 0.5, 0.25, 1.4, 0x2a2e33);
      this.lamps.box(x, 9.86, -11.7, 0.36, 0.04, 1.0, 0xffd8a0, { jitter: 0 });
      this.world.addBoxC(x, 5, -11, 0.35, 10, 0.35, { occlude: false, kind: 'pole' });
    }
    this.sites.quay = new THREE.Vector3(60, 0, -16);
  }

  // A 40-foot container at a height, stacked n high. Open ones hold loot.
  _box40(cx, cz, y, n = 1, alongX = true, open = false) {
    const L = 12.2, W2 = 2.44, H = 2.6;
    const sx = alongX ? L : W2, sz = alongX ? W2 : L;
    for (let k = 0; k < n; k++) {
      const col = this.rng.pick(CONT);
      const yy = y + k * H;
      this.batch.box(cx, yy + H / 2, cz, sx, H, sz, col, { ao: 1, jitter: 0.08 });
      // corrugation
      for (let s = -L / 2 + 0.35; s < L / 2; s += 0.45) {
        if (alongX) {
          this.batch.box(cx + s, yy + H / 2, cz - W2 / 2 - 0.01, 0.06, H - 0.12, 0.02, col, { jitter: 0.14 });
          this.batch.box(cx + s, yy + H / 2, cz + W2 / 2 + 0.01, 0.06, H - 0.12, 0.02, col, { jitter: 0.14 });
        } else {
          this.batch.box(cx - W2 / 2 - 0.01, yy + H / 2, cz + s, 0.02, H - 0.12, 0.06, col, { jitter: 0.14 });
          this.batch.box(cx + W2 / 2 + 0.01, yy + H / 2, cz + s, 0.02, H - 0.12, 0.06, col, { jitter: 0.14 });
        }
      }
    }
    this.world.addBoxC(cx, y + (n * H) / 2, cz, sx, n * H, sz, { occlude: true, kind: 'container' });
    this.map.buildings.push({ x0: cx - sx / 2, z0: cz - sz / 2, x1: cx + sx / 2, z1: cz + sz / 2, kind: 'container' });
  }

  // ---- the gantry cranes ----------------------------------------------------------------------

  _cranes() {
    for (const [cx, climb] of [[20, true], [64, false]]) {
      const b = this.batch;
      const col = 0xb8862a, dark = 0x6a4e1e;
      const legs = [[cx - 9, -21], [cx + 9, -21], [cx - 9, -7], [cx + 9, -7]];
      for (const [lx, lz] of legs) {
        b.box(lx, 16, lz, 1.2, 32, 1.2, col, { ao: 0.8 });
        b.box(lx, 0.6, lz, 2.4, 1.2, 3.0, dark, { ao: 1 });
        this.world.addBoxC(lx, 16, lz, 1.3, 32, 1.3, { occlude: true, kind: 'crane' });
        this.world.addBoxC(lx, 0.6, lz, 2.4, 1.2, 3.0, { occlude: false, kind: 'crane' });
      }
      // sill beams, portal and top girders
      for (const lz of [-21, -7]) b.box(cx, 12, lz, 19.2, 1.2, 1.2, col);
      for (const lx of [cx - 9, cx + 9]) b.box(lx, 12, -14, 1.2, 1.2, 15.2, col);
      for (const lx of [cx - 9, cx + 9]) b.box(lx, 32, -14, 1.4, 1.6, 15.2, col);
      for (const lz of [-21, -7]) b.box(cx, 32, lz, 19.4, 1.6, 1.4, col);
      // diagonal bracing
      for (const lz of [-21, -7]) for (const s of [-1, 1]) b.box(cx + s * 4.5, 22, lz, 0.5, 22, 0.5, col, { rotY: 0 });
      // the boom over the water and the backreach, a truss girder
      const bz0 = -64, bz1 = 8;
      for (const s of [-1, 1]) {
        b.box(cx + s * 1.6, 36, (bz0 + bz1) / 2, 0.5, 0.6, bz1 - bz0, col);
        b.box(cx + s * 1.6, 38.6, (bz0 + bz1) / 2, 0.5, 0.6, bz1 - bz0, col);
        for (let z = bz0; z < bz1; z += 3) b.box(cx + s * 1.6, 37.3, z + 1.5, 0.3, 3.0, 0.3, col, { rotY: 0 });
      }
      for (let z = bz0; z < bz1; z += 3) b.box(cx, 38.6, z, 3.4, 0.25, 0.25, col);
      b.box(cx, 41, -14, 6, 6, 8, TLG_WHITE, { ao: 0.8 });
      b.box(cx, 41, -14 - 4.02, 6.02, 1, 0.02, TLG_RED);
      // forestays up to an A-frame
      b.box(cx, 44, -10, 3.4, 8, 0.5, col);
      // the operator's cab hanging under the boom, over the water's edge
      b.box(cx, 34.3, -26, 2.2, 2.4, 2.8, TLG_WHITE);
      b.box(cx, 34.4, -27.42, 2.0, 1.4, 0.02, 0x1a2a3a);
      // a spreader hanging from the trolley
      b.box(cx, 26, -40, 2.6, 0.5, 12.4, 0x2a2e33);
      b.box(cx, 31, -40, 0.1, 10, 0.1, 0x1a1a1a);
      this.map.props.push({ x: cx, z: -14, w: 20, d: 16 });
      // machinery platform on the portal: a ladder up the landward leg
      if (climb) {
        const py = 33.2;
        this._slab(cx - 9.6, -21.6, cx + 9.6, -6.4, py, 0x7a6a4a, 'metal', 0.3);
        this._rail(cx - 9.6, -21.6, cx + 9.6, -21.6, py);
        this._rail(cx - 9.6, -6.4, cx + 9.6, -6.4, py);
        this._rail(cx - 9.6, -21.6, cx - 9.6, -6.4, py);
        this._rail(cx + 9.6, -21.6, cx + 9.6, -6.4, py);
        this._climb({ x: cx - 9, y: 0, z: -5.9 }, { x: cx - 9, y: py + 0.1, z: -5.9 }, { x: cx - 8, y: py, z: -8 }, 'the crane', { base: { x: cx - 9, y: 0, z: -5.2 }, color: 0x6a4e1e });
        this.sites.cranePlatform = new THREE.Vector3(cx, py, -18);
        this.uses.push({ kind: 'scope', pos: new THREE.Vector3(cx - 2, py + 1.3, -21.2), label: 'Glass the Covenant from the crane', site: 'crane' });
      }
    }
  }

  // ---- the container yard -----------------------------------------------------------------

  _yard() {
    const r = this.rng;
    const x0 = 2, x1 = 132, z0 = 8, z1 = 70;
    this.batch.box((x0 + x1) / 2, 0.012, (z0 + z1) / 2, x1 - x0, 0.015, z1 - z0, 0x4a4a46, { jitter: 0.02 });
    this.map.land.push({ x0, z0, x1, z1, col: '#3a3b36' });
    // blocks of stacks with lanes between
    for (let bx = x0 + 4; bx + 24.4 < x1; bx += 32) {
      for (let bz = z0 + 4; bz + 14.6 < z1; bz += 22) {
        for (let row = 0; row < 5; row++) {
          const cz = bz + row * 2.8 + 1.22;
          for (let col = 0; col < 2; col++) {
            const cx = bx + col * 12.4 + 6.1;
            const n = r.chance(0.12) ? 0 : r.int(1, 4);
            if (!n) continue;
            // the bottom box of an end row can stand open
            if ((row === 0 || row === 4) && n === 1 && r.chance(0.35)) this._openBox(cx, cz, row === 0 ? -1 : 1);
            else this._box40(cx, cz, 0, n, true);
          }
        }
        this.candidates.street.push({ x: bx + 12, z: bz - 2.5 });
        this.candidates.street.push({ x: bx - 3, z: bz + 7 });
        this.candidates.patrol.push({ x: bx - 3, z: bz - 3 });
      }
    }
    // a straddle carrier and a reach stacker parked in a lane
    const sx = x0 + 30, sz = z0 + 20;
    for (const [dx, dz] of [[-2, -4], [2, -4], [-2, 4], [2, 4]]) this.batch.box(sx + dx, 6, sz + dz, 0.5, 12, 0.5, 0xb8862a);
    this.batch.box(sx, 12, sz, 5, 1.2, 9, 0xb8862a);
    for (const [dx, dz] of [[-2, -4], [2, -4], [-2, 4], [2, 4]]) this.world.addBoxC(sx + dx, 6, sz + dz, 0.6, 12, 0.6, { occlude: true, kind: 'pole' });
    for (let i = 0; i < 6; i++) this._junk(r.range(x0 + 2, x1 - 2), r.range(z0 + 1, z1 - 1));
    this._fireBarrel(x0 + 60, z0 + 44);
    this._fireBarrel(x0 + 100, z0 + 20);
  }

  // A box on the ground with its doors swung open and something inside.
  _openBox(cx, cz, face) {
    const r = this.rng;
    const L = 12.2, W2 = 2.44, H = 2.6;
    const x0 = cx - L / 2, x1 = cx + L / 2, z0 = cz - W2 / 2, z1 = cz + W2 / 2;
    const endE = r.chance(0.5);
    const col = r.pick(CONT);
    const ops = endE ? { e: [{ c: cz, w: W2 - 0.2, kind: 'gap' }] } : { w: [{ c: cz, w: W2 - 0.2, kind: 'gap' }] };
    const inner = this._building({ x0, z0, x1, z1, h: H, wall: col, inner: 0x3a3a38, roof: col, floor: 0x3a3a36, openings: ops, kind: 'container', surface: 'metal' });
    const ex = endE ? x1 : x0;
    this.batch.box(ex + (endE ? 0.1 : -0.1), H / 2, z0 - 0.6, 0.06, H, 1.2, col);
    const rm = this._room(inner.x0, inner.z0, inner.x1, inner.z1, 'container');
    this._crateAt(endE ? inner.x0 + 0.7 : inner.x1 - 0.7, cz, r.chance(0.6) ? 'crate' : r.chance(0.5) ? 'military' : 'locker', endE ? Math.PI / 2 : -Math.PI / 2);
    this._floorLoot(rm, 0.5);
    if (r.chance(0.4)) this.candidates.dormant.push({ x: cx, z: cz });
  }

  _warehouses() {
    for (const [a, b] of [[4, 44], [50, 90], [96, 136]]) this._warehouse(a, 78, b, 112);
    this.map.roads.push({ x0: -40, z0: 72, x1: 150, z1: 76 });
  }

  // ---- the fuel depot ----------------------------------------------------------------------

  _depot() {
    const r = this.rng;
    const x0 = 136, x1 = 162, z0 = -8, z1 = 50;
    // bunded tanks
    for (const [tx, tz, rad] of [[146, 6, 6], [146, 24, 6], [156, 14, 4], [155, 38, 5]]) {
      this.batch.cylinder(tx, 5, tz, rad, rad, 10, 0xc8c4b8, 20);
      this.batch.cylinder(tx, 10.2, tz, rad * 0.95, rad, 0.4, 0xa8a49c, 20);
      this.batch.box(tx, 5, tz - rad - 0.02, 1.8, 1.0, 0.04, TLG_RED);
      this.world.addBoxC(tx, 5, tz, rad * 1.7, 10, rad * 1.7, { occlude: true, kind: 'tank' });
      this.map.buildings.push({ x0: tx - rad, z0: tz - rad, x1: tx + rad, z1: tz + rad, kind: 'tank' });
    }
    this.batch.box(x0 + 1, 0.5, (z0 + z1) / 2, 0.4, 1.0, z1 - z0, 0x6a6862);
    this.world.addBox(x0 + 0.8, 0, z0 + 4, x0 + 1.2, 1.0, z1, { occlude: false, kind: 'bund' });
    // pipes along the ground and up to the fuel dock
    for (let z = z0; z < z1; z += 1) this.batch.box(x0 + 2.5, 0.6, z + 0.5, 0.3, 0.3, 1.0, 0x9a9ea3, { jitter: 0.03 });
    // the shed where the cans are
    const shed = this._building({
      x0: x0 + 3, z0: z1 - 8, x1: x0 + 11, z1: z1 - 1, h: 3.0, wall: 0x8a8478, inner: 0x6a6252, roof: 0x3e4242, floor: 0x4a4a46,
      openings: { w: [{ c: z1 - 4.5, w: 1.3, kind: 'door' }] }, partitions: [], kind: 'shed', surface: 'ground',
    });
    const rm = this._room(shed.x0, shed.z0, shed.x1, shed.z1, 'shed');
    const cans = this._container('crate', rm, 'crate', ['e', 's', 'n'], 'Fuel Store');
    this.sites.fuelStore = cans && cans.c;
    this._floorLoot(rm, 0.6);
    // jerry cans lined up outside, and the fuel pier into the water
    for (let i = 0; i < 6; i++) this.batch.box(x0 + 3.5 + i * 0.5, 0.25, z1 - 8.6, 0.35, 0.5, 0.2, TLG_RED);
    this._slab(x0 + 2, -44, x0 + 6, QUAY_Z, 0.3, 0x6a6862, 'ground', 0.5);
    this.map.roads.push({ x0: x0 + 2, z0: -44, x1: x0 + 6, z1: QUAY_Z });
    this._rail(x0 + 2, -44, x0 + 2, QUAY_Z, 0.3);
    for (let z = -44; z < QUAY_Z; z += 5) this.batch.cylinder(x0 + 4, -4, z, 0.3, 0.3, 8, 0x3a3a36, 6);
    this.batch.box(x0 + 4, 1.2, -42, 1.2, 1.8, 0.8, TLG_RED);
    this.world.addBoxC(x0 + 4, 1.2, -42, 1.2, 1.8, 0.8, { occlude: false, kind: 'junk' });
    for (let i = 0; i < 3; i++) this.candidates.street.push({ x: r.range(x0 + 3, x1 - 3), z: r.range(z0 + 2, z1 - 2) });
    this.sites.depot = new THREE.Vector3(x0 + 7, 0, z1 - 4.5);
  }

  // ---- the breakwater and the lighthouse --------------------------------------------------------

  _breakwater() {
    const r = this.rng;
    // a rock causeway from the depot's corner out to the harbor mouth
    const path = [[150, QUAY_Z, 150, -96], [150, -96, 96, -96]];
    const y = 0.8;
    for (const [ax, az, bx, bz] of path) {
      const x0 = Math.min(ax, bx) - 2.2, x1 = Math.max(ax, bx) + 2.2, z0 = Math.min(az, bz) - 2.2, z1 = Math.max(az, bz) + 2.2;
      this._slab(x0, z0, x1, z1, y, 0x7a7870, 'ground', 0.6);
      this.map.roads.push({ x0, z0, x1, z1 });
      // armour stone down both sides into the water
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let s = 0; s < len; s += 1.8) {
        for (const side of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const off = 2.8 + k * 1.6 + r.range(-0.3, 0.3);
            const px = alongX ? x0 + s : (ax + side * off), pz = alongX ? (az + side * off) : z0 + s;
            this.batch.ico(px, y - 0.8 - k * 1.1, pz, r.range(1.0, 1.5), r.pick([0x5a5852, 0x6a665e, 0x4e4c46]), 0.7);
          }
        }
      }
      if (alongX) {
        this.world.addBox(x0, WY - 3, z0 - 3.2, x1, y - 0.2, z0, { occlude: false, kind: 'rocks' });
        this.world.addBox(x0, WY - 3, z1, x1, y - 0.2, z1 + 3.2, { occlude: false, kind: 'rocks' });
      } else {
        this.world.addBox(x0 - 3.2, WY - 3, z0, x0, y - 0.2, z1, { occlude: false, kind: 'rocks' });
        this.world.addBox(x1, WY - 3, z0, x1 + 3.2, y - 0.2, z1, { occlude: false, kind: 'rocks' });
      }
    }
    // the lighthouse at the head: a white tower with a red band, a gallery and the lantern
    const lx = 94, lz = -96, H = 16;
    this._slab(lx - 5, lz - 5, lx + 4, lz + 5, y, 0x7a7870, 'ground', 0.6);
    for (let i = 0; i < 8; i++) {
      const k = i / 8;
      const rad = 3.0 - k * 0.9;
      this.batch.cylinder(lx, y + (H * (i + 0.5)) / 8, lz, rad - 0.11, rad, H / 8 + 0.02, i === 4 || i === 5 ? TLG_RED : 0xe8e4d8, 16);
    }
    this.world.addBoxC(lx, y + H / 2, lz, 5.2, H, 5.2, { occlude: true, kind: 'tower' });
    this.map.buildings.push({ x0: lx - 3, z0: lz - 3, x1: lx + 3, z1: lz + 3, kind: 'tower' });
    // gallery at the top with a railing, the lantern room above
    const gy = y + H;
    this._slab(lx - 3.4, lz - 3.4, lx + 3.4, lz + 3.4, gy, 0x3a3a3a, 'metal', 0.25);
    this._rail(lx - 3.4, lz - 3.4, lx + 3.4, lz - 3.4, gy, 0x2a2a2a);
    this._rail(lx - 3.4, lz + 3.4, lx + 3.4, lz + 3.4, gy, 0x2a2a2a);
    this._rail(lx - 3.4, lz - 3.4, lx - 3.4, lz + 3.4, gy, 0x2a2a2a);
    this._rail(lx + 3.4, lz - 3.4, lx + 3.4, lz + 3.4, gy, 0x2a2a2a);
    this.batch.cylinder(lx, gy + 1.3, lz, 1.4, 1.4, 2.6, 0x1a2a2a, 12);
    this.batch.cone(lx, gy + 2.6, lz, 1.7, 1.2, TLG_RED, 12);
    this.world.addBoxC(lx, gy + 1.3, lz, 2.8, 2.6, 2.8, { occlude: true, kind: 'lantern' });
    this.lighthouse = new THREE.Vector3(lx, gy + 1.3, lz);
    this.lamps.box(lx, gy + 1.3, lz, 1.2, 0.8, 1.2, 0xfff4d8, { jitter: 0 });
    // the beam: two long soft cones turning slowly, seen once it's dark
    const beam = new THREE.Group();
    const bm = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    for (const s2 of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 140, 16, 1, true).translate(0, -70, 0), bm);
      cone.rotation.z = s2 * Math.PI / 2;
      beam.add(cone);
    }
    beam.position.set(lx, gy + 1.3, lz);
    this.scene.add(beam);
    this.sites.beacon = { group: beam, mat: bm };
    // a door at the foot, and an iron ladder up the outside of the tower
    this.batch.box(lx + 2.95, y + 1.1, lz, 0.1, 2.2, 1.2, 0x2a3a3a);
    this._climb({ x: lx + 3.25, y, z: lz + 1.4 }, { x: lx + 3.25, y: gy + 0.1, z: lz + 1.4 }, { x: lx + 2.7, y: gy, z: lz + 2.6 }, 'the lighthouse', { base: { x: lx + 3.9, y, z: lz + 1.4 }, color: 0x3a3a36 });
    this.uses.push({ kind: 'scope', pos: new THREE.Vector3(lx - 3.2, gy + 1.3, lz - 1), label: 'Glass the Covenant from the gallery', site: 'lighthouse' });
    this.sites.lighthouse = new THREE.Vector3(lx, gy, lz);
    this.candidates.patrol.push({ x: 150, z: -60 });
    this.candidates.patrol.push({ x: 120, z: -96 });
  }

  // ---- behind the port: the checkpoint, the road in and a few houses ---------------------------

  _town() {
    const r = this.rng;
    this.batch.box(64, 0.012, 140, 16, 0.015, 60, C.asphalt, { jitter: 0 });
    this.map.roads.push({ x0: 56, z0: 112, x1: 72, z1: 168 });
    this._checkpoint(46, 114, 82, 150);
    for (const [a, b] of [[-36, -6], [-2, 28], [90, 120], [124, 154]]) {
      for (const zz of [118, 140]) {
        if (r.chance(0.8)) this._house(a, zz, b, zz + 20, 'n');
      }
    }
    for (let i = 0; i < 10; i++) this._tree(r.range(-150, -45), r.range(64, 150), r.chance(0.3));
    for (let i = 0; i < 8; i++) this.candidates.street.push({ x: r.range(-35, 150), z: r.range(114, 160) });
  }

  // ---- the Covenant ---------------------------------------------------------------------------

  _covenant() {
    const S = SHIP, b = this.batch, r = this.rng;
    const D = S.deck;
    const zc = S.cz, half = (S.z1 - S.z0) / 2;
    // the hull: a plan outline (stern square, bow drawn to a point) extruded keel to deck
    const shape = new THREE.Shape();
    const bowTip = S.x0 - 7, bowStart = S.x0 + 14;
    shape.moveTo(S.x1, -half + 1.2);
    shape.quadraticCurveTo(S.x1 + 0.6, -half, S.x1 - 1.4, -half);
    shape.lineTo(bowStart, -half);
    shape.bezierCurveTo(S.x0 + 2, -half, bowTip + 1, -3, bowTip, 0);
    shape.bezierCurveTo(bowTip + 1, 3, S.x0 + 2, half, bowStart, half);
    shape.lineTo(S.x1 - 1.4, half);
    shape.quadraticCurveTo(S.x1 + 0.6, half, S.x1, half - 1.2);
    shape.closePath();
    // the bow's outline the way three.js draws it (12 steps a curve), so what stands on
    // it (the forecastle deck and bulwark, the rust, the collision) follows the plating
    const bowCurve = new THREE.CubicBezierCurve(new THREE.Vector2(bowStart, half), new THREE.Vector2(S.x0 + 2, half), new THREE.Vector2(bowTip + 1, 3), new THREE.Vector2(bowTip, 0)).getPoints(12);
    const halfAt = (x) => {
      if (x >= bowStart) return half;
      for (let i = 1; i < bowCurve.length; i++) {
        const p = bowCurve[i - 1], q = bowCurve[i];
        if (x <= p.x && x >= q.x) return p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x || 1);
      }
      return 0;
    };
    // only the sides of an extrusion: its caps would roof over the open holds
    const sidesOnly = (g) => {
      const grp = g.groups.find((x) => x.materialIndex === 1) || g.groups[1];
      const out = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) {
        const a = g.attributes[k];
        out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
      }
      g.dispose();
      return out;
    };
    const hullBand = (y0, y1, col) => {
      const g = sidesOnly(new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 }));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Matrix4().makeTranslation(0, y0, zc);
      b.geo(g, m, col, 0.05);
    };
    hullBand(S.keel, WY - 0.3, HULL_RED);
    // her bottom plating, seen from under the water
    b.box((S.x0 + 12 + S.x1) / 2, S.keel + 0.2, zc, S.x1 - S.x0 - 12.5, 0.4, S.z1 - S.z0 - 0.1, HULL_RED, { ao: 1 });
    for (let k = 0; k < 5; k++) {
      const x = S.x0 + 11 - k * 3.2, w = (S.z1 - S.z0) * (1 - (k + 1) * 0.17);
      b.box(x, S.keel + 0.2, zc, 3.3, 0.4, Math.max(1.5, w), HULL_RED, { ao: 1 });
    }
    hullBand(WY - 0.3, WY + 0.1, 0x1a1a1a);
    hullBand(WY + 0.1, D - 0.5, HULL);
    hullBand(D - 0.5, D + 1.1, 0x3b4046);
    // the forecastle rises at the bow
    const fshape = new THREE.Shape();
    fshape.moveTo(S.x0 + 12, -half);
    fshape.lineTo(bowStart, -half);
    fshape.bezierCurveTo(S.x0 + 2, -half, bowTip + 1, -3, bowTip, 0);
    fshape.bezierCurveTo(bowTip + 1, 3, S.x0 + 2, half, bowStart, half);
    fshape.lineTo(S.x0 + 12, half);
    fshape.closePath();
    {
      let g = sidesOnly(new THREE.ExtrudeGeometry(fshape, { depth: S.fc - D, bevelEnabled: false, curveSegments: 12 }));
      // drop its aft face and the bit aft of the forecastle: the stairs come through there
      const pos = g.attributes.position, keep = [];
      for (let i = 0; i < pos.count; i += 3) {
        if (pos.getX(i) > S.x0 + 11.99 && pos.getX(i + 1) > S.x0 + 11.99 && pos.getX(i + 2) > S.x0 + 11.99) continue;
        keep.push(i, i + 1, i + 2);
      }
      const cut = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) {
        const a = g.attributes[k], arr = new Float32Array(keep.length * a.itemSize);
        keep.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]; });
        cut.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
      }
      g.dispose();
      g = cut;
      g.rotateX(-Math.PI / 2);
      b.geo(g, new THREE.Matrix4().makeTranslation(0, D + 1.1 - 0.02, zc), HULL, 0.05);
    }
    // rust streaks and her name
    for (let i = 0; i < 40; i++) {
      const x = r.range(bowStart + 1, S.x1 - 2);
      for (const s of [-1, 1]) b.box(x, D - 1.5 - r.range(0, 2), zc + s * (half + 0.02), 0.25, r.range(1.5, 4), 0.02, RUST, { jitter: 0.15 });
    }
    this._lettering('COVENANT', bowStart + 6.5, D - 1.0, S.z1 + 0.08, 0, 11);
    this._lettering('COVENANT', bowStart + 6.5, D - 1.0, S.z0 - 0.08, Math.PI, 11);
    this._lettering('COVENANT  ·  NATCHEZ', S.x1 + 0.08, D - 1.6, zc, Math.PI / 2, 12);
    this._lettering('THE LIVING GUARD', -8, D - 1.6, S.z1 + 0.08, 0, 26, '#c9c6bc');
    // a red band along the sheer, and draught marks at the bow and stern
    for (const s2 of [-1, 1]) {
      b.box((S.x0 + 14 + S.x1) / 2, D - 0.25, zc + s2 * (half + 0.03), S.x1 - S.x0 - 14, 0.35, 0.02, TLG_RED, { jitter: 0.03 });
      for (let k = 0; k < 6; k++) {
        b.box(S.x0 + 12, WY + 0.3 + k * 0.5, zc + s2 * (half + 0.03), 0.3, 0.08, 0.02, 0xd8d4c8);
        b.box(S.x1 - 3, WY + 0.3 + k * 0.5, zc + s2 * (half + 0.03), 0.3, 0.08, 0.02, 0xd8d4c8);
      }
    }
    // the hull is a shell: sides, stern, bottom, and the solid bow under the forecastle.
    // The holds are open space inside it.
    const hullTop = D - 0.1;
    this.world.addBox(S.x0 + 10, S.keel, S.z0, S.x1, hullTop, S.z0 + 0.6, { occlude: true, kind: 'hull' });
    this.world.addBox(S.x0 + 10, S.keel, S.z1 - 0.6, S.x1, hullTop, S.z1, { occlude: true, kind: 'hull' });
    this.world.addBox(S.x1 - 0.6, S.keel, S.z0, S.x1, hullTop, S.z1, { occlude: true, kind: 'hull' });
    this.world.addBox(S.x0 + 10, S.keel, S.z0, S.x1, S.keel + 0.5, S.z1, { occlude: true, kind: 'hull' });
    // the bow, solid under the forecastle, stepped to the curve of the plating
    for (let x = bowTip; x < S.x0 + 10 - 0.01; x += 1) {
      const xb = Math.min(S.x0 + 10, x + 1), hm = Math.max(halfAt(x), halfAt(xb));
      this.world.addBox(x, S.keel, zc - hm, xb, hullTop, zc + hm, { occlude: true, kind: 'hull' });
    }
    this.map.buildings.push({ x0: S.x0, z0: S.z0, x1: S.x1, z1: S.z1, kind: 'ship' });

    // ---- the main deck, around the holds
    const dz0 = S.z0 + 0.4, dz1 = S.z1 - 0.4;
    const holds = S.holds;
    const deckRect = (x0, z0, x1, z1) => this._slab(x0, z0, x1, z1, D, DECK_COL, 'metal', 0.2, { top: DECK_DARK, jitter: 0.05 });
    // side decks the full length from the forecastle to the stern
    deckRect(S.x0 + 12, dz0, S.x1 - 0.5, S.hz0);
    deckRect(S.x0 + 12, S.hz1, S.x1 - 0.5, dz1);
    // cross decks between and around the holds
    let cur = S.x0 + 12;
    for (const h of holds) {
      deckRect(cur, S.hz0, h.x0, S.hz1);
      cur = h.x1;
    }
    deckRect(cur, S.hz0, S.x1 - 0.5, S.hz1);
    // the bulwark all round (with gaps for the gangway and the pilot ladder)
    const bul = (x0, x1, z) => {
      if (x1 - x0 < 0.1) return;
      b.box((x0 + x1) / 2, D + 0.6, z, x1 - x0, 1.2, 0.18, 0x3b4046, { ao: 1 });
      this.world.addBox(x0, D, z - 0.12, x1, D + 1.2, z + 0.12, { occlude: false, kind: 'bulwark' });
    };
    const gwX = 22, pilotX = -8;
    bul(S.x0 + 12, gwX + 0.1, S.z1 - 0.3); bul(gwX + 2.3, S.x1 - 0.5, S.z1 - 0.3);
    bul(S.x0 + 12, pilotX - 0.7, S.z0 + 0.3); bul(pilotX + 0.7, S.x1 - 0.5, S.z0 + 0.3);
    b.box(S.x1 - 0.3, D + 0.6, zc, 0.18, 1.2, S.z1 - S.z0, 0x3b4046);
    this.world.addBox(S.x1 - 0.4, D, S.z0, S.x1 + 0.2, D + 1.2, S.z1, { occlude: false, kind: 'bulwark' });

    // ---- the holds: open, down to the tank top, coamings round the top, a ladder in each
    for (let i = 0; i < holds.length; i++) {
      const h = holds[i];
      const hy = S.hold;
      this._slab(h.x0, S.hz0, h.x1, S.hz1, hy, 0x4c4a44, 'metal', 0.3, { top: 0x57544c }).dry = true;
      // hold walls (from the tank top up to the deck), framed, and a waist-high coaming above
      const cH = 0.9, t = 0.4, HW = 0x60625e;
      b.box((h.x0 + h.x1) / 2, (hy + D) / 2, S.hz0 - 0.1, h.x1 - h.x0, D - hy, 0.2, HW, { ao: 0.7 });
      b.box((h.x0 + h.x1) / 2, (hy + D) / 2, S.hz1 + 0.1, h.x1 - h.x0, D - hy, 0.2, HW, { ao: 0.7 });
      b.box(h.x0 - 0.1, (hy + D) / 2, (S.hz0 + S.hz1) / 2, 0.2, D - hy, S.hz1 - S.hz0, HW, { ao: 0.7 });
      b.box(h.x1 + 0.1, (hy + D) / 2, (S.hz0 + S.hz1) / 2, 0.2, D - hy, S.hz1 - S.hz0, HW, { ao: 0.7 });
      for (let x = h.x0 + 1.6; x < h.x1 - 0.8; x += 2.6) for (const zz of [S.hz0 + 0.07, S.hz1 - 0.07]) b.box(x, (hy + D) / 2, zz, 0.18, D - hy, 0.14, 0x55574f, { ao: 0.8 });
      this.world.addBox(h.x0 - 0.2, hy, S.hz0 - 0.3, h.x1 + 0.2, D, S.hz0, { occlude: true, kind: 'hold' });
      this.world.addBox(h.x0 - 0.2, hy, S.hz1, h.x1 + 0.2, D, S.hz1 + 0.3, { occlude: true, kind: 'hold' });
      this.world.addBox(h.x0 - 0.3, hy, S.hz0, h.x0, D, S.hz1, { occlude: true, kind: 'hold' });
      this.world.addBox(h.x1, hy, S.hz0, h.x1 + 0.3, D, S.hz1, { occlude: true, kind: 'hold' });
      // coaming with a gap by the ladder at the forward end
      const lz = S.hz0 + 1.5;
      const coam = (x0, z0, x1, z1) => {
        b.box((x0 + x1) / 2, D + cH / 2, (z0 + z1) / 2, x1 - x0, cH, z1 - z0, 0x6e6a60, { ao: 1, top: 0x4e4a44 });
        this.world.addBox(x0, D, z0, x1, D + cH, z1, { occlude: false, kind: 'coaming' });
      };
      coam(h.x0 - t, S.hz0 - t, h.x1 + t, S.hz0);
      coam(h.x0 - t, S.hz1, h.x1 + t, S.hz1 + t);
      coam(h.x1, S.hz0, h.x1 + t, S.hz1);
      coam(h.x0 - t, S.hz0, h.x0, lz - 0.6);
      coam(h.x0 - t, lz + 0.6, h.x0, S.hz1);
      this._climb({ x: h.x0 + 0.35, y: hy, z: lz }, { x: h.x0 + 0.35, y: D + 0.1, z: lz }, { x: h.x0 - 1.0, y: D, z: lz }, h.name, { base: { x: h.x0 + 0.9, y: hy, z: lz }, color: 0xb8862a });
      // work lights over the hold
      this.lamps.box((h.x0 + h.x1) / 2, D + 2.6, S.hz0 - 0.5, 0.6, 0.3, 0.3, 0xfff0d0, { jitter: 0 });
      b.box((h.x0 + h.x1) / 2, D + 1.3, S.hz0 - 0.5, 0.1, 2.6, 0.1, 0x3a3e42);
      this.ship.lights.push(new THREE.Vector3((h.x0 + h.x1) / 2, D + 2.4, S.hz0 - 0.2));
      this.map.buildings.push({ x0: h.x0, z0: S.hz0, x1: h.x1, z1: S.hz1, kind: 'hold' });
      this._holdCargo(h, i);
    }
    // deck cranes on the cross decks, off to starboard so the way across stays open
    for (const [cx, cz, jib] of [[-22, zc + 4.2, [-6, 20, -1.5]], [-46, zc + 4.2, [14, 18, 1.5]]]) {
      b.cylinder(cx, D + 5, cz, 0.75, 0.9, 10, 0xb8862a, 12);
      b.cylinder(cx, D + 0.15, cz, 1.05, 1.05, 0.3, 0x8a6a2a, 12);
      b.box(cx, D + 10.8, cz, 3.2, 2.4, 3.2, 0xb8862a, { ao: 0.8 });
      b.box(cx - 1.62, D + 10.9, cz, 0.02, 0.9, 1.6, 0x1a2a34);
      this._beam([cx, D + 11, cz], [cx + jib[0], D + jib[1], cz + jib[2] - 4], 0.7, 0.7, 0xb8862a);
      this._beam([cx, D + 13.5, cz], [cx + jib[0], D + jib[1] + 0.3, cz + jib[2] - 4], 0.08, 0.08, 0x2a2a2a);
      b.box(cx, D + 12.6, cz, 0.6, 1.2, 0.6, 0xb8862a);
      this.world.addBoxC(cx, D + 5, cz, 1.9, 10, 1.9, { occlude: true, kind: 'crane' });
    }
    // masts: one on the forecastle, a kingpost amidships between Holds 2 and 3
    const kpX = 2;
    b.cylinder(S.x0 + 8, S.fc + 7, zc, 0.25, 0.35, 14, 0xd8d4c8, 8);
    b.box(S.x0 + 8, S.fc + 11, zc, 0.3, 0.3, 5, 0xd8d4c8);
    this.lamps.box(S.x0 + 8, S.fc + 14.2, zc, 0.3, 0.3, 0.3, 0xfff6e0, { jitter: 0 });
    this.world.addBoxC(S.x0 + 8, S.fc + 3, zc, 0.75, 6, 0.75, { occlude: false, kind: 'mast' });
    b.cylinder(kpX, D + 8, zc, 0.3, 0.4, 16, 0xd8d4c8, 8);
    b.box(kpX, D + 12, zc, 1.3, 0.14, 1.3, 0x5a5e62);
    for (const [dx, dz] of [[-0.62, 0], [0.62, 0], [0, -0.62], [0, 0.62]]) b.box(kpX + dx, D + 12.45, zc + dz, dx ? 0.05 : 1.3, 0.05, dz ? 0.05 : 1.3, 0x8a8a84);
    this.lamps.box(kpX, D + 16.2, zc, 0.3, 0.3, 0.3, 0xfff6e0, { jitter: 0 });
    this.world.addBoxC(kpX, D + 3, zc, 0.85, 6, 0.85, { occlude: false, kind: 'mast' });
    this.ship.masts = [new THREE.Vector3(S.x0 + 8, S.fc + 14.2, zc), new THREE.Vector3(kpX, D + 16.2, zc)];
    // boxes lashed on the aft deck between Hold 3 and the house: cover for a firefight,
    // with a walkway either side and a gap between them
    for (const [bz, n] of [[zc - 3.9, 2], [zc + 3.6, 1]]) {
      for (let k = 0; k < n; k++) this.batch.box(26, D + k * 2.6 + 1.3, bz, 2.44, 2.6, 6.1, this.rng.pick(CONT), { ao: 1, jitter: 0.08 });
      this.world.addBoxC(26, D + (n * 2.6) / 2, bz, 2.44, n * 2.6, 6.1, { occlude: true, kind: 'container' });
    }
    // mooring bitts against the bulwark (a pair of posts on a plate)
    for (const x of [S.x0 + 14, S.x0 + 20, 26, 46]) for (const s of [-1, 1]) {
      if (x === 46 && s < 0) continue; // the lifeboat sits there
      const bz = zc + s * (half - 1.0);
      b.box(x, D + 0.04, bz, 1.3, 0.08, 0.6, 0x2a2a2a);
      for (const dx of [-0.38, 0.38]) {
        b.cylinder(x + dx, D + 0.4, bz, 0.2, 0.2, 0.7, 0x2e2e2e, 8);
        b.cylinder(x + dx, D + 0.78, bz, 0.26, 0.26, 0.06, 0x2e2e2e, 8);
      }
      this.world.addBoxC(x, D + 0.4, bz, 1.3, 0.8, 0.55, { occlude: false, kind: 'bitt' });
    }
    // mushroom vents, also against the bulwark
    for (const [x, s] of [[-34, 1], [-10, 1], [12, 1], [-30, -1], [-14, -1], [8, -1]]) {
      const vz = zc + s * (half - 1.0);
      b.cylinder(x, D + 0.7, vz, 0.28, 0.3, 1.4, 0xb8b4a8, 10);
      b.cylinder(x, D + 1.5, vz, 0.46, 0.3, 0.26, 0xb8b4a8, 10);
      this.world.addBoxC(x, D + 0.8, vz, 0.62, 1.6, 0.62, { occlude: false, kind: 'vent' });
    }

    // ---- the forecastle: a raised deck at the bow inside its own bulwark, with a stair
    // let into its aft end on each side down to the main deck
    const fx0 = S.x0 + 1, fx1 = S.x0 + 12, FC = S.fc;
    const sx0 = fx1 - 5.5;
    const wells = [[dz0 + 1.25, dz0 + 2.65], [dz1 - 2.65, dz1 - 1.25]];
    // the plating's own outline aft to fore along one side, out to the stem
    const side = [new THREE.Vector2(fx1, halfAt(fx1))];
    for (const p of bowCurve) if (p.x < fx1 - 0.05) side.push(p);
    // the deck, cut to the outline, with the two stairwells notched out of its aft edge
    {
      const pts = [];
      for (const p of side) pts.push([p.x, -p.y]);
      for (let i = side.length - 2; i >= 0; i--) pts.push([side[i].x, side[i].y]);
      for (const [a, c] of [wells[1], wells[0]]) {
        const za = a - zc, zb = c - zc;
        pts.push([fx1, zb], [sx0, zb], [sx0, za], [fx1, za]);
      }
      const fs = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(fs);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
      b.geo(g, new THREE.Matrix4().makeTranslation(0, FC, zc), DECK_DARK, 0.05);
    }
    // where you can stand on it: strips following the bow, and around the wells
    for (let x = bowTip; x < sx0 - 0.01; x += 0.5) {
      const xb = Math.min(sx0, x + 0.5), hm = Math.max(halfAt(x), halfAt(xb));
      this.world.addFloor(x, zc - hm, xb, zc + hm, 'metal', FC);
    }
    this.world.addFloor(sx0, S.z0, fx1, wells[0][0], 'metal', FC);
    this.world.addFloor(sx0, wells[0][1], fx1, wells[1][0], 'metal', FC);
    this.world.addFloor(sx0, wells[1][1], fx1, S.z1, 'metal', FC);
    // the bulwark along the plating, solid to the touch
    const BT = 0.22;
    for (const sg of [-1, 1]) {
      for (let i = 1; i < side.length; i++) {
        const p = side[i - 1], q = side[i];
        const ax = p.x, az = zc + sg * p.y, bx2 = q.x, bz2 = zc + sg * q.y;
        const len = Math.hypot(bx2 - ax, bz2 - az);
        if (len < 0.01) continue;
        const dx = (bx2 - ax) / len, dz = (bz2 - az) / len;
        // the inward normal points back toward the centreline
        let nx = -dz, nz = dx;
        if (nz * -sg < 0) { nx = -nx; nz = -nz; }
        b.box((ax + bx2) / 2 + nx * BT / 2, FC + 0.55, (az + bz2) / 2 + nz * BT / 2, len + 0.1, 1.1, BT, HULL, { rotY: -Math.atan2(dz, dx), jitter: 0.02 });
        b.box((ax + bx2) / 2 + nx * BT / 2, FC + 1.13, (az + bz2) / 2 + nz * BT / 2, len + 0.1, 0.06, BT + 0.08, 0x2e3338, { rotY: -Math.atan2(dz, dx), jitter: 0 });
        const zlo = Math.min(az, bz2), zhi = Math.max(az, bz2);
        this.world.addBox(Math.min(ax, bx2) - 0.04, FC, sg < 0 ? zlo - 0.05 : zlo - BT, Math.max(ax, bx2) + 0.04, FC + 1.15, sg < 0 ? zhi + BT : zhi + 0.05, { occlude: false, kind: 'bulwark' });
      }
    }
    // its aft face down to the main deck, open where the stairs come through
    {
      const zs = [S.z0 + 0.3, wells[0][0], wells[0][1], wells[1][0], wells[1][1], S.z1 - 0.3];
      for (let k = 0; k < zs.length; k += 2) {
        const za = zs[k], zb = zs[k + 1];
        b.box(fx1 + 0.15, (D + FC) / 2, (za + zb) / 2, 0.3, FC - D, zb - za, HULL, { ao: 0.8 });
        this.world.addBox(fx1, D, za, fx1 + 0.3, FC, zb, { occlude: true, kind: 'wall' });
        this._rail(fx1 + 0.1, za + (k === 0 ? BT : 0), fx1 + 0.1, zb - (k === 4 ? BT : 0), FC);
      }
      // the stairs, walled in on both sides, rails round the wells up top
      for (const [a, c] of wells) {
        this._stairs(sx0, a, fx1, c, 'x', -1, D, FC, null, 0x5a5e62, { rails: false });
        for (const zz of [a - 0.08, c + 0.08]) {
          b.box((sx0 + fx1) / 2, (D + FC) / 2, zz, fx1 - sx0, FC - D, 0.16, 0x4a5058, { ao: 0.8 });
          this.world.addBox(sx0, D - 0.5, zz - 0.08, fx1, FC, zz + 0.08, { occlude: true, kind: 'wall' });
          // a handrail on the wall
          this._beam([fx1, D + 0.95, zz + (zz < (a + c) / 2 ? 0.12 : -0.12)], [sx0, FC + 0.95, zz + (zz < (a + c) / 2 ? 0.12 : -0.12)], 0.05, 0.05, 0x8a8a84);
          this._rail(sx0, zz, fx1, zz, FC);
        }
        // a lamp over the foot of each
        this.lamps.box(fx1 + 0.32, FC - 0.4, (a + c) / 2, 0.06, 0.18, 0.4, 0xfff0d0, { jitter: 0 });
      }
    }
    // windlasses, the anchor chain out through the hawse pipe
    for (const s of [-1, 1]) {
      b.cylinder(fx0 + 4, FC + 0.6, zc + s * 2.6, 0.7, 0.7, 1.2, 0x2a2e33, 10, { rz: Math.PI / 2 });
      b.box(fx0 + 4, FC + 0.2, zc + s * 2.6, 1.8, 0.4, 1.5, 0x3a3e42);
      this.world.addBoxC(fx0 + 4, FC + 0.6, zc + s * 2.6, 1.8, 1.2, 1.5, { occlude: false, kind: 'windlass' });
    }
    const hx = fx0 + 2.5;
    const hawse = new THREE.Vector3(hx, FC - 0.9, zc + halfAt(hx) + 0.05);
    b.cylinder(hawse.x, hawse.y, hawse.z - 0.05, 0.32, 0.32, 0.2, 0x1a1a1a, 10, { rx: Math.PI / 2 });
    const splash = new THREE.Vector3(fx0 - 6, WY, S.z1 + 10);
    const links = 60;
    for (let i = 0; i <= links; i++) {
      const p = hawse.clone().lerp(splash, i / links);
      p.y -= Math.sin((i / links) * Math.PI) * 0.8;
      b.box(p.x, p.y, p.z, 0.12, 0.2, 0.28, 0x2a2622, { rotY: i % 2 ? 0 : Math.PI / 2, jitter: 0.1 });
    }
    // on deck, the chain runs from the windlass to the pipe
    this._beam([fx0 + 4, FC + 0.1, zc + 2.6], [hx, FC + 0.1, zc + halfAt(hx) - 0.4], 0.14, 0.2, 0x2a2622);
    // swim to the chain and climb it, over the bulwark onto the forecastle
    this._climb({ x: splash.x + 0.5, y: WY - 1.3, z: splash.z - 0.8 }, { x: hawse.x, y: FC + 1.2, z: hawse.z - 0.3 }, { x: fx0 + 5, y: FC, z: zc + 5 }, 'the anchor chain', { rungs: false, base: { x: splash.x + 0.8, y: WY - 1.3, z: splash.z - 0.2 }, speed: 1.3 });
    // the anchor light on the forestay
    this.lamps.box(fx0 - 1, FC + 7, zc, 0.3, 0.3, 0.3, 0xfff6e0, { jitter: 0 });
    b.cylinder(fx0 - 1, FC + 3.5, zc, 0.08, 0.1, 7, 0x3b4046, 6);
    this.world.addBoxC(fx0 - 1, FC + 1, zc, 0.3, 2, 0.3, { occlude: false, kind: 'mast' });

    // ---- the accommodation block: enterable at deck level (a corridor, the crew mess and
    // a stair tower), the bridge on top
    const hx0 = S.house.x0, hx1 = S.house.x1, hz0 = S.hz0, hz1 = S.hz1;
    const top = S.bridge;
    const WT = 0.25;
    const ix0 = hx0 + WT, ix1 = hx1 - WT, iz0 = hz0 + WT, iz1 = hz1 - WT;
    const INNER = 0xc8c4b8, TRIM = 0x5a5e62;
    const doorX = hx0 + 1.4, fwdDoorZ = zc + 2.9;
    const shipDoor = { frame: TRIM, leaf: 0xa8a498, sill: 0.12, dogs: true };
    this._doorWall('x', hz0 + WT / 2, hx0, hx1, D, top - 0.25 - D, WT, TLG_WHITE, [{ c: doorX, w: 1.0, out: -1, hinge: 1 }], shipDoor);
    this._doorWall('x', hz1 - WT / 2, hx0, hx1, D, top - 0.25 - D, WT, TLG_WHITE, [{ c: doorX, w: 1.0, out: 1, hinge: 1 }], shipDoor);
    this._doorWall('z', hx0 + WT / 2, iz0, iz1, D, top - 0.25 - D, WT, TLG_WHITE, [{ c: fwdDoorZ, w: 1.0, out: -1, hinge: 1 }], shipDoor);
    this._doorWall('z', hx1 - WT / 2, iz0, iz1, D, top - 0.25 - D, WT, TLG_WHITE, []);
    // portholes and deck strakes outside; the lower row inside the rooms too
    const doorsAt = [doorX];
    for (let lvl = 0; lvl < 4; lvl++) {
      const wy = D + 1.8 + lvl * 3.0;
      for (let x = hx0 + 1.5; x < hx1 - 1; x += 2.4) {
        if (lvl === 0 && doorsAt.some((d) => Math.abs(d - x) < 1.1)) continue;
        this.batch.box(x, wy, hz0 - 0.02, 1.0, 0.9, 0.04, 0x1a2a34);
        this.batch.box(x, wy, hz1 + 0.02, 1.0, 0.9, 0.04, 0x1a2a34);
        if (lvl > 0 && r.chance(0.35)) this.lamps.box(x, wy, hz1 + 0.04, 0.9, 0.8, 0.02, 0xffd8a0, { jitter: 0 });
        if (lvl > 0 && r.chance(0.35)) this.lamps.box(x, wy, hz0 - 0.04, 0.9, 0.8, 0.02, 0xffd8a0, { jitter: 0 });
      }
      if (lvl < 3) {
        const sy = D + 3 * (lvl + 1);
        b.box((hx0 + hx1) / 2, sy, hz0 - 0.1, hx1 - hx0 + 0.4, 0.2, 0.2, 0xb8b4a8);
        b.box((hx0 + hx1) / 2, sy, hz1 + 0.1, hx1 - hx0 + 0.4, 0.2, 0.2, 0xb8b4a8);
        b.box(hx0 - 0.1, sy, (hz0 + hz1) / 2, 0.2, 0.2, hz1 - hz0, 0xb8b4a8);
        b.box(hx1 + 0.1, sy, (hz0 + hz1) / 2, 0.2, 0.2, hz1 - hz0, 0xb8b4a8);
      }
    }
    // a Guard stripe down the front
    b.box(hx0 - 0.02, (D + 3.1 + top) / 2, (hz0 + hz1) / 2, 0.04, top - D - 3.1, 1.4, TLG_RED);
    b.box(hx0 - 0.02, D + 1.45, (hz0 + hz1) / 2, 0.04, 2.9, 1.4, TLG_RED);

    // inside, deck level. A corridor across the front joins the three doors; aft of it
    // the stair lobby (port) and the crew mess.
    const TX0 = 36.3, FX0 = TX0 + 1.3, FX1 = FX0 + 5.0; // stair tower: landings and flights
    const zA0 = iz0, zA1 = iz0 + 1.2, zB1 = iz0 + 2.45; // its two lanes
    const LZ = zB1 + 0.1;                                 // the wall between the lobby/tower and the mess
    this._slab(ix0, iz0, ix1, iz1, D + 0.02, 0x5e564a, 'metal', 0.06, { top: 0x6a6052 });
    this._doorWall('z', 32.4, iz0, iz1, D, 2.9, 0.2, INNER, [{ c: (zA0 + zB1) / 2, w: 1.0, out: 0 }, { c: zc + 1.6, w: 1.1, out: 0 }], { frame: TRIM });
    this._doorWall('x', LZ, 32.5, TX0 - 0.1, D, 2.9, 0.2, INNER, []);
    this._doorWall('x', LZ, TX0 - 0.1, ix1, D, top - 0.25 - D, 0.2, INNER, []);
    // the ceiling over the rooms, with lights in it
    b.box((ix0 + ix1) / 2, D + 2.95, (LZ + 0.1 + iz1) / 2, ix1 - ix0, 0.1, iz1 - LZ - 0.1, 0xd8d4c8);
    b.box((ix0 + TX0 - 0.2) / 2, D + 2.95, (iz0 + LZ - 0.1) / 2, TX0 - 0.2 - ix0, 0.1, LZ - 0.1 - iz0, 0xd8d4c8);
    for (const [lx, lz2, len] of [[31.3, zc, 3.0], [34.6, zA1, 1.2], [35.6, zc - 0.2, 1.6], [35.6, zc + 3.4, 1.6], [40.6, zc + 1.6, 1.6]]) {
      this.lamps.box(lx, D + 2.88, lz2, lx < 32 ? 0.3 : len, 0.04, lx < 32 ? len : 0.3, 0xfff0d8, { jitter: 0 });
    }
    // portholes on the inside of the rooms
    for (const x of [33.9]) this.batch.box(x, D + 1.8, iz0 + 0.02, 1.0, 0.9, 0.04, 0x2a3a44);
    for (const x of [33.9, 36.3, 38.7, 41.1]) this.batch.box(x, D + 1.8, iz1 - 0.02, 1.0, 0.9, 0.04, 0x2a3a44);
    // the mess: two tables with their benches, the galley aft, crew lockers, a sofa
    for (const tz of [zc - 0.2, zc + 3.4]) {
      b.box(35.6, D + 0.74, tz, 3.4, 0.06, 0.9, 0x8a7a64);
      b.box(35.6, D + 0.36, tz, 0.2, 0.72, 0.5, 0x3a3e42);
      for (const s of [-1, 1]) {
        b.box(35.6, D + 0.44, tz + s * 0.8, 3.2, 0.06, 0.34, 0x6a5a48);
        b.box(35.6, D + 0.2, tz + s * 0.8, 0.12, 0.4, 0.2, 0x3a3e42);
      }
      this.world.addBoxC(35.6, D + 0.4, tz, 3.4, 0.8, 1.94, { occlude: false, kind: 'furniture' });
    }
    this._crateY(ix1 - 0.31, D, zc + 1.0, 'kitchen', -Math.PI / 2, 'kitchen');
    this._crateY(ix1 - 0.36, D, zc + 2.8, 'fridge', -Math.PI / 2, 'fridge');
    for (const x of [39.4, 40.1, 40.8]) this._crateY(x, D, iz1 - 0.26, 'locker', Math.PI, 'locker');
    b.box(42.2, D + 0.25, LZ + 0.55, 2.4, 0.5, 0.8, 0x4a3a34);
    b.box(42.2, D + 0.6, LZ + 0.2, 2.4, 0.7, 0.2, 0x4a3a34);
    this.world.addBoxC(42.2, D + 0.4, LZ + 0.55, 2.4, 0.8, 0.8, { occlude: false, kind: 'furniture' });
    // a notice board and the fire gear in the corridor
    b.box(32.28, D + 1.5, zc - 2.6, 0.04, 0.8, 1.2, 0x8a6a48);
    for (let k = 0; k < 4; k++) b.box(32.26, D + 1.35 + (k % 2) * 0.3, zc - 2.95 + k * 0.22, 0.02, 0.22, 0.18, 0xe8e4d8, { jitter: 0.1 });
    b.cylinder(ix0 + 0.2, D + 0.35, iz0 + 0.3, 0.1, 0.1, 0.6, 0xb8201a, 8);
    // lobby: a locker by the stairs
    this._crateY(33.4, D, LZ - 0.36, 'locker', Math.PI, 'locker');

    // the stair tower: four flights up to the bridge, in two lanes against the port side
    const lv = [D, D + (top - D) / 4, D + (top - D) / 2, D + (3 * (top - D)) / 4, top];
    const SC = 0x6a6e70;
    this._stairs(FX0, zA0, FX1, zA1, 'x', 1, lv[0], lv[1], null, SC);
    this._stairs(FX0, zA1, FX1, zB1, 'x', -1, lv[1], lv[2], null, SC);
    this._stairs(FX0, zA0, FX1, zA1, 'x', 1, lv[2], lv[3], null, SC);
    this._stairs(FX0, zA1, FX1, zB1, 'x', -1, lv[3], lv[4], null, SC);
    this._slab(FX1, zA0, ix1, zB1, lv[1], 0x5a5e62, 'metal', 0.2);
    this._slab(TX0, zA0, FX0, zB1, lv[2], 0x5a5e62, 'metal', 0.2);
    this._slab(FX1, zA0, ix1, zB1, lv[3], 0x5a5e62, 'metal', 0.2);
    // its forward wall above the lobby ceiling
    b.box(TX0 - 0.1, (D + 2.9 + top - 0.25) / 2, (zA0 + LZ - 0.1) / 2, 0.2, top - 0.25 - D - 2.9, LZ - 0.1 - zA0, INNER);
    this.world.addBox(TX0 - 0.2, D + 2.9, zA0, TX0, top - 0.25, LZ - 0.1, { occlude: true, kind: 'wall' });
    // a store under the second flight, its door on the lobby
    b.box((FX0 + ix1) / 2, D + 1.4, (zA1 + zB1) / 2 + 0.03, ix1 - FX0, 2.8, zB1 - zA1 - 0.06, INNER);
    this.world.addBox(FX0, D, zA1 + 0.04, ix1, D + 2.8, zB1, { occlude: true, kind: 'wall' });
    b.box(FX0 - 0.02, D + 1.02, (zA1 + zB1) / 2 + 0.03, 0.04, 2.0, 0.9, 0x8a8a80);
    b.box(FX0 - 0.05, D + 1.0, (zA1 + zB1) / 2 + 0.36, 0.04, 0.05, 0.12, 0x2a2a2a);
    // lamps at each landing
    for (let k = 1; k <= 3; k++) {
      const lx = k % 2 ? ix1 - 0.03 : TX0 + 0.03;
      this.lamps.box(lx, lv[k] + 2.2, (zA0 + zB1) / 2, 0.04, 0.16, 0.5, 0xfff0d8, { jitter: 0 });
    }
    this.lamps.box(TX0 + 0.03, D + 2.2, (zA0 + zB1) / 2 - 0.6, 0.04, 0.16, 0.5, 0xfff0d8, { jitter: 0 });
    this.world.interiors.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1, surface: 'metal' });

    // ---- the bridge deck: wings out over both sides, the stairwell railed, and a
    // wheelhouse with windows all round and a door on each side and aft
    const bz0 = S.z0 + 0.4, bz1 = S.z1 - 0.4;
    const bslab = (x0, z0, x1, z1) => this._slab(x0, z0, x1, z1, top, 0x6a6862, 'metal', 0.25, { top: 0x5a5852 });
    bslab(hx0, bz0, hx1, zA0);
    bslab(hx0, zB1, hx1, bz1);
    bslab(hx0, zA0, FX0, zB1);
    bslab(ix1, zA0, hx1, zB1);
    this._rail(hx0, bz0, hx1, bz0, top);
    this._rail(hx0, bz1, hx1, bz1, top);
    this._rail(hx1, bz0, hx1, bz1, top);
    this._rail(hx0, bz0, hx0, bz1, top);
    this._rail(FX0, zA0, ix1, zA0, top);
    this._rail(FX0, zB1, ix1, zB1, top);
    this._rail(ix1, zA0, ix1, zB1, top);
    this._rail(FX0, zA0, FX0, zA1, top);
    const wx0 = hx0 + 0.8, wx1 = FX0 - 0.4, wz0 = zB1 + 0.1, wz1 = 2 * zc - wz0, wh = 2.8;
    const band = { y0: 1.0, y1: 2.3, glass: 0x1a2a34 };
    const whDoor = { band, frame: TRIM, leaf: 0xb8b4a8, sill: 0.1, dogs: true, occlude: false };
    const pDoor = wx0 + 3.9;
    this._doorWall('x', wz0, wx0 - 0.1, wx1 + 0.1, top, wh, 0.2, TLG_WHITE, [{ c: pDoor, w: 0.95, out: -1, hinge: -1 }], whDoor);
    this._doorWall('x', wz1, wx0 - 0.1, wx1 + 0.1, top, wh, 0.2, TLG_WHITE, [{ c: pDoor, w: 0.95, out: 1, hinge: -1 }], whDoor);
    this._doorWall('z', wx0, wz0 + 0.1, wz1 - 0.1, top, wh, 0.2, TLG_WHITE, [], whDoor);
    this._doorWall('z', wx1, wz0 + 0.1, wz1 - 0.1, top, wh, 0.2, TLG_WHITE, [{ c: zc - 1.6, w: 0.95, out: 1, hinge: 1 }], whDoor);
    b.box((wx0 + wx1) / 2, top + wh + 0.12, (wz0 + wz1) / 2, wx1 - wx0 + 0.8, 0.25, wz1 - wz0 + 0.8, 0xb8b4a8);
    this.world.addBox(wx0 - 0.4, top + wh, wz0 - 0.4, wx1 + 0.4, top + wh + 0.25, wz1 + 0.4, { collide: false });
    this.world.interiors.push({ x0: wx0, z0: wz0, x1: wx1, z1: wz1, surface: 'metal' });
    this.lamps.box((wx0 + wx1) / 2, top + wh - 0.03, (wz0 + wz1) / 2, 1.2, 0.04, 0.3, 0xfff0d8, { jitter: 0 });
    // the helm console, the chart table, and the master's safe
    b.box(wx0 + 0.7, top + 0.6, (wz0 + wz1) / 2, 0.8, 1.2, 4, 0x2a2e33);
    this.world.addBoxC(wx0 + 0.7, top + 0.6, (wz0 + wz1) / 2, 0.8, 1.2, 4, { occlude: false, kind: 'furniture' });
    this.lamps.box(wx0 + 0.9, top + 1.21, (wz0 + wz1) / 2, 0.3, 0.02, 1.2, 0x3a8a6a, { jitter: 0 });
    b.cylinder(wx0 + 1.4, top + 1.0, (wz0 + wz1) / 2, 0.35, 0.35, 0.06, 0x3a2a1e, 12, { rz: Math.PI / 2 });
    b.box(wx0 + 2.5, top + 0.45, wz1 - 0.9, 2.2, 0.9, 1.2, 0x5a4a38);
    this.world.addBoxC(wx0 + 2.5, top + 0.45, wz1 - 0.9, 2.2, 0.9, 1.2, { occlude: false, kind: 'furniture' });
    this.sites.safe = this._crateY(wx1 - 0.4, top, zc + 1.6, 'guardlocker', -Math.PI / 2, 'guard', null, 'Master\'s Safe');
    this.sites.bridgeLocker = this._crateY(wx0 + 2.0, top, wz0 + 0.45, 'military', 0, 'military');
    // the mast with the radar and a Guard flag
    b.cylinder((wx0 + wx1) / 2, top + wh + 3, (wz0 + wz1) / 2, 0.15, 0.2, 6, 0xd8d4c8, 6);
    b.box((wx0 + wx1) / 2, top + wh + 5.5, (wz0 + wz1) / 2, 0.3, 0.2, 3.6, 0x2a2a2a);
    b.box((wx0 + wx1) / 2, top + wh + 4.6, (wz0 + wz1) / 2 + 0.9, 0.02, 1.0, 1.6, TLG_RED);
    this.lamps.box((wx0 + wx1) / 2, top + wh + 6.2, (wz0 + wz1) / 2, 0.2, 0.2, 0.2, 0xff3020, { jitter: 0 });
    // the funnel aft of the wheelhouse, Guard red with a white band
    b.box(hx1 - 2.4, top + 3.5, zc, 3.4, 7, 4.4, 0x2a2e33, { ao: 0.8 });
    b.box(hx1 - 2.4, top + 4.5, zc, 3.46, 1.6, 4.46, TLG_RED);
    b.box(hx1 - 2.4, top + 5.5, zc, 3.46, 0.4, 4.46, TLG_WHITE);
    b.box(hx1 - 2.4, top + 7.1, zc, 3.0, 0.3, 4.0, 0x1a1a1a);
    this.world.addBoxC(hx1 - 2.4, top + 3.5, zc, 3.4, 7, 4.4, { occlude: true, kind: 'funnel' });
    this.sites.bridge = new THREE.Vector3((wx0 + wx1) / 2, top, (wz0 + wz1) / 2);
    this.map.buildings.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, kind: 'house' });

    // ---- the gangway down the starboard side to a landing at the water
    const gy0 = WY + 0.8;
    this._stairs(gwX - 14, S.z1 + 0.05, gwX, S.z1 + 1.5, 'x', 1, gy0, D, null, 0x7a7a74);
    this._slab(gwX - 17, S.z1 + 0.05, gwX - 14, S.z1 + 2.6, gy0, 0x6a6a64, 'metal', 0.25);
    this._rail(gwX - 17, S.z1 + 2.6, gwX - 14, S.z1 + 2.6, gy0);
    this._rail(gwX - 17, S.z1 + 0.05, gwX - 17, S.z1 + 2.6, gy0);
    // a landing at the top, outside the bulwark, and the gap onto the deck
    this._slab(gwX, S.z1 - 0.7, gwX + 2.4, S.z1 + 1.5, D, DECK_COL, 'metal', 0.2, { top: DECK_DARK });
    this._rail(gwX + 2.4, S.z1, gwX + 2.4, S.z1 + 1.5, D);
    this._rail(gwX, S.z1 + 1.5, gwX + 2.4, S.z1 + 1.5, D);
    this.sites.gangwayFoot = new THREE.Vector3(gwX - 15.5, gy0, S.z1 + 1.3);
    this.sites.gangwayTop = new THREE.Vector3(gwX + 1.2, D, S.z1 - 1.2);
    this.sites.boatLanding = new THREE.Vector3(gwX - 15.5, WY, S.z1 + 4.6);
    // a ladder from the landing into the water for swimmers
    this._climb({ x: gwX - 16, y: WY - 1.3, z: S.z1 + 2.9 }, { x: gwX - 16, y: gy0 + 0.1, z: S.z1 + 2.9 }, { x: gwX - 15.5, y: gy0, z: S.z1 + 1.3 }, 'the gangway landing', { base: { x: gwX - 16, y: WY - 1.3, z: S.z1 + 3.6 } });
    // the pilot ladder over the port side, out of sight of the harbor
    this._climb({ x: pilotX, y: WY - 1.3, z: S.z0 - 0.5 }, { x: pilotX, y: D + 0.2, z: S.z0 - 0.3 }, { x: pilotX, y: D, z: S.z0 + 1.6 }, 'the pilot ladder', { base: { x: pilotX, y: WY - 1.3, z: S.z0 - 1.3 }, color: 0x8a7458 });
    this.sites.pilotLadder = new THREE.Vector3(pilotX, WY, S.z0 - 3.2);

    // ---- the lifeboat on its ramp at the stern, clear of the house
    const lbx = S.x1 - 4, lbz = S.z0 + 2.2;
    b.box(lbx, D + 1.6, lbz, 7.5, 2.2, 2.6, 0xe06a1a, { ao: 1, top: 0xe06a1a });
    b.box(lbx, D + 2.8, lbz, 5, 0.6, 2.0, 0xe06a1a);
    b.box(lbx + 3.9, D + 1.0, lbz, 1.2, 0.3, 2.8, 0x5a5e62, { rotY: 0 });
    for (const s of [-1, 1]) b.box(lbx, D + 0.25, lbz + s * 1.0, 7.0, 0.5, 0.14, 0x5a5e62);
    this.world.addBoxC(lbx, D + 1.6, lbz, 7.5, 3.2, 2.6, { occlude: true, kind: 'lifeboat' });
    this.sites.lifeboat = new THREE.Vector3(lbx - 4.4, D, lbz + 0.2);
    this.uses.push({ kind: 'lifeboat', pos: new THREE.Vector3(lbx - 4.0, D + 1.3, lbz), label: 'Launch the lifeboat' });

    // ---- lights: floods on the house front and the foremast, red and green sidelights
    this.lamps.box(hx0 - 0.3, top - 1, hz0 + 1, 0.5, 0.4, 0.5, 0xfff0d0, { jitter: 0 });
    this.lamps.box(hx0 - 0.3, top - 1, hz1 - 1, 0.5, 0.4, 0.5, 0xfff0d0, { jitter: 0 });
    this.lamps.box(hx0 + 0.5, top + 0.6, bz0 + 0.1, 0.16, 0.16, 0.16, 0xff2a1a, { jitter: 0 });
    this.lamps.box(hx0 + 0.5, top + 0.6, bz1 - 0.1, 0.16, 0.16, 0.16, 0x2aff5a, { jitter: 0 });
    this.floods.push({ pos: new THREE.Vector3(hx0 - 0.4, top - 1, zc), target: new THREE.Vector3(-10, D, zc) });
    this.lamps.box(S.x0 + 8.45, FC + 6.4, zc, 0.3, 0.4, 0.6, 0xfff0d0, { jitter: 0 });
    this.floods.push({ pos: new THREE.Vector3(S.x0 + 8.7, FC + 6.4, zc), target: new THREE.Vector3(S.x0 + 34, D, zc) });

    // ---- the Guard aboard: posts and a deck patrol
    const P = (x, y, z, facing) => this.ship.posts.push({ x, y, z, facing });
    P(gwX + 1.2, D, S.z1 - 1.8, Math.PI);
    P(fx1 - 2.5, FC, zc + 4, -Math.PI / 2);
    P(hx0 + 1.4, top, bz0 + 0.8, -Math.PI / 2);
    P(S.x1 - 2.5, D, zc, Math.PI / 2);
    P(-10, S.hold, zc + 3, 0);
    P(13, S.hold, S.hz1 - 1.2, Math.PI);
    // up one side deck, across aft of the containers, down the other and back again
    // (never across a hold)
    const sb = S.z1 - 2.0, pb = S.z0 + 2.2, ax = 28.6;
    this.ship.routes.push([
      new THREE.Vector3(-42, D, sb), new THREE.Vector3(ax, D, sb), new THREE.Vector3(ax, D, pb), new THREE.Vector3(-42, D, pb), new THREE.Vector3(ax, D, pb), new THREE.Vector3(ax, D, sb),
    ]);
    this.ship.routes.push([
      new THREE.Vector3(-12, S.hold, S.hz0 + 1.2), new THREE.Vector3(-2, S.hold, S.hz1 - 1.2), new THREE.Vector3(-18, S.hold, S.hz1 - 1.2),
    ]);
    this.sites.shipCenter = new THREE.Vector3(-5, D, zc);
  }

  // What's down in each hold. The aft one has the cage.
  _holdCargo(h, i) {
    const r = this.rng, S = SHIP, y = S.hold, b = this.batch;
    const zc = (S.hz0 + S.hz1) / 2;
    if (i < 2) {
      // stacks of boxes and lashed crates, with lanes to walk
      for (let k = 0; k < 2; k++) {
        const cx = h.x0 + 6.5 + k * 7.5 + (i === 1 ? 0.5 : 0);
        if (cx + 3 > h.x1) continue;
        this._box20(cx, S.hz0 + 1.8, y, r.int(1, 2));
        this._box20(cx, S.hz1 - 1.8, y, r.int(1, 3));
      }
      // Experimental equipment in crates stencilled for the Natchez labs
      for (let k = 0; k < 3; k++) {
        const cx = h.x0 + 3 + k * 5.5;
        if (cx > h.x1 - 2) continue;
        b.box(cx, y + 0.9, zc + 0.3, 2.2, 1.8, 1.8, 0x3d444a, { ao: 1, top: 0x2a2e33 });
        b.box(cx, y + 0.9, zc - 0.62, 1.8, 0.3, 0.02, 0xd8c84a);
        b.box(cx, y + 1.35, zc - 0.62, 1.2, 0.15, 0.02, TLG_RED);
        this.world.addBoxC(cx, y + 0.9, zc + 0.3, 2.2, 1.8, 1.8, { occlude: true, kind: 'crate' });
      }
      this._crateY(h.x1 - 1.5, y, zc - 2.5, 'military', 0, 'military');
      this._crateY(h.x0 + 2.2, y, S.hz1 - 0.8, 'crate', Math.PI, 'crate');
      if (i === 1) {
        // cages with what the labs sent: things that used to be people
        for (let k = 0; k < 2; k++) {
          const cx = h.x1 - 5 - k * 3.4, cz = S.hz1 - 2;
          this._cage(cx, cz, y, 2.8, 2.4);
          this.ship.caged = this.ship.caged || [];
          this.ship.caged.push(new THREE.Vector3(cx, y, cz));
        }
      }
      return;
    }
    // Hold 3: the Guard's cage, with the prototype case and the lockers inside
    const vx0 = h.x0 + 2, vx1 = h.x1 - 2, vz0 = S.hz0 + 1.2, vz1 = zc + 2.4;
    const chain = (x0, z0, x1, z1) => {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const len = alongX ? x1 - x0 : z1 - z0;
      b.box((x0 + x1) / 2, y + 1.4, (z0 + z1) / 2, alongX ? len : 0.04, 2.8, alongX ? 0.04 : len, 0x6a6e70, { jitter: 0.02 });
      for (let s = 0; s <= len + 0.01; s += 2) b.box(alongX ? x0 + s : x0, y + 1.5, alongX ? z0 : z0 + s, 0.1, 3.0, 0.1, 0x3a3e42);
      this.world.addBox(Math.min(x0, x1) - 0.06, y, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, y + 3.0, Math.max(z0, z1) + 0.06, { occlude: false, kind: 'cage' });
    };
    const gx = (vx0 + vx1) / 2;
    chain(vx0, vz1, gx - 0.8, vz1);
    chain(gx + 0.8, vz1, vx1, vz1);
    chain(vx0, vz0, vx0, vz1);
    chain(vx1, vz0, vx1, vz1);
    // the gate: a locked leaf across the gap, taken out of the world when it opens
    const gate = new THREE.Group();
    const gm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.06), new THREE.MeshLambertMaterial({ color: 0x7a7e80 }));
    gm.position.set(0.8, 1.4, 0);
    gate.add(gm);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.14), new THREE.MeshLambertMaterial({ color: 0x9a1e18 }));
    lock.position.set(1.45, 1.2, 0.05);
    gate.add(lock);
    gate.position.set(gx - 0.8, y, vz1);
    this.scene.add(gate);
    const gateBox = this.world.addBox(gx - 0.8, y, vz1 - 0.1, gx + 0.8, y + 3.0, vz1 + 0.1, { occlude: false, kind: 'gate' });
    this.sites.vault = { gate, box: gateBox, pos: new THREE.Vector3(gx, y + 1.3, vz1 + 0.2), inside: new THREE.Vector3(gx, y, (vz0 + vz1) / 2) };
    // inside: the prototype case on a pallet, Guard lockers along the back
    b.box(gx, y + 0.15, (vz0 + vz1) / 2, 1.6, 0.3, 1.4, 0x7a5c40);
    this.sites.prototype = new THREE.Vector3(gx, y + 0.3, (vz0 + vz1) / 2);
    for (let k = 0; k < 3; k++) this.sites['vaultLocker' + k] = this._crateY(vx0 + 1.2 + k * 1.6, y, vz0 + 0.4, 'guardlocker', 0, 'guard', null, 'Guard Weapons Locker');
    this._crateY(vx1 - 1.2, y, vz0 + 0.5, 'military', 0, 'guard');
    this._crateY(vx1 - 0.5, y, (vz0 + vz1) / 2 + 0.8, 'military', -Math.PI / 2, 'guard');
    // outside the cage: generators and a desk with the watch log
    b.box(h.x1 - 1.4, y + 0.7, S.hz1 - 1.2, 1.8, 1.4, 1.2, 0x3d444a, { ao: 1 });
    this.glow.box(h.x1 - 1.4, y + 1.1, S.hz1 - 1.82, 0.12, 0.08, 0.02, 0x40ff60, { jitter: 0 });
    this.world.addBoxC(h.x1 - 1.4, y + 0.7, S.hz1 - 1.2, 1.8, 1.4, 1.2, { occlude: false, kind: 'junk' });
    this._crateY(h.x0 + 1.6, y, S.hz1 - 0.5, 'desk', Math.PI, 'desk');
    // the sea chest: a grated hatch in the tank top that opens onto the sea below
    const scx = h.x0 + 1.8, scz = zc + 4.2;
    b.box(scx, y + 0.02, scz, 1.2, 0.04, 1.2, 0x2a2622);
    for (let k = -2; k <= 2; k++) b.box(scx + k * 0.22, y + 0.05, scz, 0.05, 0.04, 1.1, 0x5a5048);
    this.sites.seaChest = { top: new THREE.Vector3(scx, y, scz), bottom: new THREE.Vector3(scx, S.keel - 2.3, scz), hull: new THREE.Vector3(scx, S.keel, scz) };
    // under the hull: the grate a diver cuts through
    b.box(scx, S.keel - 0.05, scz, 1.4, 0.1, 1.4, 0x1a1a1a);
    for (let k = -2; k <= 2; k++) b.box(scx + k * 0.25, S.keel - 0.12, scz, 0.06, 0.06, 1.3, 0x4a4a46);
  }

  // A 20-foot box, stacked.
  _box20(cx, cz, y, n = 1) {
    const L = 6.1, W2 = 2.44, H = 2.6;
    for (let k = 0; k < n; k++) {
      const col = this.rng.pick(CONT);
      this.batch.box(cx, y + k * H + H / 2, cz, L, H, W2, col, { ao: 1, jitter: 0.08 });
    }
    this.world.addBoxC(cx, y + (n * H) / 2, cz, L, n * H, W2, { occlude: true, kind: 'container' });
  }

  _cage(cx, cz, y, w, d) {
    const b = this.batch;
    for (const [x0, z0, x1, z1] of [[cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2], [cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2], [cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2], [cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2]]) {
      const alongX = Math.abs(x1 - x0) > 0.01;
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let s = 0; s <= len + 0.01; s += 0.2) b.box(alongX ? x0 + s : x0, y + 1.2, alongX ? z0 : z0 + s, 0.04, 2.4, 0.04, 0x5a5e62, { jitter: 0.02 });
    }
    b.box(cx, y + 2.42, cz, w, 0.06, d, 0x3a3e42);
    this.world.addBox(cx - w / 2, y, cz - d / 2, cx + w / 2, y + 2.45, cz + d / 2, { occlude: false, kind: 'cage' });
  }

  // ---- the Magnolia, alongside (only when the crew brings her) --------------------------------

  _magnolia() {
    const S = SHIP;
    const my = WY + 1.1;
    // her own model from the hub, turned to lie along the Covenant's starboard side:
    // her bow (-z aboard) points west, her starboard (+x aboard) faces the ship
    const cx = -12, cz = S.z1 + 2.35 + 4.35;
    const W = (lx, lz) => ({ x: cx + lz, z: cz - lx });
    const rect = (lx0, lz0, lx1, lz1) => {
      const a = W(lx0, lz0), c = W(lx1, lz1);
      return [Math.min(a.x, c.x), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.z, c.z)];
    };
    const solid = (lx0, lz0, lx1, lz1, h, kind = 'wall') => {
      const [x0, z0, x1, z1] = rect(lx0, lz0, lx1, lz1);
      this.world.addBox(x0, my, z0, x1, my + h, z1, { occlude: h > 1.5, kind });
    };
    const g = this.magnoliaModel;
    if (g) {
      g.position.set(cx, my, cz);
      g.rotation.y = Math.PI / 2;
      // her bulbs light the work deck under the awning, the way they do at home
      const bulb = new THREE.PointLight(0xffc27a, 9, 13, 1.6);
      bulb.position.set(0, 2.4, -7.6);
      g.add(bulb);
      this.scene.add(g);
      // what you bump into aboard her, turned into the harbor's frame
      for (const b of g.userData.boxes) {
        const [x0, z0, x1, z1] = rect(b.x0, b.z0, b.x1, b.z1);
        this.world.addBox(x0, my + b.y0, z0, x1, my + b.y1, z1, { occlude: b.occlude, collide: b.collide, kind: b.kind });
      }
      for (const f of g.userData.floors) {
        const [x0, z0, x1, z1] = rect(f.x0, f.z0, f.x1, f.z1);
        this.world.addFloor(x0, z0, x1, z1, f.surface || 'wood', my + (f.y || 0));
      }
      for (const r of g.userData.interiors) {
        const [x0, z0, x1, z1] = rect(r.x0, r.z0, r.x1, r.z1);
        this.world.interiors.push({ x0, z0, x1, z1, surface: r.surface });
      }
    } else {
      // no hub to borrow her from (a test harness): a plain stand-in
      const [x0, z0, x1, z1] = rect(-5, -15.6, 5, 16);
      this.batch.box((x0 + x1) / 2, my - 0.8, (z0 + z1) / 2, x1 - x0, 1.6, z1 - z0, 0x2e3a30, { ao: 1 });
      solid(-3.4, -1.1, 3.4, 8.1, 3.0);
      const [sx0, sz0, sx1, sz1] = rect(-3.3, -1, 3.3, 8);
      this.batch.box((sx0 + sx1) / 2, my + 1.5, (sz0 + sz1) / 2, sx1 - sx0, 3, sz1 - sz0, 0xd6cfbd, { ao: 0.8 });
      for (const [lx0, lz0, lx1, lz1] of [[-4.35, -12, 4.35, 13.6], [-3.15, -14.1, 3.15, -12], [-1.7, -15.4, 1.7, -14.1]]) {
        const [fx0, fz0, fx1, fz1] = rect(lx0, lz0, lx1, lz1);
        this.world.addFloor(fx0, fz0, fx1, fz1, 'wood', my);
      }
    }
    const [hx0, hz0, hx1, hz1] = rect(-5, -16, 5, 16.5);
    this.world.addBox(hx0, WY - 2.5, hz0, hx1, my - 0.05, hz1, { occlude: true, kind: 'hull' });
    // (clear of her awning posts, the work-deck benches and the Texas deck posts)
    const ladders = [-6.6, 10.9];
    const rail = (lx0, lz0, lx1, lz1) => solid(lx0, lz0, lx1, lz1, 1.05, 'rail');
    // starboard rail, broken where the boarding ladders hook over
    let lz = -12;
    for (const lzL of ladders) { rail(4.45, lz, 4.65, lzL - 0.7); lz = lzL + 0.7; }
    rail(4.45, lz, 4.65, 13.8);
    rail(-4.65, -12, -4.45, 13.8);
    rail(-4.65, 13.8, 4.65, 14.0);
    rail(-3.4, -14.2, 3.4, -14.0);
    rail(-1.9, -15.6, 1.9, -15.4);
    for (const s2 of [-1, 1]) {
      rail(s2 > 0 ? 3.15 : -3.35, -14.1, s2 > 0 ? 3.35 : -3.15, -12);
      rail(s2 > 0 ? 1.7 : -1.9, -15.4, s2 > 0 ? 1.9 : -1.7, -14.1);
    }
    // boarding ladders the crew throws up the Covenant's side
    for (const lzL of ladders) {
      const b = W(3.9, lzL), top = { x: b.x, y: S.deck + 0.2, z: S.z1 - 0.2 };
      this._climb({ x: b.x, y: my, z: b.z - 0.3 }, top, { x: b.x, y: S.deck, z: S.z1 - 1.6 }, 'the boarding ladder', { base: { x: b.x, y: my, z: b.z + 0.2 }, color: 0x6a5a48 });
    }
    const spawn = W(1.5, -6.8);
    const mid = W(0, 2);
    this.sites.magnolia = { deck: new THREE.Vector3(spawn.x, my, spawn.z), pos: new THREE.Vector3(mid.x, my, mid.z), y: my, ally: [W(0.5, -5.2), W(0.5, -8.6)].map((p) => new THREE.Vector3(p.x, my, p.z)) };
  }

  // ---- under the water ------------------------------------------------------------------------

  _seafloor() {
    const H = HARBOR_HALF + 60, n = 70;
    const g = new THREE.PlaneGeometry(H * 2, H * 2, n, n).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = [];
    const c1 = new THREE.Color(0x4a4a38), c2 = new THREE.Color(0x3a4034);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = seabed(x, z) - 0.05;
      p.setY(i, y);
      const c = c1.clone().lerp(c2, (Math.sin(x * 0.1) * Math.cos(z * 0.13) + 1) / 2);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.y = 0;
    this.scene.add(m);
    // rocks, weed, a sunk car and a Guard crate on the bottom by the ship
    const r = this.rng;
    const extra = new Batcher();
    for (let i = 0; i < 120; i++) {
      const x = r.range(-150, 150), z = r.range(-160, -30);
      if (x < -40 && z > -64) continue;
      const y = seabed(x, z);
      if (r.chance(0.5)) extra.ico(x, y, z, r.range(0.4, 1.4), r.pick([0x3a3a30, 0x4a463a, 0x2e342a]), 0.6);
      else for (let k = 0; k < 4; k++) extra.box(x + r.range(-0.5, 0.5), y + 0.6, z + r.range(-0.5, 0.5), 0.06, r.range(0.6, 1.8), 0.14, r.pick([0x2a4a2a, 0x3a5a2a, 0x4a5a2a]), { rotY: r.range(0, 3) });
    }
    extra.box(30, seabed(30, -60) + 0.7, -60, 4.2, 1.4, 1.8, 0x5a3a2a, { rotY: 0.7 });
    extra.box(-2, seabed(-2, -135) + 0.4, -135, 1.2, 0.8, 1.0, 0x3d444a, { rotY: 0.3 });
    const em = extra.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(em);
  }

  // ---- ways home -------------------------------------------------------------------------------

  _docksHarbor() {
    // your skiff comes in on the beach; a second boat waits at the end of the breakwater
    const skiff = (x, z, yaw, insertion, name, water) => {
      const y = this.world.heightAt(x, z, 2) ?? 0;
      this.batch.box(x + 1.8, WY + 0.2, z - 1.5, 1.5, 0.5, 4.6, 0x3a4a3a, { ao: 1, rotY: yaw, top: 0x2a2a24 });
      this.batch.box(x + 1.8, WY + 0.5, z - 1.5, 1.6, 0.1, 4.7, 0x5a3a2a, { ao: 1, rotY: yaw });
      const lantern = new THREE.Vector3(x - 0.6, y + 2.2, z);
      this.batch.box(lantern.x, y + 1.1, lantern.z, 0.1, 2.2, 0.1, C.wood);
      this.map.docks.push({ x, z, insertion });
      return { name, center: new THREE.Vector3(x, y, z), radius: 2.6, lantern, spawn: new THREE.Vector3(x + 0.4, y, z + 3), yaw: yaw + Math.PI, facing: yaw, insertion, water };
    };
    const beachZ = -29;
    this.docks = [
      skiff(-120, beachZ, 0, true, 'Your Skiff'),
      skiff(150, -54, Math.PI / 2, false, 'Breakwater Skiff'),
    ];
    // extraction by boat: out past the harbor mouth
    this.sites.openWater = new THREE.Vector3(40, WY, -170);
  }

  // Far off: the barrier islands, an oil platform, the sweep of the coast.
  _vista() {
    const r = this.rng;
    const cityBatch = this.batch;
    this.batch = new Batcher();
    // a low line of islands and dead trees across the Gulf
    for (let i = 0; i < 40; i++) {
      const a = r.range(-2.6, -0.5), d = r.range(260, 420);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      this.batch.ico(x, WY - 0.6, z, r.range(8, 22), r.pick([0x3a4030, 0x444a36, 0x2e3428]), 0.12);
      if (r.chance(0.5)) this.batch.cone(x + r.range(-4, 4), WY + 3, z + r.range(-4, 4), r.range(1.5, 3), r.range(6, 11), 0x263022);
    }
    // an oil platform on the horizon, the harbor's reason for being
    const px = -210, pz = -330;
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) this.batch.box(px + dx, 6, pz + dz, 1.4, 16, 1.4, 0x3a3a38);
    this.batch.box(px, 14.5, pz, 18, 2.5, 18, 0x4a4a46);
    this.batch.box(px + 3, 19, pz - 2, 8, 6, 8, 0x5a5a56);
    this.batch.box(px - 5, 30, pz + 4, 1.2, 28, 1.2, 0x5a5a56);
    this.batch.box(px + 8, 22, pz + 6, 10, 0.8, 0.8, 0x5a5a56, { rotY: 0.6 });
    // the coast running away east and west, low and green
    for (let i = 0; i < 30; i++) {
      const x = r.range(-600, 600), z = r.range(190, 320);
      this.batch.ico(x, 0, z, r.range(10, 26), r.pick([0x2e3428, 0x343a2c]), 0.25);
    }
    this.horizon = this.batch;
    this.batch = cityBatch;
  }
}

// Depth of the bottom at (x, z): the beach shelves gently, the harbor basin is dredged,
// and it drops off past the breakwater where the Covenant rides.
export function seabed(x, z) {
  if (z > QUAY_Z + 12) return -1;
  let y = -9.5;
  if (x < -40) {
    // along the beach: the sand slope, then a gentle shelf
    const beach = z > -64 ? (-4.4 * (-10 - z)) / 54 : -4.4 - (-64 - z) * 0.09;
    y = Math.max(beach, -12);
    const k = THREE.MathUtils.smoothstep(x, -52, -40);
    y = y * (1 - k) + -9.5 * k;
  }
  const off = THREE.MathUtils.smoothstep(-z, 70, 100);
  y = y * (1 - off) + -17 * off;
  y += Math.sin(x * 0.07) * 0.4 + Math.cos(z * 0.09) * 0.3;
  return y;
}
