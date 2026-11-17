import { fail, ok } from '@/core/types';
import type { PropertyId } from '@/content/ids';
import { STRAIN_NOTE_BRED } from '@/content/notes';
import type { StrainId } from '@/content/strains';
import type {
  FeedProfile, HarvestResult, LightLevel, PlantId, PlantStage, PlantState, PotId, SimResult, SnipGrade, TendResult,
} from '../api';
import { GROW, XP } from '../balance';
import type { SimCtx } from '../ctx';
import { ensureProduct, stackId } from '../products';
import { t } from '../strings';
import { emptyPots, growthSpeed, hasStation, plantAt, plantsAt, potsOf, qualityBonus, yieldBonus } from './layout';
import { addXp, stat } from './progression';

/** The Hothouse: planting, growth, care, and harvest grading. Growth runs on sim-seconds. */

export function stageOf(growth: number): PlantStage {
  const s = GROW.stageAt;
  if (growth >= s[3]) return 4;
  if (growth >= s[2]) return 3;
  if (growth >= s[1]) return 2;
  if (growth >= s[0]) return 1;
  return 0;
}

export function plantNeeds(ctx: SimCtx, p: PlantState): Array<'water' | 'food' | 'prune' | 'ripe' | 'overripe'> {
  const out: Array<'water' | 'food' | 'prune' | 'ripe' | 'overripe'> = [];
  if (p.growth >= 1) {
    const s = ctx.strain(p.strain);
    out.push(s && p.ripeFor > s.peakWindow + GROW.lateSteps[0] ? 'overripe' : 'ripe');
  }
  if (p.water < GROW.needAt) out.push('water');
  if (p.food < GROW.needAt) out.push('food');
  if (!p.pruned && p.growth < 1) out.push('prune');
  return out;
}

function ownedAndOpen(ctx: SimCtx, prop: PropertyId, allowLockdown = false): SimResult {
  const st = ctx.state.properties[prop];
  if (!st) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop].name }));
  if (!allowLockdown && st.lockdownUntil > ctx.now) return fail('lockdown', t('lockdown'));
  return ok(undefined);
}

export function plantSeed(ctx: SimCtx, prop: PropertyId, pot: PotId, strain: StrainId, feed: FeedProfile = 'balanced'): SimResult<PlantId> {
  const open = ownedAndOpen(ctx, prop);
  if (!open.ok) return open;
  const s = ctx.strain(strain);
  if (!s) return fail('notFound');
  if (!potsOf(ctx, prop).includes(pot)) return fail('notFound');
  if (plantAt(ctx, pot)) return fail('occupied', t('potTaken'));
  if (!ctx.takeSupply(`seed:${strain}`, 1)) return fail('supplies', t('noSeeds', { name: s.name }));
  const up = ctx.upgradeMods();
  const id = ctx.id('p');
  ctx.state.plants[id] = {
    id, property: prop, pot, strain, feed, plantedAt: ctx.now, growth: 0, ripeFor: -1,
    water: up.noWater ? 1 : 0.15, food: 1, pruned: true, care: 0.7, careSamples: 5, handTended: false, lastTendedAt: ctx.now,
  };
  if (!ctx.state.strains.seen.includes(strain)) ctx.state.strains.seen.push(strain);
  stat(ctx, 'plantsPlanted');
  addXp(ctx, XP.plant, 'plant');
  ctx.emit('sim:planted', { plant: id, property: prop, pot, strain });
  ctx.bump('plants');
  ctx.beat('firstPlant');
  return ok(id);
}

export function plantAll(ctx: SimCtx, prop: PropertyId, strain: StrainId, feed: FeedProfile = 'balanced'): SimResult<number> {
  const open = ownedAndOpen(ctx, prop);
  if (!open.ok) return open;
  const s = ctx.strain(strain);
  if (!s) return fail('notFound');
  const pots = emptyPots(ctx, prop);
  if (pots.length === 0) return fail('full', t('noPot'));
  if (ctx.supply(`seed:${strain}`) <= 0) return fail('supplies', t('noSeeds', { name: s.name }));
  let n = 0;
  for (const pot of pots) {
    if (ctx.supply(`seed:${strain}`) <= 0) break;
    if (plantSeed(ctx, prop, pot, strain, feed).ok) n++;
  }
  return ok(n);
}

