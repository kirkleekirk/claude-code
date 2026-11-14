// ActionWorld: the real-time layer over the sim. Spawns populations near the player, runs AI and
// combat, turns crimes into heat via witnesses, owns interactables, squad, vehicles and pickups.
import { PLACES, PLACE, WORLD_W, WORLD_H } from '../data/places.js';
import { COMPOSITION, ARCHETYPES } from '../data/enemies.js';
import { RAMPS, SEM } from '../data/palette.js';
import { VEHICLES } from '../data/progress.js';
import { BP, BLUEPRINTS, COMP_IDS, AMMO } from '../data/guns.js';
import { ammoKey, itemInfo } from '../data/items.js';
import { randomLook, FACTION_LOOK } from '../data/looks.js';
import { T, SpatialHash, makeTileQuery, moveBox, raycast, dist, angleTo, freeAt } from './core.js';
import { Combat } from './combat.js';
import { makeNPC, think, startHunt, scare, canSee, npcGun } from './ai.js';
import { makePlayer, syncWeapons, updatePlayer, currentWeapon } from './player.js';
import { MissionRunner } from './missions.js';
import { HOLLOW_GRID } from '../world/layout.js';
import { ST } from '../world/tiles.js';
import { isNight } from '../render/lighting.js';
import { characterSheet, dogSheet, gunSprite, vehicleSprite } from '../render/paperdoll.js';
import { drawText } from '../render/font.js';
import { addHeat, heatLevel, witnessKilled } from '../sim/heat.js';
import { addItem, count, takeItem } from '../sim/inventory.js';
import { log, stat, earn, addRep, hasPerk, rank, D, makeGun, fx } from '../sim/state.js';
import { onJob, combatPower, effSkill, crewName } from '../sim/crew.js';
import { containerLoot } from '../sim/jobs.js';
import { carryCap } from '../sim/hollow.js';

const SPAWN_R = 46 * T, DESPAWN_R = 70 * T;
const MAX_ENTS = 300;

export class ActionWorld {
  constructor(game, S) {
    this.game = game;
    this.S = S;
    this.W = game.W;
    this.R = game.R;
    this.locks = new Set();
    this.Q = makeTileQuery(this.W, this.locks);
    this.hash = new SpatialHash(64);
    this.combat = new Combat(this);
    this.ents = [];
    this.pickups = [];
    this.vehicles = [];
    this.player = makePlayer(S);
    this.time = 0;
    this.night = isNight(S.min);
    this.spawned = new Map();
    this.townAlert = {};
    this.campAlert = {};
    this.squadOrder = { kind: 'follow' };
    this.focus = null;
    this.opened = {};
    this.flashes = [];
    this.missions = new MissionRunner(this);
    this.statics = this.buildInteractables();
    this.updateLocks(true);
    syncWeapons(this);
    this.spawnVehicleAtHollow();
  }

  // ---------- small services ----------
  sfx(name, src) {
    const P = this.player;
    if (src && src !== P && src.x !== undefined) {
      const d = Math.hypot(src.x - P.x, src.y - P.y);
      if (d > 34 * T) return;
      this.game.audio.play(name, Math.max(0.15, 1 - d / (34 * T)), Math.max(-1, Math.min(1, (src.x - P.x) / (20 * T))));
    } else this.game.audio.play(name);
  }
  toast(text, kind = 'info') { this.game.toast(text, kind); }
  shake(n) { this.game.shake(n); }
  flash(x, y, k = 1, h = 9) { if (k > 0) this.flashes.push({ x, y, h, t: 0.06, k: k * (this.game.settings.reduceFlash ? 0.4 : 1) }); }
  stat(k, n = 1) { stat(this.S, k, n); }
  perk(id) { return hasPerk(this.S, id); }
  enemyMult() { return D(this.S).enemy; }
  armsMult(f) { return 1 + Math.min(0.6, ((this.S.arms[f === 'warden' ? 'compact' : f]) || 0) / 300); }
  carryCap() { return carryCap(this.S); }
  carryLoad() { let w = 0; for (const [k, n] of Object.entries(this.S.player.carry)) w += itemInfo(k, this.S.strains.hybrids).w * n; return w; }
  noViolenceAt(x, y) { const z = this.W.zone[Math.floor(y / T) * WORLD_W + Math.floor(x / T)]; return z && this.W.places[z - 1].noViolence; }
  placeAt(x, y) { const z = this.W.zone[Math.floor(y / T) * WORLD_W + Math.floor(x / T)]; return z ? this.W.places[z - 1] : null; }
  ammoCount(w) { return count(this.S, ammoKey(w.st.ammo, w.ammoVar || 'std')); }
  takeAmmo(w, need) { const k = ammoKey(w.st.ammo, w.ammoVar || 'std'); const have = count(this.S, k); const n = Math.min(have, need); takeItem(this.S, k, n); return n; }

  // ---------- hostility ----------
  hostileTo(npc, other) {
    if (!npc || !other) return false;
    if (other.faction !== 'player' && other.faction !== 'crew') return false;
    if (npc.civilian || npc.faction === 'crew' || npc.faction === 'player') return false;
    if (npc.hostileToPlayer) return true;
    const f = npc.faction;
    if (f === 'wild' || f === 'bounty') return true;
    if (f === 'compact') return (this.townAlert[npc.place] || 0) > 0 || (this.S.heat[npc.place] || 0) >= 60 || npc.arch === 'warden' && (this.S.notoriety >= 80);
    const r = this.S.rivals[f];
    if (r) return (this.campAlert[npc.place] || 0) > 0 || r.stance === 'war' || (r.stance === 'hostile' && npc.place === r.camp);
    return false;
  }
  targetsFor(e) {
    if (e.faction === 'crew') return this.ents.filter((o) => o.alive && !o.ko && !o.civilian && o.faction !== 'crew' && o.kind !== 'vehicle' && this.hostileTo(o, this.player) && dist(o, e) < 16 * T);
    const out = [];
    if (this.player.alive && this.hostileTo(e, this.player)) out.push(this.player);
    for (const c of this.ents) if (c.faction === 'crew' && c.alive && this.hostileTo(e, c)) out.push(c);
    return out;
  }
  hostileShot(b, v) {
    const of = b.owner.faction;
    const mine = of === 'player' || of === 'crew';
    const vMine = v.faction === 'player' || v.faction === 'crew';
    if (mine) return !vMine;
    if (vMine) return this.hostileTo(b.owner, v) || true;
    return false;
  }

