import * as THREE from '../../vendor/three.module.min.js';
import { makeNoise2D, smoothstep, clamp, lerp, distToSegment2 } from '../util.js';
import { ROCK, vnoise3 } from './cave.js';
import { buildSurface } from './eh_surface.js';
import { buildUnderground } from './eh_underground.js';
import { KESTREL } from './eh_layout.js';
import {
  ehNoise, cliffZ, PLAZA_Y, LODGE_FLOOR, PORTAL_MAIN, PORTAL_EXIT, LODGE, PORCH, LOT, WALKWAY, PLAZA, STAIRS_W, STAIRS_E,
  MINE, portalNotch, CREEK, TRAIL, MIRROR_LAKE, PIT, RIVER, RIVER_BRIDGES, RIVER_HEAD, RIVER_SINK,
} from './eh_shape.js';

// EMBER HOLLOW — Ember Hollow Caverns, a 1931 show cave in the Cascade foothills, bought by
// Avion in 2019. Under the tour: Avion's service decline, a crystal grotto, an underground
// river and the CALDERA geothermal reactor.
// x = east, z = south (north is -z). The caves run north under the mountain and down.

const noise = ehNoise;

export const INFO = {
  id: 'emberhollow',
  name: 'EMBER HOLLOW',
  region: 'CASCADE FOOTHILLS',
  subtitle: 'Ember Hollow Caverns',
  loading: ['Descending into Ember Hollow', 'Carving the caverns', 'Wiring the tour lights', 'Mapping zombie paths'],
  intro: [
    { text: 'EMBER HOLLOW', cls: 'big', speed: 70, pause: 500 },
    { text: 'EMBER HOLLOW CAVERNS — CASCADE FOOTHILLS, WA', speed: 24 },
    { text: 'OCT 14 — 05:52 PDT', speed: 30, pause: 600 },
    { text: "Daybreak traced the Nightwarden's power to a tourist cave. Avion has owned it since 2019.", cls: 'dim', speed: 20 },
    { text: 'Get the power on. Then go down.', cls: 'accent', speed: 50 },
  ],
  freeObjective: 'Free roam: explore Ember Hollow',
  menuShots: [
    { from: [-6, 2.4, 96], to: [6, 2.6, 82], look: [-30, 6, 30], dur: 22 },
    { from: [-14, 6.2, 2], to: [8, 6.4, -6], look: [0, 6, -40], dur: 22 },
    { from: [30, 3.4, 52], to: [44, 3.2, 40], look: [30, 3, 10], dur: 20 },
  ],
  menuZombies: [[-22, 54], [-14, 58], [-30, 60], [10, -12], [-8, -14], [32, 30]],
  menuZombieFace: [0, 90],
  powerMessage: ['CALDERA ONLINE', 'Reactor power is running out through the caves'],
  powerAnnounce: 'Caldera reactor online. Restoring power to all levels.',
  roundOneAnnounce: 'Attention visitors. The caverns are closed. Please return to your vehicles.',
};

// ---- circuits: each surface area has its own breaker, the reactor powers the whole cave -----------
export const CIRCUITS = [
  { id: 'reactor', index: 0 },
  { id: 'lot', index: 1, label: 'Parking Lot', message: ['LOT LIGHTS ON', 'Exo Velocity is online'], sound: 'breaker' },
  { id: 'lodge', index: 2, label: 'Visitor Center', message: ['VISITOR CENTER POWERED', 'Exo Health and the souvenir fabricator are online'], sound: 'breaker' },
  { id: 'mine', index: 3, label: 'Gem Mine', message: ['GEM MINE POWERED', 'Exo Reload is online. The flume is running.'], sound: 'breaker' },
  { id: 'plaza', index: 4, label: 'Cave Entrance', message: ['ENTRANCE POWERED', 'Exo Slam is online'], sound: 'breaker' },
];
export const MAIN_CIRCUIT = 'reactor';

