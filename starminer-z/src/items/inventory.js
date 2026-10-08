// The player's items: 8 hotbar slots and 32 in the backpack, as in the original.
// A slot is null or { id, count, dur, mag } (dur: wear left on a tool; mag: rounds loaded in a gun).

import { ITEMS } from './items.js';

export const HOTBAR = 8;
export const PACK = 32;

export class Inventory {
  constructor() {
    this.slots = new Array(HOTBAR + PACK).fill(null);
    this.selected = 0;
    this.onChange = null;
  }

  changed() { if (this.onChange) this.onChange(); }

  get held() { return this.slots[this.selected]; }
  get heldItem() { const s = this.slots[this.selected]; return s ? ITEMS[s.id] : null; }

  make(id, count = 1) {
    const it = ITEMS[id];
    const s = { id, count };
    if (it.durability) s.dur = it.durability;
    if (it.kind === 'gun') s.mag = it.mag;
    return s;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  // Add items; returns how many didn't fit.
  add(id, count = 1) {
    const it = ITEMS[id];
    if (!it) return count;
    let left = count;
    // top up existing stacks first
    if (it.stack > 1) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.count < it.stack) {
          const n = Math.min(left, it.stack - s.count);
          s.count += n; left -= n;
        }
      }
    }
    // then empty slots: the hotbar first, then the pack
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, it.stack);
      this.slots[i] = this.make(id, n);
      left -= n;
    }
    this.changed();
    return left;
  }

  remove(id, count = 1) {
    let left = count;
    // take from the backpack before the hotbar
    for (let pass = 0; pass < 2; pass++) {
      for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
        const s = this.slots[i];
        if (!s || s.id !== id) continue;
        if (pass === 0 && i < HOTBAR) continue;
        const n = Math.min(left, s.count);
        s.count -= n; left -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return count - left;
  }

  // Use one of the held stack (placing a block).
  useHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
    return true;
  }

  // Wear the held tool down; it breaks at zero.
  wearHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s || s.dur == null) return false;
    s.dur -= n;
    if (s.dur <= 0) { this.slots[this.selected] = null; this.changed(); return true; }
    return false;
  }

  canCraft(recipe) {
    return recipe.in.every(([id, n]) => this.count(id) >= n);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    // make sure there's room for what comes out
    const it = ITEMS[recipe.out];
    const free = this.slots.filter((s) => !s).length;
    const stackRoom = this.slots.reduce((a, s) => a + (s && s.id === recipe.out ? it.stack - s.count : 0), 0);
    if (free === 0 && stackRoom < recipe.n) return false;
    for (const [id, n] of recipe.in) this.remove(id, n);
    this.add(recipe.out, recipe.n);
    return true;
  }

  swap(a, b) {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
    this.changed();
  }

  // Move slot a onto slot b: stacks merge when they can, otherwise they swap.
  moveTo(a, b) {
    if (a === b) return;
    const A = this.slots[a], Bs = this.slots[b];
    if (A && Bs && A.id === Bs.id && ITEMS[A.id].stack > 1) {
      const room = ITEMS[A.id].stack - Bs.count;
      const n = Math.min(room, A.count);
      Bs.count += n; A.count -= n;
      if (A.count <= 0) this.slots[a] = null;
      this.changed();
      return;
    }
    this.swap(a, b);
  }

  select(i) {
    this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    this.changed();
  }

  serialize() { return { slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected }; }
  load(d) {
    if (!d || !Array.isArray(d.slots)) return;
    this.slots = new Array(HOTBAR + PACK).fill(null);
    d.slots.forEach((s, i) => { if (s && ITEMS[s.id] && i < this.slots.length) this.slots[i] = { ...s }; });
    this.selected = d.selected || 0;
    this.changed();
  }
}
