/* =========================================================================
   MEATLIGHT :: 95-loop.js
   Script VM, HUD, input, and the frame loop.
   ========================================================================= */

/* --------------------------------------------------------------- friendly
   names for the door panel -- the player picks doors by these             */
var DOOR_NAME = {
  D_FRONT: 'FRONT ENTRANCE',      D_SEC:  'SECURITY OFFICE',
  D_BRK:   'BREAK ROOM',          D_LOK:  'LOCKER ROOM',
  D_OFF:   'FRONT OFFICE',        D_REN:  'RENDER PIT',
  D_CORB:  'CORRIDOR B ARCH',     D_UTL:  'PUMP HOUSE',
  D_INT:   'INTAKE BAY',          D_RENB: 'RENDER / CORR B',
  D_UTLB:  'CORR B / PUMP HOUSE', D_UTLI: 'PUMP HOUSE / INTAKE',
  D_KILB:  'CORR B / KILL FLOOR', D_RENK: 'RENDER / KILL FLOOR',
  D_UTLK:  'PUMP HOUSE / FLOOR',  D_UTLC: 'PUMP HOUSE / COOKERS',
  D_KILC:  'FLOOR / COOKERS',     D_CLD:  'COLD STORAGE',
  D_DOCK:  'DOCK SHUTTER',        D_BAY:  'INTAKE BAY 2 (EXT)'
};
var SPEAKER = {
  RAY:  { c: '#a8c8de', n: 'RAY' },
  DALE: { c: '#e0b070', n: 'DALE' },
  SOL:  { c: '#ef8a3a', n: 'SOL' },
  VOSK: { c: '#c6ccd4', n: 'VOSK' }
};

/* ---------------------------------------------------------------- the VM */
var SC = { i: 0, mode: 'run', t: 0, data: null, labels: {} };
var DLG = null;          // {who, tx, shown, radio, pa, hold, done}
var PANEL = null;        // door panel state
var DOCVIEW = null, TITLECARD = null, CHOICE = null, ENDCARD = null;

function indexLabels() {
  for (var i = 0; i < SCRIPT.length; i++) if (SCRIPT[i].s === 'label') SC.labels[SCRIPT[i].id] = i;
}
function jumpTo(id) { if (SC.labels[id] !== undefined) { SC.i = SC.labels[id]; SC.mode = 'run'; } }

function say(step) {
  DLG = { who: step.who, tx: step.tx, shown: 0, radio: step.s === 'rad', pa: step.s === 'pa',
          hold: 0, done: false, blip: 0 };
  if (step.s === 'rad') sfx('radioOn');
  if (step.s === 'pa') { /* chime is fired by the script where it wants one */ }
}

function runStep() {
  if (SC.i >= SCRIPT.length) { SC.mode = 'idle'; return; }
  var st = SCRIPT[SC.i];
  switch (st.s) {
    case 'say': case 'rad': case 'pa':
      say(st); SC.mode = 'dlg'; return;
    case 'wait':  SC.mode = 'wait'; SC.t = st.t; return;
    case 'fn':    st.f(); break;
    case 'cam':   CUR_CH = st.ch; sfx('camSwitch'); break;
    case 'obj':   OBJECTIVE = st.tx; break;
    case 'hint':  HINT = st.tx; break;
    case 'sfx':   sfx(st.n); break;
    case 'shake': SHAKE = Math.max(SHAKE, st.a); break;
    case 'glitch': GLITCH_T = st.t; break;
    case 'static': STATIC_T = st.t; break;
    case 'clock': CLOCK = st.to; break;
    case 'black': BLACK = st.on; break;
    case 'fade':  FADE_TO = st.to; FADE_SPD = st.t > 0 ? 1 / st.t : 100; break;
    case 'label': break;
    case 'goto':  jumpTo(st.id); return;
    case 'title': TITLECARD = { tx: st.tx, sub: st.sub, t: 0 }; SC.mode = 'title'; clearHits(); return;
    case 'doc':   DOCVIEW = { title: st.title, body: st.body, t: 0 }; SC.mode = 'doc'; clearHits(); return;
    case 'end':   ENDCARD = { id: st.id, body: st.body, t: 0 }; GAME_OVER = st.id; SC.mode = 'end'; clearHits(); return;
    case 'choice':
      CHOICE = { q: st.q, opts: st.opts, sel: 0, t: 0 }; SC.mode = 'choice'; clearHits(); return;
    case 'mode':
      MODE = st.m;
      if (st.at) { PL.x = st.at.x; PL.z = st.at.z; PL.yaw = st.at.yaw || 0; PL.room = st.at.room; }
      break;
    case 'until':  SC.mode = 'until'; SC.t = 0; SC.data = st; return;
    case 'needdoor': SC.mode = 'needdoor'; SC.t = 0; SC.data = st; return;
    case 'walk':
      npcWalk(st.who, st.to, st.speed);
      if (st.wait) { SC.mode = 'walkwait'; SC.data = st; return; }
      break;
    case 'reach': SC.mode = 'reach'; SC.data = st; return;
    case 'use':   SC.mode = 'use'; SC.data = st; return;
  }
  SC.i++;
}

