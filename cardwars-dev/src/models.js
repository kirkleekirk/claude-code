/* MODELS */
// Procedural low-poly models, kept simple like the show's holograms but matching their model sheets.
// A Builder records triangles (position, normal, color, outline normal, bone, glow) under a transform stack.
// Recipes build a model facing +z with its feet on y = 0. Bones animate legs, arms, heads and tails.
var Models = (function () {
'use strict';
const M4 = GL3.M4, rgb = GL3.hexRGB;
const STRIDE = 14;
const D2R = Math.PI / 180;

function Builder() {
  this.a = []; this.m = M4.create(); this.st = []; this.col = [1, 1, 1]; this.bone = 0; this.glow = 0;
  this.chans = []; this.nm = new Float32Array(9); this.flip = false; this.dirty = true; this.tmp = M4.create();
}
const B = Builder.prototype;
B.push = function () { this.st.push(new Float32Array(this.m)); return this; };
B.pop = function () { this.m = this.st.pop(); this.dirty = true; return this; };
B.T = function (x, y, z) { M4.mul(this.m, this.m, M4.trs(this.tmp, x, y, z, 0, 0, 0, 1, 1, 1)); this.dirty = true; return this; };
B.R = function (rx, ry, rz) { M4.mul(this.m, this.m, M4.trs(this.tmp, 0, 0, 0, (ry || 0) * D2R, (rx || 0) * D2R, (rz || 0) * D2R, 1, 1, 1)); this.dirty = true; return this; };
B.S = function (x, y, z) { M4.mul(this.m, this.m, M4.trs(this.tmp, 0, 0, 0, 0, 0, 0, x, y == null ? x : y, z == null ? x : z)); this.dirty = true; return this; };
B.c = function (h) { this.col = rgb(h); return this; };
B.g = function (on) { this.glow = on ? 1 : 0; return this; };
B.b = function (i) { this.bone = i; return this; };
// animation channel: bone i rotates about pivot p; kind = leg|arm|tail|head|wing|sway|spin|bounce
B.ch = function (bone, px, py, pz, kind, axis, amp, phase, speed) { this.chans.push({ bone, p: [px, py, pz], kind, axis: axis || 'x', amp: amp || 20, ph: phase || 0, sp: speed || 1 }); return this; };
B.at = function (x, y, z, fn) { this.push(); this.T(x, y, z); fn(this); this.pop(); return this; };

B._nm = function () {
  const m = this.m;
  const a00 = m[0], a10 = m[1], a20 = m[2], a01 = m[4], a11 = m[5], a21 = m[6], a02 = m[8], a12 = m[9], a22 = m[10];
  const c00 = a11 * a22 - a12 * a21, c01 = -(a10 * a22 - a12 * a20), c02 = a10 * a21 - a11 * a20;
  const c10 = -(a01 * a22 - a02 * a21), c11 = a00 * a22 - a02 * a20, c12 = -(a00 * a21 - a01 * a20);
  const c20 = a01 * a12 - a02 * a11, c21 = -(a00 * a12 - a02 * a10), c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const s = det < 0 ? -1 : 1;
  const n = this.nm;
  n[0] = c00 * s; n[1] = c01 * s; n[2] = c02 * s; n[3] = c10 * s; n[4] = c11 * s; n[5] = c12 * s; n[6] = c20 * s; n[7] = c21 * s; n[8] = c22 * s;
  this.flip = det < 0; this.dirty = false;
};
B._push = function (p, n, o) {
  const m = this.m, k = this.nm;
  const x = p[0], y = p[1], z = p[2];
  let nx = k[0] * n[0] + k[1] * n[1] + k[2] * n[2], ny = k[3] * n[0] + k[4] * n[1] + k[5] * n[2], nz = k[6] * n[0] + k[7] * n[1] + k[8] * n[2];
  let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  let ox = k[0] * o[0] + k[1] * o[1] + k[2] * o[2], oy = k[3] * o[0] + k[4] * o[1] + k[5] * o[2], oz = k[6] * o[0] + k[7] * o[1] + k[8] * o[2];
  l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l;
  this.a.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
    nx, ny, nz, this.col[0], this.col[1], this.col[2], ox, oy, oz, this.bone, this.glow);
};
// Triangle in local space. ref = intended outward direction (winding is fixed to match it).
B.tri = function (p0, p1, p2, n0, n1, n2, o0, o1, o2, ref) {
  if (this.dirty) this._nm();
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (Math.abs(cx) + Math.abs(cy) + Math.abs(cz) < 1e-10) return;
  const r = ref || [n0[0] + n1[0] + n2[0], n0[1] + n1[1] + n2[1], n0[2] + n1[2] + n2[2]];
  let swap = cx * r[0] + cy * r[1] + cz * r[2] < 0;
  if (this.flip) swap = !swap;
  if (swap) { this._push(p0, n0, o0); this._push(p2, n2, o2); this._push(p1, n1, o1); }
  else { this._push(p0, n0, o0); this._push(p1, n1, o1); this._push(p2, n2, o2); }
};
B.quad = function (a, b, c, d, n, oa, ob, oc, od) {
  this.tri(a, b, c, n, n, n, oa || n, ob || n, oc || n, n);
  this.tri(a, c, d, n, n, n, oa || n, oc || n, od || n, n);
};
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------------------------------------------------------- primitives (centered at the origin)
B.box = function (w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = (sx, sy, sz) => [sx * x, sy * y, sz * z], O = (sx, sy, sz) => nrm([sx, sy, sz]);
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], [1, 0, 0]], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, 0, 0]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [0, 1, 0]], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [0, -1, 0]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]]];
  for (const f of faces) this.quad(P(...f[0]), P(...f[1]), P(...f[2]), P(...f[3]), f[4], O(...f[0]), O(...f[1]), O(...f[2]), O(...f[3]));
  return this;
};
B.ell = function (rx, ry, rz, seg, rings) {
  seg = seg || 12; rings = rings || 8;
  const V = [];
  for (let i = 0; i <= rings; i++) {
    const th = Math.PI * i / rings, row = [];
    for (let j = 0; j <= seg; j++) {
      const ph = 2 * Math.PI * j / seg;
      const p = [rx * Math.sin(th) * Math.cos(ph), ry * Math.cos(th), rz * Math.sin(th) * Math.sin(ph)];
      row.push({ p, n: nrm([p[0] / (rx * rx), p[1] / (ry * ry), p[2] / (rz * rz)]) });
    }
    V.push(row);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = V[i][j], b = V[i + 1][j], c = V[i + 1][j + 1], d = V[i][j + 1];
    this.tri(a.p, b.p, c.p, a.n, b.n, c.n, a.n, b.n, c.n);
    this.tri(a.p, c.p, d.p, a.n, c.n, d.n, a.n, c.n, d.n);
  }
  return this;
};
B.sph = function (r, seg, rings) { return this.ell(r, r, r, seg, rings); };
// Lathe: profile = [[r, y], ...] bottom to top, revolved around y.
B.lathe = function (prof, seg, opts) {
  seg = seg || 12; opts = opts || {};
  const n = prof.length, N = [];
  for (let i = 0; i < n; i++) {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
    const dy = b[1] - a[1], dr = b[0] - a[0];
    N.push(nrm([dy, -dr, 0]));
  }
  const ring = (i, j) => { const ph = 2 * Math.PI * j / seg, c = Math.cos(ph), s = Math.sin(ph); return { p: [prof[i][0] * c, prof[i][1], prof[i][0] * s], n: nrm([N[i][0] * c, N[i][1], N[i][0] * s]) }; };
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = ring(i, j), b = ring(i + 1, j), c = ring(i + 1, j + 1), d = ring(i, j + 1);
    const flat = opts.flat;
    this.tri(a.p, b.p, c.p, a.n, b.n, c.n, a.n, b.n, c.n, flat ? null : undefined);
    this.tri(a.p, c.p, d.p, a.n, c.n, d.n, a.n, c.n, d.n);
  }
  const cap = (i, up) => {
    if (prof[i][0] <= 1e-4) return;
    const y = prof[i][1], cN = [0, up ? 1 : -1, 0];
    for (let j = 0; j < seg; j++) {
      const a = ring(i, j), b = ring(i, j + 1);
      this.tri([0, y, 0], a.p, b.p, cN, cN, cN, cN, nrm([a.n[0], cN[1], a.n[2]]), nrm([b.n[0], cN[1], b.n[2]]), cN);
    }
  };
  if (opts.capBot !== false) cap(0, false);
  if (opts.capTop !== false) cap(n - 1, true);
  return this;
};
B.cyl = function (rTop, rBot, h, seg, opts) { return this.lathe([[rBot, -h / 2], [rTop, h / 2]], seg || 12, opts); };
B.cone = function (r, h, seg) { return this.lathe([[r, 0], [0, h]], seg || 10); };
// Extrude a 2D polygon (xy, any winding) along z, centered.
B.ext = function (pts, depth) {
  const n = pts.length, d = depth / 2;
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const P = area < 0 ? pts.slice().reverse() : pts;
  const on = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const e1 = nrm([b[1] - a[1], -(b[0] - a[0]), 0]), e2 = nrm([c[1] - b[1], -(c[0] - b[0]), 0]);
    on.push(nrm([e1[0] + e2[0], e1[1] + e2[1], 0]));
  }
  for (const t of earcut(P)) {
    const [i, j, k] = t;
    for (const s of [1, -1]) {
      const z = s * d, N = [0, 0, s];
      const O = q => nrm([on[q][0], on[q][1], s * 0.8]);
      this.tri([P[i][0], P[i][1], z], [P[j][0], P[j][1], z], [P[k][0], P[k][1], z], N, N, N, O(i), O(j), O(k), N);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const N = nrm([b[1] - a[1], -(b[0] - a[0]), 0]);
    const oa = q => nrm([on[q][0], on[q][1], 0]);
    const ia = i, ib = (i + 1) % n;
    this.quad([a[0], a[1], d], [b[0], b[1], d], [b[0], b[1], -d], [a[0], a[1], -d], N,
      nrm([on[ia][0], on[ia][1], 0.8]), nrm([on[ib][0], on[ib][1], 0.8]), nrm([on[ib][0], on[ib][1], -0.8]), nrm([on[ia][0], on[ia][1], -0.8]));
    void oa;
  }
  return this;
};
// Tube along a 3D polyline (radius r or per-point radii).
B.tube = function (pts, r, seg) {
  seg = seg || 6;
  const n = pts.length, R = Array.isArray(r) ? r : pts.map(() => r);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let up = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = nrm([t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]);
    const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    frames.push({ u, v, t });
  }
  const ring = (i, j) => { const ph = 2 * Math.PI * j / seg, c = Math.cos(ph), s = Math.sin(ph), f = frames[i]; const nn = [f.u[0] * c + f.v[0] * s, f.u[1] * c + f.v[1] * s, f.u[2] * c + f.v[2] * s]; return { p: [pts[i][0] + nn[0] * R[i], pts[i][1] + nn[1] * R[i], pts[i][2] + nn[2] * R[i]], n: nn }; };
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = ring(i, j), b = ring(i + 1, j), c = ring(i + 1, j + 1), d = ring(i, j + 1);
    this.tri(a.p, b.p, c.p, a.n, b.n, c.n, a.n, b.n, c.n);
    this.tri(a.p, c.p, d.p, a.n, c.n, d.n, a.n, c.n, d.n);
  }
  for (const [i, s] of [[0, -1], [n - 1, 1]]) {
    const f = frames[i], N = [f.t[0] * s, f.t[1] * s, f.t[2] * s];
    for (let j = 0; j < seg; j++) { const a = ring(i, j), b = ring(i, j + 1); this.tri(pts[i], a.p, b.p, N, N, N, N, a.n, b.n, N); }
  }
  return this;
};
B.torus = function (R, r, seg, rs) {
  seg = seg || 16; rs = rs || 6;
  const P = (i, j) => { const a = 2 * Math.PI * i / seg, b = 2 * Math.PI * j / rs; const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]; return { p: [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)], n }; };
  for (let i = 0; i < seg; i++) for (let j = 0; j < rs; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    this.tri(a.p, b.p, c.p, a.n, b.n, c.n, a.n, b.n, c.n); this.tri(a.p, c.p, d.p, a.n, c.n, d.n, a.n, c.n, d.n);
  }
  return this;
};
// Glowing detail line (the show's bright inner lines: windows, bricks, seams).
B.line = function (x1, y1, z1, x2, y2, z2, w) {
  w = w || 0.025;
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz);
  if (L < 1e-6) return this;
  const g = this.glow; this.glow = 1;
  this.push(); this.T((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  const yaw = Math.atan2(dx, dz) / D2R, pitch = -Math.asin(dy / L) / D2R;
  this.R(pitch, yaw, 0); this.box(w, w, L);
  this.pop(); this.glow = g;
  return this;
};
// Flat ring of glowing dots/windows etc. helpers
B.eye = function (x, y, z, r, white, pupil) {
  this.at(x, y, z, b => { b.c(white || '#ffffff').g(1).sph(r, 8, 6); b.c(pupil || '#111111').T(0, 0, r * 0.55).sph(r * 0.55, 8, 6); b.g(0); });
  return this;
};
B.finish = function (meta) {
  const data = new Float32Array(this.a);
  let minY = 1e9, maxY = -1e9, maxR = 0;
  for (let i = 0; i < data.length; i += STRIDE) { const y = data[i + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; maxR = Math.max(maxR, Math.hypot(data[i], data[i + 2])); }
  return Object.assign({ data, count: data.length / STRIDE, chans: this.chans, h: maxY - Math.min(0, minY), r: maxR, y0: minY }, meta || {});
};

// Ear clipping triangulation for simple polygons (CCW).
function earcut(P) {
  const n = P.length, idx = []; for (let i = 0; i < n; i++) idx.push(i);
  const out = []; let guard = 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = P[ia], b = P[ib], c = P[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inside(P[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
// Shapes for extrusion
function circlePts(r, n, ox, oy) { const p = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; p.push([(ox || 0) + r * Math.cos(a), (oy || 0) + r * Math.sin(a)]); } return p; }
function starPts(r1, r2, n, ox, oy, rot) { const p = []; for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n + (rot || 0), r = i % 2 ? r2 : r1; p.push([(ox || 0) + r * Math.cos(a), (oy || 0) + r * Math.sin(a)]); } return p; }
function scallopPts(r, bump, n, k) { const p = []; const m = n * (k || 4); for (let i = 0; i < m; i++) { const a = 2 * Math.PI * i / m; const t = (i % (k || 4)) / (k || 4); const rr = r + bump * Math.sin(Math.PI * t); p.push([rr * Math.cos(a), rr * Math.sin(a)]); } return p; }
function arch(w, h, n) { const p = [[-w / 2, 0], [w / 2, 0]]; for (let i = 0; i <= (n || 8); i++) { const a = Math.PI * i / (n || 8); p.push([w / 2 * Math.cos(a), h - w / 2 + w / 2 * Math.sin(a)]); } return p.slice(0, 2).concat(p.slice(2)); }

// ---------------------------------------------------------------- rigs
// Four legs with walk channels (bones 1-4). Legs hang from hip height h at (±x, z front/back).
function legs4(b, x, zf, zb, h, r, col) {
  const L = [[1, -x, zf, 0], [2, x, zf, Math.PI], [3, -x, zb, Math.PI], [4, x, zb, 0]];
  b.push().c(col);
  for (const [bone, lx, lz, ph] of L) { b.b(bone).at(lx, h / 2, lz, q => q.cyl(r * 0.85, r, h, 7)); b.ch(bone, lx, h, lz, 'leg', 'x', 26, ph); }
  b.b(0).pop();
  return b;
}
// Two legs (bones 1,2) and two arms (bones 3,4) for bipeds. Returns hip/shoulder data.
function legs2(b, x, h, r, col, foot) {
  b.push().c(col);
  for (const [bone, lx, ph] of [[1, -x, 0], [2, x, Math.PI]]) {
    b.b(bone).at(lx, h / 2, 0, q => q.cyl(r * 0.9, r, h, 7));
    if (foot) b.at(lx, r * 0.6, r * 0.6, q => q.c(foot).ell(r * 1.3, r * 0.7, r * 1.8, 8, 5)).c(col);
    b.ch(bone, lx, h, 0, 'leg', 'x', 24, ph);
  }
  b.b(0).pop();
  return b;
}
function arm(b, bone, sx, sy, sz, pts, r, col, kind, amp, ph) {
  b.push().c(col).b(bone).tube(pts.map(p => [sx + p[0], sy + p[1], sz + p[2]]), r, 6).b(0).pop();
  b.ch(bone, sx, sy, sz, kind || 'arm', 'x', amp == null ? 18 : amp, ph || 0);
  return b;
}

// ---------------------------------------------------------------- recipes
const R = {};
const T = {};   // per-model tags: { face: 'side'|'front', h: world height }

// ===== BLUE PLAINS =====
R.pig = b => {   // round lavender Pig with a snout and a curly tail (model sheet "Pig")
  const C = '#b79be0', D = '#8f6fc8';
  b.c(C).at(0, 0.48, 0, q => q.ell(0.42, 0.34, 0.52, 14, 9));
  b.b(6).at(0, 0.56, 0.42, q => {
    q.c(C).sph(0.3, 12, 8);
    q.c(D).T(0, -0.02, 0.27).R(90, 0, 0).cyl(0.14, 0.15, 0.12, 12);
    q.c('#4a2f7a').g(1).at(-0.05, -0.02, 0.07, r => r.ell(0.025, 0.035, 0.02, 6, 4)).at(0.05, -0.02, 0.07, r => r.ell(0.025, 0.035, 0.02, 6, 4)).g(0);
  }).ch(6, 0, 0.56, 0.3, 'head', 'x', 6);
  b.b(6).at(0.17, 0.66, 0.6, q => q.c('#1d1240').g(1).sph(0.04, 6, 4).g(0)).at(-0.17, 0.66, 0.6, q => q.c('#1d1240').g(1).sph(0.04, 6, 4).g(0));
  b.c(C).at(-0.15, 0.84, 0.36, q => q.R(-20, 0, 25).cone(0.08, 0.16, 6)).at(0.15, 0.84, 0.36, q => q.R(-20, 0, -25).cone(0.08, 0.16, 6)).b(0);
  legs4(b, 0.2, 0.25, -0.25, 0.22, 0.06, C);
  b.b(5).c(C).tube([[0, 0.6, -0.5], [0, 0.72, -0.62], [0.08, 0.8, -0.58], [0.06, 0.7, -0.52], [0, 0.74, -0.6]], 0.025, 5).ch(5, 0, 0.6, -0.5, 'tail', 'y', 25).b(0);
};
T.pig = { h: 0.42, face: 'side' };
R.cooldog = b => {   // green Cool Dog with shades and tongue out (model sheet "Cool Dog - Special Color")
  const C = '#4f8a25', L = '#b8f24a';
  b.c(C).at(0, 0.5, 0, q => q.ell(0.2, 0.18, 0.46, 12, 8));
  b.b(6).push().T(0, 0.62, 0.38).R(-25, 0, 0);
  b.c(C).cyl(0.11, 0.14, 0.24, 8);
  b.at(0, 0.18, 0.08, q => {
    q.c(C).ell(0.16, 0.14, 0.18, 10, 7);
    q.c(C).at(0, -0.04, 0.2, r => r.R(90, 0, 0).cyl(0.07, 0.11, 0.24, 8));
    q.c('#0f1a08').g(1).at(0, -0.01, 0.34, r => r.sph(0.035, 6, 4)).g(0);
    q.c('#101010').g(1).at(0, 0.04, 0.13, r => r.box(0.34, 0.07, 0.04)).g(0);         // shades
    q.c(L).g(1).at(0, 0.075, 0.15, r => r.box(0.36, 0.015, 0.02)).g(0);
    q.c('#34c7b0').at(0.03, -0.12, 0.26, r => r.R(30, 0, 0).ell(0.04, 0.02, 0.09, 6, 4));   // tongue
    q.c(C).at(-0.1, 0.13, -0.06, r => r.R(-50, 0, 20).cone(0.06, 0.2, 5)).at(0.1, 0.13, -0.06, r => r.R(-50, 0, -20).cone(0.06, 0.2, 5));
  });
  b.pop().ch(6, 0, 0.62, 0.38, 'head', 'x', 7).b(0);
  legs4(b, 0.11, 0.3, -0.3, 0.42, 0.035, C);
  b.b(5).c(C).tube([[0, 0.55, -0.44], [0, 0.7, -0.56], [0, 0.82, -0.58]], 0.025, 5).ch(5, 0, 0.55, -0.44, 'tail', 'y', 30).b(0);
};
T.cooldog = { h: 0.62, face: 'side' };
R.scholar = b => {   // hooded purple robe, one glowing eye in the dark hood, open book (model sheet "Ancient Scholar")
  const C = '#3f2f96', L = '#8f7cff';
  b.c(C).lathe([[0.36, 0], [0.34, 0.1], [0.27, 0.45], [0.2, 0.72], [0.12, 0.86], [0, 0.9]], 14);
  b.b(6).push().T(0, 0.78, 0.04);
  b.c(C).sph(0.21, 12, 8);
  b.c(C).at(0, 0.18, -0.12, q => q.R(-40, 0, 0).cone(0.1, 0.18, 6));
  b.c('#0a0820').at(0, -0.02, 0.14, q => q.ell(0.14, 0.13, 0.08, 10, 6));
  b.c('#d8d4ff').g(1).at(0, 0.0, 0.2, q => q.ell(0.07, 0.035, 0.02, 8, 4)).c('#2a6a9a').at(0, 0.0, 0.215, q => q.sph(0.022, 6, 4)).g(0);
  b.pop().ch(6, 0, 0.78, 0, 'head', 'y', 8).b(0);
  b.b(3).push().T(0, 0.45, 0.3).R(-25, 0, 0);
  b.c('#1f5466').at(-0.1, 0, 0, q => q.R(0, -18, 0).box(0.2, 0.26, 0.025)).at(0.1, 0, 0, q => q.R(0, 18, 0).box(0.2, 0.26, 0.025));
  b.c('#8fe8ff').g(1).line(-0.16, 0.06, 0.025, -0.05, 0.06, 0.03, 0.012).line(-0.16, -0.02, 0.025, -0.06, -0.02, 0.03, 0.012).line(0.05, 0.05, 0.03, 0.16, 0.05, 0.025, 0.012).line(0.06, -0.04, 0.03, 0.15, -0.04, 0.025, 0.012).g(0);
  b.c(C).at(-0.2, 0.0, -0.04, q => q.sph(0.07, 8, 6)).at(0.2, 0.0, -0.04, q => q.sph(0.07, 8, 6));
  b.pop().ch(3, 0, 0.45, 0.3, 'sway', 'x', 4).b(0);
  b.c(L).g(1).line(-0.28, 0.12, 0.2, 0.28, 0.12, 0.2, 0.015).g(0);
};
T.scholar = { h: 0.66, face: 'front' };
R.skypup = b => {   // floating puppy with little cloud wings
  const C = '#7fc8ff', W = '#e8f6ff';
  b.c(C).at(0, 0.62, 0, q => q.ell(0.18, 0.16, 0.3, 10, 7));
  b.b(6).at(0, 0.78, 0.26, q => { q.c(C).sph(0.15, 10, 7); q.c(C).at(0, -0.03, 0.14, r => r.ell(0.08, 0.07, 0.08, 8, 5)); q.c('#123').g(1).at(0, -0.01, 0.22, r => r.sph(0.025, 6, 4)).g(0); q.eye(-0.07, 0.04, 0.12, 0.035).eye(0.07, 0.04, 0.12, 0.035); q.c(C).at(-0.11, 0.06, -0.02, r => r.R(0, 0, 40).ell(0.04, 0.1, 0.05, 6, 4)).at(0.11, 0.06, -0.02, r => r.R(0, 0, -40).ell(0.04, 0.1, 0.05, 6, 4)); }).ch(6, 0, 0.78, 0.2, 'head', 'x', 8).b(0);
  b.b(7).c(W).at(-0.22, 0.7, -0.02, q => q.R(0, 0, 20).ell(0.16, 0.06, 0.12, 8, 5)).ch(7, -0.12, 0.7, 0, 'wing', 'z', 20).b(0);
  b.b(5).c(W).at(0.22, 0.7, -0.02, q => q.R(0, 0, -20).ell(0.16, 0.06, 0.12, 8, 5)).ch(5, 0.12, 0.7, 0, 'wing', 'z', -20).b(0);
  b.c(C).at(-0.08, 0.48, 0.12, q => q.cyl(0.03, 0.035, 0.12, 6)).at(0.08, 0.48, 0.12, q => q.cyl(0.03, 0.035, 0.12, 6)).at(-0.08, 0.48, -0.12, q => q.cyl(0.03, 0.035, 0.12, 6)).at(0.08, 0.48, -0.12, q => q.cyl(0.03, 0.035, 0.12, 6));
  b.c('#ffffff').g(1).at(0, 0.25, 0, q => q.torus(0.18, 0.012, 14, 4)).g(0);
};
T.skypup = { h: 0.52, face: 'side', float: 1 };
R.soldier = b => {   // big ghostly Spirit Soldier with a spear
  const C = '#5b7bd8';
  b.c(C).lathe([[0.3, 0.05], [0.22, 0.35], [0.26, 0.7], [0.18, 0.86], [0, 0.88]], 12);
  b.c(C).lathe([[0, 0], [0.28, 0.05], [0.3, 0.1], [0.32, 0.05]], 12, { capTop: false });
  b.b(6).at(0, 1.0, 0, q => { q.c(C).sph(0.17, 10, 7); q.c('#c8d8ff').g(1).at(-0.06, 0.02, 0.14, r => r.sph(0.035, 6, 4)).at(0.06, 0.02, 0.14, r => r.sph(0.035, 6, 4)).g(0); q.c('#2c3f8a').at(0, 0.13, 0, r => r.cyl(0.12, 0.19, 0.1, 10)); q.c('#9fb4ff').at(0, 0.24, 0, r => r.cone(0.05, 0.16, 6)); }).ch(6, 0, 1.0, 0, 'head', 'y', 8).b(0);
  arm(b, 4, 0.24, 0.72, 0.04, [[0, 0, 0], [0.08, -0.2, 0.12], [0.1, -0.3, 0.2]], 0.05, C, 'arm', 10);
  b.b(4).c('#b8c8ff').at(0.34, 0.6, 0.24, q => q.cyl(0.018, 0.018, 1.1, 6)).c('#e0ecff').g(1).at(0.34, 1.17, 0.24, q => q.cone(0.05, 0.14, 6)).g(0).b(0);
  arm(b, 3, -0.24, 0.72, 0.04, [[0, 0, 0], [-0.06, -0.22, 0.08]], 0.05, C, 'arm', 10, Math.PI);
};
T.soldier = { h: 0.78, face: 'front' };
R.marauder = b => {   // Woadic Marauder: blue-painted barbarian with a club
  const C = '#3a6fd0', S = '#86a8ff';
  legs2(b, 0.1, 0.36, 0.06, '#2a3f7a', '#1a2a5a');
  b.c('#6a4a2a').at(0, 0.42, 0, q => q.cyl(0.2, 0.18, 0.12, 10));
  b.c(C).at(0, 0.62, 0, q => q.ell(0.24, 0.24, 0.18, 10, 7));
  b.b(6).at(0, 0.94, 0.02, q => { q.c(C).sph(0.15, 10, 7); q.c('#c8e0ff').g(1).at(-0.05, 0.02, 0.13, r => r.sph(0.025, 6, 4)).at(0.05, 0.02, 0.13, r => r.sph(0.025, 6, 4)).g(0); q.c('#d0d8e8').at(-0.13, 0.08, 0, r => r.R(0, 0, 50).cone(0.04, 0.14, 5)).at(0.13, 0.08, 0, r => r.R(0, 0, -50).cone(0.04, 0.14, 5)); q.c(S).g(1).line(-0.12, 0.0, 0.08, 0.12, 0.0, 0.08, 0.02).g(0); }).ch(6, 0, 0.94, 0, 'head', 'y', 8).b(0);
  arm(b, 3, -0.26, 0.72, 0, [[0, 0, 0], [-0.08, -0.2, 0.06], [-0.08, -0.32, 0.14]], 0.05, C, 'arm', 12);
  arm(b, 4, 0.26, 0.72, 0, [[0, 0, 0], [0.1, -0.12, 0.12], [0.12, -0.18, 0.24]], 0.05, C, 'arm', 30, Math.PI);
  b.b(4).c('#7a5a3a').at(0.38, 0.62, 0.3, q => q.R(-30, 0, -20).lathe([[0.03, -0.2], [0.05, 0.1], [0.09, 0.22], [0, 0.3]], 8)).b(0);
};
T.marauder = { h: 0.72, face: 'front' };
R.chief = b => {   // Woadic Chief: big blue chief with a horned helmet and a cape
  const C = '#2f5fc0', K = '#5a2a8a';
  legs2(b, 0.12, 0.4, 0.07, '#24387a', '#141f4a');
  b.c(K).at(0, 0.55, -0.12, q => q.R(10, 0, 0).box(0.56, 0.6, 0.04));
  b.c(C).at(0, 0.66, 0, q => q.ell(0.28, 0.28, 0.2, 10, 7));
  b.b(6).at(0, 1.02, 0.02, q => { q.c(C).sph(0.16, 10, 7); q.c('#ffe08a').g(1).at(-0.05, 0.02, 0.14, r => r.sph(0.025, 6, 4)).at(0.05, 0.02, 0.14, r => r.sph(0.025, 6, 4)).g(0); q.c('#c0c8d8').at(0, 0.1, 0, r => r.ell(0.17, 0.08, 0.17, 10, 5)); q.c('#e8e0c0').at(-0.16, 0.16, 0, r => r.R(0, 0, 60).cone(0.04, 0.22, 6)).at(0.16, 0.16, 0, r => r.R(0, 0, -60).cone(0.04, 0.22, 6)); }).ch(6, 0, 1.02, 0, 'head', 'y', 6).b(0);
  arm(b, 3, -0.3, 0.78, 0, [[0, 0, 0], [-0.08, -0.22, 0.06], [-0.06, -0.36, 0.1]], 0.06, C, 'arm', 10);
  arm(b, 4, 0.3, 0.78, 0, [[0, 0, 0], [0.08, -0.22, 0.06], [0.06, -0.36, 0.1]], 0.06, C, 'arm', 10, Math.PI);
};
T.chief = { h: 0.86, face: 'front' };
R.bard = b => {   // Embarrassing Bard: lanky bard with a feathered cap and a lute
  const C = '#4a86d8', R2 = '#d84a6a';
  legs2(b, 0.07, 0.34, 0.04, '#e8c060', '#7a4a2a');
  b.c(C).at(0, 0.52, 0, q => q.lathe([[0.15, -0.18], [0.12, 0.1], [0.1, 0.18], [0, 0.2]], 10));
  b.b(6).at(0, 0.8, 0.02, q => { q.c('#ffd8b8').sph(0.12, 10, 7); q.c('#123').g(1).at(-0.04, 0.02, 0.11, r => r.sph(0.018, 6, 4)).at(0.04, 0.02, 0.11, r => r.sph(0.018, 6, 4)).g(0); q.c(R2).at(0, 0.11, 0, r => r.ell(0.14, 0.06, 0.12, 10, 5)); q.c('#ffffff').at(0.06, 0.2, -0.04, r => r.R(-30, 0, -20).ell(0.02, 0.12, 0.03, 5, 4)); }).ch(6, 0, 0.8, 0, 'head', 'z', 8).b(0);
  b.b(4).c('#c08040').at(0.06, 0.52, 0.16, q => { q.R(0, 0, -40).ell(0.1, 0.12, 0.04, 10, 6); q.c('#7a4a2a').T(0, 0.2, 0).cyl(0.015, 0.02, 0.26, 5); }).ch(4, 0, 0.55, 0.1, 'sway', 'z', 10).b(0);
  arm(b, 3, -0.14, 0.62, 0, [[0, 0, 0], [0.04, -0.12, 0.14], [0.12, -0.1, 0.2]], 0.035, C, 'sway', 8);
};
T.bard = { h: 0.66, face: 'front' };
R.ranger = b => {   // Cloud Ranger: a rider on a fluffy cloud
  const C = '#5aa0e8', W = '#f0f8ff';
  b.c(W).at(0, 0.3, 0, q => { q.ell(0.32, 0.14, 0.24, 10, 6); q.at(-0.22, 0.02, 0.05, r => r.sph(0.14, 8, 6)); q.at(0.22, 0.02, -0.04, r => r.sph(0.15, 8, 6)); q.at(0.02, 0.1, -0.12, r => r.sph(0.13, 8, 6)); });
  b.c(C).at(0, 0.58, 0, q => q.ell(0.14, 0.18, 0.12, 10, 6));
  b.b(6).at(0, 0.84, 0, q => { q.c('#ffe0c8').sph(0.12, 10, 7); q.c(C).at(0, 0.06, 0, r => r.ell(0.13, 0.07, 0.13, 10, 5)); q.c('#123').g(1).at(-0.04, 0.0, 0.11, r => r.sph(0.018, 6, 4)).at(0.04, 0.0, 0.11, r => r.sph(0.018, 6, 4)).g(0); }).ch(6, 0, 0.84, 0, 'head', 'y', 10).b(0);
  arm(b, 4, 0.14, 0.66, 0, [[0, 0, 0], [0.1, -0.06, 0.16]], 0.035, C, 'arm', 14);
  b.b(4).c('#e8f0ff').at(0.24, 0.62, 0.22, q => q.R(-60, 0, 0).cyl(0.012, 0.012, 0.6, 5)).c('#ffffff').g(1).at(0.24, 0.62, 0.52, q => q.R(-60, 0, 0).cone(0.04, 0.1, 5)).g(0).b(0);
};
T.ranger = { h: 0.66, face: 'front', float: 1 };
R.school = b => {   // Schoolhouse: steep shingled roof, round attic window, door (model sheet "Schoolhouse")
  const C = '#2346b8', L = '#7fb2ff';
  b.c(C).at(0, 0.45, 0, q => q.box(0.9, 0.9, 1.1));
  const tri = [[-0.55, 0], [0.55, 0], [0, 0.7]];
  b.c('#1a3590').at(0, 0.9, 0, q => q.R(0, 90, 0).S(1.08, 1, 1).ext([[-0.6, 0], [0.6, 0], [0.6, 0.02], [0, 0.72], [-0.6, 0.02]], 1.0));
  b.c(C).at(0, 0.9, 0.5, q => q.ext(tri, 0.06)).at(0, 0.9, -0.5, q => q.ext(tri, 0.06));
  b.c(L).g(1);
  for (let i = 0; i < 5; i++) { const y = 0.95 + i * 0.12, w = 0.5 - i * 0.09; b.line(-w - 0.06, y, 0.56, w + 0.06, y, 0.56, 0.015); }
  for (let i = 0; i < 5; i++) { const y = 0.97 + i * 0.12; b.line(-0.6 + i * 0.105, y - 0.02, -0.55, -0.6 + i * 0.105, y - 0.02, 0.55, 0.012).line(0.6 - i * 0.105, y - 0.02, -0.55, 0.6 - i * 0.105, y - 0.02, 0.55, 0.012); }
  b.at(0, 1.15, 0.53, q => q.torus(0.09, 0.015, 12, 4));
  b.line(-0.12, 0.0, 0.56, -0.12, 0.42, 0.56).line(0.12, 0.0, 0.56, 0.12, 0.42, 0.56).line(-0.12, 0.42, 0.56, 0.12, 0.42, 0.56);
  b.line(0.46, 0.3, -0.25, 0.46, 0.62, -0.25).line(0.46, 0.3, 0.15, 0.46, 0.62, 0.15).line(0.46, 0.3, -0.25, 0.46, 0.3, 0.15).line(0.46, 0.62, -0.25, 0.46, 0.62, 0.15).line(0.46, 0.46, -0.25, 0.46, 0.46, 0.15).line(0.46, 0.3, -0.05, 0.46, 0.62, -0.05);
  for (let i = 1; i < 6; i++) b.line(-0.455, i * 0.15, -0.55, -0.455, i * 0.15, 0.55, 0.01).line(0.455, i * 0.15, -0.55, 0.455, i * 0.15, -0.3, 0.01);
  b.g(0);
};
T.school = { h: 1.45 };
R.fortress = b => {   // Astral Fortress: Finn's blue castle - big round keep, side tower, gate and ramp (Blue_castle)
  const C = '#1d2f9e', L = '#6fa8ff';
  const tower = (x, z, r, h) => {
    b.c(C).at(x, h / 2, z, q => q.cyl(r, r, h, 16));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.at(x + Math.cos(a) * r * 0.92, h + 0.06, z + Math.sin(a) * r * 0.92, q => q.box(r * 0.32, 0.12, r * 0.32)); }
    b.c(L).g(1);
    for (let y = 0.18; y < h; y += 0.22) b.at(x, y, z, q => q.torus(r + 0.004, 0.008, 18, 3));
    b.at(x, h + 0.001, z, q => q.torus(r * 0.92, 0.012, 18, 3));
    b.g(0);
  };
  tower(-0.05, -0.05, 0.42, 1.25);
  tower(0.55, 0.1, 0.26, 0.85);
  tower(-0.55, 0.12, 0.22, 0.7);
  b.c(C).at(-0.05, 0.25, 0.4, q => q.box(0.5, 0.5, 0.2));
  b.c('#0a1450').at(-0.05, 0.0, 0.5, q => q.ext(arch(0.3, 0.42), 0.04));
  b.c(L).g(1).at(-0.05, 0.0, 0.52, q => { const a = arch(0.3, 0.42); for (let i = 2; i < a.length - 1; i++) q.line(a[i][0], a[i][1], 0, a[i + 1][0], a[i + 1][1], 0, 0.015); q.line(-0.15, 0, 0, -0.15, 0.27, 0, 0.015); q.line(0.15, 0, 0, 0.15, 0.27, 0, 0.015); });
  for (const [x, y, z] of [[-0.05, 0.8, 0.38], [0.55, 0.58, 0.36], [-0.55, 0.45, 0.33], [0.2, 1.0, 0.33]]) b.at(x, y, z, q => q.ext(arch(0.07, 0.14, 6), 0.02));
  b.g(0).c('#2a4cc8').at(-0.05, 0.03, 0.75, q => q.R(-12, 0, 0).box(0.32, 0.03, 0.4));
};
T.fortress = { h: 1.6 };
R.spirit = b => {   // Spirit Tower: tapered tower with portholes, ring, prongs and a spiked dark orb (Spirit_tower)
  const C = '#1d3cb0', L = '#7ec8ff';
  b.c(C).lathe([[0.22, 0], [0.2, 0.6], [0.16, 1.25], [0.2, 1.3], [0.24, 1.32], [0.12, 1.36], [0, 1.37]], 4, { flat: 1 });
  b.c(L).g(1).at(0, 0.5, 0.13, q => q.R(90, 0, 0).torus(0.06, 0.012, 12, 3)).at(0, 0.85, 0.12, q => q.R(90, 0, 0).torus(0.05, 0.012, 12, 3)).line(0, 0, 0.16, 0, 1.28, 0.12, 0.012).g(0);
  b.c(C).at(0, 1.42, 0, q => q.cone(0.05, 0.3, 6));
  b.c(C).at(-0.14, 1.36, 0, q => q.tube([[0, 0, 0], [-0.06, 0.16, 0], [-0.02, 0.3, 0]], 0.025, 5)).at(0.14, 1.36, 0, q => q.tube([[0, 0, 0], [0.06, 0.16, 0], [0.02, 0.3, 0]], 0.025, 5));
  b.b(7).at(0, 1.62, -0.06, q => { q.c('#0b1a6a').ext(circlePts(0.26, 20), 0.05); q.c('#bfe8ff').g(1).ext(starPts(0.36, 0.27, 16), 0.03).g(0); }).ch(7, 0, 1.62, -0.06, 'spin', 'z', 12).b(0);
};
T.spirit = { h: 1.9 };
R.cave = b => {   // Cave of Solitude: a mound of big rounded boulders with a dark opening (Cave_of_solitude)
  const C = '#5a1a4a', L = '#ff5ac0';
  const rocks = [[-0.4, 0.22, 0, 0.3], [0.4, 0.22, 0.02, 0.32], [-0.22, 0.5, -0.06, 0.28], [0.2, 0.52, -0.04, 0.3], [0, 0.72, -0.1, 0.26], [-0.5, 0.18, -0.36, 0.26], [0.5, 0.2, -0.34, 0.26], [0, 0.3, -0.38, 0.34], [-0.62, 0.12, 0.2, 0.16], [0.64, 0.12, 0.24, 0.18]];
  b.c(C);
  for (const [x, y, z, r] of rocks) b.at(x, y, z, q => q.ell(r * 1.1, r * 0.9, r, 9, 6));
  b.c('#12040e').at(0, 0.2, 0.14, q => q.ell(0.2, 0.22, 0.1, 10, 6));
  b.c(L).g(1).at(0, 0.0, 0.2, q => { const a = arch(0.36, 0.42); for (let i = 2; i < a.length - 1; i++) q.line(a[i][0], a[i][1], 0, a[i + 1][0], a[i + 1][1], 0, 0.014); }).g(0);
};
T.cave = { h: 0.95 };

// ===== CORNFIELD =====
R.husker = b => {   // Husker Knight on a corn-husk horse: log body, husk head, little corn rider (model sheet)
  const C = '#c9a21c', D = '#7a6012', L = '#fff07a';
  b.c(C).at(0, 0.62, -0.02, q => { q.R(90, 0, 0).cyl(0.2, 0.2, 0.78, 12); });
  b.c(D).at(0, 0.62, -0.42, q => q.R(90, 0, 0).cyl(0.15, 0.15, 0.02, 12));
  b.c(L).g(1).at(0, 0.62, -0.42, q => q.R(90, 0, 0).torus(0.17, 0.012, 14, 3));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.line(Math.cos(a) * 0.2, 0.62 + Math.sin(a) * 0.2, -0.38, Math.cos(a) * 0.2, 0.62 + Math.sin(a) * 0.2, 0.3, 0.008); }
  b.g(0);
  b.b(6).push().T(0, 0.82, 0.38).R(-35, 0, 0);
  b.c(C).cyl(0.11, 0.14, 0.28, 10);
  b.at(0, 0.24, 0.06, q => { q.R(70, 0, 0); q.c(C).cyl(0.1, 0.15, 0.32, 10); q.c(D).T(0, 0.17, 0).cyl(0.07, 0.07, 0.02, 10); q.c(L).g(1).T(0, 0.0, 0).torus(0.085, 0.012, 12, 3).g(0); });
  b.c(C).at(0, 0.12, -0.12, q => { for (let i = 0; i < 4; i++) q.at(0, 0.02 * i, -0.04 * i, r => r.R(-60 - i * 10, 0, 0).ell(0.03, 0.12, 0.05, 5, 4)); });
  b.pop().ch(6, 0, 0.82, 0.38, 'head', 'x', 8).b(0);
  legs4(b, 0.12, 0.26, -0.26, 0.48, 0.05, C);
  b.b(5).c(C).at(0, 0.62, -0.46, q => { for (let i = 0; i < 3; i++) q.at((i - 1) * 0.05, 0, 0, r => r.R(-120, 0, (i - 1) * 15).ell(0.03, 0.14, 0.05, 5, 4)); }).ch(5, 0, 0.62, -0.42, 'tail', 'y', 20).b(0);
  // rider
  b.b(7).push().T(0, 0.86, 0.02);
  b.c(C).ell(0.1, 0.16, 0.09, 8, 6);
  b.c('#ffe25a').at(0, 0.22, 0, q => { q.ell(0.08, 0.1, 0.08, 8, 6); q.c('#c9a21c'); for (let i = 0; i < 5; i++) q.at(0, 0.06, 0, r => r.R(-15, i * 72, 0).T(0, 0.1, 0.04).ell(0.03, 0.11, 0.025, 5, 4)); q.at(0.02, 0.18, -0.02, r => r.tube([[0, 0, 0], [0.04, 0.16, -0.04], [0.12, 0.24, -0.06], [0.16, 0.2, -0.02]], 0.012, 4)); });
  b.c(C).at(0.1, 0.0, 0.1, q => q.R(-70, 0, 0).cyl(0.012, 0.012, 0.6, 5));
  b.c(L).g(1).at(0.1, 0.1, 0.38, q => q.R(-70, 0, 0).cone(0.03, 0.08, 5)).g(0);
  b.pop().ch(7, 0, 0.86, 0, 'sway', 'z', 4).b(0);
};
T.husker = { h: 0.78, face: 'side' };
R.earling = b => {   // one Earling: a corn cob with leaf hair and noodle limbs (model sheet "Earlings")
  const C = '#e8a24a', K = '#ffd27a', G = '#c88a2a';
  b.c(C).at(0, 0.52, 0, q => q.ell(0.09, 0.18, 0.08, 8, 6));
  b.c(K).g(1); for (let i = 0; i < 4; i++) b.line(-0.06, 0.42 + i * 0.06, 0.07, 0.06, 0.42 + i * 0.06, 0.07, 0.01); b.g(0);
  b.b(6).at(0, 0.72, 0, q => { q.c(C).ell(0.08, 0.1, 0.07, 8, 6); q.c('#3a1a0a').g(1).at(-0.03, 0.01, 0.06, r => r.sph(0.012, 5, 3)).at(0.03, 0.01, 0.06, r => r.sph(0.012, 5, 3)).at(0, -0.035, 0.065, r => r.ell(0.025, 0.008, 0.008, 5, 3)).g(0); q.c(G); for (let i = 0; i < 3; i++) q.at(0, 0.08, 0, r => r.R(-10, i * 120, (i - 1) * 25).T(0, 0.08, 0).ell(0.035, 0.12, 0.02, 5, 4)); }).ch(6, 0, 0.72, 0, 'head', 'z', 14).b(0);
  arm(b, 3, -0.08, 0.6, 0, [[0, 0, 0], [-0.12, 0.08, 0.02], [-0.16, 0.22, 0.04]], 0.018, C, 'arm', 30);
  arm(b, 4, 0.08, 0.6, 0, [[0, 0, 0], [0.12, 0.1, 0.02], [0.14, 0.24, 0.02]], 0.018, C, 'arm', 30, Math.PI);
  b.push().c(C);
  b.b(1).tube([[-0.04, 0.36, 0], [-0.1, 0.18, 0.04], [-0.06, 0.0, 0.06]], 0.02, 5).ch(1, -0.04, 0.36, 0, 'leg', 'x', 25);
  b.b(2).tube([[0.04, 0.36, 0], [0.12, 0.2, -0.02], [0.18, 0.06, 0.04]], 0.02, 5).ch(2, 0.04, 0.36, 0, 'leg', 'x', 25, Math.PI);
  b.b(0).pop();
};
R.earlings = b => {   // the Legion: three dancing Earlings
  for (const [x, z, s, ry] of [[-0.24, -0.08, 0.95, 20], [0.24, -0.1, 0.9, -20], [0, 0.12, 1.05, 0]]) b.push().T(x, 0, z).R(0, ry, 0).S(s).call(R.earling).pop();
};
B.call = function (fn) { fn(this); return this; };
T.earlings = { h: 0.62, face: 'front' };
R.cornball = b => {   // a little round corn guy
  const C = '#f2c43a', K = '#fff08a';
  b.c(C).at(0, 0.32, 0, q => q.ell(0.24, 0.3, 0.22, 10, 8));
  b.c(K).g(1); for (let i = 0; i < 5; i++) b.at(0, 0.32, 0, q => q.R(0, i * 36, 0).torus(0.235 - Math.abs(i - 2) * 0.0, 0.008, 14, 3)); b.g(0);
  b.c('#6a9a2a').at(0, 0.62, 0, q => { for (let i = 0; i < 3; i++) q.at(0, 0, 0, r => r.R(-20, i * 120, 20).T(0, 0.08, 0).ell(0.04, 0.12, 0.02, 5, 4)); });
  b.eye(-0.08, 0.4, 0.19, 0.05).eye(0.08, 0.4, 0.19, 0.05);
  b.c('#5a2a0a').g(1).at(0, 0.28, 0.21, q => q.ell(0.05, 0.02, 0.01, 6, 3)).g(0);
  legs2(b, 0.1, 0.08, 0.04, C);
};
T.cornball = { h: 0.42, face: 'front' };
R.scarecrow = b => {
  const C = '#c89a3a', S = '#e8c070';
  b.c('#7a5a2a').at(0, 0.5, 0, q => q.cyl(0.03, 0.03, 1.0, 6));
  b.c(C).at(0, 0.62, 0, q => q.lathe([[0.2, -0.22], [0.16, 0.1], [0.08, 0.18], [0, 0.2]], 10));
  b.c('#7a5a2a').at(0, 0.72, 0, q => q.R(0, 0, 90).cyl(0.025, 0.025, 0.8, 6));
  b.c(S); for (const x of [-0.4, 0.4]) b.at(x, 0.72, 0, q => { for (let i = 0; i < 3; i++) q.R(0, 0, i * 30 - 30).at(0, 0, 0, r => r.T(x > 0 ? 0.05 : -0.05, -0.05, 0).ell(0.05, 0.02, 0.02, 5, 3)); });
  b.b(6).at(0, 0.98, 0, q => { q.c('#f0d090').sph(0.14, 10, 7); q.c('#2a1a0a').g(1).at(-0.05, 0.02, 0.13, r => r.box(0.04, 0.04, 0.01)).at(0.05, 0.02, 0.13, r => r.box(0.04, 0.04, 0.01)).line(-0.06, -0.06, 0.13, 0.06, -0.06, 0.13, 0.01).g(0); q.c('#8a5a20').at(0, 0.1, 0, r => { r.cyl(0.2, 0.2, 0.02, 12); r.T(0, 0.06, 0).cyl(0.08, 0.1, 0.1, 10); }); }).ch(6, 0, 0.98, 0, 'head', 'z', 8).b(0);
};
T.scarecrow = { h: 0.82, face: 'front' };
R.feedman = b => {   // Feed Man: a big overalls farmer with a pitchfork
  const C = '#3a6ab0', S = '#ffcfa0';
  legs2(b, 0.1, 0.36, 0.07, C, '#5a3a1a');
  b.c(C).at(0, 0.6, 0, q => q.ell(0.27, 0.27, 0.22, 10, 8));
  b.c('#e8c040').at(0, 0.66, 0.08, q => q.box(0.3, 0.26, 0.2));
  b.b(6).at(0, 0.98, 0.02, q => { q.c(S).sph(0.15, 10, 7); q.c('#123').g(1).at(-0.05, 0.02, 0.14, r => r.sph(0.022, 6, 4)).at(0.05, 0.02, 0.14, r => r.sph(0.022, 6, 4)).g(0); q.c('#e8d080').at(0, 0.1, 0, r => { r.cyl(0.24, 0.24, 0.02, 14); r.T(0, 0.07, 0).cyl(0.12, 0.13, 0.12, 10); }); }).ch(6, 0, 0.98, 0, 'head', 'y', 8).b(0);
  arm(b, 3, -0.28, 0.74, 0, [[0, 0, 0], [-0.08, -0.2, 0.08], [-0.06, -0.32, 0.14]], 0.055, S, 'arm', 10);
  arm(b, 4, 0.28, 0.74, 0, [[0, 0, 0], [0.1, -0.12, 0.12]], 0.055, S, 'arm', 10, Math.PI);
  b.b(4).c('#b0b8c8').at(0.4, 0.66, 0.16, q => { q.cyl(0.015, 0.015, 1.1, 5); for (const x of [-0.05, 0, 0.05]) q.at(x, 0.6, 0, r => r.cone(0.012, 0.12, 4)); }).b(0);
};
T.feedman = { h: 0.86, face: 'front' };
R.reaper = b => {   // Field Reaper: huge shoulders, wide hat with charms, glowing eyes, kilt, two scythes (model sheet)
  const C = '#7a0d0d', K = '#4a0a2a', L = '#ff5a3a', O = '#ff9a3a';
  legs2(b, 0.13, 0.42, 0.075, C, '#4a0808');
  b.c(K).at(0, 0.5, 0, q => q.lathe([[0.3, -0.16], [0.26, 0.12], [0.24, 0.14]], 14, { capBot: false }));
  b.c('#c06a8a').g(1); for (let i = -2; i <= 2; i++) b.line(i * 0.11, 0.36, 0.27 - Math.abs(i) * 0.03, i * 0.09, 0.62, 0.24 - Math.abs(i) * 0.03, 0.01); b.g(0);
  b.c(C).at(0, 0.86, 0, q => q.ell(0.42, 0.3, 0.28, 12, 8));
  b.b(6).at(0, 1.18, 0.04, q => { q.c(C).sph(0.12, 10, 7); q.c('#ff7ad0').g(1).at(-0.045, 0.0, 0.11, r => r.R(0, 0, 20).ell(0.03, 0.015, 0.01, 6, 3)).at(0.045, 0.0, 0.11, r => r.R(0, 0, -20).ell(0.03, 0.015, 0.01, 6, 3)).g(0); q.c(C).at(0, 0.09, 0, r => { r.cyl(0.3, 0.3, 0.025, 16); r.T(0, 0.08, 0).cyl(0.12, 0.13, 0.15, 12); }); q.c(L).g(1); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; q.at(Math.cos(a) * 0.27, 0.0, Math.sin(a) * 0.27, r => r.sph(0.025, 5, 3)); } q.g(0); }).ch(6, 0, 1.18, 0, 'head', 'y', 6).b(0);
  arm(b, 3, -0.4, 0.95, 0, [[0, 0, 0], [-0.12, -0.24, 0.06], [-0.12, -0.42, 0.12]], 0.09, C, 'arm', 8);
  arm(b, 4, 0.4, 0.95, 0, [[0, 0, 0], [0.12, 0.08, 0.06], [0.1, 0.2, 0.12]], 0.09, C, 'arm', 6, Math.PI);
  b.b(4).c('#9a2a1a').at(0.1, 1.15, 0.16, q => { q.R(0, 0, 65).cyl(0.02, 0.02, 1.4, 6); }).c(O).g(1).at(-0.52, 1.42, 0.16, q => q.R(0, 0, 20).ext(crescent(0.32, 0.16), 0.02)).g(0).b(0);
  b.b(3).c('#9a2a1a').at(-0.56, 0.5, 0.16, q => q.R(0, 0, -15).cyl(0.02, 0.02, 0.8, 6)).c(O).g(1).at(-0.48, 0.12, 0.16, q => q.R(0, 0, 160).ext(crescent(0.24, 0.12), 0.02)).g(0).b(0);
};
function crescent(r, w) { const p = []; for (let i = 0; i <= 12; i++) { const a = -0.2 + Math.PI * 0.7 * i / 12; p.push([r * Math.cos(a), r * Math.sin(a)]); } for (let i = 12; i >= 0; i--) { const a = -0.2 + Math.PI * 0.7 * i / 12; const rr = r - w * Math.sin(Math.PI * i / 12); p.push([rr * Math.cos(a) + w * 0.2, rr * Math.sin(a)]); } return p; }
T.reaper = { h: 1.15, face: 'front' };
R.maize = b => {   // Immortal Maize Walker: a big spiky orange ball with star eyes, jagged mouth, noodle legs and a waving arm
  const C = '#c8501e', D = '#3a0c04', L = '#ff9a5a';
  b.push().T(0, 0.86, 0);
  b.c(C).ell(0.46, 0.46, 0.36, 16, 10);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; b.push().R(0, 0, a / D2R - 90).T(0, 0.44, 0).cone(0.08, 0.13, 5).pop(); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (const zz of [1, -1]) b.push().R(zz * 50, 0, a / D2R).T(0, 0.4, 0).cone(0.07, 0.11, 5).pop(); }
  b.c(D).g(1).at(-0.15, 0.1, 0.34, q => q.ext(starPts(0.09, 0.04, 6), 0.03)).at(0.17, 0.13, 0.34, q => q.ext(starPts(0.075, 0.032, 6), 0.03));
  const mouth = []; for (let i = 0; i <= 10; i++) mouth.push([-0.2 + i * 0.04, -0.12 + (i % 2 ? 0.03 : -0.03)]); for (let i = 10; i >= 0; i--) mouth.push([-0.2 + i * 0.04, -0.21 + (i % 2 ? -0.02 : 0.02)]);
  b.at(0, 0, 0.33, q => q.ext(mouth, 0.03)).g(0);
  b.c(L).g(1).at(0.18, 0.12, 0.36, q => q.ext(starPts(0.04, 0.02, 4), 0.01)).g(0);
  b.pop();
  b.push().c(C);
  b.b(1).tube([[-0.14, 0.44, 0], [-0.18, 0.22, 0.06], [-0.2, 0.0, 0.04]], 0.035, 5).at(-0.2, 0.02, 0.08, q => q.ell(0.08, 0.035, 0.1, 6, 4)).ch(1, -0.14, 0.44, 0, 'leg', 'x', 22);
  b.b(2).tube([[0.14, 0.44, 0], [0.18, 0.22, -0.04], [0.2, 0.0, 0.02]], 0.035, 5).at(0.2, 0.02, 0.06, q => q.ell(0.08, 0.035, 0.1, 6, 4)).ch(2, 0.14, 0.44, 0, 'leg', 'x', 22, Math.PI);
  b.b(4).tube([[0.42, 0.92, 0], [0.62, 1.02, 0.04], [0.74, 1.22, 0.04], [0.78, 1.3, 0.02]], 0.035, 5).ch(4, 0.42, 0.92, 0, 'wave', 'z', 25);
  b.b(0).pop();
};
T.maize = { h: 1.15, face: 'front', big: 1 };
R.dan = b => {   // Archer Dan: corn-cob head, green hood with a feather, cape, bow and corn-arrow quiver (model sheet)
  const C = '#3f9a3a', K = '#ffd24a', L = '#aaff8a';
  legs2(b, 0.07, 0.42, 0.04, '#2f7a2a', '#1f4a1a');
  b.c(C).at(0, 0.6, 0, q => q.lathe([[0.16, -0.16], [0.13, 0.1], [0.1, 0.16], [0, 0.18]], 10));
  b.c('#2a6a24').at(0, 0.6, -0.1, q => q.R(8, 0, 0).box(0.32, 0.4, 0.03));
  b.c('#7a5a2a').at(0, 0.48, 0, q => q.cyl(0.165, 0.165, 0.04, 10));
  b.b(6).push().T(0, 0.86, 0);
  b.c(K).ell(0.09, 0.14, 0.09, 10, 8);
  b.c('#c89a1a').g(1); for (let i = 0; i < 4; i++) b.line(-0.07, -0.08 + i * 0.05, 0.08, 0.07, -0.08 + i * 0.05, 0.08, 0.008); b.g(0);
  b.c(C).at(0, 0.11, -0.01, q => { q.R(-10, 0, 0).cone(0.12, 0.2, 8); q.c('#e8f0a0').at(0.05, 0.06, -0.06, r => r.R(-40, 0, -25).ell(0.015, 0.1, 0.02, 4, 4)); });
  b.pop().ch(6, 0, 0.86, 0, 'head', 'y', 8).b(0);
  b.b(7).c('#d8c870').at(-0.08, 0.66, -0.14, q => { q.R(-15, 0, -10).cyl(0.045, 0.04, 0.3, 8); q.c('#9ae05a'); for (let i = 0; i < 4; i++) q.at((i - 1.5) * 0.02, 0.2, 0, r => r.R(0, 0, (i - 1.5) * 10).ell(0.02, 0.08, 0.01, 4, 3)); }).b(0);
  arm(b, 3, -0.14, 0.7, 0, [[0, 0, 0], [-0.08, -0.08, 0.14], [-0.06, -0.08, 0.26]], 0.03, C, 'arm', 8);
  b.b(3).c('#c8e870').at(-0.2, 0.62, 0.3, q => q.tube([[0, -0.3, -0.06], [0, -0.1, 0.06], [0, 0.1, 0.06], [0, 0.3, -0.06]], 0.015, 4)).c(L).g(1).at(-0.2, 0.62, 0.27, q => q.line(0, -0.3, 0, 0, 0.3, 0, 0.006)).g(0).b(0);
  arm(b, 4, 0.14, 0.7, 0, [[0, 0, 0], [0.06, -0.14, 0.1], [0.04, -0.22, 0.18]], 0.03, C, 'arm', 8, Math.PI);
};
T.dan = { h: 0.84, face: 'front' };
R.baldman = b => {   // Wandering Bald Man: round bald head, sad face, pot belly, underpants (model sheet)
  const C = '#8a3a14', L = '#ffb04a';
  legs2(b, 0.08, 0.22, 0.055, C);
  b.c(C).at(0, 0.42, 0, q => q.ell(0.18, 0.22, 0.16, 10, 8));
  b.c(L).g(1).at(0, 0.27, 0, q => q.cyl(0.165, 0.17, 0.08, 12, { capTop: false, capBot: false })).g(0);
  b.c('#9a4a1a').at(0, 0.4, 0.1, q => q.ell(0.12, 0.13, 0.08, 8, 6));
  b.b(6).at(0, 0.76, 0, q => { q.c(C).sph(0.16, 12, 8); q.c('#2a0a02').g(1).at(-0.055, 0.02, 0.15, r => r.sph(0.016, 5, 3)).at(0.055, 0.02, 0.15, r => r.sph(0.016, 5, 3)).at(0, -0.06, 0.15, r => r.R(0, 0, 0).ell(0.035, 0.008, 0.008, 6, 3)).g(0); }).ch(6, 0, 0.7, 0, 'head', 'z', 6).b(0);
  arm(b, 3, -0.17, 0.52, 0, [[0, 0, 0], [-0.04, -0.14, 0.02], [-0.03, -0.24, 0.04]], 0.035, C, 'arm', 14);
  arm(b, 4, 0.17, 0.52, 0, [[0, 0, 0], [0.04, -0.14, 0.02], [0.03, -0.24, 0.04]], 0.035, C, 'arm', 14, Math.PI);
};
T.baldman = { h: 0.62, face: 'front' };
R.silo = b => {   // Silo of Truth: tall silo with a dome cap and a truth-laser lens
  const C = '#c0601a', L = '#ffc04a';
  b.c(C).lathe([[0.32, 0], [0.32, 1.25], [0.3, 1.32], [0.22, 1.5], [0.1, 1.58], [0, 1.6]], 16);
  b.c(L).g(1);
  for (let y = 0.15; y < 1.25; y += 0.18) b.at(0, y, 0, q => q.torus(0.324, 0.008, 18, 3));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.line(Math.cos(a) * 0.326, 0, Math.sin(a) * 0.326, Math.cos(a) * 0.326, 1.25, Math.sin(a) * 0.326, 0.008); }
  b.g(0);
  b.b(7).at(0, 1.5, 0.12, q => { q.c('#ffe86a').g(1).sph(0.08, 10, 6); q.c('#ffffff').T(0, 0, 0.06).sph(0.035, 6, 4).g(0); }).ch(7, 0, 1.5, 0, 'spin', 'y', 30).b(0);
  b.c('#7a3a0a').at(0, 0.18, 0.31, q => q.ext(arch(0.18, 0.32, 6), 0.03));
};
T.silo = { h: 1.85 };
R.corncastle = b => {   // Corn Castle: keep with many windows flanked by two tall pointed spires (Red_castle)
  const C = '#b3551a', L = '#ffb04a', D = '#5a2006';
  b.c(C).at(0, 0.45, 0, q => q.box(1.0, 0.9, 0.7));
  for (let i = 0; i < 6; i++) b.at(-0.42 + i * 0.168, 0.96, 0.32, q => q.box(0.1, 0.12, 0.08));
  b.c(C).at(0, 1.1, -0.05, q => q.box(0.5, 0.5, 0.45));
  b.c(C).at(0, 1.42, -0.05, q => q.R(0, 45, 0).cone(0.36, 0.42, 4));
  for (const x of [-0.6, 0.6]) { b.c(C).at(x, 0.65, 0.05, q => q.cyl(0.17, 0.19, 1.3, 10)); b.c(C).at(x, 1.3, 0.05, q => q.cone(0.21, 0.75, 10)); b.c(L).g(1).at(x, 1.3, 0.05, q => q.torus(0.2, 0.012, 12, 3)).g(0); }
  b.c(D).g(1);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) b.at(-0.32 + i * 0.21, 0.2 + r * 0.24, 0.352, q => q.box(0.07, 0.1, 0.01));
  b.at(0, 0, 0.36, q => q.ext(arch(0.2, 0.28, 6), 0.02));
  b.c(L); for (let i = 0; i < 3; i++) b.line(-0.5, 0.3 * (i + 1), 0.355, 0.5, 0.3 * (i + 1), 0.355, 0.01);
  b.g(0);
};
T.corncastle = { h: 1.85 };
R.dome = b => {   // Corn Dome: a big ribbed dome with arched windows all around its drum
  const C = '#c0681c', L = '#ffc860';
  b.c(C).at(0, 0.18, 0, q => q.cyl(0.6, 0.62, 0.36, 20));
  b.c(C).at(0, 0.36, 0, q => q.lathe([[0.6, 0], [0.58, 0.18], [0.48, 0.38], [0.3, 0.52], [0, 0.58]], 20, { capBot: false }));
  b.c(C).at(0, 0.98, 0, q => q.cyl(0.05, 0.08, 0.12, 8));
  b.c(L).g(1);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.at(Math.cos(a) * 0.61, 0.08, Math.sin(a) * 0.61, q => q.R(0, -a / D2R + 90, 0).ext(arch(0.1, 0.2, 5), 0.01)); b.line(Math.cos(a) * 0.6, 0.38, Math.sin(a) * 0.6, Math.cos(a) * 0.2, 0.86, Math.sin(a) * 0.2, 0.01); }
  b.at(0, 0.36, 0, q => q.torus(0.61, 0.014, 22, 3));
  b.g(0);
};
T.dome = { h: 1.15 };
R.barn = b => {   // Hay Barn: long barn with a gambrel roof
  const C = '#b8501c', L = '#ffc070';
  b.c(C).at(0, 0.3, 0, q => q.box(0.8, 0.6, 1.1));
  b.c('#8a3a12').at(0, 0.6, 0, q => q.R(0, 90, 0).ext([[-0.58, 0], [0.58, 0], [0.42, 0.3], [0, 0.45], [-0.42, 0.3]], 0.86));
  b.c(L).g(1).at(0, 0, 0.56, q => { q.line(-0.2, 0, 0, -0.2, 0.42, 0, 0.015); q.line(0.2, 0, 0, 0.2, 0.42, 0, 0.015); q.line(-0.2, 0.42, 0, 0.2, 0.42, 0, 0.015); q.line(-0.2, 0, 0, 0.2, 0.42, 0, 0.012); q.line(0.2, 0, 0, -0.2, 0.42, 0, 0.012); }).g(0);
  b.c('#f0d060').at(0, 0.72, 0.44, q => q.box(0.2, 0.14, 0.2));
};
T.barn = { h: 1.0 };
R.henge = b => {   // Stonehenge: a ring of standing stones with lintels
  const C = '#a0703a', L = '#ffd08a';
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, x = Math.cos(a) * 0.48, z = Math.sin(a) * 0.48;
    b.c(C).at(x, 0.32, z, q => q.R(0, -a / D2R, 0).box(0.14, 0.64, 0.2));
    const a2 = (i + 1) / 7 * Math.PI * 2;
    if (i % 2 === 0) b.at((x + Math.cos(a2) * 0.48) / 2, 0.69, (z + Math.sin(a2) * 0.48) / 2, q => q.R(0, -(a + a2) / 2 / D2R + 90, 0).box(0.46, 0.1, 0.16));
  }
  b.c(C).at(0, 0.2, 0, q => q.box(0.3, 0.4, 0.14));
  b.c(L).g(1).at(0, 0.005, 0, q => q.torus(0.62, 0.01, 22, 3)).g(0);
};
T.henge = { h: 0.85 };

