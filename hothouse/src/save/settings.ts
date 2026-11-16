import { signal, type ReadonlySignal, type Signal } from '@preact/signals-core';
import { clamp } from '@/core/math';
import type { Unsubscribe } from '@/core/types';
import { SETTINGS, SETTING_IDS, type SettingCategory, type SettingDef, type SettingId, type SettingValue } from './settingsSchema';
import type { KeyValueStore } from './storage';

const KEY = 'hothouse.settings.v1';

type Raw = boolean | number | string;
interface Stored {
  values?: Record<string, unknown>;
  blobs?: Record<string, unknown>;
}

function sanitize(def: SettingDef, value: unknown): Raw {
  switch (def.type) {
    case 'toggle':
      return typeof value === 'boolean' ? value : def.default;
    case 'slider': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
      const snapped = Math.round((value - def.min) / def.step) * def.step + def.min;
      return clamp(snapped, def.min, def.max);
    }
    case 'select':
      return typeof value === 'string' && def.options.includes(value) ? value : def.default;
  }
}

/**
 * Typed, persistent settings. Values are exposed as signals so UI and systems react to changes;
 * storage is debounced and separate from save slots. Also holds small opaque blobs that belong to
 * the player rather than a save (key bindings, learned hints, benchmark result).
 */
export class Settings {
  private readonly signals = new Map<SettingId, Signal<Raw>>();
  private blobs: Record<string, unknown> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** True when no stored settings existed (first run). */
  readonly firstRun: boolean;

  constructor(private readonly store: KeyValueStore) {
    let stored: Stored | null = null;
    const text = store.get(KEY);
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') stored = parsed as Stored;
      } catch {
        stored = null; // corrupted settings fall back to defaults; saves are untouched
      }
    }
    this.firstRun = stored === null;
    for (const id of SETTING_IDS) {
      const def: SettingDef = SETTINGS[id];
      this.signals.set(id, signal(sanitize(def, stored?.values?.[id])));
    }
    if (stored?.blobs && typeof stored.blobs === 'object') this.blobs = { ...stored.blobs };
    if (this.firstRun && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.signals.get('a11y.reducedMotion')!.value = true;
    }
  }

  get<K extends SettingId>(id: K): SettingValue<K> {
    return this.signals.get(id)!.value as SettingValue<K>;
  }

  /** Read without subscribing (inside effects that should not re-run on this setting). */
  peek<K extends SettingId>(id: K): SettingValue<K> {
    return this.signals.get(id)!.peek() as SettingValue<K>;
  }

  set<K extends SettingId>(id: K, value: SettingValue<K>): void {
    const s = this.signals.get(id)!;
    const next = sanitize(SETTINGS[id], value);
    if (s.peek() === next) return;
    s.value = next;
    this.schedule();
  }

  signal<K extends SettingId>(id: K): ReadonlySignal<SettingValue<K>> {
    return this.signals.get(id) as unknown as ReadonlySignal<SettingValue<K>>;
  }

  /** Call `fn` now and whenever the setting changes. */
  watch<K extends SettingId>(id: K, fn: (value: SettingValue<K>) => void): Unsubscribe {
    return (this.signals.get(id) as unknown as Signal<SettingValue<K>>).subscribe(fn);
  }

  reset(category?: SettingCategory): void {
    for (const id of SETTING_IDS) {
      const def: SettingDef = SETTINGS[id];
      if (!category || def.category === category) this.signals.get(id)!.value = def.default;
    }
    this.schedule();
  }

  isDefault(id: SettingId): boolean {
    return this.signals.get(id)!.peek() === SETTINGS[id].default;
  }

  blob<T>(key: string): T | undefined {
    return this.blobs[key] as T | undefined;
  }

  setBlob(key: string, value: unknown): void {
    if (value === undefined) delete this.blobs[key];
    else this.blobs[key] = value;
    this.schedule();
  }

  /** Write immediately (page hide, before quitting to menu). */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const values: Record<string, Raw> = {};
    for (const id of SETTING_IDS) values[id] = this.signals.get(id)!.peek();
    this.store.set(KEY, JSON.stringify({ version: 1, values, blobs: this.blobs }));
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 250);
  }
}
