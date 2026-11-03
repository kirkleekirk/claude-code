// Procedural buildings with real interiors: walls with door/window openings, rooms,
// stairs, furniture, roofs. Produces geometry (into a GeoBuilder) plus runtime data:
// colliders, doors, windows (for barricading), loot spots, searchable containers,
// a small nav graph (for zombies/bots) and room volumes (for "indoors" checks).
import { TEX } from './textures.js';
import { RNG } from '../core/rng.js';

export const COL = { SOLID: 1, WALK: 2, BULLET: 4, DOOR: 8, WINDOW: 16, BUILD: 32, THIN: 64 };
const T = 0.24; // wall thickness

export class NullBuilder {
  push() { return this; } pop() { return this; } translate() { return this; } rotateY() { return this; } rotateX() { return this; } rotateZ() { return this; }
  scale() { return this; } setColor() { return this; } setLayer() { return this; } setEmit() { return this; } setSway() { return this; }
  box() {} quad() {} tri() {} beam() {} cylinder() {} blob() {} addGeometry() {} vert() {}
}
export const NULL_GB = new NullBuilder();

const INTERIOR_WALLS = [0xe9e1d0, 0xd9e2e6, 0xe8d6cc, 0xd6e3d0, 0xefe6c8, 0xe0d4e4, 0xc9d6c2];
const FLOORS_WOOD = [0xb08055, 0x9a6b45, 0xc4955f, 0x8a5c3c];

// ------------------------------------------------------------------------------------
// Building context: local → world helpers, geometry + collider emission
// ------------------------------------------------------------------------------------
class BCtx {
  constructor(b, gb, signs, detail) {
    this.b = b; this.gb = gb; this.signs = signs; this.detail = detail;
    this.c = Math.cos(b.rot); this.s = Math.sin(b.rot);
    this.rt = { colliders: [], doors: [], windows: [], loot: [], containers: [], benches: [], nav: { nodes: [], edges: [] }, rooms: [], lights: [], entrances: [] };
    this.rng = new RNG(b.seed);
  }
  toW(lx, lz) { return [this.b.x + lx * this.c + lz * this.s, this.b.z - lx * this.s + lz * this.c]; }
  // collider for a box given in building-local coords with an extra local yaw
  col(cx, cy, cz, sx, sy, sz, yaw = 0, flags = COL.SOLID | COL.BULLET | COL.WALK, ref = null) {
    const [wx, wz] = this.toW(cx, cz);
    this.rt.colliders.push({ kind: 0, x: wx, y: this.b.y + cy, z: wz, hx: sx / 2, hy: sy / 2, hz: sz / 2, rot: this.b.rot + yaw, flags, ref });
  }
  ramp(cx, cy, cz, sx, sy, sz, yaw = 0) {
    // rises along local +z of the ramp frame
    const [wx, wz] = this.toW(cx, cz);
    this.rt.colliders.push({ kind: 1, x: wx, y: this.b.y + cy, z: wz, hx: sx / 2, hy: sy / 2, hz: sz / 2, rot: this.b.rot + yaw, flags: COL.SOLID | COL.WALK });
  }
  // geometry box in building space with optional yaw around its own center
  box(cx, cy, cz, sx, sy, sz, color, layer = TEX.WHITE, uv = 0.5, opts = {}) {
    const gb = this.gb;
    if (opts.interior && this.detail > 0) {
      if (opts.col) this.col(cx, cy, cz, sx, sy, sz, opts.yaw || 0, opts.flags);
      return;
    }
    gb.setColor(color).setLayer(layer).setEmit(opts.emit || 0);
    if (opts.yaw) {
      gb.push(); gb.translate(cx, cy, cz); gb.rotateY(opts.yaw); gb.box(0, 0, 0, sx, sy, sz, uv, opts.skip || 0); gb.pop();
    } else gb.box(cx, cy, cz, sx, sy, sz, uv, opts.skip || 0);
    gb.setEmit(0);
    if (opts.col) this.col(cx, cy, cz, sx, sy, sz, opts.yaw || 0, opts.flags);
  }
  navNode(lx, ly, lz, type = 'room', extra = {}) {
    const [x, z] = this.toW(lx, lz);
    this.rt.nav.nodes.push({ x, y: this.b.y + ly, z, type, ...extra });
    return this.rt.nav.nodes.length - 1;
  }
  link(a, b, cost = 1, kind = 'walk') { if (a >= 0 && b >= 0) this.rt.nav.edges.push([a, b, kind]); }
  loot(lx, ly, lz, tier = 1, cat = null) {
    const [x, z] = this.toW(lx, lz);
    this.rt.loot.push({ x, y: this.b.y + ly, z, tier, cat });
  }
  container(lx, ly, lz, kind, yaw = 0) {
    const [x, z] = this.toW(lx, lz);
    this.rt.containers.push({ x, y: this.b.y + ly, z, kind, rot: this.b.rot + yaw, searched: false, building: this.b.id });
  }
  sign(text, lx, ly, lz, w, h, yaw = 0, colors) {
    if (!this.signs || this.detail > 1) return;
    this.signs.push({ text, b: this.b, lx, ly, lz, w, h, yaw, colors });
  }
}

// ------------------------------------------------------------------------------------
// Walls
// ------------------------------------------------------------------------------------
// Wall from A to B (building-local, y from y0 for height h). Openings: [{t, w, y0, y1, kind}]
function wall(ctx, ax, az, bx, bz, y0, h, openings, o) {
  const gb = ctx.gb;
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  const th = Math.atan2(-dz, dx);
  const ux = dx / L, uz = dz / L;
  const nxo = -uz, nzo = ux; // outward normal in building space? (rotated +z of wall frame)
  // wall frame +z in building space = (sin th, cos th)
  const fzx = Math.sin(th), fzz = Math.cos(th);
  void nxo; void nzo;
  const ops = [...(openings || [])].sort((a, b) => a.t - b.t);
  const spans = [];
  let cur = 0;
  for (const op of ops) {
    const s0 = Math.max(0, op.t - op.w / 2), s1 = Math.min(L, op.t + op.w / 2);
    if (s0 > cur + 0.01) spans.push({ s0: cur, s1: s0, solid: true });
    spans.push({ s0, s1, solid: false, op });
    cur = s1;
  }
  if (cur < L - 0.01) spans.push({ s0: cur, s1: L, solid: true });
  const thick = o.thick ?? T;
  const exterior = o.exterior;
  gb.push();
  gb.translate(ax, 0, az);
  gb.rotateY(th);
  const piece = (s0, s1, py0, py1) => {
    if (s1 - s0 < 0.01 || py1 - py0 < 0.01) return;
    const sm = (s0 + s1) / 2, ym = (py0 + py1) / 2, sl = s1 - s0, hl = py1 - py0;
    if (exterior && ctx.detail === 0) {
      gb.setColor(o.color).setLayer(o.layer);
      gb.box(sm, ym, thick / 4, sl, hl, thick / 2, o.uv ?? 0.5, 32);
      gb.setColor(o.inColor ?? 0xe9e1d0).setLayer(o.inLayer ?? TEX.PAINTED);
      gb.box(sm, ym, -thick / 4, sl, hl, thick / 2, 0.5, 16 | 4 | 8);
    } else if (exterior) {
      gb.setColor(o.color).setLayer(o.layer);
      gb.box(sm, ym, 0, sl, hl, thick, o.uv ?? 0.5, 32 | 8);
    } else if (ctx.detail === 0) {
      gb.setColor(o.inColor ?? o.color).setLayer(o.inLayer ?? o.layer);
      gb.box(sm, ym, 0, sl, hl, thick, 0.5, 8);
    }
    // collider (building space)
    const cx = ax + ux * sm, cz = az + uz * sm;
    if (!o.noCollide) ctx.col(cx, ym, cz, sl, hl, thick, th);
  };
  for (const sp of spans) {
    if (sp.solid) { piece(sp.s0, sp.s1, y0, y0 + h); continue; }
    const op = sp.op;
    const oy0 = y0 + op.y0, oy1 = Math.min(y0 + h, y0 + op.y1);
    piece(sp.s0, sp.s1, y0, oy0);
    piece(sp.s0, sp.s1, oy1, y0 + h);
    const sm = (sp.s0 + sp.s1) / 2;
    const cx = ax + ux * sm, cz = az + uz * sm;
    if (exterior && op.kind !== 'gap') {
      // trim around the opening (outside face)
      const tw = 0.12, tc = o.trim ?? 0xffffff;
      gb.setColor(tc).setLayer(TEX.PAINTED);
      const ow = sp.s1 - sp.s0;
      gb.box(sm, oy1 + tw / 2, thick / 2 + 0.03, ow + tw * 2, tw, 0.08, 1);
      if (op.y0 > 0.05) gb.box(sm, oy0 - tw / 2, thick / 2 + 0.05, ow + tw * 2.4, tw, 0.14, 1);
      gb.box(sp.s0 - tw / 2, (oy0 + oy1) / 2, thick / 2 + 0.03, tw, oy1 - oy0, 0.08, 1);
      gb.box(sp.s1 + tw / 2, (oy0 + oy1) / 2, thick / 2 + 0.03, tw, oy1 - oy0, 0.08, 1);
      if (op.kind === 'window') {
        if (ctx.detail > 0) {
          // shell LOD: dark glass quad instead of a hole
          gb.setColor(0x8a9aa8).setLayer(TEX.WINDOW);
          gb.box(sm, (oy0 + oy1) / 2, 0, ow, oy1 - oy0, 0.05, 1);
        } else {
          // mullions
          gb.setColor(tc).setLayer(TEX.PAINTED);
          gb.box(sm, (oy0 + oy1) / 2, thick / 2 - 0.02, 0.05, oy1 - oy0, 0.05, 1);
          gb.box(sm, oy0 + (oy1 - oy0) * 0.55, thick / 2 - 0.02, ow, 0.05, 0.05, 1);
        }
        if (o.shutter) {
          gb.setColor(o.shutter).setLayer(TEX.SHUTTER);
          gb.box(sp.s0 - 0.12 - ow * 0.27, (oy0 + oy1) / 2, thick / 2 + 0.05, ow * 0.5, oy1 - oy0 + 0.1, 0.05, 1.2);
          gb.box(sp.s1 + 0.12 + ow * 0.27, (oy0 + oy1) / 2, thick / 2 + 0.05, ow * 0.5, oy1 - oy0 + 0.1, 0.05, 1.2);
        }
      }
      if (op.kind === 'storefront' && ctx.detail === 0) {
        gb.setColor(0x2b2f33).setLayer(TEX.METAL);
        for (let k = 1; k < 3; k++) gb.box(sp.s0 + (ow * k) / 3, (oy0 + oy1) / 2, 0, 0.08, oy1 - oy0, 0.1, 1);
        gb.box(sm, oy0 + 0.04, 0, ow, 0.08, thick, 1);
      } else if (op.kind === 'storefront') {
        gb.setColor(0x7f97a6).setLayer(TEX.WINDOW);
        gb.box(sm, (oy0 + oy1) / 2, 0, ow, oy1 - oy0, 0.05, 1);
      }
    }
    // runtime records (world space)
    if (op.kind === 'door' || op.kind === 'window' || op.kind === 'storefront' || op.kind === 'bigdoor') {
      const [wx, wz] = ctx.toW(cx, cz);
      const rec = {
        x: wx, y: ctx.b.y + (oy0 + oy1) / 2, z: wz, w: sp.s1 - sp.s0, h: oy1 - oy0, rot: ctx.b.rot + th,
        floorY: ctx.b.y + y0, sill: op.y0, building: ctx.b.id, exterior: !!exterior, kind: op.kind, boarded: 0, hp: 0,
        // outward direction in world space
        nx: fzx * ctx.c + fzz * ctx.s, nz: -fzx * ctx.s + fzz * ctx.c,
      };
      if (op.kind === 'door' && !op.noDoor) {
        rec.hingeL = op.hinge ?? (ctx.rng.chance(0.5) ? 1 : -1);
        ctx.rt.doors.push(rec);
        rec.open = ctx.rng.chance(exterior ? 0.25 : 0.55);
      } else if (op.kind === 'window' || op.kind === 'storefront') {
        if (exterior && op.y1 - op.y0 > 0.9) ctx.rt.windows.push(rec);
      }
      if (exterior && (op.kind === 'door' || op.kind === 'bigdoor' || op.kind === 'window' || op.kind === 'storefront')) {
        // nav: outside + inside points
        const out = 1.0, inn = 0.9;
        const o1 = ctx.navNode(cx + fzx * out, y0, cz + fzz * out, 'out');
        const i1 = ctx.navNode(cx - fzx * inn, y0 + 0.02, cz - fzz * inn, 'in', { floor: o.floor ?? 0 });
        const kind = op.kind === 'window' ? 'vault' : 'walk';
        ctx.link(o1, i1, 1, kind);
        ctx.rt.entrances.push({ out: o1, inn: i1, kind, rec, floor: o.floor ?? 0, ground: (o.floor ?? 0) === 0 });
        rec.nav = { out: o1, inn: i1 };
      }
    }
  }
  gb.pop();
}

