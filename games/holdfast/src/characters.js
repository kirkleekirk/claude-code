// Character models: loads the provided GLB figures (static meshes), works out
// their pose (A- or T-pose), fits a skeleton, skins them with smooth weights
// and dresses them via per-vertex region ids + a palette uniform. Animation
// is procedural (idle, walk, run, swing, zombie shamble, death).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// TORSO and FOREARM are split in the shader (straight hem and sleeve
// lines no matter how the low-poly triangles run)
const REG = { SKIN: 0, SHIRT: 1, PANTS: 2, SHOES: 3, HAIR: 4, BELT: 5, TORSO: 6, FOREARM: 7 };

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

// Each entry is { url, height }. A url ending in .js names a module whose
// default export is the .glb file as base64: it is decoded and parsed in
// place, so hosts that only allow loading scripts can still serve models.
export async function loadCharacterModels(urls) {
  const loader = new GLTFLoader();
  for (const [name, { url, height }] of Object.entries(urls)) {
    let gltf;
    if (/\.js($|\?)/.test(url)) {
      const b64 = (await import(new URL(url, location.href).href)).default;
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      gltf = await loader.parseAsync(bytes.buffer, '');
    } else {
      gltf = await loader.loadAsync(url);
    }
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
    // leg joints at the centre of the leg at hip, knee and ankle height
    // (hands of an A-posed model hang beside the hips: stay inside the leg)
    const band = (y0, y1, maxX = 0.2) => {
      let cx = 0, cz = 0, k = 0;
      for (let i = 0; i < pts.count; i++) {
        const x = pts.getX(i), y = pts.getY(i) / H;
        if (y < y0 || y > y1 || Math.sign(x) !== Math.sign(lxs) || Math.abs(x) < 0.01 * H || Math.abs(x) > maxX * H) continue;
        cx += x; cz += pts.getZ(i); k++;
      }
      return k ? [cx / k, cz / k] : [lxs, 0];
    };
    const th = band(0.4, 0.47, Math.abs(lxs) / H + 0.04), kn = band(0.26, 0.31), an = band(0.06, 0.09);
    J['thigh' + side] = v(th[0], 0.5 * H, 0);
    J['shin' + side] = v(kn[0], 0.285 * H, kn[1]);
    J['foot' + side] = v(an[0], 0.06 * H, an[1]);
    J['toe' + side] = v(an[0], 0.01 * H, an[1] + 0.08 * H);
    // sole: heel and toe tip of the shoe (ground contact points)
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < pts.count; i++) {
      const x = pts.getX(i), y = pts.getY(i);
      if (y > 0.04 * H || Math.sign(x) !== Math.sign(lxs)) continue;
      const z = pts.getZ(i);
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    if (!isFinite(zMin)) { zMin = -0.035 * H; zMax = 0.09 * H; }
    J['heel' + side] = v(lxs, 0, zMin + 0.01 * H);
    J['toeTip' + side] = v(lxs, 0, zMax - 0.01 * H);
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
  // front of the face at eye height (the hair/face split is measured from it)
  let faceZ = -Infinity;
  for (let i = 0; i < pts.count; i++) {
    const y = pts.getY(i) / H;
    if (y > 0.92 && y < 0.95 && Math.abs(pts.getX(i)) < 0.05 * H) faceZ = Math.max(faceZ, pts.getZ(i));
  }
  if (!isFinite(faceZ)) faceZ = 0.05 * H;
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
    else if (/foreArm|upperArm/.test(primary)) reg = REG.FOREARM;
    else if (primary === 'head' || primary === 'neck' || (y > 0.85 && !isArm) || (y > 0.83 && Math.abs(p.x) < 0.05 * H && p.z > 0)) {
      reg = REG.SKIN;
      if (y > 0.955 || (y > 0.905 && p.z < faceZ - 0.085 * H)) reg = REG.HAIR;
    }
    // around the waist the shirt/pants split is decided per pixel
    if ((reg === REG.SHIRT || reg === REG.PANTS) && !isArm && y > 0.4 && y < 0.68) reg = REG.TORSO;
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
  // per-segment rotations that straighten each limb segment to hang straight
  // down (arms) or stand straight (legs) from whatever the model's rest pose is
  const down = new THREE.Vector3(0, -1, 0);
  const hangOf = (a, b) => new THREE.Quaternion().setFromUnitVectors(J[b].clone().sub(J[a]).normalize(), down);
  const hang = {};
  for (const sd of ['L', 'R']) {
    hang['upperArm' + sd] = hangOf('upperArm' + sd, 'foreArm' + sd);
    hang['foreArm' + sd] = hangOf('foreArm' + sd, 'hand' + sd);
    hang['hand' + sd] = hangOf('hand' + sd, 'handTip' + sd);
    hang['thigh' + sd] = hangOf('thigh' + sd, 'shin' + sd);
    hang['shin' + sd] = hangOf('shin' + sd, 'foot' + sd);
  }
  // face landmarks (rest pose): eyes and mouth on the front of the head
  const front = (y0, y1, xMax) => {
    let zf = -Infinity;
    for (let i = 0; i < pts.count; i++) {
      const y = pts.getY(i) / H;
      if (y < y0 || y > y1 || Math.abs(pts.getX(i)) > xMax * H) continue;
      zf = Math.max(zf, pts.getZ(i));
    }
    return isFinite(zf) ? zf : 0.05 * H;
  };
  const ze = front(0.925, 0.955, 0.05), zm = front(0.895, 0.915, 0.03);
  const face = {
    eyeL: new THREE.Vector3(0.0215 * H, 0.938 * H, ze),
    eyeR: new THREE.Vector3(-0.0215 * H, 0.938 * H, ze),
    mouth: new THREE.Vector3(0, 0.903 * H, zm),
  };
  // shirt hem: the man's at the top of the hips, the woman's a little
  // higher over her wider hips
  const waist = (name === 'woman' ? 0.556 : 0.535) * H;
  return { geo, joints: J, height: H, restArm, hang, face, waist, name };
}

// ---------------- material with palette ----------------
// Character material: per-region palette colours on one shared mesh. Survivors
// get eyes; zombies (z = { seed, decay, blood, tear, build }) get mottled
// grey skin, dark sockets with a faint glow, blood, torn and filthy clothes.
// Noise comes from a small tiling texture made once on the CPU, so it looks
// the same on every GPU (shader hash functions fall apart at the lower
// precision many phones use). Channels: r, g fbm; b, a single octave.
// One noise cell per unit of the lookup coordinate.
let NOISE_TEX = null;
function noiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const N = 128, C = 8, data = new Uint8Array(N * N * 4);
  const lattice = (seed, cells) => {
    let s = seed >>> 0;
    const v = new Float32Array(cells * cells);
    for (let i = 0; i < v.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; v[i] = s / 4294967296; }
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (i, j) => v[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  };
  const fbm = (seed) => {
    const o = [lattice(seed, C), lattice(seed + 7, C * 2), lattice(seed + 13, C * 4)];
    return (x, y) => 0.55 * o[0](x, y) + 0.3 * o[1](x * 2, y * 2) + 0.15 * o[2](x * 4, y * 4);
  };
  const R = fbm(11), G = fbm(29), B = lattice(47, C), A = lattice(83, C);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * C, y = (j / N) * C, k = (j * N + i) * 4;
    data[k] = R(x, y) * 255; data[k + 1] = G(x, y) * 255; data[k + 2] = B(x, y) * 255; data[k + 3] = A(x, y) * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  NOISE_TEX = t;
  return t;
}
// lookups blend a front (xy) and a side (zy) projection by the surface normal
const NOISE_GLSL = `
uniform sampler2D uNoise;
varying vec3 vObjN;
vec4 nz4(vec3 q){
  float w = smoothstep(0.45, 0.75, abs(normalize(vObjN).x));
  return mix(texture2D(uNoise, q.xy * 0.125), texture2D(uNoise, q.zy * 0.125 + 0.5), w);
}
float zf(vec3 q){ return nz4(q).r; }
float zn(vec3 q){ return nz4(q).b; }
float ch(vec3 p){ return texture2D(uNoise, (p.xy + p.z * 3.7) * 0.0078125 + 0.003).a; }
`;
function makeMaterial(palette, model, z = null) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: false });
  const cols = palette.map((h) => new THREE.Color(h));
  m.userData.palette = cols;
  const face = model.face, H = model.height;
  m.onBeforeCompile = (sh) => {
    // one vec3 uniform per colour: some phone drivers read vec3 uniform
    // arrays wrong (only the first component of each colour survives)
    cols.forEach((c, i) => { sh.uniforms['uC' + i] = { value: c }; });
    sh.uniforms.uGore = { value: m.userData.gore || 0 };
    sh.uniforms.uH = { value: H };
    sh.uniforms.uEyeL = { value: face.eyeL };
    sh.uniforms.uEyeR = { value: face.eyeR };
    sh.uniforms.uMouth = { value: face.mouth };
    sh.uniforms.uZ = { value: z ? new THREE.Vector4(z.seed, z.decay, z.blood, z.tear) : new THREE.Vector4() };
    sh.uniforms.uBuild = { value: z ? z.build : 1 };
    sh.uniforms.uNoise = { value: noiseTexture() };
    sh.uniforms.uWaist = { value: model.waist };
    const J = model.joints;
    sh.uniforms.uElbowL = { value: J.foreArmL }; sh.uniforms.uWristL = { value: J.handL };
    sh.uniforms.uElbowR = { value: J.foreArmR }; sh.uniforms.uWristR = { value: J.handR };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float region;\nvarying float vRegion;\nvarying vec3 vLocal;\nvarying vec3 vObjN;\nuniform float uBuild;\nuniform float uH;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjN = objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRegion = region;
        vLocal = position;
        ${z ? `// gaunt or bloated: the torso narrows or swells
        float ty = position.y / uH;
        if (abs(position.x) < 0.13 * uH && ty > 0.5 && ty < 0.86) {
          float k = smoothstep(0.5, 0.56, ty) * (1.0 - smoothstep(0.8, 0.86, ty));
          transformed.x *= mix(1.0, uBuild, k);
          transformed.z *= mix(1.0, uBuild + max(0.0, uBuild - 1.0) * step(0.0, position.z) * 0.8, k);
        }` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uC0;\nuniform vec3 uC1;\nuniform vec3 uC2;\nuniform vec3 uC3;\nuniform vec3 uC4;\nuniform vec3 uC5;\nuniform float uGore;\nuniform float uH;\nuniform float uWaist;\nuniform vec3 uEyeL;\nuniform vec3 uEyeR;\nuniform vec3 uMouth;\nuniform vec3 uElbowL;\nuniform vec3 uWristL;\nuniform vec3 uElbowR;\nuniform vec3 uWristR;\nuniform vec4 uZ;\nvarying float vRegion;\nvarying vec3 vLocal;' + NOISE_GLSL)
      .replace('#include <color_fragment>', `
        // regions are whole numbers, the same on all three corners of a
        // triangle (plain float compares: no int conversion, no flat)
        float rg = floor(vRegion + 0.5);
        // shirt hem: a straight line round the hips
        if (rg > 5.5 && rg < 6.5) rg = vLocal.y < uWaist ? 2.0 : 1.0;
        // sleeve: ends a third of the way down the forearm
        if (rg > 6.5) {
          vec3 e = vLocal.x > 0.0 ? uElbowL : uElbowR;
          vec3 ew = (vLocal.x > 0.0 ? uWristL : uWristR) - e;
          rg = dot(vLocal - e, ew) / dot(ew, ew) > 0.3 ? 0.0 : 1.0;
        }
        int ri = rg < 0.5 ? 0 : rg < 1.5 ? 1 : rg < 2.5 ? 2 : rg < 3.5 ? 3 : rg < 4.5 ? 4 : 5;
        vec3 pc = uC0;
        if (rg > 0.5 && rg < 1.5) pc = uC1;
        else if (rg > 1.5 && rg < 2.5) pc = uC2;
        else if (rg > 2.5 && rg < 3.5) pc = uC3;
        else if (rg > 3.5 && rg < 4.5) pc = uC4;
        else if (rg > 4.5) pc = uC5;
        // subtle cloth/skin variation
        float v = 0.92 + 0.08 * ch(floor(vLocal * 40.0));
        vec3 col = pc * v;
        float eyeGlow = 0.0;
        // eyes are matched across the front of the head (x/y only)
        float frontOk = step(uEyeL.z - 0.07 * uH, vLocal.z);
        float de = mix(1.0, min(distance(vLocal.xy, uEyeL.xy), distance(vLocal.xy, uEyeR.xy)) / uH, frontOk);
        ${z ? `
        vec3 P = vLocal / uH + uZ.x * 0.125;
        vec3 skin = uC0 * (0.7 + 0.3 * zf(P * 15.0));
        if (ri == 0) {
          col = skin;
          // veins and bruising
          if (abs(zn(P * 34.0) - 0.5) < 0.035) col *= 0.62;
          float br = zf(P * 6.0 + 4.0);
          if (br > 0.66 - uZ.y * 0.08) col = mix(col, vec3(0.32, 0.22, 0.3), 0.55);
          // bloody hands
          if (vLocal.y < 0.62 * uH && abs(vLocal.x) > 0.15 * uH && zf(P * 12.0 + 2.0) > 0.55) col = mix(col, vec3(0.22, 0.03, 0.02), 0.7);
        } else if (ri == 1 || ri == 2) {
          // filthy, faded, torn: holes show grey skin with dark frayed edges
          col *= 0.72 + 0.32 * zf(P * 5.0 + 7.0);
          float tn = zf(P * vec3(9.0, 6.5, 9.0) + 3.1);
          float th = 1.0 - uZ.w * 0.36;
          if (tn > th) col = skin * 0.7;
          else if (tn > th - 0.035) col *= 0.38;
          // blood: splotches soaked in from the collar, a few running drips
          float bl = zf(P * vec3(12.0, 9.5, 12.0) + 11.0);
          float hi = smoothstep(0.55, 0.84, vLocal.y / uH);
          float drip = step(0.975, zn(vec3(P.x * 60.0, 0.0, P.z * 60.0) + 5.0)) * smoothstep(0.66, 0.78, vLocal.y / uH) * step(0.45, uZ.z);
          if (bl * (0.5 + 0.65 * hi) > 1.0 - uZ.z * 0.36 || drip > 0.5) col = mix(col, vec3(0.2, 0.025, 0.02), 0.82);
        } else if (ri == 4) {
          if (zf(P * 13.0) > 0.66 - uZ.y * 0.1) col = skin * 0.8; // hair coming out in patches
        }
        // mouth: blood down the chin
        vec3 mo = vLocal - uMouth;
        float mw = 0.017 * uH * (0.7 + 0.5 * zn(vec3(vLocal.y * 90.0, 1.0, uZ.x)));
        if (frontOk > 0.5 && abs(mo.x) < mw && mo.y < 0.004 * uH && mo.y > -0.035 * uH * (0.4 + uZ.z) * (0.6 + 0.8 * zn(vec3(vLocal.x * 120.0, 2.0, uZ.x)))) col = mix(col, vec3(0.18, 0.02, 0.02), 0.85);
        // eyes: sunken dark sockets, a dull yellow shine
        if (de < 0.016) { col = mix(vec3(0.04, 0.02, 0.02), col, smoothstep(0.01, 0.016, de)); eyeGlow = 1.0 - smoothstep(0.002, 0.0065, de); }
        ` : `
        // eyes
        if (de < 0.0078) col = mix(col * 0.2, col, smoothstep(0.0042, 0.0078, de));
        `}
        diffuseColor.rgb *= col;
        if (uGore > 0.0) {
          float g = ch(floor(vLocal * 9.0));
          if (g > 1.0 - uGore * 0.35) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.04, 0.03), 0.8);
        }
      `)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.8, 0.68, 0.3) * eyeGlow * 0.32;');
  };
  m.customProgramCacheKey = () => (z ? 'holdfast-zombie-v4' : 'holdfast-char-v4');
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

