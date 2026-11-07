// Sky dome, sun/moon lighting, day-night cycle and weather (including the
// green prairie storm sky). Exposes colours for fog, water and the env map.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util.js';

const SKY_VS = `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const SKY_FS = `
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
uniform vec3 uSunCol; uniform float uTime; uniform float uCover; uniform float uDark;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uFlash; uniform float uStars; uniform vec3 uMoonDir;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  float t = clamp(up, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.45));
  // horizon haze band
  col = mix(col, uHorizon * 1.05, exp(-abs(up) * 18.0) * 0.4);
  if (up < 0.0) col = mix(uHorizon, uGround, smoothstep(0.0, -0.25, up));
  // sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 30.0 + pow(sd, 12.0) * 0.25) * (1.0 - uCover * 0.85);
  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.8, 0.85, 1.0) * pow(md, 1600.0) * 4.0 * uStars;
  // stars
  if (uStars > 0.01 && up > 0.0) {
    vec2 sp = d.xz / (up + 0.3) * 160.0;
    float s = step(0.9975, hash(floor(sp)));
    col += vec3(s) * uStars * (1.0 - uCover) * smoothstep(0.0, 0.25, up);
  }
  // clouds on a dome-projected plane
  if (up > -0.02) {
    vec2 uv = d.xz / (up + 0.12) * 1.6;
    vec2 wind = vec2(uTime * 0.006, uTime * 0.0025);
    float base = fbm(uv * 0.9 + wind);
    float detail = fbm(uv * 3.1 - wind * 1.7);
    float c = base * 0.75 + detail * 0.35;
    float cov = smoothstep(1.0 - uCover * 0.95 - 0.15, 1.05 - uCover * 0.65, c);
    // shelf-cloud bands for storms
    cov = max(cov, uDark * smoothstep(0.2, 0.9, fbm(uv * 0.45 + wind * 0.5) + 0.25));
    float lit = clamp(0.55 + dot(normalize(vec3(uSunDir.x, 0.0, uSunDir.z)), normalize(vec3(d.x, 0.0, d.z))) * 0.2 - detail * 0.35, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    float fade = smoothstep(-0.02, 0.18, up);
    col = mix(col, cc, cov * fade * 0.95);
  }
  col += vec3(0.6, 0.7, 0.8) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const c = (h) => new THREE.Color(h);
// keyframes by sun elevation (degrees)
const KEYS = [
  { e: -18, zen: c('#03060f'), hor: c('#0a1220'), sun: c('#000000'), amb: c('#1a2236'), gnd: c('#0a0c10'), sunI: 0, hemiI: 0.25 },
  { e: -6, zen: c('#0e1a33'), hor: c('#3a3048'), sun: c('#ff6a3a'), amb: c('#2a3048'), gnd: c('#141210'), sunI: 0, hemiI: 0.35 },
  { e: 0, zen: c('#2b4a78'), hor: c('#e8946a'), sun: c('#ff8a50'), amb: c('#6a6a80'), gnd: c('#3a3026'), sunI: 0.6, hemiI: 0.55 },
  { e: 8, zen: c('#3f6fa8'), hor: c('#f0c49a'), sun: c('#ffcf9a'), amb: c('#9aa8c0'), gnd: c('#5a4c3a'), sunI: 1.8, hemiI: 0.8 },
  { e: 25, zen: c('#3a74bd'), hor: c('#b8d0e6'), sun: c('#fff1dc'), amb: c('#b9cde4'), gnd: c('#6a5e48'), sunI: 2.7, hemiI: 1.0 },
  { e: 60, zen: c('#2f6db8'), hor: c('#aecbe6'), sun: c('#fff8ee'), amb: c('#c4d6ea'), gnd: c('#6e6450'), sunI: 3.0, hemiI: 1.05 },
];

// weather presets: cover (0..1), dark (storm shelf), tint, light scale, fog density
export const WEATHER = {
  clear: { cover: 0.25, dark: 0, light: 1, fogFar: 1.0, tint: null, rain: 0, wind: 0.3 },
  cloudy: { cover: 0.6, dark: 0, light: 0.85, fogFar: 0.9, tint: null, rain: 0, wind: 0.5 },
  overcast: { cover: 0.95, dark: 0.1, light: 0.55, fogFar: 0.7, tint: c('#a8b0b8'), rain: 0.15, wind: 0.6 },
  storm: { cover: 1, dark: 1, light: 0.4, fogFar: 0.5, tint: c('#5f9a6c'), rain: 1, wind: 1 },
};

export class Sky {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 9.0; // hours
    this.dayLength = 24 * 60; // real seconds per game day (24 min)
    this.weather = 'clear';
    this.w = { ...WEATHER.clear };
    this.target = WEATHER.clear;
    this.weatherTimer = 240;
    this.flash = 0;
    this.lightningTimer = 8;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uTime: { value: 0 }, uCover: { value: 0.3 }, uDark: { value: 0 },
      uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudShade: { value: new THREE.Color(0.6, 0.6, 0.65) },
      uFlash: { value: 0 }, uStars: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    this.dome = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sm = quality.shadowSize;
    this.sun.shadow.mapSize.set(sm, sm);
    const r = quality.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 });
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;
    this.shadowRange = r;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ea, 0x5a5040, 1);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(this.ambient);
    this.fog = new THREE.Fog(0xb8d0e6, 80, quality.viewDistance);
    this.viewDistance = quality.viewDistance;
    scene.fog = this.fog;
    // environment map from the sky
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), this.dome.material);
    this.envScene.add(this.envDome);
    this.envTimer = 0;
    this.envRT = null;
    this.colors = { horizon: new THREE.Color(), zenith: new THREE.Color(), sun: new THREE.Color() };
  }
  setTime(h) { this.time = ((h % 24) + 24) % 24; }
  setWeather(name, instant = false) {
    this.weather = name;
    this.target = WEATHER[name];
    if (instant) Object.assign(this.w, this.target);
  }
  get isNight() { return this.sunElev < -4; }
  // returns 0..1 darkness used by gameplay (zombie aggression etc.)
  get darkness() { return clamp(1 - (this.sunElev + 6) / 14, 0, 1); }

  update(dt, focus) {
    this.time = (this.time + (dt / this.dayLength) * 24) % 24;
    // weather cycle
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const order = ['clear', 'clear', 'cloudy', 'clear', 'overcast', 'storm', 'cloudy'];
      const i = (order.indexOf(this.weather) + 1 + Math.floor(Math.random() * 2)) % order.length;
      this.setWeather(order[i]);
      this.weatherTimer = this.weather === 'storm' ? 150 + Math.random() * 90 : 200 + Math.random() * 240;
    }
    const k = 1 - Math.exp(-dt * 0.08);
    for (const key of ['cover', 'dark', 'light', 'fogFar', 'rain', 'wind']) this.w[key] = lerp(this.w[key], this.target[key], k);
    if (!this.w.tintC) this.w.tintC = new THREE.Color(1, 1, 1);
    this.w.tintC.lerp(this.target.tint || new THREE.Color(1, 1, 1), k);

    // sun path: rises east (+X), sets west, slightly south
    const dayT = (this.time - 6) / 12; // 0 at 6am, 1 at 6pm
    const ang = dayT * Math.PI;
    const elev = Math.sin(ang) * 62;
    this.sunElev = elev;
    const er = THREE.MathUtils.degToRad(elev);
    const az = ang; // 0 = east, PI = west
    const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(er), Math.sin(er), 0.35 * Math.cos(er)).normalize();
    this.sunDir = sunDir;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uMoonDir.value.copy(sunDir).multiplyScalar(-1).add(new THREE.Vector3(0, 0.25, 0)).normalize();
    // interpolate keyframes
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) if (elev >= KEYS[i].e && elev <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    if (elev < KEYS[0].e) b = a;
    const t = b === a ? 0 : (elev - a.e) / (b.e - a.e);
    const mix = (p, q) => p.clone().lerp(q, t);
    const zen = mix(a.zen, b.zen), hor = mix(a.hor, b.hor), sunC = mix(a.sun, b.sun), amb = mix(a.amb, b.amb), gnd = mix(a.gnd, b.gnd);
    let sunI = lerp(a.sunI, b.sunI, t), hemiI = lerp(a.hemiI, b.hemiI, t);
    // weather: desaturate & tint
    const w = this.w;
    const grey = (col, amt) => { const l = col.r * 0.3 + col.g * 0.59 + col.b * 0.11; col.lerp(new THREE.Color(l, l, l), amt); return col; };
    grey(zen, w.cover * 0.7); grey(hor, w.cover * 0.6);
    zen.multiply(w.tintC).multiplyScalar(lerp(1, 0.45, w.dark));
    hor.multiply(w.tintC).multiplyScalar(lerp(1, 0.75, w.dark));
    if (w.dark > 0.01) {
      // the eerie green glow under a supercell
      const green = new THREE.Color('#79b07a').multiplyScalar(Math.max(0.15, smoothstep(-6, 20, elev)));
      hor.lerp(green, w.dark * 0.65);
      zen.lerp(new THREE.Color('#1e3a34').multiplyScalar(Math.max(0.2, smoothstep(-6, 20, elev))), w.dark * 0.6);
    }
    sunI *= w.light * (1 - w.cover * 0.35);
    hemiI *= lerp(1, 0.75, w.dark);
    const u = this.uniforms;
    u.uZenith.value.copy(zen); u.uHorizon.value.copy(hor); u.uGround.value.copy(gnd);
    u.uSunCol.value.copy(sunC);
    u.uCover.value = w.cover; u.uDark.value = w.dark;
    u.uTime.value += dt * (0.4 + w.wind);
    u.uStars.value = smoothstep(-2, -12, elev);
    const dayLight = smoothstep(-8, 12, elev);
    u.uCloudLit.value.set(1, 0.98, 0.95).lerp(sunC, 0.35).multiplyScalar(lerp(0.12, 1, dayLight) * lerp(1, 0.55, w.dark));
    u.uCloudShade.value.copy(hor).multiplyScalar(0.65).lerp(new THREE.Color(0.25, 0.3, 0.32), w.dark * 0.6);
    if (w.dark > 0.01) u.uCloudLit.value.lerp(new THREE.Color('#5d7f64').multiplyScalar(dayLight + 0.1), w.dark * 0.5);

    // lightning
    if (w.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) { this.flash = 1; this.lightningTimer = 4 + Math.random() * 12; this.onThunder && this.onThunder(); }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash > 0.5 ? this.flash : this.flash * 0.3;
    u.uFlash.value = fl * 0.6;

    // lights
    const lightDir = elev > -4 ? sunDir : this.uniforms.uMoonDir.value;
    this.sun.color.copy(elev > -4 ? sunC : new THREE.Color('#8fa4d6'));
    this.sun.intensity = elev > -4 ? sunI : 0.22 * (1 - w.cover * 0.7);
    this.sun.intensity += fl * 3;
    this.hemi.color.copy(amb);
    this.hemi.groundColor.copy(gnd);
    this.hemi.intensity = hemiI + fl * 1.5;
    this.ambient.intensity = lerp(0.05, 0.16, dayLight);
    this.colors.horizon.copy(hor); this.colors.zenith.copy(zen); this.colors.sun.copy(sunC);
    this.fog.color.copy(hor).lerp(zen, 0.15);
    this.fog.far = this.viewDistance * w.fogFar * lerp(0.75, 1, dayLight);
    this.fog.near = Math.min(this.fog.far * 0.3, lerp(25, 80, 1 - w.dark));
    // shadow camera follows focus
    if (focus) {
      const r = this.shadowRange;
      // snap to texel grid to avoid shimmering
      const texel = (2 * r) / this.sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx + lightDir.x * 150, focus.y + Math.max(lightDir.y, 0.15) * 150, fz + lightDir.z * 150);
      this.sun.target.updateMatrixWorld();
      this.dome.position.copy(focus);
    }
    // environment map refresh
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 6;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.45 * lerp(0.15, 1, dayLight) * w.light;
    }
  }
}
