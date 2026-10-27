import * as THREE from 'three';
import { GeoBuilder, rng } from './geo.js';
import { STYLE_ID, STYLE_GRID, qseed } from './facade.js';

// Everything past the edge of the fight: a smoke-hazed afternoon sky, the rest of downtown laid
// out on the city grid (taller toward the Loop, lower out toward the neighbourhoods), the
// skyline's landmarks where they stand from State and Adams, the river and Lake Michigan, and the
// columns of smoke still rising from fires across the city.

// (a high sun a touch east of south: the long north-south streets stay lit between their towers)
export const SKY = {
  sunDir: new THREE.Vector3(0.03, 0.87, 0.49).normalize(),
  zenith: new THREE.Color(0.3, 0.42, 0.6),
  horizon: new THREE.Color(0.88, 0.76, 0.62),
  haze: new THREE.Color(0.72, 0.65, 0.57),
  smoke: new THREE.Color(0.3, 0.27, 0.25),
};

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir, uZenith, uHorizon, uHaze, uSmoke;
  uniform float uTime, uSunDisc;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.02 + vec2(3.1, 7.7); a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float sd = max(dot(d, uSunDir), 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
    // the sun's glow spreads wide through the smoke
    col += vec3(1.0, 0.62, 0.32) * pow(sd, 4.0) * 0.32 + vec3(1.0, 0.78, 0.5) * pow(sd, 32.0) * 0.55;
    col = mix(col, uHaze, smoothstep(0.03, -0.04, h));
    // smoke decks: a high thin layer and a low heavy one, drifting north-east
    if (h > -0.03) {
      vec2 p = d.xz / (h + 0.1);
      vec2 w = vec2(uTime * 0.0035, -uTime * 0.002);
      float hi = fbm(p * 0.35 + w * 0.6 + 4.0);
      float lo = fbm(p * 0.9 + w + vec2(hi * 0.8, 0.0));
      float lo2 = fbm(p * 0.9 + w + vec2(hi * 0.8, 0.0) + uSunDir.xz * 0.06);
      float covHi = smoothstep(0.5, 0.85, hi) * 0.45;
      // the low smoke gathers toward the horizon (and to the north-east, downwind of the fires)
      float bias = 0.12 * dot(normalize(d.xz + 1e-4), normalize(vec2(0.8, -0.6)));
      float covLo = smoothstep(0.42 - bias, 0.72 - bias, lo) * smoothstep(-0.03, 0.06, h) * (1.0 - smoothstep(0.35, 0.95, h) * 0.6);
      float shade = smoothstep(-0.06, 0.08, lo - lo2);
      vec3 lit = uSmoke * 1.9 + vec3(0.5, 0.26, 0.1) * pow(sd, 2.0);
      vec3 dark = uSmoke * 0.7;
      vec3 sc = mix(dark, lit, shade);
      col = mix(col, mix(uHorizon, uSmoke * 1.4, 0.5), covHi);
      col = mix(col, sc, covLo * 0.92);
      // haze swallows the low decks at the horizon
      col = mix(col, uHaze, smoothstep(0.08, 0.0, h) * 0.6);
    }
    col += vec3(1.0, 0.88, 0.7) * smoothstep(0.9993, 0.99965, sd) * 5.0 * uSunDisc;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeSky(scale = 2500) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uSunDir: { value: SKY.sunDir.clone() }, uTime: { value: 0 }, uSunDisc: { value: 1 },
      uZenith: { value: SKY.zenith }, uHorizon: { value: SKY.horizon }, uHaze: { value: SKY.haze }, uSmoke: { value: SKY.smoke },
    },
  }));
  m.scale.setScalar(scale);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------- the rest of downtown
const RIVER_N = [-640, -600], RIVER_W = [-560, -520], LAKE_X = 1150;
// the map and its backdrop block: nothing generated inside this
const CORE = { x0: -180, x1: 190, z0: -130, z1: 175 };

