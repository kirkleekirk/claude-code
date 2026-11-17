import type { AdditiveId } from './additives';
import type { EffectId } from './effects';

/**
 * The transformation table. A rule says: when this additive is mixed into a product that already
 * has `from`, that effect becomes `to` (or is removed when `to` is null). All rules of one mix apply
 * simultaneously; see `sim/systems/mixing.ts` for fusion and the cap. 71 rules.
 *
 * Design notes for the learnable patterns (also in BALANCE.md):
 *  - citrus sharpens body effects into mind effects;
 *  - sweet softens loud or sharp effects into mellow or giggly ones;
 *  - spicy turns mellow effects loud;
 *  - buzz wakes sleepy effects up;
 *  - briny cancels duds and calms extremes;
 *  - glow pushes effects into the weird family, and Mystery Bait can rot a product.
 */

export interface MixRule {
  /** `${additive}:${from}` */
  readonly id: string;
  readonly additive: AdditiveId;
  readonly from: EffectId;
  /** `null` removes the effect. */
  readonly to: EffectId | null;
}

type RuleRow = readonly [from: EffectId, to: EffectId | null];

const TABLE: Readonly<Record<AdditiveId, readonly RuleRow[]>> = {
  keyLime: [['couchGravity', 'laserFocus'], ['mellowTide', 'nightOwl'], ['sunkissed', 'nostalgic'], ['dreamy', 'laserFocus'], ['giggles', 'chatty']],
  bloodOrange: [['electric', 'nightOwl'], ['couchGravity', 'dreamy'], ['slowMo', 'nostalgic'], ['laserFocus', 'bold'], ['heebieJeebies', 'giggles']],
  guava: [['bold', 'giggles'], ['electric', 'mellowTide'], ['laserFocus', 'dreamy'], ['thirdEye', 'shimmer'], ['nightOwl', 'couchGravity']],
  honey: [['electric', 'sunkissed'], ['bold', 'chatty'], ['nightOwl', 'dreamy'], ['discoFeet', 'giggles'], ['laserFocus', 'mellowTide']],
  taffy: [['chatty', 'giggles'], ['sunkissed', 'dreamy'], ['nightOwl', 'nostalgic'], ['slowMo', 'couchGravity'], ['thirdEye', 'dreamy']],
  gatorTears: [['mellowTide', 'electric'], ['couchGravity', 'discoFeet'], ['dreamy', 'chatty'], ['slowMo', 'electric'], ['nostalgic', 'bold']],
  pinkPeppercorn: [['mellowTide', 'discoFeet'], ['couchGravity', 'electric'], ['sunkissed', 'bold'], ['nightOwl', 'electric'], ['shimmer', 'glowtongue']],
  cafecito: [['couchGravity', 'laserFocus'], ['dreamy', 'nightOwl'], ['slowMo', 'chatty'], ['mellowTide', 'electric'], ['sunkissed', 'laserFocus']],
  volt: [['couchGravity', 'bold'], ['slowMo', 'discoFeet'], ['dreamy', 'laserFocus'], ['mellowTide', 'chatty'], ['nightOwl', 'laserFocus']],
  pickleBrine: [['heebieJeebies', null], ['electric', 'mellowTide'], ['discoFeet', 'sunkissed'], ['bold', 'mellowTide'], ['nightOwl', 'dreamy']],
  seaSalt: [['swampFunk', null], ['mellowTide', 'sunkissed'], ['electric', 'mellowTide'], ['glowtongue', 'chatty'], ['thirdEye', 'dreamy']],
  moonJelly: [['nightOwl', 'slowMo'], ['mellowTide', 'shimmer'], ['laserFocus', 'thirdEye'], ['chatty', 'glowtongue'], ['couchGravity', 'slowMo']],
  fireflySugar: [['discoFeet', 'glowtongue'], ['dreamy', 'thirdEye'], ['nightOwl', 'slowMo'], ['electric', 'thirdEye'], ['bold', 'glowtongue']],
  mysteryBait: [['shimmer', 'thirdEye'], ['mellowTide', 'swampFunk'], ['sunkissed', 'glowtongue'], ['laserFocus', 'heebieJeebies'], ['dreamy', 'shimmer'], ['giggles', 'thirdEye']],
};

