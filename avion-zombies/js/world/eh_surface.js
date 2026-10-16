import * as THREE from '../../vendor/three.module.min.js';
import { ehMaterials } from './eh_textures.js';
import { LOT, WALKWAY, STOCKADE_Z } from './eh_shape.js';
import { KESTREL } from './eh_layout.js';
import { frame, lotPole, railFence, stockade, parkSign, car, signTex, trashCan, bench, ribbon } from './eh_props.js';
import { buildLodge } from './eh_lodge.js';
import { buildMine } from './eh_mine.js';
import { buildPlaza } from './eh_plaza.js';
import { makeRng } from '../util.js';

// Ember Hollow above ground: the parking lot with the Kestrel, the visitor center, the gem mine
// and the cave entrance plaza. Each area's lamps hang on its own breaker.
export function buildSurface(B, ctx, fx) {
  const M = ctx.materials;
  const X = ehMaterials(M);
  const H = (x, z) => ctx.terrain.surfaceAt(x, z);
  const S = { B, M, X, H, fx, ctx };
  buildLot(S);
  buildKestrel(S);
  buildLodge(S);
  buildMine(S);
  buildPlaza(S);
}

// ---- the parking lot ------------------------------------------------------------------------
// Asphalt from x -42..46, z 63.6..101.4 with concrete walks north and south and planting strips
// along the fences (where zombies climb out of the woods).
const ASPHALT = { x0: -42, x1: 46, z0: 63.6, z1: 101.4 };
const ROW_A = { z0: 63.6, z1: 69.0 };
const ISLAND = { x0: -36, x1: 10, z0: 81.4, z1: 83.6 };
const ROW_B1 = { z0: 76.0, z1: 81.4 };
const ROW_B2 = { z0: 83.6, z1: 89.0 };
const ROW_C = { z0: 96.0, z1: 101.4 };
const STALL = 2.7;
const STALL_X0 = -34;

