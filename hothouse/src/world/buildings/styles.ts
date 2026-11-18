import { Vector3 } from 'three';
import { clamp } from '@/core/math';
import { Rng } from '@/core/rng';
import { SurfFlag, WinStyle, type MeshBuilder } from '@/render/geo/MeshBuilder';
import type { Poly } from '../geom';
import {
  awning, facade, ledge, neonLine, outward, parapetRoof, rectFootprint, roofClutter, roundedRect, slab, toWorld,
  type Band, type SignRequest,
} from './kit';
import {
  aptPalette, BILLBOARDS, BLADE_NAMES, decoPalette, HOTEL_NAMES, medPalette, PARAPET_WORDS, SHOP_NAMES, shackPalette, towerPalette,
} from './palettes';

export type BuildingStyle = 'decoHotel' | 'decoSmall' | 'medRevival' | 'motel' | 'shack' | 'shopRow' | 'tower' | 'apartment';

export interface BuildingSpec {
  style: BuildingStyle;
  /** Local footprint: width along the street, depth into the lot. */
  w: number;
  d: number;
  floors: number;
  seed: number;
  /** Which front corner faces a street corner. */
  corner: 'left' | 'right' | null;
  /** World placement of the local frame (front centre, facing −Z local). */
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface LocalBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface BuildingResult {
  boxes: LocalBox[];
  signs: SignRequest[];
  height: number;
  name: string;
}

const FLOOR = 3.3;

interface Ctx {
  b: MeshBuilder;
  s: BuildingSpec;
  rng: Rng;
  out: BuildingResult;
}

export function buildBuilding(b: MeshBuilder, spec: BuildingSpec): BuildingResult {
  const rng = new Rng(spec.seed);
  const out: BuildingResult = { boxes: [], signs: [], height: 0, name: '' };
  b.pushTRS(spec.x, spec.y, spec.z, spec.yaw);
  const ctx: Ctx = { b, s: spec, rng, out };
  switch (spec.style) {
    case 'decoHotel': decoHotel(ctx, true); break;
    case 'decoSmall': decoHotel(ctx, false); break;
    case 'medRevival': medRevival(ctx); break;
    case 'motel': motel(ctx); break;
    case 'shack': shack(ctx); break;
    case 'shopRow': shopRow(ctx); break;
    case 'tower': tower(ctx); break;
    case 'apartment': apartment(ctx); break;
  }
  b.pop();
  b.noWindows();
  return out;
}

function sign(ctx: Ctx, req: Omit<SignRequest, 'position' | 'yaw' | 'seed'> & { x: number; y: number; z: number; yawLocal?: number }): void {
  const p = toWorld(ctx.b, req.x, req.y, req.z);
  ctx.out.signs.push({
    text: req.text, kind: req.kind, font: req.font, color: req.color, accent: req.accent, width: req.width, height: req.height,
    ...(req.vertical ? { vertical: true } : {}),
    position: p, yaw: ctx.s.yaw + (req.yawLocal ?? 0), seed: ctx.rng.int(0, 1 << 30),
  });
}

function box(ctx: Ctx, w: number, h: number, d: number, z0 = 0, x = 0, y0 = 0): void {
  ctx.out.boxes.push({ cx: x, cy: y0 + h / 2, cz: z0 + d / 2, hx: w / 2, hy: h / 2, hz: d / 2 });
  ctx.out.height = Math.max(ctx.out.height, y0 + h);
}

// ── Streamline Deco hotel ───────────────────────────────────────────────────

function decoHotel(ctx: Ctx, grand: boolean): void {
  const { b, s, rng } = ctx;
  const pal = decoPalette(rng);
  const W = s.w, D = s.d;
  const ground = grand ? 4.4 : 3.8;
  const floors = Math.max(2, s.floors);
  const top = ground + (floors - 1) * FLOOR;
  const R = s.corner ? clamp(W * 0.2, 3, 6.5) : 0;
  const poly = roundedRect(W, D, [s.corner === 'right' ? R : 0, s.corner === 'left' ? R : 0, 0, 0]);
  const band = rng.chance(grand ? 0.62 : 0.5) ? WinStyle.BAND : rng.chance(0.3) ? WinStyle.PORTHOLE : WinStyle.PUNCHED;
  const cellW = band === WinStyle.BAND ? 3.2 : band === WinStyle.PORTHOLE ? 2.4 : rng.range(2.6, 3.1);
  const name = rng.pick(HOTEL_NAMES);
  ctx.out.name = name;

  // Plinth, storefront floor, upper floors.
  b.surface(pal.accent, 0.8, 0, 0, SurfFlag.WET);
  facade(b, poly, [{ y0: 0, y1: 0.55 }]);
  b.surface(pal.wall, 0.88, 0, 0, SurfFlag.WET);
  facade(b, poly, [
    { y0: 0.55, y1: ground, win: [3.8, ground - 0.55, WinStyle.STOREFRONT, s.seed % 997] },
    { y0: ground, y1: top, win: [cellW, FLOOR, band, s.seed % 991] },
  ]);
  // Eyebrows over every window band and a deeper cornice over the shopfronts.
  b.surface(pal.trim, 0.7, 0, 0, SurfFlag.WET);
  ledge(b, poly, ground - 0.05, 0.9, 0.18);
  for (let k = 1; k < floors; k++) ledge(b, poly, ground + (k - 1) * FLOOR + FLOOR * 0.84, 0.48, 0.1);
  // Speed lines near the top.
  for (let k = 0; k < 3; k++) ledge(b, poly, top - 0.45 - k * 0.28, 0.07, 0.06);
  parapetRoof(b, poly, top, 1.1, pal.roof, pal.wall);
  if (rng.chance(0.5)) {
    b.surface(pal.trim, 0.7, 0, 0, SurfFlag.WET);
    ledge(b, poly, top + 1.1, 0.12, 0.12);
  }

  // Central fin with a blade sign, or a stepped crown.
  const hasFin = grand && W > 16;
  const finW = clamp(W * 0.12, 1.6, 2.6);
  const finTop = top + rng.range(3, 6.5);
  if (hasFin) {
    const finPoly: Poly = [[finW / 2, -0.9], [-finW / 2, -0.9], [-finW / 2, 0.6], [finW / 2, 0.6]];
    b.surface(pal.trim, 0.75, 0, 0, SurfFlag.WET);
    slab(b, finPoly, ground, finTop);
    // Stepped cap.
    b.surface(pal.accent, 0.7, 0, 0, SurfFlag.WET);
    slab(b, [[finW / 2 - 0.2, -0.7], [-finW / 2 + 0.2, -0.7], [-finW / 2 + 0.2, 0.4], [finW / 2 - 0.2, 0.4]], finTop, finTop + 0.8);
    slab(b, [[0.25, -0.45], [-0.25, -0.45], [-0.25, 0.15], [0.25, 0.15]], finTop + 0.8, finTop + 2.4);
    neonLine(b, finW / 2 + 0.03, ground + 0.4, -0.93, finW / 2 + 0.03, finTop - 0.2, -0.93, pal.neon);
    neonLine(b, -finW / 2 - 0.03, ground + 0.4, -0.93, -finW / 2 - 0.03, finTop - 0.2, -0.93, pal.neon);
    const blade = rng.pick(BLADE_NAMES);
    sign(ctx, {
      text: blade, kind: 'blade', font: 'deco', color: pal.neon, accent: pal.trim, vertical: true,
      x: 0, y: (ground + finTop) / 2 + 0.3, z: -0.95, width: finW * 0.82, height: Math.min(finTop - ground - 1.5, blade.length * 1.25),
    });
  } else {
    b.surface(pal.trim, 0.75, 0, 0, SurfFlag.WET);
    const w1 = clamp(W * 0.36, 4, 10);
    slab(b, rectFootprint(w1, 1.6, 0.05), top + 1.1, top + 1.9);
    slab(b, rectFootprint(w1 * 0.6, 1.2, 0.2), top + 1.9, top + 2.6);
  }
  // Name in neon script on the parapet (offset when the fin owns the centre).
  const nameW = Math.min(W * (hasFin ? 0.36 : 0.62), name.length * 0.75);
  const nameX = hasFin ? (rng.chance(0.5) ? 1 : -1) * (W / 4 + finW / 4) : 0;
  sign(ctx, {
    text: hasFin ? rng.pick(PARAPET_WORDS) : name, kind: 'neon', font: hasFin ? 'deco' : 'script', color: pal.neon, accent: pal.trim,
    x: nameX, y: top + 0.56, z: -0.12, width: nameW, height: 1.0,
  });

  // Entrance canopy with neon underglow, chrome posts, and awnings either side.
  const cw = Math.min(6.5, W * 0.35);
  b.surface(pal.trim, 0.6, 0.1, 0, SurfFlag.WET);
  slab(b, [[cw / 2, -3.4], [-cw / 2, -3.4], [-cw / 2, 0.1], [cw / 2, 0.1]], 3.3, 3.55, true);
  neonLine(b, -cw / 2 + 0.2, 3.27, -3.3, cw / 2 - 0.2, 3.27, -3.3, pal.neon, 6);
  b.surface('#E8EBEF', 0.25, 0.9, 0, SurfFlag.WET);
  b.cylinder(cw / 2 - 0.25, 0, -3.15, 0.07, 0.07, 3.3, 8, false);
  b.cylinder(-cw / 2 + 0.25, 0, -3.15, 0.07, 0.07, 3.3, 8, false);
  if (W > 14) {
    const spanL = W / 2 - cw / 2 - 1.2;
    if (spanL > 2.5) {
      awning(b, cw / 2 + 0.6, cw / 2 + 0.6 + spanL, ground - 0.7, 1.7, 0.8, pal.awning);
      awning(b, -cw / 2 - 0.6 - spanL, -cw / 2 - 0.6, ground - 0.7, 1.7, 0.8, pal.awning);
    }
  }
  // Neon trim on the cornice for the grand ones.
  if (grand && rng.chance(0.65)) neonLine(b, -W / 2 + 0.6, ground + 0.16, -0.93, W / 2 - 0.6, ground + 0.16, -0.93, pal.neon, 5);

  // Rooftop: pool deck on the big ones, clutter on the rest.
  if (grand && W > 22 && D > 18 && rng.chance(0.45)) rooftopPool(b, W, D, top, rng);
  else roofClutter(b, W - 2, D - 2, top, rng, 1);
  box(ctx, W, top + 1.1, D);
}

function rooftopPool(b: MeshBuilder, W: number, D: number, top: number, rng: Rng): void {
  const pw = Math.min(W * 0.45, 12), pd = Math.min(D * 0.35, 6);
  const cz = D * 0.55;
  b.surface('#E9E2D8', 0.85, 0, 0, SurfFlag.WET).windows(0.9, 0.9, WinStyle.PAVERS, 3);
  slab(b, rectFootprint(pw + 4, pd + 4, cz - (pd + 4) / 2), top, top + 0.25);
  b.surface('#3FD8E0', 0.08, 0, 0.25, SurfFlag.NIGHT).windows(0.25, 0.25, WinStyle.POOL, 5);
  b.cap(outward(rectFootprint(pw, pd, cz - pd / 2)), top + 0.2, 1);
  b.noWindows();
  // Loungers and umbrellas.
  for (let i = 0; i < 4; i++) {
    const x = -pw / 2 + (i + 0.5) * (pw / 4);
    b.surface('#FFFFFF', 0.7, 0, 0, SurfFlag.WET);
    b.boxOn(x, top + 0.25, cz - pd / 2 - 1.3, 0.7, 0.35, 1.8);
    if (i % 2 === 0) {
      b.surface('#B9BEC4', 0.4, 0.8, 0, 0);
      b.cylinder(x + 0.6, top + 0.25, cz - pd / 2 - 1.6, 0.04, 0.04, 2.2, 6, false);
      b.surface(rng.pick(['#FF6B5E', '#17B8A8', '#FFD166', '#FF8FB1']), 0.9, 0, 0, SurfFlag.WET);
      b.cylinder(x + 0.6, top + 2.25, cz - pd / 2 - 1.6, 1.3, 0.05, 0.45, 10, true);
    }
  }
}

// ── Mediterranean Revival ───────────────────────────────────────────────────

function medRevival(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = medPalette(rng);
  const W = s.w, D = s.d;
  const floors = clamp(s.floors, 2, 4);
  const ground = 3.8;
  const top = ground + (floors - 1) * FLOOR;
  const poly = rectFootprint(W, D);
  ctx.out.name = rng.pick(HOTEL_NAMES);
  b.surface(pal.wall, 0.9, 0, 0, SurfFlag.WET);
  facade(b, outward(poly), [
    { y0: 0, y1: ground, win: [3.6, ground, rng.chance(0.5) ? WinStyle.ARCHED : WinStyle.STOREFRONT, s.seed % 977] },
    { y0: ground, y1: top, win: [3.0, FLOOR, WinStyle.ARCHED, s.seed % 971] },
  ]);
  b.surface(pal.trim, 0.8, 0, 0, SurfFlag.WET);
  ledge(b, poly, ground - 0.05, 0.25, 0.22);
  hipRoof(b, 0, D / 2, W / 2 + 0.7, D / 2 + 0.7, top, 0.46, pal.roof, pal.trim);
  // Wrought-iron balconies on the front.
  const cols = Math.floor((W - 2.4) / 3.0);
  const used = cols * 3.0;
  for (let f = 1; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if ((c + f) % 2 !== 0 || !rng.chance(0.75)) continue;
      const x = -used / 2 + (c + 0.5) * 3.0;
      const y = ground + (f - 1) * FLOOR + 0.55;
      b.surface(pal.trim, 0.8, 0, 0, SurfFlag.WET);
      b.box(x, y - 0.1, -0.45, 1.7, 0.2, 0.9);
      balconyRail(b, x, y, 1.7, 0.9, '#2A2730');
    }
  }
  // A corner tower with its own tiled pyramid.
  if (s.corner) {
    const side = s.corner === 'right' ? 1 : -1;
    const tw = Math.min(5.5, W * 0.3);
    const tx = side * (W / 2 - tw / 2);
    const tp = rectFootprint(tw, tw, -0.4).map(([x, z]) => [x + tx, z] as [number, number]);
    const ttop = top + FLOOR;
    b.surface(pal.wall, 0.9, 0, 0, SurfFlag.WET);
    facade(b, outward(tp), [{ y0: top - 0.5, y1: ttop, win: [2.2, FLOOR, WinStyle.ARCHED, s.seed % 13] }]);
    hipRoof(b, tx, tw / 2 - 0.4, tw / 2 + 0.5, tw / 2 + 0.5, ttop, 0.75, pal.roof, pal.trim);
    box(ctx, tw, ttop, tw, -0.4, tx);
  }
  if (rng.chance(0.6)) {
    awning(b, -W / 2 + 1.2, -W / 2 + 1.2 + Math.min(6, W * 0.3), ground - 0.6, 1.4, 0.7, pal.awning);
  }
  sign(ctx, {
    text: ctx.out.name, kind: 'painted', font: 'serif', color: pal.accent, accent: pal.trim,
    x: 0, y: ground - 0.55, z: -0.28, width: Math.min(W * 0.5, ctx.out.name.length * 0.42), height: 0.62,
  });
  box(ctx, W, top, D);
}