const ZSKIN = ['#7d8670', '#6f7a63', '#8a8f7e', '#717d84', '#857a70', '#5d6652', '#7a7268'];
export function randomPalette(rng, zombie = false) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  let skin = pick(SKIN_TONES);
  let shirt = pick(SHIRTS), pants = pick(PANTS), hair = pick(HAIRS);
  if (zombie) {
    const c = new THREE.Color(pick(ZSKIN)).lerp(new THREE.Color(skin), 0.18).multiplyScalar(0.85 + rng() * 0.2);
    skin = '#' + c.getHexString();
    const dirty = (h) => '#' + new THREE.Color(h).lerp(new THREE.Color('#4a4030'), 0.45).multiplyScalar(0.8).getHexString();
    shirt = dirty(shirt); pants = dirty(pants);
  }
  return [skin, shirt, pants, '#2a2420', hair, '#2a2018'];
}

// ---------------- character instance ----------------
// ---------------- procedural animation ----------------
// Poses are built from a flat set of joint angles (radians), blended between
// locomotion, actions and overrides, then turned into bone rotations.
// Character space: +Y up, +Z forward, +X the character's left.

// Gait keyframes in degrees at u = k/12 over one stride, u = 0 at this leg's
// heel strike. hip: thigh forward (+); knee: flexion; ankle: toes up (+).
const GAIT = {
  walk: {
    stance: 0.6,
    hip: [28, 25, 19, 12, 5, -2, -8, -10, -2, 12, 24, 29],
    knee: [4, 14, 17, 12, 6, 4, 8, 25, 50, 60, 38, 12],
    ankle: [0, -6, 2, 6, 9, 10, 5, -12, -14, -2, 2, 1],
  },
  run: {
    stance: 0.38,
    hip: [32, 24, 12, 0, -12, -18, -10, 8, 28, 42, 44, 38],
    knee: [22, 36, 40, 30, 20, 28, 55, 90, 105, 85, 55, 32],
    ankle: [6, 10, 14, 8, -10, -24, -16, -5, 5, 10, 8, 6],
  },
};
const DEG = Math.PI / 180;
for (const g of Object.values(GAIT)) for (const k of ['hip', 'knee', 'ankle']) g[k] = g[k].map((d) => d * DEG);
function curve(arr, u) {
  const n = arr.length, f = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(f), t = f - i;
  const p0 = arr[(i - 1 + n) % n], p1 = arr[i % n], p2 = arr[(i + 1) % n], p3 = arr[(i + 2) % n];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// pose keys: pelvis yaw/roll/pitch, spine & chest yaw/pitch/roll, head
// yaw/pitch/roll, legs (hip flex, hip abduction, knee, ankle), arms (flex,
// abduction, horizontal yaw across the body, roll, elbow, wrist), extra hip
// lift, held weapon direction in chest space (wc*) and root space (wr*).
const POSE_KEYS = ['pY', 'pR', 'pP', 'sY', 'sP', 'sR', 'cY', 'cP', 'cR', 'hY', 'hP', 'hR',
  'lHF', 'lHA', 'lK', 'lA', 'rHF', 'rHA', 'rK', 'rA',
  'aLF', 'aLA', 'aLY', 'aLR', 'aLE', 'aLW', 'aRF', 'aRA', 'aRY', 'aRR', 'aRE', 'aRW',
  'lift', 'wcx', 'wcy', 'wcz', 'wrx', 'wry', 'wrz', 'wm',
  'ik', 'gx', 'gy', 'gz', 'two', 'twoD', 'twoX', 'twoY', 'px', 'sLY', 'sRY', 'sitW', 'sitH'];
const newPose = () => { const o = {}; for (const k of POSE_KEYS) o[k] = 0; return o; };
function setArm(P, side, f, a, y, r, e, w = 0) { const k = 'a' + side; P[k + 'F'] = f; P[k + 'A'] = a; P[k + 'Y'] = y; P[k + 'R'] = r; P[k + 'E'] = e; P[k + 'W'] = w; }
function mixArm(P, side, Q, t) { for (const s of ['F', 'A', 'Y', 'R', 'E', 'W']) { const k = 'a' + side + s; P[k] = lerp(P[k], Q[k], t); } }
function mixKeys(P, Q, t, keys) { for (const k of keys) P[k] = lerp(P[k], Q[k], t); }
const ARM_R = ['aRF', 'aRA', 'aRY', 'aRR', 'aRE', 'aRW'], ARM_L = ['aLF', 'aLA', 'aLY', 'aLR', 'aLE', 'aLW'];
const TORSO = ['pY', 'pR', 'pP', 'sY', 'sP', 'sR', 'cY', 'cP', 'cR', 'hY', 'hP', 'hR', 'px', 'sLY', 'sRY'];
const LEGS = ['lHF', 'lHA', 'lK', 'lA', 'rHF', 'rHA', 'rK', 'rA'];
const WEAPON = ['wcx', 'wcy', 'wcz', 'wrx', 'wry', 'wrz', 'wm', 'ik', 'gx', 'gy', 'gz', 'two', 'twoD', 'twoX', 'twoY'];

// Keyframed actions: [time, ease ('io' in/out, 'in' accelerate, 'out'), {keys}]
// Held items are posed by where the right fist grips (gx, gy, gz: chest
// space, metres for a 1.78 m body; the arm reaches it by IK) and which way
// the item points (wc*). two > 0 brings the left hand onto the handle.
// Bat: carried on the right shoulder; a two-handed swing that winds up over
// the right shoulder, sweeps flat through the front and wraps round the left.
const BAT_CARRY = { ik: 1, gx: -0.21, gy: 0.07, gz: 0.23, wcx: -0.13, wcy: 0.62, wcz: -0.77, wm: 0, two: 0, twoD: 0.11, twoX: 0, twoY: 0 };
const BAT_SWING = [
  [0, 'io', { ...BAT_CARRY, cY: 0, sY: 0, pY: 0, cP: 0 }],
  [0.22, 'out', { ik: 1, gx: -0.2, gy: 0.2, gz: 0.1, wcx: 0.12, wcy: 0.78, wcz: -0.62, two: 1, cY: -0.62, sY: -0.28, pY: -0.12, cP: -0.04 }],
  [0.31, 'in', { ik: 1, gx: -0.22, gy: 0.22, gz: 0.05, wcx: 0.25, wcy: 0.72, wcz: -0.65, two: 1, cY: -0.72, sY: -0.32, pY: -0.15, cP: -0.05 }],
  [0.36, 'in', { ik: 1, gx: -0.3, gy: 0.04, gz: 0.2, wcx: -0.62, wcy: 0.28, wcz: -0.73, two: 1, cY: -0.42, sY: -0.2, pY: -0.08, cP: 0.02 }],
  [0.42, 'out', { ik: 1, gx: -0.1, gy: -0.06, gz: 0.52, wcx: 0.55, wcy: 0.04, wcz: 0.83, two: 1, cY: 0.12, sY: 0.04, pY: 0.04, cP: 0.1 }],
  [0.5, 'out', { ik: 1, gx: 0.1, gy: -0.04, gz: 0.42, wcx: 0.96, wcy: -0.04, wcz: 0.15, two: 1, cY: 0.5, sY: 0.2, pY: 0.1, cP: 0.12 }],
  [0.62, 'out', { ik: 1, gx: 0.2, gy: 0.08, gz: 0.18, wcx: 0.55, wcy: 0.35, wcz: -0.76, two: 1, cY: 0.75, sY: 0.3, pY: 0.14, cP: 0.08 }],
  [0.8, 'io', { ik: 1, gx: -0.02, gy: 0.06, gz: 0.3, wcx: 0.1, wcy: 0.72, wcz: -0.68, two: 0.4, cY: 0.3, sY: 0.12, pY: 0.05, cP: 0.03 }],
  [1, 'io', { ...BAT_CARRY, cY: 0, sY: 0, pY: 0, cP: 0 }],
];
// Zombie lunge: arms come up, then the body pitches in and the hands claw down.
const ZOMBIE_GRAB = [
  [0, 'io', {}],
  [0.3, 'out', { aLF: 2.0, aLA: 0.35, aLY: 0.1, aLE: 0.6, aRF: 2.05, aRA: 0.3, aRY: 0.1, aRE: 0.55, cP: -0.12, sP: -0.05, hP: -0.15 }],
  [0.48, 'in', { aLF: 1.05, aLA: 0.2, aLY: 0.25, aLE: 0.2, aRF: 1.0, aRA: 0.2, aRY: 0.25, aRE: 0.2, cP: 0.42, sP: 0.18, hP: 0.1 }],
  [0.7, 'io', { aLF: 0.95, aLA: 0.2, aLY: 0.25, aLE: 0.35, aRF: 0.9, aRA: 0.2, aRY: 0.25, aRE: 0.35, cP: 0.32, sP: 0.12, hP: 0.1 }],
  [1, 'io', {}],
];
function ease(t, kind) {
  if (kind === 'in') return t * t;
  if (kind === 'out') return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t);
}
// Sample keyframes into P (keys missing from a frame keep P's value there).
function playKeys(P, frames, t, weight = 1) {
  let i = 0;
  while (i < frames.length - 2 && t > frames[i + 1][0]) i++;
  const [t0, , A] = frames[i], [t1, kind, B] = frames[i + 1];
  const k = ease(clamp01((t - t0) / (t1 - t0)), kind);
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const key of keys) {
    const a = key in A ? A[key] : P[key], b = key in B ? B[key] : P[key];
    P[key] = lerp(P[key], lerp(a, b, k), weight);
  }
}