function updateScript(dt) {
  switch (SC.mode) {
    case 'run': runStep(); break;

    case 'dlg':
      if (!DLG) { SC.mode = 'run'; break; }
      if (!DLG.done) {
        DLG.shown += dt * 42;
        DLG.blip += dt * 42;
        while (DLG.blip >= 3) { DLG.blip -= 3; if (DLG.shown < DLG.tx.length) blip(DLG.pa ? 'PA' : DLG.who); }
        if (keyHit('Space') || keyHit('Enter')) DLG.shown = DLG.tx.length;
        if (DLG.shown >= DLG.tx.length) { DLG.shown = DLG.tx.length; DLG.done = true; DLG.hold = 0; }
      } else {
        DLG.hold += dt;
        var need = 0.85 + DLG.tx.length * 0.030;
        if (DLG.hold > need || keyHit('Space') || keyHit('Enter')) {
          if (DLG.radio) sfx('radioOff');
          DLG = null; SC.i++; SC.mode = 'run';
        }
      }
      break;

    case 'wait':
      SC.t -= dt; if (SC.t <= 0) { SC.i++; SC.mode = 'run'; }
      break;

    case 'until':
      SC.t += dt;
      if (SC.data.f()) { SC.i++; SC.mode = 'run'; break; }
      if (SC.data.nagAt && SC.t > SC.data.nagAt) {
        SC.data.nagAt = null;
        say({ s: 'rad', who: SC.data.nag.who, tx: SC.data.nag.tx });
        SC.mode = 'dlgnag';
      }
      break;

    case 'needdoor':
      SC.t += dt;
      var D = DOOR_BY_ID[SC.data.id];
      if (SC.data.fail) {
        if (SC.t > (SC.data.failAfter || 2.5)) { SC.i++; SC.mode = 'run'; }
        break;
      }
      if (D && D.open) { sfx('doorBuzz'); SC.i++; SC.mode = 'run'; break; }
      if (SC.data.nag) {
        for (var q = 0; q < SC.data.nag.length; q++) {
          var g = SC.data.nag[q];
          if (!g.fired && SC.t > g.t) {
            g.fired = true;
            say({ s: 'rad', who: g.who, tx: g.tx });
            SC.mode = 'dlgnag';
            break;
          }
        }
      }
      break;

    /* a nag line plays without consuming the blocking step underneath it */
    case 'dlgnag':
      if (!DLG) { SC.mode = SC.data && SC.data.s === 'needdoor' ? 'needdoor' : 'until'; break; }
      if (!DLG.done) {
        DLG.shown += dt * 42; DLG.blip += dt * 42;
        while (DLG.blip >= 3) { DLG.blip -= 3; if (DLG.shown < DLG.tx.length) blip(DLG.who); }
        if (keyHit('Space')) DLG.shown = DLG.tx.length;
        if (DLG.shown >= DLG.tx.length) { DLG.done = true; DLG.hold = 0; }
      } else {
        DLG.hold += dt;
        if (DLG.hold > 1.0 + DLG.tx.length * 0.028 || keyHit('Space')) {
          sfx('radioOff'); DLG = null;
          SC.mode = (SC.data && SC.data.s === 'needdoor') ? 'needdoor' : 'until';
        }
      }
      break;

    case 'walkwait':
      if (npcArrived(SC.data.who)) { SC.i++; SC.mode = 'run'; }
      break;

    case 'reach':
      var dx = PL.x - SC.data.x, dz = PL.z - SC.data.z;
      if (PL.room === SC.data.room && Math.sqrt(dx * dx + dz * dz) < SC.data.r) { SC.i++; SC.mode = 'run'; }
      break;

    case 'use':
      var up = USEPOINTS[SC.data.tag];
      if (up && nearUse(up) && keyHit('KeyE')) { sfx('uiSelect'); SC.i++; SC.mode = 'run'; }
      break;

    case 'title':
      TITLECARD.t += dt;
      if (TITLECARD.t > 3.6 || keyHit('Space') || keyHit('Enter')) { TITLECARD = null; SC.i++; SC.mode = 'run'; }
      break;

    case 'doc':
      DOCVIEW.t += dt;
      if (DOCVIEW.t > 0.4 && (keyHit('Space') || keyHit('Enter') || keyHit('Escape'))) { DOCVIEW = null; SC.i++; SC.mode = 'run'; }
      break;

    case 'choice':
      CHOICE.t += dt;
      if (keyHit('ArrowUp') || keyHit('KeyW')) { CHOICE.sel = (CHOICE.sel + CHOICE.opts.length - 1) % CHOICE.opts.length; sfx('uiMove'); }
      if (keyHit('ArrowDown') || keyHit('KeyS')) { CHOICE.sel = (CHOICE.sel + 1) % CHOICE.opts.length; sfx('uiMove'); }
      /* a short lockout so a mashed key cannot pick the ending for you */
      if (CHOICE.t > 0.5 && (keyHit('Enter') || keyHit('Space'))) {
        var go = CHOICE.opts[CHOICE.sel].go; CHOICE = null; sfx('uiSelect'); jumpTo(go);
      }
      break;

    case 'end':
      ENDCARD.t += dt;
      break;
  }
}

