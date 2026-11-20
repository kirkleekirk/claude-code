import type { Rng } from '@/core/rng';

/** Colour sets per architectural family (sRGB). Pastel walls, crisp trim, one saturated accent. */
export interface Palette {
  wall: string;
  trim: string;
  accent: string;
  neon: string;
  awning: string;
  roof: string;
}

const DECO_WALLS = ['#F7C3D2', '#BDE8D8', '#FBE5A0', '#D8CCF3', '#FFD1B5', '#A9E3EB', '#F6F2EA', '#F9B6A6', '#C9F0C0', '#FFE7C9'];
const DECO_TRIMS = ['#FFFFFF', '#FFF7EC', '#F4EFE6'];
const DECO_ACCENTS = ['#21B7AA', '#FF6FA3', '#3E8E7E', '#E9A93C', '#6F5BD8', '#F2665A', '#2E86C1'];
const NEONS = ['#FF3D8B', '#17E0C8', '#FFD166', '#B8F54A', '#A77BFF', '#FF6B5E', '#5FB8FF', '#FF9A3C'];
const AWNINGS = ['#FF6B5E', '#17B8A8', '#FF8FB1', '#2E86C1', '#F2B33D', '#6F5BD8', '#3E8E7E'];

const MED_WALLS = ['#F2E1C8', '#EBCBA4', '#F6EADB', '#E9BC9E', '#F1D6B4', '#F4E4D0', '#E6C3A8'];
const MED_ROOFS = ['#C9673F', '#B85A3A', '#D07A4E', '#A9533A'];
const MED_ACCENTS = ['#2F6F5E', '#6B3F2A', '#1F4E79', '#3E8E7E'];

const SHACK_WALLS = ['#3FD0C9', '#FFD166', '#FF6B5E', '#7BD389', '#FF8FB1', '#5FB8FF', '#F6F2EA', '#B39DFF'];
const SHACK_ROOFS = ['#E8E2D6', '#C8D3D9', '#D97A5A', '#6E8F9E'];

const TOWER_GLASS = ['#5E8FA8', '#7A9AB5', '#4FA3A5', '#8DA6BB', '#6B7FA0', '#8A8F9C', '#A0B6C8'];
const TOWER_TRIM = ['#E6E8EA', '#C9CDD2', '#2B2F3A', '#D8CFC2'];

const APT_WALLS = ['#F4EFE6', '#E9E0F2', '#E2EEF0', '#F6E3D6', '#E8F1E2', '#F3E7C8'];

export function decoPalette(rng: Rng): Palette {
  return {
    wall: rng.pick(DECO_WALLS), trim: rng.pick(DECO_TRIMS), accent: rng.pick(DECO_ACCENTS), neon: rng.pick(NEONS),
    awning: rng.pick(AWNINGS), roof: '#B9B2A8',
  };
}

export function medPalette(rng: Rng): Palette {
  return {
    wall: rng.pick(MED_WALLS), trim: '#FBF6EE', accent: rng.pick(MED_ACCENTS), neon: rng.pick(NEONS),
    awning: rng.pick(AWNINGS), roof: rng.pick(MED_ROOFS),
  };
}

export function shackPalette(rng: Rng): Palette {
  return {
    wall: rng.pick(SHACK_WALLS), trim: '#FFFFFF', accent: rng.pick(DECO_ACCENTS), neon: rng.pick(NEONS),
    awning: rng.pick(AWNINGS), roof: rng.pick(SHACK_ROOFS),
  };
}

export function towerPalette(rng: Rng): Palette {
  return {
    wall: rng.pick(TOWER_GLASS), trim: rng.pick(TOWER_TRIM), accent: rng.pick(DECO_ACCENTS), neon: rng.pick(['#FFFFFF', '#17E0C8', '#FF3D8B', '#7FB6FF']),
    awning: rng.pick(AWNINGS), roof: '#8E9096',
  };
}

export function aptPalette(rng: Rng): Palette {
  return {
    wall: rng.pick(APT_WALLS), trim: '#FFFFFF', accent: rng.pick([...DECO_ACCENTS, ...MED_ACCENTS]), neon: rng.pick(NEONS),
    awning: rng.pick(AWNINGS), roof: '#B5AFA6',
  };
}

