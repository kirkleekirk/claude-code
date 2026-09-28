import * as THREE from 'three';
import { Environment } from '../world/Environment.js';
import { Batcher } from '../world/Batcher.js';
import { World } from '../world/World.js';
import { grimeTexture } from '../world/Textures.js';

// The Magnolia: a beached sternwheeler at the edge of the flood, and home.
// Built as a small walkable level: the open work deck under an awning at the
// bow, the salon amidships, and the aft deck by the paddle wheel. Every
// station is a physical object with a spot the camera settles into when you
// use it, so the same layout works when you stand at the bench in VR.
//
//   bow = -z, stern = +z, port = -x, starboard = +x. The deck is at y = 0.

const WHITE = 0xd6cfbd, WHITE_D = 0xb8b09c, TRIM = 0x7a2e24, GREEN = 0x2e3a30, DECK = 0x8e6c4a, DECK_D = 0x6e5238;
const WOOD = 0x5a4330, WOOD_L = 0x8a6a48, IRON = 0x2a2c2e, BRASS = 0xb08d3a, CANVAS = 0x6e6450;

export const WATER_Y = -1.1;

export class Magnolia {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 900);
    this.scene.add(this.camera);
    this.env = new Environment(this.scene, {
      mastDir: new THREE.Vector3(0.55, 0, -1), shadows: true, fireflies: true, mood: 'dusk', waterY: WATER_Y,
      mist: [[WATER_Y + 0.25, 0.45], [WATER_Y + 0.7, 0.3]],
    });
    this.env.setTime(18.45);
    this.world = new World(40);
    this.b = new Batcher();
    this.glow = new Batcher();
    this.stations = [];
    this.lights = [];
    this._hull();
    this._deck();
    this._salon();
    this._upperworks();
    this._awning();
    this._paddlewheel();
    this._workDeck();
    this._salonInterior();
    this._aftDeck();
    this._skiff();
    this._surroundings();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grimeTexture() });
    this.mesh = this.b.build(mat);
    this.scene.add(this.mesh);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.scene.add(this.glow.build(this.glowMat));
    this._board();
    this._lights();
    this.spawn = { pos: new THREE.Vector3(0, 0, -2.6), yaw: 0 };
    this.t = 0;
  }

  // ---- helpers -----------------------------------------------------------------------

  solid(cx, cy, cz, sx, sy, sz, color, opts = {}) {
    this.b.box(cx, cy, cz, sx, sy, sz, color, opts);
    if (opts.collide !== false) this.world.addBoxC(cx, cy, cz, sx, sy, sz, { occlude: false, kind: opts.kind || 'wall' });
  }

  // A station: something you walk up to and use.
  //   center: where it stands; face: unit vector from the station toward where you stand to use it
  station(id, label, center, face, size, opts = {}) {
    const [sx, sy, sz] = size;
    const hit = {
      x0: center.x - sx / 2 - 0.05, x1: center.x + sx / 2 + 0.05,
      y0: 0, y1: sy + 0.3,
      z0: center.z - sz / 2 - 0.05, z1: center.z + sz / 2 + 0.05,
    };
    // the camera settles `dist` back from what's on the bench, at `eye` height;
    // the hub slides it sideways so the station sits beside its panel
    const eye = opts.eye ?? 1.45, dist = opts.dist ?? 1.1;
    const look = opts.look ? opts.look.clone() : opts.anchor ? opts.anchor.pos.clone().setY(opts.anchor.pos.y + (opts.lookUp ?? 0.08)) : new THREE.Vector3(center.x, opts.lookY ?? 0.95, center.z);
    const pos = new THREE.Vector3(look.x + face.x * dist, eye, look.z + face.z * dist);
    const s = { id, label, center: center.clone(), face: face.clone(), hit, view: { pos, look }, anchor: opts.anchor || null, verb: opts.verb || 'Use', pivot: !!opts.pivot };
    this.stations.push(s);
    return s;
  }

  // ---- the boat ------------------------------------------------------------------------

  _hull() {
    const b = this.b;
    // hull below the deck, tapering to the bow
    b.box(0, -1.15, 1, 10, 2.3, 28, GREEN, { ao: 1 });
    for (let i = 0; i < 6; i++) {
      const z = -13 - i * 0.7, w = 10 - i * 1.55;
      b.box(0, -1.15, z, Math.max(1.2, w), 2.3, 0.72, GREEN, { ao: 1 });
    }
    // white upper strake and a red boot stripe at the waterline
    b.box(-5.02, -0.25, 1, 0.06, 0.5, 28, WHITE_D, { ao: 1 });
    b.box(5.02, -0.25, 1, 0.06, 0.5, 28, WHITE_D, { ao: 1 });
    b.box(-5.03, WATER_Y + 0.12, 1, 0.06, 0.2, 28, TRIM, { ao: 1 });
    b.box(5.03, WATER_Y + 0.12, 1, 0.06, 0.2, 28, TRIM, { ao: 1 });
    // her name, in chipped paint
    this.nameplates = [
      { pos: new THREE.Vector3(-5.07, -0.25, -6), rotY: -Math.PI / 2 },
      { pos: new THREE.Vector3(5.07, -0.25, -6), rotY: Math.PI / 2 },
    ];
  }

  _deck() {
    const b = this.b, w = this.world;
    // planks: main deck, then the tapering foredeck
    const strip = (x0, x1, z0, z1) => {
      for (let z = z0; z < z1 - 0.01; z += 0.36) {
        const zz = Math.min(z1, z + 0.34);
        b.box((x0 + x1) / 2, -0.05, (z + zz) / 2, x1 - x0, 0.1, zz - z, Math.random() < 0.18 ? DECK_D : DECK, { jitter: 0.1, ao: 1 });
      }
    };
    strip(-4.6, 4.6, -12, 14);
    strip(-3.4, 3.4, -14.2, -12);
    strip(-1.9, 1.9, -15.6, -14.2);
    w.addFloor(-4.35, -12, 4.35, 13.6);
    w.addFloor(-3.15, -14.1, 3.15, -12);
    w.addFloor(-1.7, -15.4, 1.7, -14.1);
    // railings, with a gap on the port side where the ladder goes down to the skiff
    const rail = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, rot = Math.atan2(bx - ax, bz - az);
      b.box(cx, 1.02, cz, 0.07, 0.07, len, WHITE, { rotY: rot });
      b.box(cx, 0.55, cz, 0.04, 0.04, len, WHITE, { rotY: rot });
      const n = Math.max(1, Math.round(len / 1.1));
      for (let i = 0; i <= n; i++) b.box(ax + ((bx - ax) * i) / n, 0.52, az + ((bz - az) * i) / n, 0.06, 1.04, 0.06, WHITE);
    };
    rail(-4.55, -12, -4.55, -9.2);
    rail(-4.55, -8.0, -4.55, 13.8);
    rail(4.55, -12, 4.55, 13.8);
    rail(-4.55, -12, -3.35, -14.1);
    rail(4.55, -12, 3.35, -14.1);
    rail(-3.35, -14.1, -1.85, -15.5);
    rail(3.35, -14.1, 1.85, -15.5);
    rail(-1.85, -15.5, 1.85, -15.5);
    rail(-4.55, 13.8, 4.55, 13.8);
    // flagpole at the bow, a tattered flag
    b.box(0, 2.2, -15.1, 0.08, 4.4, 0.08, WHITE);
    b.box(0, 4.1, -14.6, 0.02, 0.6, 0.9, 0x6a2a24, { rotY: 0.15 });
    // the bitts and a coil of line
    for (const x of [-2.4, 2.4]) this.solid(x, 0.25, -12.8, 0.3, 0.5, 0.3, IRON);
    b.cylinder(-1.2, 0.08, -13.4, 0.35, 0.35, 0.16, 0x8a7a5a, 10);
  }

  _salon() {
    const b = this.b;
    const x0 = -3.3, x1 = 3.3, z0 = -1.0, z1 = 8.0, h = 3.0, t = 0.16;
    const wall = (ax, az, bx, bz, openings) => {
      // openings: [[a0, a1, y0, y1]] along the wall in local units from the start
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const seg = (a0, a1, y0, y1) => {
        if (a1 - a0 < 0.01 || y1 - y0 < 0.01) return;
        const cx = ax + ux * (a0 + a1) / 2, cz = az + uz * (a0 + a1) / 2;
        const sx = Math.abs(ux) > 0.5 ? a1 - a0 : t, sz = Math.abs(uz) > 0.5 ? a1 - a0 : t;
        this.solid(cx, (y0 + y1) / 2, cz, sx, y1 - y0, sz, WHITE, { ao: 0.9 });
      };
      let cur = 0;
      for (const [o0, o1, y0, y1] of openings.sort((p, q) => p[0] - q[0])) {
        seg(cur, o0, 0, h);
        seg(o0, o1, 0, y0);
        seg(o0, o1, y1, h);
        if (y0 > 0.05) {
          // a lit window
          const cx = ax + ux * (o0 + o1) / 2, cz = az + uz * (o0 + o1) / 2;
          const nx = -uz, nz = ux;
          for (const s of [1, -1]) this.glow.box(cx + nx * s * (t / 2 + 0.01), (y0 + y1) / 2, cz + nz * s * (t / 2 + 0.01), Math.abs(ux) > 0.5 ? o1 - o0 : 0.01, y1 - y0, Math.abs(uz) > 0.5 ? o1 - o0 : 0.01, 0xffb35a, { jitter: 0.04 });
          // shutters and a sill
          b.box(cx - nx * (t / 2 + 0.04), y0 - 0.04, cz - nz * (t / 2 + 0.04), Math.abs(ux) > 0.5 ? o1 - o0 + 0.1 : 0.1, 0.06, Math.abs(uz) > 0.5 ? o1 - o0 + 0.1 : 0.1, TRIM);
        }
        cur = o1;
      }
      seg(cur, len, 0, h);
    };
    wall(x0, z0, x1, z0, [[2.5, 4.1, 0, 2.2], [0.6, 1.6, 1.1, 2.1], [5.0, 6.0, 1.1, 2.1]]);
    wall(x0, z1, x1, z1, [[2.5, 4.1, 0, 2.2]]);
    // side windows sit clear of the stove, shelves, cabinet and bunk
    wall(x0, z0, x0, z1, [[4.4, 5.4, 1.1, 2.1], [6.2, 7.0, 1.1, 2.1]]);
    wall(x1, z0, x1, z1, [[4.4, 5.4, 1.1, 2.1], [6.2, 7.0, 1.1, 2.1]]);
    // ceiling, gingerbread trim, a floor rug
    b.box(0, h + 0.08, (z0 + z1) / 2, x1 - x0 + 0.2, 0.16, z1 - z0 + 0.2, WHITE_D, { ao: 1 });
    for (const z of [z0 - 0.09, z1 + 0.09]) b.box(0, h - 0.18, z, x1 - x0 + 0.2, 0.3, 0.04, TRIM);
    b.box(0, 0.012, 3.5, 3.4, 0.02, 5.2, 0x6a2a24, { ao: 1 });
    b.box(0, 0.014, 3.5, 3.0, 0.02, 4.8, 0x8a5a3a, { ao: 1 });
    this.world.interiors.push({ x0, z0, x1, z1, surface: 'wood' });
    this.salon = { x0, z0, x1, z1, h };
  }

  _upperworks() {
    const b = this.b;
    // the texas deck: a roof over the salon that runs forward over the porch
    b.box(0, 3.3, 3.2, 9.4, 0.18, 13.6, WHITE_D, { ao: 1 });
    for (const s of [-1, 1]) {
      for (let z = -3.4; z <= 9.8; z += 1.1) b.box(s * 4.55, 3.75, z, 0.05, 0.7, 0.05, WHITE);
      b.box(s * 4.55, 4.1, 3.2, 0.06, 0.06, 13.4, WHITE);
      // posts holding it up over the side decks
      for (const z of [-3.4, 1.0, 5.0, 9.6]) this.solid(s * 4.4, 1.62, z, 0.12, 3.24, 0.12, WHITE);
    }
    for (let x = -4.4; x <= 4.4; x += 0.8) b.box(x, 3.18, -3.95, 0.04, 0.18, 0.04, WHITE);
    b.box(0, 3.08, -3.95, 9.0, 0.04, 0.04, WHITE);
    // pilot house
    b.box(0, 4.4, 3.8, 3.2, 2.0, 3.6, WHITE, { ao: 0.85 });
    b.box(0, 5.5, 3.8, 3.8, 0.16, 4.2, TRIM);
    for (const x of [-0.9, 0, 0.9]) this.glow.box(x, 4.6, 1.98, 0.7, 0.7, 0.02, 0xffc27a);
    for (const s of [-1, 1]) this.glow.box(s * 1.61, 4.6, 3.8, 0.02, 0.7, 1.4, 0xffb35a);
    b.box(0, 5.7, 3.8, 0.3, 0.3, 0.3, BRASS);
    // twin smokestacks with feathered crowns
    for (const s of [-1, 1]) {
      b.cylinder(s * 1.5, 7.6, -1.6, 0.36, 0.42, 8.6, 0x1c1c1c, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box(s * 1.5 + Math.cos(a) * 0.46, 12.0, -1.6 + Math.sin(a) * 0.46, 0.14, 0.5, 0.05, 0x1c1c1c, { rotY: -a });
      }
      b.box(s * 1.5, 11.6, -1.6, 0.95, 0.12, 0.95, BRASS);
    }
    b.box(0, 9.6, -1.6, 3.0, 0.06, 0.06, 0x1c1c1c);
    this.smoke = [new THREE.Vector3(-1.5, 12.3, -1.6), new THREE.Vector3(1.5, 12.3, -1.6)];
  }

  _awning() {
    const b = this.b;
    // canvas over the work deck on timber posts
    for (const s of [-1, 1]) for (const z of [-11.6, -7.4, -3.6]) this.solid(s * 4.3, 1.45, z, 0.12, 2.9, 0.12, WOOD, { collide: z !== -7.4 || s > 0 });
    for (let i = 0; i < 6; i++) {
      const z0 = -12 + i * 1.4;
      b.box(0, 2.95 - Math.sin(i * 0.9) * 0.05, z0 + 0.7, 9.2, 0.04, 1.42, i % 2 ? CANVAS : 0x62583f, { jitter: 0.08, ao: 1 });
    }
    b.box(0, 2.88, -7.8, 9.0, 0.08, 0.08, WOOD);
    // strings of bulbs, sagging between the posts
    this.bulbs = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        const z = -11.6 + k * 8, y = 2.7 - Math.sin(k * Math.PI * 2) ** 2 * 0.22;
        this.glow.box(s * 3.2, y, z, 0.07, 0.09, 0.07, 0xffcf85, { jitter: 0.1 });
        this.bulbs.push(new THREE.Vector3(s * 3.2, y, z));
      }
    }
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      this.glow.box(-2.8 + k * 5.6, 2.62 - Math.sin(k * Math.PI) * 0.18, -9.5, 0.07, 0.09, 0.07, 0xffcf85, { jitter: 0.1 });
    }
  }

  _paddlewheel() {
    const b = this.b;
    // housing and the great wheel at the stern
    b.box(0, 1.3, 14.2, 9.2, 0.2, 0.3, WHITE);
    for (const s of [-1, 1]) b.box(s * 4.4, 0.6, 15.8, 0.3, 2.6, 3.2, WHITE_D);
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 0.35, 15.9);
    const wm = new THREE.MeshLambertMaterial({ color: TRIM, map: grimeTexture() });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a22 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 0.55), wm);
      paddle.position.set(0, Math.sin(a) * 2.35, Math.cos(a) * 2.35);
      paddle.rotation.x = -a;
      this.wheel.add(paddle);
      for (const x of [-3.9, 0, 3.9]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 0.08), dark);
        spoke.position.set(x, Math.sin(a) * 1.17, Math.cos(a) * 1.17);
        spoke.rotation.x = Math.PI / 2 - a;
        this.wheel.add(spoke);
      }
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8.6, 10), dark);
    axle.rotation.z = Math.PI / 2;
    this.wheel.add(axle);
    this.scene.add(this.wheel);
  }

  // ---- stations ----------------------------------------------------------------------------

  _bench(cx, cz, face, top = 0.95, len = 2.2, depth = 0.8, col = WOOD_L) {
    // a sturdy bench along the rail, long side along z
    const b = this.b;
    const alongZ = Math.abs(face.x) > 0.5;
    const sx = alongZ ? depth : len, sz = alongZ ? len : depth;
    b.box(cx, top - 0.05, cz, sx, 0.1, sz, col, { ao: 1 });
    for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.box(cx + a * (sx / 2 - 0.06), (top - 0.1) / 2, cz + c * (sz / 2 - 0.06), 0.08, top - 0.1, 0.08, WOOD);
    }
    b.box(cx, 0.25, cz, sx - 0.12, 0.04, sz - 0.12, WOOD);
    this.world.addBoxC(cx, top / 2, cz, sx, top, sz, { occlude: false, kind: 'furniture' });
  }

  _pegboard(cx, cz, face, len = 2.2) {
    const b = this.b;
    const back = { x: cx - face.x * 0.46, z: cz - face.z * 0.46 };
    const alongZ = Math.abs(face.x) > 0.5;
    b.box(back.x, 1.6, back.z, alongZ ? 0.04 : len, 1.1, alongZ ? len : 0.04, 0x8a6a48, { ao: 1 });
    // hanging tools: wrenches, a saw, files
    for (let i = 0; i < 9; i++) {
      const a = -len / 2 + 0.2 + i * (len - 0.4) / 8;
      const x = alongZ ? back.x + face.x * 0.03 : back.x + a, z = alongZ ? back.z + a : back.z + face.z * 0.03;
      const h = 0.18 + (i % 3) * 0.08;
      b.box(x, 1.75 - h / 2, z, alongZ ? 0.02 : 0.03, h, alongZ ? 0.03 : 0.02, [0x9a9ea3, 0x8a2a1e, 0x5a4330][i % 3]);
    }
    return back;
  }

  _workDeck() {
    const b = this.b;
    // Weapon workbench (gunsmith): starboard, under the awning
    {
      const c = new THREE.Vector3(3.55, 0, -4.6), f = new THREE.Vector3(-1, 0, 0);
      this._bench(c.x, c.z, f, 0.95, 2.4, 0.85, 0x6a5038);
      this._pegboard(c.x, c.z, f, 2.4);
      // vise, a gun mat, lamp, a parts drawer
      b.box(c.x - 0.1, 1.02, c.z - 0.75, 0.16, 0.12, 0.24, 0x3a4a5a);
      b.box(c.x + 0.05, 0.915, c.z + 0.05, 0.6, 0.01, 1.3, 0x2a3a2a);
      b.box(c.x + 0.2, 0.7, c.z + 0.9, 0.4, 0.3, 0.5, 0x8a2a1e);
      b.box(c.x + 0.25, 1.35, c.z + 0.75, 0.04, 0.8, 0.04, IRON);
      b.box(c.x + 0.05, 1.72, c.z + 0.75, 0.3, 0.1, 0.14, IRON);
      this.glow.box(c.x - 0.02, 1.66, c.z + 0.75, 0.16, 0.02, 0.1, 0xfff0c8);
      this.station('gunsmith', 'Weapon Workbench', c, f, [0.85, 0.95, 2.4], {
        dist: 0.72, eye: 1.3, lookUp: 0.06,
        anchor: { pos: new THREE.Vector3(c.x - 0.02, 0.93, c.z + 0.05), rotY: 0 },
        verb: 'Modify weapons',
      });
    }
    // Workshop bench: port side
    {
      const c = new THREE.Vector3(-3.55, 0, -4.6), f = new THREE.Vector3(1, 0, 0);
      this._bench(c.x, c.z, f, 0.95, 2.4, 0.85);
      this._pegboard(c.x, c.z, f, 2.4);
      b.box(c.x, 1.05, c.z - 0.8, 0.3, 0.2, 0.4, 0x6a6a6a);
      b.box(c.x - 0.1, 1.0, c.z + 0.7, 0.5, 0.1, 0.3, 0x9a9ea3, { rotY: 0.3 });
      b.box(c.x + 0.1, 0.98, c.z + 0.2, 0.05, 0.05, 0.6, WOOD, { rotY: 0.2 });
      this.station('workshop', 'Workshop Bench', c, f, [0.85, 0.95, 2.4], {
        dist: 1.0, eye: 1.42,
        anchor: { pos: new THREE.Vector3(c.x + 0.05, 1.02, c.z), rotY: 0.4 },
        verb: 'Build',
      });
    }
    // Reloading bench: starboard, forward
    {
      const c = new THREE.Vector3(3.6, 0, -8.8), f = new THREE.Vector3(-1, 0, 0);
      this._bench(c.x, c.z, f, 0.95, 1.8, 0.75, 0x7a6a50);
      // the press, powder tins, a scale
      b.box(c.x + 0.1, 1.2, c.z - 0.5, 0.12, 0.5, 0.12, 0x2a3a5a);
      b.box(c.x + 0.1, 1.45, c.z - 0.5, 0.3, 0.06, 0.06, 0x2a3a5a);
      for (let i = 0; i < 3; i++) b.cylinder(c.x + 0.2, 1.0, c.z + 0.2 + i * 0.16, 0.06, 0.06, 0.12, [0x3a3a38, 0x8a2a1e, 0x3a3a38][i], 10);
      b.box(c.x - 0.1, 0.96, c.z + 0.55, 0.2, 0.04, 0.2, BRASS);
      b.box(c.x + 0.33, 1.35, c.z, 0.04, 0.8, 1.7, 0x6a5038);
      for (let i = 0; i < 3; i++) b.box(c.x + 0.25, 1.1 + i * 0.25, c.z, 0.14, 0.02, 1.6, 0x6a5038);
      this.station('reloading', 'Reloading Bench', c, f, [0.75, 0.95, 1.8], {
        dist: 1.0, eye: 1.42,
        anchor: { pos: new THREE.Vector3(c.x - 0.05, 1.02, c.z + 0.05), rotY: 0.6 },
        verb: 'Load ammunition',
      });
    }
  }

  _salonInterior() {
    const b = this.b;
    // Galley stove against the port wall
    {
      const c = new THREE.Vector3(-2.75, 0, 1.4), f = new THREE.Vector3(1, 0, 0);
      this.solid(c.x, 0.5, c.z, 0.8, 1.0, 1.1, 0x1e1e1e, { kind: 'furniture' });
      b.box(c.x, 1.01, c.z, 0.84, 0.03, 1.14, 0x3a3a3a);
      b.cylinder(c.x + 0.05, 1.16, c.z - 0.2, 0.2, 0.18, 0.26, 0x5a5a58, 12);
      b.cylinder(c.x + 0.05, 1.08, c.z + 0.28, 0.16, 0.16, 0.08, 0x2a2a2a, 12);
      b.cylinder(c.x - 0.25, 2.1, c.z, 0.08, 0.08, 2.1, 0x1e1e1e, 8);
      this.glow.box(c.x + 0.41, 0.4, c.z, 0.01, 0.2, 0.5, 0xff7a30);
      this.solid(c.x, 0.45, c.z + 1.1, 0.6, 0.9, 1.0, WOOD_L, { kind: 'furniture' });
      for (let i = 0; i < 4; i++) b.box(c.x - 0.25, 1.6 + (i % 2) * 0.25, c.z + 0.6 + i * 0.3, 0.06, 0.2, 0.14, [0x9a3a22, 0xd0b070, 0x5a6a7a, 0x7a5a2a][i]);
      this.station('galley', 'Galley Stove', c, f, [0.8, 1.0, 1.1], {
        dist: 1.05, eye: 1.5,
        anchor: { pos: new THREE.Vector3(c.x + 0.1, 1.18, c.z + 0.28), rotY: 0.2 },
        verb: 'Cook',
      });
    }
    // Infirmary: cabinet and a cot against the starboard wall
    {
      const c = new THREE.Vector3(2.9, 0, 1.4), f = new THREE.Vector3(-1, 0, 0);
      this.solid(c.x, 0.9, c.z, 0.5, 1.8, 1.0, 0xc8c6be, { kind: 'furniture' });
      b.box(c.x - 0.26, 1.2, c.z, 0.02, 0.2, 0.2, 0xb02a2a);
      b.box(c.x - 0.26, 1.2, c.z, 0.02, 0.06, 0.2, 0xffffff);
      b.box(c.x - 0.26, 1.2, c.z, 0.02, 0.2, 0.06, 0xffffff);
      this.solid(c.x - 0.1, 0.4, c.z + 1.25, 0.7, 0.8, 0.8, 0x9a9690, { kind: 'furniture' });
      for (let i = 0; i < 4; i++) b.cylinder(c.x - 0.3, 0.86, c.z + 1.0 + i * 0.14, 0.03, 0.03, 0.12, [0x6a4a2a, 0x2f5f86, 0xd0741f, 0xe8e4da][i], 8);
      this.station('infirmary', 'Infirmary', c, f, [0.6, 1.8, 1.0], {
        dist: 1.1, eye: 1.45,
        anchor: { pos: new THREE.Vector3(c.x - 0.1, 0.88, c.z + 1.25), rotY: -0.4 },
        verb: 'Treat and prepare',
      });
    }
    // The stash: a steamer trunk in the back corner, and shelves
    {
      const c = new THREE.Vector3(-2.3, 0, 6.9), f = new THREE.Vector3(0, 0, -1);
      this.solid(c.x, 0.3, c.z, 1.2, 0.6, 0.7, 0x5a3a24, { kind: 'furniture' });
      for (const x of [-0.45, 0.45]) b.box(c.x + x, 0.3, c.z - 0.36, 0.06, 0.62, 0.02, BRASS);
      this.stashLid = new THREE.Group();
      this.stashLid.position.set(c.x, 0.6, c.z + 0.35);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.72), new THREE.MeshLambertMaterial({ color: 0x6a4630, map: grimeTexture() }));
      lid.position.set(0, 0.04, -0.36);
      this.stashLid.add(lid);
      this.scene.add(this.stashLid);
      this.solid(c.x - 0.2, 1.0, c.z + 0.72, 1.6, 2.0, 0.3, 0x6a5038, { kind: 'furniture' });
      for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) b.box(c.x - 0.8 + k * 0.32, 0.55 + i * 0.6, c.z + 0.66, 0.2, 0.22, 0.2, [0x7a5c40, 0x5a6a7a, 0x9a3a22, 0x6a6a6a][(i + k) % 4]);
      this.station('stash', 'Stash', c, f, [1.2, 1.0, 0.7], { dist: 1.4, eye: 1.6, lookY: 0.55, verb: 'Open' });
    }
    // Bunk in the starboard back corner
    {
      this.solid(2.35, 0.3, 6.6, 1.5, 0.6, 2.1, WOOD, { kind: 'furniture' });
      b.box(2.35, 0.66, 6.6, 1.4, 0.14, 2.0, 0x8a7a6a, { top: 0xa8a290 });
      b.box(2.35, 0.78, 7.4, 1.0, 0.12, 0.3, 0xc8c0b0);
      b.box(2.35, 0.75, 6.2, 1.3, 0.06, 1.0, 0x5a6a7a);
    }
    // The captain's table: the log, a lamp, a chart of the parish
    {
      const c = new THREE.Vector3(0, 0, 3.9), f = new THREE.Vector3(0, 0, -1);
      this.solid(c.x, 0.39, c.z, 1.6, 0.78, 1.0, WOOD_L, { kind: 'furniture' });
      b.box(c.x, 0.79, c.z, 1.1, 0.01, 0.7, 0xb9ab86);
      b.box(c.x + 0.45, 0.82, c.z - 0.2, 0.3, 0.04, 0.22, 0x4a2a1a);
      b.cylinder(c.x - 0.5, 0.9, c.z + 0.25, 0.08, 0.1, 0.2, BRASS, 10);
      this.glow.box(c.x - 0.5, 1.07, c.z + 0.25, 0.1, 0.14, 0.1, 0xffc070);
      for (const s of [-1, 1]) this.solid(c.x + s * 1.1, 0.25, c.z, 0.45, 0.5, 0.45, WOOD, { kind: 'furniture' });
      this.station('journal', 'Captain\'s Log', c, f, [1.6, 0.78, 1.0], { dist: 1.2, eye: 1.55, lookY: 0.82, verb: 'Read' });
    }
  }

  _aftDeck() {
    const b = this.b;
    // Recycler: a hand-cranked grinder bolted to the aft deck
    {
      const c = new THREE.Vector3(-3.1, 0, 11.2), f = new THREE.Vector3(1, 0, 0);
      this.solid(c.x, 0.55, c.z, 1.0, 1.1, 1.2, 0x5a5048, { kind: 'furniture' });
      b.box(c.x, 1.25, c.z - 0.1, 0.8, 0.3, 0.8, 0x3a3a3a);
      b.cylinder(c.x + 0.55, 0.8, c.z + 0.3, 0.2, 0.2, 0.06, IRON, 12, { rz: Math.PI / 2 });
      b.box(c.x + 0.62, 0.8, c.z + 0.45, 0.04, 0.04, 0.3, IRON);
      b.box(c.x + 0.3, 0.2, c.z - 0.7, 0.6, 0.4, 0.4, 0x7a6a48);
      for (let i = 0; i < 6; i++) b.box(c.x + 0.3 + (Math.random() - 0.5) * 0.4, 0.45, c.z - 0.7 + (Math.random() - 0.5) * 0.3, 0.12, 0.06, 0.1, [0x6f6a62, 0x9a9ea3, 0x2f6a3a][i % 3]);
      this.station('recycler', 'Recycler', c, f, [1.0, 1.1, 1.2], { dist: 1.6, eye: 1.6, lookY: 0.95, verb: 'Break down salvage' });
    }
    // chairs, a stove-pipe grill, fishing rods, a hammock and wash line
    b.box(1.6, 0.25, 10.4, 0.6, 0.06, 0.6, WOOD_L);
    b.box(1.6, 0.6, 10.7, 0.6, 0.7, 0.06, WOOD_L);
    this.world.addBoxC(1.6, 0.4, 10.5, 0.65, 0.8, 0.65, { occlude: false, kind: 'furniture' });
    b.box(2.8, 0.25, 11.4, 0.6, 0.06, 0.6, WOOD_L, { rotY: -0.5 });
    this.world.addBoxC(2.8, 0.4, 11.4, 0.65, 0.8, 0.65, { occlude: false, kind: 'furniture' });
    for (let i = 0; i < 3; i++) b.box(4.3, 1.5, 9 + i * 0.3, 0.02, 3.0, 0.02, 0x3a2a1a, { rotY: 0.2 });
    b.box(0, 2.2, 12.7, 8.4, 0.01, 0.01, 0xd8d4c8);
    for (let i = 0; i < 5; i++) b.box(-3 + i * 1.4, 1.85, 12.7, 0.6, 0.7, 0.02, [0x8a7a6a, 0x5a6a7a, 0xa8a290, 0x6a2a24, 0x7a8a6a][i]);
    for (const [x, z] of [[3.6, 12.6], [3.0, 12.9]]) this.solid(x, 0.45, z, 0.6, 0.9, 0.6, 0x3a4a5a, { kind: 'junk' });
  }

  _skiff() {
    const b = this.b;
    // your skiff, tied off below the port gangway, and a ladder down to it
    const sx = -6.2, sz = -8.6;
    b.box(sx, WATER_Y + 0.15, sz, 1.5, 0.5, 4.6, 0x3a4a3a, { ao: 1, top: 0x2a2a24 });
    b.box(sx, WATER_Y + 0.42, sz, 1.6, 0.1, 4.7, 0x5a3a2a, { ao: 1 });
    b.box(sx, WATER_Y + 0.6, sz + 2.1, 0.4, 0.6, 0.4, 0x1a1a1a);
    b.box(sx, WATER_Y + 0.5, sz - 0.4, 1.3, 0.08, 0.3, 0x5a3a2a);
    for (let i = 0; i < 5; i++) b.box(-4.95, -0.25 * i - 0.1, sz, 0.05, 0.05, 0.6, WOOD);
    for (const z of [-0.3, 0.3]) b.box(-4.95, -0.5, sz + z, 0.05, 1.1, 0.05, WOOD);
    b.box(-4.6, 1.3, sz - 0.62, 0.08, 2.6, 0.08, WOOD);
    this.glow.box(-4.6, 2.5, sz - 0.62, 0.14, 0.2, 0.14, 0xffc070);
    this.skiffLantern = new THREE.Vector3(-4.6, 2.5, sz - 0.62);
    const c = new THREE.Vector3(-4.3, 0, sz), f = new THREE.Vector3(1, 0, 0);
    this.station('skiff', 'Your Skiff', c, f, [0.5, 1.2, 1.2], { look: new THREE.Vector3(sx, WATER_Y + 0.4, sz), dist: 2.9, eye: 2.2, pivot: true, verb: 'Cast off' });
  }

  _surroundings() {
    const b = this.b;
    // the far bank: a drowned town, cypress, a water tower
    const rnd = (a, c) => a + Math.random() * (c - a);
    for (let i = 0; i < 34; i++) {
      const x = -90 + i * 5.4 + rnd(-1, 1), z = -70 - rnd(0, 30);
      const h = rnd(2, 7);
      b.box(x, WATER_Y + h / 2 - 0.5, z, rnd(3, 6), h, 4, [0x5a6a64, 0x6a5a4a, 0x4a4a52, 0x5a5048][i % 4], { ao: 0.5 });
      b.box(x, WATER_Y + h - 0.2, z, rnd(3.5, 6.5), 0.5, 4.6, [0x3a3634, 0x4a3a30][i % 2], { rotY: rnd(-0.2, 0.2) });
    }
    b.cylinder(-24, 10, -78, 0.3, 0.3, 20, 0x3a3a3a, 6);
    b.cylinder(-24, 20, -78, 3, 3, 3.5, 0x6a6a64, 12);
    // cypress in the water all around
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(22, 90);
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.9 + 6;
      if (Math.abs(x) < 16 && Math.abs(z) < 26) continue;
      const h = Math.round(rnd(8, 16));
      b.cylinder(x, WATER_Y + h / 2, z, 0.2, 0.55, h, 0x3a2e24, 7);
      b.cone(x, WATER_Y + 0.4, z, 0.9, 1.0, 0x3a2e24, 6);
      for (let k = 0; k < 2; k++) b.ico(x + rnd(-1.4, 1.4), WATER_Y + h * rnd(0.75, 0.95), z + rnd(-1.4, 1.4), rnd(1.8, 2.8), [0x2a3a22, 0x344426][k], 0.5);
      for (let k = 0; k < 4; k++) b.box(x + rnd(-1.5, 1.5), WATER_Y + h * 0.66 - 1, z + rnd(-1.5, 1.5), 0.14, rnd(1.2, 2.6), 0.05, 0x6a7258, { rotY: rnd(0, 3) });
    }
    // the bank the Magnolia ran aground on, and the old landing
    b.box(-14, WATER_Y + 0.2, 18, 18, 0.8, 30, 0x3a3a2a, { rotY: 0.15 });
    for (let i = 0; i < 6; i++) b.cylinder(-7 - i * 1.5, WATER_Y + 0.5, 22 + i * 0.2, 0.12, 0.15, 2.2, 0x3a2e22, 6);
    b.box(-10, WATER_Y + 1.2, 22.5, 8, 0.12, 1.6, 0x5a4632, { rotY: 0.1 });
    // lily pads
    for (let i = 0; i < 160; i++) {
      const x = rnd(-40, 40), z = rnd(-40, 45);
      if (Math.abs(x) < 6.2 && z > -17 && z < 19) continue;
      b.ico(x, WATER_Y + 0.01, z, rnd(0.2, 0.45), [0x2a3a1e, 0x34441e][i % 2], 0.04);
    }
  }

  // ---- the bulletin board on wheels --------------------------------------------------------

  _board() {
    const c = new THREE.Vector3(0, 0, -13.1), f = new THREE.Vector3(0, 0, 1);
    const b = new Batcher();
    // an old school corkboard on a rolling A-frame
    for (const s of [-1, 1]) {
      b.box(s * 1.02, 1.05, c.z, 0.08, 1.9, 0.08, 0x9a9ea3);
      b.box(s * 1.02, 0.1, c.z, 0.08, 0.06, 0.7, 0x9a9ea3);
      for (const z of [-0.3, 0.3]) b.cylinder(s * 1.02, 0.06, c.z + z, 0.06, 0.06, 0.05, 0x1a1a1a, 10, { rz: Math.PI / 2 });
    }
    b.box(0, 1.35, c.z - 0.02, 2.02, 1.34, 0.06, 0x6a5a48);
    b.box(0, 0.62, c.z, 1.9, 0.04, 0.04, 0x9a9ea3);
    this.scene.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.world.addBoxC(0, 1, c.z, 2.2, 2, 0.8, { occlude: false, kind: 'furniture' });
    // the board face is a canvas the bench UI draws on
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 680;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.26), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x2a2014, emissiveMap: tex, emissiveIntensity: 0.35 }));
    face.position.set(0, 1.35, c.z + 0.015);
    this.scene.add(face);
    this.boardFace = { mesh: face, canvas, tex, w: 1.9, h: 1.26 };
    this.station('board', 'Bulletin Board', c, f, [2.1, 2.0, 0.8], { dist: 1.75, eye: 1.4, lookY: 1.34, verb: 'Plan the next trip' });
  }

  // ---- light ----------------------------------------------------------------------------

  _lights() {
    const add = (x, y, z, color, i, d) => {
      const l = new THREE.PointLight(color, i, d, 1.4);
      l.position.set(x, y, z);
      this.scene.add(l);
      this.lights.push({ l, base: i });
      return l;
    };
    add(0, 1.9, -9.5, 0xffc27a, 7, 11);
    add(0, 1.9, -5.2, 0xffc27a, 7, 10);
    add(0, 2.5, 3.2, 0xffb866, 14, 10);
    add(-2.2, 1.3, 1.5, 0xff7a30, 6, 5);
    add(0, 2.2, 11.6, 0xffb866, 9, 10);
    add(-5.2, 1.6, -9.0, 0xffc070, 5, 7);
    this.stoveLight = this.lights[3];
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt, camPos) {
    this.t += dt;
    const t = this.t;
    this.wheel.rotation.x = Math.sin(t * 0.2) * 0.03;
    for (const { l, base } of this.lights) l.intensity = base * (0.93 + Math.sin(t * 7 + l.position.x * 3) * 0.03 + Math.random() * 0.04);
    this.stoveLight.l.intensity = this.stoveLight.base * (0.7 + Math.random() * 0.4);
    this.glowMat.color.setScalar(0.9 + Math.sin(t * 2.3) * 0.04 + Math.random() * 0.03);
    this.env.update(dt, camPos || this.camera.position, t);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
