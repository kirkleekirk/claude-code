import * as THREE from 'three';
import { COMMON } from './shaderlib.js';
import { commonUniforms } from './globals.js';

const LIT_VERT = /* glsl */`
${COMMON}
attribute vec2 aFx;
uniform vec4 uProp;
varying vec3 vWp; varying vec3 vN; varying vec3 vCol; varying float vGlow;
void main(){
  mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
    mm = mm * instanceMatrix;
  #endif
  vec4 wp = mm * vec4(position, 1.0);
  vec3 origin = mm[3].xyz;
  #ifdef FADE
    float dcam = distance(origin.xz, cameraPosition.xz);
    float fade = 1.0 - smoothstep(uProp.y, uProp.z, dcam);
    wp.xyz = mix(origin, wp.xyz, fade);
  #endif
  #ifdef SWAY
    float ph = origin.x * 0.31 + origin.z * 0.23;
    float w = aFx.y * uProp.x;
    wp.x += w * (sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7 + wp.y) * 0.25) * uWind.x;
    wp.z += w * (cos(uTime * 1.3 + ph * 1.3) * 0.6 + sin(uTime * 2.3 + ph + wp.y) * 0.25) * uWind.z;
    vec2 dp = wp.xz - uPlayer.xz;
    float push = (1.0 - smoothstep(0.0, 1.3, length(dp))) * aFx.y * step(abs(wp.y - uPlayer.y - 0.6), 1.6);
    wp.xz += normalize(dp + 1e-4) * push * 0.45;
    wp.y -= push * 0.2;
  #endif
  #ifdef BOB
    wp.y += sin(uTime * 0.6 + origin.x * 0.13 + origin.z * 0.11) * uProp.w;
  #endif
  vWp = wp.xyz;
  vN = normalize(mat3(mm) * normal);
  vCol = color;
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
  #endif
  vGlow = aFx.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const LIT_FRAG = /* glsl */`
${COMMON}
uniform vec4 uMat;    // wrap, translucency, spec strength, shininess
uniform vec4 uMat2;   // glow, rim, metalness, night glow boost
uniform vec3 uRimCol; uniform vec3 uTint; uniform float uFlash; uniform float uAlpha;
varying vec3 vWp; varying vec3 vN; varying vec3 vCol; varying float vGlow;
void main(){
  if (vWp.y < uClipY) discard;
  vec3 N = normalize(vN);
  #ifdef DOUBLE
    if (!gl_FrontFacing) N = -N;
  #endif
  vec3 V = normalize(cameraPosition - vWp);
  float ndl = dot(N, uSunDir);
  float wrap = max((ndl + uMat.x) / (1.0 + uMat.x), 0.0);
  float ext = 1.0 - uInterior;
  float sh = mix(1.0, keyShadow(vWp), ext);
  vec3 sun = uSunColor * ext;
  vec3 alb = vCol * uTint;
  vec3 emi = alb * vGlow * uMat2.x * (1.0 + uNight * uMat2.w);
  alb *= 1.0 - 0.8 * min(vGlow, 1.0);
  #ifdef UPN
    N = normalize(N * 0.3 + vec3(0.0, 1.0, 0.0));
  #endif
  float metal = uMat2.z;
  vec3 pl = pointLights(vWp, N);
  vec3 col = alb * (sun * wrap * sh + hemiAmbient(N) + pl) * (1.0 - metal * 0.65);
  col += alb * sun * pow(max(dot(-V, uSunDir), 0.0), 3.0) * uMat.y * sh;
  float ndv = max(dot(N, V), 0.0);
  float fr = pow(1.0 - ndv, 3.0);
  vec3 R = reflect(-V, N);
  #ifdef GEM
    col *= 0.5 + 0.8 * ndv;
    emi *= 0.3 + 0.9 * ndv * ndv;
    col += skyGradient(normalize(vec3(R.x, abs(R.y) + 0.05, R.z))) * (0.03 + 0.22 * fr) * ext;
  #endif
  if (metal > 0.01){
    vec3 env = mix(hemiAmbient(R) * 1.6 + pointLights(vWp, R), skyGradient(normalize(vec3(R.x, abs(R.y) + 0.03, R.z))), ext * 0.85);
    col += alb * env * metal * (0.55 + 0.45 * fr);
  }
  vec3 H = normalize(V + uSunDir);
  col += sun * pow(max(dot(N, H), 0.0), uMat.w) * uMat.z * sh;
  col += pl * pow(ndv, 8.0) * uMat.z * 0.15;
  col += uRimCol * fr * uMat2.y * (0.35 + 0.65 * max(sh * ext, uInterior * 0.6));
  col += emi;
  col = mix(col, vec3(4.0, 3.2, 2.6), uFlash);
  col = applyFog(col, vWp);
  gl_FragColor = vec4(col, uAlpha);
}`;

// General-purpose lit material for props, creatures, suits and structures.
export function litMaterial(o = {}) {
  const defines = {};
  if (o.sway) defines.SWAY = 1;
  if (o.fade) defines.FADE = 1;
  if (o.double) defines.DOUBLE = 1;
  if (o.gem) defines.GEM = 1;
  if (o.bob) defines.BOB = 1;
  if (o.upn) defines.UPN = 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, defines,
    uniforms: commonUniforms({
      uProp: { value: new THREE.Vector4(o.sway || 0, o.fade ? o.fade[0] : 0, o.fade ? o.fade[1] : 1, o.bob || 0) },
      uMat: { value: new THREE.Vector4(o.wrap ?? 0.25, o.trans ?? 0, o.spec ?? 0, o.shin ?? 40) },
      uMat2: { value: new THREE.Vector4(o.glow ?? 1, o.rim ?? 0, o.metal ?? 0, o.nightBoost ?? 0) },
      uRimCol: { value: new THREE.Color(o.rimCol ?? 0xffffff) },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      uFlash: { value: 0 },
      uAlpha: { value: o.alpha ?? 1 },
    }),
    vertexColors: true,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!o.transparent,
    depthWrite: o.depthWrite ?? true,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return mat;
}
