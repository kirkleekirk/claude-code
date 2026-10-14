import * as THREE from '../../vendor/three.module.min.js';
import { patchFog } from '../world/fog.js';

// Loads the converted Kinect Adventures crowd avatars and builds skinned zombie bodies.

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function loadAvatars(url, textureUrls) {
  const json = await (await fetch(url)).json();
  const loader = new THREE.TextureLoader();
  const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
  const [diffuse, emissive] = await Promise.all([load(textureUrls.diffuse), load(textureUrls.emissive)]);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.anisotropy = 4;
  emissive.colorSpace = THREE.SRGBColorSpace;
  const figures = json.figures.map((f) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(f.position)), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(f.normal)), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(f.uv)), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(b64ToBuffer(f.skinIndex)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(f.skinWeight)), 4));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(b64ToBuffer(f.index)), 1));
    g.computeBoundingSphere();
    return { name: f.name, female: f.female, geometry: g, bones: f.bones };
  });
  return { figures, diffuse, emissive, joints: json.joints };
}

export function makeZombieMaterial(av, { tint = 0xffffff, eye = 0xff8a2a, eyeIntensity = 3.2 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: av.diffuse, emissiveMap: av.emissive, emissive: new THREE.Color(eye), emissiveIntensity: eyeIntensity,
    color: new THREE.Color(tint), roughness: 0.85, metalness: 0.0,
  });
  return patchFog(m);
}

// One skinned body with its own skeleton (geometry is shared per figure).
export function buildBody(fig, material) {
  const bones = fig.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(...b.pos);
    bone.quaternion.set(...b.quat);
    return bone;
  });
  fig.bones.forEach((b, i) => {
    if (b.parent != null) bones[b.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(fig.geometry, material);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const map = {};
  bones.forEach((b) => {
    map[b.name] = b;
    b.userData.bindQ = b.quaternion.clone();
    b.userData.bindP = b.position.clone();
  });
  return { mesh, bones: map, list: bones };
}
