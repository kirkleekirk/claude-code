// The in-game HUD, laid out like CastleMiner Z on the Xbox 360.

import { Vector3 } from 'three';
import { ITEMS } from '../items/items.js';
import { iconFor } from '../items/icons.js';
import { HOTBAR } from '../items/inventory.js';

const HEART_FULL = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="#e21d27" stroke="#3a0004" stroke-width="1.4"/><path d="M5.2 4.2a2.6 2.6 0 0 0-2.3 2.4" stroke="#ff9a9a" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
const HEART_HALF = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="rgba(40,10,10,.55)" stroke="#3a0004" stroke-width="1.4"/><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6Z" fill="#e21d27"/></svg>';
const _v = new Vector3();

const HEART_EMPTY = '<svg viewBox="0 0 20 18"><path d="M10 17.2 1.9 9.4A5 5 0 0 1 10 2.6a5 5 0 0 1 8.1 6.8Z" fill="rgba(40,10,10,.55)" stroke="#3a0004" stroke-width="1.4"/></svg>';

export class HUD {
  constructor(parent, game) {
    this.game = game;
    const el = document.createElement('div');
    el.className = 'hud ui';
    el.innerHTML = `
      <div class="tags"></div>
      <div class="fps txt"></div>
      <div class="net txt"></div>
      <div class="look txt"></div>
      <div class="dist txt"><div>Distance - Max</div><div class="dv">0 - 0</div></div>
      <div class="cross"><i></i><i></i><i></i><i></i></div>
      <div class="hit"></div>
      <div class="redness"></div>
      <div class="arrows"></div>
      <div class="lock"></div>
      <div class="scope"></div>
      <div class="vignette"></div>
      <div class="feed txt"></div>
      <div class="hint txt"></div>
      <div class="boss txt"><div class="bn">Mothership Core</div><div class="bb"><b></b></div><div class="bp"><i></i><i></i><i></i><i></i></div><div class="bs"></div></div>
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
    this.lockEl = this.$('.lock');
    this.hintEl = this.$('.hint');
    this.bossEl = this.$('.boss');
    this.bossFill = this.$('.boss .bb b');
    this.bossPips = [...this.el.querySelectorAll('.boss .bp i')];
    this.bossNote = this.$('.boss .bs');
    this.netEl = this.$('.net');
    this.tagsEl = this.$('.tags');
    this.hotbar = this.$('.hotbar');
    this.redEl = this.$('.redness');
    this.arrowsEl = this.$('.arrows');
    // the arrows pointing at what hurt you (InGameHUD's DamageIndicators): { at, t, el }
    this.arrows = [];
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

  // (the original's: three seconds in, three on show, three out)
  showDay(n) {
    this.dayEl.textContent = `Day ${n}`;
    this.dayEl.classList.add('on');
    this.dayTimer = 6;
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

  // The alien ship's core, while you're in its hall (b: { core: 0-1, nodes: [up, ...], shielded }),
  // or nothing (null).
  bossBar(b) {
    this.bossEl.classList.toggle('on', !!b);
    if (!b) return;
    this.set('bossW', this.bossFill.style, `${Math.max(0, Math.min(1, b.core)) * 100}%`, 'width');
    this.bossEl.classList.toggle('shielded', b.shielded);
    b.nodes.forEach((up, k) => this.bossPips[k]?.classList.toggle('off', !up));
    this.set('bossNote', this.bossNote, b.shielded ? 'Shielded: break the power nodes' : 'Its shield is down', 'textContent');
  }

  // ---- names over other players' heads (online) ----------------------------------------------

  addTag(name) {
    const el = document.createElement('div');
    el.className = 'tag txt';
    el.textContent = name;
    el.style.display = 'none';
    this.tagsEl.appendChild(el);
    return { el, shown: false };
  }

  // over the point pos (null: not shown), as the camera sees it
  placeTag(tag, pos, cam) {
    let show = false;
    if (pos && cam) {
      const d = cam.position.distanceTo(pos);
      _v.copy(pos).project(cam);
      show = _v.z > -1 && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && d < 160;
      if (show) {
        const W = this.el.clientWidth, H = this.el.clientHeight;
        tag.el.style.transform = `translate(${(((_v.x + 1) / 2) * W).toFixed(1)}px, ${(((1 - _v.y) / 2) * H).toFixed(1)}px) translate(-50%, -100%)`;
        tag.el.style.opacity = d > 60 ? '0.65' : '1';
      }
    }
    if (show !== tag.shown) { tag.shown = show; tag.el.style.display = show ? '' : 'none'; }
  }

  removeTag(tag) { tag.el.remove(); }

  // hurt, from somewhere (or nowhere: a fall, lava)
  hurt(from = null) {
    if (from) {
      const el = document.createElement('div');
      el.className = `arrow${document.documentElement.classList.contains('cmz-ui') ? ' spf-DamageArrow spm-DamageArrow' : ''}`;
      this.arrowsEl.appendChild(el);
      this.arrows.push({ at: from.clone(), t: 3, el });
      if (this.arrows.length > 8) this.arrows.shift().el.remove();
    }
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
    const o = g.online;
    this.set('net', this.netEl, o ? (o.host ? `Online · Code ${o.code} · ${o.count} player${o.count === 1 ? '' : 's'}` : `Online · ${o.count} players`) : '');
    this.set('look', this.look, s.lookName || '');
    this.set('dist', this.dv, `${s.distance} - ${s.maxDistance}`);
    // item name, with ammo for guns
    const slot = g.inventory.held;
    const it = slot ? ITEMS[slot.id] : null;
    let name = it ? it.name : 'Bare Hands';
    if (it && it.kind === 'gun') name += ` ${slot.mag ?? 0}/${g.inventory.count(it.ammo)}`;
    // a locator: its name, and how far it is to where it's set (GPSItem.GetDisplayText; unset,
    // to the world's middle)
    if (slot?.gps) {
      const a = slot.gps.at, P = g.player.pos;
      const d = a ? Math.hypot(P.x - a[0], P.y - a[1], P.z - a[2]) : Math.hypot(P.x, P.y - 64, P.z);
      name += `: ${slot.gps.name} - Distance: ${Math.floor(d)}`;
    }
    this.set('iname', this.iname, name);
    // hearts: ten, each worth a tenth of your health (with the original's art: its row of
    // hearts over their outlines, filled as far as your health goes)
    const f = Math.max(0, Math.min(1, s.health / s.maxHealth));
    if (document.documentElement.classList.contains('cmz-ui')) {
      if (!this.hbar) {
        this.hearts.innerHTML = '<div class="hbar sp-HealthBarEmpty sz"><div class="fill"><div class="sp-HealthBarFull sz"></div></div></div>';
        this.hbar = this.hearts.querySelector('.fill');
        this.cache.hp = null;
      }
      const w = `${(f * 100).toFixed(1)}%`;
      if (this.cache.hp !== w) { this.cache.hp = w; this.hbar.style.width = w; }
    } else {
      const hp = Math.max(0, Math.ceil(f * 20));
      if (this.cache.hp !== hp) {
        this.cache.hp = hp;
        let h = '';
        for (let i = 0; i < 10; i++) h += hp >= (i + 1) * 2 ? HEART_FULL : hp === i * 2 + 1 ? HEART_HALF : HEART_EMPTY;
        this.hearts.innerHTML = h;
      }
    }
    // the screen goes red the more you're hurt
    const red = s.dead ? 0 : (1 - f) * 0.47;
    const rk = red.toFixed(3);
    if (this.cache.red !== rk) { this.cache.red = rk; this.redEl.style.opacity = rk; }
    // the arrows: three seconds each, fading over the last third, round the middle of the screen
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t -= dt;
      if (a.t <= 0 || s.dead || !s.pos) { a.el.remove(); this.arrows.splice(i, 1); continue; }
      const dx = a.at.x - s.pos.x, dz = a.at.z - s.pos.z;
      // into the player's own frame (they face -z at yaw 0)
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const ang = Math.atan2(lx, -lz), fade = a.t / 3 > 0.33 ? 1 : (a.t / 3) * 3;
      a.el.style.transform = `translate(-50%, -100%) rotate(${ang.toFixed(3)}rad) translateY(-9.4em)`;
      a.el.style.opacity = fade.toFixed(2);
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
      if (sl.dur != null && def.uses > 1) {
        S.dur.style.display = '';
        const f = Math.max(0, sl.dur / def.uses);
        S.bar.style.width = `${(f * 100).toFixed(0)}%`;
        S.bar.style.background = f > 0.5 ? 'var(--dura)' : f > 0.2 ? '#e0c030' : '#e03030';
      } else S.dur.style.display = 'none';
    }
    // crosshair opens up with a gun's spread
    this.cross.classList.toggle('gun', !!(it && it.kind === 'gun'));
    this.cross.style.setProperty('--spread', `${(s.spread || 0).toFixed(2)}em`);
    this.cross.style.display = s.scoped || s.shoulder ? 'none' : '';
    this.scope.classList.toggle('on', !!s.scoped);
    // the guided launcher's box round the dragon: green while it locks on, red once it has
    // (InGameHUD's MissleLocking and MissleLock, on the original's 720-line screen)
    const lk = s.scoped ? s.lock : null;
    if (lk) {
      const W = this.el.clientWidth, H = this.el.clientHeight, px = (lk.size * H) / 720;
      const sp = lk.locked ? 'MissleLock' : 'MissleLocking';
      this.set('lockc', this.lockEl, `lock on${lk.locked ? ' locked' : ''} spf-${sp} spm-${sp}`, 'className');
      this.lockEl.style.width = this.lockEl.style.height = `${px.toFixed(1)}px`;
      this.lockEl.style.transform = `translate(${(lk.x * W - px / 2).toFixed(1)}px, ${(lk.y * H - px / 2).toFixed(1)}px)`;
    } else this.set('lockc', this.lockEl, 'lock', 'className');
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
