// Static 3D world built once from the tile world: one module kit (boxes, gable prisms, cylinders)
// for every structure, palettes per place. Instances are grouped per 16x16-tile chunk for culling.
import { RAMPS, hexToRgb } from '../data/palette.js';
import { STYLES, WORLD_W, WORLD_H, PLACES } from '../data/places.js';
import { T as TER, ST } from '../world/tiles.js';
import { hash2 } from '../core/rng.js';
import { Batch, PRIM, PAT } from './glcore.js';
import { IDENT } from './math.js';

export const PAL = {};
for (const [k, ramp] of Object.entries(RAMPS)) PAL[k] = ramp.map((h) => hexToRgb(h).map((v) => v / 255));
export const rgb = (hex) => hexToRgb(hex).map((v) => v / 255);

export const WALL_H = 20;
export const TOWER_TOP = 32;
const WALL_PAT = (mat) => (mat === 'wood' ? PAT.PLANK : mat === 'rust' || mat === 'sea' ? PAT.CORR : PAT.BRICK);
const ROOF_PAT = { tin: PAT.CORR, shingle: PAT.SHINGLE, flat: PAT.CONCRETE, tarp: PAT.STRIPE };

export class StaticBuilder {
  constructor() { this.chunks = Array.from({ length: 64 }, () => new Batch(64)); this.lights = []; this.labels = []; }
  chunk(x, z) { const cx = Math.max(0, Math.min(7, Math.floor(x / 256))), cz = Math.max(0, Math.min(7, Math.floor(z / 256))); return this.chunks[cz * 8 + cx]; }
  put(type, x, y, z, w, h, d, c, pat = 0, em = 0, al = 1, tag = 0, flag = 0) { this.chunk(x + w / 2, z + d / 2).add(type, IDENT, x, y, z, w, h, d, c, pat, em, al, tag, flag); }
  box(x, y, z, w, h, d, c, pat, em, al, tag, flag) { this.put(PRIM.CUBE, x, y, z, w, h, d, c, pat, em, al, tag, flag); }
  prx(x, y, z, w, h, d, c, pat, em, al, tag, flag) { this.put(PRIM.PRISM_X, x, y, z, w, h, d, c, pat, em, al, tag, flag); }
  prz(x, y, z, w, h, d, c, pat, em, al, tag, flag) { this.put(PRIM.PRISM_Z, x, y, z, w, h, d, c, pat, em, al, tag, flag); }
  cyl(x, y, z, w, h, d, c, pat, em, al, tag, flag) { this.put(PRIM.CYL, x, y, z, w, h, d, c, pat, em, al, tag, flag); }
}

export function buildStatic(W) {
  const m = new StaticBuilder();
  for (const b of W.buildings) building(m, W, b);
  perimeterWalls(m, W);
  towers(m, W);
  gates(m, W);
  fences(m, W);
  cliffs(m, W);
  for (const pr of W.props) if (!pr.hidden) prop(m, W, pr);
  return m;
}

export const buildingHeight = (b) => (b.ruined ? 16 : b.hq ? 28 : b.role === 'house' || b.role === 'lot' ? 20 : 22);