// ===== USELESS SWAMP =====
R.wisp = b => { const C = '#b07af0'; b.c(C).at(0, 0.62, 0, q => q.lathe([[0, -0.3], [0.12, -0.12], [0.2, 0.05], [0.16, 0.18], [0, 0.26]], 10)); b.eye(-0.06, 0.68, 0.15, 0.04, '#ffffff', '#3a0a5a').eye(0.06, 0.68, 0.15, 0.04, '#ffffff', '#3a0a5a'); b.b(5).c('#d8b0ff').g(1).at(0, 0.34, 0, q => q.ell(0.06, 0.1, 0.06, 6, 4)).g(0).ch(5, 0, 0.5, 0, 'sway', 'z', 18).b(0); };
T.wisp = { h: 0.5, float: 1, face: 'front' };
R.slinger = b => { const C = '#7a4a9a'; legs2(b, 0.09, 0.2, 0.06, C); b.c(C).at(0, 0.4, 0, q => q.ell(0.24, 0.24, 0.2, 10, 8)); b.eye(-0.08, 0.5, 0.17, 0.05).eye(0.08, 0.5, 0.17, 0.05); b.c('#3a1a4a').g(1).at(0, 0.36, 0.2, q => q.ell(0.08, 0.025, 0.01, 6, 3)).g(0); arm(b, 4, 0.22, 0.46, 0, [[0, 0, 0], [0.12, 0.12, 0.02], [0.16, 0.26, 0.04]], 0.04, C, 'wave', 30); b.b(4).c('#5a3a1a').at(0.38, 0.74, 0.04, q => q.sph(0.08, 8, 6)).b(0); };
T.slinger = { h: 0.56, face: 'front' };
R.digger = b => { const C = '#6a5a8a'; legs2(b, 0.08, 0.3, 0.05, '#4a3a5a'); b.c(C).at(0, 0.5, 0, q => q.ell(0.18, 0.22, 0.15, 10, 7)); b.b(6).at(0, 0.82, 0, q => { q.c('#c0b0d0').sph(0.13, 10, 7); q.c('#222').g(1).at(-0.045, 0.02, 0.12, r => r.sph(0.02, 5, 3)).at(0.045, 0.02, 0.12, r => r.sph(0.02, 5, 3)).g(0); q.c('#3a2a4a').at(0, 0.09, 0, r => { r.cyl(0.18, 0.18, 0.02, 12); r.T(0, 0.08, 0).cyl(0.1, 0.11, 0.16, 10); }); }).ch(6, 0, 0.82, 0, 'head', 'y', 8).b(0); arm(b, 4, 0.18, 0.6, 0, [[0, 0, 0], [0.1, -0.1, 0.12]], 0.035, C, 'arm', 30); b.b(4).c('#9a9aa8').at(0.3, 0.42, 0.2, q => { q.R(-20, 0, 10).cyl(0.015, 0.015, 0.7, 5); q.T(0, -0.38, 0).box(0.14, 0.12, 0.02); }).b(0); };
T.digger = { h: 0.7, face: 'front' };
R.witch = b => { const C = '#6a3aa0'; b.c(C).lathe([[0.3, 0], [0.2, 0.3], [0.13, 0.6], [0, 0.64]], 12); b.b(6).at(0, 0.7, 0, q => { q.c('#9ad08a').sph(0.12, 10, 7); q.c('#2a0a3a').g(1).at(-0.04, 0.02, 0.11, r => r.sph(0.02, 5, 3)).at(0.04, 0.02, 0.11, r => r.sph(0.02, 5, 3)).g(0); q.c('#9ad08a').at(0, -0.01, 0.13, r => r.R(80, 0, 0).cone(0.025, 0.1, 5)); q.c('#2a1a4a').at(0, 0.08, 0, r => { r.cyl(0.22, 0.22, 0.02, 12); r.T(0, 0.02, 0).R(-10, 0, 0).cone(0.12, 0.36, 8); }); }).ch(6, 0, 0.7, 0, 'head', 'y', 8).b(0); b.c('#3a2a2a').at(0.26, 0.15, 0.2, q => q.lathe([[0.08, 0], [0.13, 0.08], [0.12, 0.15], [0.1, 0.16]], 10, { capTop: false })); b.c('#7aff6a').g(1).at(0.26, 0.31, 0.2, q => q.cyl(0.1, 0.1, 0.01, 10)).g(0); };
T.witch = { h: 0.84, face: 'front' };
R.gobbler = b => { const C = '#5a8a3a'; b.c(C).at(0, 0.38, 0, q => q.ell(0.3, 0.3, 0.32, 12, 8)); b.c('#1a2a0a').g(1).at(0, 0.32, 0.27, q => q.ell(0.22, 0.08, 0.06, 10, 5)).g(0); b.c('#ffffff').g(1); for (let i = 0; i < 6; i++) b.at(-0.15 + i * 0.06, 0.38, 0.3, q => q.R(180, 0, 0).cone(0.025, 0.06, 4)); b.g(0); b.eye(-0.12, 0.56, 0.22, 0.06).eye(0.12, 0.56, 0.22, 0.06); legs2(b, 0.14, 0.1, 0.06, C); };
T.gobbler = { h: 0.62, face: 'front' };
R.lich = b => { const C = '#4a2a6a', B2 = '#d8d0b0'; b.c(C).lathe([[0.32, 0], [0.24, 0.4], [0.2, 0.8], [0.26, 0.9], [0, 0.94]], 12); b.b(6).at(0, 1.08, 0, q => { q.c(B2).sph(0.16, 10, 7); q.c('#00ff8a').g(1).at(-0.055, 0.02, 0.13, r => r.sph(0.035, 6, 4)).at(0.055, 0.02, 0.13, r => r.sph(0.035, 6, 4)).g(0); q.c(B2).at(-0.12, 0.12, 0, r => r.R(0, 0, 30).cone(0.05, 0.26, 5)).at(0.12, 0.12, 0, r => r.R(0, 0, -30).cone(0.05, 0.26, 5)); }).ch(6, 0, 1.08, 0, 'head', 'y', 6).b(0); arm(b, 4, 0.24, 0.8, 0, [[0, 0, 0], [0.16, 0.06, 0.12], [0.22, 0.18, 0.16]], 0.05, C, 'wave', 14); b.b(4).c('#00ff8a').g(1).at(0.46, 0.98, 0.16, q => q.sph(0.07, 8, 6)).g(0).b(0); };
T.lich = { h: 1.0, face: 'front' };
R.zombie = b => { const C = '#7a9a5a'; legs2(b, 0.07, 0.24, 0.05, '#4a5a3a'); b.c(C).at(0, 0.44, 0, q => q.ell(0.15, 0.2, 0.12, 10, 7)); b.b(6).at(0, 0.72, 0.02, q => { q.c(C).sph(0.12, 10, 7); q.c('#ff4a4a').g(1).at(-0.04, 0.02, 0.11, r => r.sph(0.02, 5, 3)).at(0.04, 0.02, 0.11, r => r.sph(0.02, 5, 3)).g(0); }).ch(6, 0, 0.72, 0, 'head', 'z', 12).b(0); arm(b, 3, -0.14, 0.52, 0, [[0, 0, 0], [-0.02, 0, 0.24]], 0.035, C, 'arm', 10); arm(b, 4, 0.14, 0.52, 0, [[0, 0, 0], [0.02, 0.02, 0.24]], 0.035, C, 'arm', 10, Math.PI); };
T.zombie = { h: 0.5, face: 'front' };
R.crypt = b => { const C = '#5a3a7a', L = '#d0a0ff'; b.c(C).at(0, 0.4, 0, q => q.box(0.8, 0.8, 0.7)); b.c(C).at(0, 0.86, 0, q => q.R(0, 90, 0).ext([[-0.42, 0], [0.42, 0], [0, 0.32]], 0.88)); b.c('#1a0a2a').at(0, 0, 0.36, q => q.ext(arch(0.3, 0.5), 0.02)); b.c(L).g(1).at(0, 1.02, 0.4, q => { q.line(0, -0.12, 0, 0, 0.12, 0, 0.02); q.line(-0.08, 0.04, 0, 0.08, 0.04, 0, 0.02); }).g(0); };
T.crypt = { h: 1.05 };
R.mausoleum = b => { const C = '#4a2a6a', L = '#c08aff'; b.c(C).at(0, 0.06, 0, q => q.box(1.2, 0.12, 1.0)); for (let i = 0; i < 4; i++) b.at(-0.42 + i * 0.28, 0.6, 0.36, q => q.cyl(0.07, 0.08, 0.96, 10)); b.c(C).at(0, 0.6, -0.1, q => q.box(1.0, 1.0, 0.7)); b.c(C).at(0, 1.12, 0.05, q => q.box(1.16, 0.1, 0.96)); b.c(C).at(0, 1.17, 0.05, q => q.R(0, 90, 0).ext([[-0.5, 0], [0.5, 0], [0, 0.34]], 1.12)); b.c('#100418').at(0, 0.1, 0.26, q => q.ext(arch(0.3, 0.56), 0.02)); b.c(L).g(1).at(0, 1.3, 0.62, q => q.sph(0.05, 6, 4)).g(0); };
T.mausoleum = { h: 1.6 };
R.mudpit = b => { b.c('#4a2a1a').at(0, 0.03, 0, q => q.ell(0.5, 0.06, 0.4, 14, 4)); b.c('#7a4a2a').g(1); for (let i = 0; i < 5; i++) b.at(-0.3 + i * 0.15, 0.06, (i % 2 - 0.5) * 0.3, q => q.sph(0.05, 6, 4)); b.g(0); };
T.mudpit = { h: 0.3 };
R.cauldron = b => { b.c('#3a3a3a').at(0, 0.32, 0, q => q.lathe([[0.2, -0.3], [0.38, -0.12], [0.4, 0.05], [0.32, 0.2], [0.3, 0.22]], 14, { capTop: false })); b.c('#7aff4a').g(1).at(0, 0.52, 0, q => q.cyl(0.3, 0.3, 0.01, 14)); for (let i = 0; i < 4; i++) b.at(-0.15 + i * 0.1, 0.56 + (i % 2) * 0.05, (i % 2 - 0.5) * 0.12, q => q.sph(0.04, 6, 4)); b.g(0); legs4(b, 0.24, 0.16, -0.16, 0.08, 0.03, '#2a2a2a'); };
T.cauldron = { h: 0.75 };

