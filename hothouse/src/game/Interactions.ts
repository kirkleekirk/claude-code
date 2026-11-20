import type { ActionId, Input } from '@/input';
import type { PromptHud } from '@/ui/hud/model';

/** Something the player can act on in the world: a door, a plant, a customer, a car. */
export interface Interactable {
  readonly id: string;
  /** World position of the interaction point (update it if the thing moves). */
  x: number;
  y: number;
  z: number;
  /** Metres within which it is offered. */
  radius: number;
  /** Button that triggers it (shown as the live glyph). */
  action: ActionId;
  /** Verb first: "Talk", "Get in", "Harvest". */
  verb: string;
  object?: string;
  /** Seconds to hold; omit for a tap. */
  hold?: number;
  /** Higher wins ties between nearby targets. */
  priority?: number;
  /** Offered only while this returns true. */
  when?: () => boolean;
  /** A reason to show the prompt greyed out (e.g. "Bag is empty"), or null when available. */
  blocked?: () => string | null;
  run: () => void;
}

const VERTICAL_REACH = 1.6;
const STICKY = 0.18;

/**
 * Picks the one thing the player is most plausibly reaching for (near, in front, high priority),
 * shows it as a prompt, and fires it on tap or after a hold. The current target is sticky so two
 * equally close things never flicker.
 */
export class Interactions {
  private readonly items = new Map<string, Interactable>();
  private current: Interactable | null = null;
  private holdT = 0;
  private lastKey = '';
  /** The prompt to show (null when nothing is in reach). Replaced only when it changes. */
  prompt: PromptHud | null = null;
  enabled = true;

  add(item: Interactable): () => void {
    this.items.set(item.id, item);
    return () => this.remove(item.id);
  }

  remove(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    if (this.current === it) this.current = null;
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  get target(): Interactable | null {
    return this.current;
  }

  /**
   * Choose a target for a player at (x, y, z) facing `yaw`, handle the button, and refresh
   * `prompt`. Call once per fixed step while the player can interact.
   */
  update(dt: number, x: number, y: number, z: number, yaw: number, input: Input): void {
    if (!this.enabled) {
      this.current = null;
      this.setPrompt(null);
      return;
    }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;
    for (const it of this.items.values()) {
      if (it.when && !it.when()) continue;
      const dx = it.x - x, dz = it.z - z;
      if (Math.abs(it.y - y) > VERTICAL_REACH + it.radius * 0.5) continue;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      // Things behind the player still count when very close, but in front wins.
      const facing = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      const score = d / it.radius + (1 - facing) * 0.35 - (it.priority ?? 0) * 0.5;
      if (it === this.current) currentScore = score;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (this.current && currentScore < Infinity && currentScore - STICKY <= bestScore) best = this.current;
    if (best !== this.current) this.holdT = 0;
    this.current = best;
    if (!best) {
      this.setPrompt(null);
      return;
    }
    const blocked = best.blocked?.() ?? null;
    let fired = false;
    if (!blocked) {
      if (best.hold && best.hold > 0) {
        if (input.down(best.action)) {
          this.holdT += dt;
          if (this.holdT >= best.hold) {
            this.holdT = 0;
            fired = true;
          }
        } else this.holdT = 0;
      } else if (input.pressedFixed(best.action)) fired = true;
    }
    const hold = best.hold ? Math.round((this.holdT / best.hold) * 20) / 20 : undefined;
    this.setPrompt({ action: best.action, verb: best.verb, object: best.object, hold, holdable: !!best.hold, blocked: blocked ?? undefined }, `${best.id}|${blocked ?? ''}|${hold ?? ''}|${best.verb}|${best.object ?? ''}`);
    if (fired) best.run();
  }

  clear(): void {
    this.current = null;
    this.holdT = 0;
    this.setPrompt(null);
  }

  private setPrompt(p: PromptHud | null, key = ''): void {
    if (key === this.lastKey && (p === null) === (this.prompt === null)) return;
    this.lastKey = key;
    this.prompt = p;
  }
}
