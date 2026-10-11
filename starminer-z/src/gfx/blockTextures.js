// The block textures, painted in code at startup: 64 x 64 texels each, tileable, in the
// fairly realistic style of the original (cracked rock, grassy tops, grained planks) rather
// than flat pixel art. They go into one texture array so a whole chunk draws in one call.

import * as THREE from 'three';
import { TEXTURES } from '../world/blocks.js';
import { mulberry32 } from '../core/noise.js';

export const TEX_SIZE = 64;
const N = TEX_SIZE;

// ---- tileable noise --------------------------------------------------------------------------

function hashi(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// gradient noise with a lattice of P cells across the texture, wrapping at the edges
function pnoise(u, v, P, s) {
  const x = u * P, y = v * P;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const g = (ix, iy, dx, dy) => {
    const a = hashi(((ix % P) + P) % P, ((iy % P) + P) % P, s) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = g(xi, yi, xf, yf), n10 = g(xi + 1, yi, xf - 1, yf);
  const n01 = g(xi, yi + 1, xf, yf - 1), n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
  const fx = fade(xf), fy = fade(yf);
  return 1.41 * ((n00 + (n10 - n00) * fx) + ((n01 + (n11 - n01) * fx) - (n00 + (n10 - n00) * fx)) * fy);
}
function fbm(u, v, P, oct, s, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * pnoise(u, v, P << o, s + o * 17);
    norm += amp;
    amp *= gain;
  }
  return sum / norm;
}
// cellular noise on a P x P grid that wraps: distance to the nearest and second nearest point
function worley(u, v, P, s) {
  const x = u * P, y = v * P;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P;
    const px = cx + hashi(wx, wy, s), py = cy + hashi(wx, wy, s + 1);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = hashi(wx, wy, s + 2); } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---- painters: (u, v, rand) -> [r, g, b, a] in 0..255, v = 0 at the top -----------------------

function dirtColor(u, v, s = 11) {
  const n = fbm(u, v, 4, 4, s);
  const fine = pnoise(u, v, 32, s + 3);
  let c = mixc(hex(0x5e4128), hex(0x7d5838), clamp(0.5 + n * 0.8));
  c = mulc(c, 0.9 + fine * 0.12);
  // pebbles
  const w = worley(u, v, 9, s + 5);
  if (w.f1 < 0.18 + w.id * 0.1) {
    const p = w.id > 0.5 ? hex(0x8a7058) : hex(0x4a3420);
    c = mixc(c, p, 0.75 * smooth(0.28, 0.12, w.f1));
  }
  // dark specks
  if (hashi(Math.floor(u * N), Math.floor(v * N), s + 9) < 0.05) c = mulc(c, 0.7);
  return c;
}

function grassColor(u, v, s = 21) {
  const n = fbm(u, v, 4, 4, s);
  let c = mixc(hex(0x5c7a22), hex(0x8aa83a), clamp(0.5 + n * 0.9));
  // blades: short streaks of lighter and darker green
  const x = Math.floor(u * N), y = Math.floor(v * N);
  const b = hashi(x, y, s + 1);
  const streak = pnoise(u * 1.0, v * 0.35, 24, s + 2);
  c = mulc(c, 0.9 + streak * 0.18);
  if (b < 0.12) c = mixc(c, hex(0xaec65a), 0.45);
  else if (b > 0.9) c = mixc(c, hex(0x3a5214), 0.5);
  // a little yellow, like sunburnt tips
  const y2 = pnoise(u, v, 8, s + 4);
  if (y2 > 0.45) c = mixc(c, hex(0xa6b048), (y2 - 0.45) * 1.4);
  return c;
}

function rockColor(u, v, s = 31, base = 0x7a766e, dark = 0x55524b) {
  const n = fbm(u, v, 4, 5, s);
  let c = mixc(hex(dark), hex(base), clamp(0.55 + n * 0.9));
  // the cracks the original's rock is known for: edges of a cellular pattern
  const w = worley(u + 0.06 * pnoise(u, v, 8, s + 1), v + 0.06 * pnoise(u, v, 8, s + 2), 5, s + 3);
  const edge = w.f2 - w.f1;
  const crack = smooth(0.09, 0.0, edge);
  c = mixc(c, hex(0x2c2a26), crack * 0.8);
  // the lit lip of each crack
  c = mixc(c, hex(0x9a968c), smooth(0.16, 0.09, edge) * (1 - crack) * 0.35);
  // per-cell tint
  c = mulc(c, 0.92 + w.id * 0.14);
  const fine = pnoise(u, v, 32, s + 4);
  return mulc(c, 0.93 + fine * 0.1);
}

function sandColor(u, v, s = 41) {
  const n = fbm(u, v, 4, 3, s);
  let c = mixc(hex(0xcbb07a), hex(0xe2cc96), clamp(0.5 + n * 0.8));
  const grain = hashi(Math.floor(u * N), Math.floor(v * N), s + 1);
  c = mulc(c, 0.92 + grain * 0.12);
  const ripple = Math.sin((v + 0.08 * pnoise(u, v, 4, s + 2)) * Math.PI * 2 * 6);
  return mulc(c, 0.97 + ripple * 0.03);
}

function snowColor(u, v, s = 51) {
  const n = fbm(u, v, 4, 4, s);
  let c = mixc(hex(0xc9d6e4), hex(0xf4f7fb), clamp(0.6 + n * 0.8));
  if (hashi(Math.floor(u * N), Math.floor(v * N), s + 1) < 0.02) c = [255, 255, 255];
  return c;
}

const painters = {
  grass_top: (u, v) => grassColor(u, v),
  grass_side: (u, v) => {
    const fringe = 0.18 + 0.07 * pnoise(u, 0.5, 8, 61) + 0.08 * Math.max(0, pnoise(u, 0.2, 16, 62));
    if (v < fringe) {
      const c = grassColor(u, v, 23);
      return mulc(c, 0.92 - (v / fringe) * 0.12);
    }
    const d = dirtColor(u, v, 13);
    // shadow under the grass lip
    return mulc(d, 0.75 + 0.25 * smooth(fringe, fringe + 0.12, v));
  },
  dirt: (u, v) => dirtColor(u, v),
  sand: (u, v) => sandColor(u, v),
  rock: (u, v) => rockColor(u, v),
  snow: (u, v) => snowColor(u, v),
  snow_side: (u, v) => {
    const cap = 0.22 + 0.06 * pnoise(u, 0.5, 8, 71) + 0.06 * Math.max(0, pnoise(u, 0.3, 16, 72));
    if (v < cap) return snowColor(u, v, 53);
    return mulc(dirtColor(u, v, 14), 0.8 + 0.2 * smooth(cap, cap + 0.15, v));
  },
  ice: (u, v) => {
    const n = fbm(u, v, 3, 4, 81);
    let c = mixc(hex(0x8cbfe0), hex(0xc4e2f4), clamp(0.5 + n));
    const streak = pnoise(u * 0.4 + v * 0.6, v * 0.2, 12, 82);
    c = mixc(c, [235, 248, 255], smooth(0.35, 0.7, streak) * 0.6);
    const w = worley(u, v, 3, 83);
    c = mixc(c, [240, 250, 255], smooth(0.05, 0.0, w.f2 - w.f1) * 0.7);
    return c;
  },
  log_side: (u, v) => {
    // bark: vertical furrows
    const f = pnoise(u, v * 0.25, 16, 91) * 0.6 + pnoise(u, v * 0.5, 32, 92) * 0.4;
    let c = mixc(hex(0x4a3420), hex(0x7e6040), clamp(0.5 + f * 0.9));
    const groove = smooth(-0.25, -0.55, f);
    c = mixc(c, hex(0x22160c), groove * 0.8);
    const moss = fbm(u, v, 4, 3, 93);
    if (moss > 0.35) c = mixc(c, hex(0x4a5a26), (moss - 0.35) * 0.9);
    return c;
  },
  log_top: (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    if (r > 0.86 + 0.04 * pnoise(u, v, 8, 95)) return mulc(painters.log_side(u, v), 0.9);
    const rings = Math.sin((r + 0.03 * pnoise(u, v, 8, 96)) * Math.PI * 11);
    let c = mixc(hex(0xb08a58), hex(0xd2ae78), clamp(0.5 + rings * 0.35));
    c = mixc(c, hex(0x8a6438), smooth(0.5, 0.86, r) * 0.3);
    const crack = Math.abs(Math.atan2(dy, dx) - 0.7) < 0.03 && r > 0.2 ? 0.5 : 0;
    return mulc(c, 1 - crack * 0.5);
  },
  leaves: (u, v) => {
    // clusters of leaves; gaps show through as holes
    const w = worley(u, v, 7, 101);
    const w2 = worley(u + 0.5, v + 0.3, 11, 102);
    const n = fbm(u, v, 4, 3, 103);
    let c = mixc(hex(0x34521a), hex(0x6e8c30), clamp(0.5 + n * 0.9));
    c = mulc(c, 0.8 + w.id * 0.35);
    // leaf veins / edges
    c = mixc(c, hex(0x1c3a0c), smooth(0.08, 0.0, w2.f2 - w2.f1) * 0.6);
    const hole = w.f1 > 0.62 + 0.2 * w2.id && hashi(Math.floor(u * N), Math.floor(v * N), 104) < 0.85;
    return [...c, hole ? 0 : 255];
  },
  wood: (u, v) => {
    const plank = Math.floor(v * 4);
    const pv = v * 4 - plank;
    const off = hashi(plank, 0, 111);
    const grain = pnoise(u * 0.25 + off, pv * 2.0, 16, 112) * 0.7 + pnoise(u, v, 32, 113) * 0.3;
    let c = mixc(hex(0x8e6438), hex(0xb48a54), clamp(0.5 + grain * 0.8));
    c = mulc(c, 0.9 + off * 0.18);
    // gaps between planks and the butt joints
    const gap = smooth(0.06, 0.0, pv) + smooth(0.94, 1.0, pv);
    const joint = Math.abs(((u + off) % 1) - 0.5) < 0.012 ? 1 : 0;
    c = mixc(c, hex(0x3a2614), clamp(gap + joint) * 0.85);
    // nails
    const nx = ((u + off) % 1);
    if (Math.abs(pv - 0.5) < 0.08 && (Math.abs(nx - 0.44) < 0.02 || Math.abs(nx - 0.56) < 0.02)) c = hex(0x2a2a2a);
    return c;
  },
  bedrock: (u, v) => {
    const n = fbm(u, v, 4, 5, 121);
    const w = worley(u, v, 6, 122);
    let c = mixc(hex(0x1e1e1e), hex(0x5a5a58), clamp(0.5 + n * 1.2));
    c = mixc(c, hex(0x0e0e0e), smooth(0.12, 0.02, w.f2 - w.f1));
    return c;
  },
  lava: (u, v) => {
    const w = worley(u + 0.08 * pnoise(u, v, 4, 131), v + 0.08 * pnoise(u, v, 4, 132), 4, 133);
    const n = fbm(u, v, 4, 4, 134);
    const crust = smooth(0.25, 0.05, w.f2 - w.f1);
    let c = mixc(hex(0xffd040), hex(0xff6a00), clamp(0.5 + n));
    c = mixc(c, hex(0x5a1200), crust * 0.85);
    return c;
  },
  bloodstone: (u, v) => {
    const c = rockColor(u, v, 141, 0x9a1a14, 0x5a0a08);
    const n = fbm(u, v, 4, 3, 142);
    return mixc(c, hex(0xd03018), smooth(0.4, 0.7, n) * 0.4);
  },
  lantern: (u, v) => {
    // an iron frame holding four glowing panes
    const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
    const frame = fx < 0.1 || fy < 0.1;
    const bar = Math.abs(u - 0.5) < 0.045 || Math.abs(v - 0.5) < 0.045;
    if (frame || bar) {
      const n = fbm(u, v, 4, 2, 151);
      const rivet = (fx < 0.1 && fy < 0.1) ? 1.25 : 1;
      return mulc(mixc(hex(0x2e2a24), hex(0x4e463a), clamp(0.5 + n)), rivet);
    }
    // glass glowing from the flame inside: brightest in the middle
    const pu = (u % 0.5) * 2, pv = (v % 0.5) * 2;
    const g = 1 - 0.5 * Math.hypot(pu - 0.5, pv - 0.6);
    const n = pnoise(u, v, 16, 152);
    return mixc(hex(0xd88a20), hex(0xfff0a0), clamp(g * 0.9 + n * 0.1));
  },
  lantern_top: (u, v) => {
    const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
    if (fx < 0.12 || fy < 0.12) return mulc(hex(0x3a342c), 0.9 + 0.2 * pnoise(u, v, 8, 155));
    const grate = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
    return grate ? hex(0x2a2620) : hex(0xffd878);
  },
  torch: (u, v) => {
    // transparent except the stick (columns 7-8 of 16) and its burning tip
    const x = Math.floor(u * 16), y = Math.floor(v * 16);
    if (x < 7 || x > 8) return [0, 0, 0, 0];
    if (y < 6) return [0, 0, 0, 0];
    if (y < 8) return [255, 200, 90, 255];
    const n = pnoise(u, v, 16, 161);
    return [...mixc(hex(0x5a3a1c), hex(0x7e5630), clamp(0.5 + n)), 255];
  },
  tower_stone: (u, v) => {
    // dark stone bricks, staggered
    const row = Math.floor(v * 4);
    const rv = v * 4 - row;
    const shift = (row % 2) * 0.25;
    const bu = (u + shift) * 2;
    const col = Math.floor(bu);
    const ru = bu - col;
    const id = hashi(col & 1, row, 171);
    let c = rockColor(u, v, 172, 0x6a665e, 0x3e3c38);
    c = mulc(c, 0.85 + id * 0.25);
    const mortar = smooth(0.06, 0.0, Math.min(rv, 1 - rv)) + smooth(0.035, 0.0, Math.min(ru, 1 - ru));
    return mixc(c, hex(0x24221e), clamp(mortar) * 0.9);
  },
  tower_top: (u, v) => {
    const c = rockColor(u, v, 175, 0x6e6a62, 0x44423c);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    return mixc(c, hex(0x2a2824), smooth(0.04, 0.0, edge));
  },
  crate_side: (u, v) => {
    const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
    const frame = fx < 0.12 || fy < 0.12;
    const brace = Math.abs(u - v) < 0.07 || Math.abs(u - (1 - v)) < 0.07;
    const grain = pnoise(u * 0.3, v, 16, 181);
    let c = mixc(hex(0x7a5430), hex(0xa07444), clamp(0.5 + grain));
    if (frame) c = mulc(c, 0.78);
    else if (brace) c = mulc(c, 0.9);
    else c = mulc(c, 1.05 - 0.15 * (Math.floor(v * 4) % 2));
    const edge = Math.abs(fx - 0.12) < 0.02 || Math.abs(fy - 0.12) < 0.02;
    if (edge && !(fx < 0.1 && fy < 0.1)) c = mulc(c, 0.55);
    if (fx < 0.08 && fy < 0.08) c = hex(0x3a3a3a);
    return c;
  },
  crate_top: (u, v) => {
    const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
    const grain = pnoise(u * 0.3, v, 16, 185);
    let c = mixc(hex(0x7a5430), hex(0xa07444), clamp(0.5 + grain));
    if (fx < 0.12 || fy < 0.12) c = mulc(c, 0.78);
    if (Math.abs(((v * 3) % 1) - 0.5) > 0.47) c = mulc(c, 0.6);
    return c;
  },
  glass: (u, v) => {
    const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
    if (fx < 0.06 || fy < 0.06) return [210, 228, 236, 255];
    const streak = Math.abs((u + v) - 0.6) < 0.03 || Math.abs((u + v) - 0.75) < 0.015;
    return streak ? [240, 250, 255, 200] : [0, 0, 0, 0];
  },
  // the original's explosives: a bundle of sticks with a paper band round it, red for TNT and
  // green for C4, and the sticks' ends on top
  tnt_side: (u, v) => sticksSide(u, v, 0xb3261c, 0x6a1208, 'TNT', 301),
  tnt_top: (u, v) => sticksTop(u, v, 0xc23a24, 0x5a1006, 0xe8b070, 303),
  c4_side: (u, v) => sticksSide(u, v, 0x2c7a30, 0x0e3a12, 'C4', 305),
  c4_top: (u, v) => sticksTop(u, v, 0x3a8a3a, 0x0e3010, 0xc8a070, 307),
  // Space Goo: a glowing green, darker where it's thick
  slime: (u, v) => {
    const n = fbm(u, v, 4, 4, 311), w = worley(u, v, 4, 313);
    let c = mixc(hex(0x1e8a2a), hex(0x8cff7a), clamp(0.55 + n * 0.8));
    c = mixc(c, hex(0x0a4a14), smooth(0.25, 0.0, w.f1) * 0.5);
    // bubbles catching the light
    if (w.f1 < 0.06 && w.id > 0.5) c = mixc(c, hex(0xe8ffd8), 0.7);
    return c;
  },
  // the rock that fell from space: near black, with a glassy blue fleck
  space_rock: (u, v) => {
    let c = rockColor(u, v, 321, 0x4a4a52, 0x24242a);
    const w = worley(u, v, 7, 323);
    if (w.f1 < 0.09 * (0.5 + w.id)) c = mixc(c, hex(0x6a8aa8), 0.6 * smooth(0.09, 0.0, w.f1));
    if (hashi(Math.floor(u * N), Math.floor(v * N), 325) < 0.02) c = mixc(c, hex(0xa8c8e8), 0.6);
    return c;
  },
  // a plank door in its frame: the lower half with the handle, the upper with a brace
  door_lower: (u, v) => doorPanel(u, v, false),
  door_upper: (u, v) => doorPanel(u, v, true),
};

// a 3 x 5 block letter (rows top to bottom), for the explosives' bands
const GLYPHS = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '111', '101'], C: ['111', '100', '100', '100', '111'], 4: ['101', '101', '111', '001', '001'] };
function glyphAt(text, u, v, u0, v0, cell) {
  const w = text.length * 4 - 1;
  const gx = Math.floor((u - u0) / cell), gy = Math.floor((v - v0) / cell);
  if (gx < 0 || gy < 0 || gx >= w || gy >= 5) return false;
  const ch = text[Math.floor(gx / 4)], col = gx % 4;
  return col < 3 && GLYPHS[ch][gy][col] === '1';
}

