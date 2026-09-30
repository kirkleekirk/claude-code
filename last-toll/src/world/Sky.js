import * as THREE from 'three';

// The sky, and fog that takes its colour from it.
//
// The dome is drawn by one shader: a gradient from horizon to zenith that warms
// toward the sun, a glow around the sun and moon, cirrus streaks and a cloud deck
// on high planes, a stratus band low on the horizon, and stars with the Milky Way
// after dark. Fog on everything else fades into the same gradient in the direction
// you look, so a distant roofline melts into gold on the sun side and into blue
// on the other.
//
// Sky colours are authored as they should appear on screen: they skip tone mapping.
//
// The gradient's uniforms are shared by every material with fog. They are plain
// objects rather than THREE.Color/Vector3 on purpose: three.js clones those per
// material, and shares plain objects by reference, so writing SKY once a frame
// updates every material at once.

const v3 = () => ({ x: 0, y: 0, z: 0 });
export const SKY = {
  sun: { x: 0, y: 0.1, z: -1 },
  moon: { x: 0.3, y: 0.4, z: 0.8 },
  zen: v3(), hor: v3(), glow: v3(), belt: v3(), sunC: v3(), moonC: v3(),
  // x: sun glow, y: gradient curve, z: sky fog on, w: horizon glow height falloff
  p: { x: 0, y: 0.5, z: 0, w: 5 },
};

export const SKY_PARS = /* glsl */`
uniform vec3 skySun;
uniform vec3 skyMoon;
uniform vec3 skyZen;
uniform vec3 skyHor;
uniform vec3 skyGlow;
uniform vec3 skyBelt;
uniform vec3 skySunC;
uniform vec3 skyMoonC;
uniform vec4 skyP;

// Colour of the clear sky (no clouds, no stars) in direction d, in linear space.
vec3 skyBase(vec3 d) {
  float y = max(d.y, 0.0);
  vec2 dh = d.xz / max(length(d.xz), 1e-4);
  vec2 sh = skySun.xz / max(length(skySun.xz), 1e-4);
  float az = dot(dh, sh) * 0.5 + 0.5;
  float side = az * az * (3.0 - 2.0 * az);
  float g = pow(y, skyP.y);
  vec3 c = mix(skyHor, skyZen, g);
  // the warm band toward the sun hugs the horizon and fades with height
  c = mix(c, skyGlow, side * side * exp(-y * skyP.w));
  // a rosy band opposite the sun (the belt of Venus)
  c += skyBelt * (1.0 - side) * exp(-y * 6.0) * smoothstep(0.0, 0.05, y);
  float mu = max(dot(d, skySun), 0.0);
  c += skySunC * skyP.x * (0.35 * pow(mu, 4.0) + 0.5 * pow(mu, 22.0) + 0.9 * pow(mu, 180.0));
  float mm = max(dot(d, skyMoon), 0.0);
  c += skyMoonC * (0.25 * pow(mm, 6.0) + 0.45 * pow(mm, 60.0));
  return c;
}
`;

// ---- fog ------------------------------------------------------------------------------

let installed = false;

// Patch the fog chunks so fog takes the sky's colour in the direction of each pixel,
// and add the sky uniforms to every built-in material. Must run before anything compiles.
export function installSkyFog() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${SKY_PARS}
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor;
    if ( skyP.z > 0.5 ) {
      float fd = max( vFogDepth - fogNear, 0.0 ) / max( fogFar - fogNear, 1.0 );
      fogFactor = 1.0 - exp( - pow( fd, 1.5 ) * 3.0 );
    } else fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogC = fogColor;
  if ( skyP.z > 0.5 ) {
    vec3 wd = normalize( ( vec4( vFogView, 0.0 ) * viewMatrix ).xyz );
    fogC = linearToOutputTexel( vec4( skyBase( wd ), 1.0 ) ).rgb;
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;
  const add = (u) => {
    u.skySun = { value: SKY.sun };
    u.skyMoon = { value: SKY.moon };
    u.skyZen = { value: SKY.zen };
    u.skyHor = { value: SKY.hor };
    u.skyGlow = { value: SKY.glow };
    u.skyBelt = { value: SKY.belt };
    u.skySunC = { value: SKY.sunC };
    u.skyMoonC = { value: SKY.moonC };
    u.skyP = { value: SKY.p };
  };
  add(THREE.UniformsLib.fog);
  for (const k in THREE.ShaderLib) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) add(u);
  }
}

