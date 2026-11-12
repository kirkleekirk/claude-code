// Trees. A canopy is a dark, lumpy core wrapped in a few hundred small cards
// of leaves that all share the canopy's roundness when they are lit, so it
// reads as one soft mass with a leafy edge instead of a faceted ball. Three
// levels of detail per kind (all the cards; a third of them, larger; a few
// plain lumps) are drawn instanced. Where each tree stands, and how wide the
// game believes it is, is unchanged from the trees these replace.
import * as THREE from 'three';
import { mulberry32, clamp } from '../util.js';
import { windUniforms, leafLight } from './vegetation.js';
import { cutoutTexture } from '../gfx/alphamips.js';
import { GFX } from '../gfx/globals.js';

export const TREE = { OAK: 0, OAK2: 1, MAPLE: 2, COTTON: 3, CEDAR: 4, CEDAR2: 5, SHRUB: 6, MAPLE_FALL: 7, OAK_FALL: 8, MAPLE_RED: 9 };
const KINDS = [
  { kind: 'oak', seed: 11 }, { kind: 'oak', seed: 23 }, { kind: 'maple', seed: 37 },
  { kind: 'cottonwood', seed: 41 }, { kind: 'cedar', seed: 53 }, { kind: 'cedar', seed: 59 }, { kind: 'shrub', seed: 67 },
  { kind: 'maple', seed: 71, leaf: '#c4782a', fall: 1 }, { kind: 'oak', seed: 83, leaf: '#a8862e', fall: 1 }, { kind: 'maple', seed: 97, leaf: '#a8442a', fall: 1 },
];
const LEAF = { oak: '#4a7030', maple: '#55803a', cottonwood: '#64843e', cedar: '#2c4a31', shrub: '#4f7232' };
const BARK = '#5a4a3c';
const LIN = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
// the grey painted at the centre of each leaf texture, where solid parts
// (trunk, core) take their colour from; they are brightened to cancel it
const CUT = 0.34; // the alpha test of foliage
const SOLID_GREY = 224, SOLID_K = 1 / Math.pow((SOLID_GREY / 255 + 0.055) / 1.055, 2.4);

// ---------------- the shapes the old trees had (still what the world plans around) ----------------
function blob(r, detail, seed, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rng = mulberry32(seed);
  const p = g.attributes.position;
  // lumpy: displace shared positions consistently
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = map.get(key);
    if (k === undefined) { k = 0.82 + rng() * 0.36; map.set(key, k); }
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  return g;
}
// A kind's layout: trunk height, branches and the lumps of its canopy, plus
// how far its foliage reaches at wall height (1.6-7 m). The random draws are
// in the order the original trees made them, so the reach comes out the same.
function plan(kind, seed) {
  const rng = mulberry32(seed);
  const P = { kind, seed, blobs: [], branches: [], reach: 0.5 };
  const scan = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y >= 1.6 && y <= 7) P.reach = Math.max(P.reach, Math.hypot(p.getX(i), p.getZ(i))); }
    g.dispose();
  };
  if (kind === 'oak' || kind === 'maple' || kind === 'cottonwood') {
    const cw = kind === 'cottonwood';
    const H = P.H = cw ? 9 + rng() * 3 : 4.5 + rng() * 1.5;
    const R = P.R = cw ? 4.2 : kind === 'oak' ? 4.8 : 3.8;
    for (let b = 0; b < 3; b++) {
      const tilt = (0.6 + rng() * 0.4) * (b % 2 ? 1 : -1), yaw = rng() * Math.PI * 2, y = H * (0.6 + rng() * 0.3);
      P.branches.push({ tilt, yaw, y });
      const br = new THREE.CylinderGeometry(0.06, 0.14, 2.4, 5, 1, true);
      br.translate(0, 1.2, 0); br.rotateZ(tilt); br.rotateY(yaw); br.translate(0, y, 0);
      scan(br);
    }
    const n = cw ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.5;
      const rr = i === 0 ? 0 : R * (0.35 + rng() * 0.45);
      const y = H + (cw ? rng() * 6 : rng() * 2.6) + (i === 0 ? 1.6 : 0);
      const s = (cw ? 2.2 : 2.5) + rng() * 1.2;
      const b = { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, r: s, sy: 0.85, seed: seed * 31 + i };
      const g = blob(s, 1, b.seed, 1, 0.85, 1);
      g.translate(b.x, b.y, b.z);
      scan(g);
      b.tint = 0.85 + rng() * 0.3;
      P.blobs.push(b);
    }
  } else if (kind === 'cedar') {
    const H = P.H = 6 + rng() * 3;
    for (let i = 0; i < 4; i++) {
      const t = i / 4, r = 1.9 * (1 - t * 0.7), h = (H / 4) * 1.7;
      const g = new THREE.ConeGeometry(r, h, 8, 1);
      g.translate(0, 1 + t * (H - 1.2) + h / 2, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const j = 0.88 + rng() * 0.24; p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); }
      scan(g);
    }
    P.top = 0.1 + 1.175 * H;
  } else if (kind === 'shrub') {
    for (let i = 0; i < 4; i++) {
      const s = 0.9 + rng() * 0.5;
      const b = { r: s, sy: 0.8, seed: seed + i, tint: 1 };
      b.x = (rng() - 0.5) * 1.6; b.y = 0.7 + rng() * 0.5; b.z = (rng() - 0.5) * 1.6;
      const g = blob(s, 1, b.seed, 1, 0.8, 1);
      g.translate(b.x, b.y, b.z);
      scan(g);
      P.blobs.push(b);
    }
  }
  return P;
}
const plans = new Map();
const planOf = (i) => { if (!plans.has(i)) plans.set(i, plan(KINDS[i].kind, KINDS[i].seed)); return plans.get(i); };

