// Sky, sun and moon, the day-night cycle and the weather. One model drives
// everything that depends on the light: the dome (sun disc, moon, stars,
// clouds lit from the sun's side), the haze over the land (the same colour as
// the sky behind it), the sun's and the sky's light, how the camera exposes,
// and the grade of the finished frame. Colours here are scene light (linear),
// not screen colours; the film look turns them into what you see.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util.js';
import { GFX, HAZE_GLSL, CLOUD_GLSL, CLOUD_H, CLOUD_S, globalUniforms } from '../gfx/globals.js';
import { SunShadows } from '../gfx/shadows.js';

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uZenith; uniform vec3 uSunDisc; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform vec2 uLightXZ;
uniform vec4 uP; // storm, stars, lightning, time
${HAZE_GLSL}
${CLOUD_GLSL}
varying vec3 vDir;
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
void main() {
  vec3 d = normalize( vDir );
  float up = d.y;
  vec3 haze = hfHaze( d );
  // haze along the horizon, deepening to the zenith colour overhead
  vec3 col = mix( haze, uZenith, 1.0 - exp( - max( up, 0.0 ) * 3.4 ) );
  if ( up < 0.0 ) col = haze * ( 1.0 + up * 0.45 );

  // clouds: a flat deck that stays put over the land, so their shadows on the ground line up with them
  float cloud = 0.0;
  vec3 cc = vec3( 0.0 );
  if ( up > - 0.012 ) {
    float inv = 1.0 / ( max( up, 0.0 ) + 0.085 );
    vec2 uv = ( cameraPosition.xz + d.xz * inv * ${CLOUD_H.toFixed(1)} ) * ${CLOUD_S.toFixed(8)} + hfCloud.xy;
    float cover = hfCloud.z;
    float dens = hfCloudDens( uv, cover );
    // towering storm shelf
    dens = max( dens, uP.x * smoothstep( 0.2, 0.75, texture2D( hfNoise, uv * 0.43 + 0.2 ).a + 0.18 ) );
    // the edges break up into wisps; the cores stay solid
    float wisp = texture2D( hfNoise, uv * 8.7 + hfCloud.xy * 1.7 ).b;
    dens = smoothstep( 0.0, 1.0, dens * ( 0.7 + wisp * 0.6 ) - ( 1.0 - dens ) * wisp * 0.18 );
    // high, thin sheets on fair days
    float sheet = texture2D( hfNoise, uv * 0.62 + vec2( 0.4, 0.1 ) - hfCloud.xy * 0.3 ).a;
    float cirrus = smoothstep( 0.52, 0.9, sheet ) * ( 0.4 + 0.6 * texture2D( hfNoise, uv * vec2( 2.1, 5.3 ) + 0.7 ).b ) * 0.2 * ( 1.0 - cover ) * ( 1.0 - uP.x );
    // lit from the light's side (less cloud between here and the sun means brighter); thick cloud is grey underneath
    float toward = hfCloudDens( uv + uLightXZ * 0.018, cover );
    float lit = clamp( 1.0 - toward * 0.85 + ( 1.0 - dens ) * 0.25, 0.0, 1.0 );
    float sd0 = max( dot( d, hfSunDir ), 0.0 );
    cc = mix( uCloudShade, uCloudLit, lit * ( 1.0 - smoothstep( 0.55, 1.0, dens ) * 0.42 ) );
    // silver lining where thin cloud crosses the sun
    cc += uSunDisc * pow( sd0, 24.0 ) * ( 1.0 - dens ) * 2.2;
    float fade = smoothstep( 0.0, 0.14, up );
    cc = mix( haze, cc, smoothstep( 0.015, 0.26, up ) );
    cloud = max( dens, cirrus ) * fade;
    col = mix( col, cc, cloud );
    cloud = dens * fade;
  }
  float clear = 1.0 - cloud;

  // sun: a hard disc with a tight corona; the wide glow is in the haze
  float sd = dot( d, hfSunDir );
  col += uSunDisc * ( smoothstep( 0.99974, 0.99990, sd ) * 46.0 + pow( max( sd, 0.0 ), 900.0 ) * 3.0 ) * clear * clear * smoothstep( - 0.03, 0.01, up );

  // moon, with a hint of its seas
  float md = dot( d, uMoonDir );
  if ( md > 0.99 ) {
    float disc = smoothstep( 0.99968, 0.99980, md );
    vec3 q = d - uMoonDir * md;
    float seas = texture2D( hfNoise, q.xz * 9.0 + q.y * 7.0 + 0.4 ).r;
    float shade = 0.72 + 0.4 * smoothstep( 0.3, 0.7, seas );
    // bright at night; by day a pale ghost of itself
    float vis = smoothstep( 0.0, 0.25, uMoonCol.b );
    col = mix( col, uMoonCol * shade * 2.6, disc * clear * vis );
    col += vec3( 0.45, 0.5, 0.56 ) * shade * disc * clear * ( 1.0 - vis ) * 0.3;
    col += uMoonCol * pow( max( md, 0.0 ), 420.0 ) * 0.22 * clear;
  }

  // stars: round points on a cube-mapped grid, a few bright, most faint, twinkling
  if ( uP.y > 0.01 && up > - 0.05 ) {
    vec3 a = abs( d );
    vec2 suv; float face;
    if ( a.y >= a.x && a.y >= a.z ) { suv = d.xz / a.y; face = 0.0; }
    else if ( a.x >= a.z ) { suv = d.zy / a.x; face = d.x > 0.0 ? 1.0 : 2.0; }
    else { suv = d.xy / a.z; face = d.z > 0.0 ? 3.0 : 4.0; }
    suv = suv * 44.0 + face * 19.0;
    vec2 cell = floor( suv );
    float rnd = h21( cell );
    if ( rnd > 0.84 ) {
      vec2 off = ( vec2( h21( cell + 7.1 ), h21( cell + 3.3 ) ) - 0.5 ) * 0.7;
      float r = length( fract( suv ) - 0.5 - off );
      float mag = pow( h21( cell + 1.7 ), 7.0 ) * 3.2 + 0.22;
      float tw = 0.78 + 0.22 * sin( uP.w * ( 2.0 + rnd * 5.0 ) + rnd * 40.0 );
      vec3 tint = mix( vec3( 0.78, 0.86, 1.0 ), vec3( 1.0, 0.9, 0.74 ), h21( cell + 9.4 ) );
      col += tint * smoothstep( 0.085, 0.0, r ) * mag * tw * uP.y * clear * smoothstep( - 0.02, 0.22, up );
    }
  }
  col += vec3( 0.55, 0.65, 0.85 ) * uP.z * ( 0.35 + cloud );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// The light through the day, keyed on the sun's height above the horizon.
// zen/hor: sky overhead and at the horizon; sun: sunlight colour and strength;
// sky/gnd: light from the sky and bounced off the ground; glow: haze colour
// toward the sun; disc: the sun's own colour; exp: camera exposure; mist:
// ground mist; shadows/highs/sat: the grade.
const KEYS = [
  { e: -18, zen: [0.003, 0.006, 0.02], hor: [0.011, 0.017, 0.04], sun: [0, 0, 0], sunI: 0, sky: [0.07, 0.105, 0.21], skyI: 0.5, gnd: [0.02, 0.025, 0.04], glow: [0, 0, 0], disc: [0, 0, 0], exp: 2.7, mist: 0.0022, shadows: [0.84, 0.95, 1.16], highs: [0.94, 1.0, 1.08], sat: 0.78 },
  { e: -9, zen: [0.012, 0.022, 0.07], hor: [0.05, 0.058, 0.115], sun: [0, 0, 0], sunI: 0, sky: [0.09, 0.13, 0.26], skyI: 0.48, gnd: [0.03, 0.035, 0.05], glow: [0.4, 0.2, 0.2], disc: [0, 0, 0], exp: 2.5, mist: 0.0026, shadows: [0.86, 0.95, 1.14], highs: [0.96, 1.0, 1.06], sat: 0.82 },
  { e: -3, zen: [0.035, 0.06, 0.17], hor: [0.2, 0.17, 0.27], sun: [1, 0.4, 0.2], sunI: 0, sky: [0.19, 0.22, 0.4], skyI: 0.46, gnd: [0.08, 0.065, 0.07], glow: [0.95, 0.36, 0.2], disc: [1, 0.3, 0.1], exp: 2.35, mist: 0.0034, shadows: [0.9, 0.95, 1.1], highs: [1.03, 1.0, 0.98], sat: 0.95 },
  { e: 0, zen: [0.07, 0.11, 0.28], hor: [0.5, 0.34, 0.36], sun: [1, 0.44, 0.18], sunI: 1.6, sky: [0.4, 0.35, 0.5], skyI: 0.55, gnd: [0.24, 0.15, 0.1], glow: [1.5, 0.56, 0.18], disc: [1, 0.36, 0.1], exp: 2.2, mist: 0.004, shadows: [0.9, 0.96, 1.1], highs: [1.07, 1.0, 0.92], sat: 1.06 },
  { e: 4, zen: [0.08, 0.15, 0.38], hor: [0.62, 0.47, 0.4], sun: [1, 0.58, 0.28], sunI: 2.7, sky: [0.5, 0.44, 0.56], skyI: 0.74, gnd: [0.32, 0.2, 0.12], glow: [1.3, 0.58, 0.2], disc: [1, 0.55, 0.22], exp: 1.9, mist: 0.0034, shadows: [0.91, 0.97, 1.09], highs: [1.07, 1.0, 0.92], sat: 1.08 },
  { e: 10, zen: [0.08, 0.19, 0.5], hor: [0.66, 0.6, 0.56], sun: [1, 0.72, 0.44], sunI: 3.1, sky: [0.52, 0.5, 0.66], skyI: 0.84, gnd: [0.36, 0.25, 0.15], glow: [0.9, 0.5, 0.2], disc: [1, 0.78, 0.45], exp: 1.46, mist: 0.0018, shadows: [0.93, 0.98, 1.07], highs: [1.05, 1.0, 0.94], sat: 1.06 },
  { e: 25, zen: [0.07, 0.2, 0.58], hor: [0.48, 0.62, 0.86], sun: [1, 0.9, 0.76], sunI: 3.2, sky: [0.44, 0.6, 0.92], skyI: 1.02, gnd: [0.34, 0.29, 0.19], glow: [0.5, 0.42, 0.3], disc: [1, 0.95, 0.85], exp: 1.03, mist: 0.0005, shadows: [0.96, 0.99, 1.05], highs: [1.03, 1.0, 0.97], sat: 1.04 },
  { e: 60, zen: [0.06, 0.19, 0.6], hor: [0.44, 0.6, 0.88], sun: [1, 0.96, 0.88], sunI: 3.4, sky: [0.45, 0.62, 0.95], skyI: 1.08, gnd: [0.36, 0.31, 0.21], glow: [0.35, 0.35, 0.3], disc: [1, 0.97, 0.9], exp: 1.0, mist: 0.00025, shadows: [0.97, 0.99, 1.04], highs: [1.02, 1.0, 0.97], sat: 1.03 },
];
const VEC = ['zen', 'hor', 'sun', 'sky', 'gnd', 'glow', 'disc', 'shadows', 'highs'], NUM = ['sunI', 'skyI', 'exp', 'mist', 'sat'];
const MOON = [0.55, 0.68, 1.0];

// weather: cloud cover, storm shelf, light scale, haze, rain, wind
export const WEATHER = {
  clear: { cover: 0.24, dark: 0, light: 1, haze: 1, rain: 0, wind: 0.3 },
  cloudy: { cover: 0.58, dark: 0, light: 0.9, haze: 1.6, rain: 0, wind: 0.5 },
  overcast: { cover: 0.96, dark: 0.12, light: 0.62, haze: 3.2, rain: 0.15, wind: 0.6 },
  storm: { cover: 1, dark: 1, light: 0.42, haze: 9, rain: 1, wind: 1 },
};
const mul = (a, k) => { a[0] *= k; a[1] *= k; a[2] *= k; return a; };
const mixv = (a, b, t) => { a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t; a[2] += (b[2] - a[2]) * t; return a; };
const grey = (a, t) => { const l = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11; return mixv(a, [l, l, l], t); };

export class Sky {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.time = 9.0; // hours
    this.dayLength = 24 * 60; // real seconds per game day (24 min)
    this.weather = 'clear';
    this.w = { ...WEATHER.clear };
    this.target = WEATHER.clear;
    this.weatherTimer = 240;
    this.flash = 0;
    this.lightningTimer = 8;
    this.exposure = 1;
    this.cloudOff = new THREE.Vector2(0.21, 0.63);
    this.uniforms = {
      ...globalUniforms(),
      uZenith: { value: new THREE.Color() }, uSunDisc: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonCol: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudShade: { value: new THREE.Color(0.6, 0.6, 0.65) },
      uLightXZ: { value: new THREE.Vector2(1, 0) }, uP: { value: new THREE.Vector4() },
    };
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    this.dome = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.shadows = new SunShadows(scene, quality.cascades);
    this.shadowRange = quality.cascades[0].range;
    this.hemi = new THREE.HemisphereLight(0xbfd4ea, 0x5a5040, 1);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(this.ambient);
    // the engine's fog only switches the haze on in materials; the haze itself is ours
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
    this.look = { exposure: 1, tint: new THREE.Color(1, 1, 1), shadows: new THREE.Color(1, 1, 1), highs: new THREE.Color(1, 1, 1), sat: 1, bloom: 0.5, vignette: 0.22 };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.k = {};
  }
  get sun() { return this.shadows.sun; }
  setTime(h) { this.time = ((h % 24) + 24) % 24; }
  setWeather(name, instant = false) {
    this.weather = name;
    this.target = WEATHER[name];
    if (instant) Object.assign(this.w, this.target);
  }
  setQuality(q) {
    this.quality = q;
    this.viewDistance = q.viewDistance;
    this.shadows.configure(q.cascades);
  }
  get isNight() { return this.sunElev < -4; }
  // returns 0..1 darkness used by gameplay (zombie aggression etc.)
  get darkness() { return clamp(1 - (this.sunElev + 6) / 14, 0, 1); }
  // the light at a sun height, interpolated between the keys
  key(elev) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    if (elev <= a.e) b = a;
    else if (elev >= b.e) a = b;
    else for (let i = 0; i < KEYS.length - 1; i++) if (elev >= KEYS[i].e && elev <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const t = b === a ? 0 : (elev - a.e) / (b.e - a.e), k = this.k;
    for (const n of VEC) { const p = a[n], q = b[n]; k[n] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; }
    for (const n of NUM) k[n] = a[n] + (b[n] - a[n]) * t;
    return k;
  }

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
    const kk = 1 - Math.exp(-dt * 0.08);
    for (const key of ['cover', 'dark', 'light', 'haze', 'rain', 'wind']) this.w[key] = lerp(this.w[key], this.target[key], kk);
    const w = this.w;

    // sun path: rises east (+X), sets west, slightly south
    const ang = ((this.time - 6) / 12) * Math.PI;
    const elev = Math.sin(ang) * 62;
    this.sunElev = elev;
    const er = THREE.MathUtils.degToRad(elev);
    const sunDir = this.sunDir.set(Math.cos(ang) * Math.cos(er), Math.sin(er), 0.35 * Math.cos(er)).normalize();
    const moonDir = this.uniforms.uMoonDir.value.copy(sunDir).multiplyScalar(-1);
    moonDir.y += 0.25; moonDir.normalize();
    const k = this.key(elev);
    const dayLight = smoothstep(-8, 12, elev), night = smoothstep(-3, -12, elev);
    const moonUp = smoothstep(0.02, 0.2, moonDir.y) * night;

    // weather: cloud greys the sky and takes the sun; a storm goes dark and green
    const zen = grey(k.zen, w.cover * 0.72), hor = grey(k.hor, w.cover * 0.62);
    mul(zen, lerp(1, 0.55, w.cover) * lerp(1, 0.5, w.dark));
    mul(hor, lerp(1, 0.82, w.cover) * lerp(1, 0.62, w.dark));
    if (w.dark > 0.01) {
      // the eerie green glow under a supercell
      const g = Math.max(0.12, smoothstep(-6, 20, elev));
      mixv(hor, [0.19 * g, 0.42 * g, 0.2 * g], w.dark * 0.6);
      mixv(zen, [0.02 * g, 0.06 * g, 0.05 * g], w.dark * 0.55);
    }
    const direct = w.light * (1 - Math.pow(w.cover, 1.6) * 0.88);
    const glow = mul(k.glow, (1 - w.cover * 0.85) * (0.4 + 0.6 * w.light));
    const sky = grey(k.sky, w.cover * 0.6), skyI = k.skyI * lerp(1, 0.8, w.cover) * lerp(1, 0.6, w.dark);
    if (w.dark > 0.01) mixv(sky, [0.3, 0.5, 0.36], w.dark * 0.4);

    // lightning
    if (w.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) { this.flash = 1; this.lightningTimer = 4 + Math.random() * 12; this.onThunder && this.onThunder(); }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash > 0.5 ? this.flash : this.flash * 0.3;

    // the light that casts shadows: the sun by day, the moon by night
    const useSun = elev > -2.5;
    const lightDir = this.lightDir.copy(useSun ? sunDir : moonDir);
    const sunCol = useSun ? k.sun : MOON;
    const sunI = useSun ? k.sunI * direct * smoothstep(-2.5, 1.5, elev) : 0.5 * moonUp * (1 - w.cover * 0.8);
    this.shadows.setLight(new THREE.Color(sunCol[0], sunCol[1], sunCol[2]), sunI + fl * 5);
    this.hemi.color.setRGB(sky[0], sky[1], sky[2]);
    this.hemi.groundColor.setRGB(k.gnd[0], k.gnd[1], k.gnd[2]);
    // the top view keeps a little night sight so you can still follow a fight
    const ov = (this.overview || 0) * (1 - dayLight);
    this.hemi.intensity = skyI + fl * 2 + ov * 0.9;
    this.ambient.intensity = lerp(0.035, 0.1, dayLight) + ov * 0.25;
    this.ambient.color.setRGB(sky[0], sky[1], sky[2]).lerp(new THREE.Color(1, 1, 1), 0.4);

    // shared state for every material: sun, haze, clouds
    GFX.sunDir[0] = sunDir.x; GFX.sunDir[1] = sunDir.y; GFX.sunDir[2] = sunDir.z;
    GFX.fogCol.set(hor);
    GFX.sunGlow.set(glow);
    const vd = this.viewDistance, ovw = this.overview || 0;
    // mist lies in the low ground, thickest in the early morning and in rain
    GFX.fogA[0] = (k.mist * (this.time < 11 ? 1.3 : 0.8) + w.rain * 0.004) * (1 - ovw * 0.85);
    GFX.fogA[1] = 0.085; GFX.fogA[2] = 12; GFX.fogA[3] = 1;
    GFX.fogB[0] = 0.00011 * w.haze * lerp(2.0, 1, dayLight) * (1 - ovw * 0.8);
    GFX.fogB[1] = vd * 0.7; GFX.fogB[2] = vd;
    this.cloudOff.x += dt * 0.0022 * (0.4 + w.wind); this.cloudOff.y += dt * 0.0009 * (0.4 + w.wind);
    GFX.cloud[0] = this.cloudOff.x % 1; GFX.cloud[1] = this.cloudOff.y % 1; GFX.cloud[2] = w.cover;
    GFX.cloud[3] = (this.quality.cloudShadows || 0) * 0.82 * clamp(1.15 - w.cover * 0.55, 0, 1) * (useSun ? smoothstep(1, 8, elev) : 0.6);
    GFX.misc[1] += dt; GFX.misc[2] = w.wind; GFX.misc[3] = fl;

    const u = this.uniforms;
    u.uZenith.value.setRGB(zen[0], zen[1], zen[2]);
    u.uSunDisc.value.setRGB(k.disc[0], k.disc[1], k.disc[2]).multiplyScalar(1 - w.cover * 0.6);
    u.uMoonCol.value.setRGB(0.9, 0.93, 1.0).multiplyScalar(0.55 * smoothstep(-2, -9, elev));
    u.uLightXZ.value.set(lightDir.x, lightDir.z).normalize();
    u.uP.value.set(w.dark, smoothstep(-3, -13, elev) * (1 - w.cover * 0.9), fl * 0.5, GFX.misc[1]);
    // clouds: lit by the sun (or moon) and the sky; grey-blue underneath
    const litI = (useSun ? k.sunI * smoothstep(-2.5, 3, elev) : 0.34 * moonUp) * 0.3 * lerp(1, 0.55, w.cover);
    u.uCloudLit.value.setRGB(sunCol[0] * litI + sky[0] * skyI * 0.62, sunCol[1] * litI + sky[1] * skyI * 0.62, sunCol[2] * litI + sky[2] * skyI * 0.62).multiplyScalar(lerp(1, 0.5, w.dark));
    u.uCloudShade.value.setRGB(hor[0] * 0.45 + zen[0] * 0.35, hor[1] * 0.45 + zen[1] * 0.35, hor[2] * 0.45 + zen[2] * 0.35).multiplyScalar(lerp(1, 0.55, w.cover * 0.7 + w.dark * 0.3));
    if (w.dark > 0.01) u.uCloudLit.value.lerp(new THREE.Color(0.1, 0.2, 0.13).multiplyScalar(dayLight + 0.08), w.dark * 0.5);

    this.colors.horizon.setRGB(hor[0], hor[1], hor[2]); this.colors.zenith.setRGB(zen[0], zen[1], zen[2]);
    this.colors.sun.setRGB(sunCol[0], sunCol[1], sunCol[2]).multiplyScalar(Math.min(1.5, sunI * 0.5));
    this.fog.color.copy(this.colors.horizon);
    this.fog.far = vd; this.fog.near = vd * 0.3;

    // the camera: exposure eases toward what this light needs; the grade follows the hour and the weather
    const L = this.look;
    const want = k.exp * lerp(1, 1.22, w.cover * (1 - w.dark)) * lerp(1, 1.5, w.dark) * (1 + ov * 0.25);
    this.exposure += (want - this.exposure) * (dt > 0 ? 1 - Math.exp(-dt * 1.4) : 1);
    if (Math.abs(want - this.exposure) > 1.2 || !(this.exposure > 0)) this.exposure = want;
    L.exposure = this.exposure;
    L.shadows.setRGB(k.shadows[0], k.shadows[1], k.shadows[2]); L.highs.setRGB(k.highs[0], k.highs[1], k.highs[2]);
    L.sat = k.sat * lerp(1, 0.88, w.cover * 0.6 + w.dark * 0.4);
    L.tint.setRGB(1, 1, 1).lerp(new THREE.Color(0.92, 1.03, 0.95), w.dark * 0.5);
    L.bloom = lerp(0.62, 0.42, dayLight) + w.dark * 0.1;
    L.vignette = lerp(0.34, 0.2, dayLight);
    this.renderer.toneMappingExposure = this.exposure;

    // shadow maps and the dome follow the focus
    if (focus) {
      this.shadows.update(focus, lightDir, this.shadowScale || 1);
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
      this.scene.environmentIntensity = lerp(0.6, 0.34, dayLight);
    }
  }
}
