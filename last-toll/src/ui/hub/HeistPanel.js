import { def } from '../../data/items.js';
import { APPROACHES, SETUPS, KITS, ESCAPES, readiness, approachById } from '../../data/heist.js';
import { esc, frame } from './common.js';
import { fitLine, wrapBox } from './boardText.js';

const COND = (w) => (px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;

// Hale's planning board by his bunk: the Covenant job. A photo of the ship with
// everything you learned scouting her written on, and a card for each way in: what
// it needs, what kit to carry, how you get out. When a card's all ticked, launch it.

function pin(g, x, y, col = '#b8322a') {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + 2, y + 3, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath(); g.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2); g.fill();
}

// A note pinned up: the writing shrinks a little to fit, and if it still doesn't, the
// note is a longer scrap of paper. Never runs off the edge.
function note(g, x, y, w, h, rot, text, bg = '#efe8d8', font = COND(600), size = 17) {
  const pad = 8;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  const fit = wrapBox(g, text, pad, pad, w - pad * 2, h - pad * 2, font, size, Math.round(size * 0.82), { draw: false });
  const hh = Math.max(h, fit.height + pad * 2 + 2);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(4, 5, w, hh);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, hh);
  g.fillStyle = '#2a2420';
  wrapBox(g, text, pad, pad + Math.max(0, (hh - pad * 2 - fit.height) / 2), w - pad * 2, hh - pad * 2, font, fit.size, fit.size);
  g.restore();
}