// ===== ICYLANDS =====
R.gunter = b => {   // Gunter the penguin
  b.c('#1a1a2a').at(0, 0.36, 0, q => q.ell(0.2, 0.32, 0.18, 12, 8));
  b.c('#ffffff').at(0, 0.32, 0.08, q => q.ell(0.15, 0.26, 0.12, 10, 7));
  b.eye(-0.06, 0.56, 0.13, 0.04).eye(0.06, 0.56, 0.13, 0.04);
  b.c('#ffb030').at(0, 0.5, 0.18, q => q.R(80, 0, 0).cone(0.05, 0.1, 6));
  b.c('#ffb030').at(-0.08, 0.02, 0.06, q => q.ell(0.06, 0.02, 0.09, 6, 3)).at(0.08, 0.02, 0.06, q => q.ell(0.06, 0.02, 0.09, 6, 3));
  b.b(3).c('#1a1a2a').at(-0.2, 0.38, 0, q => q.R(0, 0, 20).ell(0.04, 0.16, 0.08, 6, 4)).ch(3, -0.18, 0.5, 0, 'wing', 'z', 18).b(0);
  b.b(4).c('#1a1a2a').at(0.2, 0.38, 0, q => q.R(0, 0, -20).ell(0.04, 0.16, 0.08, 6, 4)).ch(4, 0.18, 0.5, 0, 'wing', 'z', -18).b(0);
};
T.gunter = { h: 0.5, face: 'front' };
R.penguin = b => R.gunter(b);
T.penguin = { h: 0.38, face: 'front' };
R.golem = b => { const C = '#d8f0ff'; legs2(b, 0.12, 0.2, 0.08, C); b.c(C).at(0, 0.42, 0, q => q.sph(0.3, 12, 8)); b.c(C).at(0, 0.82, 0, q => q.sph(0.2, 10, 7)); b.c('#1a2a3a').g(1).at(-0.07, 0.86, 0.18, q => q.sph(0.025, 5, 3)).at(0.07, 0.86, 0.18, q => q.sph(0.025, 5, 3)).g(0); b.c('#ff8a3a').at(0, 0.82, 0.2, q => q.R(90, 0, 0).cone(0.03, 0.12, 5)); arm(b, 3, -0.28, 0.56, 0, [[0, 0, 0], [-0.2, 0.08, 0.06]], 0.025, '#7a5a3a', 'arm', 10); arm(b, 4, 0.28, 0.56, 0, [[0, 0, 0], [0.2, 0.08, 0.06]], 0.025, '#7a5a3a', 'arm', 10, Math.PI); };
T.golem = { h: 0.74, face: 'front' };
R.sprite = b => { const C = '#a8f0ff'; b.c(C).at(0, 0.6, 0, q => q.lathe([[0, -0.2], [0.12, -0.08], [0.14, 0.06], [0.08, 0.16], [0, 0.18]], 10)); b.eye(-0.05, 0.64, 0.12, 0.03).eye(0.05, 0.64, 0.12, 0.03); b.c('#ffffff').g(1).at(0, 0.84, 0, q => q.ext(starPts(0.1, 0.04, 6), 0.02)).g(0); b.b(7).c('#e8fbff').at(-0.18, 0.62, -0.04, q => q.R(0, 0, 30).ell(0.12, 0.04, 0.06, 6, 4)).at(0.18, 0.62, -0.04, q => q.R(0, 0, -30).ell(0.12, 0.04, 0.06, 6, 4)).ch(7, 0, 0.62, 0, 'wing', 'y', 12).b(0); };
T.sprite = { h: 0.52, float: 1, face: 'front' };
R.yeti = b => { const C = '#e8f4ff'; legs2(b, 0.14, 0.26, 0.09, C); b.c(C).at(0, 0.62, 0, q => q.ell(0.34, 0.38, 0.28, 12, 8)); b.b(6).at(0, 1.02, 0.06, q => { q.c(C).sph(0.18, 10, 7); q.c('#8ab8d8').at(0, -0.02, 0.12, r => r.ell(0.12, 0.1, 0.06, 8, 5)); q.c('#1a2a3a').g(1).at(-0.05, 0.03, 0.17, r => r.sph(0.022, 5, 3)).at(0.05, 0.03, 0.17, r => r.sph(0.022, 5, 3)).g(0); }).ch(6, 0, 1.02, 0, 'head', 'y', 8).b(0); arm(b, 3, -0.32, 0.78, 0, [[0, 0, 0], [-0.12, -0.24, 0.08], [-0.1, -0.44, 0.12]], 0.08, C, 'arm', 12); arm(b, 4, 0.32, 0.78, 0, [[0, 0, 0], [0.12, -0.24, 0.08], [0.1, -0.44, 0.12]], 0.08, C, 'arm', 12, Math.PI); };
T.yeti = { h: 0.94, face: 'front' };
R.wizard = b => { const C = '#5a8ad8'; b.c(C).lathe([[0.28, 0], [0.2, 0.4], [0.15, 0.62], [0, 0.66]], 12); b.b(6).at(0, 0.74, 0, q => { q.c('#d8e8ff').sph(0.12, 10, 7); q.c('#ffffff').at(0, -0.1, 0.06, r => r.R(-10, 0, 0).cone(0.08, -0.26, 8)); q.c('#123').g(1).at(-0.04, 0.02, 0.11, r => r.sph(0.018, 5, 3)).at(0.04, 0.02, 0.11, r => r.sph(0.018, 5, 3)).g(0); q.c(C).at(0, 0.06, 0, r => r.R(-8, 0, 0).cone(0.14, 0.4, 8)); }).ch(6, 0, 0.74, 0, 'head', 'y', 8).b(0); arm(b, 4, 0.2, 0.56, 0, [[0, 0, 0], [0.1, 0.06, 0.12]], 0.035, C, 'wave', 20); b.b(4).c('#b0d8ff').at(0.34, 0.6, 0.14, q => q.cyl(0.015, 0.015, 0.8, 5)).c('#ffffff').g(1).at(0.34, 1.0, 0.14, q => q.ext(starPts(0.08, 0.035, 6), 0.02)).g(0).b(0); };
T.wizard = { h: 0.86, face: 'front' };
R.iceking = b => {   // Ice King: blue skin, long nose, huge white beard, gold crown with red gems, robe
  const C = '#3a6ad8', S = '#7ab8ff';
  b.c(C).lathe([[0.3, 0], [0.22, 0.4], [0.18, 0.62], [0, 0.66]], 12);
  b.c('#ffffff').at(0, 0.48, 0.08, q => q.R(-8, 0, 0).lathe([[0, -0.1], [0.16, 0.0], [0.2, 0.2], [0.16, 0.36], [0, 0.4]], 10));
  b.b(6).at(0, 0.86, 0.02, q => { q.c(S).sph(0.15, 10, 7); q.c(S).at(0, -0.02, 0.16, r => r.R(80, 0, 0).cone(0.05, 0.18, 6)); q.eye(-0.05, 0.03, 0.13, 0.03).eye(0.05, 0.03, 0.13, 0.03); q.c('#f0c020').at(0, 0.13, 0, r => { r.cyl(0.15, 0.16, 0.08, 10, { capTop: false }); for (let i = 0; i < 3; i++) r.at((i - 1) * 0.09, 0.08, 0.12, s => s.cone(0.035, 0.1, 4)); }); q.c('#ff2a2a').g(1); for (let i = 0; i < 3; i++) q.at((i - 1) * 0.09, 0.17, 0.12, r => r.sph(0.02, 5, 3)); q.g(0); }).ch(6, 0, 0.86, 0, 'head', 'y', 8).b(0);
  arm(b, 4, 0.2, 0.6, 0, [[0, 0, 0], [0.14, 0.1, 0.06], [0.2, 0.2, 0.06]], 0.035, C, 'wave', 20);
  b.b(4).c('#ffffff').g(1).at(0.42, 0.82, 0.06, q => q.ext(starPts(0.07, 0.03, 4), 0.02)).g(0).b(0);
};
T.iceking = { h: 0.94, face: 'front' };
R.castle = b => { const C = '#7ac8f0', L = '#e0f8ff'; b.c(C).at(0, 0.36, 0, q => q.box(0.8, 0.72, 0.6)); for (const x of [-0.4, 0.4]) { b.c(C).at(x, 0.5, 0, q => q.cyl(0.14, 0.15, 1.0, 8)); b.at(x, 1.0, 0, q => q.cone(0.17, 0.32, 8)); } b.c(C).at(0, 0.9, 0, q => q.cone(0.24, 0.4, 6)); b.c(L).g(1).at(0, 0, 0.31, q => q.ext(arch(0.2, 0.32, 6), 0.02)).g(0); };
T.castle = { h: 1.4 };
R.icepalace = b => { const C = '#5ab0e8', L = '#e8fbff'; b.c(C).at(0, 0.06, 0, q => q.box(1.2, 0.12, 0.9)); b.c(C).at(0, 0.5, -0.05, q => q.box(0.8, 0.8, 0.6)); for (const [x, h] of [[-0.48, 1.3], [0.48, 1.3], [0, 1.7]]) { b.c(C).at(x, h / 2, x === 0 ? -0.1 : 0.05, q => q.cyl(0.13, 0.16, h, 6)); b.c(L).at(x, h, x === 0 ? -0.1 : 0.05, q => q.cone(0.18, 0.36, 6)); } b.c('#0a2a4a').at(0, 0.12, 0.26, q => q.ext(arch(0.24, 0.4, 6), 0.02)); b.c(L).g(1); for (let i = 0; i < 4; i++) b.at(-0.36 + i * 0.24, 0.002, 0.42, q => q.R(-90, 0, 0).ext(starPts(0.06, 0.025, 6), 0.01)); b.g(0); };
T.icepalace = { h: 1.9 };
R.lake = b => { b.c('#a8e8ff').at(0, 0.02, 0, q => q.ell(0.5, 0.03, 0.4, 16, 4)); b.c('#ffffff').g(1).line(-0.3, 0.05, -0.1, 0.1, 0.05, 0.1, 0.012).line(0.1, 0.05, 0.1, 0.3, 0.05, -0.05, 0.012).line(-0.05, 0.05, 0.0, -0.1, 0.05, 0.25, 0.012).g(0); };
T.lake = { h: 0.2 };
R.igloo = b => { const C = '#e8f8ff', L = '#8ad8ff'; b.c(C).at(0, 0, 0, q => q.lathe([[0.5, 0], [0.46, 0.2], [0.34, 0.38], [0.18, 0.47], [0, 0.5]], 16, { capBot: false })); b.c(C).at(0, 0.14, 0.46, q => q.R(90, 0, 0).cyl(0.16, 0.16, 0.24, 10)); b.c('#1a3a5a').at(0, 0.12, 0.58, q => q.R(90, 0, 0).cyl(0.1, 0.1, 0.01, 10)); b.c(L).g(1); for (let y = 0.1; y < 0.46; y += 0.12) b.at(0, y, 0, q => q.torus(Math.sqrt(Math.max(0.01, 0.25 - y * y * 0.9)) * 1.0, 0.008, 16, 3)); b.g(0); };
T.igloo = { h: 0.75 };