// Horizontal reach of a kind's foliage at wall height (1.6-7 m above its
// base), so trees can be kept from growing into buildings.
export function canopyRadius(kindIdx) { return planOf(kindIdx).reach; }

// ---------------- leaf textures ----------------
// White-ish leaves (the tree's colour comes from its vertices) on a clear
// ground. Clear texels carry the leaf colour too, so edges don't darken.
function finishTexture(cv, cells) {
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  const src = ctx.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, d = ((H - 1 - y) * W + x) * 4, a = src[s + 3];
    if (a === 0) { out[d] = 186; out[d + 1] = 196; out[d + 2] = 172; out[d + 3] = 0; } else { out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = a; }
  }
  // the solid spot at the centre of the first cell
  const cx = Math.floor(W / cells / 2), cy = Math.floor(H / 2);
  for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 3; x++) { const d = (y * W + x) * 4; out[d] = out[d + 1] = out[d + 2] = SOLID_GREY; out[d + 3] = 255; }
  return cutoutTexture(out, W, H, CUT);
}
let leafTex = null, firTex = null;
// two sprays of broad leaves side by side
function leafTexture() {
  if (leafTex) return leafTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = S * 2; cv.height = S;
  const c = cv.getContext('2d');
  const rng = mulberry32(9151);
  for (let cell = 0; cell < 2; cell++) {
    const leaves = [];
    const n = cell ? 128 : 150;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.pow(rng(), 0.55) * S * (cell ? 0.41 : 0.4);
      leaves.push({ x: S / 2 + Math.cos(a) * r, y: S / 2 + Math.sin(a) * r, a: a + (rng() - 0.5) * 2.2, len: S * (0.095 + rng() * 0.05), wid: 0.44 + rng() * 0.16, lum: 0.5 + rng() * 0.5, warm: rng() });
    }
    leaves.push({ x: S / 2, y: S / 2, a: rng() * 6.28, len: S * 0.14, wid: 0.5, lum: 0.9, warm: 0.5 });
    leaves.sort((p, q) => p.lum - q.lum); // the shaded ones behind
    for (const L of leaves) {
      const h = L.len / 2, w = L.len * L.wid * 0.5, v = Math.round(L.lum * 255);
      c.save();
      c.translate(cell * S + L.x, L.y); c.rotate(L.a);
      const gr = c.createLinearGradient(-h, 0, h, 0);
      const col = (k) => `rgb(${Math.round(v * k * (0.94 + L.warm * 0.08))},${Math.round(v * k)},${Math.round(v * k * (0.9 - L.warm * 0.08))})`;
      gr.addColorStop(0, col(0.7)); gr.addColorStop(0.6, col(0.95)); gr.addColorStop(1, col(1));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(-h, 0);
      c.bezierCurveTo(-h * 0.45, -w * 1.35, h * 0.45, -w * 1.15, h, 0);
      c.bezierCurveTo(h * 0.45, w * 1.15, -h * 0.45, w * 1.35, -h, 0);
      c.fill();
      c.strokeStyle = `rgba(${Math.round(v * 0.55)},${Math.round(v * 0.6)},${Math.round(v * 0.46)},0.45)`;
      c.lineWidth = S * 0.004;
      c.beginPath(); c.moveTo(-h * 0.92, 0); c.lineTo(h * 0.8, 0); c.stroke();
      c.restore();
    }
  }
  return (leafTex = finishTexture(cv, 2));
}
// a flat spray of a conifer bough (two of them): side twigs off a spine, each
// lined with fine needles; the trunk end is at the bottom
function firTexture() {
  if (firTex) return firTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = S * 2; cv.height = S;
  const c = cv.getContext('2d');
  const rng = mulberry32(4421);
  c.lineCap = 'round';
  const needles = (x0, y0, x1, y1, len, lw) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, n = Math.max(3, Math.round(L / (S * 0.0085)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + dx * t, py = y0 + dy * t, l = len * (1 - 0.55 * t) * (0.7 + rng() * 0.5);
      for (const side of [-1, 1]) {
        const a = (0.75 + rng() * 0.45) * side, ca = Math.cos(a), sa = Math.sin(a);
        const v = Math.round((0.5 + rng() * 0.5) * 255);
        c.strokeStyle = `rgb(${Math.round(v * 0.92)},${v},${Math.round(v * 0.9)})`;
        c.lineWidth = lw * (0.8 + rng() * 0.5);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + (ux * ca - uy * sa) * l, py + (uy * ca + ux * sa) * l); c.stroke();
      }
    }
  };
  for (let cell = 0; cell < 2; cell++) {
    c.save();
    c.translate(cell * S + S / 2, S * 0.995);
    const twigs = cell ? 12 : 14;
    for (let i = 0; i < twigs; i++) {
      const t = 0.05 + (i / twigs) * 0.86 + (rng() - 0.5) * 0.02, y = -t * S * 0.97;
      for (const side of [-1, 1]) {
        const ang = (0.82 + rng() * 0.26) * side, len = S * 0.47 * Math.pow(1 - t, 0.72) * (0.84 + rng() * 0.3) * (i < 2 ? 0.7 : 1);
        const x1 = Math.sin(ang) * len, y1 = y - Math.cos(ang) * len;
        needles(0, y, x1, y1, S * 0.05, S * 0.0052);
        c.strokeStyle = 'rgb(118,110,92)'; c.lineWidth = S * 0.006;
        c.beginPath(); c.moveTo(0, y); c.lineTo(x1 * 0.9, y + (y1 - y) * 0.9); c.stroke();
      }
    }
    needles(0, 0, 0, -S * 0.97, S * 0.055, S * 0.0055);
    c.strokeStyle = 'rgb(122,112,94)'; c.lineWidth = S * 0.011;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -S * 0.9); c.stroke();
    c.restore();
  }
  return (firTex = finishTexture(cv, 2));
}

