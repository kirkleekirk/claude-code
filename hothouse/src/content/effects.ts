/**
 * Effects: what a product does to the (fictional, cartoon) people of Halcyon Bay. Every effect is
 * comedic and invented. Sixteen base effects in four families, one Apex per family that can only be
 * reached by fusion while mixing, and two duds that drag a product's value down.
 */

export const EFFECT_FAMILIES = ['social', 'body', 'mind', 'weird'] as const;
export type EffectFamily = (typeof EFFECT_FAMILIES)[number];

export const BASE_EFFECT_IDS = [
  'chatty', 'giggles', 'bold', 'discoFeet',
  'sunkissed', 'mellowTide', 'couchGravity', 'electric',
  'laserFocus', 'dreamy', 'nightOwl', 'nostalgic',
  'thirdEye', 'shimmer', 'slowMo', 'glowtongue',
] as const;
export const APEX_EFFECT_IDS = ['mainCharacter', 'goldenHour', 'galaxyBrain', 'mermaidMode'] as const;
export const DUD_EFFECT_IDS = ['heebieJeebies', 'swampFunk'] as const;
export const EFFECT_IDS = [...BASE_EFFECT_IDS, ...APEX_EFFECT_IDS, ...DUD_EFFECT_IDS] as const;

export type BaseEffectId = (typeof BASE_EFFECT_IDS)[number];
export type ApexEffectId = (typeof APEX_EFFECT_IDS)[number];
export type DudEffectId = (typeof DUD_EFFECT_IDS)[number];
export type EffectId = (typeof EFFECT_IDS)[number];

/** Moods customers and districts ask for; effects carry one or two. */
export type Vibe = 'party' | 'chill' | 'focus' | 'creative' | 'night' | 'beach' | 'romance' | 'weird' | 'sleep';

export interface EffectDef {
  readonly id: EffectId;
  readonly name: string;
  readonly kind: 'base' | 'apex' | 'dud';
  /** Duds have no family. */
  readonly family: EffectFamily | null;
  /** Funny one-liner for chips and Notebook pages. */
  readonly line: string;
  /** Added to the product's value multiplier (duds subtract). */
  readonly value: number;
  readonly vibes: readonly Vibe[];
  /** sRGB hex for chips and the mixing reveal. */
  readonly color: string;
  /** Icon id from the shared UI icon set. */
  readonly icon: string;
}

const e = (d: EffectDef): EffectDef => d;

