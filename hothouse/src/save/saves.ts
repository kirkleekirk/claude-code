import { hashString } from '@/core/rng';
import { fail, ok, type Result } from '@/core/types';
import type { KeyValueStore } from './storage';

export const SAVE_FORMAT = 'hothouse-save';
export const SAVE_VERSION = 1;

export type SlotId = 'auto' | 1 | 2 | 3;
export const SLOTS: readonly SlotId[] = ['auto', 1, 2, 3];

/** What the menus show for a slot without loading the whole save. */
export interface SaveMeta {
  slot: SlotId;
  savedAt: number;
  /** Seconds of play. */
  playtime: number;
  rank: number;
  rankTitle: string;
  cash: number;
  location: string;
  day: number;
  clockHours: number;
  brand: string | null;
  /** Small JPEG data URL, or null. */
  thumb: string | null;
}

export interface SaveData<S = unknown, W = unknown> {
  format: typeof SAVE_FORMAT;
  version: number;
  meta: SaveMeta;
  sim: S;
  world: W;
}

export interface LoadedSave<S = unknown, W = unknown> {
  data: SaveData<S, W>;
  /** True when the primary copy was unreadable and the backup was used. */
  recovered: boolean;
}

export type SaveError = 'quota' | 'verify';
export type LoadError = 'missing' | 'corrupt' | 'newer';

/** Upgrades a save from `version` to `version + 1`. Keyed by the source version. */
export type Migration = (data: SaveData) => SaveData;

const keyOf = (slot: SlotId): string => `hothouse.save.${slot}`;

interface Envelope {
  checksum: string;
  data: SaveData;
}

function checksum(json: string): string {
  // Two independent 32-bit hashes; enough to catch truncation and bit rot.
  return hashString(json).toString(16).padStart(8, '0') + hashString(`${json.length}:${json.slice(0, 4096)}`).toString(16).padStart(8, '0');
}

function isMeta(m: unknown): m is SaveMeta {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return typeof o.savedAt === 'number' && typeof o.playtime === 'number' && typeof o.rank === 'number' && typeof o.cash === 'number';
}

/**
 * Save slots with atomic writes, a rolling backup, checksum validation, version migration and
 * text export/import. Storage-agnostic so it can be unit-tested.
 */
export class SaveManager {
  constructor(
    private readonly store: KeyValueStore,
    private readonly migrations: Readonly<Record<number, Migration>> = {},
  ) {}

  /** Metadata for every slot (null when empty or unreadable). */
  list(): Record<string, SaveMeta | null> {
    const out: Record<string, SaveMeta | null> = {};
    for (const slot of SLOTS) {
      const res = this.read(slot);
      out[String(slot)] = res.ok ? res.value.data.meta : null;
    }
    return out;
  }

  /** The most recently written slot, for Continue. */
  latest(): SaveMeta | null {
    let best: SaveMeta | null = null;
    for (const meta of Object.values(this.list())) {
      if (meta && (!best || meta.savedAt > best.savedAt)) best = meta;
    }
    return best;
  }

  write<S, W>(slot: SlotId, meta: Omit<SaveMeta, 'slot'>, sim: S, world: W): Result<SaveMeta, SaveError> {
    const fullMeta: SaveMeta = { ...meta, slot };
    const data: SaveData<S, W> = { format: SAVE_FORMAT, version: SAVE_VERSION, meta: fullMeta, sim, world };
    const text = SaveManager.encode(data);
    const key = keyOf(slot);
    const tmp = `${key}.tmp`;
    if (!this.store.set(tmp, text)) {
      // Likely quota: drop the thumbnail and try once more before giving up.
      if (fullMeta.thumb === null) return fail('quota');
      return this.write(slot, { ...meta, thumb: null }, sim, world);
    }
    if (this.store.get(tmp) !== text) {
      this.store.remove(tmp);
      return fail('verify');
    }
    const previous = this.store.get(key);
    if (previous !== null && SaveManager.decode(previous).ok) this.store.set(`${key}.bak`, previous);
    if (!this.store.set(key, text)) {
      this.store.remove(tmp);
      return fail('quota');
    }
    this.store.remove(tmp);
    return ok(fullMeta);
  }

  read<S = unknown, W = unknown>(slot: SlotId): Result<LoadedSave<S, W>, LoadError> {
    const key = keyOf(slot);
    const primary = this.store.get(key);
    const backup = this.store.get(`${key}.bak`);
    if (primary === null && backup === null) return fail('missing');
    let firstError: LoadError = 'corrupt';
    if (primary !== null) {
      const res = this.parse(primary);
      if (res.ok) return ok({ data: res.value as SaveData<S, W>, recovered: false });
      firstError = res.error;
    }
    if (backup !== null) {
      const res = this.parse(backup);
      if (res.ok) return ok({ data: res.value as SaveData<S, W>, recovered: true });
    }
    return fail(firstError);
  }

  remove(slot: SlotId): void {
    const key = keyOf(slot);
    this.store.remove(key);
    this.store.remove(`${key}.bak`);
    this.store.remove(`${key}.tmp`);
  }

  has(slot: SlotId): boolean {
    return this.store.get(keyOf(slot)) !== null || this.store.get(`${keyOf(slot)}.bak`) !== null;
  }

  /** The slot's save as text for download (`.hothouse`). */
  exportText(slot: SlotId): Result<string, LoadError> {
    const res = this.read(slot);
    return res.ok ? ok(SaveManager.encode(res.value.data)) : res;
  }

  /** Validate imported text and store it in `slot`. */
  importText(text: string, slot: SlotId): Result<SaveMeta, LoadError | SaveError> {
    const res = this.parse(text);
    if (!res.ok) return res;
    const { meta, sim, world } = res.value;
    return this.write(slot, meta, sim, world);
  }

  static encode(data: SaveData): string {
    const body = JSON.stringify(data);
    return `{"checksum":"${checksum(body)}","data":${body}}`;
  }

  /** Parse and verify the envelope without migrating. */
  static decode(text: string): Result<SaveData, 'corrupt'> {
    let env: Envelope;
    try {
      env = JSON.parse(text) as Envelope;
    } catch {
      return fail('corrupt');
    }
    if (!env || typeof env !== 'object' || typeof env.checksum !== 'string' || !env.data || typeof env.data !== 'object') {
      return fail('corrupt');
    }
    const d = env.data;
    if (d.format !== SAVE_FORMAT || typeof d.version !== 'number' || !isMeta(d.meta)) return fail('corrupt');
    if (checksum(JSON.stringify(d)) !== env.checksum) return fail('corrupt');
    return ok(d);
  }

  private parse(text: string): Result<SaveData, LoadError> {
    const res = SaveManager.decode(text);
    if (!res.ok) return res;
    let data = res.value;
    if (data.version > SAVE_VERSION) return fail('newer');
    try {
      while (data.version < SAVE_VERSION) {
        const migrate = this.migrations[data.version];
        if (!migrate) return fail('corrupt');
        const from = data.version;
        data = migrate(data);
        if (data.version <= from) data = { ...data, version: from + 1 };
      }
    } catch {
      return fail('corrupt');
    }
    return ok(data);
  }
}
