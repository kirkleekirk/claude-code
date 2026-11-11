// Planet definitions: world layout, sky, and the surface shading recipe.

const VEYRA_SURFACE = /* glsl */`
void planetSurface(vec3 wp, vec3 N, float curv, vec4 sp, vec4 nA, vec4 nB, vec4 nC, out vec3 albedo, out vec3 emissive, out float gloss){
  float wC = sp.r, wE = sp.g, wM = sp.b;
  float wB = max(1.0 - wC - wE - wM, 0.0);
  float slope = 1.0 - N.y;
  float h = wp.y;
  float rockAmt = smoothstep(0.2, 0.46, slope + (nB.r - 0.5) * 0.18);
  float patchy = smoothstep(0.3, 0.74, nA.g * 0.55 + nB.r * 0.3 + nC.g * 0.15);
  float grit = 0.78 + 0.44 * nC.r;

  // Lumen Basin: wine-dark soil under teal moss
  vec3 soil = mix(vec3(0.125, 0.066, 0.092), vec3(0.085, 0.056, 0.108), nA.r);
  vec3 moss = mix(vec3(0.03, 0.105, 0.105), vec3(0.05, 0.165, 0.12), nB.g);
  vec3 basin = mix(soil, moss, patchy * 0.8) * grit;
  basin = mix(basin, vec3(0.14, 0.095, 0.13) * grit, rockAmt);

  // Crystal Reach: indigo ground laced with glowing mineral veins
  vec3 cg = mix(vec3(0.065, 0.04, 0.15), vec3(0.035, 0.105, 0.17), smoothstep(0.35, 0.7, nA.g)) * grit;
  vec3 crock = vec3(0.105, 0.075, 0.2) * grit;
  vec3 crys = mix(cg, crock, rockAmt);
  vec4 nV = texture2D(uNoise, wp.xz * 0.023 + 0.5 + (nB.rg - 0.5) * 0.07 + (nA.gr - 0.5) * 0.12);
  float vein = (1.0 - smoothstep(0.0, 0.035 + 0.03 * nB.g, nV.a)) * smoothstep(0.42, 0.66, nA.r) * smoothstep(0.3, 0.55, nB.r);
  float pulse = 0.65 + 0.35 * sin(uTime * 1.2 + wp.x * 0.05 + wp.z * 0.04);
  emissive = vec3(0.05, 0.8, 0.78) * vein * wC * pulse * 1.0;

  // Ember Mesa: banded sandstone over rippled dunes
  float s = h * 0.46 + (nA.r - 0.5) * 5.0 + (nB.r - 0.5) * 1.6 + (nC.g - 0.5) * 0.5;
  vec3 st = mix(vec3(0.36, 0.14, 0.085), vec3(0.52, 0.27, 0.15), sin(s) * 0.5 + 0.5);
  st = mix(st, vec3(0.45, 0.2, 0.11), sin(s * 3.7 + 2.0) * 0.5 + 0.5);
  st = mix(st, vec3(0.6, 0.45, 0.32), smoothstep(0.8, 0.98, sin(s * 1.9 + 1.0) * 0.5 + 0.5) * 0.85);
  st = mix(st, vec3(0.19, 0.075, 0.06), smoothstep(0.8, 1.0, sin(s * 0.63 + 4.0) * 0.5 + 0.5));
  vec3 sand = mix(vec3(0.56, 0.30, 0.15), vec3(0.66, 0.40, 0.21), nB.g);
  float ripple = sin((wp.x * 0.8 + wp.z * 0.5) * 2.2 + nB.r * 9.0) * 0.5 + 0.5;
  sand *= 0.9 + 0.1 * ripple;
  float mrock = smoothstep(0.1, 0.3, slope);
  float ledge = sin(s * 3.7 + 2.0);
  st *= 0.86 + 0.14 * ledge;
  vec3 mesa = mix(sand, st * grit, mrock);
  gLedge = ledge * wE * mrock;

  // The Spine: blue slate, pale mineral frost on the high shelves
  float ms = h * 0.11 + (nA.g - 0.5) * 4.0;
  float mled = sin(ms * 6.0 + nB.r * 3.0);
  vec3 mrk = mix(vec3(0.085, 0.10, 0.165), vec3(0.19, 0.21, 0.29), sin(ms) * 0.5 + 0.5) * grit * (0.88 + 0.12 * mled);
  vec3 mground = mix(vec3(0.09, 0.12, 0.18), vec3(0.04, 0.17, 0.19), patchy) * grit;
  float mamt = smoothstep(0.16, 0.4, slope);
  vec3 mount = mix(mground, mrk, mamt);
  gLedge += mled * wM * mamt * 0.7;
  float frost = smoothstep(150.0, 205.0, h + (nA.r - 0.5) * 60.0) * smoothstep(0.5, 0.2, slope);
  mount = mix(mount, vec3(0.62, 0.74, 0.86), frost * 0.85);

  albedo = basin * wB + crys * wC + mesa * wE + mount * wM;
  float shore = smoothstep(2.8, 0.7, h + (nB.r - 0.5) * 1.2);
  vec3 beach = mix(vec3(0.42, 0.25, 0.25), vec3(0.13, 0.10, 0.22), wC);
  beach = mix(beach, vec3(0.6, 0.38, 0.22), wE);
  beach = mix(beach, vec3(0.22, 0.25, 0.32), wM);
  albedo = mix(albedo, beach * grit, shore * (1.0 - rockAmt * 0.7));
  float wet = smoothstep(0.9, -0.3, h);
  albedo *= mix(1.0, 0.5, wet);
  gloss = wet * 0.8 + frost * 0.3;
  albedo = mix(albedo, albedo * 1.2 + vec3(0.03, 0.025, 0.035), sp.a * 0.55);
  albedo *= 0.8 + 0.4 * curv;
}`;