// ---------------- geometry ----------------
class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.leaf = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, c, u, v, leaf) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]); this.uv.push(u, v); this.leaf.push(leaf);
    return this.count - 1;
  }
  // an opaque vertex (takes the texture's solid spot); leaf is 0 for wood, -1 for the canopy's core
  solid(p, n, c, leaf = 0) { return this.vert(p, n, [c[0] * SOLID_K, c[1] * SOLID_K, c[2] * SOLID_K], 0.25, 0.5, leaf); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leaf, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// a tapering limb from a to b with smooth sides; flare widens its foot
function limb(B, a, b, r0, r1, sides, segs, bark, flare = 0, seed = 1) {
  const rng = mulberry32(seed);
  const ax = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const u = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(ax, u);
  const tone = Array.from({ length: sides }, () => 0.86 + rng() * 0.28);
  const rings = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs, r = (r0 + (r1 - r0) * t) * (1 + flare * Math.pow(1 - Math.min(1, t / 0.24), 2));
    const bend = Math.sin(t * 2.6 + seed) * 0.05 * t * (segs > 1 ? 1 : 0);
    const c = [a[0] + (b[0] - a[0]) * t + u[0] * bend, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + v[2] * bend];
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const an = (k / sides) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
      const n = [u[0] * cs + v[0] * sn, u[1] * cs + v[1] * sn, u[2] * cs + v[2] * sn];
      ring.push(B.solid([c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], n, mul(bark, tone[k] * (0.72 + 0.34 * t))));
    }
    rings.push(ring);
  }
  for (let s = 0; s < segs; s++) for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    B.quad(rings[s][k], rings[s][k1], rings[s + 1][k1], rings[s + 1][k]);
  }
}

