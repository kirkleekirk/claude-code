import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MESH, ANIM, ANIM_ROT, ANIM_POS } from '../../assets/avatarData.js';

// The avatar rig, bodies and animations from Microsoft's XNA Avatar Animation Pack
// (Ms-PL, see LICENSE-avatar.txt), unpacked once at startup.
//
// Every part mesh (bodies, heads, hair, tops, bottoms, shoes) is re-expressed
// against one shared skeleton in bind-pose space, so a character can be merged
// into a single skinned mesh and drawn in one call.

const b64ToBytes = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let promise = null;
let assets = null;

// [name, parent, point in bind space]
const EXTRA = [
  ['X_HELMET', 'HEAD__Skeleton', [0, 1.33, 0]],
  ['X_NECK_STUMP', 'SC_NECK__Skeleton', [0, 1.13, -0.02]],
  ['X_HIP_STUMP_L', 'SC_BASE__Skeleton', [0.09, 0.64, 0]],
  ['X_HIP_STUMP_R', 'SC_BASE__Skeleton', [-0.09, 0.64, 0]],
];

export function avatarAssets() {
  if (!assets) throw new Error('avatar assets used before loadAvatarAssets() resolved');
  return assets;
}

export function loadAvatarAssets() {
  if (!promise) promise = load().then((a) => (assets = a));
  return promise;
}

async function load() {
  const bytes = b64ToBytes(MESH);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // the skeleton: every node under BASE__Skeleton, in a fixed order
  const top = scene.getObjectByName('BASE__Skeleton');
  const bones = [];
  top.traverse((o) => bones.push(o));
  const index = new Map(bones.map((b, i) => [b.name, i]));
  // rest pose, as loaded
  const rest = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone(), parent: bones.indexOf(b.parent) }));

  // parts, in bind-pose world space with joints remapped to the shared skeleton
  const parts = {};
  let inverses = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const name = o.name.replace(/_\d+$/, '');
    const g = o.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(o.bindMatrix);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(o.bindMatrix);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
    }
    const map = o.skeleton.bones.map((b) => index.get(b.name));
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        idx[i * 4 + k] = map[si.getComponent(i, k)] ?? 0;
        wt[i * 4 + k] = sw.getComponent(i, k);
        sum += wt[i * 4 + k];
      }
      if (sum > 0) for (let k = 0; k < 4; k++) wt[i * 4 + k] /= sum;
    }
    const uv = g.attributes.uv ? new Float32Array(n * 2) : null;
    if (uv) for (let i = 0; i < n; i++) { uv[i * 2] = g.attributes.uv.getX(i); uv[i * 2 + 1] = g.attributes.uv.getY(i); }
    const index_ = g.index ? Uint32Array.from(g.index.array) : null;
    // keep the bind (inverse) matrices of the whole skeleton from the part that binds most bones
    if (!inverses || o.skeleton.bones.length > inverses.count) {
      const inv = bones.map(() => null);
      o.skeleton.bones.forEach((b, i) => { inv[index.get(b.name)] = o.skeleton.boneInverses[i].clone(); });
      inverses = { list: inv, count: o.skeleton.bones.length };
    }
    const part = { pos, nor, idx, wt, uv, index: index_, count: n };
    // a head arrives as two primitives (the two halves of the face); join them
    if (parts[name]) parts[name] = joinParts(parts[name], part);
    else parts[name] = part;
  });

  // bones no part binds still need an inverse: derive it from the rest pose
  top.updateMatrixWorld(true);
  const boneInverses = bones.map((b, i) => inverses.list[i] || b.matrixWorld.clone().invert());
  const names = bones.map((b) => b.name);

  // extra bones the game hides things with (helmets, the stumps left by dismemberment):
  // each sits at a point of the bind pose with the model's own axes and follows its
  // parent exactly, so scaling one to nothing hides only what's bound to it
  for (const [name, parent, at] of EXTRA) {
    const pi = index.get(parent);
    const bind = new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]);
    const local = boneInverses[pi].clone().multiply(bind);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    local.decompose(p, q, s);
    index.set(name, names.length);
    names.push(name);
    rest.push({ p, q, s, parent: pi });
    boneInverses.push(bind.clone().invert());
  }

  // clips
  const rot = new Int16Array(b64ToBytes(ANIM_ROT).buffer);
  const pos = new Float32Array(b64ToBytes(ANIM_POS).buffer);
  const clips = {};
  for (const c of ANIM.clips) {
    const tracks = [];
    const times = new Float32Array(c.frames);
    for (let i = 0; i < c.frames; i++) times[i] = i * c.dt;
    for (const [bi, kind, count, offset] of c.tracks) {
      const name = ANIM.bones[bi];
      const w = kind === 0 ? 4 : 3;
      const vals = new Float32Array(count * w);
      for (let i = 0; i < count * w; i++) vals[i] = kind === 0 ? rot[offset * 4 + i] / 32767 : pos[offset * 3 + i];
      const t = count === 1 ? new Float32Array([0]) : times;
      tracks.push(kind === 0 ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t, vals) : new THREE.VectorKeyframeTrack(`${name}.position`, t, vals));
    }
    clips[c.name] = new THREE.AnimationClip(c.name, (c.frames - 1) * c.dt, tracks);
  }

  derive(clips);
  return { bones: names, index, rest, boneInverses, parts, clips };
}

