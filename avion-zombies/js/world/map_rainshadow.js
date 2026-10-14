import * as THREE from '../../vendor/three.module.min.js';
import { makeNoise2D, makeRng, smoothstep, clamp, distToSegment2, lerp } from '../util.js';
import { makeSign, makeEmblemTexture } from './textures.js';
import { mergeGeometries } from './materials.js';

// RAINSHADOW - Avion Exo Research Site 9, Olympic Peninsula.
// x = east, z = south (north is -z). The sun sets over the ridge to the west-north-west.

const noise = makeNoise2D(2026);

export const ZONES = [
  { id: 0, name: 'TRAILHEAD', rects: [[-52, 6, -14, 46]], adjacent: [1, 3], indoor: 0 },
  { id: 1, name: 'CHECKPOINT', rects: [[-14, 6, 30, 46]], adjacent: [0, 2], indoor: 0 },
  { id: 2, name: 'RESEARCH WING', rects: [[6, -26, 42, 6]], adjacent: [1, 4], indoor: 1 },
  { id: 3, name: 'RIDGE OVERLOOK', rects: [[-92, -50, -34, 6]], adjacent: [0, 4], indoor: 0 },
  { id: 4, name: 'HANGAR', rects: [[-34, -46, 42, -26], [-14, -78, 30, -46]], adjacent: [2, 3], indoor: 0.6 },
];

export const DOORS = [
  { id: 1, key: 'A', zones: [0, 1], cost: 750, type: 'gate', x: -14, z: 27, rot: Math.PI / 2, w: 6, h: 3.2, label: 'Checkpoint Gate' },
  { id: 2, key: 'B', zones: [0, 3], cost: 1000, type: 'debris', x: -43, z: 6, rot: 0, w: 8, h: 2.6, label: 'Clear Fallen Trees' },
  { id: 3, key: 'C', zones: [1, 2], cost: 1000, type: 'blast', x: 20, z: 6, rot: 0, w: 3.6, h: 3.2, label: 'Research Wing' },
  { id: 4, key: 'D', zones: [2, 4], cost: 1250, type: 'blast', x: 24, z: -26, rot: 0, w: 4, h: 3.4, label: 'Hangar Yard' },
  { id: 5, key: 'E', zones: [3, 4], cost: 1250, type: 'gate', x: -34, z: -36, rot: Math.PI / 2, w: 6, h: 3.2, label: 'Ridge Gate' },
];

export const SPAWNERS = [
  // trailhead (ground)
  [-48, 12, 0], [-50, 30, 0], [-46, 42, 0], [-36, 44, 0], [-22, 44, 0], [-18, 11, 0], [-30, 9, 0], [-50, 21, 0],
  // checkpoint
  [-10, 44, 1], [6, 44.5, 1], [20, 44.5, 1], [28, 30, 1], [28, 20, 1], [-12, 15, 1], [-2, 8, 1],
  // research wing (vents)
  [10, -10, 2, 'vent'], [38, -9.5, 2, 'vent'], [13, 1.5, 2, 'vent'], [37, -24.5, 2, 'vent'], [24, -18, 2, 'vent'],
  // ridge
  [-74, -40, 3], [-70, 1, 3], [-56, 3, 3], [-40, -6, 3], [-38, -46, 3], [-62, -47, 3], [-47, -20, 3], [-76, -12, 3],
  // hangar yard + hangar vents
  [-30, -44, 4], [-28, -28, 4], [-2, -28, 4], [38, -29, 4], [40, -44, 4],
  [-11, -72, 4, 'vent'], [26, -52, 4, 'vent'], [14, -75, 4, 'vent'], [-11, -56, 4, 'vent'],
].map(([x, z, zone, type]) => ({ x, z, zone, type: type || 'ground' }));

export const PLAYER_START = { x: -24, z: 27, yaw: 1.1 };
// yaw: 0 looks down -z (north); +PI/2 looks west (-x)

export const WALLBUYS = [
  { weapon: 'owl', x: -27.22, y: 1.5, z: 40, rot: -Math.PI / 2 }, // cabin west wall
  { weapon: 'wren', x: -42, y: 0.62, z: 27.33, rot: 0 }, // supply pod
  { weapon: 'kestrel', x: -6.56, y: 1.5, z: 33, rot: Math.PI / 2 }, // guard booth east wall
  { weapon: 'shrike', x: -4, y: 1.4, z: 15.3, rot: 0 }, // container side
  { weapon: 'harrier', x: 30, y: 1.6, z: -3.82, rot: 0 }, // lobby north partition
  { weapon: 'osprey', x: 27.18, y: 1.6, z: -10, rot: Math.PI / 2 }, // corridor east wall
  { weapon: 'heron', x: -55.66, y: 1.5, z: -6.5, rot: Math.PI / 2 }, // bunker east wall
  { weapon: 'goshawk', x: -12.5, y: 1.6, z: -45.56, rot: 0 }, // hangar west pillar
];

export const PERKS = [
  { perk: 'medic', x: -6, z: 7.6, rot: 0 },
  { perk: 'health', x: 41.2, z: 2.5, rot: -Math.PI / 2 },
  { perk: 'reload', x: 41.2, z: -21, rot: -Math.PI / 2 },
  { perk: 'slam', x: -63.6, z: -2.2, rot: 0 },
  { perk: 'stabilizer', x: -6, z: -27.2, rot: Math.PI },
  { perk: 'velocity', x: -13.2, z: -53, rot: Math.PI / 2 },
];

export const BOX_LOCATIONS = [
  { x: 10, z: -21.5, rot: 0, zone: 2 },
  { x: -46.8, z: -27.5, rot: Math.PI / 2, zone: 3 },
  { x: 33, z: -40, rot: Math.PI, zone: 4 },
];
export const BOX_START = 0;
export const UPGRADE_STATION = { x: 24, z: -71, rot: 0 };
export const POWER_SWITCH = { x: 8, z: -77.2, rot: 0 };
export const EXO_STATION = { x: 25.3, z: 14, rot: -Math.PI / 2 };

export const BOUNDS = { minX: -92, maxX: 44, minZ: -80, maxZ: 48 };

// ------------------------------------------------------------------------------------------
// Terrain shaping
// ------------------------------------------------------------------------------------------
const FLATTEN = [
  // x0, z0, x1, z1, height, margin
  [-14, 6, 30, 46, 0.6, 7],
  [5, -27, 43, 7, 0.6, 5],
  [-16, -80, 32, -44, 1.0, 6],
  [-34, -46, 44, -26, 1.0, 6],
  [-66, -12, -55, -1, null, 4],
  [-56, -42, -46, -33, null, 3],
];

function rectMask(x, z, x0, z0, x1, z1, margin) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  const d = Math.hypot(dx, dz);
  return 1 - smoothstep(0, margin, d);
}