function balconyRail(b: MeshBuilder, x: number, y: number, w: number, d: number, color: string): void {
  b.surface(color, 0.5, 0.6, 0, SurfFlag.WET);
  b.box(x, y + 0.95, -d, w, 0.05, 0.05);
  b.box(x - w / 2, y + 0.95, -d / 2, 0.05, 0.05, d);
  b.box(x + w / 2, y + 0.95, -d / 2, 0.05, 0.05, d);
  const n = Math.round(w / 0.14);
  for (let i = 0; i <= n; i++) b.box(x - w / 2 + (i * w) / n, y + 0.47, -d, 0.025, 0.95, 0.025);
}

/** Hip roof over a rectangle centred at (cx, cz) with half-extents (hx, hz) and eaves at y. */
export function hipRoof(b: MeshBuilder, cx: number, cz: number, hx: number, hz: number, y: number, pitch: number, color: string, fascia: string): void {
  const alongX = hx >= hz;
  const h = Math.min(hx, hz) * Math.tan(pitch);
  const r0 = alongX ? new Vector3(cx - (hx - hz), y + h, cz) : new Vector3(cx, y + h, cz - (hz - hx));
  const r1 = alongX ? new Vector3(cx + (hx - hz), y + h, cz) : new Vector3(cx, y + h, cz + (hz - hx));
  const c0 = [cx + hx, y, cz - hz] as const; // front right
  const c1 = [cx - hx, y, cz - hz] as const; // front left
  const c2 = [cx - hx, y, cz + hz] as const; // back left
  const c3 = [cx + hx, y, cz + hz] as const; // back right
  b.surface(color, 0.82, 0, 0, SurfFlag.WET).windows(0.42, 0.34, WinStyle.BARREL_TILE, 21);
  const R0 = [r0.x, r0.y, r0.z] as const, R1 = [r1.x, r1.y, r1.z] as const;
  if (alongX) {
    b.quad(c0, c1, R0, R1);
    b.quad(c2, c3, R1, R0);
    tri(b, c1, c2, R0);
    tri(b, c3, c0, R1);
  } else {
    b.quad(c1, c2, R1, R0);
    b.quad(c3, c0, R0, R1);
    tri(b, c0, c1, R0);
    tri(b, c2, c3, R1);
  }
  // Fascia board around the eaves and a soffit.
  b.surface(fascia, 0.75, 0, 0, SurfFlag.WET).noWindows();
  const ring: Poly = [[cx + hx, cz - hz], [cx - hx, cz - hz], [cx - hx, cz + hz], [cx + hx, cz + hz]];
  facade(b, ring, [{ y0: y - 0.28, y1: y }]);
  b.cap(ring, y - 0.28, -1);
  b.noWindows();
}

