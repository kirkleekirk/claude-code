/* =========================================================================
   MEATLIGHT :: 10-core.js
   Constants, math, and the software rasterizer.

   The renderer deliberately reproduces sixth-generation console artifacts:
     - 320x240 internal framebuffer, point-sampled, upscaled
     - vertex position snapping (sub-pixel truncation wobble)
     - subdivided-affine texture mapping (perspective corrected every 16px,
       linear in between -- the characteristic slight texture swim)
     - flat/gouraud per-vertex colour, no per-pixel lighting
     - ordered-dither fog to hide the banding a 16-bit-ish palette would show
   ========================================================================= */

var VW = 320, VH = 240;              // internal render resolution
var ZNEAR = 0.12;
var SNAP = 2.0;                      // vertex snap: coords quantised to 1/SNAP px
var AFFINE_SPAN = 16;                // px between perspective corrections

var COLBUF = null;                   // Uint32Array view of the ImageData
var DEPBUF = new Float32Array(VW * VH);   // stores 1/z, greater == nearer

/* viewport rect inside the framebuffer (quad-view renders 4 small viewports) */
var VPX = 0, VPY = 0, VPW = VW, VPH = VH, VPCX = VW / 2, VPCY = VH / 2;

/* fog state, set per camera */
var FOG_R = 8, FOG_G = 6, FOG_B = 7, FOG_NEAR = 6, FOG_FAR = 34;

function setViewport(x, y, w, h) {
  VPX = x; VPY = y; VPW = w; VPH = h;
  VPCX = x + w / 2; VPCY = y + h / 2;
}
function setFog(r, g, b, near, far) {
  FOG_R = r; FOG_G = g; FOG_B = b; FOG_NEAR = near; FOG_FAR = far;
}

