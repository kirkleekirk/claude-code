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

// (every machine builds the world from the seed itself, so a change to how it's built is a new
// version too: 6 is the original's world builder; 7, the alien ship)
export const PROTOCOL = 7;
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

// a dragon's waypoint, as sent (see Online.dragonWaypoint), or null
function waypoint(w) {
  if (!Array.isArray(w) || w.length !== 15 || !w.every(Number.isFinite)) return null;
  const action = w[10] === 1 || w[10] === 2 ? w[10] : 0;
  return {
    pos: w.slice(0, 3), vel: w.slice(3, 6), t: w[6], roll: w[7], anim: w[8] >= 0 && w[8] <= 3 ? w[8] | 0 : 0, sound: w[9] === 1 ? 1 : 0,
    action, at: action ? w.slice(11, 14) : null, index: w[14] | 0,
  };
}

// a dragon handed over (see Brain.migration), with only numbers where numbers go
function cleanMigration(m) {
  const out = { ...m };
  for (const k of ['time', 'nextUpdate', 'yaw', 'targetYaw', 'roll', 'targetRoll', 'pitch', 'targetPitch', 'velocity', 'targetVelocity', 'defaultHeading', 'fireballs']) {
    if (!Number.isFinite(out[k])) out[k] = 0;
  }
  for (const k of ['pos', 'target']) if (!Array.isArray(out[k]) || out[k].length !== 3 || !out[k].every(Number.isFinite)) return null;
  if (!Number.isInteger(out.type) || out.type < 0 || out.type > 4) return null;
  return out;
}

