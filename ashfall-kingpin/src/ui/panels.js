// Interaction panels (world services) + event card, newspaper, dialog and death/capture screen.
import { RAMPS } from '../data/palette.js';
import { PLACE, SETTLEMENT_IDS } from '../data/places.js';
import { FACILITIES, VEHICLES, HOLLOW_UPGRADES } from '../data/progress.js';
import { STRAINS, PACKS, QUALITY, STAGES } from '../data/strains.js';
import { BP } from '../data/guns.js';
import { BUSINESSES } from '../data/businesses.js';
import { TRAITS, SKILLS, SKILL_NAMES, BACKGROUNDS } from '../data/crew.js';
import { itemInfo, LOOT_ITEMS } from '../data/items.js';
import { EVENT } from '../data/events.js';
import { fmtMoney } from '../core/util.js';
import { drawText, measure, wrap, LINE_H } from '../render/font.js';
import { portrait } from '../render/paperdoll.js';
import { rank, earn, spend, D, hasPerk } from '../sim/state.js';
import { count } from '../sim/inventory.js';
import { plant, water, feed, treat, harvest, clearPlot, strainData, stageName, ready, packBud, breed, dryCap, cureCap, facCount } from '../sim/grow.js';
import { build, demolish, cellUnlocked, facCost, upgradeBench, benchUpgradeInfo, buyHollowUpgrade, upgradeInfo, buyVehicle, takeMagsLoan, repayMags, gridSize } from '../sim/hollow.js';
import { sellPacks, weedPrice, buyItem, buyPrice, MARKET, sellGun, gunSalePrice, sellLoot, lootPrice, shineSell, buyBlueprint, BLUEPRINT_SHOP, regularPrice, sellToRegular, tradeAllowed } from '../sim/economy.js';
import { hire, vet, vetCost, signingFee, crewName, effSkill } from '../sim/crew.js';
import { buyBusiness, shellAvailable, shellPrice, lotOwner } from '../sim/business.js';
import { bribe, bribeCost, scapegoat, scapegoatCost, payTribute } from '../sim/heat.js';
import { buyRecon, reconCost } from '../sim/jobs.js';
import { buySeat, seatPrice, legalize, ledgerReady } from '../sim/endgame.js';
import { resolveEvent, describeFx, bindCtx, fillText, reqOk } from '../sim/events.js';
import { gunName } from '../sim/craft.js';
import { promptText } from './hud.js';

const K = RAMPS;

export function win(g, id, w, h, title) {
  const ui = g.ui;
  ui.dim(id + ':dim', 0.45);
  w = Math.min(w, ui.W - 8); h = Math.min(h, ui.H - 8);
  const x = Math.round((ui.W - w) / 2), y = Math.round((ui.H - h) / 2);
  ui.panel(id, x, y, w, h, { title });
  if (ui.button(id + ':close', x + w - 14, y + 1, 12, 11, '✗', { tip: 'Close (Esc)', sound: 'ui_back' })) g.closeOverlay();
  return { x, y, w, h };
}

export function say(g, r) { if (r && r.msg) g.toast(r.msg, r.ok ? 'good' : 'bad'); return r; }

function money(g, kind, n) { return g.ui.text(fmtMoney(n), 0, 0, kind === 'clean' ? g.sem.clean : g.sem.dirty); }
void money;

const packKeys = (S) => Object.keys(S.inv).filter((k) => k.startsWith('pack:') && S.inv[k] > 0);
const lootKeys = (S) => LOOT_ITEMS.filter((k) => count(S, k) > 0);
const spareGuns = (S) => S.guns.filter((g) => !S.player.loadout.includes(g.id) && !S.crew.some((c) => c.gun === g.id));

export function drawPanel(g) {
  const p = g.panel;
  if (!p) { g.overlay = null; return; }
  const fn = PANELS[p.kind];
  if (!fn) { const r = win(g, 'pn', 220, 70, promptText(g, p) || 'Nothing here'); g.ui.text('Nothing to do here right now.', r.x + 8, r.y + 20, g.sem.textDim); return; }
  fn(g, p);
}

// ---------- shared list widgets ----------
function sellPackList(g, r, town, y, h, opts = {}) {
  const ui = g.ui, S = g.S;
  const keys = packKeys(S);
  ui.list('pn:packs', r.x + 6, y, r.w - 12, h, 14, keys.length, (i, x, yy, w) => {
    const k = keys[i];
    const info = itemInfo(k, S.strains.hybrids);
    const [, st, q, form] = k.split(':');
    const pr = opts.regular ? regularPrice(S, opts.regular, k) : weedPrice(S, town, st, +q, form, 0, opts.bulk ? { bulk: true, bulkMult: opts.bulkMult } : {});
    ui.icon(info.icon, x + 2, yy + 2, info.tint);
    ui.text(`${info.name} x${count(S, k)}`, x + 15, yy + 3, opts.regular && pr.match ? g.sem.good : g.sem.text, { maxW: w - 150 });
    ui.text(fmtMoney(pr.price), x + w - 116, yy + 3, g.sem.dirty);
    ui.tipArea(x + w - 120, yy, 40, 14, pr.lines.join('\n'));
    const act = (n) => { const res = opts.regular ? sellToRegular(S, opts.regular.id, k, n) : sellPacks(S, town, k, n, { hustle: 0, stealth: 0, who: 'you' }, opts.bulk ? { bulk: true, bulkMult: opts.bulkMult, ignoreHours: true } : {}); say(g, res); };
    if (ui.button(`pn:sell1:${k}`, x + w - 74, yy + 1, 22, 12, '1')) act(1);
    if (ui.button(`pn:sell5:${k}`, x + w - 50, yy + 1, 22, 12, '5')) act(5);
    if (ui.button(`pn:sellA:${k}`, x + w - 26, yy + 1, 24, 12, 'All')) act(count(S, k));
  }, { noClick: true, empty: 'No packed product. Pack cured bud at the Hollow.' });
}

function buyList(g, r, town, y, h, filter) {
  const ui = g.ui, S = g.S;
  const keys = Object.keys(MARKET[town].sells).filter((k) => buyPrice(S, town, k) !== null && (!filter || filter(k)));
  ui.list('pn:buy:' + town, r.x + 6, y, r.w - 12, h, 14, keys.length, (i, x, yy, w) => {
    const k = keys[i];
    const info = itemInfo(k, S.strains.hybrids);
    const p = buyPrice(S, town, k);
    ui.icon(info.icon, x + 2, yy + 2, info.tint);
    ui.text(`${info.name}${k.startsWith('ammo:') ? ' (x10)' : ''}`, x + 15, yy + 3, g.sem.text, { maxW: w - 160 });
    ui.tipArea(x, yy, w - 120, 14, `${info.desc}\nYou have ${count(S, k)}.`);
    ui.text(fmtMoney(p), x + w - 112, yy + 3, g.sem.dirty);
    for (const [n, dx] of [[1, 74], [5, 50], [10, 26]]) if (ui.button(`pn:buy${n}:${k}`, x + w - dx, yy + 1, 22, 12, String(n), { tip: `Buy ${n} for ${fmtMoney(p * n)}` })) say(g, buyItem(S, town, k, n));
  }, { noClick: true, empty: 'Nothing for sale.' });
}

