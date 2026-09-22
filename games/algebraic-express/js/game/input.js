/* Input: keyboard + mouse on desktop, a virtual stick and buttons on touch screens. */
(function () {
  'use strict';
  const IN = {
    keys: new Set(), mouse: { x: 0, y: 0, down: false, has: false }, aim: null,
    pressed: new Set(), held: new Set(), touch: false, stick: { x: 0, z: 0, active: false },
    enabled: false,
  };
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyJ: 'attack', Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyQ: 'switch', Tab: 'switch', KeyE: 'interact', KeyF: 'interact',
    KeyR: 'super', Digit1: 'ab0', Digit2: 'ab1', Digit3: 'ab2', Digit4: 'belt0', Digit5: 'belt1', Digit6: 'belt2',
    Escape: 'pause', KeyP: 'pause', KeyI: 'inventory',
  };
  const ACTIONS_ONCE = new Set(['dash', 'switch', 'super', 'ab0', 'ab1', 'ab2', 'belt0', 'belt1', 'belt2', 'pause', 'inventory']);

  function press(a) { if (!IN.held.has(a)) IN.pressed.add(a); IN.held.add(a); }
  function release(a) { IN.held.delete(a); }

  function onKey(e, down) {
    const a = KEYMAP[e.code];
    if (!a) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!IN.enabled && a !== 'pause') return;
    if (a === 'switch' && e.code === 'Tab') e.preventDefault();
    if (a !== 'pause' && a !== 'inventory') e.preventDefault();
    if (down) { if (!e.repeat) press(a); } else release(a);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { IN.held.clear(); IN.pressed.clear(); IN.mouse.down = false; });

  const canvas = () => document.getElementById('scene');
  window.addEventListener('mousemove', (e) => { IN.mouse.x = e.clientX; IN.mouse.y = e.clientY; IN.mouse.has = true; });
  window.addEventListener('mousedown', (e) => {
    if (!IN.enabled || e.target !== canvas()) return;
    if (e.button === 0) { IN.mouse.down = true; press('attack'); }
    if (e.button === 2) press('dash');
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) { IN.mouse.down = false; release('attack'); } if (e.button === 2) release('dash'); });
  window.addEventListener('contextmenu', (e) => { if (e.target === canvas()) e.preventDefault(); });

  /* ---------- touch ---------- */
  let stickId = null, stickOrigin = null;
  function buildTouch() {
    const root = document.getElementById('touch');
    if (!root || root.dataset.built) return;
    root.dataset.built = '1';
    root.innerHTML = `<div class="stick-zone" id="stick-zone"><div class="stick-base" id="stick-base"><div class="stick-knob" id="stick-knob"></div></div></div>
      <div class="tbtns">
        <button class="tbtn big" data-t="attack" aria-label="Attack">${AE.icon('sword')}</button>
        <button class="tbtn" data-t="dash" aria-label="Dash">${AE.icon('dash')}</button>
        <button class="tbtn" data-t="switch" aria-label="Switch hero">${AE.icon('swap')}</button>
        <button class="tbtn" data-t="interact" aria-label="Interact">${AE.icon('hand')}</button>
        <button class="tbtn ab" data-t="ab0" aria-label="Ability 1">1</button>
        <button class="tbtn ab" data-t="ab1" aria-label="Ability 2">2</button>
        <button class="tbtn ab" data-t="ab2" aria-label="Ability 3">3</button>
        <button class="tbtn sup" data-t="super" aria-label="Super">${AE.icon('star')}</button>
      </div>`;
    root.querySelectorAll('[data-t]').forEach((b) => {
      const a = b.dataset.t;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); press(a); b.classList.add('on'); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); release(a); b.classList.remove('on'); }, { passive: false });
      b.addEventListener('touchcancel', () => { release(a); b.classList.remove('on'); });
    });
    const zone = document.getElementById('stick-zone');
    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      stickOrigin = { x: t.clientX, y: t.clientY };
      const base = document.getElementById('stick-base');
      const zr = zone.getBoundingClientRect();
      base.style.left = t.clientX - zr.left - 60 + 'px'; base.style.top = t.clientY - zr.top - 60 + 'px';
      base.classList.add('on');
      IN.stick.active = true;
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
        const d = Math.hypot(dx, dy), max = 50;
        if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
        document.getElementById('stick-knob').style.transform = `translate(${dx}px, ${dy}px)`;
        IN.stick.x = dx / max; IN.stick.z = dy / max;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) {
        stickId = null; IN.stick.active = false; IN.stick.x = IN.stick.z = 0;
        document.getElementById('stick-knob').style.transform = '';
        document.getElementById('stick-base').classList.remove('on');
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }
  window.addEventListener('touchstart', () => {
    if (IN.touch) return;
    IN.touch = true; document.body.classList.add('is-touch'); buildTouch();
    const hud = document.getElementById('hud');
    if (hud && !hud.hidden) IN.showTouch(true);
  }, { passive: true });

  /* Movement vector in world space (x right along the train, z toward the camera). */
  IN.move = function () {
    let x = 0, z = 0;
    if (IN.held.has('left')) x -= 1;
    if (IN.held.has('right')) x += 1;
    if (IN.held.has('up')) z -= 1;
    if (IN.held.has('down')) z += 1;
    if (IN.stick.active) { x += IN.stick.x; z += IN.stick.z; }
    const d = Math.hypot(x, z);
    if (d > 1) { x /= d; z /= d; }
    return { x, z, mag: Math.min(1, d) };
  };
  /* Mouse ray onto the floor plane (y = 0). */
  const ray = window.THREE ? new THREE.Raycaster() : null;
  const plane = window.THREE ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : null;
  const hit = window.THREE ? new THREE.Vector3() : null;
  IN.aimPoint = function (camera) {
    if (!IN.mouse.has || IN.touch || !ray) return null;
    const ndc = new THREE.Vector2((IN.mouse.x / window.innerWidth) * 2 - 1, -(IN.mouse.y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  };
  IN.take = function (a) { if (IN.pressed.has(a)) { IN.pressed.delete(a); return true; } return false; };
  IN.isHeld = (a) => IN.held.has(a);
  IN.endFrame = function () { IN.pressed.clear(); };
  IN.reset = function () { IN.pressed.clear(); IN.held.clear(); IN.mouse.down = false; };
  IN.showTouch = function (on) { const t = document.getElementById('touch'); if (t) t.hidden = !(on && IN.touch); };

  AE.game.input = IN;
})();
