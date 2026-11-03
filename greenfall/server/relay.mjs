// Greenfall multiplayer relay — zero dependencies (Node 18+).
//
// Players host matches from their own browser; this relay keeps the public server list and
// passes messages between the host and the players in a room. The host's game is the
// authority for the world (zombies, hordes, AI survivors, extraction); the relay never runs
// game logic.
//
//   node server/relay.mjs                 # relay alone on PORT (default 8788)
//   (or) node server/server.mjs           # wallet + relay together on one port
//
// HTTP:  GET /api/rooms        → public server list
// WS:    /ws                   → host / join / relay messages (JSON text frames)
import http from 'http';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

export const PROTOCOL = 1;
const MAX_MSG = 512 * 1024;          // bytes per message
const MAX_RATE = 400;                 // messages per second per connection (burst-averaged)
const MAX_ROOMS = 500;
const REGIONS = ['NA East', 'NA West', 'EU', 'South America', 'Asia', 'Oceania', 'Other'];

export function attachRelay(server, { allowOrigin = () => true, log = () => {} } = {}) {
  const rooms = new Map();
  let nextId = 1;
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

  function listRooms() {
    const now = Date.now();
    return [...rooms.values()].map((r) => ({
      id: r.id, name: r.name, host: r.hostName, region: r.region, preset: r.preset, max: r.max, players: 1 + r.peers.size,
      locked: !!r.pass, status: r.status, bots: r.bots, created: r.created, uptime: Math.round((now - r.created) / 1000), version: r.version,
    }));
  }

  server.on('upgrade', (req, socket) => {
    if (!req.url || !req.url.startsWith('/ws')) { socket.destroy(); return; }
    if (!allowOrigin(req.headers.origin || '')) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const conn = { id: nextId++, socket, room: null, name: 'Survivor', alive: true, rate: 0, rateT: Date.now(), buf: Buffer.alloc(0), frag: null };
    conn.send = (obj) => { if (conn.alive) sendFrame(socket, 1, Buffer.from(JSON.stringify(obj))); };
    socket.on('data', (chunk) => {
      conn.buf = conn.buf.length ? Buffer.concat([conn.buf, chunk]) : chunk;
      if (conn.buf.length > MAX_MSG * 2) return drop(conn, 'too much data');
      let f;
      while ((f = readFrame(conn.buf))) {
        conn.buf = conn.buf.subarray(f.used);
        if (f.opcode === 8) return drop(conn, 'closed');
        if (f.opcode === 9) { sendFrame(socket, 10, f.payload); continue; }
        if (f.opcode === 10) continue;
        if (f.opcode === 1 || f.opcode === 0) {
          conn.frag = conn.frag ? Buffer.concat([conn.frag, f.payload]) : f.payload;
          if (conn.frag.length > MAX_MSG) return drop(conn, 'message too big');
          if (!f.fin) continue;
          const text = conn.frag.toString('utf8'); conn.frag = null;
          // rate limit
          const now = Date.now();
          conn.rate = Math.max(0, conn.rate - ((now - conn.rateT) / 1000) * MAX_RATE) + 1; conn.rateT = now;
          if (conn.rate > MAX_RATE * 2) return drop(conn, 'rate limit');
          let msg; try { msg = JSON.parse(text); } catch (e) { continue; }
          try { onMessage(conn, msg); } catch (e) { log('relay error', e); }
        }
      }
    });
    socket.on('close', () => drop(conn, 'socket closed'));
    socket.on('error', () => drop(conn, 'socket error'));
    // keepalive
    conn.ping = setInterval(() => { if (conn.alive) sendFrame(socket, 9, Buffer.alloc(0)); }, 20000);
  });

  function onMessage(c, m) {
    switch (m.t) {
      case 'host': {
        if (c.room) return c.send({ t: 'error', msg: 'Already in a room' });
        if (rooms.size >= MAX_ROOMS) return c.send({ t: 'error', msg: 'Too many servers right now — try again soon' });
        const id = crypto.randomBytes(4).toString('hex');
        const r = {
          id, host: c, hostName: clean(m.player, 20) || 'Host', name: clean(m.name, 40) || 'Greenfall server', region: REGIONS.includes(m.region) ? m.region : 'Other',
          preset: ['quick', 'standard', 'marathon'].includes(m.preset) ? m.preset : 'quick', max: Math.max(2, Math.min(8, m.max | 0 || 4)),
          pass: m.pass ? hash(m.pass) : null, status: 'lobby', bots: !!m.bots, created: Date.now(), version: m.ver | 0, peers: new Map(),
        };
        rooms.set(id, r); c.room = r; c.name = r.hostName;
        c.send({ t: 'hosted', room: id, you: c.id });
        log(`room ${id} "${r.name}" hosted`);
        break;
      }
      case 'join': {
        const r = rooms.get(m.room);
        if (!r) return c.send({ t: 'error', msg: 'That server is gone' });
        if (c.room) return c.send({ t: 'error', msg: 'Already in a room' });
        if (r.status !== 'lobby') return c.send({ t: 'error', msg: 'That match has already started' });
        if (1 + r.peers.size >= r.max) return c.send({ t: 'error', msg: 'Server is full' });
        if (r.pass && hash(m.pass || '') !== r.pass) return c.send({ t: 'error', msg: 'Wrong password' });
        if ((m.ver | 0) !== r.version) return c.send({ t: 'error', msg: 'Different game version — refresh the page' });
        c.room = r; c.name = clean(m.player, 20) || 'Survivor';
        r.peers.set(c.id, c);
        c.send({ t: 'joined', room: r.id, you: c.id, host: r.host.id, name: r.name, preset: r.preset });
        r.host.send({ t: 'peer', id: c.id, name: c.name, hello: m.hello || null });
        break;
      }
      case 'room': { // host updates its listing
        const r = c.room;
        if (!r || r.host !== c) return;
        if (m.status === 'lobby' || m.status === 'live') r.status = m.status;
        if (m.name) r.name = clean(m.name, 40);
        break;
      }
      case 'to': { // relay: to a peer id, 'host', or 'all' (everyone else in the room)
        const r = c.room;
        if (!r) return;
        const out = { t: 'from', from: c.id, d: m.d };
        if (m.to === 'all') { if (r.host !== c) r.host.send(out); for (const p of r.peers.values()) if (p !== c) p.send(out); }
        else if (m.to === 'host') r.host.send(out);
        else { const p = m.to === r.host.id ? r.host : r.peers.get(m.to); if (p && p !== c) p.send(out); }
        break;
      }
      case 'kick': { // host removes a player
        const r = c.room;
        if (!r || r.host !== c) return;
        const p = r.peers.get(m.id);
        if (p) { p.send({ t: 'closed', reason: 'You were removed by the host' }); leave(p); }
        break;
      }
      case 'leave': leave(c); break;
      default: break;
    }
  }
  function leave(c) {
    const r = c.room;
    if (!r) return;
    c.room = null;
    if (r.host === c) {
      for (const p of r.peers.values()) { p.send({ t: 'closed', reason: 'The host left' }); p.room = null; }
      rooms.delete(r.id);
      log(`room ${r.id} closed`);
    } else {
      r.peers.delete(c.id);
      r.host.send({ t: 'gone', id: c.id });
      for (const p of r.peers.values()) p.send({ t: 'gone', id: c.id });
    }
  }
  function drop(c, why) {
    if (!c.alive) return;
    c.alive = false;
    clearInterval(c.ping);
    leave(c);
    try { c.socket.end(); } catch (e) { /* ignore */ }
    void why;
  }
  return { listRooms, rooms };
}