// ===== NICELANDS =====
R.banana = b => { const C = '#ffe04a'; b.c(C).at(0, 0.42, 0, q => q.R(0, 0, 8).lathe([[0, -0.36], [0.1, -0.24], [0.13, 0.0], [0.11, 0.24], [0.04, 0.38], [0, 0.4]], 10)); b.c('#5a3a1a').at(0.03, 0.82, 0, q => q.cyl(0.025, 0.03, 0.08, 5)); b.c('#1a1a1a').g(1).at(-0.04, 0.56, 0.11, q => q.sph(0.018, 5, 3)).at(0.04, 0.57, 0.11, q => q.sph(0.018, 5, 3)).g(0); b.c('#c0c8d8').at(0.18, 0.4, 0.06, q => { q.cyl(0.012, 0.012, 0.8, 5); q.T(0, 0.42, 0).cone(0.04, 0.12, 5); }); };
T.banana = { h: 0.66, face: 'front' };
R.butler = b => { const C = '#ffffff'; legs2(b, 0.07, 0.14, 0.045, '#1a1a1a'); b.c('#1a1a1a').at(0, 0.3, 0, q => q.ell(0.18, 0.16, 0.14, 10, 7)); b.c(C).at(0, 0.48, 0, q => q.ell(0.2, 0.2, 0.16, 12, 8)); b.c('#ff3a5a').g(1); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.line(0, 0.48, 0.16, Math.cos(a) * 0.18, 0.48 + Math.sin(a) * 0.18, 0.09, 0.03); } b.g(0); b.eye(-0.06, 0.52, 0.15, 0.035).eye(0.06, 0.52, 0.15, 0.035); };
T.butler = { h: 0.5, face: 'front' };
R.tart = b => { const C = '#ff9ab8'; b.c('#d8a05a').at(0, 0.2, 0, q => q.cyl(0.24, 0.2, 0.2, 14)); b.c(C).at(0, 0.32, 0, q => q.ell(0.22, 0.08, 0.22, 12, 5)); b.c('#ff3a6a').at(0, 0.4, 0, q => q.sph(0.05, 6, 4)); b.eye(-0.07, 0.2, 0.2, 0.035).eye(0.07, 0.2, 0.2, 0.035); b.c('#d8a05a').at(-0.06, 0.04, 0.02, q => q.cyl(0.03, 0.03, 0.1, 5)).at(0.06, 0.04, 0.02, q => q.cyl(0.03, 0.03, 0.1, 5)); };
T.tart = { h: 0.42, face: 'front' };
R.guardian = b => { const C = '#ff7ab0'; b.c(C).at(0, 0.5, 0, q => q.box(0.5, 0.7, 0.4)); b.c('#ffd0e8').at(0, 1.02, 0, q => q.sph(0.26, 12, 8)); b.c('#ff3a6a').g(1).at(-0.09, 1.04, 0.22, q => q.sph(0.05, 6, 4)).at(0.09, 1.04, 0.22, q => q.sph(0.05, 6, 4)).g(0); legs2(b, 0.14, 0.16, 0.07, C); for (let i = 0; i < 5; i++) b.c(['#ff4a4a', '#4aff8a', '#4aa8ff', '#ffe04a', '#c04aff'][i]).at(-0.15 + (i % 3) * 0.15, 1.0 + Math.floor(i / 3) * 0.12, 0.14, q => q.sph(0.05, 6, 4)); };
T.guardian = { h: 1.0, face: 'front' };
R.cupcake = b => { const C = '#d8a05a'; legs2(b, 0.1, 0.12, 0.06, '#c08a4a'); b.c(C).at(0, 0.28, 0, q => q.cyl(0.26, 0.2, 0.3, 14)); b.c('#ffe0f0').at(0, 0.48, 0, q => q.ell(0.3, 0.16, 0.3, 12, 6)); b.c('#ff3a6a').at(0, 0.66, 0, q => q.sph(0.06, 6, 4)); b.eye(-0.09, 0.32, 0.23, 0.04).eye(0.09, 0.32, 0.23, 0.04); arm(b, 3, -0.26, 0.3, 0, [[0, 0, 0], [-0.12, 0.06, 0.04], [-0.16, 0.18, 0.06]], 0.06, '#c08a4a', 'arm', 14); arm(b, 4, 0.26, 0.3, 0, [[0, 0, 0], [0.12, 0.06, 0.04], [0.16, 0.18, 0.06]], 0.06, '#c08a4a', 'arm', 14, Math.PI); };
T.cupcake = { h: 0.62, face: 'front' };
R.pb = b => {   // Princess Bubblegum
  const C = '#ff7ab8', S = '#ffb0d8';
  b.c('#c04a9a').lathe([[0.26, 0], [0.18, 0.4], [0.12, 0.6], [0, 0.62]], 12);
  b.b(6).at(0, 0.76, 0, q => { q.c(S).sph(0.14, 10, 7); q.eye(-0.05, 0.02, 0.12, 0.025).eye(0.05, 0.02, 0.12, 0.025); q.c(C).at(0, 0.04, -0.06, r => r.ell(0.18, 0.16, 0.16, 10, 7)); q.c(C).at(0, -0.2, -0.12, r => r.ell(0.16, 0.3, 0.06, 8, 6)); q.c('#ffd040').at(0, 0.18, 0.04, r => { r.cyl(0.05, 0.06, 0.05, 8); r.T(0, 0.04, 0.04).g(1).c('#4ad0ff').sph(0.02, 5, 3).g(0); }); }).ch(6, 0, 0.76, 0, 'head', 'y', 8).b(0);
  arm(b, 4, 0.18, 0.56, 0, [[0, 0, 0], [0.1, -0.08, 0.12]], 0.03, S, 'arm', 10);
  b.b(4).c('#e0f8ff').at(0.3, 0.46, 0.18, q => q.lathe([[0.02, 0.0], [0.02, 0.08], [0.07, 0.16], [0.06, 0.22], [0, 0.23]], 8)).c('#7aff6a').g(1).at(0.3, 0.6, 0.18, q => q.sph(0.045, 6, 4)).g(0).b(0);
};
T.pb = { h: 0.94, face: 'front' };
R.tower = b => { const C = '#ff6aa8', L = '#ffd0e8'; b.c(C).at(0, 0.5, 0, q => q.cyl(0.2, 0.26, 1.0, 10)); b.c('#7ad86a').at(0, 1.1, 0, q => q.lathe([[0.3, 0], [0.26, 0.12], [0.16, 0.24], [0, 0.3]], 10)); b.c(L).g(1); for (let y = 0.2; y < 1; y += 0.25) b.at(0, y, 0, q => q.torus(0.24 - y * 0.05, 0.01, 12, 3)); b.g(0); };
T.tower = { h: 1.3 };
R.candycastle = b => { const C = '#ff8ac0', L = '#ffe0f0'; b.c(C).at(0, 0.45, 0, q => q.box(1.0, 0.9, 0.6)); for (const [x, h, c] of [[-0.55, 1.4, '#ff6aa8'], [0.55, 1.4, '#ff6aa8'], [0, 1.85, '#ffb0d8']]) { b.c(c).at(x, h / 2, x === 0 ? -0.05 : 0.05, q => q.cyl(0.15, 0.18, h, 10)); b.c('#ff4a8a').at(x, h, x === 0 ? -0.05 : 0.05, q => q.lathe([[0.22, 0], [0.18, 0.14], [0.08, 0.3], [0, 0.42]], 10)); } b.c('#5a1a3a').at(0, 0, 0.31, q => q.ext(arch(0.26, 0.42, 6), 0.02)); b.c(L).g(1); for (let i = 0; i < 4; i++) b.line(-0.5, 0.2 + i * 0.2, 0.31, 0.5, 0.2 + i * 0.2, 0.31, 0.01); b.g(0); };
T.candycastle = { h: 2.0 };
R.lab = b => { const C = '#d8e8f0'; b.c(C).at(0, 0.35, 0, q => q.box(0.8, 0.7, 0.6)); b.c('#ff7ab0').at(0, 0.78, 0, q => q.lathe([[0.3, 0], [0.24, 0.12], [0, 0.2]], 12)); b.c('#7aff6a').g(1).at(-0.2, 0.4, 0.31, q => q.lathe([[0.03, 0], [0.03, 0.08], [0.09, 0.2], [0, 0.22]], 8)).at(0.2, 0.4, 0.31, q => q.lathe([[0.03, 0], [0.03, 0.08], [0.09, 0.2], [0, 0.22]], 8)).g(0); };
T.lab = { h: 1.05 };
R.wall = b => { const C = '#ff9ac8'; b.c(C).at(0, 0.32, 0, q => q.box(1.1, 0.64, 0.3)); for (let i = 0; i < 5; i++) b.at(-0.44 + i * 0.22, 0.7, 0, q => q.box(0.14, 0.12, 0.3)); b.c('#ffffff').g(1); for (let i = 0; i < 6; i++) b.line(-0.55 + i * 0.22, 0.0, 0.16, -0.45 + i * 0.22, 0.64, 0.16, 0.025); b.g(0); };
T.wall = { h: 0.8 };
R.candy = b => { b.c('#ff4a8a').at(0, 0.3, 0, q => q.sph(0.12, 8, 6)); b.c('#ffffff').at(0, 0.12, 0, q => q.cyl(0.015, 0.015, 0.24, 5)); };

