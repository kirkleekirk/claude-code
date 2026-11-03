// Multiplayer menus: server browser (search, filters, sorting), hosting, and the room lobby
// where players gather before the host starts the match.
import { Link, relayBase } from '../net/link.js';
import { PRESETS } from '../game/match.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { cosmeticsFor, BY_ID } from '../data/cosmetics.js';

const REGIONS = ['NA East', 'NA West', 'EU', 'South America', 'Asia', 'Oceania', 'Other'];
const FKEY = 'greenfall.mpfilters.v1';
function guessRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/^America\/(Los_Angeles|Vancouver|Denver|Phoenix|Boise|Anchorage)|^Pacific\/Honolulu/.test(tz)) return 'NA West';
    if (/^America\/(Sao_Paulo|Argentina|Bogota|Lima|Santiago|Caracas)/.test(tz)) return 'South America';
    if (/^America\//.test(tz)) return 'NA East';
    if (/^Europe\/|^Africa\//.test(tz)) return 'EU';
    if (/^Australia\/|^Pacific\/Auckland/.test(tz)) return 'Oceania';
    if (/^Asia\//.test(tz)) return 'Asia';
  } catch (e) { /* ignore */ }
  return 'Other';
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }

export class MultiplayerUI {
  constructor(ui) {
    this.ui = ui;
    this.G = ui.G;
    this.rooms = [];
    this.filters = { q: '', len: 'any', region: 'any', space: true, nolock: false, waiting: true, sort: 'players' };
    try { Object.assign(this.filters, JSON.parse(localStorage.getItem(FKEY) || '{}')); } catch (e) { /* private mode */ }
  }
  saveFilters() { try { localStorage.setItem(FKEY, JSON.stringify(this.filters)); } catch (e) { /* ignore */ } }
  me() {
    const P = this.G.profile.data;
    return { name: P.name, cls: P.settings.classId || 'survivor', equipped: { ...P.equipped } };
  }

  // ---------------- server browser ----------------
  openBrowser() {
    const ui = this.ui;
    const o = ui.openOverlay();
    ui.overlayKind = 'mp';
    const box = el('div', 'mp', o);
    this.box = box;
    const top = el('div', 'mp-top', box);
    el('h1', 'display', top, 'Multiplayer');
    const hostBtn = el('button', 'btn yellow', top, 'Host a server');
    hostBtn.onclick = () => { ui.click(); this.openHost(); };
    const close = el('button', 'btn ghost', top, 'Close');
    close.onclick = () => { ui.click(); this.closeBrowser(); };
    if (!relayBase()) {
      el('div', 'mp-empty', box, '<b>Multiplayer isn\'t set up for this copy of the game.</b><br>It needs the Greenfall server running somewhere (see <i>Multiplayer</i> in the README), then a build with <code>VITE_GREENFALL_API</code> pointing at it.');
      return;
    }
    // filters
    const f = this.filters;
    const bar = el('div', 'mp-filters', box);
    const q = el('input', 'mp-search', bar); q.placeholder = 'Search servers or hosts'; q.value = f.q;
    q.oninput = () => { f.q = q.value; this.saveFilters(); this.renderList(); };
    const sel = (label, key, opts) => {
      const w = el('label', 'mp-sel', bar, `<span>${label}</span>`);
      const s = el('select', '', w);
      for (const [v, t] of opts) { const op = el('option', '', s, t); op.value = v; }
      s.value = f[key];
      s.onchange = () => { f[key] = s.value; this.saveFilters(); this.renderList(); };
    };
    sel('Length', 'len', [['any', 'Any'], ...Object.entries(PRESETS).map(([k, p]) => [k, p.label])]);
    sel('Region', 'region', [['any', 'Any'], ...REGIONS.map((r) => [r, r])]);
    sel('Sort', 'sort', [['players', 'Most players'], ['fewest', 'Fewest players'], ['newest', 'Newest'], ['name', 'Name A–Z']]);
    const chk = (label, key) => {
      const w = el('label', 'mp-chk', bar);
      const c = el('input', '', w); c.type = 'checkbox'; c.checked = !!f[key];
      el('span', '', w, label);
      c.onchange = () => { f[key] = c.checked; this.saveFilters(); this.renderList(); };
    };
    chk('Has space', 'space'); chk('No password', 'nolock'); chk('Not started', 'waiting');
    const ref = el('button', 'btn ghost small', bar, 'Refresh');
    ref.onclick = () => { ui.click(); this.refresh(); };
    this.listEl = el('div', 'mp-list', box);
    this.statusEl = el('div', 'mp-status', box);
    this.refresh();
    clearInterval(this.refreshT);
    this.refreshT = setInterval(() => { if (!document.body.contains(box)) { clearInterval(this.refreshT); return; } this.refresh(true); }, 5000);
    o.onclick = (e) => { if (e.target === o) this.closeBrowser(); };
  }
  closeBrowser() { clearInterval(this.refreshT); this.ui.closeOverlay(); }
  async refresh(quiet = false) {
    if (!quiet) this.statusEl.textContent = 'Looking for servers...';
    try {
      const link = new Link();
      this.rooms = await link.rooms();
      this.statusEl.textContent = `${this.rooms.length} server${this.rooms.length === 1 ? '' : 's'} online · updated ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      this.rooms = [];
      this.statusEl.innerHTML = '<span style="color:#ff8a7a">Can\'t reach the multiplayer server right now.</span>';
    }
    this.renderList();
  }
  filtered() {
    const f = this.filters, q = f.q.trim().toLowerCase();
    let list = this.rooms.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.host.toLowerCase().includes(q))
      && (f.len === 'any' || r.preset === f.len) && (f.region === 'any' || r.region === f.region)
      && (!f.space || r.players < r.max) && (!f.nolock || !r.locked) && (!f.waiting || r.status === 'lobby'));
    const by = { players: (a, b) => b.players - a.players, fewest: (a, b) => a.players - b.players, newest: (a, b) => b.created - a.created, name: (a, b) => a.name.localeCompare(b.name) }[f.sort];
    return list.sort(by);
  }
  renderList() {
    const L = this.listEl;
    if (!L) return;
    L.innerHTML = '';
    const list = this.filtered();
    if (!list.length) {
      el('div', 'mp-empty', L, this.rooms.length ? 'No servers match your filters.' : 'No servers yet. Host one and invite your friends!');
      return;
    }
    const head = el('div', 'mp-row mp-head', L);
    head.innerHTML = '<span>Server</span><span>Host</span><span>Region</span><span>Length</span><span>Players</span><span>Status</span><span></span>';
    for (const r of list) {
      const row = el('div', 'mp-row', L);
      const full = r.players >= r.max, started = r.status !== 'lobby';
      row.innerHTML = `<span class="mp-name">${r.locked ? '🔒 ' : ''}${esc(r.name)}</span><span>${esc(r.host)}</span><span>${esc(r.region)}</span><span>${esc(PRESETS[r.preset]?.label || r.preset)}${r.bots ? ' <small>+ AI</small>' : ''}</span><span>${r.players}/${r.max}</span><span class="${started ? 'mp-live' : 'mp-wait'}">${started ? 'In match' : 'Waiting'}</span>`;
      const b = el('button', 'btn small' + (full || started ? ' ghost' : ' lime'), row, full ? 'Full' : started ? 'Started' : 'Join');
      b.disabled = full || started;
      b.onclick = () => { this.ui.click(); this.join(r); };
    }
  }
  async join(r) {
    let pass = '';
    if (r.locked) { pass = prompt(`Password for "${r.name}"`) || ''; if (!pass) return; }
    this.statusEl.textContent = 'Joining...';
    const link = new Link();
    try {
      const me = this.me();
      await link.join(r.id, { pass, player: me.name, hello: me });
      clearInterval(this.refreshT);
      this.enterRoom(link, { name: r.name, preset: r.preset, bots: r.bots, region: r.region }, false);
    } catch (e) {
      link.leave();
      this.statusEl.innerHTML = `<span style="color:#ff8a7a">${esc(e.message)}</span>`;
    }
  }

  // ---------------- hosting ----------------
  openHost() {
    const ui = this.ui;
    const m = el('div', 'modal', ui.root);
    const box = el('div', 'modal-box mp-host', m);
    box.style.flexDirection = 'column';
    el('h2', '', box, 'Host a server');
    const P = this.G.profile.data;
    const form = el('div', 'mp-form', box);
    const row = (label) => el('label', 'mp-field', form, `<span>${label}</span>`);
    const name = el('input', '', row('Server name')); name.value = `${P.name}'s server`; name.maxLength = 40;
    const len = el('select', '', row('Match length'));
    for (const [k, p] of Object.entries(PRESETS)) { const op = el('option', '', len, `${p.label} — ${p.desc}`); op.value = k; }
    len.value = P.settings.matchLength || 'quick';
    const max = el('select', '', row('Max players'));
    for (let n = 2; n <= 8; n++) { const op = el('option', '', max, String(n)); op.value = n; }
    max.value = 4;
    const reg = el('select', '', row('Region'));
    for (const r of REGIONS) { const op = el('option', '', reg, r); op.value = r; }
    reg.value = guessRegion();
    const pass = el('input', '', row('Password (optional)')); pass.type = 'password'; pass.maxLength = 32; pass.placeholder = 'Leave empty for a public server';
    const bw = el('label', 'mp-chk', form); const bots = el('input', '', bw); bots.type = 'checkbox'; bots.checked = true; el('span', '', bw, 'Fill the island with AI survivors');
    const err = el('div', 'desc', box);
    const btns = el('div', 'mp-btns', box);
    const go = el('button', 'btn yellow', btns, 'Create server');
    const cancel = el('button', 'btn ghost', btns, 'Cancel');
    cancel.onclick = () => { ui.click(); m.remove(); };
    go.onclick = async () => {
      ui.click(); go.disabled = true; err.textContent = 'Creating...';
      const link = new Link();
      try {
        await link.host({ name: name.value, preset: len.value, max: +max.value, region: reg.value, pass: pass.value, bots: bots.checked, player: P.name });
        m.remove();
        clearInterval(this.refreshT);
        this.enterRoom(link, { name: name.value, preset: len.value, bots: bots.checked, region: reg.value, max: +max.value }, true);
      } catch (e) { link.leave(); go.disabled = false; err.innerHTML = `<span style="color:#ff8a7a">${esc(e.message)}</span>`; }
    };
  }

  // ---------------- room lobby ----------------
  enterRoom(link, room, isHost) {
    const ui = this.ui, G = this.G;
    this.link = link; this.room = room; this.isHost = isHost;
    const me = this.me();
    this.roster = isHost ? [this.entry(link.you, me)] : [];
    const o = ui.openOverlay();
    ui.overlayKind = 'mproom';
    const box = el('div', 'mp mp-room', o);
    this.roomBox = box;
    // events
    link.on('peer', (m) => {
      if (!this.isHost) return;
      const hello = m.hello || {};
      this.roster.push(this.entry(m.id, { name: m.name, cls: hello.cls, equipped: hello.equipped || {} }));
      this.broadcastRoster(); this.renderRoom();
      G.audio?.play('ui_click', null, { vol: 0.6, bus: 'ui' });
    });
    link.on('gone', (m) => { this.roster = this.roster.filter((r) => r.id !== m.id); if (this.isHost) this.broadcastRoster(); this.renderRoom(); });
    link.on('closed', (m) => { if (G.inMatch) return; this.leaveRoom(m.reason || 'The server closed'); });
    link.on('close', () => { if (G.inMatch) return; this.leaveRoom('Lost connection to the server'); });
    link.on('msg', (from, d) => {
      if (G.inMatch || !d) return;
      if (d.k === 'roster' && !this.isHost) { this.roster = d.list; this.renderRoom(); }
      if (d.k === 'hi' && this.isHost) this.broadcastRoster();
      if (d.k === 'start' && !this.isHost) this.startAsClient(d);
    });
    if (!isHost) link.to(link.hostId, { k: 'hi' }); // host answers with the roster when someone joins anyway
    this.renderRoom();
  }
  entry(id, p) {
    const eq = { ...p.equipped };
    for (const k of Object.keys(eq)) if (!BY_ID[eq[k]]) delete eq[k]; // only real cosmetics
    const cos = cosmeticsFor({ outfit: 'farmhand', backbling: 'bb_pack', wrap: 'wr_none', ...eq });
    return { id, name: String(p.name || 'Survivor').slice(0, 20), cls: CLASS_BY_ID[p.cls] ? p.cls : 'survivor', outfit: cos.outfit, cosmetics: cos.cosmetics };
  }
  broadcastRoster() { this.link.to('all', { k: 'roster', list: this.roster }); }
  renderRoom() {
    const box = this.roomBox, ui = this.ui, link = this.link;
    if (!box) return;
    box.innerHTML = '';
    const top = el('div', 'mp-top', box);
    el('h1', 'display', top, esc(this.room.name));
    el('div', 'mp-sub', top, `${esc(PRESETS[this.room.preset]?.label || '')} · ${esc(this.room.region || '')}${this.room.bots ? ' · AI survivors on' : ' · players only'}`);
    const leave = el('button', 'btn ghost', top, this.isHost ? 'Close server' : 'Leave');
    leave.onclick = () => { ui.click(); this.leaveRoom(); };
    const list = el('div', 'mp-players', box);
    for (const r of this.roster) {
      const c = CLASS_BY_ID[r.cls] || CLASS_BY_ID.survivor;
      const row = el('div', 'mp-player', list, `<span class="cc-icon" style="color:${c.color}">${c.icon}</span><b>${esc(r.name)}</b><small>${c.name}</small>${r.id === (this.isHost ? link.you : link.hostId) ? '<span class="mp-crown">HOST</span>' : ''}${r.id === link.you ? '<span class="mp-you">YOU</span>' : ''}`);
      if (this.isHost && r.id !== link.you) { const k = el('button', 'btn ghost small', row, 'Kick'); k.onclick = () => { ui.click(); link.kick(r.id); }; }
    }
    if (!this.roster.length) el('div', 'mp-empty', list, 'Connecting...');
    const foot = el('div', 'mp-foot', box);
    if (this.isHost) {
      el('div', 'desc', foot, `${this.roster.length} player${this.roster.length === 1 ? '' : 's'} in the room. Your game runs the match — keep this tab open until everyone is done.`);
      const start = el('button', 'btn yellow playbtn display', foot, 'Start match');
      start.onclick = () => { ui.click(); this.startAsHost(); };
    } else el('div', 'desc', foot, 'Waiting for the host to start the match...');
  }
  leaveRoom(reason = null) {
    try { this.link?.leave(); } catch (e) { /* ignore */ }
    this.link = null; this.roomBox = null;
    this.ui.closeOverlay();
    this.openBrowser();
    if (reason) this.statusEl.innerHTML = `<span style="color:#ff8a7a">${esc(reason)}</span>`;
  }
  startAsHost() {
    const link = this.link;
    this.roomBox = null;
    this.ui.closeOverlay();
    link.setStatus('live');
    this.G.startMatch(this.room.preset, { role: 'host', link, me: link.you, hostId: link.you, roster: this.roster, bots: this.room.bots });
  }
  startAsClient(d) {
    const link = this.link;
    this.roomBox = null;
    this.ui.closeOverlay();
    this.G.startMatch(d.preset, { role: 'client', link, me: link.you, hostId: link.hostId, roster: d.roster, seed: d.seed, spawns: d.spawns, botInfo: d.bots });
  }
}