/** Original hotel names. Nothing here is a real brand. */
export const HOTEL_NAMES = [
  'The Paloma', 'Coral Crest', 'Hotel Mirabelle', 'The Seahorse', 'Marquesa', 'Hotel Avalon', 'The Palmetto',
  'Hotel Solana', 'The Moonbeam', 'Hotel Esmeralda', 'The Halcyon', 'Ocean Rose', 'The Sandcastle', 'Hotel Orchid',
  'Cabana Club', 'The Pelican Arms', 'Hotel Sirena', 'The Gilded Gull', 'Aqua Vista', 'The Starfish', 'Hotel Celeste',
  'The Coquina', 'Hotel Bijou', 'The Driftwood', 'Sea Grape Inn', 'Hotel Lumière', 'The Conch Pearl', 'Hotel Calypso',
  'The Royal Palm', 'Hotel Flamenco', 'The Sunset Arms', 'Casa Marina', 'Hotel Primavera', 'The Tide Pool',
];

export const BLADE_NAMES = [
  'PALOMA', 'CORAL', 'AVALON', 'SOLANA', 'MOONBEAM', 'SIRENA', 'CALYPSO', 'BIJOU', 'CELESTE', 'STARFISH', 'MARINA',
  'LUMIÈRE', 'ORCHID', 'TIDES', 'CORONADO', 'NEPTUNE', 'AURORA',
];

export const SHOP_NAMES = [
  'Wax On', 'Salt & Sun', 'The Sunburn Shoppe', 'Shell Shock Souvenirs', 'Mango Tango Smoothies', 'Two Scoops Ahoy',
  'Beach Please', 'Fresh Prints Tees', 'Tan Lines', 'Pier Pressure Arcade', 'Slice of Heaven', 'Big Kahuna Rentals',
  'Neon Nights Arcade', 'Shark Bait Tackle', 'Wave Riders', 'Gelato Bueno', 'Mojito Mojo', 'Paradise Pawn',
  'Vitamin Sea', 'Flamingle Bar', 'Lucky Gator Lotto', 'Hurricane Hair', 'Nailed It Nails', 'Pastelito Palace',
  'Cafecito Corner', 'Croqueta Queen', 'Sunny Side Diner', 'Reel Deal Charters', 'Coconut Cuts', 'Palm Reader',
  'Bodega Brava', 'Dolphin Laundry', 'Lagoon Liquors', 'Tropic Tattoo', 'Boca Chica Bikes', 'Sandal Scandal',
];

export const PARAPET_WORDS = ['HOTEL', 'COCKTAILS', 'VACANCY', 'OCEAN VIEW', 'POOL', 'ROOMS', 'LOUNGE', 'BAR'];

/** Ads for billboards: text and the colours they want. All parodies of no one in particular. */
export const BILLBOARDS: ReadonlyArray<{ text: string; sub: string; bg: string; fg: string }> = [
  { text: 'BUSTED? DON’T PANIC.', sub: 'Sy Pinkerton · Attorney at Law', bg: '#FF3D8B', fg: '#FFF4E3' },
  { text: 'BREATHE. BUY.', sub: 'Zenith Wellness', bg: '#F4F0EA', fg: '#2B2F3A' },
  { text: 'LET US SOD YOU', sub: 'Sod Almighty Garden & Feed', bg: '#3E8E7E', fg: '#FBE5A0' },
  { text: 'EIGHTEEN HOLES. ONE GATOR.', sub: 'Gator Golf · Palmetto Flats', bg: '#B8F54A', fg: '#140B33' },
  { text: 'YOUR CAR IS DIRTY', sub: 'Sudsy Flamingo Car Wash', bg: '#FFB3C8', fg: '#140B33' },
  { text: 'HALCYON HERONS', sub: 'Home games all season', bg: '#2E86C1', fg: '#FFFFFF' },
  { text: 'TACOS AT 3 AM', sub: 'Taco Tsunami · Neon Strand', bg: '#FF9A3C', fg: '#140B33' },
];
