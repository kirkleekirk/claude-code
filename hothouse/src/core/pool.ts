/**
 * Object pool for anything spawned frequently (particles, decals, number pops, NPCs, traffic).
 * `acquire` never allocates once the pool is warm; `release` returns the object for reuse.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset?: (item: T) => void,
    prewarm = 0,
    /** Hard cap on live + free objects; `acquire` returns null beyond it. 0 = unlimited. */
    private readonly limit = 0,
  ) {
    for (let i = 0; i < prewarm; i++) {
      this.free.push(factory());
      this.created++;
    }
  }

  acquire(): T | null {
    const item = this.free.pop();
    if (item !== undefined) return item;
    if (this.limit > 0 && this.created >= this.limit) return null;
    this.created++;
    return this.factory();
  }

  release(item: T): void {
    this.reset?.(item);
    this.free.push(item);
  }

  get size(): number {
    return this.created;
  }

  get available(): number {
    return this.free.length;
  }

  /** Drop all pooled objects, running `dispose` on each. */
  drain(dispose?: (item: T) => void): void {
    if (dispose) for (const item of this.free) dispose(item);
    this.created -= this.free.length;
    this.free.length = 0;
  }
}

/** Fixed-capacity ring buffer; overwrites the oldest entry when full. */
export class Ring<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    this.items[(this.head + this.count) % this.capacity] = item;
    if (this.count < this.capacity) this.count++;
    else this.head = (this.head + 1) % this.capacity;
  }

  get length(): number {
    return this.count;
  }

  /** Oldest first. */
  at(i: number): T | undefined {
    return i < 0 || i >= this.count ? undefined : this.items[(this.head + i) % this.capacity];
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.items.fill(undefined);
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.items[(this.head + i) % this.capacity] as T);
    return out;
  }
}