// ===== LAVAFLATS =====
const flame = (b, x, y, z, s, c1, c2) => { b.c(c1 || '#ff7a1a').g(1).at(x, y, z, q => q.lathe([[0, 0], [0.1 * s, 0.06 * s], [0.08 * s, 0.18 * s], [0, 0.32 * s]], 8)); b.c(c2 || '#ffe04a').at(x, y + 0.02 * s, z + 0.02 * s, q => q.lathe([[0, 0], [0.05 * s, 0.05 * s], [0.04 * s, 0.12 * s], [0, 0.2 * s]], 6)).g(0); return b; };
R.firepup = b => { const C = '#ff6a2a'; b.c(C).at(0, 0.36, 0, q => q.ell(0.16, 0.15, 0.3, 10, 7)); b.b(6).at(0, 0.5, 0.26, q => { q.c(C).sph(0.14, 10, 7); q.c(C).at(0, -0.03, 0.12, r => r.ell(0.07, 0.06, 0.09, 8, 5)); q.eye(-0.06, 0.03, 0.11, 0.03, '#ffe04a', '#3a0a00').eye(0.06, 0.03, 0.11, 0.03, '#ffe04a', '#3a0a00'); q.c(C).at(-0.08, 0.12, -0.02, r => r.R(-10, 0, 20).cone(0.05, 0.14, 4)).at(0.08, 0.12, -0.02, r => r.R(-10, 0, -20).cone(0.05, 0.14, 4)); }).ch(6, 0, 0.5, 0.2, 'head', 'x', 8).b(0); legs4(b, 0.09, 0.16, -0.18, 0.24, 0.035, C); b.b(5).call(q => flame(q, 0, 0.42, -0.32, 0.8)).ch(5, 0, 0.4, -0.28, 'tail', 'y', 30).b(0); };
T.firepup = { h: 0.48, face: 'side' };
R.bun = b => { const C = '#d8a060'; legs2(b, 0.09, 0.14, 0.05, C); b.c(C).at(0, 0.38, 0, q => q.ell(0.26, 0.28, 0.24, 12, 8)); b.c('#ffffff').at(0, 0.6, 0, q => q.ell(0.22, 0.08, 0.2, 10, 5)); b.c('#a8701a').g(1).at(0, 0.4, 0, q => q.torus(0.255, 0.012, 16, 3)).g(0); b.eye(-0.08, 0.44, 0.21, 0.045).eye(0.08, 0.46, 0.2, 0.035); b.c('#c0c8d8').at(0.3, 0.42, 0.08, q => { q.R(10, 0, 0).cyl(0.015, 0.015, 0.6, 5); }); b.c('#9aa8b8').at(-0.26, 0.38, 0.12, q => q.R(0, -20, 0).ell(0.03, 0.16, 0.14, 8, 5)); };
T.bun = { h: 0.58, face: 'front' };
R.flambo = b => { flame(b, 0, 0.0, 0, 2.4, '#ff5a1a', '#ffd04a'); b.eye(-0.06, 0.32, 0.14, 0.04, '#ffffff', '#1a0a00').eye(0.06, 0.32, 0.14, 0.04, '#ffffff', '#1a0a00'); b.c('#ff9a3a').b(4).at(0.18, 0.2, 0.04, q => q.tube([[0, 0, 0], [0.1, 0.06, 0.04]], 0.03, 5)).ch(4, 0.18, 0.2, 0, 'wave', 'z', 20).b(0); };
T.flambo = { h: 0.56, face: 'front' };
R.elemental = b => { const C = '#ff4a1a'; b.c(C).at(0, 0.45, 0, q => q.ell(0.22, 0.32, 0.18, 10, 7)); flame(b, 0, 0.7, 0, 1.4); flame(b, -0.12, 0.62, 0.02, 0.8); flame(b, 0.12, 0.62, 0.02, 0.8); b.eye(-0.07, 0.56, 0.16, 0.035, '#ffffff', '#3a0a00').eye(0.07, 0.56, 0.16, 0.035, '#ffffff', '#3a0a00'); arm(b, 3, -0.2, 0.5, 0, [[0, 0, 0], [-0.16, 0.06, 0.06]], 0.04, C, 'arm', 20); arm(b, 4, 0.2, 0.5, 0, [[0, 0, 0], [0.16, 0.06, 0.06]], 0.04, C, 'arm', 20, Math.PI); legs2(b, 0.08, 0.16, 0.05, C); };
T.elemental = { h: 0.8, face: 'front' };
R.lavagolem = b => { const C = '#5a2a1a', L = '#ff7a1a'; legs2(b, 0.15, 0.3, 0.1, C); b.c(C).at(0, 0.7, 0, q => q.ell(0.38, 0.36, 0.3, 9, 6)); b.c(C).at(0, 1.06, 0.04, q => q.ell(0.2, 0.16, 0.18, 8, 6)); b.c(L).g(1).at(-0.07, 1.08, 0.2, q => q.sph(0.03, 5, 3)).at(0.07, 1.08, 0.2, q => q.sph(0.03, 5, 3)); for (let i = 0; i < 5; i++) b.line(-0.3 + i * 0.15, 0.5 + (i % 2) * 0.15, 0.27, -0.2 + i * 0.12, 0.8, 0.26, 0.02); b.g(0); arm(b, 3, -0.38, 0.84, 0, [[0, 0, 0], [-0.14, -0.26, 0.06], [-0.12, -0.46, 0.1]], 0.1, C, 'arm', 10); arm(b, 4, 0.38, 0.84, 0, [[0, 0, 0], [0.14, -0.26, 0.06], [0.12, -0.46, 0.1]], 0.1, C, 'arm', 10, Math.PI); };
T.lavagolem = { h: 1.0, face: 'front' };
R.fp = b => {   // Flame Princess: orange skin, flame hair, red dress, gem
  const C = '#ff9a3a';
  b.c('#d8301a').lathe([[0.26, 0], [0.18, 0.36], [0.12, 0.58], [0, 0.6]], 12);
  b.b(6).at(0, 0.74, 0, q => { q.c(C).sph(0.13, 10, 7); q.eye(-0.05, 0.02, 0.11, 0.025, '#ffffff', '#3a0a00').eye(0.05, 0.02, 0.11, 0.025, '#ffffff', '#3a0a00'); flame(q, 0, 0.04, -0.03, 1.5, '#ff4a1a', '#ffe04a'); q.c('#ffd040').at(0, 0.13, 0.05, r => r.cone(0.04, 0.08, 5)); }).ch(6, 0, 0.74, 0, 'head', 'y', 8).b(0);
  b.c('#ffd040').g(1).at(0, 0.52, 0.13, q => q.sph(0.03, 6, 4)).g(0);
  arm(b, 4, 0.16, 0.54, 0, [[0, 0, 0], [0.12, 0.08, 0.06], [0.16, 0.18, 0.06]], 0.03, C, 'wave', 20);
  b.b(4).call(q => flame(q, 0.34, 0.74, 0.06, 0.6)).b(0);
};
T.fp = { h: 0.9, face: 'front' };
R.firepalace = b => { const C = '#c8301a', L = '#ffb040'; b.c(C).at(0, 0.5, 0, q => q.box(1.0, 1.0, 0.7)); for (const [x, h] of [[-0.55, 1.5], [0.55, 1.5], [0, 2.0]]) { b.c(C).at(x, h / 2, x === 0 ? -0.1 : 0.05, q => q.cyl(0.14, 0.18, h, 8)); flame(b, x, h, x === 0 ? -0.1 : 0.05, 1.3); } b.c('#3a0a00').at(0, 0, 0.36, q => q.ext(arch(0.28, 0.46, 6), 0.02)); b.c(L).g(1); for (let i = 0; i < 4; i++) b.line(-0.5, 0.22 + i * 0.22, 0.36, 0.5, 0.22 + i * 0.22, 0.36, 0.012); b.g(0); };
T.firepalace = { h: 2.1 };
R.forge = b => { const C = '#6a3a2a'; b.c(C).at(0, 0.3, 0, q => q.box(0.7, 0.6, 0.6)); b.c(C).at(0.18, 0.8, -0.1, q => q.cyl(0.08, 0.1, 0.6, 8)); b.c('#ff7a1a').g(1).at(0, 0.24, 0.31, q => q.ext(arch(0.3, 0.32, 6), 0.02)).g(0); b.c('#3a3a3a').at(-0.1, 0.66, 0.1, q => q.box(0.3, 0.12, 0.18)); };
T.forge = { h: 1.1 };
R.cannon = b => { const C = '#5a3a2a'; b.c(C).at(0, 0.15, 0, q => q.box(0.5, 0.3, 0.5)); b.c('#2a2a2a').at(0, 0.42, 0.1, q => q.R(-70, 0, 0).cyl(0.12, 0.16, 0.7, 12)); b.c('#ff7a1a').g(1).at(0, 0.54, 0.42, q => q.R(-70, 0, 0).cyl(0.09, 0.09, 0.01, 10)).g(0); b.c('#7a5a3a').at(-0.27, 0.15, 0, q => q.R(0, 0, 90).cyl(0.14, 0.14, 0.04, 10)).at(0.27, 0.15, 0, q => q.R(0, 0, 90).cyl(0.14, 0.14, 0.04, 10)); };
T.cannon = { h: 0.8 };
R.firepit = b => { b.c('#4a3a3a'); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.at(Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32, q => q.sph(0.09, 6, 4)); } flame(b, 0, 0.0, 0, 1.6); flame(b, 0.1, 0, 0.06, 1.0); flame(b, -0.1, 0, -0.04, 1.1); };
T.firepit = { h: 0.6 };

