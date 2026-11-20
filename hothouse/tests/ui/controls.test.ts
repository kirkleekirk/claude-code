import { describe, expect, it } from 'vitest';
import { adjustSlider, snapTo, stepOption, type Option } from '@/ui/components/controls';
import { cycleTab, type TabDef } from '@/ui/components/Tabs';
import { createMemoryPhotoStore, openPhotoStore } from '@/save/photos';

describe('slider maths', () => {
  it('snaps to the step grid measured from the minimum, and clamps', () => {
    expect(snapTo(87, 80, 150, 5)).toBe(85);
    expect(snapTo(88, 80, 150, 5)).toBe(90);
    expect(snapTo(200, 80, 150, 5)).toBe(150);
    expect(snapTo(-3, 0, 100, 1)).toBe(0);
    expect(snapTo(21, 20, 300, 5)).toBe(20);
  });

  it('keeps fractional steps free of floating-point noise', () => {
    expect(snapTo(0.45 + 0.05, 0, 1, 0.05)).toBe(0.5);
    expect(snapTo(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(adjustSlider(-0.2, 1, -2, 2, 0.1)).toBe(-0.1);
  });

  it('moves one step per press and stops at the ends', () => {
    expect(adjustSlider(100, 1, 80, 150, 5)).toBe(105);
    expect(adjustSlider(100, -1, 80, 150, 5)).toBe(95);
    expect(adjustSlider(150, 1, 80, 150, 5)).toBe(150);
    expect(adjustSlider(80, -1, 80, 150, 5)).toBe(80);
  });
});

describe('option and tab stepping', () => {
  const opts: Option<'a' | 'b' | 'c'>[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ];

  it('clamps segmented controls and wraps cyclers', () => {
    expect(stepOption(opts, 'c', 1, false)).toBe('c');
    expect(stepOption(opts, 'a', -1, false)).toBe('a');
    expect(stepOption(opts, 'b', 1, false)).toBe('c');
    expect(stepOption(opts, 'c', 1, true)).toBe('a');
    expect(stepOption(opts, 'a', -1, true)).toBe('c');
  });

  it('recovers from a value that is not an option', () => {
    expect(stepOption(opts, 'zzz' as 'a', 1, false)).toBe('b');
  });

  it('cycles tabs in both directions with wrap', () => {
    const tabs: TabDef<'x' | 'y' | 'z'>[] = [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
      { id: 'z', label: 'Z' },
    ];
    expect(cycleTab(tabs, 'x', 1)).toBe('y');
    expect(cycleTab(tabs, 'z', 1)).toBe('x');
    expect(cycleTab(tabs, 'x', -1)).toBe('z');
  });
});

describe('photo store (memory fallback)', () => {
  it('falls back to a session-only store without IndexedDB', async () => {
    const store = await openPhotoStore();
    expect(store.persistent).toBe(false);
  });

  it('adds, lists newest first, reads back and removes photos', async () => {
    const store = createMemoryPhotoStore();
    const first = await store.add(new Blob(['one'], { type: 'image/png' }), { width: 1920, height: 1080, place: 'Palmetto Flats' });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.add(new Blob(['two'], { type: 'image/png' }), { width: 1280, height: 720 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const list = await store.list();
    expect(list.map((p) => p.id)).toEqual([second.value.id, first.value.id]);
    expect(list[1]!.place).toBe('Palmetto Flats');
    expect(await (await store.get(first.value.id))!.text()).toBe('one');
    expect(await store.thumb(second.value.id)).not.toBeNull();
    await store.remove(first.value.id);
    expect((await store.list()).length).toBe(1);
    expect(await store.get(first.value.id)).toBeNull();
  });
});
