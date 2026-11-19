import { useRef } from 'preact/hooks';
import { BUILDS, HAIR_COLORS, OUTFITS, SKIN_TONES, type Appearance, type Outfit } from '@/content/appearance';
import { hash2 } from '@/core/rng';
import type { Expression } from '../api';
import { FACES, headOutline, jawOutline, luminance, mixHex, smoothClosed, smoothOpen, type FaceShape, type Pt } from './geometry';
import { hairLayers } from './hair';

/**
 * Illustrated portraits from an `Appearance`: flat vector with soft gradients, violet shadows and
 * a sunset rim light, so the cast reads like the rest of the game. Readable at 48 px, rich at 240.
 */

export interface PortraitProps {
  appearance: Appearance;
  expression?: Expression;
  /** CSS size of the longer side. */
  size?: string;
  /** `bust` shows shoulders (5:6); `head` is a square crop for avatars. */
  framing?: 'bust' | 'head';
  shape?: 'circle' | 'rounded' | 'none';
  blink?: boolean;
  /** Seed for the backdrop and small variations; defaults to the appearance itself. */
  seed?: number;
  label?: string;
  class?: string;
}

const BACKDROPS: ReadonlyArray<readonly [string, string]> = [
  ['#FF9A3C', '#FF3D8B'], ['#FF3D8B', '#3A2A7A'], ['#17E0C8', '#1F1450'], ['#FFD166', '#FF6B5E'], ['#B7A1E0', '#3A2A7A'], ['#B8F54A', '#0E7C86'],
];
const IRIS = ['#3B2416', '#5A3A22', '#2E4A3A', '#2C3E66', '#4A3A2A', '#1E1418'];
const VIOLET = '#3B1E7A';
const GOLD = '#FFD166';
let uid = 0;

function appearanceSeed(a: Appearance): number {
  return hash2(a.skin * 31 + a.hair * 7 + a.outfit, a.face * 13 + a.build * 17 + a.hairColor, 4242);
}

// ── face features ────────────────────────────────────────────────────────────

function eyes(a: Appearance, expr: Expression, iris: string, blinkClass: string) {
  const spread = 17 + a.eyes * 5;
  const y = 112;
  const h = expr === 'surprised' ? 8.5 : expr === 'annoyed' ? 5 : expr === 'smug' ? 4.6 : expr === 'happy' ? 5.6 : 6.4;
  const w = 12.5;
  const out = [];
  for (const side of [-1, 1]) {
    const cx = 100 + side * spread;
    const top: Pt[] = [[cx - w / 2, y], [cx - w * 0.2, y - h * 0.95], [cx + w * 0.25, y - h], [cx + w / 2, y - h * 0.15]];
    const bottom: Pt[] = [[cx + w / 2, y - h * 0.15], [cx + w * 0.15, y + h * 0.55], [cx - w * 0.3, y + h * 0.45]];
    const d = smoothClosed([...top, ...bottom], 0.9);
    const lid = smoothOpen([[cx - w / 2 - 1.5, y + 0.5], [cx - w * 0.15, y - h - 1.2], [cx + w / 2 + 1, y - h * 0.3]]);
    out.push(
      <g key={side} class={blinkClass} style={{ transformOrigin: `${cx}px ${y - h * 0.3}px` }}>
        <path d={d} fill="#FFF8EE" />
        <circle cx={cx + side * 0.6} cy={y - h * 0.3} r={Math.min(4.6, h * 0.62 + 1)} fill={iris} />
        <circle cx={cx + side * 0.6} cy={y - h * 0.3} r={Math.min(2.3, h * 0.32 + 0.6)} fill="#140B1E" />
        <circle cx={cx + side * 0.6 + 1.6} cy={y - h * 0.3 - 1.6} r="1.3" fill="#fff" />
        <path d={lid} fill="none" stroke="#2A1626" stroke-width="2.4" stroke-linecap="round" />
        {expr === 'smug' && <path d={smoothOpen([[cx - w / 2, y - h * 0.4], [cx, y - h * 0.62], [cx + w / 2, y - h * 0.35]])} fill="none" stroke="#2A1626" stroke-opacity=".35" stroke-width="1.6" />}
      </g>,
    );
  }
  return out;
}

