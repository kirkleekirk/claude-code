import * as THREE from '../../vendor/three.module.min.js';
import { std } from './materials.js';
import { clamp } from '../util.js';

// Heightfield terrain. Heights are baked into a grid once; queries are bilinear.
export class Terrain {
  constructor({ minX, minZ, size, res, heightFn, colorFn, walkFn, holeFn, chunk, detail }) {
    this.holeFn = holeFn || null;
    this.chunk = chunk || 0;
    // finer render-only patches (cliffs with doorways): [{ x0, z0, x1, z1, res }]
    this.detail = detail || [];
    this.heightFn = heightFn;
    // a CaveField: inside its extent the cave floor replaces the open-air surface
    this.cave = null;
    this.minX = minX;
    this.minZ = minZ;
    this.size = size;
    this.res = res;
    this.n = Math.floor(size / res) + 1;
    this.heights = new Float32Array(this.n * this.n);
    this.walkFn = walkFn;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        this.heights[j * this.n + i] = heightFn(minX + i * res, minZ + j * res);
      }
    }
    this.colorFn = colorFn;
  }

  heightAt(x, z) {
    if (this.cave !== null && this.cave.inExtent(x, z)) return this.cave.floorAt(x, z);
    return this.surfaceAt(x, z);
  }

  // The open-air surface only (over a cave this is the mountain above it).
  surfaceAt(x, z) {
    const fx = (x - this.minX) / this.res;
    const fz = (z - this.minZ) / this.res;
    const n = this.n;
    if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) {
      const i = clamp(Math.round(fx), 0, n - 1);
      const j = clamp(Math.round(fz), 0, n - 1);
      return this.heights[j * n + i];
    }
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h = this.heights;
    const a = h[j * n + i];
    const b = h[j * n + i + 1];
    const c = h[(j + 1) * n + i];
    const d = h[(j + 1) * n + i + 1];
    // match the triangle split used by the mesh (diagonal from a to d)
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.res * 0.5;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // A fine patch of the open-air surface. Its border follows the coarse grid's own (linear)
  // edges so the two meet without cracks.
  _detailMesh(d, mat) {
    const r = d.res;
    const nx = Math.round((d.x1 - d.x0) / r) + 1;
    const nz = Math.round((d.z1 - d.z0) / r) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color();
    const nrm = new THREE.Vector3();
    const e = 0.25;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = d.x0 + i * r;
        const z = d.z0 + j * r;
        const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
        const h = edge ? this.surfaceAt(x, z) : this.heightFn(x, z);
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 7;
        uv[k * 2 + 1] = z / 7;
        nrm.set(this.heightFn(x - e, z) - this.heightFn(x + e, z), 2 * e, this.heightFn(x, z - e) - this.heightFn(x, z + e)).normalize();
        this.colorFn(x, z, h, nrm, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (this.holeFn && this.holeFn(d.x0 + (i + 0.5) * r, d.z0 + (j + 0.5) * r, true)) continue;
        const a = j * nx + i;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain-detail';
    return mesh;
  }

  surfaceNormalAt(x, z, out = new THREE.Vector3()) {
    const e = this.res * 0.5;
    const hl = this.surfaceAt(x - e, z);
    const hr = this.surfaceAt(x + e, z);
    const hd = this.surfaceAt(x, z - e);
    const hu = this.surfaceAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  walkableAt(x, z) {
    return this.walkFn ? this.walkFn(x, z) : true;
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let t = 0;
    let prevT = 0;
    let step = 0.6;
    let prevAbove = oy - this.heightAt(ox, oz);
    if (prevAbove < 0) return null;
    while (t < maxDist) {
      t = Math.min(maxDist, t + step);
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const above = y - this.heightAt(x, z);
      if (above < 0) {
        let a = prevT;
        let b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) * 0.5;
          const hy = oy + dy * m - this.heightAt(ox + dx * m, oz + dz * m);
          if (hy < 0) b = m;
          else a = m;
        }
        const n = this.normalAt(ox + dx * b, oz + dz * b);
        return { dist: b, nx: n.x, ny: n.y, nz: n.z };
      }
      prevT = t;
      // bigger steps when far above the ground
      step = clamp(above * 0.5, 0.4, 4);
      if (t >= maxDist) break;
    }
    return null;
  }

  buildMesh(textures) {
    const n = this.n;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const col = new Float32Array(n * n * 3);
    const nrm = new THREE.Vector3();
    const c = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = this.minX + i * this.res;
        const z = this.minZ + j * this.res;
        pos[k * 3] = x;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 7;
        uv[k * 2 + 1] = z / 7;
        this.surfaceNormalAt(x, z, nrm);
        this.colorFn(x, z, this.heights[k], nrm, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const inDetail = (x, z) => this.detail.some((d) => x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1);
    const quads = (i0, j0, i1, j1) => {
      const out = [];
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const cx = this.minX + (i + 0.5) * this.res;
          const cz = this.minZ + (j + 0.5) * this.res;
          if (inDetail(cx, cz)) continue;
          if (this.holeFn && this.holeFn(cx, cz)) continue;
          const a = j * n + i;
          const b = a + 1;
          const cc = a + n;
          const d = cc + 1;
          out.push(a, cc, b, b, cc, d);
        }
      }
      return out;
    };
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = this.material || std({
      map: textures.ground,
      normalMap: textures.groundNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    });
    if (!this.chunk) {
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(quads(0, 0, n - 1, n - 1)), 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = 'terrain';
      return mesh;
    }
    // chunked: one mesh per tile sharing the vertex buffers, so off-screen tiles are culled
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(quads(0, 0, n - 1, n - 1)), 1));
    geo.computeVertexNormals();
    const group = new THREE.Group();
    group.name = 'terrain';
    for (const d of this.detail) group.add(this._detailMesh(d, mat));
    const step = Math.max(2, Math.round(this.chunk / this.res));
    for (let j0 = 0; j0 < n - 1; j0 += step) {
      for (let i0 = 0; i0 < n - 1; i0 += step) {
        const list = quads(i0, j0, Math.min(n - 1, i0 + step), Math.min(n - 1, j0 + step));
        if (!list.length) continue;
        const g = new THREE.BufferGeometry();
        for (const k of ['position', 'uv', 'color', 'normal']) g.setAttribute(k, geo.attributes[k]);
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(list), 1));
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mat);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    return group;
  }
}
