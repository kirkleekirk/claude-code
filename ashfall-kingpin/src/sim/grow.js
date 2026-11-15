// Weed chain: plots (water/light/nutrients/health), harvest -> dry -> cure -> pack, crossbreeding.
import { STRAINS, QUALITY, PACKS, STAGE_AT, STAGES, HYBRID_A, HYBRID_B, MUTATIONS } from '../data/strains.js';
import { FACILITIES } from '../data/progress.js';
import { hashStr } from '../core/rng.js';
import { rnd, rchance } from '../core/rng.js';
import { count, addItem, takeItem } from './inventory.js';
import { log, fx, stat, addRep, hasPerk, hour, rank, nextId } from './state.js';
import { addHeat } from './heat.js';
import { onJob, effSkill, productivity, bestOn } from './crew.js';
import { budKey, packKey } from '../data/items.js';

export const strainData = (S, id) => STRAINS[id] || S.strains.hybrids[id];
export const isPlot = (c) => c && (c.fac === 'plot' || c.fac === 'growroom');
export const plotIdx = (S) => S.hollow.cells.map((c, i) => (isPlot(c) ? i : -1)).filter((i) => i >= 0);
export const facCount = (S, f) => S.hollow.cells.filter((c) => c && c.fac === f).length;

export function stageOf(p, st) {
  if (!p) return -1;
  if (p.dead) return 5;
  const f = p.growth / st.grow;
  let s = 0;
  for (let i = 0; i < STAGE_AT.length; i++) if (f >= STAGE_AT[i]) s = i;
  return s;
}
export const stageName = (S, p) => (p.dead ? 'Dead' : STAGES[stageOf(p, strainData(S, p.strain))]);
export const ready = (S, p) => p && !p.dead && p.growth >= strainData(S, p.strain).grow;

export function plant(S, ci, strain) {
  const c = S.hollow.cells[ci];
  if (!isPlot(c)) return { ok: false, msg: 'Not a plot.' };
  if (c.plant) return { ok: false, msg: 'Already planted.' };
  if (!takeItem(S, 'seed:' + strain, 1)) return { ok: false, msg: `No ${strainData(S, strain).name} seeds.` };
  c.plant = { strain, growth: 0, water: 70, nutr: 70, health: 100, care: 0, careN: 0, blight: false, dead: false, born: S.total };
  S.strains.known[strain] = true;
  S.tutorial.flags.planted = true;
  stat(S, 'planted');
  fx(S, 'sfx', { name: 'plant' });
  return { ok: true, msg: `Planted ${strainData(S, strain).name}.` };
}

export function water(S, ci) {
  const c = S.hollow.cells[ci];
  if (!isPlot(c) || !c.plant || c.plant.dead) return { ok: false, msg: 'Nothing to water.' };
  c.plant.water = 100;
  S.tutorial.flags.watered = true;
  fx(S, 'sfx', { name: 'water' });
  return { ok: true, msg: 'Watered.' };
}

export function feed(S, ci) {
  const c = S.hollow.cells[ci];
  if (!isPlot(c) || !c.plant || c.plant.dead) return { ok: false, msg: 'Nothing to feed.' };
  if (!takeItem(S, 'compost', 1)) return { ok: false, msg: 'No compost. Buy some or build a Compost Bin.' };
  c.plant.nutr = Math.min(100, c.plant.nutr + 50);
  return { ok: true, msg: 'Fed compost (+50 nutrients).' };
}

export function treat(S, ci) {
  const c = S.hollow.cells[ci];
  if (!c || !c.plant || !c.plant.blight) return { ok: false, msg: 'Nothing to treat.' };
  if (!takeItem(S, 'compost', 2)) return { ok: false, msg: 'Treatment needs 2 compost.' };
  c.plant.blight = false;
  return { ok: true, msg: 'Blight treated.' };
}

export function clearPlot(S, ci) {
  const c = S.hollow.cells[ci];
  if (!c || !c.plant) return { ok: false, msg: 'Already empty.' };
  c.plant = null;
  return { ok: true, msg: 'Plot cleared.' };
}

export const dryCap = (S) => 20 + 30 * facCount(S, 'dryrack');
export const cureCap = (S) => 20 + 30 * facCount(S, 'cureroom');
const loadOf = (list) => list.reduce((a, x) => a + x.units, 0);

