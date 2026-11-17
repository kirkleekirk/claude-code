import {
  BufferAttribute, BufferGeometry, Color, DataTexture, DataUtils, HalfFloatType, LinearFilter, Mesh, RedFormat, ShaderMaterial,
  Vector3, Vector4, type IUniform, type PerspectiveCamera,
} from 'three';
import { tunables } from '@/core/tunables';
import { FOG_APPLY_GLSL } from '@/render/materials/MaterialKit';
import { LAYER_MAIN_ONLY } from '@/render/layers';
import { REFLECTION_GLSL, type PlanarReflection } from '@/render/reflection/PlanarReflection';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '@/render/shared';
import type { EnvState } from '@/render/api';
import type { Heightfield } from '../terrain/Heightfield';

const cfg = tunables.group('water', {
  shallow: '#5FE3D0',
  mid: '#1AA6B8',
  deep: '#0B3270',
  amplitude: { value: 0.32, min: 0, max: 3, step: 0.01 },
  detail: { value: 0.55, min: 0, max: 2, step: 0.01 },
  distortion: { value: 0.035, min: 0, max: 0.2, step: 0.001 },
  glitter: { value: 38, min: 0, max: 200, step: 1 },
  foam: { value: 0.85, min: 0, max: 2, step: 0.01 },
  reflectivity: { value: 1, min: 0, max: 2, step: 0.01 },
});