// ---------------- everyday actions ----------------
// Each act writes a target pose into Q (a copy of the current pose); the
// character blends acts in and out. t: clock, c: the character, st: state
// (st.seatH seat height, st.attack 0..1 for punches). Returns { lying }.
const wave = (t, f, ph = 0) => Math.sin(t * f + ph);
function sitLegs(P, c, seatH, hip = 1.5, knee = 1.5) {
  const sc = c.model.height / 1.78;
  P.lHF = P.rHF = hip; P.lK = P.rK = knee; P.lA = P.rA = 0.05; P.lHA = P.rHA = 0.1;
  P.px = 0; P.pR = 0; P.pY = 0; P.lift = 0; P.sR = 0; P.cR = 0;
  P.sitW = 1; P.sitH = seatH + 0.085 * sc;
}
function grip(P, gx, gy, gz, wx, wy, wz, two = 0, twoD = 0.12, twoX = 0, twoY = 0) {
  Object.assign(P, { ik: 1, gx, gy, gz, wcx: wx, wcy: wy, wcz: wz, wm: 0, two, twoD, twoX, twoY });
}
function armsCrossed(P) { setArm(P, 'L', 0.62, 0.12, 0.95, 0.5, 2.05, 0); setArm(P, 'R', 0.55, 0.12, 0.95, 0.4, 2.1, 0); }
function armsRest(P) { setArm(P, 'L', 0.06, 0.13, 0, 0.15, 0.18, 0); setArm(P, 'R', 0.06, 0.13, 0, 0.15, 0.18, 0); }
const ACTS = {
  idle_crossed(P, t, c) { armsCrossed(P); P.hY += wave(t, 0.4, c.zv.seed) * 0.25; },
  idle_hips(P, t, c) { setArm(P, 'L', 0.15, 0.55, 0, 1.6, 1.75, 0.3); setArm(P, 'R', 0.15, 0.55, 0, 1.6, 1.75, 0.3); P.hY += wave(t, 0.35, c.zv.seed) * 0.3; },
  idle_pockets(P, t, c) { setArm(P, 'L', -0.05, 0.1, 0.12, 0.3, 0.45, 0); setArm(P, 'R', -0.05, 0.1, 0.12, 0.3, 0.45, 0); P.hP += 0.06; P.hY += wave(t, 0.3, c.zv.seed) * 0.2; },
  wring(P, t) { grip(P, -0.04 + wave(t, 3) * 0.02, -0.3, 0.27, 0.9, 0, 0.3, 1, 0.07, 0, 0); P.hP += 0.2; P.hY += wave(t, 1.1) * 0.15; },
  pace(P) { setArm(P, 'L', -0.45, 0.12, -0.25, 0.4, 1.45, 0); setArm(P, 'R', -0.45, 0.12, -0.25, 0.4, 1.45, 0); P.hP += 0.18; },
  lean(P, t, c) { armsCrossed(P); P.sP -= 0.08; P.lHF = 0.35; P.lK = 0.7; P.lA = 0.3; P.lHA = -0.05; P.hY += wave(t, 0.3, c.zv.seed) * 0.2; },
  talk(P, t, c) {
    const a = c.zv.seed;
    setArm(P, 'R', 0.45 + wave(t, 2.1, a) * 0.25, 0.22, 0.25, 0.1, 1.25 + wave(t, 3.2, a) * 0.3, 0.3);
    setArm(P, 'L', 0.3 + wave(t, 1.7, a + 1) * 0.15, 0.2, 0.2, 0.1, 1.0 + wave(t, 2.6, a) * 0.2, 0.3);
    P.hP += wave(t, 2.4, a) * 0.06; P.hR += wave(t, 1.3, a) * 0.06; P.cY += wave(t, 0.9, a) * 0.06;
  },
  listen(P, t, c) { armsCrossed(P); P.hR += 0.12; P.hP += Math.max(0, wave(t, 1.6, c.zv.seed)) * 0.12; },
  argue(P, t, c) {
    const jab = Math.max(0, wave(t, 4.5, c.zv.seed));
    setArm(P, 'R', 1.25 + jab * 0.18, 0.1, 0.3, 0, 0.25 + (1 - jab) * 0.35, 0);
    setArm(P, 'L', 0.15, 0.55, 0, 1.6, 1.75, 0.3);
    P.cP += 0.12; P.hP -= 0.1; P.cY -= 0.12;
  },
  shrug(P, t) { const k = Math.max(0, wave(t, 2)); setArm(P, 'L', 0.25, 0.5, 0, 1.2, 1.4, 0.4); setArm(P, 'R', 0.25, 0.5, 0, 1.2, 1.4, 0.4); P.hR += 0.15 * k; },
  warm_hands(P, t) { setArm(P, 'L', 1.0, 0.08, 0.3, 0.2, 0.75 + wave(t, 3) * 0.1, -0.4); setArm(P, 'R', 1.0, 0.08, 0.3, 0.2, 0.75 - wave(t, 3) * 0.1, -0.4); P.cP += 0.12; P.hP += 0.2; },
  cook(P, t) {
    grip(P, -0.06 + Math.cos(t * 3.2) * 0.05, -0.27, 0.4 + Math.sin(t * 3.2) * 0.04, 0.05, -0.75, 0.66);
    setArm(P, 'L', 0.75, 0.12, 0.35, 0.1, 1.25, 0); P.cP += 0.15; P.hP += 0.3;
  },
  chop(P, t, c) {
    const u = ((t * 0.62 + c.zv.seed) % 1 + 1) % 1;
    const up = u < 0.5 ? Math.sin((u / 0.5) * Math.PI / 2) : u < 0.6 ? 1 - (u - 0.5) / 0.1 : 0;
    const k = up;
    grip(P, -0.04, lerp(-0.42, 0.42, k), lerp(0.6, 0.06, k), 0, lerp(-0.55, 0.62, k), lerp(0.84, -0.78, k), 1, 0.3, 0, 0);
    P.cP += lerp(0.5, -0.12, k); P.sP += lerp(0.15, 0, k); P.hP += lerp(0.2, -0.2, k);
    const knee = lerp(0.35, 0.05, k); P.lK += knee; P.rK += knee; P.lHF += knee * 0.5; P.rHF += knee * 0.5;
  },
  hammer(P, t) {
    const h = Math.abs(Math.sin(t * 4.2));
    grip(P, -0.12, -0.2 + h * 0.16, 0.48, 0, -0.2 + h * 0.6, 0.98 - h * 0.3);
    setArm(P, 'L', 0.9, 0.05, 0.45, 0.2, 0.65, 0); P.cP += 0.2; P.hP += 0.35;
  },
  inspect(P, t) {
    const k = (Math.sin(t * 0.8) + 1) / 2;
    grip(P, -0.15 + k * 0.1, lerp(-0.3, 0.15, k), 0.5, 0, 0.2, 1);
    setArm(P, 'L', 0.2, 0.15, 0.1, 0, 0.6, 0); P.hP += lerp(0.25, -0.05, k);
  },
  sweep(P, t) {
    const s = Math.sin(t * 2.4);
    grip(P, -0.05 + s * 0.18, -0.3, 0.33, 0.25 * s, -0.86, 0.45, 1, 0.42, 0, 0);
    P.cP += 0.2; P.cY += s * 0.15;
  },
  carry(P) { grip(P, -0.17, -0.1, 0.34, -1, 0, 0, 1, 0.34, 0, 0); P.sP -= 0.05; },
  guard(P, t, c) {
    grip(P, -0.12, -0.18, 0.33, 0.18, -0.32, 0.93, 1, 0.33, 0, 0);
    P.hY += Math.sin(t * 0.32 + c.zv.seed) * 0.65; P.cY += Math.sin(t * 0.32 + c.zv.seed) * 0.15;
  },
  smoke(P, t, c) {
    const u = ((t / 7 + c.zv.seed) % 1 + 1) % 1, up = u < 0.18 ? Math.sin((u / 0.18) * Math.PI) : 0;
    grip(P, lerp(-0.2, -0.05, up), lerp(-0.32, 0.24, up), lerp(0.14, 0.13, up), 0, 0.2, 1);
    setArm(P, 'L', 0.55, 0.12, 0.95, 0.4, 2.0, 0); P.hP -= up * 0.15;
  },
  drink(P, t, c) {
    const u = ((t / 6 + c.zv.seed) % 1 + 1) % 1, up = u < 0.25 ? Math.sin((u / 0.25) * Math.PI) : 0;
    grip(P, lerp(-0.16, -0.05, up), lerp(-0.2, 0.24, up), lerp(0.28, 0.15, up), 0, 1, 0.05);
    setArm(P, 'L', 0.06, 0.15, 0, 0.15, 0.25, 0); P.hP -= up * 0.35;
  },
  pray(P) { grip(P, -0.01, -0.02, 0.24, 0, 0.98, 0.15, 1, 0, 0.02, 0); P.hP += 0.5; P.cP += 0.08; },
  stretch(P, t) { const k = Math.max(0, Math.sin(t * 0.7)); setArm(P, 'L', lerp(0.1, 2.9, k), 0.25, 0, 0, lerp(0.2, 0.25, k), 0); setArm(P, 'R', lerp(0.1, 2.9, k), 0.25, 0, 0, lerp(0.2, 0.25, k), 0); P.sP -= 0.12 * k; P.hP -= 0.3 * k; },
  wave(P, t) { setArm(P, 'R', 2.55, 0.45, 0, -0.4, 0.55 + Math.sin(t * 9) * 0.35, 0); },
  cheer(P, t) { const b = Math.abs(Math.sin(t * 6)); setArm(P, 'L', 2.8, 0.35, 0, 0, 0.3 + b * 0.3, 0); setArm(P, 'R', 2.8, 0.35, 0, 0, 0.3 + b * 0.3, 0); P.hP -= 0.2; },
  cry(P, t) { grip(P, -0.03, 0.2, 0.15, 0, 1, 0, 1, 0, 0.07, 0); P.hP += 0.45; P.cP += 0.2; P.cR += Math.sin(t * 13) * 0.03; },
  fight(P, t, c, st) {
    const a = st.attack != null && st.attack >= 0 ? Math.sin(Math.min(1, st.attack) * Math.PI) : 0;
    grip(P, -0.1, 0.18, 0.24 + a * 0.32, 0, 0.3, 1);
    setArm(P, 'L', 1.25, 0.2, 0.45, 0.3, 2.1 - a * 0.2, 0);
    P.lK += 0.25; P.rK += 0.25; P.lHF += 0.15; P.rHF += 0.15; P.cY += 0.25 - a * 0.4; P.cP += 0.12; P.hP += 0.1;
    P.hY += Math.sin(t * 2.5) * 0.08;
  },
  kneel_work(P, t) {
    Object.assign(P, { lHF: 1.45, lHA: 0.12, lK: 1.55, lA: 0.35, rHF: -0.05, rHA: 0.08, rK: 1.65, rA: -0.55, pY: 0.1, sP: 0.28, cP: 0.32, hP: 0.3, lift: 0, px: 0, pR: 0 });
    grip(P, -0.08 + Math.sin(t * 2.2) * 0.08, -0.55, 0.42 + Math.cos(t * 1.7) * 0.06, 0, -0.6, 0.8);
    setArm(P, 'L', 1.1 + Math.sin(t * 2.6) * 0.15, 0.08, 0.3, 0.3, 0.5, 0.2);
  },
  tend_fire(P, t) {
    Object.assign(P, { lHF: 1.45, lHA: 0.12, lK: 1.55, lA: 0.35, rHF: -0.05, rHA: 0.08, rK: 1.65, rA: -0.55, pY: 0.1, sP: 0.2, cP: 0.25, hP: 0.3, lift: 0, px: 0, pR: 0 });
    grip(P, -0.1, -0.4 + Math.sin(t * 1.5) * 0.05, 0.42 + Math.sin(t * 1.5) * 0.08, 0, -0.55, 0.84);
    setArm(P, 'L', 0.6, 0.12, 0.3, 0.2, 1.1, 0);
  },
  sit_chair(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.47); setArm(P, 'L', 0.55, 0.12, 0.15, 0.2, 1.0, 0); setArm(P, 'R', 0.55, 0.12, 0.15, 0.2, 1.0, 0); P.sP = -0.04; P.cP = 0; P.hY += wave(t, 0.25, c.zv.seed) * 0.3; },
  sit_eat(P, t, c, st) {
    sitLegs(P, c, st.seatH ?? 0.47);
    const u = ((t / 4 + c.zv.seed) % 1 + 1) % 1, up = u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
    grip(P, -0.06, lerp(-0.18, 0.2, up), lerp(0.36, 0.16, up), 0, 0.3, 1);
    setArm(P, 'L', 0.85, 0.1, 0.45, 0.2, 1.45, 0); P.cP = 0.15; P.hP = 0.25 - up * 0.2;
  },
  sit_read(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.47); grip(P, -0.06, -0.1, 0.3, 0, 0.55, 0.84, 1, 0, 0.13, 0); P.cP = 0.1; P.hP = 0.45; P.hY = 0; },
  sit_write(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.47); grip(P, -0.08 + Math.sin(t * 5) * 0.03, -0.17, 0.42, 0, -0.5, 0.86); setArm(P, 'L', 0.85, 0.15, 0.35, 0.3, 1.1, 0); P.cP = 0.25; P.hP = 0.4; },
  sit_cards(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.47); const k = Math.max(0, Math.sin(t * 0.9 + c.zv.seed)); grip(P, -0.08, -0.12 + k * 0.05, 0.36 + k * 0.08, 0, 0.6, 0.8, 1, 0, 0.14, 0); P.cP = 0.15; P.hP = 0.3; },
  sit_drink(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.47); ACTS.drink(P, t, c); P.cP = 0.05; },
  sit_ground(P, t, c, st) {
    sitLegs(P, c, (st.seatH ?? 0) + 0.05, 2.0, 2.3); P.lA = P.rA = 0.3;
    setArm(P, 'L', 0.95, 0.25, 0.25, 0.3, 0.75, 0); setArm(P, 'R', 0.95, 0.25, 0.25, 0.3, 0.75, 0);
    P.sP = 0.15; P.cP = 0.12; P.hP = -0.1; P.hY += wave(t, 0.2, c.zv.seed) * 0.3;
  },
  sit_log(P, t, c, st) { sitLegs(P, c, st.seatH ?? 0.42, 1.55, 1.75); P.lA = P.rA = 0.25; setArm(P, 'L', 0.75, 0.15, 0.2, 0.2, 0.9, 0); setArm(P, 'R', 0.75, 0.15, 0.2, 0.2, 0.9, 0); P.sP = 0.2; P.cP = 0.18; P.hP = -0.2; },
  sit_whittle(P, t, c, st) {
    sitLegs(P, c, st.seatH ?? 0.42, 1.55, 1.75); P.lA = P.rA = 0.25;
    grip(P, -0.03 + Math.sin(t * 3.5) * 0.02, -0.3, 0.32, 0.3, 0.5, 0.8, 1, -0.02, 0.07, 0.02);
    P.sP = 0.2; P.cP = 0.22; P.hP = 0.35;
  },
  sleep(P, t) {
    Object.assign(P, { lHF: 0.1, rHF: 0.25, lK: 0.25, rK: 0.5, lA: -0.4, rA: -0.4, lHA: 0.1, rHA: 0.12, px: 0, pR: 0, pY: 0, lift: 0, sP: 0, cP: Math.sin(t * 1.1) * 0.02, hY: 0.6, hP: -0.05, hR: 0.1, sR: 0, cR: 0, cY: 0 });
    setArm(P, 'L', 0.2, 0.35, 0, 0.2, 0.5, 0); setArm(P, 'R', 0.9, 0.1, 0.6, 0.3, 1.6, 0);
    return { lying: true };
  },
};

