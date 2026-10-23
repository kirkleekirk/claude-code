import * as THREE from 'three';
import { L_TRACK } from './layout.js';
import { sol } from './solid.js';
import { rng } from './geo.js';

// The elevated L: the Lake Street line along the north of the map and the Wabash line down the
// east, two tracks on a riveted steel deck carried by latticed bents. Over Lake Street one span
// came down whole and lies tilted from the deck to the street (a ramp up for anyone on foot); a
// train hangs off the broken edge. The Wabash platform has its canopy and a stair to the street.

const GREEN = 0x2d3b32, TIE = 0x3a2c22, RAIL = 0x6d6a66, PLANK = 0x5b4d3e;
const T = L_TRACK;
const DECK0 = T.deck, DECK1 = T.deck + T.depth; // underside and top of the deck

/** a mapper for one line: u runs along it, v across it (v = 0 on its centre line) */
function frame(axis, c) {
  return axis === 'x'
    ? { P: (u, y, v) => [u, y, c + v], box: (gb, u0, y0, v0, u1, y1, v1, f) => gb.box(Math.min(u0, u1), y0, c + Math.min(v0, v1), Math.max(u0, u1), y1, c + Math.max(v0, v1), f), col: (u0, y0, v0, u1, y1, v1) => [Math.min(u0, u1), y0, c + Math.min(v0, v1), Math.max(u0, u1), y1, c + Math.max(v0, v1)] }
    : { P: (u, y, v) => [c + v, y, u], box: (gb, u0, y0, v0, u1, y1, v1, f) => gb.box(c + Math.min(v0, v1), y0, Math.min(u0, u1), c + Math.max(v0, v1), y1, Math.max(u0, u1), f), col: (u0, y0, v0, u1, y1, v1) => [c + Math.min(v0, v1), y0, Math.min(u0, u1), c + Math.max(v0, v1), y1, Math.max(u0, u1)] };
}

/** the deck from u = a to b: girders, ties, rails, walkways, railings; returns its collider */
function deck(gb, F, a, b, w, { rails = true, railing = true } = {}) {
  const hw = w / 2;
  sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.45, grime: 0.55 });
  // outer plate girders with stiffeners, inner girders under each rail line
  for (const s of [-1, 1]) {
    F.box(gb, a, DECK0, s * (hw - 0.35), b, DECK1 - 0.18, s * hw, 'xXyYzZ');
    for (let u = a + 0.75; u < b - 0.3; u += 1.5) F.box(gb, u - 0.06, DECK0 + 0.05, s * hw, u + 0.06, DECK1 - 0.22, s * (hw + 0.1), 'xXzZ');
    F.box(gb, a, DECK1 - 0.3, s * hw, b, DECK1 - 0.18, s * (hw + 0.18), 'yYzZ');
  }
  for (const v of [-3.22, -1.78, 1.78, 3.22]) F.box(gb, a, DECK0 + 0.15, v - 0.15, b, DECK1 - 0.2, v + 0.15, 'yzZ');
  if (rails) {
    sol(gb, TIE, { pat: 'wood', rough: 0.9, grime: 0.6 });
    for (const t of [-2.5, 2.5]) for (let u = a + 0.3; u < b - 0.1; u += 0.6) F.box(gb, u - 0.11, DECK1 - 0.2, t - 1.3, u + 0.11, DECK1 - 0.02, t + 1.3, 'xXyYzZ');
    sol(gb, RAIL, { pat: 'steel', rough: 0.35, metal: 0.85, grime: 0.2 });
    for (const t of [-2.5, 2.5]) for (const r of [-0.72, 0.72]) F.box(gb, a, DECK1 - 0.02, t + r - 0.04, b, DECK1 + 0.14, t + r + 0.04, 'yYzZ');
    // the third rail under its cover board
    sol(gb, PLANK, { pat: 'wood', rough: 0.9, grime: 0.5 });
    for (const t of [-2.5, 2.5]) F.box(gb, a, DECK1 + 0.12, t + Math.sign(t) * 1.15 - 0.15, b, DECK1 + 0.17, t + Math.sign(t) * 1.15 + 0.15, 'yYzZ');
  }
  // plank walkways in the middle and along the edges, a railing outside
  sol(gb, PLANK, { pat: 'wood', rough: 0.9, grime: 0.55 });
  F.box(gb, a, DECK1 - 0.16, -0.75, b, DECK1 - 0.04, 0.75, 'yYzZ');
  for (const s of [-1, 1]) F.box(gb, a, DECK1 - 0.16, s * (hw - 1.15), b, DECK1 - 0.04, s * (hw - 0.05), 'yYzZ');
  if (railing) {
    sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.4, grime: 0.5 });
    for (const s of [-1, 1]) {
      for (let u = a + 0.2; u < b; u += 2.4) F.box(gb, u - 0.04, DECK1, s * (hw - 0.12), u + 0.04, DECK1 + 1.05, s * (hw - 0.04), 'xXzZ');
      F.box(gb, a, DECK1 + 1.0, s * (hw - 0.13), b, DECK1 + 1.08, s * (hw - 0.03), 'yYzZ');
      F.box(gb, a, DECK1 + 0.5, s * (hw - 0.11), b, DECK1 + 0.55, s * (hw - 0.05), 'yYzZ');
    }
  }
  return F.col(a, DECK0, -hw, b, DECK1, hw);
}

