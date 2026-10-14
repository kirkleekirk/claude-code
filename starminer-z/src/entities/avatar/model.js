// A character on the avatar rig: body, head with the avatar's animated face, hair, clothes, and
// anything extra a look adds (a zombie's long hair, a skeleton's bones), merged into one skinned
// mesh and driven by the pack's animation clips, with a pose layer on top for the things clips
// can't know about (reaching arms, a head turned toward you, a hand on a gun).
//
// look = {
//   sex: 'm' | 'f', skin, height,
//   hair: { style: 'short' | 'bob' | 'none', color },
//   top: { tint }, bottoms: { tint }, shoes: { tint },     a top's tint is its colour; the others'
//                                                            multiply the avatar's own textures
//   face: { eyes, brows, mouth, iris, lip, brow, browThin,    frames of the face atlas and colours
//           white, teeth, socket, eyeScale, irisLo },
//   rot, grime, tear: 0..1, dead skin, filthy clothes and holes in them (zombies); seed varies them
//   aged: old bone (skeletons); bodyPart: the body's material code (see material.js)
//   build: (geometry builder) => extra pieces               see zombie.js and skeleton.js
// }

import * as THREE from 'three';
import { avatarAssets } from './assets.js';
import { makeCharacterMaterial } from './material.js';

export const HEIGHT = 1.2; // the rig is ~1.47 m tall; scaled, an avatar stands ~1.77 m

const _c = new THREE.Color();

// body regions, by the bone a vertex follows most
export const REGION = (name) => {
  if (/HEAD|NECK/.test(name)) return 'neck';
  if (/FING|THUMB|PROP|SPECIAL/.test(name) || /_W__Skeleton$/.test(name)) return 'hand';
  if (/_E_TWIST|_SC_E|_E__/.test(name)) return 'forearm';
  if (/_S__|_SC_S|_SC_TWIST_S|_C__/.test(name)) return 'upperarm';
  if (/_K__|_SC_K/.test(name)) return 'shin';
  if (/_A__|_T__/.test(name)) return 'foot';
  if (/_H__|_SC_H/.test(name)) return 'thigh';
  return 'torso';
};

let regionCache = null;
export function regions() {
  if (regionCache) return regionCache;
  const A = avatarAssets();
  regionCache = {};
  for (const [name, p] of Object.entries(A.parts)) {
    const r = new Array(p.count);
    for (let i = 0; i < p.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) if (p.wt[i * 4 + k] > bw) { bw = p.wt[i * 4 + k]; best = p.idx[i * 4 + k]; }
      r[i] = REGION(A.bones[best]);
    }
    regionCache[name] = r;
  }
  return regionCache;
}

// ---- geometry -----------------------------------------------------------------------------------

