// Procedural structure + prop sprites from the shared module kit. Light from the top-left everywhere:
// left/top edges highlight, right/bottom edges shade. Cached per building / prop key.
import { RAMPS, SEM } from '../data/palette.js';
import { STYLES } from '../data/places.js';
import { createCanvas, ctx2d, outlineSprite } from './canvas.js';
import { hash2 } from '../core/rng.js';
import { drawText, measure } from './font.js';

const cache = new Map();
const K = RAMPS;

function mk(w, h, draw) {
  const c = createCanvas(w, h);
  const g = ctx2d(c);
  const r = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(r, g, w, h);
  return c;
}

// ---------------- buildings ----------------
export function buildingSprites(b) {
  const key = 'bld:' + b.id + ':' + (b.ownedSign || '');
  if (cache.has(key)) return cache.get(key);
  const st = STYLES[b.style] || STYLES.ruin;
  const wall = K[st.wall] || K.ink, roofR = K[st.roofRamp] || K.ink, trim = K[st.trim] || K.wood;
  const W = b.w * 16, Hr = b.h * 16;
  const roofStyle = b.roof;
  const roof = mk(W, Hr, (r, g) => {
    for (let y = 0; y < Hr; y++) {
      const upper = y < Hr / 2;
      for (let x = 0; x < W; x++) {
        const hsh = hash2(x + b.id * 31, y, 17);
        let c;
        if (roofStyle === 'tin') c = (x >> 1) & 1 ? roofR[upper ? 2 : 1] : roofR[upper ? 3 : 2];
        else if (roofStyle === 'shingle') c = (y % 5 === 4) || ((x + ((y / 5) | 0) * 3) % 6 === 0 && y % 5 > 1) ? roofR[0] : roofR[upper ? 2 : 1];
        else if (roofStyle === 'flat') c = x < 2 || y < 2 || x >= W - 2 || y >= Hr - 2 ? roofR[1] : hsh > 0.97 ? roofR[1] : roofR[2];
        else if (roofStyle === 'tarp') c = ((x + y) % 11 === 0) ? roofR[1] : ((x / 12 | 0) + (y / 10 | 0)) & 1 ? roofR[2] : roofR[3];
        else c = hsh > 0.55 ? K.ink[0] : (x % 8 === 0 || y % 9 === 0) ? K.wood[1] : roofR[1];
        if (roofStyle === 'tin' && hsh > 0.985) c = K.rust[1];
        r(x, y, 1, 1, c);
      }
    }
    if (roofStyle === 'tin' || roofStyle === 'shingle') r(0, (Hr / 2) | 0, W, 1, roofR[3]);
    if (roofStyle === 'flat') { r(6, 5, 6, 4, K.ink[2]); r(7, 5, 4, 1, K.ink[3]); if (W > 48) r(W - 16, Hr - 12, 8, 5, K.ink[2]); }
    if (roofStyle !== 'collapsed') {
      r(0, 0, W, 1, roofR[3]); r(0, 0, 1, Hr, roofR[3]); r(W - 1, 0, 1, Hr, roofR[0]);
    }
    r(0, Hr - 2, W, 2, K.ink[0]);
    // Door markers for doors not on the south face.
    for (const d of b.doors) {
      if (d.f === 'N') { const x = (d.x - b.x) * 16; r(x + 2, 0, 12, 4, trim[2]); r(x + 4, 1, 8, 2, K.ink[0]); }
      if (d.f === 'W') { const y = (d.y - b.y + 1) * 16; r(0, y - 14, 4, 12, trim[2]); r(1, y - 12, 2, 8, K.ink[0]); }
      if (d.f === 'E') { const y = (d.y - b.y + 1) * 16; r(W - 4, y - 14, 4, 12, trim[2]); r(W - 3, y - 12, 2, 8, K.ink[0]); }
    }
  });
  const face = mk(W, 16, (r, g) => {
    r(0, 0, W, 16, wall[1]);
    for (let x = 0; x < W; x++) {
      if (st.wall === 'wood' && x % 4 === 0) r(x, 0, 1, 16, wall[0]);
      if ((st.wall === 'rust' || st.wall === 'sea') && x % 3 === 1) r(x, 1, 1, 14, wall[0]);
    }
    if (st.wall !== 'wood' && st.wall !== 'rust' && st.wall !== 'sea') for (let y = 4; y < 16; y += 5) { r(0, y, W, 1, wall[0]); for (let x = (y % 2) * 4; x < W; x += 9) r(x, y - 4, 1, 4, wall[0]); }
    r(0, 0, W, 1, K.ink[0]);
    r(0, 0, 1, 16, wall[2]); r(W - 1, 0, 1, 16, wall[0]);
    const doorX = new Set(b.doors.filter((d) => d.f === 'S').map((d) => d.x - b.x));
    for (let t = 0; t < b.w; t++) {
      const x = t * 16;
      if (doorX.has(t)) {
        if (b.ruined) { r(x + 3, 3, 10, 13, K.ink[0]); continue; }
        r(x + 3, 2, 10, 14, trim[1]); r(x + 4, 3, 8, 13, b.hq ? K.ink[3] : K.wood[1]);
        r(x + 4, 3, 8, 1, trim[3]); r(x + 10, 9, 1, 2, K.gold[2]);
        if (b.hq) { r(x + 4, 7, 8, 1, K.ink[1]); r(x + 4, 11, 8, 1, K.ink[1]); }
        if (b.sign || b.ownedSign) {
          const sc = b.ownedSign ? K.amber[2] : b.lot ? K.bone[1] : trim[2];
          r(x - 3, -0, 22, 1, K.ink[0]);
          void sc;
        }
      } else if (t > 0 && t < b.w - 1 && (t % 2 === 1 || b.w <= 4)) {
        if (b.ruined && hash2(t, b.id, 2) > 0.5) { r(x + 4, 4, 8, 6, K.ink[0]); continue; }
        r(x + 4, 4, 8, 7, trim[1]); r(x + 5, 5, 6, 5, K.sea[0]); r(x + 5, 5, 2, 2, K.sea[2]); r(x + 4, 11, 8, 1, trim[3]);
        if (b.lot && !b.ownedSign) { r(x + 5, 6, 6, 1, K.wood[2]); r(x + 5, 8, 6, 1, K.wood[2]); }
      }
    }
    r(0, 15, W, 1, K.ink[0]);
  });
  // Sign board over the door: lots show FOR SALE, owned fronts show the business name.
  const sign = signSprite(b);
  const inner = mk(W, Hr, (r) => {
    r(0, 10, W, 6, wall[2]); r(0, 10, W, 1, wall[3]);
    r(0, 16, W, 16, wall[1]);
    for (let x = 0; x < W; x += 8) r(x, 18, 1, 12, wall[0]);
    r(0, 31, W, 1, K.ink[0]);
    r(0, 10, 16, Hr - 10, wall[2]); r(W - 16, 10, 16, Hr - 10, wall[2]);
    r(15, 10, 1, Hr - 10, wall[0]); r(W - 16, 10, 1, Hr - 10, wall[3]);
  });
  const out = { roof, face, inner, sign };
  cache.set(key, out);
  return out;
}