// Uniforms for a ShaderMaterial that includes the sky functions itself.
export function skyUniforms() {
  const u = {};
  u.skySun = { value: SKY.sun };
  u.skyMoon = { value: SKY.moon };
  u.skyZen = { value: SKY.zen };
  u.skyHor = { value: SKY.hor };
  u.skyGlow = { value: SKY.glow };
  u.skyBelt = { value: SKY.belt };
  u.skySunC = { value: SKY.sunC };
  u.skyMoonC = { value: SKY.moonC };
  u.skyP = { value: SKY.p };
  return u;
}

installSkyFog();

// ---- the dome -------------------------------------------------------------------------

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const DOME_FRAG = /* glsl */`
${SKY_PARS}
uniform float uTime;
uniform vec4 cloudP;   // x cirrus cover, y deck cover, z stratus, w wind angle
uniform vec4 nightP;   // x stars, y milky way, z lightning flash, w seed
uniform vec4 bandP;    // x stratus bottom, y stratus top, z deck darkness, w cirrus brightness
uniform vec3 cLit;     // cloud colour facing the sun
uniform vec3 cAmb;     // cloud colour in shade
uniform vec3 cDark;    // the dark underside of a thick deck
uniform vec3 stratC;   // stratus band
varying vec3 vDir;

float sk_h(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sk_n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sk_h(i), sk_h(i + vec2(1.0, 0.0)), u.x), mix(sk_h(i + vec2(0.0, 1.0)), sk_h(i + vec2(1.0, 1.0)), u.x), u.y);
}
// fbm that drops the octaves too fine for the pixel (fw: size of a pixel in p)
float sk_fbm(vec2 p, float fw) {
  float v = 0.0, a = 0.5, tot = 0.0;
  for (int i = 0; i < 6; i++) {
    float k = 1.0 - smoothstep(0.25, 0.7, fw);
    v += a * k * sk_n(p) + a * (1.0 - k) * 0.5;
    tot += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.31;
    fw *= 2.0;
    a *= 0.5;
  }
  return v / tot;
}
vec2 sk_rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// Wispy cirrus: long bands along the wind with clear sky between; inside a band,
// fine fibres run along it, bending gently, frayed at the edges.
float sk_cirrus(vec2 uv, float fw) {
  vec2 p = sk_rot(uv, cloudP.w) + vec2(uTime * 0.0035, 0.0) + nightP.w;
  float bend = sk_fbm(p * 0.18 + 5.3, fw * 0.18);
  p.y += (bend - 0.5) * 2.5;
  float band = sk_fbm(vec2(p.x * 0.05, p.y * 0.3) + 3.1, fw * 0.3);
  float cov = mix(0.64, 0.42, cloudP.x);
  float mask = smoothstep(cov, cov + 0.16, band);
  vec2 q = vec2(p.x * 0.45, p.y * 5.0);
  q.y += (sk_fbm(p * 0.9 + 1.7, fw * 0.9) - 0.5) * 1.4;
  float fib = sk_fbm(q, fw * 5.0);
  float fine = sk_fbm(vec2(q.x * 2.2, q.y * 3.0) + 9.0, fw * 15.0);
  float fibres = smoothstep(0.3, 0.72, fib * 0.75 + fine * 0.25);
  // thin at the edges of a band: only the strongest fibres reach out there
  return mask * mix(fibres * fibres, 0.3 + 0.7 * fibres, mask);
}

// A lower deck of heavier cloud: soft puffs, thick where the noise is high.
float sk_deck(vec2 uv, float fw) {
  vec2 p = sk_rot(uv, cloudP.w * 0.6 + 0.4) * 1.1 + vec2(uTime * 0.006, 0.0) + nightP.w * 0.7;
  float n = sk_fbm(p * 0.8 + 11.0, fw * 0.8);
  n += (sk_fbm(p * 3.1 - 4.0, fw * 3.1) - 0.5) * 0.25;
  float cov = mix(0.72, 0.28, cloudP.y);
  return smoothstep(cov, cov + 0.3, n);
}

vec3 sk_stars(vec3 d) {
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = sign(d.x) + 1.0; }
  else if (a.y > a.z) { uv = d.xz / a.y; face = sign(d.y) + 5.0; }
  else { uv = d.xy / a.z; face = sign(d.z) + 9.0; }
  vec3 col = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 55.0 : 140.0;
    vec2 g = uv * sc;
    float px = length(fwidth(g));
    vec2 id = floor(g);
    vec2 f = fract(g);
    float h = sk_h(id + face * 131.0 + float(l) * 57.0);
    if (h < (l == 0 ? 0.955 : 0.93)) continue;
    vec2 c = vec2(sk_h(id + 3.7 + face), sk_h(id + 8.1 - face)) * 0.6 + 0.2;
    float dd = length(f - c);
    float size = max(px * 0.6, 0.02);
    float b = pow(sk_h(id + 1.3 + face), 7.0);
    float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 3.0 * h) + h * 60.0);
    float s = exp(-dd * dd / (size * size)) * (l == 0 ? 0.22 + b * 1.6 : 0.08 + b * 0.35) * tw;
    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.7), sk_h(id + 5.5));
    col += tint * s;
  }
  return col;
}

vec3 sk_milky(vec3 d) {
  vec3 n = normalize(vec3(0.34, 0.5, 0.8));
  float bd = dot(d, n);
  float band = exp(-bd * bd * 22.0);
  vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(n, t1);
  vec2 p = vec2(atan(dot(d, t2), dot(d, t1)) * 3.0, bd * 9.0);
  float m = sk_fbm(p * 2.2, 0.0);
  float dust = smoothstep(0.45, 0.8, sk_fbm(p * 3.4 + 5.0, 0.0)) * exp(-pow((bd + 0.03) * 16.0, 2.0));
  float v = band * (0.35 + 0.9 * m * m) * (1.0 - 0.75 * dust);
  return vec3(0.55, 0.6, 0.78) * v * 0.16;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float ya = max(y, 0.0);
  vec3 col = skyBase(d);
  float mu = dot(d, skySun);
  vec2 dh = d.xz / max(length(d.xz), 1e-4);
  vec2 sh = skySun.xz / max(length(skySun.xz), 1e-4);
  float side = smoothstep(0.0, 1.0, dot(dh, sh) * 0.5 + 0.5);

  // night: stars and the Milky Way, faded into the haze near the horizon
  float clear = 1.0;
  vec3 night = vec3(0.0);
  if (nightP.x > 0.001) {
    float hz = smoothstep(0.0, 0.25, ya);
    night = (sk_stars(d) * nightP.x + sk_milky(d) * nightP.y) * hz;
  }

  // the sun's disc, sinking behind the sea
  float disc = smoothstep(0.99990, 0.99994, mu) * smoothstep(-0.006, 0.004, y);
  col += skySunC * disc * 6.0 * skyP.x;

  // the moon: a pale disc with a few dark seas
  float mc = dot(d, skyMoon);
  float mr = 0.0165;
  if (mc > cos(mr * 1.2) && skyMoonC.x + skyMoonC.y > 0.0) {
    vec3 mt1 = normalize(cross(skyMoon, vec3(0.0, 1.0, 0.0)));
    vec3 mt2 = cross(skyMoon, mt1);
    vec2 mp = vec2(dot(d, mt1), dot(d, mt2)) / mr;
    float r = length(mp);
    float disk = 1.0 - smoothstep(0.93, 1.0, r);
    float seas = sk_fbm(mp * 1.6 + 2.0, 0.0);
    float lit = smoothstep(-0.55, 0.2, mp.x + 0.25 * mp.y);
    col += skyMoonC * disk * (2.2 - 0.9 * smoothstep(0.45, 0.7, seas)) * (0.25 + 0.75 * lit);
    clear *= 1.0 - disk;
  }
  col += night * clear;

  // clouds on high planes; parallel streaks meet at the horizon
  vec2 uv = d.xz / (ya + 0.1);
  float fw = length(fwidth(uv));
  float fade = smoothstep(0.0, 0.06, ya);
  float fwdS = pow(max(mu, 0.0), 3.0);
  float low = exp(-ya * 4.0);
  vec3 lit = mix(cAmb, cLit, clamp(0.08 + 0.8 * fwdS + 0.6 * low * side, 0.0, 1.0));
  lit += skyBelt * 1.2 * (1.0 - side) * low;
  lit += skySunC * skyP.x * pow(max(mu, 0.0), 24.0) * 0.8;
  float flash = nightP.z;

  if (cloudP.y > 0.001) {
    float dk = sk_deck(uv * 2.4, fw * 2.4) * fade;
    float thick = smoothstep(0.3, 1.0, dk);
    vec3 dc = mix(lit, cDark, thick * bandP.z);
    dc += skySunC * skyP.x * pow(max(mu, 0.0), 6.0) * (1.0 - thick) * 1.1;
    dc += vec3(0.5, 0.52, 0.62) * flash * (0.4 + thick);
    col = mix(col, dc, dk * 0.95);
  }
  if (cloudP.x > 0.001) {
    float ci = sk_cirrus(uv * 2.6, fw * 2.6) * fade;
    vec3 cc = lit * bandP.w;
    cc += vec3(0.45, 0.47, 0.58) * flash * 0.5;
    col = mix(col, cc, ci * 0.66);
  }

  // stratus band just above the horizon, lit along its underside on the sun's side
  if (cloudP.z > 0.001) {
    float az = atan(d.z, d.x);
    float wob = sk_fbm(vec2(az * 5.0, 1.3), 0.0);
    float lo = bandP.x, hi = bandP.y + (wob - 0.5) * 0.05;
    float sb = smoothstep(lo - 0.004, lo + 0.004, y) * (1.0 - smoothstep(hi - 0.03, hi + 0.01, y));
    float streak = sk_fbm(vec2(az * 24.0, y * 180.0), 0.0);
    sb *= 0.8 + 0.35 * streak;
    vec3 scol = stratC * (0.85 + 0.3 * streak);
    scol += skyGlow * side * side * exp(-(y - lo) / 0.008) * 0.55;
    scol += vec3(0.5, 0.52, 0.62) * flash;
    col = mix(col, scol, clamp(sb, 0.0, 1.0) * cloudP.z);
  }

  // below the horizon: the haze, a little darker
  if (y < 0.0) col = skyBase(vec3(d.x, 0.0, d.z)) * mix(1.0, 0.82, smoothstep(0.0, -0.1, y));
  col += vec3(0.5, 0.52, 0.62) * flash * 0.25;

  // soft shoulder so the sun's glow rolls off instead of clipping
  vec3 k = max(col - 0.8, 0.0);
  col = min(col, vec3(0.8)) + 0.2 * (1.0 - exp(-k * 5.0));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  gl_FragColor.rgb += (sk_h(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
}`;

export function createSkyDome(radius = 420) {
  const uniforms = {
    ...skyUniforms(),
    uTime: { value: 0 },
    cloudP: { value: new THREE.Vector4(0.5, 0, 0.5, 0.6) },
    nightP: { value: new THREE.Vector4(0, 0, 0, 0) },
    bandP: { value: new THREE.Vector4(0.012, 0.075, 0.6, 1) },
    cLit: { value: new THREE.Color(1, 1, 1) },
    cAmb: { value: new THREE.Color(0.7, 0.75, 0.85) },
    cDark: { value: new THREE.Color(0.3, 0.32, 0.38) },
    stratC: { value: new THREE.Color(0.4, 0.42, 0.5) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
