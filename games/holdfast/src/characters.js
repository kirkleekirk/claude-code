// Character models: loads the provided GLB figures (static meshes), works out
// their pose (A- or T-pose), fits a skeleton, skins them with smooth weights
// and dresses them via per-vertex region ids + a palette uniform. Animation
// is procedural (idle, walk, run, swing, zombie shamble, death).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const REG = { SKIN: 0, SHIRT: 1, PANTS: 2, SHOES: 3, HAIR: 4, BELT: 5 };

// bone order (indices used for skinning)
const BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'foreArmL', 'handL',
  'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', foreArmL: 'upperArmL', handL: 'foreArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };

const models = {};

export async function loadCharacterModels(urls) {
  const loader = new GLTFLoader();
  for (const [name, { url, height }] of Object.entries(urls)) {
    const gltf = await loader.loadAsync(url);
    models[name] = rig(gltf, height, name);
  }
  return models;
}

function extractGeometry(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const geos = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', g.attributes.position);
      if (g.index) ng.setIndex(g.index);
      geos.push(ng);
    }
  });
  if (geos.length !== 1) console.warn('character: expected one mesh, got', geos.length);
  const g = geos[0].index ? geos[0].toNonIndexed() : geos[0];
  return g;
}

function rig(gltf, targetH, name) {
  let geo = extractGeometry(gltf);
  geo.computeBoundingBox();
  let bb = geo.boundingBox;
  const H0 = bb.max.y - bb.min.y;
  const pos = geo.attributes.position;
  // which horizontal axis carries the arms? compare spread at shoulder height
  let sx = 0, sz = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = (pos.getY(i) - bb.min.y) / H0;
    if (y > 0.4 && y < 0.88) { sx = Math.max(sx, Math.abs(pos.getX(i) - (bb.min.x + bb.max.x) / 2)); sz = Math.max(sz, Math.abs(pos.getZ(i) - (bb.min.z + bb.max.z) / 2)); }
  }
  if (sz > sx) geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox(); bb = geo.boundingBox;
  // centre & scale
  const s = targetH / (bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, 0);
  geo.scale(s, s, s);
  // centre z on the torso
  let tz = 0, tn = 0;
  for (let i = 0; i < pos.count; i++) { const y = geo.attributes.position.getY(i) / targetH; if (y > 0.55 && y < 0.75) { tz += geo.attributes.position.getZ(i); tn++; } }
  geo.translate(0, 0, -tz / tn);
  // facing: toes point forward
  const P = geo.attributes.position;
  let feet = 0, fn = 0, shin = 0, sn = 0;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i) / targetH;
    if (y < 0.035) { feet += P.getZ(i); fn++; }
    else if (y > 0.12 && y < 0.3) { shin += P.getZ(i); sn++; }
  }
  if (feet / fn < shin / sn) geo.rotateY(Math.PI);
  geo.computeVertexNormals();
  const H = targetH;

  // ---- landmarks ----
  const pts = geo.attributes.position;
  // hands: extreme |x| on each side
  let hand = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  let maxL = -1, maxR = -1;
  for (let i = 0; i < pts.count; i++) {
    const x = pts.getX(i), y = pts.getY(i), z = pts.getZ(i);
    if (y < 0.3 * H) continue;
    if (x > maxL) { maxL = x; hand.L.set(x, y, z); }
    if (-x > maxR) { maxR = -x; hand.R.set(x, y, z); }
  }
  // legs: centroid x of each side near the knees
  let lx = 0, ln = 0, rx = 0, rn = 0;
  for (let i = 0; i < pts.count; i++) {
    const y = pts.getY(i) / H;
    if (y > 0.15 && y < 0.35) { const x = pts.getX(i); if (x > 0) { lx += x; ln++; } else { rx += x; rn++; } }
  }
  const legL = ln ? lx / ln : 0.09 * H, legR = rn ? rx / rn : -0.09 * H;
  const J = {};
  const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  J.hips = v(0, 0.53 * H); J.spine = v(0, 0.62 * H); J.chest = v(0, 0.73 * H);
  J.neck = v(0, 0.84 * H); J.head = v(0, 0.88 * H); J.headTop = v(0, H);
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    J['shoulder' + side] = v(sg * 0.06 * H, 0.81 * H);
    J['upperArm' + side] = v(sg * 0.112 * H, 0.81 * H);
    const S = J['upperArm' + side], tip = hand[side];
    const d = tip.clone().sub(S);
    const len = d.length();
    const dir = d.clone().normalize();
    // fit elbow & wrist to the actual arm by slicing along the shoulder->hand line
    const slice = (t0, t1) => {
      const c = new THREE.Vector3(); let k = 0;
      for (let i = 0; i < pts.count; i++) {
        const q = new THREE.Vector3().fromBufferAttribute(pts, i);
        if (q.x * sg < 0.08 * H) continue;
        const rel = q.clone().sub(S);
        const a = rel.dot(dir) / len;
        if (a < t0 || a > t1) continue;
        const perp = rel.addScaledVector(dir, -a * len).length();
        if (perp > 0.11 * H) continue;
        c.add(q); k++;
      }
      return k ? c.divideScalar(k) : null;
    };
    J['foreArm' + side] = slice(0.42, 0.52) || S.clone().addScaledVector(d, 0.47);
    J['hand' + side] = slice(0.8, 0.86) || S.clone().addScaledVector(d, 0.83);
    J['handTip' + side] = tip.clone();
    const lxs = side === 'L' ? legL : legR;
    J['thigh' + side] = v(lxs * 0.95, 0.5 * H);
    J['shin' + side] = v(lxs, 0.285 * H, 0.01 * H);
    J['foot' + side] = v(lxs, 0.055 * H);
    J['toe' + side] = v(lxs, 0.01 * H, 0.08 * H);
  }
  // bone capsules: [from, to, radius]
  const seg = {
    hips: [J.hips, J.spine, 0.085], spine: [J.spine, J.chest, 0.085], chest: [J.chest, J.neck, 0.09],
    neck: [J.neck, J.head, 0.035], head: [J.head, J.headTop, 0.06],
  };
  for (const side of ['L', 'R']) {
    seg['shoulder' + side] = [J['shoulder' + side], J['upperArm' + side], 0.05];
    seg['upperArm' + side] = [J['upperArm' + side], J['foreArm' + side], 0.034];
    seg['foreArm' + side] = [J['foreArm' + side], J['hand' + side], 0.028];
    seg['hand' + side] = [J['hand' + side], J['handTip' + side], 0.024];
    seg['thigh' + side] = [J['thigh' + side], J['shin' + side], 0.05];
    seg['shin' + side] = [J['shin' + side], J['foot' + side], 0.034];
    seg['foot' + side] = [J['foot' + side], J['toe' + side], 0.028];
  }
  const armDirL = J.handTipL.clone().sub(J.upperArmL).normalize();
  const n = pts.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4), region = new Float32Array(n);
  const tmp = new THREE.Vector3(), cp = new THREE.Vector3();
  const segDist = (p, a, b) => {
    const ab = tmp.copy(b).sub(a);
    const t = Math.max(0, Math.min(1, cp.copy(p).sub(a).dot(ab) / ab.lengthSq()));
    return { d: cp.copy(a).addScaledVector(ab, t).distanceTo(p), t };
  };
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pts, i);
    const side = p.x >= 0 ? 'L' : 'R';
    const other = side === 'L' ? 'R' : 'L';
    const cands = [];
    for (const b of BONES) {
      if (b.endsWith(other)) continue;
      const legBone = /thigh|shin|foot/.test(b);
      if (legBone && p.y > 0.56 * H) continue;
      const armBone = /Arm|hand/.test(b);
      if (armBone && p.y < 0.25 * H) continue;
      const [a, c, r] = seg[b];
      const { d } = segDist(p, a, c);
      cands.push([b, d / (r * H)]);
    }
    cands.sort((x, y) => x[1] - y[1]);
    const top = cands.slice(0, 3);
    let wsum = 0;
    const ws = top.map(([, nd]) => { const w = 1 / Math.pow(nd + 0.15, 6); wsum += w; return w; });
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = k < top.length ? BONES.indexOf(top[k][0]) : 0;
      skinWeight[i * 4 + k] = k < top.length ? ws[k] / wsum : 0;
    }
    // clothing regions
    const y = p.y / H;
    const primary = top[0][0];
    const isArm = /Arm|hand/.test(primary);
    let reg = REG.SHIRT;
    if (/foot/.test(primary) || y < 0.06) reg = REG.SHOES;
    else if (/shin|thigh/.test(primary) || (y < 0.53 && !isArm)) reg = REG.PANTS;
    else if (/hand/.test(primary)) reg = REG.SKIN;
    else if (/foreArm/.test(primary)) {
      const sd = segDist(p, J['foreArm' + side], J['hand' + side]);
      reg = sd.t > 0.35 ? REG.SKIN : REG.SHIRT;
    } else if (primary === 'head' || primary === 'neck' || (y > 0.85 && !isArm) || (y > 0.83 && Math.abs(p.x) < 0.05 * H && p.z > 0)) {
      reg = REG.SKIN;
      if (y > 0.955 || (y > 0.905 && p.z < -0.015 * H)) reg = REG.HAIR;
    }
    region[i] = reg;
  }
  // one clothing region per triangle (majority vote) so colours never blend across a face
  for (let t = 0; t + 2 < n; t += 3) {
    const a = region[t], b = region[t + 1], c = region[t + 2];
    const m = a === b || a === c ? a : b === c ? b : Math.min(a, b, c);
    region[t] = region[t + 1] = region[t + 2] = m;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.setAttribute('region', new THREE.Float32BufferAttribute(region, 1));
  // rest arm angle (angle of arm from horizontal, negative = below)
  const restArm = Math.atan2(armDirL.y, armDirL.x);
  return { geo, joints: J, height: H, restArm, name };
}