function outsideDist(x, z) {
  // distance outside the union of zone rects
  let best = Infinity;
  for (const zone of ZONES) {
    for (const [x0, z0, x1, z1] of zone.rects) {
      const dx = Math.max(x0 - x, 0, x - x1);
      const dz = Math.max(z0 - z, 0, z - z1);
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

export function cliffEdge(z) {
  return -80 + noise.fbm(z / 22, 4.2, 3) * 5;
}

function rawHeight(x, z) {
  let h = 1.0 * noise.fbm(x / 38, z / 38, 4) + 0.35 * noise.fbm(x / 9, z / 9, 2);
  // the ridge: a broad shoulder rising to the north-west
  const rd = ((x + 62) ** 2 + (z + 26) ** 2) / (2 * 23 * 23);
  h += 8.2 * Math.exp(-rd);
  h += 2.5 * Math.exp(-(((x + 50) ** 2 + (z + 38) ** 2) / (2 * 10 * 10)));
  // hills beyond the playable area (not over the cliff)
  const od = outsideDist(x, z);
  const hill = smoothstep(4, 45, od) * (9 + 9 * noise.fbm(x / 60 + 7, z / 60, 3));
  const westness = smoothstep(-70, -86, x);
  h += hill * (1 - westness);
  return h;
}

export function heightFn(x, z) {
  let h = rawHeight(x, z);
  for (const [x0, z0, x1, z1, target, margin] of FLATTEN) {
    const m = rectMask(x, z, x0, z0, x1, z1, margin);
    if (m <= 0) continue;
    const t = target == null ? rawHeight((x0 + x1) / 2, (z0 + z1) / 2) : target;
    h = lerp(h, t, m);
  }
  // logging road: shallow bed
  const rd = roadDistance(x, z);
  if (rd < 4) h = lerp(h, h - 0.12, 1 - rd / 4);
  // cliff: the ridge falls away into a fog-filled valley
  const edge = cliffEdge(z);
  if (x < edge) {
    const f = smoothstep(edge, edge - 14, x);
    const valley = -96 + 10 * noise.fbm(x / 50, z / 50, 3);
    h = lerp(h, valley, f);
  }
  return h;
}

export const ROAD = [[-70, 48], [-52, 38], [-38, 31], [-24, 28], [-14, 27], [-2, 26.5], [10, 22], [17, 14], [20, 7]];
export const TRAIL = [[-43, 9], [-46, 0], [-50, -10], [-58, -18], [-66, -23]];
export const TRAIL2 = [[-50, -10], [-49, -24], [-48, -33], [-40, -36], [-30, -36]];

function polyDist(pts, x, z) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distToSegment2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}
export function roadDistance(x, z) {
  return polyDist(ROAD, x, z);
}
function trailDistance(x, z) {
  return Math.min(polyDist(TRAIL, x, z), polyDist(TRAIL2, x, z));
}

export function zoneAt(x, z) {
  // later zones win where rects touch; returns zone id + 1 (0 = outside)
  let found = 0;
  for (const zone of ZONES) {
    for (const [x0, z0, x1, z1] of zone.rects) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) found = zone.id + 1;
    }
  }
  return found;
}

export function inPlayable(x, z, margin = 0) {
  return outsideDist(x, z) <= margin;
}

export function meadowMask(x, z) {
  if (zoneAt(x, z) !== 4) return 0; // zone id 3 + 1
  const h = heightFn(x, z);
  if (trailDistance(x, z) < 1.4) return 0;
  return smoothstep(2.2, 4.5, h) * (0.55 + 0.45 * noise.fbm(x / 6, z / 6, 2)) * 0.95;
}

export function treeClearance(x, z) {
  const od = outsideDist(x, z);
  if (od < 2.0) return 0;
  if (roadDistance(x, z) < 5) return 0;
  if (x < cliffEdge(z) + 1.5 && x > cliffEdge(z) - 30) return 0;
  return 1;
}

export function fernAllowed(x, z) {
  const zid = zoneAt(x, z);
  if (zid === 2 || zid === 3 || zid === 5) return false;
  if (zid === 4) return heightFn(x, z) < 3.5 && trailDistance(x, z) > 2;
  if (zid === 1) return roadDistance(x, z) > 4 && Math.hypot(x + 33, z - 27) > 9;
  if (roadDistance(x, z) < 3.5) return false;
  if (x < cliffEdge(z) + 1) return false;
  return true;
}

export function terrainColor(x, z, h, n, c) {
  const slope = 1 - n.y;
  const rd = roadDistance(x, z);
  const td = trailDistance(x, z);
  // forest floor tint (texture already carries detail)
  const moss = 0.5 + 0.5 * noise.fbm(x / 14, z / 14, 3);
  c.setRGB(0.62 + 0.15 * moss, 0.66 + 0.22 * moss, 0.55 + 0.05 * moss);
  const zid = zoneAt(x, z);
  if (zid === 4) {
    // subalpine meadow: rust + gold
    const m = smoothstep(2.2, 4.5, h);
    c.lerp(new THREE.Color(1.05, 0.62, 0.36), m * 0.85);
  }
  if (zid === 2 || zid === 5) c.lerp(new THREE.Color(0.55, 0.52, 0.48), 0.6); // packed dirt in the compound/yard
  if (td < 1.8) c.lerp(new THREE.Color(0.78, 0.68, 0.55), (1 - td / 1.8) * 0.8);
  if (rd < 3.6) c.lerp(new THREE.Color(0.74, 0.7, 0.64), (1 - rd / 3.6) * 0.75);
  if (slope > 0.35) c.lerp(new THREE.Color(0.48, 0.47, 0.46), smoothstep(0.35, 0.7, slope));
  if (h < -20) c.setRGB(0.3, 0.36, 0.3);
}

export function walkFn(x, z) {
  return x > cliffEdge(z) + 0.5;
}

// Boulders for cover + extra trees inside the playable space.
export const ROCKS = [
  { x: -46, z: 37, s: 1.6 }, { x: -18, z: 18, s: 1.3 }, { x: -49, z: 15, s: 1.8, v: 1 }, { x: -27, z: 44, s: 1.2, v: 2 },
  { x: -64, z: -34, s: 2.2 }, { x: -72, z: -6, s: 1.9, v: 1 }, { x: -44, z: -14, s: 1.4, v: 2 }, { x: -58, z: -45, s: 2.4 },
  { x: -38, z: -24, s: 1.5, v: 1 }, { x: -77, z: -30, s: 1.7 }, { x: -68, z: -42, s: 1.3, v: 2 }, { x: -41, z: -2, s: 1.2 },
  { x: -54, z: -27, s: 1.0, v: 1 },
];
export const LOGS = [
  { x: -40, z: 41, rot: 0.4, seed: 3 }, { x: -24, z: 15, rot: -0.9, seed: 4 }, { x: -70, z: -40, rot: 1.2, seed: 5 },
  { x: -45, z: -42, rot: 0.2, seed: 6 },
];
export const EXTRA_TREES = [
  [-47, 33], [-26, 35], [-50, 44], [-19, 30], [-33, 41], [-44, 20],
  [-73, -46], [-60, -14], [-42, -46], [-37, -12], [-69, -2], [-52, -2], [-76, -32], [-55, -48], [-40, -31],
];