/** a plain tower with the facade shader: walls, roof, an optional broken top */
function tower(gb, x0, z0, x1, z1, h, style, seed, dmg, { broken = 0, crown = null } = {}) {
  const [FH, BW] = STYLE_GRID[style];
  gb.curFac = [STYLE_ID[style] + dmg * 0.9, qseed(seed), FH, BW];
  const walls = [[x1, z0, x0, z0, [0, 0, -1]], [x0, z0, x0, z1, [-1, 0, 0]], [x0, z1, x1, z1, [0, 0, 1]], [x1, z1, x1, z0, [1, 0, 0]]];
  let u = 0;
  for (const [ax, az, bx, bz, n] of walls) {
    const L = Math.hypot(bx - ax, bz - az);
    if (!broken) gb.face(n, [ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], [u, 0], [u + L, 0], [u + L, h], [u, h]);
    else {
      // a ragged broken top in a few steps
      const k = 4;
      for (let i = 0; i < k; i++) {
        const t0 = i / k, t1 = (i + 1) / k, hh = h - broken * (0.5 + 0.5 * Math.sin(seed * 40 + i * 2.3 + ax));
        gb.face(n, [ax + (bx - ax) * t0, 0, az + (bz - az) * t0], [ax + (bx - ax) * t1, 0, az + (bz - az) * t1], [ax + (bx - ax) * t1, hh, az + (bz - az) * t1], [ax + (bx - ax) * t0, hh, az + (bz - az) * t0], [u + L * t0, 0], [u + L * t1, 0], [u + L * t1, hh], [u + L * t0, hh]);
      }
    }
    u += L;
  }
  gb.cap([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], broken ? h - broken : h);
  if (crown === 'antenna') { gb.curFac = [STYLE_ID.bare, qseed(seed), 3, 3]; gb.cyl((x0 + x1) / 2, (z0 + z1) / 2, 0.9, 0.4, h, h + 40, 6, false); }
}

/** the skyline beyond the map, merged into one facade-shaded geometry */
export function buildSkyline() {
  const gb = new GeoBuilder({ fac: true });
  const R = rng(1871);
  const styles = ['glass', 'black', 'stone', 'brick', 'terracotta', 'concrete', 'deco'];
  const inRiver = (x0, z0, x1, z1) => (z1 > RIVER_N[0] && z0 < RIVER_N[1] && x1 > RIVER_W[0]) || (x1 > RIVER_W[0] && x0 < RIVER_W[1] && z0 < RIVER_N[1] + 40);
  const LANDMARK = [[-470, -20, 90], [160, -690, 80], [560, -520, 80], [40, -665, 60], [480, -420, 70], [420, -1500, 90], [-380, 120, 60]];
  const nearLandmark = (x, z) => LANDMARK.some(([lx, lz, r]) => Math.abs(x - lx) < r && Math.abs(z - lz) < r);
  for (let bi = -12; bi <= 12; bi++) for (let bj = -16; bj <= 12; bj++) {
    const bx0 = bi * 100 + 10, bz0 = bj * 100 + 10, bx1 = bx0 + 80, bz1 = bz0 + 80;
    if (bx1 > CORE.x0 && bx0 < CORE.x1 && bz1 > CORE.z0 && bz0 < CORE.z1) continue;
    if (bx0 > LAKE_X - 450) continue; // Grant Park and the lake
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, r = Math.hypot(cx, cz);
    if (r > 1500) continue;
    const loop = Math.max(0, 1 - Math.hypot(cx / 900, cz / 700));
    // two-by-two lots, some merged into one tower
    const lots = R() < 0.35 ? [[bx0, bz0, bx1, bz1]] : [[bx0, bz0, cx - 2, cz - 2], [cx + 2, bz0, bx1, cz - 2], [bx0, cz + 2, cx - 2, bz1], [cx + 2, cz + 2, bx1, bz1]];
    for (const [x0, z0, x1, z1] of lots) {
      if (inRiver(x0, z0, x1, z1) || nearLandmark((x0 + x1) / 2, (z0 + z1) / 2) || R() < 0.08) continue;
      const h = Math.max(12, (18 + R() * 50) * (0.5 + loop * 1.2) + (R() < 0.18 * loop ? 80 + R() * 140 : 0));
      const st = styles[Math.floor(R() * styles.length)];
      const ins = 1 + R() * 3;
      const broken = r < 650 && R() < 0.22 ? 6 + R() * 18 : 0;
      tower(gb, x0 + ins, z0 + ins, x1 - ins, z1 - ins, h, st, R(), broken ? 0.5 : 0.1 + R() * 0.15, { broken, crown: h > 150 && R() < 0.5 ? 'antenna' : null });
      if (h > 70 && R() < 0.5) { // a setback tower on top
        const i2 = (x1 - x0) * 0.2;
        tower(gb, x0 + ins + i2, z0 + ins + i2, x1 - ins - i2, z1 - ins - i2, h + 15 + R() * 40, st, R(), 0.12);
      }
    }
  }
  landmarks(gb);
  return gb.build();
}