export const EFFECTS: Readonly<Record<EffectId, EffectDef>> = {
  // ── social ───────────────────────────────────────────────────────────────
  chatty: e({ id: 'chatty', name: 'Chatty', kind: 'base', family: 'social', value: 0.22, vibes: ['party'], color: '#FFD166', icon: 'chat',
    line: 'Tells the barista their whole life story. The barista did not ask.' }),
  giggles: e({ id: 'giggles', name: 'Giggles', kind: 'base', family: 'social', value: 0.25, vibes: ['party', 'chill'], color: '#FF9A3C', icon: 'smile',
    line: 'Everything is funny. The parking ticket is hilarious.' }),
  bold: e({ id: 'bold', name: 'Bold', kind: 'base', family: 'social', value: 0.3, vibes: ['party', 'night'], color: '#FF6B5E', icon: 'flame',
    line: 'Asks the DJ for a song. Gets it.' }),
  discoFeet: e({ id: 'discoFeet', name: 'Disco Feet', kind: 'base', family: 'social', value: 0.34, vibes: ['party', 'night'], color: '#FF3D8B', icon: 'disco',
    line: 'Feet start moving before the music does.' }),
  // ── body ─────────────────────────────────────────────────────────────────
  sunkissed: e({ id: 'sunkissed', name: 'Sunkissed', kind: 'base', family: 'body', value: 0.2, vibes: ['beach', 'chill'], color: '#FFB45A', icon: 'sun',
    line: 'Warm all over, like a lizard on a hot car hood.' }),
  mellowTide: e({ id: 'mellowTide', name: 'Mellow Tide', kind: 'base', family: 'body', value: 0.24, vibes: ['chill', 'beach'], color: '#17E0C8', icon: 'wave',
    line: 'Slow waves. No thoughts. Just tide.' }),
  couchGravity: e({ id: 'couchGravity', name: 'Couch Gravity', kind: 'base', family: 'body', value: 0.2, vibes: ['sleep', 'chill'], color: '#8E6BEA', icon: 'couch',
    line: 'The couch has developed its own weather system.' }),
  electric: e({ id: 'electric', name: 'Electric', kind: 'base', family: 'body', value: 0.36, vibes: ['party', 'focus'], color: '#7FD4FF', icon: 'bolt',
    line: 'Could jump-start a golf cart. Might try.' }),
  // ── mind ─────────────────────────────────────────────────────────────────
  laserFocus: e({ id: 'laserFocus', name: 'Laser Focus', kind: 'base', family: 'mind', value: 0.32, vibes: ['focus'], color: '#B8F54A', icon: 'target',
    line: 'Alphabetizes the spice rack. Then the neighbor’s.' }),
  dreamy: e({ id: 'dreamy', name: 'Dreamy', kind: 'base', family: 'mind', value: 0.26, vibes: ['creative', 'romance'], color: '#C9A7FF', icon: 'cloud',
    line: 'Daydreams in widescreen, with subtitles.' }),
  nightOwl: e({ id: 'nightOwl', name: 'Night Owl', kind: 'base', family: 'mind', value: 0.3, vibes: ['night', 'focus'], color: '#5A6CFF', icon: 'moon',
    line: 'Sunrise is a rumor started by roosters.' }),
  nostalgic: e({ id: 'nostalgic', name: 'Nostalgic', kind: 'base', family: 'mind', value: 0.22, vibes: ['romance', 'chill'], color: '#F2A1C4', icon: 'cassette',
    line: 'Misses 1987, whether or not they were there.' }),
  // ── weird ────────────────────────────────────────────────────────────────
  thirdEye: e({ id: 'thirdEye', name: 'Third Eye', kind: 'base', family: 'weird', value: 0.38, vibes: ['weird', 'creative'], color: '#2CC7B8', icon: 'eye',
    line: 'Sees auras. Yours is teal with a little gold.' }),
  shimmer: e({ id: 'shimmer', name: 'Shimmer', kind: 'base', family: 'weird', value: 0.3, vibes: ['weird', 'romance'], color: '#E9B8FF', icon: 'sparkle',
    line: 'The whole world gets a soft glitter filter.' }),
  slowMo: e({ id: 'slowMo', name: 'Slow-Mo', kind: 'base', family: 'weird', value: 0.28, vibes: ['weird', 'chill'], color: '#7FB6D8', icon: 'hourglass',
    line: 'Life plays at half speed, with a dramatic soundtrack.' }),
  glowtongue: e({ id: 'glowtongue', name: 'Glowtongue', kind: 'base', family: 'weird', value: 0.33, vibes: ['weird', 'party'], color: '#3DFFB0', icon: 'dolphin',
    line: 'Speaks fluent dolphin, briefly and with confidence.' }),
  // ── apex (fusion only) ───────────────────────────────────────────────────
  mainCharacter: e({ id: 'mainCharacter', name: 'Main Character', kind: 'apex', family: 'social', value: 1.25, vibes: ['party', 'romance'], color: '#FF2E9A', icon: 'crown',
    line: 'The whole boardwalk is their music video now.' }),
  goldenHour: e({ id: 'goldenHour', name: 'Golden Hour', kind: 'apex', family: 'body', value: 1.3, vibes: ['beach', 'chill', 'romance'], color: '#FFC23D', icon: 'sunset',
    line: 'Glowing from the inside, at any hour of the day.' }),
  galaxyBrain: e({ id: 'galaxyBrain', name: 'Galaxy Brain', kind: 'apex', family: 'mind', value: 1.35, vibes: ['focus', 'creative'], color: '#9C8CFF', icon: 'galaxy',
    line: 'Has figured out the parking garage. And the universe.' }),
  mermaidMode: e({ id: 'mermaidMode', name: 'Mermaid Mode', kind: 'apex', family: 'weird', value: 1.45, vibes: ['weird', 'beach'], color: '#12D6E0', icon: 'mermaid',
    line: 'Has never been more at one with the Gulf.' }),
  // ── duds ─────────────────────────────────────────────────────────────────
  heebieJeebies: e({ id: 'heebieJeebies', name: 'Heebie-Jeebies', kind: 'dud', family: null, value: -0.35, vibes: [], color: '#A3A0B5', icon: 'jitter',
    line: 'Convinced the pelicans are filing a report.' }),
  swampFunk: e({ id: 'swampFunk', name: 'Swamp Funk', kind: 'dud', family: null, value: -0.5, vibes: [], color: '#8A9A5B', icon: 'stink',
    line: 'Smells like a gator’s gym bag. Tastes like one, too.' }),
};

/** The Apex reached by fusing inside each family. */
export const APEX_OF: Readonly<Record<EffectFamily, ApexEffectId>> = {
  social: 'mainCharacter',
  body: 'goldenHour',
  mind: 'galaxyBrain',
  weird: 'mermaidMode',
};

/** Canonical order used for product keys and deterministic rule resolution. */
export const EFFECT_ORDER: Readonly<Record<EffectId, number>> = Object.fromEntries(EFFECT_IDS.map((id, i) => [id, i])) as Record<EffectId, number>;

export function sortEffects<T extends EffectId>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => EFFECT_ORDER[a] - EFFECT_ORDER[b]);
}

export function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && v in EFFECTS;
}
