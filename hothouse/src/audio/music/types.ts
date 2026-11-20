import type { StationId } from '../api';
import type { ScaleName } from './theory';

/** Every playable part. Drums use `note` as a variant index; melodic parts use MIDI pitch. */
export type InstId =
  | 'kick' | 'snare' | 'clap' | 'hatC' | 'hatO' | 'rim' | 'tom' | 'crash' | 'ride'
  | 'conga' | 'bongo' | 'timbale' | 'cowbell' | 'clave' | 'shaker' | 'guiro'
  | 'bass' | 'pad' | 'keys' | 'arp' | 'lead' | 'stab' | 'riser' | 'impact';

export const DRUMS: ReadonlySet<InstId> = new Set<InstId>([
  'kick', 'snare', 'clap', 'hatC', 'hatO', 'rim', 'tom', 'crash', 'ride', 'conga', 'bongo', 'timbale', 'cowbell', 'clave', 'shaker', 'guiro',
]);

export interface NoteEvent {
  inst: InstId;
  /** Start, in beats from the start of the bar (16ths are 0.25). */
  beat: number;
  /** Length in beats. */
  len: number;
  /** MIDI pitch, or drum variant. */
  note: number;
  /** Chord tones for chord parts. */
  notes?: readonly number[];
  /** 0–1. */
  vel: number;
  /** Previous pitch for portamento (bass slides, legato leads). */
  from?: number;
}

export type Layer = 'drums' | 'perc' | 'bass' | 'comp' | 'pad' | 'arp' | 'lead' | 'fx';

export type SectionKind = 'intro' | 'verse' | 'build' | 'chorus' | 'breakdown' | 'bridge' | 'outro';

export interface Section {
  kind: SectionKind;
  start: number;
  bars: number;
  /** 0–1: drives drum density, velocities and filter brightness. */
  energy: number;
  layers: readonly Layer[];
}

export type GrooveId =
  | 'synthHalf' | 'synthFour' | 'dembow' | 'salsaPop' | 'cumbia' | 'boomBap' | 'lofiShuffle' | 'trap' | 'miami' | 'chaseFour' | 'ambient';

export type BassStyle = 'octaves' | 'pulse' | 'tumbao' | 'reggaeton' | 'walk' | 'sub' | 'eight08' | 'miami';
export type CompStyle = 'pad' | 'stabs' | 'montuno' | 'lazy' | 'reggaeton' | 'pluckChords';
export type ArpShape = 'up' | 'down' | 'updown' | 'pinky' | 'broken';

export interface ArpSpec {
  /** Notes per beat: 2 = eighths, 3 = triplets, 4 = sixteenths. */
  rate: 2 | 3 | 4;
  shape: ArpShape;
  octaves: 1 | 2;
}

/** A melodic idea: rhythm plus scale-degree contour, realized against whatever chord is playing. */
export interface Motif {
  /** [beat offset within the 2-bar cell, length in beats, contour degree, accent]. */
  notes: ReadonlyArray<readonly [number, number, number, number]>;
}

/** Timbre choices for this track (indices into each instrument's patch table). */
export interface PatchSet {
  bass: number;
  pad: number;
  keys: number;
  lead: number;
  arp: number;
  stab: number;
  kit: number;
}

export interface Track {
  station: StationId;
  index: number;
  seed: number;
  title: string;
  artist: string;
  bpm: number;
  /** Fraction of a sixteenth that off-beat sixteenths are delayed (0 straight … 0.33 heavy swing). */
  swing: number;
  /** Tonic MIDI pitch (bass register octave is derived). */
  tonic: number;
  scale: ScaleName;
  /** Scale degree per chord slot. */
  progression: readonly number[];
  /** Chord tone count: 3 triads, 4 sevenths, 5 ninths. */
  chordSize: number;
  /** Bars each chord lasts (0.5 = two chords per bar). */
  chordBars: number;
  raiseLeading: boolean;
  groove: GrooveId;
  bass: BassStyle;
  comp: CompStyle;
  arp: ArpSpec | null;
  /** Lead motifs: index 0 = A, 1 = answer B. */
  motifs: readonly Motif[];
  /** Lead register centre (MIDI). */
  leadCenter: number;
  sections: readonly Section[];
  bars: number;
  patch: PatchSet;
}

/** Seconds per beat. */
export const beatSec = (bpm: number): number => 60 / bpm;

export function trackSeconds(t: Pick<Track, 'bars' | 'bpm'>): number {
  return t.bars * 4 * beatSec(t.bpm);
}

export function sectionAt(track: Pick<Track, 'sections'>, bar: number): Section {
  const s = track.sections;
  for (let i = s.length - 1; i >= 0; i--) if (bar >= s[i]!.start) return s[i]!;
  return s[0]!;
}
