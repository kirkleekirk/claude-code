/* =========================================================================
   MEATLIGHT :: 90-game.js
   World construction, the two play modes, the script VM, and the CRT layer.
   ========================================================================= */

/* ------------------------------------------------------------ world state */
var CUR_CH = 0, QUAD = false, MODE = 'monitor';
var PA_USED = false, LINE3 = false, LOCKDOWN = false, CONSOLE_LOCKED = false;
var OVERRIDE = false, DALE_DEAD = false, SIX_VIS = false, SIX_HUNT = false;
var BURNING = false, EAST_DARK = false, GAME_OVER = null;
var HOOK_PHASE = 0, HOOK_LOADS = [0, 0, 0, 'meat', 0, 0, 'dark', 0, 0, 0, 0, 0], HOOK_WHO = 'DALE';
var CLOCK = '01:52', CLOCK_T = 0;
var OBJECTIVE = '', HINT = '';
var SHAKE = 0, STATIC_T = 0, GLITCH_T = 0, FADE = 1, FADE_TO = 1, FADE_SPD = 1, BLACK = false;
var ROOM_MESH = {}, DOORFRAME_MESH = null, DOORLEAF_MESH = null, DOORLEAF_DIRTY = true;
var PROP_RECTS = [];
var TIME = 0, FRAME = 0;

var EAST_ROOMS = { KIL: 1, COO: 1, CLD: 1, UTL: 1, INT: 1, REN: 1, CORB: 1 };
var EAST_CH = { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1 };

/* interaction points the script can require */
var USEPOINTS = {
  BREAKER:  { room: 'UTL', x: 18.00, z: 9.45, r: 2.0, label: 'THROW THE BREAKER' },
  MANIFEST: { room: 'COO', x: 33.60, z: 27.00, r: 2.4, label: 'READ THE BOARD' }
};

/* ------------------------------------------------------------------ NPCs */
var NPC = {
  DALE: { char: 'DALE', on: false, x: 0, y: 0, z: 0, yaw: 0, state: 'idle', path: null, pi: 0, spd: 1.35, seed: 1.0, gloves: true },
  SOL:  { char: 'SOL',  on: false, x: 0, y: 0, z: 0, yaw: 0, state: 'idle', path: null, pi: 0, spd: 1.45, seed: 2.3, follow: false },
  VOSK: { char: 'VOSK', on: false, x: 0, y: 0, z: 0, yaw: 0, state: 'idle', path: null, pi: 0, spd: 1.20, seed: 3.7 }
};
var SIX = { on: false, x: 0, y: 0, z: 0, yaw: 0, state: 'stand', path: null, pi: 0, spd: 1.5 };

function npcPlace(who, room, x, z, yaw) {
  var n = NPC[who]; n.on = true; n.x = x; n.z = z; n.y = 0; n.yaw = yaw || 0; n.path = null; n.room = room;
}
function npcState(who, s) { NPC[who].state = s; }
function npcFace(who, targetX) { var n = NPC[who]; n.yaw = targetX < n.x ? -Math.PI / 2 : Math.PI / 2; }
function npcHide(who) { NPC[who].on = false; NPC[who].path = null; }
function npcFollow(who, on) { NPC[who].follow = on; }
function npcWalk(who, pts, spd) {
  var n = NPC[who]; n.path = pts.slice(); n.pi = 0; n.on = true;
  if (spd) n.spd = spd;
  if (n.state !== 'run') n.state = 'walk';
}
function npcArrived(who) { var n = NPC[who]; return !n.path || n.pi >= n.path.length; }

function sixPlace(x, z, yaw) { SIX.on = true; SIX.x = x; SIX.z = z; SIX.yaw = yaw; SIX.path = null; }
function sixState(s) { SIX.state = s; }
function sixHide() { SIX.on = false; SIX.path = null; }
function sixWalk(pts) { SIX.path = pts.slice(); SIX.pi = 0; SIX.state = 'walk'; }

/* ------------------------------------------------------------- the player */
var PL = { x: 2.60, z: 4.40, yaw: 0, room: 'SEC', r: 0.30, moving: 0, stepT: 0, run: false };
/* Where Ray is when he is not on his feet: in the chair, on his own feed. */
var RAY_SEAT = { x: 2.40, z: 3.00, yaw: -Math.PI / 2, state: 'sit' };

