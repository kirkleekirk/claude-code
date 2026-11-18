import type { StationId } from '../api';
import type { LEAD_RHYTHMS } from './melody';
import type { ScaleName } from './theory';
import type { ArpSpec, BassStyle, CompStyle, GrooveId, Layer, SectionKind } from './types';

/**
 * The musical identity of each radio station: tempo, harmony, groove, parts and song forms.
 * The composer draws every track from these pools, so a station is instantly recognizable while
 * no two tracks are the same.
 */

export type Form = ReadonlyArray<readonly [SectionKind, number, number, readonly Layer[]]>;

export interface StyleDef {
  readonly station: StationId;
  readonly bpm: readonly [number, number];
  readonly swing: readonly [number, number];
  readonly scales: ReadonlyArray<readonly [ScaleName, number]>;
  readonly tonics: readonly number[];
  readonly progressions: ReadonlyArray<readonly number[]>;
  readonly chordSize: readonly [number, number];
  readonly chordBars: readonly number[];
  readonly grooves: readonly GrooveId[];
  readonly bassFor: (groove: GrooveId) => readonly BassStyle[];
  readonly compFor: (groove: GrooveId) => readonly CompStyle[];
  readonly arpChance: number;
  readonly arps: readonly ArpSpec[];
  readonly leadRhythms: ReadonlyArray<keyof typeof LEAD_RHYTHMS>;
  /** Lead register above the tonic, semitones. */
  readonly leadLift: number;
  readonly forms: readonly Form[];
  /** Chance a minor-key dominant becomes major (harmonic minor colour). */
  readonly raiseLeading: number;
  /** Brass/synth stabs on top in high-energy choruses. */
  readonly chorusStabs: boolean;
  /** Continuous vinyl crackle under the track. */
  readonly vinyl: boolean;
  /** Sidechain pumping on pads and bass from the kick. */
  readonly pump: number;
  /** Station loudness trim (dB) so all four sit at the same perceived level. */
  readonly trimDb: number;
}

const ALL: readonly Layer[] = ['drums', 'perc', 'bass', 'comp', 'pad', 'arp', 'lead', 'fx'];

