import * as THREE from 'three';
import { STATION } from './layout.js';
import { STYLE_ID, qseed } from './facade.js';
import { sol } from './solid.js';
import { rng } from './geo.js';
import { rubblePile } from './props.js';

// The old station the payload drives through: in off Adams Street by the west portal, down the
// long concourse under its steel-and-glass shed, through the colonnade into the Great Hall with
// its skylight vault, and out of the east wall the blast tore open onto the crater's rim.
// Walls carry the facade shader (limestone, tall station windows on a big grid); roofs, columns
// and trim are solid; the skylight glass is its own mesh that casts no shadow, so the sun comes
// through it and only the steel ribs stripe the floors.

const UP = [0, 1, 0], DOWN = [0, -1, 0];
const STONE = 0xc9c3b4, STEEL = 0x2b3330, MARBLE = 0xdcd6cb, GLASS = 0x9aa7a8;

const C = STATION.concourse, Hh = STATION.hall;
// the concourse roof spans from the west wall to the hall's colonnade (and the office block's wall
// north of it): eaves at C.roof, ridge over the middle
const RX1 = Hh.x0, RIDGE = C.roof + 2.5, CX = (C.x0 + RX1) / 2;
const SPAN = Hh.x1 - Hh.x0, RISE = Hh.crown - Hh.spring;
const VR = (SPAN * SPAN / 4 + RISE * RISE) / (2 * RISE), VCX = (Hh.x0 + Hh.x1) / 2, VCY = Hh.crown - VR;
/** the vault's height at x */
export const vaultY = (x) => VCY + Math.sqrt(Math.max(0, VR * VR - (x - VCX) ** 2));
// broken glass: bays of the concourse roof with their glass gone, rips in the vault [x0, x1, z0, z1]
const RIB = 6, RIB0 = C.z0;
const ROOF_HOLES = [[-29.6, -17.6], [0.4, 6.4], [24.4, 36.4]];
const VAULT_HOLES = [[-36, Hh.x1, 37, 57], [-52, -45, 23.6, 31.5]];
const inRoofHole = (z0, z1) => ROOF_HOLES.some(([a, b]) => z0 >= a - 0.01 && z1 <= b + 0.01);
const inVaultHole = (x0, x1, z0, z1) => VAULT_HOLES.some(([a, b, c, d]) => x0 >= a - 0.01 && x1 <= b + 0.01 && z0 >= c - 0.01 && z1 <= d + 0.01);

// ---------------------------------------------------------------- wall helpers
/** quad in the plane x = X (z0..z1, y0..y1) facing nx; uv = (z, y) on both faces so window grids line up */
function qx(gb, X, z0, z1, y0, y1, nx) { if (z1 - z0 > 0.005 && y1 - y0 > 0.005) gb.face([nx, 0, 0], [X, y0, z0], [X, y0, z1], [X, y1, z1], [X, y1, z0], [z0, y0], [z1, y0], [z1, y1], [z0, y1]); }
/** quad in the plane z = Z (x0..x1, y0..y1) facing nz; uv = (x, y) */
function qz(gb, Z, x0, x1, y0, y1, nz) { if (x1 - x0 > 0.005 && y1 - y0 > 0.005) gb.face([0, 0, nz], [x0, y0, Z], [x1, y0, Z], [x1, y1, Z], [x0, y1, Z], [x0, y0], [x1, y0], [x1, y1], [x0, y1]); }
/** a wall face in x = X with openings from the floor: [{ a, b, top }] (top: a height or a function of z) */
function holeyX(gb, X, z0, z1, y0, y1, nx, ops, step = 0.35) {
  let z = z0;
  for (const o of ops) {
    if (o.a > z) qx(gb, X, z, o.a, y0, y1, nx);
    if (typeof o.top === 'number') qx(gb, X, o.a, o.b, o.top, y1, nx);
    else {
      const n = Math.max(1, Math.ceil((o.b - o.a) / step));
      for (let i = 0; i < n; i++) {
        const za = o.a + (o.b - o.a) * i / n, zb = o.a + (o.b - o.a) * (i + 1) / n, ya = o.top(za), yb = o.top(zb);
        gb.face([nx, 0, 0], [X, ya, za], [X, yb, zb], [X, y1, zb], [X, y1, za], [za, ya], [zb, yb], [zb, y1], [za, y1]);
      }
    }
    z = o.b;
  }
  if (z < z1) qx(gb, X, z, z1, y0, y1, nx);
}
/** the faces through a wall's thickness (X0..X1) around an opening: jambs and the soffit */
function reveal(gb, X0, X1, o, zc, yc, step = 0.35) {
  if (typeof o.top === 'number') {
    qz(gb, o.a, X0, X1, 0, o.top, 1); qz(gb, o.b, X0, X1, 0, o.top, -1);
    gb.face(DOWN, [X0, o.top, o.a], [X1, o.top, o.a], [X1, o.top, o.b], [X0, o.top, o.b], [o.a, X0], [o.a, X1], [o.b, X1], [o.b, X0]);
    return;
  }
  qz(gb, o.a, X0, X1, 0, o.top(o.a), 1); qz(gb, o.b, X0, X1, 0, o.top(o.b), -1);
  const n = Math.max(1, Math.ceil((o.b - o.a) / step));
  for (let i = 0; i < n; i++) {
    const za = o.a + (o.b - o.a) * i / n, zb = o.a + (o.b - o.a) * (i + 1) / n, ya = o.top(za), yb = o.top(zb);
    const zm = (za + zb) / 2, ym = (ya + yb) / 2;
    gb.face([0, yc - ym, zc - zm], [X0, ya, za], [X1, ya, za], [X1, yb, zb], [X0, yb, zb], [za, ya], [za + (X1 - X0), ya], [zb + (X1 - X0), yb], [zb, yb]);
  }
}
/** arched opening: straight jambs to `spring`, then a half circle */
const arch = (a, b, spring) => { const zc = (a + b) / 2, r = (b - a) / 2; return (z) => spring + Math.sqrt(Math.max(0, r * r - (z - zc) ** 2)); };
/** the facade shader's stone with a station-sized window grid */
const stoneFac = (gb, seed, dmg, fh, bw) => { gb.curFac = [STYLE_ID.stone + Math.min(1, dmg) * 0.9, qseed(seed), fh, bw]; };

