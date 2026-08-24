/* =========================================================================
   MEATLIGHT :: 60-actors.js
   Low-poly box humanoids, rebuilt every frame from a pose.

   Static geometry gets full per-vertex lighting baked once. Doing that per
   frame for a moving character would mean thousands of light evaluations, so
   actors instead sample an ambient cube -- six directional samples taken at
   the chest, blended by face normal. Period-correct and effectively free.
   ========================================================================= */

function ambientCube(x, y, z) {
  var c = [];
  var dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (var i = 0; i < 6; i++) {
    shade(x, y, z, dirs[i][0], dirs[i][1], dirs[i][2], _sh);
    c.push(_sh[0], _sh[1], _sh[2]);
  }
  return c;
}
function cubeSample(c, nx, ny, nz, out) {
  var ax = nx > 0 ? 0 : 3, ay = ny > 0 ? 6 : 9, az = nz > 0 ? 12 : 15;
  var wx = nx * nx, wy = ny * ny, wz = nz * nz;
  var s = wx + wy + wz; if (s < 0.0001) { wx = 1; s = 1; }
  wx /= s; wy /= s; wz /= s;
  out[0] = c[ax] * wx + c[ay] * wy + c[az] * wz;
  out[1] = c[ax + 1] * wx + c[ay + 1] * wy + c[az + 1] * wz;
  out[2] = c[ax + 2] * wx + c[ay + 2] * wy + c[az + 2] * wz;
}

/* Oriented box. U x V = W, right-handed. */
var _obbFaces = [
  [4, 1, 1], [5, -1, 1], [0, -1, 1], [1, 1, 1], [2, 1, -1], [3, 1, 1]
];
var _oc = [0, 0, 0];
function pushOBB(m, cx, cy, cz, U, V, W, hu, hv, hw, tex, cube, tint) {
  var F = [
    { n: W,  t: U,  b: V,  s: 1,  hu: hu, hv: hv, off: hw,  ax: W },
    { n: W,  t: U,  b: V,  s: -1, hu: hu, hv: hv, off: -hw, ax: W },
    { n: U,  t: W,  b: V,  s: 1,  hu: hw, hv: hv, off: hu,  ax: U },
    { n: U,  t: W,  b: V,  s: -1, hu: hw, hv: hv, off: -hu, ax: U },
    { n: V,  t: U,  b: W,  s: 1,  hu: hu, hv: hw, off: hv,  ax: V },
    { n: V,  t: U,  b: W,  s: -1, hu: hu, hv: hw, off: -hv, ax: V }
  ];
  for (var i = 0; i < 6; i++) {
    var f = F[i];
    /* build tangent/bitangent so t x b points along the outward normal */
    var tx, ty, tz, bx, by, bz, nx, ny, nz;
    nx = f.ax.x * f.s; ny = f.ax.y * f.s; nz = f.ax.z * f.s;
    if (i < 2) { tx = U.x * f.s; ty = U.y * f.s; tz = U.z * f.s; bx = V.x; by = V.y; bz = V.z; }
    else if (i < 4) { tx = -W.x * f.s; ty = -W.y * f.s; tz = -W.z * f.s; bx = V.x; by = V.y; bz = V.z; }
    else { tx = U.x; ty = U.y; tz = U.z; bx = -W.x * f.s; by = -W.y * f.s; bz = -W.z * f.s; }
    var ox = cx + nx * (i < 2 ? hw : i < 4 ? hu : hv);
    var oy = cy + ny * (i < 2 ? hw : i < 4 ? hu : hv);
    var oz = cz + nz * (i < 2 ? hw : i < 4 ? hu : hv);
    var eu = f.hu, ev = f.hv;
    cubeSample(cube, nx, ny, nz, _oc);
    var cr = _oc[0] * (tint ? tint[0] : 1), cg = _oc[1] * (tint ? tint[1] : 1), cb = _oc[2] * (tint ? tint[2] : 1);
    var p = [
      { x: ox - tx * eu - bx * ev, y: oy - ty * eu - by * ev, z: oz - tz * eu - bz * ev, u: 0, v: 0 },
      { x: ox + tx * eu - bx * ev, y: oy + ty * eu - by * ev, z: oz + tz * eu - bz * ev, u: 1, v: 0 },
      { x: ox + tx * eu + bx * ev, y: oy + ty * eu + by * ev, z: oz + tz * eu + bz * ev, u: 1, v: 1 },
      { x: ox - tx * eu + bx * ev, y: oy - ty * eu + by * ev, z: oz - tz * eu + bz * ev, u: 0, v: 1 }
    ];
    for (var k = 0; k < 4; k++) { p[k].r = cr; p[k].g = cg; p[k].b = cb; }
    _pushTri(m, p[0].x, p[0].y, p[0].z, 0, 0, cr, cg, cb,
                p[1].x, p[1].y, p[1].z, 1, 0, cr, cg, cb,
                p[2].x, p[2].y, p[2].z, 1, 1, cr, cg, cb, tex, MAT_OPAQUE, false);
    _pushTri(m, p[0].x, p[0].y, p[0].z, 0, 0, cr, cg, cb,
                p[2].x, p[2].y, p[2].z, 1, 1, cr, cg, cb,
                p[3].x, p[3].y, p[3].z, 0, 1, cr, cg, cb, tex, MAT_OPAQUE, false);
  }
}

