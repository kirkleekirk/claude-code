import { invLerp, lerp, mod } from './math';

/**
 * The art-directed clock. One in-game day takes `DAY_REAL_SECONDS` of play, but the clock does not
 * run evenly: it dwells in golden hour and at night and hurries through midday.
 *
 * `ClockState.t` is the position inside the day in *day-seconds* (0 … DAY_REAL_SECONDS); the
 * wall-clock hour is derived from it through the window table. Growth, crew and jobs never read the
 * clock; they run on sim-seconds so pretty skies cannot slow the economy.
 */

export type DayWindowId = 'night' | 'dawn' | 'morning' | 'midday' | 'golden' | 'dusk';

export interface DayWindow {
  readonly id: DayWindowId;
  /** Clock hours, 0–24. */
  readonly start: number;
  readonly end: number;
  /** Real seconds this window lasts. */
  readonly real: number;
}

export const DAY_REAL_SECONDS = 960;

const NIGHT_REAL = 300;
const NIGHT_HOURS = 24 - 20.5 + 5.75;

/** Windows in clock order starting at midnight. Night wraps, so it appears twice. */
export const DAY_WINDOWS: readonly DayWindow[] = [
  { id: 'night', start: 0, end: 5.75, real: (NIGHT_REAL * 5.75) / NIGHT_HOURS },
  { id: 'dawn', start: 5.75, end: 7.5, real: 75 },
  { id: 'morning', start: 7.5, end: 11, real: 120 },
  { id: 'midday', start: 11, end: 15, real: 90 },
  { id: 'golden', start: 15, end: 19, real: 270 },
  { id: 'dusk', start: 19, end: 20.5, real: 105 },
  { id: 'night', start: 20.5, end: 24, real: (NIGHT_REAL * 3.5) / NIGHT_HOURS },
];

const WINDOW_T0: number[] = [];
{
  let acc = 0;
  for (const w of DAY_WINDOWS) {
    WINDOW_T0.push(acc);
    acc += w.real;
  }
}

export interface ClockState {
  /** Day counter, starting at 1. */
  day: number;
  /** Day-seconds since midnight, 0 … DAY_REAL_SECONDS. */
  t: number;
  /** Clock speed multiplier. Story beats pin or slow the clock; the sim is unaffected. */
  rate: number;
}

export function createClock(startHours = 18 + 40 / 60, day = 1): ClockState {
  return { day, t: dayTFromHours(startHours), rate: 1 };
}

/** Clock hours (0–24) for a position in the day. */
export function hoursFromDayT(t: number): number {
  const tt = mod(t, DAY_REAL_SECONDS);
  for (let i = DAY_WINDOWS.length - 1; i >= 0; i--) {
    const t0 = WINDOW_T0[i]!;
    if (tt >= t0) {
      const w = DAY_WINDOWS[i]!;
      return lerp(w.start, w.end, Math.min(1, (tt - t0) / w.real));
    }
  }
  return 0;
}

/** Position in the day (day-seconds) for a clock hour. */
export function dayTFromHours(hours: number): number {
  const h = mod(hours, 24);
  for (let i = 0; i < DAY_WINDOWS.length; i++) {
    const w = DAY_WINDOWS[i]!;
    if (h >= w.start && h < w.end) return WINDOW_T0[i]! + invLerp(w.start, w.end, h) * w.real;
  }
  return 0;
}

export function clockHours(clock: ClockState): number {
  return hoursFromDayT(clock.t);
}

export function windowAt(hours: number): DayWindowId {
  const h = mod(hours, 24);
  for (const w of DAY_WINDOWS) if (h >= w.start && h < w.end) return w.id;
  return 'night';
}

/** Advance by sim-seconds. Returns the number of midnights crossed. */
export function advanceClock(clock: ClockState, dtSim: number): number {
  clock.t += dtSim * clock.rate;
  let rolled = 0;
  while (clock.t >= DAY_REAL_SECONDS) {
    clock.t -= DAY_REAL_SECONDS;
    clock.day++;
    rolled++;
  }
  return rolled;
}

/** Sim-seconds (at rate 1) until the clock next shows `targetHours`. Always > 0. */
export function secondsUntil(clock: ClockState, targetHours: number): number {
  const target = dayTFromHours(targetHours);
  let d = target - clock.t;
  if (d <= 0.001) d += DAY_REAL_SECONDS;
  return d;
}

/** Total day-seconds since day 1 midnight; monotonic, handy for timestamps. */
export function absoluteT(clock: ClockState): number {
  return (clock.day - 1) * DAY_REAL_SECONDS + clock.t;
}

/** 0 at full day, 1 at full night, smooth through dusk and dawn. Drives neon, windows, headlights. */
export function nightFactor(hours: number): number {
  const h = mod(hours, 24);
  if (h >= 20.5 || h < 5.5) return 1;
  if (h >= 7 && h < 18.75) return 0;
  if (h >= 18.75) return invLerp(18.75, 20.5, h);
  return 1 - invLerp(5.5, 7, h);
}
