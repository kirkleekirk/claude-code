// Lighting and meshing for one chunk column, run in the world workers.
//
// The column is lit together with its eight neighbours (light travels at most 15 blocks, so
// the 48 x 48 region holds every source that can reach the middle column), then the middle
// column is turned into quads: faces between solid blocks are dropped, uniformly lit faces
// are merged into larger quads, and every corner carries smooth light and ambient occlusion.
//
// Vertex format (one entry per quad corner):
//   pos  Uint16 x3   position in the column, in 1/16 block
//   uv   Uint16 x2   texture coordinates, in 1/16 repeat
//   data Uint8  x4   [texture layer, normal << 5 | ao << 3, sky light, block light]

import { B, CHUNK, HEIGHT, OPAQUE, LIGHT, RENDER, FACES, TEX, isDoor, DOOR } from './blocks.js';

const RW = 48; // region width
const RA = RW * RW; // one horizontal layer of the region
const RSIZE = RA * HEIGHT;

// neighbour offsets in the region for the 6 directions: +x -x +y -y +z -z
const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const DSTEP = [1, -1, RA, -RA, RW, -RW];

class Out {
  constructor() {
    this.cap = 1 << 14;
    this.pos = new Uint16Array(this.cap * 3);
    this.uv = new Uint16Array(this.cap * 2);
    this.data = new Uint8Array(this.cap * 4);
    this.n = 0; // vertices
  }
  reset() { this.n = 0; }
  grow() {
    this.cap *= 2;
    const p = new Uint16Array(this.cap * 3); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(this.cap * 2); u.set(this.uv); this.uv = u;
    const d = new Uint8Array(this.cap * 4); d.set(this.data); this.data = d;
  }
  vert(x, y, z, u, v, tex, nrm, ao, sky, blk) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.data[i * 4] = tex; this.data[i * 4 + 1] = (nrm << 5) | (ao << 3);
    this.data[i * 4 + 2] = sky; this.data[i * 4 + 3] = blk;
  }
  // Pack into transferable arrays with an index buffer (two triangles per quad).
  finish(flips) {
    const n = this.n;
    const quads = n / 4;
    const index = n > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      const b = q * 4, o = q * 6;
      if (flips[q]) {
        index[o] = b + 1; index[o + 1] = b + 2; index[o + 2] = b + 3;
        index[o + 3] = b + 3; index[o + 4] = b; index[o + 5] = b + 1;
      } else {
        index[o] = b; index[o + 1] = b + 1; index[o + 2] = b + 2;
        index[o + 3] = b + 2; index[o + 4] = b + 3; index[o + 5] = b;
      }
    }
    return {
      pos: this.pos.slice(0, n * 3),
      uv: this.uv.slice(0, n * 2),
      data: this.data.slice(0, n * 4),
      index,
      count: n,
    };
  }
}

export class Mesher {
  constructor() {
    this.blocks = new Uint8Array(RSIZE);
    this.sky = new Uint8Array(RSIZE);
    this.blk = new Uint8Array(RSIZE);
    this.queue = new Int32Array(1 << 20);
    this.skyTop = new Int16Array(RA);
    this.outs = { opaque: new Out(), cutout: new Out() };
    this.flips = { opaque: [], cutout: [] };
    this.maskA = new Int32Array(CHUNK * HEIGHT);
    this.maskB = new Int32Array(CHUNK * HEIGHT);
    // opacity to light: opaque blocks stop it, leaves dim it
    this.lightCost = new Uint8Array(256).fill(1);
    for (let i = 0; i < 256; i++) if (OPAQUE[i]) this.lightCost[i] = 16;
    this.lightCost[B.LEAVES] = 2;
    // what occludes for ambient occlusion
    this.occ = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.occ[i] = OPAQUE[i] || i === B.LEAVES ? 1 : 0;
  }

  // cols: 9 column arrays, index (dz + 1) * 3 + (dx + 1); the middle one is meshed.
  build(cols) {
    this.fill(cols);
    this.lightSky();
    this.lightBlocks();
    const res = this.mesh();
    res.light = this.centerLight();
    res.heights = this.heights();
    return res;
  }

