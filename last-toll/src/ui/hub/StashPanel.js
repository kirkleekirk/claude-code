import { def, makeItem, SLOT_NAMES, SLOT_ORDER } from '../../data/items.js';
import { STASH_CAP, packCapacity, maxHealthFor, addToList, canFit } from '../../game/Profile.js';
import { slotHTML, detailHTML } from '../InventoryUI.js';
import { frame } from './common.js';

// The steamer trunk in the salon: everything you own that isn't on your back.
// What's in your holsters and pack goes with you, and stays behind if you die.

export class StashPanel {
  constructor(hub, st) {
    this.hub = hub;
    this.st = st;
    this.sel = null;
    this.el = frame('Stash', '', '', { side: 'center', wide: true });
    hub.app.uiRoot.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.render();
  }

  get p() { return this.hub.p; }

  _item() {
    const s = this.sel, p = this.p;
    if (!s) return null;
    if (s.w === 'S') return p.stash[s.k] || null;
    if (s.w === 'B') return p.backpack[s.k] || null;
    return p.loadout[s.k] || null;
  }

  _actions(it) {
    const p = this.p, s = this.sel, d = def(it.id);
    const a = [];
    if (s.w === 'S') a.push({ id: 'toPack', label: 'To pack', primary: true, disabled: !canFit(p.backpack, packCapacity(p), it) });
    if (s.w === 'B') a.push({ id: 'toStash', label: 'To stash', primary: true, disabled: !canFit(p.stash, STASH_CAP, it) });
    if (s.w === 'L') {
      a.push({ id: 'toStash', label: 'To stash', primary: true, disabled: !canFit(p.stash, STASH_CAP, it) });
      a.push({ id: 'toPack', label: 'To pack', disabled: !canFit(p.backpack, packCapacity(p), it) });
    }
    if (d.cat === 'weapon' && s.w !== 'L') a.push({ id: 'equip', label: `Holster (${SLOT_NAMES[d.slot].toLowerCase()})` });
    if (d.cat === 'food' && !d.raw) a.push({ id: 'eat', label: `Eat (+${d.nourish})` });
    if (d.cat === 'med' && d.heal) a.push({ id: 'use', label: `Use (+${d.heal} hp)` });
    if (d.yields) a.push({ id: 'scrap', label: 'Scrap it' });
    a.push({ id: 'discard', label: 'Throw overboard', danger: true });
    return a;
  }

  render() {
    const p = this.p;
    const is = (w, k) => this.sel && this.sel.w === w && this.sel.k === k;
    const stash = [];
    for (let i = 0; i < STASH_CAP; i++) stash.push(slotHTML(p.stash[i], { sel: is('S', i), idx: p.stash[i] ? `S:${i}` : '' }));
    const lo = SLOT_ORDER.map((s) => slotHTML(p.loadout[s], { sel: is('L', s), slotName: SLOT_NAMES[s], idx: `L:${s}` })).join('');
    const cap = packCapacity(p);
    const pack = [];
    for (let i = 0; i < cap; i++) pack.push(slotHTML(p.backpack[i], { sel: is('B', i), idx: p.backpack[i] ? `B:${i}` : '' }));
    const it = this._item();
    this.el.querySelector('.st-body').innerHTML = `
      <div class="stash-layout">
        <div><h3>Trunk <span class="num">${p.stash.length}/${STASH_CAP}</span></h3><div class="grid">${stash.join('')}</div>
          <div class="stash-tools"><button class="btn small" data-act="sortStash">Sort</button></div></div>
        <div><h3>Holsters</h3><div class="loadout">${lo}</div>
          <h3>Pack <span class="num">${p.backpack.length}/${cap}</span></h3><div class="grid">${pack.join('')}</div>
          <div class="stash-tools"><button class="btn small" data-act="stowAll">Empty pack into trunk</button></div></div>
        ${detailHTML(it, it ? this._actions(it) : [])}
      </div>`;
    this.el.querySelector('.st-foot').innerHTML = 'Holsters and pack go with you on the skiff, and stay out there if you die';
  }

  _act(act) {
    const p = this.p, s = this.sel, it = this._item();
    if (!it) return;
    const d = def(it.id), audio = this.hub.audio;
    const removeSel = () => {
      if (s.w === 'S') p.stash.splice(s.k, 1);
      else if (s.w === 'B') p.backpack.splice(s.k, 1);
      else p.loadout[s.k] = null;
      this.sel = null;
    };
    const consumeOne = () => { it.qty -= 1; if (it.qty <= 0) removeSel(); };
    switch (act) {
      case 'toPack':
        if (canFit(p.backpack, packCapacity(p), it)) { removeSel(); addToList(p.backpack, packCapacity(p), it); audio.ui(); }
        break;
      case 'toStash':
        if (canFit(p.stash, STASH_CAP, it)) { removeSel(); addToList(p.stash, STASH_CAP, it); audio.ui(); }
        break;
      case 'equip': {
        const slot = d.slot === 'knife' && p.loadout.knife && !p.loadout.melee ? 'melee' : d.slot;
        const prev = p.loadout[slot];
        removeSel();
        p.loadout[slot] = it;
        if (prev) { if (s.w === 'B') p.backpack.push(prev); else addToList(p.stash, STASH_CAP + 1, prev); }
        this.sel = { w: 'L', k: slot };
        audio.mech('holster');
        break;
      }
      case 'eat':
        p.nourishment = Math.min(100, p.nourishment + d.nourish);
        p.health = Math.min(maxHealthFor(p.nourishment), p.health + (d.heal || 0));
        consumeOne();
        audio.eat();
        break;
      case 'use':
        p.health = Math.min(maxHealthFor(p.nourishment), p.health + d.heal);
        consumeOne();
        audio.bandage();
        break;
      case 'scrap':
        consumeOne();
        for (const [k, v] of Object.entries(d.yields)) this.hub.give(makeItem(k, v));
        audio.ui('craft');
        break;
      case 'discard':
        removeSel();
        audio.splash?.(null, 0.4);
        break;
      default:
    }
    this.hub.save();
    this.hub.refreshStatus();
  }

  _click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    this.hub.audio.init();
    const ds = t.dataset, p = this.p;
    if (ds.x === 'leave') return this.hub.closeStation();
    if (ds.idx !== undefined && t.classList.contains('slot')) {
      if (!ds.idx) return;
      const [w, k] = ds.idx.split(':');
      this.sel = { w, k: w === 'L' ? k : +k };
      this.hub.audio.ui();
    } else if (ds.act === 'stowAll') {
      const keep = [];
      for (const x of p.backpack) if (addToList(p.stash, STASH_CAP, x) > 0) keep.push(x);
      p.backpack = keep;
      this.sel = null;
      this.hub.audio.ui();
      this.hub.save();
    } else if (ds.act === 'sortStash') {
      const order = ['weapon', 'ammo', 'med', 'food', 'mat', 'junk', 'util'];
      p.stash.sort((a, b) => order.indexOf(def(a.id).cat) - order.indexOf(def(b.id).cat) || def(a.id).name.localeCompare(def(b.id).name));
      this.sel = null;
      this.hub.audio.ui();
      this.hub.save();
    } else if (ds.act) this._act(ds.act);
    this.render();
  }

  dispose() { this.el.remove(); }
}