// ---- zones ------------------------------------------------------------------------------------------
export const ZONES = [
  { id: 0, name: 'PARKING LOT', rects: [[-46, 60, 50, 108], [-54, 44.05, -30, 60]], adjacent: [1, 2], indoor: 0 },
  { id: 1, name: 'VISITOR CENTER', rects: [[-60, 22, -24, 44]], adjacent: [0, 3], indoor: 0.9 },
  { id: 2, name: 'GEM MINE', rects: [[6, 10, 78, 61]], adjacent: [0, 3], indoor: 0 },
  { id: 3, name: 'CAVE ENTRANCE', rects: [[-36, -30, 34, 10], [-48, 10, -26, 21.9]], adjacent: [1, 2, 4], indoor: 0 },
  { id: 4, name: 'SHOW CAVE', rects: [[-40, -110, 62, -18]], adjacent: [3, 5], indoor: 1, under: true },
  { id: 5, name: 'AVION DECLINE', rects: [[-104, -170, -38, -74]], adjacent: [4, 6, 7], indoor: 1, under: true },
  { id: 6, name: 'CRYSTAL GROTTO', rects: [[-166, -204, -104, -150]], adjacent: [5, 7], indoor: 1, under: true },
  { id: 7, name: 'UNDERGROUND RIVER', rects: [[-140, -232, 26, -204], [-100, -204, -78, -170]], adjacent: [5, 6, 8], indoor: 1, under: true },
  { id: 8, name: 'CALDERA REACTOR', rects: [[26, -256, 88, -194]], adjacent: [7], indoor: 1, under: true },
];

// Under the mountain only the cave zones count; in the open only the surface ones.
export function zoneAt(x, z) {
  const under = z < cliffZ(x) - 0.2;
  let found = 0;
  for (const zone of ZONES) {
    if (!!zone.under !== under) continue;
    for (const [x0, z0, x1, z1] of zone.rects) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) found = zone.id + 1;
    }
  }
  return found;
}

export const BOUNDS = { minX: -170, maxX: 92, minZ: -258, maxZ: 110 };
// below this the player has fallen out of the world (the reactor's lava is at -91)
export const KILL_Y = -140;
// 2 m terrain, with a 0.5 m patch where the cliff, the plaza and the cave doors meet
// 2 m terrain, with a 0.5 m patch where the cliff, the plaza and the cave doors meet
export const TERRAIN = { minX: -230, minZ: -320, size: 480, res: 2, chunk: 48, detail: [{ x0: -38, z0: -36, x1: 36, z1: 12, res: 0.5 }] };

// ---- surface heights ---------------------------------------------------------------------------
export { cliffZ, PLAZA_Y, LODGE_FLOOR, PORTAL_MAIN, PORTAL_EXIT };

const FLAT = [
  // x0, z0, x1, z1, height, margin (later entries win)
  [4, 4, 80, 58, null, 6], // picnic grounds (gently rolling)
  [-46, 58, 52, 110, 0, 8], // parking lot
  [-64, 18, -20, 52, 0.9, 5], // lodge grounds
  [-34, -26, 32, 8, PLAZA_Y, 0.5], // plaza (hard edge: the retaining walls stand on it)
];

function rectDist(x, z, x0, z0, x1, z1) {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}

function valley(x, z) {
  // the valley floor rises gently north, with soft swells
  let h = clamp((80 - z) * 0.02, 0, 2.4) + 0.55 * noise.fbm(x / 34, z / 34, 3);
  // forested hills framing the valley east, west and south
  const play = Math.min(rectDist(x, z, -70, -30, 82, 110), 400);
  h += smoothstep(3, 40, play) * (10 + 10 * noise.fbm(x / 55 + 9, z / 55, 3));
  return h;
}

export function surfaceHeight(x, z) {
  // the cliff is cut back to the plaza level in front of each cave portal
  if (portalNotch(x, z)) return PLAZA_Y;
  let h = valley(x, z);
  // the old access road winds east out of the lot
  if (x > 46 && Math.abs(z - roadZ(x)) < 9) h = lerp(h, 0, 1 - smoothstep(4, 9, Math.abs(z - roadZ(x))));
  for (const [x0, z0, x1, z1, t, m] of FLAT) {
    const d = rectDist(x, z, x0, z0, x1, z1);
    if (d > m) continue;
    const k = m <= 0.5 ? (d <= 0 ? 1 : 0) : 1 - smoothstep(0, m, d);
    const target = t === null ? 1.1 + 0.6 * noise.fbm(x / 22, z / 22, 2) : t;
    h = lerp(h, target, k);
  }
  // creek bed through the picnic grounds
  const cd = creekDist(x, z);
  if (cd < 2.6) h -= (1 - cd / 2.6) ** 1.6 * 0.9;
  // the mountain: a cliff behind the plaza, then forested slopes climbing north
  const cz = cliffZ(x);
  const into = cz - z;
  if (into > 0) {
    const face = 24 * smoothstep(0, 4.5, into);
    const slope = Math.max(0, into - 4) * 0.42 + 18 * smoothstep(20, 160, into);
    const lumps = 3 * noise.fbm(x / 20, z / 20, 3);
    h = Math.max(h, PLAZA_Y + face + slope + lumps * smoothstep(2, 10, into));
  }
  return h;
}

// The access road (centre line z at x) leaving the lot's east end.
export function roadZ(x) {
  return 92.5 + Math.max(0, x - 50) * 0.12 + 3 * Math.sin(Math.max(0, x - 50) / 22);
}

