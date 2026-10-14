import * as THREE from '../../vendor/three.module.min.js';
import { std } from './materials.js';
import { clamp } from '../util.js';

// Heightfield terrain. Heights are baked into a grid once; queries are bilinear.
export class Terrain {
  constructor({ minX, minZ, size, res, heightFn, colorFn, walkFn }) {
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
        this.normalAt(x, z, nrm);
        this.colorFn(x, z, this.heights[k], nrm, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let o = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = a + 1;
        const cc = a + n;
        const d = cc + 1;
        idx[o++] = a;
        idx[o++] = cc;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = cc;
        idx[o++] = d;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = std({
      map: textures.ground,
      normalMap: textures.groundNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}