// ---------------------------------------------------------------- the station
/**
 * gbF: facade-material builder, gbS: solid builder, gbG: solid builder for glass (no shadows);
 * boxes: colliders [x0, y0, z0, x1, y1, z1]; out.shafts: holes the sun shines through
 */
export function buildStation(gbF, gbS, gbG, boxes, out, ty = () => 0) {
  const R = rng(4242);
  out.shafts = out.shafts || [];
  westWall(gbF, gbS, boxes);
  endWalls(gbF, gbS, boxes);
  hallEast(gbF, gbS, boxes, R);
  colonnade(gbF, gbS, boxes);
  concourseRoof(gbS, gbG, boxes, out);
  vault(gbS, gbG, boxes, out);
  interiorTrim(gbS);
  breachRubble(gbS, boxes, R, ty);
}

function westWall(gbF, gbS, boxes) {
  const X0 = STATION.box[0], X1 = C.x0, Z0 = STATION.box[1], Z1 = STATION.box[3], TOP = C.roof + 1.2;
  const p = STATION.portal, spring = p.h - (p.z1 - p.z0) / 2;
  const ops = [
    { a: p.z0, b: p.z1, top: arch(p.z0, p.z1, spring) },
    ...STATION.doors.map(([a, b]) => ({ a, b, top: 5.2 })),
  ].sort((u, v) => u.a - v.a);
  stoneFac(gbF, 0.37, 0.3, 7.5, 4.5);
  holeyX(gbF, X0, Z0, Z1, 0, TOP, -1, ops);
  holeyX(gbF, X1, C.z0, C.z1, 0, TOP, 1, ops);
  sol(gbS, STONE, { pat: 'ashlar', grime: 0.5 });
  for (const o of ops) reveal(gbS, X0, X1, o, (o.a + o.b) / 2, 0);
  gbS.box(X0, TOP, Z0, X1, TOP + 0.25, Z1, 'xXY');
  // cornice and base course on the street side
  gbS.box(X0 - 0.45, C.roof - 0.9, Z0, X0, C.roof - 0.3, Z1, 'xyY');
  gbS.box(X0 - 0.3, TOP - 0.1, Z0, X0, TOP + 0.35, Z1, 'xyY');
  // the portal: pilasters, an archivolt, a keystone, and the arch's frame on the inside
  const zc = (p.z0 + p.z1) / 2, r = (p.z1 - p.z0) / 2;
  sol(gbS, 0xd3cdbf, { pat: 'ashlar', grime: 0.45 });
  for (const [a, b] of [[p.z0 - 1.3, p.z0], [p.z1, p.z1 + 1.3]]) gbS.box(X0 - 0.45, 0, a, X0, p.h + 1.6, b, 'xzZY');
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
    const pt = (a, rr) => [zc - Math.cos(a) * rr, spring + Math.sin(a) * rr];
    const [za, ya] = pt(a0, r), [zb, yb] = pt(a1, r), [zc0, yc0] = pt(a0, r + 0.8), [zc1, yc1] = pt(a1, r + 0.8);
    gbS.face([-1, 0, 0], [X0 - 0.4, ya, za], [X0 - 0.4, yb, zb], [X0 - 0.4, yc1, zc1], [X0 - 0.4, yc0, zc0]);
    gbS.face([0, spring - ya, zc - za], [X0 - 0.4, ya, za], [X0, ya, za], [X0, yb, zb], [X0 - 0.4, yb, zb]);
    gbS.face([0, yc0 - spring, zc0 - zc], [X0 - 0.4, yc0, zc0], [X0, yc0, zc0], [X0, yc1, zc1], [X0 - 0.4, yc1, zc1]);
  }
  gbS.box(X0 - 0.6, p.h - 0.2, zc - 0.55, X0, p.h + 1.2, zc + 0.55);
  // colliders: the wall around its openings (the arch's haunches as two blocks)
  let z = Z0;
  for (const o of ops) { boxes.push([X0, 0, z, X1, TOP, o.a]); z = o.b; }
  boxes.push([X0, 0, z, X1, TOP, Z1]);
  for (const o of ops) {
    if (typeof o.top === 'number') boxes.push([X0, o.top, o.a, X1, TOP, o.b]);
    else { boxes.push([X0, p.h, o.a, X1, TOP, o.b]); boxes.push([X0, spring + 1, o.a, X1, p.h, o.a + 1.3], [X0, spring + 1, o.b - 1.3, X1, p.h, o.b]); }
  }
  boxes.push([X0 - 0.45, 0, p.z0 - 1.3, X0, p.h + 1.6, p.z0], [X0 - 0.45, 0, p.z1, X0, p.h + 1.6, p.z1 + 1.3]);
}