function brows(a: Appearance, expr: Expression, color: string) {
  const spread = 17 + a.eyes * 5;
  const y = 98;
  const weight = 2.6 + a.brow * 3.2;
  const tilt: Record<Expression, number> = { neutral: 0, happy: -1.5, annoyed: 4.5, surprised: -4, smug: 1.5, worried: -4.5 };
  const lift: Record<Expression, number> = { neutral: 0, happy: -2, annoyed: 2, surprised: -6, smug: 0, worried: -3 };
  return [-1, 1].map((side) => {
    const cx = 100 + side * spread;
    const inner = cx - side * 7;
    const outer = cx + side * 8;
    let t = tilt[expr];
    if (expr === 'smug' && side === 1) t = -3;
    const d = smoothOpen([[inner, y + lift[expr] + t], [cx, y + lift[expr] - 2.2], [outer, y + lift[expr] + 0.5]]);
    return <path key={side} d={d} fill="none" stroke={color} stroke-width={weight} stroke-linecap="round" />;
  });
}

function mouth(expr: Expression, lip: string, line: string) {
  const y = 145;
  switch (expr) {
    case 'happy':
      return (
        <g>
          <path d={`M88 ${y - 2}Q100 ${y + 11} 112 ${y - 2}Q100 ${y + 4} 88 ${y - 2}Z`} fill="#5A1E2E" />
          <path d={`M91 ${y}Q100 ${y + 3} 109 ${y}`} fill="none" stroke="#FFF8EE" stroke-width="2.4" stroke-linecap="round" />
          <path d={`M86 ${y - 3}Q100 ${y + 12} 114 ${y - 3}`} fill="none" stroke={line} stroke-width="2" stroke-linecap="round" />
        </g>
      );
    case 'surprised':
      return <ellipse cx="100" cy={y + 2} rx="5.5" ry="7" fill="#5A1E2E" stroke={line} stroke-width="1.6" />;
    case 'annoyed':
      return <path d={`M90 ${y + 2}Q100 ${y - 2} 110 ${y + 2}`} fill="none" stroke={line} stroke-width="2.6" stroke-linecap="round" />;
    case 'smug':
      return (
        <g>
          <path d={`M90 ${y + 1}Q101 ${y + 4} 111 ${y - 3}`} fill="none" stroke={line} stroke-width="2.6" stroke-linecap="round" />
          <path d={`M111 ${y - 3}l2.5 -1.5`} stroke={line} stroke-width="2" stroke-linecap="round" />
        </g>
      );
    case 'worried':
      return <path d={`M89 ${y + 2}Q94.5 ${y - 2} 100 ${y + 1}Q105.5 ${y + 4} 111 ${y}`} fill="none" stroke={line} stroke-width="2.4" stroke-linecap="round" />;
    default:
      return (
        <g>
          <path d={`M90 ${y}Q100 ${y + 4.5} 110 ${y}`} fill="none" stroke={line} stroke-width="2.4" stroke-linecap="round" />
          <path d={`M94 ${y + 4}Q100 ${y + 7} 106 ${y + 4}`} fill="none" stroke={lip} stroke-width="2.2" stroke-linecap="round" stroke-opacity=".7" />
        </g>
      );
  }
}

function facialHair(kind: number, f: FaceShape, b: number, color: string, pid: string) {
  if (kind === 0) return null;
  const moustache = <path d="M86 140Q93 133 100 137Q107 133 114 140Q107 139 100 141Q93 139 86 140Z" fill={color} />;
  if (kind === 1) return <path d={jawOutline(f, b, 0.2)} fill={`url(#${pid}-stubble)`} opacity=".8" />;
  if (kind === 2) return moustache;
  if (kind === 3) return (
    <g>
      <path d={jawOutline(f, b, 1)} fill={color} />
      {moustache}
    </g>
  );
  return (
    <g>
      <path d={smoothClosed([[92, 152], [100, 150], [108, 152], [107, f.chinY + 2], [100, f.chinY + 8], [93, f.chinY + 2]], 1)} fill={color} />
      {moustache}
    </g>
  );
}

