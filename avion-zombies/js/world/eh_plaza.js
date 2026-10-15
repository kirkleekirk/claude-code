import * as THREE from '../../vendor/three.module.min.js';
import { PLAZA, PLAZA_Y, PORTAL_MAIN, PORTAL_EXIT, STAIRS_W, STAIRS_E, cliffZ, TRAIL } from './eh_shape.js';
import { boulder, placeAt } from './formations.js';
import { lampPost, signTex, stairs, bench, trashCan, parkSign, ribbon, frame } from './eh_props.js';
import { makeRng } from '../util.js';
import { buildCliff, cliffHoles } from './eh_cliff.js';

// The cave entrance plaza: flagstone paving on retaining walls, the 1931 stone portal of the
// show cave, the old tour exit that Avion sealed behind concrete, the ticket booth (breaker on
// its side), the tour shelter, interpretive signs, and the stairs down to the lodge trail and
// the gem mine.
const Y = PLAZA_Y;
export const BOOTH = { x: -9.0, z: -15.2, w: 2.8, d: 2.3 };
export const SHELTER = { x: -15, z: -2.6, w: 7.6, d: 4.6 };
export const AVION_CABIN = { x: 27.6, z: -12.4, w: 2.5, d: 5.0 };

export function buildPlaza(S) {
  const { B, M, X, H, fx } = S;
  const pp = PLAZA.wall - PLAZA.parapet;
  const xw = PLAZA.x0 - PLAZA.wall;
  const xe = PLAZA.x1 + PLAZA.wall;
  const zs = PLAZA.z1 + PLAZA.wall;

  // ---- retaining walls and parapets ----------------------------------------------------------
  const wallBase = 0;
  B.box((xw + xe) / 2, wallBase, PLAZA.z1 + PLAZA.wall / 2, xe - xw, Y - wallBase, PLAZA.wall, { mat: X.stoneOut, uv: 3, walkable: true });
  const cw = cliffZ(xw + 1) - 3;
  const ce = cliffZ(xe - 1) - 3;
  B.box(xw + PLAZA.wall / 2, wallBase, (cw + PLAZA.z1) / 2, PLAZA.wall, Y - wallBase, PLAZA.z1 - cw, { mat: X.stoneOut, uv: 3, walkable: true });
  B.box(xe - PLAZA.wall / 2, wallBase, (ce + PLAZA.z1) / 2, PLAZA.wall, Y - wallBase, PLAZA.z1 - ce, { mat: X.stoneOut, uv: 3, walkable: true });
  // parapets with a dressed coping, gaps at the two stairs
  const parapet = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.2) return;
    const rot = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    B.box(mx, Y, mz, len, 0.9, PLAZA.parapet, { mat: X.stoneOut, rot, uv: 3, walkable: false });
    B.box(mx, Y + 0.9, mz, len + 0.1, 0.12, PLAZA.parapet + 0.14, { mat: M.concrete, rot, collide: false, uv: 2 });
  };
  const zp = zs - PLAZA.parapet / 2;
  const sw0 = STAIRS_W.x - STAIRS_W.w / 2;
  const sw1 = STAIRS_W.x + STAIRS_W.w / 2;
  const se0 = STAIRS_E.x - STAIRS_E.w / 2;
  const se1 = STAIRS_E.x + STAIRS_E.w / 2;
  parapet(xw, zp, sw0, zp);
  parapet(sw1, zp, se0, zp);
  parapet(se1, zp, xe, zp);
  parapet(xw + PLAZA.parapet / 2, zs, xw + PLAZA.parapet / 2, cw + 2.5);
  parapet(xe - PLAZA.parapet / 2, zs, xe - PLAZA.parapet / 2, ce + 2.5);
  // stairs down through the south wall
  for (const st of [STAIRS_W, STAIRS_E]) {
    stairs(B, M, X.stoneOut, st.x, st.z1, H(st.x, st.z1 + 0.3), st.x, st.z0, Y, st.w, { railMat: M.black });
  }
  // the trail from the lodge's back door to the west stairs
  ribbon(B, M.gravel, TRAIL, 2.4, H, { lift: 0.02, uv: 2.5 });
  lampPost(B, M, X, -37.4, H(-37.4, 19.2), 19.2, 'lodge');

  // ---- paving ------------------------------------------------------------------------------
  {
    const shape = new THREE.Shape();
    shape.moveTo(xw + PLAZA.parapet, -(zs - PLAZA.parapet));
    shape.lineTo(xe - PLAZA.parapet, -(zs - PLAZA.parapet));
    for (let x = xe - PLAZA.parapet; x >= xw + PLAZA.parapet - 0.01; x -= 1) shape.lineTo(x, -(cliffZ(x) - 0.3));
    shape.lineTo(xw + PLAZA.parapet, -(cliffZ(xw + PLAZA.parapet) - 0.3));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    B.mesh(g, new THREE.Matrix4().makeTranslation(0, Y + 0.025, 0), X.flag, { cast: false });
  }

  // ---- the portals and the rock face around them ------------------------------------------------
  stonePortal(S);
  avionPortal(S);
  buildCliff(S, cliffHoles);

  // ---- ticket booth (the entrance breaker is on its west side) --------------------------------
  {
    const { x, z, w, d } = BOOTH;
    B.box(x, Y, z, w, 1.0, d, { mat: X.stoneOut, uv: 3, walkable: false });
    const at = frame(x, z, 0);
    // timber upper: corner posts, a sill, glazing on three sides, the window counter
    for (const [lx, lz] of [[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]]) {
      const [px, pz] = at(lx, lz);
      B.box(px, Y + 1.0, pz, 0.16, 1.6, 0.16, { mat: X.peeledOut, collide: false });
    }
    B.box(x, Y + 1.0, z - d / 2 + 0.06, w, 1.6, 0.1, { mat: X.planksOut, collide: false, uv: 1.2 });
    B.box(x, Y + 1.05, z + d / 2 - 0.05, w - 0.3, 1.25, 0.04, { mat: M.glass, collide: false, cast: false });
    for (const s of [-1, 1]) B.box(x + s * (w / 2 - 0.05), Y + 1.05, z + 0.2, 0.04, 1.25, d - 0.7, { mat: M.glass, collide: false, cast: false });
    B.box(x, Y + 1.0, z + d / 2 + 0.12, w - 0.2, 0.06, 0.34, { mat: X.planksDark, collide: false });
    B.box(x, Y + 2.6, z, w + 0.1, 0.12, d + 0.1, { mat: X.planksOut, collide: false });
    // hipped roof
    const geo = new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.55, 1.1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(1, 1, d / w);
    B.mesh(geo, new THREE.Matrix4().makeTranslation(x, Y + 2.72 + 0.55, z), X.shakes);
    B.physics.addBox({ x, y: Y, z, w, h: 3.4, d, walkable: false, material: 'wood' });
    const t = signTex([{ text: 'TICKETS', size: 80 }, { text: 'Tours every half hour', size: 30, weight: 600 }], { w: 512, h: 170 });
    B.sign(x, Y + 2.92, z + d / 2 + 0.36, 0, t, 1.8, 0.6);
    B.box(x, Y + 2.62, z + d / 2 + 0.3, 1.9, 0.68, 0.06, { mat: X.planksOut, collide: false });
    B.bakedLamp(x, Y + 2.45, z + d / 2 + 0.5, { color: 0xffc98a, intensity: 14, range: 9, circuit: 'plaza', glow: 1.0, fitting: new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10), bright: 4 });
  }
  // the queue lane up to the stone portal: brass posts and red rope
  for (const s of [-1, 1]) {
    const x = PORTAL_MAIN.x + s * 2.6;
    for (let z = PORTAL_MAIN.z + 2.6; z <= PORTAL_MAIN.z + 9.6; z += 1.75) {
      B.cylinder(x, Y, z, 0.05, 0.95, { mat: X.brass, seg: 8, collide: false });
      B.cylinder(x, Y, z, 0.17, 0.05, { mat: X.brass, seg: 10, collide: false });
    }
    for (let z = PORTAL_MAIN.z + 2.6; z < PORTAL_MAIN.z + 9.6; z += 1.75) {
      const g = new THREE.TorusGeometry(0.88, 0.022, 4, 10, Math.PI);
      const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
      m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
      m.setPosition(x, Y + 0.9, z + 0.875);
      B.mesh(g, m, X.rope, { cast: false });
    }
    B.physics.addBox({ x, y: Y, z: PORTAL_MAIN.z + 6.1, w: 0.12, h: 1.0, d: 7.0, walkable: false, material: 'metal', bullets: false });
  }

  // ---- tour shelter (benches, the wall-buy on its back wall) -----------------------------------
  {
    const { x, z, w, d } = SHELTER;
    const posts = [[-w / 2 + 0.2, -d / 2 + 0.2], [w / 2 - 0.2, -d / 2 + 0.2], [-w / 2 + 0.2, d / 2 - 0.2], [w / 2 - 0.2, d / 2 - 0.2]];
    for (const [lx, lz] of posts) B.cylinder(x + lx, Y, z + lz, 0.15, 2.7, { mat: X.peeledOut, seg: 9, walkable: false });
    B.box(x, Y, z - d / 2 + 0.2, w - 0.4, 2.5, 0.16, { mat: X.planksOut, uv: 1.2, walkable: false });
    const pitch = 0.45;
    const half = d / 2 + 0.6;
    const ry = Y + 2.7 + (d / 2 - 0.2) * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const len = half / Math.cos(pitch);
      B.box(x, ry - (half / 2) * Math.tan(pitch) - 0.06, z + s * (half / 2), w + 1.0, 0.18, len, { mat: X.shakes, rx: s * pitch, collide: false, uv: 2.4 });
    }
    for (const lz of [-d / 2 + 0.2, d / 2 - 0.2]) B.box(x, Y + 2.62, z + lz, w, 0.24, 0.22, { mat: X.peeledOut, collide: false });
    B.physics.addBox({ x, y: Y + 2.7, z, w: w + 0.8, h: 2.2, d: d + 1.0, walkable: false, nav: false, material: 'wood' });
    for (const bx of [x - 2.0, x + 2.0]) bench(B, M, X, bx, Y, z + 0.3, 0, 2.2);
    const t = signTex([{ text: 'TOURS DEPART HERE', size: 58 }, { text: 'Please wait for your guide', size: 30, weight: 500 }], { w: 512, h: 150 });
    B.sign(x + 2.4, Y + 2.0, z - d / 2 + 0.3, 0, t, 1.8, 0.52);
    B.bakedLamp(x, Y + 2.45, z, { color: 0xffc98a, intensity: 16, range: 10, circuit: 'plaza', glow: 1.0, fitting: new THREE.CylinderGeometry(0.2, 0.24, 0.08, 10), bright: 4 });
  }

  // ---- Avion's site security cabin by the sealed exit --------------------------------------------
  {
    const { x, z, w, d } = AVION_CABIN;
    B.box(x, Y, z, w, 2.6, d, { mat: M.white, uv: 2, walkable: true });
    for (let k = 0; k < 9; k++) B.box(x - w / 2 - 0.02, Y + 0.1, z - d / 2 + 0.3 + k * 0.55, 0.04, 2.4, 0.06, { mat: M.white, collide: false });
    B.box(x - w / 2 - 0.03, Y + 1.2, z - 0.8, 0.04, 0.9, 1.2, { mat: X.window, collide: false });
    B.box(x - w / 2 - 0.03, Y, z + 1.4, 0.05, 2.1, 0.9, { mat: M.steelDark, collide: false });
    const t = signTex([{ text: 'AVION', size: 80 }, { text: 'SITE SECURITY', size: 36, weight: 600 }], { w: 512, h: 170, bg: '#1d2226', fg: '#e8e4d8' });
    B.sign(x - w / 2 - 0.06, Y + 2.05, z + 0.2, -Math.PI / 2, t, 1.5, 0.5);
    fx.screens.push({ x: x - w / 2 + 0.25, y: Y + 1.4, z: z - 0.8, rot: -Math.PI / 2 });
    // floodlight on the cabin roof aimed at the exit portal
    B.box(x, Y + 2.6, z - 1.6, 0.5, 0.3, 0.5, { mat: M.black, collide: false });
    B.bakedLamp(x - 0.3, Y + 3.0, z - 1.9, {
      color: 0xe8f0ff, intensity: 90, range: 22, circuit: 'plaza', glow: 1.6, rot: 0,
      fitting: new THREE.BoxGeometry(0.4, 0.3, 0.06), bright: 6,
      spot: { dir: new THREE.Vector3(-0.2, -0.35, -1), angle: 0.6, penumbra: 0.5 },
    });
  }
  // jersey barriers in front of the sealed exit
  for (const [bx, bz, r] of [[PORTAL_EXIT.x - 4.4, PORTAL_EXIT.z + 4.6, 0.35], [PORTAL_EXIT.x + 4.4, PORTAL_EXIT.z + 4.6, -0.35]]) {
    B.box(bx, Y, bz, 3.0, 0.85, 0.6, { mat: M.concrete, rot: r, uv: 2, walkable: false });
  }

  // ---- lamps, signs, benches, the bat house --------------------------------------------------
  for (const [x, z] of [[-27, -11], [-21, 5.0], [-3.5, 4.2], [12, 4.2], [12.5, -12], [26, 3.6], [-14, -17.5]]) lampPost(B, M, X, x, Y, z, 'plaza');
  // floodlights at the foot of the stone portal, washing up its face
  for (const s of [-1, 1]) {
    const fx0 = PORTAL_MAIN.x + s * 5.4;
    const fz = PORTAL_MAIN.z + 3.4;
    B.box(fx0, Y, fz, 0.45, 0.35, 0.3, { mat: M.black, collide: false, rot: s * 0.3 });
    B.bakedLamp(fx0, Y + 0.45, fz - 0.1, {
      color: 0xffd6a0, intensity: 70, range: 16, circuit: 'plaza', glow: 0.8, fitting: new THREE.BoxGeometry(0.36, 0.04, 0.24), bright: 6,
      spot: { dir: new THREE.Vector3(-s * 0.35, 1.0, -0.75), angle: 0.7, penumbra: 0.6 },
    });
  }
  const story = signTex([{ text: 'THE EMBER HOLLOW STORY', size: 44 }, { text: 'In 1927 two brothers felt warm air breathing', size: 22, weight: 500 }, { text: 'from a crack in this cliff. Inside: a gallery', size: 22, weight: 500 }, { text: 'of stone, and a lake as still as glass.', size: 22, weight: 500 }], { w: 512, h: 300, bg: '#4a3626', fg: '#efe4cc' });
  parkSign(B, M, X, -16, Y, 8.6, Math.PI, null, 1.6, 0.94, { tex: story, post: 0.75 });
  const bats = signTex([{ text: 'BATS OF THE CASCADES', size: 42 }, { text: 'Townsend’s big-eared bats winter in the', size: 22, weight: 500 }, { text: 'caverns. Please keep your voices low.', size: 22, weight: 500 }], { w: 512, h: 260, bg: '#4a3626', fg: '#efe4cc' });
  parkSign(B, M, X, 6, Y, 8.6, Math.PI, null, 1.6, 0.82, { tex: bats, post: 0.75 });
  for (const x of [-24, -8, 2, 26.8]) bench(B, M, X, x, Y, 8.4, Math.PI, 1.8);
  for (const [x, z] of [[-11, 7.6], [9.5, 7.6], [-25.6, -15]]) trashCan(B, M, X, x, Y, z);
  // a drinking fountain
  B.cylinder(-1.2, Y, 6.9, 0.3, 0.95, { mat: X.stoneOut, seg: 10, walkable: false });
  B.box(-1.2, Y + 0.95, 6.9, 0.5, 0.06, 0.4, { mat: X.chrome, collide: false });
  // the bat house on its pole
  B.cylinder(13.6, Y, -19.2, 0.09, 5.6, { mat: X.planksDark, seg: 8, walkable: false });
  B.box(13.6, Y + 5.0, -19.2, 0.7, 1.0, 0.25, { mat: X.planksDark, collide: false });
  B.box(13.6, Y + 6.0, -19.2, 0.8, 0.06, 0.38, { mat: X.shakes, collide: false, rx: 0.2 });
  // boulders fallen from the cliff, ferns' company
  const rng = makeRng(1931);
  for (const [x, dz, r] of [[-31.5, 1.2, 1.5], [-22.4, 0.9, 1.0], [-15.6, 1.0, 0.8], [8.6, 1.1, 1.1], [16.8, 1.0, 0.9], [32.2, 1.3, 1.2], [-34.6, 2.5, 0.9]]) {
    const z = cliffZ(x) + dz;
    B.mesh(boulder(r, 7000 + Math.round(x * 10)), placeAt(x, Y + r * 0.2, z, rng() * 6), M.rock);
    B.physics.addCylinder({ x, z, r: r * 0.9, y0: Y - 0.5, y1: Y + r, walkable: true, material: 'rock' });
  }
}

