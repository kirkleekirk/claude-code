import * as THREE from '../../vendor/three.module.min.js';
import { LODGE, PORCH, WALKWAY } from './eh_shape.js';
import { souvenirTexture } from './eh_textures.js';
import { frame, signTex, stairs, trashCan, bench, ribbon } from './eh_props.js';
import { makeRng } from '../util.js';

// The visitor center: a 1931 log-and-stone lodge. Gift shop (west), lobby with the big
// fireplace and the ticket counter (middle), snack bar (east), and a service strip along the
// back: the office with the breaker, the back hall to the staff exit, and the room Avion built
// around its service elevator.
const F = LODGE.floor;
const CEIL = LODGE.ceil;
const TOP = F + 4.6; // wall plate
const RIDGE_Z = (LODGE.z0 + LODGE.z1) / 2;
const PITCH = 0.5236;
const RIDGE_Y = TOP + ((LODGE.z1 - LODGE.z0) / 2) * Math.tan(PITCH);
const BACK = 30; // service strip / front rooms

export function buildLodge(S) {
  const { B, M, X, H, fx } = S;
  const { x0, x1, z0, z1 } = LODGE;
  const W = LODGE.wall;
  const cx = (x0 + x1) / 2;

  // ---- foundation, floors, porch --------------------------------------------------------
  // raised floor (collider) on a river-rock foundation
  B.box(cx, 0, (z0 + z1) / 2, x1 - x0, F, z1 - z0, { visible: false, walkable: true, phys: 'wood' });
  for (const [ax, az, bx, bz] of [[x0 - 0.12, z0 - 0.12, x1 + 0.12, z0 - 0.12], [x0 - 0.12, z1 + 0.12, x1 + 0.12, z1 + 0.12], [x0 - 0.12, z0 - 0.12, x0 - 0.12, z1 + 0.12], [x1 + 0.12, z0 - 0.12, x1 + 0.12, z1 + 0.12]]) {
    B.wall(ax, az, bx, bz, { h: F + 0.25 - 0.2, t: 0.5, y0: 0.2, mat: X.stoneOut, uv: 3, collide: false });
  }
  B.box(cx, F - 0.04, (z0 + z1) / 2, x1 - x0 - 2 * W, 0.04, z1 - z0 - 2 * W, { mat: X.floor, collide: false, uv: 1.2, cast: false });
  // porch deck and its steps down to the walkway
  const pcx = (PORCH.x0 + PORCH.x1) / 2;
  const pcz = (PORCH.z0 + PORCH.z1) / 2;
  B.box(pcx, 0, pcz, PORCH.x1 - PORCH.x0, F, PORCH.z1 - PORCH.z0, { visible: false, walkable: true, phys: 'wood' });
  B.box(pcx, F - 0.08, pcz, PORCH.x1 - PORCH.x0, 0.08, PORCH.z1 - PORCH.z0, { mat: X.planksDark, collide: false, uv: 1.5 });
  B.wall(PORCH.x0, PORCH.z1, PORCH.x1, PORCH.z1, { h: F - 0.28, t: 0.4, y0: 0.2, mat: X.stoneOut, uv: 3, collide: false });
  B.wall(PORCH.x0, PORCH.z0, PORCH.x0, PORCH.z1, { h: F - 0.28, t: 0.4, y0: 0.2, mat: X.stoneOut, uv: 3, collide: false });
  B.wall(PORCH.x1, PORCH.z0, PORCH.x1, PORCH.z1, { h: F - 0.28, t: 0.4, y0: 0.2, mat: X.stoneOut, uv: 3, collide: false });
  const wx = (WALKWAY.x0 + WALKWAY.x1) / 2;
  stairs(B, M, X.stoneOut, wx, PORCH.z1 + 1.25, H(wx, PORCH.z1 + 1.3), wx, PORCH.z1, F, WALKWAY.x1 - WALKWAY.x0, { rails: false });
  // flagstone walk down to the lot
  ribbon(B, X.flag, [[wx, PORCH.z1 + 1.2], [wx, 56], [wx, WALKWAY.z1 + 0.3]], WALKWAY.x1 - WALKWAY.x0 - 0.2, H, { lift: 0.035, uv: 3 });
  for (const s of [-1, 1]) {
    for (let z = PORCH.z1 + 1.6; z < WALKWAY.z1; z += 1.1) {
      const x = wx + s * 2.0;
      B.box(x, H(x, z) - 0.1, z, 0.22, 0.24, 0.9, { mat: X.stoneOut, collide: false, rot: (z * 7) % 0.3 });
    }
  }

  // porch posts, railing and roof
  for (const x of [PORCH.x0 + 0.4, -46.6, WALKWAY.x0 - 0.3, WALKWAY.x1 + 0.3, -37.4, PORCH.x1 - 0.4]) {
    B.cylinder(x, F, PORCH.z1 - 0.35, 0.17, 3.4, { mat: X.peeledOut, seg: 9, walkable: false });
  }
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    for (const y of [0.45, 0.95]) B.box(mx, F + y, mz, len, 0.1, 0.12, { mat: X.planksOut, rot, collide: false });
    const n = Math.round(len / 0.55);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      B.box(ax + (bx - ax) * t, F, az + (bz - az) * t, 0.06, 0.95, 0.06, { mat: X.planksOut, collide: false });
    }
    B.physics.addBox({ x: mx, y: F, z: mz, w: len, h: 1.05, d: 0.2, rot, walkable: false, material: 'wood' });
  };
  rail(PORCH.x0 + 0.4, PORCH.z1 - 0.35, WALKWAY.x0 - 0.3, PORCH.z1 - 0.35);
  rail(WALKWAY.x1 + 0.3, PORCH.z1 - 0.35, PORCH.x1 - 0.4, PORCH.z1 - 0.35);
  rail(PORCH.x0 + 0.4, z1 + 0.3, PORCH.x0 + 0.4, PORCH.z1 - 0.35);
  rail(PORCH.x1 - 0.4, z1 + 0.3, PORCH.x1 - 0.4, PORCH.z1 - 0.35);
  {
    // shed roof under the main eave, a beam on the posts
    const zA = z1 + 0.05;
    const zB = PORCH.z1 + 0.5;
    const yA = TOP - 0.75;
    const yB = F + 3.45;
    const len = Math.hypot(zB - zA, yA - yB);
    const ang = Math.atan2(yA - yB, zB - zA);
    const mz = (zA + zB) / 2;
    const my = (yA + yB) / 2;
    B.box(pcx, my - 0.1, mz, PORCH.x1 - PORCH.x0 + 1.0, 0.2, len, { mat: X.shakes, rx: ang, collide: false, uv: 2.4 });
    B.box(pcx, my - 0.27, mz, PORCH.x1 - PORCH.x0 + 0.8, 0.06, len, { mat: X.planksDark, rx: ang, collide: false, uv: 1.5 });
    B.box(pcx, F + 3.1, PORCH.z1 - 0.35, PORCH.x1 - PORCH.x0 + 0.2, 0.32, 0.3, { mat: X.peeledOut, collide: false });
    B.physics.addBox({ x: pcx, y: F + 3.4, z: pcz, w: PORCH.x1 - PORCH.x0, h: 1.5, d: PORCH.z1 - PORCH.z0, walkable: false, nav: false, material: 'wood' });
    // the big sign on the fascia
    const tex = signTex([{ text: 'EMBER HOLLOW CAVERNS', size: 84 }, { text: 'VISITOR CENTER • EST. 1931', size: 38, weight: 600 }], { w: 1024, h: 200 });
    B.box(-42, F + 3.66, PORCH.z1 - 0.2, 7.6, 1.3, 0.14, { mat: X.planksOut, collide: false });
    B.sign(-42, F + 4.31, PORCH.z1 - 0.12, 0, tex, 7.2, 1.15);
  }
  // porch lanterns (and a pair beside the doors) on the visitor center breaker
  for (const x of [-47.6, -36.4]) {
    B.box(x, F + 2.85, PORCH.z1 - 0.35, 0.03, 0.25, 0.03, { mat: M.black, collide: false });
    lantern(B, M, x, F + 2.62, PORCH.z1 - 0.35, 'lodge', 16);
  }
  for (const x of [-44.1, -39.9]) lantern(B, M, x, F + 2.5, z1 + 0.18, 'lodge', 12, -1);
  // rocking chairs and a bench on the porch
  for (const x of [-50.2, -34.2]) bench(B, M, X, x, F, z1 + 1.1, Math.PI, 1.6);
  trashCan(B, M, X, -48.5, F, z1 + 0.6);

  // ---- walls ----------------------------------------------------------------------------
  // two skins: weathered logs outside (open-air lit), the same logs inside
  const wallSkins = (ax, az, bx, bz, nx, nz, openings) => {
    const o = 0.125;
    B.wall(ax + nx * o, az + nz * o, bx + nx * o, bz + nz * o, { h: TOP - F, t: 0.25, y0: F, mat: X.logsOut, uv: 1.4, openings, collide: false });
    B.wall(ax - nx * o, az - nz * o, bx - nx * o, bz - nz * o, { h: TOP - F, t: 0.25, y0: F, mat: X.logs, uv: 1.4, openings });
  };
  const win = (at, w = 1.8) => ({ at, w, h: 2.5, sill: 1.0 });
  const iz0 = z0 + W / 2;
  const iz1 = z1 - W / 2;
  const ix0 = x0 + W / 2;
  const ix1 = x1 - W / 2;
  // front (south): gift shop windows, the double doors, lobby and snack bar windows
  wallSkins(x0, iz1, x1, iz1, 0, 1, [win(3), win(6.5), win(13.6, 1.4), { at: 18, w: 2.6, h: 2.9 }, win(22.4, 1.4), win(29), win(32.5)]);
  // back (north): office window, the staff exit, break room window
  wallSkins(x0, iz0, x1, iz0, 0, -1, [win(5, 1.4), { at: 14.5, w: 1.4, h: 2.4 }, win(25, 1.4)]);
  // west: office window, gift shop windows (side walls run between the front and back ones)
  wallSkins(ix0, z0 + W, ix0, z1 - W, -1, 0, [win(2.1, 1.4), win(10.5), win(18)]);
  // east: snack bar windows
  wallSkins(ix1, z0 + W, ix1, z1 - W, 1, 0, [win(11), win(18)]);
  // window frames, sashes and glass
  const winFrames = [
    [-57, iz1, 0], [-53.5, iz1, 0], [-46.4, iz1, 0, 1.4], [-37.6, iz1, 0, 1.4], [-31, iz1, 0], [-27.5, iz1, 0],
    [-55, iz0, Math.PI, 1.4], [-35, iz0, Math.PI, 1.4, true],
    [ix0, 24.6, -Math.PI / 2, 1.4], [ix0, 33, -Math.PI / 2], [ix0, 40.5, -Math.PI / 2],
    [ix1, 33.5, Math.PI / 2], [ix1, 40.5, Math.PI / 2],
  ];
  for (const [wx2, wz, rot, w = 1.8, blind = false] of winFrames) windowFrame(B, M, X, wx2, wz, rot, w, blind);
  // log ends crossing at the corners
  for (const [kx, kz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    for (let k = 0; k < 13; k++) {
      const y = F + 0.17 + k * 0.35;
      const alongX = k % 2 === 0;
      const g = alongX ? [kx + Math.sign(kx - cx) * 0.2, y, kz] : [kx, y, kz + Math.sign(kz - RIDGE_Z) * 0.2];
      B.cylinder(g[0], g[1] - 0.17, g[2], 0.17, 0.75, { mat: X.peeledOut, horizontal: true, rot: alongX ? 0 : Math.PI / 2, seg: 8, collide: false });
    }
  }

  // ---- roof -----------------------------------------------------------------------------
  {
    const over = 1.0;
    const half = (z1 - z0) / 2 + over;
    const len = half / Math.cos(PITCH);
    const w = x1 - x0 + 1.6;
    for (const s of [-1, 1]) {
      const mz = RIDGE_Z + s * (half / 2);
      const my = RIDGE_Y - (half / 2) * Math.tan(PITCH);
      const nY = Math.cos(PITCH) * 0.16;
      const nZ = s * Math.sin(PITCH) * 0.16;
      B.box(cx, my + nY - 0.16, mz + nZ, w, 0.32, len, { mat: X.shakes, rx: s * PITCH, collide: false, uv: 2.4 });
      // eave fascia and rafter tails
      const ez = RIDGE_Z + s * half;
      const ey = RIDGE_Y - half * Math.tan(PITCH);
      B.box(cx, ey - 0.3, ez, w, 0.28, 0.08, { mat: X.planksOut, collide: false });
      for (let x = x0 - 0.4; x <= x1 + 0.4; x += 1.2) B.box(x, ey - 0.25, ez - s * 0.5, 0.12, 0.16, 1.0, { mat: X.planksOut, rx: s * PITCH, collide: false });
    }
    // ridge log
    B.cylinder(cx, RIDGE_Y + 0.12, RIDGE_Z, 0.2, x1 - x0 + 1.8, { mat: X.peeledOut, horizontal: true, rot: 0, seg: 8, collide: false });
    // gables: board and batten
    for (const gx of [x0, x1]) {
      const shape = new THREE.Shape();
      const hw = (z1 - z0) / 2;
      shape.moveTo(-hw, 0);
      shape.lineTo(hw, 0);
      shape.lineTo(0, RIDGE_Y - TOP);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
      geo.translate(0, 0, -0.15);
      const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
      m.setPosition(gx, TOP, RIDGE_Z);
      B.mesh(geo, m, X.planksOut);
      // battens
      for (let z = -hw + 0.6; z < hw; z += 0.6) {
        const h = (RIDGE_Y - TOP) * (1 - Math.abs(z) / hw) - 0.1;
        if (h < 0.2) continue;
        B.box(gx + Math.sign(gx - cx) * 0.17, TOP, RIDGE_Z + z, 0.04, h, 0.07, { mat: X.planksOut, collide: false });
      }
      // a round vent in each gable
      B.cylinder(gx + Math.sign(gx - cx) * 0.18, TOP + 2.4 - 0.45, RIDGE_Z, 0.45, 0.06, { mat: X.trimOut, horizontal: true, rot: 0, seg: 16, collide: false });
    }
    // the chimney from the lobby fireplace
    B.box(-42, TOP - 0.5, 29.4, 2.6, 7.9, 1.8, { mat: X.stoneOut, collide: false, uv: 3 });
    B.box(-42, TOP + 7.3, 29.4, 2.9, 0.25, 2.1, { mat: X.stoneOut, collide: false, uv: 3 });
  }

  // ---- inside ---------------------------------------------------------------------------
  // ceiling (stops jumps, blocks the lamps' light), with log beams under it
  B.box(cx, CEIL, (z0 + z1) / 2, x1 - x0 - 2 * W, 0.16, z1 - z0 - 2 * W, { mat: X.pine, uv: 1.5, walkable: false, nav: false });
  for (let x = x0 + 2.0; x < x1 - 1; x += 3) {
    B.cylinder(x, CEIL - 0.3, (z0 + z1) / 2, 0.15, z1 - z0 - 1.0, { mat: X.peeled, horizontal: true, rot: Math.PI / 2, seg: 8, collide: false });
  }
  const part = (ax, az, bx, bz, openings = [], mat = X.pine) => B.wall(ax, az, bx, bz, { h: CEIL - F, t: 0.15, y0: F, mat, uv: 1.5, openings });
  // service strip wall with the office, hall and elevator room doors
  part(ix0 + W / 2, BACK, ix1 - W / 2, BACK, [{ at: 1.9, w: 1.0, h: 2.2 }, { at: 14.0, w: 1.6, h: 2.4 }, { at: 30.9, w: 1.4, h: 2.3 }]);
  part(-50, iz0 + W / 2, -50, BACK);
  part(-47, iz0 + W / 2, -47, BACK);
  part(-44, iz0 + W / 2, -44, BACK);
  part(-39, iz0 + W / 2, -39, BACK);
  part(-31, iz0 + W / 2, -31, BACK);
  // the elevator wall: concrete, poured by Avion
  B.wall(-27, iz0 + W / 2, -27, BACK, { h: CEIL - F, t: 0.3, y0: F, mat: M.concrete, uv: 2, openings: [{ at: 25.2 - (iz0 + W / 2), w: 1.6, h: 2.4 }] });
  // front rooms open into each other between log posts
  for (const px of [-48, -36]) {
    part(px, BACK, px, 32.2);
    part(px, 40.8, px, iz1 - W / 2);
    for (const pz of [32.2, 40.8]) B.cylinder(px, F, pz, 0.2, CEIL - F, { mat: X.peeled, seg: 10, walkable: false });
    B.box(px, CEIL - 0.55, 36.5, 0.34, 0.4, 8.6, { mat: X.peeled, collide: false });
  }

  // lobby: fireplace, ticket counter, the cavern model under glass
  fireplace(B, M, X, fx);
  counter(B, M, X, -38.3, BACK + 0.6, 3.0, 0.9, 0);
  {
    const t = signTex([{ text: 'TOUR TICKETS', size: 70 }, { text: 'Next tour 10:30 • Adults $2.50', size: 30, weight: 600 }], { w: 512, h: 180 });
    B.sign(-38.3, F + 2.65, BACK + 0.09, 0, t, 2.6, 0.9);
    B.box(-37.4, F + 1.05, BACK + 0.45, 0.4, 0.3, 0.35, { mat: X.brass, collide: false }); // register
  }
  caveModel(B, M, X, -42, 37.2);
  for (const x of [-46.4, -37.6]) bench(B, M, X, x, F, iz1 - W / 2 - 0.55, Math.PI, 1.5);
  // brochure rack and the wall map
  B.box(-36.6, F, 32.95, 0.5, 1.5, 1.2, { mat: X.planksDark, walkable: false });
  {
    const t = signTex([{ text: 'EMBER HOLLOW CAVERNS', size: 52 }, { text: 'Grand Gallery • Mirror Lake • The Cathedral', size: 24, weight: 600 }, { text: '1.2 km of passages • 54°F all year', size: 22, weight: 500 }], { w: 512, h: 300, bg: '#d9cfb8', fg: '#3a2c20' });
    B.sign(-47.9, F + 2.3, 42.0, Math.PI / 2, t, 2.4, 1.4);
  }
  lamp(B, M, X, -42, CEIL - 1.25, 37.2, 'wheel', 56, 15, 0xffdcb4);

  // gift shop: shelving, the checkout, souvenirs
  for (const [gz, seed] of [[35.0, 11], [39.0, 12]]) gondola(B, M, X, -54.5, gz, 5.2, seed);
  for (const gx of [-57.0, -53.5]) displayCase(B, M, X, gx, z1 - W - 0.45);
  counter(B, M, X, -49.6, 40.2, 0.8, 3.0, 0);
  B.box(-49.6, F + 1.05, 39.4, 0.4, 0.3, 0.35, { mat: X.brass, collide: false });
  B.cylinder(-51.2, F, 32.4, 0.35, 1.7, { mat: M.steelDark, seg: 8, walkable: false }); // postcard spinner
  {
    const t = signTex([{ text: 'GIFTS & SOUVENIRS', size: 64 }], { w: 512, h: 96 });
    B.sign(-54.5, F + 3.7, BACK + 0.09, 0, t, 3.2, 0.6);
  }
  lamp(B, M, X, -54.5, CEIL - 0.9, 33.6, 'pendant', 30, 11, 0xffdcb4);
  lamp(B, M, X, -54.5, CEIL - 0.9, 40.4, 'pendant', 30, 11, 0xffdcb4);

  // snack bar: counter with stools, menu board, tables
  counter(B, M, X, -32.8, BACK + 0.55, 5.2, 0.8, 0);
  for (let k = 0; k < 4; k++) {
    const sx = -34.6 + k * 1.2;
    B.cylinder(sx, F, BACK + 1.45, 0.04, 0.72, { mat: X.chrome, seg: 6, collide: false });
    B.cylinder(sx, F + 0.72, BACK + 1.45, 0.2, 0.08, { mat: X.paintRed, seg: 12, collide: false });
  }
  B.box(-30.9, F + 1.0, BACK + 0.4, 0.6, 0.65, 0.5, { mat: X.chrome, collide: false }); // cocoa urn
  {
    const t = signTex([{ text: 'SNACK BAR', size: 66 }, { text: 'HOT DOGS 35¢ • COCOA 15¢', size: 30, weight: 600 }, { text: 'CAVE FUDGE • ROCK CANDY', size: 28, weight: 600 }], { w: 512, h: 240, bg: '#2a2420', fg: '#f2e2c0' });
    B.sign(-32.8, F + 2.75, BACK + 0.09, 0, t, 3.0, 1.4);
  }
  for (const [tx, tz] of [[-33.2, 35.4], [-28.4, 35.4], [-33.2, 39.8], [-28.4, 39.8]]) table(B, M, X, tx, tz);
  for (const [lx, lz] of [[-33.2, 35.4], [-28.4, 35.4], [-30.8, 39.8]]) lamp(B, M, X, lx, CEIL - 0.9, lz, 'pendant', 26, 10);

  // office: desk, files, the breaker panel (an interactable) on the west wall
  B.box(-55.4, F, 24.0, 1.8, 0.78, 0.8, { mat: X.planksDark, walkable: true });
  B.box(-55.4, F + 0.78, 24.0, 0.5, 0.12, 0.35, { mat: M.black, collide: false });
  for (const fz of [23.0, 23.6]) B.box(-51.0, F, fz, 0.6, 1.4, 0.55, { mat: X.paintGreen, walkable: false });
  B.box(-52.8, F, 29.3, 1.2, 1.9, 0.45, { mat: X.planksDark, walkable: false });
  lamp(B, M, X, -54.8, CEIL - 0.25, 25.8, 'flush', 18, 8);
  // back hall: restroom doors, a drinking fountain, the exit light
  for (const [dz, label] of [[24.4, 'MEN'], [27.6, 'WOMEN']]) {
    B.box(-46.92, F, dz, 0.06, 2.15, 0.9, { mat: X.planksDark, collide: false });
    const t = signTex([{ text: label, size: 70 }], { w: 256, h: 96, bg: '#3e5a3a', fg: '#efe4cc' });
    B.sign(-46.88, F + 1.5, dz, Math.PI / 2, t, 0.5, 0.19);
  }
  B.box(-44.2, F + 0.75, 26, 0.35, 0.3, 0.45, { mat: X.chrome, collide: false });
  lamp(B, M, X, -45.5, CEIL - 0.25, 26.0, 'flush', 14, 7);
  exitSign(B, -45.5, F + 2.75, iz0 + W / 2 + 0.06, 0);
  exitSign(B, -42, F + 3.15, iz1 - W / 2 - 0.06, Math.PI);
  // the elevator room: lockers, a desk of monitors, warning signs
  for (let k = 0; k < 4; k++) B.box(-30.62, F, 23.1 + k * 0.55, 0.5, 1.9, 0.52, { mat: M.steelDark, walkable: false });
  B.box(-29.0, F, 29.2, 1.6, 0.76, 0.7, { mat: M.steelDark, walkable: true });
  fx.screens.push({ x: -29.3, y: F + 1.1, z: 29.05, rot: Math.PI });
  fx.screens.push({ x: -28.5, y: F + 1.1, z: 29.05, rot: Math.PI });
  {
    const t = signTex([{ text: 'AVION GEOTHERMAL', size: 54 }, { text: 'SERVICE LIFT • LEVEL B6 CALDERA', size: 28, weight: 600 }, { text: 'AUTHORIZED PERSONNEL ONLY', size: 26, weight: 600, color: '#ff6a4a' }], { w: 512, h: 220, bg: '#1d2226', fg: '#e8e4d8' });
    B.sign(-27.17, F + 3.1, 25.2, -Math.PI / 2, t, 1.9, 0.82);
  }
  lamp(B, M, X, -29.0, CEIL - 0.2, 26.0, 'tube', 30, 9, 0xd8ecff);
  // floor registers where zombies come up through the old heating ducts
  for (const [vx, vz] of LODGE_VENTS) B.box(vx, F - 0.02, vz, 0.75, 0.04, 0.5, { mat: M.black, collide: false, cast: false });

  // back stoop at the staff exit
  B.box(-45.5, 0, 21.3, 2.6, F, 1.4, { mat: X.stoneOut, uv: 3, walkable: true });
  stairs(B, M, X.stoneOut, -45.5, 19.35, H(-45.5, 19.35), -45.5, 20.6, F, 2.4, { rails: false });
  lantern(B, M, -44.4, F + 2.35, z0 - 0.2, 'lodge', 12, 1);
}

