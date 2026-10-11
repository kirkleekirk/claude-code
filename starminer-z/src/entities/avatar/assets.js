// The Xbox 360 avatar from Microsoft's XNA Avatar Animation Pack (Ms-PL, see LICENSE-avatar.txt):
// the rig, the boy and girl part meshes, every animation in the pack, the avatar's clothing
// textures and its animated face textures. Unpacked once at startup.
//
// Every part mesh is re-expressed against one shared skeleton in bind-pose space, so a
// character can be merged into a single skinned mesh and drawn in one call.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MESH, ANIM, ANIM_ROT, ANIM_POS, TEXTURES, FACE, EXPRESSIONS } from '../../assets/avatarData.js';

const b64ToBytes = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let promise = null;
let assets = null;

// extra bones things hang from: [name, parent, point in bind space]
const EXTRA = [
  ['X_HELMET', 'HEAD__Skeleton', [0, 1.33, 0]],
];
// the rig's own prop bones, which no part mesh follows (so the pack's meshes leave them out):
// [name, parent, offset from it]; held things hang from PROP, as on the Xbox
const PROPS = [
  ['RT_PROP__Skeleton', 'RT_W__Skeleton', [-0.0629, -0.15725, 0]],
  ['RT_SPECIAL__Skeleton', 'RT_W__Skeleton', [-0.09435, -0.09435, 0]],
  ['LF_PROP__Skeleton', 'LF_W__Skeleton', [0.0629, -0.15725, 0]],
  ['LF_SPECIAL__Skeleton', 'LF_W__Skeleton', [0.09435, -0.09435, 0]],
];

export function avatarAssets() {
  if (!assets) throw new Error('avatar assets used before loadAvatarAssets() resolved');
  return assets;
}

export function loadAvatarAssets() {
  if (!promise) promise = load().then((a) => (assets = a));
  return promise;
}

async function decodePNG(b64) {
  const blob = new Blob([b64ToBytes(b64)], { type: 'image/png' });
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  return img;
}

function pixels(img, w = img.width, h = img.height) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

