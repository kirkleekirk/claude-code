/* =====================================================================
   MODELS: humanoids (player, villagers, daofei) and creatures
   Everything faces +Z in local space. One material per character so
   hit-flashes and fades only affect that character.
   ===================================================================== */
function charMat() { return new THREE.MeshLambertMaterial({ vertexColors: true }); }
function partMesh(builder, mat) { const m = new THREE.Mesh(builder.build(), mat); return m; }
function blobShadow(r) {
  if (!blobShadow.tex) blobShadow.tex = softTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobShadow.tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}

/* ---------------- humanoid ---------------- */
const HAIR_STYLES = { wolftail: 'Wolf Tail', braids: 'Braids', loopies: 'Hair Loops', long: 'Long', short: 'Short', bun: 'Top Bun', topknot: 'Topknot', shaved: 'Shaved' };
function defaultLook(nation) {
  const N = NATIONS[nation];
  return { nation, body: 'A', height: 1.0, build: 1.0, skin: N.skins[0], hair: N.hairStyles[0], hairColor: N.hairColors[0], eyes: N.eyes[0], outfit: 0 };
}
function buildHumanoid(look, opts = {}) {
  const N = NATIONS[look.nation] || NATIONS.earth; const pal = opts.palette || N.outfits[look.outfit % N.outfits.length];
  const [c1, c2, c3] = pal; const skin = opts.stone ? '#9a9286' : look.skin; const hairC = opts.stone ? '#8a8276' : look.hairColor;
  const isB = look.body === 'B'; const bw = look.build || 1; const mat = opts.mat || charMat();
  const stoneAll = opts.stone; const C = (c) => stoneAll ? '#a39b8c' : c;
  const root = new THREE.Group(); const J = {};
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips); J.hips = hips;
  // pelvis
  let b = new GeoBuilder();
  b.add(new THREE.SphereGeometry(0.15, 10, 8), C(look.nation === 'air' ? c2 : c3 === '#d9a441' ? c2 : c3), 0, 0, 0, 0, 0, 0, (isB ? 1.25 : 1.12) * bw, 0.7, 0.85);
  hips.add(partMesh(b, mat));
  // spine / torso
  const spine = new THREE.Group(); spine.position.y = 0.03; hips.add(spine); J.spine = spine;
  b = new GeoBuilder(); const sw = (isB ? 0.88 : 1.0) * bw;
  const torso = new THREE.CylinderGeometry(0.19, 0.155, 0.48, 12, 3);
  b.add(torso, C(c1), 0, 0.25, 0, 0, 0, 0, sw, 1, 0.72, { ao: 0.2 });
  if (isB) b.add(new THREE.SphereGeometry(0.1, 8, 6), C(c1), 0, 0.33, 0.06, 0, 0, 0, 1.6 * sw, 0.75, 0.8);
  b.add(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), C(c1), 0, 0.47, 0, 0, 0, 0, sw * 1.05, 0.42, 0.75);
  // belt / sash
  b.add(new THREE.CylinderGeometry(0.162, 0.16, 0.08, 12), C(c3), 0, 0.04, 0, 0, 0, 0, sw, 1, 0.75);
  if (look.nation === 'water') { // fur trim parka
    b.add(new THREE.TorusGeometry(0.16, 0.035, 6, 14), C('#f2f2ea'), 0, -0.02, 0, Math.PI / 2, 0, 0, sw * 1.05, 0.75, 1);
    b.add(new THREE.TorusGeometry(0.09, 0.03, 6, 14), C('#f2f2ea'), 0, 0.5, 0, Math.PI / 2, 0, 0, 1.1, 0.9, 1);
    b.add(new THREE.BoxGeometry(0.03, 0.4, 0.02), C(c3), 0.0, 0.26, 0.142, 0, 0, 0);
  } else if (look.nation === 'earth') { // crossed collar and undershirt
    b.add(new THREE.BoxGeometry(0.1, 0.2, 0.02), C(c2), 0, 0.37, 0.135, 0, 0, 0.0);
    b.add(new THREE.BoxGeometry(0.04, 0.32, 0.02), C(c3), 0.05, 0.3, 0.14, 0, 0, 0.35); b.add(new THREE.BoxGeometry(0.04, 0.32, 0.02), C(c3), -0.05, 0.3, 0.14, 0, 0, -0.35);
  } else if (look.nation === 'fire') { // shoulder guards and gold trim
    b.add(new THREE.BoxGeometry(0.03, 0.42, 0.02), C(c3), 0.03, 0.26, 0.142, 0, 0, 0.12);
    for (const sd of [-1, 1]) b.add(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), C(c2), sd * 0.19 * sw, 0.44, 0, 0, 0, -sd * 0.5, 1.1, 0.8, 1.1);
  } else if (look.nation === 'air') { // diagonal sash over the shoulder + shawl
    b.add(new THREE.BoxGeometry(0.07, 0.6, 0.03), C(c1 === '#e0912e' ? '#d06a1e' : c1), 0.0, 0.26, 0.142, 0, 0, 0.6);
    b.add(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12, 1, true, -Math.PI * 0.9, Math.PI * 1.8), C('#d9772a'), 0, 0.4, -0.01, 0, Math.PI, 0, sw, 1, 0.8);
    b.add(new THREE.BoxGeometry(0.18, 0.42, 0.02), C(c2), 0, 0.25, 0.138);
  }
  const torsoMesh = partMesh(b, mat); spine.add(torsoMesh);
  // robe skirt for air nomads and B-bodies of earth/fire (hangs from the hips; follows hips)
  if (look.nation === 'air' || (isB && look.nation !== 'water')) { const rb = new GeoBuilder(); rb.add(new THREE.CylinderGeometry(0.17, 0.25, 0.42, 12, 1, true), C(look.nation === 'air' ? '#d9772a' : c1), 0, -0.2, 0, 0, 0, 0, bw, 1, 0.82); const sk = partMesh(rb, mat); sk.material.side = THREE.DoubleSide; hips.add(sk); J.skirt = sk; }
  // neck & head
  const neck = new THREE.Group(); neck.position.y = 0.5; spine.add(neck); J.neck = neck;
  b = new GeoBuilder(); b.add(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 8), skin, 0, 0.03, 0); neck.add(partMesh(b, mat));
  const head = new THREE.Group(); head.position.y = 0.09; neck.add(head); J.head = head;
  b = new GeoBuilder();
  b.add(new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 0.1, 0, 0, 0, 0, 0.92, 1.1, 1.0);
  b.add(new THREE.SphereGeometry(0.07, 10, 8), skin, 0, 0.04, 0.035, 0, 0, 0, 1.15, 0.9, 1.1); // jaw
  b.add(new THREE.ConeGeometry(0.016, 0.04, 5), skin, 0, 0.085, 0.112, Math.PI / 2 + 0.3, 0, 0); // nose
  for (const sd of [-1, 1]) {
    b.add(new THREE.SphereGeometry(0.024, 8, 6), stoneAll ? '#a39b8c' : '#f6f2ea', sd * 0.042, 0.115, 0.093, 0, 0, 0, 1.15, 0.8, 0.5);
    b.add(new THREE.SphereGeometry(0.014, 8, 6), stoneAll ? '#8a8276' : look.eyes, sd * 0.042, 0.114, 0.103, 0, 0, 0, 1, 1, 0.45);
    b.add(new THREE.SphereGeometry(0.0065, 6, 4), stoneAll ? '#8a8276' : '#0a0806', sd * 0.042, 0.114, 0.108);
    b.add(new THREE.BoxGeometry(0.045, 0.009, 0.012), hairC, sd * 0.043, 0.145, 0.104, 0, 0, sd * -0.12);
    b.add(new THREE.SphereGeometry(0.022, 6, 5), skin, sd * 0.108, 0.1, 0.0, 0, 0, 0, 0.5, 1, 0.8); // ears
  }
  b.add(new THREE.BoxGeometry(0.036, 0.007, 0.01), stoneAll ? '#8a8276' : '#7a3a2a', 0, 0.045, 0.108); // mouth
  // hair
  const hs = look.hair; const hc = hairC;
  if (hs !== 'shaved') b.add(new THREE.SphereGeometry(0.123, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hc, 0, 0.11, -0.01, -0.5, 0, 0, 0.97, 1.12, 1.06); // hairline above the brows, covering the nape
  if (hs === 'long' || hs === 'loopies') b.add(new THREE.BoxGeometry(0.2, 0.3, 0.05), hc, 0, -0.03, -0.09, 0.15, 0, 0, 1, 1, 1);
  if (hs === 'loopies') for (const sd of [-1, 1]) b.add(new THREE.TorusGeometry(0.03, 0.009, 5, 10), hc, sd * 0.085, 0.07, 0.07, 0, sd * 0.4, 0);
  if (hs === 'bun') b.add(new THREE.SphereGeometry(0.055, 8, 6), hc, 0, 0.23, -0.03);
  if (hs === 'topknot') { b.add(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 8), hc, 0, 0.24, -0.01); if (look.nation === 'fire' && !stoneAll) b.add(new THREE.ConeGeometry(0.025, 0.06, 5), '#e0b050', 0, 0.29, 0.0); }
  if (hs === 'wolftail') b.add(new THREE.ConeGeometry(0.035, 0.12, 6), hc, 0, 0.2, -0.1, -2.4, 0, 0);
  if (hs === 'braids') for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) b.add(new THREE.SphereGeometry(0.022, 6, 5), hc, sd * 0.09, 0.04 - k * 0.04, 0.03 - k * 0.003);
  if (hs === 'short') b.add(new THREE.SphereGeometry(0.05, 6, 5), hc, 0, 0.17, 0.08, 0, 0, 0, 1.6, 0.5, 0.8);
  if (look.beard) { b.add(new THREE.ConeGeometry(0.06, 0.2, 7), hairC, 0, -0.04, 0.07, Math.PI + 0.25, 0, 0); b.add(new THREE.BoxGeometry(0.08, 0.012, 0.02), hairC, 0, 0.062, 0.108); }
  if (look.arrows && !stoneAll) { b.add(new THREE.ConeGeometry(0.03, 0.06, 3), '#3aa0e0', 0, 0.19, 0.095, -1.4, 0, 0); b.add(new THREE.BoxGeometry(0.018, 0.012, 0.18), '#3aa0e0', 0, 0.215, 0.0, 0, 0, 0); }
  const headMesh = partMesh(b, mat); head.add(headMesh); J.headMesh = headMesh;
  // arms
  const sleeve = look.nation === 'air' ? c2 : c1; const cuff = look.nation === 'water' ? '#f2f2ea' : c3; const shX = (isB ? 0.17 : 0.2) * bw;
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const sh = new THREE.Group(); sh.position.set(sd * shX, 0.44, 0); spine.add(sh); J['sh' + side] = sh;
    b = new GeoBuilder(); b.add(new THREE.CapsuleGeometry(0.052 * bw, 0.2, 4, 8), C(sleeve), 0, -0.13, 0); sh.add(partMesh(b, mat));
    const el = new THREE.Group(); el.position.y = -0.27; sh.add(el); J['el' + side] = el;
    b = new GeoBuilder(); const foreC = (look.nation === 'fire' || look.nation === 'earth') ? sleeve : sleeve;
    b.add(new THREE.CapsuleGeometry(0.045 * bw, 0.18, 4, 8), C(foreC), 0, -0.11, 0);
    b.add(new THREE.CylinderGeometry(0.05 * bw, 0.05 * bw, 0.05, 8), C(cuff), 0, -0.2, 0);
    b.add(new THREE.SphereGeometry(0.045, 8, 6), skin, 0, -0.27, 0.005, 0, 0, 0, 0.8, 1.15, 0.6);
    b.add(new THREE.CapsuleGeometry(0.012, 0.04, 2, 4), skin, sd * -0.03, -0.25, 0.02, 0, 0, sd * 0.6);
    el.add(partMesh(b, mat));
    const hand = new THREE.Object3D(); hand.position.set(0, -0.28, 0.02); el.add(hand); J['hand' + side] = hand;
    // legs
    const hp = new THREE.Group(); hp.position.set(sd * 0.095 * bw * (isB ? 1.1 : 1), -0.03, 0); hips.add(hp); J['hip' + side] = hp;
    b = new GeoBuilder(); b.add(new THREE.CapsuleGeometry(0.068 * bw, 0.3, 4, 8), C(c2 === '#2a1a14' || c2 === '#3a2a22' || c2 === '#1e1410' ? c2 : (look.nation === 'water' ? '#1f3d66' : look.nation === 'air' ? c2 : '#cdbd90')), 0, -0.21, 0); hp.add(partMesh(b, mat));
    const kn = new THREE.Group(); kn.position.y = -0.43; hp.add(kn); J['kn' + side] = kn;
    b = new GeoBuilder();
    const pantC = look.nation === 'water' ? '#1f3d66' : look.nation === 'air' ? c2 : look.nation === 'fire' ? c2 : '#cdbd90';
    b.add(new THREE.CapsuleGeometry(0.055 * bw, 0.28, 4, 8), C(pantC), 0, -0.19, 0);
    const boot = look.nation === 'water' ? '#4a3424' : look.nation === 'fire' ? '#1a1210' : look.nation === 'air' ? '#8a5a2a' : '#5a3a22';
    b.add(new THREE.CylinderGeometry(0.062, 0.058, 0.16, 8), C(boot), 0, -0.33, 0);
    b.add(new THREE.BoxGeometry(0.1, 0.07, 0.22), C(boot), 0, -0.43, 0.045, 0, 0, 0, 1, 1, 1, { ao: 0.2 });
    if (look.nation === 'water') b.add(new THREE.TorusGeometry(0.06, 0.02, 5, 10), C('#f2f2ea'), 0, -0.26, 0, Math.PI / 2);
    kn.add(partMesh(b, mat));
  }
  const shadow = blobShadow(0.45); root.add(shadow); shadow.position.y = 0.03;
  root.scale.setScalar(look.height || 1);
  const H = { root, J, mat, look, shadow, phase: 0, action: null, actionT: 0, stance: 0, element: opts.element || look.nation, prev: {}, emissiveT: 0 };
  root.traverse(o => { if (o.isMesh && o !== shadow) o.castShadow = false; });
  return H;
}

