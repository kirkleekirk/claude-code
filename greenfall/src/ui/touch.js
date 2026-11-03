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
    // buttons: [label, action, right%, bottom%, big, toggle]
    const B = [
      ['FIRE', 'fire', 6, 22, true], ['AIM', 'aim', 20, 10, false, true], ['JUMP', 'jump', 4, 6], ['USE', 'interact', 20, 30], ['CROUCH', 'crouch', 13, 3, false, true],
      ['RELOAD', 'reload', 28, 4], ['BUILD', 'build', 30, 18], ['NEXT', 'wheel', 36, 6], ['HEAL', 'heal', 3, 40], ['EAT', 'eat', 12, 44], ['BAG', 'inventory', 2, 88], ['MAP', 'map', 10, 88], ['❚❚', 'pause', 18, 88], ['LIGHT', 'flashlight', 26, 88],
    ];
    for (const [label, action, rx, by, big, toggle] of B) {
      const b = el('div', 'tbtn' + (big ? ' big' : ''), this.root, label);
      b.style.right = rx + 'vw'; b.style.bottom = by + 'vh';
      if (by > 80) { b.style.bottom = ''; b.style.top = '1.5vh'; b.style.width = '52px'; b.style.height = '40px'; b.style.borderRadius = '8px'; if (rx < 30) b.style.right = (rx + 14) + 'vw'; }
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
  show(v) { this.root.classList.toggle('hidden', !v); }
}
export function isTouchDevice() {
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}