const KORR_SURFACE = /* glsl */`
void planetSurface(vec3 wp, vec3 N, float curv, vec4 sp, vec4 nA, vec4 nB, vec4 nC, out vec3 albedo, out vec3 emissive, out float gloss){
  float ore = sp.r, rim = sp.g, hi = sp.b;
  float slope = 1.0 - N.y;
  float h = wp.y;
  vec3 dust = mix(vec3(0.15, 0.085, 0.06), vec3(0.22, 0.14, 0.095), nA.r) * (0.75 + 0.5 * nC.g);
  vec3 basalt = mix(vec3(0.05, 0.05, 0.062), vec3(0.11, 0.105, 0.12), nB.g) * (0.7 + 0.6 * nC.r);
  float rockAmt = smoothstep(0.14, 0.36, slope + (nB.r - 0.5) * 0.2);
  albedo = mix(dust, basalt, max(rockAmt, hi * 0.6));
  float sband = sin(h * 0.23 + nA.g * 5.0) * 0.5 + 0.5;
  albedo = mix(albedo, vec3(0.22, 0.12, 0.08), sband * rockAmt * 0.45);
  albedo = mix(albedo, vec3(0.3, 0.27, 0.25), rim * 0.5);
  gLedge = sin(h * 1.4 + nA.g * 9.0) * rockAmt * 0.6;
  vec4 nV = texture2D(uNoise, wp.xz * 0.019 + 0.3 + (nB.rg - 0.5) * 0.08 + (nA.gr - 0.5) * 0.14);
  float vein = (1.0 - smoothstep(0.0, 0.03 + 0.025 * nB.g, nV.a)) * smoothstep(0.25, 0.8, ore) * smoothstep(0.35, 0.6, nB.r);
  albedo = mix(albedo, vec3(0.10, 0.22, 0.42), vein * 0.8);
  emissive = vec3(0.12, 0.45, 1.0) * vein * (0.5 + 0.3 * sin(uTime * 0.9 + wp.x * 0.07)) * 0.9;
  float heat = smoothstep(4.5, -1.0, h + (nB.r - 0.5) * 2.0);
  albedo = mix(albedo, vec3(0.03, 0.02, 0.02), heat * 0.8);
  float crack = (1.0 - smoothstep(0.0, 0.12, nV.a)) * heat;
  emissive += vec3(1.0, 0.32, 0.05) * (crack * 1.6 + heat * heat * 0.25);
  gloss = ore * 0.5 + 0.1;
  albedo = mix(albedo, albedo * 1.25 + vec3(0.03), sp.a * 0.5);
  albedo *= 0.8 + 0.4 * curv;
}`;

