// Playing together online (link.js is the wire). The host's world is the one that counts:
// whoever joins gets its seed, every change made to it so far and the time of day, and from then
// on every change anyone makes goes through the host to everyone, in the host's order. Each
// player's own machine runs the dead that come for that player, as CastleMiner Z does, and tells
// the others where they are and what they're doing; a hit on one of someone else's goes to the
// machine that runs it, and the kill (and whatever it leaves) to whoever made it. What each
// player carries is their own: the host keeps it with the world, for when they come back.

import * as THREE from 'three';
import { RemotePlayer, enemySnapshot, SHOULDER, RELOAD, DEAD, CROUCH, GROUND } from './remote.js';
import { BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../items/items.js';
import { PRESETS } from '../entities/avatar/looks.js';

export const PROTOCOL = 1;
// how often (seconds) each thing goes out
const STATE_EVERY = 1 / 15, ENEMIES_EVERY = 1 / 8, CLOCK_EVERY = 2, KEEP_EVERY = 15;

const v3 = (a) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
const arr = (v) => [v.x, v.y, v.z];

// a name as the others see it
export function cleanName(s) { return String(s ?? '').replace(/[^\p{L}\p{N} _'.-]/gu, '').trim().slice(0, 16); }

// how someone looks, as sent (see App.look)
export function cleanProfile(p) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  const preset = Number.isInteger(p?.preset) && PRESETS[p.preset] ? p.preset : 0;
  return { preset, skin: n(p?.skin), hair: n(p?.hair), shirt: n(p?.shirt) };
}

// a snapshot's floats, however the wire delivered them
function floats(d) {
  if (d instanceof Float32Array) return d;
  if (d instanceof ArrayBuffer) return new Float32Array(d);
  if (ArrayBuffer.isView(d)) return new Float32Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
  if (Array.isArray(d)) return Float32Array.from(d);
  return new Float32Array(0);
}

export class Online {
  // link: a Link that's hosting, or one that has joined (welcome: what the host sent)
  constructor(game, link, welcome = null) {
    this.game = game;
    this.app = game.app;
    this.link = link;
    this.host = link.role === 'host';
    this.myId = link.myId;
    this.code = link.code;
    this.myName = welcome ? welcome.name : this.app.netName();
    this.players = new Map();
    this.sets = [];
    this.t = { state: 0, enemies: 0, clock: 0, keep: KEEP_EVERY };
    this.closed = false;
    link.onMessage = (from, m) => {
      try { this.receive(from, m); } catch (e) { console.warn('online: a message went wrong', m?.t, e); }
    };
    link.onDrop = (id, why) => this.dropped(id, why);
    if (this.host) link.onHello = (id, h) => this.hello(id, h);
    if (welcome) for (const p of welcome.players || []) if (p.id !== this.myId) this.addPlayer(p.id, p.name, p.prof);
  }

  // everyone in the game, this player too
  get count() { return this.players.size + 1; }

  // ---- who's here ----------------------------------------------------------------------------

  // The host, to someone knocking: the world as it stands, or why not.
  hello(id, h) {
    const g = this.game, sky = this.app.sky;
    if (h.v !== PROTOCOL) return { refuse: "Your copy of StarMiner Z isn't the same version as the host's. Play from the same copy." };
    if (!g.ready) return { refuse: 'The host is still loading. Try again in a moment.' };
    const base = cleanName(h.name) || `Player ${id + 1}`;
    const taken = new Set([this.myName, ...[...this.players.values()].map((p) => p.name)]);
    let name = base;
    for (let k = 2; taken.has(name); k++) name = `${base} ${k}`;
    const prof = cleanProfile(h.prof);
    const players = [{ id: 0, name: this.myName, prof: cleanProfile(this.app.profile) }, ...[...this.players.values()].map((p) => ({ id: p.id, name: p.name, prof: p.prof }))];
    this.link.send({ t: 'join', id, name, prof });
    this.addPlayer(id, name, prof);
    g.hud.message(`${name} joined the game`);
    this.app.audio?.ui?.('open');
    return {
      welcome: {
        v: PROTOCOL, name, seed: g.seed, mode: g.mode, time: sky.time, day: sky.day, grace: g.grace,
        edits: g.world.serializeEdits(), players, you: g.guests[name] ?? null,
      },
    };
  }

  addPlayer(id, name, prof) {
    this.players.get(id)?.dispose();
    this.players.set(id, new RemotePlayer(this.game, id, cleanName(name) || `Player ${id + 1}`, cleanProfile(prof)));
    this.app.onOnlineChange?.();
  }

  removePlayer(id, why) {
    const p = this.players.get(id);
    if (!p) return;
    p.dispose();
    this.players.delete(id);
    this.game.enemies.dropGhosts(id);
    this.game.hud.message(`${p.name} ${why === 'quiet' || why === 'gone' ? 'lost their connection' : 'left the game'}`);
    this.app.onOnlineChange?.();
  }

  dropped(id, why) {
    if (this.closed) return;
    if (this.host) {
      this.removePlayer(id, why);
      this.link.send({ t: 'leave', id, why });
      return;
    }
    // the host's gone, and the world with it
    this.app.lostHost(why === 'ended' ? 'The host ended the game.' : 'Lost the connection to the host.');
  }

  // ---- what comes in --------------------------------------------------------------------------

  receive(from, m) {
    if (!m || typeof m.t !== 'string' || this.closed) return;
    const H = this.host, g = this.game;
    // what the host passes on says whose it was
    const who = H ? from : (Number.isInteger(m.id) ? m.id : 0);
    switch (m.t) {
      case 'st':
        this.players.get(who)?.receive(m, performance.now());
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      case 'set': {
        const s = this.applySets(m.s);
        // everyone has it in the host's order, the one who made it too: where two players change
        // the same block at once, every machine ends up the same
        if (H && s.length) this.link.send({ t: 'set', s, id: from });
        break;
      }
      case 'en':
        if (who === this.myId) break;
        g.enemies.ghostsFrom(who, floats(m.d), performance.now());
        if (H) this.link.send({ t: 'en', d: m.d, id: from }, from);
        break;
      case 'hit':
        // one of someone else's dead, hit: to the machine that runs it
        if (H && m.o !== 0) { this.link.sendTo(m.o, { ...m, by: from }); break; }
        this.applyHit(m, H ? from : m.by);
        break;
      case 'killed': {
        if (H && m.to !== 0) { this.link.sendTo(m.to, m); break; }
        const p = v3(m.p);
        if (p) g.onKill({ pos: p });
        break;
      }
      case 'shot':
        this.remoteShot(who, m);
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      case 'arrow': {
        const f = v3(m.f), to = v3(m.to);
        if (f && to) g.enemies.shootArrow(f, to, true);
        if (H) this.link.send(m, from);
        break;
      }
      case 'look':
        this.players.get(who)?.setLook(cleanProfile(m.prof));
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      case 'clock':
        if (!H) this.clock(m);
        break;
      case 'join':
        if (!H && m.id !== this.myId) { this.addPlayer(m.id, m.name, m.prof); g.hud.message(`${cleanName(m.name)} joined the game`); }
        break;
      case 'leave':
        if (!H) this.removePlayer(m.id, m.why);
        break;
      case 'keep': {
        // a guest's things, kept with the world for when they come back
        const p = H && this.players.get(from);
        if (p && m.keep && typeof m.keep === 'object') g.guests[p.name] = m.keep;
        break;
      }
      case 'bye':
        this.link.lost(from, m.why || 'left');
        break;
      default:
    }
  }

  // Changes made elsewhere, made here; returns the ones that make sense (to pass on).
  applySets(s) {
    const g = this.game, w = g.world, out = [];
    if (!Array.isArray(s)) return out;
    for (let i = 0; i + 5 <= s.length; i += 5) {
      const x = s[i], y = s[i + 1], z = s[i + 2], id = s[i + 3], k = s[i + 4] | 0;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !Number.isInteger(id) || !BLOCKS[id]) continue;
      out.push(x, y, z, id, k);
      const was = w.getBlock(x, y, z);
      if (w.setBlock(x, y, z, id, true)) g.remoteBlockFx(x, y, z, was, id, k);
    }
    return out;
  }

  applyHit(m, by) {
    const e = this.game.enemies.list.find((x) => x.nid === m.e);
    if (!e || e.dead || !Number.isFinite(m.h) || !Number.isFinite(m.dmg)) return;
    if (!e.takeDamage(e.pos.y + m.h, { dmg: Math.min(m.dmg, 10), type: m.ty })) return;
    // their kill
    const msg = { t: 'killed', to: by, p: arr(e.pos) };
    if (this.host) this.link.sendTo(by, msg); else this.link.send(msg);
  }

  clock(m) {
    if (!Number.isFinite(m.time) || !Number.isInteger(m.day)) return;
    this.app.sky.setTime(m.time, m.day);
    if (this.game.grace && m.grace === false) this.game.endGrace();
  }

  remoteShot(who, m) {
    const g = this.game, P = this.players.get(who);
    if (!Array.isArray(m.e)) return;
    const from = P ? P.muzzle(new THREE.Vector3()) : v3(m.m);
    if (!from) return;
    for (let i = 0; i + 3 <= m.e.length && i < 3 * 12; i += 3) {
      const end = v3(m.e.slice(i, i + 3));
      if (end) g.tracers.add(from, end);
    }
    g.audio?.gunshot?.(m.g, null, from);
    g.sprites.emit('smoke', from.x, from.y, from.z, { color: 0x9a9a9a, size: 0.12, grow: 0.4, life: 0.7, alpha: 0.25, spread: 0.4 });
  }

  // ---- what goes out ----------------------------------------------------------------------------

  // a block changed here (kind: 0 a player's doing, 1 the dead digging)
  blockSet(x, y, z, id, kind) { this.sets.push(x, y, z, id, kind | 0); }

  shot(gun, muzzle, ends) {
    if (this.link.count) this.link.send({ t: 'shot', g: gun, m: arr(muzzle), e: ends.flatMap(arr) });
  }

  arrow(from, to) {
    if (this.link.count) this.link.send({ t: 'arrow', f: arr(from), to: arr(to) });
  }

  hitGhost(gh, y, weapon) {
    const m = { t: 'hit', o: gh.owner, e: gh.nid, h: y - gh.pos.y, dmg: weapon.dmg, ty: weapon.type };
    if (this.host) this.link.sendTo(gh.owner, { ...m, by: 0 }); else this.link.send(m);
  }

  sendLook() { this.link.send({ t: 'look', prof: cleanProfile(this.app.profile) }); }

  sendState() {
    const g = this.game, p = g.player, it = g.inventory.held, def = it ? ITEMS[it.id] : null, gun = def?.kind === 'gun';
    const f = (gun && g.ads ? SHOULDER : 0) | (gun && g.reloading > 0 ? RELOAD : 0) | (p.dead ? DEAD : 0) | (p.crouching ? CROUCH : 0) | (p.onGround ? GROUND : 0);
    this.link.send({ t: 'st', p: arr(p.pos), v: arr(p.vel), a: [p.yaw, p.pitch], h: it?.id ?? null, u: g.uses, f, rt: gun ? def.reload : 0 });
  }

  // what a guest has, for the host to keep
  keepData() {
    const g = this.game, p = g.player;
    return {
      inventory: g.inventory.serialize(),
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.dead ? 0 : p.health },
      maxDistance: g.maxDistance, stats: g.stats,
    };
  }

  keep() { if (!this.host && !this.closed) this.link.send({ t: 'keep', keep: this.keepData() }); }

  update(dt) {
    if (this.closed) return;
    const g = this.game, now = performance.now(), t = this.t;
    for (const p of this.players.values()) p.update(dt, now);
    if (this.sets.length) { this.link.send({ t: 'set', s: this.sets }); this.sets = []; }
    // a host on its own has no one to tell
    if (!this.link.count) return;
    if ((t.state -= dt) <= 0) { t.state = STATE_EVERY; this.sendState(); }
    if ((t.enemies -= dt) <= 0) { t.enemies = ENEMIES_EVERY; this.link.send({ t: 'en', d: enemySnapshot(g.enemies.list) }); }
    if (this.host && (t.clock -= dt) <= 0) {
      t.clock = CLOCK_EVERY;
      const s = this.app.sky;
      this.link.send({ t: 'clock', time: s.time, day: s.day, grace: g.grace });
    }
    if (!this.host && (t.keep -= dt) <= 0) { t.keep = KEEP_EVERY; this.keep(); }
  }

  // Leaving (a guest's things go to the host first) or, the host, ending it for everyone.
  // lost: the host has already gone, and there's no one to tell.
  close(lost = false) {
    if (this.closed) return;
    if (!lost) this.keep();
    this.closed = true;
    this.link.close(this.host ? 'ended' : 'left');
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
    this.game.enemies?.dropGhosts();
  }
}