function gunSellList(g, r, town, y, h, buyer = 'compact') {
  const ui = g.ui, S = g.S;
  const guns = spareGuns(S);
  ui.list('pn:guns:' + buyer, r.x + 6, y, r.w - 12, h, 14, guns.length, (i, x, yy, w) => {
    const gun = guns[i];
    const pr = gunSalePrice(S, gun, town, buyer);
    ui.icon({ sidearm: 'g_sidearm', shotgun: 'g_shotgun', rifle: 'g_rifle', smg: 'g_smg', silent: 'g_silent', heavy: 'g_heavy' }[BP[gun.bp].family], x + 2, yy + 3);
    ui.text(`${gunName(gun)}${gun.unreliable ? ' [U]' : ''}`, x + 22, yy + 3, g.sem.text, { maxW: w - 110 });
    ui.text(pr.price > 0 ? fmtMoney(pr.price) : 'refused', x + w - 80, yy + 3, g.sem.dirty);
    ui.tipArea(x + w - 84, yy, 44, 14, pr.lines.join('\n'));
    if (ui.button(`pn:gsell:${gun.id}`, x + w - 34, yy + 1, 32, 12, 'Sell', { disabled: pr.price <= 0 })) say(g, sellGun(S, gun.id, town, buyer));
  }, { noClick: true, empty: 'No spare guns (equipped and crew guns are not listed).' });
}

function lootSellList(g, r, town, y, h, via) {
  const ui = g.ui, S = g.S;
  const keys = lootKeys(S).concat(count(S, 'shine') > 0 ? ['shine'] : []);
  ui.list('pn:loot:' + via, r.x + 6, y, r.w - 12, h, 14, keys.length, (i, x, yy, w) => {
    const k = keys[i];
    const info = itemInfo(k);
    const price = k === 'shine' ? 26 : lootPrice(S, k, town, via);
    ui.icon(info.icon, x + 2, yy + 2, info.tint);
    ui.text(`${info.name} x${count(S, k)}`, x + 15, yy + 3, g.sem.text);
    ui.text(fmtMoney(price), x + w - 76, yy + 3, g.sem.dirty);
    if (ui.button(`pn:lsell:${k}`, x + w - 34, yy + 1, 32, 12, 'All')) say(g, k === 'shine' ? shineSell(S, town, count(S, k)) : sellLoot(S, k, count(S, k), town, via));
  }, { noClick: true, empty: 'No loot to fence.' });
}

function tabsRow(g, p, r, labels) { const t = g.ui.tabs('pn:tabs', r.x + 6, r.y + 15, r.w - 12, labels, p.tab || 0); p.tab = t; return t; }