// Evenly distribute windows along a wall, avoiding reserved intervals (doors)
function layoutWindows(L, reserved, spacing, ww, margin = 1.0) {
  const out = [];
  const n = Math.max(0, Math.floor((L - margin * 2 + spacing - ww) / spacing));
  if (n <= 0) return out;
  const total = (n - 1) * spacing;
  const start = L / 2 - total / 2;
  for (let i = 0; i < n; i++) {
    const t = start + i * spacing;
    if (reserved.some((r) => Math.abs(r - t) < ww / 2 + 1.0)) continue;
    out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------------------------
// Roofs
// ------------------------------------------------------------------------------------
function gableRoof(ctx, w, d, y, pitch, color, layer, ridge = 'x', over = 0.45, gableColor, gableLayer) {
  const gb = ctx.gb;
  // ridge along x: slopes toward ±z
  const W = ridge === 'x' ? w : d, D = ridge === 'x' ? d : w;
  const rise = (D / 2) * pitch;
  gb.push();
  if (ridge === 'z') gb.rotateY(Math.PI / 2);
  const hw = W / 2 + over, hd = D / 2 + over;
  const yr = y + rise, ye = y - over * pitch;
  gb.setColor(color).setLayer(layer);
  const th = 0.18;
  // two slabs (top surfaces + undersides)
  const k = 0.42;
  const slopeLen = Math.hypot(hd, yr - ye);
  gb.quad([-hw, ye, hd], [hw, ye, hd], [hw, yr, 0], [-hw, yr, 0], [[0, 0], [W * k, 0], [W * k, slopeLen * k], [0, slopeLen * k]]);
  gb.quad([hw, ye, -hd], [-hw, ye, -hd], [-hw, yr, 0], [hw, yr, 0], [[0, 0], [W * k, 0], [W * k, slopeLen * k], [0, slopeLen * k]]);
  gb.setColor(0x3a3530).setLayer(TEX.PLANKS);
  gb.quad([-hw, yr - th, 0], [hw, yr - th, 0], [hw, ye - th, hd], [-hw, ye - th, hd]);
  gb.quad([hw, yr - th, 0], [-hw, yr - th, 0], [-hw, ye - th, -hd], [hw, ye - th, -hd]);
  // fascia
  gb.setColor(ctx.trim ?? 0xffffff).setLayer(TEX.PAINTED);
  gb.box(0, ye - th / 2, hd, W + over * 2, th + 0.06, 0.06, 1);
  gb.box(0, ye - th / 2, -hd, W + over * 2, th + 0.06, 0.06, 1);
  // ridge cap
  gb.setColor(color).setLayer(TEX.TAR);
  gb.box(0, yr + 0.03, 0, W + over * 2, 0.12, 0.3, 1);
  // gable triangles
  gb.setColor(gableColor).setLayer(gableLayer);
  for (const sx of [-1, 1]) {
    const x = (sx * W) / 2;
    if (sx > 0) gb.tri([x, y, D / 2], [x, y, -D / 2], [x, yr, 0], [[D / 2 * 0.5, 0], [-D / 2 * 0.5, 0], [0, rise * 0.5]]);
    else gb.tri([x, y, -D / 2], [x, y, D / 2], [x, yr, 0], [[-D / 2 * 0.5, 0], [D / 2 * 0.5, 0], [0, rise * 0.5]]);
    if (ctx.detail === 0) {
      gb.setColor(0xdcd4c4).setLayer(TEX.PLANKS);
      const xi = x - sx * 0.12;
      if (sx > 0) gb.tri([xi, y, -D / 2], [xi, y, D / 2], [xi, yr, 0]);
      else gb.tri([xi, y, D / 2], [xi, y, -D / 2], [xi, yr, 0]);
      gb.setColor(gableColor).setLayer(gableLayer);
    }
  }
  gb.pop();
  // colliders: two ramps (walkable roofs)
  if (ridge === 'x') {
    ctx.ramp(0, y + rise / 2, -D / 4, W, rise, D / 2, 0);
    ctx.ramp(0, y + rise / 2, D / 4, W, rise, D / 2, Math.PI);
  } else {
    ctx.ramp(-D / 4, y + rise / 2, 0, W, rise, D / 2, Math.PI / 2);
    ctx.ramp(D / 4, y + rise / 2, 0, W, rise, D / 2, -Math.PI / 2);
  }
  return rise;
}

function flatRoof(ctx, w, d, y, color, parapet = 0.8, trim = 0xd8d0c0, layer = TEX.TAR) {
  const gb = ctx.gb;
  ctx.box(0, y + 0.1, 0, w, 0.2, d, color, layer, 0.25, { col: true });
  if (parapet > 0) {
    gb.setColor(trim).setLayer(TEX.CONCRETE);
    for (const [cx, cz, sx, sz] of [[0, d / 2 - 0.15, w, 0.3], [0, -d / 2 + 0.15, w, 0.3], [w / 2 - 0.15, 0, 0.3, d], [-w / 2 + 0.15, 0, 0.3, d]]) {
      gb.box(cx, y + 0.2 + parapet / 2, cz, sx, parapet, sz, 0.5);
      ctx.col(cx, y + 0.2 + parapet / 2, cz, sx, parapet, sz);
    }
    gb.box(0, y + 0.2 + parapet + 0.05, d / 2 - 0.15, w + 0.2, 0.1, 0.45, 1);
  }
  // roof vents
  if (ctx.detail <= 1 && w > 10) {
    gb.setColor(0xa0a4a8).setLayer(TEX.METAL);
    gb.box(w * 0.2, y + 0.6, -d * 0.2, 1.2, 0.8, 1.2, 0.5);
  }
}

function gambrelRoof(ctx, w, d, y, color, gableColor) {
  // ridge along z (barn depth). profile: lower steep part then upper shallow part
  const gb = ctx.gb;
  const hw = w / 2 + 0.4, hd = d / 2 + 0.5;
  const p = [[-hw, y - 0.3], [-w * 0.33, y + w * 0.32], [0, y + w * 0.45], [w * 0.33, y + w * 0.32], [hw, y - 0.3]];
  gb.setColor(color).setLayer(TEX.METAL);
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1];
    const sl = Math.hypot(x1 - x0, y1 - y0);
    gb.quad([x0, y0, hd], [x1, y1, hd], [x1, y1, -hd], [x0, y0, -hd], [[0, 0], [sl * 0.35, 0], [sl * 0.35, d * 0.35], [0, d * 0.35]]);
    gb.setColor(0x4a3a2e).setLayer(TEX.PLANKS);
    gb.quad([x0, y0 - 0.12, -hd], [x1, y1 - 0.12, -hd], [x1, y1 - 0.12, hd], [x0, y0 - 0.12, hd]);
    gb.setColor(color).setLayer(TEX.METAL);
  }
  // gable ends (front/back) – polygon fan
  gb.setColor(gableColor).setLayer(TEX.BOARDS);
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2;
    const pts = [[-w / 2, y], [-w * 0.33, y + w * 0.32 - 0.25], [0, y + w * 0.45 - 0.3], [w * 0.33, y + w * 0.32 - 0.25], [w / 2, y]];
    for (let i = 1; i < 4; i++) {
      const a = pts[0], b2 = pts[i], c = pts[i + 1];
      if (sz > 0) gb.tri([a[0], a[1], z], [c[0], c[1], z], [b2[0], b2[1], z], [[a[0] * 0.5, a[1] * 0.5], [c[0] * 0.5, c[1] * 0.5], [b2[0] * 0.5, b2[1] * 0.5]]);
      else gb.tri([a[0], a[1], z], [b2[0], b2[1], z], [c[0], c[1], z], [[a[0] * 0.5, a[1] * 0.5], [b2[0] * 0.5, b2[1] * 0.5], [c[0] * 0.5, c[1] * 0.5]]);
    }
    // white trim along gambrel edge
    gb.setColor(0xf4f1ea).setLayer(TEX.PAINTED);
    for (let i = 0; i < 4; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1];
      gb.beam(x0, y0 + 0.05, z + sz * 0.45, x1, y1 + 0.05, z + sz * 0.45, 0.22);
    }
    gb.setColor(gableColor).setLayer(TEX.BOARDS);
  }
  // collider approximation: two ramps from eaves to ridge
  const rise = w * 0.45;
  ctx.ramp(-w / 4, y + rise / 2, 0, d, rise, w / 2, Math.PI / 2);
  ctx.ramp(w / 4, y + rise / 2, 0, d, rise, w / 2, -Math.PI / 2);
}

