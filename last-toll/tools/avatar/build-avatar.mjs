// Builds the avatar asset the game embeds (src/assets/avatarData.js) from the
// XNA Game Studio Avatar Animation Pack (Microsoft, Ms-PL; see LICENSE-avatar.txt).
//
// 1. Convert the pack's FBX files (FBX 6.1) to glTF with FBX2glTF:
//      npx fbx2gltf --binary --anim-framerate bake30 --input walk.fbx --output glb/walk
//    (one per animation; every file carries the same rig and meshes)
// 2. node tools/avatar/build-avatar.mjs <dir of .glb files>
//
// The first file (walk.glb) donates the skeleton and the part meshes. Every file
// donates its animation, reduced to the skeleton's own bones (the rig's IK and
// control groups are baked into them already). Normals, UVs and skin weights are
// quantized; positions stay float so every part keeps the rig's own bind matrices.

import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';
import { readdirSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/avatar/build-avatar.mjs <dir of converted .glb files>'); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// parts we keep, renamed to what the game calls them
const KEEP = {
  boy_body_mesh_Natal: 'm_body', boy_bottoms_Natal: 'm_bottoms', boy_hair_Natal: 'm_hair', boy_shoes_Natal: 'm_shoes', boy_top_Natal: 'm_top',
  BlendShapeEarDefault_Natal: 'm_head',
  girl_body_mesh_Natal: 'f_body', girl_bottoms_Natal: 'f_bottoms', girl_hair_Natal: 'f_hair', girl_shoes_Natal: 'f_shoes', girl_top_Natal: 'f_top',
  girlHead_BlendShapeEarDefault_Natal: 'f_head',
};

const base = await io.read(join(src, 'walk.glb'));
const bRoot = base.getRoot();
const skeletonTop = bRoot.listNodes().find((n) => n.getName() === 'BASE__Skeleton');
const inSkeleton = new Set();
(function mark(n) { inSkeleton.add(n); n.listChildren().forEach(mark); })(skeletonTop);
const boneByName = new Map([...inSkeleton].map((n) => [n.getName(), n]));

// meshes: keep the listed parts, drop the rest (costume template, heels variants)
for (const node of bRoot.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const keep = KEEP[node.getName()];
  if (!keep) { node.setMesh(null); continue; }
  node.setName(keep);
  mesh.setName(keep);
  for (const prim of mesh.listPrimitives()) {
    // the face UVs are all the head needs; vertex colours are flat white
    for (const sem of ['COLOR_0', 'TEXCOORD_1']) if (prim.getAttribute(sem)) prim.setAttribute(sem, null);
    if (!keep.includes('head')) prim.setAttribute('TEXCOORD_0', null);
    prim.getMaterial()?.setName(keep);
  }
}

// animations: skeleton channels only, one clip per source file, packed into a small
// binary block of their own (glTF would spend ~300 KB of JSON on 1,000 channels).
// Every channel is baked on an even clock (dt per clip); one that never moves keeps one key.
for (const anim of bRoot.listAnimations()) anim.dispose();
const boneNames = [...inSkeleton].map((n) => n.getName());
const files = readdirSync(src).filter((f) => f.endsWith('.glb')).sort();
const clips = [];
const rot = [], pos = [];
for (const file of files) {
  const doc = await io.read(join(src, file));
  const anim = doc.getRoot().listAnimations()[0];
  if (!anim) continue;
  const name = basename(file, '.glb');
  let frames = 0, dt = 0;
  const tracks = [];
  for (const ch of anim.listChannels()) {
    const target = ch.getTargetNode();
    const bone = target && boneByName.get(target.getName());
    if (!bone) continue;
    const path = ch.getTargetPath();
    if (path === 'scale') continue;
    // only the root carries translation; the rest of the skeleton rotates
    if (path === 'translation' && bone !== skeletonTop) continue;
    const s = ch.getSampler();
    const times = s.getInput().getArray(), vals = s.getOutput().getArray();
    const w = path === 'rotation' ? 4 : 3;
    const n = times.length;
    frames = Math.max(frames, n);
    if (n > 1) {
      const step = times[1] - times[0];
      if (!dt) dt = step;
      // the converter bakes every channel on the same even clock; bail out loudly if not
      if (Math.abs(step - dt) > 1e-4 || Math.abs(times[n - 1] - times[0] - step * (n - 1)) > 1e-3) throw new Error(`${file}: uneven keys on ${bone.getName()}`);
    }
    let still = true;
    for (let i = 1; i < n && still; i++) for (let k = 0; k < w; k++) if (Math.abs(vals[i * w + k] - vals[k]) > 0.0015) { still = false; break; }
    const count = still ? 1 : n;
    const target_ = path === 'rotation' ? rot : pos;
    const offset = target_.length / w;
    for (let i = 0; i < count * w; i++) target_.push(vals[i]);
    tracks.push([boneNames.indexOf(bone.getName()), path === 'rotation' ? 0 : 1, count, offset]);
  }
  clips.push({ name, frames, dt: +dt.toFixed(6), tracks });
  console.log(`  ${name}: ${tracks.length} tracks, ${tracks.filter((t) => t[2] > 1).length} moving, ${frames} frames`);
}
const rotQ = new Int16Array(rot.length);
for (let i = 0; i < rot.length; i++) rotQ[i] = Math.round(Math.max(-1, Math.min(1, rot[i])) * 32767);
const posF = new Float32Array(pos);

// everything that isn't the skeleton or a kept mesh goes
const keepNodes = new Set(inSkeleton);
for (const node of bRoot.listNodes()) if (node.getMesh()) keepNodes.add(node);
for (const node of bRoot.listNodes()) {
  if (keepNodes.has(node)) continue;
  // re-home kept descendants before removing a control/rig node
  for (const c of node.listChildren()) if ([...keepNodes].some((k) => k === c)) { node.removeChild(c); bRoot.listScenes()[0].addChild(c); }
}
for (const node of bRoot.listNodes()) if (!keepNodes.has(node) && !node.listChildren().some((c) => keepNodes.has(c))) node.dispose();
const scene = bRoot.listScenes()[0];
for (const node of [...keepNodes]) if (!node.getParentNode() && !scene.listChildren().includes(node)) scene.addChild(node);

await base.transform(prune({ keepAttributes: true }), dedup(), quantize({ pattern: /^(NORMAL|TEXCOORD_0|JOINTS_0|WEIGHTS_0)$/, quantizeNormal: 10, quantizeTexcoord: 12 }));
base.createExtension(KHRMeshQuantization).setRequired(true);

const glb = await io.writeBinary(base);
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const head = { bones: boneNames, clips };
const js = `// Generated by tools/avatar/build-avatar.mjs from the XNA Game Studio Avatar Animation Pack
// (c) Microsoft Corporation, used under the Microsoft Permissive License (Ms-PL); see LICENSE-avatar.txt.
// Skeleton and part meshes (boy and girl bodies, heads, hair, tops, bottoms, shoes) as glTF,
// and ${clips.length} animations as quantized keyframes.
export const MESH = '${b64(glb)}';
export const ANIM = ${JSON.stringify(head)};
export const ANIM_ROT = '${b64(rotQ)}';
export const ANIM_POS = '${b64(posF)}';
`;
writeFileSync(join(root, 'src/assets/avatarData.js'), js);
console.log(`wrote src/assets/avatarData.js: glb ${(glb.byteLength / 1024).toFixed(0)} KB, rotations ${(rotQ.byteLength / 1024).toFixed(0)} KB, root motion ${(posF.byteLength / 1024).toFixed(0)} KB, file ${(js.length / 1024).toFixed(0)} KB`);
