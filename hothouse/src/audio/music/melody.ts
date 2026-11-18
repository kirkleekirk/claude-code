import type { Rng } from '@/core/rng';
import { kickBeats } from './rhythm';
import { chordPcs, chordSemis, nearestPc, scaleNote, snapToScale, voiceChord } from './theory';
import type { ArpSpec, Motif, NoteEvent, Section, Track } from './types';

/**
 * Pitched parts for one bar: bass, comping chords, arpeggios and the lead. All functions are pure
 * given the track and a per-bar random stream.
 */

export interface ChordInfo {
  degree: number;
  semis: number[];
  pcs: number[];
  /** Root in the bass register. */
  bassRoot: number;
}

export function chordAt(track: Track, bar: number, beat = 0): ChordInfo {
  const pos = bar + beat / 4;
  const slot = Math.floor(pos / track.chordBars + 1e-6) % track.progression.length;
  const degree = track.progression[slot]!;
  const semis = chordSemis(track.scale, degree, track.chordSize, track.raiseLeading);
  const tonicBass = 28 + ((track.tonic - 28) % 12 + 12) % 12; // E1 … D#2
  let root = tonicBass + semis[0]!;
  while (root > 45) root -= 12;
  while (root < 28) root += 12;
  return { degree, semis, pcs: chordPcs(track.tonic, semis), bassRoot: root };
}

/** Chord changes inside this bar (start beats). */
export function chordChanges(track: Track): number[] {
  return track.chordBars >= 1 ? [0] : [0, 2];
}

function fifthOf(c: ChordInfo): number {
  return c.bassRoot + 7;
}

/** The fifth below the root when that stays above B0, otherwise the fifth above. */
function lowFifth(c: ChordInfo): number {
  return c.bassRoot - 5 >= 31 ? c.bassRoot - 5 : c.bassRoot + 7;
}

export function bassEvents(track: Track, bar: number, energy: number, rng: Rng, out: NoteEvent[]): void {
  const c = chordAt(track, bar);
  const next = chordAt(track, bar + 1);
  const half = track.chordBars < 1 ? chordAt(track, bar, 2) : c;
  const v = 0.7 + energy * 0.3;
  const push = (beat: number, len: number, note: number, vel = v, from?: number) =>
    out.push(from === undefined ? { inst: 'bass', beat, len, note, vel } : { inst: 'bass', beat, len, note, vel, from });
  switch (track.bass) {
    case 'octaves':
      for (let i = 0; i < 8; i++) {
        const ch = i < 4 ? c : half;
        let note = ch.bassRoot + (i % 2 ? 12 : 0);
        if (i === 7 && next.degree !== ch.degree && energy > 0.4) note = next.bassRoot + (rng.chance(0.5) && next.bassRoot > 31 ? -1 : 2);
        push(i * 0.5, 0.42, note, v * (i % 2 ? 0.8 : 1));
      }
      break;
    case 'pulse':
      for (let i = 0; i < (energy < 0.35 ? 4 : 8); i++) {
        const step = energy < 0.35 ? 1 : 0.5;
        const ch = i * step < 2 ? c : half;
        push(i * step, step * 0.85, ch.bassRoot, v * (i % 2 ? 0.75 : 1));
      }
      break;
    case 'tumbao':
      // The tumbao leaves beat one empty and anticipates the next chord on four.
      push(1.5, 1.4, fifthOf(c) > 47 ? fifthOf(c) - 12 : fifthOf(c), v);
      push(3, 0.9, next.bassRoot, v * 1.05);
      if (energy > 0.7) push(0, 0.3, c.bassRoot + 12, v * 0.6);
      break;
    case 'reggaeton':
      push(0, 0.7, c.bassRoot, v);
      push(0.75, 0.6, c.bassRoot, v * 0.8);
      push(1.5, 0.45, lowFifth(c), v * 0.85);
      push(2, 0.7, half.bassRoot, v);
      push(2.75, 0.6, half.bassRoot, v * 0.8);
      push(3.5, 0.45, half.bassRoot + 12, v * 0.85);
      break;
    case 'walk': {
      push(0, 1.9, c.bassRoot, v);
      push(2, 0.95, rng.chance(0.5) ? lowFifth(c) : c.bassRoot + (track.scale === 'major' || track.scale === 'lydian' ? 4 : 3), v * 0.85);
      const target = next.bassRoot;
      push(3, 0.95, target + (rng.chance(0.5) || target <= 31 ? 1 : -1), v * 0.8);
      break;
    }
    case 'sub':
      push(0, track.chordBars < 1 ? 1.95 : 3.9, c.bassRoot, v);
      if (track.chordBars < 1) push(2, 1.95, half.bassRoot, v);
      else if (energy > 0.6) push(2.5, 1.3, c.bassRoot, v * 0.7);
      break;
    case 'eight08':
    case 'miami': {
      const kicks = kickBeats(track.groove, bar, Math.max(0.3, energy));
      if (kicks.length === 0) kicks.push(0);
      let prev = -1;
      for (let i = 0; i < kicks.length; i++) {
        const b = kicks[i]!;
        const end = i + 1 < kicks.length ? kicks[i + 1]! : 4;
        const ch = b < 2 ? c : half;
        let note = ch.bassRoot;
        if (i > 0 && rng.chance(0.25)) note += rng.chance(0.5) ? 12 : 7;
        const slide = track.bass === 'eight08' && prev >= 0 && prev !== note && rng.chance(0.45);
        push(b, Math.max(0.2, end - b - 0.05), note, v, slide ? prev : undefined);
        prev = note;
      }
      break;
    }
  }
}