// ---------------- material with palette ----------------
function makeMaterial(palette) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: false });
  const cols = palette.map((h) => new THREE.Color(h));
  m.userData.palette = cols;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPal = { value: cols };
    sh.uniforms.uGore = { value: m.userData.gore || 0 };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float region;\nflat varying float vRegion;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = region;\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPal[6];\nuniform float uGore;\nflat varying float vRegion;\nvarying vec3 vLocal;\nfloat ch(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }')
      .replace('#include <color_fragment>', `
        int ri = int(vRegion + 0.5);
        vec3 pc = uPal[0];
        if (ri == 1) pc = uPal[1]; else if (ri == 2) pc = uPal[2]; else if (ri == 3) pc = uPal[3]; else if (ri == 4) pc = uPal[4]; else if (ri == 5) pc = uPal[5];
        // subtle cloth/skin variation
        float v = 0.92 + 0.08 * ch(floor(vLocal * 40.0));
        diffuseColor.rgb *= pc * v;
        if (uGore > 0.0) {
          float g = ch(floor(vLocal * 9.0));
          if (g > 1.0 - uGore * 0.35) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.04, 0.03), 0.8);
        }
      `);
  };
  m.customProgramCacheKey = () => 'holdfast-char-v1';
  return m;
}

export const PALETTES = {
  survivorM: ['#c8a088', '#3b5f7a', '#4a4a52', '#2a2622', '#3a2a1e', '#2a2018'],
  survivorF: ['#d8b098', '#8a3a32', '#3f4a5c', '#3a2e28', '#6a4a2a', '#2a2018'],
};
const SKIN_TONES = ['#e2b9a0', '#c99a7a', '#a8775a', '#7a5238', '#5a3a28', '#d8a888'];
const SHIRTS = ['#3b5f7a', '#7a3a32', '#5a6a3a', '#c8b88a', '#3a3a3a', '#6a5a8a', '#8a6a3a', '#e0ddd0', '#2f4a5a'];
const PANTS = ['#3a4458', '#4a4a52', '#5a4a3a', '#2e3238', '#6a6a5a'];
const HAIRS = ['#2a1e16', '#4a3020', '#8a6a3a', '#1a1a1a', '#6a5a4a', '#b0a090'];

