/* =====================================================================
   HUMANOIDS: one skinned mesh per character (plus glossy eyes).
   Bodies are the two CC-BY base meshes in BODY_DATA (male = frame I,
   female = frame II; credits in 05_bodies.js and on the title screen),
   rigged to the game skeleton by tools/build_bodies.py:
     hips → spine → chest → neck → head (lidL/R, hairTail)
     chest → clav → sh → el → hand → fing → fing2, hand → thumb
     hips → hip → kn → ankle → toe
   Clothing is painted per triangle; triangles are split along hems,
   cuffs, belts and boot tops so edges stay crisp on the low-poly body.
   Garments, hair and the face are fitted to cross-sections and ray
   casts taken from the actual mesh. Everything faces +Z, arms hang -Y.
   ===================================================================== */
const _sv = V3(), _sn = V3(), _sc = new THREE.Color(), _sc2 = new THREE.Color();
class SkinBuilder {
  constructor(bones) { this.bones = bones; this.idx = new Map(bones.map((b, i) => [b.name, i])); this.bind = new Map(); this.pos = []; this.nor = []; this.col = []; this.si = []; this.sw = []; }
  bonePos(name) { if (!this.bind.has(name)) { const b = this.bones[this.idx.get(name)]; const v = V3(); let o = b; while (o && o.isBone) { v.add(o.position); o = o.parent; } this.bind.set(name, v); } return this.bind.get(name); }
  /* geo in bone-local space via (p, r, s); opt: deform(v), color(v, n) -> Color|hex, weights(v) -> [[bone, w], …], ao, flat, keep(v) */
  add(geo, color, bone, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], opt = {}) {
    let g = geo.clone(); const a = g.attributes.position;
    if (opt.deform) { for (let i = 0; i < a.count; i++) { _sv.fromBufferAttribute(a, i); opt.deform(_sv); a.setXYZ(i, _sv.x, _sv.y, _sv.z); } }
    TMP.e.set(r[0], r[1], r[2]); TMP.q.setFromEuler(TMP.e); TMP.m.compose(TMP.v1.set(p[0], p[1], p[2]), TMP.q, TMP.v2.set(s[0], s[1], s[2])); g.applyMatrix4(TMP.m);
    g.computeVertexNormals(); if (g.index) g = g.toNonIndexed(); if (opt.flat) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal; const bp = this.bonePos(bone); const bi = this.idx.get(bone);
    if (bi === undefined) throw new Error('unknown bone ' + bone);
    let minY = Infinity, maxY = -Infinity; if (opt.ao) for (let i = 0; i < P.count; i++) { minY = Math.min(minY, P.getY(i)); maxY = Math.max(maxY, P.getY(i)); }
    const base = new THREE.Color(color);
    for (let i = 0; i < P.count; i += 3) {
      /* drop whole triangles the caller does not want */
      if (opt.keep) { let k = 0; for (let j = 0; j < 3; j++) { _sv.fromBufferAttribute(P, i + j); if (opt.keep(_sv)) k++; } if (k < 2) continue; }
      for (let j = i; j < i + 3; j++) {
        _sv.fromBufferAttribute(P, j); _sn.fromBufferAttribute(N, j);
        this.pos.push(_sv.x + bp.x, _sv.y + bp.y, _sv.z + bp.z); this.nor.push(_sn.x, _sn.y, _sn.z);
        let c = base; if (opt.color) { const r2 = opt.color(_sv, _sn); if (r2) c = r2.isColor ? r2 : _sc2.set(r2); }
        let k = 1; if (opt.ao) k = U.lerp(1 - opt.ao, 1, U.clamp((_sv.y - minY) / (maxY - minY + 1e-4), 0, 1));
        this.col.push(c.r * k, c.g * k, c.b * k);
        let w = opt.weights ? opt.weights(_sv) : null; if (!w) w = [[bone, 1]];
        let sum = 0; for (const x of w) sum += x[1]; const ids = [0, 0, 0, 0], ws = [0, 0, 0, 0];
        w.slice(0, 4).forEach((x, q) => { ids[q] = this.idx.get(x[0]); ws[q] = x[1] / (sum || 1); });
        this.si.push(...ids); this.sw.push(...ws);
      }
    }
    g.dispose(); return this;
  }
  /* one triangle given in mesh space: corners {p, n, s: [[boneIndex, weight], …]} */
  tri(cs, color) { for (const c of cs) { this.pos.push(c.p.x, c.p.y, c.p.z); this.nor.push(c.n.x, c.n.y, c.n.z); this.col.push(color.r, color.g, color.b); for (let q = 0; q < 4; q++) { const s = c.s[q]; this.si.push(s ? s[0] : 0); this.sw.push(s ? s[1] : 0); } } }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4)); g.computeBoundingSphere(); return g; }
}
/* lathe from [radius, y] pairs (y ascending); seam at the back so front details stay clean */
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg, Math.PI, Math.PI * 2);
const mixC = (a, b, t) => _sc.set(a).lerp(_sc2.set(b), t).clone();
const sm = U.smooth;
const SPHERE = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
/* Euler angles that turn local -Y (or +Z) onto a direction, for parts laid along a limb */
const alignDown = (dir) => { TMP.q.setFromUnitVectors(V3(0, -1, 0), dir.clone().normalize()); TMP.e.setFromQuaternion(TMP.q); return [TMP.e.x, TMP.e.y, TMP.e.z]; };
const alignZ = (dir) => { TMP.q.setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize()); TMP.e.setFromQuaternion(TMP.q); return [TMP.e.x, TMP.e.y, TMP.e.z]; };

/* ---------- the two base meshes ---------- */
function b64bytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const BODIES = (() => {
  const out = {};
  for (const key of ['A', 'B']) {
    const d = BODY_DATA[key]; const pos = new Float32Array(b64bytes(d.pos).buffer), idx = new Uint16Array(b64bytes(d.idx).buffer);
    const si = b64bytes(d.si), sw = b64bytes(d.sw), reg = b64bytes(d.reg); const J = {}; for (const k in d.J) J[k] = V3(...d.J[k]);
    const nTri = idx.length / 3, fn = new Float32Array(nTri * 3), treg = new Uint8Array(nTri); const vf = Array.from({ length: d.n }, () => []); const a = V3(), b = V3(), c = V3();
    for (let t = 0; t < nTri; t++) { const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2]; a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
      b.sub(a); c.sub(a); b.cross(c).normalize(); fn[t * 3] = b.x; fn[t * 3 + 1] = b.y; fn[t * 3 + 2] = b.z; vf[i0].push(t); vf[i1].push(t); vf[i2].push(t);
      treg[t] = reg[i0] === reg[i1] || reg[i0] === reg[i2] ? reg[i0] : reg[i1]; }
    /* auto-smoothed corner normals: soft over gentle curves, crisp where the low-poly facets turn sharply */
    const cn = new Float32Array(nTri * 9), cosC = Math.cos(48 * Math.PI / 180);
    for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) { let x = 0, y = 0, z = 0;
      for (const f of vf[idx[t * 3 + k]]) if (fn[t * 3] * fn[f * 3] + fn[t * 3 + 1] * fn[f * 3 + 1] + fn[t * 3 + 2] * fn[f * 3 + 2] > cosC) { x += fn[f * 3]; y += fn[f * 3 + 1]; z += fn[f * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1; cn[t * 9 + k * 3] = x / l; cn[t * 9 + k * 3 + 1] = y / l; cn[t * 9 + k * 3 + 2] = z / l; }
    out[key] = { d, pos, idx, si, sw, reg, J, fn, cn, nTri, treg, head: d.head };
  }
  return out;
})();
/* surface hit of a ray parallel to Z through (x, y): front-most (dir > 0) or back-most (dir < 0) on the given regions, or null */
function rayZ(body, x, y, regions, P, dir = 1) {
  const idx = body.idx; let best = dir > 0 ? -Infinity : Infinity;
  for (let t = 0; t < body.nTri; t++) { if (!regions.includes(body.treg[t])) continue; const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    const ax = P[i0], ay = P[i0 + 1], bx = P[i1], by = P[i1 + 1], cx = P[i2], cy = P[i2 + 1]; const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const z = l1 * P[i0 + 2] + l2 * P[i1 + 2] + l3 * P[i2 + 2]; if (dir > 0 ? z > best : z < best) best = z; }
  return Number.isFinite(best) ? best : null;
}
/* horizontal cross-section at height y: bounding box of where the plane cuts the given regions (side: +1 / -1 keeps one half) */
function section(body, P, y, regions, side = 0) {
  const idx = body.idx; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let t = 0; t < body.nTri; t++) { if (!regions.includes(body.treg[t])) continue;
    if (side && Math.sign(P[idx[t * 3] * 3] + P[idx[t * 3 + 1] * 3] + P[idx[t * 3 + 2] * 3]) !== side) continue;
    for (let e = 0; e < 3; e++) { const a = idx[t * 3 + e] * 3, b = idx[t * 3 + (e + 1) % 3] * 3; const ya = P[a + 1], yb = P[b + 1]; if (ya === yb || (ya - y) * (yb - y) > 0) continue;
      const u = (y - ya) / (yb - ya); const x = P[a] + (P[b] - P[a]) * u, z = P[a + 2] + (P[b + 2] - P[a + 2]) * u;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } }
  return x1 >= x0 ? { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : null;
}
/* face landmarks and body measurements used to fit garments, hair and features */
function measure(body, P, J) {
  const reg = body.reg, n = body.d.n, hd = body.head; const zc = (hd.front + hd.back) / 2; let chin = Infinity;
  for (let i = 0; i < n; i++) if (reg[i] === 5 && P[i * 3 + 2] > zc + (hd.front - zc) * 0.45 && P[i * 3 + 1] < chin) chin = P[i * 3 + 1];
  const fh = hd.top - chin; const m = { chin, headTop: hd.top, faceH: fh, hs: fh / 0.23, headFront: hd.front, headBack: hd.back, headHalfW: hd.halfW, headZc: zc };
  /* eyes sit in the deepest part of the socket, about halfway between chin and crown */
  m.eyeX = hd.halfW * 0.41; let ey = chin + fh * 0.5, ez = Infinity;
  for (let k = 0; k <= 12; k++) { const y = chin + fh * (0.45 + k * 0.01); const z = rayZ(body, m.eyeX, y, [5], P); if (z !== null && z < ez - 1e-4) { ez = z; ey = y; } }
  m.eyeY = ey; m.er = 0.0115 * m.hs; m.eyeZ = (rayZ(body, m.eyeX, ey, [5], P) ?? hd.front - 0.02) - m.er * 0.45;
  m.browY = ey + fh * 0.075; m.mouthY = chin + fh * 0.205; m.mouthZ = rayZ(body, 0, m.mouthY, [5], P) ?? hd.front - 0.012;
  m.headSec = section(body, P, ey, [5]) || { cx: 0, cz: zc, rx: hd.halfW, rz: (hd.front - hd.back) / 2 };
  m.neck = section(body, P, J.neck.y - 0.012, [4]) || section(body, P, J.neck.y - 0.012, [4, 3]) || { cx: 0, cz: J.neck.z, rx: 0.05, rz: 0.05 };
  m.chest = section(body, P, J.chest.y + 0.06, [2, 3]) || { cx: 0, cz: J.chest.z, rx: 0.15, rz: 0.1 };
  return m;
}
/* split a triangle along the level set f(p) = th (keeps winding; skin weights blend along the cut edges) */
const _lerpCorner = (a, b, t) => { const s = new Map(); for (const [i, w] of a.s) s.set(i, (s.get(i) || 0) + w * (1 - t)); for (const [i, w] of b.s) s.set(i, (s.get(i) || 0) + w * t);
  const top = [...s].sort((x, y) => y[1] - x[1]).slice(0, 4); const tot = top.reduce((q, x) => q + x[1], 0) || 1;
  return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), s: top.map(([i, w]) => [i, w / tot]) }; };