/* ---------------- humanoid animation ---------------- */
const POSES = {
  // [shL, elL, shR, elR, hipL, knL, hipR, knR, spine, head, hipsY]  — each rotation [x,y,z]
};
const A = (o) => o;
const ACTIONS = {
  punchR: { dur: 0.42, keys: [[0, A({ shR: [-0.7, 0, -0.4], elR: [-1.9, 0, 0], shL: [-1.1, 0, 0.3], elL: [-1.6, 0, 0], spine: [0, 0.45, 0] })], [0.3, A({ shR: [-1.62, 0, 0.05], elR: [-0.05, 0, 0], shL: [-0.5, 0, 0.35], elL: [-2.0, 0, 0], spine: [0.08, -0.4, 0], hipL: [-0.45, 0, 0], knL: [0.35, 0, 0], hipR: [0.2, 0, 0] })], [1, null]] },
  punchL: { dur: 0.42, keys: [[0, A({ shL: [-0.7, 0, 0.4], elL: [-1.9, 0, 0], shR: [-1.1, 0, -0.3], elR: [-1.6, 0, 0], spine: [0, -0.45, 0] })], [0.3, A({ shL: [-1.62, 0, -0.05], elL: [-0.05, 0, 0], shR: [-0.5, 0, -0.35], elR: [-2.0, 0, 0], spine: [0.08, 0.4, 0], hipR: [-0.45, 0, 0], knR: [0.35, 0, 0], hipL: [0.2, 0, 0] })], [1, null]] },
  kick: { dur: 0.7, spin: Math.PI * 2, keys: [[0, A({ shL: [-0.3, 0, 1.2], shR: [-0.3, 0, -1.2], hipR: [-0.4, 0, -0.2], knR: [1.2, 0, 0], hipsY: -0.05 })], [0.45, A({ shL: [-0.2, 0, 1.45], shR: [-0.2, 0, -1.45], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipR: [-1.5, 0, -0.5], knR: [0.05, 0, 0], hipL: [0.1, 0, 0], knL: [0.25, 0, 0], spine: [-0.25, 0, 0.25] })], [1, null]] },
  breath: { dur: 1.3, keys: [[0, A({ spine: [-0.25, 0, 0], head: [-0.3, 0, 0], shL: [0.3, 0, 0.5], shR: [0.3, 0, -0.5], elL: [-1.4, 0, 0], elR: [-1.4, 0, 0] })], [0.25, A({ spine: [0.3, 0, 0], head: [0.15, 0, 0], shL: [0.55, 0, 0.35], shR: [0.55, 0, -0.35], elL: [-1.2, 0, 0], elR: [-1.2, 0, 0], hipL: [-0.4, 0, 0.15], knL: [0.4, 0, 0], hipR: [0.25, 0, -0.1], hipsY: -0.06 })], [0.85, A({ spine: [0.3, 0, 0], head: [0.15, 0, 0], shL: [0.55, 0, 0.35], shR: [0.55, 0, -0.35], elL: [-1.2, 0, 0], elR: [-1.2, 0, 0], hipL: [-0.4, 0, 0.15], knL: [0.4, 0, 0], hipR: [0.25, 0, -0.1], hipsY: -0.06 })], [1, null]] },
  earthLift: { dur: 0.75, keys: [[0, A({ hipsY: -0.12, hipL: [-0.4, 0, 0.35], hipR: [-0.4, 0, -0.35], knL: [0.8, 0, 0], knR: [0.8, 0, 0], shL: [-0.5, 0, 0.3], shR: [-0.5, 0, -0.3], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0], spine: [0.2, 0, 0] })],
    [0.35, A({ hipsY: -0.06, hipL: [-0.3, 0, 0.3], hipR: [-0.3, 0, -0.3], knL: [0.5, 0, 0], knR: [0.5, 0, 0], shL: [-1.7, 0, 0.3], shR: [-1.7, 0, -0.3], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0], spine: [-0.05, 0, 0] })],
    [0.6, A({ hipsY: -0.08, hipL: [-0.55, 0, 0.3], knL: [0.5, 0, 0], hipR: [0.3, 0, -0.3], shR: [-1.65, 0, 0], elR: [0, 0, 0], shL: [-0.6, 0, 0.5], elL: [-1.5, 0, 0], spine: [0.15, -0.4, 0] })], [1, null]] },
  stomp: { dur: 0.8, keys: [[0, A({ hipR: [-1.3, 0, -0.2], knR: [1.5, 0, 0], shL: [-2.4, 0, 0.5], shR: [-2.4, 0, -0.5], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], spine: [-0.1, 0, 0] })],
    [0.35, A({ hipR: [-1.4, 0, -0.25], knR: [1.6, 0, 0], shL: [-2.7, 0, 0.6], shR: [-2.7, 0, -0.6], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], spine: [-0.15, 0, 0] })],
    [0.5, A({ hipsY: -0.16, hipR: [-0.2, 0, -0.45], knR: [0.5, 0, 0], hipL: [-0.2, 0, 0.45], knL: [0.6, 0, 0], shL: [-1.3, 0, 0.3], shR: [-1.3, 0, -0.3], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], spine: [0.25, 0, 0] })],
    [0.8, A({ hipsY: -0.16, hipR: [-0.2, 0, -0.45], knR: [0.5, 0, 0], hipL: [-0.2, 0, 0.45], knL: [0.6, 0, 0], shL: [-1.3, 0, 0.3], shR: [-1.3, 0, -0.3], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], spine: [0.25, 0, 0] })], [1, null]] },
  whip: { dur: 0.6, keys: [[0, A({ shR: [-0.4, 0, -1.3], elR: [-0.8, 0, 0], shL: [-0.9, 0, 0.6], elL: [-1.0, 0, 0], spine: [0, 0.5, 0], hipsY: -0.04 })],
    [0.35, A({ shR: [-1.8, 0, 0.5], elR: [-0.25, 0, 0], shL: [-0.5, 0, 0.9], elL: [-0.6, 0, 0], spine: [0.05, -0.4, 0], hipL: [-0.4, 0, 0.1], knL: [0.3, 0, 0] })], [1, null]] },
  push: { dur: 0.6, keys: [[0, A({ shL: [-0.3, 0, 0.2], shR: [-0.3, 0, -0.2], elL: [-1.8, 0, 0], elR: [-1.8, 0, 0], hipsY: -0.08, knL: [0.4, 0, 0], knR: [0.4, 0, 0], spine: [-0.1, 0, 0] })],
    [0.35, A({ shL: [-1.55, 0, -0.15], shR: [-1.55, 0, 0.15], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], hipsY: -0.1, hipL: [-0.5, 0, 0.1], knL: [0.5, 0, 0], hipR: [0.3, 0, -0.1], spine: [0.15, 0, 0] })], [1, null]] },
  heal: { dur: 2.6, keys: [[0, A({ shL: [-1.1, 0, -0.35], shR: [-1.1, 0, 0.35], elL: [-1.5, 0, 0], elR: [-1.5, 0, 0], head: [0.35, 0, 0] })], [0.5, A({ shL: [-1.0, 0, -0.45], shR: [-1.0, 0, 0.45], elL: [-1.6, 0, 0], elR: [-1.6, 0, 0], head: [0.4, 0, 0], spine: [0.1, 0, 0] })], [0.9, A({ shL: [-1.1, 0, -0.35], shR: [-1.1, 0, 0.35], elL: [-1.5, 0, 0], elR: [-1.5, 0, 0], head: [0.35, 0, 0] })], [1, null]] },
  palm: { dur: 0.38, keys: [[0, A({ shR: [-0.7, 0, -0.3], elR: [-1.6, 0, 0], shL: [-1.0, 0, 0.4], elL: [-1.2, 0, 0], spine: [0, 0.35, 0] })], [0.3, A({ shR: [-1.55, 0, 0], elR: [0, 0, 0], shL: [-0.2, 0, 0.8], elL: [-0.4, 0, 0], spine: [0.05, -0.35, 0], hipL: [-0.4, 0, 0], knL: [0.25, 0, 0] })], [1, null]] },
  sweep: { dur: 0.7, spin: Math.PI * 0.5, keys: [[0, A({ shL: [-1.4, 0, 1.2], shR: [-1.4, 0, -0.3], elL: [-0.2, 0, 0], elR: [-1.2, 0, 0], spine: [0, 0.9, 0], hipsY: -0.08, knL: [0.4, 0, 0], knR: [0.4, 0, 0] })],
    [0.5, A({ shL: [-1.5, 0, -0.5], shR: [-1.5, 0, -1.3], elL: [-0.4, 0, 0], elR: [-0.1, 0, 0], spine: [0.1, -0.8, 0], hipsY: -0.1, hipL: [-0.5, 0, 0.2], knL: [0.5, 0, 0] })], [1, null]] },
  leap: { dur: 0.6, keys: [[0, A({ shL: [0.4, 0, 0.7], shR: [0.4, 0, -0.7], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipsY: -0.1, knL: [0.7, 0, 0], knR: [0.7, 0, 0], hipL: [-0.5, 0, 0], hipR: [-0.5, 0, 0] })], [0.4, A({ shL: [-2.6, 0, 0.5], shR: [-2.6, 0, -0.5], hipL: [-0.9, 0, 0], knL: [1.4, 0, 0], hipR: [-0.2, 0, 0], knR: [0.6, 0, 0] })], [1, null]] },
  dash: { dur: 0.35, keys: [[0, A({ spine: [0.5, 0, 0], shL: [0.9, 0, 0.3], shR: [0.9, 0, -0.3], hipL: [-0.8, 0, 0], knL: [1.0, 0, 0], hipR: [0.5, 0, 0], knR: [0.4, 0, 0] })], [0.7, A({ spine: [0.5, 0, 0], shL: [0.9, 0, 0.3], shR: [0.9, 0, -0.3], hipL: [-0.8, 0, 0], knL: [1.0, 0, 0], hipR: [0.5, 0, 0], knR: [0.4, 0, 0] })], [1, null]] },
  swirl: { dur: 0.9, spin: Math.PI * 2, keys: [[0, A({ shL: [-0.5, 0, 1.4], shR: [-0.5, 0, -1.4], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0] })], [0.5, A({ shL: [-2.2, 0, 1.0], shR: [-2.2, 0, -1.0], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], spine: [-0.1, 0, 0] })], [1, null]] },
  gather: { dur: 0.9, keys: [[0, A({ shR: [-2.4, 0, -0.2], elR: [-0.6, 0, 0], spine: [0.1, 0.2, 0] })], [0.4, A({ shR: [-0.9, 0, -0.1], elR: [-0.2, 0, 0], spine: [0.35, -0.1, 0], hipsY: -0.08, knL: [0.5, 0, 0], knR: [0.5, 0, 0] })], [0.6, A({ shR: [-2.2, 0, -0.2], elR: [-0.6, 0, 0], spine: [0.1, 0.2, 0] })], [0.85, A({ shR: [-0.9, 0, -0.1], spine: [0.35, -0.1, 0], hipsY: -0.08, knL: [0.5, 0, 0], knR: [0.5, 0, 0] })], [1, null]] },
  eat: { dur: 1.1, keys: [[0, A({ shR: [-1.0, 0, 0.3], elR: [-1.8, 0, 0] })], [0.3, A({ shR: [-1.25, 0, 0.55], elR: [-2.4, 0, 0], head: [0.1, 0, 0] })], [0.5, A({ shR: [-1.1, 0, 0.4], elR: [-2.1, 0, 0] })], [0.7, A({ shR: [-1.25, 0, 0.55], elR: [-2.4, 0, 0], head: [0.1, 0, 0] })], [1, null]] },
  hit: { dur: 0.35, keys: [[0, A({ spine: [-0.35, 0, 0.1], head: [-0.3, 0, 0], shL: [-0.4, 0, 0.6], shR: [-0.4, 0, -0.6] })], [1, null]] },
  swing: { dur: 0.7, keys: [[0, A({ shR: [-2.6, 0, -0.3], elR: [-0.8, 0, 0], spine: [-0.1, 0.4, 0] })], [0.45, A({ shR: [-0.9, 0, 0.5], elR: [-0.1, 0, 0], spine: [0.25, -0.5, 0], hipL: [-0.5, 0, 0], knL: [0.4, 0, 0] })], [1, null]] },
  bow: { dur: 1.6, keys: [[0, A({ spine: [0.5, 0, 0], head: [0.3, 0, 0], shL: [-1.2, 0, -0.5], shR: [-1.2, 0, 0.5], elL: [-1.6, 0, 0], elR: [-1.6, 0, 0] })], [0.7, A({ spine: [0.5, 0, 0], head: [0.3, 0, 0], shL: [-1.2, 0, -0.5], shR: [-1.2, 0, 0.5], elL: [-1.6, 0, 0], elR: [-1.6, 0, 0] })], [1, null]] },
  ceremony: { dur: 3.6, keys: [[0, A({ shL: [-1.2, 0, -0.4], shR: [-1.2, 0, 0.4], elL: [-1.6, 0, 0], elR: [-1.6, 0, 0], head: [0.4, 0, 0] })], [0.4, A({ shL: [-3.0, 0, 0.5], shR: [-3.0, 0, -0.5], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], head: [-0.4, 0, 0], spine: [-0.15, 0, 0] })], [0.8, A({ shL: [-3.0, 0, 0.5], shR: [-3.0, 0, -0.5], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], head: [-0.4, 0, 0], spine: [-0.15, 0, 0] })], [1, null]] },
};
const STANCE = {
  fire:  { shL: [-1.0, 0, 0.25], elL: [-1.6, 0, 0], shR: [-0.5, 0, -0.3], elR: [-1.9, 0, 0], hipL: [-0.3, 0, 0.12], knL: [0.3, 0, 0], hipR: [0.2, 0, -0.12], knR: [0.2, 0, 0], hipsY: -0.05, spine: [0.05, 0.2, 0] },
  earth: { shL: [-0.9, 0, 0.35], elL: [-1.2, 0, 0], shR: [-0.9, 0, -0.35], elR: [-1.2, 0, 0], hipL: [-0.15, 0, 0.4], knL: [0.55, 0, 0], hipR: [-0.15, 0, -0.4], knR: [0.55, 0, 0], hipsY: -0.11, spine: [0.08, 0, 0] },
  water: { shL: [-0.8, 0, 0.5], elL: [-0.7, 0, 0], shR: [-0.6, 0, -0.5], elR: [-0.9, 0, 0], hipL: [-0.25, 0, 0.15], knL: [0.35, 0, 0], hipR: [0.1, 0, -0.15], knR: [0.3, 0, 0], hipsY: -0.06, spine: [0, 0.15, 0] },
  air:   { shL: [-0.7, 0, 0.3], elL: [-1.3, 0, 0], shR: [-0.4, 0, -0.4], elR: [-1.0, 0, 0], hipL: [-0.15, 0, 0.05], knL: [0.2, 0, 0], hipR: [0.05, 0, -0.05], knR: [0.15, 0, 0], hipsY: -0.02, spine: [0, -0.15, 0] },
  none:  { shL: [-0.9, 0, 0.3], elL: [-1.5, 0, 0], shR: [-0.9, 0, -0.3], elR: [-1.5, 0, 0], hipL: [-0.25, 0, 0.15], knL: [0.35, 0, 0], hipR: [0.1, 0, -0.15], knR: [0.3, 0, 0], hipsY: -0.06, spine: [0.1, 0, 0] },
};
const MEDITATE = { hipsY: -0.6, hipL: [-1.45, 0.25, 0.85], hipR: [-1.45, -0.25, -0.85], knL: [2.55, 0, 0], knR: [2.55, 0, 0], shL: [-0.35, 0, 0.18], shR: [-0.35, 0, -0.18], elL: [-1.15, 0.0, 0], elR: [-1.15, 0, 0], spine: [-0.02, 0, 0], head: [0.08, 0, 0] };
const SWIM = { spine: [1.25, 0, 0], head: [-1.0, 0, 0], hipsY: 0 };
const JOINTS = ['shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR', 'spine', 'head'];
function samplePose(act, u) {
  const keys = act.keys; let i = 0; while (i < keys.length - 1 && u > keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[Math.min(i + 1, keys.length - 1)]; const span = (k1[0] - k0[0]) || 1; let t = U.clamp((u - k0[0]) / span, 0, 1); t = t * t * (3 - 2 * t);
  return { a: k0[1], b: k1[1], t };
}
function animateHumanoid(H, dt, st) {
  const J = H.J; H.phase += dt * (st.speed || 0) * 1.55;
  const sp = U.clamp((st.speed || 0) / 4.5, 0, 1.7); const run = U.clamp(((st.speed || 0) - 4.5) / 3, 0, 1);
  const ph = H.phase; const s = Math.sin(ph), c = Math.cos(ph);
  const amp = Math.min(sp, 1) * (0.55 + run * 0.35);
  // locomotion pose
  const L = {
    hipL: [-s * 0.75 * amp, 0, 0.02], hipR: [s * 0.75 * amp, 0, -0.02],
    knL: [Math.max(0, c) * 1.1 * amp + 0.05, 0, 0], knR: [Math.max(0, -c) * 1.1 * amp + 0.05, 0, 0],
    shL: [s * 0.65 * amp, 0, 0.08 + run * 0.05], shR: [-s * 0.65 * amp, 0, -0.08 - run * 0.05],
    elL: [-0.25 - run * 0.9 - amp * 0.2, 0, 0], elR: [-0.25 - run * 0.9 - amp * 0.2, 0, 0],
    spine: [0.04 + run * 0.18, s * 0.08 * amp, 0], head: [-run * 0.1, 0, 0], hipsY: Math.abs(c) * 0.045 * amp - run * 0.02,
  };
  // idle breathing + combat stance
  const breath = Math.sin(performance.now() * 0.0018 * (st.id ? 1 : 1)) * 0.012;
  H.stance = U.damp(H.stance, (st.combat && sp < 1.2) ? 1 : 0, 6, dt);
  const ST = STANCE[st.element] || STANCE.none;
  for (const j of JOINTS.concat(['hipsY'])) {
    const lv = L[j]; const sv = ST[j];
    if (j === 'hipsY') { L.hipsY = U.lerp(L.hipsY, sv || 0, H.stance * (1 - sp * 0.6)); continue; }
    if (sv) for (let k = 0; k < 3; k++) lv[k] = U.lerp(lv[k], sv[k], H.stance * (1 - Math.min(sp, 1) * 0.55));
  }
  if (sp < 0.05) { L.shL[2] += 0.04 + breath; L.shR[2] -= 0.04 + breath; L.spine[0] += breath; }
  // airborne
  if (!st.grounded && !st.swim) { const up = U.clamp((st.vy || 0) / 8, -1, 1); L.hipL = [-0.6, 0, 0.1]; L.knL = [0.9, 0, 0]; L.hipR = [0.1, 0, -0.1]; L.knR = [0.4 + up * 0.2, 0, 0]; L.shL = [-0.3 - up * 0.6, 0, 0.6]; L.shR = [-0.3 - up * 0.6, 0, -0.6]; L.hipsY = 0; }
  if (st.swim) { const ss = Math.sin(performance.now() * 0.006); Object.assign(L, { spine: [1.2, 0, 0], head: [-1.0, 0, 0], shL: [-2.4 + ss * 0.8, 0, 0.4], shR: [-2.4 - ss * 0.8, 0, -0.4], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], hipL: [ss * 0.4, 0, 0], hipR: [-ss * 0.4, 0, 0], knL: [0.3, 0, 0], knR: [0.3, 0, 0], hipsY: 0.0 }); }
  if (st.meditate) { const m = MEDITATE; for (const j of JOINTS) if (m[j]) L[j] = m[j].slice(); L.hipsY = m.hipsY; L.spine[0] += breath * 2; }
  if (st.sleep) { for (const j of JOINTS) L[j] = [0, 0, 0]; L.shL = [0, 0, 0.1]; L.shR = [0, 0, -0.1]; L.knL = [0.3, 0, 0]; L.hipL = [-0.3, 0, 0]; L.hipsY = 0; }
  // action overlay
  let spin = 0;
  if (H.action) {
    H.actionT += dt; const act = H.action; const u = H.actionT / (act.dur * (H.actionSpeed || 1));
    if (u >= 1) { H.action = null; }
    else {
      const { a, b, t } = samplePose(act, u); const fade = Math.min(1, u / 0.06, (1 - u) / 0.12);
      for (const j of JOINTS) {
        const va = a && a[j], vb = b && b[j]; if (!va && !vb) continue;
        const from = va || L[j], to = vb || L[j]; const tgt = [U.lerp(from[0], to[0], t), U.lerp(from[1], to[1], t), U.lerp(from[2], to[2], t)];
        for (let k = 0; k < 3; k++) L[j][k] = U.lerp(L[j][k], tgt[k], fade);
      }
      const ya = (a && a.hipsY !== undefined) ? a.hipsY : L.hipsY, yb = (b && b.hipsY !== undefined) ? b.hipsY : L.hipsY; L.hipsY = U.lerp(L.hipsY, U.lerp(ya, yb, t), fade);
      if (act.spin) spin = act.spin * U.smooth(0.05, 0.75, u);
    }
  }
  // apply with smoothing (critically damped towards targets)
  const k = 22;
  for (const j of JOINTS) { const o = J[j]; const v = L[j]; o.rotation.x = U.damp(o.rotation.x, v[0], k, dt); o.rotation.y = U.damp(o.rotation.y, v[1], k, dt); o.rotation.z = U.damp(o.rotation.z, v[2], k, dt); }
  // KO / sleep: lie down on the back
  const fall = (st.dead || st.sleep) ? 1 : 0; H.fall = U.damp(H.fall || 0, fall, 4, dt);
  J.hips.position.y = U.damp(J.hips.position.y, 0.92 + L.hipsY - H.fall * 0.74, k, dt);
  J.hips.position.z = -H.fall * 0.2; J.hips.rotation.x = -H.fall * 1.5;
  J.hips.rotation.y = spin;
  if (J.skirt) J.skirt.rotation.x = (J.hipL.rotation.x + J.hipR.rotation.x) * 0.25;
  // hit flash
  if (H.emissiveT > 0) { H.emissiveT -= dt; H.mat.emissive.setRGB(0.9, 0.25, 0.1).multiplyScalar(Math.max(0, H.emissiveT / 0.18)); } else H.mat.emissive.setRGB(st.glow || 0, (st.glow || 0) * 0.8, (st.glow || 0) * 0.5);
}
function playAction(H, name, speed = 1) { if (!ACTIONS[name]) return; H.action = ACTIONS[name]; H.actionT = 0; H.actionSpeed = speed; }

