// Hollow grid facility sprites (32x32 per 2x2-tile cell) incl. plant growth stages.
import { RAMPS } from '../data/palette.js';
import { STRAINS } from '../data/strains.js';
import { createCanvas, ctx2d, outlineSprite } from './canvas.js';

const K = RAMPS;
const cache = new Map();

function mk(draw) {
  const c = createCanvas(32, 40);
  const g = ctx2d(c);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  draw(r, g);
  return outlineSprite(c, K.ink[0]);
}

const DRAW = {
  plot: (r) => { r(1, 10, 30, 28, K.wood[0]); for (let y = 12; y < 38; y += 4) r(2, y, 28, 2, K.wood[1]); r(1, 10, 30, 1, K.wood[2]); r(0, 9, 1, 30, K.wood[2]); r(31, 9, 1, 30, K.wood[1]); },
  growroom: (r) => { r(1, 6, 30, 32, K.ink[3]); r(1, 6, 30, 2, K.bone[0]); r(4, 10, 24, 20, K.wood[0]); r(3, 30, 26, 8, K.ink[2]); r(6, 2, 2, 6, K.ink[1]); r(24, 2, 2, 6, K.ink[1]); r(4, 1, 24, 2, K.gold[2]); },
  generator: (r) => { r(3, 16, 26, 20, K.olive[1]); r(3, 16, 26, 2, K.olive[3]); r(6, 20, 12, 10, K.ink[1]); r(20, 10, 4, 8, K.ink[2]); r(22, 6, 2, 4, K.ink[1]); r(8, 22, 8, 2, K.gold[2]); r(5, 34, 22, 3, K.ink[1]); },
  watertank: (r) => { r(5, 6, 22, 26, K.sea[1]); r(5, 6, 6, 26, K.sea[2]); r(22, 6, 5, 26, K.sea[0]); r(4, 4, 24, 3, K.sea[3]); for (let y = 12; y < 32; y += 7) r(5, y, 22, 1, K.sea[0]); r(8, 32, 3, 6, K.ink[2]); r(21, 32, 3, 6, K.ink[2]); },
  dryrack: (r) => { r(2, 8, 3, 30, K.wood[1]); r(27, 8, 3, 30, K.wood[1]); for (let y = 10; y < 34; y += 8) { r(2, y, 28, 1, K.bone[1]); for (let x = 6; x < 27; x += 5) r(x, y + 1, 3, 5, K.olive[2]); } },
  cureroom: (r) => { r(2, 6, 28, 32, K.wood[1]); for (let y = 9; y < 36; y += 9) for (let x = 4; x < 28; x += 6) { r(x, y, 4, 6, K.sea[2]); r(x, y, 4, 1, K.bone[2]); r(x + 1, y + 3, 2, 3, K.olive[2]); } },
  compost: (r) => { r(2, 18, 28, 20, K.wood[1]); r(2, 18, 28, 2, K.wood[2]); r(5, 12, 22, 8, K.wood[0]); r(8, 13, 3, 2, K.olive[2]); r(18, 15, 4, 2, K.olive[1]); },
  smelter: (r) => { r(5, 10, 22, 26, K.rust[1]); r(5, 10, 6, 26, K.rust[2]); r(9, 22, 14, 8, K.ink[0]); r(10, 24, 12, 5, K.heat[2]); r(12, 25, 8, 3, K.heat[3]); r(12, 2, 8, 9, K.ink[2]); r(11, 1, 10, 2, K.ink[3]); },
  lathe: (r) => { r(2, 20, 28, 12, K.ink[2]); r(2, 20, 28, 2, K.ink[3]); r(4, 14, 8, 8, K.ink[1]); r(12, 16, 14, 3, K.bone[1]); r(24, 13, 5, 8, K.ink[1]); r(4, 32, 4, 6, K.ink[1]); r(24, 32, 4, 6, K.ink[1]); },
  press: (r) => { r(8, 6, 16, 30, K.ink[2]); r(8, 6, 16, 2, K.ink[3]); r(12, 10, 8, 10, K.ink[1]); r(14, 20, 4, 8, K.bone[1]); r(4, 30, 24, 6, K.wood[1]); r(6, 28, 3, 3, K.gold[2]); r(22, 28, 3, 3, K.gold[2]); },
  bench: (r) => { r(1, 18, 30, 8, K.wood[2]); r(1, 18, 30, 2, K.wood[3]); r(3, 26, 3, 12, K.wood[1]); r(26, 26, 3, 12, K.wood[1]); r(6, 13, 14, 5, K.ink[2]); r(6, 13, 14, 1, K.ink[3]); r(22, 14, 6, 4, K.rust[2]); r(4, 30, 24, 2, K.wood[0]); },
  lab: (r) => { r(2, 16, 28, 10, K.bone[1]); r(2, 16, 28, 2, K.bone[3]); r(4, 26, 3, 12, K.ink[2]); r(25, 26, 3, 12, K.ink[2]); r(6, 8, 5, 9, K.sea[2]); r(14, 6, 4, 11, K.green[2]); r(21, 10, 6, 7, K.olive[2]); r(15, 3, 2, 3, K.green[3]); },
  safe: (r) => { r(5, 8, 22, 28, K.ink[2]); r(5, 8, 22, 2, K.ink[3]); r(8, 12, 16, 20, K.ink[1]); r(14, 18, 6, 6, K.gold[2]); r(16, 20, 2, 2, K.ink[0]); },
  bunks: (r) => { r(2, 6, 28, 32, K.wood[1]); r(4, 8, 24, 11, K.rust[2]); r(4, 8, 7, 4, K.bone[2]); r(4, 24, 24, 11, K.teal[2]); r(4, 24, 7, 4, K.bone[2]); },
  training: (r) => { r(2, 30, 28, 6, K.sand[1]); r(12, 8, 3, 24, K.wood[1]); r(8, 6, 12, 10, K.sand[2]); r(10, 4, 8, 4, K.sand[3]); r(11, 9, 5, 3, K.heat[2]); r(22, 20, 7, 12, K.ink[2]); r(23, 18, 5, 3, K.ink[3]); },
  turret: (r) => { r(6, 26, 20, 10, K.ink[2]); r(6, 26, 20, 2, K.ink[3]); r(10, 14, 12, 12, K.olive[1]); r(10, 14, 12, 2, K.olive[3]); r(20, 18, 11, 3, K.ink[1]); r(13, 18, 6, 4, K.ink[0]); },
  watchpost: (r) => { r(4, 30, 4, 8, K.wood[1]); r(24, 30, 4, 8, K.wood[1]); r(2, 22, 28, 9, K.sand[1]); r(2, 22, 28, 2, K.sand[3]); r(14, 6, 2, 16, K.wood[1]); r(16, 6, 10, 7, K.amber[2]); },
  traps: (r) => { r(2, 14, 28, 22, K.wood[0]); for (let i = 0; i < 9; i++) { r(4 + (i * 7) % 24, 16 + (i * 5) % 18, 3, 1, K.ink[3]); r(5 + (i * 7) % 24, 15 + (i * 5) % 18, 1, 3, K.ink[3]); } r(2, 24, 28, 1, K.bone[0]); },
  still: (r) => { r(4, 14, 14, 22, K.rust[2]); r(4, 14, 14, 3, K.rust[3]); r(8, 6, 6, 9, K.rust[1]); r(14, 8, 12, 2, K.rust[1]); r(22, 18, 7, 16, K.wood[1]); r(5, 30, 12, 6, K.heat[1]); },
};

