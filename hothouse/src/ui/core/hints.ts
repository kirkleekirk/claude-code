/**
 * Hint rules (pure): one hint at a time, highest priority first, never repeated once learned.
 * A hint that times out without being learned rests for a cool-down, then may return.
 * Explicitly dismissing a hint counts as learning it (players who dismiss do not want nagging).
 */

export interface HintRequest {
  id: string;
  text: string;
  action?: string;
  priority: number;
  duration: number;
}

export interface HintRecord {
  learned: string[];
}

export const HINT_COOLDOWN = 90;
const MAX_QUEUE = 8;

export class HintBook {
  private readonly learned: Set<string>;
  private queue: HintRequest[] = [];
  private restingUntil = new Map<string, number>();
  /** Seconds since the book was created (driven by `tick`). */
  private clock = 0;
  current: HintRequest | null = null;
  /** Seconds the current hint has been showing. */
  shownFor = 0;

  constructor(record?: HintRecord | null) {
    this.learned = new Set(Array.isArray(record?.learned) ? record!.learned.filter((x) => typeof x === 'string') : []);
  }

  isLearned(id: string): boolean {
    return this.learned.has(id);
  }

  /** Queue a hint. Returns false if it was learned, resting, already queued or showing. */
  request(h: HintRequest): boolean {
    if (this.learned.has(h.id)) return false;
    if (this.current?.id === h.id || this.queue.some((q) => q.id === h.id)) return false;
    const rest = this.restingUntil.get(h.id);
    if (rest !== undefined && rest > this.clock) return false;
    this.queue.push(h);
    // Stable sort: priority descending, then arrival order.
    this.queue = this.queue
      .map((q, i) => ({ q, i }))
      .sort((a, b) => b.q.priority - a.q.priority || a.i - b.i)
      .map((x) => x.q)
      .slice(0, MAX_QUEUE);
    return true;
  }

  /** The player did the thing: hide it now and forever. Returns true if something changed. */
  learn(id: string): boolean {
    const had = this.learned.has(id);
    this.learned.add(id);
    this.queue = this.queue.filter((q) => q.id !== id);
    if (this.current?.id === id) {
      this.current = null;
      this.shownFor = 0;
    }
    return !had;
  }

  /** Dismissed by the player: same as learned. */
  dismiss(): string | null {
    const id = this.current?.id ?? null;
    if (id) this.learn(id);
    return id;
  }

  /**
   * Advance time. Promotes the next queued hint when none is showing (and hints are enabled), and
   * retires the current one after its duration. Returns true if `current` changed.
   */
  tick(dt: number, enabled: boolean): boolean {
    this.clock += dt;
    let changed = false;
    if (this.current) {
      this.shownFor += dt;
      if (!enabled || this.shownFor >= this.current.duration) {
        this.restingUntil.set(this.current.id, this.clock + HINT_COOLDOWN);
        this.current = null;
        this.shownFor = 0;
        changed = true;
      }
    }
    if (!this.current && enabled && this.queue.length) {
      this.current = this.queue.shift()!;
      this.shownFor = 0;
      changed = true;
    }
    return changed;
  }

  /** Learned ids, for "replay hints" in Help. */
  learnedIds(): string[] {
    return [...this.learned];
  }

  /** Forget a learned hint so it can be shown again (Help → replay). */
  unlearn(id: string): void {
    this.learned.delete(id);
    this.restingUntil.delete(id);
  }

  serialize(): HintRecord {
    return { learned: [...this.learned].sort() };
  }
}
