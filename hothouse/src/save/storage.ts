import { log } from '@/core/log';

/** Minimal synchronous key-value store so saves can be tested without a browser. */
export interface KeyValueStore {
  get(key: string): string | null;
  /** Returns false if the write failed (quota, private mode, storage disabled). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  /** When set, writes larger than this many characters fail (quota simulation for tests). */
  quota = Infinity;

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): boolean {
    if (value.length > this.quota) return false;
    this.data.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}

/** `localStorage` with every call guarded: storage can be disabled, full, or throw in private mode. */
export class LocalStore implements KeyValueStore {
  private readonly fallback = new MemoryStore();
  private readonly ls: Storage | null;

  constructor() {
    let ls: Storage | null = null;
    try {
      ls = globalThis.localStorage ?? null;
      if (ls) {
        const probe = '__hothouse_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
      }
    } catch {
      ls = null;
    }
    this.ls = ls;
    if (!ls) log.info('save', 'localStorage unavailable; progress will not persist this session');
  }

  /** False when the browser refuses storage and saves only live in memory. */
  get persistent(): boolean {
    return this.ls !== null;
  }

  get(key: string): string | null {
    if (!this.ls) return this.fallback.get(key);
    try {
      return this.ls.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): boolean {
    if (!this.ls) return this.fallback.set(key, value);
    try {
      this.ls.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    if (!this.ls) return this.fallback.remove(key);
    try {
      this.ls.removeItem(key);
    } catch {
      // Nothing useful to do: the key stays and will be overwritten by the next save.
    }
  }

  keys(): string[] {
    if (!this.ls) return this.fallback.keys();
    const out: string[] = [];
    try {
      for (let i = 0; i < this.ls.length; i++) {
        const k = this.ls.key(i);
        if (k !== null) out.push(k);
      }
    } catch {
      // Fall through with whatever was collected.
    }
    return out;
  }
}
