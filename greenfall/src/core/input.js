// Keyboard / mouse / pointer-lock input with rebindable actions. Touch controls write
// into the same state through `virtual`.
export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], reload: ['KeyR'], interact: ['KeyE'],
  inventory: ['Tab', 'KeyI'], map: ['KeyM'], heal: ['KeyH'], eat: ['KeyX'], flashlight: ['KeyL'], emote: ['KeyB'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'], slot5: ['Digit5'], slot6: ['Digit6'],
  drop: ['KeyT'], pause: ['Escape', 'KeyP'],
};

export class Input {
  constructor(target) {
    this.target = target;
    this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0 };
    this.virtual = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, buttons: {}, pressed: {} };
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.onPause = null;
    this.textFocus = false;
    window.addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('F') && e.code.length <= 3 || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = [false, false, false]; });
    target.addEventListener('mousedown', (e) => {
      if (!this.mouse.buttons[e.button]) this.mouse.pressed[e.button] = true;
      this.mouse.buttons[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { this.mouse.buttons[e.button] = false; this.mouse.released[e.button] = true; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp crazy spikes some browsers produce on lock
      const dx = Math.max(-300, Math.min(300, e.movementX || 0)), dy = Math.max(-300, Math.min(300, e.movementY || 0));
      this.mouse.dx += dx; this.mouse.dy += dy;
    });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.target;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }
  requestLock() {
    if (this.touchMode) return;
    try { const p = this.target.requestPointerLock({ unadjustedMovement: false }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(action) {
    if (!this.enabled) return false;
    if (this.virtual.buttons[action]) return true;
    const b = this.binds[action];
    if (!b) return false;
    for (const k of b) if (this.keys.has(k)) return true;
    return false;
  }
  pressed(action) {
    if (!this.enabled) return false;
    if (this.virtual.pressed[action]) return true;
    const b = this.binds[action];
    if (!b) return false;
    for (const k of b) if (this.pressedKeys.has(k)) return true;
    return false;
  }
  get fire() { return this.enabled && (this.mouse.buttons[0] || !!this.virtual.buttons.fire); }
  get firePressed() { return this.enabled && (this.mouse.pressed[0] || !!this.virtual.pressed.fire); }
  get aim() { return this.enabled && (this.mouse.buttons[2] || !!this.virtual.buttons.aim); }
  get aimPressed() { return this.enabled && (this.mouse.pressed[2] || !!this.virtual.pressed.aim); }
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    x += this.virtual.moveX; y += this.virtual.moveY;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  lookDelta() {
    const s = 0.0022 * this.sensitivity;
    const dx = (this.mouse.dx + this.virtual.lookDX) * s, dy = (this.mouse.dy + this.virtual.lookDY) * s * (this.invertY ? -1 : 1);
    return { dx, dy };
  }
  endFrame() {
    this.pressedKeys.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.pressed = [false, false, false]; this.mouse.released = [false, false, false];
    this.virtual.lookDX = 0; this.virtual.lookDY = 0;
    this.virtual.pressed = {};
  }
  keyName(action) {
    const b = this.binds[action];
    if (!b || !b.length) return '?';
    const k = b[0];
    return k.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space');
  }
}
