// Event cards: weighted draw at dawn, context binding, effect DSL, outcome text, auto-resolution.
import { EVENTS, EVENT } from '../data/events.js';
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { BLUEPRINTS, BP } from '../data/guns.js';
import { STRAINS } from '../data/strains.js';
import { LOOT_ITEMS } from '../data/items.js';
import { rnd, rint, rchance, rpick, rweighted } from '../core/rng.js';
import { log, fx, stat, earn, spend, addRep, rank, canAfford, journal } from './state.js';
import { addHeat, layLow } from './heat.js';
import { addItem, takeItem, count } from './inventory.js';
import { active, crewById, shortName, injure, quit, fire, genRecruit, onJob } from './crew.js';
import { addMarketMod, sellPacks, sellGun } from './economy.js';
import { isPlot } from './grow.js';
import { planRaid, rivalPower } from './rivals.js';
import { addContract } from './jobs.js';

export function bindCtx(S, ev, preset = {}) {
  const c = { ...preset };
  for (const k of ev.ctx || []) {
    if (c[k] !== undefined) continue;
    if (k === 'town') { const opts = SETTLEMENT_IDS.filter((t) => S.visited[t]); c.town = opts.length ? rpick(S, opts) : 'millbrook'; }
    if (k === 'crew') { const a = active(S); c.crewId = a.length ? rpick(S, a).id : null; }
    if (k === 'rival') { const a = Object.values(S.rivals).filter((r) => r.alive); c.rival = a.length ? rpick(S, a).id : null; }
  }
  if (c.crewId) c.crew = crewById(S, c.crewId);
  return c;
}

const valid = (ev, c) => (!(ev.ctx || []).includes('crew') || c.crew) && (!(ev.ctx || []).includes('rival') || c.rival);

export function fillText(S, s, c) {
  return String(s)
    .replace(/\{town\}/g, c.town ? PLACE[c.town].name : 'town')
    .replace(/\{crew\}/g, c.crew ? shortName(c.crew) : 'someone')
    .replace(/\{rival\}/g, c.rival ? S.rivals[c.rival].name : 'a rival crew')
    .replace(/\{leader\}/g, c.rival ? S.rivals[c.rival].leader : 'their boss')
    .replace(/\{debtor\}/g, c.debtor || 'A debtor')
    .replace(/\{amt\}/g, c.loanAmt || '');
}

// Daily draw: ~60% chance of a card once the tutorial has taught the basics.
export function eventsDaily(S) {
  if (S.tutorial.on && !S.tutorial.done && S.tutorial.step < 4) return;
  if (S.events.pending.length >= 3) return;
  if (!rchance(S, 0.6)) return;
  const pool = [];
  for (const ev of EVENTS) {
    if (ev.once && S.events.seen[ev.id]) continue;
    if ((S.events.cooldown[ev.id] || 0) > S.day) continue;
    const c = bindCtx(S, ev);
    if (!valid(ev, c)) continue;
    const w = ev.w(S, c);
    if (w > 0) pool.push({ ev, c, w });
  }
  const pick = rweighted(S, pool, (p) => p.w);
  if (!pick) return;
  S.events.pending.push({ id: pick.ev.id, ctx: { town: pick.c.town, crewId: pick.c.crewId, rival: pick.c.rival } });
  S.events.seen[pick.ev.id] = (S.events.seen[pick.ev.id] || 0) + 1;
  S.events.cooldown[pick.ev.id] = S.day + 6;
  fx(S, 'event');
}

export function reqOk(S, req, c) {
  if (!req) return true;
  if (req.dirty && !canAfford(S, 'dirty', req.dirty)) return false;
  if (req.clean && !canAfford(S, 'clean', req.clean)) return false;
  if (req.item && count(S, req.item[0]) < req.item[1]) return false;
  if (req.packs && Object.keys(S.inv).filter((k) => k.startsWith('pack:')).reduce((a, k) => a + count(S, k), 0) < req.packs) return false;
  if (req.guns && sellableGuns(S).length < req.guns) return false;
  return true;
}

function sellableGuns(S) { return S.guns.filter((g) => !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id)); }

