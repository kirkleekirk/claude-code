// The ripped models are glTF with their binary inline (.gltf.json: hosts that won't serve .glb
// serve .json). GLTFLoader would fetch that binary, and any images, from their data: URLs,
// which a sandboxed page (a published artifact) may not do. So the binary becomes a GLB in
// memory for GLTFLoader to parse as it stands, and the images load as <img> elements.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function bytes(uri) {
  const s = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function glb(json, bin) {
  const js = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(js.length / 4) * 4, bl = Math.ceil(bin.length / 4) * 4;
  const out = new ArrayBuffer(12 + 8 + jl + 8 + bl);
  const dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.set(js, 20);
  u8.fill(0x20, 20 + js.length, 20 + jl);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true);
  u8.set(bin, 28 + jl);
  return out;
}

async function texture(uri) {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const t = new THREE.Texture(img);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export async function loadGltfJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const doc = await r.json();
  const buf = doc.buffers[0];
  const bin = bytes(buf.uri);
  delete buf.uri;
  buf.byteLength = bin.length;
  // the base colour textures, kept aside with the image each one shows
  const images = (doc.images || []).map((im) => im.uri);
  for (const m of doc.materials || []) {
    const bt = m.pbrMetallicRoughness?.baseColorTexture;
    if (!bt) continue;
    m.extras = { ...m.extras, image: doc.textures[bt.index].source };
    delete m.pbrMetallicRoughness.baseColorTexture;
  }
  delete doc.images; delete doc.textures; delete doc.samplers;
  const [gltf, maps] = await Promise.all([new GLTFLoader().parseAsync(glb(doc, bin), ''), Promise.all(images.map(texture))]);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const i = o.material.userData?.image;
    if (i != null) { o.material.map = maps[i]; o.material.needsUpdate = true; }
  });
  return gltf;
}
