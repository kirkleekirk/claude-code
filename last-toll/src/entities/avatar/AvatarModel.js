import * as THREE from 'three';
import { avatarAssets } from './AvatarAssets.js';
import { faceTexture } from './FacePainter.js';
import { buildGear, buzzPoint } from './AvatarGear.js';
import { rng, rag } from './noise.js';
import { buildBlocky } from './BlockyBody.js';

// A character built on the avatar rig: a body, a head with a painted face, hair,
// clothes and gear, merged into one skinned mesh (one draw call) and driven by the
// rig's animation clips.
//
// look = {
//   sex: 'm' | 'f', height: 1, skin: hex,
//   hair: { style: 'short' | 'bob' | 'bald' | 'buzz' | 'pony', color },
//   top: { color, sleeves: 'short' | 'long' | 'none' }, bottoms: { color, legs: hex? }, shoes: { color },
//   gloves: hex?, face: { ...see FacePainter },
//   gear: ['cap', 'beanie', 'wrap', 'captain', 'helmet', 'visor', 'vest', 'pack', 'glasses', 'bandana', 'pads'],
//   gearColor: { cap: hex, ... },
//   dead: { blood: 0..1, rot: 0..1, torn: 0..1 },  // the dead: blood on the clothes, rotten skin, holes torn through
// }

const HEIGHT = 1.2; // the rig is ~1.47 m; scaled, a grown-up avatar stands ~1.77 m
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// body regions, by the bone a vertex follows most
const REGION = (name) => {
  if (/HEAD|NECK/.test(name)) return 'neck';
  if (/FING|THUMB|_W_|_W__|PROP|SPECIAL/.test(name) || /_W__Skeleton$/.test(name)) return 'hand';
  if (/_E_TWIST|_SC_E|_E__/.test(name)) return 'forearm';
  if (/_S__|_SC_S|_SC_TWIST_S/.test(name)) return 'upperarm';
  if (/_K__|_SC_K/.test(name)) return 'shin';
  if (/_A__|_T__/.test(name)) return 'foot';
  if (/_H__|_SC_H/.test(name)) return 'thigh';
  return 'torso';
};

let regionCache = null;
function regions() {
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

function shadeHex(hex, k) {
  _c.setHex(hex);
  const hsl = {};
  _c.getHSL(hsl);
  _c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * (1 + k))));
  return _c.getHex();
}


// ---- building the merged mesh ------------------------------------------------------------------


