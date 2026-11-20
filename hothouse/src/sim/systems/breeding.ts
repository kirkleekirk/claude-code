import { fail, ok } from '@/core/types';
import { BASE_EFFECT_IDS, type EffectId } from '@/content/effects';
import type { PropertyId } from '@/content/ids';
import { STRAIN_NOTE_BRED } from '@/content/notes';
import type { FlowerForm, StrainDef, StrainId } from '@/content/strains';
import type { CrossOffer, SimResult } from '../api';
import type { SimCtx } from '../ctx';
import { t } from '../strings';
import { hasStation } from './layout';
import { addXp } from './progression';

/** The Breeding Cabinet: cross two grown strains, pick one of three seedlings, name it. */

const CROSS_COST = 150;
const FORMS: readonly FlowerForm[] = ['star', 'ruffle', 'cup', 'spike', 'puff', 'orchid', 'trumpet', 'fan'];

function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase()}`;
}

function child(ctx: SimCtx, a: StrainDef, b: StrainDef, index: number): StrainDef {
  const r = ctx.rng;
  const k = r.next();
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const mutation = r.chance(0.12);
  const effect: EffectId = mutation ? r.pick(BASE_EFFECT_IDS) : r.chance(0.5) ? a.effect : b.effect;
  const vigor = 1 + r.tri() * 0.12;
  return {
    id: `x-${ctx.state.strains.crosses + 1}-${index}`,
    name: `${a.short} × ${b.short} #${index + 1}`,
    short: `${a.short.slice(0, 4)}${b.short.slice(-4)}`,
    effect,
    growTime: Math.round(lerp(a.growTime, b.growTime) * (2 - vigor)),
    yield: Math.max(2, Math.round(lerp(a.yield, b.yield) * vigor)),
    quality: Math.min(0.95, lerp(a.quality, b.quality) + r.tri() * 0.06 + (mutation ? 0.05 : 0)),
    hardiness: Math.max(0.5, lerp(a.hardiness, b.hardiness) + r.tri() * 0.1),
    appeal: Math.max(0.8, lerp(a.appeal, b.appeal) + r.tri() * 0.06 + (mutation ? 0.08 : 0)),
    value: Math.round(lerp(a.value, b.value) * vigor),
    seedPrice: Math.round(lerp(a.seedPrice, b.seedPrice)),
    rank: Math.max(a.rank, b.rank),
    peakWindow: Math.round(lerp(a.peakWindow, b.peakWindow)),
    look: {
      petal: mixHex(a.look.petal, b.look.petal, k),
      center: r.chance(0.5) ? a.look.center : b.look.center,
      leaf: mixHex(a.look.leaf, b.look.leaf, k),
      glow: mixHex(a.look.glow, b.look.glow, k),
      form: mutation ? r.pick(FORMS) : r.chance(0.5) ? a.look.form : b.look.form,
      petals: Math.max(4, Math.round(lerp(a.look.petals, b.look.petals))),
      height: lerp(a.look.height, b.look.height),
      bushiness: lerp(a.look.bushiness, b.look.bushiness),
    },
    line: mutation ? 'Something unexpected happened in the cabinet. In a good way.' : `A cross of ${a.name} and ${b.name}.`,
    note: STRAIN_NOTE_BRED,
    parents: [a.id, b.id],
    ...(mutation ? { mutation: 'Rare mutation' } : {}),
  };
}

export function crossStrains(ctx: SimCtx, a: StrainId, b: StrainId): SimResult<CrossOffer> {
  if (!ctx.isUnlocked('station:breedingCabinet')) return fail('locked', t('lockedRank', { rank: 5 }));
  const hasCabinet = (Object.keys(ctx.state.properties) as PropertyId[]).some((id) => ctx.state.properties[id].owned && hasStation(ctx, id, 'breeding'));
  if (!hasCabinet) return fail('notReady', t('needsBreeder'));
  if (a === b) return fail('invalid', t('sameStrain'));
  const sa = ctx.strain(a);
  const sb = ctx.strain(b);
  if (!sa || !sb) return fail('notFound');
  if (!ctx.state.strains.grown.includes(a) || !ctx.state.strains.grown.includes(b)) return fail('notReady', t('needsGrown'));
  if (ctx.supply(`seed:${a}`) < 1 || ctx.supply(`seed:${b}`) < 1) return fail('supplies', t('noSeeds', { name: ctx.supply(`seed:${a}`) < 1 ? sa.name : sb.name }));
  const paid = ctx.pay(CROSS_COST, 'any', 'purchase');
  if (!paid.ok) return paid;
  ctx.takeSupply(`seed:${a}`, 1);
  ctx.takeSupply(`seed:${b}`, 1);
  const offer: CrossOffer = { parents: [a, b], options: [0, 1, 2].map((i) => child(ctx, sa, sb, i)), at: ctx.now };
  ctx.state.strains.offer = offer;
  ctx.bump('products');
  return ok(offer);
}

export function pickCross(ctx: SimCtx, option: number, name: string): SimResult<StrainId> {
  const offer = ctx.state.strains.offer;
  if (!offer) return fail('notFound');
  const pick = offer.options[option];
  if (!pick) return fail('invalid');
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > 24) return fail('invalid', t('invalidName'));
  ctx.state.strains.crosses += 1;
  const id = `x-${ctx.state.strains.crosses}` as StrainId;
  const def: StrainDef = { ...pick, id, name: clean, short: clean.split(' ')[0]!.slice(0, 12) };
  ctx.state.strains.custom[id] = def;
  ctx.state.strains.seen.push(id);
  ctx.state.strains.offer = null;
  ctx.addSupply(`seed:${id}`, 6);
  addXp(ctx, 60, 'breeding');
  ctx.bump('products', 'notebook');
  return ok(id);
}
