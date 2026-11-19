import { fmt } from '@/core/i18n';
import { fail, ok } from '@/core/types';
import type { RivalId } from '@/content/ids';
import { RIVALS, RIVAL_ACTIONS, type RivalActionId } from '@/content/rivals';
import { TURFS, type TurfId } from '@/content/turfs';
import type { RivalState, SimResult } from '../api';
import type { SimCtx } from '../ctx';
import { t } from '../strings';
import { addNotoriety } from './notoriety';
import { addXp, rankLock } from './progression';

/** Rival factions push on turfs; the player pushes back with one of seven answers. */

const RIVAL_LIST: readonly RivalId[] = ['vale', 'mudflaps', 'zenith'];

export function turfOwner(ctx: SimCtx, id: TurfId): 'player' | RivalId | null {
  const inf = ctx.state.turfs[id].influence;
  let best: 'player' | RivalId | null = null;
  let bestV = 25;
  for (const k of ['player', ...RIVAL_LIST] as const) {
    if (inf[k] > bestV) {
      bestV = inf[k];
      best = k;
    }
  }
  return best;
}

export function territoryRows(ctx: SimCtx) {
  return ctx.content.turfIds.map((id) => {
    const turf = ctx.state.turfs[id];
    return { turf: id, district: TURFS[id].district, owner: turfOwner(ctx, id), player: Math.round(turf.influence.player), trend: turf.trend, dealer: turf.dealer };
  });
}

function requirement(ctx: SimCtx, rival: RivalState, action: RivalActionId): string | null {
  if (action === 'outBrand' && (ctx.state.brand?.hype ?? 0) < 30) return t('needsHype');
  if (action === 'ally') {
    if (rival.allied) return t('alreadyDone');
    const respect = rival.id === 'vale' ? ctx.state.money.debt.respect : 0;
    if (rival.standing < 40 && respect < 60) return t('needsRespect');
  }
  if (action === 'expose' && !ctx.state.story.flags.reyesAlly) return t('needsReyes');
  return null;
}

export function rivalAction(ctx: SimCtx, id: RivalId, action: RivalActionId, turf?: TurfId): SimResult<{ cost: number; line: string }> {
  const rival = ctx.state.rivals[id];
  const def = RIVAL_ACTIONS[action];
  if (!rival || !def) return fail('notFound');
  const lock = rankLock(ctx, def.rank);
  if (lock.locked) return fail('locked', lock.reason ?? undefined);
  const ready = rival.cooldowns[action] ?? 0;
  if (ready > ctx.now) return fail('cooldown', t('cooldown', { time: fmt.duration(ready - ctx.now) }));
  const req = requirement(ctx, rival, action);
  if (req) return fail('locked', req);
  const rdef = RIVALS[id];
  const cost = Math.round(def.cost * (rdef.weakTo.includes(action) ? 1 : 1.5));
  const paid = ctx.pay(cost, 'any', 'bribe');
  if (!paid.ok) return paid;
  const strong = rdef.weakTo.includes(action) ? 1 : 0.7;
  rival.pressure = Math.max(0, Math.min(100, rival.pressure + def.pressure * strong));
  rival.standing = Math.max(-100, Math.min(100, rival.standing + def.standing));
  if (action === 'ally') rival.allied = true;
  if (action === 'expose') rival.exposed = true;
  const targets: TurfId[] = turf ? [turf] : ctx.content.turfIds.filter((x) => rdef.home.includes(TURFS[x].district));
  for (const x of targets) {
    const inf = ctx.state.turfs[x].influence;
    const share = turf ? 1 : 0.5;
    inf.player = Math.min(100, inf.player + def.influence * share * strong);
    inf[id] = Math.max(0, inf[id] - def.influence * share * strong);
  }
  if (def.notoriety) addNotoriety(ctx, def.notoriety);
  rival.cooldowns[action] = ctx.now + def.cooldown;
  addXp(ctx, 30, 'rival');
  const line = rdef.answerLines[action] ?? def.line;
  if (rdef.answerLines[action]) ctx.text(rdef.leader, rdef.leader, line, { kind: 'story' });
  ctx.bump('rivals', 'territory');
  return ok({ cost, line });
}

export function tickRivals(ctx: SimCtx, dt: number): void {
  if (ctx.state.story.beats.prologueDone === undefined) return;
  const minutes = dt / 60;
  const flags = ctx.state.story.flags;
  for (const id of RIVAL_LIST) {
    const r = ctx.state.rivals[id];
    if (!r.allied) r.pressure = Math.min(100, r.pressure + 0.12 * (ctx.rank / 3) * minutes);
    else r.pressure = Math.max(0, r.pressure - 2 * minutes);
    for (const mark of [50, 80]) {
      const key = `rivalPressure_${id}_${mark}`;
      if (r.pressure >= mark && !flags[key]) {
        flags[key] = true;
        ctx.text(RIVALS[id].leader, RIVALS[id].leader, ctx.rng.pick(RIVALS[id].pressureLines), { kind: 'story' });
      } else if (r.pressure < mark - 15 && flags[key]) {
        flags[key] = false;
      }
    }
  }
  let changed = false;
  for (const tid of ctx.content.turfIds) {
    const turf = ctx.state.turfs[tid];
    const inf = turf.influence;
    const before = inf.player;
    for (const id of RIVAL_LIST) {
      const r = ctx.state.rivals[id];
      if (r.allied || inf[id] <= 0) continue;
      const push = (r.pressure / 100) * 0.6 * minutes * (RIVALS[id].home.includes(TURFS[tid].district) ? 1.4 : 0.8);
      inf[id] = Math.min(100, inf[id] + push * 0.5);
      inf.player = Math.max(0, inf.player - push * (turf.dealer ? 0.4 : 1));
    }
    turf.trend = Math.sign(Math.round((inf.player - before) * 1000));
    if (inf.player !== before) changed = true;
  }
  if (changed) ctx.bump('territory');
}

/** Rival effects on demand: Zenith undercuts where it dominates. */
export function rivalDemand(ctx: SimCtx): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  const z = ctx.state.rivals.zenith;
  if (z.allied || z.exposed) return out;
  for (const district of RIVALS.zenith.home) {
    const turfs = ctx.content.turfIds.filter((x) => TURFS[x].district === district);
    const zen = turfs.reduce((s, x) => s + ctx.state.turfs[x].influence.zenith, 0) / Math.max(1, turfs.length);
    const me = turfs.reduce((s, x) => s + ctx.state.turfs[x].influence.player, 0) / Math.max(1, turfs.length);
    if (zen > me + 10) out[district] = 0.9;
  }
  return out;
}