// ------------------------------------------------------------------------------------
// Furniture
// ------------------------------------------------------------------------------------
function furnish(ctx, room, kind, y) {
  const r = ctx.rng;
  const { x0, x1, z0, z1 } = room;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  const full = ctx.detail === 0;
  const B = (bx, by, bz, sx, sy, sz, c, l = TEX.WHITE, col = true) => { if (full) ctx.box(bx, y + by, bz, sx, sy, sz, c, l, 0.6); if (col) ctx.col(bx, y + by, bz, sx, sy, sz, 0, COL.SOLID | COL.BULLET | COL.WALK); };
  const wallSide = r.int(0, 3);
  const nearWall = (depth) => {
    // pick a position against one wall
    switch (wallSide) {
      case 0: return [cx + r.range(-w / 4, w / 4), z0 + depth / 2 + 0.05, 0];
      case 1: return [cx + r.range(-w / 4, w / 4), z1 - depth / 2 - 0.05, Math.PI];
      case 2: return [x0 + depth / 2 + 0.05, cz + r.range(-d / 4, d / 4), Math.PI / 2];
      default: return [x1 - depth / 2 - 0.05, cz + r.range(-d / 4, d / 4), -Math.PI / 2];
    }
  };
  const lootFloor = (tier = 1, cat = null, n = 1) => {
    for (let k = 0; k < n; k++) ctx.loot(r.range(x0 + 0.7, x1 - 0.7), y + 0.05, r.range(z0 + 0.7, z1 - 0.7), tier, cat);
  };
  if (w < 1.8 || d < 1.8) return;
  // weapon workbench against the back wall (z0), facing into the room
  const bench = (bx) => {
    if (ctx.benchDone) return;
    ctx.benchDone = true;
    const bz = z0 + 0.45;
    ctx.col(bx, y + 0.47, bz, 2.3, 0.94, 0.85, 0, COL.SOLID | COL.BULLET | COL.WALK);
    if (full) {
      ctx.box(bx, y + 0.43, bz, 2.1, 0.86, 0.72, 0x3d5a46, TEX.METAL, 0.6);                    // green tool cabinet
      ctx.box(bx, y + 0.9, bz, 2.3, 0.08, 0.85, 0x9a7048, TEX.PLANKS, 0.6);                     // butcher-block top
      ctx.box(bx, y + 0.72, bz + 0.37, 2.12, 0.07, 0.02, 0xf0a020, TEX.WHITE, 0.5, { emit: 0.35 }); // orange stripe
      ctx.box(bx, y + 1.62, z0 + 0.04, 2.2, 1.05, 0.04, 0xc8a070, TEX.PLANKS, 0.6);             // pegboard
      ctx.box(bx - 0.15, y + 1.78, z0 + 0.08, 1.2, 0.07, 0.04, 0x1c1d20, TEX.METAL, 0.6);       // rifle on the wall
      ctx.box(bx - 0.6, y + 1.72, z0 + 0.08, 0.3, 0.12, 0.04, 0x5a3220, TEX.PLANKS, 0.6);
      ctx.box(bx + 0.62, y + 1.45, z0 + 0.08, 0.06, 0.4, 0.04, 0x8c939b, TEX.METAL, 0.6);      // wrenches
      ctx.box(bx + 0.78, y + 1.45, z0 + 0.08, 0.06, 0.32, 0.04, 0x8c939b, TEX.METAL, 0.6);
      ctx.box(bx + 0.85, y + 1.02, bz + 0.15, 0.2, 0.16, 0.24, 0x5a6068, TEX.METAL, 0.6);      // vise
      ctx.box(bx - 0.3, y + 0.97, bz + 0.05, 0.75, 0.06, 0.12, 0x1c1d20, TEX.METAL, 0.6);      // gun on the bench
      ctx.box(bx, y + 2.25, z0 + 0.35, 0.5, 0.06, 0.2, 0xfff0c0, TEX.WHITE, 0.5, { emit: 1.2 }); // work lamp
    }
    const [x, z] = ctx.toW(bx, bz + 0.9);
    const [cx2, cz2] = ctx.toW(bx, bz);
    ctx.rt.benches.push({ x, y: y + ctx.b.y, z, cx: cx2, cz: cz2, building: ctx.b.id });
  };
  switch (kind) {
    case 'living': {
      const c = r.pick([0x7a4a3a, 0x3e5a7a, 0x5a6a3a, 0x8a7a5a, 0x6a3a5a]);
      if (w > d) { B(cx, 0.4, z0 + 0.55, Math.min(2.2, w - 1), 0.8, 0.9, c, TEX.FABRIC); B(cx, 0.22, z0 + 1.7, 1.1, 0.44, 0.6, 0x8a5c3c, TEX.PLANKS); }
      else { B(x0 + 0.55, 0.4, cz, 0.9, 0.8, Math.min(2.2, d - 1), c, TEX.FABRIC); B(x0 + 1.7, 0.22, cz, 0.6, 0.44, 1.1, 0x8a5c3c, TEX.PLANKS); }
      if (full) ctx.box(cx, y + 0.012, cz, w * 0.5, 0.02, d * 0.5, r.pick([0xa83a32, 0x3a5a8a, 0xb8a070]), TEX.FABRIC, 1);
      B(x1 - 0.35, 0.5, z1 - 0.8, 0.5, 1.0, 1.2, 0x3a2a20, TEX.PLANKS);
      lootFloor(1, null, r.int(1, 2));
      ctx.container(x1 - 0.35, y + 0.5, z1 - 0.8, 'cabinet');
      break;
    }
    case 'kitchen': {
      // counters along the back wall
      const cw = Math.min(w - 0.6, 4);
      B(cx, 0.45, z0 + 0.35, cw, 0.9, 0.65, 0xd8d0c0, TEX.WHITE);
      if (full) ctx.box(cx, y + 0.92, z0 + 0.35, cw + 0.05, 0.05, 0.7, 0x3a3a3a, TEX.CONCRETE, 1);
      B(x0 + 0.45, 0.9, z0 + 0.45, 0.8, 1.8, 0.75, 0xe8e8e8, TEX.WHITE);
      ctx.container(x0 + 0.45, y + 0.9, z0 + 0.95, 'fridge');
      ctx.container(cx, y + 0.6, z0 + 0.75, 'cabinet');
      // table
      if (d > 3.2) {
        B(cx, 0.38, cz + 0.4, 1.4, 0.06, 0.9, 0x9a6b45, TEX.PLANKS, false);
        B(cx, 0.19, cz + 0.4, 1.2, 0.38, 0.7, 0x7a5035, TEX.PLANKS);
        ctx.loot(cx, y + 0.42, cz + 0.4, 1, 'food');
      }
      lootFloor(1, 'food', 1);
      break;
    }
    case 'bed': {
      const [bx, bz, yaw] = nearWall(2.1);
      const sx = Math.abs(Math.sin(yaw)) > 0.5 ? 2.1 : 1.5, sz = Math.abs(Math.sin(yaw)) > 0.5 ? 1.5 : 2.1;
      B(bx, 0.28, bz, sx, 0.56, sz, r.pick([0xf0ece4, 0xb8c8e0, 0xe0c8c8, 0xc8d8b8]), TEX.FABRIC);
      B(x1 - 0.4, 0.5, z0 + 0.4, 0.7, 1.0, 0.5, 0x6a4a35, TEX.PLANKS);
      ctx.container(x1 - 0.4, y + 0.5, z0 + 0.7, 'dresser');
      lootFloor(1, null, 1);
      break;
    }
    case 'bath': {
      B(x0 + 0.85, 0.3, z0 + 0.4, 1.6, 0.6, 0.75, 0xf4f4f4, TEX.WHITE);
      B(x1 - 0.35, 0.25, z1 - 0.4, 0.45, 0.5, 0.6, 0xf4f4f4, TEX.WHITE, false);
      B(x1 - 0.3, 1.2, z0 + 0.3, 0.5, 0.6, 0.2, 0xe8e8e8, TEX.WHITE, false);
      ctx.container(x1 - 0.3, y + 1.2, z0 + 0.45, 'medcab');
      break;
    }
    case 'store': {
      // shelving aisles
      const aisles = Math.max(1, Math.floor((w - 3) / 2.6));
      for (let a = 0; a < aisles; a++) {
        const ax = x0 + 2 + a * 2.6;
        const len = d - 5;
        if (len < 2) continue;
        const az = cz - 0.8;
        B(ax, 0.9, az, 0.8, 1.8, len, 0xc8ccd0, TEX.METAL);
        if (full) for (let s = 0; s < 3; s++) ctx.box(ax, y + 0.45 + s * 0.55, az, 0.9, 0.18, len - 0.2, r.pick([0xd9473a, 0x2f6fb5, 0xe6b422, 0x3a9a5b, 0xe07a2a, 0xf0f0f0]), TEX.FABRIC, 2);
        for (let k = 0; k < Math.max(1, len / 4); k++) ctx.loot(ax + r.sign() * 0.9, y + 0.05, az + r.range(-len / 2, len / 2), 1, ctx.b.shopCat || null);
        ctx.container(ax, y + 1.0, az + r.range(-len / 3, len / 3), 'shelf');
      }
      B(x1 - 1.6, 0.5, z1 - 2.2, 2.4, 1.0, 0.8, 0x6a5040, TEX.PLANKS);
      ctx.container(x1 - 1.6, y + 1.0, z1 - 2.2, 'register');
      if (ctx.b.bench && y < 1.5) bench(x0 + 1.4);
      break;
    }
    case 'barn': {
      for (let k = 0; k < Math.floor(d / 3.2) - 1; k++) {
        const z = z0 + 2 + k * 3.2;
        B(x0 + 1.6, 0.7, z, 3.2, 1.4, 0.12, 0x7a5a3a, TEX.PLANKS);
        B(x1 - 1.6, 0.7, z, 3.2, 1.4, 0.12, 0x7a5a3a, TEX.PLANKS);
      }
      for (let k = 0; k < r.int(3, 7); k++) {
        const hx = r.range(x0 + 1, x1 - 1), hz = r.range(z0 + (ctx.b.bench ? 2 : 1), z1 - 4);
        B(hx, 0.45, hz, 1.2, 0.9, 0.8, 0xd8b860, TEX.HAY);
      }
      if (ctx.b.bench) bench(x0 + 1.5);
      lootFloor(1, 'farm', r.int(2, 4));
      ctx.container(x0 + 0.8, y + 0.6, z1 - 3, 'toolbox');
      break;
    }
    case 'garage': {
      if (ctx.b.bench && w > 2.8) bench(cx);
      else B(cx, 0.45, z0 + 0.45, Math.min(w - 0.5, 2.4), 0.9, 0.8, 0x7a5a3a, TEX.PLANKS);
      ctx.container(cx, y + 0.95, z0 + 0.45, 'toolbox');
      B(x1 - 0.4, 0.9, cz, 0.6, 1.8, 1.6, 0x8a8f94, TEX.METAL);
      lootFloor(1, 'tools', 1);
      break;
    }
    case 'warehouse': {
      const rows = Math.max(1, Math.floor((w - 4) / 4));
      for (let a = 0; a < rows; a++) {
        const ax = x0 + 3 + a * 4;
        const len = d - 8;
        B(ax, 1.6, cz - 1, 1.2, 3.2, len, 0x3e6aa8, TEX.METAL);
        if (full) for (let k = 0; k < len / 2.2; k++) ctx.box(ax, y + 0.5 + (k % 2) * 1.4, cz - 1 - len / 2 + 1 + k * 2.2, 1.1, 1.0, 1.6, 0xb08a5a, TEX.PLANKS, 1);
        ctx.loot(ax + 1.6, y + 0.05, cz + r.range(-len / 3, len / 3), 1, null);
        ctx.container(ax, y + 1.1, cz + r.range(-len / 3, len / 3), 'crate');
      }
      for (let k = 0; k < r.int(2, 5); k++) B(r.range(x0 + 2, x1 - 2), 0.6, r.range(z1 - 6, z1 - 2), 1.2, 1.2, 1.2, 0xa07850, TEX.PLANKS);
      if (ctx.b.bench) bench(x0 + 1.5);
      break;
    }
    case 'church': {
      for (let k = 0; k < Math.floor((d - 6) / 1.6); k++) {
        const z = z0 + 5 + k * 1.6;
        B(cx - w * 0.22, 0.25, z, w * 0.32, 0.5, 0.5, 0x6a4a30, TEX.PLANKS);
        B(cx + w * 0.22, 0.25, z, w * 0.32, 0.5, 0.5, 0x6a4a30, TEX.PLANKS);
      }
      B(cx, 0.5, z0 + 1.5, 2, 1.0, 1, 0xe8e0d0, TEX.WHITE);
      lootFloor(2, null, 2);
      ctx.container(cx, y + 1.0, z0 + 1.5, 'cabinet');
      break;
    }
    case 'diner': {
      B(cx, 0.5, z0 + 1.2, w - 3, 1.0, 0.7, 0xc8ccd0, TEX.METAL);
      for (let k = 0; k < Math.floor((w - 3) / 1.2); k++) B(x0 + 2 + k * 1.2, 0.35, z0 + 2.1, 0.35, 0.7, 0.35, 0xc0392b, TEX.FABRIC, false);
      for (let k = 0; k < Math.floor((w - 2) / 3); k++) { B(x0 + 1.5 + k * 3, 0.38, z1 - 0.9, 1.2, 0.76, 0.8, 0xe8e0d0); }
      ctx.container(cx, y + 0.9, z0 + 0.6, 'fridge');
      lootFloor(1, 'food', 2);
      break;
    }
    case 'classroom': {
      for (let a = 0; a < 3; a++) for (let k = 0; k < 3; k++) B(x0 + 2 + a * ((w - 4) / 2), 0.38, z0 + 2.5 + k * 1.8, 0.9, 0.76, 0.6, 0x9a7a5a, TEX.PLANKS);
      lootFloor(1, null, 1);
      ctx.container(cx, y + 0.6, z1 - 0.6, 'cabinet');
      break;
    }
    case 'motelroom': {
      B(cx, 0.3, z0 + 1.2, 1.6, 0.6, 2.1, 0xd8c8b0, TEX.FABRIC);
      B(x1 - 0.35, 0.4, z1 - 1.2, 0.5, 0.8, 0.9, 0x6a4a35, TEX.PLANKS);
      ctx.container(x1 - 0.35, y + 0.5, z1 - 1.2, 'dresser');
      lootFloor(1, null, 1);
      break;
    }
    default:
      lootFloor(1, null, r.int(0, 2));
  }
}

