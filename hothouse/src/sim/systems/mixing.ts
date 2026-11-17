import { fail, ok } from '@/core/types';
import type { AdditiveId } from '@/content/additives';
import { EFFECTS, sortEffects, type EffectId } from '@/content/effects';
import type { PropertyId, StationKind, Tier } from '@/content/ids';
import { HARMONIES } from '@/content/mixRules';
import type { StrainId } from '@/content/strains';
import { APEX_NOTES, DISCOVERY_NOTES, HARMONY_NOTES, TIER_NOTES } from '@/content/notes';
import type {
  Discovery, JobId, JobState, MixPreview, MixResult, NotebookPage, PreviewEffect, ProductId, ProductState, Recipe, SimResult, StackId,
} from '../api';
import { BRAND, MIX } from '../balance';
import type { SimCtx } from '../ctx';
import { dominant, ensureProduct, harmonyOf, parseProduct, parseStack, productId, productValue, stackId } from '../products';
import { t } from '../strings';
import { hasStation, workSpeed } from './layout';
import { applyAdditive, applyMix } from './mixAlgo';
import { addXp, stat } from './progression';

/** Ofelia's Notebook: mixing, tier refinement, discovery pages and queued station jobs. */

export function mixCap(ctx: SimCtx): number {
  return Math.max(MIX.baseCap, ctx.upgradeMods().cap);
}

export function batchCap(ctx: SimCtx): number {
  return Math.max(MIX.batch, ctx.upgradeMods().batch);
}

function knows(ctx: SimCtx, pair: string): boolean {
  return ctx.state.knowledge.rules.includes(pair);
}

/** Preview: exact where every additive/effect pair has been tried before, "?" where not. */
export function previewMix(ctx: SimCtx, baseEffects: readonly EffectId[], tier: Tier, strain: StrainId, stars: number, additives: readonly AdditiveId[]): MixPreview {
  const cap = mixCap(ctx);
  let slots: PreviewEffect[] = sortEffects(baseEffects).map((e) => ({ effect: e, source: 'kept', from: null }));
  let exact = true;
  let fused: EffectId | null = null;
  for (const a of additives) {
    const known = slots.filter((s) => s.effect !== null).map((s) => s.effect!);
    const allKnown = known.every((e) => EFFECTS[e].kind === 'apex' || knows(ctx, `${a}:${e}`));
    if (exact && allKnown && slots.every((s) => s.effect !== null)) {
      const step = applyAdditive(known, a, cap);
      if (!fused && step.fused) fused = step.fused;
      slots = step.effects.map((s) => ({ effect: s.effect, source: s.source, from: s.from }));
      continue;
    }
    exact = false;
    const next: PreviewEffect[] = [];
    for (const s of slots) {
      if (s.effect === null || EFFECTS[s.effect].kind === 'apex') {
        next.push(s);
      } else if (knows(ctx, `${a}:${s.effect}`)) {
        const step = applyAdditive([s.effect], a, 99);
        const moved = step.effects.find((x) => x.source !== 'added');
        if (moved) next.push({ effect: moved.effect, source: moved.source === 'kept' ? 'kept' : 'transformed', from: s.effect });
      } else {
        next.push({ effect: null, source: 'unknown', from: s.effect });
      }
    }
    const own = ctx.content.additives[a].adds;
    if (!next.some((x) => x.effect === own) && next.length < cap) next.push({ effect: own, source: 'added', from: null });
    // Merge known duplicates (a collision we can see but cannot resolve exactly).
    const seen = new Set<string>();
    slots = next.filter((x) => {
      if (x.effect === null) return true;
      if (seen.has(x.effect)) return false;
      seen.add(x.effect);
      return true;
    });
  }
  const effects = slots.filter((s) => s.effect !== null).map((s) => s.effect!);
  const harmony = exact ? harmonyOf(effects) : null;
  const value = productValue(ctx, tier, strain, effects, stars);
  const known = exact ? productId(tier, strain, effects) : null;
  return { effects: slots, exact, fused: exact ? fused : null, harmony, value, cap, known: known && ctx.state.products[known] ? known : null };
}

