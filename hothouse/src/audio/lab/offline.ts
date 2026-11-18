import { Ambience } from '../ambience/ambience';
import type { AmbienceContext, EngineFrame, EngineProfile, LoopSound, ScoreMood, Sfx, StationId, SurfaceKind, UiSound } from '../api';
import { AudioEngine } from '../engine/AudioEngine';
import { Mixer } from '../engine/mixer';
import { composeTrack } from '../music/composer';
import { ADS } from '../music/names';
import { TrackPlayer } from '../music/player';
import { Radio } from '../music/radio';
import { Score } from '../music/score';
import { MOODS } from '../music/scoreMoods';
import { DJ_VOICE, SpotPlayer } from '../music/spots';
import { playStinger, type StingerKind } from '../music/stingers';
import type { Segment } from '../music/station';
import { beatSec } from '../music/types';
import { SynthEngineVoice } from '../synth/engineVoice';
import { LOOP_IDS } from '../synth/loops';
import { SFX_IDS } from '../synth/sfx';
import { UI_SOUNDS } from '../synth/ui';
import { playBlip } from '../synth/blip';
import { analyze, dominantHz, wavBase64, type Stats } from './analysis';

/**
 * The audio QA report: renders every sound family through the real mixer into an
 * `OfflineAudioContext` and measures it. Offline `suspend()` points drive the real-time code paths
 * (radio timeline, score lookahead and crossfades, ambience events, engine updates).
 */

const SR = 44100;

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  pickupI6: { cylinders: 6, idleRpm: 750, redlineRpm: 5200, rasp: 0.35, bass: 0.7, turbo: 0, pops: 0.1, flavor: 'piston' },
  muscleV8: { cylinders: 8, idleRpm: 800, redlineRpm: 6400, rasp: 0.55, bass: 0.9, turbo: 0, pops: 0.6, flavor: 'bigBlock' },
  tunerI4: { cylinders: 4, idleRpm: 950, redlineRpm: 8200, rasp: 0.6, bass: 0.3, turbo: 0.9, pops: 0.8, flavor: 'piston' },
  exoticV10: { cylinders: 10, idleRpm: 1000, redlineRpm: 8700, rasp: 0.5, bass: 0.5, turbo: 0, pops: 0.4, flavor: 'exotic' },
  scooter: { cylinders: 1, idleRpm: 1500, redlineRpm: 9000, rasp: 0.7, bass: 0.1, turbo: 0, pops: 0, flavor: 'twoStroke' },
};

type Tick = (t: number) => void;

async function render(seconds: number, setup: (ctx: OfflineAudioContext, mixer: Mixer) => Tick | void, step = 0.1): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const mixer = new Mixer(ctx, ctx.destination);
  const tick = setup(ctx, mixer);
  if (tick) {
    const quantum = 128 / SR;
    const seen = new Set<number>();
    for (let t = step; t < seconds - 0.05; t += step) {
      const at = Math.round(t / quantum) * quantum;
      const key = Math.round(at * SR);
      if (seen.has(key)) continue;
      seen.add(key);
      void ctx.suspend(at).then(() => {
        tick(at);
        void ctx.resume();
      });
    }
  }
  return ctx.startRendering();
}

async function renderEngine(seconds: number, fn: (engine: AudioEngine) => void): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const engine = new AudioEngine();
  engine.build(ctx, ctx.destination);
  fn(engine);
  return ctx.startRendering();
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Report {
  sampleRate: number;
  ui: Record<string, Stats>;
  sfx: Record<string, Stats>;
  footsteps: Record<string, Stats>;
  loops: Record<string, Stats>;
  engine: Record<string, { rpm: number; hz: number; expected: number; lufs: number }[]>;
  blips: Record<string, Stats>;
  stations: Record<string, Array<{ title: string; artist: string; bpm: number; stats: Stats }>>;
  radio: { stats: Stats; nowPlaying: string };
  score: Record<string, Stats>;
  scoreTransition: { menu: Stats; chase: Stats; chaseIntense: Stats };
  stingers: Record<string, Stats>;
  spots: Record<string, Stats>;
  ambience: Record<string, Stats>;
  checks: Check[];
  wavs: Record<string, string>;
  ms: number;
}

