// Materials for everything that isn't terrain: held items, dropped items, the player's avatar,
// zombies and skeletons. They share the terrain's lighting (sky, sun, Ember, torches) and fog;
// the voxel light at the object's position comes in through uObjLight. Metal parts reflect
// the sky, so a diamond pick glints blue at noon and rose under Ember at midnight.

import * as THREE from 'three';
import { GLSL_SKY_COMMON } from './sky.js';
import { GLSL_LIGHTING } from './terrainMaterial.js';

const VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute vec3 color;
attribute vec2 aMat;
attribute vec4 aFace;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vColor;
varying vec2 vMat;
varying vec2 vUv;
varying vec4 vFace;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vColor = color;
  vMat = aMat;
#if defined(USE_FACE) || defined(USE_MAP)
  vUv = uv;
#endif
#ifdef USE_FACE
  vFace = aFace;
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
${GLSL_SKY_COMMON}
${GLSL_LIGHTING}
uniform vec2 uObjLight;
uniform vec3 uTint;
uniform float uFlash;
uniform vec3 uEmissiveColor;
uniform float uOpacity;
uniform vec3 uViewPos;
#ifdef USE_FACE
uniform sampler2D uFaceMap;
#endif
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vColor;
varying vec2 vMat;
varying vec2 vUv;
varying vec4 vFace;
void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor * uTint;
#ifdef USE_MAP
  albedo *= texture2D(uMap, vUv).rgb;
#endif
#ifdef USE_FACE
  if (vFace.x > 0.5) {
    vec4 f = texture2D(uFaceMap, vUv);
    albedo = mix(albedo, f.rgb, f.a);
  }
#endif
  float metal = vMat.x, emi = vMat.y;
  vec3 light = lightAt(vWorld, n, uObjLight.x, uObjLight.y, 1.0);
  vec3 col = albedo * light * (1.0 - metal * 0.55);
  // reflections: the sky, and a highlight from the sun or Ember
  vec3 v = normalize(vWorld - uViewPos);
  vec3 r = reflect(v, n);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  float skyVis = lightCurve(uObjLight.x);
  vec3 env = skyLookup(normalize(vec3(r.x, max(r.y, 0.02), r.z)));
  col += env * mix(fres * 0.25, 0.85, metal) * mix(vec3(1.0), albedo, metal) * skyVis;
  vec3 hs = normalize(uSunDir - v);
  float spec = pow(max(dot(n, hs), 0.0), mix(24.0, 90.0, metal)) * mix(0.15, 1.6, metal);
  col += uSunColor * spec * smoothstep(0.6, 0.93, uObjLight.x) / 3.14159;
  vec3 hp = normalize(uPlanetDir - v);
  col += uPlanetLight * pow(max(dot(n, hp), 0.0), 40.0) * metal * 0.6 * skyVis;
  col += albedo * emi * 2.5 + uEmissiveColor;
  col = mix(col, vec3(1.0, 0.25, 0.2), uFlash);
#ifndef NOFOG
  col = applyFog(col, vWorld);
#endif
  gl_FragColor = vec4(col, uOpacity);
}
`;

export function makePropMaterial(skyUniforms, terrainUniforms, opts = {}) {
  const uniforms = {
    ...skyUniforms,
    uFogStart: terrainUniforms.uFogStart,
    uFogEnd: terrainUniforms.uFogEnd,
    uHaze: terrainUniforms.uHaze,
    uShadowMap: terrainUniforms.uShadowMap,
    uShadowMatrix: terrainUniforms.uShadowMatrix,
    uShadowOn: opts.noShadow ? { value: 0 } : terrainUniforms.uShadowOn,
    uShadowLightDir: terrainUniforms.uShadowLightDir,
    uShadowTexel: terrainUniforms.uShadowTexel,
    uObjLight: { value: new THREE.Vector2(1, 0) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
    uEmissiveColor: { value: new THREE.Vector3() },
    uOpacity: { value: 1 },
    uViewPos: { value: new THREE.Vector3() },
  };
  const defines = {};
  if (opts.noFog) defines.NOFOG = 1;
  if (opts.face) { defines.USE_FACE = 1; uniforms.uFaceMap = { value: opts.face }; }
  // a texture the colour multiplies (models made with one)
  if (opts.map) { defines.USE_MAP = 1; uniforms.uMap = { value: opts.map }; }
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VS,
    fragmentShader: FS,
    defines,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? true,
  });
  // the camera position for reflections
  m.onBeforeRender = (r, s, cam) => {
    uniforms.uViewPos.value.setFromMatrixPosition(cam.matrixWorld);
  };
  return m;
}

// Geometry helpers: a geometry with colour and material attributes filled in.
export function paint(geo, hex, metal = 0, emissive = 0) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), mat = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    mat[i * 2] = metal; mat[i * 2 + 1] = emissive;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
  if (!geo.attributes.aFace) geo.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