export function resolveEvent(S, idx, choice) {
  const p = S.events.pending[idx];
  if (!p) return null;
  const ev = EVENT[p.id];
  const c = bindCtx(S, ev, p.ctx);
  const ch = ev.choices[choice];
  if (!ch || !reqOk(S, ch.req, c)) return { ok: false, msg: 'You can\'t afford that option.' };
  S.events.pending.splice(idx, 1);
  let out = ch.out;
  const res = applyFx(S, ch.fx, c);
  if (res) out = res;
  stat(S, 'eventsResolved');
  const text = fillText(S, out || 'Done.', c);
  log(S, `${ev.title}: ${text}`, 'event');
  return { ok: true, msg: text };
}

// Effect DSL. Returns optional override text (chance outcomes).
export function applyFx(S, f, c = {}) {
  if (!f) return null;
  let text = null;
  const town = c.town || 'millbrook';
  const crew = c.crew;
  const r = c.rival ? S.rivals[c.rival] : null;
  for (const [k, v] of Object.entries(f)) {
    switch (k) {
      case 'dirty': if (v >= 0) earn(S, 'dirty', v, 'events'); else spend(S, 'dirty', -v, 'events'); break;
      case 'carried': earn(S, 'carried', v, 'events'); break;
      case 'clean': if (v >= 0) earn(S, 'clean', v, 'events'); else spend(S, 'clean', -v, 'events'); break;
      case 'dirtyPct': S.money.dirty = Math.max(0, S.money.dirty * (1 + v)); break;
      case 'rep': addRep(S, v, null, 'events'); break;
      case 'heat': addHeat(S, town, v, 'event'); break;
      case 'heatHollow': addHeat(S, 'hollow', v, 'event'); break;
      case 'heatAll': for (const t of SETTLEMENT_IDS) addHeat(S, t, v, 'event', { quiet: true }); break;
      case 'goodwill': S.goodwill = Math.max(0, Math.min(100, S.goodwill + v)); break;
      case 'favors': S.favors = Math.max(0, S.favors + v); break;
      case 'items': for (const [ik, n] of Object.entries(v)) { if (n >= 0) addItem(S, ik, n); else takeItem(S, ik, -n); } break;
      case 'loyaltyAll': for (const m of active(S)) m.loyalty = Math.max(0, Math.min(100, m.loyalty + v)); break;
      case 'moraleAll': for (const m of active(S)) m.morale = Math.max(0, Math.min(100, m.morale + v)); break;
      case 'crewLoyalty': if (crew) crew.loyalty = Math.max(0, Math.min(100, crew.loyalty + v)); break;
      case 'crewMorale': if (crew) crew.morale = Math.max(0, Math.min(100, crew.morale + v)); break;
      case 'crewWage': if (crew) crew.wage = Math.round(crew.wage * v); break;
      case 'crewHurt': if (crew) injure(S, crew, v); break;
      case 'crewFire': if (crew) fire(S, crew.id); break;
      case 'crewQuit': if (crew) quit(S, crew, 'walked out'); break;
      case 'crewSkillRandom': if (crew) { const sk = Object.keys(crew.skills).sort((a, b) => crew.skills[a] - crew.skills[b])[0]; crew.skills[sk] = Math.min(10, crew.skills[sk] + 2); } break;
      case 'crewHurtDealer': { const d = onJob(S, 'dealer'); if (d.length) injure(S, rpick(S, d), v); break; }
      case 'rivalAtt': if (r) r.attitude = Math.max(-100, Math.min(100, r.attitude + v)); break;
      case 'rivalStr': if (r) r.strength = Math.max(4, r.strength + v); break;
      case 'stance': if (r) { r.stance = v[0]; r.stanceDays = v[1]; } break;
      case 'market': addMarketMod(S, town, v[0], v[1], v[2], 'event'); break;
      case 'marketAll': case 'marketAll2': for (const t of [...SETTLEMENT_IDS, 'crossroads']) addMarketMod(S, t, v[0], v[1], v[2], 'event'); break;
      case 'satAll': for (const t of Object.keys(S.markets)) for (const cat of Object.keys(S.markets[t].sat)) S.markets[t].sat[cat] = Math.max(0, S.markets[t].sat[cat] + v); break;
      case 'plantsHealth': for (const cell of S.hollow.cells) if (isPlot(cell) && cell.plant && !cell.plant.dead) cell.plant.health = Math.max(1, Math.min(100, cell.plant.health + v)); break;
      case 'plantsWater': for (const cell of S.hollow.cells) if (isPlot(cell) && cell.plant) cell.plant.water = Math.max(0, cell.plant.water + v); break;
      case 'plantsGrow': for (const cell of S.hollow.cells) if (isPlot(cell) && cell.plant && !cell.plant.dead) cell.plant.growth += v; break;
      case 'treatAll': for (const cell of S.hollow.cells) if (isPlot(cell) && cell.plant && cell.plant.blight) { if (takeItem(S, 'compost', 2)) cell.plant.blight = false; else cell.plant.blight = true; } break;
      case 'blight': { const ps = S.hollow.cells.filter((cell) => isPlot(cell) && cell.plant && !cell.plant.dead); for (let i = 0; i < v && ps.length; i++) ps.splice(Math.floor(rnd(S) * ps.length), 1)[0].plant.blight = true; break; }
      case 'killPlant': { const ps = S.hollow.cells.filter((cell) => isPlot(cell) && cell.plant && !cell.plant.dead); if (ps.length) rpick(S, ps).plant = null; break; }
      case 'roomsDark': for (const cell of S.hollow.cells) if (cell && cell.fac === 'growroom' && cell.plant) cell.plant.health = Math.max(1, cell.plant.health - 20); break;
      case 'defenseBonus': S.flags.defenseBonus = (S.flags.defenseBonus || 0) + v; break;
      case 'raidNow': if (r) planRaid(S, r.id, rivalPower(S, r) * 0.7, { now: true }); break;
      case 'laylow': layLow(S, v); break;
      case 'risk': for (const b of S.businesses) b.risk = Math.max(0, b.risk + v); break;
      case 'randomBp': { const opts = BLUEPRINTS.filter((b) => !S.bps[b.id] && b.bench <= Math.max(2, S.hollow.bench + 1)); if (opts.length) { const b = rpick(S, opts); S.bps[b.id] = true; text = `Won the auction: ${b.name} blueprint.`; } else earn(S, 'dirty', 300, 'events'); break; }
      case 'seedsRandom': { const opts = Object.keys(STRAINS).filter((s) => !STRAINS[s].legendary); const s = rpick(S, opts); addItem(S, 'seed:' + s, v); S.strains.known[s] = true; text = `They sprout into ${STRAINS[s].name}! (+${v} seeds)`; break; }
      case 'lootRandom': for (let i = 0; i < v; i++) addItem(S, rpick(S, LOOT_ITEMS.filter((x) => x !== 'documents')), 1); break;
      case 'veil': addItem(S, 'seed:widows_veil', 2); S.strains.known.widows_veil = true; stat(S, 'veil'); journal(S, `Received Widow's Veil seeds on day ${S.day}.`); break;
      case 'recruit': { const t = c.town || 'crossroads'; const rc = genRecruit(S, t, { bg: v === true ? undefined : v }); rc.loyalty = 70; if (!S.candidates[t]) S.candidates[t] = []; S.candidates[t].push(rc); S.visited[t] = true; break; }
      case 'contract': addContract(S, v, { town: c.town, rival: c.rival }); break;
      case 'tip': S.tips.push({ day: S.day, town, src: 'event' }); break;
      case 'recon': S.recon[town] = Math.min(3, (S.recon[town] || 0) + v); break;
      case 'sellPacks': { let n = v; for (const key of Object.keys(S.inv).filter((x) => x.startsWith('pack:'))) { while (n > 0 && count(S, key) > 0) { const res = sellPacks(S, town, key, 1, { hustle: 6, stealth: 5, who: 'crew' }, { ignoreHours: true, toStash: true, regular: 1.4 }); if (!res.ok) { n = 0; break; } n--; } } break; }
      case 'sellGuns': { const gs = sellableGuns(S).sort((a, b) => ['junk', 'common', 'fine', 'masterwork', 'legendary'].indexOf(a.grade) - ['junk', 'common', 'fine', 'masterwork', 'legendary'].indexOf(b.grade)); for (let i = 0; i < v && gs[i]; i++) sellGun(S, gs[i].id, 'crossroads', c.rival || 'rustjaw'); break; }
      case 'loanRecover': earn(S, 'dirty', (c.loanAmt || 0) * v, 'loans'); break;
      case 'chance': { const [p, win, lose, tw, tl] = v; const ok = rchance(S, p); applyFx(S, ok ? win : lose, c); text = ok ? tw : tl; break; }
      default: break;
    }
  }
  return text;
}