/* A limb: a box running from p0 to p1, oriented against the actor's facing. */
function pushLimb(m, p0, p1, wid, dep, tex, cube, fwd, tint) {
  var ax = sub3(p1, p0);
  var L = len3(ax); if (L < 0.0001) return;
  var V = scl3(ax, 1 / L);
  var U = cross3(V, fwd);
  if (len3(U) < 0.01) U = v3(1, 0, 0); else U = norm3(U);
  var W = cross3(U, V);
  var c = scl3(add3(p0, p1), 0.5);
  pushOBB(m, c.x, c.y, c.z, U, V, W, wid / 2, L / 2, dep / 2, tex, cube, tint);
}

/* ----------------------------------------------------------- characters -- */
var CHARS = {
  RAY:  { skin: 'SKIN_DARK', shirt: 'CLOTH_NAVY',   pants: 'CLOTH_NAVY',  boot: 'BOOT', hair: 'HAIR',
          hat: true, height: 1.00, bulk: 1.00, name: 'RAY' },
  DALE: { skin: 'SKIN',      shirt: 'CLOTH_SMOCK',  pants: 'CLOTH_APRON', boot: 'BOOT', hair: 'HAIR_GREY',
          hat: false, height: 1.02, bulk: 1.22, name: 'DALE' },
  SOL:  { skin: 'SKIN_DARK', shirt: 'CLOTH_ORANGE', pants: 'CLOTH_ORANGE', boot: 'BOOT', hair: 'HAIR',
          hat: false, height: 0.94, bulk: 0.92, name: 'SOL' },
  VOSK: { skin: 'SKIN',      shirt: 'CLOTH_SUIT',   pants: 'CLOTH_SUIT',  boot: 'BOOT', hair: 'HAIR_GREY',
          hat: false, height: 1.05, bulk: 0.96, name: 'VOSK' }
};

