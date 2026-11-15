// Pooled particles + floating text. Stylised, no gore: hits throw sparks and dust.
// Positions are ground coordinates (x, y) plus an explicit height z, so the 2D renderer draws
// at (x, y - z) and the 3D renderer at (x, z, y).
import { RAMPS } from '../data/palette.js';
import { drawText } from './font.js';

const MAX = 900;
// kind: 0 floats (no gravity) | 1 bounces (casings, coins) | 2 smoke (grows, translucent) | 3 fire | 4 falls and dies

export class Particles {
  constructor() {
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: '#fff', s: 1, kind: 0, fric: 0 });
    this.next = 0;
    this.texts = [];
  }
  spawn(x, y, z, vx, vy, vz, life, c, s = 1, kind = 0, fric = 0) {
    for (let k = 0; k < MAX; k++) {
      const q = this.p[this.next];
      this.next = (this.next + 1) % MAX;
      if (!q.on || k === MAX - 1) {
        q.on = true; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = life; q.max = life; q.c = c; q.s = s; q.kind = kind; q.fric = fric;
        return q;
      }
    }
    return null;
  }
  burst(x, y, n, colors, speed = 60, life = 0.4, size = 1, z = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * v, Math.sin(a) * v, speed * (0.2 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), colors[i % colors.length], size, 4, 2);
    }
  }
  sparks(x, y, dir, z = 8) {
    for (let i = 0; i < 6; i++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 1.6, v = 50 + Math.random() * 70;
      this.spawn(x, y, z, Math.cos(a) * v, Math.sin(a) * v, (Math.random() - 0.3) * 40, 0.18 + Math.random() * 0.15, i & 1 ? RAMPS.gold[3] : RAMPS.bone[3], 1, 0, 4);
    }
  }
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 8, 4 + Math.random() * 10, 0.5 + Math.random() * 0.4, i & 1 ? RAMPS.sand[2] : RAMPS.bone[1], 1, 0, 3);
  }
  casing(x, y, dir) {
    const a = dir - Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    this.spawn(x, y, 8, Math.cos(a) * 40, Math.sin(a) * 40, 50, 1.6, RAMPS.gold[2], 1, 1, 1.5);
  }
  smoke(x, y, n = 6, big = false) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * (big ? 30 : 8), y + (Math.random() - 0.5) * (big ? 22 : 6), 4 + Math.random() * (big ? 10 : 4), (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, 6 + Math.random() * 10, big ? 3 + Math.random() * 2 : 0.8, i & 1 ? RAMPS.bone[1] : RAMPS.bone[0], big ? 5 : 2, 2, 0.5);
  }
  fire(x, y) {
    this.spawn(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 6, 0, 20 + Math.random() * 20, 0.35 + Math.random() * 0.3, Math.random() < 0.5 ? RAMPS.heat[3] : RAMPS.heat[2], 2, 3);
  }
  coins(x, y, n = 8) {
    for (let i = 0; i < n; i++) this.spawn(x, y, 10, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, 60 + Math.random() * 30, 0.9, i & 1 ? RAMPS.gold[3] : RAMPS.gold[2], 2, 1, 1);
  }
  // h = height above the ground where the text starts; it rises from there.
  text(x, y, str, color, h = 26, life = 1.1) { this.texts.push({ x, y, h, str, color, life, max: life }); if (this.texts.length > 40) this.texts.shift(); }
  update(dt) {
    for (const q of this.p) {
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = false; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.fric) { const f = Math.max(0, 1 - q.fric * dt); q.vx *= f; q.vy *= f; if (q.kind === 0) q.vz *= f; }
      if (q.kind === 1) { q.vz -= 220 * dt; if (q.z < 0) { q.z = 0; q.vz = -q.vz * 0.4; q.vx *= 0.6; q.vy *= 0.6; } }
      else if (q.kind === 4) { q.vz -= 160 * dt; if (q.z < 0) q.on = false; }
      else if (q.z < 0) q.z = 0;
    }
    for (const t of this.texts) { t.life -= dt; t.h += 14 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  size(q) { return q.kind === 2 ? Math.round(q.s * (1.5 - q.life / q.max)) + 1 : q.s; }
  alpha(q) { return q.kind === 2 ? Math.min(0.55, q.life / q.max) : 1; }
  draw(ctx, camX, camY) {
    for (const q of this.p) {
      if (!q.on) continue;
      const s = this.size(q);
      ctx.globalAlpha = this.alpha(q);
      ctx.fillStyle = q.c;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY - q.z), s, s);
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx, camX, camY) {
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      drawText(ctx, t.str, t.x - camX, t.y - t.h - camY, t.color, { align: 'center', shadow: RAMPS.ink[0] });
    }
    ctx.globalAlpha = 1;
  }
}
