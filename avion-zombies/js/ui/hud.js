import { PERKS } from '../game/weapons_data.js';
import { POWERUPS } from '../game/powerups.js';
import { perkIcon, powerupIcon, iconCanvas } from './icons.js';
import { formatTime } from '../util.js';

// DOM HUD. Only touches the DOM when a value actually changes.
const $ = (sel, root = document) => root.querySelector(sel);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.el = {
      round: $('#hud-round .num'),
      roundWrap: $('#hud-round'),
      points: $('#hud-points .value'),
      pops: $('#hud-points .pops'),
      perks: $('#hud-perks'),
      wname: $('#hud-weapon .name'),
      mag: $('#hud-weapon .mag'),
      reserve: $('#hud-weapon .reserve'),
      wlevel: $('#hud-weapon .level'),
      frag: $('#hud-equip .frag'),
      lure: $('#hud-equip .lure'),
      exo: $('#hud-exo'),
      exoPips: [...document.querySelectorAll('#hud-exo .pips i')],
      exoStatus: $('#hud-exo .status'),
      prompt: $('#hud-prompt'),
      promptKey: $('#hud-prompt .key'),
      promptText: $('#hud-prompt .text'),
      promptCost: $('#hud-prompt .cost'),
      promptSub: $('#hud-prompt .sub'),
      cross: $('#hud-crosshair'),
      hit: $('#hud-hitmarker'),
      msg: $('#hud-message'),
      msgTitle: $('#hud-message .title'),
      msgSub: $('#hud-message .sub'),
      banner: $('#hud-banner'),
      timers: $('#hud-powerups'),
      compass: $('#hud-compass .strip'),
      objective: $('#hud-objective .text'),
      objectiveWrap: $('#hud-objective'),
      down: $('#hud-down'),
      downBar: $('#hud-down .bar i'),
      scope: $('#hud-scope'),
      fps: $('#hud-fps'),
      dmg: $('#hud-damage'),
      stats: $('#hud-stats'),
      zone: $('#hud-zone'),
    };
    this.cache = {};
    this.hitT = 0;
    this.msgT = 0;
    this.bannerT = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.perkIcons = {};
    for (const [id, p] of Object.entries(PERKS)) {
      this.perkIcons[id] = iconCanvas((ctx, s) => perkIcon(ctx, s, id, p.color), 96).toDataURL();
    }
    this.puIcons = {};
    for (const id of Object.keys(POWERUPS)) this.puIcons[id] = iconCanvas((ctx, s) => powerupIcon(ctx, s, id, '#b8ffd9'), 96).toDataURL();
    this._buildCompass();
    this.dmgArcs = [];
  }

  _buildCompass() {
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let html = '';
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < 8; i++) {
        html += `<span class="c ${labels[i].length === 1 ? 'major' : ''}">${labels[i]}</span><span class="t">|</span><span class="t">|</span>`;
      }
    }
    this.el.compass.innerHTML = html;
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  show(on) {
    this.root.hidden = !on;
  }

  reset() {
    this.cache = {};
    this.el.perks.innerHTML = '';
    this.el.pops.innerHTML = '';
    this.el.timers.innerHTML = '';
    this.el.msg.classList.remove('show');
    this.el.banner.classList.remove('show');
    this.el.down.hidden = true;
    this.el.scope.hidden = true;
    this.el.roundWrap.classList.remove('flash');
    this.set('round', this.el.round, '');
  }

  roundStart(n, swarm) {
    this.set('round', this.el.round, String(n));
    const w = this.el.roundWrap;
    w.classList.remove('flash');
    void w.offsetWidth;
    w.classList.add('flash');
    if (swarm) this.message('EXO SWARM', 'They can jump now. Keep moving.', 3.5, 'danger');
    else if (n === 1) this.message('ROUND 1', 'Survive.', 2.5);
  }

  roundEnd() {
    const w = this.el.roundWrap;
    w.classList.remove('flash');
    void w.offsetWidth;
    w.classList.add('flash');
  }

  message(title, sub = '', time = 3, kind = '') {
    this.el.msgTitle.textContent = title;
    this.el.msgSub.textContent = sub;
    this.el.msg.className = 'show ' + kind;
    this.msgT = time;
  }

  powerupBanner(name) {
    this.el.banner.textContent = name;
    this.el.banner.classList.remove('show');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('show');
    this.bannerT = 2.5;
  }

  objective(text) {
    this.set('obj', this.el.objective, text || '');
    this.el.objectiveWrap.hidden = !text;
  }

  hitmarker(kill, head) {
    const h = this.el.hit;
    h.className = '';
    void h.offsetWidth;
    h.className = 'show' + (kill ? ' kill' : '') + (head ? ' head' : '');
    this.game.audio.play(kill ? 'hit_kill' : 'hitmarker', { bus: 'ui', volume: kill ? 0.5 : 0.4 });
  }

  pointsPop(amount, doubled) {
    const d = document.createElement('div');
    d.className = 'pop' + (doubled ? ' double' : '') + (amount < 0 ? ' spend' : '');
    d.textContent = (amount > 0 ? '+' : '') + amount;
    d.style.setProperty('--dx', Math.round(Math.random() * 40 + 10) + 'px');
    this.el.pops.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  addPerk(id) {
    const img = document.createElement('img');
    img.src = this.perkIcons[id];
    img.alt = PERKS[id].name;
    img.title = PERKS[id].name;
    img.dataset.perk = id;
    this.el.perks.appendChild(img);
  }

  clearPerks() {
    this.el.perks.innerHTML = '';
  }

  weaponChanged() {
    this.cache.wname = null;
  }

  setScope(on, style = 'sniper') {
    this.el.scope.hidden = !on;
    this.el.scope.dataset.style = style;
    this.el.cross.classList.toggle('hidden-scope', on);
  }

  damageFrom(angle) {
    const d = document.createElement('div');
    d.className = 'arc';
    d.style.setProperty('--a', angle + 'rad');
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  setDown(on) {
    this.el.down.hidden = !on;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const W = g.weapons;
    this.set('points', this.el.points, String(p.points));
    // weapon
    const c = W.cur;
    if (c) {
      this.set('wname', this.el.wname, c.stats.name);
      this.set('mag', this.el.mag, String(c.mag));
      this.set('reserve', this.el.reserve, String(c.reserve));
      this.set('wlevel', this.el.wlevel, c.level ? 'UPGRADED • LV ' + c.level : '');
      const low = c.mag <= Math.ceil(c.stats.mag * 0.25);
      this.set('lowammo', this.el.mag, low ? 'mag low' : 'mag', 'className');
    } else {
      this.set('wname', this.el.wname, 'UNARMED');
      this.set('mag', this.el.mag, '-');
      this.set('reserve', this.el.reserve, '-');
      this.set('wlevel', this.el.wlevel, '');
    }
    this.set('frag', this.el.frag, '◆'.repeat(W.frags) || '—');
    this.set('lure', this.el.lure, W.lures ? 'LURE ×' + W.lures : '');
    // exo
    const ex = p.exo;
    this.set('exoOn', this.el.exo, ex.has ? (ex.emp > 0 ? 'emp' : ex.surge ? 'surge' : '') : 'off', 'className');
    if (ex.has) {
      for (let i = 0; i < 2; i++) {
        const full = ex.charges > i;
        const partial = !full && ex.charges === i ? ex.recharge / 2.4 : 0;
        const v = full ? 1 : partial;
        const key = 'pip' + i;
        const q = Math.round(v * 20) / 20;
        if (this.cache[key] !== q) {
          this.cache[key] = q;
          this.el.exoPips[i].style.setProperty('--fill', q);
        }
      }
      this.set('exoStatus', this.el.exoStatus, ex.emp > 0 ? 'OFFLINE ' + Math.ceil(ex.emp) + 's' : ex.surge ? 'SURGE' : 'ONLINE');
    } else this.set('exoStatus', this.el.exoStatus, 'NO SUIT');
    // prompt
    const pr = g.interact.prompt;
    if (pr) {
      this.el.prompt.hidden = false;
      const key = g.input.lastDevice === 'pad' ? 'X' : g.input.lastDevice === 'touch' ? '☝' : 'F';
      this.set('pkey', this.el.promptKey, pr.disabled ? '' : key);
      this.set('ptext', this.el.promptText, pr.text);
      const afford = pr.cost == null || pr.cost <= p.points;
      this.set('pcost', this.el.promptCost, pr.cost == null ? '' : pr.cost === 0 ? 'FREE' : String(pr.cost));
      this.set('pcostc', this.el.promptCost, afford ? 'cost' : 'cost poor', 'className');
      this.set('psub', this.el.promptSub, pr.sub || '');
      this.set('pdis', this.el.prompt, pr.disabled ? 'disabled' : '', 'className');
    } else this.el.prompt.hidden = true;
    // crosshair spread
    const spread = c ? Math.max(4, (c.stats.spreadHip * (1 - W.ads) + W.bloom) * 6) : 6;
    const sp = Math.round(spread);
    if (this.cache.spread !== sp) {
      this.cache.spread = sp;
      this.el.cross.style.setProperty('--spread', sp + 'px');
    }
    this.set('crossHide', this.el.cross, W.ads > 0.6 || p.sprinting || !c ? 'hide' : '', 'className');
    // compass
    const deg = ((-p.yaw * 180) / Math.PI + 360) % 360;
    const px = Math.round(deg * 2.4);
    if (this.cache.compass !== px) {
      this.cache.compass = px;
      // strip: 3 repeats x 8 headings x 108px; centre the current heading in a 360px window
      this.el.compass.style.transform = `translateX(${-(px + 864 + 18 - 180)}px)`;
    }
    // messages
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.el.msg.classList.remove('show');
    }
    // power-up timers
    const timers = g.powerups.timerList();
    const sig = timers.map((t) => t.id + Math.ceil(t.t)).join(',');
    if (this.cache.timers !== sig) {
      this.cache.timers = sig;
      this.el.timers.innerHTML = timers.map((t) => `<div class="pu ${t.t < 6 ? 'blink' : ''}"><img src="${this.puIcons[t.id]}" alt=""><span>${Math.ceil(t.t)}</span></div>`).join('');
    }
    // downed
    if (p.downed) this.el.downBar.style.width = Math.max(0, (1 - p.downT / 6) * 100) + '%';
    // fps
    if (g.settings.get('showFps')) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        this.el.fps.hidden = false;
        this.el.fps.textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS';
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    } else this.el.fps.hidden = true;
    // zone name
    const zid = p.zone;
    const zname = zid >= 0 ? g.map.ZONES[zid].name : '';
    this.set('zone', this.el.zone, zname);
    // scoreboard
    const showStats = g.input.held.stats;
    this.el.stats.hidden = !showStats;
    if (showStats) {
      const s = g.stats;
      const html = `<h3>RAINSHADOW — ROUND ${g.director.round || 0}</h3><dl><dt>Kills</dt><dd>${s.kills}</dd><dt>Headshots</dt><dd>${s.headshots}</dd><dt>Points earned</dt><dd>${s.earned}</dd><dt>Downs</dt><dd>${s.downs}</dd><dt>Time</dt><dd>${formatTime(s.time)}</dd></dl>`;
      if (this.cache.statsHtml !== html) {
        this.cache.statsHtml = html;
        this.el.stats.innerHTML = html;
      }
    }
  }
}
