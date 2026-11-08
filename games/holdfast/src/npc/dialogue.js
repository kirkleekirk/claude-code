// Dialogue: picks lines for a speaker from their personality and tone,
// never repeating themselves too soon, and builds conversations between
// two survivors whose replies depend on temperament and history.
import { P_LINES, TONE_LINES, ISSUES, NEWS, OBSERVE, APOLOGY_REPLY } from './lines.js';
import { PERSONALITIES, BACKGROUND_BY_ID, compatibility } from './people.js';

const JOKES = [
  "Why don't zombies eat clowns? They taste funny.",
  "What's a zombie's favorite bean? A human bean.",
  "I told my therapist I'd outlive the apocalypse. She said 'that's the spirit.' Then she bit me.",
  "Zombie walks into a bar. Orders a pint. Of you.",
  "My diet's going great. Nothing in the pantry.",
  "You know the best thing about the end of the world? No more group texts.",
  "I used to hate my commute. Now I'd kill for a traffic jam. Bad choice of words.",
  "What do you call a zombie with no legs? A crawler. I don't have a joke, that's just what they're called.",
];
const TEACH = ["Here, watch. Like this.", "You're holding it wrong. Here.", "Little trick I learned: go slow at the start.", "Try it this way. Easier on the wrists."];
const THANKS = ["Huh. Thanks.", "Oh. That's better.", "Never would've figured that out.", "Okay. Got it. I think."];
const COMPLIMENT = ["You did good today, {you}.", "I'm glad you're here, {you}.", "You've got a good way with people, {you}.", "I feel better when you're around, {you}."];
const COMPLIMENT_BACK = ["You too. Really.", "...Thanks. That means something.", "Stop it. But thanks.", "Same goes for you."];

const first = (n) => (n || '').split(' ')[0];

export class Speech {
  constructor() { this.recent = new Map(); }

