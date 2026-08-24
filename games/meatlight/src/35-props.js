/* =========================================================================
   MEATLIGHT :: 35-props.js
   Prop catalogue. Every entry declares its true footprint (w = extent along
   local X, d = extent along local Z, h = height) so the placement validator
   can test containment and overlap without building any geometry.

   Solid props are restricted to 90-degree yaw steps, which keeps their world
   AABB exact -- an industrial plant has no diagonal furniture anyway.
   ========================================================================= */

var PROP = {};

function defProp(name, w, d, h, solid, build) {
  PROP[name] = { w: w, d: d, h: h, solid: solid, build: build };
}

/* ------------------------------------------------------- security office -- */
defProp('console', 3.2, 1.0, 1.15, true, function (m, p) {
  var y = 0;
  pushBox(m, p.x, y, p.z, p.w, 0.72, p.d, p.yaw, TEX.DESK, { scale: 0.7 });          // desk body
  pushBox(m, p.x, 0.72, p.z, p.w, 0.05, p.d, p.yaw, TEX.STEEL, { scale: 0.8 });      // worktop
  /* three CRTs sat in a row on the deck */
  var ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
  for (var i = -1; i <= 1; i++) {
    var ox = p.x + ax * i * 1.0, oz = p.z + az * i * 1.0;
    pushBox(m, ox, 0.77, oz, 0.62, 0.5, 0.55, p.yaw, TEX.PANEL, { scale: 1.0 });
    pushBox(m, ox - Math.sin(p.yaw) * -0.28, 0.86, oz - Math.cos(p.yaw) * 0.28, 0.5, 0.36, 0.04, p.yaw,
      p.dead ? TEX.SCREEN_OFF : TEX.SCREEN_ON, { scale: 1.0, mat: p.dead ? MAT_OPAQUE : MAT_EMISSIVE, unlit: !p.dead });
  }
  pushBox(m, p.x, 0.74, p.z + 0.3, 1.1, 0.04, 0.34, p.yaw, TEX.PANEL, { scale: 1.4 });  // keyboard tray
});

defProp('desk', 1.7, 0.85, 0.76, true, function (m, p) {
  pushBox(m, p.x, 0.66, p.z, p.w, 0.06, p.d, p.yaw, TEX.DESK, { scale: 0.8 });
  var hw = p.w / 2 - 0.1, hd = p.d / 2 - 0.08;
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  for (var i = 0; i < 4; i++) {
    var lx = (i & 1) ? hw : -hw, lz = (i & 2) ? hd : -hd;
    pushBox(m, p.x + lx * c + lz * s, 0, p.z - lx * s + lz * c, 0.07, 0.66, 0.07, 0, TEX.STEEL);
  }
});

defProp('chair', 0.62, 0.62, 0.98, true, function (m, p) {
  pushBox(m, p.x, 0.44, p.z, 0.48, 0.07, 0.46, p.yaw, TEX.CLOTH_NAVY, { scale: 1.4 });
  pushBox(m, p.x - Math.sin(p.yaw) * 0.2, 0.5, p.z - Math.cos(p.yaw) * 0.2, 0.48, 0.5, 0.07, p.yaw, TEX.CLOTH_NAVY, { scale: 1.4 });
  pushCyl(m, p.x, 0, p.z, 0.05, 0.44, 6, TEX.STEEL);
  pushCyl(m, p.x, 0, p.z, 0.28, 0.06, 6, TEX.STEEL);
});

defProp('filecab', 0.52, 0.72, 1.42, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, p.h, p.d, p.yaw, TEX.LOCKER, { scale: 0.8 });
});

defProp('shelf', 1.1, 0.45, 1.95, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, 0.06, p.h, p.d, p.yaw, TEX.STEEL);
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  pushBox(m, p.x + p.w * c, 0, p.z - p.w * s, 0.06, p.h, p.d, p.yaw, TEX.STEEL);
  for (var i = 0; i < 4; i++) {
    pushBox(m, p.x + (p.w / 2) * c, 0.35 + i * 0.5, p.z - (p.w / 2) * s, p.w, 0.04, p.d, p.yaw, TEX.STEEL, { scale: 0.9 });
  }
});