// Draw the planning board. Returns hit regions for the approach cards.
export function drawHeistBoard(face, p, state = {}) {
  const { canvas, tex } = face;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#7a5e3e';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(60,40,20,0.25)' : 'rgba(200,160,110,0.16)';
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 2, 2 + Math.random() * 2);
  }
  g.strokeStyle = '#3e2e20';
  g.lineWidth = 14;
  g.strokeRect(7, 7, W - 14, H - 14);
  const h = p.heist || { stage: 'locked' };
  if (h.stage === 'locked') {
    note(g, W / 2 - 170, H / 2 - 40, 340, 80, -0.03, 'Nothing pinned up yet. Hale keeps his cards close.', '#e8dfc8', (px) => `italic 600 ${px}px Georgia, serif`, 22);
    tex.needsUpdate = true;
    return [];
  }
  // the heading
  g.save();
  g.translate(W * 0.3, 52);
  g.rotate(-0.015);
  g.fillStyle = '#e8dfc8';
  g.fillRect(-190, -28, 380, 56);
  g.fillStyle = '#2a2420';
  g.font = '700 34px "IM Fell English SC", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('The Covenant', 0, 2);
  g.restore();
  pin(g, W * 0.3 - 170, 34, '#c9a24a');
  pin(g, W * 0.3 + 170, 34, '#c9a24a');
  // the photo of the ship, side on, with the scouting notes
  const px = 40, py = 100, pw = 600, ph = 250;
  g.save();
  g.translate(px, py);
  g.rotate(0.008);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(6, 8, pw, ph);
  g.fillStyle = '#efe8d8';
  g.fillRect(0, 0, pw, ph);
  const gr = g.createLinearGradient(0, 10, 0, ph - 10);
  gr.addColorStop(0, '#5a6a8a');
  gr.addColorStop(0.62, '#d8b890');
  gr.addColorStop(0.63, '#2a3a44');
  gr.addColorStop(1, '#1a262c');
  g.fillStyle = gr;
  g.fillRect(10, 10, pw - 20, ph - 20);
  // the freighter in silhouette: bow left, house and funnel right
  const wl = 10 + (ph - 20) * 0.63;
  g.fillStyle = 'rgba(20,20,22,0.92)';
  g.beginPath();
  g.moveTo(40, wl - 44); g.lineTo(520, wl - 36); g.lineTo(520, wl + 10); g.lineTo(80, wl + 10); g.closePath(); g.fill();
  g.fillRect(420, wl - 96, 70, 60);
  g.fillRect(470, wl - 118, 26, 26);
  g.fillRect(150, wl - 90, 6, 52); g.fillRect(150, wl - 90, 60, 5);
  g.fillRect(290, wl - 86, 6, 48); g.fillRect(290, wl - 86, 64, 5);
  g.fillRect(60, wl - 80, 4, 40);
  const scouted = !!h.scouted;
  g.fillStyle = scouted ? '#f0d66a' : 'rgba(240,214,106,0.0)';
  if (scouted) {
    // grease-pencil marks where the way in and the prize are
    g.strokeStyle = 'rgba(210,40,30,0.95)';
    g.lineWidth = 3;
    const mark = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
    mark(360, wl - 20, 18); // hold 3
    mark(70, wl - 40, 12); // anchor chain
    mark(240, wl - 6, 12); // pilot ladder
    mark(360, wl + 14, 10); // sea chest
    mark(410, wl - 10, 12); // gangway
    mark(505, wl - 60, 12); // lifeboat
  }
  g.restore();
  pin(g, px + pw / 2, py + 6);
  if (!scouted) {
    note(g, px + 170, py + 90, 280, 70, 0.03, 'Scout her first: the lighthouse gallery or a crane at Port Lafitte. Count heads.', '#f0d66a');
  } else {
    const n = [
      [px + 10, py + 262, 'Anchor chain at the bow: climb it from the water'],
      [px + 180, py + 270, 'Pilot ladder, seaward side. Out of sight of the port'],
      [px + 350, py + 262, 'Sea chest under Hold 3: grate, needs a torch'],
      [px + 470, py + 30, 'Hold 3: the cage. Code, torch or a charge'],
    ];
    n.forEach(([x, y, t], i) => note(g, x, y, 160, 64, ((i % 3) - 1) * 0.03, t, '#f0d66a', COND(600), 15));
  }
  // the four ways in down the right side
  const regions = [];
  const sel = state.sel;
  APPROACHES.forEach((a, i) => {
    const x = 690, y = 90 + i * 140, w = 300, hh = 120;
    const r = readiness(p, a);
    g.save();
    g.translate(x, y);
    g.rotate(((i % 3) - 1) * 0.015);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(5, 6, w, hh);
    g.fillStyle = a.id === state.hover ? '#fffaf0' : '#efe8d8';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#231e1a';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    fitLine(g, a.name, 12, 8, w - 60, COND(700), 24);
    g.fillStyle = '#5a4a3a';
    fitLine(g, `${a.vehicle} · ${a.style}`, 12, 36, w - 24, COND(500), 15);
    // what it needs, in two columns that each keep to their own half of the card
    const col = (w - 24) / 2;
    r.setups.forEach((s, k) => {
      g.fillStyle = s.ok ? '#2a6a2a' : '#8a2a22';
      fitLine(g, `${s.ok ? '✓' : '✗'} ${s.label}`, 12 + (k % 2) * col, 58 + Math.floor(k / 2) * 18, col - 8, COND(500), 15, 12);
    });
    g.fillStyle = r.kit.ok ? '#2a6a2a' : '#8a2a22';
    fitLine(g, `${r.kit.ok ? '✓' : '✗'} ${r.kit.label}`, 12, 96, r.ready ? w - 130 : w - 24, COND(500), 15, 12);
    if (r.ready) {
      g.save();
      g.translate(w - 64, 90);
      g.rotate(-0.2);
      g.strokeStyle = 'rgba(40,120,40,0.9)';
      g.lineWidth = 3;
      g.strokeRect(-44, -14, 88, 28);
      g.fillStyle = 'rgba(40,120,40,0.9)';
      g.font = '700 18px "Barlow Condensed", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('READY', 0, 1);
      g.restore();
    }
    if (a.id === sel) {
      g.strokeStyle = 'rgba(190,40,30,0.9)';
      g.lineWidth = 5;
      g.strokeRect(-6, -6, w + 12, hh + 12);
    }
    g.restore();
    pin(g, x + w / 2, y + 4, '#3a6a9a');
    regions.push({ id: a.id, x, y, w, h: hh });
  });
  // red string from the chosen card to the ship
  if (sel) {
    const i = APPROACHES.findIndex((a) => a.id === sel);
    g.strokeStyle = 'rgba(170,30,25,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(690, 150 + i * 140);
    g.quadraticCurveTo(620, 420, px + 380, py + 180);
    g.stroke();
  }
  if (h.stage === 'done') note(g, 90, 520, 440, 90, -0.04, 'DONE. The prototype case came home. The Covenant can sail empty.', '#c8e0b0', (px) => `italic 700 ${px}px Georgia, serif`, 24);
  else if (h.runs) note(g, 90, 520, 380, 70, -0.03, `Tried ${h.runs} time${h.runs > 1 ? 's' : ''}. ${h.last && h.last.gotCase ? '' : 'The case is still aboard her.'}`, '#e8dfc8');
  tex.needsUpdate = true;
  return regions;
}

