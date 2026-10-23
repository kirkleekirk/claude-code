import * as THREE from 'three';
import { HEROES } from '../heroes/data.js';
import { icon } from './icons.js';
import { clamp, clamp01 } from '../engine/math.js';

const _v = new THREE.Vector3();
const KEYS = ['secondary', 'a1', 'a2', 'a3'];
const HERO_ICON = { invincible: 'dash', eve: 'field', omniman: 'ult_omni', robot: 'cannon', rex: 'coin', battlebeast: 'claws' };

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('hud');
    this.q = (s) => this.el.querySelector(s);
    this.overlay = document.getElementById('overlay');
    this.ctx = this.overlay.getContext('2d');
    this.nums = [];
    this.arcs = [];
    this.hitT = 0; this.killT = 0;
    this.lastHp = -1; this.lagHp = 0;
    this.built = null;
    this.announceT = 0;
    this.feedVersion = -1;
    const w = game.world;
    w.on('damage', (e) => this.onDamage(e));
    w.on('heal', (e) => this.onHeal(e));
    w.on('kill', (e) => this.onKill(e));
    w.on('ult', (e) => this.announce(e.name, e.hero));
    w.on('eveChoice', (e) => this.choice(e));
    w.on('message', (e) => { if (e.hero === this.g.player) this.toast(e.text); });
    w.on('revive', (e) => { if (e.hero === this.g.player) this.announce('RECONSTRUCTED', e.by, 'by Atom Eve'); });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = innerWidth * dpr; this.overlay.height = innerHeight * dpr;
    this.overlay.style.width = innerWidth + 'px'; this.overlay.style.height = innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  build(hero) {
    this.built = hero;
    const d = hero.def;
    this.el.dataset.hero = hero.key;
    this.q('#bl .hname').innerHTML = `${d.name}<span class="role">${d.role}</span>`;
    this.q('#bl .passive').textContent = d.passive.name;
    const segs = this.q('#bl .segs');
    segs.innerHTML = '';
    const n = Math.round(hero.maxHp / 25);
    for (let i = 1; i < n; i++) { const s = document.createElement('i'); s.style.left = (i / n * 100) + '%'; segs.appendChild(s); }
    this.q('#bl .flight').classList.toggle('hidden', !d.flight || d.flight.unlimited);
    // heroes who can't fly get their mobility move in the hint instead of take-off and descend
    this.q('#keyhint').innerHTML = d.flight
      ? '<kbd>WASD</kbd> move <kbd>SPACE</kbd> jump · double-tap to fly <kbd>CTRL</kbd> descend <kbd>H</kbd> swap hero <kbd>ESC</kbd> menu'
      : `<kbd>WASD</kbd> move <kbd>SPACE</kbd> jump <kbd>SHIFT</kbd> ${d.abilities.a1.name.toLowerCase()} <kbd>H</kbd> swap hero <kbd>ESC</kbd> menu`;
    const ab = this.q('#abilities');
    ab.innerHTML = '';
    this.tiles = {};
    for (const k of KEYS) {
      const a = d.abilities[k];
      const t = document.createElement('div');
      t.className = 'tile';
      t.innerHTML = `<div class="ico">${icon(a.icon)}</div><svg class="sweep" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" pathLength="100"/></svg><div class="cd"></div><div class="key">${a.key}</div><div class="charges"></div><div class="nm">${a.name}</div>`;
      ab.appendChild(t);
      this.tiles[k] = { el: t, cd: t.querySelector('.cd'), sweep: t.querySelector('.sweep circle'), ch: t.querySelector('.charges'), last: '' };
    }
    const u = this.q('#ult');
    u.querySelector('.ico').innerHTML = icon(d.abilities.ult.icon);
    u.querySelector('.uname').textContent = d.abilities.ult.name;
    this.q('#crosshair').className = 'xh-' + hero.key;
    this.lastHp = -1;
  }

  update(dt) {
    const g = this.g, p = g.player, w = g.world;
    if (!p) return;
    if (this.built !== p) this.build(p);
    // health
    const hp = Math.max(0, p.hp), max = p.maxHp;
    if (Math.abs(hp - this.lastHp) > 0.2 || p.overhealth || p.bubble) {
      const tot = max;
      this.q('#bl .hp').style.width = (hp / tot * 100) + '%';
      this.q('#bl .oh').style.width = (Math.min(p.overhealth, tot) / tot * 100) + '%';
      this.q('#bl .sh').style.width = (p.bubble ? Math.min(p.bubble.amt, tot) / tot * 100 : 0) + '%';
      this.q('#bl .hptext').innerHTML = `<b>${Math.ceil(hp)}</b><span>/ ${max}</span>${p.overhealth > 0 ? `<em class="ohn">+${Math.ceil(p.overhealth)}</em>` : ''}${p.bubble ? `<em class="shn">◯${Math.ceil(p.bubble.amt)}</em>` : ''}`;
      this.lastHp = hp;
    }
    this.lagHp = this.lagHp > hp ? Math.max(hp, this.lagHp - max * 0.6 * dt) : hp;
    this.q('#bl .lag').style.width = (this.lagHp / max * 100) + '%';
    this.el.classList.toggle('lowhp', hp / max < 0.35 && !p.dead);
    g.renderer.fx.lowHp = !p.dead && hp / max < 0.3 ? (0.3 - hp / max) * 1.6 : 0;
    // flight
    if (p.def.flight && !p.def.flight.unlimited) {
      const f = this.q('#bl .flight');
      f.querySelector('.fill').style.width = (p.flyEnergy * 100) + '%';
      f.classList.toggle('active', p.mode === 'fly');
    }
    // status chips
    const chips = [];
    if (p.status.vuln > 0) chips.push('<span class="chip bad">VULNERABLE</span>');
    if (p.status.slow > 0) chips.push('<span class="chip bad">SLOWED</span>');
    if (p.status.stunT > 0) chips.push('<span class="chip bad">STUNNED</span>');
    if (p.status.disruptT > 0) chips.push('<span class="chip bad">DISRUPTED</span>');
    if (p.status.weak > 0) chips.push('<span class="chip bad">WEAKENED</span>');
    if (p.status.haste > 0) chips.push('<span class="chip good">OVERCLOCK</span>');
    if (p.status.uplinkT > 0 && p.key !== 'robot') chips.push('<span class="chip robot">UPLINK</span>');
    if (p.status.boost > 0) chips.push('<span class="chip good">+DMG</span>');
    if (p.status.dr > 0) chips.push('<span class="chip good">-DMG TAKEN</span>');
    if (p.bubble) chips.push('<span class="chip eve">BUBBLE</span>');
    if (p.key === 'battlebeast' && p.kit) {
      if (p.kit.rage > 0.5) chips.push('<span class="chip beast">ENRAGED</span>');
      if (p.kit.bracing) chips.push('<span class="chip beast">BRACING</span>');
      if (p.kit.counterReady || p.kit.counterT > p.world.time) chips.push('<span class="chip beast">COUNTER</span>');
    }
    if (p.key === 'rex' && p.kit && p.kit.rods.some((r) => r.armed)) chips.push('<span class="chip rex">RMB: DETONATE</span>');
    if (p.mode === 'fly') chips.push('<span class="chip fly">FLYING</span>');
    const cs = chips.join('');
    if (cs !== this._chips) { this.q('#bl .status').innerHTML = cs; this._chips = cs; }
    // abilities
    for (const k of KEYS) {
      const t = this.tiles[k], a = p.def.abilities[k];
      const cd = p.cd[k] || 0, total = (a.cd || 1) * (w.settings.noCooldowns ? 0.02 : 1);
      const charges = a.charges ? p.charges[k] : null;
      const ready = a.charges ? charges > 0 : cd <= 0;
      const key = `${ready}|${Math.ceil(cd * 10)}|${charges}`;
      if (key !== t.last) {
        t.last = key;
        t.el.classList.toggle('ready', ready);
        t.el.classList.toggle('cooling', cd > 0);
        t.cd.textContent = cd > 0 && !ready ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
        t.sweep.style.strokeDashoffset = cd > 0 ? (100 - (1 - cd / total) * 100) : 0;
        t.ch.textContent = a.charges ? '●'.repeat(charges) + '○'.repeat(a.charges - charges) : '';
        if (ready && this._wasCooling && this._wasCooling[k]) { t.el.classList.remove('pop'); void t.el.offsetWidth; t.el.classList.add('pop'); }
      }
      (this._wasCooling ||= {})[k] = !ready;
    }
    // ult
    const u = this.q('#ult');
    const pct = Math.floor(p.ultPct * 100);
    if (pct !== this._ultPct) {
      this._ultPct = pct;
      u.querySelector('.ring').style.strokeDashoffset = 100 - pct;
      u.querySelector('.pct').textContent = p.ultReady ? '' : pct + '%';
      if (p.ultReady && !u.classList.contains('ready')) g.audio && g.audio.play('ult_ready', { ui: true, vol: 0.8 });
      u.classList.toggle('ready', p.ultReady);
    }
    // hit marker
    this.hitT = Math.max(0, this.hitT - dt);
    this.killT = Math.max(0, this.killT - dt);
    const hm = this.q('#hitmarker');
    hm.style.opacity = Math.max(this.hitT / 0.18, this.killT / 0.35);
    hm.classList.toggle('kill', this.killT > 0);
    // team bar
    this.updateTeams();
    this.updateFeed();
    // respawn
    const rs = this.q('#respawn');
    rs.classList.toggle('hidden', !p.dead);
    if (p.dead) {
      rs.querySelector('b').textContent = Math.max(0, Math.ceil(p.respawnT));
      const eveAlly = w.heroes.some((x) => x.team === p.team && x.key === 'eve' && !x.dead && x !== p);
      rs.querySelector('.hint').style.display = eveAlly ? '' : 'none';
    }
    // announcements
    this.announceT -= dt;
    if (this.announceT <= 0) this.q('#announce').classList.remove('show');
    this.drawOverlay(dt);
  }

  updateTeams() {
    const w = this.g.world;
    for (const team of [0, 1]) {
      const box = this.q(`#topbar .t${team} .slots`);
      const list = w.heroes.filter((h) => h.team === team);
      const sig = list.map((h) => `${h.key}${h.dead ? Math.ceil(h.respawnT) : ''}${h.ultReady ? 'U' : ''}`).join(',');
      if (box.dataset.sig === sig) continue;
      box.dataset.sig = sig;
      box.innerHTML = list.map((h) => `<div class="slot ${h.key} ${h.dead ? 'dead' : ''} ${h === this.g.player ? 'me' : ''}">${icon(HERO_ICON[h.key])}${h.dead ? `<b>${Math.ceil(h.respawnT)}</b>` : ''}${h.ultReady && !h.dead ? '<u></u>' : ''}</div>`).join('');
      this.q(`#topbar .t${team} .score`).textContent = w.score[team];
    }
  }
  updateFeed() {
    const w = this.g.world;
    const f = this.q('#feed');
    const now = w.time;
    const items = w.feed.filter((e) => now - e.t < 7);
    const sig = items.map((e) => e.t).join(',');
    if (sig === this._feedSig) return;
    this._feedSig = sig;
    f.innerHTML = items.map((e) => {
      const k = e.killer, v = e.victim;
      const kn = k ? `<span class="t${k.team}">${k.name}</span>` : `<span>${w.mode ? 'Spawn defenses' : 'The Arena'}</span>`;
      return `<div class="kf">${kn}<i>${icon(k ? HERO_ICON[k.key] : 'bolt')}</i><span class="t${v.team}">${v.name}</span></div>`;
    }).join('');
  }

  // ---------- events ----------
  onDamage(e) {
    const p = this.g.player;
    if (!p) return;
    if (e.src === p && e.target !== p) {
      this.hitT = 0.18;
      this.g.audio && this.g.audio.play('hitmark', { ui: true, vol: 0.5, minGap: 0.04 });
      this.addNum(e.hitPos, Math.round(e.amount), e.absorbed > 0 ? '#ff8ff0' : (e.target.status.vuln > 0 ? '#ff9a3c' : '#ffe14a'), e.amount > 90);
    }
    if (e.target === p && e.src && e.src !== p) {
      this.addArc(e.src.pos);
      this.g.renderer.fx.damage = Math.min(0.6, this.g.renderer.fx.damage + e.amount / p.maxHp * 1.5);
      this.g.camRig.addTrauma(clamp(e.amount / 200, 0.05, 0.35));
      this.g.audio && this.g.audio.play('hurt', { ui: true, vol: 0.4, minGap: 0.08 });
    }
  }
  onHeal(e) {
    const p = this.g.player;
    if (!p) return;
    if ((e.src === p || e.target === p) && e.amount >= 1) this.addNum(_v.copy(e.target.center || e.target.pos).add(new THREE.Vector3(0, 0.6, 0)), '+' + Math.round(e.amount), '#7dffb0', false);
  }
  onKill(e) {
    const p = this.g.player;
    if (e.killer === p && e.victim !== p) {
      this.killT = 0.35;
      this.g.audio && this.g.audio.play('kill', { ui: true, vol: 0.7 });
      this.toast(`ELIMINATED ${e.victim.name}`, 'kill');
    }
  }
  addNum(pos, val, color, big) {
    this.nums.push({ p: pos.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.4, (Math.random() - 0.5) * 1.2), t: 0, val, color, big });
    if (this.nums.length > 60) this.nums.shift();
  }
  addArc(srcPos) {
    const el = document.createElement('div');
    el.className = 'arc';
    this.q('#dmgdir').appendChild(el);
    this.arcs.push({ el, src: srcPos.clone(), t: 0 });
  }
  announce(text, hero, sub) {
    const a = this.q('#announce');
    const team = hero ? hero.team : 0;
    a.innerHTML = `<div class="big t${team}">${text}</div>${sub || hero ? `<div class="sub">${sub || hero.name}</div>` : ''}`;
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    this.announceT = 2.2;
  }
  toast(text, cls = '') {
    const t = this.q('#toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + cls; d.textContent = text;
    t.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }
  choice(e) {
    if (e.hero !== this.g.player) return;
    this.q('#choice').classList.toggle('hidden', !e.open);
    if (!e.open && e.choice) this.announce(e.choice === 'beam' ? 'ANNIHILATION BEAM' : 'RECONSTRUCTION', e.hero);
  }

  // ---------- world-space overlay ----------
  drawOverlay(dt) {
    const c = this.ctx, g = this.g, cam = g.camRig.cam, p = g.player, W = innerWidth, H = innerHeight;
    c.clearRect(0, 0, W, H);
    for (const h of g.world.heroes) {
      if (h === p || h.dead || h.hidden) continue;
      _v.copy(h.pos); _v.y += h.height + 0.45;
      if (h.center && h.mode === 'fly') { _v.copy(h.center).addScaledVector(h.bodyUp, h.height * 0.5 + 0.4); }
      const dist = cam.position.distanceTo(_v);
      _v.project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const enemy = h.team !== p.team;
      const scale = clamp(14 / dist, 0.55, 1.15);
      const bw = 74 * scale, bh = 7 * scale;
      c.globalAlpha = clamp01(1.4 - dist / 120);
      // name
      c.font = `700 ${Math.round(12 * scale + 2)}px "Barlow Condensed", sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = enemy ? '#ff5d6c' : '#7cc8ff';
      c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 3;
      c.strokeText(h.name, x, y - bh - 4); c.fillText(h.name, x, y - bh - 4);
      // bar
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - bw / 2 - 2, y - 2, bw + 4, bh + 4);
      const f = clamp01(h.hp / h.maxHp);
      c.fillStyle = enemy ? '#ff2d42' : '#3fb0ff';
      c.fillRect(x - bw / 2, y, bw * f, bh);
      if (h.overhealth > 0) { c.fillStyle = '#ffd400'; c.fillRect(x - bw / 2, y, bw * clamp01(h.overhealth / h.maxHp), bh * 0.45); }
      if (h.bubble) { c.fillStyle = '#ff7bf0'; c.fillRect(x - bw / 2, y + bh * 0.55, bw * clamp01(h.bubble.amt / h.maxHp), bh * 0.45); }
      // ticks
      c.fillStyle = 'rgba(0,0,0,.45)';
      const n = Math.floor(h.maxHp / 100);
      for (let i = 1; i <= n; i++) c.fillRect(x - bw / 2 + bw * (i * 100 / h.maxHp) - 0.5, y, 1, bh);
      // statuses
      let sx = x + bw / 2 + 6;
      c.font = `800 ${Math.round(10 * scale + 2)}px "Barlow Condensed", sans-serif`; c.textAlign = 'left';
      if (h.status.vuln > 0) { c.fillStyle = '#ff9a3c'; c.fillText('VULN', sx, y + bh); sx += 30 * scale; }
      if (h.status.disruptT > 0) { c.fillStyle = '#7fb8ff'; c.fillText('EMP', sx, y + bh); sx += 26 * scale; }
      if (h.status.stunT > 0) { c.fillStyle = '#ffe14a'; c.fillText('STUN', sx, y + bh); }
      if (h.ultReady) { c.fillStyle = enemy ? '#ffb000' : '#9ff'; c.textAlign = 'center'; c.fillText('★ ULT', x, y - bh - 18 * scale); }
      c.globalAlpha = 1;
    }
    // damage numbers
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > 0.9) { this.nums.splice(i, 1); continue; }
      n.p.addScaledVector(n.v, dt); n.v.y -= 3.5 * dt;
      _v.copy(n.p).project(cam);
      if (_v.z > 1) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const k = n.t / 0.9;
      const pop = n.t < 0.08 ? 1 + (0.08 - n.t) * 8 : 1;
      c.globalAlpha = 1 - k * k;
      c.font = `italic 800 ${Math.round((n.big ? 30 : 21) * pop)}px "Barlow Condensed", sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.85)';
      c.strokeText(n.val, x, y); c.fillStyle = n.color; c.fillText(n.val, x, y);
    }
    c.globalAlpha = 1;
    // damage direction arcs
    const camYaw = Math.atan2(cam.getWorldDirection(_v).x, _v.z);
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      if (a.t > 1.1) { a.el.remove(); this.arcs.splice(i, 1); continue; }
      const dx = a.src.x - p.pos.x, dz = a.src.z - p.pos.z;
      const ang = Math.atan2(dx, dz) - camYaw;
      a.el.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
      a.el.style.opacity = 1 - a.t / 1.1;
    }
    if (g.mode && g.mode.hud) g.mode.hud.drawOverlay(c, cam, W, H);
  }
}
