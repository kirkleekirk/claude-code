/* =====================================================================
   HUMANOIDS: one skinned mesh per character (plus a glossy eye mesh).
   Smooth-shaded sculpted anatomy, layered nation clothing, articulated
   fingers, eyelids and hair. Bone names match the animation system:
   hips, spine, neck, head, shL/elL/handL, hipL/knL (…R), plus chest,
   ankles, fingers, lids and a hair bone used by the newer animation.
   All parts face +Z; arms hang along -Y with palms facing the body.
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
      // drop whole triangles the caller does not want (e.g. hair below the hairline)
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
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4)); g.computeBoundingSphere(); return g; }
}
// lathe from [radius, y] pairs (y ascending); seam at the back so front details stay clean
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg, Math.PI, Math.PI * 2);
const mixC = (a, b, t) => _sc.set(a).lerp(_sc2.set(b), t).clone();
const sm = U.smooth;

/* ---------- the sculpted head (head-bone space; eyes at y≈0.118) ---------- */
function headPoint(u, out) {
  // u: unit-sphere direction. Cranium ellipsoid, then jaw taper, chin, brow, cheekbones, sockets, flat face.
  let x = u.x * 0.074, y = u.y * 0.118, z = u.z * 0.094;
  const low = sm(0.1, -0.95, u.y);                                     // 0 above the cheekbones → 1 at the chin
  x *= 1 - 0.30 * low * (0.55 + 0.45 * Math.max(0, u.z));             // narrow jaw toward the chin
  if (u.z < 0) z *= 1 - 0.42 * sm(-0.15, -1, u.y);                     // back of the skull tucks into the neck
  if (u.z > 0) { z *= 1 - 0.18 * Math.pow(u.z, 4) * (1 - low);         // flatter face plane
    z += 0.007 * sm(0.55, 0.95, u.z) * sm(-0.55, -0.85, u.y);          // chin juts slightly
    z += 0.006 * sm(0.0, 0.2, u.y) * sm(0.45, 0.2, u.y) * sm(0.6, 0.9, u.z); // brow ridge
    const ex = Math.abs(u.x) - 0.42, ey = u.y - 0.0; z -= 0.007 * Math.exp(-(ex * ex + ey * ey) / 0.012) * sm(0.5, 0.85, u.z); // eye sockets
    x *= 1 + 0.05 * Math.exp(-((u.y + 0.15) ** 2) / 0.02) * sm(0.2, 0.6, u.z) * sm(0.4, 0.75, Math.abs(u.x)); }       // cheekbones
  if (u.y > 0.2 && u.z < 0.2) z *= 1.04;                               // fuller crown at the back
  out.set(x, y + 0.122, z - 0.004); return out;
}
const HEAD_GEO = (() => { const g = new THREE.SphereGeometry(1, 36, 26); const p = g.attributes.position; const u = V3(), o = V3(); for (let i = 0; i < p.count; i++) { u.fromBufferAttribute(p, i).normalize(); headPoint(u, o); p.setXYZ(i, o.x, o.y, o.z); } return g; })();
const HEAD_FRONT = (() => { // depth of the face at (x, y) for placing features on the surface
  const p = HEAD_GEO.attributes.position; const pts = []; for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.02) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return (x, y) => { let best = 0, bd = 1e9; for (const q of pts) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = q[2]; } } return best; };
})();
const SPHERE = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
const CAPS = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 2, 7); // total length = len

/* ---------- skeleton ---------- */
function makeSkeleton(look) {
  const isB = look.body === 'B', bw = look.build || 1; const B = {}; const list = [];
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) B[parent].add(b); B[name] = b; list.push(b); return b; };
  const shX = (isB ? 0.168 : 0.198) * bw;
  mk('hips', null, 0, 0.92, 0); mk('spine', 'hips', 0, 0.03, 0); mk('chest', 'spine', 0, 0.22, 0); mk('neck', 'chest', 0, 0.27, 0); mk('head', 'neck', 0, 0.072, 0);
  const ez = HEAD_FRONT(0.032, 0.118) - 0.0075; mk('lidL', 'head', 0.032, 0.118, ez); mk('lidR', 'head', -0.032, 0.118, ez); mk('hairTail', 'head', 0, 0.19, -0.075);
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    mk('sh' + sd, 'chest', s * shX, 0.20, 0); mk('el' + sd, 'sh' + sd, 0, -0.27, 0); mk('hand' + sd, 'el' + sd, 0, -0.255, 0);
    mk('fing' + sd, 'hand' + sd, 0, -0.088, 0); mk('fing2' + sd, 'fing' + sd, 0, -0.042, 0); mk('thumb' + sd, 'hand' + sd, -s * 0.012, -0.026, 0.022);
    mk('hip' + sd, 'hips', s * 0.094 * bw * (isB ? 1.08 : 1), -0.03, 0); mk('kn' + sd, 'hip' + sd, 0, -0.43, 0); mk('ankle' + sd, 'kn' + sd, 0, -0.40, 0);
  }
  return { B, list, shX, isB, bw };
}