export { CREEK, MIRROR_LAKE, PIT, RIVER };
function creekDist(x, z) {
  let d = Infinity;
  for (let i = 0; i < CREEK.length - 1; i++) d = Math.min(d, distToSegment2(x, z, CREEK[i][0], CREEK[i][1], CREEK[i + 1][0], CREEK[i + 1][1]));
  return d;
}
export { creekDist };

export function heightFn(x, z) {
  return surfaceHeight(x, z);
}

export { TRAIL };
export function trailDist(x, z) {
  let d = Infinity;
  for (let i = 0; i < TRAIL.length - 1; i++) d = Math.min(d, distToSegment2(x, z, TRAIL[i][0], TRAIL[i][1], TRAIL[i + 1][0], TRAIL[i + 1][1]));
  return d;
}

function nearPortal(x, z, slack = 0) {
  for (const p of [PORTAL_MAIN, PORTAL_EXIT]) {
    if (Math.abs(x - p.x) < p.w / 2 + slack && z > p.z - 1.2 && z < p.z + 3) return true;
  }
  return false;
}

// Walkable open-air areas (underground walkability comes from the cave itself).
export function walkFn(x, z) {
  // parking lot (islands, cars, the bus and the Kestrel are colliders)
  if (x > LOT.x0 && x < LOT.x1 && z > LOT.z0 && z < LOT.z1) return true;
  // the walk up to the porch, and the porch itself
  if (x > WALKWAY.x0 && x < WALKWAY.x1 && z > WALKWAY.z0 - 0.4 && z < WALKWAY.z1 + 0.4) return true;
  if (x > PORCH.x0 + 0.3 && x < PORCH.x1 - 0.3 && z > PORCH.z0 - 0.5 && z < PORCH.z1 - 0.25) return true;
  // inside the visitor center (its walls are colliders)
  if (x > LODGE.x0 && x < LODGE.x1 && z > LODGE.z0 && z < LODGE.z1) return true;
  // gem mine and picnic grounds, and the path through its gate
  if (x > MINE.x0 && x < MINE.x1 && z > MINE.z0 && z < MINE.z1) return true;
  if (x > 15.8 && x < 20.2 && z >= MINE.z1 - 0.5 && z <= LOT.z0 + 0.5) return true;
  // stairs up to the plaza (the east ones end at the Upper Trail gate)
  for (const st of [STAIRS_W, STAIRS_E]) {
    if (Math.abs(x - st.x) < st.w / 2 && z > st.z0 - 0.8 && z < st.z1 + 0.9) return true;
  }
  // the trail from the lodge's back door to the west stairs
  if (trailDist(x, z) < 1.3) return true;
  // the plaza, out to its parapets and back to the foot of the cliff (and into the portals)
  const pp = PLAZA.wall - PLAZA.parapet;
  if (x > PLAZA.x0 - pp && x < PLAZA.x1 + pp && z < PLAZA.z1 + pp) {
    if (z > cliffZ(x) + 0.5) return true;
    if (nearPortal(x, z)) return true;
  }
  return false;
}

export function indoorAt(x, z) {
  // the visitor center only; caves are handled by their own sky mask
  if (x > LODGE.x0 && x < LODGE.x1 && z > LODGE.z0 && z < LODGE.z1) return 1;
  return 0;
}

// Ground that is built on or walked on: kept clear of trees and boulders.
function openGround(x, z, m) {
  if (rectDist(x, z, LOT.x0, LOT.z0, LOT.x1, LOT.z1) < m) return true;
  if (rectDist(x, z, LODGE.x0 - 2, LODGE.z0 - 1, LODGE.x1 + 1, PORCH.z1) < m) return true;
  if (rectDist(x, z, WALKWAY.x0, WALKWAY.z0, WALKWAY.x1, WALKWAY.z1) < m) return true;
  if (rectDist(x, z, MINE.x0, MINE.z0, MINE.x1, MINE.z1 + 1.5) < m) return true;
  if (rectDist(x, z, PLAZA.x0 - 2, -30, PLAZA.x1 + 2, PLAZA.z1 + 2) < m && z > cliffZ(x) - 1) return true;
  if (rectDist(x, z, STAIRS_E.x - 2, STAIRS_E.z0, STAIRS_E.x + 2, STAIRS_E.z1) < m) return true;
  if (trailDist(x, z) < 1.5 + m * 0.5) return true;
  if (x > 46 && Math.abs(z - roadZ(x)) < 4 + m * 0.5) return true;
  return false;
}