// the lumps of a canopy as one dark solid; faces buried in a neighbour are left out
function core(B, blobs, shrink, detail, colFn) {
  for (const b of blobs) {
    const g = blob(b.r * shrink, detail, b.seed, 1, b.sy, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 + b.x, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 + b.y, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 + b.z;
      let hidden = false;
      for (const o of blobs) if (o !== b) { const ex = cx - o.x, ey = (cy - o.y) / o.sy, ez = cz - o.z, rr = o.r * shrink * 0.76; if (ex * ex + ey * ey + ez * ez < rr * rr) { hidden = true; break; } }
      if (hidden) continue;
      const ids = [];
      for (let k = 0; k < 3; k++) {
        const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k), w = [x + b.x, y + b.y, z + b.z];
        ids.push(B.solid(w, norm([x, y / b.sy + b.r * 0.12, z]), colFn(w, b), -1));
      }
      B.idx.push(ids[0], ids[1], ids[2]);
    }
    g.dispose();
  }
}

// where the leaf cards of a canopy go (the same list serves every level of detail)
function leafCards(blobs, size, rng, fall) {
  let y0 = 1e9, y1 = -1e9, rMax = 0;
  for (const b of blobs) { y0 = Math.min(y0, b.y - b.r * b.sy); y1 = Math.max(y1, b.y + b.r * b.sy); rMax = Math.max(rMax, Math.hypot(b.x, b.z) + b.r); }
  const cy = y0 + (y1 - y0) * 0.42, cards = [];
  const density = 1 / (size * size * 0.36);
  blobs.forEach((b, j) => {
    const M = Math.round(4 * Math.PI * b.r * b.r * density);
    for (let k = 0; k < M; k++) {
      const t = (k + 0.5) / M, phi = Math.acos(1 - 2 * t), th = 2.399963 * k + j * 1.7;
      const d = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      const r = [rng(), rng(), rng(), rng(), rng(), rng(), rng(), rng(), rng()];
      const rad = b.r * (0.9 + r[0] * 0.16);
      let p = [b.x + d[0] * rad, b.y + d[1] * rad * b.sy, b.z + d[2] * rad];
      let inside = false;
      for (const o of blobs) if (o !== b) { const ex = p[0] - o.x, ey = (p[1] - o.y) / o.sy, ez = p[2] - o.z; if (ex * ex + ey * ey + ez * ez < o.r * o.r * 0.74) { inside = true; break; } }
      if (inside || (d[1] < -0.6 && r[1] < 0.25)) continue;
      const s = size * (0.8 + r[2] * 0.45);
      let u, v;
      const rnd = [r[4] - 0.5, r[5] - 0.5, r[6] - 0.5];
      if (r[3] < 0.7) {
        // lying on the surface, tilted every which way
        const n = norm([d[0] + rnd[0] * 1.1, d[1] + rnd[1] * 1.1, d[2] + rnd[2] * 1.1]);
        const t0 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t1 = cross(n, t0);
        const a = r[7] * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        u = [t0[0] * ca + t1[0] * sa, t0[1] * ca + t1[1] * sa, t0[2] * ca + t1[2] * sa];
        v = cross(n, u);
      } else {
        // standing out from it, to break the outline
        u = d;
        v = norm(cross(d, norm([rnd[0] + 0.01, rnd[1], rnd[2]])));
        p = [p[0] + d[0] * s * 0.2, p[1] + d[1] * s * 0.2, p[2] + d[2] * s * 0.2];
      }
      // lit as part of the whole canopy: outward from its lump and from the tree, and a little up
      const out = norm([p[0], (p[1] - cy) * 1.1, p[2]]);
      const n = norm([d[0] * 0.65 + out[0] * 0.6, d[1] * 0.65 + out[1] * 0.6 + 0.32, d[2] * 0.65 + out[2] * 0.6]);
      // darker inside and underneath
      const q = Math.hypot(p[0], (p[1] - cy) * 1.2, p[2]) / Math.max(rMax, (y1 - y0) * 0.6);
      const shade = (0.68 + 0.32 * clamp((q - 0.4) / 0.55, 0, 1)) * (0.8 + 0.27 * clamp((p[1] - y0) / (y1 - y0), 0, 1)) * (0.86 + r[8] * 0.28) * (b.tint || 1);
      const hue = (r[5] - 0.5) * (fall ? 0.5 : 0.2);
      cards.push({ p, u, v, n, s, shade, hue, phase: 0.08 + r[6] * 0.9, cell: r[7] < 0.5 ? 0 : 1 });
    }
  });
  return cards;
}
function addCards(B, cards, base, step, grow) {
  for (let i = 0; i < cards.length; i += step) {
    const c = cards[i], h = (c.s * grow) / 2;
    const col = [base[0] * c.shade * (1 + c.hue), base[1] * c.shade, base[2] * c.shade * (1 - c.hue * 1.2)];
    const ids = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [c.p[0] + (c.u[0] * su + c.v[0] * sv) * h, c.p[1] + (c.u[1] * su + c.v[1] * sv) * h, c.p[2] + (c.u[2] * su + c.v[2] * sv) * h];
      // each spray is a little rounded in the light
      const n = norm([c.n[0] + (c.u[0] * su + c.v[0] * sv) * 0.22, c.n[1] + (c.u[1] * su + c.v[1] * sv) * 0.22, c.n[2] + (c.u[2] * su + c.v[2] * sv) * 0.22]);
      ids.push(B.vert(p, n, col, (c.cell + (su + 1) / 2) / 2, (sv + 1) / 2, c.phase));
    }
    B.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

// near, mid and far geometry for one kind
function makeTree(def, P, detail) {
  const rng = mulberry32(def.seed * 7 + 5);
  const bark = LIN(BARK);
  const base = mul(LIN(def.leaf || LEAF[def.kind]), 1.22);
  const B = [new Builder(), new Builder(), new Builder()];
  if (P.blobs.length && def.kind !== 'shrub') {
    const cw = def.kind === 'cottonwood', H = P.H;
    const top = H + (cw ? 3.2 : 1.4);
    limb(B[0], [0, -0.25, 0], [0, top, 0], cw ? 0.38 : 0.34, 0.13, 9, 5, bark, 0.55, def.seed);
    limb(B[1], [0, -0.25, 0], [0, top, 0], cw ? 0.38 : 0.34, 0.13, 6, 2, bark, 0.3, def.seed);
    limb(B[2], [0, -0.25, 0], [0, H + 1, 0], 0.3, 0.2, 4, 1, bark, 0, def.seed);
    P.branches.forEach((br, i) => {
      const dir = [-Math.sin(br.tilt) * Math.cos(br.yaw), Math.cos(br.tilt), Math.sin(br.tilt) * Math.sin(br.yaw)];
      const from = [0, br.y, 0], to = [dir[0] * 3.1, br.y + dir[1] * 3.1, dir[2] * 3.1];
      limb(B[0], from, to, 0.15, 0.05, 6, 2, bark, 0, def.seed + i);
      limb(B[1], from, to, 0.15, 0.05, 4, 1, bark, 0, def.seed + i);
    });
    let y0 = 1e9, y1 = -1e9;
    for (const b of P.blobs) { y0 = Math.min(y0, b.y - b.r * b.sy); y1 = Math.max(y1, b.y + b.r * b.sy); }
    const dark = (k) => (w, b) => mul(base, (k + 0.14 * clamp((w[1] - y0) / (y1 - y0), 0, 1)) * b.tint);
    core(B[0], P.blobs, 0.74, 1, dark(0.3));
    core(B[1], P.blobs, 0.82, detail.midCore, dark(0.4));
    const cards = leafCards(P.blobs, cw ? 1.5 : 1.6, rng, def.fall);
    addCards(B[0], cards, base, detail.nearStep, detail.nearStep > 1 ? 1.3 : 1);
    addCards(B[1], cards, base, detail.midStep, 1.62);
    // far away: three plain lumps, as bright as the leaves average out to
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1, c = [Math.cos(a) * P.R * 0.35, H + 1.8 + (i === 0 ? 0.8 : 0), Math.sin(a) * P.R * 0.35];
      const g = blob(P.R * 0.75, 0, def.seed + i, 1, 0.8, 1), p = g.attributes.position;
      for (let k = 0; k < p.count; k += 3) {
        const ids = [];
        for (let m = 0; m < 3; m++) {
          const x = p.getX(k + m), y = p.getY(k + m), z = p.getZ(k + m);
          ids.push(B[2].solid([x + c[0], y + c[1], z + c[2]], norm([x, y / 0.8 + P.R * 0.2, z]), mul(base, 0.5 + 0.22 * clamp((y + c[1] - y0) / (y1 - y0), 0, 1))));
        }
        B[2].idx.push(ids[0], ids[1], ids[2]);
      }
      g.dispose();
    }
  } else if (def.kind === 'shrub') {
    const dark = (k) => (w) => mul(base, k + 0.14 * clamp(w[1] / 2, 0, 1));
    core(B[0], P.blobs, 0.74, 1, dark(0.27));
    core(B[1], P.blobs, 0.84, 0, dark(0.38));
    const cards = leafCards(P.blobs, 0.74, rng, false);
    addCards(B[0], cards, base, detail.nearStep, detail.nearStep > 1 ? 1.3 : 1);
    addCards(B[1], cards, base, detail.midStep, 1.62);
    const g = blob(1.3, 0, def.seed, 1.2, 0.7, 1.2), p = g.attributes.position;
    for (let k = 0; k < p.count; k += 3) {
      const ids = [];
      for (let m = 0; m < 3; m++) { const x = p.getX(k + m), y = p.getY(k + m), z = p.getZ(k + m); ids.push(B[2].solid([x, y + 0.8, z], norm([x, y + 0.5, z]), mul(base, 0.6))); }
      B[2].idx.push(ids[0], ids[1], ids[2]);
    }
    g.dispose();
  } else {
    // conifer: a dark spire, and whorls of drooping boughs getting shorter toward the top
    const H = P.H, top = P.top;
    limb(B[0], [0, -0.2, 0], [0, 1.9, 0], 0.24, 0.17, 8, 2, bark, 0.4, def.seed);
    limb(B[1], [0, -0.2, 0], [0, 1.9, 0], 0.24, 0.17, 5, 1, bark, 0, def.seed);
    limb(B[2], [0, -0.2, 0], [0, 1.5, 0], 0.2, 0.15, 4, 1, bark, 0, def.seed);
    const spire = (b, sides, r, y0, colK) => {
      const tip = b.solid([0, top - 0.3, 0], [0, 1, 0], mul(base, colK * 1.2));
      const ring = [];
      for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; ring.push(b.solid([Math.cos(a) * r, y0, Math.sin(a) * r], norm([Math.cos(a), 0.42, Math.sin(a)]), mul(base, colK))); }
      for (let k = 0; k < sides; k++) b.idx.push(ring[k], tip, ring[(k + 1) % sides]);
    };
    spire(B[0], 9, 0.95, 1.3, 0.42);
    spire(B[1], 6, 1.05, 1.3, 0.46);
    spire(B[2], 6, 1.9, 1.0, 0.62);
    const K = 11, boughs = [];
    for (let k = 0; k < K; k++) {
      const f = k / (K - 1), y = 1.45 + Math.pow(f, 0.92) * (top - 2.3), r = 2.15 * Math.pow(1 - f, 0.8) + 0.26;
      const n = Math.max(5, Math.round(14 - 8 * f));
      for (let m = 0; m < n; m++) {
        const a = ((m + (k % 2) * 0.5) / n) * Math.PI * 2 + (rng() - 0.5) * 0.36;
        boughs.push({ a, y: y + (rng() - 0.5) * 0.3, len: r * (0.84 + rng() * 0.3), droop: 0.12 + 0.3 * (1 - f) + (rng() - 0.5) * 0.14, f, tw: (rng() - 0.5) * 0.7, tone: 0.84 + rng() * 0.32, phase: 0.08 + rng() * 0.9, cell: rng() < 0.5 ? 0 : 1 });
      }
    }
    const addBoughs = (b, step, grow) => {
      for (let i = 0; i < boughs.length; i += step) {
        const g = boughs[i], ca = Math.cos(g.a), sa = Math.sin(g.a);
        const side = [-sa, 0, ca], ct = Math.cos(g.tw), st = Math.sin(g.tw);
        const w = g.len * 0.45 * grow, tone = (0.8 + 0.3 * g.f) * g.tone;
        // three rows: it leaves the trunk nearly level and droops toward its tip
        const rows = [[0, 0, 0.45, 0.42], [0.55, Math.sin(g.droop * 0.7) * 0.55, 1, 0.8], [1.03, Math.sin(g.droop * 0.7) * 0.55 + Math.sin(g.droop * 1.5) * 0.48, 0.7, 1.12]];
        const ids = rows.map(([t, drop, wide, lit], ri) => [-1, 1].map((sgn) => b.vert(
          [ca * g.len * t + side[0] * w * wide * sgn * ct, g.y - g.len * drop + st * w * wide * sgn, sa * g.len * t + side[2] * w * wide * sgn * ct],
          norm([ca * (0.35 + 0.3 * t) + side[0] * sgn * 0.25, 0.85, sa * (0.35 + 0.3 * t) + side[2] * sgn * 0.25]),
          mul(base, tone * lit), g.cell / 2 + (sgn + 1) / 4, ri === 0 ? 0 : ri === 1 ? 0.52 : 1, g.phase)));
        b.quad(ids[0][0], ids[0][1], ids[1][1], ids[1][0]);
        b.quad(ids[1][0], ids[1][1], ids[2][1], ids[2][0]);
      }
    };
    addBoughs(B[0], 1, 1);
    addBoughs(B[1], 2, 1.45);
    // the leader: two crossed sprays standing up
    for (const b of [B[0], B[1]]) for (let i = 0; i < 2; i++) {
      const sx = i ? [1, 0, 0] : [0, 0, 1], h = 1.35, w = 0.36, y = top - 1.15;
      const ids = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sg, t]) => b.vert([sx[0] * w * sg, y + h * t, sx[2] * w * sg], norm([sx[2] * 0.4, 0.9, sx[0] * 0.4]), mul(base, 0.8 + 0.3 * t), (sg + 1) / 4, t, 0.5));
      b.quad(ids[0], ids[1], ids[2], ids[3]);
    }
    void H;
  }
  return B.map((b) => b.geometry());
}

