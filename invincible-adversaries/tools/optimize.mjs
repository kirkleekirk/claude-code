// Compresses a converted model for the game: weld/dedup, optional simplification of selected meshes,
// WebP textures, quantized attributes and meshopt compression (decoded by vendor/three/addons/libs/meshopt_decoder).
//   node optimize.mjs <in.glb> <out.glb> [simplifyRatio] [meshNameRegex] [maxTextureSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, meshopt, reorder, quantize, textureCompress, simplifyPrimitive, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inF, outF, ratioStr, rx, maxTex] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inF);
const stats = (label) => {
  let v = 0, t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { v += p.getAttribute('POSITION').getCount(); t += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  console.log(label, 'verts', v, 'tris', Math.round(t));
};
stats('in');
await doc.transform(dedup(), weld());
stats('welded');
if (ratioStr) {
  const re = new RegExp(rx || '.');
  const nodeNameOf = (m) => doc.getRoot().listNodes().filter(n => n.getMesh() === m).map(n => n.getName()).join('|');
  for (const m of doc.getRoot().listMeshes()) {
    if (!m.getName()) m.setName(nodeNameOf(m));
    if (!re.test(m.getName())) continue;
    for (const p of m.listPrimitives()) {
      const before = p.getIndices().getCount() / 3;
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: +ratioStr, error: 0.0008, lockBorder: true });
      console.log('simplified', m.getName(), before, '->', p.getIndices().getCount() / 3);
    }
  }
}
for (const m of doc.getRoot().listMeshes()) { if (!m.getName()) m.setName(doc.getRoot().listNodes().filter(n => n.getMesh() === m).map(n => n.getName()).join('|')); }
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log('  mesh', m.getName(), 'verts', p.getAttribute('POSITION').getCount(), 'tris', p.getIndices().getCount() / 3);
await doc.transform(
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 92, ...(maxTex ? { resize: [+maxTex, +maxTex] } : {}) }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeWeight: 8 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
stats('final');
await io.write(outF, doc);