// ---------- panels ----------
const PANELS = {
  cell(g, p) {
    const ui = g.ui, S = g.S;
    const c = S.hollow.cells[p.i];
    if (!c) {
      const r = win(g, 'pn', 330, 230, 'Build in the Hollow');
      if (!cellUnlocked(S, p.i)) { ui.wrapText(`This part of the yard opens up with rank (current grid ${gridSize(S)}x${gridSize(S)}).`, r.x + 8, r.y + 20, r.w - 16, g.sem.textDim); return; }
      const ids = Object.keys(FACILITIES);
      ui.list('pn:build', r.x + 6, r.y + 16, r.w - 12, r.h - 22, 15, ids.length, (i, x, y, w) => {
        const f = FACILITIES[ids[i]];
        const locked = rank(S) < f.rank;
        ui.icon(f.icon, x + 2, y + 3);
        ui.text(f.name, x + 15, y + 4, locked ? g.sem.textMute : g.sem.text);
        ui.tipArea(x, y, w - 90, 15, `${f.name}\n${f.desc}${f.power ? '\nPower: ' + f.power : ''}${locked ? '\n!rNeeds rank ' + f.rank : ''}`);
        ui.text(fmtMoney(facCost(S, ids[i])), x + w - 86, y + 4, g.sem.dirty);
        if (ui.button('pn:build:' + ids[i], x + w - 40, y + 1, 38, 13, 'Build', { disabled: locked })) { say(g, build(S, p.i, ids[i])); }
      }, { noClick: true });
      return;
    }
    if (c.fac === 'plot' || c.fac === 'growroom') return plotPanel(g, p, c);
    const F = FACILITIES[c.fac];
    const r = win(g, 'pn', 280, 150, F.name);
    ui.wrapText(F.desc, r.x + 8, r.y + 18, r.w - 16, g.sem.textDim);
    let y = r.y + 50;
    const station = { bench: 'bench', lathe: 'lathe', smelter: 'smelter', press: 'press' }[c.fac];
    if (station) {
      const q = S.queues[station];
      ui.text(`Queue: ${q.length} order${q.length === 1 ? '' : 's'}${q[0] ? ' - ' + (q[0].wait || 'working') : ''}`, r.x + 8, y, g.sem.text);
      if (ui.button('pn:open', r.x + 8, y + 14, 140, 14, 'Open in Production', { primary: true })) { g.prodStation = station; g.openLedger(2); }
      if (c.fac === 'bench') { const u = benchUpgradeInfo(S); ui.text(`Workshop tier ${['', 'I', 'II', 'III', 'IV'][S.hollow.bench]}`, r.x + 160, y, g.sem.textDim); if (u && ui.button('pn:benchup', r.x + 156, y + 14, 112, 14, `Tier ${['', 'I', 'II', 'III', 'IV'][u.tier]} ${fmtMoney(u.cost)}`, { disabled: rank(S) < u.rank, tip: `Unlocks tier-${u.tier} blueprints, materials and mod slots. Needs rank ${u.rank}.` })) say(g, upgradeBench(S)); }
    } else if (c.fac === 'lab') return labPanel(g, p, r);
    else if (c.fac === 'generator') ui.text(`Power ${S.hollow.power}/${S.hollow.powerCap}  Fuel ${count(S, 'fuel')}${S.hollow.noPower ? '  NO POWER' : ''}`, r.x + 8, y, S.hollow.noPower ? g.sem.bad : g.sem.text);
    else if (c.fac === 'dryrack' || c.fac === 'cureroom') ui.text(`Drying ${S.drying.reduce((a, d) => a + d.units, 0)}/${dryCap(S)}   Curing ${S.curing.reduce((a, d) => a + d.units, 0)}/${cureCap(S)}`, r.x + 8, y, g.sem.text);
    else if (c.fac === 'safe') ui.text(`Protected stash: ${fmtMoney(facCount(S, 'safe') * 6000 + (S.hollow.up.storage || 0) * 4000)}`, r.x + 8, y, g.sem.text);
    if (ui.button('pn:demolish', r.x + r.w - 88, r.y + r.h - 18, 80, 13, 'Demolish', { danger: true })) ui.confirm(`Demolish the ${F.name}? You get 40% back as salvage.`, () => { say(g, demolish(S, p.i)); g.closeOverlay(); });
  },

  stash(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 330, 220, 'Stash & Hollow');
    ui.text(`Stash (dirty): ${fmtMoney(S.money.dirty)}`, r.x + 8, r.y + 18, g.sem.dirty);
    ui.text(`Carried: ${fmtMoney(S.money.carried)}`, r.x + 170, r.y + 18, g.sem.dirty);
    ui.text(`Protected by safes/storage: ${fmtMoney(facCount(S, 'safe') * 6000 + (S.hollow.up.storage || 0) * 4000)}`, r.x + 8, r.y + 30, g.sem.textDim);
    if (S.money.debt) { ui.text(`Owed to Mags: ${fmtMoney(S.money.debt)} (due day ${S.money.debtDue})`, r.x + 8, r.y + 42, g.sem.bad); if (ui.button('pn:repay', r.x + 220, r.y + 40, 100, 13, 'Repay', { disabled: S.money.dirty + S.money.carried < 1 })) say(g, repayMags(S, S.money.debt)); }
    let y = r.y + 58;
    ui.text('Hollow upgrades', r.x + 8, y, g.sem.accent); y += 12;
    for (const k of Object.keys(HOLLOW_UPGRADES)) {
      const U = HOLLOW_UPGRADES[k];
      const u = upgradeInfo(S, k);
      ui.text(`${U.name} ${S.hollow.up[k] || 0}/${U.max}`, r.x + 8, y + 2, g.sem.text);
      ui.tipArea(r.x + 8, y, 150, 13, U.desc);
      if (u) { if (ui.button('pn:hup:' + k, r.x + 180, y, 140, 13, `Lv${u.lvl} ${fmtMoney(u.cost)}`, { disabled: rank(S) < u.rank, tip: `${U.desc}\nNeeds rank ${u.rank}.` })) say(g, buyHollowUpgrade(S, k)); }
      else ui.text('maxed', r.x + 180, y + 2, g.sem.textMute);
      y += 15;
    }
    const bu = benchUpgradeInfo(S);
    ui.text(`Workshop tier ${['', 'I', 'II', 'III', 'IV'][S.hollow.bench]}`, r.x + 8, y + 2, g.sem.text);
    if (bu && ui.button('pn:benchup2', r.x + 180, y, 140, 13, `Tier ${['', 'I', 'II', 'III', 'IV'][bu.tier]} ${fmtMoney(bu.cost)}`, { disabled: rank(S) < bu.rank })) say(g, upgradeBench(S));
    y += 18;
    if (ui.button('pn:inv', r.x + 8, y, 150, 14, 'Open Inventory', {})) g.openLedger(3);
  },

  production(g) { g.prodStation = 'post'; g.openLedger(2); },
  jobs(g) { g.openLedger(7); },

  market(g, p) {
    const ui = g.ui, S = g.S;
    const town = p.place;
    const r = win(g, 'pn', 360, 240, `${PLACE[town].name} market`);
    if (!tradeAllowed(S, town)) { ui.wrapText(`The traders of ${PLACE[town].name} don't deal with nobodies. Raise your rank.`, r.x + 8, r.y + 20, r.w - 16, g.sem.textDim); return; }
    const t = tabsRow(g, p, r, ['Sell product', 'Buy', 'Guns', 'Loot']);
    const y = r.y + 32, h = r.h - 38;
    if (t === 0) sellPackList(g, r, town, y, h);
    else if (t === 1) buyList(g, r, town, y, h);
    else if (t === 2) gunSellList(g, r, town, y, h);
    else lootSellList(g, r, town, y, h, 'market');
  },

  gunshop(g, p) { const r = win(g, 'pn', 360, 240, 'Brass Tacks Guns'); const t = tabsRow(g, p, r, ['Sell guns', 'Buy supplies']); if (t === 0) gunSellList(g, r, p.place, r.y + 32, r.h - 38); else buyList(g, r, p.place, r.y + 32, r.h - 38); },
  armory(g, p) { const r = win(g, 'pn', 360, 240, 'Foundry Exchange'); const t = tabsRow(g, p, r, ['Materials', 'Sell guns']); if (t === 0) buyList(g, r, p.place, r.y + 32, r.h - 38); else gunSellList(g, r, p.place, r.y + 32, r.h - 38); },
  store(g, p) { const r = win(g, 'pn', 340, 220, 'Store'); buyList(g, r, p.place, r.y + 18, r.h - 24); },
  fence(g, p) { const r = win(g, 'pn', 340, 220, "Lucky Lou's (fence, 70%)"); lootSellList(g, r, p.place, r.y + 18, r.h - 24, 'fence'); },
  smuggler(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 360, 230, 'Bulk smugglers');
    if (rank(S) < 2) { ui.wrapText('"Come back when you move weight." Bulk smuggling unlocks at Supplier.', r.x + 8, r.y + 20, r.w - 16, g.sem.textDim); return; }
    ui.text('Bulk: -30% price, no heat, light saturation. Bricks and jars move best.', r.x + 8, r.y + 18, g.sem.textDim);
    sellPackList(g, r, p.place === 'crossroads' ? 'crossroads' : 'harbor9', r.y + 30, r.h - 36, { bulk: true, bulkMult: 0.7 });
  },

  vendor(g, p) {
    const ui = g.ui, S = g.S;
    switch (p.npc) {
      case 'mags': return magsPanel(g, p);
      case 'blueprints': {
        const r = win(g, 'pn', 340, 220, 'Blueprint dealer');
        const ids = Object.keys(BLUEPRINT_SHOP);
        ui.list('pn:bps', r.x + 6, r.y + 18, r.w - 12, r.h - 24, 15, ids.length, (i, x, y, w) => {
          const b = BP[ids[i]];
          const known = S.bps[b.id];
          ui.text(`${b.name} (Bench ${['', 'I', 'II', 'III', 'IV'][b.bench]})`, x + 4, y + 4, known ? g.sem.textMute : g.sem.text);
          ui.tipArea(x, y, w - 90, 15, `${b.name} - ${b.family}, ${b.ammo} ammo\nDmg ${b.dmg}${b.pellets > 1 ? 'x' + b.pellets : ''} RPM ${b.rpm} Acc ${b.acc} Range ${b.range} Mag ${b.mag} Noise ${b.noise}`);
          if (known) ui.text('known', x + w - 50, y + 4, g.sem.good);
          else if (ui.button('pn:bp:' + b.id, x + w - 84, y + 1, 82, 13, fmtMoney(BLUEPRINT_SHOP[b.id] * D(S).cost), { disabled: rank(S) < b.rank, tip: rank(S) < b.rank ? 'The dealer wants a bigger name first.' : 'Buy blueprint (dirty)' })) say(g, buyBlueprint(S, b.id));
        }, { noClick: true });
        return;
      }
      case 'smuggler': return PANELS.smuggler(g, { ...p, place: 'crossroads' });
      case 'armsbroker': {
        const r = win(g, 'pn', 360, 240, 'Arms broker (sells to the gangs)');
        const live = Object.values(S.rivals).filter((x) => x.alive);
        const names = live.map((x) => x.name);
        if (!live.length) { ui.text('No gangs left to arm.', r.x + 8, r.y + 20, g.sem.textDim); return; }
        const t = Math.min(tabsRow(g, p, r, names), live.length - 1);
        ui.text(`Guns you sell here end up in ${live[t].name} hands: their fighters get stronger.`, r.x + 8, r.y + 31, g.sem.warn);
        gunSellList(g, r, 'crossroads', r.y + 42, r.h - 48, live[t].id);
        return;
      }
      case 'seeds': { const r = win(g, 'pn', 330, 200, 'Seed vendor'); buyList(g, r, 'crossroads', r.y + 18, r.h - 24, (k) => k.startsWith('seed:')); return; }
      case 'materials': { const r = win(g, 'pn', 330, 220, 'Scrap trader'); buyList(g, r, 'crossroads', r.y + 18, r.h - 24, (k) => !k.startsWith('seed:')); return; }
      default: { const r = win(g, 'pn', 240, 80, p.ent ? p.ent.name : 'Vendor'); ui.text('"Busy. Come back later."', r.x + 8, r.y + 20, g.sem.textDim); }
    }
  },

  tavern(g, p) {
    const ui = g.ui, S = g.S;
    const town = p.place;
    const r = win(g, 'pn', 380, 250, `${p.b ? p.b.name : 'Tavern'}: recruits`);
    const list = S.candidates[town] || [];
    if (rank(S) < 1 && !list.some((c) => c.special)) ui.text('Nobody works for a Scavenger. Reach Hustler (100 REP) to hire.', r.x + 8, r.y + 18, g.sem.warn);
    ui.list('pn:cands', r.x + 6, r.y + 30, r.w - 12, r.h - 36, 46, list.length, (i, x, y, w) => recruitRow(g, list[i], town, x, y, w), { noClick: true, empty: 'No one looking for work today. New faces every 2 days.' });
  },

  lot(g, p) {
    const ui = g.ui, S = g.S;
    const own = lotOwner(S, p.place, p.b.id);
    if (own) { g.ledgerBiz = own.uid; g.openLedger(5); return; }
    const r = win(g, 'pn', 380, 250, `Vacant lot - ${PLACE[p.place].name}`);
    const shell = shellAvailable(S);
    ui.wrapText(shell ? "Mags' shell deal: your FIRST front can be bought with dirty cash (+25% fee). After that, fronts cost clean money." : 'Fronts are legit property: they cost CLEAN money.', r.x + 8, r.y + 18, r.w - 16, shell ? g.sem.warn : g.sem.textDim);
    const ids = Object.keys(BUSINESSES);
    ui.list('pn:biz', r.x + 6, r.y + 40, r.w - 12, r.h - 46, 15, ids.length, (i, x, y, w) => {
      const T = BUSINESSES[ids[i]];
      const lockedR = rank(S) < T.rank && !(shell && ids[i] === 'canteen');
      ui.icon(T.icon, x + 2, y + 3);
      ui.text(T.name, x + 15, y + 4, lockedR ? g.sem.textMute : g.sem.text);
      ui.tipArea(x, y, w - 160, 15, `${T.name}\n${T.special}\nLegit revenue ~$${T.rev}/day, washes in ${T.wash}d, audit risk x${T.audit}${lockedR ? '\n!rNeeds rank ' + T.rank : ''}`);
      if (shell && ui.button('pn:shell:' + ids[i], x + w - 156, y + 1, 76, 13, `${fmtMoney(shellPrice(S, ids[i]))}d`, { disabled: lockedR, tip: "Mags' shell deal (dirty money, once)" })) { say(g, buyBusiness(S, ids[i], p.place, p.b.id, 'shell')); invalidateSign(g, p.b); }
      if (ui.button('pn:bbuy:' + ids[i], x + w - 78, y + 1, 76, 13, `${fmtMoney(T.cost * D(S).cost)}c`, { disabled: lockedR, tip: 'Buy with clean money' })) { say(g, buyBusiness(S, ids[i], p.place, p.b.id, 'clean')); invalidateSign(g, p.b); }
    }, { noClick: true });
  },

  clinic(g, p) {
    const ui = g.ui, S = g.S, P = g.act.player;
    const r = win(g, 'pn', 300, 150, 'Clinic');
    const missing = Math.ceil(P.maxHp - P.hp);
    const cost = Math.round(missing * 1.2 * D(S).cost);
    ui.text(`HP ${Math.ceil(P.hp)}/${P.maxHp}`, r.x + 8, r.y + 20, g.sem.text);
    if (ui.button('pn:heal', r.x + 8, r.y + 34, 130, 14, missing ? `Heal ${fmtMoney(cost)}` : 'Healthy', { disabled: !missing })) { if (spend(S, 'dirty', cost, 'medical')) { P.hp = P.maxHp; g.toast('Patched up.', 'good'); } else g.toast('Not enough cash.', 'bad'); }
    const mk = MARKET[p.place] && MARKET[p.place].sells.medkit !== undefined ? buyPrice(S, p.place, 'medkit') : Math.round(40 * D(S).cost);
    if (ui.button('pn:medkit', r.x + 150, r.y + 34, 140, 14, `Medkit ${fmtMoney(mk)}`)) { if (spend(S, 'dirty', mk, 'medical')) { S.inv.medkit = (S.inv.medkit || 0) + 1; g.toast('Bought a medkit.', 'good'); } }
    const hurt = S.crew.filter((c) => c.status === 'active' && c.injured > 0);
    ui.text(`${hurt.length} crew injured.`, r.x + 8, r.y + 56, g.sem.textDim);
    if (hurt.length && ui.button('pn:crewheal', r.x + 8, r.y + 70, 200, 14, `Treat crew ${fmtMoney(hurt.length * 80)}`)) { if (spend(S, 'dirty', hurt.length * 80, 'medical')) { for (const c of hurt) { c.injured = 0; c.hp = 100; } g.toast('Crew treated.', 'good'); } }
    if (count(S, 'medkit') && P.hp < P.maxHp && ui.button('pn:usemed', r.x + 8, r.y + 90, 120, 14, 'Use a medkit')) { S.inv.medkit--; if (!S.inv.medkit) delete S.inv.medkit; P.hp = Math.min(P.maxHp, P.hp + 50); }
  },

  fixer(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 380, 250, "The Fixer's shack");
    const t = tabsRow(g, p, r, ['Bribes', 'Scapegoat', 'Recon']);
    const towns = SETTLEMENT_IDS.filter((x) => S.visited[x]);
    ui.list('pn:fix', r.x + 6, r.y + 32, r.w - 12, r.h - 38, 16, towns.length, (i, x, y, w) => {
      const town = towns[i];
      ui.text(`${PLACE[town].name}  heat ${Math.round(S.heat[town])}`, x + 4, y + 4, g.sem.text);
      if (t === 0 && ui.button('pn:bribe:' + town, x + w - 110, y + 1, 108, 13, `Bribe ${fmtMoney(bribeCost(S, town))}`, { disabled: S.heat[town] < 1, tip: 'Heat -15 in this town (dirty money).' })) say(g, bribe(S, town));
      if (t === 1) {
        const live = Object.values(S.rivals).filter((rv) => rv.alive);
        live.forEach((rv, k) => { if (ui.button(`pn:scape:${town}:${rv.id}`, x + w - 3 - (live.length - k) * 58, y + 1, 56, 13, rv.name.split(' ').pop(), { disabled: S.heat[town] < 5, tip: `Frame ${rv.name}: ${fmtMoney(scapegoatCost(S, town))}, heat -25, they will be furious.` })) say(g, scapegoat(S, town, rv.id)); });
      }
      if (t === 2) { const lv = S.recon[town] || 0; if (ui.button('pn:recon:' + town, x + w - 130, y + 1, 128, 13, lv >= 3 ? 'Recon complete' : `Recon ${lv + 1}/3 ${fmtMoney(reconCost(S, town))}`, { disabled: lv >= 3, tip: 'Lookouts on the vault: guard count, patrols, then layout (wider safe window).' })) say(g, buyRecon(S, town)); }
    }, { noClick: true });
  },

  council(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 360, 210, 'Compact Treasury');
    ui.wrapText('The Treasury takes tribute (clean money for goodwill and cooler streets) and, for a Kingpin, sells influence: council seats.', r.x + 8, r.y + 18, r.w - 16, g.sem.textDim);
    ui.text(`Goodwill ${Math.round(S.goodwill)}/100   Seats ${S.compact.seats}/12 (need 7)   Favors ${S.favors}`, r.x + 8, r.y + 46, g.sem.text);
    [500, 2000, 10000].forEach((amt, i) => { if (ui.button('pn:trib:' + amt, r.x + 8 + i * 116, r.y + 60, 112, 14, `Tribute ${fmtMoney(amt)}`, { disabled: S.money.clean < amt, tip: 'Clean money: +goodwill, -heat everywhere.' })) say(g, payTribute(S, amt)); });
    const sp = seatPrice(S);
    if (ui.button('pn:seat', r.x + 8, r.y + 84, 220, 14, `Buy seat ${S.compact.seats + 1}: ${fmtMoney(sp.clean)} + ${sp.favors} favors`, { disabled: rank(S) < 5, tip: rank(S) < 5 ? 'Kingpin only.' : 'Council votes for The Ledger ending.' })) say(g, buySeat(S));
    const why = ledgerReady(S);
    if (ui.button('pn:legalize', r.x + 8, r.y + 106, 220, 16, 'Call the vote: legalize', { primary: !why, disabled: !!why, tip: why || 'End the game: The Ledger.' })) say(g, legalize(S));
    if (why) ui.text(why, r.x + 8, r.y + 128, g.sem.textMute, { maxW: r.w - 16 });
  },

  chapel(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 300, 120, 'Chapel of the Verity');
    ui.wrapText('Candles, ash and a donation box. The priests pray for the souls of sinners. Generous sinners especially.', r.x + 8, r.y + 18, r.w - 16, g.sem.textDim);
    if (ui.button('pn:donate', r.x + 8, r.y + 60, 160, 14, `Donate ${fmtMoney(300)} clean`, { disabled: S.money.clean < 300, tip: 'Goodwill +3, Saint Verity heat -8.' })) { if (spend(S, 'clean', 300, 'tribute')) { S.goodwill = Math.min(100, S.goodwill + 3); S.heat.stverity = Math.max(0, S.heat.stverity - 8); g.toast('The priests bless your name.', 'good'); } }
  },

  garage(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 340, 200, 'Vehicle shed');
    let y = r.y + 18;
    for (const [id, V] of Object.entries(VEHICLES)) {
      const own = S.vehicles.owned[id];
      ui.icon({ handcart: 'cart', buggy: 'buggy', hauler: 'hauler' }[id], r.x + 8, y + 2);
      ui.text(`${V.name}${own ? ` (HP ${Math.round(own.hp)}/${V.hp})` : ''}`, r.x + 22, y + 3, g.sem.text);
      ui.tipArea(r.x + 8, y, 180, 14, V.desc);
      if (!own) { if (ui.button('pn:veh:' + id, r.x + r.w - 110, y, 102, 13, fmtMoney(V.price * D(S).cost), { disabled: rank(S) < V.rank, tip: `Unlocks at rank ${V.rank}.` })) { say(g, buyVehicle(S, id)); g.act.spawnVehicleAtHollow(); } }
      else {
        if (S.vehicles.active !== id && ui.button('pn:vset:' + id, r.x + r.w - 110, y, 50, 13, 'Use')) { S.vehicles.active = id; g.act.spawnVehicleAtHollow(); }
        if (own.hp < V.hp && ui.button('pn:vfix:' + id, r.x + r.w - 58, y, 50, 13, 'Fix', { tip: `Repair for ${fmtMoney(Math.round((V.hp - own.hp) * 2))}` })) { if (spend(S, 'dirty', Math.round((V.hp - own.hp) * 2), 'vehicles')) { own.hp = V.hp; g.act.spawnVehicleAtHollow(); } }
      }
      y += 18;
    }
    ui.wrapText('The active vehicle parks in the yard. Drivable ones: walk up and press X (or E). It rides with you on fast travel.', r.x + 8, y + 6, r.w - 16, g.sem.textDim);
  },

  regular(g, p) {
    const ui = g.ui, S = g.S;
    const reg = S.regulars.find((x) => x.id === (p.ent && p.ent.regular));
    if (!reg) { g.closeOverlay(); return; }
    const r = win(g, 'pn', 360, 220, `${reg.name} (regular)`);
    ui.text(`Likes: ${STRAINS[reg.likes].name} ${reg.form}s, ${QUALITY[reg.minQ].name}+   Loyalty ${reg.loyalty}/100   Today ${reg.bought}/${reg.budget} units`, r.x + 8, r.y + 18, g.sem.textDim, { maxW: r.w - 16 });
    sellPackList(g, r, reg.town, r.y + 32, r.h - 38, { regular: reg });
  },

  worker(g, p) {
    const ui = g.ui;
    const c = p.ent && p.ent.crewRef;
    const r = win(g, 'pn', 260, 110, c ? crewName(c) : 'Crew');
    if (!c) return;
    ui.ctx.drawImage(portrait(c.look), r.x + 8, r.y + 18);
    ui.text(`Job: ${c.job}`, r.x + 46, r.y + 20, g.sem.text);
    ui.text(`Loyalty ${Math.round(c.loyalty)}  Morale ${Math.round(c.morale)}`, r.x + 46, r.y + 32, g.sem.textDim);
    ui.text(['"Back to work, boss."', '"Ash in everything again."', '"You pay, I work."', '"Heard the Wardens are sniffing around."'][c.id % 4], r.x + 46, r.y + 44, g.sem.text);
    if (ui.button('pn:crewtab', r.x + 8, r.y + 86, 120, 14, 'Open Crew tab')) { g.ledgerCrew = c.id; g.openLedger(1); }
  },

  debtor(g, p) {
    const ui = g.ui, S = g.S;
    const r = win(g, 'pn', 300, 120, 'The debtor');
    ui.wrapText('"I... I can get it by Friday!" He is sweating ash.', r.x + 8, r.y + 18, r.w - 16, g.sem.text);
    const chance = Math.min(0.9, 0.35 + rank(S) * 0.1 + (hasPerk(S, 'fx_bribe') ? 0.1 : 0));
    if (ui.button('pn:lean', r.x + 8, r.y + 50, 140, 14, `Lean on him (${Math.round(chance * 100)}%)`)) { const ok = Math.random() < chance; g.closeOverlay(); g.act.missions.collectDebt(ok); g.toast(ok ? 'He pays up.' : 'He whistles for his friends...', ok ? 'good' : 'bad'); }
    if (ui.button('pn:gun', r.x + 154, r.y + 50, 138, 14, 'Draw your gun (sure, +heat)')) { g.closeOverlay(); g.act.missions.collectDebt(true); g.act.crime('threat', g.act.player.x, g.act.player.y); }
  },
};
PANELS.lotOwned = PANELS.lot;
PANELS.body = (g) => g.closeOverlay();

