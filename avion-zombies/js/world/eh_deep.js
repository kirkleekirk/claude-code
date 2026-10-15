import * as THREE from '../../vendor/three.module.min.js';
import { RIVER, RIVER_HEAD, RIVER_SINK } from './eh_shape.js';
import { signTex, ribbon } from './eh_props.js';
import { crystal, rimstone, boulder, placeAt } from './formations.js';
import { makeRng } from '../util.js';

// Deeper: the crystal grotto Avion's surveyors broke into (giant selenite, hot pools) and the
// underground river with Avion's walkway, the bridge from the checkpoint tunnel and the pump
// station that feeds the CALDERA's cooling loop.
export const DEEP = {
  connector: [[-100.5, -158.2], [-113, -162], [-124, -166]],
  boardwalk: [[-124, -166], [-132.5, -169.4], [-141, -174.6], [-146.6, -180.6], [-148.2, -186.6]],
  link: [[-148.2, -186.6], [-145, -194], [-140.6, -199.4], [-134.5, -205], [-130, -209.6]],
  bank: [[-130, -209.6], [-128, -212.4], [-110, -212.3], [-90, -213.9], [-70, -216], [-50, -219], [-30, -221.6], [-10, -223.8], [6, -226], [14, -226.4], [19.6, -226.3]],
  bridge: { x: -90, z0: -203.8, z1: -213.2 },
  pump: { x: -58, z: -215.6 },
  grottoBox: { x: -133.8, z: -167.2, rot: 2.62 },
  pools: [[-151.4, -170.6, 2.2], [-136.6, -179.6, 1.8], [-147.6, -163.6, 1.5]],
};

