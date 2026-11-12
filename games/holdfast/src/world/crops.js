// Corn and soybeans. Each row is drawn three ways at once so a field holds up
// from anywhere: upright cards along the row (the side you see walking past),
// cards across it (what you see looking down the rows) and a strip of leaves
// lying flat near the top (what you see from a hill, or from the top view).
import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { plantMaterial } from './vegetation.js';
import { cutoutTexture, canvasCutout } from '../gfx/alphamips.js';
import { nearShadowsOnly } from '../gfx/shadows.js';

const CUT = 0.4;
const rgb = (c, k = 1) => `rgb(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))})`;
function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.lineCap = 'round'; return [cv, c]; }
const finish = (cv) => cutoutTexture(canvasCutout(cv), cv.width, cv.height, CUT, { repeatX: true, anisotropy: 8 });

// late-season corn: gold above, drying to tan below
const CORN = { stalk: [170, 158, 96], green: [150, 162, 82], gold: [186, 180, 92], dry: [192, 162, 100], tassel: [210, 190, 132], husk: [206, 192, 130] };
const ROW = 2.4; // metres of row one corn texture covers

// six plants seen from the side (2.4 m of row, 2.7 m tall); wraps along the row
function cornSide(scale) {
  const W = Math.round(1024 * scale), H = Math.round(1024 * scale), [cv, c] = canvas(W, H);
  const rng = mulberry32(4242);
  const plants = [];
  for (let p = 0; p < 6; p++) {
    const leaves = [];
    for (let l = 0; l < 12; l++) {
      const t = 0.1 + (l / 12) * 0.8 + rng() * 0.03;
      leaves.push({ t, dir: (l + p) % 2 ? 1 : -1, len: W * (0.15 + rng() * 0.09) * (1 - Math.abs(t - 0.5) * 0.5), rise: 0.25 + rng() * 0.3, droop: (0.15 + rng() * 0.5) * (1.15 - t), tone: 0.8 + rng() * 0.32, dry: rng() < 0.78 - t * 0.75 });
    }
    plants.push({
      x: ((p + 0.5) / 6) * W + (rng() - 0.5) * W * 0.05, top: H * (0.09 + rng() * 0.13), lean: (rng() - 0.5) * W * 0.04, tone: 0.86 + rng() * 0.26, leaves,
      ears: rng() < 0.6 ? [0.42 + rng() * 0.06, 0.53 + rng() * 0.06] : [0.46 + rng() * 0.08],
      tassel: Array.from({ length: 9 }, () => [(rng() - 0.5) * 0.085, 0.4 + rng() * 0.6]),
    });
  }
  for (const dx of [-W, 0, W]) for (const P of plants) {
    const x0 = P.x + dx, at = (t) => [x0 + P.lean * t * t, H - t * (H - P.top)];
    c.strokeStyle = rgb(CORN.stalk, P.tone); c.lineWidth = W * 0.011;
    c.beginPath(); c.moveTo(x0, H); c.quadraticCurveTo(x0, H * 0.5, ...at(0.97)); c.stroke();
    const [tx, ty] = at(0.96);
    c.strokeStyle = rgb(CORN.tassel, P.tone); c.lineWidth = W * 0.0042;
    for (const [sx, sy] of P.tassel) { c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + sx * W * 0.4, ty - H * 0.03, tx + sx * W, ty - H * 0.075 * sy); c.stroke(); }
    for (const L of P.leaves) {
      const [bx, by] = at(L.t), d = L.dir, len = L.len, rise = len * L.rise, w = H * 0.021;
      const tipX = bx + d * len, tipY = by - rise * 0.4 + len * L.droop;
      const col = L.dry ? CORN.dry : L.t > 0.55 ? CORN.gold : CORN.green;
      const gr = c.createLinearGradient(bx, by, tipX, tipY);
      gr.addColorStop(0, rgb(col, L.tone * P.tone * 0.8)); gr.addColorStop(1, rgb(col, L.tone * P.tone * 1.08));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(bx, by - w * 0.3);
      c.quadraticCurveTo(bx + d * len * 0.45, by - rise * 1.8, tipX, tipY);
      c.quadraticCurveTo(bx + d * len * 0.42, by - rise * 1.8 + w * 2.6, bx, by + w * 0.9);
      c.fill();
      c.strokeStyle = 'rgba(236,224,164,0.5)'; c.lineWidth = W * 0.0022;
      c.beginPath(); c.moveTo(bx, by + w * 0.2); c.quadraticCurveTo(bx + d * len * 0.44, by - rise * 1.8 + w * 1.2, tipX, tipY); c.stroke();
    }
    P.ears.forEach((t, i) => {
      const [ex, ey] = at(t), d = i % 2 ? 1 : -1;
      c.save(); c.translate(ex + d * W * 0.013, ey); c.rotate(d * 0.33);
      c.fillStyle = rgb(CORN.husk, P.tone);
      c.beginPath(); c.ellipse(0, 0, W * 0.012, H * 0.046, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(112,72,42,0.9)'; c.lineWidth = W * 0.003;
      for (let s = -1; s <= 1; s++) { c.beginPath(); c.moveTo(0, -H * 0.044); c.lineTo(s * W * 0.008, -H * 0.066); c.stroke(); }
      c.restore();
    });
  }
  return finish(cv);
}
// the same six plants from straight above: whorls of long leaves (2.4 m of row, 1 m across)
function cornTop(scale) {
  const W = Math.round(512 * scale), H = Math.round(256 * scale), [cv, c] = canvas(W, H);
  const rng = mulberry32(977), px = W / ROW, py = H / 1.0;
  const plants = [];
  for (let p = 0; p < 6; p++) {
    const leaves = [];
    for (let l = 0; l < 8; l++) leaves.push({ a: (l / 8) * Math.PI * 2 + rng() * 0.7, len: 0.26 + rng() * 0.2, bend: (rng() - 0.5) * 0.5, tone: 0.78 + rng() * 0.34, col: rng() < 0.3 ? CORN.dry : rng() < 0.6 ? CORN.gold : CORN.green });
    leaves.sort((a, b) => a.tone - b.tone);
    plants.push({ x: ((p + 0.5) / 6) * W + (rng() - 0.5) * W * 0.05, y: H / 2 + (rng() - 0.5) * H * 0.1, leaves });
  }
  for (const dx of [-W, 0, W]) for (const P of plants) {
    const x0 = P.x + dx;
    for (const L of P.leaves) {
      const ca = Math.cos(L.a), sa = Math.sin(L.a), tx = x0 + ca * L.len * px, ty = P.y + sa * L.len * py;
      const nx = -sa * px, ny = ca * py, w = 0.028, mx = x0 + ca * L.len * 0.5 * px + nx * L.bend * 0.2, my = P.y + sa * L.len * 0.5 * py + ny * L.bend * 0.2;
      const gr = c.createLinearGradient(x0, P.y, tx, ty);
      gr.addColorStop(0, rgb(L.col, L.tone * 0.7)); gr.addColorStop(1, rgb(L.col, L.tone * 1.06));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(x0, P.y);
      c.quadraticCurveTo(mx + nx * w * 1.6, my + ny * w * 1.6, tx, ty);
      c.quadraticCurveTo(mx - nx * w * 1.6, my - ny * w * 1.6, x0, P.y);
      c.fill();
      c.strokeStyle = 'rgba(236,224,164,0.45)'; c.lineWidth = Math.max(1, W * 0.003);
      c.beginPath(); c.moveTo(x0, P.y); c.quadraticCurveTo(mx, my, tx, ty); c.stroke();
    }
    c.fillStyle = rgb(CORN.tassel);
    c.beginPath(); c.arc(x0, P.y, W * 0.012, 0, Math.PI * 2); c.fill();
  }
  return finish(cv);
}

