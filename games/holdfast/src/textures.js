// Procedural, tileable canvas textures. Every texture is generated at load time,
// so the game ships with no image assets. Albedo textures for paintable surfaces
// are near-white so that per-vertex paint colors multiply cleanly.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

const cache = new Map();
let SIZE_SCALE = 1; // 0.5 on low-end devices

export function setTextureQuality(scale) { SIZE_SCALE = scale; }

// ---- periodic value noise (seamless) ----
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % period) + period) % period;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm over [0,1)^2 tile coordinates; base = lattice cells across tile
export function tfbm(u, v, base, oct, seed) {
  let s = 0, a = 1, n = 0, p = base;
  for (let i = 0; i < oct; i++) {
    s += a * pnoise(u * p, v * p, p, seed + i * 31);
    n += a; a *= 0.5; p *= 2;
  }
  return s / n;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function heightToNormal(height, w, h, strength) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = height[y * w + ((x - 1 + w) % w)], xr = height[y * w + ((x + 1) % w)];
      const yu = height[((y - 1 + h) % h) * w + x], yd = height[((y + 1) % h) * w + x];
      let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Alpha-cutout texture without dark fringes: transparent texels get the
// average opaque colour so mipmaps don't bleed black into the edges.
function alphaTexture(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 200) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  if (n) { r /= n; g /= n; b /= n; }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y; // flip so v=1 is the top of the image
    for (let x = 0; x < w; x++) {
      const si = (sy * w + x) * 4, di = (y * w + x) * 4;
      const a = d[si + 3];
      const k = a / 255;
      out[di] = d[si] * k + r * (1 - k);
      out[di + 1] = d[si + 1] * k + g * (1 - k);
      out[di + 2] = d[si + 2] * k + b * (1 - k);
      out[di + 3] = a;
    }
  }
  const t = new THREE.DataTexture(out, w, h);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function finishTex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Generic per-pixel painter. fn(u,v,x,y) -> [r,g,b,height]
function pixelTex(name, w, h, fn, normalStrength = 0, opts = {}) {
  w = Math.max(32, Math.round(w * SIZE_SCALE));
  h = Math.max(32, Math.round(h * SIZE_SCALE));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = fn(x / w, y / h, x, y, w, h);
      const i = (y * w + x) * 4;
      d[i] = clamp(r[0], 0, 255);
      d[i + 1] = clamp(r[1], 0, 255);
      d[i + 2] = clamp(r[2], 0, 255);
      d[i + 3] = r[4] === undefined ? 255 : clamp(r[4], 0, 255);
      height[y * w + x] = r[3] || 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { map: finishTex(c, true), canvas: c };
  if (normalStrength > 0) out.normalMap = finishTex(heightToNormal(height, w, h, normalStrength * (w / 512)), false);
  if (opts.keepHeight) out.height = height;
  return out;
}