export const VEYRA = {
  id: 'veyra', kind: 'veyra', name: 'Veyra', subtitle: 'Third moon of Ossa',
  seed: 4127, N: 769, cell: 2, half: 768, sea: 0, gravity: 19, hasWater: true, breathable: false,
  pois: {
    landing: { x: 0, z: 190, r: 46, flat: 9.5, mark: 0.6 },
    vaultEchoes: { x: -452, z: 96, r: 34, flat: 15, mark: 0.8 },
    vaultEmbers: { x: 468, z: 44, r: 34, flat: 9, mark: 0.8 },
    vaultTides: { x: -628, z: -300, r: 30, flat: 44, stack: true },
    spire: { x: 30, z: -470, r: 72, flat: 126, mark: 1 },
  },
  paths: [
    { inner: 11, outer: 44, pts: [[2, -120, 10], [-30, -230, 38], [40, -330, 86], [30, -400, 122], [30, -430, 126]] },
    { inner: 12, outer: 52, pts: [[150, 170, 9], [290, 130, 8], [400, 70, 8.5], [468, 44, 9]] },
    { inner: 9, outer: 34, pts: [[-150, 160, 10], [-300, 130, 13], [-452, 96, 15]] },
  ],
  water: { shallow: 0x2f9aa6, deep: 0x0c3f6e, glow: 0x12f0d8, glowI: 0.32 },
  surface: VEYRA_SURFACE,
  sky: {
    dayLength: 1500, sunArc: 0.82, sunTilt: 0.55, startTime: 0.705,
    fogDensity: 0.00055, fogFalloff: 0.014, fogBase: 0, fogMax: 0.93,
    cloud: 0.5, aurora: 1, shine: 0x86b8ff, shineI: 1.25, sunDisc: 10,
    giant: { az: -27, el: 26, size: 16.5, axis: [0.34, 0.88, 0.3], colA: 0x9db4d8, colB: 0xe6c7bd, colC: 0x6a82b6, rim: 0x9fd0ff, ring: 0xf0d6ce, ringOn: true },
    moons: [
      { az: 58, el: 43, size: 3.3, colA: 0x9a7460, colB: 0x4c3a36, kind: 0 },
      { az: -78, el: 15, size: 1.4, colA: 0xcdd4e4, colB: 0x8890a8, kind: 0 },
    ],
    nebA: 0x4a5cff, nebB: 0xe060ff, galN: [0.3, 0.55, 0.78], galX: [0.65, 0.55, -0.5],
    keys: [
      { s: -0.32, zenith: 0x02030f, horizon: 0x0d3550, glow: 0x000000, glowI: 0, sun: 0x000000, sunI: 0, ambSky: 0x3f78b8, ambGround: 0x1d3050, ambI: 1.15, cloudLit: 0x2c4c6e, cloudDark: 0x091222, starVis: 1, nebVis: 0.8, planetVis: 0.62, exposure: 1.5, fog: 0.8 },
      { s: -0.1, zenith: 0x070824, horizon: 0x3a1d55, glow: 0xff4a2a, glowI: 0.2, sun: 0x000000, sunI: 0, ambSky: 0x3c3c82, ambGround: 0x1e1840, ambI: 0.95, cloudLit: 0x8a3a6a, cloudDark: 0x14102a, starVis: 0.85, nebVis: 0.75, planetVis: 0.7, exposure: 1.4, fog: 0.9 },
      { s: 0.0, zenith: 0x10103e, horizon: 0xe2542c, glow: 0xff7a30, glowI: 0.9, sun: 0xff5a20, sunI: 1.4, ambSky: 0x4a3a7a, ambGround: 0x3a1a2a, ambI: 0.55, cloudLit: 0xff6a48, cloudDark: 0x2a1a4a, starVis: 0.5, nebVis: 0.6, planetVis: 0.85, exposure: 1.12, fog: 1.3 },
      { s: 0.12, zenith: 0x142c72, horizon: 0xe08a5e, glow: 0xffa050, glowI: 0.8, sun: 0xff9a58, sunI: 2.6, ambSky: 0x5464a4, ambGround: 0x482830, ambI: 0.58, cloudLit: 0xffb088, cloudDark: 0x4a3c6e, starVis: 0.22, nebVis: 0.34, planetVis: 0.85, exposure: 1.0, fog: 1.2 },
      { s: 0.3, zenith: 0x0b3f7a, horizon: 0xa9b6d6, glow: 0xffe6c0, glowI: 0.45, sun: 0xffe2c4, sunI: 2.2, ambSky: 0x5f8fc0, ambGround: 0x463842, ambI: 0.6, cloudLit: 0xf2ecf4, cloudDark: 0x7686b0, starVis: 0.08, nebVis: 0.16, planetVis: 0.8, exposure: 0.95, fog: 1.0 },
      { s: 0.8, zenith: 0x0a4480, horizon: 0x9dbcd6, glow: 0xfff0dc, glowI: 0.35, sun: 0xfff2e2, sunI: 2.1, ambSky: 0x6498c8, ambGround: 0x483e46, ambI: 0.6, cloudLit: 0xf6f4f8, cloudDark: 0x8092b8, starVis: 0.05, nebVis: 0.1, planetVis: 0.78, exposure: 0.88, fog: 1.0 },
    ],
  },
};

