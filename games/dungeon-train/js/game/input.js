/* PC input. The camera is locked by default: it looks into the car from a fixed angle and never turns.
   WASD (or the arrow keys) moves your hero on the screen and you aim with the mouse cursor.
   Settings can switch to a free camera instead:
     'lock'   – mouse-look with pointer lock (the crosshair is the screen centre).
     'cursor' – used when the browser won't lock the pointer (e.g. inside some embedded frames):
                you aim with the cursor and turn the camera with right-drag or the arrow keys.
   Each frame the raid asks for a *command* (move, aim, buttons). The simulation only ever sees commands,
   so a future network player can drive a hero the same way. */
(function () {
  'use strict';
  const IN = {
    enabled: false, fixed: !DT.settings.freeCam, mode: 'cursor', locked: false, lockFailed: false, everLocked: false,
    held: new Set(), pressed: new Set(),
    mouse: { x: 0, y: 0, has: false }, look: { dx: 0, dy: 0 }, zoom: 0, rmbDrag: false,
    onLockChange: null,
  };
  IN.mode = IN.fixed || DT.settings.cursorAim ? 'cursor' : 'lock';
  const KEYMAP = {
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'turnL', ArrowRight: 'turnR',
    Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyJ: 'attack',
    Digit1: 'ab0', Digit2: 'ab1', Digit3: 'ab2', Digit4: 'ab3', KeyQ: 'super', KeyE: 'interact', KeyF: 'interact',
    KeyZ: 'belt0', KeyX: 'belt1', KeyC: 'belt2', KeyV: 'belt3', KeyB: 'belt4',
    Tab: 'inventory', KeyI: 'inventory', Escape: 'pause', KeyP: 'pause',
  };
  IN.KEY_LABEL = { ab: ['1', '2', '3', '4'], belt: ['Z', 'X', 'C', 'V', 'B'] };

  const press = (a) => { if (!IN.held.has(a)) IN.pressed.add(a); IN.held.add(a); };
  const release = (a) => IN.held.delete(a);
  const canvas = () => document.getElementById('scene');

  function onKey(e, down) {
    const a = KEYMAP[e.code];
    if (!a) return;
    const tag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!IN.enabled) return;
    e.preventDefault();
    if (down) { if (!e.repeat) press(a); } else release(a);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { IN.held.clear(); IN.pressed.clear(); IN.rmbDrag = false; });

  window.addEventListener('mousemove', (e) => {
    IN.mouse.x = e.clientX; IN.mouse.y = e.clientY; IN.mouse.has = true;
    if (!IN.enabled || IN.fixed) return;
    if (IN.locked || IN.rmbDrag) { IN.look.dx += e.movementX || 0; IN.look.dy += e.movementY || 0; }
  });
  window.addEventListener('mousedown', (e) => {
    if (!IN.enabled || e.target !== canvas()) return;
    if (IN.mode === 'lock' && !IN.locked) { if (e.button === 0) IN.requestLock(); return; }
    if (e.button === 0) press('attack');
    /* right click dodges, except with the free cursor camera where right-drag turns the camera */
    if (e.button === 2) { if (IN.fixed || IN.mode === 'lock') press('dash'); else IN.rmbDrag = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) release('attack');
    if (e.button === 2) { release('dash'); IN.rmbDrag = false; }
  });
  window.addEventListener('contextmenu', (e) => { if (e.target === canvas()) e.preventDefault(); });
  window.addEventListener('wheel', (e) => { if (IN.enabled && e.target === canvas()) { IN.zoom += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });

  /* ---------- pointer lock (free camera only) ---------- */
  IN.requestLock = function () {
    const c = canvas();
    if (!c || IN.fixed || IN.mode !== 'lock' || IN.locked) return;
    if (!c.requestPointerLock) { IN.fallback(); return; }
    try {
      const r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(lockFailed);
    } catch (e) { lockFailed(); }
  };
  /* If the lock has worked before, a failure is temporary (e.g. right after Esc): just wait for a click.
     If it never worked, this page can't lock the mouse, so switch to cursor aiming. */
  function lockFailed() {
    if (IN.fixed) return;
    if (IN.everLocked) { if (IN.onLockChange) IN.onLockChange('retry'); }
    else IN.fallback();
  }
  /* Settings: locked camera, or a free camera with mouse-look (pointer lock) or cursor aiming. */
  IN.setCamera = function (fixed, cursorAim) {
    IN.fixed = !!fixed;
    if (IN.fixed || cursorAim) { IN.releaseLock(); IN.mode = 'cursor'; }
    else { IN.mode = 'lock'; IN.lockFailed = false; }
    IN.look.dx = IN.look.dy = 0;
    IN.rmbDrag = false;
    if (IN.onLockChange) IN.onLockChange('mode');
  };
  IN.releaseLock = function () { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); };
  IN.fallback = function () {
    if (IN.mode === 'cursor') return;
    IN.mode = 'cursor'; IN.lockFailed = true; IN.locked = false;
    if (IN.onLockChange) IN.onLockChange('failed');
  };
  document.addEventListener('pointerlockchange', () => {
    const was = IN.locked;
    IN.locked = document.pointerLockElement === canvas();
    if (IN.locked) IN.everLocked = true;
    if (IN.onLockChange && was !== IN.locked) IN.onLockChange(IN.locked ? 'locked' : 'unlocked');
  });
  document.addEventListener('pointerlockerror', lockFailed);

  /* ---------- per-frame sampling ---------- */
  IN.take = (a) => { if (IN.pressed.has(a)) { IN.pressed.delete(a); return true; } return false; };
  IN.isHeld = (a) => IN.held.has(a);
  IN.endFrame = () => IN.pressed.clear();
  IN.reset = () => { IN.pressed.clear(); IN.held.clear(); IN.look.dx = IN.look.dy = 0; IN.zoom = 0; IN.rmbDrag = false; };

  /* Camera turning this frame (radians) for the free camera, plus mouse-wheel zoom for both cameras. */
  IN.lookDelta = function (dt) {
    const s = DT.settings;
    const k = 0.0024 * (s.sens || 1);
    let yaw = -IN.look.dx * k, pitch = IN.look.dy * k * (s.invertY ? -1 : 1);
    IN.look.dx = IN.look.dy = 0;
    if (!IN.fixed) {
      if (IN.held.has('turnL')) yaw += 2.4 * dt;
      if (IN.held.has('turnR')) yaw -= 2.4 * dt;
    }
    const zoom = IN.zoom; IN.zoom = 0;
    return { yaw, pitch, zoom };
  };

  const ray = window.THREE ? new THREE.Raycaster() : null;
  const floor = window.THREE ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
  const hit = window.THREE ? new THREE.Vector3() : null;
  const ndc = window.THREE ? new THREE.Vector2() : null;
  /* Build this frame's command for the local player. `yaw` is the camera's heading: W moves that way.
     `ground` is the point on the floor under the cursor (or the crosshair), and `ray` is the cursor's
     line of sight, so the hero can aim at the monster under the cursor rather than the floor behind it. */
  IN.command = function (camera, yaw) {
    let f = 0, s = 0;
    if (IN.held.has('up')) f += 1;
    if (IN.held.has('down')) f -= 1;
    if (IN.held.has('right')) s += 1;
    if (IN.held.has('left')) s -= 1;
    if (IN.fixed) { if (IN.held.has('turnR')) s += 1; if (IN.held.has('turnL')) s -= 1; s = Math.max(-1, Math.min(1, s)); }
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    let ground = null, aimRay = null;
    if (ray && camera) {
      if (IN.mode === 'cursor' && IN.mouse.has) ndc.set((IN.mouse.x / window.innerWidth) * 2 - 1, -(IN.mouse.y / window.innerHeight) * 2 + 1);
      else ndc.set(0, 0);
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      aimRay = { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z };
      if (ray.ray.intersectPlane(floor, hit) && hit.distanceTo(o) < 80) ground = { x: hit.x, z: hit.z };
    }
    return {
      mx, mz, moving: mag > 0.1, yaw, ground, ray: aimRay,
      attack: IN.held.has('attack'), attackPressed: IN.take('attack'),
      dash: IN.take('dash'), super: IN.take('super'), interact: IN.held.has('interact'),
      ab: [IN.take('ab0'), IN.take('ab1'), IN.take('ab2'), IN.take('ab3')],
      belt: [IN.take('belt0'), IN.take('belt1'), IN.take('belt2'), IN.take('belt3'), IN.take('belt4')],
    };
  };
  /* An empty command (for paused or remote heroes). */
  IN.idle = (yaw) => ({ mx: 0, mz: 0, moving: false, yaw, ground: null, ray: null, attack: false, attackPressed: false, dash: false, super: false, interact: false, ab: [false, false, false, false], belt: [false, false, false, false, false] });

  DT.game.input = IN;
})();