// ---------------- buildings ----------------
function building(m, W, b) {
  const st = STYLES[b.style] || STYLES.ruin;
  const wall = PAL[st.wall] || PAL.ink, roofR = PAL[st.roofRamp] || PAL.ink, trim = PAL[st.trim] || PAL.wood;
  const wp = WALL_PAT(st.wall);
  const x0 = b.x * 16, z0 = b.y * 16, w = b.w * 16, d = b.h * 16;
  const H = buildingHeight(b);
  const id = (b.id + 1) * 4;
  const WALLK = id + 1, ROOFK = id + 2, DECO = id + 3;
  const stAt = (tx, ty) => W.struct[ty * WORLD_W + tx];
  // Perimeter: wall runs split at doors; ruins get jagged per-tile heights and rubble.
  const side = (tiles, horiz) => {
    let run = null;
    const flush = () => { if (!run) return; const [tx, ty, n] = run; if (horiz) m.box(tx * 16, 0, ty * 16, n * 16, H, 16, wall[1], wp, 0, 1, WALLK); else m.box(tx * 16, 0, ty * 16, 16, H, n * 16, wall[1], wp, 0, 1, WALLK); run = null; };
    for (const [tx, ty] of tiles) {
      const s = stAt(tx, ty);
      if (s === ST.DOOR) {
        flush();
        // Lintel over the doorway plus two jamb posts.
        m.box(tx * 16, 15, ty * 16, 16, H - 15, 16, wall[1], wp, 0, 1, WALLK);
        if (horiz) { m.box(tx * 16, 0, ty * 16, 2.5, 15, 16, trim[1], PAT.FLAT, 0, 1, WALLK); m.box(tx * 16 + 13.5, 0, ty * 16, 2.5, 15, 16, trim[1], PAT.FLAT, 0, 1, WALLK); }
        else { m.box(tx * 16, 0, ty * 16, 16, 15, 2.5, trim[1], PAT.FLAT, 0, 1, WALLK); m.box(tx * 16, 0, ty * 16 + 13.5, 16, 15, 2.5, trim[1], PAT.FLAT, 0, 1, WALLK); }
      } else if (b.ruined) {
        flush();
        const hh = hash2(tx, ty, 31);
        if (s === ST.BROKEN) { m.box(tx * 16 + 1, 0, ty * 16 + 2, 14, 3 + hh * 5, 12, PAL.ink[2], PAT.ROCK); m.box(tx * 16 + 4, 0, ty * 16 + 5, 6, 6 + hh * 4, 6, PAL.bone[0], PAT.ROCK); }
        else { const hgt = 9 + Math.floor(hh * 4) * 3; m.box(tx * 16, 0, ty * 16, 16, hgt, 16, wall[1], PAT.BRICK, 0, 1, WALLK); if (hh > 0.5) m.box(tx * 16 + (horiz ? 0 : 3), hgt, ty * 16 + (horiz ? 3 : 0), horiz ? 7 : 10, 3, horiz ? 10 : 7, wall[2], PAT.BRICK, 0, 1, WALLK); }
      } else if (!run) run = [tx, ty, 1]; else run[2]++;
    }
    flush();
  };
  const row = (ty) => { const o = []; for (let tx = b.x; tx < b.x + b.w; tx++) o.push([tx, ty]); return o; };
  const col = (tx) => { const o = []; for (let ty = b.y + 1; ty < b.y + b.h - 1; ty++) o.push([tx, ty]); return o; };
  side(row(b.y), true); side(row(b.y + b.h - 1), true); side(col(b.x), false); side(col(b.x + b.w - 1), false);
  if (b.ruined) {
    // A few fallen roof beams.
    for (let k = 0; k < 2; k++) m.box(x0 + 4, 9 + k * 3, z0 + 10 + k * (d - 28), w - 8, 2, 2, PAL.wood[1], PAT.PLANK);
    return;
  }
  // Windows on the outer faces (glow at night unless the lot is vacant).
  const lit = b.role === 'lot' ? 0 : 1;
  const win = (x, z, ww, dd, tx, ty) => {
    if (stAt(tx, ty) !== ST.BWALL) return;
    m.box(x - (ww > 2 ? 1 : 0), 7, z - (dd > 2 ? 1 : 0), ww > 2 ? ww + 2 : ww * 0.6, 9, dd > 2 ? dd + 2 : dd * 0.6, trim[1], PAT.FLAT, 0, 1, DECO);
    m.box(x, 8, z, ww, 7, dd, PAL.sea[0], PAT.WINDOW, 0, 1, DECO, lit);
  };
  for (let t = 1; t < b.w - 1; t++) {
    if (!(t % 2 === 1 || b.w <= 4)) continue;
    win(x0 + t * 16 + 4, z0 + d - 0.3, 8, 0.9, b.x + t, b.y + b.h - 1);
    win(x0 + t * 16 + 4, z0 - 0.6, 8, 0.9, b.x + t, b.y);
  }
  for (let t = 1; t < b.h - 1; t++) {
    if (!(t % 2 === 1 || b.h <= 4)) continue;
    win(x0 - 0.6, z0 + t * 16 + 4, 0.9, 8, b.x, b.y + t);
    win(x0 + w - 0.3, z0 + t * 16 + 4, 0.9, 8, b.x + b.w - 1, b.y + t);
  }
  // Sign plank above each door + nameplate label for the overlay.
  b.doors.forEach((dr, k) => {
    const cx = dr.x * 16 + 8, cz = dr.y * 16 + 8;
    const col3 = b.lot ? PAL.bone[1] : b.hq ? PAL.gold[1] : trim[2];
    if (dr.f === 'S') m.box(cx - 11, 15.5, z0 + d, 22, 5, 1.2, col3, PAT.FLAT, 0, 1, DECO);
    else if (dr.f === 'N') m.box(cx - 11, 15.5, z0 - 1.2, 22, 5, 1.2, col3, PAT.FLAT, 0, 1, DECO);
    else if (dr.f === 'E') m.box(x0 + w, 15.5, cz - 11, 1.2, 5, 22, col3, PAT.FLAT, 0, 1, DECO);
    else m.box(x0 - 1.2, 15.5, cz - 11, 1.2, 5, 22, col3, PAT.FLAT, 0, 1, DECO);
    if (k === 0 && (b.sign || b.lot || b.hq)) {
      const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dr.f];
      m.labels.push({ x: cx + v[0] * 10, y: H + 6, z: cz + v[1] * 10, text: b.hq ? b.name.toUpperCase() : b.sign, b, kind: b.hq ? 'hq' : b.lot ? 'lot' : 'shop' });
    }
  });
  // Roof.
  const rp = ROOF_PAT[b.roof] || PAT.CORR;
  if (b.roof === 'flat') {
    m.box(x0 - 1, H, z0 - 1, w + 2, 2.5, d + 2, roofR[2], PAT.CONCRETE, 0, 1, ROOFK);
    m.box(x0 - 1, H + 2.5, z0 - 1, w + 2, 3, 2, roofR[1], PAT.FLAT, 0, 1, ROOFK); m.box(x0 - 1, H + 2.5, z0 + d - 1, w + 2, 3, 2, roofR[1], PAT.FLAT, 0, 1, ROOFK);
    m.box(x0 - 1, H + 2.5, z0 + 1, 2, 3, d - 2, roofR[1], PAT.FLAT, 0, 1, ROOFK); m.box(x0 + w - 1, H + 2.5, z0 + 1, 2, 3, d - 2, roofR[1], PAT.FLAT, 0, 1, ROOFK);
    m.box(x0 + 8 + hash2(b.id, 1, 5) * (w - 28), H + 2.5, z0 + 8, 9, 5, 7, PAL.ink[2], PAT.CORR, 0, 1, ROOFK);
    if (w > 60) m.cyl(x0 + w - 22, H + 2.5, z0 + d - 20, 8, 7, 8, PAL.ink[3], PAT.CORR, 0, 1, ROOFK);
    if (b.hq) { m.box(x0 + w / 2 - 0.6, H + 2.5, z0 + d / 2 - 0.6, 1.2, 20, 1.2, PAL.ink[2], PAT.FLAT, 0, 1, ROOFK); m.box(x0 + w / 2 + 0.6, H + 15, z0 + d / 2 - 0.3, 9, 6, 0.6, (PAL[st.banner] || PAL.teal)[2], PAT.FLAT, 0, 1, ROOFK); }
  } else {
    const rh = b.roof === 'tarp' ? 6 : Math.max(8, Math.min(15, Math.min(w, d) * 0.28));
    const colr = b.roof === 'tarp' ? roofR[2] : roofR[2];
    if (w >= d) { m.prx(x0 - 2.5, H, z0 - 2.5, w + 5, rh, d + 5, colr, rp, 0, 1, ROOFK, 0); m.box(x0 - 2.5, H + rh - 1, z0 + d / 2 - 1.2, w + 5, 1.6, 2.4, roofR[3], PAT.FLAT, 0, 1, ROOFK); }
    else { m.prz(x0 - 2.5, H, z0 - 2.5, w + 5, rh, d + 5, colr, rp, 0, 1, ROOFK, 1); m.box(x0 + w / 2 - 1.2, H + rh - 1, z0 - 2.5, 2.4, 1.6, d + 5, roofR[3], PAT.FLAT, 0, 1, ROOFK); }
    if (b.roof === 'shingle' && hash2(b.id, 9, 2) > 0.35) m.box(x0 + w * 0.7, H + 2, z0 + d * 0.3, 5, rh + 3, 5, PAL.rust[1], PAT.BRICK, 0, 1, ROOFK);
    if (b.hq) { m.box(x0 + w / 2 - 0.6, H + rh, z0 + d / 2 - 0.6, 1.2, 14, 1.2, PAL.ink[2], PAT.FLAT, 0, 1, ROOFK); m.box(x0 + w / 2 + 0.6, H + rh + 7, z0 + d / 2 - 0.3, 9, 6, 0.6, (PAL[st.banner] || PAL.teal)[2], PAT.FLAT, 0, 1, ROOFK); }
  }
}

