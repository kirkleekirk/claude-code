import { DISTRICTS } from '@/content/places';
import { clockHours } from '@/core/clock';
import type { Sim } from '@/sim';
import type { UiApi } from '@/ui/api';
import { showCallout, type WeatherIcon } from '@/ui/hud/model';
import { ICON_NAMES, type IconName } from '@/ui/icons/names';
import type { FlowEvent } from '@/vehicles/FlowMeter';
import { districtAt } from '@/world/plan/districts';
import type { Game } from './Game';
import type { RouteView } from './bridge';
import type { PlayStage } from './PlayStage';

const ICONS = new Set<string>(ICON_NAMES);
/** Sim icon names that differ from the UI's set. */
const ICON_ALIASES: Readonly<Record<string, IconName>> = { seed: 'seedling', water: 'drop', chat: 'messages', bowl: 'beaker' };

export function iconFor(name: string): IconName {
  if (ICONS.has(name)) return name as IconName;
  return ICON_ALIASES[name] ?? 'star';
}

const CALLOUTS: Partial<Record<FlowEvent, string>> = {
  nearMiss: 'Near miss',
  air: 'Big air',
  landing: 'Clean landing',
  full: 'Flow full · boost ready',
};

/**
 * Writes the HUD signals from the game, the play stage and the sim once per frame. Signals only
 * notify on change, so values are rounded to what the HUD can show before they are written.
 */
export class HudBridge {
  private lastCalloutAt = -10;
  private time = 0;

  constructor(private readonly ui: UiApi, private readonly game: Game) {}

  /** Route a play stage's flow events to short centre callouts. */
  bind(play: PlayStage): void {
    play.onFlowEvent = (e) => {
      const text = CALLOUTS[e];
      if (!text || this.time - this.lastCalloutAt < 1.2) return;
      this.lastCalloutAt = this.time;
      showCallout(this.ui.hud, text, 'flow');
    };
  }

  update(dtReal: number, play: PlayStage | null, sim: Sim | null, route: RouteView | null): void {
    this.time += dtReal;
    const hud = this.ui.hud;
    const game = this.game;
    const hours = clockHours(game.clock);
    const shown = Math.floor(hours * 60) / 60;
    if (hud.clockHours.value !== shown) hud.clockHours.value = shown;
    const night = game.ctx.gfx.env.night > 0.5;
    const icon: WeatherIcon = game.weather === 'clear' && night ? 'clearNight' : game.weather;
    if (hud.weather.value !== icon) hud.weather.value = icon;

    if (sim) {
      const m = sim.state.money;
      const dirty = Math.round(m.dirty), clean = Math.round(m.clean);
      if (hud.cash.value !== dirty) hud.cash.value = dirty;
      if (hud.cleanCash.value !== clean) hud.cleanCash.value = clean;
      const obj = sim.query.objective();
      const cur = hud.objective.value;
      // Distance to the objective's place when the GPS is routing there, in 10 m steps.
      const distance = obj?.place && route && route.target === obj.place ? Math.round(route.remaining / 10) * 10 : null;
      if (!obj) {
        if (cur) hud.objective.value = null;
      } else if (!cur || cur.text !== obj.text || cur.icon !== iconFor(obj.icon) || cur.distance !== distance) {
        hud.objective.value = { icon: iconFor(obj.icon), text: obj.text, distance };
      }
    }

    if (!play) {
      if (hud.prompt.value) hud.prompt.value = null;
      if (hud.vehicle.value) hud.vehicle.value = null;
      return;
    }
    if (hud.prompt.value !== play.interactions.prompt) hud.prompt.value = play.interactions.prompt;
    const v = play.mode === 'vehicle' ? play.vehicle : null;
    if (v) {
      const speed = Math.round(Math.abs(v.speed) * 2) / 2;
      const flow = Math.round(play.flow.value * 100) / 100;
      const cur = hud.vehicle.value;
      if (!cur || cur.speed !== speed || cur.flow !== flow || cur.boosting !== play.flow.boosting || cur.boostReady !== play.flow.boostReady) {
        hud.vehicle.value = { speed, flow, boosting: play.flow.boosting, boostReady: play.flow.boostReady };
      }
    } else if (hud.vehicle.value) hud.vehicle.value = null;
    const p = v ? v.position : play.player.position;
    const area = DISTRICTS[districtAt(p.x, p.z)].name;
    if (hud.area.value !== area) hud.area.value = area;
  }
}
