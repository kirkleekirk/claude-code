import type { Rng } from '@/core/rng';
import type { GrooveId, InstId, NoteEvent } from './types';

/**
 * Drum grooves as step strings (16 steps per bar, 32 for two-bar patterns).
 * `.` rest · `g` ghost 0.3 · `o` 0.55 · `x` 0.8 · `X` 1.0 · `r` triplet roll · `R` 32nd roll.
 * Lines carry an energy window so sparse sections thin out naturally.
 */

interface Line {
  inst: InstId;
  pat: string;
  note?: number;
  min?: number;
  max?: number;
}

export type FillKind = 'toms' | 'snareRoll' | 'timbale' | 'dropout' | 'hatRoll' | 'congaFlurry' | 'none';

interface Groove {
  lines: readonly Line[];
  fill: FillKind;
  buildFill: FillKind;
}

const L = (inst: InstId, pat: string, min = 0, max = 2, note = 0): Line => ({ inst, pat, min, max, note });

export const GROOVES: Readonly<Record<GrooveId, Groove>> = {
  synthHalf: {
    fill: 'toms', buildFill: 'snareRoll',
    lines: [
      L('kick', 'x.......x.......', 0, 0.6), L('kick', 'x.......x.x.....', 0.6),
      L('snare', '....X.......X...', 0.3),
      L('rim', '....o.......o...', 0, 0.3),
      L('hatC', 'x.x.x.x.x.x.x.x.', 0.25, 0.75), L('hatC', 'xgxgxgxgxgxgxgxg', 0.75),
      L('hatO', '..............o.', 0.6),
      L('clap', '....x.......x...', 0.85),
    ],
  },
  synthFour: {
    fill: 'toms', buildFill: 'snareRoll',
    lines: [
      L('kick', 'x...x...x...x...', 0.2),
      L('kick', 'x.......x.......', 0, 0.2),
      L('snare', '....x.......x...', 0.35), L('clap', '....x.......x...', 0.6),
      L('hatO', '..x...x...x...x.', 0.45),
      L('hatC', 'gxgxgxgxgxgxgxgx', 0.7),
      L('shaker', 'g.g.g.g.g.g.g.g.', 0.2, 0.7),
    ],
  },
  dembow: {
    fill: 'timbale', buildFill: 'snareRoll',
    lines: [
      L('kick', 'x...x...x...x...', 0.15),
      L('kick', 'x.......x.......', 0, 0.15),
      L('snare', '...x..x....x..x.', 0.3),
      L('rim', '...o..o....o..o.', 0, 0.3),
      L('hatC', 'x.x.x.x.x.x.x.x.', 0.3, 0.8), L('hatC', 'xgxgxgxgxgxgxgxg', 0.8),
      L('shaker', 'gogogogogogogogo', 0.55),
      L('clap', '...........x....', 0.85),
    ],
  },
  salsaPop: {
    fill: 'timbale', buildFill: 'congaFlurry',
    lines: [
      L('kick', 'x.......x.......', 0.25),
      L('clave', 'x..x..x.........' + '....x...x.......', 0),
      L('conga', '..o.....o.o.....', 0.2, 2, 0), L('conga', '....x.......x...', 0.2, 2, 2), L('conga', '......o.......o.', 0.45, 2, 1),
      L('cowbell', 'x...x...x...x...', 0.6),
      L('shaker', 'xgxgxgxgxgxgxgxg', 0.35),
      L('timbale', 'x.xx.x.xx.x.x.x.', 0.8, 2, 1),
      L('bongo', 'xgogxgogxgogxgog', 0.5, 0.8),
    ],
  },
  cumbia: {
    fill: 'congaFlurry', buildFill: 'timbale',
    lines: [
      L('kick', 'x.......x.......', 0.2),
      L('guiro', 'x.xxx.xxx.xxx.xx', 0),
      L('rim', '..x...x...x...x.', 0.25),
      L('conga', '....o.o.....o.o.', 0.4, 2, 1), L('conga', 'o.......o.......', 0.4, 2, 0),
      L('cowbell', '..x...x...x...x.', 0.75),
    ],
  },
  boomBap: {
    fill: 'dropout', buildFill: 'dropout',
    lines: [
      L('kick', 'x......x..x.....', 0.25), L('kick', 'x.........x.....', 0, 0.25),
      L('snare', '....x.......x...', 0.35), L('rim', '....o.......o...', 0, 0.35),
      L('hatC', 'x.x.x.x.x.x.x.x.', 0.2, 0.7), L('hatC', 'xgx.xgx.xgxgxgx.', 0.7),
      L('shaker', '..g...g...g...g.', 0.5),
    ],
  },
  lofiShuffle: {
    fill: 'dropout', buildFill: 'dropout',
    lines: [
      L('kick', 'x.....x...x.....', 0.2),
      L('snare', '....o.......o..g', 0.3), L('rim', '....g.......g...', 0, 0.3),
      L('hatC', 'x.xgx.x.x.xgx.x.', 0.15),
      L('shaker', 'g.g.g.g.g.g.g.g.', 0.6),
    ],
  },
  trap: {
    fill: 'hatRoll', buildFill: 'hatRoll',
    lines: [
      L('kick', 'x......x..x.....' + 'x.....x...x..x..', 0.2),
      L('clap', '........X.......', 0.3), L('snare', '........x.......', 0.6),
      L('hatC', 'x.x.x.x.x.x.x.x.', 0.2, 0.6), L('hatC', 'x.x.x.xrx.x.x.Rx', 0.6),
      L('hatO', '......o.........', 0.75),
      L('rim', '...g......g.....', 0.4),
    ],
  },
  miami: {
    fill: 'hatRoll', buildFill: 'snareRoll',
    lines: [
      L('kick', 'x..x..x...x.x...', 0.2),
      L('clap', '....x.......x...', 0.3),
      L('hatC', 'xgxgxgxgxgxgxgxg', 0.3),
      L('cowbell', '..x...x...x..x.x', 0.65),
      L('hatO', '..o.......o.....', 0.5),
    ],
  },
  chaseFour: {
    fill: 'toms', buildFill: 'snareRoll',
    lines: [
      L('kick', 'x...x...x...x...', 0.1),
      L('snare', '....X.......X...', 0.35),
      L('hatC', 'xgxgxgxgxgxgxgxg', 0.2),
      L('hatO', '..o...o...o...o.', 0.6),
      L('tom', '..............x.', 0.85, 2, 2),
      L('clap', '....x.......x...', 0.7),
    ],
  },
  ambient: {
    fill: 'none', buildFill: 'none',
    lines: [
      L('kick', 'o...............', 0.45),
      L('shaker', '..g...g...g...g.', 0.3),
      L('rim', '......g.......g.', 0.6),
    ],
  },
};

