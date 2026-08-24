/* =========================================================================
   MEATLIGHT :: 30-geom.js
   Mesh construction, baked vertex lighting, and the room/doorway builder.

   Rooms are axis-aligned boxes. Every wall is single-sided and faces inward,
   so two rooms sharing a boundary each own their own surface -- no z-fighting
   and each room keeps its own ceiling height and materials.

   Doorways are never authored per-room. They live in one global DOORS table;
   each room asks that table which openings fall on the wall it is currently
   building. A hole therefore cannot exist on one side and not the other.
   ========================================================================= */

var TESS_FLOOR = 2.6, TESS_WALL = 2.2;

function newMesh() {
  return { data: [], texs: [], mats: [], dbl: [], count: 0 };
}
function sealMesh(m) {
  m.data = new Float32Array(m.data);
  return m;
}

/* ------------------------------------------------------------- lighting -- */
var LIGHT_GAIN = 1.75;
var LIGHTS = [];
var AMBIENT = { r: 0.16, g: 0.17, b: 0.19 };

function shade(x, y, z, nx, ny, nz, out) {
  var r = AMBIENT.r, g = AMBIENT.g, b = AMBIENT.b;
  for (var i = 0; i < LIGHTS.length; i++) {
    var L = LIGHTS[i];
    var dx = L.x - x, dy = L.y - y, dz = L.z - z;
    var d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.rad * L.rad) continue;
    var d = Math.sqrt(d2) || 0.0001;
    var att = 1 - d / L.rad;
    att = att * (0.38 + 0.62 * att);
    var ndl = (dx * nx + dy * ny + dz * nz) / d;
    ndl = 0.46 + 0.54 * (ndl > 0 ? ndl : 0);
    var k = att * ndl * L.i * LIGHT_GAIN;
    r += L.r * k; g += L.g * k; b += L.b * k;
  }
  out[0] = r > 2.2 ? 2.2 : r;
  out[1] = g > 2.2 ? 2.2 : g;
  out[2] = b > 2.2 ? 2.2 : b;
}

var _sh = [0, 0, 0];

/* ---------------------------------------------------------------- quads -- */
function _pushTri(m, ax, ay, az, au, av, ar, ag, ab,
                     bx, by, bz, bu, bv, br, bg, bb,
                     cx, cy, cz, cu, cv, cr, cg, cb, tex, mat, dbl) {
  var d = m.data;
  d.push(ax, ay, az, au, av, ar, ag, ab,
         bx, by, bz, bu, bv, br, bg, bb,
         cx, cy, cz, cu, cv, cr, cg, cb);
  m.texs.push(tex); m.mats.push(mat | 0); m.dbl.push(!!dbl); m.count++;
}

/* p0..p3 counter-clockwise as seen from the visible face.
   u runs p0->p1, v runs p0->p3. */
function pushQuad(m, p0, p1, p2, p3, tex, o) {
  o = o || {};
  var scale = o.scale === undefined ? 0.5 : o.scale;
  var mat = o.mat || MAT_OPAQUE, dbl = o.dbl || false;
  var tint = o.tint;

  var eu = sub3(p1, p0), ev = sub3(p3, p0);
  var wlen = len3(eu), hlen = len3(ev);
  var n = norm3(cross3(eu, ev));

  var u1 = o.u1 !== undefined ? o.u1 : wlen * scale;
  var v1 = o.v1 !== undefined ? o.v1 : hlen * scale;
  var u0 = o.u0 || 0, v0 = o.v0 || 0;

  /* subdivide so baked vertex lighting has somewhere to live */
  var tess = o.tess === undefined ? TESS_WALL : o.tess;
  var nu = o.flat ? 1 : Math.max(1, Math.min(20, Math.ceil(wlen / tess)));
  var nv = o.flat ? 1 : Math.max(1, Math.min(20, Math.ceil(hlen / tess)));

  var cols = [], k, j;
  for (j = 0; j <= nv; j++) {
    for (k = 0; k <= nu; k++) {
      var fu = k / nu, fv = j / nv;
      var px = p0.x + eu.x * fu + ev.x * fv;
      var py = p0.y + eu.y * fu + ev.y * fv;
      var pz = p0.z + eu.z * fu + ev.z * fv;
      if (o.unlit) { _sh[0] = 1; _sh[1] = 1; _sh[2] = 1; }
      else shade(px, py, pz, n.x, n.y, n.z, _sh);
      var cr = _sh[0], cg = _sh[1], cb = _sh[2];
      if (tint) { cr *= tint[0]; cg *= tint[1]; cb *= tint[2]; }
      cols.push({ x: px, y: py, z: pz, u: lerp(u0, u1, fu), v: lerp(v0, v1, fv), r: cr, g: cg, b: cb });
    }
  }
  var W = nu + 1;
  for (j = 0; j < nv; j++) {
    for (k = 0; k < nu; k++) {
      var a = cols[j * W + k], b = cols[j * W + k + 1],
          c = cols[(j + 1) * W + k + 1], dd = cols[(j + 1) * W + k];
      _pushTri(m, a.x, a.y, a.z, a.u, a.v, a.r, a.g, a.b,
                  b.x, b.y, b.z, b.u, b.v, b.r, b.g, b.b,
                  c.x, c.y, c.z, c.u, c.v, c.r, c.g, c.b, tex, mat, dbl);
      _pushTri(m, a.x, a.y, a.z, a.u, a.v, a.r, a.g, a.b,
                  c.x, c.y, c.z, c.u, c.v, c.r, c.g, c.b,
                  dd.x, dd.y, dd.z, dd.u, dd.v, dd.r, dd.g, dd.b, tex, mat, dbl);
    }
  }
}

