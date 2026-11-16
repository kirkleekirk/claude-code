/**
 * Art-directed time-of-day keyframes. Colours are authored as sRGB hex and converted to linear at
 * load. The clock hour picks two neighbouring keys and blends every parameter.
 *
 * Reading guide: `key` is the sun or moon light, `fill` / `ground` are the hemisphere ambient that
 * colours shadows (kept violet on purpose), `fog*` control haze, the `grade` block feeds the final
 * colour pass. Tune live in the debug panel (`env.*` groups) and paste values back here.
 */

export interface TodKey {
  /** Clock hour, 0–24. */
  h: number;
  zenith: string;
  mid: string;
  horizon: string;
  /** Warm halo around the sun and its strength. */
  glow: string;
  glowI: number;
  /** Pink anti-solar belt strength, 0–1. */
  belt: number;
  /** Sky radiance multiplier (HDR). */
  skyI: number;
  key: string;
  keyI: number;
  fill: string;
  ground: string;
  fillI: number;
  /** Ground-fog density and distance-haze density (per metre). */
  fogD: number;
  haze: number;
  exposure: number;
  saturation: number;
  contrast: number;
  shadowTint: string;
  highTint: string;
  /** Split-toning strength, 0–1. */
  tint: number;
  bloom: number;
  stars: number;
  cloudLit: string;
  cloudDark: string;
}

const BELT = '#F6A3B5';
export const BELT_COLOR = BELT;

