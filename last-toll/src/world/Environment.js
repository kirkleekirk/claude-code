import * as THREE from 'three';
import { radialTexture } from './Textures.js';
import { lerp, clamp } from '../core/math.js';
import { SKY, createSkyDome } from './Sky.js';

// Sky, fog, sun/moon, water, ground mist, fireflies, lightning, and the Living
// Guard's herder mast on the horizon. Time is in hours (17.0 = 5 PM; 25.0 = 1 AM).
// A mood picks the lighting track: dusk raids fall into night; night and swamp
// raids start in the dark.

// Light and fog. Fog colour is only a fallback: fog takes the sky's colour (Sky.js).
const DUSK = [
  { h: 16.0, fog: 0x8c8a7c, near: 30, far: 340, sun: 0xffdcb0, sunI: 2.2, hs: 0xa8b4c0, hg: 0x44443a, hi: 1.75, elev: 30, dark: 0 },
  { h: 17.5, fog: 0x847a6c, near: 26, far: 300, sun: 0xffbe86, sunI: 1.8, hs: 0x9ca4b4, hg: 0x484234, hi: 1.65, elev: 16, dark: 0.1 },
  { h: 18.6, fog: 0x5a4c4a, near: 20, far: 250, sun: 0xe0784c, sunI: 1.1, hs: 0x7c7e98, hg: 0x383028, hi: 1.3, elev: 4, dark: 0.4 },
  { h: 19.5, fog: 0x2a2a32, near: 12, far: 170, sun: 0x8a9ac8, sunI: 0.55, hs: 0x4a5270, hg: 0x1c1a18, hi: 0.92, elev: 38, dark: 0.74 },
  { h: 20.5, fog: 0x1c1f2a, near: 8, far: 110, sun: 0x7888b8, sunI: 0.46, hs: 0x384060, hg: 0x121210, hi: 0.78, elev: 42, dark: 0.92 },
  { h: 26.0, fog: 0x171a24, near: 6, far: 95, sun: 0x6c7aa8, sunI: 0.42, hs: 0x303652, hg: 0x0e0e0c, hi: 0.7, elev: 45, dark: 1 },
];
const NIGHT = [
  { h: 20.0, fog: 0x1e212c, near: 8, far: 115, sun: 0x8090c0, sunI: 0.5, hs: 0x3c4466, hg: 0x141412, hi: 0.82, elev: 40, dark: 0.9 },
  { h: 26.0, fog: 0x151820, near: 6, far: 95, sun: 0x6c7aa8, sunI: 0.42, hs: 0x2e3450, hg: 0x0c0c0a, hi: 0.7, elev: 48, dark: 1 },
];
const SWAMP = [
  { h: 20.0, fog: 0x19221d, near: 5, far: 80, sun: 0x9ab09a, sunI: 0.42, hs: 0x3c4c40, hg: 0x0c100c, hi: 0.78, elev: 36, dark: 0.95 },
  { h: 26.0, fog: 0x121a16, near: 4, far: 70, sun: 0x8aa08a, sunI: 0.36, hs: 0x324238, hg: 0x0a0c0a, hi: 0.66, elev: 44, dark: 1 },
];
const TRACKS = { dusk: DUSK, night: NIGHT, swamp: SWAMP };

