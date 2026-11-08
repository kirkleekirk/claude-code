// People on the road: one or two survivors camped by a small fire somewhere
// out in the county. Some would join you if you earn it (or help them out);
// some have their own people and only pass on what they've heard: where a
// raider crew sits, what that crew's weakness is, where something useful
// was left behind.
import { Structure } from '../building/structure.js';
import { stationsFor } from './stations.js';
import { makePerson } from './people.js';
import { T } from '../world/terrain.js';
import { compass, cap, inField } from './raiders.js';

const OWN = [
  'I’ve got people waiting for me at the grain elevator.', 'My family’s dug in across the river. I’m just out for supplies.', 'I travel alone. Always have.',
  'I’m heading north. My sister’s in Hannibal, if she’s anywhere.', 'There’s a group of us at the quarry. We do all right.', 'I made a promise to wait for someone. I’m keeping it.',
];
const RUMORS = [
  'the dead get thicker downtown after dark. Stay out of Harlan’s Landing at night.', 'somebody’s been ringing a bell at the church. Could be a trap.',
  'the river’s rising. Low ground floods this time of year.', 'a horde came down the highway two nights back, heading east.',
  'the farm houses out west are mostly picked clean, but folks skip the barns.', 'runners in the cornfields. Fast ones. Don’t go in there.',
  'the hardware store still had tools in the back last I looked.', 'a man was trading fuel for food by the Gas & Go. Haven’t seen him since.',
];
const WANTS = { food: ['food', 2, 'something to eat'], meds: ['meds', 1, 'some medicine'], ammo: ['ammo', 5, 'some bullets'] };

