// Shared materials. World geometry uses one texture-array material so that a whole
// chunk of buildings/props renders in a single draw call.
import * as THREE from 'three';
import { getTextureArray, getTerrainDetail } from './textures.js';

export const MAX_HORDES = 8;
export const U = {
  uTexArr: { value: null },
  uTime: { value: 0 },
  uWindStr: { value: 1 },
  uLampGlow: { value: 0 },
  uDetail: { value: null },
  uHordes: { value: Array.from({ length: MAX_HORDES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uHordeCount: { value: 0 },
  uWaterDepth: { value: null },
  uWorldSize: { value: new THREE.Vector2(4800, 3000) },
  uFlash: { value: 0 },
};

const HORDE_GLSL = /* glsl */`
uniform vec4 uHordes[${MAX_HORDES}];
uniform int uHordeCount;
float hordeMask(vec2 p) {
  float m = 0.0;
  for (int i = 0; i < ${MAX_HORDES}; i++) {
    if (i >= uHordeCount) break;
    vec4 h = uHordes[i];
    float d = length(p - h.xy);
    m = max(m, (1.0 - smoothstep(h.z * 0.82, h.z * 1.02, d)) * h.w);
  }
  return m;
}
`;

function injectCommon(shader, opts) {
  shader.uniforms.uTexArr = U.uTexArr;
  shader.uniforms.uTime = U.uTime;
  shader.uniforms.uWindStr = U.uWindStr;
  shader.uniforms.uLampGlow = U.uLampGlow;
  shader.uniforms.uHordes = U.uHordes;
  shader.uniforms.uHordeCount = U.uHordeCount;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float aLayer;
attribute float aEmit;
${opts.wind ? 'attribute float aWind; uniform float uTime; uniform float uWindStr;' : ''}
varying float vLayer;
varying float vEmit;
varying vec2 vTUv;
varying vec3 vWPos;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vLayer = aLayer; vEmit = aEmit; vTUv = uv;
${opts.wind ? `
  #ifdef USE_INSTANCING
    vec3 ipos = instanceMatrix[3].xyz;
  #else
    vec3 ipos = vec3(0.0);
  #endif
  vec3 wo = (modelMatrix * vec4(ipos, 1.0)).xyz;
  float ph = wo.x * 0.11 + wo.z * 0.07;
  float sw = aWind * uWindStr;
  transformed.x += (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25) * sw * 0.05;
  transformed.z += (cos(uTime * 1.1 + ph * 1.3) * 0.5) * sw * 0.04;
` : ''}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 wp4 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp4 = instanceMatrix * wp4;
    #endif
    vWPos = (modelMatrix * wp4).xyz;
  }`);
  if (opts.canopyTint) {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `
      vColor = vec3(1.0);
      vColor *= color;
      #ifdef USE_INSTANCING_COLOR
        vColor = mix(vColor, vColor * instanceColor.xyz, step(0.0001, aWind));
      #endif`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTexArr;
uniform float uLampGlow;
varying float vLayer;
varying float vEmit;
varying vec2 vTUv;
varying vec3 vWPos;
${HORDE_GLSL}`)
    .replace('#include <map_fragment>', `
  vec4 texel = texture(uTexArr, vec3(vTUv, floor(vLayer + 0.5)));
  diffuseColor.rgb *= texel.rgb * 1.08;
  {
    float hm = hordeMask(vWPos.xz);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.72, 0.5), hm * 0.55);
  }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vEmit * uLampGlow * 2.5;`);
}

export function makeWorldMaterial(opts = {}) {
  U.uTexArr.value = getTextureArray();
  const Ctor = opts.lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const params = { vertexColors: true, side: opts.side ?? THREE.FrontSide };
  if (!opts.lambert) { params.roughness = opts.roughness ?? 0.92; params.metalness = 0; }
  if (opts.alphaTest) params.alphaTest = opts.alphaTest;
  if (opts.polygonOffset) { params.polygonOffset = true; params.polygonOffsetFactor = opts.polygonOffset; params.polygonOffsetUnits = opts.polygonOffset; }
  const m = new Ctor(params);
  m.onBeforeCompile = (shader) => injectCommon(shader, opts);
  m.customProgramCacheKey = () => 'world-' + (opts.wind ? 'w' : '') + (opts.canopyTint ? 'c' : '') + (opts.lambert ? 'l' : 's') + (opts.polygonOffset ? 'p' : '');
  return m;
}

export function makeTerrainMaterial(opts = {}) {
  U.uDetail.value = getTerrainDetail();
  const Ctor = opts.lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const params = { vertexColors: true };
  if (!opts.lambert) { params.roughness = 0.96; params.metalness = 0; }
  const m = new Ctor(params);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = U.uDetail;
    shader.uniforms.uHordes = U.uHordes;
    shader.uniforms.uHordeCount = U.uHordeCount;
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aDetail;
varying vec3 vDetailW;
varying vec3 vTWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vDetailW = aDetail;
  vTWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;
uniform float uTime;
varying vec3 vDetailW;
varying vec3 vTWPos;
${HORDE_GLSL}`)
      .replace('#include <map_fragment>', `
  vec2 wxz = vTWPos.xz;
  vec3 d1 = texture2D(uDetail, wxz * 0.145).rgb;
  vec3 d2 = texture2D(uDetail, wxz * 0.0213 + 0.37).rgb;
  float det = dot(d1, vDetailW) / max(0.001, vDetailW.x + vDetailW.y + vDetailW.z);
  float macro = d2.b;
  diffuseColor.rgb *= (0.62 + 0.55 * det);
  diffuseColor.rgb *= mix(vec3(0.9, 0.97, 0.84), vec3(1.08, 1.02, 0.95), macro);
  {
    float hm = hordeMask(wxz);
    float n = texture2D(uDetail, wxz * 0.01 + uTime * 0.002).g;
    hm *= smoothstep(0.25, 0.65, n + hm * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.12) + diffuseColor.rgb * 0.35, hm * 0.75);
  }`);
  };
  m.customProgramCacheKey = () => 'terrain-' + (opts.lambert ? 'l' : 's');
  return m;
}

// Plain helpers
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.8, metalness: opts.metalness ?? 0, ...opts.extra });
}