// ------------------------------------------------------------------------------------
// Generic box building (houses, shops, townhouses, stores, cabins, warehouses ...)
// ------------------------------------------------------------------------------------
function genericBuilding(ctx, P) {
  const { b } = ctx;
  const gb = ctx.gb;
  const w = b.w, d = b.d, floors = P.floors, H = P.H;
  const F = P.F ?? 0.3;
  const r = ctx.rng;
  const wallTop = F + floors * H;
  ctx.trim = P.trim;
  // foundation + floor slabs
  ctx.box(0, F / 2 - 0.15, 0, w + 0.1, F + 0.3, d + 0.1, P.foundation ?? 0x8f8a80, TEX.CONCRETE, 0.5, { col: true, flags: COL.SOLID | COL.WALK | COL.BULLET });
  const stair = floors > 1 ? { x0: w / 2 - T - 1.25, x1: w / 2 - T - 0.05, z0: -d / 2 + T + 0.2, len: Math.min(d - 2 * T - 1.4, H / 0.2 * 0.27) } : null;
  if (stair) stair.z1 = stair.z0 + stair.len;
  // exterior walls per floor
  const corners = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
  for (let f = 0; f < floors; f++) {
    const y0 = f === 0 ? 0 : F + f * H;
    const h = f === 0 ? F + H : H;
    const base = f === 0 ? F : 0; // openings measured from floor surface
    for (let side = 0; side < 4; side++) {
      const [ax, az] = corners[side], [bx, bz] = corners[(side + 1) % 4];
      const L = Math.hypot(bx - ax, bz - az);
      const ops = [];
      const reserved = [];
      const sd = P.sides[side] || {};
      if (f === 0) {
        for (const dr of sd.doors || []) { ops.push({ t: dr.t * L, w: dr.w ?? 1.1, y0: base, y1: base + (dr.h ?? 2.2), kind: dr.kind ?? 'door', noDoor: dr.noDoor }); reserved.push(dr.t * L); }
        for (const sf of sd.storefront || []) { ops.push({ t: sf.t * L, w: sf.w, y0: base + 0.5, y1: base + 2.6, kind: 'storefront' }); reserved.push(sf.t * L - sf.w / 2 + 0.5, sf.t * L + sf.w / 2 - 0.5, sf.t * L); }
      } else if (sd.upperDoors) {
        for (const t of sd.upperDoors) { ops.push({ t: t * L, w: 1.2, y0: 0.05, y1: 2.5, kind: 'door', noDoor: true }); reserved.push(t * L); }
      }
      const wins = sd.windows === false ? [] : layoutWindows(L, reserved, P.winSpacing ?? 3.2, P.winW ?? 1.1);
      for (const t of wins) {
        if (stair && side === 1 && f === 0 && false) continue;
        ops.push({ t, w: P.winW ?? 1.1, y0: base + (P.sill ?? 0.9), y1: base + (P.winTop ?? 2.25), kind: 'window' });
      }
      wall(ctx, ax, az, bx, bz, y0, h, ops, { exterior: true, color: P.wall, layer: P.wallLayer, inColor: P.inWall ?? r.pick(INTERIOR_WALLS), trim: P.trim, shutter: P.shutter, floor: f, uv: P.wallUv });
    }
    // floor surface + slab between floors
    if (ctx.detail === 0) {
      const fy = F + f * H;
      const fc = P.floorColor ?? r.pick(FLOORS_WOOD);
      if (f === 0) ctx.box(0, fy + 0.01, 0, w - 2 * T, 0.02, d - 2 * T, fc, P.floorLayer ?? TEX.PLANKS, 0.5);
    }
    if (f > 0) {
      const fy = F + f * H;
      // slab with stair hole
      const slab = (x0, x1, z0, z1) => {
        if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
        ctx.box((x0 + x1) / 2, fy - 0.12, (z0 + z1) / 2, x1 - x0, 0.24, z1 - z0, 0xf2efe8, TEX.WHITE, 0.5, { col: true, interior: true });
        if (ctx.detail === 0) ctx.box((x0 + x1) / 2, fy + 0.01, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, P.floorColor ?? 0xa87a50, TEX.PLANKS, 0.5);
      };
      const ix0 = -w / 2 + T / 2, ix1 = w / 2 - T / 2, iz0 = -d / 2 + T / 2, iz1 = d / 2 - T / 2;
      if (stair) {
        slab(ix0, stair.x0, iz0, iz1);
        slab(stair.x0, ix1, stair.z1, iz1);
        slab(stair.x1, ix1, iz0, stair.z1);
      } else slab(ix0, ix1, iz0, iz1);
    }
  }
  // ceiling of top floor
  ctx.box(0, wallTop - 0.1, 0, w - 0.02, 0.2, d - 0.02, 0xf2efe8, TEX.WHITE, 0.5, { col: P.roof === 'flat', interior: P.roof !== 'flat' });
  // stairs
  if (stair) {
    for (let f = 0; f < floors - 1; f++) {
      const fy = F + f * H;
      const steps = Math.round(H / 0.2);
      const sw = stair.x1 - stair.x0;
      const sxm = (stair.x0 + stair.x1) / 2;
      if (ctx.detail === 0) for (let k = 0; k < steps; k++) {
        const sy = fy + (k + 1) * (H / steps);
        const sz = stair.z0 + (k + 0.5) * (stair.len / steps);
        ctx.box(sxm, sy - 0.1, sz, sw, 0.2, stair.len / steps + 0.02, 0x8a5c3c, TEX.PLANKS, 0.5);
      }
      ctx.ramp(sxm, fy + H / 2, stair.z0 + stair.len / 2, sw, H, stair.len, 0);
      // railing on the open side
      if (ctx.detail === 0) ctx.box(stair.x0 - 0.04, fy + H * 0.5 + 0.5, stair.z0 + stair.len / 2, 0.06, 0.06, stair.len, 0x5a3a26, TEX.PLANKS, 1);
    }
  }
  // rooms + interior walls + furniture + nav
  const roomsByFloor = [];
  for (let f = 0; f < floors; f++) {
    const fy = F + f * H;
    const ix0 = -w / 2 + T / 2, ix1 = w / 2 - T / 2, iz0 = -d / 2 + T / 2, iz1 = d / 2 - T / 2;
    const rooms = [];
    const plan = P.plan || 'house';
    if (plan === 'open' || w < 6.5 || d < 5.5) {
      rooms.push({ x0: ix0, x1: ix1, z0: iz0, z1: iz1, kind: P.openKind ?? 'open' });
    } else if (plan === 'motel') {
      const n = Math.max(2, Math.round(d / 4.2));
      const rw = (iz1 - iz0) / n;
      for (let k = 0; k < n; k++) {
        const z0 = iz0 + k * rw, z1 = z0 + rw;
        rooms.push({ x0: ix0, x1: ix1, z0, z1, kind: 'motelroom' });
        if (k > 0) wall(ctx, ix0, z0, ix1, z0, fy, H, [], { color: 0xe0d8c8, layer: TEX.PAINTED, inColor: 0xe0d8c8 });
      }
    } else if (plan === 'rowrooms') {
      const n = Math.max(2, Math.round(w / 9));
      const rw = (ix1 - ix0) / n;
      for (let k = 0; k < n; k++) {
        const x0 = ix0 + k * rw, x1 = x0 + rw;
        rooms.push({ x0, x1, z0: iz0, z1: iz1, kind: P.rowKind ?? 'classroom' });
        if (k > 0) wall(ctx, x0, iz1, x0, iz0, fy, H, [{ t: (iz1 - iz0) * 0.75, w: 1.1, y0: 0, y1: 2.2, kind: 'gap' }], { color: 0xe0d8c8, layer: TEX.PAINTED });
      }
    } else {
      // house plan: split along x (wall along z), then split one side along z
      const splitX = r.range(ix0 + (ix1 - ix0) * 0.4, ix0 + (ix1 - ix0) * 0.6);
      const stairSafe = stair ? Math.min(splitX, stair.x0 - 0.4) : splitX;
      const sx = Math.max(ix0 + 2.5, stairSafe);
      const dw = { t: (iz1 - iz0) * r.range(0.3, 0.7), w: 1.0, y0: 0, y1: 2.15, kind: 'gap' };
      wall(ctx, sx, iz1, sx, iz0, fy, H, [dw], { color: 0xe0d8c8, layer: TEX.PAINTED, inColor: r.pick(INTERIOR_WALLS), thick: 0.14 });
      const splitZ = r.range(iz0 + (iz1 - iz0) * 0.42, iz0 + (iz1 - iz0) * 0.58);
      const left = { x0: ix0, x1: sx, z0: iz0, z1: iz1 };
      const right = { x0: sx, x1: ix1, z0: iz0, z1: iz1 };
      if (left.x1 - left.x0 > 3 && (iz1 - iz0) > 6.5) {
        wall(ctx, ix0, splitZ, sx, splitZ, fy, H, [{ t: (sx - ix0) * r.range(0.35, 0.65), w: 1.0, y0: 0, y1: 2.15, kind: 'gap' }], { color: 0xe0d8c8, layer: TEX.PAINTED, inColor: r.pick(INTERIOR_WALLS), thick: 0.14 });
        rooms.push({ ...left, z0: splitZ, kind: f === 0 ? 'living' : 'bed' });
        rooms.push({ ...left, z1: splitZ, kind: f === 0 ? (r.chance(0.5) ? 'bath' : 'bed') : (r.chance(0.5) ? 'bath' : 'bed') });
      } else rooms.push({ ...left, kind: f === 0 ? 'living' : 'bed' });
      rooms.push({ ...right, kind: f === 0 ? 'kitchen' : 'bed' });
      // the door in the split wall connects left/right
      rooms.splitDoor = { x: sx, z: iz1 - dw.t };
    }
    for (const rm of rooms) {
      rm.floor = f; rm.y0 = fy; rm.y1 = fy + H - 0.2;
      // furniture avoids stair area by skipping rooms that overlap it heavily (keep simple)
      const overlapsStair = stair && rm.x1 > stair.x0 && rm.z0 < stair.z1;
      const kind = P.roomKind ? P.roomKind(rm, f) : rm.kind;
      if (!(overlapsStair && (kind === 'bed' || kind === 'kitchen') && rm.x1 - rm.x0 < 3.6)) furnish(ctx, overlapsStair ? { ...rm, z0: Math.max(rm.z0, stair.z1 + 0.3) } : rm, kind, fy);
      else ctx.loot((rm.x0 + rm.x1) / 2 - 0.6, fy + 0.05, (rm.z0 + rm.z1) / 2, 1);
      const [wx0, wz0] = [rm.x0, rm.z0];
      void wx0; void wz0;
      rm.nav = ctx.navNode((rm.x0 + rm.x1) / 2 - (overlapsStair ? 0.8 : 0), fy + 0.02, (rm.z0 + rm.z1) / 2 + (overlapsStair ? 1.0 : 0), 'room', { floor: f });
      ctx.rt.rooms.push({ floor: f, x0: rm.x0, x1: rm.x1, z0: rm.z0, z1: rm.z1, y0: b.y + fy, y1: b.y + fy + H, nav: rm.nav });
    }
    // connect rooms on this floor (all-to-all through doorways is a fine approximation for small plans)
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) ctx.link(rooms[i].nav, rooms[j].nav);
    roomsByFloor.push(rooms);
  }
  // stairs nav
  if (stair) {
    for (let f = 0; f < floors - 1; f++) {
      const sxm = (stair.x0 + stair.x1) / 2;
      const bot = ctx.navNode(sxm, F + f * H + 0.02, stair.z0 - 0.0 + 0.3, 'stairbot', { floor: f });
      const top = ctx.navNode(sxm - 0.9, F + (f + 1) * H + 0.02, stair.z1 + 0.6, 'stairtop', { floor: f + 1 });
      ctx.link(bot, top);
      const roomAt = (rooms, x, z) => rooms.find((rm) => x >= rm.x0 - 0.3 && x <= rm.x1 + 0.3 && z >= rm.z0 - 0.3 && z <= rm.z1 + 0.3) || rooms[0];
      ctx.link(bot, roomAt(roomsByFloor[f], sxm, stair.z0 + 0.3).nav);
      ctx.link(top, roomAt(roomsByFloor[f + 1], sxm - 0.9, stair.z1 + 0.6).nav);
    }
  }
  // connect entrances' inside nodes to their room
  for (const e of ctx.rt.entrances) {
    const n = ctx.rt.nav.nodes[e.inn];
    const rooms = roomsByFloor[e.floor] || roomsByFloor[0];
    // convert world → local
    const dx = n.x - b.x, dz = n.z - b.z;
    const lx = dx * ctx.c - dz * ctx.s, lz = dx * ctx.s + dz * ctx.c;
    let best = rooms[0], bd = 1e9;
    for (const rm of rooms) {
      const ddx = Math.max(rm.x0 - lx, 0, lx - rm.x1), ddz = Math.max(rm.z0 - lz, 0, lz - rm.z1);
      const dd = ddx + ddz;
      if (dd < bd) { bd = dd; best = rm; }
    }
    ctx.link(e.inn, best.nav);
  }
  // roof
  if (P.roof === 'flat') flatRoof(ctx, w, d, wallTop, P.roofColor ?? 0x6b6b6b, P.parapet ?? 0.8, P.parapetColor ?? P.trim ?? 0xd8d0c0);
  else if (P.roof === 'gambrel') gambrelRoof(ctx, w, d, wallTop, P.roofColor, P.wall);
  else if (P.roof === 'metal') gableRoof(ctx, w, d, wallTop, P.pitch ?? 0.35, P.roofColor, TEX.METAL, P.ridge ?? 'x', 0.35, P.wall, P.wallLayer);
  else gableRoof(ctx, w, d, wallTop, P.pitch ?? 0.62, P.roofColor, TEX.SHINGLE, P.ridge ?? 'x', 0.45, P.wall, P.wallLayer);
  // porch
  if (P.porch) porch(ctx, w, d, F, P);
  if (P.balcony) balconies(ctx, w, d, F, H, floors, P);
  if (P.chimney && ctx.detail <= 1) {
    const cx = -w / 2 + 1.2;
    ctx.box(cx, wallTop / 2 + 1.5, -d * 0.1, 1.0, wallTop + 3 + (P.pitch ?? 0.6) * d * 0.4, 1.0, 0x8f4a3a, TEX.BRICK, 0.5, { col: false });
  }
  // awning / sign for shops
  if (P.signText) {
    const sy = P.signY ?? F + 2.95;
    ctx.sign(P.signText, 0, sy, d / 2 + 0.18, Math.min(w * 0.8, P.signW ?? 8), P.signH ?? 0.9, 0, P.signColors);
    if (ctx.detail <= 1) ctx.box(0, sy, d / 2 + 0.1, Math.min(w * 0.84, (P.signW ?? 8) + 0.3), (P.signH ?? 0.9) + 0.2, 0.14, P.signBoard ?? 0x2a2a2a, TEX.PAINTED, 1);
  }
  if (P.awning && ctx.detail <= 1) {
    const ac = P.awning;
    gb.setColor(ac).setLayer(TEX.FABRIC);
    const ay = F + 2.75, ad = 1.6;
    gb.quad([-w / 2 + 0.3, ay, d / 2], [w / 2 - 0.3, ay, d / 2], [w / 2 - 0.3, ay - 0.6, d / 2 + ad], [-w / 2 + 0.3, ay - 0.6, d / 2 + ad]);
    gb.quad([w / 2 - 0.3, ay, d / 2], [-w / 2 + 0.3, ay, d / 2], [-w / 2 + 0.3, ay - 0.6, d / 2 + ad], [w / 2 - 0.3, ay - 0.6, d / 2 + ad]);
  }
}