function tri(b: MeshBuilder, p0: readonly number[], p1: readonly number[], p2: readonly number[]): void {
  const e1 = new Vector3(p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!);
  const e2 = new Vector3(p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!);
  const n = new Vector3().crossVectors(e1, e2).normalize();
  const l1 = e1.length();
  const u2 = e2.dot(e1) / (l1 || 1);
  const v2 = Math.sqrt(Math.max(0, e2.lengthSq() - u2 * u2));
  const a = b.vertex(p0[0]!, p0[1]!, p0[2]!, n.x, n.y, n.z, 0, 0);
  const c = b.vertex(p1[0]!, p1[1]!, p1[2]!, n.x, n.y, n.z, l1, 0);
  const d = b.vertex(p2[0]!, p2[1]!, p2[2]!, n.x, n.y, n.z, u2, v2);
  b.triangle(a, c, d);
}

// ── Mid-century motel ───────────────────────────────────────────────────────

function motel(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = decoPalette(rng);
  const W = s.w, D = s.d;
  const wing = 9;
  const h = 3.0;
  const top = h * 2;
  const name = rng.pick(['Starlite Motel', 'Sunrise Motor Inn', 'Sea Breeze Motel', 'Pink Pelican Motel', 'Tropic Aire Inn', 'Coral Reef Motel', 'Bel-Air Motor Lodge', 'Lucky Seven Motel']);
  ctx.out.name = name;
  const back: Poly = rectFootprint(W, wing, D - wing);
  const sideX = s.corner === 'left' ? W / 2 - wing / 2 : -W / 2 + wing / 2;
  const sideLen = Math.max(0, D - wing - 7);
  const side: Poly = rectFootprint(wing, sideLen, 7).map(([x, z]) => [x + sideX, z] as [number, number]);
  const motelWin: [number, number, number, number] = [3.8, h, WinStyle.MOTEL, s.seed % 89];
  for (const p of sideLen > 6 ? [back, side] : [back]) {
    b.surface(pal.wall, 0.88, 0, 0, SurfFlag.WET);
    facade(b, outward(p), [
      { y0: 0, y1: h, win: motelWin },
      { y0: h, y1: top, win: motelWin },
    ]);
    // Flat roof with a deep mid-century overhang.
    b.surface(pal.trim, 0.75, 0, 0, SurfFlag.WET);
    slab(b, insetPolyOut(p, 1.2), top, top + 0.35, true);
    // Second-floor walkway and railing on the courtyard side.
    b.surface('#E8E2D8', 0.85, 0, 0, SurfFlag.WET);
    slab(b, insetPolyOut(p, 1.9), h - 0.05, h + 0.12, true);
    const bb = boundsOf(p);
    box(ctx, bb.w, top + 0.35, bb.d, bb.z0, bb.cx);
  }
  // Railing along the back wing's courtyard face.
  b.surface(pal.accent, 0.6, 0.3, 0, SurfFlag.WET);
  b.box(0, h + 1.05, D - wing - 1.85, W - 1, 0.06, 0.06);
  for (let x = -W / 2 + 1; x <= W / 2 - 1; x += 1.6) b.boxOn(x, h + 0.12, D - wing - 1.85, 0.06, 0.95, 0.06);
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 4.8) {
    b.surface('#F2EFEA', 0.7, 0, 0, SurfFlag.WET);
    b.boxOn(x, 0, D - wing - 1.7, 0.22, h, 0.22);
  }
  // Courtyard: parking up front, the pool behind.
  b.surface('#4A454F', 0.86, 0, 0, SurfFlag.WET).windows(2.7, 5.2, WinStyle.PARKING, 3);
  b.cap(outward(rectFootprint(W - 2, Math.max(4, D - wing - 9), 1)), 0.02, 1);
  const poolW = Math.min(10, W * 0.4);
  b.surface('#3FD8E0', 0.06, 0, 0.3, SurfFlag.NIGHT).windows(0.25, 0.25, WinStyle.POOL, 7);
  b.cap(outward(rectFootprint(poolW, 4.5, D - wing - 7)), 0.04, 1);
  b.noWindows();
  // The pole sign at the street corner.
  const sx = s.corner === 'left' ? -W / 2 + 2 : W / 2 - 2;
  b.surface('#E8EBEF', 0.3, 0.85, 0, SurfFlag.WET);
  b.cylinder(sx, 0, -1, 0.18, 0.14, 9.5, 10, true);
  b.surface(pal.accent, 0.6, 0, 0, SurfFlag.WET);
  slab(b, [[sx + 2.1, -1.4], [sx - 2.1, -1.4], [sx - 2.1, -0.6], [sx + 2.1, -0.6]], 6.2, 9.4);
  sign(ctx, { text: name.toUpperCase(), kind: 'marquee', font: 'motel', color: pal.neon, accent: '#FFF4E3', x: sx, y: 7.8, z: -1.42, width: 4.0, height: 2.9 });
  sign(ctx, { text: 'VACANCY', kind: 'neon', font: 'motel', color: rng.pick(['#FF3D8B', '#17E0C8']), accent: '#FFF4E3', x: sx, y: 5.6, z: -1.05, width: 3.0, height: 0.7 });
  box(ctx, 0.5, 9.5, 0.5, -1.25, sx);
}