  // a line for intent from npc (an NPC object with .person)
  line(npc, intent, ctx = {}) {
    const p = npc.person;
    const pers = PERSONALITIES[p.personality];
    let pool = P_LINES[p.personality] && P_LINES[p.personality][intent];
    if (!pool && TONE_LINES[intent]) pool = TONE_LINES[intent][pers.tone];
    if (!pool || !pool.length) return null;
    return this.fill(this.pick(p.id, pool), npc, ctx);
  }
  pick(id, pool) {
    const rec = this.recent.get(id) || [];
    const fresh = pool.filter((l) => !rec.includes(l));
    // nothing new left: the line said longest ago
    const l = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : [...pool].sort((a, b) => rec.indexOf(a) - rec.indexOf(b))[0];
    const i = rec.indexOf(l);
    if (i >= 0) rec.splice(i, 1);
    rec.push(l);
    if (rec.length > 24) rec.shift();
    this.recent.set(id, rec);
    return l;
  }
  fill(text, npc, ctx = {}) {
    const p = npc ? npc.person : {};
    const bg = p.background ? BACKGROUND_BY_ID[p.background] : null;
    return text
      .replace(/\{me\}/g, first(p.name))
      .replace(/\{you\}/g, first(ctx.you || ''))
      .replace(/\{other\}/g, first(ctx.other || ''))
      .replace(/\{player\}/g, first(ctx.player || ''))
      .replace(/\{camp\}/g, ctx.camp || 'camp')
      .replace(/\{kinRel\}/g, p.kinRel ? 'my ' + p.kinRel : '')
      .replace(/\{kin\}/g, p.kin || '')
      .replace(/\{item\}/g, bg ? bg.item : 'this')
      .replace(/\{job\}/g, bg ? bg.job : '')
      .replace(/\{role\}/g, ctx.role || '')
      .replace(/^\s+/, '')
      // a filled-in phrase can start a sentence ("{item} hung on my belt")
      .replace(/(^|[.!?]["\u201d]?\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase());
  }
  flavor(npc) { const bg = BACKGROUND_BY_ID[npc.person.background]; return bg ? this.fill(this.pick(npc.person.id + 'f', bg.flavor), npc) : null; }
  // the next chapter of their story (or null when told)
  chapter(npc, n) {
    const bg = BACKGROUND_BY_ID[npc.person.background];
    if (!bg || n >= bg.story.length) return null;
    // "{kinRel} {kin}" reads "My daughter Sarah"
    return this.fill(bg.story[n], npc);
  }

  // ---------------- conversations between two survivors ----------------
  // Returns [{ who: npc, text, act }] plus .effects (affinity deltas) and topic.
  conversation(a, b, ctx) {
    const rel = (x, y) => x.rel(y.person.id);
    const ab = rel(a, b), ba = rel(b, a);
    const comp = compatibility(a.person.personality, b.person.personality);
    const T = (x) => PERSONALITIES[x.person.personality].t;
    const ta = T(a), tb = T(b);
    const others = (ctx.others || []).filter((o) => o !== a && o !== b);
    const out = []; out.effects = []; let topic;
    const say = (who, intent, extra = {}) => {
      const to = who === a ? b : a;
      const text = this.line(who, intent, { you: to.person.name, ...ctx, ...extra });
      if (text) out.push({ who, text, act: 'talk' });
      return text;
    };
    const raw = (who, text, act = 'talk') => { out.push({ who, text: this.fill(text, who, { you: (who === a ? b : a).person.name, ...ctx }), act }); };
    const react = (who, to, mood) => {
      // how `who` answers `to`: depends on their liking and temperament
      const t = T(who), r = rel(who, to);
      const w = { agree: 1 + r * 1.5 + t.warmth * 0.5, joke: t.humor * 1.2, comfort: mood === 'down' ? t.warmth * 2 : 0.1,
        tease: t.humor * 0.6 + (r > 0.4 ? 0.4 : 0), disagree: 0.3 + (1 - t.warmth) * 0.6 - r + t.temper * 0.4, deflect: (1 - t.social) * 0.6 };
      if (mood === 'down') { w.joke *= 0.4; w.tease *= 0.3; }
      return weighted(w);
    };
    // what's happened lately that neither of them was part of
    const names = [a.person.name, b.person.name];
    const news = (ctx.news || []).filter((n) => ctx.clock - n.at < 16 && !n.said.has(a.person.id) && !(n.who || []).some((w) => names.includes(w)));
    // what someone else is doing right now
    const obs = [];
    for (const o of others) {
      if (o.dead || o.mode === 'away') continue;
      const act = o.anim.act;
      if (act === 'cook') obs.push(['cooking', o]);
      else if (act === 'chop' || act === 'hammer' || act === 'kneel_work') obs.push(['working', o]);
      else if (o.sleeping && ctx.hour > 9 && ctx.hour < 19) obs.push(['sleeping', o]);
    }
    if (ctx.playerAway) obs.push(['away', null]);
    if (ctx.playerBack) obs.push(['back', null]);
    const avail = { small: 2, complain: a.needsLow() ? 1.6 : 0.5, future: 0.8 + ta.optimism * 0.6, danger: 0.6 + ta.anxiety + (ctx.raiders ? 0.6 : 0),
      gossip: others.length ? 0.7 + ta.social * 0.6 : 0, story: 0.5 + Math.max(0, ab) * 1.5, recall: (b.knows[a.person.id] || 0) > 0 ? 0.6 : 0,
      joke: ta.humor > 0.6 ? ta.humor : 0, teach: 0.35, warm: ab > 0.45 ? 0.6 : 0, flavor: 1.2, news: news.length ? 2.2 + ta.social : 0, observe: obs.length ? 1.1 : 0 };
    topic = weighted(avail);
    out.topic = topic;
    const nudge = (x, y, d) => out.effects.push([x, y, d]);
    if (topic === 'small' || topic === 'flavor') {
      if (topic === 'flavor') raw(a, this.flavor(a)); else say(a, 'o_small');
      const r = react(b, a);
      say(b, r);
      nudge(a, b, r === 'disagree' ? -0.01 : 0.02); nudge(b, a, r === 'disagree' ? -0.01 : 0.02);
      if (r === 'joke' || r === 'tease') { const r2 = react(a, b); if (r2 === 'joke' || r2 === 'agree') { say(a, r2); nudge(a, b, 0.02); } }
    } else if (topic === 'complain') {
      say(a, Math.random() < 0.5 ? 'o_complain' : (a.needs.hunger > 60 ? 'r_hungry' : 'r_tired'));
      const r = react(b, a, 'down');
      say(b, r === 'agree' ? 'agree' : r);
      nudge(b, a, r === 'comfort' ? 0.03 : r === 'tease' ? -0.01 : 0.01); nudge(a, b, r === 'comfort' ? 0.05 : r === 'disagree' ? -0.03 : 0.01);
    } else if (topic === 'future') {
      say(a, 'o_future');
      const r = react(b, a);
      say(b, r);
      if (r === 'disagree') { if (ta.temper > 0.6 && Math.random() < 0.5) { say(a, 'tease'); nudge(b, a, -0.03); } nudge(a, b, -0.02); } else { nudge(a, b, 0.03); nudge(b, a, 0.02); }
    } else if (topic === 'danger') {
      say(a, 'o_danger');
      const r = tb.anxiety > 0.7 ? 'agree' : react(b, a, ta.anxiety > 0.7 ? 'down' : null);
      say(b, r);
      nudge(a, b, r === 'comfort' ? 0.04 : 0.01);
    } else if (topic === 'gossip') {
      const c = others[Math.floor(Math.random() * others.length)];
      const ac = a.rel(c.person.id), bc = b.rel(c.person.id);
      say(a, ac >= 0 ? 'o_gossip_good' : 'o_gossip_bad', { other: c.person.name });
      const same = (ac >= 0) === (bc >= 0);
      say(b, same ? 'agree' : (tb.temper > 0.6 ? 'disagree' : 'deflect'));
      // talk shapes opinions: b's view of c drifts toward a's
      nudge(b, c, (ac - bc) * 0.08); nudge(a, b, same ? 0.03 : -0.02);
      out.about = c;
    } else if (topic === 'story') {
      const n = b.knows[a.person.id] || 0;
      const lim = a.storyLimit(b);
      const ch = n < lim ? this.chapter(a, n) : null;
      if (ch) {
        out.push({ who: a, text: ch, act: 'talk', story: true });
        say(b, tb.warmth > 0.5 || n >= 2 ? 'comfort' : 'agree');
        b.knows[a.person.id] = n + 1;
        nudge(b, a, 0.06 + n * 0.02); nudge(a, b, 0.05);
      } else { raw(a, this.flavor(a)); say(b, react(b, a)); nudge(a, b, 0.01); }
    } else if (topic === 'recall') {
      const bg = BACKGROUND_BY_ID[a.person.background];
      raw(b, 'Heard you ' + bg.known + ', {you}.');
      raw(a, this.flavor(a));
      nudge(a, b, 0.03); nudge(b, a, 0.02);
    } else if (topic === 'joke') {
      raw(a, JOKES[Math.floor(Math.random() * JOKES.length)]);
      const r = tb.humor > 0.4 || ba > 0.3 ? 'joke' : 'deflect';
      say(b, r);
      nudge(b, a, r === 'joke' ? 0.03 : -0.01);
    } else if (topic === 'teach') {
      raw(a, TEACH[Math.floor(Math.random() * TEACH.length)]);
      raw(b, THANKS[Math.floor(Math.random() * THANKS.length)]);
      nudge(b, a, 0.04); nudge(a, b, 0.02);
    } else if (topic === 'news') {
      const n = news[news.length - 1];
      const tone = PERSONALITIES[a.person.personality].tone;
      const pool = NEWS[n.kind] && NEWS[n.kind][tone];
      if (pool) {
        raw(a, this.pick(a.person.id + 'n', pool).replace(/\{other\}/g, first(n.who && n.who[0])).replace(/\{third\}/g, first(n.who && n.who[1])).replace(/\{crew\}/g, n.crew || 'those raiders'));
        const bad = ['argument', 'fight', 'raiders', 'death', 'attack', 'raid', 'hurt'].includes(n.kind);
        const r = n.kind === 'death' ? (tb.warmth > 0.4 ? 'comfort' : 'agree') : react(b, a, bad ? 'down' : null);
        say(b, r);
        // the more a person cares, the more they want to talk it through
        nudge(a, b, r === 'comfort' ? 0.04 : r === 'disagree' ? -0.01 : 0.02); nudge(b, a, 0.015);
        n.said.add(a.person.id); n.said.add(b.person.id);
        out.about = n;
      } else { say(a, 'o_small'); say(b, react(b, a)); }
    } else if (topic === 'observe') {
      const [kind, o] = obs[Math.floor(Math.random() * obs.length)];
      const tone = PERSONALITIES[a.person.personality].tone;
      raw(a, OBSERVE[kind][tone][0].replace(/\{other\}/g, o ? o.first : '').replace(/\{player\}/g, first(ctx.player)));
      say(b, react(b, a, kind === 'away' ? 'down' : null));
      if (o) nudge(b, o, kind === 'working' || kind === 'cooking' ? 0.01 : -0.005);
      nudge(a, b, 0.01);
    } else if (topic === 'warm') {
      raw(a, COMPLIMENT[Math.floor(Math.random() * COMPLIMENT.length)]);
      raw(b, ba > 0.2 ? COMPLIMENT_BACK[Math.floor(Math.random() * COMPLIMENT_BACK.length)] : '...Thanks.');
      nudge(a, b, 0.04); nudge(b, a, 0.05);
    }
    // personalities rub against each other a little every time they talk
    nudge(a, b, comp * 0.015); nudge(b, a, comp * 0.015);
    return out;
  }

  // An argument: a accuses b. Returns lines and whether it came to blows.
  argument(a, b, issue, ctx, peacemaker = null) {
    const T = (x) => PERSONALITIES[x.person.personality].t;
    const ta = T(a), tb = T(b);
    const out = []; out.effects = [];
    const acc = issue === 'raiders' && ta.bravery < tb.bravery ? ISSUES[issue].cautious : ISSUES[issue].accuse;
    out.push({ who: a, text: this.fill(acc[Math.floor(Math.random() * acc.length)], a, { you: b.person.name, ...ctx }), act: 'argue' });
    const say = (who, intent, act) => { const to = who === a ? b : a; const t = this.line(who, intent, { you: to.person.name, ...ctx }); if (t) out.push({ who, text: t, act }); };
    say(b, 'a_defend', 'argue');
    let heat = (ta.temper + tb.temper) * 0.5 - (a.rel(b.person.id) + b.rel(a.person.id)) * 0.25 + (ctx.stress || 0) * 0.3;
    let fight = false;
    if (heat > 0.42 || Math.random() < heat) {
      say(a, 'a_escalate', 'argue');
      if (tb.temper > 0.45 && Math.random() < heat + 0.2) {
        say(b, 'a_insult', 'argue');
        fight = heat > 0.62 && Math.random() < 0.6;
        if (!fight) say(a, 'a_backdown', 'idle_crossed');
      } else say(b, 'a_backdown', 'idle_crossed');
    } else say(a, 'a_backdown', 'idle_crossed');
    if (peacemaker && (fight || heat > 0.5)) {
      const t = this.line(peacemaker, 'a_calm', { ...ctx });
      if (t) out.push({ who: peacemaker, text: t, act: 'argue', calm: true });
    }
    out.fight = fight;
    out.effects.push([a, b, -0.08 - heat * 0.05], [b, a, -0.1 - heat * 0.05]);
    return out;
  }
  // later, one of them may make it up
  apology(a, b, ctx) {
    const out = [];
    const t = this.line(a, 'a_apologize', { you: b.person.name, ...ctx });
    if (t) out.push({ who: a, text: t, act: 'talk' });
    const pb = PERSONALITIES[b.person.personality], tb = pb.t;
    const accept = tb.warmth > 0.4 || b.rel(a.person.id) > -0.3;
    const pool = APOLOGY_REPLY[accept ? 'yes' : 'no'][pb.tone];
    out.push({ who: b, text: this.pick(b.person.id + 'ap', pool), act: accept ? 'talk' : 'idle_crossed' });
    out.accepted = accept;
    out.effects = [[a, b, 0.06], [b, a, accept ? 0.12 : 0.02]];
    return out;
  }
}

export function weighted(w) {
  let sum = 0;
  for (const k in w) if (w[k] > 0) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) { if (w[k] <= 0) continue; r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}
export { first };
