// Input: keyboard + mouse (pointer lock) and touch (virtual stick, look
// drag, on-screen buttons). Gameplay reads actions, never raw events.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();   // edge-triggered this frame
    this.releasedSet = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0, x: 0, y: 0 };
    this.touch = { move: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, active: false };
    this.actionsDown = new Set();  // from on-screen buttons
    this.locked = false;
    this.enabled = true;
    this.uiCapture = false; // when menus are open
    this.bind();
  }
  bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.uiCapture && !['Escape', 'Tab', 'KeyB', 'KeyM', 'KeyI'].includes(e.code)) return;
      this.keys.add(e.code);
      this.pressedSet.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.releasedSet.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      this.mouse.buttons |= 1 << e.button;
      this.pressedSet.add('Mouse' + e.button);
      if (!this.locked && this.wantLock && !this.uiCapture) this.requestLock();
    });
    addEventListener('mouseup', (e) => { this.mouse.buttons &= ~(1 << e.button); this.releasedSet.add('Mouse' + e.button); });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      else if (this.mouse.buttons & 4 || (this.mouse.buttons & 1 && this.dragLook)) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    c.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; });
  }
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not allowed here */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  btn(name) { return this.actionsDown.has(name); }
  // movement vector (x = right, y = forward)
  moveAxis() {
    let x = 0, y = 0;
    if (this.uiCapture) return { x, y };
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    x += this.touch.move.x; y += this.touch.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  lookDelta() {
    const d = { x: this.mouse.dx + this.touch.lookDX, y: this.mouse.dy + this.touch.lookDY };
    return d;
  }
  endFrame() {
    this.pressedSet.clear(); this.releasedSet.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.touch.lookDX = 0; this.touch.lookDY = 0;
    this.tapped = null;
  }
}