/* ------------------------------------------------------------ break room -- */
defProp('table', 1.7, 0.95, 0.75, true, function (m, p) {
  pushBox(m, p.x, 0.68, p.z, p.w, 0.06, p.d, p.yaw, TEX.DESK, { scale: 0.8 });
  var hw = p.w / 2 - 0.12, hd = p.d / 2 - 0.1, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  for (var i = 0; i < 4; i++) {
    var lx = (i & 1) ? hw : -hw, lz = (i & 2) ? hd : -hd;
    pushBox(m, p.x + lx * c + lz * s, 0, p.z - lx * s + lz * c, 0.06, 0.68, 0.06, 0, TEX.STEEL);
  }
});

defProp('stool', 0.42, 0.42, 0.72, true, function (m, p) {
  pushCyl(m, p.x, 0.66, p.z, 0.2, 0.06, 8, TEX.CLOTH_ORANGE);
  pushCyl(m, p.x, 0, p.z, 0.04, 0.66, 6, TEX.STEEL);
  pushCyl(m, p.x, 0, p.z, 0.2, 0.04, 8, TEX.STEEL);
});

defProp('vending', 1.05, 0.82, 1.92, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, p.h, p.d, p.yaw, TEX.PANEL, { scale: 0.7 });
  pushBox(m, p.x - Math.sin(p.yaw) * (p.d / 2), 0.5, p.z - Math.cos(p.yaw) * (p.d / 2),
    p.w * 0.72, 1.15, 0.05, p.yaw, TEX.SCREEN_ON, { scale: 1.0, mat: MAT_EMISSIVE, unlit: true, tint: [0.5, 0.6, 0.5] });
});

defProp('fridge', 0.74, 0.74, 1.72, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, p.h, p.d, p.yaw, TEX.LOCKER, { scale: 0.7 });
});

defProp('sink', 1.25, 0.62, 0.92, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, 0.82, p.d, p.yaw, TEX.STEEL_DIRTY, { scale: 0.8 });
  pushBox(m, p.x, 0.82, p.z, p.w, 0.06, p.d, p.yaw, TEX.STEEL, { scale: 0.9 });
});

defProp('trash', 0.58, 0.58, 0.88, true, function (m, p) {
  pushCyl(m, p.x, 0, p.z, 0.29, 0.88, 8, TEX.BARREL, { tint: [0.7, 0.72, 0.7] });
});

defProp('mopbucket', 0.56, 0.42, 0.82, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, 0.4, p.d, p.yaw, TEX.BARREL, { scale: 1.2 });
  pushCyl(m, p.x, 0.4, p.z, 0.02, 1.3, 5, TEX.DOOR_WOOD);
});

/* ---------------------------------------------------------- locker room -- */
defProp('lockers', 2.5, 0.52, 1.92, true, function (m, p) {
  pushBox(m, p.x, 0.14, p.z, p.w, p.h - 0.14, p.d, p.yaw, TEX.LOCKER, { scale: 0.4, u1: 4, v1: 1 });
  pushBox(m, p.x, 0, p.z, p.w, 0.14, p.d * 0.9, p.yaw, TEX.STEEL);
});

defProp('bench', 1.9, 0.4, 0.46, true, function (m, p) {
  pushBox(m, p.x, 0.4, p.z, p.w, 0.06, p.d, p.yaw, TEX.DOOR_WOOD, { scale: 0.8 });
  var hw = p.w / 2 - 0.2, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  pushBox(m, p.x + hw * c, 0, p.z - hw * s, 0.07, 0.4, p.d, p.yaw, TEX.STEEL);
  pushBox(m, p.x - hw * c, 0, p.z + hw * s, 0.07, 0.4, p.d, p.yaw, TEX.STEEL);
});

/* --------------------------------------------------------------- plant --- */
/* Conveyor: length runs along local X. */
defProp('conveyor', 8.0, 1.1, 0.95, true, function (m, p) {
  pushBox(m, p.x, 0.72, p.z, p.w, 0.1, p.d, p.yaw, TEX.STEEL_DIRTY, { scale: 0.8, tess: 2.0, flat: false });
  pushBox(m, p.x, 0.6, p.z, p.w, 0.14, p.d * 0.7, p.yaw, TEX.PANEL, { scale: 0.8 });
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  var n = Math.max(2, Math.round(p.w / 1.6));
  for (var i = 0; i <= n; i++) {
    var t = -p.w / 2 + (p.w * i / n);
    pushBox(m, p.x + t * c, 0, p.z - t * s, 0.09, 0.6, 0.09, 0, TEX.STEEL);
  }
  /* side rails */
  var hd = p.d / 2;
  pushBox(m, p.x + hd * s, 0.82, p.z + hd * c, p.w, 0.12, 0.06, p.yaw, TEX.STEEL);
  pushBox(m, p.x - hd * s, 0.82, p.z - hd * c, p.w, 0.12, 0.06, p.yaw, TEX.STEEL);
});

