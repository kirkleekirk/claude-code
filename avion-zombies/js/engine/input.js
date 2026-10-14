import { settings } from '../settings.js';
import { clamp } from '../util.js';

// Unified input: keyboard + mouse (pointer lock), gamepad and touch all feed the same
// action map. Game code only ever reads actions.
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyZ: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyC: 'crouch', ControlLeft: 'crouchHold',
  KeyX: 'dodge', AltLeft: 'dodge',
  KeyR: 'reload',
  KeyF: 'interact',
  KeyV: 'melee',
  KeyE: 'lethal', KeyG: 'lethal',
  KeyQ: 'tactical',
  Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3',
  Escape: 'pause', KeyP: 'pause',
  Tab: 'stats',
};
const MOUSEMAP = { 0: 'fire', 2: 'ads', 1: 'melee', 3: 'dodge', 4: 'melee' };
// Standard gamepad layout (Xbox naming)
const PADMAP = {
  0: 'jump', 1: 'crouch', 2: 'use', 3: 'swap', 4: 'dodge', 5: 'lethal', 6: 'ads', 7: 'fire',
  8: 'stats', 9: 'pause', 10: 'sprint', 11: 'melee', 12: 'weapon1', 13: 'weapon2', 14: 'tactical', 15: 'tactical',
};
const ACTIONS = [
  'forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch', 'crouchHold', 'dodge', 'reload', 'interact',
  'melee', 'lethal', 'tactical', 'weapon1', 'weapon2', 'weapon3', 'pause', 'stats', 'fire', 'ads', 'swap', 'use',
];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = new Set();
    this.pad = new Set();
    this.virtual = new Set();
    this.latched = new Set();
    this.held = {};
    this.prev = {};
    this.pressed = {};
    this.released = {};
    for (const a of ACTIONS) this.held[a] = this.prev[a] = this.pressed[a] = this.released[a] = false;
    this.lookX = 0; // radians this frame (yaw)
    this.lookY = 0; // radians this frame (pitch)
    this.moveX = 0;
    this.moveY = 0;
    this.virtualMove = { x: 0, y: 0 };
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.lastDevice = 'kbm';
    this.padIndex = -1;
    this.usePressTime = 0;
    this.onPauseRequest = null;
    this.onUnlock = null;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'AltLeft' || (e.ctrlKey && e.code !== 'ControlLeft')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.latched.add(a);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.clear();
    });
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.isTouch) {
        this.requestLock();
        return;
      }
      this.mouse.add(e.button);
      const a = MOUSEMAP[e.button];
      if (a) this.latched.add(a);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      let dx = e.movementX || 0;
      let dy = e.movementY || 0;
      // Chrome occasionally reports a huge spike when the lock engages; drop it.
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      const s = 0.0022 * settings.get('sensitivity');
      this.lookX -= dx * s;
      this.lookY -= dy * s * (settings.get('invertY') ? -1 : 1);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) {
        this.keys.clear();
        this.mouse.clear();
        if (this.onUnlock) this.onUnlock();
      }
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.padIndex = -1;
    });
  }

  get isTouch() {
    return this.touchActive === true;
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch (e) {
      try {
        this.canvas.requestPointerLock();
      } catch (e2) {
        /* not supported (some app views) */
      }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- touch hooks (called by the touch overlay) -----------------------------------------
  setVirtual(action, down) {
    if (down) {
      if (!this.virtual.has(action)) this.latched.add(action);
      this.virtual.add(action);
    } else this.virtual.delete(action);
    this.lastDevice = 'touch';
  }
  tapVirtual(action) {
    this.latched.add(action);
    this.lastDevice = 'touch';
  }
  setVirtualMove(x, y) {
    this.virtualMove.x = x;
    this.virtualMove.y = y;
  }
  addTouchLook(dx, dy) {
    const s = 0.0048 * settings.get('touchSensitivity');
    this.lookX -= dx * s;
    this.lookY -= dy * s * (settings.get('invertY') ? -1 : 1);
    this.lastDevice = 'touch';
  }

  _pollPad(dt) {
    this.pad.clear();
    this.padMove = null;
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let gp = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!gp) gp = Array.from(pads).find((p) => p && p.connected) || null;
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
    gp.buttons.forEach((b, i) => {
      if (b.pressed || b.value > 0.4) {
        const a = PADMAP[i];
        if (a) this.pad.add(a);
      }
    });
    const lx = dz(gp.axes[0] || 0);
    const ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0);
    const ry = dz(gp.axes[3] || 0);
    if (lx || ly) this.padMove = { x: lx, y: -ly };
    if (rx || ry || this.pad.size) this.lastDevice = 'pad';
    if (this.enabled) {
      const mag = Math.min(1, Math.hypot(rx, ry));
      const curve = mag > 0 ? Math.pow(mag, 1.8) / mag : 0;
      const s = 3.4 * settings.get('sensitivity') * dt;
      this.lookX -= rx * curve * s;
      this.lookY -= ry * curve * s * 0.8 * (settings.get('invertY') ? -1 : 1);
    }
  }

  update(dt) {
    this._pollPad(dt);
    for (const a of ACTIONS) this.prev[a] = this.held[a];
    for (const a of ACTIONS) this.held[a] = false;
    for (const k of this.keys) {
      const a = KEYMAP[k];
      if (a) this.held[a] = true;
    }
    for (const b of this.mouse) {
      const a = MOUSEMAP[b];
      if (a) this.held[a] = true;
    }
    for (const a of this.pad) this.held[a] = true;
    for (const a of this.virtual) this.held[a] = true;

    // Gamepad "X": tap = reload, hold = interact (resolved by game via `use`).
    for (const a of ACTIONS) {
      this.pressed[a] = (this.held[a] && !this.prev[a]) || this.latched.has(a);
      this.released[a] = !this.held[a] && this.prev[a];
    }
    this.latched.clear();
    if (this.wheel !== 0) {
      this.pressed.swap = true;
      this.wheelDir = this.wheel;
      this.wheel = 0;
    } else this.wheelDir = 0;

    let mx = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    let my = (this.held.forward ? 1 : 0) - (this.held.back ? 1 : 0);
    if (this.padMove) {
      mx = this.padMove.x;
      my = this.padMove.y;
    }
    if (this.virtualMove.x || this.virtualMove.y) {
      mx = this.virtualMove.x;
      my = this.virtualMove.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.moveX = clamp(mx, -1, 1);
    this.moveY = clamp(my, -1, 1);
    this.moveMag = Math.min(1, Math.hypot(this.moveX, this.moveY));
  }

  consumeLook() {
    const x = this.lookX;
    const y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    return [x, y];
  }

  clear() {
    this.keys.clear();
    this.mouse.clear();
    this.virtual.clear();
    this.latched.clear();
    this.lookX = this.lookY = 0;
    this.virtualMove.x = this.virtualMove.y = 0;
  }
}