// Human-readable effect summary for tooltips.
export function describeFx(S, f, c = {}) {
  if (!f) return '';
  const out = [];
  const sgn = (n) => (n >= 0 ? '+' : '') + n;
  for (const [k, v] of Object.entries(f)) {
    switch (k) {
      case 'dirty': out.push(`${v >= 0 ? '!a+' : '!r-'}$${Math.abs(v)} dirty`); break;
      case 'clean': out.push(`${v >= 0 ? '!c+' : '!r-'}$${Math.abs(v)} clean`); break;
      case 'carried': out.push(`!a+$${v} cash`); break;
      case 'dirtyPct': out.push(`!r${Math.round(v * 100)}% of stash`); break;
      case 'rep': out.push(`!y${sgn(v)} REP`); break;
      case 'heat': out.push(`${v > 0 ? '!r' : '!g'}${sgn(v)} heat (${c.town ? PLACE[c.town].name : 'town'})`); break;
      case 'heatAll': out.push(`${v > 0 ? '!r' : '!g'}${sgn(v)} heat everywhere`); break;
      case 'heatHollow': out.push(`!r+${v} heat near the Hollow`); break;
      case 'goodwill': out.push(`${sgn(v)} Compact goodwill`); break;
      case 'favors': out.push(`!g${sgn(v)} favor${Math.abs(v) > 1 ? 's' : ''}`); break;
      case 'items': for (const [ik, n] of Object.entries(v)) out.push(`${sgn(n)} ${ik.replace(/^.*:/, '')}`); break;
      case 'crewLoyalty': out.push(`${sgn(v)} loyalty (crew member)`); break;
      case 'loyaltyAll': out.push(`${sgn(v)} loyalty (all crew)`); break;
      case 'moraleAll': out.push(`${sgn(v)} morale (all crew)`); break;
      case 'crewHurt': out.push(`!r${v} days out of action`); break;
      case 'rivalAtt': out.push(`${sgn(v)} rival attitude`); break;
      case 'rivalStr': out.push(`${sgn(v)} rival strength`); break;
      case 'market': case 'marketAll': out.push(`${v[0]} prices ${sgn(Math.round(v[1] * 100))}% for ${v[2]}d`); break;
      case 'laylow': out.push(`!glay low ${v} day(s)`); break;
      case 'chance': out.push(`!y${Math.round(v[0] * 100)}% success`); break;
      case 'contract': out.push('!ynew job on the board'); break;
      case 'recon': out.push(`!g+${v} recon`); break;
      case 'plantsHealth': out.push(`${sgn(v)} plant health`); break;
      case 'risk': out.push(`${sgn(v)} audit risk`); break;
      default: break;
    }
  }
  return out.join('\n');
}

// Bot / auto-resolve heuristic: pick the affordable choice with the best value score.
export function autoChoice(S, idx) {
  const p = S.events.pending[idx];
  const ev = EVENT[p.id];
  const c = bindCtx(S, ev, p.ctx);
  let best = 0, bs = -Infinity;
  ev.choices.forEach((ch, i) => {
    if (!reqOk(S, ch.req, c)) return;
    const f = ch.fx || {};
    let s = (f.dirty || 0) + (f.clean || 0) * 1.4 + (f.carried || 0) + (f.rep || 0) * 12 - (f.heat || 0) * 25 - (f.heatAll || 0) * 60 + (f.favors || 0) * 150 + (f.goodwill || 0) * 15 - (f.crewHurt || 0) * 30 + (f.crewLoyalty || 0) * 2 + (f.loyaltyAll || 0) * 8;
    if (f.chance) s += f.chance[0] * 120 - 60;
    if (f.laylow) s -= 80;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

export { EVENT };
