import * as THREE from '../../vendor/three.module.min.js';
import { PORTAL_MAIN, PORTAL_EXIT, MIRROR_LAKE } from './eh_shape.js';
import { signTex, frame, bench, stairs } from './eh_props.js';
import { stalagmite, column, drapery, flowLump, rimstone, placeAt } from './formations.js';
import { makeRng } from '../util.js';

// The show cave: the 1931 entry tunnel, the Grand Gallery around Mirror Lake, the passage to
// the Cathedral Room with its viewing platform, and the tunnel Avion blasted back out to the
// plaza (the old tour exit). Tour lights hang on the reactor's power.
export const SC = {
  entry: [[0, PORTAL_MAIN.z - 2.4], [0.4, -34], [-1.9, -43], [-5.6, -51.5], [-8.6, -57.5]],
  gallery: [[-8.6, -57.5], [-11.8, -62.5], [-14.6, -67], [-15.6, -71.5], [-18.6, -76.2], [-24, -78.6], [-29.5, -79.6], [-32.4, -79.4]],
  toCathedral: [[-15.6, -71.5], [-10, -74.5], [-3, -77.2], [4, -79.2], [12, -80.4], [21, -84], [28.4, -87], [31.6, -88.2]],
  cathedral: [[37.4, -88.6], [41.6, -87.6], [44.8, -85.2], [42.6, -82.2], [38.8, -81.2]],
  exit: [[38.8, -81.2], [37.6, -76], [34, -63], [30, -45], [26.5, -33], [25.6, PORTAL_EXIT.z - 1.6]],
  platform: { x0: 31.6, x1: 37.4, z0: -92.6, z1: -85.0 },
  organ: { x: 49.4, z: -97.2 },
  sentinels: { x: 4, z: -70.5 },
};

