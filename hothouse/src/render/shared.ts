import { Color, Vector3, Vector4, type IUniform, type Texture } from 'three';

/**
 * Uniforms shared by every HOTHOUSE shader (sky, fog, water, wet roads, vegetation…).
 * Each entry is one live `{ value }` object: materials reference the same object, so updating it
 * here updates every program with no per-material bookkeeping.
 */
export class SharedUniforms {
  readonly uTime: IUniform<number> = { value: 0 };
  /** Unit vector pointing at the sun (may be below the horizon). */
  readonly uSunDir: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };
  readonly uMoonDir: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };
  /** Sky gradient, linear RGB. */
  readonly uZenith: IUniform<Color> = { value: new Color() };
  readonly uMid: IUniform<Color> = { value: new Color() };
  readonly uHorizon: IUniform<Color> = { value: new Color() };
  /** Warm in-scatter around the sun, pre-multiplied by its strength. */
  readonly uSunGlow: IUniform<Color> = { value: new Color() };
  /** Pink belt opposite the sun, rgb + strength in a. */
  readonly uBelt: IUniform<Vector4> = { value: new Vector4() };
  /** x: ground-fog density, y: height falloff (1/m), z: distance-haze density, w: max opacity. */
  readonly uFog: IUniform<Vector4> = { value: new Vector4(0.002, 0.03, 0.0004, 1) };
  /** x: wetness 0–1, y: rain 0–1, z: night factor 0–1, w: lightning flash 0–1. */
  readonly uWeather: IUniform<Vector4> = { value: new Vector4() };
  /** x, y: wind direction on the ground plane, z: strength, w: gust phase. */
  readonly uWind: IUniform<Vector4> = { value: new Vector4(1, 0, 0.5, 0) };
  /** Tileable RGBA noise (R low, G mid, B high frequency fbm, A white). */
  readonly uNoise: IUniform<Texture | null> = { value: null };

  /** Attach all shared uniforms to a shader's uniform table (inside `onBeforeCompile`). */
  attach(uniforms: Record<string, IUniform>): void {
    uniforms.uTime = this.uTime;
    uniforms.uSunDir = this.uSunDir;
    uniforms.uMoonDir = this.uMoonDir;
    uniforms.uZenith = this.uZenith;
    uniforms.uMid = this.uMid;
    uniforms.uHorizon = this.uHorizon;
    uniforms.uSunGlow = this.uSunGlow;
    uniforms.uBelt = this.uBelt;
    uniforms.uFog = this.uFog;
    uniforms.uWeather = this.uWeather;
    uniforms.uWind = this.uWind;
    uniforms.uNoise = this.uNoise;
  }
}

/** Declarations matching `SharedUniforms`. Include once per shader stage that needs them. */
export const SHARED_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec4 uBelt;
uniform vec4 uFog;
uniform vec4 uWeather;
uniform vec4 uWind;
uniform sampler2D uNoise;
`;

/**
 * The atmosphere model, shared by the sky dome and by fog so distant geometry dissolves into
 * exactly the sky colour behind it. Requires `SHARED_PARS`.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
vec3 hhSkyColor(vec3 dir) {
  float h = max(dir.y, 0.0);
  vec3 col = mix(uHorizon, uMid, 1.0 - exp(-h * 5.5));
  col = mix(col, uZenith, smoothstep(0.12, 0.92, h));
  float cosS = dot(dir, uSunDir);
  float hug = exp(-h * 2.6);
  float wide = pow(max(cosS * 0.5 + 0.5, 0.0), 5.0);
  float tight = pow(max(cosS, 0.0), 40.0);
  col += uSunGlow * (wide * 0.6 * hug + tight * 0.85);
  float anti = pow(max(0.5 - cosS * 0.5, 0.0), 3.0);
  float band = exp(-pow((h - 0.09) / 0.08, 2.0));
  col = mix(col, uBelt.rgb, uBelt.a * anti * band);
  return col;
}

// In-scatter colour for a view ray: the sky at the horizon in that direction.
vec3 hhFogColor(vec3 viewDir) {
  vec2 flat2 = viewDir.xz;
  float len = max(length(flat2), 1e-4);
  return hhSkyColor(normalize(vec3(flat2.x / len, 0.035, flat2.y / len)));
}

// Fraction of light replaced by fog between the camera and a world position.
float hhFogAmount(vec3 camPos, vec3 worldPos) {
  vec3 d = worldPos - camPos;
  float dist = length(d);
  float dy = d.y / max(dist, 1e-4);
  float b = uFog.y;
  float t = b * dist * dy;
  // Integral of exp(-b*y) along the ray; the series branch avoids 0/0 for level rays.
  float integral = abs(t) > 1e-3 ? (1.0 - exp(-t)) / t : 1.0 - 0.5 * t;
  float ground = uFog.x * exp(-b * max(camPos.y, 0.0)) * dist * integral;
  float haze = uFog.z * dist;
  return min(1.0 - exp(-(ground + haze)), uFog.w);
}
`;