export function inPlayable(x, z, margin = 0) {
  return openGround(x, z, margin);
}
export function meadowMask() {
  return 0;
}
export function treeClearance(x, z) {
  if (openGround(x, z, 3)) return 0;
  const cz = cliffZ(x);
  if (z < cz + 2 && z > cz - 7) return 0; // bare cliff face
  if (creekDist(x, z) < 2.4) return 0;
  return 1;
}
export function fernAllowed(x, z) {
  if (openGround(x, z, 0.5)) return false;
  const cz = cliffZ(x);
  if (z < cz + 0.6 && z > cz - 7) return false;
  return creekDist(x, z) > 1.6;
}

export function terrainColor(x, z, h, n, c) {
  const slope = 1 - n.y;
  const moss = 0.5 + 0.5 * noise.fbm(x / 14, z / 14, 3);
  c.setRGB(0.6 + 0.14 * moss, 0.64 + 0.2 * moss, 0.52 + 0.06 * moss);
  // trampled grass and needle duff around the buildings
  if (openGround(x, z, 2)) c.lerp(new THREE.Color(0.62, 0.6, 0.5), 0.35);
  if (creekDist(x, z) < 2.2) c.lerp(new THREE.Color(0.45, 0.42, 0.36), 0.7);
  if (slope > 0.32) c.lerp(new THREE.Color(0.5, 0.49, 0.47), smoothstep(0.32, 0.65, slope));
}

export const ROCKS = [
  { x: -4, z: 24, s: 2.2 }, { x: -12, z: 40, s: 1.8, v: 1 }, { x: 2, z: 52, s: 1.6, v: 2 },
  { x: 79, z: 30, s: 1.6 }, { x: 80, z: 44, s: 1.3, v: 1 },
  { x: -40, z: -22.6, s: 1.7, v: 1 }, { x: 37, z: -22, s: 2.0, v: 2 }, { x: -62, z: 14, s: 1.5 },
];
export const LOGS = [{ x: 82, z: 22, rot: 0.3, seed: 5 }, { x: -64, z: 92, rot: 1.1, seed: 8 }];
export const EXTRA_TREES = [
  // the woods between the lodge and the gem mine
  [-14, 26], [-6, 34], [-16, 44], [0, 18], [-8, 54], [2, 44], [-20, 36],
  // around the lodge
  [-66, 50], [-68, 36], [-66, 22], [-54, 14],
];
export const VEGETATION = {
  near: { x0: -170, x1: 130, z0: -320, z1: 160, count: 2900 },
  far: { cx: -20, cz: -60, r0: 180, r1: 330, count: 2400, minY: -40 },
  valley: null,
  ferns: { x0: -100, x1: 110, z0: -60, z1: 130, count: 5200 },
  grass: { x0: 0, x1: 1, z0: 0, z1: 1, count: 0 },
  rocks: { x0: -160, x1: 130, z0: -200, z1: 150, count: 700 },
};

// ---- the caves ----------------------------------------------------------------------------------
const GAL = { x: -10, z: -72 };

function galleryFloor(x, z) {
  const t = smoothstep(-56, -90, z);
  let f = lerp(1.0, -5.5, t) + 0.7 * noise.fbm(x / 9, z / 9, 3) + 1.4 * Math.exp(-(((x - 4) ** 2) + (z + 70) ** 2) / 30);
  return f;
}
function galleryCeil(x, z) {
  const d = Math.hypot(x - GAL.x, z - GAL.z);
  return 11 + 6 * Math.exp(-(d * d) / 260) + 2.5 * noise.fbm(x / 14 + 4, z / 14, 3);
}
function cathFloor(x, z) {
  return -4 + 0.5 * noise.fbm(x / 8, z / 8, 2) + 1.6 * Math.exp(-(((x - 50) ** 2) + (z + 98) ** 2) / 26);
}
function grottoFloor(x, z) {
  return -42 + 2.0 * noise.fbm(x / 10 + 7, z / 10, 3) + 0.04 * (x + 142);
}
function reactorFloor() {
  return -66;
}

