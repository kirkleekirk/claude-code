// The Ledger (Tab): full-screen management overlay. Tooltips show the math wherever it matters.
import { RAMPS, heatColor } from '../data/palette.js';
import { PLACE, PLACES, SETTLEMENT_IDS, CAMPS, RUINS } from '../data/places.js';
import { RANKS, PERKS, PERK_TREES, FACILITIES, VEHICLES, xpForLevel } from '../data/progress.js';
import { STRAINS, PACKS, QUALITY } from '../data/strains.js';
import { BP, BLUEPRINTS, MATERIALS, MATERIAL_IDS, COMPONENTS, COMP_IDS, MODS, AMMO, AMMO_VARIANTS, THROWABLES, GADGETS, GRADES, SLOT_NAMES } from '../data/guns.js';
import { BUSINESSES, BIZ_UPGRADES } from '../data/businesses.js';
import { SKILLS, SKILL_NAMES, SKILL_TIPS, TRAITS, JOBS, BACKGROUNDS } from '../data/crew.js';
import { CONTRACT, MISSION_KINDS } from '../data/contracts.js';
import { itemInfo, compKey } from '../data/items.js';
import { fmtMoney, fmtNum, fmtClock } from '../core/util.js';
import { drawText, measure, wrap, LINE_H } from '../render/font.js';
import { portrait } from '../render/paperdoll.js';
import { icon } from '../render/icons.js';
import { rank, D, hasPerk, spend } from '../sim/state.js';
import { count, invList } from '../sim/inventory.js';
import { tabUnlocked, objectives, endgameHint } from '../sim/tutorial.js';
import { active, onJob, crewName, effSkill, assign, giveRaise, toggleBooks, vet, vetCost, fire, autoAssign, promote, crewCap, SQUAD_BY_RANK } from '../sim/crew.js';
import { plotIdx, strainData, stageName, ready, packBud, dryCap, cureCap, facCount } from '../sim/grow.js';
import { enqueue, cancelOrder, orderLabel, orderHours, orderInputs, addStanding, gunStats, gunName, installMod, removeMod, canFit, STATIONS, stockOf, modSlotsFor } from '../sim/craft.js';
import { weedPrice, sat, demandOf, tradeAllowed, MARKET } from '../sim/economy.js';
import { legitRev, washCapacity, washFee, setWashPlan, upgradeCost, buyUpgrade, bribeAuditor, bribeAuditorCost, sellBusiness, startProtection, stopProtection, makeLoan, cleanAssets, staffOf, buyBusiness, shellAvailable, shellPrice, lotOwner } from '../sim/business.js';
import { heatLevel, HEAT_LEVELS, layLow, bribe, bribeCost, payTribute, scapegoat, scapegoatCost, heatDecayRate } from '../sim/heat.js';
import { diplomacy, truceCost, tributeCost, STANCES, rivalPower, defensePower, stashProtected } from '../sim/rivals.js';
import { delegate, delegateChance, contractText, placeLabel, needMet, raidTargets, newPlan, raidChance, buyRecon, reconCost, insideCost, resolveRaid, scavengeAbstract, ruinReady, holds, occupy, canOccupy, vaultLoot } from '../sim/jobs.js';
import { buyPerk, perkState, ACHIEVEMENTS, STAT_LABELS } from '../sim/progress.js';
import { crownReady, declareCrown, councilAssaultReady, assaultCouncilAbstract, ledgerReady, LEDGER_ASSETS } from '../sim/endgame.js';
import { takeMagsLoan } from '../sim/hollow.js';
import { say } from './panels.js';
import { recruitRow } from './panels.js';
import { overlayPlaces } from './hud.js';
import { keyLabel, ACTION_LABELS } from '../input/input.js';

const K = RAMPS;
export const TABS = ['Overview', 'Crew', 'Production', 'Inventory', 'Map', 'Businesses', 'Heat & Rivals', 'Jobs', 'Perks', 'Journal'];
const TAB_KEYS = ['overview', 'crew', 'production', 'inventory', 'map', 'businesses', 'heat', 'jobs', 'perks', 'journal'];

export function drawLedger(g) {
  const ui = g.ui;
  ui.dim('lg:dim', 0.55);
  const x = 4, y = 4, w = ui.W - 8, h = ui.H - 8;
  ui.panel('lg', x, y, w, h, { title: 'THE LEDGER' });
  if (ui.button('lg:close', x + w - 14, y + 1, 12, 11, '✗', { tip: 'Close (Tab / Esc)', sound: 'ui_back' })) { g.closeOverlay(); return; }
  const labels = TABS.map((t, i) => (tabUnlocked(g.S, TAB_KEYS[i]) ? t : '···'));
  const t = ui.tabs('lg:tabs', x + 4, y + 15, w - 8, labels, g.ledgerTab);
  if (t !== g.ledgerTab) { if (tabUnlocked(g.S, TAB_KEYS[t])) g.ledgerTab = t; else g.toast('Mags will show you that soon.'); }
  const R = { x: x + 4, y: y + 32, w: w - 8, h: h - 36 };
  if (!tabUnlocked(g.S, TAB_KEYS[g.ledgerTab])) g.ledgerTab = 0;
  [overview, crewTab, production, inventory, mapTab, businesses, heatTab, jobsTab, perksTab, journal][g.ledgerTab](g, R);
}

const btn = (g, id, x, y, w, label, o) => g.ui.button(id, x, y, w, 13, label, o);
const H2 = (g, t, x, y) => g.ui.text(t, x, y, g.sem.accent);