// ------------------------------------------------------------------------------------------
// Structures
// ------------------------------------------------------------------------------------------
export function buildRainshadow(B, ctx) {
  const { terrain, textures, materials: M } = ctx;
  const H = (x, z) => terrain.heightAt(x, z);
  const fx = { fires: [], smoke: [], sparks: [], beacons: [], cryo: [], screens: [] };
  const signs = {};

  // ---- road + trails as draped ribbons -----------------------------------------------------
  drapeRibbon(B, terrain, ROAD, 6.5, M.gravel, 0.06);
  drapeRibbon(B, terrain, TRAIL, 2.2, M.gravel, 0.05);
  drapeRibbon(B, terrain, TRAIL2, 2.2, M.gravel, 0.05);

  // ---- playable boundary (invisible walls on forest edges, fences on facility edges) -------
  const invisible = (x1, z1, x2, z2, h = 8) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
    const y = Math.min(H(x1, z1), H(x2, z2)) - 2;
    B.physics.addBox({ x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, w: len, h: h + 4, d: 0.6, rot, walkable: false, material: 'dirt', bullets: false });
  };
  // trailhead: south + west forest edges, north edge either side of the debris
  invisible(-52, 46, -14, 46);
  invisible(-52, 6, -52, 46);
  invisible(-52, 6, -47.2, 6);
  invisible(-38.8, 6, -14, 6);
  // checkpoint: perimeter fence (west side has gate A)
  const yF = (x, z) => H(x, z);
  B.fence([[-14, 6], [-14, 24]], { yFn: yF });
  B.fence([[-14, 30], [-14, 46], [30, 46], [30, 6]], { yFn: yF });
  B.fence([[-14, 6], [6, 6]], { yFn: yF });
  invisible(-14, 6, 6, 6);
  // ridge: cliff edge rail, south + east limits
  for (let z = -50; z < 6; z += 4) {
    const x1 = cliffEdge(z) + 1.2;
    const x2 = cliffEdge(z + 4) + 1.2;
    invisible(x1, z, x2, z + 4, 10);
  }
  invisible(-92, -50, -34, -50, 10);
  invisible(-92, 6, -52, 6);
  invisible(-34, 6, -34, -33);
  invisible(-34, -39, -34, -50);
  B.fence([[-34, 4], [-34, -33]], { yFn: yF, h: 2.6 });
  B.fence([[-34, -39], [-34, -50]], { yFn: yF, h: 2.6 });
  // yard: south fence (west of the labs) + east fence
  B.fence([[-34, -26], [6, -26]], { yFn: yF });
  invisible(-34, -26, 6, -26);
  B.fence([[42, -26], [42, -46], [30, -46]], { yFn: yF });
  invisible(42, -26, 42, -46);
  invisible(30, -46, 42, -46);
  invisible(-34, -46, -14, -46);
  B.fence([[-34, -46], [-14, -46]], { yFn: yF });

  // ---- TRAILHEAD --------------------------------------------------------------------------
  buildWreck(B, M, H, -36, 17.5, 0.55, fx);
  buildCabin(B, M, H, -24, 40, textures, fx);
  buildSupplyPod(B, M, H, -42, 26.5);
  signs.trail = makeSign([{ text: 'RAINSHADOW TRAIL', size: 54 }, { text: 'OVERLOOK  2.4 MI  ↑', size: 40, weight: 600 }], { bg: '#4a3626', fg: '#efe4cc', stripe: false });
  postSign(B, M, H, -38, 8.5, 0.15, signs.trail, 2.4, 1.2);
  // the debris pile is the door itself (built by the doors system); add some loose logs around it
  B.box(-49.5, H(-49.5, 7) - 0.2, 7.5, 5, 0.9, 0.9, { mat: 'log', rot: 0.5, uv: 2 });

  // ---- CHECKPOINT ------------------------------------------------------------------------
  const g0 = 0.6;
  buildGuardBooth(B, M, -8, 33, g0);
  buildBarrier(B, M, -11.2, 27, g0);
  buildTruck(B, M, 3, 38, 0.25, g0);
  buildTruck(B, M, 12, 29, -1.25, g0);
  B.container(-4, 14, 0, g0, 'olive');
  B.container(10.5, 41.5, Math.PI / 2 + 0.05, g0, 'rust');
  B.container(24, 33, Math.PI / 2, g0, 'steelDark', { len: 9 });
  B.container(24, 33, Math.PI / 2, g0 + 2.6, 'olive', { len: 9 });
  buildExoArmory(B, M, EXO_STATION.x - 0.3, EXO_STATION.z, g0, textures);
  sandbags(B, M, -2, 22, 4.5, 0.3, g0);
  sandbags(B, M, 16, 24, 4, -0.9, g0);
  jersey(B, M, -12, 21, 0, g0);
  jersey(B, M, 2, 32.5, 1.1, g0);
  jersey(B, M, 6, 18, 0.2, g0);
  floodTower(B, M, -12, 44, g0, new THREE.Vector3(0.6, -0.5, -0.6));
  floodTower(B, M, 28.5, 8.5, g0, new THREE.Vector3(-0.7, -0.45, 0.55));
  signs.checkpoint = makeSign([{ text: 'AVION', size: 96 }, { text: 'RESEARCH SITE 9 — RESTRICTED', size: 34, weight: 600 }]);
  B.sign(-14.2, g0 + 3.9, 27, -Math.PI / 2, signs.checkpoint, 4.4, 2.2);
  B.sign(-13.8, g0 + 3.9, 27, Math.PI / 2, signs.checkpoint, 4.4, 2.2);
  B.lamp(-8, g0 + 3.1, 33, { color: 0xffd0a0, intensity: 12, distance: 10, zone: 1 });
  B.lamp(-6, g0 + 2.9, 8.3, { color: 0x9fd6ff, intensity: 8, distance: 7, zone: 1 });

  // ---- RESEARCH WING ---------------------------------------------------------------------
  buildLabs(B, M, textures, fx, signs);

  // ---- RIDGE -----------------------------------------------------------------------------
  buildBunker(B, M, H, -60.5, -6.5, textures);
  buildOverlook(B, M, H, textures);
  buildRadioTower(B, M, H, -51, -37.5, fx);

  // ---- HANGAR + YARD ---------------------------------------------------------------------
  buildHangar(B, M, textures, fx, signs);
  const gy = 1.0;
  B.container(-24, -30.5, 0.08, gy, 'rust');
  B.container(14, -43.5, 0, gy, 'olive');
  B.container(37, -36, Math.PI / 2, gy, 'steelDark', { len: 9 });
  fuelTank(B, M, -27, -41, gy);
  fuelTank(B, M, -22.5, -42.5, gy);
  sandbags(B, M, 2, -34, 5, 0, gy);
  jersey(B, M, 24, -31, 0.3, gy);
  jersey(B, M, -8, -37, -0.4, gy);
  helipad(B, M, 0, -36, gy);
  floodTower(B, M, -32, -27.5, gy, new THREE.Vector3(0.7, -0.45, -0.5));
  floodTower(B, M, 41, -27.5, gy, new THREE.Vector3(-0.7, -0.45, -0.5));

  return { fx, signs };
}

