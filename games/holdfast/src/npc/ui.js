// What you see of other people: speech bubbles over heads, the talk panel
// (with everything you can say to a camp member or a stranger), the camp
// panel (people, journal, overheard talk, plans), the HUD objective and map
// markers.
import * as THREE from 'three';
import { ROLES, PERSONALITIES, BACKGROUND_BY_ID } from './people.js';
import { ACT_NAMES } from './camp.js';
import { isTouch } from '../platform.js';

const v = new THREE.Vector3();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SKILL_NAMES = { cooking: 'Cooking', medicine: 'Medicine', mechanics: 'Mechanics', combat: 'Fighting', shooting: 'Shooting', scavenging: 'Scavenging', farming: 'Farming', building: 'Building', leadership: 'Leadership', stealth: 'Stealth' };
const ROLE_SKILL = { cook: 'cooking', farmer: 'farming', medic: 'medicine', mechanic: 'mechanics', builder: 'building', guard: 'combat', hunter: 'shooting', scavenger: 'scavenging', quartermaster: 'leadership', counselor: 'leadership' };

export function relWord(r) {
  return r > 0.6 ? 'Would die for you' : r > 0.35 ? 'Trusts you' : r > 0.12 ? 'Friendly' : r > -0.12 ? 'Neutral' : r > -0.4 ? 'Wary of you' : 'Can’t stand you';
}
export function moodWord(m) { return m > 0.66 ? 'Content' : m > 0.44 ? 'Okay' : m > 0.3 ? 'Low' : m > 0.17 ? 'Miserable' : 'At breaking point'; }
const hhmm = (t) => { const h = Math.floor(t), m = Math.floor((t - h) * 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

export class NpcUI {
  constructor(soc) {
    this.soc = soc; this.game = soc.game;
    const ui = document.getElementById('ui');
    this.layer = document.createElement('div');
    this.layer.className = 'npc-layer';
    ui.appendChild(this.layer);
    this.bubbles = new Map();
    // talk panel
    const t = this.talkEl = document.createElement('div');
    t.className = 'talk'; t.hidden = true;
    t.innerHTML = `<div class="talk-head"><div><b id="talk-name"></b><span id="talk-sub"></span></div><div id="talk-meta"></div></div><div class="talk-log" id="talk-log"></div><div class="talk-opts" id="talk-opts"></div>`;
    ui.appendChild(t);
    // camp panel
    const c = this.campEl = document.createElement('div');
    c.className = 'overlay camp-panel'; c.hidden = true;
    c.innerHTML = `<div class="panel wide"><div class="camp-top"><h2 id="camp-title">Camp</h2><button id="camp-close">${isTouch ? 'Close' : 'Close (J)'}</button></div>
      <div class="tabs"><button data-tab="people" class="on">People</button><button data-tab="journal">Journal</button><button data-tab="heard">Overheard</button><button data-tab="plans">Plans</button></div><div id="camp-body"></div></div>`;
    ui.appendChild(c);
    c.querySelector('#camp-close').addEventListener('click', () => this.toggleCamp(false));
    for (const b of c.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderCamp(); });
    this.tab = 'people';
    // objective line under the clock
    const tl = document.querySelector('.hud-top-left');
    this.objEl = document.createElement('div');
    this.objEl.id = 'hud-obj';
    tl && tl.appendChild(this.objEl);
    addEventListener('keydown', (e) => {
      if (!this.talking || this.talkEl.hidden) return;
      const n = +e.key;
      if (n >= 1 && n <= 9) { const b = this.talkEl.querySelectorAll('.talk-opts button')[n - 1]; if (b) { b.click(); e.preventDefault(); } }
    });
  }

  // ---------------- bubbles ----------------
  bubble(npc, text, dur) {
    let b = this.bubbles.get(npc);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      el.innerHTML = '<b></b><span></span>';
      el.style.display = 'none'; // until it's placed over their head
      this.layer.appendChild(el);
      b = { el, t: 0 };
      this.bubbles.set(npc, b);
    }
    b.el.querySelector('b').textContent = npc.first;
    b.el.querySelector('span').textContent = text;
    b.el.classList.toggle('raider', npc.faction === 'raider');
    b.t = dur;
    if (this.talking === npc) this.addLog(npc.first, text);
  }
  forget(npc) { const b = this.bubbles.get(npc); if (b) { b.el.remove(); this.bubbles.delete(npc); } if (this.talking === npc) this.closeTalk(); }
  update(dt) {
    const cam = this.game.camera, W = innerWidth, H = innerHeight;
    for (const [npc, b] of this.bubbles) {
      b.t -= dt;
      const d = cam.position.distanceTo(npc.pos);
      if (b.t <= 0 || npc.dead || !npc.char.root.visible) { b.el.remove(); this.bubbles.delete(npc); continue; }
      if (d > 28 || (this.talking === npc)) { b.el.style.display = 'none'; continue; }
      const head = npc.anim.lie ? 0.55 : npc.seated ? 1.45 : 2.0;
      v.set(npc.pos.x, (npc.anim.lie ? npc.anim.lieY : npc.visualY) + head, npc.pos.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(0)}px, ${((1 - v.y) / 2 * H).toFixed(0)}px) translate(-50%, -100%) scale(${Math.max(0.72, 1.15 - d / 40).toFixed(2)})`;
      b.el.style.opacity = Math.min(1, b.t * 2, (28 - d) / 6).toFixed(2);
      b.el.style.zIndex = String(1000 - Math.round(d * 10));
    }
    // objective
    const obj = this.soc.missions.objective();
    const txt = obj ? 'Plan: ' + obj : '';
    if (txt !== this.lastObj) { this.lastObj = txt; this.objEl.textContent = txt; }
    if (this.talking) this.updateTalkMeta();
    if (!this.campEl.hidden) { this.campT = (this.campT || 0) - dt; if (this.campT <= 0) { this.campT = 1; if (this.tab === 'people' && !this.detail) this.renderCamp(); } }
  }
  journalChanged() { if (!this.campEl.hidden && this.tab === 'journal') this.renderCamp(); }

  // ---------------- talking ----------------
  openTalk(npc) {
    const g = this.game;
    if (this.talking) this.closeTalk();
    this.talking = npc;
    npc.talking = true;
    g.modalOpen = true; g.input.uiCapture = true; g.input.exitLock();
    this.talkEl.hidden = false;
    g.hud.setPrompt(null);
    this.talkEl.querySelector('#talk-log').innerHTML = '';
    const r = npc.rel('player');
    const sp = this.soc.speech;
    const hello = npc.faction === 'stranger' && !npc.met ? 'hello0' : r > 0.35 ? 'hello2' : r > -0.1 ? 'hello1' : 'hello0';
    npc.met = true;
    if (npc.sleeping) { npc.sleeping = false; if (npc.task && npc.task.slot) npc.task.slot.user = null; npc.task = null; npc.setAct(null); this.say(npc, ['Mm? What is it?', 'I’m up, I’m up.', 'This better be good.'][Math.floor(Math.random() * 3)]); }
    else this.say(npc, sp.line(npc, hello, { you: this.soc.playerName() }));
    // a grudge colours the greeting
    if (npc.faction === 'camp' && npc.idea && !npc.ideaPitched) this.say(npc, sp.line(npc, 'idea'));
    npc.adjust('player', npc.talkedDay === g.day ? 0.002 : 0.02);
    npc.talkedDay = g.day;
    this.updateTalkMeta();
    this.menu();
  }
  closeTalk() {
    const npc = this.talking, g = this.game;
    if (npc) { npc.talking = false; npc.faceTarget = null; npc.lookAt = null; npc.listening = false; }
    this.talking = null;
    this.talkEl.hidden = true;
    g.modalOpen = false; g.input.uiCapture = false;
  }
  say(npc, text) { if (!text) return; npc.say(text); }
  addLog(who, text, me = false) {
    const log = this.talkEl.querySelector('#talk-log');
    const d = document.createElement('p');
    d.className = me ? 'me' : '';
    d.innerHTML = `<b>${esc(who)}</b> ${esc(text)}`;
    log.appendChild(d);
    while (log.children.length > 6) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  updateTalkMeta() {
    const n = this.talking;
    if (!n) return;
    const p = PERSONALITIES[n.person.personality], bg = BACKGROUND_BY_ID[n.person.background];
    this.talkEl.querySelector('#talk-name').textContent = n.person.name;
    const known = n.faction === 'camp' || (n.knows.player || n.person.story) > 0;
    this.talkEl.querySelector('#talk-sub').textContent = ` · ${p.name}${known ? ' · ' + bg.job : ''}${n.faction === 'camp' ? ' · ' + ROLES[n.role].name : ''}`;
    const meta = n.faction === 'camp'
      ? `${relWord(n.rel('player'))} · ${moodWord(n.mood)} · ${this.soc.camp.activity(n)}${n.health < 60 ? ' · Hurt' : ''}`
      : `${relWord(n.rel('player'))} · Stranger${n.recruitable === false && n.rumors ? ' · has own people' : ''}`;
    const el = this.talkEl.querySelector('#talk-meta');
    if (el.textContent !== meta) el.textContent = meta;
  }
  // option buttons: [label, fn]
  options(list) {
    const box = this.talkEl.querySelector('#talk-opts');
    box.innerHTML = '';
    list.forEach(([label, fn], i) => {
      const b = document.createElement('button');
      b.innerHTML = `${isTouch ? '' : `<span class="k">${i + 1}</span>`}${esc(label)}`;
      b.addEventListener('click', () => { if (fn !== this.menu && !label.startsWith('←')) this.addLog('You', label, true); fn.call(this); });
      box.appendChild(b);
    });
  }
  menu() {
    const n = this.talking;
    if (!n) return;
    if (n.faction === 'stranger') return this.strangerMenu();
    const sp = this.soc.speech, camp = this.soc.camp, pl = this.game.player;
    const o = [];
    o.push(['How are you holding up?', () => { this.howAreYou(n); this.menu(); }]);
    o.push(['Tell me about yourself.', () => { this.story(n); this.menu(); }]);
    const others = camp.members.filter((m) => m !== n && !m.dead);
    if (others.length) o.push(['What do you think of…', () => this.opinionMenu(n, others)]);
    if (n.idea || this.soc.missions.ideaFor(n)) o.push(['You said you had an idea?', () => this.ideaMenu(n)]);
    else o.push(['Got any ideas?', () => { this.say(n, ['Nothing right now. I’ll let you know.', 'Not today. Ask me later.', 'Thinking on it.'][Math.floor(Math.random() * 3)]); this.menu(); }]);
    if (n.dispute && !n.dispute.settled && !n.dispute.a.dead && !n.dispute.b.dead) { const other = n.dispute.a === n ? n.dispute.b : n.dispute.a; o.push([`About you and ${other.first}…`, () => this.disputeMenu(n, other)]); }
    if (n.skill('medicine') >= 2 && pl.health < pl.maxHealth * 0.85) o.push(['Can you patch me up?', () => { this.patch(n); this.menu(); }]);
    if (n.mode === 'follow') {
      o.push(['Wait here.', () => { n.mode = 'wait'; n.waitAt = { x: n.pos.x, y: n.pos.y, z: n.pos.z }; this.say(n, sp.line(n, 'wait')); this.menu(); }]);
      if (camp.claim) o.push(['Head back to camp.', () => { n.mode = 'travel'; n.setAct(null); this.say(n, sp.line(n, 'home')); this.menu(); }]);
    } else if (n.mode === 'wait') {
      o.push(['Come on, let’s go.', () => { n.mode = 'follow'; n.setAct(null); this.say(n, sp.line(n, 'follow_yes')); this.menu(); }]);
      if (camp.claim) o.push(['Head back to camp.', () => { n.mode = 'travel'; n.setAct(null); this.say(n, sp.line(n, 'home')); this.menu(); }]);
    } else if (n.mode === 'camp' || n.mode === 'travel') {
      o.push(['Come with me.', () => { this.askFollow(n); this.menu(); }]);
    }
    if (camp.claim) o.push(['About your job…', () => this.jobMenu(n)]);
    o.push(['Goodbye.', () => { this.say(n, sp.line(n, 'bye')); setTimeout(() => this.talking === n && this.closeTalk(), 250); }]);
    this.options(o);
  }
  howAreYou(n) {
    const sp = this.soc.speech, m = n.mood;
    this.say(n, sp.line(n, m > 0.62 ? 'mood_good' : m > 0.38 ? 'mood_ok' : 'mood_bad'));
    const camp = this.soc.camp;
    const extra = [];
    if (n.grief > 0 && n.griefFor) extra.push(sp.line(n, 'r_grief', { other: n.griefFor }));
    if (n.needs.hunger > 65) extra.push(sp.line(n, 'r_hungry'));
    if (n.needs.energy < 28) extra.push(sp.line(n, 'r_tired'));
    if (n.dispute && !n.dispute.settled) { const o = n.dispute.a === n ? n.dispute.b : n.dispute.a; extra.push(n.tr.temper > 0.6 ? `And ${o.first} can go to hell.` : `Still sore about ${o.first}, if I'm honest.`); }
    if (n.health < 50) extra.push(n.tr.bravery > 0.6 ? 'Took a few knocks. I’ll live.' : 'I’m hurt. It’s bad.');
    const fr = camp.members.filter((o) => o !== n && !o.dead).sort((a, b) => n.rel(b.person.id) - n.rel(a.person.id))[0];
    if (!extra.length && fr && n.rel(fr.person.id) > 0.4 && Math.random() < 0.5) extra.push(`${fr.first}'s been good company. Makes this easier.`);
    if (!extra.length && n.role !== n.bg.role && Math.random() < 0.6) extra.push(n.tr.honesty > 0.6 ? `Honestly? I'd rather be doing ${ROLES[n.bg.role].name.toLowerCase()} work.` : '');
    const e = extra.filter(Boolean)[0];
    if (e) setTimeout(() => this.talking === n && this.say(n, e), 1400);
  }
  story(n) {
    const sp = this.soc.speech;
    const told = n.person.story || 0;
    if (told >= 4) return this.say(n, sp.line(n, 'no_more_story'));
    if (told >= n.storyLimit('player')) return this.say(n, sp.line(n, 'story_locked'));
    this.say(n, sp.chapter(n, told));
    n.person.story = told + 1;
    n.adjust('player', 0.04);
    if (told + 1 === 4) this.soc.camp.log(`${n.person.name} told you everything. You know their whole story now.`, 'story');
  }
  opinionMenu(n, others) {
    const sp = this.soc.speech;
    this.options([...others.slice(0, 8).map((o) => [o.first, () => {
      const r = n.rel(o.person.id);
      this.say(n, sp.line(n, r > 0.25 ? 'op_good' : r < -0.15 ? 'op_bad' : 'op_meh', { other: o.person.name }));
      this.menu();
    }]), ['← Never mind', this.menu]]);
  }
  ideaMenu(n) {
    const ms = this.soc.missions;
    const rec = (n.idea && ms.ideaFor(n) && n.idea.key === ms.ideaFor(n).key) ? n.idea : ms.ideaFor(n);
    if (!rec) { this.say(n, 'Never mind. It doesn’t matter now.'); n.idea = null; return this.menu(); }
    n.idea = rec; n.ideaPitched = true;
    this.say(n, rec.idea.text);
    const needs = rec.idea.kind === 'raidmod' && rec.idea.mod === 'distraction' ? ' (needs 1 fuel)' : rec.idea.kind === 'raidmod' && rec.idea.mod === 'drugged' ? ' (needs sedatives or 3 meds)' : '';
    this.options([
      ['Let’s do it.' + needs, () => {
        const m = ms.accept(rec);
        n.idea = null; n.ideaPitched = false;
        if (m) { this.say(n, n.tr.optimism > 0.5 ? 'Good. You won’t regret it.' : 'All right. Let’s not screw it up.'); this.game.hud.toast(`New plan: ${m.title}`, 4); }
        else this.say(n, 'Hm. Doesn’t look like that’ll work anymore.');
        this.menu();
      }],
      ['Not right now.', () => { n.ideaCd = this.soc.clock + 12; n.idea = null; n.ideaPitched = false; this.say(n, n.tr.temper > 0.6 ? 'Your call. Wrong call, but your call.' : 'Okay. Think about it.'); n.adjust('player', -0.01); this.menu(); }],
    ]);
  }
  disputeMenu(n, other) {
    const d = n.dispute;
    const settle = (fn) => () => { d.settled = true; n.dispute = null; if (other.dispute === d) other.dispute = null; fn(); this.menu(); };
    this.options([
      ['You were in the right.', settle(() => { n.adjust('player', 0.08); other.adjust('player', -0.06); n.adjust(other.person.id, -0.02); this.say(n, n.tr.warmth > 0.5 ? 'Thank you. I needed to hear that.' : 'Damn right I was.'); this.soc.camp.log(`You took ${n.first}’s side against ${other.first}.`, 'argument'); })],
      [`${other.first} had a point.`, settle(() => { n.adjust('player', -0.06); other.adjust('player', 0.06); n.adjust(other.person.id, n.tr.honesty > 0.6 ? 0.06 : -0.02); this.say(n, n.tr.honesty > 0.6 ? '...Maybe. Maybe they did.' : n.tr.temper > 0.6 ? 'Figures you’d take their side.' : 'Fine.'); this.soc.camp.log(`You told ${n.first} that ${other.first} had a point.`, 'argument'); })],
      ['Shake hands and let it go.', settle(() => {
        const lead = this.game.mods && this.game.mods.leader ? 0.1 : 0;
        const ok = n.tr.warmth + n.rel('player') + lead > 0.55;
        n.adjust(other.person.id, ok ? 0.12 : 0.02); other.adjust(n.person.id, ok ? 0.1 : 0.02);
        this.say(n, ok ? `Fine. For you. ${other.first} and I will talk.` : 'Easy for you to say.');
        if (ok) this.soc.camp.log(`You got ${n.first} and ${other.first} to make peace.`, 'argument');
      })],
      ['← Never mind', this.menu],
    ]);
  }
  patch(n) {
    const inv = this.game.inventory, pl = this.game.player;
    if (n.skill('medicine') < 3 && inv.res.meds <= 0) return this.say(n, 'I need meds to work with. We’re out.');
    if (n.skill('medicine') < 3) inv.res.meds--;
    const h = 30 + n.skill('medicine') * 10;
    pl.heal(h);
    this.say(n, ['Hold still. There.', 'This’ll sting. ...Done.', 'Keep that clean, I mean it.'][Math.floor(Math.random() * 3)]);
    this.game.hud.toast(`${n.first} patched you up (+${h} health${n.skill('medicine') < 3 ? ', 1 meds' : ''})`, 3);
    n.adjust('player', 0.01);
  }
  askFollow(n) {
    const sp = this.soc.speech;
    const followers = this.soc.camp.members.filter((m) => m.mode === 'follow' && !m.dead).length;
    if (followers >= 3) return this.say(n, 'You’ve already got a crowd with you. Somebody has to mind the camp.');
    const no = n.health < 35 || n.needs.energy < 15 || n.rel('player') < -0.25 || (n.tr.bravery < 0.25 && n.mood < 0.35);
    if (no) return this.say(n, sp.line(n, 'follow_no'));
    if (n.task && n.task.slot) n.task.slot.user = null;
    n.task = null; n.setAct(null); n.sleeping = false;
    n.mode = 'follow';
    this.say(n, sp.line(n, 'follow_yes'));
  }
  jobMenu(n) {
    const sp = this.soc.speech;
    const bgRole = n.bg.role;
    this.options([...Object.entries(ROLES).map(([k, r]) => {
      const sk = n.skill(ROLE_SKILL[k]);
      const tag = k === n.role ? ' (current)' : k === bgRole ? ' ★' : sk >= 2 ? ' •' : '';
      return [`${r.name}${tag}`, () => {
        if (k === n.role) { this.say(n, 'That’s what I’m doing already.'); return this.menu(); }
        const likes = k === bgRole || sk >= 2;
        n.role = k;
        if (n.task && n.task.slot) n.task.slot.user = null;
        n.task = null; n.setAct(null);
        this.say(n, sp.line(n, likes ? 'role_like' : 'role_dislike'));
        if (!likes) n.adjust('player', -0.02);
        this.soc.camp.log(`${n.person.name} is the camp’s ${r.name.toLowerCase()} now.`, 'camp');
        this.menu();
      }];
    }), ['← Never mind', this.menu]]);
    this.addLog('', `★ their old line of work • they’re skilled at it`);
  }
  strangerMenu() {
    const n = this.talking, sp = this.soc.speech, st = this.soc.strangers, inv = this.game.inventory;
    const o = [];
    o.push(['Who are you?', () => {
      if (!n.person.story) { this.say(n, sp.chapter(n, 0)); n.person.story = 1; n.adjust('player', 0.05); }
      else this.say(n, n.person.story >= n.storyLimit('player') ? sp.line(n, 'story_locked') : sp.chapter(n, n.person.story++));
      this.menu();
    }]);
    o.push(['Heard anything out here?', () => {
      const r = st.rumor(n);
      this.say(n, r.text);
      if (r.idea) {
        this.options([
          ['We’ll look into it.', () => { const m = this.soc.missions.accept(r.idea); if (m) this.game.hud.toast(`New plan: ${m.title}`, 4); this.say(n, 'Good luck.'); this.menu(); }],
          ['Not interested.', this.menu],
        ]);
        return;
      }
      if (r.map) this.game.hud.toast('Marked on your map', 2.5);
      this.menu();
    }]);
    if (n.want && !n.gotWant) {
      const [res, amt, name] = n.want;
      o.push([`Need anything?`, () => {
        this.say(n, `Honestly? I could use ${name}. ${n.tr.honesty > 0.6 ? 'I won’t lie, it’s been rough.' : ''}`);
        this.options([
          [`Here. (${amt} ${res})`, () => {
            if ((inv.res[res] || 0) < amt) { this.say(n, 'You don’t have it either, huh. It’s fine.'); return this.menu(); }
            inv.res[res] -= amt; n.gotWant = true; n.adjust('player', 0.3);
            this.say(n, n.tr.warmth > 0.5 ? 'You’re a good person. I won’t forget this.' : 'Huh. Thanks. Didn’t expect that.');
            this.menu();
          }],
          ['Can’t spare it.', () => { this.say(n, 'Yeah. Nobody can.'); this.menu(); }],
        ]);
      }]);
    }
    if (n.recruitable !== undefined) o.push(['We have a camp. Come with us.', () => {
      const r = st.join(n);
      this.say(n, r.text);
      if (r.ok) { this.game.hud.toast(`${n.person.name} joined your camp`, 4); setTimeout(() => this.talking === n && this.menu(), 50); return; }
      this.menu();
    }]);
    o.push(['Take care.', () => { this.say(n, sp.line(n, 'bye')); setTimeout(() => this.talking === n && this.closeTalk(), 250); }]);
    if (n.faction === 'camp') return this.menu();
    this.options(o);
  }

  // ---------------- camp panel ----------------
  toggleCamp(v) {
    const open = v == null ? this.campEl.hidden : v;
    this.campEl.hidden = !open;
    this.game.modalOpen = open;
    this.game.input.uiCapture = open;
    this.detail = null;
    if (open) { this.game.input.exitLock(); this.renderCamp(); }
  }
  renderCamp() {
    const camp = this.soc.camp, body = this.campEl.querySelector('#camp-body');
    for (const b of this.campEl.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const alive = camp.members.filter((m) => !m.dead);
    this.campEl.querySelector('#camp-title').textContent = camp.claim ? `${camp.name === 'camp' ? 'Your camp' : camp.name} · ${alive.length} people` : `Your people · ${alive.length}`;
    let h = '';
    if (this.tab === 'people') {
      if (this.detail && alive.includes(this.detail)) return this.renderDetail(body, this.detail);
      if (!alive.length) h = '<p class="note">Nobody’s with you yet. Survivors camp out on the roads; talk to them.</p>';
      h += '<div class="people">' + alive.map((m, i) => {
        const p = PERSONALITIES[m.person.personality];
        return `<button class="person" data-i="${i}"><div class="pn"><b>${esc(m.person.name)}</b><span>${esc(ROLES[m.role].name)} · ${esc(p.name)}</span></div>
          <div class="pa">${esc(camp.activity(m))}</div>
          <div class="pb"><div class="hbar"><div class="fill hp" style="width:${(100 * m.health / m.maxHealth).toFixed(0)}%"></div></div><span>${moodWord(m.mood)} · ${relWord(m.rel('player'))}</span></div></button>`;
      }).join('') + '</div>';
      if (camp.claim) {
        const inv = this.game.inventory;
        const eat = alive.filter((m) => m.mode === 'camp').length;
        h += `<p class="note">Food: ${inv.res.food} · the camp eats about ${Math.ceil(eat * (camp.members.some((m) => m.role === 'cook' && !m.dead) ? 0.75 : 1))} a day${inv.res.food < eat ? ' — <b class="warn">running low</b>' : ''}.</p>`;
      }
      body.innerHTML = h;
      for (const b of body.querySelectorAll('.person')) b.addEventListener('click', () => { this.detail = alive[+b.dataset.i]; this.renderCamp(); });
      return;
    }
    if (this.tab === 'journal') {
      const j = [...camp.journal].reverse();
      h = j.length ? '<div class="journal">' + j.map((e) => `<p class="j-${e.kind}"><span>Day ${e.day}, ${hhmm(e.time)}</span>${esc(e.text)}</p>`).join('') + '</div>' : '<p class="note">Nothing yet.</p>';
    } else if (this.tab === 'heard') {
      const o = [...camp.overheard].reverse().slice(0, 40);
      h = o.length ? '<div class="journal heard">' + o.map((e) => `<p><span>${esc(e.who)}</span>“${esc(e.text)}”</p>`).join('') + '</div>' : '<p class="note">You haven’t overheard anything yet. People talk when they think nobody’s listening.</p>';
    } else if (this.tab === 'plans') {
      const ms = this.soc.missions;
      const act = ms.active;
      const pitching = alive.filter((m) => m.idea);
      h = act.length ? act.map((m) => `<div class="plan"><b>${esc(m.title)}</b><span>${esc(m.fromName)}’s plan</span><p>${esc(m.step || '')}</p></div>`).join('') : '<p class="note">No plans yet. Ask your people if they have ideas.</p>';
      if (pitching.length) h += `<p class="note">${pitching.map((m) => esc(m.first)).join(', ')} want${pitching.length === 1 ? 's' : ''} to talk to you about a plan.</p>`;
      const known = this.soc.raiders.active.filter((c) => c.known);
      if (known.length) h += '<h3>Raiders</h3>' + known.map((c) => `<div class="plan"><b>${esc(c.name)}</b><span>${c.scouted ? c.roster.filter((r) => !r.dead).length + ' people' : 'unknown numbers'}${c.stashLooted ? ' · stash robbed' : ''}</span></div>`).join('');
    }
    body.innerHTML = h;
  }
  renderDetail(body, m) {
    const p = PERSONALITIES[m.person.personality], bg = BACKGROUND_BY_ID[m.person.background], camp = this.soc.camp;
    const skills = Object.entries(bg.skills).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SKILL_NAMES[k]} ${'●'.repeat(v)}${'○'.repeat(3 - v)}`);
    const others = camp.members.filter((o) => o !== m && !o.dead);
    const friend = others.sort((a, b) => m.rel(b.person.id) - m.rel(a.person.id))[0];
    const rival = [...others].sort((a, b) => m.rel(a.person.id) - m.rel(b.person.id))[0];
    const told = m.person.story || 0;
    body.innerHTML = `<button class="back">← Everyone</button>
      <div class="detail"><h3>${esc(m.person.name)} <small>${m.person.age}</small></h3>
      <p><b>${esc(p.name)}.</b> ${esc(p.desc)}</p>
      <p><b>${esc(bg.job)}.</b> ${told ? esc('They ' + bg.known + '.') : 'You don’t know much about them yet.'}</p>
      <p>Role: <b>${esc(ROLES[m.role].name)}</b> — ${esc(ROLES[m.role].desc)}</p>
      <p class="skills">${skills.map(esc).join(' · ')}</p>
      <p>Right now: ${esc(camp.activity(m))}. ${moodWord(m.mood)}; ${m.needs.hunger > 60 ? 'hungry; ' : ''}${m.needs.energy < 30 ? 'exhausted; ' : ''}${m.needs.stress > 60 ? 'stressed; ' : ''}${relWord(m.rel('player')).toLowerCase()}.</p>
      ${friend && m.rel(friend.person.id) > 0.2 ? `<p>Closest to <b>${esc(friend.first)}</b>.</p>` : ''}
      ${rival && m.rel(rival.person.id) < -0.12 ? `<p>Doesn’t get along with <b>${esc(rival.first)}</b>.</p>` : ''}
      <p class="note">Story: ${told}/4 chapters heard${told < 4 ? (told >= m.storyLimit('player') ? ' — they need to trust you more' : ' — ask them about themselves') : ''}.</p></div>`;
    body.querySelector('.back').addEventListener('click', () => { this.detail = null; this.renderCamp(); });
  }

  // ---------------- map ----------------
  drawMap(ctx, X, Z) {
    const s = this.soc;
    // raider camps you know about
    for (const c of s.raiders.active) {
      if (!c.known) continue;
      ctx.strokeStyle = '#a02a1e'; ctx.fillStyle = 'rgba(160,42,30,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(c.x), Z(c.z), 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(c.x) - 4, Z(c.z) - 4); ctx.lineTo(X(c.x) + 4, Z(c.z) + 4); ctx.moveTo(X(c.x) + 4, Z(c.z) - 4); ctx.lineTo(X(c.x) - 4, Z(c.z) + 4); ctx.stroke();
      ctx.fillStyle = '#5a1a12'; ctx.font = '600 11px Oswald, Arial Narrow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(c.name.toUpperCase() + (c.scouted ? ` (${c.roster.filter((r) => !r.dead).length})` : ''), X(c.x), Z(c.z) - 12);
    }
    // plans
    for (const mk of s.missions.markers()) {
      ctx.fillStyle = '#e8b830'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(mk.x), Z(mk.z) - 7); ctx.lineTo(X(mk.x) + 6, Z(mk.z)); ctx.lineTo(X(mk.x), Z(mk.z) + 7); ctx.lineTo(X(mk.x) - 6, Z(mk.z)); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2a10'; ctx.font = '600 11px Oswald, Arial Narrow, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(mk.label, X(mk.x), Z(mk.z) + 19);
    }
    // strangers you've met
    for (const n of s.npcs) {
      if (n.dead || n.mode === 'away') continue;
      if (n.faction === 'stranger' && n.greeted) { ctx.fillStyle = '#3f7cac'; ctx.beginPath(); ctx.arc(X(n.pos.x), Z(n.pos.z), 3.5, 0, Math.PI * 2); ctx.fill(); }
      if (n.faction === 'camp') { ctx.fillStyle = '#6aaa4a'; ctx.strokeStyle = '#1a2a14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(n.pos.x), Z(n.pos.z), 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
  }
}
