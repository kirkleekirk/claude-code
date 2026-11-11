import * as THREE from 'three';
import { Geo, M, tubeGeo, bladeGeo, temp } from '../gfx/geo.js';
import { mulberry32 } from '../core/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, t) => a + (b - a) * t;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// --- Crystals -----------------------------------------------------------------
// Hexagonal shards with pointed tips; brightness and glow climb toward the tip.
export function crystalCluster(seed, opts = {}) {
  const r = mulberry32(seed), g = new Geo();
  const n = opts.count ?? 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const h = main ? 1 : 0.26 + r() * 0.56;
    const rad = h * (0.1 + r() * 0.05) * (opts.fat ?? 1);
    const tilt = main ? r() * 0.14 : 0.24 + r() * 0.62;
    const az = r() * Math.PI * 2;
    const off = main ? 0 : 0.06 + r() * 0.2;
    const m = M.trs(Math.cos(az) * off, -0.06, Math.sin(az) * off, tilt, Math.PI / 2 - az, 0);
    const spin = M.trs(0, 0, 0, 0, r() * 3, 0);
    const bodyH = h * 0.78, tipH = h * 0.22;
    const fn = (p, nn, o) => {
      const t = sat(p.y / h);
      o[0] = mix(0.02, 0.16, t * t); o[1] = mix(0.3, 0.95, t); o[2] = mix(0.4, 0.86, t);
      o[3] = 0.3 + 0.7 * t * t;
    };
    const body = temp(new THREE.CylinderGeometry(rad * 0.8, rad, bodyH, 6, 1, true).translate(0, bodyH / 2, 0));
    const tip = temp(new THREE.ConeGeometry(rad * 0.8, tipH, 6, 1, true).translate(0, bodyH + tipH / 2, 0));
    g.add(body, m.clone().multiply(spin), fn, true);
    g.add(tip, m.clone().multiply(spin), fn, true);
  }
  return g.build();
}

// --- Stalk pods: striped stalks carrying ribbed, softly glowing bulbs --------------
export function stalkPod(seed) {
  const r = mulberry32(seed), g = new Geo();
  const n = 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const az = r() * 6.283, H = 1.3 + r() * 1.2, lean = 0.25 + r() * 0.45;
    const dx = Math.cos(az), dz = Math.sin(az);
    const ox = dx * 0.08, oz = dz * 0.08;
    const pts = [], rad = [];
    const segs = 7;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const bend = Math.sin(t * Math.PI * 0.9) * lean * 0.6 + t * t * lean * 0.5;
      pts.push(V(ox + dx * bend, t * H - 0.1, oz + dz * bend));
      rad.push(mix(0.042, 0.022, t));
    }
    g.add(tubeGeo(pts, rad, 5, false), null, (p, nn, o) => {
      const t = sat((p.y + 0.1) / H);
      const band = Math.sin(p.y * 26) > 0 ? 1 : 0;
      o[0] = band ? 0.36 : 0.17; o[1] = band ? 0.13 : 0.2; o[2] = band ? 0.07 : 0.08;
      o[4] = t * t;
    });
    const top = pts[segs];
    const br = 0.13 + r() * 0.07;
    const bm = M.trs(top.x, top.y + br * 0.9, top.z, lean * 0.4 * dz, 0, -lean * 0.4 * dx, br, br * 1.4, br);
    g.add(temp(new THREE.SphereGeometry(1, 10, 7)), bm, (p, nn, o) => {
      const stripe = Math.sin(Math.atan2(p.z, p.x) * 5) > 0.1 ? 1 : 0;
      const cap = sat((p.y - 0.55) * 3);
      o[0] = stripe ? 1.0 : 0.16; o[1] = stripe ? 0.52 : 0.3; o[2] = stripe ? 0.12 : 0.13;
      o[0] = mix(o[0], 0.25, cap); o[1] = mix(o[1], 0.12, cap); o[2] = mix(o[2], 0.1, cap);
      o[3] = stripe ? 0.55 * (1 - cap) : 0.0;
      o[4] = 1;
    });
  }
  return g.groundAO(0.5, 0.5).build();
}

