import { def } from '../data/items.js';
import { addToList, canFit } from './Profile.js';

// What the survivor carries on a raid: four holsters plus a backpack grid.

export class Inventory {
  constructor({ loadout, backpack, cap }) {
    this.loadout = { knife: null, melee: null, sidearm: null, long: null, ...loadout };
    this.backpack = backpack;
    this.cap = cap;
    this.onChange = null;
  }

  changed() {
    this.onChange?.();
  }

  count(id) {
    let n = 0;
    for (const s of this.backpack) if (s.id === id) n += s.qty;
    return n;
  }

  take(id, n) {
    let taken = 0;
    for (let i = this.backpack.length - 1; i >= 0 && taken < n; i--) {
      const s = this.backpack[i];
      if (s.id !== id) continue;
      const k = Math.min(s.qty, n - taken);
      s.qty -= k;
      taken += k;
      if (s.qty <= 0) this.backpack.splice(i, 1);
    }
    if (taken) this.changed();
    return taken;
  }

  canFit(item) {
    return canFit(this.backpack, this.cap, item);
  }

  // Put an item into the backpack. Returns leftover quantity.
  add(item) {
    const left = addToList(this.backpack, this.cap, item);
    this.changed();
    return left;
  }

  // Picking something up in the world: weapons go to an empty holster first.
  pickup(item) {
    const d = def(item.id);
    if (d.cat === 'weapon' && !this.loadout[d.slot]) {
      this.loadout[d.slot] = item;
      this.changed();
      return { ok: true, equipped: d.slot };
    }
    if (d.cat === 'weapon' && d.slot === 'knife' && !this.loadout.melee) {
      this.loadout.melee = item;
      this.changed();
      return { ok: true, equipped: 'melee' };
    }
    const left = this.add({ ...item });
    if (left === 0) return { ok: true };
    if (left < item.qty) {
      item.qty = left;
      return { ok: false, partial: true };
    }
    return { ok: false };
  }

  removeBackpackIndex(i) {
    const it = this.backpack.splice(i, 1)[0];
    this.changed();
    return it;
  }

  get full() {
    return this.backpack.length >= this.cap;
  }

  all() {
    const out = [];
    for (const k of Object.keys(this.loadout)) if (this.loadout[k]) out.push(this.loadout[k]);
    return out.concat(this.backpack);
  }
}
