// The crates in the world and what's in them (the original's WorldInfo.Crates): 32 slots each,
// kept with the world when it's saved. Online every machine has them all, the same: a change to
// one goes through the host to everyone (the original's ItemCrateMessage), and while a player has
// a crate open the others can't touch the slot they're on (its CrateFocusMessage).

import * as THREE from 'three';
import { ITEMS } from '../items/items.js';

export const CRATE_SLOTS = 32;

const key = (x, y, z) => `${x},${y},${z}`;
const same = (a, b) => (a ? JSON.stringify(a) : '') === (b ? JSON.stringify(b) : '');
// a slot as it comes in from a save or another machine
function clean(s) {
  if (!s || typeof s !== 'object' || !ITEMS[s.id] || !Number.isInteger(s.count) || s.count < 1) return null;
  const out = { id: s.id, count: Math.min(s.count, ITEMS[s.id].stack) };
  if (Number.isFinite(s.dur)) out.dur = s.dur;
  if (Number.isFinite(s.mag)) out.mag = s.mag;
  if (s.gps && typeof s.gps === 'object') out.gps = { at: Array.isArray(s.gps.at) ? s.gps.at.slice(0, 3).map(Number) : null, name: String(s.gps.name ?? '').slice(0, 10) };
  return out;
}

export class Crates {
  constructor(game, saved = null) {
    this.game = game;
    // "x,y,z" -> { x, y, z, slots, sent }
    this.map = new Map();
    // online: where each of the others is in a crate (id -> { k, i })
    this.focus = new Map();
    if (saved) this.load(saved);
  }

  // The crate at x, y, z (made, empty, the first time it's asked for: the original's GetCreate)
  get(x, y, z, create = true) {
    const k = key(x, y, z);
    let c = this.map.get(k);
    if (!c && create) {
      c = { k, x, y, z, slots: new Array(CRATE_SLOTS).fill(null), sent: new Array(CRATE_SLOTS).fill(null), gone: false };
      this.map.set(k, c);
    }
    return c || null;
  }

  // What's changed in a crate here since it was last told: out to the others.
  commit(c) {
    for (let i = 0; i < CRATE_SLOTS; i++) {
      if (same(c.slots[i], c.sent[i])) continue;
      c.sent[i] = c.slots[i] ? { ...c.slots[i] } : null;
      this.game.online?.crateSlot(c, i, c.sent[i]);
    }
  }

  // A slot changed on another machine.
  receive(x, y, z, i, s) {
    if (!Number.isInteger(i) || i < 0 || i >= CRATE_SLOTS) return;
    const c = this.get(x, y, z);
    c.slots[i] = clean(s);
    c.sent[i] = c.slots[i] ? { ...c.slots[i] } : null;
    this.game.crafting?.crateChanged?.(c);
  }

  // Another player's place in a crate (null: they've shut it).
  setFocus(id, at, i) {
    if (!at) { this.focus.delete(id); return; }
    this.focus.set(id, { k: key(at[0], at[1], at[2]), i });
    this.game.crafting?.crateChanged?.(null);
  }

  // Is slot i of crate c someone else's just now? (IsSlotLocked)
  locked(c, i) {
    for (const f of this.focus.values()) if (f.k === c.k && f.i === i) return true;
    return false;
  }

  // The crate's block is gone: what's in it flies out (EjectContents: each stack up out of
  // the middle at 3 m/s, all but what someone else is on), and the crate with it.
  spill(x, y, z) {
    const c = this.get(x, y, z, false);
    if (!c) return;
    const g = this.game;
    for (let i = 0; i < CRATE_SLOTS; i++) {
      const s = c.slots[i];
      if (!s || this.locked(c, i)) continue;
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 3, (Math.random() - 0.5) * 1.2);
      g.drops.spawn(s.id, s.count, x + 0.5, y + 0.5, z + 0.5, v, s);
      c.slots[i] = null;
    }
    this.remove(x, y, z);
  }

  // (DestroyCrateMessage) the crate's gone; anyone with it open has it shut on them
  remove(x, y, z) {
    const k = key(x, y, z), c = this.map.get(k);
    if (!c) return;
    c.gone = true;
    this.map.delete(k);
    this.game.crafting?.crateChanged?.(c);
  }

  serialize() {
    const out = {};
    for (const [k, c] of this.map) if (c.slots.some(Boolean)) out[k] = c.slots.map((s) => (s ? { ...s } : null));
    return out;
  }

  load(d) {
    if (!d || typeof d !== 'object') return;
    for (const [k, slots] of Object.entries(d)) {
      const p = k.split(',').map(Number);
      if (p.length !== 3 || !p.every(Number.isInteger) || !Array.isArray(slots)) continue;
      const c = this.get(p[0], p[1], p[2]);
      for (let i = 0; i < CRATE_SLOTS; i++) { c.slots[i] = clean(slots[i]); c.sent[i] = c.slots[i] ? { ...c.slots[i] } : null; }
    }
  }
}