function signSprite(b) {
  const text = b.ownedSign || (b.lot ? 'FOR SALE' : b.sign || '');
  if (!text) return null;
  const w = Math.min(measure(text) + 6, b.w * 16 - 4);
  return mk(w, 11, (r, g) => {
    r(0, 0, w, 11, K.ink[0]);
    r(1, 1, w - 2, 9, b.ownedSign ? K.amber[1] : b.lot ? K.bone[1] : K.wood[1]);
    drawText(g, text, w / 2, 1, b.ownedSign ? K.bone[3] : b.lot ? K.ink[0] : K.bone[2], { align: 'center', maxW: w - 4 });
  });
}

export function invalidateBuilding(b) {
  for (const k of [...cache.keys()]) if (k.startsWith('bld:' + b.id + ':')) cache.delete(k);
}

// ---------------- towers & gates ----------------
export function towerSprite(style) {
  const key = 'tower:' + style;
  if (cache.has(key)) return cache.get(key);
  const st = STYLES[style] || STYLES.ruin;
  const wood = st.fence === 'metal' ? K.ink : K.wood;
  const c = mk(26, 46, (r) => {
    r(4, 18, 3, 28, wood[1]); r(19, 18, 3, 28, wood[1]); r(5, 18, 1, 28, wood[2]);
    for (let y = 22; y < 44; y += 7) r(4, y, 18, 1, wood[0]);
    r(1, 12, 24, 9, wood[2]); r(1, 12, 24, 1, wood[3]); r(1, 20, 24, 1, K.ink[0]);
    for (let x = 3; x < 24; x += 4) r(x, 13, 1, 7, wood[1]);
    r(0, 2, 26, 9, K[st.roofRamp][1]); r(0, 2, 26, 2, K[st.roofRamp][2]); r(0, 10, 26, 1, K.ink[0]);
    r(3, 11, 2, 2, wood[1]); r(21, 11, 2, 2, wood[1]);
  });
  const out = outlineSprite(c, K.ink[0]);
  cache.set(key, out);
  return out;
}