function splitTri(tri, f, th) {
  const d = [f(tri[0].p) - th, f(tri[1].p) - th, f(tri[2].p) - th]; const g = d.map((x) => x >= 0);
  if (g[0] === g[1] && g[1] === g[2]) return [tri];
  const k = g[0] !== g[1] && g[0] !== g[2] ? 0 : g[1] !== g[0] && g[1] !== g[2] ? 1 : 2;
  const a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3], da = d[k], db = d[(k + 1) % 3], dc = d[(k + 2) % 3];
  const ab = _lerpCorner(a, b, da / (da - db)), ac = _lerpCorner(a, c, da / (da - dc));
  return [[a, ab, ac], [ab, b, c], [ab, c, ac]];
}
/* closed tube through rings of points (top ring first); faces outward */
function loftGeo(rings) {
  const nR = rings.length, nP = rings[0].length; const pos = new Float32Array(nR * nP * 3); rings.forEach((r, k) => r.forEach((p, i) => pos.set([p.x, p.y, p.z], (k * nP + i) * 3)));
  const ind = []; for (let k = 0; k < nR - 1; k++) for (let i = 0; i < nP; i++) { const a = k * nP + i, b = k * nP + (i + 1) % nP, c = a + nP, d = b + nP; ind.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ind); return g;
}
const ellipseRing = (cx, y, cz, rx, rz, seg = 24) => { const pts = []; for (let i = 0; i < seg; i++) { const th = Math.PI + i / seg * Math.PI * 2; pts.push(V3(cx + rx * Math.sin(th), y, cz + rz * Math.cos(th))); } return pts; };

/* ---------- skeleton from the body's joints (rest rotations are identity) ---------- */
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', lidL: 'head', lidR: 'head', hairTail: 'head' };
for (const s of ['L', 'R']) Object.assign(PARENT, { ['clav' + s]: 'chest', ['sh' + s]: 'clav' + s, ['el' + s]: 'sh' + s, ['hand' + s]: 'el' + s, ['fing' + s]: 'hand' + s, ['fing2' + s]: 'fing' + s, ['thumb' + s]: 'hand' + s,
  ['hip' + s]: 'hips', ['kn' + s]: 'hip' + s, ['ankle' + s]: 'kn' + s, ['toe' + s]: 'ankle' + s });
function makeSkeleton(J) {
  const B = {}, list = [], parent = [];
  for (const name of BODY_DATA.bones) { const b = new THREE.Bone(); b.name = name; const p = PARENT[name]; b.position.copy(J[name]); if (p) { b.position.sub(J[p]); B[p].add(b); } B[name] = b; parent.push(p ? list.indexOf(B[p]) : -1); list.push(b); }
  return { B, list, parent };
}