// small quaternion pool (no per-frame allocation)
const QPOOL = Array.from({ length: 96 }, () => new THREE.Quaternion());
let qp = 0;
const qx = (a) => QPOOL[qp++ % 96].setFromAxisAngle(AX, a);
const qy = (a) => QPOOL[qp++ % 96].setFromAxisAngle(AY, a);
const qz = (a) => QPOOL[qp++ % 96].setFromAxisAngle(AZ, a);
const V = Array.from({ length: 8 }, () => new THREE.Vector3());

export class Character {
  // opts.zombie: { seed, decay, blood, tear, build } for the infected look
  constructor(modelName, palette, opts = {}) {
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
    this.material = makeMaterial(palette, M, opts.zombie || null);
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
    this.root.rotation.order = 'YXZ'; // yaw first, so a fall tips along the facing
    this.root.add(mesh);
    this.restArm = M.restArm;
    this._world = {};
    for (const b of BONES) this._world[b] = new THREE.Quaternion();
    // animation state
    this.P = newPose();
    this.Q = newPose();
    this.ph = Math.random();
    this.clock = Math.random() * 100;
    this.b = { move: 0, run: 0, sprint: 0, crouch: 0, aim: 0, air: 0, search: 0, dead: 0, bat: 0, gun: 0, rifle: 0, look: 0, stagger: 0 };
    this.landK = 0;
    this.wasAir = false;
    this.lookYaw = 0;
    // a zombie's own way of moving
    const r = Math.random;
    this.zv = { reach: r() < 0.62, limpSide: r() < 0.5 ? 'l' : 'r', limp: 0.25 + r() * 0.6, lean: 0.18 + r() * 0.25, tilt: (r() - 0.5) * 0.5, seed: r() * 10 };
    // leg geometry for ground contact (sagittal plane, relative to the hip joint)
    const J = M.joints;
    this.leg = {};
    for (const s of ['L', 'R']) {
      const kv = J['shin' + s].clone().sub(J['thigh' + s]).applyQuaternion(M.hang['thigh' + s]);
      const av = J['foot' + s].clone().sub(J['shin' + s]).applyQuaternion(M.hang['shin' + s]);
      this.leg[s] = {
        knee: [kv.z, kv.y],
        ankle: [av.z, av.y],
        heel: [J['heel' + s].z - J['foot' + s].z, J['heel' + s].y - J['foot' + s].y],
        toe: [J['toeTip' + s].z - J['foot' + s].z, J['toeTip' + s].y - J['foot' + s].y],
        hipY: J['thigh' + s].y,
      };
    }
    this.hipW = (Math.abs(J.thighL.x) + Math.abs(J.thighR.x)) / 2;
    this.legLen = J.thighL.y - J.footL.y + 0.05;
    this.turnLean = 0;
    // where the held weapon sits: root-space position + orientation
    this.grip = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), dir: new THREE.Vector3(0, 0, 1), visible: true };
  }
  // recolour (character creation): skin, shirt, pants, shoes, hair, belt
  setPalette(palette) {
    const cols = this.material.userData.palette;
    palette.forEach((h, i) => { if (cols[i]) cols[i].set(h); });
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

  // Sagittal forward kinematics of one leg: [z, y] of heel, toe and knee
  // relative to the hip joint.
  legFK(s, hip, knee, ankle) {
    const L = this.leg[s];
    const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
    const k = rot(L.knee, hip);
    const sh = hip - knee;
    const a2 = rot(L.ankle, sh);
    const A = [k[0] + a2[0], k[1] + a2[1]];
    const fa = sh + ankle;
    const he = rot(L.heel, fa), to = rot(L.toe, fa);
    return { knee: k, heel: [A[0] + he[0], A[1] + he[1]], toe: [A[0] + to[0], A[1] + to[1]] };
  }

  // st: { speed, mode: 'idle'|'walk'|'zombie'|'dead', attack (0..1|null),
  //       weapon: 'bat'|'gun'|null, aim, aimPitch, crouch, air, vy, search,
  //       stagger (0..1), lookYaw }
  animate(dt, st) {
    dt = Math.min(dt, 0.1);
    qp = 0;
    const P = this.P, b = this.b, zv = this.zv;
    for (const k of POSE_KEYS) P[k] = 0;
    const zombie = st.mode === 'zombie';
    const dead = st.mode === 'dead';
    const sp = dead ? 0 : (st.speed || 0);
    const go = (k, target, rate) => { b[k] += (target - b[k]) * (1 - Math.exp(-rate * dt)); };
    go('move', sp > 0.12 ? 1 : 0, 9);
    go('run', zombie ? sstep(1.9, 3.2, sp) * (zv.type === 'runner' ? 1 : 0.7) : sstep(2.0, 3.1, sp), 6);
    go('sprint', zombie ? 0 : sstep(4.0, 6.0, sp), 5);
    go('crouch', st.crouch ? 1 : 0, 8);
    go('aim', st.aim ? 1 : 0, 12);
    go('air', st.air ? 1 : 0, st.air ? 10 : 18);
    go('search', st.search ? 1 : 0, 6);
    go('dead', dead ? 1 : 0, 3.2);
    go('bat', st.weapon === 'bat' && !zombie ? 1 : 0, 10);
    go('gun', st.weapon === 'gun' && !zombie ? 1 : 0, 10);
    go('rifle', st.weapon === 'rifle' && !zombie ? 1 : 0, 10);
    go('stagger', st.stagger || 0, 14);
    this.clock += dt;
    const t = this.clock;
    if (this.wasAir && !st.air && (st.landV || 0) > 3) this.landK = Math.min(1, (st.landV - 2) / 6);
    this.wasAir = !!st.air;
    this.landK = Math.max(0, this.landK - dt * 3.5);

    // ---------------- locomotion ----------------
    const run = b.run, sprint = b.sprint, mv = b.move;
    const stanceF = lerp(GAIT.walk.stance, GAIT.run.stance, run);
    // short, slow steps when barely moving; long strides when sprinting
    const amp = (zombie ? (zv.type === 'runner' ? 1.05 : zv.type === 'lurcher' ? 0.85 : 0.75) : Math.min(1, 0.5 + sp / 2.8)) * (1 + sprint * 0.22) * (1 - b.crouch * 0.25);
    const gaitAt = (u, s) => {
      const limp = zombie && zv.limpSide === s ? zv.limp : 0;
      let hip = lerp(curve(GAIT.walk.hip, u), curve(GAIT.run.hip, u), run) * amp * (1 - limp * 0.35);
      let knee = lerp(curve(GAIT.walk.knee, u), curve(GAIT.run.knee, u), run) * amp * (1 + sprint * 0.12) * (1 - limp * 0.55);
      let ankle = lerp(curve(GAIT.walk.ankle, u), curve(GAIT.run.ankle, u), run) * amp - limp * 0.25;
      return [hip, knee, ankle];
    };
    // cadence so the planted foot doesn't slide: travel of the contact point
    // during stance must equal the distance the body covers
    if (sp > 0.05) {
      const [h0, k0, a0] = gaitAt(0, 'n'), [h1, k1, a1] = gaitAt(stanceF, 'n');
      const fk0 = this.legFK('L', h0, k0, a0), fk1 = this.legFK('L', h1, k1, a1);
      const travel = Math.max(0.25, fk0.heel[0] - fk1.toe[0]);
      this.ph = (this.ph + dt * sp * stanceF / travel) % 1;
    }
    const uL = this.ph, uR = (this.ph + 0.5) % 1;
    const gL = gaitAt(uL, 'l'), gR = gaitAt(uR, 'r');
    // standing pose: soft knees, feet a little apart, slow weight shift
    const sway = Math.sin(t * 0.55 + zv.seed) * (1 - mv);
    const stand = [0.04, 0.07, 0.03];
    P.lHF = lerp(stand[0] + sway * 0.03, gL[0], mv); P.lK = lerp(stand[1] + Math.max(0, sway) * 0.06, gL[1], mv); P.lA = lerp(stand[2], gL[2], mv);
    P.rHF = lerp(stand[0] - sway * 0.03, gR[0], mv); P.rK = lerp(stand[1] + Math.max(0, -sway) * 0.06, gR[1], mv); P.rA = lerp(stand[2], gR[2], mv);
    // feet come in under the body when moving: steps land near the middle
    const sc = this.model.height / 1.78;
    const footX = lerp(0.11, lerp(0.075, 0.05, run) * (zombie ? 1.5 : 1), mv) * sc;
    const add = Math.atan2(this.hipW - footX, this.legLen);
    P.lHA = -add; P.rHA = -add;
    // weight shifts over the planted foot; the free side's hip drops
    const s2 = Math.sin(uL * Math.PI * 2) * mv;
    P.px = (0.03 - 0.016 * run) * sc * s2 + sway * 0.012;
    P.pR = (0.05 - 0.025 * run) * s2 + sway * 0.025;
    // arms swing against the legs, a beat behind them
    const mid = lerp(9, 13, run) * DEG * amp, half = lerp(19, 31, run) * DEG * amp;
    const lag = 0.035;
    const nL = (gaitAt((uR - lag + 1) % 1, 'r')[0] - mid) / half, nR = (gaitAt((uL - lag + 1) % 1, 'l')[0] - mid) / half;
    for (const [side, n] of [['L', nL], ['R', nR]]) {
      const swingAmp = lerp(0.32, 0.55, run) + sprint * 0.3;
      const f = lerp(0.06, 0.22, run) + swingAmp * n * mv;
      const e = lerp(0.24, 1.45, run) + sprint * 0.15 + (n > 0 ? n * lerp(0.28, 0.3, run) : 0) * mv;
      // the forward swing comes a little across the body
      const across = (lerp(0, 0.2, run) + Math.max(0, n) * lerp(0.12, 0.1, run)) * mv;
      setArm(P, side, f * mv + 0.04 * (1 - mv), lerp(0.14, 0.17, run), across, 0.15, lerp(0.12, e, mv));
      // the shoulder itself rolls forward and back with its arm
      P['s' + side + 'Y'] = -(side === 'L' ? 1 : -1) * 0.13 * n * mv;
    }
    // torso: pelvis turns with the forward leg, chest counter-turns and the
    // spine bends against the hip drop, so the shoulders stay level
    const nLeg = Math.max(-1.2, Math.min(1.2, (gL[0] - mid) / half)) * mv;
    P.pY = -0.1 * nLeg * (1 + run * 0.3);
    P.cY = 0.16 * nLeg * (1 + run * 0.4);
    P.sR = -P.pR * 0.7; P.cR = -P.pR * 0.25;
    const lean = (lerp(0.04, 0.13, run) + sprint * 0.12) * mv;
    P.sP = lean * 0.5; P.cP = lean * 0.5 + Math.sin(t * 1.6) * 0.012 * (1 - mv);
    P.hP = -lean * 0.75;
    // lean into turns
    const turnL = Math.max(-0.25, Math.min(0.25, -(st.turn || 0) * sp * 0.03));
    this.turnLean += (turnL - this.turnLean) * (1 - Math.exp(-6 * dt));
    P.sR += this.turnLean * 0.55; P.cR += this.turnLean * 0.35;
    // run: a little air between steps
    const flightG = (uL % 0.5);
    const st2 = stanceF % 0.5;
    if (flightG > st2) P.lift = run * mv * 0.05 * Math.sin(Math.PI * (flightG - st2) / (0.5 - st2));
    // head looks where the camera looks
    this.lookYaw += ((st.lookYaw || 0) - this.lookYaw) * (1 - Math.exp(-8 * dt));
    const ly = Math.max(-0.9, Math.min(0.9, this.lookYaw));
    P.hY = ly * 0.65 - (P.cY + P.pY) * 0.6; P.cY += ly * 0.2;
    P.hR = -(P.pR + P.sR + P.cR) * 0.7;

    // ---------------- crouch / sneak ----------------
    if (b.crouch > 0.001) {
      const c = b.crouch;
      // a low, forward-leaning stalk rather than a squat
      P.lHF += 0.62 * c; P.rHF += 0.62 * c; P.lK += 0.95 * c; P.rK += 0.95 * c; P.lA += 0.33 * c; P.rA += 0.33 * c;
      P.sP += 0.38 * c; P.cP += 0.42 * c; P.hP -= 0.55 * c;
      P.aLF += 0.3 * c; P.aRF += 0.3 * c; P.aLE += 0.45 * c; P.aRE += 0.45 * c;
    }

    // ---------------- zombie ----------------
    if (zombie) {
      const ty = zv.type || 'shambler';
      const sw = Math.sin(this.ph * Math.PI * 2);
      const lurch = ty === 'lurcher' ? 1 : 0, runner = ty === 'runner' ? 1 : 0;
      const lean = zv.lean + lurch * 0.15 + runner * 0.2 * mv;
      P.sP += lean * 0.5; P.cP += lean * 0.6;
      // the body rolls over each planted foot, harder for a lurcher
      P.cR = sw * (0.12 + lurch * 0.1) * mv + Math.sin(t * 0.7 + zv.seed) * (0.04 + 0.05 * (1 - mv));
      P.pR = -sw * 0.05 * mv;
      P.pY += Math.sin(t * 0.33 + zv.seed) * 0.05 * (1 - mv);
      P.hP = -lean * 0.55 + 0.18 + Math.sin(t * 0.9 + zv.seed) * 0.05 + runner * 0.15;
      P.hR = zv.tilt + Math.sin(t * 0.6 + zv.seed) * 0.08;
      P.hY = Math.sin(t * 0.4 + zv.seed * 2) * 0.12;
      // twitches: a sudden jerk of the head and a shoulder now and then
      this.twitchT = (this.twitchT ?? 1 + Math.random() * 4) - dt;
      if (this.twitchT <= 0) { this.twitchT = 1.5 + Math.random() * 5; this.twitch = 1; this.twitchDir = Math.random() < 0.5 ? -1 : 1; }
      if (this.twitch > 0) {
        this.twitch = Math.max(0, this.twitch - dt * 4.5);
        const k = Math.sin(this.twitch * Math.PI) * this.twitch;
        P.hR += this.twitchDir * 0.45 * k; P.hY += this.twitchDir * 0.3 * k; P.cR += this.twitchDir * 0.08 * k;
        P['s' + (this.twitchDir > 0 ? 'L' : 'R') + 'Y'] = -0.25 * k;
      }
      for (const [side, s] of [['L', 1], ['R', -1]]) {
        const w = Math.sin(t * 1.3 + zv.seed + s);
        if (runner) {
          // clawing forward as it runs
          const pump = Math.sin(this.ph * Math.PI * 2 + (s > 0 ? Math.PI : 0));
          setArm(P, side, 1.15 + pump * 0.35 * mv, 0.2, 0.15, 0.2, 0.7 + pump * 0.25, 0.3);
        } else if (lurch) {
          // arms thrown about by the lurching body
          const swing = (s > 0 ? -sw : sw) * 0.55 * mv;
          setArm(P, side, 0.15 + swing + Math.abs(w) * 0.1, 0.22 + Math.abs(sw) * 0.15 * mv, 0.05, 0.4, 0.25 + Math.max(0, swing) * 0.5, 0.25);
        } else if (zv.reach) setArm(P, side, 1.25 + w * 0.08 + sw * s * 0.06 * mv, 0.12, 0.12, 0.2, 0.32 + w * 0.12, 0.35);
        else setArm(P, side, 0.06 + (s > 0 ? -sw : sw) * 0.3 * mv, 0.16, 0, 0.3, 0.18 + Math.abs(w) * 0.1, 0.2);
      }
      if (st.attack != null && st.attack >= 0) {
        const Q = this.Q; Object.assign(Q, P);
        playKeys(Q, ZOMBIE_GRAB, st.attack);
        Object.assign(P, Q);
      }
    }

    // ---------------- held weapons ----------------
    if (b.bat > 0.001) {
      const Q = this.Q; Object.assign(Q, P);
      Object.assign(Q, BAT_CARRY);
      // the carrying hand moves a little with the stride
      Q.gy += Math.abs(nR) * 0.015 * mv; Q.gz += nR * 0.02 * mv;
      // leaning forward: keep the bat's slope in world terms so it stays
      // back over the shoulder instead of standing up beside the head
      Q.wrx = -0.2; Q.wry = 0.5; Q.wrz = -0.84; Q.wm = b.crouch * 0.85;
      Q.gy -= 0.04 * b.crouch; Q.gx -= 0.02 * b.crouch;
      mixKeys(P, Q, b.bat, WEAPON);
      if (st.attack != null && st.attack >= 0 && st.weapon === 'bat') {
        // torso turns are added on top of whatever the legs are doing
        const tb = [P.cY, P.sY, P.pY, P.cP];
        P.cY = 0; P.sY = 0; P.pY = 0; P.cP = 0;
        playKeys(P, BAT_SWING, st.attack);
        P.cY += tb[0] * 0.3; P.sY += tb[1]; P.pY += tb[2] * 0.5; P.cP += tb[3];
      }
    }
    if (b.gun > 0.001) {
      const Q = this.Q; Object.assign(Q, P);
      // low ready: pistol forward and down in the right hand
      Object.assign(Q, { ik: 1, gx: -0.13, gy: -0.3, gz: 0.3 + nR * 0.02 * mv, wcx: 0.06, wcy: -0.5, wcz: 0.86, wm: 0, two: 0, twoD: 0, twoX: 0.035, twoY: -0.045 });
      // aiming: both hands out along the line of sight, sights under the eye
      const pitch = st.aimPitch || 0;
      const chestP = P.cP + P.sP;
      const cpitch = pitch - chestP;
      const reach = 0.5;
      const ax = -0.05, ay = 0.2 + Math.sin(cpitch) * reach, az = Math.cos(cpitch) * reach;
      Q.gx = lerp(Q.gx, ax, b.aim); Q.gy = lerp(Q.gy, ay, b.aim); Q.gz = lerp(Q.gz, az, b.aim);
      Q.wrx = 0; Q.wry = Math.sin(pitch); Q.wrz = Math.cos(pitch); Q.wm = b.aim; Q.two = b.aim;
      Q.hP = lerp(Q.hP, -pitch * 0.6 - chestP * 0.5, b.aim); Q.cY = lerp(Q.cY, 0.12, b.aim); Q.hY = lerp(Q.hY, -0.1, b.aim);
      for (const k of ARM_L) Q[k] = lerp(P[k], 0, 0);
      // recoil kick when a shot goes off
      if (st.attack != null && st.attack >= 0) {
        const k = Math.max(0, 1 - st.attack * 3.5);
        Q.gy += 0.05 * k; Q.gz -= 0.06 * k; Q.wry += 0.25 * k; Q.wcy += 0.3 * k; Q.cP -= 0.04 * k;
      }
      mixKeys(P, Q, b.gun, [...WEAPON, 'hP', 'cY', 'hY', 'cP']);
    }
    if (b.rifle > 0.001) {
      const Q = this.Q; Object.assign(Q, P);
      // low ready: across the body, muzzle forward and down to the left,
      // the support hand out on the handguard
      Object.assign(Q, { ik: 1, gx: -0.12, gy: -0.15, gz: 0.24 + nR * 0.015 * mv, wcx: 0.3, wcy: -0.4, wcz: 0.87, wm: 0, two: 1, twoD: -0.3, twoX: 0.0, twoY: 0.03 });
      // aiming: stock in the shoulder, cheek down to the sights
      const pitch = st.aimPitch || 0;
      const chestP = P.cP + P.sP;
      const cpitch = pitch - chestP;
      const reach = 0.25;
      const ax = -0.1, ay = 0.16 + Math.sin(cpitch) * reach, az = Math.cos(cpitch) * reach;
      Q.gx = lerp(Q.gx, ax, b.aim); Q.gy = lerp(Q.gy, ay, b.aim); Q.gz = lerp(Q.gz, az, b.aim);
      Q.wrx = 0; Q.wry = Math.sin(pitch); Q.wrz = Math.cos(pitch); Q.wm = b.aim;
      Q.twoD = lerp(-0.3, -0.33, b.aim); Q.twoY = lerp(0.03, 0.045, b.aim);
      Q.hP = lerp(Q.hP, -pitch * 0.7 - chestP * 0.5 + 0.1, b.aim); Q.hR = lerp(Q.hR, 0.14, b.aim);
      Q.cY = lerp(Q.cY, 0.22, b.aim); Q.hY = lerp(Q.hY, -0.2, b.aim);
      // the kick into the shoulder
      if (st.attack != null && st.attack >= 0) {
        const k = Math.max(0, 1 - st.attack * 3.5) * (st.recoil ?? 1);
        Q.gz -= 0.05 * k; Q.gy += 0.02 * k; Q.wry += 0.14 * k; Q.cP -= 0.05 * k; Q.cY -= 0.04 * k;
      }
      mixKeys(P, Q, b.rifle, [...WEAPON, 'hP', 'hR', 'cY', 'hY', 'cP']);
    }
    if (!zombie && b.bat < 0.5 && b.gun < 0.5 && b.rifle < 0.5 && st.attack != null && st.attack >= 0) {
      // bare-handed shove
      const a = st.attack, k = a < 0.35 ? sstep(0, 0.35, a) : 1 - sstep(0.45, 1, a);
      P.aRF = lerp(P.aRF, 1.45, k); P.aRE = lerp(P.aRE, 0.15, k); P.aLF = lerp(P.aLF, 1.35, k); P.aLE = lerp(P.aLE, 0.2, k); P.cP += 0.15 * k;
    }

    // ---------------- everyday actions (camp life) ----------------
    const acts = this.acts || (this.acts = {});
    const want = st.act && ACTS[st.act] ? st.act : null;
    if (want && !(want in acts)) acts[want] = 0;
    let lying = 0;
    for (const k in acts) {
      acts[k] += ((k === want ? 1 : 0) - acts[k]) * (1 - Math.exp(-(k === want ? 5 : 7) * dt));
      if (k !== want && acts[k] < 0.003) { delete acts[k]; continue; }
      const Q = this.Q; Object.assign(Q, P);
      const r = ACTS[k](Q, t, this, st);
      const w = acts[k];
      for (const key of POSE_KEYS) P[key] = lerp(P[key], Q[key], w);
      if (r && r.lying) lying = Math.max(lying, w);
    }
    this.lying = lying;

    // ---------------- searching (kneel and rummage) ----------------
    if (b.search > 0.001) {
      const Q = this.Q; Object.assign(Q, P);
      const r1 = Math.sin(t * 7), r2 = Math.sin(t * 6.1 + 1.3);
      Object.assign(Q, { lHF: 1.45, lHA: 0.12, lK: 1.55, lA: 0.35, rHF: -0.05, rHA: 0.08, rK: 1.65, rA: -0.55,
        pY: 0.1, pP: 0, sP: 0.28, cP: 0.32, cY: 0.05, hP: 0.15, hY: 0, lift: 0 });
      setArm(Q, 'L', 1.05 + r1 * 0.12, 0.05, 0.35, 0.3, 0.55 + r2 * 0.2, 0.2);
      if (b.bat > 0.5 || b.gun > 0.5) Object.assign(Q, { ik: 1, gx: -0.22, gy: -0.42, gz: 0.25, wcx: -0.15, wcy: -0.75, wcz: 0.65, wm: 0, two: 0 });
      else { setArm(Q, 'R', 1.0 + r2 * 0.12, 0.05, 0.35, 0.3, 0.6 + r1 * 0.2, 0.2); Q.ik = 0; }
      mixKeys(P, Q, b.search, [...TORSO, ...LEGS, ...ARM_L, ...ARM_R, ...WEAPON, 'lift']);
    }

    // ---------------- airborne & landing ----------------
    if (b.air > 0.001) {
      const up = Math.max(0, Math.min(1, ((st.vy || 0) + 2) / 6));
      const Q = this.Q; Object.assign(Q, P);
      Object.assign(Q, { lHF: lerp(0.35, 0.75, up), lK: lerp(0.45, 1.0, up), lA: 0.1, rHF: lerp(0.05, 0.25, up), rK: lerp(0.3, 0.8, up), rA: -0.1, lift: 0 });
      Q.aLA = 0.55; Q.aLF = 0.35; Q.aLE = 0.5;
      if (b.bat < 0.5 && b.gun < 0.5) { Q.aRA = 0.55; Q.aRF = 0.3; Q.aRE = 0.5; }
      mixKeys(P, Q, b.air, [...LEGS, 'aLA', 'aLF', 'aLE', 'aRA', 'aRF', 'aRE', 'lift']);
    }
    if (this.landK > 0) {
      const k = Math.sin(Math.min(1, this.landK) * Math.PI * 0.5);
      P.lHF += 0.5 * k; P.rHF += 0.5 * k; P.lK += 0.9 * k; P.rK += 0.9 * k; P.lA += 0.35 * k; P.rA += 0.35 * k; P.cP += 0.2 * k;
    }

    // ---------------- hit reaction ----------------
    if (b.stagger > 0.001) {
      const k = b.stagger;
      P.cP -= 0.45 * k; P.sP -= 0.2 * k; P.hP -= 0.22 * k; P.cR += 0.15 * k;
      P.aLA += 0.6 * k; P.aRA += 0.5 * k; P.aLF -= 0.5 * k; P.aRF -= 0.4 * k; P.aLE += 0.3 * k; P.aRE += 0.3 * k;
      P.lHF -= 0.15 * k; P.rHF += 0.2 * k; P.rK += 0.3 * k;
    }

    // ---------------- dead (on the back; the owner tips the root over) ----------------
    if (b.dead > 0.001) {
      const Q = this.Q;
      for (const k of POSE_KEYS) Q[k] = 0;
      if ((st.deadDir || -1) > 0) {
        // face down: legs out straight, arms flung up past the head, head turned
        Object.assign(Q, { lHF: -0.08, lHA: 0.12, lK: 0.25, lA: -0.6, rHF: 0.05, rHA: 0.22, rK: 0.4, rA: -0.6,
          hY: 0.9, hR: 0.1, hP: -0.25, cR: -0.05 });
        setArm(Q, 'L', 2.6, 0.45, 0, 0, 0.6, 0.2);
        setArm(Q, 'R', 0.3, 0.55, 0, 0.6, 0.5, 0.1);
      } else {
        Object.assign(Q, { lHF: 0.25, lHA: 0.14, lK: 0.45, lA: -0.2, rHF: 0.08, rHA: 0.2, rK: 0.18, rA: -0.3,
          hY: 0.55, hR: 0.15, hP: -0.1, cR: 0.06 });
        setArm(Q, 'L', 0.15, 0.95, 0, 0.3, 0.45, 0.2);
        setArm(Q, 'R', 0.25, 0.7, 0, -0.2, 0.25, 0.1);
      }
      for (const k of WEAPON) Q[k] = P[k];
      Q.ik = 0; Q.two = 0;
      const k = sstep(0, 1, b.dead);
      for (const key of POSE_KEYS) P[key] = lerp(P[key], Q[key], k);
    }

    // lean comes from the hips as well as the back
    const tl = P.sP + P.cP;
    P.pP += tl * 0.45; P.sP *= 0.55; P.cP *= 0.55;
    this.buildPose(P, b.dead < 0.5 && b.air < 0.9 && this.lying < 0.5);
  }

  // Turn the angle set into bone rotations, keep the lowest foot on the
  // ground, solve arm IK for held items, and work out where the item goes.
  buildPose(P, ground) {
    const W = this._world, J = this.model.joints, hg = this.model.hang;
    const legBase = TQ1.copy(W.hips.identity().multiply(qy(P.pY)).multiply(qz(P.pR)));
    W.hips.multiply(qx(P.pP));
    W.spine.copy(W.hips).multiply(qy(P.sY)).multiply(qx(P.sP)).multiply(qz(P.sR));
    W.chest.copy(W.spine).multiply(qy(P.cY)).multiply(qx(P.cP)).multiply(qz(P.cR));
    W.neck.copy(W.chest).multiply(qx(P.hP * 0.35)).multiply(qy(P.hY * 0.3));
    W.head.copy(W.chest).multiply(qy(P.hY)).multiply(qx(P.hP)).multiply(qz(P.hR));
    // legs: thigh = pelvis yaw/roll * abduction * flexion; knee and ankle hinge
    // legs keep their own line: undo the pelvis roll and sideways shift
    const shiftA = P.px / this.legLen;
    for (const [side, sg, k] of [['L', 1, 'l'], ['R', -1, 'r']]) {
      const ha = P[k + 'HA'] - sg * P.pR - sg * shiftA;
      const th = TQ3.copy(legBase).multiply(qz(sg * ha)).multiply(qx(-P[k + 'HF']));
      W['thigh' + side].copy(th).multiply(hg['thigh' + side]);
      th.multiply(qx(P[k + 'K']));
      W['shin' + side].copy(th).multiply(hg['shin' + side]);
      W['foot' + side].copy(th).multiply(qx(-P[k + 'A']));
    }
    // ground contact: lowest heel, toe or kneeling knee rests on y = 0
    let off = 0;
    if (ground) {
      let lowest = Infinity;
      for (const [side, k] of [['L', 'l'], ['R', 'r']]) {
        const fk = this.legFK(side, P[k + 'HF'], P[k + 'K'], P[k + 'A']);
        const hy = this.leg[side].hipY;
        lowest = Math.min(lowest, hy + fk.heel[1], hy + fk.toe[1], hy + fk.knee[1] - 0.05);
      }
      off = -lowest;
      if (P.sitW > 0.001) off = lerp(off, P.sitH - J.hips.y, Math.min(1, P.sitW));
    }
    const hipsPos = V[7].set(J.hips.x + P.px, J.hips.y + off + P.lift, J.hips.z);
    this.bones.hips.position.copy(hipsPos);
    const chestPos = V[0].copy(hipsPos)
      .add(V[1].copy(J.spine).sub(J.hips).applyQuaternion(W.hips))
      .add(V[1].copy(J.chest).sub(J.spine).applyQuaternion(W.spine));
    // arms: hang from the rest pose, then shoulder (yaw across the body,
    // abduction, flexion, roll), elbow hinge, wrist
    for (const [side, sg] of [['L', 1], ['R', -1]]) {
      const a = 'a' + side;
      const base = TQ2.copy(W['shoulder' + side].copy(W.chest).multiply(qy(P['s' + side + 'Y'])));
      base.multiply(qy(-sg * P[a + 'Y'])).multiply(qz(sg * P[a + 'A'])).multiply(qx(-P[a + 'F'])).multiply(qy(-sg * P[a + 'R']));
      W['upperArm' + side].copy(base).multiply(hg['upperArm' + side]);
      const fore = base.multiply(qx(-P[a + 'E']));
      W['foreArm' + side].copy(fore).multiply(hg['foreArm' + side]);
      W['hand' + side].copy(fore).multiply(qx(-P[a + 'W'])).multiply(hg['hand' + side]);
    }
    // item direction (root space)
    const dc = V[2].set(P.wcx, P.wcy, P.wcz);
    if (dc.lengthSq() < 1e-6) dc.set(0, -0.5, 0.86);
    dc.normalize().applyQuaternion(W.chest);
    const dr = V[3].set(P.wrx, P.wry, P.wrz);
    if (dr.lengthSq() < 1e-6) dr.copy(dc);
    const dir = this.grip.dir.copy(dc).lerp(dr.normalize(), P.wm).normalize();
    // IK: right fist to the grip target, left hand onto the handle
    if (P.ik > 0.001) {
      const sc = this.model.height / 1.78;
      const tgt = V[4].set(P.gx * sc, P.gy * sc, P.gz * sc).applyQuaternion(W.chest).add(chestPos);
      this.armIK('R', tgt, chestPos, P.ik);
      if (P.two > 0.001) {
        const side = V[5].set(1, 0, 0).applyQuaternion(W.chest);
        const up = V[6].set(0, 1, 0).applyQuaternion(W.chest);
        const lt = V[4].copy(this.fistPos('R', chestPos)).addScaledVector(dir, -P.twoD).addScaledVector(side, P.twoX).addScaledVector(up, P.twoY);
        this.armIK('L', lt, chestPos, P.two);
      }
    }
    this.applyWorld(W);
    // held item: in the right fist, pointing along dir
    this.grip.pos.copy(this.fistPos('R', chestPos));
    const up = V[4].set(0, 1, 0).applyQuaternion(W.chest);
    const x = V[5].crossVectors(up, dir);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = V[6].crossVectors(dir, x).normalize();
    M4.makeBasis(x, y, dir);
    this.grip.quat.setFromRotationMatrix(M4);
  }

  // shoulder joint position (root space) for the current chest rotation
  shoulderPos(side, chestPos, out = TV1) {
    const J = this.model.joints, W = this._world;
    out.copy(J['shoulder' + side]).sub(J.chest).applyQuaternion(W.chest).add(chestPos);
    return out.add(TV3.copy(J['upperArm' + side]).sub(J['shoulder' + side]).applyQuaternion(W['shoulder' + side]));
  }
  // centre of the fist from the current arm rotations
  fistPos(side, chestPos, out = TV2) {
    const J = this.model.joints, W = this._world;
    this.shoulderPos(side, chestPos, out);
    out.add(TV3.copy(J['foreArm' + side]).sub(J['upperArm' + side]).applyQuaternion(W['upperArm' + side]));
    out.add(TV3.copy(J['hand' + side]).sub(J['foreArm' + side]).applyQuaternion(W['foreArm' + side]));
    out.add(TV3.copy(J['handTip' + side]).sub(J['hand' + side]).multiplyScalar(0.5).applyQuaternion(W['hand' + side]));
    return out;
  }
  // Two-bone arm IK: put the fist on target (root space), elbow down and
  // out; blends with the angle-based arm by weight.
  armIK(side, target, chestPos, weight) {
    const J = this.model.joints, W = this._world, hg = this.model.hang;
    const sg = side === 'L' ? 1 : -1;
    const S = this.shoulderPos(side, chestPos, IK.S);
    const a = J['foreArm' + side].distanceTo(J['upperArm' + side]);
    const b = J['hand' + side].distanceTo(J['foreArm' + side]) + 0.5 * J['handTip' + side].distanceTo(J['hand' + side]);
    const d = IK.d.copy(target).sub(S);
    let dl = d.length();
    if (dl < 1e-5) return;
    const n = d.divideScalar(dl);
    dl = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.002, dl));
    const cosA = (a * a + dl * dl - b * b) / (2 * a * dl), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // elbow hangs down and a little out to the side and back
    const pole = IK.p.set(sg * 0.6, -1, -0.25).applyQuaternion(W.chest);
    pole.addScaledVector(n, -pole.dot(n));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0).addScaledVector(n, -n.y);
    pole.normalize();
    const E = IK.e.copy(S).addScaledVector(n, a * cosA).addScaledVector(pole, a * sinA);
    const T = IK.t.copy(S).addScaledVector(n, dl);
    const dU = IK.u.copy(E).sub(S).normalize();
    const dF = IK.f.copy(T).sub(E).normalize();
    // frames: local -Y along the bone, local +Z the way the elbow bends
    const zU = IK.z.copy(dF).addScaledVector(dU, -dF.dot(dU));
    if (zU.lengthSq() < 1e-6) zU.copy(pole).multiplyScalar(-1);
    zU.normalize();
    const yU = IK.y.copy(dU).negate();
    const xU = IK.x.crossVectors(yU, zU).normalize();
    M4.makeBasis(xU, yU, zU);
    IK.qU.setFromRotationMatrix(M4).multiply(hg['upperArm' + side]);
    const yF = IK.y.copy(dF).negate();
    const zF = IK.z.crossVectors(xU, yF).normalize();
    M4.makeBasis(xU, yF, zF);
    IK.qF.setFromRotationMatrix(M4);
    IK.qH.copy(IK.qF).multiply(hg['hand' + side]);
    IK.qF.multiply(hg['foreArm' + side]);
    W['upperArm' + side].slerp(IK.qU, weight);
    W['foreArm' + side].slerp(IK.qF, weight);
    W['hand' + side].slerp(IK.qH, weight);
  }

  // world position of the right hand (for weapons)
  handWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return out.copy(this.grip.pos).applyMatrix4(this.root.matrixWorld);
  }
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const IDENT = new THREE.Quaternion();
const M4 = new THREE.Matrix4();
const TQ1 = new THREE.Quaternion(), TQ2 = new THREE.Quaternion(), TQ3 = new THREE.Quaternion();
const TV1 = new THREE.Vector3(), TV2 = new THREE.Vector3(), TV3 = new THREE.Vector3();
const IK = { S: new THREE.Vector3(), d: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Vector3(), t: new THREE.Vector3(),
  u: new THREE.Vector3(), f: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
  qU: new THREE.Quaternion(), qF: new THREE.Quaternion(), qH: new THREE.Quaternion() };