export function buildAvatarGeometry(look) {
  const A = avatarAssets();
  const R = regions();
  const sex = look.sex === 'f' ? 'f' : 'm';
  const rand = rng(look.seed || 1);
  const dead = look.dead || null;
  const hairStyle = (look.hair && look.hair.style) || (sex === 'f' ? 'bob' : 'short');
  const list = [[`${sex}_body`, 'body'], [`${sex}_head`, 'head']];
  if (hairStyle === 'short' || hairStyle === 'buzz') list.push(['m_hair', 'hair']);
  if (hairStyle === 'bob' || hairStyle === 'pony') list.push(['f_hair', 'hair']);
  if (look.top && look.top.sleeves !== 'none') list.push([`${sex}_top`, 'top']);
  list.push([`${sex}_bottoms`, 'bottoms'], [`${sex}_shoes`, 'shoes']);

  const skin = look.skin ?? 0xd9a582;
  const top = look.top || { color: 0x8a8a8a };
  const bottoms = look.bottoms || { color: 0x3a4a5a };
  const colorFor = (kind, region) => {
    if (kind === 'hair') return look.hair ? look.hair.color : 0x3a2a1e;
    if (kind === 'top') return top.color;
    if (kind === 'bottoms') return bottoms.color;
    if (kind === 'shoes') return (look.shoes && look.shoes.color) ?? 0x2a2a2a;
    if (kind === 'head') return skin;
    // the bare body: sleeves, gloves and leggings are painted onto it
    if (region === 'forearm' && top.sleeves === 'long') return top.color;
    if (region === 'upperarm' && top.sleeves === 'long') return top.color;
    if (region === 'hand' && look.gloves != null) return look.gloves;
    if ((region === 'thigh' || region === 'shin') && bottoms.legs != null) return bottoms.legs;
    if (region === 'torso' && top.sleeves === 'none' && top.color != null) return top.color;
    return skin;
  };

  // blood and rot on the dead: a few blotches in bind space
  const blots = [];
  if (dead) {
    for (let i = 0; i < 4 + Math.round((dead.blood || 0) * 8); i++) blots.push({ c: new THREE.Vector3((rand() - 0.5) * 0.4, 0.2 + rand() * 1.1, (rand() - 0.3) * 0.3), r: 0.05 + rand() * 0.12, rot: rand() < (dead.rot || 0) });
  }
  const bloodC = new THREE.Color(0x4a0806), rotC = new THREE.Color(0x3a4428);

  // the pieces, in order: body parts, then gear
  const gear = buildGear(look, sex, hairStyle, (name) => R[name], shadeHex);
  const parts = list.map(([name, kind]) => ({ p: A.parts[name], kind, regions: R[name] }));
  for (const g of gear.pieces) {
    const geo = g.geo;
    const n = geo.attributes.position.count;
    let idx = g.skin && g.skin.idx, wt = g.skin && g.skin.wt;
    if (!idx) {
      const bi = A.index.get(g.bone);
      idx = new Uint16Array(n * 4); wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { idx[i * 4] = bi; wt[i * 4] = 1; }
    }
    parts.push({ p: { pos: geo.attributes.position.array, nor: geo.attributes.normal.array, idx, wt, uv: null, index: geo.index ? geo.index.array : null, count: n }, kind: 'gear', color: g.color });
  }

  // torn clothes on the dead: ragged patches worn through to the skin, dark at the edges
  const torn = dead && dead.torn ? 1 - dead.torn * 0.5 : 2;
  const tearSeed = (look.seed || 1) % 997;
  const tearable = (kind) => torn < 2 && (kind === 'top' || kind === 'bottoms');

  let total = 0;
  for (const q of parts) total += q.p.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  const index = [];
  let o = 0;
  const bodyScale = look.build || 1;
  for (const q of parts) {
    const p = q.p;
    pos.set(p.pos, o * 3);
    nor.set(p.nor, o * 3);
    si.set(p.idx, o * 4);
    sw.set(p.wt, o * 4);
    // a buzz cut: the short hair pulled in tight to the scalp
    if (q.kind === 'hair' && hairStyle === 'buzz') {
      for (let i = 0; i < p.count; i++) {
        const k = (o + i) * 3;
        buzzPoint(sex, _v.set(pos[k], pos[k + 1], pos[k + 2]));
        pos[k] = _v.x; pos[k + 1] = _v.y; pos[k + 2] = _v.z;
      }
    }
    // a heavier or slighter build: push everything below the neck out from the spine
    if (bodyScale !== 1 && q.kind !== 'head' && q.kind !== 'hair') {
      for (let i = 0; i < p.count; i++) {
        const k = (o + i) * 3;
        if (pos[k + 1] > 1.1) continue;
        pos[k] *= bodyScale;
        pos[k + 2] *= bodyScale;
      }
    }
    const tears = tearable(q.kind);
    for (let i = 0; i < p.count; i++) {
      const k = o + i;
      if (p.uv) { uv[k * 2] = p.uv[i * 2]; uv[k * 2 + 1] = p.uv[i * 2 + 1]; } else { uv[k * 2] = 0.002; uv[k * 2 + 1] = 0.002; }
      const hex = q.kind === 'gear' ? q.color : colorFor(q.kind, q.regions ? q.regions[i] : null);
      _c.setHex(hex);
      // a little life in flat colours
      const j = 1 + (rand() - 0.5) * 0.05;
      let r = _c.r * j, g = _c.g * j, b = _c.b * j;
      if (dead && q.kind !== 'gear') {
        _v.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
        for (const bl of blots) {
          const d = _v.distanceTo(bl.c) / bl.r;
          if (d < 1) {
            const w = (1 - d) * (bl.rot ? 0.6 : 0.85);
            const tc = bl.rot ? rotC : bloodC;
            if (bl.rot && (q.kind === 'body' || q.kind === 'head')) { r += (tc.r - r) * w; g += (tc.g - g) * w; b += (tc.b - b) * w; }
            else if (!bl.rot && q.kind !== 'hair') { r += (tc.r - r) * w; g += (tc.g - g) * w; b += (tc.b - b) * w; }
          }
        }
        if (tears) {
          // grime creeping out from each tear
          const n = rag(_v.x, _v.y, _v.z, tearSeed);
          const w = Math.max(0, Math.min(1, (n - (torn - 0.1)) / 0.1)) * 0.6;
          r *= 1 - w; g *= 1 - w * 1.05; b *= 1 - w * 1.1;
        }
      }
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
    }
    // triangles: minus the tears, and minus hair a helmet sits over
    const tri = p.index || Uint32Array.from({ length: p.count }, (_, i) => i);
    const hideHair = q.kind === 'hair' && gear.hidesHair;
    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i] * 3, b = tri[i + 1] * 3, c = tri[i + 2] * 3;
      if (tears) {
        const n = rag((p.pos[a] + p.pos[b] + p.pos[c]) / 3, (p.pos[a + 1] + p.pos[b + 1] + p.pos[c + 1]) / 3, (p.pos[a + 2] + p.pos[b + 2] + p.pos[c + 2]) / 3, tearSeed);
        if (n > torn) continue;
      }
      if (hideHair && [a, b, c].every((v) => gear.hidesHair(p.pos[v], p.pos[v + 1], p.pos[v + 2]))) continue;
      index.push(tri[i] + o, tri[i + 1] + o, tri[i + 2] + o);
    }
    o += p.count;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

