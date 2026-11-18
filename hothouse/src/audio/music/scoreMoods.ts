import { Rng } from '@/core/rng';
import type { ScoreMood, StationId } from '../api';
import { makeMotif } from './melody';
import type { Layer, Track } from './types';

/**
 * The dynamic score: one looping piece per mood, built from the same parts as the radio but
 * written for its job. Layers enter as `intensity` rises (thresholds below).
 */

export interface MoodDef {
  /** Which station's instruments and kit the mood borrows. */
  readonly kit: StationId;
  readonly track: Track;
  /** Minimum intensity for each layer to play; missing layers never play. */
  readonly layers: Partial<Record<Layer, number>>;
  /** Default intensity when the mood starts. */
  readonly intensity: number;
  /** Loudness calibration (dB) from the offline QA report. */
  readonly trimDb: number;
}

function loopTrack(p: Omit<Track, 'index' | 'seed' | 'motifs' | 'sections' | 'bars' | 'title' | 'artist' | 'leadCenter'> & {
  seed: number;
  bars: number;
  lead: 'long' | 'syncopated' | 'sparse' | 'plucky' | null;
  leadLift: number;
}): Track {
  const rng = new Rng(p.seed);
  const motifs = p.lead ? (() => {
    const a = makeMotif(rng, p.lead);
    return [a, makeMotif(rng, p.lead, a)];
  })() : [];
  return {
    station: p.station, index: 0, seed: p.seed, title: '', artist: '', bpm: p.bpm, swing: p.swing, tonic: p.tonic, scale: p.scale,
    progression: p.progression, chordSize: p.chordSize, chordBars: p.chordBars, raiseLeading: p.raiseLeading, groove: p.groove,
    bass: p.bass, comp: p.comp, arp: p.arp, motifs, leadCenter: p.tonic + p.leadLift,
    sections: [{ kind: 'chorus', start: 0, bars: p.bars, energy: 0.6, layers: ['drums', 'perc', 'bass', 'comp', 'pad', 'arp', 'lead'] }],
    bars: p.bars, patch: p.patch,
  };
}

