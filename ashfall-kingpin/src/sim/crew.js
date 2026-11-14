// Crew: recruitment, vetting, assignment, wages, loyalty/morale/fatigue, training, skimming,
// snitching, managers and auto-assign.
import { SKILLS, TRAITS, GOOD_TRAITS, BAD_TRAITS, BACKGROUNDS, FIRST, LAST, NICKS, JOBS, SKILL_NAMES } from '../data/crew.js';
import { PLACE } from '../data/places.js';
import { randomLook, FACTION_LOOK } from '../data/looks.js';
import { rnd, rint, rchance, rpick } from '../core/rng.js';
import { log, fx, stat, spend, earn, addRep, hasPerk, rank, D, nextId, journal } from './state.js';
import { addHeat } from './heat.js';
import { count, takeItem } from './inventory.js';

export const TAVERN_TOWNS = ['millbrook', 'coppergate', 'harbor9', 'stverity', 'foundry', 'newhaven', 'crossroads'];
export const SQUAD_BY_RANK = [1, 1, 2, 4, 4, 4];
export const HIRE_RANK = 1;

export const active = (S) => S.crew.filter((c) => c.status === 'active');
export const onJob = (S, job, at) => S.crew.filter((c) => c.status === 'active' && c.job === job && (at === undefined || c.at === at));
export const crewById = (S, id) => S.crew.find((c) => c.id === id);
export const crewName = (c) => (c.nick ? `${c.first} "${c.nick}" ${c.last}` : `${c.first} ${c.last}`);
export const shortName = (c) => (c.nick ? c.nick : c.first);

const TRAIT_SKILL = { green_thumb: 'farming', steady_hands: 'crafting', veteran: 'gunplay', born_leader: 'leadership', smooth_talker: 'hustle', bookworm: 'bookkeeping', grease_monkey: 'driving', ghost: 'stealth' };

export function effSkill(c, skill) {
  if (!c) return skill === 'crafting' ? 3 : skill === 'farming' ? 2.5 : 2;
  let v = c.skills[skill] || 0;
  for (const t of c.traits) if (TRAIT_SKILL[t] === skill) v += 2;
  return Math.min(12, v);
}

export function productivity(S, c) {
  if (!c) return 0.6;
  let p = 1;
  if (c.traits.includes('lazy')) p *= 0.8;
  if (c.fatigue > 70) p *= 0.7;
  if (c.morale < 25) p *= 0.85;
  const h = Math.floor(S.min / 60);
  if (c.traits.includes('night_owl') && (h >= 20 || h < 6)) p *= 1.25;
  return p;
}

// Best worker on a job (by the job's skill), or null when nobody is assigned.
export function bestOn(S, job, at) {
  const list = onJob(S, job, at);
  const sk = JOBS[job] && JOBS[job].skill;
  if (!list.length || !sk) return list[0] || null;
  return list.reduce((a, c) => (effSkill(c, sk) > effSkill(a, sk) ? c : a), list[0]);
}

export function crewCap(S) {
  const bunks = S.hollow.cells.filter((c) => c && c.fac === 'bunks').length;
  return Math.min(40, 4 + bunks * 8);
}