export function compEvents(track: Track, bar: number, energy: number, prevVoicing: number[] | null, out: NoteEvent[]): number[] {
  const c = chordAt(track, bar);
  const half = track.chordBars < 1 ? chordAt(track, bar, 2) : c;
  const center = track.tonic + 7;
  const voice = (ch: ChordInfo, prev: readonly number[] | null) => voiceChord(track.tonic, ch.semis, center, prev ?? undefined);
  const v1 = voice(c, prevVoicing);
  const v2 = half === c ? v1 : voice(half, v1);
  const vel = 0.55 + energy * 0.35;
  const chordEv = (beat: number, len: number, notes: number[], k = 1, inst: 'pad' | 'keys' | 'stab' = 'keys') =>
    out.push({ inst, beat, len, note: notes[0]!, notes, vel: vel * k });
  switch (track.comp) {
    case 'pad':
      if (half === c) chordEv(0, 4, v1, 1, 'pad');
      else {
        chordEv(0, 2, v1, 1, 'pad');
        chordEv(2, 2, v2, 1, 'pad');
      }
      break;
    case 'stabs': {
      const hits = energy > 0.7 ? [0.5, 1.5, 2.5, 3.5] : [1.5, 3.5];
      for (const b of hits) chordEv(b, 0.22, b < 2 ? v1 : v2, 0.9, 'stab');
      break;
    }
    case 'montuno': {
      // Syncopated broken chords: alternate the low and high halves of the voicing.
      const pattern = bar % 2 === 0 ? [0.5, 1, 1.5, 2.5, 3, 3.5] : [0.5, 1.5, 2, 2.5, 3.5];
      pattern.forEach((b, i) => {
        const vv = b < 2 ? v1 : v2;
        const notes = i % 2 === 0 ? [vv[0]!, vv[vv.length - 1]! ] : vv.slice(1);
        out.push({ inst: 'keys', beat: b, len: 0.42, note: notes[0]!, notes: [...notes, notes[0]! + 12], vel: vel * (i % 2 ? 0.75 : 0.95) });
      });
      break;
    }
    case 'lazy':
      chordEv(0, 1.4, v1, 0.95);
      chordEv(1.5, 2.4, v2, 0.75);
      break;
    case 'reggaeton': {
      for (const [b, l] of [[0, 0.65], [0.75, 0.65], [1.5, 0.4], [2, 0.65], [2.75, 0.65], [3.5, 0.4]] as const) {
        chordEv(b, l, b < 2 ? v1 : v2, b % 1 === 0 ? 0.9 : 0.7, 'stab');
      }
      break;
    }
    case 'pluckChords':
      for (let i = 0; i < 8; i++) {
        if ((i === 3 || i === 6) && energy < 0.7) continue;
        chordEv(i * 0.5, 0.3, i < 4 ? v1 : v2, i % 2 ? 0.65 : 0.9);
      }
      break;
  }
  return half === c ? v1 : v2;
}

export function arpEvents(track: Track, bar: number, spec: ArpSpec, energy: number, out: NoteEvent[]): void {
  const perBeat = spec.rate;
  const total = perBeat * 4;
  for (let i = 0; i < total; i++) {
    const beat = i / perBeat;
    const c = chordAt(track, bar, beat);
    const base = voiceChord(track.tonic, c.semis, track.tonic + 14);
    const tones = spec.octaves === 2 ? [...base, ...base.map((p) => p + 12)] : base;
    const n = tones.length;
    let idx: number;
    switch (spec.shape) {
      case 'up':
        idx = i % n;
        break;
      case 'down':
        idx = n - 1 - (i % n);
        break;
      case 'updown': {
        const cyc = Math.max(1, 2 * n - 2);
        const p = i % cyc;
        idx = p < n ? p : cyc - p;
        break;
      }
      case 'pinky':
        idx = i % 2 === 0 ? n - 1 : (i >> 1) % Math.max(1, n - 1);
        break;
      case 'broken':
        idx = [0, 2, 1, 3, 2, 4, 3, 1][i % 8]! % n;
        break;
    }
    const accent = i % perBeat === 0 ? 1 : 0.7;
    out.push({ inst: 'arp', beat, len: (1 / perBeat) * 0.9, note: tones[idx]!, vel: (0.5 + energy * 0.35) * accent });
  }
}

