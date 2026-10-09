// The player's items: 8 hotbar slots and 32 in the backpack, as in the original.
// A slot is null or { id, count, dur, mag } (dur: wear left on a tool; mag: rounds loaded in a gun).
// On the inventory screen a stack can be lifted out of its slot into the hand, as the original's
// screen holds one: { s, from }.

import { ITEMS } from './items.js';

export const HOTBAR = 8;
export const PACK = 32;

export class Inventory {
  constructor() {
    this.slots = new Array(HOTBAR + PACK).fill(null);
    this.selected = 0;
    this.hand = null;
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

  select(i) {
    this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    this.changed();
  }

  // ---- the hand ----------------------------------------------------------------------------------

  // Pick up slot i, or half of it (the original's Split: the hand takes the smaller half).
  lift(i, half = false) {
    const s = this.slots[i];
    if (!s || this.hand) return false;
    if (half && s.count > 1) {
      const n = Math.floor(s.count / 2);
      s.count -= n;
      this.hand = { s: { ...s, count: n }, from: i };
    } else {
      this.slots[i] = null;
      this.hand = { s, from: i };
    }
    this.changed();
    return true;
  }

  // Put the hand down on slot i (one: just one of it). It joins a stack of the same thing as far
  // as that goes; on anything else it swaps, and the hand takes what was there.
  put(i, one = false) {
    const h = this.hand;
    if (!h) return false;
    const t = this.slots[i], max = ITEMS[h.s.id].stack;
    if (t && t.id === h.s.id && max > 1) {
      const n = Math.min(max - t.count, one ? 1 : h.s.count);
      if (n <= 0) return false;
      t.count += n; h.s.count -= n;
      if (h.s.count <= 0) this.hand = null;
    } else if (!t) {
      if (one && h.s.count > 1) { this.slots[i] = { ...h.s, count: 1 }; h.s.count -= 1; }
      else { this.slots[i] = h.s; this.hand = null; }
    } else {
      this.slots[i] = h.s;
      h.s = t; h.from = i;
    }
    this.changed();
    return true;
  }

  // Back where it came from if that's free, else wherever it goes (the original's
  // AddInventoryItem). Returns what didn't fit, or null.
  restore() {
    const h = this.hand;
    if (!h) return null;
    this.hand = null;
    if (!this.slots[h.from]) { this.slots[h.from] = h.s; this.changed(); return null; }
    return this.stow(h.s);
  }

  // A stack onto stacks of the same thing, then into the first free slot, the hotbar's before
  // the backpack's. Returns what didn't fit, or null.
  stow(s, from = 0, to = this.slots.length) {
    const max = ITEMS[s.id].stack;
    if (max > 1) {
      for (let k = from; k < to && s.count > 0; k++) {
        const t = this.slots[k];
        if (t && t !== s && t.id === s.id && t.count < max) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; }
      }
    }
    let left = s.count > 0 ? s : null;
    if (left) for (let k = from; k < to; k++) if (!this.slots[k]) { this.slots[k] = left; left = null; break; }
    this.changed();
    return left;
  }

  // Shift-click: slot i over to the other side, backpack to hotbar or back, as far as it goes
  // (the original's AddItemToTray / AddItemToInventory).
  quickMove(i) {
    const s = this.slots[i];
    if (!s) return false;
    this.slots[i] = null;
    const before = s.count;
    const left = i < HOTBAR ? this.stow(s, HOTBAR) : this.stow(s, 0, HOTBAR);
    if (left) this.slots[i] = left;
    this.changed();
    return !left || left.count < before;
  }

  serialize() {
    const slots = this.slots.map((s) => (s ? { ...s } : null));
    // something lifted on the inventory screen goes in the save where it came from
    const h = this.hand;
    if (h) {
      const t = slots[h.from];
      if (!t) slots[h.from] = { ...h.s };
      else if (t.id === h.s.id && ITEMS[t.id].stack > 1) t.count += h.s.count;
      else { const k = slots.indexOf(null); if (k >= 0) slots[k] = { ...h.s }; }
    }
    return { slots, selected: this.selected };
  }

  load(d) {
    if (!d || !Array.isArray(d.slots)) return;
    this.hand = null;
    this.slots = new Array(HOTBAR + PACK).fill(null);
    d.slots.forEach((s, i) => { if (s && ITEMS[s.id] && i < this.slots.length) this.slots[i] = { ...s }; });
    this.selected = d.selected || 0;
    this.changed();
  }
}