export function harvest(S, ci, byCrew = null) {
  const c = S.hollow.cells[ci];
  if (!isPlot(c) || !ready(S, c.plant)) return { ok: false, msg: 'Not ready.' };
  const p = c.plant;
  const st = strainData(S, p.strain);
  const care = p.careN ? p.care / p.careN : 0.6;
  const farmer = byCrew || bestOn(S, 'farmer');
  const fs = farmer ? effSkill(farmer, 'farming') : 2.5;
  let units = st.yield * (0.55 + 0.45 * p.health / 100) * (0.85 + 0.3 * care) * (1 + 0.02 * fs);
  if (hasPerk(S, 'op_green')) units *= 1.1;
  if (farmer && farmer.traits.includes('green_thumb')) units *= 1.1;
  if (c.fac === 'growroom') units *= 1.15;
  units = Math.max(1, Math.round(units));
  if (loadOf(S.drying) + units > dryCap(S)) return { ok: false, msg: `Drying racks full (${loadOf(S.drying)}/${dryCap(S)}). Build a Drying Rack.` };
  const q = st.potency * 0.62 + care * 100 * 0.38 + fs * 0.8;
  S.drying.push({ strain: p.strain, units, q, h: 6 });
  const seeds = 1 + (rchance(S, st.legendary ? 0.15 : 0.55) ? 1 : 0);
  addItem(S, 'seed:' + p.strain, seeds);
  c.plant = null;
  stat(S, 'harvests');
  stat(S, 'unitsGrown', units);
  addRep(S, 0.5, null, 'farming');
  S.tutorial.flags.harvested = true;
  fx(S, 'sfx', { name: 'harvest' });
  return { ok: true, msg: `Harvested ${units} units of ${st.name} (+${seeds} seed${seeds > 1 ? 's' : ''}). Drying for 6h.` };
}

// Hourly growth for every plot (and hidden back-room grow slots).
export function growHour(S) {
  const h = hour(S);
  const day = h >= 6 && h < 20;
  const powerOk = !S.hollow.noPower;
  const tanks = facCount(S, 'watertank');
  let roomN = 0;
  const farmers = onJob(S, 'farmer').filter((f) => f.injured === 0);
  let capacity = farmers.reduce((a, f) => a + Math.floor((4 + effSkill(f, 'farming') / 2) * productivity(S, f)), 0);
  const fSkill = farmers.length ? Math.max(...farmers.map((f) => effSkill(f, 'farming'))) : 0;
  for (const i of plotIdx(S)) {
    const c = S.hollow.cells[i];
    const p = c.plant;
    if (!p || p.dead) continue;
    const st = strainData(S, p.strain);
    const indoor = c.fac === 'growroom';
    let light;
    if (indoor) { roomN++; light = powerOk ? 1 : 0; if (roomN <= tanks * 4) p.water = 100; }
    else light = day ? st.day : st.night;
    p.water = Math.max(0, p.water - (indoor ? 2 : day ? 4 : 2));
    p.nutr = Math.max(0, p.nutr - 1.1);
    if (capacity > 0 && !ready(S, p)) {
      capacity--;
      if (p.water < 60) p.water = 100;
      if (p.nutr < 45 && takeItem(S, 'compost', 1)) p.nutr = Math.min(100, p.nutr + 50);
      if (p.blight && count(S, 'compost') >= 2) { takeItem(S, 'compost', 2); p.blight = false; }
    }
    const okW = p.water > 15, okN = p.nutr > 8;
    const cond = (okW ? 1 : 0.3) * (okN ? 1 : 0.55);
    if (!ready(S, p)) p.growth = Math.min(st.grow, p.growth + light * cond * (1 + 0.02 * fSkill));
    const hard = st.hardiness / 100;
    if (!okW || !okN) p.health -= 3.2 - hard * 1.5;
    else p.health = Math.min(100, p.health + 1.5);
    if (p.blight) p.health -= 2.6 * (1 - hard * 0.6);
    if (indoor && !powerOk) p.health -= 0.6;
    if (ready(S, p)) p.health -= 0.15;
    p.care += ((okW ? 1 : 0) + (okN ? 1 : 0) + Math.max(0, p.health) / 100) / 3;
    p.careN++;
    if (p.health <= 0) {
      p.health = 0;
      p.dead = true;
      stat(S, 'plantsLost');
      log(S, `A ${st.name} plant wilted and died. Water and feed your plots!`, 'bad');
    }
  }
}