/* ---------- body, clothing, face, hair ---------- */
function buildHumanoid(look, opts = {}) {
  const nat = NATIONS[look.nation] ? look.nation : 'earth'; const N = NATIONS[nat]; const pal = opts.palette || N.outfits[(look.outfit || 0) % N.outfits.length];
  const stone = !!opts.stone; const S = (c) => stone ? '#a39b8c' : c;
  const skin = stone ? '#9a9286' : look.skin; const hairC = stone ? '#8a8276' : look.hairColor; const [c1, c2, c3] = pal.map(S);
  const isB = look.body === 'B'; const body = BODIES[isB ? 'B' : 'A']; const bw = look.build || 1;
  /* the build slider widens the torso and carries the limbs (and their joints) out with it */
  const J = {}; for (const k in body.J) J[k] = body.J[k].clone(); const shX = Math.abs(J.shL.x), hipX = Math.abs(J.hipL.x);
  const armShift = (bw - 1) * shX, legShift = (bw - 1) * hipX * 0.6;
  for (const k in J) { const side = /L$/.test(k) ? 1 : /R$/.test(k) ? -1 : 0; if (!side || k.startsWith('lid')) continue;
    if (k.startsWith('clav')) J[k].x += side * armShift * 0.3; else if (/^(sh|el|hand|fing|thumb)/.test(k)) J[k].x += side * armShift; else if (/^(hip|kn|ankle|toe)/.test(k)) J[k].x += side * legShift; }
  const n = body.d.n; const P = new Float32Array(body.pos);
  for (let i = 0; i < n; i++) { const r = body.reg[i], x = P[i * 3];
    if (r >= 1 && r <= 3) { P[i * 3] = x * bw; P[i * 3 + 2] = J.hips.z + (P[i * 3 + 2] - J.hips.z) * (1 + (bw - 1) * 0.5); }
    else if (r >= 6 && r <= 8) P[i * 3] = x + Math.sign(x) * armShift; else if (r >= 9 && r <= 11) P[i * 3] = x + Math.sign(x) * legShift; }
  const M = measure(body, P, J);
  J.lidL = V3(M.eyeX, M.eyeY, M.eyeZ); J.lidR = V3(-M.eyeX, M.eyeY, M.eyeZ);
  const { B, list, parent } = makeSkeleton(J); const sb = new SkinBuilder(list);
  const rel = (bone, x, y, z) => [x - J[bone].x, y - J[bone].y, z - J[bone].z];
  const _m = V3(); const addMS = (geo, color, bone, opt = {}) => { const o = J[bone]; const w = (fn) => fn && ((v, nn) => fn(_m.copy(v).add(o), nn));
    sb.add(geo, color, bone, [-o.x, -o.y, -o.z], [0, 0, 0], [1, 1, 1], Object.assign({}, opt, { color: w(opt.color), weights: w(opt.weights), keep: w(opt.keep) })); };

  /* --- paint the base mesh --- */
  const skinC = new THREE.Color(skin); const skinTone = (v, extra) => { const c = _sc.copy(skinC); if (extra && !stone) c.lerp(_sc2.set(extra[0]), extra[1]); return c; };
  const axis = (a, b) => { const A = J[a].clone(), D = J[b].clone().sub(A); const l2 = D.lengthSq(); return (v) => ((v.x - A.x) * D.x + (v.y - A.y) * D.y + (v.z - A.z) * D.z) / l2; };
  const foreL = axis('elL', 'handL'), foreR = axis('elR', 'handR'), shinL = axis('knL', 'ankleL'), shinR = axis('knR', 'ankleR');
  const fore = (v) => v.x > 0 ? foreL(v) : foreR(v), shin = (v) => v.x > 0 ? shinL(v) : shinR(v);
  const pants = nat === 'water' ? S('#1f3d66') : nat === 'earth' ? S('#8c7752') : c2;
  const boot = S({ water: '#5a3a24', fire: '#16100e', air: '#8a5a2a', earth: '#4a2e1c' }[nat]); const shirt = nat === 'air' ? c2 : c1, belt = nat === 'air' ? S('#d9772a') : nat === 'fire' ? c2 : c3;
  const beltLo = J.spine.y - 0.032, beltHi = J.spine.y + 0.034, collarY = J.neck.y + 0.02;
  const sleeve = { air: [0.2, 0.84], fire: [0.35], water: [], earth: [0.93] }[nat]; const bootTop = { fire: 0.06, water: 0.45, air: 0.7, earth: 0.7 }[nat];
  const kneeY = (J.knL.y + J.knR.y) / 2, ankY = (J.ankleL.y + J.ankleR.y) / 2, bootY = U.lerp(kneeY, ankY, bootTop);
  const wraps = []; if (nat === 'earth' || nat === 'air') for (let y = ankY + 0.03; y < bootY - 0.012; y += 0.026) wraps.push(y);
  const arrowY = M.chin + M.faceH * 0.66, yCross = J.chest.y + 0.03; const vCollar = (v) => Math.abs(v.x) - (v.y - yCross) * 0.55; /* < 0 inside the crossed-collar V */
  const CUTS = { 1: [[(v) => v.y, [beltLo, beltHi]]], 2: [[(v) => v.y, [beltLo, beltHi]]], 3: [], 4: [], 5: [], 6: [], 7: [[fore, sleeve]], 8: [], 9: [], 10: [[shin, [bootTop]], [(v) => v.y, wraps]], 11: [[(v) => v.y, [0.016]]] };
  if (nat === 'earth') for (const r of [2, 3]) CUTS[r].push([vCollar, [-0.012, 0]]);
  if (nat === 'fire' || nat === 'water') for (const r of [1, 2, 3]) CUTS[r].push([(v) => v.x, [-0.016, 0.016]]);
  if (nat === 'fire') CUTS[4].push([(v) => v.y, [collarY]]);
  if (look.arrows) CUTS[5].push([(v) => v.x, [-0.017, 0.017]], [(v) => v.y, [arrowY]]);
  const paint = (v, r, fnrm) => {
    const front = v.z > J.chest.z + 0.015, ax = Math.abs(v.x);
    switch (r) {
      case 5: { if (look.arrows && !stone && ax < 0.017 && v.y > arrowY) return S('#2a8ad8');
        const cheek = v.z > M.headZc + 0.03 && Math.abs(ax - M.eyeX) < 0.022 && v.y < M.eyeY - 0.012 && v.y > M.mouthY; return skinTone(v, cheek ? ['#d9705f', 0.1] : null); }
      case 4: return nat === 'fire' && v.y < collarY ? c2 : skinTone(v);
      case 8: return skinTone(v, fnrm && fnrm.x * v.x < 0 ? ['#d98a7a', 0.07] : null);
      case 6: return shirt;
      case 7: { const t = fore(v); if (nat === 'air') return t < 0.2 ? c2 : t > 0.84 ? S('#8a5a2a') : skinTone(v);
        if (nat === 'fire') return t > 0.35 ? c2 : shirt; if (nat === 'earth' && t > 0.93) return skinTone(v); return shirt; }
      case 1: case 2: case 3: {
        if (v.y > beltLo && v.y < beltHi) return belt;
        if (nat === 'earth' && front) { const vc = vCollar(v); if (vc < -0.012) return c2; if (vc < 0) return c3; }
        if ((nat === 'fire' || nat === 'water') && front && ax < 0.016 && v.y > beltHi) return c3;
        return v.y < beltLo ? pants : shirt; }
      case 9: return pants;
      case 10: { if (shin(v) > bootTop) return wraps.length && Math.floor((v.y - ankY - 0.03) / 0.026) % 2 === 0 ? S('#c8b08a') : boot; return pants; }
      case 11: return v.y < 0.016 ? S(mixC(boot, '#000', 0.35)) : boot;
    }
    return shirt;
  };
  { const idx = body.idx, si = body.si, sw = body.sw; const fnv = V3(), cen = V3(), e1 = V3(), e2 = V3(), pc = new THREE.Color();
    const corner = (t, k) => { const i = idx[t * 3 + k]; const s = []; let tot = 0; for (let q = 0; q < 4; q++) { const w = sw[i * 4 + q]; if (w) { s.push([si[i * 4 + q], w]); tot += w; } } for (const x of s) x[1] /= tot || 1;
      return { p: V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), n: V3().fromArray(body.cn, t * 9 + k * 3), s }; };
    for (let t = 0; t < body.nTri; t++) { const r = body.treg[t]; let pieces = [[corner(t, 0), corner(t, 1), corner(t, 2)]];
      for (const [f, ths] of CUTS[r] || []) for (const th of ths) pieces = pieces.flatMap((q) => splitTri(q, f, th));
      fnv.fromArray(body.fn, t * 3);
      for (const q of pieces) { e1.subVectors(q[1].p, q[0].p); e2.subVectors(q[2].p, q[0].p); if (e1.cross(e2).lengthSq() < 1e-14) continue;
        cen.copy(q[0].p).add(q[1].p).add(q[2].p).multiplyScalar(1 / 3); pc.set(paint(cen, r, fnv));
        if (!stone) pc.multiplyScalar(0.965 + U.hash2(Math.round(cen.x * 997 + cen.z * 431), Math.round(cen.y * 613)) * 0.07); sb.tri(q, pc); } } }

  /* --- garments fitted to the measured body --- */
  const fur = (v) => _sc.set(S('#f2f2ea')).multiplyScalar(0.9 + U.hash2(Math.round(v.x * 500), Math.round(v.z * 500 + v.y * 300)) * 0.14);
  { /* skirt / robe: rings follow the body's cross-sections from the waist down and flare toward the hem */
    const len = { air: isB ? 0.5 : 0.34, water: isB ? 0.36 : 0.3, earth: isB ? 0.46 : 0.36, fire: isB ? 0.4 : 0.28 }[nat];
    const yTop = beltHi - 0.008, yHem = yTop - len, hemY = yHem + 0.035; const ys = []; for (let k = 0; k < 7; k++) ys.push(U.lerp(yTop, hemY + 0.0005, k / 6)); ys.push(hemY - 0.0005, yHem);
    const rings = []; let rx = 0, rz = 0, last = null, hem = null;
    for (const y of ys) { const sec = section(body, P, y, [1, 2, 3, 9]) || last; if (!sec) continue; last = sec; const u = (yTop - y) / len;
      rx = Math.max(rx, sec.rx * 1.06 + 0.011 + u ** 1.6 * len * 0.17); rz = Math.max(rz, sec.rz * 1.1 + 0.011 + u ** 1.6 * len * 0.1); rings.push(ellipseRing(sec.cx, y, sec.cz, rx, rz, 24)); hem = { cx: sec.cx, cz: sec.cz, rx, rz }; }
    const skirtC = nat === 'air' ? S('#d9772a') : c1; const legW = (v) => { const t = sm(yTop - 0.05, yHem, v.y) * sm(0, 0.07, Math.abs(v.x)) * 0.62; return t > 0 ? [['hips', 1 - t], [v.x > 0 ? 'hipL' : 'hipR', t]] : null; };
    addMS(loftGeo(rings), skirtC, 'hips', { color: (v) => v.y < hemY ? (nat === 'water' ? S('#f2f2ea') : c3) : skirtC, weights: legW });
    if (nat === 'water' && hem) addMS(new THREE.TorusGeometry(1, 0.14, 6, 30).rotateX(Math.PI / 2).scale(hem.rx, hem.rx * 0.75, hem.rz).translate(hem.cx, yHem + 0.006, hem.cz), S('#f2f2ea'), 'hips', { color: fur, weights: legW });
  }
  const nk = M.neck;
  if (nat === 'water') addMS(new THREE.TorusGeometry(1, 0.3, 7, 24).rotateX(Math.PI / 2 + 0.22).scale(nk.rx * 1.32, nk.rx * 1.32, nk.rz * 1.32).translate(nk.cx, J.neck.y - 0.022, nk.cz), S('#f2f2ea'), 'chest', { color: fur });
  if (nat === 'fire') { const r0 = Math.max(nk.rx, nk.rz) * 1.2, y0 = J.neck.y - 0.045;
    addMS(lathe([[r0 * 1.06, 0], [r0, 0.045], [r0 * 0.94, 0.072]], 20).scale(nk.rx / Math.max(nk.rx, nk.rz), 1, nk.rz / Math.max(nk.rx, nk.rz)).translate(nk.cx, y0, nk.cz), c2, 'chest', { color: (v) => v.y > y0 + 0.06 ? c3 : c2 });
    for (const [sd, s] of [['L', 1], ['R', -1]]) for (let k = 0; k < 3; k++) sb.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), k ? mixC(c2, '#000', 0.12 * k) : c2, 'sh' + sd, [s * 0.014, 0.035 - k * 0.04, 0], [0, 0, -s * (0.3 + k * 0.14)], [(0.072 - k * 0.005) * (isB ? 0.88 : 1), 0.05, (0.07 - k * 0.004) * (isB ? 0.88 : 1)], { color: (v, nn) => (nn.y < 0.3 ? c3 : null) });
    const bz = rayZ(body, 0, J.spine.y, [1, 2], P) ?? J.spine.z + 0.1; sb.add(new THREE.BoxGeometry(0.05, 0.034, 0.012), S('#e0b050'), 'spine', rel('spine', 0, J.spine.y, bz + 0.005));
  }
  if (nat === 'earth') { const x = 0.055, kz = rayZ(body, x, J.spine.y, [1, 2], P) ?? J.spine.z + 0.1; /* sash knot with two hanging tails */
    sb.add(SPHERE(10, 8), c3, 'spine', rel('spine', x, J.spine.y, kz + 0.008), [0, 0, 0.4], [0.022, 0.028, 0.012]);
    for (const k of [0, 1]) sb.add(new THREE.BoxGeometry(0.022, 0.12, 0.006), c3, 'spine', rel('spine', x + 0.008 + k * 0.016, J.spine.y - 0.07, kz + 0.006), [0, 0, 0.08 - k * 0.16], [1, 1, 1], { weights: (v) => [['spine', 0.5], ['hips', 0.5]] }); }
  if (nat === 'air') { /* mantle draped over the shoulders, and a sash strap across the chest and back */
    const ys = [J.neck.y - 0.004, J.neck.y - 0.03, (J.neck.y + J.shL.y) / 2 - 0.018, J.shL.y - 0.03, J.shL.y - 0.075, J.shL.y - 0.077]; const rings = []; let rx = 0, rz = 0;
    for (const y of ys) { const sec = section(body, P, y, [2, 3, 4, 6]); if (!sec) continue; rx = Math.max(rx, sec.rx * 1.06 + 0.014); rz = Math.max(rz, sec.rz * 1.12 + 0.014); rings.push(ellipseRing(sec.cx, y, sec.cz, rx, rz, 26)); }
    const trimY = J.shL.y - 0.07; addMS(loftGeo(rings), S('#d9772a'), 'chest', { color: (v) => v.y < trimY ? S('#a8501a') : S('#d9772a'), weights: (v) => Math.abs(v.x) > shX * 0.6 ? [['chest', 0.55], [v.x > 0 ? 'clavL' : 'clavR', 0.45]] : null });
    const path = []; const N2 = 9; const xa = shX * 0.55, ya = J.shL.y - 0.075, xb = -M.chest.rx * 0.85, yb = beltHi;
    for (const dir of [1, -1]) { const seg = []; for (let k = 0; k <= N2; k++) { const t = k / N2, x = U.lerp(xa, xb, t), y = U.lerp(ya, yb, t); const z = rayZ(body, x, y, [1, 2, 3], P, dir); if (z !== null) seg.push(V3(x, y, z + dir * 0.007)); } path.push(seg); }
    const ribbon = (pts, out) => { const pos = [], ind = []; for (let k = 0; k < pts.length; k++) { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; const tng = b.clone().sub(a).normalize(); const sd = tng.clone().cross(out).normalize().multiplyScalar(0.027);
        pos.push(...pts[k].clone().add(sd).toArray(), ...pts[k].clone().sub(sd).toArray()); } for (let k = 0; k < pts.length - 1; k++) { const a = k * 2; ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind); return g; };
    const sashW = (v) => [['spine', 1 - sm(J.spine.y + 0.05, J.chest.y + 0.05, v.y)], ['chest', sm(J.spine.y + 0.05, J.chest.y + 0.05, v.y)]];
    if (path[0].length > 2) addMS(ribbon(path[0], V3(0, 0, 1)), S('#d9772a'), 'chest', { weights: sashW });
    if (path[1].length > 2) addMS(ribbon(path[1].slice().reverse(), V3(0, 0, -1)), S('#d9772a'), 'chest', { weights: sashW });
  }
  for (const [sd, s] of [['L', 1], ['R', -1]]) { /* cuffs, sleeves and boot tops laid along the limb axes */
    const el = J['el' + sd], fdir = J['hand' + sd].clone().sub(el), flen = fdir.length(); fdir.normalize();
    const kn = J['kn' + sd], sdir = J['ankle' + sd].clone().sub(kn), slen = sdir.length(); sdir.normalize();
    const legR = (t) => { const sec = section(body, P, U.lerp(kn.y, J['ankle' + sd].y, t), [10], s); return sec ? Math.max(sec.rx, sec.rz) : 0.05; };
    if (nat === 'water') { sb.add(new THREE.TorusGeometry(1, 0.36, 7, 16), S('#f2f2ea'), 'el' + sd, fdir.clone().multiplyScalar(flen * 0.86).toArray(), alignZ(fdir), [0.034, 0.034, 0.028], { color: fur });
      const r = legR(0.45) * 1.1; sb.add(new THREE.TorusGeometry(1, 0.26, 7, 18), S('#f2f2ea'), 'kn' + sd, sdir.clone().multiplyScalar(slen * 0.45).toArray(), alignZ(sdir), [r, r, r * 0.9], { color: fur }); }
    if (nat === 'earth') sb.add(lathe([[0.04, 0.0], [0.052, -0.08], [0.064, -0.15], [0.062, -0.16]], 16), c1, 'el' + sd, fdir.clone().multiplyScalar(flen * 0.38).toArray(), alignDown(fdir), [1, 1, 1], { color: (v) => v.clone().dot(fdir) > flen * 0.38 + 0.145 ? c3 : c1 });
    if (nat === 'fire') { for (let k = 0; k < 3; k++) { const p = fdir.clone().multiplyScalar(flen * (0.5 + k * 0.14)); sb.add(SPHERE(6, 4), S('#e0b050'), 'el' + sd, [p.x + s * 0.028, p.y, p.z + 0.012], [0, 0, 0], [0.0045, 0.0045, 0.0045]); }
      const r = legR(0.07) * 1.12; sb.add(lathe([[r, -0.015], [r * 1.08, 0.025]], 16), boot, 'kn' + sd, sdir.clone().multiplyScalar(slen * 0.07).toArray(), alignDown(sdir.clone().negate())); }
  }

  /* --- face: glossy eyes in the sockets found on the mesh, blinking lids, brows, lips --- */
  const er = M.er;
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    const LID = -0.42, pole = V3(0, Math.cos(LID), Math.sin(LID));
    sb.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, 'lid' + sd, [0, 0, 0], [LID, 0, 0], [er * 1.14, er * 1.14, er * 1.14], { color: (v) => Math.acos(U.clamp(v.clone().normalize().dot(pole), -1, 1)) > 1.38 && v.z > 0 ? _sc.set(stone ? skin : '#1a120c') : skinTone(v, ['#6a3a2a', 0.06]) });
    sb.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.24), skin, 'head', rel('head', s * M.eyeX, M.eyeY, M.eyeZ), [0, 0, 0], [er * 1.1, er * 1.1, er * 1.1], { color: (v) => skinTone(v) });
    for (let k = 0; k < 2; k++) { const x = s * (M.eyeX - 0.007 + k * 0.015), y = M.browY + (k ? -0.0015 : 0.0012); const z = rayZ(body, x, y, [5], P) ?? M.eyeZ + er;
      sb.add(SPHERE(8, 6), hairC, 'head', rel('head', x, y, z + 0.0012), [0, 0, s * (k ? -0.2 : 0.06)], [0.0105 * M.hs, 0.0023 * M.hs, 0.0032]); }
  }
  const lipC = stone ? skin : '#' + mixC(skin, '#9c3f48', 0.4).getHexString();
  sb.add(SPHERE(12, 8), lipC, 'head', rel('head', 0, M.mouthY + 0.0035, M.mouthZ - 0.0015), [0, 0, 0], [0.019 * M.hs, 0.0046 * M.hs, 0.006]);
  sb.add(SPHERE(12, 8), lipC, 'head', rel('head', 0, M.mouthY - 0.0042, M.mouthZ - 0.0022), [0, 0, 0], [0.017 * M.hs, 0.0054 * M.hs, 0.0065], { color: (v) => _sc.set(lipC).multiplyScalar(0.92) });
  buildHair(sb, look, hairC, stone, body, P, J, M, addMS, isB);

  /* --- contact points for planting the body on the ground (legs, pelvis, back, back of the head) --- */
  const cIdx = []; for (let i = 0; i < n; i++) { const r = body.reg[i], z = P[i * 3 + 2];
    if (r === 11 || ((r === 9 || r === 10 || r === 1) && (!isB || i % 2 === 0)) || ((r === 2 || r === 3) && z < J.chest.z - 0.04 && i % 2 === 0) || (r === 5 && z < M.headZc - 0.03) || (r === 4 && z < J.neck.z - 0.02)) cIdx.push(i); }
  const C = { n: cIdx.length, p: new Float32Array(cIdx.length * 3), b: new Uint8Array(cIdx.length * 4), w: new Float32Array(cIdx.length * 4), jx: new Float32Array(list.length * 3) };
  cIdx.forEach((i, c) => { C.p.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], c * 3); let tot = 0; for (let q = 0; q < 4; q++) tot += body.sw[i * 4 + q]; for (let q = 0; q < 4; q++) { C.b[c * 4 + q] = body.si[i * 4 + q]; C.w[c * 4 + q] = body.sw[i * 4 + q] / (tot || 1); } });
  list.forEach((b, i) => { const j = J[b.name]; C.jx.set([j.x, j.y, j.z], i * 3); });

  /* --- assemble --- */
  const mat = opts.mat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(sb.build(), mat); mesh.add(B.hips); mesh.frustumCulled = false; mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(list));
  const root = new THREE.Group(); root.add(mesh);
  if (!stone) { const iris = new THREE.Color(look.eyes);
    for (const s of [-1, 1]) { const g = new THREE.SphereGeometry(er, 18, 12); const p = g.attributes.position; const col = []; const fwd = V3(0, 0, 1), catchDir = V3(0.25, 0.35, 0.9).normalize(); const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { _sv.fromBufferAttribute(p, i).normalize(); const a = Math.acos(U.clamp(_sv.dot(fwd), -1, 1));
        if (Math.acos(U.clamp(_sv.dot(catchDir), -1, 1)) < 0.12) c.set('#ffffff'); else if (a < 0.22) c.set('#060404'); else if (a < 0.52) c.copy(iris).multiplyScalar(a > 0.45 ? 0.45 : 0.85 + 0.3 * U.hash2(Math.round(Math.atan2(_sv.y, _sv.x) * 9), 3)); else c.set('#efe9df'); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.translate(s * M.eyeX - J.head.x, M.eyeY - J.head.y, M.eyeZ - J.head.z);
      B.head.add(new THREE.Mesh(g, opts.mat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 }))); } }
  const Jo = { hips: B.hips, spine: B.spine, chest: B.chest, neck: B.neck, head: B.head, hairTail: B.hairTail };
  for (const sd of ['L', 'R']) { for (const nm of ['clav', 'sh', 'el', 'hip', 'kn', 'toe', 'fing', 'fing2', 'thumb', 'lid']) Jo[nm + sd] = B[nm + sd]; Jo['wrist' + sd] = B['hand' + sd]; Jo['ankle' + sd] = B['ankle' + sd];
    const grip = new THREE.Object3D(); grip.position.copy(J['fing' + sd]).sub(J['hand' + sd]).multiplyScalar(0.6); B['hand' + sd].add(grip); Jo['hand' + sd] = grip;
    const sole = new THREE.Object3D(); sole.position.set(0, -J['ankle' + sd].y + 0.005, 0.03); B['ankle' + sd].add(sole); Jo['foot' + sd] = sole; }
  Jo.headMesh = { _v: true, get visible() { return this._v; }, set visible(v) { this._v = v; B.head.scale.setScalar(v ? 1 : 0.001); } };
  const shadow = blobShadow(0.45); root.add(shadow); shadow.position.y = 0.03;
  root.scale.setScalar(look.height || 1);
  /* reach targets and limb chains for the IK poses (hands to mouth / chest / knees, crossed legs) */
  const frontAt = (y, regs) => rayZ(body, 0, y, regs, P) ?? J.chest.z + 0.1;
  const anchors = { mouth: V3(0, M.mouthY, M.mouthZ), sternum: V3(0, J.chest.y + 0.1, frontAt(J.chest.y + 0.1, [2, 3])), navel: V3(0, J.spine.y + 0.05, frontAt(J.spine.y + 0.05, [1, 2])), hipJ: J.hipL.clone().add(J.hipR).multiplyScalar(0.5) };
  const limb = (root, mid, end, frame, sign) => { const r1 = J[mid].clone().sub(J[root]), r2 = end.clone().sub(J[mid]); return { S: J[root].clone().sub(J[frame]), r1: r1.clone().normalize(), r2: r2.clone().normalize(), a: r1.length(), b: r2.length(), sign, frame }; };
  const gripAt = (sd) => J['hand' + sd].clone().lerp(J['fing' + sd], 0.6);
  const limbs = { L: limb('shL', 'elL', gripAt('L'), 'chest', 1), R: limb('shR', 'elR', gripAt('R'), 'chest', 1), legL: limb('hipL', 'knL', J.ankleL, 'hips', -1), legR: limb('hipR', 'knR', J.ankleR, 'hips', -1) };
  const fit = []; for (let y = J.hips.y - 0.06; y <= J.neck.y + 0.001; y += 0.03) { const sec = section(body, P, y, [1, 2, 3]); if (sec) fit.push(Object.assign({ y }, sec)); }
  const H = { root, J: Jo, B, mat, mesh, look, shadow, restJ: J, anchors, limbs, fit, ikCache: new Map(), phase: 0, action: null, actionT: 0, stance: 0, element: opts.element || look.nation, emissiveT: 0, blinkT: 1 + Math.random() * 3, curl: [0.4, 0.4], grip: !!opts.grip,
    rest: { hipsY: J.hips.y, leg: (J.hipL.y + J.hipR.y) / 2, eyeY: M.eyeY, eyeZ: M.eyeZ, headTop: M.headTop, headY: J.head.y, chin: M.chin, mouthY: M.mouthY, mouthZ: M.mouthZ, headZc: M.headZc, headHalfW: M.headHalfW, headFront: M.headFront, headBack: M.headBack },
    rig: { list, parent, M: list.map(() => new THREE.Matrix4()), C }, pose: {} };
  return H;
}