/** a latticed bent at u: two built-up columns, the cross girder, knee braces, footings */
function bent(gb, F, boxes, u, w) {
  const hw = w / 2, top = DECK0 - 0.6;
  const alongX = F.P(1, 0, 0)[0] !== F.P(0, 0, 0)[0];
  const across = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.45, grime: 0.6 });
  F.box(gb, u - 0.32, top, -hw - 0.25, u + 0.32, DECK0, hw + 0.25, 'xXyzZ');
  for (const s of [-1, 1]) {
    const v = s * (hw - 0.55);
    // two channels, laced together on both open faces
    for (const d of [-0.22, 0.22]) F.box(gb, u + d - 0.07, 0.35, v - 0.26, u + d + 0.07, top, v + 0.26, 'xXzZ');
    let k = 1;
    for (let y = 0.65; y < top - 0.45; y += 0.36, k = -k) for (const f of [-0.25, 0.25]) {
      q.setFromAxisAngle(across, k * 0.7);
      m.compose(new THREE.Vector3(...F.P(u, y + 0.18, v + f)), q, one);
      gb.boxM(m, alongX ? 0.5 : 0.04, 0.05, alongX ? 0.04 : 0.5);
    }
    // a knee brace to the cross girder, a concrete footing
    beamTo(gb, F.P(u, top - 2.2, v), F.P(u, top, v - s * 1.6), 0.16, 0.16);
    sol(gb, 0x77736b, { pat: 'rubble', rough: 0.95, grime: 0.4 });
    F.box(gb, u - 0.65, -0.3, v - 0.65, u + 0.65, 0.35, v + 0.65, 'xXzZY');
    sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.45, grime: 0.6 });
    boxes.push(F.col(u - 0.32, 0, v - 0.3, u + 0.32, top, v + 0.3));
  }
}

/** a square beam between two points */
function beamTo(gb, a, b, w, d) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, Math.abs(dir.y) > 0.99 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  gb.boxM(m, w, d, len);
}

/**
 * A CTA car, its frame given by m (origin at the floor's centre, length along local x). Stainless
 * body, a red and blue stripe, windows and doors, roof units, trucks; `burnt` strips it black.
 */