function sticksSide(u, v, base, dark, label, seed) {
  // six sticks across, each shaded round
  const k = (u * 6) % 1;
  const round = Math.sin(k * Math.PI);
  let c = mixc(hex(dark), hex(base), 0.35 + 0.65 * round);
  c = mulc(c, 0.92 + 0.12 * pnoise(u, v, 16, seed));
  // the paper band, with the name on it
  if (v > 0.36 && v < 0.64) {
    c = mixc(hex(0xb8b4a8), hex(0xf0ece0), 0.4 + 0.6 * round * 0.5 + 0.3);
    const cell = 0.045, w = (label.length * 4 - 1) * cell;
    if (glyphAt(label, u, v, 0.5 - w / 2, 0.5 - 2.5 * cell, cell)) c = hex(0x1c1a18);
  }
  return c;
}

function sticksTop(u, v, base, dark, fuse, seed) {
  // the sticks' ends, six by six, and a fuse in the middle
  const cu = (u * 6) % 1 - 0.5, cv = (v * 6) % 1 - 0.5;
  const r = Math.hypot(cu, cv);
  if (r > 0.46) return mulc(hex(dark), 0.6);
  let c = mixc(hex(base), hex(dark), smooth(0.25, 0.46, r));
  c = mixc(c, hex(fuse), smooth(0.14, 0.05, r));
  return mulc(c, 0.92 + 0.12 * pnoise(u, v, 16, seed));
}