/* ---------------- creatures ---------------- */
function leg(b2mat, color, len, thick, foot, footColor) {
  const g = new THREE.Group(); const b = new GeoBuilder();
  b.add(new THREE.CapsuleGeometry(thick, len, 3, 6), color, 0, -len / 2, 0, 0, 0, 0, 1, 1, 1, { ao: 0.3 });
  if (foot) b.add(new THREE.SphereGeometry(thick * 1.2, 6, 5), footColor || color, 0, -len - thick * 0.4, thick * 0.4, 0, 0, 0, 1, 0.6, 1.5);
  g.add(new THREE.Mesh(b.build(), b2mat)); return g;
}
function buildCreature(species) {
  const mat = charMat(); const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const C = { root, body, mat, legs: [], species, head: null, tail: null, wings: [], phase: Math.random() * 10, emissiveT: 0, extra: [] };
  let b = new GeoBuilder(); let shadowR = 0.6;
  const addLeg = (x, y, z, len, thick, off, color, foot, footColor) => { const l = leg(mat, color, len, thick, foot, footColor); l.position.set(x, y, z); body.add(l); C.legs.push({ g: l, off }); return l; };
  const headGroup = (x, y, z) => { const h = new THREE.Group(); h.position.set(x, y, z); body.add(h); C.head = h; return h; };
  const tailGroup = (x, y, z) => { const t = new THREE.Group(); t.position.set(x, y, z); body.add(t); C.tail = t; return t; };
  const meshTo = (grp, bb) => { grp.add(new THREE.Mesh(bb.build(), mat)); };
  switch (species) {
    case 'turtleduck': {
      b.add(new THREE.SphereGeometry(0.2, 10, 8), '#d4a84a', 0, 0.18, 0, 0, 0, 0, 1, 0.8, 1.3, { ao: 0.3 });
      b.add(new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#4f7a3a', 0, 0.2, -0.02, 0, 0, 0, 1.05, 0.9, 1.25, { topTint: hexc('#7aa64a') });
      for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 6), '#3a5a2a', Math.cos(i * 1.25) * 0.11, 0.37, -0.02 + Math.sin(i * 1.25) * 0.12);
      meshTo(body, b);
      const h = headGroup(0, 0.3, 0.22); b = new GeoBuilder(); b.add(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 6), '#d4a84a', 0, 0.02, 0, 0.3, 0, 0); b.add(new THREE.SphereGeometry(0.08, 8, 6), '#d4a84a', 0, 0.12, 0.03); b.add(new THREE.ConeGeometry(0.035, 0.1, 6), '#f08a2a', 0, 0.11, 0.13, Math.PI / 2, 0, 0, 1.4, 1, 0.6);
      for (const sd of [-1, 1]) b.add(new THREE.SphereGeometry(0.014, 5, 4), '#111', sd * 0.045, 0.14, 0.08); meshTo(h, b);
      addLeg(0.08, 0.1, 0.0, 0.06, 0.025, 0, '#f08a2a', true); addLeg(-0.08, 0.1, 0.0, 0.06, 0.025, Math.PI, '#f08a2a', true);
      const t = tailGroup(0, 0.2, -0.26); b = new GeoBuilder(); b.add(new THREE.ConeGeometry(0.06, 0.14, 5), '#c99a3a', 0, 0, -0.05, -Math.PI / 2 - 0.4, 0, 0); meshTo(t, b);
      shadowR = 0.35; break;
    }
    case 'rabbaroo': {
      b.add(new THREE.SphereGeometry(0.28, 12, 10), '#c8a878', 0, 0.62, -0.05, -0.5, 0, 0, 0.9, 1.25, 1.0, { ao: 0.3 });
      b.add(new THREE.SphereGeometry(0.18, 10, 8), '#efe2c8', 0, 0.62, 0.12, -0.5, 0, 0, 0.8, 1.1, 0.6);
      meshTo(body, b);
      const h = headGroup(0, 0.95, 0.12); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.15, 10, 8), '#c8a878', 0, 0, 0.04, 0, 0, 0, 0.95, 0.9, 1.15); b.add(new THREE.SphereGeometry(0.05, 6, 5), '#e8a0a0', 0, -0.01, 0.2);
      for (const sd of [-1, 1]) { b.add(new THREE.CapsuleGeometry(0.045, 0.32, 3, 6), '#c8a878', sd * 0.07, 0.24, -0.04, -0.25, 0, sd * -0.2, 1, 1, 0.5); b.add(new THREE.CapsuleGeometry(0.025, 0.26, 3, 6), '#e8b0b0', sd * 0.07, 0.24, -0.02, -0.25, 0, sd * -0.2, 1, 1, 0.3);
        b.add(new THREE.SphereGeometry(0.028, 6, 5), '#1a120c', sd * 0.075, 0.04, 0.14); } meshTo(h, b);
      const thigh = (sd) => { const g = new THREE.Group(); g.position.set(sd * 0.17, 0.48, -0.12); body.add(g); const bb = new GeoBuilder(); bb.add(new THREE.SphereGeometry(0.16, 8, 6), '#bf9e6e', 0, -0.05, 0.02, 0, 0, 0, 0.7, 1.1, 1.3); bb.add(new THREE.CapsuleGeometry(0.05, 0.3, 3, 6), '#bf9e6e', 0, -0.28, -0.05, 0.4, 0, 0); bb.add(new THREE.BoxGeometry(0.09, 0.05, 0.36), '#a88a5e', 0, -0.46, 0.08); g.add(new THREE.Mesh(bb.build(), mat)); C.legs.push({ g, off: 0, hind: true }); };
      thigh(1); thigh(-1); addLeg(0.1, 0.62, 0.2, 0.18, 0.03, 0.4, '#c8a878', true); addLeg(-0.1, 0.62, 0.2, 0.18, 0.03, 0.4, '#c8a878', true);
      const t = tailGroup(0, 0.42, -0.3); b = new GeoBuilder(); b.add(new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), '#bf9e6e', 0, -0.05, -0.25, -1.2, 0, 0); b.add(new THREE.SphereGeometry(0.09, 6, 5), '#f6efe0', 0, 0.12, -0.04); meshTo(t, b);
      shadowR = 0.5; C.gait = 'hop'; break;
    }
    case 'possumchicken': {
      b.add(new THREE.SphereGeometry(0.22, 10, 8), '#d8d0c8', 0, 0.42, 0, 0.2, 0, 0, 0.9, 0.95, 1.25, { ao: 0.35, topTint: hexc('#efe8e0') });
      for (const sd of [-1, 1]) b.add(new THREE.SphereGeometry(0.14, 8, 6), '#bfb6aa', sd * 0.18, 0.44, -0.02, 0, 0, sd * 0.2, 0.35, 0.7, 1.1);
      meshTo(body, b);
      const h = headGroup(0, 0.62, 0.22); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.11, 8, 6), '#9a948a', 0, 0.02, 0.02, 0, 0, 0, 0.9, 0.9, 1.2); b.add(new THREE.ConeGeometry(0.04, 0.12, 6), '#e8a0a0', 0, 0.0, 0.15, Math.PI / 2, 0, 0);
      b.add(new THREE.BoxGeometry(0.03, 0.08, 0.12), '#d0302a', 0, 0.12, 0.02); for (const sd of [-1, 1]) { b.add(new THREE.SphereGeometry(0.04, 6, 5), '#c8b8b0', sd * 0.08, 0.1, -0.03, 0, 0, 0, 1, 1, 0.4); b.add(new THREE.SphereGeometry(0.018, 5, 4), '#111', sd * 0.05, 0.05, 0.1); } meshTo(h, b);
      addLeg(0.08, 0.26, 0.0, 0.18, 0.025, 0, '#e8b840', true); addLeg(-0.08, 0.26, 0.0, 0.18, 0.025, Math.PI, '#e8b840', true);
      const t = tailGroup(0, 0.38, -0.25); b = new GeoBuilder(); for (let i = 0; i < 6; i++) b.add(new THREE.SphereGeometry(0.035 - i * 0.004, 6, 4), '#e8b0b0', 0, -i * 0.04, -i * 0.07 + Math.sin(i) * 0.02); meshTo(t, b);
      shadowR = 0.35; break;
    }
    case 'hogmonkey': {
      b.add(new THREE.SphereGeometry(0.38, 12, 10), '#c99a8a', 0, 0.62, 0, 0, 0, 0, 0.9, 0.85, 1.3, { ao: 0.35 });
      b.add(new THREE.SphereGeometry(0.2, 8, 6), '#7a5a4a', 0, 0.85, -0.05, 0, 0, 0, 1.3, 0.5, 1.6);
      meshTo(body, b);
      const h = headGroup(0, 0.8, 0.45); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.2, 10, 8), '#c99a8a', 0, 0, 0.02); b.add(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 10), '#e8b0a0', 0, -0.03, 0.2, Math.PI / 2, 0, 0);
      for (const sd of [-1, 1]) { b.add(new THREE.SphereGeometry(0.02, 5, 4), '#5a2a2a', sd * 0.035, -0.03, 0.26); b.add(new THREE.ConeGeometry(0.07, 0.14, 4), '#b88a7a', sd * 0.13, 0.17, -0.02, 0, 0, sd * -0.4); b.add(new THREE.SphereGeometry(0.025, 5, 4), '#111', sd * 0.08, 0.07, 0.16); }
      b.add(new THREE.SphereGeometry(0.13, 8, 6), '#7a5a4a', 0, 0.12, -0.05, 0, 0, 0, 1.2, 0.5, 1); meshTo(h, b);
      addLeg(0.2, 0.62, 0.32, 0.52, 0.07, 0, '#7a5a4a', true, '#3a2a22'); addLeg(-0.2, 0.62, 0.32, 0.52, 0.07, Math.PI, '#7a5a4a', true, '#3a2a22');
      addLeg(0.2, 0.5, -0.3, 0.36, 0.08, Math.PI, '#c99a8a', true, '#3a2a22'); addLeg(-0.2, 0.5, -0.3, 0.36, 0.08, 0, '#c99a8a', true, '#3a2a22');
      const t = tailGroup(0, 0.72, -0.48); b = new GeoBuilder(); b.add(new THREE.TorusGeometry(0.06, 0.018, 5, 10, Math.PI * 1.6), '#c99a8a', 0, 0.04, -0.04, 0, Math.PI / 2, 0); meshTo(t, b);
      shadowR = 0.7; break;
    }
    case 'ostrichhorse': {
      b.add(new THREE.SphereGeometry(0.5, 12, 10), '#8a6a4a', 0, 1.45, 0, 0, 0, 0, 0.8, 0.75, 1.25, { ao: 0.3, topTint: hexc('#a8845a') });
      b.add(new THREE.SphereGeometry(0.35, 10, 8), '#f2ead8', 0, 1.25, 0.15, 0, 0, 0, 0.85, 0.6, 1.1);
      for (const sd of [-1, 1]) b.add(new THREE.SphereGeometry(0.3, 8, 6), '#6e5238', sd * 0.36, 1.5, -0.05, 0, 0, sd * 0.3, 0.3, 0.6, 1.1);
      meshTo(body, b);
      const h = headGroup(0, 1.65, 0.5); b = new GeoBuilder(); b.add(new THREE.CapsuleGeometry(0.09, 0.8, 4, 8), '#c8b08a', 0, 0.45, 0.12, 0.3, 0, 0);
      b.add(new THREE.SphereGeometry(0.15, 8, 6), '#8a6a4a', 0, 0.95, 0.3, 0.3, 0, 0, 0.8, 0.9, 1.6); b.add(new THREE.BoxGeometry(0.05, 0.6, 0.12), '#2a1a12', 0, 0.55, 0.02, 0.3, 0, 0);
      for (const sd of [-1, 1]) { b.add(new THREE.ConeGeometry(0.04, 0.14, 4), '#6e5238', sd * 0.06, 1.1, 0.2); b.add(new THREE.SphereGeometry(0.025, 5, 4), '#111', sd * 0.08, 0.98, 0.4); } meshTo(h, b);
      addLeg(0.16, 1.2, 0, 1.0, 0.06, 0, '#c8b08a', true, '#5a4a3a'); addLeg(-0.16, 1.2, 0, 1.0, 0.06, Math.PI, '#c8b08a', true, '#5a4a3a');
      const t = tailGroup(0, 1.5, -0.6); b = new GeoBuilder(); for (let i = 0; i < 4; i++) b.add(new THREE.ConeGeometry(0.08, 0.6, 5), i % 2 ? '#2a1a12' : '#f2ead8', (i - 1.5) * 0.07, 0.1, -0.2, -2.3, 0, (i - 1.5) * 0.2); meshTo(t, b);
      shadowR = 0.9; C.gait = 'biped'; break;
    }
    case 'platypusbear': {
      b.add(new THREE.SphereGeometry(0.7, 14, 10), '#5a3a24', 0, 1.0, 0, 0, 0, 0, 1.0, 0.95, 1.45, { ao: 0.35, topTint: hexc('#6e4a30') });
      b.add(new THREE.SphereGeometry(0.5, 10, 8), '#4a2e1c', 0, 1.2, 0.55, 0, 0, 0, 1.1, 1.0, 0.8);
      meshTo(body, b);
      const h = headGroup(0, 1.35, 0.95); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.36, 12, 10), '#5a3a24', 0, 0, 0); b.add(new THREE.BoxGeometry(0.42, 0.1, 0.5), '#e0a02a', 0, -0.08, 0.42, 0.12, 0, 0, 1, 1, 1, { topTint: hexc('#f2c060') });
      b.add(new THREE.BoxGeometry(0.4, 0.06, 0.45), '#c88a1a', 0, -0.16, 0.38, 0.2, 0, 0);
      for (const sd of [-1, 1]) { b.add(new THREE.SphereGeometry(0.09, 6, 5), '#4a2e1c', sd * 0.25, 0.28, -0.05); b.add(new THREE.SphereGeometry(0.04, 6, 5), '#111', sd * 0.16, 0.1, 0.3); } meshTo(h, b);
      for (const [x, z, o] of [[0.38, 0.6, 0], [-0.38, 0.6, Math.PI], [0.38, -0.6, Math.PI], [-0.38, -0.6, 0]]) addLeg(x, 0.75, z, 0.5, 0.17, o, '#4a2e1c', true, '#e0a02a');
      const t = tailGroup(0, 0.95, -1.0); b = new GeoBuilder(); b.add(new THREE.BoxGeometry(0.55, 0.08, 0.8), '#3a2a1a', 0, 0, -0.35, 0, 0, 0, 1, 1, 1); b.add(new THREE.SphereGeometry(0.3, 8, 4), '#3a2a1a', 0, 0, -0.7, 0, 0, 0, 1, 0.25, 0.8); meshTo(t, b);
      shadowR = 1.4; C.rear = true; break;
    }
    case 'mooselion': {
      b.add(new THREE.SphereGeometry(0.55, 14, 10), '#c8902a', 0, 1.05, -0.1, 0, 0, 0, 0.85, 0.85, 1.55, { ao: 0.3, topTint: hexc('#dca84a') });
      b.add(new THREE.SphereGeometry(0.4, 10, 8), '#f0d8a0', 0, 0.85, 0.1, 0, 0, 0, 0.9, 0.5, 1.4);
      meshTo(body, b);
      const h = headGroup(0, 1.45, 0.75); b = new GeoBuilder();
      b.add(new THREE.SphereGeometry(0.55, 12, 10), '#5a3014', 0, -0.05, -0.15, 0, 0, 0, 1.15, 1.1, 0.75, { jitter: 0.15, seed: 3 });
      b.add(new THREE.SphereGeometry(0.3, 10, 8), '#c8902a', 0, 0, 0.18, 0, 0, 0, 0.9, 0.95, 1.15); b.add(new THREE.SphereGeometry(0.14, 8, 6), '#e8c890', 0, -0.1, 0.42, 0, 0, 0, 1.1, 0.8, 1);
      b.add(new THREE.SphereGeometry(0.05, 6, 4), '#2a1a12', 0, -0.03, 0.52);
      for (const sd of [-1, 1]) { b.add(new THREE.ConeGeometry(0.035, 0.32, 5), '#f6f0e0', sd * 0.08, -0.32, 0.4, Math.PI - 0.1, 0, 0); b.add(new THREE.SphereGeometry(0.045, 6, 5), '#ffd040', sd * 0.13, 0.08, 0.38);
        // antlers: palmate moose crowns
        b.add(new THREE.CylinderGeometry(0.045, 0.06, 0.55, 6), '#e8d8b0', sd * 0.3, 0.6, -0.05, 0, 0, sd * -0.75);
        b.add(new THREE.BoxGeometry(0.62, 0.06, 0.42), '#efe2c0', sd * 0.68, 0.86, -0.08, 0.15, 0, sd * 0.42, 1, 1, 1, { topTint: hexc('#fff6e0') });
        for (let k = 0; k < 5; k++) b.add(new THREE.ConeGeometry(0.035, 0.26, 4), '#efe2c0', sd * (0.48 + k * 0.1), 1.0 + k * 0.045, -0.2 + (k % 2) * 0.18, 0, 0, sd * -0.25); }
      meshTo(h, b);
      for (const [x, z, o] of [[0.25, 0.55, 0], [-0.25, 0.55, Math.PI], [0.25, -0.8, Math.PI], [-0.25, -0.8, 0]]) addLeg(x, 0.85, z, 0.62, 0.12, o, '#b8801f', true, '#8a5a1a');
      const t = tailGroup(0, 1.15, -0.95); b = new GeoBuilder(); b.add(new THREE.CapsuleGeometry(0.04, 0.8, 3, 6), '#c8902a', 0, -0.2, -0.3, -0.9, 0, 0); b.add(new THREE.SphereGeometry(0.09, 6, 5), '#5a3014', 0, -0.48, -0.55); meshTo(t, b);
      shadowR = 1.3; break;
    }
    case 'crawler': {
      for (let i = 0; i < 3; i++) b.add(new THREE.SphereGeometry(0.42 - i * 0.04, 10, 8), i % 2 ? '#4a4038' : '#564a40', 0, 0.55, 0.5 - i * 0.62, 0, 0, 0, 1.05, 0.62, 0.85, { ao: 0.35 });
      for (let i = 0; i < 7; i++) b.add(new THREE.ConeGeometry(0.07, 0.32, 5), '#c0502a', 0, 0.85, 0.75 - i * 0.28, -0.4, 0, 0);
      meshTo(body, b);
      const h = headGroup(0, 0.6, 0.95); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.3, 10, 8), '#564a40', 0, 0, 0.12, 0, 0, 0, 1, 0.65, 1.3);
      b.add(new THREE.BoxGeometry(0.38, 0.08, 0.4), '#3a322a', 0, -0.12, 0.38, 0.15, 0, 0); for (const sd of [-1, 1]) { b.add(new THREE.SphereGeometry(0.05, 6, 5), '#ff3a1a', sd * 0.15, 0.1, 0.32); b.add(new THREE.ConeGeometry(0.03, 0.12, 4), '#e8e0d0', sd * 0.1, -0.17, 0.52, Math.PI, 0, 0); }
      meshTo(h, b); C.eyes = true;
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const l = addLeg(sd * 0.42, 0.55, 0.55 - i * 0.62, 0.55, 0.06, (i % 2 ? Math.PI : 0) + (sd > 0 ? 0 : Math.PI), '#3a322a', true, '#2a2420'); l.rotation.z = sd * 0.9; l.userData.splay = sd * 0.9; }
      const t = tailGroup(0, 0.5, -0.85); b = new GeoBuilder(); for (let i = 0; i < 5; i++) b.add(new THREE.SphereGeometry(0.16 - i * 0.025, 6, 5), '#4a4038', 0, -i * 0.03, -i * 0.25); meshTo(t, b);
      shadowR = 1.1; break;
    }
    case 'skybison': {
      const fur = '#f4f0e6';
      b.add(new THREE.SphereGeometry(1.6, 16, 12), fur, 0, 2.2, 0, 0, 0, 0, 1.15, 0.8, 1.6, { ao: 0.3, jitter: 0.08, seed: 9 });
      for (let i = 0; i < 6; i++) b.add(new THREE.SphereGeometry(0.7, 8, 6), '#ece6d8', Math.cos(i) * 1.2, 2.4 + Math.sin(i * 2) * 0.3, -1.2 + i * 0.5, 0, 0, 0, 1, 0.8, 1, { jitter: 0.15, seed: i });
      // the brown arrow continues down the bison's back to its tail
      for (let k = -4; k <= 3; k++) { const z = k * 0.5; const y = 2.2 + 1.28 * Math.sqrt(Math.max(0, 1 - (z / 2.56) ** 2)); const sl = -z / 2.56 * 0.6; b.add(new THREE.BoxGeometry(0.46 - Math.abs(k) * 0.02, 0.12, 0.56), '#6a4a2a', 0, y, z, sl, 0, 0); }
      meshTo(body, b);
      const h = headGroup(0, 2.4, 2.4); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.95, 14, 10), fur, 0, 0, 0, 0, 0, 0, 1.05, 0.9, 0.9);
      b.add(new THREE.SphereGeometry(0.5, 10, 8), '#e8dcc8', 0, -0.35, 0.6, 0, 0, 0, 1.2, 0.7, 0.7); b.add(new THREE.SphereGeometry(0.06, 6, 4), '#3a2a1a', 0.18, -0.3, 0.95); b.add(new THREE.SphereGeometry(0.06, 6, 4), '#3a2a1a', -0.18, -0.3, 0.95);
      // the brown arrow
      b.add(new THREE.BoxGeometry(0.42, 0.1, 1.6), '#6a4a2a', 0, 0.84, -0.3, 0.22, 0, 0); b.add(new THREE.ConeGeometry(0.62, 0.75, 3), '#6a4a2a', 0, 0.72, 0.62, Math.PI / 2 + 0.55, 0, 0, 1, 1, 0.22);
      for (const sd of [-1, 1]) { b.add(new THREE.ConeGeometry(0.12, 0.7, 6), '#c8b890', sd * 0.75, 0.55, -0.1, 0, 0, sd * -1.1); b.add(new THREE.SphereGeometry(0.07, 6, 5), '#111', sd * 0.5, 0.05, 0.75); }
      meshTo(h, b);
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) addLeg(sd * 1.1, 1.3, 1.2 - i * 1.2, 0.6, 0.28, i % 2 ? 0 : Math.PI, '#e8e0d0', true, '#8a7a6a');
      const t = tailGroup(0, 2.3, -2.4); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(1, 10, 6), '#ece6d8', 0, 0, -0.9, 0, 0, 0, 1.4, 0.18, 1.0); b.add(new THREE.BoxGeometry(1.5, 0.12, 0.4), '#6a4a2a', 0, 0.12, -0.9); meshTo(t, b);
      shadowR = 3.4; C.fly = true; break;
    }
    case 'badgermole': {
      b.add(new THREE.SphereGeometry(1.5, 14, 10), '#4a3424', 0, 1.2, 0, 0, 0, 0, 1.1, 0.75, 1.6, { ao: 0.4, topTint: hexc('#5e4430') });
      meshTo(body, b);
      const h = headGroup(0, 1.2, 2.1); b = new GeoBuilder(); b.add(new THREE.SphereGeometry(0.8, 12, 10), '#4a3424', 0, 0, 0, 0, 0, 0, 1, 0.8, 1.2);
      b.add(new THREE.BoxGeometry(0.25, 0.1, 1.6), '#f2ece0', 0, 0.62, 0.1, 0.25, 0, 0); for (const sd of [-1, 1]) b.add(new THREE.BoxGeometry(0.18, 0.08, 1.2), '#f2ece0', sd * 0.45, 0.48, 0.15, 0.2, 0, sd * 0.4);
      b.add(new THREE.SphereGeometry(0.18, 8, 6), '#d89a9a', 0, -0.15, 0.95); for (const sd of [-1, 1]) b.add(new THREE.BoxGeometry(0.14, 0.02, 0.04), '#1a120c', sd * 0.32, 0.18, 0.86, 0, 0, sd * 0.2);
      meshTo(h, b);
      for (const sd of [-1, 1]) { const cl = new THREE.Group(); cl.position.set(sd * 1.1, 0.7, 1.4); body.add(cl); const bb = new GeoBuilder(); bb.add(new THREE.CapsuleGeometry(0.3, 0.6, 4, 8), '#3a2a1c', 0, -0.2, 0.2, 0.9, 0, 0);
        for (let k = 0; k < 4; k++) bb.add(new THREE.ConeGeometry(0.08, 0.6, 5), '#d8d0c0', (k - 1.5) * 0.14, -0.55, 0.65, Math.PI / 2 + 0.5, 0, 0); cl.add(new THREE.Mesh(bb.build(), mat)); C.legs.push({ g: cl, off: sd > 0 ? 0 : Math.PI, claw: true }); }
      for (const sd of [-1, 1]) addLeg(sd * 1.0, 0.8, -1.4, 0.4, 0.28, sd > 0 ? Math.PI : 0, '#3a2a1c', true);
      shadowR = 2.8; break;
    }
  }
  const sh = blobShadow(shadowR); root.add(sh); C.shadow = sh;
  return C;
}
function animateCreature(C, dt, st) {
  const sp = st.speed || 0; C.phase += dt * (C.gait === 'hop' ? 1.6 : 1.0) * (2 + sp * 1.4);
  const ph = C.phase; const amp = U.clamp(sp / 3, 0, 1);
  if (C.fly) {
    // gentle swimming-through-air motion
    C.body.position.y = Math.sin(ph * 0.3) * 0.25; C.body.rotation.x = Math.sin(ph * 0.3 + 1) * 0.04;
    if (C.tail) C.tail.rotation.x = Math.sin(ph * 0.6) * 0.35;
    for (const l of C.legs) l.g.rotation.x = -0.9 + Math.sin(ph * 0.4 + l.off) * 0.15;
    if (C.head) C.head.rotation.x = Math.sin(ph * 0.25) * 0.08;
  } else if (C.gait === 'hop') {
    const hop = Math.max(0, Math.sin(ph)) * amp; C.body.position.y = hop * 0.45; C.body.rotation.x = -hop * 0.25 + (1 - amp) * 0.05;
    for (const l of C.legs) l.g.rotation.x = l.hind ? (-Math.cos(ph) * 0.8 * amp) : (0.6 * amp - 0.2);
    if (C.tail) C.tail.rotation.x = Math.sin(ph) * 0.3 * amp;
    if (C.head) C.head.rotation.x = st.graze ? 0.8 : Math.sin(ph * 2) * 0.05;
  } else {
    const bob = Math.abs(Math.sin(ph)) * 0.05 * amp * (C.species === 'skybison' ? 3 : 1); C.body.position.y = bob;
    for (const l of C.legs) { l.g.rotation.x = Math.sin(ph + l.off) * 0.65 * amp * (l.claw ? 0.5 : 1); if (l.g.userData.splay) l.g.rotation.z = l.g.userData.splay + Math.cos(ph + l.off) * 0.2 * amp; }
    if (C.tail) { C.tail.rotation.y = Math.sin(ph * 0.8) * 0.35; C.tail.rotation.x = st.alert ? -0.3 : 0; }
    if (C.head) { const graze = st.graze ? 1 : 0; C.headGraze = U.damp(C.headGraze || 0, graze, 4, dt); C.head.rotation.x = C.headGraze * 0.75 + Math.sin(ph * 2) * 0.04 * amp; C.head.rotation.y = st.look || 0; }
    if (C.species === 'turtleduck') C.body.rotation.z = Math.sin(ph * 2) * 0.12 * amp;
  }
  // rear up (platypus-bear roar / attack)
  C.rearT = U.damp(C.rearT || 0, st.rear ? 1 : 0, 7, dt); if (C.rear || st.rear) { C.body.rotation.x = -C.rearT * 0.7; C.body.position.y += C.rearT * 0.5; }
  // lunge
  if (st.lunge) C.body.position.z = Math.sin(U.clamp(st.lunge, 0, 1) * Math.PI) * 0.6; else C.body.position.z = 0;
  // death roll
  C.fallT = U.damp(C.fallT || 0, st.dead ? 1 : 0, 5, dt); C.root.rotation.z = C.fallT * 1.5; if (C.shadow) C.shadow.material.opacity = 1 - C.fallT * 0.5;
  if (C.emissiveT > 0) { C.emissiveT -= dt; C.mat.emissive.setRGB(0.9, 0.25, 0.1).multiplyScalar(Math.max(0, C.emissiveT / 0.18)); } else if (C.eyes && st.alert) C.mat.emissive.setRGB(0.05, 0.0, 0.0); else C.mat.emissive.setRGB(st.frozen ? 0.15 : 0, st.frozen ? 0.3 : 0, st.frozen ? 0.45 : 0);
}
