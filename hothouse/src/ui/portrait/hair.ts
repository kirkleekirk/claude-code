import { HAIR_STYLES } from '@/content/appearance';
import { mirrored, smoothClosed, smoothOpen, type FaceShape, type Pt } from './geometry';

/**
 * Hairstyles and hats for portraits. Each style is a recipe over three generators (cap, sides,
 * back) plus an optional extra flourish, so all 40 share one drawing language.
 */

export interface HairLayers {
  /** Behind head and shoulders (long hair, afro mass, ponytail). */
  back: string[];
  /** Over the head. */
  front: string[];
  /** Thin strokes over the hair (parts, waves). */
  detail: string[];
  /** Thin strokes on the back hair (braid plaits), hidden by the head and shoulders like the hair itself. */
  backDetail: string[];
  /** Darker hair texture (shaved sides, buzz). */
  shade: string[];
  /** Hat shapes with their own fills, drawn last. */
  hat: Array<{ d: string; fill: string; opacity?: number; stroke?: string }>;
  /** True when the scalp shows (bald) and should get a highlight. */
  bald: boolean;
}

type Extra =
  | 'buzz' | 'pompadour' | 'curls' | 'afro' | 'twists' | 'locs' | 'braids' | 'cornrows' | 'waves' | 'pony' | 'bun'
  | 'topKnot' | 'spaceBuns' | 'mullet' | 'mohawk' | 'slick' | 'shag' | 'undercut' | 'fingerWaves' | 'shavedSides'
  | 'bangs' | 'halfUp' | 'none';

interface Recipe {
  vol: number;
  line: number;
  part: number;
  side: number;
  back: number;
  extra: Extra;
}

const R = (vol: number, line: number, part: number, side: number, back: number, extra: Extra = 'none'): Recipe => ({ vol, line, part, side, back, extra });

/** Recipes for the 30 hair styles, in `HAIR_STYLES` order. */
const RECIPES: readonly Recipe[] = [
  R(0.0, 74, 0, 0, 0, 'buzz'),
  R(0.15, 76, 0, 4, 0),
  R(0.3, 74, -14, 6, 0),
  R(0.35, 74, 6, 2, 0, 'pompadour'),
  R(0.45, 73, 0, 2, 0, 'curls'),
  R(0.9, 72, 0, 30, 0, 'afro'),
  R(0.5, 73, 0, 22, 0, 'twists'),
  R(0.4, 74, 0, 36, 0.85, 'locs'),
  R(0.35, 72, 0, 40, 0.95, 'braids'),
  R(0.05, 72, 0, 2, 0, 'cornrows'),
  R(0.35, 80, 8, 54, 0.15),
  R(0.2, 82, 12, 10, 0),
  R(0.3, 76, 0, 112, 1),
  R(0.5, 76, -8, 100, 0.92, 'waves'),
  R(0.22, 74, 0, 4, 0, 'pony'),
  R(0.25, 75, 0, 8, 0, 'bun'),
  R(0.2, 74, 0, 4, 0, 'topKnot'),
  R(0.25, 76, 0, 8, 0, 'spaceBuns'),
  R(0.3, 76, 0, 10, 0.55, 'mullet'),
  R(0.0, 74, 0, 0, 0, 'mohawk'),
  R(0.15, 70, 0, 4, 0, 'slick'),
  R(0.55, 84, 4, 62, 0.5, 'shag'),
  R(0.3, 72, -10, 6, 0),
  R(0.7, 76, 0, 70, 0.6, 'curls'),
  R(0.35, 72, -8, 0, 0, 'undercut'),
  R(0.15, 76, -12, 14, 0, 'fingerWaves'),
  R(0, 0, 0, 0, 0, 'none'),
  R(0.25, 74, -6, 0, 0, 'shavedSides'),
  R(0.35, 93, 0, 92, 0.8, 'bangs'),
  R(0.4, 76, 0, 100, 0.9, 'halfUp'),
];