function landmarks(gb) {
  // Willis Tower: nine bundled tubes, black, two antennas
  {
    const x0 = -470 - 34.5, z0 = -20 - 34.5, T = 23, fl = 4.07;
    const floors = [[66, 90, 50], [108, 108, 90], [50, 90, 66]];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tower(gb, x0 + i * T, z0 + j * T, x0 + (i + 1) * T, z0 + (j + 1) * T, floors[j][i] * fl, 'black', 0.12 + i * 0.1 + j * 0.03, 0.05);
    gb.curFac = [STYLE_ID.bare, qseed(0.5), 3, 3];
    for (const i of [0, 1]) gb.cyl(x0 + T * (0.6 + i * 1.6), z0 + T * 1.5, 1.4, 0.7, 108 * fl, 108 * fl + 85, 8, false);
  }
  // Trump Tower: a silvery slab stepping back, then the spire
  {
    const cx = 160, cz = -690;
    const steps = [[0, 90, 36, 22], [90, 205, 31, 20], [205, 285, 26, 17], [285, 360, 20, 14]];
    for (const [y0, y1, hx, hz] of steps) towerBand(gb, cx - hx, cz - hz, cx + hx, cz + hz, y0, y1, 'glass', 0.77);
    gb.curFac = [STYLE_ID.bare, qseed(0.4), 3, 3];
    gb.cyl(cx, cz, 2.2, 0.4, 360, 423, 8, false);
  }
  // Aon Center: a plain white square shaft
  tower(gb, 560 - 29, -520 - 29, 560 + 29, -520 + 29, 346, 'stone', 0.91, 0.04);
  // Two Prudential: a stepped pyramid crown with a spire
  {
    const cx = 480, cz = -420;
    towerBand(gb, cx - 22, cz - 22, cx + 22, cz + 22, 0, 240, 'stone', 0.33);
    for (let k = 0; k < 4; k++) towerBand(gb, cx - 20 + k * 5, cz - 20 + k * 5, cx + 20 - k * 5, cz + 20 - k * 5, 240 + k * 11, 251 + k * 11, 'stone', 0.33);
    gb.curFac = [STYLE_ID.bare, qseed(0.4), 3, 3];
    gb.cyl(cx, cz, 1.2, 0.3, 284, 303, 6, false);
  }
  // John Hancock Center: tapering black shaft, two antennas
  {
    const cx = 420, cz = -1500, H = 344, N = 12;
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N, hx0 = 40 - 15 * t0, hz0 = 25 - 9 * t0;
      towerBand(gb, cx - hx0, cz - hz0, cx + hx0, cz + hz0, H * t0, H * t1, 'black', 0.55, 40 - 15 * t1, 25 - 9 * t1);
    }
    gb.curFac = [STYLE_ID.bare, qseed(0.5), 3, 3];
    for (const dx of [-6, 6]) gb.cyl(cx + dx, cz, 1.2, 0.5, H, H + 110, 6, false);
  }
  // Marina City: the two corncobs
  for (const dx of [-22, 22]) {
    gb.curFac = [STYLE_ID.concrete + 0.1 * 0.9, qseed(0.62), 2.9, 2.6];
    gb.cyl(40 + dx, -665, 16, 16, 0, 179, 24, true);
  }
  // 311 South Wacker: a shaft with its cylindrical crown
  {
    const cx = -380, cz = 120;
    towerBand(gb, cx - 24, cz - 24, cx + 24, cz + 24, 0, 230, 'terracotta', 0.21);
    towerBand(gb, cx - 18, cz - 18, cx + 18, cz + 18, 230, 262, 'terracotta', 0.21);
    gb.curFac = [STYLE_ID.glass, qseed(0.4), 3.9, 1.55];
    gb.cyl(cx, cz, 13, 13, 262, 293, 16, true);
  }
}

/** four walls from y0 to y1 (optionally tapering to half sizes thx, thz at the top) and a lid */
function towerBand(gb, x0, z0, x1, z1, y0, y1, style, seed, thx = null, thz = null) {
  const [FH, BW] = STYLE_GRID[style];
  gb.curFac = [STYLE_ID[style] + 0.05 * 0.9, qseed(seed), FH, BW];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const tx0 = thx === null ? x0 : cx - thx, tx1 = thx === null ? x1 : cx + thx, tz0 = thz === null ? z0 : cz - thz, tz1 = thz === null ? z1 : cz + thz;
  const B = [[x1, z0], [x0, z0], [x0, z1], [x1, z1]], Tt = [[tx1, tz0], [tx0, tz0], [tx0, tz1], [tx1, tz1]];
  let u = 0;
  for (let i = 0; i < 4; i++) {
    const a = B[i], b = B[(i + 1) % 4], ta = Tt[i], tb = Tt[(i + 1) % 4];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [(b[1] - a[1]), 0, -(b[0] - a[0])];
    gb.face([-n[0], 0, -n[2]], [a[0], y0, a[1]], [b[0], y0, b[1]], [tb[0], y1, tb[1]], [ta[0], y1, ta[1]], [u, y0], [u + L, y0], [u + L, y1], [u, y1]);
    u += L;
  }
  gb.cap([[tx0, tz0], [tx1, tz0], [tx1, tz1], [tx0, tz1]], y1);
}

