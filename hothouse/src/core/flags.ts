/**
 * URL flags. `?test=1&seed=42&time=18.5&weather=clear` puts the game in deterministic test mode.
 * Nothing here is visible to players unless they type the flag themselves.
 */

export interface Flags {
  /** Deterministic test mode: harness enabled, manual stepping available, intro skippable. */
  readonly test: boolean;
  /** Debug mode: harness plus tuning panel and perf overlay. */
  readonly debug: boolean;
  /** Overrides the gameplay RNG seed (the city layout seed is fixed). */
  readonly seed: number | null;
  /** Start clock hour, 0–24. */
  readonly time: number | null;
  readonly weather: string | null;
  /** Forces a graphics preset: `low`, `medium`, `high`, `ultra`, or `potato` (QA logic runs). */
  readonly gfx: string | null;
  /** Skip click-to-start, logo and menu; drop straight into play. */
  readonly skipIntro: boolean;
  /** Start position: `x,y,z` or a POI id. */
  readonly pos: string | null;
  /** Mute audio output entirely (headless runs). */
  readonly mute: boolean;
  /** Load a named sandbox scene instead of the game (development workbenches). */
  readonly sandbox: string | null;
  readonly raw: ReadonlyMap<string, string>;
}

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  const on = (k: string) => p.has(k) && p.get(k) !== '0' && p.get(k) !== 'false';
  const raw = new Map<string, string>();
  p.forEach((v, k) => raw.set(k, v));
  return {
    test: on('test'),
    debug: on('debug'),
    seed: num(p.get('seed')),
    time: num(p.get('time')),
    weather: p.get('weather'),
    gfx: p.get('gfx'),
    skipIntro: on('skipIntro') || on('skipintro'),
    pos: p.get('pos'),
    mute: on('mute'),
    sandbox: p.get('sandbox'),
    raw,
  };
}

export const flags: Flags = parseFlags(typeof location === 'undefined' ? '' : location.search);