/* ---------------------------------------------------------------- math -- */
function v3(x, y, z) { return { x: x, y: y, z: z }; }
function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scl3(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function len3(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function norm3(a) { var l = len3(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

/* deterministic hash noise -- same layout every run, no surprises */
function hash2(x, y) {
  var h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
var _rngState = 0x1a2b3c4d;
function rnd() {
  _rngState ^= _rngState << 13; _rngState ^= _rngState >>> 17; _rngState ^= _rngState << 5;
  return ((_rngState >>> 0) / 4294967296);
}
function rndSeed(s) { _rngState = s >>> 0 || 1; }

/* --------------------------------------------------------------- camera -- */
/* A camera is a position plus an orthonormal basis. World points are folded
   into view space with three dot products -- no 4x4 matrices needed. */
function makeCam(pos, target, fovDeg, roll) {
  var fwd = norm3(sub3(target, pos));
  var upW = v3(0, 1, 0);
  if (Math.abs(fwd.y) > 0.985) upW = v3(0, 0, 1);     // avoid degenerate basis
  var right = norm3(cross3(fwd, upW));
  var up = cross3(right, fwd);
  if (roll) {
    var c = Math.cos(roll), s = Math.sin(roll);
    var r2 = add3(scl3(right, c), scl3(up, s));
    var u2 = add3(scl3(up, c), scl3(right, -s));
    right = r2; up = u2;
  }
  return {
    pos: pos, target: target, fwd: fwd, right: right, up: up,
    fov: fovDeg || 60,
    f: (VH / 2) / Math.tan((fovDeg || 60) * Math.PI / 360)
  };
}

var CAMV = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fy: 0, fz: 0, f: 200 };
function bindCam(cam) {
  CAMV.px = cam.pos.x; CAMV.py = cam.pos.y; CAMV.pz = cam.pos.z;
  CAMV.rx = cam.right.x; CAMV.ry = cam.right.y; CAMV.rz = cam.right.z;
  CAMV.ux = cam.up.x; CAMV.uy = cam.up.y; CAMV.uz = cam.up.z;
  CAMV.fx = cam.fwd.x; CAMV.fy = cam.fwd.y; CAMV.fz = cam.fwd.z;
  /* f is derived from the viewport height so quad-view keeps the same FOV */
  CAMV.f = (VPH / 2) / Math.tan(cam.fov * Math.PI / 360);
}

/* world -> view space */
var _vx = 0, _vy = 0, _vz = 0;
function toView(x, y, z) {
  var dx = x - CAMV.px, dy = y - CAMV.py, dz = z - CAMV.pz;
  _vx = dx * CAMV.rx + dy * CAMV.ry + dz * CAMV.rz;
  _vy = dx * CAMV.ux + dy * CAMV.uy + dz * CAMV.uz;
  _vz = dx * CAMV.fx + dy * CAMV.fy + dz * CAMV.fz;
}

/* ---------------------------------------------------------- framebuffer -- */
function clearFrame(r, g, b) {
  var c = 0xFF000000 | (b << 16) | (g << 8) | r;
  COLBUF.fill(c);
  DEPBUF.fill(0);
}
function clearViewport(r, g, b) {
  var c = 0xFF000000 | (b << 16) | (g << 8) | r;
  for (var y = VPY; y < VPY + VPH; y++) {
    var o = y * VW + VPX;
    COLBUF.fill(c, o, o + VPW);
    DEPBUF.fill(0, o, o + VPW);
  }
}

/* 4x4 ordered dither -- applied to the fog blend so gradients break up into
   period-correct stipple instead of smooth banding */
var BAYER = new Int32Array([
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5
]);

/* ------------------------------------------------------------ rasteriser -- */
/* Vertex layout used by the scanline walker.
   Index: 0=sx 1=sy 2=iz(1/z) 3=uz(u/z) 4=vz(v/z) 5=r 6=g 7=b               */
var NATT = 8;
var _a0 = new Float64Array(NATT), _a1 = new Float64Array(NATT), _a2 = new Float64Array(NATT);
var _eL = new Float64Array(NATT), _eR = new Float64Array(NATT);
var _dL = new Float64Array(NATT), _dR = new Float64Array(NATT);

var TRIS_DRAWN = 0, PIX_DRAWN = 0;
var DBG_NOCULL = false, DBG_CULLED = 0, DBG_SUBMIT = 0, DBG_NEARCLIP = 0;

/* A "material" controls how the span loop treats the texture. */
var MAT_OPAQUE = 0, MAT_MASK = 1, MAT_EMISSIVE = 2;

function rasterTri(A, B, C, tex, mat) {
  /* order by screen y */
  var t;
  if (A[1] > B[1]) { t = A; A = B; B = t; }
  if (B[1] > C[1]) { t = B; B = C; C = t; }
  if (A[1] > B[1]) { t = A; A = B; B = t; }

  var y0 = Math.ceil(A[1] - 0.5), y2 = Math.ceil(C[1] - 0.5);
  if (y2 <= y0) return;
  var clipTop = VPY, clipBot = VPY + VPH;
  if (y0 >= clipBot || y2 <= clipTop) return;

  var yA = A[1], yB = B[1], yC = C[1];
  var hAC = yC - yA, hAB = yB - yA, hBC = yC - yB;
  var i;

  /* long edge A->C, short edges A->B then B->C */
  var invAC = hAC !== 0 ? 1 / hAC : 0;
  for (i = 0; i < NATT; i++) _dL[i] = (C[i] - A[i]) * invAC;

  /* Decide which side the long edge falls on. At B's height the long edge sits
     at xAtB; if that is left of B then A->C is the left edge of the triangle. */
  var xAtB = A[0] + _dL[0] * hAB;
  var longIsLeft = xAtB < B[0];

  var yStart, yEnd, seg;
  for (seg = 0; seg < 2; seg++) {
    var S = seg === 0 ? A : B, E = seg === 0 ? B : C;
    var h = seg === 0 ? hAB : hBC;
    if (h <= 0) continue;
    var inv = 1 / h;
    for (i = 0; i < NATT; i++) _dR[i] = (E[i] - S[i]) * inv;

    yStart = Math.max(Math.ceil((seg === 0 ? yA : yB) - 0.5), clipTop);
    yEnd = Math.min(Math.ceil((seg === 0 ? yB : yC) - 0.5), clipBot);
    if (yEnd <= yStart) continue;

    for (var y = yStart; y < yEnd; y++) {
      var tLong = (y + 0.5) - yA;
      var tShort = (y + 0.5) - (seg === 0 ? yA : yB);
      var L, R;
      if (longIsLeft) {
        for (i = 0; i < NATT; i++) { _eL[i] = A[i] + _dL[i] * tLong; _eR[i] = S[i] + _dR[i] * tShort; }
      } else {
        for (i = 0; i < NATT; i++) { _eR[i] = A[i] + _dL[i] * tLong; _eL[i] = S[i] + _dR[i] * tShort; }
      }
      drawSpan(y, _eL, _eR, tex, mat);
    }
  }
  TRIS_DRAWN++;
}

function drawSpan(y, L, R, tex, mat) {
  var xL = L[0], xR = R[0];
  if (xR <= xL) return;
  var x0 = Math.ceil(xL - 0.5), x1 = Math.ceil(xR - 0.5);
  var clipL = VPX, clipR = VPX + VPW;
  if (x0 < clipL) x0 = clipL;
  if (x1 > clipR) x1 = clipR;
  if (x1 <= x0) return;

  var w = xR - xL, invw = 1 / w;
  var dIz = (R[2] - L[2]) * invw;
  var dUz = (R[3] - L[3]) * invw;
  var dVz = (R[4] - L[4]) * invw;
  var dR_ = (R[5] - L[5]) * invw;
  var dG_ = (R[6] - L[6]) * invw;
  var dB_ = (R[7] - L[7]) * invw;

  var pre = (x0 + 0.5) - xL;
  var iz = L[2] + dIz * pre;
  var uz = L[3] + dUz * pre;
  var vz = L[4] + dVz * pre;
  var cr = L[5] + dR_ * pre;
  var cg = L[6] + dG_ * pre;
  var cb = L[7] + dB_ * pre;

  var td = tex.data, tw = tex.w, tmaskU = tex.w - 1, tmaskV = tex.h - 1, tsh = tex.shift;
  var rowBase = y * VW;
  var bayerRow = (y & 3) << 2;

  var fogSpan = FOG_FAR - FOG_NEAR; if (fogSpan < 0.001) fogSpan = 0.001;
  var emissive = (mat === MAT_EMISSIVE);
  var masked = (mat === MAT_MASK);

  var x = x0;
  while (x < x1) {
    var chunk = AFFINE_SPAN;
    if (x + chunk > x1) chunk = x1 - x;

    /* perspective correction at both ends of the chunk, linear in between */
    var z0 = iz > 1e-9 ? 1 / iz : 1e9;
    var u0 = uz * z0, v0 = vz * z0;
    var izE = iz + dIz * chunk;
    var zE = izE > 1e-9 ? 1 / izE : 1e9;
    var uE = (uz + dUz * chunk) * zE, vE = (vz + dVz * chunk) * zE;

    var invc = 1 / chunk;
    var uStep = ((uE - u0) * invc * 65536) | 0;
    var vStep = ((vE - v0) * invc * 65536) | 0;
    var uFix = (u0 * 65536) | 0;
    var vFix = (v0 * 65536) | 0;

    /* fog is evaluated per chunk from the corrected depth */
    var f0 = clamp((z0 - FOG_NEAR) / fogSpan, 0, 1);
    var fE = clamp((zE - FOG_NEAR) / fogSpan, 0, 1);
    if (emissive) { f0 *= 0.25; fE *= 0.25; }
    var fg = f0 * 256, fgStep = (fE - f0) * 256 * invc;

    for (var k = 0; k < chunk; k++, x++) {
      var o = rowBase + x;
      if (iz > DEPBUF[o]) {
        var texel = td[(((vFix >> 16) & tmaskV) << tsh) + ((uFix >> 16) & tmaskU)];
        if (!masked || (texel & 0xFF000000)) {
          var tr = texel & 255, tg = (texel >> 8) & 255, tb = (texel >> 16) & 255;
          if (!emissive) {
            var li_r = cr < 0 ? 0 : (cr * 256) | 0;
            var li_g = cg < 0 ? 0 : (cg * 256) | 0;
            var li_b = cb < 0 ? 0 : (cb * 256) | 0;
            tr = (tr * li_r) >> 8; tg = (tg * li_g) >> 8; tb = (tb * li_b) >> 8;
          }
          var fi = fg | 0;
          if (fi > 0) {
            /* ordered dither: nudge the blend by +-1/32 based on pixel parity */
            fi += (BAYER[bayerRow + (x & 3)] - 8);
            if (fi < 0) fi = 0; else if (fi > 256) fi = 256;
            tr = tr + (((FOG_R - tr) * fi) >> 8);
            tg = tg + (((FOG_G - tg) * fi) >> 8);
            tb = tb + (((FOG_B - tb) * fi) >> 8);
          }
          if (tr > 255) tr = 255; if (tg > 255) tg = 255; if (tb > 255) tb = 255;
          if (tr < 0) tr = 0; if (tg < 0) tg = 0; if (tb < 0) tb = 0;
          COLBUF[o] = 0xFF000000 | (tb << 16) | (tg << 8) | tr;
          DEPBUF[o] = iz;
          PIX_DRAWN++;
        }
      }
      uFix += uStep; vFix += vStep;
      iz += dIz; cr += dR_; cg += dG_; cb += dB_; fg += fgStep;
    }
    uz += dUz * chunk; vz += dVz * chunk;
  }
}

/* --------------------------------------------------- clip + project + draw -- */
/* A poly vertex in view space: {x,y,z,u,v,r,g,b} */
var _clipIn = [], _clipOut = [];

function clipNear(poly, out) {
  out.length = 0;
  var n = poly.length;
  for (var i = 0; i < n; i++) {
    var a = poly[i], b = poly[(i + 1) % n];
    var ain = a.z >= ZNEAR, bin = b.z >= ZNEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      var t = (ZNEAR - a.z) / (b.z - a.z);
      out.push({
        x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: ZNEAR,
        u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t,
        r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t
      });
    }
  }
  return out.length;
}

function projectVert(vv, dst, tex) {
  var f = CAMV.f, iz = 1 / vv.z;
  var sx = VPCX + vv.x * f * iz;
  var sy = VPCY - vv.y * f * iz;
  /* vertex snapping -- the wobble */
  sx = Math.round(sx * SNAP) / SNAP;
  sy = Math.round(sy * SNAP) / SNAP;
  dst[0] = sx; dst[1] = sy; dst[2] = iz;
  dst[3] = vv.u * tex.w * iz; dst[4] = vv.v * tex.h * iz;
  dst[5] = vv.r; dst[6] = vv.g; dst[7] = vv.b;
}

/* Draw one world-space triangle. p0..p2 carry {x,y,z,u,v,r,g,b}. */
function drawTri(p0, p1, p2, tex, mat, doubleSided) {
  toView(p0.x, p0.y, p0.z); var q0 = { x: _vx, y: _vy, z: _vz, u: p0.u, v: p0.v, r: p0.r, g: p0.g, b: p0.b };
  toView(p1.x, p1.y, p1.z); var q1 = { x: _vx, y: _vy, z: _vz, u: p1.u, v: p1.v, r: p1.r, g: p1.g, b: p1.b };
  toView(p2.x, p2.y, p2.z); var q2 = { x: _vx, y: _vy, z: _vz, u: p2.u, v: p2.v, r: p2.r, g: p2.g, b: p2.b };

  DBG_SUBMIT++;
  if (q0.z < ZNEAR && q1.z < ZNEAR && q2.z < ZNEAR) { DBG_NEARCLIP++; return; }

  var poly;
  if (q0.z >= ZNEAR && q1.z >= ZNEAR && q2.z >= ZNEAR) {
    poly = [q0, q1, q2];
  } else {
    _clipIn.length = 0; _clipIn.push(q0, q1, q2);
    if (clipNear(_clipIn, _clipOut) < 3) return;
    poly = _clipOut.slice();
  }

  for (var i = 1; i + 1 < poly.length; i++) {
    projectVert(poly[0], _a0, tex);
    projectVert(poly[i], _a1, tex);
    projectVert(poly[i + 1], _a2, tex);
    var area = (_a1[0] - _a0[0]) * (_a2[1] - _a0[1]) - (_a2[0] - _a0[0]) * (_a1[1] - _a0[1]);
    if (area === 0) continue;
    /* Visible side is where eu x ev points, which the screen-space signed area
       reports as area < 0. Verified against the rasteriser, not derived. */
    if (area > 0 && !doubleSided && !DBG_NOCULL) { DBG_CULLED++; continue; }  // backface
    rasterTri(_a0.slice(), _a1.slice(), _a2.slice(), tex, mat);
  }
}

/* Meshes store triangles flattened for speed:
   each tri = 3 verts x 8 floats = 24 floats, plus a parallel material array. */
function drawMesh(mesh) {
  var d = mesh.data, n = mesh.count, mats = mesh.mats, texs = mesh.texs, ds = mesh.dbl;
  var p0 = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1 };
  var p1 = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1 };
  var p2 = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1 };
  for (var i = 0; i < n; i++) {
    var o = i * 24;
    p0.x = d[o]; p0.y = d[o + 1]; p0.z = d[o + 2]; p0.u = d[o + 3]; p0.v = d[o + 4]; p0.r = d[o + 5]; p0.g = d[o + 6]; p0.b = d[o + 7];
    p1.x = d[o + 8]; p1.y = d[o + 9]; p1.z = d[o + 10]; p1.u = d[o + 11]; p1.v = d[o + 12]; p1.r = d[o + 13]; p1.g = d[o + 14]; p1.b = d[o + 15];
    p2.x = d[o + 16]; p2.y = d[o + 17]; p2.z = d[o + 18]; p2.u = d[o + 19]; p2.v = d[o + 20]; p2.r = d[o + 21]; p2.g = d[o + 22]; p2.b = d[o + 23];
    drawTri(p0, p1, p2, texs[i], mats[i], ds[i]);
  }
}

/* ------------------------------------------------------------------ input -- */
/* KEYP counts presses rather than latching a flag: a tap that begins and ends
   between two frames would otherwise be swallowed, which at 30fps is easy to
   do. Capped so a held cutscene does not bank a queue of inputs. */
var KEY = {}, KEYP = {};
function keyDown(c) { return !!KEY[c]; }
function keyHit(c) { if (KEYP[c] > 0) { KEYP[c]--; return true; } return false; }
function keyPress(c) { KEYP[c] = Math.min((KEYP[c] || 0) + 1, 3); }
function clearHits() { for (var k in KEYP) KEYP[k] = 0; }
