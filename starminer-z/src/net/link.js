// The wire between players' browsers: WebRTC data channels, set up through PeerJS. A PeerJS
// server only introduces the players (the public one at peerjs.com, or one named with
// ?peer=host:port); after that they talk directly, or through PeerJS's relay when a network
// won't let them.
//
// The host listens under its game code and every guest connects to it: all messages go through
// the host. Players are numbered, the host 0 and its guests 1 to 7. A connection that says
// nothing for a while (a closed laptop, a lost network) counts as gone.

import { Peer } from 'peerjs';

const PREFIX = 'starminer-z-';
// no I, O, 0 or 1: they're too easy to mix up when read off a friend's screen
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const MAX_PLAYERS = 8;
const QUIET = 30; // seconds without a word before a connection counts as lost
// (a tab in the background stops drawing, and so stops sending, but its timers still run: a
// ping every couple of seconds keeps it in the game)
const PING = 2.5;

function random(n, alphabet) {
  const r = crypto.getRandomValues(new Uint32Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[r[i] % alphabet.length];
  return s;
}

export function newCode() { return random(CODE_LENGTH, ALPHABET); }

// what someone typed, as a code (anything that can't be in one is dropped)
export function cleanCode(s) {
  return [...String(s || '').toUpperCase()].filter((c) => ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);
}

export function onlineSupported() { return typeof RTCPeerConnection === 'function'; }

// a page that isn't allowed to open connections (the Claude artifact viewer is one) can't play
// online: the browser says so when it stops the connection to the PeerJS server
// (PeerJS itself just waits): whatever's trying to go online is told at once
let blocked = false;
const whenBlocked = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (e) => {
    if (!/^(connect-src|default-src)/.test(e.effectiveDirective || e.violatedDirective || '') || !/^wss?:|peerjs/.test(e.blockedURI || '')) return;
    blocked = true;
    for (const f of [...whenBlocked]) f();
  });
}

function options() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: parseInt(port || '9000', 10), path: '/', secure: false, debug: 0 };
}

// PeerJS's errors, said plainly
function explain(e) {
  if (blocked) return "This page isn't allowed to go online (the Claude artifact viewer doesn't let it). Play from the downloaded copy.";
  switch (e?.type) {
    case 'peer-unavailable': return 'No game is open with that code.';
    case 'browser-incompatible': return "This browser can't play online.";
    case 'network': case 'socket-error': case 'socket-closed': case 'server-error': case 'disconnected':
      return "Couldn't reach the online service. Check your internet connection.";
    case 'unavailable-id': return 'That code is taken.';
    default: return e?.message || 'Something went wrong online.';
  }
}

export class Link {
  constructor() {
    this.peer = null;
    this.role = null; // 'host' or 'guest'
    this.code = '';
    this.myId = 0;
    // the other end of each connection: host, by guest id; guest, the host as 0
    this.peers = new Map();
    this.closed = false;
    // set by the game: onMessage(from, msg); the host's onHello(conn, hello) answers
    // { welcome } or { refuse }; onDrop(id, why) when someone goes (for a guest, the host)
    this.onMessage = null;
    this.onHello = null;
    this.onDrop = null;
    this.timer = setInterval(() => this.checkQuiet(), 2000);
  }

  // ---- hosting --------------------------------------------------------------------------------