// ------------------------------------------------------------------------------------------
function drapeRibbon(B, terrain, pts, width, mat, lift) {
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k < n; k++) samples.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
  }
  samples.push(pts[pts.length - 1]);
  for (let i = 0; i < samples.length; i++) {
    const [x, z] = samples[i];
    const [xa, za] = samples[Math.max(0, i - 1)];
    const [xb, zb] = samples[Math.min(samples.length - 1, i + 1)];
    let dx = xb - xa;
    let dz = zb - za;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const nx = -dz;
    const nz = dx;
    if (i > 0) dist += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
    for (const side of [-1, 1]) {
      const wobble = 1 + 0.12 * Math.sin(dist * 0.7 + side);
      const px = x + nx * side * (width / 2) * wobble;
      const pz = z + nz * side * (width / 2) * wobble;
      pos.push(px, terrain.heightAt(px, pz) + lift, pz);
      uv.push(side < 0 ? 0 : width / 4, dist / 4);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  B.mesh(g, new THREE.Matrix4(), mat, { cast: false });
}

function buildWreck(B, M, H, x, z, rot, fx) {
  const y = H(x, z) - 0.3;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  // fuselage (nose buried in the dirt), cockpit, wing, tail
  B.box(x, y, z, 10, 3.0, 3.4, { mat: 'steelDark', rot, rz: 0.06, uv: 3 });
  const [nx, nz] = at(6.4, 0);
  B.box(nx, y - 0.2, nz, 3.2, 2.4, 2.9, { mat: 'steelDark', rot: rot + 0.18, rz: -0.25, uv: 3 });
  B.box(nx, y + 1.0, nz, 2.2, 0.9, 2.5, { mat: 'glass', rot: rot + 0.18, rz: -0.25, collide: false });
  const [wx, wz] = at(0.5, 4.3);
  B.box(wx, y + 0.1, wz, 3.6, 0.35, 6.2, { mat: 'olive', rot: rot + 0.2, rx: 0.18, uv: 3 });
  const [wx2, wz2] = at(-1.5, -3.6);
  B.box(wx2, y - 0.1, wz2, 3.2, 0.35, 3.0, { mat: 'olive', rot: rot - 0.4, rx: -0.3, uv: 3 });
  const [tx, tz] = at(-5.8, 0);
  B.box(tx, y + 2.6, tz, 2.4, 2.6, 0.3, { mat: 'olive', rot, collide: false });
  // engine nacelle torn off
  const [ex, ez] = at(2, -6.6);
  B.cylinder(ex, H(ex, ez) - 0.2, ez, 0.8, 3.2, { mat: 'steel', horizontal: true, rot: rot + 0.7, collide: false });
  B.physics.addCylinder({ x: ex, z: ez, r: 1.2, y0: H(ex, ez) - 0.5, y1: H(ex, ez) + 1.4, walkable: true, material: 'metal' });
  // markings
  const decal = makeEmblemTexture('#d8d2c2');
  const [dx, dz] = at(0, 1.72);
  B.sign(dx, y + 1.8, dz, rot, decal, 1.6, 1.6, { transparent: true });
  // fires
  fx.fires.push({ x: ex + 0.6, y: H(ex, ez) + 0.6, z: ez, size: 1.3 });
  const [fx1, fz1] = at(-2, 2);
  fx.fires.push({ x: fx1, y: y + 3.0, z: fz1, size: 0.8 });
  fx.smoke.push({ x: ex, y: H(ex, ez) + 1.5, z: ez });
  fx.smoke.push({ x: fx1, y: y + 3.4, z: fz1 });
  B.lamp(ex + 0.5, H(ex, ez) + 1.2, ez, { color: 0xff8a3a, intensity: 22, distance: 16, flicker: 0.6, glow: false, zone: 0 });
}

function buildCabin(B, M, H, x, z, textures, fx) {
  const y = H(x, z) - 0.2;
  const w = 6;
  const d = 4.6;
  const h = 3.3;
  // log walls
  B.wall(x - w / 2, z - d / 2, x + w / 2, z - d / 2, { h, t: 0.35, y0: y, mat: 'planks', uv: 3 });
  B.wall(x - w / 2, z + d / 2, x + w / 2, z + d / 2, { h, t: 0.35, y0: y, mat: 'planks', uv: 3 });
  B.wall(x - w / 2, z - d / 2, x - w / 2, z + d / 2, { h, t: 0.35, y0: y, mat: 'planks', uv: 3 });
  B.wall(x + w / 2, z - d / 2, x + w / 2, z + d / 2, { h, t: 0.35, y0: y, mat: 'planks', uv: 3, openings: [{ at: 2.3, w: 1.2, h: 2.2 }] });
  // roof (visual A-frame, collision kept high so the roof is not a perch)
  B.box(x, y + h + 0.6, z - 1.25, w + 0.8, 0.22, 3.0, { mat: 'tarp', rx: 0.42, collide: false });
  B.box(x, y + h + 0.6, z + 1.25, w + 0.8, 0.22, 3.0, { mat: 'tarp', rx: -0.42, collide: false });
  B.physics.addBox({ x, y: y + h, z, w: w + 0.8, h: 1.6, d: d + 0.6, walkable: false, material: 'wood', nav: false });
  B.box(x + w / 2 + 0.5, y, z + 0.6, 1.0, 0.25, 2.4, { mat: 'planks', walkable: true });
  const sign = makeSign([{ text: 'RANGER STATION', size: 56 }, { text: 'OLYMPIC NF — CLOSED', size: 34, weight: 600 }], { bg: '#4a3626', fg: '#efe4cc', stripe: false });
  B.sign(x, y + h - 0.6, z + d / 2 + 0.19, 0, sign, 2.6, 1.2);
  B.lamp(x + w / 2 + 0.3, y + 2.6, z + 0.2, { color: 0xffc27a, intensity: 10, distance: 9, flicker: 0.15, zone: 0 });
}

function buildSupplyPod(B, M, H, x, z) {
  const y = H(x, z);
  B.box(x, y - 0.1, z, 2.2, 1.3, 1.6, { mat: 'olive', uv: 2 });
  B.box(x, y + 1.2, z, 2.3, 0.12, 1.7, { mat: 'hazard', collide: false, uv: 2 });
  B.box(x + 1.8, y - 0.1, z + 0.6, 1.0, 0.9, 1.0, { mat: 'steelDark', rot: 0.4 });
}

function postSign(B, M, H, x, z, rot, tex, w, h) {
  const y = H(x, z);
  B.box(x - Math.cos(rot) * (w / 2 - 0.1), y, z + Math.sin(rot) * (w / 2 - 0.1), 0.14, 2.3, 0.14, { mat: 'planks', rot, collide: false });
  B.box(x + Math.cos(rot) * (w / 2 - 0.1), y, z - Math.sin(rot) * (w / 2 - 0.1), 0.14, 2.3, 0.14, { mat: 'planks', rot, collide: false });
  B.sign(x + Math.sin(rot) * 0.08, y + 1.75, z + Math.cos(rot) * 0.08, rot, tex, w, h);
  B.sign(x - Math.sin(rot) * 0.08, y + 1.75, z - Math.cos(rot) * 0.08, rot + Math.PI, tex, w, h);
  B.physics.addBox({ x, y, z, w, h: 2.4, d: 0.3, rot, walkable: false, material: 'wood' });
}

function buildGuardBooth(B, M, x, z, y) {
  const w = 2.8;
  const d = 3.0;
  const h = 2.8;
  B.box(x, y, z, w, 1.0, d, { mat: 'concrete' });
  B.box(x, y + 1.0, z - d / 2 + 0.06, w, 1.4, 0.12, { mat: 'glass', collide: false });
  B.box(x, y + 1.0, z + d / 2 - 0.06, w, 1.4, 0.12, { mat: 'glass', collide: false });
  B.box(x - w / 2 + 0.06, y + 1.0, z, 0.12, 1.4, d, { mat: 'glass', collide: false });
  B.box(x + w / 2 - 0.06, y + 1.0, z, 0.12, 1.4, d, { mat: 'steel', collide: false });
  B.physics.addBox({ x, y: y + 1.0, z, w, h: 1.4, d, walkable: false, material: 'metal' });
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(x + px * (w / 2 - 0.08), y + 1.0, z + pz * (d / 2 - 0.08), 0.16, 1.4, 0.16, { mat: 'steelDark', collide: false });
  B.box(x, y + 2.4, z, w + 0.5, 0.4, d + 0.5, { mat: 'steelDark', walkable: true });
}

function buildBarrier(B, M, x, z, y) {
  B.box(x, y, z - 3.3, 0.6, 1.1, 0.6, { mat: 'hazard' });
  B.box(x, y + 0.9, z + 0.2, 0.18, 0.18, 6.6, { mat: 'hazard', collide: false });
}

function buildTruck(B, M, x, z, rot, y) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  B.box(x, y + 0.5, z, 7.6, 0.6, 2.5, { mat: 'black', rot, collide: false });
  const [cx, cz] = at(2.6, 0);
  B.box(cx, y + 1.0, cz, 2.2, 1.9, 2.5, { mat: 'olive', rot, uv: 2.5 });
  B.box(cx + c * 0.6, y + 1.9, cz - s * 0.6, 0.08, 0.7, 2.2, { mat: 'glass', rot, collide: false });
  const [bx, bz] = at(-1.3, 0);
  B.box(bx, y + 1.0, bz, 5.0, 0.4, 2.5, { mat: 'olive', rot, uv: 2.5 });
  B.box(bx, y + 1.4, bz, 5.0, 1.5, 2.5, { mat: 'tarp', rot, uv: 2.5 });
  for (const lx of [-2.8, -1.2, 2.6]) {
    for (const side of [-1, 1]) {
      const [wx, wz] = at(lx, side * 1.15);
      B.cylinder(wx, y + 0.0, wz, 0.5, 0.4, { mat: 'rubber', horizontal: true, rot: rot + Math.PI / 2, collide: false, seg: 10 });
    }
  }
  B.physics.addBox({ x, y, z, w: 7.6, h: 1.0, d: 2.5, rot, walkable: true, material: 'metal' });
}

