// The sky over the moon the game is set on.
//
// By day: a pale turquoise atmosphere with wisps of cloud and the brightest stars still showing,
// and EMBER, the giant coral planet this moon is locked to, hanging enormous over the southern
// horizon. The sun crosses above it, so Ember goes through phases every day: half lit in the
// morning, a crescent at noon, half lit again at dusk, and almost full at midnight, when it
// lights the land rose-gold. By night: a magenta and violet nebula, two small moons, airglow.
//
// Everything here reads one set of uniforms (sky.uniforms), shared with the terrain and the
// characters so the fog, the light and the sky always agree.

import * as THREE from 'three';
import { Atmosphere, ATMO, GLSL_ATMO, sunTransmittance } from './atmosphere.js';

// ---- the giant planet ------------------------------------------------------------------------
// Ember is a fixed point in the sky (this moon is tidally locked to it). Everything about it
// lives here so later updates can move it, light it differently, or send the player there.
export const EMBER = {
  name: 'Ember',
  // where it hangs: azimuth measured from due south toward the west, and elevation, in degrees
  azimuth: 14,
  elevation: 24,
  angularRadius: 18.5,
  // how fast its surface and clouds turn (radians per game day)
  spin: 0.35,
  cloudSpin: 0.55,
  axialTilt: 0.32,
  // how much of the sun's light it throws onto this moon when full (fraction of sunlight)
  shine: 0.0065,
  // colours of its dusty surface (sRGB hex) and its thin atmosphere
  palette: { base: 0xf09a8c, light: 0xffd2bf, deep: 0xcc7078, orange: 0xf6a46c, haze: 0xffc4b4 },
};

// observer latitude: puts the sun's daily arc above Ember
const LATITUDE = THREE.MathUtils.degToRad(27);
export const DAY_LENGTH = 20 * 60; // seconds of play per full day

const VS = /* glsl */ `
uniform mat4 uCamRot;
uniform mat4 uProjInv;
varying vec3 vDir;
void main() {
  vec4 clip = vec4(position.xy, 1.0, 1.0);
  vec4 view = uProjInv * clip;
  vDir = mat3(uCamRot) * (view.xyz / view.w);
  gl_Position = clip;
}
`;

// shared GLSL for everything that reads the sky: the table lookup and the fog colour
export const GLSL_SKY_COMMON = /* glsl */ `
uniform sampler2D uSkyView;
uniform vec3 uSunDir;
uniform vec3 uPlanetDir;
uniform float uNight;
uniform vec3 uFogTint;
uniform float uFogUnder;
uniform float uGloom;
vec2 skyViewUV(vec3 d) {
  float az = atan(d.x, d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float s = sqrt(abs(el) / (0.5 * 3.14159265));
  return vec2(az / (2.0 * 3.14159265) + 0.5, 0.5 + 0.5 * sign(el) * s);
}
vec3 skyLookup(vec3 d) { return texture2D(uSkyView, skyViewUV(d)).rgb; }
// what distant things fade into: the sky just above the horizon in that direction
vec3 fogColorFor(vec3 d) {
  vec3 h = normalize(vec3(d.x, max(d.y, 0.0) * 0.6 + 0.03, d.z));
  vec3 c = skyLookup(h);
  // under the storm the distance fades to the dark of the cloud deck, not a bright haze
  c *= 1.0 - 0.5 * uGloom;
  return mix(c, uFogTint, uFogUnder);
}
`;

