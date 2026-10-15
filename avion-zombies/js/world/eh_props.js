import * as THREE from '../../vendor/three.module.min.js';
import { makeSign } from './textures.js';
import { makeRng } from '../util.js';

// Reusable props for Ember Hollow. Everything goes through the Builder so it batches per
// material; lamps register baked light on their circuit.

// local -> world helper for a prop at (x,z) turned by rot
export function frame(x, z, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}

export function bench(B, M, X, x, y, z, rot, len = 1.8) {
  const at = frame(x, z, rot);
  for (const lz of [-0.12, 0.12]) {
    const [sx, sz] = at(0, lz);
    B.box(sx, y + 0.42, sz, len, 0.05, 0.16, { mat: X.planksDark, rot, collide: false, uv: 1.5 });
  }
  const [bx, bz] = at(0, -0.26);
  B.box(bx, y + 0.62, bz, len, 0.32, 0.05, { mat: X.planksDark, rot, rx: -0.12, collide: false, uv: 1.5 });
  for (const lx of [-len / 2 + 0.15, len / 2 - 0.15]) {
    const [lxw, lzw] = at(lx, 0);
    B.box(lxw, y, lzw, 0.08, 0.44, 0.5, { mat: M.black, rot, collide: false });
  }
  B.physics.addBox({ x, y, z, w: len, h: 0.5, d: 0.55, rot, walkable: true, material: 'wood' });
}

export function trashCan(B, M, X, x, y, z) {
  B.cylinder(x, y, z, 0.32, 1.0, { mat: X.paintGreen, seg: 12 });
  B.cylinder(x, y + 1.0, z, 0.36, 0.08, { mat: M.black, seg: 12, collide: false });
}

// Old-fashioned park lamp post with a glass lantern; light baked on its circuit.
export function lampPost(B, M, X, x, y, z, circuit, o = {}) {
  const h = o.h ?? 3.6;
  B.cylinder(x, y, z, 0.13, 0.35, { mat: M.black, seg: 10 });
  B.cylinder(x, y + 0.35, z, 0.06, h - 0.35, { mat: M.black, seg: 8, collide: false });
  B.box(x, y + h, z, 0.36, 0.08, 0.36, { mat: M.black, collide: false });
  B.box(x, y + h + 0.5, z, 0.42, 0.06, 0.42, { mat: M.black, collide: false });
  B.cylinder(x, y + h + 0.56, z, 0.05, 0.2, { mat: M.black, seg: 6, rTop: 0.01, collide: false });
  B.bakedLamp(x, y + h + 0.28, z, {
    color: o.color ?? 0xffc98a, intensity: o.intensity ?? 34, range: o.range ?? 16, circuit, glow: 1.4,
    fitting: new THREE.BoxGeometry(0.28, 0.4, 0.28), bright: 4,
  });
  B.physics.addCylinder({ x, z, r: 0.16, y0: y, y1: y + h + 0.6, walkable: false, material: 'metal' });
}

// Parking-lot pole: two LED heads on arms.
export function lotPole(B, M, X, x, y, z, rot, circuit, heads = 2) {
  const h = 7.6;
  B.cylinder(x, y, z, 0.3, 0.7, { mat: M.concrete, seg: 12 });
  B.cylinder(x, y + 0.7, z, 0.09, h - 0.7, { mat: M.steel, rTop: 0.07, seg: 8, collide: false });
  const at = frame(x, z, rot);
  for (const side of heads === 2 ? [-1, 1] : [1]) {
    const [ax, az] = at(side * 0.9, 0);
    B.box(ax, y + h - 0.05, az, 1.8, 0.08, 0.1, { mat: M.steel, rot, collide: false });
    const [hx, hz] = at(side * 1.75, 0);
    B.box(hx, y + h - 0.2, hz, 0.7, 0.18, 0.42, { mat: M.steelDark, rot, collide: false });
    B.bakedLamp(hx, y + h - 0.32, hz, {
      color: 0xffe2c0, intensity: 150, range: 24, circuit, glow: 2.2, rot,
      fitting: new THREE.BoxGeometry(0.6, 0.04, 0.34), bright: 6,
      spot: { dir: new THREE.Vector3(0, -1, 0), angle: 1.15, penumbra: 0.5 },
    });
  }
  B.physics.addCylinder({ x, z, r: 0.32, y0: y, y1: y + h, walkable: false, material: 'metal' });
}