function glasses(kind: number, a: Appearance, pid: string) {
  if (kind === 0) return null;
  const s = 17 + a.eyes * 5;
  const y = 111;
  const L = 100 - s;
  const Rx = 100 + s;
  switch (kind) {
    case 1:
      return (
        <g fill={`url(#${pid}-tint)`} stroke="#C9A55A" stroke-width="1.8">
          <path d={`M${L - 11} ${y - 7}Q${L} ${y - 9} ${L + 11} ${y - 6}Q${L + 11} ${y + 8} ${L} ${y + 9}Q${L - 12} ${y + 6} ${L - 11} ${y - 7}Z`} />
          <path d={`M${Rx + 11} ${y - 7}Q${Rx} ${y - 9} ${Rx - 11} ${y - 6}Q${Rx - 11} ${y + 8} ${Rx} ${y + 9}Q${Rx + 12} ${y + 6} ${Rx + 11} ${y - 7}Z`} />
          <path d={`M${L + 11} ${y - 5}Q100 ${y - 9} ${Rx - 11} ${y - 5}`} fill="none" />
        </g>
      );
    case 2:
      return (
        <g fill="rgba(255,244,227,.14)" stroke="#2A1626" stroke-width="2.6">
          <circle cx={L} cy={y} r="10" />
          <circle cx={Rx} cy={y} r="10" />
          <path d={`M${L + 10} ${y - 1}Q100 ${y - 5} ${Rx - 10} ${y - 1}`} fill="none" />
        </g>
      );
    case 3:
      return (
        <g fill="rgba(255,244,227,.12)" stroke="#140B1E" stroke-width="3">
          <path d={`M${L - 12} ${y - 9}Q${L} ${y - 7} ${L + 10} ${y - 5}Q${L + 9} ${y + 7} ${L - 1} ${y + 7}Q${L - 11} ${y + 5} ${L - 12} ${y - 9}Z`} />
          <path d={`M${Rx + 12} ${y - 9}Q${Rx} ${y - 7} ${Rx - 10} ${y - 5}Q${Rx - 9} ${y + 7} ${Rx + 1} ${y + 7}Q${Rx + 11} ${y + 5} ${Rx + 12} ${y - 9}Z`} />
          <path d={`M${L + 10} ${y - 4}Q100 ${y - 7} ${Rx - 10} ${y - 4}`} fill="none" />
        </g>
      );
    case 4:
      return <path d={`M${L - 14} ${y - 8}Q100 ${y - 14} ${Rx + 14} ${y - 8}Q${Rx + 12} ${y + 7} ${Rx - 2} ${y + 7}Q100 ${y + 2} ${L + 2} ${y + 7}Q${L - 12} ${y + 7} ${L - 14} ${y - 8}Z`} fill={`url(#${pid}-wrap)`} stroke="#140B1E" stroke-width="1.6" />;
    default:
      return (
        <g fill="rgba(255,244,227,.16)" stroke="#C9A55A" stroke-width="1.8">
          <path d={`M${L - 9} ${y + 1}h18Q${L + 9} ${y + 9} ${L} ${y + 9}Q${L - 9} ${y + 9} ${L - 9} ${y + 1}Z`} />
          <path d={`M${Rx - 9} ${y + 1}h18Q${Rx + 9} ${y + 9} ${Rx} ${y + 9}Q${Rx - 9} ${y + 9} ${Rx - 9} ${y + 1}Z`} />
          <path d={`M${L + 9} ${y + 2}Q100 ${y - 2} ${Rx - 9} ${y + 2}`} fill="none" />
        </g>
      );
  }
}

// ── clothing ─────────────────────────────────────────────────────────────────

function torso(shoulder: number): string {
  return smoothClosed([[100 - 15, 182], [100 - shoulder * 0.62, 196], [100 - shoulder, 214], [100 - shoulder - 8, 246], [100 + shoulder + 8, 246], [100 + shoulder, 214], [100 + shoulder * 0.62, 196], [100 + 15, 182], [100, 186]], 0.8);
}