export function tendPlant(ctx: SimCtx, plantId: PlantId, by: 'player' | 'crew'): SimResult<TendResult> {
  const p = ctx.state.plants[plantId];
  if (!p) return fail('notFound');
  const open = ownedAndOpen(ctx, p.property, by === 'player');
  if (!open.ok) return open;
  if (!hasStation(ctx, p.property, 'feed')) return fail('notReady', t('noStation', { station: t('station.feed') }));
  const up = ctx.upgradeMods();
  const res: TendResult = { watered: false, fed: false, pruned: false, cleared: 0 };
  if (p.water < GROW.needAt) res.cleared++;
  if (p.food < GROW.needAt) res.cleared++;
  if (!p.pruned && p.growth < 1) res.cleared++;
  if (p.water < 0.9 && !up.noWater) res.watered = true;
  if (p.food < 0.9 && !up.noFood) res.fed = true;
  if (!p.pruned && p.growth < 1) res.pruned = true;
  p.water = 1;
  p.food = 1;
  if (p.growth < 1) p.pruned = true;
  p.lastTendedAt = ctx.now;
  if (by === 'player') p.handTended = true;
  if (res.watered || res.fed || res.pruned) {
    stat(ctx, 'tends');
    if (res.cleared > 0 && by === 'player') addXp(ctx, XP.tend * Math.min(3, res.cleared), 'tend');
    ctx.bump('plants');
  }
  ctx.emit('sim:tended', { plant: plantId, result: res, by });
  if (by === 'player' && (res.watered || res.fed || res.pruned)) ctx.beat('firstTend');
  return ok(res);
}

export function tendAll(ctx: SimCtx, prop: PropertyId, by: 'player' | 'crew'): SimResult<number> {
  const open = ownedAndOpen(ctx, prop, by === 'player');
  if (!open.ok) return open;
  let n = 0;
  for (const p of plantsAt(ctx, prop)) {
    const r = tendPlant(ctx, p.id, by);
    if (r.ok && r.value.cleared > 0) n++;
  }
  return ok(n);
}

function snipSummary(grades: readonly SnipGrade[]): { perfect: number; misses: number; total: number; grade: SnipGrade } {
  const list = grades.length ? grades : (['good', 'good', 'good'] as SnipGrade[]);
  let perfect = 0;
  let good = 0;
  let misses = 0;
  for (const g of list) {
    if (g === 'perfect') perfect++;
    else if (g === 'good') good++;
    else if (g === 'miss') misses++;
  }
  const total = list.length;
  const grade: SnipGrade = perfect === total ? 'perfect' : perfect + good >= total / 2 ? 'good' : misses === total ? 'miss' : 'ok';
  return { perfect, misses, total, grade };
}

export function harvestPlant(ctx: SimCtx, plantId: PlantId, grades: readonly SnipGrade[], by: 'player' | 'crew'): SimResult<HarvestResult> {
  const p = ctx.state.plants[plantId];
  if (!p) return fail('notFound');
  const open = ownedAndOpen(ctx, p.property);
  if (!open.ok) return open;
  if (p.growth < 1) return fail('notReady', t('notRipe'));
  const s = ctx.strain(p.strain);
  if (!s) return fail('notFound');
  const prop = ctx.state.properties[p.property];
  const up = ctx.upgradeMods();
  const snips = snipSummary(by === 'crew' ? [] : grades);

  let timing: HarvestResult['timing'] = 'peak';
  let timingQ: number = GROW.peakBonus;
  if (p.ripeFor > s.peakWindow + GROW.lateSteps[1]) {
    timing = 'late';
    timingQ = -GROW.latePenalty[1];
  } else if (p.ripeFor > s.peakWindow + GROW.lateSteps[0]) {
    timing = 'late';
    timingQ = -GROW.latePenalty[0];
  } else if (p.ripeFor > s.peakWindow) {
    timing = 'late';
    timingQ = 0;
  }

  let q = s.quality + (p.care - 0.6) * 0.6 + GROW.feedQuality[p.feed] + GROW.lightQuality[prop.lights] + qualityBonus(ctx, p.property) + timingQ;
  if (by === 'player') {
    if (p.handTended) q += GROW.handBonus;
    q += (snips.perfect / snips.total) * 0.12 - snips.misses * 0.05;
  } else {
    q -= GROW.crewPenalty;
  }
  q = Math.min(1, Math.max(0, q));
  const stars = 1 + Math.round(q * 4);
  const bonus = by === 'player' && snips.grade === 'perfect' && timing === 'peak' ? 1 : 0;
  const units = Math.max(1, s.yield + GROW.feedYield[p.feed] + up.yield + yieldBonus(ctx, p.property) + bonus);

  const { product } = ensureProduct(ctx, 'bloom', p.strain, [s.effect], null, []);
  product.made += units;
  const stack = stackId(product.id, stars);
  const to = by === 'player' ? 'bag' : 'stash';
  ctx.add(to === 'bag' ? 'bag' : p.property, stack, units);

  // streaks
  const prog = ctx.state.progression;
  if (by === 'player') {
    for (const g of grades) prog.snipStreak = g === 'perfect' ? prog.snipStreak + 1 : 0;
    if (snips.perfect > 0) stat(ctx, 'perfectSnips', snips.perfect);
  }
  stat(ctx, 'harvests');
  ctx.state.today.harvested += units;

  const firstOfStrain = !ctx.state.strains.grown.includes(p.strain);
  if (firstOfStrain) {
    ctx.state.strains.grown.push(p.strain);
    const page = {
      index: ctx.state.notebook.length, kind: 'strain' as const, product: product.id, strain: p.strain,
      doodle: `doodle-${s.look.form}`, note: s.parents ? STRAIN_NOTE_BRED : s.note, stars, sticker: null, at: ctx.now,
    };
    ctx.state.notebook.push(page);
    if (product.page === null) product.page = page.index;
    ctx.bump('notebook');
  }

  const xp = by === 'player' ? XP.harvest + XP.harvestPerStar * stars + (bonus ? 5 : 0) + (firstOfStrain ? 15 : 0) : 0;
  if (xp) addXp(ctx, xp, 'harvest');
  delete ctx.state.plants[plantId];
  const res: HarvestResult = { product: product.id, stack, units, stars, timing, grade: snips.grade, streak: prog.snipStreak, xp, to };
  ctx.emit('sim:harvest', { ...res, plant: plantId, property: p.property, by });
  ctx.bump('plants', 'inventory');
  if (by === 'player') ctx.beat('firstHarvest');
  return ok(res);
}