function nearUse(up) {
  if (MODE !== 'patrol' || PL.room !== up.room) return false;
  var dx = PL.x - up.x, dz = PL.z - up.z;
  return Math.sqrt(dx * dx + dz * dz) < up.r;
}
function activeUse() {
  if (SC.mode !== 'use') return null;
  var up = USEPOINTS[SC.data.tag];
  return (up && nearUse(up)) ? up : null;
}

/* ------------------------------------------------------------ NPC motion */
function stepPath(a, dt) {
  if (!a.path || a.pi >= a.path.length) { a.path = null; return false; }
  var tgt = a.path[a.pi];
  var dx = tgt[0] - a.x, dz = tgt[1] - a.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.16) { a.pi++; if (a.pi >= a.path.length) { a.path = null; if (a.state === 'walk' || a.state === 'run') a.state = 'idle'; } return true; }
  var v = a.spd * dt;
  a.x += (dx / d) * v; a.z += (dz / d) * v;
  a.yaw = Math.atan2(dx, dz);
  return true;
}

function updateNPCs(dt) {
  for (var k in NPC) {
    var n = NPC[k];
    if (!n.on) continue;
    if (n.follow) {
      var dx = PL.x - n.x, dz = PL.z - n.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1.9) {
        var v = Math.min(3.4, 1.2 + d * 0.7) * dt;
        var nx = n.x + (dx / d) * v, nz = n.z + (dz / d) * v;
        if (freeAt(nx, nz, 0.3)) { n.x = nx; n.z = nz; }
        n.yaw = Math.atan2(dx, dz);
        n.state = d > 3.2 ? 'run' : 'walk';
      } else n.state = 'scared';
      continue;
    }
    stepPath(n, dt);
  }

  if (SIX.on) {
    if (SIX_HUNT) {
      var px = PL.x - SIX.x, pz = PL.z - SIX.z, pd = Math.sqrt(px * px + pz * pz);
      SIX.yaw = Math.atan2(px, pz);
      if (pd > 1.7) {
        var sv = 2.15 * dt;
        var sx = SIX.x + (px / pd) * sv, sz = SIX.z + (pz / pd) * sv;
        if (freeAt(sx, sz, 0.42)) { SIX.x = sx; SIX.z = sz; }
        else { /* squeeze along whichever axis is clear */
          if (freeAt(sx, SIX.z, 0.42)) SIX.x = sx;
          else if (freeAt(SIX.x, sz, 0.42)) SIX.z = sz;
        }
        SIX.state = pd > 5 ? 'charge' : 'walk';
      } else {
        SIX.state = 'charge';
        if (SIX.grabCd === undefined || SIX.grabCd <= 0) { sixGrab(); SIX.grabCd = 3.0; }
      }
      if (SIX.grabCd > 0) SIX.grabCd -= dt;
      if (pd < 9 && (SIX.breathT === undefined || SIX.breathT <= 0)) { sfx('breath'); SIX.breathT = 1.6 + rnd(); }
      if (SIX.breathT > 0) SIX.breathT -= dt;
    } else {
      stepPath(SIX, dt);
    }
  }
}

/* Not a fail state -- the story is linear. It costs you ground and nerve. */
function sixGrab() {
  sfx('stinger'); sfx('heart');
  STATIC_T = 0.55; SHAKE = 1.8; GLITCH_T = 0.7;
  var dx = PL.x - SIX.x, dz = PL.z - SIX.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  for (var i = 0; i < 24; i++) {
    var nx = PL.x + (dx / d) * 0.22, nz = PL.z + (dz / d) * 0.22;
    if (!freeAt(nx, nz, PL.r)) break;
    PL.x = nx; PL.z = nz;
  }
  var rm = roomContaining(PL.x, PL.z); if (rm) PL.room = rm;
}