// ---------- Overview ----------
function overview(g, R) {
  const ui = g.ui, S = g.S;
  const cw = Math.floor(R.w * 0.36);
  let y = R.y;
  H2(g, 'Money', R.x, y); y += 11;
  const row = (l, v, c, tip) => { ui.text(l, R.x, y, g.sem.textDim); ui.text(v, R.x + cw - 4, y, c, { align: 'right' }); if (tip) ui.tipArea(R.x, y - 1, cw, 10, tip); y += 10; };
  row('Dirty (stash)', fmtMoney(S.money.dirty), g.sem.dirty, 'Lives in the Hollow stash. Raiders can steal what safes do not protect.');
  row('Dirty (carried)', fmtMoney(S.money.carried), g.sem.dirty, 'On you. 15% is lost if you go down.');
  row('Clean', fmtMoney(S.money.clean), g.sem.clean, 'In front accounts. Safe from theft, frozen during audits.');
  if (S.money.frozen) row('Frozen', `${fmtMoney(S.money.frozen)} (${S.money.frozenDays}d)`, g.sem.bad);
  if (S.money.debt) row('Owed to Mags', fmtMoney(S.money.debt), g.sem.bad);
  row('Clean assets', fmtMoney(cleanAssets(S)), g.sem.clean, 'Clean cash + frozen + fronts (purchase + upgrades) + outstanding loans. The Ledger ending needs $2,000,000.');
  y += 4;
  H2(g, 'Standing', R.x, y); y += 11;
  const r = rank(S);
  row('Rank', `${RANKS[r].name} (${Math.floor(S.rep)} REP)`, g.sem.rep, RANKS[r + 1] ? `Next: ${RANKS[r + 1].name} at ${RANKS[r + 1].rep}. Unlocks ${RANKS[r + 1].unlocks.join(', ')}.` : 'Top of the food chain.');
  row('Level', `${S.level} (${S.perkPts} perk pts)`, g.sem.text, `XP ${Math.floor(S.xp)} / next level at ${xpForLevel(S.level + 1)}.`);
  row('Notoriety', `${S.notoriety} (${HEAT_LEVELS[heatLevel(S.notoriety)].name})`, heatColor(S.notoriety, g.sem));
  row('Compact goodwill', String(Math.round(S.goodwill)), g.sem.text, 'Raised by clean tribute and the radio, lowered by crime. Sets how hard the Wardens push.');
  row('Favors', String(S.favors), g.sem.good, 'Earned from jobs, events and regulars. Council seats and alliances cost favors.');
  row('Crew', `${active(S).length}/${crewCap(S)}`, g.sem.text);
  row('Fronts / holds', `${S.businesses.length} / ${holds(S).length}`, g.sem.text);
  y += 4;
  if (btn(g, 'ov:laylow', R.x, y, cw / 2 - 2, S.laylow ? `Laying low ${S.laylow}d` : 'Lay low 1 day', { disabled: S.laylow > 0, tip: 'Dealers pause, no street deals, heat decays 2.5x.' })) layLow(S, 1);
  if (btn(g, 'ov:save', R.x + cw / 2 + 2, y, cw / 2 - 2, 'Quick save (slot 1)', { disabled: !g.canSave() })) g.saveSlot('slot1');
  y += 16;
  if (!S.money.debt && S.money.dirty + S.money.carried < 50 && btn(g, 'ov:loan', R.x, y, cw, "Mags' loan: $200 at 20%", {})) say(g, takeMagsLoan(S));
  // Graph.
  const gx = R.x + cw + 10, gw = R.w - cw - 10, gy = R.y, gh = Math.floor(R.h * 0.45);
  H2(g, 'Income (last 30 days)', gx, gy);
  graph(g, gx, gy + 11, gw, gh - 11);
  // Yesterday P&L.
  let py = gy + gh + 6;
  const last = S.hist[S.hist.length - 1];
  H2(g, last ? `Day ${last.day} profit & loss` : 'Profit & loss (after the first dawn)', gx, py); py += 11;
  if (last) {
    const inc = Object.entries(last.inc || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const exp = Object.entries(last.exp || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    inc.forEach(([k, v], i) => { ui.text(k, gx, py + i * 9, g.sem.textDim); ui.text('+' + fmtMoney(v), gx + gw / 2 - 8, py + i * 9, g.sem.good, { align: 'right' }); });
    exp.forEach(([k, v], i) => { ui.text(k, gx + gw / 2, py + i * 9, g.sem.textDim); ui.text('-' + fmtMoney(v), gx + gw - 4, py + i * 9, g.sem.bad, { align: 'right' }); });
    py += Math.max(inc.length, exp.length) * 9 + 4;
  }
  H2(g, 'What next?', gx, py); py += 11;
  for (const o of objectives(S)) { const n = ui.wrapText('• ' + o.text, gx, py, gw, o.kind === 'urgent' ? g.sem.bad : g.sem.text, 9); py += n + 1; if (py > R.y + R.h - 30) break; }
  if (rank(S) >= 5 && !S.ending) endgameBox(g, gx, R.y + R.h - 26, gw);
}

function endgameBox(g, x, y, w) {
  const S = g.S;
  const cr = crownReady(S);
  if (councilAssaultReady(S)) { if (btn(g, 'ov:council', x, y, w / 2 - 2, 'Storm the Council Hall', { primary: true, tip: 'The finale of The Crown. Travel to New Haven and fight.' })) { say(g, g.act.missions.startCouncil()); g.travelTo('newhaven'); } }
  else if (btn(g, 'ov:crown', x, y, w / 2 - 2, 'Declare war on the Council', { disabled: !!cr || S.compact.daybreak === 'pending', danger: true, tip: cr || 'Operation Daybreak will siege the Hollow: 3 waves at dawn.' })) g.ui.confirm('Declare war on the Compact Council? Operation Daybreak will siege the Hollow.', () => say(g, declareCrown(S)));
  const lr = ledgerReady(S);
  g.ui.text(lr ? `Ledger: ${lr}` : 'Ledger: ready at the Compact Treasury!', x + w / 2 + 2, y + 3, lr ? g.sem.textDim : g.sem.good, { maxW: w / 2 - 4 });
  g.ui.text(endgameHint(S), x, y + 15, g.sem.warn, { maxW: w });
}

function graph(g, x, y, w, h) {
  const ui = g.ui, S = g.S;
  ui.rect(x, y, w, h, K.ink[0]);
  const hist = S.hist.slice(-30);
  if (hist.length < 2) { ui.text('Data appears after a couple of dawns.', x + 6, y + h / 2 - 4, g.sem.textMute); return; }
  const max = Math.max(50, ...hist.map((d) => Math.max(d.dIn, d.cIn)));
  const px = (i) => x + 4 + (i / (hist.length - 1)) * (w - 8);
  const py = (v) => y + h - 4 - (v / max) * (h - 12);
  for (let k = 0; k <= 4; k++) { const yy = y + 4 + k * (h - 8) / 4; ui.rect(x + 2, Math.round(yy), w - 4, 1, K.ink[1]); }
  const c = ui.ctx;
  for (const [key, col] of [['dIn', g.sem.dirty], ['cIn', g.sem.clean]]) {
    c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
    hist.forEach((d, i) => { const X = Math.round(px(i)) + 0.5, Y = Math.round(py(d[key])) + 0.5; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
    c.stroke();
  }
  ui.text(fmtMoney(max, true), x + 3, y + 2, g.sem.textMute);
  ui.text('dirty in', x + w - 90, y + 2, g.sem.dirty);
  ui.text('clean in', x + w - 44, y + 2, g.sem.clean);
  const mi = Math.round(((ui.mx - x - 4) / (w - 8)) * (hist.length - 1));
  if (ui.mx >= x && ui.mx < x + w && ui.my >= y && ui.my < y + h && hist[mi]) {
    const d = hist[mi];
    ui.rect(Math.round(px(mi)), y + 2, 1, h - 4, K.bone[0]);
    ui.tip(`Day ${d.day}\n!aDirty in ${fmtMoney(d.dIn)}\n!cClean in ${fmtMoney(d.cIn)}\nREP +${d.rep}, heat +${d.heat}\n${Object.entries(d.inc || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}: ${fmtMoney(v)}`).join('\n')}`);
  }
}

// ---------- Crew ----------
const JOB_LIST = ['idle', 'farmer', 'curer', 'smelter', 'machinist', 'gunsmith', 'presser', 'dealer', 'runner', 'scavenger', 'guard', 'squad', 'lookout', 'staff', 'accountant', 'enforcer', 'garrison', 'trainee'];
const JOB_AT = { dealer: 'town', enforcer: 'town', garrison: 'town', lookout: 'town', staff: 'biz', accountant: 'biz' };

function crewTab(g, R) {
  const ui = g.ui, S = g.S;
  g.crewView = g.crewView || 0;
  g.crewView = ui.tabs('cr:view', R.x, R.y, 220, ['Roster', 'Recruit'], g.crewView);
  if (btn(g, 'cr:auto', R.x + 226, R.y, 90, 'Auto-assign', { tip: 'Put idle crew where they fit: production > sales > security.' })) say(g, autoAssign(S));
  ui.text(`Crew ${active(S).length}/${crewCap(S)}  |  Squad ${onJob(S, 'squad').length}/${SQUAD_BY_RANK[rank(S)]}  |  Wages ${fmtMoney(active(S).reduce((a, c) => a + c.wage, 0))}/day`, R.x + 322, R.y + 3, g.sem.textDim);
  const top = R.y + 16, H = R.h - 16;
  if (g.crewView === 1) {
    const towns = Object.keys(S.candidates).filter((t) => (S.candidates[t] || []).length);
    const rows = towns.flatMap((t) => S.candidates[t].map((c) => [t, c]));
    ui.list('cr:recruits', R.x, top, R.w, H, 46, rows.length, (i, x, y, w) => { ui.text(PLACE[rows[i][0]].name, x + w - 210, y + 4, g.sem.textMute); recruitRow(g, rows[i][1], rows[i][0], x, y, w); }, { noClick: true, empty: 'Visit taverns to see who is looking for work.' });
    return;
  }
  const list = S.crew.filter((c) => c.status === 'active');
  g.crewSort = g.crewSort || 'name';
  const sorters = { name: (a, b) => a.first.localeCompare(b.first), job: (a, b) => a.job.localeCompare(b.job), loyalty: (a, b) => a.loyalty - b.loyalty, skill: (a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills)) };
  list.sort(sorters[g.crewSort]);
  const lw = Math.floor(R.w * 0.42);
  ['name', 'job', 'loyalty', 'skill'].forEach((s, i) => { if (btn(g, 'cr:sort:' + s, R.x + i * (lw / 4), top, lw / 4 - 2, (g.crewSort === s ? '▼ ' : '') + s, {})) g.crewSort = s; });
  const sel = list.findIndex((c) => c.id === g.ledgerCrew);
  const clicked = ui.list('cr:roster', R.x, top + 15, lw, H - 15, 18, list.length, (i, x, y, w) => {
    const c = list[i];
    ui.ctx.drawImage(portrait(c.look), 0, 0, 32, 32, x + 1, y + 1, 16, 16);
    ui.text(crewName(c), x + 20, y + 2, c.injured ? g.sem.bad : g.sem.text, { maxW: w - 90 });
    ui.text(`${JOBS[c.job].name.split(' ')[0]}${c.at && PLACE[c.at] ? ' @' + PLACE[c.at].name.split(' ')[0] : ''}${c.onMission ? ' (job)' : ''}${c.injured ? ` (hurt ${c.injured}d)` : ''}`, x + 20, y + 10, g.sem.textDim, { maxW: w - 90 });
    ui.bar(x + w - 64, y + 4, 40, 4, c.loyalty / 100, c.loyalty < 30 ? g.sem.bad : g.sem.good);
    ui.text(`$${c.wage}`, x + w - 2, y + 2, g.sem.dirty, { align: 'right' });
  }, { selected: sel, empty: rank(S) < 1 ? 'Reach Hustler to hire.' : 'No crew yet. Check the Recruit tab.' });
  if (clicked >= 0) g.ledgerCrew = list[clicked].id;
  const c = list.find((x) => x.id === g.ledgerCrew) || list[0];
  if (c) crewDetail(g, c, { x: R.x + lw + 8, y: top, w: R.w - lw - 8, h: H });
}

function crewDetail(g, c, R) {
  const ui = g.ui, S = g.S;
  ui.ctx.drawImage(portrait(c.look), R.x, R.y);
  ui.text(crewName(c), R.x + 36, R.y + 1, g.sem.text);
  const bg = BACKGROUNDS.find((b) => b.id === c.bg);
  ui.text(`${bg.name} | Lv ${c.level} | $${c.wage}/day${c.onBooks ? ' (on the books)' : ''}`, R.x + 36, R.y + 11, g.sem.textDim);
  ui.tipArea(R.x + 36, R.y + 10, 200, 10, bg.story);
  ui.text(c.traits.map((t, i) => (c.hidden[i] ? '??? (unvetted)' : TRAITS[t].name)).join(', '), R.x + 36, R.y + 21, g.sem.text);
  c.traits.forEach((t, i) => ui.tipArea(R.x + 36, R.y + 20, 220, 10, c.hidden[i] ? 'Hidden trait. Vet them to find out.' : `${TRAITS[t].name}: ${TRAITS[t].desc}`));
  let y = R.y + 36;
  const bw = Math.min(120, R.w / 2 - 70);
  SKILLS.forEach((s, i) => {
    const col = i % 2, rw = R.w / 2;
    const x = R.x + col * rw, yy = y + Math.floor(i / 2) * 11;
    ui.text(SKILL_NAMES[s], x, yy, g.sem.textDim);
    ui.bar(x + 64, yy + 1, bw, 6, c.skills[s] / 10, s === (JOBS[c.job] || {}).skill ? g.sem.accent : K.teal[2]);
    ui.text(String(effSkill(c, s)), x + 68 + bw, yy, g.sem.text);
    ui.tipArea(x, yy - 1, rw - 4, 10, `${SKILL_NAMES[s]} ${c.skills[s]} (effective ${effSkill(c, s)}): ${SKILL_TIPS[s]}`);
  });
  y += 56;
  for (const [l, v, col] of [['Loyalty', c.loyalty, c.loyalty < 30 ? g.sem.bad : g.sem.good], ['Morale', c.morale, K.gold[2]], ['Fatigue', c.fatigue, g.sem.warn]]) { ui.text(l, R.x, y, g.sem.textDim); ui.bar(R.x + 64, y + 1, bw, 6, v / 100, col); ui.text(String(Math.round(v)), R.x + 68 + bw, y, g.sem.text); y += 10; }
  ui.tipArea(R.x, y - 30, R.w, 30, 'Loyalty < 30: skims. < 25: may snitch. ~0: walks. Raises, paid wages, morale and being on the books help.');
  y += 4;
  // Job assignment.
  ui.text('Job', R.x, y + 2, g.sem.textDim);
  const ji = JOB_LIST.indexOf(c.job);
  if (btn(g, 'cr:jprev', R.x + 30, y, 13, '◀', {})) setJob(g, c, JOB_LIST[(ji - 1 + JOB_LIST.length) % JOB_LIST.length]);
  ui.text(JOBS[c.job].name, R.x + 48, y + 2, g.sem.text);
  if (btn(g, 'cr:jnext', R.x + 160, y, 13, '▶', {})) setJob(g, c, JOB_LIST[(ji + 1) % JOB_LIST.length]);
  if (JOB_AT[c.job]) {
    const opts = JOB_AT[c.job] === 'town' ? SETTLEMENT_IDS.filter((t) => S.visited[t]) : S.businesses.map((b) => b.uid);
    const ai = Math.max(0, opts.indexOf(c.at));
    const name = JOB_AT[c.job] === 'town' ? (PLACE[c.at] || {}).name || 'pick town' : (() => { const b = S.businesses.find((x) => x.uid === c.at); return b ? `${BUSINESSES[b.type].name} (${PLACE[b.town].name})` : 'pick front'; })();
    if (opts.length && btn(g, 'cr:at', R.x + 180, y, R.w - 180, name, { tip: 'Click to cycle where they work.' })) assign(S, c.id, c.job, opts[(ai + (c.at ? 1 : 0)) % opts.length]);
  }
  if (c.job === 'trainee') { const ti = SKILLS.indexOf(c.train || 'gunplay'); if (btn(g, 'cr:train', R.x + 180, y, R.w - 180, `Train ${SKILL_NAMES[c.train || 'gunplay']}`, { tip: 'Cycle the skill being trained. A Training Room triples the pace.' })) c.train = SKILLS[(ti + 1) % SKILLS.length]; if (!c.train) c.train = 'gunplay'; }
  y += 16;
  // Gun for fighters.
  if (['squad', 'guard', 'garrison', 'enforcer'].includes(c.job)) {
    const spare = S.guns.filter((x) => !S.player.loadout.includes(x.id) && (!S.crew.some((m) => m.gun === x.id) || c.gun === x.id));
    const gi = spare.findIndex((x) => x.id === c.gun);
    const gun = S.guns.find((x) => x.id === c.gun);
    if (btn(g, 'cr:gun', R.x, y, R.w, `Gun: ${gun ? gunName(gun) : 'none (cycle)'}`, { tip: 'Cycle through your spare guns.' })) c.gun = spare.length ? spare[(gi + 1) % spare.length].id : null;
    y += 16;
  }
  const bw2 = Math.floor((R.w - 8) / 4);
  if (btn(g, 'cr:vet', R.x, y, bw2, c.vetted ? 'Vetted' : `Vet ${fmtMoney(vetCost(S, c))}`, { disabled: c.vetted })) say(g, vet(S, c));
  if (btn(g, 'cr:raise', R.x + bw2 + 2, y, bw2, 'Raise +15%', { tip: `Loyalty +15, morale +8. New wage $${Math.round(c.wage * 1.15)}.` })) say(g, giveRaise(S, c));
  if (btn(g, 'cr:books', R.x + (bw2 + 2) * 2, y, bw2, c.onBooks ? 'Off books' : 'On books', { tip: 'On the books: paid clean (x1.2), lowers laundering audit risk and snitching.' })) say(g, toggleBooks(S, c));
  if (btn(g, 'cr:fire', R.x + (bw2 + 2) * 3, y, bw2, 'Fire', { danger: true })) g.ui.confirm(`Fire ${crewName(c)}? Others lose a little loyalty; bitter ex-crew may talk.`, () => say(g, fire(S, c.id)));
  y += 16;
  if (rank(S) >= 2) {
    const targets = ['hollow', ...S.businesses.map((b) => b.uid)];
    const ti = targets.indexOf(c.manages);
    if (btn(g, 'cr:mgr', R.x, y, R.w, c.manages ? `Manages ${c.manages === 'hollow' ? 'the Hollow' : 'a front'} (cycle)` : 'Promote to manager', { tip: `Managers automate: replanting, standing orders, auto-packing, staff rehiring. Efficiency ${Math.round(Math.min(1, 0.5 + 0.05 * effSkill(c, 'leadership')) * 100)}% (Leadership).` })) say(g, promote(S, c, targets[(ti + 1) % targets.length]));
  }
}

function setJob(g, c, job) {
  const S = g.S;
  let at = null;
  if (JOB_AT[job] === 'town') at = SETTLEMENT_IDS.find((t) => S.visited[t] && tradeAllowed(S, t)) || 'millbrook';
  if (JOB_AT[job] === 'biz') at = S.businesses[0] ? S.businesses[0].uid : null;
  if (JOB_AT[job] === 'biz' && !at) { g.toast('You need a front first.', 'bad'); return; }
  const r = assign(S, c.id, job, at);
  if (!r.ok) say(g, r);
  if (job === 'trainee' && !c.train) c.train = 'gunplay';
}

// ---------- Production ----------
function production(g, R) {
  const ui = g.ui, S = g.S;
  const views = ['Hollow', 'Smelter', 'Lathe', 'Press', 'Bench', 'Post-harvest', 'Strains'];
  const map = { smelter: 1, lathe: 2, press: 3, bench: 4, post: 5 };
  if (g.prodStation) { g.prodView = map[g.prodStation] ?? 0; g.prodStation = null; }
  g.prodView = ui.tabs('pr:view', R.x, R.y, Math.min(R.w, 460), views, g.prodView || 0);
  const B = { x: R.x, y: R.y + 16, w: R.w, h: R.h - 16 };
  if (g.prodView === 0) hollowGrid(g, B);
  else if (g.prodView <= 4) stationView(g, B, ['', 'smelter', 'lathe', 'press', 'bench'][g.prodView]);
  else if (g.prodView === 5) postHarvest(g, B);
  else strainCodex(g, B);
}

function hollowGrid(g, R) {
  const ui = g.ui, S = g.S;
  const cell = Math.min(34, Math.floor((R.h - 20) / 6));
  const gx = R.x, gy = R.y + 4;
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const idx = j * 6 + i;
    const c = S.hollow.cells[idx];
    const x = gx + i * cell, y = gy + j * cell;
    const unlocked = i < Math.max(S.hollow.size, [4, 4, 5, 6, 6, 6][rank(S)]) && j < Math.max(S.hollow.size, [4, 4, 5, 6, 6, 6][rank(S)]);
    ui.rect(x, y, cell - 2, cell - 2, unlocked ? K.ink[2] : K.ink[0]);
    if (c) {
      ui.icon(FACILITIES[c.fac].icon, x + (cell - 12) / 2, y + 4, c.plant ? strainData(S, c.plant.strain).tint : 'bone');
      if (c.plant) { const st = strainData(S, c.plant.strain); ui.bar(x + 2, y + cell - 8, cell - 6, 4, c.plant.growth / st.grow, ready(S, c.plant) ? g.sem.rep : g.sem.good); }
    }
    const act = ui.area('pr:cell:' + idx, x, y, cell - 2, cell - 2, { tip: c ? `${FACILITIES[c.fac].name}${c.plant ? `\n${strainData(S, c.plant.strain).name}: ${stageName(S, c.plant)}\nWater ${Math.round(c.plant.water)} Nutr ${Math.round(c.plant.nutr)} Health ${Math.round(c.plant.health)}` : ''}` : unlocked ? 'Empty: click to build' : 'Locked: grows with rank' });
    if (act === 'click' && unlocked) g.openInteraction({ kind: 'cell', i: idx });
  }
  const tx = gx + cell * 6 + 10;
  let y = R.y + 4;
  H2(g, 'The Hollow', tx, y); y += 12;
  const lines = [
    `Plots: ${plotIdx(S).length}  (ripe ${plotIdx(S).filter((i) => ready(S, S.hollow.cells[i].plant)).length})`,
    `Farmers: ${onJob(S, 'farmer').length} (tend ${onJob(S, 'farmer').reduce((a, f) => a + Math.floor(4 + effSkill(f, 'farming') / 2), 0)} plots)`,
    `Power: ${S.hollow.power}/${S.hollow.powerCap}${S.hollow.noPower ? ' - NO POWER' : ''}   Fuel: ${count(S, 'fuel')}`,
    `Compost: ${count(S, 'compost')}   Scrap: ${count(S, 'scrap')}`,
    `Drying ${S.drying.reduce((a, d) => a + d.units, 0)}/${dryCap(S)}   Curing ${S.curing.reduce((a, d) => a + d.units, 0)}/${cureCap(S)}`,
    `Workshop tier ${['', 'I', 'II', 'III', 'IV'][S.hollow.bench]} (${modSlotsFor(S)} mod slot${modSlotsFor(S) > 1 ? 's' : ''})`,
    `Defense power ${defensePower(S, false)}  |  Stash protected ${fmtMoney(stashProtected(S))}`,
  ];
  for (const l of lines) { ui.text(l, tx, y, g.sem.text); y += 10; }
  ui.tipArea(tx, y - 10, 260, 10, 'Defense = guards (x2 on watch posts) + turrets 14 + traps 6 + walls 15 + security 10/level. Raiders bring their own number.');
  y += 6;
  ui.wrapText('Click a cell to build or tend. Outdoor plots need you (or a Farmer) to water and feed them. Grow rooms need power, a water tank and fuel.', tx, y, R.x + R.w - tx, g.sem.textDim);
}

function recipesFor(S, st) {
  if (st === 'smelter') return [{ kind: 'iron' }, { kind: 'steel' }];
  if (st === 'press') return Object.keys(AMMO).flatMap((t) => ['std', 'ap', 'inc'].filter((v) => t !== 'bolt' || v === 'std').map((v) => ({ kind: 'ammo', type: t, variant: v })));
  if (st === 'lathe') return COMP_IDS.flatMap((t) => MATERIAL_IDS.map((m) => ({ kind: 'comp', type: t, mat: m })));
  const out = BLUEPRINTS.filter((b) => S.bps[b.id]).map((b) => ({ kind: 'gun', bp: b.id, mat: 'best' }));
  for (const id of Object.keys(THROWABLES).concat(Object.keys(GADGETS))) out.push({ kind: 'gadget', id });
  for (const id of Object.keys(MODS)) out.push({ kind: 'mod', id });
  return out;
}

function stationView(g, R, st) {
  const ui = g.ui, S = g.S;
  const def = STATIONS[st];
  const n = facCount(S, def.fac);
  const workers = onJob(S, def.job);
  ui.text(`${def.name}: ${n} built  |  ${workers.length} ${JOBS[def.job].name}${workers.length === 1 ? '' : 's'}${workers.length ? '' : ' (you tinker at 60% speed)'}`, R.x, R.y + 2, n ? g.sem.text : g.sem.bad);
  if (!n) { ui.text('Build one in the Hollow grid first.', R.x, R.y + 14, g.sem.textDim); return; }
  const lw = Math.floor(R.w * 0.5);
  // Queue.
  const q = S.queues[st];
  H2(g, 'Queue', R.x, R.y + 14);
  ui.list('pr:q:' + st, R.x, R.y + 25, lw - 6, R.h - 100, 14, q.length, (i, x, y, w) => {
    const o = q[i];
    ui.text(`${orderLabel(S, o)}  ${o.done}/${o.count}`, x + 2, y + 3, o.wait ? g.sem.warn : g.sem.text, { maxW: w - 60 });
    if (o.active) ui.bar(x + w - 58, y + 4, 30, 5, o.prog / orderHours(S, o), g.sem.good);
    if (o.wait) ui.tipArea(x, y, w - 30, 14, o.wait);
    if (ui.button(`pr:cancel:${o.id}`, x + w - 24, y + 1, 22, 12, '✗', { tip: 'Cancel (materials of the current unit are refunded)' })) cancelOrder(S, st, o.id);
  }, { noClick: true, empty: 'Idle. Queue something.' });
  // Standing orders.
  const sy = R.y + R.h - 72;
  H2(g, 'Standing orders', R.x, sy);
  const so = S.standing.filter((x) => (x.kind === 'iron' || x.kind === 'steel' ? 'smelter' : x.kind === 'comp' ? 'lathe' : x.kind === 'ammo' ? 'press' : 'bench') === st);
  so.slice(0, 4).forEach((x, i) => { ui.text(`Keep ${x.keep} x ${orderLabel(S, x)} (have ${stockOf(S, x)})`, R.x, sy + 11 + i * 11, g.sem.text, { maxW: lw - 40 }); if (btn(g, 'pr:sodel:' + x.sid, R.x + lw - 30, sy + 10 + i * 11, 22, '✗', {})) S.standing.splice(S.standing.indexOf(x), 1); });
  if (!so.length) ui.text('None. Add one on the right: the station keeps stock topped up.', R.x, sy + 11, g.sem.textMute, { maxW: lw - 10 });
  S.autoChain = ui.toggle('pr:chain', R.x, R.y + R.h - 12, 'Auto-chain missing parts', S.autoChain, { tip: 'Bench orders queue missing components at the lathe; lathe orders queue smelting.' });
  // Recipe picker.
  const rx = R.x + lw, rw = R.w - lw;
  H2(g, 'New order', rx, R.y + 14);
  const recs = recipesFor(S, st);
  g.recipe = g.recipe || {};
  const ri = Math.min(g.recipe[st] || 0, recs.length - 1);
  const rec = recs[ri];
  const rows = Math.floor((R.h - 110) / 13);
  const sc = Math.max(0, Math.min(ri - Math.floor(rows / 2), recs.length - rows));
  const picked = ui.list('pr:recs:' + st, rx, R.y + 25, rw, rows * 13, 13, recs.length, (i, x, y, w) => {
    const o = recs[i];
    const why = cantMake(S, o);
    ui.text(orderLabel(S, o), x + 2, y + 2, why ? g.sem.textMute : g.sem.text, { maxW: w - 8 });
  }, { selected: ri });
  void sc;
  if (picked >= 0) g.recipe[st] = picked;
  if (!rec) return;
  const by = R.y + 30 + rows * 13;
  const why = cantMake(S, rec);
  const inp = rec.kind === 'gun' ? COMP_IDS.map((t) => COMPONENTS[t].name).join(' + ') + ' (+mods)' : Object.entries(orderInputs(S, rec)).map(([k, v]) => `${v} ${itemInfo(k).name}`).join(', ');
  ui.text(`Needs: ${inp}`, rx, by, why ? g.sem.warn : g.sem.textDim, { maxW: rw });
  ui.tipArea(rx, by, rw, 10, rec.kind === 'gun' ? gunTip(S, rec.bp) : rec.kind === 'comp' ? `${COMPONENTS[rec.type].name} affects ${COMPONENTS[rec.type].stats.join(', ')}. Material x${MATERIALS[rec.mat].mult}; stars roll from crafter skill and bench tier.` : '');
  g.qty = g.qty || 1;
  if (btn(g, 'pr:qm', rx, by + 12, 13, '-', {})) g.qty = Math.max(1, g.qty - 1);
  ui.text(`x${g.qty}`, rx + 18, by + 14, g.sem.text);
  if (btn(g, 'pr:qp', rx + 36, by + 12, 13, '+', {})) g.qty = Math.min(20, g.qty + 1);
  if (rec.kind === 'gun') {
    g.minGrade = g.minGrade || 'junk';
    const gi = GRADES.findIndex((x) => x.id === g.minGrade);
    if (btn(g, 'pr:grade', rx + 54, by + 12, 86, `${GRADES[gi].name}+`, { tip: 'Quality control: units below this grade do not count toward the order.' })) g.minGrade = GRADES[(gi + 1) % GRADES.length].id;
    g.gunMat = g.gunMat || 'best';
    const mats = ['best', ...MATERIAL_IDS];
    if (btn(g, 'pr:mat', rx + 144, by + 12, 60, g.gunMat, { tip: 'Which component material to use (best = highest you own).' })) g.gunMat = mats[(mats.indexOf(g.gunMat) + 1) % mats.length];
  }
  const order = { ...rec, count: g.qty, ...(rec.kind === 'gun' ? { minGrade: g.minGrade, mat: g.gunMat } : {}) };
  if (btn(g, 'pr:queue', rx, by + 28, rw / 2 - 2, 'Queue', { primary: true, disabled: !!why, tip: why || 'Add to the queue.' })) say(g, enqueue(S, order));
  if (btn(g, 'pr:stand', rx + rw / 2 + 2, by + 28, rw / 2 - 2, `Standing: keep ${g.qty}`, { disabled: !!why, tip: 'Keep this many in stock automatically.' })) say(g, addStanding(S, { ...order, count: undefined, keep: g.qty }));
}

function cantMake(S, o) {
  const bench = S.hollow.bench;
  if (o.kind === 'steel' && bench < 2) return 'Workshop tier II';
  if (o.kind === 'comp' && MATERIALS[o.mat].bench > bench) return `Bench ${MATERIALS[o.mat].bench}`;
  if (o.kind === 'ammo' && o.variant !== 'std' && bench < 2) return 'Workshop tier II';
  if (o.kind === 'gun' && BP[o.bp].bench > bench) return `Bench ${BP[o.bp].bench}`;
  if (o.kind === 'mod' && MODS[o.id].bench > bench) return `Bench ${MODS[o.id].bench}`;
  return null;
}

function gunTip(S, bp) {
  const b = BP[bp];
  return `${b.name} (${b.family}, ${b.ammo})\nDmg ${b.dmg}${b.pellets > 1 ? 'x' + b.pellets : ''}  RPM ${b.rpm}  Acc ${b.acc}\nRange ${b.range}  Mag ${b.mag}  Noise ${b.noise}\nBase value $${b.value}. Final stat = base x component multipliers x mods.`;
}

function postHarvest(g, R) {
  const ui = g.ui, S = g.S;
  H2(g, `Drying (${S.drying.reduce((a, d) => a + d.units, 0)}/${dryCap(S)})`, R.x, R.y + 2);
  S.drying.slice(0, 5).forEach((d, i) => ui.text(`${strainData(S, d.strain).name} x${d.units}  ${Math.ceil(d.h)}h left`, R.x, R.y + 13 + i * 10, g.sem.text));
  H2(g, `Curing (${S.curing.reduce((a, d) => a + d.units, 0)}/${cureCap(S)})`, R.x, R.y + 66);
  S.curing.slice(0, 5).forEach((d, i) => { ui.text(`${strainData(S, d.strain).name} x${d.units}  ${Math.ceil(d.h)}h  cure x${d.m.toFixed(2)}`, R.x, R.y + 77 + i * 10, g.sem.text); ui.tipArea(R.x, R.y + 76 + i * 10, 200, 10, `Quality score ${(d.q * d.m).toFixed(0)} = (potency x0.62 + care x0.38 + farmer) ${d.q.toFixed(0)} x cure ${d.m.toFixed(2)}.\nTiers: Mid 45, Prime 70, Legendary 95.`); });
  S.packAuto.on = ui.toggle('pr:autopack', R.x, R.y + 134, 'Auto-pack cured bud', S.packAuto.on, { tip: 'A Curer does this anyway.' });
  const forms = Object.keys(PACKS);
  if (btn(g, 'pr:apform', R.x + 140, R.y + 132, 70, PACKS[S.packAuto.form].name, { tip: 'Auto-pack form' })) S.packAuto.form = forms[(forms.indexOf(S.packAuto.form) + 1) % forms.length];
  const bx = R.x + Math.floor(R.w * 0.45);
  H2(g, 'Cured bud - pack it', bx, R.y + 2);
  const buds = Object.keys(S.inv).filter((k) => k.startsWith('bud:'));
  ui.list('pr:buds', bx, R.y + 13, R.w - (bx - R.x), R.h - 20, 16, buds.length, (i, x, y, w) => {
    const k = buds[i];
    const [, st, q] = k.split(':');
    const info = itemInfo(k, S.strains.hybrids);
    ui.icon('bud', x + 2, y + 3, info.tint);
    ui.text(`${info.name} x${count(S, k)}`, x + 15, y + 4, g.sem.text, { maxW: w - 170 });
    forms.forEach((f, j) => { const n = Math.floor(count(S, k) / PACKS[f].units); if (ui.button(`pr:pack:${k}:${f}`, x + w - 156 + j * 52, y + 1, 50, 13, `${PACKS[f].name} ${n}`, { disabled: !n, tip: `Pack all into ${PACKS[f].name.toLowerCase()}s (${PACKS[f].units} unit${PACKS[f].units > 1 ? 's' : ''} each, base $${PACKS[f].base} x quality ${QUALITY[+q].mult}).` })) say(g, packBud(S, st, +q, f, n)); });
  }, { noClick: true, empty: 'No cured bud yet.' });
}

function strainCodex(g, R) {
  const ui = g.ui, S = g.S;
  const ids = [...Object.keys(STRAINS), ...Object.keys(S.strains.hybrids)];
  ui.list('pr:codex', R.x, R.y + 2, R.w, R.h - 4, 22, ids.length, (i, x, y, w) => {
    const st = strainData(S, ids[i]);
    const known = S.strains.known[ids[i]];
    ui.icon('bud', x + 2, y + 5, known ? st.tint : 'ink');
    ui.text(known ? st.name : '??? (undiscovered)', x + 16, y + 2, known ? g.sem.text : g.sem.textMute);
    if (known) ui.text(`Grow ${st.grow}h  Yield ${st.yield}  Potency ${Math.round(st.potency)}  Hardiness ${Math.round(st.hardiness)}  Smell ${Math.round(st.smell)}${st.night > 1 ? '  night' : ''}`, x + 16, y + 11, g.sem.textDim, { maxW: w - 20 });
    ui.tipArea(x, y, w, 22, known ? st.desc : 'Crossbreed strains in a Breeding Lab to discover hybrids.');
  }, { noClick: true });
}

// ---------- Inventory ----------
const CATS = [['Products', (k, i) => i.cat === 'product' || i.cat === 'bud' || i.cat === 'seed'], ['Materials', (k, i) => i.cat === 'material'], ['Parts', (k, i) => i.cat === 'component'], ['Ammo', (k, i) => i.cat === 'ammo'], ['Mods/Gear', (k, i) => i.cat === 'mod' || i.cat === 'gadget' || i.cat === 'throwable'], ['Loot', (k, i) => i.cat === 'loot'], ['Guns', null]];

function inventory(g, R) {
  const ui = g.ui, S = g.S;
  g.invCat = ui.tabs('inv:cat', R.x, R.y, Math.min(R.w, 420), CATS.map((c) => c[0]), g.invCat || 0);
  const B = { x: R.x, y: R.y + 16, w: R.w, h: R.h - 16 };
  if (CATS[g.invCat][1] === null) return gunsView(g, B);
  const items = invList(S, CATS[g.invCat][1]).sort((a, b) => a.info.name.localeCompare(b.info.name));
  ui.list('inv:list', B.x, B.y, B.w, B.h - 24, 13, items.length, (i, x, y, w) => {
    const it = items[i];
    ui.icon(it.info.icon, x + 2, y + 1, it.info.tint);
    ui.text(it.info.name, x + 15, y + 2, g.sem.text, { maxW: w - 140 });
    ui.text(`x${fmtNum(it.n, it.n % 1 ? 1 : 0)}`, x + w - 70, y + 2, g.sem.text, { align: 'right' });
    ui.text(`~${fmtMoney(it.info.base)}`, x + w - 4, y + 2, g.sem.textMute, { align: 'right' });
    ui.tipArea(x, y, w, 13, `${it.info.name}\n${it.info.desc || ''}\nBase value ${fmtMoney(it.info.base)}`);
  }, { noClick: true, empty: 'Nothing here.' });
  const carry = Object.entries(S.player.carry);
  ui.text(carry.length ? `On you (stashed at the Hollow): ${carry.map(([k, n]) => `${n} ${itemInfo(k, S.strains.hybrids).name}`).join(', ')}` : 'Nothing carried.', B.x, B.y + B.h - 20, g.sem.textDim, { maxW: B.w });
  ui.text(`Throwable: ${THROWABLES[S.player.throwSel].name} (4 to cycle)`, B.x, B.y + B.h - 10, g.sem.textDim);
}

function gunsView(g, R) {
  const ui = g.ui, S = g.S;
  const lw = Math.floor(R.w * 0.45);
  const guns = S.guns;
  const sel = guns.findIndex((x) => x.id === g.invGun);
  const c = ui.list('inv:guns', R.x, R.y, lw, R.h, 16, guns.length, (i, x, y, w) => {
    const gun = guns[i];
    const slot = S.player.loadout.indexOf(gun.id);
    const crew = S.crew.find((m) => m.gun === gun.id);
    ui.icon({ sidearm: 'g_sidearm', shotgun: 'g_shotgun', rifle: 'g_rifle', smg: 'g_smg', silent: 'g_silent', heavy: 'g_heavy' }[BP[gun.bp].family], x + 2, y + 4);
    ui.text(gunName(gun), x + 22, y + 4, RAMPS[GRADES.find((q) => q.id === gun.grade).color][3], { maxW: w - 70 });
    ui.text(slot >= 0 ? `slot ${slot + 1}` : crew ? crew.first : '', x + w - 4, y + 4, g.sem.textDim, { align: 'right' });
  }, { selected: sel, empty: 'No guns. Craft one at the Assembly Bench.' });
  if (c >= 0) g.invGun = guns[c].id;
  const gun = guns.find((x) => x.id === g.invGun);
  if (!gun) return;
  const x = R.x + lw + 8, w = R.w - lw - 8;
  let y = R.y;
  const st = gunStats(S, gun);
  ui.text(gunName(gun) + (gun.unreliable ? ' [Unreliable]' : ''), x, y, g.sem.text); y += 11;
  const stats = [['Damage', `${st.dmg.toFixed(1)}${st.pellets > 1 ? ' x' + st.pellets : ''}`], ['Fire rate', `${st.rpm.toFixed(0)} rpm`], ['Accuracy', st.acc.toFixed(0)], ['Range', `${st.range.toFixed(1)} tiles`], ['Magazine', String(st.mag)], ['Reload', `${st.reload.toFixed(2)} s`], ['Noise', `${st.noise.toFixed(0)} tiles`], ['Handling', st.handling.toFixed(2)], ['Jam chance', `${(st.jam * 100).toFixed(2)}%`], ['Durability', `${Math.round(gun.dur)}/${gun.maxDur}`]];
  stats.forEach(([l, v], i) => { ui.text(l, x + (i % 2) * (w / 2), y + Math.floor(i / 2) * 10, g.sem.textDim); ui.text(v, x + (i % 2) * (w / 2) + w / 2 - 6, y + Math.floor(i / 2) * 10, g.sem.text, { align: 'right' }); });
  ui.tipArea(x, y, w, 50, `Components:\n${COMP_IDS.map((t) => `${COMPONENTS[t].name}: ${MATERIALS[gun.comps[t].mat].name} ${'★'.repeat(gun.comps[t].stars)} (x${(MATERIALS[gun.comps[t].mat].mult * (1 + 0.08 * (gun.comps[t].stars - 3))).toFixed(2)})`).join('\n')}\nFinal stat = blueprint base x component multipliers x mods x grade.`);
  y += 54;
  for (let s = 0; s < 3; s++) if (btn(g, 'inv:eq' + s, x + s * (w / 3), y, w / 3 - 2, S.player.loadout[s] === gun.id ? `In slot ${s + 1}` : `Slot ${s + 1}`, { active: S.player.loadout[s] === gun.id })) { for (let k = 0; k < 3; k++) if (S.player.loadout[k] === gun.id) S.player.loadout[k] = null; const crew = S.crew.find((m) => m.gun === gun.id); if (crew) crew.gun = null; S.player.loadout[s] = gun.id; }
  y += 16;
  const vars = ['std', 'ap', 'inc'].filter((v) => v === 'std' || BP[gun.bp].ammo !== 'bolt');
  if (btn(g, 'inv:ammo', x, y, w / 2 - 2, `Ammo: ${AMMO_VARIANTS[gun.ammoVar || 'std'].name || 'Standard'}`, { tip: `AP pierces armor and shields; Incendiary sets fires. You have ${count(S, 'ammo:' + BP[gun.bp].ammo + ((gun.ammoVar || 'std') === 'std' ? '' : ':' + gun.ammoVar))} rounds.` })) { gun.ammoVar = vars[(vars.indexOf(gun.ammoVar || 'std') + 1) % vars.length]; gun.loaded = 0; }
  if (btn(g, 'inv:repair', x + w / 2 + 2, y, w / 2 - 2, 'Repair (bench)', { disabled: gun.dur >= gun.maxDur })) say(g, enqueue(S, { kind: 'repair', gun: gun.id, count: 1 }));
  y += 16;
  if (btn(g, 'inv:study', x, y, w / 2 - 2, 'Study / strip', { tip: S.bps[gun.bp] ? 'Strip for parts (blueprint already known).' : 'Disassemble at the bench: chance to learn its blueprint.', danger: true })) g.ui.confirm(`Strip the ${gunName(gun)} at the bench? The gun is destroyed.`, () => say(g, enqueue(S, { kind: 'study', gun: gun.id, count: 1 })));
  y += 18;
  H2(g, `Mods (${modSlotsFor(S)} slot${modSlotsFor(S) > 1 ? 's' : ''} at this bench tier)`, x, y); y += 11;
  for (const [slot, id] of Object.entries(gun.mods)) { ui.text(`${SLOT_NAMES[slot]}: ${MODS[id].name}`, x, y + 2, g.sem.text); if (btn(g, 'inv:unmod:' + slot, x + w - 50, y, 48, 'Remove', {})) say(g, removeMod(S, gun.id, slot)); y += 14; }
  const owned = Object.keys(S.inv).filter((k) => k.startsWith('mod:') && S.inv[k] > 0).map((k) => k.slice(4));
  for (const id of owned.slice(0, 6)) { const why = canFit(S, gun, id); if (btn(g, 'inv:mod:' + id, x, y, w, `Fit ${MODS[id].name} (${SLOT_NAMES[MODS[id].slot]})`, { disabled: !!why, tip: why || MODS[id].desc })) say(g, installMod(S, gun.id, id)); y += 14; }
}

// ---------- Map & Markets ----------
function mapTab(g, R) {
  const ui = g.ui, S = g.S;
  const size = Math.min(R.h - 4, Math.floor(R.w * 0.55));
  const s = size / 128;
  const mx = R.x, my = R.y;
  const c = ui.ctx;
  c.imageSmoothingEnabled = false;
  c.drawImage(g.minimap, mx, my, size, size);
  c.fillStyle = K.ink[0];
  if (S.fog) for (let by = 0; by < 32; by++) for (let bx = 0; bx < 32; bx++) if (!S.fog[by * 32 + bx]) c.fillRect(Math.floor(mx + bx * 4 * s), Math.floor(my + by * 4 * s), Math.ceil(4 * s), Math.ceil(4 * s));
  overlayPlaces(g, (p) => ({ x: mx + p.at[0] * s, y: my + p.at[1] * s, w: p.w * s, h: p.h * s }), g.mapOverlay || 0);
  const P = g.act.player;
  ui.rect(Math.round(mx + P.x / 16 * s) - 1, Math.round(my + P.y / 16 * s) - 1, 3, 3, K.bone[3]);
  for (const p of PLACES) {
    const known = S.visited[p.id] || (S.fog && S.fog[Math.floor((p.at[1] + p.h / 2) / 4) * 32 + Math.floor((p.at[0] + p.w / 2) / 4)]);
    const x = mx + p.at[0] * s, y = my + p.at[1] * s;
    const act = ui.area('map:' + p.id, x, y, p.w * s, p.h * s, { tip: known ? `${p.name}\n${p.blurb}` : 'Unexplored', silent: true });
    if (act === 'click') g.mapSel = p.id;
    if (known && (p.kind === 'settlement' || p.kind === 'market' || p.id === 'hollow' || g.mapSel === p.id)) ui.text(p.name, x + p.w * s / 2, y - 8, g.mapSel === p.id ? g.sem.warn : g.sem.text, { align: 'center', shadow: K.ink[0] });
  }
  ['Map', 'Turf', 'Heat', 'Prices'].forEach((l, i) => { if (btn(g, 'map:ov' + i, mx + i * 46, my + size - 15, 44, l, { active: (g.mapOverlay || 0) === i })) g.mapOverlay = i; });
  // Side panel: selected place + markets table.
  const sx = R.x + size + 8, sw = R.w - size - 8;
  const p = PLACE[g.mapSel || 'millbrook'];
  let y = R.y;
  ui.text(p.name, sx, y, g.sem.accent); y += 11;
  y += ui.wrapText(p.blurb, sx, y, sw, g.sem.textDim, 9) + 2;
  if (S.towns[p.id]) { const T = S.towns[p.id]; ui.text(`Status ${T.status}${T.occupied ? ' (OCCUPIED)' : T.controlled ? ' (controlled)' : ''}  Heat ${Math.round(S.heat[p.id])}  Wealth ${Math.round(T.wealth)}`, sx, y, g.sem.text, { maxW: sw }); y += 10; }
  const known = S.visited[p.id];
  if (btn(g, 'map:travel', sx, y, sw, known ? `Travel to ${p.name}` : 'Not discovered yet', { disabled: !known || !g.act.player.alive || !!(S.mission && S.mission.phase !== 'go'), primary: true, tip: 'Fast travel: time passes based on distance and your vehicle. Ambushes happen at high heat or during wars.' })) g.travelTo(p.id);
  y += 18;
  H2(g, 'Markets (Mid Ashleaf baggie)', sx, y); y += 11;
  const towns = [...SETTLEMENT_IDS, 'crossroads'];
  for (const t of towns) {
    const pr = weedPrice(S, t, 'ashleaf', 1, 'baggie', 0);
    const ok = tradeAllowed(S, t);
    ui.text(PLACE[t].name, sx, y, ok ? g.sem.text : g.sem.textMute);
    ui.text(ok ? fmtMoney(pr.price) : 'locked', sx + sw - 70, y, g.sem.dirty, { align: 'right' });
    ui.bar(sx + sw - 64, y + 2, 60, 5, Math.min(1, sat(S, t, 'weed')), g.sem.bad);
    ui.tipArea(sx, y - 1, sw, 10, `${pr.lines.join('\n')}\nDemand ${demandOf(S, t, 'weed').toFixed(0)} units/day. Saturation ${(sat(S, t, 'weed') * 100).toFixed(0)}% (bar), -12%/day.\nGun demand ${demandOf(S, t, 'gun_rifle').toFixed(1)}/day per family.`);
    y += 10;
  }
}

// ---------- Businesses ----------
function businesses(g, R) {
  const ui = g.ui, S = g.S;
  g.bizView = ui.tabs('bz:view', R.x, R.y, 330, ['Fronts', 'Buy remote', 'Rackets'], g.bizView || 0);
  const B = { x: R.x, y: R.y + 16, w: R.w, h: R.h - 16 };
  if (g.bizView === 1) return remoteBuy(g, B);
  if (g.bizView === 2) return rackets(g, B);
  const lw = Math.floor(R.w * 0.42);
  const sel = S.businesses.findIndex((b) => b.uid === g.ledgerBiz);
  const c = ui.list('bz:list', B.x, B.y, lw, B.h, 18, S.businesses.length, (i, x, y, w) => {
    const b = S.businesses[i];
    ui.icon(BUSINESSES[b.type].icon, x + 2, y + 4);
    ui.text(`${BUSINESSES[b.type].name} - ${PLACE[b.town].name}`, x + 16, y + 2, b.frozen ? g.sem.bad : g.sem.text, { maxW: w - 60 });
    ui.text(`rev ${fmtMoney(legitRev(S, b))}/d  wash ${fmtMoney(b.washPlan)}/d`, x + 16, y + 10, g.sem.textDim, { maxW: w - 60 });
    ui.bar(x + w - 40, y + 6, 36, 5, b.risk / 100, b.risk > 50 ? g.sem.bad : g.sem.warn);
  }, { selected: sel, empty: S.tutorial.on && !S.tutorial.done ? 'Buy the Millbrook lot with Mags\' shell deal.' : 'No fronts. Visit a vacant lot, or use Buy remote.' });
  if (c >= 0) g.ledgerBiz = S.businesses[c].uid;
  const b = S.businesses.find((x) => x.uid === g.ledgerBiz) || S.businesses[0];
  if (!b) return;
  const x = B.x + lw + 8, w = B.w - lw - 8;
  let y = B.y;
  const T = BUSINESSES[b.type];
  ui.text(`${T.name} - ${PLACE[b.town].name}`, x, y, g.sem.accent); y += 11;
  y += ui.wrapText(T.special, x, y, w, g.sem.textDim, 9) + 2;
  const rev = legitRev(S, b), cap = washCapacity(S, b), fee = washFee(S, b);
  const acct = onJob(S, 'accountant', b.uid);
  const lines = [[`Legit revenue: ${fmtMoney(rev)}/day (profit ${fmtMoney(rev * (1 - T.upkeep))} clean)`, `${T.rev} base x size x traffic x staff x hustle x rank brand${hasPerk(S, 'op_empire') ? ' x1.12' : ''}`], [`Wash capacity: ${fmtMoney(cap)}/day`, `0.8 x legit revenue ${fmtMoney(rev)} x (1 + 0.1 x accountant Bookkeeping ${acct.length ? effSkill(acct[0], 'bookkeeping') : 0})`], [`Laundering fee: ${(fee * 100).toFixed(0)}%  (wash takes ${T.wash}d)`, `25% - 2% per accountant Bookkeeping point${hasPerk(S, 'op_books') ? ' - 3% Clean Books perk' : ''}, floor 8%.`], [`Audit risk: ${b.risk.toFixed(0)}%${b.frozen ? `  FROZEN ${b.frozen}d` : ''}`, 'Grows by (excess / legit revenue) x 15% x audit factor per day when you wash above capacity; decays 5%/day otherwise. Daily audit chance ~ (risk-5)% x 0.6.']];
  for (const [l, tip] of lines) { ui.text(l, x, y, g.sem.text, { maxW: w }); ui.tipArea(x, y - 1, w, 10, tip); y += 10; }
  ui.text(`Wash plan: ${fmtMoney(b.washPlan)}/day`, x, y + 2, b.washPlan > cap ? g.sem.bad : g.sem.text);
  const nv = ui.slider('bz:wash', x + 130, y + 1, w - 140, b.washPlan, 0, Math.max(200, Math.ceil(cap * 2 / 10) * 10), { step: 10, color: b.washPlan > cap ? g.sem.bad : g.sem.clean, tip: 'Dirty money pushed through each dawn. Above capacity = audit risk.' });
  if (nv !== b.washPlan) setWashPlan(S, b, nv);
  y += 14;
  if (btn(g, 'bz:cap', x, y, 110, 'Set to capacity', {})) setWashPlan(S, b, Math.floor(cap));
  ui.text(`In the wash: ${fmtMoney(b.washQ.reduce((a, q) => a + q.amt, 0))}`, x + 116, y + 2, g.sem.textDim);
  y += 16;
  ui.text(`Staff ${staffOf(S, b).length}/${T.staff}  Accountants ${acct.length}  (assign in Crew)`, x, y, g.sem.textDim); y += 12;
  for (const up of Object.keys(BIZ_UPGRADES)) {
    const U = BIZ_UPGRADES[up];
    const cst = upgradeCost(S, b, up);
    if (up === 'backroom' && cst !== null) {
      ['storage', 'grow', 'dist'].forEach((ch, i) => { if (btn(g, `bz:br:${ch}`, x + i * (w / 3), y, w / 3 - 2, `Back room: ${ch} ${fmtMoney(cst)}`, { tip: U.desc })) say(g, buyUpgrade(S, b, up, ch)); });
    } else if (btn(g, 'bz:up:' + up, x, y, w, cst === null ? `${U.name} (done)` : `${U.name} ${fmtMoney(cst)} clean`, { disabled: cst === null, tip: U.desc })) say(g, buyUpgrade(S, b, up));
    y += 15;
  }
  if (btn(g, 'bz:bribe', x, y, w / 2 - 2, `Bribe auditor ${fmtMoney(bribeAuditorCost(S, b))}`, { disabled: b.risk < 5, tip: 'Audit risk -30 (dirty money).' })) say(g, bribeAuditor(S, b));
  if (btn(g, 'bz:sell', x + w / 2 + 2, y, w / 2 - 2, 'Sell front', { danger: true })) g.ui.confirm(`Sell the ${T.name}? You get 60% of its value in clean money.`, () => say(g, sellBusiness(S, b)));
}

function remoteBuy(g, R) {
  const ui = g.ui, S = g.S;
  const lots = g.W.buildings.filter((b) => b.lot && S.visited[b.place] && !lotOwner(S, b.place, b.id));
  ui.text("A lawyer handles remote purchases. First front: Mags' shell deal (dirty +25%). Otherwise clean money.", R.x, R.y, g.sem.textDim, { maxW: R.w });
  ui.list('bz:lots', R.x, R.y + 12, R.w, R.h - 12, 16, lots.length, (i, x, y, w) => {
    const b = lots[i];
    ui.text(`Vacant lot - ${PLACE[b.place].name}`, x + 4, y + 4, g.sem.text);
    if (btn(g, 'bz:open:' + b.id, x + w - 90, y + 1, 88, 'Choose front', {})) g.openInteraction({ kind: 'lot', b, place: b.place });
  }, { noClick: true, empty: 'No vacant lots in towns you have visited.' });
}

function rackets(g, R) {
  const ui = g.ui, S = g.S;
  if (rank(S) < 2) { ui.text('Protection rackets and loan sharking unlock at Supplier.', R.x, R.y + 2, g.sem.textDim); return; }
  H2(g, 'Protection', R.x, R.y);
  const towns = SETTLEMENT_IDS.filter((t) => S.visited[t]);
  towns.forEach((t, i) => {
    const y = R.y + 11 + i * 14;
    const on = !!S.protection[t];
    const enf = onJob(S, 'enforcer', t).length;
    ui.text(`${PLACE[t].name}: ${on ? 'running' : 'off'} (${enf} enforcer${enf === 1 ? '' : 's'})`, R.x, y + 2, on ? g.sem.good : g.sem.text);
    if (btn(g, 'rk:p:' + t, R.x + 200, y, 80, on ? 'Stop' : 'Start', { disabled: !on && !enf, tip: `Daily take ~${fmtMoney(S.towns[t].wealth * 1.2 * (1 + 0.2 * rank(S)))} dirty, +0.45 heat/day. Needs an enforcer assigned to the town.` })) say(g, on ? stopProtection(S, t) : startProtection(S, t));
  });
  const lx = R.x + Math.floor(R.w / 2);
  H2(g, 'Loan sharking (clean cash out, interest back)', lx, R.y);
  let y = R.y + 11;
  for (const o of S.loanOffers) { ui.text(`${o.name} (${PLACE[o.town].name}): ${fmtMoney(o.amt)} @ ${Math.round(o.rate * 100)}%/wk`, lx, y + 2, g.sem.text, { maxW: R.w / 2 - 70 }); ui.tipArea(lx, y, R.w / 2 - 70, 12, `Default risk ~${Math.round(o.risk * 100)}% (halved-ish with an enforcer in town).`); if (btn(g, 'rk:lend:' + o.id, R.x + R.w - 60, y, 58, 'Lend', { disabled: S.money.clean < o.amt })) say(g, makeLoan(S, o.id)); y += 14; }
  y += 6;
  H2(g, 'Outstanding', lx, y); y += 11;
  for (const l of S.loans) { ui.text(`${l.name}: ${fmtMoney(l.amt)} due day ${l.due}`, lx, y, g.sem.textDim); y += 10; }
}

// ---------- Heat & Rivals ----------
function heatTab(g, R) {
  const ui = g.ui, S = g.S;
  const lw = Math.floor(R.w * 0.48);
  H2(g, 'Heat by town', R.x, R.y);
  let y = R.y + 11;
  for (const t of SETTLEMENT_IDS) {
    const h = S.heat[t];
    ui.text(PLACE[t].name, R.x, y + 1, g.sem.text);
    ui.bar(R.x + 84, y + 2, 70, 6, h / 100, heatColor(h, g.sem));
    ui.text(`${Math.round(h)} ${HEAT_LEVELS[heatLevel(h)].name}`, R.x + 158, y + 1, heatColor(h, g.sem));
    ui.tipArea(R.x, y, lw - 60, 11, `${HEAT_LEVELS[heatLevel(h)].desc}\nDecay ${heatDecayRate(S, t).toFixed(1)}/day (base 4, x2.5 laying low, goodwill, perks, radio).`);
    if (btn(g, 'ht:bribe:' + t, R.x + lw - 56, y, 54, fmtMoney(bribeCost(S, t) * 1.25), { disabled: h < 1, tip: 'Remote bribe through the fixer network (+25%). Heat -15.' })) { const c = Math.round(bribeCost(S, t) * 0.25); if (spend(S, 'dirty', c, 'bribes')) say(g, bribe(S, t)); }
    y += 12;
  }
  y += 4;
  ui.text(`Notoriety ${S.notoriety}  |  Goodwill ${Math.round(S.goodwill)}  |  ${S.compact.crackdownDays ? 'CRACKDOWN ' + S.compact.crackdownDays + 'd' : 'No crackdown'}`, R.x, y, g.sem.text); y += 12;
  [1, 2, 3].forEach((d, i) => { if (btn(g, 'ht:ll' + d, R.x + i * 70, y, 66, `Lay low ${d}d`, { tip: 'No street deals or dealer sales; heat decays 2.5x faster.', disabled: S.laylow >= d })) layLow(S, d); });
  y += 16;
  [500, 2500].forEach((a, i) => { if (btn(g, 'ht:trib' + a, R.x + i * 104, y, 100, `Tribute ${fmtMoney(a)}c`, { disabled: S.money.clean < a, tip: 'Clean money: +goodwill, -heat everywhere.' })) say(g, payTribute(S, a)); });
  y += 18;
  ui.wrapText('Heat sources: street sales (+0.2/unit), shots near witnesses (+1), guard killed (+8), civilian witness (+5), vault robbery (+25), production smell, snitches. Sinks: lay low, bribes, tribute, scapegoats, fixer perks.', R.x, y, lw - 6, g.sem.textDim, 9);
  // Rivals.
  const rx = R.x + lw + 6, rw = R.w - lw - 6;
  const rh = Math.floor((R.h - 2) / 3);
  Object.values(S.rivals).forEach((r, i) => {
    const y0 = R.y + i * rh;
    ui.rect(rx, y0, rw, rh - 4, K.ink[0]);
    ui.icon(r.icon, rx + 4, y0 + 4);
    ui.text(`${r.name} - ${r.leader}`, rx + 18, y0 + 4, r.alive ? RAMPS[r.color][3] : g.sem.textMute, { maxW: rw - 24 });
    if (!r.alive) { ui.text('Destroyed.', rx + 18, y0 + 15, g.sem.textMute); return; }
    ui.text(`${STANCES[r.stance]}${r.stanceDays ? ' (' + r.stanceDays + 'd)' : ''}  Str ${Math.round(rivalPower(S, r))}  $${Math.round(r.wealth)}  Last: ${r.lastMove || '-'}`, rx + 4, y0 + 15, g.sem.text, { maxW: rw - 8 });
    ui.tipArea(rx + 4, y0 + 14, rw - 8, 10, `Strength ${r.strength} x arms ${(1 + Math.min(0.6, (S.arms[r.id] || 0) / 300)).toFixed(2)} (guns sold to them) x difficulty.\nTurf: ${Object.entries(r.turf).map(([t, v]) => `${PLACE[t].name} ${Math.round(v)}`).join(', ') || 'none'}`);
    ui.text('Attitude', rx + 4, y0 + 26, g.sem.textDim);
    ui.bar(rx + 50, y0 + 27, 80, 5, (r.attitude + 100) / 200, r.attitude < 0 ? g.sem.bad : g.sem.good);
    const acts = [['truce', `Truce ${fmtMoney(truceCost(S, r))}`], ['tribute', `Tribute ${fmtMoney(tributeCost(S, r))}/d`], ['alliance', 'Alliance (1 favor)'], ['war', 'Declare war']];
    const bw = Math.floor((rw - 8) / 4);
    acts.forEach(([a, l], k) => { if (btn(g, `rv:${r.id}:${a}`, rx + 4 + k * bw, y0 + rh - 20, bw - 2, l, { disabled: rank(S) < 3, danger: a === 'war', tip: rank(S) < 3 ? 'Rival diplomacy unlocks at Boss.' : { truce: '7 days of peace, attitude +12.', tribute: 'Pay daily for 14 days; no hostile moves.', alliance: 'Needs attitude 40+. They help defend the Hollow.', war: 'They attack more; their camp becomes a raid target.' }[a] })) say(g, diplomacy(S, r.id, a)); });
  });
}

// ---------- Jobs ----------
function jobsTab(g, R) {
  const ui = g.ui, S = g.S;
  g.jobView = ui.tabs('jb:view', R.x, R.y, 360, ['Contracts', 'Raid targets', 'Ruins', 'Active'], g.jobView || 0);
  const B = { x: R.x, y: R.y + 16, w: R.w, h: R.h - 16 };
  if (S.mission) {
    ui.rect(B.x, B.y, B.w, 14, K.rust[0]);
    ui.text(`ON A JOB: ${S.mission.title} - ${S.mission.objective || ''}`, B.x + 4, B.y + 3, g.sem.warn, { maxW: B.w - 170 });
    if (btn(g, 'jb:goto', B.x + B.w - 164, B.y, 80, 'Travel there', { disabled: S.mission.phase !== 'go' || S.mission.type === 'defense' })) g.travelTo(S.mission.place);
    if (btn(g, 'jb:abort', B.x + B.w - 82, B.y, 80, 'Abort', { danger: true })) g.ui.confirm('Abort the current job? It counts as a failure.', () => g.act.missions.abort('Job aborted.'));
    B.y += 16; B.h -= 16;
  }
  if (g.jobView === 0) return contracts(g, B);
  if (g.jobView === 1) return raids(g, B);
  if (g.jobView === 2) return ruinsView(g, B);
  activeJobs(g, B);
}

function crewPicker(g, x, y, w, sel, max, idPrefix) {
  const ui = g.ui, S = g.S;
  const pool = active(S).filter((c) => !c.injured && !c.onMission && ['squad', 'guard', 'idle', 'lookout', 'enforcer'].includes(c.job));
  pool.slice(0, 8).forEach((c, i) => {
    const on = sel.includes(c.id);
    const nv = ui.toggle(`${idPrefix}:${c.id}`, x + (i % 2) * (w / 2), y + Math.floor(i / 2) * 11, `${c.first} (G${effSkill(c, 'gunplay')} S${effSkill(c, 'stealth')})`, on, { tip: `${crewName(c)} - ${JOBS[c.job].name}` });
    if (nv !== on) { if (nv && sel.length < max) sel.push(c.id); else if (!nv) sel.splice(sel.indexOf(c.id), 1); }
  });
  if (!pool.length) ui.text('No free fighters (squad, guards, idle, lookouts).', x, y, g.sem.textMute);
  return Math.ceil(Math.min(8, pool.length) / 2) * 11;
}

function contracts(g, R) {
  const ui = g.ui, S = g.S;
  const lw = Math.floor(R.w * 0.45);
  const board = S.contracts.board;
  const sel = board.findIndex((o) => o.cid === g.jobSel);
  const c = ui.list('jb:board', R.x, R.y, lw, R.h, 22, board.length, (i, x, y, w) => {
    const o = board[i];
    const tpl = CONTRACT[o.tpl];
    ui.text(tpl.name, x + 3, y + 2, g.sem.text, { maxW: w - 80 });
    ui.text(`${MISSION_KINDS[tpl.kind].name} - ${placeLabel(S, o)}`, x + 3, y + 11, g.sem.textDim, { maxW: w - 80 });
    ui.text(fmtMoney(o.reward.dirty || 0), x + w - 4, y + 2, g.sem.dirty, { align: 'right' });
    ui.text(`${'★'.repeat(Math.ceil(o.diff / 2))} ${o.expires - S.day}d`, x + w - 4, y + 11, g.sem.textMute, { align: 'right' });
  }, { selected: sel, empty: 'No jobs posted. New tip-offs arrive every dawn (bathhouses, regulars, Mags).' });
  if (c >= 0) { g.jobSel = board[c].cid; g.jobCrew = []; }
  const o = board.find((x) => x.cid === g.jobSel);
  if (!o) return;
  const tpl = CONTRACT[o.tpl];
  const x = R.x + lw + 8, w = R.w - lw - 8;
  let y = R.y;
  ui.text(tpl.name, x, y, g.sem.accent); y += 11;
  y += ui.wrapText(contractText(S, o), x, y, w, g.sem.text, 9) + 3;
  const rw = o.reward;
  const parts = [rw.dirty ? fmtMoney(rw.dirty) : null, rw.rep ? `${Math.round(rw.rep * (0.8 + 0.3 * rank(S)))} REP` : null, rw.favors ? `${rw.favors} favor` : null, rw.items ? Object.entries(rw.items).map(([k, n]) => `${n} ${itemInfo(k).name}`).join(', ') : null, rw.recruit ? 'a recruit' : null, rw.heatCut ? `heat -${rw.heatCut}` : null].filter(Boolean);
  y += ui.wrapText(`Reward: ${parts.join(', ')}`, x, y, w, g.sem.good, 9) + 2;
  ui.text(`${MISSION_KINDS[tpl.kind].desc} Heat on completion: +${tpl.heat}.`, x, y, g.sem.textDim, { maxW: w }); y += 11;
  if (tpl.need) { ui.text(`Needs: ${tpl.need.guns ? tpl.need.guns + ' spare guns' : tpl.need.bricks + ' bricks'}`, x, y, needMet(S, o) ? g.sem.good : g.sem.bad); y += 11; }
  if (btn(g, 'jb:play', x, y, w / 2 - 2, 'Play it', { primary: true, disabled: !!S.mission || !needMet(S, o), tip: 'Take the job yourself (full reward). Travel there and do it.' })) { say(g, g.act.missions.startContract(o)); }
  if (btn(g, 'jb:playgo', x + w / 2 + 2, y, w / 2 - 2, 'Play + travel', { disabled: !!S.mission || !needMet(S, o) })) { say(g, g.act.missions.startContract(o)); g.travelTo(o.place === 'road' ? o.from : o.place); }
  y += 18;
  H2(g, 'Or delegate (85% reward)', x, y); y += 11;
  g.jobCrew = g.jobCrew || [];
  y += crewPicker(g, x, y, w, g.jobCrew, 4, 'jb:pick') + 4;
  const p = delegateChance(S, o, g.jobCrew);
  ui.text(`Success chance ${Math.round(p * 100)}%  (${tpl.hours}h)`, x, y, p >= 0.6 ? g.sem.good : g.sem.warn);
  ui.tipArea(x, y, w, 10, `Crew power (combat + ${tpl.skills.join('/')} skills) vs difficulty ${o.diff}. Failure risks injuries or worse.`);
  y += 12;
  if (btn(g, 'jb:delegate', x, y, w, 'Send crew', { disabled: !g.jobCrew.length || !needMet(S, o) })) { say(g, delegate(S, o.cid, g.jobCrew)); g.jobCrew = []; }
}

function raids(g, R) {
  const ui = g.ui, S = g.S;
  const lw = Math.floor(R.w * 0.42);
  const targets = raidTargets(S);
  const sel = targets.findIndex((t) => t.id === g.raidSel);
  const c = ui.list('jb:targets', R.x, R.y, lw, R.h, 22, targets.length, (i, x, y, w) => {
    const t = targets[i];
    ui.text(t.name, x + 3, y + 2, t.locked ? g.sem.textMute : g.sem.text, { maxW: w - 8 });
    ui.text(t.locked || `~${fmtMoney(t.loot.dirty)} in the vault`, x + 3, y + 11, t.locked ? g.sem.textMute : g.sem.dirty, { maxW: w - 8 });
  }, { selected: sel });
  if (c >= 0) { g.raidSel = targets[c].id; g.plan = newPlan(S, targets[c].id); }
  const t = targets.find((x) => x.id === g.raidSel);
  if (!t) { ui.wrapText('Pick a target. Settlement vaults sit in each town\'s HQ (two doors: front street and back lane). Rival camps hold their boss and strongbox.', R.x + lw + 8, R.y, R.w - lw - 8, g.sem.textDim); return; }
  const plan = g.plan && g.plan.target === t.id ? g.plan : (g.plan = newPlan(S, t.id));
  const x = R.x + lw + 8, w = R.w - lw - 8;
  let y = R.y;
  ui.text(`Plan: ${t.name}`, x, y, g.sem.accent); y += 12;
  const apps = t.kind === 'camp' ? ['stealth', 'assault'] : ['stealth', 'assault', 'inside'];
  apps.forEach((a, i) => { if (btn(g, 'rp:app:' + a, x + i * (w / apps.length), y, w / apps.length - 2, { stealth: 'Stealth', assault: 'Assault', inside: 'Inside man' }[a], { active: plan.approach === a || (a === 'inside' && plan.inside), tip: { stealth: 'Quiet. Night helps. Fewer kills, less heat.', assault: 'Loud. +power, devastates the town, opens occupation.', inside: `Bribe a guard: doors unlocked, 30% fewer guards. ${fmtMoney(insideCost(S, t.id))}.` }[a] })) { if (a === 'inside') plan.inside = !plan.inside; else plan.approach = a; } });
  y += 16;
  const rec = S.recon[t.id] || 0;
  ui.text(`Recon ${plan.recon}/3: ${['nothing', 'guard count', 'patrols on the minimap', 'vault layout (wider safe window)'][Math.min(3, plan.recon)]}`, x, y + 2, g.sem.text, { maxW: w - 90 });
  if (t.kind === 'vault' && btn(g, 'rp:recon', x + w - 86, y, 84, rec >= 3 ? 'Full' : `Lookouts ${fmtMoney(reconCost(S, t.id))}`, { disabled: rec >= 3 })) { say(g, buyRecon(S, t.id)); plan.recon = (S.recon[t.id] || 0) + (hasPerk(S, 'fx_inside') ? 1 : 0); }
  y += 16;
  if (btn(g, 'rp:time', x, y, w / 2 - 2, plan.timing === 'night' ? 'Timing: night (22:00)' : 'Timing: now', { tip: 'Night: darker, fewer eyes, locked HQ doors (pick or bribe).' })) plan.timing = plan.timing === 'night' ? 'now' : 'night';
  const veh = S.vehicles.active && VEHICLES[S.vehicles.active].drive;
  if (btn(g, 'rp:veh', x + w / 2 + 2, y, w / 2 - 2, plan.vehicle ? 'Getaway: yes' : 'Getaway: none', { disabled: !veh, tip: veh ? 'Your car waits outside: drive off to extract.' : 'Needs a drivable vehicle.' })) plan.vehicle = !plan.vehicle;
  y += 18;
  H2(g, `Crew (max ${SQUAD_BY_RANK[rank(S)]})`, x, y); y += 11;
  y += crewPicker(g, x, y, w, plan.crew, SQUAD_BY_RANK[rank(S)], 'rp:pick') + 4;
  const p = raidChance(S, plan);
  ui.text(`Delegated success ~${Math.round(p * 100)}%  |  Loot ~${fmtMoney(t.loot.dirty)}`, x, y, p >= 0.6 ? g.sem.good : g.sem.warn); y += 12;
  if (btn(g, 'rp:go', x, y, w / 2 - 2, 'Execute (play it)', { primary: true, disabled: !!t.locked || !!S.mission, tip: 'Travel there with your squad and do it yourself.' })) {
    const r = g.act.missions.startRaid(plan);
    say(g, r);
    if (r.ok) { if (plan.timing === 'night' && S.min > 300 && S.min < 1320) { const wait = 1320 - S.min; import_advance(g, wait); g.toast('You wait for nightfall.'); } g.travelTo(t.id); }
  }
  if (btn(g, 'rp:del', x + w / 2 + 2, y, w / 2 - 2, 'Delegate', { disabled: !!t.locked || !plan.crew.length || rank(S) < 2, tip: rank(S) < 2 ? 'Delegating raids unlocks at Supplier.' : 'Your crew does it without you (85% loot).' })) { say(g, resolveRaid(S, plan)); g.plan = null; }
}

import { advance as _advance } from '../sim/sim.js';
function import_advance(g, m) { _advance(g.S, m, { onDefense: () => false }); }

function ruinsView(g, R) {
  const ui = g.ui, S = g.S;
  ui.list('jb:ruins', R.x, R.y, R.w, R.h, 20, RUINS.length, (i, x, y, w) => {
    const r = RUINS[i];
    const ready = ruinReady(S, r.id);
    ui.text(`${r.name} (Tier ${'I'.repeat(Math.min(3, r.tier))}${r.tier === 4 ? 'V' : ''})`, x + 4, y + 2, g.sem.text);
    ui.text(`${r.blurb}${ready ? '' : '  [recently stripped]'}`, x + 4, y + 11, g.sem.textDim, { maxW: w - 190 });
    if (btn(g, 'ru:go:' + r.id, x + w - 186, y + 3, 90, 'Travel there', { disabled: !S.visited[r.id] && !S.visited.crossroads, tip: 'Loot the crates yourself.' })) { S.visited[r.id] = true; g.travelTo(r.id); }
    if (btn(g, 'ru:del:' + r.id, x + w - 92, y + 3, 90, 'Send crew', { disabled: !ready || !onJob(S, 'squad').length, tip: 'Squad scavenges it (abstract). Risky in high tiers.' })) say(g, scavengeAbstract(S, r.id, onJob(S, 'squad').map((c) => c.id)));
  }, { noClick: true });
}

function activeJobs(g, R) {
  const ui = g.ui, S = g.S;
  const list = S.contracts.active;
  ui.list('jb:active', R.x, R.y, R.w, R.h - 40, 14, list.length, (i, x, y, w) => {
    const j = list[i];
    ui.text(`${CONTRACT[j.tpl].name} - ${j.withPlayer ? 'you' : j.crew.length + ' crew'} - ${Math.round(j.p * 100)}% - back in ${Math.max(0, Math.ceil((j.eta - S.total) / 60))}h`, x + 4, y + 3, g.sem.text);
  }, { noClick: true, empty: 'No delegated jobs running.' });
  if (rank(S) >= 4) {
    let y = R.y + R.h - 36;
    H2(g, 'Occupation', R.x, y); y += 11;
    SETTLEMENT_IDS.filter((t) => !PLACE[t].capital).forEach((t, i) => { const why = canOccupy(S, t); if (btn(g, 'oc:' + t, R.x + i * 104, y, 100, S.towns[t].occupied ? `${PLACE[t].name.split(' ')[0]}: held` : `Occupy ${PLACE[t].name.split(' ')[0]}`, { disabled: !!why, tip: why || 'Garrison the town: daily tribute, rivals and Wardens will contest it.' })) say(g, occupy(S, t)); });
  }
}

// ---------- Perks ----------
function perksTab(g, R) {
  const ui = g.ui, S = g.S;
  ui.text(`Level ${S.level}  |  Perk points: ${S.perkPts}  |  XP ${Math.floor(S.xp)} (next level at ${xpForLevel(S.level + 1)})`, R.x, R.y, g.sem.text);
  const trees = Object.keys(PERK_TREES);
  const cw = Math.floor(R.w / 3);
  trees.forEach((tree, ti) => {
    const x = R.x + ti * cw;
    ui.text(PERK_TREES[tree], x + cw / 2, R.y + 12, g.sem.accent, { align: 'center' });
    const perks = Object.entries(PERKS).filter(([, p]) => p.tree === tree);
    perks.forEach(([id, p], i) => {
      const y = R.y + 24 + i * Math.floor((R.h - 26) / 8);
      const st = perkState(S, id);
      const own = st === 'owned';
      ui.rect(x + 2, y, cw - 6, Math.floor((R.h - 26) / 8) - 3, own ? K.green[0] : K.ink[0]);
      ui.text(`T${p.tier + 1} ${p.name}`, x + 6, y + 3, own ? g.sem.good : st === 'ok' ? g.sem.text : g.sem.textMute, { maxW: cw - 70 });
      ui.text(p.desc, x + 6, y + 13, g.sem.textDim, { maxW: cw - 14 });
      if (!own && btn(g, 'pk:' + id, x + cw - 60, y + 1, 54, st === 'ok' ? 'Learn' : 'Locked', { disabled: st !== 'ok', tip: st === 'ok' ? p.desc : `Locked: ${st}` })) say(g, buyPerk(S, id));
    });
  });
}

// ---------- Journal ----------
function journal(g, R) {
  const ui = g.ui, S = g.S;
  g.jView = ui.tabs('jn:view', R.x, R.y, Math.min(R.w, 480), ['Log', 'Ash Courier', 'Achievements', 'Stats', 'Story', 'Glossary', 'Controls'], g.jView || 0);
  const B = { x: R.x, y: R.y + 16, w: R.w, h: R.h - 16 };
  if (g.jView === 0) {
    const log = S.log.slice().reverse();
    ui.list('jn:log', B.x, B.y, B.w, B.h, 11, log.length, (i, x, y, w) => { const l = log[i]; ui.text(`D${l.day} ${fmtClock(l.min)}  ${l.text}`, x + 2, y + 1, l.kind === 'bad' ? g.sem.bad : l.kind === 'good' || l.kind === 'rank' || l.kind === 'ach' ? g.sem.good : g.sem.text, { maxW: w - 4 }); }, { noClick: true, empty: 'Nothing yet.' });
  } else if (g.jView === 1) {
    const papers = S.news.slice().reverse();
    ui.list('jn:news', B.x, B.y, B.w, B.h, 60, papers.length, (i, x, y, w) => { const p = papers[i]; ui.text(`THE ASH COURIER - Day ${p.day}`, x + 2, y + 1, g.sem.accent); p.items.slice(0, 5).forEach((it, k) => ui.text(it, x + 6, y + 11 + k * 9, g.sem.text, { maxW: w - 10 })); }, { noClick: true, empty: 'The first issue arrives at dawn.' });
  } else if (g.jView === 2) {
    const got = Object.keys(S.ach).length;
    ui.text(`${got}/${ACHIEVEMENTS.length} unlocked`, B.x, B.y, g.sem.text);
    ui.list('jn:ach', B.x, B.y + 11, B.w, B.h - 11, 13, ACHIEVEMENTS.length, (i, x, y, w) => { const a = ACHIEVEMENTS[i]; const own = S.ach[a.id]; ui.icon(own ? 'check' : 'lock', x + 2, y + 1); ui.text(`${a.name} - ${a.desc}${own ? ` (day ${own})` : ''}`, x + 15, y + 2, own ? g.sem.good : g.sem.textDim, { maxW: w - 18 }); }, { noClick: true });
  } else if (g.jView === 3) {
    STAT_LABELS.forEach(([k, l, pre], i) => { const x = B.x + (i % 2) * (B.w / 2), y = B.y + Math.floor(i / 2) * 10; ui.text(l, x, y, g.sem.textDim); ui.text(pre === '$' ? fmtMoney(S.stats[k] || 0) : fmtNum(S.stats[k] || 0), x + B.w / 2 - 12, y, g.sem.text, { align: 'right' }); });
    const rb = S.stats.repBy || {};
    ui.text('REP by source: ' + Object.entries(rb).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '), B.x, B.y + B.h - 10, g.sem.textDim, { maxW: B.w });
  } else if (g.jView === 4) {
    const j = S.journal.slice().reverse();
    ui.list('jn:story', B.x, B.y, B.w, B.h, 11, j.length, (i, x, y, w) => ui.text(`Day ${j[i].day}: ${j[i].text}`, x + 2, y + 1, g.sem.text, { maxW: w - 4 }), { noClick: true, empty: 'Your story starts in the Hollow.' });
  } else if (g.jView === 5) {
    const gl = GLOSSARY;
    ui.list('jn:gloss', B.x, B.y, B.w, B.h, 22, gl.length, (i, x, y, w) => { ui.text(gl[i][0], x + 2, y + 2, g.sem.accent); ui.text(gl[i][1], x + 2, y + 11, g.sem.text, { maxW: w - 4 }); }, { noClick: true });
  } else {
    const acts = Object.keys(ACTION_LABELS);
    acts.forEach((a, i) => { const x = B.x + (i % 3) * (B.w / 3), y = B.y + Math.floor(i / 3) * 10; ui.text(`${ACTION_LABELS[a]}: ${keyLabel(g.settings.binds[a])}`, x, y, g.sem.text); });
    ui.text('Mouse: aim, LMB fire, wheel switches guns. Rebind in Esc > Settings > Controls.', B.x, B.y + B.h - 10, g.sem.textDim);
  }
}

const GLOSSARY = [
  ['Dirty money', 'Cash from crime. Lives in the stash (or on you). Buys black-market goods, wages, bribes. Can be stolen.'],
  ['Clean money', 'Laundered or legit income in front accounts. Buys fronts, upgrades, tribute, council seats. Frozen during audits.'],
  ['Laundering', 'Push dirty money through a front each dawn. Capacity = 0.8 x legit revenue (+10%/accountant point). Fee 25% - 2%/Bookkeeping.'],
  ['Audit risk', 'Rises when you wash above capacity. Audits fine you, freeze accounts and can seize the front.'],
  ['Heat', 'Per-town attention: Quiet, Watched, Hunted, Wanted, Crackdown. Decays ~4/day.'],
  ['Notoriety', 'Your global heat. Drives Warden crackdowns, bounty hunters and Hollow raids.'],
  ['Saturation', 'Selling raises it (0.5 x units / daily demand), each point cutting price by 60%. Falls 0.12/day.'],
  ['Quality', 'Potency + care + curing. Schwag x0.6, Mid x1.0, Prime x1.5, Legendary x2.4.'],
  ['Components', 'Barrel, Frame, Action, Stock, Magazine. Material (x0.8-1.4) and stars (+-8%/star) multiply gun stats.'],
  ['Grades', 'Junk, Common, Fine, Masterwork, Legendary: from mean stars plus the gunsmith roll. Multiplies value.'],
  ['Arms dealing', 'Guns you sell end up in the buyer\'s hands. Sell to the Compact and guards hit harder; sell to rivals and they do.'],
  ['Recon', 'Lookouts reveal guard counts, then patrols, then the vault layout (wider safecracking window).'],
  ['Occupation', 'Warlord: garrison a broken town for daily tribute. Contested by rivals and Wardens.'],
  ['Holds', 'Towns you occupy, or control politically (2 fronts + a protection racket + heat < 40 + goodwill 50+). Endings need 3.'],
  ['The Crown', 'Military ending: hold 3, repel Operation Daybreak, storm the Council Hall.'],
  ['The Ledger', 'Political ending: hold 3, $2M clean assets, 7 council seats.'],
];

export { GLOSSARY, icon, compKey, vaultLoot, LEDGER_ASSETS, defensePower, combatTip };
function combatTip() { return ''; }
