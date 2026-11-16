/** Scalar math helpers. No allocations; safe for hot paths. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const EPS = 1e-6;

export const clamp = (x: number, min: number, max: number): number => (x < min ? min : x > max ? max : x);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number): number => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number): number =>
  c + (d - c) * invLerp(a, b, x);
export const remapClamped = (x: number, a: number, b: number, c: number, d: number): number =>
  c + (d - c) * clamp01(invLerp(a, b, x));
export const sq = (x: number): number => x * x;
export const fract = (x: number): number => x - Math.floor(x);
export const sign0 = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const mod = (x: number, m: number): number => ((x % m) + m) % m;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Frame-rate independent exponential smoothing. `lambda` is the decay rate per second:
 * larger is snappier (≈ 63 % of the way after 1/lambda seconds).
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Blend factor equivalent to `damp`, for use with vector/quaternion lerps. */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  a = mod(a + Math.PI, TAU) - Math.PI;
  return a === -Math.PI ? Math.PI : a;
}

/** Shortest signed difference from `a` to `b`. */
export function angleDelta(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDelta(current, target) * dampFactor(lambda, dt);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

/** Critically damped spring. Mutates and returns `state`. `halflife` in seconds. */
export interface SpringState {
  x: number;
  v: number;
}

export function springTo(state: SpringState, target: number, halflife: number, dt: number): SpringState {
  const y = (4 * Math.LN2) / Math.max(halflife, EPS) / 2;
  const j0 = state.x - target;
  const j1 = state.v + j0 * y;
  const e = Math.exp(-y * dt);
  state.x = e * (j0 + j1 * dt) + target;
  state.v = e * (state.v - j1 * y * dt);
  return state;
}

/** Under-damped spring for bouncy UI and body wobble. Semi-implicit Euler; stable for dt ≤ 1/30. */
export function springBounce(
  state: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): SpringState {
  state.v += (stiffness * (target - state.x) - damping * state.v) * dt;
  state.x += state.v * dt;
  return state;
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

/**
 * Piecewise-linear lookup over sorted `[x, y]` keys. Clamps outside the range.
 * Used for art-directed curves (sun elevation by hour, torque by rpm, …).
 */
export function curve(keys: ReadonlyArray<readonly [number, number]>, x: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  const first = keys[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < n; i++) {
    const k = keys[i]!;
    if (x <= k[0]) {
      const p = keys[i - 1]!;
      return lerp(p[1], k[1], invLerp(p[0], k[0], x));
    }
  }
  return keys[n - 1]![1];
}

/** Distance between two ground points. */
export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

export function distSq2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Yaw (radians) of a ground direction. 0 faces −Z (north); positive turns toward −X (west). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Round to a fixed number of decimals (for stable serialization). */
export function roundTo(x: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(x * p) / p;
}