// --- Lantern trees: dark trunks holding luminous canopy bulbs -------------------
export function lanternTree(seed) {
  const r = mulberry32(seed), g = new Geo();
  const bark = (p, nn, o) => {
    const v = 0.8 + 0.4 * Math.sin(p.y * 7 + p.x * 9);
    o[0] = 0.075 * v; o[1] = 0.05 * v; o[2] = 0.125 * v;
    o[4] = sat(p.y / 6) * 0.25;
  };
  const tp = [V(0, -0.4, 0), V(0.14, 1.3, 0.05), V(-0.1, 2.7, 0.2), V(0.18, 4.0, 0.08), V(0.1, 4.7, 0.0)];
  g.add(tubeGeo(tp, [0.36, 0.27, 0.2, 0.14, 0.09], 7, true), null, bark);
  const bulb = (cx, cy, cz, R, squash) => {
    g.add(temp(new THREE.SphereGeometry(1, 10, 8)), M.trs(cx, cy, cz, 0, r() * 3, 0, R, R * squash, R), (p, nn, o) => {
      const t = sat(p.y * 0.5 + 0.5);
      o[0] = mix(0.18, 0.9, t); o[1] = mix(1.0, 0.24, t); o[2] = mix(0.9, 0.8, t);
      const vein = Math.sin(Math.atan2(p.z, p.x) * 8) * 0.5 + 0.5;
      o[3] = (1.0 - t * 0.55) * (0.7 + 0.3 * vein);
      o[4] = 0.35;
    });
    for (let k = 0; k < 4; k++) {
      const a = r() * 6.283, rr = R * 0.45;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, L = R * (1.2 + r() * 1.3);
      g.add(tubeGeo([V(x, cy - R * squash * 0.7, z), V(x + 0.03, cy - R * squash * 0.7 - L * 0.5, z), V(x - 0.02, cy - R * squash * 0.7 - L, z + 0.03)], [0.022, 0.016, 0.006], 4, true), null, (p, nn, o) => {
        o[0] = 0.4; o[1] = 0.95; o[2] = 0.9; o[3] = 0.6; o[4] = 0.9;
      });
    }
  };
  bulb(0.1, 5.25, 0, 0.72, 0.85);
  const nb = 3 + Math.floor(r() * 2);
  for (let k = 0; k < nb; k++) {
    const az = (k / nb) * 6.283 + r() * 0.8, dx = Math.cos(az), dz = Math.sin(az);
    const sy = 2.3 + r() * 1.5, len = 1.5 + r() * 1.2;
    const s = V(0, sy, 0.1);
    const pts = [s, V(dx * len * 0.4, sy + 0.75, dz * len * 0.4), V(dx * len * 0.8, sy + 1.0, dz * len * 0.8), V(dx * len, sy + 0.72, dz * len)];
    g.add(tubeGeo(pts, [0.11, 0.08, 0.055, 0.035], 5, true), null, bark);
    bulb(dx * len, sy + 0.72 - 0.34, dz * len, 0.36 + r() * 0.16, 1.15);
  }
  return g.groundAO(0.9, 0.5).build();
}

// --- Veil ferns: translucent fans that catch low sun ----------------------------
export function veilFern(seed) {
  const r = mulberry32(seed), g = new Geo();
  const n = 3 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const az = r() * 6.283, R = 0.5 + r() * 0.45;
    const m = M.trs(Math.cos(az) * 0.05, 0, Math.sin(az) * 0.05, -0.25 - r() * 0.5, az, 0, R, R * 1.35, R);
    g.add(temp(new THREE.CircleGeometry(1, 9, 0.3, Math.PI - 0.6)), m, (p, nn, o) => {
      const rr = sat(Math.hypot(p.x, p.y));
      const rib = Math.abs(Math.sin(Math.atan2(p.y, p.x) * 9)) > 0.85 ? 1 : 0;
      o[0] = mix(0.2, 1.0, rr); o[1] = mix(0.02, 0.32, rr * rr); o[2] = mix(0.16, 0.72, rr);
      if (rib) { o[0] *= 0.55; o[1] *= 0.55; o[2] *= 0.55; }
      o[3] = rr * rr * rr * 0.45;
      o[4] = rr;
    });
  }
  return g.groundAO(0.25, 0.6).build();
}

// --- Glow caps: mushroom clusters -------------------------------------------------
export function glowCaps(seed) {
  const r = mulberry32(seed), g = new Geo();
  const n = 4 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const az = r() * 6.283, d = r() * 0.32, h = 0.16 + r() * 0.42, cr = 0.07 + r() * 0.13;
    const x = Math.cos(az) * d, z = Math.sin(az) * d;
    g.add(temp(new THREE.CylinderGeometry(0.022, 0.034, h, 5, 1, true).translate(0, h / 2, 0)), M.trs(x, -0.03, z, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), (p, nn, o) => {
      o[0] = 0.5; o[1] = 0.62; o[2] = 0.66; o[3] = 0.1; o[4] = sat(p.y / h) * 0.3;
    });
    g.add(temp(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55)), M.trs(x, h - 0.04, z, 0, 0, 0, cr, cr * 0.62, cr), (p, nn, o) => {
      const t = sat(p.y);
      const spot = Math.sin(p.x * 9) * Math.sin(p.z * 9) > 0.35 ? 1 : 0;
      o[0] = mix(0.3, 0.12, t); o[1] = mix(1.0, 0.55, t); o[2] = mix(1.0, 0.75, t);
      if (spot) { o[0] = 0.85; o[1] = 1; o[2] = 1; }
      o[3] = (1 - t * 0.6) * 0.9 + spot * 0.4;
      o[4] = 0.3;
    });
  }
  return g.build();
}