export const MIX_RULES: readonly MixRule[] = (Object.keys(TABLE) as AdditiveId[]).flatMap((additive) =>
  TABLE[additive].map(([from, to]) => ({ id: `${additive}:${from}`, additive, from, to })),
);

const BY_PAIR = new Map<string, MixRule>(MIX_RULES.map((r) => [r.id, r]));

/** The rule for an additive acting on an effect, if any. */
export function ruleFor(additive: AdditiveId, from: EffectId): MixRule | undefined {
  return BY_PAIR.get(`${additive}:${from}`);
}

export function rulesOf(additive: AdditiveId): readonly MixRule[] {
  return MIX_RULES.filter((r) => r.additive === additive);
}

// ── harmonies ───────────────────────────────────────────────────────────────

export const HARMONY_IDS = [
  'boardwalkSpecial', 'nightShift', 'sundayPorch', 'galleryOpening', 'swampProphet',
  'bigNightOut', 'beachBrain', 'retroRomance', 'stormChaser', 'coastRoyalty',
] as const;
export type HarmonyId = (typeof HARMONY_IDS)[number];

export interface HarmonyDef {
  readonly id: HarmonyId;
  readonly name: string;
  /** All of these effects must be present. Empty for special rules (see `apexCount`). */
  readonly effects: readonly EffectId[];
  /** Alternatively: at least this many Apex effects. */
  readonly apexCount?: number;
  readonly multiplier: number;
  /** Notebook sticker id (UI art). */
  readonly sticker: string;
  readonly line: string;
}

export const HARMONIES: Readonly<Record<HarmonyId, HarmonyDef>> = {
  boardwalkSpecial: { id: 'boardwalkSpecial', name: 'Boardwalk Special', effects: ['giggles', 'discoFeet', 'sunkissed'], multiplier: 1.35, sticker: 'sticker-skate',
    line: 'Tastes like sunscreen, funnel cake and a bad decision on roller skates.' },
  nightShift: { id: 'nightShift', name: 'Night Shift', effects: ['nightOwl', 'laserFocus', 'electric'], multiplier: 1.3, sticker: 'sticker-owl',
    line: 'For people who clock in when the neon does.' },
  sundayPorch: { id: 'sundayPorch', name: 'Sunday Porch', effects: ['mellowTide', 'couchGravity', 'nostalgic'], multiplier: 1.3, sticker: 'sticker-rocker',
    line: 'A ceiling fan, a radio ball game, and nowhere to be.' },
  galleryOpening: { id: 'galleryOpening', name: 'Gallery Opening', effects: ['chatty', 'dreamy', 'shimmer'], multiplier: 1.3, sticker: 'sticker-frame',
    line: 'Has opinions about the negative space. Shares them.' },
  swampProphet: { id: 'swampProphet', name: 'Swamp Prophet', effects: ['thirdEye', 'slowMo', 'dreamy'], multiplier: 1.4, sticker: 'sticker-gator-eye',
    line: 'The mangroves have a message. It is mostly about humidity.' },
  bigNightOut: { id: 'bigNightOut', name: 'Big Night Out', effects: ['bold', 'discoFeet', 'chatty'], multiplier: 1.35, sticker: 'sticker-disco',
    line: 'Starts at the Chrome Pelican. Ends on a yacht, somehow.' },
  beachBrain: { id: 'beachBrain', name: 'Beach Brain', effects: ['sunkissed', 'laserFocus', 'glowtongue'], multiplier: 1.4, sticker: 'sticker-dolphin',
    line: 'Solves a crossword with a dolphin. The dolphin wins.' },
  retroRomance: { id: 'retroRomance', name: 'Retro Romance', effects: ['nostalgic', 'dreamy', 'giggles'], multiplier: 1.3, sticker: 'sticker-cassette',
    line: 'Slow dance in a roller rink, 1986, all over again.' },
  stormChaser: { id: 'stormChaser', name: 'Storm Chaser', effects: ['electric', 'slowMo', 'thirdEye'], multiplier: 1.35, sticker: 'sticker-lightning',
    line: 'Watches the lightning in slow motion and takes notes.' },
  coastRoyalty: { id: 'coastRoyalty', name: 'Coast Royalty', effects: [], apexCount: 2, multiplier: 1.6, sticker: 'sticker-crown',
    line: 'Two Apex effects in one bag. Abuela would frame it.' },
};
