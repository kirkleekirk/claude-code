import { ZONES, zoneById } from '../../data/zones.js';
import { def, makeItem, SLOT_ORDER, TIERS } from '../../data/items.js';
import { countIn, payCost, maxHealthFor } from '../../game/Profile.js';
import { esc, frame } from './common.js';

// The bulletin board on wheels. Photos of the places the skiff can reach are
// pinned to cork with their dangers written on; Remy's contract slips hang down
// the side. The board itself is what you point at: click a photo to pick the
// night's destination.

const PHOTO = { cypress: ['#5e6a58', '#a09070'], railyard: ['#56605e', '#8a6a4a'], quarter: ['#5a5456', '#a08a6a'], marais: ['#1e2a24', '#3a4a3a'], outpost: ['#23272c', '#5a2a24'] };

function sketch(g, id, x, y, w, h) {
  const [sky, ground] = PHOTO[id] || ['#555', '#777'];
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, sky);
  gr.addColorStop(1, ground);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(15,15,15,0.85)';
  const base = y + h * 0.72;
  if (id === 'cypress') {
    for (let i = 0; i < 4; i++) { const bx = x + 12 + i * (w / 4); g.fillRect(bx, base - 34, w / 5, 34); g.beginPath(); g.moveTo(bx - 4, base - 34); g.lineTo(bx + w / 10, base - 52); g.lineTo(bx + w / 5 + 4, base - 34); g.fill(); }
  } else if (id === 'railyard') {
    for (let i = 0; i < 3; i++) g.fillRect(x + 10 + i * 70, base - 26 - (i % 2) * 22, 64, 26 + (i % 2) * 22);
    g.fillRect(x + w - 50, base - 90, 6, 90); g.fillRect(x + w - 90, base - 90, 80, 6);
  } else if (id === 'quarter') {
    for (let i = 0; i < 6; i++) { const bx = x + 10 + i * 38; g.fillRect(bx, base - 22, 26, 22); g.beginPath(); g.moveTo(bx - 2, base - 22); g.lineTo(bx + 13, base - 32); g.lineTo(bx + 28, base - 22); g.fill(); }
    g.fillRect(x + w - 60, base - 70, 44, 70);
  } else if (id === 'marais') {
    g.fillRect(x, base + 4, w, 6);
    for (let i = 0; i < 4; i++) { const bx = x + 18 + i * 56; g.fillRect(bx, base - 28, 40, 28); for (const px of [bx + 4, bx + 34]) g.fillRect(px, base, 3, 18); }
    for (let i = 0; i < 3; i++) { const tx = x + 40 + i * 80; g.fillRect(tx, y + 10, 5, base - y - 6); g.beginPath(); g.ellipse(tx + 2, y + 18, 26, 9, 0, 0, Math.PI * 2); g.fill(); }
  } else if (id === 'outpost') {
    g.fillRect(x, base - 26, w, 26);
    g.fillRect(x + w / 2 - 4, y + 8, 8, base - y - 8);
    g.fillStyle = 'rgba(255,60,40,0.9)';
    g.fillRect(x + w / 2 - 5, y + 10, 10, 6);
    g.fillStyle = 'rgba(255,240,210,0.5)';
    g.beginPath(); g.moveTo(x + 30, base - 24); g.lineTo(x + 70, y + 10); g.lineTo(x + 90, y + 10); g.fill();
  }
  // developer's grain and a white border
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2); }
}

function pin(g, x, y, col = '#b8322a') {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + 2, y + 3, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath(); g.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2); g.fill();
}

