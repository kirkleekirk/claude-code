import { Noise, smoothstep, lerp, clamp } from '../core/noise.js';

// Shared helpers -------------------------------------------------------------

function segDist(px, pz, ax, az, bx, bz, out) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  let t = (wx * vx + wz * vz) / (vx * vx + vz * vz);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + vx * t - px, dz = az + vz * t - pz;
  out.t = t;
  return Math.sqrt(dx * dx + dz * dz);
}

// Veyra: a single island continent. Lumen Basin (start, south), Crystal Reach
// (west), Ember Mesa (east) and the Spine (north) blend through warped fields.
export function makeVeyraSampler(def) {
  const n = new Noise(def.seed), n2 = new Noise(def.seed + 101), n3 = new Noise(def.seed + 202);
  const half = def.half;
  const P = def.pois;
  const seg = { t: 0 };

  return function sample(x, z, o) {
    const w1 = n.pnoise(x * 0.0023 + 11.3, z * 0.0023 - 4.7), w2 = n.pnoise(x * 0.0023 - 7.1, z * 0.0023 + 9.2);
    const wx = x + w1 * 95, wz = z + w2 * 95;
    let m = smoothstep(-170, -390, wz);
    let c = smoothstep(-130, -350, wx) * (1 - m);
    let e = smoothstep(130, 350, wx) * (1 - m);
    const b = Math.max(0, 1 - c - e - m);

    const rr = Math.hypot(wx, wz * 0.93) / half;
    const coastN = n2.fbm(x * 0.0045, z * 0.0045, 3) * 0.085;
    const bandW = lerp(0.19, 0.075, Math.max(m, e * 0.6));
    const island = 1 - smoothstep(0.71 + coastN, 0.71 + coastN + bandW, rr);

    let h = 0;
    let path = 0;
    if (island > 0.0005) {
      if (b > 0.001) {
        let hb = 7.5 + 9 * n.fbm(x / 170, z / 170, 4) + 1.8 * n2.fbm(x / 34, z / 34, 3);
        const dl = Math.hypot(wx - 70, (wz - 385) * 1.12);
        hb -= 25 * (1 - smoothstep(26, 140, dl));
        h += b * hb;
      }
      if (c > 0.001) {
        let hc = 10 + 11 * n.fbm(x / 150 + 40, z / 150, 4) + 10 * n2.ridged(x / 78, z / 78, 3);
        const pit = smoothstep(0.5, 0.76, n3.pnoise(x / 88 + 7, z / 88 - 3) * 0.5 + 0.5);
        hc -= pit * 20;
        h += c * hc;
      }
      if (e > 0.001) {
        const p = n.fbm(x / 280 + 3.1, z / 280 - 8.2, 4) * 0.5 + 0.5;
        let raw = Math.max(0, (p - 0.3) * 200);
        const T = 26, t = raw / T, fl = Math.floor(t), fr = t - fl;
        let he = (fl + smoothstep(0.56, 0.9, fr)) * T + fr * 3.5;
        he += 6 + 2.4 * n2.fbm(x / 42, z / 42, 3);
        const cn = Math.abs(n3.pnoise(x / 230 + 40.5, z / 230 + 17.2));
        const cv = smoothstep(0.012, 0.085, cn);
        he = lerp(4 + 1.5 * n2.pnoise(x / 30, z / 30), he, cv);
        const spMask = smoothstep(0.05, 0.45, n3.pnoise(x / 160 - 20, z / 160 + 60));
        he += Math.pow(Math.max(0, n2.pnoise(x / 17, z / 17) - 0.34) / 0.66, 1.6) * spMask * 95 * cv;
        h += e * he;
      }
      if (m > 0.001) {
        const er = n.erosion(x / 460 + 2.3, z / 460 + 7.7, 9);
        const hm = 12 + er * 150 + n2.ridged(x / 150 + 9, z / 150, 4) * 75;
        h += m * hm;
      }
      // fine relief everywhere
      h += n3.fbm(x / 11, z / 11, 2) * 0.35;
    }
    const seabed = -34 + 7 * n3.pnoise(x / 120, z / 120);
    const isl = island * island * (3 - 2 * island);
    h = lerp(seabed, h, isl);
    // offshore sea stacks ring the coast
    const band = smoothstep(0.0, 0.25, island) * (1 - smoothstep(0.25, 0.6, island));
    if (band > 0.001) {
      const st = Math.pow(Math.max(0, n2.pnoise(x / 33 + 3, z / 33 - 8)), 2.6) * 130 * band;
      h += st * (0.4 + 0.6 * Math.max(m, e));
    }

    // --- authored features --------------------------------------------------
    // Pilgrim's Stair: a walkable ramp from the basin up to the Spire plateau.
    for (let i = 0; i < def.paths.length; i++) {
      const pa = def.paths[i];
      for (let k = 0; k < pa.pts.length - 1; k++) {
        const A = pa.pts[k], B = pa.pts[k + 1];
        const wob = n2.pnoise(x / 60 + i * 9, z / 60) * 10;
        const d = segDist(x + wob, z - wob, A[0], A[1], B[0], B[1], seg);
        if (d < pa.outer) {
          const target = lerp(A[2], B[2], seg.t) + n3.pnoise(x / 14, z / 14) * 0.6;
          const k2 = 1 - smoothstep(pa.inner, pa.outer, d);
          h = lerp(h, target, k2);
          path = Math.max(path, 1 - smoothstep(pa.inner * 0.5, pa.inner * 1.3, d));
        }
      }
    }
    for (const key in P) {
      const s = P[key];
      if (s.flat === undefined) continue;
      let d = Math.hypot(x - s.x, z - s.z);
      if (s.stack) d += n2.pnoise(x / 23 + 5, z / 23) * 9 + n3.pnoise(x / 7, z / 7) * 2.5;
      if (d < s.r * 1.9) {
        const k2 = 1 - smoothstep(s.r, s.r * 1.9, d);
        const top = s.flat + n3.pnoise(x / 9, z / 9) * 0.25;
        // stacks rise as sheer-sided towers; ordinary sites just level the ground
        h = s.stack ? Math.max(h, lerp(-40, top, smoothstep(0.0, 0.42, k2))) : lerp(h, top, k2);
        if (!s.stack) path = Math.max(path, (1 - smoothstep(s.r * 0.5, s.r, d)) * (s.mark || 0));
      }
    }
    o.h = h; o.c = c * isl; o.e = e * isl; o.m = m * isl; o.a = path;
    return o;
  };
}