// A growing list of vertices in the character format.
export class CharacterGeometryBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.uv1 = []; this.uvB = []; this.uvC = []; this.part = []; this.si = []; this.sw = [];
    this.index = [];
    this.n = 0;
  }

  // Add a part of the rig. color(i) -> [r, g, b]; part(i) -> [code, extra]; keep(tri) -> bool
  addPart(p, { color, part, keep = null, transform = null, uvB = null, uvC = null, uv1 = null }) {
    const o = this.n;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      const nn = [p.nor[i * 3], p.nor[i * 3 + 1], p.nor[i * 3 + 2]];
      if (transform) transform(v, i, nn);
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(nn[0], nn[1], nn[2]);
      const c = color(i);
      this.col.push(c[0], c[1], c[2]);
      this.uv.push(p.uv ? p.uv[i * 2] : 0, p.uv ? p.uv[i * 2 + 1] : 0);
      const a1 = uv1 || p.uv1, ab = uvB || p.decal || p.eye, ac = uvC || p.brow;
      this.uv1.push(a1 ? a1[i * 2] : -1, a1 ? a1[i * 2 + 1] : -1);
      this.uvB.push(ab ? ab[i * 2] : -1, ab ? ab[i * 2 + 1] : -1);
      this.uvC.push(ac ? ac[i * 2] : -1, ac ? ac[i * 2 + 1] : -1);
      const pp = part(i);
      this.part.push(pp[0], pp[1]);
      for (let k = 0; k < 4; k++) { this.si.push(p.idx[i * 4 + k]); this.sw.push(p.wt[i * 4 + k]); }
    }
    const tri = p.index || Uint32Array.from({ length: p.count }, (_, i) => i);
    for (let i = 0; i < tri.length; i += 3) {
      if (keep && !keep(tri[i], tri[i + 1], tri[i + 2])) continue;
      this.index.push(tri[i] + o, tri[i + 1] + o, tri[i + 2] + o);
    }
    this.n += p.count;
    return o;
  }

  // Add a three.js geometry bound rigidly to one bone (positions in bind space).
  addRigid(geo, bone, color, partCode = 0, partExtra = 0) {
    const A = avatarAssets();
    const bi = typeof bone === 'number' ? bone : A.index.get(bone);
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, N = g.attributes.normal;
    const C = g.attributes.color;
    const o = this.n;
    const c = new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      if (C) this.col.push(C.getX(i), C.getY(i), C.getZ(i)); else this.col.push(c.r, c.g, c.b);
      this.uv.push(0, 0); this.uv1.push(-1, -1); this.uvB.push(-1, -1); this.uvC.push(-1, -1);
      this.part.push(partCode, partExtra);
      this.si.push(bi, 0, 0, 0); this.sw.push(1, 0, 0, 0);
      this.index.push(o + i);
    }
    this.n += P.count;
  }

  // Add a three.js geometry (positions in bind space) skinned by weights(x, y, z) -> [[bone, w], ...]
  // (up to four, summing to 1), with colours per vertex if it has them.
  addSkinned(geo, weights, color, partCode = 0, partExtra = 0) {
    const A = avatarAssets();
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, N = g.attributes.normal;
    const C = g.attributes.color;
    const o = this.n;
    const c = new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      if (C) this.col.push(C.getX(i), C.getY(i), C.getZ(i)); else this.col.push(c.r, c.g, c.b);
      this.uv.push(0, 0); this.uv1.push(-1, -1); this.uvB.push(-1, -1); this.uvC.push(-1, -1);
      this.part.push(partCode, partExtra);
      const w = weights(x, y, z);
      for (let k = 0; k < 4; k++) {
        const b = w[k];
        this.si.push(b ? (typeof b[0] === 'number' ? b[0] : A.index.get(b[0])) : 0);
        this.sw.push(b ? b[1] : 0);
      }
      this.index.push(o + i);
    }
    this.n += P.count;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv1, 2));
    geo.setAttribute('aUvB', new THREE.Float32BufferAttribute(this.uvB, 2));
    geo.setAttribute('aUvC', new THREE.Float32BufferAttribute(this.uvC, 2));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    geo.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

const lin = (hex) => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };

export function buildAvatarGeometry(look) {
  const A = avatarAssets();
  const R = regions();
  const sex = look.sex === 'f' ? 'f' : 'm';
  const b = new CharacterGeometryBuilder();
  const skin = lin(look.skin ?? 0xd9a582);
  const hairStyle = look.hair?.style ?? (sex === 'f' ? 'bob' : 'short');
  const hair = lin(look.hair?.color ?? 0x2a1e14);
  const sleeves = look.top?.sleeves;
  const sleeveColor = lin(look.top?.sleeveColor ?? 0x46576a);
  // the body: skin, with long sleeves or gloves painted on when a look asks for them
  const bodyParts = look.bodyOverride || null;
  b.addPart(A.parts[`${sex}_body`], {
    color: (i) => {
      const r = R[`${sex}_body`][i];
      if (sleeves === 'long' && (r === 'forearm' || r === 'upperarm')) return sleeveColor;
      if (look.gloves != null && r === 'hand') return lin(look.gloves);
      return bodyParts ? bodyParts(i, r) : skin;
    },
    part: () => [look.bodyPart ?? (look.rot ? 6 : 0), 0],
    transform: look.bodyTransform ? (v, i, n) => look.bodyTransform(v, R[`${sex}_body`][i], n) : null,
    keep: look.bodyKeep || null,
  });
  // the head, with the face
  const head = A.parts[`${sex}_head`];
  b.addPart(head, {
    color: () => (look.headColor ? lin(look.headColor) : skin),
    part: (i) => [2, head.side ? head.side[i] : 0],
    uv1: head.uv1, uvB: head.eye, uvC: head.brow,
    transform: look.headTransform || null,
  });
  if (hairStyle === 'short') b.addPart(A.parts.m_hair, { color: () => hair, part: () => [0, 0], transform: look.headTransform || null });
  if (hairStyle === 'bob') b.addPart(A.parts.f_hair, { color: () => hair, part: () => [0, 0], transform: look.headTransform || null });
  // clothes, with the avatar's own textures tinted
  for (const [kind, key] of [['top', 'top'], ['bottoms', 'bottoms'], ['shoes', 'shoes']]) {
    const spec = look[key];
    if (spec === null) continue;
    const name = `${sex}_${kind}`;
    const p = A.parts[name];
    const layer = A.clothLayer[name];
    // a top takes its colour outright, keeping the texture's folds and seams; the rest are tinted
    const recolor = spec?.recolor ?? kind === 'top';
    const tint = lin(spec?.tint ?? 0xffffff);
    if (recolor) for (let k = 0; k < 3; k++) tint[k] /= A.clothLum[name];
    b.addPart(p, {
      color: (i) => (spec?.paint ? spec.paint(i, R[name][i], tint) : tint),
      part: () => [recolor ? 5 : 1, layer],
      transform: look.clothTransform ? (v, i, n) => look.clothTransform(v, R[name][i], n, kind) : null,
      keep: spec?.keep || null,
    });
  }
  if (look.build) look.build(b);
  return b.build();
}

// ---- the pose layer -----------------------------------------------------------------------------

let bindCache = null;
function bindPose() {
  if (bindCache) return bindCache;
  const A = avatarAssets();
  const m = new THREE.Matrix4(), s = new THREE.Vector3();
  bindCache = A.boneInverses.map((inv) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    m.copy(inv).invert().decompose(p, q, s);
    return { p, q };
  });
  return bindCache;
}
export function bindPosition(boneName) {
  const A = avatarAssets();
  return bindPose()[A.index.get(boneName)].p.clone();
}

const _qa = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qm = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _mr = new THREE.Matrix4();
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _p4 = new THREE.Vector3(), _p5 = new THREE.Vector3(), _p6 = new THREE.Vector3(), _p7 = new THREE.Vector3(), _p8 = new THREE.Vector3(), _p9 = new THREE.Vector3(), _p10 = new THREE.Vector3(), _p11 = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _ax = new THREE.Vector3(), _up = new THREE.Vector3(), _fo = new THREE.Vector3(), _ha = new THREE.Vector3(), _bd = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const CHAIN = ['BASE', 'BACKA', 'BACKB', 'NECK', 'HEAD', 'LF_C', 'LF_S', 'LF_E', 'LF_W', 'RT_C', 'RT_S', 'RT_E', 'RT_W'].map((n) => `${n}__Skeleton`);

// ---- the character --------------------------------------------------------------------------