// ---------------- material ----------------
function foliageMaterial(tex, quality) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: CUT, side: THREE.DoubleSide, vertexColors: true });
  mat.alphaToCoverage = !!(quality.post && quality.msaa);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;\nattribute float aLeaf;\nvarying float vLeaf;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // the whole tree leans with the gusts; its leaves shiver on their own
          vec3 ip = vec3( instanceMatrix[ 3 ][ 0 ], 0.0, instanceMatrix[ 3 ][ 2 ] );
          float k = clamp( position.y / 12.0, 0.0, 1.0 ); k *= k;
          float ph = uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17;
          float s = sin( ph ) * 0.6 + sin( ph * 2.3 + 1.7 ) * 0.3;
          transformed.x += s * 0.18 * k * ( 0.4 + uWind );
          transformed.z += cos( ph * 0.9 ) * 0.108 * k * ( 0.4 + uWind );
          float fl = step( 0.01, aLeaf );
          float fp = uTime * ( 2.4 + aLeaf * 2.2 ) + aLeaf * 43.0 + ip.x + uv.x * 5.0 + uv.y * 3.0;
          transformed += normal * ( sin( fp ) * 0.035 + sin( fp * 2.7 ) * 0.014 ) * ( 0.25 + uWind ) * fl;
          vLeaf = aLeaf;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf;')
      .replace('#include <alphatest_fragment>', `{
	// a card seen edge-on would show as a streak: let it thin away instead
	float hfCard = step( 0.01, vLeaf );
	vec3 hfFace = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
	diffuseColor.a *= mix( 1.0, smoothstep( 0.06, 0.34, abs( dot( hfFace, normalize( vViewPosition ) ) ) ), hfCard );
	// a canopy opens up around the camera instead of pressing leaves against the lens
	float hfClose = smoothstep( 0.5, 2.4, length( vViewPosition ) );
	if ( abs( vLeaf ) > 0.005 && hfClose < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;
}
#include <alphatest_fragment>`);
    leafLight(sh, 'step( 0.01, vLeaf )');
  };
  mat.customProgramCacheKey = () => 'holdfast-foliage' + (GFX.ready ? 1 : 0);
  return mat;
}