function porch(ctx, w, d, F, P) {
  const pd = P.porchDepth ?? 2.4;
  const pw = P.porchW ?? w;
  const z = d / 2 + pd / 2;
  ctx.box(0, F / 2 - 0.05, z, pw, F + 0.1, pd, 0x9a8a78, TEX.PLANKS, 0.5, { col: true, flags: COL.SOLID | COL.WALK });
  if (ctx.detail === 0) ctx.box(0, F + 0.01, z, pw - 0.1, 0.02, pd - 0.1, 0xb8a890, TEX.PLANKS, 0.5);
  const posts = Math.max(2, Math.round(pw / 2.6) + 1);
  const ph = 2.6;
  for (let k = 0; k < posts; k++) {
    const x = -pw / 2 + 0.15 + (k * (pw - 0.3)) / (posts - 1);
    ctx.box(x, F + ph / 2, d / 2 + pd - 0.15, 0.18, ph, 0.18, P.trim ?? 0xffffff, TEX.PAINTED, 1, { col: true, flags: COL.SOLID | COL.BULLET });
  }
  if (ctx.detail === 0) {
    // railing (skip the middle for the steps)
    for (const side of [-1, 1]) {
      const x0 = side * 1.0, x1 = side * (pw / 2 - 0.15);
      const cx = (x0 + x1) / 2, len = Math.abs(x1 - x0);
      ctx.box(cx, F + 0.9, d / 2 + pd - 0.15, len, 0.08, 0.08, P.trim ?? 0xffffff, TEX.PAINTED, 1);
      for (let k = 0; k < len / 0.25; k++) ctx.box(Math.min(x0, x1) + k * 0.25, F + 0.45, d / 2 + pd - 0.15, 0.04, 0.9, 0.04, P.trim ?? 0xffffff, TEX.PAINTED, 1);
      ctx.col(cx, F + 0.5, d / 2 + pd - 0.15, len, 1.0, 0.1, 0, COL.SOLID);
    }
  }
  // steps
  ctx.box(0, F / 2 - 0.12, d / 2 + pd + 0.3, 1.8, F * 0.5, 0.6, 0x8a7a68, TEX.PLANKS, 0.5, { col: true, flags: COL.SOLID | COL.WALK });
  // porch roof (shed slope)
  const gb = ctx.gb;
  const y1 = F + ph + 0.05, y2 = F + ph + 0.55;
  gb.setColor(P.roofColor ?? 0x4a4f57).setLayer(TEX.SHINGLE);
  gb.quad([-pw / 2 - 0.2, y1, d / 2 + pd + 0.3], [pw / 2 + 0.2, y1, d / 2 + pd + 0.3], [pw / 2 + 0.2, y2, d / 2], [-pw / 2 - 0.2, y2, d / 2], [[0, 0], [pw * 0.4, 0], [pw * 0.4, pd * 0.4], [0, pd * 0.4]]);
  gb.setColor(0xe8e2d8).setLayer(TEX.PLANKS);
  gb.quad([pw / 2 + 0.2, y1 - 0.08, d / 2 + pd + 0.3], [-pw / 2 - 0.2, y1 - 0.08, d / 2 + pd + 0.3], [-pw / 2 - 0.2, y2 - 0.08, d / 2], [pw / 2 + 0.2, y2 - 0.08, d / 2]);
  ctx.col(0, (y1 + y2) / 2, d / 2 + pd / 2 + 0.15, pw + 0.4, 0.2, pd + 0.3, 0, COL.SOLID | COL.WALK);
}

