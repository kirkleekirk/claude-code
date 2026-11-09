// Jobs your people do on their own when you send them from the top view:
// fetch a cache from a plan, scavenge a building, raid a crew, go on a supply
// run, or just go somewhere and hold. They travel, do the work, fight what
// they meet, and come home to unload. A raid nobody is watching plays out
// on the odds.
import { rollLoot, tallyText } from '../items.js';
import { maybeInjure, exhausted, addFatigue } from '../condition.js';
import { statEffects } from '../stats.js';
import { makePerson } from './people.js';
import { compass } from './raiders.js';
import { CELL } from '../building/defs.js';

export class Jobs {
  constructor(soc) { this.soc = soc; this.game = soc.game; this.list = []; this.n = 1; }
  get clock() { return this.soc.clock; }
  // send a team. kind: goto | cache | scavenge | raid | run
  send(team, kind, opts = {}) {
    team = team.filter((m) => !m.dead && !m.downed && m.mode !== 'away' && !exhausted(m));
    if (!team.length) return null;
    const job = { id: 'J' + this.n++, kind, team, stage: 'go', started: this.clock, ...opts };
    job.title = opts.title || { goto: 'Holding a position', cache: 'Fetching a cache', scavenge: 'Scavenging', raid: 'Raiding', run: 'Supply run', recruit: 'Recruiting', scout: 'Looking for survivors' }[kind];
    for (const m of team) {
      if (m.controlled) this.game.command.releaseBody();
      if (m.task && m.task.slot && m.task.slot.user === m) m.task.slot.user = null;
      m.task = null; m.setAct(null); m.sleeping = false; m.convo = null; m.orderTarget = null;
      m.mode = 'mission'; m.job = job; m.jobT = 0; m.stop();
    }
    if (kind === 'run' || kind === 'scout') {
      for (const m of team) { m.mode = 'away'; m.job = null; m.awayUntil = this.clock + (kind === 'scout' ? 4 + Math.random() * 2.5 : 3 + Math.random() * 2); m.runJob = kind === 'scout' ? 'scout' : true; }
      this.soc.camp.log(kind === 'scout' ? `${names(team)} went out looking for survivors.` : `${names(team)} went out on a supply run.`, 'trip', { who: team.map((m) => m.person.name) });
      return job;
    }
    if (kind === 'recruit' && opts.target) opts.target.pitchBy = team[0];
    this.list.push(job);
    this.soc.camp.log(`${names(team)} headed out: ${job.title.replace(/^[A-Z]/, (c) => c.toLowerCase())}.`, 'plan', { who: team.map((m) => m.person.name) });
    const lead = team[0];
    lead.say(['On our way.', 'We’ll be back before you know it.', 'Got it. Moving out.', 'Let’s get this done.'][Math.floor(Math.random() * 4)]);
    return job;
  }
  cancel(m) {
    const job = m.job;
    m.job = null; m.jobHome = false; m.homeBound = false; m.jobItem = null; m.jobGoT = 0;
    if (job) {
      job.team = job.team.filter((x) => x !== m);
      if (!job.team.length) { job.done = true; this.list = this.list.filter((x) => x !== job); }
    }
    m.mode = this.soc.camp.claim ? 'travel' : 'follow';
  }
  status(m) {
    const j = m.job;
    if (!j) return 'On a job';
    if (j.stage === 'go') return `${j.title} · on the way`;
    if (j.stage === 'work') return `${j.title} · ${j.kind === 'raid' ? 'at their camp' : j.kind === 'recruit' ? 'talking' : 'searching'}`;
    return `${j.title} · heading home`;
  }
  // ---------------- one member's head ----------------
  brain(m, dt, near) {
    const j = m.job;
    m.locked = false;
    if (!j) { m.mode = this.soc.camp.claim ? 'travel' : 'follow'; return; }
    // hurt or spent: break off and go home
    if ((m.health < m.maxHealth * 0.3 || exhausted(m)) && j.stage !== 'home') { m.say(m.health < m.maxHealth * 0.3 ? 'I’m hit bad. Falling back!' : 'I’ve got nothing left. Heading back.'); return this.goHome(m); }
    const threat = this.soc.threatNear(m, j.kind === 'raid' ? 30 : 12);
    if (threat && !(j.stage === 'home' && Math.hypot(threat.pos.x - m.pos.x, threat.pos.z - m.pos.z) > 6)) return this.soc.fight(m, threat, dt);
    m.combatTarget = null; m.aiming = false;
    if (m.orderTarget && !m.orderTarget.dead) return this.soc.fight(m, m.orderTarget, dt);
    this.soc.tactics.idle(m, dt);
    m.orderTarget = null;
    if (m.jobHome) return this.homeBrain(m, dt, near);
    const tgt = this.targetFor(m, j);
    if (!tgt) return this.goHome(m);
    const d = Math.hypot(tgt.x - m.pos.x, tgt.z - m.pos.z), dy = Math.abs(tgt.y - m.pos.y);
    if (j.kind === 'recruit' && j.team[0] !== m) {
      // the others hang back a few steps while the talker talks
      if (d > 5) { m.jobRepath = (m.jobRepath || 0) - dt; if (!m.path || m.jobRepath <= 0) { m.jobRepath = 3; this.walk(m, tgt, d > 40); } }
      else { m.stop(); m.faceTarget = tgt; if (!m.anim.act) m.setAct('idle_crossed'); }
      return;
    }
    if (j.kind === 'recruit' && d < 2.4 && dy < 1.3) return this.talkBrain(m, j, dt);
    // walking there (spread out a little, not single file on one spot)
    if (d > (j.kind === 'goto' ? 1.2 : j.kind === 'recruit' ? 2.2 : 1.6) || dy > 1.3) {
      // can't get to it (or taking far too long): try the next thing
      m.jobGoT = (m.jobGoT || 0) + dt;
      if (j.kind !== 'goto' && m.jobItem && (m.jobGoT > 50 || (!m.path && m.partial && m.jobGoT > 5))) {
        (m.jobItem.failed || (m.jobItem.failed = new Set())).add(m);
        m.jobItem = null; m.jobGoT = 0; m.stop();
        if (j.kind === 'scavenge' && this.nextContainer(j, m)) return;
        return this.goHome(m);
      }
      m.jobRepath = (m.jobRepath || 0) - dt;
      if (!m.path || m.jobRepath <= 0) { m.jobRepath = 4; this.walk(m, tgt, j.kind === 'raid' && d < 40 ? false : d > 40); }
      if (m.anim.act) m.setAct(null);
      return;
    }
    m.stop(); m.jobGoT = 0;
    if (j.kind === 'goto') { j.stage = 'work'; if (!m.anim.act) m.setAct('idle_crossed'); m.lookAt = null; return; }
    // searching what's in front of them
    j.stage = 'work';
    m.setAct('kneel_work');
    m.jobT += dt;
    if (m.jobT < 2.8 * statEffects(m.stats).search) return;
    m.jobT = 0;
    m.setAct(null);
    const it = m.jobItem;
    m.jobItem = null;
    if (it) this.searchFor(m, it, j);
    if (j.kind === 'scavenge' && m.pack.room() > 2 && this.nextContainer(j, m)) return;
    if (j.kind !== 'scavenge' || !this.nextContainer(j, m)) this.goHome(m);
  }
  // where this member should be heading right now
  targetFor(m, j) {
    if (j.kind === 'goto') { const i = j.team.indexOf(m), a = i * 2.1; return { x: j.at.x + Math.cos(a) * (i ? 1.4 : 0), y: j.at.y, z: j.at.z + Math.sin(a) * (i ? 1.4 : 0) }; }
    if (j.kind === 'cache') {
      const it = this.findCache(j);
      if (!it || it.searched) return null;
      m.jobItem = it;
      return { x: it.pos[0], y: it.pos[1] - 0.8, z: it.pos[2] };
    }
    if (j.kind === 'scavenge') { if (!m.jobItem) this.nextContainer(j, m); const it = m.jobItem; return it ? { x: it.pos[0], y: it.pos[1] - 0.8, z: it.pos[2] } : null; }
    if (j.kind === 'recruit') {
      const t = j.target;
      if (!t || t.dead || t.faction !== 'stranger' || t.angry || !this.soc.npcs.includes(t) || j.resolved) return null;
      return { x: t.pos.x, y: t.pos.y, z: t.pos.z };
    }
    if (j.kind === 'raid') {
      const c = this.soc.raiders.camps.find((x) => x.id === j.camp);
      if (!c || c.gone || c.stashLooted) return null;
      // close in: if nobody's watching, it plays out on the odds
      const d = Math.hypot(c.x - m.pos.x, c.z - m.pos.z);
      if (d < 26 && !c.live && !j.resolved) { this.resolveRaid(j, c); return null; }
      const stash = c.S && c.S.interact.find((x) => x.table === 'raider_stash' && !x.searched);
      if (!stash) return null;
      if (c.live && c.state !== 'hostile' && d < 30 && !j.alerted) { j.alerted = true; }
      m.jobItem = stash;
      return { x: stash.pos[0], y: stash.pos[1] - 0.8, z: stash.pos[2] };
    }
    return null;
  }
  findCache(j) {
    for (const S of this.game.world.structures) for (const it of S.interact) if (it.prop && it.prop.mission === j.mission) return it;
    return null;
  }
  // the next unsearched container in the building, nearest first
  nextContainer(j, m) {
    const S = j.structure;
    if (!S) return false;
    const taken = new Set(j.team.filter((o) => o !== m).map((o) => o.jobItem));
    const left = S.interact.filter((it) => !it.searched && !taken.has(it) && !(it.failed && it.failed.has(m)));
    // nearest first, and the floor they're on before the next one up
    left.sort((a, b) => Math.hypot(a.pos[0] - m.pos.x, a.pos[2] - m.pos.z) + Math.abs(a.pos[1] - 0.8 - m.pos.y) * 4 - Math.hypot(b.pos[0] - m.pos.x, b.pos[2] - m.pos.z) - Math.abs(b.pos[1] - 0.8 - m.pos.y) * 4);
    m.jobItem = left[0] || null;
    return !!m.jobItem;
  }
  searchFor(m, it, j) {
    if (it.searched) return;
    const entries = it.left || [...rollLoot(it.table, statEffects(m.stats).loot), ...(it.extra || [])];
    if (!it.left) this.soc.trained(m, 'scav', 2);
    it.extra = null;
    const { got, left, taken } = this.game.giveLoot(m, entries);
    it.left = left.length ? left : null;
    it.searched = !left.length;
    if (it.prop) it.prop.searched = it.searched;
    const tally = j.loot || (j.loot = {});
    for (const e of taken) tally[e.kind + ':' + e.id] = (tally[e.kind + ':' + e.id] || 0) + e.n;
    if (it.table === 'raider_stash') this.soc.raiders.onSearched(it);
    if (it.prop && it.prop.mission) this.soc.missions.onSearched(it);
    if (this.soc.playerNear(m.pos, 35) && got.length) m.say(`Got ${got.slice(0, 2).join(', ')}.`);
  }
  walk(m, tgt, run) { m.goTo(tgt.x, tgt.y, tgt.z, run); }
  goHome(m) {
    const j = m.job;
    if (j && j.team.every((o) => o === m || o.jobHome)) j.stage = 'home';
    m.homeBound = true;
    m.jobItem = null;
    if (!this.soc.camp.claim) { this.finish(m); m.mode = 'follow'; return; }
    m.stop();
    m.jobHome = true;
  }
  homeBrain(m, dt, near) {
    const c = this.soc.camp.center();
    if (!c) { this.finish(m); m.mode = 'follow'; return; }
    const d = Math.hypot(c.x - m.pos.x, c.z - m.pos.z);
    if (d < 12) { this.finish(m); m.mode = 'camp'; m.task = null; this.game.unload(m, true); return; }
    m.jobRepath = (m.jobRepath || 0) - dt;
    if (!m.path || m.jobRepath <= 0) { m.jobRepath = 5; this.walk(m, { x: c.x + 2, y: c.y, z: c.z + 2 }, false); }
  }
  finish(m) {
    const j = m.job;
    m.job = null; m.homeBound = false; m.jobHome = false;
    if (!j) return;
    if (j.kind === 'recruit' && j.target && j.target.pitchBy === m && j.target.faction === 'stranger') j.target.pitchBy = null;
    j.team = j.team.filter((x) => x !== m);
    if (!j.team.length && !j.done) {
      j.done = true;
      if (j.kind === 'recruit') { this.list = this.list.filter((x) => x !== j); return; }
      const got = tallyText(j.loot || {});
      this.soc.camp.log(`${j.title}: done${got ? '. Brought back ' + got : ', nothing worth carrying'}.`, 'trip', { who: [m.person.name] });
      this.list = this.list.filter((x) => x !== j);
    }
  }
  // a raid nobody watched: how it went depends on numbers, guns and the plan
  resolveRaid(j, c) {
    j.resolved = true;
    const team = j.team.filter((m) => !m.dead);
    const alive = c.roster.filter((r) => !r.dead);
    const night = this.game.sky.time > 22 || this.game.sky.time < 5;
    const { edge, them } = this.raidOdds(team, c);
    const won = edge + Math.random() * 3 > them;
    const log = this.soc.camp;
    if (won) {
      const stash = c.S && c.S.interact.find((x) => x.table === 'raider_stash' && !x.searched);
      if (stash) { const m = team[0]; this.searchFor(m, stash, j); }
      const k = Math.min(alive.length, Math.floor(Math.random() * 3));
      for (let i = 0; i < k; i++) alive[i].dead = true;
      c.losses += k; c.grudge += 3;
      for (const m of team) if (Math.random() < 0.35) maybeInjure(m, 'shot', 20);
      log.log(`${names(team)} hit ${c.name} and got away with their stash${k ? `; ${k} of them won’t be back` : ''}.`, 'raid', { who: team.map((m) => m.person.name), crew: c.name });
      this.soc.missions.onEvent('stash', c);
    } else {
      for (const m of team) { m.health = Math.max(8, m.health - 25 - Math.random() * 30); maybeInjure(m, 'shot', 30); }
      // someone may not make it back: likelier the worse the odds were
      const pLost = Math.max(0.04, Math.min(0.3, 0.06 + (them / Math.max(0.5, edge) - 1) * 0.08));
      const lost = Math.random() < pLost ? team[Math.floor(Math.random() * team.length)] : null;
      if (lost && team.length > 1) { lost.die(null); }
      c.grudge += 2;
      log.log(`${names(team)} tried ${c.name} and were driven off${lost && lost.dead ? `. ${lost.person.name} didn’t make it` : ''}.`, 'raid', { who: team.map((m) => m.person.name), crew: c.name });
    }
    this.game.hud.toast(won ? `The raid on ${c.name} worked.` : `The raid on ${c.name} went wrong.`, 4);
    for (const m of team) if (!m.dead) this.goHome(m);
    j.stage = 'home';
  }
  update(dt) {}
  // ---------------- recruiting ----------------
  // how likely someone is to talk this stranger into coming back: 0..1
  pitchOdds(by, t) {
    if (!t || t.recruitable === false && t.rumors) return 0;
    const camp = this.soc.camp;
    if (camp.members.filter((x) => !x.dead).length >= 12 || camp.usedBackgrounds().has(t.person.background)) return 0;
    const charm = (by && by.stats ? by.stats.charm : 5);
    const gift = t.want && !t.gotWant && this.game.storage.count(t.want[0] === 'ammo' ? 'ammo' : 'res', t.want[0] === 'ammo' ? '9mm' : t.want[0]) >= t.want[1];
    let p = 0.12 + charm * 0.06 + t.rel('player') * 0.9 + (t.tr.social - 0.5) * 0.25 + (t.tr.warmth - 0.5) * 0.15 + (gift ? 0.22 : 0) - (t.pitchFails || 0) * 0.12;
    if (t.recruitable === false) p *= 0.15;
    const pr = this.game.profile;
    if (pr && pr.traits && pr.traits.includes('lonewolf')) p -= 0.1;
    return Math.max(0.03, Math.min(0.92, p));
  }
  oddsWord(p) { return p >= 0.7 ? 'good odds' : p >= 0.45 ? 'fair odds' : p >= 0.2 ? 'long shot' : p > 0.05 ? 'very unlikely' : 'won’t come'; }
  talkBrain(m, j, dt) {
    const t = j.target;
    m.stop(); m.faceTarget = t.pos; m.lookAt = t.pos;
    t.pitchBy = m; t.pitchUntil = t.t + 2;
    j.stage = 'work';
    j.talkT = (j.talkT || 0) + dt;
    const near = this.soc.playerNear(m.pos, 40) || (this.game.command.active && Math.hypot(this.game.command.cam.x - m.pos.x, this.game.command.cam.z - m.pos.z) < 60);
    if (!j.said0 && j.talkT > 0.6) { j.said0 = true; m.say([`Hey. Easy. I’m ${m.first}. We’ve got a camp not far from here.`, `You’ve been out here alone a while, haven’t you? We’ve got room.`, `Name’s ${m.first}. We’re set up close by. Food, walls, people. Come see.`][Math.floor(Math.random() * 3)], 4); }
    if (!j.said1 && j.talkT > 3.6) { j.said1 = true; t.say(t.recruitable === false ? (t.own || 'I’ve got my own people.') : ['Why would I trust you?', 'What’s the catch?', 'How many of you are there?', 'You got food? Real food?'][Math.floor(Math.random() * 4)], 3.5); }
    if (j.talkT < 7) { if (!m.anim.act || m.anim.act !== 'talk') m.setAct(m.speaking > 0 ? 'talk' : null); return; }
    // it's decided
    j.resolved = true;
    m.setAct(null);
    const camp = this.soc.camp, p = this.pitchOdds(m, t), ok = Math.random() < p;
    if (ok) {
      // what they asked for comes out of storage
      if (t.want && !t.gotWant) {
        const [k, n] = t.want, kind = k === 'ammo' ? 'ammo' : 'res', id = k === 'ammo' ? '9mm' : k;
        if (this.game.storage.count(kind, id) >= n) { this.game.storage.take(kind, id, n); t.gotWant = true; }
      }
      this.soc.strangers.recruitedBy(t, m);
      t.say(['All right. I’ll come. Don’t make me regret it.', 'Okay. Okay. Lead the way.', 'Lord knows I can’t do another night out here. Fine.'][Math.floor(Math.random() * 3)], 3.5);
      camp.log(`${m.person.name} talked ${t.person.name} into joining the camp. ${t.bg ? t.bg.job + '.' : ''}`, 'join', { who: [m.person.name, t.person.name] });
      this.soc.trained(m, 'charm', 7);
      if (near || this.game.command.active) this.game.hud.toast(`${t.person.name} is coming back with ${m.first}`, 4);
      (j.got || (j.got = [])).push(t.person.name);
    } else {
      t.pitchFails = (t.pitchFails || 0) + 1;
      t.adjust('player', -0.03);
      t.pitchBy = null;
      t.say(t.recruitable === false ? 'I said no. I’ve got people.' : ['No. I’m better off on my own.', 'Not today. Maybe not ever.', 'I don’t know you. Go on.'][Math.floor(Math.random() * 3)], 3);
      camp.log(`${m.person.name} tried to talk ${t.person.name} into joining. ${t.recruitable === false ? 'They have people of their own.' : 'They weren’t having it.'}`, 'trip', { who: [m.person.name] });
      this.soc.trained(m, 'charm', 2.5);
      if (this.game.command.active) this.game.hud.toast(`${t.first} said no to ${m.first}`, 3);
      // a hothead talked at too long takes it badly
      if (t.recruitable && t.pitchFails >= 2 && t.tr.temper > 0.75 && Math.random() < 0.4) { t.angry = true; t.say('I said NO. Get out of here!', 2.5); }
    }
    for (const o of j.team) this.goHome(o);
  }
  // back from looking for survivors: someone, a lead, or nothing
  scoutBack(m) {
    const camp = this.soc.camp, c = camp.center(), size = camp.members.filter((x) => !x.dead).length;
    const st = m.stats || {};
    let p = 0.16 + (st.charm || 5) * 0.05 + (st.endure || 5) * 0.01;
    if (size >= 8) p *= 0.55;
    if (size >= 12) p = 0;
    const roll = Math.random();
    let text;
    if (roll < p) {
      const person = makePerson(Math.random, camp.usedBackgrounds(), { lastNames: camp.usedLastNames(), firstNames: camp.usedFirstNames() });
      const at = c || m.pos;
      const n = this.soc.spawn(person, { x: at.x + 3 + Math.random() * 2, z: at.z + 3 + Math.random() * 2, y: at.y, faction: 'camp', mode: c ? 'camp' : 'follow' });
      n.rels.player = 0.12; n.rels[m.person.id] = 0.35; m.rels[n.person.id] = Math.max(m.rel(n.person.id), 0.25);
      camp.add(n, true);
      n.mode = c ? 'camp' : 'follow';
      const where = ['holed up in a grain bin', 'hiding in a church attic', 'living out of a car by the river', 'up a deer stand, out of water', 'barricaded in a farmhouse cellar'][Math.floor(Math.random() * 5)];
      text = `${m.person.name} came back with ${n.person.name}, found ${where}.`;
      this.soc.trained(m, 'charm', 7);
      this.game.hud.toast(`${m.first} brought back ${n.person.name}`, 4);
    } else if (roll < p + 0.35 && size < 12) {
      // a lead: somebody camped out there, if someone goes to talk to them
      const gr = this.soc.strangers.spawnGroup(this.soc.strangers.spot(c || m.pos, 90, 220));
      if (gr) {
        gr.known = true; gr.until = this.clock + 30;
        text = `${m.person.name} found someone camped ${compass(gr.x - (c || m.pos).x, gr.z - (c || m.pos).z)} of here, but they wouldn’t come without talking it over. Send someone to recruit them.`;
        this.soc.trained(m, 'charm', 3);
      } else text = `${m.person.name} looked all day and found nobody who’d come.`;
    } else text = `${m.person.name} looked all day and found nobody alive, or nobody who’d come.`;
    camp.log(text, 'trip', { who: [m.person.name] });
    return text;
  }
  // how a team stacks up against a crew: { edge, them, word }
  raidOdds(team, c) {
    const mods = this.soc.raiders, alive = c.roster.filter((r) => !r.dead);
    const night = this.game.sky.time > 22 || this.game.sky.time < 5;
    let edge = team.reduce((s, m) => s + 1 + m.skill('combat') * 0.4 + m.skill('shooting') * 0.4 + (m.gear && m.gear.gun ? 1 : 0) - (m.fatigue > 85 ? 0.4 : 0) - m.injuries.length * 0.2, 0);
    let them = alive.reduce((s, r) => s + 1.2 + (r.weapon === 'gun' ? 0.7 : 0), 0);
    if (mods.modOn(c, 'drugged')) them *= 0.25;
    if (mods.modOn(c, 'night') && night) them *= 0.55;
    if (c.distractAt) them *= 0.5;
    if (c.scouted) edge *= 1.2;
    const r = (edge + 1.5) / Math.max(0.5, them);
    return { edge, them, word: r > 1.4 ? 'good odds' : r > 1 ? 'fair odds' : r > 0.7 ? 'risky' : 'long odds' };
  }
  // back from hours out (a supply run you sent, or a trip of their own):
  // what they found goes into storage; they come back worn, sometimes hurt
  comeBack(m) {
    const camp = this.soc.camp, c = camp.center();
    const hunt = m.role === 'hunter' && !m.runJob;
    if (m.runJob === 'scout') {
      m.runJob = false;
      m.mode = c ? 'camp' : 'follow';
      if (c) { const a = Math.random() * Math.PI * 2; m.pos.set(c.x + Math.cos(a) * 14, 0, c.z + Math.sin(a) * 14); m.pos.y = this.game.physics.groundAt(m.pos.x, m.pos.z, this.game.world.terrain.height(m.pos.x, m.pos.z) + 0.6); m.visualY = m.pos.y; }
      addFatigue(m, 40 / (m.leader ? 0.3 : 1));
      if (Math.random() < 0.15) maybeInjure(m, 'zombie', 40);
      this.scoutBack(m);
      this.game.markDirty && this.game.markDirty();
      return;
    }
    m.runJob = false;
    m.mode = c ? 'camp' : 'follow';
    if (c) {
      const a = Math.random() * Math.PI * 2;
      m.pos.set(c.x + Math.cos(a) * 14, 0, c.z + Math.sin(a) * 14);
      m.pos.y = this.game.physics.groundAt(m.pos.x, m.pos.z, this.game.world.terrain.height(m.pos.x, m.pos.z) + 0.6);
      m.visualY = m.pos.y;
    }
    const tally = {};
    const add = (list) => { for (const e of this.game.giveLoot(m, list).taken) tally[e.kind + ':' + e.id] = (tally[e.kind + ':' + e.id] || 0) + e.n; };
    const skill = m.skill(hunt ? 'shooting' : 'scavenging');
    if (hunt) {
      const n = Math.random() < 0.25 ? 0 : 1 + Math.floor(Math.random() * (2 + skill));
      if (n) add([{ kind: 'res', id: 'food', n }]);
    } else {
      // a few hours out always turns up something to eat or burn
      add([{ kind: 'res', id: 'food', n: 1 + Math.floor(Math.random() * 3) }, { kind: 'res', id: ['wood', 'metal', 'fuel'][Math.floor(Math.random() * 3)], n: 2 + Math.floor(Math.random() * 4) }]);
      const tables = ['kitchen', 'garage', 'bedroom', 'store', 'hardware', 'truck', 'car', 'supply_run'];
      for (let i = 0; i < 3 + skill; i++) add(rollLoot(tables[Math.floor(Math.random() * tables.length)], 1.3));
    }
    addFatigue(m, (hunt ? 30 : 45) / (m.leader ? 0.3 : 1));
    const hurt = Math.random() < 0.2 - skill * 0.03 ? maybeInjure(m, 'zombie', 40) : null;
    if (hurt) m.health = Math.max(m.maxHealth * 0.4, m.health - 20);
    this.game.unload(m, true);
    const got = tallyText(tally);
    const what = hunt ? 'a hunt' : 'a supply run';
    camp.log(`${m.person.name} came back from ${what}${got ? ' with ' + got : ' empty-handed'}${hurt ? `, and a ${hurt.name.toLowerCase()}` : ''}.`, hurt ? 'hurt' : 'trip', { who: [m.person.name] });
    m.say(hurt ? 'Ran into trouble out there. I\u2019m all right. Mostly.' : got ? (hunt ? 'Brought back something to eat.' : 'Not a bad haul.') : m.tr.humor > 0.6 ? 'The deer won today.' : 'Nothing out there today.');
    this.game.markDirty && this.game.markDirty();
  }
}
function names(team) {
  const n = team.map((m) => m.first);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0];
}
export { CELL };