/* ----------------------------------------------------------------- boxes -- */
var BOXFACE = [
  { n: [1, 0, 0],  t: [0, 0, -1], b: [0, 1, 0], key: 'px' },
  { n: [-1, 0, 0], t: [0, 0, 1],  b: [0, 1, 0], key: 'nx' },
  { n: [0, 0, 1],  t: [1, 0, 0],  b: [0, 1, 0], key: 'pz' },
  { n: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0], key: 'nz' },
  { n: [0, 1, 0],  t: [1, 0, 0],  b: [0, 0, -1], key: 'py' },
  { n: [0, -1, 0], t: [1, 0, 0],  b: [0, 0, 1], key: 'ny' }
];

/* cx,cz = centre in plan; y0 = base height; sx,sy,sz = full extents */
function pushBox(m, cx, y0, cz, sx, sy, sz, yaw, tex, o) {
  o = o || {};
  var cy = y0 + sy / 2;
  var cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
  function rot(v) { return { x: v.x * cs + v.z * sn, y: v.y, z: -v.x * sn + v.z * cs }; }
  var half = { x: sx / 2, y: sy / 2, z: sz / 2 };
  var skip = o.skip || {};
  for (var i = 0; i < 6; i++) {
    var F = BOXFACE[i];
    if (skip[F.key]) continue;
    var n = rot(v3(F.n[0], F.n[1], F.n[2]));
    var t = rot(v3(F.t[0], F.t[1], F.t[2]));
    var b = rot(v3(F.b[0], F.b[1], F.b[2]));
    /* face extents along t and b */
    var et = Math.abs(F.t[0]) * sx + Math.abs(F.t[1]) * sy + Math.abs(F.t[2]) * sz;
    var eb = Math.abs(F.b[0]) * sx + Math.abs(F.b[1]) * sy + Math.abs(F.b[2]) * sz;
    var off = rot(v3(F.n[0] * half.x, F.n[1] * half.y, F.n[2] * half.z));
    var cen = v3(cx + off.x, cy + off.y, cz + off.z);
    var p0 = add3(cen, add3(scl3(t, -et / 2), scl3(b, -eb / 2)));
    var p1 = add3(cen, add3(scl3(t, et / 2), scl3(b, -eb / 2)));
    var p2 = add3(cen, add3(scl3(t, et / 2), scl3(b, eb / 2)));
    var p3 = add3(cen, add3(scl3(t, -et / 2), scl3(b, eb / 2)));
    var ftex = (o.faces && o.faces[F.key]) || tex;
    pushQuad(m, p0, p1, p2, p3, ftex, {
      scale: o.scale === undefined ? 0.6 : o.scale, mat: o.mat, tint: o.tint,
      unlit: o.unlit, flat: o.flat === undefined ? true : o.flat, tess: o.tess,
      u1: o.u1, v1: o.v1
    });
  }
}