export function genRecruit(S, town, opts = {}) {
  const bg = opts.bg ? BACKGROUNDS.find((b) => b.id === opts.bg) : rpick(S, BACKGROUNDS);
  const skills = {};
  const r = rank(S);
  for (const k of SKILLS) skills[k] = rint(S, 0, 3);
  skills[bg.skill] = Math.min(10, rint(S, 4, 6) + Math.floor(r / 2) + (rchance(S, 0.15) ? 2 : 0));
  const second = rpick(S, SKILLS.filter((k) => k !== bg.skill));
  skills[second] = Math.min(10, skills[second] + rint(S, 1, 3));
  const traits = [];
  const hidden = [];
  const t1 = rpick(S, GOOD_TRAITS);
  traits.push(t1); hidden.push(false);
  if (rchance(S, 0.55)) { traits.push(rpick(S, BAD_TRAITS)); hidden.push(rchance(S, 0.6)); }
  else { let t2 = rpick(S, GOOD_TRAITS); if (t2 === t1) t2 = rpick(S, GOOD_TRAITS); if (t2 !== t1) { traits.push(t2); hidden.push(false); } }
  const sum = Object.values(skills).reduce((a, b) => a + b, 0);
  const goodN = traits.filter((t) => TRAITS[t].good).length;
  const wage = Math.round((10 + sum * 0.85 + goodN * 5 + (traits.includes('greedy') ? 8 : 0)) * D(S).cost);
  const look = randomLook(() => rnd(S), FACTION_LOOK.crew);
  const c = {
    id: nextId(S), first: rpick(S, FIRST), last: rpick(S, LAST), nick: rchance(S, 0.25) ? rpick(S, NICKS) : '',
    bg: bg.id, skills, traits, hidden, vetted: false, wage, loyalty: rint(S, 45, 65), morale: rint(S, 55, 75), fatigue: 0,
    xp: {}, job: 'idle', at: null, hp: 100, injured: 0, level: 1, gxp: 0, kills: 0, gun: null, onBooks: false,
    status: 'candidate', town, look, hiredDay: 0, train: null, manages: null, unpaid: 0,
    ...opts.extra,
  };
  if (opts.name) { c.first = opts.name[0]; c.last = opts.name[1]; c.nick = opts.name[2] || ''; }
  return c;
}

export function refreshCandidates(S) {
  for (const t of TAVERN_TOWNS) {
    if (!S.visited[t]) continue;
    const keep = (S.candidates[t] || []).filter((c) => c.special);
    const n = 3 + (t === 'newhaven' || t === 'crossroads' ? 1 : 0);
    const list = [...keep];
    while (list.length < n) list.push(genRecruit(S, t));
    S.candidates[t] = list;
  }
  S.candDay = S.day;
}

export function signingFee(c) { return c.wage * 2; }

export function hire(S, cid, town) {
  const list = S.candidates[town] || [];
  const c = list.find((x) => x.id === cid);
  if (!c) return { ok: false, msg: 'Candidate gone.' };
  if (rank(S) < HIRE_RANK && !c.special) return { ok: false, msg: 'Reach Hustler (100 REP) before anyone works for you.' };
  if (active(S).length >= crewCap(S)) return { ok: false, msg: `No beds: crew cap ${crewCap(S)}. Build Bunks.` };
  const fee = c.special ? 0 : signingFee(c);
  if (!spend(S, 'dirty', fee, 'hiring')) return { ok: false, msg: `Signing fee $${fee}.` };
  list.splice(list.indexOf(c), 1);
  c.status = 'active';
  c.hiredDay = S.day;
  S.crew.push(c);
  stat(S, 'hired');
  log(S, `${crewName(c)} joined the crew (${BACKGROUNDS.find((b) => b.id === c.bg).name}).`, 'good');
  if (c.special === 'nephew') S.tutorial.flags.hiredNephew = true;
  return { ok: true, msg: `${shortName(c)} hired.`, c };
}

export function vetCost(S, c) { return hasPerk(S, 'fx_snitch') ? 0 : Math.round((30 + c.wage) * D(S).cost); }

export function vet(S, c) {
  if (c.vetted) return { ok: false, msg: 'Already vetted.' };
  const cost = vetCost(S, c);
  if (!spend(S, 'dirty', cost, 'hiring')) return { ok: false, msg: `Vetting costs $${cost}.` };
  c.vetted = true;
  const found = c.traits.filter((t, i) => c.hidden[i]);
  c.hidden = c.hidden.map(() => false);
  stat(S, 'vetted');
  return { ok: true, msg: found.length ? `Background check found: ${found.map((t) => TRAITS[t].name).join(', ')}.` : 'Clean background. Nothing hidden.' };
}

export function fire(S, id) {
  const c = crewById(S, id);
  if (!c) return { ok: false };
  c.status = 'fired';
  c.job = 'idle';
  S.crew = S.crew.filter((x) => x !== c);
  for (const o of active(S)) o.loyalty = Math.max(0, o.loyalty - 2);
  if (c.traits.includes('loose_lips') || c.loyalty < 30) addHeat(S, c.town || 'millbrook', 6, 'disgruntled ex-crew');
  log(S, `${crewName(c)} was let go.`, 'warn');
  return { ok: true };
}