function endWalls(gbF, gbS, boxes) {
  const [X0, Z0, X1, Z1] = STATION.box;
  sol(gbS, STONE, { pat: 'ashlar', grime: 0.45 });
  // north end of the concourse (a party wall against the building behind), with its gable
  qz(gbS, C.z0, C.x0, RX1, 0, C.roof, 1);
  gbS.tri([C.x0, C.roof, C.z0], [RX1, C.roof, C.z0], [CX, RIDGE, C.z0], [C.x0, C.roof], [RX1, C.roof], [CX, RIDGE], [0, 0, 1]);
  // south end: the concourse's wall and gable, the hall's wall up to the spring
  qz(gbS, C.z1, C.x0, C.x1, 0, C.roof, -1);
  gbS.tri([RX1, C.roof, C.z1], [C.x0, C.roof, C.z1], [CX, RIDGE, C.z1], [RX1, C.roof], [C.x0, C.roof], [CX, RIDGE], [0, 0, -1]);
  qz(gbS, C.z1, C.x1, Hh.x0, 0, Hh.spring, -1);
  qz(gbS, Hh.z1, Hh.x0, Hh.x1, 0, Hh.spring, -1);
  // dado and a cornice line round the hall
  sol(gbS, 0x8d7b62, { pat: 'marble', rough: 0.35, grime: 0.3 });
  gbS.box(Hh.x0, 0, Hh.z1 - 0.12, Hh.x1, 1.4, Hh.z1, 'zY');
  gbS.box(C.x0, 0, C.z1 - 0.12, C.x1, 1.4, C.z1, 'zY');
  sol(gbS, 0xd3cdbf, { pat: 'ashlar', grime: 0.35 });
  gbS.box(Hh.x0, Hh.spring - 0.9, Hh.z1 - 0.55, Hh.x1, Hh.spring, Hh.z1, 'zyY');
  // the lunette under the vault's south end: a thermal window, glowing
  sol(gbS, GLASS, { pat: 'skylight', rough: 0.2, grime: 0.2 });
  const N = 24;
  for (let i = 0; i < N; i++) {
    const xa = Hh.x0 + SPAN * i / N, xb = Hh.x0 + SPAN * (i + 1) / N;
    gbS.face([0, 0, -1], [xa, Hh.spring, Hh.z1 - 0.3], [xb, Hh.spring, Hh.z1 - 0.3], [xb, vaultY(xb), Hh.z1 - 0.3], [xa, vaultY(xa), Hh.z1 - 0.3], [xa, Hh.spring], [xb, Hh.spring], [xb, vaultY(xb)], [xa, vaultY(xa)]);
  }
  // mullions over it
  sol(gbS, STEEL, { pat: 'steel', rough: 0.6, metal: 0.5, grime: 0.4 });
  for (let x = Hh.x0 + 2.7; x < Hh.x1 - 1; x += 2.7) gbS.box(x - 0.12, Hh.spring, Hh.z1 - 0.5, x + 0.12, vaultY(x), Hh.z1 - 0.3, 'xXz');
  for (const y of [Hh.spring + 2.4, Hh.spring + 4.8]) {
    const hw = Math.sqrt(Math.max(0, VR * VR - (y - VCY) ** 2));
    gbS.box(VCX - hw, y - 0.12, Hh.z1 - 0.5, VCX + hw, y + 0.12, Hh.z1 - 0.3, 'yYz');
  }
  // the outside: the hall's end wall is hidden against its neighbours, the top is a stone coping
  sol(gbS, STONE, { pat: 'ashlar', grime: 0.6 });
  gbS.box(Hh.x0, Hh.crown + 0.6, Hh.z1, Hh.x1 + 1, Hh.crown + 0.6, Z1, 'Y');
  for (let i = 0; i < N; i++) {
    const xa = Hh.x0 + SPAN * i / N, xb = Hh.x0 + SPAN * (i + 1) / N;
    gbS.face([0, 0, -1], [xa, vaultY(xa), Hh.z1], [xb, vaultY(xb), Hh.z1], [xb, Hh.crown + 0.6, Hh.z1], [xa, Hh.crown + 0.6, Hh.z1], [xa, vaultY(xa)], [xb, vaultY(xb)], [xb, Hh.crown + 0.6], [xa, Hh.crown + 0.6]);
  }
  qx(gbS, Hh.x0, Hh.z1, Z1, Hh.spring, Hh.crown + 0.6, -1); qx(gbS, Hh.x1 + 1, Hh.z1, Z1, Hh.spring + 1.6, Hh.crown + 0.6, 1);
  boxes.push([X0, 0, Z0, C.x1 + 1, RIDGE, C.z0]); // north party wall
  boxes.push([X0, 0, C.z1, X1, Hh.spring, Z1]); // south wall
  boxes.push([Hh.x0, Hh.spring, Hh.z1 - 0.3, Hh.x1, Hh.crown + 0.6, Z1]); // the lunette and the wall above it
}

