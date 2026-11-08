// Plans survivors pitch from their own lives: a cache they know about, a
// thing they want built at camp, or a way to rob a raider crew (a night
// raid when the watch gets sloppy, drugged liquor, a distraction, a man on
// the inside, a scouting run, an ambush on the highway).
import { Structure } from '../building/structure.js';
import { CELL, STORY } from '../building/defs.js';
import { compass, cap, poss } from './raiders.js';

export const BUILD_TYPES = { grill: 'grill', garden: 'garden_bed', medcot: 'medcot', workbench: 'workbench', lookout: 'lookout', shelf: 'metal_shelf', table: 'table', chopping: 'chopping_block', campfire: 'log_bench' };
const BUILD_NAMES = { grill: 'a grill', garden: 'a garden bed', medcot: 'a medical cot', workbench: 'a workbench', lookout: 'a lookout post', shelf: 'a storage shelf', table: 'a table', chopping: 'a chopping block', campfire: 'a log bench by the fire' };
const MOD_TITLE = { night: 'Night raid on {c}', drugged: 'Spike {cs} liquor', distraction: 'Draw {c} away', inside: 'Inside job on {c}', scout: 'Scout {c}', ambush: 'Ambush {cs} supply run' };
const ITEM_NAMES = { sedatives: 'sedatives', liquor: 'whiskey', seeds: 'seed stock' };

