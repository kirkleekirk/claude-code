import { log } from '@/core/log';
import { fail, ok, type Result } from '@/core/types';

/**
 * Photo gallery storage. Photos are PNG blobs in IndexedDB with a small JPEG thumbnail beside each
 * one so the gallery grid stays fast. When IndexedDB is unavailable (private browsing, disabled
 * storage) the store keeps photos in memory for the session and says so through `persistent`.
 */

export interface PhotoMeta {
  id: string;
  createdAt: number;
  width: number;
  height: number;
  /** Where it was taken, for the caption. */
  place?: string;
}

export type PhotoError = 'quota' | 'unavailable' | 'decode';

export interface PhotoStore {
  /** False when photos only last for this session. */
  readonly persistent: boolean;
  /** Newest first. */
  list(): Promise<PhotoMeta[]>;
  add(blob: Blob, info: { width: number; height: number; place?: string }): Promise<Result<PhotoMeta, PhotoError>>;
  get(id: string): Promise<Blob | null>;
  thumb(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'hothouse-photos';
const DB_VERSION = 1;
const META = 'meta';
const BLOBS = 'blobs';
const THUMBS = 'thumbs';
const THUMB_WIDTH = 384;

function newId(): string {
  const r = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${Date.now().toString(36)}-${r}`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function isQuota(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

/** Downscale to a JPEG thumbnail; falls back to the original blob if decoding is unsupported. */
async function makeThumb(blob: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return blob;
    const bmp = await createImageBitmap(blob);
    const w = Math.min(THUMB_WIDTH, bmp.width);
    const h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
    let out: Blob | null = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
      out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
      out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    }
    bmp.close();
    return out ?? blob;
  } catch {
    return blob;
  }
}

class MemoryPhotoStore implements PhotoStore {
  readonly persistent = false;
  private readonly items = new Map<string, { meta: PhotoMeta; blob: Blob; thumb: Blob }>();

  async list(): Promise<PhotoMeta[]> {
    return [...this.items.values()].map((i) => i.meta).sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(blob: Blob, info: { width: number; height: number; place?: string }): Promise<Result<PhotoMeta, PhotoError>> {
    const meta: PhotoMeta = { id: newId(), createdAt: Date.now(), ...info };
    this.items.set(meta.id, { meta, blob, thumb: await makeThumb(blob) });
    return ok(meta);
  }

  async get(id: string): Promise<Blob | null> {
    return this.items.get(id)?.blob ?? null;
  }

  async thumb(id: string): Promise<Blob | null> {
    return this.items.get(id)?.thumb ?? null;
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}

class IdbPhotoStore implements PhotoStore {
  readonly persistent = true;

  constructor(private readonly db: IDBDatabase) {}

  async list(): Promise<PhotoMeta[]> {
    const tx = this.db.transaction(META, 'readonly');
    const all = await request(tx.objectStore(META).getAll() as IDBRequest<PhotoMeta[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(blob: Blob, info: { width: number; height: number; place?: string }): Promise<Result<PhotoMeta, PhotoError>> {
    const meta: PhotoMeta = { id: newId(), createdAt: Date.now(), ...info };
    const thumb = await makeThumb(blob);
    try {
      const tx = this.db.transaction([META, BLOBS, THUMBS], 'readwrite');
      tx.objectStore(META).put(meta, meta.id);
      tx.objectStore(BLOBS).put(blob, meta.id);
      tx.objectStore(THUMBS).put(thumb, meta.id);
      await done(tx);
      return ok(meta);
    } catch (err) {
      if (isQuota(err)) return fail('quota');
      log.warn('photos', `could not store photo: ${String(err)}`);
      return fail('unavailable');
    }
  }

  async get(id: string): Promise<Blob | null> {
    try {
      const tx = this.db.transaction(BLOBS, 'readonly');
      return ((await request(tx.objectStore(BLOBS).get(id))) as Blob | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async thumb(id: string): Promise<Blob | null> {
    try {
      const tx = this.db.transaction(THUMBS, 'readonly');
      return ((await request(tx.objectStore(THUMBS).get(id))) as Blob | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const tx = this.db.transaction([META, BLOBS, THUMBS], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
      tx.objectStore(THUMBS).delete(id);
      await done(tx);
    } catch (err) {
      log.warn('photos', `could not delete photo: ${String(err)}`);
    }
  }
}

/** Open the gallery store. Never rejects: falls back to a session-only store. */
export async function openPhotoStore(): Promise<PhotoStore> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryPhotoStore();
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS);
    };
    const db = await request(req);
    return new IdbPhotoStore(db);
  } catch {
    log.info('photos', 'IndexedDB unavailable; photos will last for this session only');
    return new MemoryPhotoStore();
  }
}

/** A store that only lives in memory (tests, the UI lab). */
export function createMemoryPhotoStore(): PhotoStore {
  return new MemoryPhotoStore();
}
