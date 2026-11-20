import type { Settings, SettingId, SettingValue } from '@/save';
import type { QualityProfile, QualityTier } from './api';

type GfxValues = { [K in SettingId]?: SettingValue<K> };

/** What each preset writes into the individual graphics settings. */
export const PRESET_SETTINGS: Record<'low' | 'medium' | 'high' | 'ultra', GfxValues> = {
  low: {
    'gfx.resolutionScale': 75, 'gfx.shadows': 'low', 'gfx.reflections': 'off', 'gfx.ambientOcclusion': 'off',
    'gfx.effects': 'low', 'gfx.drawDistance': 'low', 'gfx.motionBlur': false, 'gfx.lensEffects': false,
  },
  medium: {
    'gfx.resolutionScale': 90, 'gfx.shadows': 'medium', 'gfx.reflections': 'low', 'gfx.ambientOcclusion': 'low',
    'gfx.effects': 'medium', 'gfx.drawDistance': 'medium', 'gfx.motionBlur': true, 'gfx.lensEffects': true,
  },
  high: {
    'gfx.resolutionScale': 100, 'gfx.shadows': 'high', 'gfx.reflections': 'high', 'gfx.ambientOcclusion': 'high',
    'gfx.effects': 'high', 'gfx.drawDistance': 'high', 'gfx.motionBlur': true, 'gfx.lensEffects': true,
  },
  ultra: {
    'gfx.resolutionScale': 100, 'gfx.shadows': 'ultra', 'gfx.reflections': 'high', 'gfx.ambientOcclusion': 'high',
    'gfx.effects': 'high', 'gfx.drawDistance': 'high', 'gfx.motionBlur': true, 'gfx.lensEffects': true,
  },
};

export function applyPreset(settings: Settings, preset: keyof typeof PRESET_SETTINGS): void {
  const values = PRESET_SETTINGS[preset];
  for (const id of Object.keys(values) as SettingId[]) {
    settings.set(id, values[id] as never);
  }
}

const SHADOW = {
  off: { size: 0, distance: 0 },
  low: { size: 1024, distance: 110 },
  medium: { size: 1536, distance: 170 },
  high: { size: 2048, distance: 230 },
  ultra: { size: 3072, distance: 300 },
} as const;

const DRAW = { low: 170, medium: 260, high: 360 } as const;

/** Bare-minimum profile for automated logic runs under software rendering. */
const POTATO: QualityProfile = {
  tier: 'potato', resolutionScale: 0.5, maxPixelRatio: 1, msaa: 0, shadowMapSize: 0, shadowDistance: 0,
  reflectionScale: 0, ao: 'off', bloom: false, godRays: false, heatHaze: false, motionBlur: false,
  filmGrain: false, lensEffects: false, detailDistance: 140, effectsDensity: 0.25, post: false,
};

/** Fixed profiles for `?gfx=` and for the benchmark. */
export function profileForTier(tier: QualityTier): QualityProfile {
  if (tier === 'potato') return { ...POTATO };
  const s = PRESET_SETTINGS[tier];
  return build(tier, {
    scale: (s['gfx.resolutionScale'] ?? 100) / 100,
    shadows: s['gfx.shadows'] ?? 'high',
    reflections: s['gfx.reflections'] ?? 'high',
    ao: s['gfx.ambientOcclusion'] ?? 'high',
    effects: s['gfx.effects'] ?? 'high',
    draw: s['gfx.drawDistance'] ?? 'high',
    motionBlur: s['gfx.motionBlur'] ?? true,
    filmGrain: tier !== 'low',
    lens: s['gfx.lensEffects'] ?? true,
  });
}

/** The profile described by the player's individual graphics settings. */
export function profileFromSettings(settings: Settings): QualityProfile {
  const effects = settings.get('gfx.effects');
  const tier: QualityTier = effects === 'low' ? 'low' : effects === 'medium' ? 'medium' : settings.get('gfx.shadows') === 'ultra' ? 'ultra' : 'high';
  return build(tier, {
    scale: settings.get('gfx.resolutionScale') / 100,
    shadows: settings.get('gfx.shadows'),
    reflections: settings.get('gfx.reflections'),
    ao: settings.get('gfx.ambientOcclusion'),
    effects,
    draw: settings.get('gfx.drawDistance'),
    motionBlur: settings.get('gfx.motionBlur'),
    filmGrain: settings.get('gfx.filmGrain'),
    lens: settings.get('gfx.lensEffects'),
  });
}

interface BuildInput {
  scale: number;
  shadows: keyof typeof SHADOW;
  reflections: 'off' | 'low' | 'high';
  ao: 'off' | 'low' | 'high';
  effects: 'low' | 'medium' | 'high';
  draw: keyof typeof DRAW;
  motionBlur: boolean;
  filmGrain: boolean;
  lens: boolean;
}

function build(tier: QualityTier, i: BuildInput): QualityProfile {
  const sh = SHADOW[i.shadows];
  return {
    tier,
    resolutionScale: i.scale,
    maxPixelRatio: tier === 'ultra' ? 2 : tier === 'high' ? 1.5 : tier === 'medium' ? 1.25 : 1,
    msaa: i.effects === 'high' ? 4 : i.effects === 'medium' ? 2 : 0,
    shadowMapSize: sh.size,
    shadowDistance: sh.distance,
    reflectionScale: i.reflections === 'high' ? 0.5 : i.reflections === 'low' ? 0.33 : 0,
    ao: i.ao,
    bloom: true,
    godRays: i.effects !== 'low',
    heatHaze: i.effects === 'high',
    motionBlur: i.motionBlur,
    filmGrain: i.filmGrain,
    lensEffects: i.lens,
    detailDistance: DRAW[i.draw],
    effectsDensity: i.effects === 'high' ? 1 : i.effects === 'medium' ? 0.7 : 0.4,
    post: true,
  };
}

export function isQualityTier(v: string | null): v is QualityTier {
  return v === 'potato' || v === 'low' || v === 'medium' || v === 'high' || v === 'ultra';
}