function doorPanel(u, v, upper) {
  const fx = Math.min(u, 1 - u);
  const grain = pnoise(u * 4, v * 0.4, 16, upper ? 333 : 331);
  // four planks
  const plank = Math.floor(u * 4), pu = (u * 4) % 1;
  let c = mixc(hex(0x6e4826), hex(0x9a6c3c), clamp(0.5 + grain + 0.06 * (plank % 2)));
  if (pu < 0.06) c = mulc(c, 0.6);
  // the frame
  if (fx < 0.08) c = mulc(hex(0x5a3a1e), 0.9 + 0.2 * grain);
  if (upper) {
    if (v < 0.08) c = mulc(hex(0x5a3a1e), 0.9 + 0.2 * grain);
    // a brace across
    if (Math.abs(v - 0.55) < 0.07 && fx >= 0.08) c = mulc(hex(0x7a5230), 0.85 + 0.2 * grain);
  } else {
    if (v > 0.92) c = mulc(hex(0x5a3a1e), 0.9 + 0.2 * grain);
    if (Math.abs(v - 0.3) < 0.07 && fx >= 0.08) c = mulc(hex(0x7a5230), 0.85 + 0.2 * grain);
    // the handle
    if (Math.hypot(u - 0.8, v - 0.12) < 0.05) c = hex(0x2a2a2c);
  }
  return c;
}

