// Raider crews: hostile survivors who set up camp somewhere out in the county
// after a while. Some start small and grow, some show up already big. They
// keep a rough schedule (watch rotations, sleep in tents, drink by the
// fire), notice you if you're careless, and hold a stash worth robbing.
// Plans from survivors (night raid, drugged liquor, a distraction, a man on
// the inside, a scout, an ambush on the highway) change how a raid goes.
import { Structure } from '../building/structure.js';
import { stationsFor } from './stations.js';
import { makePerson, BACKGROUND_BY_ID } from './people.js';
import { T } from '../world/terrain.js';
import { FIELDS } from '../world/layout.js';

// in a planted field (crops would grow up through the tents)
export function inField(x, z, m = 0) { return FIELDS.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m); }
import { weighted } from './dialogue.js';

const CREW_NAMES = ['the Bluff Road crew', 'the Creekside gang', 'the Highway Boys', 'the Red Hand', 'the Hollow crew', 'the River Rats', 'the Black Dog crew', 'the Saints', 'the Ditch Kings', 'the Long Knives'];
const DARK_SHIRTS = ['#2a2a2a', '#3a2a22', '#4a3a2a', '#5a2222', '#2a3a2a', '#3a3a44', '#4a2e2e', '#33322c'];
const DARK_PANTS = ['#2a2c30', '#3a3a2e', '#2e2a26', '#383c40'];
const TENTS = ['#5a5a42', '#6a5e48', '#4a5240', '#7a6a50', '#55524a'];

const CHATTER = [
  "Boss says we hit that farm by the creek next.", "Ain't nobody coming out here. Relax.", "I'd kill for a cheeseburger. Like, actually kill.",
  "Check the perimeter. Again.", "Who took my smokes?", "There's a group holed up west of here. They've got food. Lots of it.",
  "We should move camp before the cold sets in.", "That last guy cried for his mama. I keep hearing it.", "Keep your voice down. They hear everything.",
  "When this is over I'm going to Florida. Somebody's got to still be in Florida.", "Split's not fair and you know it.", "You smell that? Rain's coming.",
  "Boss trusts you more than me. Wonder why.", "I'm on watch again? I was on watch last night.", "That stash ain't gonna guard itself.",
];
const ALERT = ["Hey! Who's out there?", 'Show yourself!', 'I heard something.', 'Somebody out there?', 'Eyes up. Something moved.'];
const HOSTILE = ['There! Light ’em up!', 'We got company!', 'Wake up! We’re hit!', 'Kill ’em!', 'They’re after the stash!'];
const FLEE = ["I'm out! I'm out!", 'Screw this!', 'Fall back!', 'Not dying for this crew!'];
const CALM = ['Must’ve been a deer.', 'Nothing. Back to it.', 'Stay sharp.', 'Probably one of the dead.'];

export class Raiders {
  constructor(soc) {
    this.soc = soc; this.game = soc.game;
    this.camps = [];
    this.parties = [];
    this.nextCheck = 0;
    this.nameI = Math.floor(Math.random() * CREW_NAMES.length);
  }
  get clock() { return this.soc.clock; }
  get active() { return this.camps.filter((c) => !c.gone); }