export function ctaCar(gb, m, { burnt = false, lit = false } = {}) {
  gb.setXf(m);
  const L = 7.3, W = 1.45;
  const body = burnt ? () => sol(gb, 0x2a2622, { pat: 'burnt', rough: 0.95, grime: 0.7 }) : () => sol(gb, 0xb7bcbf, { pat: 'steel', rough: 0.32, metal: 0.75, grime: 0.35 });
  body();
  gb.box(-L, 0.35, -W, L, 3.45, W, 'xXyYzZ');
  // stripe, windows, doors (thin skins just proud of the body)
  if (!burnt) {
    sol(gb, 0xa31f2b, { rough: 0.5, metal: 0.3, grime: 0.2 });
    for (const s of [-1, 1]) gb.box(-L + 0.2, 1.05, s * W - 0.015, L - 0.2, 1.22, s * W + 0.015, s > 0 ? 'Z' : 'z');
    sol(gb, 0x234a8c, { rough: 0.5, metal: 0.3, grime: 0.2 });
    for (const s of [-1, 1]) gb.box(-L + 0.2, 1.22, s * W - 0.015, L - 0.2, 1.32, s * W + 0.015, s > 0 ? 'Z' : 'z');
  }
  sol(gb, burnt ? 0x050505 : 0x182024, { pat: burnt ? 'plain' : 'glass', rough: 0.1, metal: 0.6, emit: lit ? 0.4 : 0, grime: 0.15 });
  for (const s of [-1, 1]) {
    for (let x = -L + 0.9; x < L - 1.2; x += 1.9) {
      if (Math.abs(x + 0.7 - L / 2) < 1 || Math.abs(x + 0.7 + L / 2) < 1) continue;
      gb.box(x, 1.55, s * W - 0.02, x + 1.45, 2.55, s * W + 0.02, s > 0 ? 'Z' : 'z');
    }
    for (const dx of [-L / 2, L / 2]) gb.box(dx - 0.65, 0.5, s * W - 0.025, dx + 0.65, 2.75, s * W + 0.025, s > 0 ? 'Z' : 'z');
  }
  for (const s of [-1, 1]) gb.box(s * L - 0.02, 1.5, -1.0, s * L + 0.02, 2.6, 1.0, s > 0 ? 'X' : 'x');
  if (!burnt) {
    sol(gb, 0xff9a2a, { pat: 'lamp', emit: 1.6, rough: 0.5, grime: 0 });
    for (const s of [-1, 1]) gb.box(s * L - 0.03, 2.75, -0.5, s * L + 0.03, 3.05, 0.5, s > 0 ? 'X' : 'x');
  }
  body();
  gb.box(-L * 0.7, 3.45, -0.9, -L * 0.3, 3.85, 0.9, 'xXzZY');
  gb.box(L * 0.3, 3.45, -0.9, L * 0.7, 3.85, 0.9, 'xXzZY');
  sol(gb, 0x1c1c1c, { pat: 'steel', rough: 0.7, metal: 0.5, grime: 0.7 });
  for (const x of [-L + 1.6, L - 1.6]) gb.box(x - 1.2, -0.05, -1.05, x + 1.2, 0.45, 1.05, 'xXzZy');
  gb.setXf(null);
}

/** carFrame: a matrix from the car's floor centre, its heading (yaw around y) and pitch */
function carFrame(x, y, z, yaw, pitch = 0, roll = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YXZ')), new THREE.Vector3(1, 1, 1));
}