function printPattern(o: Outfit, pid: string) {
  const [, accent] = o.colors;
  const id = `${pid}-print`;
  switch (o.print) {
    case 'stripes':
      return <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="5" fill={accent} opacity=".85" /></pattern>;
    case 'checks':
      return (
        <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="16" fill={accent} opacity=".35" />
          <rect width="16" height="8" fill={accent} opacity=".35" />
        </pattern>
      );
    case 'chevron':
      return <pattern id={id} width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 10l9-7 9 7" fill="none" stroke={accent} stroke-width="3" opacity=".8" /></pattern>;
    case 'palms':
      return (
        <pattern id={id} width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M8 22c2-7 1-11-2-14M6 8c-4-2-6 0-7 2M6 8c3-3 7-3 9-1M6 8c0-4 2-6 5-7" fill="none" stroke={accent} stroke-width="2.2" stroke-linecap="round" opacity=".9" />
          <path d="M24 10c1 4 0 7-2 9" fill="none" stroke={accent} stroke-width="2" stroke-linecap="round" opacity=".6" />
        </pattern>
      );
    case 'hibiscus':
      return (
        <pattern id={id} width="30" height="28" patternUnits="userSpaceOnUse">
          <g fill={accent} opacity=".9">
            <circle cx="8" cy="6" r="3.2" /><circle cx="12" cy="9" r="3.2" /><circle cx="10" cy="13" r="3.2" /><circle cx="5" cy="13" r="3.2" /><circle cx="4" cy="8.5" r="3.2" />
          </g>
          <circle cx="8" cy="10" r="1.6" fill="#FFD166" />
          <circle cx="23" cy="22" r="2.6" fill={accent} opacity=".55" />
        </pattern>
      );
    case 'flamingos':
      return (
        <pattern id={id} width="26" height="30" patternUnits="userSpaceOnUse">
          <path d="M9 18c-4 0-6-2-6-4s2-3 5-3c3 0 4 2 5 3M13 14c2-2 2-5 1-7-1-1-3-1-3 1M9 18v8" fill="none" stroke={accent} stroke-width="2.2" stroke-linecap="round" />
        </pattern>
      );
    default:
      return null;
  }
}