// ------------------------------------------------------------------
// Texture definitions. `tile` = metres covered by one repeat.
// ------------------------------------------------------------------
const DEFS = {
  // ---------- walls ----------
  siding: {
    tile: [1.2, 1.2], gen: () => pixelTex('siding', 256, 512, (u, v) => {
      const boards = 8; // 0.15 m exposure
      const bv = v * boards, f = bv - Math.floor(bv), b = Math.floor(bv);
      const grain = tfbm(u * 1, v * 8, 4, 3, 11 + b) * 0.06;
      // lap shadow at the bottom of each board (f ~ 1)
      let shade = 0.93 + grain - 0.02 * f;
      if (f > 0.9) shade -= (f - 0.9) * 2.6;
      if (f < 0.05) shade += 0.03;
      const s = shade * 255;
      return [s, s, s * 0.985, f * 0.6 + (f > 0.92 ? -0.5 : 0)];
    }, 3),
  },
  brick: {
    tile: [1.2, 1.2], gen: () => pixelTex('brick', 512, 512, (u, v, x, y) => {
      const rows = 16, perRow = 6;
      const r = Math.floor(v * rows), fv = v * rows - r;
      const off = (r % 2) * 0.5;
      const bu = u * perRow + off, bi = Math.floor(bu), fu = bu - bi;
      const mortarU = 0.035, mortarV = 0.12;
      const isMortar = fu < mortarU || fv < mortarV;
      const id = ((bi % perRow) + perRow) % perRow + r * 13;
      const hv = hash2(id, r, 7);
      const n = tfbm(u, v, 32, 3, 5);
      if (isMortar) {
        const m = 150 + n * 40;
        return [m, m * 0.97, m * 0.92, 0];
      }
      const base = [150 + hv * 50, 58 + hv * 22, 40 + hv * 14];
      const dark = hash2(id, 3, 9) < 0.12 ? 0.75 : 1;
      const k = (0.82 + n * 0.3) * dark;
      return [base[0] * k, base[1] * k, base[2] * k, 1 + n * 0.3];
    }, 4),
  },
  paintedBrick: {
    tile: [1.2, 1.2], gen: () => pixelTex('pbrick', 512, 512, (u, v) => {
      const rows = 16, perRow = 6;
      const r = Math.floor(v * rows), fv = v * rows - r;
      const bu = u * perRow + (r % 2) * 0.5, fu = bu - Math.floor(bu);
      const isMortar = fu < 0.035 || fv < 0.12;
      const n = tfbm(u, v, 32, 3, 15);
      const s = isMortar ? 200 + n * 20 : 232 + n * 18;
      return [s, s, s, isMortar ? 0 : 1];
    }, 3),
  },
  boardBatten: {
    tile: [1.2, 1.2], gen: () => pixelTex('bb', 256, 512, (u, v) => {
      const boards = 5;
      const bu = u * boards, b = Math.floor(bu), f = bu - b;
      const grain = tfbm(u * 4, v * 0.5, 8, 4, 21 + b) * 0.16;
      const weather = tfbm(u, v, 6, 3, 99) * 0.1;
      let s = 0.82 + grain + weather - 0.05 * hash2(b, 1, 4);
      let h = 0.5;
      if (f < 0.12 || f > 0.88) { s += 0.04; h = 1; } // battens
      if (Math.abs(f - 0.12) < 0.012 || Math.abs(f - 0.88) < 0.012) { s -= 0.25; h = 0; }
      s *= 255;
      return [s, s * 0.97, s * 0.95, h];
    }, 3),
  },
  planks: {
    tile: [1.6, 1.6], gen: () => pixelTex('planks', 512, 512, (u, v) => {
      const rows = 7;
      const r = Math.floor(v * rows), f = v * rows - r;
      const grain = tfbm(u * 0.5, v * 6, 6, 4, 41 + r) * 0.35;
      const tone = 0.75 + hash2(r, 2, 6) * 0.3;
      let s = (0.55 + grain) * tone;
      if (f < 0.04 || f > 0.97) s *= 0.4;
      const knot = tfbm(u, v, 12, 2, 77);
      if (knot > 0.78) s *= 0.75;
      return [s * 165, s * 120, s * 78, f < 0.04 || f > 0.97 ? 0 : 1];
    }, 3),
  },
  metal: {
    tile: [1.2, 1.2], gen: () => pixelTex('metal', 256, 256, (u, v) => {
      const ridges = 16;
      const ph = Math.sin(u * ridges * Math.PI * 2);
      const n = tfbm(u, v, 8, 3, 61) * 0.08;
      const streak = tfbm(u * 8, v * 0.5, 8, 3, 62);
      let s = 0.78 + ph * 0.08 + n - (streak > 0.7 ? (streak - 0.7) * 0.4 : 0);
      s *= 255;
      return [s, s, s * 1.01, ph * 0.5 + 0.5];
    }, 2.2),
  },
  cinder: {
    tile: [1.2, 1.2], gen: () => pixelTex('cinder', 256, 256, (u, v) => {
      const rows = 6, per = 3;
      const r = Math.floor(v * rows), fv = v * rows - r;
      const bu = u * per + (r % 2) * 0.5, fu = bu - Math.floor(bu);
      const mortar = fu < 0.03 || fv < 0.06;
      const n = tfbm(u, v, 48, 3, 71);
      const s = (mortar ? 0.62 : 0.74 + (n - 0.5) * 0.18) * 255;
      return [s, s, s * 0.98, mortar ? 0 : 1];
    }, 3),
  },
  plaster: {
    tile: [2, 2], gen: () => pixelTex('plaster', 128, 128, (u, v) => {
      const n = tfbm(u, v, 8, 4, 81);
      const s = (0.93 + (n - 0.5) * 0.05) * 255;
      return [s, s, s, n];
    }, 0.6),
  },
  wallpaper: {
    tile: [0.6, 0.6], gen: () => pixelTex('wallpaper', 256, 256, (u, v) => {
      const stripe = (Math.sin(u * Math.PI * 2 * 6) * 0.5 + 0.5);
      const fu = (u * 3) % 1, fv = (v * 3 + (Math.floor(u * 3) % 2) * 0.5) % 1;
      const dot = Math.hypot(fu - 0.5, fv - 0.5) < 0.12 ? 1 : 0;
      const n = tfbm(u, v, 16, 2, 85);
      const s = 0.93 - stripe * 0.035 - dot * 0.05 + (n - 0.5) * 0.03;
      return [s * 255, s * 250, s * 238, 0];
    }),
  },
  trim: {
    tile: [1, 1], gen: () => pixelTex('trim', 64, 64, (u, v) => {
      const n = tfbm(u, v, 4, 3, 91);
      const s = (0.95 + (n - 0.5) * 0.04) * 255;
      return [s, s, s, 0];
    }),
  },
  concrete: {
    tile: [3, 3], gen: () => pixelTex('concrete', 256, 256, (u, v) => {
      const n = tfbm(u, v, 8, 5, 101);
      const sp = hash2(Math.floor(u * 256), Math.floor(v * 256), 3) > 0.97 ? -0.06 : 0;
      const s = (0.68 + (n - 0.5) * 0.18 + sp) * 255;
      return [s, s * 0.99, s * 0.96, n];
    }, 0.8),
  },
  stone: {
    tile: [1.6, 1.6], gen: () => {
      // Fieldstone: Voronoi cells with mortar gaps.
      const rng = mulberry32(5150);
      const pts = [];
      for (let i = 0; i < 26; i++) pts.push([rng(), rng() * 0.9 + 0.05, rng()]);
      return pixelTex('stone', 512, 512, (u, v) => {
        let d1 = 9, d2 = 9, id = 0;
        for (let i = 0; i < pts.length; i++) {
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const dx = u - (pts[i][0] + ox), dy = (v - (pts[i][1] + oy)) * 1.6;
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
          }
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const n = tfbm(u, v, 16, 4, 111);
        if (edge < 0.012) { const m = 120 + n * 30; return [m, m * 0.97, m * 0.92, 0]; }
        const t = pts[id][2];
        const base = [150 + t * 50, 140 + t * 40, 122 + t * 30];
        const k = 0.78 + n * 0.35 + Math.min(edge, 0.05) * 2;
        return [base[0] * k, base[1] * k, base[2] * k, Math.min(edge * 20, 1) + n * 0.2];
      }, 5);
    },
  },
  // ---------- floors ----------
  woodFloor: {
    tile: [1.2, 1.2], gen: () => pixelTex('woodFloor', 512, 512, (u, v) => {
      const rows = 12;
      const r = Math.floor(v * rows), f = v * rows - r;
      const seg = Math.floor(u * 2 + hash2(r, 0, 3) * 2);
      const grain = tfbm(u * 0.4, v * 10, 8, 4, 131 + r) * 0.3;
      const tone = 0.7 + hash2(r, seg, 4) * 0.35;
      let s = (0.62 + grain) * tone;
      const fu = (u * 2 + hash2(r, 0, 3) * 2) % 1;
      if (f < 0.03 || fu < 0.006) s *= 0.55;
      return [s * 175, s * 118, s * 72, f < 0.03 ? 0 : 1];
    }, 1.5),
  },
  tileChecker: {
    tile: [0.6, 0.6], gen: () => pixelTex('tileC', 128, 128, (u, v) => {
      const c = (Math.floor(u * 2) + Math.floor(v * 2)) % 2;
      const fu = (u * 2) % 1, fv = (v * 2) % 1;
      const grout = fu < 0.02 || fv < 0.02;
      const n = tfbm(u, v, 8, 2, 141) * 0.06;
      const s = grout ? 0.55 : c ? 0.18 + n : 0.9 + n;
      return [s * 255, s * 252, s * 245, grout ? 0 : 1];
    }, 1),
  },
  tileWhite: {
    tile: [0.6, 0.6], gen: () => pixelTex('tileW', 128, 128, (u, v) => {
      const fu = (u * 4) % 1, fv = (v * 4) % 1;
      const grout = fu < 0.03 || fv < 0.03;
      const n = tfbm(u, v, 8, 2, 151) * 0.04;
      const s = grout ? 0.8 : 0.95 + n;
      return [s * 255, s * 255, s * 252, grout ? 0 : 1];
    }, 1),
  },
  carpet: {
    tile: [1, 1], gen: () => pixelTex('carpet', 128, 128, (u, v, x, y) => {
      const n = tfbm(u, v, 32, 3, 161);
      const sp = hash2(x, y, 5) * 0.1;
      const s = (0.78 + (n - 0.5) * 0.15 + sp) * 255;
      return [s, s, s, n];
    }, 0.6),
  },
  linoleum: {
    tile: [2, 2], gen: () => pixelTex('lino', 128, 128, (u, v) => {
      const n = tfbm(u, v, 6, 4, 171);
      const fleck = hash2(Math.floor(u * 128), Math.floor(v * 128), 9) > 0.93 ? 0.08 : 0;
      const s = 0.86 + (n - 0.5) * 0.08 - fleck;
      return [s * 255, s * 250, s * 236, 0];
    }),
  },
  // ---------- roofs ----------
  shingles: {
    tile: [1.0, 1.0], gen: () => pixelTex('shingles', 256, 256, (u, v, x, y) => {
      const rows = 7; // ~0.14 m exposure
      const r = Math.floor(v * rows), f = v * rows - r;
      const tabs = 3, tu = u * tabs + (r % 2) * 0.5 + hash2(r, 1, 2) * 0.2;
      const ft = tu - Math.floor(tu), tid = Math.floor(tu);
      const gran = hash2(x, y, 13) * 0.18;
      const tone = 0.85 + hash2(tid, r, 3) * 0.25;
      let s = (0.62 + gran) * tone;
      if (f > 0.86) s *= 0.55 + (1 - f) * 2; // shadow line under the next row
      if (ft < 0.025) s *= 0.5;
      return [s * 255, s * 255, s * 255, 1 - f];
    }, 3),
  },
  roofMetal: {
    tile: [1.2, 1.2], gen: () => pixelTex('roofMetal', 256, 256, (u, v) => {
      const ribs = 3;
      const f = (u * ribs) % 1;
      const n = tfbm(u, v, 6, 3, 181) * 0.08;
      let s = 0.8 + n, h = 0;
      if (f < 0.04) { s = 0.92; h = 1; } else if (f < 0.06) { s = 0.62; h = 0.5; }
      const streak = tfbm(u * 6, v * 0.7, 6, 3, 182);
      if (streak > 0.68) s -= (streak - 0.68) * 0.5;
      return [s * 255, s * 255, s * 255, h];
    }, 3),
  },
  shake: {
    tile: [1, 1], gen: () => pixelTex('shake', 256, 256, (u, v, x, y) => {
      const rows = 5;
      const r = Math.floor(v * rows), f = v * rows - r;
      const n = 7;
      const tu = u * n + hash2(r, 0, 4) * 0.7;
      const id = Math.floor(tu), ft = tu - id;
      const grain = tfbm(u * 6, v, 8, 3, 191 + id) * 0.2;
      let s = (0.62 + grain) * (0.8 + hash2(id, r, 6) * 0.35);
      if (ft < 0.03) s *= 0.5;
      if (f > 0.88) s *= 0.6;
      return [s * 160, s * 130, s * 105, 1 - f];
    }, 3),
  },
  tarRoof: {
    tile: [3, 3], gen: () => pixelTex('tar', 128, 128, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 4, 201);
      const g = hash2(x, y, 7) * 0.12;
      const s = (0.34 + (n - 0.5) * 0.1 + g) * 255;
      return [s, s, s * 0.98, 0];
    }),
  },
  // ---------- ground & roads ----------
  grass: {
    tile: [5, 5], gen: () => pixelTex('grass', 512, 512, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 5, 211);
      const blades = hash2(x, y, 17);
      const clump = tfbm(u, v, 32, 2, 212);
      const k = 0.75 + n * 0.4 + (blades - 0.5) * 0.25;
      return [ (70 + clump * 30) * k, (108 + clump * 25) * k, (42 + n * 10) * k, blades];
    }, 1.2),
  },
  dryGrass: {
    tile: [5, 5], gen: () => pixelTex('dry', 512, 512, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 5, 221);
      const blades = hash2(x, y, 27);
      const k = 0.78 + n * 0.35 + (blades - 0.5) * 0.3;
      return [168 * k, 148 * k, 92 * k, blades];
    }, 1.2),
  },
  dirt: {
    tile: [4, 4], gen: () => pixelTex('dirt', 256, 256, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 5, 231);
      const p = hash2(x, y, 37) > 0.94 ? 0.75 : 1;
      const k = (0.75 + n * 0.45) * p;
      return [118 * k, 92 * k, 66 * k, n];
    }, 1.5),
  },
  field: {
    tile: [3.04, 3.04], gen: () => pixelTex('field', 256, 256, (u, v, x, y) => {
      // 4 rows (0.76 m spacing) across the tile, rows run along V
      const rowPh = Math.cos(u * 4 * Math.PI * 2);
      const n = tfbm(u, v, 8, 4, 241);
      const straw = hash2(x, y, 47) > 0.8 ? 1.35 : 1;
      const k = (0.68 + n * 0.3 + rowPh * 0.1) * straw;
      return [112 * k, 86 * k, 60 * k, rowPh * 0.5 + 0.5];
    }, 2),
  },
  gravel: {
    tile: [3, 3], gen: () => pixelTex('gravel', 512, 512, (u, v, x, y) => {
      const n = tfbm(u, v, 64, 3, 251);
      const n2 = tfbm(u, v, 6, 3, 252);
      const p = hash2(Math.floor(x / 3), Math.floor(y / 3), 57);
      const k = 0.62 + n * 0.45 + (p - 0.5) * 0.3;
      return [178 * k * (0.95 + n2 * 0.1), 168 * k, 152 * k, n + p * 0.4];
    }, 2),
  },
  sand: {
    tile: [4, 4], gen: () => pixelTex('sand', 256, 256, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 4, 261);
      const ripple = Math.sin((v + n * 0.1) * Math.PI * 2 * 10) * 0.04;
      const k = 0.8 + n * 0.25 + ripple + hash2(x, y, 67) * 0.06;
      return [150 * k, 132 * k, 102 * k, n];
    }, 1),
  },
  rock: {
    tile: [3, 3], gen: () => {
      const rng = mulberry32(777);
      const pts = [];
      for (let i = 0; i < 40; i++) pts.push([rng(), rng(), rng()]);
      return pixelTex('rock', 256, 256, (u, v) => {
        let d1 = 9, d2 = 9, id = 0;
        for (let i = 0; i < pts.length; i++) {
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const dx = u - (pts[i][0] + ox), dy = v - (pts[i][1] + oy);
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
          }
        }
        const e = Math.sqrt(d2) - Math.sqrt(d1);
        const n = tfbm(u, v, 16, 3, 271);
        const t = pts[id][2];
        const k = (e < 0.015 ? 0.4 : 0.7 + n * 0.35) * (0.8 + t * 0.3);
        return [140 * k, 134 * k, 124 * k, Math.min(e * 12, 1)];
      }, 4);
    },
  },
  asphalt: {
    tile: [4, 4], gen: () => pixelTex('asphalt', 512, 512, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 5, 281);
      const agg = hash2(x, y, 77);
      const crack = Math.abs(tfbm(u, v, 4, 4, 282) - 0.5) < 0.0035 ? 0.82 : 1;
      const k = (0.3 + n * 0.12 + (agg > 0.9 ? 0.08 : 0) + (agg - 0.5) * 0.04) * crack;
      return [k * 255, k * 255, k * 252, agg * 0.3];
    }, 0.8),
  },
  sidewalk: {
    tile: [1.5, 1.5], gen: () => pixelTex('sidewalk', 256, 256, (u, v, x, y) => {
      const n = tfbm(u, v, 8, 4, 291);
      const joint = u < 0.01 || v < 0.01;
      const k = joint ? 0.42 : 0.7 + (n - 0.5) * 0.14 + hash2(x, y, 87) * 0.03;
      return [k * 255, k * 252, k * 244, joint ? 0 : 1];
    }, 1.5),
  },
  bark: {
    tile: [1, 2], gen: () => pixelTex('bark', 128, 256, (u, v) => {
      const n = tfbm(u * 2, v * 0.5, 8, 4, 301);
      const ridges = Math.abs(Math.sin((u + n * 0.3) * Math.PI * 10));
      const k = 0.45 + ridges * 0.3 + n * 0.2;
      return [k * 110, k * 92, k * 74, ridges];
    }, 3),
  },
  fabric: {
    tile: [0.5, 0.5], gen: () => pixelTex('fabric', 128, 128, (u, v, x, y) => {
      const weave = ((x + y) % 2) * 0.05 + ((x % 4 < 2) ? 0.03 : 0);
      const n = tfbm(u, v, 8, 3, 311) * 0.1;
      const s = (0.78 + weave + n) * 255;
      return [s, s, s, weave * 10];
    }, 0.8),
  },
  woodFurn: {
    tile: [1, 1], gen: () => pixelTex('woodFurn', 256, 256, (u, v) => {
      const g = tfbm(u * 0.3, v * 4, 8, 4, 321);
      const rings = Math.sin((u * 3 + g * 2) * Math.PI * 6) * 0.5 + 0.5;
      const k = 0.62 + rings * 0.12 + g * 0.25;
      return [k * 190, k * 132, k * 84, 0];
    }),
  },
  hay: {
    tile: [1, 1], gen: () => pixelTex('hay', 128, 128, (u, v, x, y) => {
      const n = tfbm(u, v * 0.3, 16, 3, 331);
      const s = hash2(x, Math.floor(y / 4), 97);
      const k = 0.7 + n * 0.25 + (s - 0.5) * 0.3;
      return [205 * k, 175 * k, 100 * k, n];
    }, 1.5),
  },
};

