// Surface atlas: every building/prop texture lives in one texture array so a
// whole building (all its materials) renders in a single draw call. Vertices
// carry a `surf` attribute = (layer, roughness, metalness).
import * as THREE from 'three';
import { getTex } from './textures.js';

// Ordered layers. Layer 0 is flat white for painted / untextured surfaces.
const LAYER_NAMES = [
  '_white', 'siding', 'brick', 'paintedBrick', 'boardBatten', 'planks', 'metal', 'cinder', 'plaster',
  'wallpaper', 'trim', 'concrete', 'stone', 'woodFloor', 'tileChecker', 'tileWhite', 'carpet', 'linoleum',
  'shingles', 'roofMetal', 'shake', 'tarRoof', 'bark', 'fabric', 'woodFurn', 'hay', 'asphalt', 'sidewalk',
  'gravel', 'rock',
];
const PARAMS = {
  _white: [0.6, 0], siding: [0.85, 0], brick: [0.92, 0], paintedBrick: [0.88, 0], boardBatten: [0.9, 0],
  planks: [0.9, 0], metal: [0.5, 0.35], cinder: [0.95, 0], plaster: [0.95, 0], wallpaper: [0.9, 0],
  trim: [0.6, 0], concrete: [0.95, 0], stone: [0.95, 0], woodFloor: [0.55, 0], tileChecker: [0.35, 0],
  tileWhite: [0.3, 0], carpet: [1, 0], linoleum: [0.5, 0], shingles: [0.95, 0], roofMetal: [0.5, 0.4],
  shake: [0.95, 0], tarRoof: [1, 0], bark: [1, 0], fabric: [1, 0], woodFurn: [0.6, 0], hay: [1, 0],
  asphalt: [0.95, 0], sidewalk: [0.95, 0], gravel: [1, 0], rock: [0.95, 0],
};
const PLAIN = {
  paint: [0.6, 0], matte: [0.95, 0], metal: [0.45, 0.5], plastic: [0.4, 0], chrome: [0.25, 0.7],
};
const layerIndex = new Map(LAYER_NAMES.map((n, i) => [n, i]));

let SIZE = 512;
export function setAtlasSize(s) { SIZE = s; }

const surfCache = new Map();
// Returns { layer, rough, metal, tile:[w,h] } for a bucket key.
export function surf(key) {
  let s = surfCache.get(key);
  if (s) return s;
  if (key === 'glass') { s = { layer: 0, rough: 0.05, metal: 0.6, tile: [1, 1] }; surfCache.set(key, s); return s; }
  if (key.startsWith('plain:')) {
    const p = PLAIN[key.slice(6)] || PLAIN.paint;
    s = { layer: 0, rough: p[0], metal: p[1], tile: [1, 1] };
  } else {
    const li = layerIndex.get(key);
    if (li === undefined) { console.warn('atlas: unknown surface', key); return surf('plain:paint'); }
    const p = PARAMS[key] || [0.9, 0];
    const tile = key === '_white' ? [1, 1] : getTileOf(key);
    s = { layer: li, rough: p[0], metal: p[1], tile };
  }
  surfCache.set(key, s);
  return s;
}
const TILES = {};
function getTileOf(name) {
  if (!TILES[name]) TILES[name] = getTex(name).tile;
  return TILES[name];
}

let albedoArr = null, normalArr = null;
function buildArrays() {
  if (albedoArr) return;
  const n = LAYER_NAMES.length;
  const A = new Uint8Array(SIZE * SIZE * 4 * n);
  const N = new Uint8Array(SIZE * SIZE * 4 * n);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  LAYER_NAMES.forEach((name, i) => {
    const off = i * SIZE * SIZE * 4;
    if (name === '_white') {
      A.fill(255, off, off + SIZE * SIZE * 4);
      for (let p = 0; p < SIZE * SIZE; p++) { N[off + p * 4] = 128; N[off + p * 4 + 1] = 128; N[off + p * 4 + 2] = 255; N[off + p * 4 + 3] = 255; }
      return;
    }
    const t = getTex(name);
    TILES[name] = t.tile;
    ctx.clearRect(0, 0, SIZE, SIZE);
    // canvas Y is flipped relative to UV; DataArrayTexture uploads rows bottom-first,
    // so draw flipped to keep the same orientation as a CanvasTexture with flipY.
    ctx.save(); ctx.translate(0, SIZE); ctx.scale(1, -1);
    ctx.drawImage(t.map.image, 0, 0, SIZE, SIZE);
    ctx.restore();
    A.set(ctx.getImageData(0, 0, SIZE, SIZE).data, off);
    if (t.normalMap) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save(); ctx.translate(0, SIZE); ctx.scale(1, -1);
      ctx.drawImage(t.normalMap.image, 0, 0, SIZE, SIZE);
      ctx.restore();
      const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
      // canvas flip inverts the green (V) channel direction
      for (let p = 0; p < SIZE * SIZE; p++) {
        N[off + p * 4] = d[p * 4]; N[off + p * 4 + 1] = 255 - d[p * 4 + 1]; N[off + p * 4 + 2] = d[p * 4 + 2]; N[off + p * 4 + 3] = 255;
      }
    } else {
      for (let p = 0; p < SIZE * SIZE; p++) { N[off + p * 4] = 128; N[off + p * 4 + 1] = 128; N[off + p * 4 + 2] = 255; N[off + p * 4 + 3] = 255; }
    }
    // free the source canvases
    t.map.dispose(); if (t.normalMap) t.normalMap.dispose();
  });
  const mk = (data, srgb) => {
    const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, n);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  albedoArr = mk(A, true);
  normalArr = mk(N, false);
}

let opaqueMat = null;
export function buildingMaterial() {
  if (opaqueMat) return opaqueMat;
  buildArrays();
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flat.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: white, normalMap: flat, roughness: 1, metalness: 1 });
  m.normalScale.set(0.9, 0.9);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAlbedoArr = { value: albedoArr };
    sh.uniforms.uNormalArr = { value: normalArr };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray uAlbedoArr;\nuniform sampler2DArray uNormalArr;\nvarying vec3 vSurf;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture( uAlbedoArr, vec3( vMapUv, floor( vSurf.x + 0.5 ) ) );')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.z;')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture( uNormalArr, vec3( vNormalMapUv, floor( vSurf.x + 0.5 ) ) ).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`);
  };
  m.customProgramCacheKey = () => 'holdfast-atlas-v1';
  m.name = 'atlas';
  opaqueMat = m;
  return m;
}

let glass = null;
export function glassMaterial() {
  if (glass) return glass;
  glass = new THREE.MeshStandardMaterial({
    color: 0x9fb4bd, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.3,
    depthWrite: false, side: THREE.DoubleSide,
  });
  glass.name = 'glass';
  return glass;
}

export function materialForBucket(key) {
  return key === 'glass' ? glassMaterial() : buildingMaterial();
}
