// Procedurally painted textures. Everything is drawn into canvases at startup so the
// game ships with zero image assets. World surfaces share one texture array
// (sampler2DArray) so the whole island renders with a handful of materials.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export const TEX = {
  WHITE: 0, SIDING: 1, BRICK: 2, SHINGLE: 3, PLANKS: 4, CONCRETE: 5, STUCCO: 6, METAL: 7,
  LOGS: 8, TAR: 9, TILE: 10, FABRIC: 11, COBBLE: 12, ASPHALT: 13, GRAVEL: 14, DIRTROAD: 15,
  RIBBED: 16, GRASS: 17, LEAVES: 18, BARK: 19, HAY: 20, WINDOW: 21, FURROW: 22, WHEAT: 23,
  SHUTTER: 24, PAINTED: 25, BOARDS: 26, ROCK: 27, SAND: 28, STONEWALL: 29, MOSS: 30, CROPS: 31,
};
const LAYERS = 32;
const S = 256;

// ---------- tileable value noise ----------
function makePeriodicNoise(seed) {
  const r = mulberry32(seed);
  const tables = {};
  return function (x, y, period) {
    let t = tables[period];
    if (!t) {
      t = new Float32Array(period * period);
      for (let i = 0; i < t.length; i++) t[i] = r();
      tables[period] = t;
    }
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = t[y0 * period + x0], b = t[y0 * period + x1];
    const c = t[y1 * period + x0], d = t[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const pnoise = makePeriodicNoise(1337);
function fbmT(x, y, basePeriod, oct = 4) {
  // x,y in [0,1)
  let sum = 0, amp = 0.5, p = basePeriod, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += pnoise(x * p, y * p, p) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

function ctx2d(w = S, h = S) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// Apply per-pixel noise modulation (tileable)
function noiseOverlay(ctx, amount, period = 8, oct = 4, w = S, h = S) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbmT(x / w, y / h, period, oct) - 0.5;
      const i = (y * w + x) * 4;
      const k = 1 + n * amount;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function grain(ctx, amount, seed = 1, w = S, h = S) {
  const r = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (r() - 0.5) * amount;
    d[i] = Math.min(255, d[i] * k);
    d[i + 1] = Math.min(255, d[i + 1] * k);
    d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  ctx.putImageData(img, 0, 0);
}
const g = (v) => `rgb(${v},${v},${v})`;

// Draw a rect that wraps around texture edges (for seamless tiling)
function wrapRect(ctx, x, y, w, h) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    if (x + ox + w < 0 || x + ox > S || y + oy + h < 0 || y + oy > S) continue;
    ctx.fillRect(x + ox, y + oy, w, h);
  }
}
function wrapEllipse(ctx, x, y, rx, ry, rot = 0) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    if (x + ox + rx < 0 || x + ox - rx > S || y + oy + ry < 0 || y + oy - ry > S) continue;
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
}

const painters = {
  [TEX.WHITE](c) { c.fillStyle = g(235); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.06, 4); },
  [TEX.SIDING](c) {
    c.fillStyle = g(232); c.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows;
    for (let i = 0; i < rows; i++) {
      const grd = c.createLinearGradient(0, i * h, 0, (i + 1) * h);
      grd.addColorStop(0, g(250)); grd.addColorStop(0.85, g(222)); grd.addColorStop(1, g(170));
      c.fillStyle = grd; c.fillRect(0, i * h, S, h);
    }
    noiseOverlay(c, 0.08, 4); grain(c, 0.05, 2);
  },
  [TEX.BRICK](c) {
    c.fillStyle = g(205); c.fillRect(0, 0, S, S);
    const r = mulberry32(3);
    const rows = 16, bw = 32, bh = S / rows;
    for (let y = 0; y < rows; y++) {
      const off = y % 2 ? bw / 2 : 0;
      for (let x = -1; x < S / bw + 1; x++) {
        const v = 150 + r() * 70;
        c.fillStyle = `rgb(${v},${v * 0.98},${v * 0.96})`;
        wrapRect(c, x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
      }
    }
    noiseOverlay(c, 0.18, 8); grain(c, 0.1, 4);
  },
  [TEX.SHINGLE](c) {
    c.fillStyle = g(120); c.fillRect(0, 0, S, S);
    const r = mulberry32(5);
    const rows = 10, sh = S / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 12;
      for (let x = -1; x < 12; x++) {
        const v = 170 + r() * 70;
        c.fillStyle = g(Math.floor(v));
        wrapRect(c, x * 24 + off + 1, y * sh + 1, 22, sh - 1);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        wrapRect(c, x * 24 + off + 1, y * sh + sh - 4, 22, 3);
      }
    }
    noiseOverlay(c, 0.12, 8); grain(c, 0.12, 6);
  },
  [TEX.PLANKS](c) {
    c.fillStyle = g(200); c.fillRect(0, 0, S, S);
    const r = mulberry32(7);
    const n = 8, w = S / n;
    for (let i = 0; i < n; i++) {
      const v = 175 + r() * 60;
      c.fillStyle = g(Math.floor(v)); c.fillRect(i * w, 0, w - 2, S);
      // grain lines
      c.strokeStyle = 'rgba(0,0,0,0.08)';
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        const x0 = i * w + r() * w;
        c.moveTo(x0, 0);
        c.bezierCurveTo(x0 + r() * 6 - 3, S * 0.3, x0 + r() * 6 - 3, S * 0.6, x0, S);
        c.stroke();
      }
      const cut = r() * S;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(i * w, cut, w - 2, 2);
    }
    c.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < n; i++) c.fillRect(i * w + w - 2, 0, 2, S);
    grain(c, 0.08, 8);
  },
  [TEX.CONCRETE](c) {
    c.fillStyle = g(205); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.22, 8, 5); grain(c, 0.12, 9);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, S, 2); c.fillRect(0, 0, 2, S);
  },
  [TEX.STUCCO](c) { c.fillStyle = g(232); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.14, 16, 5); grain(c, 0.1, 10); },
  [TEX.METAL](c) {
    c.fillStyle = g(200); c.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x++) {
      const v = 190 + Math.sin((x / S) * Math.PI * 2 * 12) * 40;
      c.fillStyle = g(Math.floor(v)); c.fillRect(x, 0, 1, S);
    }
    noiseOverlay(c, 0.15, 4); grain(c, 0.06, 11);
    c.fillStyle = 'rgba(120,70,30,0.15)';
    const r = mulberry32(12);
    for (let i = 0; i < 14; i++) wrapEllipse(c, r() * S, r() * S, 4 + r() * 20, 2 + r() * 30);
  },
  [TEX.LOGS](c) {
    const rows = 6, h = S / rows;
    for (let i = 0; i < rows; i++) {
      const grd = c.createLinearGradient(0, i * h, 0, (i + 1) * h);
      grd.addColorStop(0, g(130)); grd.addColorStop(0.2, g(215)); grd.addColorStop(0.6, g(200)); grd.addColorStop(1, g(95));
      c.fillStyle = grd; c.fillRect(0, i * h, S, h);
    }
    noiseOverlay(c, 0.14, 4); grain(c, 0.1, 13);
  },
  [TEX.TAR](c) { c.fillStyle = g(150); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.25, 16, 5); grain(c, 0.25, 14); },
  [TEX.TILE](c) {
    const n = 8, w = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      c.fillStyle = (x + y) % 2 ? g(235) : g(185);
      c.fillRect(x * w, y * w, w, w);
    }
    c.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * w, 0); c.lineTo(i * w, S); c.moveTo(0, i * w); c.lineTo(S, i * w); c.stroke(); }
    grain(c, 0.05, 15);
  },
  [TEX.FABRIC](c) {
    c.fillStyle = g(215); c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, y, S, 1); }
    for (let x = 0; x < S; x += 2) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x, 0, 1, S); }
    noiseOverlay(c, 0.1, 8); grain(c, 0.1, 16);
  },
  [TEX.COBBLE](c) {
    c.fillStyle = g(110); c.fillRect(0, 0, S, S);
    const r = mulberry32(17);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) {
      const v = 160 + r() * 80;
      c.fillStyle = g(Math.floor(v));
      wrapEllipse(c, x * 25.6 + (y % 2) * 12.8 + r() * 4, y * 21.3 + r() * 4, 11 + r() * 2, 9 + r() * 2, r());
    }
    noiseOverlay(c, 0.15, 8); grain(c, 0.12, 18);
  },
  [TEX.ASPHALT](c) {
    c.fillStyle = g(120); c.fillRect(0, 0, S, S); grain(c, 0.45, 19); noiseOverlay(c, 0.25, 4, 5);
    c.strokeStyle = 'rgba(30,30,30,0.35)'; c.lineWidth = 1.5;
    const r = mulberry32(20);
    for (let i = 0; i < 5; i++) {
      c.beginPath(); let x = r() * S, y = r() * S; c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += r() * 30 - 15; y += r() * 30 - 15; c.lineTo(x, y); }
      c.stroke();
    }
  },
  [TEX.GRAVEL](c) {
    c.fillStyle = g(170); c.fillRect(0, 0, S, S);
    const r = mulberry32(21);
    for (let i = 0; i < 1800; i++) {
      const v = 120 + r() * 120;
      c.fillStyle = g(Math.floor(v));
      wrapEllipse(c, r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2, r() * 3);
    }
    noiseOverlay(c, 0.2, 4);
  },
  [TEX.DIRTROAD](c) {
    c.fillStyle = g(200); c.fillRect(0, 0, S, S);
    noiseOverlay(c, 0.25, 8, 5);
    // two worn tire tracks running along V (texture is mapped U across, V along road)
    for (const cx of [0.27, 0.73]) {
      const grd = c.createLinearGradient((cx - 0.12) * S, 0, (cx + 0.12) * S, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(60,40,20,0.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd; c.fillRect((cx - 0.12) * S, 0, 0.24 * S, S);
    }
    const r = mulberry32(22);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.06 + r() * 0.1})`;
      wrapEllipse(c, r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    // grassy median
    c.fillStyle = 'rgba(70,120,40,0.35)';
    for (let i = 0; i < 400; i++) wrapRect(c, S * 0.5 + (r() - 0.5) * S * 0.12, r() * S, 1.5, 3 + r() * 6);
  },
  [TEX.RIBBED](c) {
    for (let x = 0; x < S; x++) {
      const p = (x % 32) / 32;
      const v = p < 0.15 ? 150 : p < 0.5 ? 230 : p < 0.65 ? 170 : 215;
      c.fillStyle = g(v); c.fillRect(x, 0, 1, S);
    }
    noiseOverlay(c, 0.12, 4); grain(c, 0.05, 23);
  },
  [TEX.GRASS](c) {
    c.fillStyle = g(205); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.3, 8, 5);
    const r = mulberry32(24);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      c.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.12)';
      wrapRect(c, r() * S, r() * S, 1, 2 + r() * 5);
    }
  },
  [TEX.LEAVES](c) {
    c.fillStyle = g(180); c.fillRect(0, 0, S, S);
    const r = mulberry32(25);
    for (let i = 0; i < 700; i++) {
      const v = 140 + r() * 115;
      c.fillStyle = g(Math.floor(v));
      wrapEllipse(c, r() * S, r() * S, 4 + r() * 6, 2 + r() * 4, r() * Math.PI);
    }
    noiseOverlay(c, 0.25, 4);
  },
  [TEX.BARK](c) {
    c.fillStyle = g(170); c.fillRect(0, 0, S, S);
    const r = mulberry32(26);
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.25})`;
      const x = r() * S; wrapRect(c, x, r() * S, 2 + r() * 4, 20 + r() * 90);
    }
    noiseOverlay(c, 0.2, 8);
  },
  [TEX.HAY](c) {
    c.fillStyle = g(215); c.fillRect(0, 0, S, S);
    const r = mulberry32(27);
    c.lineWidth = 1.2;
    for (let i = 0; i < 900; i++) {
      c.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.08 + r() * 0.15})`;
      const x = r() * S, y = r() * S, a = r() * 0.6 - 0.3, l = 8 + r() * 20;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  },
  [TEX.WINDOW](c) {
    const grd = c.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, g(120)); grd.addColorStop(0.5, g(60)); grd.addColorStop(1, g(40));
    c.fillStyle = grd; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(20, S); c.lineTo(90, 0); c.lineTo(130, 0); c.lineTo(60, S); c.fill();
  },
  [TEX.FURROW](c) {
    for (let x = 0; x < S; x++) {
      const v = 165 + Math.sin((x / S) * Math.PI * 2 * 16) * 45;
      c.fillStyle = g(Math.floor(v)); c.fillRect(x, 0, 1, S);
    }
    noiseOverlay(c, 0.25, 8); grain(c, 0.15, 28);
  },
  [TEX.WHEAT](c) {
    c.fillStyle = g(215); c.fillRect(0, 0, S, S);
    const r = mulberry32(29);
    for (let i = 0; i < 1500; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? '90,60,0' : '255,250,220'},${0.1 + r() * 0.15})`;
      wrapRect(c, r() * S, r() * S, 1, 4 + r() * 8);
    }
    noiseOverlay(c, 0.18, 4);
  },
  [TEX.SHUTTER](c) {
    c.fillStyle = g(220); c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) {
      const grd = c.createLinearGradient(0, y, 0, y + 16);
      grd.addColorStop(0, g(245)); grd.addColorStop(1, g(150));
      c.fillStyle = grd; c.fillRect(12, y, S - 24, 16);
    }
    c.fillStyle = g(225); c.fillRect(0, 0, 12, S); c.fillRect(S - 12, 0, 12, S);
  },
  [TEX.PAINTED](c) { c.fillStyle = g(232); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.09, 8); grain(c, 0.06, 30);
    c.strokeStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < S; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); } },
  [TEX.BOARDS](c) {
    // vertical barn boards with battens
    const n = 6, w = S / n;
    const r = mulberry32(31);
    for (let i = 0; i < n; i++) {
      c.fillStyle = g(Math.floor(195 + r() * 45)); c.fillRect(i * w, 0, w, S);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(i * w, 0, 3, S);
      c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(i * w + 3, 0, 2, S);
    }
    noiseOverlay(c, 0.18, 8); grain(c, 0.1, 32);
  },
  [TEX.ROCK](c) {
    c.fillStyle = g(180); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.45, 4, 6);
    const r = mulberry32(33);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      c.beginPath(); let x = r() * S, y = r() * S; c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += r() * 50 - 25; y += r() * 30 - 15; c.lineTo(x, y); }
      c.stroke();
    }
    grain(c, 0.12, 34);
  },
  [TEX.SAND](c) { c.fillStyle = g(225); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.12, 8, 5); grain(c, 0.18, 35);
    c.strokeStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < S; y += 10) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(80, y + 6, 170, y - 6, S, y); c.stroke(); } },
  [TEX.STONEWALL](c) {
    c.fillStyle = g(120); c.fillRect(0, 0, S, S);
    const r = mulberry32(36);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) {
      c.fillStyle = g(Math.floor(160 + r() * 80));
      wrapRect(c, x * 43 + (y % 2) * 21 + 2, y * 32 + 2, 39 + r() * 4, 28);
    }
    noiseOverlay(c, 0.2, 8);
  },
  [TEX.MOSS](c) { c.fillStyle = g(190); c.fillRect(0, 0, S, S); noiseOverlay(c, 0.4, 8, 6); grain(c, 0.2, 37); },
  [TEX.CROPS](c) {
    c.fillStyle = g(200); c.fillRect(0, 0, S, S);
    const r = mulberry32(38);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.08 + r() * 0.12})`;
      wrapEllipse(c, r() * S, r() * S, 3 + r() * 8, 1 + r() * 3, r() * 3);
    }
    noiseOverlay(c, 0.2, 8);
  },
};

let _array = null;
export function getTextureArray() {
  if (_array) return _array;
  const data = new Uint8Array(S * S * 4 * LAYERS);
  const [canvas, c] = ctx2d();
  for (let l = 0; l < LAYERS; l++) {
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#ddd';
    c.fillRect(0, 0, S, S);
    const p = painters[l];
    if (p) p(c);
    const img = c.getImageData(0, 0, S, S);
    data.set(img.data, l * S * S * 4);
  }
  const tex = new THREE.DataArrayTexture(data, S, S, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _array = tex;
  void canvas;
  return tex;
}

// A small detail texture for terrain: R = grass detail, G = dirt detail, B = rock detail.
let _terrainDetail = null;
export function getTerrainDetail() {
  if (_terrainDetail) return _terrainDetail;
  const N = 512;
  const [canvas, c] = ctx2d(N, N);
  const img = c.createImageData(N, N);
  const d = img.data;
  const r = mulberry32(99);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const i = (y * N + x) * 4;
      const grassN = fbmT(u, v, 32, 3) * 0.6 + r() * 0.4;
      const dirtN = fbmT(u + 0.3, v + 0.7, 16, 4) * 0.7 + r() * 0.3;
      const rockN = fbmT(u + 0.5, v + 0.1, 8, 5);
      d[i] = 110 + grassN * 145;
      d[i + 1] = 120 + dirtN * 135;
      d[i + 2] = 90 + rockN * 165;
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  _terrainDetail = tex;
  return tex;
}

// Generic helper for canvas-based textures (signs, faces, UI previews...)
export function canvasTexture(w, h, draw, srgb = true) {
  const [canvas, c] = ctx2d(w, h);
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function plaidTexture(base, line1, line2) {
  return canvasTexture(128, 128, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, 128, 128);
    c.globalAlpha = 0.55;
    c.fillStyle = line1;
    for (let i = 0; i < 128; i += 32) { c.fillRect(i, 0, 12, 128); c.fillRect(0, i, 128, 12); }
    c.globalAlpha = 0.45;
    c.fillStyle = line2;
    for (let i = 16; i < 128; i += 32) { c.fillRect(i, 0, 3, 128); c.fillRect(0, i, 128, 3); }
    c.globalAlpha = 1;
  });
}