function outfitLayers(o: Outfit, shoulder: number, skin: string, skinShade: string, pid: string) {
  const [base, accent, , shoes] = o.colors;
  const body = torso(shoulder);
  const patterned = o.print !== 'plain';
  const items = [] as preact.JSX.Element[];
  const strapTop = o.top === 'tank' || o.top === 'sundress' || o.top === 'crop';
  if (strapTop) {
    // Bare shoulders: skin torso, then a lower panel with straps.
    items.push(<path key="skin" d={body} fill={skin} />);
    items.push(<path key="skin-sh" d={body} fill={skinShade} opacity=".35" />);
    items.push(<path key="panel" d={`M${100 - shoulder - 8} 246L${100 - shoulder + 10} 214Q100 ${o.top === 'sundress' ? 224 : 218} ${100 + shoulder - 10} 214L${100 + shoulder + 8} 246Z`} fill={base} />);
    items.push(<path key="straps" d={`M${100 - 30} 218L${100 - 22} 186M${100 + 30} 218L${100 + 22} 186`} stroke={base} stroke-width={o.top === 'tank' ? 9 : 5} stroke-linecap="round" />);
    if (patterned) items.push(<path key="print" d={`M${100 - shoulder - 8} 246L${100 - shoulder + 10} 214Q100 220 ${100 + shoulder - 10} 214L${100 + shoulder + 8} 246Z`} fill={`url(#${pid}-print)`} />);
    return items;
  }
  items.push(<path key="body" d={body} fill={base} />);
  if (patterned) items.push(<path key="print" d={body} fill={`url(#${pid}-print)`} />);
  switch (o.top) {
    case 'tee':
    case 'jersey':
      items.push(<path key="neck" d={`M${100 - 16} 184Q100 ${o.top === 'jersey' ? 210 : 200} ${100 + 16} 184`} fill={skin} stroke={accent} stroke-width="4" />);
      if (o.top === 'jersey') items.push(<text key="num" x="100" y="236" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="900" font-size="22" fill={accent}>{(o.id % 89) + 10}</text>);
      break;
    case 'aloha':
    case 'guayabera':
    case 'linenShirt':
    case 'buttonDown':
    case 'polo':
      items.push(<path key="v" d={`M${100 - 15} 184L100 ${o.top === 'polo' ? 204 : 214}L${100 + 15} 184Z`} fill={skin} />);
      items.push(<path key="collarL" d={`M${100 - 17} 182L${100 - 30} 200L${100 - 3} ${o.top === 'polo' ? 204 : 212}Z`} fill={o.top === 'aloha' ? accent : base} stroke="rgba(0,0,0,.18)" stroke-width="1" />);
      items.push(<path key="collarR" d={`M${100 + 17} 182L${100 + 30} 200L${100 + 3} ${o.top === 'polo' ? 204 : 212}Z`} fill={o.top === 'aloha' ? accent : base} stroke="rgba(0,0,0,.18)" stroke-width="1" />);
      if (o.top === 'guayabera') items.push(<path key="pleats" d={`M${100 - 26} 214v32M${100 - 20} 214v32M${100 + 20} 214v32M${100 + 26} 214v32`} stroke="rgba(20,11,51,.22)" stroke-width="1.6" />);
      if (o.top !== 'aloha') items.push(<g key="btn" fill="rgba(20,11,51,.35)"><circle cx="100" cy="222" r="1.8" /><circle cx="100" cy="236" r="1.8" /></g>);
      break;
    case 'tracksuit':
    case 'windbreaker':
      items.push(<path key="collar" d={`M${100 - 18} 180Q100 190 ${100 + 18} 180L${100 + 20} 194Q100 200 ${100 - 20} 194Z`} fill={accent} />);
      items.push(<path key="zip" d="M100 194V246" stroke="rgba(20,11,51,.4)" stroke-width="2.2" />);
      items.push(<path key="stripeL" d={`M${100 - shoulder + 2} 212L${100 - shoulder - 6} 246`} stroke={accent} stroke-width="5" />);
      items.push(<path key="stripeR" d={`M${100 + shoulder - 2} 212L${100 + shoulder + 6} 246`} stroke={accent} stroke-width="5" />);
      break;
    case 'blazer':
      items.push(<path key="shirt" d={`M${100 - 22} 186L100 236L${100 + 22} 186Z`} fill={accent} />);
      items.push(<path key="lapelL" d={`M${100 - 22} 186L${100 - 34} 204L${100 - 14} 214L100 238Z`} fill={mixHex(base, '#000000', 0.18)} />);
      items.push(<path key="lapelR" d={`M${100 + 22} 186L${100 + 34} 204L${100 + 14} 214L100 238Z`} fill={mixHex(base, '#000000', 0.18)} />);
      break;
    case 'hoodie':
      items.push(<path key="hood" d={`M${100 - 30} 192Q100 178 ${100 + 30} 192Q${100 + 26} 208 100 206Q${100 - 26} 208 ${100 - 30} 192Z`} fill={mixHex(base, '#000000', 0.15)} />);
      items.push(<path key="strings" d="M94 204v22M106 204v22" stroke={accent} stroke-width="2.4" stroke-linecap="round" />);
      break;
    case 'apron':
      items.push(<path key="neck" d={`M${100 - 16} 184Q100 200 ${100 + 16} 184`} fill={skin} stroke={accent} stroke-width="3" />);
      items.push(<path key="bib" d={`M${100 - 22} 204h44v42h-44z`} fill={shoes} opacity=".92" />);
      items.push(<path key="straps" d={`M${100 - 22} 204L${100 - 30} 184M${100 + 22} 204L${100 + 30} 184`} stroke={shoes} stroke-width="4" />);
      break;
    default:
      items.push(<path key="neck" d={`M${100 - 16} 184Q100 200 ${100 + 16} 184`} fill={skin} />);
  }
  return items;
}

function bagStraps(kind: number, shoulder: number) {
  if (kind === 0) return null;
  const strap = '#2A1E3A';
  if (kind === 3) return <path d={`M${100 - shoulder * 0.7} 196L${100 - shoulder * 0.55} 246M${100 + shoulder * 0.7} 196L${100 + shoulder * 0.55} 246`} stroke={strap} stroke-width="6" stroke-linecap="round" />;
  if (kind === 1) return <path d={`M${100 + shoulder * 0.62} 194L${100 + shoulder * 0.45} 246`} stroke="#E8D9BE" stroke-width="7" stroke-linecap="round" />;
  return <path d={`M${100 + shoulder * 0.66} 194L${100 - shoulder * 0.7} 246`} stroke={strap} stroke-width="5" stroke-linecap="round" />;
}