// Korr: an airless mining moon. Crater fields, shattered ridges, slag pools.
export function makeKorrSampler(def) {
  const n = new Noise(def.seed), n2 = new Noise(def.seed + 77), n3 = new Noise(def.seed + 154);
  const half = def.half;
  const P = def.pois;
  // deterministic crater set
  const craters = [];
  let s = def.seed * 7919;
  const rnd = () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296; };
  for (let i = 0; i < 70; i++) {
    const big = i < 9;
    craters.push({ x: (rnd() * 2 - 1) * half * 0.92, z: (rnd() * 2 - 1) * half * 0.92, r: big ? 50 + rnd() * 70 : 9 + rnd() * 30, d: big ? 0.3 : 0.42 });
  }
  return function sample(x, z, o) {
    const w1 = n.pnoise(x * 0.004 + 3.3, z * 0.004 - 1.7) * 40, w2 = n.pnoise(x * 0.004 - 9.1, z * 0.004 + 4.2) * 40;
    const wx = x + w1, wz = z + w2;
    const hi = smoothstep(0.42, 0.7, n.fbm(wx / 330 + 5, wz / 330, 3) * 0.5 + 0.5);
    let h = 26 + 16 * n.fbm(wx / 210, wz / 210, 4) + 3 * n2.fbm(x / 30, z / 30, 3);
    h += hi * (20 + 95 * n2.ridged(wx / 190 + 2, wz / 190 - 4, 5));
    const rift = Math.abs(n3.pnoise(wx / 260 + 13.7, wz / 260 + 2.9));
    const riftV = 1 - smoothstep(0.0, 0.07, rift);
    h = lerp(h, -9, riftV * (1 - hi * 0.6));
    let rim = 0;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const dx = wx - c.x, dz = wz - c.z;
      const d2 = dx * dx + dz * dz;
      const R = c.r * 1.6;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) / c.r;
        const bowl = d < 1 ? (d * d - 1) * c.r * c.d : 0;
        const lip = Math.exp(-(d - 1) * (d - 1) * 14) * c.r * 0.11;
        h += bowl + lip;
        rim = Math.max(rim, Math.exp(-(d - 1) * (d - 1) * 20));
      }
    }
    h += n3.fbm(x / 9, z / 9, 2) * 0.5;
    const edge = smoothstep(0.86, 1.0, Math.max(Math.abs(x), Math.abs(z)) / half);
    h += edge * 60;
    let path = 0;
    for (const key in P) {
      const sdef = P[key];
      if (sdef.flat === undefined) continue;
      const d = Math.hypot(x - sdef.x, z - sdef.z);
      if (d < sdef.r * 1.9) {
        const k2 = 1 - smoothstep(sdef.r, sdef.r * 1.9, d);
        h = lerp(h, sdef.flat, k2);
        path = Math.max(path, (1 - smoothstep(sdef.r * 0.5, sdef.r, d)) * (sdef.mark || 0));
      }
    }
    const ore = smoothstep(0.5, 0.75, n2.fbm(x / 120 + 31, z / 120 - 17, 3) * 0.5 + 0.5);
    o.h = h; o.c = clamp(ore, 0, 1); o.e = clamp(rim, 0, 1); o.m = clamp(hi, 0, 1); o.a = path;
    return o;
  };
}