// The 1931 portal: river-rock masonry built into the cliff, a relieving arch over heavy plank
// doors, the name carved over the top, lanterns on the buttresses.
function stonePortal(S) {
  const { B, M, X } = S;
  const { x, z, w, h } = PORTAL_MAIN;
  const zf = z + 1.6;
  const zb = z - 2.6;
  const zc = (zf + zb) / 2;
  const depth = zf - zb;
  const half = 6.4;
  const top = Y + 8.2;
  B.wall(x - half, zc, x + half, zc, { h: top - Y, t: depth, y0: Y, mat: X.stoneOut, uv: 3, openings: [{ at: half, w, h }] });
  // buttresses, stepped
  for (const s of [-1, 1]) {
    B.box(x + s * (half - 0.8), Y, zf + 0.5, 1.6, 4.6, 1.0, { mat: X.stoneOut, uv: 3, walkable: false });
    B.box(x + s * (half - 0.8), Y + 4.6, zf + 0.3, 1.5, 1.4, 0.6, { mat: X.stoneOut, uv: 3, collide: false });
    B.box(x + s * (half - 0.8), Y + 4.55, zf + 0.55, 1.7, 0.14, 1.15, { mat: M.concrete, collide: false });
  }
  // relieving arch of dressed voussoirs over the door
  const ay = Y + h - 0.3;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (k / 10);
    const r = w / 2 + 0.55;
    const vx = x + Math.cos(a) * r;
    const vy = ay + Math.sin(a) * r * 0.62;
    const g = new THREE.BoxGeometry(0.42, 0.7, 0.3);
    const m = new THREE.Matrix4().makeRotationZ(a - Math.PI / 2);
    m.setPosition(vx, vy, zf + 0.12);
    B.mesh(g, m, M.concreteDark);
  }
  // lintel and the carved name
  B.box(x, Y + h, zf + 0.06, w + 0.5, 0.42, 0.24, { mat: M.concreteDark, collide: false });
  const name = signTex([{ text: 'EMBER HOLLOW CAVERNS', size: 76 }, { text: 'DISCOVERED 1927 • OPENED 1931', size: 34, weight: 600 }], { w: 1024, h: 210, bg: '#8f877a', fg: '#2e2a24', stripe: false });
  B.box(x, Y + 5.85, zf + 0.05, 7.2, 1.55, 0.2, { mat: M.concrete, collide: false });
  B.sign(x, Y + 6.62, zf + 0.16, 0, name, 6.9, 1.42);
  // coping along the top
  B.box(x, top, zc + 0.5, half * 2 + 0.3, 0.3, depth - 1.0, { mat: M.concrete, collide: false, uv: 2 });
  // threshold slab through the doorway (covers the ground where cliff meets cave)
  B.box(x, Y - 0.3, z + 0.4, w + 0.1, 0.36, 2.8, { mat: X.flag, collide: false, uv: 4 });
  // iron lanterns either side of the door
  for (const s of [-1, 1]) {
    const lx = x + s * (w / 2 + 0.75);
    B.box(lx, Y + 2.9, zf + 0.18, 0.05, 0.05, 0.36, { mat: M.black, collide: false });
    B.box(lx, Y + 2.38, zf + 0.36, 0.22, 0.05, 0.22, { mat: M.black, collide: false });
    B.bakedLamp(lx, Y + 2.62, zf + 0.36, { color: 0xffbf78, intensity: 18, range: 10, circuit: 'plaza', glow: 1.3, fitting: new THREE.BoxGeometry(0.16, 0.36, 0.16), bright: 4 });
  }
}