function buildLot(S) {
  const { B, M, X, H } = S;
  // asphalt, running on east as the old access road
  B.box((ASPHALT.x0 + ASPHALT.x1) / 2, -0.3, (ASPHALT.z0 + ASPHALT.z1) / 2, ASPHALT.x1 - ASPHALT.x0, 0.33, ASPHALT.z1 - ASPHALT.z0, { mat: M.asphalt, collide: false, uv: 7, cast: false });
  B.box((ASPHALT.x1 + 48) / 2, -0.3, 92.5, 48 - ASPHALT.x1 + 0.02, 0.33, 7, { mat: M.asphalt, collide: false, uv: 7, cast: false });
  const road = [];
  for (let x = 48; x <= 128; x += 1.5) road.push([x, roadZ(x)]);
  ribbon(B, M.asphalt, road, 7, H, { lift: 0.04, uv: 7, across: 6 });
  // concrete walks with curbs
  B.box((LOT.x0 + LOT.x1) / 2, -0.2, (LOT.z0 + ROW_A.z0) / 2, LOT.x1 - LOT.x0, 0.36, ROW_A.z0 - LOT.z0, { mat: M.concrete, uv: 3, walkable: true });
  B.box((ASPHALT.x0 + ASPHALT.x1) / 2, -0.2, ROW_C.z1 + 0.8, ASPHALT.x1 - ASPHALT.x0, 0.36, 1.6, { mat: M.concrete, uv: 3, walkable: true });
  // painted lines: stall rows (nose-in to the walks and the island)
  const line = (x, z, w, d, mat = X.lineWhite) => B.box(x, 0.03, z, w, 0.012, d, { mat, collide: false, cast: false, uv: 2 });
  const rows = [ROW_A, ROW_B1, ROW_B2, ROW_C];
  for (const r of rows) {
    const n = r === ROW_A || r === ROW_C ? 18 : 17;
    for (let k = 0; k <= n; k++) {
      const x = STALL_X0 + k * STALL;
      line(x, (r.z0 + r.z1) / 2, 0.12, r.z1 - r.z0 - 0.3);
    }
  }
  // drive aisles: arrows and the bus lane
  for (const [x, z, rot] of [[-20, 72.5, Math.PI], [0, 72.5, Math.PI], [-20, 92.5, 0], [0, 92.5, 0], [30, 70.5, Math.PI]]) {
    const at = frame(x, z, rot);
    const [ax, az] = at(0, 0);
    B.box(ax, 0.03, az, 2.4, 0.012, 0.22, { mat: X.lineWhite, rot, collide: false, cast: false });
    for (const s of [-1, 1]) {
      const [hx, hz] = at(1.0, s * 0.28);
      B.box(hx, 0.03, hz, 0.8, 0.012, 0.18, { mat: X.lineWhite, rot: rot + s * 0.6, collide: false, cast: false });
    }
  }
  // bus loading zone (yellow hatching along the north walk)
  line(30, 67.4, 13, 0.15, X.lineYellow);
  line(30, 70.0, 13, 0.15, X.lineYellow);
  for (let k = 0; k < 9; k++) B.box(24.5 + k * 1.5, 0.03, 68.7, 0.12, 0.012, 2.8, { mat: X.lineYellow, rot: 0.6, collide: false, cast: false });

  // the planted island down the middle, with its light poles
  const ix = (ISLAND.x0 + ISLAND.x1) / 2;
  const iz = (ISLAND.z0 + ISLAND.z1) / 2;
  B.box(ix, -0.2, iz, ISLAND.x1 - ISLAND.x0, 0.36, ISLAND.z1 - ISLAND.z0, { mat: M.concrete, uv: 3, walkable: true });
  B.box(ix, 0.16, iz, ISLAND.x1 - ISLAND.x0 - 0.4, 0.04, ISLAND.z1 - ISLAND.z0 - 0.4, { mat: M.gravel, collide: false, cast: false });
  for (const x of [-30, -14, 2]) lotPole(B, M, X, x, 0.16, iz, Math.PI / 2, 'lot', 2);
  // more poles along the walks (single heads facing into the lot)
  for (const x of [-24, -2, 20, 40]) lotPole(B, M, X, x, 0.16, ROW_C.z1 + 1.1, Math.PI / 2, 'lot', 1);
  for (const x of [-12, 10, 42]) lotPole(B, M, X, x, 0.16, LOT.z0 + 0.8, -Math.PI / 2, 'lot', 1);

  // wheel stops in the stalls
  const rng = makeRng(77);
  for (const r of rows) {
    const nose = r === ROW_A ? r.z0 + 0.6 : r === ROW_C ? r.z1 - 0.6 : r === ROW_B1 ? r.z1 - 0.6 : r.z0 + 0.6;
    for (let k = 0; k < 17; k++) {
      if (rng() < 0.12) continue;
      B.box(STALL_X0 + (k + 0.5) * STALL, 0.03, nose, 1.7, 0.13, 0.22, { mat: M.concreteDark, collide: false });
    }
  }

  // abandoned cars, parked nose-in (some badly, one with its door open)
  const paints = { white: X.paintWhite, red: X.paintRed, blue: X.paintBlue, green: X.paintGreen, tan: X.paintTan };
  const stallX = (k) => STALL_X0 + (k + 0.5) * STALL;
  const CARS = [
    [ROW_A, 2, 'sedan', 'blue', 0.02], [ROW_A, 5, 'wagon', 'tan', -0.03], [ROW_A, 6, 'pickup', 'red', 0.04],
    [ROW_A, 11, 'van', 'white', 0], [ROW_A, 14, 'sedan', 'green', 0.06],
    [ROW_B1, 1, 'sedan', 'white', -0.02], [ROW_B1, 4, 'pickup', 'blue', 0.03], [ROW_B1, 9, 'sedan', 'red', 0.1],
    [ROW_B2, 3, 'wagon', 'green', -0.04], [ROW_B2, 8, 'van', 'tan', 0.02], [ROW_B2, 12, 'sedan', 'blue', -0.06],
    [ROW_C, 0, 'pickup', 'white', 0.03], [ROW_C, 7, 'sedan', 'tan', -0.05], [ROW_C, 10, 'sedan', 'blue', 0.02], [ROW_C, 13, 'wagon', 'red', -0.08],
  ];
  for (const [r, k, type, paint, skew] of CARS) {
    const north = r === ROW_A || r === ROW_B2;
    const rot = (north ? Math.PI / 2 : -Math.PI / 2) + skew;
    const z = (r.z0 + r.z1) / 2 + (north ? -0.25 : 0.25);
    car(B, M, X, stallX(k) + skew * 4, 0, z, rot, type, paints[paint]);
  }

  // the info kiosk at the head of the walkway (the lot breaker is on its east side)
  {
    const kx = -38.6;
    const kz = 63.0;
    for (const s of [-1, 1]) B.box(kx + s * 1.2, 0, kz, 0.22, 2.9, 0.22, { mat: X.peeledOut, walkable: false });
    B.box(kx, 0.9, kz, 2.2, 1.5, 0.16, { mat: X.planksOut, walkable: false });
    const tex = signTex([{ text: 'EMBER HOLLOW', size: 64 }, { text: 'CAVERNS • VISITOR MAP', size: 30, weight: 600 }, { text: 'Visitor Center ↑   Gem Mine →   Caves ↑', size: 24, weight: 500 }], { w: 512, h: 320 });
    B.sign(kx, 1.65, kz + 0.09, 0, tex, 2.0, 1.25);
    for (const s of [-1, 1]) B.box(kx, 2.82, kz + s * 0.32, 2.9, 0.08, 0.78, { mat: X.shakes, rx: s * 0.55, collide: false });
    B.box(kx, 3.0, kz, 2.95, 0.1, 0.12, { mat: X.planksOut, collide: false });
    B.box(kx, 0.9, kz - 0.1, 2.2, 1.5, 0.04, { mat: X.planksOut, collide: false });
    // a utility conduit runs up into the breaker
    B.box(kx + 1.32, 0, kz - 0.18, 0.08, 1.2, 0.08, { mat: M.steelDark, collide: false });
  }
  // benches and bins by the walks
  for (const x of [-31, -6, 26]) bench(B, M, X, x, 0.16, ROW_C.z1 + 1.15, Math.PI, 1.8);
  for (const [x, z] of [[-36.4, 62.5], [-8, 62.6], [16, 102.6], [-30, 102.6]]) trashCan(B, M, X, x, 0.16, z);

  // ---- boundaries: split rails along the woods, the stockade along the gem mine -------------
  railFence(B, M, X, [[LOT.x0 - 0.4, WALKWAY.z0 + 0.4], [LOT.x0 - 0.4, LOT.z1 + 0.3], [LOT.x1 + 0.5, LOT.z1 + 0.3], [LOT.x1 + 0.5, 96.8]], H);
  railFence(B, M, X, [[LOT.x1 + 0.5, 88.2], [LOT.x1 + 0.5, STOCKADE_Z + 0.2]], H);
  railFence(B, M, X, [[WALKWAY.x1 + 0.4, WALKWAY.z0 + 0.4], [WALKWAY.x1 + 0.4, STOCKADE_Z + 0.2], [7, STOCKADE_Z + 0.2]], H);
  // the old road is closed: a fallen fir across it and Avion's barriers in front
  {
    const tx = 53.5;
    B.box(49.2, 0, 90.0, 0.6, 0.85, 2.6, { mat: M.concrete, uv: 2, walkable: false });
    B.box(49.2, 0, 92.7, 0.6, 0.85, 2.6, { mat: M.concrete, uv: 2, walkable: false });
    B.box(49.2, 0, 95.3, 0.6, 0.85, 2.6, { mat: M.concrete, uv: 2, walkable: false });
    const closed = signTex([{ text: 'ROAD CLOSED', size: 70 }, { text: 'AVION GEOTHERMAL • NO ACCESS', size: 28, weight: 600 }], { bg: '#e8e2d2', fg: '#a8241c', w: 512, h: 200 });
    parkSign(B, M, X, 49.0, 0, 92.7, -Math.PI / 2, null, 2.0, 0.78, { tex: closed, post: 0.9 });
    // the fir: trunk across the road, its root plate torn up on the north side
    const g = new THREE.CylinderGeometry(0.42, 0.62, 19, 10);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0.35, 0, 'YXZ'));
    m.setPosition(tx, H(tx, 92.5) + 0.55, 92.5);
    B.mesh(g, m, M.log);
    const rp = new THREE.CylinderGeometry(1.9, 1.6, 0.6, 9);
    const rm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2 - 0.2, 0.35, 0, 'YXZ'));
    rm.setPosition(tx - 3.1, H(tx - 3.1, 83.6) + 1.2, 83.6);
    B.mesh(rp, rm, X.dirt);
    for (const [bx, bz, l, r] of [[54.8, 96.5, 3.2, 0.6], [52.6, 90.2, 2.6, -0.8], [55.4, 99.2, 2.8, 0.9]]) {
      const bg = new THREE.CylinderGeometry(0.06, 0.12, l, 5);
      const bm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.9, r, 0.4));
      bm.setPosition(bx, H(bx, bz) + 1.0, bz);
      B.mesh(bg, bm, M.log, { cast: true });
    }
    B.physics.addBox({ x: tx, y: H(tx, 92.5) - 0.2, z: 92.5, w: 1.4, h: 1.6, d: 19, rot: 0.35, walkable: true, material: 'wood' });
  }
  // the roadside sign at the entrance
  {
    const tex = signTex([{ text: 'EMBER HOLLOW', size: 86 }, { text: 'CAVERNS', size: 60 }, { text: 'GUIDED TOURS DAILY • SINCE 1931', size: 26, weight: 600 }], { w: 512, h: 300 });
    const x = 47.2;
    const z = 99.2;
    for (const s of [-1, 1]) B.box(x, 0, z + s * 1.7, 0.3, 3.6, 0.3, { mat: X.peeledOut, walkable: false });
    B.box(x, 1.4, z, 0.22, 2.0, 3.6, { mat: X.planksOut, walkable: false });
    B.sign(x - 0.12, 2.4, z, -Math.PI / 2, tex, 3.4, 2.0);
    B.box(x, 3.5, z, 0.7, 0.16, 4.2, { mat: X.shakes, collide: false });
  }
  // the gem mine's log stockade (gate B goes in the gap)
  // (the creek slips under it in two places, beneath a log)
  stockade(B, M, X, [[7, 10.4], [7, STOCKADE_Z], [16, STOCKADE_Z]], H);
  stockade(B, M, X, [[20, STOCKADE_Z], [77, STOCKADE_Z], [77, 10.4], [34.2, 10.4]], H, { gaps: [[77, 58.25, 1.7], [65.3, 10.4, 1.7]] });
  // tour bus along the north walk
  tourBus(S, 29.4, 65.7);
}