export function picnicTable(B, M, X, x, y, z, rot) {
  const at = frame(x, z, rot);
  B.box(x, y + 0.74, z, 1.9, 0.06, 0.8, { mat: X.planksDark, rot, collide: false, uv: 1.5 });
  for (const side of [-1, 1]) {
    const [sx, sz] = at(0, side * 0.68);
    B.box(sx, y + 0.44, sz, 1.9, 0.05, 0.28, { mat: X.planksDark, rot, collide: false, uv: 1.5 });
  }
  for (const lx of [-0.75, 0.75]) {
    for (const lz of [-0.35, 0.35]) {
      const [px, pz] = at(lx, lz);
      B.box(px, y, pz, 0.08, 0.74, 0.08, { mat: X.planksDark, rot, collide: false, rx: lz > 0 ? -0.35 : 0.35 });
    }
  }
  B.physics.addBox({ x, y, z, w: 1.9, h: 0.78, d: 1.7, rot, walkable: true, material: 'wood' });
}

// Split-rail fence along a polyline (visual) with a tall invisible barrier (exo jumps).
export function railFence(B, M, X, pts, H, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) {
      const px = x1 + ((x2 - x1) * k) / n;
      const pz = z1 + ((z2 - z1) * k) / n;
      B.box(px, H(px, pz) - 0.2, pz, 0.16, 1.4, 0.16, { mat: X.planksDark, collide: false });
    }
    for (let k = 0; k < n; k++) {
      const ax = x1 + ((x2 - x1) * (k + 0.5)) / n;
      const az = z1 + ((z2 - z1) * (k + 0.5)) / n;
      const y = H(ax, az);
      for (const ry of [0.55, 1.05]) B.box(ax, y + ry, az, len / n + 0.15, 0.1, 0.1, { mat: X.planksDark, rot, collide: false, uv: 2 });
    }
    if (o.barrier !== false) {
      const y = Math.min(H(x1, z1), H(x2, z2)) - 0.5;
      B.physics.addBox({ x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, w: len, h: 6.5, d: 0.3, rot, walkable: false, material: 'wood', bullets: false, nav: true });
    }
  }
}

// Log stockade (gem mine camp): sharpened posts side by side.
export function stockade(B, M, X, pts, H, o = {}) {
  const h = o.h ?? 2.6;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(-(z2 - z1) / len, (x2 - x1) / len);
    const n = Math.max(1, Math.round(len / 0.34));
    const rng = makeRng(Math.round(x1 * 13 + z1 * 7));
    const gaps = o.gaps || [];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const px = x1 + (x2 - x1) * t;
      const pz = z1 + (z2 - z1) * t;
      const hh = h * (0.92 + rng() * 0.12);
      // where a creek passes under: no posts, a log spans the gap instead
      if (gaps.some(([gx, gz, gr]) => Math.hypot(px - gx, pz - gz) < gr)) continue;
      B.cylinder(px, H(px, pz) - 0.3, pz, 0.15, hh, { mat: M.log, seg: 7, collide: false, rTop: 0.13 });
      B.cylinder(px, H(px, pz) - 0.3 + hh, pz, 0.13, 0.25, { mat: M.log, seg: 7, collide: false, rTop: 0.01 });
    }
    // rails behind the posts
    for (const ry of [0.7, h - 0.6]) {
      const mx = (x1 + x2) / 2;
      const mz = (z1 + z2) / 2;
      B.box(mx + Math.sin(rot) * 0.2, H(mx, mz) + ry, mz + Math.cos(rot) * 0.2, len, 0.12, 0.1, { mat: X.planksDark, rot, collide: false });
    }
    const y = Math.min(H(x1, z1), H(x2, z2)) - 0.5;
    B.physics.addBox({ x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, w: len, h: 7, d: 0.4, rot, walkable: false, material: 'wood', nav: true });
  }
  for (const [gx, gz, gr] of o.gaps || []) {
    // the spanning log, at the stockade's top rail
    const seg = pts.findIndex((p, i) => i < pts.length - 1 && distSeg(gx, gz, p, pts[i + 1]) < 0.5);
    if (seg < 0) continue;
    const [ax, az] = pts[seg];
    const [bx, bz] = pts[seg + 1];
    const rot = Math.atan2(-(bz - az), bx - ax);
    B.cylinder(gx, H(gx, gz) + h - 0.75, gz, 0.2, gr * 2 + 0.6, { mat: M.log, horizontal: true, rot, seg: 8, collide: false });
  }
}

