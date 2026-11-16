import { Color, HemisphereLight, Vector3, type Scene } from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { nightFactor } from '@/core/clock';
import { clamp, clamp01, curve, damp, DEG, lerp, mod, smoothstep } from '@/core/math';
import { tunables } from '@/core/tunables';
import type { EnvState, QualityProfile, WeatherInput } from '../api';
import type { SharedUniforms } from '../shared';
import { BELT_COLOR, MOON_PATH, STORM_KEY, SUN_AZIMUTH, SUN_ELEVATION, TOD_KEYS, type TodKey } from './todKeys';

/** A keyframe with colours converted to linear RGB, ready to blend. */
interface Key {
  h: number;
  zenith: Color; mid: Color; horizon: Color; glow: Color; key: Color; fill: Color; ground: Color;
  shadowTint: Color; highTint: Color; cloudLit: Color; cloudDark: Color;
  glowI: number; belt: number; skyI: number; keyI: number; fillI: number; fogD: number; haze: number;
  exposure: number; saturation: number; contrast: number; tint: number; bloom: number; stars: number;
}

const COLOR_FIELDS = ['zenith', 'mid', 'horizon', 'glow', 'key', 'fill', 'ground', 'shadowTint', 'highTint', 'cloudLit', 'cloudDark'] as const;
const NUMBER_FIELDS = ['glowI', 'belt', 'skyI', 'keyI', 'fillI', 'fogD', 'haze', 'exposure', 'saturation', 'contrast', 'tint', 'bloom', 'stars'] as const;

function toKey(k: Omit<TodKey, 'h'> & { h?: number }): Key {
  const out = { h: k.h ?? 0 } as Key;
  for (const f of COLOR_FIELDS) out[f] = new Color(k[f]);
  for (const f of NUMBER_FIELDS) out[f] = k[f];
  return out;
}

function blendKeys(out: Key, a: Key, b: Key, t: number): void {
  for (const f of COLOR_FIELDS) out[f].lerpColors(a[f], b[f], t);
  for (const f of NUMBER_FIELDS) out[f] = lerp(a[f], b[f], t);
}

/** Direction toward a sky body from azimuth (clockwise from north) and elevation, in degrees. */
function skyDirection(out: Vector3, azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  const c = Math.cos(el);
  return out.set(Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c);
}

const cfg = tunables.group('env.global', {
  keyMul: { value: 1, min: 0, max: 3, step: 0.01 },
  fillMul: { value: 1, min: 0, max: 3, step: 0.01 },
  skyMul: { value: 1, min: 0, max: 3, step: 0.01 },
  fogMul: { value: 1, min: 0, max: 6, step: 0.01 },
  hazeMul: { value: 1, min: 0, max: 6, step: 0.01 },
  fogFalloff: { value: 0.032, min: 0.002, max: 0.2, step: 0.001 },
  fogMax: { value: 0.985, min: 0.5, max: 1, step: 0.005 },
  exposureMul: { value: 1, min: 0.2, max: 3, step: 0.01 },
  shadowRadius: { value: 2.2, min: 0, max: 8, step: 0.1 },
  shadowBias: { value: -0.0004, min: -0.01, max: 0.01, step: 0.0001 },
  shadowNormalBias: { value: 0.035, min: 0, max: 0.3, step: 0.005 },
  indoorExposure: { value: 2.2, min: 1, max: 6, step: 0.05 },
});

/**
 * Turns the clock and the weather into light: sun and moon paths, the key and fill lights, sky and
 * fog uniforms, and the grade parameters the final pass reads. All values are art-directed
 * keyframes (`todKeys.ts`), not astronomy.
 */
export class Environment {
  readonly sun: SunLight;
  readonly hemi: HemisphereLight;
  readonly state: EnvState;
  readonly weather: WeatherInput = { cloud: 0.25, rain: 0, storm: 0, haze: 0, wetness: 0, wind: 0.35 };

  private readonly keys: Key[];
  private readonly storm: Key;
  private readonly cur: Key;
  private readonly beltColor = new Color(BELT_COLOR);
  private readonly tmpColor = new Color();
  private windAngle = 0.6;
  private flash = 0;
  private hours = 18 + 40 / 60;

