// The atmosphere of the moon the game is set on: single scattering through Rayleigh, Mie and
// an ozone-like absorber, done the way modern engines do it (Hillaire 2020): a transmittance
// lookup table built once, and a sky-view table rebuilt every few frames for the current sun
// and giant-planet positions. Everything that needs "the colour of the sky in that direction"
// (the sky itself, fog on the terrain, cloud lighting) reads the same table, so it all agrees.

import * as THREE from 'three';

// Units: kilometres. Tuned a little away from Earth's: a paler, more turquoise day sky, a
// hazier horizon, and an absorber that pushes twilight toward magenta.
export const ATMO = {
  Rg: 6360,
  Rt: 6420,
  betaR: new THREE.Vector3(4.6e-3, 13.2e-3, 27.5e-3),
  HR: 8.0,
  betaM: 26e-3,
  HM: 1.3,
  mieG: 0.78,
  betaO: new THREE.Vector3(1.4e-3, 2.6e-3, 0.18e-3),
  // the observer's altitude above the ground, km
  viewH: 0.25,
};

export const GLSL_ATMO = /* glsl */ `
const float PI_A = 3.14159265359;
uniform float uRg;
uniform float uRt;
uniform vec3 uBetaR;
uniform float uHR;
uniform float uBetaM;
uniform float uHM;
uniform float uMieG;
uniform vec3 uBetaO;

// distance along a ray from radius r with zenith cosine mu to the sphere of radius R (outside hit)
float raySphere(float r, float mu, float R) {
  float d = r * r * (mu * mu - 1.0) + R * R;
  return d < 0.0 ? -1.0 : -r * mu + sqrt(d);
}
// does the ray from (r, mu) hit the ground?
bool hitsGround(float r, float mu) {
  return mu < 0.0 && r * r * (mu * mu - 1.0) + uRg * uRg >= 0.0;
}
vec3 extinctionAt(float h) {
  float dR = exp(-h / uHR);
  float dM = exp(-h / uHM);
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  return uBetaR * dR + vec3(uBetaM * 1.11) * dM + uBetaO * dO;
}
float phaseR(float mu) { return 3.0 / (16.0 * PI_A) * (1.0 + mu * mu); }
float phaseM(float mu, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI_A) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * mu), 1.5));
}
// transmittance table coordinates
vec2 transUV(float r, float mu) {
  float h = clamp((r - uRg) / (uRt - uRg), 0.0, 1.0);
  float u = 0.5 + 0.5 * sign(mu) * sqrt(abs(mu));
  return vec2(u, sqrt(h));
}
void transFromUV(vec2 uv, out float r, out float mu) {
  float h = uv.y * uv.y;
  r = uRg + h * (uRt - uRg);
  float s = uv.x * 2.0 - 1.0;
  mu = sign(s) * s * s;
}
`;

const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Transmittance from a point (r, mu) to the top of the atmosphere (zero if the ray hits the ground).
const TRANS_FS = /* glsl */ `
${GLSL_ATMO}
varying vec2 vUv;
void main() {
  float r, mu;
  transFromUV(vUv, r, mu);
  if (hitsGround(r, mu)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float L = raySphere(r, mu, uRt);
  const int N = 48;
  float dt = L / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) * dt;
    float ri = sqrt(r * r + t * t + 2.0 * r * mu * t);
    od += extinctionAt(ri - uRg) * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}
`;

