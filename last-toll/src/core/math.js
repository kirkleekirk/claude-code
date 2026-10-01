export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Frame-rate independent exponential approach.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Ray vs sphere. Returns distance along the ray or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  let t = tca - thc;
  if (t < 0) t = tca + thc;
  return t < 0 ? -1 : t;
}

// Ray vs capsule (segment a-b with radius r). Direction must be normalized.
export function rayCapsule(o, d, a, b, r) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const oax = o.x - a.x, oay = o.y - a.y, oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-8) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t > 0) return t;
  }
  // caps
  const capT = (cx, cy, cz) => raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, cy, cz, r);
  const t1 = capT(a.x, a.y, a.z);
  const t2 = capT(b.x, b.y, b.z);
  if (t1 < 0) return t2;
  if (t2 < 0) return t1;
  return Math.min(t1, t2);
}

// Closest distance between a ray and a point, plus the ray parameter.
export function rayPointDistance(o, d, p) {
  const vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z;
  const t = vx * d.x + vy * d.y + vz * d.z;
  if (t < 0) return { t, dist: Math.hypot(vx, vy, vz) };
  const cx = o.x + d.x * t - p.x, cy = o.y + d.y * t - p.y, cz = o.z + d.z * t - p.z;
  return { t, dist: Math.hypot(cx, cy, cz) };
}