const FRAME = (rpm: number, throttle: number, slip = 0, surface: SurfaceKind = 'asphalt'): EngineFrame => ({
  rpm, throttle, load: throttle, speed: rpm / 200, slip, surface, interior: false, x: 0, y: 0, z: -4,
});

export async function runReport(progress: (label: string) => void = () => undefined, withWavs = true): Promise<Report> {
  const t0 = performance.now();
  const r: Report = {
    sampleRate: SR, ui: {}, sfx: {}, footsteps: {}, loops: {}, engine: {}, blips: {}, stations: {}, radio: { stats: null as unknown as Stats, nowPlaying: '' },
    score: {}, scoreTransition: null as unknown as Report['scoreTransition'], stingers: {}, spots: {}, ambience: {}, checks: [], wavs: {}, ms: 0,
  };

  progress('UI sounds');
  for (const id of UI_SOUNDS) r.ui[id] = analyze(await renderEngine(id === 'rankUp' || id === 'discover' ? 2 : 1.2, (e) => e.ui(id as UiSound)));

  progress('Sound effects');
  for (const id of SFX_IDS) {
    const len = id === 'thunder' ? 6 : id === 'firework' || id === 'crowdCheer' ? 3.5 : 2;
    r.sfx[id] = analyze(await renderEngine(len, (e) => e.sfx(id as Sfx, { intensity: 0.6 })));
  }
  r.sfx['gunPistol@25m'] = analyze(await renderEngine(2, (e) => {
    e.setListener(0, 1.6, 0, 0, 0, -1);
    e.sfx('gunPistol', { x: 10, y: 1, z: -23 });
  }));
  for (const s of ['asphalt', 'concrete', 'tile', 'sand', 'grass', 'gravel', 'wood', 'metal', 'water'] as SurfaceKind[]) {
    r.footsteps[s] = analyze(await renderEngine(0.6, (e) => e.sfx('footstep', { surface: s, intensity: 0.6 })));
  }

  progress('Loops');
  for (const id of LOOP_IDS) {
    r.loops[id] = analyze(await renderEngine(2, (e) => {
      const h = e.loop(id as LoopSound);
      h.set(1, 0.5);
      e.update(0);
    }), 0.6);
  }

  progress('Engines');
  for (const [name, p] of Object.entries(ENGINE_PROFILES)) {
    const rows: { rpm: number; hz: number; expected: number; lufs: number }[] = [];
    for (const frac of [0.05, 0.3, 0.55, 0.85]) {
      const rpm = Math.round(p.idleRpm + (p.redlineRpm - p.idleRpm) * frac);
      const buf = await render(1.4, (ctx, mixer) => {
        const v = new SynthEngineVoice(ctx, p, mixer.input.sfx, { x: 0, y: 0, z: 0 }, true);
        v.update(FRAME(rpm, 0.6));
      });
      const fire = (rpm / 60) * (p.flavor === 'twoStroke' ? p.cylinders : p.cylinders / 2);
      rows.push({ rpm, hz: Math.round(dominantHz(buf, 0.6, 20, 1500) * 10) / 10, expected: Math.round(fire * 10) / 10, lufs: analyze(buf, 0.6).lufs });
    }
    r.engine[name] = rows;
  }
  const sweep = await render(5, (ctx, mixer) => {
    const v = new SynthEngineVoice(ctx, ENGINE_PROFILES.muscleV8!, mixer.input.sfx, { x: 0, y: 0, z: 0 }, true);
    v.update(FRAME(800, 0));
    return (t) => {
      const ramp = t < 3.2 ? t / 3.2 : 1 - (t - 3.2) * 0.5;
      const throttle = t < 3.2 ? 1 : 0;
      v.update(FRAME(800 + 5400 * Math.max(0, ramp), throttle, t > 2 && t < 3 ? 0.6 : 0));
    };
  }, 0.05);
  if (withWavs) r.wavs['engine-v8-sweep'] = wavBase64(sweep, 5);

  progress('Dialogue blips');
  for (const [name, voice] of [...Object.entries(DJ_VOICE), ['announcer', { pitch: 138, brightness: 0.62, expressiveness: 0.7 }] as const]) {
    r.blips[name] = analyze(await render(2, (ctx, mixer) => {
      let at = 0.05;
      for (let i = 0; i < 14; i++) at = playBlip(ctx, mixer.input.barks, voice, i % 5 === 0 ? 0.8 : 0.2, at) + (i % 4 === 3 ? 0.18 : 0.015);
    }));
  }

  progress('Radio stations');
  for (const station of ['sunset', 'calle', 'haze', 'bass'] as StationId[]) {
    const rows: Report['stations'][string] = [];
    for (let i = 0; i < 3; i++) {
      const track = composeTrack(station, i);
      const chorus = track.sections.find((s) => s.kind === 'chorus') ?? track.sections[1]!;
      const startSec = chorus.start * 4 * beatSec(track.bpm);
      const buf = await render(14, (ctx, mixer) => {
        const p = new TrackPlayer(ctx, { station, output: mixer.input.music, hall: mixer.hallSend });
        p.play(track, 0.05 - startSec);
        p.scheduleUntil(14);
      });
      rows.push({ title: track.title, artist: track.artist, bpm: track.bpm, stats: analyze(buf, 0.5) });
      if (withWavs && i === 0) r.wavs[`station-${station}`] = wavBase64(buf, 10);
    }
    r.stations[station] = rows;
  }
  {
    let nowPlaying = '';
    const buf = await render(20, (ctx, mixer) => {
      const radio = new Radio(3, () => 5000 + ctx.currentTime);
      radio.attach({ ctx, music: mixer.input.music, hall: mixer.hallSend });
      radio.setStation('calle');
      radio.setAudible(1, true);
      radio.update();
      return () => {
        radio.update();
        const np = radio.nowPlaying.peek();
        if (np) nowPlaying = `${np.title} — ${np.artist}${np.caption ? ` [${np.caption}]` : ''}`;
      };
    }, 0.1);
    r.radio = { stats: analyze(buf, 0.5), nowPlaying };
  }

  progress('Score');
  for (const mood of Object.keys(MOODS) as Array<Exclude<ScoreMood, 'silent'>>) {
    const buf = await render(12, (ctx, mixer) => {
      const s = new Score();
      s.attach({ ctx, music: mixer.input.music, hall: mixer.hallSend, duck: (a, sec) => mixer.duck('music', a, sec) });
      s.setMood(mood);
      s.update();
      return () => s.update();
    }, 0.1);
    r.score[mood] = analyze(buf, 2);
    if (withWavs && mood === 'menu') r.wavs['score-menu'] = wavBase64(buf, 12);
  }
  {
    const buf = await render(26, (ctx, mixer) => {
      const s = new Score();
      s.attach({ ctx, music: mixer.input.music, hall: mixer.hallSend, duck: (a, sec) => mixer.duck('music', a, sec) });
      s.setMood('menu');
      s.update();
      let switched = 0;
      return (t) => {
        if (t >= 8 && switched === 0) {
          s.setMood('chase');
          s.setIntensity(0.3);
          switched = 1;
        }
        if (t >= 17 && switched === 1) {
          s.setIntensity(1);
          switched = 2;
        }
        s.update();
      };
    }, 0.1);
    const slice = (a: number, b: number) => {
      const c = new AudioBuffer({ numberOfChannels: 2, length: Math.ceil((b - a) * SR), sampleRate: SR });
      for (let ch = 0; ch < 2; ch++) c.copyToChannel(buf.getChannelData(ch).subarray(Math.floor(a * SR), Math.floor(b * SR)), ch);
      return c;
    };
    r.scoreTransition = { menu: analyze(slice(2, 8)), chase: analyze(slice(11, 17)), chaseIntense: analyze(slice(20, 26)) };
    if (withWavs) r.wavs['score-menu-to-chase'] = wavBase64(buf, 26);
  }

  progress('Stingers');
  for (const kind of ['logo', 'title', 'rankUp', 'discovery', 'busted', 'escaped', 'missionPassed', 'missionFailed', 'perfect'] as StingerKind[]) {
    r.stingers[kind] = analyze(await render(3.5, (ctx, mixer) => {
      playStinger(ctx, mixer.input.music, mixer.hallSend, kind, 0.05);
    }));
  }

  progress('Spots');
  const spotSegs: Record<string, Segment> = {
    ad: { kind: 'ad', start: 0, dur: 13, ad: ADS[0]!, n: 1 },
    ident: { kind: 'ident', start: 0, dur: 5.5, text: 'Sunset FM 101.9', n: 2 },
    news: { kind: 'news', start: 0, dur: 9, text: 'Halcyon News Flash — test', n: 3 },
  };
  for (const [name, seg] of Object.entries(spotSegs)) {
    const buf = await render(seg.dur, (ctx, mixer) => {
      const sp = new SpotPlayer(ctx, mixer.input.music, mixer.hallSend, seg, 'sunset', 0.02);
      sp.scheduleUntil(seg.dur);
    });
    r.spots[name] = analyze(buf);
    if (withWavs && name === 'ad') r.wavs['spot-ad'] = wavBase64(buf, 13);
  }

  progress('Ambience');
  const ambCases: Array<[string, AmbienceContext]> = [];
  const base: AmbienceContext = { district: 'flats', hours: 13, rain: 0, storm: 0, wind: 0.3, indoor: 0, water: 0, crowd: 0, traffic: 0.3 };
  for (const d of ['flats', 'strand', 'deco', 'crown', 'harbor', 'sawgrass', 'isla', 'keys']) {
    for (const [label, h] of [['dawn', 6.5], ['midday', 13], ['dusk', 19.5], ['night', 23]] as const) {
      ambCases.push([`${d}-${label}`, { ...base, district: d, hours: h, water: d === 'strand' || d === 'keys' || d === 'isla' ? 0.8 : d === 'harbor' ? 0.6 : 0.1, crowd: d === 'strand' ? 0.5 : 0 }]);
    }
  }
  ambCases.push(['strand-storm', { ...base, district: 'strand', hours: 18, rain: 1, storm: 1, wind: 1, water: 0.8 }]);
  ambCases.push(['flats-rain', { ...base, hours: 10, rain: 0.7, storm: 0.2 }]);
  ambCases.push(['indoor', { ...base, indoor: 1 }]);
  for (const [name, c] of ambCases) {
    const buf = await render(6, (ctx, mixer) => {
      const a = new Ambience();
      a.attach(ctx, mixer.input.ambience);
      a.set(c);
      mixer.setIndoor(c.indoor);
      a.update(0.25);
      return () => a.update(0.25);
    }, 0.25);
    r.ambience[name] = analyze(buf, 3);
    if (withWavs && name === 'strand-dusk') r.wavs['ambience-strand-dusk'] = wavBase64(buf, 6);
  }

  r.checks = evaluate(r);
  r.ms = Math.round(performance.now() - t0);
  return r;
}

