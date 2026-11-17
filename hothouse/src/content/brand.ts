/**
 * Brand studio options. The player names the brand, builds a logo (shape × icon × palette × type)
 * and picks packaging. Indices into these arrays are saved; append only.
 */

export interface LogoShape {
  readonly id: string;
  readonly name: string;
}

export interface LogoPalette {
  readonly name: string;
  /** Background, foreground, accent (sRGB hex). */
  readonly colors: readonly [string, string, string];
}

export interface LogoType {
  readonly name: string;
  /** Font family the UI should use (bundled OFL fonts). */
  readonly font: string;
  readonly uppercase: boolean;
}

export interface PackagingDef {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  /** Value multiplier on every unit sold. */
  readonly value: number;
  /** Extra hype per sale of a loved product. */
  readonly hype: number;
}

export const LOGO_SHAPES: readonly LogoShape[] = [
  { id: 'badge', name: 'Badge' }, { id: 'shield', name: 'Crest' }, { id: 'diamond', name: 'Diamond' }, { id: 'sunburst', name: 'Sunburst' },
  { id: 'stamp', name: 'Postage stamp' }, { id: 'ticket', name: 'Ticket' }, { id: 'oval', name: 'Diner oval' }, { id: 'arch', name: 'Motel arch' },
];

export const LOGO_ICONS: readonly string[] = [
  'leaf', 'hibiscus', 'flamingo', 'gator', 'palm', 'sun', 'wave', 'moon', 'star', 'eye', 'crown', 'flame',
  'heart', 'pelican', 'shell', 'cassette', 'disco', 'bolt', 'dolphin', 'cherry', 'key', 'cactus', 'lighthouse', 'watering-can',
];

export const LOGO_PALETTES: readonly LogoPalette[] = [
  { name: 'Sunset', colors: ['#FF3D8B', '#FFF4E3', '#FF9A3C'] },
  { name: 'Lagoon', colors: ['#17E0C8', '#140B33', '#FFF4E3'] },
  { name: 'Neon Night', colors: ['#140B33', '#FF3D8B', '#17E0C8'] },
  { name: 'Citrus', colors: ['#B8F54A', '#1F1450', '#FFD166'] },
  { name: 'Retro', colors: ['#FF6B5E', '#FFF4E3', '#8FE3D8'] },
  { name: 'Gator', colors: ['#2F6B3A', '#FFD166', '#FFF4E3'] },
  { name: 'Cream', colors: ['#FFF4E3', '#140B33', '#FF3D8B'] },
  { name: 'Royal', colors: ['#3A2A7A', '#FFD166', '#FFF4E3'] },
];

export const LOGO_TYPES: readonly LogoType[] = [
  { name: 'Neon Script', font: 'Sacramento', uppercase: false },
  { name: 'Deco Caps', font: 'Limelight', uppercase: true },
  { name: 'Slab Stamp', font: 'Alfa Slab One', uppercase: true },
  { name: 'Diner Script', font: 'Pacifico', uppercase: false },
];

export const PACKAGING: readonly PackagingDef[] = [
  { id: 'pouch', name: 'Zip pouch', line: 'Matte, resealable, smells faintly of sunscreen.', value: 1, hype: 0 },
  { id: 'tin', name: 'Mint tin', line: 'Embossed lid, satisfying click. People keep the tins.', value: 1.04, hype: 0.1 },
  { id: 'box', name: 'Gift box', line: 'Tissue paper and a ribbon. Feels like a present.', value: 1.06, hype: 0.05 },
  { id: 'stickers', name: 'Sticker roll', line: 'Brown bags and a sticker on everything. Street cred.', value: 1.02, hype: 0.2 },
];

export const BRAND_NAME_FIRST: readonly string[] = [
  'Abuela’s', 'Ofelia’s', 'Hothouse', 'Halcyon', 'Bayside', 'Golden', 'Velvet', 'Lucky', 'Night', 'Pink', 'Sunset', 'Swamp',
];
export const BRAND_NAME_SECOND: readonly string[] = [
  'Gold', 'Garden', 'Bloom', 'Petals', 'Supply Co.', 'Society', 'Social Club', 'Botanicals', 'Greenhouse', 'Bouquet', 'Hibiscus', 'Flora',
];

export type StuntId = 'graffiti' | 'beachParty' | 'influencer' | 'billboard';

export interface StuntDef {
  readonly id: StuntId;
  readonly name: string;
  readonly line: string;
  readonly cost: number;
  readonly hype: number;
  readonly rank: number;
  /** Unlock id required beyond rank, if any. */
  readonly unlock: string | null;
  /** Seconds before it can run again. */
  readonly cooldown: number;
  readonly notoriety: number;
}

export const STUNTS: Readonly<Record<StuntId, StuntDef>> = {
  graffiti: { id: 'graffiti', name: 'Graffiti blitz', line: 'Your logo on every underpass by morning.', cost: 400, hype: 6, rank: 3, unlock: null, cooldown: 480, notoriety: 3 },
  beachParty: { id: 'beachParty', name: 'Sponsor a beach party', line: 'Free tote bags, a DJ and your name on the banner.', cost: 1500, hype: 12, rank: 4, unlock: null, cooldown: 960, notoriety: 1 },
  influencer: { id: 'influencer', name: 'Influencer collab', line: 'Sasha posts one photo. Zenith hates it.', cost: 2600, hype: 16, rank: 5, unlock: null, cooldown: 1440, notoriety: 1 },
  billboard: { id: 'billboard', name: 'Causeway billboard', line: 'Forty feet of your logo over the sunset drive.', cost: 6500, hype: 22, rank: 8, unlock: 'feature:billboards', cooldown: 2880, notoriety: 2 },
};