/* ---------- hair: offset shells of the mesh's own scalp, sheets that fall clear of the back, and style pieces ---------- */
function buildHair(sb, look, hairC, stone, body, P, J, M, addMS, isB) {
  const hs = look.hair, k = M.hs, base = new THREE.Color(hairC), hi = sb.idx.get('head');
  const strand = (v, dark = 1) => { const h = U.hash2(Math.round(Math.atan2(v.x, v.z - M.headZc) * 14), Math.round(v.y * 40)); return base.clone().multiplyScalar((0.84 + h * 0.26) * dark); };
  const hy = (y) => (y - M.chin) / M.faceH; /* 0 chin … 1 crown */
  const fz = (z) => (z - M.headZc) / (M.headFront - M.headZc); /* +1 face … −1 back of the head */
  const longStyle = hs === 'long' || hs === 'loopies' || hs === 'braids';
  /* hairline as a field: > 0 where hair grows (high at the forehead, above the ears, low at the nape) */
  const line = (v, front = 0.76) => { const f = fz(v.z), h = hy(v.y); let lim = U.lerp(longStyle ? 0.16 : 0.24, front, sm(-0.5, 0.75, f));
    const side = sm(M.headHalfW * 0.5, M.headHalfW * 0.68, Math.abs(v.x)) * sm(-0.45, -0.25, f) * sm(0.7, 0.5, f); lim = Math.max(lim, U.lerp(lim, longStyle ? 0.47 : 0.6, side)); return h - lim; };
  const shell = (field, off, colorFn) => { for (let t = 0; t < body.nTri; t++) { if (body.treg[t] !== 5) continue; const tri = []; let inside = 0;
      for (let q = 0; q < 3; q++) { const i = body.idx[t * 3 + q]; const p = V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (field(p) > 0) inside++; tri.push({ p, n: V3().fromArray(body.cn, t * 9 + q * 3), s: [[hi, 1]] }); }
      if (!inside) continue; const pieces = inside === 3 ? [tri] : splitTri(tri, field, 0);
      for (const q of pieces) { const cen = q[0].p.clone().add(q[1].p).add(q[2].p).multiplyScalar(1 / 3); if (field(cen) <= 0) continue;
        sb.tri(q.map((c) => ({ p: c.p.clone().addScaledVector(c.n, off * U.clamp(0.3 + field(c.p) * 12, 0.3, 1)), n: c.n, s: c.s })), colorFn(cen)); } } };
  if (hs !== 'shaved') {
    if (hs === 'wolftail') { /* shaved sides (stubble) and a strip of hair on top gathered into the tail */
      const stub = base.clone().lerp(new THREE.Color(look.skin), stone ? 0 : 0.55);
      const band = (v) => Math.min(M.headHalfW * 0.45 - Math.abs(v.x), (hy(v.y) - 0.62) * 0.3);
      shell((v) => Math.min(line(v), -band(v)), 0.0025 * k, () => stub);
      shell((v) => Math.min(line(v), band(v)), 0.009 * k, (c) => strand(c));
    } else shell((v) => line(v, hs === 'long' ? 0.72 : 0.76), (hs === 'short' ? 0.012 : 0.01) * k, (c) => strand(c));
  }
  const top = M.headTop, back = M.headBack, hw = M.headHalfW, zc = M.headZc, H0 = J.head;
  const relH = (x, y, z) => [x - H0.x, y - H0.y, z - H0.z];
  /* a two-layer sheet of hair from around the head down the back; it is pushed out behind the neck and shoulders so it never cuts into them */
  const sheet = (yBot, th0, th1, th0b, th1b, flare) => {
    const NR = 9, NT = 16, hsE = M.headSec, yTop = M.chin + M.faceH * 0.56; const out = [], inn = [];
    for (let r = 0; r <= NR; r++) { const u = r / NR, y = U.lerp(yTop, yBot, u), rk = r === 0 ? 1.03 : 1.1 + flare * u;
      for (let i = 0; i <= NT; i++) { const th = U.lerp(U.lerp(th0, th0b, u), U.lerp(th1, th1b, u), i / NT); const sx = Math.sin(th), cz = Math.cos(th);
        const x = hsE.cx + hsE.rx * rk * sx * (1 + 0.18 * u), ze = hsE.cz + hsE.rz * rk * cz; const zb = y < M.chin + 0.02 ? rayZ(body, x, y, [2, 3, 4], P, -1) : null;
        const p = V3(x, y, zb !== null ? Math.min(ze, zb - 0.014) : ze); out.push(p); inn.push(p.clone().add(V3(-sx * 0.009, 0, -cz * 0.009))); } }
    const W = NT + 1, no = out.length, pos = [], ind = []; for (const p of out.concat(inn)) pos.push(p.x, p.y, p.z);
    for (let r = 0; r < NR; r++) for (let i = 0; i < NT; i++) { const a = r * W + i, b = a + 1, c = a + W, d = c + 1; ind.push(a, c, b, b, c, d, no + a, no + b, no + c, no + b, no + d, no + c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind);
    addMS(g, hairC, 'head', { color: (v, nn) => strand(v, nn.x * Math.sin(Math.atan2(v.x, v.z - zc)) + nn.z * Math.cos(Math.atan2(v.x, v.z - zc)) < 0 ? 0.7 : 1),
      weights: (v) => { const w = sm(J.neck.y + 0.02, J.chest.y + 0.1, v.y) * 0.92; return w > 0 ? [['head', 1 - w], ['chest', w]] : null; } });
  };
  if (hs === 'long') sheet(isB ? J.chest.y + 0.02 : J.chest.y + 0.1, Math.PI * 0.3, Math.PI * 1.7, Math.PI * 0.52, Math.PI * 1.48, 0.12);
  if (hs === 'loopies') { sheet(J.neck.y - 0.06, Math.PI * 0.32, Math.PI * 1.68, Math.PI * 0.55, Math.PI * 1.45, 0.08);
    for (const s of [-1, 1]) sb.add(new THREE.TorusGeometry(0.02 * k, 0.0055 * k, 6, 14, Math.PI * 1.7), hairC, 'head', relH(s * hw * 1.0, M.eyeY - 0.004, M.eyeZ - 0.03), [0.25, s * Math.PI / 2, Math.PI * 0.65], [1, 1, 1], { color: (v) => strand(v) }); }
  if (hs === 'braids' || hs === 'loopies') { /* one plait down the back */
    const yb = isB ? J.chest.y - 0.02 : J.chest.y + 0.04; const n = 9;
    for (let q = 0; q < n; q++) { const u = q / (n - 1), y = U.lerp(M.chin + M.faceH * 0.3, yb, u); const zb = y < M.chin ? rayZ(body, 0, y, [2, 3, 4], P, -1) : null;
      const z = Math.min(back - 0.008, zb !== null ? zb - 0.022 : back - 0.008); const r = (0.021 - u * 0.006) * k;
      sb.add(SPHERE(8, 6), hairC, q < 2 ? 'head' : 'hairTail', q < 2 ? relH(0, y, z) : [0 - J.hairTail.x, y - J.hairTail.y, z - J.hairTail.z], [0, q % 2 ? 0.5 : -0.5, q % 2 ? 0.35 : -0.35], [r, r * 1.25, r * 0.85], { color: (v) => strand(V3(0, y, z)), weights: q < 2 ? null : () => [['hairTail', 0.35], ['chest', 0.65]] }); }
    sb.add(new THREE.CylinderGeometry(0.009 * k, 0.009 * k, 0.012, 8), stone ? hairC : '#3a6a8a', 'hairTail', [0 - J.hairTail.x, yb - 0.022 - J.hairTail.y, Math.min(back, (rayZ(body, 0, yb - 0.02, [2, 3], P, -1) ?? back) - 0.02) - J.hairTail.z], [0, 0, 0], [1, 1, 1], { weights: () => [['hairTail', 0.35], ['chest', 0.65]] }); }
  if (hs === 'wolftail') { const tp = J.hairTail; sb.add(new THREE.ConeGeometry(0.02 * k, 0.095 * k, 8), hairC, 'hairTail', [0, -0.012, -0.03], [-2.45, 0, 0], [1, 1, 0.75], { color: (v) => strand(V3(v.x, v.y + tp.y, v.z + tp.z)) });
    sb.add(new THREE.TorusGeometry(0.012 * k, 0.0035, 6, 10), '#3a2a1a', 'hairTail', [0, 0.004, -0.004], [1.0, 0, 0]); }
  if (hs === 'short') for (let q = 0; q < 7; q++) { const a = q / 7 * Math.PI * 2; sb.add(new THREE.ConeGeometry(0.016 * k, 0.03 * k, 5), hairC, 'head', relH(Math.cos(a) * hw * 0.42, top - 0.006, zc - 0.012 + Math.sin(a) * hw * 0.48), [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55], [1, 1, 1], { color: (v) => strand(V3(0, top, zc)) }); }
  if (hs === 'bun') { sb.add(SPHERE(12, 10), hairC, 'head', relH(0, top - 0.004, back * 0.55 + zc * 0.45), [0.3, 0, 0], [0.042 * k, 0.035 * k, 0.04 * k], { color: (v) => strand(V3(v.x * 3, top + v.y, zc - 0.05)) });
    sb.add(new THREE.TorusGeometry(0.03 * k, 0.006, 6, 14), stone ? hairC : '#2f5e3a', 'head', relH(0, top - 0.022, back * 0.45 + zc * 0.55), [1.25, 0, 0]);
    sb.add(new THREE.CylinderGeometry(0.0025, 0.0025, 0.12 * k, 6), stone ? hairC : '#d9a441', 'head', relH(0, top + 0.002, back * 0.55 + zc * 0.45), [0, 0, 1.3]); }
  if (hs === 'topknot') { const z0 = zc - 0.012; sb.add(new THREE.CylinderGeometry(0.017 * k, 0.021 * k, 0.05 * k, 10), hairC, 'head', relH(0, top + 0.012, z0), [-0.15, 0, 0], [1, 1, 1], { color: (v) => strand(V3(v.x * 4, top, z0)) });
    sb.add(SPHERE(10, 8), hairC, 'head', relH(0, top + 0.036 * k, z0 - 0.004), [0, 0, 0], [0.021 * k, 0.016 * k, 0.025 * k], { color: (v) => strand(V3(v.x * 4, top + 0.03, z0)) });
    if (look.nation === 'fire' && !stone) { sb.add(new THREE.ConeGeometry(0.012 * k, 0.04 * k, 6), '#e0b050', 'head', relH(0, top + 0.06 * k, z0 + 0.002)); sb.add(new THREE.CylinderGeometry(0.022 * k, 0.024 * k, 0.012, 10), '#e0b050', 'head', relH(0, top + 0.022 * k, z0 - 0.002), [-0.15, 0, 0]); } }
  if (look.beard) { /* beard: an offset shell of the jaw below the mouth corners, then moustache and goatee */
    shell((v) => Math.min(M.mouthY + 0.004 - v.y, (fz(v.z) + 0.15) * 0.1), 0.007 * k, (c) => strand(c));
    sb.add(new THREE.ConeGeometry(0.026 * k, 0.075 * k, 8), hairC, 'head', relH(0, M.chin - 0.022 * k, M.mouthZ - 0.012), [Math.PI + 0.35, 0, 0], [1, 1, 0.7], { color: (v) => strand(V3(v.x * 5, M.chin, M.headFront)) });
    for (const s of [-1, 1]) sb.add(SPHERE(8, 6), hairC, 'head', relH(s * 0.014, M.mouthY + 0.011, M.mouthZ + 0.003), [0, 0, s * 0.3], [0.017 * k, 0.005, 0.0075], { color: (v) => strand(V3(s, M.mouthY, M.headFront)) }); }
}

/* ---------- two-bone IK: poses that touch the body or the ground are authored as reach targets, so they fit both frames ---------- */
const _ikX = V3(1, 0, 0), _ike = new THREE.Euler();
/* limb: rest root S (in its frame), unit rest directions r1 / r2, lengths a / b, sign +1 for elbows (flex = −x), −1 for knees (flex = +x) */
function limbIK(limb, T, pole) {
  const d = T.clone().sub(limb.S); const L = U.clamp(d.length(), Math.abs(limb.a - limb.b) + 0.01, limb.a + limb.b - 0.002); d.normalize();
  const chain = (f) => limb.r2.clone().applyAxisAngle(_ikX, -limb.sign * f).multiplyScalar(limb.b).addScaledVector(limb.r1, limb.a);
  let lo = 0, hi = 2.9; for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (chain(mid).length() > L) lo = mid; else hi = mid; }
  const f = (lo + hi) / 2; const q = new THREE.Quaternion().setFromUnitVectors(chain(f).normalize(), d);
  /* twist about the reach axis so the elbow / knee points at the pole */
  const e = limb.r1.clone().applyQuaternion(q); e.addScaledVector(d, -e.dot(d)); const pp = pole.clone().addScaledVector(d, -pole.dot(d));
  if (e.lengthSq() > 1e-8 && pp.lengthSq() > 1e-8) { e.normalize(); pp.normalize(); q.premultiply(new THREE.Quaternion().setFromAxisAngle(d, Math.atan2(e.clone().cross(pp).dot(d), e.dot(pp)))); }
  _ike.setFromQuaternion(q, 'XYZ'); return { rot: [_ike.x, _ike.y, _ike.z], hinge: -limb.sign * f, mid: limb.S.clone().addScaledVector(limb.r1.clone().applyQuaternion(q), limb.a) };
}
/* a pose key with ik: { legL|legR|L|R: [anchor, [dx, dy, dz], pole?] } becomes joint angles for this body (cached per character).
   Anchors: mouth, sternum, navel, hipJ, and knee / thigh (the knee just solved for that side). Legs solve in the hips frame, arms in the chest frame. */
