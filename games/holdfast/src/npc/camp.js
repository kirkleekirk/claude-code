// Your camp: who lives there, what each of them is doing hour by hour, what
// their work produces, and everything that happens between them.
import { stationsFor, ROLE_STATIONS } from './stations.js';
import { NavGrid } from './nav.js';
import { ROLES, PERSONALITIES, BACKGROUND_BY_ID, compatibility } from './people.js';
import { ISSUES, NOTICE } from './lines.js';
import { weighted, first } from './dialogue.js';
import { CELL, STORY } from '../building/defs.js';
import { tickCondition, addFatigue, exhausted } from '../condition.js';

const ROLE_WORK = {
  cook: ["Supper's coming. Don't hover.", "Needs salt. Everything needs salt.", "Whoever finished the coffee owes me.", "Smells almost like real food."],
  farmer: ["Come on, little ones. Grow.", "Soil's better than I thought.", "Need rain. Or a bucket brigade.", "Pests got into the beans again."],
  medic: ["Keep it clean and keep it dry.", "Who's next? Nobody? Good.", "We're low on bandages. Keep that in mind out there.", "Stitches out in a week."],
  mechanic: ["Almost. Almost. There.", "This thing's held together with hope.", "Pass me that. Never mind, got it.", "Salvaged some good metal off that."],
  builder: ["One more armful.", "That'll keep us warm a night or two.", "Wood's wet. Figures.", "Stack it neat, it dries faster."],
  guard: ["All quiet on this side.", "Movement by the tree line. Just a deer.", "Nobody sneaks past me.", "Eyes on the road."],
  hunter: ["Fresh tracks out east.", "Wind's right for hunting.", "Cleaned the rifle. Ready when it's light."],
  scavenger: ["I'll hit the houses past the creek next.", "Found a tin of peaches last trip. Still dreaming about it.", "Pack's patched. Ready to go."],
  quartermaster: ["Twelve cans, four bags of rice. Write it down.", "Who moved the batteries?", "If it's not on the list, it doesn't exist."],
  counselor: ["Everyone doing okay?", "Sit with me a minute if you want.", "We'll get through this one too."],
};

// work people find for themselves in their line, with or without a station
const ROLE_FREE = {
  medic: [{ act: 'inspect', label: 'Checking on people', visit: (c, m) => visitable(c, m, (o) => o.health < o.maxHealth * 0.75).sort((a, b) => a.health - b.health)[0] || null, need: (c, m) => visitable(c, m, (o) => o.health < o.maxHealth * 0.75).length > 0, rate: 0.8 },
    { act: 'inspect', label: 'Sorting medical supplies', spot: 'near', rate: 0.4 }],
  farmer: [{ act: 'kneel_work', label: 'Foraging at the edge of camp', spot: 'edge', rate: 0.5, dur: 0.6 }],
  builder: [{ act: 'chop', item: 'axe', label: 'Splitting firewood', spot: 'edge', rate: 0.55, dur: 0.6 }],
  mechanic: [{ act: 'kneel_work', label: 'Tinkering with scrap', spot: 'near', rate: 0.5, dur: 0.6 }],
  cook: [{ act: 'inspect', label: 'Taking stock of the food', spot: 'near', rate: 0.3, dur: 0.3 }],
  quartermaster: [{ act: 'inspect', label: 'Taking stock', spot: 'near', rate: 0.8 }],
  counselor: [{ act: 'pray', label: 'Leading a quiet prayer', spot: 'near', rate: 0.5, dur: 0.3, need: (c, m) => m.tr.faith > 0.6 },
    { act: null, label: 'Checking on people', visit: (c, m) => visitable(c, m, (o) => o.needs.stress > 45 || o.grief > 0).sort((a, b) => b.needs.stress - a.needs.stress)[0] || null, need: (c, m) => visitable(c, m, (o) => o.needs.stress > 45 || o.grief > 0).length > 0, rate: 0.8 }],
  hunter: [{ act: 'sit_whittle', item: 'knife', label: 'Sharpening knives', spot: 'near', rate: 0.2, dur: 0.4 }],
  scavenger: [{ act: 'inspect', label: 'Mending a pack', spot: 'near', rate: 0.2, dur: 0.35 }],
};
// who's due a visit: hurt or troubled people now and then, everyone else rarely
function visitable(c, m, urgent) {
  return c.members.filter((o) => {
    if (o === m || o.dead || o.mode !== 'camp' || o.sleeping || o.convo) return false;
    const last = (m.visited && m.visited[o.person.id]) ?? -99;
    const wait = urgent(o) ? 2.5 : 10 + (1 - o.tr.social) * 10;
    return c.clock - last > wait;
  });
}
const ACT_NAMES = {
  sleep: 'Sleeping', cook: 'Cooking', chop: 'Chopping wood', hammer: 'Working at the bench', kneel_work: 'Working the ground', inspect: 'Sorting supplies',
  guard: 'On watch', sit_eat: 'Eating', sit_read: 'Reading', sit_drink: 'Having a drink', sit_cards: 'Playing cards', sit_write: 'Writing',
  sit_chair: 'Resting', sit_log: 'Sitting by the fire', sit_ground: 'Sitting by the fire', sit_whittle: 'Whittling', warm_hands: 'Warming up by the fire',
  tend_fire: 'Tending the fire', drink: 'Having coffee', smoke: 'Smoking', pray: 'Praying', stretch: 'Stretching', sweep: 'Sweeping', carry: 'Hauling supplies',
  idle_crossed: 'Standing around', idle_hips: 'Taking a breather', idle_pockets: 'Taking a breather', wring: 'Fretting', pace: 'Pacing', lean: 'Leaning on something',
  talk: 'Talking', argue: 'Arguing', fight: 'Fighting', cry: 'Grieving', cheer: 'Celebrating', wave: 'Waving',
};

export class Camp {
  constructor(soc) {
    this.soc = soc; this.game = soc.game;
    this.members = [];
    this.claim = null;
    this.stations = [];
    this.nav = null;
    this.journal = [];
    this.news = [];
    this.overheard = [];
    this.convos = [];
    this.disputes = [];
    this.directorT = 4;
    this.argueCd = 2;
    this.storyNight = -1;
    this.mealsDone = {};
    this.work = {};
    this.foodDebt = 0;
    this.theft = 0;
  }
  get clock() { return this.soc.clock; }
  get hour() { return this.game.sky.time; }
  get name() {
    if (!this.claim) return 'camp';
    const n = this.claim.structure.name || '';
    return n === 'Your base' ? 'camp' : n.replace(/ house$/, '').replace(/ @.*/, '');
  }
  log(text, kind = 'event', refs = null) {
    this.journal.push({ day: this.game.day, time: this.hour, text, kind });
    // things people will talk about later
    if (refs) { this.news.push({ kind, at: this.clock, who: refs.who || [], crew: refs.crew, said: new Set() }); if (this.news.length > 20) this.news.shift(); }
    if (this.journal.length > 80) this.journal.shift();
    this.soc.ui && this.soc.ui.journalChanged();
  }

