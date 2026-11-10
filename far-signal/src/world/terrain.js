import * as THREE from 'three';
import { COMMON, FS_VERT } from '../gfx/shaderlib.js';
import { G, commonUniforms } from '../gfx/globals.js';

const CHUNK_Q = 64;            // quads per chunk side at full detail
const LOD_STEPS = [1, 2, 4, 8];

const TERRAIN_VERT = /* glsl */`
varying vec3 vWp;
void main(){
  vWp = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const terrainFrag = (surface) => /* glsl */`
${COMMON}
uniform sampler2D uNormTex; uniform sampler2D uSplatTex;
varying vec3 vWp;
${surface}
void main(){
  if (vWp.y < uClipY) discard;
  vec2 uv = vWp.xz * uWorld.y + 0.5;
  vec4 nt = texture2D(uNormTex, uv);
  vec3 N; N.xz = nt.xy * 2.0 - 1.0; N.y = sqrt(max(1.0 - dot(N.xz, N.xz), 0.0));
  vec4 sp = texture2D(uSplatTex, uv);
  float dist = length(vWp - cameraPosition);
  vec4 nA = texture2D(uNoise, vWp.xz * 0.0113);
  vec4 nB = texture2D(uNoise, vWp.xz * 0.071 + 0.31);
  vec4 nC = texture2D(uNoise, vWp.xz * 0.53 + 0.17);
  vec4 nD = texture2D(uNoise, vWp.xz * 2.3 + 0.61);
  float micro = 1.0 / (1.0 + dist * dist * 0.004);
  vec3 albedo; vec3 emissive; float gloss;
  planetSurface(vWp, N, nt.w, sp, nA, nB, nC, albedo, emissive, gloss);
  float df = 1.0 / (1.0 + dist * 0.025);
  albedo *= 1.0 + (nD.r - 0.5) * 0.5 * micro;
  vec3 Nd = normalize(N + vec3(nB.r - 0.5, nB.b - 0.4, nB.g - 0.5) * 0.36 + vec3(nC.r - 0.5, nC.b - 0.4, nC.g - 0.5) * 0.55 * df + vec3(nD.g - 0.5, 0.0, nD.r - 0.5) * 0.5 * micro + vec3(0.0, gLedge * 0.42, 0.0));
  float ndl = max(dot(Nd, uSunDir), 0.0);
  float sh = keyShadow(vWp);
  vec3 amb = hemiAmbient(Nd) * (0.18 + 0.82 * nt.z * nt.z);
  vec3 col = albedo * (uSunColor * ndl * sh + amb + pointLights(vWp, Nd));
  vec3 V = normalize(cameraPosition - vWp);
  vec3 H = normalize(V + uSunDir);
  col += uSunColor * pow(max(dot(Nd, H), 0.0), 60.0) * gloss * sh * 0.5;
  col += emissive;
  col = applyFog(col, vWp);
  gl_FragColor = vec4(col, 1.0);
}`;

// Marches the heightfield toward the key light and stores, per texel, the
// altitude below which a point is in shadow plus the occluder distance.
const SHADOW_FRAG = /* glsl */`
uniform sampler2D uHeightTex; uniform vec2 uLightXZ; uniform float uSlope; uniform float uSize;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * uSize;
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = 3.0 + j * 1.5;
  float S = -1000.0; float tStar = 0.0;
  for (int i = 0; i < 56; i++){
    vec2 q = (p + uLightXZ * t) / uSize + 0.5;
    float h = texture2D(uHeightTex, q).r;
    float inb = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    float s = mix(-1000.0, h - t * uSlope, inb);
    if (s > S){ S = s; tStar = t; }
    t *= 1.095;
  }
  gl_FragColor = vec4(S, tStar, 0.0, 1.0);
}`;

export class Terrain {
  constructor(gfx, data) {
    this.gfx = gfx;
    this.data = data;
    const { N, heights, splat, norm } = data;
    this.N = N; this.cell = data.cell; this.half = data.half; this.size = data.size;
    this.sea = data.sea;

    const hf = new Uint16Array(N * N);
    for (let i = 0; i < hf.length; i++) hf[i] = THREE.DataUtils.toHalfFloat(heights[i]);
    this.heightTex = new THREE.DataTexture(hf, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.wrapS = this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.needsUpdate = true;

    const mk = (arr) => {
      const t = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    this.normTex = mk(norm);
    this.splatTex = mk(splat);

    this.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: terrainFrag(data.def.surface),
      uniforms: commonUniforms({ uNormTex: { value: this.normTex }, uSplatTex: { value: this.splatTex } }),
    });

    // Key-light shadow bake target
    const ss = gfx.q.shadowSize;
    this.shadowRT = new THREE.WebGLRenderTarget(ss, ss, {
      type: gfx.rtType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.shadowMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: SHADOW_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uHeightTex: { value: this.heightTex }, uLightXZ: { value: new THREE.Vector2(1, 0) }, uSlope: { value: 1 }, uSize: { value: this.size } },
    });
    this.lastShadowDir = new THREE.Vector3(0, -1, 0);

    this.group = new THREE.Group();
    this.chunks = [];
    this.indexCache = {};
    const Q = N - 1;
    this.nc = Math.ceil(Q / CHUNK_Q);
    for (let cz = 0; cz < this.nc; cz++) {
      for (let cx = 0; cx < this.nc; cx++) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.matrixAutoUpdate = false;
        mesh.layers.enable(1);
        const x0 = -this.half + (cx + 0.5) * CHUNK_Q * this.cell, z0 = -this.half + (cz + 0.5) * CHUNK_Q * this.cell;
        const ch = { cx, cz, mesh, lod: -1, geos: [], x: x0, z: z0 };
        this.chunks.push(ch);
        this.group.add(mesh);
      }
    }
    this.pending = [];
  }

  activate() {
    G.uWorld.value.set(this.half, 1 / this.size, this.sea, this.gfx.floatOK ? 1 : 0);
    G.uShadowTex.value = this.shadowRT.texture;
    this.lastShadowDir.set(0, -1, 0);
  }

  bakeShadow(lightDir, force) {
    if (!this.gfx.floatOK) return;
    if (!force && this.lastShadowDir.dot(lightDir) > 0.99999) return;
    this.lastShadowDir.copy(lightDir);
    const h = Math.hypot(lightDir.x, lightDir.z) || 1e-4;
    this.shadowMat.uniforms.uLightXZ.value.set(lightDir.x / h, lightDir.z / h);
    this.shadowMat.uniforms.uSlope.value = lightDir.y / h;
    this.gfx._pass(this.shadowMat, this.shadowRT);
  }

  _indices(n) {
    if (this.indexCache[n]) return this.indexCache[n];
    const v = n + 1;
    const idx = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const a = z * v + x, b = a + 1, c = a + v, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // skirts: one extra ring of vertices appended after the grid
    const base = v * v;
    const ring = [];
    for (let x = 0; x < v; x++) ring.push(x);                         // top edge
    for (let z = 1; z < v; z++) ring.push(z * v + n);                 // right
    for (let x = n - 1; x >= 0; x--) ring.push(n * v + x);            // bottom
    for (let z = n - 1; z >= 1; z--) ring.push(z * v);                // left
    const rn = ring.length;
    for (let i = 0; i < rn; i++) {
      const a = ring[i], b = ring[(i + 1) % rn];
      const sa = base + i, sb = base + ((i + 1) % rn);
      idx.push(a, b, sa, b, sb, sa);
    }
    const arr = new (base + rn > 65535 ? Uint32Array : Uint16Array)(idx);
    const out = { attr: new THREE.BufferAttribute(arr, 1), ring };
    this.indexCache[n] = out;
    return out;
  }

  _buildGeo(ch, lod) {
    const step = LOD_STEPS[lod];
    const n = CHUNK_Q / step, v = n + 1;
    const { N, cell, half } = this;
    const H = this.data.heights;
    const ix0 = ch.cx * CHUNK_Q, iz0 = ch.cz * CHUNK_Q;
    const { attr, ring } = this._indices(n);
    const pos = new Float32Array((v * v + ring.length) * 3);
    let minY = 1e9, maxY = -1e9, k = 0;
    for (let z = 0; z < v; z++) {
      const iz = Math.min(iz0 + z * step, N - 1);
      for (let x = 0; x < v; x++) {
        const ix = Math.min(ix0 + x * step, N - 1);
        const h = H[iz * N + ix];
        pos[k++] = -half + ix * cell; pos[k++] = h; pos[k++] = -half + iz * cell;
        if (h < minY) minY = h; if (h > maxY) maxY = h;
      }
    }
    const drop = 3 + step * 2.5;
    for (let i = 0; i < ring.length; i++) {
      const s = ring[i] * 3;
      pos[k++] = pos[s]; pos[k++] = pos[s + 1] - drop; pos[k++] = pos[s + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(attr);
    const cs = CHUNK_Q * cell * 0.5;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(ch.x, (minY + maxY) * 0.5, ch.z), Math.hypot(cs * 1.42, (maxY - minY) * 0.5 + drop));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(ch.x - cs, minY - drop, ch.z - cs), new THREE.Vector3(ch.x + cs, maxY, ch.z + cs));
    return geo;
  }

  update(camPos, drawScale = 1) {
    const d0 = 170 * drawScale, d1 = 360 * drawScale, d2 = 760 * drawScale;
    let budget = 3;
    for (const ch of this.chunks) {
      const d = Math.hypot(camPos.x - ch.x, camPos.z - ch.z) - 90;
      let lod = d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : 3;
      if (lod !== ch.lod) {
        if (!ch.geos[lod]) {
          if (budget <= 0 && ch.lod >= 0) continue;
          ch.geos[lod] = this._buildGeo(ch, lod);
          budget--;
        }
        ch.mesh.geometry = ch.geos[lod];
        ch.lod = lod;
        // free detailed geometry that has fallen far behind
        if (lod >= 2 && ch.geos[0]) { ch.geos[0].dispose(); ch.geos[0] = null; }
      }
    }
  }

  // --- queries ---------------------------------------------------------------
  heightAt(x, z) {
    const { N, cell, half } = this;
    let fx = (x + half) / cell, fz = (z + half) / cell;
    if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) {
      fx = fx < 0 ? 0 : fx > N - 1 ? N - 1 : fx;
      fz = fz < 0 ? 0 : fz > N - 1 ? N - 1 : fz;
    }
    let ix = fx | 0, iz = fz | 0;
    if (ix >= N - 1) ix = N - 2;
    if (iz >= N - 1) iz = N - 2;
    const tx = fx - ix, tz = fz - iz;
    const H = this.data.heights, i = iz * N + ix;
    const a = H[i], b = H[i + 1], c = H[i + N], d = H[i + N + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  normalAt(x, z, out) {
    const e = this.cell;
    const dx = this.heightAt(x - e, z) - this.heightAt(x + e, z);
    const dz = this.heightAt(x, z - e) - this.heightAt(x, z + e);
    out.set(dx, 2 * e, dz).normalize();
    return out;
  }

  // biome weights at a point: [crystal, mesa, mountain, special] in 0..1
  splatAt(x, z, out) {
    const { N, cell, half } = this;
    let ix = Math.round((x + half) / cell), iz = Math.round((z + half) / cell);
    ix = ix < 0 ? 0 : ix > N - 1 ? N - 1 : ix;
    iz = iz < 0 ? 0 : iz > N - 1 ? N - 1 : iz;
    const i = (iz * N + ix) * 4, S = this.data.splat;
    out[0] = S[i] / 255; out[1] = S[i + 1] / 255; out[2] = S[i + 2] / 255; out[3] = S[i + 3] / 255;
    return out;
  }

  inBounds(x, z, margin = 0) {
    const h = this.half - margin;
    return x > -h && x < h && z > -h && z < h;
  }

  // March a ray against the heightfield; returns distance or -1.
  raycast(origin, dir, maxDist = 400) {
    let t = 0, prevT = 0;
    let step = 1.0;
    for (let i = 0; i < 400 && t < maxDist; i++) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const h = this.heightAt(x, z);
      if (y < h) {
        let a = prevT, b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) * 0.5;
          const my = origin.y + dir.y * m;
          if (my < this.heightAt(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m;
        }
        return (a + b) * 0.5;
      }
      prevT = t;
      step = Math.max(0.6, (y - h) * 0.4);
      t += step;
    }
    return -1;
  }

  dispose() {
    for (const ch of this.chunks) for (const g of ch.geos) if (g) g.dispose();
    this.material.dispose();
    this.heightTex.dispose(); this.normTex.dispose(); this.splatTex.dispose();
    this.shadowRT.dispose(); this.shadowMat.dispose();
  }
}