export function assign(S, id, job, at = null) {
  const c = crewById(S, id);
  if (!c || c.status !== 'active') return { ok: false, msg: 'Not available.' };
  if (job === 'squad' && c.job !== 'squad' && onJob(S, 'squad').length >= SQUAD_BY_RANK[rank(S)]) return { ok: false, msg: `Squad is capped at ${SQUAD_BY_RANK[rank(S)]} at your rank.` };
  if (job === 'manager' && rank(S) < 2) return { ok: false, msg: 'Managers unlock at Supplier.' };
  if ((job === 'enforcer' || job === 'runner') && rank(S) < 2) return { ok: false, msg: 'Unlocks at Supplier.' };
  if (c.manages && job !== 'manager') c.manages = null;
  c.job = job;
  c.at = at;
  if (job === 'farmer') S.tutorial.flags.nephewOnPlots = S.tutorial.flags.nephewOnPlots || c.special === 'nephew';
  return { ok: true, msg: `${shortName(c)}: ${JOBS[job].name}${at ? ' @ ' + (PLACE[at] ? PLACE[at].name : at) : ''}` };
}

export function giveRaise(S, c) {
  c.wage = Math.round(c.wage * 1.15);
  c.loyalty = Math.min(100, c.loyalty + 15);
  c.morale = Math.min(100, c.morale + 8);
  return { ok: true, msg: `${shortName(c)} gets a raise to $${c.wage}/day.` };
}

export function toggleBooks(S, c) {
  if (!c.onBooks && !S.businesses.length) return { ok: false, msg: 'You need a front to put anyone on the books.' };
  c.onBooks = !c.onBooks;
  if (c.onBooks) c.loyalty = Math.min(100, c.loyalty + 5);
  return { ok: true, msg: c.onBooks ? `${shortName(c)} is on the books (paid clean, safer laundering).` : `${shortName(c)} is back off the books.` };
}

export function wagesDaily(S) {
  const mult = hasPerk(S, 'op_wages') ? 0.88 : 1;
  for (const c of active(S)) {
    const w = c.wage * mult * (c.onBooks ? 1.2 : 1);
    const kind = c.onBooks ? 'clean' : 'dirty';
    if (spend(S, kind, w, 'wages')) { c.unpaid = 0; }
    else {
      c.unpaid++;
      c.loyalty = Math.max(0, c.loyalty - (c.traits.includes('greedy') ? 22 : 15));
      c.morale = Math.max(0, c.morale - 10);
      if (c.unpaid === 1) log(S, `Couldn't make payroll for ${shortName(c)}. Loyalty is dropping.`, 'bad');
    }
  }
}