// The sky, as it should look on screen.
//   zen/hor: zenith and horizon away from the sun; glow: the horizon toward the sun;
//   belt: the rosy band opposite the sun; sunC: glow round the sun (glowAmt: how much);
//   se: sun elevation in degrees; cLit/cAmb: cloud colour toward and away from the sun;
//   strat: the stratus band on the horizon; stars, milky: night sky; moon: moon colour.
const SKY_DUSK = [
  { h: 16.0, se: 26, zen: 0x2f5591, hor: 0xa9bfd6, glow: 0xe4e2d4, belt: 0x000000, sunC: 0xfff4e0, glowAmt: 0.55, cLit: 0xffffff, cAmb: 0xd2dae6, strat: 0x8a96a8, stars: 0, milky: 0, moon: 0x000000 },
  { h: 17.5, se: 13, zen: 0x2f5189, hor: 0x9fb3cc, glow: 0xe8dcc2, belt: 0x000000, sunC: 0xffe8c8, glowAmt: 0.62, cLit: 0xfff8ea, cAmb: 0xc4cedc, strat: 0x76849a, stars: 0, milky: 0, moon: 0x000000 },
  { h: 18.45, se: 1.2, zen: 0x30508a, hor: 0x8a9ab4, glow: 0xb4a89e, belt: 0x14080c, sunC: 0xffc88a, glowAmt: 0.42, cLit: 0xf6e6c2, cAmb: 0xb4bccc, strat: 0x56606e, stars: 0, milky: 0, moon: 0x000000 },
  { h: 18.9, se: -1.5, zen: 0x2c4270, hor: 0x8e8eaa, glow: 0xf0aa6c, belt: 0x2a1426, sunC: 0xff9a50, glowAmt: 0.8, cLit: 0xffc088, cAmb: 0xa6a2bc, strat: 0x4e5266, stars: 0, milky: 0, moon: 0x000000 },
  { h: 19.3, se: -5, zen: 0x1f2f58, hor: 0x76709a, glow: 0xd9784e, belt: 0x281830, sunC: 0xe0602e, glowAmt: 0.55, cLit: 0xf0906c, cAmb: 0x8a80a6, strat: 0x3e3e54, stars: 0.05, milky: 0, moon: 0x30343c },
  { h: 19.8, se: -9, zen: 0x121c3c, hor: 0x3e4068, glow: 0x86505a, belt: 0x100a18, sunC: 0x803040, glowAmt: 0.3, cLit: 0x9a6a78, cAmb: 0x4c4c6c, strat: 0x24263a, stars: 0.3, milky: 0.1, moon: 0x5a6070 },
  { h: 20.5, se: -14, zen: 0x0a1028, hor: 0x1c2040, glow: 0x2c2640, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x3a3e56, cAmb: 0x262840, strat: 0x14182a, stars: 0.75, milky: 0.45, moon: 0x747c92 },
  { h: 26.0, se: -30, zen: 0x05091a, hor: 0x10162c, glow: 0x121830, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x2c324a, cAmb: 0x1a1e30, strat: 0x0e1220, stars: 1, milky: 0.85, moon: 0x8088a0 },
];
const SKY_NIGHT = [
  { h: 20.0, se: -20, zen: 0x081026, hor: 0x1a2240, glow: 0x1c2442, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x323a54, cAmb: 0x1c2236, strat: 0x10162a, stars: 0.9, milky: 0.75, moon: 0x8a94b0 },
  { h: 26.0, se: -30, zen: 0x050918, hor: 0x121a32, glow: 0x141c34, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x2c3450, cAmb: 0x181e30, strat: 0x0e1426, stars: 1, milky: 0.9, moon: 0x8a94b0 },
];
const SKY_SWAMP = [
  { h: 20.0, se: -20, zen: 0x06100e, hor: 0x16241f, glow: 0x18261f, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x2c3a30, cAmb: 0x18221c, strat: 0x0e1612, stars: 0.5, milky: 0.3, moon: 0x8c9a7c },
  { h: 26.0, se: -30, zen: 0x040a09, hor: 0x101a16, glow: 0x121c17, belt: 0x000000, sunC: 0x000000, glowAmt: 0, cLit: 0x243028, cAmb: 0x141c18, strat: 0x0a120e, stars: 0.6, milky: 0.35, moon: 0x8c9a7c },
];
const SKY_TRACKS = { dusk: SKY_DUSK, night: SKY_NIGHT, swamp: SKY_SWAMP };

// Clouds per place: cirrus and deck cover, the stratus band, how dark a thick deck gets.
export const SKY_STYLES = {
  clear: { cirrus: 0.55, deck: 0.06, stratus: 0.6, deckDark: 0.6, wind: 0.5 },
  hazy: { cirrus: 0.4, deck: 0.34, stratus: 0.4, deckDark: 0.55, wind: 1.2 },
  storm: { cirrus: 0.2, deck: 0.74, stratus: 0.25, deckDark: 0.85, wind: 2.2 },
  swamp: { cirrus: 0.25, deck: 0.55, stratus: 0.2, deckDark: 0.9, wind: 2.8 },
  starry: { cirrus: 0.32, deck: 0.08, stratus: 0.2, deckDark: 0.6, wind: 0.9 },
  sea: { cirrus: 0.52, deck: 0.1, stratus: 0.75, deckDark: 0.55, wind: 0.35, clear: 1.6 },
};

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function lerpColor(a, b, t, out) {
  _c1.setHex(a);
  _c2.setHex(b);
  return out.copy(_c1).lerp(_c2, t);
}

