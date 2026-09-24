/* PC input: rebindable keys and mouse buttons (side buttons 4 and 5 too), and the camera.
   The camera sits behind the hero and the hero always faces where the camera looks, so attacks go where
   you're looking. Mouse-look uses pointer lock ('lock' mode). When the page can't lock the mouse (some
   embedded frames block it), or if you pick it in Settings, hold the right mouse button to look ('drag').
   Each frame the raid asks for a *command* (move, aim, buttons). The simulation only ever sees commands,
   so a future network player can drive a hero the same way. */
(function () {
  'use strict';

  /* Every action you can bind, with its default keys. Codes are KeyboardEvent.code values, or MouseN for
     mouse buttons (Mouse0 left, Mouse1 middle, Mouse2 right, Mouse3 / Mouse4 the side buttons). */
  const ACTIONS = [
    { id: 'up', label: 'Move forward', group: 'Move', keys: ['KeyW', 'ArrowUp'] },
    { id: 'down', label: 'Move back', group: 'Move', keys: ['KeyS', 'ArrowDown'] },
    { id: 'left', label: 'Move left', group: 'Move', keys: ['KeyA'] },
    { id: 'right', label: 'Move right', group: 'Move', keys: ['KeyD'] },
    { id: 'turnL', label: 'Turn left', group: 'Move', keys: ['ArrowLeft'] },
    { id: 'turnR', label: 'Turn right', group: 'Move', keys: ['ArrowRight'] },
    { id: 'attack', label: 'Attack', group: 'Fight', keys: ['Mouse0', 'KeyJ'] },
    { id: 'dash', label: 'Dodge roll', group: 'Fight', keys: ['Space', 'ShiftLeft', 'Mouse2'] },
    { id: 'ab0', label: 'Ability 1', group: 'Fight', keys: ['Digit1'] },
    { id: 'ab1', label: 'Ability 2', group: 'Fight', keys: ['Digit2'] },
    { id: 'ab2', label: 'Ability 3', group: 'Fight', keys: ['Digit3', 'Mouse3'] },
    { id: 'ab3', label: 'Ability 4', group: 'Fight', keys: ['Digit4', 'Mouse4'] },
    { id: 'super', label: 'MATHEMATICAL! super', group: 'Fight', keys: ['KeyQ'] },
    { id: 'belt0', label: 'Snack 1', group: 'Snacks', keys: ['KeyZ'] },
    { id: 'belt1', label: 'Snack 2', group: 'Snacks', keys: ['KeyX'] },
    { id: 'belt2', label: 'Snack 3', group: 'Snacks', keys: ['KeyC'] },
    { id: 'belt3', label: 'Snack 4', group: 'Snacks', keys: ['KeyV'] },
    { id: 'belt4', label: 'Snack 5', group: 'Snacks', keys: ['KeyB'] },
    { id: 'interact', label: 'Open / use (hold)', group: 'Other', keys: ['KeyE', 'KeyF'] },
    { id: 'inventory', label: 'Backpack', group: 'Other', keys: ['Tab', 'KeyI'] },
    { id: 'pause', label: 'Pause (Esc always works)', group: 'Other', keys: ['KeyP'] },
  ];
  const SLOTS = 3;

  const IN = {
    enabled: false, mode: 'lock', locked: false, lockFailed: false, everLocked: false,
    held: new Set(), pressed: new Set(),
    mouse: { x: 0, y: 0, has: false }, look: { dx: 0, dy: 0 }, zoom: 0, rmbDrag: false,
    onLockChange: null, capturing: null, ACTIONS, SLOTS,
  };

  /* ---------- bindings ---------- */
  const defaults = () => Object.fromEntries(ACTIONS.map((a) => [a.id, a.keys.slice()]));
  let binds = defaults();
  let byCode = new Map();
  function rebuild() {
    byCode = new Map();
    for (const a of ACTIONS) for (const code of binds[a.id] || []) if (code) { if (!byCode.has(code)) byCode.set(code, []); byCode.get(code).push(a.id); }
  }
  IN.loadBinds = function () {
    const s = DT.settings.binds;
    binds = defaults();
    if (s && typeof s === 'object') for (const a of ACTIONS) if (Array.isArray(s[a.id])) binds[a.id] = s[a.id].slice(0, SLOTS).filter((c) => typeof c === 'string' && c);
    rebuild();
  };
  function saveBinds() { DT.settings.binds = JSON.parse(JSON.stringify(binds)); DT.saveSettings(); rebuild(); }
  IN.binds = () => binds;
  /* Put `code` on `action` (slot 0-2). The code is taken off whatever else had it. */
  IN.bind = function (action, slot, code) {
    if (!binds[action]) return;
    for (const a of ACTIONS) binds[a.id] = (binds[a.id] || []).filter((c) => c !== code);
    const list = binds[action];
    if (slot >= list.length) list.push(code); else list[slot] = code;
    binds[action] = list.slice(0, SLOTS);
    saveBinds();
  };
  IN.unbind = function (action, slot) { if (binds[action]) { binds[action].splice(slot, 1); saveBinds(); } };
  IN.resetBinds = function () { binds = defaults(); saveBinds(); };

  const NAMES = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', Backspace: 'Bksp', CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
  IN.codeLabel = function (code) {
    if (!code) return '—';
    if (NAMES[code]) return NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    if (/^F\d+$/.test(code)) return code;
    return code;
  };
  /* The label for an action's first key (what the HUD shows). */
  IN.label = (action) => IN.codeLabel((binds[action] || [])[0]);
  IN.labels = (action) => (binds[action] || []).map(IN.codeLabel);

  /* Rebinding: the next key or mouse button goes to `cb` (Esc cancels). */
  IN.capture = function (cb) { IN.capturing = cb; };
  function captured(code) {
    const cb = IN.capturing;
    IN.capturing = null;
    cb(code === 'Escape' ? null : code);
  }

  /* ---------- events ---------- */
  const press = (a) => { if (!IN.held.has(a)) IN.pressed.add(a); IN.held.add(a); };
  const release = (a) => IN.held.delete(a);
  const canvas = () => document.getElementById('scene');
  const typing = (e) => { const tag = ((e.target && e.target.tagName) || '').toLowerCase(); return tag === 'input' || tag === 'textarea' || tag === 'select'; };

  function onKey(e, down) {
    if (IN.capturing) { if (down) { e.preventDefault(); captured(e.code); } return; }
    if (typing(e)) return;
    if (!IN.enabled) return;
    if (e.code === 'Escape') { e.preventDefault(); if (down && !e.repeat) press('pause'); else if (!down) release('pause'); return; }
    const acts = byCode.get(e.code);
    if (!acts) return;
    e.preventDefault();
    for (const a of acts) { if (down) { if (!e.repeat) press(a); } else release(a); }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { IN.held.clear(); IN.pressed.clear(); IN.rmbDrag = false; });

  window.addEventListener('mousemove', (e) => {
    IN.mouse.x = e.clientX; IN.mouse.y = e.clientY; IN.mouse.has = true;
    if (!IN.enabled) return;
    if (IN.locked || IN.rmbDrag) { IN.look.dx += e.movementX || 0; IN.look.dy += e.movementY || 0; }
  });
  /* the side buttons would otherwise make the browser go back / forward a page */
  const side = (e) => e.button === 3 || e.button === 4;
  window.addEventListener('mousedown', (e) => {
    if (IN.capturing) { e.preventDefault(); IN.swallowUntil = performance.now() + 600; captured('Mouse' + e.button); return; }
    if (side(e) || (e.button === 1 && IN.enabled)) e.preventDefault();
    if (!IN.enabled || e.target !== canvas()) return;
    if (IN.mode === 'lock' && !IN.locked) { if (e.button === 0) IN.requestLock(); return; }
    if (IN.mode === 'drag' && e.button === 2) { IN.rmbDrag = true; return; }
    const acts = byCode.get('Mouse' + e.button);
    if (acts) for (const a of acts) press(a);
  });
  window.addEventListener('mouseup', (e) => {
    if (side(e)) e.preventDefault();
    if (e.button === 2) IN.rmbDrag = false;
    const acts = byCode.get('Mouse' + e.button);
    if (acts) for (const a of acts) release(a);
  });
  window.addEventListener('auxclick', (e) => { if (side(e) || IN.enabled) e.preventDefault(); });
  window.addEventListener('contextmenu', (e) => { if (e.target === canvas() || IN.capturing || performance.now() < (IN.swallowUntil || 0)) e.preventDefault(); });
  window.addEventListener('wheel', (e) => { if (IN.enabled && e.target === canvas()) { IN.zoom += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });

  /* ---------- pointer lock ---------- */
  IN.requestLock = function () {
    const c = canvas();
    if (!c || IN.mode !== 'lock' || IN.locked) return;
    if (!c.requestPointerLock) { IN.fallback(); return; }
    try {
      const r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(lockFailed);
    } catch (e) { lockFailed(); }
  };
  /* If the lock has worked before, a failure is temporary (e.g. right after Esc): just wait for a click.
     If it never worked, this page can't lock the mouse, so switch to hold-right-mouse-to-look. */
  function lockFailed() {
    if (IN.everLocked) { if (IN.onLockChange) IN.onLockChange('retry'); }
    else IN.fallback();
  }
  /* Settings: mouse-look (pointer lock) or hold the right mouse button to look. */
  IN.setDragLook = function (drag) {
    if (drag) { IN.releaseLock(); IN.mode = 'drag'; }
    else { IN.mode = 'lock'; IN.lockFailed = false; }
    IN.look.dx = IN.look.dy = 0;
    IN.rmbDrag = false;
    if (IN.onLockChange) IN.onLockChange('mode');
  };
  IN.releaseLock = function () { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); };
  IN.fallback = function () {
    if (IN.mode === 'drag') return;
    IN.mode = 'drag'; IN.lockFailed = true; IN.locked = false;
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

  /* Camera turning this frame (radians) from the mouse and the turn keys, plus mouse-wheel zoom. */
  IN.lookDelta = function (dt) {
    const s = DT.settings;
    const k = 0.0024 * (s.sens || 1);
    let yaw = -IN.look.dx * k, pitch = IN.look.dy * k * (s.invertY ? -1 : 1);
    IN.look.dx = IN.look.dy = 0;
    if (IN.held.has('turnL')) yaw += 2.6 * dt;
    if (IN.held.has('turnR')) yaw -= 2.6 * dt;
    const zoom = IN.zoom; IN.zoom = 0;
    return { yaw, pitch, zoom };
  };

  const ray = window.THREE ? new THREE.Raycaster() : null;
  const floor = window.THREE ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
  const hit = window.THREE ? new THREE.Vector3() : null;
  const center = window.THREE ? new THREE.Vector2(0, 0) : null;
  /* Build this frame's command for the local player. `yaw` is where the camera (and so the hero) faces:
     W moves that way, A/D strafe. `ground` is the floor under the crosshair and `ray` the crosshair's line
     of sight, so the hero can aim at the monster under the crosshair. */
  IN.command = function (camera, yaw) {
    let f = 0, s = 0;
    if (IN.held.has('up')) f += 1;
    if (IN.held.has('down')) f -= 1;
    if (IN.held.has('right')) s += 1;
    if (IN.held.has('left')) s -= 1;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    let ground = null, aimRay = null;
    if (ray && camera) {
      ray.setFromCamera(center, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      aimRay = { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z };
      if (ray.ray.intersectPlane(floor, hit) && hit.distanceTo(o) < 60) ground = { x: hit.x, z: hit.z };
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

  IN.loadBinds();
  IN.mode = DT.settings.dragLook || DT.settings.cursorAim ? 'drag' : 'lock';
  DT.game.input = IN;
})();