  // ---------------- camp place ----------------
  setClaim(claim) {
    this.claim = claim;
    if (!claim) { this.nav = null; this.stations = []; return; }
    this.ensureBasics();
    this.refresh();
    for (const m of this.members) if (m.mode === 'camp' || m.mode === 'follow' && !m.ordered) m.mode = m.mode;
  }
  center() {
    const c = this.claim;
    return c ? { x: c.flag[0], y: c.flag[1], z: c.flag[2] } : null;
  }
  inside(x, z, m = 0) { const c = this.claim; return !!c && x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m; }
  refresh() {
    const c = this.claim;
    if (!c) return;
    const S = c.structure;
    const old = new Map();
    for (const st of this.stations) for (const sl of st.slots) if (sl.user) old.set(st.prop, [...(old.get(st.prop) || []), [sl, sl.user]]);
    this.stations = stationsFor(S);
    // keep reservations on unchanged props
    for (const st of this.stations) {
      const prev = old.get(st.prop);
      if (prev) prev.forEach(([osl, u], i) => { if (st.slots[i]) st.slots[i].user = u; if (u.task && u.task.slot === osl) u.task.slot = st.slots[i]; });
    }
    for (const m of this.members) if (m.task && m.task.slot && !this.stations.some((st) => st.slots.includes(m.task.slot))) { m.task = null; m.setAct(null); }
    this.nav = new NavGrid(this.game.physics, c.x0 - 6, c.z0 - 6, c.x1 + 6, c.z1 + 6);
    this.assignBeds();
    this.dirty = false;
  }
  // a free, flat, open spot in the claim for a new prop (w x d metres)
  findSpot(w, d, nearX, nearZ, rng = Math.random) {
    const c = this.claim, ph = this.game.physics, tr = this.game.world.terrain;
    let best = null, bs = Infinity;
    for (let k = 0; k < 160; k++) {
      const a = rng() * Math.PI * 2, r = 2.5 + rng() * 9;
      const x = nearX + Math.cos(a) * r, z = nearZ + Math.sin(a) * r;
      if (!this.inside(x, z, -1.5)) continue;
      const h = tr.height(x, z);
      if (Math.abs(tr.height(x + w / 2, z) - h) > 0.25 || Math.abs(tr.height(x, z + d / 2) - h) > 0.25) continue;
      if (ph.query(x - w / 2 - 0.4, z - d / 2 - 0.4, x + w / 2 + 0.4, z + d / 2 + 0.4, []).some((b) => b.max[1] > h + 0.15 && b.kind !== 'walk')) continue;
      if (this.game.world.roadDist && this.game.world.roadDist(x, z) < 2) continue;
      const s = r + rng() * 3;
      if (s < bs) { bs = s; best = { x, z, y: h }; }
    }
    return best;
  }
  addProp(type, at, rot = 0, data = {}) {
    const S = this.claim.structure;
    const p = S.addProp(type, at.x - S.ox, at.y - S.oy, at.z - S.oz, rot, data);
    S.modified = true;
    // worn ground around the things people use
    const r = type === 'campfire' ? 3.4 : 1.6;
    this.game.world.clearVegetation(at.x - r, at.z - r, at.x + r, at.z + r);
    this.game.world.attach(S);
    S._bb = null;
    return p;
  }
  // a campfire to gather at, and a bed for everyone
  ensureBasics() {
    const c = this.claim, S = c.structure;
    if (!S.props.some((p) => p.type === 'campfire')) {
      const at = this.findSpot(1.4, 1.4, c.flag[0] + 4, c.flag[2] + 4);
      if (at) {
        this.addProp('campfire', at, 0);
        const b1 = this.findSpot(1.8, 0.6, at.x, at.z);
        if (b1 && Math.hypot(b1.x - at.x, b1.z - at.z) < 4.5) this.addProp('log_bench', b1, faceRot(b1, at));
      }
    }
  }
  assignBeds() {
    const beds = [];
    for (const st of this.stations) for (const sl of st.slots) if (sl.bed && !sl.cot) beds.push(sl);
    const sleepers = this.members.filter((m) => !m.dead);
    for (const m of sleepers) if (m.bed && !beds.includes(m.bed)) m.bed = null;
    for (const m of sleepers) {
      if (m.bed) continue;
      const free = beds.find((b) => !sleepers.some((o) => o.bed === b));
      if (free) m.bed = free;
    }
    // bedrolls for whoever is left
    const need = sleepers.filter((m) => !m.bed);
    if (need.length && this.claim) {
      const fire = this.stations.find((s) => s.type === 'campfire');
      const cx = fire ? fire.x : this.claim.flag[0], cz = fire ? fire.z : this.claim.flag[2];
      let added = false;
      for (let i = 0; i < need.length; i++) {
        const at = this.findSpot(0.9, 2.1, cx, cz);
        if (!at) break;
        this.addProp('bedroll', at, faceRot(at, { x: cx, z: cz }) , { color: ['#5a6a4a', '#6a4a3a', '#3a4a5a', '#7a6a4a'][i % 4] });
        added = true;
      }
      if (added) { this.stations = stationsFor(this.claim.structure); this.nav = new NavGrid(this.game.physics, this.claim.x0 - 6, this.claim.z0 - 6, this.claim.x1 + 6, this.claim.z1 + 6); return this.assignBeds(); }
    }
  }

  // ---------------- members ----------------
  add(npc, arriving = false) {
    if (!this.members.includes(npc)) this.members.push(npc);
    npc.faction = 'camp';
    npc.camp = this;
    if (npc.joinedAt == null) npc.joinedAt = this.clock;
    npc.brain = (dt, near) => this.brain(npc, dt, near);
    npc.onHurt = (src) => { npc.needs.stress = Math.min(100, npc.needs.stress + 15); };
    for (const o of this.members) if (o !== npc && !(o.person.id in npc.rels)) { npc.rels[o.person.id] = compatibility(npc.person.personality, o.person.personality) * 0.3; o.rels[npc.person.id] = compatibility(o.person.personality, npc.person.personality) * 0.3; }
    if (this.claim) this.assignBeds();
    if (arriving) this.log(`${npc.person.name} joined the camp. ${BACKGROUND_BY_ID[npc.person.background].job}.`, 'join', { who: [npc.person.name] });
  }
  remove(npc) {
    this.members = this.members.filter((m) => m !== npc);
    if (npc.task && npc.task.slot) npc.task.slot.user = null;
    if (npc.bed) npc.bed = null;
  }
  usedBackgrounds() { return new Set(this.members.map((m) => m.person.background)); }
  usedLastNames() { return new Set(this.members.map((m) => m.person.name.split(' ').slice(-1)[0])); }
  usedFirstNames() { return new Set(this.members.map((m) => m.first)); }
  usedFirstNames() { return new Set(this.members.map((m) => m.first)); }

  // ---------------- time ----------------
  phase(m) {
    const h = this.hour, p = m.pers;
    const wake = p.wake + ((m.person.seed % 7) - 3) * 0.08, sleep = p.sleep + ((m.person.seed % 5) - 2) * 0.1;
    const inSleep = sleep < 24 ? (h >= sleep || h < wake) : (h >= sleep - 24 && h < wake);
    if (inSleep) return 'sleep';
    if (h < wake + 1.4) return 'morning';
    if (h >= 11.9 && h < 12.9) return 'meal';
    if (h >= 18 && h < 19.1) return 'meal';
    if (h >= 19.1 || h < 5) return 'evening';
    return 'work';
  }
  onWatch(m) {
    const guards = this.members.filter((o) => o.role === 'guard' && o.mode === 'camp' && !o.dead);
    if (!guards.length || m.role !== 'guard') return false;
    const h = this.hour;
    const night = h >= 21 || h < 6;
    if (!night) return false;
    const slot = Math.floor(((h + 3) % 24) / 3); // 3-hour shifts from 21:00
    return guards[slot % guards.length] === m;
  }