function boxBlur(src, N, r, tmp, dst) {
  const inv = 1 / (2 * r + 1);
  for (let z = 0; z < N; z++) {
    let acc = 0; const row = z * N;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, N - 1)];
    for (let x = 0; x < N; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + clamp(x + r + 1, 0, N - 1)] - src[row + clamp(x - r, 0, N - 1)];
    }
  }
  for (let x = 0; x < N; x++) {
    let acc = 0;
    for (let z = -r; z <= r; z++) acc += tmp[clamp(z, 0, N - 1) * N + x];
    for (let z = 0; z < N; z++) {
      dst[z * N + x] = acc * inv;
      acc += tmp[clamp(z + r + 1, 0, N - 1) * N + x] - tmp[clamp(z - r, 0, N - 1) * N + x];
    }
  }
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

// Bake the heightfield plus derived maps (normals, occlusion, biome weights).
export async function generateWorld(def, onProgress) {
  const N = def.N, cell = def.cell, half = def.half;
  const sampler = def.kind === 'korr' ? makeKorrSampler(def) : makeVeyraSampler(def);
  const heights = new Float32Array(N * N);
  const splat = new Uint8Array(N * N * 4);
  const o = { h: 0, c: 0, e: 0, m: 0, a: 0 };
  let last = performance.now();
  for (let iz = 0; iz < N; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < N; ix++) {
      const x = -half + ix * cell;
      sampler(x, z, o);
      const i = iz * N + ix;
      heights[i] = o.h;
      splat[i * 4] = o.c * 255; splat[i * 4 + 1] = o.e * 255; splat[i * 4 + 2] = o.m * 255; splat[i * 4 + 3] = o.a * 255;
    }
    if ((iz & 15) === 0 && performance.now() - last > 40) {
      if (onProgress) onProgress((iz / N) * 0.85);
      await nextFrame();
      last = performance.now();
    }
  }
  const tmp = new Float32Array(N * N), b1 = new Float32Array(N * N), b2 = new Float32Array(N * N);
  boxBlur(heights, N, 4, tmp, b1);
  boxBlur(heights, N, 16, tmp, b2);
  if (onProgress) onProgress(0.92);
  await nextFrame();
  const norm = new Uint8Array(N * N * 4);
  let minH = 1e9, maxH = -1e9;
  for (let iz = 0; iz < N; iz++) {
    const zu = iz > 0 ? iz - 1 : iz, zd = iz < N - 1 ? iz + 1 : iz;
    for (let ix = 0; ix < N; ix++) {
      const xl = ix > 0 ? ix - 1 : ix, xr = ix < N - 1 ? ix + 1 : ix;
      const i = iz * N + ix;
      const h = heights[i];
      if (h < minH) minH = h; if (h > maxH) maxH = h;
      const dx = (heights[iz * N + xl] - heights[iz * N + xr]) / ((xr - xl) * cell);
      const dz = (heights[zu * N + ix] - heights[zd * N + ix]) / ((zd - zu) * cell);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      const c1 = b1[i] - h, c2 = b2[i] - h;
      const ao = clamp(1 - Math.max(0, c1) * 0.16 - Math.max(0, c2) * 0.035, 0.25, 1);
      const curv = clamp(0.5 - c1 * 0.12, 0, 1);
      norm[i * 4] = (dx * il * 0.5 + 0.5) * 255;
      norm[i * 4 + 1] = (dz * il * 0.5 + 0.5) * 255;
      norm[i * 4 + 2] = ao * 255;
      norm[i * 4 + 3] = curv * 255;
    }
  }
  if (onProgress) onProgress(1);
  return { def, N, cell, half, size: half * 2, heights, splat, norm, minH, maxH, sea: def.sea };
}