// ---------------- perimeter walls, towers, gates, fences ----------------
function styleAt(W, i) { return STYLES[W.wallStyle[i]] || STYLES.ruin; }

function wallRun(m, W, tx, ty, n, horiz) {
  const st = styleAt(W, ty * WORLD_W + tx);
  const ramp = PAL[st.wall] || PAL.ink;
  const pat = WALL_PAT(st.wall);
  const x = tx * 16, z = ty * 16, len = n * 16;
  if (horiz) m.box(x, 0, z + 2, len, WALL_H, 12, ramp[1], pat); else m.box(x + 2, 0, z, 12, WALL_H, len, ramp[1], pat);
  for (let k = 0; k < n; k++) {
    const px = horiz ? x + k * 16 : x, pz = horiz ? z : z + k * 16;
    if (st.fence === 'stone') {
      if (k === 0) { if (horiz) m.box(x, WALL_H, z + 1, len, 2, 14, ramp[2], PAT.FLAT); else m.box(x + 1, WALL_H, z, 14, 2, len, ramp[2], PAT.FLAT); }
      if (horiz) m.box(px + 4, WALL_H + 2, pz + 1, 8, 4, 14, ramp[2], PAT.BRICK); else m.box(px + 1, WALL_H + 2, pz + 4, 14, 4, 8, ramp[2], PAT.BRICK);
    } else if (st.fence === 'wood') {
      if (horiz) m.prz(px, WALL_H, pz + 2, 8, 4, 12, ramp[2], PAT.PLANK); else m.prx(px + 2, WALL_H, pz, 12, 4, 8, ramp[2], PAT.PLANK);
      if (horiz) m.prz(px + 8, WALL_H, pz + 2, 8, 3, 12, ramp[1], PAT.PLANK); else m.prx(px + 2, WALL_H, pz + 8, 12, 3, 8, ramp[1], PAT.PLANK);
    } else {
      if (k === 0) { if (horiz) m.box(x, WALL_H, z + 1, len, 1.5, 14, PAL.ink[2], PAT.FLAT); else m.box(x + 1, WALL_H, z, 14, 1.5, len, PAL.ink[2], PAT.FLAT); }
      if (k % 3 === 0) { if (horiz) m.box(px, 0, pz, 3, WALL_H + 3, 16, PAL.ink[2], PAT.FLAT); else m.box(px, 0, pz, 16, WALL_H + 3, 3, PAL.ink[2], PAT.FLAT); }
    }
  }
}

function perimeterWalls(m, W) {
  const used = new Uint8Array(WORLD_W * WORLD_H);
  const isW = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H && W.struct[y * WORLD_W + x] === ST.WALL && !used[y * WORLD_W + x];
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    if (!isW(x, y) || !isW(x + 1, y)) continue;
    let n = 0;
    const s0 = W.wallStyle[y * WORLD_W + x];
    while (isW(x + n, y) && W.wallStyle[y * WORLD_W + x + n] === s0) { used[y * WORLD_W + x + n] = 1; n++; }
    wallRun(m, W, x, y, n, true);
  }
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < WORLD_H; y++) {
    if (!isW(x, y)) continue;
    let n = 0;
    const s0 = W.wallStyle[y * WORLD_W + x];
    while (isW(x, y + n) && W.wallStyle[(y + n) * WORLD_W + x] === s0) { used[(y + n) * WORLD_W + x] = 1; n++; }
    wallRun(m, W, x, y, n, false);
  }
}