// Materials per face: vertex colours everywhere, the painted face laid over the head.
// [closed, talking]: swapping between them moves the mouth.
const matCache = new Map();
function faceMat(map) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', 'vec4 faceTexel = texture2D( map, vMapUv );')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix( vColor.rgb, faceTexel.rgb, faceTexel.a );');
  };
  m.customProgramCacheKey = () => 'avatar-face';
  return m;
}
export function avatarMaterials(face) {
  const key = JSON.stringify(face || {});
  let m = matCache.get(key);
  if (!m) {
    m = [faceMat(faceTexture(face || {})), faceMat(faceTexture(face || {}, true))];
    matCache.set(key, m);
  }
  return m;
}

// ---- the pose layer -----------------------------------------------------------------------------

// each bone's bind-pose rotation and position, in the model's own space
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

const _qa = new THREE.Quaternion(), _qm = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _mr = new THREE.Matrix4();
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(), _fo = new THREE.Vector3(), _ha = new THREE.Vector3(), _bd = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// ---- the character --------------------------------------------------------------------------

export class AvatarModel {
  constructor(look) {
    const A = avatarAssets();
    this.look = look;
    this.root = new THREE.Group();
    // look.style 'blocky': a body of boxes with a pixel skin (see BlockyBody)
    const blocky = look.style === 'blocky' ? buildBlocky(look) : null;
    const geo = blocky ? blocky.geo : buildAvatarGeometry(look);
    // bones: a fresh copy of the rig in its rest pose
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
    this.materials = blocky ? [blocky.material, blocky.material] : avatarMaterials(look.face);
    const mesh = new THREE.SkinnedMesh(geo, this.materials[0]);
    mesh.add(bones[0]);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    const s = HEIGHT * (look.height || 1);
    this.root.scale.setScalar(s);
    this.root.add(mesh);
    this.mixer = new THREE.AnimationMixer(mesh);
    this.actions = {};
    this.current = null;
    // handy bones
    this.head = this.byName.HEAD__Skeleton;
    this.neck = this.byName.NECK__Skeleton;
    this.hips = this.byName.BASE__Skeleton;
    this.chest = this.byName.BACKB__Skeleton;
    // The pose layer, laid over whatever clip is playing (all in radians or 0..1):
    //  reach / reachL / reachR  arms held out in front (the dead reaching for you)
    //  lift, spread             how high and how wide the reaching arms are held
    //  sway                     a slow, loose bob of the reaching arms
    //  lean                     the spine bent forward (negative: back)
    //  tilt                     the head lolled to one side
    //  yaw, pitch               the head turned and nodded (see lookAt)
    this.layer = { reach: 0, reachL: null, reachR: null, lift: 0, spread: 0, sway: 0, lean: 0, tilt: 0, yaw: 0, pitch: 0 };
    this.time = Math.random() * 10;
    this._saved = new Map();
  }

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

  // Cross-fade to a clip. once: play through and hold the last frame.
  play(name, { fade = 0.25, speed = 1, once = false, at = null } = {}) {
    const a = this.action(name);
    if (!a) return null;
    a.enabled = true;
    a.setEffectiveTimeScale(speed);
    a.setEffectiveWeight(1);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (this.current === a) return a;
    a.reset();
    if (at != null) a.time = at * a.getClip().duration;
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    return a;
  }

  // The painted face: closed or talking.
  talk(open) {
    this.mesh.material = this.materials[open ? 1 : 0];
  }

  update(dt) {
    // the clips set every bone they drive each frame; put back the ones the layer bent
    // last frame first, so a bone no clip drives doesn't keep bending further
    for (const [b, q] of this._saved) b.quaternion.copy(q);
    this._saved.clear();
    this.mixer.update(dt);
    this.time += dt;
    this._layer();
  }