  // ---------- crime, witnesses, alerts ----------
  crime(kind, x, y, sev = 1) {
    const place = this.placeAt(x, y);
    if (!place || place.kind === 'ruin') return;
    if (place.kind === 'settlement') {
      for (const e of this.hash.query(x, y, 12 * T, [])) {
        if (!e.alive || e.ko) continue;
        const seesIt = Math.hypot(e.x - x, e.y - y) < 4 * T || !raycast(e.x, e.y, x, y, (tx, ty) => this.Q.blocksSight(tx, ty));
        if (!seesIt) continue;
        if (e.civilian) scare(this, e, this.player, true);
        else if (e.faction === 'compact') { this.alertTown(place.id); startHunt(this, e, this.player); }
      }
    } else if (place.kind === 'camp') this.campAlert[place.id] = 60;
    if (this.S.mission) this.missions.onCrime(kind, place);
  }
  alertTown(id, secs = 90) {
    if (!(this.townAlert[id] > 0)) { this.sfx('alarm'); this.toast(`${PLACE[id].name} is on alert!`, 'bad'); this.missions.onAlarm(id); }
    this.townAlert[id] = secs;
  }
  onSuspicious(e) { if (!e.civilian) this.R.fx.text(e.x, e.y, '?', RAMPS.gold[3], e.elevated ? 60 : 28); }
  onCalm() {}
  onHunt(e, target, heard) {
    if (e.civilian) return;
    this.R.fx.text(e.x, e.y, '!', SEM.enemy, e.elevated ? 60 : 28);
    this.sfx('alert', e);
    if (e.faction === 'compact' && e.place && target.faction === 'player') this.alertTown(e.place);
    if (this.S.rivals[e.faction] && e.place) this.campAlert[e.place] = 60;
    this.missions.onSpotted(e);
  }
  witnessReport(w) {
    const place = w.place || (this.placeAt(w.x, w.y) || {}).id;
    if (!place) return;
    addHeat(this.S, place, 5, 'witness');
    this.R.fx.text(w.x, w.y, 'Reported!', SEM.bad, 28);
    this.toast('A witness reported you to the Wardens. Heat +5.', 'bad');
  }