function resolvePose(H, key) {
  if (!key || !key.ik || !H.limbs) return key; let out = H.ikCache.get(key); if (out) return out; out = Object.assign({}, key);
  const A = H.anchors, J0 = H.restJ, knee = {};
  const target = (spec, frame, sd) => { const nm = spec[0]; const base = nm === 'knee' ? knee[sd] : nm === 'thigh' ? knee[sd] && J0['hip' + sd].clone().lerp(knee[sd], 0.72) : A[nm]; return (base || A.hipJ).clone().add(V3(...spec[1])).sub(J0[frame]); };
  for (const [sd, sg] of [['L', 1], ['R', -1]]) { const spec = key.ik['leg' + sd]; if (!spec) continue;
    const r = limbIK(H.limbs['leg' + sd], target(spec, 'hips', sd), V3(...(spec[2] || [sg * 0.3, 0, 1]))); out['hip' + sd] = r.rot; out['kn' + sd] = [r.hinge, 0, 0]; knee[sd] = r.mid.add(J0.hips); }
  for (const [sd, sg] of [['L', 1], ['R', -1]]) { const spec = key.ik[sd]; if (!spec) continue;
    const r = limbIK(H.limbs[sd], target(spec, 'chest', sd), V3(...(spec[2] || [sg * 0.5, -1, -0.6]))); out['sh' + sd] = r.rot; out['el' + sd] = [r.hinge, 0, 0]; }
  H.ikCache.set(key, out); return out;
}