function sandbags(B, M, x, z, len, rot, y) {
  B.box(x, y, z, len, 1.05, 0.8, { mat: 'sandbag', rot, uv: 1.2 });
  B.box(x, y + 1.05, z, len - 0.4, 0.3, 0.6, { mat: 'sandbag', rot, uv: 1.2, collide: false });
}

function jersey(B, M, x, z, rot, y) {
  B.box(x, y, z, 3.2, 0.85, 0.7, { mat: 'concrete', rot, uv: 2 });
  B.box(x, y + 0.85, z, 3.2, 0.12, 0.3, { mat: 'concrete', rot, collide: false, uv: 2 });
}

function floodTower(B, M, x, z, y, dir) {
  const h = 9;
  for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    B.box(x + ox, y, z + oz, 0.12, h, 0.12, { mat: 'steelDark', collide: false });
  }
  B.physics.addBox({ x, y, z, w: 1.5, h, d: 1.5, walkable: false, material: 'metal', nav: true });
  for (let k = 1; k < 4; k++) B.box(x, y + k * 2.4, z, 1.35, 0.08, 1.35, { mat: 'steelDark', collide: false });
  B.box(x, y + h, z, 1.8, 0.25, 1.8, { mat: 'steelDark', collide: false });
  for (const off of [-0.45, 0.45]) {
    B.lamp(x + off, y + h + 0.6, z, { color: 0xfff2dc, intensity: off < 0 ? 22 : 0, distance: 24, needsPower: true, glowSize: 2.6, bright: 9 });
  }
  B.beam(x, y + h + 0.5, z, dir, { length: 26, radius: 6.5, needsPower: true });
}

function fuelTank(B, M, x, z, y) {
  B.cylinder(x, y + 1.6, z, 1.5, 5, { mat: 'white', horizontal: true, rot: Math.PI / 2, collide: false, seg: 16 });
  B.physics.addBox({ x, y, z, w: 3.0, h: 3.1, d: 5.0, walkable: true, material: 'metal' });
  B.box(x, y, z - 1.8, 2.6, 1.6, 0.3, { mat: 'steelDark', collide: false });
  B.box(x, y, z + 1.8, 2.6, 1.6, 0.3, { mat: 'steelDark', collide: false });
}

function helipad(B, M, x, z, y) {
  const g = new THREE.CylinderGeometry(7, 7, 0.12, 40);
  B.mesh(g, new THREE.Matrix4().makeTranslation(x, y + 0.06, z), M.asphalt, { cast: false });
  const tex = makeSign([{ text: 'H', size: 200 }], { w: 256, h: 256, bg: 'rgba(0,0,0,0)', fg: '#e8e2d0', stripe: false });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y + 0.14, z);
  mesh.receiveShadow = true;
  B.group.add(mesh);
}

