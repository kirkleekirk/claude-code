import type { WeatherInput } from '../api';

/** Named looks the weather system blends between. The finale's hurricane is `storm` pushed further. */
export const WEATHER_IDS = ['clear', 'hazy', 'overcast', 'rain', 'storm', 'hurricane'] as const;
export type WeatherId = (typeof WEATHER_IDS)[number];

export const WEATHER_PRESETS: Record<WeatherId, WeatherInput> = {
  clear: { cloud: 0.22, rain: 0, storm: 0, haze: 0, wetness: 0, wind: 0.32 },
  hazy: { cloud: 0.3, rain: 0, storm: 0, haze: 0.85, wetness: 0, wind: 0.2 },
  overcast: { cloud: 0.82, rain: 0, storm: 0.15, haze: 0.35, wetness: 0, wind: 0.5 },
  rain: { cloud: 0.9, rain: 0.75, storm: 0.35, haze: 0.4, wetness: 1, wind: 0.65 },
  storm: { cloud: 1, rain: 1, storm: 1, haze: 0.5, wetness: 1, wind: 1 },
  hurricane: { cloud: 1, rain: 1, storm: 1, haze: 0.8, wetness: 1, wind: 1.5 },
};

export function isWeatherId(v: string | null | undefined): v is WeatherId {
  return !!v && (WEATHER_IDS as readonly string[]).includes(v);
}

/** Copy a preset into `out` (no allocation). */
export function setWeather(out: WeatherInput, id: WeatherId): WeatherInput {
  const p = WEATHER_PRESETS[id];
  out.cloud = p.cloud;
  out.rain = p.rain;
  out.storm = p.storm;
  out.haze = p.haze;
  out.wetness = p.wetness;
  out.wind = p.wind;
  return out;
}
