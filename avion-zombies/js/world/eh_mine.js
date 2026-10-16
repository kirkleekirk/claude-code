import * as THREE from '../../vendor/three.module.min.js';
import { MINE, STAIRS_E, STOCKADE_Z, CREEK } from './eh_shape.js';
import { boulder, placeAt } from './formations.js';
import { lampPost, picnicTable, signTex, trashCan, bench, ribbon, parkSign, frame } from './eh_props.js';
import { makeRng } from '../util.js';

// The gem mine and picnic grounds: a gravel path from the lot gate up to the plaza stairs, the
// picnic shelter, the sluice flume fed by the creek's pump house (the breaker is on its wall),
// the old "Prospector's Mine" facade and the creek with its footbridge.
export const PUMP_HOUSE = { x: 48.8, z: 23.2, w: 4.0, d: 3.4 };
export const PAVILION = { x: 30, z: 46, w: 12, d: 7 };
const FLUME = { x0: 23, x1: 42.2, z: 23.2, top: 0.95 };

export function buildMine(S) {
  const { B, M, X, H, fx } = S;
  // ---- paths ------------------------------------------------------------------------------
  const path = [[18, STOCKADE_Z + 0.4], [18, 50], [18.6, 36], [19.0, 26], [STAIRS_E.x, STAIRS_E.z1 + 0.4]];
  ribbon(B, M.gravel, path, 2.8, H, { lift: 0.02, uv: 2.5 });
  ribbon(B, M.gravel, [[18.4, 44], [24, 45.2]], 2.2, H, { lift: 0.02, uv: 2.5 });
  ribbon(B, M.gravel, [[18.8, 30], [24, 26.6], [FLUME.x1 + 2.2, 26.6], [PUMP_HOUSE.x + 1.6, 26.6]], 2.4, H, { lift: 0.02, uv: 2.5 });
  ribbon(B, M.gravel, [[45.4, 26.2], [45.4, 21.4], [45.6, 19.6]], 2.0, H, { lift: 0.021, uv: 2.5 });
  ribbon(B, M.gravel, [[36, 46], [43, 38], [45.3, 36.4]], 2.2, H, { lift: 0.02, uv: 2.5 });
  ribbon(B, M.gravel, [[53.1, 36.4], [60, 38.5], [66, 40]], 2.2, H, { lift: 0.02, uv: 2.5 });
  for (const [x, z] of [[17, 57], [16.6, 40], [21.2, 23.5]]) lampPost(B, M, X, x, H(x, z), z, 'mine');
  for (const [x, z] of [[37.5, 28.4], [58.4, 41.2], [66, 50.5], [61.5, 24.5]]) lampPost(B, M, X, x, H(x, z), z, 'mine');
  // signpost at the foot of the stairs
  parkSign(B, M, X, 22.2, H(22.2, 19.6), 19.6, -0.4, [{ text: '↑ CAVE ENTRANCE', size: 54 }, { text: 'GEM MINE • PICNIC AREA', size: 32, weight: 600 }], 1.7, 0.75);

  // ---- picnic shelter ---------------------------------------------------------------------
  {
    const { x, z, w, d } = PAVILION;
    const y = Math.max(H(x - w / 2, z - d / 2), H(x + w / 2, z - d / 2), H(x - w / 2, z + d / 2), H(x + w / 2, z + d / 2)) + 0.12;
    B.box(x, y - 0.6, z, w + 0.6, 0.6, d + 0.6, { mat: M.concrete, uv: 3, walkable: true });
    const postH = 2.7;
    for (const px of [x - w / 2 + 0.4, x, x + w / 2 - 0.4]) {
      for (const pz of [z - d / 2 + 0.4, z + d / 2 - 0.4]) B.cylinder(px, y, pz, 0.16, postH, { mat: X.peeledOut, seg: 9, walkable: false });
    }
    for (const pz of [z - d / 2 + 0.4, z + d / 2 - 0.4]) B.box(x, y + postH - 0.05, pz, w, 0.3, 0.26, { mat: X.peeledOut, collide: false });
    // gable roof, ridge along x
    const pitch = 0.5;
    const half = d / 2 + 0.9;
    const rise = half * Math.tan(pitch);
    const ry = y + postH + 0.25 + (d / 2 - 0.4) * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const len = half / Math.cos(pitch);
      B.box(x, ry - rise / 2 + Math.cos(pitch) * 0.12 - 0.12, z + s * (half / 2) + s * Math.sin(pitch) * 0.12, w + 1.4, 0.24, len, { mat: X.shakes, rx: s * pitch, collide: false, uv: 2.4 });
      B.box(x, ry - rise / 2 - 0.16, z + s * (half / 2), w + 1.2, 0.05, len, { mat: X.planksDark, rx: s * pitch, collide: false, uv: 1.5 });
    }
    B.cylinder(x, ry - 0.05, z, 0.16, w + 1.5, { mat: X.peeledOut, horizontal: true, rot: 0, seg: 8, collide: false });
    for (const gx of [x - w / 2 + 0.4, x + w / 2 - 0.4]) B.box(gx, y + postH + 0.2, z, 0.22, 0.24, d - 0.4, { mat: X.peeledOut, collide: false });
    B.physics.addBox({ x, y: y + postH, z, w: w + 1.2, h: 2.5, d: d + 1.4, walkable: false, nav: false, material: 'wood' });
    // tables, string lights along both beams, two lamps under the roof
    for (const tx of [x - 3.6, x, x + 3.6]) picnicTable(B, M, X, tx, y, z, Math.PI / 2);
    for (const pz of [z - d / 2 + 0.4, z + d / 2 - 0.4]) {
      for (let k = 0; k <= 16; k++) {
        const bx = x - w / 2 + 0.5 + (k * (w - 1)) / 16;
        const sag = 0.18 * Math.sin((k / 16) * Math.PI * 3) ** 2;
        B.fixture(new THREE.SphereGeometry(0.05, 6, 4), new THREE.Matrix4().makeTranslation(bx, y + postH - 0.22 - sag, pz), 0xffc070, 6, 'mine');
      }
    }
    for (const lx of [x - 3, x + 3]) B.bakedLamp(lx, y + postH - 0.3, z, { color: 0xffc070, intensity: 20, range: 11, circuit: 'mine', fitting: null, glow: 1.6 });
    const t = signTex([{ text: 'PICNIC SHELTER', size: 64 }, { text: 'Please clean up after yourself', size: 28, weight: 500 }], { w: 512, h: 150 });
    B.sign(x, y + postH + 0.42, z + d / 2 - 0.25, 0, t, 2.4, 0.7);
    trashCan(B, M, X, x - w / 2 - 0.6, H(x - w / 2 - 0.6, z + d / 2 - 0.4), z + d / 2 - 0.4);
    trashCan(B, M, X, x + w / 2 + 0.6, H(x + w / 2 + 0.6, z - d / 2 + 0.4), z - d / 2 + 0.4);
  }

  // ---- the sluice flume -------------------------------------------------------------------
  {
    const { x0, x1, z, top } = FLUME;
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    const y = H(cx, z);
    // trough on trestle legs
    B.box(cx, y + top - 0.1, z, len, 0.08, 0.7, { mat: X.planksDark, collide: false, uv: 1.5 });
    for (const s of [-1, 1]) B.box(cx, y + top - 0.1, z + s * 0.36, len, 0.42, 0.06, { mat: X.planksDark, collide: false, uv: 1.5 });
    for (let x = x0 + 0.4; x <= x1; x += 2.4) {
      for (const s of [-1, 1]) B.box(x, H(x, z) - 0.1, z + s * 0.3, 0.12, top + 0.1 - H(x, z) + y, 0.12, { mat: X.planksDark, collide: false });
    }
    B.box(cx, y + top + 0.12, z, len, 0.05, 0.62, { mat: X.water, collide: false, cast: false });
    // riffle boards and a row of screen trays along the sides
    for (let x = x0 + 1.2; x < x1; x += 1.6) B.box(x, y + top + 0.02, z, 0.05, 0.1, 0.62, { mat: X.planksDark, collide: false, cast: false });
    for (let x = x0 + 1.0; x < x1 - 1; x += 3.2) {
      for (const s of [-1, 1]) {
        B.box(x, y + top + 0.22, z + s * 0.55, 0.7, 0.06, 0.42, { mat: M.steelDark, collide: false });
        B.box(x, y + top + 0.23, z + s * 0.55, 0.62, 0.02, 0.34, { mat: M.chainlink, collide: false, cast: false });
      }
    }
    // benches for the panners, buckets of "mining rough"
    for (const s of [-1, 1]) {
      for (let x = x0 + 2.0; x < x1 - 1; x += 6.0) bench(B, M, X, x, H(x, z + s * 1.25), z + s * 1.25, s > 0 ? 0 : Math.PI, 2.6);
    }
    const rng = makeRng(31);
    for (let k = 0; k < 8; k++) {
      const bx = x0 + 1.5 + k * 2.3;
      const bz = z + (k % 2 ? 0.95 : -0.95);
      B.cylinder(bx, H(bx, bz), bz, 0.17, 0.32, { mat: [X.paintRed, X.paintBlue, X.paintYellow][k % 3], seg: 10, rTop: 0.2, open: false, collide: false });
      B.cylinder(bx, H(bx, bz) + 0.28, bz, 0.15, 0.04, { mat: M.gravel, seg: 10, collide: false });
      void rng;
    }
    // head tank on a stand at the east end, fed by the pump house
    const tx = x1 + 1.0;
    B.box(tx, H(tx, z), z, 1.6, 1.0, 1.6, { mat: X.planksDark, walkable: true });
    B.cylinder(tx, H(tx, z) + 1.0, z, 0.85, 1.5, { mat: X.planksDark, seg: 16, walkable: false });
    for (const hy of [1.25, 2.05]) B.cylinder(tx, H(tx, z) + hy, z, 0.87, 0.06, { mat: M.black, seg: 16, collide: false });
    B.cylinder(tx, H(tx, z) + 2.5, z, 0.8, 0.02, { mat: X.water, seg: 16, collide: false, cast: false });
    // the pipe from the pump house, overhead
    const px = PUMP_HOUSE.x - PUMP_HOUSE.w / 2;
    B.cylinder((tx + px) / 2, H(tx, z) + 2.05, z + 0.4, 0.08, px - tx, { mat: M.steelDark, horizontal: true, rot: 0, seg: 8, collide: false });
    B.physics.addBox({ x: cx, y: y - 0.2, z, w: len, h: top + 0.45, d: 0.8, walkable: false, material: 'wood' });
    const t = signTex([{ text: 'GEM MINING SLUICE', size: 60 }, { text: 'Buckets $3 • Keep what you find!', size: 30, weight: 600 }], { w: 512, h: 160 });
    parkSign(B, M, X, x0 - 1.2, H(x0 - 1.2, z), z, -Math.PI / 2 + 0.2, null, 1.8, 0.56, { tex: t, post: 1.0 });
  }

  // ---- pump house (the gem mine breaker is on its west wall) --------------------------------
  {
    const { x, z, w, d } = PUMP_HOUSE;
    const y = Math.max(H(x - w / 2, z - d / 2), H(x + w / 2, z - d / 2), H(x - w / 2, z + d / 2), H(x + w / 2, z + d / 2));
    B.box(x, y - 0.6, z, w + 0.3, 0.75, d + 0.3, { mat: M.concrete, uv: 2, walkable: true });
    B.box(x, y + 0.15, z, w, 2.5, d, { mat: X.planksOut, walkable: false, uv: 1.2 });
    for (let k = 0; k <= 8; k++) {
      const bx = x - w / 2 + (k * w) / 8;
      for (const s of [-1, 1]) B.box(bx, y + 0.15, z + s * (d / 2 + 0.02), 0.06, 2.5, 0.04, { mat: X.planksOut, collide: false });
    }
    const pitch = 0.6;
    const half = d / 2 + 0.35;
    const ry = y + 2.65 + (d / 2) * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const len = half / Math.cos(pitch);
      B.box(x, ry - (half / 2) * Math.tan(pitch) - 0.05, z + s * (half / 2), w + 0.7, 0.16, len, { mat: X.shakes, rx: s * pitch, collide: false, uv: 2.4 });
    }
    for (const gx of [x - w / 2, x + w / 2]) {
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2, 0);
      shape.lineTo(d / 2, 0);
      shape.lineTo(0, (d / 2) * Math.tan(pitch));
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
      geo.translate(0, 0, -0.06);
      const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
      m.setPosition(gx, y + 2.65, z);
      B.mesh(geo, m, X.planksOut);
    }
    // the door (east, to the creek), the intake pipe into the creek, a barn light
    B.box(x + w / 2 + 0.03, y + 0.15, z - 0.4, 0.06, 2.0, 1.0, { mat: X.planksDark, collide: false });
    B.cylinder(x + w / 2 + 1.6, y + 0.45, z + 0.9, 0.11, 3.2, { mat: M.steelDark, horizontal: true, rot: 0.4, seg: 8, collide: false });
    const lx = x - w / 2 - 0.35;
    const lz = z - 1.0;
    B.box(lx + 0.18, y + 2.55, lz, 0.36, 0.04, 0.04, { mat: M.black, collide: false });
    B.cylinder(lx, y + 2.3, lz, 0.24, 0.18, { mat: X.paintGreen, rTop: 0.05, seg: 12, collide: false });
    B.bakedLamp(lx, y + 2.28, lz, { color: 0xffd09a, intensity: 22, range: 12, circuit: 'mine', glow: 1.3, fitting: new THREE.SphereGeometry(0.08, 8, 6), bright: 5 });
    const t = signTex([{ text: 'PUMP HOUSE', size: 64 }, { text: 'FLUME SUPPLY • DANGER', size: 28, weight: 600 }], { w: 512, h: 160, bg: '#e8e2d2', fg: '#2a2c2e' });
    B.sign(x - w / 2 - 0.02, y + 1.5, z + 1.1, -Math.PI / 2, t, 1.2, 0.38);
    // the hum of the pump comes from here once the breaker is thrown
    fx.pump = { x, y: y + 1, z };
  }

  // ---- the Prospector's Mine: a timber adit in a rock knoll at the north fence ------------------
  {
    const x = 44;
    const z = 12.6;
    const y = H(x, z);
    const rng = makeRng(404);
    for (const s of [-1, 1]) B.box(x + s * 2.0, y - 0.2, z, 0.36, 3.6, 0.36, { mat: X.planksDark, walkable: false });
    B.box(x, y + 3.2, z, 4.8, 0.4, 0.42, { mat: X.planksDark, collide: false });
    B.box(x, y - 0.2, z - 0.3, 3.7, 3.4, 0.1, { mat: M.black, collide: false });
    for (const [a, yy] of [[0.25, 1.0], [-0.2, 2.1]]) B.box(x, y + yy, z + 0.08, 3.9, 0.22, 0.06, { mat: X.planksDark, rz: a, collide: false });
    const t = signTex([{ text: "PROSPECTOR'S", size: 54 }, { text: 'GEM MINE', size: 74 }], { w: 512, h: 200, bg: '#5a3e28', fg: '#f2dfb8' });
    B.sign(x, y + 3.95, z + 0.25, 0, t, 2.8, 1.1);
    B.box(x, y + 3.45, z + 0.12, 3.0, 1.15, 0.08, { mat: X.planksDark, collide: false });
    B.physics.addBox({ x, y: y - 0.2, z: z - 0.4, w: 4.4, h: 3.6, d: 0.8, walkable: false, material: 'wood' });
    // the knoll: fractured boulders heaped around and behind the portal
    const heap = [[-4.0, -0.6, 1.8], [-5.6, -1.6, 2.2], [-3.2, -2.4, 2.0], [4.0, -0.5, 1.7], [5.4, -1.7, 2.3], [3.0, -2.6, 2.1], [0, -2.8, 2.4], [-1.6, -3.4, 2.2], [1.8, -3.6, 2.2], [-7.2, -0.3, 1.2], [7.0, -0.2, 1.3], [-2.6, -1.0, 1.0], [2.6, -1.0, 1.0]];
    for (const [dx, dz, r] of heap) {
      const bx = x + dx;
      const bz = z + dz;
      const g = boulder(r, Math.round(rng() * 1e4), [0.5, 0.47, 0.42]);
      B.mesh(g, placeAt(bx, H(bx, bz) + r * 0.25 + (Math.abs(dx) < 2.5 ? 1.6 : 0), bz, rng() * 6), M.rock);
      B.physics.addCylinder({ x: bx, z: bz, r: r * 0.85, y0: H(bx, bz) - 1, y1: H(bx, bz) + r, walkable: false, material: 'rock' });
    }
    // rails out of the adit to an ore cart full of "ore"
    for (const s of [-1, 1]) B.box(x + s * 0.5, y + 0.02, z + 3.5, 0.06, 0.08, 7, { mat: M.steelDark, collide: false });
    for (let k = 0; k < 9; k++) B.box(x, y - 0.02, z + 0.4 + k * 0.8, 1.4, 0.07, 0.18, { mat: X.planksDark, collide: false });
    const cz = z + 4.6;
    B.box(x, y + 0.3, cz, 1.0, 0.75, 1.5, { mat: M.rust, walkable: true, uv: 1 });
    for (const s of [-1, 1]) {
      for (const dz of [-0.5, 0.5]) B.cylinder(x + s * 0.5, y, cz + dz, 0.16, 0.06, { mat: M.black, horizontal: true, rot: 0, seg: 10, collide: false });
    }
    for (let k = 0; k < 7; k++) {
      const g = boulder(0.16 + rng() * 0.1, 900 + k, k % 3 === 0 ? [0.55, 0.42, 0.62] : [0.5, 0.45, 0.4]);
      B.mesh(g, placeAt(x + (rng() - 0.5) * 0.6, y + 1.05, cz + (rng() - 0.5) * 1.1, rng() * 6), M.rock, { cast: false });
    }
    // lanterns on the posts
    for (const s of [-1, 1]) {
      B.box(x + s * 2.0, y + 2.45, z + 0.3, 0.05, 0.05, 0.24, { mat: M.black, collide: false });
      B.bakedLamp(x + s * 2.0, y + 2.25, z + 0.45, { color: 0xffb468, intensity: 14, range: 9, circuit: 'mine', glow: 1.0, fitting: new THREE.BoxGeometry(0.14, 0.26, 0.14), bright: 4 });
    }
  }

  // ---- the creek: water, a footbridge, stones along the banks --------------------------------
  {
    const pts = [];
    for (let i = 0; i < CREEK.length; i++) pts.push(CREEK[i]);
    ribbon(B, X.water, pts, 2.3, H, { flat: true, lift: 0.32, uv: 4, across: 2, step: 0.7 });
    const rng = makeRng(808);
    for (let i = 0; i < CREEK.length - 1; i++) {
      const [ax, az] = CREEK[i];
      const [bx, bz] = CREEK[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 1.6) {
        const t = d / len;
        const side = rng() < 0.5 ? -1 : 1;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        const off = side * (1.3 + rng() * 0.6);
        const px = ax + (bx - ax) * t + nx * off;
        const pz = az + (bz - az) * t + nz * off;
        const r = 0.2 + rng() * 0.35;
        B.mesh(boulder(r, 3000 + i * 50 + Math.round(d * 3)), placeAt(px, H(px, pz) + r * 0.1, pz, rng() * 6), M.rock, { cast: false });
      }
    }
    // the footbridge on the east path
    const bx = 49.2;
    const bz = 36.4;
    const yb = Math.max(H(bx - 3.6, bz), H(bx + 3.6, bz)) + 0.25;
    B.box(bx, yb - 0.25, bz, 7.6, 0.25, 1.9, { mat: X.planksDark, walkable: true, uv: 1.5 });
    for (const s of [-1, 1]) {
      B.box(bx, yb - 0.55, bz + s * 0.8, 7.8, 0.32, 0.26, { mat: M.log, collide: false });
      for (const dx of [-3.6, -1.2, 1.2, 3.6]) B.box(bx + dx, yb, bz + s * 0.88, 0.12, 0.95, 0.12, { mat: X.planksDark, collide: false });
      B.box(bx, yb + 0.85, bz + s * 0.88, 7.4, 0.1, 0.12, { mat: X.planksDark, collide: false });
      B.physics.addBox({ x: bx, y: yb, z: bz + s * 0.92, w: 7.4, h: 1.0, d: 0.15, walkable: false, material: 'wood' });
    }
  }

  // ---- picnic tables, the Exo Reload corner, bins and benches ------------------------------
  for (const [x, z, r] of [[12.6, 52.5, 0.2], [12.2, 41.0, -0.3], [13.0, 30.5, 0.1], [40.5, 54.5, 0.5], [56.0, 54.6, -0.2], [70.5, 31.5, 0.3], [62.8, 33.4, -0.6], [38.6, 33.6, 0.15], [71.0, 45.0, 1.3]]) {
    picnicTable(B, M, X, x, H(x, z), z, r);
  }
  for (const [x, z] of [[15.8, 46.6], [64.2, 42.6], [33.6, 30.2]]) trashCan(B, M, X, x, H(x, z), z);
  bench(B, M, X, 66.5, H(66.5, 37.2), 37.2, 0.4, 1.8);
  // stone fire ring at the east end
  {
    const x = 66.5;
    const z = 47.0;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      B.mesh(boulder(0.24, 5100 + k), placeAt(x + Math.cos(a) * 0.85, H(x, z) + 0.08, z + Math.sin(a) * 0.85, a), M.rock, { cast: false });
    }
    B.cylinder(x, H(x, z) - 0.02, z, 0.7, 0.05, { mat: X.dirt, seg: 12, collide: false });
    B.physics.addCylinder({ x, z, r: 1.1, y0: H(x, z) - 0.5, y1: H(x, z) + 0.35, walkable: true, material: 'rock' });
  }
  void frame;
  void MINE;
}