export function setLights(ctx: SimCtx, prop: PropertyId, level: LightLevel): SimResult {
  const open = ownedAndOpen(ctx, prop, true);
  if (!open.ok) return open;
  ctx.state.properties[prop].lights = level;
  ctx.bump('properties');
  return ok(undefined);
}

export function clearPot(ctx: SimCtx, plantId: PlantId): SimResult {
  const p = ctx.state.plants[plantId];
  if (!p) return fail('notFound');
  delete ctx.state.plants[plantId];
  ctx.bump('plants');
  return ok(undefined);
}

/** Advance every plant by `dt` sim-seconds. */
export function tickPlants(ctx: SimCtx, dt: number): void {
  const up = ctx.upgradeMods();
  const thirst = up.heatProof ? Math.min(1, ctx.mods.thirst) : ctx.mods.thirst;
  let changed = false;
  for (const id in ctx.state.plants) {
    const p = ctx.state.plants[id]!;
    const s = ctx.strain(p.strain);
    if (!s) continue;
    const prop = ctx.state.properties[p.property];
    const wasNeedy = p.water < GROW.needAt || p.food < GROW.needAt;
    p.water = up.noWater ? 1 : Math.max(0, p.water - (dt * thirst) / (GROW.waterLife * s.hardiness));
    p.food = up.noFood ? 1 : Math.max(0, p.food - dt / (GROW.foodLife * s.hardiness));
    const careNow =
      (p.water >= GROW.needAt ? 1 : p.water / GROW.needAt) * 0.5 +
      (p.food >= GROW.needAt ? 1 : p.food / GROW.needAt) * 0.3 +
      (p.pruned || p.growth >= 1 ? 1 : 0.4) * 0.2;
    p.care = (p.care * p.careSamples + careNow * dt) / (p.careSamples + dt);
    p.careSamples = Math.min(600, p.careSamples + dt);
    if (p.growth < 1) {
      const time = (s.growTime * GROW.feedTime[p.feed] * GROW.lightTime[prop.lights] * up.growTime) / (growthSpeed(ctx, p.property) * ctx.mods.growth);
      let rate = 1 / Math.max(10, time);
      if (p.water < GROW.needAt) rate *= GROW.thirstyRate;
      if (p.food < GROW.needAt) rate *= GROW.hungryRate;
      const before = stageOf(p.growth);
      p.growth = Math.min(1, p.growth + rate * dt);
      const after = stageOf(p.growth);
      if (after !== before) {
        if (after < 4) p.pruned = false;
        else p.ripeFor = 0;
        ctx.emit('sim:plantStage', { plant: p.id, property: p.property, stage: after });
        changed = true;
      }
    } else {
      p.ripeFor += dt;
    }
    const needy = p.water < GROW.needAt || p.food < GROW.needAt;
    if (needy !== wasNeedy) changed = true;
  }
  if (changed) ctx.bump('plants');
}
