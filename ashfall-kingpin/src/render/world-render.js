// Draws the world: baked terrain chunks, Y-sorted structures/props/entities, roof fading,
// night lights. View space is logical pixels; the caller sets the integer zoom transform.
import { TILE, WORLD_W, WORLD_H } from '../data/places.js';
import { RAMPS } from '../data/palette.js';
import { ST } from '../world/tiles.js';
import { TerrainRenderer } from './terrain.js';
import { buildingSprites, towerSprite, gateSprite, propSprite, highlightSprite } from './sprites.js';
import { Lighting, ambientAt, isNight } from './lighting.js';
import { Particles } from './particles.js';

const LIGHT_PROPS = { lamp: [52, 'rgba(255,196,120,1)'], fire: [64, 'rgba(255,150,70,1)'], stall: [30, 'rgba(255,170,110,0.8)'], jobboard: [26, 'rgba(255,200,140,0.7)'] };

export class WorldRenderer {
  constructor(W) {
    this.W = W;
    this.terrain = new TerrainRenderer(W);
    this.light = new Lighting();
    this.fx = new Particles();
    this.fade = new Map();
    this.statics = [];
    this.highlight = null;
    this.extraStatics = [];
    this.buildStatics();
  }

  buildStatics() {
    const W = this.W;
    this.statics = [];
    for (const b of W.buildings) this.statics.push({ kind: 'bld', b, x0: b.x * 16, y0: (b.y - 1) * 16, x1: (b.x + b.w) * 16, y1: (b.y + b.h) * 16, sy: (b.y + b.h) * 16 });
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      if (W.struct[y * WORLD_W + x] === ST.TOWER) this.statics.push({ kind: 'tower', x, y, style: W.wallStyle[y * WORLD_W + x], x0: x * 16 - 6, y0: y * 16 - 32, x1: x * 16 + 22, y1: y * 16 + 16, sy: (y + 1) * 16 - 1 });
    }
    for (const L of Object.values(W.layouts)) {
      const g = L.gate;
      if (!g || L.place.kind === 'ruin') continue;
      const horiz = W.struct[g.y * WORLD_W + g.x - 1] === ST.GATE && W.struct[g.y * WORLD_W + g.x + 1] === ST.GATE;
      if (!horiz) continue;
      const name = L.place.kind === 'market' ? 'CROSSROADS' : L.place.name.toUpperCase();
      this.statics.push({ kind: 'gate', x: g.x, y: g.y, style: L.place.palette, name, x0: (g.x - 1) * 16 - 4, y0: g.y * 16 - 22, x1: (g.x + 2) * 16 + 4, y1: (g.y + 1) * 16, sy: (g.y + 1) * 16 + 2 });
    }
    for (const p of W.props) {
      if (p.hidden) continue;
      const sp = propSprite(p.type, p.variant || 0, W.layouts[p.place] ? W.layouts[p.place].place.palette : 'ruin');
      const px = p.x * 16 + sp.ax, py = p.y * 16 + sp.ay;
      this.statics.push({ kind: 'prop', p, sp, x0: px, y0: py, x1: px + sp.img.width, y1: py + sp.img.height, sy: (p.y + (p.h || 1)) * 16 - (p.onWall ? -1 : 2) });
    }
    // Chunk bins for culling.
    this.bins = new Map();
    for (const s of this.statics) {
      const cx0 = Math.floor(s.x0 / 256), cx1 = Math.floor(s.x1 / 256), cy0 = Math.floor(s.y0 / 256), cy1 = Math.floor(s.y1 / 256);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const k = cy * 64 + cx;
        if (!this.bins.has(k)) this.bins.set(k, []);
        this.bins.get(k).push(s);
      }
    }
  }

  visibleStatics(camX, camY, vw, vh) {
    const out = new Set();
    for (let cy = Math.floor((camY - 64) / 256); cy <= Math.floor((camY + vh + 64) / 256); cy++) {
      for (let cx = Math.floor((camX - 64) / 256); cx <= Math.floor((camX + vw + 64) / 256); cx++) {
        const bin = this.bins.get(cy * 64 + cx);
        if (!bin) continue;
        for (const s of bin) if (s.x1 >= camX && s.x0 <= camX + vw && s.y1 >= camY && s.y0 <= camY + vh) out.add(s);
      }
    }
    return out;
  }

  // focus: {x, y} world px used for roof fading; entities: [{sy, draw(ctx, camX, camY)}]; dyn: extra drawables.
  draw(ctx, camX, camY, vw, vh, opts) {
    const { minute, focus, entities = [], dt = 1 / 60, reduceFlash = false, timeSec = 0, night = isNight(minute) } = opts;
    camX = Math.round(camX); camY = Math.round(camY);
    this.terrain.draw(ctx, camX, camY, vw, vh);
    if (opts.underlay) opts.underlay(ctx, camX, camY);
    const W = this.W;
    const inB = focus ? W.bldg[Math.floor(focus.y / 16) * WORLD_W + Math.floor(focus.x / 16)] : -1;
    const list = [];
    for (const s of this.visibleStatics(camX, camY, vw, vh)) list.push(s);
    for (const e of entities) list.push(e);
    list.sort((a, b) => a.sy - b.sy);
    this.light.clear();
    for (const s of list) {
      if (s.draw) { s.draw(ctx, camX, camY); continue; }
      if (s.kind === 'bld') this.drawBuilding(ctx, s.b, camX, camY, inB, dt, night);
      else if (s.kind === 'tower') ctx.drawImage(towerSprite(s.style), s.x0 - camX, s.y0 - camY);
      else if (s.kind === 'gate') ctx.drawImage(gateSprite(s.style, s.name, 3), s.x0 - camX, s.y0 - camY);
      else if (s.kind === 'prop') {
        const hl = this.highlight && this.highlight === s.p;
        if (hl) { const h = highlightSprite(s.sp.img); const a = 0.55 + 0.45 * Math.sin(timeSec * 6); ctx.globalAlpha = a; ctx.drawImage(h, s.x0 - camX - 2, s.y0 - camY - 2); ctx.globalAlpha = 1; }
        ctx.drawImage(s.sp.img, s.x0 - camX, s.y0 - camY);
        const L = LIGHT_PROPS[s.p.type];
        if (L && night) this.light.add(s.p.x * 16 + 8, s.p.y * 16 + 2, L[0], L[1], s.p.type === 'fire' ? 0.85 + Math.random() * 0.25 : 1);
        if (s.p.type === 'fire' && Math.random() < 0.3) this.fx.fire(s.p.x * 16 + 8, s.p.y * 16 + 10);
      }
    }
    this.fx.draw(ctx, camX, camY);
    if (opts.overlay) opts.overlay(ctx, camX, camY);
    if (opts.lights) opts.lights(this.light);
    const amb = ambientAt(minute);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    this.light.apply(ctx, camX, camY, vw, vh, amb);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    this.fx.drawTexts(ctx, camX, camY);
    void reduceFlash; void timeSec;
  }

  drawBuilding(ctx, b, camX, camY, inB, dt, night) {
    const spr = buildingSprites(b);
    const target = inB === b.id ? 0.12 : 1;
    let a = this.fade.has(b.id) ? this.fade.get(b.id) : 1;
    a += (target - a) * Math.min(1, dt * 8);
    this.fade.set(b.id, a);
    const x = b.x * 16 - camX, y = (b.y - 1) * 16 - camY;
    if (a < 0.99) ctx.drawImage(spr.inner, x, y);
    ctx.globalAlpha = a;
    ctx.drawImage(spr.roof, x, y);
    ctx.globalAlpha = 1;
    ctx.drawImage(spr.face, x, (b.y + b.h - 1) * 16 - camY);
    if (spr.sign) {
      const d = b.doors[0];
      const sx = d.f === 'S' ? (d.x * 16 + 8 - spr.sign.width / 2) : (b.x * 16 + b.w * 8 - spr.sign.width / 2);
      const sy = (b.y + b.h - 1) * 16 - 7;
      ctx.globalAlpha = Math.max(a, 0.35);
      ctx.drawImage(spr.sign, Math.round(sx - camX), Math.round(sy - camY));
      ctx.globalAlpha = 1;
    }
    if (night && !b.ruined && b.role !== 'lot') {
      for (let t = 1; t < b.w - 1; t++) {
        if (t % 2 === 1 || b.w <= 4) this.light.add((b.x + t) * 16 + 8, (b.y + b.h - 1) * 16 + 7, 18, 'rgba(255,190,110,0.9)', 0.8);
      }
    }
  }
}

export const RENDER_CONST = { TILE, WORLD_W, WORLD_H, RAMPS };