// --- Ground cover variants ---------------------------------------------------------
export function tendrilClump(seed, blades = 6, o2 = {}) {
  const r = mulberry32(seed), g = new Geo();
  const baseCol = o2.base || [0.018, 0.06, 0.062], tipCol = o2.tip || [0.04, 0.2, 0.19];
  const glow = o2.glow ?? 0.5, H = o2.h ?? 0.44, spread = o2.spread ?? 0.3, w = o2.w ?? 0.042;
  for (let k = 0; k < blades; k++) {
    const az = r() * 6.283, d = r() * 0.13, h = H * (0.55 + r() * 0.7), out = spread * (0.4 + r() * 0.9);
    const bx = Math.cos(az) * d, bz = Math.sin(az) * d;
    const dx = Math.cos(az + (r() - 0.5)), dz = Math.sin(az + (r() - 0.5));
    const base = V(bx, -0.03, bz), mid = V(bx + dx * out * 0.25, h * 0.62, bz + dz * out * 0.25), tip = V(bx + dx * out, h, bz + dz * out);
    g.add(bladeGeo(base, mid, tip, w * (0.7 + r() * 0.6), 2), null, (p, nn, o) => {
      const t = sat(p.y / h);
      o[0] = mix(baseCol[0], tipCol[0], t * t); o[1] = mix(baseCol[1], tipCol[1], t); o[2] = mix(baseCol[2], tipCol[2], t);
      o[3] = t * t * t * t * glow * 1.6;
      o[4] = t * t;
    });
  }
  return g.build();
}

export function shardTuft(seed) {
  const r = mulberry32(seed), g = new Geo();
  for (let k = 0; k < 4; k++) {
    const az = r() * 6.283, d = r() * 0.2, h = 0.1 + r() * 0.2;
    g.add(temp(new THREE.ConeGeometry(h * 0.2, h, 4, 1, true).translate(0, h / 2, 0)), M.trs(Math.cos(az) * d, -0.02, Math.sin(az) * d, 0.2 + r() * 0.5, az, 0), (p, nn, o) => {
      const t = sat(p.y / h);
      o[0] = mix(0.02, 0.2, t); o[1] = mix(0.14, 0.9, t); o[2] = mix(0.2, 0.82, t);
      o[3] = 0.15 + 0.6 * t;
    }, true);
  }
  const blades = tendrilClump(seed + 5, 3, { h: 0.4, glow: 0.5 });
  g.add(blades, null, (p, nn, o, i) => {
    const c = blades.attributes.color, a = blades.attributes.aFx;
    o[0] = c.getX(i); o[1] = c.getY(i); o[2] = c.getZ(i); o[3] = a.getX(i); o[4] = a.getY(i);
  });
  blades.dispose();
  return g.build();
}

// --- Rocks ----------------------------------------------------------------------------
function rockNoise(x, y, z, s) {
  return Math.sin(x * 2.3 + s) * Math.cos(y * 2.9 + s * 1.7) + Math.sin(z * 3.1 - s * 0.6) * Math.cos(x * 1.7 + y * 2.1) * 0.7 + Math.sin((x + y + z) * 5.3 + s) * 0.22;
}

export function boulder(seed, detail = 1) {
  const src = new THREE.IcosahedronGeometry(1, detail);
  const P = src.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    const d = 1 + 0.2 * rockNoise(v.x, v.y, v.z, seed);
    P.setXYZ(i, v.x * d, v.y * d * 0.72 + 0.12, v.z * d);
  }
  const g = new Geo();
  g.add(temp(src), null, (p, nn, o) => {
    const n = 0.72 + 0.3 * Math.sin(p.x * 3.7 + p.y * 5.1 + seed) * Math.cos(p.z * 4.3);
    const top = sat(p.y * 0.8 + 0.3);
    o[0] = 0.5 * n * (0.8 + 0.3 * top); o[1] = 0.5 * n * (0.8 + 0.3 * top); o[2] = 0.53 * n * (0.8 + 0.3 * top);
  }, true);
  return g.groundAO(0.35, 0.55).build();
}

