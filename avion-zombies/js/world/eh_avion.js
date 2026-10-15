import * as THREE from '../../vendor/three.module.min.js';
import { signTex, frame, bench } from './eh_props.js';
import { boulder, placeAt } from './formations.js';
import { makeRng } from '../util.js';

// Behind the tour: Avion's service decline. A blast door off the Grand Gallery, a steep corridor
// down to the lamp house (lockers, lamp racks, the safety board), the decline with its cart
// track, and the security checkpoint where the routes split for the crystal grotto and the river.
export const AV = {
  doorG: { x: -39.2, z: -79.94, rot: Math.PI / 2 - 0.18 },
  corridor: [[-36.2, -79.4], [-45, -81], [-70, -85]],
  lamp: { x0: -91, x1: -69, z0: -95, z1: -77 },
  leg2: [[-84, -95.5], [-85, -121], [-88, -147]],
  check: { x0: -101, x1: -77, z0: -167, z1: -147 },
  booth: { x: -82.4, z: -156, w: 4.2, d: 3.2 },
  doorI: { x: -88, z: -174, rot: 0 },
  riverTunnel: [[-88, -165], [-88, -182], [-90, -203]],
};

export function buildAvion(S, K) {
  const { B, M, X, fx } = S;
  const { F, CEIL } = K;
  const rng = makeRng(2019);
  const amber = 0xff3a2a;

  // ---- the Staff Only bulkhead and the corridor down ----------------------------------------------
  const staff = signTex([{ text: 'AVION GEOTHERMAL', size: 54 }, { text: 'STAFF ONLY BEYOND THIS POINT', size: 30, weight: 600, color: '#ff6a4a' }], { w: 512, h: 150, bg: '#1d2226', fg: '#e8e4d8' });
  K.bulkhead(AV.doorG.x, AV.doorG.z, AV.doorG.rot, 4.0, 3.6, { sign: staff, half: 5 });
  K.walkway(AV.corridor, 2.8, { mat: M.concrete, rails: 'left', railMat: X.paintYellow, uv: 3, collideRails: false });
  stripsAlong(K, AV.corridor, 8, 2);
  K.duct([[-41.4, -80.4], ...AV.corridor.slice(1)], { offset: -0.9, drop: 0.5, r: 0.28 });
  K.tray([[-41.4, -80.4], ...AV.corridor.slice(1)], 1, 4.4, 2.2);
  wallEmergency(K, -52, -82.2, 1);
  {
    const t = signTex([{ text: 'STEEP GRADE', size: 70 }, { text: 'USE THE HANDRAIL • 30%', size: 34, weight: 600 }], { w: 512, h: 180, bg: '#c89a2c', fg: '#1a1a1a' });
    const [x, z, r] = K.beside(AV.corridor, 9.5, 1.9);
    K.board(x, z, r - Math.PI / 2, t, 1.1, 0.4, { post: 1.3, boardMat: M.steelDark, postMat: M.steelDark });
  }

  // ---- the lamp house ------------------------------------------------------------------------------
  {
    const L = AV.lamp;
    const y = F((L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
    // a poured floor
    B.box((L.x0 + L.x1) / 2, y - 0.3, (L.z0 + L.z1) / 2, L.x1 - L.x0 - 1.2, 0.36, L.z1 - L.z0 - 1.2, { mat: M.floor, collide: false, uv: 3, cast: false });
    // lockers along the south wall (the Heron is mounted on them)
    for (let k = 0; k < 14; k++) {
      const x = -89.6 + k * 0.62;
      B.box(x, y, L.z1 - 1.05, 0.6, 1.95, 0.5, { mat: k % 5 === 2 ? X.paintBlue : M.steelDark, walkable: false });
      B.box(x, y + 1.62, L.z1 - 1.31, 0.4, 0.03, 0.02, { mat: M.black, collide: false });
      B.box(x, y + 1.72, L.z1 - 1.31, 0.4, 0.03, 0.02, { mat: M.black, collide: false });
    }
    bench(B, M, X, -84.0, y, L.z1 - 2.3, Math.PI, 3.6);
    // cap-lamp charging racks along the west wall: rows of lamps with green charge lights
    for (let r = 0; r < 3; r++) {
      const z = -92 + r * 3.4;
      B.box(L.x0 + 1.2, y, z, 0.5, 1.9, 2.8, { mat: M.steelDark, walkable: false });
      for (let row = 0; row < 4; row++) {
        for (let c = 0; c < 6; c++) {
          const ly = y + 0.45 + row * 0.38;
          const lz = z - 1.15 + c * 0.46;
          B.box(L.x0 + 1.5, ly, lz, 0.12, 0.14, 0.14, { mat: X.paintYellow, collide: false, cast: false });
          B.fixture(new THREE.BoxGeometry(0.02, 0.03, 0.03), new THREE.Matrix4().makeTranslation(L.x0 + 1.57, ly + 0.11, lz), 0x40ff90, 3, 'reactor');
        }
      }
    }
    // workbench, first-aid station, the safety board
    B.box(-75.6, y, L.z0 + 1.0, 3.4, 0.9, 0.9, { mat: X.planksDark, walkable: true });
    B.box(-75.6, y + 0.9, L.z0 + 0.65, 3.4, 1.2, 0.06, { mat: X.pine, collide: false });
    for (let k = 0; k < 7; k++) B.box(-77 + k * 0.45, y + 1.2 + (k % 2) * 0.3, L.z0 + 0.7, 0.06, 0.35, 0.05, { mat: M.steel, collide: false });
    B.box(-70.1, y + 1.2, -91.5, 0.25, 0.7, 0.9, { mat: X.paintWhite, collide: false });
    const cross = signTex([{ text: '+', size: 150, color: '#c8241c' }], { w: 128, h: 128, bg: '#e8e6e0', fg: '#c8241c', stripe: false });
    B.sign(-70.24, y + 1.55, -91.5, -Math.PI / 2, cross, 0.4, 0.4);
    const safety = signTex([{ text: 'SAFETY FIRST', size: 60 }, { text: '2,431 DAYS WITHOUT', size: 32, weight: 600 }, { text: 'A LOST-TIME INJURY', size: 32, weight: 600 }], { w: 512, h: 256, bg: '#2a6a3a', fg: '#f0ead8' });
    K.board(-80.2, L.z0 + 1.1, 0, safety, 1.6, 0.8, { post: 1.2, boardMat: M.steelDark, postMat: M.steelDark });
    const lh = signTex([{ text: 'LAMP HOUSE', size: 76 }, { text: 'CHECK OUT YOUR LAMP • CHECK IN YOUR TAG', size: 26, weight: 600 }], { w: 512, h: 170, bg: '#1d2226', fg: '#e8e4d8' });
    B.sign(-70.0, y + 3.2, -88.6, -Math.PI / 2, lh, 2.2, 0.73);
    for (const [x, z] of [[-86, -90], [-77, -90], [-86, -82], [-77, -82]]) K.strip(x, z, 0, { intensity: 13, range: 11 });
    K.emergency(-70.3, y + 2.6, -82.6, amber);
    for (const [x, z] of [[-86, -86], [-75, -92]]) B.box(x, y - 0.01, z, 0.8, 0.04, 0.55, { mat: X.grate, collide: false, cast: false });
  }

  // ---- the decline: a cart track down the east side ------------------------------------------------
  K.walkway(AV.leg2, 2.4, { mat: M.concrete, rails: 'left', railMat: X.paintYellow, uv: 3, collideRails: false });
  stripsAlong(K, AV.leg2, 9, 4);
  K.duct(AV.leg2, { offset: -1.0, drop: 0.5, r: 0.28 });
  const track = AV.leg2.map(([x, z]) => [x + 1.45, z]);
  {
    const sm = K.samples(track, 0.7);
    for (let i = 0; i < sm.length - 1; i++) {
      const [x, z, tx, tz] = sm[i];
      const rot = Math.atan2(-tz, tx);
      B.box(x, F(x, z) - 0.02, z, 0.16, 0.08, 1.2, { mat: X.planksDark, rot, collide: false, cast: false });
      for (const s of [-1, 1]) {
        const [x2, z2] = sm[i + 1];
        const ox = -tz * s * 0.45;
        const oz = tx * s * 0.45;
        B.box((x + x2) / 2 + ox, (F(x, z) + F(x2, z2)) / 2 + 0.05, (z + z2) / 2 + oz, Math.hypot(x2 - x, z2 - z) + 0.02, 0.07, 0.06, { mat: M.steelDark, rot, collide: false, cast: false });
      }
    }
    // a man-car left at the bottom of the decline
    const [cx, cz] = K.beside(track, 47, 0);
    const y = F(cx, cz);
    B.box(cx, y + 0.25, cz, 1.1, 1.0, 2.4, { mat: X.paintYellow, walkable: true, rot: 0.06 });
    B.box(cx, y + 1.25, cz, 1.1, 0.06, 2.4, { mat: M.steelDark, collide: false, rot: 0.06 });
    for (const dz of [-0.8, 0.8]) for (const s of [-1, 1]) B.cylinder(cx + s * 0.45, y, cz + dz, 0.2, 0.08, { mat: M.black, horizontal: true, rot: 0, seg: 10, collide: false });
  }
  wallEmergency(K, -84.5, -108, -1);
  wallEmergency(K, -86.6, -134, -1);

  // ---- the checkpoint -----------------------------------------------------------------------------------
  {
    const C = AV.check;
    const y = F(-89, -157);
    B.box((C.x0 + C.x1) / 2, y - 0.3, (C.z0 + C.z1) / 2, C.x1 - C.x0 - 1.2, 0.36, C.z1 - C.z0 - 1.2, { mat: M.floor, collide: false, uv: 3, cast: false });
    // painted lanes
    for (const x of [-91.2, -84.8]) B.box(x, y + 0.07, -157, 0.14, 0.01, 18, { mat: X.lineYellow, collide: false, cast: false });
    // the guard booth: block walls, a band of windows, a flat roof (the Goshawk is on its west wall)
    const { x: bx, z: bz, w, d } = AV.booth;
    B.box(bx, y, bz, w, 1.0, d, { mat: M.concrete, uv: 2, walkable: false });
    for (const [lx, lz] of [[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]]) B.box(bx + lx, y + 1.0, bz + lz, 0.2, 1.3, 0.2, { mat: M.steelDark, collide: false });
    B.box(bx, y + 1.0, bz, w - 0.2, 1.3, d - 0.2, { mat: M.glass, collide: false, cast: false });
    B.box(bx - w / 2 + 0.05, y + 1.0, bz, 0.1, 1.3, 1.1, { mat: M.steelDark, collide: false });
    B.box(bx, y + 2.3, bz, w + 0.3, 0.25, d + 0.3, { mat: M.steelDark, collide: false });
    B.physics.addBox({ x: bx, y, z: bz, w, h: 2.6, d, walkable: false, material: 'metal' });
    fx.screens.push({ x: bx + 0.6, y: y + 1.25, z: bz - 0.6, rot: Math.PI });
    fx.screens.push({ x: bx - 0.4, y: y + 1.25, z: bz - 0.6, rot: Math.PI });
    const cp = signTex([{ text: 'CHECKPOINT 2', size: 70 }, { text: 'CALDERA PROJECT • LEVEL B5', size: 32, weight: 600 }], { w: 512, h: 170, bg: '#1d2226', fg: '#e8e4d8' });
    B.sign(bx, y + 2.8, bz + d / 2 + 0.2, 0, cp, 2.2, 0.73);
    B.box(bx, y + 2.55, bz + d / 2 + 0.15, 2.3, 0.85, 0.06, { mat: M.steelDark, collide: false });
    // boom barrier across the south lane, a walk-through scanner on the north side
    B.box(-84.6, y, -161.2, 0.5, 1.1, 0.5, { mat: M.white, walkable: false });
    B.box(-88.7, y + 0.95, -161.2, 7.6, 0.12, 0.12, { mat: M.hazard, collide: false, rz: 0.0 });
    B.box(-92.8, y, -161.2, 0.24, 0.95, 0.24, { mat: M.steelDark, collide: false });
    for (const s of [-1, 1]) B.box(-88 + s * 0.6, y, -151.6, 0.25, 2.2, 0.5, { mat: M.white, collide: true, walkable: false });
    B.box(-88, y + 2.2, -151.6, 1.45, 0.3, 0.5, { mat: M.white, collide: false });
    B.bakedLamp(-88, y + 2.15, -151.35, { color: 0x40ff90, intensity: 2, range: 3, circuit: 'reactor', fitting: new THREE.BoxGeometry(0.12, 0.04, 0.04), bright: 4, glow: 0.3 });
    // jersey barriers keeping the lanes
    for (const [x, z, r] of [[-93.6, -156, Math.PI / 2], [-79.2, -150.5, Math.PI / 2], [-79.2, -163.5, Math.PI / 2]]) B.box(x, y, z, 3.0, 0.85, 0.6, { mat: M.concrete, rot: r, uv: 2, walkable: false });
    // signs to the two ways on
    const river = signTex([{ text: 'RIVER PUMP STATION', size: 46 }, { text: '↓ CALDERA ↓', size: 46 }], { w: 512, h: 170, bg: '#1d2226', fg: '#e8e4d8' });
    K.board(-91.6, -164.6, 0, river, 1.6, 0.53, { post: 1.6, boardMat: M.steelDark, postMat: M.steelDark });
    const survey = signTex([{ text: '← SURVEY ROUTE', size: 52 }, { text: 'CRYSTAL GROTTO • HARD HATS', size: 28, weight: 600 }], { w: 512, h: 170, bg: '#c89a2c', fg: '#1a1a1a' });
    K.board(-98.6, -160.6, Math.PI / 2, survey, 1.5, 0.5, { post: 1.5, boardMat: M.steelDark, postMat: M.steelDark });
    for (const [x, z] of [[-94, -151], [-94, -161], [-84, -151], [-84, -163], [-89, -156]]) K.strip(x, z, 0, { intensity: 13, range: 11 });
    K.emergency(-100.2, y + 2.5, -153, amber);
    K.emergency(-77.8, y + 2.5, -161, amber);
    for (const [x, z] of [[-96, -152], [-82, -162]]) B.box(x, y - 0.01, z, 0.8, 0.04, 0.55, { mat: X.grate, collide: false, cast: false });
    void rng;
  }

  // ---- River Access: Avion's bulkhead and the tunnel down to the river -----------------------------
  const ra = signTex([{ text: 'RIVER ACCESS', size: 70 }, { text: 'PUMP STATION • LEVEL B6', size: 30, weight: 600 }], { w: 512, h: 150, bg: '#1d2226', fg: '#e8e4d8' });
  K.bulkhead(AV.doorI.x, AV.doorI.z, AV.doorI.rot, 4.4, 3.8, { sign: ra, half: 5 });
  K.walkway(AV.riverTunnel, 2.8, { mat: M.concrete, uv: 3 });
  stripsAlong(K, AV.riverTunnel, 9, 3);
  K.duct(AV.riverTunnel, { offset: 0.9, drop: 0.5, r: 0.28 });
  wallEmergency(K, -88.2, -190, -1);
  // the rockfall into the crystal grotto passage (door H): loose rock heaped beside it too
  for (let k = 0; k < 6; k++) {
    const x = -106.5 + (rng() - 0.5) * 3;
    const z = -159.4 + (rng() - 0.5) * 2.5;
    const r = 0.3 + rng() * 0.45;
    B.mesh(boulder(r, 7700 + k, [0.5, 0.46, 0.4]), placeAt(x, F(x, z) + r * 0.2, z, rng() * 6), S.ctx.world.caveMat, { cast: false });
  }
  void frame;
  void CEIL;
}

// Avion LED strips every `every` metres along a tunnel, starting `start` metres in.
function stripsAlong(K, pts, every, start = 2) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = i === 0 ? start : (every - ((len % every) || every)) / 2 + 1; d < len; d += every) {
      const t = d / len;
      K.strip(ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(-(bz - az), bx - ax), { intensity: 11, range: 11 });
    }
  }
}

function wallEmergency(K, x, z, side) {
  const w = K.toWall(x, z, side, 0, 6);
  const px = w ? w.x - side * 0.35 : x;
  K.emergency(px, K.F(px, z) + 2.4, z, 0xff3a2a);
}