// The access road's centre line (z) at x, leaving the lot's east end.
function roadZ(x) {
  return 92.5 + Math.max(0, x - 50) * 0.12 + 3 * Math.sin(Math.max(0, x - 50) / 22);
}

// The caverns' tour bus: a 1960s coach in cream and forest green.
function tourBus(S, x, z) {
  const { B, M, X } = S;
  const L = 10.6;
  const W = 2.5;
  const cream = X.paintWhite;
  B.box(x, 0.45, z, L, 2.15, W, { mat: cream, uv: 2, walkable: true });
  B.box(x, 0.32, z, L + 0.1, 0.5, W + 0.04, { mat: X.paintGreen, collide: false });
  B.box(x, 1.55, z, L - 0.6, 0.85, W + 0.02, { mat: X.window, collide: false });
  B.box(x, 2.52, z, L - 0.2, 0.26, W - 0.2, { mat: X.paintGreen, collide: false });
  B.box(x + L / 2 - 0.02, 1.3, z, 0.08, 1.15, W - 0.3, { mat: X.window, collide: false });
  B.box(x + L / 2 + 0.03, 0.3, z, 0.14, 0.3, W, { mat: X.chrome, collide: false });
  B.box(x - L / 2 - 0.03, 0.3, z, 0.14, 0.3, W, { mat: X.chrome, collide: false });
  // destination sign over the windshield
  const dest = signTex([{ text: 'CAVERNS', size: 90 }], { bg: '#141414', fg: '#ffb84a', w: 256, h: 64 });
  B.sign(x + L / 2 + 0.05, 2.28, z, Math.PI / 2, dest, 1.5, 0.3);
  const side = signTex([{ text: 'EMBER HOLLOW CAVERNS', size: 70 }], { bg: '#3f5a46', fg: '#efe4cc', w: 1024, h: 96 });
  B.sign(x - 0.4, 0.78, z + W / 2 + 0.03, 0, side, 6.4, 0.5);
  B.sign(x - 0.4, 0.78, z - W / 2 - 0.03, Math.PI, side, 6.4, 0.5);
  for (const lx of [L / 2 - 1.9, -L / 2 + 2.2]) {
    for (const s of [-1, 1]) B.cylinder(x + lx, 0, z + s * (W / 2 - 0.12), 0.5, 0.32, { mat: X.tire, horizontal: true, rot: Math.PI / 2, seg: 14, collide: false });
  }
}