// ---- clips made from the pack's clips ---------------------------------------------------------


// every animated channel of a clip, frozen at time t
function poseAt(clip, t) {
  const out = new Map();
  for (const tr of clip.tracks) {
    const v = tr.createInterpolant().evaluate(Math.min(t, clip.duration));
    out.set(tr.name, { type: tr.ValueTypeName, v: Array.from(v) });
  }
  return out;
}

function derive(clips) {
  const still = (pose, filter, dur) => {
    const tracks = [];
    for (const [name, { type, v }] of pose) {
      if (filter && !filter(name)) continue;
      const T = type === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new T(name, [0, dur], v.concat(v)));
    }
    return tracks;
  };
  // idle: the rested stance before a pull, breathing
  const stand = poseAt(clips.pull, 0);
  const idle = still(stand, (n) => !n.startsWith('BACKB__Skeleton.quaternion') && !n.startsWith('HEAD__Skeleton.quaternion') && !n.startsWith('BASE__Skeleton.position'), 4);
  const breathe = (name, amp, axis) => {
    const base = new THREE.Quaternion().fromArray(stand.get(name).v);
    const times = [0, 1, 2, 3, 4], vals = [];
    for (const t of times) {
      const d = new THREE.Quaternion().setFromAxisAngle(axis, Math.sin((t / 4) * Math.PI * 2) * amp);
      vals.push(...base.clone().multiply(d).toArray());
    }
    return new THREE.QuaternionKeyframeTrack(name, times, vals);
  };
  idle.push(breathe('BACKB__Skeleton.quaternion', 0.025, new THREE.Vector3(1, 0, 0)));
  idle.push(breathe('HEAD__Skeleton.quaternion', 0.04, new THREE.Vector3(0, 1, 0)));
  const hip = stand.get('BASE__Skeleton.position');
  if (hip) idle.push(new THREE.VectorKeyframeTrack('BASE__Skeleton.position', [0, 2, 4], [...hip.v, hip.v[0], hip.v[1] - 0.004, hip.v[2], ...hip.v]));
  clips.idle = new THREE.AnimationClip('idle', 4, idle);

}

function joinParts(a, b) {
  const cat = (x, y, T) => { const o = new T(x.length + y.length); o.set(x); o.set(y, x.length); return o; };
  const index = new Uint32Array((a.index ? a.index.length : a.count) + (b.index ? b.index.length : b.count));
  index.set(a.index || Array.from({ length: a.count }, (_, i) => i));
  const bi = b.index || Uint32Array.from({ length: b.count }, (_, i) => i);
  for (let i = 0; i < bi.length; i++) index[(a.index ? a.index.length : a.count) + i] = bi[i] + a.count;
  return {
    pos: cat(a.pos, b.pos, Float32Array), nor: cat(a.nor, b.nor, Float32Array), idx: cat(a.idx, b.idx, Uint16Array), wt: cat(a.wt, b.wt, Float32Array),
    uv: a.uv && b.uv ? cat(a.uv, b.uv, Float32Array) : null, index, count: a.count + b.count,
  };
}
