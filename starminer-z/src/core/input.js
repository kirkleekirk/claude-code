// Input from the keyboard and mouse, an Xbox controller, or the touch screen, read as one set
// of actions. Analog values (move, look) are summed across devices each frame; buttons are
// "held" and "pressed" (pressed is true for the one frame a button goes down).

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyR: 'reload', KeyE: 'inventory', Tab: 'inventory', KeyI: 'inventory',
  Escape: 'pause', KeyP: 'pause', KeyQ: 'drop', KeyV: 'view', F5: 'view', KeyC: 'crouch', ControlLeft: 'crouch', Enter: 'accept',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8',
  KeyF: 'secondary', KeyG: 'debug', Backquote: 'debug',
};

// standard gamepad mapping, the way CastleMiner Z laid out the Xbox 360 pad
const PADMAP = { 0: 'jump', 1: 'back_btn', 2: 'reload', 3: 'inventory', 4: 'prev', 5: 'next', 6: 'secondary', 7: 'primary', 8: 'view', 9: 'pause', 10: 'sprint', 11: 'crouch', 12: 'up', 13: 'down', 14: 'leftpad', 15: 'rightpad' };

export class Input {
  constructor(el) {
    this.el = el;
    this.held = new Set();
    this.pressedNow = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.mouse = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.sens = 1;
    this.invertY = false;
    this.locked = false;
    this.enabled = true;
    this.lastDevice = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this.padIndex = -1;
    this.padPrev = [];
    this.touch = null; // set by the touch overlay
    // a screen with text on it (the Join screen) takes the keys you type: textSink(char), '\b'
    // to rub one out
    this.textSink = null;
    // a controller has been heard from (on an Xbox, Edge only lets the game have it in its
    // "game controls" mode)
    this.padActive = false;
    this.listeners = [];
    this.on(window, 'keydown', (e) => {
      if (this.textSink && (e.key.length === 1 || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey && this.isGameKey(e)) {
        e.preventDefault();
        this.lastDevice = 'keyboard';
        this.textSink(e.key === 'Backspace' ? '\b' : e.key);
        return;
      }
      if (e.repeat) { if (KEYMAP[e.code] && this.isGameKey(e)) e.preventDefault(); return; }
      const a = KEYMAP[e.code];
      this.lastDevice = 'keyboard';
      if (a) {
        if (this.isGameKey(e)) e.preventDefault();
        this.down(a);
      }
    });
    this.on(window, 'keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.up(a); });
    this.on(el, 'mousedown', (e) => {
      if (e.pointerType === 'touch') return;
      this.lastDevice = 'keyboard';
      if (e.button === 0) this.down('primary');
      // (the right button is the original's Shoulder and its Activate both)
      if (e.button === 2) { this.down('secondary'); this.down('activate'); }
      if (e.button === 1) this.down('pick');
    });
    this.on(window, 'mouseup', (e) => {
      if (e.button === 0) this.up('primary');
      if (e.button === 2) { this.up('secondary'); this.up('activate'); }
      if (e.button === 1) this.up('pick');
    });
    this.on(el, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    this.on(el, 'wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    this.on(document, 'pointerlockchange', () => { this.locked = document.pointerLockElement === this.el; });
    this.on(window, 'blur', () => { this.held.clear(); });
    this.on(window, 'gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
  }

  isGameKey(e) {
    // keep the browser's own shortcuts (and typing in fields) working
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return false;
    return !e.ctrlKey && !e.metaKey;
  }

  on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); this.listeners.push([t, ev, fn, opt]); }
  dispose() { for (const [t, ev, fn, opt] of this.listeners) t.removeEventListener(ev, fn, opt); }

  down(a) { if (!this.held.has(a)) this.pressedNow.add(a); this.held.add(a); }
  up(a) { this.held.delete(a); }
  isHeld(a) { return this.held.has(a); }
  pressed(a) { return this.pressedNow.has(a); }
  // take a press so nothing else acts on it this frame
  consume(a) { const p = this.pressedNow.has(a); this.pressedNow.delete(a); return p; }

  requestLock() {
    if (this.lastDevice === 'touch' || matchMedia('(pointer: coarse)').matches) return;
    try { const p = this.el.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ }
  }
  exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ } }

  // Call once per frame before reading.
  poll(dt) {
    let mx = 0, my = 0;
    if (this.held.has('fwd')) my += 1;
    if (this.held.has('back')) my -= 1;
    if (this.held.has('right')) mx += 1;
    if (this.held.has('left')) mx -= 1;
    // (aim: set by the game while a gun's at the shoulder, how much slower to turn)
    const ms = this.aim?.mouse ?? 1, ps = this.aim?.pad ?? 1;
    let lx = this.mouse.dx * 0.0022 * this.sens * ms, ly = this.mouse.dy * 0.0022 * this.sens * ms;
    this.mouse.dx = this.mouse.dy = 0;
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = pads && this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!pad && pads) for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; }
    if (pad) {
      const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
      const ax = dz(pad.axes[0] || 0), ay = dz(pad.axes[1] || 0);
      const rx = dz(pad.axes[2] || 0, 0.12), ry = dz(pad.axes[3] || 0, 0.12);
      if (ax || ay || rx || ry) { this.lastDevice = 'pad'; this.padActive = true; }
      mx += ax; my -= ay;
      // response curve: fine aim near the centre, fast turns at the edge
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
      lx += curve(rx) * 3.2 * dt * this.sens * ps;
      ly += curve(ry) * 2.4 * dt * this.sens * ps;
      pad.buttons.forEach((b, i) => {
        const a = PADMAP[i];
        if (!a) return;
        const v = typeof b === 'object' ? b.pressed || b.value > 0.4 : b > 0.4;
        const was = this.padPrev[i];
        if (v && !was) { this.down(a); this.lastDevice = 'pad'; this.padActive = true; }
        if (!v && was) this.up(a);
        this.padPrev[i] = v;
      });
    }
    // touch
    if (this.touch) {
      const t = this.touch.read();
      mx += t.mx; my += t.my;
      lx += t.lx; ly += t.ly;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    this.look.x = lx; this.look.y = ly * (this.invertY ? -1 : 1);
  }

  // Call at the end of each frame.
  endFrame() {
    this.pressedNow.clear();
    this.wheel = 0;
  }
}
