/**
 * Localization-ready strings and number formatting.
 *
 * Every player-facing string lives in a table registered with `defineStrings`. Sentences are never
 * concatenated: use `{placeholders}`. Plurals use `key_one` / `key_other` (via `Intl.PluralRules`).
 *
 * ```ts
 * const t = defineStrings('hud', { cash: 'Cash', bagCount_one: '{n} unit', bagCount_other: '{n} units' });
 * t('cash');  t.n('bagCount', 3, { n: 3 });
 * ```
 */

export type StringParams = Record<string, string | number>;

type Table = Record<string, string>;
type PluralBase<T> = {
  [K in keyof T]: K extends `${infer B}_other` ? B : never;
}[keyof T];

export interface Translator<T extends Table> {
  (key: keyof T, params?: StringParams): string;
  /** Plural-aware lookup: picks `key_one`, `key_other`, … for `count`. */
  n(key: PluralBase<T>, count: number, params?: StringParams): string;
  /** True if the table has this key (for data-driven lookups). */
  has(key: string): key is keyof T & string;
}

let locale = 'en-US';
const overrides = new Map<string, Map<string, Table>>(); // locale → namespace → table
let plural = new Intl.PluralRules(locale);
const cache = new Map<string, Intl.NumberFormat>();

function interpolate(template: string, params?: StringParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function defineStrings<const T extends Table>(namespace: string, en: T): Translator<T> {
  const lookup = (key: string): string => {
    const o = overrides.get(locale)?.get(namespace)?.[key];
    return o ?? en[key] ?? key;
  };
  const t = ((key: keyof T, params?: StringParams) => interpolate(lookup(key as string), params)) as Translator<T>;
  t.n = (key, count, params) => {
    const form = plural.select(count);
    const k = `${String(key)}_${form}`;
    const chosen = k in en ? k : `${String(key)}_other`;
    return interpolate(lookup(chosen), { n: count, ...params });
  };
  t.has = (key: string): key is keyof T & string => key in en;
  return t;
}

/** Install translated tables for a locale (the shipped game is English; the plumbing is ready). */
export function registerLocale(loc: string, namespace: string, table: Table): void {
  let byNs = overrides.get(loc);
  if (!byNs) overrides.set(loc, (byNs = new Map()));
  byNs.set(namespace, table);
}

export function setLocale(loc: string): void {
  locale = loc;
  plural = new Intl.PluralRules(loc);
  cache.clear();
}

export function getLocale(): string {
  return locale;
}

function nf(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(locale, options)));
  return f;
}

export const fmt = {
  /** `$1,240` — whole dollars; the game never deals in cents. */
  money(amount: number): string {
    return nf('money', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(amount));
  },
  /** `$12.4K`, `$1.2M` for tight spaces. */
  moneyCompact(amount: number): string {
    if (Math.abs(amount) < 10000) return fmt.money(amount);
    return nf('moneyC', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  },
  /** `+$420` / `−$80` with an explicit sign. */
  moneyDelta(amount: number): string {
    const s = fmt.money(Math.abs(amount));
    return amount < 0 ? `−${s}` : `+${s}`;
  },
  int(n: number): string {
    return nf('int', { maximumFractionDigits: 0 }).format(Math.round(n));
  },
  decimal(n: number, digits = 1): string {
    return nf(`dec${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  },
  percent(x: number): string {
    return nf('pct', { style: 'percent', maximumFractionDigits: 0 }).format(x);
  },
  /** Clock hours (0–24) → `6:40 PM` or `18:40`. */
  clock(hours: number, twentyFour = false): string {
    const total = Math.floor((((hours % 24) + 24) % 24) * 60 + 1e-6);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const mm = m < 10 ? `0${m}` : String(m);
    if (twentyFour) return `${h < 10 ? '0' : ''}${h}:${mm}`;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  },
  /** Seconds → `1:05` or `2h 14m` for playtime. */
  duration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    const sec = s % 60;
    return `${Math.floor(s / 60)}:${sec < 10 ? '0' : ''}${sec}`;
  },
  /** Metres → `240 m` / `1.2 km` or `790 ft` / `0.8 mi`. */
  distance(metres: number, imperial = false): string {
    if (imperial) {
      const feet = metres * 3.28084;
      return feet < 1000 ? `${fmt.int(Math.round(feet / 10) * 10)} ft` : `${fmt.decimal(metres / 1609.344)} mi`;
    }
    return metres < 1000 ? `${fmt.int(Math.round(metres / 10) * 10)} m` : `${fmt.decimal(metres / 1000)} km`;
  },
  /** Metres per second → whole mph or km/h. */
  speed(mps: number, imperial = true): number {
    return Math.round(Math.abs(mps) * (imperial ? 2.236936 : 3.6));
  },
};