// soybeans turning: mostly green still, yellow coming, a few gone brown
const BEAN_ROW = 2; // metres of row one bean texture covers
function beanLeaf(c, x, y, rx, ry, rot, col, tone) {
  c.save(); c.translate(x, y); c.rotate(rot);
  const gr = c.createLinearGradient(-rx, 0, rx, 0);
  gr.addColorStop(0, rgb(col, tone * 0.78)); gr.addColorStop(1, rgb(col, tone * 1.05));
  c.fillStyle = gr;
  c.beginPath(); c.moveTo(-rx, 0); c.quadraticCurveTo(0, -ry * 1.5, rx, 0); c.quadraticCurveTo(0, ry * 1.5, -rx, 0); c.fill();
  c.restore();
}
const beanCol = (r) => (r < 0.62 ? [104, 146, 62] : r < 0.9 ? [176, 172, 78] : [150, 122, 70]);
// a row from the side: a low ragged hedge of small leaves (2 m of row, 0.62 m tall)
function beanSide(scale) {
  const W = Math.round(512 * scale), H = Math.round(256 * scale), [cv, c] = canvas(W, H);
  const rng = mulberry32(3131), leaves = [];
  for (let i = 0; i < 480; i++) {
    const x = rng() * W, top = 0.7 + 0.2 * Math.sin((x / W) * Math.PI * 6 + 1) * Math.sin((x / W) * Math.PI * 2) + 0.06 * Math.sin((x / W) * Math.PI * 14);
    const h = Math.pow(rng(), 0.6) * top;
    leaves.push({ x, y: H - h * H * 0.94 - H * 0.02, rx: W * (0.019 + rng() * 0.01), ry: W * (0.012 + rng() * 0.007), rot: (rng() - 0.5) * 2.4, col: beanCol(rng()), tone: (0.62 + rng() * 0.2) + 0.26 * (h / top) });
  }
  leaves.sort((a, b) => a.tone - b.tone);
  for (const dx of [-W, 0, W]) for (const L of leaves) beanLeaf(c, L.x + dx, L.y, L.rx, L.ry, L.rot, L.col, L.tone);
  return finish(cv);
}
// and from above: a band of leaves, thick down the middle (2 m of row, 0.66 m across)
function beanTop(scale) {
  const W = Math.round(512 * scale), H = Math.round(128 * scale), [cv, c] = canvas(W, H);
  const rng = mulberry32(5151), leaves = [];
  for (let i = 0; i < 520; i++) {
    const off = (rng() + rng() + rng() - 1.5) / 1.5; // bunched toward the middle
    leaves.push({ x: rng() * W, y: H / 2 + off * H * 0.42, rx: W * (0.019 + rng() * 0.01), ry: W * (0.013 + rng() * 0.007), rot: rng() * Math.PI, col: beanCol(rng()), tone: 0.66 + rng() * 0.44 });
  }
  leaves.sort((a, b) => a.tone - b.tone);
  for (const dx of [-W, 0, W]) for (const L of leaves) beanLeaf(c, L.x + dx, L.y, L.rx, L.ry, L.rot, L.col, L.tone);
  return finish(cv);
}