function towers(m, W) {
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = y * WORLD_W + x;
    if (W.struct[i] !== ST.TOWER) continue;
    const st = styleAt(W, i);
    const ramp = PAL[st.wall] || PAL.ink, roofR = PAL[st.roofRamp] || PAL.ink;
    const wood = st.fence === 'metal' ? PAL.ink : PAL.wood;
    const px = x * 16, pz = y * 16;
    m.box(px, 0, pz, 16, TOWER_TOP - 2, 16, ramp[0], WALL_PAT(st.wall));
    m.box(px - 3, TOWER_TOP - 2, pz - 3, 22, 2, 22, wood[2], PAT.PLANK);
    for (const [ax, az, aw, ad] of [[-3, -3, 22, 1.5], [-3, 17.5, 22, 1.5], [-3, -1.5, 1.5, 19], [17.5, -1.5, 1.5, 19]]) m.box(px + ax, TOWER_TOP, pz + az, aw, 5, ad, wood[1], PAT.PLANK);
    for (const [ax, az] of [[-3, -3], [17, -3], [-3, 17], [17, 17]]) m.box(px + ax, TOWER_TOP, pz + az, 2, 14, 2, wood[1], PAT.FLAT);
    m.prx(px - 6, TOWER_TOP + 14, pz - 6, 28, 7, 28, roofR[1], ROOF_PAT[st.roof] || PAT.CORR);
  }
}

function gates(m, W) {
  const seen = new Uint8Array(WORLD_W * WORLD_H);
  for (const p of PLACES) {
    if (p.kind === 'ruin') continue;
    const st = STYLES[p.palette] || STYLES.ruin;
    const wood = st.fence === 'metal' ? PAL.ink : st.fence === 'stone' ? PAL.bone : PAL.wood;
    const banner = PAL[st.banner] || PAL.rust;
    const tall = p.kind === 'market' ? 20 : 28;
    for (let y = p.at[1]; y < p.at[1] + p.h; y++) for (let x = p.at[0]; x < p.at[0] + p.w; x++) {
      const i = y * WORLD_W + x;
      if (W.struct[i] !== ST.GATE || seen[i]) continue;
      let nx = 0, ny = 0;
      while (x + nx < WORLD_W && W.struct[i + nx] === ST.GATE) nx++;
      while (y + ny < WORLD_H && W.struct[i + ny * WORLD_W] === ST.GATE) ny++;
      const horiz = nx >= ny;
      const n = horiz ? nx : ny;
      for (let k = 0; k < n; k++) seen[horiz ? i + k : i + k * WORLD_W] = 1;
      const px = x * 16, pz = y * 16, len = n * 16;
      const rail = W.floor[i] === 7;
      if (horiz) {
        m.box(px - 1, 0, pz + 1, 4, tall, 14, wood[1], PAT.PLANK); m.box(px + len - 3, 0, pz + 1, 4, tall, 14, wood[1], PAT.PLANK);
        m.box(px - 1, tall - 6, pz + 3, len + 2, 5, 10, wood[2], PAT.PLANK);
        if (!rail) { m.box(px + len * 0.15, tall - 7, pz + 2, len * 0.7, 7, 1, banner[1], PAT.FLAT); m.box(px + len * 0.15, tall - 7, pz + 13, len * 0.7, 7, 1, banner[1], PAT.FLAT); }
      } else {
        m.box(px + 1, 0, pz - 1, 14, tall, 4, wood[1], PAT.PLANK); m.box(px + 1, 0, pz + len - 3, 14, tall, 4, wood[1], PAT.PLANK);
        m.box(px + 3, tall - 6, pz - 1, 10, 5, len + 2, wood[2], PAT.PLANK);
        if (!rail) { m.box(px + 2, tall - 7, pz + len * 0.15, 1, 7, len * 0.7, banner[1], PAT.FLAT); m.box(px + 13, tall - 7, pz + len * 0.15, 1, 7, len * 0.7, banner[1], PAT.FLAT); }
      }
      if (!rail && !(p.kind === 'market' && !(horiz && y > p.at[1]))) m.labels.push({ x: px + (horiz ? len / 2 : 8), y: tall + 8, z: pz + (horiz ? 8 : len / 2), text: p.kind === 'market' ? 'CROSSROADS' : p.name.toUpperCase(), kind: 'place', place: p.id });
    }
  }
}