// floor vents (spawners), used by the layout as well
export const LODGE_VENTS = [[-55.0, 41.6], [-45.6, 33.9], [-29.8, 42.5], [-52.6, 24.0], [-45.5, 23.4], [-29.6, 27.6]];

// Window: frame inside and out, muntins, sill and glass (or drawn blinds).
function windowFrame(B, M, X, cx, cz, rot, w, blind) {
  const at = frame(cx, cz, rot);
  const y0 = F + 1.0;
  const h = 1.5;
  for (const [side, mat] of [[1, X.trimOut], [-1, X.trim]]) {
    const off = side * 0.27;
    const piece = (lx, ly, ww, hh) => {
      const [px, pz] = at(lx, off);
      B.box(px, ly, pz, ww, hh, 0.07, { mat, rot, collide: false });
    };
    piece(0, y0 - 0.06, w + 0.24, 0.1);
    piece(0, y0 + h, w + 0.24, 0.12);
    piece(-w / 2 - 0.06, y0, 0.12, h);
    piece(w / 2 + 0.06, y0, 0.12, h);
  }
  const [gx, gz] = at(0, 0.02);
  if (blind) B.box(gx, y0, gz, w, h, 0.03, { mat: X.paintTan, rot, collide: false });
  B.box(gx, y0, gz, w, h, 0.02, { mat: M.glass, rot, collide: false, cast: false });
  // muntins: two over two
  const [mx, mz] = at(0, 0.03);
  B.box(mx, y0, mz, 0.05, h, 0.04, { mat: X.trimOut, rot, collide: false });
  B.box(mx, y0 + h / 2 - 0.025, mz, w, 0.05, 0.04, { mat: X.trimOut, rot, collide: false });
  const [sx, sz] = at(0, 0.32);
  B.box(sx, y0 - 0.1, sz, w + 0.3, 0.06, 0.16, { mat: X.trimOut, rot, collide: false });
  // the glass stops bullets no more than air does, but it does stop people
  B.physics.addBox({ x: gx, y: y0, z: gz, w, h, d: 0.3, rot, walkable: false, material: 'metal', bullets: false });
}