// distance along a ray to a player standing at pos (their box), or null
export function rayPlayer(o, d, max, pos) {
  let t0 = 0, t1 = max;
  const lo = [pos.x - 0.35, pos.y, pos.z - 0.35], hi = [pos.x + 0.35, pos.y + 1.8, pos.z + 0.35], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < lo[i] || oo[i] > hi[i]) return null; continue; }
    let a = (lo[i] - oo[i]) / dd[i], b = (hi[i] - oo[i]) / dd[i];
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
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
    // (the browser they play in, as this one knows it again: names needn't be different)
    const uid = typeof h.uid === 'string' && /^[a-z0-9]{12,32}$/.test(h.uid) ? h.uid : null;
    if (this.app.banned(uid, base)) return { refuse: 'The host has banned you from this game.' };
    // (the original: an Endurance game can't be joined once it's begun)
    if (g.begun) return { refuse: "That game of Endurance has already begun: friends can join one only until the host is 100 m out or into the second day." };
    const taken = new Set([this.myName, ...[...this.players.values()].map((p) => p.name)]);
    let name = base;
    for (let k = 2; taken.has(name); k++) name = `${base} ${k}`;
    const prof = cleanProfile(h.prof);
    const players = [{ id: 0, name: this.myName, prof: cleanProfile(this.app.profile) }, ...[...this.players.values()].map((p) => ({ id: p.id, name: p.name, prof: p.prof }))];
    this.link.send({ t: 'join', id, name, prof });
    this.addPlayer(id, name, prof);
    Object.assign(this.players.get(id), { uid, base });
    g.hud.message(`${name} joined the game`);
    this.app.audio?.ui?.('open');
    return {
      welcome: {
        v: PROTOCOL, name, seed: g.seed, builder: g.world.builder, mode: g.mode, time: sky.time, day: sky.day, grace: g.grace,
        edits: g.world.serializeEdits(), crates: g.crates.serialize(), players, you: (uid && g.guests[`u:${uid}`]) || g.guests[name] || null,
        dragon: g.dragons?.welcomeInfo() ?? null,
        ufo: g.mothership?.welcomeInfo() ?? null,
        difficulty: g.difficulty, creative: g.creative, pvp: g.pvp,
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
    this.game.crates?.setFocus(id, null);
    if (why !== 'kicked') this.game.hud.message(`${p.name} ${why === 'quiet' || why === 'gone' ? 'lost their connection' : 'left the game'}`);
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
      case 'gren': {
        // someone's grenade, thrown: it flies here too (it hurts only on their machine)
        const p = v3(m.p), d = v3(m.d);
        if (p && d && Number.isFinite(m.f)) g.projectiles.grenade(p, d.normalize(), Math.min(5, m.f), false);
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      }
      case 'fuse': {
        // a fuse someone lit: it flashes here too
        const b = m.b;
        if (Array.isArray(b) && b.length === 3 && b.every(Number.isInteger)) g.explosives.flash(b[0], b[1], b[2]);
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      }
      case 'boom': {
        // an explosion someone set off: the bang, and this player's and this machine's dead's
        // share of it (the blocks it takes come as changes)
        const c = v3(m.c), k = m.k;
        if (c && Number.isInteger(k) && k >= 0 && k <= 4) {
          if (k <= 1) g.explosives.detonate(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), k, !!m.o, false, who);
          else g.explosives.blast(c, k, typeof m.i === 'string' ? m.i : null, false, who, k === 2 && m.dr === 1);
        }
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      }
      case 'crate': {
        // a crate's slot changed: everyone's the same, in the host's order
        const b = m.b;
        if (Array.isArray(b) && b.length === 3 && b.every(Number.isInteger)) {
          g.crates.receive(b[0], b[1], b[2], m.i, m.s);
          if (H) this.link.send({ ...m, id: from }, from);
        }
        break;
      }
      case 'cf': {
        // where someone is in a crate (null: out of it)
        const b = Array.isArray(m.b) && m.b.length === 3 && m.b.every(Number.isInteger) ? m.b : null;
        g.crates.setFocus(who, b, m.i | 0);
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      }
      case 'say':
        if (typeof m.s === 'string') g.hud.message(m.s.slice(0, 80));
        if (H) this.link.send({ ...m, id: from }, from);
        break;
      case 'arrow': {
        const f = v3(m.f), to = v3(m.to);
        if (f && to) g.enemies.shootArrow(f, to, true);
        if (H) this.link.send(m, from);
        break;
      }
      // the dragon (see ../game/dragons.js): asked for (to the host), started (from it), where
      // it is (from whichever machine flies it), killed, gone, a fireball gone off, and handed
      // to the machine of the one it's after
      case 'dreq':
        if (H && Number.isInteger(m.k)) g.dragons?.handleRequest(from, m.k, !!m.b);
        break;
      case 'dsp':
        if (!H && Number.isInteger(m.s) && Number.isInteger(m.k)) g.dragons?.handleSpawn(m.s, m.k, !!m.b, Number.isFinite(m.h) ? m.h : -1);
        break;
      case 'dwp': {
        const wp = waypoint(m.w);
        if (wp) g.dragons?.receiveWaypoint(wp);
        if (H) this.link.send(m, from);
        break;
      }
      case 'dkl':
        if (Number.isInteger(m.k)) g.dragons?.handleKill(m.k);
        if (H) this.link.send(m, from);
        break;
      case 'drm':
        g.dragons?.removeDragonEntity();
        if (H) this.link.send(m, from);
        break;
      case 'dfb': {
        const p = v3(m.p);
        if (p && Number.isInteger(m.k) && m.k >= 0 && m.k <= 4) g.dragons?.handleFireball(p, m.i, m.k);
        if (H) this.link.send(m, from);
        break;
      }
      case 'dmg':
        if (H && m.to !== this.myId) { this.link.sendTo(m.to, m); break; }
        if (m.info && typeof m.info === 'object') g.dragons?.handleMigrate(cleanMigration(m.info));
        break;
      // the alien ship (see game/mothership.js): come (the host's word), how long it's been
      // here (the host's), a drone given way (anyone's, passed on), a hit on its nodes or core
      // (to the host), their health (the host's), and how it ended (the host's)
      case 'us':
        if (!H && Number.isInteger(m.s) && Array.isArray(m.h) && m.h.length === 2 && m.h.every(Number.isInteger)) g.mothership?.handleStart(m.s, m.h[0], m.h[1], Number.isFinite(m.a) ? m.a : null);
        break;
      case 'ut':
        if (!H && Number.isFinite(m.e) && m.e >= 0) g.mothership?.handleTime(m.e);
        break;
      case 'ud':
        if (Number.isInteger(m.i) && m.i >= 0 && m.i < 8) g.mothership?.handleDrone(m.i);
        if (H) this.link.send(m, from);
        break;
      case 'uh':
        if (H && Number.isInteger(m.k) && m.k >= 0 && m.k <= 4 && Number.isFinite(m.d) && m.d > 0) g.mothership?.handleHit(m.k, Math.min(m.d, 300));
        break;
      case 'ux':
        if (!H && Array.isArray(m.n) && m.n.length === 4 && m.n.every(Number.isFinite) && Number.isFinite(m.c)) g.mothership?.handleState(m.n, m.c);
        break;
      case 'ue':
        if (!H && (m.w === 'gone' || m.w === 'down')) g.mothership?.handleEnd(m.w);
        break;
      // the host's: everyone starts the game over; PVP on or off; you're out
      case 'restart':
        if (!H) g.restartLevel();
        break;
      case 'pvp':
        if (!H) g.pvp = m.v ? 1 : 0;
        break;
      case 'kick':
        if (!H) this.app.kicked(!!m.ban);
        break;
      // a swing at a player, PVP: to the machine of the one swung at
      case 'mp': {
        if (H && m.to !== this.myId) { this.link.sendTo(m.to, { ...m, by: from }); break; }
        const at = v3(m.p);
        if (at && g.pvp) g.meleeHit(m.w, at);
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
        if (p && m.keep && typeof m.keep === 'object') {
          if (p.uid) { g.guests[`u:${p.uid}`] = m.keep; delete g.guests[p.name]; } else g.guests[p.name] = m.keep;
        }
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
    // (no more than the hardest-hitting thing there is: a rocket)
    if (!e.takeDamage(e.pos.y + m.h, { dmg: Math.min(m.dmg, 100), type: m.ty })) return;
    // their kill
    const msg = { t: 'killed', to: by, p: arr(e.pos) };
    if (this.host) this.link.sendTo(by, msg); else this.link.send(msg);
  }

  clock(m) {
    if (!Number.isFinite(m.time) || !Number.isInteger(m.day)) return;
    this.app.sky.setTime(m.time, m.day);
    if (this.game.grace && m.grace === false) this.game.endGrace();
  }

  // Someone's shot: it flies here as it does there, from where they are (only theirs hurts).
  remoteShot(who, m) {
    const g = this.game, P = this.players.get(who), it = ITEMS[m.g];
    if (!it || it.kind !== 'gun' || !Array.isArray(m.d)) return;
    const eye = v3(m.o);
    if (!eye) return;
    const from = (P && P.muzzle(new THREE.Vector3())) || v3(m.m) || eye;
    const dirs = [];
    for (let i = 0; i + 3 <= m.d.length && dirs.length < 12; i += 3) {
      const d = v3(m.d.slice(i, i + 3));
      if (d && d.lengthSq() > 0.25) dirs.push(d.normalize());
    }
    g.fire(it, eye, from, dirs, false, who);
    g.audio?.gunshot?.(it, from);
    if (!it.laser) g.sprites.emit('smoke', from.x, from.y, from.z, { color: 0x9a9a9a, size: 0.12, grow: 0.4, life: 0.7, alpha: 0.25, spread: 0.4 });
  }

  // ---- what goes out ----------------------------------------------------------------------------

  // a block changed here (kind: 0 a player's doing, 1 the dead digging)
  blockSet(x, y, z, id, kind) { this.sets.push(x, y, z, id, kind | 0); }

  // id: the gun's item; eye, where it was fired from; muzzle, its tip; dirs, each shot's way
  shot(id, eye, muzzle, dirs) {
    if (this.link.count) this.link.send({ t: 'shot', g: id, o: arr(eye), m: arr(muzzle), d: dirs.flatMap(arr) });
  }

  grenade(at, dir, fuse) { if (this.link.count) this.link.send({ t: 'gren', p: arr(at), d: arr(dir), f: fuse }); }

  fuse(x, y, z) { if (this.link.count) this.link.send({ t: 'fuse', b: [x, y, z] }); }

  // an explosion here (original: the first of a chain; item: what set it off)
  boom(c, type, original, item, dragon = false) { if (this.link.count) this.link.send({ t: 'boom', c: arr(c), k: type, o: original ? 1 : 0, i: item ?? null, dr: dragon ? 1 : 0 }); }

  // one of this machine's dead killed by someone else's explosion: the kill's theirs
  killedFor(to, pos) {
    const msg = { t: 'killed', to, p: arr(pos) };
    if (this.host) this.link.sendTo(to, msg); else this.link.send(msg);
  }

  crateSlot(c, i, s) { if (this.link.count) this.link.send({ t: 'crate', b: [c.x, c.y, c.z], i, s }); }

  crateFocus(c, i) { if (this.link.count) this.link.send({ t: 'cf', b: c ? [c.x, c.y, c.z] : null, i }); }

  // a line for everyone (the original's BroadcastTextMessage)
  say(text) { if (this.link.count) this.link.send({ t: 'say', s: String(text).slice(0, 80) }); }

  // the host: start the game over for everyone; PVP on or off
  restart() { if (this.host && this.link.count) this.link.send({ t: 'restart' }); }

  sendPvp(v) { if (this.host && this.link.count) this.link.send({ t: 'pvp', v }); }

  // the host: put a player out of the game (ban: and keep them out)
  kick(id, ban = false) {
    const p = this.players.get(id);
    if (!this.host || !p) return;
    const line = `${p.name} has been ${ban ? 'banned' : 'kicked'} by the host`;
    this.say(line);
    this.game.hud.message(line);
    if (ban) this.app.ban(p.uid, p.base ?? p.name);
    // (a moment for the word to go, then drop them: that connection, if they haven't gone already
    // and someone else come in their place)
    const conn = this.link.peers.get(id)?.conn;
    this.link.sendTo(id, { t: 'kick', ban: ban ? 1 : 0 });
    setTimeout(() => this.link.lost(id, 'kicked', conn), 400);
  }

  // PVP: a swing that hit another player (w: what it was), from at
  meleePlayer(to, w, at) {
    const m = { t: 'mp', to, w: w ?? null, p: arr(at) };
    if (this.host) this.link.sendTo(to, { ...m, by: 0 }); else this.link.send(m);
  }

  // the first other player along a ray (PVP): { id, dist } or null
  playerOnRay(o, d, max) {
    let best = null;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const t = rayPlayer(o, d, max, p.pos);
      if (t != null && (!best || t < best.dist)) best = { id: p.id, dist: t };
    }
    return best;
  }

  // the dragon's messages (the host's to everyone; a guest's to the host, who passes them on)
  dragonRequest(type, forBiome) { this.link.send({ t: 'dreq', k: type, b: forBiome ? 1 : 0 }); }

  dragonSpawn(spawner, type, forBiome, health) { if (this.link.count) this.link.send({ t: 'dsp', s: spawner, k: type, b: forBiome ? 1 : 0, h: health }); }

  dragonWaypoint(w) {
    if (!this.link.count) return;
    this.link.send({ t: 'dwp', w: [...w.pos, ...w.vel, w.t, w.roll, w.anim, w.sound, w.action, ...(w.at || [0, 0, 0]), w.index] });
  }

  dragonKill(at, killer, weapon) { if (this.link.count) this.link.send({ t: 'dkl', p: arr(at), k: killer, w: weapon ?? null }); }

  dragonRemove() { if (this.link.count) this.link.send({ t: 'drm' }); }

  dragonFireball(at, index, type) { if (this.link.count) this.link.send({ t: 'dfb', p: arr(at), i: index, k: type }); }

  dragonMigrate(to, info) {
    const m = { t: 'dmg', to, info };
    if (this.host) this.link.sendTo(to, m); else this.link.send(m);
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
      // (up in the alien ship or on its light: kept on the ground under it, as the ship isn't)
      player: { ...((({ x, y, z }) => ({ x, y, z }))(g.mothership?.safeSpot() ?? p.pos)), yaw: p.yaw, pitch: p.pitch, health: p.dead ? 0 : p.health },
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