/* ------------------------------------------------------------ door control */
function openDoor(id) {
  var D = DOOR_BY_ID[id]; if (!D) return false;
  D.open = true; D.locked = false; DOORLEAF_DIRTY = true; return true;
}
function shutDoor(id) { var D = DOOR_BY_ID[id]; if (!D) return; D.open = false; DOORLEAF_DIRTY = true; }
function lockdownAll() {
  for (var i = 0; i < DOORS.length; i++) { DOORS[i].open = false; DOORS[i].locked = true; }
  DOORLEAF_DIRTY = true;
}
function unlockPatrolDoors() {
  ['D_SEC', 'D_UTL', 'D_UTLC'].forEach(function (id) { openDoor(id); });
}
function killEastPower() { EAST_DARK = true; rebuildLighting(); }
function restoreEastPower() { EAST_DARK = false; rebuildLighting(); }

/* --------------------------------------------------------- world building */
function collectLights() {
  LIGHTS = [];
  for (var i = 0; i < PROPS.length; i++) {
    var p = PROPS[i];
    if (!p.light) continue;
    if (EAST_DARK && EAST_ROOMS[p.room]) continue;
    var y = p.y === undefined ? 2.7 : p.y;
    LIGHTS.push({ x: p.x, y: y - 0.06, z: p.z, r: p.light[0], g: p.light[1], b: p.light[2],
                  rad: p.light[3], i: p.light[4], room: p.room, prop: p });
  }
  /* under lockdown the emergency lamp on the kill floor comes up red */
  if (LOCKDOWN) LIGHTS.push({ x: 9, y: 6.5, z: 27, r: 0.62, g: 0.10, b: 0.08, rad: 16, i: 1.2, room: 'KIL' });
  if (BURNING) {
    LIGHTS.push({ x: 25, y: 3.0, z: 26, r: 1.10, g: 0.44, b: 0.14, rad: 22, i: 1.6, room: 'COO' });
    LIGHTS.push({ x: 9,  y: 3.0, z: 27, r: 0.90, g: 0.36, b: 0.12, rad: 20, i: 1.2, room: 'KIL' });
  }
}

function buildRoom(id) {
  var R = ROOMS[id], S = ROOM_STYLE[id];
  var m = newMesh();
  var conf = { x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, h: R.h,
               floor: TEX[S.floor], ceil: TEX[S.ceil], wall: TEX[S.wall] };
  AMBIENT.r = S.amb[0]; AMBIENT.g = S.amb[1]; AMBIENT.b = S.amb[2];
  if (EAST_DARK && EAST_ROOMS[id]) { AMBIENT.r *= 0.30; AMBIENT.g *= 0.30; AMBIENT.b *= 0.34; }
  if (LOCKDOWN && !EAST_DARK) { AMBIENT.r *= 1.06; AMBIENT.g *= 0.9; AMBIENT.b *= 0.88; }

  buildFloorCeil(m, conf);
  buildWalls(m, id, conf);

  for (var i = 0; i < PROPS.length; i++) {
    var p = PROPS[i]; if (p.room !== id) continue;
    var def = PROP[p.t];
    var inst = { x: p.x, z: p.z, yaw: p.yaw || 0,
                 w: p.w !== undefined ? p.w : def.w,
                 d: p.d !== undefined ? p.d : def.d,
                 h: p.h !== undefined ? p.h : def.h,
                 y: p.y, r: p.r, full: p.full, dark: p.dark, top: p.top,
                 rise: p.rise, dead: p.dead || (EAST_DARK && EAST_ROOMS[id] && p.light) };
    def.build(m, inst);
  }
  for (var w = 0; w < WALLPROPS.length; w++) {
    var wp = WALLPROPS[w]; if (wp.room !== id) continue;
    var wdef = WALLPROP[wp.t];
    var winst = { wall: wp.wall, s: wp.s, y: wp.y, tex: wp.tex, aim: wp.aim,
                  w: wp.w !== undefined ? wp.w : wdef.w,
                  h: wp.h !== undefined ? wp.h : wdef.h,
                  dead: EAST_DARK && EAST_ROOMS[id] };
    wdef.build(m, conf, winst);
  }
  return sealMesh(m);
}

function buildWorld() {
  collectLights();
  for (var id in ROOMS) ROOM_MESH[id] = buildRoom(id);
  var fm = newMesh(); AMBIENT.r = 0.14; AMBIENT.g = 0.15; AMBIENT.b = 0.16;
  buildDoorFrames(fm); DOORFRAME_MESH = sealMesh(fm);
  rebuildLeaves();
  /* collision: solid prop footprints, flattened once */
  PROP_RECTS = [];
  for (var i = 0; i < PROPS.length; i++) {
    var p = PROPS[i]; if (!PROP[p.t].solid) continue;
    var rc = propRect(p); rc.room = p.room; PROP_RECTS.push(rc);
  }
}
function rebuildLeaves() {
  var lm = newMesh(); AMBIENT.r = 0.16; AMBIENT.g = 0.17; AMBIENT.b = 0.18;
  buildDoorLeaves(lm); DOORLEAF_MESH = sealMesh(lm); DOORLEAF_DIRTY = false;
}
function rebuildLighting() {
  collectLights();
  for (var id in ROOMS) ROOM_MESH[id] = buildRoom(id);
}

