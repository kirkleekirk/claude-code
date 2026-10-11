// The player's items: 8 hotbar slots and 32 in the backpack, as in the original.
// A slot is null or { id, count, dur, mag } (dur: uses left in something that wears out, out of
// its item's `uses`; mag: rounds loaded in a gun).
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
    if (it.uses) s.dur = it.uses;
    if (it.kind === 'gun') s.mag = it.mag;
    // a locator or teleporter: where it points, and its name (the original's GPSItem: none yet,
    // and "Alpha")
    if (it.tool === 'locator' || it.tool === 'teleporter') s.gps = { at: null, name: 'Alpha' };
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

  // Wear the held thing by one use (the original's InflictDamage: twice over when nothing's used
  // up, as in Creative); it's gone once it's worn through. Returns true when it is.
  wearHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s || s.dur == null) return false;
    s.dur -= this.infinite ? n * 2 : n;
    if (s.dur <= 0) { this.slots[this.selected] = null; this.changed(); return true; }
    return false;
  }

  canCraft(recipe) {
    return recipe.in.every(([id, n]) => this.count(id) >= n);
  }

  // The original's Craft: the components out of the backpack, then the hotbar (in Creative,
  // nothing's used up), and what's made in where it fits.
  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    // make sure there's room for what comes out
    const it = ITEMS[recipe.out];
    const free = this.slots.filter((s) => !s).length;
    const stackRoom = this.slots.reduce((a, s) => a + (s && s.id === recipe.out ? it.stack - s.count : 0), 0);
    if (free === 0 && stackRoom < recipe.n) return false;
    if (!this.infinite) for (const [id, n] of recipe.in) this.remove(id, n);
    this.add(recipe.out, recipe.n);
    return true;
  }

  // ---- what you know how to make --------------------------------------------------------------

  // The original's Discovered: a recipe is known once you carry what it makes, one of its
  // components, or a gun it makes the bullets for.
  discovered(recipe) {
    for (const s of this.slots) {
      if (!s) continue;
      if (s.id === recipe.out) return true;
      const it = ITEMS[s.id];
      if (it.kind === 'gun' && it.ammo === recipe.out) return true;
      if (recipe.in.some(([id]) => id === s.id)) return true;
    }
    return false;
  }

  // The original's DiscoverRecipies: what you can make now, then the rest of what you know of,
  // then the recipes for their components (and theirs), in the cookbook's order. Knowing
  // nothing, the first recipe.
  discoveredRecipes(cookbook) {
    const out = [], seen = new Set();
    const take = (r) => { if (!seen.has(r)) { seen.add(r); out.push(r); } };
    for (const r of cookbook) if (this.discovered(r) && this.canCraft(r)) take(r);
    for (const r of cookbook) if (this.discovered(r) && !this.canCraft(r)) take(r);
    for (let i = 0; i < out.length; i++) {
      for (const [id] of out[i].in) for (const r of cookbook) if (r.out === id) take(r);
    }
    if (!out.length && cookbook.length) out.push(cookbook[0]);
    return out;
  }

  // Everything in the backpack (and, all: the hotbar too) out of it, as stacks to drop (the
  // original's DropAll, on dying).
  takeAll(all = false) {
    const out = [];
    for (let i = all ? 0 : HOTBAR; i < this.slots.length; i++) if (this.slots[i]) { out.push(this.slots[i]); this.slots[i] = null; }
    if (all && this.hand) { out.push(this.hand.s); this.hand = null; }
    this.changed();
    return out;
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
  // (box: the slots it's working on, these or a crate's)

  // Pick up slot i, or half of it (the original's Split: the hand takes the smaller half).
  lift(i, half = false, box = this.slots) {
    const s = box[i];
    if (!s || this.hand) return false;
    if (half && s.count > 1) {
      const n = Math.floor(s.count / 2);
      s.count -= n;
      this.hand = { s: { ...s, count: n }, from: i, box };
    } else {
      box[i] = null;
      this.hand = { s, from: i, box };
    }
    this.changed();
    return true;
  }

  // Put the hand down on slot i (one: just one of it). It joins a stack of the same thing as far
  // as that goes; on anything else it swaps, and the hand takes what was there.
  put(i, one = false, box = this.slots) {
    const h = this.hand;
    if (!h) return false;
    const t = box[i], max = ITEMS[h.s.id].stack;
    if (t && t.id === h.s.id && max > 1) {
      const n = Math.min(max - t.count, one ? 1 : h.s.count);
      if (n <= 0) return false;
      t.count += n; h.s.count -= n;
      if (h.s.count <= 0) this.hand = null;
    } else if (!t) {
      if (one && h.s.count > 1) { box[i] = { ...h.s, count: 1 }; h.s.count -= 1; }
      else { box[i] = h.s; this.hand = null; }
    } else {
      box[i] = h.s;
      h.s = t; h.from = i; h.box = box;
    }
    this.changed();
    return true;
  }

  // Back where it came from if that's free (in the player's own slots), else wherever it goes
  // among them (the original's AddInventoryItem). Returns what didn't fit, or null.
  restore() {
    const h = this.hand;
    if (!h) return null;
    this.hand = null;
    if ((!h.box || h.box === this.slots) && !this.slots[h.from]) { this.slots[h.from] = h.s; this.changed(); return null; }
    return this.stow(h.s);
  }

  // A stack onto stacks of the same thing, then into the first free slot, the hotbar's before
  // the backpack's. Returns what didn't fit, or null.
  stow(s, from = 0, to = this.slots.length, box = this.slots) {
    const max = ITEMS[s.id].stack;
    if (max > 1) {
      for (let k = from; k < to && s.count > 0; k++) {
        const t = box[k];
        if (t && t !== s && t.id === s.id && t.count < max) { const n = Math.min(max - t.count, s.count); t.count += n; s.count -= n; }
      }
    }
    let left = s.count > 0 ? s : null;
    if (left) for (let k = from; k < to; k++) if (!box[k]) { box[k] = left; left = null; break; }
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

  // Slot i of box over to other (a crate's to these, or these to a crate's), as far as it goes
  // (the original's CrateScreen.SwapSelectedItemLocation).
  moveAcross(i, box, other) {
    const s = box[i];
    if (!s) return false;
    box[i] = null;
    const before = s.count;
    const left = this.stow(s, 0, other.length, other);
    if (left) box[i] = left;
    this.changed();
    return !left || left.count < before;
  }

  serialize() {
    const slots = this.slots.map((s) => (s ? { ...s } : null));
    // something lifted on the inventory screen goes in the save where it came from
    const h = this.hand;
    if (h) {
      const t = h.box && h.box !== this.slots ? undefined : slots[h.from];
      if (t === null) slots[h.from] = { ...h.s };
      else if (!t) { const k = slots.indexOf(null); if (k >= 0) slots[k] = { ...h.s }; }
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
