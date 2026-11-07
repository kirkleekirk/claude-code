// Shared math helpers: seeded RNG, noise, interpolation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// 2D simplex noise (Stefan Gustavson, public domain), seeded permutation.
export function makeNoise2D(seed = 1) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
  const grad3 = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  return function noise(xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = permMod12[ii + perm[jj]] * 2;
      t0 *= t0; n0 = t0 * t0 * (grad3[gi] * x0 + grad3[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = permMod12[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1; n1 = t1 * t1 * (grad3[gi] * x1 + grad3[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = permMod12[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2; n2 = t2 * t2 * (grad3[gi] * x2 + grad3[gi + 1] * y2);
    }
    return 70 * (n0 + n1 + n2); // [-1, 1]
  };
}

export function fbm(noise, x, y, octaves = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * noise(x * f, y * f);
    n += a; a *= gain; f *= lac;
  }
  return s / n;
}

// Distance from point to segment, also returns t.
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  return { d: Math.sqrt(ex * ex + ez * ez), t, cx, cz };
}

export function catmullRom(points, samplesPerSeg = 8, closed = false) {
  const out = [];
  const n = points.length;
  const get = (i) => {
    if (closed) return points[(i + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push([...points[n - 1]]);
  return out;
}

// Resample a polyline at a fixed spacing.
export function resample(poly, step) {
  const out = [poly[0].slice()];
  let carry = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= L) {
      const t = d / L;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      d += step;
    }
    carry = L - (d - step);
  }
  const last = poly[poly.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.3) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}
