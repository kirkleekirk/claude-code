// Saving: the worlds you've made (Survival, Dragon Endurance and Creative keep theirs; an
// Endurance world is never kept, as in the original), each in IndexedDB under its own key (a
// world's edits can grow past what localStorage holds), with the list of them (name, when, what
// kind) in localStorage for the menus. Storage can be missing or blocked (private windows,
// embedded previews): every call copes, and the game simply doesn't remember.

const DB = 'starminer';
const STORE = 'worlds';
const LIST = 'starminer.worlds';
// (before there were several worlds: the one Endurance world, and its summary)
const OLD_KEY = 'endurance', OLD_META = 'starminer.save';

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

const keyOf = (id) => `world:${id}`;

function readList() {
  try {
    const l = JSON.parse(localStorage.getItem(LIST) || '[]');
    return Array.isArray(l) ? l.filter((w) => w && typeof w.id === 'string') : [];
  } catch { return []; }
}

function writeList(l) {
  try { localStorage.setItem(LIST, JSON.stringify(l)); } catch { /* storage blocked */ }
}

// The worlds, most lately played first: [{ id, name, created, played, creative, seed, days, maxDistance }]
export function listWorlds() {
  return readList().sort((a, b) => (b.played || 0) - (a.played || 0));
}

export function worldInfo(id) { return readList().find((w) => w.id === id) || null; }

export function newWorldId() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;
}

// The original's name for a new world: whose it is, and when it was made
export function worldName(owner, at = new Date()) {
  const when = at.toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return owner ? `${owner}'s World ${when}` : `New World ${when}`;
}

// info: what the list keeps of it ({ name, creative, ... }); the world's own data goes in IndexedDB
export async function saveWorld(id, data, info) {
  const l = readList();
  const was = l.find((w) => w.id === id);
  const entry = {
    ...(was || {}), ...info, id,
    created: was?.created ?? info.created ?? Date.now(), played: Date.now(),
    seed: data.seed, days: data.days, maxDistance: data.maxDistance,
  };
  let ok = await tx('readwrite', (s) => s.put(data, keyOf(id)));
  if (ok === undefined) {
    // no IndexedDB: try to squeeze it into localStorage
    try { localStorage.setItem(`${LIST}.${id}`, JSON.stringify(data)); ok = true; } catch { ok = false; }
  }
  if (!ok) return false;
  writeList([...l.filter((w) => w.id !== id), entry]);
  return true;
}

export async function loadWorld(id) {
  const d = await tx('readonly', (s) => s.get(keyOf(id)));
  if (d && typeof d === 'object') return d;
  try { return JSON.parse(localStorage.getItem(`${LIST}.${id}`) || 'null'); } catch { return null; }
}

export async function deleteWorld(id) {
  await tx('readwrite', (s) => s.delete(keyOf(id)));
  try { localStorage.removeItem(`${LIST}.${id}`); } catch { /* storage blocked */ }
  writeList(readList().filter((w) => w.id !== id));
}

// Erase Storage: every world
export async function eraseWorlds() {
  for (const w of readList()) await deleteWorld(w.id);
  await tx('readwrite', (s) => s.clear());
  writeList([]);
}

// Change a world's entry in the list (a world taken into Creative stays there)
export function updateWorldInfo(id, patch) {
  const l = readList(), w = l.find((x) => x.id === id);
  if (!w) return;
  Object.assign(w, patch);
  writeList(l);
}

// The one world kept before there were several (it was played as Endurance, which kept it then):
// into the list, as a world of its own
export async function migrateOldSave() {
  let meta = null;
  try { meta = JSON.parse(localStorage.getItem(OLD_META) || 'null'); } catch { /* storage blocked */ }
  if (!meta) return null;
  let data = await tx('readonly', (s) => s.get(OLD_KEY));
  if (!data || typeof data !== 'object') { try { data = JSON.parse(localStorage.getItem(`${OLD_META}.data`) || 'null'); } catch { data = null; } }
  let id = null;
  if (data) {
    id = newWorldId();
    const at = new Date(meta.savedAt || Date.now());
    const ok = await saveWorld(id, data, { name: worldName(null, at), creative: false, created: at.getTime() });
    if (!ok) return null;
  }
  await tx('readwrite', (s) => s.delete(OLD_KEY));
  try { localStorage.removeItem(OLD_META); localStorage.removeItem(`${OLD_META}.data`); } catch { /* storage blocked */ }
  return id;
}
