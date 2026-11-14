// Pooled particles + floating text. Stylised, no gore: hits throw sparks and dust.
import { RAMPS } from '../data/palette.js';
import { drawText } from './font.js';

const MAX = 900;

export class Particles {
  constructor() {
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: '#fff', s: 1, g: 0, kind: 0, fric: 0 });
    this.next = 0;
    this.texts = [];
  }
  spawn(x, y, vx, vy, life, c, s = 1, g = 0, kind = 0, vz = 0, fric = 0) {
    for (let k = 0; k < MAX; k++) {
      const q = this.p[this.next];
      this.next = (this.next + 1) % MAX;
      if (!q.on || k === MAX - 1) {
        Object.assign(q, { on: true, x, y, z: 0, vx, vy, vz, life, max: life, c, s, g, kind, fric });
        return q;
      }
    }
    return null;
  }
  burst(x, y, n, colors, speed = 60, life = 0.4, size = 1, grav = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), colors[i % colors.length], size, grav, 0, 0, 2);
    }
  }
  sparks(x, y, dir) {
    for (let i = 0; i < 6; i++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 1.6, v = 50 + Math.random() * 70;
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.18 + Math.random() * 0.15, i & 1 ? RAMPS.gold[3] : RAMPS.bone[3], 1, 0, 0, 0, 4);
    }
  }
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 6, y, (Math.random() - 0.5) * 20, -Math.random() * 12, 0.5 + Math.random() * 0.4, i & 1 ? RAMPS.sand[2] : RAMPS.bone[1], 1, 0, 0, 0, 3);
  }
  casing(x, y, dir) {
    const a = dir - Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    this.spawn(x, y, Math.cos(a) * 40, Math.sin(a) * 40, 1.6, RAMPS.gold[2], 1, 0, 1, 50, 1.5);
  }
  smoke(x, y, n = 6, big = false) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * (big ? 30 : 8), y + (Math.random() - 0.5) * (big ? 30 : 8), (Math.random() - 0.5) * 10, -6 - Math.random() * 10, big ? 3 + Math.random() * 2 : 0.8, i & 1 ? RAMPS.bone[1] : RAMPS.bone[0], big ? 5 : 2, 0, 2, 0, 0.5);
  }
  fire(x, y) {
    this.spawn(x + (Math.random() - 0.5) * 8, y, (Math.random() - 0.5) * 6, -20 - Math.random() * 20, 0.35 + Math.random() * 0.3, Math.random() < 0.5 ? RAMPS.heat[3] : RAMPS.heat[2], 2, 0, 3);
  }
  coins(x, y, n = 8) {
    for (let i = 0; i < n; i++) this.spawn(x, y, (Math.random() - 0.5) * 50, 0, 0.9, i & 1 ? RAMPS.gold[3] : RAMPS.gold[2], 2, 0, 1, 60 + Math.random() * 30, 1);
  }
  text(x, y, str, color, life = 1.1) { this.texts.push({ x, y, str, color, life, max: life }); if (this.texts.length > 40) this.texts.shift(); }
  update(dt) {
    for (const q of this.p) {
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = false; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.fric) { const f = Math.max(0, 1 - q.fric * dt); q.vx *= f; q.vy *= f; }
      if (q.kind === 1) { q.z += q.vz * dt; q.vz -= 220 * dt; if (q.z < 0) { q.z = 0; q.vz = -q.vz * 0.4; q.vx *= 0.6; q.vy *= 0.6; } }
    }
    for (const t of this.texts) { t.life -= dt; t.y -= 14 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  draw(ctx, camX, camY) {
    for (const q of this.p) {
      if (!q.on) continue;
      const x = Math.round(q.x - camX), y = Math.round(q.y - camY - q.z);
      const a = q.kind === 2 ? Math.min(0.55, q.life / q.max) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.c;
      const s = q.kind === 2 ? Math.round(q.s * (1.5 - q.life / q.max)) + 1 : q.s;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx, camX, camY) {
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      drawText(ctx, t.str, t.x - camX, t.y - camY, t.color, { align: 'center', shadow: RAMPS.ink[0] });
    }
    ctx.globalAlpha = 1;
  }
}