/* ---------- body & clothing ---------- */
function buildHumanoid(look, opts = {}) {
  const N = NATIONS[look.nation] || NATIONS.earth; const pal = opts.palette || N.outfits[(look.outfit || 0) % N.outfits.length];
  const stone = !!opts.stone; const S = (c) => stone ? '#a39b8c' : c;
  const skin = stone ? '#9a9286' : look.skin; const hairC = stone ? '#8a8276' : look.hairColor; const [c1, c2, c3] = pal.map(S);
  const nat = look.nation; const { B, list, isB, bw } = makeSkeleton(look);
  const sb = new SkinBuilder(list);
  const skinTone = (v, extra) => { const c = _sc.set(skin); if (stone) return c; const h = U.hash2(Math.round(v.x * 900), Math.round(v.y * 900 + v.z * 300)); c.multiplyScalar(0.97 + h * 0.05); if (extra) c.lerp(_sc2.set(extra[0]), extra[1]); return c; };
  const lipC = stone ? skin : '#' + mixC(skin, '#9c3f48', 0.42).getHexString();
  const W = (a, b, t) => [[a, 1 - t], [b, t]];

  /* --- torso (garment surface) in spine space: waist y=0 → neck base y≈0.52 --- */
  const tw = (isB ? 1.02 : 1.16) * bw;
  const torsoPts = isB ? [[0.120, -0.02], [0.124, 0.06], [0.140, 0.15], [0.150, 0.24], [0.155, 0.32], [0.152, 0.39], [0.138, 0.44], [0.108, 0.48], [0.074, 0.515], [0.054, 0.54]]
    : [[0.134, -0.02], [0.138, 0.06], [0.150, 0.15], [0.160, 0.24], [0.166, 0.32], [0.164, 0.39], [0.150, 0.44], [0.118, 0.48], [0.080, 0.515], [0.058, 0.54]];
  const garment = (v) => { // nation-specific colour patterns painted into the torso
    const front = v.z > 0; const ax = Math.abs(v.x);
    if (nat === 'earth') { const vv = front && ax < (0.47 - v.y) * 0.42 && v.y > 0.18; if (vv) return ax > (0.47 - v.y) * 0.42 - 0.012 ? c3 : c2; if (v.y > -0.02 && v.y < 0.06) return c3; return c1; }
    if (nat === 'fire') { if (v.y > -0.02 && v.y < 0.05) return c2; if (front && ax < 0.012 && v.y > 0.05) return c3; if (front && Math.abs(ax - (0.52 - v.y) * 0.35) < 0.01 && v.y > 0.3) return c3; return c1; }
    if (nat === 'water') { if (front && ax < 0.01 && v.y > 0.02) return c3; if (v.y > -0.02 && v.y < 0.04) return c3; return c1; }
    // air: yellow shirt, orange sash across the chest from the left shoulder to the right hip, orange belt
    if (v.y > -0.02 && v.y < 0.05) return S('#d9772a'); return c2;
  };
  sb.add(lathe(torsoPts, 28), c1, 'spine', [0, 0, 0], [0, 0, 0], [tw, 1, 0.70], {
    deform: (v) => { if (v.z > 0) { if (isB) { for (const sx of [-0.05, 0.05]) { const d = ((v.x - sx) ** 2 + (v.y - 0.27) ** 2) / 0.0028; v.z += 0.032 * Math.exp(-d); } } else v.z += 0.012 * Math.exp(-((v.y - 0.3) ** 2) / 0.006); }
      else v.z -= 0.01 * Math.exp(-((Math.abs(v.x) - 0.06) ** 2 + (v.y - 0.33) ** 2) / 0.004); },
    color: garment, weights: (v) => W('spine', 'chest', sm(0.1, 0.26, v.y)) });
  // pelvis
  const pw = (isB ? 1.12 : 1.0) * bw;
  sb.add(lathe([[0.02, -0.15], [0.10, -0.135], [0.145, -0.08], [0.158, -0.03], [0.150, 0.02], [0.138, 0.06]], 24), c2, 'hips', [0, 0, 0], [0, 0, 0], [pw, 1, 0.78], {
    deform: (v) => { if (v.z < 0) v.z -= 0.022 * Math.exp(-((v.y + 0.06) ** 2) / 0.003); },
    color: () => nat === 'air' ? c2 : nat === 'water' ? S('#1f3d66') : nat === 'fire' ? c2 : S('#8c7752'),
    weights: (v) => { const t = sm(-0.08, -0.15, v.y) * sm(0.02, 0.07, Math.abs(v.x)) * 0.6; return t > 0 ? W('hips', v.x > 0 ? 'hipL' : 'hipR', t) : null; } });
  // tunic / parka / robe skirt hanging from the waist (follows the legs)
  const skirtLen = nat === 'air' ? (isB ? 0.48 : 0.30) : nat === 'water' ? 0.30 : nat === 'earth' ? (isB ? 0.42 : 0.33) : (isB ? 0.36 : 0.24);
  const skirtC = nat === 'air' ? S('#d9772a') : c1;
  sb.add(lathe([[0.168 + skirtLen * 0.16, -skirtLen], [0.163 + skirtLen * 0.08, -skirtLen * 0.55], [0.158, -0.06], [0.150, 0.03]], 26), skirtC, 'hips', [0, 0, 0], [0, 0, 0], [pw * 1.03, 1, 0.86], {
    color: (v) => { const hem = v.y < -skirtLen + 0.03; if (nat === 'water' && hem) return S('#f2f2ea'); if (hem) return c3; if (nat === 'fire' && v.z > 0 && Math.abs(v.x) < 0.012) return c3; return skirtC; },
    weights: (v) => { const t = sm(-0.04, -skirtLen, v.y) * sm(0.0, 0.08, Math.abs(v.x)) * 0.8; return t > 0 ? W('hips', v.x > 0 ? 'hipL' : 'hipR', t) : null; } });
  if (nat === 'water') sb.add(new THREE.TorusGeometry(1, 0.22, 8, 28), S('#f2f2ea'), 'hips', [0, -skirtLen + 0.01, 0], [Math.PI / 2, 0, 0], [0.2 * pw, 0.2 * 0.88, 0.2], { weights: (v) => W('hips', v.x > 0 ? 'hipL' : 'hipR', 0.45 * sm(0, 0.1, Math.abs(v.x))) });

  // neck & collars
  sb.add(lathe([[0.058, -0.05], [0.053, 0.03], [0.050, 0.09], [0.044, 0.12]], 16), skin, 'neck', [0, 0, 0.002], [0, 0, 0], [(isB ? 1.0 : 1.12) * bw, 1, 1], { color: (v) => skinTone(v, v.z > 0 ? ['#7a4a36', 0.08] : null) });
  if (nat === 'water') { sb.add(new THREE.TorusGeometry(1, 0.32, 8, 24), S('#f2f2ea'), 'chest', [0, 0.30, -0.012], [Math.PI / 2 - 0.15, 0, 0], [0.085, 0.072, 0.085], { color: (v) => _sc.set(S('#f2f2ea')).multiplyScalar(0.92 + U.hash2(Math.round(v.x * 400), Math.round(v.z * 400)) * 0.12) });
    sb.add(SPHERE(18, 10), c1, 'chest', [0, 0.30, -0.075], [0.4, 0, 0], [0.11, 0.05, 0.06]); } // folded hood
  if (nat === 'fire') sb.add(lathe([[0.072, 0.0], [0.07, 0.05], [0.066, 0.075]], 20), c2, 'chest', [0, 0.27, 0.004], [0, 0, 0], [1.1, 1, 0.9], { color: (v) => v.y > 0.27 + 0.066 ? c3 : c2 });
  if (nat === 'earth') for (const s of [-1, 1]) sb.add(new THREE.BoxGeometry(0.022, 0.2, 0.012), c3, 'chest', [s * 0.03, 0.15, 0.123], [0.12, 0, s * 0.42]);
  if (nat === 'air') { // orange mantle draped over the shoulders and upper back
    sb.add(new THREE.CylinderGeometry(0.205, 0.235, 0.22, 26, 2, true, -Math.PI * 0.82, Math.PI * 1.64), S('#d9772a'), 'chest', [0, 0.17, -0.005], [0, Math.PI, 0], [tw * 0.94, 1, 0.78], { color: (v) => v.y < 0.085 ? S('#a8501a') : S('#d9772a') });
    sb.add(new THREE.CylinderGeometry(0.235, 0.24, 0.3, 22, 2, true, Math.PI * 0.62, Math.PI * 0.76), S('#d9772a'), 'chest', [0, -0.08, -0.01], [0, 0, 0], [tw * 0.94, 1, 0.8], { weights: (v) => W('chest', 'spine', sm(0.0, -0.18, v.y)) }); }
  if (nat === 'air') { // the orange sash: a real strap from the left shoulder across the chest to the right hip
    const fr = (y) => 0.70 * (isB ? 0.152 : 0.162) + 0.012; const ang = Math.atan2(0.36, 0.2);
    sb.add(new THREE.BoxGeometry(0.058, 0.44, 0.012, 1, 8, 1), S('#d9772a'), 'spine', [-0.01, 0.23, fr(0.23)], [0.12, 0, -(Math.PI / 2 - ang)], [1, 1, 1], { deform: (v) => { v.z -= v.y * v.y * 0.25; }, color: (v) => Math.abs(v.x + 0.01 + (v.y - 0.23) * 0.5) > 0.024 ? S('#b85a18') : S('#d9772a'), weights: (v) => W('spine', 'chest', sm(0.1, 0.26, v.y)) }); }
  if (nat === 'fire') { // layered pauldrons
    for (const [sd, s] of [['L', 1], ['R', -1]]) for (let k = 0; k < 3; k++) sb.add(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), k === 0 ? c2 : mixC(c2, '#000', 0.15), 'sh' + sd, [s * 0.012, 0.035 - k * 0.04, 0], [0, 0, -s * (0.25 + k * 0.12)], [0.078 - k * 0.004, 0.05, 0.075 - k * 0.003], { color: (v, n) => (n.y < 0.35 ? c3 : null) }); }
  if (nat === 'fire' || nat === 'earth') sb.add(new THREE.BoxGeometry(0.05, 0.035, 0.012), nat === 'fire' ? S('#e0b050') : c3, 'spine', [0, 0.02, 0.098 * (isB ? 0.95 : 1)], [0, 0, 0]); // belt buckle / sash knot
  if (nat === 'earth') sb.add(SPHERE(10, 8), c3, 'spine', [0.05, 0.015, 0.094], [0, 0, 0], [0.02, 0.018, 0.012]);

  /* --- arms --- */
  const sleeve = nat === 'air' ? c2 : c1;
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    const sh = 'sh' + sd, el = 'el' + sd, hd = 'hand' + sd;
    sb.add(SPHERE(18, 14), sleeve, sh, [s * 0.004, -0.018, 0], [0, 0, 0], [0.054 * bw, 0.06, 0.056], { weights: (v) => W(sh, 'chest', 0.35 * sm(-0.01, 0.05, v.y)) });
    sb.add(lathe([[0.050, 0.02], [0.056, -0.04], [0.052, -0.11], [0.046, -0.19], [0.041, -0.26], [0.038, -0.29]], 18), sleeve, sh, [0, 0, 0], [0, 0, 0], [0.96 * bw, 1, 1.02], { deform: (v) => { if (v.z > 0) v.z += 0.006 * Math.exp(-((v.y + 0.12) ** 2) / 0.004); } });
    const forearmSkin = nat === 'air'; const bracer = nat === 'fire';
    sb.add(lathe([[0.039, 0.035], [0.043, -0.02], [0.044, -0.07], [0.038, -0.14], [0.030, -0.21], [0.027, -0.255], [0.025, -0.27]], 18), forearmSkin ? skin : sleeve, el, [0, 0, 0], [0, 0, 0], [0.95 * bw, 1, 1.05], {
      color: (v) => { if (forearmSkin) return v.y > -0.03 ? c2 : v.y < -0.2 ? S('#8a5a2a') : skinTone(v); if (bracer && v.y < -0.08 && v.y > -0.23) return c2; if (nat !== 'water' && v.y < -0.235) return skinTone(v); return sleeve; },
      weights: (v) => v.y > 0.0 ? W(el, sh, 0.35 * sm(0.0, 0.035, v.y)) : null });
    if (nat === 'earth') sb.add(lathe([[0.045, 0.0], [0.058, -0.1], [0.07, -0.19], [0.068, -0.2]], 18), c1, el, [0, -0.02, 0], [0, 0, 0], [1, 1, 1], { color: (v) => v.y < -0.18 ? c3 : c1 }); // wide sleeve
    if (nat === 'water') sb.add(new THREE.TorusGeometry(1, 0.38, 8, 18), S('#f2f2ea'), el, [0, -0.22, 0], [Math.PI / 2, 0, 0], [0.034, 0.034, 0.03]);
    if (bracer) for (let k = 0; k < 3; k++) sb.add(SPHERE(6, 4), S('#e0b050'), el, [s * 0.034, -0.11 - k * 0.04, 0.012], [0, 0, 0], [0.005, 0.005, 0.005]);
    // hand: palm, four two-segment fingers, thumb (palm faces the body: -s·x)
    sb.add(SPHERE(14, 12), skin, hd, [0, -0.048, 0], [0, 0, 0], [0.019, 0.047, 0.043], { deform: (v) => { v.x = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.8); v.z = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.7); }, color: (v) => skinTone(v, v.x * s < 0 ? ['#d98a7a', 0.12] : null) });
    const fz = [0.026, 0.009, -0.008, -0.024], L1 = [0.036, 0.040, 0.038, 0.030], L2 = [0.030, 0.033, 0.031, 0.025], FR = [0.0088, 0.0092, 0.0088, 0.0078];
    for (let f = 0; f < 4; f++) {
      sb.add(CAPS(FR[f], L1[f] + 0.006), skin, 'fing' + sd, [0, -L1[f] / 2 + 0.004, fz[f]], [0, 0, 0], [1, 1, 1], { color: (v) => skinTone(v) });
      sb.add(CAPS(FR[f] * 0.92, L2[f] + 0.004), skin, 'fing2' + sd, [0, -(L1[f] - 0.042) - L2[f] / 2, fz[f]], [0, 0, 0], [1, 1, 1], { color: (v) => v.y < -(L1[f] - 0.042) - L2[f] * 0.75 && v.x * s > 0 ? skinTone(v, ['#f2d8cc', 0.35]) : skinTone(v) });
    }
    sb.add(CAPS(0.0105, 0.05), skin, 'thumb' + sd, [-s * 0.004, -0.024, 0.006], [0.55, 0, -s * 0.25], [1, 1, 1], { color: (v) => skinTone(v) });
    if (nat === 'air') sb.add(lathe([[0.03, 0.0], [0.03, -0.035]], 14), S('#8a5a2a'), el, [0, -0.215, 0]); // wrist wraps
  }

  /* --- legs --- */
  const pants = nat === 'water' ? S('#1f3d66') : nat === 'air' ? c2 : nat === 'fire' ? c2 : S('#8c7752'); /* darker khaki so trousers never read as bare legs */
  const boot = nat === 'water' ? S('#5a3a24') : nat === 'fire' ? S('#16100e') : nat === 'air' ? S('#8a5a2a') : S('#4a2e1c');
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    const hp = 'hip' + sd, kn = 'kn' + sd, an = 'ankle' + sd;
    sb.add(lathe([[0.072, -0.45], [0.066, -0.40], [0.074, -0.28], [0.086, -0.14], [0.094, -0.03], [0.09, 0.05]], 20), pants, hp, [0, 0, 0], [0, 0, 0], [0.98 * bw * (isB ? 1.06 : 1), 1, 1.05],
      { deform: (v) => { if (v.z > 0) v.z += 0.008 * Math.exp(-((v.y + 0.2) ** 2) / 0.01); }, weights: (v) => v.y > -0.05 ? W(hp, 'hips', 0.45 * sm(-0.05, 0.05, v.y)) : null });
    const tall = nat === 'fire' ? -0.04 : nat === 'water' ? -0.16 : -0.30; // where the boot shaft starts on the shin
    sb.add(lathe([[0.04, -0.39], [0.042, -0.32], [0.05, -0.22], [0.058, -0.12], [0.056, -0.04], [0.06, 0.04]], 20), pants, kn, [0, 0, 0], [0, 0, 0], [0.98 * bw, 1, 1.0], {
      deform: (v) => { if (v.z < 0) v.z -= 0.012 * Math.exp(-((v.y + 0.12) ** 2) / 0.006); },
      color: (v) => { if (v.y < tall) return (nat === 'earth' || nat === 'air') && Math.floor((v.y + 0.5) / 0.022) % 2 ? S('#c8b08a') : boot; return pants; },
      weights: (v) => v.y > 0.0 ? W(kn, hp, 0.4 * sm(0.0, 0.04, v.y)) : null });
    if (nat === 'water') sb.add(new THREE.TorusGeometry(1, 0.4, 8, 18), S('#f2f2ea'), kn, [0, tall, 0], [Math.PI / 2, 0, 0], [0.058, 0.058, 0.05]);
    if (nat === 'fire') sb.add(lathe([[0.058, -0.02], [0.062, 0.03]], 18), boot, kn, [0, 0, 0.004]); // boot cuff below the knee
    // foot / shoe (ankle space; sole at y=-0.06)
    sb.add(SPHERE(18, 12), boot, an, [0, -0.04, 0.055], [0, 0, 0], [0.047, 0.042, 0.13], {
      deform: (v) => { if (v.y < -0.35) v.y = -0.35 - (v.y + 0.35) * 0.15; if (nat === 'fire' && v.z > 0.8) v.y += (v.z - 0.8) * 0.9; },
      color: (v) => v.y < -0.055 ? mixC(boot, '#000', 0.35) : boot, ao: 0.25 });
    sb.add(lathe([[0.034, -0.05], [0.038, 0.0], [0.04, 0.04]], 16), boot, an, [0, 0, 0]);
  }

  /* --- head, face and hair --- */
  sb.add(HEAD_GEO, skin, 'head', [0, 0, 0], [0, 0, 0], [1, 1, 1], { color: (v, n) => {
    if (look.arrows && !stone && Math.abs(v.x) < 0.013 && (v.z < 0.05 ? v.y > 0.12 : v.y > 0.175)) return _sc.set('#2a8ad8');
    const shaved = (look.hair === 'shaved' || look.hair === 'wolftail') && v.y > 0.16 - Math.max(0, -v.z) * 0.5 && !(look.hair === 'wolftail' && Math.abs(v.x) < 0.035);
    const cheek = v.z > 0.03 && Math.abs(v.x) > 0.026 && Math.abs(v.x) < 0.06 && v.y > 0.07 && v.y < 0.105;
    const c = skinTone(v, cheek ? ['#d9705f', 0.13] : v.y < 0.05 && v.z < 0.05 ? ['#3a2418', 0.12] : null);
    if (shaved && !stone) c.lerp(_sc2.set(hairC), 0.18); return c; } });
  const fz = (x, y) => HEAD_FRONT(x, y);
  // nose: bridge, tip, wings
  const nz = fz(0, 0.1);
  sb.add(new THREE.CylinderGeometry(0.0075, 0.012, 0.036, 10), skin, 'head', [0, 0.106, nz + 0.003], [-0.38, 0, 0], [1, 1, 1], { color: (v) => skinTone(v) });
  sb.add(SPHERE(12, 10), skin, 'head', [0, 0.089, nz + 0.012], [0, 0, 0], [0.0125, 0.011, 0.012], { color: (v) => skinTone(v, v.y < 0.084 ? ['#5a2a20', 0.25] : null) });
  for (const s of [-1, 1]) sb.add(SPHERE(10, 8), skin, 'head', [s * 0.011, 0.087, nz + 0.004], [0, 0, 0], [0.0085, 0.0075, 0.008], { color: (v) => skinTone(v, v.y < 0.084 ? ['#4a2018', 0.3] : null) });
  // lips
  const mz = fz(0, 0.066);
  sb.add(SPHERE(14, 8), lipC, 'head', [0, 0.0705, mz + 0.001], [0, 0, 0], [0.0215, 0.0058, 0.0085], { color: (v) => _sc.set(lipC).multiplyScalar(v.y < 0.069 ? 0.8 : 1) });
  sb.add(SPHERE(14, 8), lipC, 'head', [0, 0.0605, mz - 0.001], [0, 0, 0], [0.0195, 0.0068, 0.009]);
  sb.add(SPHERE(10, 6), stone ? skin : '#3a1a16', 'head', [0, 0.0655, mz - 0.002], [0, 0, 0], [0.019, 0.0016, 0.006]);
  // ears with a darker inner bowl
  for (const s of [-1, 1]) sb.add(SPHERE(14, 12), skin, 'head', [s * 0.074, 0.112, -0.006], [0, s * 0.35, s * 0.08], [0.011, 0.030, 0.019], { deform: (v) => { if (v.x * s > 0.3) v.x -= 0.5 * (v.x - 0.3 * s); }, color: (v, n) => skinTone(v, n.x * s > 0.55 ? ['#7a3a2a', 0.2] : null) });
  // eyebrows (arched, hair coloured), lower lids
  for (const s of [-1, 1]) { for (let k = 0; k < 4; k++) { const t = k / 3; const x = s * (0.017 + t * 0.03), y = 0.14 + Math.sin(t * Math.PI) * 0.005 - t * 0.003; sb.add(SPHERE(8, 6), hairC, 'head', [x, y, fz(x, y) + 0.0015], [0, 0, s * (0.15 - t * 0.35)], [0.0085, 0.0028 - t * 0.0006, 0.0035]); }
    sb.add(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.24), skin, 'head', [s * 0.032, 0.118, fz(0.032, 0.118) - 0.0075], [0, 0, 0], [0.0136, 0.0136, 0.0136], { color: (v) => skinTone(v) }); }
  // upper eyelids on their own bones (blink), lash line along the rim
  const LID = -0.18, pole = V3(0, Math.cos(LID), Math.sin(LID)); // rest: the rim sits just over the top of the iris
  for (const sd of ['L', 'R']) sb.add(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, 'lid' + sd, [0, 0, 0], [LID, 0, 0], [0.0138, 0.0138, 0.0138], { color: (v) => Math.acos(U.clamp(v.clone().normalize().dot(pole), -1, 1)) > 1.38 && v.z > 0 ? _sc.set(stone ? skin : '#1a120c') : skinTone(v, ['#6a3a2a', 0.06]) });
  buildHair(sb, look, hairC, stone);

  /* --- assemble --- */
  const mat = opts.mat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0 });
  const mesh = new THREE.SkinnedMesh(sb.build(), mat); mesh.add(B.hips); mesh.frustumCulled = false; mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(list));
  const root = new THREE.Group(); root.add(mesh);
  // glossy eyes (separate material so they catch the light)
  if (!stone) { const eb = new GeoBuilder(); const ezz = fz(0.032, 0.118) - 0.0075; const iris = new THREE.Color(look.eyes);
    for (const s of [-1, 1]) { const g = new THREE.SphereGeometry(0.0123, 20, 14); const p = g.attributes.position; const col = []; const fwd = V3(0, 0, 1), catchDir = V3(0.25, 0.35, 0.9).normalize(); const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { _sv.fromBufferAttribute(p, i).normalize(); const a = Math.acos(U.clamp(_sv.dot(fwd), -1, 1));
        if (Math.acos(U.clamp(_sv.dot(catchDir), -1, 1)) < 0.12) c.set('#ffffff'); else if (a < 0.2) c.set('#060404'); else if (a < 0.5) { c.copy(iris).multiplyScalar(a > 0.43 ? 0.45 : 0.85 + 0.3 * U.hash2(Math.round(Math.atan2(_sv.y, _sv.x) * 9), 3)); } else c.set('#efe9df');
        col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.translate(s * 0.032, 0.118, ezz); const m = new THREE.Mesh(g, opts.mat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 })); B.head.add(m); }
    void eb; }
  // attach points expected by gameplay code
  const J = { hips: B.hips, spine: B.spine, chest: B.chest, neck: B.neck, head: B.head, hairTail: B.hairTail };
  for (const sd of ['L', 'R']) { for (const n of ['sh', 'el', 'hip', 'kn', 'fing', 'fing2', 'thumb', 'lid']) J[n + sd] = B[n + sd]; J['wrist' + sd] = B['hand' + sd]; J['ankle' + sd] = B['ankle' + sd];
    const grip = new THREE.Object3D(); grip.position.set(0, -0.06, 0.008); B['hand' + sd].add(grip); J['hand' + sd] = grip;
    const sole = new THREE.Object3D(); sole.position.set(0, -0.06, 0.03); B['ankle' + sd].add(sole); J['foot' + sd] = sole; }
  J.headMesh = { _v: true, get visible() { return this._v; }, set visible(v) { this._v = v; B.head.scale.setScalar(v ? 1 : 0.001); } }; // first-person hides the head
  const shadow = blobShadow(0.45); root.add(shadow); shadow.position.y = 0.03;
  root.scale.setScalar(look.height || 1);
  return { root, J, B, mat, mesh, look, shadow, phase: 0, action: null, actionT: 0, stance: 0, element: opts.element || look.nation, emissiveT: 0, blinkT: 1 + Math.random() * 3, curl: [0.4, 0.4], grip: !!opts.grip };
}

