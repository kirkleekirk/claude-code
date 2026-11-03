// Sky dome (gradient + sun/moon + procedural clouds + stars + lightning) and the
// day/night controller. Nights in Greenfall County come with a sickly green storm sky.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math.js';

const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.02 + 1.7; a *= 0.5; }
  return s;
}`;
export { NOISE_GLSL };

export class Sky {
  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloudCol: { value: new THREE.Color() }, uCloud: { value: 0.4 }, uStars: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uSunVis: { value: 1 },
      uStorm: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith, uHorizon, uFogColor, uSunColor, uCloudCol;
        uniform vec3 uSunDir, uMoonDir;
        uniform float uCloud, uStars, uTime, uFlash, uSunVis, uStorm;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uFogColor, smoothstep(0.06, -0.12, h));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sd, 1600.0) * 40.0 + pow(sd, 18.0) * 0.45 + pow(sd, 3.0) * 0.12) * uSunVis;
          float md = max(dot(d, uMoonDir), 0.0);
          float moonVis = 1.0 - uSunVis;
          col += vec3(0.82, 0.95, 0.85) * smoothstep(0.99955, 0.99975, md) * moonVis * 1.6;
          col += vec3(0.35, 0.6, 0.4) * pow(md, 60.0) * 0.35 * moonVis;
          if (uStars > 0.0 && h > 0.0) {
            vec3 sp = floor(d * 380.0);
            float s = hash13(sp);
            float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 80.0);
            col += vec3(0.85, 1.0, 0.9) * step(0.9975, s) * uStars * tw * smoothstep(0.0, 0.25, h);
          }
          if (h > -0.08) {
            vec2 cuv = d.xz / (h + 0.13) * 1.35 + uTime * vec2(0.006, 0.0025) * (1.0 + uStorm * 2.0);
            float n = fbm(cuv);
            float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.32, n);
            float shade = fbm(cuv * 2.1 + 4.0);
            vec3 cc = uCloudCol * (0.62 + 0.55 * shade);
            cc = mix(cc, cc * 0.55, uStorm * (1.0 - shade));
            cc += uSunColor * pow(sd, 5.0) * 0.5 * uSunVis * (1.0 - cov * 0.5);
            cc += vec3(0.55, 0.95, 0.65) * uFlash * (0.3 + shade * 1.2);
            cov *= smoothstep(-0.06, 0.1, h);
            col = mix(col, cc, cov * 0.94);
          }
          col += vec3(0.25, 0.45, 0.3) * uFlash * 0.35;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
  }
  update(camera) { this.mesh.position.copy(camera.position); }
}

// ---------- day / night keyframes ----------
// [hour, zenith, horizon, fog, sun, sunI, hemiSky, hemiGround, hemiI, fogDensity, cloud, cloudCol, stars, lamp, storm]
const KEYS = [
  [0.0, 0x03130e, 0x1a3a20, 0x0c1d12, 0x8fc89a, 0.55, 0x3a6a48, 0x16221a, 0.85, 0.0048, 0.82, 0x1a2e20, 0.55, 1.0, 1.0],
  [4.6, 0x061a14, 0x23402a, 0x13261a, 0x8fc89a, 0.5, 0x3a6046, 0x16221a, 0.8, 0.0046, 0.75, 0x22382a, 0.45, 1.0, 0.8],
  [5.7, 0x2b4a6a, 0xd98a5a, 0x9a8a7a, 0xffa060, 0.8, 0x9ab0d0, 0x5a5040, 0.8, 0.0042, 0.5, 0xe0a080, 0.08, 0.6, 0.2],
  [7.0, 0x4f8fd8, 0xd8e4ec, 0xc4d2dc, 0xffe0b0, 1.9, 0xb8d4f0, 0x6a7a4a, 1.05, 0.0026, 0.42, 0xffffff, 0.0, 0.0, 0.0],
  [9.0, 0x3a86e0, 0xbcdcf8, 0xbcd5ee, 0xfff2dc, 2.8, 0xbfdcff, 0x6d8050, 1.15, 0.0010, 0.45, 0xffffff, 0.0, 0.0, 0.0],
  [15.5, 0x3f84d8, 0xd6e2ee, 0xcfdbea, 0xffecc8, 2.65, 0xbfd8f8, 0x6d7a50, 1.1, 0.0011, 0.5, 0xffffff, 0.0, 0.0, 0.0],
  [17.6, 0x4a78c0, 0xf4c890, 0xe6c6a0, 0xffb070, 2.2, 0xe0c8b0, 0x6a5a40, 1.0, 0.0015, 0.5, 0xffd2a0, 0.0, 0.1, 0.0],
  [18.6, 0x3a4a80, 0xff7a40, 0xd4875e, 0xff7030, 1.3, 0xb090a0, 0x50403a, 0.8, 0.0021, 0.55, 0xff8a5a, 0.0, 0.35, 0.2],
  [19.35, 0x14382a, 0x86d258, 0x5a8a42, 0x9ae070, 0.65, 0x7aaa60, 0x2a3a22, 0.8, 0.0032, 0.84, 0x2e5a40, 0.0, 0.8, 0.85],
  [20.3, 0x03130e, 0x1a3a20, 0x0c1d12, 0x8fc89a, 0.55, 0x3a6a48, 0x16221a, 0.85, 0.0048, 0.82, 0x1a2e20, 0.55, 1.0, 1.0],
  [24.0, 0x03130e, 0x1a3a20, 0x0c1d12, 0x8fc89a, 0.55, 0x3a6a48, 0x16221a, 0.85, 0.0048, 0.82, 0x1a2e20, 0.55, 1.0, 1.0],
];
const KC = KEYS.map((k) => ({
  h: k[0], zenith: new THREE.Color(k[1]), horizon: new THREE.Color(k[2]), fog: new THREE.Color(k[3]), sun: new THREE.Color(k[4]), sunI: k[5],
  hemiSky: new THREE.Color(k[6]), hemiGround: new THREE.Color(k[7]), hemiI: k[8], fogD: k[9], cloud: k[10], cloudCol: new THREE.Color(k[11]), stars: k[12], lamp: k[13], storm: k[14],
}));

export class DayNight {
  constructor() {
    this.hour = 7.5;
    this.out = {
      zenith: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), sunI: 1,
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 1, fogD: 0.001, cloud: 0.4, cloudCol: new THREE.Color(), stars: 0, lamp: 0, storm: 0,
      sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), sunVis: 1, night: 0,
    };
    this.flash = 0;
    this.nextFlash = 8;
    this.onThunder = null;
  }
  get isNight() { return this.hour >= 19.8 || this.hour < 5.4; }
  compute() {
    const h = ((this.hour % 24) + 24) % 24;
    let a = KC[0], b = KC[1];
    for (let i = 0; i < KC.length - 1; i++) if (h >= KC[i].h && h <= KC[i + 1].h) { a = KC[i]; b = KC[i + 1]; break; }
    const t = smoothstep(0, 1, (h - a.h) / Math.max(0.001, b.h - a.h));
    const o = this.out;
    for (const k of ['zenith', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'cloudCol']) o[k].copy(a[k]).lerp(b[k], t);
    for (const k of ['sunI', 'hemiI', 'fogD', 'cloud', 'stars', 'lamp', 'storm']) o[k] = lerp(a[k], b[k], t);
    // sun arc 5.5h → 19h, moon the rest
    const th = ((h - 5.5) / 13.5) * Math.PI;
    o.sunDir.set(Math.cos(th), Math.sin(th) * 0.92, 0.38).normalize();
    let mh = h < 12 ? h + 24 : h;
    const tm = ((mh - 19) / 10.5) * Math.PI;
    o.moonDir.set(Math.cos(tm) * 0.8, Math.max(0.15, Math.sin(tm)) * 0.9, -0.45).normalize();
    const sunUp = smoothstep(-0.04, 0.06, o.sunDir.y) * (h > 4 && h < 20.5 ? 1 : 0);
    o.sunVis = sunUp;
    o.lightDir.copy(sunUp > 0.5 ? o.sunDir : o.moonDir);
    if (sunUp > 0.5 && o.lightDir.y < 0.08) { o.lightDir.y = 0.08; o.lightDir.normalize(); }
    o.night = 1 - smoothstep(0.25, 0.75, sunUp) * (1 - o.storm * 0.6);
    return o;
  }
  updateLightning(dt, enabled, rng = Math.random) {
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (!enabled) return 0;
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.flash = 0.8 + rng() * 0.6;
      this._double = rng() < 0.5 ? 0.12 : -1;
      this.nextFlash = 6 + rng() * 22;
      if (this.onThunder) this.onThunder(0.6 + rng() * 2.5);
    }
    if (this._double > 0) {
      this._double -= dt;
      if (this._double <= 0) { this.flash = Math.max(this.flash, 0.9); this._double = -1; }
    }
    return clamp(this.flash, 0, 1.4);
  }
}