export function buildShowCave(S, K) {
  const { B, M, X } = S;
  const { F, CEIL } = K;
  const rng = makeRng(1927);
  const tour = 0xffd9a8;
  // keep the buyables, doors and spawns clear of formations
  for (const [x, z, r] of [[1.35, -37.5, 2.2], [41.2, -91.4, 2.2], [46.6, -88.8, 2.2], [52, -86, 2.6], [-39.2, -79.94, 4.5], [-32.4, -79.4, 3]]) K.reserve(x, z, r);

  // ---- entry tunnel ----------------------------------------------------------------------------
  K.walkway(SC.entry, 2.4, { mat: X.flag, rails: 'left', lights: 6, uv: 3.5, collideRails: false });
  for (const [x, z] of [[0.2, -29], [-0.6, -37], [-2.6, -45.2], [-5.4, -51.2]]) K.hangLamp(x, z, { intensity: 12, range: 10, color: tour });
  emergencyOnWall(K, 0.45, -31, 1);
  emergencyOnWall(K, -3.2, -47, 1);
  board(S, K, 1.45, PORTAL_MAIN.z - 4.6, -0.75, [{ text: 'WATCH YOUR HEAD', size: 64 }, { text: 'Low ceilings ahead • Stay on the path', size: 26, weight: 500 }], 1.2, 0.5);
  // the Avion supply board the Harrier hangs on
  K.board(1.35, -37.5, -Math.PI / 2, avionTex('AVION FIELD SUPPLY', 'EMBER HOLLOW • LEVEL 1'), 1.6, 1.1, { post: 0.8, boardMat: M.steelDark, postMat: M.steelDark });

  // ---- Grand Gallery ---------------------------------------------------------------------------
  K.walkway(SC.gallery.slice(0, 2), 2.6, { mat: X.flag, lights: 6, uv: 3.5 });
  K.walkway(SC.gallery.slice(1, 7), 2.6, { mat: X.flag, rails: 'left', lights: 6, lightSide: 1, uv: 3.5 });
  K.walkway(SC.gallery.slice(6), 2.6, { mat: X.flag, lights: 6, uv: 3.5 });
  K.walkway(SC.toCathedral.slice(0, 5), 2.6, { mat: X.flag, lights: 6, uv: 3.5 });
  // Mirror Lake: still black water in its basin, a sign by the rail
  {
    const g = new THREE.CircleGeometry(1, 40);
    g.rotateX(-Math.PI / 2);
    g.scale(MIRROR_LAKE.r + 1.6, 1, (MIRROR_LAKE.r + 1.6) / 1.25);
    const m = new THREE.Matrix4().makeTranslation(MIRROR_LAKE.x, MIRROR_LAKE.y, MIRROR_LAKE.z);
    B.mesh(g, m, X.lake, { cast: false });
    // the shore: stalagmites at the waterline and two little rimstone pools spilling into the lake
    for (const [ang, h, r] of [[2.2, 1.6, 0.32], [2.9, 2.4, 0.42], [3.5, 1.1, 0.26], [4.1, 1.9, 0.36], [0.4, 1.3, 0.3], [5.4, 2.1, 0.4]]) {
      const x = MIRROR_LAKE.x + Math.cos(ang) * (MIRROR_LAKE.r + 1.2);
      const z = MIRROR_LAKE.z + (Math.sin(ang) * (MIRROR_LAKE.r + 1.2)) / 1.25;
      if (K.pathDist(x, z) < 1.8) continue;
      B.mesh(stalagmite(h, r, Math.floor(ang * 1000)), placeAt(x, F(x, z) - 0.2, z, ang), X.calcite);
      B.physics.addCylinder({ x, z, r: r * 0.8, y0: F(x, z) - 0.5, y1: F(x, z) + h * 0.8, walkable: false, material: 'rock' });
    }
    for (const [ang, r] of [[1.25, 1.5], [1.75, 1.1]]) {
      const x = MIRROR_LAKE.x + Math.cos(ang) * (MIRROR_LAKE.r + 1.6);
      const z = MIRROR_LAKE.z + (Math.sin(ang) * (MIRROR_LAKE.r + 1.6)) / 1.25;
      const f = F(x, z);
      B.mesh(rimstone(r, ang + Math.PI * 0.55, ang + Math.PI * 1.45, 0.16, Math.floor(ang * 77)), new THREE.Matrix4().makeTranslation(x, f, z), X.calcite, { cast: false });
      const pool = new THREE.CircleGeometry(r * 0.95, 20);
      pool.rotateX(-Math.PI / 2);
      B.mesh(pool, new THREE.Matrix4().makeTranslation(x, f + 0.1, z), X.lake, { cast: false });
    }
    board(S, K, -14.6, -74.8, -Math.PI / 2 + 0.25, [{ text: 'MIRROR LAKE', size: 62 }, { text: '18 feet deep and so still it doubles the ceiling.', size: 22, weight: 500 }, { text: 'Please do not throw coins.', size: 22, weight: 500 }], 1.5, 0.7);
  }
  board(S, K, -5.6, -58.8, 0.25, [{ text: 'THE GRAND GALLERY', size: 58 }, { text: '180 feet across • ceiling 55 feet', size: 26, weight: 500 }], 1.5, 0.6);
  // The Sentinels: a stand of great stalagmites on the mound in the middle of the gallery
  {
    const { x, z } = SC.sentinels;
    const set = [[0, 0, 5.2, 0.9], [1.8, 1.2, 3.6, 0.7], [-1.6, 1.0, 4.1, 0.75], [0.9, -1.7, 2.9, 0.6], [-1.2, -1.4, 2.4, 0.5], [2.6, -0.6, 1.9, 0.42], [-2.7, 0.2, 1.6, 0.38]];
    for (const [dx, dz, h, r] of set) {
      const px = x + dx;
      const pz = z + dz;
      B.mesh(stalagmite(h, r, Math.floor(rng() * 1e6)), placeAt(px, F(px, pz) - 0.2, pz, rng() * 6), X.calcite);
      B.physics.addCylinder({ x: px, z: pz, r: r * 0.8, y0: F(px, pz) - 0.5, y1: F(px, pz) + h * 0.8, walkable: false, material: 'rock' });
    }
    K.reserve(x, z, 4);
  }
  // great columns near the walls of the gallery
  for (const [x, z, r] of [[-28.5, -60.5, 1.2], [9.5, -86.5, 1.0], [-2.5, -89.5, 1.4], [14.6, -63.5, 0.9]]) {
    const f = F(x, z);
    const c = CEIL(x, z);
    if (c - f < 3 || c - f > 18) continue;
    B.mesh(column(c - f + 0.8, r, Math.floor(rng() * 1e6)), placeAt(x, f - 0.4, z, rng() * 6), X.calcite);
    B.physics.addCylinder({ x, z, r: r * 0.9, y0: f - 0.5, y1: c, walkable: false, material: 'rock' });
    K.reserve(x, z, r + 1);
  }
  // draperies along the north wall
  draperyRun(S, K, [[-22, -86.5], [-14, -88.6], [-6, -89.4]], 3.2, 31);
  draperyRun(S, K, [[2, -88.4], [8, -87.0]], 2.4, 32);
  K.scatter(150, K.inEllipse(-10, -72, 26, 19, 0.2), { seed: 11, clear: 0, kind: () => 'tite', titeL: 2.2 });
  K.scatter(36, K.inEllipse(-10, -72, 25, 18, 0.2), { seed: 12, clear: 2.2, minWall: 1.2, kind: (r) => (r() < 0.8 ? 'mite' : 'boulder'), miteH: 2.6 });
  K.scatter(12, K.inEllipse(-10, -72, 26, 19, 0.2), { seed: 13, clear: 2.4, minWall: 0.4, maxWall: 3.0, kind: () => 'flow' });
  // tour lighting: coloured floods on the formations, path lights, a lift for the dome
  K.flood(-3.6, -65.6, [3.8, 1.6, -70.6], 0xffb468, 90, 22, { angle: 0.55 });
  K.flood(-15.0, -67.8, [-26, MIRROR_LAKE.y, -71], 0x9fd2ff, 55, 20, { angle: 0.75 });
  K.flood(-12.4, -80.6, [-11, 5, -90], 0xffe0b8, 85, 22, { angle: 0.6 });
  K.flood(-22.6, -59.6, [-28.5, 5, -60.5], 0xff9a8a, 45, 16, { angle: 0.45 });
  K.flood(6.4, -76.4, [12.5, 4, -66], 0xfff0dc, 55, 20, { angle: 0.6 });
  K.flood(-8.5, -69.0, [-9, 16, -72], 0xffd9a8, 130, 26, { angle: 0.9 });
  K.flood(0.6, -84.4, [-2.5, 6, -89.5], 0xb8ffd8, 40, 16, { angle: 0.4 });
  for (const [line, d, off] of [[SC.gallery, 4, 1.9], [SC.gallery, 21, 1.9], [SC.gallery, 33, -1.9], [SC.toCathedral, 22, 1.9]]) {
    const [x, z] = K.beside(line, d, off);
    emergencyPost(S, K, x, z);
  }

  // ---- passage and the Cathedral Room ------------------------------------------------------------
  K.walkway(SC.toCathedral.slice(4), 2.4, { mat: X.flag, rails: 'right', lights: 6, uv: 3.5, collideRails: false });
  K.scatter(30, K.alongLine(SC.toCathedral.slice(4), 3.5), { seed: 21, clear: 0, kind: () => 'tite', titeL: 1.4 });
  K.flood(15.4, -83.0, [18, 3, -78.6], 0xffd9a8, 40, 14, { angle: 0.7 });
  K.flood(24.6, -86.4, [24, 4, -82.8], 0xffe0c0, 40, 14, { angle: 0.7 });
  // the viewing platform: a timber deck a step above the floor, rails round the room side
  {
    const P = SC.platform;
    const cx = (P.x0 + P.x1) / 2;
    const cz = (P.z0 + P.z1) / 2;
    const top = Math.max(F(P.x0, P.z0), F(P.x1, P.z0), F(P.x0, P.z1), F(P.x1, P.z1)) + 0.55;
    B.box(cx, top - 1.4, cz, P.x1 - P.x0, 1.4, P.z1 - P.z0, { mat: X.planksDark, uv: 1.5, walkable: true });
    stairs(B, M, X.planksDark, P.x0 - 1.3, -88.2, F(P.x0 - 1.3, -88.2), P.x0, -88.2, top, 2.2, { rails: false });
    stairs(B, M, X.planksDark, P.x1 + 1.3, -88.6, F(P.x1 + 1.3, -88.6), P.x1, -88.6, top, 2.2, { rails: false });
    const rail = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(-(bz - az), bx - ax);
      for (const hy of [0.5, 1.0]) B.box((ax + bx) / 2, top + hy, (az + bz) / 2, len, 0.06, 0.08, { mat: X.planksDark, rot, collide: false });
      const n = Math.max(1, Math.round(len / 1.4));
      for (let k = 0; k <= n; k++) B.box(ax + ((bx - ax) * k) / n, top, az + ((bz - az) * k) / n, 0.1, 1.05, 0.1, { mat: X.planksDark, collide: false });
      B.physics.addBox({ x: (ax + bx) / 2, y: top, z: (az + bz) / 2, w: len, h: 1.1, d: 0.14, rot, walkable: false, material: 'wood' });
    };
    rail(P.x0, P.z0, P.x1, P.z0);
    rail(P.x1, P.z0, P.x1, -89.9);
    rail(P.x1, -87.3, P.x1, P.z1);
    rail(P.x0, P.z1, P.x1, P.z1);
    rail(P.x0, P.z0, P.x0, -89.5);
    for (let k = 0; k < 3; k++) {
      const x = P.x0 + 1 + k * 1.9;
      B.bakedLamp(x, top + 1.08, P.z0 + 0.05, { color: tour, intensity: 5, range: 6, circuit: 'reactor', glow: 0.4, fitting: new THREE.BoxGeometry(0.12, 0.05, 0.12), bright: 4 });
    }
    bench(B, M, X, cx, top, P.z1 - 0.8, Math.PI, 2.0);
    const t = signTex([{ text: 'THE CATHEDRAL ROOM', size: 58 }, { text: 'Seventy-four feet to the dome. The column', size: 22, weight: 500 }, { text: 'before you is the Pipe Organ — 9,000 years', size: 22, weight: 500 }, { text: 'of dripping water, still growing.', size: 22, weight: 500 }], { w: 512, h: 300 });
    K.board(cx + 0.6, P.z0 + 0.45, 0, t, 1.6, 0.95, { post: 0.6, y: top });
    K.reserve(cx, cz, 5);
    SC.platform.top = top;
  }
  // the Pipe Organ: a column the height of the room, a frozen waterfall of flowstone behind it
  {
    const { x, z } = SC.organ;
    const f = F(x, z);
    const c = CEIL(x, z);
    B.mesh(column(c - f + 1.2, 2.5, 4471), placeAt(x, f - 0.6, z, 0.4), X.calcite);
    B.physics.addCylinder({ x, z, r: 2.3, y0: f - 0.5, y1: c, walkable: false, material: 'rock' });
    for (let k = 0; k < 9; k++) {
      const a = 4.4 + k * 0.32;
      const px = x + Math.cos(a) * (4 + rng() * 2);
      const pz = z + Math.sin(a) * (4 + rng() * 2);
      const r = 1.2 + rng() * 1.3;
      B.mesh(flowLump(r, r * 0.8, r, 300 + k), placeAt(px, F(px, pz) - 0.2 + k * 0.05, pz, rng() * 6), X.calcite);
    }
    K.reserve(x, z, 6.5);
  }
  K.walkway(SC.cathedral, 2.2, { mat: X.flag, lights: 5, uv: 3.5 });
  // the Avion supply board the Osprey hangs on
  K.board(41.2, -91.4, 0, avionTex('AVION FIELD SUPPLY', 'CATHEDRAL • LEVEL 1'), 1.6, 1.1, { post: 0.8, boardMat: M.steelDark, postMat: M.steelDark });
  draperyRun(S, K, [[30.6, -95.8], [34.6, -100.4], [40.6, -104.6]], 4.6, 41);
  draperyRun(S, K, [[55.2, -88.6], [57.8, -94.2]], 3.6, 42);
  K.scatter(90, K.inEllipse(43, -93, 15, 12, -0.3), { seed: 31, clear: 0, kind: () => 'tite', titeL: 3.0 });
  K.scatter(16, K.inEllipse(43, -93, 14, 11, -0.3), { seed: 32, clear: 2.0, minWall: 1.0, kind: (r) => (r() < 0.75 ? 'mite' : 'boulder'), miteH: 3.2 });
  K.flood(43.8, -93.8, [49.4, 9, -97.2], 0xffb060, 140, 30, { angle: 0.42 });
  K.flood(53.6, -91.6, [49.4, 7, -97.2], 0xffc888, 110, 28, { angle: 0.45 });
  K.flood(40.2, -89.2, [43, 18, -95], 0xc8e0ff, 120, 32, { angle: 0.95 });
  K.flood(37.0, -96.4, [33, 4, -100], 0xffe0c0, 60, 18, { angle: 0.6 });
  for (const [line, d, off] of [[SC.cathedral, 3, -1.7], [SC.cathedral, 9, 1.7]]) {
    const [x, z] = K.beside(line, d, off);
    emergencyPost(S, K, x, z);
  }

  // ---- Avion's exit tunnel back up to the plaza ---------------------------------------------------
  K.walkway(SC.exit, 2.8, { mat: M.concrete, lights: 0, uv: 3 });
  for (let i = 1; i < SC.exit.length - 1; i++) {
    const [ax, az] = SC.exit[i];
    const [bx, bz] = SC.exit[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 3; d < len; d += 9) {
      const t = d / len;
      K.strip(ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(-(bz - az), bx - ax));
    }
  }
  K.duct(SC.exit.slice(1), { offset: 0.9, drop: 0.55, r: 0.28 });
  K.tray(SC.exit.slice(1), -1, 4.2, 2.3);
  for (const [x, z] of [[33.2, -60], [27.6, -36]]) emergencyOnWall(K, x, z, 1, 0xff3a2a);
}