/* ------------------------------------------------------------ the player */
function updatePlayer(dt) {
  if (MODE !== 'patrol') { PL.moving = 0; return; }
  var cam = patrolCam();

  /* Movement is relative to the lens: up is "away from the camera". When the
     camera cuts to a new angle mid-stride the mapping would otherwise invert
     under the player's thumb, so the old basis is held until they let go --
     the same grace fixed-camera games of the era used. */
  var fx = cam.look[0] - cam.pos[0], fz = cam.look[2] - cam.pos[2];
  var fl = Math.sqrt(fx * fx + fz * fz) || 1; fx /= fl; fz /= fl;

  var ix = 0, iz = 0;
  if (keyDown('KeyW') || keyDown('ArrowUp')) iz += 1;
  if (keyDown('KeyS') || keyDown('ArrowDown')) iz -= 1;
  if (keyDown('KeyA') || keyDown('ArrowLeft')) ix -= 1;
  if (keyDown('KeyD') || keyDown('ArrowRight')) ix += 1;
  var held = (ix !== 0 || iz !== 0);

  if (PL.camId !== cam.id) {
    if (held && !PL.heldBasis) PL.heldBasis = [PL.fx || fx, PL.fz || fz];
    PL.camId = cam.id;
  }
  if (PL.heldBasis) {
    if (!held) PL.heldBasis = null;
    else { fx = PL.heldBasis[0]; fz = PL.heldBasis[1]; }
  }
  PL.fx = fx; PL.fz = fz;
  var rx = -fz, rz = fx;
  PL.run = keyDown('ShiftLeft') || keyDown('ShiftRight');

  var mag = Math.sqrt(ix * ix + iz * iz);
  if (mag > 0.01) {
    ix /= mag; iz /= mag;
    var wx = fx * iz + rx * ix, wz = fz * iz + rz * ix;
    var spd = (PL.run ? 3.35 : 2.05) * dt;
    var dx = wx * spd, dz = wz * spd;
    if (dx !== 0 && freeAt(PL.x + dx, PL.z, PL.r)) PL.x += dx;
    if (dz !== 0 && freeAt(PL.x, PL.z + dz, PL.r)) PL.z += dz;
    var rm = roomContaining(PL.x, PL.z); if (rm) PL.room = rm;
    PL.yaw = Math.atan2(wx, wz);
    PL.moving = 1;
    PL.stepT += dt * (PL.run ? 1.6 : 1.0);
    PL.stepAcc = (PL.stepAcc || 0) + dt * (PL.run ? 5.6 : 3.4);
    if (PL.stepAcc > 1) {
      PL.stepAcc -= 1;
      sfx(PL.room === 'KIL' || PL.room === 'COO' || PL.room === 'REN' ? 'stepWet' : 'step');
    }
  } else { PL.moving = 0; PL.stepT += dt * 0.6; }
}

/* --------------------------------------------------------- console input */
function cycleCam(dir) {
  var chs = CAMS.map(function (c) { return c.ch; }).sort(function (a, b) { return a - b; });
  var i = chs.indexOf(CUR_CH);
  CUR_CH = chs[(i + dir + chs.length) % chs.length];
  sfx('camSwitch');
}
function updateConsole() {
  if (MODE !== 'monitor') return;
  if (PANEL) {
    var list = PANEL.list;
    if (keyHit('ArrowUp') || keyHit('KeyW')) { PANEL.sel = (PANEL.sel + list.length - 1) % list.length; sfx('uiMove'); }
    if (keyHit('ArrowDown') || keyHit('KeyS')) { PANEL.sel = (PANEL.sel + 1) % list.length; sfx('uiMove'); }
    if (keyHit('Enter') || keyHit('Space')) {
      var D = list[PANEL.sel];
      if (CONSOLE_LOCKED) { sfx('uiDeny'); PANEL.err = 'OVERRIDE SUSPENDED AT CONSOLE'; PANEL.errT = 2.2; }
      else if (D.kind === 'rollup' && D.id === 'D_BAY' && !OVERRIDE && !GAME_OVER) {
        sfx('uiDeny'); PANEL.err = 'EXTERIOR SHUTTER — SUPERVISOR KEY REQUIRED'; PANEL.errT = 2.2;
      } else {
        D.open = !D.open; if (D.open) D.locked = false;
        DOORLEAF_DIRTY = true;
        sfx(D.open ? 'doorOpen' : 'doorShut');
      }
    }
    if (keyHit('KeyD') || keyHit('Escape')) { PANEL = null; sfx('uiMove'); }
    return;
  }
  for (var n = 0; n <= 9; n++) {
    if (keyHit('Digit' + n)) { CUR_CH = n; sfx('camSwitch'); }
  }
  if (keyHit('Minus')) { CUR_CH = 10; sfx('camSwitch'); }
  if (keyHit('Equal')) { CUR_CH = 11; sfx('camSwitch'); }
  if (keyHit('BracketLeft')) { CUR_CH = 12; sfx('camSwitch'); }
  if (keyHit('BracketRight')) { CUR_CH = 13; sfx('camSwitch'); }
  if (keyHit('ArrowRight')) cycleCam(1);
  if (keyHit('ArrowLeft')) cycleCam(-1);
  if (keyHit('KeyQ')) { QUAD = !QUAD; sfx('camSwitch'); }
  if (keyHit('KeyD')) {
    PANEL = { sel: 0, list: DOORS.filter(function (d) { return d.id !== 'D_FRONT'; }) };
    sfx('uiSelect');
  }
  if (keyHit('KeyP')) { PA_USED = true; sfx('paChime'); }
}

/* ------------------------------------------------------------------ HUD  */
var CV, CTX, SMALL, SCTX, IMG;