// Lights on the visitor center circuit. kind: wheel | pendant | flush | tube
function lamp(B, M, X, x, y, z, kind, intensity, range, color = 0xffc98a) {
  if (kind === 'wheel') {
    // wagon-wheel chandelier on chains
    B.cylinder(x, y, z, 0.9, 0.08, { mat: M.black, seg: 20, open: true, collide: false });
    for (let k = 0; k < 4; k++) B.box(x, y + 0.02, z, 1.8, 0.04, 0.05, { mat: M.black, rot: (k * Math.PI) / 4, collide: false });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.01, 0.01, CEIL - y, 4);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22));
      m.setPosition(x + Math.cos(a) * 0.45, (y + CEIL) / 2, z + Math.sin(a) * 0.45);
      B.mesh(g, m, M.black, { cast: false });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.fixture(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6), new THREE.Matrix4().makeTranslation(x + Math.cos(a) * 0.9, y + 0.17, z + Math.sin(a) * 0.9), color, 3, 'lodge');
    }
    B.bakedLamp(x, y + 0.1, z, { color, intensity, range, circuit: 'lodge', occlude: true, fitting: null, glow: 2.2 });
    return;
  }
  if (kind === 'pendant') {
    B.box(x, y + 0.2, z, 0.02, CEIL - y - 0.2, 0.02, { mat: M.black, collide: false, cast: false });
    B.cylinder(x, y + 0.12, z, 0.32, 0.1, { mat: X.paintGreen, rTop: 0.06, seg: 14, collide: false });
    B.bakedLamp(x, y, z, { color, intensity, range, circuit: 'lodge', occlude: true, fitting: new THREE.SphereGeometry(0.11, 10, 6), bright: 5, glow: 1.3 });
    return;
  }
  if (kind === 'tube') {
    B.box(x, y - 0.06, z, 1.3, 0.06, 0.24, { mat: M.steel, collide: false });
    B.bakedLamp(x, y - 0.1, z, { color, intensity, range, circuit: 'lodge', occlude: true, fitting: new THREE.BoxGeometry(1.2, 0.04, 0.14), bright: 4, glow: 1.4 });
    return;
  }
  B.bakedLamp(x, y - 0.06, z, { color, intensity, range, circuit: 'lodge', occlude: true, fitting: new THREE.CylinderGeometry(0.22, 0.26, 0.08, 12), bright: 3.5, glow: 1.2 });
}