/** Grow an outward-oriented polygon by d (eaves, walkways). */
function insetPolyOut(p: Poly, d: number): Poly {
  const o = outward(p);
  const xs = o.map((q) => q[0]), zs = o.map((q) => q[1]);
  const x0 = Math.min(...xs) - d, x1 = Math.max(...xs) + d, z0 = Math.min(...zs) - d, z1 = Math.max(...zs) + d;
  return [[x1, z0], [x0, z0], [x0, z1], [x1, z1]];
}

function boundsOf(p: Poly): { cx: number; w: number; d: number; z0: number } {
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { cx: (x0 + x1) / 2, w: x1 - x0, d: z1 - z0, z0 };
}

// ── Beach shack / surf shop ─────────────────────────────────────────────────

function shack(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = shackPalette(rng);
  const W = Math.min(s.w, 14), D = Math.min(s.d, 11);
  const h = 3.5;
  const name = rng.pick(SHOP_NAMES);
  ctx.out.name = name;
  const deck = 2.8;
  const poly = rectFootprint(W, D, deck);
  b.surface(pal.wall, 0.9, 0, 0, SurfFlag.WET);
  facade(b, outward(poly), [{ y0: 0.4, y1: h, win: [2.7, h - 0.4, WinStyle.SHUTTERED, s.seed % 31] }]);
  b.surface(pal.trim, 0.8, 0, 0, SurfFlag.WET);
  facade(b, outward(poly), [{ y0: 0, y1: 0.4 }]);
  // Wood deck with railing out front.
  b.surface('#B08A62', 0.9, 0, 0, SurfFlag.WET).windows(0.16, 0.16, WinStyle.DECK, s.seed % 17);
  slab(b, rectFootprint(W + 1, deck + 0.2, 0), 0, 0.4);
  b.noWindows();
  b.surface('#FFFFFF', 0.8, 0, 0, SurfFlag.WET);
  b.box(0, 1.35, 0.05, W + 1, 0.08, 0.08);
  for (let x = -W / 2 - 0.4; x <= W / 2 + 0.5; x += 1.1) b.boxOn(x, 0.4, 0.05, 0.08, 1.0, 0.08);
  // Gable roof in tin or painted shingles.
  gableRoof(b, W + 0.9, D + 0.8, deck + D / 2, h, 0.42, pal.roof, rng.chance(0.5) ? WinStyle.METAL_ROOF : WinStyle.SHINGLE);
  // Hand-painted board over the door.
  sign(ctx, {
    text: name, kind: 'painted', font: rng.pick(['brush', 'slab', 'retro']), color: pal.trim, accent: pal.accent,
    x: 0, y: h + 0.75, z: deck - 0.35, width: Math.min(W * 0.85, name.length * 0.48 + 1), height: 1.0,
  });
  b.surface(pal.accent, 0.8, 0, 0, SurfFlag.WET);
  slab(b, [[W * 0.45, deck - 0.3], [-W * 0.45, deck - 0.3], [-W * 0.45, deck - 0.12], [W * 0.45, deck - 0.12]], h - 0.1, h + 1.35);
  box(ctx, W, h + 1.5, D, deck);
}