const FS = /* glsl */ `
${GLSL_ATMO}
${GLSL_SKY_COMMON}
uniform sampler2D uTrans;
uniform samplerCube uNebula;
uniform sampler2D uPlanetMap;
uniform sampler2D uCloudNoise;
uniform mat3 uCelestial;
uniform mat3 uPlanetFrame;
uniform float uPlanetSinR;
uniform float uPlanetCosR;
uniform float uPlanetSpin;
uniform float uCloudSpin;
uniform vec3 uSunE;
uniform vec3 uSunDisc;
uniform vec3 uMoonDir[2];
uniform float uMoonR[2];
uniform vec3 uHaze;
uniform float uTime;
uniform float uCloudCover;
uniform vec2 uWind;
uniform float uViewH;
uniform float uDay;
uniform float uStarBoost;
uniform float uCelestial2;
uniform vec3 uSunColor;
uniform float uBolt;
uniform vec3 uBoltDir;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 starLayer(vec3 d, float scale, float density, float bright) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  float h = hash13(cell);
  if (h > density) return vec3(0.0);
  vec3 o = hash33(cell + 7.1) * 0.7 + 0.15;
  vec3 q = p - cell - o;
  // distance across the line of sight only
  q -= d * dot(q, d);
  float r2 = dot(q, q);
  float px = max(length(fwidth(p)) * 0.55, 0.02);
  float b = exp(-r2 / (px * px)) * pow(1.0 - h / density, 3.0) * bright;
  // colour: from hot blue-white to orange
  float t = hash13(cell + 3.7);
  vec3 c = mix(vec3(1.0, 0.72, 0.5), vec3(0.72, 0.84, 1.0), t);
  c = mix(c, vec3(1.0), 0.4);
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + t * 5.0) + h * 60.0);
  return c * b * tw;
}

vec3 starsAt(vec3 d) {
  // faint ones only at night; the brightest few still show through the day sky
  vec3 s = (starLayer(d, 300.0, 0.10, 1.0) + starLayer(d, 140.0, 0.035, 3.0)) * uNight;
  s += starLayer(d, 60.0, 0.010, 9.0) * (uNight + 0.06 * uStarBoost);
  return s;
}

// a ray from the observer meets a sphere at unit distance in direction c with sine radius sr
// returns the near hit distance, or -1
float hitSphere(vec3 d, vec3 c, float sr) {
  float b = dot(d, c);
  float k = b * b - (1.0 - sr * sr);
  if (k < 0.0) return -1.0;
  return b - sqrt(k);
}

vec4 moon(vec3 d, vec3 c, float sr, vec3 tint, float seed) {
  float t = hitSphere(d, c, sr);
  float ang = acos(clamp(dot(d, c), -1.0, 1.0));
  float aa = fwidth(ang) * 1.5;
  float cov = 1.0 - smoothstep(asin(sr) - aa, asin(sr) + aa, ang);
  if (cov <= 0.0) return vec4(0.0);
  if (t < 0.0) t = dot(d, c);
  vec3 n = normalize(d * t - c);
  // craters: a few octaves of hashed bumps on the sphere
  vec3 q = n * 6.0 + seed;
  float cr = 0.0;
  for (int i = 0; i < 3; i++) {
    vec3 cell = floor(q);
    vec3 f = fract(q) - 0.5 - (hash33(cell) - 0.5) * 0.5;
    float r = length(f);
    cr += smoothstep(0.32, 0.18, r) * (0.5 - 0.3 * smoothstep(0.18, 0.05, r)) * (0.6 / float(i + 1));
    q *= 2.3;
  }
  vec3 alb = tint * (0.85 - cr * 0.6);
  float ndl = dot(n, uSunDir);
  float lit = smoothstep(-0.03, 0.2, ndl) * max(ndl, 0.0) * 0.8 + smoothstep(-0.05, 0.1, ndl) * 0.08;
  // a bluish rim, like the moons over the nebula
  float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
  vec3 col = (alb * lit * uSunE * 0.06 + vec3(0.25, 0.45, 1.0) * rim * 0.02 * (0.3 + uNight)) * uCelestial2;
  // the giant planet lights the side of each moon that faces it
  float ndp = max(dot(n, uPlanetDir), 0.0);
  col += alb * ndp * 0.0035 * uSunE.r * uNight;
  return vec4(col, cov);
}

vec4 planet(vec3 d) {
  float sr = uPlanetSinR;
  float t = hitSphere(d, uPlanetDir, sr);
  float cosA = dot(d, uPlanetDir);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float R = asin(sr);
  float aa = fwidth(ang) * 1.5;
  float cov = 1.0 - smoothstep(R - aa, R + aa, ang);
  // a soft halo of the planet's own atmosphere, just outside the disc on the sunlit side
  vec3 side = normalize(d - uPlanetDir * cosA);
  float litSide = max(dot(side, uSunDir) * 0.8 + 0.2 * dot(uPlanetDir, uSunDir) + 0.2, 0.0);
  float halo = exp(-max(ang - R, 0.0) / 0.012) * (1.0 - cov);
  vec3 haloCol = uHaze * halo * litSide * uSunE * 0.05;
  if (cov <= 0.0) return vec4(haloCol * uCelestial2, 0.0);
  if (t < 0.0) t = cosA;
  vec3 n = normalize(d * t - uPlanetDir);
  // the surface turns with the planet
  vec3 ln = uPlanetFrame * n;
  float lon = atan(ln.x, ln.z) + uPlanetSpin;
  float lat = asin(clamp(ln.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * 3.14159265) + 0.5, 0.5 + lat / 3.14159265);
  vec4 surf = texture2D(uPlanetMap, uv);
  vec3 alb = surf.rgb * surf.rgb;
  // its own clouds turn a little faster
  float clon = atan(ln.x, ln.z) + uCloudSpin;
  float cl = texture2D(uPlanetMap, vec2(clon / (2.0 * 3.14159265) + 0.87, 0.5 + lat / 3.14159265)).a;
  alb = mix(alb, vec3(1.0, 0.9, 0.88), cl * 0.55);
  float ndl = dot(n, uSunDir);
  // dusty surfaces stay bright right to the terminator, which is soft and slightly ragged
  float rag = (surf.a - 0.5) * 0.06;
  float lit = smoothstep(-0.06 + rag, 0.16 + rag, ndl) * (0.35 + 0.65 * pow(max(ndl, 0.0), 0.7));
  float view = max(dot(n, -d), 0.0);
  vec3 col = alb * lit * uSunE * 0.3;
  // its thin atmosphere: a bright limb on the sunlit side and a faint glow over the dark side's edge
  float limb = pow(1.0 - view, 3.0);
  col += uHaze * limb * smoothstep(-0.25, 0.35, ndl) * uSunE * 0.045;
  col += uHaze * pow(1.0 - view, 6.0) * 0.004 * uSunE;
  // night side: barely there
  col += alb * 0.0012 * uSunE * (1.0 - smoothstep(-0.2, 0.1, ndl));
  return vec4((col + haloCol) * uCelestial2, cov);
}

vec4 clouds(vec3 d, vec3 skyCol) {
  if (d.y < 0.0) return vec4(0.0);
  float r0 = uRg + uViewH;
  float Rc = uRg + 2.6;
  float mu = d.y;
  float t = -r0 * mu + sqrt(r0 * r0 * (mu * mu - 1.0) + Rc * Rc);
  vec3 p = d * t;
  // storm clouds are bigger and run faster
  vec2 uv = p.xz / mix(30.0, 44.0, uGloom) + uWind * uTime * (1.0 + 1.6 * uGloom);
  // cirrus streaks stretched along the wind, and patchy puffs
  vec4 n1 = texture2D(uCloudNoise, uv * 0.35);
  vec4 n2 = texture2D(uCloudNoise, uv * 1.1 + n1.rg * 0.15);
  vec4 n3 = texture2D(uCloudNoise, vec2(uv.x * 0.25, uv.y * 1.6) + n1.ba * 0.3);
  float puff = n1.r * 0.62 + n2.g * 0.28 + n2.b * 0.1;
  float wisps = smoothstep(0.52, 0.85, n3.a) * smoothstep(0.35, 0.65, n1.g);
  float cover = mix(uCloudCover, 0.86, uGloom);
  float dens = smoothstep(1.0 - cover, 1.0 - cover + mix(0.32, 0.42, uGloom), puff) * 0.9 + wisps * 0.55 * (1.0 - uGloom * 0.6);
  if (dens <= 0.001) return vec4(0.0);
  // light: denser toward the sun means more shadow
  vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.06;
  vec4 m = texture2D(uCloudNoise, uv * 0.35 + toSun);
  float shadow = clamp((m.r - n1.r) * 3.0, -0.5, 1.0);
  float cosS = dot(d, uSunDir);
  float silver = pow(max(cosS, 0.0), 8.0) * 1.5 + pow(max(cosS, 0.0), 2.0) * 0.4;
  // sunlight that actually reaches the clouds (none once the sun is down)
  vec3 sunL = uSunColor * (0.11 * (1.0 - shadow * 0.55) + silver * 0.05 * (1.0 - dens * 0.5)) * 1.15;
  // the giant planet lights the clouds at night
  float cosP = dot(d, uPlanetDir);
  vec3 planetL = uHaze * uSunE.r * EMBER_LIGHT * (0.5 + 0.6 * pow(max(cosP, 0.0), 4.0)) * uNight;
  vec3 amb = skyLookup(vec3(0.0, 1.0, 0.0)) * 0.9 + skyCol * 0.25;
  // at night the clouds are dark shapes against the nebula, rimmed with Ember's light
  amb *= 1.0 - uNight * 0.55;
  vec3 col = (sunL + planetL) * mix(vec3(1.0), vec3(0.85, 0.9, 1.0), dens) + amb;
  if (uGloom > 0.0) {
    // storm cloud: dark, heavy bellies; the thin edges toward the sun lit gold
    // bellies a step lighter than the black sky behind them, so their shapes read
    vec3 belly = (amb * 0.62 + sunL * 0.16 + uSunColor * 0.0045) * vec3(0.8, 0.84, 0.92) * (1.0 - 0.4 * smoothstep(0.35, 1.0, dens));
    vec3 edge = uSunColor * (silver * 0.14 + 0.014) * (1.0 - smoothstep(0.2, 0.8, dens)) * vec3(1.0, 0.84, 0.62);
    col = mix(col, belly + edge, uGloom);
    // lightning inside the clouds
    float bolt = uBolt * (0.25 + 0.75 * pow(max(dot(d, uBoltDir), 0.0), 5.0));
    col += vec3(0.7, 0.76, 1.0) * bolt * (0.4 + dens) * 2.2;
  }
  // far clouds melt into the haze near the horizon
  float far = 1.0 - exp(-t / 260.0);
  col = mix(col, skyCol, far * 0.75);
  float a = (1.0 - exp(-dens * mix(2.6, 4.2, uGloom))) * smoothstep(0.0, 0.07, d.y);
  return vec4(col, a * (1.0 - far * 0.5 * (1.0 - uGloom * 0.7)));
}

void main() {
  vec3 d = normalize(vDir);
  vec3 sky = skyLookup(d);
  float r0 = uRg + uViewH;
  vec3 T = d.y > -0.02 ? texture2D(uTrans, transUV(r0, max(d.y, 0.0005))).rgb : vec3(0.0);

  // space: nebula and stars turn with the sky
  vec3 c = uCelestial * d;
  vec3 neb = textureCube(uNebula, c).rgb;
  neb *= neb;
  vec3 space = (neb * (0.05 + 0.13 * uNight) + starsAt(c) * 0.05) * (1.0 - 0.9 * uGloom);

  // the far moon, behind the giant planet
  vec4 m1 = moon(d, uMoonDir[1], uMoonR[1], vec3(0.75, 0.85, 1.0), 4.0);
  space = mix(space, m1.rgb, m1.a);
  // the giant planet
  vec4 pl = planet(d);
  space = mix(space, pl.rgb, pl.a);
  if (pl.a <= 0.0) space += pl.rgb; // the halo just outside the limb
  // the near moon, in front of it
  vec4 m0 = moon(d, uMoonDir[0], uMoonR[0], vec3(0.62, 0.66, 0.74), 1.0);
  space = mix(space, m0.rgb, m0.a);
  // the sun
  float cs = dot(d, uSunDir);
  float sunR = 0.0105;
  float sd = acos(clamp(cs, -1.0, 1.0));
  float disc = 1.0 - smoothstep(sunR * 0.8, sunR, sd);
  float limbD = sqrt(max(0.0, 1.0 - (sd / sunR) * (sd / sunR)));
  space += uSunDisc * disc * (0.6 + 0.4 * limbD) * (1.0 - pl.a);

  // after the grace, Ember is only a vague huge shape behind the storm
  space *= 1.0 - 0.82 * uGloom;
  // by day the planet's disc reads as a darker, deeper blue where it blocks the far sky,
  // and its lit face shows through the haze a little more clearly than physics would allow
  vec3 col = sky * (1.0 - pl.a * (0.16 + 0.22 * clamp(dot(pl.rgb, vec3(0.3)) * 0.5, 0.0, 1.0)) * uDay * (1.0 - uGloom)) + space * T;
  col += vec3(0.6, 0.66, 0.9) * uBolt * 0.004 * uSunE.r;

  // under the storm the sky darkens toward the horizon to meet the fog
  col *= 1.0 - 0.5 * uGloom * (1.0 - smoothstep(0.0, 0.25, d.y));
  vec4 cl = clouds(d, sky * (1.0 - 0.5 * uGloom));
  col = mix(col, cl.rgb, cl.a);
  // below the horizon: the haze the distant land fades into
  if (d.y < 0.0) col = mix(col, fogColorFor(d), smoothstep(0.0, -0.05, d.y));
  col = mix(col, uFogTint, uFogUnder);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.atmo = new Atmosphere(renderer);
    this.time = 0.3; // 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset
    this.day = 1;
    this.sunDir = new THREE.Vector3();
    this.planetDir = new THREE.Vector3();
    this.sunColor = new THREE.Vector3();
    this.planetLight = new THREE.Vector3();
    this.ambientUp = new THREE.Vector3();
    this.ambientDown = new THREE.Vector3();
    this._frame = 0;
    // the weather: 0 the clear alien sky of the grace period, 1 the storm after it
    this.gloom = 0;
    this.gloomTarget = 0;
    this.bolt = 0;
    this.boltT = 12;
    this.onThunder = null; // (delay seconds, loudness)
    // the endless night far out: 0 none, 1 the sun never shows
    this.endless = 0;
    this.dark = 0;

    const e = EMBER;
    const az = THREE.MathUtils.degToRad(e.azimuth), el = THREE.MathUtils.degToRad(e.elevation);
    // south is +z, west is -x
    this.planetDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const sr = Math.sin(THREE.MathUtils.degToRad(e.angularRadius));
    // the planet's frame: its axis tilted toward the observer a little
    const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -e.axialTilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), az).normalize();
    const zf = this.planetDir.clone().negate();
    const xf = new THREE.Vector3().crossVectors(axis, zf).normalize();
    const yf = new THREE.Vector3().crossVectors(zf, xf).normalize();
    const frame = new THREE.Matrix3().set(xf.x, xf.y, xf.z, yf.x, yf.y, yf.z, zf.x, zf.y, zf.z);

    const pal = (h) => new THREE.Color(h);
    this.planetMap = bakePlanet(renderer, e.palette);
    this.nebula = bakeNebula(renderer);
    this.cloudNoise = makeCloudNoise();
    const hazeC = pal(e.palette.haze);

    this.uniforms = {
      ...this.atmo.uniforms,
      uSkyView: { value: this.atmo.viewRT.texture },
      uTrans: { value: this.atmo.transRT.texture },
      uNebula: { value: this.nebula },
      uPlanetMap: { value: this.planetMap },
      uCloudNoise: { value: this.cloudNoise },
      uCelestial: { value: new THREE.Matrix3() },
      uPlanetFrame: { value: frame },
      uPlanetSinR: { value: sr },
      uPlanetCosR: { value: Math.sqrt(1 - sr * sr) },
      uPlanetSpin: { value: 0 },
      uCloudSpin: { value: 0 },
      uSunDir: { value: this.sunDir },
      uPlanetDir: { value: this.planetDir },
      uSunE: { value: new THREE.Vector3(20, 20, 20) },
      uSunDisc: { value: new THREE.Vector3() },
      uMoonDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
      uMoonR: { value: [Math.sin(THREE.MathUtils.degToRad(2.4)), Math.sin(THREE.MathUtils.degToRad(1.1))] },
      uHaze: { value: new THREE.Vector3(hazeC.r, hazeC.g, hazeC.b) },
      uTime: { value: 0 },
      uCloudCover: { value: 0.34 },
      uWind: { value: new THREE.Vector2(0.004, 0.0015) },
      uViewH: { value: ATMO.viewH },
      uDay: { value: 1 },
      uNight: { value: 0 },
      uStarBoost: { value: 1 },
      uCelestial2: { value: 1 },
      uFogTint: { value: new THREE.Vector3(0, 0, 0) },
      uFogUnder: { value: 0 },
      // lighting for the terrain and characters
      uSunColor: { value: this.sunColor },
      uGloom: { value: 0 },
      uBolt: { value: 0 },
      uBoltDir: { value: new THREE.Vector3(0, 0.3, 1).normalize() },
      uPlanetLight: { value: this.planetLight },
      uAmbientUp: { value: this.ambientUp },
      uAmbientDown: { value: this.ambientDown },
      uTorchColor: { value: new THREE.Vector3(1.0, 0.62, 0.3) },
      uTorchFlicker: { value: 1 },
      uExposure: { value: 1 },
    };

    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VS,
      fragmentShader: FS.replace(/EMBER_LIGHT/g, (e.shine * 0.6).toFixed(5)),
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(tri, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.uniforms.uCamRot = { value: new THREE.Matrix4() };
    this.uniforms.uProjInv = { value: new THREE.Matrix4() };
    this.mesh.onBeforeRender = (r, s, cam) => {
      // the sky follows the camera's rotation only
      this.uniforms.uCamRot.value.copy(cam.matrixWorld).setPosition(0, 0, 0);
      this.uniforms.uProjInv.value.copy(cam.projectionMatrixInverse);
    };
    this.update(0);
  }

  // Time of day in [0, 1): 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk.
  setTime(t, day = this.day) {
    this.time = ((t % 1) + 1) % 1;
    this.day = day;
  }

  // Advance the clock by dt seconds of play.
  advance(dt) {
    this.time += dt / DAY_LENGTH;
    while (this.time >= 1) { this.time -= 1; this.day++; }
  }

  get isNight() { return this.sunDir.y < -0.07 || this.dark > 0.6; }

  // Snap the weather (a loaded game, the menus) or let it roll in.
  setGloom(g, now = true) { this.gloomTarget = g; if (now) this.gloom = g; }

  update(dt, cameraHeight = 0) {
    const u = this.uniforms;
    const t = this.time;
    u.uTime.value += dt;
    // the storm rolls in over a minute and a half
    const gd = this.gloomTarget - this.gloom;
    if (Math.abs(gd) > 1e-4) this.gloom += Math.sign(gd) * Math.min(Math.abs(gd), dt / 90);
    const G = this.gloom;
    u.uGloom.value = G;
    // lightning, now and then, once the storm is in
    this.bolt = Math.max(0, this.bolt - dt * 5.5);
    if (G > 0.85 && dt > 0) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 9 + Math.random() * 32;
        this.bolt = 1;
        this.boltFlicker = 0.08 + Math.random() * 0.12;
        const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 0.45;
        u.uBoltDir.value.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        if (this.onThunder) this.onThunder(0.6 + Math.random() * 2.6, 0.4 + Math.random() * 0.6);
      }
      // a second stroke a moment after the first
      if (this.boltFlicker > 0) { this.boltFlicker -= dt; if (this.boltFlicker <= 0) this.bolt = Math.max(this.bolt, 0.7); }
    }
    u.uBolt.value = this.bolt * this.bolt;
    const H = (t - 0.5) * Math.PI * 2; // hour angle, 0 at noon
    const dec = THREE.MathUtils.degToRad(4 * Math.sin((this.day / 12) * Math.PI * 2));
    const phi = LATITUDE;
    const xe = -Math.cos(dec) * Math.sin(H);
    const yu = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
    const zn = Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(H);
    this.sunDir.set(xe, yu, -zn).normalize();

    // the sky turns about the celestial pole with the sun
    const pole = new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi));
    const rot = new THREE.Matrix4().makeRotationAxis(pole, -t * Math.PI * 2);
    u.uCelestial.value.setFromMatrix4(rot);

    // the moons: each on its own tilted circle at its own pace
    const dayF = this.day + t;
    const m0 = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0.3, -1).normalize(), -dayF * Math.PI * 2 * 1.37 + 1.2);
    const m1 = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0.2, 0.8, -1).normalize(), -dayF * Math.PI * 2 * 0.74 + 2.7);
    u.uMoonDir.value[0].copy(m0.normalize());
    u.uMoonDir.value[1].copy(m1.normalize());

    u.uPlanetSpin.value = dayF * EMBER.spin * Math.PI * 2 * 0.1;
    u.uCloudSpin.value = dayF * EMBER.cloudSpin * Math.PI * 2 * 0.1;

    // the endless night closes in and lifts slowly
    this.dark += (this.endless - this.dark) * Math.min(1, dt * 0.4);
    if (dt === 0) this.dark = this.endless;
    const D = this.dark;
    // sunlight reaching the ground, and the disc's own brightness
    const sunE = 20 * (1 - 0.97 * D);
    const Ts = sunTransmittance(this.sunDir.y);
    // under the storm the sun still breaks through, lower and weaker
    this.sunColor.set(Ts[0], Ts[1], Ts[2]).multiplyScalar(sunE * (1 - 0.45 * G));
    u.uSunE.value.set(sunE, sunE, sunE);
    u.uSunDisc.value.set(Ts[0], Ts[1], Ts[2]).multiplyScalar(sunE * 0.0 + 3000);

    // the giant planet's light: how much of its face is lit, times how much sun it gets
    const phase = 0.5 * (1 - this.sunDir.dot(this.planetDir)); // 0 new, 1 full
    const lit = phase * phase * (3 - 2 * phase);
    const Tp = sunTransmittance(this.planetDir.y);
    const pal = new THREE.Color(EMBER.palette.base);
    const pe = sunE * EMBER.shine * lit;
    this.planetLight.set(pal.r * Tp[0], pal.g * Tp[1], pal.b * Tp[2]).multiplyScalar(pe * 4.0 * (1 - 0.92 * G));

    // night factor: 0 in daylight, 1 once the sun is well down
    const sy = this.sunDir.y;
    const night = Math.max(D, THREE.MathUtils.smoothstep(-sy, -0.02, 0.22));
    u.uNight.value = night;
    u.uDay.value = THREE.MathUtils.smoothstep(sy, -0.1, 0.25) * (1 - D);
    u.uStarBoost.value = u.uDay.value;
    // eyes adapted to the dark would see Ember blinding; keep it bright but readable
    u.uCelestial2.value = THREE.MathUtils.lerp(1, 0.09, night);
    // airglow: a magenta band low over the horizon at night
    const ag = 0.0007 * night;
    const airglow = new THREE.Vector3(0.7 * ag, 0.22 * ag, 1.0 * ag);

    // the sky table: every frame while the sun is moving fast across the horizon, else every few
    this._frame++;
    if (this._frame % (Math.abs(sy) < 0.15 || Math.abs(gd) > 1e-4 ? 1 : 4) === 0 || dt === 0) {
      this.atmo.renderView(this.sunDir, u.uSunE.value, this.planetDir, new THREE.Vector3(pal.r, pal.g, pal.b).multiplyScalar(sunE * EMBER.shine * lit * 1.4 * (1 - 0.9 * G)), airglow, G);
    }

    // ambient light from the sky for surfaces facing up and down
    const zen = skyRadianceApprox(this.sunDir, this.sunColor, night, this.planetLight);
    this.ambientUp.copy(zen.up).multiplyScalar(1 - 0.85 * D);
    this.ambientDown.copy(zen.down).multiplyScalar(1 - 0.85 * D);
    // Hell's lava lights the smoke from below
    const lv = this.lavaGlow || 0;
    if (lv > 0) {
      this.ambientDown.x += 0.3 * lv; this.ambientDown.y += 0.07 * lv; this.ambientDown.z += 0.025 * lv;
      this.ambientUp.x += 0.09 * lv; this.ambientUp.y += 0.022 * lv; this.ambientUp.z += 0.01 * lv;
    }
    if (G > 0) {
      // a dark grey sky gives a dim, cold, colourless light; the night is black
      for (const v of [this.ambientUp, this.ambientDown]) {
        const l = v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722;
        const k = 1 - G * (0.5 - 0.15 * night);
        v.set(THREE.MathUtils.lerp(v.x, l * 0.82, G * 0.7) * k, THREE.MathUtils.lerp(v.y, l * 0.88, G * 0.7) * k, THREE.MathUtils.lerp(v.z, l * 1.0, G * 0.7) * k);
      }
      // the cloud deck gives back a little of what light there is: dark, but you can see
      this.ambientUp.x += 0.035 * G * night; this.ambientUp.y += 0.04 * G * night; this.ambientUp.z += 0.055 * G * night;
      // lightning lights everything for a moment
      const b = this.bolt * this.bolt * G;
      this.ambientUp.x += b * 0.9; this.ambientUp.y += b * 0.95; this.ambientUp.z += b * 1.2;
    }
    void cameraHeight;
  }
}


// Rough sky irradiance on surfaces facing up and down, from the sun's height and colour.
function skyRadianceApprox(sunDir, sunColor, night, planetLight) {
  const sy = sunDir.y;
  const day = THREE.MathUtils.smoothstep(sy, -0.12, 0.35);
  const twi = Math.exp(-Math.pow((sy - 0.02) / 0.12, 2));
  const up = new THREE.Vector3(0.32, 0.55, 0.85).multiplyScalar(2.6 * day);
  up.add(new THREE.Vector3(0.9, 0.42, 0.55).multiplyScalar(0.8 * twi));
  // night: the giant planet's glow and the nebula's faint purple
  up.add(new THREE.Vector3(0.05, 0.035, 0.09).multiplyScalar(night));
  up.addScaledVector(planetLight, 0.35);
  const down = new THREE.Vector3(sunColor.x * 0.05 + up.x * 0.25, sunColor.y * 0.045 + up.y * 0.25, sunColor.z * 0.04 + up.z * 0.25);
  return { up, down };
}

// ---- baked textures -------------------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
                 mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
                 mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * gnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return s;
}
float worley(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = 0.5 + 0.5 * hash3(i + g);
    d = min(d, length(g + o - f));
  }
  return d;
}
`;