function invalidateSign(g, b) {
  const S = g.S;
  const own = S.businesses.find((x) => x.lot === b.id && x.town === b.place);
  if (own) { b.ownedSign = BUSINESSES[own.type].name.toUpperCase(); }
}

function plotPanel(g, p, c) {
  const ui = g.ui, S = g.S;
  const r = win(g, 'pn', 330, 210, c.fac === 'growroom' ? 'Indoor grow room' : 'Grow plot');
  const pl = c.plant;
  if (!pl) {
    ui.text('Empty. Plant one of your seeds:', r.x + 8, r.y + 18, g.sem.text);
    const seeds = Object.keys(S.inv).filter((k) => k.startsWith('seed:') && S.inv[k] > 0);
    ui.list('pn:seeds', r.x + 6, r.y + 30, r.w - 12, r.h - 36, 15, seeds.length, (i, x, y, w) => {
      const id = seeds[i].slice(5);
      const st = strainData(S, id);
      ui.icon('seed', x + 2, y + 2, st.tint);
      ui.text(`${st.name} x${count(S, seeds[i])}`, x + 15, y + 4, g.sem.text);
      ui.tipArea(x, y, w - 60, 15, `${st.name}: ${st.desc}\nGrow ${st.grow}h  Yield ${st.yield}  Potency ${st.potency}\nHardiness ${st.hardiness}  Smell ${st.smell}${st.night > 1 ? '\nGrows best at night' : ''}`);
      if (ui.button('pn:plant:' + id, x + w - 52, y + 1, 50, 13, 'Plant')) { say(g, plant(S, p.i, id)); }
    }, { noClick: true, empty: 'No seeds. Buy them in Millbrook or at the Crossroads.' });
    return;
  }
  const st = strainData(S, pl.strain);
  ui.icon('bud', r.x + 8, r.y + 18, st.tint);
  ui.text(`${st.name} - ${stageName(S, pl)}${pl.blight ? ' (BLIGHT)' : ''}`, r.x + 22, r.y + 20, pl.blight ? g.sem.bad : g.sem.text);
  const bars = [['Growth', pl.growth / st.grow, g.sem.rep], ['Water', pl.water / 100, RAMPS.sea[3]], ['Nutrients', pl.nutr / 100, RAMPS.olive[3]], ['Health', pl.health / 100, g.sem.good], ['Care', pl.careN ? pl.care / pl.careN : 0, RAMPS.gold[2]]];
  bars.forEach(([lab, f, col], i) => { ui.text(lab, r.x + 8, r.y + 36 + i * 13, g.sem.textDim); ui.bar(r.x + 70, r.y + 37 + i * 13, 160, 7, f, col); ui.text(`${Math.round(f * 100)}%`, r.x + 236, r.y + 36 + i * 13, g.sem.textDim); });
  ui.tipArea(r.x + 8, r.y + 88, 240, 13, 'Care = average of water, nutrients and health over the grow. It decides quality (with potency) and yield.');
  const by = r.y + r.h - 34;
  if (pl.dead) { if (ui.button('pn:clear', r.x + 8, by, 100, 14, 'Clear plot')) say(g, clearPlot(S, p.i)); return; }
  if (ui.button('pn:water', r.x + 8, by, 74, 14, 'Water', { tip: 'Fill the water to 100.' })) say(g, water(S, p.i));
  if (ui.button('pn:feed', r.x + 86, by, 74, 14, `Feed (${count(S, 'compost')})`, { tip: '1 compost: +50 nutrients.' })) say(g, feed(S, p.i));
  if (pl.blight && ui.button('pn:treat', r.x + 164, by, 74, 14, 'Treat', { tip: '2 compost: cure blight.' })) say(g, treat(S, p.i));
  if (ui.button('pn:harvest', r.x + r.w - 88, by, 80, 14, 'Harvest', { disabled: !ready(S, pl), primary: ready(S, pl), tip: ready(S, pl) ? 'Harvest: goes to the drying racks.' : 'Not ripe yet.' })) say(g, harvest(S, p.i));
  if (ui.button('pn:pull', r.x + r.w - 88, by + 16, 80, 12, 'Pull plant', { danger: true })) ui.confirm('Pull this plant? It is lost.', () => say(g, clearPlot(S, p.i)));
}