export class Trees {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.items = KINDS.map(() => []); // per archetype: {x, y, z, r, s, col, canopy}
    this.setRange(quality);
  }
  setRange(quality) {
    this.farDist = quality.trees || 170;
    this.nearDist = this.farDist * 0.34;
    this.cullDist = quality.viewDistance + 40;
    if (this.lastPos) this.lastPos.set(1e9, 0, 0);
  }
  add(x, y, z, kindIdx, scale, rng) {
    const col = new THREE.Color(1, 1, 1);
    col.setRGB(0.82 + rng() * 0.3, 0.82 + rng() * 0.3, 0.8 + rng() * 0.25);
    this.items[kindIdx].push({ x, y, z, r: rng() * Math.PI * 2, s: scale, col, canopy: canopyRadius(kindIdx) });
  }
  get total() { return this.items.reduce((a, l) => a + l.length, 0); }
  build() {
    const q = this.quality, low = q.level === 'low';
    const detail = { nearStep: low ? 2 : 1, midStep: low ? 5 : 3, midCore: 0 };
    const broad = foliageMaterial(leafTexture(), q), conifer = foliageMaterial(firTexture(), q);
    const reach = q.cascades[q.cascades.length - 1].range;
    this.meshes = [];
    KINDS.forEach((k, i) => {
      const list = this.items[i];
      if (!list.length) return;
      const geos = makeTree(k, planOf(i), detail);
      const lods = geos.map((g, l) => {
        const m = new THREE.InstancedMesh(g, k.kind === 'cedar' ? conifer : broad, list.length);
        m.castShadow = l < 2 || reach > this.farDist;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.name = 'tree' + i + '_' + l;
        // a shadow map that reaches none of this mesh's trees need not draw them
        // and the widest map takes every tree as the plain far lumps (they are appended to that mesh's instances)
        m.onBeforeShadow = (r, o, cam, shadowCam) => {
          o.userData.count = o.count;
          if (shadowCam.userData.wide) o.count = l === 2 ? o.userData.all : 0;
          else if (o.userData.near > shadowCam.right * 1.45 + this.slack) o.count = 0;
        };
        m.onAfterShadow = (r, o) => { o.count = o.userData.count; };
        this.scene.add(m);
        return m;
      });
      this.meshes.push({ lods, list });
    });
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.lastFocus = new THREE.Vector3(1e9, 0, 0);
    this.slack = 30;
  }
  // hide trees inside a rect (build mode keeps the view clear); null shows all
  setHidden(rect) { this.hiddenRect = rect; this.lastPos.set(1e9, 0, 0); }
  // focus: what the shadow maps are centred on (the player, or where the top view looks)
  update(camPos, focus = camPos, lightDir = null) {
    // (a low sun throws a tree's shadow a long way: allow for it)
    if (lightDir) this.slack = Math.min(170, 14 / Math.max(0.08, lightDir.y / Math.max(0.05, Math.hypot(lightDir.x, lightDir.z))));
    if (camPos.distanceToSquared(this.lastPos) < 16 && focus.distanceToSquared(this.lastFocus) < 16) return;
    const hr = this.hiddenRect;
    this.lastPos.copy(camPos); this.lastFocus.copy(focus);
    const n2 = this.nearDist * this.nearDist, f2 = this.farDist * this.farDist, c2 = this.cullDist * this.cullDist;
    const v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const { lods, list } of this.meshes) {
      const n = [0, 0, 0], near = [1e12, 1e12, 1e12], closer = [];
      for (const t of list) {
        if (hr && t.x > hr[0] && t.x < hr[2] && t.z > hr[1] && t.z < hr[3]) continue;
        const dx = t.x - camPos.x, dz = t.z - camPos.z, dy = t.y - camPos.y;
        const dd = dx * dx + dz * dz + dy * dy * 0.25;
        if (dd > c2) continue;
        const l = dd < n2 ? 0 : dd < f2 ? 1 : 2, m = lods[l];
        this.q.setFromAxisAngle(up, t.r);
        v.set(t.x, t.y, t.z); s.setScalar(t.s);
        this.m4.compose(v, this.q, s);
        m.setMatrixAt(n[l], this.m4); m.setColorAt(n[l], t.col); n[l]++;
        const fx = t.x - focus.x, fz = t.z - focus.z;
        near[l] = Math.min(near[l], fx * fx + fz * fz);
        if (l < 2) closer.push(t);
      }
      // the nearer trees again, as lumps, after the far ones (only the widest shadow map draws these)
      let all = n[2];
      for (const t of closer) {
        this.q.setFromAxisAngle(up, t.r);
        v.set(t.x, t.y, t.z); s.setScalar(t.s);
        lods[2].setMatrixAt(all++, this.m4.compose(v, this.q, s));
      }
      lods[2].userData.all = all;
      lods.forEach((m, l) => {
        m.count = n[l];
        m.visible = n[l] > 0 || (l === 2 && all > 0);
        m.userData.near = Math.sqrt(near[l]);
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });
    }
  }
}