export function buildDeep(S, K) {
  const { B, M, X, fx } = S;
  const { F, CEIL } = K;
  const rng = makeRng(4404);
  K.reserve(DEEP.grottoBox.x, DEEP.grottoBox.z, 2.4);
  for (const [x, z, r] of DEEP.pools) K.reserve(x, z, r + 1.2);

  // ---- the surveyors' route into the grotto -----------------------------------------------------
  K.walkway(DEEP.connector, 2.0, { mat: X.grate, lift: 0.12, uv: 1.5 });
  cableOnFloor(S, K, DEEP.connector, 1.2);
  tripodLight(S, K, -110.6, -159.6, [-116, -31, -164.6], 0xfff0d8, 45, 15);
  K.scatter(24, K.alongLine(DEEP.connector, 2.6), { seed: 51, clear: 0, kind: () => 'tite', titeL: 1.2 });

  // ---- the crystal grotto -------------------------------------------------------------------------
  K.walkway(DEEP.boardwalk, 2.0, { mat: X.grate, lift: 0.2, rails: 'both', railMat: M.steel, uv: 1.5, collideRails: false, railSkip: (x, z) => Math.hypot(x - DEEP.grottoBox.x, z - DEEP.grottoBox.z) < 2.6 });
  {
    // selenite beams: long blades leaning out of the floor and walls, clear of the boardwalk
    const pal = [0, 0, 0, 1];
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 34; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng());
      const lx = Math.cos(a) * 18 * rr;
      const lz = Math.sin(a) * 15 * rr;
      const c = Math.cos(0.4);
      const s = Math.sin(0.4);
      const x = -142 + lx * c - lz * s;
      const z = -174 + lx * s + lz * c;
      if (!K.cave.inExtent(x, z) || K.D(x, z) < 0.3) continue;
      if (K.pathDist(x, z) < 3.0 || K.isReserved(x, z, 0.6)) continue;
      const len = 3 + rng() * rng() * 9;
      const r = 0.22 + rng() * 0.55 + len * 0.03;
      const f = F(x, z);
      const head = CEIL(x, z) - f;
      // lean away from the boardwalk so nothing hangs over it
      let dx = x - -142;
      let dz = z - -176;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const tilt = 0.25 + rng() * 0.9;
      const top = len * Math.cos(tilt);
      if (top > head - 1) continue;
      const dir = new THREE.Vector3(dx * Math.sin(tilt), Math.cos(tilt), dz * Math.sin(tilt));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + dir.x * (len / 2 - 0.6), f + dir.y * (len / 2 - 0.6), z + dir.z * (len / 2 - 0.6)), q, new THREE.Vector3(1, 1, 1));
      B.mesh(crystal(len, r, Math.floor(rng() * 1e6)), m, X.crystal, { cast: false });
      // the blade is solid where people would walk into it
      for (const hy of [0.4, 1.2, 2.0]) {
        if (hy > dir.y * (len - 0.6)) break;
        const t = hy / dir.y;
        B.physics.addCylinder({ x: x + dir.x * t, z: z + dir.z * t, r: r * 1.1, y0: f + hy - 0.5, y1: f + hy + 0.5, walkable: false, material: 'rock' });
      }
      placed++;
      void pal;
    }
    // hot pools: still turquoise water in rimstone lips, steaming
    for (const [x, z, r] of DEEP.pools) {
      const f = F(x, z);
      const g = new THREE.CircleGeometry(r, 28);
      g.rotateX(-Math.PI / 2);
      B.mesh(g, new THREE.Matrix4().makeTranslation(x, f + 0.14, z), X.hotWater, { cast: false });
      B.mesh(rimstone(r, 0, Math.PI * 2, 0.22, Math.floor(x * 7)), new THREE.Matrix4().makeTranslation(x, f, z), X.calcite, { cast: false });
      fx.steam.push({ x, y: f + 0.25, z, r: r * 0.8, rate: 2.5 });
      B.bakedLamp(x, f + 0.25, z, { color: 0x3fd8d0, intensity: 6, range: 5, circuit: 'reactor', fitting: null, glow: 0 });
    }
    // the surveyors' camp: a table of instruments, sample crates, a dead generator
    const cx = -129.6;
    const cz = -170.6;
    const y = F(cx, cz);
    B.box(cx, y, cz, 1.8, 0.78, 0.8, { mat: M.steelDark, walkable: true, rot: 0.4 });
    B.box(cx - 0.3, y + 0.78, cz, 0.5, 0.3, 0.4, { mat: M.olive, collide: false, rot: 0.4 });
    fx.screens.push({ x: cx + 0.4, y: y + 1.0, z: cz + 0.2, rot: 0.4 + Math.PI });
    for (const [dx, dz] of [[-1.6, 1.4], [-2.4, 0.6], [-2.0, 2.2]]) B.box(cx + dx, F(cx + dx, cz + dz), cz + dz, 0.8, 0.6, 0.6, { mat: M.olive, rot: rng(), uv: 1 });
    B.box(cx + 2.6, F(cx + 2.6, cz - 1.6), cz - 1.6, 1.4, 1.0, 0.9, { mat: X.paintYellow, walkable: true, rot: -0.3 });
    const sv = signTex([{ text: 'AVION SURVEY', size: 60 }, { text: 'GROTTO 7 • TEMP 49°C • RH 99%', size: 28, weight: 600 }, { text: 'MAX 20 MIN EXPOSURE', size: 28, weight: 600, color: '#ff6a4a' }], { w: 512, h: 220, bg: '#1d2226', fg: '#e8e4d8' });
    K.board(-126.2, -167.6, -2.3, sv, 1.4, 0.6, { post: 1.1, boardMat: M.steelDark, postMat: M.steelDark });
    // survey floods on tripods, aimed into the blades
    tripodLight(S, K, -134.2, -173.4, [-146, -36, -168], 0xfff0d8, 85, 22);
    tripodLight(S, K, -145.2, -178.4, [-152, -37, -184], 0xfff0d8, 70, 18);
    tripodLight(S, K, -139.0, -169.0, [-138, -30, -160], 0x9ff0ff, 55, 18);
    tripodLight(S, K, -150.4, -176.0, [-158, -34, -172], 0xd8ecff, 60, 18);
    cableOnFloor(S, K, DEEP.boardwalk, -1.25);
    K.emergency(-131.0, F(-131.0, -171.6) + 0.35, -171.6, 0xffa040);
    K.scatter(70, K.inEllipse(-142, -174, 18, 15, 0.4), { seed: 52, clear: 0, kind: () => 'tite', titeL: 1.6 });
  }

  // ---- down to the river ------------------------------------------------------------------------------
  K.walkway(DEEP.link, 2.0, { mat: X.grate, lift: 0.12, uv: 1.5 });
  tripodLight(S, K, -143.2, -197.2, [-138, -40, -203], 0xfff0d8, 40, 14);
  K.scatter(20, K.alongLine(DEEP.link, 2.6), { seed: 53, clear: 0, kind: () => 'tite', titeL: 1.2 });

  // ---- the river -----------------------------------------------------------------------------------------
  K.walkway(DEEP.bank, 2.2, { mat: M.concrete, rails: 'right', railMat: X.paintYellow, uv: 3, collideRails: false, railSkip: (x) => Math.abs(x - DEEP.bridge.x) < 1.6 || (x > DEEP.pump.x - 4 && x < DEEP.pump.x + 4) });
  {
    // the water: level across the channel, following it down the canyon
    const pts = [];
    const lvl = [];
    for (let x = RIVER_HEAD + 1; x <= RIVER_SINK - 1; x += 2) {
      const z = channelZ(x);
      pts.push([x, z]);
      lvl.push(channelFloor(K, x, z) + 1.25);
    }
    const H = (x) => {
      for (let i = 0; i < pts.length - 1; i++) {
        if (x <= pts[i + 1][0] || i === pts.length - 2) {
          const t = Math.max(0, Math.min(1, (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0])));
          return lvl[i] + (lvl[i + 1] - lvl[i]) * t;
        }
      }
      return lvl[lvl.length - 1];
    };
    ribbon(B, X.water, pts, 3.6, H, { flat: true, lift: 0, uv: 3, across: 2, step: 1 });
    // white water where the canyon drops, the spring at its head, the sump at its end
    for (let x = -46; x <= -26; x += 4) fx.foam.push({ x, y: H(x, channelZ(x)) + 0.05, z: channelZ(x), r: 1.4 });
    fx.foam.push({ x: RIVER_HEAD + 1.5, y: H(RIVER_HEAD + 1, channelZ(RIVER_HEAD + 1)) + 0.05, z: channelZ(RIVER_HEAD + 1.5), r: 1.2 });
    fx.foam.push({ x: RIVER_SINK - 2.5, y: H(RIVER_SINK - 3, channelZ(RIVER_SINK - 3)) + 0.05, z: channelZ(RIVER_SINK - 2.5), r: 1.2 });
    fx.river = { pts, lvl };
  }
  // the footbridge from the checkpoint tunnel
  {
    const { x, z0, z1 } = DEEP.bridge;
    const y = Math.max(F(x, z0), F(x, z1)) + 0.12;
    const len = Math.abs(z1 - z0);
    const cz = (z0 + z1) / 2;
    B.box(x, y - 0.25, cz, 2.2, 0.25, len, { mat: X.grate, walkable: true, uv: 1.5 });
    for (const s of [-1, 1]) {
      B.box(x + s * 1.15, y - 0.55, cz, 0.18, 0.4, len, { mat: M.steelDark, collide: false });
      for (let k = 0; k <= 6; k++) B.box(x + s * 1.12, y, z0 - (k * (z0 - z1)) / 6, 0.07, 1.05, 0.07, { mat: X.paintYellow, collide: false });
      for (const hy of [0.5, 1.0]) B.box(x + s * 1.12, y + hy, cz, 0.06, 0.06, len, { mat: X.paintYellow, collide: false });
      B.physics.addBox({ x: x + s * 1.15, y, z: cz, w: 0.14, h: 1.1, d: len, walkable: false, material: 'metal', bullets: false });
    }
  }
  // pump station P-2 on its pad over the water, the supply main running east to the CALDERA
  {
    const { x, z } = DEEP.pump;
    const y = F(x, z - 1.6) + 0.1;
    B.box(x, y - 0.6, z + 1.6, 8.0, 0.6, 3.6, { mat: M.concrete, uv: 2, walkable: true });
    for (const dx of [-2.2, 2.2]) {
      B.cylinder(x + dx, y, z + 1.8, 0.75, 1.6, { mat: X.paintBlue, seg: 14, walkable: false });
      B.cylinder(x + dx, y + 1.6, z + 1.8, 0.45, 0.6, { mat: M.steelDark, seg: 12, collide: false });
      B.cylinder(x + dx, y - 2.6, z + 3.0, 0.18, 2.8, { mat: M.steelDark, seg: 8, collide: false });
    }
    for (const s of [-1, 1]) {
      B.box(x + s * 4.0, y, z + 1.6, 0.06, 1.05, 3.6, { mat: X.paintYellow, collide: false });
    }
    B.box(x, y + 1.0, z + 3.4, 8.0, 0.06, 0.06, { mat: X.paintYellow, collide: false });
    B.physics.addBox({ x, y, z: z + 3.4, w: 8, h: 1.1, d: 0.12, walkable: false, material: 'metal' });
    const p2 = signTex([{ text: 'PUMP STATION P-2', size: 58 }, { text: 'CALDERA COOLING SUPPLY', size: 30, weight: 600 }], { w: 512, h: 150, bg: '#1d2226', fg: '#e8e4d8' });
    for (const s of [-1, 1]) B.box(x + s * 1.05, y, z + 0.1, 0.08, 2.7, 0.08, { mat: M.steelDark, collide: false });
    B.box(x, y + 1.95, z + 0.12, 2.3, 0.75, 0.06, { mat: M.steelDark, collide: false });
    B.sign(x, y + 2.32, z + 0.08, Math.PI, p2, 2.2, 0.64);
    const swim = signTex([{ text: 'DANGER', size: 74, color: '#c8241c' }, { text: 'SWIFT COLD WATER • NO ENTRY', size: 30, weight: 600 }], { w: 512, h: 170, bg: '#e8e2d2', fg: '#1a1a1a' });
    const [sx, sz, sr] = K.beside(DEEP.bank, 16, -1.6);
    K.board(sx, sz, sr + Math.PI, swim, 1.3, 0.43, { post: 1.3, boardMat: M.steelDark, postMat: M.steelDark });
    // the supply main: on brackets along the canyon's north wall, all the way to the CALDERA link
    const main = DEEP.bank.filter(([px]) => px >= x - 2).map(([px, pz]) => [px, pz]);
    const sm = K.samples(main, 3);
    for (let i = 0; i < sm.length - 1; i++) {
      const [ax, az, tx, tz] = sm[i];
      const [bx, bz] = sm[i + 1];
      const ox = tz * 1.9;
      const oz = -tx * 1.9;
      const a = new THREE.Vector3(ax + ox, F(ax, az) + 2.6, az + oz);
      const b = new THREE.Vector3(bx + ox, F(bx, bz) + 2.6, bz + oz);
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(0.36, 0.36, len + 0.02, 12, 1, true);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      m.setPosition(a.clone().add(b).multiplyScalar(0.5));
      B.mesh(g, m, X.paintBlue, { cast: false });
      if (i % 2 === 0) B.box(a.x, F(ax, az) - 0.1, a.z, 0.12, 2.4, 0.12, { mat: M.steelDark, collide: false });
    }
  }
  // industrial floods on poles along the walkway (on the reactor's power), emergency reds
  for (let d = 6; d < 150; d += 14) {
    const p = K.beside(DEEP.bank, d, -1.5);
    const t = K.beside(DEEP.bank, d + 5, 2.5);
    if (!p || !t) break;
    pole(S, K, p[0], p[1], [t[0], F(t[0], t[1]) - 0.5, t[1]]);
  }
  for (const d of [20, 70, 125]) {
    const [x, z] = K.beside(DEEP.bank, d, -1.7);
    K.emergency(x, F(x, z) + 1.1, z, 0xff3a2a);
    B.box(x, F(x, z) - 0.2, z, 0.08, 1.25, 0.08, { mat: M.steelDark, collide: false });
  }
  K.scatter(60, K.alongLine(DEEP.bank, 6), { seed: 54, clear: 0, kind: () => 'tite', titeL: 1.8 });
  for (let k = 0; k < 10; k++) {
    const [x, z] = K.beside(DEEP.bank, 8 + k * 14, -2.6) || [0, 0];
    if (!K.cave.inExtent(x, z) || K.D(x, z) < 0.6) continue;
    const r = 0.4 + rng() * 0.6;
    B.mesh(boulder(r, 8800 + k, [0.48, 0.44, 0.39]), placeAt(x, F(x, z) + r * 0.15, z, rng() * 6), S.ctx.world.caveMat, { cast: false });
  }
}