function fences(m, W) {
  const F = (x, y) => { if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false; const s = W.struct[y * WORLD_W + x]; return s === ST.FENCE || s === ST.GATE || s === ST.WALL; };
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = y * WORLD_W + x;
    if (W.struct[i] !== ST.FENCE) continue;
    const st = styleAt(W, i);
    const z = W.zone[i] ? W.places[W.zone[i] - 1] : null;
    let horiz = F(x - 1, y) || F(x + 1, y);
    if (!horiz && !(F(x, y - 1) || F(x, y + 1)) && z) horiz = y === z.at[1] || y === z.at[1] + z.h - 1;
    const px = x * 16, pz = y * 16;
    if (st.fence === 'stone') { if (horiz) { m.box(px, 0, pz + 4, 16, 7, 8, PAL.bone[0], PAT.BRICK); m.box(px, 7, pz + 3, 16, 1.5, 10, PAL.bone[1], PAT.FLAT); } else { m.box(px + 4, 0, pz, 8, 7, 16, PAL.bone[0], PAT.BRICK); m.box(px + 3, 7, pz, 10, 1.5, 16, PAL.bone[1], PAT.FLAT); } continue; }
    const metal = st.fence === 'metal';
    const post = metal ? PAL.ink[3] : PAL.wood[2], rail = metal ? PAL.ink[2] : PAL.wood[1];
    m.box(px + 6.8, 0, pz + 6.8, 2.4, metal ? 13 : 11, 2.4, post, PAT.FLAT);
    if (metal) { if (horiz) { m.box(px, 1, pz + 7.7, 16, 11, 0.6, PAL.ink[3], PAT.FLAT, 0, 0.42); m.box(px, 12, pz + 7.4, 16, 1, 1.2, rail, PAT.FLAT); } else { m.box(px + 7.7, 1, pz, 0.6, 11, 16, PAL.ink[3], PAT.FLAT, 0, 0.42); m.box(px + 7.4, 12, pz, 1.2, 1, 16, rail, PAT.FLAT); } }
    else if (horiz) { m.box(px, 4, pz + 7.4, 16, 1.6, 1.2, rail, PAT.FLAT); m.box(px, 8, pz + 7.4, 16, 1.6, 1.2, rail, PAT.FLAT); }
    else { m.box(px + 7.4, 4, pz, 1.2, 1.6, 16, rail, PAT.FLAT); m.box(px + 7.4, 8, pz, 1.2, 1.6, 16, rail, PAT.FLAT); }
  }
}

function cliffs(m, W) {
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = y * WORLD_W + x;
    if (W.ground[i] !== TER.CLIFF || W.zone[i] || W.road[i] || W.struct[i]) continue;
    const hh = hash2(x, y, 77);
    const h = 13 + Math.floor(hh * 4) * 4;
    m.box(x * 16, 0, y * 16, 16, h, 16, PAL.ink[2], PAT.ROCK);
    if (hh > 0.55) m.box(x * 16 + 3, h, y * 16 + 3, 10, 4, 10, PAL.ink[3], PAT.ROCK);
  }
}

// ---------------- props ----------------
const LIGHTS = { lamp: [26, 120, [1.0, 0.74, 0.42], 0], fire: [7, 130, [1.0, 0.52, 0.2], 1], stall: [15, 60, [0.9, 0.6, 0.35], 0], jobboard: [14, 50, [0.9, 0.7, 0.45], 0] };

