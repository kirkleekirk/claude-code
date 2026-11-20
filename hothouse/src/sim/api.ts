/**
 * Public contract of the empire simulation.
 *
 * The sim is deterministic, headless and JSON-serializable. It never deals in coordinates: places
 * are `PlaceId`s, turfs are `TurfId`s, and the world resolves them. Player intent arrives through
 * `cmd.*` (validated, returning `Result`s with player-readable `detail`), the UI reads `state` and
 * `query.*`, and changes are announced through `GameEvents` (`sim:*`) and the `rev` signals.
 */

export * from './types/core';
export * from './types/state';
export * from './types/results';
export * from './types/queries';
export * from './types/commands';
export * from './types/surface';
export type * from './types/events';