export function buildElevated(gb, boxes) {
  const R = rng(7);
  const N = frame('x', T.north.z), E = frame('z', T.east.x);
  const nw = T.north.w, ew = T.east.w;
  const bx = T.broken;
  // ---- the Lake Street line: from its torn west end to the corner, the fallen span left out
  const nEnd = T.east.x - ew / 2;
  boxes.push(deck(gb, N, T.north.x0, bx.x0, nw));
  boxes.push(deck(gb, N, bx.x1, nEnd, nw));
  for (let u = T.north.x0 + 6; u < nEnd - 4; u += T.bentEvery) {
    if (u > bx.x0 + 1 && u < bx.x1 - 1) continue; // its bent came down with it
    bent(gb, N, boxes, u, nw);
  }
  // the torn west end: rails curling down off the last of the deck
  sol(gb, RAIL, { pat: 'steel', rough: 0.4, metal: 0.8, grime: 0.3 });
  for (const t of [-2.5, 2.5]) for (const r of [-0.72, 0.72]) {
    let p = N.P(T.north.x0, DECK1 + 0.06, t + r);
    for (let k = 0; k < 6; k++) {
      const th = 0.3 + k * 0.27 + R() * 0.1;
      const q = [p[0] - 0.9 * Math.cos(th), p[1] - 0.9 * Math.sin(th), p[2] + (R() - 0.5) * 0.25];
      beamTo(gb, p, q, 0.08, 0.15); p = q;
    }
  }
  // ---- the fallen span: hinged at its west end, lying on the street at its east end
  {
    const hiTop = DECK1, loTop = 0.62, run = bx.x1 - bx.x0;
    const ang = Math.atan2(hiTop - loTop, run), len = Math.hypot(run, hiTop - loTop);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx.x0, hiTop, T.north.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang), new THREE.Vector3(1, 1, 1));
    m.multiply(new THREE.Matrix4().makeTranslation(0, -DECK1, 0));
    gb.setXf(m);
    deck(gb, frame('x', 0), 0, len, nw, { railing: false });
    gb.setXf(null);
    // walkable as steps of 0.3 m
    const steps = Math.ceil((hiTop - loTop) / 0.3);
    for (let i = 0; i < steps; i++) {
      const x0 = bx.x0 + run * i / steps, x1 = bx.x0 + run * (i + 1) / steps;
      const yTop = hiTop - (hiTop - loTop) * (i + 0.5) / steps;
      boxes.push([x0, Math.max(0, yTop - 1.1), T.north.z - nw / 2, x1, yTop, T.north.z + nw / 2]);
    }
    // its bent, flat on the street beside it
    sol(gb, GREEN, { pat: 'steel', rough: 0.65, metal: 0.4, grime: 0.7 });
    const bxm = (bx.x0 + bx.x1) / 2 + 2, bzm = T.north.z + nw / 2 + 2.6;
    gb.setXf(new THREE.Matrix4().compose(new THREE.Vector3(bxm, 0, bzm), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3), new THREE.Vector3(1, 1, 1)));
    for (const d of [-4, 4]) gb.box(d - 0.3, 0, -3.3, d + 0.3, 0.55, 3.3);
    gb.box(-4.6, 0, 2.9, 4.6, 0.62, 3.5);
    gb.setXf(null);
    boxes.push([bxm - 4.6, 0, bzm - 3.6, bxm + 4.6, 0.6, bzm + 3.6]);
    // a car run off the east part's broken edge: nose down on the fallen span, tail in the air
    const noseX = bx.x0 + run * 0.68, noseY = hiTop - (hiTop - loTop) * 0.68 + 0.25, edge = [bx.x1, DECK1 + 0.15];
    const pitch = Math.atan2(edge[1] - noseY, edge[0] - noseX), cl = 14.6;
    const cxm = noseX + Math.cos(pitch) * cl / 2, cym = noseY + Math.sin(pitch) * cl / 2;
    ctaCar(gb, carFrame(cxm, cym, T.north.z - 2.5, 0, pitch, 0.06));
    for (let k = 0; k < 5; k++) {
      const a = noseX + Math.cos(pitch) * cl * k / 5, b = noseX + Math.cos(pitch) * cl * (k + 1) / 5;
      const ya = noseY + Math.sin(pitch) * cl * k / 5;
      boxes.push([a, ya, T.north.z - 2.5 - 1.45, b, ya + Math.sin(pitch) * cl / 5 + 3.2, T.north.z - 2.5 + 1.45]);
    }
  }
  // ---- the Wabash line from the corner south, past the end of the map
  boxes.push(deck(gb, E, T.east.z0, T.east.z1 + 70, ew));
  for (let u = T.east.z0 + 0.5; u < T.east.z1 + 70; u += T.bentEvery) bent(gb, E, boxes, u, ew);
  // the corner: curved track from one line to the other
  sol(gb, RAIL, { pat: 'steel', rough: 0.35, metal: 0.85, grime: 0.2 });
  const cx = nEnd, cz = T.north.z + nw / 2;
  for (const [rr, off] of [[2.5, 0], [7.5, 0]]) for (const r of [-0.72, 0.72]) {
    const rad = rr + r + off;
    let p = null;
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI / 2;
      const q = [cx + Math.sin(a) * rad, DECK1 + 0.06, cz - Math.cos(a) * rad];
      if (p) beamTo(gb, p, q, 0.08, 0.16);
      p = q;
    }
  }
  // ---- the Wabash platform: west of the tracks, canopy, a stair down to the street
  {
    const st = T.station, x1 = T.east.x - ew / 2, x0 = x1 - 3.4, top = DECK1 + 0.3;
    sol(gb, 0x6d6b66, { pat: 'rubble', rough: 0.9, grime: 0.5 });
    gb.box(x0, DECK0, st.z0, x1, top, st.z1);
    sol(gb, 0xd8b23a, { rough: 0.6, grime: 0.3 });
    gb.box(x1 - 0.35, top, st.z0, x1 - 0.05, top + 0.01, st.z1, 'Y');
    boxes.push([x0, DECK0, st.z0, x1, top, st.z1]);
    sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.4, grime: 0.5 });
    for (let z = st.z0 + 1; z < st.z1; z += 4.5) {
      gb.box(x0 + 1.5, top, z - 0.1, x0 + 1.7, top + 3.3, z + 0.1, 'xXzZ');
      boxes.push([x0 + 1.4, top, z - 0.15, x0 + 1.8, top + 3.3, z + 0.15]);
    }
    // the canopy: a shallow butterfly roof
    sol(gb, 0x4d4a44, { pat: 'steel', rough: 0.7, metal: 0.4, grime: 0.6 });
    gb.face([0, 1, 0], [x0 - 0.4, top + 3.6, st.z0], [x0 + 1.6, top + 3.3, st.z0], [x0 + 1.6, top + 3.3, st.z1], [x0 - 0.4, top + 3.6, st.z1]);
    gb.face([0, -1, 0], [x0 - 0.4, top + 3.55, st.z0], [x0 + 1.6, top + 3.25, st.z0], [x0 + 1.6, top + 3.25, st.z1], [x0 - 0.4, top + 3.55, st.z1]);
    gb.face([0, 1, 0], [x0 + 1.6, top + 3.3, st.z0], [x1 + 0.6, top + 3.7, st.z0], [x1 + 0.6, top + 3.7, st.z1], [x0 + 1.6, top + 3.3, st.z1]);
    gb.face([0, -1, 0], [x0 + 1.6, top + 3.25, st.z0], [x1 + 0.6, top + 3.65, st.z0], [x1 + 0.6, top + 3.65, st.z1], [x0 + 1.6, top + 3.25, st.z1]);
    boxes.push([x0 - 0.4, top + 3.25, st.z0, x1 + 0.6, top + 3.7, st.z1]);
    // railing on the street side, a station sign
    for (let z = st.z0; z <= st.z1; z += 2.2) gb.box(x0 + 0.02, top, z - 0.03, x0 + 0.08, top + 1.1, z + 0.03, 'xXzZ');
    gb.box(x0 + 0.02, top + 1.05, st.z0, x0 + 0.1, top + 1.12, st.z1, 'xXyY');
    sol(gb, 0x1d2a3a, { rough: 0.5, grime: 0.3 });
    gb.box(x0 + 1.5, top + 2.4, st.z0 + 7, x0 + 1.7, top + 3.0, st.z0 + 11);
    // stair: down the outside of the platform toward the south, to the sidewalk
    const sx0 = x0 - 2.2, sx1 = x0 - 0.1, n = Math.ceil(top / 0.3), run = 0.42;
    sol(gb, 0x5f5d58, { pat: 'rubble', rough: 0.9, grime: 0.6 });
    for (let i = 0; i < n; i++) {
      const y = top - (i + 1) * (top / n), z0 = st.z1 + i * run;
      gb.box(sx0, Math.max(0, y - 0.3), z0, sx1, y + top / n, z0 + run, 'xXyYzZ');
      boxes.push([sx0, Math.max(0, y - 0.3), z0, sx1, y + top / n, z0 + run]);
    }
    gb.box(sx0, top - 0.4, st.z1 - 2.4, sx1, top, st.z1);
    boxes.push([sx0, top - 0.4, st.z1 - 2.4, sx1, top, st.z1]);
    sol(gb, GREEN, { pat: 'steel', rough: 0.6, metal: 0.4, grime: 0.5 });
    beamTo(gb, [sx0 - 0.05, top + 1.0, st.z1], [sx0 - 0.05, 1.0, st.z1 + n * run], 0.06, 0.06);
  }
  // ---- trains: one stalled on the Wabash line, a burnt pair on the Lake Street line
  ctaCar(gb, carFrame(T.east.x + 2.5, DECK1 + 0.15, -20, Math.PI / 2), { lit: true });
  ctaCar(gb, carFrame(T.east.x + 2.5, DECK1 + 0.15, -5.2, Math.PI / 2), { lit: true });
  boxes.push([T.east.x + 1, DECK1, -27.5, T.east.x + 4, DECK1 + 3.85, 2.3]);
  ctaCar(gb, carFrame(52, DECK1 + 0.15, T.north.z + 2.5, 0), { burnt: true });
  ctaCar(gb, carFrame(66.8, DECK1 + 0.15, T.north.z + 2.5, 0.02), { burnt: true });
  boxes.push([44.5, DECK1, T.north.z + 1, 74.3, DECK1 + 3.85, T.north.z + 4]);
}