  // Open under a new code; resolves with the code once the PeerJS server has us.
  host() {
    return new Promise((resolve, reject) => {
      let settled = false, tries = 0;
      const giveUp = setTimeout(() => finish(new Error(explain({ type: 'network' }))), 20000);
      const onBlocked = () => finish(new Error(explain()));
      whenBlocked.add(onBlocked);
      const finish = (err, code) => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        whenBlocked.delete(onBlocked);
        if (err) { this.peer?.destroy(); this.peer = null; reject(err); } else resolve(code);
      };
      const attempt = () => {
        const code = newCode();
        const peer = new Peer(PREFIX + code, options());
        this.peer = peer;
        peer.on('open', () => {
          this.role = 'host';
          this.code = code;
          finish(null, code);
        });
        peer.on('connection', (conn) => this.incoming(conn));
        peer.on('error', (e) => {
          if (!settled) {
            if (e.type === 'unavailable-id' && ++tries < 6) { peer.destroy(); attempt(); return; }
            // (a moment on, so the browser's word that the page may not go online is in)
            setTimeout(() => finish(new Error(explain(e))), 100);
            return;
          }
          // a guest's connection failing doesn't stop the game
          console.warn('online:', e.type, e.message);
        });
        // lost the PeerJS server: games in progress carry on; try to be findable again (and if
        // it never let us in, that's that)
        peer.on('disconnected', () => {
          if (!settled) { setTimeout(() => finish(new Error(explain({ type: 'network' }))), 100); return; }
          if (this.closed) return;
          setTimeout(() => { if (!this.closed && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 3000);
        });
      };
      attempt();
    });
  }

  incoming(conn) {
    conn.on('data', (m) => {
      const p = conn.player;
      if (p) { p.last = performance.now(); this.onMessage?.(p.id, m); return; }
      if (m?.t !== 'hello' || this.closed) return;
      const id = this.freeId();
      const r = id < 0 ? { refuse: 'That game is full.' } : this.onHello?.(id, m) ?? { refuse: 'That game is not taking players.' };
      if (r.refuse) {
        conn.send({ t: 'refuse', reason: r.refuse });
        setTimeout(() => conn.close(), 500);
        return;
      }
      conn.player = { id, conn, last: performance.now() };
      this.peers.set(id, conn.player);
      conn.send({ t: 'welcome', id, ...r.welcome });
    });
    conn.on('close', () => { if (conn.player) this.lost(conn.player.id, 'left'); });
    conn.on('error', (e) => console.warn('online: connection', e.type, e.message));
  }

  freeId() {
    for (let i = 1; i < MAX_PLAYERS; i++) if (!this.peers.has(i)) return i;
    return -1;
  }

  // ---- joining --------------------------------------------------------------------------------

  // Connect to the game with this code; resolves with the host's welcome.
  join(code, hello) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(`${PREFIX}${code}-${random(10, ALPHABET).toLowerCase()}`, options());
      this.peer = peer;
      const giveUp = setTimeout(() => fail(blocked ? explain() : "The game didn't answer. Check the code and try again."), 25000);
      const onBlocked = () => fail(explain());
      whenBlocked.add(onBlocked);
      const fail = (why) => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        whenBlocked.delete(onBlocked);
        peer.destroy();
        this.peer = null;
        reject(new Error(why));
      };
      peer.on('error', (e) => {
        if (!settled) setTimeout(() => fail(explain(e)), 100);
        else console.warn('online:', e.type, e.message);
      });
      peer.on('disconnected', () => { if (!settled) setTimeout(() => fail(explain({ type: 'network' })), 100); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conn.on('open', () => conn.send({ t: 'hello', ...hello }));
        conn.on('data', (m) => {
          if (settled) {
            const h = this.peers.get(0);
            if (h) h.last = performance.now();
            this.onMessage?.(0, m);
            return;
          }
          if (m?.t === 'refuse') { fail(m.reason || 'The game turned you away.'); return; }
          if (m?.t !== 'welcome') return;
          settled = true;
          clearTimeout(giveUp);
          whenBlocked.delete(onBlocked);
          this.role = 'guest';
          this.code = code;
          this.myId = m.id;
          this.peers.set(0, { id: 0, conn, last: performance.now() });
          // once in, the PeerJS server isn't needed any more
          resolve(m);
        });
        conn.on('close', () => {
          if (!settled) fail('The game closed the connection.');
          else this.lost(0, 'gone');
        });
        conn.on('error', (e) => console.warn('online: connection', e.type, e.message));
      });
    });
  }

  // ---- talking --------------------------------------------------------------------------------

  // host: to every guest (but one); guest: to the host
  send(m, except = -1) {
    for (const p of this.peers.values()) if (p.id !== except) this.write(p, m);
  }

  sendTo(id, m) {
    const p = this.peers.get(id);
    if (p) this.write(p, m);
  }

  write(p, m) {
    try {
      if (!p.conn.open) return;
      p.conn.send(m);
      p.sent = performance.now();
    } catch (e) { console.warn('online: send', e.message); }
  }

  get count() { return this.peers.size; }

  checkQuiet() {
    const now = performance.now();
    for (const p of [...this.peers.values()]) {
      if (now - p.last > QUIET * 1000) { this.lost(p.id, 'quiet'); continue; }
      if (now - (p.sent || 0) > PING * 1000) this.write(p, { t: 'ping' });
    }
  }

  lost(id, why) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.conn.close(); } catch { /* already closed */ }
    if (!this.closed) this.onDrop?.(id, why);
  }

  // Hang up on everyone (saying goodbye first, so they don't wait to notice).
  close(why = 'bye') {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    for (const p of this.peers.values()) this.write(p, { t: 'bye', why });
    const peer = this.peer;
    this.peers.clear();
    // give the goodbyes a moment to go out
    setTimeout(() => { try { peer?.destroy(); } catch { /* gone */ } }, 300);
  }
}