/* ------------------------------------------------------------- collision */
function roomContaining(x, z) {
  for (var id in ROOMS) {
    var R = ROOMS[id];
    if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) return id;
  }
  return null;
}
/* Is the point far enough from a wall, or standing in an opening that is up? */
function wallOK(R, plane, axis, dist, lateral, r) {
  if (dist >= r) return true;
  for (var i = 0; i < DOORS.length; i++) {
    var D = DOORS[i];
    if (D.axis !== axis || Math.abs(D.at - plane) > 0.01) continue;
    if (!D.open) continue;
    if (lateral > D.s0 + r && lateral < D.s1 - r) return true;
  }
  return false;
}
function freeAt(x, z, r) {
  var id = roomContaining(x, z);
  if (!id) return false;
  var R = ROOMS[id];
  if (!wallOK(R, R.z0, 'z', z - R.z0, x, r)) return false;
  if (!wallOK(R, R.z1, 'z', R.z1 - z, x, r)) return false;
  if (!wallOK(R, R.x0, 'x', x - R.x0, z, r)) return false;
  if (!wallOK(R, R.x1, 'x', R.x1 - x, z, r)) return false;
  for (var i = 0; i < PROP_RECTS.length; i++) {
    var q = PROP_RECTS[i];
    if (x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) return false;
  }
  return true;
}
function moveActor(a, dx, dz) {
  if (dx !== 0 && freeAt(a.x + dx, a.z, a.r || 0.3)) a.x += dx;
  if (dz !== 0 && freeAt(a.x, a.z + dz, a.r || 0.3)) a.z += dz;
  var rm = roomContaining(a.x, a.z); if (rm) a.room = rm;
}

/* --------------------------------------------------------------- cameras */
function camFor(ch) { for (var i = 0; i < CAMS.length; i++) if (CAMS[i].ch === ch) return CAMS[i]; return CAMS[0]; }
function camDead(ch) { return EAST_DARK && EAST_CH[ch]; }
function patrolCam() {
  var views = PATROL_VIEWS[PL.room] || [{ cam: 'CAM01' }];
  for (var i = 0; i < views.length; i++) {
    var v = views[i];
    if (v.xmax !== undefined && PL.x > v.xmax) continue;
    if (v.zmax !== undefined && PL.z > v.zmax) continue;
    return CAM_BY_ID[v.cam];
  }
  return CAM_BY_ID[views[views.length - 1].cam];
}

/* ------------------------------------------------------------- rendering */
var DYN = newMesh();
function resetDyn() { DYN.data.length = 0; DYN.texs.length = 0; DYN.mats.length = 0; DYN.dbl.length = 0; DYN.count = 0; }

function drawDynamics(cam) {
  resetDyn();
  var sees = {}; for (var i = 0; i < cam.sees.length; i++) sees[cam.sees[i]] = 1;

  if (sees.KIL) {
    drawHookLine(DYN, { x0: 1.4, x1: 18.6, z: 30.0, y: 4.30, count: 12,
      phase: HOOK_PHASE, speed: LINE3 ? 1 : 0, loads: HOOK_LOADS, who: HOOK_WHO, t: TIME, faceYaw: 0.4 });
  }
  for (var k in NPC) {
    var n = NPC[k];
    if (!n.on) continue;
    if (!sees[roomContaining(n.x, n.z)]) continue;
    drawHumanoid(DYN, { char: n.char, x: n.x, y: n.y, z: n.z, yaw: n.yaw,
      state: n.state, t: TIME, seed: n.seed, gloves: n.gloves });
  }
  if (SIX.on && SIX_VIS) {
    var sr = roomContaining(SIX.x, SIX.z);
    if (sees[sr]) drawSix(DYN, { x: SIX.x, y: SIX.y, z: SIX.z, yaw: SIX.yaw, state: SIX.state, t: TIME });
  }
  if (MODE === 'patrol') {
    if (sees[PL.room]) drawHumanoid(DYN, { char: 'RAY', x: PL.x, y: 0, z: PL.z, yaw: PL.yaw,
      state: PL.moving > 0.2 ? (PL.run ? 'run' : 'walk') : 'idle', t: PL.stepT, seed: 0.5 });
  } else if (RAY_SEAT && sees.SEC) {
    drawHumanoid(DYN, { char: 'RAY', x: RAY_SEAT.x, y: 0, z: RAY_SEAT.z, yaw: RAY_SEAT.yaw,
      state: RAY_SEAT.state, t: TIME, seed: 0.5 });
  }
  var d = DYN.data;
  DYN.data = new Float32Array(d);
  drawMesh(DYN);
  DYN.data = d;
}

