// Builds src/assets/avatarData.js, the Xbox 360 avatar the game uses for the player (and as the
// rig zombies and skeletons are built on), from Microsoft's XNA Game Studio 4.0 Avatar
// Animation Pack and the textures in its Maya version (Ms-PL; see LICENSE-avatar.txt).
//
//   node tools/avatar/build-avatar.mjs <XNAGameStudio/Samples> [work dir]
//
// The samples are archived at https://github.com/SimonDarksideJ/XNAGameStudio. The script:
//   1. converts every animation FBX to glTF with FBX2glTF (the npm "fbx2gltf" package),
//   2. takes the skeleton and the boy and girl part meshes from walk, and recovers the UV
//      layers FBX2glTF drops (the eye, brow and mouth layers of the heads, and the decal layer
//      of the clothes) by matching each glTF vertex back to its FBX polygon-vertex,
//   3. packs the animations into compact keyframe tracks, one clip per FBX,
//   4. packs the avatar's own clothing textures and its animated face textures (14 eye
//      shapes, 5 brows, 14 mouths, each for boy and girl) into PNGs.

import { NodeIO, PropertyType } from '@gltf-transform/core';
import { KHRMeshQuantization, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';
import { parseBinary } from 'fbx-parser';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const [samples, workArg] = process.argv.slice(2);
if (!samples) { console.error('usage: node tools/avatar/build-avatar.mjs <XNAGameStudio/Samples> [work dir]'); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = workArg || join(root, 'tools/out/avatar');
const glbDir = join(work, 'glb');
mkdirSync(glbDir, { recursive: true });
const PACK = join(samples, 'AvatarAnimPack_4_0_FBX');
const CUSTOM = join(samples, 'CustomAvatarAnimation_4_0/CustomAvatarAnimationSample/Content');
const TEX = join(samples, 'AvatarAnimPack_4_0_Maya/Textures');
const FBX2GLTF = join(root, 'node_modules/fbx2gltf/bin', process.platform === 'win32' ? 'Windows_NT/FBX2glTF.exe' : process.platform === 'darwin' ? 'Darwin/FBX2glTF' : 'Linux/FBX2glTF');

// ---- 1. FBX -> glTF ---------------------------------------------------------------------------

const sources = readdirSync(PACK).filter((f) => f.endsWith('.fbx')).map((f) => [basename(f, '.fbx'), join(PACK, f)]);
for (const [name, file] of sources) {
  const out = join(glbDir, `${name}.glb`);
  if (existsSync(out)) continue;
  execFileSync(FBX2GLTF, ['--binary', '--anim-framerate', 'bake30', '--input', file, '--output', join(glbDir, name)], { stdio: 'ignore' });
  console.log(`converted ${name}`);
}

// ---- 2. meshes, with the UV layers glTF lost ---------------------------------------------------

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read(join(glbDir, 'walk.glb'));
const bRoot = base.getRoot();
const skeletonTop = bRoot.listNodes().find((n) => n.getName() === 'BASE__Skeleton');
const inSkeleton = new Set();
(function mark(n) { inSkeleton.add(n); n.listChildren().forEach(mark); })(skeletonTop);
const boneByName = new Map([...inSkeleton].map((n) => [n.getName(), n]));

// glTF node name -> [our name, extra FBX layers to recover: { attribute: fbx layer index }]
const KEEP = {
  boy_body_mesh_Natal: ['m_body', {}],
  boy_bottoms_Natal: ['m_bottoms', { _UV_DECAL: 2 }],
  boy_hair_Natal: ['m_hair', {}],
  boy_shoes_Natal: ['m_shoes', { _UV_DECAL: 2 }],
  boy_top_Natal: ['m_top', { _UV_DECAL: 2 }],
  BlendShapeEarDefault_Natal: ['m_head', { _UV_SHADOW: 3, _UV_EYE: 4, _UV_BROW: 5 }],
  girl_body_mesh_Natal: ['f_body', {}],
  girl_bottoms_Natal: ['f_bottoms', { _UV_DECAL: 2 }],
  girl_hair_Natal: ['f_hair', {}],
  girl_shoes_Natal: ['f_shoes', { _UV_DECAL: 2 }],
  girl_top_Natal: ['f_top', { _UV_DECAL: 2 }],
  girlHead_BlendShapeEarDefault_Natal: ['f_head', { _UV_SHADOW: 3, _UV_EYE: 4, _UV_BROW: 5 }],
};

const fbx = parseBinary(readFileSync(join(PACK, 'walk.fbx')));
const objects = fbx.find((n) => n.name === 'Objects');
const arr = (n) => (n.props.length === 1 && (Array.isArray(n.props[0]) || ArrayBuffer.isView(n.props[0])) ? n.props[0] : n.props);
function fbxMesh(name) {
  const m = objects.nodes.find((o) => o.name === 'Model' && String(o.props[0]).endsWith(`::${name}`));
  const get = (k) => m.nodes.find((c) => c.name === k);
  const cp = arr(get('Vertices'));
  const pvi = arr(get('PolygonVertexIndex'));
  const layers = m.nodes.filter((c) => c.name === 'LayerElementUV').map((l) => ({
    name: arr(l.nodes.find((c) => c.name === 'Name'))[0],
    uv: arr(l.nodes.find((c) => c.name === 'UV')),
    idx: arr(l.nodes.find((c) => c.name === 'UVIndex')),
  }));
  return { cp, pvi, layers };
}
const r4 = (x) => Math.round(x * 1e4);
const r2 = (x) => Math.round(x * 1e2);

// The heads are rebuilt straight from the FBX, one vertex per distinct polygon-vertex: the eye
// and brow layers have seams the first two UV layers don't, and a vertex merged across such a
// seam drags the eye texture across the cheek.
function rebuildHead(node, src, model) {
  const m = objects.nodes.find((o) => o.name === 'Model' && String(o.props[0]).endsWith(`::${node.getName()}`));
  const normals = arr(m.nodes.find((c) => c.name === 'LayerElementNormal').nodes.find((c) => c.name === 'Normals'));
  const mats = arr(m.nodes.find((c) => c.name === 'LayerElementMaterial').nodes.find((c) => c.name === 'Materials'));
  const prims = node.getMesh().listPrimitives();
  const buf = bRoot.listBuffers()[0];
  for (let mi = 0; mi < prims.length; mi++) {
    const prim = prims[mi];
    const keyToVert = new Map();
    const P = [], N = [], U = [[], [], [], [], [], []], idx = [];
    let poly = 0, corner = [];
    for (let i = 0; i < src.pvi.length; i++) {
      const raw = src.pvi[i];
      const c = raw < 0 ? ~raw : raw;
      corner.push(i);
      if (raw >= 0) continue;
      const mat = mats.length > 1 ? mats[poly] : mats[0];
      poly++;
      const pv = corner; corner = [];
      if (mat !== mi) continue;
      const vs = pv.map((k) => {
        const cp = src.pvi[k] < 0 ? ~src.pvi[k] : src.pvi[k];
        const key = [cp, ...src.layers.slice(0, 6).map((L) => L.idx[k])].join(',');
        let v = keyToVert.get(key);
        if (v === undefined) {
          v = P.length / 3;
          keyToVert.set(key, v);
          P.push(src.cp[cp * 3] * 0.01, src.cp[cp * 3 + 1] * 0.01, src.cp[cp * 3 + 2] * 0.01);
          N.push(normals[cp * 3], normals[cp * 3 + 1], normals[cp * 3 + 2]);
          for (let l = 0; l < 6; l++) { const L = src.layers[l]; U[l].push(L.uv[L.idx[k] * 2], 1 - L.uv[L.idx[k] * 2 + 1]); }
        }
        return v;
      });
      for (let t = 1; t + 1 < vs.length; t++) idx.push(vs[0], vs[t], vs[t + 1]);
    }
    const n = P.length / 3;
    const acc = (name, type, a) => base.createAccessor(name).setType(type).setArray(a).setBuffer(buf);
    for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
    prim.setAttribute('POSITION', acc(`${model}_pos${mi}`, 'VEC3', new Float32Array(P)));
    prim.setAttribute('NORMAL', acc(`${model}_nor${mi}`, 'VEC3', new Float32Array(N)));
    prim.setAttribute('TEXCOORD_0', acc(`${model}_uv0${mi}`, 'VEC2', new Float32Array(U[0])));
    prim.setAttribute('TEXCOORD_1', acc(`${model}_uv1${mi}`, 'VEC2', new Float32Array(U[1])));
    prim.setAttribute('_UV_SHADOW', acc(`${model}_sh${mi}`, 'VEC2', new Float32Array(U[3])));
    prim.setAttribute('_UV_EYE', acc(`${model}_eye${mi}`, 'VEC2', new Float32Array(U[4])));
    prim.setAttribute('_UV_BROW', acc(`${model}_brow${mi}`, 'VEC2', new Float32Array(U[5])));
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) W[i * 4] = 1;
    prim.setAttribute('JOINTS_0', acc(`${model}_j${mi}`, 'VEC4', J));
    prim.setAttribute('WEIGHTS_0', acc(`${model}_w${mi}`, 'VEC4', W));
    prim.setIndices(acc(`${model}_i${mi}`, 'SCALAR', new Uint32Array(idx)));
    console.log(`  rebuilt ${model} half ${mi}: ${n} vertices, ${idx.length / 3} triangles`);
  }
}

let unmatched = 0, total = 0;
for (const node of bRoot.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const keep = KEEP[node.getName()];
  if (!keep) { node.setMesh(null); continue; }
  const [ours, extra] = keep;
  const src = fbxMesh(node.getName());
  // index the FBX polygon-vertices by position and their first two UV layers
  const byKey = new Map(), byPos = new Map();
  for (let i = 0; i < src.pvi.length; i++) {
    const c = src.pvi[i] < 0 ? ~src.pvi[i] : src.pvi[i];
    const px = src.cp[c * 3], py = src.cp[c * 3 + 1], pz = src.cp[c * 3 + 2];
    const L0 = src.layers[0], L1 = src.layers[1];
    const u0 = L0.uv[L0.idx[i] * 2], v0 = L0.uv[L0.idx[i] * 2 + 1];
    const u1 = L1.uv[L1.idx[i] * 2], v1 = L1.uv[L1.idx[i] * 2 + 1];
    const pk = `${r2(px)},${r2(py)},${r2(pz)}`;
    const k = `${pk}|${r4(u0)},${r4(v0)}|${r4(u1)},${r4(v1)}`;
    if (!byKey.has(k)) byKey.set(k, i);
    if (!byPos.has(pk)) byPos.set(pk, []);
    byPos.get(pk).push(i);
  }
  if (ours.endsWith('_head')) {
    if (node.getSkin().listJoints().length !== 1) throw new Error(`${ours}: expected a head bound to one bone`);
    rebuildHead(node, src, ours);
    node.setName(ours);
    mesh.setName(ours);
    for (const prim of mesh.listPrimitives()) prim.getMaterial()?.setName(ours);
    continue;
  }
  node.setName(ours);
  mesh.setName(ours);
  for (const prim of mesh.listPrimitives()) {
    for (const sem of ['COLOR_0']) if (prim.getAttribute(sem)) prim.setAttribute(sem, null);
    prim.getMaterial()?.setName(ours);
    const pos = prim.getAttribute('POSITION').getArray();
    const t0 = prim.getAttribute('TEXCOORD_0').getArray(), t1 = prim.getAttribute('TEXCOORD_1').getArray();
    const n = pos.length / 3;
    const outs = Object.fromEntries(Object.keys(extra).map((a) => [a, new Float32Array(n * 2)]));
    for (let v = 0; v < n; v++) {
      total++;
      const pk = `${r2(pos[v * 3] * 100)},${r2(pos[v * 3 + 1] * 100)},${r2(pos[v * 3 + 2] * 100)}`;
      const k = `${pk}|${r4(t0[v * 2])},${r4(1 - t0[v * 2 + 1])}|${r4(t1[v * 2])},${r4(1 - t1[v * 2 + 1])}`;
      let i = byKey.get(k);
      if (i === undefined) {
        // nearest by UV among the polygon-vertices at this position
        const cands = byPos.get(pk) || [];
        let best = -1, bd = Infinity;
        for (const c of cands) {
          const L0 = src.layers[0];
          const du = L0.uv[L0.idx[c] * 2] - t0[v * 2], dv = L0.uv[L0.idx[c] * 2 + 1] - (1 - t0[v * 2 + 1]);
          const d = du * du + dv * dv;
          if (d < bd) { bd = d; best = c; }
        }
        i = best;
        if (i < 0) unmatched++;
      }
      for (const [attr, li] of Object.entries(extra)) {
        const L = src.layers[li];
        if (i < 0 || !L) continue;
        outs[attr][v * 2] = L.uv[L.idx[i] * 2];
        outs[attr][v * 2 + 1] = 1 - L.uv[L.idx[i] * 2 + 1];
      }
    }
    for (const [attr, data] of Object.entries(outs)) {
      const acc = base.createAccessor(`${ours}${attr}`).setType('VEC2').setArray(data).setBuffer(bRoot.listBuffers()[0]);
      prim.setAttribute(attr, acc);
    }
  }
}
console.log(`matched ${total - unmatched}/${total} vertices to their FBX polygon-vertices`);

// ---- 3. animations ------------------------------------------------------------------------------

for (const anim of bRoot.listAnimations()) anim.dispose();
const boneNames = [...inSkeleton].map((n) => n.getName());
const clips = [];
const rot = [], pos = [];
for (const [name] of sources) {
  const doc = await io.read(join(glbDir, `${name}.glb`));
  const anim = doc.getRoot().listAnimations()[0];
  if (!anim) continue;
  let frames = 0, dt = 0;
  const tracks = [];
  for (const ch of anim.listChannels()) {
    const target = ch.getTargetNode();
    const bone = target && boneByName.get(target.getName());
    if (!bone) continue;
    const path = ch.getTargetPath();
    if (path === 'scale') continue;
    if (path === 'translation' && bone !== skeletonTop) continue;
    const s = ch.getSampler();
    const times = s.getInput().getArray(), vals = s.getOutput().getArray();
    const w = path === 'rotation' ? 4 : 3;
    const n = times.length;
    frames = Math.max(frames, n);
    if (n > 1) {
      const step = times[1] - times[0];
      if (!dt) dt = step;
      if (Math.abs(step - dt) > 1e-4) throw new Error(`${name}: uneven keys on ${bone.getName()}`);
    }
    let still = true;
    for (let i = 1; i < n && still; i++) for (let k = 0; k < w; k++) if (Math.abs(vals[i * w + k] - vals[k]) > 0.0015) { still = false; break; }
    const count = still ? 1 : n;
    const target_ = path === 'rotation' ? rot : pos;
    const offset = target_.length / w;
    for (let i = 0; i < count * w; i++) target_.push(vals[i]);
    tracks.push([boneNames.indexOf(bone.getName()), path === 'rotation' ? 0 : 1, count, offset]);
  }
  clips.push({ name, frames, dt: +(dt || 1 / 30).toFixed(6), tracks });
  console.log(`  ${name}: ${tracks.length} tracks, ${frames} frames`);
}
const rotQ = new Int16Array(rot.length);
for (let i = 0; i < rot.length; i++) rotQ[i] = Math.round(Math.max(-1, Math.min(1, rot[i])) * 32767);
const posF = new Float32Array(pos);

// drop rig controls and anything else that isn't the skeleton or a kept mesh
const keepNodes = new Set(inSkeleton);
for (const node of bRoot.listNodes()) if (node.getMesh()) keepNodes.add(node);
for (const node of bRoot.listNodes()) {
  if (keepNodes.has(node)) continue;
  for (const c of node.listChildren()) if (keepNodes.has(c)) { node.removeChild(c); bRoot.listScenes()[0].addChild(c); }
}
for (const node of bRoot.listNodes()) if (!keepNodes.has(node) && !node.listChildren().some((c) => keepNodes.has(c))) node.dispose();
const scene = bRoot.listScenes()[0];
for (const node of [...keepNodes]) if (!node.getParentNode() && !scene.listChildren().includes(node)) scene.addChild(node);

// meshes stay separate (the boy and girl heads are the same shape), their data is shared
await base.transform(prune({ keepAttributes: true }), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.SKIN] }), quantize({ pattern: /^(NORMAL|JOINTS_0|WEIGHTS_0)$/, quantizeNormal: 10 }));
base.createExtension(KHRMeshQuantization).setRequired(true);
const glb = await io.writeBinary(base);

