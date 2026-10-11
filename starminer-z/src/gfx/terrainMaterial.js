// The material every chunk is drawn with. Light comes from five places:
//   the sky (blue by day, the nebula's violet by night), scaled by the voxel sky light;
//   the sun, where the block sees the sky, with real shadows when they're switched on;
//   the giant planet, rose-gold, strongest at night when it's nearly full;
//   torches, lanterns and lava, through the voxel block light, flickering;
//   and the glowing blocks themselves.
// Distant terrain fades into the colour of the sky just above the horizon in that direction.

import * as THREE from 'three';
import { GLSL_SKY_COMMON } from './sky.js';
import { TEX } from '../world/blocks.js';

export const GLSL_LIGHTING = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uPlanetLight;
uniform vec3 uAmbientUp;
uniform vec3 uAmbientDown;
uniform vec3 uTorchColor;
uniform float uTorchFlicker;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uHaze;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform vec3 uShadowLightDir;
uniform float uShadowTexel;

float lightCurve(float l) { return l * l * 0.97 + l * 0.03; }

float shadowAt(vec3 world, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMatrix * vec4(world + n * 0.06, 1.0);
  vec3 s = sp.xyz / sp.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float bias = 0.0012;
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float d = texture2D(uShadowMap, s.xy + vec2(float(i), float(j)) * uShadowTexel).r;
    sum += s.z - bias > d ? 0.0 : 1.0;
  }
  float sh = sum / 9.0;
  // fade out toward the edge of the shadowed area
  vec2 e = abs(s.xy - 0.5) * 2.0;
  float fade = smoothstep(0.8, 1.0, max(e.x, e.y));
  return mix(sh, 1.0, fade);
}

// Light arriving at a surface. sky and blk are the voxel light levels in [0, 1].
vec3 lightAt(vec3 world, vec3 n, float sky, float blk, float ao) {
  float sv = lightCurve(sky);
  vec3 amb = mix(uAmbientDown, uAmbientUp, n.y * 0.5 + 0.5) * sv * ao;
  float open = smoothstep(0.6, 0.93, sky);
  float sh = open > 0.0 ? shadowAt(world, n) : 0.0;
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 sun = uSunColor * (ndl * open * sh * mix(0.7, 1.0, ao) / 3.14159);
  float ndp = max(dot(n, uPlanetDir), 0.0) * 0.85 + 0.15;
  float shP = uShadowOn > 0.5 && uSunDir.y < 0.0 ? sh : 1.0;
  vec3 pl = uPlanetLight * ndp * sv * ao * mix(0.55, 1.0, shP);
  float bl = lightCurve(blk);
  vec3 torch = uTorchColor * bl * 2.2 * uTorchFlicker * mix(0.6, 1.0, ao);
  return amb + sun + pl + torch;
}

vec3 applyFog(vec3 col, vec3 world) {
  vec3 v = world - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-4);
  float edge = smoothstep(uFogStart, uFogEnd, dist);
  float haze = 1.0 - exp(-dist * uHaze);
  float f = max(edge, haze);
  return mix(col, fogColorFor(dir), f);
}
`;

const VS = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aUv;
attribute vec4 aData;
varying vec3 vWorld;
varying vec2 vUv;
varying float vLayer;
varying vec3 vNormal;
varying float vAO;
varying float vSky;
varying float vBlk;
const vec3 NORMALS[6] = vec3[6](vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, -1));
void main() {
  vec3 p = aPos / 16.0;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vUv = aUv / 16.0;
  vLayer = aData.x;
  int n = int(aData.y) / 32;
  vNormal = NORMALS[n];
  float ao = mod(floor(aData.y / 8.0), 4.0);
  vAO = ao;
  vSky = aData.z / 255.0;
  vBlk = aData.w / 255.0;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
precision highp sampler2DArray;
${GLSL_SKY_COMMON}
${GLSL_LIGHTING}
uniform sampler2DArray uBlocks;
uniform float uTime;
varying vec3 vWorld;
varying vec2 vUv;
varying float vLayer;
varying vec3 vNormal;
varying float vAO;
varying float vSky;
varying float vBlk;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  float layer = floor(vLayer + 0.5);
  vec2 uv = vUv;
  vec2 dx = dFdx(vUv), dy = dFdy(vUv);
  // turn the texture a random quarter-turn per block on tops, so fields of grass and sand don't tile
  if (vNormal.y > 0.5 && (layer == ${TEX.grass_top}.0 || layer == ${TEX.sand}.0 || layer == ${TEX.dirt}.0 || layer == ${TEX.snow}.0 || layer == ${TEX.rock}.0 || layer == ${TEX.bloodstone}.0)) {
    vec2 cell = floor(vWorld.xz + 0.0001);
    float r = floor(h21(cell) * 4.0);
    vec2 f = fract(uv);
    vec2 base = floor(uv);
    if (r == 1.0) { f = vec2(1.0 - f.y, f.x); dx = vec2(-dx.y, dx.x); dy = vec2(-dy.y, dy.x); }
    else if (r == 2.0) { f = 1.0 - f; dx = -dx; dy = -dy; }
    else if (r == 3.0) { f = vec2(f.y, 1.0 - f.x); dx = vec2(dx.y, -dx.x); dy = vec2(dy.y, -dy.x); }
    uv = base + f;
  }
  float emissive = 0.0;
  if (layer == ${TEX.lava}.0) {
    // molten: slow churning
    uv += vec2(sin(uTime * 0.6 + vWorld.z * 1.3), cos(uTime * 0.5 + vWorld.x * 1.1)) * 0.035;
    emissive = 2.4 + 0.5 * sin(uTime * 1.7 + vWorld.x * 0.7 + vWorld.z * 0.9);
  }
  vec4 tex = textureGrad(uBlocks, vec3(uv, layer), dx, dy);
#ifdef CUTOUT
  // keep thin leaves from vanishing in the distance: alpha falls in the small mips
  float lod = log2(max(length(dx), length(dy)) * 64.0);
  float a = tex.a * (1.0 + max(lod, 0.0) * 0.35);
  if (a < 0.5) discard;
#endif
  vec3 albedo = tex.rgb;
  if (layer == ${TEX.lantern}.0 || layer == ${TEX.lantern_top}.0) emissive = 2.6 * tex.a * (0.92 + 0.08 * uTorchFlicker);
  if (layer == ${TEX.torch}.0) emissive = step(0.75, albedo.r) * 3.0;
  float ao = vAO == 0.0 ? 0.42 : vAO == 1.0 ? 0.62 : vAO == 2.0 ? 0.82 : 1.0;
  vec3 light = lightAt(vWorld, vNormal, vSky, vBlk, ao);
  vec3 col = albedo * light + albedo * emissive;
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeTerrainMaterials(skyUniforms, blockArray) {
  const uniforms = {
    ...skyUniforms,
    uBlocks: { value: blockArray },
    uFogStart: { value: 60 },
    uFogEnd: { value: 120 },
    uHaze: { value: 0.0016 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uShadowLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uShadowTexel: { value: 1 / 2048 },
  };
  const base = { uniforms, vertexShader: VS, fragmentShader: FS };
  const opaque = new THREE.ShaderMaterial({ ...base });
  const cutout = new THREE.ShaderMaterial({ ...base, defines: { CUTOUT: 1 }, side: THREE.DoubleSide });
  return { opaque, cutout, uniforms };
}