function familyKey(effects: readonly EffectId[]): keyof typeof DISCOVERY_NOTES {
  const d = dominant(effects);
  if (d.length === 0) return 'mixed';
  const top = EFFECTS[d[0]!];
  if (top.kind === 'dud') return 'dud';
  if (effects.some((e) => EFFECTS[e].kind === 'dud')) return 'dud';
  const families = new Set(effects.map((e) => EFFECTS[e].family).filter(Boolean));
  if (families.size >= 3) return 'mixed';
  return top.family ?? 'mixed';
}

/** Record what a mix revealed: learned pairs, new effects, apex, harmony, and a Notebook page. */
function recordDiscoveries(
  ctx: SimCtx, product: ProductState, isNew: boolean, tried: readonly string[], fired: readonly string[], stars: number, tierPage: Tier | null,
): { discoveries: Discovery[]; page: NotebookPage | null; xp: number } {
  const k = ctx.state.knowledge;
  const discoveries: Discovery[] = [];
  let xp = 0;
  for (const pair of tried) {
    if (k.rules.includes(pair)) continue;
    k.rules.push(pair);
    if (fired.includes(pair)) {
      const [a, e] = pair.split(':') as [AdditiveId, EffectId];
      discoveries.push({ kind: 'rule', id: pair, label: `${ctx.content.additives[a].name} × ${EFFECTS[e].name}` });
      xp += MIX.xpRule;
    }
  }
  let apex: EffectId | null = null;
  for (const e of product.effects) {
    if (k.effects.includes(e)) continue;
    k.effects.push(e);
    if (EFFECTS[e].kind === 'apex') {
      apex = e;
      discoveries.push({ kind: 'apex', id: e, label: EFFECTS[e].name });
      xp += MIX.xpApex;
    } else {
      discoveries.push({ kind: 'effect', id: e, label: EFFECTS[e].name });
    }
  }
  let harmonyNew = false;
  if (product.harmony && !k.harmonies.includes(product.harmony)) {
    k.harmonies.push(product.harmony);
    harmonyNew = true;
    discoveries.push({ kind: 'harmony', id: product.harmony, label: HARMONIES[product.harmony].name });
    xp += MIX.xpHarmony;
  }
  let page: NotebookPage | null = null;
  if (isNew) {
    discoveries.unshift({ kind: 'product', id: product.id, label: product.name });
    xp += MIX.xpNewProduct + MIX.xpPerEffect * product.effects.length;
    const top = dominant(product.effects)[0];
    const kind: NotebookPage['kind'] = apex ? 'apex' : harmonyNew ? 'harmony' : tierPage ? 'tier' : 'discovery';
    const note =
      kind === 'apex' ? ctx.rng.pick(APEX_NOTES)
        : kind === 'harmony' ? ctx.rng.pick(HARMONY_NOTES)
          : kind === 'tier' && tierPage !== 'bloom' && tierPage ? TIER_NOTES[tierPage]
            : ctx.rng.pick(DISCOVERY_NOTES[familyKey(product.effects)]);
    page = {
      index: ctx.state.notebook.length, kind, product: product.id, strain: product.strain,
      doodle: `doodle-${top ? EFFECTS[top].icon : 'leaf'}`, note, stars,
      sticker: product.harmony ? HARMONIES[product.harmony].sticker : apex ? 'sticker-apex' : null, at: ctx.now,
    };
    ctx.state.notebook.push(page);
    product.page = page.index;
    stat(ctx, 'discoveries');
    ctx.state.today.discoveries += 1;
    ctx.earn(MIX.pageCash, 'dirty', 'reward');
    if (ctx.state.brand) ctx.state.brand.hype = Math.min(100, ctx.state.brand.hype + BRAND.perDiscovery);
    ctx.bump('notebook', 'brand');
    ctx.toast(apex ? t('apex', { name: EFFECTS[apex].name }) : t('discovery', { name: product.name }), 'good', 'book');
  }
  if (discoveries.length) ctx.emit('sim:discovery', { product: product.id, page, discoveries });
  return { discoveries, page, xp };
}

/** Take `qty` units of a stack, bag first then the property stash. */
function takeUnits(ctx: SimCtx, prop: PropertyId, stack: StackId, qty: number): boolean {
  const inBag = ctx.units('bag', stack);
  const inStash = ctx.units(prop, stack);
  if (inBag + inStash < qty) return false;
  const fromBag = Math.min(inBag, qty);
  ctx.take('bag', stack, fromBag);
  ctx.take(prop, stack, qty - fromBag);
  return true;
}

