// Map screen: a painted overview of the county with roads, buildings,
// claims and the player's position.
import { T } from './world/terrain.js';
import { STREETS, FIELDS, TOWN_NAME } from './world/layout.js';

export class MapView {
  constructor(game) {
    this.game = game;
    const el = this.el = document.createElement('div');
    el.className = 'overlay map';
    el.hidden = true;
    el.innerHTML = `<div class="map-wrap"><canvas id="map-cv"></canvas><div class="map-legend"><b>Bridger County</b><span>You</span><span class="lg-claim">Your claims</span><button id="map-close">Close (M)</button></div></div>`;
    document.getElementById('ui').appendChild(el);
    el.querySelector('#map-close').addEventListener('click', () => this.toggle(false));
    this.base = null;
  }
  paintBase() {
    const P = T.play, w = this.game.world;
    const W = 640, H = Math.round(W * (P.z1 - P.z0) / (P.x1 - P.x0));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const sx = (P.x1 - P.x0) / W, sz = (P.z1 - P.z0) / H;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = P.x0 + i * sx, z = P.z0 + j * sz;
      const h = w.terrain.height(x, z);
      let r, g, b;
      if (h < T.water + 0.05) { r = 92; g = 110; b = 112; }
      else {
        const k = Math.max(0, Math.min(1, (h - 5) / 30));
        r = 120 + k * 40; g = 140 + k * 20; b = 86 + k * 10;
        const e = w.terrain.height(x + 2, z) - h;
        const shade = Math.max(-25, Math.min(25, -e * 18));
        r += shade; g += shade; b += shade;
      }
      const o = (j * W + i) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const X = (x) => (x - P.x0) / sx, Z = (z) => (z - P.z0) / sz;
    ctx.fillStyle = 'rgba(160,120,70,.45)';
    for (const f of FIELDS) ctx.fillRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) / sx, (f.z1 - f.z0) / sz);
    ctx.strokeStyle = '#d8d0b8'; ctx.lineCap = 'round';
    for (const r of w.roadSamples) {
      ctx.lineWidth = r.type === 'paved' ? 3 : 2;
      ctx.strokeStyle = r.type === 'paved' ? '#e8e2d0' : '#c8b898';
      ctx.beginPath();
      r.samples.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z))));
      ctx.stroke();
    }
    ctx.fillStyle = '#e8e2d0';
    for (const s of [...STREETS.ns, ...STREETS.ew]) ctx.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) / sx + 1, (s.z1 - s.z0) / sz + 1);
    ctx.fillStyle = '#5a3a2e';
    for (const S of w.structures) {
      const b = S.bounds();
      if (b) ctx.fillRect(X(b.wx0), Z(b.wz0), Math.max(2, (b.wx1 - b.wx0) / sx), Math.max(2, (b.wz1 - b.wz0) / sz));
    }
    ctx.fillStyle = '#1e2a20'; ctx.font = '600 15px Oswald, Arial Narrow, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(TOWN_NAME.toUpperCase(), X(130), Z(-80));
    ctx.fillText('MISSISSIPPI', X(212), Z(200));
    this.base = cv;
  }
  toggle(v) {
    const open = v == null ? this.el.hidden : v;
    this.el.hidden = !open;
    this.game.modalOpen = open;
    this.game.input.uiCapture = open;
    if (open) { this.game.input.exitLock(); this.draw(); }
  }
  draw() {
    if (!this.base) this.paintBase();
    const cv = this.el.querySelector('#map-cv');
    cv.width = this.base.width; cv.height = this.base.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(this.base, 0, 0);
    const P = T.play, sx = (P.x1 - P.x0) / cv.width, sz = (P.z1 - P.z0) / cv.height;
    const X = (x) => (x - P.x0) / sx, Z = (z) => (z - P.z0) / sz;
    for (const c of this.game.claims.list) {
      ctx.strokeStyle = c.color; ctx.lineWidth = 2;
      ctx.strokeRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) / sx, (c.z1 - c.z0) / sz);
    }
    const p = this.game.player;
    ctx.save();
    ctx.translate(X(p.pos.x), Z(p.pos.z));
    ctx.rotate(-p.facing + Math.PI);
    ctx.fillStyle = '#d9a441'; ctx.strokeStyle = '#1a1a14'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
