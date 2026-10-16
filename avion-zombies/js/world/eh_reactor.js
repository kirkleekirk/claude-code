import * as THREE from '../../vendor/three.module.min.js';
import { PIT } from './eh_shape.js';
import { signTex, stairs } from './eh_props.js';
import { boulder, placeAt } from './formations.js';
import { makeRng } from '../util.js';

// The CALDERA: Avion's geothermal reactor in a basalt dome over a magma pit. A gantry carries
// the core over the pit, steam mains feed two turbines, the control room looks out over it all,
// and the service lift runs from the alcove up to the visitor center.
const R = -66; // chamber floor
export const CAL = {
  center: { x: 54, z: -226, rx: 31, rz: 25 },
  doorK: { x: 21, z: -225.6, rot: Math.PI / 2 + 0.227 },
  core: { x: PIT.x, z: PIT.z, r: 4.2, top: R + 14 },
  turbines: [{ x: 34, z: -240 }, { x: 70, z: -240 }],
  control: { x0: 76, x1: 83.5, z0: -231, z1: -217, floor: R + 0.9 },
  masts: [[31.5, -217.5], [33.5, -238.5], [54, -248.4], [75.5, -242.5], [69, -209.5], [40, -206.5]],
  alcove: { x: 54, z: -199.6 },
};