function buildExoArmory(B, M, x, z, y, textures) {
  // open-fronted container lined with racks; the station prop itself is placed by the game
  const len = 7;
  B.box(x + 1.15, y, z, 0.1, 2.7, len, { mat: 'steelDark', walkable: false });
  B.box(x, y, z - len / 2, 2.4, 2.7, 0.1, { mat: 'steelDark', walkable: false });
  B.box(x, y, z + len / 2, 2.4, 2.7, 0.1, { mat: 'steelDark', walkable: false });
  B.box(x, y + 2.7, z, 2.6, 0.15, len + 0.2, { mat: 'olive', walkable: true });
  B.box(x, y - 0.05, z, 2.4, 0.1, len, { mat: 'steel', collide: false });
  const sign = makeSign([{ text: 'EXO ARMORY', size: 78 }, { text: 'AUTHORIZED PERSONNEL', size: 30, weight: 600 }], { bg: '#121a20', fg: '#cfe9ff', accent: '#3aa0d8' });
  B.sign(x - 1.25, y + 3.25, z, -Math.PI / 2, sign, 3.2, 1.3, { emissive: 1.6 });
  B.lamp(x - 0.2, y + 2.55, z - 2, { color: 0x8fd0ff, shape: 'tube', len: 1.6, intensity: 8, distance: 7, zone: 1, rot: Math.PI / 2 });
  B.lamp(x - 0.2, y + 2.55, z + 2, { color: 0x8fd0ff, shape: 'tube', len: 1.6, intensity: 8, distance: 7, zone: 1, rot: Math.PI / 2, glow: false });
}

function buildLabs(B, M, textures, fx, signs) {
  const y = 0.6;
  const x0 = 6;
  const x1 = 42;
  const z0 = -26;
  const z1 = 6;
  const H = 7;
  const t = 0.5;
  // exterior shell with high windows on the long sides
  const winW = [];
  for (let k = 0; k < 6; k++) winW.push({ at: 3 + k * 5.2, w: 2.6, h: 4.2, sill: 2.6 });
  B.wall(x0, z1, x1, z1, { h: H, t, y0: y, mat: 'concrete', openings: [{ at: 14, w: 3.6, h: 3.2 }] });
  B.wall(x0, z0, x1, z0, { h: H, t, y0: y, mat: 'concrete', openings: [{ at: 18, w: 4, h: 3.4 }] });
  B.wall(x0, z0, x0, z1, { h: H, t, y0: y, mat: 'concrete', openings: winW });
  B.wall(x1, z0, x1, z1, { h: H, t, y0: y, mat: 'concrete', openings: winW });
  // window glass + bars
  for (const side of [x0, x1]) {
    for (const op of winW) {
      const wz = z0 + op.at;
      B.box(side, y + op.sill, wz, 0.08, op.h - op.sill, op.w, { mat: 'glass', collide: false });
      for (let b = -1; b <= 1; b++) B.box(side, y + op.sill, wz + b * 0.8, 0.06, op.h - op.sill, 0.06, { mat: 'steelDark', collide: false });
    }
  }
  B.box((x0 + x1) / 2, y + H, (z0 + z1) / 2, x1 - x0 + 0.6, 0.4, z1 - z0 + 0.6, { mat: 'concreteDark', walkable: false, nav: false });
  B.box((x0 + x1) / 2, y + 4.6, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: 'concreteDark', walkable: false, nav: false, cast: false });
  B.box((x0 + x1) / 2, y - 0.2, (z0 + z1) / 2, x1 - x0, 0.22, z1 - z0, { mat: 'floor', collide: false, uv: 3, cast: false });
  // partitions
  const ih = 4.6;
  B.wall(x0, -4, x1, -4, { h: ih, t: 0.3, y0: y, mat: 'concrete', openings: [{ at: 8, w: 3, h: 3 }, { at: 18, w: 4, h: 3.2 }, { at: 28, w: 3, h: 3 }] });
  B.wall(21, -4, 21, z0, { h: ih, t: 0.3, y0: y, mat: 'concrete', openings: [{ at: 11, w: 3, h: 3 }] });
  B.wall(27, -4, 27, z0, { h: ih, t: 0.3, y0: y, mat: 'concrete', openings: [{ at: 15, w: 3, h: 3 }] });
  // lobby: reception desk, emblem wall
  B.box(22, y, 1.2, 5, 1.1, 1.0, { mat: 'steelDark', walkable: true });
  B.box(22, y + 1.1, 1.2, 5.2, 0.08, 1.2, { mat: 'white', collide: false });
  const emb = makeEmblemTexture('#d9dde0', '#1b2228', 256);
  B.sign(24, y + 2.6, -3.82, 0, emb, 2.4, 2.4);
  signs.lobby = makeSign([{ text: 'AVION', size: 110 }, { text: 'EXO RESEARCH DIVISION', size: 36, weight: 600 }], { bg: '#1b2228', fg: '#d9dde0', stripe: false });
  B.sign(17.5, y + 2.6, -3.82, 0, signs.lobby, 4, 2);
  for (const bx of [10, 14]) B.box(bx, y, 4.6, 2.2, 0.5, 0.7, { mat: 'steelDark', walkable: true });
  // west lab: cryo pods + servers
  for (let k = 0; k < 3; k++) {
    for (const cx of [11, 16]) {
      const cz = -8 - k * 4.5;
      B.cylinder(cx, y, cz, 0.65, 0.35, { mat: 'steelDark', seg: 14 });
      B.cylinder(cx, y + 0.35, cz, 0.6, 2.2, { mat: 'cryo', seg: 14, collide: false, open: true });
      B.cylinder(cx, y + 2.55, cz, 0.65, 0.35, { mat: 'steelDark', seg: 14, collide: false });
      B.physics.addCylinder({ x: cx, z: cz, r: 0.68, y0: y, y1: y + 2.9, walkable: true, material: 'metal' });
      fx.cryo.push({ x: cx, y: y + 0.4, z: cz });
    }
  }
  for (let k = 0; k < 4; k++) {
    B.box(7.2, y, -6.5 - k * 1.3, 1.0, 2.4, 1.1, { mat: 'black', walkable: true });
    fx.screens.push({ x: 7.75, y: y + 1.2, z: -6.5 - k * 1.3, rot: Math.PI / 2, rack: true });
  }
  // east lab: exo frames + test treadmill + desks
  for (let k = 0; k < 3; k++) {
    const ex = 31 + k * 3.2;
    B.box(ex, y, -6.4, 1.2, 0.2, 1.0, { mat: 'steelDark' });
    B.box(ex - 0.35, y + 0.2, -6.4, 0.12, 1.6, 0.12, { mat: 'steel', collide: false });
    B.box(ex + 0.35, y + 0.2, -6.4, 0.12, 1.6, 0.12, { mat: 'steel', collide: false });
    B.box(ex, y + 1.6, -6.4, 0.9, 0.5, 0.35, { mat: 'olive', collide: false });
    B.physics.addBox({ x: ex, y, z: -6.4, w: 1.2, h: 2.1, d: 1.0, walkable: true, material: 'metal' });
  }
  B.box(34, y, -14, 2.4, 0.45, 5, { mat: 'black', walkable: true });
  B.box(34, y + 0.45, -14, 2.0, 0.06, 4.6, { mat: 'rubber', collide: false });
  for (const dz of [-19.5, -23.5]) {
    B.box(32, y, dz, 3.2, 0.9, 1.3, { mat: 'white', walkable: true });
    fx.screens.push({ x: 32, y: y + 1.25, z: dz - 0.3, rot: 0 });
  }
  // corridor + lights
  for (let k = 0; k < 4; k++) {
    B.lamp(24, y + 4.4, -7 - k * 5, { shape: 'tube', len: 1.6, color: 0xdcecff, intensity: 9, distance: 9, flicker: k === 2 ? 0.8 : 0.05, zone: 2, rot: Math.PI / 2 });
  }
  for (const [lx, lz] of [[12, 1], [32, 1], [13, -12], [13, -20], [35, -10], [35, -20]]) {
    B.lamp(lx, y + 4.4, lz, { shape: 'tube', len: 1.8, color: 0xdcecff, intensity: 10, distance: 11, flicker: lx === 13 && lz === -20 ? 0.5 : 0.06, zone: 2 });
  }
  // emergency beacons (red until the power is on)
  fx.beacons.push({ x: 20, y: y + 3.6, z: 5.6, color: 0xff2a1a }, { x: 24, y: y + 3.8, z: -25.6, color: 0xff2a1a });
  // signage
  const wing = makeSign([{ text: 'RESEARCH WING', size: 70 }, { text: 'B-LEVEL • EXO TESTING', size: 32, weight: 600 }]);
  B.sign(20, y + 4.1, 6.27, 0, wing, 3.6, 1.6);
}