/* Pose returns joint angles in radians. Pitch swings a limb forward. */
function poseFor(state, t, seed) {
  var p = { spine: 0, lean: 0, headP: 0, headY: 0,
            armL: 0, armR: 0, elbL: -0.25, elbR: -0.25,
            legL: 0, legR: 0, kneeL: 0, kneeR: 0, bob: 0, sink: 0, shake: 0 };
  var s, w;
  switch (state) {
    case 'walk':
      w = t * 5.2;
      p.legL = Math.sin(w) * 0.62; p.legR = -Math.sin(w) * 0.62;
      p.kneeL = Math.max(0, -Math.sin(w + 0.9)) * 0.85;
      p.kneeR = Math.max(0, Math.sin(w + 0.9)) * 0.85;
      p.armL = -Math.sin(w) * 0.48; p.armR = Math.sin(w) * 0.48;
      p.elbL = -0.35 - Math.max(0, Math.sin(w)) * 0.3;
      p.elbR = -0.35 - Math.max(0, -Math.sin(w)) * 0.3;
      p.bob = Math.abs(Math.sin(w)) * 0.035; p.lean = 0.06;
      break;
    case 'run':
      w = t * 8.4;
      p.legL = Math.sin(w) * 0.95; p.legR = -Math.sin(w) * 0.95;
      p.kneeL = Math.max(0, -Math.sin(w + 0.7)) * 1.5;
      p.kneeR = Math.max(0, Math.sin(w + 0.7)) * 1.5;
      p.armL = -Math.sin(w) * 0.95; p.armR = Math.sin(w) * 0.95;
      p.elbL = -1.1; p.elbR = -1.1;
      p.bob = Math.abs(Math.sin(w)) * 0.06; p.lean = 0.30;
      break;
    case 'sit':
      p.legL = 1.45; p.legR = 1.45; p.kneeL = 1.5; p.kneeR = 1.5;
      p.armL = 0.7; p.armR = 0.7; p.elbL = -1.0; p.elbR = -1.0;
      p.sink = 0.42; p.lean = 0.1;
      p.headY = Math.sin(t * 0.6) * 0.12;
      break;
    case 'idle':
      s = Math.sin(t * 1.4);
      p.bob = s * 0.012; p.armL = s * 0.05; p.armR = -s * 0.05;
      p.headY = Math.sin(t * 0.45 + seed) * 0.22;
      break;
    case 'scared':
      s = Math.sin(t * 2.1);
      p.bob = Math.abs(Math.sin(t * 3.0)) * 0.02;
      p.armL = 0.5; p.armR = 0.45; p.elbL = -1.5; p.elbR = -1.4;
      p.lean = 0.12; p.headP = -0.1;
      p.shake = 0.012; p.headY = s * 0.3;
      break;
    case 'reach':
      p.armL = -1.9; p.armR = -1.85; p.elbL = -0.15; p.elbR = -0.2;
      p.lean = 0.2; p.headP = -0.25;
      p.shake = 0.02;
      break;
    case 'hung':
      /* suspended by the arms from an overhead hook */
      p.armL = -2.9; p.armR = -2.9; p.elbL = -0.05; p.elbR = -0.05;
      p.legL = 0.15 + Math.sin(t * 0.8) * 0.06; p.legR = -0.1 + Math.sin(t * 0.8 + 1) * 0.06;
      p.kneeL = 0.25; p.kneeR = 0.2; p.headP = 0.7; p.lean = -0.05;
      break;
    case 'crawl':
      w = t * 3.0;
      p.lean = 1.35; p.sink = 0.62;
      p.armL = -1.2 + Math.sin(w) * 0.6; p.armR = -1.2 - Math.sin(w) * 0.6;
      p.elbL = -0.5; p.elbR = -0.5;
      p.legL = 0.5 + Math.sin(w) * 0.3; p.legR = 0.5 - Math.sin(w) * 0.3;
      p.kneeL = 1.0; p.kneeR = 1.0; p.headP = -0.8;
      break;
    case 'dead':
      p.lean = 1.55; p.sink = 0.86;
      p.armL = -0.6; p.armR = 1.3; p.elbL = -0.4; p.elbR = -0.9;
      p.legL = 0.25; p.legR = -0.4; p.kneeL = 0.5; p.kneeR = 0.15;
      p.headP = 0.5; p.headY = 0.7;
      break;
    case 'fetal':
      p.lean = 1.1; p.sink = 0.72;
      p.armL = -1.6; p.armR = -1.6; p.elbL = -1.8; p.elbR = -1.8;
      p.legL = 1.5; p.legR = 1.4; p.kneeL = 1.8; p.kneeR = 1.8;
      p.headP = 0.6;
      break;
  }
  return p;
}

/* rotate a point about a pivot: pitch (about local X), then the actor yaw */
function jointPos(pivot, pitch, roll, len, yaw) {
  var dy = -Math.cos(pitch) * Math.cos(roll);
  var dz = -Math.sin(pitch);            /* +pitch swings the limb forward */
  var dx = Math.sin(roll);
  /* rotate (dx,dz) into world by the actor's yaw */
  var s = Math.sin(yaw), c = Math.cos(yaw);
  var wx = dx * c + dz * s, wz = -dx * s + dz * c;
  return v3(pivot.x + wx * len, pivot.y + dy * len, pivot.z + wz * len);
}