// ---- the Kestrel ----------------------------------------------------------------------------
// The XV-9 tilt-rotor you flew in from Rainshadow, set down across the east end of the lot with
// its ramp lowered. The exo rack is inside at the front of the cabin.
function buildKestrel(S) {
  const { B, M, X, fx } = S;
  const { x: cx, z: cz, floor: floorY } = KESTREL;
  const at = (lx, y, lz) => new THREE.Vector3(cx + lx, y, cz + lz);
  const place = (geo, p, mat, rot = null, o = {}) => {
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromEuler(rot);
    m.setPosition(p);
    B.mesh(geo, m, mat, o);
  };
  const put = (lx, y, lz, w, h, d, mat, o = {}) => B.box(cx + lx, y, cz + lz, w, h, d, { mat, collide: false, ...o });
  const tubeY = floorY + 1.15;
  const tubeL = 11.8;
  const tubeX = -0.1;
  // the fuselage: an octagonal tube, grey outside and a dark cabin inside, open at the back
  for (const [r, mat] of [[1.72, X.hullOut], [1.62, X.hullIn]]) {
    const g = new THREE.CylinderGeometry(r, r, tubeL, 8, 1, true, Math.PI / 8);
    g.rotateZ(-Math.PI / 2);
    g.scale(1, 0.92, 1);
    place(g, at(tubeX, tubeY, 0), mat);
  }
  // a rim closing the gap between the two skins at the open back
  {
    const ring = (r) => {
      const sh = new THREE.Shape();
      for (let k = 0; k <= 8; k++) {
        const f = Math.PI / 8 + (k * Math.PI) / 4;
        sh[k ? 'lineTo' : 'moveTo'](r * Math.cos(f), 0.92 * r * Math.sin(f));
      }
      return sh;
    };
    const outer = ring(1.76);
    outer.holes.push(ring(1.58));
    const g = new THREE.ShapeGeometry(outer);
    g.rotateY(-Math.PI / 2);
    place(g, at(tubeX - tubeL / 2, tubeY, 0), X.hullOut);
  }
  // nose, cockpit glass, the bulkhead behind the flight deck
  {
    // the front half of an ellipsoid (the back half would poke into the cabin)
    const g = new THREE.SphereGeometry(1, 18, 12, Math.PI / 2, Math.PI);
    g.scale(2.9, 1.46, 1.58);
    place(g, at(5.7, tubeY, 0), X.hullOut);
    put(6.6, tubeY + 0.32, 0, 1.9, 0.62, 2.2, X.glassOut, { rz: -0.52 });
    for (const s of [-1, 1]) put(6.1, tubeY + 0.05, s * 1.25, 1.2, 0.5, 0.5, X.glassOut, { rot: s * 0.5, rz: -0.2 });
    put(5.55, floorY, 0, 0.1, 2.5, 2.9, X.cabin, { collide: true, walkable: false });
    B.physics.addBox({ x: cx + 7.0, y: 0.5, z: cz, w: 3.4, h: 3.0, d: 3.0, walkable: true, material: 'metal' });
  }
  // cabin: floor, the colliders inside the hull
  put(tubeX, floorY - 0.4, 0, tubeL, 0.4, 2.7, M.steelDark, { collide: true, walkable: true, uv: 1 });
  for (const s of [-1, 1]) B.physics.addBox({ x: cx + tubeX, y: floorY, z: cz + s * 1.42, w: tubeL, h: 2.6, d: 0.2, walkable: false, material: 'metal' });
  B.physics.addBox({ x: cx + tubeX, y: floorY + 2.45, z: cz, w: tubeL, h: 0.6, d: 3.0, walkable: false, nav: false, material: 'metal' });
  // fold-down seats along both walls, cargo nets, the overhead light strip
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const lx = -4.8 + k * 1.05;
      put(lx, floorY + 0.42, s * 1.08, 0.46, 0.07, 0.44, M.olive);
      put(lx, floorY + 0.5, s * 1.32, 0.46, 0.55, 0.05, M.olive);
    }
    put(-1.2, floorY + 1.15, s * 1.36, 8.6, 0.9, 0.03, M.tarp);
  }
  put(tubeX, floorY + 2.32, 0, 9.5, 0.05, 0.22, X.cabin);
  B.lamp(cx + 0.4, floorY + 2.26, cz, { color: 0xff8a50, intensity: 6, distance: 8, glowSize: 0.5, bright: 2.5 });
  // sponsons for the main gear, and the gear
  for (const s of [-1, 1]) put(-1.2, 0.55, s * 1.62, 4.4, 0.95, 0.7, X.hullOut, { collide: true, walkable: true, uv: 2 });
  for (const [lx, lz] of [[6.3, 0], [-1.2, -1.72], [-1.2, 1.72]]) {
    B.cylinder(cx + lx, 0.2, cz + lz, 0.07, 0.6, { mat: M.steel, collide: false, seg: 6 });
    B.cylinder(cx + lx, 0, cz + lz, 0.34, 0.24, { mat: X.tire, horizontal: true, rot: Math.PI / 2, collide: false, seg: 12 });
  }
  // the tail boom sweeping up over the ramp, twin fins and the stabiliser
  {
    const g = new THREE.CylinderGeometry(0.55, 1.45, 4.2, 8, 1, false, Math.PI / 8);
    g.rotateZ(Math.PI / 2 - 0.12);
    g.scale(1, 0.75, 1);
    place(g, at(-7.6, tubeY + 1.2, 0), X.hullOut);
    put(-9.6, tubeY + 1.55, 0, 1.6, 0.14, 6.0, X.darkOut, { uv: 2 });
    for (const s of [-1, 1]) put(-9.75, tubeY + 1.55, s * 2.95, 1.4, 2.0, 0.14, X.darkOut, { rz: 0.25 });
  }
  // the ramp, lowered to the asphalt (stepped colliders so it can be walked)
  {
    const len = 3.4;
    const ang = Math.atan2(floorY, len);
    put(tubeX - tubeL / 2 - len / 2, floorY / 2 - 0.06, 0, Math.hypot(len, floorY), 0.12, 2.5, M.steelDark, { rz: ang });
    for (const s of [-1, 1]) put(tubeX - tubeL / 2 - len / 2, floorY / 2 + 0.02, s * 1.22, Math.hypot(len, floorY), 0.1, 0.06, X.paintYellow, { rz: ang });
    const x0 = cx + tubeX - tubeL / 2 - len;
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6;
      B.physics.addBox({ x: x0 + t * len, y: 0, z: cz, w: len / 6 + 0.02, h: floorY * t, d: 2.5, walkable: true, material: 'metal' });
    }
  }
  // the wing on top, nacelles at its tips with the rotors turned up (it landed like a helicopter)
  put(0.3, tubeY + 1.42, 0, 2.6, 0.3, 15.8, X.darkOut, { uv: 2 });
  for (const s of [-1, 1]) {
    const nz = cz + s * 8.3;
    const nx = cx + 0.3;
    const body = new THREE.CylinderGeometry(0.7, 0.66, 3.0, 14);
    place(body, new THREE.Vector3(nx, tubeY + 1.0, nz), X.darkOut);
    const cap = new THREE.SphereGeometry(0.66, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    place(cap, new THREE.Vector3(nx, tubeY - 0.5, nz), X.darkOut);
    const spinner = new THREE.ConeGeometry(0.42, 0.8, 14);
    place(spinner, new THREE.Vector3(nx, tubeY + 2.95, nz), X.hullOut);
    B.cylinder(nx, tubeY + 2.42, nz, 0.5, 0.18, { mat: M.black, seg: 12, collide: false });
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2 + s * 0.5;
      const blade = new THREE.BoxGeometry(3.9, 0.05, 0.34);
      blade.translate(2.05, 0, 0);
      place(blade, new THREE.Vector3(nx, tubeY + 2.62, nz), M.black, new THREE.Euler(0.12, a, 0, 'YXZ'));
    }
    B.physics.addCylinder({ x: nx, z: nz, r: 0.72, y0: tubeY - 1.2, y1: tubeY + 2.6, walkable: false, material: 'metal' });
    // wingtip navigation lights: red port (north), green starboard
    fx.beacons.push({ x: nx + 1.35, y: tubeY + 1.58, z: nz + s * 0.2, color: s < 0 ? 0xff2a1a : 0x2aff6a, always: true });
  }
  // livery: AVION along both flanks, a yellow stripe at the waist
  const tag = signTex([{ text: 'AVION', size: 96 }, { text: 'XV-9 “KESTREL”', size: 40, weight: 600 }], { bg: '#a4a9ad', fg: '#1a1d22', w: 512, h: 200 });
  for (const s of [-1, 1]) {
    B.sign(cx + 2.4, tubeY + 0.05, cz + s * 1.6, s > 0 ? 0 : Math.PI, tag, 2.6, 1.0);
    put(tubeX, tubeY - 0.72, s * 1.565, tubeL - 0.4, 0.14, 0.03, X.paintYellow);
  }
  // anti-collision beacon on the spine
  fx.beacons.push({ x: cx - 1.5, y: tubeY + 1.76, z: cz, color: 0xff2a1a, always: true });
  // a few cases unloaded by the ramp
  for (const [lx, lz, r] of [[-11.2, -2.6, 0.2], [-10.9, 3.0, -0.3]]) B.box(cx + lx, 0, cz + lz, 1.1, 0.7, 0.7, { mat: M.olive, rot: r, uv: 1 });
}
