// Action-layer primitives: spatial hash, tile collision with sliding, line-of-sight raycasts.
import { WORLD_W, WORLD_H } from '../data/places.js';
import { SOLID } from '../world/tiles.js';

export const T = 16;

export class SpatialHash {
  constructor(cell = 64) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return cx * 4096 + cy; }
  insert(e) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(e);
  }
  query(x, y, r, out = []) {
    out.length = 0;
    const c0 = Math.floor((x - r) / this.cell), c1 = Math.floor((x + r) / this.cell);
    const r0 = Math.floor((y - r) / this.cell), r1 = Math.floor((y + r) / this.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const b = this.map.get(this.key(cx, cy));
      if (b) for (const e of b) out.push(e);
    }
    return out;
  }
}

// Tile solidity incl. dynamic locks (locked doors) owned by the action world.
export function makeTileQuery(W, locks) {
  const solidAt = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return SOLID.FULL;
    const i = ty * WORLD_W + tx;
    if (locks.has(i)) return SOLID.FULL;
    return W.solid[i];
  };
  return {
    solidAt,
    blocksMove: (tx, ty) => solidAt(tx, ty) !== 0,
    blocksSight: (tx, ty) => solidAt(tx, ty) === SOLID.FULL,
    blocksShot: (tx, ty) => { const s = solidAt(tx, ty); return s === SOLID.FULL || s === SOLID.LOW; },
  };
}

// Move an entity's feet box (hw x hh) by (dx, dy) with axis-separated sliding.
export function moveBox(Q, e, dx, dy, hw = 4, hh = 3) {
  const tryAxis = (nx, ny) => {
    const x0 = Math.floor((nx - hw) / T), x1 = Math.floor((nx + hw - 0.01) / T);
    const y0 = Math.floor((ny - hh) / T), y1 = Math.floor((ny + hh - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (Q.blocksMove(tx, ty)) return false;
    return true;
  };
  let moved = false;
  if (dx && tryAxis(e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && tryAxis(e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

export function freeAt(Q, x, y, hw = 4, hh = 3) {
  const x0 = Math.floor((x - hw) / T), x1 = Math.floor((x + hw - 0.01) / T);
  const y0 = Math.floor((y - hh) / T), y1 = Math.floor((y + hh - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (Q.blocksMove(tx, ty)) return false;
  return true;
}

// DDA ray between two points in px. test(tx, ty) -> true if blocking. Returns hit point or null.
export function raycast(x0, y0, x1, y1, test, skipNear = 0) {
  let tx = Math.floor(x0 / T), ty = Math.floor(y0 / T);
  const ex = Math.floor(x1 / T), ey = Math.floor(y1 / T);
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const tdx = dx !== 0 ? Math.abs(T / dx) : Infinity, tdy = dy !== 0 ? Math.abs(T / dy) : Infinity;
  let tmx = dx !== 0 ? ((stepX > 0 ? (tx + 1) * T - x0 : x0 - tx * T) / Math.abs(dx)) : Infinity;
  let tmy = dy !== 0 ? ((stepY > 0 ? (ty + 1) * T - y0 : y0 - ty * T) / Math.abs(dy)) : Infinity;
  let t = 0;
  for (let guard = 0; guard < 256; guard++) {
    if (t * Math.hypot(dx, dy) > skipNear && test(tx, ty)) return { x: x0 + dx * t, y: y0 + dy * t, tx, ty };
    if (tx === ex && ty === ey) return null;
    if (tmx < tmy) { t = tmx; tmx += tdx; tx += stepX; } else { t = tmy; tmy += tdy; ty += stepY; }
    if (t > 1) return null;
  }
  return null;
}

export const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const dirFromAngle = (a) => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) > Math.abs(s) ? (c > 0 ? 2 : 3) : (s > 0 ? 0 : 1); };
