// Keyboard + mouse with full rebinding; basic gamepad for action mode.

export const DEFAULT_BINDS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', reload: 'KeyR', swap: 'KeyQ', sprint: 'ShiftLeft', sneak: 'KeyC',
  dodge: 'Space', throw: 'KeyG', interact: 'KeyE', squad: 'KeyF', melee: 'KeyV', ledger: 'Tab', pause: 'Escape', map: 'KeyM',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', timePause: 'KeyP', slower: 'Comma', faster: 'Period',
  overlay: 'KeyO', jobs: 'KeyJ', inventory: 'KeyI', vehicle: 'KeyX',
};

export const ACTION_LABELS = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', reload: 'Reload', swap: 'Swap weapon', sprint: 'Sprint',
  sneak: 'Sneak (toggle)', dodge: 'Dodge roll', throw: 'Throw', interact: 'Interact', squad: 'Squad order', melee: 'Melee / bash',
  ledger: 'Open Ledger', pause: 'Pause menu', map: 'Map', slot1: 'Weapon 1', slot2: 'Weapon 2', slot3: 'Weapon 3', slot4: 'Throwable',
  timePause: 'Pause time', slower: 'Slower time', faster: 'Faster time', overlay: 'Minimap overlay', jobs: 'Job board', inventory: 'Inventory',
  vehicle: 'Enter / exit vehicle',
};

export function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Comma: ',', Period: '.', Enter: 'Enter', Backquote: '`', Mouse0: 'LMB', Mouse2: 'RMB' }[code] || code;
}

export class Input {
  constructor(el) {
    this.el = el;
    this.binds = { ...DEFAULT_BINDS };
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.releasedKeys = new Set();
    this.mouse = { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0 };
    this.capture = null; // rebinding callback
    this.typed = [];
    this.pad = { active: false, lx: 0, ly: 0, rx: 0, ry: 0, buttons: [], prev: [] };
    this.lastDevice = 'kbm';
    const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote']);
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
      if (prevent.has(e.code) || e.code === 'F1') e.preventDefault();
      if (this.capture) { const cb = this.capture; this.capture = null; cb(e.code); return; }
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      this.typed.push(e.key);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.releasedKeys.add(e.code); });
    const pos = (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (el.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (el.height / r.height);
    };
    el.addEventListener('mousemove', (e) => { pos(e); this.lastDevice = 'kbm'; });
    el.addEventListener('mousedown', (e) => {
      pos(e); el.focus();
      if (this.capture) { const cb = this.capture; this.capture = null; cb('Mouse' + e.button); return; }
      if (e.button < 3) { this.mouse.down[e.button] = true; this.mouse.pressed[e.button] = true; }
      this.keys.add('Mouse' + e.button); this.pressedKeys.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) { this.mouse.down[e.button] = false; this.mouse.released[e.button] = true; }
      this.keys.delete('Mouse' + e.button); this.releasedKeys.add('Mouse' + e.button);
    });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
  }

  down(a) { return this.keys.has(this.binds[a]) || this.padDown(a); }
  pressed(a) { return this.pressedKeys.has(this.binds[a]) || this.padPressed(a); }
  released(a) { return this.releasedKeys.has(this.binds[a]); }
  keyPressed(code) { return this.pressedKeys.has(code); }

  rebind(action, cb) {
    this.capture = (code) => {
      if (code !== 'Escape') {
        for (const [k, v] of Object.entries(this.binds)) if (v === code && k !== action) this.binds[k] = this.binds[action];
        this.binds[action] = code;
      }
      cb && cb(code);
    };
  }

  // Gamepad: left stick move, right stick aim, RT fire, A dodge, X reload, Y swap, B interact, LB throw, RB sprint.
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x && x.connected);
    if (!p) { this.pad.active = false; return; }
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    this.pad.prev = this.pad.buttons;
    this.pad.buttons = p.buttons.map((b) => b.pressed || b.value > 0.5);
    this.pad.lx = dz(p.axes[0] || 0); this.pad.ly = dz(p.axes[1] || 0);
    this.pad.rx = dz(p.axes[2] || 0); this.pad.ry = dz(p.axes[3] || 0);
    if (this.pad.buttons.some(Boolean) || this.pad.lx || this.pad.ly || this.pad.rx || this.pad.ry) { this.pad.active = true; this.lastDevice = 'pad'; }
  }
  padMap(a) { return { dodge: 0, interact: 1, reload: 2, swap: 3, throw: 4, sprint: 5, ledger: 8, pause: 9, squad: 12, fire: 7 }[a]; }
  padDown(a) { const i = this.padMap(a); return this.pad.active && i !== undefined && !!this.pad.buttons[i]; }
  padPressed(a) { const i = this.padMap(a); return this.pad.active && i !== undefined && !!this.pad.buttons[i] && !this.pad.prev[i]; }

  endFrame() {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.mouse.pressed = [false, false, false];
    this.mouse.released = [false, false, false];
    this.mouse.wheel = 0;
    this.typed.length = 0;
  }
}