/** the hall's east wall, blown open by the blast that made the crater */
function hallEast(gbF, gbS, boxes, R) {
  const X0 = Hh.x1, X1 = STATION.box[2], Z0 = Hh.z0, Z1 = STATION.box[3], TOP = Hh.spring + 1.6;
  const br = STATION.breach, zc = (br.z0 + br.z1) / 2, hw = (br.z1 - br.z0) / 2;
  const jag = [];
  for (let i = 0; i <= 40; i++) jag.push((R() - 0.5) * 1.6);
  const top = (z) => {
    const u = (z - zc) / hw;
    if (Math.abs(u) >= 1) return 0;
    const k = Math.min(40, Math.max(0, (u * 0.5 + 0.5) * 40)), i = Math.floor(k), f = k - i;
    const j = jag[i] * (1 - f) + jag[Math.min(40, i + 1)] * f;
    return Math.max(0, br.h * Math.pow(1 - u ** 8, 0.3) + j * (1 - u * u));
  };
  const ops = [{ a: br.z0, b: br.z1, top }];
  stoneFac(gbF, 0.61, 0.5, 10, 4.6);
  holeyX(gbF, X1, Z0, Z1, 0, TOP, 1, ops, 0.5);
  holeyX(gbF, X0, Z0, Hh.z1, 0, TOP, -1, ops, 0.5);
  // the broken edge shows rubble-filled masonry
  sol(gbS, 0x9a8e7a, { pat: 'rubble', grime: 0.6 });
  reveal(gbS, X0, X1, ops[0], zc, 0, 0.5);
  sol(gbS, STONE, { pat: 'ashlar', grime: 0.55 });
  gbS.box(X0, TOP, Z0, X1, TOP + 0.25, Z1, 'XY');
  gbS.box(X1, TOP - 0.1, Z0, X1 + 0.35, TOP + 0.4, Z1, 'XyYzZ');
  gbS.box(X1, Hh.spring - 5.2, Z0, X1 + 0.4, Hh.spring - 4.6, br.z0 - 1.5, 'XyYzZ');
  gbS.box(X1, Hh.spring - 5.2, br.z1 + 1.5, X1 + 0.4, Hh.spring - 4.6, Z1, 'XyYzZ');
  // the hall side: dado, cornice
  sol(gbS, 0x8d7b62, { pat: 'marble', rough: 0.35, grime: 0.3 });
  gbS.box(X0 - 0.12, 0, Z0, X0, 1.4, br.z0, 'xY'); gbS.box(X0 - 0.12, 0, br.z1, X0, 1.4, Hh.z1, 'xY');
  sol(gbS, 0xd3cdbf, { pat: 'ashlar', grime: 0.35 });
  gbS.box(X0 - 0.55, Hh.spring - 0.9, Z0, X0, Hh.spring, Hh.z1, 'xyY');
  // colliders: the wall either side, and over the breach in 1 m columns down to its ragged edge
  boxes.push([X0, 0, Z0, X1, TOP, br.z0], [X0, 0, br.z1, X1, TOP, Z1]);
  for (let z = br.z0; z < br.z1 - 0.01; z += 1) {
    const y = Math.min(top(z), top(Math.min(br.z1, z + 1)), top(z + 0.5));
    boxes.push([X0, Math.max(0, y), z, X1, TOP, Math.min(br.z1, z + 1)]);
  }
}

