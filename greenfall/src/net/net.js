// In-match multiplayer sync.
//
// The host's game is the authority for the shared world: zombies, hordes, AI survivors, the
// riverboat and helicopter, airdrops. Every player's own game moves their own survivor and
// reports what it does. World changes (loot taken or dropped, doors, barricades, searched
// containers, brick walls, vehicles) are broadcast by whoever makes them. Building loot is
// rolled from the match seed, so everyone generates the same items without sending them.
import { Puppet, FLAGS } from './puppet.js';
import { WEAPONS } from '../data/items.js';

const STATE_HZ = 15, ENTS_HZ = 10, META_HZ = 1;
const BOT_BASE = 10000;
const ZSTATES = ['idle', 'wander', 'chase', 'attack', 'dead', 'smash', 'vault', 'flee', 'investigate'];

export class Net {
  constructor(G, link, cfg) {
    this.G = G;
    this.link = link;
    this.role = cfg.role;            // 'host' | 'client'
    this.me = cfg.me;                // my relay id
    this.hostId = cfg.hostId;
    this.roster = new Map(cfg.roster.map((r) => [r.id, r]));
    this.botInfo = new Map((cfg.bots || []).map((b) => [b.id, b]));
    this.puppets = new Map();        // netId → Puppet
    this.taken = new Set();          // item ids picked up anywhere
    this.searched = new Set();       // `${building}:${container}`
    this.doorState = new Map();      // `${building}:${door}` → {o, s, br}
    this.boardState = new Map();     // `${building}:${d|w}${i}` → on
    this.applying = false;           // true while applying a remote event (don't rebroadcast)
    this.seq = 0;
    this.tState = 0; this.tEnts = 0; this.tMeta = 0; this.tStep = 0;
    this.zmap = new Map();           // client: zombie netId → zombie
    this.knownZ = new Map();         // host: peer → Set of zombie ids last sent
    this.alive = 0; this.total = 0;
    link.on('msg', (from, d) => this.onMsg(from, d));
    link.on('gone', (m) => this.onGone(m.id));
    link.on('closed', (m) => this.onClosed(m.reason));
    link.on('close', () => this.onClosed('Lost connection to the server'));
  }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }
  newId(prefix = 'N') { return `${prefix}${this.me}.${++this.seq}`; }
  send(to, d) { this.link.to(to, d); }
  all(d) { this.link.to('all', d); }
  netIdOf(s) {
    if (!s) return null;
    if (s === this.G.player) return this.me;
    if (s.isPuppet) return s.netId;
    if (s.isBot) return BOT_BASE + s.id;
    return null;
  }
  byNetId(id) {
    if (id === this.me) return this.G.player;
    if (this.puppets.has(id)) return this.puppets.get(id);
    if (this.isHost && id >= BOT_BASE) return this.G.bots.bots.find((b) => BOT_BASE + b.id === id) || null;
    return null;
  }

  // ---------------- setup ----------------
  // create puppets for the other humans in the match
  spawnHumans() {
    for (const r of this.roster.values()) if (r.id !== this.me && !this.puppets.has(r.id)) this.addPuppet({ ...r, kind: 'h' });
  }
  addPuppet(info) {
    const p = new Puppet(this.G, info);
    if (info.x !== undefined) { p.pos.set(info.x, this.G.physics.groundAt(info.x, info.z, 999, 0.4), info.z); p.target.copy(p.pos); p.seen = true; }
    this.puppets.set(info.id, p);
    this.G.survivors.push(p);
    return p;
  }
  removePuppet(id) {
    const p = this.puppets.get(id);
    if (!p) return;
    this.puppets.delete(id);
    if (p.character) this.G.scene.remove(p.character.root);
    const i = this.G.survivors.indexOf(p);
    if (i >= 0) this.G.survivors.splice(i, 1);
  }

  // ---------------- per frame ----------------
  update(dt) {
    const G = this.G;
    for (const p of this.puppets.values()) p.update(dt);
    this.tState -= dt; this.tEnts -= dt; this.tMeta -= dt; this.tStep -= dt;
    if (this.isClient && this.tState <= 0) { this.tState = 1 / STATE_HZ; this.send(this.hostId, { k: 'st', s: this.stateOf(G.player) }); }
    if (this.isHost) {
      if (this.tEnts <= 0) { this.tEnts = 1 / ENTS_HZ; this.sendEnts(); }
      if (this.tMeta <= 0) { this.tMeta = 1 / META_HZ; this.all({ k: 'meta', m: this.metaOf() }); }
      // other players' footsteps and engines wake the dead on the host
      if (this.tStep <= 0) {
        this.tStep = 0.7;
        for (const p of this.puppets.values()) {
          if (!p.alive || p.extracted) continue;
          const sp = Math.hypot(p.vel.x, p.vel.z);
          if (p.vehId != null) G.emitNoise(p.pos.x, p.pos.z, 60, p, 'engine');
          else if (sp > 1) G.emitNoise(p.pos.x, p.pos.z, p.sprinting ? 16 : p.crouch ? 3 : 7, p, 'step');
        }
      }
    } else {
      // client: drop AI survivors we haven't heard about in a while (out of range)
      for (const [id, p] of this.puppets) if (p.kind === 'b' && G.time - p.lastSeen > 4 && p.alive) this.removePuppet(id);
    }
  }
  stateOf(s) {
    const slot = s.activeSlot?.();
    const def = slot && WEAPONS[slot.id];
    const mods = slot?.mods ? Object.entries(slot.mods).map(([k, v]) => `${k}:${v}`).join(',') : '';
    const f = (s.crouch ? FLAGS.crouch : 0) | (s.sprinting ? FLAGS.sprint : 0) | (s.ads ? FLAGS.ads : 0) | (s.onGround ? FLAGS.ground : 0) | (!s.alive ? FLAGS.dead : 0) | (s.extracted ? FLAGS.extracted : 0) | (s.swimming ? FLAGS.swim : 0);
    const v = s.vehicle;
    return {
      p: [+s.pos.x.toFixed(2), +s.pos.y.toFixed(2), +s.pos.z.toFixed(2)], y: +s.yaw.toFixed(3), v: [+s.vel.x.toFixed(1), +s.vel.z.toFixed(1)], f,
      w: def ? def.model : (s.activeDef?.()?.type === 'throw' ? s.activeDef().model : ''), wr: slot?.r | 0, wm: mods, a: s.mode === 'drive' ? 'ride' : s.swimming ? 'swim' : 'ground',
      h: Math.round(s.health), ar: Math.round(s.armor), ap: +(s.lookPitch || s.camPitch || 0).toFixed(2),
      veh: v ? { id: v.id, x: +v.pos.x.toFixed(2), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(2), yaw: +v.yaw.toFixed(3), pitch: +v.pitch.toFixed(3), lean: +v.lean.toFixed(3), sp: +v.speed.toFixed(2), fuel: +v.fuel.toFixed(3), hp: +v.hp.toFixed(3) } : null,
    };
  }
  // host → each player: survivors and zombies around them
  sendEnts() {
    const G = this.G;
    const humans = [[this.me, G.player], ...[...this.puppets.entries()]];
    const bots = G.bots.bots.filter((b) => b.physical && (b.alive || G.time - (b.diedAt || 0) < 10));
    for (const [peerId, peer] of this.puppets) {
      if (peer.kind !== 'h') continue;
      const c = peer.pos, ents = [];
      for (const [id, s] of humans) if (id !== peerId) ents.push([id, 'h', this.stateOf(s)]);
      for (const b of bots) if (Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 320) ents.push([BOT_BASE + b.id, 'b', this.stateOf(b)]);
      const zs = [];
      for (const zb of G.zombies.list) {
        if (Math.abs(zb.pos.x - c.x) > 150 || Math.abs(zb.pos.z - c.z) > 150) continue;
        zs.push([zb.nid, +zb.pos.x.toFixed(2), +zb.pos.y.toFixed(2), +zb.pos.z.toFixed(2), +zb.yaw.toFixed(2), ZSTATES.indexOf(zb.state), zb.type[0], +(zb.hp / zb.maxHp).toFixed(2), +zb.rise.toFixed(2), +zb.scale.toFixed(2)]);
      }
      this.send(peerId, { k: 'ents', t: +G.time.toFixed(2), e: ents, z: zs });
    }
  }
  metaOf() {
    const G = this.G, M = G.match;
    return {
      el: +M.elapsed.toFixed(1), al: M.aliveCount, tot: M.totalPlayers,
      hd: G.hordes.list.map((h) => [h.id, Math.round(h.x), Math.round(h.z), +h.r.toFixed(1), Math.round(h.tx), Math.round(h.tz), +h.migrating.toFixed(1), +h.intensity.toFixed(2)]),
      bs: M.boatState, bt: +(M.boatT || 0).toFixed(1), dk: M.dock?.id || null, seats: M.boatSeats,
      hs: M.heliState, ht: +(M.heliT || 0).toFixed(1), lz: M.lz?.name || null,
    };
  }

  // ---------------- messages ----------------
  onMsg(from, d) {
    if (!d || typeof d !== 'object') return;
    const G = this.G;
    if (!G.inMatch) return;
    this.applying = true;
    try {
      switch (d.k) {
        case 'st': { const p = this.puppets.get(from); if (p && this.isHost) p.apply(d.s, G.time); break; }
        case 'ents': this.onEnts(d); break;
        case 'meta': if (this.isClient) this.onMeta(d.m); break;
        case 'shot': this.onShot(from, d); break;
        case 'act': { const p = this.byNetId(d.id ?? from); if (p && p !== G.player) p.character?.playAction(d.a, d.d || 0.4); break; }
        case 'hit': if (this.isHost) this.onHit(from, d); break;
        case 'hurt': this.onHurt(d); break;
        case 'zhit': if (this.isHost) this.onZHit(from, d); break;
        case 'zkill': G.player.stats.zombieKills++; G.hud.zombieKill(d.head); break;
        case 'gotkill': G.player.stats.kills++; G.hud.announce(`ELIMINATED ${String(d.v).toUpperCase()}`, 'yellow', 2); G.audio?.play('kill', null, { vol: 0.6, bus: 'ui' }); break;
        case 'died': if (this.isHost) this.onPeerDied(from, d); break;
        case 'kill': G.hud.killfeedSystem(d.text); break;
        case 'board': if (this.isHost) this.onBoardReq(from, d); break;
        case 'boarded': if (G.player.alive && !G.player.extracted) { G.match.extractPlayer(d.how, !!d.auto); } break;
        case 'airdrop': if (this.isClient) G.match.spawnAirdrop(d); break;
        case 'boom': G.fx.explosion(d.x, d.y, d.z, d.r); G.audio?.play('explosion', { x: d.x, y: d.y, z: d.z }, { vol: 1 }); if (this.isHost) G.emitNoise(d.x, d.z, 300, this.byNetId(from), 'explosion', true); break;
        // ---- world ----
        case 'take': this.onTake(d.n); break;
        case 'qty': { const it = G.inter.items.find((x) => x.nid === d.n); if (it) it.n = d.q; break; }
        case 'drop': if (!G.inter.items.some((x) => x.nid === d.it.nid)) G.inter.addWorldItem(d.it, d.it.x, d.it.y, d.it.z); break;
        case 'door': this.onDoor(d); break;
        case 'brd': this.onBoard(d); break;
        case 'srch': this.onSearched(d); break;
        case 'crate': { const c = G.inter.crates.find((x) => x.nid === d.n); if (c && !c.opened) { c.opened = true; if (c.mesh) { G.inter.itemGroup.remove(c.mesh); c.mesh = null; G.inter.makeCrateMesh(c); } } break; }
        case 'build': G.builds.placeNet(d.p); if (this.isHost) G.emitNoise(d.p.x, d.p.z, 35, this.byNetId(from), 'build'); break;
        case 'unbuild': { const pc = G.builds.pieces.get(d.key); if (pc) G.builds.destroy(pc); break; }
        default: break;
      }
    } finally { this.applying = false; }
  }
  onEnts(d) {
    const G = this.G;
    const seen = new Set();
    for (const [id, kind, s] of d.e) {
      seen.add(id);
      let p = this.puppets.get(id);
      if (!p) {
        if (kind === 'h') { const r = this.roster.get(id); if (!r) continue; p = this.addPuppet({ ...r, kind: 'h' }); }
        else { const b = this.botInfo.get(id); if (!b || (s.f & FLAGS.dead)) continue; p = this.addPuppet({ ...b, kind: 'b' }); }
      }
      p.apply(s, G.time);
    }
    // zombies: mirror the host's
    const Z = G.zombies;
    const now = G.time;
    for (const z of d.z) {
      const [nid, x, y, zz, yaw, st, ty, hp, rise, sc] = z;
      let zb = this.zmap.get(nid);
      if (!zb) { zb = Z.spawnNet(nid, x, y, zz, ty, sc); if (!zb) continue; this.zmap.set(nid, zb); }
      zb.netPos.set(x, y, zz); zb.netYaw = yaw; zb.netSeen = now;
      const state = ZSTATES[st] || 'wander';
      if (state === 'dead' && zb.state !== 'dead') { zb.state = 'dead'; zb.dieT = 0; G.audio?.play('zombie_die', zb.pos, { vol: 0.6 }); }
      else if (state !== 'dead') zb.state = state;
      zb.hp = hp * zb.maxHp; zb.rise = rise;
    }
    for (const [nid, zb] of this.zmap) if (now - zb.netSeen > 1.5 && zb.state !== 'dead') { Z.release(zb); this.zmap.delete(nid); }
  }
  onMeta(m) {
    const G = this.G, M = G.match;
    if (Math.abs(M.elapsed - m.el) > 2) M.elapsed = m.el; else M.elapsed += (m.el - M.elapsed) * 0.3;
    this.alive = m.al; this.total = m.tot;
    // hordes
    const H = G.hordes, ids = new Set();
    for (const [id, x, z, r, tx, tz, mig, inten] of m.hd) {
      ids.add(id);
      let h = H.list.find((q) => q.netId === id);
      if (!h) { h = H.create(x, z, r, inten); h.netId = id; }
      h.x = x; h.z = z; h.r = r; h.tx = tx; h.tz = tz; h.migrating = mig; h.intensity = inten;
      H.syncMesh(h);
    }
    for (const h of [...H.list]) if (!ids.has(h.netId)) H.remove(h);
    M.netSync(m);
  }
  onShot(from, d) {
    const G = this.G;
    const s = this.byNetId(d.id ?? from);
    const [ox, oy, oz] = d.o;
    G.fx.muzzle(ox, oy, oz, d.dir[0], d.dir[1], d.dir[2], d.sup);
    for (const e of d.e || []) if (!d.sup || Math.random() < 0.3) G.fx.tracer(ox, oy, oz, e[0], e[1], e[2], 0xffc070);
    G.audio?.play('shot_' + d.snd, { x: ox, y: oy, z: oz }, { vol: 1 });
    if (s && s !== G.player) s.character?.playAction('recoil', 0.18);
    if (this.isHost && s) G.emitNoise(ox, oz, d.n, s, 'gunshot');
  }
  // a player's game says its bullet/blade hit someone
  onHit(from, d) {
    const G = this.G;
    const shooter = this.byNetId(from);
    const target = this.byNetId(d.id);
    if (!target || !target.alive) return;
    const opts = { type: d.type || 'bullet', head: !!d.head, weapon: d.w };
    if (target === G.player) { G.player.takeDamage(d.dmg, shooter, opts); if (shooter) G.hud.damageFrom(shooter.pos); }
    else if (target.isPuppet) this.send(target.netId, { k: 'hurt', dmg: d.dmg, from, type: opts.type, head: opts.head, w: d.w });
    else { target.takeDamage(d.dmg, shooter, opts); target.onShotBy?.(shooter); }
  }
  onHurt(d) {
    const G = this.G, P = G.player;
    const src = d.from != null ? this.byNetId(d.from) : null;
    P.takeDamage(d.dmg, src, { type: d.type, head: d.head, weapon: d.w, heavy: d.heavy, infect: d.infect });
    if (src) G.hud.damageFrom(src.pos);
    else if (d.zx != null) G.hud.damageFrom({ x: d.zx, z: d.zz });
    if (d.type === 'zombie') { G.audio?.play('zombie_hit', P.pos, { vol: 0.9 }); G.player.shake(d.heavy ? 0.6 : 0.25); if (d.kb) { P.vel.x += d.kb[0]; P.vel.z += d.kb[1]; P.vel.y = 4; } }
  }
  onZHit(from, d) {
    const zb = this.G.zombies.list.find((z) => z.nid === d.n);
    if (zb) this.G.zombies.damage(zb, d.dmg, this.byNetId(from), { head: d.head, melee: d.melee, dir: d.dir, noHeadBonus: true });
  }
  onPeerDied(from, d) {
    const p = this.puppets.get(from);
    if (!p || !p.alive) return;
    p.health = 0;
    p.die(this.byNetId(d.by), { type: d.type || 'net' });
  }
  onBoardReq(from, d) {
    const G = this.G, M = G.match, p = this.puppets.get(from);
    if (!p || !p.alive || p.extracted) return;
    const how = M.checkBoarding(p);
    if (how !== d.how) return;
    M.board(p, how);
    this.send(from, { k: 'boarded', how });
  }
  onTake(n) {
    this.taken.add(n);
    const G = this.G;
    const it = G.inter.items.find((x) => x.nid === n);
    if (it) G.inter.removeWorldItem(it);
  }
  doorRef(d) {
    const b = this.G.world.buildings[d.building];
    return { b, i: b?.rt ? b.rt.doors.indexOf(d) : -1 };
  }
  onDoor(m) {
    this.doorState.set(`${m.b}:${m.i}`, m);
    const b = this.G.world.buildings[m.b], d = b?.rt?.doors[m.i];
    if (d) this.G.inter.applyDoorState(d, m);
  }
  onBoard(m) {
    this.boardState.set(`${m.b}:${m.w ? 'w' : 'd'}${m.i}`, m.on);
    const b = this.G.world.buildings[m.b];
    const rec = b?.rt ? (m.w ? b.rt.windows[m.i] : b.rt.doors[m.i]) : null;
    if (rec) this.G.inter.applyBoardState(rec, m.on);
  }
  onSearched(m) {
    this.searched.add(`${m.b}:${m.i}`);
    const c = this.G.world.buildings[m.b]?.rt?.containers[m.i];
    if (c) c.searched = true;
  }
  // when a building streams in on this machine, catch it up with what already happened
  catchUpBuilding(b) {
    const rt = b.rt;
    if (!rt) return;
    rt.containers.forEach((c, i) => { if (this.searched.has(`${b.id}:${i}`)) c.searched = true; });
    rt.doors.forEach((d, i) => {
      const m = this.doorState.get(`${b.id}:${i}`);
      if (m) this.G.inter.applyDoorState(d, m, true);
      const on = this.boardState.get(`${b.id}:d${i}`);
      if (on !== undefined) this.G.inter.applyBoardState(d, on, true);
    });
    rt.windows.forEach((w, i) => { const on = this.boardState.get(`${b.id}:w${i}`); if (on !== undefined) this.G.inter.applyBoardState(w, on, true); });
  }
  onGone(id) {
    const p = this.puppets.get(id);
    if (!p) return;
    const r = this.roster.get(id);
    this.G.hud.killfeedSystem(`${r?.name || 'A player'} left the match`);
    if (this.isHost && p.alive) { p.health = 0; p.die(null, { type: 'left' }); }
    this.removePuppet(id);
  }
  onClosed(reason) {
    if (this.closed) return;
    this.closed = true;
    const G = this.G;
    if (!G.inMatch || G.net !== this) return;
    G.hud.announce(reason.toUpperCase(), 'red', 6);
    if (this.isClient && G.match && !G.match.result) setTimeout(() => { if (!G.match.result) G.match.finish('left'); }, 2500);
  }

  // ---------------- local actions → network ----------------
  onLocalShot(s, muzzle, dir, ends, st) {
    if (this.applying) return;
    if (s !== this.G.player && !(this.isHost && s.isBot)) return;
    this.all({ k: 'shot', id: this.netIdOf(s), o: [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)], dir: [+dir[0].toFixed(3), +dir[1].toFixed(3), +dir[2].toFixed(3)], e: ends.slice(0, 4).map((e) => e.map((v) => +v.toFixed(1))), snd: st.sound, sup: st.suppressed, n: Math.round(st.noise) });
  }
  onLocalAct(s, a, dur) {
    if (this.applying) return;
    if (s !== this.G.player && !(this.isHost && s.isBot)) return;
    this.all({ k: 'act', id: this.netIdOf(s), a, d: dur });
  }
  // damage dealt on this machine to a survivor someone else is in charge of
  reportHit(target, dmg, src, opts) {
    const G = this.G;
    if (this.isHost) {
      // a player on another machine got hurt by something the host runs (zombies, AI, the host)
      const m = { k: 'hurt', dmg: Math.round(dmg), from: this.netIdOf(src), type: opts.type, head: !!opts.head, w: opts.weapon, heavy: !!opts.heavy, infect: opts.infect };
      if (opts.type === 'zombie' && opts.zpos) { m.zx = opts.zpos.x; m.zz = opts.zpos.z; }
      if (opts.kb) m.kb = opts.kb;
      this.send(target.netId, m);
    } else if (src === G.player || !src) {
      this.send(this.hostId, { k: 'hit', id: target.netId, dmg: Math.round(dmg), head: !!opts.head, w: opts.weapon, type: opts.type });
    }
  }
  onZombieHit(zb, dmg, src, opts) {
    if (src && src !== this.G.player) return;
    this.send(this.hostId, { k: 'zhit', n: zb.nid, dmg: Math.round(dmg), head: !!opts.head, melee: !!opts.melee, dir: opts.dir });
  }
  onZombieKilled(zb, src, opts) {
    if (this.isHost && src?.isPuppet && src.kind === 'h') this.send(src.netId, { k: 'zkill', head: !!opts.head });
  }
  onDeath(s, src, opts) {
    const G = this.G;
    const killer = src && src !== s ? src.name : opts?.type === 'zombie' ? 'the dead' : null;
    if (s === G.player && this.isClient) this.send(this.hostId, { k: 'died', by: this.netIdOf(src), type: opts?.type });
    if (this.isHost && opts?.type !== 'net') this.all({ k: 'kill', text: killer ? `${killer} eliminated ${s.name}` : `${s.name} died` });
    if (this.isHost && src?.isPuppet && src.kind === 'h' && src !== s) this.send(src.netId, { k: 'gotkill', v: s.name });
    if (this.isHost && s.isBot) s.diedAt = G.time;
  }
  requestBoard(how) { this.send(this.hostId, { k: 'board', how }); }
  onLocalAirdrop(a) { if (this.isHost) this.all({ k: 'airdrop', x: a.x, z: a.z, n: a.nid }); }
  onExplosion(x, y, z, r) { if (!this.applying) this.all({ k: 'boom', x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), r }); }
  onTakeItem(rec) { if (!this.applying && rec.nid) { this.taken.add(rec.nid); this.all({ k: 'take', n: rec.nid }); } }
  onItemQty(rec) { if (!this.applying && rec.nid) this.all({ k: 'qty', n: rec.nid, q: rec.n }); }
  onDropItem(rec) {
    if (this.applying) return;
    const { mesh, model, _st, _k, ...it } = rec; void mesh; void model; void _st; void _k;
    this.all({ k: 'drop', it });
  }
  onDoorChange(d) {
    if (this.applying) return;
    const { b, i } = this.doorRef(d);
    if (i < 0) return;
    const m = { b: b.id, i, o: d.open, s: d.swing || 1, br: d.broken ? 1 : 0 };
    this.doorState.set(`${b.id}:${i}`, m);
    this.all({ k: 'door', ...m });
  }
  onBoardChange(rec) {
    if (this.applying) return;
    const b = this.G.world.buildings[rec.building];
    if (!b?.rt) return;
    const w = rec.kind !== 'door';
    const i = w ? b.rt.windows.indexOf(rec) : b.rt.doors.indexOf(rec);
    if (i < 0) return;
    const on = rec.boarded > 0 ? 1 : 0;
    this.boardState.set(`${b.id}:${w ? 'w' : 'd'}${i}`, on);
    this.all({ k: 'brd', b: b.id, w: w ? 1 : 0, i, on });
  }
  onSearch(c) {
    if (this.applying) return;
    const b = this.G.world.buildings[c.building];
    const i = b?.rt ? b.rt.containers.indexOf(c) : -1;
    if (i < 0) return;
    this.searched.add(`${b.id}:${i}`);
    this.all({ k: 'srch', b: b.id, i });
  }
  onCrateOpen(c) { if (!this.applying && c.nid) this.all({ k: 'crate', n: c.nid }); }
  onBuild(pc) { if (!this.applying) this.all({ k: 'build', p: { type: pc.type, i: pc.i, j: pc.j, dir: pc.dir, x: pc.x, y: pc.y, z: pc.z, rot: pc.rot } }); }
  onBuildGone(pc) { if (!this.applying) this.all({ k: 'unbuild', key: this.G.builds.key(pc) }); }

  // ---------------- vehicles driven by someone else ----------------
  applyVehicle(p, s) {
    const R = this.G.rides, v = R?.list[s.id];
    if (!v) return;
    if (p.vehId != null && p.vehId !== s.id) this.releaseVehicle(p);
    if (v.driver && v.driver !== p) return; // someone here is driving it
    if (!v.driver) { v.driver = p; v.remote = true; if (v.col) { this.G.physics.remove(v.col); v.col = null; } }
    p.vehId = s.id;
    v.pos.set(s.x, s.y, s.z); v.yaw = s.yaw; v.pitch = s.pitch; v.lean = s.lean; v.speed = s.sp; v.fuel = s.fuel; v.hp = s.hp;
    if (p.character) p.character.root.visible = v.type === 'bike';
  }
  releaseVehicle(p) {
    const R = this.G.rides, v = R?.list[p.vehId];
    p.vehId = null;
    if (!v || v.driver !== p) return;
    v.driver = null; v.remote = false; v.speed = 0;
    R.makeCol(v);
  }

  close() {
    this.closed = true;
    try { this.link.leave(); } catch (e) { /* ignore */ }
  }
}
export { BOT_BASE };