// Held weapon meshes: a bat and a pistol, origin at the grip, +Z along the
// weapon. Shared by the player and the animation lab.
export function makeWeaponMeshes() {
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8784a, roughness: 0.55 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const bat = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.016, 0.74, 10), wood);
  barrel.geometry.rotateX(Math.PI / 2); barrel.position.z = 0.27;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 6), wood);
  cap.scale.set(1, 1, 0.45); cap.position.z = 0.64;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8), tape);
  grip.geometry.rotateX(Math.PI / 2); grip.position.z = -0.02;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.025, 10), tape);
  knob.geometry.rotateX(Math.PI / 2); knob.position.z = -0.13;
  bat.add(barrel, cap, grip, knob);
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.4, metalness: 0.6 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.042, 0.19), dark); slide.position.set(0, 0.045, 0.06);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), dark); handle.position.set(0, -0.005, -0.005); handle.rotation.x = -0.25;
  gun.add(slide, handle);
  for (const g of [bat, gun]) g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const group = new THREE.Group();
  group.add(bat, gun);
  // everyday items (origin at the grip, +Z along the item)
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const mk = (geo, mat, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.x = rx; return o; };
  const items = {};
  const add = (name, ...parts) => { const g = new THREE.Group(); g.add(...parts); g.visible = false; group.add(g); items[name] = g; };
  const woodM = M(0x8a6440), steel = M(0x9aa0a6, 0.4, 0.7), darkM = M(0x2a2826, 0.5, 0.4);
  const rod = (len, r, mat, z) => mk(new THREE.CylinderGeometry(r, r, len, 7), mat, 0, 0, z, Math.PI / 2);
  add('axe', rod(0.78, 0.017, woodM, 0.22), mk(new THREE.BoxGeometry(0.02, 0.17, 0.09), steel, 0, 0.06, 0.58));
  add('hammer', rod(0.34, 0.014, woodM, 0.1), mk(new THREE.BoxGeometry(0.03, 0.11, 0.035), darkM, 0, 0.02, 0.27));
  add('spatula', rod(0.3, 0.008, darkM, 0.08), mk(new THREE.BoxGeometry(0.07, 0.006, 0.09), steel, 0, 0, 0.27));
  add('spoon', rod(0.16, 0.005, steel, 0.05), mk(new THREE.SphereGeometry(0.018, 8, 5), steel, 0, 0, 0.14));
  add('knife', rod(0.09, 0.009, woodM, 0.0), mk(new THREE.BoxGeometry(0.004, 0.016, 0.08), steel, 0, 0, 0.08));
  add('stick', rod(0.85, 0.012, woodM, 0.3));
  add('broom', rod(1.35, 0.013, woodM, 0.3), mk(new THREE.BoxGeometry(0.26, 0.04, 0.16), M(0xb89a58, 0.95), 0, 0, 0.98));
  add('book', mk(new THREE.BoxGeometry(0.17, 0.035, 0.23), M(0x6a2a24, 0.8), 0.07, 0, 0.06));
  add('mug', mk(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 10), M(0xd8d2c4, 0.6), 0, 0, 0.05, -Math.PI / 2));
  add('bottle', mk(new THREE.CylinderGeometry(0.034, 0.036, 0.17, 9), M(0x5a3a1a, 0.15, 0.1), 0, 0, 0.06, -Math.PI / 2), mk(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 7), M(0x5a3a1a, 0.15, 0.1), 0, 0, 0.17, -Math.PI / 2));
  add('cigarette', mk(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 5), M(0xf4f0e8), 0.0, 0, 0.04, Math.PI / 2));
  add('cards', mk(new THREE.BoxGeometry(0.07, 0.008, 0.1), M(0xf0ece2, 0.6), 0.05, 0, 0.03));
  add('crate', mk(new THREE.BoxGeometry(0.48, 0.3, 0.34), M(0xc8a878, 0.8), 0, -0.03, -0.17));
  add('rifle', mk(new THREE.BoxGeometry(0.04, 0.07, 0.34), M(0x5a3c24, 0.6), 0, -0.02, -0.12),
    mk(new THREE.BoxGeometry(0.035, 0.05, 0.32), darkM, 0, 0.015, 0.2), rod(0.42, 0.011, darkM, 0.55));
  // ---- guns (origin at the pistol grip, barrel along +Z) ----
  const blk = M(0x1c1d1f, 0.45, 0.55), gry = M(0x3a3c3f, 0.5, 0.5), stl = M(0x5d6064, 0.35, 0.75);
  const wd = M(0x7a4a28, 0.6), wdl = M(0x9a6438, 0.55), olive = M(0x4d4f3a, 0.7), tan = M(0x8a7a5a, 0.75);
  const box = (w, h, d, mat, x, y, z, rx = 0) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx);
  const tube = (r, len, mat, x, y, z, seg = 8) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; };
  const muzzles = { bat: new THREE.Vector3(0, 0, 0.6), gun: new THREE.Vector3(0, 0.045, 0.16) };
  const addGun = (name, mz, ...parts) => { add(name, ...parts); muzzles[name] = new THREE.Vector3(...mz); };
  addGun('1911', [0, 0.045, 0.16], box(0.03, 0.04, 0.2, stl, 0, 0.045, 0.06), box(0.028, 0.1, 0.045, wd, 0, -0.005, -0.005, -0.25), box(0.026, 0.012, 0.05, blk, 0, 0.016, 0.07));
  addGun('uzi', [0, 0.05, 0.24], box(0.046, 0.065, 0.24, blk, 0, 0.05, 0.08), box(0.032, 0.17, 0.042, blk, 0, -0.04, 0.0, -0.08), tube(0.009, 0.06, gry, 0, 0.05, 0.22), box(0.01, 0.02, 0.14, gry, 0, 0.09, 0.07), box(0.02, 0.012, 0.16, stl, 0, 0.06, -0.12));
  const shot = (drum) => [
    box(0.048, 0.07, 0.2, drum ? blk : stl, 0, 0.05, 0.06), tube(0.013, drum ? 0.42 : 0.56, gry, 0, 0.07, drum ? 0.36 : 0.43),
    ...(drum ? [tube(0.085, 0.07, blk, 0, -0.005, 0.13, 14), box(0.018, 0.03, 0.3, stl, 0, 0.035, -0.17), box(0.02, 0.09, 0.03, stl, 0, 0.0, -0.31)]
      : [tube(0.011, 0.42, gry, 0, 0.045, 0.35), box(0.05, 0.05, 0.16, wdl, 0, 0.042, 0.33), box(0.045, 0.1, 0.34, wd, 0, 0.01, -0.21, 0.12)]),
    box(0.03, 0.09, 0.04, drum ? blk : wd, 0, -0.01, -0.01, -0.3),
  ];
  addGun('pump', [0, 0.07, 0.72], ...shot(false));
  addGun('sweeper', [0, 0.07, 0.58], ...shot(true));
  addGun('m4', [0, 0.06, 0.62], box(0.044, 0.07, 0.3, blk, 0, 0.06, 0.06), box(0.052, 0.055, 0.22, gry, 0, 0.06, 0.32), tube(0.008, 0.2, blk, 0, 0.06, 0.52),
    box(0.02, 0.035, 0.16, blk, 0, 0.11, 0.05), box(0.032, 0.15, 0.06, gry, 0, -0.03, 0.13, 0.15), box(0.04, 0.075, 0.22, blk, 0, 0.035, -0.2), box(0.03, 0.09, 0.04, blk, 0, -0.01, -0.01, -0.3));
  addGun('ak', [0, 0.055, 0.62], box(0.046, 0.07, 0.3, stl, 0, 0.055, 0.06), box(0.05, 0.055, 0.2, wdl, 0, 0.05, 0.3), tube(0.008, 0.22, gry, 0, 0.065, 0.51),
    box(0.03, 0.12, 0.055, olive, 0, -0.025, 0.14, 0.25), box(0.03, 0.1, 0.05, olive, 0, -0.11, 0.17, 0.55), box(0.042, 0.1, 0.3, wd, 0, 0.015, -0.2, 0.08), box(0.03, 0.09, 0.04, wd, 0, -0.01, -0.01, -0.3));
  addGun('scout', [0, 0.055, 0.66], box(0.038, 0.07, 0.62, blk, 0, 0.025, 0.04), box(0.04, 0.1, 0.24, blk, 0, 0.005, -0.27, 0.06), tube(0.009, 0.36, gry, 0, 0.055, 0.48),
    tube(0.016, 0.15, blk, 0, 0.095, 0.2), box(0.012, 0.03, 0.012, blk, 0, 0.075, 0.2), tube(0.006, 0.05, stl, 0.03, 0.06, 0.02));
  addGun('long', [0, 0.06, 0.92], box(0.05, 0.075, 0.5, tan, 0, 0.03, 0.12), box(0.05, 0.12, 0.34, tan, 0, 0.005, -0.3, 0.05), tube(0.012, 0.56, gry, 0, 0.06, 0.6),
    tube(0.018, 0.06, blk, 0, 0.06, 0.9), tube(0.022, 0.4, blk, 0, 0.125, 0.12), tube(0.028, 0.08, blk, 0, 0.125, 0.3), tube(0.026, 0.07, blk, 0, 0.125, -0.06),
    box(0.012, 0.035, 0.012, blk, 0, 0.09, 0.12), tube(0.007, 0.05, stl, 0.032, 0.06, 0.02));
  for (const g of Object.values(items)) g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const out = { group, bat, gun, items, muzzle: new THREE.Vector3(0, 0.045, 0.16) };
  out.setItem = (name) => {
    bat.visible = name === 'bat'; gun.visible = name === 'gun';
    for (const [k, g] of Object.entries(items)) g.visible = k === name;
    out.muzzle.copy(muzzles[name] || muzzles.gun);
  };
  // muzzle point in the group's space (follows the item shown)
  return out;
}
export { REG, BONES };