function drawHumanoid(m, A) {
  var C = CHARS[A.char] || CHARS.RAY;
  var t = A.t || 0;
  var P = A.poseOverride || poseFor(A.state || 'idle', t, A.seed || 0);
  var H = C.height * (A.scale || 1), B = C.bulk;
  var yaw = A.yaw || 0;
  var sh = P.shake ? (rnd() - 0.5) * P.shake : 0;
  var baseY = (A.y || 0) - P.sink * H + P.bob;
  var x = (A.x || 0) + sh, z = (A.z || 0) + sh;
  var fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
  var right = v3(Math.cos(yaw), 0, -Math.sin(yaw));
  var cube = ambientCube(x, baseY + 1.0, z);
  var tint = A.tint;

  var skin = TEX[C.skin], shirt = TEX[C.shirt], pants = TEX[C.pants],
      boot = TEX[C.boot], hair = TEX[C.hair];

  /* torso leans forward about the hips */
  var hipY = baseY + 0.90 * H;
  var lean = P.lean;
  var chest = v3(x - fwd.x * Math.sin(lean) * 0.5 * H, hipY + Math.cos(lean) * 0.5 * H,
                 z - fwd.z * Math.sin(lean) * 0.5 * H);
  var hip = v3(x, hipY, z);

  /* pelvis + torso */
  pushLimb(m, hip, v3(hip.x + (chest.x - hip.x) * 0.34, hip.y + (chest.y - hip.y) * 0.34,
           hip.z + (chest.z - hip.z) * 0.34), 0.36 * B, 0.25 * B, pants, cube, fwd, tint);
  pushLimb(m, v3(hip.x + (chest.x - hip.x) * 0.30, hip.y + (chest.y - hip.y) * 0.30,
           hip.z + (chest.z - hip.z) * 0.30), chest, 0.44 * B, 0.28 * B, shirt, cube, fwd, tint);

  /* head */
  var neck = v3(chest.x + (chest.x - hip.x) * 0.12, chest.y + 0.09 * H, chest.z + (chest.z - hip.z) * 0.12);
  var hy = yaw + P.headY;
  var hf = v3(Math.sin(hy), 0, Math.cos(hy));
  var headC = v3(neck.x + hf.x * Math.sin(P.headP) * 0.13, neck.y + 0.14 * H - Math.abs(P.headP) * 0.02,
                 neck.z + hf.z * Math.sin(P.headP) * 0.13);
  var hU = v3(Math.cos(hy), 0, -Math.sin(hy)), hV = v3(0, 1, 0), hW = hf;
  pushOBB(m, headC.x, headC.y, headC.z, hU, hV, hW, 0.105, 0.125, 0.105, skin, cube, tint);
  pushOBB(m, headC.x, headC.y + 0.10, headC.z, hU, hV, hW, 0.108, 0.05, 0.108,
    C.hat ? TEX.CLOTH_NAVY : hair, cube, tint);
  if (C.hat) pushOBB(m, headC.x + hf.x * 0.11, headC.y + 0.10, headC.z + hf.z * 0.11,
    hU, hV, hW, 0.10, 0.018, 0.06, TEX.CLOTH_NAVY, cube, tint);

  /* arms */
  var shY = chest.y - 0.03 * H, shX = 0.215 * B;
  var pairs = [[-1, P.armL, P.elbL], [1, P.armR, P.elbR]];
  for (var a = 0; a < 2; a++) {
    var sgn = pairs[a][0], sw = pairs[a][1], el = pairs[a][2];
    var sho = v3(chest.x + right.x * shX * sgn, shY, chest.z + right.z * shX * sgn);
    var elb = jointPos(sho, sw, sgn * 0.14, 0.30 * H, yaw);
    var wri = jointPos(elb, sw + el, sgn * 0.05, 0.28 * H, yaw);
    pushLimb(m, sho, elb, 0.115 * B, 0.115 * B, shirt, cube, fwd, tint);
    pushLimb(m, elb, wri, 0.10 * B, 0.10 * B, A.gloves ? TEX.GLOVE : skin, cube, fwd, tint);
  }
  /* legs */
  var lp = [[-1, P.legL, P.kneeL], [1, P.legR, P.kneeR]];
  for (var g = 0; g < 2; g++) {
    var sg = lp[g][0], hs = lp[g][1], kn = lp[g][2];
    var hipJ = v3(hip.x + right.x * 0.105 * B * sg, hipY, hip.z + right.z * 0.105 * B * sg);
    var knee = jointPos(hipJ, hs, 0, 0.44 * H, yaw);
    var ankle = jointPos(knee, hs - kn, 0, 0.42 * H, yaw);
    pushLimb(m, hipJ, knee, 0.155 * B, 0.16 * B, pants, cube, fwd, tint);
    pushLimb(m, knee, ankle, 0.13 * B, 0.135 * B, pants, cube, fwd, tint);
    var toe = v3(ankle.x + fwd.x * 0.10, ankle.y - 0.045, ankle.z + fwd.z * 0.10);
    pushLimb(m, v3(ankle.x, ankle.y - 0.02, ankle.z), toe, 0.13, 0.09, boot, cube, fwd, tint);
  }
}

