import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from '../util.js';

// Baked light for maps with caves and lit buildings.
//
// Dozens of lamps can't all be real-time lights, so their light is baked into a volume: a grid
// over the map in x/z with a few layers stacked between each spot's floor and ceiling. Every
// sample stores L1 spherical harmonics (RGB irradiance plus a direction per colour channel),
// so surfaces facing a lamp are lit and surfaces facing away are not, and differently coloured
// lamps light a rock from different sides. Materials read it per pixel.
//
// A second mask texture says how much open sky reaches each spot (none underground), where the
// floor and ceiling are, which power circuit the spot belongs to and how far it is from the
// reactor along the cave (for the power-up wave).

export const caveUniforms = {
  uCaveOn: { value: 0 },
  uCaveMaskA: { value: null }, // r: open-sky ambient, g: sun, b: floor y, a: ceiling y
  uCavePower: { value: null }, // r: 0..1 lamp power here (circuit, reactor wave, and 0 where no lamp reaches)
  uCaveLV0: { value: null }, // c0.rgb, c1r.x
  uCaveLV1: { value: null }, // c1r.yz, c1g.xy
  uCaveLV2: { value: null }, // c1g.z, c1b.xyz
  uCaveOrigin: { value: new THREE.Vector2() },
  uCaveInvSize: { value: new THREE.Vector2(1, 1) },
  uCaveLayers: { value: 6 },
  uCaveFog: { value: new THREE.Color(0.012, 0.013, 0.016) },
  uCaveFogDensity: { value: 0.03 },
  uCaveFogGlow: { value: 0.03 },
  uCaveAmbient: { value: new THREE.Color(0.006, 0.0065, 0.008) },
  uCaveSpec: { value: 1 },
};

// declarations + helpers (fragment shaders)
export const caveParsGLSL = /* glsl */ `
uniform float uCaveOn;
uniform sampler2D uCaveMaskA;
uniform sampler2D uCavePower;
uniform highp sampler3D uCaveLV0;
uniform highp sampler3D uCaveLV1;
uniform highp sampler3D uCaveLV2;
uniform vec2 uCaveOrigin;
uniform vec2 uCaveInvSize;
uniform float uCaveLayers;
uniform vec3 uCaveFog;
uniform float uCaveFogDensity;
uniform float uCaveFogGlow;
uniform vec3 uCaveAmbient;
uniform float uCaveSpec;
vec4 caveMask(vec3 wp) {
  return texture(uCaveMaskA, (wp.xz - uCaveOrigin) * uCaveInvSize);
}
float cavePower(vec3 wp) {
  return texture(uCavePower, (wp.xz - uCaveOrigin) * uCaveInvSize).r;
}
vec3 caveUVW(vec3 wp, vec4 m) {
  float layer = clamp((wp.y - m.b) / max(m.a - m.b, 0.5), 0.0, 1.0);
  return vec3((wp.xz - uCaveOrigin) * uCaveInvSize, (layer * (uCaveLayers - 1.0) + 0.5) / uCaveLayers);
}
// irradiance for world normal n; also the strongest light's direction and colour (for highlights)
vec3 caveIrradiance(vec3 uvw, vec3 n, out vec3 domDir, out vec3 domCol, out vec3 dc) {
  vec4 a = texture(uCaveLV0, uvw);
  vec4 b = texture(uCaveLV1, uvw);
  vec4 c = texture(uCaveLV2, uvw);
  vec3 r1 = vec3(a.w, b.x, b.y);
  vec3 g1 = vec3(b.z, b.w, c.x);
  vec3 b1 = c.yzw;
  dc = a.rgb;
  vec3 e = max(a.rgb + vec3(dot(r1, n), dot(g1, n), dot(b1, n)), 0.0);
  vec3 lum = r1 * 0.3 + g1 * 0.59 + b1 * 0.11;
  float ll = length(lum);
  float l0 = max(dot(a.rgb, vec3(0.3, 0.59, 0.11)), 1e-5);
  domDir = ll > 1e-6 ? lum / ll : vec3(0.0, 1.0, 0.0);
  float directional = clamp(ll / l0 * 0.5, 0.0, 1.0);
  domCol = max(a.rgb + vec3(dot(r1, domDir), dot(g1, domDir), dot(b1, domDir)), 0.0) * directional;
  return e;
}
`;

// Lighting patches for MeshStandard / MeshLambert shaders (spliced into three's own chunks).
function lightsBegin(src) {
  return src.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= caveSunK;'
  );
}