function prop(m, W, pr) {
  const K = PAL;
  const x = pr.x * 16, z = pr.y * 16;
  const B = (dx, dy, dz, w, h, d, c, pat = PAT.FLAT, em = 0, al = 1) => m.box(x + dx, dy, z + dz, w, h, d, c, pat, em, al);
  const C = (dx, dy, dz, w, h, d, c, pat = PAT.FLAT, em = 0, al = 1) => m.cyl(x + dx, dy, z + dz, w, h, d, c, pat, em, al);
  const legs = (x0, z0, x1, z1, h, c, t = 1.5) => { for (const [ax, az] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B(ax, 0, az, t, h, t, c); };
  const L = LIGHTS[pr.type];
  if (L) m.lights.push({ x: x + 8, y: L[0], z: z + 8, r: L[1], c: L[2], flicker: L[3] });
  const place = W.layouts[pr.place] ? W.layouts[pr.place].place : null;
  const st = STYLES[place ? place.palette : 'ruin'] || STYLES.ruin;
  switch (pr.type) {
    case 'lamp': C(7, 0, 7, 2, 24, 2, K.ink[2]); B(5.5, 0, 5.5, 5, 1.5, 5, K.ink[1]); B(5, 24, 5, 6, 5, 6, K.gold[2], PAT.FLAT, -1); B(4.5, 29, 4.5, 7, 1.5, 7, K.ink[1]); break;
    case 'stall': {
      const v = pr.variant || 0;
      const col = [K.rust[2], K.teal[2], K.gold[1], K.amber[2], K.sea[2], K.olive[2], K.heat[1], K.green[2]][v % 8];
      legs(0.5, 2, 14, 12.5, 16, K.wood[1]);
      B(1, 0, 8, 14, 8, 5.5, K.wood[2], PAT.PLANK); B(0.5, 8, 7.5, 15, 1, 6.5, K.wood[3]);
      m.prx(x - 1.5, 16, z + 0.5, 19, 4.5, 15, col, PAT.STRIPE);
      B(2.5, 9, 9, 3, 2, 3, K.olive[2]); B(6.5, 9, 9, 3, 2.5, 3, K.sand[3]); B(10.5, 9, 9, 2.5, 3.5, 2.5, K.rust[2]);
      break;
    }
    case 'well': C(2, 0, 2, 12, 7, 12, K.bone[0], PAT.BRICK); C(4, 6.4, 4, 8, 0.8, 8, K.sea[1]); B(2.5, 0, 7, 1.8, 15, 1.8, K.wood[1]); B(11.7, 0, 7, 1.8, 15, 1.8, K.wood[1]); m.prx(x + 0.5, 15, z + 3, 15, 4, 10, K.rust[1], PAT.SHINGLE); B(7, 9, 7.4, 2, 3, 2, K.ink[2]); break;
    case 'bench': B(1, 4, 5, 14, 1.4, 5, K.wood[2], PAT.PLANK); B(1, 5.4, 5, 14, 4, 1, K.wood[1], PAT.PLANK); legs(1.5, 5.5, 13, 8.5, 4, K.wood[0]); break;
    case 'banner': {
      const c = K[st.banner] || K.rust;
      const box = place ? place.at : [pr.x, pr.y];
      if (place && pr.y === box[1]) { B(3, 6, -0.9, 10, 13, 0.8, c[2]); B(6, 11, -1.4, 4, 4, 0.5, c[3]); }
      else if (place && pr.x === box[0]) { B(-0.9, 6, 3, 0.8, 13, 10, c[2]); B(-1.4, 11, 6, 0.5, 4, 4, c[3]); }
      else if (place && pr.x === box[0] + place.w - 1) { B(16.1, 6, 3, 0.8, 13, 10, c[2]); B(16.9, 11, 6, 0.5, 4, 4, c[3]); }
      else { B(3, 6, 16.1, 10, 13, 0.8, c[2]); B(6, 11, 16.9, 4, 4, 0.5, c[3]); }
      break;
    }
    case 'crates': B(1, 0, 5, 9, 9, 9, K.wood[2], PAT.PLANK); B(8.5, 0, 7.5, 7, 7, 7, K.wood[1], PAT.PLANK); B(3, 9, 6.5, 7, 7, 7, K.wood[2], PAT.PLANK); break;
    case 'barrel': C(3, 0, 3, 10, 13, 10, K.rust[1], PAT.CORR); C(2.6, 3.5, 2.6, 10.8, 1, 10.8, K.ink[1]); C(2.6, 9.5, 2.6, 10.8, 1, 10.8, K.ink[1]); C(3.5, 12.8, 3.5, 9, 0.6, 9, K.rust[3]); break;
    case 'fire': for (let k = 0; k < 6; k++) { const a = k * 1.047; B(7 + Math.cos(a) * 5.5, 0, 7 + Math.sin(a) * 5.5, 3, 2.2, 3, K.bone[0], PAT.ROCK); } B(3.5, 1, 7, 9, 1.8, 2, K.wood[0]); B(7, 1.2, 3.5, 2, 1.8, 9, K.wood[0]); B(5.5, 2, 5.5, 5, 4, 5, K.heat[2], PAT.FLAT, 1); B(6.5, 5.5, 6.5, 3, 3.5, 3, K.heat[3], PAT.FLAT, 1); B(7.2, 8.5, 7.2, 1.6, 2.5, 1.6, K.gold[3], PAT.FLAT, 1); break;
    case 'watertower':
      for (const [ax, az] of [[6, 6], [39, 6], [6, 39], [39, 39]]) B(ax, 0, az, 3, 34, 3, K.ink[2]);
      for (const hy of [10, 22]) { B(6, hy, 6.8, 36, 1.4, 1.4, K.ink[1]); B(6, hy, 39.8, 36, 1.4, 1.4, K.ink[1]); B(6.8, hy, 6, 1.4, 1.4, 36, K.ink[1]); B(39.8, hy, 6, 1.4, 1.4, 36, K.ink[1]); }
      B(3, 34, 3, 42, 2, 42, K.ink[2]); C(6, 36, 6, 36, 24, 36, K.rust[1], PAT.CORR); C(5.4, 44, 5.4, 37.2, 1.4, 37.2, K.rust[0]); C(4, 60, 4, 40, 2, 40, K.rust[2]); C(14, 62, 14, 20, 3, 20, K.rust[3]);
      B(23, 0, 44, 2, 36, 1, K.ink[1]);
      break;
    case 'boxcar':
      B(2, 5, 2, 28, 20, 60, K.rust[1], PAT.CORR); B(1, 25, 1, 30, 2, 62, K.rust[3]); B(1.2, 7, 22, 0.9, 16, 20, K.rust[0]); B(29.9, 7, 22, 0.9, 16, 20, K.rust[0]);
      for (const az of [7, 47]) { B(3, 0, az, 4, 6, 9, K.ink[0]); B(25, 0, az, 4, 6, 9, K.ink[0]); }
      B(4, 3, 4, 24, 2.2, 56, K.ink[1]);
      break;
    case 'scrap': B(1, 0, 6, 14, 5, 8, K.ink[2], PAT.CORR); B(3, 4, 5, 6, 4, 5, K.rust[1], PAT.CORR); B(8, 3, 3, 5, 6, 6, K.ink[3]); B(4, 7, 7, 2, 4, 2, K.rust[2]); B(11, 0, 11, 4, 2, 4, K.rust[0]); break;
    case 'compost': B(1, 0, 3, 14, 8, 11, K.wood[1], PAT.PLANK); B(2.5, 7.4, 4.5, 11, 1.2, 8, K.wood[0], PAT.SOIL); B(4, 8.4, 6, 2.5, 1, 2.5, K.olive[2]); B(9, 8.4, 8, 2, 1, 2, K.olive[1]); break;
    case 'dummy': C(7, 0, 7, 2, 12, 2, K.wood[1]); B(4, 9, 6, 8, 7, 4, K.sand[2]); B(5, 16, 5, 6, 6, 6, K.sand[3]); B(1, 13, 7, 14, 2, 2, K.wood[1]); B(6.5, 11, 5.5, 3, 3, 0.6, K.heat[2]); break;
    case 'sandbags': for (let k = 0; k < 3; k++) B(k * 5.3, 0, 5, 5, 4, 6.5, k & 1 ? K.sand[2] : K.sand[1], PAT.GRAIN); B(2.6, 4, 5.3, 5, 3.6, 6, K.sand[2], PAT.GRAIN); B(8, 4, 5.3, 5, 3.6, 6, K.sand[1], PAT.GRAIN); break;
    case 'rubble': B(1, 0, 5, 14, 4, 8, K.ink[2], PAT.ROCK); B(3, 3, 4, 5, 4, 5, K.bone[0], PAT.ROCK); B(9, 2, 7, 4, 4, 4, K.ink[3], PAT.ROCK); B(12, 0, 5, 0.8, 9, 0.8, K.rust[1]); break;
    case 'wreck': B(0, 2, 3, 16, 6, 10, K.rust[1], PAT.CORR); B(3, 8, 4, 9, 5, 8, K.rust[0]); B(3.5, 9, 3.7, 8, 3, 0.5, K.sea[0]); B(3.5, 9, 11.8, 8, 3, 0.5, K.sea[0]); for (const [ax, az] of [[1, 2], [11, 2], [1, 11.5], [11, 11.5]]) B(ax, 0, az, 4, 4, 2.5, K.ink[0]); break;
    case 'tires': C(2, 0, 4, 10, 4, 10, K.ink[1]); C(4.5, 3.6, 6.5, 5, 0.6, 5, K.ink[0]); C(3, 4, 3, 10, 4, 10, K.ink[1]); C(5.5, 7.6, 5.5, 5, 0.6, 5, K.ink[0]); break;
    case 'jobboard': B(1, 0, 7, 2, 18, 2, K.wood[1]); B(13, 0, 7, 2, 18, 2, K.wood[1]); B(0, 7, 7.3, 16, 11, 1.4, K.wood[2], PAT.PLANK); B(2, 10, 8.7, 4, 5, 0.3, K.bone[3]); B(7, 12, 8.7, 4, 4, 0.3, K.bone[2]); B(11, 9, 8.7, 3, 5, 0.3, K.sand[3]); B(7, 8, 8.7, 3, 3, 0.3, K.bone[2]); m.prx(x - 1, 18, z + 5, 18, 3, 6, K.wood[1], PAT.PLANK); break;
    case 'bar': B(0, 0, 3, 16, 9, 7, K.wood[1], PAT.PLANK); B(-0.5, 9, 2.5, 17, 1.2, 8, K.wood[3]); C(3, 10.2, 5, 2, 4, 2, K.amber[2]); C(9, 10.2, 6, 2, 4.5, 2, K.green[2]); C(12, 10.2, 5, 1.6, 3, 1.6, K.bone[2]); break;
    case 'table': B(2, 6, 3, 12, 1.2, 9, K.wood[2], PAT.PLANK); legs(2.5, 3.5, 12, 10, 6, K.wood[0]); C(6, 7.2, 6, 2.5, 1.5, 2.5, K.bone[2]); break;
    case 'shelf': B(1, 0, 9, 14, 18, 5, K.wood[1], PAT.PLANK); for (const hy of [3, 9, 14]) { B(2, hy, 8.2, 3, 3, 3, K.sand[2]); B(6.5, hy, 8.2, 3.5, 3.5, 3, K.rust[2]); B(11, hy, 8.2, 2.5, 2.5, 3, K.teal[2]); } break;
    case 'bunk': legs(1, 2, 13.5, 12.5, 15, K.wood[1]); B(1, 4, 2, 14, 2, 12, K.bone[1]); B(1, 11, 2, 14, 2, 12, K.bone[1]); B(1.5, 6, 2.5, 4, 1.2, 11, K.bone[3]); B(1.5, 13, 2.5, 4, 1.2, 11, K.bone[3]); break;
    case 'rack': B(0, 0, 10, 16, 16, 3, K.wood[1], PAT.PLANK); for (let k = 0; k < 4; k++) { B(1.5 + k * 3.8, 3, 8.8, 1.6, 11, 1.4, K.ink[1]); B(1.5 + k * 3.8, 3, 8.4, 1.6, 4, 1, K.wood[2]); } break;
    case 'cot': B(1, 3, 3, 14, 2, 9, K.teal[2]); B(1, 5, 3.5, 4, 1.2, 8, K.bone[3]); legs(1.5, 3.5, 13, 10.5, 3, K.ink[1]); break;
    case 'pew': B(0, 4, 5, 16, 1.5, 5, K.wood[1], PAT.PLANK); B(0, 5.5, 9, 16, 5, 1.2, K.wood[0], PAT.PLANK); B(0.5, 0, 5.5, 1.5, 4, 4.5, K.wood[0]); B(14, 0, 5.5, 1.5, 4, 4.5, K.wood[0]); break;
    case 'altar': B(1, 0, 4, 14, 9, 9, K.bone[1], PAT.BRICK); B(0.5, 9, 3.5, 15, 1, 10, K.heat[1]); C(7, 10, 7.5, 2, 5, 2, K.gold[2], PAT.FLAT, 0.4); B(7.5, 15, 8, 1, 1.6, 1, K.gold[3], PAT.FLAT, 1); break;
    case 'anvil': B(4, 0, 5, 8, 4, 6, K.ink[1]); B(5.5, 4, 6, 5, 3, 4, K.ink[1]); B(2, 7, 5, 12, 3, 6, K.ink[2]); break;
    case 'desk': B(1, 6.5, 3, 14, 1.3, 8, K.wood[2], PAT.PLANK); legs(1.5, 3.5, 13, 9.5, 6.5, K.wood[0]); B(4, 7.8, 5, 5, 0.4, 4, K.bone[3]); B(11, 7.8, 4, 2, 3, 2, K.ink[2]); break;
    case 'safe': B(2, 0, 2, 12, 13, 12, K.ink[2]); B(3.5, 2, 13.6, 9, 9, 0.6, K.ink[1]); C(6.5, 5, 14, 3, 3, 0.8, K.gold[2]); break;
    case 'bed': B(1, 0, 1, 14, 4, 14, K.wood[1], PAT.PLANK); B(1.5, 4, 1.5, 13, 2, 13, K.rust[2]); B(1.5, 6, 2, 13, 1.2, 4, K.bone[2]); break;
    case 'vault': B(0, 0, 1, 16, 18, 14, K.ink[2], PAT.CONCRETE); B(2, 2, 14.6, 12, 14, 0.8, K.ink[1]); C(5, 6, 15.2, 6, 6, 0.9, K.ink[3]); B(7.4, 8.4, 16, 1.2, 1.2, 0.5, K.gold[2], PAT.FLAT, 0.5); B(12.5, 7, 15.3, 1.5, 4, 0.8, K.gold[1]); break;
    case 'stash': B(1, 0, 2, 14, 11, 12, K.ink[2]); B(2.5, 2, 13.7, 11, 7, 0.6, K.amber[1]); B(6.5, 4.5, 14.2, 3, 3, 0.5, K.gold[2], PAT.FLAT, 0.4); B(0.5, 10.5, 1.5, 15, 1.2, 13, K.ink[3]); break;
    case 'dryline': B(1, 0, 7, 1.8, 17, 1.8, K.wood[1]); B(13.2, 0, 7, 1.8, 17, 1.8, K.wood[1]); B(1, 15.5, 7.6, 14, 0.6, 0.6, K.bone[1]); for (let k = 0; k < 4; k++) B(3 + k * 3, 10, 7.2, 2, 5.5, 1.4, K.olive[2]); break;
    case 'cureshelf': B(1, 0, 9, 14, 18, 5, K.wood[1], PAT.PLANK); for (const hy of [3, 9, 14]) for (let k = 0; k < 3; k++) { C(2.5 + k * 4, hy, 7.6, 3, 3.5, 3, K.sea[2]); C(2.5 + k * 4, hy + 3.5, 7.6, 3, 0.7, 3, K.bone[2]); } break;
    case 'packtable': B(1, 6, 3, 14, 1.3, 8, K.wood[2], PAT.PLANK); legs(1.5, 3.5, 13, 9.5, 6, K.wood[0]); B(3, 7.3, 5, 3, 1.6, 3, K.olive[2]); B(8, 7.3, 4.5, 4, 0.8, 3, K.bone[2]); B(8.5, 8.1, 5, 3, 0.8, 2, K.bone[3]); break;
    case 'lootcrate': B(1, 0, 3, 14, 9, 11, K.wood[2], PAT.PLANK); B(0.5, 9, 2.5, 15, 1.6, 12, K.wood[3], PAT.PLANK); B(6.5, 6, 13.9, 3, 3.4, 0.7, K.gold[3], PAT.FLAT, 0.6); B(0.8, 0, 2.8, 1.2, 9, 11.4, K.ink[1]); B(14, 0, 2.8, 1.2, 9, 11.4, K.ink[1]); break;
    case 'boulder': B(2, 0, 3, 12, 7, 10, K.ink[2], PAT.ROCK); B(4, 6, 4.5, 8, 4, 7, K.ink[3], PAT.ROCK); B(5, 9.5, 6, 4, 1.5, 4, K.bone[0], PAT.ROCK); break;
    case 'deadtree': C(6.5, 0, 6.5, 3, 20, 3, K.wood[1], PAT.PLANK); B(2, 13, 7.2, 5, 1.5, 1.5, K.wood[1]); B(1.5, 13, 7.2, 1.3, 5, 1.3, K.wood[1]); B(9, 16, 7.2, 5, 1.5, 1.5, K.wood[1]); B(13, 16, 7.2, 1.3, 4, 1.3, K.wood[1]); B(7.2, 10, 2.5, 1.5, 1.5, 5, K.wood[0]); B(7.3, 20, 7.3, 1.6, 5, 1.6, K.wood[1]); break;
    case 'brokenwall': B(0, 0, 5, 16, 11, 5, K.bone[0], PAT.BRICK); B(0, 11, 5, 6, 5, 5, K.bone[0], PAT.BRICK); B(10, 11, 5, 4, 2.5, 5, K.bone[0], PAT.BRICK); B(11, 0, 10, 4, 2, 3, K.ink[2], PAT.ROCK); break;
    case 'bones': B(1, 0, 6, 11, 1.4, 1.4, K.bone[2]); for (let k = 0; k < 4; k++) B(3 + k * 2.4, 0, 3.5, 0.9, 3.5, 0.9, K.bone[3]); B(11, 0, 5, 3.5, 3, 3.5, K.bone[3]); break;
    case 'haybale': B(1, 0, 3, 14, 10, 10, K.sand[2], PAT.SOIL); B(0.7, 3, 2.7, 14.6, 1, 10.6, K.sand[1]); B(0.7, 7, 2.7, 14.6, 1, 10.6, K.sand[1]); break;
    case 'fencepost': B(7, 0, 7, 2, 12, 2, K.wood[1]); B(3, 6, 7.4, 10, 1.3, 1.2, K.wood[0]); break;
    case 'reeds': for (let k = 0; k < 7; k++) { const ax = 1.5 + (k * 5.3) % 13, az = 2 + (k * 7.1) % 12, hh = 8 + (k * 3) % 6; B(ax, 0, az, 0.9, hh, 0.9, K.olive[2]); B(ax - 0.2, hh, az - 0.2, 1.3, 2.2, 1.3, K.wood[1]); } break;
    default: B(3, 0, 3, 10, 8, 10, K.wood[1], PAT.PLANK);
  }
}