export function randomPalette(rng, zombie = false) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  let skin = pick(SKIN_TONES);
  let shirt = pick(SHIRTS), pants = pick(PANTS), hair = pick(HAIRS);
  if (zombie) {
    const c = new THREE.Color(skin).lerp(new THREE.Color('#7a8a6a'), 0.6).multiplyScalar(0.8);
    skin = '#' + c.getHexString();
    const dirty = (h) => '#' + new THREE.Color(h).lerp(new THREE.Color('#4a4030'), 0.45).multiplyScalar(0.8).getHexString();
    shirt = dirty(shirt); pants = dirty(pants);
  }
  return [skin, shirt, pants, '#2a2420', hair, '#2a2018'];
}

// ---------------- character instance ----------------
export class Character {
  constructor(modelName, palette) {
    const M = models[modelName];
    this.model = M;
    const bones = {};
    for (const b of BONES) {
      const bone = new THREE.Bone();
      bone.name = b;
      bones[b] = bone;
    }
    for (const b of BONES) {
      const p = PARENT[b];
      const jw = M.joints[b];
      if (p) {
        bones[p].add(bones[b]);
        bones[b].position.copy(jw).sub(M.joints[p]);
      } else bones[b].position.copy(jw);
    }
    this.bones = bones;
    this.material = makeMaterial(palette);
    const mesh = new THREE.SkinnedMesh(M.geo, this.material);
    mesh.add(bones.hips);
    mesh.updateMatrixWorld(true);
    // inverses must be computed from the posed (rest) world matrices
    const skeleton = new THREE.Skeleton(BONES.map((b) => bones[b]));
    mesh.bind(skeleton, mesh.matrixWorld);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.root = new THREE.Group();
    this.root.add(mesh);
    this.restQuat = {};
    for (const b of BONES) this.restQuat[b] = bones[b].quaternion.clone();
    this.t = Math.random() * 10;
    this.restArm = M.restArm;
    // reusable
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._world = {};
    for (const b of BONES) this._world[b] = new THREE.Quaternion();
    this.heldItem = null;
  }
  setGore(v) { this.material.userData.gore = v; if (this.material.userData.shader) this.material.userData.shader.uniforms.uGore.value = v; }