/** the river and the lake: dark water with a soft sky reflection */
export function makeWater() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x23323a, roughness: 0.18, metalness: 0.15 });
  const g = new THREE.Group();
  const quad = (x0, z0, x1, z1) => {
    const pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0); pg.rotateX(-Math.PI / 2); pg.translate((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    const m = new THREE.Mesh(pg, mat); m.receiveShadow = false; g.add(m);
  };
  quad(RIVER_W[0], RIVER_N[0], LAKE_X, RIVER_N[1]);
  quad(RIVER_W[0], RIVER_N[1], RIVER_W[1], 1600);
  quad(LAKE_X, -3000, 4000, 3000);
  return g;
}

// ---------------------------------------------------------------- smoke columns
const SMOKE_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vWP;
  uniform float uLean;
  void main() {
    vUv = uv;
    // a vertical billboard: turns about its own axis to face the camera, leaning downwind with height
    vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCam = cameraPosition - base; toCam.y = 0.0; toCam = normalize(toCam);
    vec3 side = vec3(toCam.z, 0.0, -toCam.x);
    float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
    float y = position.y * sy;
    float widen = 0.35 + 0.65 * smoothstep(0.0, 0.7, uv.y);
    vec3 wp = base + side * position.x * sx * widen + vec3(0.0, y, 0.0) + vec3(0.8, 0.0, -0.6) * uLean * y * y / (sy + 1.0);
    vWP = wp;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const SMOKE_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vWP;
  uniform float uTime, uSeed, uFogD; uniform vec3 uSunDir, uDark, uLit, uFog;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.1 + 1.3; a *= 0.5; } return s; }
  void main() {
    vec2 q = vec2(vUv.x - 0.5, vUv.y);
    float t = uTime * 0.025;
    float n = fbm(vec2(q.x * 3.0 + uSeed, q.y * 4.0 - t * 4.0)) ;
    float n2 = fbm(vec2(q.x * 7.0 - uSeed, q.y * 9.0 - t * 7.0));
    float w = 0.16 + 0.28 * smoothstep(0.0, 0.8, q.y);
    float body = 1.0 - smoothstep(w * (0.55 + 0.6 * n), w * (1.0 + 0.5 * n), abs(q.x + (n - 0.5) * 0.15));
    float a = body * smoothstep(0.0, 0.05, q.y) * (1.0 - smoothstep(0.6, 1.0, q.y)) * (0.55 + 0.45 * n2);
    // the side toward the sun catches warm light; the base glows from the fire under it
    float litK = clamp(0.5 + q.x * 1.6 * sign(uSunDir.x + 0.001) + (n2 - 0.5) * 0.6, 0.0, 1.0);
    vec3 col = mix(uDark, uLit, litK * 0.7) + vec3(1.2, 0.45, 0.12) * smoothstep(0.12, 0.0, q.y) * 0.9;
    float d = length(vWP - cameraPosition);
    float fog = 1.0 - exp(-pow(d * uFogD, 2.0));
    col = mix(col, uFog, fog * 0.85);
    gl_FragColor = vec4(col * a * 0.9, a * 0.9);
  }
`;
/** tall leaning smoke columns at distant fires: [x, z, width, height] */
export function makeSmokeColumns(list, fogDensity) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1, 1, 16); geo.translate(0, 0.5, 0);
  list.forEach(([x, z, w, h], i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: i * 3.7 }, uLean: { value: 0.35 + (i % 3) * 0.1 }, uFogD: { value: fogDensity },
        uSunDir: { value: SKY.sunDir }, uDark: { value: new THREE.Color(0.1, 0.09, 0.085) }, uLit: { value: new THREE.Color(0.42, 0.36, 0.3) }, uFog: { value: SKY.haze },
      },
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z); m.scale.set(w, h, 1);
    m.frustumCulled = false; m.renderOrder = 5;
    g.add(m);
  });
  return g;
}
