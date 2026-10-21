// Keyboard + mouse input with pointer lock, edge detection and double-tap.
export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, b: [false, false, false], pb: [false, false, false], rb: [false, false, false], wheel: 0 };
    this.lastTap = {};
    this.doubleTapped = new Set();
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    const kd = (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ControlLeft', 'KeyQ', 'KeyE', 'KeyF', 'ShiftLeft', 'KeyC'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      const now = performance.now();
      if (this.lastTap[e.code] && now - this.lastTap[e.code] < 280) this.doubleTapped.add(e.code);
      this.lastTap[e.code] = now;
      this.down.add(e.code); this.pressed.add(e.code);
    };
    const ku = (e) => { this.down.delete(e.code); this.released.add(e.code); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.b = [false, false, false]; });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && this.wantLock) this.requestLock();
      this.mouse.b[e.button] = true; this.mouse.pb[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { this.mouse.b[e.button] = false; this.mouse.rb[e.button] = true; });
    window.addEventListener('mousemove', (e) => {
      // if the browser or an embedding frame refuses pointer lock, fall back to plain mouse movement
      if (this.locked || (this.wantLock && this.lockFailed)) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (this.locked) this.lockFailed = false;
      this.onLockChange && this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    this.wantLock = false;
    this.lockFailed = false;
  }
  requestLock() {
    try {
      const r = this.el.requestPointerLock?.();
      if (r && r.catch) r.catch(() => { this.lockFailed = true; });
      if (!this.el.requestPointerLock) this.lockFailed = true;
    } catch (e) { this.lockFailed = true; }
  }
  lock() { this.wantLock = true; this.requestLock(); }
  unlock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(c) { return this.down.has(c); }
  wasPressed(c) { return this.pressed.has(c); }
  wasDouble(c) { return this.doubleTapped.has(c); }
  endFrame() {
    this.pressed.clear(); this.released.clear(); this.doubleTapped.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.pb = [false, false, false]; this.mouse.rb = [false, false, false];
  }
}