/* ------------------------------------------------------------- the Six --
   Taller than a man and wrong in the joints. Built from the same limb code
   so it moves like something that used to be shaped like a person.        */
function drawSix(m, A) {
  var t = A.t || 0, yaw = A.yaw || 0;
  var jit = A.calm ? 0.004 : 0.022;
  var x = (A.x || 0) + (rnd() - 0.5) * jit, z = (A.z || 0) + (rnd() - 0.5) * jit;
  var baseY = A.y || 0;
  var fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
  var right = v3(Math.cos(yaw), 0, -Math.sin(yaw));
  var cube = ambientCube(x, baseY + 1.4, z);
  var st = A.state || 'stand';

  var w = t * (st === 'walk' ? 3.4 : st === 'charge' ? 7.6 : 1.1);
  var legSw = (st === 'walk' || st === 'charge') ? Math.sin(w) : Math.sin(w * 0.4) * 0.08;
  var lean = st === 'charge' ? 0.62 : st === 'walk' ? 0.42 : 0.34;
  var breathe = Math.sin(t * 1.6) * 0.03;

  var hipY = baseY + 1.16;
  var hip = v3(x, hipY, z);
  var chest = v3(x - fwd.x * Math.sin(lean) * 0.72, hipY + Math.cos(lean) * 0.72 + breathe,
                 z - fwd.z * Math.sin(lean) * 0.72);

  pushLimb(m, hip, chest, 0.46, 0.32, TEX.HIDE, cube, fwd);
  /* ribs pushed out through the hide */
  for (var r = 0; r < 3; r++) {
    var f = 0.32 + r * 0.22;
    var rc = v3(lerp(hip.x, chest.x, f), lerp(hip.y, chest.y, f), lerp(hip.z, chest.z, f));
    pushOBB(m, rc.x, rc.y, rc.z, right, v3(0, 1, 0), fwd, 0.27 - r * 0.03, 0.035, 0.19, TEX.BONE, cube);
  }
  /* head: a long skull hung forward off the neck, no face to speak of */
  var neck = v3(chest.x + fwd.x * 0.14, chest.y + 0.14, chest.z + fwd.z * 0.14);
  var headC = v3(neck.x + fwd.x * 0.20, neck.y + 0.04 - (st === 'charge' ? 0.1 : 0), neck.z + fwd.z * 0.20);
  pushLimb(m, neck, headC, 0.15, 0.15, TEX.HIDE, cube, fwd);
  pushOBB(m, headC.x + fwd.x * 0.13, headC.y, headC.z + fwd.z * 0.13,
    right, v3(0, 1, 0), fwd, 0.115, 0.115, 0.24, TEX.BONE, cube);
  pushOBB(m, headC.x + fwd.x * 0.30, headC.y - 0.05, headC.z + fwd.z * 0.30,
    right, v3(0, 1, 0), fwd, 0.075, 0.06, 0.13, TEX.MEAT_DARK, cube);

  /* arms: long, and the right one ends in the hook */
  var swing = (st === 'walk' || st === 'charge') ? Math.sin(w + Math.PI) : Math.sin(t * 0.9) * 0.12;
  var ap = [[-1, -swing * 0.5 - 0.2], [1, swing * 0.5 - 0.2]];
  for (var a = 0; a < 2; a++) {
    var sgn = ap[a][0], sw = ap[a][1];
    var sho = v3(chest.x + right.x * 0.28 * sgn, chest.y - 0.05, chest.z + right.z * 0.28 * sgn);
    var elb = jointPos(sho, sw, sgn * 0.22, 0.52, yaw);
    var wri = jointPos(elb, sw - 0.55, sgn * 0.1, 0.50, yaw);
    pushLimb(m, sho, elb, 0.135, 0.135, TEX.HIDE, cube, fwd);
    pushLimb(m, elb, wri, 0.105, 0.105, TEX.HIDE, cube, fwd);
    if (sgn > 0) {
      var hk = jointPos(wri, sw - 1.35, 0, 0.34, yaw);
      pushLimb(m, wri, hk, 0.055, 0.055, TEX.STEEL, cube, fwd);
      pushLimb(m, hk, jointPos(hk, sw + 1.2, 0.5, 0.16, yaw), 0.05, 0.05, TEX.STEEL, cube, fwd);
    } else {
      for (var f2 = 0; f2 < 3; f2++) {
        pushLimb(m, wri, jointPos(wri, sw - 0.9 + f2 * 0.2, (f2 - 1) * 0.3, 0.20, yaw),
          0.035, 0.035, TEX.BONE, cube, fwd);
      }
    }
  }
  /* legs: digitigrade, knees the wrong way round */
  var lp2 = [[-1, legSw], [1, -legSw]];
  for (var g = 0; g < 2; g++) {
    var sg = lp2[g][0], hs = lp2[g][1] * 0.7;
    var hipJ = v3(hip.x + right.x * 0.15 * sg, hipY, hip.z + right.z * 0.15 * sg);
    var knee = jointPos(hipJ, hs + 0.55, 0, 0.60, yaw);
    var ankle = jointPos(knee, hs - 1.15, 0, 0.56, yaw);
    var foot = jointPos(ankle, hs + 0.95, 0, 0.26, yaw);
    pushLimb(m, hipJ, knee, 0.18, 0.19, TEX.HIDE, cube, fwd);
    pushLimb(m, knee, ankle, 0.12, 0.13, TEX.HIDE, cube, fwd);
    pushLimb(m, ankle, foot, 0.11, 0.11, TEX.BONE, cube, fwd);
  }
}

