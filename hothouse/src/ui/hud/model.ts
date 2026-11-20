import { signal, type Signal } from '@preact/signals-core';
import type { ActionId } from '@/input';
import type { IconName } from '../icons/names';

/**
 * Everything the HUD shows, as signals the main thread writes. The UI reads them reactively, so
 * writing an unchanged value costs nothing; round per-frame values (speed) before writing.
 */

export type WeatherIcon = 'clear' | 'clearNight' | 'hazy' | 'overcast' | 'rain' | 'storm' | 'hurricane';

export interface ObjectiveHud {
  icon: IconName;
  text: string;
  /** Metres to the target; null hides the distance. */
  distance?: number | null;
}

export interface PromptHud {
  action: ActionId;
  /** Verb first: "Harvest", "Talk", "Get in". */
  verb: string;
  /** What it acts on: "Abuela's Blush". */
  object?: string;
  /** 0–1 while a hold action is in progress; omit for tap actions. */
  hold?: number;
  /** True if this is a hold action (shows the ring even at 0). */
  holdable?: boolean;
  /** Shown instead of the verb when the action is unavailable ("Bag is empty"). */
  blocked?: string;
}

export interface BagItemHud {
  id: string;
  label: string;
  count: number;
  /** Product colour (CSS). */
  color: string;
}

export interface VehicleHud {
  /** Metres per second (absolute). The UI converts to mph or km/h. */
  speed: number;
  /** 0–1 Flow meter. */
  flow: number;
  /** Boost is burning right now. */
  boosting: boolean;
  /** Enough Flow banked to boost. */
  boostReady: boolean;
}

export interface HudModel {
  /** Whole HUD shown (gameplay). */
  readonly visible: Signal<boolean>;
  /** Clean Mode: hide everything for screenshots. */
  readonly clean: Signal<boolean>;
  /** Clock hours 0–24. */
  readonly clockHours: Signal<number>;
  readonly weather: Signal<WeatherIcon>;
  /** Dirty cash (shown); clean cash appears beside it on hover / Details. */
  readonly cash: Signal<number>;
  readonly cleanCash: Signal<number>;
  /** Street heat 0–5 (fractional values partially light the next ray). */
  readonly heat: Signal<number>;
  /** Pursuers lost sight of you: the dial cools and pulses. */
  readonly heatSearching: Signal<boolean>;
  readonly objective: Signal<ObjectiveHud | null>;
  readonly prompt: Signal<PromptHud | null>;
  readonly bag: Signal<readonly BagItemHud[]>;
  /** Present while driving. */
  readonly vehicle: Signal<VehicleHud | null>;
  /** District or place name; a banner shows briefly whenever it changes. */
  readonly area: Signal<string | null>;
  /** Short centre-screen callout ("Perfect drift!", "Near miss"), auto-clears. */
  readonly callout: Signal<{ text: string; tone: 'flow' | 'money' | 'heat' | 'info'; id: number } | null>;
}

export function createHudModel(): HudModel {
  return {
    visible: signal(false),
    clean: signal(false),
    clockHours: signal(18 + 40 / 60),
    weather: signal<WeatherIcon>('clear'),
    cash: signal(0),
    cleanCash: signal(0),
    heat: signal(0),
    heatSearching: signal(false),
    objective: signal<ObjectiveHud | null>(null),
    prompt: signal<PromptHud | null>(null),
    bag: signal<readonly BagItemHud[]>([]),
    vehicle: signal<VehicleHud | null>(null),
    area: signal<string | null>(null),
    callout: signal<{ text: string; tone: 'flow' | 'money' | 'heat' | 'info'; id: number } | null>(null),
  };
}

let calloutId = 0;
/** Convenience for the main thread: show a short centre callout. */
export function showCallout(hud: HudModel, text: string, tone: 'flow' | 'money' | 'heat' | 'info' = 'info'): void {
  hud.callout.value = { text, tone, id: ++calloutId };
}