export const CAVE_SHAPES = [
  // --- show cave ---
  { type: 'tunnel', kind: 'blasted', amp: 0.22, pts: [[0, -21, PLAZA_Y, 4.6, 4.4], [0.5, -34, 4.0, 4.6, 4.5], [-2, -43, 3.0, 4.8, 4.7], [-6, -52, 1.3, 5.6, 5.6]] },
  { type: 'ellipse', kind: 'limestone', x: GAL.x, z: GAL.z, rx: 27, rz: 20, rot: 0.2, floor: galleryFloor, h: galleryCeil },
  { type: 'tunnel', kind: 'limestone', pts: [[12, -80, -4.6, 6.5, 8], [21, -84, -4.4, 6, 9.5], [29, -87, -4.2, 7.5, 12]] },
  { type: 'ellipse', kind: 'flowstone', x: 43, z: -93, rx: 16, rz: 13, rot: -0.3, floor: cathFloor, h: (x, z) => 21 + 3 * Math.exp(-((x - 44) ** 2 + (z + 94) ** 2) / 70) },
  { type: 'tunnel', kind: 'blasted', amp: 0.2, pts: [[38, -80, -3.6, 4.2, 4.1], [34, -63, -1.4, 4.2, 4.1], [30, -45, 1.8, 4.2, 4.1], [26.5, -33, 3.9, 4.2, 4.1], [25.5, -20, PLAZA_Y, 4.2, 4.1]] },
  // --- Avion decline ---
  { type: 'tunnel', kind: 'blasted', pts: [[-34, -79, -4.6, 4.2, 4.3], [-45, -81, -6.4, 4.8, 4.5], [-70, -85, -14, 4.8, 4.5]] },
  { type: 'poly', kind: 'blasted', pts: [[-91, -95], [-69, -95], [-69, -77], [-91, -77]], floor: -14, h: 5.6 },
  { type: 'tunnel', kind: 'blasted', pts: [[-84, -95, -14, 4.8, 4.5], [-85, -121, -24, 4.8, 4.5], [-88, -147, -34, 4.8, 4.5]] },
  { type: 'poly', kind: 'blasted', pts: [[-101, -167], [-77, -167], [-77, -147], [-101, -147]], floor: -34, h: 6.2 },
  // --- crystal grotto ---
  { type: 'tunnel', kind: 'limestone', pts: [[-100, -158, -34, 4.4, 5], [-113, -162, -37.5, 5, 6], [-124, -166, -39.5, 6.5, 8]] },
  { type: 'ellipse', kind: 'crystal', x: -142, z: -174, rx: 19, rz: 16, rot: 0.4, floor: grottoFloor, h: (x, z) => 13 + 3 * noise.fbm(x / 12, z / 12, 2) },
  { type: 'tunnel', kind: 'limestone', pts: [[-148, -188, -43, 5.5, 7], [-141, -199, -45, 5.5, 7], [-131, -208, -46, 7, 9]] },
  // --- underground river ---
  { type: 'tunnel', kind: 'blasted', pts: [[-88, -165, -34, 4.6, 4.4], [-88, -182, -40, 4.6, 4.4], [-90, -203, -46, 5.5, 6]] },
  { type: 'tunnel', kind: 'limestone', pts: [[-132, -209, -46, 12, 12], [-100, -208, -46, 13, 13], [-70, -212, -48, 13, 14], [-40, -216, -52.5, 14, 17], [-10, -220, -58.5, 13, 15], [16, -224, -62, 11, 12]] },
  // --- CALDERA ---
  { type: 'tunnel', kind: 'blasted', pts: [[14, -224, -62, 8, 8], [27, -227, -66, 8.5, 8.5]] },
  { type: 'ellipse', kind: 'basalt', x: 54, z: -226, rx: 31, rz: 25, rot: 0, floor: reactorFloor, h: (x, z) => 28 + 6 * Math.exp(-((x - 52) ** 2 + (z + 232) ** 2) / 300) },
  { type: 'poly', kind: 'built', pts: [[48, -204], [60, -204], [60, -196], [48, -196]], floor: -66, h: 4.6 },
];

// Per-cell features: Mirror Lake's basin, the river channel, the reactor's magma pit.
function cavePost(x, z, cell) {
  // Mirror Lake
  const ld = Math.hypot(x - MIRROR_LAKE.x, (z - MIRROR_LAKE.z) * 1.25);
  if (ld < MIRROR_LAKE.r + 2) {
    const k = 1 - smoothstep(MIRROR_LAKE.r - 1.0, MIRROR_LAKE.r + 0.9, ld);
    cell.f = lerp(cell.f, MIRROR_LAKE.y - 1.4, k);
  }
  // the river runs along the south side of the canyon, a channel a few metres below the bank
  const ch = riverChannel(x, z);
  if (ch > 0 && cell.d > 1) cell.f -= ch * 2.6;
  // magma pit
  const pd = Math.hypot(x - PIT.x, z - PIT.z);
  if (pd < PIT.r + 1) {
    const k = smoothstep(PIT.r + 0.6, PIT.r - 0.6, pd);
    cell.f = lerp(cell.f, PIT.lava - 6, k);
  }
}