// ---- 4. textures ------------------------------------------------------------------------------

function readTGA(file) {
  const b = readFileSync(file);
  const idLen = b[0], cmType = b[1], type = b[2];
  const w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (cmType !== 0 || (type !== 2 && type !== 10)) throw new Error(`${file}: unsupported TGA type ${type}`);
  const px = bpp / 8;
  const out = new Uint8Array(w * h * 4);
  let o = 18 + idLen;
  const put = (i) => {
    out[i * 4] = b[o + 2]; out[i * 4 + 1] = b[o + 1]; out[i * 4 + 2] = b[o];
    out[i * 4 + 3] = px === 4 ? b[o + 3] : 255;
  };
  if (type === 2) for (let i = 0; i < w * h; i++) { put(i); o += px; }
  else {
    let i = 0;
    while (i < w * h) {
      const c = b[o++];
      const n = (c & 127) + 1;
      if (c & 128) { for (let k = 0; k < n; k++) put(i++); o += px; }
      else for (let k = 0; k < n; k++) { put(i++); o += px; }
    }
  }
  // flip to top-down unless the image already is
  if (!(desc & 0x20)) {
    const row = w * 4, tmp = new Uint8Array(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row, z = (h - 1 - y) * row;
      tmp.set(out.subarray(a, a + row)); out.copyWithin(a, z, z + row); out.set(tmp, z);
    }
  }
  return { w, h, data: out };
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const crc = (buf) => { let c = ~0; for (const v of buf) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function resize(img, W, H) {
  if (img.w === W && img.h === H) return img;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(img.w - 1, Math.floor((x / W) * img.w)), sy = Math.min(img.h - 1, Math.floor((y / H) * img.h));
    out.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * W + x) * 4);
  }
  return { w: W, h: H, data: out };
}