/** Simple gable roof along X over a rectangle centred at (0, cz). */
export function gableRoof(b: MeshBuilder, w: number, d: number, cz: number, y: number, pitch: number, color: string, style: number): void {
  const h = (d / 2) * Math.tan(pitch);
  const x0 = -w / 2, x1 = w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  b.surface(color, 0.6, style === WinStyle.METAL_ROOF ? 0.55 : 0, 0, SurfFlag.WET).windows(style === WinStyle.METAL_ROOF ? 0.6 : 0.9, 0.35, style, 3);
  b.quad([x1, y, z0], [x0, y, z0], [x0, y + h, cz], [x1, y + h, cz]);
  b.quad([x0, y, z1], [x1, y, z1], [x1, y + h, cz], [x0, y + h, cz]);
  b.noWindows();
  b.surface('#F4F0E8', 0.85, 0, 0, SurfFlag.WET);
  tri(b, [x0, y, z0], [x0, y, z1], [x0, y + h, cz]);
  tri(b, [x1, y, z1], [x1, y, z0], [x1, y + h, cz]);
}

// ── Shop row ────────────────────────────────────────────────────────────────

function shopRow(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = rng.chance(0.5) ? decoPalette(rng) : shackPalette(rng);
  const W = s.w, D = Math.min(s.d, 16);
  const floors = clamp(s.floors, 1, 2);
  const ground = 4.2;
  const top = ground + (floors - 1) * FLOOR;
  const poly = rectFootprint(W, D);
  b.surface(pal.wall, 0.88, 0, 0, SurfFlag.WET);
  const bands: Band[] = [{ y0: 0, y1: ground - 1.1, win: [4.0, ground - 1.1, WinStyle.STOREFRONT, s.seed % 59] }, { y0: ground - 1.1, y1: ground }];
  if (floors > 1) bands.push({ y0: ground, y1: top, win: [2.8, FLOOR, WinStyle.PUNCHED, s.seed % 53] });
  facade(b, outward(poly), bands);
  parapetRoof(b, poly, top, 0.9, pal.roof, pal.wall);
  roofClutter(b, W - 2, D - 2, top, rng, 1);
  // One sign and awning per unit.
  const units = Math.max(1, Math.round(W / 8.5));
  const uw = W / units;
  for (let i = 0; i < units; i++) {
    const cx = -W / 2 + (i + 0.5) * uw;
    const name = rng.pick(SHOP_NAMES);
    const kind = rng.chance(0.45) ? 'neon' : 'painted';
    sign(ctx, {
      text: name, kind, font: kind === 'neon' ? rng.pick(['script', 'deco', 'motel']) : rng.pick(['slab', 'retro', 'brush']),
      color: kind === 'neon' ? rng.pick(['#FF3D8B', '#17E0C8', '#FFD166', '#B8F54A', '#A77BFF']) : rng.pick(['#FFF4E3', '#140B33', '#FF6B5E']),
      accent: pal.accent, x: cx, y: ground - 0.55, z: -0.08, width: Math.min(uw * 0.82, name.length * 0.5 + 0.6), height: 0.85,
    });
    if (rng.chance(0.7)) awning(b, cx - uw / 2 + 0.6, cx + uw / 2 - 0.6, ground - 1.25, 1.5, 0.7, rng.pick(['#FF6B5E', '#17B8A8', '#FF8FB1', '#2E86C1', '#F2B33D']));
  }
  box(ctx, W, top + 0.9, D);
}

