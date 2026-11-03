// Server-synced clock for things every player must agree on (the item shop rotation).
// Asks the wallet/multiplayer server for its time; otherwise reads the Date header of the
// page's own host (itch.io's CDN when published). Falls back to the local clock offline.
import { setClockOffset } from '../data/cosmetics.js';

export async function syncClock(apiBase = '') {
  const t0 = Date.now();
  try {
    if (apiBase) {
      const r = await fetch(apiBase.replace(/\/$/, '') + '/api/time', { cache: 'no-store' });
      const j = await r.json();
      if (j && j.now) return apply(j.now, t0);
    }
  } catch (e) { /* try the page host */ }
  try {
    if (location.protocol.startsWith('http')) {
      const r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
      const d = r.headers.get('date');
      if (d) return apply(Date.parse(d) + 500, t0); // Date has 1 s resolution
    }
  } catch (e) { /* offline */ }
  return 0;
}
function apply(serverNow, t0) {
  const rtt = Date.now() - t0;
  const offset = serverNow + rtt / 2 - Date.now();
  // ignore tiny differences; they can't change the shop day in practice
  setClockOffset(Math.abs(offset) > 3000 ? offset : 0);
  return offset;
}
