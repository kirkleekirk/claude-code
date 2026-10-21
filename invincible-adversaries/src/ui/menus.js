import { HEROES, HERO_KEYS } from '../heroes/data.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);

export class Menus {
  constructor(game) {
    this.g = game;
    this.selected = 'invincible';
    this.bindTitle();
    this.buildSelect();
    this.bindPause();
  }
  sfx(n) { this.g.audio && this.g.audio.ready && this.g.audio.play(n, { ui: true, vol: 0.7 }); }
  hover(el) { el.addEventListener('mouseenter', () => this.sfx('ui_hover')); }

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    document.body.dataset.screen = id || 'game';
  }

  bindTitle() {
    const play = $('#btn-play');
    this.hover(play);
    play.addEventListener('click', async () => {
      await this.g.ensureAudio();
      this.sfx('ui_select');
      this.g.toSelect();
    });
    const ctl = $('#btn-controls');
    this.hover(ctl);
    ctl.addEventListener('click', async () => { await this.g.ensureAudio(); this.sfx('ui_click'); $('#controls-panel').classList.toggle('open'); });
  }

  buildSelect() {
    const cards = $('#hero-cards');
    cards.innerHTML = HERO_KEYS.map((k, i) => {
      const d = HEROES[k];
      return `<button class="card ${k}" data-k="${k}"><span class="num">${i + 1}</span><span class="role">${d.role}</span><span class="name">${d.name}</span><span class="tag">${d.roleTag}</span><span class="hp">${d.hp} HP</span></button>`;
    }).join('');
    for (const c of cards.querySelectorAll('.card')) {
      this.hover(c);
      c.addEventListener('click', () => { this.pick(c.dataset.k); });
      c.addEventListener('dblclick', () => { this.pick(c.dataset.k); this.lockIn(); });
    }
    const lock = $('#btn-lock');
    this.hover(lock);
    lock.addEventListener('click', () => this.lockIn());
    window.addEventListener('keydown', (e) => {
      if (document.body.dataset.screen !== 'select') return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) this.pick(HERO_KEYS[i]);
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.lockIn(); }
      const n = HERO_KEYS.length;
      if (e.code === 'ArrowRight') this.pick(HERO_KEYS[(HERO_KEYS.indexOf(this.selected) + 1) % n]);
      if (e.code === 'ArrowLeft') this.pick(HERO_KEYS[(HERO_KEYS.indexOf(this.selected) + n - 1) % n]);
    });
    this.pick(this.selected, true);
  }

  pick(k, silent) {
    this.selected = k;
    if (!silent) this.sfx('ui_click');
    for (const c of document.querySelectorAll('#hero-cards .card')) c.classList.toggle('sel', c.dataset.k === k);
    const d = HEROES[k];
    const det = $('#hero-detail');
    det.dataset.hero = k;
    const ab = d.abilities;
    const row = (a) => `<div class="ab"><div class="ico">${icon(a.icon)}</div><div class="txt"><div class="t"><kbd>${a.key}</kbd>${a.name}</div><div class="d">${a.desc}</div></div></div>`;
    det.innerHTML = `
      <div class="hd"><div class="role">${d.role} · ${d.roleTag}</div><div class="nm">${d.name}</div><div class="real">${d.real}</div></div>
      <div class="stats"><span><b>${d.hp}</b> HP</span><span><b>${d.speed}</b> m/s run</span><span><b>${d.flight.unlimited ? '∞' : d.flight.duration + 's'}</b> flight</span></div>
      <div class="passive"><div class="t">PASSIVE · ${d.passive.name}</div><div class="d">${d.passive.desc}</div></div>
      ${row(ab.primary)}${row(ab.secondary)}${row(ab.a1)}${row(ab.a2)}${row(ab.a3)}
      <div class="ult">${row(ab.ult)}</div>`;
    det.scrollTop = 0;
    // on short screens the list scrolls: fade its bottom edge while there's more below
    if (!this.detFade) {
      this.detFade = () => det.classList.toggle('more', det.scrollTop + det.clientHeight < det.scrollHeight - 4);
      det.addEventListener('scroll', this.detFade, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(this.detFade).observe(det);
      window.addEventListener('resize', this.detFade);
    }
    this.detFade();
    this.g.previewHero(k);
  }

  lockIn() {
    this.sfx('ui_select');
    this.g.startMatch(this.selected);
  }

  bindPause() {
    const g = this.g;
    const bind = (id, fn) => { const el = $(id); if (!el) return; this.hover(el); el.addEventListener('click', () => { this.sfx('ui_click'); fn(el); }); };
    bind('#btn-resume', () => g.resume());
    bind('#btn-change', () => { g.resume(false); g.toSelect(true); });
    bind('#btn-quit', () => { g.toTitle(); });
    const s = g.world.settings;
    const toggles = {
      'opt-nocd': ['noCooldowns'], 'opt-fastult': ['fastUlt'], 'opt-god': ['godMode'], 'opt-gore': ['gore'], 'opt-comic': ['comic'],
    };
    for (const id in toggles) {
      const el = document.getElementById(id);
      if (!el) continue;
      const k = toggles[id][0];
      el.checked = !!s[k];
      el.addEventListener('change', () => { s[k] = el.checked; if (k === 'gore') g.fx.gore = el.checked; this.sfx('ui_click'); });
    }
    const sel = (id, fn, init) => { const el = document.getElementById(id); if (!el) return; el.value = init; el.addEventListener('change', () => { fn(el.value); this.sfx('ui_click'); }); };
    sel('opt-bots', (v) => { s.bots = v; }, s.bots);
    sel('opt-diff', (v) => { s.difficulty = v; }, s.difficulty);
    sel('opt-quality', (v) => { g.setQuality(v); }, g.renderer.qualityName);
    const sens = document.getElementById('opt-sens');
    if (sens) { sens.value = g.camRig.sens * 1000; sens.addEventListener('input', () => { g.camRig.sens = sens.value / 1000; g.saveSettings(); }); }
    const vol = document.getElementById('opt-vol');
    if (vol) { vol.value = g.audio.volume * 100; vol.addEventListener('input', () => { g.audio.setVolume(vol.value / 100); g.saveSettings(); }); }
    const inv = document.getElementById('opt-invert');
    if (inv) { inv.checked = g.camRig.invertY; inv.addEventListener('change', () => { g.camRig.invertY = inv.checked; g.saveSettings(); }); }
    bind('#btn-fillult', () => { if (g.player) g.player.ult = g.player.def.ultCost; });
    bind('#btn-resetcd', () => { if (g.player) { for (const k in g.player.cd) g.player.cd[k] = 0; const ab = g.player.def.abilities; for (const k in ab) if (ab[k].charges) g.player.charges[k] = ab[k].charges; } });
    bind('#btn-killbots', () => { for (const h of g.world.heroes) if (h.team === 1 && !h.dead) g.world.damage(null, h, 99999, {}); });
  }
}
