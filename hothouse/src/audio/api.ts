import type { ReadonlySignal } from '@preact/signals-core';

/**
 * Public contract of the audio module. Everything is synthesized with the Web Audio API; there
 * are no audio files. Other modules depend only on this file.
 */

export type BusId = 'master' | 'music' | 'sfx' | 'ambience' | 'ui' | 'barks';

/** Interface sounds: one tight, tactile family. */
export type UiSound =
  | 'focus' | 'confirm' | 'back' | 'tab' | 'toggleOn' | 'toggleOff' | 'slider' | 'error' | 'locked'
  | 'open' | 'close' | 'phoneOpen' | 'phoneClose' | 'toast' | 'message' | 'type'
  | 'cash' | 'cashBig' | 'buy' | 'rankUp' | 'discover' | 'stamp' | 'perfect' | 'hold' | 'holdDone'
  | 'photo' | 'hint' | 'objective' | 'wheelTick';

/** One-shot world and gameplay sounds. Positional when `SfxOptions` carries a position. */
export type Sfx =
  // growing and mixing
  | 'snip' | 'snipPerfect' | 'water' | 'leafPerk' | 'needPop' | 'plantSeed' | 'bagIt'
  | 'dropAdditive' | 'shake' | 'reveal' | 'cookDone' | 'pressStamp'
  // deals and money
  | 'handoff' | 'cashFlick' | 'haggleTick' | 'haggleWin' | 'haggleMiss' | 'perfectDeal'
  // character
  | 'footstep' | 'jump' | 'land' | 'vault' | 'cloth' | 'punch' | 'bodyFall'
  // vehicles
  | 'doorOpen' | 'doorClose' | 'ignition' | 'horn' | 'backfire' | 'turboBlow' | 'gearShift'
  | 'impactLight' | 'impactHeavy' | 'scrape' | 'glassBreak' | 'tirePop' | 'hydraulic' | 'boost' | 'flowFull'
  | 'splash' | 'boatSlap'
  // world
  | 'doorShop' | 'bell' | 'vending' | 'neonBuzz' | 'thunder' | 'firework' | 'cameraShutter' | 'crowdCheer' | 'crowdGasp'
  | 'gull' | 'gatorHiss' | 'pickup' | 'dropBox' | 'buildPlace' | 'buildRemove' | 'buildInvalid'
  // law and combat
  | 'sirenChirp' | 'radioSquelch' | 'heatUp' | 'heatDown' | 'busted' | 'escaped'
  | 'gunPistol' | 'gunSmg' | 'gunShotgun' | 'gunRifle' | 'reload' | 'dryFire' | 'ricochet' | 'hitMarker';

/** Ground materials that change footsteps and tire noise. */
export type SurfaceKind = 'asphalt' | 'concrete' | 'sand' | 'grass' | 'wood' | 'metal' | 'water' | 'gravel' | 'tile';

export interface SfxOptions {
  /** World position; omitted = non-spatial. */
  x?: number;
  y?: number;
  z?: number;
  /** Linear gain multiplier, default 1. */
  volume?: number;
  /** Playback pitch multiplier, default 1. A little random detune is always added. */
  pitch?: number;
  /** Variation selector for sounds with flavors (footstep surface, impact size 0–1). */
  surface?: SurfaceKind;
  intensity?: number;
  bus?: BusId;
}

/** Sustained sounds controlled over time. */
export type LoopSound =
  | 'skid' | 'rain' | 'wind' | 'siren' | 'helicopter' | 'sprinkler' | 'growHum' | 'boatWake' | 'airboatFan'
  | 'crowd' | 'neonHum' | 'alarm' | 'searchTension';

export interface LoopHandle {
  /** 0–1 loudness and an optional pitch/intensity parameter; both smoothed internally. */
  set(level: number, param?: number): void;
  setPosition(x: number, y: number, z: number): void;
  stop(fadeSeconds?: number): void;
}

/** Character of an engine; each vehicle definition carries one. */
export interface EngineProfile {
  /** Fundamental firing layout: number of cylinders shapes the harmonic stack. */
  cylinders: 1 | 2 | 4 | 6 | 8 | 10;
  idleRpm: number;
  redlineRpm: number;
  /** 0 = smooth and muffled, 1 = raspy and loud. */
  rasp: number;
  /** 0 = thin, 1 = deep. */
  bass: number;
  turbo: number;
  /** Chance of exhaust pops when lifting off at high rpm. */
  pops: number;
  /** Electric / two-stroke buzz flavor for scooters and the airboat fan. */
  flavor?: 'piston' | 'twoStroke' | 'bigBlock' | 'exotic';
}