function buildBunker(B, M, H, x, z, textures) {
  const y = H(x, z) - 0.3;
  const w = 9;
  const d = 7;
  const h = 3.1;
  B.wall(x - w / 2, z - d / 2, x + w / 2, z - d / 2, { h, t: 0.6, y0: y, mat: 'concreteDark', openings: [{ at: 2, w: 1.6, h: 1.9, sill: 1.3 }, { at: 7, w: 1.6, h: 1.9, sill: 1.3 }] });
  B.wall(x - w / 2, z + d / 2, x + w / 2, z + d / 2, { h, t: 0.6, y0: y, mat: 'concreteDark', openings: [{ at: 4.5, w: 2.2, h: 2.4 }] });
  B.wall(x - w / 2, z - d / 2, x - w / 2, z + d / 2, { h, t: 0.6, y0: y, mat: 'concreteDark', openings: [{ at: 3.5, w: 2.4, h: 1.9, sill: 1.3 }] });
  B.wall(x + w / 2, z - d / 2, x + w / 2, z + d / 2, { h, t: 0.6, y0: y, mat: 'concreteDark' });
  B.box(x, y + h, z, w + 0.6, 0.35, d + 0.6, { mat: 'concreteDark', walkable: true });
  B.lamp(x, y + h - 0.2, z, { color: 0xffb070, intensity: 8, distance: 8, flicker: 0.3, zone: 3 });
  const s = makeSign([{ text: 'OBSERVATION POST 2', size: 52 }, { text: 'AVION • EYES ON THE VALLEY', size: 30, weight: 600 }]);
  B.sign(x, y + 2.2, z + d / 2 + 0.31, 0, s, 3, 1.4);
}

function buildOverlook(B, M, H, textures) {
  const x = cliffEdge(-23) + 4.6;
  const z = -23;
  const y = H(x, z);
  // deck, rails, viewer
  B.box(x, y - 0.5, z, 6, 0.75, 7, { mat: 'planks', uv: 2 });
  for (let k = 0; k < 8; k++) {
    const pz = z - 3.4 + k * (6.8 / 7);
    B.box(x - 3.1, y + 0.25, pz, 0.14, 1.1, 0.14, { mat: 'planks', collide: false });
  }
  B.box(x - 3.1, y + 1.25, z, 0.14, 0.12, 7, { mat: 'planks', collide: false });
  B.box(x - 3.1, y + 0.75, z, 0.08, 0.08, 7, { mat: 'planks', collide: false });
  B.cylinder(x - 1.8, y + 0.25, z + 2.2, 0.08, 1.0, { mat: 'steelDark', collide: false, seg: 6 });
  B.box(x - 1.8, y + 1.25, z + 2.2, 0.5, 0.25, 0.25, { mat: 'steelDark', collide: false });
  const plaque = makeSign([{ text: 'RAINSHADOW OVERLOOK', size: 48 }, { text: 'ELEV. 5,242 FT • OLYMPIC MOUNTAINS', size: 28, weight: 600 }], { bg: '#4a3626', fg: '#efe4cc', stripe: false });
  B.sign(x + 2.6, y + 1.0, z - 3.6, 0.3, plaque, 2.2, 1.0);
}

function buildRadioTower(B, M, H, x, z, fx) {
  const y = H(x, z) - 0.2;
  const h = 34;
  const legs = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]];
  const parts = [];
  for (const [lx, lz] of legs) {
    const g = new THREE.CylinderGeometry(0.06, 0.12, h, 5);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-lz * 0.035, 0, lx * 0.035));
    m.setPosition(x + lx * 0.55, y + h / 2, z + lz * 0.55);
    parts.push({ geometry: g, matrix: m });
  }
  for (let k = 0; k < 14; k++) {
    const yy = y + 1 + k * 2.4;
    const span = 3.2 * (1 - (yy - y) / h * 0.55);
    for (const [ax, az, rot] of [[0, -span / 2, 0], [0, span / 2, 0], [-span / 2, 0, Math.PI / 2], [span / 2, 0, Math.PI / 2]]) {
      const g = new THREE.CylinderGeometry(0.035, 0.035, span * 1.12, 4);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, rot, Math.PI / 2 + (k % 2 ? 0.55 : -0.55)));
      m.setPosition(x + ax, yy + 1.2, z + az);
      parts.push({ geometry: g, matrix: m });
    }
  }
  B.mesh(mergeGeometries(parts), new THREE.Matrix4(), M.steelDark);
  B.physics.addBox({ x, y, z, w: 3.6, h: 6, d: 3.6, walkable: false, material: 'metal' });
  // shack at the base
  B.box(x + 4.5, y, z - 1.0, 3.2, 2.6, 2.6, { mat: 'corrugated', walkable: true, uv: 2.6 });
  B.box(x + 4.5, y + 2.6, z - 1.0, 3.5, 0.15, 2.9, { mat: 'steelDark', walkable: true });
  // dishes
  for (const [dy, rot] of [[20, 0.6], [26, 2.4]]) {
    const g = new THREE.CylinderGeometry(1.2, 0.2, 0.5, 14, 1, true);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, rot, 0));
    m.setPosition(x + Math.cos(rot) * 1.4, y + dy, z + Math.sin(rot) * 1.4);
    B.mesh(g, m, M.white);
  }
  fx.beacons.push({ x, y: y + h + 0.4, z, color: 0xff2a1a, always: true, big: true });
}