export class Strangers {
  constructor(soc) {
    this.soc = soc; this.game = soc.game;
    this.groups = [];
    this.nextT = 1.2;
  }
  get clock() { return this.soc.clock; }
  update(dt) {
    const now = this.clock;
    if (now > this.nextT) {
      this.nextT = now + 2 + Math.random() * 2.5;
      const live = this.groups.length;
      const cap = this.soc.camp.members.length >= 10 ? 1 : 2;
      if (live < cap && Math.random() < 0.6 && !this.game.peaceful) this.spawnGroup();
    }
    for (const gr of this.groups) {
      const near = this.soc.playerNear(gr, 75);
      const left = gr.npcs.filter((m) => !m.dead && m.faction === 'stranger');
      if ((now > gr.until && !near) || (!left.length && !near)) this.remove(gr);
    }
    this.groups = this.groups.filter((gr) => !gr.removed);
  }
  spot() {
    const g = this.game, tr = g.world.terrain, P = T.play, pp = g.player.pos;
    const claim = g.claims.list[0];
    for (let k = 0; k < 200; k++) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 90;
      const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r;
      if (x < P.x0 + 20 || x > P.x1 - 20 || z < P.z0 + 20 || z > P.z1 - 20) continue;
      if (x > T.town.x0 - 8 && x < T.floodwallX && Math.abs(z) < T.town.z1) continue;
      const h = tr.height(x, z);
      if (h < T.water + 1) continue;
      if (Math.abs(tr.height(x + 3, z) - h) > 0.5 || Math.abs(tr.height(x, z + 3) - h) > 0.5) continue;
      if (g.world.roadDist && g.world.roadDist(x, z) < 5) continue;
      if (g.world.nearBuilding(x, z, 6)) continue;
      if (inField(x, z, 6)) continue;
      if (claim && Math.hypot(claim.flag[0] - x, claim.flag[2] - z) < 60) continue;
      if (this.soc.raiders.camps.some((c) => !c.gone && Math.hypot(c.x - x, c.z - z) < 80)) continue;
      if (this.groups.some((o) => Math.hypot(o.x - x, o.z - z) < 60)) continue;
      if (g.physics.query(x - 3, z - 3, x + 3, z + 3, []).some((b) => b.max[1] > h + 0.3 && b.kind !== 'walk')) continue;
      return { x, y: h, z };
    }
    return null;
  }
  spawnGroup(at = null) {
    at = at || this.spot();
    if (!at) return null;
    const g = this.game, tr = g.world.terrain;
    const n = Math.random() < 0.35 ? 2 : 1;
    const oy = Math.round(at.y * 4) / 4;
    const S = new Structure({ name: 'campsite', kind: 'site', ox: at.x - 6, oz: at.z - 6, oy });
    const put = (type, wx, wz, rot, data = {}) => S.addProp(type, wx - S.ox, tr.height(wx, wz) - 0.04 - oy, wz - S.oz, rot, data);
    put('campfire', at.x, at.z, 0);
    for (let i = 0; i < n; i++) { const a = i * 2.2 + 0.8, bx = at.x + Math.cos(a) * 3, bz = at.z + Math.sin(a) * 3; put('bedroll', bx, bz, rot(at.x - bx, at.z - bz), { color: ['#6a5a3a', '#4a5a6a'][i] }); }
    if (Math.random() < 0.6) put('log_bench', at.x + 2, at.z - 1.6, 3);
    g.world.clearVegetation(at.x - 4.5, at.z - 4.5, at.x + 4.5, at.z + 4.5);
    g.world.structures.push(S);
    g.world.attach(S);
    const gr = { x: at.x, y: at.y, z: at.z, S, npcs: [], until: this.clock + 24 + Math.random() * 18, stations: stationsFor(S) };
    const used = this.soc.camp.usedBackgrounds();
    const own = new Set();
    for (let i = 0; i < n; i++) {
      const recruit = Math.random() < 0.72;
      const p = makePerson(Math.random, recruit ? new Set([...used, ...own]) : own, { lastNames: new Set([...this.soc.camp.usedLastNames(), ...gr.npcs.map((o) => o.person.name.split(' ').slice(-1)[0])]), firstNames: new Set([...this.soc.camp.usedFirstNames(), ...gr.npcs.map((o) => o.first)]) });
      own.add(p.background);
      const a = Math.random() * Math.PI * 2;
      const m = this.soc.spawn(p, { x: at.x + Math.cos(a) * 2, z: at.z + Math.sin(a) * 2, faction: 'stranger', mode: 'stranger' });
      m.group = gr;
      m.recruitable = recruit;
      m.own = recruit ? null : OWN[Math.floor(Math.random() * OWN.length)];
      const wk = Math.random();
      m.want = !recruit || wk < 0.35 ? null : WANTS[wk < 0.65 ? 'food' : wk < 0.85 ? 'meds' : 'ammo'];
      m.rels.player = (m.tr.warmth - 0.5) * 0.25 + m.tr.social * 0.08 + (Math.random() - 0.5) * 0.08;
      m.smoker = Math.random() < 0.35;
      m.brain = (dt, near) => this.brain(m, dt, near);
      m.onHurt = (src) => { if (src === this.game.player) this.provoked(m); };
      Object.defineProperty(m, 'isHostile', { get: () => !!m.angry });
      gr.npcs.push(m);
    }
    if (n === 2) { const [a, b] = gr.npcs; a.rels[b.person.id] = 0.35; b.rels[a.person.id] = 0.35; a.knows[b.person.id] = 2; b.knows[a.person.id] = 2; }
    this.groups.push(gr);
    return gr;
  }
  remove(gr) {
    gr.removed = true;
    for (const m of gr.npcs) if (m.faction === 'stranger' && this.soc.npcs.includes(m)) this.soc.drop(m);
    const w = this.game.world;
    w.detach(gr.S);
    const i = w.structures.indexOf(gr.S);
    if (i >= 0) w.structures.splice(i, 1);
  }
  brain(m, dt, near) {
    m.locked = false;
    const pl = this.game.player, pp = pl.pos;
    const dp = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
    if (m.angry) {
      if (m.health < 40 || m.tr.bravery < 0.4) {
        if (!m.fled) { m.fled = true; m.say(['Stay away from me!', 'Okay! Okay! I’m going!', 'You’re crazy!'][Math.floor(Math.random() * 3)]); }
        const a = Math.atan2(m.pos.z - pp.z, m.pos.x - pp.x);
        if (!m.path) m.goTo(m.pos.x + Math.cos(a) * 40, m.pos.y, m.pos.z + Math.sin(a) * 40, true);
        if (dp > 70) m.gone = true;
        return;
      }
      return this.soc.fight(m, pl, dt);
    }
    const threat = this.soc.threatNear(m, 12);
    if (threat) {
      if (m.tr.bravery > 0.4 || m.health > 70) return this.soc.fight(m, threat, dt);
      const d = Math.hypot(threat.pos.x - m.pos.x, threat.pos.z - m.pos.z) || 1;
      if (!m.path) m.goTo(m.pos.x + (m.pos.x - threat.pos.x) / d * 8, m.pos.y, m.pos.z + (m.pos.z - threat.pos.z) / d * 8, true);
      return;
    }
    m.combatTarget = null; m.aiming = false;
    // they notice you coming
    if (!m.greeted && dp < 24 && this.soc.clear(m.pos, pp)) {
      m.greeted = true;
      if (m.task && m.task.slot) m.task.slot.user = null;
      m.task = null; m.setAct('wave'); m.stop();
      m.faceTarget = pp;
      m.say(this.soc.speech.line(m, 'hello0', { you: this.soc.playerName() }) || 'Hey there.');
      m.waveT = 2;
    }
    if (m.waveT > 0) { m.waveT -= dt; if (m.waveT <= 0) m.setAct(null); return; }
    if (dp < 6 && m.greeted) { m.lookAt = pp; if (!m.seated && !m.anim.lie) m.faceTarget = pp; } else { m.lookAt = null; m.faceTarget = null; }
    const t = m.task;
    if (!t || this.clock > t.until) return this.choose(m);
    if (t.stage === 'go' && !m.path) {
      if (Math.hypot(m.pos.x - t.x, m.pos.z - t.z) < 0.7) {
        t.stage = 'do'; m.stop();
        if (t.slot) { m.pos.x = t.slot.x; m.pos.z = t.slot.z; m.facing = t.face; m.taskFace = t.face; }
        if (t.lie) { m.sleeping = true; m.setAct('sleep', null, 0, true, t.slot.y); } else m.setAct(t.act, t.item, t.seatH || 0);
      } else m.goTo(t.x, t.y, t.z);
    }
    // someone talks to you while you sleep: you wake up
    if (m.sleeping && dp < 3) { m.sleeping = false; m.setAct(null); m.task = null; m.say('Huh? Who’s there?'); }
  }
  choose(m) {
    const gr = m.group, h = this.game.sky.time;
    if (m.task && m.task.slot && m.task.slot.user === m) m.task.slot.user = null;
    m.task = null; m.setAct(null); m.sleeping = false; m.taskFace = null;
    const slots = gr.stations.flatMap((s) => s.slots.map((sl) => ({ s, sl }))).filter(({ sl }) => !sl.user);
    const night = h > m.pers.sleep - 24 && h < m.pers.wake || h > m.pers.sleep;
    let pick = null;
    if (night) pick = slots.find(({ s }) => s.type === 'bedroll');
    if (!pick) {
      const fire = slots.filter(({ s }) => s.type === 'campfire' || s.type === 'log_bench');
      pick = fire[Math.floor(Math.random() * fire.length)];
    }
    if (!pick || (!night && Math.random() < 0.25)) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5, x = gr.x + Math.cos(a) * r, z = gr.z + Math.sin(a) * r;
      const act = m.smoker && Math.random() < 0.5 ? 'smoke' : ['idle_crossed', 'idle_pockets', 'stretch', 'lean', 'idle_hips'][Math.floor(Math.random() * 5)];
      m.task = { x, y: this.game.world.terrain.height(x, z), z, act, item: act === 'smoke' ? 'cigarette' : null, stage: 'go', until: this.clock + 0.3 + Math.random() * 0.4 };
      m.goTo(m.task.x, m.task.y, m.task.z);
      return;
    }
    const opts = pick.sl.opts.filter((o) => !o.tags.includes('meal'));
    const o = night ? pick.sl.opts[0] : opts[Math.floor(Math.random() * opts.length)];
    pick.sl.user = m;
    m.task = { slot: pick.sl, x: pick.sl.x, y: pick.sl.ground, z: pick.sl.z, face: pick.sl.face, act: o.act, item: o.item || null, seatH: o.seatH || 0, lie: !!o.lie, stage: 'go', until: this.clock + (night ? 1.5 : 0.4 + Math.random() * 0.6) };
    m.goTo(m.task.x, m.task.y, m.task.z);
  }
  provoked(m) {
    if (m.faction !== 'stranger') return;
    for (const o of m.group ? m.group.npcs : [m]) {
      if (o.dead || o.faction !== 'stranger') continue;
      o.angry = true; o.adjust('player', -1);
      if (o.task && o.task.slot) o.task.slot.user = null;
      o.task = null; o.setAct(null); o.sleeping = false;
    }
    m.say(['What the hell?!', 'Are you crazy?!', 'You son of a—', 'Stay back!'][Math.floor(Math.random() * 4)]);
  }
  onDeath(m) {
    this.soc.lootables.push({ pos: [m.pos.x, m.pos.y + 0.4, m.pos.z], table: 'raider_body', label: `Search ${m.first}`, searched: false, until: this.clock + 24 });
  }

  // ---------------- what they can tell you ----------------
  rumor(m) {
    const sp = this.soc.speech, raid = this.soc.raiders, pre = sp.line(m, 'stranger_rumor') || '';
    m.rumors = (m.rumors || 0) + 1;
    if (m.rumors > 2) return { text: "That's all I know. Honest." };
    // a raider crew you haven't found
    const unknown = raid.active.filter((c) => !c.known);
    if (unknown.length && m.rumors === 1) {
      const c = unknown.sort((a, b) => Math.hypot(a.x - m.pos.x, a.z - m.pos.z) - Math.hypot(b.x - m.pos.x, b.z - m.pos.z))[0];
      c.known = true;
      const n = c.roster.filter((r) => !r.dead).length;
      const size = n > 8 ? 'a big crew, ten or more' : n > 4 ? `maybe ${n} of them` : 'just a few of them';
      this.soc.camp.log(`${m.person.name} told you where ${c.name} is camped.`, 'raiders');
      return { text: `${pre}there's a crew calling themselves ${c.name} camped out ${compass(c.x - m.pos.x, c.z - m.pos.z)} of here. ${cap(size)}. They shoot first.`, map: true };
    }
    // their own know-how about the raiders, or a place they won't go back to
    const ms = this.soc.missions;
    const idea = ms.ideaFor(m, { strangers: true });
    if (idea) return { text: (idea.idea.kind === 'raidmod' ? `${pre}if you’re set on going after those raiders… ` : `${pre}`) + idea.idea.text + (m.recruitable ? '' : ' I’m not going back for it. Might as well be you.'), idea };
    const known = raid.active.find((c) => c.known);
    if (known && Math.random() < 0.5) {
      const n = known.roster.filter((r) => !r.dead).length;
      return { text: `${pre}${known.name}? Last I saw they had ${n} people and more coming in every day. They keep their stash by the boss’s tent.` };
    }
    return { text: pre + RUMORS[Math.floor(Math.random() * RUMORS.length)] };
  }
  // would they come back to camp with you?
  join(m) {
    const sp = this.soc.speech, camp = this.soc.camp;
    if (!m.recruitable) return { ok: false, text: (sp.line(m, 'refuse_join') || 'No.') + ' ' + m.own };
    if (camp.members.filter((x) => !x.dead).length >= 12) return { ok: false, text: 'Sounds like your camp’s full up already. I’d just be another mouth.' };
    if (camp.usedBackgrounds().has(m.person.background)) return { ok: false, text: 'Sounds like you’ve already got somebody who does what I do. I’d be in the way.' };
    if (m.rel('player') < 0.12) {
      const hint = m.want && !m.gotWant ? ` I could use ${m.want[2]}, if you’ve got any to spare.` : ' Ask me again after we’ve talked some more.';
      return { ok: false, text: (sp.line(m, 'refuse_join') || 'Not yet.') + hint };
    }
    // join up
    const gr = m.group;
    if (m.task && m.task.slot) m.task.slot.user = null;
    m.task = null; m.setAct(null); m.sleeping = false; m.greeted = true;
    gr.npcs = gr.npcs.filter((x) => x !== m);
    m.group = null;
    camp.add(m, true);
    m.mode = camp.claim ? 'travel' : 'follow';
    if (!camp.claim) camp.log(`${m.person.name} joined you on the road.`, 'join');
    // their companion has an opinion about it
    const other = gr.npcs.find((x) => !x.dead && x.faction === 'stranger');
    if (other) setTimeout(() => other.say(other.rel(m.person.id) > 0.2 ? (other.recruitable ? 'Guess I’m coming too, then.' : `Take care of yourself, ${m.first}.`) : 'Good riddance.'), 2600);
    if (other && other.recruitable && other.rel(m.person.id) > 0.2 && !camp.usedBackgrounds().has(other.person.background)) {
      gr.npcs = gr.npcs.filter((x) => x !== other); other.group = null; camp.add(other, true); other.mode = m.mode; other.greeted = true;
    }
    return { ok: true, text: sp.line(m, 'joined', { player: this.soc.playerName() }) || 'All right.' };
  }
}

function rot(dx, dz) { const a = Math.atan2(dx, dz); return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4; }