// Returns { map, normalMap?, tile:[w,h] }
export function getTex(name) {
  if (cache.has(name)) return cache.get(name);
  const def = DEFS[name];
  if (!def) throw new Error('Unknown texture ' + name);
  const t = def.gen();
  for (const k of ['map', 'normalMap']) {
    if (t[k]) t[k].repeat.set(1 / def.tile[0], 1 / def.tile[1]);
  }
  const out = { ...t, tile: def.tile };
  cache.set(name, out);
  return out;
}

export const TEXTURE_NAMES = Object.keys(DEFS);

// ------------------------------------------------------------------
// Alpha-cutout plant textures and painted signs (2D canvas drawing).
// ------------------------------------------------------------------
export function cornTexture() {
  if (cache.has('_corn')) return cache.get('_corn');
  const W = Math.round(512 * SIZE_SCALE), H = Math.round(512 * SIZE_SCALE);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(4242);
  ctx.clearRect(0, 0, W, H);
  const stalks = 5;
  for (let s = 0; s < stalks; s++) {
    const x0 = ((s + 0.5) / stalks) * W + (rng() - 0.5) * W * 0.06;
    const lean = (rng() - 0.5) * W * 0.04;
    const top = H * (0.02 + rng() * 0.06);
    const tone = 0.85 + rng() * 0.3;
    // stalk
    ctx.strokeStyle = `rgb(${Math.round(176 * tone)},${Math.round(150 * tone)},${Math.round(90 * tone)})`;
    ctx.lineWidth = W * 0.012;
    ctx.beginPath(); ctx.moveTo(x0, H); ctx.quadraticCurveTo(x0 + lean * 0.5, H * 0.5, x0 + lean, top + H * 0.04); ctx.stroke();
    // tassel
    ctx.strokeStyle = `rgb(${Math.round(196 * tone)},${Math.round(170 * tone)},${Math.round(110 * tone)})`;
    ctx.lineWidth = W * 0.005;
    for (let t = 0; t < 6; t++) {
      ctx.beginPath();
      ctx.moveTo(x0 + lean, top + H * 0.05);
      ctx.lineTo(x0 + lean + (rng() - 0.5) * W * 0.06, top + rng() * H * 0.02);
      ctx.stroke();
    }
    // leaves
    const leaves = 9;
    for (let l = 0; l < leaves; l++) {
      const t = 0.15 + (l / leaves) * 0.72;
      const y = H - t * (H - top);
      const x = x0 + lean * t;
      const dir = l % 2 ? 1 : -1;
      const len = W * (0.1 + rng() * 0.08) * (1 - t * 0.4);
      const droop = H * (0.04 + rng() * 0.06);
      const g = 0.75 + rng() * 0.35;
      const dry = rng() < 0.55;
      ctx.fillStyle = dry
        ? `rgb(${Math.round(186 * g)},${Math.round(158 * g)},${Math.round(92 * g)})`
        : `rgb(${Math.round(150 * g)},${Math.round(150 * g)},${Math.round(80 * g)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dir * len * 0.6, y - droop * 1.2, x + dir * len, y + droop);
      ctx.quadraticCurveTo(x + dir * len * 0.5, y - droop * 0.5, x, y + H * 0.012);
      ctx.fill();
    }
    // ears
    for (let e = 0; e < 2; e++) {
      const t = 0.45 + e * 0.12 + rng() * 0.05;
      const y = H - t * (H - top), x = x0 + lean * t;
      const dir = e % 2 ? 1 : -1;
      ctx.fillStyle = `rgb(${Math.round(200 * tone)},${Math.round(180 * tone)},${Math.round(120 * tone)})`;
      ctx.beginPath();
      ctx.ellipse(x + dir * W * 0.014, y, W * 0.011, H * 0.035, dir * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = alphaTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('_corn', t);
  return t;
}

export function grassTuftTexture(dry = false) {
  const key = '_tuft' + (dry ? 'd' : 'g');
  if (cache.has(key)) return cache.get(key);
  const W = Math.round(256 * SIZE_SCALE), H = Math.round(256 * SIZE_SCALE);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(dry ? 99 : 98);
  for (let i = 0; i < 70; i++) {
    const x = W * (0.1 + rng() * 0.8);
    const h = H * (0.35 + rng() * 0.6);
    const bend = (rng() - 0.5) * W * 0.25;
    const g = 0.85 + rng() * 0.35;
    ctx.strokeStyle = dry
      ? `rgb(${Math.round(196 * g)},${Math.round(174 * g)},${Math.round(112 * g)})`
      : `rgb(${Math.round(104 * g)},${Math.round(140 * g)},${Math.round(62 * g)})`;
    ctx.lineWidth = W * (0.008 + rng() * 0.01);
    ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + bend * 0.3, H - h * 0.6, x + bend, H - h); ctx.stroke();
  }
  const t = alphaTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

export function pampasTexture() {
  if (cache.has('_pampas')) return cache.get('_pampas');
  const W = Math.round(256 * SIZE_SCALE), H = Math.round(256 * SIZE_SCALE);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(31337);
  // leaves at the base
  for (let i = 0; i < 40; i++) {
    const x = W * (0.3 + rng() * 0.4), h = H * (0.25 + rng() * 0.3);
    const bend = (rng() - 0.5) * W * 0.5;
    ctx.strokeStyle = `rgb(${120 + rng() * 40},${130 + rng() * 30},${70 + rng() * 20})`;
    ctx.lineWidth = W * 0.008;
    ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + bend * 0.3, H - h * 0.7, x + bend, H - h * 0.7); ctx.stroke();
  }
  // plumes
  for (let p = 0; p < 9; p++) {
    const bx = W * (0.35 + rng() * 0.3), topX = bx + (rng() - 0.5) * W * 0.5, topY = H * (0.03 + rng() * 0.2);
    ctx.strokeStyle = 'rgb(190,175,140)'; ctx.lineWidth = W * 0.006;
    ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(topX, topY + H * 0.2); ctx.stroke();
    for (let k = 0; k < 140; k++) {
      const t = rng();
      const px = topX + (bx - topX) * t * 0.25 + (rng() - 0.5) * W * 0.06;
      const py = topY + t * H * 0.28;
      const b = 220 + rng() * 30;
      ctx.fillStyle = `rgba(${b},${b - 12},${b - 40},0.8)`;
      ctx.fillRect(px, py, W * 0.012, H * 0.02);
    }
  }
  const t = alphaTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('_pampas', t);
  return t;
}

// Painted sign / mural textures.
export function textTexture(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = finishTex(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}
