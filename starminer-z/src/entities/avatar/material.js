// The material avatars (and the zombies built on them) are drawn with: skinned, lit the same
// way as the world, with the avatar's clothing textures and its animated face (eyes, brows and
// mouth sampled from the face atlas through the head's own UV layers, frame by frame).
//
// Per vertex: colour (skin, hair or a tint for textured clothes), and aPart:
//   x = 0 flat colour, 1 textured clothing (y = texture layer), 2 head (y = 0 left, 1 right half),
//       3 glowing (zombie eyes), 4 bone, 5 recoloured clothing (the texture's luminance times colour)

import * as THREE from 'three';
import { GLSL_SKY_COMMON } from '../../gfx/sky.js';
import { GLSL_LIGHTING } from '../../gfx/terrainMaterial.js';

const VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute vec3 color;
attribute vec2 uv1;
attribute vec2 aUvB;
attribute vec2 aUvC;
attribute vec2 aPart;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vColor;
varying vec2 vUv;
varying vec2 vUv1;
varying vec2 vUvB;
varying vec2 vUvC;
varying vec2 vPart;
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
  vUv = uv; vUv1 = uv1; vUvB = aUvB; vUvC = aUvC; vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
precision highp sampler2DArray;
${GLSL_SKY_COMMON}
${GLSL_LIGHTING}
uniform vec2 uObjLight;
uniform sampler2DArray uClothes;
uniform sampler2DArray uFace;
uniform float uFaceBase;
uniform vec4 uFrames; // left eye, right eye, brow, mouth: atlas cells
uniform float uGrid;
uniform vec3 uIris;
uniform vec3 uLip;
uniform vec3 uBrow;
uniform float uBrowThin;
uniform vec3 uGlow;
uniform float uFlash;
uniform vec3 uViewPos;
uniform float uOpacity;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vColor;
varying vec2 vUv;
varying vec2 vUv1;
varying vec2 vUvB;
varying vec2 vUvC;
varying vec2 vPart;

vec4 feature(vec2 uv, float cell) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || cell < 0.0) return vec4(0.0);
  return texture(uFace, vec3(uv, uFaceBase + cell));
}

void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor;
  float part = floor(vPart.x + 0.5);
  float glow = 0.0;
  float spec = 0.08;
  if (part == 1.0 || part == 5.0) {
    vec4 c = texture(uClothes, vec3(vUv, vPart.y));
    albedo = part == 5.0 ? vColor * dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)) : c.rgb * vColor;
    vec4 d = texture(uClothes, vec3(vUvB, vPart.y + 1.0));
    albedo = mix(albedo, d.rgb * mix(vec3(1.0), vColor, 0.3), d.a);
    spec = 0.05;
  } else if (part == 2.0) {
    // the face, bottom layer first: mouth, eyes, brows. The avatar's masks are coloured here:
    // lips from red, teeth from green; eye whites from blue, the iris from red; brows from red.
    vec4 m = feature(vUv1, uFrames.w);
    vec3 mc = uLip * m.r + vec3(0.92) * m.g + vec3(0.03);
    albedo = mix(albedo, mc, m.a);
    vec4 e = feature(vUvB, vPart.y < 0.5 ? uFrames.x : uFrames.y);
    vec3 ec = vec3(0.92) * smoothstep(0.15, 0.85, e.b) + uIris * smoothstep(0.3, 0.9, e.r) + vec3(0.02);
    glow = smoothstep(0.3, 0.9, e.r) * e.a;
    albedo = mix(albedo, ec, e.a);
    vec4 b = feature(vUvC, uFrames.z);
    // thinner brows: the mask eroded from above and below
    if (uBrowThin > 0.0) b = min(b, min(feature(vUvC + vec2(0.0, uBrowThin), uFrames.z), feature(vUvC - vec2(0.0, uBrowThin), uFrames.z)));
    albedo = mix(albedo, uBrow * (0.6 + 0.4 * b.r), b.a * smoothstep(0.1, 0.5, b.r));
    spec = 0.12;
  } else if (part == 3.0) {
    glow = 1.0;
  } else if (part == 4.0) {
    spec = 0.2;
  }
  vec3 light = lightAt(vWorld, n, uObjLight.x, uObjLight.y, 1.0);
  // the avatar's colours are display colours, made for its own soft studio light
  vec3 col = albedo * 0.82 * light;
  vec3 v = normalize(vWorld - uViewPos);
  // soft sheen and a rim of sky light
  vec3 hs = normalize(uSunDir - v);
  col += uSunColor * pow(max(dot(n, hs), 0.0), 30.0) * spec * smoothstep(0.6, 0.93, uObjLight.x) / 3.14159;
  float rim = pow(1.0 - max(dot(n, -v), 0.0), 3.0);
  col += skyLookup(normalize(vec3(n.x, abs(n.y) + 0.1, n.z))) * rim * 0.12 * lightCurve(uObjLight.x) * albedo;
  col += uGlow * glow;
  col = mix(col, vec3(1.0, 0.18, 0.12) * max(light.r, 0.3), uFlash);
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, uOpacity);
}
`;

export function makeCharacterMaterial(skyUniforms, terrainUniforms, faceTex, clothes, opts = {}) {
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
    uClothes: { value: clothes },
    uFace: { value: faceTex },
    uFrames: { value: new THREE.Vector4(0, 14, 28, 33) },
    uGrid: { value: 8 },
    uFaceBase: { value: opts.faceBase ?? 0 },
    uIris: { value: new THREE.Color(0.2, 0.45, 0.85) },
    uLip: { value: new THREE.Color(0.55, 0.3, 0.26) },
    uBrow: { value: new THREE.Color(0.18, 0.12, 0.08) },
    uBrowThin: { value: 0 },
    uGlow: { value: new THREE.Vector3() },
    uFlash: { value: 0 },
    uViewPos: { value: new THREE.Vector3() },
    uOpacity: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VS,
    fragmentShader: FS,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
  });
  m.onBeforeRender = (r, s, cam) => { uniforms.uViewPos.value.setFromMatrixPosition(cam.matrixWorld); };
  return m;
}