function labPanel(g, p, r) {
  const ui = g.ui, S = g.S;
  const known = Object.keys(S.strains.known).filter((k) => S.strains.known[k] && count(S, 'seed:' + k) > 0);
  p.a = p.a && known.includes(p.a) ? p.a : known[0];
  p.b = p.b && known.includes(p.b) ? p.b : known[1];
  if (S.breeding) { ui.text(`Breeding ${strainData(S, S.breeding.a).name} x ${strainData(S, S.breeding.b).name}: ${Math.ceil(S.breeding.h)}h left`, r.x + 8, r.y + 54, g.sem.warn); return; }
  if (known.length < 2) { ui.text('You need seeds of two different strains.', r.x + 8, r.y + 54, g.sem.textDim); return; }
  const cyc = (k, dir) => known[(known.indexOf(k) + dir + known.length) % known.length];
  ui.text('Parent A', r.x + 8, r.y + 52, g.sem.textDim);
  if (ui.button('pn:la', r.x + 60, r.y + 50, 12, 12, '◀')) p.a = cyc(p.a, -1);
  ui.text(strainData(S, p.a).name, r.x + 76, r.y + 52, g.sem.text);
  if (ui.button('pn:ra', r.x + 190, r.y + 50, 12, 12, '▶')) p.a = cyc(p.a, 1);
  ui.text('Parent B', r.x + 8, r.y + 68, g.sem.textDim);
  if (ui.button('pn:lb', r.x + 60, r.y + 66, 12, 12, '◀')) p.b = cyc(p.b, -1);
  ui.text(strainData(S, p.b).name, r.x + 76, r.y + 68, g.sem.text);
  if (ui.button('pn:rb', r.x + 190, r.y + 66, 12, 12, '▶')) p.b = cyc(p.b, 1);
  if (ui.button('pn:breed', r.x + 8, r.y + 86, 140, 14, 'Crossbreed (12h)', { primary: true, tip: 'Consumes one seed of each. Blended stats + 22% mutation chance. New hybrids go in the Strain Codex.' })) say(g, breed(S, p.a, p.b));
}