defProp('cooker', 2.8, 2.8, 4.2, true, function (m, p) {
  pushCyl(m, p.x, 0.35, p.z, 1.34, 3.5, 10, TEX.STEEL_DIRTY, { scale: 0.34 });
  pushCyl(m, p.x, 0, p.z, 1.5, 0.35, 10, TEX.PANEL, { scale: 0.5 });
  pushCyl(m, p.x, 3.85, p.z, 0.9, 0.35, 8, TEX.STEEL, { scale: 0.5 });
  pushCyl(m, p.x, 4.2, p.z, 0.22, 1.6, 6, TEX.PANEL, { scale: 0.7 });     // vent stack
  /* charge hatch on the front face */
  pushBox(m, p.x, 1.5, p.z - 1.36, 0.9, 0.9, 0.1, 0, TEX.STEEL, { scale: 1.0 });
  pushCyl(m, p.x + 0.55, 1.95, p.z - 1.44, 0.14, 0.06, 6, TEX.PANEL_RUST, { scale: 2.0 });  // wheel
});

defProp('tank', 1.7, 1.7, 3.0, true, function (m, p) {
  pushCyl(m, p.x, 0.2, p.z, 0.85, 2.8, 8, TEX.PANEL_RUST, { scale: 0.4 });
  pushCyl(m, p.x, 0, p.z, 0.92, 0.2, 8, TEX.STEEL);
});

defProp('pump', 1.3, 1.05, 1.25, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, 0.5, p.d, p.yaw, TEX.PANEL, { scale: 0.8 });
  pushCyl(m, p.x, 0.5, p.z, 0.38, 0.7, 8, TEX.STEEL_DIRTY, { scale: 0.7 });
  pushCyl(m, p.x, 1.2, p.z, 0.1, 0.5, 6, TEX.PANEL_RUST, { scale: 1.0 });
});

defProp('grinder', 2.0, 1.3, 1.6, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, 0.9, p.d, p.yaw, TEX.PANEL, { scale: 0.7 });
  pushBox(m, p.x, 0.9, p.z, p.w * 0.8, 0.55, p.d * 0.8, p.yaw, TEX.STEEL_DIRTY, { scale: 0.8 });
  pushCyl(m, p.x, 1.45, p.z, 0.42, 0.2, 8, TEX.MEAT_DARK, { scale: 1.2 });   // charged hopper
});

defProp('crate', 1.05, 1.05, 0.92, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, p.h, p.d, p.yaw, TEX.CRATE, { scale: 0.8 });
});

defProp('pallet', 1.25, 1.05, 0.16, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, 0.16, p.d, p.yaw, TEX.DOOR_WOOD, { scale: 1.2 });
});

defProp('barrel', 0.62, 0.62, 0.92, true, function (m, p) {
  pushCyl(m, p.x, 0, p.z, 0.31, 0.92, 8, TEX.BARREL, { scale: 0.9 });
});

defProp('bin', 1.25, 0.85, 0.95, true, function (m, p) {
  pushBox(m, p.x, 0.14, p.z, p.w, 0.78, p.d, p.yaw, TEX.STEEL_DIRTY, { scale: 0.8 });
  if (p.full) pushBox(m, p.x, 0.86, p.z, p.w - 0.12, 0.14, p.d - 0.12, p.yaw, TEX.MEAT, { scale: 1.1 });
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw), hw = p.w / 2 - 0.16, hd = p.d / 2 - 0.12;
  for (var i = 0; i < 4; i++) {
    var lx = (i & 1) ? hw : -hw, lz = (i & 2) ? hd : -hd;
    pushCyl(m, p.x + lx * c + lz * s, 0, p.z - lx * s + lz * c, 0.07, 0.14, 6, TEX.STEEL);
  }
});