// z of the channel's centre at x (2.2 m south of the river's line)
export function channelZ(x) {
  const P = RIVER.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    if (x <= bx || i === P.length - 2) {
      const t = Math.max(0, Math.min(1, (x - ax) / (bx - ax)));
      const len = Math.hypot(bx - ax, bz - az);
      return az + (bz - az) * t + 2.2 * ((bx - ax) / len);
    }
  }
  return P[P.length - 1][1];
}

function channelFloor(K, x, z) {
  let lo = Infinity;
  for (let dz = -1.5; dz <= 1.5; dz += 0.5) lo = Math.min(lo, K.F(x, z + dz));
  return lo;
}

// A survey flood on a tripod, cable coiled at its feet.
function tripodLight(S, K, x, z, target, color, intensity, range) {
  const { B, M } = S;
  const y = K.F(x, z);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.02, 0.025, 1.9, 5);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32));
    m.setPosition(x + Math.cos(a) * 0.3, y + 0.9, z + Math.sin(a) * 0.3);
    B.mesh(g, m, M.black, { cast: false });
  }
  const dir = new THREE.Vector3(target[0] - x, target[1] - (y + 1.9), target[2] - z).normalize();
  B.box(x, y + 1.8, z, 0.42, 0.32, 0.3, { mat: S.X.paintYellow, rot: Math.atan2(dir.x, dir.z), collide: false });
  B.bakedLamp(x + dir.x * 0.2, y + 1.95 + dir.y * 0.2, z + dir.z * 0.2, {
    color, intensity, range, circuit: 'reactor', glow: 0.7, rot: Math.atan2(dir.x, dir.z), tilt: -Math.asin(dir.y),
    fitting: new THREE.BoxGeometry(0.34, 0.24, 0.04), bright: 5, spot: { dir, angle: 0.75, penumbra: 0.5 },
  });
  B.physics.addCylinder({ x, z, r: 0.35, y0: y, y1: y + 2.0, walkable: false, material: 'metal' });
  K.reserve(x, z, 1.2);
}