  // Turn the head toward a point in the world, easing there (dt) within a comfortable range.
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
    if (!armL && !armR && !L.lean && !L.tilt && !L.yaw && !L.pitch) return;
    this.root.updateMatrixWorld(true);
    this.mesh.getWorldQuaternion(_qm);
    const B = this.byName;
    if (L.lean) {
      this._turn(B.BACKA__Skeleton, X, L.lean * 0.45);
      this._turn(B.BACKB__Skeleton, X, L.lean * 0.55);
    }
    if (L.tilt || L.yaw || L.pitch) {
      this._turn(B.NECK__Skeleton, Y, L.yaw * 0.4);
      this._turn(B.HEAD__Skeleton, Y, L.yaw * 0.6);
      this._turn(B.NECK__Skeleton, X, L.pitch * 0.4);
      this._turn(B.HEAD__Skeleton, X, L.pitch * 0.6);
      this._turn(B.NECK__Skeleton, Z, L.tilt * 0.4);
      this._turn(B.HEAD__Skeleton, Z, L.tilt * 0.6);
    }
    if (armL) this._reach('LF', armL);
    if (armR) this._reach('RT', armR);
  }

  // Bend a bone about an axis of the model (not its own), keeping the rest of the pose.
  _turn(bone, axis, angle) {
    if (!angle) return;
    this._save(bone);
    _q2.setFromAxisAngle(_ax.copy(axis).applyQuaternion(_qm), angle);
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    // local' = parent⁻¹ · Δ · parent · local
    _q1.copy(_qp).invert().multiply(_q2).multiply(_qp);
    bone.quaternion.premultiply(_q1);
    bone.updateMatrixWorld(true);
  }

  // Blend a bone toward a rotation given in the model's space.
  _set(bone, q, w) {
    this._save(bone);
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    _q1.copy(_qp).invert().multiply(_q2.copy(_qm).multiply(q));
    bone.quaternion.slerp(_q1, w);
    bone.updateMatrixWorld(true);
  }

  // Swing a bone so the joint below it moves toward a direction of the model's space.
  _aim(bone, child, dir, w) {
    this._save(bone);
    const a = _p1.setFromMatrixPosition(bone.matrixWorld), b = _p2.setFromMatrixPosition(child.matrixWorld);
    const cur = b.sub(a).normalize();
    const want = _ax.copy(dir).applyQuaternion(_qm);
    _q2.setFromUnitVectors(cur, want.lerp(cur, 1 - w).normalize());
    _qp.setFromRotationMatrix(_mr.extractRotation(bone.parent.matrixWorld));
    _q1.copy(_qp).invert().multiply(_q2).multiply(_qp);
    bone.quaternion.premultiply(_q1);
    bone.updateMatrixWorld(true);
  }

  _save(bone) {
    if (!this._saved.has(bone)) this._saved.set(bone, bone.quaternion.clone());
  }

  // One arm held out in front: upper arm, forearm and a limp hand, each turned from its
  // bind pose (a T-pose, palms down) so the palm stays down whatever the clip was doing.
  _reach(side, w) {
    const L = this.layer, B = bindPose(), A = avatarAssets();
    const iS = A.index.get(`${side}_S__Skeleton`), iE = A.index.get(`${side}_E__Skeleton`), iW = A.index.get(`${side}_W__Skeleton`);
    const sx = side === 'LF' ? 1 : -1;
    const bob = L.sway * Math.sin(this.time * 2.6 + (side === 'LF' ? 0 : 1.9)) * 0.1;
    _up.set(sx * (0.16 + L.spread), 0.06 + L.lift + bob, 1).normalize();
    _fo.set(sx * (0.04 + L.spread * 0.5), 0.1 + L.lift + bob * 1.5, 1).normalize();
    _ha.set(sx * 0.05, -0.35 + L.lift * 0.5, 1).normalize();
    const S = this.bones[iS], E = this.bones[iE], W = this.bones[iW];
    // upper arm and forearm: aimed from where the joints are now (the shoulder and elbow
    // bones carry no skin, so their bind matrices say nothing about the arm)
    this._aim(S, E, _up, w);
    this._aim(E, W, _fo, w);
    // the hand, from its bind pose (a T-pose, palm down): limp at the wrist, palm down
    _bd.set(sx, 0, 0);
    this._set(W, _qa.setFromUnitVectors(_bd, _ha).multiply(B[iW].q), w);
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
