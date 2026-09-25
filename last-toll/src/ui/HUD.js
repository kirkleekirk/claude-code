// In-raid heads-up display. Kept sparse, like a watch on your wrist.

function el(parent, cls, html = '') {
  const e = document.createElement('div');
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

function fmtClock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

function fmtSec(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class HUD {
  constructor(root) {
    const r = el(root, 'layer');
    r.id = 'hud';
    this.root = r;
    el(r, 'vignette');
    this.hurtEl = el(r, 'hurt');
    this.lowEl = el(r, 'lowhp');
    this.grabEl = el(r, 'grabfx');
    this.gutsEl = el(r, 'gutsfx');
    this.scopeEl = el(r, 'scope');
    this.xhair = el(r, 'xhair');
    this.charge = el(r, 'charge', '<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="14"/></svg>');
    this.chargeCircle = this.charge.querySelector('circle');
    this.hitEl = el(r, 'hitmark');
    this.promptEl = el(r, 'prompt');
    this.hintEl = el(r, 'hint');
    this.toastsEl = el(r, 'toasts');
    this.bigEl = el(r, 'big', '<h2></h2><p></p>');

    const comp = el(r, 'compass');
    this.track = el(comp, 'track');
    el(comp, 'center');
    this.pxPerRad = 160;
    const cards = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    // headings: N = -z. Ticks every 15 degrees over three wraps for seamless scrolling.
    for (let k = -1; k <= 1; k++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const x = ((deg + k * 360) * Math.PI) / 180 * this.pxPerRad;
        if (deg % 45 === 0) {
          const c = el(this.track, 'card', cards[deg / 45]);
          c.style.left = `${x}px`;
          if (deg % 90 !== 0) { c.style.fontSize = '12px'; c.style.color = 'var(--bone-dim)'; }
        } else {
          const t = el(this.track, 'tick');
          t.style.left = `${x}px`;
        }
      }
    }
    this.markerEls = [];

    const w = el(r, 'wrist');
    w.innerHTML = `
      <div class="clock"><span class="time num">5:00 PM</span><span class="toll">Toll in 0:00</span></div>
      <div class="row"><span class="label">Health</span><div class="bar hp"><em></em><span></span></div><span class="v hpv">100</span></div>
      <div class="row"><span class="label">Stamina</span><div class="bar st"><span></span></div><span class="v stv">100</span></div>
      <div class="row"><span class="label">Light</span><div class="bar bat"><span></span></div><span class="v batv">OFF</span></div>
      <div class="status"></div>`;
    this.statusEl = w.querySelector('.status');
    this.timeEl = w.querySelector('.time');
    this.tollEl = w.querySelector('.toll');
    this.hpBar = w.querySelector('.bar.hp > span');
    this.hpCap = w.querySelector('.bar.hp > em');
    this.hpV = w.querySelector('.hpv');
    this.stBar = w.querySelector('.bar.st > span');
    this.stV = w.querySelector('.stv');
    this.batBar = w.querySelector('.bar.bat > span');
    this.batV = w.querySelector('.batv');

    const wp = el(r, 'weapon');
    wp.innerHTML = `<div class="slots"><b>1</b><b>2</b><b>3</b><b>4</b></div><div class="wn">Screwdriver</div><div class="ammo num"></div><div class="state"></div><div class="bar dur"><span></span></div>`;
    this.slotEls = [...wp.querySelectorAll('.slots b')];
    this.wn = wp.querySelector('.wn');
    this.ammoEl = wp.querySelector('.ammo');
    this.stateEl = wp.querySelector('.state');
    this.durEl = wp.querySelector('.dur');
    this.durBar = wp.querySelector('.dur > span');

    const st = el(r, 'struggle');
    st.innerHTML = `<div class="t">Break free</div><div class="label" style="color:var(--bone-dim)">Mash <span class="key">V</span> or kill it</div><div class="bars"><div class="bar free"><span></span></div><div class="bar bite"><span></span></div></div>`;
    this.struggleEl = st;
    this.freeBar = st.querySelector('.bar.free > span');
    this.biteBar = st.querySelector('.bar.bite > span');

    const ex = el(r, 'extract');
    ex.innerHTML = `<div class="label" style="color:var(--bone)">Casting off</div><div class="bar"><span></span></div>`;
    this.extractEl = ex;
    this.extractBar = ex.querySelector('.bar > span');

    this.cache = {};
    this.hitT = 0;
    this.bigT = 0;
  }

  show(v) { this.root.style.display = v ? '' : 'none'; }

  _set(key, elm, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') elm.textContent = value;
    else if (prop === 'html') elm.innerHTML = value;
    else if (prop === 'width') elm.style.width = value;
    else if (prop === 'opacity') elm.style.opacity = value;
    else if (prop === 'display') elm.style.display = value;
    else if (prop === 'class') elm.className = value;
  }

  toast(text, danger = false) {
    // collapse repeats
    const last = this.toastsEl.lastElementChild;
    if (last && last.textContent === text) {
      clearTimeout(last._t);
      last._t = setTimeout(() => last.remove(), 2600);
      return;
    }
    const t = document.createElement('div');
    t.className = 'toast' + (danger ? ' danger' : '');
    t.textContent = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild.remove();
    t._t = setTimeout(() => t.remove(), 2600);
  }

  clearToasts() {
    this.toastsEl.innerHTML = '';
  }

  hit(kill) {
    this.hitEl.className = 'hitmark' + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.18;
  }

  big(title, sub = '', cls = '', dur = 4) {
    this.bigEl.querySelector('h2').textContent = title;
    this.bigEl.querySelector('p').textContent = sub;
    this.bigEl.className = 'big show ' + cls;
    this.bigT = dur;
  }

  update(dt, s) {
    // compass
    const yaw = s.yaw;
    const heading = ((-yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.track.style.transform = `translateX(${-heading * this.pxPerRad}px)`;
    const markers = s.markers || [];
    while (this.markerEls.length < markers.length) {
      const m = el(this.track, 'mk', '<i></i><span></span>');
      this.markerEls.push(m);
    }
    for (let i = 0; i < this.markerEls.length; i++) {
      const me = this.markerEls[i];
      const mk = markers[i];
      if (!mk) { me.style.display = 'none'; continue; }
      me.style.display = '';
      const dx = mk.x - s.px, dz = mk.z - s.pz;
      let ang = Math.atan2(dx, -dz); // heading of the marker (0 = north)
      ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let rel = ang - heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      me.style.left = `${(heading + rel) * this.pxPerRad}px`;
      me.className = 'mk ' + (mk.kind || '');
      const txt = mk.kind === 'bell' ? '' : `${Math.round(Math.hypot(dx, dz))}m`;
      const sp = me.lastElementChild;
      if (sp.textContent !== txt) sp.textContent = txt;
    }

    // wrist
    this._set('time', this.timeEl, 'text', fmtClock(s.clock));
    const tollTxt = s.tolled ? (s.overrun ? 'Overrun' : 'Tolled') : `Toll in ${fmtSec(s.tollIn)}`;
    this._set('toll', this.tollEl, 'text', tollTxt);
    this._set('tollc', this.tollEl, 'class', 'toll' + (s.tolled || s.tollIn < 45 ? ' now' : ''));
    this._set('hp', this.hpBar, 'width', `${(s.health / 100) * 100}%`);
    this.hpCap.style.left = `${s.maxHealth}%`;
    this.hpCap.style.right = '0';
    this._set('hpv', this.hpV, 'text', String(Math.ceil(s.health)));
    this._set('st', this.stBar, 'width', `${s.stamina}%`);
    this._set('stv', this.stV, 'text', String(Math.round(s.stamina)));
    this._set('bat', this.batBar, 'width', `${s.battery}%`);
    this._set('batv', this.batV, 'text', s.flashlight ? `${Math.round(s.battery)}%` : 'OFF');
    this._set('status', this.statusEl, 'text', s.status || '');
    this._set('guts', this.gutsEl, 'opacity', s.status && s.status.includes('guts') ? '1' : '0');

    // weapon
    const w = s.weapon;
    this._set('wn', this.wn, 'text', w.name);
    this._set('ammo', this.ammoEl, 'html', w.ammo || '');
    this._set('wstate', this.stateEl, 'text', w.state || '');
    this._set('dur', this.durBar, 'width', `${Math.max(0, w.durK) * 100}%`);
    this._set('durc', this.durEl, 'class', 'bar dur' + (w.durK < 0.25 ? ' low' : ''));
    this._set('durd', this.durEl, 'display', w.durK >= 0 ? '' : 'none');
    for (let i = 0; i < 4; i++) {
      const cls = (s.slots[i] ? '' : 'empty') + (s.slotIndex === i ? ' on' : '');
      this._set('slot' + i, this.slotEls[i], 'class', cls);
    }

    // center
    this._set('xh', this.xhair, 'opacity', s.ads > 0.6 || s.hideCross ? '0' : '1');
    if (s.charge != null) {
      this.charge.style.opacity = '1';
      this.chargeCircle.style.strokeDashoffset = String(88 - 88 * s.charge);
      this.charge.classList.toggle('full', s.charge >= 1);
    } else this.charge.style.opacity = '0';
    if (s.prompt) this._set('prompt', this.promptEl, 'html', `<span class="key">${s.promptKey || 'E'}</span><span>${s.prompt}</span>`);
    else this._set('prompt', this.promptEl, 'html', '');
    this._set('hint', this.hintEl, 'text', s.hint || '');

    this.hitT -= dt;
    this.hitEl.style.opacity = this.hitT > 0 ? String(Math.min(1, this.hitT * 6)) : '0';
    if (this.bigT > 0) {
      this.bigT -= dt;
      if (this.bigT <= 0) this.bigEl.classList.remove('show');
    }

    // struggle
    if (s.grab) {
      this.struggleEl.classList.add('on');
      this.freeBar.style.width = `${s.grab.free * 100}%`;
      this.biteBar.style.width = `${Math.min(1, s.grab.bite) * 100}%`;
    } else this.struggleEl.classList.remove('on');
    if (s.extract != null) {
      this.extractEl.classList.add('on');
      this.extractBar.style.width = `${s.extract * 100}%`;
    } else this.extractEl.classList.remove('on');

    // screen fx
    this.hurtEl.style.opacity = String(Math.min(1, s.hurt));
    this.lowEl.style.opacity = s.health < s.maxHealth * 0.3 ? String(0.3 + (1 - s.health / (s.maxHealth * 0.3)) * 0.6) : '0';
    this.grabEl.style.opacity = s.grab ? '0.9' : '0';
    this.scopeEl.style.opacity = s.scope ? '1' : '0';
  }
}

export { fmtClock, fmtSec };