/* n-gon prism: barrels, cookers, pipes, tanks */
function pushCyl(m, cx, y0, cz, rad, h, sides, tex, o) {
  o = o || {};
  var i, a0, a1, top = o.cap !== false, scale = o.scale === undefined ? 0.5 : o.scale;
  var circ = 2 * Math.PI * rad;
  for (i = 0; i < sides; i++) {
    a0 = (i / sides) * Math.PI * 2; a1 = ((i + 1) / sides) * Math.PI * 2;
    var x0 = cx + Math.cos(a0) * rad, z0 = cz + Math.sin(a0) * rad;
    var x1 = cx + Math.cos(a1) * rad, z1 = cz + Math.sin(a1) * rad;
    pushQuad(m, v3(x1, y0, z1), v3(x0, y0, z0), v3(x0, y0 + h, z0), v3(x1, y0 + h, z1), tex,
      { scale: scale, u0: (i / sides) * circ * scale, u1: ((i + 1) / sides) * circ * scale,
        v0: 0, v1: h * scale, flat: h < 3, tess: 2.0, tint: o.tint, unlit: o.unlit, mat: o.mat });
  }
  if (top) {
    for (i = 0; i < sides; i++) {
      a0 = (i / sides) * Math.PI * 2; a1 = ((i + 1) / sides) * Math.PI * 2;
      var tx0 = cx + Math.cos(a0) * rad, tz0 = cz + Math.sin(a0) * rad;
      var tx1 = cx + Math.cos(a1) * rad, tz1 = cz + Math.sin(a1) * rad;
      _shadeTri(m, v3(cx, y0 + h, cz), v3(tx1, y0 + h, tz1), v3(tx0, y0 + h, tz0),
                v3(0, 1, 0), tex, scale, o);
      if (o.capBottom) {
        _shadeTri(m, v3(cx, y0, cz), v3(tx0, y0, tz0), v3(tx1, y0, tz1), v3(0, -1, 0), tex, scale, o);
      }
    }
  }
}

function _shadeTri(m, a, b, c, n, tex, scale, o) {
  var cols = [];
  var pts = [a, b, c];
  for (var i = 0; i < 3; i++) {
    var p = pts[i];
    if (o && o.unlit) { _sh[0] = 1; _sh[1] = 1; _sh[2] = 1; } else shade(p.x, p.y, p.z, n.x, n.y, n.z, _sh);
    var tint = o && o.tint;
    cols.push({ r: _sh[0] * (tint ? tint[0] : 1), g: _sh[1] * (tint ? tint[1] : 1), b: _sh[2] * (tint ? tint[2] : 1) });
  }
  _pushTri(m, a.x, a.y, a.z, a.x * scale, a.z * scale, cols[0].r, cols[0].g, cols[0].b,
              b.x, b.y, b.z, b.x * scale, b.z * scale, cols[1].r, cols[1].g, cols[1].b,
              c.x, c.y, c.z, c.x * scale, c.z * scale, cols[2].r, cols[2].g, cols[2].b,
              tex, (o && o.mat) || MAT_OPAQUE, false);
}

/* ------------------------------------------------------------ wall sides -- */
/* For a room wall, map a 1-D span coordinate to a world point.
   S: z=z0 span x   N: z=z1 span x   W: x=x0 span z   E: x=x1 span z        */
function wallPoint(R, side, s, y) {
  if (side === 'S') return v3(s, y, R.z0);
  if (side === 'N') return v3(s, y, R.z1);
  if (side === 'W') return v3(R.x0, y, s);
  return v3(R.x1, y, s);
}
/* S and E run forward along the span; N and W must be reversed so the
   quad stays counter-clockwise when viewed from inside the room. */
function wallQuad(m, R, side, s0, s1, y0, y1, tex, o) {
  if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
  var a = s0, b = s1;
  if (side === 'N' || side === 'W') { a = s1; b = s0; }
  pushQuad(m,
    wallPoint(R, side, a, y0), wallPoint(R, side, b, y0),
    wallPoint(R, side, b, y1), wallPoint(R, side, a, y1), tex, o);
}

/* the plane coordinate a given side sits on */
function wallPlane(R, side) {
  return side === 'S' ? R.z0 : side === 'N' ? R.z1 : side === 'W' ? R.x0 : R.x1;
}
function wallAxis(side) { return (side === 'S' || side === 'N') ? 'z' : 'x'; }
function wallRange(R, side) {
  return (side === 'S' || side === 'N') ? [R.x0, R.x1] : [R.z0, R.z1];
}

/* Openings on this wall, from the single shared DOORS table. */
function openingsFor(roomId, R, side) {
  var axis = wallAxis(side), plane = wallPlane(R, side);
  var rng = wallRange(R, side), out = [];
  for (var i = 0; i < DOORS.length; i++) {
    var D = DOORS[i];
    if (D.a !== roomId && D.b !== roomId) continue;
    if (D.axis !== axis) continue;
    if (Math.abs(D.at - plane) > 0.001) continue;
    var s0 = Math.max(D.s0, rng[0]), s1 = Math.min(D.s1, rng[1]);
    if (s1 - s0 < 0.01) continue;
    out.push({ s0: s0, s1: s1, h: D.h, door: D });
  }
  out.sort(function (p, q) { return p.s0 - q.s0; });
  return out;
}