  constructor(scene: Scene, private readonly shared: SharedUniforms) {
    this.keys = TOD_KEYS.map(toKey);
    this.storm = toKey(STORM_KEY);
    this.cur = toKey(TOD_KEYS[0]!);

    this.sun = new SunLight(0xffffff, 3);
    this.sun.castShadow = true;
    scene.add(this.sun);
    this.hemi = new HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.state = {
      hours: this.hours,
      sunDir: new Vector3(0, 1, 0), moonDir: new Vector3(0, 1, 0), keyDir: new Vector3(0, 1, 0),
      keyColor: new Color(), keyIntensity: 1, sunElevation: 45,
      night: 0, wetness: 0, rain: 0, storm: 0, cloud: 0, lightning: 0,
      windX: 1, windZ: 0, windStrength: 0.3, exposure: 1, indoor: 0,
      grade: { saturation: 1, contrast: 1, shadowTint: new Color(), highTint: new Color(), tint: 0, bloom: 1 },
      cloudLit: new Color(), cloudDark: new Color(), stars: 0,
    };
    this.evaluate(0);
  }

  setTime(hours: number): void {
    this.hours = mod(hours, 24);
  }

  getTime(): number {
    return this.hours;
  }

  /** Trigger a lightning flash (0–1 strength). Decays on its own. */
  strike(strength = 1): void {
    this.flash = Math.max(this.flash, strength);
  }