function evaluate(r: Report): Check[] {
  const checks: Check[] = [];
  const all: Array<[string, Stats]> = [];
  const add = (group: string, rec: Record<string, Stats>) => Object.entries(rec).forEach(([k, v]) => all.push([`${group}.${k}`, v]));
  add('ui', r.ui); add('sfx', r.sfx); add('footsteps', r.footsteps); add('loops', r.loops); add('blips', r.blips); add('score', r.score);
  add('stingers', r.stingers); add('spots', r.spots); add('ambience', r.ambience);
  for (const [st, rows] of Object.entries(r.stations)) rows.forEach((row, i) => all.push([`station.${st}.${i}`, row.stats]));
  all.push(['radio', r.radio.stats]);
  for (const [k, v] of Object.entries(r.scoreTransition)) all.push([`transition.${k}`, v]);

  const nan = all.filter(([, s]) => s.nan > 0).map(([k]) => k);
  checks.push({ name: 'no NaN samples', ok: nan.length === 0, detail: nan.join(', ') || `${all.length} renders clean` });
  const clipped = all.filter(([, s]) => s.clipped > 0).map(([k, s]) => `${k} (${s.clipped})`);
  checks.push({ name: 'no clipped samples', ok: clipped.length === 0, detail: clipped.join(', ') || 'peak ≤ −0.01 dBFS everywhere' });
  const silent = all.filter(([, s]) => s.peakDb < -50).map(([k, s]) => `${k} (${s.peakDb.toFixed(1)} dB)`);
  checks.push({ name: 'nothing silent', ok: silent.length === 0, detail: silent.join(', ') || 'every render audible' });

  const uiL = Object.entries(r.ui).map(([k, s]) => [k, s.lufs] as const);
  const uiMax = Math.max(...uiL.map(([, l]) => l));
  const uiMin = Math.min(...uiL.map(([, l]) => l));
  checks.push({ name: 'UI family never loud (≤ −14 LUFS)', ok: uiMax <= -14, detail: `loudest ${uiL.find(([, l]) => l === uiMax)![0]} ${uiMax}` });
  checks.push({ name: 'UI family within 22 LU', ok: uiMax - uiMin <= 22, detail: `spread ${(uiMax - uiMin).toFixed(1)} LU (${uiMin} … ${uiMax})` });

  const stationMeans = Object.entries(r.stations).map(([st, rows]) => [st, rows.reduce((a, x) => a + x.stats.lufs, 0) / rows.length] as const);
  const sMax = Math.max(...stationMeans.map(([, l]) => l));
  const sMin = Math.min(...stationMeans.map(([, l]) => l));
  checks.push({ name: 'stations within 3 LU of each other', ok: sMax - sMin <= 3, detail: stationMeans.map(([s, l]) => `${s} ${l.toFixed(1)}`).join(' · ') });
  checks.push({ name: 'music sits between −21 and −13 LUFS', ok: sMax <= -13 && sMin >= -21, detail: `${sMin.toFixed(1)} … ${sMax.toFixed(1)}` });

  for (const [name, rows] of Object.entries(r.engine)) {
    const hz = rows.map((x) => x.hz);
    const rising = hz.every((h, i) => i === 0 || h > hz[i - 1]! * 0.98);
    const ratio = hz[hz.length - 1]! / Math.max(1, hz[0]!);
    const rpmRatio = rows[rows.length - 1]!.rpm / rows[0]!.rpm;
    checks.push({
      name: `engine ${name}: pitch tracks rpm`, ok: rising && ratio > rpmRatio * 0.6 && ratio < rpmRatio * 1.7,
      detail: rows.map((x) => `${x.rpm}rpm→${x.hz}Hz (fire ${x.expected})`).join(', '),
    });
    const loud = rows.map((x) => x.lufs);
    checks.push({
      name: `engine ${name}: sits under the mix (−34 … −14 LUFS) and gets louder with rpm`,
      ok: loud.every((l) => l >= -34 && l <= -14) && loud[loud.length - 1]! > loud[0]!,
      detail: loud.map((l) => l.toFixed(1)).join(' → '),
    });
  }
  const tr = r.scoreTransition;
  checks.push({
    name: 'score: chase louder than menu, intensity adds energy', ok: tr.chase.lufs > tr.menu.lufs - 1 && tr.chaseIntense.lufs > tr.chase.lufs,
    detail: `menu ${tr.menu.lufs} · chase@0.3 ${tr.chase.lufs} · chase@1 ${tr.chaseIntense.lufs}`,
  });
  checks.push({ name: 'radio plays through its real-time path', ok: r.radio.stats.peakDb > -40 && r.radio.nowPlaying.length > 0, detail: r.radio.nowPlaying });
  return checks;
}