function stationCheck(ctx: SimCtx, prop: PropertyId, station: StationKind): SimResult {
  const st = ctx.state.properties[prop];
  if (!st) return fail('notFound');
  if (!st.owned) return fail('notOwned', t('notOwned', { name: ctx.content.properties[prop].name }));
  if (st.lockdownUntil > ctx.now) return fail('lockdown', t('lockdown'));
  if (!hasStation(ctx, prop, station)) return fail('notReady', t('noStation', { station: t(`station.${station}`) }));
  return ok(undefined);
}

export function mix(ctx: SimCtx, prop: PropertyId, base: StackId, additives: readonly AdditiveId[], qty: number, by: 'player' | 'crew' = 'player'): SimResult<MixResult> {
  const check = stationCheck(ctx, prop, 'workbench');
  if (!check.ok) return check;
  if (by === 'player' && ctx.world.insideProperty !== prop) return fail('notHere', t('notHere', { place: ctx.content.properties[prop].name }));
  if (additives.length === 0) return fail('invalid', t('noAdditives'));
  if (additives.length > MIX.maxAdditives) return fail('invalid', t('tooManyAdditives'));
  const n = Math.floor(qty);
  if (n < 1) return fail('invalid', t('qtyZero'));
  if (n > batchCap(ctx)) return fail('full', t('batch', { n: batchCap(ctx) }));
  const st = parseStack(base);
  const prod = st ? parseProduct(st.product) : null;
  if (!st || !prod) return fail('notFound');
  if (prod.tier !== 'bloom') return fail('invalid', t('bloomOnly'));
  if (ctx.units('bag', base) + ctx.units(prop, base) < n) return fail('stock', t('stock'));
  const need = new Map<AdditiveId, number>();
  for (const a of additives) need.set(a, (need.get(a) ?? 0) + n);
  for (const [a, k] of need) if (ctx.supply(`add:${a}`) < k) return fail('supplies', t('supplies', { name: ctx.content.additives[a].name, shop: shopFor(ctx, a) }));

  takeUnits(ctx, prop, base, n);
  for (const [a, k] of need) ctx.takeSupply(`add:${a}`, k);
  const run = applyMix(prod.effects, additives, mixCap(ctx));
  const { product, isNew } = ensureProduct(ctx, 'bloom', prod.strain, run.effects, st.product, additives);
  product.made += n;
  const out = stackId(product.id, st.stars);
  ctx.add(by === 'player' ? 'bag' : prop, out, n);
  ctx.state.today.made += n;
  stat(ctx, 'mixes');
  const rec = recordDiscoveries(ctx, product, isNew, run.tried, run.fired, st.stars, null);
  const xp = (by === 'player' ? 4 : 0) + rec.xp;
  addXp(ctx, xp, 'mix');
  const res: MixResult = {
    product: product.id, stack: out, units: n, effects: product.effects, fused: run.fused, harmony: product.harmony, isNew,
    discoveries: rec.discoveries, page: rec.page, xp, value: productValue(ctx, 'bloom', prod.strain, product.effects, st.stars),
  };
  ctx.emit('sim:mixed', { ...res, by, property: prop });
  ctx.bump('products');
  if (by === 'player') ctx.beat('firstMix');
  return ok(res);
}