function buildHangar(B, M, textures, fx, signs) {
  const y = 1.0;
  const x0 = -14;
  const x1 = 30;
  const z0 = -78;
  const z1 = -46;
  const H = 13;
  B.wall(x0, z0, x1, z0, { h: H, t: 0.6, y0: y, mat: 'corrugated', uv: 6 });
  B.wall(x0, z0, x0, z1, { h: H, t: 0.6, y0: y, mat: 'corrugated', uv: 6 });
  B.wall(x1, z0, x1, z1, { h: H, t: 0.6, y0: y, mat: 'corrugated', uv: 6 });
  // south face: big opening between pillars, door panels pushed aside
  B.box(x0 + 1.5, y, z1, 3, H, 0.8, { mat: 'steelDark', walkable: false });
  B.box(x1 - 1.5, y, z1, 3, H, 0.8, { mat: 'steelDark', walkable: false });
  B.box((x0 + x1) / 2, y + 10.5, z1, x1 - x0, H - 10.5, 0.8, { mat: 'steelDark', walkable: false });
  B.box(x0 + 5.5, y, z1 - 1.0, 5, 10.4, 0.4, { mat: 'corrugated', walkable: false, uv: 5 });
  B.box(x1 - 5.5, y, z1 - 1.0, 5, 10.4, 0.4, { mat: 'corrugated', walkable: false, uv: 5 });
  // roof (two pitched planes, visual) + collision lid
  const roofW = (x1 - x0) / 2 + 0.6;
  B.box(x0 + roofW / 2 - 0.3, y + H + 1.2, (z0 + z1) / 2, roofW, 0.3, z1 - z0 + 1.2, { mat: 'corrugated', rz: 0.12, collide: false, uv: 6 });
  B.box(x1 - roofW / 2 + 0.3, y + H + 1.2, (z0 + z1) / 2, roofW, 0.3, z1 - z0 + 1.2, { mat: 'corrugated', rz: -0.12, collide: false, uv: 6 });
  B.physics.addBox({ x: (x0 + x1) / 2, y: y + H, z: (z0 + z1) / 2, w: x1 - x0, h: 4, d: z1 - z0, walkable: false, nav: false });
  B.box((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0, { mat: 'floor', collide: false, uv: 4, cast: false });
  // roof trusses
  for (let k = 0; k < 6; k++) {
    const tz = z0 + 3 + k * 5.5;
    B.box((x0 + x1) / 2, y + H - 0.6, tz, x1 - x0, 0.5, 0.3, { mat: 'steelDark', collide: false });
  }
  // the prototype: AVION XV-9 tilt-rotor
  const px = 8;
  const pz = -62;
  B.box(px, y + 0.3, pz, 15, 3.0, 3.4, { mat: 'steel', uv: 3 });
  B.box(px + 8.6, y + 0.8, pz, 2.6, 2.0, 2.6, { mat: 'steel', rz: -0.12, collide: false });
  B.physics.addBox({ x: px + 8.4, y: y + 0.3, z: pz, w: 2.6, h: 2.6, d: 2.6, walkable: true, material: 'metal' });
  B.box(px + 8.2, y + 2.0, pz, 1.8, 0.8, 2.2, { mat: 'glass', collide: false });
  B.box(px - 1, y + 1.2, pz, 4, 0.4, 16, { mat: 'olive', uv: 3 });
  B.box(px - 8.4, y + 3.2, pz, 2.2, 3.0, 0.3, { mat: 'olive', collide: false });
  B.box(px - 8.4, y + 1.8, pz, 2.0, 1.4, 6.0, { mat: 'olive', collide: false });
  for (const side of [-1, 1]) {
    B.cylinder(px - 1, y + 0.2, pz + side * 8.4, 0.9, 3.2, { mat: 'steelDark', seg: 12 });
    B.box(px - 1, y + 3.4, pz + side * 8.4, 0.3, 0.12, 7.5, { mat: 'black', collide: false });
    B.box(px - 1, y + 3.4, pz + side * 8.4, 7.5, 0.12, 0.3, { mat: 'black', collide: false });
  }
  const tag = makeSign([{ text: 'XV-9 “KESTREL”', size: 70 }, { text: 'PROTOTYPE • DO NOT FUEL', size: 30, weight: 600 }], { bg: '#7a7f86', fg: '#1a1d22', stripe: false });
  B.sign(px + 2, y + 2.3, pz + 1.72, 0, tag, 3.2, 1.3);
  // workbenches, crates, tool carts
  for (const [bx, bz, r] of [[-10, -75.5, 0], [-6, -75.5, 0], [27.5, -58, Math.PI / 2], [27.5, -64, Math.PI / 2]]) {
    B.box(bx, y, bz, 3.2, 0.95, 1.1, { mat: 'steelDark', rot: r, walkable: true });
  }
  for (const [cx, cz] of [[-9, -50], [-9.2, -52.6], [-6.6, -51.2]]) B.box(cx, y, cz, 2.0, 1.6, 2.0, { mat: 'olive', walkable: true, uv: 2 });
  B.box(-8.2, y + 1.6, -51.6, 1.6, 1.2, 1.6, { mat: 'olive', walkable: true, uv: 2 });
  // lights
  for (const [lx, lz] of [[-4, -55], [20, -55], [-4, -70], [20, -70], [8, -51], [8, -74]]) {
    B.lamp(lx, y + H - 1.4, lz, { color: 0xfff0dc, intensity: 16, distance: 18, needsPower: true, zone: 4, bright: 7 });
  }
  B.lamp(8, y + 4.6, -76.8, { color: 0xff6040, intensity: 8, distance: 8, flicker: 0.4, zone: 4 });
  fx.beacons.push({ x: x0 + 1.5, y: y + 9, z: z1 + 0.5, color: 0xff2a1a }, { x: x1 - 1.5, y: y + 9, z: z1 + 0.5, color: 0xff2a1a });
  const hs = makeSign([{ text: 'HANGAR 2', size: 120 }, { text: 'AVION FLIGHT TEST', size: 40, weight: 600 }]);
  B.sign((x0 + x1) / 2, y + 11.8, z1 + 0.45, 0, hs, 8, 3.6);
  signs.hangar = hs;
}