function colonnade(gbF, gbS, boxes) {
  const X = Hh.x0 - 0.5, ent0 = 12.6, ent1 = C.roof;
  sol(gbS, MARBLE, { pat: 'marble', rough: 0.4, grime: 0.35 });
  for (const z of STATION.columns) {
    gbS.box(X - 1.15, 0, z - 1.15, X + 1.15, 0.9, z + 1.15, 'xXzZY');
    gbS.cyl(X, z, 1.02, 1.0, 0.9, 1.35, 20, false);
    gbS.cyl(X, z, 0.86, 0.8, 1.35, 11.2, 20, false);
    gbS.cyl(X, z, 0.8, 1.12, 11.2, 12.05, 20, false);
    gbS.box(X - 1.25, 12.05, z - 1.25, X + 1.25, ent0, z + 1.25, 'xXzZy');
    boxes.push([X - 1.15, 0, z - 1.15, X + 1.15, ent0, z + 1.15]);
  }
  // the entablature and, above the concourse roof, the hall's clerestory wall
  sol(gbS, 0xd3cdbf, { pat: 'ashlar', grime: 0.4 });
  gbS.box(X - 1.2, ent0, Hh.z0, X + 1.2, ent1, Hh.z1, 'xXy');
  gbS.box(X - 1.45, ent1 - 0.45, Hh.z0, X + 1.45, ent1, Hh.z1, 'xXy');
  stoneFac(gbF, 0.81, 0.25, 6, 4);
  qx(gbF, C.x1, Hh.z0, Hh.z1, ent1, Hh.spring + 1.6, -1);
  sol(gbS, STONE, { pat: 'ashlar', grime: 0.4 });
  qx(gbS, Hh.x0, Hh.z0, Hh.z1, ent1, Hh.spring, 1);
  gbS.box(C.x1, Hh.spring + 1.6, Hh.z0, Hh.x0, Hh.spring + 1.85, Hh.z1, 'xY');
  sol(gbS, 0xd3cdbf, { pat: 'ashlar', grime: 0.35 });
  gbS.box(Hh.x0, Hh.spring - 0.9, Hh.z0, Hh.x0 + 0.55, Hh.spring, Hh.z1, 'Xy');
  boxes.push([X - 1.2, ent0, Hh.z0, X + 1.2, Hh.spring + 1.85, Hh.z1]);
}

