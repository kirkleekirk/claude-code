/* =========================================================================
   MEATLIGHT :: 50-validate.js
   Build-time placement checks. Runs in Node from validate.js and again in
   the browser at boot (results go to the console).

   The point of this file: a doorway that opens into a wall, a bin sunk into
   a cooker, or a camera bolted inside a pillar is very hard to spot once the
   scene is built and very cheap to catch from the data. Anything it reports
   as an ERROR fails the build.
   ========================================================================= */

var DOOR_CLEAR_SIDE = 0.30;   // widen the opening by this much when reserving floor
var DOOR_CLEAR_DEPTH = 0.90;  // how far the reserved strip reaches into each room
var EPS = 0.001;

function rectsOverlap(a, b, eps) {
  eps = eps || 0;
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

/* World AABB of a floor prop. Solid props are locked to 90-degree yaw so this
   is exact rather than a conservative bound. */
function propRect(p) {
  var def = PROP[p.t];
  var w = p.w !== undefined ? p.w : def.w;
  var d = p.d !== undefined ? p.d : def.d;
  var q = Math.abs(Math.round((p.yaw || 0) / (Math.PI / 2))) % 2;
  var ex = q === 1 ? d : w, ez = q === 1 ? w : d;
  return { x0: p.x - ex / 2, x1: p.x + ex / 2, z0: p.z - ez / 2, z1: p.z + ez / 2 };
}
function propHeight(p) { return p.h !== undefined ? p.h : PROP[p.t].h; }

/* The two floor strips a doorway reserves, one in each adjoining room. */
function doorClearRects(D) {
  var a = D.s0 - DOOR_CLEAR_SIDE, b = D.s1 + DOOR_CLEAR_SIDE, out = [];
  if (D.axis === 'z') {
    out.push({ x0: a, x1: b, z0: D.at - DOOR_CLEAR_DEPTH, z1: D.at });
    out.push({ x0: a, x1: b, z0: D.at, z1: D.at + DOOR_CLEAR_DEPTH });
  } else {
    out.push({ x0: D.at - DOOR_CLEAR_DEPTH, x1: D.at, z0: a, z1: b });
    out.push({ x0: D.at, x1: D.at + DOOR_CLEAR_DEPTH, z0: a, z1: b });
  }
  return out;
}

function validateLevel(log) {
  var errors = [], warns = [];
  function err(s) { errors.push(s); }
  function warn(s) { warns.push(s); }
  var id, i, j, R;

  /* ---- rooms ---------------------------------------------------------- */
  var roomIds = Object.keys(ROOMS);
  for (i = 0; i < roomIds.length; i++) {
    R = ROOMS[roomIds[i]];
    if (R.x1 <= R.x0 || R.z1 <= R.z0) err('room ' + roomIds[i] + ' has non-positive extent');
    if (R.h <= 2.2) err('room ' + roomIds[i] + ' ceiling ' + R.h + 'm is below door height');
    if (!ROOM_STYLE[roomIds[i]]) err('room ' + roomIds[i] + ' has no style entry');
    if (!PATROL_VIEWS[roomIds[i]]) err('room ' + roomIds[i] + ' has no patrol camera assignment');
  }
  for (i = 0; i < roomIds.length; i++) {
    for (j = i + 1; j < roomIds.length; j++) {
      if (rectsOverlap(ROOMS[roomIds[i]], ROOMS[roomIds[j]], EPS)) {
        err('rooms ' + roomIds[i] + ' and ' + roomIds[j] + ' overlap in plan');
      }
    }
  }

  /* ---- doorways ------------------------------------------------------- */
  for (i = 0; i < DOORS.length; i++) {
    var D = DOORS[i];
    var A = ROOMS[D.a], B = D.b === 'OUT' ? null : ROOMS[D.b];
    if (!A) { err(D.id + ': room ' + D.a + ' does not exist'); continue; }
    if (D.b !== 'OUT' && !B) { err(D.id + ': room ' + D.b + ' does not exist'); continue; }
    if (D.s1 <= D.s0) { err(D.id + ': span is inverted or zero'); continue; }
    if (D.h <= 1.8) err(D.id + ': opening height ' + D.h + 'm is impassable');

    /* the plane must be a real face of every room the door claims */
    var rooms = B ? [{ k: D.a, r: A }, { k: D.b, r: B }] : [{ k: D.a, r: A }];
    for (j = 0; j < rooms.length; j++) {
      var rr = rooms[j].r, key = rooms[j].k;
      var lo = D.axis === 'z' ? rr.z0 : rr.x0, hi = D.axis === 'z' ? rr.z1 : rr.x1;
      if (Math.abs(D.at - lo) > EPS && Math.abs(D.at - hi) > EPS) {
        err(D.id + ': plane ' + D.axis + '=' + D.at + ' is not a wall of ' + key +
            ' (' + D.axis + ' spans ' + lo + '..' + hi + ')');
      }
      var slo = D.axis === 'z' ? rr.x0 : rr.z0, shi = D.axis === 'z' ? rr.x1 : rr.z1;
      if (D.s0 < slo - EPS || D.s1 > shi + EPS) {
        err(D.id + ': span ' + D.s0 + '..' + D.s1 + ' falls outside wall of ' + key +
            ' (' + slo + '..' + shi + ')');
      }
      if (D.h > rr.h - EPS) {
        err(D.id + ': opening height ' + D.h + ' exceeds ceiling of ' + key + ' (' + rr.h + ')');
      }
    }
    /* the two rooms must actually touch along the shared span */
    if (B) {
      var ao = D.axis === 'z' ? [A.x0, A.x1] : [A.z0, A.z1];
      var bo = D.axis === 'z' ? [B.x0, B.x1] : [B.z0, B.z1];
      var ov0 = Math.max(ao[0], bo[0]), ov1 = Math.min(ao[1], bo[1]);
      if (ov1 - ov0 < EPS) err(D.id + ': ' + D.a + ' and ' + D.b + ' share no wall along this plane');
      else if (D.s0 < ov0 - EPS || D.s1 > ov1 + EPS) {
        err(D.id + ': span ' + D.s0 + '..' + D.s1 + ' is outside the shared overlap ' + ov0 + '..' + ov1);
      }
    }
    /* two openings must not be cut through each other */
    for (j = i + 1; j < DOORS.length; j++) {
      var E = DOORS[j];
      if (E.axis !== D.axis || Math.abs(E.at - D.at) > EPS) continue;
      var shares = (E.a === D.a || E.a === D.b || E.b === D.a || E.b === D.b);
      if (!shares) continue;
      if (D.s0 < E.s1 - EPS && E.s0 < D.s1 - EPS) err(D.id + ' and ' + E.id + ' overlap on the same wall');
    }
  }

  /* ---- floor props ---------------------------------------------------- */
  var byRoom = {};
  for (i = 0; i < PROPS.length; i++) {
    var p = PROPS[i], tag = p.room + '/' + p.t + '@' + p.x + ',' + p.z;
    if (!PROP[p.t]) { err(tag + ': unknown prop type "' + p.t + '"'); continue; }
    R = ROOMS[p.room];
    if (!R) { err(tag + ': unknown room'); continue; }
    var def = PROP[p.t], rect = propRect(p), hh = propHeight(p);

    if (def.solid) {
      var steps = (p.yaw || 0) / (Math.PI / 2);
      if (Math.abs(steps - Math.round(steps)) > 0.001) {
        err(tag + ': solid props must use 90-degree yaw steps (got ' + (p.yaw || 0).toFixed(3) + ')');
      }
    }
    if (rect.x0 < R.x0 - EPS || rect.x1 > R.x1 + EPS || rect.z0 < R.z0 - EPS || rect.z1 > R.z1 + EPS) {
      err(tag + ': footprint [' + rect.x0.toFixed(2) + '..' + rect.x1.toFixed(2) + ' , ' +
          rect.z0.toFixed(2) + '..' + rect.z1.toFixed(2) + '] escapes room ' + p.room +
          ' [' + R.x0 + '..' + R.x1 + ' , ' + R.z0 + '..' + R.z1 + ']');
    }
    if (hh > R.h + EPS) err(tag + ': is ' + hh + 'm tall in a ' + R.h + 'm room');
    if (p.y !== undefined && p.y + hh > R.h + EPS) err(tag + ': mounted at y=' + p.y + ' but pokes through the ceiling');

    (byRoom[p.room] = byRoom[p.room] || []).push({ p: p, rect: rect, def: def, tag: tag });
  }

  /* solid props may not intersect one another */
  for (id in byRoom) {
    var list = byRoom[id];
    for (i = 0; i < list.length; i++) {
      for (j = i + 1; j < list.length; j++) {
        if (!list[i].def.solid || !list[j].def.solid) continue;
        if (rectsOverlap(list[i].rect, list[j].rect, 0.02)) {
          err(list[i].tag + ' intersects ' + list[j].tag);
        }
      }
    }
  }

  /* nothing may stand in a doorway */
  for (i = 0; i < DOORS.length; i++) {
    var clears = doorClearRects(DOORS[i]);
    var sides = DOORS[i].b === 'OUT' ? [DOORS[i].a] : [DOORS[i].a, DOORS[i].b];
    for (var s = 0; s < sides.length; s++) {
      var lst = byRoom[sides[s]] || [];
      for (j = 0; j < lst.length; j++) {
        if (!lst[j].def.solid) continue;
        for (var c = 0; c < clears.length; c++) {
          if (!rectsOverlap(lst[j].rect, clears[c], 0.02)) continue;
          var R2 = ROOMS[sides[s]];
          if (!rectsOverlap(clears[c], R2, EPS)) continue;   // strip on the far side
          err(lst[j].tag + ' blocks doorway ' + DOORS[i].id);
        }
      }
    }
  }

  /* ---- wall fittings -------------------------------------------------- */
  for (i = 0; i < WALLPROPS.length; i++) {
    var wp = WALLPROPS[i], wtag = wp.room + '/' + wp.t + '@' + wp.wall + wp.s;
    if (!WALLPROP[wp.t]) { err(wtag + ': unknown wall prop "' + wp.t + '"'); continue; }
    R = ROOMS[wp.room];
    if (!R) { err(wtag + ': unknown room'); continue; }
    if ('NSEW'.indexOf(wp.wall) < 0) { err(wtag + ': bad wall side'); continue; }
    var wdef = WALLPROP[wp.t];
    var ww = wp.w !== undefined ? wp.w : wdef.w, wh = wp.h !== undefined ? wp.h : wdef.h;
    var rng = (wp.wall === 'S' || wp.wall === 'N') ? [R.x0, R.x1] : [R.z0, R.z1];
    if (wp.s - ww / 2 < rng[0] - EPS || wp.s + ww / 2 > rng[1] + EPS) {
      err(wtag + ': spans ' + (wp.s - ww / 2).toFixed(2) + '..' + (wp.s + ww / 2).toFixed(2) +
          ', past the end of the wall (' + rng[0] + '..' + rng[1] + ')');
    }
    if (wp.y < 0) err(wtag + ': mounted below the floor');
    if (wp.y + wh > R.h + EPS) err(wtag + ': top at ' + (wp.y + wh).toFixed(2) + 'm is through the ' + R.h + 'm ceiling');

    /* only a conflict if it would hang inside the opening itself; fittings
       above the header are fine, and that is where the exit signs live */
    var plane = wp.wall === 'S' ? R.z0 : wp.wall === 'N' ? R.z1 : wp.wall === 'W' ? R.x0 : R.x1;
    var ax = (wp.wall === 'S' || wp.wall === 'N') ? 'z' : 'x';
    for (j = 0; j < DOORS.length; j++) {
      var DD = DOORS[j];
      if (DD.axis !== ax || Math.abs(DD.at - plane) > EPS) continue;
      if (DD.a !== wp.room && DD.b !== wp.room) continue;
      var spanHit = (wp.s - ww / 2) < DD.s1 - EPS && DD.s0 < (wp.s + ww / 2) - EPS;
      var vertHit = wp.y < DD.h - EPS;
      if (spanHit && vertHit) err(wtag + ': hangs inside doorway ' + DD.id);
    }
  }

  /* ---- cameras -------------------------------------------------------- */
  for (i = 0; i < CAMS.length; i++) {
    var C = CAMS[i], ctag = C.id;
    R = ROOMS[C.room];
    if (!R) { err(ctag + ': unknown room ' + C.room); continue; }
    var px = C.pos[0], py = C.pos[1], pz = C.pos[2];
    if (px < R.x0 || px > R.x1 || pz < R.z0 || pz > R.z1) err(ctag + ': mounted outside room ' + C.room);
    if (py <= 0.2) err(ctag + ': mounted at floor level');
    if (py > R.h - 0.05) err(ctag + ': mounted at or above the ' + R.h + 'm ceiling');
    if (C.sees.indexOf(C.room) < 0) err(ctag + ': does not list its own room in sees[]');
    for (j = 0; j < C.sees.length; j++) if (!ROOMS[C.sees[j]]) err(ctag + ': sees unknown room ' + C.sees[j]);
    var dl = Math.abs(C.look[0] - px) + Math.abs(C.look[1] - py) + Math.abs(C.look[2] - pz);
    if (dl < 0.5) err(ctag + ': aim point is on top of the lens');
    /* a camera buried inside a solid prop sees nothing */
    var here = byRoom[C.room] || [];
    for (j = 0; j < here.length; j++) {
      if (!here[j].def.solid) continue;
      var rc = here[j].rect;
      if (px > rc.x0 && px < rc.x1 && pz > rc.z0 && pz < rc.z1 && py < propHeight(here[j].p)) {
        err(ctag + ': lens is inside ' + here[j].tag);
      }
    }
  }
  /* channel numbers must be unique -- the player types them */
  var seen = {};
  for (i = 0; i < CAMS.length; i++) {
    if (seen[CAMS[i].ch] !== undefined) err('duplicate camera channel ' + CAMS[i].ch);
    seen[CAMS[i].ch] = 1;
  }

  /* ---- patrol views --------------------------------------------------- */
  for (id in PATROL_VIEWS) {
    if (!ROOMS[id]) { err('PATROL_VIEWS references unknown room ' + id); continue; }
    var views = PATROL_VIEWS[id];
    for (i = 0; i < views.length; i++) {
      var vc = CAM_BY_ID[views[i].cam];
      if (!vc) { err('PATROL_VIEWS[' + id + ']: unknown camera ' + views[i].cam); continue; }
      if (vc.sees.indexOf(id) < 0) err('PATROL_VIEWS[' + id + ']: ' + views[i].cam + ' does not render ' + id);
    }
  }

  /* ---- reachability: every room must connect back to the office -------- */
  var adj = {}, k;
  for (k in ROOMS) adj[k] = [];
  for (i = 0; i < DOORS.length; i++) {
    if (DOORS[i].b === 'OUT') continue;
    adj[DOORS[i].a].push(DOORS[i].b);
    adj[DOORS[i].b].push(DOORS[i].a);
  }
  var seenR = { SEC: 1 }, stack = ['SEC'];
  while (stack.length) {
    var cur = stack.pop();
    for (i = 0; i < adj[cur].length; i++) if (!seenR[adj[cur][i]]) { seenR[adj[cur][i]] = 1; stack.push(adj[cur][i]); }
  }
  for (k in ROOMS) if (!seenR[k]) err('room ' + k + ' cannot be reached from the security office');

  var report = { errors: errors, warns: warns, ok: errors.length === 0 };
  if (log) {
    for (i = 0; i < errors.length; i++) log('  ERROR  ' + errors[i]);
    for (i = 0; i < warns.length; i++) log('  warn   ' + warns[i]);
  }
  return report;
}