// How deep into the river channel (0..1) a spot is. The channel runs 2.2 m south (+z) of the
// river's line along the canyon.
export function riverChannel(x, z) {
  if (!(z < -200 && x < 20 && x > -135)) return 0;
  const P = RIVER.pts;
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  const [ax, az] = P[bi];
  const [bx, bz] = P[bi + 1];
  const side = ((x - ax) * (bz - az) - (z - az) * (bx - ax)) / Math.hypot(bx - ax, bz - az);
  // it wells up from a flooded passage at its head and sinks into a sump before the CALDERA link
  const ends = smoothstep(RIVER_HEAD - 4, RIVER_HEAD, x) * (1 - smoothstep(RIVER_SINK - 4, RIVER_SINK, x));
  return (1 - smoothstep(1.2, 3.6, Math.abs(-side - 2.2))) * ends;
}

// Water and the pit are not walkable (the river can be crossed on its bridges).
function caveVeto(x, z) {
  if (Math.hypot(x - MIRROR_LAKE.x, (z - MIRROR_LAKE.z) * 1.25) < MIRROR_LAKE.r - 0.4) return true;
  if (Math.hypot(x - PIT.x, z - PIT.z) < PIT.r + 1.4) return true;
  if (riverChannel(x, z) > 0.3 && !RIVER_BRIDGES.some((b) => Math.abs(x - b.x) < b.w / 2)) return true;
  return false;
}

function caveColor(field, x, y, z, n, out) {
  const idx = Math.round((z - field.minZ) / field.res) * field.nx + Math.round((x - field.minX) / field.res);
  const kind = field.K[idx] || 0;
  const f = field.F[idx];
  const above = y - f;
  const floorish = n.y > 0.55 && above < 0.6;
  let r;
  let g;
  let b;
  let wet = 0;
  const v = 0.86 + 0.28 * vnoise3(x * 0.3, y * 0.5, z * 0.3);
  if (kind === ROCK.basalt.id) {
    [r, g, b] = floorish ? ROCK.basalt.floor : ROCK.basalt.color;
    // oxidised streaks and sulfur near the pit
    const pd = Math.hypot(x - PIT.x, z - PIT.z);
    const heat = 1 - smoothstep(PIT.r, PIT.r + 22, pd);
    r += heat * 0.08 + 0.05 * Math.max(0, vnoise3(x * 0.5, y * 0.9, z * 0.5));
    g += heat * 0.03;
    if (vnoise3(x * 0.7 + 3, y * 0.7, z * 0.7) > 0.55) {
      r = lerp(r, 0.62, 0.5);
      g = lerp(g, 0.55, 0.5);
      b = lerp(b, 0.16, 0.5);
    }
  } else if (kind === ROCK.blasted.id) {
    [r, g, b] = floorish ? ROCK.blasted.floor : ROCK.blasted.color;
    // shotcrete patches
    if (!floorish && vnoise3(x * 0.25, y * 0.25, z * 0.25) > 0.35) {
      r = g = b = 0.56;
    }
  } else if (kind === ROCK.crystal.id) {
    [r, g, b] = floorish ? ROCK.crystal.floor : ROCK.crystal.color;
    wet = 0.25;
  } else {
    const base = kind === ROCK.flowstone.id ? ROCK.flowstone : ROCK.limestone;
    [r, g, b] = floorish ? base.floor : base.color;
    // iron (orange) and manganese (dark) stains run down the walls
    const stain = vnoise3(x * 0.6, y * 0.12, z * 0.6);
    if (stain > 0.3) {
      const k = smoothstep(0.3, 0.75, stain);
      r = lerp(r, 0.72, k * 0.55);
      g = lerp(g, 0.42, k * 0.55);
      b = lerp(b, 0.22, k * 0.55);
    } else if (stain < -0.55) {
      const k = smoothstep(-0.55, -0.85, stain);
      r *= 1 - 0.5 * k;
      g *= 1 - 0.5 * k;
      b *= 1 - 0.5 * k;
    }
    // flowstone: creamy, banded, wet, down the lower walls
    const flow = kind === ROCK.flowstone.id ? 0.7 : smoothstep(0.35, 0.8, vnoise3(x * 0.09 + 11, 0, z * 0.09));
    if (flow > 0 && !floorish && above < 7) {
      const band = 0.9 + 0.1 * Math.sin(y * 9 + vnoise3(x, y, z) * 3);
      r = lerp(r, 0.84 * band, flow * 0.75);
      g = lerp(g, 0.7 * band, flow * 0.75);
      b = lerp(b, 0.52 * band, flow * 0.75);
      wet = Math.max(wet, flow * 0.85);
    }
  }
  // damp floors near water, wet drip zones
  if (floorish) wet = Math.max(wet, 0.35 + 0.4 * smoothstep(0.2, 0.7, vnoise3(x * 0.2, 1, z * 0.2)));
  if (Math.hypot(x - MIRROR_LAKE.x, (z - MIRROR_LAKE.z) * 1.25) < MIRROR_LAKE.r + 2.5) wet = 1;
  if (z < -200 && x < 20 && x > -135 && above < 2.5) wet = Math.max(wet, 0.8);
  out[0] = r * v;
  out[1] = g * v;
  out[2] = b * v;
  return wet;
}