  fill(cols) {
    const R = this.blocks;
    for (let c = 0; c < 9; c++) {
      const col = cols[c];
      const ox = (c % 3) * 16, oz = Math.floor(c / 3) * 16;
      if (!col) {
        // a missing neighbour (the edge of the world that's loaded) is treated as solid rock
        for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) R.fill(B.ROCK, y * RA + (oz + z) * RW + ox, y * RA + (oz + z) * RW + ox + 16);
        continue;
      }
      for (let y = 0; y < HEIGHT; y++) {
        for (let z = 0; z < 16; z++) {
          const src = (y << 8) | (z << 4);
          R.set(col.subarray(src, src + 16), y * RA + (oz + z) * RW + ox);
        }
      }
    }
  }

  lightSky() {
    const R = this.blocks, S = this.sky, cost = this.lightCost, top = this.skyTop;
    S.fill(0);
    // straight down from the sky
    for (let c = 0; c < RA; c++) {
      let l = 15, y = HEIGHT - 1, t = HEIGHT;
      for (; y >= 0; y--) {
        const id = R[y * RA + c];
        if (OPAQUE[id]) break;
        if (cost[id] > 1) l = Math.max(0, l - cost[id]);
        if (l === 15) t = y;
        S[y * RA + c] = l;
        if (l === 0) break;
      }
      top[c] = t;
    }
    // spread sideways (and under overhangs) from the cells near where the sky stops
    const Q = this.queue, QM = Q.length - 1;
    let head = 0, tail = 0;
    for (let z = 0; z < RW; z++) for (let x = 0; x < RW; x++) {
      const c = z * RW + x;
      let lo = top[c], hi = top[c];
      if (x > 0) { lo = Math.min(lo, top[c - 1]); hi = Math.max(hi, top[c - 1]); }
      if (x < RW - 1) { lo = Math.min(lo, top[c + 1]); hi = Math.max(hi, top[c + 1]); }
      if (z > 0) { lo = Math.min(lo, top[c - RW]); hi = Math.max(hi, top[c - RW]); }
      if (z < RW - 1) { lo = Math.min(lo, top[c + RW]); hi = Math.max(hi, top[c + RW]); }
      lo = Math.max(0, lo - 1); hi = Math.min(HEIGHT - 1, hi + 1);
      for (let y = lo; y <= hi; y++) {
        const i = y * RA + c;
        if (S[i] > 1) { Q[tail] = i; tail = (tail + 1) & QM; }
      }
    }
    this.spread(S, head, tail);
  }

  lightBlocks() {
    const R = this.blocks, L = this.blk, Q = this.queue, QM = Q.length - 1;
    L.fill(0);
    let tail = 0;
    for (let i = 0; i < RSIZE; i++) {
      const e = LIGHT[R[i]];
      if (e) { L[i] = e; Q[tail] = i; tail = (tail + 1) & QM; }
    }
    this.spread(L, 0, tail);
  }

  // Breadth-first flood: every step costs at least one level.
  spread(L, head, tail) {
    const R = this.blocks, Q = this.queue, QM = Q.length - 1, cost = this.lightCost;
    while (head !== tail) {
      const i = Q[head]; head = (head + 1) & QM;
      const l = L[i];
      if (l <= 1) continue;
      const y = (i / RA) | 0;
      const r = i - y * RA;
      const z = (r / RW) | 0;
      const x = r - z * RW;
      for (let d = 0; d < 6; d++) {
        if (d === 0 && x === RW - 1) continue;
        if (d === 1 && x === 0) continue;
        if (d === 2 && y === HEIGHT - 1) continue;
        if (d === 3 && y === 0) continue;
        if (d === 4 && z === RW - 1) continue;
        if (d === 5 && z === 0) continue;
        const j = i + DSTEP[d];
        const c = cost[R[j]];
        if (c >= 16) continue;
        const nl = l - c;
        if (nl > L[j]) { L[j] = nl; Q[tail] = j; tail = (tail + 1) & QM; }
      }
    }
  }

  centerLight() {
    const out = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = y * RA + (z + 16) * RW + x + 16;
      out[x | (z << 4) | (y << 8)] = (this.sky[i] << 4) | this.blk[i];
    }
    return out;
  }

  heights() {
    const out = new Uint8Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let y = HEIGHT - 1;
      for (; y > 0; y--) if (OPAQUE[this.blocks[y * RA + (z + 16) * RW + x + 16]]) break;
      out[x | (z << 4)] = y;
    }
    return out;
  }

  // ---- meshing --------------------------------------------------------------------------------

  mesh() {
    const outs = this.outs;
    outs.opaque.reset(); outs.cutout.reset();
    this.flips.opaque.length = 0; this.flips.cutout.length = 0;
    // which y range has anything to draw
    let ymin = HEIGHT, ymax = -1;
    const R = this.blocks;
    for (let y = 0; y < HEIGHT; y++) {
      let any = false;
      for (let z = 16; z < 32 && !any; z++) {
        const row = y * RA + z * RW + 16;
        for (let x = 0; x < 16; x++) if (RENDER[R[row + x]]) { any = true; break; }
      }
      if (any) { ymin = Math.min(ymin, y); ymax = y; }
    }
    if (ymax >= 0) {
      for (let d = 0; d < 6; d++) this.meshDir(d, ymin, ymax);
      this.torches(ymin, ymax);
      this.doors(ymin, ymax);
    }
    return {
      opaque: outs.opaque.finish(this.flips.opaque),
      cutout: outs.cutout.finish(this.flips.cutout),
      ymin, ymax,
    };
  }

  // Light and occlusion at the four corners of the face of block i facing direction d.
  // Returns packed: for each corner (in quad order) ao (2 bits), sky and block light (8 bits each).
  corners(i, d, out) {
    const R = this.blocks, S = this.sky, L = this.blk, occ = this.occ;
    const f = i + DSTEP[d]; // the cell in front of the face
    // tangent steps (t1, t2) matching the corner order used by quad()
    const T = TANGENTS[d];
    for (let k = 0; k < 4; k++) {
      const s1 = f + T[k][0], s2 = f + T[k][1], cc = f + T[k][0] + T[k][1];
      const o1 = occ[R[s1]], o2 = occ[R[s2]], oc = occ[R[cc]];
      const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      // smooth light: the average over the cells around the corner that light can be in
      let ss = S[f], sb = L[f], n = 1;
      if (!OPAQUE[R[s1]]) { ss += S[s1]; sb += L[s1]; n++; }
      if (!OPAQUE[R[s2]]) { ss += S[s2]; sb += L[s2]; n++; }
      if (!(o1 && o2) && !OPAQUE[R[cc]]) { ss += S[cc]; sb += L[cc]; n++; }
      out[k * 3] = ao;
      out[k * 3 + 1] = Math.min(255, Math.round((ss / n) * 17));
      out[k * 3 + 2] = Math.min(255, Math.round((sb / n) * 17));
    }
  }

  meshDir(d, ymin, ymax) {
    const R = this.blocks;
    const axis = d >> 1; // 0 x, 1 y, 2 z
    const step = DSTEP[d];
    const cor = new Int32Array(12);
    const mA = this.maskA, mB = this.maskB;
    // slice layout: for axis x: u = z (16), v = y; axis z: u = x (16), v = y; axis y: u = x, v = z
    const nSlices = axis === 1 ? (ymax - ymin + 1) : 16;
    const W = 16, H = axis === 1 ? 16 : (ymax - ymin + 1);
    for (let s = 0; s < nSlices; s++) {
      // build the mask
      let any = false;
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        let x, y, z;
        if (axis === 0) { x = s; z = u; y = ymin + v; }
        else if (axis === 2) { z = s; x = u; y = ymin + v; }
        else { y = ymin + s; x = u; z = v; }
        const i = y * RA + (z + 16) * RW + x + 16;
        const m = v * W + u;
        mA[m] = -1;
        const id = R[i];
        const rm = RENDER[id];
        if (rm !== 1 && rm !== 2) continue;
        if ((d === 2 && y === HEIGHT - 1) || (d === 3 && y === 0)) {
          if (d === 3) continue;
        }
        const nb = (d === 2 && y === HEIGHT - 1) ? B.AIR : R[i + step];
        if (OPAQUE[nb]) continue;
        if (rm === 2 && nb === id) continue; // leaves next to leaves, glass next to glass
        if (rm === 1 && RENDER[nb] === 1) continue;
        const tex = FACES[id * 6 + d];
        this.corners(i, d, cor);
        const uniform = cor[0] === cor[3] && cor[0] === cor[6] && cor[0] === cor[9]
          && cor[1] === cor[4] && cor[1] === cor[7] && cor[1] === cor[10]
          && cor[2] === cor[5] && cor[2] === cor[8] && cor[2] === cor[11];
        if (!uniform) {
          this.quad(rm === 2 ? 'cutout' : 'opaque', d, x, y, z, 1, 1, tex, cor);
          continue;
        }
        mA[m] = tex | (cor[0] << 8) | (rm << 10);
        mB[m] = (cor[1] << 8) | cor[2];
        any = true;
      }
      if (!any) continue;
      // greedy merge of the uniform faces
      for (let v = 0; v < H; v++) {
        for (let u = 0; u < W;) {
          const m = v * W + u;
          const a = mA[m];
          if (a < 0) { u++; continue; }
          const b = mB[m];
          let w = 1;
          while (u + w < W && mA[m + w] === a && mB[m + w] === b) w++;
          let h = 1;
          outer: while (v + h < H) {
            const row = (v + h) * W + u;
            for (let k = 0; k < w; k++) if (mA[row + k] !== a || mB[row + k] !== b) break outer;
            h++;
          }
          for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mA[(v + hh) * W + u + k] = -1;
          const tex = a & 255, ao = (a >> 8) & 3, rm = (a >> 10) & 3;
          cor[0] = cor[3] = cor[6] = cor[9] = ao;
          cor[1] = cor[4] = cor[7] = cor[10] = (b >> 8) & 255;
          cor[2] = cor[5] = cor[8] = cor[11] = b & 255;
          let x, y, z, du, dv;
          if (axis === 0) { x = s; z = u; y = ymin + v; du = w; dv = h; }
          else if (axis === 2) { z = s; x = u; y = ymin + v; du = w; dv = h; }
          else { y = ymin + s; x = u; z = v; du = w; dv = h; }
          this.quad(rm === 2 ? 'cutout' : 'opaque', d, x, y, z, du, dv, tex, cor);
          u += w;
        }
      }
    }
  }

  // One quad on face d of the box starting at block (x, y, z), du x dv blocks across.
  // du runs along the slice's u axis (z for x faces, x otherwise), dv along v (y for side faces, z for top/bottom).
  quad(pass, d, x, y, z, du, dv, tex, cor) {
    const o = this.outs[pass];
    const S = 16;
    let X0 = x * S, Y0 = y * S, Z0 = z * S;
    const U = du * S, V = dv * S;
    // corner positions (in quad order) and uvs; the order matches TANGENTS
    let p;
    switch (d) {
      case 0: { // +x: corners (z0,y0) (z0,y1) (z1,y1) (z1,y0) at x+1; u runs toward -z
        const X = X0 + S;
        p = [[X, Y0, Z0, U, V], [X, Y0 + V, Z0, U, 0], [X, Y0 + V, Z0 + U, 0, 0], [X, Y0, Z0 + U, 0, V]];
        break;
      }
      case 1: { // -x: u toward +z
        p = [[X0, Y0, Z0, 0, V], [X0, Y0, Z0 + U, U, V], [X0, Y0 + V, Z0 + U, U, 0], [X0, Y0 + V, Z0, 0, 0]];
        break;
      }
      case 2: { // +y
        const Y = Y0 + S;
        p = [[X0, Y, Z0, 0, 0], [X0, Y, Z0 + V, 0, V], [X0 + U, Y, Z0 + V, U, V], [X0 + U, Y, Z0, U, 0]];
        break;
      }
      case 3: { // -y
        p = [[X0, Y0, Z0, 0, 0], [X0 + U, Y0, Z0, U, 0], [X0 + U, Y0, Z0 + V, U, V], [X0, Y0, Z0 + V, 0, V]];
        break;
      }
      case 4: { // +z: u toward +x
        const Z = Z0 + S;
        p = [[X0, Y0, Z, 0, V], [X0 + U, Y0, Z, U, V], [X0 + U, Y0 + V, Z, U, 0], [X0, Y0 + V, Z, 0, 0]];
        break;
      }
      default: { // -z: u toward -x
        p = [[X0, Y0, Z0, U, V], [X0, Y0 + V, Z0, U, 0], [X0 + U, Y0 + V, Z0, 0, 0], [X0 + U, Y0, Z0, 0, V]];
      }
    }
    for (let k = 0; k < 4; k++) {
      const c = p[k];
      o.vert(c[0], c[1], c[2], c[3], c[4], tex, d, cor[k * 3], cor[k * 3 + 1], cor[k * 3 + 2]);
    }
    // turn the quad's diagonal so occlusion interpolates without a crease
    const b0 = (cor[0] + 1) * (cor[1] + 8), b1 = (cor[3] + 1) * (cor[4] + 8), b2 = (cor[6] + 1) * (cor[7] + 8), b3 = (cor[9] + 1) * (cor[10] + 8);
    this.flips[pass].push(b0 + b2 < b1 + b3 ? 1 : 0);
  }

  // Torches: a slim stick with a flame, standing or leaning against a wall.
  torches(ymin, ymax) {
    const R = this.blocks;
    for (let y = ymin; y <= ymax; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = y * RA + (z + 16) * RW + x + 16;
      const id = R[i];
      if (id !== B.TORCH && !(id >= B.TORCH_PX && id <= B.TORCH_NZ)) continue;
      this.torch(x, y, z, id, i);
    }
  }

  torch(x, y, z, id, i) {
    const o = this.outs.cutout;
    const sky = Math.min(255, this.sky[i] * 17), blk = Math.min(255, Math.max(this.blk[i], 13) * 17);
    // the stick: 2/16 wide, 10/16 tall; leaning torches tip toward the wall they hang on
    let lx = 0, lz = 0, by = 0;
    if (id === B.TORCH_PX) { lx = 1; by = 3; } else if (id === B.TORCH_NX) { lx = -1; by = 3; }
    else if (id === B.TORCH_PZ) { lz = 1; by = 3; } else if (id === B.TORCH_NZ) { lz = -1; by = 3; }
    const S = 16;
    const cx = x * S + 8 + lx * 5, cz = z * S + 8 + lz * 5, y0 = y * S + by;
    const h = 10, r = 1;
    const tex = TEX.torch;
    // lean: the top shifts away from the wall
    const tx = -lx * 3, tz = -lz * 3;
    const faces = [
      // +x, -x, +z, -z, top
      [[cx + r, y0, cz + r], [cx + r, y0, cz - r], [cx + r + tx, y0 + h, cz - r + tz], [cx + r + tx, y0 + h, cz + r + tz], 0],
      [[cx - r, y0, cz - r], [cx - r, y0, cz + r], [cx - r + tx, y0 + h, cz + r + tz], [cx - r + tx, y0 + h, cz - r + tz], 1],
      [[cx - r, y0, cz + r], [cx + r, y0, cz + r], [cx + r + tx, y0 + h, cz + r + tz], [cx - r + tx, y0 + h, cz + r + tz], 4],
      [[cx + r, y0, cz - r], [cx - r, y0, cz - r], [cx - r + tx, y0 + h, cz - r + tz], [cx + r + tx, y0 + h, cz - r + tz], 5],
      [[cx - r + tx, y0 + h, cz - r + tz], [cx - r + tx, y0 + h, cz + r + tz], [cx + r + tx, y0 + h, cz + r + tz], [cx + r + tx, y0 + h, cz - r + tz], 2],
    ];
    for (const [a, b, c, dd, nrm] of faces) {
      // the torch texture: stick in the middle columns 7-8, flame at the top
      const top = nrm === 2;
      const u0 = 7, u1 = 9, v0 = top ? 6 : 16, v1 = top ? 8 : 6;
      o.vert(a[0], a[1], a[2], u0, v0, tex, nrm, 3, sky, blk);
      o.vert(b[0], b[1], b[2], u1, v0, tex, nrm, 3, sky, blk);
      o.vert(c[0], c[1], c[2], u1, v1, tex, nrm, 3, sky, blk);
      o.vert(dd[0], dd[1], dd[2], u0, v1, tex, nrm, 3, sky, blk);
      this.flips.cutout.push(0);
    }
  }
}