export class HeistPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.st = st;
    const h = hub.p.heist || {};
    this.sel = h.pick || APPROACHES[0].id;
    this.hover = null;
    this.el = (h.stage || 'locked') === 'locked'
      ? frame('Hale\'s Corkboard', '', '', { side: 'left', wide: true })
      : frame('The Covenant Job', h.stage === 'done' ? 'Done' : h.scouted ? 'Planning' : 'Scouting', '', { side: 'left', wide: true });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.render();
  }

  get p() { return this.hub.p; }

  _draw() {
    this.regions = drawHeistBoard(this.hub.boat.heistFace, this.p, { sel: this.sel, hover: this.hover });
  }

  _hit(ray) {
    const f = this.hub.boat.heistFace;
    const hit = ray.intersectObject(f.mesh, false)[0];
    if (!hit || !hit.uv) return null;
    const x = hit.uv.x * f.canvas.width, y = (1 - hit.uv.y) * f.canvas.height;
    return (this.regions || []).find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  onCanvasMove(ray) {
    const r = this._hit(ray);
    document.body.style.cursor = r ? 'pointer' : '';
    const id = r ? r.id : null;
    if (id !== this.hover) { this.hover = id; this._draw(); }
  }

  onCanvasClick(ray) {
    const r = this._hit(ray);
    if (!r) return;
    this.sel = r.id;
    this.hub.audio.ui();
    this.render();
  }

  render() {
    this._draw();
    const p = this.p, h = p.heist || { stage: 'locked' };
    const body = this.el.querySelector('.st-body');
    if (h.stage === 'locked') {
      body.innerHTML = '<p class="dd">Hale\'s corkboard. Nothing on it yet. He\'s been listening to the Guard\'s radio at night; ask him what he\'s heard.</p>';
      this.el.querySelector('.st-foot').innerHTML = '';
      return;
    }
    const a = approachById(this.sel);
    const r = readiness(p, a);
    const tabs = APPROACHES.map((x) => {
      const rr = readiness(p, x);
      return `<button class="btn small ${x.id === this.sel ? 'primary' : ''}" data-a="${x.id}">${esc(x.name)}${rr.ready ? ' ✓' : ''}</button>`;
    }).join('');
    const setups = r.setups.map((s) => `<li class="${s.ok ? 'ok' : 'miss'}"><span class="cn">${s.ok ? '✓' : '✗'} ${esc(s.label)}</span>${s.ok ? '' : `<small>${esc(s.how)}</small>`}</li>`).join('');
    const opt = SETUPS.manifest;
    const optOk = opt.check(p);
    const esc2 = a.escapes.map((k) => `<li><b>${esc(ESCAPES[k].label)}</b> — ${esc(ESCAPES[k].how)}</li>`).join('');
    const scoutFirst = !h.scouted;
    body.innerHTML = `
      <p class="dd">${h.stage === 'done'
        ? 'You pulled it off. The prototype case came home and the Covenant sails empty. The board stays up; you can run her again for what\'s in the lockers.'
        : scoutFirst
          ? 'Hale heard it on the Guard\'s radio: the <b>Covenant</b>, a Guard freighter anchored off <b>Port Lafitte</b>, loading Experimental gear from the Natchez labs. All you need is a boat with fuel, and a plan. Scout her first: Port Lafitte is on the bulletin board now.'
          : 'Four ways in. Pick one, get what it needs, carry the right kit, and go.'}</p>
      <div class="heist-tabs">${tabs}</div>
      <div class="heist-card">
        <h3>${esc(a.name)} <span class="label">${esc(a.vehicle)} · ${esc(a.style)} · ${a.time < 19 ? 'at sundown' : 'after dark'}</span></h3>
        <p>${esc(a.entry)}</p>
        <h4>Setups</h4>
        <ul class="comps heist-list">${setups}<li class="${optOk ? 'ok' : 'opt'}"><span class="cn">${optOk ? '✓' : '○'} ${esc(opt.label)}</span>${optOk ? '' : `<small>${esc(opt.how)}</small>`}</li></ul>
        <h4>Kit</h4>
        <ul class="comps heist-list"><li class="${r.kit.ok ? 'ok' : 'miss'}"><span class="cn">${r.kit.ok ? '✓' : '✗'} ${esc(r.kit.label)}</span><small>${esc(r.kit.how)}</small></li></ul>
        <h4>Ways out</h4>
        <ul class="heist-esc">${esc2}</ul>
        ${a.setups.some((id) => SETUPS[id].uses) ? `<p class="fine">Launching uses up ${a.setups.filter((id) => SETUPS[id].uses).map((id) => `${SETUPS[id].uses[1]} ${def(SETUPS[id].uses[0]).name}`).join(' and ')}.</p>` : ''}
        <div class="zp-acts"><button class="btn primary go" data-x="launch" ${r.ready && h.stage !== 'locked' ? '' : 'disabled'}>${r.ready ? `Launch: ${esc(a.name)}` : 'Not ready'}</button></div>
      </div>`;
    this.el.querySelector('.st-foot').innerHTML = 'Click a card on the board, or a tab, to look at a way in';
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    if (t.dataset.x === 'leave') { document.body.style.cursor = ''; return this.hub.closeStation(); }
    if (t.dataset.a) { this.sel = t.dataset.a; this.hub.audio.ui(); this.render(); return; }
    if (t.dataset.x === 'launch') {
      document.body.style.cursor = '';
      this.hub.launchHeist(this.sel);
    }
  }

  dispose() {
    document.body.style.cursor = '';
    this._draw();
    this.el.remove();
  }
}