export const STYLES: Readonly<Record<StationId, StyleDef>> = {
  sunset: {
    station: 'sunset',
    bpm: [92, 118],
    swing: [0, 0.03],
    scales: [['minor', 5], ['dorian', 2], ['major', 1]],
    tonics: [50, 51, 52, 53, 54, 55, 57],
    progressions: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 4], [0, 6, 5, 6], [0, 2, 5, 6], [3, 4, 0, 0], [0, 5, 3, 4], [5, 6, 0, 0]],
    chordSize: [3, 4],
    chordBars: [1, 2],
    grooves: ['synthHalf', 'synthFour'],
    bassFor: () => ['octaves', 'octaves', 'pulse'],
    compFor: () => ['pad', 'pad', 'pluckChords'],
    arpChance: 0.85,
    arps: [{ rate: 4, shape: 'up', octaves: 2 }, { rate: 4, shape: 'updown', octaves: 2 }, { rate: 4, shape: 'pinky', octaves: 1 }, { rate: 2, shape: 'broken', octaves: 2 }],
    leadRhythms: ['long', 'syncopated', 'long'],
    leadLift: 19,
    forms: [
      [['intro', 8, 0.25, ['pad', 'arp', 'fx']], ['verse', 16, 0.55, ['drums', 'bass', 'pad', 'arp']], ['build', 8, 0.7, ['drums', 'bass', 'pad', 'arp', 'fx']],
        ['chorus', 16, 0.95, ALL], ['breakdown', 8, 0.35, ['pad', 'arp', 'lead']], ['chorus', 16, 1, ALL], ['outro', 8, 0.35, ['drums', 'pad', 'arp']]],
      [['intro', 4, 0.2, ['pad', 'fx']], ['verse', 16, 0.5, ['drums', 'bass', 'pad', 'arp']], ['chorus', 16, 0.9, ALL],
        ['bridge', 8, 0.45, ['bass', 'pad', 'lead']], ['build', 4, 0.7, ['drums', 'pad', 'arp', 'fx']], ['chorus', 16, 1, ALL], ['outro', 8, 0.3, ['pad', 'arp']]],
    ],
    raiseLeading: 0.15,
    chorusStabs: false,
    vinyl: false,
    pump: 0.35,
    trimDb: -1.4,
  },
  calle: {
    station: 'calle',
    bpm: [90, 108],
    swing: [0, 0.06],
    scales: [['minor', 4], ['harmonicMinor', 1], ['major', 2], ['dorian', 1]],
    tonics: [52, 53, 54, 55, 56, 57, 59],
    progressions: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 6, 2], [5, 6, 0, 0], [0, 4, 5, 3], [0, 3, 4, 4], [0, 3, 0, 4]],
    chordSize: [3, 4],
    chordBars: [1, 1, 2],
    grooves: ['dembow', 'dembow', 'salsaPop', 'cumbia'],
    bassFor: (g) => (g === 'dembow' ? ['reggaeton'] : g === 'salsaPop' ? ['tumbao'] : ['walk']),
    compFor: (g) => (g === 'dembow' ? ['reggaeton', 'pad'] : g === 'salsaPop' ? ['montuno'] : ['montuno', 'pluckChords']),
    arpChance: 0.3,
    arps: [{ rate: 2, shape: 'broken', octaves: 2 }, { rate: 4, shape: 'updown', octaves: 1 }],
    leadRhythms: ['syncopated'],
    leadLift: 17,
    forms: [
      [['intro', 4, 0.3, ['perc', 'comp', 'fx']], ['verse', 16, 0.6, ['drums', 'perc', 'bass', 'comp']], ['build', 8, 0.7, ['drums', 'perc', 'bass', 'comp', 'fx']],
        ['chorus', 16, 0.95, ALL], ['verse', 8, 0.55, ['drums', 'perc', 'bass', 'comp']], ['chorus', 16, 1, ALL], ['outro', 4, 0.3, ['perc', 'comp']]],
      [['intro', 8, 0.35, ['perc', 'bass', 'comp']], ['verse', 16, 0.6, ['drums', 'perc', 'bass', 'comp', 'arp']], ['chorus', 16, 0.95, ALL],
        ['breakdown', 8, 0.4, ['perc', 'comp', 'lead']], ['chorus', 16, 1, ALL], ['outro', 8, 0.3, ['perc', 'comp']]],
    ],
    raiseLeading: 0.6,
    chorusStabs: true,
    vinyl: false,
    pump: 0,
    trimDb: 1,
  },
  haze: {
    station: 'haze',
    bpm: [70, 88],
    swing: [0.12, 0.28],
    scales: [['major', 4], ['dorian', 3], ['mixolydian', 1], ['minor', 1]],
    tonics: [50, 51, 52, 53, 55, 56, 57],
    progressions: [[1, 4, 0, 5], [0, 3, 1, 4], [3, 2, 1, 0], [0, 5, 1, 4], [3, 4, 2, 5], [0, 0, 3, 3], [5, 1, 4, 0]],
    chordSize: [4, 5],
    chordBars: [1],
    grooves: ['boomBap', 'lofiShuffle', 'lofiShuffle', 'ambient'],
    bassFor: () => ['walk', 'sub', 'sub'],
    compFor: () => ['lazy', 'lazy', 'pad'],
    arpChance: 0.3,
    arps: [{ rate: 2, shape: 'broken', octaves: 2 }, { rate: 3, shape: 'up', octaves: 1 }],
    leadRhythms: ['sparse'],
    leadLift: 19,
    forms: [
      [['intro', 4, 0.2, ['comp', 'fx']], ['verse', 16, 0.5, ['drums', 'bass', 'comp', 'pad']], ['chorus', 16, 0.65, ['drums', 'bass', 'comp', 'lead', 'pad']],
        ['verse', 16, 0.55, ['drums', 'bass', 'comp', 'arp']], ['outro', 8, 0.25, ['comp', 'lead']]],
      [['intro', 8, 0.25, ['comp', 'pad']], ['verse', 16, 0.5, ['drums', 'bass', 'comp']], ['chorus', 16, 0.6, ['drums', 'bass', 'comp', 'lead', 'arp']],
        ['breakdown', 8, 0.3, ['comp', 'pad', 'lead']], ['chorus', 16, 0.65, ['drums', 'bass', 'comp', 'lead']], ['outro', 4, 0.2, ['comp']]],
    ],
    raiseLeading: 0,
    chorusStabs: false,
    vinyl: true,
    pump: 0,
    trimDb: 1,
  },
  bass: {
    station: 'bass',
    bpm: [124, 148],
    swing: [0, 0.05],
    scales: [['minor', 3], ['phrygian', 2], ['harmonicMinor', 1]],
    tonics: [49, 50, 51, 52, 53, 54],
    progressions: [[0, 0, 5, 6], [0, 5, 3, 4], [0, 1, 0, 1], [0, 3, 0, 5], [0, 6, 5, 4], [0, 0, 3, 3]],
    chordSize: [3, 3],
    chordBars: [2, 1],
    grooves: ['trap', 'trap', 'miami'],
    bassFor: (g) => (g === 'miami' ? ['miami'] : ['eight08']),
    compFor: (g) => (g === 'miami' ? ['stabs', 'pad'] : ['pad', 'pluckChords']),
    arpChance: 0.5,
    arps: [{ rate: 3, shape: 'up', octaves: 2 }, { rate: 4, shape: 'pinky', octaves: 1 }],
    leadRhythms: ['plucky', 'sparse'],
    leadLift: 19,
    forms: [
      [['intro', 8, 0.3, ['pad', 'lead', 'fx']], ['chorus', 16, 1, ['drums', 'bass', 'pad', 'lead', 'fx']], ['verse', 16, 0.6, ['drums', 'bass', 'pad', 'arp']],
        ['build', 4, 0.5, ['pad', 'arp', 'fx']], ['chorus', 16, 1, ['drums', 'bass', 'pad', 'lead', 'fx']], ['outro', 8, 0.3, ['pad', 'arp']]],
      [['intro', 4, 0.35, ['drums', 'pad']], ['verse', 16, 0.65, ['drums', 'bass', 'comp', 'arp']], ['build', 4, 0.6, ['drums', 'pad', 'fx']],
        ['chorus', 16, 1, ['drums', 'bass', 'comp', 'lead', 'fx']], ['bridge', 8, 0.4, ['pad', 'lead']], ['chorus', 16, 1, ['drums', 'bass', 'comp', 'lead', 'fx']], ['outro', 4, 0.3, ['pad']]],
    ],
    raiseLeading: 0.3,
    chorusStabs: false,
    vinyl: false,
    pump: 0.25,
    trimDb: -1.4,
  },
};
