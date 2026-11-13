// Material registry. Building and prop materials take their tint from vertex
// colours so that one material per texture serves every paint colour.
import * as THREE from 'three';
import { getTex } from './textures.js';

const mats = new Map();

const PARAMS = {
  siding: { rough: 0.85 }, brick: { rough: 0.92 }, paintedBrick: { rough: 0.88 },
  boardBatten: { rough: 0.9 }, planks: { rough: 0.9 }, metal: { rough: 0.55, metal: 0.35 },
  cinder: { rough: 0.95 }, plaster: { rough: 0.95 }, wallpaper: { rough: 0.9 }, trim: { rough: 0.6 },
  concrete: { rough: 0.95 }, stone: { rough: 0.95 }, woodFloor: { rough: 0.55 }, tileChecker: { rough: 0.35 },
  tileWhite: { rough: 0.3 }, carpet: { rough: 1 }, linoleum: { rough: 0.5 }, shingles: { rough: 0.95 },
  roofMetal: { rough: 0.5, metal: 0.4 }, shake: { rough: 0.95 }, tarRoof: { rough: 1 },
  asphalt: { rough: 0.95 }, sidewalk: { rough: 0.95 }, gravel: { rough: 1 }, dirt: { rough: 1 },
  bark: { rough: 1 }, fabric: { rough: 1 }, woodFurn: { rough: 0.6 }, hay: { rough: 1 }, rock: { rough: 0.95 },
  grass: { rough: 1 }, dryGrass: { rough: 1 }, sand: { rough: 1 }, field: { rough: 1 },
};

// Textured, vertex-tinted material.
export function texMat(name) {
  if (mats.has(name)) return mats.get(name);
  const t = getTex(name);
  const p = PARAMS[name] || { rough: 0.9 };
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap || null,
    roughness: p.rough,
    metalness: p.metal || 0,
    vertexColors: true,
  });
  if (t.normalMap) m.normalScale.set(0.9, 0.9);
  m.name = name;
  mats.set(name, m);
  return m;
}

// Untextured colour material (vertex colours).
export function plainMat(kind = 'paint') {
  const key = '_plain_' + kind;
  if (mats.has(key)) return mats.get(key);
  const p = {
    paint: { rough: 0.6, metal: 0 },
    matte: { rough: 0.95, metal: 0 },
    metal: { rough: 0.45, metal: 0.5 },
    plastic: { rough: 0.4, metal: 0 },
    chrome: { rough: 0.25, metal: 0.7 },
  }[kind];
  const m = new THREE.MeshStandardMaterial({ roughness: p.rough, metalness: p.metal, vertexColors: true });
  m.name = key;
  mats.set(key, m);
  return m;
}

export function glassMat() {
  if (mats.has('_glass')) return mats.get('_glass');
  const m = new THREE.MeshStandardMaterial({
    color: 0x9fb4bd, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.32,
    depthWrite: false, side: THREE.DoubleSide,
  });
  m.name = 'glass';
  mats.set('_glass', m);
  return m;
}

export function emissiveMat(color = 0xfff1c8, intensity = 1) {
  const key = '_emis' + color + '_' + intensity;
  if (mats.has(key)) return mats.get(key);
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  mats.set(key, m);
  return m;
}

// Bucket key -> material. Keys: texture name, 'plain:<kind>', 'glass'.
export function materialFor(key) {
  if (key === 'glass') return glassMat();
  if (key.startsWith('plain:')) return plainMat(key.slice(6));
  return texMat(key);
}
