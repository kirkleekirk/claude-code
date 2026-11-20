import { hash2, hashString, Rng } from '@/core/rng';
import type { StationId } from '../api';
import { arpEvents, bassEvents, chordAt, compEvents, leadEvents, makeMotif } from './melody';
import { names } from './names';
import { fillEvents, grooveEvents, grooveFill } from './rhythm';
import { STYLES, type StyleDef } from './styles';
import { voiceChord, type ScaleName } from './theory';
import { DRUMS, sectionAt, type InstId, type Layer, type NoteEvent, type Section, type Track } from './types';

/**
 * Deterministic songwriting: `composeTrack(station, index)` always produces the same song, and
 * `barEvents(track, bar)` always produces the same notes for a bar. Stations are endless because
 * every index is a new song.
 */

const PERC: ReadonlySet<InstId> = new Set<InstId>(['conga', 'bongo', 'timbale', 'cowbell', 'clave', 'shaker', 'guiro']);

function pickScale(rng: Rng, style: StyleDef): ScaleName {
  const s = rng.weighted(style.scales, (x) => x[1]);
  return (s ?? style.scales[0]!)[0];
}

export function composeTrack(station: StationId, index: number, stationSeed = 0): Track {
  const style = STYLES[station];
  const seed = hash2(hashString(station) ^ stationSeed, index, 0x48485553);
  const rng = new Rng(seed);
  const scale = pickScale(rng, style);
  const groove = rng.pick(style.grooves);
  const tempoRange = groove === 'miami' ? [124, 130] : groove === 'trap' ? [136, 148] : groove === 'synthFour' ? [110, 118] : groove === 'synthHalf' ? [92, 106] : style.bpm;
  const bpm = Math.round(rng.range(tempoRange[0]!, tempoRange[1]!));
  const form = rng.pick(style.forms);
  const sections: Section[] = [];
  let start = 0;
  for (const [kind, bars, energy, layers] of form) {
    // Small variations: some sections run four bars longer or shorter.
    let len = bars;
    if (bars >= 16 && rng.chance(0.25)) len += rng.chance(0.5) ? -4 : 4;
    sections.push({ kind, start, bars: len, energy: Math.min(1, Math.max(0.1, energy + rng.range(-0.05, 0.05))), layers });
    start += len;
  }
  const leadKind = rng.pick(style.leadRhythms);
  const motifA = makeMotif(rng, leadKind);
  const motifB = makeMotif(rng, leadKind, motifA);
  const tonic = rng.pick(style.tonics);
  const minorish = scale === 'minor' || scale === 'dorian' || scale === 'harmonicMinor' || scale === 'phrygian';
  const title = names.title(station, rng);
  const artist = names.artist(station, rng);
  return {
    station, index, seed, title, artist, bpm,
    swing: rng.range(style.swing[0], style.swing[1]),
    tonic, scale,
    progression: rng.pick(style.progressions),
    chordSize: rng.int(style.chordSize[0], style.chordSize[1]),
    chordBars: rng.pick(style.chordBars),
    raiseLeading: minorish && rng.chance(style.raiseLeading),
    groove,
    bass: rng.pick(style.bassFor(groove)),
    comp: rng.pick(style.compFor(groove)),
    arp: rng.chance(style.arpChance) ? rng.pick(style.arps) : null,
    motifs: [motifA, motifB],
    leadCenter: tonic + style.leadLift,
    sections,
    bars: start,
    patch: {
      bass: rng.int(0, 2), pad: rng.int(0, 2), keys: rng.int(0, 2), lead: rng.int(0, 3), arp: rng.int(0, 2), stab: rng.int(0, 1), kit: rng.int(0, 1),
    },
  };
}

function hasLayer(s: Section, l: Layer): boolean {
  return s.layers.includes(l);
}