// Doors: a plank panel 3/16 thick across the middle of the cell when shut, and against its
// hinge side when open, lit by the cell it's in.
Mesher.prototype.doors = function doors(ymin, ymax) {
  const R = this.blocks;
  for (let y = ymin; y <= ymax; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = y * RA + (z + 16) * RW + x + 16;
    if (isDoor(R[i])) this.door(x, y, z, R[i], i);
  }
};

Mesher.prototype.door = function door(x, y, z, id, i) {
  const o = this.outs.cutout, D = DOOR(id);
  const sky = Math.min(255, this.sky[i] * 17), blk = Math.min(255, this.blk[i] * 17);
  const S = 16, T = 3, M0 = (S - T) / 2;
  let a0, a1, b0, b1;
  if (!D.open) [a0, a1, b0, b1] = D.alongX ? [0, S, M0, M0 + T] : [M0, M0 + T, 0, S];
  else [a0, a1, b0, b1] = D.alongX ? [0, T, 0, S] : [0, S, 0, T];
  const X0 = x * S + a0, X1 = x * S + a1, Z0 = z * S + b0, Z1 = z * S + b1, Y0 = y * S, Y1 = y * S + S;
  const tex = FACES[id * 6];
  // each face: its corners (bottom left, bottom right, top right, top left) and the texture's
  // width across it (the panel's faces take it all; its edges a strip)
  const faces = [
    [[X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1], 0, Z1 - Z0],
    [[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0], 1, Z1 - Z0],
    [[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1], 4, X1 - X0],
    [[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0], 5, X1 - X0],
    [[X0, Y1, Z0], [X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], 2, 0],
    [[X0, Y0, Z1], [X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], 3, 0],
  ];
  for (const [a, b, c, d, nrm, w] of faces) {
    // the tops and bottoms are the panel's edge: a strip of the frame
    const u0 = 0, u1 = w || T, v0 = nrm >= 2 && nrm <= 3 ? 1 : 16, v1 = nrm >= 2 && nrm <= 3 ? 0 : 0;
    o.vert(a[0], a[1], a[2], u0, v0, tex, nrm, 3, sky, blk);
    o.vert(b[0], b[1], b[2], u1, v0, tex, nrm, 3, sky, blk);
    o.vert(c[0], c[1], c[2], u1, v1, tex, nrm, 3, sky, blk);
    o.vert(d[0], d[1], d[2], u0, v1, tex, nrm, 3, sky, blk);
    this.flips.cutout.push(0);
  }
};

// For each direction, the region steps (t1, t2) from the cell in front of the face to the
// cells that touch each of the quad's four corners, in the corner order quad() emits.
const TANGENTS = (() => {
  const X = 1, Y = RA, Z = RW;
  return [
    // +x: corners (y0,z0) (y1,z0) (y1,z1) (y0,z1)
    [[-Y, -Z], [Y, -Z], [Y, Z], [-Y, Z]],
    // -x: (y0,z0) (y0,z1) (y1,z1) (y1,z0)
    [[-Y, -Z], [-Y, Z], [Y, Z], [Y, -Z]],
    // +y: (x0,z0) (x0,z1) (x1,z1) (x1,z0)
    [[-X, -Z], [-X, Z], [X, Z], [X, -Z]],
    // -y: (x0,z0) (x1,z0) (x1,z1) (x0,z1)
    [[-X, -Z], [X, -Z], [X, Z], [-X, Z]],
    // +z: (x0,y0) (x1,y0) (x1,y1) (x0,y1)
    [[-X, -Y], [X, -Y], [X, Y], [-X, Y]],
    // -z: (x0,y0) (x0,y1) (x1,y1) (x1,y0)
    [[-X, -Y], [-X, Y], [X, Y], [X, -Y]],
  ];
})();
