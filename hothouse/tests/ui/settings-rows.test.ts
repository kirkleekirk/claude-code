import { describe, expect, it } from 'vitest';
import { SETTINGS, SETTING_CATEGORIES, SETTING_IDS, type SettingId } from '@/save';
import { formatSetting, PRESET_DRIVEN, presetOptions, rowFor, rowsFor } from '@/ui/screens/settings/rows';

describe('settings rows', () => {
  it('shows every setting exactly once, in its own category, in schema order', () => {
    const all = SETTING_CATEGORIES.flatMap((c) => rowsFor(c).map((row) => row.id));
    expect(all.length).toBe(SETTING_IDS.length);
    expect(new Set(all).size).toBe(SETTING_IDS.length);
    for (const c of SETTING_CATEGORIES) {
      const ids = rowsFor(c).map((row) => row.id);
      expect(ids).toEqual(SETTING_IDS.filter((id) => SETTINGS[id].category === c));
    }
  });

  it('gives every row a real label and description (no raw keys)', () => {
    for (const id of SETTING_IDS) {
      const row = rowFor(id);
      expect(row.label, id).not.toBe(id);
      expect(row.desc, id).not.toBe(`${id}.desc`);
      expect(row.label.length, id).toBeGreaterThan(1);
      expect(row.desc.length, id).toBeGreaterThan(5);
      for (const o of row.options ?? []) expect(o.label, `${id}.${o.value}`).not.toBe(`${id}.${o.value}`);
    }
  });

  it('builds the right control for each schema type', () => {
    for (const id of SETTING_IDS) {
      const def = SETTINGS[id];
      const row = rowFor(id);
      if (def.type === 'toggle') expect(row.kind).toBe('toggle');
      if (def.type === 'slider') {
        expect(row.kind).toBe('slider');
        expect([row.min, row.max, row.step]).toEqual([def.min, def.max, def.step]);
      }
      if (def.type === 'select') {
        expect(['segmented', 'cycler']).toContain(row.kind);
        expect(row.options?.map((o) => o.value)).toEqual([...def.options]);
      }
    }
  });

  it('uses segmented controls for a few short options and cyclers otherwise', () => {
    expect(rowFor('game.difficulty').kind).toBe('segmented');
    expect(rowFor('game.units').kind).toBe('segmented');
    expect(rowFor('gfx.preset').kind).toBe('cycler');
    expect(rowFor('controls.glyphs').kind).toBe('cycler');
    expect(rowFor('gfx.shadows').kind).toBe('cycler');
  });

  it('formats values for display', () => {
    expect(formatSetting(rowFor('gfx.motionBlur'), true)).toBe('On');
    expect(formatSetting(rowFor('gfx.motionBlur'), false)).toBe('Off');
    expect(formatSetting(rowFor('a11y.uiScale'), 125)).toBe('125%');
    expect(formatSetting(rowFor('gfx.fov'), 68.4)).toBe('68°');
    const difficulty = rowFor('game.difficulty');
    expect(formatSetting(difficulty, 'sweaty')).toBe(difficulty.options!.find((o) => o.value === 'sweaty')!.label);
    expect(formatSetting(difficulty, 'unknown')).toBe('unknown');
  });

  it('offers Custom as a preset only while the preset already is Custom', () => {
    expect(presetOptions('high').map((o) => o.value)).not.toContain('custom');
    expect(presetOptions('custom').map((o) => o.value)).toContain('custom');
    expect(presetOptions('auto').map((o) => o.value)).toEqual(['auto', 'low', 'medium', 'high', 'ultra']);
  });

  it('only marks graphics settings as preset-driven', () => {
    for (const id of PRESET_DRIVEN) expect(SETTINGS[id as SettingId].category).toBe('graphics');
    expect(PRESET_DRIVEN.has('gfx.preset')).toBe(false);
  });
});