const MIST_VERT = `varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const MIST_FRAG = `uniform vec3 color; uniform float time; uniform float density; uniform vec3 cam; uniform float reach; uniform float seed;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec2 p = vWorld.xz * 0.07 + vec2(time * 0.018 + seed, time * 0.011);
  float n = fbm(p) * 0.65 + fbm(p * 2.6 - vec2(time * 0.025)) * 0.35;
  float d = length(vWorld.xz - cam.xz);
  float fade = (1.0 - smoothstep(reach * 0.55, reach, d)) * smoothstep(0.4, 3.0, d);
  float edge = clamp(abs(cam.y - vWorld.y) / 0.5, 0.0, 1.0);
  float a = smoothstep(0.32, 0.78, n) * density * fade * edge;
  gl_FragColor = vec4(color, a);
}`;

// Water that reflects the sky: Phong for lamps and the sun's glitter, plus the sky
// gradient seen in the waves, stronger at a glancing angle. The waves are noise in
// world space, calmed with distance so they don't shimmer or tile toward the horizon.
function waterMaterial(color, reflect, chop) {
  const m = new THREE.MeshPhongMaterial({ color, specular: 0x6a7a70, shininess: 90 });
  const wTime = { value: 0 };
  // a rectangle (x0, z0, x1, z1) where there is no water: inside a ship's hull
  const wHole = { value: new THREE.Vector4(0, 0, 0, 0) };
  m.userData.wTime = wTime;
  m.userData.wHole = wHole;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wTime = wTime;
    sh.uniforms.wHole = wHole;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float wTime;
uniform vec4 wHole;
varying vec3 vWaterW;
float wv_h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wv_n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wv_h(i), wv_h(i + vec2(1.0, 0.0)), u.x), mix(wv_h(i + vec2(0.0, 1.0)), wv_h(i + vec2(1.0, 1.0)), u.x), u.y); }
float waveH(vec2 p, float fine) {
  float t = wTime;
  float h = wv_n(p * 0.28 + vec2(t * 0.05, t * 0.03)) * 0.55;
  h += wv_n(mat2(0.8, 0.6, -0.6, 0.8) * p * 0.75 - vec2(t * 0.09, -t * 0.05)) * 0.3;
  h += wv_n(mat2(0.6, -0.8, 0.8, 0.6) * p * 1.9 + vec2(-t * 0.16, t * 0.11)) * 0.14 * fine;
  h += wv_n(p * 4.3 + vec2(t * 0.25, t * 0.2)) * 0.06 * fine;
  return h;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (vWaterW.x > wHole.x && vWaterW.x < wHole.z && vWaterW.z > wHole.y && vWaterW.z < wHole.w) discard;
{
  float wd = length(vWaterW - cameraPosition);
  float fine = 1.0 - smoothstep(20.0, 70.0, wd);
  float e = 0.08;
  float h0 = waveH(vWaterW.xz, fine);
  float gx = (waveH(vWaterW.xz + vec2(e, 0.0), fine) - h0) / e;
  float gz = (waveH(vWaterW.xz + vec2(0.0, e), fine) - h0) / e;
  float amp = ${chop.toFixed(2)} / (1.0 + wd * 0.025);
  vec3 nw = normalize(vec3(-gx * amp, 1.0, -gz * amp));
  normal = normalize(mat3(viewMatrix) * nw);
}`)
      .replace('#include <opaque_fragment>', `
    #ifdef USE_FOG
    {
      vec3 vv = normalize(vViewPosition);
      vec3 rv = reflect(-vv, normal);
      vec3 rw = normalize((vec4(rv, 0.0) * viewMatrix).xyz);
      rw.y = abs(rw.y);
      float fr = 0.03 + 0.97 * pow(1.0 - clamp(dot(normal, vv), 0.0, 1.0), 5.0);
      outgoingLight = mix(outgoingLight, skyBase(rw) * 0.5, clamp(fr * ${reflect.toFixed(2)}, 0.0, 1.0));
    }
    #endif
    #include <opaque_fragment>`);
  };
  return m;
}

