import { SETTINGS, SETTING_IDS, settingsText, type SettingCategory, type SettingDef, type SettingId } from '@/save';
import { tc } from '../../strings/common';

/**
 * Settings rows generated from the schema (pure, so it can be unit-tested). Every option in
 * `SETTINGS` appears exactly once, in schema order, with a label, a description and a control.
 */

export type RowKind = 'toggle' | 'slider' | 'segmented' | 'cycler';

export interface RowOption {
  value: string;
  label: string;
}

export interface SettingRow {
  id: SettingId;
  kind: RowKind;
  label: string;
  desc: string;
  options?: RowOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: 'percent' | 'degrees' | 'none';
}

/** Selects that fit as segmented controls; longer ones become cyclers. */
const SEGMENT_MAX_OPTIONS = 3;
const SEGMENT_MAX_CHARS = 26;

/** Graphics settings a quality preset writes; changing one by hand makes the preset Custom. */
export const PRESET_DRIVEN: ReadonlySet<SettingId> = new Set<SettingId>([
  'gfx.resolutionScale', 'gfx.shadows', 'gfx.reflections', 'gfx.ambientOcclusion', 'gfx.effects', 'gfx.drawDistance',
  'gfx.motionBlur', 'gfx.lensEffects',
]);

function text(key: string): string {
  return settingsText.has(key) ? settingsText(key) : key;
}

export function rowFor(id: SettingId): SettingRow {
  const def: SettingDef = SETTINGS[id];
  const base = { id, label: text(id), desc: text(`${id}.desc`) };
  switch (def.type) {
    case 'toggle':
      return { ...base, kind: 'toggle' };
    case 'slider':
      return { ...base, kind: 'slider', min: def.min, max: def.max, step: def.step, unit: def.unit };
    case 'select': {
      const options = def.options.map((o) => ({ value: o, label: text(`${id}.${o}`) }));
      const chars = options.reduce((a, o) => a + o.label.length, 0);
      const kind: RowKind = options.length <= SEGMENT_MAX_OPTIONS && chars <= SEGMENT_MAX_CHARS ? 'segmented' : 'cycler';
      return { ...base, kind, options };
    }
  }
}

export function rowsFor(category: SettingCategory): SettingRow[] {
  return SETTING_IDS.filter((id) => SETTINGS[id].category === category).map(rowFor);
}

/** Display text for a value ("80%", "68°", "On", "Match display"). */
export function formatSetting(row: SettingRow, value: unknown): string {
  switch (row.kind) {
    case 'toggle':
      return value ? tc('on') : tc('off');
    case 'slider': {
      const n = Number(value);
      if (row.unit === 'percent') return `${Math.round(n)}%`;
      if (row.unit === 'degrees') return `${Math.round(n)}°`;
      return String(n);
    }
    default:
      return row.options?.find((o) => o.value === value)?.label ?? String(value);
  }
}

/** The preset options a player may pick (Custom is only ever set automatically). */
export function presetOptions(current: string): RowOption[] {
  const row = rowFor('gfx.preset');
  return (row.options ?? []).filter((o) => o.value !== 'custom' || current === 'custom');
}
