import { log } from './log';
import type { Unsubscribe } from './types';

/**
 * The global event map. Modules add their own events by declaration merging:
 *
 * ```ts
 * declare module '@/core/events' {
 *   interface GameEvents { 'deal:completed': { dealId: string; cash: number } }
 * }
 * ```
 *
 * Naming: `domain:pastTenseOrNoun`. Payloads are plain data.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameEvents {}

type Handler<T> = (payload: T) => void;
type Args<T> = [T] extends [void] ? [] : [payload: T];

export class EventBus<E extends object = GameEvents> {
  private readonly handlers = new Map<keyof E, Handler<never>[]>();
  private emitting = 0;
  private dirty = false;

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): Unsubscribe {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof E>(type: K, fn: Handler<E[K]>): Unsubscribe {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof E>(type: K, fn: Handler<E[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn as Handler<never>);
    if (i < 0) return;
    if (this.emitting > 0) {
      // Tombstone during emit so iteration indices stay valid; compacted afterwards.
      list[i] = noop as Handler<never>;
      this.dirty = true;
    } else {
      list.splice(i, 1);
    }
  }

  emit<K extends keyof E>(type: K, ...args: Args<E[K]>): void {
    const list = this.handlers.get(type);
    if (!list || list.length === 0) return;
    const payload = args[0] as never;
    this.emitting++;
    const n = list.length; // handlers added during emit run next time
    for (let i = 0; i < n; i++) {
      try {
        list[i]!(payload);
      } catch (err) {
        log.error('events', `handler for "${String(type)}" threw`, err);
      }
    }
    this.emitting--;
    if (this.emitting === 0 && this.dirty) this.compact();
  }

  clear(): void {
    this.handlers.clear();
  }

  private compact(): void {
    this.dirty = false;
    for (const [type, list] of this.handlers) {
      const kept = list.filter((h) => h !== (noop as Handler<never>));
      if (kept.length !== list.length) this.handlers.set(type, kept);
    }
  }
}

function noop(): void {}