export function gateSprite(style, name, width) {
  const key = 'gate:' + style + ':' + width + ':' + name;
  if (cache.has(key)) return cache.get(key);
  const st = STYLES[style] || STYLES.ruin;
  const wood = st.fence === 'metal' ? K.ink : K.wood;
  const W = width * 16 + 8;
  const out = mk(W, 36, (r, g) => {
    r(0, 4, 5, 32, wood[1]); r(W - 5, 4, 5, 32, wood[1]); r(1, 4, 1, 32, wood[3]); r(W - 2, 4, 1, 32, wood[0]);
    r(0, 2, W, 11, wood[2]); r(0, 2, W, 1, wood[3]); r(0, 12, W, 1, K.ink[0]);
    const fits = measure(name) <= W - 10;
    if (fits) drawText(g, name, W / 2, 3, K.bone[3], { align: 'center', shadow: K.ink[0] });
    else { r(W / 2 - 6, 5, 12, 5, K[st.banner][2]); }
    r(2, 13, 2, 3, K[st.banner][2]); r(W - 4, 13, 2, 3, K[st.banner][2]);
  });
  cache.set(key, out);
  return out;
}

// ---------------- props ----------------
// Each prop: { img, ax, ay } where (ax, ay) is the offset from the tile's top-left to draw at.
const PROPS = {
  lamp: [10, 30, (r) => { r(4, 8, 2, 22, K.ink[2]); r(4, 8, 1, 22, K.ink[3]); r(1, 1, 8, 7, K.ink[1]); r(2, 2, 6, 5, K.gold[2]); r(3, 3, 2, 2, K.gold[3]); r(2, 29, 6, 1, K.ink[1]); }],
  stall: [16, 24, (r, g, w, h, v) => {
    const pal = [[K.rust[2], K.bone[2]], [K.teal[2], K.bone[2]], [K.gold[1], K.wood[2]], [K.amber[2], K.bone[3]], [K.sea[2], K.bone[2]], [K.olive[2], K.sand[2]], [K.heat[1], K.bone[2]], [K.green[2], K.bone[2]]][v % 8];
    r(1, 10, 2, 13, K.wood[1]); r(13, 10, 2, 13, K.wood[1]);
    for (let x = 0; x < 16; x++) r(x, 2, 1, 8, ((x >> 1) & 1) ? pal[0] : pal[1]);
    r(0, 9, 16, 1, K.ink[0]); r(0, 2, 16, 1, K.bone[3]);
    r(2, 15, 12, 5, K.wood[2]); r(2, 15, 12, 1, K.wood[3]); r(3, 13, 3, 2, K.olive[2]); r(7, 13, 3, 2, K.sand[3]); r(11, 12, 2, 3, K.rust[2]);
  }],
  well: [16, 22, (r) => { r(1, 12, 14, 9, K.bone[0]); r(1, 12, 14, 1, K.bone[2]); r(3, 14, 10, 4, K.sea[0]); r(2, 2, 2, 11, K.wood[1]); r(12, 2, 2, 11, K.wood[1]); r(0, 0, 16, 3, K.rust[1]); r(0, 0, 16, 1, K.rust[3]); r(6, 4, 4, 1, K.ink[2]); }],
  bench: [16, 10, (r) => { r(1, 2, 14, 3, K.wood[2]); r(1, 2, 14, 1, K.wood[3]); r(2, 5, 2, 5, K.wood[0]); r(12, 5, 2, 5, K.wood[0]); }],
  banner: [10, 22, (r, g, w, h, v, st) => { const c = K[st.banner] || K.rust; r(4, 0, 2, 22, K.ink[1]); r(0, 2, 10, 14, c[2]); r(0, 2, 10, 1, c[3]); r(0, 15, 3, 3, c[1]); r(7, 15, 3, 3, c[1]); r(3, 6, 4, 4, c[3]); r(4, 7, 2, 2, c[0]); }],
  crates: [16, 18, (r) => { crate(r, 0, 6, 10, 12); crate(r, 7, 9, 9, 9); crate(r, 3, 0, 8, 8); }],
  barrel: [12, 14, (r) => { r(1, 1, 10, 13, K.rust[1]); r(1, 1, 3, 13, K.rust[2]); r(1, 0, 10, 2, K.rust[3]); r(1, 4, 10, 1, K.ink[1]); r(1, 10, 10, 1, K.ink[1]); r(9, 1, 2, 13, K.rust[0]); }],
  fire: [16, 12, (r) => { r(1, 7, 14, 4, K.ink[2]); r(2, 6, 3, 2, K.bone[0]); r(11, 6, 3, 2, K.bone[0]); r(4, 7, 8, 2, K.wood[0]); r(5, 4, 6, 3, K.heat[2]); r(6, 2, 3, 3, K.heat[3]); r(7, 1, 1, 2, K.gold[3]); }],
  watertower: [48, 64, (r) => {
    r(6, 30, 3, 34, K.ink[2]); r(39, 30, 3, 34, K.ink[2]); r(22, 32, 3, 32, K.ink[2]);
    for (let y = 36; y < 62; y += 8) r(6, y, 36, 1, K.ink[1]);
    r(2, 6, 44, 26, K.rust[1]); r(2, 6, 10, 26, K.rust[2]); r(38, 6, 8, 26, K.rust[0]);
    for (let x = 4; x < 46; x += 6) r(x, 8, 1, 22, K.rust[0]);
    r(0, 2, 48, 5, K.rust[2]); r(10, 0, 28, 3, K.rust[3]); r(2, 31, 44, 1, K.ink[0]);
    r(14, 14, 20, 6, K.rust[0]);
  }],
  boxcar: [32, 64, (r) => {
    r(1, 2, 30, 60, K.rust[1]); r(1, 2, 4, 60, K.rust[2]); r(27, 2, 4, 60, K.rust[0]);
    for (let y = 6; y < 60; y += 6) r(1, y, 30, 1, K.rust[0]);
    r(8, 22, 16, 20, K.rust[0]); r(9, 23, 14, 18, K.ink[1]); r(1, 0, 30, 3, K.rust[3]); r(1, 61, 30, 3, K.ink[0]);
  }],
  scrap: [16, 14, (r) => { r(1, 8, 14, 6, K.ink[2]); r(3, 5, 6, 4, K.rust[1]); r(8, 3, 5, 6, K.ink[3]); r(4, 2, 2, 4, K.rust[2]); r(10, 9, 4, 2, K.rust[0]); r(2, 11, 3, 2, K.bone[0]); }],
  compost: [16, 12, (r) => { r(1, 4, 14, 8, K.wood[0]); r(3, 2, 10, 4, K.wood[1]); r(4, 5, 2, 2, K.olive[2]); r(10, 7, 2, 2, K.olive[1]); r(7, 3, 2, 1, K.wood[2]); }],
  dummy: [12, 22, (r) => { r(5, 10, 2, 12, K.wood[1]); r(2, 8, 8, 6, K.sand[2]); r(3, 2, 6, 6, K.sand[3]); r(4, 4, 4, 2, K.heat[2]); r(0, 9, 12, 2, K.wood[1]); }],
  sandbags: [16, 10, (r) => { for (let i = 0; i < 3; i++) { r(i * 5, 4, 6, 5, K.sand[1]); r(i * 5, 4, 6, 1, K.sand[2]); } r(2, 0, 6, 5, K.sand[1]); r(8, 0, 6, 5, K.sand[1]); r(2, 0, 12, 1, K.sand[3]); }],
  rubble: [16, 10, (r) => { r(1, 5, 14, 5, K.ink[2]); r(3, 2, 5, 4, K.bone[0]); r(9, 3, 4, 3, K.ink[3]); r(5, 6, 2, 1, K.rust[1]); r(12, 1, 1, 4, K.rust[1]); }],
  wreck: [16, 14, (r) => { r(0, 5, 16, 8, K.rust[1]); r(0, 5, 16, 1, K.rust[2]); r(3, 1, 9, 5, K.rust[0]); r(4, 2, 7, 3, K.sea[0]); r(1, 12, 4, 2, K.ink[0]); r(11, 12, 4, 2, K.ink[0]); r(7, 7, 3, 2, K.ink[1]); }],
  tires: [12, 10, (r) => { r(0, 5, 12, 5, K.ink[1]); r(2, 6, 8, 3, K.ink[0]); r(1, 0, 10, 5, K.ink[1]); r(3, 1, 6, 3, K.ink[0]); r(1, 0, 10, 1, K.ink[2]); }],
  jobboard: [16, 24, (r) => { r(1, 8, 2, 16, K.wood[1]); r(13, 8, 2, 16, K.wood[1]); r(0, 2, 16, 12, K.wood[2]); r(0, 2, 16, 1, K.wood[3]); r(2, 4, 4, 5, K.bone[3]); r(7, 3, 4, 4, K.bone[2]); r(11, 5, 3, 5, K.sand[3]); r(7, 8, 3, 4, K.bone[2]); r(3, 5, 1, 1, K.heat[2]); }],
  bar: [16, 14, (r) => { r(0, 2, 16, 12, K.wood[1]); r(0, 2, 16, 3, K.wood[3]); r(3, 0, 2, 3, K.amber[2]); r(9, 0, 2, 3, K.green[2]); }],
  table: [16, 12, (r) => { r(2, 2, 12, 6, K.wood[2]); r(2, 2, 12, 1, K.wood[3]); r(3, 8, 2, 4, K.wood[0]); r(11, 8, 2, 4, K.wood[0]); r(6, 1, 2, 2, K.bone[2]); }],
  shelf: [16, 20, (r) => { r(1, 0, 14, 20, K.wood[1]); for (let y = 2; y < 20; y += 6) { r(2, y, 12, 4, K.wood[0]); r(3, y + 1, 2, 3, K.sand[2]); r(7, y + 1, 3, 3, K.rust[2]); r(11, y + 2, 2, 2, K.teal[2]); } }],
  bunk: [16, 16, (r) => { r(1, 0, 14, 16, K.wood[1]); r(2, 1, 12, 6, K.bone[1]); r(2, 9, 12, 6, K.bone[1]); r(2, 1, 4, 3, K.bone[3]); r(2, 9, 4, 3, K.bone[3]); }],
  rack: [16, 18, (r) => { r(0, 2, 16, 14, K.wood[1]); r(0, 2, 16, 1, K.wood[3]); for (let x = 2; x < 15; x += 4) { r(x, 4, 2, 10, K.ink[1]); r(x, 4, 2, 2, K.ink[3]); } }],
  cot: [16, 10, (r) => { r(1, 2, 14, 6, K.teal[2]); r(1, 2, 4, 6, K.bone[3]); r(2, 8, 2, 2, K.ink[1]); r(12, 8, 2, 2, K.ink[1]); }],
  pew: [16, 10, (r) => { r(0, 1, 16, 4, K.wood[1]); r(0, 1, 16, 1, K.wood[2]); r(0, 5, 16, 3, K.wood[0]); r(1, 8, 2, 2, K.wood[0]); r(13, 8, 2, 2, K.wood[0]); }],
  altar: [16, 14, (r) => { r(1, 5, 14, 9, K.bone[1]); r(1, 5, 14, 1, K.bone[3]); r(6, 0, 4, 6, K.gold[2]); r(7, 1, 2, 4, K.gold[3]); r(3, 8, 10, 2, K.heat[1]); }],
  anvil: [14, 10, (r) => { r(1, 1, 12, 4, K.ink[2]); r(1, 1, 12, 1, K.ink[3]); r(4, 5, 6, 3, K.ink[1]); r(2, 8, 10, 2, K.ink[1]); }],
  desk: [16, 12, (r) => { r(1, 2, 14, 7, K.wood[2]); r(1, 2, 14, 1, K.wood[3]); r(2, 9, 2, 3, K.wood[0]); r(12, 9, 2, 3, K.wood[0]); r(4, 0, 5, 3, K.bone[3]); }],
  safe: [12, 14, (r) => { r(0, 0, 12, 14, K.ink[2]); r(0, 0, 12, 1, K.ink[3]); r(2, 2, 8, 10, K.ink[1]); r(5, 5, 3, 3, K.gold[2]); }],
  bed: [16, 14, (r) => { r(1, 0, 14, 14, K.wood[1]); r(2, 1, 12, 12, K.rust[2]); r(2, 1, 12, 4, K.bone[2]); }],
  vault: [16, 18, (r) => { r(0, 0, 16, 18, K.ink[2]); r(0, 0, 16, 1, K.ink[3]); r(2, 2, 12, 14, K.ink[1]); r(5, 5, 6, 6, K.ink[3]); r(7, 7, 2, 2, K.gold[2]); r(12, 7, 2, 4, K.gold[1]); }],
  stash: [14, 14, (r) => { r(0, 0, 14, 14, K.ink[2]); r(0, 0, 14, 1, K.ink[3]); r(2, 2, 10, 10, K.amber[1]); r(5, 5, 4, 4, K.gold[2]); r(6, 6, 2, 2, K.ink[0]); }],
  dryline: [16, 18, (r) => { r(1, 2, 2, 16, K.wood[1]); r(13, 2, 2, 16, K.wood[1]); r(1, 3, 14, 1, K.bone[1]); for (let x = 3; x < 13; x += 3) { r(x, 4, 2, 5, K.olive[2]); r(x, 8, 2, 1, K.olive[1]); } }],
  cureshelf: [16, 20, (r) => { r(1, 0, 14, 20, K.wood[1]); for (let y = 2; y < 18; y += 6) for (let x = 2; x < 14; x += 4) { r(x, y, 3, 4, K.sea[2]); r(x, y, 3, 1, K.bone[2]); r(x + 1, y + 2, 1, 2, K.olive[2]); } }],
  packtable: [16, 12, (r) => { r(1, 3, 14, 6, K.wood[2]); r(1, 3, 14, 1, K.wood[3]); r(2, 9, 2, 3, K.wood[0]); r(12, 9, 2, 3, K.wood[0]); r(3, 1, 3, 3, K.olive[2]); r(8, 1, 4, 3, K.bone[2]); }],
  lootcrate: [14, 12, (r) => { crate(r, 0, 1, 14, 11); r(10, 0, 2, 2, K.gold[3]); }],
  boulder: [16, 12, (r) => { r(2, 3, 12, 9, K.ink[2]); r(4, 1, 8, 4, K.ink[3]); r(4, 1, 4, 2, K.bone[0]); r(11, 4, 3, 8, K.ink[1]); }],
  deadtree: [16, 28, (r) => { r(7, 8, 3, 20, K.wood[1]); r(7, 8, 1, 20, K.wood[2]); r(3, 6, 4, 2, K.wood[1]); r(2, 3, 2, 4, K.wood[1]); r(10, 10, 4, 2, K.wood[1]); r(13, 5, 2, 6, K.wood[1]); r(8, 2, 2, 7, K.wood[1]); }],
  brokenwall: [16, 18, (r) => { r(0, 6, 16, 12, K.bone[0]); r(0, 6, 16, 1, K.bone[1]); r(2, 2, 5, 5, K.bone[0]); r(10, 4, 4, 3, K.bone[0]); r(4, 10, 3, 3, K.ink[1]); r(11, 12, 1, 5, K.rust[1]); }],
  bones: [14, 8, (r) => { r(1, 3, 10, 2, K.bone[2]); r(0, 2, 2, 4, K.bone[3]); r(10, 2, 2, 4, K.bone[3]); r(4, 6, 6, 1, K.bone[1]); }],
  haybale: [16, 12, (r) => { r(1, 2, 14, 10, K.sand[2]); r(1, 2, 14, 2, K.sand[3]); r(1, 6, 14, 1, K.sand[1]); r(13, 2, 2, 10, K.sand[1]); }],
  fencepost: [8, 14, (r) => { r(3, 2, 2, 12, K.wood[1]); r(3, 2, 1, 12, K.wood[2]); r(0, 6, 8, 1, K.wood[0]); }],
  reeds: [12, 14, (r) => { for (let x = 1; x < 12; x += 2) { r(x, 4 + (x % 3), 1, 10 - (x % 3), K.olive[2]); r(x, 3 + (x % 3), 1, 2, K.wood[1]); } }],
  plot: [32, 32, () => {}],
};

