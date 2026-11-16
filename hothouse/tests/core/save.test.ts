import { describe, expect, it } from 'vitest';
import { MemoryStore, SaveManager, Settings, SAVE_VERSION, type SaveData } from '@/save';

const meta = {
  savedAt: 1000, playtime: 600, rank: 2, rankTitle: 'Greenthumb', cash: 1240, location: 'Palmetto Flats',
  day: 1, clockHours: 18.6, brand: 'Abuela Gold', thumb: 'data:image/jpeg;base64,AAAA',
};

describe('SaveManager', () => {
  it('round-trips a save and lists it', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    const sim = { cash: 1240, plants: [{ id: 'p1', stage: 3 }] };
    const res = saves.write(1, meta, sim, { pos: [1, 2, 3] });
    expect(res.ok).toBe(true);
    const back = saves.read(1);
    expect(back.ok && back.value.data.sim).toEqual(sim);
    expect(back.ok && back.value.recovered).toBe(false);
    expect(saves.list()['1']?.cash).toBe(1240);
    expect(saves.latest()?.slot).toBe(1);
  });

  it('recovers from the backup when the primary copy is corrupted', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    saves.write(2, meta, { v: 1 }, {});
    saves.write(2, { ...meta, savedAt: 2000 }, { v: 2 }, {});
    store.set('hothouse.save.2', store.get('hothouse.save.2')!.slice(0, 40));
    const back = saves.read<{ v: number }>(2);
    expect(back.ok).toBe(true);
    expect(back.ok && back.value.recovered).toBe(true);
    expect(back.ok && back.value.data.sim.v).toBe(1);
  });

  it('detects tampering via checksum', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    saves.write(3, meta, { cash: 10 }, {});
    store.set('hothouse.save.3', store.get('hothouse.save.3')!.replace('"cash":10', '"cash":99999'));
    store.remove('hothouse.save.3.bak');
    const back = saves.read(3);
    expect(back.ok).toBe(false);
    expect(!back.ok && back.error).toBe('corrupt');
  });

  it('migrates old versions and refuses newer ones', () => {
    const store = new MemoryStore();
    const old: SaveData = { format: 'hothouse-save', version: SAVE_VERSION - 1, meta: { ...meta, slot: 1 }, sim: { old: true }, world: {} };
    store.set('hothouse.save.1', SaveManager.encode(old));
    const saves = new SaveManager(store, {
      [SAVE_VERSION - 1]: (d) => ({ ...d, version: d.version + 1, sim: { migrated: true } }),
    });
    const back = saves.read(1);
    expect(back.ok && back.value.data.sim).toEqual({ migrated: true });

    const newer: SaveData = { ...old, version: SAVE_VERSION + 5 };
    store.set('hothouse.save.2', SaveManager.encode(newer));
    const r2 = saves.read(2);
    expect(!r2.ok && r2.error).toBe('newer');
  });

  it('drops the thumbnail when storage is tight, and fails cleanly when full', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    const big = { ...meta, thumb: `data:image/jpeg;base64,${'A'.repeat(5000)}` };
    store.quota = 2000;
    const res = saves.write(1, big, { cash: 1 }, {});
    expect(res.ok).toBe(true);
    expect(res.ok && res.value.thumb).toBeNull();
    store.quota = 10;
    const res2 = saves.write(1, meta, { cash: 1 }, {});
    expect(res2.ok).toBe(false);
    // The previous good save is untouched by the failed write.
    expect(saves.read(1).ok).toBe(true);
  });

  it('exports and imports text', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    saves.write('auto', meta, { cash: 5 }, {});
    const text = saves.exportText('auto');
    expect(text.ok).toBe(true);
    const imported = saves.importText(text.ok ? text.value : '', 3);
    expect(imported.ok).toBe(true);
    expect(saves.importText('{"nope":1}', 2).ok).toBe(false);
  });
});

describe('Settings', () => {
  it('sanitizes stored values and persists changes', () => {
    const store = new MemoryStore();
    store.set('hothouse.settings.v1', JSON.stringify({ values: { 'audio.master': 999, 'game.difficulty': 'nightmare', 'a11y.reducedMotion': 'yes' } }));
    const s = new Settings(store);
    expect(s.get('audio.master')).toBe(100);
    expect(s.get('game.difficulty')).toBe('classic');
    expect(s.get('a11y.reducedMotion')).toBe(false);
    s.set('gfx.fov', 80);
    s.setBlob('bindings', { x: 1 });
    s.flush();
    const s2 = new Settings(store);
    expect(s2.get('gfx.fov')).toBe(80);
    expect(s2.blob('bindings')).toEqual({ x: 1 });
    expect(s2.firstRun).toBe(false);
  });

  it('survives corrupted settings text', () => {
    const store = new MemoryStore();
    store.set('hothouse.settings.v1', '{broken');
    const s = new Settings(store);
    expect(s.get('gfx.preset')).toBe('auto');
  });
});
