import * as THREE from '../../vendor/three.module.min.js';
import { ribbon, signTex, frame } from './eh_props.js';
import { stalactite, stalagmite, column, boulder, flowLump, placeAt, hangAt } from './formations.js';
import { makeRng, distToSegment2, clamp } from '../util.js';

// Tools for dressing the caves: walkways that follow the rock floor, show-cave floodlights,
// Avion's work lights and bulkheads, and formations scattered clear of the paths.
export function caveKit(S) {
  const { B, M, X } = S;
  const cave = S.ctx.world.cave;
  const F = (x, z) => cave.floorAt(x, z);
  const CEIL = (x, z) => {
    const c = cave.ceilingSurface(x, z);
    return c === null ? cave.ceilAt(x, z) : c;
  };
  const D = (x, z) => cave.distAt(x, z);
  const paths = []; // polylines formations keep clear of
  const reserved = []; // [x, z, r]

  const K = { cave, F, CEIL, D, paths, reserved };

  // distance from (x,z) to the nearest walkway centre line
  K.pathDist = (x, z) => {
    let d = Infinity;
    for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return d;
  };
  K.isReserved = (x, z, pad = 0) => reserved.some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + pad);
  K.reserve = (x, z, r) => reserved.push([x, z, r]);

  // resample a polyline every `step` metres; each sample: [x, z, tx, tz, dist]
  K.samples = (pts, step = 0.5) => {
    const out = [];
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, (bx - ax) / len, (bz - az) / len, dist + (len * k) / n]);
      dist += len;
    }
    const [lx, lz] = pts[pts.length - 1];
    const last = out[out.length - 1];
    out.push([lx, lz, last[2], last[3], dist]);
    return out;
  };

  // A walkway: a slab following the rock floor with curbs, optional rails and low path lights.
  // o: { mat, rails: 'left'|'right'|'both', lights: spacing, lightColor, railMat, collideRails }
  K.walkway = (pts, w, o = {}) => {
    paths.push(pts);
    const mat = o.mat || M.concrete;
    const lift = o.lift ?? 0.09;
    ribbon(B, mat, pts, w, F, { lift, uv: o.uv ?? 3, across: 4, step: 0.5 });
    const sm = K.samples(pts, 1.0);
    // curbs down the edges hide where slab and rock meet
    for (let i = 0; i < sm.length - 1; i++) {
      const [x, z, tx, tz] = sm[i];
      const [x2, z2] = sm[i + 1];
      const len = Math.hypot(x2 - x, z2 - z);
      const rot = Math.atan2(-tz, tx);
      for (const s of [-1, 1]) {
        const cx = (x + x2) / 2 - tz * s * (w / 2);
        const cz = (z + z2) / 2 + tx * s * (w / 2);
        const y = Math.min(F(x, z), F(x2, z2));
        B.box(cx, y - 0.25, cz, len + 0.04, Math.max(F(x, z), F(x2, z2)) + lift + 0.03 - (y - 0.25), 0.1, { mat, rot, collide: false, cast: false });
      }
    }
    // rails: posts every 2 m along an edge, top and middle rails between them
    const sides = o.rails === 'both' ? [-1, 1] : o.rails === 'left' ? [-1] : o.rails === 'right' ? [1] : [];
    const railMat = o.railMat || M.black;
    for (const s of sides) {
      const posts = [];
      for (let i = 0; i < sm.length; i += 2) {
        const [x, z, tx, tz] = sm[i];
        const px = x - tz * s * (w / 2 - 0.08);
        const pz = z + tx * s * (w / 2 - 0.08);
        if (o.railSkip && o.railSkip(px, pz)) {
          posts.push(null);
          continue;
        }
        posts.push([px, F(px, pz) + lift, pz]);
      }
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        if (!p) continue;
        B.cylinder(p[0], p[1], p[2], 0.035, 1.02, { mat: railMat, seg: 6, collide: false });
        const q = posts[i + 1];
        if (!q) continue;
        for (const hy of [1.0, 0.5]) {
          const a = new THREE.Vector3(p[0], p[1] + hy, p[2]);
          const b = new THREE.Vector3(q[0], q[1] + hy, q[2]);
          const len = a.distanceTo(b);
          const g = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
          const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
          m.setPosition(a.clone().add(b).multiplyScalar(0.5));
          B.mesh(g, m, railMat, { cast: false });
        }
        if (o.collideRails !== false) {
          const rot = Math.atan2(-(q[2] - p[2]), q[0] - p[0]);
          B.physics.addBox({ x: (p[0] + q[0]) / 2, y: Math.min(p[1], q[1]), z: (p[2] + q[2]) / 2, w: Math.hypot(q[0] - p[0], q[2] - p[2]), h: 1.05, d: 0.12, rot, walkable: false, material: 'metal', bullets: false });
        }
      }
    }
    // path lights: little hooded fittings low on the inside of the curb
    if (o.lights) {
      let next = o.lights * 0.5;
      for (const [x, z, tx, tz, dist] of K.samples(pts, 0.5)) {
        if (dist < next) continue;
        next += o.lights;
        const s = o.lightSide ?? 1;
        const lx = x - tz * s * (w / 2 + 0.15);
        const lz = z + tx * s * (w / 2 + 0.15);
        const y = F(lx, lz);
        B.box(lx, y - 0.05, lz, 0.16, 0.38, 0.16, { mat: M.black, collide: false, cast: false });
        B.bakedLamp(lx, y + 0.28, lz, { color: o.lightColor ?? 0xffd2a0, intensity: o.lightPower ?? 6, range: o.lightRange ?? 7, circuit: 'reactor', glow: 0.5, fitting: new THREE.BoxGeometry(0.12, 0.05, 0.12), bright: 4 });
      }
    }
    return sm;
  };

  // A show-cave floodlight on the floor at (x,z) aimed at a target point.
  K.flood = (x, z, target, color, intensity, range, o = {}) => {
    const y = F(x, z) + (o.lift ?? 0.12);
    const dir = new THREE.Vector3(target[0] - x, target[1] - y, target[2] - z).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    B.box(x, y - 0.12, z, 0.32, 0.22, 0.26, { mat: M.black, rot: yaw, collide: false, cast: false });
    B.bakedLamp(x + dir.x * 0.2, y + 0.1 + dir.y * 0.2, z + dir.z * 0.2, {
      color, intensity, range, circuit: 'reactor', glow: o.glow ?? 0.6, rot: yaw, tilt: -Math.asin(dir.y),
      fitting: new THREE.BoxGeometry(0.24, 0.16, 0.04), bright: 5,
      spot: { dir, angle: o.angle ?? 0.7, penumbra: o.penumbra ?? 0.55 },
    });
  };

  // A caged bulb hanging from the rock on its cable (old tour lighting / Avion work light).
  K.hangLamp = (x, z, o = {}) => {
    const top = CEIL(x, z);
    const y = top - (o.drop ?? 0.7);
    B.box(x, y + 0.1, z, 0.015, top - y + 0.2, 0.015, { mat: M.black, collide: false, cast: false });
    B.box(x, y + 0.06, z, 0.2, 0.04, 0.2, { mat: o.shade || M.black, collide: false });
    B.bakedLamp(x, y - 0.06, z, {
      color: o.color ?? 0xffd9a8, intensity: o.intensity ?? 14, range: o.range ?? 11, circuit: 'reactor',
      glow: o.glow ?? 0.9, fitting: new THREE.SphereGeometry(0.08, 8, 6), bright: 5,
    });
  };

  // Avion LED strip on the crown of a tunnel.
  K.strip = (x, z, rot, o = {}) => {
    const y = CEIL(x, z) - 0.12;
    B.box(x, y - 0.02, z, 1.4, 0.08, 0.22, { mat: M.steel, rot, collide: false });
    B.bakedLamp(x, y - 0.06, z, {
      color: o.color ?? 0xe8f0ff, intensity: o.intensity ?? 12, range: o.range ?? 11, circuit: 'reactor', rot,
      glow: 0.8, fitting: new THREE.BoxGeometry(1.25, 0.03, 0.12), bright: 4,
    });
  };

  // Battery emergency lamp: lit only while the reactor is down.
  K.emergency = (x, y, z, color = 0xff6a2a) => {
    B.box(x, y - 0.08, z, 0.26, 0.16, 0.14, { mat: M.black, collide: false });
    B.lamp(x, y, z, { color, intensity: 4.5, distance: 9, circuit: 'reactor', emergency: true, glowSize: 0.7, bright: 3, flicker: 0.08 });
  };

  // Avion's concrete bulkhead across a tunnel, with a door opening (the door itself is a DOOR).
  K.bulkhead = (x, z, rot, w, h, o = {}) => {
    const half = o.half ?? 5.5;
    const tall = o.tall ?? 7.5;
    const y = F(x, z) - 0.6;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    B.wall(x - c * half, z + s * half, x + c * half, z - s * half, { h: tall, t: o.t ?? 0.7, y0: y, mat: M.concrete, uv: 2.5, openings: [{ at: half, w, h: h + 0.6 }] });
    const at = frame(x, z, rot);
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        const [px, pz] = at(side * (w / 2 + 0.2), face * ((o.t ?? 0.7) / 2 + 0.02));
        B.box(px, y + 0.6, pz, 0.34, h + 0.2, 0.05, { mat: M.hazard, rot, collide: false });
      }
    }
    for (const face of [-1, 1]) {
      const [px, pz] = at(0, face * ((o.t ?? 0.7) / 2 + 0.02));
      B.box(px, y + 0.6 + h + 0.05, pz, w + 0.7, 0.34, 0.05, { mat: M.hazard, rot, collide: false });
      if (o.sign) {
        const [sx, sz] = at(0, face * ((o.t ?? 0.7) / 2 + 0.06));
        B.sign(sx, y + 0.6 + h + 0.75, sz, rot + (face < 0 ? Math.PI : 0), o.sign, Math.min(w + 0.4, 3.4), Math.min(w + 0.4, 3.4) * 0.3);
      }
    }
  };

  // Yellow ventilation duct along the crown of a tunnel, on hangers.
  K.duct = (pts, o = {}) => {
    const sm = K.samples(pts, 2.0);
    for (let i = 0; i < sm.length - 1; i++) {
      const [x, z] = sm[i];
      const [x2, z2] = sm[i + 1];
      const y1 = CEIL(x, z) - (o.drop ?? 0.75);
      const y2 = CEIL(x2, z2) - (o.drop ?? 0.75);
      const off = o.offset ?? 0;
      const [, , tx, tz] = sm[i];
      const ax = x - tz * off;
      const az = z + tx * off;
      const bx = x2 - tz * off;
      const bz = z2 + tx * off;
      const a = new THREE.Vector3(ax, y1, az);
      const b = new THREE.Vector3(bx, y2, bz);
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(o.r ?? 0.32, o.r ?? 0.32, len + 0.02, 10, 1, true);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      m.setPosition(a.clone().add(b).multiplyScalar(0.5));
      B.mesh(g, m, X.yellowDuct, { cast: false });
      if (i % 2 === 0) B.box(ax, y1 + (o.r ?? 0.32), az, 0.03, (o.drop ?? 0.75) - (o.r ?? 0.32) + 0.1, 0.03, { mat: M.black, collide: false, cast: false });
    }
  };

  // Cable tray on a tunnel wall: offset from the centre line, at a height above the floor.
  K.tray = (pts, side, w, hgt = 2.4) => {
    const sm = K.samples(pts, 2.0);
    for (let i = 0; i < sm.length - 1; i++) {
      const [x, z, tx, tz] = sm[i];
      const [x2, z2] = sm[i + 1];
      const rot = Math.atan2(-tz, tx);
      const off = side * (w / 2 - 0.15);
      const cx = (x + x2) / 2 - tz * off;
      const cz = (z + z2) / 2 + tx * off;
      B.box(cx, (F(x, z) + F(x2, z2)) / 2 + hgt, cz, Math.hypot(x2 - x, z2 - z) + 0.02, 0.06, 0.22, { mat: M.steelDark, rot, collide: false, cast: false });
      B.box(cx, (F(x, z) + F(x2, z2)) / 2 + hgt + 0.06, cz, Math.hypot(x2 - x, z2 - z) + 0.02, 0.05, 0.16, { mat: X.cable, rot, collide: false, cast: false });
    }
  };

  // A sign board on two posts standing on the rock (tour signs, wall-buy boards).
  K.board = (x, z, rot, tex, w = 1.4, h = 0.8, o = {}) => {
    const y = o.y ?? F(x, z);
    const at = frame(x, z, rot);
    const post = o.post ?? 1.0;
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * (w / 2 - 0.06), -0.04);
      B.box(px, y - 0.2, pz, 0.08, post + h + 0.2, 0.08, { mat: o.postMat || M.black, rot, collide: false });
    }
    const [bx, bz] = at(0, -0.02);
    B.box(bx, y + post, bz, w, h, 0.05, { mat: o.boardMat || X.planksDark, rot, collide: false });
    if (tex) {
      const [sx, sz] = at(0, 0.006);
      B.sign(sx, y + post + h / 2, sz, rot, tex, w - 0.08, h - 0.08);
    }
    B.physics.addBox({ x, y, z, w, h: post + h, d: 0.16, rot, walkable: false, material: 'wood' });
    return { y, top: y + post + h };
  };

  // Formations scattered over an area. sampler() -> [x, z] candidates; kinds weighted.
  K.scatter = (count, sampler, o = {}) => {
    const rng = makeRng(o.seed ?? 1);
    const clear = o.clear ?? 1.8;
    let placed = 0;
    for (let tries = 0; tries < count * 12 && placed < count; tries++) {
      const [x, z] = sampler(rng);
      if (!cave.inExtent(x, z)) continue;
      const d = D(x, z);
      if (d < (o.minWall ?? 0.6) || d > (o.maxWall ?? 1e9)) continue;
      if (K.pathDist(x, z) < clear || K.isReserved(x, z, 0.5)) continue;
      const f = F(x, z);
      const ceil = CEIL(x, z);
      const head = ceil - f;
      if (head < 1.2) continue;
      const kind = o.kind ? o.kind(rng, x, z, head) : 'mite';
      const seed = Math.floor(rng() * 1e6);
      if (kind === 'mite') {
        const h = Math.min(head * 0.55, (o.miteH ?? 2.2) * (0.3 + rng() * rng() * 1.2));
        const r = h * (0.14 + rng() * 0.1);
        B.mesh(stalagmite(h, r, seed), placeAt(x, f - 0.15, z, rng() * 6), X.calcite);
        if (r > 0.18) B.physics.addCylinder({ x, z, r: r * 0.8, y0: f - 0.5, y1: f + h * 0.8, walkable: false, material: 'rock' });
      } else if (kind === 'tite') {
        const len = Math.min(head * 0.45, (o.titeL ?? 1.6) * (0.25 + rng() * rng() * 1.4));
        B.mesh(stalactite(len, len * (0.1 + rng() * 0.07), seed), hangAt(x, ceil + 0.2, z, rng() * 6), X.calcite, { cast: false });
      } else if (kind === 'column') {
        if (head > (o.colMax ?? 14)) continue;
        const r = 0.35 + rng() * 0.6 + head * 0.04;
        B.mesh(column(head + 0.6, r, seed), placeAt(x, f - 0.3, z, rng() * 6), X.calcite);
        B.physics.addCylinder({ x, z, r: r * 0.85, y0: f - 0.5, y1: ceil, walkable: false, material: 'rock' });
      } else if (kind === 'boulder') {
        const r = 0.5 + rng() * (o.boulderR ?? 1.2);
        B.mesh(boulder(r, seed, [0.5, 0.46, 0.4]), placeAt(x, f + r * 0.15, z, rng() * 6), S.ctx.world.caveMat);
        B.physics.addCylinder({ x, z, r: r * 0.85, y0: f - 0.5, y1: f + r * 0.8, walkable: true, material: 'rock' });
      } else if (kind === 'flow') {
        const r = 0.8 + rng() * 1.4;
        B.mesh(flowLump(r, r * (0.5 + rng() * 0.4), r * (0.8 + rng() * 0.3), seed), placeAt(x, f - r * 0.2, z, rng() * 6), X.calcite);
        B.physics.addCylinder({ x, z, r: r * 0.8, y0: f - 0.5, y1: f + r * 0.4, walkable: true, material: 'rock' });
      }
      placed++;
    }
    return placed;
  };

  // samplers
  K.inEllipse = (cx, cz, rx, rz, rot = 0) => (rng) => {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    const lx = Math.cos(a) * rx * r;
    const lz = Math.sin(a) * rz * r;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [cx + lx * c - lz * s, cz + lx * s + lz * c];
  };
  K.inRect = (x0, z0, x1, z1) => (rng) => [x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0)];
  K.alongLine = (pts, spread) => (rng) => {
    const i = Math.floor(rng() * (pts.length - 1));
    const t = rng();
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const off = (rng() * 2 - 1) * spread;
    return [ax + (bx - ax) * t - ((bz - az) / len) * off, az + (bz - az) * t + ((bx - ax) / len) * off];
  };

  // the point `dist` metres along a polyline, `off` metres to its right (negative: left)
  K.beside = (pts, dist, off = 0) => {
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (d + len >= dist || i === pts.length - 2) {
        const t = Math.min(1, Math.max(0, (dist - d) / len));
        const tx = (bx - ax) / len;
        const tz = (bz - az) / len;
        return [ax + (bx - ax) * t - tz * off, az + (bz - az) * t + tx * off, Math.atan2(-tz, tx)];
      }
      d += len;
    }
    return null;
  };

  // the nearest wall from (x,z) heading along (dx,dz): { x, z } where the rock begins
  K.toWall = (x, z, dx, dz, max = 30, stop = 0.4) => {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    for (let t = 0; t < max; t += 0.1) {
      if (D(x + dx * t, z + dz * t) < stop) return { x: x + dx * t, z: z + dz * t, t };
    }
    return null;
  };

  void clamp;
  void signTex;
  return K;
}