/** Short hair under hats. */
const UNDER_HAT = R(0.08, 80, 0, 8, 0);

function cap(f: FaceShape, b: number, r: Recipe): string {
  const T = f.temple * b;
  const v = r.vol;
  const side = r.side;
  const sideW = side > 40 ? f.cheek * b + 6 + v * 16 : T + 3 + v * 8;
  const bottom = 98 + Math.min(side, 130);
  const outer: Pt[] = [
    [100 + sideW + Math.min(side, 60) * 0.06, bottom],
    [100 + T + 5 + v * 15, 82],
    [100 + T * 0.78 + v * 14, f.top + 7 - v * 10],
    [100 + r.part * 0.3, f.top - 5 - v * 21],
    [100 - T * 0.78 - v * 14, f.top + 7 - v * 10],
    [100 - T - 5 - v * 15, 82],
    [100 - sideW - Math.min(side, 60) * 0.06, bottom],
  ];
  const innerBottom = 98 + Math.min(side, 130) * 0.62;
  const inner: Pt[] = [
    [100 - (side > 40 ? f.cheek * b - 4 : T - 3), Math.max(innerBottom, 96)],
    [100 - T + 1.5, 86],
    [100 - 25, r.line + 6 - r.part * 0.25],
    [100 + r.part, r.line - 1],
    [100 + 25, r.line + 6 + r.part * 0.25],
    [100 + T - 1.5, 86],
    [100 + (side > 40 ? f.cheek * b - 4 : T - 3), Math.max(innerBottom, 96)],
  ];
  return smoothClosed([...outer, ...inner], 0.9);
}

function backMass(f: FaceShape, b: number, r: Recipe, widen = 1): string {
  const len = 150 + r.back * 92;
  const w = (f.cheek * b + 10 + r.vol * 18) * widen;
  const right: Pt[] = [
    [100, f.top - 4 - r.vol * 18],
    [100 + w * 0.92, 92],
    [100 + w + 4, 150],
    [100 + w + 10, Math.min(len, 236)],
    [100 + w * 0.5, Math.min(len + 6, 244)],
    [100, Math.min(len + 8, 246)],
  ];
  return smoothClosed(mirrored(right), 1);
}

function circle(cx: number, cy: number, rad: number): string {
  return `M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${rad * 2} 0a${rad} ${rad} 0 1 0 ${-rad * 2} 0Z`;
}

function strands(x0: number, x1: number, y0: number, y1: number, count: number, width: number, wiggle: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / count;
    const pts: Pt[] = [];
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const y = y0 + ((y1 - y0) * s) / steps;
      pts.push([x + Math.sin(s * 1.7 + i) * wiggle, y]);
    }
    const left = pts.map(([px, py]) => [px - width / 2, py] as Pt);
    const right = [...pts].reverse().map(([px, py]) => [px + width / 2, py] as Pt);
    out.push(smoothClosed([...left, ...right], 0.8));
  }
  return out;
}