  // ---------------- brain ----------------
  brain(m, dt, near) {
    if (m.mode === 'follow') return this.soc.followBrain(m, dt, near);
    if (m.mode === 'wait') return this.soc.waitBrain(m, dt, near);
    if (m.mode === 'travel') return this.travelBrain(m, dt, near);
    if (m.mode === 'talk') { m.locked = true; return; }
    m.locked = false;
    if (m.rescue) return this.soc.rescueBrain(m, dt);
    if (m.mode === 'mission') return this.soc.jobs.brain(m, dt, near);
    if (!this.claim) { m.mode = 'follow'; return; }
    // danger in camp
    const threat = this.soc.threatNear(m, 14);
    if (threat) return this.defend(m, threat, dt);
    m.combatTarget = null; m.aiming = false;
    if (m.convo) return this.converseBrain(m);
    if (m.event) return; // scripted (argument, fight, story)
    const t = m.task;
    const now = this.clock;
    if (!t || now > t.until || (t.phase && t.phase !== this.phase(m) && t.kind !== 'watch' && !(t.kind === 'sleep' && this.phase(m) === 'sleep'))) return this.chooseTask(m);
    if (t.stage === 'go') {
      t.goT = (t.goT || 0) + dt;
      const d = Math.hypot(m.pos.x - t.x, m.pos.z - t.z);
      if (d < (t.visit ? 1.7 : 0.6) && Math.abs(m.pos.y - t.y) < 1.2) { m.stop(); this.beginTask(m); return; }
      // never wander forever: out of sight they just get there, in sight they rethink
      if (t.goT > (t.trip ? 60 : 30)) {
        if (t.trip || !this.soc.onScreen(m.pos)) { m.pos.set(t.x, t.y, t.z); m.visualY = t.y; m.stop(); this.beginTask(m); }
        else this.chooseTask(m);
        return;
      }
      if (!m.path) m.goTo(t.x, t.y, t.z);
      return;
    }
    // doing it
    if (t.route) return this.routeTask(m, t);
    this.doWork(m, t, dt);
    if (Math.random() < dt * 0.008 && !m.speaking) this.remark(m, t);
  }
  chooseTask(m) {
    const old = m.task;
    if (old && old.slot && old.slot.user === m) old.slot.user = null;
    m.task = null; m.setAct(null); m.taskFace = null; m.faceTarget = null; m.listening = false;
    const ph = this.phase(m), t = m.tr, n = m.needs, h = this.hour;
    const cand = [];
    const push = (score, task) => { if (score > 0.01) cand.push([score, task]); };
    // night watch & sleep
    if (this.onWatch(m)) {
      const posts = this.stations.filter((s) => s.type === 'lookout');
      const sl = posts.flatMap((s) => s.slots).find((x) => !x.user || x.user === m);
      if (sl) return this.assign(m, { kind: 'watch', slot: sl, opt: sl.opts[0], dur: 1, phase: null });
      return this.assign(m, { kind: 'watch', route: this.perimeter(), act: 'guard', item: 'rifle', dur: 1, phase: null });
    }
    // sent home to get patched up: meds from storage on each wound, then bed
    if (m.healOrder) {
      m.healOrder = false;
      let used = 0;
      for (const i of m.injuries) if (!i.treated && this.game.storage.take('res', 'meds', 1)) { i.treated = true; i.t *= 0.6; used++; }
      if (used) { m.health = Math.min(m.maxHealth, m.health + 20 * used); this.log(`${m.person.name} got patched up (${used} meds).`, 'hurt'); }
      else if (m.injuries.some((i) => !i.treated)) m.say('We\u2019re out of meds. I\u2019ll just lie down.');
      m.restOrder = true;
    }
    if (m.restOrder && m.bed && (!m.bed.user || m.bed.user === m)) {
      m.restOrder = false;
      return this.assign(m, { kind: 'sleep', slot: m.bed, opt: m.bed.opts[0], dur: 3, phase: null, label: 'Resting' });
    }
    // dead on their feet: a nap, whatever the hour
    if (ph !== 'sleep' && (n.energy < 16 || m.fatigue > 70 || (m.injuries.length && m.health < m.maxHealth * 0.6)) && m.bed && !m.bed.user) {
      m.say(m.tr.humor > 0.6 ? 'If I don\u2019t lie down I\u2019ll fall down.' : 'I need to lie down. Just for a bit.');
      return this.assign(m, { kind: 'sleep', slot: m.bed, opt: m.bed.opts[0], dur: 1.6, phase: null, label: 'Napping' });
    }
    if (ph === 'sleep') {
      const bed = m.bed;
      if (bed) return this.assign(m, { kind: 'sleep', slot: bed, opt: bed.opts[0], dur: 1.5, phase: 'sleep' });
      const c = this.center();
      return this.assign(m, { kind: 'sleep', x: c.x + 2, y: c.y, z: c.z + 2, act: 'sleep', lie: true, dur: 1.5, phase: 'sleep' });
    }
    // trips out for hunters and scavengers
    if (ph === 'work' && (m.role === 'hunter' || m.role === 'scavenger') && h < 14 && (m.lastTrip || -99) < this.game.day && this.clock - (m.joinedAt ?? -99) > 8 && (m.fatigue || 0) < 40 && !m.injuries.some((i) => !i.treated) && Math.random() < 0.5) {
      return this.startTrip(m);
    }
    const cookTime = (h > m.pers.wake && h < m.pers.wake + 1.2) || (h > 11.2 && h < 12.2) || (h > 17.2 && h < 18.4);
    for (const st of this.stations) {
      if (st.level > 0 && !this.nav) continue;
      for (const sl of st.slots) {
        if ((sl.user && sl.user !== m) || sl.bed) continue;
        const d = Math.hypot(sl.x - m.pos.x, sl.z - m.pos.z) + Math.abs(sl.y - m.pos.y) * 2;
        for (const opt of sl.opts) {
          let s = 0.3;
          const tags = opt.tags;
          for (const tg of tags) {
            if (tg === 'work:' + m.role) s += ph === 'work' ? 6 : ph === 'morning' ? 1 : 0.4;
            else if (tg.startsWith('work:')) s += ph === 'work' ? 0.5 * t.discipline : 0;
            if (tg === 'chore') s += ph === 'work' ? 1.2 : ph === 'morning' ? 0.8 : 0.1;
            if (tg === 'cook') s += m.role === 'cook' && cookTime ? 8 : 0;
            if (tg === 'meal') s += ph === 'meal' || (ph === 'morning' && h > m.pers.wake + 0.5) ? 3 + n.hunger / 25 : n.hunger > 70 ? 2 : 0;
            if (tg === 'leisure') s += ph === 'evening' ? 2.5 : ph === 'work' ? 0.9 * (1 - t.discipline) : 0.6;
            if (tg === 'social') s += (ph === 'evening' || ph === 'meal' ? 2 : 0.5) * (0.3 + t.social) * (n.social < 40 ? 1.6 : 1);
            if (tg === 'solo') s += (1 - t.social) * 1.6;
            if (tg === 'evening') s += ph === 'evening' ? 2 : 0;
            if (tg === 'morning') s += ph === 'morning' ? 2.4 : 0;
            if (tg === 'rest') s += n.energy < 35 || m.fatigue > 40 ? 2.5 + m.fatigue / 40 : 0.3;
            if (tg === 'faith') s += t.faith * (ph === 'morning' || ph === 'evening' ? 3 : 0.6);
            if (tg === 'guard') s += m.role === 'guard' ? (ph === 'work' ? 4 : 1) : 0;
            if (tg === 'patient') s += m.health < 50 || m.injuries.length ? 6 : -10;
            if (tg === 'music') s += m.person.background === 'musician' ? 4 : 0;
            if (tg === 'grief') s += m.grief > 0 ? 6 : (m.tr.faith > 0.6 && ph === 'morning' ? 0.5 : -0.2);
          }
          if (opt.act === 'sit_whittle' && t.discipline > 0.7) s *= 0.6;
          // likes its own corner: the same favourite spots, mostly
          const fav = m.favs && m.favs[st.type] ? 1.4 : 1;
          s *= fav / (1 + d / 18);
          if (m.lastTasks.includes(opt.act)) s *= 0.35;
          push(s, { kind: 'station', slot: sl, opt, phase: ph });
        }
      }
    }
    // things to do without furniture
    const c = this.center();
    const free = (score, act, item, dur, extra = {}) => push(score, { kind: 'free', act, item, dur, phase: ph, ...extra });
    free(0.6, ['idle_crossed', 'idle_hips', 'idle_pockets'][m.person.seed % 3], null, 0.2, { spot: 'near' });
    if (m.smoker) free(ph === 'evening' || ph === 'work' ? 1.1 : 0.4, 'smoke', 'cigarette', 0.25, { spot: 'edge' });
    if (t.faith > 0.7) free(ph === 'morning' ? 2.2 : ph === 'evening' ? 1.2 : 0.2, 'pray', null, 0.3, { spot: 'quiet' });
    if (t.anxiety > 0.7) free(0.9, 'wring', null, 0.2, { spot: 'near' });
    if (t.discipline < 0.3 || m.person.personality === 'wildcard') free(0.7, 'stretch', null, 0.15, { spot: 'near' });
    if (t.social < 0.3) free(1.2, 'idle_crossed', null, 0.4, { spot: 'edge', faceOut: true });
    if (ph === 'work') free(0.9 * t.discipline, 'sweep', 'broom', 0.35, { spot: 'floor' });
    if (ph === 'work' && this.stations.some((s) => s.type === 'crate' || s.type === 'metal_shelf')) free(0.7 * t.discipline, 'carry', 'crate', 0.4, { carry: true });
    if (m.role === 'guard' && ph !== 'sleep') free(ph === 'work' ? 3.5 : 1.2, 'guard', 'rifle', 0.6, { route: this.perimeter() });
    // everyone has something to do in their line of work, station or not
    const rw = ROLE_FREE[m.role];
    if (rw && (ph === 'work' || ph === 'morning')) for (const w of rw) {
      if (w.need && !w.need(this, m)) continue;
      free((ph === 'work' ? 3.2 : 0.8) * (0.6 + t.discipline * 0.6), w.act, w.item || null, w.dur || 0.45, { label: w.label, spot: w.spot, work: true, rate: w.rate ?? 0.6, visit: w.visit ? w.visit(this, m) : null, seekCompany: w.company });
    }
    // camp chores anyone might pick up
    if (ph === 'work') {
      free(0.9 * t.discipline, 'kneel_work', null, 0.35, { label: 'Gathering kindling', spot: 'edge', chore: 'kindling' });
      const fire = this.stations.find((s) => s.type === 'campfire');
      if (fire && (h < 9 || h > 16)) free(0.6, 'tend_fire', 'stick', 0.25, { label: 'Tending the fire', x: fire.slots[6].x, y: fire.slots[6].ground, z: fire.slots[6].z, face: fire.slots[6].face });
    }
    if (t.anxiety > 0.6 && ph === 'evening') free(0.8, 'pace', null, 0.25, { pace: true });
    if (m.grief > 0) free(2.5, 'cry', null, 0.2, { spot: 'quiet' });
    if (n.stress > 60 && t.social > 0.5) free(1.5, 'idle_hips', null, 0.1, { seekCompany: true });
    if (!cand.length) free(1, 'idle_crossed', null, 0.2, { spot: 'near' });
    // pick one of the best few, weighted
    cand.sort((a, b) => b[0] - a[0]);
    const top = cand.slice(0, 5);
    const pick = weighted(Object.fromEntries(top.map(([s], i) => [i, s * s])));
    return this.assign(m, top[+pick][1]);
  }
  assign(m, task) {
    const now = this.clock;
    task.until = now + (task.dur || (0.25 + Math.random() * 0.45));
    if (task.slot) {
      task.slot.user = m;
      task.x = task.slot.x; task.y = task.slot.ground ?? task.slot.y; task.z = task.slot.z;
      task.act = task.opt.act; task.item = task.opt.item || null;
      task.seatH = task.opt.seatH || 0; task.lie = !!task.opt.lie; task.face = task.slot.face;
      task.dur = task.dur || (task.opt.tags.includes('meal') ? 0.4 : 0.35 + Math.random() * 0.5);
      task.until = now + task.dur;
      if (task.opt.eat) task.act = 'sit_eat';
      m.favs = m.favs || {}; m.favs[task.slot.st.type] = (m.favs[task.slot.st.type] || 0) + 1;
    } else if (task.route) {
      task.x = task.route[0].x; task.y = task.route[0].y; task.z = task.route[0].z; task.ri = 0;
    } else if (task.x == null) {
      const p = this.spotFor(m, task);
      Object.assign(task, p);
    }
    task.stage = 'go';
    m.task = task;
    m.lastTasks.push(task.act); if (m.lastTasks.length > 3) m.lastTasks.shift();
    m.goTo(task.x, task.y, task.z);
    return task;
  }
  spotFor(m, task) {
    const c = this.claim, tr = this.game.world.terrain;
    const rnd = (r0, r1) => {
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
        const x = c.flag[0] + Math.cos(a) * r, z = c.flag[2] + Math.sin(a) * r;
        if (!this.inside(x, z, -1)) continue;
        const n = this.nav && this.nav.nearest(x, tr.height(x, z), z, 2);
        if (n >= 0) { const nd = this.nav.nodes[n]; return { x: nd.x, y: nd.y, z: nd.z }; }
      }
      return { x: c.flag[0] + 1, y: c.flag[1], z: c.flag[2] + 1 };
    };
    if (task.visit) {
      // walk up to them from this side, not into whatever they're facing
      const o = task.visit, dx = m.pos.x - o.pos.x, dz = m.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1;
      return { x: o.pos.x + dx / d * 1.1, y: o.pos.y, z: o.pos.z + dz / d * 1.1, faceAt: o };
    }
    if (task.seekCompany) {
      const o = this.members.find((x) => x !== m && x.mode === 'camp' && !x.dead && x.task && x.task.kind !== 'sleep');
      if (o) return { x: o.pos.x + 1.2, y: o.pos.y, z: o.pos.z + 0.4, faceAt: o };
    }
    if (task.spot === 'edge') { const p = rnd(10, 18); const fx = p.x + (p.x - c.flag[0]), fz = p.z + (p.z - c.flag[2]); return { ...p, face: Math.atan2(fx - p.x, fz - p.z) }; }
    if (task.spot === 'quiet') { const p = rnd(6, 14); return { ...p, face: Math.PI / 2 }; }
    if (task.spot === 'floor') {
      const S = c.structure;
      const ks = [...S.floors.keys()].filter((k) => k.endsWith(',0'));
      if (ks.length) {
        const [fx, fz] = ks[Math.floor(Math.random() * ks.length)].split(',').map(Number);
        const x = S.ox + fx * CELL + 1, z = S.oz + fz * CELL + 1;
        const n = this.nav && this.nav.nearest(x, S.oy, z, 2);
        if (n >= 0) { const nd = this.nav.nodes[n]; return { x: nd.x, y: nd.y, z: nd.z }; }
      }
    }
    if (task.carry) {
      const st = this.stations.filter((s) => s.type === 'crate' || s.type === 'metal_shelf');
      const a = st[Math.floor(Math.random() * st.length)];
      const p = rnd(3, 10);
      task.carryTo = p;
      return { x: a.slots[0].x, y: a.slots[0].ground, z: a.slots[0].z, face: a.slots[0].face };
    }
    if (task.pace) { const p = rnd(3, 9); task.paceA = { ...p }; task.paceB = { x: p.x + 4 * Math.cos(m.person.seed), y: p.y, z: p.z + 4 * Math.sin(m.person.seed) }; return p; }
    return rnd(2, 9);
  }
  perimeter() {
    const c = this.claim, tr = this.game.world.terrain, i = 2.5;
    const pts = [[c.x0 + i, c.z0 + i], [c.x1 - i, c.z0 + i], [c.x1 - i, c.z1 - i], [c.x0 + i, c.z1 - i]];
    const out = pts.map(([x, z]) => {
      const n = this.nav ? this.nav.nearest(x, tr.height(x, z), z, 6) : -1;
      return n >= 0 ? { x: this.nav.nodes[n].x, y: this.nav.nodes[n].y, z: this.nav.nodes[n].z } : { x, y: tr.height(x, z), z };
    });
    const k = Math.floor(Math.random() * 4);
    return [...out.slice(k), ...out.slice(0, k)];
  }
  beginTask(m) {
    const t = m.task;
    t.stage = 'do';
    m.stop();
    if (t.slot) { m.pos.x = t.slot.x; m.pos.z = t.slot.z; }
    if (t.lie) { m.setAct('sleep', null, 0, true, t.slot ? t.slot.y : t.y); m.facing = t.face ?? m.facing; }
    else m.setAct(t.carry ? null : t.act, t.carry ? null : t.item, t.seatH || 0);
    if (t.slot && (t.seatH || /^sit_/.test(t.act))) { m.pos.y = t.slot.ground; m.visualY = m.pos.y; m.facing = t.face; }
    m.taskFace = t.face ?? null;
    if (t.faceAt) m.faceTarget = t.faceAt.pos;
    if (t.carry) { m.setAct('carry', 'crate'); t.stage2 = true; m.goTo(t.carryTo.x, t.carryTo.y, t.carryTo.z); t.stage = 'go2'; t.until += 0.2; }
    if (t.pace) { m.setAct('pace'); t.stage = 'pace'; }
    if (t.kind === 'sleep') m.sleeping = true;
    // a visit: the medic checks someone over, the counselor sits with someone
    const o = t.visit;
    if (o) (m.visited || (m.visited = {}))[o.person.id] = this.clock;
    if (o && !o.dead && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 2.5) {
      m.faceTarget = o.pos; m.lookAt = o.pos;
      const sp = this.soc.speech;
      if (m.role === 'medic') {
        const heal = 8 + m.skill('medicine') * 6;
        o.health = Math.min(o.maxHealth, o.health + heal);
        this.playScript([m, o], [{ who: m, text: o.health < o.maxHealth * 0.7 ? `Let me see that, ${o.first}. Hold still.` : `Just checking on you, ${o.first}. Any pain? Fever?`, act: 'inspect' }, { who: o, text: sp.line(o, o.tr.warmth > 0.5 ? 'agree' : 'deflect', { you: m.person.name }), act: 'talk' }], 'talk');
        o.adjust(m.person.id, 0.03);
      } else {
        o.needs.stress = Math.max(0, o.needs.stress - 15);
        this.playScript([m, o], [{ who: m, text: sp.line(m, 'comfort', { you: o.person.name }), act: 'talk' }, { who: o, text: sp.line(o, o.needs.stress > 40 ? 'agree' : 'joke', { you: m.person.name }), act: 'talk' }], 'talk');
        o.adjust(m.person.id, 0.04);
      }
    }
  }
  routeTask(m, t) {
    // walking a loop (patrols)
    m.setAct(t.act, t.item);
    if (!m.path) {
      t.ri = (t.ri + 1) % t.route.length;
      const p = t.route[t.ri];
      m.goTo(p.x, p.y, p.z);
      if (Math.random() < 0.3) { m.stop(); m.taskFace = Math.atan2(p.x - this.claim.flag[0], p.z - this.claim.flag[2]); }
    }
  }
  doWork(m, t, dt) {
    const hrs = dt / this.game.sky.dayLength * 24;
    if (t.stage === 'go2') { if (!m.path) { m.setAct('idle_crossed'); t.stage = 'do'; } return; }
    if (t.stage === 'pace') {
      if (!m.path) { const p = (t.paceFlip = !t.paceFlip) ? t.paceB : t.paceA; m.goTo(p.x, p.y, p.z); }
      return;
    }
    // needs while doing things
    const n = m.needs;
    if (t.kind === 'sleep') { n.energy = Math.min(100, n.energy + hrs * 13); n.stress = Math.max(0, n.stress - hrs * 2); m.health = Math.min(m.maxHealth, m.health + hrs * 3); return; }
    m.sleeping = false;
    const tags = t.opt ? t.opt.tags : [];
    if (tags.includes('meal') && (t.act === 'sit_eat' || t.opt.eat)) this.eat(m, hrs);
    if (tags.includes('social') && this.someoneNear(m, 4)) n.social = Math.min(100, n.social + hrs * 6);
    if (tags.includes('leisure')) n.stress = Math.max(0, n.stress - hrs * 4);
    if (tags.includes('faith') || t.act === 'pray') n.stress = Math.max(0, n.stress - hrs * 6 * m.tr.faith);
    if (t.seatH || /^sit/.test(t.act || '')) n.energy = Math.min(100, n.energy + hrs * 3);
    // role work makes things
    const role = m.role;
    if (t.chore === 'kindling' && !t.gotKindling && this.clock > t.until - 0.05) { t.gotKindling = true; if (Math.random() < 0.5) { this.game.inventory.add({ wood: 1 }); } }
    if (tags.includes('work:' + role) || t.work || (t.kind === 'watch') || (t.route && role === 'guard') || (role === 'cook' && tags.includes('cook'))) {
      const rate = (0.7 + m.skill(skillOf(role)) * 0.15) * (0.6 + m.mood * 0.6) * (1 + this.qmBonus()) * (t.rate ?? 1);
      this.work[m.person.id] = (this.work[m.person.id] || 0) + hrs * rate;
      this.produce(m, t);
    }
    // a moment for the people nearby: look at whoever's talking
    const talker = this.members.find((o) => o !== m && o.speaking > 0 && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 6);
    m.lookAt = talker ? talker.pos : null;
    if (t.act === 'chop' && Math.random() < hrs * 0.004) { m.damage(12, null); this.log(`${m.person.name} caught their leg with the axe chopping wood.`, 'hurt'); m.say(m.tr.temper > 0.6 ? 'Damn it!' : 'Ow. Ow. Okay.'); }
  }
  produce(m, t) {
    const id = m.person.id, w = this.work[id], inv = this.game.inventory, role = m.role;
    const give = (res, n, say) => { inv.add({ [res]: n }); this.work[id] = 0; if (say && Math.random() < 0.5) m.say(say); this.game.markDirty && this.game.markDirty(); };
    const st = t.slot && t.slot.st.type;
    if (role === 'builder' && (st === 'chopping_block' || t.act === 'chop') && w >= 1.5) give('wood', 1, Math.random() < 0.5 ? 'More wood for the pile.' : null);
    else if (role === 'builder' && st !== 'chopping_block' && t.act !== 'chop' && w >= 4) give('stone', 1, null);
    else if (role === 'farmer' && (st === 'garden_bed' || t.act === 'kneel_work') && w >= (this.seeds ? 2.6 : 4)) give('food', 1, Math.random() < 0.5 ? (st ? 'Picked a few things.' : 'Found some greens. Wild onions, too.') : null);
    else if (role === 'mechanic' && w >= 3) { give(Math.random() < 0.25 ? 'fuel' : 'metal', 1, Math.random() < 0.4 ? 'Salvaged something useful.' : null); }
    else if (role === 'cook' && w >= 0.3) { this.cooked = this.clock; this.work[id] = 0; }
    else if (role === 'medic' && w >= 0.5) { this.work[id] = 0; for (const o of this.members) if (o.health < o.maxHealth && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 12) o.health = Math.min(o.maxHealth, o.health + 10); }
    else if (role === 'counselor' && w >= 0.5) { this.work[id] = 0; for (const o of this.members) if (Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < 8) o.needs.stress = Math.max(0, o.needs.stress - 4); }
    else if (role === 'guard' && w >= 1) { this.work[id] = 0; this.watchHours = (this.watchHours || 0) + 1; }
    else if (role === 'quartermaster' && w >= 2) { this.work[id] = 0; }
  }
  qmBonus() { return this.members.some((o) => o.role === 'quartermaster' && o.mode === 'camp' && !o.dead) ? 0.15 : 0; }
  eat(m, hrs) {
    if (m.ateAt && this.clock - m.ateAt < 3) return;
    m.ateAt = this.clock;
    const cooked = this.cooked && this.clock - this.cooked < 2.5;
    this.foodDebt += cooked ? 0.25 : 0.34;
    const inv = this.game.inventory;
    if (inv.res.food <= 0 && this.foodDebt >= 1) {
      m.needs.hunger = Math.max(0, m.needs.hunger - 10);
      m.needs.stress = Math.min(100, m.needs.stress + 8);
      this.hungry = this.clock;
      this.foodDebt = 0.99;
      if (Math.random() < 0.4) m.say(m.tr.temper > 0.6 ? "There's nothing to eat. Nothing!" : "We're out of food.");
      return;
    }
    while (this.foodDebt >= 1 && inv.res.food > 0) { inv.res.food--; this.foodDebt -= 1; }
    m.needs.hunger = Math.max(0, m.needs.hunger - (cooked ? 55 : 40));
    if (cooked && Math.random() < 0.2) m.say(m.tr.humor > 0.6 ? 'Compliments to the chef. Sincerely, for once.' : 'That was good.');
  }
  someoneNear(m, r) { return this.members.some((o) => o !== m && !o.dead && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < r); }
  remark(m, t) {
    const sp = this.soc.speech;
    if (this.convos.length || m.convo || this.clock < (m.remarkCd || 0)) return;
    m.remarkCd = this.clock + 0.5 + Math.random() * 0.9;
    let text = null;
    const tags = t.opt ? t.opt.tags : [];
    if (tags.includes('work:' + m.role) || t.kind === 'watch') text = ROLE_WORK[m.role] ? ROLE_WORK[m.role][Math.floor(Math.random() * ROLE_WORK[m.role].length)] : null;
    else if (m.needs.hunger > 70 && this.clock - (m.saidNeed || -9) > 3) { text = sp.line(m, 'r_hungry'); m.saidNeed = this.clock; }
    else if (m.needs.energy < 25 && this.clock - (m.saidNeed || -9) > 3) { text = sp.line(m, 'r_tired'); m.saidNeed = this.clock; }
    else if (Math.random() < 0.4) text = sp.flavor(m);
    else if (m.person.background === 'musician' || (m.person.personality === 'joker' && Math.random() < 0.3)) text = '♪ ' + ['...', 'hm hm hmm...', 'la da dee...'][Math.floor(Math.random() * 3)] + ' ♪';
    if (text && t.kind !== 'sleep') m.say(text);
  }
  travelBrain(m, dt, near) {
    const c = this.center();
    if (!c) { m.mode = 'follow'; return; }
    const d = Math.hypot(m.pos.x - c.x, m.pos.z - c.z);
    if (d < 12) { m.mode = 'camp'; m.task = null; this.game.unload(m, true); return; }
    const pl = this.game.player.pos, dp = Math.hypot(m.pos.x - pl.x, m.pos.z - pl.z);
    // out of sight and far from you: they just get there
    if (dp > 70 || (!near && dp > 30)) { m.pos.set(c.x + 3, c.y, c.z + 3); m.pos.y = this.game.physics.groundAt(m.pos.x, m.pos.z, c.y + 0.6); m.visualY = m.pos.y; m.mode = 'camp'; m.task = null; m.stop(); this.game.unload(m, true); return; }
    if (!m.path) m.goTo(c.x + 2, c.y, c.z + 2);
  }
  startTrip(m) {
    m.lastTrip = this.game.day;
    const c = this.center();
    const a = Math.random() * Math.PI * 2;
    const x = c.x + Math.cos(a) * 30, z = c.z + Math.sin(a) * 30;
    m.say(m.role === 'hunter' ? "Heading out to hunt. Back before supper." : "Going on a supply run. Don't wait up.");
    this.log(`${m.person.name} went out ${m.role === 'hunter' ? 'hunting' : 'scavenging'}.`, 'trip');
    return this.assign(m, { kind: 'trip', x, y: this.game.world.terrain.height(x, z), z, act: null, dur: 0.5, phase: null, trip: true });
  }

  // ---------------- danger ----------------
  defend(m, threat, dt) {
    const brave = m.role === 'guard' || m.tr.bravery > 0.45 || m.health > 70 && m.tr.bravery > 0.3;
    if (m.task && m.task.slot) { m.task.slot.user = null; }
    m.task = null; m.setAct(null); m.convo = null; m.event = null; m.sleeping = false;
    const d = Math.hypot(threat.pos.x - m.pos.x, threat.pos.z - m.pos.z);
    if (!brave && d < 10) {
      // get away from it, toward the others
      m.combatTarget = null;
      const fx = m.pos.x + (m.pos.x - threat.pos.x) / d * 6, fz = m.pos.z + (m.pos.z - threat.pos.z) / d * 6;
      if (!m.path) m.goTo(fx, m.pos.y, fz, true);
      if (!m.fledSaid) { m.fledSaid = true; m.say(this.soc.speech.line(m, 't_zombie')); }
      return;
    }
    m.fledSaid = false;
    this.soc.fight(m, threat, dt);
  }

  // ---------------- conversations & events ----------------
  converseBrain(m) {
    const c = m.convo;
    if (!c || c.done) { m.convo = null; m.listening = false; m.faceTarget = null; return; }
    m.locked = true;
    const other = c.a === m ? c.b : c.a;
    if (!m.seated && !m.anim.lie) m.faceTarget = other.pos;
    m.lookAt = other.pos;
    m.listening = m.speaking <= 0;
  }
  free(m) {
    if (m.dead || m.mode !== 'camp' || m.convo || m.event || m.sleeping || m.combatTarget || m.downed || m.rescue || m.talking) return false;
    if (this.clock < (m.convoCd || 0)) return false;
    const t = m.task;
    if (!t || t.stage !== 'do') return false;
    if (t.kind === 'watch' || t.kind === 'trip') return false;
    const tags = t.opt ? t.opt.tags : [];
    if (tags.includes('work:' + m.role) && m.tr.discipline > 0.6 && Math.random() < 0.7) return false;
    return true;
  }
  update(dt) {
    if (!this.members.length) return;
    if (this.dirty && this.claim && !this.game.buildMode.active) this.refresh();
    const hrs = dt / this.game.sky.dayLength * 24;
    const medicHere = this.members.some((o) => !o.dead && o.role === 'medic' && o.mode === 'camp');
    for (const m of this.members) {
      if (m.dead) continue;
      const n = m.needs, s = m.sleeping;
      n.hunger = Math.min(100, n.hunger + hrs * (s ? 2 : 4.5));
      if (!s) n.energy = Math.max(0, n.energy - hrs * (m.task && m.task.opt && m.task.opt.tags.some((x) => x.startsWith('work')) ? 7 : 4.5));
      n.social = Math.max(0, n.social - hrs * (m.mode === 'camp' && !s ? 3 : 1));
      if (n.hunger > 80) n.stress = Math.min(100, n.stress + hrs * 3);
      if (m.grief > 0) m.grief = Math.max(0, m.grief - hrs);
      if (m.mode !== 'camp' && m.mode !== 'away' && !m.controlled) m.health = Math.min(m.maxHealth, m.health + hrs * 1.5);
      // rest, wounds and the wear of being out there
      const atCamp = !!this.claim && m.mode !== 'away' && this.inside(m.pos.x, m.pos.z, 2);
      const sleeping = !!(m.sleeping || (m.task && m.task.kind === 'sleep' && m.task.stage === 'do'));
      tickCondition(m, hrs, { atCamp, sleeping, resting: !!m.seated, medic: medicHere,
        onHealed: (d) => this.log(`${m.person.name}'s ${d.name.toLowerCase()} has healed.`, 'hurt') });
      if (atCamp && !sleeping) m.health = Math.min(m.maxHealth, m.health + hrs * (medicHere ? 2.5 : 1));
      if (!m.controlled && !atCamp && ['follow', 'wait', 'mission', 'travel', 'inside'].includes(m.mode)) {
        if (m.path) this.soc.trained(m, 'endure', dt * (m.run ? 0.08 : 0.035));
        if (addFatigue(m, dt * (m.run ? 0.26 : 0.075) + (m.attackT === 0 ? 0.45 : 0))) {
          m.say(m.tr.temper > 0.6 ? 'I\u2019m done. I can\u2019t do any more today.' : 'I\u2019m spent. I need to get back and sleep.');
          if (this.claim && m.mode !== 'mission') { m.mode = 'travel'; m.task = null; }
          this.log(`${m.person.name} was exhausted and headed home.`, 'hurt');
        }
      }
    }
    // has the player been gone a while?
    if (this.claim) {
      const pd = Math.hypot(this.game.player.pos.x - this.claim.flag[0], this.game.player.pos.z - this.claim.flag[2]);
      if (pd > 150) { if (!this.awaySince) this.awaySince = this.clock; }
      else if (pd < 40 && this.awaySince) { if (this.clock - this.awaySince > 3) this.backAt = this.clock; this.awaySince = 0; }
    }
    this.updateTrips(dt);
    this.runConvos(dt);
    if (this.pendingGrave && this.clock > this.pendingGrave.at && this.claim) this.digGrave();
    this.nightAttack();
    this.directorT -= dt;
    this.argueCd -= hrs;
    if (this.directorT <= 0) { this.directorT = 5 + Math.random() * 6; this.direct(); }
  }
  updateTrips(dt) {
    for (const m of this.members) {
      if (m.task && m.task.trip && m.task.stage === 'do' && m.mode === 'camp') {
        m.mode = 'away'; m.awayUntil = this.clock + (m.role === 'hunter' ? 4 : 5.5); m.task = null; m.stop();
      }
      if (m.mode === 'away' && this.clock > (m.awayUntil || 0)) this.soc.jobs.comeBack(m);
    }
  }
  // the social director: who talks, who argues, what happens
  direct() {
    const alive = this.members.filter((m) => !m.dead && m.mode === 'camp');
    if (alive.length < 1) return;
    const h = this.hour;
    const pNear = (m) => this.soc.playerNear(m.pos, 40);
    // now and then someone has a plan to pitch (one at a time, not all at once)
    if (this.clock > (this.ideaCd || 0) && !alive.some((m) => m.idea)) {
      const keen = alive.filter((m) => !(m.ideaCd > this.clock) && m.rel('player') > 0.05 && this.clock - (m.joinedAt ?? -99) > 4).sort(() => Math.random() - 0.5);
      for (const m of keen) {
        const idea = this.soc.missions.ideaFor(m);
        if (!idea) continue;
        m.idea = idea; m.ideaCd = this.clock + 24;
        this.ideaCd = this.clock + 5 + Math.random() * 5;
        if (this.soc.playerNear(m.pos, 80)) this.soc.notice(NOTICE.idea.replace('{me}', m.person.name), m);
        break;
      }
    }
    // campfire story night
    const fire = this.stations.find((s) => s.type === 'campfire');
    if (fire && h > 19.5 && h < 22.5 && this.storyNight !== this.game.day && Math.random() < 0.35) {
      const around = alive.filter((m) => Math.hypot(m.pos.x - fire.x, m.pos.z - fire.z) < 5 && !m.convo && !m.event && !m.sleeping);
      if (around.length >= 2) return this.storyAtFire(around);
    }
    // an argument?
    if (this.argueCd <= 0 && alive.length >= 2 && Math.random() < 0.35) {
      const ev = this.findFriction(alive);
      if (ev) { this.argueCd = 6 + Math.random() * 8; return this.startArgument(ev.a, ev.b, ev.issue); }
    }
    // apologies after a quarrel
    for (const d of this.disputes) {
      if (d.settled || d.apologized || this.clock - d.at < 6) continue;
      // usually the one who started it, if they've got it in them; else the bigger heart
      const [a, b] = d.a.tr.warmth >= 0.4 && Math.random() < 0.7 ? [d.a, d.b] : d.b.tr.warmth > 0.6 ? [d.b, d.a] : [d.a, d.b];
      if (!this.free(a) || !this.free(b) || a.tr.warmth < 0.4 && a.tr.temper > 0.6) continue;
      d.apologized = true;
      return this.playScript([a, b], this.soc.speech.apology(a, b, { player: this.soc.playerName(), camp: this.name }), 'apology');
    }
    // someone thinking about leaving
    for (const m of alive) {
      if (m.mood < 0.22 && m.rel('player') < 0.15) m.lowFor = (m.lowFor || 0) + 1; else m.lowFor = 0;
      if (m.lowFor === 12) this.soc.notice(NOTICE.leave.replace('{me}', m.person.name), m);
      if (m.lowFor > 30) { this.log(`${m.person.name} packed up and left in the night.`, 'leave'); this.soc.leave(m); return; }
    }
    // theft at night
    if ((h > 1 && h < 4) && !this.theftDone) {
      const thief = alive.find((m) => m.tr.greed > 0.8 && m.sleeping === false);
      if (thief && Math.random() < 0.3 && this.game.inventory.res.food > 2) { this.game.inventory.res.food--; this.theft++; this.theftBy = thief; this.theftDone = true; }
    }
    if (h > 6 && h < 7) this.theftDone = false;
    // conversations
    const free = alive.filter((m) => this.free(m) && m.speaking <= 0);
    let best = null, bs = 0;
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (d > 7 || Math.abs(a.pos.y - b.pos.y) > 2) continue;
      const s = (a.tr.social + b.tr.social + 0.2) * (1 + (a.rel(b.person.id) + b.rel(a.person.id)) * 0.4) * (1 - d / 9) * (1 + (100 - a.needs.social) / 100) * Math.random();
      if (s > bs) { bs = s; best = [a, b]; }
    }
    const ph0 = h >= 19 && h < 23 ? 0.85 : h >= 12 && h < 13 ? 0.7 : 0.45;
    if (best && bs > 0.12 && Math.random() < ph0) {
      const [a, b] = Math.random() < (best[0].tr.social / (best[0].tr.social + best[1].tr.social)) ? best : [best[1], best[0]];
      const lines = this.soc.speech.conversation(a, b, { player: this.soc.playerName(), camp: this.name, others: alive, raiders: this.soc.raiders.active.some((c) => c.known),
        news: this.news, clock: this.clock, hour: h, playerAway: this.awaySince && this.clock - this.awaySince > 3, playerBack: this.backAt && this.clock - this.backAt < 1.5 });
      this.playScript([a, b], lines, 'talk');
      return;
    }
    // a lone remark
    const lone = free[Math.floor(Math.random() * free.length)];
    if (lone && Math.random() < 0.35 && pNear(lone) && this.clock > (lone.remarkCd || 0)) {
      lone.remarkCd = this.clock + 0.6 + Math.random() * 1.2;
      const sky = this.game.sky;
      const said = (k) => { const ok = this.clock - ((lone.saidT || (lone.saidT = {}))[k] || -99) > 6; if (ok) lone.saidT[k] = this.clock; return ok; };
      const intent = (sky.weather === 'storm' || sky.w.rain > 0.3) && said('rain') ? 'r_rain' : h < 9 && said('morning') ? 'r_morning' : h > 20 && said('night') ? 'r_night'
        : lone.needs.hunger > 65 && said('hungry') ? 'r_hungry' : lone.needs.energy < 30 && said('tired') ? 'r_tired' : Math.random() < 0.3 && said('bored') ? 'r_bored' : null;
      lone.say(intent ? this.soc.speech.line(lone, intent) : this.soc.speech.flavor(lone));
    }
  }
  findFriction(alive) {
    const h = this.hour, inv = this.game.inventory;
    const opts = [];
    for (const a of alive) for (const b of alive) {
      if (a === b || !this.free(a) || !this.free(b)) continue;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (d > 12) continue;
      const A = a.tr, B = b.tr;
      const base = (1 - (a.rel(b.person.id) + 1) / 2) * (0.4 + A.temper) * (0.5 + a.needs.stress / 100);
      const add = (issue, w) => { if (w > 0) opts.push({ a, b, issue, w: w * base }); };
      add('rations', (inv.res.food < this.members.length ? 1.5 : 0.1) * (b.needs.hunger < 30 ? 1.5 : 0.5));
      add('slacking', Math.max(0, A.discipline - B.discipline) * 2);
      add('risk', (A.anxiety > 0.6 || A.discipline > 0.8) && B.bravery > 0.85 ? 1.5 : 0);
      add('faith', A.faith < 0.2 && B.faith > 0.8 ? 1.4 : 0);
      add('orders', A.discipline < 0.5 && B.discipline > 0.85 ? 1.3 : 0);
      add('noise', (h > 21 || h < 6) && A.social < 0.4 && B.social > 0.8 ? 1.4 : 0);
      add('theft', this.theft && (A.discipline > 0.7 || a.role === 'quartermaster') ? (b === this.theftBy ? 3 : b.tr.greed > 0.5 ? 1 : 0.3) : 0);
      add('raiders', this.soc.raiders.camps.length && Math.abs(A.bravery - B.bravery) > 0.4 ? 1.1 : 0);
    }
    if (!opts.length) return null;
    const tot = opts.reduce((s, o) => s + o.w, 0);
    if (Math.random() > Math.min(0.85, tot * 0.5)) return null;
    let r = Math.random() * tot;
    for (const o of opts) { r -= o.w; if (r <= 0) return o; }
    return opts[0];
  }
  startArgument(a, b, issue) {
    const near = this.members.filter((m) => m !== a && m !== b && !m.dead && m.mode === 'camp' && Math.hypot(m.pos.x - a.pos.x, m.pos.z - a.pos.z) < 14 && !m.sleeping);
    const peace = near.filter((m) => m.tr.warmth > 0.6 || m.role === 'counselor').sort((x, y) => (y.role === 'counselor') - (x.role === 'counselor') || y.tr.warmth - x.tr.warmth)[0] || null;
    const stress = (a.needs.stress + b.needs.stress) / 200 + (this.members.some((m) => m.role === 'counselor') ? -0.15 : 0);
    const lines = this.soc.speech.argument(a, b, issue, { player: this.soc.playerName(), camp: this.name, stress }, peace);
    if (issue === 'theft') { this.theft = 0; }
    // they come together to have it out
    b.task && b.task.slot && (b.task.slot.user = null);
    a.task && a.task.slot && (a.task.slot.user = null);
    for (const m of [a, b]) { m.task = null; m.setAct(null); m.stop(); }
    a.goTo(b.pos.x + 1.1, b.pos.y, b.pos.z + 0.3);
    const cast = peace ? [a, b, peace] : [a, b];
    for (const m of near) if (m !== peace) { m.lookAt = a.pos; m.needs.stress = Math.min(100, m.needs.stress + 6); }
    this.playScript(cast, lines, 'argue', { issue, fight: lines.fight, peace });
    const d = { a, b, issue, at: this.clock, fight: lines.fight, settled: false };
    this.disputes.push(d);
    if (this.disputes.length > 12) this.disputes.shift();
    a.dispute = d; b.dispute = d;
    this.log(`${a.person.name} and ${b.person.name} argued about ${ISSUES[issue].name}${lines.fight ? ' and it came to blows' : ''}.`, lines.fight ? 'fight' : 'argument', { who: [a.person.name, b.person.name] });
    this.soc.notice((lines.fight ? NOTICE.fight : NOTICE.argument).replace('{a}', a.first).replace('{b}', b.first), a);
  }
  storyAtFire(around) {
    this.storyNight = this.game.day;
    // whoever has the most untold, trusted story to share
    let best = null, bs = -1;
    for (const t of around) {
      const listeners = around.filter((o) => o !== t);
      const avgRel = listeners.reduce((s, o) => s + t.rel(o.person.id), 0) / listeners.length;
      const heard = Math.min(...listeners.map((o) => o.knows[t.person.id] || 0));
      const lim = avgRel > 0.35 ? 3 : avgRel > 0.1 ? 2 : 1;
      if (heard < lim) { const s = t.tr.social + Math.random() * 0.5; if (s > bs) { bs = s; best = { t, n: heard }; } }
    }
    if (!best) return;
    const { t, n } = best;
    const sp = this.soc.speech;
    const text = sp.chapter(t, n);
    if (!text) return;
    const listeners = around.filter((o) => o !== t);
    const lines = [{ who: t, text, act: 'talk', story: true }];
    const r = listeners[Math.floor(Math.random() * listeners.length)];
    lines.push({ who: r, text: sp.line(r, r.tr.warmth > 0.5 ? 'comfort' : 'agree', { you: t.person.name }), act: 'talk' });
    lines.effects = [];
    for (const o of listeners) { o.knows[t.person.id] = Math.max(o.knows[t.person.id] || 0, n + 1); lines.effects.push([o, t, 0.06], [t, o, 0.03]); }
    this.playScript([t, ...listeners.slice(0, 1)], lines, 'story');
    this.log(`${t.person.name} told everyone at the fire about ${['their old life', 'the people they lost', 'the day it all fell apart', 'something they’d never told anyone'][n]}.`, 'story');
  }
  // play a list of lines between a cast of survivors
  playScript(cast, lines, kind, extra = {}) {
    if (!lines.length) return;
    const c = { cast, lines, i: -1, t: 0, kind, ...extra, a: cast[0], b: cast[1] };
    for (const m of cast) { m.convo = c; if (m.task && m.task.slot && !m.seated) { m.task.slot.user = null; m.task = null; m.setAct(null); } }
    this.convos.push(c);
  }
  runConvos(dt) {
    for (const c of this.convos) {
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.fighting) { this.endFight(c); continue; }
      c.i++;
      if (c.i >= c.lines.length) {
        if (c.fight && !c.fought) { this.startFight(c); continue; }
        c.done = true;
        for (const [x, y, d] of c.lines.effects || []) if (x && y) x.adjust(y.person.id, d);
        // a quiet stretch after talking: some people need longer than others
        for (const m of c.cast) { m.convo = null; m.listening = false; m.faceTarget = null; m.lookAt = null; m.convoCd = this.clock + (0.35 + Math.random() * 0.5) * (1.6 - m.tr.social); if (c.kind === 'argue') { m.task = null; m.setAct(null); } }
        continue;
      }
      const L = c.lines[c.i];
      if (!L || !L.who || L.who.dead) { c.t = 0; continue; }
      const who = L.who;
      who.say(L.text, Math.min(8, 2.2 + L.text.length * 0.05));
      if (!who.seated && !who.anim.lie) who.setAct(L.act === 'talk' ? null : L.act);
      for (const m of c.cast) if (m !== who) { m.lookAt = who.pos; if (!m.seated && !m.anim.lie && c.kind === 'argue' && L.act === 'argue') m.setAct(m === c.peace ? 'argue' : 'idle_crossed'); }
      c.t = Math.min(8, 2.4 + L.text.length * 0.05);
    }
    this.convos = this.convos.filter((c) => !c.done);
  }
  startFight(c) {
    c.fought = true; c.fighting = true; c.t = 5;
    const [a, b] = c.cast;
    for (const m of [a, b]) { m.setAct('fight'); m.event = true; }
    a.faceTarget = b.pos; b.faceTarget = a.pos;
    const swing = (x, y) => {
      if (!c.fighting || x.dead || y.dead) return;
      x.attackT = 0; x.attackDur = 0.5; x.hitDone = false;
      x.onHit = () => { if (Math.hypot(x.pos.x - y.pos.x, x.pos.z - y.pos.z) < 1.6) { y.health = Math.max(5, y.health - (2 + Math.random() * 4)); y.stagger = 0.3; } };
      setTimeout(() => swing(x, y), 700 + Math.random() * 600);
    };
    if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 1.2) a.goTo(b.pos.x + 0.9, b.pos.y, b.pos.z);
    swing(a, b); setTimeout(() => swing(b, a), 350);
    c.peace && c.peace.say(this.soc.speech.line(c.peace, 'a_calm'));
  }
  endFight(c) {
    c.fighting = false; c.done = true;
    const [a, b] = c.cast;
    for (const m of [a, b]) { m.event = null; m.setAct(null); m.convo = null; m.faceTarget = null; m.task = null; m.needs.stress = Math.min(100, m.needs.stress + 20); }
    a.adjust(b.person.id, -0.15); b.adjust(a.person.id, -0.15);
    if (c.peace) { c.peace.convo = null; c.peace.say(c.peace.tr.temper > 0.6 ? 'Enough! Walk it off. Both of you.' : 'Go cool off. Separate corners.'); c.peace.adjust(a.person.id, -0.02); a.adjust(c.peace.person.id, 0.04); b.adjust(c.peace.person.id, 0.04); }
    // walk off in different directions
    for (const m of [a, b]) { const p = this.spotFor(m, { spot: 'edge' }); m.goTo(p.x, p.y, p.z); }
  }
  activity(m) {
    if (m.dead) return 'Dead';
    if (m.controlled) return 'You\u2019re playing as them';
    if (m.mode === 'away') return m.role === 'hunter' ? 'Out hunting' : 'Out on a supply run';
    if (m.mode === 'mission') return m.mission ? m.mission.status : 'On a job';
    if (m.mode === 'follow') return 'With you';
    if (m.mode === 'wait') return 'Waiting where you left them';
    if (m.mode === 'travel') return 'Heading back to camp';
    if (m.convo) return m.convo.kind === 'argue' ? 'Arguing' : m.convo.kind === 'story' ? 'Telling stories by the fire' : 'Talking';
    if (m.combatTarget) return 'Fighting';
    const t = m.task;
    if (!t) return 'Idle';
    if (t.stage === 'go') return t.kind === 'sleep' ? 'Heading to bed' : t.trip ? 'Heading out' : 'On the move';
    return t.label || ACT_NAMES[t.act] || 'Busy';
  }
  // ---------------- loss ----------------
  onDeath(m, src) {
    this.remove(m);
    const how = src && src.hurt ? 'killed by the dead' : src && src.faction === 'raider' ? 'killed by raiders' : src === this.game.player ? 'killed by you' : 'gone';
    this.log(`${m.person.name} is dead, ${how}. ${BACKGROUND_BY_ID[m.person.background].job}, ${m.person.age}.`, 'death', { who: [m.person.name] });
    this.soc.notice(`${m.person.name} is dead.`);
    for (const o of this.members) {
      if (o.dead) continue;
      const r = o.rel(m.person.id);
      o.needs.stress = Math.min(100, o.needs.stress + 12 + Math.max(0, r) * 40);
      if (r > 0.1) { o.grief = 8 + r * 20; o.griefFor = m.person.name; }
      if (src === this.game.player) o.adjust('player', -0.3 - Math.max(0, r));
    }
    const close = this.members.filter((o) => !o.dead && o.rel(m.person.id) > 0.35);
    if (close.length) setTimeout(() => close[0].say(this.soc.speech.line(close[0], 'r_grief', { other: m.person.name })), 3000);
    if (this.claim) this.pendingGrave = { name: m.person.name, at: this.clock + 1.5 };
  }
  digGrave() {
    const g = this.pendingGrave;
    this.pendingGrave = null;
    const c = this.claim, fire = this.stations.find((s) => s.type === 'campfire');
    const cx = c.flag[0], cz = c.flag[2];
    // out toward the edge, away from the fire
    const ax = fire ? cx - (fire.x - cx) * 2 : cx + 9, az = fire ? cz - (fire.z - cz) * 2 : cz + 9;
    const at = this.findSpot(1.0, 2.5, ax, az);
    if (!at) return;
    this.addProp('grave', at, faceRot(at, { x: cx, z: cz }), { name: g.name });
    this.log(`They buried ${g.name} at the edge of camp.`, 'death');
    for (const m of this.members) if (!m.dead && m.grief > 0 && m.mode === 'camp') { m.task = null; }
  }
  // the dead come at the fence some nights; guards see them first
  nightAttack() {
    const h = this.hour, g = this.game;
    if (!this.claim || g.day < 2 || g.peaceful) return;
    const slot = Math.floor(this.clock);
    if (this.attackSlot === slot) return;
    this.attackSlot = slot;
    if (!(h >= 21 || h < 4)) return;
    const c = this.center();
    if (!this.soc.playerNear(c, 110)) return;
    const watch = this.members.filter((m) => !m.dead && m.mode === 'camp' && this.onWatch(m));
    const chance = 0.14 + g.day * 0.01 - watch.length * 0.05;
    if (Math.random() > chance) return;
    const n = 2 + Math.floor(Math.random() * (2 + Math.min(4, g.day / 2)));
    const a = Math.random() * Math.PI * 2;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const aa = a + (Math.random() - 0.5) * 0.7, r = 30 + Math.random() * 8;
      const x = c.x + Math.cos(aa) * r, z = c.z + Math.sin(aa) * r;
      if (g.world.terrain.height(x, z) < 0.8 || g.world.nearBuilding(x, z, 1)) continue;
      g.zombies.spawnAt(x, z);
      const zb = g.zombies.list[g.zombies.list.length - 1];
      zb.state = 'investigate'; zb.target = new zb.pos.constructor(c.x, c.y, c.z); zb.home.set(c.x, c.y, c.z);
      spawned++;
    }
    if (!spawned) return;
    const dir = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][((Math.round(Math.atan2(Math.cos(a), -Math.sin(a)) * 4 / Math.PI) % 8) + 8) % 8];
    const w = watch[0] || this.members.find((m) => !m.dead && m.mode === 'camp' && !m.sleeping);
    if (w) { w.sleeping = false; w.say(watch.length ? `Walkers! ${spawned > 3 ? 'A lot of them! ' : ''}Coming from the ${dir}!` : 'Did you hear that? Something’s out there!'); }
    this.log(`The dead came at the camp from the ${dir} in the night${watch.length ? `. ${watch[0].first} saw them coming` : ''}.`, 'attack', { who: [] });
    // the brave get up
    for (const m of this.members) if (m.sleeping && m.mode === 'camp' && (m.tr.bravery > 0.55 || m.role === 'guard') && Math.random() < 0.7) { m.sleeping = false; m.task = null; m.setAct(null); }
  }
  toJSON() {
    return { journal: this.journal.slice(-60), overheard: this.overheard.slice(-30), foodDebt: this.foodDebt, seeds: !!this.seeds,
      disputes: this.disputes.filter((d) => !d.settled && !d.a.dead && !d.b.dead).map((d) => ({ a: d.a.person.id, b: d.b.person.id, issue: d.issue, at: d.at, fight: d.fight, apologized: d.apologized })) };
  }
  load(j) {
    this.journal = j.journal || [];
    this.overheard = j.overheard || [];
    this.foodDebt = j.foodDebt || 0;
    this.seeds = !!j.seeds;
    const by = (id) => this.members.find((m) => m.person.id === id);
    for (const d of j.disputes || []) {
      const a = by(d.a), b = by(d.b);
      if (!a || !b) continue;
      const o = { ...d, a, b, settled: false };
      this.disputes.push(o); a.dispute = o; b.dispute = o;
    }
  }
}

function skillOf(role) {
  return { cook: 'cooking', farmer: 'farming', medic: 'medicine', mechanic: 'mechanics', builder: 'building', guard: 'combat', hunter: 'shooting', scavenger: 'scavenging', quartermaster: 'leadership', counselor: 'leadership' }[role] || 'combat';
}
// prop rotation (quarter turns) so the prop's front faces a point
function faceRot(from, to) {
  const a = Math.atan2(to.x - from.x, to.z - from.z);
  const r = Math.round(a / (Math.PI / 2));
  return ((r % 4) + 4) % 4;
}
export { ACT_NAMES, ROLES, STORY };
