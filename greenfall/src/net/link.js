// Connection to the multiplayer relay: the public server list (HTTP) and a WebSocket for
// hosting/joining and passing messages.
export const MP_VERSION = 4; // bump when the network protocol or match rules change

export function relayBase() {
  const w = typeof window !== 'undefined' ? window : {};
  const env = (import.meta.env || {});
  const base = w.GREENFALL_MP || env.VITE_GREENFALL_MP || w.GREENFALL_API || env.VITE_GREENFALL_API || '';
  if (base) return String(base).replace(/\/$/, '');
  // local development: the server runs next to the dev server
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return `http://${location.hostname}:8787`;
  return '';
}

export class Link {
  constructor(base = relayBase()) {
    this.base = base;
    this.ws = null;
    this.handlers = {};
    this.you = null;
    this.waiters = [];
  }
  get configured() { return !!this.base; }
  get open() { return this.ws && this.ws.readyState === 1; }
  on(type, fn) { (this.handlers[type] || (this.handlers[type] = [])).push(fn); return () => { this.handlers[type] = this.handlers[type].filter((f) => f !== fn); }; }
  emit(type, ...args) { for (const f of this.handlers[type] || []) { try { f(...args); } catch (e) { console.warn(e); } } }
  async rooms() {
    const r = await fetch(this.base + '/api/rooms', { cache: 'no-store' });
    if (!r.ok) throw new Error('Server list unavailable');
    const j = await r.json();
    return j.rooms || [];
  }
  connect() {
    if (this.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const url = this.base.replace(/^http/, 'ws') + '/ws';
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const t = setTimeout(() => { reject(new Error('Could not reach the multiplayer server')); try { ws.close(); } catch (e) { /* ignore */ } }, 8000);
      ws.onopen = () => { clearTimeout(t); resolve(); };
      ws.onerror = () => { clearTimeout(t); reject(new Error('Could not reach the multiplayer server')); };
      ws.onclose = () => { this.emit('close'); };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        for (const w of [...this.waiters]) if (w.types.includes(m.t)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
        if (m.t === 'from') this.emit('msg', m.from, m.d);
        else this.emit(m.t, m);
      };
    });
  }
  wait(types, ms = 8000) {
    return new Promise((resolve, reject) => {
      const w = { types, resolve };
      this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); reject(new Error('The server did not answer')); } }, ms);
    });
  }
  send(obj) { if (this.open) this.ws.send(JSON.stringify(obj)); }
  to(dest, d) { this.send({ t: 'to', to: dest, d }); }
  async host(opts) {
    await this.connect();
    this.send({ t: 'host', ver: MP_VERSION, ...opts });
    const m = await this.wait(['hosted', 'error']);
    if (m.t === 'error') throw new Error(m.msg);
    this.you = m.you; this.room = m.room; this.isHost = true;
    return m;
  }
  async join(room, opts) {
    await this.connect();
    this.send({ t: 'join', room, ver: MP_VERSION, ...opts });
    const m = await this.wait(['joined', 'error']);
    if (m.t === 'error') throw new Error(m.msg);
    this.you = m.you; this.room = m.room; this.hostId = m.host; this.isHost = false;
    return m;
  }
  setStatus(status) { this.send({ t: 'room', status }); }
  kick(id) { this.send({ t: 'kick', id }); }
  leave() {
    this.send({ t: 'leave' });
    this.handlers = {};
    const ws = this.ws; this.ws = null;
    try { ws?.close(); } catch (e) { /* ignore */ }
  }
}
