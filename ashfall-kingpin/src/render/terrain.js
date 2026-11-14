// Terrain + static structure baking into 256x256 chunk canvases.
// Per-pixel colour from world-space noise with Bayer-dithered palette ramps (seamless, no tiling).
// Autotile: each tile blends higher-priority neighbours in via a 4-edge + 4-corner mask.
import { RAMPS, hexToRgb } from '../data/palette.js';
import { STYLES, WORLD_W, WORLD_H, TILE, CHUNK } from '../data/places.js';
import { T, F, ST } from '../world/tiles.js';
import { fbm, hash2 } from '../core/rng.js';
import { createCanvas, ctx2d } from './canvas.js';

const R = {};
for (const [k, ramp] of Object.entries(RAMPS)) R[k] = ramp.map(hexToRgb);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
const OVERLAY_PRI = { [T.WATER]: 0, [T.MARSH]: 1, [T.SAND]: 2, [T.DIRT]: 3, [T.FIELD]: 3.5, [T.GRASS]: 4, [T.RUBBLE]: 5, [T.ROCK]: 6, [T.CLIFF]: 6 };

const NG = 4; // noise grid resolution in pixels
const NGW = (WORLD_W * TILE) / NG + 1;

export class TerrainRenderer {
  constructor(W) {
    this.W = W;
    this.noise = new Float32Array(NGW * NGW);
    for (let y = 0; y < NGW; y++) for (let x = 0; x < NGW; x++) this.noise[y * NGW + x] = fbm(x * 0.045, y * 0.045, W.seed + 99, 3);
    this.chunksX = WORLD_W / CHUNK;
    this.chunksY = WORLD_H / CHUNK;
    this.chunks = new Array(this.chunksX * this.chunksY).fill(null);
    this.bakeQueue = [];
    for (let i = 0; i < this.chunks.length; i++) this.bakeQueue.push(i);
  }