export function facilitySprite(fac) {
  if (cache.has(fac)) return cache.get(fac);
  const s = mk(DRAW[fac] || DRAW.bench);
  cache.set(fac, s);
  return s;
}

// Plant overlay by stage (0 seed .. 4 harvest, 5 dead).
export function plantSprite(strainTint, stage, blight) {
  const key = `plant:${strainTint}:${stage}:${blight ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const t = K[strainTint] || K.olive;
  const c = createCanvas(30, 32);
  const g = ctx2d(c);
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const leaf = blight ? K.bone[0] : K.olive[2], leaf2 = blight ? K.ink[3] : K.olive[3];
  for (const [px, py] of [[7, 22], [21, 22], [7, 9], [21, 9]]) {
    if (stage === 5) { r(px - 3, py + 4, 6, 2, K.wood[1]); r(px - 1, py, 1, 5, K.wood[2]); continue; }
    if (stage === 0) { r(px, py + 4, 2, 2, K.wood[2]); continue; }
    const h = [0, 4, 8, 11, 12][stage];
    r(px, py + 6 - h, 1, h, K.olive[1]);
    r(px - 2, py + 5 - h / 2, 2, 2, leaf); r(px + 1, py + 4 - h / 2, 2, 2, leaf2);
    if (stage >= 2) { r(px - 3, py + 2 - h / 3, 3, 2, leaf); r(px + 1, py + 1 - h / 3, 3, 2, leaf); }
    if (stage >= 3) { r(px - 1, py - h + 5, 3, 3, t[2]); r(px, py - h + 5, 1, 1, t[3]); }
    if (stage >= 4) { r(px - 2, py - h + 4, 5, 4, t[3]); r(px - 1, py - h + 3, 3, 1, t[2]); }
  }
  const out = outlineSprite(c, K.ink[0]);
  cache.set(key, out);
  return out;
}

export function strainTint(S, id) { return STRAINS[id] ? STRAINS[id].tint : (S.strains.hybrids[id] || {}).tint || 'green'; }
