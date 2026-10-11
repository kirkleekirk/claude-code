// Saving the world: one Endurance world at a time, kept in IndexedDB (a world's edits can grow
// past what localStorage holds), with a little summary in localStorage for the menus. Storage
// can be missing or blocked (private windows, embedded previews): every call copes, and the
// game simply doesn't remember.

const DB = 'starminer';
const STORE = 'worlds';
const KEY = 'endurance';
const META = 'starminer.save';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : true);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

// The summary the menus show: { day, distance, maxDistance, savedAt } or null.
export function saveMeta() {
  try { return JSON.parse(localStorage.getItem(META) || 'null'); } catch { return null; }
}

export async function saveGame(data) {
  const meta = { day: data.day, days: data.days, maxDistance: data.maxDistance, savedAt: data.savedAt, seed: data.seed };
  const ok = await tx('readwrite', (s) => s.put(data, KEY));
  if (ok === undefined) {
    // no IndexedDB: try to squeeze it into localStorage
    try { localStorage.setItem(`${META}.data`, JSON.stringify(data)); } catch { return false; }
  }
  try { localStorage.setItem(META, JSON.stringify(meta)); } catch { /* storage blocked */ }
  return true;
}

export async function loadGame() {
  const d = await tx('readonly', (s) => s.get(KEY));
  if (d && typeof d === 'object') return d;
  try { return JSON.parse(localStorage.getItem(`${META}.data`) || 'null'); } catch { return null; }
}

export async function deleteSave() {
  await tx('readwrite', (s) => s.delete(KEY));
  try { localStorage.removeItem(META); localStorage.removeItem(`${META}.data`); } catch { /* storage blocked */ }
}