  applyQuality(q: QualityProfile): void {
    const on = q.shadowMapSize > 0;
    this.sun.castShadow = on;
    if (on) {
      if (this.sun.shadow.mapSize.x !== q.shadowMapSize) {
        this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
      this.sun.shadow.camera.far = q.shadowDistance;
    }
  }

  /** Recompute everything for the current time and weather. `dt` only drives smoothing and wind. */
  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 6);
    this.windAngle += dt * 0.01;
    this.evaluate(dt);
  }

  private evaluate(dt: number): void {
    const h = this.hours;
    const s = this.state;
    const w = this.weather;
    const cur = this.cur;

    // ── keyframe blend ──────────────────────────────────────────────────────
    const keys = this.keys;
    let i1 = keys.findIndex((k) => k.h > h);
    if (i1 < 0) i1 = 0;
    const i0 = (i1 - 1 + keys.length) % keys.length;
    const a = keys[i0]!;
    const b = keys[i1]!;
    const span = mod(b.h - a.h, 24) || 24;
    blendKeys(cur, a, b, clamp01(mod(h - a.h, 24) / span));

    const night = nightFactor(h);
    // Overcast pulls toward the storm look; at night the storm key is darkened so it stays night.
    const stormMix = clamp01(w.cloud * 0.5 + w.storm * 0.5 + w.rain * 0.15);
    if (stormMix > 0.001) {
      const dayLevel = lerp(1, 0.16, night);
      const st = this.storm;
      for (const f of COLOR_FIELDS) {
        const dim = f === 'shadowTint' || f === 'highTint' ? 1 : dayLevel;
        cur[f].lerp(this.tmpColor.copy(st[f]).multiplyScalar(dim), stormMix);
      }
      cur.keyI = lerp(cur.keyI, st.keyI * dayLevel, stormMix);
      cur.fillI = lerp(cur.fillI, st.fillI * lerp(1, 0.5, night), stormMix);
      cur.glowI = lerp(cur.glowI, st.glowI, stormMix);
      cur.belt = lerp(cur.belt, 0, stormMix);
      cur.fogD = lerp(cur.fogD, st.fogD, stormMix);
      cur.haze = lerp(cur.haze, st.haze, stormMix);
      cur.saturation = lerp(cur.saturation, st.saturation, stormMix);
      cur.tint = lerp(cur.tint, st.tint, stormMix);
      cur.stars = lerp(cur.stars, 0, clamp01(stormMix * 1.6));
    }

    // ── sun, moon, key light ────────────────────────────────────────────────
    const sunEl = curve(SUN_ELEVATION, h);
    const sunAz = curve(SUN_AZIMUTH, h);
    skyDirection(s.sunDir, sunAz, sunEl);
    const mh = h < 12 ? h + 24 : h;
    let moonAz = 100;
    let moonEl = -20;
    for (let i = 1; i < MOON_PATH.length; i++) {
      const p0 = MOON_PATH[i - 1]!;
      const p1 = MOON_PATH[i]!;
      if (mh <= p1[0] || i === MOON_PATH.length - 1) {
        const t = clamp01((mh - p0[0]) / (p1[0] - p0[0]));
        moonAz = lerp(p0[1], p1[1], t);
        moonEl = lerp(p0[2], p1[2], t);
        break;
      }
    }
    skyDirection(s.moonDir, moonAz, moonEl);

    // The key light is the sun (or its afterglow) until it is well below the horizon, then the
    // moon. Intensity dips to zero at the switch so the direction change is never visible.
    const SWITCH = -9.5;
    const useSun = sunEl > SWITCH;
    const handover = smoothstep(0, 1.6, Math.abs(sunEl - SWITCH));
    if (useSun) skyDirection(s.keyDir, sunAz, Math.max(sunEl, 5));
    else skyDirection(s.keyDir, moonAz, Math.max(moonEl, 9));
    const moonUp = useSun ? 1 : smoothstep(-2, 6, moonEl);

    const flash = this.flash;
    s.keyColor.copy(cur.key);
    s.keyIntensity = cur.keyI * cfg.keyMul * handover * moonUp;
    s.sunElevation = sunEl;
    this.sun.color.copy(s.keyColor);
    this.sun.intensity = s.keyIntensity;
    this.sun.position.copy(s.keyDir);
    this.sun.shadow.radius = cfg.shadowRadius;
    this.sun.shadow.bias = cfg.shadowBias;
    this.sun.shadow.normalBias = cfg.shadowNormalBias;

    this.hemi.color.copy(cur.fill);
    this.hemi.groundColor.copy(cur.ground);
    this.hemi.intensity = cur.fillI * cfg.fillMul + flash * 2.5;
    if (flash > 0) this.hemi.color.lerp(this.tmpColor.set(0xdde6ff), clamp01(flash));

    // ── weather and wind ────────────────────────────────────────────────────
    s.hours = h;
    s.night = night;
    s.rain = w.rain;
    s.storm = w.storm;
    s.cloud = w.cloud;
    s.wetness = w.wetness;
    s.lightning = flash;
    s.windStrength = dt > 0 ? damp(s.windStrength, w.wind, 0.5, dt) : w.wind;
    s.windX = Math.cos(this.windAngle);
    s.windZ = Math.sin(this.windAngle);
    s.exposure = cur.exposure * cfg.exposureMul * lerp(1, cfg.indoorExposure, s.indoor);
    s.stars = cur.stars;
    s.cloudLit.copy(cur.cloudLit);
    s.cloudDark.copy(cur.cloudDark);
    const g = s.grade;
    g.saturation = cur.saturation;
    g.contrast = cur.contrast;
    g.shadowTint.copy(cur.shadowTint);
    g.highTint.copy(cur.highTint);
    g.tint = cur.tint;
    g.bloom = cur.bloom;

    // ── shared uniforms ─────────────────────────────────────────────────────
    const u = this.shared;
    const skyI = cur.skyI * cfg.skyMul * (1 + flash * 1.5);
    u.uSunDir.value.copy(s.sunDir);
    u.uMoonDir.value.copy(s.moonDir);
    u.uZenith.value.copy(cur.zenith).multiplyScalar(skyI);
    u.uMid.value.copy(cur.mid).multiplyScalar(skyI);
    u.uHorizon.value.copy(cur.horizon).multiplyScalar(skyI);
    // The warm halo follows the sun below the horizon, then fades out.
    const glowVis = smoothstep(-14, -2, sunEl);
    u.uSunGlow.value.copy(cur.glow).multiplyScalar(cur.glowI * glowVis * cfg.skyMul);
    u.uBelt.value.set(this.beltColor.r * skyI, this.beltColor.g * skyI, this.beltColor.b * skyI, cur.belt);
    const hazeBoost = 1 + w.haze * 1.8 + w.rain * 1.4;
    u.uFog.value.set(
      cur.fogD * cfg.fogMul * hazeBoost * lerp(1, 0.25, s.indoor),
      cfg.fogFalloff,
      cur.haze * cfg.hazeMul * hazeBoost * lerp(1, 0.2, s.indoor),
      cfg.fogMax,
    );
    u.uWeather.value.set(s.wetness, s.rain, night, flash);
    u.uWind.value.set(s.windX, s.windZ, clamp(s.windStrength, 0, 1.5), u.uWind.value.w + dt * (0.6 + s.windStrength));
  }
}