// Daily smell heat from growing plants (outdoor plots are visible; rooms leak a little).
export function growDaily(S) {
  let smell = 0;
  for (const i of plotIdx(S)) {
    const c = S.hollow.cells[i];
    if (!c.plant || c.plant.dead) continue;
    smell += (strainData(S, c.plant.strain).smell / 50) * (c.fac === 'growroom' ? 0.25 : 0.35);
  }
  if (smell > 0) addHeat(S, 'hollow', smell * 2, 'plant smell', { quiet: true });
  // Back-room grow slots at fronts produce quietly.
  for (const b of S.businesses) {
    if (b.backroom !== 'grow') continue;
    b.growT = (b.growT || 0) + 1;
    if (b.growT >= 2) {
      b.growT = 0;
      const best = Object.keys(S.strains.known).filter((k) => S.strains.known[k] && strainData(S, k)).sort((a, z) => strainData(S, z).potency - strainData(S, a).potency)[0] || 'dust_devil';
      S.curing.push({ strain: best, units: 12, q: strainData(S, best).potency * 0.62 + 30, h: 10, m: 1.1 });
    }
  }
}

// Drying + curing + auto-pack, hourly.
export function processHour(S) {
  const speed = hasPerk(S, 'op_chain') ? 1.18 : 1;
  for (const d of S.drying) d.h = Math.max(0, d.h - speed);
  const curer = bestOn(S, 'curer');
  const cs = curer ? effSkill(curer, 'farming') : 2.5;
  for (let i = 0; i < S.drying.length; i++) {
    const d = S.drying[i];
    if (d.h > 0) continue;
    if (loadOf(S.curing) + d.units > cureCap(S)) break;
    S.drying.splice(i--, 1);
    S.curing.push({ strain: d.strain, units: d.units, q: d.q, h: 10, m: Math.min(1.4, 1 + 0.04 * cs) });
  }
  for (let i = 0; i < S.curing.length; i++) {
    const d = S.curing[i];
    d.h = Math.max(0, d.h - speed);
    if (d.h > 0) continue;
    S.curing.splice(i--, 1);
    const score = d.q * d.m;
    let qi = 0;
    for (let k = 0; k < QUALITY.length; k++) if (score >= QUALITY[k].min) qi = k;
    addItem(S, budKey(d.strain, qi), d.units);
    stat(S, 'unitsCured', d.units);
    if (qi === 3) stat(S, 'legendaryBatches');
    S.tutorial.flags.cured = true;
    log(S, `${d.units} units of ${QUALITY[qi].name} ${strainData(S, d.strain).name} finished curing.`, 'good');
  }
  if (S.packAuto.on || curer) autoPack(S);
}

export function autoPack(S) {
  const form = S.packAuto.form || 'baggie';
  const per = PACKS[form].units;
  for (const k of Object.keys(S.inv)) {
    if (!k.startsWith('bud:')) continue;
    const [, strain, q] = k.split(':');
    const n = Math.floor(Math.max(0, count(S, k) - (S.packAuto.keepBud || 0)) / per);
    if (n > 0) packBud(S, strain, +q, form, n, true);
  }
}

export function packBud(S, strain, q, form, n, quiet = false) {
  const pk = PACKS[form];
  const k = budKey(strain, q);
  const can = Math.floor(count(S, k) / pk.units);
  n = Math.min(n, can);
  if (n <= 0) return { ok: false, msg: `Need ${pk.units} cured units per ${pk.name.toLowerCase()}.` };
  takeItem(S, k, n * pk.units);
  addItem(S, packKey(strain, q, form), n);
  stat(S, 'packed', n);
  S.tutorial.flags.packed = true;
  if (!quiet) fx(S, 'sfx', { name: 'craft' });
  return { ok: true, msg: `Packed ${n} ${pk.name.toLowerCase()}${n > 1 ? 's' : ''}.` };
}

