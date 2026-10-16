import * as THREE from '../../vendor/three.module.min.js';
import { cliffZ, PORTAL_MAIN, PORTAL_EXIT, PLAZA_Y } from './eh_shape.js';
import { vnoise3 } from './cave.js';
import { caveRockMaterial } from './cavemat.js';
import { smoothstep, clamp } from '../util.js';

// A skin of rock over the cliff behind the plaza. The heightfield alone makes a smooth wall;
// this lays a displaced sheet just in front of it: bedding ledges, joints, bulges, water
// streaks under the ledges and moss on top of them. Same triplanar rock as inside the caves.
export function buildCliff(S, holes) {
  const { B, ctx } = S;
  const T = ctx.terrain;
  const fine = (x, z) => T.heightFn(x, z);
  const coarse = (x, z) => T.surfaceAt(x, z);
  // the most outward z (toward the plaza) at which the surface reaches height y
  const solve = (fn, x, y) => {
    const cz = cliffZ(x);
    let lo = cz - 16; // well inside the mountain: above y
    let hi = cz + 2; // out on the plaza: below y
    if (fn(x, hi) >= y) return hi;
    if (fn(x, lo) < y) return lo;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      if (fn(x, m) >= y) lo = m;
      else hi = m;
    }
    return lo;
  };
  const x0 = -60;
  const x1 = 58;
  const dx = 0.7;
  const rows = 34;
  const nx = Math.round((x1 - x0) / dx) + 1;
  const pos = new Float32Array(nx * rows * 3);
  const col = new Float32Array(nx * rows * 3);
  const wet = new Float32Array(nx * rows);
  const keep = new Uint8Array(nx * rows);
  for (let i = 0; i < nx; i++) {
    const x = x0 + i * dx;
    const cz = cliffZ(x);
    const foot = Math.min(fine(x, cz + 1.2), coarse(x, cz + 1.2));
    const topY = fine(x, cz - 5.2);
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      const y = foot - 0.5 + (topY - foot + 0.5) * t;
      const zf = solve(fine, x, y);
      const zc = solve(coarse, x, y);
      let z = Math.max(zf, zc);
      // relief: bedding ledges, joints, bulges; nothing near the very top (it tucks under the slope)
      const n1 = vnoise3(x * 0.11, y * 0.11, 3.1);
      const n2 = vnoise3(x * 0.37 + 5, y * 0.37, 7.7);
      const bed = (y + 1.8 * n1) / 2.6;
      const ledge = smoothstep(0.55, 0.9, bed - Math.floor(bed));
      const joint = Math.pow(1 - Math.abs(Math.sin(x * 0.55 + n1 * 2.4)), 10);
      let d = 0.35 + 0.9 * (0.5 + 0.5 * n1) + 0.75 * ledge + 0.25 * n2 - 0.55 * joint;
      d = Math.max(0.18, d);
      const k = 1 - smoothstep(0.88, 1.0, t);
      z += d * k - (1 - k) * 1.4;
      const o = j * nx + i;
      pos[o * 3] = x + 0.18 * n2;
      pos[o * 3 + 1] = y;
      pos[o * 3 + 2] = z;
      // colour: grey andesite with buff patches, dark streaks under ledges, moss on them
      const tone = 0.5 + 0.5 * vnoise3(x * 0.05, y * 0.08, 1.3);
      let r = 0.27 + 0.1 * tone;
      let g = 0.26 + 0.085 * tone;
      let b = 0.245 + 0.06 * tone;
      // shade the undersides of ledges and the joints (ambient occlusion by hand)
      const under = smoothstep(0.0, 0.25, bed - Math.floor(bed)) * (1 - smoothstep(0.25, 0.5, bed - Math.floor(bed)));
      r *= 1 - 0.35 * under;
      g *= 1 - 0.35 * under;
      b *= 1 - 0.33 * under;
      const streak = smoothstep(0.35, 0.8, vnoise3(x * 0.8, y * 0.05, 9.1)) * (1 - ledge);
      r *= 1 - 0.4 * streak;
      g *= 1 - 0.38 * streak;
      b *= 1 - 0.3 * streak;
      const moss = ledge * smoothstep(0.1, 0.6, vnoise3(x * 0.3, y * 0.3, 4.4));
      r = r * (1 - moss * 0.6) + 0.2 * moss * 0.6;
      g = g * (1 - moss * 0.6) + 0.3 * moss * 0.6;
      b = b * (1 - moss * 0.6) + 0.14 * moss * 0.6;
      col[o * 3] = r * (1 - 0.45 * joint);
      col[o * 3 + 1] = g * (1 - 0.45 * joint);
      col[o * 3 + 2] = b * (1 - 0.45 * joint);
      wet[o] = 0.05 + 0.5 * streak;
      keep[o] = holes(x, y) ? 0 : 1;
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      if (!keep[a] || !keep[a + 1] || !keep[a + nx] || !keep[a + nx + 1]) continue;
      // faces point out toward the plaza (+z)
      idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the same rock as the caves, with bigger features for a 20 m face
  const mat = caveRockMaterial({ scale: 0.16, bump: 1.25, roughness: 0.93 });
  mat.userData.shared = false;
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'cliff';
  B.regionGroup('surface').add(mesh);
  void clamp;
  return mesh;
}

// Where the portal facades stand in front of the cliff (no skin there).
export function cliffHoles(x, y) {
  if (Math.abs(x - PORTAL_MAIN.x) < 6.3 && y < PLAZA_Y + 8.0) return true;
  if (Math.abs(x - PORTAL_EXIT.x) < 4.5 && y < PLAZA_Y + 6.8) return true;
  return false;
}