function magsPanel(g, p) {
  const ui = g.ui, S = g.S;
  const r = win(g, 'pn', 360, 200, "Mags' stall");
  ui.ctx.drawImage(portrait({ skin: RAMPS.sand[2], hair: RAMPS.bone[1], hairStyle: 1, hat: 6, hatC: 'gold', top: 'amber', top2: 'gold', topStyle: 'jacket', pants: 'ink', boots: RAMPS.ink[1] }, RAMPS.amber[0]), r.x + 8, r.y + 18);
  const lines = rank(S) >= 5 ? '"Kingpin. The Council Hall or the Council\'s purse: pick your poison."' : S.money.debt ? '"You still owe me, sweetheart."' : '"Dirty money buys silence. Clean money buys respect. Need anything?"';
  ui.wrapText(lines, r.x + 46, r.y + 20, r.w - 54, g.sem.text);
  let y = r.y + 58;
  const loanOk = !S.money.debt;
  if (ui.button('pn:loan', r.x + 8, y, 168, 14, 'Borrow $200 (20%, 7 days)', { disabled: !loanOk })) say(g, takeMagsLoan(S));
  if (S.money.debt && ui.button('pn:repay2', r.x + 182, y, 168, 14, `Repay ${fmtMoney(S.money.debt)}`)) say(g, repayMags(S, S.money.debt));
  y += 18;
  if (ui.button('pn:tip', r.x + 8, y, 168, 14, `Buy a tip-off ${fmtMoney(60)}`, { tip: 'A fresh job appears on the Job Board.' })) { if (spend(S, 'dirty', 60, 'tips')) { S.tips.push({ day: S.day, town: null, src: 'mags' }); import_contracts(S); g.toast('Mags whispers a name and a place. Check the Job Board.', 'good'); } }
  if (ui.button('pn:jobsb', r.x + 182, y, 168, 14, 'Job Board')) g.openLedger(7);
  y += 18;
  if (shellAvailable(S)) ui.wrapText("Shell deal: buy your first front with dirty money at any vacant lot (+25%). My lawyers handle the paperwork.", r.x + 8, y, r.w - 16, g.sem.warn);
}

