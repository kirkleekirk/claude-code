import * as THREE from '../../vendor/three.module.min.js';
import { fogUniforms, foliageUniforms } from './fog.js';
import { clamp, lerp, DEG } from '../util.js';

// Golden hour -> blue hour -> moonrise. `t` is driven by the round number so the
// match literally fades from the first reference photo to the last.
const KEYS = [0, 0.25, 0.5, 0.75, 1.0];
const TOD = {
  sunElev: [6.5, 1.8, -4, -9, -14],
  sunColor: ['#ffbd8a', '#ff9862', '#ff7a6a', '#a8b2e0', '#b4bfe6'],
  sunInt: [2.7, 2.1, 0.85, 0.85, 1.0],
  hemiSky: ['#a28fcc', '#8f78bc', '#8474b8', '#7a86c0', '#8a96c8'],
  hemiGround: ['#4a4232', '#40352a', '#40384c', '#454a62', '#4a4e64'],
  hemiInt: [2.5, 2.4, 2.8, 3.4, 4.0],
  // image-based ambient from the sky itself (the night sky is dark, so it gets more)
  envInt: [1.2, 1.25, 1.4, 2.2, 2.6],
  zenith: ['#3b4b8e', '#2f3c80', '#232867', '#141a46', '#0a0e2b'],
  horizon: ['#ffad6e', '#ff8a62', '#d4688e', '#6b4d8b', '#2f2d58'],
  glow: ['#ffcf94', '#ffa070', '#ff8078', '#8c609c', '#3b3b6c'],
  fog: ['#8e7ea8', '#7a6a9b', '#5c4e84', '#35325e', '#272a4e'],
  fogSun: ['#ffb588', '#f49377', '#c96a8c', '#5c4778', '#27274b'],
  fogDensity: [0.0125, 0.014, 0.016, 0.018, 0.02],
  cloudLit: ['#ffc4a2', '#ff9c8c', '#e07ca2', '#6e5d9c', '#3c3c6c'],
  cloudShade: ['#8c6c9c', '#6f5b93', '#4b3f79', '#272751', '#15172f'],
  mtn: ['#2c2942', '#28203c', '#1d1b35', '#12132b', '#0b0c1f'],
  stars: [0, 0, 0.25, 0.75, 1],
  moonElev: [-12, -6, 5, 15, 24],
  exposure: [1.12, 1.15, 1.3, 1.5, 1.62],
};

const tmpA = new THREE.Color();
// indoor ambient drifts from the sky's tint toward neutral lamp-lit grey
const INDOOR_TINT = new THREE.Color(0.62, 0.6, 0.58);
const tmpB = new THREE.Color();