export const KORR = {
  id: 'korr', kind: 'korr', name: 'Korr', subtitle: 'Ore moon of Ossa',
  seed: 9031, N: 513, cell: 2, half: 512, sea: -3.2, gravity: 8.5, hasWater: true, lava: true, breathable: false,
  pois: {
    landing: { x: 0, z: 0, r: 34, flat: 30, mark: 0.7 },
  },
  paths: [],
  water: { shallow: 0xff6a10, deep: 0xff2a00, glow: 0xff5a10, glowI: 1 },
  surface: KORR_SURFACE,
  sky: {
    dayLength: 2400, sunArc: 0.7, sunTilt: 0.5, startTime: 0.36,
    fogDensity: 0.00035, fogFalloff: 0.02, fogBase: 0, fogMax: 0.55,
    cloud: 0, aurora: 0, shine: 0x9fc0ff, shineI: 0.7, sunDisc: 60,
    giant: { az: 20, el: 34, size: 27, axis: [-0.3, 0.9, 0.32], colA: 0x9db4d8, colB: 0xe6c7bd, colC: 0x6a82b6, rim: 0x9fd0ff, ring: 0xf0d6ce, ringOn: true },
    moons: [
      { az: -62, el: 38, size: 6.5, colA: 0x1c7c8c, colB: 0x6a3a8a, kind: 1 },
      { az: 120, el: 20, size: 1.2, colA: 0xcdd4e4, colB: 0x8890a8, kind: 0 },
    ],
    nebA: 0x4a5cff, nebB: 0xe060ff, galN: [0.3, 0.55, 0.78], galX: [0.65, 0.55, -0.5],
    keys: [
      { s: -0.3, zenith: 0x010103, horizon: 0x06080f, glow: 0x000000, glowI: 0, sun: 0x000000, sunI: 0, ambSky: 0x3a5a94, ambGround: 0x2a1a14, ambI: 1.0, cloudLit: 0, cloudDark: 0, starVis: 1.2, nebVis: 1.1, planetVis: 0.85, exposure: 1.3, fog: 1 },
      { s: 0.0, zenith: 0x010104, horizon: 0x100a0c, glow: 0xffd0a0, glowI: 0.3, sun: 0xffe0c0, sunI: 1.4, ambSky: 0x364a74, ambGround: 0x30201a, ambI: 0.95, cloudLit: 0, cloudDark: 0, starVis: 1.1, nebVis: 1.0, planetVis: 0.85, exposure: 1.15, fog: 1 },
      { s: 0.25, zenith: 0x010104, horizon: 0x140c0c, glow: 0xfff0e0, glowI: 0.25, sun: 0xfff2e4, sunI: 2.5, ambSky: 0x3a4e78, ambGround: 0x34221a, ambI: 0.9, cloudLit: 0, cloudDark: 0, starVis: 0.9, nebVis: 0.85, planetVis: 0.85, exposure: 0.95, fog: 1 },
      { s: 0.8, zenith: 0x010104, horizon: 0x140c0c, glow: 0xfff0e0, glowI: 0.25, sun: 0xfff6ec, sunI: 2.6, ambSky: 0x3a4e78, ambGround: 0x34221a, ambI: 0.9, cloudLit: 0, cloudDark: 0, starVis: 0.9, nebVis: 0.85, planetVis: 0.85, exposure: 0.92, fog: 1 },
    ],
  },
};

export const PLANETS = { veyra: VEYRA, korr: KORR };