/** Realize the lead for this bar from the track's motifs. Phrase shape per 8 bars: A A' A B. */
export function leadEvents(track: Track, bar: number, section: Section, out: NoteEvent[]): void {
  if (track.motifs.length === 0) return;
  const p = bar - section.start;
  const cell = Math.floor(p / 2) % 4;
  const motif: Motif = track.motifs[cell === 3 ? 1 : 0]!;
  const lift = cell === 1 ? 1 : cell === 2 && section.energy > 0.85 ? 2 : 0;
  const halfOffset = (p % 2) * 4;
  let prev = track.leadCenter;
  for (const [off, len, deg, accent] of motif.notes) {
    if (off < halfOffset || off >= halfOffset + 4) continue;
    const beat = off - halfOffset;
    const c = chordAt(track, bar, beat);
    let pitch = scaleNote(track.tonic, track.scale, deg + lift) + 12 * Math.round((track.leadCenter - track.tonic) / 12);
    pitch = accent ? nearestPc(pitch, c.pcs) : snapToScale(track.tonic, track.scale, pitch);
    while (pitch > track.leadCenter + 12) pitch -= 12;
    while (pitch < track.leadCenter - 8) pitch += 12;
    out.push({ inst: 'lead', beat, len, note: pitch, vel: (0.65 + section.energy * 0.3) * (accent ? 1 : 0.85), from: prev });
    prev = pitch;
  }
}

/** Rhythm cells for leads: [offset, length] pairs over two bars (8 beats). */
export const LEAD_RHYTHMS: Readonly<Record<string, ReadonlyArray<ReadonlyArray<readonly [number, number]>>>> = {
  long: [
    [[0, 1.5], [1.5, 0.5], [2, 2], [4, 1], [5, 1], [6, 2]],
    [[0, 3], [3, 1], [4, 0.5], [4.5, 1.5], [6, 2]],
    [[0.5, 1], [1.5, 1], [2.5, 1.5], [4, 3], [7, 1]],
  ],
  syncopated: [
    [[0, 0.5], [0.75, 0.5], [1.5, 0.5], [2, 0.75], [3, 0.5], [3.5, 0.5], [4, 0.75], [4.75, 0.75], [5.5, 1], [7, 0.5]],
    [[0.5, 0.5], [1, 0.5], [1.75, 0.75], [2.5, 1], [4, 0.5], [4.5, 0.5], [5.25, 0.75], [6, 1.5]],
    [[0, 0.75], [0.75, 0.75], [1.5, 0.5], [2.5, 0.5], [3, 1], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 1.5]],
  ],
  sparse: [
    [[0, 2], [3, 1], [4, 3.5]],
    [[1, 1], [2, 2], [5, 1], [6, 2]],
    [[0, 1], [1.5, 2.5], [6, 2]],
  ],
  plucky: [
    [[0, 0.25], [0.5, 0.25], [0.75, 0.25], [1.5, 0.5], [2.5, 0.25], [3, 0.5], [4, 0.25], [4.5, 0.25], [5, 0.5], [6, 0.25], [6.5, 0.25], [7, 0.5]],
    [[0, 0.5], [1, 0.25], [1.25, 0.25], [1.5, 0.5], [3, 0.5], [4, 0.5], [5, 0.25], [5.25, 0.25], [5.5, 0.5], [7, 0.5]],
  ],
};

/** Build a motif: rhythm cell + stepwise contour that leaps rarely and resolves. */
export function makeMotif(rng: Rng, rhythmKind: keyof typeof LEAD_RHYTHMS, answerTo?: Motif): Motif {
  const cells = LEAD_RHYTHMS[rhythmKind]!;
  const rhythm = answerTo ? answerTo.notes.map(([o, l]) => [o, l] as const) : rng.pick(cells);
  const notes: Array<readonly [number, number, number, number]> = [];
  let deg = rng.pick([0, 2, 4, 4, 7]);
  for (let i = 0; i < rhythm.length; i++) {
    const [off, len] = rhythm[i]!;
    const accent = off % 2 === 0 || len >= 1.5 ? 1 : 0;
    if (answerTo && off < 4) {
      notes.push(answerTo.notes[i]!);
      deg = answerTo.notes[i]![2];
      continue;
    }
    if (i > 0) {
      const leap = rng.chance(0.14);
      const step = leap ? rng.pick([-4, -3, 3, 4]) : rng.pick([-2, -1, -1, 1, 1, 2]);
      deg += step;
      if (deg > 9) deg -= leap ? 5 : 2;
      if (deg < -2) deg += leap ? 5 : 2;
    }
    const last = i === rhythm.length - 1;
    if (last && answerTo) deg = rng.pick([0, 0, 7, 2]);
    else if (last) deg = rng.pick([4, 1, 6]);
    notes.push([off, len, deg, accent]);
  }
  return { notes };
}
