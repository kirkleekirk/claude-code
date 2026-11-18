import type { AudioApi } from './api';
import { AudioEngine, type AudioOptions } from './engine/AudioEngine';

export type * from './api';
export { AudioEngine, type AudioOptions } from './engine/AudioEngine';
export { STATIONS } from './music/station';
export { DJ_VOICE } from './music/spots';

/**
 * Create the game's audio engine. Safe before any user gesture; call `unlock()` from the
 * click-to-start handler. `muted` keeps everything silent (headless runs).
 */
export function createAudio(options: AudioOptions = {}): AudioApi {
  return new AudioEngine(options);
}