const caveSetupGLSL = /* glsl */ `
float caveSkyK = 1.0;
float caveSunK = 1.0;
float cavePow = 0.0;
vec3 caveDC = vec3(0.0);
vec3 caveWP = vec3(0.0);
vec4 caveM = vec4(1.0, 1.0, 0.0, 10.0);
#ifdef USE_FOG
if (uCaveOn > 0.5) {
  caveWP = cameraPosition + (vec4(vFogViewPos, 0.0) * viewMatrix).xyz;
  caveM = caveMask(caveWP);
  // above the ceiling here means out on the mountain's open surface
  float caveAbove = smoothstep(caveM.a + 0.8, caveM.a + 2.5, caveWP.y);
  #ifdef CAVE_OPEN
    caveAbove = 1.0;
  #endif
  caveSkyK = max(caveM.r, caveAbove);
  caveSunK = max(caveM.g, caveAbove);
  cavePow = cavePower(caveWP) * (1.0 - caveAbove);
}
#endif
`;

const caveAmbientGLSL = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  irradiance *= caveSkyK;
#endif
`;

const caveVolumeGLSL = /* glsl */ `
#ifdef USE_FOG
if (uCaveOn > 0.5) {
  #if defined( RE_IndirectDiffuse )
    iblIrradiance *= caveSkyK;
    irradiance += uCaveAmbient * (1.0 - caveSkyK);
  #endif
  #if defined( RE_IndirectSpecular )
    radiance *= caveSkyK;
  #endif
  // lamps: only where some reach and their power is on
  if (cavePow > 0.002) {
    vec3 cn = inverseTransformDirection( normal, viewMatrix );
    vec3 cDomDir;
    vec3 cDomCol;
    vec3 cIrr = caveIrradiance(caveUVW(caveWP, caveM), cn, cDomDir, cDomCol, caveDC) * cavePow;
    caveDC *= cavePow;
    #if defined( RE_IndirectDiffuse )
      irradiance += cIrr;
    #endif
    #if defined( RE_IndirectSpecular )
      vec3 cdV = normalize( ( viewMatrix * vec4( cDomDir, 0.0 ) ).xyz );
      float cNl = saturate( dot( geometryNormal, cdV ) );
      reflectedLight.directSpecular += cDomCol * cavePow * cNl * BRDF_GGX( cdV, geometryViewDir, geometryNormal, material ) * uCaveSpec;
    #endif
  }
}
#endif
`;

// Cave fog: dark, thick, and tinted by the light around it. Blended with the open-air fog by
// how much sky the fogged point sees. Expects fogDist, fogDirW, fogAmt, fogCol in scope.
// Lit materials reuse what their lighting already looked up.
export const caveFogGLSL = /* glsl */ `
if (uCaveOn > 0.5) {
  #ifdef CAVE_LIT
    float cSky = caveSkyK;
    vec3 cdc = caveDC;
  #else
    vec3 cfw = cameraPosition + fogDirW * fogDist;
    vec4 cfm = caveMask(cfw);
    float cSky = max(cfm.r, smoothstep(cfm.a + 0.8, cfm.a + 2.5, cfw.y));
    vec3 cdc = vec3(0.0);
    if (cSky < 0.999) {
      float cpw = cavePower(cfw);
      if (cpw > 0.002) cdc = texture(uCaveLV0, caveUVW(cfw, cfm)).rgb * cpw;
    }
  #endif
  if (cSky < 0.999) {
    float cAmt = 1.0 - exp(-uCaveFogDensity * fogDist);
    vec3 cCol = uCaveFog + cdc * uCaveFogGlow;
    fogCol = mix(cCol, fogCol, cSky);
    fogAmt = mix(cAmt, fogAmt, cSky);
  }
}
`;

// Called from the fog patch for every world material.
export function patchCaveShader(shader, open = false) {
  Object.assign(shader.uniforms, caveUniforms);
  let fs = shader.fragmentShader;
  if (open) fs = '#define CAVE_OPEN\n' + fs;
  if (!fs.includes('#include <lights_fragment_begin>')) {
    // unlit material: only the fog needs the cave uniforms
    shader.fragmentShader = fs.replace('#include <common>', '#include <common>\n' + caveParsGLSL);
    return;
  }
  fs = '#define CAVE_LIT\n' + fs.replace('#include <common>', '#include <common>\n' + caveParsGLSL);
  fs = fs.replace('#include <lights_fragment_begin>', caveSetupGLSL + lightsBegin(THREE.ShaderChunk.lights_fragment_begin) + caveAmbientGLSL);
  fs = fs.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + caveVolumeGLSL);
  shader.fragmentShader = fs;
}

// ---- the bake --------------------------------------------------------------------------------
// Three's point-light falloff, so a baked lamp matches a real one of the same settings.
function falloff(d, range) {
  let f = 1 / Math.max(d * d, 0.01);
  if (range > 0) {
    const r = clamp(1 - Math.pow(d / range, 4), 0, 1);
    f *= r * r;
  }
  return f;
}

export class LightVolume {
  // grid: { minX, minZ, maxX, maxZ, res, layers }
  // floorAt/ceilAt(x,z): layer span; skyAt(x,z) -> [ambient, sun]; circuitAt(x,z) -> 0..7
  // occluded(ax,ay,az,bx,by,bz) -> bool (shadow test for the bake)
  constructor(grid, fns) {
    this.minX = grid.minX;
    this.minZ = grid.minZ;
    this.res = grid.res;
    this.layers = grid.layers || 6;
    this.nx = Math.ceil((grid.maxX - grid.minX) / grid.res) + 1;
    this.nz = Math.ceil((grid.maxZ - grid.minZ) / grid.res) + 1;
    this.fns = fns;
    this.lights = [];
    const n = this.nx * this.nz;
    this.floor = new Float32Array(n);
    this.ceil = new Float32Array(n);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.minX + i * this.res;
        const z = this.minZ + j * this.res;
        const f = fns.floorAt(x, z);
        this.floor[j * this.nx + i] = f;
        this.ceil[j * this.nx + i] = Math.max(f + 0.5, fns.ceilAt(x, z));
      }
    }
  }

  // light: { x, y, z, color (THREE.Color or hex), intensity, range, spot: { dir, angle, penumbra } }
  add(l) {
    const c = new THREE.Color(l.color ?? 0xffffff);
    this.lights.push({ ...l, color: c, range: l.range ?? 14, intensity: l.intensity ?? 10 });
  }

  // layer k sits at k/(layers-1) of the way from floor to ceiling (the shader's mapping)
  sampleY(i, j, k) {
    const o = j * this.nx + i;
    const f = this.floor[o];
    return f + (this.ceil[o] - f) * (k / (this.layers - 1));
  }

  async bake(tick) {
    const { nx, nz, layers, res } = this;
    const N = nx * nz * layers;
    // 12 floats per sample: c0 rgb, c1 r(xyz) g(xyz) b(xyz)
    const sh = new Float32Array(N * 12);
    const occ = this.fns.occluded;
    let li = 0;
    for (const L of this.lights) {
      const r = L.range;
      const i0 = Math.max(0, Math.floor((L.x - r - this.minX) / res));
      const i1 = Math.min(nx - 1, Math.ceil((L.x + r - this.minX) / res));
      const j0 = Math.max(0, Math.floor((L.z - r - this.minZ) / res));
      const j1 = Math.min(nz - 1, Math.ceil((L.z + r - this.minZ) / res));
      const spot = L.spot;
      let cosOuter = 0;
      let cosInner = 0;
      if (spot) {
        spot.dir.normalize();
        cosOuter = Math.cos(spot.angle);
        cosInner = Math.cos(spot.angle * (1 - (spot.penumbra ?? 0.4)));
      }
      const cr = L.color.r * L.intensity;
      const cg = L.color.g * L.intensity;
      const cb = L.color.b * L.intensity;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.minX + i * res;
          const z = this.minZ + j * res;
          const hx = L.x - x;
          const hz = L.z - z;
          if (hx * hx + hz * hz > r * r) continue;
          for (let k = 0; k < layers; k++) {
            const y = this.sampleY(i, j, k);
            const dx = L.x - x;
            const dy = L.y - y;
            const dz = L.z - z;
            const d = Math.hypot(dx, dy, dz);
            if (d >= r) continue;
            let w = falloff(Math.max(d, 0.6), r);
            if (spot) {
              const cd = -(dx * spot.dir.x + dy * spot.dir.y + dz * spot.dir.z) / Math.max(d, 1e-4);
              if (cd <= cosOuter) continue;
              const t = clamp((cd - cosOuter) / Math.max(cosInner - cosOuter, 1e-4), 0, 1);
              w *= t * t * (3 - 2 * t);
            }
            if (w < 1e-4) continue;
            const ux = dx / d;
            const uy = dy / d;
            const uz = dz / d;
            // start the shadow ray a little off the sample so floor samples don't hit their own floor
            if (occ && d > 0.9 && occ(x + ux * 0.25, y + uy * 0.25 + 0.05, z + uz * 0.25, L.x, L.y, L.z, L)) continue;
            const o = ((k * nz + j) * nx + i) * 12;
            sh[o] += cr * w * 0.25;
            sh[o + 1] += cg * w * 0.25;
            sh[o + 2] += cb * w * 0.25;
            sh[o + 3] += cr * w * 0.5 * ux;
            sh[o + 4] += cr * w * 0.5 * uy;
            sh[o + 5] += cr * w * 0.5 * uz;
            sh[o + 6] += cg * w * 0.5 * ux;
            sh[o + 7] += cg * w * 0.5 * uy;
            sh[o + 8] += cg * w * 0.5 * uz;
            sh[o + 9] += cb * w * 0.5 * ux;
            sh[o + 10] += cb * w * 0.5 * uy;
            sh[o + 11] += cb * w * 0.5 * uz;
          }
        }
      }
      li++;
      if (tick && (li & 3) === 0) await tick(li / this.lights.length);
    }
    this.sh = sh;
    if (this.fns.solid) this._dilate();
    this._buildTextures();
  }

  // Samples buried in rock got no light; give them their open neighbours' average so the
  // trilinear blend doesn't darken the walls next to them.
  _dilate() {
    const { nx, nz, layers, sh } = this;
    const solid = new Uint8Array(nx * nz * layers);
    for (let k = 0; k < layers; k++) {
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const x = this.minX + i * this.res;
          const z = this.minZ + j * this.res;
          if (this.fns.solid(x, this.sampleY(i, j, k), z)) solid[(k * nz + j) * nx + i] = 1;
        }
      }
    }
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let pass = 0; pass < 2; pass++) {
      const fixed = [];
      for (let k = 0; k < layers; k++) {
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const s = (k * nz + j) * nx + i;
            if (!solid[s]) continue;
            const acc = new Float32Array(12);
            let n = 0;
            for (const [di, dj, dk] of nb) {
              const a = i + di;
              const b = j + dj;
              const c = k + dk;
              if (a < 0 || b < 0 || c < 0 || a >= nx || b >= nz || c >= layers) continue;
              const q = (c * nz + b) * nx + a;
              if (solid[q]) continue;
              for (let t = 0; t < 12; t++) acc[t] += sh[q * 12 + t];
              n++;
            }
            if (n) fixed.push([s, acc, n]);
          }
        }
      }
      for (const [s, acc, n] of fixed) {
        for (let t = 0; t < 12; t++) sh[s * 12 + t] = acc[t] / n;
        solid[s] = 0;
      }
    }
  }

  _buildTextures() {
    const { nx, nz, layers } = this;
    const N = nx * nz * layers;
    const sh = this.sh;
    const toHalf = THREE.DataUtils.toHalfFloat;
    const t0 = new Uint16Array(N * 4);
    const t1 = new Uint16Array(N * 4);
    const t2 = new Uint16Array(N * 4);
    for (let s = 0; s < N; s++) {
      const o = s * 12;
      const q = s * 4;
      // half floats top out at 65504; clamp hot spots right next to lamps
      const h = (v) => toHalf(Math.max(-6e4, Math.min(6e4, v)));
      t0[q] = h(sh[o]);
      t0[q + 1] = h(sh[o + 1]);
      t0[q + 2] = h(sh[o + 2]);
      t0[q + 3] = h(sh[o + 3]);
      t1[q] = h(sh[o + 4]);
      t1[q + 1] = h(sh[o + 5]);
      t1[q + 2] = h(sh[o + 6]);
      t1[q + 3] = h(sh[o + 7]);
      t2[q] = h(sh[o + 8]);
      t2[q + 1] = h(sh[o + 9]);
      t2[q + 2] = h(sh[o + 10]);
      t2[q + 3] = h(sh[o + 11]);
    }
    const mk = (data) => {
      const t = new THREE.Data3DTexture(data, nx, nz, layers);
      t.format = THREE.RGBAFormat;
      t.type = THREE.HalfFloatType;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
      t.unpackAlignment = 1;
      t.needsUpdate = true;
      return t;
    };
    this.tex = [mk(t0), mk(t1), mk(t2)];
    // masks
    const fns = this.fns;
    const ma = new Uint16Array(nx * nz * 4);
    this.circuit = new Uint8Array(nx * nz);
    this.lit = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = this.minX + i * this.res;
        const z = this.minZ + j * this.res;
        const o = j * nx + i;
        const [amb, sun] = fns.skyAt(x, z);
        ma[o * 4] = toHalf(amb);
        ma[o * 4 + 1] = toHalf(sun);
        ma[o * 4 + 2] = toHalf(clamp(this.floor[o], -6e4, 6e4));
        ma[o * 4 + 3] = toHalf(clamp(this.ceil[o], -6e4, 6e4));
        this.circuit[o] = fns.circuitAt(x, z);
        // does any lamp reach this column? (dark columns skip the volume in the shader)
        let any = 0;
        for (let k = 0; k < layers && !any; k++) {
          const so = ((k * nz + j) * nx + i) * 12;
          if (sh[so] + sh[so + 1] + sh[so + 2] > 1e-4) any = 1;
        }
        this.lit[o] = any;
      }
    }
    // grow the lit mask by a texel so bilinear lookups at its edge still see the light
    const lit2 = this.lit.slice();
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const o = j * nx + i;
        if (!lit2[o] && (this.lit[o - 1] || this.lit[o + 1] || this.lit[o - nx] || this.lit[o + nx])) lit2[o] = 1;
      }
    }
    this.lit = lit2;
    const mk2 = (data, filter) => {
      const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
      t.minFilter = t.magFilter = filter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    this.maskA = mk2(ma, THREE.LinearFilter);
    this.powerData = new Uint8Array(nx * nz);
    this.powerTex = new THREE.DataTexture(this.powerData, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    this.powerTex.minFilter = this.powerTex.magFilter = THREE.LinearFilter;
    this.powerTex.wrapS = this.powerTex.wrapT = THREE.ClampToEdgeWrapping;
    this.powerTex.unpackAlignment = 1;
    this.powerTex.needsUpdate = true;
  }

  // Lamp power per column: its circuit's level, the reactor wave for circuit 0, nothing where
  // no lamp reaches. k: level per circuit slot (0..7), front: how far the wave has travelled.
  updatePower(k, front) {
    const { nx, nz } = this;
    const out = this.powerData;
    const wave = this.waveDist;
    for (let o = 0; o < nx * nz; o++) {
      if (!this.lit[o]) {
        out[o] = 0;
        continue;
      }
      const c = this.circuit[o];
      let p = k[c] ?? 0;
      if (c === 0 && wave) p *= clamp((front - wave[o]) / 9, 0, 1);
      out[o] = Math.round(p * 255);
    }
    this.powerTex.needsUpdate = true;
  }

  // Geodesic distance (m) from source points through open cells (power wave, depth underground).
  geodesic(sources, passable) {
    const { nx, nz, res } = this;
    // doubles: pushed distances must compare exactly with stored ones
    const dist = new Float64Array(nx * nz).fill(6e4);
    const open = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) open[j * nx + i] = passable(this.minX + i * res, this.minZ + j * res) ? 1 : 0;
    const heap = [];
    const push = (d, o) => {
      heap.push([d, o]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    for (const [sx, sz] of sources) {
      const i0 = clamp(Math.round((sx - this.minX) / res), 0, nx - 1);
      const j0 = clamp(Math.round((sz - this.minZ) / res), 0, nz - 1);
      const s = j0 * nx + i0;
      dist[s] = 0;
      push(0, s);
    }
    const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const [d, o] = pop();
      if (d > dist[o]) continue;
      const i = o % nx;
      const j = (o - i) / nx;
      for (const [di, dj, w] of N8) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const q = b * nx + a;
        if (!open[q]) continue;
        const nd = d + w * res;
        if (nd < dist[q]) {
          dist[q] = nd;
          push(nd, q);
        }
      }
    }
    // rock cells take the distance of the nearest open cell so walls go with their room
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 1; j < nz - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const o = j * nx + i;
          if (open[o]) continue;
          const m = Math.min(dist[o - 1], dist[o + 1], dist[o - nx], dist[o + nx]) + res;
          if (m < dist[o]) dist[o] = m;
        }
      }
    }
    return dist;
  }

  computeWave(fromX, fromZ, passable) {
    const dist = this.geodesic([[fromX, fromZ]], passable);
    this.waveDist = dist;
    let max = 0;
    for (let o = 0; o < dist.length; o++) if (dist[o] < 5e4) max = Math.max(max, dist[o]);
    this.waveMax = max;
    return max;
  }

  gridAt(arr, x, z) {
    const i = clamp(Math.round((x - this.minX) / this.res), 0, this.nx - 1);
    const j = clamp(Math.round((z - this.minZ) / this.res), 0, this.nz - 1);
    return arr[j * this.nx + i];
  }

  // CPU sample (for the weapon's lighting and the helmet light): irradiance for normal n, or
  // the average when n is null. Returns {r,g,b} and the dominant direction.
  sample(x, y, z, power, out = { r: 0, g: 0, b: 0, dx: 0, dy: 1, dz: 0, strength: 0 }) {
    const fx = clamp((x - this.minX) / this.res, 0, this.nx - 1.001);
    const fz = clamp((z - this.minZ) / this.res, 0, this.nz - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const o = j * this.nx + i;
    const f = this.floor[o];
    const c = this.ceil[o];
    const layer = clamp((y - f) / Math.max(c - f, 0.5), 0, 1) * (this.layers - 1);
    const k = Math.min(this.layers - 2, Math.floor(layer));
    const t = layer - k;
    const acc = new Float32Array(12);
    const u = fx - i;
    const v = fz - j;
    const corners = [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]];
    for (const [di, dj, w] of corners) {
      for (const [dk, wk] of [[0, 1 - t], [1, t]]) {
        const so = (((k + dk) * this.nz + (j + dj)) * this.nx + (i + di)) * 12;
        for (let q = 0; q < 12; q++) acc[q] += this.sh[so + q] * w * wk;
      }
    }
    const lr = acc[3] * 0.3 + acc[6] * 0.59 + acc[9] * 0.11;
    const lg = acc[4] * 0.3 + acc[7] * 0.59 + acc[10] * 0.11;
    const lb = acc[5] * 0.3 + acc[8] * 0.59 + acc[11] * 0.11;
    const ll = Math.hypot(lr, lg, lb);
    out.r = acc[0] * power;
    out.g = acc[1] * power;
    out.b = acc[2] * power;
    out.dx = ll > 1e-6 ? lr / ll : 0;
    out.dy = ll > 1e-6 ? lg / ll : 1;
    out.dz = ll > 1e-6 ? lb / ll : 0;
    const l0 = Math.max(acc[0] * 0.3 + acc[1] * 0.59 + acc[2] * 0.11, 1e-6);
    out.strength = clamp((ll / l0) * 0.5, 0, 1);
    return out;
  }

  // Point the shared uniforms at this volume.
  bind() {
    const u = caveUniforms;
    u.uCaveOn.value = 1;
    u.uCaveMaskA.value = this.maskA;
    u.uCavePower.value = this.powerTex;
    u.uCaveLV0.value = this.tex[0];
    u.uCaveLV1.value = this.tex[1];
    u.uCaveLV2.value = this.tex[2];
    // texel centres: sample (i) sits at minX + i*res, so map [minX - res/2, maxX + res/2]
    u.uCaveOrigin.value.set(this.minX - this.res / 2, this.minZ - this.res / 2);
    u.uCaveInvSize.value.set(1 / (this.nx * this.res), 1 / (this.nz * this.res));
    u.uCaveLayers.value = this.layers;
  }

  dispose() {
    for (const t of this.tex || []) t.dispose();
    if (this.maskA) this.maskA.dispose();
    if (this.powerTex) this.powerTex.dispose();
  }
}

export function unbindCaveLight() {
  caveUniforms.uCaveOn.value = 0;
  for (const k of ['uCaveMaskA', 'uCavePower', 'uCaveLV0', 'uCaveLV1', 'uCaveLV2']) caveUniforms[k].value = null;
}

// Glowing lamp fittings that follow their circuit (and the reactor's power-up wave).
export function fixtureMaterial(color, bright) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(bright) });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
      if (uCaveOn > 0.5) {
        vec3 fwp = cameraPosition + (vec4(vFogViewPos, 0.0) * viewMatrix).xyz;
        gl_FragColor.rgb *= mix(0.025, 1.0, cavePower(fwp));
      }
      #endif
      #include <fog_fragment>`
    );
  };
  mat.customProgramCacheKey = () => 'fixture';
  return lazyPatch(mat);
}

let patchFn = null;
// fog.js registers its patcher here (avoids an import cycle)
export function setFixturePatcher(fn) {
  patchFn = fn;
}
function lazyPatch(mat) {
  return patchFn ? patchFn(mat) : mat;
}