function hudFont(px, bold) { CTX.font = (bold ? 'bold ' : '') + px + 'px "Courier New", monospace'; }
function shadowText(s, x, y, col, px, bold, align) {
  hudFont(px, bold);
  CTX.textAlign = align || 'left';
  CTX.fillStyle = 'rgba(0,0,0,0.85)';
  CTX.fillText(s, x + 2, y + 2);
  CTX.fillStyle = col;
  CTX.fillText(s, x, y);
}
function wrapText(tx, maxChars) {
  var words = tx.split(' '), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    if ((cur + ' ' + words[i]).trim().length > maxChars) { lines.push(cur.trim()); cur = words[i]; }
    else cur += ' ' + words[i];
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function drawHUD(W, H) {
  var pad = Math.round(W * 0.028);
  var fs = Math.max(11, Math.round(H * 0.026));

  if (!TITLECARD && !ENDCARD) {
    /* --- top status strip --- */
    var cam = MODE === 'patrol' ? patrolCam() : camFor(CUR_CH);
    var dead = MODE === 'monitor' && camDead(CUR_CH);
    CTX.fillStyle = 'rgba(0,0,0,0.35)';
    CTX.fillRect(0, 0, W, fs * 2.5);
    var chTxt = 'CH' + (cam.ch < 10 ? '0' : '') + cam.ch;
    shadowText(chTxt + '  ' + cam.label, pad, fs * 1.5, dead ? '#7a4444' : '#c8ddc8', fs, true);
    shadowText('VOSK & SONS  PLANT 2', W - pad, fs * 1.5, '#7e8a7e', fs, false, 'right');

    /* blinking record dot + running timestamp */
    var blinkOn = (TIME % 1.6) < 1.0;
    if (blinkOn && !dead) {
      CTX.fillStyle = '#d03028';
      CTX.beginPath(); CTX.arc(pad + fs * 0.4, fs * 2.9 + fs * 0.4, fs * 0.34, 0, 6.3); CTX.fill();
    }
    shadowText('REC  06 FEB 1998  ' + CLOCK + ':' + ('0' + ((TIME * 4) % 60 | 0)).slice(-2),
      pad + fs * 1.1, fs * 3.35, dead ? '#6a5a5a' : '#b9c9b9', fs * 0.85);

    if (dead) shadowText('NO SIGNAL', W / 2, H / 2, '#8a4a44', fs * 1.9, true, 'center');

    /* --- channel strip (monitor only) --- */
    if (MODE === 'monitor' && !PANEL && !QUAD) {
      var bx = W - pad - fs * 11.3, by = fs * 4.6;
      CTX.fillStyle = 'rgba(0,0,0,0.42)';
      CTX.fillRect(bx - fs * 0.5, by - fs * 1.1, fs * 11.9, fs * 1.35 * CAMS.length + fs * 0.8);
      for (var i = 0; i < CAMS.length; i++) {
        var c = CAMS[i], sel = c.ch === CUR_CH, dd = camDead(c.ch);
        shadowText((sel ? '>' : ' ') + (c.ch < 10 ? '0' : '') + c.ch + ' ' + c.label.slice(0, 17),
          bx, by + i * fs * 1.35, sel ? '#e6f0e0' : (dd ? '#5c4040' : '#79876f'), fs * 0.82, sel);
      }
    }

    /* --- objective / hint --- */
    /* the subtitle box occupies the bottom 8 rows; keep clear of it */
    var oy = H - fs * (DLG ? 10.7 : 3.0);
    if (OBJECTIVE) shadowText('> ' + OBJECTIVE, pad, oy, '#d8c46a', fs * 1.0, true);
    if (HINT) shadowText(HINT, pad, oy + fs * 1.3, '#7f8b74', fs * 0.86);

    /* --- interaction prompt --- */
    var up = activeUse();
    if (up) {
      var pt = '[ E ]  ' + up.label;
      shadowText(pt, W / 2, H - fs * (DLG ? 10.6 : 5.0), '#e8e2c0', fs * 1.15, true, 'center');
    }
    if (MODE === 'patrol') {
      shadowText('WASD MOVE   SHIFT RUN   E USE', W - pad, H - fs * 1.0, '#5f6a5c', fs * 0.8, false, 'right');
    } else if (!PANEL) {
      shadowText('0-9 / [ ] CAM   Q QUAD   D DOORS   P PA', W - pad, H - fs * 1.0, '#5f6a5c', fs * 0.8, false, 'right');
    }
  }

  /* --- door panel --- */
  if (PANEL) {
    var pw = Math.min(W * 0.62, fs * 34), ph = fs * 1.5 * PANEL.list.length + fs * 6.2;
    var px = (W - pw) / 2, py = (H - ph) / 2;
    CTX.fillStyle = 'rgba(6,10,8,0.93)'; CTX.fillRect(px, py, pw, ph);
    CTX.strokeStyle = '#3d5240'; CTX.lineWidth = 2; CTX.strokeRect(px, py, pw, ph);
    shadowText('DOOR CONTROL — PLANT 2', px + fs, py + fs * 2.0, '#cfe0c8', fs * 1.15, true);
    shadowText(LOCKDOWN ? 'STATUS: LOCKDOWN ACTIVE' : 'STATUS: NORMAL',
      px + pw - fs, py + fs * 2.0, LOCKDOWN ? '#d05a48' : '#79876f', fs * 0.9, true, 'right');
    for (var j = 0; j < PANEL.list.length; j++) {
      var D2 = PANEL.list[j], selr = j === PANEL.sel;
      var yy = py + fs * 3.6 + j * fs * 1.5;
      if (selr) { CTX.fillStyle = 'rgba(60,90,60,0.42)'; CTX.fillRect(px + fs * 0.5, yy - fs * 1.05, pw - fs, fs * 1.4); }
      var stat = D2.open ? 'OPEN' : (D2.locked ? 'LOCKED' : 'SHUT');
      var col = D2.open ? '#7fd06a' : (D2.locked ? '#d05a48' : '#b0a86a');
      shadowText((selr ? '>' : ' ') + ' ' + D2.id, px + fs, yy, selr ? '#eef4e8' : '#96a68e', fs * 0.92, selr);
      shadowText(DOOR_NAME[D2.id] || '', px + fs * 9.5, yy, '#79876f', fs * 0.88);
      shadowText(stat, px + pw - fs, yy, col, fs * 0.92, true, 'right');
    }
    var fy = py + ph - fs * 1.3;
    if (PANEL.errT > 0) shadowText(PANEL.err, px + pw / 2, fy, '#e0604c', fs * 0.95, true, 'center');
    else shadowText('↑↓ SELECT    ENTER TOGGLE    D CLOSE', px + pw / 2, fy, '#68765f', fs * 0.86, false, 'center');
  }

  /* --- subtitle box --- */
  if (DLG && !ENDCARD) {
    var sp = SPEAKER[DLG.who] || SPEAKER.RAY;
    var bh = fs * 7.4, byy = H - bh - fs * 0.6;
    CTX.fillStyle = 'rgba(4,7,6,0.88)'; CTX.fillRect(pad * 0.5, byy, W - pad, bh);
    CTX.strokeStyle = 'rgba(90,120,90,0.45)'; CTX.lineWidth = 2;
    CTX.strokeRect(pad * 0.5, byy, W - pad, bh);
    var tag = DLG.pa ? sp.n + '  [PA]' : DLG.radio ? sp.n + '  [RADIO]' : sp.n;
    shadowText(tag, pad, byy + fs * 1.9, sp.c, fs * 1.15, true);
    var shown = DLG.tx.slice(0, DLG.shown | 0);
    var lines = wrapText(shown, Math.floor((W - pad * 3) / (fs * 0.62)));
    for (var L = 0; L < lines.length && L < 3; L++) {
      shadowText(lines[L], pad, byy + fs * 3.6 + L * fs * 1.35, '#dfe8dc', fs * 1.08);
    }
    if (DLG.done && (TIME % 0.9) < 0.55) shadowText('▼', W - pad * 1.4, byy + bh - fs * 0.9, '#8fa088', fs);
  }

  /* --- document overlay --- */
  if (DOCVIEW) {
    CTX.fillStyle = 'rgba(0,0,0,0.82)'; CTX.fillRect(0, 0, W, H);
    var dw = Math.min(W * 0.78, fs * 40), dh = H * 0.76;
    var dx2 = (W - dw) / 2, dy2 = (H - dh) / 2;
    CTX.fillStyle = '#cdc7ae'; CTX.fillRect(dx2, dy2, dw, dh);
    CTX.fillStyle = 'rgba(90,70,40,0.16)'; CTX.fillRect(dx2, dy2, dw, dh);
    shadowText(DOCVIEW.title, dx2 + fs * 1.4, dy2 + fs * 2.6, '#241f18', fs * 1.2, true);
    CTX.fillStyle = '#3a3227'; CTX.fillRect(dx2 + fs * 1.4, dy2 + fs * 3.2, dw - fs * 2.8, 2);
    var dl = DOCVIEW.body.split('\n');
    for (var q2 = 0; q2 < dl.length; q2++) {
      hudFont(fs * 0.95, false); CTX.textAlign = 'left'; CTX.fillStyle = '#2b251c';
      CTX.fillText(dl[q2], dx2 + fs * 1.4, dy2 + fs * 5.0 + q2 * fs * 1.28);
    }
    shadowText('[ SPACE ]', dx2 + dw / 2, dy2 + dh - fs * 1.2, '#5a5040', fs * 0.9, true, 'center');
  }

  /* --- choice --- */
  if (CHOICE) {
    CTX.fillStyle = 'rgba(0,0,0,0.72)'; CTX.fillRect(0, H * 0.30, W, H * 0.40);
    shadowText(CHOICE.q, W / 2, H * 0.40, '#d8c46a', fs * 1.3, true, 'center');
    for (var o = 0; o < CHOICE.opts.length; o++) {
      var selo = o === CHOICE.sel;
      shadowText((selo ? '►  ' : '   ') + CHOICE.opts[o].tx, W / 2, H * 0.48 + o * fs * 2.2,
        selo ? '#f0f4ea' : '#8b968a', fs * 1.15, selo, 'center');
    }
  }

  /* --- title / end cards --- */
  if (TITLECARD) {
    CTX.fillStyle = 'rgba(0,0,0,' + clamp(TITLECARD.t * 2, 0, 0.9) + ')'; CTX.fillRect(0, 0, W, H);
    shadowText(TITLECARD.tx, W / 2, H * 0.44, '#c2201a', Math.round(H * 0.14), true, 'center');
    var sl = (TITLECARD.sub || '').split('\n');
    for (var s2 = 0; s2 < sl.length; s2++) {
      shadowText(sl[s2], W / 2, H * 0.56 + s2 * fs * 1.6, '#98a493', fs * 1.05, false, 'center');
    }
  }
  if (ENDCARD) {
    CTX.fillStyle = 'rgba(0,0,0,' + clamp(ENDCARD.t * 0.7, 0, 0.94) + ')'; CTX.fillRect(0, 0, W, H);
    if (ENDCARD.t > 0.8) {
      shadowText(ENDCARD.id, W / 2, H * 0.30, '#c2201a', Math.round(H * 0.09), true, 'center');
      var bl = ENDCARD.body.split('\n');
      for (var b2 = 0; b2 < bl.length; b2++) {
        shadowText(bl[b2], W / 2, H * 0.42 + b2 * fs * 1.5, '#9aa694', fs * 1.0, false, 'center');
      }
      if (ENDCARD.t > 4.0) shadowText('PRESS  R  TO RUN THE SHIFT AGAIN', W / 2, H * 0.86, '#6f7c68', fs * 1.0, true, 'center');
    }
  }
}

/* ------------------------------------------------------------- main loop */
var ACC = 0, LAST = 0, STEP = 1 / 30;

function frame(ts) {
  requestAnimationFrame(frame);
  if (!LAST) LAST = ts;
  var dt = Math.min(0.25, (ts - LAST) / 1000);
  LAST = ts;
  ACC += dt;
  if (ACC < STEP) return;
  var d = Math.min(0.1, ACC);
  ACC = 0;
  tick(d);
}

function tick(dt) {
  TIME += dt; FRAME++; TRIS_DRAWN = 0; PIX_DRAWN = 0; DBG_CULLED = 0; DBG_SUBMIT = 0; DBG_NEARCLIP = 0;
  if (GAME_OVER && keyHit('KeyR')) { location.reload(); return; }

  if (STATIC_T > 0) STATIC_T -= dt;
  if (GLITCH_T > 0) GLITCH_T -= dt;
  if (SHAKE > 0) SHAKE = Math.max(0, SHAKE - dt * 2.2);
  if (PANEL && PANEL.errT > 0) PANEL.errT -= dt;
  FADE += clamp(FADE_TO - FADE, -FADE_SPD * dt, FADE_SPD * dt);
  if (LINE3) HOOK_PHASE = (HOOK_PHASE + dt * 0.028) % 1;
  CLOCK_T += dt;
  setMachine(LINE3 ? 1 : 0.25, LINE3);
  setTone(MODE === 'patrol' ? 0.16 : 0.10);

  updateConsole();
  updatePlayer(dt);
  updateNPCs(dt);
  updateScript(dt);
  if (DOORLEAF_DIRTY) rebuildLeaves();

  /* ---- render ---- */
  if (BLACK) {
    clearFrame(0, 0, 0);
  } else if (MODE === 'patrol') {
    renderFeed(patrolCam(), 0, 0, VW, VH, false);
  } else if (QUAD) {
    clearFrame(3, 4, 4);
    var base = [0, 6, 7, 11];
    for (var i = 0; i < 4; i++) {
      var ch = (CUR_CH + i) % 14;
      var qc = camFor(ch);
      renderFeed(qc, (i % 2) * (VW / 2), (i >> 1) * (VH / 2), VW / 2, VH / 2, camDead(ch));
    }
    setViewport(0, 0, VW, VH);
  } else {
    renderFeed(camFor(CUR_CH), 0, 0, VW, VH, camDead(CUR_CH));
  }
  postProcess(dt);

  SCTX.putImageData(IMG, 0, 0);
  var W = CV.width, H = CV.height;
  CTX.fillStyle = '#000'; CTX.fillRect(0, 0, W, H);
  var sx = 0, sy = 0;
  if (SHAKE > 0.01) { sx = (rnd() - 0.5) * SHAKE * 14; sy = (rnd() - 0.5) * SHAKE * 10; }
  CTX.imageSmoothingEnabled = false;
  CTX.drawImage(SMALL, sx, sy, W, H);
  if (QUAD && MODE === 'monitor' && !BLACK) {
    CTX.strokeStyle = 'rgba(20,30,20,0.9)'; CTX.lineWidth = 3;
    CTX.beginPath(); CTX.moveTo(W / 2, 0); CTX.lineTo(W / 2, H);
    CTX.moveTo(0, H / 2); CTX.lineTo(W, H / 2); CTX.stroke();
  }
  drawHUD(W, H);
  /* drop anything still unconsumed after a full frame of grace */
  if (FRAME % 2 === 0) clearHits();
}

/* ------------------------------------------------------------------ boot */
function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  var target = VW / VH;
  var cw = w, ch = Math.round(w / target);
  if (ch > h) { ch = h; cw = Math.round(h * target); }
  CV.width = Math.min(1280, Math.max(640, cw));
  CV.height = Math.round(CV.width / target);
  CV.style.width = cw + 'px'; CV.style.height = ch + 'px';
}