// ── Glass tower ─────────────────────────────────────────────────────────────

function tower(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = towerPalette(rng);
  const W = s.w, D = s.d;
  const podiumFloors = rng.int(2, 3);
  const podiumTop = 5 + (podiumFloors - 1) * 4;
  const floors = Math.max(8, s.floors);
  const fh = 3.6;
  const inset = clamp(Math.min(W, D) * 0.12, 2, 6);
  const tw = W - inset * 2, td = D - inset * 2;
  const chamfer = rng.chance(0.5) ? Math.min(tw, td) * 0.14 : 0;
  // Podium.
  b.surface(pal.trim, 0.6, 0.2, 0, SurfFlag.WET);
  const pod = rectFootprint(W, D);
  facade(b, outward(pod), [
    { y0: 0, y1: 5, win: [4.2, 5, WinStyle.STOREFRONT, s.seed % 41] },
    { y0: 5, y1: podiumTop, win: [2.0, 4, WinStyle.CURTAIN, s.seed % 43] },
  ]);
  parapetRoof(b, pod, podiumTop, 1.0, '#8E9096', pal.trim);
  // Shaft with a setback two-thirds of the way up.
  const shaftTop = podiumTop + floors * fh;
  const setback = Math.round(floors * rng.range(0.55, 0.72));
  const yMid = podiumTop + setback * fh;
  const shaft = chamferRect(tw, td, inset, chamfer);
  b.surface(pal.wall, 0.15, 0.4, 0, SurfFlag.WET);
  facade(b, shaft, [{ y0: podiumTop, y1: yMid, win: [1.6, fh, WinStyle.CURTAIN, s.seed % 47] }], 0.4);
  const upper = chamferRect(tw - 3, td - 3, inset + 1.5, chamfer * 0.8);
  b.surface(pal.trim, 0.5, 0.3, 0, SurfFlag.WET);
  slab(b, shaft, yMid, yMid + 0.6);
  b.surface(pal.wall, 0.15, 0.4, 0, SurfFlag.WET);
  facade(b, upper, [{ y0: yMid + 0.6, y1: shaftTop, win: [1.6, fh, WinStyle.CURTAIN, s.seed % 53] }], 0.4);
  // Crown: lit fins.
  const crownCol = pal.neon;
  b.surface(pal.trim, 0.4, 0.5, 0, SurfFlag.WET);
  slab(b, upper, shaftTop, shaftTop + 0.8);
  const ux = (tw - 3) / 2, uz0 = inset + 1.5, uz1 = uz0 + td - 3;
  for (let i = 0; i < 7; i++) {
    const x = -ux + 0.6 + (i * (2 * ux - 1.2)) / 6;
    b.surface(crownCol, 0.3, 0, 5.5, SurfFlag.NIGHT);
    b.box(x, shaftTop + 3.2, uz0 - 0.05, 0.22, 4.8, 0.12);
  }
  b.surface(pal.trim, 0.4, 0.6, 0, SurfFlag.WET);
  facade(b, upper, [{ y0: shaftTop + 0.8, y1: shaftTop + 5.6 }]);
  b.cap(outward(upper), shaftTop + 5.6, 1);
  // Antenna and beacon on the tallest.
  if (floors > 22) {
    b.surface('#C9CDD2', 0.4, 0.8, 0, 0);
    b.cylinder(0, shaftTop + 5.6, (uz0 + uz1) / 2, 0.25, 0.08, 14, 8, true);
    b.surface('#FF2E4D', 0.3, 0, 12, SurfFlag.NIGHT);
    b.sphere(0, shaftTop + 19.8, (uz0 + uz1) / 2, 0.35, 8, 6);
  }
  // A billboard on some podiums.
  if (rng.chance(0.45)) {
    const ad = rng.pick(BILLBOARDS);
    sign(ctx, { text: `${ad.text}|${ad.sub}`, kind: 'billboard', font: 'block', color: ad.fg, accent: ad.bg, x: 0, y: podiumTop + 4.5, z: inset - 0.4, width: Math.min(tw * 0.9, 16), height: 6 });
    b.surface('#2B2F3A', 0.6, 0.5, 0, SurfFlag.WET);
    b.box(0, podiumTop + 1.0, inset - 0.6, 0.3, 2.2, 0.3);
  }
  box(ctx, W, podiumTop + 1, D);
  box(ctx, tw, shaftTop + 5.6 - podiumTop, td, inset, 0, podiumTop);
}