// The old tour exit, cased in Avion concrete with a blast door.
function avionPortal(S) {
  const { B, M, X, fx } = S;
  const { x, z, w, h } = PORTAL_EXIT;
  const zf = z + 1.6;
  const zb = z - 2.6;
  const zc = (zf + zb) / 2;
  const depth = zf - zb;
  const half = 4.6;
  const top = Y + 7.0;
  B.wall(x - half, zc, x + half, zc, { h: top - Y, t: depth, y0: Y, mat: M.concrete, uv: 2.5, openings: [{ at: half, w, h }] });
  // the old carved EXIT stone, kept by Avion over their door
  const exit = signTex([{ text: 'EXIT', size: 110 }], { w: 512, h: 160, bg: '#8f877a', fg: '#2e2a24', stripe: false });
  B.box(x, Y + h + 1.2, zf + 0.03, 2.4, 0.8, 0.12, { mat: X.stoneOut, collide: false });
  B.sign(x, Y + h + 1.6, zf + 0.1, 0, exit, 2.2, 0.7);
  // hazard frame around the door, the warning sign, a keypad
  for (const s of [-1, 1]) B.box(x + s * (w / 2 + 0.22), Y, zf + 0.04, 0.36, h + 0.2, 0.08, { mat: M.hazard, collide: false });
  B.box(x, Y + h + 0.02, zf + 0.04, w + 0.8, 0.36, 0.08, { mat: M.hazard, collide: false });
  const warn = signTex([{ text: 'AVION GEOTHERMAL', size: 50 }, { text: 'CALDERA ACCESS • NO PUBLIC ENTRY', size: 28, weight: 600, color: '#ff6a4a' }], { w: 512, h: 160, bg: '#1d2226', fg: '#e8e4d8' });
  B.sign(x + w / 2 + 1.6, Y + 2.0, zf + 0.06, 0, warn, 1.7, 0.53);
  B.box(x - w / 2 - 0.85, Y + 1.15, zf + 0.06, 0.26, 0.36, 0.1, { mat: M.steelDark, collide: false });
  B.box(x - w / 2 - 0.85, Y + 1.25, zf + 0.12, 0.16, 0.12, 0.02, { mat: M.screen, collide: false });
  // a security camera on a bracket
  B.box(x + half - 0.6, Y + 5.2, zf + 0.3, 0.06, 0.06, 0.5, { mat: M.steelDark, collide: false });
  B.box(x + half - 0.6, Y + 5.05, zf + 0.62, 0.18, 0.18, 0.42, { mat: M.white, collide: false, rx: 0.3 });
  fx.beacons.push({ x: x + half - 0.6, y: Y + 5.25, z: zf + 0.84, color: 0xff2a1a, always: true });
  B.box(x, top, zc + 0.5, half * 2 + 0.2, 0.25, depth - 1.0, { mat: M.concreteDark, collide: false, uv: 2 });
  B.box(x, Y - 0.3, z + 0.4, w + 0.1, 0.36, 2.8, { mat: M.concreteDark, collide: false, uv: 3 });
}