/* ---------- animation ---------- */
const FIST = new Set(['punchR', 'punchL', 'kick', 'earthLift', 'stomp', 'breath', 'swing']); const GRIP = new Set(['gather', 'eat']);
const _aq = new THREE.Quaternion(), _aq2 = new THREE.Quaternion(), _av = V3();
let _actNames = null; const actionName = (a) => { if (!_actNames) _actNames = new Map(Object.entries(ACTIONS).map(([k, v]) => [v, k])); return _actNames.get(a); };
/* lowest skinned point of the legs, pelvis, back and back of the head, measured from the hips bone (hips.y = −result plants it on y = 0) */
function groundOffset(H) {
  const { list, parent, M, C } = H.rig;
  for (let i = 0; i < list.length; i++) { const b = list[i]; b.updateMatrix(); if (parent[i] < 0) M[i].copy(b.matrix); else M[i].multiplyMatrices(M[parent[i]], b.matrix); }
  let low = Infinity; const p = C.p, bi = C.b, w = C.w, jx = C.jx;
  for (let c = 0; c < C.n; c++) { let y = 0; const o = c * 4, q3 = c * 3;
    for (let k = 0; k < 4; k++) { const ww = w[o + k]; if (!ww) continue; const b = bi[o + k], e = M[b].elements, b3 = b * 3; const x0 = p[q3] - jx[b3], y0 = p[q3 + 1] - jx[b3 + 1], z0 = p[q3 + 2] - jx[b3 + 2]; y += ww * (e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13]); }
    if (y < low) low = y; }
  return low - list[0].position.y;
}
/* rest a posed but un-animated humanoid (e.g. a statue) on the ground */
function settleHumanoid(H) { H.B.hips.position.y = -groundOffset(H); }
/* ball joints blend as rotations (slerp) so IK poses never swing through odd in-betweens; elbows and knees are hinges */
const BALLS = ['shL', 'shR', 'hipL', 'hipR', 'spine', 'head'], HINGES = ['elL', 'elR', 'knL', 'knR'];
const _qa = new THREE.Quaternion(), _qe = new THREE.Euler(); const _keyQ = new WeakMap();
/* swing-twist interpolation: the bone direction travels along a great circle and the twist about the bone turns evenly,
   so limbs move between poses the way an arm or leg does instead of along an arbitrary rotation path */
