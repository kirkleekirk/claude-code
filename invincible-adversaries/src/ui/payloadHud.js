import * as THREE from 'three';
import { clamp } from '../engine/math.js';

const _v = new THREE.Vector3();
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/**
 * The payload's HUD: the route bar with its checkpoints and the cart moving along it, the clock,
 * who is pushing or holding it, and a marker over the cart in the world (pinned to the screen edge
 * when it's out of view). Announces the moments that matter.
 */
export class PayloadHUD {
  constructor(game, mode) {
    this.g = game; this.m = mode;
    const el = this.el = document.createElement('div');
    el.id = 'phud';
    const cps = mode.path.cps.slice(0, -1).map((s, i) => `<i class="cp" style="left:${(s / mode.path.len) * 100}%"><b>${'AB'[i]}</b></i>`).join('');
    el.innerHTML = `<div class="prow"><div class="pside"></div><div class="ptime"></div><div class="pside r"></div></div>
      <div class="pbar"><div class="pfill"></div>${cps}<i class="cp end" style="left:100%"><b>◆</b></i><i class="cart"><svg viewBox="0 0 24 24"><path d="M2 15h2v-4l3-4h6v4h5l4 3v1h-2a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0"/></svg></i></div>
      <div class="pstat"></div>`;
    document.getElementById('hud').appendChild(el);
    document.getElementById('topbar').classList.add('payload');
    this.q = (s) => el.querySelector(s);
    this.mine = game.player ? game.player.team : 0;
    this.onEvent = (e) => this.event(e);
    mode.w.on('payload', this.onEvent);
    this.lastStatus = null; this.statusT = 0;
  }
  get attacking() { return this.m.att === this.mine; }
  event(e) {
    const hud = this.g.hud, good = (yes) => ({ team: yes ? 0 : 1, name: '' });
    if (e.type === 'start') hud.announce(this.attacking ? 'ESCORT THE PAYLOAD' : 'STOP THE PAYLOAD', good(true), 'GO GO GO');
    else if (e.type === 'checkpoint') { hud.announce('CHECKPOINT REACHED', good(this.attacking), `+${fmt(e.add)} · ${this.attacking ? 'KEEP PUSHING' : 'FALL BACK TO THE NEXT POINT'}`); this.g.audio.ready && this.g.audio.play('ui_select', { ui: true, vol: 0.9 }); }
    else if (e.type === 'overtime') hud.announce('OVERTIME', good(this.attacking), this.attacking ? 'STAY ON THE PAYLOAD' : 'GET IT OFF THEM');
    else if (e.type === 'status') { this.pending = e.status; this.statusT = 0.8; }
  }
  update(dt) {
    const m = this.m;
    const att = this.attacking;
    this.q('.pside').textContent = att ? 'ATTACK' : 'DEFEND';
    this.q('.pside').className = 'pside ' + (att ? 'a' : 'd');
    const r = this.q('.pside.r');
    r.textContent = m.state === 'setup' ? 'SETUP' : m.state === 'overtime' ? 'OVERTIME' : ['POINT A', 'POINT B', 'FINAL POINT'][Math.min(2, m.phase)];
    r.className = 'pside r' + (m.state === 'overtime' ? ' ot' : '');
    this.q('.ptime').textContent = m.state === 'setup' ? fmt(m.clock) : m.state === 'overtime' ? 'OVERTIME' : fmt(m.timeLeft);
    this.q('.ptime').classList.toggle('low', m.state !== 'setup' && m.timeLeft < 30);
    const f = m.progress * 100;
    const fill = this.q('.pfill');
    fill.style.width = f + '%';
    fill.className = 'pfill ' + (m.att === this.mine ? 'mine' : 'theirs');
    const cart = this.q('.cart');
    cart.style.left = f + '%';
    cart.className = 'cart ' + (m.speed > 0 ? 'moving' : m.speed < 0 ? 'back' : m.att_n && m.def_n ? 'contested' : '');
    for (const [i, el] of [...this.el.querySelectorAll('.cp')].entries()) el.classList.toggle('done', i < m.phase);
    // status line: who's on it
    let st = '';
    if (m.state === 'setup') st = att ? 'SETUP · THE DOORS OPEN SOON' : 'SETUP · GET INTO POSITION';
    else if (m.speed > 0) st = `PAYLOAD MOVING <b>${'»'.repeat(Math.min(3, m.att_n))}</b>`;
    else if (m.speed < 0) st = 'PAYLOAD ROLLING BACK';
    else if (m.att_n && m.def_n) st = '<span class="ct">CONTESTED</span>';
    else st = 'PAYLOAD STOPPED';
    if (m.state === 'overtime') st += ` <span class="ot">${m.att_n ? '' : '· ' + m.overT.toFixed(1)}</span>`;
    const ps = this.q('.pstat');
    if (ps.dataset.v !== st) { ps.innerHTML = st; ps.dataset.v = st; }
    // a status that has held for a moment gets a toast
    if (this.pending) {
      this.statusT -= dt;
      if (this.statusT <= 0) {
        const s = this.pending; this.pending = null;
        if (s !== this.lastStatus) {
          this.lastStatus = s;
          const msg = { moving: att ? 'Payload moving' : 'They have the payload', contested: 'Payload contested', rollback: 'Payload rolling back', stopped: '' }[s];
          if (msg) this.g.hud.toast(msg, s === 'contested' ? 'kill' : '');
        }
      }
    }
  }
  /** the marker over the cart, drawn into the HUD's overlay canvas */
  drawOverlay(c, cam, W, H) {
    const m = this.m;
    _v.copy(m.pos); _v.y += 5.2;
    const dist = cam.position.distanceTo(_v);
    _v.project(cam);
    const behind = _v.z > 1;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - y; }
    const pad = 46, off = behind || x < pad || x > W - pad || y < pad + 80 || y > H - pad;
    if (off) {
      // pin to the edge along the direction from the screen's centre
      const cx = W / 2, cy = H / 2;
      let dx = x - cx, dy = y - cy;
      if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
      x = cx + dx * k; y = cy + dy * k;
      if (y < pad + 80) y = pad + 80;
    }
    const mine = m.att === this.mine;
    const col = m.speed > 0 ? (mine ? '#3fb0ff' : '#ff3b4a') : m.att_n && m.def_n ? '#ffd400' : '#e6e6e6';
    const near = m.near(this.g.player || { dead: true });
    c.save();
    c.globalAlpha = off ? 0.95 : clamp(0.45 + dist / 60, 0.45, 1);
    c.translate(x, y);
    const s = off ? 1 : clamp(30 / dist, 0.7, 1.15);
    c.scale(s, s);
    c.fillStyle = 'rgba(6,10,18,.7)'; c.strokeStyle = col; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -18); c.lineTo(18, 0); c.lineTo(0, 18); c.lineTo(-18, 0); c.closePath(); c.fill(); c.stroke();
    // the cart glyph
    c.fillStyle = col;
    c.beginPath(); c.rect(-9, -2, 18, 6); c.rect(1, -7, 7, 5); c.fill();
    c.beginPath(); c.arc(-5, 5.5, 2.4, 0, Math.PI * 2); c.arc(5, 5.5, 2.4, 0, Math.PI * 2); c.fill();
    c.font = '800 13px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)';
    const label = near ? (m.speed > 0 ? 'PUSHING' : m.att_n && m.def_n ? 'CONTESTED' : 'ON IT') : `${Math.round(dist)} m`;
    c.strokeText(label, 0, 33); c.fillText(label, 0, 33);
    if (off) {
      const ang = Math.atan2(y - H / 2, x - W / 2);
      c.rotate(ang); c.fillStyle = col;
      c.beginPath(); c.moveTo(26, 0); c.lineTo(19, -6); c.lineTo(19, 6); c.closePath(); c.fill();
    }
    c.restore();
  }
  dispose() {
    this.el.remove();
    document.getElementById('topbar').classList.remove('payload');
    this.m.w.off('payload', this.onEvent);
  }
}