// ── composition ──────────────────────────────────────────────────────────────

export function Portrait({ appearance: a, expression = 'neutral', size = '6rem', framing = 'bust', shape = 'rounded', blink = true, seed, label, class: cls }: PortraitProps) {
  const pidRef = useRef('');
  if (!pidRef.current) pidRef.current = `hhp${++uid}`;
  const pid = pidRef.current;
  const s = seed ?? appearanceSeed(a);
  const f = FACES[a.face % FACES.length]!;
  const build = BUILDS[a.build % BUILDS.length]!;
  const breadth = 0.9 + (build.waist - 0.8) * 0.28 + build.belly * 0.04;
  const skin = SKIN_TONES[a.skin % SKIN_TONES.length]!;
  const skinShade = mixHex(skin, VIOLET, 0.32);
  const skinLight = mixHex(skin, GOLD, 0.16);
  const hairStyle = a.hair;
  const hairC = HAIR_COLORS[a.hairColor % HAIR_COLORS.length]!;
  const hairShade = mixHex(hairC, '#140B33', 0.35);
  const browC = luminance(hairC) > 0.45 ? mixHex(hairC, '#3A2416', 0.55) : mixHex(hairC, '#140B1E', 0.25);
  const outfit = OUTFITS[a.outfit % OUTFITS.length]!;
  const shoulder = 66 * build.shoulders;
  const [bg0, bg1] = BACKDROPS[s % BACKDROPS.length]!;
  const iris = IRIS[(s >>> 3) % IRIS.length]!;
  const hair = hairLayers(hairStyle, f, breadth);
  const head = headOutline(f, breadth);
  const earX = f.cheek * breadth + 1;
  const lip = mixHex(skin, '#FF3D8B', 0.35);
  const line = mixHex(skin, '#2A0E1E', 0.62);
  const blinkClass = blink ? `hh-portrait-eye hh-blink-${s % 5}` : 'hh-portrait-eye';
  const viewBox = framing === 'head' ? '28 34 144 144' : '0 0 200 240';
  const aspect = framing === 'head' ? 1 : 200 / 240;

  return (
    <span
      class={`hh-portrait hh-portrait-${shape}${cls ? ` ${cls}` : ''}`}
      style={{ width: aspect >= 1 ? size : `calc(${size} * ${aspect})`, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${pid}-bg`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stop-color={bg0} />
            <stop offset="1" stop-color={bg1} />
          </linearGradient>
          <radialGradient id={`${pid}-sun`} cx="0.72" cy="0.3" r="0.55">
            <stop offset="0" stop-color="#FFF4E3" stop-opacity=".55" />
            <stop offset="1" stop-color="#FFF4E3" stop-opacity="0" />
          </radialGradient>
          <linearGradient id={`${pid}-rim`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0.62" stop-color="#FF9A3C" stop-opacity="0" />
            <stop offset="1" stop-color="#FF9A3C" stop-opacity=".62" />
          </linearGradient>
          <linearGradient id={`${pid}-shadow`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color={VIOLET} stop-opacity=".34" />
            <stop offset="0.42" stop-color={VIOLET} stop-opacity="0" />
          </linearGradient>
          <linearGradient id={`${pid}-hairlight`} x1="0.2" y1="0" x2="0.9" y2="0.7">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.7" stop-color="#FFD9A0" stop-opacity=".28" />
            <stop offset="1" stop-color="#FFD9A0" stop-opacity="0" />
          </linearGradient>
          <linearGradient id={`${pid}-neck`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={skinShade} />
            <stop offset="0.55" stop-color={skin} />
          </linearGradient>
          <linearGradient id={`${pid}-tint`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFB45A" stop-opacity=".85" />
            <stop offset="1" stop-color="#FF3D8B" stop-opacity=".75" />
          </linearGradient>
          <linearGradient id={`${pid}-wrap`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#17E0C8" />
            <stop offset="0.5" stop-color="#3A2A7A" />
            <stop offset="1" stop-color="#FF3D8B" />
          </linearGradient>
          <pattern id={`${pid}-stubble`} width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="3" fill={hairShade} opacity=".16" />
            <circle cx=".8" cy=".8" r=".45" fill={hairShade} opacity=".45" />
            <circle cx="2.3" cy="2.1" r=".4" fill={hairShade} opacity=".35" />
          </pattern>
          {printPattern(outfit, pid)}
          <clipPath id={`${pid}-head`}><path d={head} /></clipPath>
        </defs>

        <rect x="0" y="0" width="200" height="240" fill={`url(#${pid}-bg)`} />
        <circle cx="128" cy="86" r="76" fill={`url(#${pid}-sun)`} />

        {hair.back.map((d, i) => <path key={`b${i}`} d={d} fill={hairShade} />)}
        {hair.backDetail.length > 0 && (
          <path d={hair.backDetail.join('')} fill="none" stroke={hairC} stroke-width="1.4" stroke-linecap="round" stroke-opacity=".55" />
        )}

        <path d="M86 140h28v58H86z" fill={`url(#${pid}-neck)`} />
        {outfitLayers(outfit, shoulder, skin, skinShade, pid)}
        {a.jewelry === 1 && <path d="M80 196Q100 222 120 196" fill="none" stroke="#FFD166" stroke-width="3" stroke-linecap="round" />}
        {bagStraps(a.bag, shoulder)}
        <path d={torso(shoulder)} fill={`url(#${pid}-rim)`} />

        <ellipse cx={100 - earX} cy="120" rx="7" ry="10.5" fill={skin} />
        <ellipse cx={100 + earX} cy="120" rx="7" ry="10.5" fill={skin} />
        <ellipse cx={100 + earX} cy="120" rx="7" ry="10.5" fill="#FF9A3C" opacity=".35" />
        <path d={head} fill={skin} />
        <g clip-path={`url(#${pid}-head)`}>
          <rect x="0" y="0" width="200" height="240" fill={`url(#${pid}-shadow)`} />
          <rect x="0" y="0" width="200" height="240" fill={`url(#${pid}-rim)`} />
          <ellipse cx="100" cy="64" rx="30" ry="12" fill={skinLight} opacity=".35" />
          <ellipse cx={100 - 25} cy="128" rx="9" ry="5.5" fill="#FF6B8B" opacity=".2" />
          <ellipse cx={100 + 25} cy="128" rx="9" ry="5.5" fill="#FF6B8B" opacity=".2" />
          <path d="M100 116Q97 126 96 131Q100 134.5 104 131" fill="none" stroke={line} stroke-width="1.8" stroke-linecap="round" stroke-opacity=".55" />
          <path d="M96 131Q100 134.5 104 131" fill="none" stroke={skinShade} stroke-width="3" stroke-linecap="round" stroke-opacity=".45" />
          {facialHair(a.facialHair, f, breadth, hairShade, pid)}
        </g>
        {a.jewelry === 2 && (
          <g fill="none" stroke="#FFD166" stroke-width="2.6">
            <circle cx={100 - earX} cy="136" r="5.5" />
            <circle cx={100 + earX} cy="136" r="5.5" />
          </g>
        )}
        {eyes(a, expression, iris, blinkClass)}
        {brows(a, expression, browC)}
        {mouth(expression, lip, line)}

        {hair.shade.map((d, i) => <path key={`s${i}`} d={d} fill={hairC} opacity=".45" />)}
        {hair.front.map((d, i) => <path key={`f${i}`} d={d} fill={hairC} />)}
        {hair.front.map((d, i) => <path key={`l${i}`} d={d} fill={`url(#${pid}-hairlight)`} />)}
        {hair.detail.map((d, i) => <path key={`d${i}`} d={d} fill="none" stroke={hairShade} stroke-width="1.6" stroke-linecap="round" stroke-opacity=".7" />)}
        {hair.bald && <ellipse cx="112" cy="62" rx="14" ry="6" fill="#fff" opacity=".22" />}
        {glasses(a.glasses, a, pid)}
        {hair.hat.map((h, i) => (
          <path key={`h${i}`} d={h.d} fill={h.fill} opacity={h.opacity} stroke={h.stroke} stroke-width={h.stroke ? 6 : undefined} stroke-linecap="round" />
        ))}
      </svg>
    </span>
  );
}
