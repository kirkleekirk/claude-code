import * as THREE from '../../vendor/three.module.min.js';
import { patchFog } from './fog.js';

// Every world material goes through here so it picks up the sunset height-fog.
export function std(params) {
  return patchFog(new THREE.MeshStandardMaterial(params));
}
export function lambert(params) {
  return patchFog(new THREE.MeshLambertMaterial(params));
}
export function basic(params) {
  return patchFog(new THREE.MeshBasicMaterial(params));
}

function rep(tex, x, y = x) {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

export function buildMaterials(T) {
  const M = {};
  M.concrete = std({ map: rep(T.concrete, 1), normalMap: rep(T.concreteNormal, 1), roughness: 0.92, metalness: 0.0, color: 0xc8c6c0 });
  M.concreteDark = std({ map: rep(T.concrete, 1), normalMap: rep(T.concreteNormal, 1), roughness: 0.95, color: 0x7c7a76 });
  M.floor = std({ map: rep(T.concrete, 1), normalMap: rep(T.concreteNormal, 1), roughness: 0.75, color: 0x8d8a84 });
  M.corrugated = std({ map: rep(T.corrugated, 1), normalMap: rep(T.corrugatedNormal, 1), roughness: 0.62, metalness: 0.25, color: 0xb9c0bb });
  M.steel = std({ map: rep(T.steel, 1), normalMap: rep(T.steelNormal, 1), roughness: 0.55, metalness: 0.35, color: 0xc3cbd3 });
  // painted steel: mostly paint (dielectric), so it still reads in shade
  M.steelDark = std({ map: rep(T.steel, 1), normalMap: rep(T.steelNormal, 1), roughness: 0.62, metalness: 0.25, color: 0x8d949b });
  M.olive = std({ map: rep(T.steel, 1), normalMap: rep(T.steelNormal, 1), roughness: 0.72, metalness: 0.1, color: 0x9aa47a });
  M.rust = std({ map: rep(T.corrugated, 1), roughness: 0.85, metalness: 0.3, color: 0x8a5a3c });
  M.planks = std({ map: rep(T.planks, 1), roughness: 0.9, color: 0xb0a090 });
  M.bark = std({ map: rep(T.bark, 1, 3), normalMap: rep(T.barkNormal, 1, 3), roughness: 0.95, color: 0xb8aaa0 });
  M.log = std({ map: rep(T.bark, 2, 1), normalMap: rep(T.barkNormal, 2, 1), roughness: 0.95, color: 0x8d9a78 });
  M.rock = std({ map: rep(T.rock, 1), normalMap: rep(T.rockNormal, 1), roughness: 0.95, color: 0x9a9e98, vertexColors: true });
  M.asphalt = std({ map: rep(T.asphalt, 1), roughness: 0.92, color: 0x8a8a8a });
  M.gravel = std({ map: T.gravel, normalMap: T.gravelNormal, roughness: 1.0, color: 0x8c8478, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.hazard = std({ map: rep(T.hazard, 1), roughness: 0.7, metalness: 0.2 });
  M.rubber = std({ color: 0x18191a, roughness: 0.9 });
  M.black = std({ color: 0x1c1d1f, roughness: 0.72, metalness: 0.2 });
  M.tarp = std({ color: 0x3e4632, roughness: 0.95 });
  M.sandbag = std({ map: rep(T.gravel, 0.5), color: 0x9a8c6a, roughness: 1.0 });
  M.glass = std({ color: 0x8fb4c4, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
  M.cryo = std({ color: 0x8fe6e2, emissive: 0x2fa8a0, emissiveIntensity: 0.28, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false });
  M.chainlink = std({ map: T.chainlink, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.7, color: 0xb6bcbe });
  M.lampWarm = basic({ color: 0xffd6a0, fog: true });
  M.lampCool = basic({ color: 0xd8ecff });
  M.lampRed = basic({ color: 0xff3a2a });
  M.lampGreen = basic({ color: 0x4dffa0 });
  M.lampAmber = basic({ color: 0xffa040 });
  M.screen = std({ color: 0x0a1a20, emissive: 0x3fb8d8, emissiveIntensity: 0.8, roughness: 0.3 });
  M.white = std({ map: rep(T.steel, 1), color: 0xc6c4bc, roughness: 0.66, metalness: 0.05 });
  M.redPaint = std({ color: 0x7a1c18, roughness: 0.6, metalness: 0.3 });
  M.foliage = std({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false });
  M.fern = std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  M.grass = std({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  M.trunk = std({ map: rep(T.bark, 1, 6), normalMap: rep(T.barkNormal, 1, 6), roughness: 0.95, color: 0x9a8a80 });
  M.fire = basic({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  return M;
}

// Merge many (geometry, matrix) pairs into one BufferGeometry. Avoids the addon dependency.
export function mergeGeometries(list) {
  let vcount = 0;
  let icount = 0;
  let hasColor = false;
  let hasUv = true;
  for (const { geometry } of list) {
    vcount += geometry.attributes.position.count;
    icount += geometry.index ? geometry.index.count : geometry.attributes.position.count;
    if (geometry.attributes.color) hasColor = true;
    if (!geometry.attributes.uv) hasUv = false;
  }
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const uv = hasUv ? new Float32Array(vcount * 2) : null;
  const col = hasColor ? new Float32Array(vcount * 3) : null;
  const index = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  let vo = 0;
  let io = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const { geometry, matrix, color } of list) {
    const g = geometry;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos[(vo + i) * 3] = v.x;
      pos[(vo + i) * 3 + 1] = v.y;
      pos[(vo + i) * 3 + 2] = v.z;
      if (n) {
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = v.x;
        nor[(vo + i) * 3 + 1] = v.y;
        nor[(vo + i) * 3 + 2] = v.z;
      }
      if (uv) {
        uv[(vo + i) * 2] = g.attributes.uv.getX(i);
        uv[(vo + i) * 2 + 1] = g.attributes.uv.getY(i);
      }
      if (col) {
        if (g.attributes.color) {
          col[(vo + i) * 3] = g.attributes.color.getX(i);
          col[(vo + i) * 3 + 1] = g.attributes.color.getY(i);
          col[(vo + i) * 3 + 2] = g.attributes.color.getZ(i);
        } else {
          const c = color || { r: 1, g: 1, b: 1 };
          col[(vo + i) * 3] = c.r;
          col[(vo + i) * 3 + 1] = c.g;
          col[(vo + i) * 3 + 2] = c.b;
        }
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) index[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