// ---- RFC 6455 framing ----
function readFrame(buf) {
  if (buf.length < 2) return null;
  const fin = !!(buf[0] & 0x80), opcode = buf[0] & 0x0f, masked = !!(buf[1] & 0x80);
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  if (len > MAX_MSG) return { fin: true, opcode: 8, payload: Buffer.alloc(0), used: buf.length };
  const mlen = masked ? 4 : 0;
  if (buf.length < off + mlen + len) return null;
  let payload = buf.subarray(off + mlen, off + mlen + len);
  if (masked) {
    const mask = buf.subarray(off, off + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  return { fin, opcode, payload, used: off + mlen + len };
}
function sendFrame(socket, opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  try { socket.write(Buffer.concat([head, payload])); } catch (e) { /* closed */ }
}

// ---- standalone ----
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const PORT = +(process.env.PORT || 8788);
  const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const okOrigin = (o) => !o || !ORIGINS.length || ORIGINS.includes(o) || /^https:\/\/([a-z0-9-]+\.)*itch\.(zone|io)$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
  let relay;
  const srv = http.createServer((req, res) => {
    const o = req.headers.origin;
    const head = { 'content-type': 'application/json', ...(o && okOrigin(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {}) };
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/rooms') { res.writeHead(200, head); res.end(JSON.stringify({ rooms: relay.listRooms(), protocol: PROTOCOL })); return; }
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/time') { res.writeHead(200, head); res.end(JSON.stringify({ now: Date.now() })); return; }
    res.writeHead(404, head); res.end('{}');
  });
  relay = attachRelay(srv, { allowOrigin: okOrigin, log: (...a) => console.log(new Date().toISOString(), ...a) });
  srv.listen(PORT, () => console.log(`Greenfall relay on :${PORT}`));
}
