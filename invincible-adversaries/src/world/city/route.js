import { ROUTE, CHECKPOINTS } from './layout.js';

// The cart's way as a dense polyline: the plan's waypoints with their corners rounded off (tight
// in the station, wide out in the crater). The crater's road is graded along the same line.

/** quadratic arcs in place of the corners of [x, z] waypoints; r: radius at each waypoint */
function fillet(pts, radius) {
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i], [ax, az] = pts[i - 1], [bx, bz] = pts[i + 1];
    const l0 = Math.hypot(px - ax, pz - az), l1 = Math.hypot(bx - px, bz - pz);
    const d0 = [(px - ax) / l0, (pz - az) / l0], d1 = [(bx - px) / l1, (bz - pz) / l1];
    const th = Math.acos(Math.max(-1, Math.min(1, d0[0] * d1[0] + d0[1] * d1[1])));
    if (th < 0.02) { out.push([px, pz]); continue; }
    const t = Math.min(radius(i) * Math.tan(th / 2), l0 * 0.45, l1 * 0.45);
    const A = [px - d0[0] * t, pz - d0[1] * t], B = [px + d1[0] * t, pz + d1[1] * t];
    const n = Math.max(3, Math.ceil(th * (t / Math.tan(th / 2)) / 0.5));
    for (let k = 0; k <= n; k++) {
      const u = k / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      out.push([A[0] * a + px * b + B[0] * c, A[1] * a + pz * b + B[1] * c]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** the path: pts [[x, z]...] every 0.5 m, cumulative distance s[], total length, checkpoint distances */
export function buildPath(step = 0.5) {
  const B = CHECKPOINTS[1];
  const coarse = fillet(ROUTE, (i) => (i === 2 ? 8 : i < B ? 6 : i === B ? 9 : 14));
  const pts = [], s = [];
  let acc = 0;
  for (let i = 0; i < coarse.length - 1; i++) {
    const [ax, az] = coarse[i], [bx, bz] = coarse[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) { pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); s.push(acc + L * k / n); }
    acc += L;
  }
  pts.push(coarse[coarse.length - 1].slice()); s.push(acc);
  // checkpoints: the nearest path point to each checkpoint waypoint
  const near = ([x, z]) => { let bi = 0, bd = Infinity; pts.forEach(([px, pz], i) => { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return s[bi]; };
  const cps = CHECKPOINTS.map((i) => (i === ROUTE.length - 1 ? acc : near(ROUTE[i])));
  return { pts, s, len: acc, cps, bIndex: s.findIndex((v) => v >= cps[1]) };
}

/** position and heading at distance d along the path */
export function pathAt(path, d) {
  const { pts, s } = path;
  d = Math.max(0, Math.min(path.len, d));
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
  const t = s[hi] > s[lo] ? (d - s[lo]) / (s[hi] - s[lo]) : 0;
  const [ax, az] = pts[lo], [bx, bz] = pts[hi];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: bx - ax, dz: bz - az };
}