// Iron lantern (porch, doors). wall: which way (along z) its bracket runs to the wall, or 0.
function lantern(B, M, x, y, z, circuit, intensity, wall = 0) {
  B.box(x, y - 0.22, z, 0.2, 0.05, 0.2, { mat: M.black, collide: false });
  B.box(x, y + 0.18, z, 0.24, 0.06, 0.24, { mat: M.black, collide: false });
  if (wall) B.box(x, y + 0.1, z + wall * 0.16, 0.04, 0.04, 0.3, { mat: M.black, collide: false });
  B.bakedLamp(x, y, z, { color: 0xffbf78, intensity, range: 10, circuit, glow: 1.2, fitting: new THREE.BoxGeometry(0.15, 0.32, 0.15), bright: 4 });
}

function exitSign(B, x, y, z, rot) {
  const tex = signTex([{ text: 'EXIT', size: 110 }], { w: 256, h: 96, bg: '#1a0604', fg: '#ff3a26' });
  B.sign(x, y, z, rot, tex, 0.46, 0.17, { emissive: 2.2 });
}

function counter(B, M, X, x, z, w, d, rot) {
  B.box(x, F, z, w, 0.98, d, { mat: X.planksDark, rot, walkable: true });
  B.box(x, F + 0.98, z, w + 0.08, 0.06, d + 0.1, { mat: X.pine, rot, collide: false });
}