export const MOODS: Readonly<Record<Exclude<ScoreMood, 'silent'>, MoodDef>> = {
  // The main-menu groove: lazy synthwave in D minor, sevenths, soft arps and a hook.
  menu: {
    kit: 'sunset', intensity: 0.6, trimDb: 0,
    layers: { pad: 0, bass: 0.1, arp: 0.25, drums: 0.35, lead: 0.5 },
    track: loopTrack({
      station: 'sunset', seed: 0x6d656e75, bars: 16, bpm: 92, swing: 0.04, tonic: 50, scale: 'minor', progression: [0, 5, 2, 6],
      chordSize: 4, chordBars: 2, raiseLeading: false, groove: 'synthHalf', bass: 'pulse', comp: 'pad',
      arp: { rate: 4, shape: 'updown', octaves: 2 }, lead: 'long', leadLift: 19,
      patch: { bass: 0, pad: 1, keys: 0, lead: 1, arp: 2, stab: 0, kit: 0 },
    }),
  },
  explore: {
    kit: 'haze', intensity: 0.4, trimDb: -3.3,
    layers: { comp: 0, pad: 0, arp: 0.3, bass: 0.4, drums: 0.55, lead: 0.75 },
    track: loopTrack({
      station: 'haze', seed: 0x6578706c, bars: 16, bpm: 80, swing: 0.18, tonic: 53, scale: 'major', progression: [0, 3, 1, 4],
      chordSize: 4, chordBars: 1, raiseLeading: false, groove: 'lofiShuffle', bass: 'sub', comp: 'lazy',
      arp: { rate: 2, shape: 'broken', octaves: 2 }, lead: 'sparse', leadLift: 19,
      patch: { bass: 0, pad: 0, keys: 0, lead: 2, arp: 0, stab: 0, kit: 0 },
    }),
  },
  calm: {
    kit: 'haze', intensity: 0.3, trimDb: -0.8,
    layers: { pad: 0, comp: 0.2, arp: 0.45, bass: 0.6 },
    track: loopTrack({
      station: 'haze', seed: 0x63616c6d, bars: 8, bpm: 70, swing: 0.1, tonic: 52, scale: 'lydian', progression: [0, 1, 0, 4],
      chordSize: 4, chordBars: 2, raiseLeading: false, groove: 'ambient', bass: 'sub', comp: 'pad',
      arp: { rate: 2, shape: 'up', octaves: 2 }, lead: null, leadLift: 19,
      patch: { bass: 0, pad: 0, keys: 1, lead: 0, arp: 0, stab: 0, kit: 0 },
    }),
  },
  tension: {
    kit: 'bass', intensity: 0.4, trimDb: 1.8,
    layers: { pad: 0, bass: 0, drums: 0.3, arp: 0.55, comp: 0.75 },
    track: loopTrack({
      station: 'bass', seed: 0x74656e73, bars: 8, bpm: 100, swing: 0, tonic: 52, scale: 'phrygian', progression: [0, 1, 0, 6],
      chordSize: 3, chordBars: 2, raiseLeading: false, groove: 'ambient', bass: 'pulse', comp: 'pad',
      arp: { rate: 4, shape: 'pinky', octaves: 1 }, lead: null, leadLift: 19,
      patch: { bass: 1, pad: 0, keys: 0, lead: 0, arp: 0, stab: 1, kit: 0 },
    }),
  },
  chase: {
    kit: 'sunset', intensity: 0.6, trimDb: 2.5,
    layers: { drums: 0, bass: 0, comp: 0.3, arp: 0.45, pad: 0.55, lead: 0.75, fx: 0.9 },
    track: loopTrack({
      station: 'sunset', seed: 0x63686173, bars: 8, bpm: 136, swing: 0, tonic: 52, scale: 'minor', progression: [0, 5, 6, 4],
      chordSize: 3, chordBars: 1, raiseLeading: true, groove: 'chaseFour', bass: 'octaves', comp: 'stabs',
      arp: { rate: 4, shape: 'up', octaves: 2 }, lead: 'syncopated', leadLift: 17,
      patch: { bass: 2, pad: 0, keys: 0, lead: 0, arp: 0, stab: 1, kit: 0 },
    }),
  },
  raid: {
    kit: 'bass', intensity: 0.6, trimDb: 0,
    layers: { pad: 0, drums: 0, bass: 0.2, comp: 0.5, lead: 0.7 },
    track: loopTrack({
      station: 'bass', seed: 0x72616964, bars: 8, bpm: 96, swing: 0, tonic: 50, scale: 'phrygian', progression: [0, 0, 1, 6],
      chordSize: 3, chordBars: 1, raiseLeading: false, groove: 'synthHalf', bass: 'eight08', comp: 'stabs',
      arp: null, lead: 'sparse', leadLift: 19,
      patch: { bass: 2, pad: 2, keys: 0, lead: 0, arp: 0, stab: 1, kit: 1 },
    }),
  },
  setpiece: {
    kit: 'sunset', intensity: 0.8, trimDb: 1.7,
    layers: { pad: 0, drums: 0, bass: 0, arp: 0.3, lead: 0.55, fx: 0.8 },
    track: loopTrack({
      station: 'sunset', seed: 0x73657470, bars: 16, bpm: 118, swing: 0, tonic: 53, scale: 'minor', progression: [5, 6, 0, 0],
      chordSize: 3, chordBars: 1, raiseLeading: false, groove: 'synthFour', bass: 'octaves', comp: 'pad',
      arp: { rate: 4, shape: 'up', octaves: 2 }, lead: 'long', leadLift: 19,
      patch: { bass: 0, pad: 0, keys: 0, lead: 0, arp: 0, stab: 0, kit: 0 },
    }),
  },
};

/** Section energy for a given intensity (drives drum density and velocities). */
export function energyFor(intensity: number): number {
  return 0.3 + Math.min(1, Math.max(0, intensity)) * 0.7;
}
