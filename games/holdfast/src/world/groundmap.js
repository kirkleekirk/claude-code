// What grows where, baked once into a texture the grass reads on the GPU:
//   R how much grass (0 none: roads, floors, water, crops)   G how dry it is
//   B wildflowers                                            A mown (town lawns)
// plus the terrain's heights, so every blade can find the ground by itself.
import * as THREE from 'three';
import { T, creekX, CREEK, NEW_LAND } from './terrain.js';
import { STREETS, FIELDS } from './layout.js';
import { smoothstep } from '../util.js';

export class GroundMap {
  constructor(world, noise) {
    const tr = world.terrain, res = this.res = 1;
    const W = this.W = Math.round((T.x1 - T.x0) / res), H = this.H = Math.round((T.z1 - T.z0) / res);
    const d = this.data = new Uint8Array(W * H * 4);
    const townZ = T.town.z1;
    // the terrain's own ground cover at its grid points, blended the way its
    // shader blends it, so the blades agree with the ground they stand on:
    // how much of it is grass at all, and how much of that is dry
    const nx = T.nx, nz = T.nz, veg = new Float32Array(nx * nz), dryG = new Float32Array(nx * nz);
    const hAt = (i, j) => tr.h[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const dx = hAt(i - 1, j) - hAt(i + 1, j), dz = hAt(i, j - 1) - hAt(i, j + 1);
      const ny = (2 * T.res) / Math.hypot(dx, 2 * T.res, dz);
      const s = tr.splatFn(T.x0 + i * T.res, T.z0 + j * T.res, hAt(i, j), 1 - ny);
      const sand = Math.max(0, 1 - s[0] - s[1] - s[2] - s[3]);
      const g2 = s[0] * s[0], d2 = s[1] * s[1], rest = s[2] * s[2] + s[3] * s[3] + sand * sand;
      veg[j * nx + i] = (g2 + d2) / (g2 + d2 + rest + 1e-5);
      dryG[j * nx + i] = d2 / (g2 + d2 + 1e-5);
    }
    const bil = (a, x, z) => {
      const fx = Math.max(0, Math.min(nx - 1.001, (x - T.x0) / T.res)), fz = Math.max(0, Math.min(nz - 1.001, (z - T.z0) / T.res));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
      return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + nx] * (1 - u) + a[k + nx + 1] * u) * v;
    };
    for (let j = 0; j < H; j++) {
      const z = T.z0 + (j + 0.5) * res, cx = creekX(z);
      const gj = Math.min(T.nz - 1, Math.round((z - T.z0) / T.res));
      for (let i = 0; i < W; i++) {
        const x = T.x0 + (i + 0.5) * res, k = (j * W + i) * 4;
        const h = tr.h[gj * T.nx + Math.min(T.nx - 1, Math.round((x - T.x0) / T.res))];
        let amt = 1, mown = 0;
        if (h < T.water + 0.8) amt = 0;
        else {
          const rd = world.roadDist(x, z);
          amt *= smoothstep(1.3, 3.6, rd);
          amt *= smoothstep(0.3, 0.75, bil(veg, x, z)); // bare dirt, gravel and sand grow little
          if (x > T.floodwallX - 2 && Math.abs(z) < townZ + 8) amt = 0; // riprap bank
          if (x > NEW_LAND.x0 && x < NEW_LAND.x1 && Math.abs(x - cx) < CREEK.chanHalf + 0.4) amt = 0; // the creek itself
          if (amt > 0 && x > T.town.x0 - 2 && x < T.floodwallX + 1 && Math.abs(z) < townZ - 6) { mown = 1; amt = Math.min(amt, 0.9); }
        }
        if (amt > 0 && !mown) amt *= 0.72 + 0.28 * (noise(x / 9 + 31, z / 9) * 0.5 + 0.5);
        d[k] = Math.round(amt * 255);
        d[k + 1] = Math.round(bil(dryG, x, z) * 255);
        d[k + 2] = Math.round(smoothstep(0.6, 0.82, noise(x / 23 + 50, z / 23 - 9) * 0.5 + 0.5) * 255);
        d[k + 3] = mown * 255;
      }
    }
    // hay is tall and dry; corn and beans stand where grass would
    for (const f of FIELDS) {
      if (f.crop === 'hay') this.fill(f.x0, f.z0, f.x1, f.z1, (k) => { d[k + 1] = 255; d[k + 2] = 0; });
      else if (f.crop === 'corn' || f.crop === 'beans') this.fill(f.x0 - 0.5, f.z0 - 0.5, f.x1 + 0.5, f.z1 + 0.5, (k) => { d[k] = 0; });
    }
    for (const st of STREETS.ns) this.clear(st.x0 - st.walk - 0.4, st.z0 - 0.4, st.x1 + st.walk + 0.4, st.z1 + 0.4, false);
    for (const st of STREETS.ew) this.clear(st.x0 - 0.4, st.z0 - st.walk - 0.4, st.x1 + 0.4, st.z1 + st.walk + 0.4, false);
    for (const l of STREETS.lots || []) this.clear(l.x0 - 0.5, l.z0 - 0.5, l.x1 + 0.5, l.z1 + 0.5, false);
    for (const o of world.occupied) this.clear(o[0] - 0.5, o[1] - 0.5, o[2] + 0.5, o[3] + 0.5, false);
    const tex = this.tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    // terrain heights (half floats filter linearly everywhere)
    const h16 = new Uint16Array(T.nx * T.nz);
    for (let q = 0; q < h16.length; q++) h16[q] = THREE.DataUtils.toHalfFloat(tr.h[q]);
    const ht = this.heightTex = new THREE.DataTexture(h16, T.nx, T.nz, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter;
    ht.wrapS = ht.wrapT = THREE.ClampToEdgeWrapping;
    ht.needsUpdate = true;
    // world rect of the ground map; and the height grid's origin, cell size and counts
    this.rect = new THREE.Vector4(T.x0, T.z0, T.x1 - T.x0, T.z1 - T.z0);
    this.grid = new THREE.Vector4(T.x0, T.z0, T.res, 0);
    this.gridN = new THREE.Vector2(T.nx, T.nz);
  }
  fill(x0, z0, x1, z1, fn) {
    const W = this.W, H = this.H, r = this.res;
    const i0 = Math.max(0, Math.floor((x0 - T.x0) / r)), i1 = Math.min(W - 1, Math.ceil((x1 - T.x0) / r) - 1);
    const j0 = Math.max(0, Math.floor((z0 - T.z0) / r)), j1 = Math.min(H - 1, Math.ceil((z1 - T.z0) / r) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn((j * W + i) * 4);
  }
  // nothing grows in this rect any more (a floor went down)
  clear(x0, z0, x1, z1, upload = true) {
    const d = this.data;
    this.fill(x0, z0, x1, z1, (k) => { d[k] = 0; });
    if (upload && this.tex) this.tex.needsUpdate = true;
  }
  // the terrain changed under a rect (a pad was levelled)
  refreshHeights(tr) {
    const h16 = this.heightTex.image.data;
    for (let q = 0; q < h16.length; q++) h16[q] = THREE.DataUtils.toHalfFloat(tr.h[q]);
    this.heightTex.needsUpdate = true;
  }
}