  // ---------------- founding & growth ----------------
  // flat-enough open ground out in the country, away from you and your camp
  site() {
    const g = this.game, tr = g.world.terrain, P = T.play;
    const claim = g.claims.list[0];
    const avoid = [g.player.pos, ...(claim ? [{ x: claim.flag[0], z: claim.flag[2] }] : []), ...this.camps.map((c) => ({ x: c.x, z: c.z }))];
    if (!this.cands) {
      // open spots, found once: gentle slope, no road, building, field or trees inside the ring
      this.cands = [];
      for (let x = P.x0 + 30; x < Math.min(P.x1 - 30, T.town.x0 - 25); x += 6) for (let z = P.z0 + 30; z < P.z1 - 30; z += 6) {
        const h = tr.height(x, z);
        if (h < T.water + 1.5) continue;
        let slope = 0;
        for (const [dx, dz] of [[11, 0], [-11, 0], [0, 11], [0, -11], [8, 8], [-8, -8], [8, -8], [-8, 8]]) slope = Math.max(slope, Math.abs(tr.height(x + dx, z + dz) - h));
        if (slope > 3) continue;
        if (g.world.roadDist && g.world.roadDist(x, z) < 13) continue;
        if (g.world.nearBuilding(x, z, 16)) continue;
        if (inField(x, z, 15)) continue;
        if (g.physics.query(x - 14, z - 14, x + 14, z + 14, []).some((b) => b.kind !== 'walk' && Math.hypot((b.min[0] + b.max[0]) / 2 - x, (b.min[2] + b.max[2]) / 2 - z) < 14)) continue;
        this.cands.push({ x, z, y: h, slope });
      }
    }
    let best = null, bs = -Infinity;
    for (const c of this.cands) {
      const dmin = Math.min(...avoid.map((a) => Math.hypot(a.x - c.x, a.z - c.z)));
      if (dmin < 120) continue;
      const s = -c.slope * 3 - Math.abs(dmin - 200) * 0.04 + Math.random() * 8;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }
  found(at = null, size = null) {
    at = at || this.site();
    if (!at) return null;
    const big = Math.random() < 0.25;
    size = size || (big ? 9 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 4));
    const c = {
      id: 'R' + Math.floor(Math.random() * 1e8).toString(36), name: CREW_NAMES[this.nameI++ % CREW_NAMES.length],
      x: at.x, y: at.y, z: at.z, roster: [], state: 'calm', sus: 0, known: false, scouted: false, mods: {}, stashLooted: false,
      grownDay: this.game.day, losses: 0, live: false, npcs: [], grudge: 0, founded: this.clock,
    };
    const used = new Set();
    for (let i = 0; i < size; i++) this.recruit(c, used);
    this.build(c);
    this.camps.push(c);
    this.soc.camp.log(`Smoke to the ${compass(at.x - this.game.player.pos.x, at.z - this.game.player.pos.z)}. Someone new is camped out in the county.`, 'raiders', { who: [], crew: 'whoever that is' });
    return c;
  }
  recruit(c, used = new Set(c.roster.map((r) => r.person.background))) {
    const rng = Math.random;
    const p = makePerson(rng, used, { lastNames: new Set(c.roster.map((r) => r.person.name.split(' ').slice(-1)[0])), firstNames: new Set(c.roster.map((r) => r.person.name.split(' ')[0])), personalities: ['hothead', 'hothead', 'schemer', 'schemer', 'cynic', 'cynic', 'loner', 'wildcard', 'wildcard', 'rock', 'joker', 'planner', 'oldsoul'] });
    used.add(p.background);
    p.palette[1] = DARK_SHIRTS[Math.floor(rng() * DARK_SHIRTS.length)];
    p.palette[2] = DARK_PANTS[Math.floor(rng() * DARK_PANTS.length)];
    const bg = BACKGROUND_BY_ID[p.background];
    const armed = bg.skills.shooting >= 1 || rng() < 0.45;
    const gun = armed ? ['ak', 'ak', 'pump', '1911', '1911', 'uzi', 'm4', 'pump'][Math.floor(rng() * 8)] : null;
    const r = { person: p, health: 100, dead: false, weapon: armed ? 'gun' : 'bat', gun };
    c.roster.push(r);
    // the boss: most commanding
    const alive = c.roster.filter((x) => !x.dead);
    c.boss = alive.reduce((a, b) => ((BACKGROUND_BY_ID[b.person.background].skills.leadership + (b.person.personality === 'hothead' || b.person.personality === 'schemer' ? 1 : 0)) > (BACKGROUND_BY_ID[a.person.background].skills.leadership + (a.person.personality === 'hothead' || a.person.personality === 'schemer' ? 1 : 0)) ? b : a)).person.id;
    return r;
  }
  // camp layout: a fire in the middle, tents around it, a ring of scrap
  // barricades with gaps, a lookout on the road side, and the stash
  build(c) {
    const g = this.game, tr = g.world.terrain;
    const oy = Math.round(tr.height(c.x, c.z) * 4) / 4;
    const S = new Structure({ name: c.name, kind: 'raider', ox: c.x - 20, oz: c.z - 20, oy });
    const put = (type, wx, wz, rot, data = {}) => S.addProp(type, wx - S.ox, tr.height(wx, wz) - 0.04 - oy, wz - S.oz, rot, data);
    const face = (wx, wz) => rotTo(c.x - wx, c.z - wz);
    put('campfire', c.x, c.z, 0);
    put('log_bench', c.x, c.z + 2.4, 2); put('log_bench', c.x - 2.4, c.z, 1);
    const n = Math.max(2, Math.ceil(c.roster.length / 2));
    c.tents = n;
    for (let i = 0; i < n; i++) this.addTent(c, S, i, put, face);
    // barricade ring
    const R = 13.5, seg = 14;
    for (let i = 0; i < seg; i++) {
      if (i % 5 === 2) continue; // gaps to walk through
      const a = (i / seg) * Math.PI * 2;
      const bx = c.x + Math.cos(a) * R, bz = c.z + Math.sin(a) * R;
      if (g.world.nearBuilding(bx, bz, 2) || (g.world.roadDist && g.world.roadDist(bx, bz) < 3.5)) continue;
      // face out: the sandbag side (-z) toward the camp
      put('barricade', bx, bz, rotTo(bx - c.x, bz - c.z), { w: 3, seed: i });
    }
    // lookout toward the nearest road
    const la = Math.atan2(-c.z, -c.x) + 0.3;
    const lx = c.x + Math.cos(la) * 10.5, lz = c.z + Math.sin(la) * 10.5;
    put('lookout', lx, lz, rotTo(c.x - lx, c.z - lz));
    // stash and supplies by the boss's tent
    const sa = Math.PI * 0.5;
    put('crate', c.x + Math.cos(sa) * 4.6, c.z + Math.sin(sa) * 4.6, 0, { loot: 'raider_stash', label: `${cap(poss(c.name))} stash`, s: 1.0 });
    put('crate', c.x + Math.cos(sa) * 4.6 + 1.1, c.z + Math.sin(sa) * 4.6 + 0.2, 0, { loot: 'crate', s: 0.7 });
    put('drum', c.x + Math.cos(sa) * 4.6 - 1.1, c.z + Math.sin(sa) * 4.6, 0);
    put('drum', c.x - 5.5, c.z - 3.5, 0);
    S.playerBuilt = true; S.raider = c.id;
    // trampled ground: no tall grass inside the ring
    g.world.clearVegetation(c.x - 12, c.z - 12, c.x + 12, c.z + 12);
    g.world.structures.push(S);
    g.world.attach(S);
    c.S = S; c.Sid = S.id;
    c.stations = stationsFor(S);
  }
  addTent(c, S, i, put, face) {
    const a = (i / Math.max(5, c.tents)) * Math.PI * 2 + 0.4;
    const r = 7 + (i % 2) * 1.6;
    const tx = c.x + Math.cos(a) * r, tz = c.z + Math.sin(a) * r;
    put('tent', tx, tz, face(tx, tz), { color: TENTS[i % TENTS.length] });
  }
  grow(c) {
    const alive = c.roster.filter((r) => !r.dead).length;
    if (alive < 2 || alive >= 16) return;
    const n = 1 + (Math.random() < 0.45 ? 1 : 0);
    for (let i = 0; i < n && alive + i < 16; i++) {
      const r = this.recruit(c);
      if (c.live) this.materialize(c, r, true);
    }
    // more tents as they fill up
    const need = Math.ceil(c.roster.filter((r) => !r.dead).length / 2);
    if (need > c.tents) {
      const S = c.S, tr = this.game.world.terrain;
      const put = (type, wx, wz, rot, data = {}) => S.addProp(type, wx - S.ox, tr.height(wx, wz) - 0.04 - S.oy, wz - S.oz, rot, data);
      for (let i = c.tents; i < need; i++) this.addTent(c, S, i, put, (wx, wz) => rotTo(c.x - wx, c.z - wz));
      c.tents = need;
      this.game.world.attach(S);
      c.stations = stationsFor(S);
      for (const m of c.npcs) { m.task = null; }
    }
    if (c.known) this.soc.camp.log(`Word is ${c.name} took in more people.`, 'raiders');
  }