function renderFeed(cam, vx, vy, vw, vh, dead) {
  setViewport(vx, vy, vw, vh);
  if (dead) { clearViewport(6, 6, 7); return; }
  var f = cam.fog;
  setFog(f[0], f[1], f[2], f[3], f[4]);
  if (BURNING && (cam.room === 'COO' || cam.room === 'KIL')) setFog(46, 16, 6, 2, 22);
  clearViewport(f[0], f[1], f[2]);
  bindCam(makeCam(v3(cam.pos[0], cam.pos[1], cam.pos[2]),
                  v3(cam.look[0], cam.look[1], cam.look[2]), cam.fov));
  for (var i = 0; i < cam.sees.length; i++) {
    var mm = ROOM_MESH[cam.sees[i]];
    if (mm) drawMesh(mm);
  }
  drawMesh(DOORFRAME_MESH);
  drawMesh(DOORLEAF_MESH);
  drawDynamics(cam);
}

/* --------------------------------------------------- CRT / VHS post pass */
var VIGN = null;
function buildVignette() {
  VIGN = new Float32Array(VW * VH);
  for (var y = 0; y < VH; y++) for (var x = 0; x < VW; x++) {
    var dx = (x / VW - 0.5) * 2.15, dy = (y / VH - 0.5) * 2.15;
    var d = Math.sqrt(dx * dx + dy * dy);
    VIGN[y * VW + x] = clamp(1.12 - d * d * 0.44, 0.18, 1.0);
  }
}
function postProcess(dt) {
  var i, x, y, o;
  var noise = 0.055 + (STATIC_T > 0 ? 0.55 : 0) + (MODE === 'patrol' ? 0.02 : 0);
  var trackY = ((TIME * 46) % (VH + 90)) - 45;
  var glitch = GLITCH_T > 0;

  for (y = 0; y < VH; y++) {
    var row = y * VW;
    var scan = (y & 1) ? 0.80 : 1.0;
    var near = Math.abs(y - trackY);
    var track = near < 5 ? (1 - near / 5) : 0;
    var shift = 0;
    if (glitch && hash2(y, (TIME * 20) | 0) > 0.86) shift = ((hash2(y, 7) - 0.5) * 26) | 0;
    else if (track > 0.2) shift = ((hash2(y, 3) - 0.5) * 9 * track) | 0;

    if (shift !== 0) {
      var tmp = COLBUF.slice(row, row + VW);
      for (x = 0; x < VW; x++) {
        var sx = x - shift; if (sx < 0) sx += VW; else if (sx >= VW) sx -= VW;
        COLBUF[row + x] = tmp[sx];
      }
    }
    for (x = 0; x < VW; x++) {
      o = row + x;
      var c = COLBUF[o];
      var r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      var k = scan * VIGN[o];
      /* chroma bleed: pull red from the left, blue from the right */
      if (x > 1 && x < VW - 2) {
        var cl = COLBUF[o - 2], cr = COLBUF[o + 2];
        r = (r * 3 + (cl & 255)) >> 2;
        b = (b * 3 + ((cr >> 16) & 255)) >> 2;
      }
      var n = (hash2(x + ((TIME * 900) | 0), y * 3 + FRAME) - 0.5) * 255 * noise;
      if (track > 0) { var tw = track * 90; r += tw; g += tw; b += tw; }
      r = r * k + n; g = g * k + n; b = b * k + n;
      /* the plant's cameras are cheap: green-biased, crushed blacks */
      g *= 1.045; b *= 0.94;
      if (STATIC_T > 0) {
        var s = hash2(x * 7 + FRAME * 13, y * 5 + FRAME * 3) * 255;
        r = lerp(r, s, 0.86); g = lerp(g, s, 0.86); b = lerp(b, s, 0.86);
      }
      if (FADE > 0) { var fk = 1 - FADE; r *= fk; g *= fk; b *= fk; }
      COLBUF[o] = 0xFF000000 |
        ((b < 0 ? 0 : b > 255 ? 255 : b | 0) << 16) |
        ((g < 0 ? 0 : g > 255 ? 255 : g | 0) << 8) |
        (r < 0 ? 0 : r > 255 ? 255 : r | 0);
    }
  }
}