defProp('cart', 0.95, 0.62, 1.05, true, function (m, p) {
  pushBox(m, p.x, 0.2, p.z, p.w, 0.1, p.d, p.yaw, TEX.STEEL);
  pushBox(m, p.x, 0.65, p.z, p.w, 0.08, p.d, p.yaw, TEX.STEEL);
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw), hw = p.w / 2 - 0.08, hd = p.d / 2 - 0.06;
  for (var i = 0; i < 4; i++) {
    var lx = (i & 1) ? hw : -hw, lz = (i & 2) ? hd : -hd;
    pushBox(m, p.x + lx * c + lz * s, 0, p.z - lx * s + lz * c, 0.05, 1.05, 0.05, 0, TEX.STEEL);
  }
});

defProp('forklift', 2.5, 1.25, 2.05, true, function (m, p) {
  pushBox(m, p.x, 0.25, p.z, p.w * 0.72, 0.75, p.d, p.yaw, TEX.CLOTH_ORANGE, { scale: 0.6 });
  pushBox(m, p.x, 1.0, p.z, p.w * 0.42, 0.5, p.d * 0.8, p.yaw, TEX.PANEL, { scale: 0.8 });
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw), fx = p.x + (p.w * 0.42) * c, fz = p.z - (p.w * 0.42) * s;
  pushBox(m, fx, 0, fz, 0.1, 2.05, 0.1, p.yaw, TEX.STEEL);
  pushBox(m, fx, 0.02, fz + 0.3, 0.6, 0.05, 0.12, p.yaw, TEX.STEEL);
  pushBox(m, fx, 0.02, fz - 0.3, 0.6, 0.05, 0.12, p.yaw, TEX.STEEL);
  for (var i = 0; i < 4; i++) {
    var lx = (i & 1) ? 0.75 : -0.75, lz = (i & 2) ? 0.52 : -0.52;
    pushCyl(m, p.x + lx * c + lz * s, 0, p.z - lx * s + lz * c, 0.25, 0.22, 8, TEX.BOOT, { scale: 1.2 });
  }
});

defProp('pillar', 0.45, 0.45, 6.0, true, function (m, p) {
  pushBox(m, p.x, 0, p.z, p.w, p.h, p.d, 0, TEX.PANEL_RUST, { scale: 0.5, flat: false, tess: 2.0 });
});

/* --------------------------------------------------------- non-blocking -- */
defProp('bloodpool', 1.6, 1.6, 0.02, false, function (m, p) {
  var r = (p.r || 0.8);
  pushQuad(m, v3(p.x - r, 0.012, p.z + r), v3(p.x + r, 0.012, p.z + r),
              v3(p.x + r, 0.012, p.z - r), v3(p.x - r, 0.012, p.z - r),
              TEX.BLOOD, { u1: 1, v1: 1, mat: MAT_MASK, flat: true });
});

defProp('drainplate', 0.9, 0.9, 0.02, false, function (m, p) {
  pushQuad(m, v3(p.x - 0.45, 0.008, p.z + 0.45), v3(p.x + 0.45, 0.008, p.z + 0.45),
              v3(p.x + 0.45, 0.008, p.z - 0.45), v3(p.x - 0.45, 0.008, p.z - 0.45),
              TEX.DRAIN, { u1: 1, v1: 1, flat: true });
});

defProp('lamp', 1.3, 0.3, 0.16, false, function (m, p) {
  var y = p.y === undefined ? 2.7 : p.y;
  pushBox(m, p.x, y, p.z, p.w, 0.1, p.d, p.yaw, p.dead ? TEX.LAMP_DEAD : TEX.LAMP,
    { scale: 1.0, unlit: !p.dead, mat: p.dead ? MAT_OPAQUE : MAT_EMISSIVE });
  pushBox(m, p.x, y + 0.1, p.z, p.w + 0.08, 0.06, p.d + 0.06, p.yaw, TEX.STEEL, { scale: 1.0 });
});

defProp('lampred', 0.34, 0.34, 0.34, false, function (m, p) {
  var y = p.y === undefined ? 2.7 : p.y;
  pushCyl(m, p.x, y, p.z, 0.16, 0.2, 6, p.dead ? TEX.LAMP_DEAD : TEX.LAMP_RED,
    { unlit: !p.dead, mat: p.dead ? MAT_OPAQUE : MAT_EMISSIVE, scale: 1.5 });
  pushCyl(m, p.x, y + 0.2, p.z, 0.18, 0.08, 6, TEX.STEEL, { scale: 1.5 });
});

/* Overhead hook rail. Runs along local X. The hooks themselves are drawn
   dynamically by the game loop so the line can be seen to move. */