function boot() {
  CV = document.getElementById('screen');
  CTX = CV.getContext('2d');
  SMALL = document.createElement('canvas'); SMALL.width = VW; SMALL.height = VH;
  SCTX = SMALL.getContext('2d');
  IMG = SCTX.createImageData(VW, VH);
  COLBUF = new Uint32Array(IMG.data.buffer);

  buildTextures();
  buildVignette();

  var rep = validateLevel(function (s) { console.log('[meatlight] ' + s); });
  console.log('[meatlight] level check: ' + (rep.ok ? 'PASS' : 'FAILED (' + rep.errors.length + ')') +
              ' — ' + PROPS.length + ' props, ' + DOORS.length + ' doorways, ' + CAMS.length + ' cameras');

  buildWorld();
  indexLabels();
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('keydown', function (e) {
    if (!KEY[e.code]) keyPress(e.code);      // ignore auto-repeat
    KEY[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].indexOf(e.code) >= 0) e.preventDefault();
    initAudio();
  });
  window.addEventListener('keyup', function (e) { KEY[e.code] = false; });
  window.addEventListener('mousedown', initAudio);

  var start = document.getElementById('start');
  var STARTED = false;
  function begin() {
    if (STARTED) return;
    STARTED = true;
    start.style.display = 'none';
    initAudio();
    SC.mode = 'run';
    requestAnimationFrame(frame);
  }
  start.addEventListener('click', begin);
  window.addEventListener('keydown', function once(e) {
    if (e.code === 'Enter' || e.code === 'Space') { window.removeEventListener('keydown', once); begin(); }
  });
}
if (typeof window !== 'undefined') window.addEventListener('load', boot);

