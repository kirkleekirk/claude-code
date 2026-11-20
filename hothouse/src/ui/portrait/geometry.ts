/**
 * Geometry helpers for the illustrated portraits. The canvas is 200 × 240 (a bust); the head is
 * centred at x = 100. Shapes are built from point lists turned into smooth Catmull-Rom curves so
 * every face, hairstyle and garment reads as one consistent, soft flat-vector style.
 */

export type Pt = readonly [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smooth closed path through the points (Catmull-Rom → cubic Bézier). */
export function smoothClosed(pts: readonly Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const t = tension / 6;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Smooth open path through the points. */
export function smoothOpen(pts: readonly Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    const t = tension / 6;
    d += `C${r1(p1[0] + (p2[0] - p0[0]) * t)} ${r1(p1[1] + (p2[1] - p0[1]) * t)} ${r1(p2[0] - (p3[0] - p1[0]) * t)} ${r1(p2[1] - (p3[1] - p1[1]) * t)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** Mirror right-side points (x ≥ 100) to build a symmetric closed outline, top → right → bottom → left. */
export function mirrored(right: readonly Pt[]): Pt[] {
  const left = [...right].reverse().slice(1, -1).map(([x, y]) => [200 - x, y] as Pt);
  return [...right, ...left];
}

export interface FaceShape {
  /** Half-widths at temple, cheekbone, jaw corner and chin; chin and jaw heights. */
  temple: number;
  cheek: number;
  jaw: number;
  chin: number;
  jawY: number;
  chinY: number;
  top: number;
}

/** Six face shapes: oval, round, square, heart, long, diamond. */
export const FACES: readonly FaceShape[] = [
  { temple: 41, cheek: 42, jaw: 33, chin: 14, jawY: 146, chinY: 166, top: 50 },
  { temple: 43, cheek: 45, jaw: 39, chin: 20, jawY: 144, chinY: 161, top: 52 },
  { temple: 42, cheek: 43, jaw: 40, chin: 24, jawY: 150, chinY: 164, top: 51 },
  { temple: 45, cheek: 43, jaw: 30, chin: 11, jawY: 146, chinY: 167, top: 50 },
  { temple: 39, cheek: 40, jaw: 32, chin: 16, jawY: 152, chinY: 172, top: 47 },
  { temple: 37, cheek: 45, jaw: 31, chin: 13, jawY: 147, chinY: 167, top: 51 },
];

/** Head outline for a face shape, widened by `breadth` (1 = neutral). */
export function headOutline(f: FaceShape, breadth = 1): string {
  const w = (v: number) => 100 + v * breadth;
  const right: Pt[] = [
    [100, f.top],
    [w(f.temple * 0.72), f.top + 6],
    [w(f.temple), 84],
    [w(f.cheek), 114],
    [w(f.jaw), f.jawY],
    [w(f.chin), f.chinY - 4],
    [100, f.chinY],
  ];
  return smoothClosed(mirrored(right), 1);
}

/** The jaw region (for beards and stubble): from cheek level down to the chin. */
export function jawOutline(f: FaceShape, breadth = 1, depth = 1): string {
  const w = (v: number) => 100 + v * breadth;
  const lip = 140;
  const right: Pt[] = [
    [100, lip + 6 - 8 * depth],
    [w(f.cheek * 0.55), lip - 6],
    [w(f.cheek * 0.98), 118],
    [w(f.jaw + 2), f.jawY + 1],
    [w(f.chin + 2), f.chinY - 2 + 6 * depth],
    [100, f.chinY + 4 + 8 * depth],
  ];
  return smoothClosed(mirrored(right), 1);
}

/** Linear interpolation between two hex colours, returning hex. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Relative luminance of a hex colour (0–1). */
export function luminance(hex: string): number {
  const p = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((p >> 16) & 255) + 0.7152 * lin((p >> 8) & 255) + 0.0722 * lin(p & 255);
}