/** Cold Still (3 Bloom → 1 Dew) or Sun Press (1 Dew → 6 Halos). */
export function refine(ctx: SimCtx, prop: PropertyId, base: StackId, qty: number, by: 'player' | 'crew' = 'player'): SimResult<MixResult> {
  const st = parseStack(base);
  const prod = st ? parseProduct(st.product) : null;
  if (!st || !prod) return fail('notFound');
  if (prod.tier === 'halos') return fail('invalid', t('tierWrong', { tier: t('tier.dew') }));
  const station: StationKind = prod.tier === 'bloom' ? 'coldStill' : 'sunPress';
  const check = stationCheck(ctx, prop, station);
  if (!check.ok) return check;
  if (by === 'player' && ctx.world.insideProperty !== prop) return fail('notHere', t('notHere', { place: ctx.content.properties[prop].name }));
  const n = Math.floor(qty);
  if (n < 1) return fail('invalid', t('qtyZero'));
  const inputs = prod.tier === 'bloom' ? n * MIX.dewInputs : n;
  if (ctx.units('bag', base) + ctx.units(prop, base) < inputs) return fail('stock', t('stock'));
  takeUnits(ctx, prop, base, inputs);
  const tier: Tier = prod.tier === 'bloom' ? 'dew' : 'halos';
  const units = tier === 'dew' ? n : n * MIX.halosOutputs;
  const { product, isNew } = ensureProduct(ctx, tier, prod.strain, prod.effects, st.product, []);
  product.made += units;
  const out = stackId(product.id, st.stars);
  ctx.add(by === 'player' ? 'bag' : prop, out, units);
  ctx.state.today.made += units;
  stat(ctx, 'mixes');
  const rec = recordDiscoveries(ctx, product, isNew, [], [], st.stars, tier);
  const xp = Math.min(30, units * 3) + rec.xp;
  addXp(ctx, xp, 'refine');
  const res: MixResult = {
    product: product.id, stack: out, units, effects: product.effects, fused: null, harmony: product.harmony, isNew,
    discoveries: rec.discoveries, page: rec.page, xp, value: productValue(ctx, tier, prod.strain, product.effects, st.stars),
  };
  ctx.emit('sim:mixed', { ...res, by, property: prop });
  return ok(res);
}

function shopFor(ctx: SimCtx, a: AdditiveId): string {
  for (const shopId of ['mamaYolis', 'sodAlmighty', 'annieStall'] as const) {
    const shop = ctx.content.shops[shopId];
    if (shop.stock.some((i) => 'additive' in i && i.additive === a)) return shop.name;
  }
  return ctx.content.shops.gulfDirect.name;
}

// ── queued jobs ─────────────────────────────────────────────────────────────

function recipeStation(recipe: Recipe): StationKind {
  return recipe.tierUp === 'dew' ? 'coldStill' : recipe.tierUp === 'halos' ? 'sunPress' : 'workbench';
}

/** Stacks of a product in a property stash, best quality first. */
function stacksOf(ctx: SimCtx, prop: PropertyId, product: ProductId): Array<[StackId, number]> {
  const out: Array<[StackId, number]> = [];
  const stash = ctx.state.properties[prop].stash;
  for (const k in stash) {
    const st = parseStack(k);
    if (st && st.product === product) out.push([k, stash[k]!]);
  }
  return out.sort((a, b) => b[0].localeCompare(a[0]));
}

export function queueJob(ctx: SimCtx, prop: PropertyId, recipe: Recipe, qty: number, by: 'player' | 'crew' = 'player'): SimResult<JobId> {
  const station = recipeStation(recipe);
  const check = stationCheck(ctx, prop, station);
  if (!check.ok) return check;
  const n = Math.floor(qty);
  if (n < 1) return fail('invalid', t('qtyZero'));
  const base = parseProduct(recipe.base);
  if (!base) return fail('notFound');
  if (station === 'workbench') {
    if (base.tier !== 'bloom') return fail('invalid', t('bloomOnly'));
    if (recipe.additives.length === 0) return fail('invalid', t('noAdditives'));
    if (recipe.additives.length > MIX.maxAdditives) return fail('invalid', t('tooManyAdditives'));
  } else if ((station === 'coldStill' && base.tier !== 'bloom') || (station === 'sunPress' && base.tier !== 'dew')) {
    return fail('invalid', t('tierWrong', { tier: t(station === 'coldStill' ? 'tier.bloom' : 'tier.dew') }));
  }
  const perUnit = station === 'coldStill' ? MIX.dewInputs : 1;
  const inputs = n * perUnit;
  const stacks = stacksOf(ctx, prop, recipe.base);
  const available = stacks.reduce((s, [, c]) => s + c, 0);
  if (available < inputs) return fail('stock', t('stock'));
  if (station === 'workbench') {
    const need = new Map<AdditiveId, number>();
    for (const a of recipe.additives) need.set(a, (need.get(a) ?? 0) + n);
    for (const [a, k] of need) if (ctx.supply(`add:${a}`) < k) return fail('supplies', t('supplies', { name: ctx.content.additives[a].name, shop: shopFor(ctx, a) }));
    for (const [a, k] of need) ctx.takeSupply(`add:${a}`, k);
  }
  const reserved: Record<StackId, number> = {};
  let left = inputs;
  for (const [stack, count] of stacks) {
    if (left <= 0) break;
    const take = Math.min(count, left);
    ctx.take(prop, stack, take);
    reserved[stack] = take;
    left -= take;
  }
  const unitTime = (MIX.unitTime[station as 'workbench' | 'coldStill' | 'sunPress'] * ctx.upgradeMods().mixTime) / workSpeed(ctx, prop);
  const job: JobState = {
    id: ctx.id('j'), property: prop, station, recipe: { ...recipe, additives: [...recipe.additives] }, qty: n, done: 0, progress: 0,
    unitTime, status: 'queued', blockedReason: null, by, reserved, createdAt: ctx.now,
  };
  ctx.state.jobs.push(job);
  ctx.bump('jobs');
  return ok(job.id);
}

