// The material avatars (and the zombies built on them) are drawn with: skinned, lit the same
// way as the world, with the avatar's clothing textures and its animated face (eyes, brows and
// mouth sampled from the face atlas through the head's own UV layers, frame by frame).
//
// Per vertex: colour (skin, hair or a tint for textured clothes), and aPart:
//   x = 0 flat colour, 1 textured clothing (y = texture layer), 2 head (y = 0 left, 1 right half),
//       3 glowing (zombie eyes), 4 bone, 5 recoloured clothing (the texture's luminance times colour),
//       6 rotting skin
// The dead get their rot, grime and blood procedurally, from where a point is on the body in the
// bind pose, so it moves with the skin.

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
varying vec3 vBind;
void main() {
  vBind = position;
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
uniform vec3 uWhite;
uniform vec3 uTeeth;
uniform float uSocket;
uniform float uEyeScale;
uniform float uIrisLo;
uniform float uTear;
uniform float uRot;
uniform float uAged;
uniform vec4 uNose;
uniform float uGrime;
uniform vec3 uSeed;
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
varying vec3 vBind;

vec4 feature(vec2 uv, float cell) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || cell < 0.0) return vec4(0.0);
  return texture(uFace, vec3(uv, uFaceBase + cell));
}
// a feature's coverage, blurred wide (a shadow round sunken eyes and bared teeth)
float halo(vec2 uv, float cell) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || cell < 0.0) return 0.0;
  return textureLod(uFace, vec3(uv, uFaceBase + cell), 3.0).a;
}

float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return vn3(p) * 0.5 + vn3(p * 2.03 + 1.7) * 0.3 + vn3(p * 4.1 + 3.3) * 0.2; }

// dead skin: mottled, greener and darker in patches, with open wounds
vec3 rotSkin(vec3 c, vec3 p) {
  p += uSeed;
  c *= 0.72 + 0.5 * fbm3(p * 26.0);
  c = mix(c, c * vec3(0.5, 0.58, 0.4), smoothstep(0.5, 0.72, fbm3(p * 8.0 + 7.3)));
  float wound = smoothstep(0.66, 0.74, fbm3(p * 13.0 + 3.1));
  c = mix(c, vec3(0.13, 0.015, 0.01), wound * 0.9);
  c = mix(c, vec3(0.32, 0.05, 0.03), smoothstep(0.6, 0.66, fbm3(p * 13.0 + 3.1)) * (1.0 - wound) * 0.6);
  return c;
}
// old bone: yellowed and stained in patches, darker in the cracks
vec3 agedBone(vec3 c, vec3 p) {
  p += uSeed;
  c *= 0.8 + 0.3 * fbm3(p * 30.0);
  c = mix(c, c * vec3(0.72, 0.62, 0.45), smoothstep(0.5, 0.75, fbm3(p * 7.0 + 2.0)));
  c *= 1.0 - 0.3 * smoothstep(0.02, 0.0, abs(fbm3(p * 13.0 + 9.0) - 0.5));
  return c;
}
// filthy clothes: grime, blood soaked in from the edges of tears, stains
vec3 grime(vec3 c, vec3 p) {
  p += uSeed;
  c *= 0.62 + 0.45 * fbm3(p * 18.0);
  c = mix(c, c * vec3(0.45, 0.4, 0.32), smoothstep(0.45, 0.75, fbm3(p * 6.0 + 11.0)) * 0.8);
  float blood = smoothstep(0.62, 0.7, fbm3(p * 9.0 + 5.0));
  c = mix(c, vec3(0.16, 0.012, 0.008), blood * 0.85);
  return c;
}

