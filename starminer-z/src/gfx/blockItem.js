// Small cubes of a block for held and dropped block items: the block's own textures on a
// little atlas (side, top, bottom), drawn with the prop material so they're lit like the world.

import * as THREE from 'three';
import { BLOCKS, TEXTURES } from '../world/blocks.js';
import { paintTexture, TEX_SIZE } from './blockTextures.js';
import { makePropMaterial, paint } from './propMaterial.js';

const texCache = new Map();
export function blockItemTexture(blockId) {
  let t = texCache.get(blockId);
  if (t) return t;
  const def = BLOCKS[blockId];
  const N = TEX_SIZE;
  const c = document.createElement('canvas');
  c.width = N * 3; c.height = N;
  const g = c.getContext('2d');
  [def.faces[0], def.faces[2], def.faces[3]].forEach((layer, i) => {
    const img = g.createImageData(N, N);
    const d = paintTexture(TEXTURES[layer]);
    if (def.render !== 'cutout') for (let k = 3; k < d.length; k += 4) d[k] = 255;
    img.data.set(d);
    g.putImageData(img, i * N, 0);
  });
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(blockId, t);
  return t;
}

let geo = null;
export function blockItemGeometry() {
  if (geo) return geo;
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  paint(g, 0xffffff);
  const uv = g.attributes.uv, face = g.attributes.aFace;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 6);
    const col = f === 2 ? 1 : f === 3 ? 2 : 0;
    uv.setX(i, (col + uv.getX(i)) / 3);
    face.setX(i, 1);
  }
  geo = g;
  return g;
}

export class BlockItemMaterials {
  constructor(skyUniforms, terrainUniforms, opts = {}) {
    this.sky = skyUniforms;
    this.terrain = terrainUniforms;
    this.opts = opts;
    this.cache = new Map();
  }
  get(blockId) {
    let m = this.cache.get(blockId);
    if (m) return m;
    m = makePropMaterial(this.sky, this.terrain, { ...this.opts, face: blockItemTexture(blockId) });
    if (BLOCKS[blockId].render === 'cutout') m.alphaTest = 0.5;
    this.cache.set(blockId, m);
    return m;
  }
  setLight(v) { for (const m of this.cache.values()) m.uniforms.uObjLight.value.copy(v); }
}
