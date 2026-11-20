import type { MeshStandardMaterial } from 'three';
import type { MaterialKit, ShaderExtension } from '@/render/materials/MaterialKit';
import { REFLECTION_GLSL, type PlanarReflection } from '@/render/reflection/PlanarReflection';

/**
 * Asphalt with procedural markings. Ribbons carry `win` = (profile id, half width, length, flags)
 * and UVs (u = lateral metres, positive on the a→b driver's right; v = metres from node a).
 * Junction fills carry flags & 4 and world-space UVs. Wet roads mirror the city via the planar
 * reflection; dry asphalt keeps a faint grazing sheen.
 */

const PARS = /* glsl */ `
attribute vec4 win;
varying vec4 vRoad;
varying vec2 vRoadUv;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vRoad;
varying vec2 vRoadUv;
${REFLECTION_GLSL}
const vec3 PAINT_WHITE = vec3(0.86, 0.82, 0.72);
const vec3 PAINT_YELLOW = vec3(0.85, 0.56, 0.12);
float rLine(float au, float pos, float halfW, float aa) { return 1.0 - smoothstep(halfW - aa, halfW + aa, abs(au - pos)); }
float rDash(float v, float on, float period) { return step(fract(v / period), on / period); }
// Shared between the colour and surface hooks (each hook runs in its own block).
float rdPaint;
float rdRough;
float hh2Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const COLOR = /* glsl */ `
float profile = floor(vRoad.x + 0.5);
float hw = vRoad.y;
float len = vRoad.z;
float flags = vRoad.w;
float junction = mod(floor(flags / 4.0), 2.0);
vec2 wp = vHHWorld.xz;
float n1 = texture2D(uNoise, wp * 0.011).r;
float n2 = texture2D(uNoise, wp * 0.063).g;
float n3 = texture2D(uNoise, wp * 0.37).b;
vec3 asphalt = diffuseColor.rgb * (0.82 + 0.26 * n1) * (0.93 + 0.12 * n3);
// Repair patches: slightly darker rectangles.
vec2 pc = floor(wp / vec2(7.0, 5.0));
float patchMask = step(0.93, hh2Hash(pc)) * step(0.15, fract(wp.x / 7.0)) * step(fract(wp.x / 7.0), 0.85) * step(0.2, fract(wp.y / 5.0)) * step(fract(wp.y / 5.0), 0.8);
asphalt *= 1.0 - patchMask * 0.18;
// Cracks: sparse hairlines, only in older stretches of road.
float crackZone = smoothstep(0.62, 0.8, texture2D(uNoise, wp * 0.004).r);
float crack = smoothstep(0.975, 0.997, 1.0 - abs(texture2D(uNoise, wp * 0.09).b * 2.0 - 1.0)) * 0.22 * crackZone;
asphalt *= 1.0 - crack;
// Oil drips down the middle of each lane.
asphalt *= 1.0 - smoothstep(0.72, 0.9, n2) * 0.08;
rdPaint = 0.0;
vec3 paintCol = PAINT_WHITE;
rdRough = 0.0;
if (junction < 0.5 && profile > 0.5) {
  float u = vRoadUv.x;
  float v = vRoadUv.y;
  float au = abs(u);
  vec2 fw = max(fwidth(vRoadUv), vec2(1e-3));
  float aa = fw.x * 0.9;
  float yellow = 0.0;
  float white = 0.0;
  // Tyre tracks: darker, smoother bands in each lane.
  float lane = 0.0;
  if (profile == 1.0) {
    yellow = rLine(au, 1.75, 0.07, aa);
    white = rLine(au, 5.0, 0.07, aa) * rDash(v, 3.0, 9.0) + rLine(au, 8.4, 0.08, aa);
    float stall = rLine(fract(v / 6.5) * 6.5, 0.0, 0.06, fw.y) * step(8.4, au) * step(au, 10.4);
    white = max(white, stall);
    lane = smoothstep(0.6, 0.0, abs(au - 3.3)) + smoothstep(0.6, 0.0, abs(au - 6.7));
  } else if (profile == 2.0) {
    yellow = rLine(au, 0.16, 0.06, aa);
    white = rLine(au, 3.3, 0.07, aa) * rDash(v, 3.0, 9.0) + rLine(au, 6.6, 0.08, aa);
    float stall = rLine(fract(v / 6.2) * 6.2, 0.0, 0.06, fw.y) * step(6.6, au) * step(au, 8.6);
    white = max(white, stall);
    lane = smoothstep(0.6, 0.0, abs(au - 1.7)) + smoothstep(0.6, 0.0, abs(au - 5.0));
  } else if (profile == 3.0) {
    yellow = rLine(au, 0.0, 0.06, aa) * rDash(v, 3.0, 7.5);
    white = rLine(au, 3.3, 0.07, aa);
    lane = smoothstep(0.6, 0.0, abs(au - 1.7));
  } else if (profile == 5.0) {
    yellow = rLine(au, 0.95, 0.08, aa);
    white = rLine(au, 4.4, 0.08, aa) * rDash(v, 3.0, 12.0) + rLine(au, 8.0, 0.08, aa) * rDash(v, 3.0, 12.0) + rLine(au, 11.6, 0.1, aa);
    lane = smoothstep(0.7, 0.0, abs(au - 2.6)) + smoothstep(0.7, 0.0, abs(au - 6.2)) + smoothstep(0.7, 0.0, abs(au - 9.8));
  } else if (profile == 6.0) {
    yellow = rLine(au, 0.55, 0.07, aa);
    white = rLine(au, 3.9, 0.07, aa) * rDash(v, 3.0, 9.0) + rLine(au, 7.4, 0.08, aa);
    lane = smoothstep(0.6, 0.0, abs(au - 2.2)) + smoothstep(0.6, 0.0, abs(au - 5.6));
  } else if (profile == 7.0) {
    yellow = rLine(au, 0.15, 0.06, aa);
    white = rLine(au, 3.4, 0.08, aa);
    lane = smoothstep(0.6, 0.0, abs(au - 1.7));
  }
  // Crosswalks and stop lines where the road meets a junction.
  float fromStart = v;
  float fromEnd = len - v;
  float zebra = step(0.5, fract((u + hw) / 1.0)) * step(0.15, hw - au);
  if (mod(flags, 2.0) > 0.5 && fromStart < 3.4) {
    white = max(white, zebra * step(0.5, fromStart) * step(fromStart, 3.1));
  }
  if (mod(floor(flags / 2.0), 2.0) > 0.5 && fromEnd < 3.4) {
    white = max(white, zebra * step(0.5, fromEnd) * step(fromEnd, 3.1));
  }
  if (mod(flags, 2.0) > 0.5) white = max(white, step(3.7, fromStart) * step(fromStart, 4.15) * step(u, 0.0) * step(-hw + 0.3, u));
  if (mod(floor(flags / 2.0), 2.0) > 0.5) white = max(white, step(3.7, fromEnd) * step(fromEnd, 4.15) * step(0.0, u) * step(u, hw - 0.3));
  // Worn paint.
  float wear = smoothstep(0.25, 0.7, n2 + n3 * 0.4);
  white *= 0.55 + 0.45 * wear;
  yellow *= 0.6 + 0.4 * wear;
  rdPaint = max(white, yellow);
  paintCol = yellow > white ? PAINT_YELLOW : PAINT_WHITE;
  asphalt *= 1.0 - lane * 0.07;
  rdRough = -lane * 0.12;
}
diffuseColor.rgb = mix(asphalt, paintCol, clamp(rdPaint, 0.0, 1.0));
`;

const SURFACE = /* glsl */ `
roughnessFactor = clamp(roughnessFactor + rdRough - rdPaint * 0.1, 0.05, 1.0);
`;

const FINAL = /* glsl */ `
{
  vec3 V = normalize(cameraPosition - vHHWorld);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  float puddle = smoothstep(0.42, 0.66, texture2D(uNoise, vHHWorld.xz * 0.045).r);
  float wet = uWeather.x;
  // Rain stipples the puddles so reflections shiver.
  vec2 jitter = (texture2D(uNoise, vHHWorld.xz * 0.6 + uTime * vec2(0.9, 0.7)).ba - 0.5) * 0.012 * uWeather.y;
  float mirror = wet * mix(0.45, 1.0, puddle);
  float amount = mirror * (0.3 + 0.7 * fres) + 0.05 * fres;
  vec4 refl = hhReflect(vHHWorld, jitter, mix(0.55, 0.04, puddle * wet));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, refl.rgb, clamp(amount, 0.0, 0.92) * refl.a);
}
`;

export function createRoadMaterial(kit: MaterialKit, reflection: PlanarReflection): MeshStandardMaterial {
  const ext: ShaderExtension = {
    key: 'road-v1',
    uniforms: { uReflection: reflection.uReflection, uReflectionMatrix: reflection.uReflectionMatrix, uReflectionInfo: reflection.uReflectionInfo },
    vertexPars: PARS,
    vertexMain: 'vRoad = win; vRoadUv = uv;',
    fragmentPars: FRAG_PARS,
    fragmentColor: COLOR,
    fragmentSurface: SURFACE,
    fragmentFinal: FINAL,
  };
  const m = kit.standard({ color: '#3E3A3D', roughness: 0.86, metalness: 0, wet: true, extend: ext });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  return m;
}