// An emergency lamp on a short post beside the path (battery backed, lit while the power is out).
function emergencyPost(S, K, x, z) {
  const { B, M } = S;
  const y = K.F(x, z);
  B.box(x, y - 0.2, z, 0.08, 0.95, 0.08, { mat: M.steelDark, collide: false });
  K.emergency(x, y + 0.85, z, 0xffa040);
}

// An emergency lamp bracketed off the tunnel wall on the given side of (x,z).
function emergencyOnWall(K, x, z, side, color = 0xffa040) {
  const w = K.toWall(x, z, side, 0, 6);
  const px = w ? w.x - side * 0.35 : x;
  const pz = w ? w.z : z;
  K.emergency(px, K.F(px, pz) + 2.3, pz, color);
}

// Curtain formations hanging from the ceiling along a line near a wall.
function draperyRun(S, K, line, drop, seed) {
  const { B, X } = S;
  const pts = [];
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i];
    pts.push([x, K.CEIL(x, z) + 0.15, z]);
  }
  const g = drapery(pts, (t) => drop * (0.55 + 0.45 * Math.sin(t * Math.PI)), seed, true);
  B.mesh(g, new THREE.Matrix4(), X.calciteDouble, { cast: false });
}

function board(S, K, x, z, rot, lines, w, h) {
  const tex = signTex(lines, { w: 512, h: Math.round((512 * h) / w) });
  K.board(x, z, rot, tex, w, h, { post: 0.75 });
}

function avionTex(a, b) {
  return signTex([{ text: a, size: 52 }, { text: b, size: 28, weight: 600 }], { w: 512, h: 350, bg: '#1d2226', fg: '#e8e4d8' });
}

void frame;
