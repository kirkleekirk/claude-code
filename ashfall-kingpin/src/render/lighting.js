// Day/night tint + lightmap: ambient fill, additive radial lights, multiplied over the scene.
import { createCanvas, ctx2d } from './canvas.js';

const KEYS = [
  [0, [62, 72, 118]], [300, [62, 72, 118]], [360, [196, 150, 140]], [420, [255, 236, 214]], [480, [255, 252, 246]],
  [1020, [255, 250, 240]], [1080, [255, 206, 160]], [1140, [196, 140, 150]], [1200, [92, 92, 140]], [1260, [62, 72, 118]], [1440, [62, 72, 118]],
];

export function ambientAt(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, ca] = KEYS[i], [b, cb] = KEYS[i + 1];
    if (m >= a && m <= b) {
      const t = (m - a) / (b - a || 1);
      return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
    }
  }
  return [255, 255, 255];
}

export function isNight(minute) { const m = ((minute % 1440) + 1440) % 1440; return m < 330 || m > 1170; }

export class Lighting {
  constructor() { this.can = null; this.g = null; this.lights = []; this.grad = new Map(); }
  resize(w, h) {
    if (this.can && this.can.width === w && this.can.height === h) return;
    this.can = createCanvas(w, h);
    this.g = ctx2d(this.can);
  }
  gradient(color) {
    let c = this.grad.get(color);
    if (c) return c;
    c = createCanvas(64, 64);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, color);
    rg.addColorStop(0.45, color.replace(/,\s*[\d.]+\)$/, ',0.45)'));
    rg.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ',0)'));
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    this.grad.set(color, c);
    return c;
  }
  clear() { this.lights.length = 0; }
  add(x, y, r, color = 'rgba(255,190,110,1)', k = 1, h = 0) { this.lights.push(x, y - h, r, color, k); }
  // Composite onto ctx (already holding the scene in view space).
  apply(ctx, camX, camY, w, h, ambient) {
    const strength = (765 - ambient[0] - ambient[1] - ambient[2]) / 765;
    if (strength < 0.02 && this.lights.length === 0) return;
    this.resize(w, h);
    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgb(${ambient[0]},${ambient[1]},${ambient[2]})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const L = this.lights;
    for (let i = 0; i < L.length; i += 5) {
      const x = L[i] - camX, y = L[i + 1] - camY, r = L[i + 2];
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      g.globalAlpha = Math.min(1, L[i + 4] * Math.max(0.25, strength * 1.4));
      g.drawImage(this.gradient(L[i + 3]), x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.can, 0, 0);
    ctx.restore();
  }
}