function distSeg(x, z, a, b) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)));
  return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
}

// Straight stairs: from (x0,z0) at height y0 up to (x1,z1) at y1, width w.
export function stairs(B, M, mat, x0, z0, y0, x1, z1, y1, w, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rise = y1 - y0;
  const n = Math.max(1, Math.round(Math.abs(rise) / (o.riser ?? 0.17)));
  const rot = Math.atan2(-(z1 - z0) / len, (x1 - x0) / len) + Math.PI / 2;
  const run = len / n;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const cx = x0 + (x1 - x0) * t;
    const cz = z0 + (z1 - z0) * t;
    const top = y0 + (rise * (k + 1)) / n;
    const base = Math.min(y0, y1) - 0.3;
    B.box(cx, base, cz, w, top - base, run + 0.02, { mat, rot, uv: 1.5, cast: false });
  }
  // handrails
  if (o.rails !== false) {
    for (const side of [-1, 1]) {
      const ox = Math.cos(rot) * side * (w / 2 - 0.05);
      const oz = -Math.sin(rot) * side * (w / 2 - 0.05);
      for (let k = 0; k <= n; k += Math.max(1, Math.round(n / 4))) {
        const t = k / n;
        const px = x0 + (x1 - x0) * t + ox;
        const pz = z0 + (z1 - z0) * t + oz;
        B.box(px, y0 + rise * t, pz, 0.05, 0.95, 0.05, { mat: o.railMat || M.steelDark, collide: false });
      }
      const g = new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(len, rise), 6);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, rot, 0));
      m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - Math.atan2(rise, len)));
      m.setPosition((x0 + x1) / 2 + ox, (y0 + y1) / 2 + 0.95, (z0 + z1) / 2 + oz);
      B.mesh(g, m, o.railMat || M.steelDark, { cast: false });
    }
  }
}

// Interpretive / directional sign on two posts (brown park-service style).
export function parkSign(B, M, X, x, y, z, rot, lines, w = 1.6, h = 0.9, o = {}) {
  const tex = o.tex || makeSign(lines, { w: 512, h: Math.round((512 * h) / w), bg: o.bg ?? '#4a3626', fg: o.fg ?? '#efe4cc', stripe: false, accent: '#d9a441' });
  const at = frame(x, z, rot);
  for (const side of [-1, 1]) {
    const [px, pz] = at(side * (w / 2 - 0.08), -0.02);
    B.box(px, y, pz, 0.1, (o.post ?? 1.1) + h, 0.1, { mat: X.planksDark, rot, collide: false });
  }
  const [sx, sz] = at(0, 0.04);
  B.sign(sx, y + (o.post ?? 1.1) + h / 2, sz, rot, tex, w, h);
  if (o.back !== false) {
    const [bx, bz] = at(0, -0.04);
    B.box(bx, y + (o.post ?? 1.1), bz, w, h, 0.05, { mat: X.planksDark, rot, collide: false });
  }
  B.physics.addBox({ x, y, z, w, h: (o.post ?? 1.1) + h, d: 0.2, rot, walkable: false, material: 'wood' });
}