export const TOD_KEYS: readonly TodKey[] = [
  { // deep night
    h: 0, zenith: '#060920', mid: '#0C1038', horizon: '#1A1548', glow: '#3B3F9A', glowI: 0.15, belt: 0, skyI: 0.55,
    key: '#9FB4FF', keyI: 0.42, fill: '#39409A', ground: '#1B1440', fillI: 0.5,
    fogD: 0.0016, haze: 0.00038, exposure: 1.12, saturation: 1.12, contrast: 1.08,
    shadowTint: '#1B1466', highTint: '#FFC9E8', tint: 0.22, bloom: 1.25, stars: 1,
    cloudLit: '#2B2F6E', cloudDark: '#0D0F30',
  },
  { // pre-dawn
    h: 4.75, zenith: '#080C2A', mid: '#131A4C', horizon: '#2A2462', glow: '#5A4FB0', glowI: 0.2, belt: 0, skyI: 0.6,
    key: '#9FB4FF', keyI: 0.36, fill: '#3E459E', ground: '#1E1746', fillI: 0.52,
    fogD: 0.0024, haze: 0.00045, exposure: 1.12, saturation: 1.08, contrast: 1.05,
    shadowTint: '#1F1870', highTint: '#FFD0E0', tint: 0.2, bloom: 1.2, stars: 0.9,
    cloudLit: '#3A3C80', cloudDark: '#121438',
  },
  { // first light
    h: 5.75, zenith: '#2A3478', mid: '#7A6CB8', horizon: '#F2A58C', glow: '#FF9A6A', glowI: 0.55, belt: 0.25, skyI: 0.8,
    key: '#FFB08A', keyI: 0.25, fill: '#7D78CC', ground: '#3A2E5E', fillI: 0.85,
    fogD: 0.0042, haze: 0.0006, exposure: 1.08, saturation: 1.0, contrast: 0.98,
    shadowTint: '#3A2E8A', highTint: '#FFD9C0', tint: 0.22, bloom: 1.1, stars: 0.25,
    cloudLit: '#FFB59A', cloudDark: '#5A5596',
  },
  { // dawn
    h: 6.5, zenith: '#5B6FB8', mid: '#B7A1E0', horizon: '#FFC9A3', glow: '#FFB07A', glowI: 0.8, belt: 0.45, skyI: 1.0,
    key: '#FFB98A', keyI: 1.7, fill: '#8E86D8', ground: '#4A3C70', fillI: 1.05,
    fogD: 0.0046, haze: 0.00062, exposure: 1.02, saturation: 1.0, contrast: 0.97,
    shadowTint: '#4636A0', highTint: '#FFE0C0', tint: 0.2, bloom: 1.05, stars: 0,
    cloudLit: '#FFD0B0', cloudDark: '#8478C0',
  },
  { // early morning
    h: 7.5, zenith: '#4A86D8', mid: '#93C4EE', horizon: '#E8E4F0', glow: '#FFE2B8', glowI: 0.5, belt: 0.15, skyI: 1.05,
    key: '#FFE6C4', keyI: 2.7, fill: '#93B4F2', ground: '#57507A', fillI: 1.15,
    fogD: 0.0026, haze: 0.00042, exposure: 1.0, saturation: 1.04, contrast: 1.0,
    shadowTint: '#3B3C9A', highTint: '#FFF0D8', tint: 0.14, bloom: 0.95, stars: 0,
    cloudLit: '#FFF4E6', cloudDark: '#9FB0DC',
  },
  { // morning
    h: 9.5, zenith: '#2F84E0', mid: '#74BEF2', horizon: '#CFEFF7', glow: '#FFF3D6', glowI: 0.35, belt: 0, skyI: 1.1,
    key: '#FFF1DC', keyI: 3.3, fill: '#9CC8FF', ground: '#5E5A80', fillI: 1.2,
    fogD: 0.0012, haze: 0.00032, exposure: 0.98, saturation: 1.08, contrast: 1.03,
    shadowTint: '#2F3F9E', highTint: '#FFF6E0', tint: 0.12, bloom: 0.9, stars: 0,
    cloudLit: '#FFFFFF', cloudDark: '#A9BEE6',
  },
  { // midday
    h: 13, zenith: '#2A78D8', mid: '#69B4EE', horizon: '#E3F1F5', glow: '#FFFBEA', glowI: 0.3, belt: 0, skyI: 1.15,
    key: '#FFFBF0', keyI: 3.9, fill: '#B5D4FF', ground: '#6A6488', fillI: 1.25,
    fogD: 0.001, haze: 0.00036, exposure: 0.93, saturation: 0.98, contrast: 1.04,
    shadowTint: '#34449A', highTint: '#FFFBE8', tint: 0.1, bloom: 0.95, stars: 0,
    cloudLit: '#FFFFFF', cloudDark: '#B4C6E8',
  },
  { // golden hour begins
    h: 15, zenith: '#2F6CC8', mid: '#7FA8E0', horizon: '#FFD9A0', glow: '#FFC070', glowI: 0.75, belt: 0.2, skyI: 1.08,
    key: '#FFD08A', keyI: 3.5, fill: '#8E86E8', ground: '#5E4C82', fillI: 1.2,
    fogD: 0.0013, haze: 0.0004, exposure: 0.98, saturation: 1.08, contrast: 1.04,
    shadowTint: '#3F2E9E', highTint: '#FFE2A8', tint: 0.2, bloom: 1.05, stars: 0,
    cloudLit: '#FFE9C8', cloudDark: '#9A92D0',
  },
  { // golden
    h: 17.25, zenith: '#3B5FB0', mid: '#8C74C4', horizon: '#FF9A3C', glow: '#FF9440', glowI: 1.15, belt: 0.55, skyI: 1.02,
    key: '#FFB45A', keyI: 3.45, fill: '#7C6AE0', ground: '#553C7E', fillI: 1.15,
    fogD: 0.0016, haze: 0.00046, exposure: 1.0, saturation: 1.12, contrast: 1.05,
    shadowTint: '#3B1E8A', highTint: '#FFD9A0', tint: 0.28, bloom: 1.15, stars: 0,
    cloudLit: '#FFB070', cloudDark: '#7A62B4',
  },
  { // late gold: the title-card look (18:40)
    h: 18.67, zenith: '#34489C', mid: '#B05FB0', horizon: '#FF7A45', glow: '#FF7030', glowI: 1.35, belt: 0.7, skyI: 0.98,
    key: '#FF8A3A', keyI: 2.85, fill: '#6E58D0', ground: '#4A3078', fillI: 1.1,
    fogD: 0.002, haze: 0.00052, exposure: 1.04, saturation: 1.15, contrast: 1.06,
    shadowTint: '#3B1E7A', highTint: '#FFC890', tint: 0.32, bloom: 1.25, stars: 0,
    cloudLit: '#FF8A5A', cloudDark: '#6A4E9E',
  },
  { // sunset
    h: 19.4, zenith: '#27357F', mid: '#C2459B', horizon: '#FF6B5E', glow: '#FF5A48', glowI: 1.1, belt: 0.6, skyI: 0.9,
    key: '#FF6A50', keyI: 1.2, fill: '#5A48BC', ground: '#3E2A70', fillI: 1.05,
    fogD: 0.0022, haze: 0.00055, exposure: 1.08, saturation: 1.16, contrast: 1.06,
    shadowTint: '#35207C', highTint: '#FFB8A0', tint: 0.32, bloom: 1.3, stars: 0.05,
    cloudLit: '#FF6F7A', cloudDark: '#553F92',
  },
  { // dusk: magenta into teal, neon ignites
    h: 19.9, zenith: '#16245E', mid: '#7A3C9C', horizon: '#E0567A', glow: '#C0408A', glowI: 0.7, belt: 0.3, skyI: 0.8,
    key: '#FF6FA0', keyI: 0.3, fill: '#4A3FA8', ground: '#30225E', fillI: 0.95,
    fogD: 0.0022, haze: 0.00052, exposure: 1.12, saturation: 1.16, contrast: 1.07,
    shadowTint: '#2C1C74', highTint: '#FFB0D0', tint: 0.3, bloom: 1.35, stars: 0.3,
    cloudLit: '#C8508C', cloudDark: '#3A2E78',
  },
  { // blue hour
    h: 20.5, zenith: '#0D1440', mid: '#1F2A72', horizon: '#3C2E86', glow: '#5A3C9A', glowI: 0.3, belt: 0, skyI: 0.65,
    key: '#9FB4FF', keyI: 0.2, fill: '#3A3F98', ground: '#221850', fillI: 0.7,
    fogD: 0.0018, haze: 0.00042, exposure: 1.12, saturation: 1.14, contrast: 1.08,
    shadowTint: '#1F1870', highTint: '#FFC0E0', tint: 0.25, bloom: 1.3, stars: 0.7,
    cloudLit: '#3F3F8E', cloudDark: '#141642',
  },
  { // night
    h: 22, zenith: '#070A24', mid: '#0E1240', horizon: '#1D1650', glow: '#3B3F9A', glowI: 0.15, belt: 0, skyI: 0.55,
    key: '#9FB4FF', keyI: 0.42, fill: '#39409A', ground: '#1B1440', fillI: 0.5,
    fogD: 0.0016, haze: 0.00038, exposure: 1.12, saturation: 1.12, contrast: 1.08,
    shadowTint: '#1B1466', highTint: '#FFC9E8', tint: 0.22, bloom: 1.25, stars: 1,
    cloudLit: '#2B2F6E', cloudDark: '#0D0F30',
  },
];

