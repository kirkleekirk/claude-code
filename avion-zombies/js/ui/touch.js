// On-screen controls for phones and tablets: floating move stick, drag-to-look,
// and a thumb cluster (fire also steers while held).
export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.root = document.getElementById('touch');
    this.stick = this.root.querySelector('.stick');
    this.knob = this.root.querySelector('.stick .knob');
    this.useBtn = this.root.querySelector('[data-t="interact"]');
    this.lureBtn = this.root.querySelector('[data-t="tactical"]');
    this.pointers = new Map();
    this.enabled = false;
    this.moveId = null;
    this.moveOrigin = { x: 0, y: 0 };
    this._bind();
  }

  enable(on) {
    this.enabled = on;
    this.root.hidden = !on;
    document.body.classList.toggle('touch-ui', on);
    this.input.touchActive = on;
    if (!on) this.release();
  }

  release() {
    this.pointers.clear();
    this.moveId = null;
    this.input.setVirtualMove(0, 0);
    for (const a of ['fire', 'ads', 'jump', 'crouch', 'sprint']) this.input.setVirtual(a, false);
    this.stick.classList.remove('on');
  }

  _bind() {
    const r = this.root;
    const opts = { passive: false };
    r.addEventListener('pointerdown', (e) => this._down(e), opts);
    r.addEventListener('pointermove', (e) => this._move(e), opts);
    r.addEventListener('pointerup', (e) => this._up(e), opts);
    r.addEventListener('pointercancel', (e) => this._up(e), opts);
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // any real touch anywhere switches the game into touch mode
    window.addEventListener('touchstart', () => {
      if (!this.enabled && this.game.inMatch) this.enable(true);
      this.input.lastDevice = 'touch';
    }, { passive: true });
  }

  _down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const btn = e.target.closest('[data-t]');
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: null, action: null };
    if (btn) {
      const a = btn.dataset.t;
      p.kind = 'button';
      p.action = a;
      btn.classList.add('down');
      p.el = btn;
      if (a === 'pause') this.game.pause();
      else if (a === 'swap' || a === 'reload' || a === 'melee' || a === 'lethal' || a === 'tactical' || a === 'dodge' || a === 'interact') this.input.tapVirtual(a);
      else this.input.setVirtual(a, true);
    } else if (e.clientX < window.innerWidth * 0.42 && this.moveId == null) {
      p.kind = 'move';
      this.moveId = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = e.clientX + 'px';
      this.stick.style.top = e.clientY + 'px';
      this.stick.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else {
      p.kind = 'look';
    }
    this.pointers.set(e.pointerId, p);
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.kind === 'move') {
      const ox = e.clientX - this.moveOrigin.x;
      const oy = e.clientY - this.moveOrigin.y;
      const max = 58;
      const len = Math.hypot(ox, oy);
      const k = len > max ? max / len : 1;
      this.knob.style.transform = `translate(calc(-50% + ${ox * k}px), calc(-50% + ${oy * k}px))`;
      this.input.setVirtualMove((ox * k) / max, (-oy * k) / max);
      // drag far forward = sprint
      this.input.moveMag = Math.min(1, len / max);
    } else if (p.kind === 'look' || (p.kind === 'button' && p.action === 'fire')) {
      this.input.addTouchLook(dx, dy);
    }
    p.x = e.clientX;
    p.y = e.clientY;
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'move') {
      this.moveId = null;
      this.input.setVirtualMove(0, 0);
      this.stick.classList.remove('on');
    } else if (p.kind === 'button') {
      p.el.classList.remove('down');
      if (p.action === 'fire' || p.action === 'jump' || p.action === 'crouch' || p.action === 'sprint') this.input.setVirtual(p.action, false);
      if (p.action === 'ads') this.input.setVirtual('ads', false);
    }
    this.pointers.delete(e.pointerId);
  }

  update() {
    if (!this.enabled) return;
    const g = this.game;
    const pr = g.interact.prompt;
    const showUse = !!(pr && !pr.disabled);
    if (this.useBtn.hidden === showUse) this.useBtn.hidden = !showUse;
    const showLure = g.weapons.lures > 0;
    if (this.lureBtn.hidden === showLure) this.lureBtn.hidden = !showLure;
  }
}

