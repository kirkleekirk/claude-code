import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector4, type IUniform } from 'three';
import { tunables } from '@/core/tunables';
import type { EnvState } from '../api';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '../shared';

const cfg = tunables.group('env.sky', {
  sunSize: { value: 2.3, min: 0.5, max: 6, step: 0.05, label: 'sun radius (deg)' },
  sunBrightness: { value: 26, min: 1, max: 80, step: 0.5 },
  moonSize: { value: 2.0, min: 0.5, max: 6, step: 0.05 },
  moonBrightness: { value: 2.4, min: 0, max: 10, step: 0.1 },
  cloudScale: { value: 1, min: 0.2, max: 4, step: 0.01 },
  cloudSpeed: { value: 0.0035, min: 0, max: 0.05, step: 0.0005 },
  cirrus: { value: 0.45, min: 0, max: 1, step: 0.01 },
  starBrightness: { value: 1.7, min: 0, max: 6, step: 0.05 },
});

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Rotation only: the dome is always centred on the eye, and sits on the far plane.
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
${SHARED_PARS}
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform vec4 uCloud;      // x cover, y scroll, z cirrus, w scale
uniform vec4 uBodies;     // x cos(sun radius), y sun brightness, z cos(moon radius), w moon brightness
uniform vec3 uSunColor;
uniform float uStars;
uniform float uSunScale;
${ATMOSPHERE_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float cloudField(vec2 p) {
  vec2 drift = vec2(uCloud.y, uCloud.y * 0.37);
  float n = texture2D(uNoise, p * 0.034 + drift).r * 0.62;
  n += texture2D(uNoise, p * 0.105 + drift * 1.8).g * 0.27;
  n += texture2D(uNoise, p * 0.36 + drift * 2.6).b * 0.11;
  return n;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = hhSkyColor(dir);
  float cosS = dot(dir, uSunDir);
  float up = smoothstep(-0.02, 0.05, dir.y);

  // Stars: one candidate per cell of a 3D grid on the dome.
  if (uStars > 0.01 && dir.y > 0.0) {
    vec3 p = dir * 210.0;
    vec3 id = floor(p);
    float rnd = hash13(id);
    if (rnd > 0.9962) {
      float tw = 0.7 + 0.3 * sin(uTime * (1.5 + rnd * 40.0) + rnd * 400.0);
      float core = smoothstep(0.42, 0.0, length(fract(p) - 0.5));
      vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.72), fract(rnd * 91.7));
      col += tint * core * tw * uStars * smoothstep(0.03, 0.3, dir.y) * (0.5 + fract(rnd * 13.3));
    }
  }

  // Moon: soft disc with faint maria and a halo.
  float cosM = dot(dir, uMoonDir);
  float moonDisc = smoothstep(uBodies.z - 0.00035, uBodies.z + 0.00035, cosM);
  if (cosM > 0.9) {
    vec2 mp = (dir.xz - uMoonDir.xz) * 22.0;
    float maria = texture2D(uNoise, mp * 0.9 + 0.31).r;
    vec3 moonCol = vec3(0.86, 0.9, 1.0) * (0.72 + 0.4 * maria);
    col = mix(col, moonCol * uBodies.w, moonDisc * up);
    col += vec3(0.45, 0.55, 1.0) * pow(max(cosM, 0.0), 220.0) * 0.18 * uBodies.w * up;
  }

  // Sun: an exaggerated, bloom-hot disc that dims and reddens as it meets the horizon.
  float sunDisc = smoothstep(uBodies.x - 0.0004, uBodies.x + 0.0004, cosS);
  float sunLow = smoothstep(0.0, 0.22, uSunDir.y);
  vec3 sunCol = uSunColor * mix(0.34, 1.0, sunLow) * uBodies.y * uSunScale;
  col = mix(col, sunCol, sunDisc * smoothstep(-0.045, 0.0, dir.y));

  // Clouds: a noise layer projected on a plane overhead, lit from the sun's side.
  if (dir.y > 0.0 && uCloud.x > 0.01) {
    float inv = uCloud.w / (dir.y + 0.07);
    vec2 p = dir.xz * inv;
    float n = cloudField(p);
    float lo = 1.0 - uCloud.x;
    float d = smoothstep(lo - 0.12, lo + 0.2, n);
    vec2 sunFlat = uSunDir.xz / max(length(uSunDir.xz), 0.001);
    float n2 = cloudField(p + sunFlat * 0.55);
    float edge = clamp((n - n2) * 3.2 + 0.5, 0.0, 1.0);
    vec3 lit = uCloudLit * (0.72 + 0.62 * edge);
    vec3 cc = mix(lit, uCloudDark, d * (1.0 - edge) * 0.9);
    float fwd = pow(max(cosS, 0.0), 5.0);
    cc += uSunGlow * fwd * (1.0 - d * 0.55) * 1.6;
    // High thin streaks catch colour first at dawn and last at dusk.
    float ci = texture2D(uNoise, vec2(p.x * 0.006 + uCloud.y * 0.4, p.y * 0.045)).g;
    ci = smoothstep(0.52, 0.86, ci) * uCloud.z * (1.0 - d);
    float fade = smoothstep(0.0, 0.16, dir.y);
    col = mix(col, cc, d * fade * 0.96);
    col += uCloudLit * ci * fade * (0.28 + 0.5 * fwd);
    sunDisc *= 1.0 - d * 0.85;
  }

  // Below the horizon the dome continues as haze so the world's edge never shows a seam.
  if (dir.y < 0.0) col = mix(col, uHorizon * 0.82, smoothstep(0.0, -0.25, dir.y) * 0.6);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The sky: gradient, sun, moon, stars and a lit cloud layer, drawn on the far plane. */