export function crewDaily(S) {
  const bunks = S.hollow.cells.some((c) => c && c.fac === 'bunks');
  const training = S.hollow.cells.some((c) => c && c.fac === 'training');
  const leaders = active(S).filter((c) => c.job === 'manager' || c.traits.includes('born_leader'));
  const moraleTarget = 58 + (bunks ? 5 : 0) + Math.min(12, leaders.reduce((a, c) => a + effSkill(c, 'leadership'), 0));
  for (const c of [...active(S)]) {
    if (c.injured > 0) {
      const clinic = S.businesses.some((b) => b.type === 'clinic');
      c.injured = Math.max(0, c.injured - (clinic ? 3 : 1));
      if (c.injured === 0) { c.hp = 100; log(S, `${shortName(c)} is back on their feet.`, 'good'); }
    }
    const working = c.job !== 'idle' && c.injured === 0;
    c.fatigue = Math.max(0, Math.min(100, c.fatigue + (working ? (bunks ? 4 : 8) : -20)));
    c.morale += (moraleTarget - c.morale) * 0.15;
    let dl = c.unpaid ? 0 : 0.6;
    if (c.fatigue > 70) dl -= 1;
    if (c.morale > 70) dl += 1;
    if (c.morale < 30) dl -= 2;
    if (c.traits.includes('greedy')) dl -= 0.6;
    if (c.traits.includes('loyal') && dl < 0) dl *= 0.5;
    if (c.onBooks) dl += 0.3;
    c.loyalty = Math.max(0, Math.min(100, c.loyalty + dl));
    // Training by practice.
    if (working && JOBS[c.job].skill) gainXp(S, c, JOBS[c.job].skill, 1);
    if (c.job === 'trainee' && c.train) gainXp(S, c, c.train, training ? 4 : 1.5);
    // Skimming and snitching.
    const sticky = c.traits.includes('sticky_fingers') || c.loyalty < 30;
    if (sticky && working && rchance(S, 0.35)) skim(S, c);
    if (c.traits.includes('addict')) eatProduct(S, c);
    let snitch = c.loyalty < 25 ? (25 - c.loyalty) / 100 * 0.25 : 0;
    if (c.traits.includes('loose_lips')) snitch = snitch * 3 + 0.01;
    if (c.traits.includes('loyal')) snitch = 0;
    if (hasPerk(S, 'fx_snitch')) snitch *= 0.4;
    if (c.onBooks) snitch *= 0.5;
    if (snitch > 0 && rchance(S, snitch)) snitchOut(S, c);
    if (c.loyalty <= 5 && rchance(S, 0.4)) quit(S, c);
  }
}

function gainXp(S, c, sk, n) {
  if (c.skills[sk] >= 10) return;
  const mult = c.traits.includes('bookworm') ? 1.5 : 1;
  c.xp[sk] = (c.xp[sk] || 0) + n * mult;
  const need = 6 + c.skills[sk] * 3;
  if (c.xp[sk] >= need) { c.xp[sk] -= need; c.skills[sk]++; log(S, `${shortName(c)} improved ${SKILL_NAMES[sk]} to ${c.skills[sk]}.`, 'good'); stat(S, 'skillUps'); }
}

function skim(S, c) {
  const take = Math.min(S.money.dirty * 0.02, 25 + c.wage);
  if (take < 2) return;
  S.money.dirty -= take;
  c.skimmed = (c.skimmed || 0) + take;
  stat(S, 'skimmed', take);
  const spotted = S.crew.some((m) => m.status === 'active' && (m.job === 'manager' || m.job === 'accountant') && effSkill(m, 'bookkeeping') + effSkill(m, 'leadership') > 8);
  if (spotted || rchance(S, 0.2)) log(S, `The books are short $${Math.round(take)}. ${spotted ? shortName(c) + ' has sticky fingers.' : 'Someone is skimming.'}`, 'warn');
}

function eatProduct(S, c) {
  const k = Object.keys(S.inv).find((x) => x.startsWith('pack:') && x.endsWith(':baggie'));
  if (k) takeItem(S, k, 1);
}

function snitchOut(S, c) {
  const town = c.at && S.heat[c.at] !== undefined ? c.at : 'millbrook';
  const amt = 5 + Math.round(rnd(S) * 10);
  if (rchance(S, 0.5)) {
    addHeat(S, town, amt, 'informant');
    log(S, `Someone talked to the Wardens about your ${PLACE[town] ? PLACE[town].name : ''} operation. Heat +${amt}.`, 'bad');
  } else {
    const rid = rpick(S, Object.keys(S.rivals).filter((r) => S.rivals[r].alive)) || 'rustjaw';
    if (S.rivals[rid]) { S.rivals[rid].intel += 20; log(S, `${S.rivals[rid].name} seem to know your routes. A leak in the crew?`, 'bad'); }
  }
  c.snitched = (c.snitched || 0) + 1;
  stat(S, 'snitches');
}

export function quit(S, c, why = 'walked out') {
  c.status = 'quit';
  S.crew = S.crew.filter((x) => x !== c);
  log(S, `${crewName(c)} ${why}.`, 'bad');
  for (const o of active(S)) o.morale = Math.max(0, o.morale - 3);
}

