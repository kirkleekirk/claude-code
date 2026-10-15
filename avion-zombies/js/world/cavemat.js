import * as THREE from '../../vendor/three.module.min.js';
import { tileNoise, toTexture, normalFromHeight, paint } from './textures.js';
import { patchFog } from './fog.js';
import { clamp } from '../util.js';

// Rock for caves and cliffs: no UVs, so the detail texture is projected from all three axes
// (triplanar) and blended by the surface normal. Vertex colours carry the rock's tint; a wetness
// attribute makes flowstone and pools glossy.

let TEX = null;
// tileable cellular noise: distance to the nearest of a jittered grid of points (0..~1)
function worley(S, cells, seed) {
  let st = seed;
  const r = () => ((st = (st * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + r()) / cells, (j + r()) / cells]);
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const ci = Math.floor(u * cells);
      const cj = Math.floor(v * cells);
      let best = 9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = (ci + di + cells) % cells;
          const b = (cj + dj + cells) % cells;
          const p = pts[b * cells + a];
          let dx = Math.abs(p[0] - u);
          let dy = Math.abs(p[1] - v);
          dx = Math.min(dx, 1 - dx);
          dy = Math.min(dy, 1 - dy);
          best = Math.min(best, Math.hypot(dx, dy));
        }
      }
      out[y * S + x] = best * cells;
    }
  }
  return out;
}

export function caveTextures() {
  if (TEX) return TEX;
  const S = 512;
  const n1 = tileNoise(S, S, 4, 5, 501);
  const n2 = tileNoise(S, S, 16, 4, 502);
  const n3 = tileNoise(S, S, 64, 2, 503);
  const warp = tileNoise(S, S, 3, 3, 504);
  // scallops: shallow dish-shaped hollows left by flowing water
  const sc = worley(S, 9, 77);
  const pits = worley(S, 34, 91);
  const height = new Float32Array(S * S);
  const c = paint(S, S, (x, y, i) => {
    // irregular bedding planes: warped, faint
    const band = Math.sin((y / S) * Math.PI * 2 * 5 + warp[i] * 14 + n1[i] * 3) * 0.5 + 0.5;
    const scallop = Math.min(1, sc[i]);
    const pit = Math.max(0, 0.32 - pits[i]) * 3;
    const h = scallop * 0.5 + n1[i] * 0.35 + n3[i] * 0.2 + band * 0.08 - pit * 0.35;
    height[i] = h;
    // rims of the scallops catch light, their hollows hold grime
    const v = clamp(0.5 + (scallop - 0.55) * 0.42 + (n1[i] - 0.5) * 0.5 + (n3[i] - 0.5) * 0.3 + (band - 0.5) * 0.08 - pit * 0.45 + (n2[i] - 0.5) * 0.2, 0.08, 1);
    const g = Math.round(v * 255);
    return [g, g, g];
  });
  // a few hairline cracks
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(25,22,20,0.5)';
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 22; k++) {
    let x = r() * S;
    let y = r() * S;
    ctx.lineWidth = 0.5 + r() * 1.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s2 = 0; s2 < 7; s2++) {
      x += (r() - 0.5) * 36;
      y += (r() - 0.5) * 36;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const detail = toTexture(c, { srgb: false });
  const normal = normalFromHeight(height, S, S, 5.5);
  detail.userData.shared = normal.userData.shared = true;
  TEX = { detail, normal };
  return TEX;
}

const triVert = /* glsl */ `
varying vec3 vTriPos;
varying vec3 vTriN;
attribute float aWet;
varying float vWet;
`;
const triVertMain = /* glsl */ `
vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriN = normalize(mat3(modelMatrix) * objectNormal);
vWet = aWet;
`;
const triFragPars = /* glsl */ `
varying vec3 vTriPos;
varying vec3 vTriN;
varying float vWet;
uniform sampler2D uRockDetail;
uniform sampler2D uRockNormal;
uniform float uRockScale;
uniform float uRockBump;
vec3 triBlend(vec3 n) {
  vec3 b = pow(abs(n), vec3(4.0));
  return b / max(dot(b, vec3(1.0)), 1e-4);
}
float triDetail(vec3 p, vec3 b) {
  float x = texture2D(uRockDetail, p.zy).r;
  float y = texture2D(uRockDetail, p.xz).r;
  float z = texture2D(uRockDetail, p.xy).r;
  return x * b.x + y * b.y + z * b.z;
}
`;
const triMap = /* glsl */ `
{
  vec3 tb = triBlend(normalize(vTriN));
  float d1 = triDetail(vTriPos * uRockScale, tb);
  float d2 = triDetail(vTriPos * uRockScale * 0.23 + 0.37, tb);
  diffuseColor.rgb *= (0.5 + 1.0 * d1) * (0.72 + 0.56 * d2);
  diffuseColor.rgb *= 1.0 - 0.28 * vWet;
}
`;
const triNormal = /* glsl */ `
{
  vec3 nW = normalize(vTriN);
  vec3 tb = triBlend(nW);
  vec3 p = vTriPos * uRockScale;
  vec3 tnX = texture2D(uRockNormal, p.zy).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(uRockNormal, p.xz).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(uRockNormal, p.xy).xyz * 2.0 - 1.0;
  tnX.xy *= uRockBump; tnY.xy *= uRockBump; tnZ.xy *= uRockBump;
  // whiteout-style blend: tangent offsets added to the surface normal per projection
  vec3 bx = vec3(nW.x, tnX.y + nW.y, tnX.x + nW.z);
  vec3 by = vec3(tnY.x + nW.x, nW.y, tnY.y + nW.z);
  vec3 bz = vec3(tnZ.x + nW.x, tnZ.y + nW.y, nW.z);
  vec3 nWorld = normalize(bx * tb.x + by * tb.y + bz * tb.z);
  normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif
}
`;

// opts: { roughness, scale (texture repeats per metre), bump }
export function caveRockMaterial(opts = {}) {
  const T = caveTextures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRockDetail = { value: T.detail };
    shader.uniforms.uRockNormal = { value: T.normal };
    shader.uniforms.uRockScale = { value: opts.scale ?? 0.42 };
    shader.uniforms.uRockBump = { value: opts.bump ?? 0.9 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + triVert)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + triVertMain);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + triFragPars)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + triMap)
      .replace('#include <normal_fragment_maps>', triNormal)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, vWet);');
  };
  mat.customProgramCacheKey = () => 'caverock';
  return patchFog(mat);
}