/* ---------- hair styles ---------- */
function buildHair(sb, look, hairC, stone) {
  const hs = look.hair; const base = new THREE.Color(hairC);
  const strand = (v) => { const a = Math.atan2(v.x, v.z); const h = U.hash2(Math.round(a * 26), 7); const c = base.clone().multiplyScalar(0.82 + h * 0.32); if (v.y > 0.2 && !stone) c.lerp(_sc2.set('#ffffff'), 0.05); return c; };
  const shell = (scale, hl) => { const g = new THREE.SphereGeometry(1, 34, 24); const p = g.attributes.position; const u = V3(), o = V3(); for (let i = 0; i < p.count; i++) { u.fromBufferAttribute(p, i).normalize(); headPoint(u, o); o.y -= 0.122; o.multiplyScalar(scale); o.y += 0.122; o.z += (scale - 1) * 0.02; p.setXYZ(i, o.x, o.y, o.z); } return { g, hl }; };
  // hairline in head space: high on the forehead, down to the nape at the back, clear of the ears
  const hairline = (v, temple = 0) => { const front = sm(-0.06, 0.07, v.z); let h = U.lerp(0.035, 0.172, front); if (Math.abs(v.x) > 0.05 && v.z > -0.04) h = Math.max(h, 0.142 + temple); if (Math.abs(v.x) > 0.062 && v.z > -0.03 && v.z < 0.03) h = Math.max(h, 0.15); return v.y > h; };
  const addShell = (scale, keep, color = strand) => { const { g } = shell(scale); sb.add(g, hairC, 'head', [0, 0, 0], [0, 0, 0], [1, 1, 1], { keep, color }); };
  const tailW = (v) => [['hairTail', 1]];
  if (hs === 'shaved') return;
  if (hs === 'wolftail') { addShell(1.045, (v) => hairline(v) && Math.abs(v.x) < 0.05 && v.y > 0.16);
    sb.add(new THREE.ConeGeometry(0.022, 0.1, 10), hairC, 'hairTail', [0, -0.03, -0.03], [-2.5, 0, 0], [1, 1, 0.8], { color: strand, weights: tailW });
    sb.add(new THREE.TorusGeometry(0.014, 0.004, 6, 12), '#3a2a1a', 'hairTail', [0, 0.004, -0.004], [1.0, 0, 0]); return; }
  const fringe = (n = 5, len = 0.04) => { for (let k = 0; k < n; k++) { const t = k / (n - 1) - 0.5; const x = t * 0.09, y = 0.172; sb.add(new THREE.ConeGeometry(0.014, len, 6), hairC, 'head', [x, y - len * 0.35, HEAD_FRONT(x, 0.16) + 0.006], [Math.PI - 0.45, 0, t * 0.9], [1, 1, 0.55], { color: strand }); } };
  addShell(1.065, (v) => hairline(v));
  if (hs === 'short') { for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; const x = Math.cos(a) * 0.035, z = Math.sin(a) * 0.04; sb.add(new THREE.ConeGeometry(0.018, 0.045, 6), hairC, 'head', [x, 0.235, z + 0.01], [z * 6, 0, -x * 6], [1, 1, 1], { color: strand }); } fringe(4, 0.035); }
  if (hs === 'long' || hs === 'loopies' || hs === 'braids') { // long hair falls behind the shoulders and follows the upper back
    sb.add(new THREE.CylinderGeometry(0.084, 0.1, 0.3, 22, 6, true, Math.PI * 0.32, Math.PI * 1.36), hairC, 'head', [0, 0.03, -0.012], [0, 0, 0], [1, 1, 0.9], { color: strand, weights: (v) => [['head', 1 - sm(0.06, -0.1, v.y) * 0.85], ['chest', sm(0.06, -0.1, v.y) * 0.85]] });
    fringe(hs === 'braids' ? 3 : 5, 0.045); }
  if (hs === 'loopies') for (const s of [-1, 1]) { sb.add(new THREE.TorusGeometry(0.018, 0.0055, 6, 14, Math.PI * 1.6), hairC, 'head', [s * 0.068, 0.085, 0.045], [0, s * 0.5, 1.2 * s], [1, 1, 1], { color: strand }); sb.add(SPHERE(8, 6), '#3a6aa8', 'head', [s * 0.07, 0.11, 0.04], [0, 0, 0], [0.006, 0.006, 0.006]); }
  if (hs === 'braids' || hs === 'loopies') for (let k = 0; k < 8; k++) { const y = -0.02 - k * 0.032; sb.add(SPHERE(10, 8), hairC, 'hairTail', [0, y - 0.15, -0.035 - k * 0.003], [0, k % 2 ? 0.5 : -0.5, k % 2 ? 0.35 : -0.35], [0.019 - k * 0.0012, 0.022, 0.016 - k * 0.001], { color: strand, weights: (v) => [['hairTail', 0.4], ['chest', 0.6]] }); }
  if (hs === 'bun') { sb.add(SPHERE(14, 12), hairC, 'head', [0, 0.235, -0.04], [0.3, 0, 0], [0.042, 0.036, 0.04], { color: strand }); sb.add(new THREE.TorusGeometry(0.03, 0.006, 6, 16), stone ? hairC : '#2f5e3a', 'head', [0, 0.215, -0.03], [1.25, 0, 0]);
    sb.add(new THREE.CylinderGeometry(0.0025, 0.0025, 0.12, 6), stone ? hairC : '#d9a441', 'head', [0, 0.24, -0.04], [0, 0, 1.3]); }
  if (hs === 'topknot') { sb.add(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 12), hairC, 'head', [0, 0.248, -0.006], [-0.15, 0, 0], [1, 1, 1], { color: strand }); sb.add(SPHERE(12, 10), hairC, 'head', [0, 0.275, -0.01], [0, 0, 0], [0.022, 0.016, 0.026], { color: strand });
    if (look.nation === 'fire' && !stone) { sb.add(new THREE.ConeGeometry(0.012, 0.04, 6), '#e0b050', 'head', [0, 0.3, -0.004], [0, 0, 0]); sb.add(new THREE.CylinderGeometry(0.022, 0.024, 0.012, 12), '#e0b050', 'head', [0, 0.262, -0.008], [-0.15, 0, 0]); } }
  if (look.beard) { const { g } = shell(1.05); sb.add(g, hairC, 'head', [0, 0, 0], [0, 0, 0], [1, 1, 1], { keep: (v) => v.y < 0.075 && v.z > -0.015 && !(v.z > 0.05 && v.y > 0.052 && Math.abs(v.x) < 0.018), color: strand });
    sb.add(new THREE.ConeGeometry(0.03, 0.09, 10), hairC, 'head', [0, 0.005, HEAD_FRONT(0, 0.02) - 0.004], [Math.PI + 0.35, 0, 0], [1, 1, 0.7], { color: strand });
    for (const s of [-1, 1]) sb.add(SPHERE(10, 6), hairC, 'head', [s * 0.016, 0.078, HEAD_FRONT(0.016, 0.078) + 0.004], [0, 0, s * 0.3], [0.019, 0.006, 0.009], { color: strand }); }
}