// A cable snaking along the floor beside a walkway.
function cableOnFloor(S, K, pts, off) {
  const { B } = S;
  const sm = K.samples(pts, 1.0);
  for (let i = 0; i < sm.length - 1; i++) {
    const [x, z, tx, tz] = sm[i];
    const [x2, z2] = sm[i + 1];
    const wob = 0.15 * Math.sin(i * 1.7);
    const a = new THREE.Vector3(x - tz * (off + wob), K.F(x, z) + 0.06, z + tx * (off + wob));
    const b = new THREE.Vector3(x2 - tz * (off + 0.15 * Math.sin((i + 1) * 1.7)), K.F(x2, z2) + 0.06, z2 + tx * (off + 0.15 * Math.sin((i + 1) * 1.7)));
    const len = a.distanceTo(b);
    if (len < 0.05) continue;
    const g = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    B.mesh(g, m, S.X.cable, { cast: false });
  }
}

// A lamp pole with a flood head aimed at a point.
function pole(S, K, x, z, target) {
  const { B, M } = S;
  const y = K.F(x, z);
  B.cylinder(x, y - 0.2, z, 0.07, 3.9, { mat: M.steelDark, seg: 8, walkable: false });
  const dir = new THREE.Vector3(target[0] - x, target[1] - (y + 3.6), target[2] - z).normalize();
  B.box(x, y + 3.45, z, 0.5, 0.25, 0.36, { mat: M.black, rot: Math.atan2(dir.x, dir.z), collide: false });
  B.bakedLamp(x + dir.x * 0.25, y + 3.5 + dir.y * 0.25, z + dir.z * 0.25, {
    color: 0xffc890, intensity: 70, range: 18, circuit: 'reactor', glow: 0.9, rot: Math.atan2(dir.x, dir.z), tilt: -Math.asin(dir.y),
    fitting: new THREE.BoxGeometry(0.42, 0.04, 0.3), bright: 5, spot: { dir, angle: 1.0, penumbra: 0.5 },
  });
}
