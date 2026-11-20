import type { ReadonlySignal } from '@preact/signals-core';
import type { PlaceId } from '@/content/places';
import type { Vec2 } from '@/core/types';
import type { Sim } from '@/sim';
import type { RoutePoint } from '@/world/roads/router';
import type { MapData } from './mapData';

/** The player as the maps show them. */
export interface PlayerPose {
  x: number;
  z: number;
  /** Facing (radians, 0 faces −Z / north). */
  yaw: number;
  inVehicle: boolean;
}

/** The active GPS route. */
export interface RouteView {
  readonly target: PlaceId | Vec2;
  /** Display name of the destination. */
  readonly label: string;
  readonly points: readonly RoutePoint[];
  /** Metres remaining along the route. */
  readonly remaining: number;
}

/**
 * What the interface's game apps (Messages, Map, Empire, Notebook, Contacts, Shop…) read from the
 * running game. Signals update while playing; in menus `sim` and `player` are null.
 * Menu-style actions (buy, upgrade, accept a text, name the brand) go straight to `sim.cmd`;
 * world actions go through `GameActions` (`setWaypoint`, `fastTravel`…).
 */
export interface GameBridge {
  readonly sim: ReadonlySignal<Sim | null>;
  /** Available once the city is built (from the loading screen on). */
  readonly map: ReadonlySignal<MapData | null>;
  /** About ten updates a second during play. */
  readonly player: ReadonlySignal<PlayerPose | null>;
  readonly route: ReadonlySignal<RouteView | null>;
}
