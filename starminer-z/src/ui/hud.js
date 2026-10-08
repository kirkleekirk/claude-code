// The in-game HUD, laid out like CastleMiner Z on the Xbox 360.

import { ITEMS } from '../items/items.js';
import { iconFor } from '../items/icons.js';
import { HOTBAR } from '../items/inventory.js';

const HEART_FULL = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="#e21d27" stroke="#3a0004" stroke-width="1.4"/><path d="M5.2 4.2a2.6 2.6 0 0 0-2.3 2.4" stroke="#ff9a9a" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
const HEART_HALF = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="rgba(40,10,10,.55)" stroke="#3a0004" stroke-width="1.4"/><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6Z" fill="#e21d27"/></svg>';
const HEART_EMPTY = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="rgba(40,10,10,.55)" stroke="#3a0004" stroke-width="1.4"/></svg>';

export class HUD {
  constructor(parent, game) {
    this.game = game;
    const el = document.createElement('div');
    el.className = 'hud ui';
    el.innerHTML = `
      <div class="fps txt"></div>
      <div class="look txt"></div>
      <div class="dist txt"><div>Distance - Max</div><div class="dv">0 - 0</div></div>
      <div class="cross"><i></i><i></i><i></i><i></i></div>
      <div class="hit"></div>
      <div class="scope"></div>
      <div class="vignette"></div>
      <div class="feed txt"></div>
      <div class="hint txt"></div>
      <div class="award"><div class="ic">★</div><div class="t txt"><span class="at"></span><small class="ad"></small></div></div>
      <div class="day txt"></div>
      <div class="bottom">
        <div class="iname txt"></div>
        <div class="hearts"></div>
        <div class="hotbar"></div>
      </div>`;
    parent.appendChild(el);
    this.el = el;
    this.$ = (s) => el.querySelector(s);
    this.look = this.$('.look');
    this.dv = this.$('.dv');
    this.fps = this.$('.fps');
    this.iname = this.$('.iname');
    this.hearts = this.$('.hearts');
    this.cross = this.$('.cross');
    this.hitEl = this.$('.hit');
    this.dayEl = this.$('.day');
    this.feedEl = this.$('.feed');
    this.awardEl = this.$('.award');
    this.vig = this.$('.vignette');
    this.scope = this.$('.scope');
    this.hintEl = this.$('.hint');
    this.hotbar = this.$('.hotbar');
    this.slots = [];
    for (let i = 0; i < HOTBAR; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt="" draggable="false"><span class="n txt"></span><div class="dur"><b></b></div>';
      s.addEventListener('pointerdown', (e) => { e.stopPropagation(); game.inventory.select(i); });
      this.hotbar.appendChild(s);
      this.slots.push({ el: s, img: s.querySelector('img'), n: s.querySelector('.n'), dur: s.querySelector('.dur'), bar: s.querySelector('.dur b'), key: '' });
    }
    this.cache = {};
    this.feed = [];
    this.awards = [];
    this.awardTimer = 0;
    this.dayTimer = 0;
    this.hitTimer = 0;
    this.hintTimer = 0;
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  showDay(n) {
    this.dayEl.textContent = `Day ${n}`;
    this.dayEl.classList.add('on');
    this.dayTimer = 4;
  }

  message(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.feedEl.appendChild(d);
    this.feed.push({ el: d, t: 6 });
    if (this.feed.length > 6) { const o = this.feed.shift(); o.el.remove(); }
  }

  award(title, desc) {
    this.awards.push([title, desc]);
  }

  hint(text, t = 3) {
    this.hintEl.innerHTML = text;
    this.hintEl.classList.add('on');
    this.hintTimer = t;
  }

  hitMarker() { this.hitTimer = 0.12; this.hitEl.classList.add('on'); }

  hurt() {
    this.vig.classList.add('on');
    this.hearts.classList.remove('hurt');
    void this.hearts.offsetWidth;
    this.hearts.classList.add('hurt');
    clearTimeout(this._vt);
    this._vt = setTimeout(() => this.vig.classList.remove('on'), 120);
  }

  update(dt, s) {
    const g = this.game;
    this.el.style.display = s.visible ? '' : 'none';
    if (!s.visible) return;
    this.set('fps', this.fps, s.fps);
    this.set('look', this.look, s.lookName || '');
    this.set('dist', this.dv, `${s.distance} - ${s.maxDistance}`);
    // item name, with ammo for guns
    const slot = g.inventory.held;
    const it = slot ? ITEMS[slot.id] : null;
    let name = it ? it.name : 'Bare Hands';
    if (it && it.kind === 'gun') name += ` ${slot.mag ?? 0}/${g.inventory.count(it.ammo)}`;
    this.set('iname', this.iname, name);
    // hearts: ten, each worth a tenth of your health
    const hp = Math.max(0, Math.ceil((s.health / s.maxHealth) * 20));
    if (this.cache.hp !== hp) {
      this.cache.hp = hp;
      let h = '';
      for (let i = 0; i < 10; i++) h += hp >= (i + 1) * 2 ? HEART_FULL : hp === i * 2 + 1 ? HEART_HALF : HEART_EMPTY;
      this.hearts.innerHTML = h;
    }
    // hotbar
    for (let i = 0; i < HOTBAR; i++) {
      const sl = g.inventory.slots[i];
      const S = this.slots[i];
      const key = sl ? `${sl.id}|${sl.count}|${sl.dur ?? ''}|${i === g.inventory.selected}` : `|${i === g.inventory.selected}`;
      if (S.key === key) continue;
      S.key = key;
      S.el.classList.toggle('sel', i === g.inventory.selected);
      if (!sl) { S.img.removeAttribute('src'); S.img.style.display = 'none'; S.n.textContent = ''; S.dur.style.display = 'none'; continue; }
      const def = ITEMS[sl.id];
      S.img.src = iconFor(sl.id);
      S.img.style.display = '';
      S.n.textContent = def.stack > 1 && sl.count > 1 ? sl.count : '';
      if (sl.dur != null && def.durability) {
        S.dur.style.display = '';
        const f = Math.max(0, sl.dur / def.durability);
        S.bar.style.width = `${(f * 100).toFixed(0)}%`;
        S.bar.style.background = f > 0.5 ? 'var(--dura)' : f > 0.2 ? '#e0c030' : '#e03030';
      } else S.dur.style.display = 'none';
    }
    // crosshair opens up with a gun's spread
    this.cross.classList.toggle('gun', !!(it && it.kind === 'gun'));
    this.cross.style.setProperty('--spread', `${(s.spread || 0).toFixed(2)}em`);
    this.cross.style.display = s.scoped ? 'none' : '';
    this.scope.classList.toggle('on', !!s.scoped);
    // timers
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) this.hitEl.classList.remove('on'); }
    if (this.dayTimer > 0) { this.dayTimer -= dt; if (this.dayTimer <= 0) this.dayEl.classList.remove('on'); }
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hintEl.classList.remove('on'); }
    for (const f of this.feed) { f.t -= dt; if (f.t < 1) f.el.style.opacity = Math.max(0, f.t); }
    while (this.feed.length && this.feed[0].t <= 0) this.feed.shift().el.remove();
    if (this.awardTimer > 0) {
      this.awardTimer -= dt;
      if (this.awardTimer <= 0.5) this.awardEl.classList.remove('on');
    } else if (this.awards.length) {
      const [t, d] = this.awards.shift();
      this.awardEl.querySelector('.at').textContent = t;
      this.awardEl.querySelector('.ad').textContent = d;
      this.awardEl.classList.add('on');
      this.awardTimer = 4.5;
    }
  }
}
