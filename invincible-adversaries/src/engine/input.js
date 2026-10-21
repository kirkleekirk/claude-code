// Keyboard + mouse input with pointer lock, edge detection and double-tap.

/**
 * Pointer-lock mouse deltas without camera snaps. Chrome sometimes reports one bogus movementX/Y of
 * hundreds of pixels, often against the real motion, and the first events after taking the lock can
 * carry the cursor's jump to the centre of the screen. Real motion builds up and dies down over
 * several events, so a delta far larger than the recent ones that the previous event doesn't back up
 * is held for one event: the next event applies it if the motion carries on that way, or drops it.
 */
export class MouseFilter {
  constructor() { this.reset(); }
  reset() { this.ref = 0; this.px = 0; this.py = 0; this.lastT = -1e9; this.held = null; this.settleUntil = 0; this.dropped = 0; }
  /** ignore motion for a moment (the lock was just taken) */
  settle(t, ms = 100) { this.reset(); this.settleUntil = t + ms; }
  /** one mousemove at time t (ms); returns [dx, dy] to apply now */
  push(dx, dy, t) {
    if (t < this.settleUntil) return [0, 0];
    const m = Math.hypot(dx, dy);
    // recent motion: the largest recent delta, fading over ~0.1 s without movement
    let ref = this.ref * Math.exp(-Math.max(0, t - this.lastT) / 100);
    this.lastT = t;
    let ox = 0, oy = 0;
    if (this.held) {
      // the held delta was real if the motion carries on its way at a comparable size
      const h = this.held; this.held = null;
      if (m >= 0.2 * h.m && h.dx * dx + h.dy * dy > 0.5 * h.m * m) { ox = h.dx; oy = h.dy; ref = Math.max(ref, h.m); this.px = h.dx; this.py = h.dy; }
      else this.dropped++;
    }
    // far above the recent motion with no lead-up from the previous event: hold it
    const pm = Math.hypot(this.px, this.py);
    const ledUp = pm >= 0.2 * m && this.px * dx + this.py * dy > 0.6 * pm * m;
    if (m > 60 && m > 2.5 * ref + 30 && !ledUp) {
      this.held = { dx, dy, m, t }; this.ref = ref;
      return [ox, oy];
    }
    this.ref = Math.max(m, ref); this.px = dx; this.py = dy;
    return [ox + dx, oy + dy];
  }
  /** a held delta that nothing followed within 60 ms was a spike */
  flush(t) { if (this.held && t - this.held.t > 60) { this.held = null; this.dropped++; } }
}

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, b: [false, false, false], pb: [false, false, false], rb: [false, false, false], wheel: 0 };
    this.filter = new MouseFilter();
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
      if (this.locked || (this.wantLock && this.lockFailed)) this.move(e.movementX, e.movementY, e.timeStamp);
    });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (this.locked) { this.lockFailed = false; this.filter.settle(performance.now()); }
      this.onLockChange && this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    this.wantLock = false;
    this.lockFailed = false;
  }
  /** one mouse movement (px, at time t ms), through the spike filter */
  move(dx, dy, t) {
    const [x, y] = this.filter.push(dx, dy, t);
    this.mouse.dx += x; this.mouse.dy += y;
  }
  flushMove(t) { this.filter.flush(t); }
  requestLock() {
    const el = this.el;
    if (!el.requestPointerLock) { this.lockFailed = true; return; }
    const plain = () => {
      try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => { this.lockFailed = true; }); } catch (e) { this.lockFailed = true; }
    };
    // raw mouse input (no OS acceleration, and no cursor-warp deltas); browsers without it reject the
    // option or ignore it
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch((e) => { if (e && e.name === 'NotSupportedError') plain(); else this.lockFailed = true; });
    } catch (e) { plain(); }
  }
  lock() { this.wantLock = true; this.requestLock(); }
  unlock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(c) { return this.down.has(c); }
  wasPressed(c) { return this.pressed.has(c); }
  wasDouble(c) { return this.doubleTapped.has(c); }
  endFrame() {
    this.pressed.clear(); this.released.clear(); this.doubleTapped.clear();
    this.flushMove(performance.now());
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.pb = [false, false, false]; this.mouse.rb = [false, false, false];
  }
}