export interface EngineFrame {
  rpm: number;
  /** 0–1 pedal. */
  throttle: number;
  /** 0–1 engine load (throttle × resistance). */
  load: number;
  /** m/s, for wind and road noise. */
  speed: number;
  /** 0–1 tire slip for squeal. */
  slip: number;
  surface: SurfaceKind;
  /** True when heard from inside the cabin (player driving, first-person-ish filtering). */
  interior: boolean;
  x: number;
  y: number;
  z: number;
}

export interface EngineVoice {
  update(frame: EngineFrame): void;
  /** Player vehicle gets the full-detail voice; others are cheaper. */
  setPriority(isPlayer: boolean): void;
  dispose(): void;
}

export type StationId = 'sunset' | 'calle' | 'haze' | 'bass';

export interface StationInfo {
  readonly id: StationId;
  readonly name: string;
  readonly tagline: string;
  readonly frequency: string;
  /** CSS color for the station card. */
  readonly color: string;
}

export interface NowPlaying {
  readonly station: StationId;
  readonly title: string;
  readonly artist: string;
  /** True while a parody ad or DJ ident plays; `caption` holds the text card. */
  readonly isAd: boolean;
  readonly caption: string | null;
}

export interface RadioApi {
  readonly stations: readonly StationInfo[];
  /** Current station, or null when the radio is off. */
  readonly station: ReadonlySignal<StationId | null>;
  readonly nowPlaying: ReadonlySignal<NowPlaying | null>;
  setStation(id: StationId | null): void;
  next(): void;
  prev(): void;
  /** Radio is audible only in vehicles (and softly at menus); the score takes over otherwise. */
  setAudible(level: number, interior: boolean): void;
  /** Air a headline as a news flash on every station after its current segment (dynamic news). */
  pushNews(text: string): void;
}

export type ScoreMood = 'menu' | 'explore' | 'tension' | 'chase' | 'raid' | 'setpiece' | 'calm' | 'silent';

export interface ScoreApi {
  /** Target mood; layers crossfade over a bar or two. */
  setMood(mood: ScoreMood): void;
  /** 0–1 intensity inside the mood (heat level, proximity of danger). */
  setIntensity(level: number): void;
  /** One-shot musical stinger over the bed. */
  stinger(kind: 'logo' | 'title' | 'rankUp' | 'discovery' | 'busted' | 'escaped' | 'missionPassed' | 'missionFailed' | 'perfect'): void;
}

export interface AmbienceContext {
  /** District id, drives the bed (surf, traffic, swamp, harbor clank…). */
  district: string | null;
  /** Clock hours 0–24. */
  hours: number;
  /** 0–1. */
  rain: number;
  storm: number;
  wind: number;
  /** 0 outdoors … 1 fully indoors (low-pass and attenuation of the outside world). */
  indoor: number;
  /** 0–1 proximity to open water. */
  water: number;
  /** 0–1 crowd density around the listener. */
  crowd: number;
  /** 0–1 road traffic density around the listener. */
  traffic: number;
}

/** A speaking voice for dialogue blips: no words, just pitch and character. */
export interface VoiceProfile {
  /** Base pitch in Hz (90–320). */
  pitch: number;
  /** 0 = soft and round, 1 = bright and nasal. */
  brightness: number;
  /** Pitch wobble per syllable, 0–1. */
  expressiveness: number;
}

/** Diagnostics for the harness and perf overlay. */
export interface AudioStats {
  state: 'muted' | 'locked' | 'running' | 'suspended' | 'closed' | 'unavailable';
  /** Active one-shot voices. */
  voices: number;
  loops: number;
  engines: number;
  /** Seconds of output latency reported by the context, if known. */
  latency: number;
}

export interface AudioApi {
  /** True once the context is running (after the first user gesture). */
  readonly unlocked: ReadonlySignal<boolean>;
  /** Create/resume the audio context. Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void>;
  /** Per-frame update: schedulers, smoothing, voice culling. `dt` in real seconds. */
  update(dt: number): void;
  /** Listener pose in world space (camera). */
  setListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number): void;

  ui(sound: UiSound): void;
  sfx(sound: Sfx, opts?: SfxOptions): void;
  loop(sound: LoopSound, opts?: SfxOptions): LoopHandle;
  engine(profile: EngineProfile): EngineVoice;
  /** One syllable of dialogue babble. */
  blip(voice: VoiceProfile, emphasis?: number): void;

  readonly radio: RadioApi;
  readonly score: ScoreApi;
  setAmbience(ctx: AmbienceContext): void;

  /** Bus volume 0–1 (settings). */
  setVolume(bus: BusId, volume: number): void;
  /** Temporarily duck a bus (dialogue over music, phone over world). */
  duck(bus: BusId, amount: number, seconds: number): void;
  /** Slow-motion feel: pitch and filter the world buses (phone open, busted). 1 = normal. */
  setTimeScale(scale: number): void;
  /** Suspend output (tab hidden) and resume. */
  suspend(): void;
  resume(): void;
  dispose(): void;
  stats(): AudioStats;
}
