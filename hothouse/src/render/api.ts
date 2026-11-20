import type { Color, Vector3 } from 'three';

/** Read-only snapshot of the environment for the current frame. Other modules may read, never write. */
export interface EnvState {
  /** Clock hours, 0–24. */
  hours: number;
  /** Unit vector toward the sun; can point below the horizon. */
  readonly sunDir: Vector3;
  readonly moonDir: Vector3;
  /** Unit vector toward whichever body lights the scene (sun, afterglow or moon). */
  readonly keyDir: Vector3;
  readonly keyColor: Color;
  keyIntensity: number;
  /** Degrees above the horizon. */
  sunElevation: number;
  /** 0 = day, 1 = night. Drives neon, lit windows, street lamps, headlights. */
  night: number;
  /** 0–1 surface wetness (lags behind rain, dries slowly). */
  wetness: number;
  rain: number;
  storm: number;
  cloud: number;
  /** 0–1 lightning flash this frame. */
  lightning: number;
  windX: number;
  windZ: number;
  windStrength: number;
  /** Linear exposure multiplier requested by the art direction (before eye adaptation). */
  exposure: number;
  /** 0 outdoors … 1 inside an interior; raises exposure and mutes the outside. */
  indoor: number;
  readonly grade: GradeState;
  readonly cloudLit: Color;
  readonly cloudDark: Color;
  stars: number;
}

export interface GradeState {
  saturation: number;
  contrast: number;
  readonly shadowTint: Color;
  readonly highTint: Color;
  /** Split-toning strength 0–1. */
  tint: number;
  bloom: number;
}

export interface WeatherInput {
  /** 0–1 cloud cover. */
  cloud: number;
  rain: number;
  storm: number;
  /** Extra haze 0–1 (humid, hazy days). */
  haze: number;
  wetness: number;
  /** Wind strength 0–1. */
  wind: number;
}

export type QualityTier = 'potato' | 'low' | 'medium' | 'high' | 'ultra';

/** Resolved graphics quality: what the renderer actually does this frame. */
export interface QualityProfile {
  tier: QualityTier;
  /** Internal resolution multiplier applied on top of device pixel ratio. */
  resolutionScale: number;
  /** Cap on device pixel ratio. */
  maxPixelRatio: number;
  msaa: number;
  /** Shadow cascade tile size; 0 disables sun shadows. */
  shadowMapSize: number;
  shadowDistance: number;
  /** Planar reflection resolution scale; 0 disables it. */
  reflectionScale: number;
  ao: 'off' | 'low' | 'high';
  bloom: boolean;
  godRays: boolean;
  heatHaze: boolean;
  motionBlur: boolean;
  filmGrain: boolean;
  lensEffects: boolean;
  /** Radius in metres within which detailed chunks, props and crowds are shown. */
  detailDistance: number;
  /** Multiplier for particle counts and effect density. */
  effectsDensity: number;
  post: boolean;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  width: number;
  height: number;
  pixelRatio: number;
}