export function cancelJob(ctx: SimCtx, id: JobId): SimResult {
  const i = ctx.state.jobs.findIndex((j) => j.id === id);
  if (i < 0) return fail('notFound');
  const job = ctx.state.jobs[i]!;
  for (const stack in job.reserved) ctx.add(job.property, stack, job.reserved[stack]!);
  if (job.station === 'workbench') {
    const left = job.qty - job.done;
    for (const a of job.recipe.additives) ctx.addSupply(`add:${a}`, left);
  }
  job.status = 'cancelled';
  ctx.state.jobs.splice(i, 1);
  ctx.bump('jobs');
  return ok(undefined);
}

export function cookAgain(ctx: SimCtx, productId: ProductId, qty: number): SimResult<JobId> {
  const p = ctx.state.products[productId];
  if (!p || !p.base) return fail('invalid');
  const recipe: Recipe = p.tier === 'bloom' ? { base: p.base, additives: [...p.additives] } : { base: p.base, additives: [], tierUp: p.tier };
  const station = recipeStation(recipe);
  const perUnit = station === 'coldStill' ? MIX.dewInputs : 1;
  const candidates = (Object.keys(ctx.state.properties) as PropertyId[]).filter(
    (id) => ctx.state.properties[id].owned && hasStation(ctx, id, station),
  );
  if (candidates.length === 0) return fail('notReady', t('noStation', { station: t(`station.${station}`) }));
  const here = ctx.world.insideProperty;
  candidates.sort((a, b) => {
    if (a === here) return -1;
    if (b === here) return 1;
    const sa = stacksOf(ctx, a, p.base!).reduce((s, [, c]) => s + c, 0);
    const sb = stacksOf(ctx, b, p.base!).reduce((s, [, c]) => s + c, 0);
    return sb - sa;
  });
  const prop = candidates[0]!;
  const have = stacksOf(ctx, prop, p.base).reduce((s, [, c]) => s + c, 0);
  const n = Math.min(Math.floor(qty), Math.floor(have / perUnit));
  if (n < 1) return fail('stock', t('stock'));
  return queueJob(ctx, prop, recipe, n);
}

/** Cooks assigned to a property speed jobs up and run several at once. */
function jobCapacity(ctx: SimCtx, prop: PropertyId): { slots: number; speed: number } {
  let slots = 0;
  let speed = 0;
  for (const id in ctx.state.crew) {
    const c = ctx.state.crew[id]!;
    if (c.role === 'cook' && c.assignment.property === prop && c.status === 'working') {
      slots++;
      speed += 0.75 + 0.25 * c.skill;
    }
  }
  return slots === 0 ? { slots: 1, speed: 1 } : { slots, speed: speed / slots };
}