const T = (p) => readTGA(join(TEX, p));
const textures = {};
// clothing: colour map and decal map, as the Maya scene wires them
const CLOTHES = {
  m_top: ['0599-0_ColorMap_1.tga', '0599-0_IntensityMap_1.tga'],
  m_bottoms: ['0010-1_ColorMap_1.tga', '0010-1_DecalMap_1.tga'],
  m_shoes: ['0468-0_ColorMap_1.tga', '0468-0_DecalMap_1.tga'],
  f_top: ['0320-0_ColorMap_1.tga', '0320-0_DecalMap_1.tga'],
  f_bottoms: ['0687-0_ColorMap_1.tga', '0687-0_DecalMap_1.tga'],
  f_shoes: ['0334-0_ColorMap_1.tga', '0334-0_DecalMap_1.tga'],
};
for (const [part, [c, d]] of Object.entries(CLOTHES)) {
  const ci = T(`Avatar_texture/${c}`), di = T(`Avatar_texture/${d}`);
  textures[`${part}_color`] = png(ci.w, ci.h, ci.data).toString('base64');
  textures[`${part}_decal`] = png(di.w, di.h, di.data).toString('base64');
}
// the face: one atlas per sex of 128 x 64 cells: left eyes, right eyes, brows, mouths. These are
// the avatar's colourable masks: in the eyes blue marks the whites and red the iris (dark red
// the pupil); brows and lips are red masks; teeth are green.
const face = {};
for (const sex of ['m', 'f']) {
  const B = sex === 'm' ? 'Boy' : 'Girl';
  const sets = sex === 'm'
    ? [['eyeL', 'BoyEye', 'eye_001_default_eye.'], ['eyeR', 'BoyEye', 'rt_eye_001_default_eye.'], ['brow', 'BoyEyebrows', 'eyebrows_001_Default_brows.'], ['mouth', 'BoyMouth', 'mouth_001_Ross_mouth.']]
    : [['eyeL', 'GirlEye', 'eye_014_CircleLashes_eye.'], ['eyeR', 'GirlEye', 'rt_eye_014_CircleLashes_eye.'], ['brow', 'GirlEyebrows', 'eyebrows_002_Girlie_brows.'], ['mouth', 'GirlMouth', 'mouth_002_Girly_mouth.']];
  const CW = 128, CH = 64, G = 4;
  let cells = 0;
  const layout = {};
  const imgs = [];
  for (const [key, dir, prefix] of sets) {
    const files = readdirSync(join(TEX, 'Avatar_face_texture', dir)).filter((f) => f.startsWith(prefix) && f.endsWith('.tga')).sort();
    layout[key] = [cells, files.length];
    for (const f of files) { imgs.push(resize(T(join('Avatar_face_texture', dir, f)), CW, CH)); cells++; }
  }
  const rows = Math.ceil(cells / G);
  const atlas = new Uint8Array(CW * G * CH * rows * 4);
  imgs.forEach((img, cell) => {
    const cx = (cell % G) * CW, cy = Math.floor(cell / G) * CH;
    for (let y = 0; y < CH; y++) atlas.set(img.data.subarray(y * CW * 4, (y + 1) * CW * 4), ((cy + y) * CW * G + cx) * 4);
  });
  textures[`${sex}_face`] = png(CW * G, CH * rows, atlas).toString('base64');
  face[sex] = { grid: G, cw: CW, ch: CH, rows, ...layout };
  void B;
}
// the expressions the custom-animation sample pairs with its walk and jump
const expressions = {};
for (const [name, file] of [['walk', 'WalkExpression.txt'], ['jump', 'JumpExpression.txt']]) {
  const p = join(CUSTOM, file);
  if (!existsSync(p)) continue;
  expressions[name] = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').map(Number));
}