import { contractsDaily } from '../sim/jobs.js';
function import_contracts(S) { contractsDaily(S); }

function recruitRow(g, c, town, x, y, w) {
  const ui = g.ui, S = g.S;
  ui.ctx.drawImage(portrait(c.look), x + 2, y + 6);
  ui.text(`${crewName(c)}${c.special === 'nephew' ? " (Mags' nephew)" : c.special === 'rescued' ? ' (owes you)' : ''}`, x + 38, y + 3, g.sem.text, { maxW: w - 150 });
  ui.text(BACKGROUNDS.find((b) => b.id === c.bg).name, x + 38, y + 13, g.sem.textDim);
  const top = SKILLS.slice().sort((a, b) => c.skills[b] - c.skills[a]).slice(0, 3);
  ui.text(top.map((s) => `${SKILL_NAMES[s].slice(0, 5)} ${c.skills[s]}`).join('  '), x + 38, y + 23, g.sem.text, { maxW: w - 150 });
  ui.text(c.traits.map((t, i) => (c.hidden[i] ? '???' : TRAITS[t].name)).join(', '), x + 38, y + 33, c.traits.some((t, i) => !c.hidden[i] && !TRAITS[t].good) ? g.sem.bad : g.sem.good, { maxW: w - 150 });
  ui.tipArea(x, y, w - 110, 44, `${BACKGROUNDS.find((b) => b.id === c.bg).story}\n${SKILLS.map((s) => `${SKILL_NAMES[s]} ${c.skills[s]}`).join(', ')}\n${c.traits.map((t, i) => (c.hidden[i] ? '!dHidden trait (vet to reveal)' : `${TRAITS[t].good ? '!g' : '!r'}${TRAITS[t].name}: ${TRAITS[t].desc}`)).join('\n')}`);
  ui.text(`$${c.wage}/day`, x + w - 104, y + 4, g.sem.dirty);
  if (!c.vetted && ui.button('pn:vet:' + c.id, x + w - 104, y + 16, 48, 12, 'Vet', { tip: `Background check: ${fmtMoney(vetCost(S, c))}. Reveals hidden traits.` })) say(g, vet(S, c));
  if (ui.button('pn:hire:' + c.id, x + w - 52, y + 16, 50, 12, c.special ? 'Hire' : fmtMoney(signingFee(c)), { primary: true, tip: c.special ? 'Free hire.' : `Signing fee ${fmtMoney(signingFee(c))}, then $${c.wage}/day.` })) say(g, hire(S, c.id, town));
}