/* -------------------------------------------------------------- debug tap
   Exposed for the automated playthrough test and for anyone poking at the
   plant from the console. Read-mostly; nothing here is used by the game. */
if (typeof window !== 'undefined') {
  window.MEATLIGHT = {
    state: function () {
      var g = null, cf = null;
      if (SC.mode === 'reach') g = { x: SC.data.x, z: SC.data.z, room: SC.data.room };
      if (SC.mode === 'use') { var u = USEPOINTS[SC.data.tag]; if (u) g = { x: u.x, z: u.z, room: u.room, use: 1 }; }
      if (SC.mode === 'needdoor') g = { door: SC.data.id };
      if (MODE === 'patrol') { var pc = patrolCam(); cf = [pc.look[0] - pc.pos[0], pc.look[2] - pc.pos[2]]; }
      return { mode: MODE, ch: CUR_CH, room: PL.room, x: +PL.x.toFixed(2), z: +PL.z.toFixed(2),
               sc: SC.i, scm: SC.mode, step: SCRIPT[SC.i] && SCRIPT[SC.i].s,
               goal: g, camf: cf, obj: OBJECTIVE,
               over: GAME_OVER, tris: TRIS_DRAWN, pix: PIX_DRAWN, fade: +FADE.toFixed(2),
               black: BLACK, amb: AMBIENT.r, gain: LIGHT_GAIN, lights: LIGHTS.length,
               sel: CHOICE ? CHOICE.sel : null,
               submit: DBG_SUBMIT, culled: DBG_CULLED, nearclip: DBG_NEARCLIP };
    },
    door: function (id) { return openDoor(id); },
    cam: function (c) { CUR_CH = c; },
    pa: function () { PA_USED = true; },
    warp: function (room, x, z) { MODE = 'patrol'; PL.room = room; PL.x = x; PL.z = z; },
    validate: function () { return validateLevel(); },
    nocull: function (v) { DBG_NOCULL = !!v; },
    /* Replay only the state-setting steps up to an index, so a test (or an
       author checking a late scene) can reach it without playing the rest. */
    fastForward: function (target) {
      var guard = 0;
      while (SC.i < target && SC.i < SCRIPT.length && guard++ < 4000) {
        var st = SCRIPT[SC.i];
        switch (st.s) {
          case 'fn': st.f(); break;
          case 'cam': CUR_CH = st.ch; break;
          case 'obj': OBJECTIVE = st.tx; break;
          case 'hint': HINT = st.tx; break;
          case 'clock': CLOCK = st.to; break;
          case 'black': BLACK = st.on; break;
          case 'fade': FADE = st.to; FADE_TO = st.to; break;
          case 'walk': npcWalk(st.who, st.to, st.speed);
                       var n = NPC[st.who], last = st.to[st.to.length - 1];
                       n.x = last[0]; n.z = last[1]; n.path = null; break;
          case 'mode': MODE = st.m;
                       if (st.at) { PL.x = st.at.x; PL.z = st.at.z; PL.yaw = st.at.yaw || 0; PL.room = st.at.room; }
                       break;
        }
        SC.i++;
      }
      SC.mode = 'run'; DLG = null;
      if (DOORLEAF_DIRTY) rebuildLeaves();
      return { i: SC.i, step: SCRIPT[SC.i] && SCRIPT[SC.i].s, mode: MODE, room: PL.room };
    },
    indexOfObjective: function (txt) {
      for (var i = 0; i < SCRIPT.length; i++)
        if (SCRIPT[i].s === 'obj' && SCRIPT[i].tx === txt) return i;
      return -1;
    },
    rooms: ROOMS, doors: DOORS, cams: CAMS
  };
}