// ---- write ------------------------------------------------------------------------------------

const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const js = `// Generated by tools/avatar/build-avatar.mjs from Microsoft's XNA Game Studio 4.0 Avatar Animation
// Pack and its Maya textures, (c) Microsoft Corporation, used under the Microsoft Permissive License
// (Ms-PL); see LICENSE-avatar.txt. The boy and girl avatar part meshes with their skeleton (glTF),
// ${clips.length} animations as quantized keyframes, the avatar's clothing textures, and its animated face
// textures (eyes, brows, mouths).
export const MESH = '${b64(glb)}';
export const ANIM = ${JSON.stringify({ bones: boneNames, clips })};
export const ANIM_ROT = '${b64(rotQ)}';
export const ANIM_POS = '${b64(posF)}';
export const TEXTURES = ${JSON.stringify(textures)};
export const FACE = ${JSON.stringify(face)};
export const EXPRESSIONS = ${JSON.stringify(expressions)};
`;
mkdirSync(join(root, 'src/assets'), { recursive: true });
writeFileSync(join(root, 'src/assets/avatarData.js'), js);
console.log(`wrote src/assets/avatarData.js: ${(js.length / 1024).toFixed(0)} KB (glb ${(glb.byteLength / 1024).toFixed(0)} KB, ${clips.length} clips)`);