class Quads {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.nor = []; this.sway = []; this.idx = []; }
  // four corners [x, y, z], their uvs, shade and sway (0 rooted, 1 free), and one normal
  add(p, uv, shade, sway, n, tint) {
    const b = this.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k][0], p[k][1], p[k][2]); this.uv.push(uv[k][0], uv[k][1]);
      this.col.push(tint[0] * shade[k], tint[1] * shade[k], tint[2] * shade[k]);
      this.nor.push(n[0], n[1], n[2]); this.sway.push(sway[k]);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(mat, shadow) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
}

export function buildCrops(scene, fields, terrain, quality) {
  const group = new THREE.Group();
  group.name = 'crops';
  const low = quality.level === 'low', scale = (quality.texSize || 512) / 512;
  const sway = { sway: 'aSway', pars: 'attribute float aSway;' };
  let mats = null;
  const materials = () => mats || (mats = {
    cornSide: plantMaterial(cornSide(scale), quality, { alphaTest: CUT, amp: 0.13, ...sway }),
    cornTop: plantMaterial(cornTop(scale), quality, { alphaTest: CUT, amp: 0.13, ...sway }),
    beanSide: plantMaterial(beanSide(scale), quality, { alphaTest: CUT, amp: 0.03, ...sway }),
    beanTop: plantMaterial(beanTop(scale), quality, { alphaTest: CUT, amp: 0.03, ...sway }),
  });
  for (const f of fields) {
    if (f.crop !== 'corn' && f.crop !== 'beans') continue;
    const corn = f.crop === 'corn', M = materials();
    const H = corn ? 2.55 : 0.56, gap = corn ? (low ? 1.3 : 0.95) : (low ? 1.14 : 0.76), seg = corn ? ROW : 4, rep = corn ? ROW : BEAN_ROW;
    const half = corn ? 0.5 : 0.33, topAt = corn ? 0.74 : 0.8;
    const rng = mulberry32(Math.floor(f.x0 * 13 + f.z0 * 7));
    const alongX = f.rows === 'x';
    const L = alongX ? f.x1 - f.x0 : f.z1 - f.z0, Wd = alongX ? f.z1 - f.z0 : f.x1 - f.x0;
    const P = (a, b) => (alongX ? [f.x0 + a, f.z0 + b] : [f.x0 + b, f.z0 + a]);
    const at = (a, b, up) => { const [x, z] = P(a, b); return [x, terrain.height(x, z) - 0.05 + up, z]; };
    const side = new Quads(), top = new Quads();
    const up = [0, 1, 0];
    for (let r = gap / 2 + 0.5; r < Wd - 0.5; r += gap) {
      const rowTone = 0.9 + rng() * 0.2, off = rng();
      for (let a = 0.5; a < L - 0.5; a += seg) {
        const a1 = Math.min(L - 0.5, a + seg), h = H * (0.9 + rng() * 0.2), k = rowTone * (0.92 + rng() * 0.16);
        const tint = corn ? [k * (0.98 + rng() * 0.06), k, k * 0.94] : [k, k, k * 0.96];
        const u0 = a / rep + off, u1 = a1 / rep + off;
        // along the row
        side.add([at(a, r, 0), at(a1, r, 0), at(a1, r, h), at(a, r, h)], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [0.5, 0.5, 1, 1], [0, 0, 1, 1], up, tint);
        // lying across the top of it
        const y = h * topAt;
        top.add([at(a, r - half, y), at(a1, r - half, y), at(a1, r + half, y), at(a, r + half, y)], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [0.95, 0.95, 0.95, 0.95], [topAt, topAt, topAt, topAt], up, tint);
        if (corn) {
          // and across the row, so looking down the rows isn't looking at edges
          for (let am = a + 0.3 + rng() * 0.5; am < a1; am += (low ? 2.3 : 1.15) + rng() * 0.2) {
            const v0 = rng();
            side.add([at(am, r - 0.52, 0), at(am, r + 0.52, 0), at(am, r + 0.52, h * 0.97), at(am, r - 0.52, h * 0.97)], [[v0, 0], [v0 + 1.04 / ROW, 0], [v0 + 1.04 / ROW, 1], [v0, 1]], [0.5, 0.5, 1, 1], [0, 0, 1, 1], up, tint);
          }
        }
      }
    }
    for (const m of [side.mesh(corn ? M.cornSide : M.beanSide, corn), top.mesh(corn ? M.cornTop : M.beanTop, false)]) if (m) { nearShadowsOnly(m); group.add(m); }
  }
  scene.add(group);
  return group;
}