// ===== RAINBOW =====
R.hotdog = b => { const C = '#e8a05a'; legs2(b, 0.07, 0.16, 0.045, '#a0a8b8'); b.c(C).at(0, 0.42, 0, q => q.R(0, 0, 0).ell(0.14, 0.3, 0.12, 10, 7)); b.c('#d83a2a').at(0, 0.46, 0.02, q => q.ell(0.08, 0.32, 0.08, 8, 6)); b.c('#ffe04a').g(1).at(0, 0.5, 0.1, q => q.tube([[0, -0.2, 0], [0.03, -0.1, 0], [-0.03, 0, 0], [0.03, 0.1, 0], [-0.02, 0.2, 0]], 0.012, 4)).g(0); b.c('#c0c8d8').at(0, 0.8, 0, q => { q.ell(0.13, 0.1, 0.12, 10, 6); q.T(0, 0.1, 0).cone(0.04, 0.12, 5); }); b.eye(-0.04, 0.6, 0.1, 0.025).eye(0.04, 0.6, 0.1, 0.025); b.c('#c0c8d8').at(0.18, 0.42, 0.08, q => q.cyl(0.012, 0.012, 0.6, 5)); };
T.hotdog = { h: 0.56, face: 'front' };
R.poundcake = b => { const C = '#f0d8a0'; legs2(b, 0.08, 0.12, 0.05, C); b.c(C).at(0, 0.34, 0, q => q.box(0.4, 0.36, 0.3)); b.c('#ffffff').at(0, 0.56, 0, q => q.box(0.42, 0.08, 0.32)); b.c('#ffffff').at(0, 0.66, 0, q => q.cyl(0.1, 0.12, 0.12, 10)); b.c('#ff3a3a').g(1).at(0, 0.66, 0.11, q => { q.box(0.06, 0.02, 0.01); q.box(0.02, 0.06, 0.01); }).g(0); b.eye(-0.08, 0.4, 0.16, 0.035).eye(0.08, 0.4, 0.16, 0.035); };
T.poundcake = { h: 0.54, face: 'front' };
R.cooper = b => { const C = '#a07a4a'; legs2(b, 0.08, 0.26, 0.05, '#5a4a3a'); b.c('#6a8ac0').at(0, 0.5, 0, q => q.ell(0.18, 0.2, 0.14, 10, 7)); b.b(6).at(0, 0.8, 0, q => { q.c('#ffd0a8').sph(0.12, 10, 7); q.c('#5a3a1a').at(0, 0.08, 0, r => r.ell(0.13, 0.06, 0.13, 8, 5)); q.c('#123').g(1).at(-0.04, 0.02, 0.11, r => r.sph(0.018, 5, 3)).at(0.04, 0.02, 0.11, r => r.sph(0.018, 5, 3)).g(0); }).ch(6, 0, 0.8, 0, 'head', 'y', 8).b(0); b.c(C).at(0.26, 0.24, 0.12, q => { q.lathe([[0.13, -0.18], [0.16, 0.0], [0.13, 0.18]], 10); q.c('#5a5a5a').g(1); for (const y of [-0.12, 0.12]) q.T(0, 0, 0).at(0, y, 0, r => r.torus(0.15, 0.01, 12, 3)); q.g(0); }); arm(b, 4, 0.18, 0.6, 0, [[0, 0, 0], [0.1, -0.1, 0.1]], 0.035, '#ffd0a8', 'arm', 20); };
T.cooper = { h: 0.66, face: 'front' };
R.ultradog = b => { R.cooldog(b); b.c('#ff3aa0').g(1); for (let i = 0; i < 5; i++) b.at(0, 0.94 - 0.0, 0.42 - i * 0.07, q => q.R(-10, 0, 0).cone(0.03, 0.12 - Math.abs(i - 2) * 0.02, 4)); b.g(0); };
T.ultradog = { h: 0.66, face: 'side' };
R.treefort = b => { b.c('#7a5a2a').at(0, 0.45, 0, q => q.cyl(0.1, 0.16, 0.9, 8)); b.c('#5aa83a').at(0, 1.05, 0, q => { q.sph(0.42, 10, 7); q.at(-0.3, -0.1, 0, r => r.sph(0.24, 8, 6)); q.at(0.32, -0.08, 0.05, r => r.sph(0.26, 8, 6)); }); b.c('#a07a4a').at(0, 0.7, 0.18, q => q.box(0.34, 0.26, 0.2)); b.c('#ffd070').g(1).at(0, 0.72, 0.29, q => q.box(0.1, 0.1, 0.01)).g(0); };
T.treefort = { h: 1.4 };
R.portal = b => { b.c('#8a5ad8').at(0, 0.5, 0, q => q.R(90, 0, 0).torus(0.36, 0.06, 18, 6)); b.c('#e0b0ff').g(1).at(0, 0.5, 0, q => q.ext(circlePts(0.3, 16), 0.02)).g(0); b.c('#5a3aa0').at(0, 0.06, 0, q => q.box(0.5, 0.12, 0.3)); };
T.portal = { h: 1.0 };
R.booby = b => { b.c('#7a6a5a').at(0, 0.04, 0, q => q.cyl(0.3, 0.32, 0.08, 12)); b.c('#c0c8d8').g(1); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.at(Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24, q => q.cone(0.04, 0.12, 4)); } b.g(0); };
T.booby = { h: 0.25 };
R.volcano = b => {   // Volcano: a big cone with a glowing crater and lava drips (Volcano)
  const C = '#a8301a', L = '#ffb02a';
  b.c(C).lathe([[0.8, 0], [0.6, 0.4], [0.36, 0.95], [0.26, 1.1], [0.2, 1.08]], 16, { capTop: false });
  b.c('#ff5a1a').g(1).at(0, 1.06, 0, q => q.cyl(0.22, 0.22, 0.02, 14));
  b.c(L);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; const l = 0.3 + (i % 3) * 0.15; b.tube([[Math.cos(a) * 0.26, 1.08, Math.sin(a) * 0.26], [Math.cos(a) * (0.3 + l * 0.35), 1.08 - l, Math.sin(a) * (0.3 + l * 0.35)]], 0.035, 5); }
  b.g(0);
  b.b(7).call(q => flame(q, 0, 1.08, 0, 1.6, '#ff3a0a', '#ffe04a')).ch(7, 0, 1.08, 0, 'bounce', 'y', 6).b(0);
};
T.volcano = { h: 1.7 };
R.trap = b => { b.c('#6a5a4a').at(0, 0.03, 0, q => q.cyl(0.32, 0.34, 0.06, 12)); b.c('#ffffff').g(1).at(0, 0.08, 0, q => q.ext([[-0.04, -0.12], [0.04, -0.12], [0.03, 0.04], [0.1, 0.08], [0.08, 0.16], [-0.02, 0.18], [-0.1, 0.12], [-0.02, 0.1], [-0.04, 0.0]], 0.02)).g(0); };
T.trap = { h: 0.3 };

