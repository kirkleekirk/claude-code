// Unified input: keyboard + mouse (pointer lock when available) and touch.
// Game code reads `move`, `look`, `held` and one-shot `pressed` actions.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'interact', KeyF: 'dash', KeyQ: 'arc', KeyR: 'shield',
  Tab: 'craft', KeyC: 'craft', KeyJ: 'journal', KeyM: 'map', Escape: 'menu', KeyP: 'menu',
  Digit1: 'use1', Digit2: 'use2', Digit3: 'use3', Digit4: 'use4',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.held = { fire: false, jump: false, sprint: false };
    this.pressed = new Set();
    this.keys = {};
    this.touchMove = { x: 0, y: 0, active: false };
    this.isTouch = false;
    this.locked = false;
    this.enabled = false;        // gameplay capture on/off (off while menus are open)
    this.sens = 1;
    this.invertY = false;
    this.wheel = 0;
    this._drag = false;
    this.onFirstGesture = null;

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys[a]) this.pressed.add(a);
      this.keys[a] = true;
      this._gesture();
    });
    window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.keys[a] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.held.fire = false; });

    canvas.addEventListener('mousedown', (e) => {
      this._gesture();
      if (this.isTouch) return;
      if (!this.enabled) return;
      if (!this.locked) { this._requestLock(); this._drag = true; }
      if (e.button === 0) this.held.fire = true;
      if (e.button === 2) this.pressed.add('dash');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.held.fire = false; this._drag = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (this.locked || this._drag) { this.look.x += e.movementX || 0; this.look.y += e.movementY || 0; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });

    // Touch: left side steers, right side looks. Buttons are handled by the HUD.
    this._tm = null; this._tl = null;
    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isTouch = true;
      this._gesture();
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const left = t.clientX < window.innerWidth * 0.42;
        if (left && !this._tm) { this._tm = { id: t.identifier, x0: t.clientX, y0: t.clientY }; this.touchMove.active = true; this.touchMove.ox = t.clientX; this.touchMove.oy = t.clientY; this.touchMove.x = this.touchMove.y = 0; }
        else if (!this._tl) this._tl = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, opts);
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._tm && t.identifier === this._tm.id) {
          const R = 56;
          let dx = (t.clientX - this._tm.x0) / R, dy = (t.clientY - this._tm.y0) / R;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          this.touchMove.x = dx; this.touchMove.y = -dy;
        } else if (this._tl && t.identifier === this._tl.id) {
          this.look.x += (t.clientX - this._tl.x) * 1.9;
          this.look.y += (t.clientY - this._tl.y) * 1.9;
          this._tl.x = t.clientX; this._tl.y = t.clientY;
        }
      }
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this._tm && t.identifier === this._tm.id) { this._tm = null; this.touchMove.active = false; this.touchMove.x = this.touchMove.y = 0; }
        if (this._tl && t.identifier === this._tl.id) this._tl = null;
      }
    };
    canvas.addEventListener('touchend', end, opts);
    canvas.addEventListener('touchcancel', end, opts);
  }

  _gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }

  _requestLock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* drag-look remains available */ }
  }

  releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.held.fire = false; this.held.jump = false; this.keys = {}; this._tm = null; this._tl = null; this.touchMove.active = false; this.touchMove.x = this.touchMove.y = 0; this.releaseLock(); }
  }

  press(action) { this.pressed.add(action); }
  hold(action, on) { this.held[action] = on; }

  // Call once per frame before reading; call endFrame() after.
  poll() {
    const k = this.keys;
    let x = (k.right ? 1 : 0) - (k.left ? 1 : 0), y = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    if (this.touchMove.active) { x = this.touchMove.x; y = this.touchMove.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    this.held.sprint = !!k.sprint || (this.touchMove.active && l > 0.93);
    this.held.jumpKey = !!k.jump;
  }

  consume(action) { if (this.pressed.has(action)) { this.pressed.delete(action); return true; } return false; }

  endFrame() { this.pressed.clear(); this.look.x = 0; this.look.y = 0; this.wheel = 0; }
}
