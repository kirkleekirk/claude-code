import { BlendFunction, Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

/**
 * The final colour pass: exposure → AgX-style tone map → analytic grade (contrast, saturation,
 * split toning) → vignette → film grain. Parameters come from the environment's time-of-day keys,
 * so the grade is a continuous function of clock and weather: the analytic equivalent of blending
 * per-time-of-day LUTs, with no banding and no texture regeneration.
 */

const FRAG = /* glsl */ `
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uTintAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainTime;
uniform vec4 uLook;   // x: warmth, y: fade (lifted blacks), z: mono mix, w: unused

// AgX (Troy Sobotka), using the compact fit by Benjamin Wrensch.
const mat3 AGX_IN = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                         0.0784335999999992, 0.878468636469772, 0.0784336,
                         0.0792237451477643, 0.0791661274605434, 0.879142973793104);
const mat3 AGX_OUT = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                          -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                          -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  c = AGX_IN * max(c, 0.0);
  c = clamp(log2(max(c, 1e-10)), minEv, maxEv);
  c = (c - minEv) / (maxEv - minEv);
  return agxCurve(c);
}
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = agx(inputColor.rgb * uExposure);

  // Look, applied in the tone curve's own (display-like) space.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, 0.0), vec3(uContrast));
  luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = luma + uSaturation * (c - luma);

  // Split toning: shadows lean violet, highlights lean gold. Luma-preserving.
  vec3 sh = uShadowTint / max(dot(uShadowTint, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  vec3 hi = uHighTint / max(dot(uHighTint, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  float shadowW = (1.0 - smoothstep(0.0, 0.45, luma)) * uTintAmount;
  float highW = smoothstep(0.5, 1.0, luma) * uTintAmount;
  c = mix(c, c * sh, shadowW * 0.6);
  c = mix(c, c * hi, highW * 0.5);
  // A whisper of tint in the deepest blacks so nothing is ever neutral grey or pure black.
  c += uShadowTint * 0.022 * (1.0 - smoothstep(0.0, 0.22, luma)) * uTintAmount;

  c.r *= 1.0 + uLook.x * 0.06;
  c.b *= 1.0 - uLook.x * 0.06;
  c = mix(c, c * 0.9 + 0.045, uLook.y);
  c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uLook.z);

  c = AGX_OUT * c;
  c = pow(max(c, 0.0), vec3(2.2)); // back to linear; the pass encodes to sRGB

  vec2 q = uv - 0.5;
  float vig = smoothstep(0.85, 0.2, dot(q, q) * 1.9);
  c *= mix(1.0, vig, uVignette);

  float n = ign(gl_FragCoord.xy + fract(uGrainTime) * vec2(61.0, 37.0)) - 0.5;
  c += c * n * uGrain * 0.9 + n * uGrain * 0.012;

  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`;

export interface GradeParams {
  exposure: number;
  contrast: number;
  saturation: number;
  shadowTint: Color;
  highTint: Color;
  tint: number;
  vignette: number;
  grain: number;
}

/** Photo-mode style overrides layered on top of the time-of-day grade. */
export interface LookOverride {
  warmth: number;
  fade: number;
  mono: number;
}

export class GradeEffect extends Effect {
  constructor() {
    super('HothouseGrade', FRAG, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, Uniform>([
        ['uExposure', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uSaturation', new Uniform(1)],
        ['uShadowTint', new Uniform(new Color(0.2, 0.1, 0.5))],
        ['uHighTint', new Uniform(new Color(1, 0.85, 0.6))],
        ['uTintAmount', new Uniform(0.2)],
        ['uVignette', new Uniform(0.35)],
        ['uGrain', new Uniform(0.05)],
        ['uGrainTime', new Uniform(0)],
        ['uLook', new Uniform([0, 0, 0, 0])],
      ]),
    });
  }

  set(p: GradeParams, time: number): void {
    const u = this.uniforms;
    u.get('uExposure')!.value = p.exposure;
    u.get('uContrast')!.value = p.contrast;
    u.get('uSaturation')!.value = p.saturation;
    (u.get('uShadowTint')!.value as Color).copy(p.shadowTint);
    (u.get('uHighTint')!.value as Color).copy(p.highTint);
    u.get('uTintAmount')!.value = p.tint;
    u.get('uVignette')!.value = p.vignette;
    u.get('uGrain')!.value = p.grain;
    u.get('uGrainTime')!.value = time;
  }

  setLook(look: LookOverride): void {
    const v = this.uniforms.get('uLook')!.value as number[];
    v[0] = look.warmth;
    v[1] = look.fade;
    v[2] = look.mono;
  }
}
