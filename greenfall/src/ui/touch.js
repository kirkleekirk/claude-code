// On-screen controls for phones & tablets: left stick to move, drag right side to look,
// buttons for everything else. Writes into Input.virtual.
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

export class TouchControls {
  constructor(G, root) {
    this.G = G;
    this.input = G.input;
    this.root = el('div', 'touch hidden', root);
    const V = this.input.virtual;
    // look area
    const look = el('div', 'tlook', this.root);
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
    look.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) { V.lookDX += (t.clientX - lx) * 2.2; V.lookDY += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; } e.preventDefault(); }, { passive: false });
    look.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });
    // stick
    const stick = el('div', 'tstick', this.root);
    const knob = el('div', 'knob', stick);
    let sid = null, cx = 0, cy = 0;
    const R = 60;
    const setStick = (x, y) => {
      let dx = x - cx, dy = y - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      V.moveX = dx / R; V.moveY = -dy / R;
      V.buttons.sprint = l > R * 0.95 && -dy > R * 0.6;
    };
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; setStick(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === sid) setStick(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; knob.style.transform = ''; V.moveX = 0; V.moveY = 0; V.buttons.sprint = false; } };
    stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
    // buttons: [label, action, right(px), bottom(px) or top(px) for 'top', kind, toggle]
    const B = [
      ['FIRE', 'fire', 22, 112, 'big'], ['JUMP', 'jump', 26, 30, ''], ['CROUCH', 'crouch', 100, 26, 'small', true], ['RELOAD', 'reload', 168, 26, 'small'],
      ['AIM', 'aim', 120, 200, 'small', true], ['USE', 'interact', 126, 118, ''], ['BUILD', 'build', 236, 26, 'small'], ['NEXT', 'wheel', 192, 172, 'small'],
      ['HEAL', 'heal', 26, 206, 'small'], ['EAT', 'eat', 186, 236, 'small'],
      ['BAG', 'inventory', 128, 8, 'top'], ['MAP', 'map', 184, 8, 'top'], ['LIGHT', 'flashlight', 240, 8, 'top'], ['❚❚', 'pause', 296, 8, 'top'],
    ];
    this.btns = {};
    for (const [label, action, rx, by, kind, toggle] of B) {
      const b = el('div', 'tbtn' + (kind ? ' ' + kind : ''), this.root, label);
      this.btns[action] = { el: b, label };
      b.style.right = rx + 'px';
      if (kind === 'top') b.style.top = by + 'px'; else b.style.bottom = by + 'px';
      let on = false;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (action === 'wheel') { this.input.mouse.wheel += 1; return; }
        if (toggle) { on = !on; V.buttons[action] = on; b.classList.toggle('on', on); if (on) V.pressed[action] = true; return; }
        V.buttons[action] = true; V.pressed[action] = true; b.classList.add('on');
      }, { passive: false });
      const up = (e) => { if (!toggle) { V.buttons[action] = false; b.classList.remove('on'); } e.preventDefault(); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    }
  }
  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    const drive = m === 'drive';
    const L = { jump: drive ? 'BRAKE' : 'JUMP', interact: drive ? 'EXIT' : 'USE', heal: drive ? 'HORN' : 'HEAL' };
    for (const [k, t] of Object.entries(L)) if (this.btns[k]) this.btns[k].el.textContent = t;
    for (const k of ['fire', 'aim', 'crouch', 'reload', 'build', 'wheel', 'eat']) if (this.btns[k]) this.btns[k].el.style.display = drive ? 'none' : '';
  }
  show(v) { this.root.classList.toggle('hidden', !v); document.body.classList.toggle('touchmode', !!v); }
}
export function isTouchDevice() {
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}
