import { storageGet, storageSet, isTouchDevice } from './util.js';

const KEY = 'avion-zombies.settings.v1';

export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 1024, post: false, trees: 0.45, ferns: 0.35, lights: 2, msaa: 0, godrays: false, bloom: false, envLight: false },
  medium: { pixelRatio: 1.0, shadows: true, shadowSize: 1024, post: true, trees: 0.7, ferns: 0.6, lights: 4, msaa: 0, godrays: true, bloom: true, envLight: true },
  high: { pixelRatio: 1.0, shadows: true, shadowSize: 2048, post: true, trees: 1.0, ferns: 1.0, lights: 6, msaa: 4, godrays: true, bloom: true, envLight: true },
  ultra: { pixelRatio: 1.5, shadows: true, shadowSize: 4096, post: true, trees: 1.25, ferns: 1.3, lights: 6, msaa: 4, godrays: true, bloom: true, envLight: true },
};

const DEFAULTS = {
  masterVolume: 0.9,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  voiceVolume: 0.9,
  sensitivity: 1.0,
  adsSensitivity: 0.75,
  touchSensitivity: 1.0,
  fov: 80,
  invertY: false,
  quality: isTouchDevice() ? 'low' : 'high',
  showFps: false,
  toggleCrouch: true,
  toggleSprint: false,
  announcer: true,
  filmGrain: true,
  screenShake: 1.0,
  aimAssist: true,
  lastMap: 'rainshadow',
};

class Settings {
  constructor() {
    this.values = { ...DEFAULTS, ...storageGet(KEY, {}) };
    if (!QUALITY_PRESETS[this.values.quality]) this.values.quality = DEFAULTS.quality;
    this.listeners = new Set();
  }
  get(k) {
    return this.values[k];
  }
  set(k, v) {
    this.values[k] = v;
    storageSet(KEY, this.values);
    for (const fn of this.listeners) fn(k, v);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get preset() {
    return QUALITY_PRESETS[this.values.quality];
  }
  reset() {
    this.values = { ...DEFAULTS };
    storageSet(KEY, this.values);
    for (const fn of this.listeners) fn('*', null);
  }
}

export const settings = new Settings();

const RECORD_KEY = 'avion-zombies.records.v1';
export function loadRecords() {
  return storageGet(RECORD_KEY, { bestRound: 0, bestKills: 0, games: 0 });
}
export function saveRecords(r) {
  storageSet(RECORD_KEY, r);
}
// Per-map view of the records. Rainshadow keeps the original top-level fields so old saves still count.
export function mapRecord(rec, id) {
  if (id === 'rainshadow') return rec;
  rec.maps = rec.maps || {};
  if (!rec.maps[id]) rec.maps[id] = { bestRound: 0, bestKills: 0, games: 0 };
  return rec.maps[id];
}