  // ---------------- people in the camp ----------------
  materialize(c, r, arriving = false) {
    if (r.dead) return;
    const a = Math.random() * Math.PI * 2, d = arriving ? 16 : 3 + Math.random() * 6;
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const m = this.soc.spawn(r.person, { x, z, faction: 'raider', mode: 'raider', weapon: r.weapon, gunId: r.gun || 'ak' });
    m.health = r.health; m.maxHealth = 100;
    m.rcamp = c; m.rec = r;
    m.boss = r.person.id === c.boss;
    Object.defineProperty(m, 'isHostile', { get: () => c.state === 'hostile' });
    m.brain = (dt, near) => this.brain(m, dt, near);
    m.onHurt = (src) => this.hurt(m, src);
    m.smoker = Math.random() < 0.55;
    c.npcs.push(m);
    return m;
  }
  spawnLive(c) {
    c.live = true;
    c.npcs = [];
    for (const r of c.roster) if (!r.dead) this.materialize(c, r);
    // relationships within the crew
    for (const a of c.npcs) for (const b of c.npcs) if (a !== b && !(b.person.id in a.rels)) a.rels[b.person.id] = (Math.random() - 0.35) * 0.6;
  }
  despawn(c) {
    for (const m of c.npcs) { m.rec.health = m.dead ? 0 : m.health; if (m.task && m.task.slot) m.task.slot.user = null; this.soc.drop(m); }
    c.npcs = []; c.live = false; c.state = 'calm'; c.sus = 0;
  }
  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game, now = this.clock;
    if (now > this.nextCheck) {
      this.nextCheck = now + 3;
      const want = g.day >= 2 ? Math.min(3, 1 + Math.floor((g.day - 2) / 3)) : 0;
      if (this.active.length < want && !g.peaceful) this.found();
      for (const c of this.active) {
        if (c.grownDay < g.day && g.sky.time > 8) { c.grownDay = g.day; this.grow(c); }
        if (c.roster.every((r) => r.dead)) { c.gone = true; this.soc.camp.log(`${cap(c.name)} is finished. Nobody left at their camp.`, 'raiders'); }
      }
      this.planRaid();
    }
    const p = g.player.pos;
    for (const c of this.camps) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (!c.live && d < 150 && !c.gone) this.spawnLive(c);
      else if (c.live && d > 210) this.despawn(c);
      if (c.live) this.updateCamp(c, dt);
    }
    this.updateParties(dt);
  }
  night() { const h = this.game.sky.time; return h >= 22 || h < 5.5; }
  // the drugged liquor and night-raid windows
  modOn(c, k) { const m = c.mods[k]; return !!m && this.clock >= (m.from ?? -1e9) && this.clock <= (m.to ?? 1e9); }
  updateCamp(c, dt) {
    const g = this.game, pl = g.player;
    c.t = (c.t || 0) - dt;
    if (c.t <= 0) {
      c.t = 0.25;
      this.perceive(c, 0.25);
    }
    // calm back down
    if (c.state === 'hostile' && this.clock - (c.lastContact || 0) > 0.6 && !c.npcs.some((m) => m.combatTarget)) { c.state = 'alert'; c.alertT = this.clock; }
    if (c.state === 'alert' && this.clock - (c.alertT || 0) > 1.2) { c.state = 'calm'; c.sus = 0; const m = c.npcs.find((x) => !x.dead && !x.sleeping); m && this.say(m, pick(CALM)); }
    // crew talk
    c.talkT = (c.talkT ?? 10) - dt;
    if (c.talkT <= 0 && c.state === 'calm') {
      c.talkT = 14 + Math.random() * 18;
      this.chatter(c);
    }
    // a distraction draws them away
    if (c.distractAt && this.clock > c.distractUntil) { c.distractAt = null; for (const m of c.npcs) { m.task = null; } }
  }
  perceive(c, dt) {
    const g = this.game, pl = g.player, pp = pl.pos;
    const dPl = Math.hypot(pp.x - c.x, pp.z - c.z);
    if (dPl > 70 || pl.dead) { c.sus = Math.max(0, c.sus - dt * 0.2); return; }
    const dark = g.sky.darkness;
    let best = 0, who = null;
    const followers = this.soc.npcs.filter((o) => o.faction === 'camp' && ['follow', 'mission', 'wait'].includes(o.mode) && !o.dead && !o.controlled && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 60);
    for (const m of c.npcs) {
      if (m.dead || m.sleeping || m.downed) continue;
      for (const t of [pl, ...followers]) {
        const tp = t.pos;
        const dx = tp.x - m.pos.x, dz = tp.z - m.pos.z, d = Math.hypot(dx, dz);
        let sight = 24 * (1 - dark * 0.55);
        if (t === pl) {
          if (pl.crouch) sight *= 0.5;
          if (pl.flashlightOn && dark > 0.4) sight = Math.max(sight, 34);
          if (pl.noise > d) best = Math.max(best, 0.6);
        } else if (t.crouch) sight *= 0.55;
        if (this.modOn(c, 'night') && dark > 0.5) sight *= 0.55;
        if (c.scouted) sight *= 0.8;
        if (c.inside && this.clock < c.inside.until) sight *= 0.45;
        if (m.anim.act && /^sit_/.test(m.anim.act)) sight *= 0.75;
        if (d > sight) continue;
        const fx = Math.sin(m.facing), fz = Math.cos(m.facing);
        if ((dx * fx + dz * fz) / (d || 1) < -0.15 && d > 3) continue;
        if (!this.soc.clear(m.pos, tp, 1.5)) continue;
        const s = (1 - d / sight) * 2.2 + (d < 5 ? 1 : 0);
        if (s > best) { best = s; who = m; }
      }
    }
    if (best > 0) {
      c.sus += best * dt * (c.state === 'alert' ? 2 : 1);
      c.seen = { x: pp.x, y: pp.y, z: pp.z };
      if (c.sus > 0.35 && c.state === 'calm') { c.state = 'alert'; c.alertT = this.clock; who && this.say(who, pick(ALERT)); c.alertAt = { ...c.seen }; }
      if (c.sus >= 1 && c.state !== 'hostile') this.goHostile(c, who);
      if (c.state === 'hostile') c.lastContact = this.clock;
    } else c.sus = Math.max(0, c.sus - dt * 0.12);
  }
  goHostile(c, who) {
    if (c.state === 'hostile') return;
    c.state = 'hostile'; c.lastContact = this.clock; c.known = true;
    const m = who || c.npcs.find((x) => !x.dead);
    m && this.say(m, pick(HOSTILE));
    // everyone wakes up
    for (const x of c.npcs) { if (x.sleeping) { x.sleeping = false; x.setAct(null); x.task = null; } }
    // drugged ones stay down
    if (this.modOn(c, 'drugged')) for (const x of c.npcs) if (Math.random() < 0.7) { x.sleeping = true; x.drugged = true; }
  }
  hear(pos, r, src) {
    for (const c of this.camps) {
      if (!c.live || c.gone) continue;
      if (src && src.rcamp === c) { c.lastContact = this.clock; continue; }
      const d = Math.hypot(pos.x - c.x, pos.z - c.z);
      if (d < r) { c.sus = Math.max(c.sus, d < r * 0.5 ? 1 : 0.5); c.alertAt = { x: pos.x, y: pos.y, z: pos.z }; if (d < r * 0.5) this.goHostile(c); else if (c.state === 'calm') { c.state = 'alert'; c.alertT = this.clock; } }
    }
  }
  hurt(m, src) {
    const c = m.rcamp;
    if (m.sleeping && !m.drugged) { m.sleeping = false; m.setAct(null); m.task = null; }
    const pl = this.game.player;
    const witness = c.npcs.some((o) => o !== m && !o.dead && !o.sleeping && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 16);
    if (witness || m.health < 60 || !m.sleeping) this.goHostile(c, m);
    c.grudge += 1;
  }
  provoked(m) { this.hurt(m, this.game.player); }
  onDeath(m, src) {
    const c = m.rcamp;
    if (c) {
      m.rec.dead = true; m.rec.health = 0;
      c.losses++; c.grudge += 2;
      const alive = c.roster.filter((r) => !r.dead).length;
      if (m.boss && alive) { const r = c.roster.find((x) => !x.dead); c.boss = r.person.id; for (const o of c.npcs) o.boss = o.person.id === c.boss; }
      // someone may see it happen
      if (c.npcs.some((o) => o !== m && !o.dead && !o.sleeping && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 14)) this.goHostile(c);
    }
    this.soc.lootables.push({ pos: [m.pos.x, m.pos.y + 0.4, m.pos.z], table: 'raider_body', label: `Search ${m.first}`, searched: false, until: this.clock + 24, extra: dropsOf(m) });
  }
  onSearched(item) {
    if (item.table !== 'raider_stash') return;
    const c = this.camps.find((x) => x.S && x.S.interact.includes(item)) || this.camps.find((x) => x.S && item.owner === x.S);
    if (!c) return;
    c.stashLooted = true; c.grudge += 3; c.known = true;
    this.soc.camp.log(`You cleaned out ${poss(c.name)} stash.`, 'raiders');
    this.soc.missions.onEvent('stash', c);
    // anyone awake nearby notices the stash is open
    if (c.live && c.npcs.some((o) => !o.dead && !o.sleeping && Math.hypot(o.pos.x - this.game.player.pos.x, o.pos.z - this.game.player.pos.z) < 12)) this.goHostile(c);
  }

  // ---------------- one raider's head ----------------
  brain(m, dt, near) {
    const c = m.rcamp;
    m.locked = false;
    if (m.downed) return;
    // flee when it's hopeless
    const alive = c.npcs.filter((o) => !o.dead).length;
    if (m.fleeing || (c.state === 'hostile' && m.health < 30 && (c.losses >= alive || m.tr.bravery < 0.6) && !m.boss)) {
      if (!m.fleeing) { m.fleeing = true; this.say(m, pick(FLEE)); m.rec.dead = true; m.rec.fled = true; }
      const pp = this.game.player.pos, a = Math.atan2(m.pos.z - pp.z, m.pos.x - pp.x);
      if (!m.path) m.goTo(m.pos.x + Math.cos(a) * 40, m.pos.y, m.pos.z + Math.sin(a) * 40, true);
      if (!this.soc.playerNear(m.pos, 60)) m.gone = true;
      return;
    }
    if (m.sleeping && (m.drugged || c.state !== 'hostile')) return this.sleepTick(m);
    if (c.state === 'hostile') {
      const t = this.target(m);
      if (t) { m.ready = true; m.sleeping = false; return this.soc.fight(m, t, dt); }
      // lost them: go where they were last seen
      m.combatTarget = null; m.aiming = false;
      if (c.seen && !m.path && Math.random() < 0.02) m.goTo(c.seen.x + (Math.random() - 0.5) * 6, c.seen.y, c.seen.z + (Math.random() - 0.5) * 6, true);
      return;
    }
    m.combatTarget = null; m.aiming = false;
    if (c.state === 'alert') {
      m.ready = true;
      if (m.task && m.task.slot) { m.task.slot.user = null; }
      m.task = null; m.setAct(null);
      if (c.alertAt) {
        // the two closest go and look, the rest watch that way
        const lookers = c.npcs.filter((o) => !o.dead && !o.sleeping).sort((a, b) => dist(a.pos, c.alertAt) - dist(b.pos, c.alertAt)).slice(0, 2);
        if (lookers.includes(m)) { if (!m.path && dist(m.pos, c.alertAt) > 2) m.goTo(c.alertAt.x, c.alertAt.y, c.alertAt.z); }
        else { m.stop(); m.faceTarget = c.alertAt; }
      }
      return;
    }
    m.ready = false; m.faceTarget = null;
    if (c.distractAt && !m.boss && m.person.seed % 5 !== 0) {
      if (m.task && m.task.slot) m.task.slot.user = null;
      m.task = null; m.setAct(null);
      if (!m.path && dist(m.pos, c.distractAt) > 4) m.goTo(c.distractAt.x + (m.person.seed % 7) - 3, c.distractAt.y, c.distractAt.z + (m.person.seed % 5) - 2, true);
      if (!m.path) { m.faceTarget = c.distractAt; m.setAct('idle_crossed'); }
      return;
    }
    if (c.inside && this.clock < c.inside.until) {
      // everyone gathers to hear the newcomer talk
      const guest = c.inside.npc;
      if (guest && !guest.dead && dist(guest.pos, c) < 6) {
        if (m.task && m.task.slot) m.task.slot.user = null;
        m.task = null;
        const a = (m.person.seed % 360) * Math.PI / 180;
        const gx = guest.pos.x + Math.cos(a) * 2.2, gz = guest.pos.z + Math.sin(a) * 2.2;
        if (!m.path && Math.hypot(m.pos.x - gx, m.pos.z - gz) > 0.8) m.goTo(gx, guest.pos.y, gz);
        if (!m.path) { m.faceTarget = guest.pos; m.lookAt = guest.pos; m.setAct(m.boss ? 'idle_hips' : 'listen'); }
        return;
      }
    }
    // ordinary camp life
    const t = m.task;
    if (!t || this.clock > t.until) return this.chooseTask(m);
    if (t.stage === 'go') { if (!m.path) { if (dist(m.pos, t) < 0.7) this.begin(m); else m.goTo(t.x, t.y, t.z); } return; }
    if (t.route && !m.path) { t.ri = (t.ri + 1) % t.route.length; const p = t.route[t.ri]; m.goTo(p.x, p.y, p.z); }
    if (m.convo) { m.locked = true; m.lookAt = m.convo.other.pos; m.faceTarget = m.convo.other.pos; }
  }
  sleepTick(m) {
    m.combatTarget = null; m.aiming = false;
    if (!m.anim.lie) {
      const t = m.task;
      m.setAct('sleep', null, 0, true, t && t.slot ? t.slot.y : m.pos.y);
    }
  }
  target(m) {
    const pl = this.game.player;
    let best = null, bd = 40;
    if (!pl.dead && !pl.released) { const d = dist(m.pos, pl.pos); if (d < bd) { best = pl; bd = d; } }
    for (const o of this.soc.npcs) {
      if (o.dead || o.downed || o.faction === 'raider' || o.mode === 'away' || o.controlled) continue;
      if (o.faction === 'stranger' && !o.angry) continue;
      const d = dist(m.pos, o.pos);
      if (d < bd) { best = o; bd = d; }
    }
    if (best) this.camps.forEach((c) => { if (c === m.rcamp) c.lastContact = this.clock; });
    return best;
  }
  chooseTask(m) {
    const c = m.rcamp;
    if (m.task && m.task.slot && m.task.slot.user === m) m.task.slot.user = null;
    m.task = null; m.setAct(null); m.sleeping = false; m.taskFace = null;
    const h = this.game.sky.time, night = this.night();
    const idx = c.npcs.filter((o) => !o.dead).indexOf(m);
    const nightWatch = this.modOn(c, 'night') ? 1 : Math.min(2, Math.ceil(c.npcs.length / 5));
    const shift = Math.floor(((h + 2) % 24) / 2.5);
    const onWatch = night && !this.modOn(c, 'drugged') && ((idx + shift) % c.npcs.length) < nightWatch;
    const slots = c.stations.flatMap((st) => st.slots.map((sl) => ({ st, sl }))).filter(({ sl }) => !sl.user || sl.user === m);
    const choose = (pred) => { const ok = slots.filter(pred); return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null; };
    if (night && !onWatch) {
      const bed = choose(({ st, sl }) => st.type === 'tent' && sl.bed);
      if (bed) return this.assign(m, { slot: bed.sl, opt: bed.sl.opts[0], dur: 2, sleep: true });
    }
    if (onWatch || (!night && Math.random() < 0.18)) {
      const post = choose(({ st }) => st.type === 'lookout');
      if (post && Math.random() < 0.6) {
        // the night-raid plan: the guard dozes off at his post
        const doze = this.modOn(c, 'night') && this.game.sky.time > 1 && this.game.sky.time < 5;
        return this.assign(m, { slot: post.sl, opt: doze ? { act: 'sit_ground', tags: [], seatH: 0 } : post.sl.opts[0], dur: 0.8, doze });
      }
      return this.assign(m, { route: this.ring(c, m), act: 'guard', item: m.weapon === 'gun' ? 'rifle' : null, dur: 0.6 });
    }
    const w = { fire: 3, bench: 2, crate: 0.8, smoke: m.smoker ? 1.2 : 0, drink: 1.4, stand: 1, wander: 0.6, patrol: 0.6 };
    if (h > 18 || h < 2) { w.fire += 3; w.drink += 1.5; }
    const k = weighted(w);
    if (k === 'fire') { const s = choose(({ st }) => st.type === 'campfire'); if (s) return this.assign(m, { slot: s.sl, opt: s.sl.opts[Math.floor(Math.random() * 4) === 0 ? 3 : Math.floor(Math.random() * 2)], dur: 0.6 }); }
    if (k === 'bench') { const s = choose(({ st }) => st.type === 'log_bench'); if (s) return this.assign(m, { slot: s.sl, opt: s.sl.opts[Math.random() < 0.5 ? 0 : 3], dur: 0.6 }); }
    if (k === 'crate') { const s = choose(({ st }) => st.type === 'crate'); if (s) return this.assign(m, { slot: s.sl, opt: s.sl.opts[0], dur: 0.3 }); }
    if (k === 'patrol') return this.assign(m, { route: this.ring(c, m), act: 'guard', item: m.weapon === 'gun' ? 'rifle' : null, dur: 0.4 });
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    const act = k === 'smoke' ? 'smoke' : k === 'drink' ? 'drink' : ['idle_crossed', 'idle_hips', 'idle_pockets', 'lean', 'stretch'][Math.floor(Math.random() * 5)];
    return this.assign(m, { x, y: this.game.world.terrain.height(x, z), z, act, item: act === 'smoke' ? 'cigarette' : act === 'drink' ? 'bottle' : null, dur: 0.3 });
  }
  ring(c, m) {
    const tr = this.game.world.terrain, out = [];
    const a0 = (m.person.seed % 628) / 100;
    for (let i = 0; i < 5; i++) { const a = a0 + i * 1.25, x = c.x + Math.cos(a) * 11.5, z = c.z + Math.sin(a) * 11.5; out.push({ x, y: tr.height(x, z), z }); }
    return out;
  }
  assign(m, t) {
    t.until = this.clock + t.dur * (0.7 + Math.random() * 0.6);
    if (t.slot) {
      t.slot.user = m;
      t.x = t.slot.x; t.y = t.slot.ground; t.z = t.slot.z;
      t.act = t.opt.act; t.item = t.opt.item || null; t.seatH = t.opt.seatH || 0; t.face = t.slot.face; t.lie = !!t.opt.lie;
      if (t.act === 'drink' || t.act === 'sit_drink') t.item = 'bottle';
    } else if (t.route) { t.ri = 0; Object.assign(t, { x: t.route[0].x, y: t.route[0].y, z: t.route[0].z }); }
    t.stage = 'go';
    m.task = t;
    m.goTo(t.x, t.y, t.z);
  }
  begin(m) {
    const t = m.task;
    t.stage = 'do';
    m.stop();
    if (t.slot) { m.pos.x = t.slot.x; m.pos.z = t.slot.z; m.facing = t.face; m.taskFace = t.face; }
    if (t.sleep) { m.sleeping = true; m.setAct('sleep', null, 0, true, t.slot.y); return; }
    if (t.doze) m.sleeping = true;
    m.setAct(t.act, t.item, t.seatH || 0);
    if (t.route) m.setAct(null);
  }
  chatter(c) {
    const free = c.npcs.filter((m) => !m.dead && !m.sleeping && m.task && m.task.stage === 'do' && !m.task.route);
    if (!free.length || !this.soc.playerNear(c, 45)) return;
    // two of them talk if they're close; otherwise one grumbles
    let pair = null;
    for (const a of free) for (const b of free) if (a !== b && dist(a.pos, b.pos) < 5) pair = [a, b];
    if (pair && Math.random() < 0.6) {
      const [a, b] = pair;
      const lines = Math.random() < 0.45
        ? [{ who: a, text: pick(CHATTER) }, { who: b, text: this.soc.speech.line(b, Math.random() < 0.5 ? 'agree' : 'disagree', { you: a.person.name }) }]
        : this.soc.speech.conversation(a, b, { player: 'that stranger', camp: c.name, others: c.npcs.filter((x) => !x.dead), raiders: false });
      this.script(c, a, b, lines);
    } else {
      const m = free[Math.floor(Math.random() * free.length)];
      this.say(m, Math.random() < 0.6 ? pick(CHATTER) : this.soc.speech.flavor(m));
    }
  }
  script(c, a, b, lines) {
    let i = 0;
    a.convo = { other: b }; b.convo = { other: a };
    const next = () => {
      if (i >= lines.length || c.state !== 'calm' || a.dead || b.dead) { a.convo = null; b.convo = null; return; }
      const L = lines[i++];
      if (L && L.text) this.say(L.who, L.text);
      for (const [x, y, d] of lines.effects || []) if (i === lines.length) x.adjust(y.person.id, d);
      setTimeout(next, Math.min(7000, 2300 + (L && L.text ? L.text.length * 50 : 0)));
    };
    next();
  }
  say(m, text) {
    if (!text || m.dead) return;
    m.say(text);
  }

  // ---------------- raids on your camp ----------------
  planRaid() {
    const g = this.game, camp = this.soc.camp;
    if (!camp.claim || g.day < 3) return;
    for (const c of this.active) {
      if (c.raidAt || c.gone) continue;
      const alive = c.roster.filter((r) => !r.dead).length;
      if (alive < 4) continue;
      // they come for you if you hurt them, or if you look rich
      const rich = g.inventory.res.food + g.inventory.res.ammo / 3 + g.inventory.res.meds * 2;
      const chance = c.grudge * 0.08 + (rich > 30 ? 0.04 : 0) + (g.day > 5 ? 0.03 : 0);
      if (Math.random() < chance * 3 / 24) {
        const night = Math.floor(this.clock / 24) * 24 + 24 + 1 + Math.random() * 3;
        c.raidAt = night;
        c.grudge = Math.max(0, c.grudge - 2);
        // a guard or a stranger's rumor might warn you
        const scout = camp.members.find((m) => !m.dead && (m.role === 'guard' || m.role === 'hunter' || m.skill('stealth') >= 2));
        if (scout) { camp.log(`${scout.person.name} spotted ${c.name} scouting the camp. They may be planning something.`, 'raiders'); this.soc.notice(`${scout.first}: "We're being watched. ${cap(c.name)}."`); }
      }
    }
    for (const c of this.active) if (c.raidAt && this.clock > c.raidAt) { c.raidAt = null; this.launchRaid(c); }
  }
  launchRaid(c) {
    const g = this.game, camp = this.soc.camp, ctr = camp.center();
    if (!ctr) return;
    const pool = c.roster.filter((r) => !r.dead);
    const n = Math.min(pool.length - 1, 3 + Math.floor(Math.random() * 3));
    if (n < 2) return;
    const party = pool.sort(() => Math.random() - 0.5).slice(0, n);
    const pd = Math.hypot(g.player.pos.x - ctr.x, g.player.pos.z - ctr.z);
    if (pd > 150) return this.abstractRaid(c, party);
    if (c.live) for (const m of c.npcs.filter((x) => party.includes(x.rec))) { this.soc.drop(m); c.npcs = c.npcs.filter((x) => x !== m); }
    const a = Math.atan2(c.z - ctr.z, c.x - ctr.x);
    const P = { camp: c, npcs: [], until: this.clock + 3 };
    party.forEach((r, i) => {
      const x = ctr.x + Math.cos(a + (i - n / 2) * 0.12) * 42, z = ctr.z + Math.sin(a + (i - n / 2) * 0.12) * 42;
      const m = this.soc.spawn(r.person, { x, z, faction: 'raider', mode: 'raider', weapon: r.weapon, gunId: r.gun || 'ak' });
      m.health = r.health; m.rec = r; m.rcamp = null; m.party = P; m.raiding = true;
      Object.defineProperty(m, 'isHostile', { get: () => true });
      m.brain = (dt) => this.partyBrain(m, dt);
      m.onHurt = () => {};
      P.npcs.push(m);
    });
    this.parties.push(P);
    camp.log(`${cap(c.name)} came at the camp in the night.`, 'raid', { who: [], crew: c.name });
    const g2 = camp.members.find((m) => !m.dead && m.mode === 'camp' && !m.sleeping) || camp.members.find((m) => !m.dead && m.mode === 'camp');
    if (g2) { g2.sleeping = false; g2.say('Raiders! On the road! Everybody up!'); }
    this.soc.notice(`Raiders! ${cap(c.name)} is attacking your camp.`);
    for (const m of camp.members) if (m.sleeping && Math.random() < 0.8) { m.sleeping = false; m.task = null; m.setAct(null); }
  }
  partyBrain(m, dt) {
    const P = m.party, ctr = this.soc.camp.center();
    m.locked = false;
    const alive = P.npcs.filter((o) => !o.dead && !o.gone).length;
    if (m.fleeing || this.clock > P.until || alive <= Math.ceil(P.npcs.length / 3) || m.health < 25) {
      if (!m.fleeing) { m.fleeing = true; this.say(m, pick(FLEE)); }
      const a = Math.atan2(m.pos.z - ctr.z, m.pos.x - ctr.x);
      if (!m.path) m.goTo(m.pos.x + Math.cos(a) * 50, m.pos.y, m.pos.z + Math.sin(a) * 50, true);
      if (!this.soc.playerNear(m.pos, 70) || dist(m.pos, ctr) > 70) m.gone = true;
      return;
    }
    const t = this.target(m);
    if (t && dist(t.pos, m.pos) < 30) return this.soc.fight(m, t, dt);
    m.combatTarget = null;
    // grab what they can
    if (dist(m.pos, ctr) < 4 && !m.stole) {
      m.stole = true;
      const inv = this.game.inventory, took = {};
      for (const k of ['food', 'ammo', 'meds', 'fuel']) { const n = Math.min(inv.res[k], 1 + Math.floor(Math.random() * 3)); if (n > 0) { inv.res[k] -= n; took[k] = n; } }
      if (Object.keys(took).length) this.soc.camp.log(`${m.person.name} of ${P.camp.name} grabbed ${Object.entries(took).map(([k, v]) => v + ' ' + k).join(', ')}.`, 'raid');
      m.fleeing = true;
      return;
    }
    if (!m.path) m.goTo(ctr.x + (Math.random() - 0.5) * 4, ctr.y, ctr.z + (Math.random() - 0.5) * 4, true);
  }
  updateParties(dt) {
    for (const P of this.parties) {
      for (const m of P.npcs) if (m.gone && !m.dead) { m.rec.health = m.health; }
      if (P.npcs.every((m) => m.dead || m.gone)) {
        P.done = true;
        const dead = P.npcs.filter((m) => m.dead).length;
        this.soc.camp.log(dead ? `The raid is over. ${dead} of ${P.camp.name} won't be going home.` : `The raiders pulled back.`, 'raid');
        for (const m of this.soc.camp.members) if (!m.dead) { m.needs.stress = Math.min(100, m.needs.stress + 15); m.afterAttack = this.clock; }
        const s = this.soc.camp.members.find((m) => !m.dead && m.mode === 'camp');
        s && s.say(this.soc.speech.line(s, 'r_after_attack'));
      }
    }
    this.parties = this.parties.filter((P) => !P.done);
  }
  // you weren't there: how it went depends on who was
  abstractRaid(c, party) {
    const camp = this.soc.camp, inv = this.game.inventory;
    const home = camp.members.filter((m) => !m.dead && m.mode === 'camp');
    const def = home.reduce((s, m) => s + 1 + m.skill('combat') * 0.5 + m.skill('shooting') * 0.5 + (m.role === 'guard' ? 1.5 : 0), 0);
    const att = party.reduce((s, r) => s + 1.6 + (r.weapon === 'gun' ? 0.6 : 0), 0);
    const won = def + Math.random() * 3 > att;
    if (won) {
      const k = Math.random() < 0.6 ? 1 : 0;
      for (let i = 0; i < k; i++) { const r = party[i]; r.dead = true; }
      camp.log(`While you were away, ${c.name} hit the camp. ${home.map((m) => m.first).slice(0, 3).join(', ')} drove them off${k ? ' and one of them didn’t make it back' : ''}.`, 'raid');
      const hurt = home[Math.floor(Math.random() * home.length)];
      if (hurt) hurt.health = Math.max(20, hurt.health - 30);
    } else {
      const took = {};
      for (const k of ['food', 'ammo', 'meds', 'fuel', 'metal']) { const n = Math.floor(inv.res[k] * (0.2 + Math.random() * 0.25)); if (n > 0) { inv.res[k] -= n; took[k] = n; } }
      camp.log(`While you were away, ${c.name} raided the camp and took ${Object.entries(took).map(([k, v]) => v + ' ' + k).join(', ') || 'what little we had'}.`, 'raid');
      for (const m of home) { m.health = Math.max(15, m.health - 20 - Math.random() * 25); m.needs.stress = Math.min(100, m.needs.stress + 30); }
    }
    this.soc.notice(`Bad news from camp: ${c.name} attacked while you were gone.`);
  }

  // ---------------- saving ----------------
  toJSON() {
    for (const c of this.camps) if (c.live) for (const m of c.npcs) m.rec.health = m.dead ? 0 : m.health;
    return this.camps.map((c) => ({
      id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, Sid: c.Sid, roster: c.roster.map((r) => ({ person: { ...r.person, rels: undefined }, health: Math.round(r.health), dead: r.dead, weapon: r.weapon, gun: r.gun })),
      known: c.known, scouted: c.scouted, mods: c.mods, stashLooted: c.stashLooted, grownDay: c.grownDay, losses: c.losses, grudge: c.grudge, boss: c.boss, tents: c.tents, gone: c.gone, raidAt: c.raidAt,
    }));
  }
  load(list) {
    const w = this.game.world;
    for (const j of list) {
      const S = w.structures.find((s) => s.id === j.Sid);
      if (!S) continue;
      w.clearVegetation(j.x - 12, j.z - 12, j.x + 12, j.z + 12);
      const c = { ...j, S, state: 'calm', sus: 0, live: false, npcs: [] };
      S.raider = c.id;
      c.stations = stationsFor(S);
      this.camps.push(c);
    }
    this.nameI += this.camps.length;
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
// what someone had on them: their gun (loaded as it was) and their ammo
export function dropsOf(m) {
  const out = [];
  const g = m.gear && m.gear.gun;
  if (g) out.push({ kind: 'gun', id: g.id, n: 1, mag: g.mag });
  for (const [id, n] of Object.entries(m.pack ? m.pack.ammo : {})) if (n > 0) out.push({ kind: 'ammo', id, n });
  return out;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// the Saints' stash, the Red Hand's stash
export function poss(n) { return /s$/.test(n) ? n + '\u2019' : n + '\u2019s'; }

// quarter turns so a prop's front (+Z) points along (dx, dz)
export function rotTo(dx, dz) {
  const a = Math.atan2(dx, dz);
  return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
}
export function compass(dx, dz) {
  const a = Math.atan2(dx, -dz) * 180 / Math.PI;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][((Math.round(a / 45) % 8) + 8) % 8];
}
export { cap };