export const CAVE = {
  bounds: { minX: -170, maxX: 92, minZ: -258, maxZ: -18 },
  res: 0.5,
  seed: 11,
  shapes: CAVE_SHAPES,
  cover: (x, z) => z < cliffZ(x) - 0.2,
  // the portal mouths stay open in front of the cliff
  openAt: (x, z) => z >= cliffZ(x) - 0.2 && z < cliffZ(x) + 1.6 && (Math.abs(x - PORTAL_MAIN.x) < 3.6 || Math.abs(x - PORTAL_EXIT.x) < 3.4),
  post: cavePost,
  veto: caveVeto,
  color: caveColor,
};

// Terrain triangles hidden behind the portal facades (the tunnels pass through there).
export function terrainHole(x, z, fine) {
  if (!fine) return false;
  const cz = cliffZ(x);
  if (z > cz + 0.6 || z < cz - 4) return false;
  // only the stretch of cliff face lower than each tunnel's roof, as wide as the tunnel
  const h = surfaceHeight(x, z);
  if (Math.abs(x - PORTAL_MAIN.x) < 2.45) return h < PLAZA_Y + 4.55;
  if (Math.abs(x - PORTAL_EXIT.x) < 2.25) return h < PLAZA_Y + 4.2;
  return false;
}

// The Kestrel's cabin (its hull's outside uses open-air materials).
function inKestrel(x, z) {
  return x > KESTREL.x - 5.6 && x < KESTREL.x + 5.6 && z > KESTREL.z - 1.6 && z < KESTREL.z + 1.6;
}

// ---- baked light ------------------------------------------------------------------------------
export const LIGHTING = {
  grid: { minX: -170, minZ: -258, maxX: 92, maxZ: 110, res: 1.0, layers: 9 },
  // how much open sky reaches a spot: [ambient, sun]
  skyAt(x, z, overCave = z < cliffZ(x) - 0.2) {
    const cz = cliffZ(x);
    if (overCave) {
      // inside a portal tunnel the daylight fades over the first metres
      const nearPortal = Math.min(Math.abs(x - PORTAL_MAIN.x), Math.abs(x - PORTAL_EXIT.x)) < 4;
      const k = nearPortal ? smoothstep(cz - 14, cz, z) * 0.42 : 0;
      return [k, 0];
    }
    // the visitor center (a little past its walls, so no daylight leaks in along their feet;
    // its outer walls and roof use open-air materials)
    if (x > LODGE.x0 - 0.9 && x < LODGE.x1 + 0.9 && z > LODGE.z0 - 0.9 && z < LODGE.z1 + 0.6) return [0.3, 1];
    // under the porch roof
    if (x > PORCH.x0 - 0.5 && x < PORCH.x1 + 0.5 && z > PORCH.z0 && z < PORCH.z1) return [0.72, 1];
    // inside the Kestrel's cabin
    if (inKestrel(x, z)) return [0.22, 1];
    return [1, 1];
  },
  // the lamp layers inside the lodge run from its raised floor to its ceiling
  floorAt(x, z, h) {
    if (inKestrel(x, z)) return KESTREL.floor;
    if (x > LODGE.x0 - 0.9 && x < LODGE.x1 + 0.9 && z > LODGE.z0 - 0.9 && z < LODGE.z1 + 0.6) return LODGE.floor;
    if (x > PORCH.x0 - 0.5 && x < PORCH.x1 + 0.5 && z > PORCH.z0 && z < PORCH.z1) return LODGE.floor;
    return h;
  },
  ceilAt(x, z, h) {
    if (inKestrel(x, z)) return KESTREL.floor + 2.5;
    if (x > LODGE.x0 - 0.9 && x < LODGE.x1 + 0.9 && z > LODGE.z0 - 0.9 && z < LODGE.z1 + 0.6) return LODGE.ceil;
    if (x > PORCH.x0 - 0.5 && x < PORCH.x1 + 0.5 && z > PORCH.z0 && z < PORCH.z1) return LODGE.ceil - 0.6;
    return h + 9;
  },
  // which breaker a spot's lamps hang on (the reactor feeds everything underground)
  circuitAt(x, z) {
    if (z < cliffZ(x) - 0.2) return 'reactor';
    if (x > LODGE.x0 - 4 && x < LODGE.x1 + 3 && z > LODGE.z0 - 4 && z < PORCH.z1 + 4) return 'lodge';
    if (z > 57) return 'lot';
    if (x > 4 && z > PLAZA.z1 + 2.5) return 'mine';
    if (x < -10 && z > PLAZA.z1 + 2.5) return 'lodge';
    return 'plaza';
  },
  waveFrom: { x: 66, z: -224 },
  waveSpeed: 34,
  fog: 0x07080a,
  // fill light thrown back off the lit rock
  bounce: { k: 3.5, rho: 0.7, passes: 240, cap: 4, tint: 0xd8c7b0 },
  fogDensity: 0.014,
  fogGlow: 0.05,
  ambient: 0x0b0c0e,
  exposure: 2.0,
  headLight: 28,
  headLightBelow: 0.3,
  deepAt: 70,
};