const _tw1 = new THREE.Quaternion(), _tw2 = new THREE.Quaternion(), _sw1 = new THREE.Quaternion(), _sw2 = new THREE.Quaternion();
const twistOf = (q, ax) => { const a = 2 * Math.atan2(q.x * ax.x + q.y * ax.y + q.z * ax.z, q.w); return Math.atan2(Math.sin(a), Math.cos(a)); };
function stSlerp(out, q1, q2, t, ax) {
  const a1 = twistOf(q1, ax), a2 = twistOf(q2, ax); _sw1.copy(q1).multiply(_tw1.setFromAxisAngle(ax, -a1)); _sw2.copy(q2).multiply(_tw2.setFromAxisAngle(ax, -a2));
  _sw1.slerp(_sw2, t); const da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)); return out.copy(_sw1).multiply(_tw1.setFromAxisAngle(ax, a1 + da * t));
}
const _UP = V3(0, 1, 0); const boneAxis = (H, j) => j === 'spine' || j === 'head' ? _UP : H.limbs[j.startsWith('sh') ? j.slice(-1) : 'leg' + j.slice(-1)].r1;
function keyQuats(key) { let m = _keyQ.get(key); if (!m) { m = {}; for (const j of BALLS) if (key[j]) m[j] = new THREE.Quaternion().setFromEuler(_qe.set(key[j][0], key[j][1], key[j][2])); _keyQ.set(key, m); } return m; }
function animateHumanoid(H, dt, st) {
  const J = H.J, R = H.rest; const v = st.speed || 0, moving = v > 0.05 ? 1 : 0;
  if (!H.pose.hinge) { H.pose.q = {}; H.pose.tq = {}; for (const j of BALLS) { H.pose.q[j] = new THREE.Quaternion(); H.pose.tq[j] = new THREE.Quaternion(); } H.pose.hinge = Object.fromEntries(HINGES.map((j) => [j, 0])); }
  /* gait: a planted leg sweeps back at exactly ground speed (linear in the stance), then swings forward through the air; the stride comes from the
     leg length and the duty factor drops from walking (both feet down at each step) to running (flight phases between steps) */
  const runW = U.smooth(2.8, 5.0, v), sprint = U.clamp((v - 4.5) / 3, 0, 1);
  const Ah = moving * U.lerp(Math.min(0.42, 0.12 + 0.22 * v), 0.45 + 0.13 * sprint, runW); const beta = U.lerp(0.62, 0.3, runW) - 0.04 * sprint;
  if (moving) H.phase += dt * 2 * Math.PI * beta * v / (2 * R.leg * Math.max(0.05, Math.sin(Ah)));
  const sp = U.clamp(v / 4.5, 0, 1.7); const ph = H.phase; const amp = Ah / 0.46;
  const legPhase = (f) => { if (f < beta) return { th: Ah * (1 - 2 * f / beta), st: f / beta, sw: -1 }; const u = (f - beta) / (1 - beta); return { th: -Ah + 2 * Ah * U.smooth(0, 1, u) + Math.sin(Math.PI * u) * 0.2 * runW * moving, st: -1, sw: u }; };
  const fL = ((ph / (2 * Math.PI)) % 1 + 1) % 1, fR = (fL + 0.5) % 1, gL = legPhase(fL), gR = legPhase(fR);
  const kSw = moving * (U.lerp(1.0, 1.55, runW) + 0.35 * sprint), kSt = moving * (0.1 + 0.18 * runW), armA = moving * U.lerp(Ah * 0.8, 0.7 + 0.2 * sprint, runW);
  const knee = (g) => 0.05 + (g.sw >= 0 ? Math.sin(Math.PI * g.sw) ** 1.2 * kSw : Math.sin(Math.PI * g.st) * kSt);
  const cA = Math.cos(2 * Math.PI * fL); /* +1 when the left heel strikes: left arm back, right arm forward */
  const L = {
    hipL: [-gL.th, 0, 0.02], hipR: [-gR.th, 0, -0.02], knL: [knee(gL), 0, 0], knR: [knee(gR), 0, 0],
    shL: [cA * armA, 0, 0.07 + runW * 0.06], shR: [-cA * armA, 0, -0.07 - runW * 0.06],
    elL: [-0.2 - runW * 1.05 - Math.max(0, -cA) * 0.3 * moving, 0, 0], elR: [-0.2 - runW * 1.05 - Math.max(0, cA) * 0.3 * moving, 0, 0],
    spine: [0.03 + runW * 0.14 + sprint * 0.06, cA * 0.08 * amp, 0], head: [-runW * 0.08, 0, 0], hipsY: 0,
  };
  const flight = gL.sw >= 0 && gR.sw >= 0 ? Math.sin(Math.PI * U.clamp(((fL % 0.5) - beta) / Math.max(0.05, 0.5 - beta), 0, 1)) : 0;
  let lift = moving * runW * 0.06 * flight;
  const now = performance.now() * 0.001; const breath = Math.sin(now * 1.8 + (H.look.height || 1) * 9) * 0.012;
  H.stance = U.damp(H.stance, (st.combat && sp < 1.2) ? 1 : 0, 6, dt);
  const ST = STANCE[st.element] || STANCE.none;
  for (const j of JOINTS.concat(['hipsY'])) { const lv = L[j]; const sv = ST[j];
    if (j === 'hipsY') { L.hipsY = U.lerp(L.hipsY, sv || 0, H.stance * (1 - sp * 0.6)); continue; }
    if (sv) for (let k = 0; k < 3; k++) lv[k] = U.lerp(lv[k], sv[k], H.stance * (1 - Math.min(sp, 1) * 0.55)); }
  if (sp < 0.05) { L.shL[2] += 0.04 + breath; L.shR[2] -= 0.04 + breath; L.spine[0] += breath; }
  if (!st.grounded && !st.swim) { const up = U.clamp((st.vy || 0) / 8, -1, 1); L.hipL = [-0.6, 0, 0.1]; L.knL = [0.9, 0, 0]; L.hipR = [0.1, 0, -0.1]; L.knR = [0.4 + up * 0.2, 0, 0]; L.shL = [-0.3 - up * 0.6, 0, 0.6]; L.shR = [-0.3 - up * 0.6, 0, -0.6]; L.hipsY = 0; lift = 0; }
  if (st.swim) { const ss = Math.sin(now * 6); Object.assign(L, { spine: [1.2, 0, 0], head: [-1.0, 0, 0], shL: [-2.4 + ss * 0.8, 0, 0.4], shR: [-2.4 - ss * 0.8, 0, -0.4], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], hipL: [ss * 0.4, 0, 0], hipR: [-ss * 0.4, 0, 0], knL: [0.3, 0, 0], knR: [0.3, 0, 0], hipsY: 0.0 }); lift = 0; }
  if (st.meditate) { const m = resolvePose(H, MEDITATE); for (const j of JOINTS) if (m[j]) L[j] = m[j].slice(); L.hipsY = m.hipsY; L.spine[0] += breath * 2; lift = 0; }
  if (st.sleep) { for (const j of JOINTS) L[j] = [0, 0, 0]; L.shL = [0, 0, 0.1]; L.shR = [0, 0, -0.1]; L.knL = [0.3, 0, 0]; L.hipL = [-0.3, 0, 0]; L.hipsY = 0; lift = 0; }
  const Q = H.pose.tq; for (const j of BALLS) Q[j].setFromEuler(_qe.set(L[j][0], L[j][1], L[j][2]));
  let spin = 0;
  if (H.action) {
    H.actionT += dt; const act = H.action; const u = H.actionT / (act.dur * (H.actionSpeed || 1));
    if (u >= 1) H.action = null;
    else { const sp0 = samplePose(act, u), a = resolvePose(H, sp0.a), b = resolvePose(H, sp0.b), t = sp0.t; const fade = Math.min(1, u / 0.06, (1 - u) / 0.12); lift *= 1 - fade;
      const qa = a && keyQuats(a), qb = b && keyQuats(b);
      for (const j of BALLS) { const A1 = qa && qa[j], B1 = qb && qb[j]; if (!A1 && !B1) continue; const ax = boneAxis(H, j); stSlerp(_qa, A1 || Q[j], B1 || Q[j], t, ax); stSlerp(Q[j], Q[j], _qa, fade, ax); }
      for (const j of HINGES) { const va = a && a[j], vb = b && b[j]; if (!va && !vb) continue; const from = va ? va[0] : L[j][0], to = vb ? vb[0] : L[j][0]; L[j][0] = U.lerp(L[j][0], U.lerp(from, to, t), fade); }
      const ya = (a && a.hipsY !== undefined) ? a.hipsY : L.hipsY, yb = (b && b.hipsY !== undefined) ? b.hipsY : L.hipsY; L.hipsY = U.lerp(L.hipsY, U.lerp(ya, yb, t), fade);
      if (act.spin) spin = act.spin * U.smooth(0.05, 0.75, u); }
  }
  /* head (and a little of the spine) turn toward what the character is looking at */
  if (st.lookAt && !st.dead && !st.sleep) { const hp = V3(); H.root.getWorldPosition(hp); const eye = hp.y + R.eyeY * (H.look.height || 1); const dx = st.lookAt.x - hp.x, dz = st.lookAt.z - hp.z; const rel = U.angDiff(H.root.rotation.y, Math.atan2(dx, dz)); const yaw = U.clamp(rel, -0.75, 0.75) * (Math.abs(rel) < 2.2 ? 1 : 0);
    const pitch = U.clamp(-Math.atan2((st.lookAt.y || eye) - eye, Math.hypot(dx, dz)), -0.4, 0.35); Q.head.multiply(_qa.setFromEuler(_qe.set(pitch * 0.6, yaw * 0.7, 0))); Q.spine.multiply(_qa.setFromEuler(_qe.set(0, yaw * 0.25, 0))); }
  /* joints ease toward the target pose */
  const k = 22, ease = 1 - Math.exp(-k * dt), PQ = H.pose.q, PH = H.pose.hinge;
  for (const j of BALLS) { stSlerp(PQ[j], PQ[j], Q[j], ease, boneAxis(H, j)); J[j].quaternion.copy(PQ[j]); }
  for (const j of HINGES) { PH[j] = U.damp(PH[j], L[j][0], k, dt); J[j].rotation.set(PH[j], 0, 0); }
  /* clavicles shrug as the arms rise and reach forward with them; the upper arm keeps its authored direction */
  for (const [sd, sg] of [['L', 1], ['R', -1]]) { const cl = J['clav' + sd]; if (!cl) continue; const q = PQ['sh' + sd]; const d = _av.set(0, -1, 0).applyQuaternion(q);
    const raise = U.clamp((Math.acos(U.clamp(-d.y, -1, 1)) - 1.05) * 0.3, 0, 0.38), fwd = U.clamp(d.z, -0.5, 1) * 0.15;
    cl.rotation.set(0, -sg * fwd, sg * raise); _aq2.setFromEuler(cl.rotation).invert(); J['sh' + sd].quaternion.copy(_aq2.multiply(q)); }
  /* chest: breathing and a counter-twist against the hips */
  if (J.chest) { const yaw = _qe.setFromQuaternion(PQ.spine).y; J.chest.rotation.y = U.damp(J.chest.rotation.y, -yaw * 0.45, 10, dt); const br = 1 + Math.sin(now * 1.8) * 0.012 * (st.dead ? 0 : 1); J.chest.scale.set(br, 1, br); }
  /* feet: soles stay level (pitch and roll); while walking the heel peels off at push-off with the toes bending, and the foot lifts its toes through the swing */
  if (J.ankleL) { const kk = st.dead || st.sleep ? 0 : H.action ? 0.5 : st.meditate ? 0.25 : 0.9; const gait = moving && st.grounded && !st.swim && !H.action ? 1 : 0;
    for (const [sd] of [['L'], ['R']]) { const hip = J['hip' + sd].rotation, kn = J['kn' + sd].rotation;
      let a = -(hip.x + kn.x) * kk, z = -hip.z * kk * 0.9, toe = 0;
      if (gait) { const g = sd === 'L' ? gL : gR; const push = g.st >= 0 ? U.smooth(0.55, 1, g.st) : 1 - U.smooth(0, 0.3, g.sw); a += push * (0.5 + 0.35 * runW) - (g.sw >= 0 ? Math.sin(Math.PI * g.sw) * 0.18 : 0); toe = -push * (0.7 + 0.3 * runW); }
      if (st.swim) { a = 0.6; z = 0; } else if (!st.grounded) a = 0.25; if (st.meditate) { a = 0.45; z = 0; }
      const an = J['ankle' + sd]; an.rotation.x = U.damp(an.rotation.x, a, 16, dt); an.rotation.z = U.damp(an.rotation.z, z, 16, dt);
      if (J['toe' + sd]) J['toe' + sd].rotation.x = U.damp(J['toe' + sd].rotation.x, toe, 16, dt); } }
  /* hips: lying down when asleep or knocked out; otherwise the lowest point of the body is planted on the ground */
  const fall = (st.dead || st.sleep) ? 1 : 0; H.fall = U.damp(H.fall || 0, fall, 4, dt);
  J.hips.position.z = -H.fall * 0.2; J.hips.rotation.set(-H.fall * 1.5, spin, 0);
  const planted = !!st.grounded && !st.swim; H.plant = U.damp(H.plant ?? (planted ? 1 : 0), planted ? 1 : 0, 10, dt);
  const authored = R.hipsY + L.hipsY - H.fall * (R.hipsY - 0.14); let hy = authored;
  if (H.plant > 0.002) hy = U.lerp(authored, -groundOffset(H) + lift * (1 - H.fall), H.plant);
  J.hips.position.y = planted ? hy : U.damp(J.hips.position.y, hy, k, dt);
  /* hands: fists for fire/earth strikes, open palms for air/water, a loose grip for tools */
  if (J.fingL) { let cl = 0.42; const an = H.action && actionName(H.action);
    if (an && FIST.has(an)) cl = 1.45; else if (an && GRIP.has(an)) cl = 1.1; else if (an) cl = 0.12; else if (H.stance > 0.5) cl = (st.element === 'fire' || st.element === 'earth' || st.element === 'none') ? 1.35 : 0.15;
    if (st.meditate) cl = 0.55; if (st.dead || st.sleep) cl = 0.5;
    for (const [sd, sg] of [['L', -1], ['R', 1]]) { const c2 = (sd === 'R' && H.grip) ? 1.45 : cl; const i = sd === 'L' ? 0 : 1; H.curl[i] = U.damp(H.curl[i], c2, 14, dt);
      J['fing' + sd].rotation.z = sg * H.curl[i] * 0.95; J['fing2' + sd].rotation.z = sg * H.curl[i] * 1.05; J['thumb' + sd].rotation.z = sg * H.curl[i] * 0.45; J['thumb' + sd].rotation.x = H.curl[i] * 0.35; } }
  /* blinking; eyes stay closed when asleep, knocked out, or deep in meditation */
  if (J.lidL) { H.blinkT -= dt; let lid = 0; if (H.blinkT < 0) { const u = -H.blinkT / 0.16; lid = Math.sin(Math.min(1, u) * Math.PI) * 1.35; if (u >= 1) H.blinkT = 2 + Math.random() * 4; }
    if (st.dead || st.sleep) lid = 1.4; else if (st.meditate) lid = 1.2; J.lidL.rotation.x = J.lidR.rotation.x = lid; }
  /* hair tail sways and streams back when moving fast */
  if (J.hairTail) { J.hairTail.rotation.x = U.damp(J.hairTail.rotation.x, 0.12 + sp * 0.18 + Math.sin(now * 2.1) * 0.04 - (J.head.rotation.x * 0.5), 6, dt); J.hairTail.rotation.z = U.damp(J.hairTail.rotation.z, Math.sin(ph) * 0.12 * amp - J.spine.rotation.y * 0.3, 6, dt); }
  if (H.emissiveT > 0) { H.emissiveT -= dt; H.mat.emissive.setRGB(0.9, 0.25, 0.1).multiplyScalar(Math.max(0, H.emissiveT / 0.18)); } else H.mat.emissive.setRGB(st.glow || 0, (st.glow || 0) * 0.8, (st.glow || 0) * 0.5);
}