export function buildReactor(S, K) {
  const { B, M, X, fx } = S;
  const { F } = K;
  const rng = makeRng(6620);
  const { x: px, z: pz } = PIT;
  for (const [x, z, r] of [[CAL.alcove.x, CAL.alcove.z - 2, 4], [64.5, -209.5, 3], [64, -243.5, 2.6], [79.75, -224, 9], ...CAL.turbines.map((t) => [t.x, t.z, 5.5]), ...CAL.masts.map(([x, z]) => [x, z, 1.6])]) K.reserve(x, z, r);

  // ---- the CALDERA bulkhead in the link ---------------------------------------------------------------
  const cs = signTex([{ text: 'CALDERA', size: 92 }, { text: 'GEOTHERMAL UNIT 1 • LEVEL B6', size: 30, weight: 600 }], { w: 512, h: 170, bg: '#1d2226', fg: '#ffb84a' });
  K.bulkhead(CAL.doorK.x, CAL.doorK.z, CAL.doorK.rot, 7.4, 5.2, { sign: cs, half: 6.8, tall: 10, t: 1.0 });
  K.walkway([[19.6, -226.3], [27, -227.2], [33, -226.6]], 3.2, { mat: M.concrete, uv: 3 });

  // ---- the floor: poured concrete round the pit, hazard ring at its edge ------------------------------
  {
    const { x, z, rx, rz } = CAL.center;
    const shape = new THREE.Shape();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      shape[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * (rx - 0.6), -(z + Math.sin(a) * (rz - 0.6)));
    }
    const hole = new THREE.Path();
    for (let k = 0; k <= 48; k++) {
      const a = -(k / 48) * Math.PI * 2;
      hole[k ? 'lineTo' : 'moveTo'](px + Math.cos(a) * (PIT.r + 0.9), -(pz + Math.sin(a) * (PIT.r + 0.9)));
    }
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 4);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    B.mesh(g, new THREE.Matrix4().makeTranslation(0, R + 0.06, 0), M.floor, { cast: false });
    // the hazard ring and a lip of steel round the pit
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const a2 = ((k + 1) / 48) * Math.PI * 2;
      const r = PIT.r + 1.3;
      const x1 = px + Math.cos(a) * r;
      const z1 = pz + Math.sin(a) * r;
      const x2 = px + Math.cos(a2) * r;
      const z2 = pz + Math.sin(a2) * r;
      B.box((x1 + x2) / 2, R + 0.07, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) + 0.02, 0.012, 0.7, { mat: M.hazard, rot: Math.atan2(-(z2 - z1), x2 - x1), collide: false, cast: false });
    }
  }

  // ---- the pit: lava far below, a rail round the rim, its glow always on ------------------------------
  {
    const g = new THREE.CircleGeometry(PIT.r + 1.5, 40);
    g.rotateX(-Math.PI / 2);
    B.mesh(g, new THREE.Matrix4().makeTranslation(px, PIT.lava, pz), X.lava, { cast: false });
    for (let k = 0; k < 22; k++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * (PIT.r - 1.5);
      const c = new THREE.CircleGeometry(0.6 + rng() * 1.8, 7);
      c.rotateX(-Math.PI / 2);
      c.scale(1, 1, 0.6 + rng() * 0.6);
      B.mesh(c, new THREE.Matrix4().makeTranslation(px + Math.cos(a) * r, PIT.lava + 0.04, pz + Math.sin(a) * r), X.lavaCrust, { cast: false });
    }
    // rail
    const rr = PIT.r + 1.05;
    const posts = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      posts.push([px + Math.cos(a) * rr, pz + Math.sin(a) * rr]);
    }
    for (let k = 0; k < posts.length; k++) {
      const [x1, z1] = posts[k];
      const [x2, z2] = posts[(k + 1) % posts.length];
      const gap = Math.abs(Math.atan2(z1 - pz, x1 - px) - Math.PI / 2) < 0.14 || Math.abs(Math.atan2(z1 - pz, x1 - px) + Math.PI / 2) < 0.14;
      B.box(x1, R, z1, 0.09, 1.1, 0.09, { mat: X.paintYellow, collide: false });
      if (gap) continue;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rot = Math.atan2(-(z2 - z1), x2 - x1);
      for (const hy of [0.55, 1.05]) B.box((x1 + x2) / 2, R + hy, (z1 + z2) / 2, len, 0.07, 0.07, { mat: X.paintYellow, rot, collide: false });
      B.physics.addBox({ x: (x1 + x2) / 2, y: R, z: (z1 + z2) / 2, w: len, h: 1.15, d: 0.14, rot, walkable: false, material: 'metal', bullets: false });
    }
    // the glow comes from the magma whatever the power: real lights at the rim, embers, steam
    // (below the floor's edge, so they light the dome and the core from beneath, not the floor)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      B.lamp(px + Math.cos(a) * 8, R - 2.2, pz + Math.sin(a) * 8, { color: 0xff5a18, intensity: 42, distance: 48, breathe: 0.3, glow: false, mesh: false });
    }
    B.lamp(px, PIT.lava + 6, pz, { color: 0xff7a28, intensity: 26, distance: 36, breathe: 0.25, glow: false, mesh: false });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      fx.embers.push({ x: px + Math.cos(a) * 6, y: PIT.lava + 1, z: pz + Math.sin(a) * 6, r: 5 });
    }
    for (const a of [0.9, 2.6, 4.1, 5.5]) fx.steam.push({ x: px + Math.cos(a) * (PIT.r - 0.5), y: R - 1.5, z: pz + Math.sin(a) * (PIT.r - 0.5), r: 1.6, rate: 1.4, big: true });
    const hot = signTex([{ text: 'DANGER', size: 80, color: '#c8241c' }, { text: 'MAGMA 1,100°C • DO NOT CROSS RAIL', size: 28, weight: 600 }], { w: 512, h: 170, bg: '#e8e2d2', fg: '#1a1a1a' });
    for (const a of [Math.PI * 0.25, Math.PI * 1.1]) {
      const x = px + Math.cos(a) * (rr + 0.04);
      const z = pz + Math.sin(a) * (rr + 0.04);
      B.sign(x, R + 0.8, z, Math.atan2(Math.cos(a), Math.sin(a)), hot, 0.9, 0.3);
    }
  }

  // ---- the gantry and the core -------------------------------------------------------------------------
  {
    const { x, z, r, top } = CAL.core;
    const span = PIT.r + 3.5;
    for (const s of [-1, 1]) {
      B.box(x + s * 2.6, R - 0.8, z, 0.5, 0.9, span * 2, { mat: M.steelDark, collide: false, uv: 2 });
      B.box(x + s * 2.6, R + 0.05, z, 0.9, 0.08, span * 2, { mat: M.steelDark, collide: false });
      B.box(x + s * 2.6, R - 0.85, z, 0.9, 0.08, span * 2, { mat: M.steelDark, collide: false });
    }
    for (let k = -6; k <= 6; k++) B.box(x, R - 0.5, z + k * 2.4, 5.4, 0.25, 0.25, { mat: M.steelDark, collide: false });
    // the vessel: banded steel on the gantry, a dome, the exchanger column down into the magma
    B.cylinder(x, R + 0.1, z, r, top - R - 0.1, { mat: M.steelDark, seg: 28, collide: false });
    const dome = new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    B.mesh(dome, new THREE.Matrix4().makeTranslation(x, top, z), M.steel);
    B.cylinder(x, PIT.lava - 1, z, 1.7, R - PIT.lava + 1, { mat: M.rust, seg: 16, collide: false });
    for (const hy of [3.5, 7.5, 11.5]) {
      B.cylinder(x, R + hy, z, r + 0.12, 0.5, { mat: M.black, seg: 28, collide: false });
      const ring = new THREE.CylinderGeometry(r + 0.16, r + 0.16, 0.18, 32, 1, true);
      B.fixture(ring, new THREE.Matrix4().makeTranslation(x, R + hy + 0.25, z), 0xffa048, 5, 'reactor');
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.box(x + Math.cos(a) * (r + 0.1), R + 0.1, z + Math.sin(a) * (r + 0.1), 0.3, top - R - 0.2, 0.3, { mat: M.steel, rot: -a, collide: false });
    }
    B.bakedLamp(x, R + 8, z, { color: 0xffb060, intensity: 160, range: 34, circuit: 'reactor', fitting: null, glow: 6 });
    const name = signTex([{ text: 'CALDERA', size: 120 }], { w: 512, h: 128, bg: '#2a2e33', fg: '#ffb84a' });
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      B.sign(x, R + 9.5, z + Math.sin(a) * (r + 0.36), a === Math.PI / 2 ? 0 : Math.PI, name, 3.4, 0.85);
    }
    // the catwalk out along the gantry to the core's hatch
    B.box(x, R + 0.15, z + span / 2 + r / 2 - 0.5, 1.6, 0.08, span - r + 1, { mat: X.grate, collide: false });
    fx.beacons.push({ x, y: top + r + 0.3, z, color: 0xff2a1a, always: true, big: true });
  }

  // ---- steam mains and the two turbines ------------------------------------------------------------------
  for (const t of CAL.turbines) {
    const y = R;
    B.box(t.x, y, t.z, 8.4, 1.0, 3.8, { mat: M.concrete, uv: 2, walkable: true });
    B.cylinder(t.x - 0.6, y + 1.0, t.z, 1.75, 6.4, { mat: X.paintBlue, horizontal: true, rot: 0, seg: 22, collide: false });
    B.box(t.x + 3.2, y + 1.0, t.z, 2.2, 3.0, 3.0, { mat: M.steelDark, collide: false, uv: 2 });
    for (let k = 0; k < 5; k++) B.cylinder(t.x - 3.2 + k * 1.3, y + 1.0, t.z, 1.82, 0.14, { mat: M.steel, horizontal: true, rot: 0, seg: 22, collide: false });
    B.physics.addBox({ x: t.x, y: y + 1.0, z: t.z, w: 8.0, h: 3.6, d: 3.6, walkable: false, material: 'metal' });
    const tag = signTex([{ text: t.x < 50 ? 'TG-1' : 'TG-2', size: 90 }], { w: 256, h: 128, bg: '#2f4e70', fg: '#f0ead8' });
    B.sign(t.x - 0.6, y + 2.75, t.z + 1.78, 0, tag, 1.0, 0.5);
    // the main from the core, over the rim on a pylon
    const a = new THREE.Vector3(CAL.core.x + Math.sign(t.x - CAL.core.x) * 3.2, R + 6.5, CAL.core.z - 2.5);
    const b = new THREE.Vector3(t.x + Math.sign(CAL.core.x - t.x) * 2.6, R + 6.5, t.z);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.7, 0.7, len, 14, 1, true);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    B.mesh(g, m, M.steel, { cast: true });
    B.cylinder(b.x, R + 2.6, b.z, 0.7, 4.6, { mat: M.steel, seg: 14, collide: false });
    // its pylon stands just outside the rail where the main crosses the rim
    let tt = 0;
    for (let k = 0; k <= 100; k++) {
      const p = a.clone().lerp(b, k / 100);
      if (Math.hypot(p.x - PIT.x, p.z - PIT.z) > PIT.r + 2.4) {
        tt = k / 100;
        break;
      }
    }
    const mid = a.clone().lerp(b, tt);
    B.box(mid.x, R, mid.z, 0.6, 5.8, 0.6, { mat: M.steelDark, walkable: false });
    B.box(mid.x, R + 5.6, mid.z, 1.6, 0.25, 0.6, { mat: M.steelDark, collide: false });
  }

  // ---- the control room -------------------------------------------------------------------------------------
  {
    const C = CAL.control;
    const cx = (C.x0 + C.x1) / 2;
    const cz = (C.z0 + C.z1) / 2;
    const h = 3.4;
    B.box(cx, R, cz, C.x1 - C.x0, C.floor - R, C.z1 - C.z0, { mat: M.concrete, uv: 2, walkable: true });
    // glass front facing the pit, posts, side walls with the door on the south side, roof
    B.box(C.x0 + 0.1, C.floor + 0.9, cz, 0.06, h - 1.0, C.z1 - C.z0, { mat: M.glass, collide: false, cast: false });
    B.box(C.x0 + 0.1, C.floor, cz, 0.24, 0.9, C.z1 - C.z0, { mat: M.steelDark, walkable: false });
    for (let k = 0; k <= 5; k++) B.box(C.x0 + 0.1, C.floor, C.z0 + (k * (C.z1 - C.z0)) / 5, 0.2, h, 0.2, { mat: M.steelDark, collide: false });
    B.physics.addBox({ x: C.x0 + 0.1, y: C.floor, z: cz, w: 0.3, h, d: C.z1 - C.z0, walkable: false, material: 'metal', bullets: false });
    B.wall(C.x0, C.z0, C.x1, C.z0, { h, t: 0.25, y0: C.floor, mat: M.white, uv: 2 });
    B.wall(C.x0, C.z1, C.x1, C.z1, { h, t: 0.25, y0: C.floor, mat: M.white, uv: 2, openings: [{ at: 4.6, w: 1.5, h: 2.3 }] });
    B.wall(C.x1, C.z0, C.x1, C.z1, { h, t: 0.25, y0: C.floor, mat: M.white, uv: 2 });
    B.box(cx, C.floor + h, cz, C.x1 - C.x0 + 0.4, 0.3, C.z1 - C.z0 + 0.4, { mat: M.steelDark, walkable: false });
    stairs(B, M, M.steelDark, C.x0 + 4.6, C.z1 + 1.8, R, C.x0 + 4.6, C.z1 + 0.15, C.floor, 1.6, { railMat: X.paintYellow });
    const cr = signTex([{ text: 'CONTROL ROOM', size: 66 }, { text: 'CALDERA UNIT 1', size: 32, weight: 600 }], { w: 512, h: 150, bg: '#1d2226', fg: '#e8e4d8' });
    B.sign(C.x0 + 4.6, C.floor + 2.75, C.z1 + 0.14, 0, cr, 1.8, 0.53);
    // the console desk along the window, screens all along it
    B.box(C.x0 + 1.0, C.floor, cz, 0.9, 0.9, C.z1 - C.z0 - 1.6, { mat: M.steelDark, walkable: true });
    B.box(C.x0 + 0.9, C.floor + 0.9, cz, 1.1, 0.06, C.z1 - C.z0 - 1.4, { mat: M.black, collide: false });
    for (let k = 0; k < 6; k++) {
      const z = C.z0 + 1.6 + k * 2.15;
      if (Math.abs(z - -224) < 1.5) continue;
      fx.screens.push({ x: C.x0 + 0.75, y: C.floor + 1.25, z, rot: Math.PI / 2 });
    }
    // ceiling lights under the roof (real lamps: the room is too small for the baked light)
    for (const z of [C.z0 + 3, cz, C.z1 - 3]) {
      B.box(cx + 1.5, C.floor + h - 0.07, z, 0.24, 0.07, 1.45, { mat: M.steel, collide: false, cast: false });
      B.lamp(cx + 1.5, C.floor + h - 0.1, z, { color: 0xe8f0ff, intensity: 4, distance: 9, circuit: 'reactor', shape: 'tube', len: 1.3, rot: Math.PI / 2, glowSize: 1.0, bright: 4 });
    }
  }

  // ---- mast lights round the dome, the lift alcove, signs ----------------------------------------------------
  for (const [x, z] of CAL.masts) {
    const y = F(x, z);
    const mh = Math.min(10.5, K.CEIL(x, z) - y - 1.6);
    B.cylinder(x, y, z, 0.32, 0.5, { mat: M.concrete, seg: 10 });
    B.cylinder(x, y + 0.5, z, 0.12, mh, { mat: M.steelDark, seg: 8, collide: false });
    B.physics.addCylinder({ x, z, r: 0.34, y0: y, y1: y + mh + 0.5, walkable: false, material: 'metal' });
    // a third head turned on the dome behind the mast
    {
      let ox = x - CAL.core.x;
      let oz = z - CAL.core.z;
      const ol = Math.hypot(ox, oz);
      ox /= ol;
      oz /= ol;
      const w = K.toWall(x, z, ox, oz, 20, 0.2) || { x: x + ox * 6, z: z + oz * 6 };
      const dir = new THREE.Vector3(w.x - x, mh * 0.9, w.z - z).normalize();
      const yaw = Math.atan2(dir.x, dir.z);
      B.box(x, y + mh + 0.75, z, 0.6, 0.36, 0.44, { mat: M.black, rot: yaw, collide: false });
      B.bakedLamp(x + dir.x * 0.3, y + mh + 0.8 + dir.y * 0.3, z + dir.z * 0.3, {
        color: 0xffd8b0, intensity: 90, range: 28, circuit: 'reactor', glow: 1.2, rot: yaw, tilt: -Math.asin(dir.y),
        fitting: new THREE.BoxGeometry(0.5, 0.04, 0.34), bright: 6, spot: { dir, angle: 1.05, penumbra: 0.6 },
      });
    }
    for (const off of [-0.7, 0.7]) {
      const dir = new THREE.Vector3(CAL.core.x - x, -mh, CAL.core.z - z).normalize();
      const yaw = Math.atan2(dir.x, dir.z);
      const hx = x + Math.cos(yaw) * off;
      const hz = z - Math.sin(yaw) * off;
      B.box(hx, y + mh + 0.1, hz, 0.7, 0.4, 0.5, { mat: M.black, rot: yaw, collide: false });
      B.bakedLamp(hx + dir.x * 0.3, y + mh + 0.2 + dir.y * 0.3, hz + dir.z * 0.3, {
        color: 0xfff0dc, intensity: 130, range: 32, circuit: 'reactor', glow: 1.6, rot: yaw, tilt: -Math.asin(dir.y),
        fitting: new THREE.BoxGeometry(0.6, 0.04, 0.4), bright: 6, spot: { dir, angle: 0.95, penumbra: 0.5 },
      });
    }
  }
  {
    const banner = signTex([{ text: 'AVION GEOTHERMAL', size: 74 }, { text: 'CALDERA UNIT 1 • 410 MW • EMBER HOLLOW', size: 30, weight: 600 }], { w: 1024, h: 200, bg: '#1d2226', fg: '#e8e4d8' });
    const bx = 54;
    const bz = -249.2;
    B.box(bx, R + 6, bz - 0.15, 9.6, 2.1, 0.12, { mat: M.steelDark, collide: false });
    B.sign(bx, R + 7.05, bz - 0.06, 0, banner, 9.2, 1.8);
    for (const s of [-1, 1]) B.box(bx + s * 4.6, R, bz - 0.2, 0.18, 8.1, 0.18, { mat: M.steelDark, walkable: false });
    // a lamp over the lift's landing
    const ax = CAL.alcove.x;
    const az = CAL.alcove.z - 0.5;
    B.box(ax, R + 3.66, az, 0.6, 0.1, 0.32, { mat: M.steelDark, collide: false, cast: false });
    B.bakedLamp(ax, R + 3.6, az - 0.05, {
      color: 0xffe4c0, intensity: 10, range: 10, circuit: 'reactor', glow: 0.6, fitting: new THREE.BoxGeometry(0.5, 0.03, 0.24), bright: 4,
      spot: { dir: new THREE.Vector3(0, -1, -0.45), angle: 1.15, penumbra: 0.5 },
    });
    const lift = signTex([{ text: '↑ SERVICE LIFT', size: 64 }, { text: 'SURFACE • VISITOR CENTER', size: 30, weight: 600 }], { w: 512, h: 150, bg: '#1d2226', fg: '#e8e4d8' });
    K.board(CAL.alcove.x - 3.6, CAL.alcove.z - 5.4, 0.15, lift, 1.6, 0.47, { post: 1.7, boardMat: M.steelDark, postMat: M.steelDark });
  }
  for (const [x, z] of [[30.5, -225.2], [62, -207], [44, -246]]) K.emergency(x, R + 2.2, z, 0xff3a2a);
  // loose basalt fallen round the edges of the dome
  K.scatter(14, K.inEllipse(CAL.center.x, CAL.center.z, 29, 23), { seed: 61, clear: 2.5, minWall: 0.5, maxWall: 4, kind: () => 'boulder', boulderR: 1.4 });
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2;
    const x = CAL.center.x + Math.cos(a) * 27;
    const z = CAL.center.z + Math.sin(a) * 21;
    if (!K.cave.inExtent(x, z) || K.D(x, z) < 0.6 || K.isReserved(x, z)) continue;
    B.mesh(boulder(0.5, 9100 + k), placeAt(x, F(x, z) + 0.1, z, a), S.ctx.world.caveMat, { cast: false });
  }
}