function bakePass(renderer, target, fragmentShader, uniforms = {}) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(tri, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  tri.dispose();
}

// Ember's surface: dusty coral plains with paler storms, darker rose basins, a scatter of
// bright specks, and (in alpha) a cloud layer of thin pale streaks.
function bakePlanet(renderer, palette) {
  const W = renderer.capabilities.maxTextureSize >= 4096 ? 2048 : 1024;
  const rt = new THREE.WebGLRenderTarget(W, W / 2, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  const c = (h) => new THREE.Color(h);
  bakePass(renderer, rt, /* glsl */ `
    ${NOISE_GLSL}
    uniform vec3 cBase, cLight, cDeep, cOrange;
    varying vec2 vUv;
    void main() {
      float lon = (vUv.x - 0.5) * 6.2831853;
      float lat = (0.5 - (1.0 - vUv.y)) * 3.14159265;
      vec3 p = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
      // gentle banding, broken up by swirls
      vec3 w = vec3(fbm(p * 2.0, 4), fbm(p * 2.0 + 7.0, 4), fbm(p * 2.0 + 13.0, 4));
      vec3 q = p + w * 0.45;
      float band = sin(q.y * 9.0 + fbm(q * 3.0, 3) * 2.5) * 0.5 + 0.5;
      float big = fbm(q * 1.6, 5) * 0.5 + 0.5;
      float storms = smoothstep(0.55, 0.85, fbm(q * 4.0 + 3.0, 5) * 0.5 + 0.5);
      float basins = smoothstep(0.58, 0.8, fbm(p * 2.6 + 21.0, 4) * 0.5 + 0.5);
      vec3 col = mix(cDeep, cBase, smoothstep(0.3, 0.62, big));
      col = mix(col, cOrange, smoothstep(0.5, 0.95, band) * 0.45);
      col = mix(col, cLight, storms * 0.85);
      col = mix(col, cDeep * 0.8, basins * 0.6);
      // mottling: blotches of darker rose and paler dust at every scale
      float mot = fbm(q * 9.0 + 70.0, 4);
      col *= 0.9 + mot * 0.24;
      // fine dust and specks
      float grain = fbm(p * 40.0, 3);
      col *= 0.93 + grain * 0.14;
      float speck = smoothstep(0.08, 0.0, worley(p * 70.0)) * smoothstep(0.4, 0.75, fbm(p * 6.0 + 40.0, 3) * 0.5 + 0.5);
      col = mix(col, vec3(1.0, 0.9, 0.86), speck * 0.7);
      // clouds: pale streaks pulled along the bands
      vec3 cq = p + vec3(fbm(p * 3.0 + 50.0, 4), 0.0, fbm(p * 3.0 + 60.0, 4)) * 0.35;
      float cl = fbm(vec3(cq.x * 3.0, cq.y * 16.0, cq.z * 3.0), 5) * 0.5 + 0.5;
      cl = smoothstep(0.58, 0.82, cl);
      gl_FragColor = vec4(sqrt(col), cl);
    }`, { cBase: { value: lin(c(palette.base)) }, cLight: { value: lin(c(palette.light)) }, cDeep: { value: lin(c(palette.deep)) }, cOrange: { value: lin(c(palette.orange)) } });
  rt.texture.generateMipmaps = true;
  // build mips
  renderer.initRenderTarget?.(rt);
  return rt.texture;
}

function lin(c) { return new THREE.Vector3(c.r, c.g, c.b); }

// The nebula: magenta and violet clouds with dark dust lanes, brightest along a band.
function bakeNebula(renderer) {
  const S = 512;
  const rt = new THREE.WebGLCubeRenderTarget(S, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      varying vec3 vP;
      void main() {
        vec3 d = normalize(vP);
        // the band: a great circle tilted across the sky
        vec3 bandN = normalize(vec3(0.35, 0.82, 0.45));
        float b = dot(d, bandN);
        float band = exp(-b * b * 9.0);
        vec3 w = vec3(fbm(d * 2.5, 5), fbm(d * 2.5 + 5.2, 5), fbm(d * 2.5 + 9.7, 5));
        vec3 q = d + w * 0.55;
        float n = fbm(q * 3.0, 6) * 0.5 + 0.5;
        float n2 = fbm(q * 7.0 + 3.0, 5) * 0.5 + 0.5;
        float dust = smoothstep(0.5, 0.75, fbm(q * 5.0 + 11.0, 5) * 0.5 + 0.5);
        float glow = pow(n, 3.0) * (0.25 + band * 1.6);
        vec3 magenta = vec3(0.95, 0.25, 0.85);
        vec3 violet = vec3(0.42, 0.18, 0.95);
        vec3 blue = vec3(0.12, 0.2, 0.75);
        vec3 pink = vec3(1.0, 0.55, 0.85);
        vec3 col = mix(blue, violet, smoothstep(0.3, 0.6, n));
        col = mix(col, magenta, smoothstep(0.5, 0.8, n2));
        col = mix(col, pink, smoothstep(0.75, 0.95, n2 * n) * 0.8);
        col *= glow;
        col *= 1.0 - dust * 0.85 * band;
        // knots of bright gas
        float knots = pow(smoothstep(0.7, 0.95, n2), 3.0) * band;
        col += pink * knots * 0.6;
        // a faint wash of unresolved stars along the band
        col += vec3(0.6, 0.62, 0.8) * band * 0.06 * (0.6 + 0.4 * n2);
        gl_FragColor = vec4(sqrt(clamp(col, 0.0, 1.0)), 1.0);
      }`,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  scene.add(box);
  const cubeCam = new THREE.CubeCamera(0.1, 10, rt);
  cubeCam.update(renderer, scene);
  mat.dispose();
  box.geometry.dispose();
  return rt.texture;
}

// A tileable noise texture for the clouds: r fbm, g puffy cells, b detail, a streaks.
function makeCloudNoise() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const P = (s) => {
    const p = new Uint8Array(512);
    const a = Array.from({ length: 256 }, (_, i) => i);
    let x = s;
    for (let i = 255; i > 0; i--) { x = (x * 1103515245 + 12345) & 0x7fffffff; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    for (let i = 0; i < 512; i++) p[i] = a[i & 255];
    return p;
  };
  const perm = P(7);
  const grad = (h, x, y) => { const a = (h / 256) * Math.PI * 2; return Math.cos(a) * x + Math.sin(a) * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (i, j) => perm[(perm[((i % period) + period) % period & 255] + (((j % period) + period) % period)) & 511];
    const n00 = grad(h(xi, yi), xf, yf), n10 = grad(h(xi + 1, yi), xf - 1, yf), n01 = grad(h(xi, yi + 1), xf, yf - 1), n11 = grad(h(xi + 1, yi + 1), xf - 1, yf - 1);
    const u = fade(xf), v = fade(yf);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
  };
  const fbm = (x, y, base, oct) => { let s = 0, a = 0.5, f = base; for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f, f); a *= 0.5; f *= 2; } return s; };
  const cells = (x, y, P_) => {
    let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = Math.floor(x * P_) + i, cy = Math.floor(y * P_) + j;
      const wx = ((cx % P_) + P_) % P_, wy = ((cy % P_) + P_) % P_;
      const hx = perm[(wx + perm[wy & 255]) & 511] / 255, hy = perm[(wy * 3 + perm[(wx + 7) & 255]) & 511] / 255;
      d = Math.min(d, Math.hypot(cx + hx - x * P_, cy + hy - y * P_));
    }
    return d;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const r = fbm(u, v, 4, 6) * 0.9 + 0.5;
    const g = 1 - Math.min(1, cells(u, v, 8) * 0.9 + (1 - cells(u, v, 16)) * 0.0) * 0.8 + fbm(u, v, 16, 3) * 0.3;
    const b = fbm(u, v, 32, 3) + 0.5;
    const a = fbm(u, v, 8, 5) + 0.5;
    const o = (y * N + x) * 4;
    data[o] = Math.max(0, Math.min(255, r * 255));
    data[o + 1] = Math.max(0, Math.min(255, g * 255));
    data[o + 2] = Math.max(0, Math.min(255, b * 255));
    data[o + 3] = Math.max(0, Math.min(255, a * 255));
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
