// Builds the static 128x128 world from the master plan. Pure (no DOM): used by the game,
// the layout validator and the headless sim. Seed affects decoration only.
import { WORLD_W, WORLD_H, PLACES, ROADS, TRACKS, BIOME_MAP, ARCHETYPES } from '../data/places.js';
import { T, F, F_BY_NAME, SOLID, ST } from './tiles.js';
import { generatePlace, C, outside } from './layout.js';
import { fbm, hash2, RNG } from '../core/rng.js';

export const WORLD_SEED = 0x5eed;

const BIOME_GROUND = { W: T.WATER, M: T.MARSH, C: T.RUBBLE, B: T.ROCK, D: T.SAND, F: T.DIRT, G: T.GRASS };
const BIOME_FLAT = { W: T.SAND, M: T.DIRT, C: T.RUBBLE, B: T.ROCK, D: T.SAND, F: T.DIRT, G: T.GRASS };

export function createWorld() {
  const N = WORLD_W * WORLD_H;
  return {
    w: WORLD_W, h: WORLD_H,
    biome: new Array(N).fill('G'),
    ground: new Uint8Array(N), floor: new Uint8Array(N), solid: new Uint8Array(N),
    struct: new Uint8Array(N), zone: new Uint8Array(N), bldg: new Int16Array(N).fill(-1),
    road: new Uint8Array(N), street: new Uint8Array(N), deco: new Uint8Array(N), wallStyle: new Array(N).fill(null),
    buildings: [], props: [], places: [], layouts: {}, placeIndex: {},
  };
}

export const idx = (x, y) => y * WORLD_W + x;
export const inWorld = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;

function biomeAt(x, y, seed) {
  const nx = (fbm(x * 0.09, y * 0.09, seed, 3) - 0.5) * 7;
  const ny = (fbm(x * 0.09 + 50, y * 0.09 + 50, seed, 3) - 0.5) * 7;
  const bx = Math.max(0, Math.min(31, Math.floor((x + nx) / 4)));
  const by = Math.max(0, Math.min(31, Math.floor((y + ny) / 4)));
  return BIOME_MAP[by][bx];
}

function paintBiomes(W, seed) {
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const b = x <= 2 && BIOME_MAP[Math.floor(y / 4)][0] === 'W' ? 'W' : biomeAt(x, y, seed);
    const i = idx(x, y);
    W.biome[i] = b;
    W.ground[i] = BIOME_GROUND[b];
  }
}

// Obstacles reserved away from roads and places: cliffs in badlands, pools in marsh, fields on farms.
function paintFeatures(W, seed, keepClear) {
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = idx(x, y);
    const b = W.biome[i];
    if (keepClear[i]) continue;
    const n = fbm(x * 0.11, y * 0.11, seed + 7, 3);
    if (b === 'B' && n > 0.66) W.ground[i] = T.CLIFF;
    else if (b === 'M' && n > 0.68) W.ground[i] = T.WATER;
    else if (b === 'F' && fbm(x * 0.05, y * 0.05, seed + 3, 2) > 0.55) W.ground[i] = T.FIELD;
    else if (b === 'D' && n < 0.3) W.ground[i] = T.ROCK;
    else if (b === 'G' && n > 0.7) W.ground[i] = T.DIRT;
    else if (b === 'C' && n > 0.72) W.ground[i] = T.ROCK;
  }
}

function polylineTiles(pts, width) {
  const out = [];
  const lo = width === 3 ? -1 : 0, hi = width === 3 ? 1 : 1;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    for (;;) {
      for (let a = lo; a <= hi; a++) for (let b = lo; b <= hi; b++) out.push([x + a, y + b]);
      if (x === x2 && y === y2) break;
      x += sx; y += sy;
    }
  }
  return out;
}

function insidePlace(x, y) {
  return PLACES.some((p) => x >= p.at[0] && y >= p.at[1] && x < p.at[0] + p.w && y < p.at[1] + p.h);
}

// Roads stop at footprint edges; gates connect them to the inside.
function markRoads(W) {
  const tiles = [];
  const ok = (x, y) => inWorld(x, y) && !insidePlace(x, y);
  for (const r of ROADS) for (const [x, y] of polylineTiles(r.pts, 3)) if (ok(x, y)) { W.road[idx(x, y)] = 1; tiles.push([x, y]); }
  for (const r of TRACKS) for (const [x, y] of polylineTiles(r.pts, 2)) if (ok(x, y) && !W.road[idx(x, y)]) { W.road[idx(x, y)] = 2; tiles.push([x, y]); }
  for (let i = 0; i < W.road.length; i++) {
    if (!W.road[i]) continue;
    W.floor[i] = W.road[i] === 1 ? F.ASPHALT : F.TRACK;
    W.street[i] = 2;
    if (W.ground[i] === T.WATER || W.ground[i] === T.CLIFF) W.ground[i] = T.DIRT;
  }
  return tiles;
}