  // Set pose from world-space (relative to rest) rotations per bone.
  applyWorld(W) {
    for (const b of BONES) {
      const p = PARENT[b];
      const w = W[b] || IDENT;
      if (!p) { this.bones[b].quaternion.copy(w); continue; }
      const wp = W[p] || IDENT;
      this.bones[b].quaternion.copy(wp).invert().multiply(w);
    }
  }

  // state: {speed (m/s), mode: 'idle'|'walk'|'run'|'zombie'|'dead', attack: 0..1, aim: bool, crouch}
  animate(dt, st) {
    const W = this._world;
    for (const b of BONES) W[b].identity();
    const sp = st.speed || 0;
    const zombie = st.mode === 'zombie';
    const stride = zombie ? 1.6 : sp > 3.5 ? 2.6 : 1.8;
    this.t += dt * (sp / stride) * Math.PI * 2 * (zombie ? 0.9 : 1);
    const ph = this.t;
    const move = Math.min(1, sp / (zombie ? 1.2 : 1.6));
    const run = Math.max(0, Math.min(1, (sp - 2.5) / 2.5));
    const idleB = Math.sin(performance.now() / 1000 * 1.6) * (1 - move);
    const X = (a) => new THREE.Quaternion().setFromAxisAngle(AX, a);
    const Y = (a) => new THREE.Quaternion().setFromAxisAngle(AY, a);
    const Z = (a) => new THREE.Quaternion().setFromAxisAngle(AZ, a);
    // body lean & bob
    const lean = (zombie ? 0.18 : 0.05 + run * 0.18) * move + (st.crouch ? 0.35 : 0);
    W.hips.copy(Y(Math.sin(ph) * 0.12 * move));
    W.spine.copy(W.hips).multiply(X(lean * 0.5)).multiply(Y(-Math.sin(ph) * 0.18 * move));
    W.chest.copy(W.spine).multiply(X(lean * 0.5 + idleB * 0.015));
    W.neck.copy(W.chest);
    W.head.copy(W.chest).multiply(X(-lean * 0.6 + (zombie ? 0.25 : 0))).multiply(Z(zombie ? Math.sin(ph * 0.5) * 0.2 : 0));
    // legs
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const legPh = ph + (s > 0 ? 0 : Math.PI);
      const swing = Math.sin(legPh) * (0.45 + run * 0.35) * move;
      const knee = Math.max(0, -Math.cos(legPh)) * (0.7 + run * 0.6) * move + (st.crouch ? 0.9 : 0) + (zombie ? 0.15 : 0);
      const thighA = -swing - (st.crouch ? 0.6 : 0);
      W['thigh' + side].copy(W.hips).multiply(X(thighA));
      W['shin' + side].copy(W.hips).multiply(X(thighA + knee));
      W['foot' + side].copy(W.hips).multiply(X(thighA + knee - knee * 0.6 + swing * 0.2));
    }
    // arms: lower from rest pose to hanging, then swing
    const lowerTo = -1.38; // radians from horizontal (arms down, slightly out)
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const lower = (lowerTo - this.restArm) * s; // rotate about Z (sign by side)
      const armPh = ph + (s > 0 ? Math.PI : 0);
      let swing = Math.sin(armPh) * (0.35 + run * 0.5) * move;
      let elbow = 0.15 + run * 0.9 * move + (1 - move) * 0.05;
      let twist = 0;
      let outward = 0;
      if (zombie) {
        swing = -1.35 + Math.sin(ph * 0.5 + s) * 0.12;
        elbow = 0.25 + Math.sin(ph * 0.7 + s) * 0.1;
        outward = 0.15 * s;
      }
      if (st.attack != null && st.attack >= 0 && side === 'R') {
        // overhead/side swing with the held weapon (attack 0..1)
        const a = st.attack;
        const L = (x, y, t) => x + (y - x) * t;
        if (a < 0.3) { const t = a / 0.3; swing = L(-0.4, -2.5, t); elbow = L(0.3, 1.5, t); twist = L(0, 0.5, t); }
        else if (a < 0.5) { const t = (a - 0.3) / 0.2; swing = L(-2.5, -0.2, t); elbow = L(1.5, 0.1, t); twist = L(0.5, -0.2, t); }
        else { const t = (a - 0.5) / 0.5; swing = L(-0.2, -0.35, t); elbow = L(0.1, 0.35, t); twist = L(-0.2, 0, t); }
      } else if (st.holding && side === 'R' && !zombie) {
        elbow = Math.max(elbow, 0.45);
      }
      if (st.aim && side === 'R') { swing = -1.45; elbow = 0.05; }
      if (st.aim && side === 'L') { swing = -1.35; elbow = 0.35; outward = -0.35; }
      W['shoulder' + side].copy(W.chest);
      W['upperArm' + side].copy(W.chest).multiply(Z(outward)).multiply(X(swing)).multiply(Y(twist * s)).multiply(Z(lower));
      W['foreArm' + side].copy(W.chest).multiply(Z(outward)).multiply(X(swing - elbow)).multiply(Y(twist * s)).multiply(Z(lower));
      W['hand' + side].copy(W['foreArm' + side]);
    }
    if (st.mode === 'dead') {
      for (const b of BONES) W[b].identity();
      W.hips.copy(X(0));
      const lower = (lowerTo - this.restArm);
      W.upperArmL.copy(Z(lower * 0.3)); W.foreArmL.copy(W.upperArmL);
      W.upperArmR.copy(Z(-lower * 0.3)); W.foreArmR.copy(W.upperArmR);
    }
    this.applyWorld(W);
  }
  // world position of the right hand (for weapons)
  handWorld(out = new THREE.Vector3()) {
    this.bones.handR.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.bones.handR.matrixWorld);
  }
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const IDENT = new THREE.Quaternion();
export { REG, BONES };