function concourseRoof(gbS, gbG, boxes, out) {
  const y0 = C.roof, x0 = STATION.box[0], x1 = RX1;
  // glass, bay by bay, two slopes; broken bays have none
  sol(gbG, GLASS, { pat: 'skylight', rough: 0.25, grime: 0.3 });
  const zs = [];
  for (let z = RIB0; z < C.z1 - 0.01; z += RIB) zs.push([z, Math.min(C.z1, z + RIB)]);
  for (const [za, zb] of zs) {
    if (inRoofHole(za, zb)) continue;
    for (const [xa, xb] of [[C.x0, CX], [CX, RX1]]) {
      const ya = xa === CX ? RIDGE : y0, yb = xb === CX ? RIDGE : y0;
      const n = [-(yb - ya), xb - xa, 0];
      const L = Math.hypot(xb - xa, yb - ya), v0 = xa === CX ? L : 0, v1 = L - v0;
      gbG.face(n, [xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], [za, v0], [za, v1], [zb, v1], [zb, v0]);
      gbG.face([-n[0], -n[1], 0], [xa, ya - 0.05, za], [xb, yb - 0.05, za], [xb, yb - 0.05, zb], [xa, ya - 0.05, zb], [za, v0], [za, v1], [zb, v1], [zb, v0]);
    }
  }
  for (const [a, b] of ROOF_HOLES) out.shafts.push({ x0: C.x0 + 0.5, x1: RX1 - 0.5, z0: a, z1: b, y: y0 + 1 });
  // ribs: an arched truss every bay (rafters, a tie, hangers), purlins and the ridge, gutters
  sol(gbS, STEEL, { pat: 'steel', rough: 0.55, metal: 0.55, grime: 0.5 });
  const slopeL = (x) => y0 + (RIDGE - y0) * (x - C.x0) / (CX - C.x0), slopeR = (x) => y0 + (RIDGE - y0) * (RX1 - x) / (RX1 - CX);
  const beam = (a, b, w, d) => { // a square beam from a to b (points), w wide, d deep
    const m = new THREE.Matrix4(), dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    m.lookAt(new THREE.Vector3(), dir, Math.abs(dir.y) > 0.99 * len ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    gbS.boxM(m, w, d, len);
  };
  for (let z = RIB0; z <= C.z1 + 0.01; z += RIB) {
    const bent = ROOF_HOLES.some(([a, b]) => z > a + 0.1 && z < b - 0.1);
    const sag = bent ? 1.4 : 0;
    beam([C.x0, y0 - 0.35, z], [CX, RIDGE - 0.35 - sag, z], 0.28, 0.55);
    beam([CX, RIDGE - 0.35 - sag, z], [RX1, y0 - 0.35, z], 0.28, 0.55);
    if (!bent) beam([C.x0, y0 - 1.1, z], [RX1, y0 - 1.1, z], 0.1, 0.1);
    for (const x of [C.x0 + 3, RX1 - 3]) beam([x, y0 - 1.1, z], [x, (x < CX ? slopeL(x) : slopeR(x)) - 0.6 - (bent ? sag * 0.5 : 0), z], 0.1, 0.1);
    beam([CX, y0 - 1.1, z], [CX, RIDGE - 0.6 - sag, z], 0.1, 0.1);
  }
  for (const x of [C.x0 + 3, CX, RX1 - 3]) {
    const y = (x === CX ? RIDGE : x < CX ? slopeL(x) : slopeR(x)) - 0.25;
    let z = RIB0;
    for (const [a, b] of ROOF_HOLES) { beam([x, y, z], [x, y, a], 0.22, 0.3); z = b; }
    beam([x, y, z], [x, y, C.z1], 0.22, 0.3);
  }
  gbS.box(C.x0 - 0.1, y0 - 0.5, C.z0, C.x0 + 0.5, y0, C.z1, 'xXyY');
  gbS.box(RX1 - 0.5, y0 - 0.5, C.z0, RX1, y0, Hh.z0, 'xXyY');
  // hanging lamps down the middle
  for (let z = RIB0 + RIB / 2; z < C.z1; z += RIB * 2) {
    if (ROOF_HOLES.some(([a, b]) => z > a && z < b)) continue;
    sol(gbS, STEEL, { pat: 'plain', rough: 0.5, metal: 0.6, grime: 0.3 });
    gbS.box(CX - 0.03, y0 - 5, z - 0.03, CX + 0.03, RIDGE - 0.6, z + 0.03, 'xXzZ');
    gbS.cyl(CX, z, 0.9, 0.15, y0 - 5.6, y0 - 5, 12, true);
    sol(gbS, 0xffd9a0, { pat: 'lamp', rough: 0.4, emit: 1.1, grime: 0 });
    gbS.cyl(CX, z, 0.45, 0.3, y0 - 5.9, y0 - 5.6, 10, true);
  }
  // colliders: each slope as three steps, bay by bay
  for (const [za, zb] of zs) {
    if (inRoofHole(za, zb)) continue;
    const st = [[x0, C.x0 + 2], [C.x0 + 2, C.x0 + 4], [C.x0 + 4, CX], [CX, RX1 - 4], [RX1 - 4, RX1 - 2], [RX1 - 2, x1]];
    for (const [a, b] of st) {
      const ym = (a + b) / 2 < CX ? slopeL(Math.min(b, CX)) : slopeR(Math.max(a, CX));
      boxes.push([a, y0, za, b, Math.max(y0 + 0.4, ym), zb]);
    }
  }
}

function vault(gbS, gbG, boxes, out) {
  const N = 24, zs = [];
  const nb = 12, bay = (Hh.z1 - Hh.z0) / nb;
  for (let i = 0; i < nb; i++) zs.push([Hh.z0 + i * bay, Hh.z0 + (i + 1) * bay]);
  const xs = [];
  for (let i = 0; i < N; i++) xs.push([Hh.x0 + SPAN * i / N, Hh.x0 + SPAN * (i + 1) / N]);
  // glass: outer and inner faces, rips left open
  sol(gbG, GLASS, { pat: 'skylight', rough: 0.25, grime: 0.35 });
  for (const [za, zb] of zs) for (const [xa, xb] of xs) {
    if (inVaultHole(xa, xb, za, zb) || VAULT_HOLES.some(([a, b, c, d]) => xa >= a - 0.01 && xb <= b + 0.01 && za < d && zb > c && (za < c || zb > d) && (Math.min(zb, d) - Math.max(za, c)) > bay * 0.5)) continue;
    const ya = vaultY(xa), yb = vaultY(xb), mx = (xa + xb) / 2;
    const n = [mx - VCX, vaultY(mx) - VCY, 0];
    const s0 = VR * Math.atan2(xa - VCX, ya - VCY), s1 = VR * Math.atan2(xb - VCX, yb - VCY);
    gbG.face(n, [xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], [s0, za], [s1, za], [s1, zb], [s0, zb]);
    gbG.face([-n[0], -n[1], 0], [xa, ya - 0.06, za], [xb, yb - 0.06, za], [xb, yb - 0.06, zb], [xa, ya - 0.06, zb], [s0, za], [s1, za], [s1, zb], [s0, zb]);
  }
  for (const [a, b, c, d] of VAULT_HOLES) out.shafts.push({ x0: a + 0.5, x1: b - 0.5, z0: c, z1: d, y: vaultY((a + b) / 2) + 1 });
  // ribs: transverse arches at every bay line, longitudinal ribs every few segments
  sol(gbS, STEEL, { pat: 'steel', rough: 0.5, metal: 0.55, grime: 0.45 });
  for (let i = 0; i <= nb; i++) {
    const z = Hh.z0 + i * bay;
    for (const [xa, xb] of xs) {
      const ya = vaultY(xa), yb = vaultY(xb);
      const ia = [VCX + (xa - VCX) * (VR - 0.8) / VR, VCY + (ya - VCY) * (VR - 0.8) / VR], ib = [VCX + (xb - VCX) * (VR - 0.8) / VR, VCY + (yb - VCY) * (VR - 0.8) / VR];
      const z0 = z - 0.18, z1 = z + 0.18;
      gbS.face([0, -1, 0], [ia[0], ia[1], z0], [ib[0], ib[1], z0], [ib[0], ib[1], z1], [ia[0], ia[1], z1]);
      for (const [zz, nz] of [[z0, -1], [z1, 1]]) gbS.face([0, 0, nz], [xa, ya, zz], [xb, yb, zz], [ib[0], ib[1], zz], [ia[0], ia[1], zz]);
      gbS.face([xa + xb - 2 * VCX, ya + yb - 2 * VCY, 0], [xa, ya + 0.08, z0], [xb, yb + 0.08, z0], [xb, yb + 0.08, z1], [xa, ya + 0.08, z1]);
    }
  }
  for (let k = 3; k < N; k += 4) {
    const x = Hh.x0 + SPAN * k / N, y = vaultY(x);
    let z = Hh.z0;
    const cuts = VAULT_HOLES.filter(([a, b]) => x > a && x < b).map(([, , c, d]) => [c, d]).sort((u, v) => u[0] - v[0]);
    const seg = (z0, z1) => { const ux = (x - VCX) / VR, uy = (y - VCY) / VR; gbS.box(x - 0.15 - ux * 0.25, y - 0.45 - uy * 0.2, z0, x + 0.15 - ux * 0.25, y - uy * 0.2 + 0.05, z1, 'xXy'); };
    for (const [c, d] of cuts) { seg(z, c); z = d; }
    seg(z, Hh.z1);
  }
  // springing beams
  gbS.box(Hh.x0, Hh.spring - 0.2, Hh.z0, Hh.x0 + 0.8, Hh.spring + 0.35, Hh.z1, 'xXyY');
  gbS.box(Hh.x1 - 0.8, Hh.spring - 0.2, Hh.z0, Hh.x1, Hh.spring + 0.35, Hh.z1, 'xXyY');
  // colliders: the arc as nine slabs, bay by bay, open where the glass is gone
  const K = 12;
  for (let k = 0; k < K; k++) {
    const xa = Hh.x0 + SPAN * k / K, xb = Hh.x0 + SPAN * (k + 1) / K;
    const ylo = Math.min(vaultY(xa), vaultY(xb)), yhi = Math.max(vaultY(xa), vaultY(xb));
    for (const [za, zb] of zs) {
      if (VAULT_HOLES.some(([a, b, c, d]) => (xa + xb) / 2 > a && (xa + xb) / 2 < b && (za + zb) / 2 > c && (za + zb) / 2 < d)) continue;
      boxes.push([xa, ylo - 0.3, za, xb, yhi + 0.15, zb]);
    }
  }
}

/** inside: marble dado and pilasters down the concourse, the floor's brass inlay strips */
function interiorTrim(gbS) {
  sol(gbS, 0x8d7b62, { pat: 'marble', rough: 0.35, grime: 0.3 });
  const p = STATION.portal;
  const breaks = [[p.z0, p.z1], ...STATION.doors].sort((a, b) => a[0] - b[0]);
  let z = C.z0;
  for (const [a, b] of breaks) { gbS.box(C.x0, 0, z, C.x0 + 0.12, 1.4, a, 'XY'); z = b; }
  gbS.box(C.x0, 0, z, C.x0 + 0.12, 1.4, C.z1, 'XY');
  gbS.box(C.x0, 0, C.z0, C.x1, 1.4, C.z0 + 0.12, 'ZY');
  sol(gbS, 0xcfc8b8, { pat: 'ashlar', grime: 0.4 });
  for (let zz = C.z0 + RIB; zz < C.z1 - 1; zz += RIB) {
    if (breaks.some(([a, b]) => zz > a - 1 && zz < b + 1)) continue;
    gbS.box(C.x0, 0, zz - 0.6, C.x0 + 0.45, C.roof - 0.5, zz + 0.6, 'XzZ');
  }
}

/** the blown-out masonry heaped either side of the breach, the cart's way through left clear */
function breachRubble(gbS, boxes, R, ty) {
  const br = STATION.breach, x = Hh.x1 + 0.5;
  const piles = [[x + 2.5, br.z0 + 2.2, 4.5, 2.6, 2.4], [x + 2, br.z1 - 2, 4, 2.4, 2.1], [x - 3, br.z0 + 1.5, 3, 1.6, 1.3], [x + 7, br.z1 + 1, 3.5, 2.5, 1.2], [x - 2.5, br.z1 - 1.2, 2.6, 1.4, 1]];
  for (const [cx, cz, rx, rz, h] of piles) rubblePile(gbS, boxes, cx, cz, rx, rz, h, R, 0x9a8e7a, cx < Hh.x1 ? 0 : ty(cx, cz));
}

/** the departures board on the concourse's north wall (dead flaps, a few rows still lit) */
export function departuresBoard() {
  const W = 1024, H = 420;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1a1a1c'; for (let y = 0; y < H; y += 46) g.fillRect(0, y, W, 2);
  g.font = 'bold 52px monospace'; g.fillStyle = '#ffb02e'; g.fillText('DEPARTURES', 28, 62);
  g.font = 'bold 30px monospace';
  const rows = [['14:05', 'MILWAUKEE', '12', 'CANCELLED'], ['14:12', 'AURORA', '4', 'CANCELLED'], ['14:20', 'ST. LOUIS', '9', 'CANCELLED'], ['14:31', 'DETROIT', '16', 'CANCELLED'], ['14:45', 'JOLIET', '3', 'CANCELLED'], ['15:02', 'KANSAS CITY', '18', 'CANCELLED'], ['15:10', 'MINNEAPOLIS', '7', 'CANCELLED']];
  rows.forEach(([t, d, tr, st], i) => {
    const y = 120 + i * 44, dead = i === 2 || i === 5;
    g.globalAlpha = dead ? 0.18 : 1;
    g.fillStyle = '#ffb02e'; g.fillText(t, 28, y); g.fillText(d, 170, y); g.fillText(tr, 590, y);
    g.fillStyle = i % 3 === 1 ? '#ff4a2a' : '#ffb02e'; g.fillText(st, 700, y);
    g.globalAlpha = 1;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1.5, 1.5, 1.5), roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9 * H / W), mat);
  m.position.set(CX, 8.6, C.z0 + 0.1);
  // a steel frame behind it
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.5, 9 * H / W + 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x1b1d1e, roughness: 0.5, metalness: 0.6 }));
  frame.position.set(CX, 8.6, C.z0 - 0.06);
  const grp = new THREE.Group(); grp.add(m, frame);
  return grp;
}
