// Door leaves for every building, drawn as a handful of InstancedMeshes
// (one per leaf type) instead of one mesh per door. Each leaf geometry is
// built at unit width/height and scaled per instance.
import * as THREE from 'three';
import { GeoBuilder, rgb, mulc } from '../geom.js';
import { materialForBucket } from '../atlas.js';

const T = 0.05; // leaf thickness
function leafGeo(kind, hingeLow) {
  // unit leaf: x in [0,1] (or [-1,0] when hinged high), y in [0,1]
  const b = new GeoBuilder([0, 0, 0]);
  const x0 = hingeLow ? 0.003 : -1.003, x1 = x0 + 1;
  const W = (k) => x0 + k; // fraction across from the low side
  if (kind === 'panel') {
    b.box('plain:paint', x0, 0.002, -T / 2, x1, 1, T / 2, [1, 1, 1]);
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? T / 2 : -T / 2 - 0.012, z1 = s > 0 ? T / 2 + 0.012 : -T / 2;
      for (const [a0, a1, b0, b1] of [[0.13, 0.46, 0.07, 0.42], [0.54, 0.87, 0.07, 0.42], [0.13, 0.46, 0.5, 0.93], [0.54, 0.87, 0.5, 0.93]]) {
        b.box('plain:paint', W(a0), b0, z0, W(a1), b1, z1, [0.86, 0.86, 0.86]);
      }
    }
  } else if (kind === 'knob') {
    const kx = hingeLow ? x1 - 0.09 : x0 + 0.09;
    for (const s of [-1, 1]) {
      const kz = s * (T / 2 + 0.03);
      b.box('plain:chrome', kx - 0.03, 0.42, Math.min(kz, s * T / 2) - 0.01, kx + 0.03, 0.45, Math.max(kz, s * T / 2) + 0.01, rgb('#d8c070'));
    }
  } else if (kind === 'barnBoards') {
    b.box('boardBatten', x0, 0.002, -T / 2, x1, 1, T / 2, [1, 1, 1]);
  } else if (kind === 'barnTrim') {
    const fr = 0.055, frH = 0.045;
    for (const s of [-1, 1]) {
      const z = s * (T / 2 + 0.015);
      const zz0 = Math.min(z, s * T / 2), zz1 = Math.max(z, s * T / 2);
      const c = rgb('#f1eee6');
      b.box('plain:paint', x0, 0.002, zz0, x1, frH, zz1, c);
      b.box('plain:paint', x0, 1 - frH, zz0, x1, 1, zz1, c);
      b.box('plain:paint', x0, 0.5 - frH / 2, zz0, x1, 0.5 + frH / 2, zz1, c);
      b.box('plain:paint', x0, frH, zz0, x0 + fr, 1 - frH, zz1, c);
      b.box('plain:paint', x1 - fr, frH, zz0, x1, 1 - frH, zz1, c);
      for (const [ya, yb] of [[frH, 0.5 - frH / 2], [0.5 + frH / 2, 1 - frH]]) {
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const ta = i / steps, tb = (i + 1) / steps;
          const xa = x0 + fr + (1 - 2 * fr) * ta, xb = x0 + fr + (1 - 2 * fr) * tb;
          const y0 = ya + (yb - ya - 0.05) * ta, y1 = ya + (yb - ya - 0.05) * tb + 0.05;
          b.box('plain:paint', xa, y0, zz0, xb, y1, zz1, c);
        }
      }
    }
  } else if (kind === 'glassFrame') {
    const c = rgb('#2b2f33'), f = 0.09, fv = 0.04;
    b.box('plain:metal', x0, 0.002, -T / 2, x1, fv * 1.4, T / 2, c);
    b.box('plain:metal', x0, 1 - fv, -T / 2, x1, 1, T / 2, c);
    b.box('plain:metal', x0, fv * 1.4, -T / 2, x0 + f, 1 - fv, T / 2, c);
    b.box('plain:metal', x1 - f, fv * 1.4, -T / 2, x1, 1 - fv, T / 2, c);
    b.box('plain:chrome', x0 + f, 0.42, -T / 2 - 0.012, x1 - f, 0.45, T / 2 + 0.012, mulc(c, 2.2));
  } else if (kind === 'glassPane') {
    const f = 0.09, fv = 0.04;
    b.quad('glass', [x0 + f, fv * 1.4, 0], [x1 - f, fv * 1.4, 0], [x1 - f, 1 - fv, 0], [x0 + f, 1 - fv, 0], [1, 1, 1]);
  }
  const g = b.build();
  return g.get('opaque') || g.get('glass');
}

const KINDS = { panel: ['panel', 'knob'], barn: ['barnBoards', 'barnTrim'], glass: ['glassFrame', 'glassPane'] };

export class DoorPool {
  constructor(scene, capacity = 400) {
    this.scene = scene;
    this.cap = capacity;
    this.meshes = new Map(); // `${kind}:${L|R}` -> {mesh, free:[]}
    this.m4 = new THREE.Matrix4();
  }
  pool(kind, hingeLow) {
    const key = kind + (hingeLow ? 'L' : 'R');
    let p = this.meshes.get(key);
    if (!p) {
      const geo = leafGeo(kind, hingeLow);
      const mat = kind === 'glassPane' ? materialForBucket('glass') : materialForBucket('opaque');
      const mesh = new THREE.InstancedMesh(geo, mat, this.cap);
      mesh.castShadow = kind !== 'glassPane';
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      if (kind === 'panel' || kind === 'barnBoards') mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3);
      if (kind === 'glassPane') mesh.renderOrder = 2;
      this.scene.add(mesh);
      p = { mesh, free: [], used: 0 };
      this.meshes.set(key, p);
    }
    return p;
  }
  alloc(door) {
    const d = door.def;
    const kinds = KINDS[d.barn ? 'barn' : d.glass ? 'glass' : 'panel'];
    door.slots = kinds.map((k) => {
      const p = this.pool(k, d.hingeLow);
      let i = p.free.length ? p.free.pop() : p.used++;
      if (i >= this.cap) { console.warn('door pool full'); i = this.cap - 1; }
      p.mesh.count = Math.max(p.mesh.count, i + 1);
      if (p.mesh.instanceColor) { p.mesh.setColorAt(i, door.color); p.mesh.instanceColor.needsUpdate = true; }
      return { p, i };
    });
    this.place(door);
  }
  place(door) {
    const s = door.structure, d = door.def;
    const m = this.m4;
    m.makeRotationY(door.baseYaw + door.angle);
    m.scale(new THREE.Vector3(d.width - 0.01, d.height - 0.01, 1));
    m.setPosition(s.ox + d.hinge[0], s.oy + d.hinge[1], s.oz + d.hinge[2]);
    for (const { p, i } of door.slots || []) { p.mesh.setMatrixAt(i, m); p.mesh.instanceMatrix.needsUpdate = true; }
  }
  free(door) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { p, i } of door.slots || []) { p.mesh.setMatrixAt(i, zero); p.mesh.instanceMatrix.needsUpdate = true; p.free.push(i); }
    door.slots = null;
  }
}

let current = null;
export function setDoorPool(p) { current = p; }
export function doorPool() { return current; }