// The sky as seen from the observer: in-scattered light for every direction, from the sun
// and from the giant planet's reflected light, plus the night airglow.
const VIEW_FS = /* glsl */ `
${GLSL_ATMO}
uniform sampler2D uTrans;
uniform vec3 uSunDir;
uniform vec3 uSunE;
uniform vec3 uPlanetDir;
uniform vec3 uPlanetE;
uniform float uViewH;
uniform vec3 uAirglow;
varying vec2 vUv;

vec3 trans(float r, float mu) { return texture2D(uTrans, transUV(r, mu)).rgb; }

void main() {
  // the table: azimuth across, elevation up with more rows near the horizon
  float az = (vUv.x - 0.5) * 2.0 * PI_A;
  float s = vUv.y * 2.0 - 1.0;
  float el = sign(s) * s * s * 0.5 * PI_A;
  vec3 dir = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  float r = uRg + uViewH;
  float mu = dir.y;
  bool ground = hitsGround(r, mu);
  float L = ground ? raySphere(r, mu, uRg) : raySphere(r, mu, uRt);
  if (ground) L = -r * mu - sqrt(max(0.0, r * r * (mu * mu - 1.0) + uRg * uRg));
  L = min(L, 900.0);
  const int N = 28;
  // samples crowd toward the observer, where the air is dense
  vec3 sumS = vec3(0.0), sumP = vec3(0.0), od = vec3(0.0);
  float cosS = dot(dir, uSunDir), cosP = dot(dir, uPlanetDir);
  float prR = phaseR(cosS), prM = phaseM(cosS, uMieG);
  float ppR = phaseR(cosP), ppM = phaseM(cosP, 0.6);
  float tPrev = 0.0;
  vec3 airglow = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 0.5) / float(N);
    float t = L * f * f;
    float dt = L * (2.0 * f) / float(N);
    vec3 p = vec3(0.0, r, 0.0) + dir * t;
    float ri = length(p);
    float h = ri - uRg;
    vec3 up = p / ri;
    float dR = exp(-h / uHR), dM = exp(-h / uHM);
    vec3 ext = extinctionAt(h);
    vec3 Tv = exp(-(od + ext * dt * 0.5));
    // sunlight reaching this sample
    float muS = dot(up, uSunDir);
    vec3 Ts = trans(ri, muS);
    vec3 scat = uBetaR * dR * prR + vec3(uBetaM) * dM * prM;
    sumS += Tv * Ts * scat * dt;
    // the giant planet's light
    float muP = dot(up, uPlanetDir);
    vec3 Tp = trans(ri, muP);
    vec3 scatP = uBetaR * dR * ppR + vec3(uBetaM) * dM * ppM * 0.25;
    sumP += Tv * Tp * scatP * dt;
    // a cheap stand-in for multiple scattering: some light from everywhere
    sumS += Tv * (uBetaR * dR + vec3(uBetaM) * dM) * dt * 0.16 * smoothstep(-0.1, 0.3, uSunDir.y) * Ts;
    // airglow: an emitting layer ~90 km up
    airglow += Tv * exp(-pow((h - 30.0) / 8.0, 2.0)) * dt;
    od += ext * dt;
    tPrev = t;
  }
  vec3 col = sumS * uSunE + sumP * uPlanetE + airglow * uAirglow;
  if (ground) col *= 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Atmosphere {
  constructor(renderer) {
    this.renderer = renderer;
    this.uniforms = {
      uRg: { value: ATMO.Rg },
      uRt: { value: ATMO.Rt },
      uBetaR: { value: ATMO.betaR.clone() },
      uHR: { value: ATMO.HR },
      uBetaM: { value: ATMO.betaM },
      uHM: { value: ATMO.HM },
      uMieG: { value: ATMO.mieG },
      uBetaO: { value: ATMO.betaO.clone() },
    };
    const half = THREE.HalfFloatType;
    this.transRT = new THREE.WebGLRenderTarget(256, 64, { type: half, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.viewRT = new THREE.WebGLRenderTarget(256, 128, { type: half, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.viewRT.texture.wrapS = THREE.RepeatWrapping;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.transMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: TRANS_FS, depthTest: false, depthWrite: false });
    this.viewUniforms = {
      ...this.uniforms,
      uTrans: { value: this.transRT.texture },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunE: { value: new THREE.Vector3(20, 20, 20) },
      uPlanetDir: { value: new THREE.Vector3(0, 0.4, 1).normalize() },
      uPlanetE: { value: new THREE.Vector3(0, 0, 0) },
      uViewH: { value: ATMO.viewH },
      uAirglow: { value: new THREE.Vector3(0, 0, 0) },
    };
    this.viewMat = new THREE.ShaderMaterial({ uniforms: this.viewUniforms, vertexShader: VS, fragmentShader: VIEW_FS, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(tri, this.transMat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.renderTransmittance();
  }

  renderTransmittance() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = this.transMat;
    r.setRenderTarget(this.transRT);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
  }

  renderView(sunDir, sunE, planetDir, planetE, airglow) {
    const u = this.viewUniforms;
    u.uSunDir.value.copy(sunDir);
    u.uSunE.value.copy(sunE);
    u.uPlanetDir.value.copy(planetDir);
    u.uPlanetE.value.copy(planetE);
    u.uAirglow.value.copy(airglow);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.quad.material = this.viewMat;
    r.setRenderTarget(this.viewRT);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
  }
}

// ---- the same model on the CPU, for the colour of sunlight and the sky's ambient light -------

const tmpE = [0, 0, 0];
function extinction(h, out) {
  const dR = Math.exp(-h / ATMO.HR), dM = Math.exp(-h / ATMO.HM);
  const dO = Math.max(0, 1 - Math.abs(h - 25) / 15);
  out[0] = ATMO.betaR.x * dR + ATMO.betaM * 1.11 * dM + ATMO.betaO.x * dO;
  out[1] = ATMO.betaR.y * dR + ATMO.betaM * 1.11 * dM + ATMO.betaO.y * dO;
  out[2] = ATMO.betaR.z * dR + ATMO.betaM * 1.11 * dM + ATMO.betaO.z * dO;
  return out;
}

// Transmittance from altitude h (km) along a direction with zenith cosine mu, to space.
export function transmittance(h, mu, out = [0, 0, 0]) {
  const r = ATMO.Rg + h;
  const disc = r * r * (mu * mu - 1) + ATMO.Rg * ATMO.Rg;
  if (mu < 0 && disc >= 0) { out[0] = out[1] = out[2] = 0; return out; }
  const d = r * r * (mu * mu - 1) + ATMO.Rt * ATMO.Rt;
  const L = -r * mu + Math.sqrt(Math.max(0, d));
  const N = 24, dt = L / N;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const ri = Math.sqrt(r * r + t * t + 2 * r * mu * t);
    extinction(ri - ATMO.Rg, tmpE);
    a += tmpE[0] * dt; b += tmpE[1] * dt; c += tmpE[2] * dt;
  }
  out[0] = Math.exp(-a); out[1] = Math.exp(-b); out[2] = Math.exp(-c);
  return out;
}

// Smoothed transmittance near the horizon: the sun's disc is half a degree across, so it
// doesn't switch off in one frame as its centre crosses the horizon.
export function sunTransmittance(mu, out = [0, 0, 0]) {
  const k = 3;
  let a = 0, b = 0, c = 0;
  const t = [0, 0, 0];
  for (let i = 0; i < k; i++) {
    transmittance(ATMO.viewH, mu + (i - 1) * 0.006, t);
    a += t[0]; b += t[1]; c += t[2];
  }
  out[0] = a / k; out[1] = b / k; out[2] = c / k;
  return out;
}