// ---------- crossbreeding ----------
export function hybridOf(S, a, b, mutate) {
  const [x, y] = [a, b].sort();
  const sa = strainData(S, x), sb = strainData(S, y);
  const h = hashStr(x + '+' + y);
  const id = 'h_' + (h % 100000).toString(36) + (mutate ? '_' + mutate : '');
  if (S.strains.hybrids[id]) return S.strains.hybrids[id];
  const blend = (k) => (sa[k] + sb[k]) / 2;
  const jit = (k, amt) => blend(k) * (1 + ((hashStr(id + k) % 1000) / 1000 - 0.5) * amt);
  const st = {
    id, name: HYBRID_A[h % HYBRID_A.length] + ' ' + HYBRID_B[Math.floor(h / 7) % HYBRID_B.length],
    grow: Math.round(jit('grow', 0.2)), yield: Math.max(3, Math.round(jit('yield', 0.25))), potency: Math.min(99, Math.round(jit('potency', 0.18))),
    hardiness: Math.min(95, Math.round(jit('hardiness', 0.2))), smell: Math.round(jit('smell', 0.25)), day: blend('day'), night: blend('night'),
    tint: sa.tint, parents: [x, y], seedPrice: 40, rank: 0, desc: `Hybrid of ${sa.name} and ${sb.name}.`,
  };
  if (st.name === sa.name || st.name === sb.name) st.name += ' II';
  if (mutate) {
    const m = MUTATIONS.find((z) => z.id === mutate);
    st.name = m.name + ' ' + st.name;
    st.mutation = m.id;
    if (m.mult) st[m.stat] = m.stat === 'grow' ? Math.round(st[m.stat] * m.mult) : m.stat === 'yield' ? Math.round(st[m.stat] * m.mult) : st[m.stat] * m.mult;
    if (m.add) st[m.stat] = Math.min(m.stat === 'night' ? 2 : 99, st[m.stat] + m.add);
    st.desc += ` Mutation: ${m.desc}.`;
  }
  return st;
}

export function breed(S, a, b) {
  if (!facCount(S, 'lab')) return { ok: false, msg: 'Build a Breeding Lab first.' };
  if (rank(S) < 1) return { ok: false, msg: 'Crossbreeding unlocks at Hustler.' };
  if (S.breeding) return { ok: false, msg: 'The lab is busy.' };
  if (a === b) return { ok: false, msg: 'Pick two different strains.' };
  if (count(S, 'seed:' + a) < 1 || count(S, 'seed:' + b) < 1) return { ok: false, msg: 'Need one seed of each parent.' };
  takeItem(S, 'seed:' + a, 1);
  takeItem(S, 'seed:' + b, 1);
  S.breeding = { a, b, h: 12 };
  return { ok: true, msg: 'Crossbreeding started (12 hours).' };
}

export function labHour(S) {
  if (!S.breeding) return;
  S.breeding.h -= hasPerk(S, 'op_chain') ? 1.18 : 1;
  if (S.breeding.h > 0) return;
  const { a, b } = S.breeding;
  S.breeding = null;
  const mut = rchance(S, 0.22) ? MUTATIONS[Math.floor(rnd(S) * MUTATIONS.length)].id : null;
  const st = hybridOf(S, a, b, mut);
  const fresh = !S.strains.hybrids[st.id];
  S.strains.hybrids[st.id] = st;
  S.strains.known[st.id] = true;
  addItem(S, 'seed:' + st.id, 3);
  if (fresh) {
    S.strains.codex.push({ id: st.id, day: S.day });
    stat(S, 'hybrids');
    addRep(S, 8, 'new strain', 'farming');
    log(S, `New strain discovered: ${st.name}${st.mutation ? ' (mutation!)' : ''}. Logged in the Strain Codex.`, 'good');
  } else log(S, `Bred more ${st.name} seeds (+3).`, 'info');
}

// Power + compost bins + generators, hourly.
export function utilitiesHour(S) {
  const gens = facCount(S, 'generator');
  const rooms = facCount(S, 'growroom') + (S.businesses.some((b) => b.backroom === 'grow') ? 0 : 0);
  S.hollow.powerCap = gens * 10;
  S.hollow.power = rooms * (FACILITIES.growroom.power || 3);
  let ok = S.hollow.power <= S.hollow.powerCap;
  if (S.hollow.power > 0 && gens > 0) {
    const burn = gens * (1 / 6) * (1 - 0.25 * (S.hollow.up.power || 0));
    S.hollow.fuelAcc = (S.hollow.fuelAcc || 0) + burn;
    while (S.hollow.fuelAcc >= 1) { S.hollow.fuelAcc -= 1; if (!takeItem(S, 'fuel', 1)) { ok = false; break; } }
  }
  if (S.hollow.power > 0 && count(S, 'fuel') <= 0 && gens > 0) ok = false;
  if (S.hollow.noPower !== !ok && S.hollow.power > 0) log(S, ok ? 'Power restored to the grow rooms.' : 'Grow rooms are dark: not enough power or fuel!', ok ? 'good' : 'bad');
  S.hollow.noPower = !ok && S.hollow.power > 0;
  const bins = facCount(S, 'compost');
  if (bins) {
    S.hollow.compT = (S.hollow.compT || 0) + 1;
    if (S.hollow.compT >= 6) {
      S.hollow.compT = 0;
      for (let k = 0; k < bins; k++) if (takeItem(S, 'scrap', 1)) addItem(S, 'compost', 3);
    }
  }
}

export { nextId };
