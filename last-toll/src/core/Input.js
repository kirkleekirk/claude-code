// Desktop keyboard + mouse input with per-frame edge detection.
// Gameplay code reads intents (moveX, look deltas, pressed actions) rather than
// raw events, which keeps the door open for a WebXR controller backend later.

const BLOCK_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Quote', 'Slash']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = [false, false, false];
    this.btnPressed = [false, false, false];
    this.btnReleased = [false, false, false];
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;
    this.onKey = null; // raw keydown hook for UI

    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressed.add(e.code);
      }
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons = [false, false, false];
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Browsers occasionally report a huge spike right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      if (!this.locked) return;
      this.buttons[e.button] = true;
      this.btnPressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.buttons[e.button]) this.btnReleased[e.button] = true;
      this.buttons[e.button] = false;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.buttons = [false, false, false];
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          // unadjustedMovement is not supported everywhere; retry plain.
          try {
            const p2 = this.canvas.requestPointerLock();
            if (p2 && p2.catch) p2.catch(() => this.onLockChange && this.onLockChange(false, true));
          } catch (_) { /* ignore */ }
        });
      }
    } catch (_) {
      try { this.canvas.requestPointerLock(); } catch (__) { /* ignore */ }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }

  get moveX() { return (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0); }
  get moveZ() { return (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0); }

  consumeLook() {
    const k = 0.0022 * this.sensitivity;
    const out = { x: this.mouseDX * k, y: this.mouseDY * k * (this.invertY ? -1 : 1), rawY: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.btnPressed = [false, false, false];
    this.btnReleased = [false, false, false];
    this.wheel = 0;
  }
}