const VEL: Record<string, number> = { g: 0.3, o: 0.55, x: 0.8, X: 1, r: 0.6, R: 0.6 };

export function grooveEvents(groove: GrooveId, bar: number, energy: number, rng: Rng, out: NoteEvent[]): void {
  const g = GROOVES[groove];
  for (const line of g.lines) {
    if (energy < (line.min ?? 0) || energy >= (line.max ?? 2)) continue;
    const pat = line.pat.length > 16 ? line.pat.slice((bar % 2) * 16, (bar % 2) * 16 + 16) : line.pat;
    for (let s = 0; s < 16; s++) {
      const c = pat[s]!;
      if (c === '.') continue;
      if (c === 'g' && energy < 0.5) continue;
      const vel = Math.min(1, VEL[c]! * (0.75 + energy * 0.3) * (0.94 + rng.next() * 0.12));
      const beat = s / 4;
      if (c === 'r' || c === 'R') {
        const hits = c === 'r' ? 3 : 4;
        for (let h = 0; h < hits; h++) out.push({ inst: line.inst, beat: beat + (h * 0.25) / hits, len: 0.06, note: line.note ?? 0, vel: vel * (0.7 + h * 0.1) });
      } else {
        out.push({ inst: line.inst, beat, len: 0.2, note: line.note ?? 0, vel });
      }
    }
  }
}

/** Replace the end of a bar with a fill; returns events to add (callers strip what the fill covers). */
export function fillEvents(kind: FillKind, beats: number, energy: number, out: NoteEvent[]): number {
  if (kind === 'none') return 4;
  const start = 4 - beats;
  const steps = beats * 4;
  for (let i = 0; i < steps; i++) {
    const b = start + i / 4;
    const k = i / Math.max(1, steps - 1);
    const vel = 0.45 + k * 0.5 * (0.6 + energy * 0.4);
    switch (kind) {
      case 'toms':
        out.push({ inst: 'tom', beat: b, len: 0.25, note: Math.min(3, Math.floor(k * 4)), vel });
        if (i % 4 === 0) out.push({ inst: 'kick', beat: b, len: 0.2, note: 0, vel: 0.7 });
        break;
      case 'snareRoll':
        out.push({ inst: 'snare', beat: b, len: 0.1, note: 1, vel: 0.3 + k * 0.65 });
        if (k > 0.5) out.push({ inst: 'snare', beat: b + 0.125, len: 0.1, note: 1, vel: 0.3 + k * 0.6 });
        break;
      case 'timbale':
        out.push({ inst: 'timbale', beat: b, len: 0.2, note: i % 2, vel });
        break;
      case 'congaFlurry':
        out.push({ inst: 'conga', beat: b, len: 0.2, note: i % 3 === 2 ? 2 : i % 2, vel });
        break;
      case 'hatRoll':
        for (let h = 0; h < 3; h++) out.push({ inst: 'hatC', beat: b + h / 12, len: 0.05, note: 0, vel: 0.35 + k * 0.4 });
        break;
      case 'dropout':
        if (i === 0) out.push({ inst: 'rim', beat: b, len: 0.2, note: 0, vel: 0.5 });
        break;
    }
  }
  return start;
}

export function grooveFill(groove: GrooveId, build: boolean): FillKind {
  const g = GROOVES[groove];
  return build ? g.buildFill : g.fill;
}

/** Kick hit positions in a bar (for 808 bass lines that follow the kick). */
export function kickBeats(groove: GrooveId, bar: number, energy: number): number[] {
  const out: number[] = [];
  for (const line of GROOVES[groove].lines) {
    if (line.inst !== 'kick' || energy < (line.min ?? 0) || energy >= (line.max ?? 2)) continue;
    const pat = line.pat.length > 16 ? line.pat.slice((bar % 2) * 16, (bar % 2) * 16 + 16) : line.pat;
    for (let s = 0; s < 16; s++) if (pat[s] !== '.') out.push(s / 4);
  }
  return out.sort((a, b) => a - b);
}