/* Build all four walls of a room, cutting every opening the table declares. */
function buildWalls(m, roomId, R) {
  var sides = ['S', 'N', 'W', 'E'];
  for (var si = 0; si < sides.length; si++) {
    var side = sides[si];
    var rng = wallRange(R, side);
    var tex = (R.wallTex && R.wallTex[side]) || R.wall || TEX.PANEL;
    var ops = openingsFor(roomId, R, side);
    var cursor = rng[0];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.s0 > cursor + 0.001) {
        wallQuad(m, R, side, cursor, op.s0, 0, R.h, tex, { tess: TESS_WALL });
      }
      /* header above the opening */
      if (R.h > op.h + 0.001) {
        wallQuad(m, R, side, op.s0, op.s1, op.h, R.h, tex, { tess: TESS_WALL });
      }
      cursor = Math.max(cursor, op.s1);
    }
    if (rng[1] > cursor + 0.001) {
      wallQuad(m, R, side, cursor, rng[1], 0, R.h, tex, { tess: TESS_WALL });
    }
  }
}

function buildFloorCeil(m, R) {
  var y = R.y0 || 0;
  pushQuad(m, v3(R.x0, y, R.z1), v3(R.x1, y, R.z1), v3(R.x1, y, R.z0), v3(R.x0, y, R.z0),
    R.floor || TEX.CONCRETE, { tess: TESS_FLOOR, scale: R.floorScale || 0.4 });
  if (!R.noCeil) {
    pushQuad(m, v3(R.x0, y + R.h, R.z0), v3(R.x1, y + R.h, R.z0), v3(R.x1, y + R.h, R.z1), v3(R.x0, y + R.h, R.z1),
      R.ceil || TEX.CEIL_DECK, { tess: TESS_FLOOR, scale: R.ceilScale || 0.4 });
  }
}

/* ---------------------------------------------------------- door framing -- */
/* Walls are zero-thickness, so each opening gets a shallow frame box giving
   the passage visible depth, plus a leaf quad when the door is shut. */
var DOOR_TH = 0.22;

function buildDoorFrames(m) {
  for (var i = 0; i < DOORS.length; i++) {
    var D = DOORS[i];
    if (D.kind === 'open') continue;
    var w = D.s1 - D.s0, jam = 0.09;
    var fx = D.axis === 'z' ? DOOR_TH : w, fz = D.axis === 'z' ? w : DOOR_TH;
    var cx = D.axis === 'z' ? D.at : (D.s0 + D.s1) / 2;
    var cz = D.axis === 'z' ? (D.s0 + D.s1) / 2 : D.at;
    var ftex = D.kind === 'rollup' ? TEX.STEEL_DIRTY : TEX.STEEL;
    /* jambs */
    if (D.axis === 'z') {
      pushBox(m, cx, 0, D.s0 + jam / 2, DOOR_TH, D.h + jam, jam, 0, ftex);
      pushBox(m, cx, 0, D.s1 - jam / 2, DOOR_TH, D.h + jam, jam, 0, ftex);
      pushBox(m, cx, D.h, cz, DOOR_TH, jam, w, 0, ftex);
    } else {
      pushBox(m, D.s0 + jam / 2, 0, cz, jam, D.h + jam, DOOR_TH, 0, ftex);
      pushBox(m, D.s1 - jam / 2, 0, cz, jam, D.h + jam, DOOR_TH, 0, ftex);
      pushBox(m, cx, D.h, cz, w, jam, DOOR_TH, 0, ftex);
    }
  }
}

/* The leaf is rebuilt whenever a door opens or closes. */
function buildDoorLeaves(m) {
  for (var i = 0; i < DOORS.length; i++) {
    var D = DOORS[i];
    if (D.kind === 'open' || D.open) continue;
    var jam = 0.09;
    var w = D.s1 - D.s0 - jam * 2;
    var cx = D.axis === 'z' ? D.at : (D.s0 + D.s1) / 2;
    var cz = D.axis === 'z' ? (D.s0 + D.s1) / 2 : D.at;
    var tex = D.kind === 'rollup' ? TEX.ROLLUP : (D.kind === 'wood' ? TEX.DOOR_WOOD : TEX.DOOR_STEEL);
    var sx = D.axis === 'z' ? 0.08 : w, sz = D.axis === 'z' ? w : 0.08;
    pushBox(m, cx, 0, cz, sx, D.h - jam, sz, 0, tex,
      { scale: 0.55, flat: false, tess: 1.4, tint: D.locked ? [0.94, 0.9, 0.9] : null });
    /* small wired-glass vision panel on personnel doors */
    if (D.kind === 'door') {
      var gy = D.h * 0.62;
      var gw = Math.min(0.42, w * 0.5);
      var gsx = D.axis === 'z' ? 0.12 : gw, gsz = D.axis === 'z' ? gw : 0.12;
      pushBox(m, cx, gy, cz, gsx, 0.5, gsz, 0, TEX.SCREEN_OFF, { scale: 1.2 });
    }
  }
}
