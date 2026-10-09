// Touch controls for phones and tablets: the left thumb moves (a stick that appears where it
// lands; push it all the way to sprint), the right thumb looks (drag anywhere), and buttons on
// the right for everything else. The hotbar takes taps as it is.

export const TOUCH_CSS = /* css */ `
.touch { position: absolute; inset: 0; pointer-events: none; z-index: 3; display: none; }
.touch.on { display: block; }
.touch .pad { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; }
.touch .look { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; pointer-events: auto; }
.touch .stick { position: absolute; width: 7.5em; height: 7.5em; margin: -3.75em 0 0 -3.75em; border-radius: 50%; border: 0.12em solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.18); display: none; }
.touch .stick b { position: absolute; left: 50%; top: 50%; width: 3.2em; height: 3.2em; margin: -1.6em 0 0 -1.6em; border-radius: 50%; background: rgba(255,255,255,0.45); box-shadow: 0 0 0.6em rgba(0,0,0,0.4); }
.touch .stick.run { border-color: rgba(255, 210, 120, 0.7); }
.touch .btns { position: absolute; right: 1.2em; bottom: 6.2em; width: 13em; height: 13em; pointer-events: none; }
.touch .tb { position: absolute; border-radius: 50%; display: grid; place-items: center; pointer-events: auto; background: rgba(20,20,22,0.45); border: 0.12em solid rgba(255,255,255,0.45); color: #fff; font: 800 0.8em var(--ui-font); text-shadow: 0 0.06em 0.12em #000; -webkit-tap-highlight-color: transparent; }
.touch .tb.on { background: rgba(255,255,255,0.3); }
.touch .tb svg { width: 55%; height: 55%; fill: #fff; filter: drop-shadow(0 0.06em 0.1em rgba(0,0,0,0.6)); }
.touch .tb.jump { right: 0; bottom: 0; width: 5em; height: 5em; }
.touch .tb.use { right: 5.6em; bottom: 0.6em; width: 4.6em; height: 4.6em; border-color: rgba(255,120,110,0.8); }
.touch .tb.place { right: 0.4em; bottom: 5.6em; width: 4.2em; height: 4.2em; }
.touch .tb.reload { right: 5.4em; bottom: 5.6em; width: 3.2em; height: 3.2em; }
.touch .top { position: absolute; left: 1em; top: 1em; display: flex; gap: 0.6em; }
.touch .top .tb { position: relative; width: 3em; height: 3em; }
`;

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4v8H9v-8H5z"/></svg>',
  use: '<svg viewBox="0 0 24 24"><path d="M4 20 14 10l2 2L6 22zM13 3c4 0 8 4 8 8-2-2-4-3-7-3l-1-1c0-1 0-2 0-4z"/></svg>',
  place: '<svg viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7zm0 2.3L5.3 8 12 11.7 18.7 8z"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  craft: '<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
  view: '<svg viewBox="0 0 24 24"><path d="M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>',
};

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    const el = document.createElement('div');
    el.className = 'touch ui';
    el.innerHTML = `
      <div class="pad"></div><div class="look"></div>
      <div class="stick"><b></b></div>
      <div class="btns">
        <div class="tb use" data-a="primary">${ICON.use}</div>
        <div class="tb jump" data-a="jump">${ICON.jump}</div>
        <div class="tb place" data-a="secondary">${ICON.place}</div>
        <div class="tb reload" data-a="reload">${ICON.reload}</div>
      </div>
      <div class="top">
        <div class="tb" data-a="view">${ICON.view}</div>
        <div class="tb" data-a="inventory">${ICON.craft}</div>
        <div class="tb" data-a="pause">${ICON.pause}</div>
      </div>`;
    app.uiRoot.appendChild(el);
    this.el = el;
    this.stick = el.querySelector('.stick');
    this.knob = el.querySelector('.stick b');
    this.move = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
    const pad = el.querySelector('.pad'), look = el.querySelector('.look');
    pad.addEventListener('pointerdown', (e) => this.padDown(e));
    look.addEventListener('pointerdown', (e) => this.lookDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    for (const b of el.querySelectorAll('.tb')) {
      const a = b.dataset.a;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('on');
        this.input.lastDevice = 'touch';
        this.input.down(a);
        // the use button also looks around while it's held, like a second right thumb
        if (a === 'primary' || a === 'secondary') { this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; }
      });
      const up = (e) => { b.classList.remove('on'); this.input.up(a); if (this.look.id === e.pointerId) this.look.id = null; };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    this.visible = false;
    this.input.touch = this;
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('on', v);
    if (!v) { this.move.id = null; this.look.id = null; this.stick.style.display = 'none'; for (const a of ['primary', 'secondary', 'jump', 'reload']) this.input.up(a); }
  }

  padDown(e) {
    e.preventDefault();
    this.input.lastDevice = 'touch';
    const m = this.move;
    m.id = e.pointerId; m.x0 = e.clientX; m.y0 = e.clientY; m.x = 0; m.y = 0;
    this.stick.style.display = 'block';
    this.stick.style.left = `${m.x0}px`;
    this.stick.style.top = `${m.y0}px`;
    this.knob.style.transform = '';
  }

  lookDown(e) {
    e.preventDefault();
    this.input.lastDevice = 'touch';
    const l = this.look;
    l.id = e.pointerId; l.x = e.clientX; l.y = e.clientY;
  }

  onMove(e) {
    const m = this.move, l = this.look;
    if (e.pointerId === m.id) {
      e.preventDefault();
      const R = this.stick.offsetWidth * 0.5 || 60;
      let dx = (e.clientX - m.x0) / R, dy = (e.clientY - m.y0) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      m.x = dx; m.y = dy;
      this.knob.style.transform = `translate(${dx * R * 0.8}px, ${dy * R * 0.8}px)`;
      const run = len > 0.95;
      this.stick.classList.toggle('run', run);
      if (run) this.input.down('sprint'); else this.input.up('sprint');
    } else if (e.pointerId === l.id) {
      e.preventDefault();
      l.dx += e.clientX - l.x; l.dy += e.clientY - l.y;
      l.x = e.clientX; l.y = e.clientY;
    }
  }

  onUp(e) {
    if (e.pointerId === this.move.id) {
      this.move.id = null; this.move.x = 0; this.move.y = 0;
      this.stick.style.display = 'none';
      this.input.up('sprint');
    }
    if (e.pointerId === this.look.id) this.look.id = null;
  }

  // what the thumbs are doing this frame, for Input.poll
  read() {
    const l = this.look, s = 0.0055 * (this.input.sens || 1);
    const out = { mx: this.move.x, my: -this.move.y, lx: l.dx * s, ly: l.dy * s };
    l.dx = 0; l.dy = 0;
    return out;
  }
}