// ---- sky: dawn breaking over the Cascades, brighter every round --------------------------------
export const SKY = {
  moonAz: -160,
  tod: {
    sunElev: [-7, -2.5, 3, 11, 22],
    sunAz: [14, 14, 14, 16, 20],
    sunColor: ['#8f9bd6', '#ff9a6a', '#ffb070', '#ffd7a8', '#fff0dc'],
    sunInt: [0.75, 0.95, 2.2, 3.0, 3.4],
    hemiSky: ['#6f7cb8', '#8f8ec4', '#a7aed8', '#a9c0e6', '#a8c4ec'],
    hemiGround: ['#3c3c4c', '#4a4442', '#544a3c', '#5a5040', '#5b5242'],
    hemiInt: [3.2, 2.8, 2.4, 2.0, 1.9],
    envInt: [2.0, 1.7, 1.35, 1.15, 1.05],
    zenith: ['#16204e', '#253a7a', '#3359a6', '#3a6cbe', '#2f6ccc'],
    horizon: ['#c27a74', '#ff9f74', '#ffc08c', '#d6e0ee', '#c4dcf2'],
    glow: ['#ff9a70', '#ffb37a', '#ffd29a', '#fff0d4', '#fff4e0'],
    fog: ['#5e5f86', '#8a7f9c', '#b0a8b8', '#b9c4d2', '#aec0d4'],
    fogSun: ['#c88a86', '#ffb08c', '#ffd0a4', '#fbe8d0', '#f4ecdc'],
    fogDensity: [0.016, 0.015, 0.013, 0.0095, 0.0075],
    cloudLit: ['#c79aa8', '#ffb7a0', '#ffd8bc', '#ffffff', '#ffffff'],
    cloudShade: ['#3e3c62', '#6a5c84', '#9a8cac', '#a9b4c8', '#a9b6c8'],
    cloudCover: [0.48, 0.48, 0.5, 0.52, 0.53],
    mtn: ['#1c2140', '#2c2c4c', '#3c4466', '#46597a', '#46597a'],
    stars: [0.6, 0.25, 0, 0, 0],
    moonElev: [14, 10, 6, 2, -4],
    exposure: [1.55, 1.35, 1.12, 1.0, 0.98],
  },
};

// ---- buyables, spawns, doors (filled in by the builders' layout) --------------------------------
export {
  DOORS, SPAWNERS, PLAYER_START, WALLBUYS, PERKS, BOX_LOCATIONS, BOX_START, UPGRADE_STATION,
  POWER_SWITCHES, EXO_STATION, ELEVATOR, REACTOR_CONSOLE, KESTREL,
} from './eh_layout.js';
export const POWER_SWITCH = null;
// the CALDERA console, the service lift, the soundscape
export { interactables, ambience, onPower } from './eh_interact.js';

export function objective(game) {
  const p = game.player;
  const w = game.world;
  if (!p.exo.has) return 'Grab the exo suit from the Kestrel';
  if (!w.power) {
    if (!game.zoneOpen[4]) return 'Get into the caverns';
    if (!game.zoneOpen[5]) return 'Find the way past the tour';
    if (!game.zoneOpen[8]) return 'Go down to the CALDERA reactor';
    return 'Start the CALDERA reactor';
  }
  if (!game.weapons.inv.some((wp) => wp.level > 0)) return 'Upgrade a weapon at the Weapon Forge';
  return 'Survive';
}

export function build(B, ctx) {
  const fx = { fires: [], smoke: [], sparks: [], beacons: [], cryo: [], screens: [], steam: [], drips: [], foam: [], embers: [] };
  B.region = 'surface';
  buildSurface(B, ctx, fx);
  B.region = 'cave';
  buildUnderground(B, ctx, fx);
  B.region = 'surface';
  return { fx };
}