function sampleKey(name, t) {
  const arr = TOD[name];
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1]) i++;
  const f = clamp((t - KEYS[i]) / (KEYS[i + 1] - KEYS[i]), 0, 1);
  if (typeof arr[0] === 'number') return lerp(arr[i], arr[i + 1], f);
  tmpA.set(arr[i]);
  tmpB.set(arr[i + 1]);
  return tmpA.clone().lerp(tmpB, f);
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFrag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uFog;
uniform vec3 uFogSun;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uMtn;
uniform float uStars;
uniform float uTime;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uCloudCover;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
float noise1(float x) {
  float i = floor(x); float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), u);
}
float ridgeLine(float az, float freq, float seed) {
  float s = 0.0, a = 0.55, f = freq;
  for (int i = 0; i < 5; i++) { s += a * (1.0 - abs(noise1(az * f + seed) * 2.0 - 1.0)); f *= 2.1; a *= 0.47; }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float sunDot = dot(dir, uSunDir);
  float up = clamp(h, 0.0, 1.0);
  float t = pow(up, 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  // warm wash along the horizon on the sun side, cooler opposite
  float sideSun = clamp(dot(normalize(vec2(dir.x, dir.z) + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
  col = mix(col, mix(uFog, uHorizon, sideSun), (1.0 - t) * 0.55);
  col += uGlow * (pow(max(sunDot, 0.0), 6.0) * 0.9 + pow(max(sunDot, 0.0), 1.5) * 0.25) * (1.0 - 0.6 * t);
  // sun disc
  col += vec3(1.0, 0.86, 0.66) * 18.0 * smoothstep(0.99955, 0.9998, sunDot) * uSunVis;
  col += uGlow * 1.6 * pow(max(sunDot, 0.0), 220.0) * uSunVis;

  // altocumulus / mackerel sky
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.18) * 1.35 + vec2(uTime * 0.004, uTime * 0.0015);
    float big = fbm(uv * 0.55);
    float cells = fbm(uv * 3.2 + big * 1.5);
    float n = big * 0.55 + cells * 0.6;
    float cov = smoothstep(uCloudCover, uCloudCover + 0.22, n);
    cov *= smoothstep(0.02, 0.2, h) * (1.0 - 0.6 * smoothstep(0.55, 0.95, h));
    float lit = pow(clamp(sunDot * 0.5 + 0.5, 0.0, 1.0), 2.2);
    vec3 cloudCol = mix(uCloudShade, uCloudLit, lit * (0.7 + 0.5 * cells));
    // moonlit rims at night
    cloudCol += vec3(0.45, 0.5, 0.75) * pow(max(dot(dir, uMoonDir), 0.0), 18.0) * uMoonVis * 0.6;
    col = mix(col, cloudCol, cov * 0.92);
  }

  // stars
  if (uStars > 0.01 && h > 0.0) {
    vec3 sp = floor(dir * 420.0);
    float s = hash3(sp);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 80.0);
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9965, 1.0, s) * tw * uStars * smoothstep(0.05, 0.3, h) * 1.6;
  }

  // crescent moon
  float md = dot(dir, uMoonDir);
  if (uMoonVis > 0.0) {
    float disc = smoothstep(0.99955, 0.9997, md);
    vec3 away = normalize(uMoonDir - uSunDir + vec3(0.0, 1e-4, 0.0));
    vec3 off = normalize(uMoonDir + away * 0.014);
    float shadow = smoothstep(0.99955, 0.9997, dot(dir, off));
    col += vec3(1.0, 0.97, 0.9) * 4.0 * disc * (1.0 - shadow) * uMoonVis;
    col += vec3(0.5, 0.55, 0.8) * pow(max(md, 0.0), 300.0) * 0.6 * uMoonVis;
  }

  // layered ridgelines of the Olympics, hazier with distance
  float az = atan(dir.z, dir.x);
  vec3 hazeCol = mix(uFog, uFogSun, pow(max(sunDot, 0.0), 3.0));
  float m3 = 0.045 + 0.12 * ridgeLine(az, 1.6, 3.0);
  float m2 = 0.02 + 0.085 * ridgeLine(az, 2.4, 11.0);
  float m1 = -0.012 + 0.06 * ridgeLine(az, 3.5, 27.0);
  if (h < m3) col = mix(mix(uMtn, hazeCol, 0.72), hazeCol, smoothstep(m3 - 0.01, m3 - 0.07, h) * 0.8);
  if (h < m2) col = mix(mix(uMtn, hazeCol, 0.5), hazeCol, smoothstep(m2 - 0.01, m2 - 0.07, h) * 0.85);
  if (h < m1) col = mix(mix(uMtn, hazeCol, 0.28), hazeCol, smoothstep(m1 - 0.005, m1 - 0.05, h) * 0.9);
  // valley fog sea below the horizon
  if (h < -0.005) col = mix(col, hazeCol * 0.92, smoothstep(-0.005, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uFogSun: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uMtn: { value: new THREE.Color() },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uSunVis: { value: 1 },
      uMoonVis: { value: 0 },
      uCloudCover: { value: 0.46 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 260;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xa08ccc, 0x3a3424, 0.9);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0x8e7ea8, 0.017);
    scene.fog = this.fog;

    this.sunAzimuth = -168 * DEG; // west-north-west over the ridge
    this.moonAzimuth = 152 * DEG; // young crescent in the afterglow, west-south-west
    this.t = 0;
    this.target = 0;
    this.exposure = 1;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.fogBoost = 0; // swarm rounds roll the fog in
    this.fogBoostTarget = 0;
    this.indoor = 0;
    this.envInt = 1;
    this.hemiBoost = 1;
    this.hemiBase = 1;
    this.hemiSkyBase = new THREE.Color();
    this.apply(0);
  }

  setShadowSize(size, enabled) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  dirFrom(az, elev, out) {
    return out.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
  }

  apply(t) {
    this.t = t;
    const u = this.uniforms;
    const sunElev = sampleKey('sunElev', t) * DEG;
    const moonElev = sampleKey('moonElev', t) * DEG;
    this.dirFrom(this.sunAzimuth, sunElev, this.sunDir);
    this.dirFrom(this.moonAzimuth, moonElev, this.moonDir);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uZenith.value.copy(sampleKey('zenith', t));
    u.uHorizon.value.copy(sampleKey('horizon', t));
    u.uGlow.value.copy(sampleKey('glow', t));
    const fogCol = sampleKey('fog', t);
    const fogSun = sampleKey('fogSun', t);
    u.uFog.value.copy(fogCol);
    u.uFogSun.value.copy(fogSun);
    u.uCloudLit.value.copy(sampleKey('cloudLit', t));
    u.uCloudShade.value.copy(sampleKey('cloudShade', t));
    u.uMtn.value.copy(sampleKey('mtn', t));
    u.uStars.value = sampleKey('stars', t);
    u.uSunVis.value = clamp((sunElev / DEG + 1.5) / 2, 0, 1);
    u.uMoonVis.value = clamp((moonElev / DEG + 1) / 4, 0, 1);

    // fog: swarm rounds tint it darker and thicker
    const boost = this.fogBoost;
    this.fog.color.copy(fogCol).multiplyScalar(1 - boost * 0.35);
    this.baseFogDensity = sampleKey('fogDensity', t) * (1 + boost * 1.8);
    this.baseFogDist = 0.0042 * (1 + boost * 1.2);
    this.applyFogScale();
    fogUniforms.uFogSunColor.value.copy(fogSun).multiplyScalar(1 - boost * 0.4);
    fogUniforms.uFogSunDir.value.copy(this.sunDir);

    // lights: sun until it sets, then the moon takes over the shadow-casting light
    const sunInt = sampleKey('sunInt', t);
    const night = clamp((t - 0.55) / 0.2, 0, 1);
    const lightDir = this.lightDir;
    if (night > 0.5) lightDir.copy(this.moonDir);
    else lightDir.copy(this.sunDir);
    lightDir.y = Math.max(lightDir.y, Math.sin(9 * DEG));
    lightDir.normalize();
    this.sun.color.copy(sampleKey('sunColor', t));
    this.sun.intensity = sunInt;
    foliageUniforms.uSunDirW.value.copy(night > 0.5 ? this.moonDir : this.sunDir);
    foliageUniforms.uSunCol.value.copy(this.sun.color).multiplyScalar(Math.min(1.2, sunInt * 0.45) * (1 - boost * 0.5));
    this.hemiSkyBase.copy(sampleKey('hemiSky', t));
    this.hemi.color.copy(this.hemiSkyBase).lerp(INDOOR_TINT, 0.5 * this.indoor);
    this.hemi.groundColor.copy(sampleKey('hemiGround', t));
    this.hemiBase = sampleKey('hemiInt', t) * (1 - boost * 0.25);
    this.hemi.intensity = this.hemiBase * this.hemiBoost;
    this.exposure = sampleKey('exposure', t);
    this.envInt = sampleKey('envInt', t) * (1 - boost * 0.3);
  }

  // Indoors the haze thins out so walls read as walls (0 = outside, 1 = fully inside).
  setIndoor(k) {
    if (Math.abs(k - this.indoor) < 1e-3) return;
    this.indoor = k;
    this.applyFogScale();
  }

  applyFogScale() {
    const s = 1 - 0.55 * this.indoor;
    this.fog.density = this.baseFogDensity * s;
    fogUniforms.uFogDistDensity.value = this.baseFogDist * s;
    this.hemi.color.copy(this.hemiSkyBase).lerp(INDOOR_TINT, 0.5 * this.indoor);
  }

  update(dt, center, time) {
    if (Math.abs(this.target - this.t) > 1e-4 || Math.abs(this.fogBoostTarget - this.fogBoost) > 1e-3) {
      this.fogBoost += (this.fogBoostTarget - this.fogBoost) * Math.min(1, dt * 0.5);
      this.apply(this.t + (this.target - this.t) * Math.min(1, dt * 0.25));
    }
    this.uniforms.uTime.value = time;
    this.hemi.intensity = this.hemiBase * this.hemiBoost;
    this.mesh.position.copy(center);
    // shadow frustum follows the player, snapped to texels to stop shimmering
    const d = 120;
    const snap = (84 / this.sun.shadow.mapSize.x);
    const cx = Math.round(center.x / snap) * snap;
    const cz = Math.round(center.z / snap) * snap;
    this.sun.target.position.set(cx, center.y, cz);
    this.sun.position.set(cx + this.lightDir.x * d, center.y + this.lightDir.y * d, cz + this.lightDir.z * d);
    this.sun.target.updateMatrixWorld();
  }

  // round -> time of day
  setRound(round, instant = false) {
    this.target = clamp((round - 1) / 14, 0, 1);
    if (instant) this.apply(this.target);
  }
}