  // ---------- damage ----------
  damage(t, amt, src, o = {}) {
    if (!t.alive || t.ko) return;
    const P = this.player;
    if (t.isPlayer) {
      if (t.iframes > 0) return;
      t.hp -= amt;
      t.hurtT = 0.15;
      this.sfx('hurt', t);
      this.shake(2);
      this.game.hitstop(0.04);
      if (t.hp <= 0) { t.hp = 0; this.playerDown(src); }
      return;
    }
    if (t.kind === 'vehicle') return this.damageVehicle(t, amt);
    const fromMe = src && (src.faction === 'player' || src.faction === 'crew');
    if (t.shielded) { this.R.fx.sparks(o.x || t.x, o.y || t.y, o.dir || 0); return; }
    if (t.A && t.A.shield && o.dir !== undefined && o.variant !== 'ap' && !o.blast) {
      const facing = Math.abs(((o.dir + Math.PI - t.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (facing < 1.0) { this.R.fx.sparks(o.x || t.x, o.y || t.y, o.dir); this.sfx('tick', t); return; }
    }
    let dmg = amt * (1 - (o.variant === 'ap' ? t.armor * 0.3 : t.armor));
    const unaware = t.ai && t.ai.state !== 'hunt';
    if (fromMe && unaware && this.perk('gun_exec')) dmg *= 1.5;
    if (o.variant === 'inc') t.burnT = 3;
    t.hp -= dmg;
    t.flashT = 0.1;
    if (!o.quiet) { this.R.fx.sparks(o.x || t.x, o.y || t.y, o.dir || 0, t.elevated ? 36 : 8); this.sfx('hit', t); }
    if (fromMe && src === P) this.game.hitstop(0.04);
    if (fromMe && t.ai && t.ai.state !== 'hunt' && !t.civilian) startHunt(this, t, src);
    if (fromMe) { if (t.civilian) { scare(this, t, P, true); this.crime('assault', t.x, t.y); } else if (t.faction === 'compact' && !(this.townAlert[t.place] > 0)) this.crime('assault', t.x, t.y); }
    if (t.hp <= 0) this.kill(t, src, o);
  }

  kill(t, src, o = {}) {
    t.alive = false;
    t.hp = 0;
    t.deadT = 0;
    t.hittable = false;
    const fromMe = src && (src.faction === 'player' || src.faction === 'crew');
    this.sfx('ko', t);
    this.R.fx.dust(t.x, t.y, 6);
    if (t.faction === 'crew') { this.missions.onCrewDown(t); return; }
    if (fromMe) {
      this.stat('kills');
      if (src.faction === 'crew' && src.crewRef) { src.crewRef.kills = (src.crewRef.kills || 0) + 1; src.crewRef.gxp = (src.crewRef.gxp || 0) + 3; }
      const place = t.place || (this.placeAt(t.x, t.y) || {}).id;
      if (t.civilian) { if (t.witness) witnessKilled(this.S); addHeat(this.S, place || 'millbrook', 10, 'civilian killed'); }
      else if (t.faction === 'compact' && place && PLACE[place].kind === 'settlement') addHeat(this.S, place, 8, 'guard killed');
      if (!t.civilian && !t.dog) this.dropLoot(t);
      if (t.boss) this.missions.onBossDown(t);
    }
    this.missions.onKill(t, src);
  }

  takedown() {
    const P = this.player;
    for (const e of this.hash.query(P.x, P.y, 20, [])) {
      if (!e.alive || e.ko || e.civilian || e.faction === 'crew' || e.boss || e.kind === 'vehicle') continue;
      if (dist(e, P) > 16) continue;
      const behind = Math.abs(((angleTo(e, P) - (e.face || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1.6;
      if ((e.ai.state !== 'hunt') && behind) {
        e.ko = true; e.alive = false; e.hittable = false; e.deadT = 0;
        this.stat('kos');
        this.sfx('melee', e);
        this.R.fx.text(e.x, e.y, 'KO', SEM.text, 24);
        this.missions.onKill(e, P, true);
        this.dropLoot(e, true);
        return true;
      }
    }
    return false;
  }

  melee(P) {
    if (this.takedown()) return;
    const w = currentWeapon(this);
    const dmg = w ? w.st.melee : 10;
    let hit = false;
    for (const e of this.hash.query(P.x + Math.cos(P.face) * 12, P.y + Math.sin(P.face) * 12, 18, [])) {
      if (e === P || !e.alive || e.faction === 'crew' || e.kind === 'vehicle') continue;
      if (dist(e, { x: P.x + Math.cos(P.face) * 12, y: P.y + Math.sin(P.face) * 12 }) > 16) continue;
      this.damage(e, dmg, P, { dir: P.face, melee: true });
      hit = true;
    }
    this.sfx(hit ? 'hit' : 'dodge', P);
  }

  dropLoot(t, ko) {
    const items = {};
    if (t.weapon && !t.boss) {
      const am = t.weapon.st.ammo;
      items[ammoKey(am)] = 3 + Math.floor(Math.random() * 8);
      if (Math.random() < (ko ? 0.35 : 0.22)) items['gun:' + (t.A.gun || 'pipe_pistol')] = 1;
    }
    if (Math.random() < 0.4) items.cash = 5 + Math.floor(Math.random() * 25 * (1 + rank(this.S)));
    if (Math.random() < 0.15) items[Math.random() < 0.5 ? 'medkit' : 'scrap'] = 1;
    if (Object.keys(items).length) this.pickups.push({ x: t.x, y: t.y, items, t: 120 });
  }

  // ---------- player down ----------
  playerDown(src) {
    const P = this.player;
    if (P.vehicle) this.toggleVehicle(true);
    P.alive = false;
    this.sfx('death');
    this.stat('deaths');
    const byLaw = src && (src.faction === 'compact') && this.S.notoriety >= 35;
    this.missions.onPlayerDown();
    this.game.onPlayerDown(byLaw ? 'capture' : 'death');
  }

  respawnAtHollow() {
    const P = this.player;
    const sp = this.W.layouts.hollow.spawns.stash;
    P.x = (this.W.layouts.hollow.buildings[0].doors[0].x) * T + 8;
    P.y = (this.W.layouts.hollow.buildings[0].doors[0].y + 1) * T + 10;
    void sp;
    P.alive = true;
    P.hp = P.maxHp = this.S.player.maxHp;
    P.iframes = 2;
    this.townAlert = {};
    this.campAlert = {};
    for (const [id] of this.spawned) this.despawn(id);
  }

  // ---------- population ----------
  updatePopulation() {
    const P = this.player;
    for (const p of PLACES) {
      const cx = (p.at[0] + p.w / 2) * T, cy = (p.at[1] + p.h / 2) * T;
      const d = Math.hypot(cx - P.x, cy - P.y);
      if (d < SPAWN_R && !this.spawned.has(p.id)) this.spawnPlace(p);
      else if (d > DESPAWN_R && this.spawned.has(p.id) && !(this.townAlert[p.id] > 0) && !this.missions.holds(p.id)) this.despawn(p.id);
    }
    if (P.alive) { const pl = this.placeAt(P.x, P.y); if (pl && !this.S.visited[pl.id]) { this.S.visited[pl.id] = true; this.toast(`Discovered: ${pl.name}`); this.game.onVisit(pl); } }
  }

  add(e) { if (this.ents.length < MAX_ENTS) { this.ents.push(e); return e; } return null; }

  despawn(id) {
    const list = this.spawned.get(id) || [];
    const set = new Set(list);
    this.ents = this.ents.filter((e) => !set.has(e));
    this.spawned.delete(id);
  }

  spawnPlace(p) {
    const L = this.W.layouts[p.id];
    const list = [];
    const put = (e) => { if (e && this.add(e)) list.push(e); return e; };
    const tile = (x, y) => [x * T + 8, y * T + 10];
    const S = this.S;
    if (p.kind === 'settlement') {
      const T0 = S.towns[p.id];
      const alarmed = T0.status === 'alarmed' ? 1.5 : 1;
      let n = Math.round((p.guards || 6) * alarmed + (S.heat[p.id] >= 20 ? 2 : 0) + (S.heat[p.id] >= 40 ? 2 : 0));
      if (T0.occupied) n = Math.max(2, Math.round(n * 0.3));
      const comp = S.heat[p.id] >= 80 || p.id === 'newhaven' || p.id === 'foundry' ? COMPOSITION.warden.concat(COMPOSITION.compact) : COMPOSITION.compact;
      const posts = L.spawns.guards || [];
      let k = 0;
      for (const g of posts) { if (k >= n) break; const [x, y] = tile(g.x, g.y); put(makeNPC(this, k === 2 ? 'captain' : 'militia', x, y, { faction: 'compact', place: p.id, state: 'post' })); k++; }
      for (const route of L.spawns.patrols || []) { if (k >= n) break; const [x, y] = tile(route[0][0], route[0][1]); put(makeNPC(this, comp[k % comp.length] === 'sniper' ? 'militia' : comp[k % comp.length], x, y, { faction: 'compact', place: p.id, state: 'patrol', route })); k++; }
      if (n >= 7) for (const s of (L.spawns.snipers || []).slice(0, n >= 12 ? 4 : 2)) { const [x, y] = tile(s[0], s[1]); put(makeNPC(this, 'sniper', x, y - 2, { faction: 'compact', place: p.id, elevated: true })); k++; }
      const streets = this.streetTiles(L);
      while (k < n && streets.length) { const [tx, ty] = streets[Math.floor(Math.random() * streets.length)]; const [x, y] = tile(tx, ty); put(makeNPC(this, comp[k % comp.length], x, y, { faction: 'compact', place: p.id, state: 'wander' })); k++; }
      const folkN = Math.round((p.folk || 8) * (T0.status === 'devastated' ? 0.4 : 1));
      for (let i = 0; i < folkN && streets.length; i++) { const [tx, ty] = streets[Math.floor(Math.random() * streets.length)]; const [x, y] = tile(tx, ty); put(this.civilian(x, y, p.id)); }
      const mk = this.W.props.find((pr) => pr.place === p.id && pr.type === 'stall' && pr.market);
      if (mk) { const [x, y] = tile(mk.x, mk.y + 1); put(this.civilian(x, y, p.id, { role: 'merchant', name: 'Market trader' })); }
      for (const r of S.regulars.filter((x) => x.town === p.id)) { const [tx, ty] = streets[Math.floor(Math.random() * streets.length)] || [L.box.x + 3, L.box.y + 3]; const [x, y] = tile(tx, ty); const e = put(this.civilian(x, y, p.id, { role: 'regular', name: r.name, look: r.look })); if (e) e.regular = r.id; }
    } else if (p.kind === 'camp') {
      const r = Object.values(S.rivals).find((x) => x.camp === p.id);
      if (r && r.alive) {
        const n = Math.max(4, Math.min(12, Math.round(r.strength / 3)));
        const comp = COMPOSITION[r.id];
        const posts = L.spawns.guards || [];
        for (let i = 0; i < n; i++) {
          const g = posts[i % posts.length];
          const [x, y] = tile(g.x + (i >= posts.length ? (i % 3) - 1 : 0), g.y);
          put(makeNPC(this, comp[i % comp.length], x, y, { faction: r.id, place: p.id, state: i % 3 === 2 ? 'wander' : 'post' }));
        }
        for (const s of L.spawns.snipers || []) { const [x, y] = tile(s[0], s[1]); put(makeNPC(this, r.id === 'palehand' ? 'smuggler' : 'raider', x, y - 2, { faction: r.id, place: p.id, elevated: true, state: 'post' })); }
        const b = L.spawns.boss;
        if (b) { const [x, y] = tile(b.x, b.y); put(makeNPC(this, 'captain', x, y, { faction: r.id, place: p.id, boss: r.id, state: 'post' })); }
      }
    } else if (p.kind === 'ruin') {
      const cleared = S.flags['ruin_' + p.id] && S.day - S.flags['ruin_' + p.id] < 3;
      const comp = COMPOSITION[p.enemies] || COMPOSITION.dogs;
      const n = cleared ? 1 : p.id === 'ruin_motel' && !S.flags.motelParts ? 2 : 2 + p.tier;
      const fac = p.enemies === 'zealots' ? 'ashchoir' : p.enemies === 'raiders' ? 'rustjaw' : p.enemies === 'elite' ? 'compact' : 'wild';
      for (let i = 0; i < n; i++) {
        const den = L.spawns.dens[i % L.spawns.dens.length];
        const [x, y] = tile(den[0], den[1]);
        put(makeNPC(this, comp[i % comp.length], x + (i % 3) * 6 - 6, y, { faction: fac === 'compact' ? 'wild' : fac === 'ashchoir' || fac === 'rustjaw' ? 'wild' : 'wild', lookAs: fac === 'ashchoir' ? 'ashchoir' : fac === 'rustjaw' ? 'rustjaw' : fac === 'compact' ? 'warden' : 'scav', place: p.id, state: 'wander', hostile: true }));
      }
    } else if (p.kind === 'market') {
      for (const v of L.spawns.vendors) { const [x, y] = tile(v.x, v.y); const e = put(this.civilian(x, y, p.id, { role: 'vendor', name: v.label, look: v.npc === 'mags' ? { top: 'amber', top2: 'gold', topStyle: 'jacket', hat: 6, hatC: 'gold', hairStyle: 1, hair: RAMPS.bone[1] } : undefined })); if (e) e.vendor = v.npc; }
      for (const f of L.spawns.folk) { const [x, y] = tile(f[0], f[1]); put(this.civilian(x, y, p.id)); }
      for (const r of S.regulars.filter((x) => x.town === 'crossroads')) { const [x, y] = tile(L.box.x + 8 + Math.floor(Math.random() * 3), L.box.y + 8); const e = put(this.civilian(x, y, p.id, { role: 'regular', name: r.name, look: r.look })); if (e) e.regular = r.id; }
    } else if (p.kind === 'hollow') {
      const spots = L.spawns.crew;
      S.crew.filter((c) => c.status === 'active' && c.job !== 'squad' && !c.onMission && c.injured === 0).slice(0, 8).forEach((c, i) => {
        const s = spots[i % spots.length];
        const [x, y] = tile(s[0], s[1]);
        const e = put(this.civilian(x, y, 'hollow', { role: 'worker', name: crewName(c), look: c.look }));
        if (e) e.crewRef = c;
      });
      if (S.tutorial.on && !S.tutorial.done && S.tutorial.step < 2) { const m = L.spawns.mags; const [x, y] = tile(m.x, m.y); const e = put(this.civilian(x, y, 'hollow', { role: 'vendor', name: 'Mags', look: { top: 'amber', top2: 'gold', topStyle: 'jacket', hat: 6, hatC: 'gold', hairStyle: 1, hair: RAMPS.bone[1] } })); if (e) e.vendor = 'mags'; }
    }
    this.spawned.set(p.id, list);
    this.missions.onPlaceSpawned(p, list);
  }

  streetTiles(L) {
    if (L._streets) return L._streets;
    const out = [];
    for (const c of L.cells) if (this.W.street[c.y * WORLD_W + c.x] === 1 && !this.W.solid[c.y * WORLD_W + c.x] && this.W.struct[c.y * WORLD_W + c.x] !== ST.GATE) out.push([c.x, c.y]);
    L._streets = out;
    return out;
  }

  civilian(x, y, place, o = {}) {
    const look = randomLook(Math.random, o.look || {});
    return {
      id: 100000 + Math.floor(Math.random() * 1e9), kind: 'npc', civilian: true, faction: 'civilian', name: o.name || 'Townsfolk', role: o.role || 'folk', x, y, r: 6,
      hp: 30, maxHp: 30, armor: 0, alive: true, ko: false, hittable: true, place, look, dir: 0, face: Math.PI / 2, anim: 0, moving: false, speed: 1.6 * T, vision: 8 * T, hearing: 1, react: 1,
      A: ARCHETYPES.militia, weapon: null, ai: { state: 'wander', alert: 0, home: { x, y }, timer: Math.random() * 3 }, slowT: 0, flashT: 0,
    };
  }

  spawnMinion(arch, near, faction) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = near.x + Math.cos(a) * 3 * T, y = near.y + Math.sin(a) * 3 * T;
      if (!freeAt(this.Q, x, y)) continue;
      const e = makeNPC(this, arch, x, y, { faction: faction === 'compact' ? 'compact' : faction, place: near.place, hostile: true, minion: true });
      if (this.add(e)) { startHunt(this, e, this.player); const list = this.spawned.get(near.place); if (list) list.push(e); }
      return e;
    }
    return null;
  }

  reinforce(cap) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.spawnMinion(cap.faction === 'compact' ? 'militia' : COMPOSITION[cap.faction] ? COMPOSITION[cap.faction][i % COMPOSITION[cap.faction].length] : 'militia', cap, cap.faction);
    this.toast('Reinforcements are coming!', 'bad');
  }

  blinkBoss(e) {
    for (let i = 0; i < 12; i++) {
      const x = e.x + (Math.random() - 0.5) * 10 * T, y = e.y + (Math.random() - 0.5) * 8 * T;
      if (freeAt(this.Q, x, y) && this.placeAt(x, y) === this.placeAt(e.x, e.y)) { e.x = x; e.y = y; return; }
    }
  }

  artillery(e) {
    const P = this.player;
    for (let i = 0; i < 4; i++) {
      const x = P.x + (Math.random() - 0.5) * 8 * T, y = P.y + (Math.random() - 0.5) * 6 * T;
      this.missions.marks.push({ x, y, t: 1.6 + i * 0.5, src: e });
    }
  }

  onExplosion(x, y, r, owner) {
    for (const k of Object.keys(this.opened)) void k;
    this.missions.onExplosion(x, y, r, owner);
    if (owner === this.player) this.crime('explosion', x, y, 2);
  }

  onPlayerShot(wpn) {
    const P = this.player;
    if (wpn.st.noise > 0) this.crime('gunfire', P.x, P.y);
    for (const e of this.hash.query(P.x, P.y, Math.max(6, wpn.st.noise) * T, [])) if (e.civilian && e.alive) scare(this, e, P, wpn.st.noise > 0);
  }

  // ---------- squad ----------
  syncSquad() {
    const S = this.S;
    const want = onJob(S, 'squad').filter((c) => c.injured === 0 && !c.onMission);
    const atHome = (this.placeAt(this.player.x, this.player.y) || {}).id === 'hollow';
    const have = this.ents.filter((e) => e.faction === 'crew');
    for (const e of have) if (!want.includes(e.crewRef) || atHome) this.ents.splice(this.ents.indexOf(e), 1);
    if (atHome || !this.player.alive) return;
    want.forEach((c, i) => {
      if (this.ents.some((e) => e.faction === 'crew' && e.crewRef === c)) return;
      const g = c.gun ? S.guns.find((x) => x.id === c.gun) : null;
      const e = {
        id: 900000 + c.id, kind: 'npc', faction: 'crew', crewRef: c, slot: i, name: crewName(c), x: this.player.x + (i - 1.5) * 10, y: this.player.y + 12, r: 6,
        hp: 80 + c.level * 6 + (c.traits.includes('veteran') ? 25 : 0) + (this.perk('gun_squad') ? 20 : 0), maxHp: 0, armor: 0.1, alive: true, ko: false, hittable: true,
        look: c.look, dir: 0, face: 0, anim: 0, moving: false, speed: 3.4 * T, vision: 11 * T, hearing: 1, react: 0.5, A: ARCHETYPES.militia,
        weapon: { st: g ? { ...npcGunFromPlayer(this, g) } : npcGun('pipe_pistol', 1, 0.7), loaded: 99, reloadT: 0, cd: 0, bloom: 0, jammed: false, gun: null },
        accMult: 1 + effSkill(c, 'gunplay') * 0.06, dmgMult: (this.perk('gun_squad') ? 1.2 : 1) * (c.traits.includes('hothead') ? 1.15 : 1), coward: c.traits.includes('coward'),
        ai: { state: 'follow', home: { x: 0, y: 0 }, timer: 0 }, slowT: 0, flashT: 0,
      };
      e.maxHp = e.hp;
      e.weapon.loaded = e.weapon.st.mag;
      this.add(e);
    });
  }

  cycleSquadOrder(aim) {
    if (!this.ents.some((e) => e.faction === 'crew')) { this.toast('No squad with you. Assign crew to the Squad (Ledger > Crew).'); return; }
    const order = ['follow', 'hold', 'breach', 'focus'];
    const next = order[(order.indexOf(this.squadOrder.kind) + 1) % order.length];
    let target = null;
    if (next === 'focus') { let bd = 40; for (const e of this.ents) if (e.alive && !e.civilian && e.faction !== 'crew' && Math.hypot(e.x - aim.x, e.y - aim.y) < bd) { bd = Math.hypot(e.x - aim.x, e.y - aim.y); target = e; } }
    this.squadOrder = { kind: next, x: aim.x, y: aim.y, target };
    this.toast(`Squad: ${{ follow: 'Follow me', hold: 'Hold position', breach: 'Breach there', focus: target ? 'Focus target' : 'Focus (no target under cursor)' }[next]}`);
    this.sfx('ui');
  }

  // ---------- vehicles ----------
  spawnVehicleAtHollow() {
    this.vehicles = [];
    const S = this.S;
    const id = S.vehicles.active;
    if (!id || !VEHICLES[id].drive && id !== 'handcart') return;
    const pk = this.W.layouts.hollow.spawns.parking;
    this.vehicles.push({ kind: 'vehicle', type: id, x: pk.x * T + 16, y: pk.y * T + 16, angle: -Math.PI / 2, speed: 0, alive: true, hittable: true, r: 9, faction: 'player', hp: (S.vehicles.owned[id] || {}).hp || VEHICLES[id].hp });
  }

  toggleVehicle(force) {
    const P = this.player;
    if (P.vehicle) {
      const v = P.vehicle;
      P.vehicle = null;
      for (const a of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) { const x = v.x + Math.cos(v.angle + a) * 14, y = v.y + Math.sin(v.angle + a) * 14; if (freeAt(this.Q, x, y)) { P.x = x; P.y = y; break; } }
      v.speed = 0;
      return;
    }
    if (force) return;
    const v = this.vehicles.find((x) => dist(x, P) < 22 && x.hp > 0);
    if (!v) { this.toast(this.S.vehicles.active ? 'Your vehicle is parked at the Hollow (or bring it from the Map > Travel).' : 'You don\'t own a drivable vehicle yet.'); return; }
    if (!VEHICLES[v.type].drive) { this.toast('The handcart rides along when you fast-travel. It is not drivable.'); return; }
    P.vehicle = v;
    this.sfx('engine', v);
  }

  damageVehicle(v, amt) {
    const V = VEHICLES[v.type];
    v.hp -= amt * (1 - (V.armor || 0));
    if (this.S.vehicles.owned[v.type]) this.S.vehicles.owned[v.type].hp = Math.max(0, v.hp);
    if (v.hp <= 0) { v.hp = 0; this.combat.explode(v.x, v.y, 2 * T, 30, null); if (this.player.vehicle === v) this.toggleVehicle(true); this.toast(`${V.name} wrecked. Repair it at a Garage front or the Hollow shed (Ledger > Map).`, 'bad'); }
  }

  // ---------- doors, interactables ----------
  updateLocks(force) {
    const night = isNight(this.S.min);
    if (!force && night === this.lockNight) return;
    this.lockNight = night;
    this.locks.clear();
    if (!night) return;
    for (const b of this.W.buildings) {
      if (!b.hq || b.place === 'hollow') continue;
      if (this.S.mission && this.S.mission.inside && this.S.mission.target === b.place) continue;
      for (const d of b.doors) this.locks.add(d.y * WORLD_W + d.x);
    }
    for (const k of Object.keys(this.opened)) if (k.startsWith('door:')) this.locks.delete(+k.slice(5));
  }

  buildInteractables() {
    const W = this.W;
    const out = [];
    const L = W.layouts.hollow;
    for (const c of L.gridCells) out.push({ kind: 'cell', i: c.j * 6 + c.i, x: c.x * T + 16, y: c.y * T + 16, r: 26 });
    for (const pr of W.props) {
      const x = pr.x * T + 8, y = pr.y * T + 12;
      if (pr.type === 'stall' && pr.market) out.push({ kind: 'market', place: pr.place, x, y: y + 12, r: 20, prop: pr });
      else if (pr.type === 'stall' && pr.npc) out.push({ kind: 'vendor', npc: pr.npc, place: pr.place, x, y: y + 12, r: 20, prop: pr });
      else if (pr.type === 'jobboard') out.push({ kind: 'jobs', x, y: y + 6, r: 20, prop: pr });
      else if (pr.type === 'lootcrate') out.push({ kind: 'loot', place: pr.place, tier: pr.tier || 1, id: 'crate:' + pr.id, x, y, r: 18, prop: pr });
      else if (pr.type === 'vault') out.push({ kind: 'vault', place: pr.place, id: 'vault:' + pr.place, x, y, r: 18, prop: pr });
      else if (pr.type === 'stash') out.push({ kind: 'stash', x, y, r: 18, prop: pr });
      else if (pr.type === 'dryline' || pr.type === 'cureshelf' || pr.type === 'packtable') out.push({ kind: 'production', x, y, r: 18, prop: pr });
      else if (pr.type === 'safe' && pr.place && PLACE[pr.place] && PLACE[pr.place].kind !== 'hollow') out.push({ kind: 'loot', place: pr.place, tier: 3, locked: true, id: 'safe:' + pr.id, x, y, r: 18, prop: pr });
    }
    for (const b of W.buildings) {
      const role = { tavern: 'tavern', lot: 'lot', clinic: 'clinic', gunshop: 'gunshop', fence: 'fence', smuggler: 'smuggler', armory: 'armory', store: 'store', workshop: 'store', bank: 'council', fixer: 'fixer', chapel: 'chapel', hq: 'hqdoor', garage: 'garage', depot: 'depot' }[b.role];
      if (!role) continue;
      for (const d of b.doors) {
        const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[d.f];
        out.push({ kind: role, b, place: b.place, door: d, x: (d.x + v[0]) * T + 8, y: (d.y + v[1]) * T + 10, r: 16 });
      }
    }
    return out;
  }

  findFocus() {
    const P = this.player;
    let best = null, bd = Infinity;
    const consider = (it) => { const d = Math.hypot(it.x - P.x, it.y - P.y); if (d < it.r && d < bd) { bd = d; best = it; } };
    for (const it of this.statics) consider(it);
    for (const e of this.ents) {
      if (e.civilian && e.alive && (e.role === 'merchant' || e.role === 'vendor' || e.role === 'regular' || e.role === 'worker')) consider({ kind: e.role === 'merchant' ? 'market' : e.role === 'regular' ? 'regular' : e.role === 'worker' ? 'worker' : 'vendor', npc: e.vendor, ent: e, place: e.place, x: e.x, y: e.y, r: 18 });
      else if (!e.alive && !e.civilian && e.loot) consider({ kind: 'body', ent: e, x: e.x, y: e.y, r: 14 });
      else if (e.objective && e.alive) consider({ kind: 'objective', ent: e, x: e.x, y: e.y, r: 20 });
    }
    for (const pk of this.pickups) consider({ kind: 'pickup', pk, x: pk.x, y: pk.y, r: 14 });
    for (const v of this.vehicles) consider({ kind: 'vehicleEnter', v, x: v.x, y: v.y, r: 20 });
    for (const m of this.missions.objects()) consider(m);
    this.focus = best;
    this.R.highlight = best && best.prop ? best.prop : null;
    return best;
  }

  interact() {
    const f = this.focus;
    if (!f) return;
    if (f.kind === 'pickup') return this.collect(f.pk);
    if (f.kind === 'loot') return this.openContainer(f);
    if (f.kind === 'vehicleEnter') return this.toggleVehicle();
    if (f.kind === 'hqdoor' && this.locks.has(f.door.y * WORLD_W + f.door.x)) return this.game.startMinigame('lock', { door: f.door, place: f.place });
    if (f.kind === 'vault') return this.missions.vaultInteract(f);
    if (f.kind === 'objective') return this.missions.objectiveInteract(f.ent);
    if (this.missions.interact(f)) return;
    this.game.openInteraction(f);
  }

  openContainer(f) {
    if (this.opened[f.id] && this.S.day - this.opened[f.id] < 3) { this.toast('Already emptied. Check back in a few days.'); return; }
    if (f.locked) return this.game.startMinigame('safe', { container: f });
    this.lootContainer(f);
  }

  lootContainer(f) {
    this.opened[f.id] = this.S.day;
    const place = PLACE[f.place];
    const L = containerLoot(this.S, f.place, f.tier || (place && place.tier) || 1);
    if (L.cash) { earn(this.S, 'carried', L.cash, 'scavenging'); }
    for (const [k, n] of Object.entries(L.items)) this.S.player.carry[k] = (this.S.player.carry[k] || 0) + n;
    this.sfx('coin', this.player);
    this.R.fx.coins(f.x, f.y, 6);
    const names = Object.entries(L.items).map(([k, n]) => `${n} ${itemInfo(k, this.S.strains.hybrids).name}`).slice(0, 4).join(', ');
    this.toast(`Looted: ${L.cash ? '$' + L.cash + ', ' : ''}${names}`, 'good');
    this.stat('containers');
    if (f.place && place && place.kind === 'ruin') {
      const crates = this.statics.filter((s) => s.kind === 'loot' && s.place === f.place);
      if (crates.every((c) => this.opened[c.id] && this.S.day - this.opened[c.id] < 3)) {
        this.S.flags['ruin_' + f.place] = this.S.day;
        addRep(this.S, 1 + place.tier * 2, null, 'scavenge');
        if (f.place === 'ruin_motel') this.S.tutorial.flags.ruinLooted = true;
        this.toast(`${place.name} stripped clean.`, 'good');
      }
      if (f.place === 'ruin_motel') this.S.tutorial.flags.ruinLooted = true;
    }
    this.missions.onLoot(f);
  }

  collect(pk) {
    for (const [k, n] of Object.entries(pk.items)) {
      if (k === 'cash') earn(this.S, 'carried', n, 'combat');
      else if (k.startsWith('gun:')) this.lootGun(k.slice(4));
      else this.S.player.carry[k] = (this.S.player.carry[k] || 0) + n;
    }
    this.pickups.splice(this.pickups.indexOf(pk), 1);
    this.sfx('coin', this.player);
  }

  lootGun(bp) {
    if (!BP[bp]) return;
    const comps = {};
    for (const t of COMP_IDS) comps[t] = [Math.random() < 0.3 ? 'iron' : 'scrap', 1 + Math.floor(Math.random() * 3)];
    const g = makeGun(this.S, bp, comps, Math.random() < 0.6 ? 'junk' : 'common', Math.random() < 0.3, {});
    g.dur = Math.round(g.maxDur * (0.4 + Math.random() * 0.4));
    this.toast(`Picked up: ${BP[bp].name} (${g.grade}). Study it at the bench to learn the blueprint.`, 'good');
  }

  // Carried goods land in the stash at the Hollow.
  depositCarry() {
    const S = this.S;
    let n = 0;
    for (const [k, q] of Object.entries(S.player.carry)) { addItem(S, k, q); n += q; }
    S.player.carry = {};
    if (S.money.carried > 0) { S.money.dirty += S.money.carried; this.toast(`Stashed $${Math.round(S.money.carried)}${n ? ' and ' + n + ' items' : ''}.`, 'good'); S.money.carried = 0; }
    else if (n) this.toast(`Stashed ${n} items.`, 'good');
  }

  // ---------- main update ----------
  update(dt, input, aim, uiBlocked) {
    const S = this.S;
    this.time += dt;
    this.night = isNight(S.min);
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      this.updatePopulation();
      this.syncSquad();
      this.updateLocks(false);
      for (const k of Object.keys(this.townAlert)) { this.townAlert[k] -= 0.5; if (this.townAlert[k] <= 0) delete this.townAlert[k]; }
      for (const k of Object.keys(this.campAlert)) { this.campAlert[k] -= 0.5; if (this.campAlert[k] <= 0) delete this.campAlert[k]; }
      const here = this.placeAt(this.player.x, this.player.y);
      if (here && here.id === 'hollow' && this.player.alive) this.depositCarry();
      syncWeapons(this);
    }
    updatePlayer(this, dt, input, aim, uiBlocked);
    const P = this.player;
    P.inLight = false;
    this.hash.clear();
    this.hash.insert(P);
    for (const e of this.ents) if (e.alive || e.ko) this.hash.insert(e);
    for (const v of this.vehicles) this.hash.insert(v);
    for (const e of this.ents) {
      if (!e.alive) { e.deadT = (e.deadT || 0) + dt; continue; }
      if (Math.abs(e.x - P.x) > 40 * T || Math.abs(e.y - P.y) > 30 * T) continue;
      if (e.burnT > 0) { e.burnT -= dt; if (Math.random() < dt * 3) this.damage(e, 3, P, { quiet: true, burn: true }); }
      e.anim += dt * (e.moving ? 8 : 0);
      think(this, e, dt);
    }
    this.ents = this.ents.filter((e) => e.alive || e.ko || e.deadT < 40);
    this.combat.update(dt);
    for (const pk of this.pickups) pk.t -= dt;
    this.pickups = this.pickups.filter((p) => p.t > 0);
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    this.missions.update(dt);
    this.findFocus();
    S.player.x = P.x; S.player.y = P.y; S.player.hp = P.hp;
  }

  // ---------- rendering hooks ----------
  drawables() {
    const out = [];
    const self = this;
    const drawChar = (e) => (ctx, cx, cy) => self.drawEntity(ctx, e, cx, cy);
    const P = this.player;
    if (P.alive && !P.vehicle) out.push({ sy: P.y, draw: drawChar(P) });
    for (const e of this.ents) if (Math.abs(e.x - P.x) < 30 * T && Math.abs(e.y - P.y) < 20 * T) out.push({ sy: e.alive ? e.y : e.y - 8, draw: drawChar(e) });
    for (const v of this.vehicles) out.push({ sy: v.y + 4, draw: (ctx, cx, cy) => self.drawVehicle(ctx, v, cx, cy) });
    for (const pk of this.pickups) out.push({ sy: pk.y - 4, draw: (ctx, cx, cy) => { const t = this.time * 4; ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(Math.round(pk.x - cx) - 3, Math.round(pk.y - cy) - 4, 7, 5); ctx.fillStyle = RAMPS.gold[2]; ctx.fillRect(Math.round(pk.x - cx) - 2, Math.round(pk.y - cy) - 3, 5, 3); if (Math.sin(t) > 0.6) { ctx.fillStyle = RAMPS.gold[3]; ctx.fillRect(Math.round(pk.x - cx) + 1, Math.round(pk.y - cy) - 6, 1, 2); } } });
    for (const d of this.missions.drawables()) out.push(d);
    return out;
  }

  drawEntity(ctx, e, cx, cy) {
    const x = Math.round(e.x - cx), y = Math.round(e.y - cy) - (e.elevated ? 16 : 0);
    ctx.fillStyle = 'rgba(18,15,14,0.35)';
    if (e.alive) ctx.fillRect(x - 4 + 2, y - 1, 9, 3);
    let img;
    if (e.dog) { const sh = dogSheet(e.faction === 'compact' ? 'ink' : 'wood'); img = !e.alive ? sh.ko : sh.frames[e.dir][e.moving ? Math.floor(e.anim) % 4 : 0]; }
    else { const sh = characterSheet(e.look || this.game.playerLook); const f = e.moving ? 2 + (Math.floor(e.anim) % 4) : (Math.floor(this.time * 1.5 + (e.id || 0)) % 2); img = !e.alive ? sh.ko : sh.frames[e.dir][f]; }
    if (!e.alive) { ctx.globalAlpha = e.ko ? 0.9 : 0.75; ctx.drawImage(img, x - img.width / 2, y - img.height + 4); ctx.globalAlpha = 1; return; }
    if (e.isPlayer && e.rollT > 0) { ctx.save(); ctx.translate(x, y - 8); ctx.rotate((1 - e.rollT / 0.32) * Math.PI * 2 * Math.sign(Math.cos(e.rollA) || 1)); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore(); return; }
    const flash = e.flashT > 0 || e.hurtT > 0;
    const gunW = e.isPlayer ? currentWeapon(this) : e.weapon;
    const drawGun = () => { if (!gunW || e.dog) return; const gs = gunSprite(gunW.st.family); ctx.save(); ctx.translate(x, y - 8); ctx.rotate(e.face || 0); if (Math.cos(e.face || 0) < 0) ctx.scale(1, -1); ctx.drawImage(gs, 2, -2); ctx.restore(); };
    if (e.dir === 1) drawGun();
    ctx.drawImage(img, x - img.width / 2, y - img.height + 2);
    if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(img, x - img.width / 2, y - img.height + 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (e.dir !== 1) drawGun();
    if (e.shielded) { ctx.strokeStyle = RAMPS.teal[3]; ctx.beginPath(); ctx.arc(x, y - 9, 12, 0, Math.PI * 2); ctx.stroke(); }
    if (e.A && e.A.shield && e.alive) { ctx.fillStyle = RAMPS.ink[3]; const sx = Math.round(Math.cos(e.face) * 7), sy = Math.round(Math.sin(e.face) * 4); ctx.fillRect(x + sx - 3, y - 15 + sy, 6, 10); ctx.fillStyle = RAMPS.teal[2]; ctx.fillRect(x + sx - 2, y - 14 + sy, 4, 2); }
    // Markers: enemy red, crew teal; alert icons; HP bars when hurt.
    if (!e.isPlayer && !e.civilian) {
      const hostile = e.faction !== 'crew' && this.hostileTo(e, this.player);
      if (e.faction === 'crew' || hostile || e.boss) { ctx.fillStyle = e.faction === 'crew' ? this.game.sem.friendly : this.game.sem.enemy; ctx.fillRect(x - 1, y - 24, 3, 2); }
      if (e.ai && e.ai.state === 'suspicious') drawText(ctx, '?', x, y - 32, RAMPS.gold[3], { align: 'center', shadow: RAMPS.ink[0] });
      if (e.hp < e.maxHp || e.boss) { const w = e.boss ? 24 : 12; ctx.fillStyle = RAMPS.ink[0]; ctx.fillRect(x - w / 2, y - 27, w, 2); ctx.fillStyle = e.faction === 'crew' ? this.game.sem.friendly : this.game.sem.enemy; ctx.fillRect(x - w / 2, y - 27, Math.round(w * Math.max(0, e.hp / e.maxHp)), 2); }
    }
    if (e.laser) { ctx.strokeStyle = 'rgba(226,69,42,0.55)'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(Math.round(e.laser.x - cx), Math.round(e.laser.y - 7 - cy)); ctx.stroke(); }
    if (e.witness) drawText(ctx, '!', x, y - 32, SEM.bad, { align: 'center', shadow: RAMPS.ink[0] });
  }

  drawVehicle(ctx, v, cx, cy) {
    const img = vehicleSprite(v.type);
    ctx.save();
    ctx.translate(Math.round(v.x - cx), Math.round(v.y - cy - 4));
    ctx.fillStyle = 'rgba(18,15,14,0.35)';
    ctx.fillRect(-img.width / 2 + 2, -img.height / 2 + 4, img.width, img.height);
    ctx.rotate(v.angle);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  lights(L) {
    const P = this.player;
    // add(x, y, radius, colour, strength, height): ground position + height above it.
    if (this.night) L.add(P.x, P.y, 46, 'rgba(255,214,160,1)', 0.75, 7);
    for (const f of this.flashes) L.add(f.x, f.y, 40 * f.k, 'rgba(255,220,140,1)', 1.2, f.h);
    for (const z of this.combat.zones) if (z.type === 'fire') L.add(z.x, z.y, z.r * 2.2, 'rgba(255,140,60,1)', 0.8 + Math.random() * 0.3, 5);
    for (const v of this.vehicles) if (this.night && this.player.vehicle === v) L.add(v.x + Math.cos(v.angle) * 40, v.y + Math.sin(v.angle) * 40, 60, 'rgba(255,240,200,1)', 0.9, 5);
    for (const e of this.ents) if (e.vendor && this.night) L.add(e.x, e.y, 30, 'rgba(255,170,90,1)', 0.7, 12);
  }
}

function npcGunFromPlayer(world, g) {
  const b = BP[g.bp];
  return { ...npcGun(g.bp, 1, 0.75), dmg: b.dmg * (g.grade === 'masterwork' ? 1.15 : g.grade === 'legendary' ? 1.25 : g.grade === 'fine' ? 1.08 : 1) };
}

export { T };