/* ---------- animation ---------- */
const FIST = new Set(['punchR', 'punchL', 'kick', 'earthLift', 'stomp', 'breath', 'swing']); const GRIP = new Set(['gather', 'eat']);
function animateHumanoid(H, dt, st) {
  const J = H.J; H.phase += dt * (st.speed || 0) * 1.55;
  const sp = U.clamp((st.speed || 0) / 4.5, 0, 1.7); const run = U.clamp(((st.speed || 0) - 4.5) / 3, 0, 1);
  const ph = H.phase; const s = Math.sin(ph), c = Math.cos(ph);
  const amp = Math.min(sp, 1) * (0.55 + run * 0.35);
  const L = {
    hipL: [-s * 0.75 * amp, 0, 0.02], hipR: [s * 0.75 * amp, 0, -0.02],
    knL: [Math.max(0, c) * 1.1 * amp + 0.05, 0, 0], knR: [Math.max(0, -c) * 1.1 * amp + 0.05, 0, 0],
    shL: [s * 0.65 * amp, 0, 0.08 + run * 0.05], shR: [-s * 0.65 * amp, 0, -0.08 - run * 0.05],
    elL: [-0.25 - run * 0.9 - amp * 0.2, 0, 0], elR: [-0.25 - run * 0.9 - amp * 0.2, 0, 0],
    spine: [0.04 + run * 0.18, s * 0.08 * amp, 0], head: [-run * 0.1, 0, 0], hipsY: Math.abs(c) * 0.045 * amp - run * 0.02,
  };
  const now = performance.now() * 0.001; const breath = Math.sin(now * 1.8 + (H.look.height || 1) * 9) * 0.012;
  H.stance = U.damp(H.stance, (st.combat && sp < 1.2) ? 1 : 0, 6, dt);
  const ST = STANCE[st.element] || STANCE.none;
  for (const j of JOINTS.concat(['hipsY'])) { const lv = L[j]; const sv = ST[j];
    if (j === 'hipsY') { L.hipsY = U.lerp(L.hipsY, sv || 0, H.stance * (1 - sp * 0.6)); continue; }
    if (sv) for (let k = 0; k < 3; k++) lv[k] = U.lerp(lv[k], sv[k], H.stance * (1 - Math.min(sp, 1) * 0.55)); }
  if (sp < 0.05) { L.shL[2] += 0.04 + breath; L.shR[2] -= 0.04 + breath; L.spine[0] += breath; }
  if (!st.grounded && !st.swim) { const up = U.clamp((st.vy || 0) / 8, -1, 1); L.hipL = [-0.6, 0, 0.1]; L.knL = [0.9, 0, 0]; L.hipR = [0.1, 0, -0.1]; L.knR = [0.4 + up * 0.2, 0, 0]; L.shL = [-0.3 - up * 0.6, 0, 0.6]; L.shR = [-0.3 - up * 0.6, 0, -0.6]; L.hipsY = 0; }
  if (st.swim) { const ss = Math.sin(now * 6); Object.assign(L, { spine: [1.2, 0, 0], head: [-1.0, 0, 0], shL: [-2.4 + ss * 0.8, 0, 0.4], shR: [-2.4 - ss * 0.8, 0, -0.4], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], hipL: [ss * 0.4, 0, 0], hipR: [-ss * 0.4, 0, 0], knL: [0.3, 0, 0], knR: [0.3, 0, 0], hipsY: 0.0 }); }
  if (st.meditate) { const m = MEDITATE; for (const j of JOINTS) if (m[j]) L[j] = m[j].slice(); L.hipsY = m.hipsY; L.spine[0] += breath * 2; }
  if (st.sleep) { for (const j of JOINTS) L[j] = [0, 0, 0]; L.shL = [0, 0, 0.1]; L.shR = [0, 0, -0.1]; L.knL = [0.3, 0, 0]; L.hipL = [-0.3, 0, 0]; L.hipsY = 0; }
  let spin = 0;
  if (H.action) {
    H.actionT += dt; const act = H.action; const u = H.actionT / (act.dur * (H.actionSpeed || 1));
    if (u >= 1) H.action = null;
    else { const { a, b, t } = samplePose(act, u); const fade = Math.min(1, u / 0.06, (1 - u) / 0.12);
      for (const j of JOINTS) { const va = a && a[j], vb = b && b[j]; if (!va && !vb) continue; const from = va || L[j], to = vb || L[j]; for (let k = 0; k < 3; k++) L[j][k] = U.lerp(L[j][k], U.lerp(from[k], to[k], t), fade); }
      const ya = (a && a.hipsY !== undefined) ? a.hipsY : L.hipsY, yb = (b && b.hipsY !== undefined) ? b.hipsY : L.hipsY; L.hipsY = U.lerp(L.hipsY, U.lerp(ya, yb, t), fade);
      if (act.spin) spin = act.spin * U.smooth(0.05, 0.75, u); }
  }
  // head turns toward what the character is looking at
  if (st.lookAt && !st.dead && !st.sleep) { const hp = V3(); H.root.getWorldPosition(hp); const dx = st.lookAt.x - hp.x, dz = st.lookAt.z - hp.z; const rel = U.angDiff(H.root.rotation.y, Math.atan2(dx, dz)); const yaw = U.clamp(rel, -0.75, 0.75) * (Math.abs(rel) < 2.2 ? 1 : 0);
    const pitch = U.clamp(-Math.atan2((st.lookAt.y || hp.y + 1.6) - (hp.y + 1.6), Math.hypot(dx, dz)), -0.4, 0.35); L.head[1] += yaw * 0.7; L.spine[1] += yaw * 0.25; L.head[0] += pitch * 0.6; }
  const k = 22;
  for (const j of JOINTS) { const o = J[j]; const v = L[j]; o.rotation.x = U.damp(o.rotation.x, v[0], k, dt); o.rotation.y = U.damp(o.rotation.y, v[1], k, dt); o.rotation.z = U.damp(o.rotation.z, v[2], k, dt); }
  const fall = (st.dead || st.sleep) ? 1 : 0; H.fall = U.damp(H.fall || 0, fall, 4, dt);
  J.hips.position.y = U.damp(J.hips.position.y, 0.92 + L.hipsY - H.fall * 0.74, k, dt); J.hips.position.z = -H.fall * 0.2; J.hips.rotation.x = -H.fall * 1.5; J.hips.rotation.y = spin;
  // chest: breathing and a counter-twist against the hips
  if (J.chest) { J.chest.rotation.y = U.damp(J.chest.rotation.y, -L.spine[1] * 0.45, 10, dt); const br = 1 + Math.sin(now * 1.8) * 0.012 * (st.dead ? 0 : 1); J.chest.scale.set(br, 1, br); }
  // feet stay level with the ground (foot roll), point when swimming, relax when lying down
  if (J.ankleL) { const kk = st.dead || st.sleep ? 0 : H.action ? 0.4 : st.meditate ? 0.25 : 0.85;
    for (const sd of ['L', 'R']) { let a = -(J['hip' + sd].rotation.x + J['kn' + sd].rotation.x) * kk; if (st.swim) a = 0.6; if (!st.grounded && !st.swim) a = 0.25; J['ankle' + sd].rotation.x = U.damp(J['ankle' + sd].rotation.x, a, 16, dt); } }
  // hands: fists for fire/earth strikes, open palms for air/water, a loose grip for tools
  if (J.fingL) { let cl = 0.42; const an = H.action && Object.keys(ACTIONS).find(n => ACTIONS[n] === H.action);
    if (an && FIST.has(an)) cl = 1.45; else if (an && GRIP.has(an)) cl = 1.1; else if (an) cl = 0.12; else if (H.stance > 0.5) cl = (st.element === 'fire' || st.element === 'earth' || st.element === 'none') ? 1.35 : 0.15;
    if (st.meditate) cl = 0.55; if (st.dead || st.sleep) cl = 0.5;
    for (const [sd, sg] of [['L', -1], ['R', 1]]) { const c2 = (sd === 'R' && H.grip) ? 1.45 : cl; const i = sd === 'L' ? 0 : 1; H.curl[i] = U.damp(H.curl[i], c2, 14, dt);
      J['fing' + sd].rotation.z = sg * H.curl[i] * 0.95; J['fing2' + sd].rotation.z = sg * H.curl[i] * 1.05; J['thumb' + sd].rotation.z = sg * H.curl[i] * 0.45; J['thumb' + sd].rotation.x = H.curl[i] * 0.35; } }
  // blinking; eyes stay closed when asleep, knocked out, or deep in meditation
  if (J.lidL) { H.blinkT -= dt; let lid = 0; if (H.blinkT < 0) { const u = -H.blinkT / 0.16; lid = Math.sin(Math.min(1, u) * Math.PI) * 1.35; if (u >= 1) H.blinkT = 2 + Math.random() * 4; }
    if (st.dead || st.sleep) lid = 1.4; else if (st.meditate) lid = 1.2; J.lidL.rotation.x = J.lidR.rotation.x = lid; }
  // hair tail sways and streams back when moving fast
  if (J.hairTail) { J.hairTail.rotation.x = U.damp(J.hairTail.rotation.x, 0.12 + sp * 0.18 + Math.sin(now * 2.1) * 0.04 - (J.head.rotation.x * 0.5), 6, dt); J.hairTail.rotation.z = U.damp(J.hairTail.rotation.z, Math.sin(ph) * 0.12 * amp - J.spine.rotation.y * 0.3, 6, dt); }
  if (H.emissiveT > 0) { H.emissiveT -= dt; H.mat.emissive.setRGB(0.9, 0.25, 0.1).multiplyScalar(Math.max(0, H.emissiveT / 0.18)); } else H.mat.emissive.setRGB(st.glow || 0, (st.glow || 0) * 0.8, (st.glow || 0) * 0.5);
}