export { recruitRow, effSkill };

// ---------- event card ----------
export function drawEventCard(g) {
  const ui = g.ui, S = g.S;
  const pend = S.events.pending[0];
  if (!pend) { g.overlay = null; return; }
  const ev = EVENT[pend.id];
  const c = bindCtx(S, ev, pend.ctx);
  const text = fillText(S, ev.text, c);
  const lines = wrap(text, 260);
  const h = 44 + lines.length * LINE_H + ev.choices.length * 18;
  const r = win(g, 'ev', 290, h, ev.title);
  lines.forEach((l, i) => ui.text(l, r.x + 10, r.y + 20 + i * LINE_H, g.sem.text));
  let y = r.y + 26 + lines.length * LINE_H;
  ev.choices.forEach((ch, i) => {
    const ok = reqOk(S, ch.req, c);
    if (ui.button(`ev:c${i}`, r.x + 10, y, r.w - 20, 15, fillText(S, ch.t, c), { disabled: !ok, tip: describeFx(S, ch.fx, c) || 'No direct effect.', key: 'Digit' + (i + 1) })) { say(g, resolveEvent(S, 0, i)); if (!S.events.pending.length) g.overlay = null; }
    y += 18;
  });
  if (S.events.pending.length > 1) ui.text(`+${S.events.pending.length - 1} more`, r.x + r.w - 60, r.y + r.h - 11, g.sem.textMute);
}

// ---------- The Ash Courier ----------
export function drawPaper(g) {
  const ui = g.ui;
  const p = g.paper || (g.S.news[g.S.news.length - 1]);
  if (!p) { g.overlay = null; return; }
  const r = win(g, 'paper', 320, 200, `THE ASH COURIER - Day ${p.day}`);
  ui.rect(r.x + 6, r.y + 16, r.w - 12, r.h - 22, RAMPS.bone[2]);
  let y = r.y + 22;
  for (const it of p.items) { const n = ui.wrapText(it, r.x + 12, y, r.w - 24, RAMPS.ink[1]); y += n + 4; ui.rect(r.x + 12, y - 3, r.w - 24, 1, RAMPS.bone[0]); }
  if (ui.button('paper:ok', r.x + r.w - 70, r.y + r.h - 18, 62, 13, 'Fold it', { key: 'Enter' })) g.overlay = null;
}

// ---------- dialog (Mags and friends) ----------
export function drawDialog(g) {
  const ui = g.ui;
  const d = g.dialog;
  if (!d) { g.overlay = null; return; }
  const w = Math.min(420, ui.W - 20), h = 74;
  const x = Math.round((ui.W - w) / 2), y = ui.H - h - 40;
  ui.dim('dlg:dim', 0.25);
  ui.panel('dlg', x, y, w, h, { title: d.title || 'Mags' });
  ui.ctx.drawImage(portrait({ skin: RAMPS.sand[2], hair: RAMPS.bone[1], hairStyle: 1, hat: 6, hatC: 'gold', top: 'amber', top2: 'gold', topStyle: 'jacket', pants: 'ink', boots: RAMPS.ink[1] }, RAMPS.amber[0]), x + 8, y + 18);
  ui.wrapText(d.lines[d.i], x + 46, y + 18, w - 54, g.sem.text);
  const last = d.i >= d.lines.length - 1;
  if (ui.button('dlg:next', x + w - 66, y + h - 17, 58, 13, last ? 'Got it' : 'Next', { key: 'Enter' }) || g.input.keyPressed('Space') || g.input.pressed('interact')) {
    if (last) g.nextDialog(); else d.i++;
  }
  if (ui.button('dlg:skip', x + w - 128, y + h - 17, 58, 13, 'Skip', { sound: 'ui_back' })) g.nextDialog();
}

// ---------- down / captured ----------
export function drawDown(g) {
  const ui = g.ui, S = g.S;
  const cap = g.downKind === 'capture';
  const r = win(g, 'down', 320, 150, cap ? 'CAPTURED' : 'YOU WENT DOWN');
  const lossPct = hasPerk(S, 'gun_will') ? 7 : 15;
  if (S.ironman && !cap) { ui.wrapText('Ironman: death is permanent. Your empire passes into legend (and into Mags\' ledger).', r.x + 10, r.y + 20, r.w - 20, g.sem.bad); if (ui.button('down:end', r.x + 10, r.y + r.h - 22, r.w - 20, 15, 'Accept fate', { danger: true })) g.resolveDown('death'); return; }
  if (!cap) {
    ui.wrapText(`Someone drags you back to the Hollow. You lose ${lossPct}% of the cash you carried and the guns you had on you. Six hours pass.`, r.x + 10, r.y + 20, r.w - 20, g.sem.text);
    if (ui.button('down:ok', r.x + 10, r.y + r.h - 22, r.w - 20, 15, 'Get up', { primary: true, key: 'Enter' })) g.resolveDown('death');
    return;
  }
  ui.wrapText(`The Wardens drag you to a cell. You lose ${lossPct}% of carried cash and anything hot you were holding. How do you get out?`, r.x + 10, r.y + 20, r.w - 20, g.sem.text);
  const squad = S.crew.filter((c) => c.status === 'active' && c.job === 'squad' && !c.injured).length;
  if (ui.button('down:bail', r.x + 10, r.y + 66, r.w - 20, 15, `Pay bail ${fmtMoney(g.bailCost())}`, { disabled: S.money.dirty + S.money.carried < g.bailCost() })) g.resolveDown('bail');
  if (ui.button('down:jail', r.x + 10, r.y + 84, r.w - 20, 15, 'Jailbreak (risky: +heat, maybe 2 days inside)')) g.resolveDown('jail');
  if (ui.button('down:crew', r.x + 10, r.y + 102, r.w - 20, 15, `Crew rescue (${squad} in the squad)`, { disabled: !squad })) g.resolveDown('crew');
}

export { earn, PACKS, STAGES };