function stampPlace(W, L, zoneId) {
  const p = L.place;
  // Flatten ground inside the footprint.
  for (let y = L.box.y; y < L.box.y + L.box.h; y++) for (let x = L.box.x; x < L.box.x + L.box.w; x++) {
    if (!inWorld(x, y)) continue;
    const i = idx(x, y);
    W.zone[i] = zoneId;
    const g = W.ground[i];
    if (g === T.WATER || g === T.CLIFF || g === T.MARSH) W.ground[i] = BIOME_FLAT[W.biome[i]] === T.SAND && p.kind !== 'ruin' ? T.SAND : (g === T.WATER || g === T.MARSH ? T.DIRT : T.ROCK);
    if (W.ground[i] === T.FIELD && p.kind !== 'hollow') W.ground[i] = T.DIRT;
  }
  for (const c of L.cells) {
    if (!inWorld(c.x, c.y)) continue;
    const i = idx(c.x, c.y);
    if (c.floor) W.floor[i] = F_BY_NAME[c.floor] || 0;
    switch (c.code) {
      case C.WALL: W.struct[i] = ST.WALL; W.solid[i] = SOLID.FULL; W.wallStyle[i] = p.palette; break;
      case C.TOWER: W.struct[i] = ST.TOWER; W.solid[i] = SOLID.FULL; W.wallStyle[i] = p.palette; break;
      case C.GATE: W.struct[i] = ST.GATE; W.solid[i] = SOLID.FREE; W.street[i] = 1; W.wallStyle[i] = p.palette; break;
      case C.FENCE: W.struct[i] = ST.FENCE; W.solid[i] = SOLID.FENCE; W.wallStyle[i] = p.palette; break;
      case C.STREET: case C.PLAZA: case C.YARD: case C.LANE: W.street[i] = 1; break;
      default: break;
    }
  }
  for (const b of L.buildings) stampBuilding(W, b);
  for (const pr of L.props) stampProp(W, { ...pr, place: p.id });
  if (L.spawns.loot) for (const l of L.spawns.loot) stampProp(W, { x: l.x, y: l.y, type: 'lootcrate', tier: l.tier, place: p.id });
}

function stampBuilding(W, b) {
  const bi = W.buildings.length;
  b.id = bi;
  W.buildings.push(b);
  const doorSet = new Set(b.doors.map((d) => d.x + ',' + d.y));
  const rng = new RNG(bi * 977 + 13);
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const i = idx(x, y);
    W.bldg[i] = bi;
    W.zone[i] = W.zone[i] || 0;
    const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
    W.floor[i] = F_BY_NAME[b.floor] || F.PLANK;
    if (doorSet.has(x + ',' + y)) { W.struct[i] = ST.DOOR; W.solid[i] = SOLID.FREE; }
    else if (edge) {
      if (b.ruined && rng.chance(0.3)) { W.struct[i] = ST.BROKEN; W.solid[i] = SOLID.LOW; }
      else { W.struct[i] = ST.BWALL; W.solid[i] = SOLID.FULL; }
    } else { W.struct[i] = ST.NONE; W.solid[i] = SOLID.FREE; }
  }
  furnish(W, b, bi);
}

// Interior props hug the back wall; the vault safe sits in a corner off the door-to-door line.
function furnish(W, b, bi) {
  const inner = [];
  for (let y = b.y + 1; y < b.y + b.h - 1; y++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) inner.push([x, y]);
  if (!inner.length) return;
  const doorsIn = b.doors.map((d) => { const [ox, oy] = outside(d); return [2 * d.x - ox, 2 * d.y - oy]; });
  const nearDoor = (x, y) => b.doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) <= 1) || doorsIn.some(([ix, iy]) => Math.abs(ix - x) + Math.abs(iy - y) <= 1);
  const wantVault = b.hq;
  const wants = [...(b.propsWanted || [])];
  if (wantVault) wants.unshift('vault');
  if (b.role === 'depot') wants.splice(0, wants.length, 'stash', 'dryline', 'cureshelf', 'packtable', 'bunk');
  const spots = inner.filter(([x, y]) => !nearDoor(x, y)).sort((a, c) => wallScore(b, c) - wallScore(b, a));
  const maxProps = Math.max(1, Math.floor(inner.length / 3));
  let placed = 0;
  for (const type of wants) {
    if (placed >= maxProps && type !== 'vault' && type !== 'stash') continue;
    const s = spots.find(([x, y]) => W.solid[idx(x, y)] === SOLID.FREE && !touchesProp(W, b, x, y));
    if (!s) break;
    stampProp(W, { x: s[0], y: s[1], type, inside: bi, place: b.place, interior: true });
    placed++;
  }
}