function addExtra(L: HairLayers, f: FaceShape, b: number, r: Recipe): void {
  const T = f.temple * b;
  const top = f.top;
  switch (r.extra) {
    case 'buzz':
      L.shade.push(cap(f, b, { ...r, vol: 0.02 }));
      L.front.length = 0;
      break;
    case 'pompadour':
      L.front.push(smoothClosed([[100 - T * 0.8, top + 22], [100 - T * 0.6, top - 14], [100 + 4, top - 26], [100 + T * 0.75, top - 10], [100 + T * 0.62, top + 14], [100 + 6, top + 6]], 1));
      L.detail.push(smoothOpen([[100 - 20, top + 6], [100 + 2, top - 14], [100 + 26, top - 6]]));
      break;
    case 'curls': {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.08 + (0.84 * i) / (n - 1));
        const rx = T + 6 + r.vol * 12;
        L.front.push(circle(100 - Math.cos(a) * rx, 86 - Math.sin(a) * (86 - top + 10 + r.vol * 16), 9 + r.vol * 5));
      }
      break;
    }
    case 'afro':
      L.back.push(circle(100, 92, 76));
      L.detail.push(smoothOpen([[52, 70], [70, 40], [100, 30], [130, 40], [148, 70]]));
      break;
    case 'twists':
      for (const s of strands(100 - T - 10, 100 + T + 10, top - 6, 98, 10, 9, 2.4)) L.front.push(s);
      break;
    case 'locs':
      for (const s of strands(100 - f.cheek * b - 12, 100 + f.cheek * b + 12, 96, 230, 9, 10, 2)) L.back.push(s);
      break;
    case 'braids': {
      const x0 = 100 - f.cheek * b - 14;
      const x1 = 100 + f.cheek * b + 14;
      const n = 11;
      for (const s of strands(x0, x1, 96, 238, n, 8, 0.8)) L.back.push(s);
      // A plait mark on every strand, alternating direction like a three-strand braid.
      for (let i = 0; i < n; i++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
        for (let y = 104, k = 0; y < 232; y += 9, k++) L.backDetail.push(`M${x - 3} ${y + (k % 2 ? 3 : 0)}l6 ${k % 2 ? -3 : 3}`);
      }
      break;
    }
    case 'cornrows':
      for (let i = -3; i <= 3; i++) L.detail.push(smoothOpen([[100 + i * 8.5, r.line + 1], [100 + i * 8, top + 12], [100 + i * 6.5, top + 2]]));
      break;
    case 'waves': {
      // One long sinuous line down each side: short zigzags read as UI chevrons.
      const x = f.cheek * b + 9;
      for (const side of [-1, 1]) {
        const pts: Pt[] = [];
        for (let k = 0, y = 122; y <= 214; k++, y += 9) pts.push([100 + side * (x + Math.sin(k * 1.25) * 3), y]);
        L.detail.push(smoothOpen(pts));
      }
      break;
    }
    case 'pony':
      L.back.push(smoothClosed([[100 + T * 0.5, top + 4], [100 + T + 26, top + 2], [100 + T + 34, 120], [100 + T + 22, 168], [100 + T + 8, 120], [100 + T * 0.7, top + 30]], 1));
      L.front.push(circle(100 + T * 0.62, top + 8, 7));
      break;
    case 'bun':
      L.back.push(circle(100, top + 4, 17));
      break;
    case 'topKnot':
      L.front.push(circle(100, top - 14, 15));
      L.detail.push(smoothOpen([[88, top - 6], [100, top - 2], [112, top - 6]]));
      break;
    case 'spaceBuns':
      L.front.push(circle(100 - T * 0.72, top - 6, 15));
      L.front.push(circle(100 + T * 0.72, top - 6, 15));
      break;
    case 'mullet':
      L.back.push(smoothClosed(mirrored([[100, 100], [100 + T + 8, 104], [100 + T + 14, 170], [100 + T * 0.6, 196], [100, 198]]), 1));
      break;
    case 'mohawk':
      L.front.length = 0;
      L.shade.push(cap(f, b, { ...r, vol: 0.02, side: 0 }));
      L.front.push(smoothClosed([[100 - 9, r.line + 4], [100 - 13, top + 10], [100 - 9, top - 26], [100, top - 34], [100 + 9, top - 26], [100 + 13, top + 10], [100 + 9, r.line + 4]], 1));
      break;
    case 'slick':
      for (let i = -2; i <= 2; i++) L.detail.push(smoothOpen([[100 + i * 13, r.line + 4], [100 + i * 14, top + 10], [100 + i * 10, top - 2]]));
      break;
    case 'shag':
      L.front.push(smoothClosed([[100 - T - 2, 86], [100 - 30, 92], [100 - 14, 86], [100, 94], [100 + 14, 86], [100 + 30, 92], [100 + T + 2, 86], [100 + T * 0.7, top + 12], [100 - T * 0.7, top + 12]], 0.7));
      break;
    case 'undercut':
      L.shade.push(cap(f, b, { ...r, vol: 0.02, side: 6, line: 80 }));
      break;
    case 'fingerWaves':
      for (let i = 0; i < 3; i++) L.detail.push(smoothOpen([[100 - T, 70 - i * 9], [100 - 16, 62 - i * 9], [100 + 4, 70 - i * 9], [100 + 24, 62 - i * 9], [100 + T, 70 - i * 9]]));
      break;
    case 'shavedSides':
      L.shade.push(cap(f, b, { ...r, vol: 0.02, side: 6, line: 82 }));
      break;
    case 'bangs':
      L.front.push(smoothClosed([[100 - T - 3, 96], [100 - T, top + 16], [100, top + 4], [100 + T, top + 16], [100 + T + 3, 96], [100 + 20, 92], [100, 94], [100 - 20, 92]], 0.8));
      break;
    case 'halfUp':
      L.front.push(circle(100, top - 10, 13));
      break;
    case 'none':
      break;
  }
}