export class Environment {
  constructor(scene, { mastDir = null, fogTint = null, shadows = true, mood = 'dusk', mist = null, fireflies = false, storm = false, waterY = -0.32, sky = null, seed = Math.random() * 100 } = {}) {
    this.scene = scene;
    this.fogTint = fogTint;
    this.mood = mood;
    this.keys = TRACKS[mood] || DUSK;
    this.skyKeys = SKY_TRACKS[mood] || SKY_DUSK;
    this.style = typeof sky === 'object' && sky ? sky : SKY_STYLES[sky] || SKY_STYLES[storm ? (mood === 'swamp' ? 'swamp' : 'storm') : mood === 'dusk' ? 'clear' : 'starry'];
    this.storm = storm;
    scene.fog = new THREE.Fog(0x888888, 20, 120);
    scene.background = new THREE.Color(0x222222);

    this.hemi = new THREE.HemisphereLight(0xb0c0d0, 0x4a4a3a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // the sky: one shader for gradient, clouds, sun, moon and stars (Sky.js)
    this.sky = createSkyDome(420);
    const su = this.sky.material.uniforms;
    su.cloudP.value.set(this.style.cirrus, this.style.deck, this.style.stratus, this.style.wind + seed * 0.37);
    su.nightP.value.w = seed;
    su.bandP.value.set(0.03, 0.105, this.style.deckDark, 1);
    this.skyUniforms = su;
    scene.add(this.sky);
    // what the sky state is this frame, copied into the shared uniforms every frame so
    // the hub and a raid can each keep their own
    this.skyState = {
      sun: new THREE.Vector3(0, 0.1, -1), moon: new THREE.Vector3(0.3, 0.4, 0.8),
      zen: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(), belt: new THREE.Color(),
      sunC: new THREE.Color(), moonC: new THREE.Color(), glowAmt: 0,
    };

    // water
    this.waterBase = mood === 'swamp' ? 0x141c16 : 0x1b2723;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100).rotateX(-Math.PI / 2),
      waterMaterial(this.waterBase, mood === 'swamp' ? 0.3 : 0.55, mood === 'swamp' ? 0.35 : 0.8),
    );
    this.water.position.y = waterY;
    this.waterY = waterY;
    this.water.receiveShadow = true;
    scene.add(this.water);

    this._buildMast(mastDir || new THREE.Vector3(-0.25, 0, -1));