function orePainter(seed, colors, opts = {}) {
  return (u, v) => {
    let c = rockColor(u, v, 31);
    const w = worley(u, v, opts.cells ?? 5, seed);
    const r = opts.size ?? 0.3;
    if (w.f1 < r * (0.6 + w.id * 0.6)) {
      const k = w.f1 / (r * (0.6 + w.id * 0.6));
      const n = pnoise(u, v, 16, seed + 1);
      let oc = mixc(hex(colors[0]), hex(colors[1]), clamp(0.5 + n * 0.8 - k * 0.5));
      // a highlight on the upper left of each lump
      const hl = smooth(0.6, 0.0, Math.hypot(u * opts.cells - Math.floor(u * opts.cells) - 0.35, v * opts.cells - Math.floor(v * opts.cells) - 0.35));
      if (colors[2]) oc = mixc(oc, hex(colors[2]), hl * 0.5);
      c = mixc(c, oc, smooth(1.0, 0.75, k));
      // a dark rim where the ore meets the rock
      c = mixc(c, hex(0x1e1c18), smooth(0.75, 1.0, k) * 0.5);
    }
    if (opts.sparkle && hashi(Math.floor(u * N), Math.floor(v * N), seed + 3) < 0.03 && w.f1 < r) c = [255, 255, 255];
    return c;
  };
}
painters.coal_ore = orePainter(201, [0x141414, 0x2e2e2e, 0x5a5a5a], { cells: 6, size: 0.32 });
painters.copper_ore = orePainter(211, [0x2f7a52, 0x5cb07a, 0xb07040], { cells: 6, size: 0.28 });
painters.iron_ore = orePainter(221, [0x8a4a26, 0xc48a5a, 0xe0b090], { cells: 6, size: 0.27 });
painters.gold_ore = orePainter(231, [0xc08a10, 0xffe060, 0xfff6c0], { cells: 7, size: 0.25, sparkle: true });
painters.diamond_ore = orePainter(241, [0x6ad6e6, 0xd8fbff, 0xffffff], { cells: 7, size: 0.22, sparkle: true });