// ===== SPELL ICONS (card art + the big spell effects on the board) =====
R.bloodstorm = b => {   // a big pink brain cloud raining blood (Cerebral_bloodstorm)
  const C = '#ff5ac0', D = '#c03090';
  for (const [x, y, z, r] of [[0, 0.9, 0, 0.32], [-0.28, 0.86, 0.02, 0.24], [0.28, 0.86, 0.0, 0.25], [-0.14, 1.08, 0.0, 0.22], [0.16, 1.08, -0.02, 0.22], [0, 0.82, 0.18, 0.2]]) b.c(C).at(x, y, z, q => q.sph(r, 10, 7));
  b.c(D).g(1); for (let i = 0; i < 7; i++) b.line(-0.4 + i * 0.13, 0.86 + Math.sin(i) * 0.12, 0.3, -0.34 + i * 0.13, 1.02 + Math.cos(i) * 0.1, 0.24, 0.016); b.g(0);
  b.c('#d01a3a').g(1); for (let i = 0; i < 14; i++) { const x = -0.4 + (i * 0.37 % 0.8), z = -0.2 + (i * 0.53 % 0.4); b.line(x, 0.6 - (i % 3) * 0.12, z, x - 0.02, 0.42 - (i % 3) * 0.12, z, 0.012); } b.g(0);
};
R.fireball = b => { b.c('#ff5a1a').g(1).at(0, 0.5, 0, q => q.sph(0.26, 12, 8)).g(0); flame(b, 0, 0.6, -0.1, 1.6); flame(b, -0.12, 0.5, -0.12, 1.0); };
R.freeze = b => { b.c('#a8e8ff').g(1).at(0, 0.5, 0, q => q.ext(starPts(0.42, 0.14, 6), 0.06)).g(0); };
R.blizzard = b => { b.c('#d8f4ff'); for (const [x, y, r] of [[0, 0.9, 0.3], [-0.3, 0.84, 0.22], [0.3, 0.86, 0.24]]) b.at(x, y, 0, q => q.sph(r, 10, 7)); b.c('#ffffff').g(1); for (let i = 0; i < 8; i++) b.at(-0.4 + i * 0.11, 0.5 - (i % 3) * 0.12, 0.1, q => q.ext(starPts(0.05, 0.02, 6), 0.01)); b.g(0); };
R.snowday = b => R.blizzard(b);
R.bubble = b => { b.c('#ffb0e0').g(1).at(0, 0.5, 0, q => q.sph(0.4, 14, 10)).g(0); b.c('#ffffff').at(-0.14, 0.66, 0.3, q => q.sph(0.06, 6, 4)); };
R.science = b => { b.c('#e0f8ff').at(0, 0.3, 0, q => q.lathe([[0.04, 0.4], [0.04, 0.26], [0.22, 0.02], [0.2, 0.0], [0, 0]], 12, { capTop: false })); b.c('#7aff6a').g(1).at(0, 0.36, 0, q => q.cyl(0.14, 0.19, 0.12, 12)).g(0); for (let i = 0; i < 3; i++) b.c('#b0ffb0').at(0.02 * i, 0.74 + i * 0.1, 0, q => q.sph(0.035 + i * 0.01, 6, 4)); };
R.justice = b => { b.c('#ffd040').at(0, 0.5, 0, q => q.cyl(0.02, 0.02, 0.8, 6)).at(0, 0.84, 0, q => q.R(0, 0, 90).cyl(0.015, 0.015, 0.7, 5)); for (const x of [-0.32, 0.32]) b.at(x, 0.62, 0, q => q.lathe([[0.14, 0], [0.12, 0.04], [0, 0.05]], 10)); b.c('#ff7ab0').g(1).at(0, 0.92, 0, q => q.sph(0.05, 6, 4)).g(0); };
R.eruption = b => R.volcano(b);
R.heatwave = b => { for (let i = 0; i < 4; i++) flame(b, -0.36 + i * 0.24, 0.1, 0, 1.4 + (i % 2) * 0.4); };
R.harvest = b => { b.c('#b07af0').g(1); for (let i = 0; i < 3; i++) b.at(-0.25 + i * 0.25, 0.5 + (i % 2) * 0.2, 0, q => q.lathe([[0, -0.2], [0.1, -0.06], [0.12, 0.06], [0.06, 0.14], [0, 0.16]], 8)); b.g(0); b.c('#ffffff').g(1); for (let i = 0; i < 3; i++) b.at(-0.25 + i * 0.25 - 0.03, 0.55 + (i % 2) * 0.2, 0.1, q => q.sph(0.02, 5, 3)).at(-0.25 + i * 0.25 + 0.03, 0.55 + (i % 2) * 0.2, 0.1, q => q.sph(0.02, 5, 3)); b.g(0); };
R.unearth = b => { b.c('#5a3a2a').at(0, 0.08, 0, q => q.ell(0.42, 0.08, 0.3, 12, 4)); b.c('#7a9a5a').at(0, 0.3, 0.05, q => q.tube([[0, -0.1, 0], [0.02, 0.2, 0.02], [0.08, 0.36, 0.04]], 0.05, 6)); for (let i = 0; i < 3; i++) b.at(0.08 + i * 0.03, 0.4, 0.06, q => q.tube([[0, 0, 0], [0.02 + i * 0.03, 0.1, 0.02]], 0.015, 4)); };
R.breath = b => { b.c('#9ad08a').g(1); for (let i = 0; i < 5; i++) b.at(-0.3 + i * 0.15, 0.4 + Math.sin(i * 1.7) * 0.12, 0, q => q.sph(0.12 + (i % 2) * 0.04, 8, 6)); b.g(0); };
R.math = b => { b.c('#4aa8ff').g(1).at(0, 0.5, 0, q => q.ext([[-0.06, -0.3], [0.06, -0.3], [0.06, -0.06], [0.3, -0.06], [0.3, 0.06], [0.06, 0.06], [0.06, 0.3], [-0.06, 0.3], [-0.06, 0.06], [-0.3, 0.06], [-0.3, -0.06], [-0.06, -0.06]], 0.08)).g(0); };
R.rainicorn = b => { const cols = ['#ff4a4a', '#ff9a3a', '#ffe04a', '#4aff6a', '#4aa8ff', '#a84aff']; cols.forEach((c, i) => b.c(c).at(0, 0.2, 0, q => q.R(90, 0, 0).S(1, 1, 0.3).torus(0.5 - i * 0.05, 0.026, 18, 4))); };
R.advtime = b => { b.c('#ffffff').at(0, 0.5, 0, q => q.sph(0.26, 12, 8)); b.c('#ffffff').at(-0.16, 0.74, 0, q => q.cyl(0.05, 0.06, 0.14, 8)).at(0.16, 0.74, 0, q => q.cyl(0.05, 0.06, 0.14, 8)); b.c('#ffe0c8').at(0, 0.46, 0.14, q => q.ell(0.18, 0.15, 0.1, 10, 6)); b.c('#111').g(1).at(-0.06, 0.48, 0.24, q => q.sph(0.02, 5, 3)).at(0.06, 0.48, 0.24, q => q.sph(0.02, 5, 3)).g(0); };
R.teleport = b => { b.c('#a07aff').g(1); for (let i = 0; i < 3; i++) b.at(0, 0.2 + i * 0.25, 0, q => q.torus(0.36 - i * 0.07, 0.02, 18, 4)); b.g(0); };
R.reclaim = b => { b.c('#8aa04a').at(0, 0.1, 0, q => q.box(0.9, 0.12, 0.7)); b.c('#ffe04a').g(1); for (let i = 0; i < 9; i++) b.at(-0.32 + (i % 3) * 0.32, 0.2, -0.22 + Math.floor(i / 3) * 0.22, q => q.cone(0.03, 0.3, 4)); b.g(0); b.c('#7aff6a').g(1).at(0, 0.6, 0, q => q.torus(0.3, 0.025, 18, 4)).g(0); };
R.pancakes = b => { b.c('#ffffff').at(0, 0.04, 0, q => q.cyl(0.4, 0.42, 0.04, 16)); for (let i = 0; i < 4; i++) b.c('#e0a050').at(0, 0.1 + i * 0.07, 0, q => q.cyl(0.3, 0.3, 0.06, 14)); b.c('#c03a2a').at(0.05, 0.42, 0, q => q.R(0, 30, 0).box(0.4, 0.03, 0.08)); };
R.glory = b => { b.c('#c0c8d8').at(0, 0.5, 0, q => q.cyl(0.02, 0.02, 1.0, 6)); b.c('#ff4a4a').at(0.2, 0.86, 0, q => q.box(0.38, 0.24, 0.02)); b.c('#ffe04a').g(1).at(0.2, 0.86, 0.02, q => q.ext(starPts(0.07, 0.03, 5), 0.01)).g(0); };
R.nightmares = b => { b.c('#3a1a5a').g(1); for (let i = 0; i < 6; i++) b.at(-0.4 + i * 0.16, 0.3 + (i % 2) * 0.12, (i % 3 - 1) * 0.1, q => q.sph(0.16, 8, 6)); b.c('#ffe04a'); b.at(-0.12, 0.42, 0.22, q => q.ell(0.04, 0.02, 0.01, 6, 3)).at(0.12, 0.42, 0.22, q => q.ell(0.04, 0.02, 0.01, 6, 3)); b.g(0); };
R.plant = b => { b.c('#6a4a2a').at(0, 0.06, 0, q => q.ell(0.4, 0.06, 0.3, 10, 4)); b.c('#6aa83a').at(0, 0.36, 0, q => q.cyl(0.025, 0.03, 0.6, 5)); b.c('#ffe04a').at(0.06, 0.48, 0.04, q => q.ell(0.06, 0.14, 0.06, 8, 5)); b.c('#6aa83a').at(-0.08, 0.36, 0, q => q.R(0, 0, 30).ell(0.03, 0.18, 0.02, 5, 4)); };
R.back = b => { b.c('#d8301a').at(0, 0.5, 0, q => q.box(0.6, 0.84, 0.02)); };