const VERT = /* glsl */ `
${SHARED_PARS}
uniform sampler2D uDepth;
uniform vec4 uWorldRect;   // origin x, origin z, size, unused
uniform vec4 uSea;         // amplitude, choppiness, time scale, unused
varying vec3 vWorld;
varying vec3 vWaveN;
varying float vDepth;
varying float vCrest;

vec3 gerstner(vec2 p, vec2 dir, float wavelength, float steep, float amp, float speed, inout vec3 tangent, inout vec3 binormal) {
  float k = 6.2831853 / wavelength;
  float c = sqrt(9.8 / k) * speed;
  vec2 d = normalize(dir);
  float f = k * (dot(d, p) - c * uTime);
  float a = amp;
  float q = steep / (k * max(a, 1e-4) * 4.0);
  tangent += vec3(-d.x * d.x * (q * a * k) * sin(f), d.x * (a * k) * cos(f), -d.x * d.y * (q * a * k) * sin(f));
  binormal += vec3(-d.x * d.y * (q * a * k) * sin(f), d.y * (a * k) * cos(f), -d.y * d.y * (q * a * k) * sin(f));
  return vec3(d.x * q * a * cos(f), a * sin(f), d.y * q * a * cos(f));
}

void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 duv = (w.xz - uWorldRect.xy) / uWorldRect.z;
  float depth = max(0.0, -texture2D(uDepth, duv).r);
  if (duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0) depth = 40.0;
  vDepth = depth;
  // Sheltered shallows are calmer; open gulf swells more.
  float amp = uSea.x * (0.25 + 0.75 * smoothstep(1.0, 14.0, depth));
  // Far vertices are sparse: flatten them so camera-following never pops.
  amp *= 1.0 - smoothstep(180.0, 700.0, length(w.xz - cameraPosition.xz));
  vec3 t = vec3(1.0, 0.0, 0.0);
  vec3 b = vec3(0.0, 0.0, 1.0);
  vec2 wind = normalize(vec2(uWind.x, uWind.y) + vec2(0.6, 0.15));
  vec3 off = vec3(0.0);
  off += gerstner(w.xz, wind, 38.0, 0.5 * uSea.y, amp * 0.55, 1.0, t, b);
  off += gerstner(w.xz, vec2(wind.y, -wind.x) * 0.7 + wind * 0.7, 21.0, 0.45 * uSea.y, amp * 0.3, 1.0, t, b);
  off += gerstner(w.xz, vec2(-wind.x * 0.4 + 0.3, wind.y + 0.5), 13.0, 0.4 * uSea.y, amp * 0.18, 1.0, t, b);
  off += gerstner(w.xz, vec2(0.8, -0.6), 61.0, 0.3 * uSea.y, amp * 0.4, 1.0, t, b);
  w.xyz += off;
  vCrest = off.y / max(amp, 1e-3);
  vWaveN = normalize(cross(b, t));
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${SHARED_PARS}
${ATMOSPHERE_GLSL}
${FOG_APPLY_GLSL}
${REFLECTION_GLSL}
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uKeyColor;    // colour × intensity of the key light
uniform vec3 uKeyDir;
uniform vec4 uLook;        // detail, distortion, glitter, foam
uniform float uReflectivity;
varying vec3 vWorld;
varying vec3 vWaveN;
varying float vDepth;
varying float vCrest;

vec2 noiseGrad(vec2 uv, float e) {
  float c = texture2D(uNoise, uv).g;
  float x = texture2D(uNoise, uv + vec2(e, 0.0)).g;
  float z = texture2D(uNoise, uv + vec2(0.0, e)).g;
  return vec2(c - x, c - z);
}

float ripples(vec2 p, float t) {
  // Rain rings: a few expanding circles per cell.
  vec2 cell = floor(p);
  float acc = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 o = vec2(fract(sin(dot(cell + float(i), vec2(12.9898, 78.233))) * 43758.5), fract(sin(dot(cell + float(i) * 3.1, vec2(39.3468, 11.135))) * 24634.6));
    float phase = fract(t * 0.9 + o.x * 7.0);
    float r = length(fract(p) - o) ;
    acc += (1.0 - phase) * smoothstep(0.04, 0.0, abs(r - phase * 0.45));
  }
  return acc;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // Detail normals: two scrolling layers, faded with distance so the far sea never shimmers.
  float fade = 1.0 - smoothstep(60.0, 650.0, dist);
  vec2 wind = vec2(uWind.x, uWind.y);
  float rough = 0.025 + uWeather.y * 0.06;
  vec2 g1 = noiseGrad(vWorld.xz * 0.021 + wind * uTime * 0.018, 1.0 / 256.0);
  vec2 g2 = noiseGrad(vWorld.xz * 0.073 - vec2(wind.y, -wind.x) * uTime * 0.024, 1.0 / 256.0);
  vec2 g3 = noiseGrad(vWorld.xz * 0.19 + wind * uTime * 0.05, 1.0 / 256.0);
  vec2 slope = (g1 * 1.6 + g2 * 1.1 + g3 * 0.6) * uLook.x * (0.55 + uWind.z * 0.9) * fade;
  if (uWeather.y > 0.01) {
    float rr = ripples(vWorld.xz * 0.7, uTime) * uWeather.y * fade;
    slope += vec2(rr * 0.05, -rr * 0.04);
    slope += (texture2D(uNoise, vWorld.xz * 0.9 + uTime * 0.7).b - 0.5) * uWeather.y * 0.25 * fade;
  }
  vec3 N = normalize(vWaveN + vec3(slope.x, 0.0, slope.y) * 6.0);

  // Water body colour by depth, lit by sky and sun.
  float d = vDepth;
  vec3 body = mix(uShallow, uMid, smoothstep(0.3, 3.5, d));
  body = mix(body, uDeep, smoothstep(3.0, 11.0, d));
  vec3 ambient = mix(uHorizon, uZenith, 0.5) * 0.55;
  float sunUp = clamp(uKeyDir.y * 4.0, 0.0, 1.0);
  vec3 lit = body * (ambient + uKeyColor * 0.22 * sunUp);
  // Light through wave crests at low sun: the turquoise glow of golden hour.
  float through = pow(clamp(dot(V, -uKeyDir) * 0.5 + 0.5, 0.0, 1.0), 3.0) * clamp(vCrest * 0.5 + 0.5, 0.0, 1.0);
  lit += uShallow * uKeyColor * through * 0.14 * sunUp;

  // Reflection: planar mirror where available, sky otherwise.
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 skyR = hhSkyColor(normalize(R));
  vec4 refl = hhReflect(vWorld, N.xz * uLook.y, rough);
  vec3 reflCol = mix(skyR, refl.rgb, refl.a);
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 col = mix(lit, reflCol * uReflectivity, clamp(F, 0.0, 1.0));

  // Sun (or moon) glitter: a tight core and a broad sheen; HDR so bloom turns it into stars.
  vec3 H = normalize(uKeyDir + V);
  float NdH = max(dot(N, H), 0.0);
  float spark = pow(NdH, 1400.0) * uLook.z + pow(NdH, 120.0) * 0.9;
  float sparkle = smoothstep(0.82, 1.0, texture2D(uNoise, vWorld.xz * 0.6 + uTime * 0.11).a);
  col += uKeyColor * spark * (0.6 + 1.8 * sparkle) * (1.0 - uWeather.y * 0.8);

  // Shoreline foam: bands that roll in with the swell.
  float shore = 1.0 - smoothstep(0.0, 1.1, d);
  float fn = texture2D(uNoise, vWorld.xz * 0.11 + vec2(uTime * 0.02, 0.0)).b;
  float bands = 0.5 + 0.5 * sin(d * 7.0 - uTime * 1.4 + fn * 5.0);
  float foam = shore * smoothstep(0.45, 0.8, bands * (0.6 + fn * 0.6) + shore * 0.35);
  foam += smoothstep(0.75, 1.15, vCrest) * uWind.z * 0.35 * fn;
  foam = clamp(foam * uLook.w, 0.0, 1.0);
  vec3 foamCol = (uZenith * 0.5 + uHorizon * 0.5 + uKeyColor * 0.35 * sunUp) * 0.95;
  col = mix(col, foamCol, foam * 0.85);

  col = hhApplyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The sea and the bay: one camera-following grid (dense near the eye, coarse at the horizon) with
 * Gerstner swells, depth colour from the heightfield, shoreline foam, the planar mirror and glitter.
 */
export class Water {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly depthTex: DataTexture;
  private readonly uKeyColor: IUniform<Color> = { value: new Color() };
  private readonly uKeyDir: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };
  private readonly uSea: IUniform<Vector4> = { value: new Vector4(0.3, 1, 1, 0) };
  private readonly uLook: IUniform<Vector4> = { value: new Vector4() };
  private readonly uShallow: IUniform<Color> = { value: new Color() };
  private readonly uMid: IUniform<Color> = { value: new Color() };
  private readonly uDeep: IUniform<Color> = { value: new Color() };
  private readonly uReflectivity: IUniform<number> = { value: 1 };
  private readonly spacing: number;

  constructor(hf: Heightfield, shared: SharedUniforms, reflection: PlanarReflection) {
    const r1 = hf.res + 1;
    const half = new Uint16Array(r1 * r1);
    for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(hf.heights[i]!);
    this.depthTex = new DataTexture(half, r1, r1, RedFormat, HalfFloatType);
    this.depthTex.magFilter = LinearFilter;
    this.depthTex.minFilter = LinearFilter;
    this.depthTex.needsUpdate = true;

    const uniforms: Record<string, IUniform> = {
      uDepth: { value: this.depthTex },
      uWorldRect: { value: new Vector4(hf.origin, hf.origin, hf.size, 0) },
      uSea: this.uSea, uLook: this.uLook, uKeyColor: this.uKeyColor, uKeyDir: this.uKeyDir,
      uShallow: this.uShallow, uMid: this.uMid, uDeep: this.uDeep, uReflectivity: this.uReflectivity,
      uReflection: reflection.uReflection, uReflectionMatrix: reflection.uReflectionMatrix, uReflectionInfo: reflection.uReflectionInfo,
    };
    shared.attach(uniforms);
    this.material = new ShaderMaterial({ name: 'hh-water', uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: false });
    const { geometry, spacing } = waterGrid(176, 5200);
    this.spacing = spacing;
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_MAIN_ONLY);
    this.mesh.renderOrder = -1;
  }

  update(env: EnvState, camera: PerspectiveCamera): void {
    // Follow the camera in whole grid steps so vertices never swim.
    const s = this.spacing;
    this.mesh.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
    this.mesh.updateMatrixWorld();
    this.uKeyColor.value.copy(env.keyColor).multiplyScalar(env.keyIntensity);
    this.uKeyDir.value.copy(env.keyDir);
    const storm = env.storm;
    this.uSea.value.set(cfg.amplitude * (1 + env.windStrength * 1.2 + storm * 3.2), 0.8 + storm * 0.6, 1, 0);
    this.uLook.value.set(cfg.detail * (1 + storm * 0.6), cfg.distortion, cfg.glitter, cfg.foam * (1 + storm));
    this.uShallow.value.set(cfg.shallow).lerp(STORM_SHALLOW, storm * 0.7);
    this.uMid.value.set(cfg.mid).lerp(STORM_MID, storm * 0.7);
    this.uDeep.value.set(cfg.deep).lerp(STORM_DEEP, storm * 0.6);
    this.uReflectivity.value = cfg.reflectivity;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.depthTex.dispose();
  }
}

const STORM_SHALLOW = new Color('#5C8A80');
const STORM_MID = new Color('#2E5A5E');
const STORM_DEEP = new Color('#14303A');

/**
 * Square grid whose vertex spacing grows with distance from the centre (|t|^1.9 mapping): about a
 * metre and a half near the camera, tens of metres at the horizon.
 */
function waterGrid(segments: number, halfSize: number): { geometry: BufferGeometry; spacing: number } {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const map = (t: number) => Math.sign(t) * Math.pow(Math.abs(t), 1.9) * halfSize;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i / segments) * 2 - 1;
      const v = (j / segments) * 2 - 1;
      const k = (j * n + i) * 3;
      pos[k] = map(u);
      pos[k + 1] = 0;
      pos[k + 2] = map(v);
    }
  }
  const idx = new Uint32Array(segments * segments * 6);
  let t = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  // The innermost spacing is what the camera snapping must respect.
  const spacing = map(2 / segments) - map(0);
  return { geometry: g, spacing: Math.max(0.5, spacing * 4) };
}