function metalPainter(base, light, dark, seed) {
  return (u, v) => {
    const n = fbm(u, v, 4, 3, seed);
    let c = mixc(hex(base), hex(light), clamp(0.5 + n * 0.6));
    // brushed streaks
    c = mulc(c, 0.95 + 0.06 * pnoise(u * 0.1, v, 32, seed + 1));
    const edge = Math.min(u, 1 - u, v, 1 - v);
    // bevel: lit top-left, shaded bottom-right
    if (edge < 0.08) c = (u < v ? mulc(c, 0.7) : mixc(c, [255, 255, 255], 0.25));
    if (edge < 0.025) c = hex(dark);
    // rivets
    const rx = u < 0.5 ? u - 0.16 : u - 0.84, ry = v < 0.5 ? v - 0.16 : v - 0.84;
    const rr = Math.hypot(rx, ry);
    if (rr < 0.05) c = mixc(hex(light), hex(dark), smooth(0.0, 0.05, rr + rx * 0.4));
    // scratches
    const s = pnoise(u * 3, v * 0.2, 16, seed + 2);
    if (Math.abs(s) < 0.02) c = mixc(c, hex(light), 0.4);
    return c;
  };
}
painters.copper_wall = metalPainter(0xa45e2c, 0xe09a5a, 0x4a2610, 251);
painters.iron_wall = metalPainter(0x6e7276, 0xb4b8bc, 0x2a2c2e, 261);
painters.gold_wall = metalPainter(0xc8961e, 0xffe27a, 0x6a4a08, 271);
painters.diamond_wall = metalPainter(0x8ad6e2, 0xf0ffff, 0x3a7a86, 281);

