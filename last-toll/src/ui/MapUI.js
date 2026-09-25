import { CITY_HALF, WORLD_HALF } from '../world/CityGen.js';

// Hand-drawn style map of the raid area: streets, buildings, docks, you.

export class MapUI {
  constructor(root) {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.style.display = 'none';
    o.style.pointerEvents = 'none';
    o.innerHTML = `<div class="mapwrap"><canvas width="900" height="900" aria-label="Map of the area"></canvas>
      <div class="legend"><span><i style="background:#c9a24a"></i>Skiff / extraction</span><span><i style="background:#e4ddc9"></i>You</span><span><i style="background:#4a4f48"></i>Buildings</span><span><i style="background:#d58a5a"></i>Bell tower</span><span class="key">M</span></div></div>`;
    root.appendChild(o);
    this.el = o;
    this.canvas = o.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = null;
  }

  get open() { return this.el.style.display !== 'none'; }

  setData(map, name, towerPos) {
    this.map = map;
    this.name = name;
    this.towerPos = towerPos;
    this.base = null;
  }

  toggle(v) {
    this.el.style.display = v ? '' : 'none';
  }

  _w2c(x, z) {
    const S = this.canvas.width, H = WORLD_HALF;
    return [((x + H) / (2 * H)) * S, ((z + H) / (2 * H)) * S];
  }

  _drawBase() {
    const c = document.createElement('canvas');
    c.width = c.height = this.canvas.width;
    const g = c.getContext('2d');
    const S = c.width;
    g.fillStyle = '#12201d';
    g.fillRect(0, 0, S, S);
    // water ripples
    g.strokeStyle = 'rgba(95,127,122,0.12)';
    for (let i = 0; i < 60; i++) {
      const y = (i / 60) * S;
      g.beginPath();
      for (let x = 0; x <= S; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
    const [lx0, lz0] = this._w2c(-CITY_HALF - 0.6, -CITY_HALF - 0.6);
    const [lx1, lz1] = this._w2c(CITY_HALF + 0.6, CITY_HALF + 0.6);
    g.fillStyle = '#2a2c24';
    g.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    g.strokeStyle = '#6a675e';
    g.lineWidth = 3;
    g.strokeRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    g.fillStyle = '#3a3b37';
    for (const r of this.map.roads) {
      const [x0, z0] = this._w2c(r.x0, r.z0);
      const [x1, z1] = this._w2c(r.x1, r.z1);
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    for (const b of this.map.buildings) {
      const [x0, z0] = this._w2c(b.x0, b.z0);
      const [x1, z1] = this._w2c(b.x1, b.z1);
      g.fillStyle = b.kind === 'container' ? '#5a4a3e' : b.kind === 'tent' ? '#4d5233' : b.kind === 'clinic' ? '#6a6c66' : '#4a4f48';
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, z0 + 0.5, x1 - x0 - 1, z1 - z0 - 1);
    }
    g.fillStyle = 'rgba(20,20,20,0.7)';
    for (const p of this.map.props) {
      const [x0, z0] = this._w2c(p.x - p.w / 2, p.z - p.d / 2);
      const [x1, z1] = this._w2c(p.x + p.w / 2, p.z + p.d / 2);
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    // grain
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    g.font = '600 26px "IM Fell English SC", Georgia, serif';
    g.fillStyle = 'rgba(228,221,201,0.85)';
    g.fillText(this.name, 24, 40);
    this.base = c;
  }

  draw(px, pz, yaw, docks) {
    if (!this.map) return;
    if (!this.base) this._drawBase();
    const g = this.ctx;
    const S = this.canvas.width;
    g.drawImage(this.base, 0, 0);
    for (const d of docks) {
      const [x, z] = this._w2c(d.center.x, d.center.z);
      g.fillStyle = '#c9a24a';
      g.beginPath();
      g.arc(x, z, 9, 0, Math.PI * 2);
      g.fill();
      g.font = '600 18px "Barlow Condensed", sans-serif';
      g.fillStyle = '#e4ddc9';
      const label = d.name;
      const tx = Math.min(S - g.measureText(label).width - 8, Math.max(8, x + 12));
      g.fillText(label, tx, z - 12);
    }
    // bell tower direction
    if (this.towerPos) {
      const a = Math.atan2(this.towerPos.z, this.towerPos.x);
      const [cx, cz] = [S / 2 + Math.cos(a) * S * 0.46, S / 2 + Math.sin(a) * S * 0.46];
      g.fillStyle = '#d58a5a';
      g.beginPath();
      g.arc(cx, cz, 7, 0, Math.PI * 2);
      g.fill();
      g.font = '600 16px "Barlow Condensed", sans-serif';
      g.fillText('Bell tower', Math.min(S - 80, cx + 10), Math.max(20, cz + 5));
    }
    // player arrow
    const [x, z] = this._w2c(px, pz);
    g.save();
    g.translate(x, z);
    g.rotate(-yaw);
    g.fillStyle = '#e4ddc9';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(8, 9);
    g.lineTo(0, 4);
    g.lineTo(-8, 9);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
}