/** Hat drawings. `c` is the hat colour; `d` a darker band colour. */
function hat(index: number, f: FaceShape, b: number, c: string, dark: string): HairLayers['hat'] {
  const T = f.temple * b;
  const top = f.top;
  const w = T + 8;
  switch (index) {
    case 30: // trucker cap
      return [
        { d: smoothClosed([[100 - w, 84], [100 - w + 2, top + 8], [100, top - 14], [100 + w - 2, top + 8], [100 + w, 84]], 1), fill: c },
        { d: smoothClosed([[100 - w * 0.6, 82], [100 - w * 0.5, top + 2], [100, top - 10], [100 + w * 0.5, top + 2], [100 + w * 0.6, 82]], 1), fill: '#FFF4E3', opacity: 0.9 },
        { d: smoothClosed([[100 - w - 4, 84], [100, 78], [100 + w + 4, 84], [100 + w * 0.8, 94], [100, 98], [100 - w * 0.8, 94]], 1), fill: dark },
      ];
    case 31: // bucket hat
      return [
        { d: smoothClosed([[100 - w + 4, 86], [100 - w + 6, top + 6], [100, top - 10], [100 + w - 6, top + 6], [100 + w - 4, 86]], 1), fill: c },
        { d: smoothClosed([[100 - w - 16, 102], [100 - w + 2, 82], [100, 80], [100 + w - 2, 82], [100 + w + 16, 102], [100, 96]], 1), fill: dark },
      ];
    case 32: // visor
      return [
        { d: smoothClosed([[100 - w, 82], [100, 74], [100 + w, 82], [100 + w, 90], [100, 84], [100 - w, 90]], 1), fill: c },
        { d: smoothClosed([[100 - w * 0.9, 88], [100, 84], [100 + w * 0.9, 88], [100 + w * 0.7, 100], [100, 104], [100 - w * 0.7, 100]], 1), fill: dark, opacity: 0.92 },
      ];
    case 33: // straw fedora
      return [
        { d: smoothClosed([[100 - w * 0.78, 80], [100 - w * 0.7, top + 2], [100 - 8, top - 8], [100, top - 2], [100 + 8, top - 8], [100 + w * 0.7, top + 2], [100 + w * 0.78, 80]], 1), fill: c },
        { d: `M${100 - w * 0.78} 72h${w * 1.56}v8h${-w * 1.56}z`, fill: '#3A2A7A' },
        { d: smoothClosed([[100 - w - 22, 86], [100, 74], [100 + w + 22, 86], [100, 92]], 1), fill: c },
      ];
    case 34: // sun hat
      return [
        { d: smoothClosed([[100 - w * 0.8, 80], [100 - w * 0.7, top], [100, top - 12], [100 + w * 0.7, top], [100 + w * 0.8, 80]], 1), fill: c },
        { d: `M${100 - w * 0.8} 74h${w * 1.6}v7h${-w * 1.6}z`, fill: '#FF6B5E' },
        { d: smoothClosed([[100 - w - 46, 92], [100 - w, 76], [100, 72], [100 + w, 76], [100 + w + 46, 92], [100, 98]], 1), fill: c },
      ];
    case 35: // beanie
      return [
        { d: smoothClosed([[100 - w + 1, 90], [100 - w + 2, top + 6], [100, top - 12], [100 + w - 2, top + 6], [100 + w - 1, 90]], 1), fill: c },
        { d: `M${100 - w - 1} 80h${(w + 1) * 2}v13h${-(w + 1) * 2}z`, fill: dark },
      ];
    case 36: // bandana
      return [
        { d: smoothClosed([[100 - w + 2, 86], [100 - w + 4, top + 8], [100, top - 4], [100 + w - 4, top + 8], [100 + w - 2, 86], [100, 78]], 1), fill: c },
        { d: smoothClosed([[100 + w - 4, 80], [100 + w + 14, 74], [100 + w + 18, 90], [100 + w + 4, 92]], 1), fill: dark },
      ];
    case 37: // captain's hat
      return [
        { d: smoothClosed([[100 - w + 2, 80], [100 - w - 8, top + 2], [100, top - 8], [100 + w + 8, top + 2], [100 + w - 2, 80]], 1), fill: c },
        { d: `M${100 - w + 2} 74h${(w - 2) * 2}v8h${-(w - 2) * 2}z`, fill: '#140B33' },
        { d: smoothClosed([[100 - w * 0.8, 82], [100, 80], [100 + w * 0.8, 82], [100 + w * 0.6, 94], [100, 96], [100 - w * 0.6, 94]], 1), fill: '#140B33' },
        { d: circle(100, top + 14, 5.5), fill: '#FFD166' },
      ];
    case 38: // snapback
      return [
        { d: smoothClosed([[100 - w, 84], [100 - w + 2, top + 6], [100, top - 14], [100 + w - 2, top + 6], [100 + w, 84]], 1), fill: c },
        { d: `M${100 - w - 6} 80h${(w + 6) * 2}l-4 9h${-(w + 2) * 2}z`, fill: dark },
        { d: circle(100, top + 1, 2.5), fill: dark },
      ];
    case 39: // headphones
      return [
        { d: smoothOpen([[100 - w - 2, 108], [100 - w + 2, top + 2], [100, top - 12], [100 + w - 2, top + 2], [100 + w + 2, 108]]), fill: 'none', stroke: dark },
        { d: smoothClosed([[100 - w - 10, 100], [100 - w + 4, 96], [100 - w + 4, 130], [100 - w - 10, 126]], 1), fill: c },
        { d: smoothClosed([[100 + w + 10, 100], [100 + w - 4, 96], [100 + w - 4, 130], [100 + w + 10, 126]], 1), fill: c },
      ];
    default:
      return [];
  }
}

export function hairLayers(styleIndex: number, f: FaceShape, breadth: number): HairLayers {
  const L: HairLayers = { back: [], front: [], detail: [], backDetail: [], shade: [], hat: [], bald: false };
  const style = HAIR_STYLES[styleIndex] ?? HAIR_STYLES[1]!;
  if (style.kind === 'bald') {
    L.bald = true;
    return L;
  }
  const recipe = style.kind === 'hat' ? UNDER_HAT : RECIPES[styleIndex] ?? RECIPES[1]!;
  if (recipe.back > 0) L.back.push(backMass(f, breadth, recipe));
  L.front.push(cap(f, breadth, recipe));
  addExtra(L, f, breadth, recipe);
  if (style.kind === 'hat') {
    const c = style.hatColor ?? '#FF6B5E';
    L.hat = hat(styleIndex, f, breadth, c, shade(c));
  }
  return L;
}

function shade(hex: string): string {
  const p = parseInt(hex.slice(1), 16);
  const k = (s: number) => Math.round(((p >> s) & 255) * 0.62 + 20 * 0.38);
  return `#${((1 << 24) | (k(16) << 16) | (k(8) << 8) | k(0)).toString(16).slice(1)}`;
}