function crate(r, x, y, w, h) {
  r(x, y, w, h, K.wood[2]); r(x, y, w, 1, K.wood[3]); r(x, y, 1, h, K.wood[3]);
  r(x + w - 1, y, 1, h, K.wood[0]); r(x, y + h - 1, w, 1, K.wood[0]);
  r(x + 1, y + Math.floor(h / 2), w - 2, 1, K.wood[1]);
}

const OUTLINE_SKIP = new Set(['banner', 'plot']);

export function propSprite(type, variant = 0, styleId = 'ruin') {
  const key = 'prop:' + type + ':' + variant + ':' + (type === 'banner' ? styleId : '');
  if (cache.has(key)) return cache.get(key);
  const def = PROPS[type] || PROPS.crates;
  const [w, h, draw] = def;
  const st = STYLES[styleId] || STYLES.ruin;
  const raw = mk(w, h, (r, g, ww, hh) => draw(r, g, ww, hh, variant, st));
  const img = OUTLINE_SKIP.has(type) ? raw : outlineSprite(raw, K.ink[0]);
  const big = type === 'watertower' || type === 'boxcar';
  const pw = img.width, ph = img.height;
  const out = big ? { img, ax: 0, ay: (type === 'watertower' ? 48 : 64) - ph + 1 } : { img, ax: Math.round((16 - pw) / 2), ay: 16 - ph + 1 };
  cache.set(key, out);
  return out;
}

export function highlightSprite(img) {
  const key = img;
  if (cache.has(key)) return cache.get(key);
  const c = createCanvas(img.width + 2, img.height + 2);
  const g = ctx2d(c);
  g.drawImage(img, 1, 1);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = SEM.lootHi;
  g.fillRect(0, 0, c.width, c.height);
  const o = createCanvas(c.width + 2, c.height + 2);
  const og = ctx2d(o);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) og.drawImage(c, dx, dy);
  cache.set(key, o);
  return o;
}
