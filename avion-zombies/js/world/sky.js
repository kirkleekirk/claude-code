import * as THREE from '../../vendor/three.module.min.js';
import { fogUniforms, foliageUniforms } from './fog.js';
import { clamp, lerp, DEG } from '../util.js';

// Golden hour -> blue hour -> moonrise. `t` is driven by the round number so the
// match literally fades from the first reference photo to the last.
const KEYS = [0, 0.25, 0.5, 0.75, 1.0];
const TOD = {
  sunElev: [6.5, 1.8, -4, -9, -14],
  sunAz: [-168, -168, -168, -168, -168],
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
  cloudCover: [0.46, 0.46, 0.46, 0.46, 0.46],
  mtn: ['#2c2942', '#28203c', '#1d1b35', '#12132b', '#0b0c1f'],
  stars: [0, 0, 0.25, 0.75, 1],
  moonElev: [-12, -6, 5, 15, 24],
  exposure: [1.12, 1.15, 1.3, 1.5, 1.62],
};

// Fixed looks the Daybreak machine (and the thing it fights) can force on the sky.
// NIGHT: the Nightwarden drags full dark in, a little more violet than the round-15 night.
// DAY: the array's artificial noon. DAWN: the sunrise that stays once the night is over.
const PRESETS = {
  night: {
    sunElev: -16, sunAz: -168, sunColor: '#a8a8e8', sunInt: 0.95, hemiSky: '#8a88cc', hemiGround: '#4a4664', hemiInt: 4.0, envInt: 2.6,
    zenith: '#0b0a2a', horizon: '#33285e', glow: '#4a3878', fog: '#2c2650', fogSun: '#33285a', fogDensity: 0.021,
    cloudLit: '#4a3c74', cloudShade: '#141230', cloudCover: 0.42, mtn: '#0b0a20', stars: 1, moonElev: 26, exposure: 1.62,
  },
  day: {
    sunElev: 52, sunAz: -150, sunColor: '#fff1dc', sunInt: 3.6, hemiSky: '#a9c8f0', hemiGround: '#5b5242', hemiInt: 1.9, envInt: 1.05,
    zenith: '#2f6ccc', horizon: '#bcd8f2', glow: '#fff0d4', fog: '#a6bcd4', fogSun: '#f4ecdc', fogDensity: 0.0068,
    cloudLit: '#ffffff', cloudShade: '#a9b6c8', cloudCover: 0.53, mtn: '#46597a', stars: 0, moonElev: -30, exposure: 0.98,
  },
  dawn: {
    sunElev: 9, sunAz: 12, sunColor: '#ffd2a2', sunInt: 3.0, hemiSky: '#aeb6e2', hemiGround: '#5a4e40', hemiInt: 2.1, envInt: 1.15,
    zenith: '#3f6cc0', horizon: '#ffc898', glow: '#ffe2b4', fog: '#bcb2cc', fogSun: '#ffd2aa', fogDensity: 0.0095,
    cloudLit: '#ffe6cc', cloudShade: '#9c8cb4', cloudCover: 0.48, mtn: '#3c4466', stars: 0, moonElev: -20, exposure: 1.02,
  },
};
const ORDER = ['night', 'dawn', 'day']; // later presets win when several are up
for (const p of Object.values(PRESETS)) {
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string') p[k] = new THREE.Color(v);
}

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
uniform vec3 uSunCol;
uniform float uStars;
uniform float uTime;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uCloudCover;
uniform float uDetail;

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
// Ridged noise sampled around a circle, so each range wraps the horizon with no seam.
float ridges(float az, float f, float seed, float sharp) {
  vec2 c = vec2(cos(az), sin(az));
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    float n = vnoise(c * f + vec2(seed + float(i) * 7.31, seed * 0.71 - float(i) * 3.17));
    n = 1.0 - abs(n * 2.0 - 1.0);
    s += a * pow(n, sharp);
    f *= 2.17;
    a *= 0.46;
  }
  return s;
}
// the high Olympic massif: a few big snowy groups, lower saddles between them
float massif(float az) {
  vec2 c = vec2(cos(az), sin(az));
  return 0.45 + 0.55 * smoothstep(0.25, 0.75, vnoise(c * 1.3 + vec2(17.0, 4.0)));
}
float farRange(float az) { return 0.03 + 0.2 * ridges(az, 1.5, 3.0, 1.9) * massif(az); }
// the same range with only its big shapes, for lighting the lower slopes
float farRangeLow(float az) {
  vec2 c = vec2(cos(az), sin(az));
  float s = 0.0, a = 0.5, f = 1.5;
  for (int i = 0; i < 2; i++) {
    float n = vnoise(c * f + vec2(3.0 + float(i) * 7.31, 3.0 * 0.71 - float(i) * 3.17));
    n = 1.0 - abs(n * 2.0 - 1.0);
    s += a * pow(n, 1.9);
    f *= 2.17;
    a *= 0.46;
  }
  return 0.03 + 0.2 * s * massif(az);
}
// conifer tips along the near ridges
float treeTips(float az) {
  float x = az * 520.0;
  float id = floor(x);
  float fx = fract(x) - 0.5;
  float hgt = 0.45 + 0.55 * hash(vec2(id, 3.7));
  return hgt * max(0.0, 1.0 - abs(fx) * 2.4);
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

  // ---- the Olympic Mountains: three ranges, lit by the sun or the moon, hazier with distance
  vec3 hazeCol = mix(uFog, uFogSun, pow(max(sunDot, 0.0), 3.0));
  if (h < 0.2) {
    float az = atan(dir.z, dir.x);
    float sunAz = atan(uSunDir.z, uSunDir.x);
    float dAz = atan(sin(sunAz - az), cos(sunAz - az));
    float side = sin(abs(dAz));
    float front = clamp(-cos(dAz), 0.0, 1.0);
    float back = clamp(cos(dAz), 0.0, 1.0);
    float sunUp = smoothstep(-0.12, 0.05, uSunDir.y);
    // low sun paints the peaks (alpenglow); high sun is plain white daylight
    vec3 sunLight = mix(uFogSun * 1.5 + uSunCol * 0.4, uSunCol * 1.35, smoothstep(0.08, 0.55, uSunDir.y)) * sunUp;
    vec3 moonLight = vec3(0.17, 0.21, 0.34) * uMoonVis * (1.0 - sunUp);
    vec3 skyLight = mix(uFog, uZenith, 0.35);

    // far range: rock and snow, with lit and shaded flanks
    float m3 = farRange(az);
    if (h < m3) {
      float depth = m3 - h;
      // which way the slope faces: the crest's own profile near the top, the broad shape lower down
      float facing = 0.0;
      if (uDetail > 0.5) {
        float e = 0.0035;
        float sHi = (farRange(az + e) - farRange(az - e)) / (2.0 * e);
        float sLo = (farRangeLow(az + 0.03) - farRangeLow(az - 0.03)) / 0.06;
        float slope = mix(sHi, sLo, smoothstep(0.0, 0.012, depth));
        facing = clamp(-slope * sign(dAz) * 2.2, -1.0, 1.0);
      }
      float lit = front * 0.75 + side * clamp(0.45 + 0.75 * facing, 0.0, 1.0) + back * 0.1;
      // rock texture (isotropic, so no curtains) and an irregular snowline that thins on steep flanks
      vec2 rp = vec2(az * 70.0, h * 70.0);
      float gully = vnoise(rp) * 0.5 + vnoise(rp * 2.3 + 7.0) * 0.3 + vnoise(rp * 5.3 + 3.0) * 0.2;
      float snowLine = 0.07 + 0.026 * vnoise(vec2(az * 7.0, 5.0)) + (gully - 0.5) * 0.03 + abs(facing) * 0.012;
      float snow = smoothstep(snowLine - 0.004, snowLine + 0.01, h);
      vec3 rock = vec3(0.13, 0.12, 0.13) * (0.65 + 0.7 * gully) + uMtn * 0.5;
      vec3 alb = mix(rock, vec3(0.6, 0.63, 0.7) * (0.72 + 0.4 * gully), snow);
      vec3 c3 = alb * (skyLight * 0.5 + sunLight * lit * 1.1 + moonLight * (0.5 + lit) * (0.7 + snow * 0.5));
      // backlit ridges get a bright rim where the sun grazes them
      c3 += sunLight * back * 0.4 * smoothstep(0.004, 0.0, depth);
      float air = 0.26 + 0.44 * smoothstep(0.0, 0.1, depth);
      col = mix(c3, hazeCol, air);
    }
    // middle range: forested, no snow, more haze
    float m2 = 0.014 + 0.1 * ridges(az, 2.5, 11.0, 1.3);
    if (h < m2) {
      float depth = m2 - h;
      float tex = vnoise(vec2(az * 110.0, h * 110.0)) * 0.6 + vnoise(vec2(az * 260.0, h * 260.0)) * 0.4;
      vec3 alb = vec3(0.05, 0.065, 0.055) * (0.7 + 0.5 * tex) + uMtn * 0.4;
      float lit = front * 0.6 + side * 0.35;
      vec3 c2 = alb * (skyLight * 0.7 + sunLight * lit * 0.8 + moonLight * 0.8);
      col = mix(c2, hazeCol, 0.3 + 0.42 * smoothstep(0.0, 0.08, depth));
    }
    // near foothills: dark conifer ridges with a ragged treeline, valley mist below
    float m1Base = -0.016 + 0.066 * ridges(az, 3.7, 27.0, 1.0);
    float m1 = m1Base + 0.0042 * treeTips(az) * smoothstep(-0.01, 0.01, m1Base);
    if (h < m1) {
      float depth = max(m1Base - h, 0.0);
      vec3 c1 = vec3(0.03, 0.04, 0.035) * (skyLight + sunLight * front * 0.4 + moonLight * 0.6) + uMtn * 0.25;
      col = mix(c1, hazeCol, 0.16 + 0.6 * smoothstep(0.0, 0.045, depth));
    }
  }
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
      uSunCol: { value: new THREE.Color() },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uSunVis: { value: 1 },
      uMoonVis: { value: 0 },
      uCloudCover: { value: 0.46 },
      uDetail: { value: 1 },
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
    // forced looks: weight (k) eases toward target at `rate` per second
    this.ovr = {};
    for (const name of ORDER) this.ovr[name] = { k: 0, target: 0, rate: 1 };
    this.version = 0;
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

  setDetail(on) {
    this.uniforms.uDetail.value = on ? 1 : 0;
  }

  dirFrom(az, elev, out) {
    return out.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
  }

  // Ease a forced look in or out: name = 'night' | 'day' | 'dawn', weight 0..1 over `seconds`.
  setOverride(name, weight, seconds = 2) {
    const o = this.ovr[name];
    o.target = weight;
    o.rate = seconds > 0 ? 1 / seconds : 1e6;
    if (seconds <= 0) {
      o.k = weight;
      this.apply(this.t);
    }
  }

  clearOverrides() {
    for (const o of Object.values(this.ovr)) {
      o.k = 0;
      o.target = 0;
    }
    this.apply(this.t);
  }

  overrideWeight(name) {
    return this.ovr[name].k;
  }

  get transitioning() {
    for (const o of Object.values(this.ovr)) if (Math.abs(o.target - o.k) > 1e-4) return true;
    return false;
  }

  // A number that changes whenever the forced looks move (for lighting refreshes).
  get overrideSig() {
    return this.ovr.night.k * 3 + this.ovr.dawn.k * 5 + this.ovr.day.k * 7;
  }

  // Round time of day, then any forced looks blended over it in ORDER.
  _value(name, t) {
    let v = sampleKey(name, t);
    for (const p of ORDER) {
      const k = this.ovr[p].k;
      if (k <= 0) continue;
      const pv = PRESETS[p][name];
      if (typeof v === 'number') v = lerp(v, pv, k);
      else v.lerp(pv, k);
    }
    return v;
  }

  apply(t) {
    this.t = t;
    this.version++;
    const u = this.uniforms;
    const val = (n) => this._value(n, t);
    const sunElev = val('sunElev') * DEG;
    const moonElev = val('moonElev') * DEG;
    this.sunAzimuth = val('sunAz') * DEG;
    this.dirFrom(this.sunAzimuth, sunElev, this.sunDir);
    this.dirFrom(this.moonAzimuth, moonElev, this.moonDir);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uZenith.value.copy(val('zenith'));
    u.uHorizon.value.copy(val('horizon'));
    u.uGlow.value.copy(val('glow'));
    const fogCol = val('fog');
    const fogSun = val('fogSun');
    u.uFog.value.copy(fogCol);
    u.uFogSun.value.copy(fogSun);
    u.uCloudLit.value.copy(val('cloudLit'));
    u.uCloudShade.value.copy(val('cloudShade'));
    u.uCloudCover.value = val('cloudCover');
    u.uMtn.value.copy(val('mtn'));
    u.uStars.value = val('stars');
    u.uSunVis.value = clamp((sunElev / DEG + 1.5) / 2, 0, 1);
    u.uMoonVis.value = clamp((moonElev / DEG + 1) / 4, 0, 1);
    this.dayLight = clamp((sunElev / DEG - 15) / 25, 0, 1); // 1 = full daylight (the Nightwarden's bane)

    // fog: swarm rounds tint it darker and thicker
    const boost = this.fogBoost;
    this.fog.color.copy(fogCol).multiplyScalar(1 - boost * 0.35);
    this.baseFogDensity = val('fogDensity') * (1 + boost * 1.8);
    this.baseFogDist = 0.0042 * (1 + boost * 1.2) * (1 - 0.45 * this.ovr.day.k);
    this.applyFogScale();
    fogUniforms.uFogSunColor.value.copy(fogSun).multiplyScalar(1 - boost * 0.4);
    fogUniforms.uFogSunDir.value.copy(this.sunDir);

    // lights: sun until it sets, then the moon takes over the shadow-casting light
    const sunInt = val('sunInt');
    const moonLit = sunElev / DEG < -3;
    const lightDir = this.lightDir;
    lightDir.copy(moonLit ? this.moonDir : this.sunDir);
    lightDir.y = Math.max(lightDir.y, Math.sin(9 * DEG));
    lightDir.normalize();
    this.sun.color.copy(val('sunColor'));
    u.uSunCol.value.copy(this.sun.color);
    this.sun.intensity = sunInt;
    foliageUniforms.uSunDirW.value.copy(moonLit ? this.moonDir : this.sunDir);
    foliageUniforms.uSunCol.value.copy(this.sun.color).multiplyScalar(Math.min(1.2, sunInt * 0.45) * (1 - boost * 0.5));
    this.hemiSkyBase.copy(val('hemiSky'));
    this.hemi.color.copy(this.hemiSkyBase).lerp(INDOOR_TINT, 0.5 * this.indoor);
    this.hemi.groundColor.copy(val('hemiGround'));
    this.hemiBase = val('hemiInt') * (1 - boost * 0.25);
    this.hemi.intensity = this.hemiBase * this.hemiBoost;
    this.exposure = val('exposure');
    this.envInt = val('envInt') * (1 - boost * 0.3);
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
    let moving = false;
    for (const o of Object.values(this.ovr)) {
      if (o.k === o.target) continue;
      const step = o.rate * dt;
      o.k = Math.abs(o.target - o.k) <= step ? o.target : o.k + Math.sign(o.target - o.k) * step;
      moving = true;
    }
    if (moving || Math.abs(this.target - this.t) > 1e-4 || Math.abs(this.fogBoostTarget - this.fogBoost) > 1e-3) {
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