// Tall banded needle of rock; unit height, scaled per instance.
export function rockSpire(seed) {
  const src = new THREE.CylinderGeometry(0.02, 0.2, 1, 7, 7).translate(0, 0.5, 0);
  const P = src.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const ang = Math.atan2(z, x), rr = Math.hypot(x, z);
    const k = 1 + 0.32 * Math.sin(ang * 3 + y * 9 + seed) + 0.2 * Math.sin(ang * 5 - y * 14 + seed * 2);
    const prof = 0.55 + 0.45 * Math.pow(1 - y, 0.7) + 0.12 * Math.sin(y * 11 + seed);
    x = Math.cos(ang) * rr * k * prof + 0.07 * Math.sin(y * 4 + seed) * y;
    z = Math.sin(ang) * rr * k * prof + 0.05 * Math.cos(y * 5 + seed) * y;
    P.setXYZ(i, x, y - 0.04, z);
  }
  const g = new Geo();
  g.add(temp(src), null, (p, nn, o) => {
    const s = p.y * 26 + Math.sin(p.x * 30) * 0.6;
    const a = Math.sin(s) * 0.5 + 0.5, b = sat((Math.sin(s * 2.3 + 1) * 0.5 + 0.5 - 0.7) * 4), c = sat((Math.sin(s * 0.71 + 4) * 0.5 + 0.5 - 0.78) * 5);
    let R = mix(0.44, 0.62, a), G2 = mix(0.15, 0.31, a), B = mix(0.075, 0.14, a);
    R = mix(R, 0.7, b); G2 = mix(G2, 0.52, b); B = mix(B, 0.36, b);
    R = mix(R, 0.22, c); G2 = mix(G2, 0.07, c); B = mix(B, 0.06, c);
    o[0] = R; o[1] = G2; o[2] = B;
  }, true);
  return g.groundAO(0.08, 0.4).build();
}

// Cluster of hexagonal basalt columns.
export function basaltColumns(seed) {
  const r = mulberry32(seed), g = new Geo();
  const n = 6 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++) {
    const az = r() * 6.283, d = k === 0 ? 0 : 0.18 + r() * 0.3, h = 0.35 + r() * 0.75, rad = 0.13 + r() * 0.05;
    g.add(temp(new THREE.CylinderGeometry(rad, rad * 1.05, h, 6, 1).translate(0, h / 2, 0)), M.trs(Math.cos(az) * d, -0.1, Math.sin(az) * d, (r() - 0.5) * 0.16, r() * 3, (r() - 0.5) * 0.16), (p, nn, o) => {
      const v = 0.75 + 0.3 * Math.sin(p.y * 17 + k);
      const top = nn.y > 0.5 ? 1.35 : 1;
      o[0] = 0.3 * v * top; o[1] = 0.29 * v * top; o[2] = 0.33 * v * top;
    }, true);
  }
  return g.groundAO(0.2, 0.5).build();
}

// Ribbed desert bulb studded with ember-coloured lights.
export function emberBulb(seed) {
  const r = mulberry32(seed), g = new Geo();
  const src = new THREE.SphereGeometry(0.42, 12, 7);
  const P = src.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const ang = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.cos(ang * 6);
    P.setXYZ(i, x * k, y * 0.86 + 0.3, z * k);
  }
  g.add(temp(src), null, (p, nn, o) => {
    const ang = Math.atan2(p.z, p.x);
    const rib = Math.cos(ang * 6) * 0.5 + 0.5;
    const dot = rib > 0.86 && Math.sin(p.y * 22) > 0.5 ? 1 : 0;
    o[0] = mix(0.09, 0.2, rib); o[1] = mix(0.15, 0.26, rib); o[2] = mix(0.1, 0.13, rib);
    if (dot) { o[0] = 1.0; o[1] = 0.5; o[2] = 0.12; o[3] = 0.9; }
  });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 6.283;
    g.add(bladeGeo(V(0, 0.62, 0), V(Math.cos(a) * 0.1, 0.82, Math.sin(a) * 0.1), V(Math.cos(a) * 0.26, 0.86 + r() * 0.1, Math.sin(a) * 0.26), 0.11, 2), null, (p, nn, o) => {
      o[0] = 1.0; o[1] = 0.42; o[2] = 0.18; o[3] = 0.6; o[4] = 0.6;
    });
  }
  return g.groundAO(0.25, 0.5).build();
}