export class Missions {
  constructor(soc) {
    this.soc = soc; this.game = soc.game;
    this.list = [];
    this.done = new Set();
    this.n = 1;
  }
  get clock() { return this.soc.clock; }
  get active() { return this.list.filter((m) => m.state === 'active'); }
  key(bg, i) { return bg + ':' + i; }
  // the next plan this person could pitch
  ideaFor(m, opts = {}) {
    const bg = m.bg;
    if (!bg || !bg.ideas) return null;
    for (let i = 0; i < bg.ideas.length; i++) {
      const idea = bg.ideas[i], k = this.key(bg.id, i);
      if (this.done.has(k) || this.list.some((x) => x.key === k && x.state !== 'failed')) continue;
      if (opts.strangers && (idea.kind === 'build' || (idea.kind === 'raidmod' && !['night', 'scout', 'ambush'].includes(idea.mod)))) continue;
      if (!this.feasible(idea, m)) continue;
      return { key: k, idea, i, from: m };
    }
    return null;
  }
  feasible(idea, m) {
    if (idea.kind === 'cache') return !!this.placeOf(idea.at);
    if (idea.kind === 'build') return !!this.soc.camp.claim && !this.hasProp(BUILD_TYPES[idea.what]);
    if (idea.kind === 'raidmod') return !!this.raiderTarget(m);
    return false;
  }
  raiderTarget(m) {
    const ref = this.soc.camp.center() || this.game.player.pos;
    const list = this.soc.raiders.active.filter((c) => !c.stashLooted && (c.known || m.faction === 'camp'));
    list.sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z));
    return list[0] || null;
  }
  hasProp(type) {
    const c = this.soc.camp.claim;
    return !!c && c.structure.props.some((p) => p.type === type);
  }
  // where a place is: a storefront sign, or a spot on the map
  placeOf(at) {
    const w = this.game.world;
    if (typeof at === 'string') {
      for (const S of w.structures) {
        const sp = S.props.find((p) => p.type === 'anchor_sign' && p.text === at);
        if (!sp) continue;
        const b = S._bb || (S._bb = S.bounds());
        return { S, sign: sp, x: (b.wx0 + b.wx1) / 2, y: S.oy, z: (b.wz0 + b.wz1) / 2 };
      }
      return null;
    }
    if (Array.isArray(at)) return { x: at[0], y: w.terrain.height(at[0], at[1]), z: at[1] };
    return null;
  }

  // ---------------- taking a plan on ----------------
  accept(rec) {
    const { idea, from } = rec;
    const m = { id: 'M' + this.n++, key: rec.key, kind: idea.kind, from: from.person.id, fromName: from.person.name, fromFaction: from.faction, text: idea.text, state: 'active', at: null, started: this.clock };
    if (idea.kind === 'cache') {
      const pl = this.placeOf(idea.at);
      m.title = idea.label; m.table = idea.table; m.give = idea.give || null;
      const cr = this.placeCache(pl, m);
      if (!cr) return null;
      m.at = cr;
      m.step = `Find ${idea.label.replace(/^[A-Z]/, (c) => c.toLowerCase())} (${this.dirTo(cr)})`;
    } else if (idea.kind === 'build') {
      m.what = idea.what; m.prop = BUILD_TYPES[idea.what];
      m.title = `Build ${BUILD_NAMES[idea.what]} for ${from.first}`;
      m.step = `Build ${BUILD_NAMES[idea.what]} at camp (build mode, Furniture)`;
    } else if (idea.kind === 'raidmod') {
      const c = this.raiderTarget(from);
      if (!c) return null;
      c.known = true;
      m.mod = idea.mod; m.camp = c.id; m.campName = c.name; m.needs = idea.needs || null;
      m.title = MOD_TITLE[idea.mod].replace('{cs}', poss(c.name)).replace('{c}', c.name);
      m.at = { x: c.x, y: c.y, z: c.z };
      this.armRaid(m, c, from);
    }
    this.list.push(m);
    this.soc.camp.log(`${from.person.name}’s plan: ${m.title}.`, 'plan');
    from.adjust('player', 0.05);
    this.game.markDirty && this.game.markDirty();
    return m;
  }
  dirTo(p) {
    const pp = this.game.player.pos, d = Math.hypot(p.x - pp.x, p.z - pp.z);
    return `${Math.round(d / 10) * 10} m ${compass(p.x - pp.x, p.z - pp.z)}`;
  }
  // a crate where they said it would be
  placeCache(pl, m) {
    const w = this.game.world, ph = this.game.physics;
    if (pl.S) {
      const S = pl.S, sx = S.ox + pl.sign.x, sz = S.oz + pl.sign.z;
      let best = null, bs = -1;
      for (const k of S.floors.keys()) {
        const [fx, fz, l] = k.split(',').map(Number);
        if (l !== 0) continue;
        if ([...S.stairs.keys()].some((s) => s.startsWith(`${fx},${fz},`))) continue;
        const x = S.ox + fx * CELL + CELL / 2, z = S.oz + fz * CELL + CELL / 2, y = S.oy;
        const boxes = ph.query(x - 0.55, z - 0.55, x + 0.55, z + 0.55, []);
        if (boxes.some((b) => b.max[1] > y + 0.2 && b.min[1] < y + 1.8 && b.kind !== 'floor' && b.kind !== 'walk')) continue;
        const d = Math.hypot(x - sx, z - sz);
        if (d > bs) { bs = d; best = { x, y, z, fx, fz }; }
      }
      if (best) {
        const p = S.addProp('crate', best.x - S.ox, 0, best.z - S.oz, 0, { loot: m.table, label: m.title, mission: m.id, s: 0.85 });
        S.modified = true;
        w.attach(S);
        return { x: best.x, y: best.y, z: best.z };
      }
    }
    // out in the open: a crate and a drum by the road
    const tr = w.terrain;
    let at = null;
    for (let r = 0; r < 14 && !at; r += 1.5) for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r, h = tr.height(x, z);
      if (w.roadDist && w.roadDist(x, z) < 4.2) continue;
      if (ph.query(x - 1.3, z - 1.3, x + 1.3, z + 1.3, []).some((b) => b.max[1] > h + 0.25 && b.kind !== 'walk')) continue;
      at = { x, y: h, z }; break;
    }
    if (!at) return null;
    const S = new Structure({ name: m.title, kind: 'site', ox: at.x - 2, oz: at.z - 2, oy: Math.round(at.y * 4) / 4 });
    S.addProp('crate', 2, at.y - S.oy - 0.03, 2, 0, { loot: m.table, label: m.title, mission: m.id, s: 0.9 });
    S.addProp('drum', 3.2, tr.height(at.x + 1.2, at.z + 0.3) - S.oy - 0.03, 2.3, 0);
    S.playerBuilt = true;
    w.structures.push(S);
    w.attach(S);
    return at;
  }
  // the different ways to rob a crew
  armRaid(m, c, from) {
    const night0 = Math.floor(this.clock / 24) * 24;
    const inv = this.game.inventory;
    if (m.mod === 'night') {
      c.mods.night = { from: this.clock, to: this.clock + 96 };
      m.step = `Hit ${c.name} between 1 and 5 AM, when their watch dozes (${this.dirTo(c)})`;
    } else if (m.mod === 'drugged') {
      m.step = `Bring ${from.first} sedatives (or 3 meds) to spike ${poss(c.name)} liquor`;
      m.waiting = 'sedatives';
      this.tryDrug(m, c, from);
    } else if (m.mod === 'distraction') {
      m.step = `Get within 60 m of ${c.name} with 1 fuel; ${from.first} will start the fire (${this.dirTo(c)})`;
      m.waiting = 'fuel';
    } else if (m.mod === 'inside') {
      m.step = `Bring ${from.first} along to ${poss(c.name)} camp, then go for the stash while they talk`;
      m.waiting = 'inside';
    } else if (m.mod === 'scout') {
      if (from.faction === 'camp') {
        from.mode = 'away'; from.awayUntil = this.clock + 4; from.task = null; from.scouting = m.id;
        m.step = `${from.first} is scouting ${c.name}. Back in about 4 hours`;
        m.waiting = 'scout';
      } else { this.scouted(m, c); }
    } else if (m.mod === 'ambush') {
      m.step = `Be on Highway 34 near ${c.name} between 5 and 7 AM`;
      m.ambush = this.ambushPoint(c);
      m.at = m.ambush;
      m.waiting = 'ambush';
    }
  }
  tryDrug(m, c, from) {
    const inv = this.game.inventory;
    const has = (inv.items && inv.items.sedatives > 0) || inv.res.meds >= 3;
    if (!has) return false;
    if (inv.items && inv.items.sedatives > 0) inv.items.sedatives--; else inv.res.meds -= 3;
    const day0 = Math.floor(this.clock / 24) * 24;
    const from22 = this.clock < day0 + 21 ? day0 + 22 : day0 + 24 + 22;
    c.mods.drugged = { from: from22, to: from22 + 8 };
    m.waiting = null;
    m.step = `${c.name} will be out cold from 10 PM to 6 AM tonight. Go for the stash`;
    this.soc.notice(`${from.first} got the spiked bottles to ${c.name}. Tonight, they sleep.`);
    return true;
  }
  scouted(m, c) {
    c.scouted = true; c.known = true;
    const n = c.roster.filter((r) => !r.dead).length;
    const guns = c.roster.filter((r) => !r.dead && r.weapon === 'gun').length;
    m.step = `${c.name}: ${n} people, ${guns} with guns. Stash by the big tent. Their watch is easier to slip now`;
    m.waiting = null;
    this.complete(m, `Scouted ${c.name}: ${n} people, ${guns} armed. Their stash sits by the boss’s tent.`);
  }
  ambushPoint(c) {
    const rs = this.game.world.roadSamples || [];
    let best = null, bd = Infinity;
    for (const r of rs) for (const p of r.samples) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd && d > 50) { bd = d; best = p; } }
    return best ? { x: best.x, y: this.game.world.terrain.height(best.x, best.z), z: best.z } : { x: c.x + 60, y: c.y, z: c.z };
  }

  // ---------------- progress ----------------
  update(dt) {
    this.t = (this.t || 0) - dt;
    if (this.t > 0) return;
    this.t = 1;
    const pp = this.game.player.pos;
    for (const m of this.active) {
      const from = this.soc.npcs.find((n) => n.person.id === m.from && !n.dead);
      const c = m.camp && this.soc.raiders.camps.find((x) => x.id === m.camp);
      if (m.kind === 'build' && this.hasProp(m.prop)) this.complete(m, `${m.fromName} got the ${m.prop.replace('_', ' ')} they wanted.`);
      if (!c && m.kind === 'raidmod') { this.fail(m, 'The crew is gone.'); continue; }
      if (c && c.gone) { this.complete(m, `${cap(c.name)} is finished.`); continue; }
      if (m.waiting === 'sedatives' && from) this.tryDrug(m, c, from);
      if (m.waiting === 'fuel' && Math.hypot(pp.x - c.x, pp.z - c.z) < 60 && this.game.inventory.res.fuel >= 1) this.startDistraction(m, c, from);
      if (m.waiting === 'inside' && from && from.mode === 'follow' && Math.hypot(from.pos.x - c.x, from.pos.z - c.z) < 45 && c.live && c.state === 'calm') this.startInside(m, c, from);
      if (m.waiting === 'scout' && from && from.mode !== 'away') { from.scouting = null; this.scouted(m, c); from.say(`Counted them. ${c.roster.filter((r) => !r.dead).length} people. I know where they sleep.`); }
      if (m.waiting === 'ambush') this.checkAmbush(m, c);
      if (m.insideNpc) this.updateInside(m, c);
      if (m.distractFire && this.clock > m.distractFire.until) { this.removeSite(m.distractFire.S); m.distractFire = null; }
    }
  }
  startDistraction(m, c, from) {
    this.game.inventory.res.fuel -= 1;
    m.waiting = null;
    const pp = this.game.player.pos, tr = this.game.world.terrain;
    // on the far side from you
    const a = Math.atan2(c.z - pp.z, c.x - pp.x);
    const x = c.x + Math.cos(a) * 38, z = c.z + Math.sin(a) * 38, y = tr.height(x, z);
    const S = new Structure({ name: 'fire', kind: 'site', ox: x - 2, oz: z - 2, oy: Math.round(y * 4) / 4 });
    S.addProp('campfire', 2, y - S.oy - 0.03, 2, 0);
    S.addProp('drum', 2.9, tr.height(x + 0.9, z) - S.oy - 0.03, 2, 0);
    this.game.world.structures.push(S);
    this.game.world.attach(S);
    m.distractFire = { S, until: this.clock + 3 };
    c.distractAt = { x, y, z }; c.distractUntil = this.clock + 2.5;
    this.game.zombies.alertNoise({ x, y, z, clone() { return { x, y, z }; }, distanceTo(o) { return Math.hypot(o.x - x, o.z - z); } }, 80);
    this.game.audio && this.game.audio.bang();
    m.step = `The fire is burning ${compass(x - c.x, z - c.z)} of ${c.name}. Get to the stash while they’re away`;
    this.soc.notice(`${from ? from.first + '’s' : 'The'} fire went up ${compass(x - c.x, z - c.z)} of ${c.name}. They’re running to it.`);
  }
  startInside(m, c, from) {
    m.waiting = null;
    m.insideNpc = from;
    from.mode = 'inside';
    from.guest = c;
    c.inside = { npc: from, until: this.clock + 3 };
    from.brain = (dt) => {
      from.locked = false;
      if (c.state === 'hostile') { from.mode = 'follow'; from.brain = (d2, n2) => this.soc.camp.brain(from, d2, n2); return; }
      const d = Math.hypot(from.pos.x - c.x, from.pos.z - c.z);
      if (d > 3) { if (!from.path) from.goTo(c.x + 1.5, c.y, c.z + 1.5); return; }
      from.stop();
      const boss = c.npcs.find((x) => x.boss && !x.dead);
      if (boss) { from.faceTarget = boss.pos; from.lookAt = boss.pos; }
      from.talkT = (from.talkT || 0) - dt;
      if (from.talkT <= 0) {
        from.talkT = 5 + Math.random() * 3;
        const lines = ['Easy, easy. I’m just here to trade.', 'Heard you boys might want some whiskey. I know where there’s a truck full.', 'Remember Bonne Terre? Cell block C? Yeah. That was me.', 'Pull up a log. This is a long story.', 'No, no, the best part is what happened after.'];
        from.say(lines[Math.floor(Math.random() * lines.length)]);
        if (boss && Math.random() < 0.6) setTimeout(() => !boss.dead && c.state === 'calm' && boss.say(['Ha! Go on.', 'You’re full of it.', 'Keep talking.', 'And then what?'][Math.floor(Math.random() * 4)]), 2600);
      }
    };
    from.say(`I'll keep them talking. Go.`);
    m.step = `${from.first} is talking to ${c.name}. Get to their stash, quietly`;
  }
  updateInside(m, c) {
    const n = m.insideNpc;
    if (!n || n.dead || c.state === 'hostile' || this.clock > c.inside.until || c.stashLooted) {
      if (n && !n.dead) {
        n.guest = null; c.inside = null;
        n.mode = 'follow';
        n.brain = (dt, near) => this.soc.camp.brain(n, dt, near);
        if (c.state !== 'hostile') n.say('Well, boys, I best be going. Pleasure.');
      }
      m.insideNpc = null;
      if (!c.stashLooted && m.state === 'active') { m.waiting = 'inside'; m.step = `Try again: bring ${m.fromName.split(' ')[0]} back to ${c.name} while it’s calm`; }
    }
  }
  checkAmbush(m, c) {
    const h = this.game.sky.time, pp = this.game.player.pos, a = m.ambush;
    if (m.convoy) {
      if (m.convoy.every((x) => x.dead || x.gone)) {
        const dead = m.convoy.filter((x) => x.dead).length;
        for (const x of m.convoy) if (x.dead) this.soc.lootables.push({ pos: [x.pos.x, x.pos.y + 0.4, x.pos.z], table: 'supply_run', label: `${x.first}’s pack`, searched: false, until: this.clock + 24 });
        m.convoy = null;
        if (dead) this.complete(m, `You hit ${poss(c.name)} supply run on the highway.`);
        else { m.step = `They got away. Try again at dawn`; }
      }
      return;
    }
    if (h < 5 || h > 7 || Math.hypot(pp.x - a.x, pp.z - a.z) > 110 || m.lastTry === this.game.day) return;
    m.lastTry = this.game.day;
    const pool = c.roster.filter((r) => !r.dead).slice(0, 3);
    if (pool.length < 1) return;
    m.convoy = [];
    const dir = Math.atan2(a.z - c.z, a.x - c.x);
    const target = { x: a.x + Math.cos(dir) * 120, z: a.z + Math.sin(dir) * 120 };
    pool.forEach((r, i) => {
      if (c.live) { const live = c.npcs.find((x) => x.rec === r); if (live) { this.soc.drop(live); c.npcs = c.npcs.filter((x) => x !== live); } }
      const sx = a.x - Math.cos(dir) * (40 + i * 2.5), sz = a.z - Math.sin(dir) * (40 + i * 2.5);
      const x = this.soc.spawn(r.person, { x: sx, z: sz, faction: 'raider', mode: 'raider', weapon: r.weapon });
      x.rec = r; x.health = r.health;
      let seen = false;
      Object.defineProperty(x, 'isHostile', { get: () => seen });
      x.brain = (dt) => {
        x.locked = false;
        const p2 = this.game.player.pos, d = Math.hypot(p2.x - x.pos.x, p2.z - x.pos.z);
        if (!seen && (d < 18 && this.soc.clear(x.pos, p2) || x.health < 100)) { seen = true; x.say(['Ambush!', 'Drop the crates! Shoot!', 'It’s a setup!'][i % 3]); }
        if (seen) { const t = this.soc.raiders.target(x); if (t) return this.soc.fight(x, t, dt); }
        x.setAct('carry', 'crate');
        if (!x.path) x.goTo(target.x, this.game.world.terrain.height(target.x, target.z), target.z);
        if (!this.soc.playerNear(x.pos, 150)) x.gone = true;
      };
      x.onHurt = () => { seen = true; };
      m.convoy.push(x);
    });
    this.soc.notice(`Engines… no, footsteps. ${cap(poss(c.name))} supply run is coming down the highway.`);
  }
  onSearched(item) {
    const id = item.prop && item.prop.mission;
    if (!id) return;
    const m = this.list.find((x) => x.id === id);
    if (!m || m.state !== 'active') return;
    const inv = this.game.inventory;
    if (m.give) { inv.items[m.give] = (inv.items[m.give] || 0) + (m.give === 'liquor' ? 2 : 1); this.game.hud.toast(`Got ${ITEM_NAMES[m.give] || m.give}`, 2.5); }
    if (m.table === 'seed_cache') this.soc.camp.seeds = true;
    this.complete(m, `Found ${m.title.replace(/^[A-Z]/, (c) => c.toLowerCase())}, just like ${m.fromName.split(' ')[0]} said.`);
  }
  onEvent(kind, c) {
    if (kind !== 'stash') return;
    // one robbery finishes every plan aimed at it; the journal says it once
    this.active.filter((m) => m.camp === c.id).forEach((m, i) => this.complete(m, `You robbed ${c.name}.`, i > 0));
  }
  complete(m, text, quiet = false) {
    if (m.state !== 'active') return;
    m.state = 'done';
    this.done.add(m.key);
    const from = this.soc.npcs.find((n) => n.person.id === m.from && !n.dead);
    if (from) {
      from.adjust('player', 0.15);
      if (this.soc.playerNear(from.pos, 30)) from.say(['Told you!', 'Ha! It worked.', 'That’s what I’m talking about.', 'Good work. Really.'][Math.floor(Math.random() * 4)]);
    }
    for (const o of this.soc.camp.members) if (!o.dead) o.needs.stress = Math.max(0, o.needs.stress - 8);
    if (!quiet) { this.soc.camp.log(text, 'plan', { who: [m.fromName] }); this.game.hud.toast(`Plan done: ${m.title}`, 4); }
    this.game.markDirty && this.game.markDirty();
  }
  fail(m, why) { m.state = 'failed'; this.soc.camp.log(`${m.title}: ${why}`, 'plan'); }
  removeSite(S) {
    const w = this.game.world;
    w.detach(S);
    const i = w.structures.indexOf(S);
    if (i >= 0) w.structures.splice(i, 1);
  }
  objective() {
    const m = this.active[0];
    return m ? `${m.title}${m.step ? ' — ' + m.step : ''}` : null;
  }
  markers() {
    const out = [];
    for (const m of this.active) if (m.at) out.push({ x: m.at.x, z: m.at.z, label: m.title });
    return out;
  }
  toJSON() {
    return { n: this.n, done: [...this.done], list: this.list.filter((m) => m.state === 'active').map((m) => ({ ...m, insideNpc: undefined, convoy: undefined, distractFire: undefined })) };
  }
  load(j) {
    this.n = j.n || 1;
    for (const k of j.done || []) this.done.add(k);
    for (const m of j.list || []) { if (m.waiting === 'inside' || m.insideNpc) m.waiting = 'inside'; this.list.push(m); }
  }
}
