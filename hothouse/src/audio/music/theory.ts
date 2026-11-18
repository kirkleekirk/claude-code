/**
 * Music theory, pure and deterministic: scales, diatonic chords, voicings with voice leading,
 * and pitch snapping. Pitches are MIDI note numbers; degrees are 0-based scale steps.
 */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;

export type ScaleName = keyof typeof SCALES;

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Semitones above the tonic for scale degree `degree` (any integer; wraps by octaves). */
export function degreeSemis(scale: ScaleName, degree: number): number {
  const s = SCALES[scale];
  const n = s.length;
  const d = Math.round(degree);
  return s[mod(d, n)]! + 12 * Math.floor(d / n);
}

/** MIDI pitch of a scale degree above `tonic`. */
export function scaleNote(tonic: number, scale: ScaleName, degree: number): number {
  return tonic + degreeSemis(scale, degree);
}

/**
 * Chord tones (semitones above the tonic) stacked in thirds on `degree`. `size` 3 = triad,
 * 4 = seventh, 5 = ninth. `raiseLeading` turns the minor-key v into a major V (harmonic minor).
 */
export function chordSemis(scale: ScaleName, degree: number, size: number, raiseLeading = false): number[] {
  const out: number[] = [];
  const sc: ScaleName = raiseLeading && mod(degree, 7) === 4 && (scale === 'minor' || scale === 'dorian') ? 'harmonicMinor' : scale;
  for (let i = 0; i < size; i++) out.push(degreeSemis(sc, degree + 2 * i));
  return out;
}

/** Pitch classes (0–11) of a chord relative to C, given the tonic. */
export function chordPcs(tonic: number, semis: readonly number[]): number[] {
  return semis.map((s) => mod(tonic + s, 12));
}

/**
 * Voice a chord near `center`: every chord tone placed within a ten-semitone window, choosing the
 * inversion that moves least from `prev` (smooth voice leading) when one is given.
 */
export function voiceChord(tonic: number, semis: readonly number[], center: number, prev?: readonly number[]): number[] {
  const pcs = chordPcs(tonic, semis);
  const n = pcs.length;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let rot = 0; rot < n; rot++) {
    // Build ascending from the rotated bottom note, placed nearest the centre's low edge.
    const voicing: number[] = [];
    let lo = center - 6;
    for (let i = 0; i < n; i++) {
      const pc = pcs[(rot + i) % n]!;
      let p = lo + mod(pc - lo, 12);
      if (voicing.length && p <= voicing[voicing.length - 1]!) p += 12;
      voicing.push(p);
      lo = p + 1;
    }
    for (const shift of [-12, 0, 12]) {
      const v = voicing.map((p) => p + shift);
      let cost = Math.abs((v[0]! + v[n - 1]!) / 2 - center) * 0.6;
      if (prev && prev.length) {
        for (let i = 0; i < n; i++) cost += Math.abs(v[i]! - (prev[Math.min(i, prev.length - 1)] ?? center));
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
  }
  return best;
}

/** Nearest pitch to `target` whose pitch class is in `pcs`. */
export function nearestPc(target: number, pcs: readonly number[]): number {
  let best = target;
  let bestD = Infinity;
  for (const pc of pcs) {
    const base = target - mod(target - pc, 12);
    for (const cand of [base, base + 12]) {
      const d = Math.abs(cand - target);
      if (d < bestD || (d === bestD && cand < best)) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
}

/** Snap a pitch into the scale (ties resolve downward). */
export function snapToScale(tonic: number, scale: ScaleName, midi: number): number {
  return nearestPc(midi, SCALES[scale].map((s) => mod(tonic + s, 12)));
}

/** Scale degree index nearest a pitch (for converting melodies between chords). */
export function degreeOf(tonic: number, scale: ScaleName, midi: number): number {
  const s = SCALES[scale];
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12);
  const pc = mod(rel, 12);
  let bestI = 0;
  let bestD = 99;
  for (let i = 0; i < s.length; i++) {
    const d = Math.abs(s[i]! - pc);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI + oct * s.length;
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