/** All notes of one bar. Pure: depends only on the track and the bar index. */
export function barEvents(track: Track, bar: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  if (bar < 0 || bar >= track.bars) return out;
  const style = STYLES[track.station];
  const sec = sectionAt(track, bar);
  const idx = track.sections.indexOf(sec);
  const next = track.sections[idx + 1];
  const rng = new Rng(hash2(track.seed, bar, 911));
  const lastBarOfSection = bar === sec.start + sec.bars - 1;
  const energy = sec.kind === 'outro' ? sec.energy * (1 - (bar - sec.start) / (sec.bars * 1.6)) : sec.energy;

  if (hasLayer(sec, 'drums') || hasLayer(sec, 'perc')) {
    const drums: NoteEvent[] = [];
    grooveEvents(track.groove, bar, energy, rng, drums);
    let cut = 4;
    if (lastBarOfSection && next && hasLayer(sec, 'drums')) {
      const build = sec.kind === 'build' || next.kind === 'chorus';
      const fill: NoteEvent[] = [];
      cut = fillEvents(grooveFill(track.groove, build), build ? 2 : 1, energy, fill);
      out.push(...fill);
    }
    for (const e of drums) {
      const isPerc = PERC.has(e.inst);
      if (isPerc ? !hasLayer(sec, 'perc') && !hasLayer(sec, 'drums') : !hasLayer(sec, 'drums')) continue;
      if (e.beat >= cut && !isPerc) continue;
      out.push(e);
    }
  }
  if (bar === sec.start && (sec.kind === 'chorus' || (sec.kind === 'verse' && idx > 1)) && hasLayer(sec, 'drums')) {
    out.push({ inst: 'crash', beat: 0, len: 2, note: 0, vel: 0.85 });
    if (hasLayer(sec, 'fx')) out.push({ inst: 'impact', beat: 0, len: 2, note: track.tonic - 24, vel: 0.8 });
  }
  if (hasLayer(sec, 'fx') && next && (next.kind === 'chorus') && bar === sec.start + sec.bars - 2) {
    out.push({ inst: 'riser', beat: 0, len: 8, note: track.tonic, vel: 0.7 });
  }
  if (hasLayer(sec, 'bass')) bassEvents(track, bar, energy, rng, out);
  if (hasLayer(sec, 'comp') || (hasLayer(sec, 'pad') && track.comp === 'pad')) {
    const prev = bar > 0 ? voiceChord(track.tonic, chordAt(track, bar - 1).semis, track.tonic + 7) : null;
    compEvents(track, bar, energy, prev, out);
  }
  if (hasLayer(sec, 'pad') && track.comp !== 'pad') {
    const c = chordAt(track, bar);
    const v = voiceChord(track.tonic, c.semis, track.tonic + 4);
    out.push({ inst: 'pad', beat: 0, len: 4, note: v[0]!, notes: v, vel: 0.45 + energy * 0.2 });
  }
  if (style.chorusStabs && sec.kind === 'chorus' && energy > 0.8) {
    const c = chordAt(track, bar);
    const v = voiceChord(track.tonic, c.semis, track.tonic + 12);
    for (const b of bar % 2 === 0 ? [1.5, 3] : [0.5, 1.5, 3.5]) out.push({ inst: 'stab', beat: b, len: 0.25, note: v[0]!, notes: v, vel: 0.8 });
  }
  if (hasLayer(sec, 'arp') && track.arp) arpEvents(track, bar, track.arp, energy, out);
  if (hasLayer(sec, 'lead')) leadEvents(track, bar, sec, out);
  if (bar === track.bars - 1) {
    // Final bar: let the last chord ring out.
    const c = chordAt(track, bar);
    const v = voiceChord(track.tonic, c.semis, track.tonic + 7);
    out.push({ inst: 'pad', beat: 0, len: 4, note: v[0]!, notes: v, vel: 0.5 });
  }
  for (const e of out) e.vel = Math.min(1, Math.max(0.05, e.vel));
  return out;
}

/** Instruments that use the sidechain pump. */
export function pumped(inst: InstId): boolean {
  return inst === 'pad' || inst === 'bass' || inst === 'keys' || inst === 'arp';
}

export function isDrum(inst: InstId): boolean {
  return DRUMS.has(inst);
}
