import { describe, expect, it } from 'vitest';
import type { StationId } from '@/audio/api';
import { barEvents, composeTrack } from '@/audio/music/composer';
import { chordAt } from '@/audio/music/melody';
import { ADS, names } from '@/audio/music/names';
import { GROOVES } from '@/audio/music/rhythm';
import { STYLES } from '@/audio/music/styles';
import { chordSemis, degreeOf, degreeSemis, nearestPc, scaleNote, snapToScale, voiceChord, SCALES } from '@/audio/music/theory';
import { trackSeconds } from '@/audio/music/types';
import { Rng } from '@/core/rng';

const STATIONS: StationId[] = ['sunset', 'calle', 'haze', 'bass'];

describe('theory', () => {
  it('maps degrees across octaves', () => {
    expect(degreeSemis('major', 0)).toBe(0);
    expect(degreeSemis('major', 7)).toBe(12);
    expect(degreeSemis('major', -1)).toBe(-1);
    expect(degreeSemis('minor', 2)).toBe(3);
    expect(scaleNote(60, 'major', 4)).toBe(67);
  });

  it('builds diatonic chords and the harmonic-minor dominant', () => {
    expect(chordSemis('major', 0, 3)).toEqual([0, 4, 7]);
    expect(chordSemis('major', 1, 4)).toEqual([2, 5, 9, 12]);
    expect(chordSemis('minor', 4, 3)).toEqual([7, 10, 14]);
    expect(chordSemis('minor', 4, 3, true)).toEqual([7, 11, 14]);
  });

  it('voices chords near the centre with smooth voice leading', () => {
    const c = voiceChord(60, [0, 4, 7], 66);
    expect(c.length).toBe(3);
    for (const p of c) expect(Math.abs(p - 66)).toBeLessThanOrEqual(12);
    const f = voiceChord(60, [5, 9, 12], 66, c);
    const movement = f.reduce((s, p, i) => s + Math.abs(p - c[i]!), 0);
    expect(movement).toBeLessThanOrEqual(6);
  });

  it('snaps pitches into the scale and to chord tones', () => {
    expect(snapToScale(60, 'major', 61)).toBe(60);
    expect(SCALES.major.map((s) => (60 + s) % 12)).toContain(snapToScale(60, 'major', 66) % 12);
    expect(nearestPc(65, [0, 4, 7])).toBe(64);
    expect(degreeOf(60, 'major', 67)).toBe(4);
    expect(degreeOf(60, 'major', 72)).toBe(7);
  });
});

describe('composer', () => {
  it('is deterministic per station and index', () => {
    for (const s of STATIONS) {
      const a = composeTrack(s, 3);
      const b = composeTrack(s, 3);
      expect(a).toEqual(b);
      expect(barEvents(a, 20)).toEqual(barEvents(b, 20));
    }
  });

  it('produces varied tracks in the style’s tempo range and a sensible length', () => {
    for (const s of STATIONS) {
      const tracks = Array.from({ length: 12 }, (_, i) => composeTrack(s, i));
      const titles = new Set(tracks.map((t) => t.title));
      const keys = new Set(tracks.map((t) => `${t.tonic}:${t.scale}`));
      const progs = new Set(tracks.map((t) => t.progression.join(',')));
      expect(titles.size).toBeGreaterThanOrEqual(9);
      expect(keys.size).toBeGreaterThanOrEqual(4);
      expect(progs.size).toBeGreaterThanOrEqual(3);
      for (const t of tracks) {
        expect(t.bpm).toBeGreaterThanOrEqual(Math.min(STYLES[s].bpm[0], 92));
        expect(t.bpm).toBeLessThanOrEqual(Math.max(STYLES[s].bpm[1], 148));
        const secs = trackSeconds(t);
        expect(secs).toBeGreaterThan(80);
        expect(secs).toBeLessThan(330);
        expect(t.sections[0]!.start).toBe(0);
        const last = t.sections[t.sections.length - 1]!;
        expect(last.start + last.bars).toBe(t.bars);
      }
    }
  });

  it('every bar has notes, all values are finite and in range', () => {
    for (const s of STATIONS) {
      for (let i = 0; i < 4; i++) {
        const t = composeTrack(s, i);
        let empty = 0;
        for (let bar = 0; bar < t.bars; bar++) {
          const ev = barEvents(t, bar);
          if (ev.length === 0) empty++;
          for (const e of ev) {
            expect(Number.isFinite(e.beat) && Number.isFinite(e.len) && Number.isFinite(e.note) && Number.isFinite(e.vel)).toBe(true);
            expect(e.beat).toBeGreaterThanOrEqual(0);
            expect(e.beat).toBeLessThan(4);
            expect(e.len).toBeGreaterThan(0);
            expect(e.vel).toBeGreaterThan(0);
            expect(e.vel).toBeLessThanOrEqual(1);
            if (e.inst === 'bass') {
              expect(e.note).toBeGreaterThanOrEqual(24);
              expect(e.note).toBeLessThanOrEqual(64);
            }
            if (e.inst === 'lead') {
              expect(Math.abs(e.note - t.leadCenter)).toBeLessThanOrEqual(13);
            }
          }
        }
        expect(empty).toBe(0);
      }
    }
  });

  it('leads land on chord tones on accented beats', () => {
    const t = composeTrack('sunset', 1);
    const chorus = t.sections.find((s) => s.layers.includes('lead'))!;
    let accented = 0;
    let onChord = 0;
    for (let bar = chorus.start; bar < chorus.start + chorus.bars; bar++) {
      for (const e of barEvents(t, bar)) {
        if (e.inst !== 'lead' || e.beat % 2 !== 0) continue;
        accented++;
        if (chordAt(t, bar, e.beat).pcs.includes(((e.note % 12) + 12) % 12)) onChord++;
      }
    }
    expect(accented).toBeGreaterThan(4);
    expect(onChord / accented).toBeGreaterThan(0.85);
  });

  it('builds into choruses with fills, crashes and risers', () => {
    const t = composeTrack('sunset', 0);
    const chorusIdx = t.sections.findIndex((s, i) => i > 0 && s.kind === 'chorus');
    const chorus = t.sections[chorusIdx]!;
    const before = barEvents(t, chorus.start - 1);
    const at = barEvents(t, chorus.start);
    expect(at.some((e) => e.inst === 'crash')).toBe(true);
    expect(before.some((e) => e.inst === 'tom' || e.inst === 'snare')).toBe(true);
  });
});

describe('grooves and names', () => {
  it('groove patterns are 16 or 32 steps of known symbols', () => {
    for (const g of Object.values(GROOVES)) {
      for (const line of g.lines) {
        expect([16, 32]).toContain(line.pat.length);
        expect(/^[.goxXrR]+$/.test(line.pat)).toBe(true);
      }
    }
  });

  it('names are deterministic, original and never blocked titles', () => {
    for (const s of STATIONS) {
      const r1 = new Rng(5);
      const r2 = new Rng(5);
      for (let i = 0; i < 30; i++) {
        const t = names.title(s, r1);
        expect(t).toBe(names.title(s, r2));
        expect(names.isBlocked(t)).toBe(false);
        expect(t.length).toBeGreaterThan(3);
      }
    }
    expect(ADS.length).toBeGreaterThanOrEqual(15);
    for (const ad of ADS) expect(ad.caption.length).toBeLessThan(160);
  });
});