function table(B, M, X, x, z) {
  B.box(x, F + 0.72, z, 0.95, 0.05, 0.95, { mat: X.pine, collide: false });
  B.cylinder(x, F, z, 0.06, 0.72, { mat: M.black, seg: 6, collide: false });
  B.cylinder(x, F, z, 0.3, 0.04, { mat: M.black, seg: 10, collide: false });
  for (const [dx, dz, r] of [[0.75, 0, Math.PI / 2], [-0.75, 0, -Math.PI / 2]]) {
    B.box(x + dx, F + 0.44, z + dz, 0.42, 0.05, 0.42, { mat: X.planksDark, collide: false });
    B.box(x + dx * 1.28, F + 0.44, z + dz, 0.05, 0.48, 0.42, { mat: X.planksDark, rot: r - Math.PI / 2, collide: false });
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) B.box(x + dx + lx, F, z + dz + lz, 0.035, 0.44, 0.035, { mat: M.black, collide: false });
  }
  B.physics.addBox({ x, y: F, z, w: 2.0, h: 0.78, d: 0.95, walkable: true, material: 'wood' });
}

// Freestanding shelves, souvenirs on both faces.
function gondola(B, M, X, x, z, len, seed) {
  B.box(x, F, z, len, 1.55, 0.18, { mat: X.planksDark, walkable: false });
  for (const s of [-1, 1]) {
    for (const y of [0.35, 0.8, 1.25]) B.box(x, F + y, z + s * 0.3, len, 0.04, 0.42, { mat: X.pine, collide: false });
    const tex = souvenirTexture(seed * 7 + (s > 0 ? 1 : 2));
    tex.repeat.set(len / 2.5, 1);
    tex.wrapS = THREE.RepeatWrapping;
    for (const [y, k] of [[0.39, 0], [0.84, 1], [1.29, 2]]) {
      const t = k === 0 ? tex : tex.clone();
      if (k) {
        t.offset.x = k * 0.37;
        t.needsUpdate = true;
      }
      B.sign(x, F + y + 0.16, z + s * 0.33, s > 0 ? 0 : Math.PI, t, len, 0.32, { transparent: false });
    }
  }
  B.box(x, F, z, len + 0.04, 0.12, 0.84, { mat: X.planksDark, collide: false });
  B.physics.addBox({ x, y: F, z, w: len, h: 1.55, d: 0.84, walkable: false, material: 'wood' });
}