// ===== PROPS (physical, on the table) =====
R.soda = b => { b.c('#4fc84a').lathe([[0.3, 0], [0.32, 0.08], [0.32, 1.1], [0.26, 1.3], [0.12, 1.5], [0.11, 1.68], [0.13, 1.7], [0.13, 1.76], [0, 1.77]], 16); b.c('#ffffff').at(0, 0.62, 0, q => q.cyl(0.325, 0.325, 0.5, 16, { capTop: false, capBot: false })); };
R.coolcup = b => { b.c('#d8eef6').lathe([[0.26, 0], [0.3, 0.9], [0.29, 0.9], [0.25, 0.04]], 16, { capTop: false }); b.c('#ff9a3a').at(0, 0.5, 0, q => q.cyl(0.25, 0.27, 0.5, 14, { capTop: false })); };
R.dweeb = b => { b.c('#ffffff').lathe([[0.3, 0], [0.32, 0.72], [0.29, 0.72], [0.27, 0.05]], 16, { capTop: false }); b.c('#ffffff').at(0.33, 0.38, 0, q => q.R(90, 0, 0).torus(0.13, 0.04, 12, 6)); b.c('#5a7a2a').at(0, 0.6, 0, q => q.cyl(0.27, 0.27, 0.01, 14)); };
R.chips = b => { b.c('#ff4aa0').at(0, 0.12, 0, q => q.S(1, 0.35, 0.55).sph(0.6, 14, 8)); b.c('#ffe04a'); for (let i = 0; i < 9; i++) b.at(-0.5 + (i % 3) * 0.12 - 0.3, 0.06, 0.2 + Math.floor(i / 3) * 0.12, q => q.R(10 * i, 30 * i, 0).ell(0.09, 0.02, 0.08, 6, 3)); };
R.cardbox = b => { b.c('#d8c8a0').at(0, 0.22, 0, q => q.box(1.0, 0.44, 0.7)); b.c('#c03a2a').at(0, 0.45, 0, q => q.box(1.02, 0.04, 0.72)); };
R.plate = b => { b.c('#ffffff').at(0, 0.03, 0, q => q.cyl(0.5, 0.42, 0.06, 18)); b.c('#e8c080').at(0, 0.12, 0, q => q.box(0.56, 0.08, 0.4)); b.c('#5ab83a').at(0, 0.18, 0, q => q.box(0.6, 0.03, 0.44)); b.c('#e8c080').at(0, 0.23, 0, q => q.box(0.56, 0.08, 0.4)); };

// ===== OPPONENTS behind the table =====
// Each faces +z (toward the board), hands at table height (y ~ 0), head rising above the far edge.
const hands = (b, col, spread) => { for (const s of [-1, 1]) b.c(col).at(s * (spread || 0.45), 0.25, 0.55, q => q.sph(0.14, 8, 6)); };
R.jake = b => {
  const C = '#f4b51e', D = '#d08c12';
  b.c(C).at(0, 0.55, -0.1, q => q.ell(1.05, 0.75, 0.75, 16, 10));                       // body/shoulders behind the table
  b.b(6).push().T(0, 1.42, 0.05);
  b.c(C).ell(0.95, 0.78, 0.72, 18, 12);                                                    // big wide head
  b.c(D).at(-0.78, 0.5, -0.1, q => q.R(0, 0, 25).ell(0.1, 0.16, 0.08, 8, 6)).at(0.78, 0.5, -0.1, q => q.R(0, 0, -25).ell(0.1, 0.16, 0.08, 8, 6));   // little ears
  for (const x of [-0.34, 0.34]) b.at(x, 0.2, 0.6, q => { q.c('#ffffff').ell(0.27, 0.27, 0.16, 14, 9); q.c('#121212').T(x > 0 ? -0.06 : 0.06, -0.08, 0.13).ell(0.075, 0.08, 0.05, 8, 6); });
  b.c(C).at(-0.2, -0.24, 0.6, q => q.ell(0.26, 0.2, 0.18, 12, 8)).at(0.2, -0.24, 0.6, q => q.ell(0.26, 0.2, 0.18, 12, 8));   // jowls
  b.c('#141414').at(0, -0.08, 0.76, q => q.ell(0.16, 0.1, 0.1, 10, 6));                  // nose
  b.c(D).g(1).line(-0.1, -0.42, 0.72, 0.1, -0.42, 0.72, 0.025).g(0);
  b.pop().ch(6, 0, 1.42, 0.05, 'head', 'x', 3).b(0);
  b.c(C).at(-0.55, 0.62, 0.55, q => q.tube([[0, -0.3, -0.2], [0.12, 0.0, 0.1], [0.32, 0.16, 0.32]], 0.12, 8)).at(0.55, 0.62, 0.55, q => q.tube([[0, -0.3, -0.2], [-0.12, 0.0, 0.1], [-0.32, 0.16, 0.32]], 0.12, 8));
  b.c(C).at(-0.22, 0.78, 0.88, q => q.sph(0.13, 8, 6)).at(0.22, 0.78, 0.88, q => q.sph(0.13, 8, 6));
};
T.jake = { h: 2.4, hold: [0, 0.92, 0.95] };
R.finn = b => { const S = '#ffe0c8'; b.c('#4ab0e8').at(0, 0.6, 0, q => q.ell(0.7, 0.7, 0.55, 14, 9)); b.c('#ffffff').at(0, 1.55, 0, q => q.ell(0.62, 0.55, 0.55, 14, 9)); b.c('#ffffff').at(-0.42, 2.02, 0, q => q.ell(0.13, 0.2, 0.13, 8, 6)).at(0.42, 2.02, 0, q => q.ell(0.13, 0.2, 0.13, 8, 6)); b.c(S).at(0, 1.42, 0.3, q => q.ell(0.42, 0.34, 0.3, 12, 8)); b.c('#111').g(1).at(-0.14, 1.48, 0.58, q => q.sph(0.045, 6, 4)).at(0.14, 1.48, 0.58, q => q.sph(0.045, 6, 4)).g(0); b.c('#4ad06a').at(0, 0.7, -0.5, q => q.box(0.7, 0.8, 0.3)); hands(b, S, 0.42); };
T.finn = { h: 2.3 };
R.treetrunks = b => { const C = '#9ad87a'; b.c(C).at(0, 0.9, 0, q => q.ell(0.7, 0.7, 0.6, 14, 9)); b.c(C).at(-0.62, 1.05, 0, q => q.ell(0.32, 0.45, 0.1, 10, 7)).at(0.62, 1.05, 0, q => q.ell(0.32, 0.45, 0.1, 10, 7)); b.c(C).at(0, 0.7, 0.55, q => q.tube([[0, 0.15, 0], [0, -0.2, 0.18], [0, -0.45, 0.3], [0, -0.55, 0.2]], [0.14, 0.12, 0.1, 0.08], 8)); b.eye(-0.22, 1.05, 0.52, 0.11).eye(0.22, 1.05, 0.52, 0.11); b.c('#ff9ab8').at(0, 1.62, 0, q => { q.cyl(0.36, 0.4, 0.06, 14); q.T(0, 0.12, 0).cyl(0.22, 0.24, 0.2, 12); }); hands(b, C); };
T.treetrunks = { h: 1.9 };
R.cinnamonbun = b => { const C = '#d8a060'; b.c(C).at(0, 0.9, 0, q => q.ell(0.85, 0.9, 0.7, 14, 9)); b.c('#ffffff').at(0, 1.62, 0, q => q.ell(0.72, 0.22, 0.62, 12, 6)); b.eye(-0.26, 1.12, 0.62, 0.15).eye(0.22, 1.18, 0.6, 0.11); b.c('#7a4a1a').g(1).at(0, 0.82, 0.66, q => q.ell(0.18, 0.06, 0.04, 8, 4)).g(0); hands(b, C); };
T.cinnamonbun = { h: 2.0 };
R.gunter_big = b => { b.S(2.6).call(R.gunter); };
T.gunter_big = { h: 1.4 };
R.lemongrab = b => { const C = '#ffe84a'; b.c('#5a5a6a').at(0, 0.55, 0, q => q.ell(0.6, 0.6, 0.45, 12, 8)); b.c(C).at(0, 1.55, 0, q => q.ell(0.42, 0.62, 0.42, 14, 10)); b.c(C).at(0, 2.2, 0, q => q.cone(0.1, 0.22, 6)); b.c(C).at(-0.46, 1.6, 0, q => q.R(0, 0, 80).cone(0.08, 0.26, 5)).at(0.46, 1.6, 0, q => q.R(0, 0, -80).cone(0.08, 0.26, 5)); b.eye(-0.14, 1.66, 0.36, 0.08).eye(0.14, 1.66, 0.36, 0.08); b.c('#3a3a0a').g(1).line(-0.18, 1.36, 0.4, 0.18, 1.36, 0.4, 0.035).g(0); hands(b, C); };
T.lemongrab = { h: 2.3 };
R.lsp = b => { const C = '#b07ae0'; for (const [x, y, z, r] of [[0, 1.0, 0, 0.7], [-0.5, 0.9, 0.1, 0.45], [0.52, 0.92, 0.06, 0.46], [-0.2, 1.5, 0.0, 0.42], [0.25, 1.5, 0.04, 0.4], [0, 0.55, 0.3, 0.4]]) b.c(C).at(x, y, z, q => q.sph(r, 12, 8)); b.c('#ffe04a').g(1).at(0, 1.75, 0.4, q => q.ext(starPts(0.18, 0.08, 5, 0, 0, Math.PI / 2), 0.05)).g(0); b.eye(-0.16, 1.18, 0.62, 0.07).eye(0.16, 1.18, 0.62, 0.07); hands(b, C); };
T.lsp = { h: 2.1 };
R.bmo = b => { const C = '#5ac8b0'; b.c(C).at(0, 1.0, 0, q => q.box(1.2, 1.5, 0.7)); b.c('#c8f8e8').at(0, 1.25, 0.36, q => q.box(0.86, 0.66, 0.02)); b.c('#1a3a3a').g(1).at(-0.2, 1.32, 0.38, q => q.box(0.07, 0.07, 0.01)).at(0.2, 1.32, 0.38, q => q.box(0.07, 0.07, 0.01)).at(0, 1.12, 0.38, q => q.box(0.22, 0.03, 0.01)).g(0); b.c('#ffe04a').at(-0.3, 0.62, 0.36, q => { q.box(0.2, 0.06, 0.04); q.box(0.06, 0.2, 0.04); }); b.c('#ff4a6a').at(0.32, 0.6, 0.37, q => q.cyl(0.07, 0.07, 0.04, 10)); hands(b, C); };
T.bmo = { h: 1.9 };
R.pb_big = b => { const S = '#ffb0d8', C = '#ff7ab8'; b.c('#c04a9a').at(0, 0.6, 0, q => q.ell(0.6, 0.65, 0.45, 12, 8)); b.c(S).at(0, 1.55, 0, q => q.ell(0.48, 0.52, 0.45, 14, 9)); b.c(C).at(0, 1.72, -0.1, q => q.ell(0.6, 0.55, 0.5, 14, 9)); b.c(C).at(0, 1.1, -0.3, q => q.ell(0.6, 0.8, 0.2, 10, 7)); b.eye(-0.17, 1.56, 0.4, 0.08).eye(0.17, 1.56, 0.4, 0.08); b.c('#ffd040').at(0, 2.2, 0.15, q => q.cyl(0.14, 0.17, 0.14, 8)); hands(b, S); };
T.pb_big = { h: 2.4 };
R.fp_big = b => { const S = '#ff9a3a'; b.c('#d8301a').at(0, 0.6, 0, q => q.ell(0.6, 0.65, 0.45, 12, 8)); b.c(S).at(0, 1.55, 0, q => q.ell(0.46, 0.5, 0.42, 14, 9)); flame(b, 0, 1.75, -0.12, 4.2, '#ff4a1a', '#ffe04a'); b.eye(-0.16, 1.58, 0.38, 0.08, '#ffffff', '#3a0a00').eye(0.16, 1.58, 0.38, 0.08, '#ffffff', '#3a0a00'); hands(b, S); };
T.fp_big = { h: 2.5 };
R.iceking_big = b => { const S = '#7ab8ff'; b.c('#3a6ad8').at(0, 0.6, 0, q => q.ell(0.7, 0.7, 0.5, 12, 8)); b.c(S).at(0, 1.6, 0, q => q.ell(0.45, 0.5, 0.42, 14, 9)); b.c(S).at(0, 1.5, 0.45, q => q.R(80, 0, 0).cone(0.12, 0.45, 8)); b.c('#ffffff').at(0, 1.0, 0.35, q => q.ell(0.5, 0.75, 0.3, 12, 8)); b.eye(-0.16, 1.66, 0.36, 0.07).eye(0.16, 1.66, 0.36, 0.07); b.c('#f0c020').at(0, 2.08, 0, q => { q.cyl(0.36, 0.4, 0.2, 12, { capTop: false }); for (let i = 0; i < 3; i++) q.at((i - 1) * 0.22, 0.16, 0.3, r => r.cone(0.08, 0.24, 4)); }); b.c('#ff2a2a').g(1); for (let i = 0; i < 3; i++) b.at((i - 1) * 0.22, 2.22, 0.33, q => q.sph(0.05, 6, 4)); b.g(0); hands(b, S); };
T.iceking_big = { h: 2.6 };
R.marceline = b => { const S = '#a8b8c8'; b.c('#3a3a5a').at(0, 0.6, 0, q => q.ell(0.6, 0.65, 0.45, 12, 8)); b.c('#1a1a2a').at(0, 1.3, -0.2, q => q.ell(0.62, 1.1, 0.3, 12, 8)); b.c(S).at(0, 1.6, 0.06, q => q.ell(0.42, 0.5, 0.4, 14, 9)); b.c('#1a1a2a').at(0, 1.85, 0.0, q => q.ell(0.48, 0.32, 0.45, 12, 7)); b.eye(-0.15, 1.62, 0.42, 0.07).eye(0.15, 1.62, 0.42, 0.07); b.c('#ffffff').g(1).at(-0.06, 1.38, 0.44, q => q.R(180, 0, 0).cone(0.025, 0.07, 4)).at(0.06, 1.38, 0.44, q => q.R(180, 0, 0).cone(0.025, 0.07, 4)).g(0); hands(b, S); };
T.marceline = { h: 2.4 };

// ---------------------------------------------------------------- public
const cache = {};
function build(id) {
  if (cache[id]) return cache[id];
  const fn = R[id] || R.trap;
  const b = new Builder();
  fn(b);
  const m = b.finish(Object.assign({ id }, T[id] || {}));
  cache[id] = m;
  return m;
}
const OPPONENT = { jake: 'jake', finn: 'finn', treetrunks: 'treetrunks', cinnamonbun: 'cinnamonbun', gunter: 'gunter_big', lemongrab: 'lemongrab', lsp: 'lsp', bmo: 'bmo', pb: 'pb_big', fp: 'fp_big', iceking: 'iceking_big', marceline: 'marceline' };
return { Builder, build, has: id => !!R[id], tag: id => T[id] || {}, STRIDE, OPPONENT, ids: () => Object.keys(R) };
})();
/* END MODELS */