export function killCrew(S, c, how = 'was killed') {
  c.status = 'dead';
  S.crew = S.crew.filter((x) => x !== c);
  log(S, `${crewName(c)} ${how}.`, 'bad');
  journal(S, `${crewName(c)} died on day ${S.day}.`);
  stat(S, 'crewLost');
  for (const o of active(S)) { o.morale = Math.max(0, o.morale - 15); o.loyalty = Math.max(0, o.loyalty - 3); }
  if (c.gun) { const g = S.guns.find((x) => x.id === c.gun); if (g) S.guns.splice(S.guns.indexOf(g), 1); }
}

export function injure(S, c, days) {
  c.injured = Math.max(c.injured, days);
  c.hp = 40;
  log(S, `${shortName(c)} is injured (${days} days out).`, 'warn');
}

// Combat power used by delegated jobs and abstract defense.
export function combatPower(S, c) {
  if (!c || c.injured > 0) return 0;
  const g = c.gun ? S.guns.find((x) => x.id === c.gun) : null;
  const gunF = g ? 1 + ({ junk: 0, common: 0.25, fine: 0.45, masterwork: 0.7, legendary: 1 }[g.grade] || 0) + (g.bp === 'hailstorm' || g.bp === 'warden_breaker' ? 0.6 : 0) : 0.6;
  let p = (3 + effSkill(c, 'gunplay') * 1.2 + c.level * 1.5) * gunF;
  if (c.traits.includes('veteran')) p *= 1.15;
  if (c.traits.includes('coward')) p *= 0.8;
  if (hasPerk(S, 'gun_squad')) p *= 1.2;
  return p;
}

export function autoAssign(S, prio = ['production', 'sales', 'security']) {
  const idle = active(S).filter((c) => c.job === 'idle' && c.injured === 0);
  if (!idle.length) return { ok: true, msg: 'Nobody idle.' };
  const plots = S.hollow.cells.filter((c) => c && (c.fac === 'plot' || c.fac === 'growroom')).length;
  const needs = [];
  const want = (job, n, skill, at) => { const have = onJob(S, job, at).length; for (let i = have; i < n; i++) needs.push({ job, skill, at }); };
  const has = (f) => S.hollow.cells.some((c) => c && c.fac === f);
  for (const p of prio) {
    if (p === 'production') {
      want('farmer', Math.ceil(plots / 6), 'farming');
      want('curer', plots >= 4 ? 1 : 0, 'farming');
      if (has('bench')) want('gunsmith', 1, 'crafting');
      if (has('lathe')) want('machinist', 1, 'crafting');
      if (has('smelter')) want('smelter', 1, 'salvage');
      if (has('press')) want('presser', 1, 'crafting');
    } else if (p === 'sales') {
      const towns = ['millbrook', 'coppergate', 'harbor9', 'foundry', 'newhaven'].filter((t) => S.visited[t]);
      for (const t of towns.slice(0, 3)) want('dealer', 1, 'hustle', t);
      for (const b of S.businesses) want('staff', 1, 'hustle', b.uid);
    } else if (p === 'security') want('guard', 2, 'gunplay');
  }
  let n = 0;
  for (const need of needs) {
    const pool = idle.filter((c) => c.job === 'idle');
    if (!pool.length) break;
    const best = pool.reduce((a, c) => (effSkill(c, need.skill) > effSkill(a, need.skill) ? c : a), pool[0]);
    best.job = need.job; best.at = need.at || null; n++;
  }
  return { ok: true, msg: `Auto-assigned ${n} crew.` };
}

// Managers: Hollow manager replants, keeps standing orders and auto-packs; business managers keep staff.
export function managerEfficiency(c) { return Math.min(1, 0.5 + 0.05 * effSkill(c, 'leadership')); }

export function promote(S, c, target) {
  if (rank(S) < 2) return { ok: false, msg: 'Managers unlock at Supplier.' };
  for (const o of active(S)) if (o.manages === target) { o.manages = null; o.job = 'idle'; }
  c.job = 'manager';
  c.manages = target;
  c.at = target;
  c.wage = Math.round(c.wage * 1.2);
  return { ok: true, msg: `${shortName(c)} now manages ${target === 'hollow' ? 'the Hollow' : 'a front'}.` };
}

export { count, earn };