function finishUnit(ctx: SimCtx, job: JobState): void {
  const perUnit = job.station === 'coldStill' ? MIX.dewInputs : 1;
  let stars = 3;
  let need = perUnit;
  for (const stack of Object.keys(job.reserved).sort().reverse()) {
    if (need <= 0) break;
    const have = job.reserved[stack]!;
    const take = Math.min(have, need);
    const st = parseStack(stack);
    if (st && need === perUnit) stars = st.stars;
    job.reserved[stack] = have - take;
    if (job.reserved[stack] === 0) delete job.reserved[stack];
    need -= take;
  }
  const base = parseProduct(job.recipe.base)!;
  let tier: Tier = 'bloom';
  let effects = base.effects;
  let units = 1;
  let tried: string[] = [];
  let fired: string[] = [];
  if (job.station === 'workbench') {
    const run = applyMix(base.effects, job.recipe.additives, mixCap(ctx));
    effects = run.effects;
    tried = run.tried;
    fired = run.fired;
  } else if (job.station === 'coldStill') {
    tier = 'dew';
  } else {
    tier = 'halos';
    units = MIX.halosOutputs;
  }
  const { product, isNew } = ensureProduct(ctx, tier, base.strain, effects, job.recipe.base, job.station === 'workbench' ? job.recipe.additives : []);
  product.made += units;
  ctx.add(job.property, stackId(product.id, stars), units);
  ctx.state.today.made += units;
  if (isNew || tried.length) {
    const rec = recordDiscoveries(ctx, product, isNew, tried, fired, stars, tier === 'bloom' ? null : tier);
    if (rec.xp) addXp(ctx, rec.xp, 'job');
  }
  job.done += 1;
}

export function tickJobs(ctx: SimCtx, dt: number): void {
  if (ctx.state.jobs.length === 0) return;
  const byProp = new Map<PropertyId, JobState[]>();
  for (const j of ctx.state.jobs) {
    const list = byProp.get(j.property);
    if (list) list.push(j);
    else byProp.set(j.property, [j]);
  }
  let changed = false;
  for (const [prop, jobs] of byProp) {
    const locked = ctx.state.properties[prop].lockdownUntil > ctx.now;
    const cap = jobCapacity(ctx, prop);
    let running = 0;
    for (const job of jobs) {
      if (locked) {
        if (job.status !== 'blocked') {
          job.status = 'blocked';
          job.blockedReason = t('lockdown');
          changed = true;
        }
        continue;
      }
      if (running >= cap.slots) {
        if (job.status !== 'queued') {
          job.status = 'queued';
          changed = true;
        }
        continue;
      }
      running++;
      if (job.status !== 'running') {
        job.status = 'running';
        job.blockedReason = null;
        changed = true;
      }
      job.progress += dt * cap.speed;
      while (job.progress >= job.unitTime && job.done < job.qty) {
        job.progress -= job.unitTime;
        finishUnit(ctx, job);
        changed = true;
      }
      if (job.done >= job.qty) {
        job.status = 'done';
        const p = ctx.state.products[lastProductOf(ctx, job)];
        ctx.emit('sim:jobDone', { job: job.id, property: prop, product: p?.id ?? job.recipe.base, units: job.qty });
        ctx.toast(t('jobDone', { qty: job.qty, name: p?.name ?? '', place: ctx.content.properties[prop].name }), 'good', 'bowl');
      }
    }
  }
  const before = ctx.state.jobs.length;
  ctx.state.jobs = ctx.state.jobs.filter((j) => j.status !== 'done');
  if (changed || ctx.state.jobs.length !== before) ctx.bump('jobs', 'inventory');
}

function lastProductOf(ctx: SimCtx, job: JobState): ProductId {
  const base = parseProduct(job.recipe.base);
  if (!base) return job.recipe.base;
  if (job.station === 'workbench') return productId('bloom', base.strain, applyMix(base.effects, job.recipe.additives, mixCap(ctx)).effects);
  return productId(job.station === 'coldStill' ? 'dew' : 'halos', base.strain, base.effects);
}

export function setFavorite(ctx: SimCtx, id: ProductId, on: boolean): SimResult {
  const p = ctx.state.products[id];
  if (!p) return fail('notFound');
  p.favorite = on;
  ctx.bump('products');
  return ok(undefined);
}

export function renameProduct(ctx: SimCtx, id: ProductId, name: string): SimResult {
  const p = ctx.state.products[id];
  if (!p) return fail('notFound');
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > 32) return fail('invalid', t('invalidName'));
  p.name = clean;
  p.customName = true;
  ctx.bump('products');
  return ok(undefined);
}