/** Overcast / storm look that weather blends toward. */
export const STORM_KEY: Omit<TodKey, 'h'> = {
  zenith: '#2A3836', mid: '#44544C', horizon: '#5C6A5E', glow: '#8A9A84', glowI: 0.15, belt: 0, skyI: 0.7,
  key: '#C9D6C8', keyI: 0.9, fill: '#6A7C7E', ground: '#3A4244', fillI: 1.0,
  fogD: 0.0048, haze: 0.0009, exposure: 1.05, saturation: 0.86, contrast: 1.06,
  shadowTint: '#1E3040', highTint: '#D8F0D8', tint: 0.25, bloom: 1.0, stars: 0,
  cloudLit: '#7C8A82', cloudDark: '#2C3838',
};

/** Sun elevation in degrees by clock hour (art-directed: low for the whole golden window). */
export const SUN_ELEVATION: ReadonlyArray<readonly [number, number]> = [
  [0, -48], [4.5, -22], [5.75, -7], [6.25, 0.5], [7.5, 15], [9, 34], [11, 58], [13, 70], [14, 52],
  [15, 27], [16, 21], [17, 15.5], [18, 10.5], [18.67, 7.2], [19, 4.6], [19.4, 0.4], [19.75, -4], [20.5, -12], [22, -34], [24, -48],
];

/** Sun azimuth in degrees clockwise from north (90 = east, 180 = south, 270 = due west). */
export const SUN_AZIMUTH: ReadonlyArray<readonly [number, number]> = [
  [0, 20], [5.75, 84], [6.25, 92], [9, 116], [11, 142], [13, 182], [15, 236], [17, 256], [18.67, 266],
  [19.4, 270], [20.5, 278], [24, 380],
];

/** Moon path: `[hour, azimuth, elevation]`, hours run 18 → 31 (i.e. 7 AM next day). */
export const MOON_PATH: ReadonlyArray<readonly [number, number, number]> = [
  [18, 80, -14], [19.5, 96, -2], [20.5, 108, 12], [23, 148, 40], [25, 190, 52], [28, 240, 30], [30, 262, 6], [30.6, 266, -4], [31, 270, -10],
];