export class SkyDome {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** Scales the sun disc (the reflection probe uses a dimmer sun to avoid doubled highlights). */
  readonly uSunScale: IUniform<number> = { value: 1 };
  private readonly uCloud: IUniform<Vector4> = { value: new Vector4(0.3, 0, 0.4, 1) };
  private readonly uBodies: IUniform<Vector4> = { value: new Vector4() };
  private readonly uCloudLit: IUniform<Color> = { value: new Color() };
  private readonly uCloudDark: IUniform<Color> = { value: new Color() };
  private readonly uSunColor: IUniform<Color> = { value: new Color() };
  private readonly uStars: IUniform<number> = { value: 0 };
  private scroll = 0;

  constructor(shared: SharedUniforms) {
    const uniforms: Record<string, IUniform> = {
      uCloud: this.uCloud, uBodies: this.uBodies, uCloudLit: this.uCloudLit, uCloudDark: this.uCloudDark,
      uSunColor: this.uSunColor, uStars: this.uStars, uSunScale: this.uSunScale,
    };
    shared.attach(uniforms);
    this.material = new ShaderMaterial({
      name: 'hh-sky', uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // after opaques: covered sky pixels fail the depth test
    this.mesh.matrixAutoUpdate = false;
  }

  update(env: EnvState, dt: number): void {
    this.scroll += dt * cfg.cloudSpeed * (0.4 + env.windStrength);
    const cover = Math.min(0.97, 0.12 + env.cloud * 0.78 + env.storm * 0.2);
    this.uCloud.value.set(cover, this.scroll, cfg.cirrus * (1 - env.storm), cfg.cloudScale);
    this.uBodies.value.set(
      Math.cos((cfg.sunSize * Math.PI) / 180), cfg.sunBrightness * (1 - env.storm * 0.9),
      Math.cos((cfg.moonSize * Math.PI) / 180), cfg.moonBrightness * (1 - env.cloud * 0.5),
    );
    this.uCloudLit.value.copy(env.cloudLit);
    this.uCloudDark.value.copy(env.cloudDark);
    // The disc takes the key colour by day; it is hidden by the horizon at night anyway.
    this.uSunColor.value.copy(env.keyColor).lerp(WHITE, 0.35);
    this.uStars.value = env.stars * cfg.starBrightness * (1 - env.cloud * 0.7);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

const WHITE = new Color(1, 1, 1);
