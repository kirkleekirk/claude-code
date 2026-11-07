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
    else if (/foreArm/.test(primary)) {
      const sd = segDist(p, J['foreArm' + side], J['hand' + side]);
      reg = sd.t > 0.35 ? REG.SKIN : REG.SHIRT;
    } else if (primary === 'head' || primary === 'neck' || (y > 0.85 && !isArm) || (y > 0.83 && Math.abs(p.x) < 0.05 * H && p.z > 0)) {
      reg = REG.SKIN;
      if (y > 0.955 || (y > 0.905 && p.z < faceZ - 0.085 * H)) reg = REG.HAIR;
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
    eyeL: new THREE.Vector3(0.03 * H, 0.938 * H, ze),
    eyeR: new THREE.Vector3(-0.03 * H, 0.938 * H, ze),
    mouth: new THREE.Vector3(0, 0.903 * H, zm),
  };
  return { geo, joints: J, height: H, restArm, hang, face, name };
}

// ---------------- material with palette ----------------
// Character material: per-region palette colours on one shared mesh. Survivors
// get eyes; zombies (z = { seed, decay, blood, tear, build }) get mottled
// grey skin, dark sockets with a faint glow, blood, torn and filthy clothes.
const NOISE_GLSL = `
float zh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float zn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zh3(i), zh3(i + vec3(1,0,0)), f.x), mix(zh3(i + vec3(0,1,0)), zh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(zh3(i + vec3(0,0,1)), zh3(i + vec3(1,0,1)), f.x), mix(zh3(i + vec3(0,1,1)), zh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float zf(vec3 p){ return 0.55 * zn(p) + 0.3 * zn(p * 2.07) + 0.15 * zn(p * 4.3); }
`;
function makeMaterial(palette, model, z = null) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: false });
  const cols = palette.map((h) => new THREE.Color(h));
  m.userData.palette = cols;
  const face = model.face, H = model.height;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPal = { value: cols };
    sh.uniforms.uGore = { value: m.userData.gore || 0 };
    sh.uniforms.uH = { value: H };
    sh.uniforms.uEyeL = { value: face.eyeL };
    sh.uniforms.uEyeR = { value: face.eyeR };
    sh.uniforms.uMouth = { value: face.mouth };
    sh.uniforms.uZ = { value: z ? new THREE.Vector4(z.seed, z.decay, z.blood, z.tear) : new THREE.Vector4() };
    sh.uniforms.uBuild = { value: z ? z.build : 1 };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float region;\nflat varying float vRegion;\nvarying vec3 vLocal;\nuniform float uBuild;\nuniform float uH;')
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
      .replace('#include <common>', '#include <common>\nuniform vec3 uPal[6];\nuniform float uGore;\nuniform float uH;\nuniform vec3 uEyeL;\nuniform vec3 uEyeR;\nuniform vec3 uMouth;\nuniform vec4 uZ;\nflat varying float vRegion;\nvarying vec3 vLocal;\nfloat ch(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }' + NOISE_GLSL)
      .replace('#include <color_fragment>', `
        int ri = int(vRegion + 0.5);
        vec3 pc = uPal[0];
        if (ri == 1) pc = uPal[1]; else if (ri == 2) pc = uPal[2]; else if (ri == 3) pc = uPal[3]; else if (ri == 4) pc = uPal[4]; else if (ri == 5) pc = uPal[5];
        // subtle cloth/skin variation
        float v = 0.92 + 0.08 * ch(floor(vLocal * 40.0));
        vec3 col = pc * v;
        float eyeGlow = 0.0;
        // eyes are matched across the front of the head (x/y only)
        float frontOk = step(uEyeL.z - 0.07 * uH, vLocal.z);
        float de = mix(1.0, min(distance(vLocal.xy, uEyeL.xy), distance(vLocal.xy, uEyeR.xy)) / uH, frontOk);
        ${z ? `
        vec3 P = vLocal / uH + uZ.x;
        vec3 skin = uPal[0] * (0.7 + 0.3 * zf(P * 15.0));
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
          float th = 1.0 - uZ.w * 0.42;
          if (tn > th) col = skin * 0.7;
          else if (tn > th - 0.035) col *= 0.38;
          // blood: splotches soaked in from the collar, a few running drips
          float bl = zf(P * vec3(16.0, 7.0, 16.0) + 11.0);
          float hi = smoothstep(0.55, 0.84, vLocal.y / uH);
          float drip = step(0.93, zn(vec3(P.x * 60.0, 0.0, P.z * 60.0) + 5.0)) * hi * step(0.3, uZ.z);
          if (bl * (0.5 + 0.65 * hi) > 1.0 - uZ.z * 0.36 || drip > 0.5) col = mix(col, vec3(0.2, 0.025, 0.02), 0.82);
        } else if (ri == 4) {
          if (zf(P * 13.0) > 0.66 - uZ.y * 0.1) col = skin * 0.8; // hair coming out in patches
        }
        // mouth: blood down the chin
        vec3 mo = vLocal - uMouth;
        float mw = 0.017 * uH * (0.7 + 0.5 * zn(vec3(vLocal.y * 90.0, 1.0, uZ.x)));
        if (frontOk > 0.5 && abs(mo.x) < mw && mo.y < 0.004 * uH && mo.y > -0.035 * uH * (0.4 + uZ.z) * (0.6 + 0.8 * zn(vec3(vLocal.x * 120.0, 2.0, uZ.x)))) col = mix(col, vec3(0.18, 0.02, 0.02), 0.85);
        // eyes: sunken dark sockets, a dull yellow shine
        if (de < 0.02) { col = mix(vec3(0.04, 0.02, 0.02), col, smoothstep(0.013, 0.02, de)); eyeGlow = 1.0 - smoothstep(0.002, 0.007, de); }
        ` : `
        // eyes
        if (de < 0.0085) col = mix(col * 0.2, col, smoothstep(0.0045, 0.0085, de));
        `}
        diffuseColor.rgb *= col;
        if (uGore > 0.0) {
          float g = ch(floor(vLocal * 9.0));
          if (g > 1.0 - uGore * 0.35) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.04, 0.03), 0.8);
        }
      `)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.8, 0.68, 0.3) * eyeGlow * 0.32;');
  };
  m.customProgramCacheKey = () => (z ? 'holdfast-zombie-v2' : 'holdfast-char-v2');
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
  'ik', 'gx', 'gy', 'gz', 'two', 'twoD', 'twoX', 'twoY', 'px', 'sLY', 'sRY'];
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
    this.b = { move: 0, run: 0, sprint: 0, crouch: 0, aim: 0, air: 0, search: 0, dead: 0, bat: 0, gun: 0, look: 0, stagger: 0 };
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
    if (!zombie && b.bat < 0.5 && b.gun < 0.5 && st.attack != null && st.attack >= 0) {
      // bare-handed shove
      const a = st.attack, k = a < 0.35 ? sstep(0, 0.35, a) : 1 - sstep(0.45, 1, a);
      P.aRF = lerp(P.aRF, 1.45, k); P.aRE = lerp(P.aRE, 0.15, k); P.aLF = lerp(P.aLF, 1.35, k); P.aLE = lerp(P.aLE, 0.2, k); P.cP += 0.15 * k;
    }

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
    this.buildPose(P, b.dead < 0.5 && b.air < 0.9);
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
  // muzzle point in the group's space
  return { group, bat, gun, muzzle: new THREE.Vector3(0, 0.045, 0.16) };
}
export { REG, BONES };