function balconies(ctx, w, d, F, H, floors, P) {
  const bd = 1.4;
  for (let f = 1; f < floors; f++) {
    const fy = F + f * H;
    ctx.box(0, fy - 0.1, d / 2 + bd / 2, w - 0.3, 0.2, bd, 0x6a6a66, TEX.CONCRETE, 0.5, { col: true, flags: COL.SOLID | COL.WALK });
    // wrought iron railing
    if (ctx.detail <= 1) {
      const c = 0x161616;
      ctx.box(0, fy + 1.0, d / 2 + bd - 0.05, w - 0.3, 0.06, 0.06, c, TEX.METAL, 1);
      ctx.box(0, fy + 0.12, d / 2 + bd - 0.05, w - 0.3, 0.05, 0.05, c, TEX.METAL, 1);
      if (ctx.detail === 0) {
        for (let k = 0; k < (w - 0.3) / 0.26; k++) ctx.box(-w / 2 + 0.2 + k * 0.26, fy + 0.55, d / 2 + bd - 0.05, 0.03, 0.9, 0.03, c, TEX.METAL, 1);
        for (const sx of [-1, 1]) for (let k = 0; k < bd / 0.26; k++) ctx.box(sx * (w / 2 - 0.18), fy + 0.55, d / 2 + 0.1 + k * 0.26, 0.03, 0.9, 0.03, c, TEX.METAL, 1);
        // decorative brackets
        for (let k = 0; k < 3; k++) ctx.box(-w / 2 + 0.6 + (k * (w - 1.2)) / 2, fy - 0.5, d / 2 + 0.4, 0.06, 0.6, 0.06, c, TEX.METAL, 1);
      } else {
        ctx.box(0, fy + 0.55, d / 2 + bd - 0.05, w - 0.3, 0.9, 0.02, 0x2a2a2a, TEX.METAL, 1);
      }
      for (const sx of [-1, 1]) ctx.box(sx * (w / 2 - 0.18), fy + 1.0, d / 2 + bd / 2, 0.06, 0.06, bd, c, TEX.METAL, 1);
    }
    ctx.col(0, fy + 0.5, d / 2 + bd - 0.05, w - 0.3, 1.0, 0.1, 0, COL.SOLID);
    for (const sx of [-1, 1]) ctx.col(sx * (w / 2 - 0.18), fy + 0.5, d / 2 + bd / 2, 0.1, 1.0, bd, 0, COL.SOLID);
    // hanging plants
    if (ctx.detail === 0 && ctx.rng.chance(0.6)) ctx.box(ctx.rng.range(-w / 3, w / 3), fy + 1.15, d / 2 + bd - 0.15, 0.6, 0.3, 0.3, 0x3f8a3a, TEX.LEAVES, 1);
  }
  // ground floor support posts (gallery look) for 3-storey townhouses
  if (floors >= 2 && P.gallery) {
    for (let k = 0; k < 3; k++) ctx.box(-w / 2 + 0.3 + (k * (w - 0.6)) / 2, F + H / 2, d / 2 + bd - 0.1, 0.12, H, 0.12, 0x161616, TEX.METAL, 1, { col: true, flags: COL.SOLID | COL.BULLET });
  }
}

// ------------------------------------------------------------------------------------
// Specific building recipes
// ------------------------------------------------------------------------------------
const TEXL = (name) => TEX[name] ?? TEX.SIDING;