/* ------------------------------------------------------- the moving line --
   Hooks travelling the overhead rail on the kill floor. Drawn dynamically so
   Line 3 can be seen to run, which is the whole point of Line 3.           */
function drawHookLine(m, cfg) {
  var n = cfg.count, span = cfg.x1 - cfg.x0, z = cfg.z, top = cfg.y;
  var cube = ambientCube((cfg.x0 + cfg.x1) / 2, top - 1.5, z);
  for (var i = 0; i < n; i++) {
    var f = ((i / n) + cfg.phase) % 1;
    var x = cfg.x0 + f * span;
    var sway = Math.sin(cfg.phase * 22 + i * 1.7) * 0.05 * (cfg.speed > 0 ? 1 : 0.2);
    /* trolley */
    pushOBB(m, x, top - 0.12, z, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1), 0.07, 0.06, 0.09, TEX.STEEL, cube);
    /* hook shank */
    var hookTop = top - 0.18, hookBot = top - 0.62;
    pushOBB(m, x + sway * 0.4, (hookTop + hookBot) / 2, z, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1),
      0.022, (hookTop - hookBot) / 2, 0.022, TEX.STEEL, cube);
    var load = cfg.loads && cfg.loads[i];
    if (!load) continue;
    if (load === 'meat' || load === 'dark') {
      pushOBB(m, x + sway, hookBot - 0.82, z, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1),
        0.30, 0.82, 0.22, load === 'dark' ? TEX.MEAT_DARK : TEX.MEAT, cube);
      pushOBB(m, x + sway, hookBot - 0.10, z, v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1),
        0.15, 0.14, 0.13, TEX.BONE, cube);
    } else if (load === 'man') {
      /* a person on the line, arms up, held by the wrists */
      drawHumanoid(m, {
        char: load2char(cfg.who), x: x + sway, y: hookBot - 2.05, z: z,
        yaw: cfg.faceYaw === undefined ? Math.PI : cfg.faceYaw,
        state: 'hung', t: cfg.t + i, tint: [0.92, 0.72, 0.72]
      });
    }
  }
}
function load2char(w) { return w || 'DALE'; }