async function load() {
  const bytes = b64ToBytes(MESH);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const top = scene.getObjectByName('BASE__Skeleton');
  const bones = [];
  top.traverse((o) => bones.push(o));
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const rest = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone(), parent: bones.indexOf(b.parent) }));

  const parts = {};
  let inverses = null;
  // each part is a node of the glTF; a node with several primitives arrives as a group
  const partOf = new Map();
  const PARTS = ['m_body', 'm_head', 'm_hair', 'm_top', 'm_bottoms', 'm_shoes', 'f_body', 'f_head', 'f_hair', 'f_top', 'f_bottoms', 'f_shoes'];
  for (const p of PARTS) {
    const obj = scene.children.find((c) => c.name === p) || scene.getObjectByName(p);
    if (obj) obj.traverse((o) => { if (o.isSkinnedMesh) partOf.set(o, p); });
  }
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const name = partOf.get(o);
    if (!name) return;
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
    const grab = (attr) => {
      const a = g.attributes[attr];
      if (!a) return null;
      const out = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { out[i * 2] = a.getX(i); out[i * 2 + 1] = a.getY(i); }
      return out;
    };
    const part = {
      pos, nor, idx, wt, count: n,
      uv: grab('uv'), uv1: grab('uv1'),
      decal: grab('_uv_decal'), eye: grab('_uv_eye'), brow: grab('_uv_brow'),
      index: g.index ? Uint32Array.from(g.index.array) : null,
      // which half of the face (the heads come as two primitives)
      side: null,
    };
    if (name.endsWith('_head')) {
      part.side = new Float32Array(n).fill(pos[0] >= 0 ? 0 : 1);
      // decide by the primitive's own vertices: the +x half is the avatar's left
      let sx = 0;
      for (let i = 0; i < n; i++) sx += pos[i * 3];
      part.side.fill(sx >= 0 ? 0 : 1);
    }
    if (!inverses || o.skeleton.bones.length > inverses.count) {
      const inv = bones.map(() => null);
      o.skeleton.bones.forEach((b, i) => { inv[index.get(b.name)] = o.skeleton.boneInverses[i].clone(); });
      inverses = { list: inv, count: o.skeleton.bones.length };
    }
    if (parts[name]) parts[name] = joinParts(parts[name], part);
    else parts[name] = part;
  });

  top.updateMatrixWorld(true);
  const boneInverses = bones.map((b, i) => inverses.list[i] || b.matrixWorld.clone().invert());
  const names = bones.map((b) => b.name);
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
  for (const [name, parent, at] of PROPS) {
    const pi = index.get(parent);
    const p = new THREE.Vector3(...at);
    const bind = boneInverses[pi].clone().invert().multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    index.set(name, names.length);
    names.push(name);
    rest.push({ p, q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), parent: pi });
    boneInverses.push(bind.invert());
  }

  // clips
  const rot = new Int16Array(b64ToBytes(ANIM_ROT).buffer);
  const posA = new Float32Array(b64ToBytes(ANIM_POS).buffer);
  const clips = {};
  for (const c of ANIM.clips) {
    const tracks = [];
    const times = new Float32Array(c.frames);
    for (let i = 0; i < c.frames; i++) times[i] = i * c.dt;
    for (const [bi, kind, count, offset] of c.tracks) {
      const name = ANIM.bones[bi];
      const w = kind === 0 ? 4 : 3;
      const vals = new Float32Array(count * w);
      for (let i = 0; i < count * w; i++) vals[i] = kind === 0 ? rot[offset * 4 + i] / 32767 : posA[offset * 3 + i];
      const t = count === 1 ? new Float32Array([0]) : times;
      tracks.push(kind === 0 ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t, vals) : new THREE.VectorKeyframeTrack(`${name}.position`, t, vals));
    }
    clips[c.name] = new THREE.AnimationClip(c.name, Math.max(c.dt, (c.frames - 1) * c.dt), tracks);
  }
  derive(clips);

  // textures: the clothes in one array (colour and decal per part), the faces as atlases
  const order = ['m_top', 'm_bottoms', 'm_shoes', 'f_top', 'f_bottoms', 'f_shoes'];
  const S = 128;
  const arr = new Uint8Array(S * S * 4 * order.length * 2);
  let li = 0;
  const clothLayer = {};
  const clothLum = {}; // each colour texture's mean (linear) luminance, for recolouring
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  for (const p of order) {
    clothLayer[p] = li;
    for (const k of ['color', 'decal']) {
      const img = await decodePNG(TEXTURES[`${p}_${k}`]);
      const px = pixels(img, S, S);
      arr.set(px, li * S * S * 4);
      if (k === 'color') {
        let sum = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { sum += 0.2126 * toLin(px[i]) + 0.7152 * toLin(px[i + 1]) + 0.0722 * toLin(px[i + 2]); n++; }
        clothLum[p] = n ? sum / n : 1;
      }
      li++;
    }
  }
  const clothes = new THREE.DataArrayTexture(arr, S, S, li);
  clothes.colorSpace = THREE.SRGBColorSpace;
  clothes.wrapS = clothes.wrapT = THREE.RepeatWrapping;
  clothes.minFilter = THREE.LinearMipmapLinearFilter;
  clothes.magFilter = THREE.LinearFilter;
  clothes.generateMipmaps = true;
  clothes.needsUpdate = true;
  // the faces: every frame its own layer, so nothing bleeds between them in the small mips
  const CW = FACE.m.cw, CH = FACE.m.ch;
  const faceBase = {};
  const faceData = [];
  for (const sex of ['m', 'f']) {
    const img = await decodePNG(TEXTURES[`${sex}_face`]);
    const G = FACE[sex].grid;
    const px = pixels(img, CW * G, CH * FACE[sex].rows);
    const n = FACE[sex].mouth[0] + FACE[sex].mouth[1];
    faceBase[sex] = faceData.length;
    for (let cell = 0; cell < n; cell++) {
      const layer = new Uint8Array(CW * CH * 4);
      const cx = (cell % G) * CW, cy = Math.floor(cell / G) * CH;
      for (let y = 0; y < CH; y++) layer.set(px.subarray(((cy + y) * CW * G + cx) * 4, ((cy + y) * CW * G + cx + CW) * 4), y * CW * 4);
      // a clear border, so clamping at the edges of the feature never smears it
      for (let i = 0; i < CW; i++) { layer[i * 4 + 3] = 0; layer[((CH - 1) * CW + i) * 4 + 3] = 0; }
      for (let i = 0; i < CH; i++) { layer[(i * CW) * 4 + 3] = 0; layer[(i * CW + CW - 1) * 4 + 3] = 0; }
      faceData.push(layer);
    }
  }
  const fa = new Uint8Array(CW * CH * 4 * faceData.length);
  faceData.forEach((l, i) => fa.set(l, i * CW * CH * 4));
  // masks, not colours: kept linear
  const faceTex = new THREE.DataArrayTexture(fa, CW, CH, faceData.length);
  faceTex.colorSpace = THREE.NoColorSpace;
  faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
  faceTex.minFilter = THREE.LinearMipmapLinearFilter;
  faceTex.magFilter = THREE.LinearFilter;
  faceTex.generateMipmaps = true;
  faceTex.anisotropy = 4;
  faceTex.needsUpdate = true;
  const faces = { m: faceTex, f: faceTex };
  return { bones: names, index, rest, boneInverses, parts, clips, clothes, clothLayer, clothLum, faces, faceBase, faceTex, face: FACE, expressions: EXPRESSIONS };
}

// ---- clips made from the pack's clips ---------------------------------------------------------

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
  // idle: the rested stance at the start of the pull, breathing
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
  // dead: the last frame of the faint, held
  const down = poseAt(clips.faint, clips.faint.duration);
  clips.dead = new THREE.AnimationClip('dead', 1, still(down, null, 1));
}

function joinParts(a, b) {
  const cat = (x, y, T) => { if (!x || !y) return null; const o = new T(x.length + y.length); o.set(x); o.set(y, x.length); return o; };
  const index = new Uint32Array((a.index ? a.index.length : a.count) + (b.index ? b.index.length : b.count));
  index.set(a.index || Array.from({ length: a.count }, (_, i) => i));
  const bi = b.index || Uint32Array.from({ length: b.count }, (_, i) => i);
  for (let i = 0; i < bi.length; i++) index[(a.index ? a.index.length : a.count) + i] = bi[i] + a.count;
  return {
    pos: cat(a.pos, b.pos, Float32Array), nor: cat(a.nor, b.nor, Float32Array), idx: cat(a.idx, b.idx, Uint16Array), wt: cat(a.wt, b.wt, Float32Array),
    uv: cat(a.uv, b.uv, Float32Array), uv1: cat(a.uv1, b.uv1, Float32Array), decal: cat(a.decal, b.decal, Float32Array),
    eye: cat(a.eye, b.eye, Float32Array), brow: cat(a.brow, b.brow, Float32Array), side: cat(a.side, b.side, Float32Array),
    index, count: a.count + b.count,
  };
}