// Glass-topped case of geodes under a front window.
function displayCase(B, M, X, x, z) {
  B.box(x, F, z, 2.2, 0.85, 0.7, { mat: X.planksDark, walkable: true });
  const rng = makeRng(Math.round(x * 10));
  for (let k = 0; k < 6; k++) {
    const g = new THREE.SphereGeometry(0.09 + rng() * 0.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Matrix4().makeTranslation(x - 0.8 + k * 0.32, F + 0.85, z + (rng() - 0.5) * 0.3);
    B.mesh(g, m, k % 2 ? X.amethyst : X.modelRock, { cast: false });
  }
  B.box(x, F + 0.85, z, 2.2, 0.28, 0.7, { mat: M.glass, collide: false, cast: false });
}

// The relief model of the caverns, under a glass case.
function caveModel(B, M, X, x, z) {
  B.box(x, F, z, 2.6, 0.82, 1.7, { mat: X.planksDark, walkable: true });
  const g = new THREE.PlaneGeometry(2.4, 1.5, 24, 15);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getZ(i);
    const hill = 0.16 * Math.exp(-((u + 0.3) ** 2 + (v + 0.2) ** 2) * 2.5) + 0.08 * Math.exp(-((u - 0.6) ** 2 + v ** 2) * 4);
    p.setY(i, hill + 0.02 * Math.sin(u * 9) * Math.cos(v * 7));
  }
  g.computeVertexNormals();
  B.mesh(g, new THREE.Matrix4().makeTranslation(x, F + 0.84, z), X.modelForest, { cast: false });
  // the tour route, picked out in white paint
  for (let k = 0; k < 9; k++) B.box(x - 0.9 + k * 0.22, F + 0.86 + 0.06 * Math.sin(k), z - 0.3 + 0.25 * Math.sin(k * 0.8), 0.14, 0.012, 0.03, { mat: X.lineWhite, rot: 0.4 * Math.cos(k), collide: false, cast: false });
  B.box(x, F + 0.82, z, 2.62, 0.5, 1.72, { mat: M.glass, collide: false, cast: false });
}

// The lobby's river-rock fireplace (the chimney goes up through the roof).
function fireplace(B, M, X, fx) {
  const x = -42;
  const z = BACK + 0.3;
  B.box(x, F, z - 0.3, 3.4, CEIL - F, 1.2, { mat: X.stone, uv: 3, walkable: false });
  B.box(x, F, z + 0.38, 3.8, 0.35, 0.9, { mat: X.stone, uv: 3, walkable: true });
  B.box(x, F + 0.35, z + 0.29, 1.5, 1.05, 0.04, { mat: M.black, collide: false });
  B.box(x, F + 1.4, z + 0.36, 2.6, 0.18, 0.3, { mat: X.peeled, collide: false }); // mantel log
  // the fire's embers are cold; the evacuation was weeks ago
  B.box(x, F + 0.35, z + 0.15, 0.9, 0.12, 0.3, { mat: M.log, collide: false });
  void fx;
}