defProp('hookrail', 10.0, 0.2, 0.2, false, function (m, p) {
  var y = p.y === undefined ? 4.3 : p.y;
  pushBox(m, p.x, y, p.z, p.w, 0.14, 0.14, p.yaw, TEX.STEEL, { scale: 0.7, tess: 2.5, flat: false });
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  var n = Math.max(2, Math.round(p.w / 2.5));
  for (var i = 0; i <= n; i++) {
    var t = -p.w / 2 + (p.w * i / n);
    pushBox(m, p.x + t * c, y + 0.14, p.z - t * s, 0.07, p.rise === undefined ? 1.5 : p.rise, 0.07, 0, TEX.STEEL);
  }
});

defProp('railing', 3.0, 0.1, 1.05, false, function (m, p) {
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  pushBox(m, p.x, 1.0, p.z, p.w, 0.06, 0.06, p.yaw, TEX.PANEL_RUST, { scale: 1.0 });
  pushBox(m, p.x, 0.5, p.z, p.w, 0.05, 0.05, p.yaw, TEX.PANEL_RUST, { scale: 1.0 });
  var n = Math.max(2, Math.round(p.w / 1.5));
  for (var i = 0; i <= n; i++) {
    var t = -p.w / 2 + (p.w * i / n);
    pushBox(m, p.x + t * c, 0, p.z - t * s, 0.06, 1.05, 0.06, 0, TEX.PANEL_RUST);
  }
});

defProp('pipes', 6.0, 0.3, 0.3, false, function (m, p) {
  var y = p.y === undefined ? 3.4 : p.y;
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  var off = [-0.22, 0, 0.24], rad = [0.11, 0.07, 0.13];
  for (var i = 0; i < 3; i++) {
    pushBox(m, p.x - off[i] * s, y + off[i] * 0.5, p.z - off[i] * c, p.w, rad[i] * 2, rad[i] * 2, p.yaw,
      i === 1 ? TEX.PANEL_RUST : TEX.STEEL_DIRTY, { scale: 0.8, tess: 3.0, flat: false });
  }
  var n = Math.max(1, Math.round(p.w / 3));
  for (var k = 0; k <= n; k++) {
    var t = -p.w / 2 + (p.w * k / n);
    pushBox(m, p.x + t * c, y - 0.25, p.z - t * s, 0.06, 0.9, 0.7, p.yaw, TEX.STEEL);
  }
});

/* Strip curtain hung in a doorway. */
defProp('curtain', 1.6, 0.06, 2.2, false, function (m, p) {
  var w = p.w / 2, h = p.h;
  var c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  var ax = c, az = -s;
  pushQuad(m, v3(p.x - ax * w, 0.02, p.z - az * w), v3(p.x + ax * w, 0.02, p.z + az * w),
              v3(p.x + ax * w, h, p.z + az * w), v3(p.x - ax * w, h, p.z - az * w),
              TEX.PLASTIC, { u1: p.w * 2, v1: 1, mat: MAT_MASK, dbl: true, tess: 1.2 });
});

/* Hanging carcass, used as static set-dressing in cold storage. */
defProp('carcass', 0.7, 0.5, 1.9, false, function (m, p) {
  var top = p.top === undefined ? 3.6 : p.top;
  pushCyl(m, p.x, top - 0.45, p.z, 0.035, 0.45, 5, TEX.STEEL);
  pushBox(m, p.x, top - 2.2, p.z, 0.62, 1.75, 0.44, p.yaw, p.dark ? TEX.MEAT_DARK : TEX.MEAT,
    { scale: 0.9, flat: false, tess: 0.9 });
  pushBox(m, p.x, top - 2.45, p.z, 0.3, 0.3, 0.28, p.yaw, TEX.BONE, { scale: 1.4 });
});

/* --------------------------------------------------------- wall-mounted -- */
/* Wall props are positioned by (wall side, span coordinate, height). */
var WALLPROP = {};
function defWallProp(name, w, h, build) { WALLPROP[name] = { w: w, h: h, build: build }; }

/* returns {x, z, nx, nz} for a point on a room wall, pushed slightly inboard */
function wallSpot(R, side, s, off) {
  off = off || 0.03;
  if (side === 'S') return { x: s, z: R.z0 + off, nx: 0, nz: 1 };
  if (side === 'N') return { x: s, z: R.z1 - off, nx: 0, nz: -1 };
  if (side === 'W') return { x: R.x0 + off, z: s, nx: 1, nz: 0 };
  return { x: R.x1 - off, z: s, nx: -1, nz: 0 };
}
function wallFacingYaw(side) {
  return side === 'S' ? 0 : side === 'N' ? Math.PI : side === 'W' ? Math.PI / 2 : -Math.PI / 2;
}