  n(wx, wy) {
    const fx = wx / NG, fy = wy / NG;
    const x0 = Math.min(NGW - 2, fx | 0), y0 = Math.min(NGW - 2, fy | 0);
    const tx = fx - x0, ty = fy - y0;
    const a = this.noise[y0 * NGW + x0], b = this.noise[y0 * NGW + x0 + 1];
    const c = this.noise[(y0 + 1) * NGW + x0], d = this.noise[(y0 + 1) * NGW + x0 + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  // Bake a few chunks per call (boot spreads this over frames). Returns progress 0..1.
  bakeSome(budgetMs = 12) {
    const t0 = performance.now();
    while (this.bakeQueue.length && performance.now() - t0 < budgetMs) {
      const i = this.bakeQueue.shift();
      this.chunks[i] = this.bakeChunk(i % this.chunksX, Math.floor(i / this.chunksX));
    }
    return 1 - this.bakeQueue.length / this.chunks.length;
  }

  rebakeTiles(tiles) {
    const set = new Set(tiles.map(([x, y]) => Math.floor(y / CHUNK) * this.chunksX + Math.floor(x / CHUNK)));
    for (const i of set) this.chunks[i] = this.bakeChunk(i % this.chunksX, Math.floor(i / this.chunksX));
  }

  draw(ctx, camX, camY, vw, vh) {
    const S = CHUNK * TILE;
    const x0 = Math.max(0, Math.floor(camX / S)), y0 = Math.max(0, Math.floor(camY / S));
    const x1 = Math.min(this.chunksX - 1, Math.floor((camX + vw) / S)), y1 = Math.min(this.chunksY - 1, Math.floor((camY + vh) / S));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      let c = this.chunks[cy * this.chunksX + cx];
      if (!c) { c = this.chunks[cy * this.chunksX + cx] = this.bakeChunk(cx, cy); }
      ctx.drawImage(c, Math.round(cx * S - camX), Math.round(cy * S - camY));
    }
  }

  // ---------- per-pixel colour ----------
  ramp(name, v, wx, wy) {
    const i = Math.max(0, Math.min(3, Math.floor(v * 4 + BAYER[(wy & 3) * 4 + (wx & 3)])));
    return R[name][i];
  }

  terrain(t, wx, wy) {
    const n = this.n(wx, wy);
    const h = hash2(wx, wy, 7);
    switch (t) {
      case T.WATER: {
        if (h > 0.996) return R.sea[3];
        return this.ramp('sea', 0.2 + n * 0.45 + 0.12 * Math.sin(wx * 0.21 + wy * 0.6 + n * 9), wx, wy);
      }
      case T.SAND: {
        if (h > 0.988) return R.bone[0];
        return this.ramp('sand', 0.42 + n * 0.32 + 0.2 * Math.sin(wx * 0.23 + wy * 0.09 + n * 12), wx, wy);
      }
      case T.DIRT: return h > 0.992 ? R.sand[2] : this.ramp('wood', 0.3 + n * 0.5, wx, wy);
      case T.GRASS: return h > 0.982 ? R.sand[2] : h < 0.012 ? R.olive[0] : this.ramp('olive', 0.25 + n * 0.6, wx, wy);
      case T.MARSH: return n < 0.42 ? this.ramp('teal', 0.15 + n * 0.8, wx, wy) : this.ramp('olive', (n - 0.42) * 1.5, wx, wy);
      case T.ROCK: return h > 0.985 ? R.bone[1] : n > 0.7 ? this.ramp('bone', (n - 0.7) * 1.5, wx, wy) : this.ramp('ink', 0.45 + n * 0.55, wx, wy);
      case T.RUBBLE: return h > 0.975 ? R.rust[1] : h < 0.02 ? R.ink[1] : this.ramp('ink', 0.5 + n * 0.5, wx, wy);
      case T.FIELD: {
        const row = ((wy % 6) + 6) % 6;
        if (row < 2) return R.wood[0 + (row & 1)];
        if (h > 0.94) return R.olive[2];
        return this.ramp('wood', 0.45 + n * 0.35, wx, wy);
      }
      case T.CLIFF: return n > 0.62 ? R.bone[0] : this.ramp('ink', 0.6 + n * 0.5, wx, wy);
      default: return R.ink[2];
    }
  }

  floor(f, wx, wy, tx, ty) {
    const px = wx & 15, py = wy & 15;
    const th = hash2(tx, ty, 3);
    const n = this.n(wx, wy);
    const h = hash2(wx, wy, 11);
    switch (f) {
      case F.PLANK: {
        if ((py & 3) === 3) return R.wood[0];
        const board = (py >> 2) + ty * 4;
        if (((px + Math.floor(hash2(board, tx, 5) * 16)) & 15) === 0) return R.wood[0];
        return h > 0.93 ? R.wood[1] : R.wood[2 + (hash2(board, tx, 9) > 0.6 ? 1 : 0)];
      }
      case F.STONE: {
        const off = ((py >> 3) & 1) * 4;
        if ((py & 7) === 0 || ((px + off) & 7) === 0) return R.ink[2];
        return this.ramp('bone', n * 0.5, wx, wy);
      }
      case F.TILE: {
        if ((px & 7) === 0 || (py & 7) === 0) return R.bone[0];
        return ((px >> 3) + (py >> 3)) & 1 ? R.bone[1] : R.bone[2];
      }
      case F.CONCRETE: {
        if (px === 0 || py === 0) return R.ink[2];
        return h > 0.985 ? R.ink[2] : this.ramp('ink', 0.62 + n * 0.45, wx, wy);
      }
      case F.DIRTFLOOR: return h > 0.985 ? R.bone[0] : this.ramp('sand', 0.1 + n * 0.45, wx, wy);
      case F.COBBLE: {
        const sx = (px + ((py >> 2) & 1) * 2) & 3, sy = py & 3;
        if (sx === 3 || sy === 3) return R.ink[2];
        return hash2(((px + ((py >> 2) & 1) * 2) >> 2) + tx * 5, (py >> 2) + ty * 5, 2) > 0.5 ? R.bone[0] : R.ink[3];
      }
      case F.RAIL: {
        if (px === 4 || px === 11) return R.bone[1];
        if (px === 5 || px === 12) return R.ink[1];
        if ((py & 3) !== 0 && px >= 2 && px <= 13 && (py & 3) !== 3) return R.wood[1];
        return this.ramp('ink', 0.4 + n * 0.5, wx, wy);
      }
      case F.RUBBLEFLOOR: return h > 0.96 ? R.rust[1] : h < 0.04 ? R.bone[0] : this.ramp('ink', 0.35 + n * 0.55, wx, wy);
      case F.SOIL: return h > 0.97 ? R.wood[2] : this.ramp('wood', n * 0.45, wx, wy);
      case F.ASPHALT: return h > 0.97 ? R.ink[3] : h < 0.015 ? R.ink[0] : this.ramp('ink', 0.3 + n * 0.3, wx, wy);
      case F.TRACK: return h > 0.985 ? R.bone[0] : this.ramp('sand', 0.15 + n * 0.45, wx, wy);
      default: return null;
    }
  }

  // ---------- chunk bake ----------
  bakeChunk(cx, cy) {
    const W = this.W;
    const S = CHUNK * TILE;
    const can = createCanvas(S, S);
    const ctx = ctx2d(can);
    const img = ctx.createImageData(S, S);
    const d = img.data;
    const ground = W.ground;
    const gAt = (x, y) => (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H ? -1 : ground[y * WORLD_W + x]);
    for (let ty = cy * CHUNK; ty < (cy + 1) * CHUNK; ty++) {
      for (let tx = cx * CHUNK; tx < (cx + 1) * CHUNK; tx++) {
        const i = ty * WORLD_W + tx;
        const base = ground[i] === T.CLIFF ? T.ROCK : ground[i];
        const bp = OVERLAY_PRI[base];
        // Collect blend layers: distinct higher-priority neighbours with their 8-bit masks.
        const layers = [];
        const nb = [gAt(tx, ty - 1), gAt(tx + 1, ty - 1), gAt(tx + 1, ty), gAt(tx + 1, ty + 1), gAt(tx, ty + 1), gAt(tx - 1, ty + 1), gAt(tx - 1, ty), gAt(tx - 1, ty - 1)];
        for (let k = 0; k < 8; k++) {
          let t = nb[k];
          if (t < 0) continue;
          if (t === T.CLIFF) t = T.ROCK;
          if (OVERLAY_PRI[t] <= bp || layers.some((l) => l.t === t)) continue;
          let mask = 0;
          for (let j = 0; j < 8; j++) { let u = nb[j]; if (u === T.CLIFF) u = T.ROCK; if (u === t) mask |= 1 << j; }
          layers.push({ t, mask });
        }
        layers.sort((a, b) => OVERLAY_PRI[a.t] - OVERLAY_PRI[b.t]);
        const fl = W.floor[i];
        const road = W.road[i];
        const trackEdges = road === 2 ? this.trackMask(tx, ty) : 0;
        for (let py = 0; py < 16; py++) {
          for (let px = 0; px < 16; px++) {
            const wx = tx * 16 + px, wy = ty * 16 + py;
            let col = this.terrain(base, wx, wy);
            for (const L of layers) {
              const cov = coverage(L.mask, px, py);
              if (cov <= 0) continue;
              const thr = 0.5 + (this.n(wx * 3, wy * 3) - 0.5) * 0.7;
              if (cov > thr) col = this.terrain(L.t, wx, wy);
              else if (base === T.WATER && cov > thr - 0.13) col = R.bone[2];
            }
            if (fl) {
              if (road === 2) {
                const e = coverage(trackEdges, px, py);
                const thr = 0.55 + (hash2(wx, wy, 4) - 0.5) * 0.5;
                if (!(e > thr)) col = this.floor(fl, wx, wy, tx, ty) || col;
              } else col = this.floor(fl, wx, wy, tx, ty) || col;
            }
            const o = ((ty - cy * CHUNK) * 16 + py) * S * 4 + ((tx - cx * CHUNK) * 16 + px) * 4;
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.drawStatic(ctx, cx, cy);
    return can;
  }

  // Track edges erode toward non-road neighbours (bits = neighbours that are NOT road).
  trackMask(tx, ty) {
    const W = this.W;
    const off = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    let m = 0;
    off.forEach(([dx, dy], k) => {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
      const j = y * WORLD_W + x;
      if (!W.road[j] && !W.street[j]) m |= 1 << k;
    });
    return m;
  }

  // Canvas-op pass: curbs, centre dashes, cliffs, walls, fences, shadows, decals.
  drawStatic(ctx, cx, cy) {
    const W = this.W;
    const ox = cx * CHUNK, oy = cy * CHUNK;
    const at = (a, x, y) => (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H ? 0 : a[y * WORLD_W + x]);
    const fill = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    // Building drop shadows (sun from top-left: shadow falls right and down).
    ctx.fillStyle = 'rgba(18,15,14,0.35)';
    for (const b of W.buildings) {
      if (b.x > ox + CHUNK + 1 || b.y > oy + CHUNK + 1 || b.x + b.w < ox - 1 || b.y + b.h < oy - 1) continue;
      const px = (b.x - ox) * 16, py = (b.y - oy) * 16;
      ctx.fillRect(px + b.w * 16, py + 2, 5, b.h * 16);
      ctx.fillRect(px + 6, py + b.h * 16, b.w * 16 - 1, 3);
    }
    for (let ty = oy - 1; ty <= oy + CHUNK; ty++) {
      for (let tx = ox - 1; tx <= ox + CHUNK; tx++) {
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        const i = ty * WORLD_W + tx;
        const x = (tx - ox) * 16, y = (ty - oy) * 16;
        const inChunk = tx >= ox && ty >= oy && tx < ox + CHUNK && ty < oy + CHUNK;
        // Cliff shadow spills onto neighbours from outside the chunk too.
        if (W.ground[i] === T.CLIFF) {
          if (at(W.ground, tx + 1, ty) !== T.CLIFF) { ctx.fillStyle = 'rgba(18,15,14,0.32)'; ctx.fillRect(x + 16, y + 3, 4, 16); }
          if (at(W.ground, tx, ty + 1) !== T.CLIFF) { ctx.fillStyle = 'rgba(18,15,14,0.32)'; ctx.fillRect(x + 3, y + 16, 16, 3); }
        }
        if (!inChunk) continue;
        if (W.road[i] === 1) this.drawCurbs(ctx, tx, ty, x, y);
        if (W.ground[i] === T.CLIFF && !W.road[i] && !W.zone[i]) this.drawCliff(ctx, tx, ty, x, y);
        const st = W.struct[i];
        if (st === ST.WALL || st === ST.TOWER) this.drawWall(ctx, tx, ty, x, y);
        else if (st === ST.FENCE) this.drawFence(ctx, tx, ty, x, y);
        if (!W.solid[i] && !W.road[i] && !W.floor[i] && W.bldg[i] < 0) this.drawDecal(ctx, W.ground[i], W.deco[i], x, y);
      }
    }
    void fill;
  }

  drawCurbs(ctx, tx, ty, x, y) {
    const W = this.W;
    const road = (dx, dy) => {
      const a = tx + dx, b = ty + dy;
      if (a < 0 || b < 0 || a >= WORLD_W || b >= WORLD_H) return true;
      const j = b * WORLD_W + a;
      return W.road[j] === 1 || W.struct[j] === ST.GATE || W.zone[j] > 0;
    };
    const hi = RAMPS.bone[1], sh = RAMPS.ink[1];
    ctx.fillStyle = hi;
    if (!road(0, -1)) { ctx.fillRect(x, y, 16, 2); ctx.fillStyle = sh; ctx.fillRect(x, y + 2, 16, 1); ctx.fillStyle = hi; }
    if (!road(0, 1)) { ctx.fillRect(x, y + 14, 16, 2); ctx.fillStyle = sh; ctx.fillRect(x, y + 13, 16, 1); ctx.fillStyle = hi; }
    if (!road(-1, 0)) { ctx.fillRect(x, y, 2, 16); ctx.fillStyle = sh; ctx.fillRect(x + 2, y, 1, 16); ctx.fillStyle = hi; }
    if (!road(1, 0)) { ctx.fillRect(x + 14, y, 2, 16); ctx.fillStyle = sh; ctx.fillRect(x + 13, y, 1, 16); ctx.fillStyle = hi; }
    // Inner corners.
    if (road(0, -1) && road(-1, 0) && !road(-1, -1)) ctx.fillRect(x, y, 2, 2);
    if (road(0, -1) && road(1, 0) && !road(1, -1)) ctx.fillRect(x + 14, y, 2, 2);
    if (road(0, 1) && road(-1, 0) && !road(-1, 1)) ctx.fillRect(x, y + 14, 2, 2);
    if (road(0, 1) && road(1, 0) && !road(1, 1)) ctx.fillRect(x + 14, y + 14, 2, 2);
    // Faded centre dashes on the middle lane of a 3-wide road.
    const r = (dx, dy) => { const a = tx + dx, b = ty + dy; return a >= 0 && b >= 0 && a < WORLD_W && b < WORLD_H && W.road[b * WORLD_W + a] === 1; };
    ctx.fillStyle = RAMPS.gold[0];
    if (r(0, -1) && r(0, 1) && !r(0, -2) && !r(0, 2) && r(-1, 0) && r(1, 0)) { if ((tx & 1) === 0) ctx.fillRect(x + 3, y + 7, 9, 2); }
    else if (r(-1, 0) && r(1, 0) && !r(-2, 0) && !r(2, 0) && r(0, -1) && r(0, 1)) { if ((ty & 1) === 0) ctx.fillRect(x + 7, y + 3, 2, 9); }
  }

  drawCliff(ctx, tx, ty, x, y) {
    const W = this.W;
    const cl = (dx, dy) => { const a = tx + dx, b = ty + dy; return a < 0 || b < 0 || a >= WORLD_W || b >= WORLD_H || W.ground[b * WORLD_W + a] === T.CLIFF; };
    if (!cl(0, 1)) {
      // South face: striated rock, darker toward the base.
      for (let k = 0; k < 9; k++) { ctx.fillStyle = k < 2 ? RAMPS.bone[0] : k < 6 ? RAMPS.ink[2] : RAMPS.ink[1]; ctx.fillRect(x, y + 7 + k, 16, 1); }
      ctx.fillStyle = RAMPS.ink[1];
      for (let k = 0; k < 4; k++) ctx.fillRect(x + ((tx * 7 + k * 5) % 15), y + 9, 1, 6);
      ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(x, y + 15, 16, 1);
    }
    ctx.fillStyle = RAMPS.bone[1];
    if (!cl(0, -1)) ctx.fillRect(x, y, 16, 1);
    if (!cl(-1, 0)) ctx.fillRect(x, y, 1, cl(0, 1) ? 16 : 8);
    ctx.fillStyle = RAMPS.ink[1];
    if (!cl(1, 0)) ctx.fillRect(x + 15, y, 1, cl(0, 1) ? 16 : 8);
  }

  wallRamp(tx, ty) {
    const st = STYLES[this.W.wallStyle[ty * WORLD_W + tx]] || STYLES.ruin;
    return { ramp: RAMPS[st.wall] || RAMPS.ink, mat: st.wall, fence: st.fence };
  }

  drawWall(ctx, tx, ty, x, y) {
    const W = this.W;
    const isWall = (dx, dy) => { const a = tx + dx, b = ty + dy; if (a < 0 || b < 0 || a >= WORLD_W || b >= WORLD_H) return false; const s = W.struct[b * WORLD_W + a]; return s === ST.WALL || s === ST.TOWER; };
    const { ramp, mat } = this.wallRamp(tx, ty);
    const vertical = isWall(0, 1);
    const top = vertical ? 16 : 6;
    ctx.fillStyle = ramp[2]; ctx.fillRect(x, y, 16, top);
    ctx.fillStyle = ramp[3]; ctx.fillRect(x, y, 16, 1);
    if (!isWall(-1, 0)) ctx.fillRect(x, y, 1, top);
    ctx.fillStyle = ramp[1];
    if (!isWall(1, 0)) ctx.fillRect(x + 15, y, 1, top);
    if (vertical) {
      ctx.fillStyle = ramp[1]; ctx.fillRect(x + 7, y + 2, 2, 12);
      return;
    }
    // South face with material texture.
    ctx.fillStyle = ramp[1]; ctx.fillRect(x, y + 6, 16, 10);
    ctx.fillStyle = ramp[0];
    if (mat === 'wood') { for (let k = 0; k < 16; k += 4) ctx.fillRect(x + k, y + 6, 1, 10); }
    else if (mat === 'rust' || mat === 'sea') { for (let k = 1; k < 16; k += 3) ctx.fillRect(x + k, y + 7, 1, 8); ctx.fillStyle = ramp[2]; ctx.fillRect(x + ((tx * 5) % 13), y + 9, 2, 2); }
    else { ctx.fillRect(x, y + 10, 16, 1); ctx.fillRect(x + ((ty & 1) ? 4 : 10), y + 6, 1, 4); ctx.fillRect(x + ((ty & 1) ? 12 : 2), y + 11, 1, 4); }
    ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(x, y + 15, 16, 1);
    if (!isWall(-1, 0)) { ctx.fillStyle = ramp[3]; ctx.fillRect(x, y + 6, 1, 9); }
    if (!isWall(1, 0)) { ctx.fillStyle = ramp[0]; ctx.fillRect(x + 15, y + 6, 1, 9); }
  }

  drawFence(ctx, tx, ty, x, y) {
    const W = this.W;
    const f = (dx, dy) => { const a = tx + dx, b = ty + dy; return a >= 0 && b >= 0 && a < WORLD_W && b < WORLD_H && W.struct[b * WORLD_W + a] === ST.FENCE; };
    const { fence } = this.wallRamp(tx, ty);
    const post = fence === 'metal' ? RAMPS.ink[3] : fence === 'stone' ? RAMPS.bone[1] : RAMPS.wood[2];
    const rail = fence === 'metal' ? RAMPS.ink[2] : fence === 'stone' ? RAMPS.bone[0] : RAMPS.wood[1];
    const vertical = (f(0, -1) || f(0, 1)) && !(f(-1, 0) || f(1, 0));
    if (fence === 'stone') {
      ctx.fillStyle = rail; ctx.fillRect(vertical ? x + 5 : x, vertical ? y : y + 8, vertical ? 6 : 16, vertical ? 16 : 6);
      ctx.fillStyle = post; ctx.fillRect(vertical ? x + 5 : x, vertical ? y : y + 8, vertical ? 6 : 16, 2);
      return;
    }
    if (vertical) {
      ctx.fillStyle = rail; ctx.fillRect(x + 7, y, 2, 16);
      ctx.fillStyle = post; ctx.fillRect(x + 6, y + 2, 4, 4); ctx.fillRect(x + 6, y + 10, 4, 4);
    } else {
      ctx.fillStyle = rail; ctx.fillRect(x, y + 7, 16, 1); ctx.fillRect(x, y + 11, 16, 1);
      if (fence === 'metal') { ctx.fillStyle = 'rgba(110,98,90,0.6)'; for (let k = 0; k < 16; k += 2) ctx.fillRect(x + k, y + 6 + (k & 2), 1, 6); }
      ctx.fillStyle = post; ctx.fillRect(x + 2, y + 4, 2, 11); ctx.fillRect(x + 12, y + 4, 2, 11);
      ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(x + 3, y + 15, 2, 1); ctx.fillRect(x + 13, y + 15, 2, 1);
    }
  }

  drawDecal(ctx, g, deco, x, y) {
    if (deco > 40) return;
    const a = (deco * 7) % 12 + 2, b = (deco * 13) % 11 + 3;
    if (g === T.GRASS || g === T.FIELD || g === T.MARSH) {
      ctx.fillStyle = g === T.MARSH ? RAMPS.olive[2] : RAMPS.olive[3];
      ctx.fillRect(x + a, y + b, 1, 3); ctx.fillRect(x + a + 2, y + b + 1, 1, 2); ctx.fillRect(x + a - 2, y + b + 1, 1, 2);
    } else if (g === T.DIRT || g === T.SAND) {
      ctx.fillStyle = RAMPS.bone[0]; ctx.fillRect(x + a, y + b, 2, 1);
      ctx.fillStyle = RAMPS.ink[2]; ctx.fillRect(x + a, y + b + 1, 2, 1);
    } else if (g === T.RUBBLE || g === T.ROCK) {
      ctx.fillStyle = RAMPS.ink[1];
      ctx.fillRect(x + a, y + b, 3, 1); ctx.fillRect(x + a + 2, y + b + 1, 2, 1); ctx.fillRect(x + a + 3, y + b + 2, 1, 2);
    }
  }
}

// Coverage of an 8-bit neighbour mask (N, NE, E, SE, S, SW, W, NW) at pixel (px, py) in a 16px tile.
function coverage(mask, px, py) {
  let c = 0;
  const D = 7;
  if (mask & 1) c = Math.max(c, 1 - py / D);
  if (mask & 4) c = Math.max(c, 1 - (15 - px) / D);
  if (mask & 16) c = Math.max(c, 1 - (15 - py) / D);
  if (mask & 64) c = Math.max(c, 1 - px / D);
  if (mask & 2 && !(mask & 1) && !(mask & 4)) c = Math.max(c, 1 - Math.hypot(15 - px, py) / (D + 1));
  if (mask & 8 && !(mask & 4) && !(mask & 16)) c = Math.max(c, 1 - Math.hypot(15 - px, 15 - py) / (D + 1));
  if (mask & 32 && !(mask & 16) && !(mask & 64)) c = Math.max(c, 1 - Math.hypot(px, 15 - py) / (D + 1));
  if (mask & 128 && !(mask & 64) && !(mask & 1)) c = Math.max(c, 1 - Math.hypot(px, py) / (D + 1));
  return c;
}

// 1 px per tile overview used by the minimap and the Ledger map.
export function bakeMinimap(W) {
  const can = createCanvas(WORLD_W, WORLD_H);
  const ctx = ctx2d(can);
  const img = ctx.createImageData(WORLD_W, WORLD_H);
  const col = { [T.WATER]: R.sea[1], [T.SAND]: R.sand[2], [T.DIRT]: R.wood[2], [T.GRASS]: R.olive[2], [T.MARSH]: R.teal[1], [T.ROCK]: R.ink[3], [T.RUBBLE]: R.ink[2], [T.FIELD]: R.wood[1], [T.CLIFF]: R.ink[1] };
  for (let i = 0; i < WORLD_W * WORLD_H; i++) {
    let c = col[W.ground[i]] || R.ink[2];
    if (W.road[i] === 1) c = R.ink[1];
    else if (W.road[i] === 2) c = R.sand[1];
    if (W.street[i] && !W.road[i]) c = R.bone[0];
    if (W.struct[i] === ST.WALL || W.struct[i] === ST.TOWER || W.struct[i] === ST.FENCE) c = R.bone[2];
    if (W.bldg[i] >= 0) c = W.buildings[W.bldg[i]].hq ? R.gold[1] : R.rust[2];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return can;
}