export function generateBuilding(b, gb, signs, detail = 0) {
  const ctx = new BCtx(b, gb, signs, detail);
  const r = ctx.rng;
  const st = b.style || {};
  gb.push();
  gb.translate(b.x, b.y, b.z);
  gb.rotateY(b.rot);
  const doorFront = (t = 0.5, extra = {}) => ({ t, w: 1.1, h: 2.2, ...extra });
  switch (b.kind) {
    case 'house':
    case 'farmhouse': {
      const floors = b.floors || 1;
      genericBuilding(ctx, {
        floors, H: 3.0, wall: st.wall ?? 0xf2efe6, wallLayer: TEXL(st.wallTex), trim: st.trim ?? 0xffffff, shutter: st.shutter, roofColor: st.roof ?? 0x4a4f57,
        roof: st.roofType === 'hip' ? 'gable' : 'gable', pitch: b.kind === 'farmhouse' ? 0.75 : 0.62, porch: st.porch || b.kind === 'farmhouse',
        porchW: b.kind === 'farmhouse' ? b.w : Math.min(b.w, r.range(4, b.w)), chimney: st.chimney,
        sides: [{ doors: [doorFront(st.porch ? 0.5 : r.range(0.3, 0.7))] }, {}, { doors: [doorFront(r.range(0.25, 0.75))] }, {}],
      });
      break;
    }
    case 'cabin': {
      genericBuilding(ctx, {
        floors: b.floors || 1, H: 2.9, wall: 0x9a6a42, wallLayer: TEX.LOGS, trim: 0x5a3a24, roofColor: r.pick([0x3a4a3a, 0x5a4a3a, 0x4a3a2a]), pitch: 0.8, porch: true, chimney: true,
        inWall: 0xb88a5a, sides: [{ doors: [doorFront(0.5)] }, {}, {}, {}], plan: 'open', openKind: 'living', floorColor: 0x9a6b45,
      });
      break;
    }
    case 'shack': {
      const stilts = b.stilts;
      if (stilts) {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.box(sx * (b.w / 2 - 0.3), -0.6, sz * (b.d / 2 - 0.3), 0.3, 2.4, 0.3, 0x5a4a3a, TEX.BARK, 1, { col: true });
        gb.translate(0, 1.0, 0); b.y += 1.0; ctx.box(0, -0.6, b.d / 2 + 1.6, 1.2, 0.2, 3.2, 0x7a6a58, TEX.PLANKS, 0.5); ctx.ramp(0, -0.55, b.d / 2 + 1.6, 1.2, 1.3, 3.2, Math.PI);
      }
      genericBuilding(ctx, {
        floors: 1, H: 2.7, wall: r.pick([0x8a7a68, 0x7a8a8a, 0x9a8060, 0x6a7a6a]), wallLayer: TEX.BOARDS, trim: 0x4a3a2a, roofColor: 0x8a8f94, roof: 'metal', pitch: 0.3,
        sides: [{ doors: [doorFront(0.4)] }, {}, {}, {}], plan: 'open', openKind: 'garage', signText: b.sign, signW: Math.min(b.w - 1, 5), signColors: ['#f4e7c5', '#3a2a1a'],
      });
      if (stilts) b.y -= 1.0;
      break;
    }
    case 'shed':
    case 'garage': {
      genericBuilding(ctx, {
        floors: 1, H: b.kind === 'garage' ? 3.0 : 2.6, wall: r.pick([0xa3302a, 0xd8d0c0, 0x8a7a68, 0x6f7f6a, 0xb8b0a0]), wallLayer: b.kind === 'shed' ? TEX.BOARDS : TEX.SIDING,
        trim: 0xffffff, roofColor: r.pick([0x4a4f57, 0x6b6e70, 0x8a8f94]), roof: b.kind === 'shed' ? 'metal' : 'gable', pitch: 0.45,
        sides: [{ doors: [b.kind === 'garage' ? { t: 0.5, w: Math.min(3, b.w - 1), h: 2.5, kind: 'bigdoor' } : doorFront(0.5)] }, { windows: false }, { windows: false }, {}],
        plan: 'open', openKind: 'garage', signText: b.sign, signW: Math.min(b.w - 1, 5),
      });
      break;
    }
    case 'barn': {
      const w = b.w;
      genericBuilding(ctx, {
        floors: 1, H: 6.0, wall: st.wall ?? 0xa3302a, wallLayer: TEX.BOARDS, trim: st.trim ?? 0xf4f1ea, roofColor: st.roof ?? 0x5a5f66, roof: 'gambrel',
        sides: [{ doors: [{ t: 0.5, w: Math.min(5, w * 0.32), h: 4.6, kind: 'bigdoor' }], windows: false }, { doors: [{ t: 0.5, w: 1.1, h: 2.2 }] }, { doors: [{ t: 0.5, w: Math.min(4.5, w * 0.3), h: 4.2, kind: 'bigdoor' }], windows: false }, {}],
        winSpacing: 4.5, sill: 2.2, winTop: 3.3, plan: 'open', openKind: 'barn', inWall: 0x8a6a4a, floorColor: 0x8a7050, floorLayer: TEX.DIRTROAD,
        signText: b.sign, signY: 7.6, signW: 5, signColors: ['#f4f1ea', '#2a1a10'], signBoard: 0xf4f1ea,
      });
      // white X-braces on the big doors + hay loft door
      if (detail <= 1) {
        const dw = Math.min(5, w * 0.32);
        const z = b.d / 2 + 0.16;
        gb.setColor(0xf4f1ea).setLayer(TEX.PAINTED);
        for (const sx of [-1, 1]) {
          const x0 = sx * dw / 2, x1 = sx * (dw / 2 + dw / 2);
          gb.beam(x0, 0.3, z, x1, 4.9, z, 0.16);
          gb.beam(x0, 4.9, z, x1, 0.3, z, 0.16);
          gb.box((x0 + x1) / 2, 0.38, z, dw / 2, 0.16, 0.1, 1);
          gb.box((x0 + x1) / 2, 4.85, z, dw / 2, 0.16, 0.1, 1);
          gb.box(x1, 2.6, z, 0.16, 4.6, 0.1, 1);
        }
        // open sliding door panels pushed aside
        gb.setColor(st.wall ?? 0xa3302a).setLayer(TEX.BOARDS);
        for (const sx of [-1, 1]) gb.box(sx * (dw / 2 + dw / 4), 2.6, z + 0.12, dw / 2, 4.6, 0.12, 0.5);
        gb.setColor(0x2a1a14).setLayer(TEX.PLANKS);
        gb.box(0, 7.0, b.d / 2 + 0.13, 2.2, 1.8, 0.05, 0.5);
        gb.setColor(0xf4f1ea).setLayer(TEX.PAINTED);
        gb.box(0, 7.0, b.d / 2 + 0.16, 2.5, 0.12, 0.06, 1); gb.box(0, 7.95, b.d / 2 + 0.16, 2.5, 0.12, 0.06, 1);
        // cupola
        ctx.box(0, 6.3 + w * 0.45 + 0.5, 0, 1.6, 1.4, 1.6, 0xf4f1ea, TEX.BOARDS, 0.5);
        gb.setColor(st.roof ?? 0x5a5f66).setLayer(TEX.METAL);
        gb.push(); gb.translate(0, 6.3 + w * 0.45 + 1.2, 0); gb.cylinder(0, 0, 0, 0.05, 1.3, 0.8, 4); gb.pop();
      }
      // hay loft over the back half (ladder = steep ramp)
      const ly = 4.0;
      ctx.box(0, ly - 0.1, -b.d / 4, b.w - 0.6, 0.2, b.d / 2 - 0.4, 0x8a6a48, TEX.PLANKS, 0.5, { col: true, interior: true });
      if (detail === 0) for (let k = 0; k < 6; k++) ctx.box(r.range(-b.w / 3, b.w / 3), ly + 0.45, r.range(-b.d / 2 + 1.5, -1.5), 1.2, 0.9, 0.8, 0xd8b860, TEX.HAY, 1, { col: true });
      ctx.box(b.w / 2 - 1.0, ly / 2 + 0.15, 0.4 + 1.8, 0.9, 0.1, 4.4, 0x6a4a30, TEX.PLANKS, 1, { interior: true });
      ctx.ramp(b.w / 2 - 1.0, ly / 2 + 0.15, 0.4 + 1.8, 0.9, ly - 0.3, 3.6, Math.PI);
      ctx.loot(r.range(-3, 3), b.y + ly + 0.05 - b.y, -b.d / 4, 2, null);
      const lootNode = ctx.navNode(0, ly + 0.02, -b.d / 4, 'room', { floor: 1 });
      const ladderTop = ctx.navNode(b.w / 2 - 1.0, ly + 0.02, 0.2, 'stairtop', { floor: 1 });
      const ladderBot = ctx.navNode(b.w / 2 - 1.0, 0.32, 4.6, 'stairbot', { floor: 0 });
      ctx.link(ladderBot, ladderTop); ctx.link(ladderTop, lootNode);
      const groundRoom = ctx.rt.rooms[0];
      if (groundRoom) ctx.link(ladderBot, groundRoom.nav);
      ctx.rt.rooms.push({ floor: 1, x0: -b.w / 2, x1: b.w / 2, z0: -b.d / 2, z1: 0, y0: b.y + ly, y1: b.y + 9, nav: lootNode });
      break;
    }
    case 'shop': {
      genericBuilding(ctx, {
        floors: b.floors || 2, H: 3.3, wall: st.wall ?? 0xa3523f, wallLayer: TEX.BRICK, wallUv: 0.6, trim: 0xe8e0cc, roof: 'flat', parapet: 1.0, parapetColor: 0xd8cfb8,
        sides: [{ doors: [doorFront(0.78)], storefront: [{ t: 0.34, w: Math.max(2, b.w * 0.45) }] }, { windows: false }, { doors: [doorFront(0.3)] }, { windows: false }],
        plan: 'open', openKind: b.sign === 'TAVERN' || b.sign === 'CAFE' || b.sign === 'BAKERY' ? 'diner' : 'store', winW: 1.2, winSpacing: 2.6,
        signText: b.sign, signW: Math.min(b.w - 1.5, 7), awning: r.chance(0.6) ? r.pick([0x2f6f4a, 0x8a2a2a, 0x2a4a7a, 0xc89a3a, 0xe8e0d0]) : null,
        signColors: [r.pick(['#f4e7c5', '#ffffff', '#ffd76a']), r.pick(['#1e3a2a', '#3a1a1a', '#1a2a4a', '#2a2a2a'])],
      });
      break;
    }
    case 'townhouse': {
      const floors = b.floors || 2;
      genericBuilding(ctx, {
        floors, H: 3.5, wall: st.wall ?? 0xe8b4a0, wallLayer: TEX.STUCCO, trim: st.trim ?? 0xfaf6ee, shutter: st.shutter ?? 0x2f5a3c, roof: 'flat', parapet: 0.7,
        parapetColor: 0xf4efe4, roofColor: 0x5d5a58, winW: 1.15, winSpacing: 2.5, sill: 0.35, winTop: 2.6,
        sides: [{ doors: [doorFront(r.chance(0.5) ? 0.25 : 0.75, { h: 2.6 })], upperDoors: st.balcony ? [0.3, 0.7] : null }, { windows: false }, { doors: [doorFront(0.5)] }, { windows: false }],
        balcony: st.balcony, gallery: floors >= 3 && r.chance(0.4),
      });
      break;
    }
    case 'store':
    case 'gas':
    case 'diner': {
      const isDiner = b.kind === 'diner';
      b.shopCat = { 'GROCERY': 'food', 'PHARMACY': 'meds', 'HARDWARE': 'tools', 'ARMY SURPLUS': 'guns', 'FEED & SEED': 'farm', 'SHERIFF': 'guns', 'GUNS': 'guns', 'PAWN': 'guns' }[b.sign] || (b.kind === 'gas' ? 'auto' : null);
      const sw = b.w * 0.55;
      genericBuilding(ctx, {
        floors: 1, H: 3.6, wall: st.wall ?? (isDiner ? 0xd8dde2 : r.pick([0xd8cfb8, 0xc9b79a, 0xb8c0c8, 0xe0d8c8])), wallLayer: st.wallTex ? TEXL(st.wallTex) : isDiner ? TEX.RIBBED : TEX.CONCRETE,
        trim: isDiner ? 0xc0392b : 0x3a3a3a, roof: 'flat', parapet: 1.2, parapetColor: isDiner ? 0xc0392b : 0xb8b0a0,
        sides: [{ doors: [{ t: 0.82, w: 1.6, h: 2.3, noDoor: true }], storefront: [{ t: 0.4, w: sw }] }, { windows: false }, { doors: [doorFront(0.25)] }, { windows: false }],
        plan: 'open', openKind: isDiner ? 'diner' : 'store', signText: b.sign, signW: Math.min(b.w - 2, 9), signY: 4.3, signH: 1.1,
        signColors: isDiner ? ['#ffffff', '#c0392b'] : [r.pick(['#ffffff', '#ffd76a', '#fff2c4']), r.pick(['#1e5a8a', '#2a6a3a', '#8a2a2a', '#3a3a3a'])], signBoard: isDiner ? 0xc0392b : 0x2a2a2a,
      });
      break;
    }
    case 'bigbox': {
      b.shopCat = null;
      genericBuilding(ctx, {
        floors: 1, H: 7.0, wall: 0xd4cdbf, wallLayer: TEX.CONCRETE, trim: 0x2a5a8a, roof: 'flat', parapet: 1.5, parapetColor: 0x2a5a8a,
        sides: [{ doors: [{ t: 0.3, w: 3, h: 2.8, kind: 'bigdoor' }, { t: 0.7, w: 3, h: 2.8, kind: 'bigdoor' }], storefront: [{ t: 0.5, w: 10 }], windows: false }, { windows: false }, { doors: [{ t: 0.5, w: 4, h: 4, kind: 'bigdoor' }], windows: false }, { windows: false }],
        plan: 'open', openKind: 'store', signText: b.sign, signW: 22, signH: 2.6, signY: 6.0, signColors: ['#ffffff', '#2a5a8a'], signBoard: 0x2a5a8a,
      });
      break;
    }
    case 'motel': {
      genericBuilding(ctx, {
        floors: 1, H: 3.0, wall: 0xe8dcc0, wallLayer: TEX.STUCCO, trim: 0x2a6a6a, roof: 'gable', roofColor: 0x7a3b2e, pitch: 0.35, ridge: 'z',
        sides: [{ doors: [doorFront(0.5)] }, { doors: (() => { const n = Math.max(2, Math.round(b.d / 4.2)); return Array.from({ length: n }, (_, k) => doorFront((k + 0.5) / n)); })() }, {}, {}],
        plan: 'motel', winSpacing: 4.2,
      });
      ctx.sign('MOTEL', b.w / 2 + 3, 6, b.d / 2 - 2, 4, 1.4, Math.PI / 2, ['#ff5a4a', '#1a1a1a']);
      if (detail <= 1) ctx.box(b.w / 2 + 3, 3, b.d / 2 - 2, 0.3, 6, 0.3, 0x5a5a5a, TEX.METAL, 1, { col: true });
      break;
    }
    case 'school': {
      genericBuilding(ctx, {
        floors: 1, H: 3.6, wall: 0xb8735a, wallLayer: TEX.BRICK, trim: 0xf0ece0, roof: 'flat', parapet: 0.8, parapetColor: 0xe0d8c8,
        sides: [{ doors: [{ t: 0.5, w: 2.2, h: 2.4, kind: 'bigdoor' }] }, {}, { doors: [doorFront(0.2), doorFront(0.8)] }, {}],
        plan: 'rowrooms', rowKind: 'classroom', signText: 'MILLBROOK SCHOOL', signW: 12, signY: 4.0, signColors: ['#f0ece0', '#2a3a5a'],
      });
      break;
    }
    case 'church': {
      genericBuilding(ctx, {
        floors: 1, H: 6.5, wall: 0xf6f3ea, wallLayer: TEX.SIDING, trim: 0xffffff, roofColor: 0x3a3f46, ridge: 'z', pitch: 0.9,
        sides: [{ doors: [{ t: 0.5, w: 2.0, h: 3.0, kind: 'bigdoor' }] }, {}, {}, {}], winW: 1.2, sill: 1.6, winTop: 4.8, winSpacing: 3.6, plan: 'open', openKind: 'church',
      });
      // steeple
      if (detail <= 1) {
        const tz = b.d / 2 - 1.5;
        ctx.box(0, 9, tz, 3.2, 6, 3.2, 0xf6f3ea, TEX.SIDING, 0.5, { col: true });
        ctx.box(0, 13, tz, 2.4, 2.2, 2.4, 0xf6f3ea, TEX.PAINTED, 0.5);
        gb.setColor(0x3a3f46).setLayer(TEX.SHINGLE);
        gb.push(); gb.translate(0, 14.1, tz); gb.rotateY(Math.PI / 4); gb.cylinder(0, 0, 0, 0.02, 2.0, 7.5, 4, 0.5); gb.pop();
        gb.setColor(0xd4b04a).setLayer(TEX.METAL);
        gb.box(0, 22.2, tz, 0.12, 1.4, 0.12, 1); gb.box(0, 22.4, tz, 0.7, 0.12, 0.12, 1);
      }
      break;
    }
    case 'cathedral': {
      genericBuilding(ctx, {
        floors: 1, H: 12, wall: 0xf3efe6, wallLayer: TEX.STUCCO, trim: 0xd8d0c0, roofColor: 0x3d4248, ridge: 'z', pitch: 0.55, roof: 'gable',
        sides: [{ doors: [{ t: 0.5, w: 3, h: 4.5, kind: 'bigdoor' }, { t: 0.2, w: 1.6, h: 3.2 }, { t: 0.8, w: 1.6, h: 3.2 }] }, {}, {}, {}],
        winW: 1.6, sill: 3.5, winTop: 9, winSpacing: 5, plan: 'open', openKind: 'church',
      });
      if (detail <= 1) {
        const fz = b.d / 2 - 2;
        for (const [sx, th, tw] of [[0, 28, 5], [-11, 20, 4], [11, 20, 4]]) {
          ctx.box(sx, th / 2, fz, tw, th, tw, 0xf3efe6, TEX.STUCCO, 0.4, { col: true });
          ctx.box(sx, th + 0.3, fz, tw + 0.4, 0.6, tw + 0.4, 0xd8d0c0, TEX.CONCRETE, 0.5);
          gb.setColor(0x26292d).setLayer(TEX.SHINGLE);
          gb.push(); gb.translate(sx, th + 0.6, fz); gb.rotateY(Math.PI / 4); gb.cylinder(0, 0, 0, 0.05, tw * 0.62, th * 0.42, 6, 0.4); gb.pop();
          gb.setColor(0xd4b04a).setLayer(TEX.METAL);
          gb.box(sx, th * 1.42 + 1.4, fz, 0.15, 1.6, 0.15, 1); gb.box(sx, th * 1.42 + 1.7, fz, 0.8, 0.15, 0.15, 1);
        }
        // clock
        gb.setColor(0xfaf6ea).setLayer(TEX.WHITE).setEmit(0.6);
        gb.push(); gb.translate(0, 21, fz + 2.52); gb.rotateX(Math.PI / 2); gb.cylinder(0, 0, 0, 1.3, 1.3, 0.1, 16); gb.pop();
        gb.setEmit(0);
      }
      break;
    }
    case 'warehouse': {
      genericBuilding(ctx, {
        floors: 1, H: 7, wall: st.wall ?? r.pick([0x9aa3a8, 0x7f8c94, 0xa89880, 0x6f8a7a]), wallLayer: st.wallTex ? TEXL(st.wallTex) : TEX.RIBBED, wallUv: 0.35, trim: 0x3a3f44,
        roof: 'metal', roofColor: 0x7a8088, pitch: 0.18, ridge: 'z',
        sides: [{ doors: [{ t: 0.25, w: 4, h: 4.5, kind: 'bigdoor' }, { t: 0.75, w: 4, h: 4.5, kind: 'bigdoor' }, { t: 0.5, w: 1.1, h: 2.2 }], windows: false }, { windows: false }, { doors: [doorFront(0.5)], windows: false }, { windows: false }],
        plan: 'open', openKind: 'warehouse', signText: b.sign, signW: Math.min(b.w - 4, 14), signY: 6.0, signH: 1.3, signColors: ['#ffffff', '#1e3a5a'],
      });
      break;
    }
    case 'millhall': {
      genericBuilding(ctx, {
        floors: 1, H: 6, wall: 0x8a6a48, wallLayer: TEX.BOARDS, trim: 0x5a3a24, roof: 'metal', roofColor: 0x6a7076, pitch: 0.3, ridge: 'z',
        sides: [{ doors: [{ t: 0.5, w: b.w * 0.6, h: 5, kind: 'bigdoor' }], windows: false }, { doors: [{ t: 0.5, w: b.d * 0.5, h: 3.5, kind: 'bigdoor' }], windows: false }, { doors: [{ t: 0.5, w: b.w * 0.6, h: 5, kind: 'bigdoor' }], windows: false }, { windows: false }],
        plan: 'open', openKind: 'warehouse', signText: 'CEDAR RIDGE LUMBER', signW: 12, signY: 6.5, signColors: ['#f4e7c5', '#3a2a1a'],
      });
      break;
    }
    case 'fairbarn': {
      genericBuilding(ctx, {
        floors: 1, H: 5, wall: 0xf4f1ea, wallLayer: TEX.BOARDS, trim: 0xa3302a, roof: 'metal', roofColor: 0xa3302a, pitch: 0.45, ridge: 'z',
        sides: [{ doors: [{ t: 0.5, w: 4, h: 4, kind: 'bigdoor' }], windows: false }, { winW: 1.4 }, { doors: [{ t: 0.5, w: 4, h: 4, kind: 'bigdoor' }], windows: false }, {}],
        sill: 2.0, winTop: 3.4, winSpacing: 5, plan: 'open', openKind: 'barn', signText: 'EXHIBITS', signW: 6, signY: 6.3, signColors: ['#ffffff', '#a3302a'],
      });
      break;
    }
    case 'boathouse': {
      genericBuilding(ctx, {
        floors: 1, H: 3.5, wall: 0x7a8a8a, wallLayer: TEX.BOARDS, trim: 0xffffff, roof: 'metal', roofColor: 0x5a6a7a, pitch: 0.4,
        sides: [{ doors: [{ t: 0.5, w: 5, h: 3, kind: 'bigdoor' }], windows: false }, {}, { doors: [doorFront(0.5)] }, {}], plan: 'open', openKind: 'garage', signText: b.sign, signW: 4,
      });
      break;
    }
    default: {
      genericBuilding(ctx, { floors: 1, H: 3, wall: 0xd8d0c0, wallLayer: TEX.SIDING, trim: 0xffffff, roofColor: 0x4a4f57, sides: [{ doors: [doorFront(0.5)] }, {}, {}, {}], plan: 'open' });
    }
  }
  gb.pop();
  // tier hints: special POIs get better loot
  const bonus = b.kind === 'store' && (b.shopCat === 'guns') ? 1 : 0;
  for (const l of ctx.rt.loot) l.tier += bonus;
  return ctx.rt;
}