function wallPlate(m, R, side, s, y, w, h, tex, o) {
  o = o || {};
  var sp = wallSpot(R, side, s, o.off === undefined ? 0.04 : o.off);
  var ax, az;
  if (side === 'S') { ax = 1; az = 0; }
  else if (side === 'N') { ax = -1; az = 0; }
  else if (side === 'W') { ax = 0; az = -1; }
  else { ax = 0; az = 1; }
  var hw = w / 2;
  pushQuad(m,
    v3(sp.x - ax * hw, y, sp.z - az * hw), v3(sp.x + ax * hw, y, sp.z + az * hw),
    v3(sp.x + ax * hw, y + h, sp.z + az * hw), v3(sp.x - ax * hw, y + h, sp.z - az * hw),
    tex, { u1: o.u1 === undefined ? 1 : o.u1, v1: o.v1 === undefined ? 1 : o.v1,
           mat: o.mat, unlit: o.unlit, flat: true, tint: o.tint });
}

defWallProp('sign', 1.2, 0.6, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX[p.tex] || TEX.SIGN_LINE3);
});
defWallProp('poster', 0.6, 1.1, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX[p.tex] || TEX.POSTER_SAFETY);
});
defWallProp('exitsign', 0.55, 0.28, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX.SIGN_EXIT, { mat: MAT_EMISSIVE, unlit: true });
});
defWallProp('breaker', 0.7, 0.95, function (m, R, p) {
  var sp = wallSpot(R, p.wall, p.s, 0.02);
  pushBox(m, sp.x - sp.nx * -0.09, p.y, sp.z - sp.nz * -0.09, p.wall === 'W' || p.wall === 'E' ? 0.18 : p.w,
    p.h, p.wall === 'W' || p.wall === 'E' ? p.w : 0.18, 0, TEX.PANEL, { scale: 1.0 });
  wallPlate(m, R, p.wall, p.s, p.y + 0.1, p.w * 0.7, p.h * 0.6, TEX.SIGN_AUTH, { off: 0.2 });
});
defWallProp('hosereel', 0.8, 0.8, function (m, R, p) {
  var sp = wallSpot(R, p.wall, p.s, 0.1);
  pushCyl(m, sp.x, p.y, sp.z, 0.34, 0.22, 8, TEX.CLOTH_ORANGE, { scale: 1.0 });
});
defWallProp('corkboard', 1.3, 0.9, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX.SIGN_DAYS);
});
defWallProp('bloodspray', 2.0, 1.6, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX.BLOOD_SPRAY, { mat: MAT_MASK, off: 0.05 });
});
defWallProp('bloodsmear', 1.3, 1.3, function (m, R, p) {
  wallPlate(m, R, p.wall, p.s, p.y, p.w, p.h, TEX.BLOOD, { mat: MAT_MASK, off: 0.05 });
});
/* A visible security camera, aimed by yaw/pitch so the fixtures agree with
   the feeds the player actually watches. */
defWallProp('camfix', 0.4, 0.3, function (m, R, p) {
  var sp = wallSpot(R, p.wall, p.s, 0.06);
  pushBox(m, sp.x, p.y, sp.z, 0.1, 0.1, 0.1, 0, TEX.STEEL);
  var yaw = p.aim === undefined ? wallFacingYaw(p.wall) : p.aim;
  var dx = Math.sin(yaw) * 0.22, dz = Math.cos(yaw) * 0.22;
  pushBox(m, sp.x + dx, p.y - 0.14, sp.z + dz, 0.16, 0.14, 0.3, yaw, TEX.PANEL, { scale: 1.2 });
  pushCyl(m, sp.x + dx * 1.6, p.y - 0.1, sp.z + dz * 1.6, 0.045, 0.06, 6, TEX.SCREEN_OFF, { scale: 2.0 });
  pushCyl(m, sp.x + dx * 0.4, p.y - 0.07, sp.z + dz * 0.4, 0.02, 0.05, 4,
    p.dead ? TEX.LAMP_DEAD : TEX.LAMP_RED, { unlit: !p.dead, mat: p.dead ? MAT_OPAQUE : MAT_EMISSIVE, scale: 2.0 });
});