/** Rectangle with 45° chamfers, outward oriented, placed with its front at z0. */
function chamferRect(w: number, d: number, z0: number, c: number): Poly {
  const hw = w / 2;
  if (c <= 0.05) return outward(rectFootprint(w, d, z0));
  return outward([
    [hw, z0 + c], [hw - c, z0], [-hw + c, z0], [-hw, z0 + c], [-hw, z0 + d - c], [-hw + c, z0 + d], [hw - c, z0 + d], [hw, z0 + d - c],
  ]);
}

// ── Apartment block ─────────────────────────────────────────────────────────

function apartment(ctx: Ctx): void {
  const { b, s, rng } = ctx;
  const pal = aptPalette(rng);
  const W = s.w, D = Math.min(s.d, 18);
  const floors = clamp(s.floors, 3, 6);
  const fh = 3.0;
  const top = 3.4 + (floors - 1) * fh;
  const poly = rectFootprint(W, D);
  const style = rng.chance(0.5) ? WinStyle.SHUTTERED : WinStyle.PUNCHED;
  b.surface(pal.wall, 0.9, 0, 0, SurfFlag.WET);
  facade(b, outward(poly), [
    { y0: 0, y1: 3.4, win: [3.4, 3.4, WinStyle.PUNCHED, s.seed % 61] },
    { y0: 3.4, y1: top, win: [3.0, fh, style, s.seed % 67] },
  ]);
  parapetRoof(b, poly, top, 0.8, pal.roof, pal.wall);
  // Balconies with glass-and-rail fronts in alternating columns.
  const cols = Math.floor((W - 2.4) / 3.0);
  const used = cols * 3.0;
  for (let f = 1; f < floors; f++) {
    for (let c = 0; c < cols; c += 2) {
      const x = -used / 2 + (c + 0.5) * 3.0;
      const y = 3.4 + (f - 1) * fh;
      b.surface(pal.trim, 0.8, 0, 0, SurfFlag.WET);
      b.box(x, y - 0.08, -0.6, 2.4, 0.16, 1.2);
      balconyRail(b, x, y, 2.4, 1.2, pal.accent);
    }
  }
  roofClutter(b, W - 2, D - 2, top, rng, 1);
  box(ctx, W, top + 0.8, D);
}