// Draw the board face. state: { sel, hover }. Returns hit regions.
export function drawBoard(boat, p, state = {}) {
  const { canvas, tex } = boat.boardFace;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  // cork
  g.fillStyle = '#8a6a44';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(60,40,20,0.25)' : 'rgba(200,160,110,0.18)';
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 2, 2 + Math.random() * 2);
  }
  g.strokeStyle = '#4a3a2a';
  g.lineWidth = 14;
  g.strokeRect(7, 7, W - 14, H - 14);
  // heading on a paper strip
  g.save();
  g.translate(W * 0.36, 52);
  g.rotate(-0.012);
  g.fillStyle = '#e8dfc8';
  g.fillRect(-220, -28, 440, 56);
  g.fillStyle = '#2a2420';
  g.font = '700 34px "IM Fell English SC", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Where to tonight?', 0, 2);
  g.restore();
  pin(g, W * 0.36 - 200, 34, '#c9a24a');
  pin(g, W * 0.36 + 200, 34, '#c9a24a');

  const regions = [];
  const cw = 196, ch = 190;
  const spots = [[40, 110], [258, 100], [476, 112], [120, 380], [360, 372]];
  const sel = state.sel || p.lastZone || 'cypress';
  ZONES.forEach((z, i) => {
    const [x, y] = spots[i];
    const rot = ((i * 37) % 7 - 3) * 0.012;
    g.save();
    g.translate(x + cw / 2, y + ch / 2);
    g.rotate(rot);
    g.translate(-cw / 2, -ch / 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(6, 8, cw, ch);
    g.fillStyle = z.id === state.hover ? '#fffaf0' : '#efe8d8';
    g.fillRect(0, 0, cw, ch);
    sketch(g, z.id, 10, 10, cw - 20, 118);
    g.fillStyle = '#231e1a';
    g.font = '600 22px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'left';
    g.fillText(z.name, 12, 150);
    g.font = '500 15px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillStyle = '#5a4a3a';
    g.fillText(`${z.night ? 'After dark' : 'Dusk'} · Sweep ${z.sweepMinutes}:00`, 12, 172);
    // threat in red pips
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k < z.threat ? '#a8302a' : 'rgba(90,70,50,0.35)';
      g.beginPath(); g.arc(cw - 60 + k * 14, 166, 5, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    pin(g, x + cw / 2, y + 6);
    if (z.id === sel) {
      // circled in red grease pencil
      g.strokeStyle = 'rgba(190,40,30,0.9)';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(x + cw / 2, y + ch / 2, cw * 0.62, ch * 0.6, rot, 0.2, Math.PI * 2 + 0.1);
      g.stroke();
    }
    regions.push({ kind: 'zone', id: z.id, x, y, w: cw, h: ch });
  });
  // red string from the photos to the skiff note
  g.strokeStyle = 'rgba(170,30,25,0.8)';
  g.lineWidth = 3;
  const si = ZONES.findIndex((z) => z.id === sel);
  if (si >= 0) {
    const [sx, sy] = spots[si];
    g.beginPath();
    g.moveTo(sx + cw / 2, sy + 6);
    g.quadraticCurveTo(700, 360, 800, 612);
    g.stroke();
  }
  // contract slips down the right side
  const cs = p.contracts || [];
  cs.forEach((c, i) => {
    const x = 720, y = 90 + i * 118;
    g.save();
    g.translate(x, y);
    g.rotate(((i % 3) - 1) * 0.03);
    g.fillStyle = c.done ? '#b8b0a0' : '#e8dca0';
    g.fillRect(0, 0, 270, 100);
    g.fillStyle = '#2a2420';
    g.font = '500 17px "Barlow Condensed", "Arial Narrow", sans-serif';
    wrap(g, c.text, 12, 26, 246, 20);
    g.font = '600 15px "Barlow Condensed", sans-serif';
    g.fillStyle = c.done ? '#5a5a50' : c.progress >= c.target && c.kind !== 'deliver' ? '#2a6a2a' : '#6a4a2a';
    g.fillText(c.done ? 'DONE' : c.kind === 'deliver' ? 'Deliver aboard' : `${c.progress}/${c.target}`, 12, 88);
    if (c.done) { g.strokeStyle = 'rgba(40,40,40,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 50); g.lineTo(262, 44); g.stroke(); }
    g.restore();
    pin(g, x + 135, y + 4, '#3a6a9a');
  });
  // the skiff note the string runs to
  g.save();
  g.translate(800, 612);
  g.fillStyle = '#efe8d8';
  g.fillRect(-80, -26, 160, 44);
  g.fillStyle = '#2a2420';
  g.font = '600 18px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.fillText(`Skiff → ${zoneById(sel).name}`, 0, 2);
  g.restore();
  pin(g, 800, 590, '#c9a24a');
  tex.needsUpdate = true;
  return regions;
}

function wrap(g, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) g.fillText(line, x, y);
}

export class BoardPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.st = st;
    this.sel = hub.p.lastZone || 'cypress';
    this.hover = null;
    this.el = frame('Bulletin Board', '', '', { side: 'right' });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.render();
  }

  get p() { return this.hub.p; }

  _draw() {
    this.regions = drawBoard(this.hub.boat, this.p, { sel: this.sel, hover: this.hover });
  }

  // Where on the board face a ray lands, in canvas pixels.
  _boardHit(ray) {
    const f = this.hub.boat.boardFace;
    const hit = ray.intersectObject(f.mesh, false)[0];
    if (!hit || !hit.uv) return null;
    const x = hit.uv.x * f.canvas.width, y = (1 - hit.uv.y) * f.canvas.height;
    return this.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  onCanvasMove(ray) {
    const r = this._boardHit(ray);
    const id = r ? r.id : null;
    document.body.style.cursor = r ? 'pointer' : '';
    if (id !== this.hover) { this.hover = id; this._draw(); }
  }

  onCanvasClick(ray) {
    const r = this._boardHit(ray);
    if (!r) return;
    this.sel = r.id;
    this.p.lastZone = r.id;
    this.hub.save();
    this.hub.refreshStatus();
    this.hub.audio.ui();
    this.render();
  }

  render() {
    this._draw();
    const p = this.p, z = zoneById(this.sel);
    const warn = [];
    if (!p.loadout.knife && !p.loadout.melee) warn.push('No blade or melee weapon. You\'ll scrounge a rusty screwdriver from the skiff.');
    if (p.nourishment < 30) warn.push('You are starving. Your health is capped low; eat something at the galley.');
    if (p.health < maxHealthFor(p.nourishment) * 0.5) warn.push('You are badly hurt. See the infirmary first.');
    for (const s of SLOT_ORDER) {
      const it = p.loadout[s];
      if (!it || !it.gun) continue;
      const a = def(it.id).ammo;
      if (countIn([p.backpack], a) === 0 && it.gun.loaded === 0) warn.push(`Your ${def(it.id).name} is empty and there's no ${def(a).name} in your pack.`);
    }
    // what the loot tables actually allow here (see data/loot.js tierCap)
    const crates = (z.lots || []).some(([t]) => t === 'checkpoint' || t === 'compound' || t === 'containers');
    const best = Math.min(3, z.lootTier + (crates ? 1 : 0));
    const guard = z.guards && (z.guards.posts || z.guards.patrols);
    const kit = SLOT_ORDER.map((s) => p.loadout[s]).filter(Boolean).map((it) => `<span>${esc(def(it.id).name)}</span>`).join('') || '<span>Nothing holstered</span>';
    const contracts = (p.contracts || []).map((c, i) => {
      const reward = Object.entries(c.reward).map(([k, v]) => `${v} ${def(k).name}`).join(', ');
      let right;
      if (c.done) right = '<span class="label">Done</span>';
      else if (c.kind === 'deliver') {
        const have = countIn(this.hub.lists(), c.item);
        right = `<button class="btn small ${have >= c.target ? 'primary' : ''}" data-deliver="${i}" ${have >= c.target ? '' : 'disabled'}>Deliver ${Math.min(have, c.target)}/${c.target}</button>`;
      } else right = c.progress >= c.target ? `<button class="btn small primary" data-claim="${i}">Claim</button>` : `<span class="num">${c.progress}/${c.target}</span>`;
      return `<div class="contract ${c.done ? 'done' : ''}"><div><div class="ct">${esc(c.text)}</div><div class="cr">${esc(reward)}</div></div>${right}</div>`;
    }).join('');
    this.el.querySelector('.st-body').innerHTML = `
      <div class="zone-pick">
        <h3>${esc(z.name)}</h3>
        <div class="zp-meta"><span class="threat">${[1, 2, 3, 4].map((k) => `<i class="${k <= z.threat ? 'on' : ''}"></i>`).join('')}</span><span>${z.night ? 'Lands after dark' : 'Lands at dusk'}</span><span class="num">Sweep in ${z.sweepMinutes}:00</span></div>
        <p class="dd">${esc(z.blurb)}</p>
        <p class="zp-focus"><span class="label">Salvage</span> ${esc(z.focus)}</p>
        <p class="zp-focus"><span class="label">Weapons found</span> <span style="color:${TIERS[best].color}">up to ${TIERS[best].name}${crates && best > z.lootTier ? ' in military crates' : ''}</span>${guard ? ` · <span style="color:${TIERS[4].color}">Experimental on the Guard</span>` : ''}</p>
        <div class="kit"><span class="label">Carrying</span>${kit}</div>
        ${warn.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
        <div class="zp-acts"><button class="btn primary go" data-x="go">Cast off for ${esc(z.name)}</button></div>
        <p class="fine">Click a photo on the board to change where the skiff goes. The skiff is tied off at the port gangway.</p>
      </div>
      <h4>Contracts</h4>
      <p class="fine">Kills and extractions only count if you make it back. A fresh list every morning.</p>
      <div class="contracts">${contracts}</div>`;
    this.el.querySelector('.st-foot').innerHTML = 'Click a photo on the board to choose a destination';
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    const p = this.p;
    if (t.dataset.x === 'leave') { document.body.style.cursor = ''; return this.hub.closeStation(); }
    if (t.dataset.x === 'go') { document.body.style.cursor = ''; return this.hub.deploy(this.sel); }
    if (t.dataset.deliver !== undefined) {
      const c = p.contracts[+t.dataset.deliver];
      if (c && !c.done && countIn(this.hub.lists(), c.item) >= c.target) { payCost(this.hub.lists(), { [c.item]: c.target }); this._claim(c); }
    } else if (t.dataset.claim !== undefined) {
      const c = p.contracts[+t.dataset.claim];
      if (c && !c.done && c.progress >= c.target) this._claim(c);
    }
    this.render();
  }

  _claim(c) {
    c.done = true;
    for (const [k, v] of Object.entries(c.reward)) this.hub.give(makeItem(k, v));
    this.hub.audio.ui('craft');
    this.hub.save();
  }

  dispose() {
    document.body.style.cursor = '';
    this._draw();
    this.el.remove();
  }
}