// Cheap far LOD: shell box + roof prism
export function farBuilding(b, gb) {
  const st = b.style || {};
  const H = { townhouse: 3.5 * (b.floors || 2), shop: 3.3 * (b.floors || 2), house: 3 * (b.floors || 1), farmhouse: 6, barn: 6, warehouse: 7, bigbox: 7, church: 6.5, cathedral: 12, store: 3.6, gas: 3.6, diner: 3.6, school: 3.6, motel: 3, millhall: 6, fairbarn: 5, cabin: 2.9, shack: 2.7, shed: 2.6, garage: 3, boathouse: 3.5 }[b.kind] ?? 3;
  const wallC = st.wall ?? { barn: 0xa3302a, warehouse: 0x8a949a, bigbox: 0xd4cdbf, church: 0xf6f3ea, cathedral: 0xf3efe6, cabin: 0x9a6a42, school: 0xb8735a, motel: 0xe8dcc0, fairbarn: 0xf4f1ea }[b.kind] ?? 0xd8d0c0;
  const roofC = st.roof ?? { barn: 0x5a5f66, warehouse: 0x7a8088, fairbarn: 0xa3302a, motel: 0x7a3b2e }[b.kind] ?? 0x4a4f57;
  const flat = ['townhouse', 'shop', 'store', 'gas', 'diner', 'bigbox', 'school'].includes(b.kind);
  gb.push();
  gb.translate(b.x, b.y, b.z);
  gb.rotateY(b.rot);
  gb.setColor(wallC).setLayer(TEX.WHITE);
  gb.box(0, H / 2 + 0.15, 0, b.w, H + 0.3, b.d, 0.1, 8);
  // window band hint
  gb.setColor(0x55606a).setLayer(TEX.WINDOW);
  gb.box(0, H * 0.55, 0, b.w + 0.04, Math.min(1.2, H * 0.3), b.d + 0.04, 0.1, 4 | 8);
  gb.setColor(roofC).setLayer(TEX.SHINGLE);
  if (flat) gb.box(0, H + 0.45, 0, b.w + 0.2, 0.3, b.d + 0.2, 0.1, 8);
  else {
    const ridgeZ = ['barn', 'warehouse', 'church', 'cathedral', 'motel', 'millhall', 'fairbarn'].includes(b.kind);
    const W = ridgeZ ? b.d : b.w, D = ridgeZ ? b.w : b.d;
    const rise = D / 2 * (b.kind === 'barn' ? 0.9 : 0.6);
    gb.push();
    if (ridgeZ) gb.rotateY(Math.PI / 2);
    const y = H + 0.3;
    gb.quad([-W / 2 - 0.3, y, D / 2 + 0.3], [W / 2 + 0.3, y, D / 2 + 0.3], [W / 2 + 0.3, y + rise, 0], [-W / 2 - 0.3, y + rise, 0]);
    gb.quad([W / 2 + 0.3, y, -D / 2 - 0.3], [-W / 2 - 0.3, y, -D / 2 - 0.3], [-W / 2 - 0.3, y + rise, 0], [W / 2 + 0.3, y + rise, 0]);
    gb.setColor(wallC).setLayer(TEX.WHITE);
    gb.tri([W / 2, y, D / 2], [W / 2, y, -D / 2], [W / 2, y + rise, 0]);
    gb.tri([-W / 2, y, -D / 2], [-W / 2, y, D / 2], [-W / 2, y + rise, 0]);
    gb.pop();
  }
  if (b.kind === 'cathedral') {
    gb.setColor(0xf3efe6);
    for (const sx of [0, -11, 11]) gb.box(sx, 10, b.d / 2 - 2, 4.5, 20 + (sx === 0 ? 8 : 0), 4.5, 0.1);
    gb.setColor(0x26292d);
    for (const sx of [0, -11, 11]) { gb.push(); gb.translate(sx, sx === 0 ? 28 : 20, b.d / 2 - 2); gb.cylinder(0, 0, 0, 0.05, 2.8, sx === 0 ? 12 : 8.5, 4); gb.pop(); }
  }
  if (b.kind === 'church') { gb.setColor(0xf6f3ea); gb.box(0, 9, b.d / 2 - 1.5, 3.2, 12, 3.2, 0.1); gb.setColor(0x3a3f46); gb.push(); gb.translate(0, 14.1, b.d / 2 - 1.5); gb.cylinder(0, 0, 0, 0.05, 2, 7.5, 4); gb.pop(); }
  gb.pop();
}