    // ground mist layers
    this.mist = [];
    const layers = mist || (mood === 'swamp' ? [[waterY + 0.25, 0.75], [waterY + 0.8, 0.6], [0.35, 0.35]] : [[0.18, 0.45], [0.55, 0.35], [0.95, 0.22]]);
    for (let i = 0; i < layers.length; i++) {
      const [y, density] = layers[i];
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, density: { value: density }, cam: { value: new THREE.Vector3() }, reach: { value: 60 }, seed: { value: i * 17.3 } },
        vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), mat);
      plane.position.y = y;
      plane.renderOrder = 5;
      plane.frustumCulled = false;
      scene.add(plane);
      this.mist.push(plane);
    }

    // fireflies
    this.flies = null;
    if (fireflies) {
      const n = 140;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      this.flyData = [];
      for (let i = 0; i < n; i++) this.flyData.push({ x: (Math.random() - 0.5) * 60, y: 0.4 + Math.random() * 2.5, z: (Math.random() - 0.5) * 60, ph: Math.random() * 20, sp: 0.3 + Math.random() * 0.8 });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.flies = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.flies.frustumCulled = false;
      scene.add(this.flies);
    }

    this.time = 17;
    this.darkness = 0;
    this.sightRange = 24;
    this.drawDistance = 120;
    this.flash = 0;
    this.nextStrike = 12 + Math.random() * 20;
    this.onThunder = null;
    this.sweep = 0;
  }

  // The Living Guard's herder mast: a lattice tower of sonic horns that calls the dead.
  _buildMast(dir) {
    const d = dir.clone().setY(0).normalize();
    const pos = d.clone().multiplyScalar(235);
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x101216, fog: false });
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, mat = m) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
      return mesh;
    };
    const H = 78;
    const widthAt = (y) => lerp(12, 2.2, y / H);
    const seg = 9;
    for (let i = 0; i < seg; i++) {
      const y0 = (i / seg) * H, y1 = ((i + 1) / seg) * H;
      const w0 = widthAt(y0), w1 = widthAt(y1), ym = (y0 + y1) / 2, wm = (w0 + w1) / 2;
      const lean = Math.atan2((w0 - w1) / 2, y1 - y0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        add(new THREE.BoxGeometry(0.45, y1 - y0 + 0.2, 0.45), (sx * wm) / 2, ym, (sz * wm) / 2, sz * lean, 0, -sx * lean);
      }
      // X-braces on each face
      const diag = Math.hypot(wm, y1 - y0);
      const ang = Math.atan2(y1 - y0, wm);
      for (const face of [0, 1, 2, 3]) {
        const ry = (face * Math.PI) / 2;
        const ox = Math.sin(ry) * (wm / 2), oz = Math.cos(ry) * (wm / 2);
        add(new THREE.BoxGeometry(diag, 0.18, 0.18), ox, ym, oz, 0, ry, ang);
        add(new THREE.BoxGeometry(diag, 0.18, 0.18), ox, ym, oz, 0, ry, -ang);
      }
      add(new THREE.BoxGeometry(w1 + 0.4, 0.3, w1 + 0.4), 0, y1, 0);
    }
    // herder horns: a crown of flared speakers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const horn = add(new THREE.CylinderGeometry(1.6, 0.35, 3.6, 8, 1, true), Math.cos(a) * 1.8, H + 1.2, Math.sin(a) * 1.8, 0, 0, 0);
      horn.lookAt(g.position.x + Math.cos(a) * 20, H + 1.2, g.position.z + Math.sin(a) * 20);
      horn.rotateX(Math.PI / 2);
      horn.material = new THREE.MeshBasicMaterial({ color: 0x14161a, fog: false, side: THREE.DoubleSide });
    }
    add(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), 0, H + 7, 0);
    // walled compound at the foot
    add(new THREE.BoxGeometry(60, 6, 1.5), 0, 3, -20);
    add(new THREE.BoxGeometry(60, 6, 1.5), 0, 3, 20);
    add(new THREE.BoxGeometry(1.5, 6, 40), -30, 3, 0);
    add(new THREE.BoxGeometry(1.5, 6, 40), 30, 3, 0);
    add(new THREE.BoxGeometry(14, 9, 10), -14, 4.5, 4);
    add(new THREE.BoxGeometry(10, 7, 14), 16, 3.5, -2);
    // red warning lights that blink, and flood lights on the wall
    this.mastLights = [];
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false, transparent: true });
    for (const y of [H * 0.35, H * 0.7, H + 13]) {
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const w = widthAt(Math.min(y, H)) / 2 + 0.4;
        this.mastLights.push(add(new THREE.BoxGeometry(0.9, 0.9, 0.9), sx * w, y, sz * w, 0, 0, 0, redMat));
      }
    }
    this.redMat = redMat;
    const floodMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false });
    for (const x of [-26, -8, 12, 28]) add(new THREE.BoxGeometry(1.2, 0.8, 0.8), x, 7.5, 20.5, 0, 0, 0, floodMat);
    // searchlight beams (visible during the Sweep)
    const beamMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,235,210,0.5)', 'rgba(255,235,210,0)'), color: 0xfff0dc, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.beams = [];
    for (let i = 0; i < 2; i++) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 16, 1, true).translate(0, -80, 0), beamMat);
      beam.position.set(i ? 8 : -8, 9, 18);
      g.add(beam);
      this.beams.push(beam);
    }
    this.beamMat = beamMat;
    g.position.set(pos.x, -2, pos.z);
    this.mastGroup = g;
    this.mastPos = pos;
    this.scene.add(g);
  }

  setTime(h) {
    this.time = h;
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && h > keys[i + 1].h) i++;
    const a = keys[i], b = keys[i + 1];
    const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    // sea air carries further than a swamp's
    const clear = 1 + ((this.style.clear || 1) - 1) * clamp(lerp(a.dark, b.dark, t) * 1.4, 0, 1);
    this.scene.fog.near = lerp(a.near, b.near, t);
    this.scene.fog.far = lerp(a.far, b.far, t) * clear;
    lerpColor(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = lerp(a.sunI, b.sunI, t);
    lerpColor(a.hs, b.hs, t, this.hemi.color);
    lerpColor(a.hg, b.hg, t, this.hemi.groundColor);
    this.baseHemi = lerp(a.hi, b.hi, t);
    this.hemi.intensity = this.baseHemi * (1 + this.flash * 3);
    this.darkness = lerp(a.dark, b.dark, t);
    this.sightRange = lerp(26, 10, this.darkness);
    // walkers and loot aren't drawn past where they'd shrink to a speck in the haze
    this.drawDistance = Math.min(this.scene.fog.far, 150) + 12;

    // the sun sets in the west; afterwards the moon stands in the east
    const dusk = this.mood === 'dusk';
    const night = dusk ? clamp((h - 18.9) / 0.8, 0, 1) : 1;
    const sunElev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev, t));
    const sunAz = THREE.MathUtils.degToRad(night > 0.5 ? 70 : 255);
    this.lightDir = new THREE.Vector3(Math.cos(sunAz) * Math.cos(sunElev), Math.sin(sunElev), Math.sin(sunAz) * Math.cos(sunElev)).normalize();
    this._skyAt(h);
    this.water.material.color.setHex(this.waterBase).multiplyScalar(1 - this.darkness * 0.55);
  }

  update(dt, camPos, time) {
    const lp = this.lightDir || new THREE.Vector3(0, 1, 0);
    this.sun.position.set(camPos.x + lp.x * 70, lp.y * 70, camPos.z + lp.z * 70);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(camPos);
    this.skyUniforms.uTime.value = time;
    this.applySky();
    this.water.material.userData.wTime.value = time;

    // mist follows the camera; brightness tracks the ambient light
    const fogC = this.scene.fog.color;
    for (const p of this.mist) {
      p.position.x = Math.round(camPos.x / 4) * 4;
      p.position.z = Math.round(camPos.z / 4) * 4;
      const u = p.material.uniforms;
      u.time.value = time;
      u.cam.value.copy(camPos);
      u.reach.value = Math.min(65, this.scene.fog.far);
      u.color.value.copy(fogC).multiplyScalar(1.25 + this.darkness * 0.4 + this.flash * 2);
    }

    if (this.flies) {
      const pos = this.flies.geometry.attributes.position, col = this.flies.geometry.attributes.color;
      for (let i = 0; i < this.flyData.length; i++) {
        const f = this.flyData[i];
        f.x += Math.sin(time * f.sp + f.ph) * dt * 0.5;
        f.z += Math.cos(time * f.sp * 0.8 + f.ph) * dt * 0.5;
        let x = f.x, z = f.z;
        // keep them in a box around the camera
        if (x - camPos.x > 30) f.x -= 60; else if (x - camPos.x < -30) f.x += 60;
        if (z - camPos.z > 30) f.z -= 60; else if (z - camPos.z < -30) f.z += 60;
        pos.setXYZ(i, f.x, f.y + Math.sin(time * 1.3 + f.ph) * 0.2 + (this.waterFlies ?? 0), f.z);
        const b = Math.max(0, Math.sin(time * 1.7 * f.sp + f.ph * 3)) ** 3;
        col.setXYZ(i, 0.75 * b, 0.95 * b, 0.35 * b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // lightning
    if (this.storm) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 18 + Math.random() * 35;
        this.strikeT = 0;
        this.onThunder?.(0.8 + Math.random() * 2.5);
      }
      if (this.strikeT !== undefined) {
        this.strikeT += dt;
        const k = this.strikeT;
        this.flash = k < 0.07 ? 1 : k < 0.14 ? 0.1 : k < 0.24 ? 0.8 : Math.max(0, 0.5 - (k - 0.24) * 2);
        if (k > 0.6) { this.flash = 0; this.strikeT = undefined; }
        this.hemi.intensity = this.baseHemi * (1 + this.flash * 3);
        this.skyUniforms.nightP.value.z = this.flash;
      }
    }

    // mast: slow red blink; during the Sweep it strobes and the searchlights move
    let blink = this.sweep > 0 ? (Math.sin(time * 9) > 0 ? 1 : 0.15) : (Math.sin(time * 2.2) > 0.6 ? 1 : 0.2);
    // a dead mast: the lights die in a few last stutters, then stay dark
    if (this.mastDead) {
      this.deadT = (this.deadT || 0) + dt;
      blink = this.deadT < 1.6 && Math.random() < 0.3 ? 0.6 : 0;
    }
    this.redMat.opacity = blink;
    this.beamMat.opacity = this.sweep > 0 ? 0.35 : 0;
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.rotation.z = Math.sin(time * 0.35 + i * 2.1) * 0.7;
      b.rotation.x = -0.5 + Math.cos(time * 0.27 + i) * 0.3;
    }
  }

  // Sky colours at hour h, from the mood's sky track.
  _skyAt(h) {
    const keys = this.skyKeys;
    let i = 0;
    while (i < keys.length - 2 && h > keys[i + 1].h) i++;
    const a = keys[i], b = keys[i + 1];
    const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    const st = this.skyState;
    for (const k of ['zen', 'hor', 'glow', 'belt', 'sunC']) lerpColor(a[k], b[k], t, st[k]);
    lerpColor(a.moon, b.moon, t, st.moonC);
    st.glowAmt = lerp(a.glowAmt, b.glowAmt, t);
    const u = this.skyUniforms;
    lerpColor(a.cLit, b.cLit, t, u.cLit.value);
    lerpColor(a.cAmb, b.cAmb, t, u.cAmb.value);
    lerpColor(a.strat, b.strat, t, u.stratC.value);
    u.cDark.value.copy(u.cAmb.value).multiplyScalar(lerp(0.7, 0.3, this.style.deckDark));
    u.nightP.value.x = lerp(a.stars, b.stars, t) * (this.style.deck > 0.6 ? 0.6 : 1);
    u.nightP.value.y = lerp(a.milky, b.milky, t) * (this.style.deck > 0.6 ? 0.5 : 1);
    // clouds catch less light once the sun is gone
    u.bandP.value.w = 1;
    const se = THREE.MathUtils.degToRad(lerp(a.se, b.se, t));
    const az = THREE.MathUtils.degToRad(255);
    st.sun.set(Math.cos(az) * Math.cos(se), Math.sin(se), Math.sin(az) * Math.cos(se));
    const me = THREE.MathUtils.degToRad(this.mood === 'dusk' ? lerp(8, 34, clamp((h - 19) / 3, 0, 1)) : 36), maz = THREE.MathUtils.degToRad(68);
    st.moon.set(Math.cos(maz) * Math.cos(me), Math.sin(me), Math.sin(maz) * Math.cos(me));
    // a storm dims the stars and turns the horizon grey
    if (this.storm) {
      for (const k of ['hor', 'glow']) st[k].lerp(_c1.copy(u.cAmb.value).multiplyScalar(0.7), 0.4);
      st.zen.multiplyScalar(0.8);
      u.cAmb.value.multiplyScalar(0.8);
    }
    // the fallback fog colour and background follow the horizon
    this.scene.fog.color.copy(st.hor).lerp(st.glow, 0.3);
    this.scene.background.copy(this.scene.fog.color);
  }

  // Copy this environment's sky into the uniforms every fogged material shares.
  applySky() {
    const st = this.skyState;
    const put = (o, v) => { o.x = v.x; o.y = v.y; o.z = v.z; };
    const col = (o, c) => { o.x = c.r; o.y = c.g; o.z = c.b; };
    put(SKY.sun, st.sun);
    put(SKY.moon, st.moon);
    col(SKY.zen, st.zen);
    col(SKY.hor, st.hor);
    col(SKY.glow, st.glow);
    col(SKY.belt, st.belt);
    col(SKY.sunC, st.sunC);
    col(SKY.moonC, st.moonC);
    SKY.p.x = st.glowAmt;
    SKY.p.y = 0.5;
    SKY.p.z = 1;
    SKY.p.w = 4.5;
  }

  startSweep() {
    this.sweep = 1;
  }

  // The relay at Outpost 9 is down: every herder mast in the parish goes dark.
  mastOff(now = false) {
    this.mastDead = true;
    if (now) this.deadT = 10;
  }

  dispose() {
    for (const o of [this.hemi, this.sun, this.sun.target, this.sky, this.water, this.mastGroup, this.flies, this.vista, ...this.mist]) if (o) this.scene.remove(o);
  }
}
