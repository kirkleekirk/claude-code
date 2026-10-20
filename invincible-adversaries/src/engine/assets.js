import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const MODEL_URLS = {
  invincible: 'assets/models/invincible.glb',
  eve: 'assets/models/atom-eve.glb',
  omniman: 'assets/models/omni-man.glb',
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export async function loadModels(base = '', onProgress) {
  const keys = Object.keys(MODEL_URLS);
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    const g = await loader.loadAsync(base + MODEL_URLS[k]);
    cache.set(k, g);
    done++;
    onProgress && onProgress(done / keys.length, k);
  }));
}

/** Returns a fresh, independently animatable copy of a hero model. */
export function instantiate(key) {
  const g = cache.get(key);
  if (!g) throw new Error('model not loaded: ' + key);
  const scene = cloneSkinned(g.scene);
  scene.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.frustumCulled = false; // skinned bounds are bind-pose only
    }
  });
  return { scene, animations: g.animations };
}