// ---- the texture array ---------------------------------------------------------------------

export function paintTexture(name) {
  const p = painters[name];
  if (!p) throw new Error(`no painter for ${name}`);
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = p((x + 0.5) / N, (y + 0.5) / N);
    const o = (y * N + x) * 4;
    out[o] = clamp(c[0], 0, 255); out[o + 1] = clamp(c[1], 0, 255); out[o + 2] = clamp(c[2], 0, 255);
    out[o + 3] = c.length > 3 ? c[3] : 255;
  }
  return out;
}

let arrayTex = null;
export function blockTextureArray(renderer) {
  if (arrayTex) return arrayTex;
  const L = TEXTURES.length;
  const data = new Uint8Array(N * N * 4 * L);
  for (let i = 0; i < L; i++) {
    const t = paintTexture(TEXTURES[i]);
    // opaque blocks keep their glow mask in alpha (lanterns' panes); cut-out blocks keep coverage
    const name = TEXTURES[i];
    if (name === 'lantern' || name === 'lantern_top') {
      for (let k = 0; k < N * N; k++) t[k * 4 + 3] = (t[k * 4] + t[k * 4 + 1] + t[k * 4 + 2]) / 3 > 150 ? 255 : 0;
    }
    data.set(t, i * N * N * 4);
  }
  const tex = new THREE.DataArrayTexture(data, N, N, L);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  arrayTex = tex;
  return tex;
}

// A canvas of one texture (for item icons and particles).
export function textureCanvas(name, size = N) {
  const data = paintTexture(name);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  img.data.set(data);
  g.putImageData(img, 0, 0);
  if (size === N) return c;
  const c2 = document.createElement('canvas');
  c2.width = c2.height = size;
  const g2 = c2.getContext('2d');
  g2.imageSmoothingEnabled = size < N;
  g2.drawImage(c, 0, 0, size, size);
  return c2;
}

export { mulberry32 };