function wallScore(b, [x, y]) {
  let s = 0;
  if (y === b.y + 1) s += 2;
  if (x === b.x + 1 || x === b.x + b.w - 2) s += 1;
  return s;
}

function touchesProp(W, b, x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const i = idx(x + dx, y + dy);
    if (W.bldg[i] === b.id && W.solid[i] === SOLID.LOW) return true;
  }
  return false;
}

const BIG_PROPS = { watertower: [3, 3, SOLID.FULL], boxcar: [2, 4, SOLID.FULL] };
const NONSOLID_PROPS = new Set(['banner', 'den']);

export function stampProp(W, pr) {
  const [w, h, s] = BIG_PROPS[pr.type] || [1, 1, SOLID.LOW];
  const rec = { ...pr, w, h, id: W.props.length };
  W.props.push(rec);
  if (pr.onWall || NONSOLID_PROPS.has(pr.type)) return rec;
  for (let y = pr.y; y < pr.y + h; y++) for (let x = pr.x; x < pr.x + w; x++) if (inWorld(x, y)) W.solid[idx(x, y)] = s;
  return rec;
}

function scatterDebris(W, seed, keepClear) {
  const rng = new RNG(seed ^ 0xdeb);
  for (let k = 0; k < 520; k++) {
    const x = rng.int(1, WORLD_W - 2), y = rng.int(1, WORLD_H - 2);
    const i = idx(x, y);
    if (keepClear[i] || W.solid[i] || W.zone[i]) continue;
    const b = W.biome[i];
    const g = W.ground[i];
    if (g === T.WATER || g === T.CLIFF) continue;
    let type = null;
    if (b === 'C') type = rng.pick(['rubble', 'rubble', 'wreck', 'brokenwall', 'tires']);
    else if (b === 'B') type = rng.pick(['boulder', 'boulder', 'deadtree']);
    else if (b === 'D') type = rng.pick(['bones', 'boulder', 'wreck']);
    else if (b === 'F') type = rng.pick(['haybale', 'deadtree', 'fencepost']);
    else if (b === 'M') type = rng.pick(['reeds', 'deadtree', 'reeds']);
    else if (b === 'G') type = rng.pick(['deadtree', 'boulder', 'tires']);
    if (type) stampProp(W, { x, y, type, wild: true });
  }
}

export function buildWorld(seed = WORLD_SEED) {
  const W = createWorld();
  W.seed = seed;
  paintBiomes(W, seed);
  markRoads(W);
  // Keep-clear mask: within 3 tiles of roads/tracks and within 2 tiles of any place footprint.
  const keep = new Uint8Array(WORLD_W * WORLD_H);
  const mark = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y <= Math.min(WORLD_H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(WORLD_W - 1, x1); x++) keep[idx(x, y)] = 1; };
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) if (W.road[idx(x, y)]) mark(x - 2, y - 2, x + 2, y + 2);
  for (const p of PLACES) mark(p.at[0] - 3, p.at[1] - 3, p.at[0] + p.w + 2, p.at[1] + p.h + 2);
  paintFeatures(W, seed, keep);
  PLACES.forEach((p, k) => {
    const L = generatePlace(p);
    W.layouts[p.id] = L;
    W.places.push(p);
    W.placeIndex[p.id] = k + 1;
    stampPlace(W, L, k + 1);
  });
  // Rail spur continues south from the Hollow to the map edge.
  const hol = W.layouts.hollow;
  for (let y = hol.box.y + hol.box.h; y < WORLD_H; y++) for (const x of [hol.box.x + 4, hol.box.x + 5]) { W.floor[idx(x, y)] = F.RAIL; W.ground[idx(x, y)] = T.DIRT; }
  for (let i = 0; i < W.solid.length; i++) {
    if (W.solid[i] || W.struct[i] || W.road[i]) continue;
    if (W.ground[i] === T.WATER) W.solid[i] = SOLID.WATER;
    else if (W.ground[i] === T.CLIFF) W.solid[i] = SOLID.FULL;
  }
  scatterDebris(W, seed, keep);
  for (let i = 0; i < W.deco.length; i++) W.deco[i] = Math.floor(hash2(i % WORLD_W, Math.floor(i / WORLD_W), seed) * 255);
  return W;
}

// Building index helpers for renderer/action layer.
export function buildingAt(W, x, y) { return inWorld(x, y) ? W.bldg[idx(x, y)] : -1; }
export function placeAt(W, x, y) { if (!inWorld(x, y)) return null; const z = W.zone[idx(x, y)]; return z ? W.places[z - 1] : null; }
export { ARCHETYPES };