// ---- vehicles --------------------------------------------------------------------------------
// type: sedan | wagon | pickup | van ; paint: a material
export function car(B, M, X, x, y, z, rot, type, paint, o = {}) {
  const at = frame(x, z, rot);
  const L = type === 'van' ? 5.0 : type === 'pickup' ? 5.4 : type === 'wagon' ? 5.0 : 4.6;
  const W = type === 'van' ? 1.95 : 1.85;
  const bodyH = type === 'pickup' ? 0.85 : 0.75;
  const put = (lx, ly, lz, w, h, d, mat, extra = {}) => {
    const [px, pz] = at(lx, lz);
    B.box(px, y + ly, pz, w, h, d, { mat, rot, collide: false, ...extra });
  };
  // body and skirts
  put(0, 0.32, 0, L, bodyH, W, paint, { uv: 2 });
  put(L / 2 - 0.05, 0.3, 0, 0.12, 0.28, W + 0.04, X.chrome);
  put(-L / 2 + 0.05, 0.3, 0, 0.12, 0.28, W + 0.04, X.chrome);
  // cabin
  if (type === 'pickup') {
    put(0.75, 0.32 + bodyH, 0, 1.6, 0.75, W - 0.1, paint);
    put(0.75, 0.38 + bodyH, 0, 1.62, 0.55, W - 0.06, X.window);
    // camper shell over the bed
    put(-1.35, 0.32 + bodyH, 0, 2.3, 0.62, W - 0.12, o.shell || X.paintWhite);
  } else {
    const cabL = type === 'sedan' ? 2.5 : type === 'van' ? 3.9 : 3.3;
    const off = type === 'sedan' ? -0.15 : type === 'van' ? -0.35 : -0.4;
    const cabH = type === 'van' ? 1.0 : 0.72;
    put(off, 0.32 + bodyH, 0, cabL, cabH, W - 0.12, paint);
    put(off, 0.38 + bodyH, 0, cabL + 0.04, cabH - 0.16, W - 0.08, X.window);
    if (type === 'wagon') {
      // wood-grain side panels: the family wagon
      put(-0.3, 0.42, W / 2 + 0.01, L - 1.0, 0.42, 0.02, X.planksDark);
      put(-0.3, 0.42, -W / 2 - 0.01, L - 1.0, 0.42, 0.02, X.planksDark);
      put(off, 0.32 + bodyH + cabH, 0, cabL - 0.3, 0.06, 1.2, M.black);
    }
  }
  // lights
  for (const s of [-1, 1]) {
    put(L / 2 + 0.01, 0.62, s * (W / 2 - 0.28), 0.04, 0.14, 0.3, X.chrome);
    put(-L / 2 - 0.01, 0.62, s * (W / 2 - 0.22), 0.04, 0.16, 0.26, X.lensRed);
  }
  // wheels
  for (const lx of [L / 2 - 0.85, -L / 2 + 0.85]) {
    for (const s of [-1, 1]) {
      const [wx, wz] = at(lx, s * (W / 2 - 0.08));
      B.cylinder(wx, y, wz, 0.34, 0.24, { mat: X.tire, horizontal: true, rot: rot + Math.PI / 2, seg: 12, collide: false });
    }
  }
  B.physics.addBox({ x, y, z, w: L, h: 1.45, d: W, rot, walkable: true, material: 'metal' });
}

export function signTex(lines, o = {}) {
  return makeSign(lines, { w: o.w ?? 512, h: o.h ?? 256, bg: o.bg ?? '#4a3626', fg: o.fg ?? '#efe4cc', stripe: o.stripe ?? false, accent: o.accent ?? '#d9a441' });
}

// A strip mesh draped on the ground along a polyline (paths, trails, creek water).
export function ribbon(B, mat, pts, width, H, o = {}) {
  const lift = o.lift ?? 0.03;
  const across = o.across ?? 4;
  const step = o.step ?? 0.5;
  const uvs = o.uv ?? 3;
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  samples.push(pts[pts.length - 1]);
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const q0 = samples[Math.max(0, i - 1)];
    const q1 = samples[Math.min(samples.length - 1, i + 1)];
    let tx = q1[0] - q0[0];
    let tz = q1[1] - q0[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    if (i > 0) dist += Math.hypot(p[0] - samples[i - 1][0], p[1] - samples[i - 1][1]);
    for (let a = 0; a <= across; a++) {
      const s = (a / across - 0.5) * width;
      const x = p[0] - tz * s;
      const z = p[1] + tx * s;
      // flat: level across (water), following the ground along the line
      pos.push(x, (o.y ?? (o.flat ? H(p[0], p[1]) : H(x, z))) + lift, z);
      uv.push(s / uvs, dist / uvs);
    }
  }
  const row = across + 1;
  for (let i = 0; i < samples.length - 1; i++) {
    for (let a = 0; a < across; a++) {
      const v = i * row + a;
      idx.push(v, v + 1, v + row, v + 1, v + row + 1, v + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  B.mesh(g, new THREE.Matrix4(), mat, { cast: false });
  return g;
}
