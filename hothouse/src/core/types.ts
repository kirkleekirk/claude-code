/** Shared primitive types. Kept dependency-free so `sim` and `content` can use them headless. */

export type Result<T = void, E extends string = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly detail?: string };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const done: Result<void, never> = { ok: true, value: undefined };
export const fail = <E extends string>(error: E, detail?: string): Result<never, E> =>
  detail === undefined ? { ok: false, error } : { ok: false, error, detail };

/** A point on the ground plane. World space: +X east, −Z north, metres. */
export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Position plus heading (yaw in radians, 0 = facing −Z / north, positive = turning left / west). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export interface Disposable {
  dispose(): void;
}

export type Unsubscribe = () => void;