void main() {
  // fading out (the dead sinking away): a fine dither, so it stays in the opaque pass
  if (uOpacity < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > uOpacity) discard;
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor;
  float part = floor(vPart.x + 0.5);
  float glow = 0.0;
  float spec = 0.08;
  // flat-coloured rags (y = 1) are as filthy as the clothes they hang from
  if (part == 0.0 && vPart.y > 0.5 && uGrime > 0.0) albedo = grime(albedo, vBind);
  if (part == 1.0 || part == 5.0) {
    // rags: torn through in ragged holes, the cloth round them frayed and darker
    float tear = 0.0;
    if (uTear > 0.0) {
      tear = fbm3(vBind * 15.0 + uSeed * 3.0);
      if (tear > 0.73 - 0.06 * uTear) discard;
    }
    vec4 c = texture(uClothes, vec3(vUv, vPart.y));
    albedo = part == 5.0 ? vColor * dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)) : c.rgb * vColor;
    vec4 d = texture(uClothes, vec3(vUvB, vPart.y + 1.0));
    albedo = mix(albedo, d.rgb * mix(vec3(1.0), vColor, 0.3), d.a);
    if (uGrime > 0.0) albedo = mix(albedo, grime(albedo, vBind), uGrime);
    if (uTear > 0.0) albedo *= 1.0 - 0.75 * smoothstep(0.58, 0.68 - 0.06 * uTear, tear);
    spec = 0.05;
  } else if (part == 2.0) {
    // the face, bottom layer first: mouth, eyes, brows. The avatar's masks are coloured here:
    // lips from red, teeth from green; eye whites from blue, the iris from red; brows from red.
    if (uRot > 0.0) albedo = mix(albedo, rotSkin(albedo, vBind), uRot);
    if (uAged > 0.0) albedo = agedBone(albedo, vBind);
    // a skull's nasal cavity: a dark notch where the nose was
    if (uNose.w > 0.0) {
      vec3 d = (vBind - uNose.xyz) / uNose.w;
      float notch = length(vec2(d.x * (1.4 + d.y * 0.8), d.y * 0.9)) - 1.0 + max(0.0, -d.z) * 0.6;
      albedo *= mix(1.0, 0.04, smoothstep(0.15, -0.1, notch));
    }
    float eyeCell = vPart.y < 0.5 ? uFrames.x : uFrames.y;
    if (uSocket > 0.0) albedo *= 1.0 - uSocket * smoothstep(0.02, 0.25, max(halo(vUvB, eyeCell), halo(vUv1, uFrames.w) * 0.8));
    vec4 m = feature(vUv1, uFrames.w);
    vec3 mc = uLip * m.r + uTeeth * m.g + vec3(0.03);
    albedo = mix(albedo, mc, m.a);
    vec4 e = feature((vUvB - 0.5) * uEyeScale + 0.5, eyeCell);
    float ir = smoothstep(uIrisLo, uIrisLo + 0.6, e.r);
    vec3 ec = uWhite * smoothstep(0.15, 0.85, e.b) + uIris * ir + vec3(0.02);
    glow = ir * e.a;
    albedo = mix(albedo, ec, e.a);
    vec4 b = feature(vUvC, uFrames.z);
    // thinner brows: the mask eroded from above and below
    if (uBrowThin > 0.0) b = min(b, min(feature(vUvC + vec2(0.0, uBrowThin), uFrames.z), feature(vUvC - vec2(0.0, uBrowThin), uFrames.z)));
    albedo = mix(albedo, uBrow * (0.6 + 0.4 * b.r), b.a * smoothstep(0.1, 0.5, b.r));
    spec = 0.12;
  } else if (part == 3.0) {
    glow = 1.0;
  } else if (part == 4.0) {
    if (uAged > 0.0) albedo = agedBone(albedo, vBind);
    spec = 0.2;
  } else if (part == 6.0) {
    albedo = rotSkin(albedo, vBind);
    spec = 0.14;
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
  gl_FragColor = vec4(col, 1.0);
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
    uWhite: { value: new THREE.Color(0.92, 0.92, 0.92) },
    uTeeth: { value: new THREE.Color(0.92, 0.92, 0.92) },
    uSocket: { value: 0 },
    uEyeScale: { value: 1 },
    uIrisLo: { value: 0.3 },
    uTear: { value: 0 },
    uRot: { value: 0 },
    uAged: { value: 0 },
    uNose: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGrime: { value: 0 },
    uSeed: { value: new THREE.Vector3() },
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