export class AvatarModel {
  // shared: { geo, material? } to share a built mesh (a horde of zombies wearing the same look);
  // without a material, the model gets its own over the shared geometry
  constructor(look, sky, terrain, shared = null) {
    const A = avatarAssets();
    this.look = look;
    this.root = new THREE.Group();
    const geo = shared ? shared.geo : buildAvatarGeometry(look);
    const sex = look.sex === 'f' ? 'f' : 'm';
    // a shared geometry with a material of its own (so each can flash, fade and be lit apart)
    const own = !shared?.material;
    this.material = own ? makeCharacterMaterial(sky, terrain, look.faceTex || A.faceTex, A.clothes, { side: THREE.DoubleSide, faceBase: look.faceBase ?? A.faceBase[sex] }) : shared.material;
    if (own && look.face) this.setFace(look.face.eyes ?? 0, look.face.brows ?? 0, look.face.mouth ?? 0);
    if (own && look.face?.iris != null) this.material.uniforms.uIris.value.setHex(look.face.iris);
    if (own) {
      // lips: the girl's own pink, or a deeper shade of the skin
      const u = this.material.uniforms;
      if (look.face?.lip != null) u.uLip.value.setHex(look.face.lip);
      else if (sex === 'f') u.uLip.value.setHex(0xd8607a);
      else u.uLip.value.setHex(look.skin ?? 0xd9a582).multiplyScalar(0.62);
      u.uBrow.value.setHex(look.face?.brow ?? look.hair?.color ?? 0x2a1e14);
      u.uBrowThin.value = look.face?.browThin ? 0.04 : 0;
      if (look.face?.white != null) u.uWhite.value.setHex(look.face.white);
      if (look.face?.teeth != null) u.uTeeth.value.setHex(look.face.teeth);
      u.uSocket.value = look.face?.socket ?? 0;
      u.uEyeScale.value = look.face?.eyeScale ?? 1;
      u.uIrisLo.value = look.face?.irisLo ?? 0.3;
      u.uTear.value = look.tear ?? 0;
      u.uRot.value = look.rot ?? 0;
      u.uAged.value = look.aged ?? 0;
      if (look.face?.nose) u.uNose.value.set(...look.face.nose);
      u.uGrime.value = look.grime ?? 0;
      const sd = look.seed ?? 0;
      u.uSeed.value.set((sd * 0.618) % 7, (sd * 0.414) % 5, (sd * 0.732) % 3);
    }
    if (look.glow) this.material.uniforms.uGlow.value.set(...look.glow);
    const bones = A.rest.map((r, i) => {
      const b = new THREE.Bone();
      b.name = A.bones[i];
      b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s);
      return b;
    });
    A.rest.forEach((r, i) => { if (r.parent >= 0) bones[r.parent].add(bones[i]); });
    this.bones = bones;
    this.byName = Object.fromEntries(bones.map((b) => [b.name, b]));
    const skeleton = new THREE.Skeleton(bones, A.boneInverses);
    const mesh = new THREE.SkinnedMesh(geo, this.material);
    mesh.add(bones[0]);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.6);
    mesh.frustumCulled = true;
    this.mesh = mesh;
    this.scale = HEIGHT * (look.height || 1);
    this.root.scale.setScalar(this.scale);
    this.root.add(mesh);
    this.mixer = new THREE.AnimationMixer(mesh);
    this.actions = {};
    this.current = null;
    this.head = this.byName.HEAD__Skeleton;
    this.hips = this.byName.BASE__Skeleton;
    this.headHeight = 1.32 * this.scale;
    if (look.headScale) this.head.scale.setScalar(look.headScale);
    this.layer = { reach: 0, reachL: null, reachR: null, lift: 0, spread: 0, sway: 0, swayRate: 1, lean: 0, tilt: 0, yaw: 0, pitch: 0, handL: null, handR: null };
    this.time = Math.random() * 10;
    this._saved = new Map();
    this._chain = CHAIN.map((n) => this.byName[n]);
    this._ci = new Map(this._chain.map((b, i) => [b, i]));
    this._clean = 0;
    // the face: a base expression, blinking now and then
    this.face = { eyes: look.face?.eyes ?? 0, brows: look.face?.brows ?? 0, mouth: look.face?.mouth ?? 0 };
    this.blink = 2 + Math.random() * 3;
    this.expr = null;
  }

  setLight(sky, block) { this.material.uniforms.uObjLight.value.set(sky, block); }

  // Atlas cells for the face (frame numbers within each set).
  setFace(eyes, brows, mouth, eyesR = eyes) {
    const F = avatarAssets().face[this.look.sex === 'f' ? 'f' : 'm'];
    const u = this.material.uniforms.uFrames.value;
    u.set(F.eyeL[0] + eyes, F.eyeR[0] + eyesR, F.brow[0] + brows, F.mouth[0] + mouth);
  }

  // Play a short facial expression track: [[ms, eyeL, browL, mouth, eyeR, browR], ...]
  expression(track) { this.expr = { track, t: 0 }; }

  attach(boneName, at = [0, 0, 0], obj = new THREE.Object3D()) {
    const A = avatarAssets();
    const i = A.index.get(boneName);
    new THREE.Matrix4().copy(A.boneInverses[i]).multiply(new THREE.Matrix4().makeTranslation(at[0], at[1], at[2])).decompose(obj.position, obj.quaternion, obj.scale);
    this.bones[i].add(obj);
    return obj;
  }

  hide(boneName) { this.byName[boneName].scale.setScalar(1e-4); }
  show(boneName) { this.byName[boneName].scale.setScalar(1); }

  action(name) {
    let a = this.actions[name];
    if (!a) {
      const clip = avatarAssets().clips[name];
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions[name] = a;
    }
    return a;
  }

  play(name, { fade = 0.25, speed = 1, once = false, at = null, restart = false } = {}) {
    const a = this.action(name);
    if (!a) return null;
    a.enabled = true;
    a.setEffectiveTimeScale(speed);
    a.setEffectiveWeight(1);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (this.current === a && !restart) return a;
    a.reset();
    if (at != null) a.time = at * a.getClip().duration;
    a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    return a;
  }

  update(dt) {
    for (const [b, q] of this._saved) b.quaternion.copy(q);
    this._saved.clear();
    this.mixer.update(dt);
    this.time += dt;
    this._layer();
    // the face
    if (this.expr) {
      const e = this.expr;
      e.t += dt * 1000;
      const tr = e.track;
      let k = 0;
      while (k + 1 < tr.length && tr[k + 1][0] <= e.t) k++;
      const f = tr[k];
      this.setFace(f[1], f[2], f[3], f[4]);
      if (e.t > tr[tr.length - 1][0] + 200) { this.expr = null; this.setFace(this.face.eyes, this.face.brows, this.face.mouth); }
    } else if (this.look.blinks !== false) {
      this.blink -= dt;
      if (this.blink < 0.12 && this.blink > 0) this.setFace(13, this.face.brows, this.face.mouth);
      if (this.blink <= 0) { this.blink = 2.5 + Math.random() * 4; this.setFace(this.face.eyes, this.face.brows, this.face.mouth); }
    }
  }

  lookAt(point, dt = 1, weight = 1) {
    this.mesh.updateWorldMatrix(true, false);
    const head = _bd.setFromMatrixPosition(this.head.matrixWorld);
    const t = this.mesh.worldToLocal(_ax.copy(point));
    this.mesh.worldToLocal(head);
    t.sub(head);
    const yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(t.x, t.z))) * weight;
    const pitch = Math.max(-0.5, Math.min(0.6, -Math.atan2(t.y, Math.hypot(t.x, t.z)))) * weight;
    const k = Math.min(1, dt * 6);
    this.layer.yaw += (yaw - this.layer.yaw) * k;
    this.layer.pitch += (pitch - this.layer.pitch) * k;
  }

  _layer() {
    const L = this.layer;
    const armL = L.reachL ?? L.reach, armR = L.reachR ?? L.reach;
    if (!armL && !armR && !L.lean && !L.tilt && !L.yaw && !L.pitch && !L.handL && !L.handR) return;
    this.mesh.updateWorldMatrix(true, false);
    this._clean = 0;
    _qm.setFromRotationMatrix(_mr.extractRotation(this.mesh.matrixWorld));
    const B = this.byName;
    if (L.lean) {
      this._rotate(B.BACKA__Skeleton, _qa.setFromAxisAngle(X, L.lean * 0.45));
      this._rotate(B.BACKB__Skeleton, _qa.setFromAxisAngle(X, L.lean * 0.55));
    }
    if (L.tilt || L.yaw || L.pitch) {
      for (const [bone, k] of [[B.NECK__Skeleton, 0.4], [B.HEAD__Skeleton, 0.6]]) {
        _qa.setFromAxisAngle(Y, L.yaw * k).multiply(_q3.setFromAxisAngle(X, L.pitch * k)).multiply(_q3.setFromAxisAngle(Z, L.tilt * k));
        this._rotate(bone, _qa);
      }
    }
    if (L.handL) this._ik('LF', L.handL); else if (armL) this._reach('LF', armL);
    if (L.handR) this._ik('RT', L.handR); else if (armR) this._reach('RT', armR);
  }

  _fresh(bone) {
    const i = this._ci.get(bone);
    if (i === undefined) return;
    for (let k = this._clean; k <= i; k++) this._chain[k].updateWorldMatrix(false, false);
    if (i >= this._clean) this._clean = i + 1;
  }

  _bent(bone) {
    this._save(bone);
    const i = this._ci.get(bone);
    if (i < this._clean) this._clean = i;
  }

  _ik(side, h) {
    const w = h.w ?? 1;
    if (w <= 0) return;
    const S = this.byName[`${side}_S__Skeleton`], E = this.byName[`${side}_E__Skeleton`], W = this.byName[`${side}_W__Skeleton`];
    this._fresh(W);
    const a = _p1.setFromMatrixPosition(S.matrixWorld);
    const b = _p2.setFromMatrixPosition(E.matrixWorld);
    const c = _p3.setFromMatrixPosition(W.matrixWorld);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const at = h.obj ? h.obj.getWorldPosition(_p9) : h.local ? this.mesh.localToWorld(_p9.copy(h.local)) : h.at;
    const dir = _p4.copy(at).sub(a);
    const dist = Math.min(Math.max(dir.length(), 1e-3), (l1 + l2) * 0.999);
    dir.normalize();
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
    const pole = _ax.copy(h.pole || _down).applyQuaternion(_qm);
    pole.addScaledVector(dir, -pole.dot(dir));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
    pole.normalize();
    const elbow = _p5.copy(a).addScaledVector(dir, l1 * cosA).addScaledVector(pole, l1 * Math.sqrt(1 - cosA * cosA));
    const hand = _p6.copy(a).addScaledVector(dir, dist);
    this._swing(S, E, _p7.subVectors(elbow, a), w);
    this._fresh(E);
    this._swing(E, W, _p8.setFromMatrixPosition(E.matrixWorld).negate().add(hand), w);
  }

  _rotate(bone, dModel) {
    this._fresh(bone.parent);
    this._bent(bone);
    _q2.copy(_qm).multiply(dModel).multiply(_q3.copy(_qm).invert());
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    _q1.copy(_qp).invert().multiply(_q2).multiply(_qp);
    bone.quaternion.premultiply(_q1);
  }

  _swing(bone, child, want, w) {
    this._fresh(child);
    const a = _p10.setFromMatrixPosition(bone.matrixWorld);
    const cur = _p11.setFromMatrixPosition(child.matrixWorld).sub(a).normalize();
    want.normalize().lerp(cur, 1 - w).normalize();
    this._bent(bone);
    _q2.setFromUnitVectors(cur, want);
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    _q1.copy(_qp).invert().multiply(_q2).multiply(_qp);
    bone.quaternion.premultiply(_q1);
  }

  _set(bone, q, w) {
    this._fresh(bone.parent);
    this._bent(bone);
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    _q1.copy(_qp).invert().multiply(_q2.copy(_qm).multiply(q));
    bone.quaternion.slerp(_q1, w);
  }

  _save(bone) {
    if (!this._saved.has(bone)) this._saved.set(bone, bone.quaternion.clone());
  }

  _reach(side, w) {
    const L = this.layer, B = bindPose(), A = avatarAssets();
    const iS = A.index.get(`${side}_S__Skeleton`), iE = A.index.get(`${side}_E__Skeleton`), iW = A.index.get(`${side}_W__Skeleton`);
    const sx = side === 'LF' ? 1 : -1;
    const bob = L.sway * Math.sin(this.time * 2.6 * L.swayRate + (side === 'LF' ? 0 : 1.9)) * 0.1;
    _up.set(sx * (0.16 + L.spread), 0.06 + L.lift + bob, 1).normalize();
    _fo.set(sx * (0.04 + L.spread * 0.5), 0.1 + L.lift + bob * 1.5, 1).normalize();
    _ha.set(sx * 0.05, -0.35 + L.lift * 0.5, 1).normalize();
    const S = this.bones[iS], E = this.bones[iE], W = this.bones[iW];
    this._swing(S, E, _up.applyQuaternion(_qm), w);
    this._swing(E, W, _fo.applyQuaternion(_qm), w);
    _bd.set(sx, 0, 0);
    this._set(W, _qa.setFromUnitVectors(_bd, _ha).multiply(B[iW].q), w);
  }

  dispose() { this.mixer.stopAllAction(); }
}
