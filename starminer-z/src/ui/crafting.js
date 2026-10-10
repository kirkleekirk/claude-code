// The inventory and crafting screens, laid out as the later CastleMiner Z lays them out on its
// 1280 x 720 screen (16 of its pixels to the em here), on one panel in the middle:
//
// The inventory (the original's BlockPickerScreen): what's chosen, named, at the top; the
// backpack, four rows of eight, and the hotbar under it. A (or a click) picks a stack up and
// puts it down, joining a stack of the same thing or swapping with what's there; the right
// stick (or a right-click) splits a stack, or puts down one; X (Q) drops it on the ground, as
// does letting go of it outside the panel; Y (E) goes to crafting; B puts back what's held, and
// closes. Shift-click sends a stack across, backpack to hotbar or back, and a number key puts
// the thing under the pointer on that hotbar slot.
//
// Crafting (the original's CraftingUIScreen): the recipes you know of down the left, the ones
// you can make first (PlayerInventory.DiscoverRecipies: you know a recipe once you carry what it
// makes, one of its components, or a gun it makes the bullets for), the chosen one's components
// in a row beside it, and the backpack and hotbar below. Up and down (or the wheel) go through
// the recipes, left and right through the components; A (or a click on it) makes the chosen
// thing, or on a component goes to its recipe; B (or Y, E, Esc) goes back to the inventory.
// Shift-click makes as many as you can.
//
// The world doesn't stop while either is up.

import { Vector3 } from 'three';
import { ITEMS, RECIPES } from '../items/items.js';
import { iconFor } from '../items/icons.js';
import { HOTBAR, PACK } from '../items/inventory.js';

const P = (v) => `${v / 16}em`;
// where things are on the panel, in the original's pixels from its corner (the panel is 810 x
// 602 in the middle of the screen: the original's positions, less (235, 59))
const PANEL = { w: 810, h: 602 };
const CELL = 59;
const GRID = { x: 169, y: 275 }, TRAY = { x: 169, y: 525 };
const TEXT = { x: 169, y: 20 };
const TO_CRAFT = { x: 169, y: 101 }, DROP = { x: 169, y: 239 }, SPLIT = { x: 494, y: 239 };
const LIST = { x: 39, y: 184, step: 77 }, INGS = { x: 131, y: 184, step: 77 }, PRESS = { x: 131, y: 151 };
const TILE = 76, SELECTOR = 68;

export const CRAFT_CSS = /* css */ `
.craft { position: absolute; inset: 0; display: none; pointer-events: auto; z-index: 4; font-family: 'Saira Semi Condensed', 'Saira Condensed', 'Arial Narrow', var(--ui-font); }
.craft.on { display: block; }
.craft .ip { position: absolute; left: 50%; top: 50%; width: ${P(PANEL.w)}; height: ${P(PANEL.h)}; transform: translate(-50%, -50%); }
/* the panel, as the original's BlockUIBack (its own art, when it's been ripped) */
.craft .ip .back { position: absolute; inset: 0; }
html:not(.cmz-ui) .craft .ip .back { border-radius: ${P(14)}; background: linear-gradient(180deg, rgba(74, 80, 76, 0.9), rgba(58, 64, 61, 0.9)); border: ${P(3)} solid #a9aea8; box-shadow: inset 0 0 0 ${P(2)} rgba(0,0,0,0.6), 0 ${P(4)} ${P(18)} rgba(0,0,0,0.5); }
.craft .frame { position: absolute; display: none; border: ${P(4)} solid #b9beb8; border-style: outset; background: rgba(28, 32, 30, 0.55); }
html:not(.cmz-ui) .craft .frame { display: block; }
.craft .cell { position: absolute; width: ${P(CELL)}; height: ${P(CELL)}; cursor: pointer; }
.craft .ic { position: absolute; inset: 0; }
.craft .ic img { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.craft .ic .n { position: absolute; left: ${P(8)}; bottom: ${P(1)}; font-family: var(--ui-font); font-size: ${P(15)}; font-weight: 700; color: #fff; text-shadow: 0 0 ${P(2)} #000, ${P(1)} ${P(1)} 0 #000, -${P(1)} -${P(1)} 0 #000; pointer-events: none; }
.craft .ic .wear { position: absolute; left: ${P(9)}; right: ${P(9)}; bottom: ${P(9)}; height: ${P(7)}; background: #000; pointer-events: none; }
.craft .ic .wear b { position: absolute; left: ${P(1)}; top: ${P(1)}; bottom: ${P(1)}; background: rgb(67, 188, 0); }
html:not(.cmz-ui) .craft .grid .cell { background: rgba(14, 16, 15, 0.55); box-shadow: inset 0 0 0 ${P(1.5)} rgba(150, 156, 150, 0.6); }
.craft .tile { position: absolute; width: ${P(TILE)}; height: ${P(TILE)}; cursor: pointer; }
html:not(.cmz-ui) .craft .tile { background: rgba(20, 24, 22, 0.75); box-shadow: inset 0 0 0 ${P(3)} #9aa09a, inset 0 0 0 ${P(5)} rgba(0,0,0,0.6); }
.craft .tile.dim { opacity: 0.5; filter: brightness(0.25); }
.craft .tile .ic { left: ${P(4)}; top: ${P(4)}; width: ${P(CELL)}; height: ${P(CELL)}; right: auto; bottom: auto; }
.craft .sel { position: absolute; width: ${P(SELECTOR)}; height: ${P(SELECTOR)}; pointer-events: none; }
html:not(.cmz-ui) .craft .sel { box-shadow: inset 0 0 0 ${P(4)} #fff, 0 0 ${P(6)} rgba(255,255,255,0.5); border-radius: ${P(4)}; }
html:not(.cmz-ui) .craft .sel.hold { box-shadow: inset 0 0 0 ${P(4)} #ff2a1a, 0 0 ${P(6)} rgba(255,40,20,0.5); }
/* (the original tints its selector red while something's held) */
.cmz-ui .craft .sel.hold { filter: sepia(1) saturate(40) hue-rotate(-45deg) brightness(0.9); }
.craft .sel .ic { left: ${P(4)}; top: ${P(4)}; width: ${P(CELL)}; height: ${P(CELL)}; right: auto; bottom: auto; }
.craft .t { position: absolute; color: #fff; white-space: nowrap; text-shadow: 0 0 ${P(2)} #000, ${P(2)} ${P(2)} 0 #000, -${P(2)} -${P(2)} 0 #000, ${P(2)} -${P(2)} 0 #000, -${P(2)} ${P(2)} 0 #000; }
.craft .big { font-size: ${P(24)}; font-weight: 700; line-height: 1.15; }
.craft .small { font-size: ${P(16)}; font-weight: 600; line-height: 1.3; text-shadow: 0 0 ${P(2)} #000, ${P(1)} ${P(1)} 0 #000, -${P(1)} -${P(1)} 0 #000; }
.craft .t .btn { font-family: var(--ui-font); vertical-align: 0.08em; }
.craft .link { cursor: pointer; pointer-events: auto; }
.craft .link:hover { color: #ffe9a0; }
.craft .page { display: none; }
.craft.inv .page.inv, .craft.cr .page.cr { display: block; }
.craft .help { position: absolute; left: 0; right: 0; top: calc(100% + ${P(8)}); display: flex; justify-content: center; flex-wrap: wrap; gap: ${P(4)} ${P(22)}; font-family: var(--ui-font); font-size: ${P(14)}; font-weight: 700; color: #fff; text-shadow: 0 ${P(1)} ${P(2)} #000; }
.craft .help span { display: inline-flex; gap: ${P(6)}; align-items: center; }
.craft .close { position: absolute; right: ${P(10)}; top: ${P(8)}; width: ${P(30)}; height: ${P(30)}; display: grid; place-items: center; color: #e8ece8; font-size: ${P(20)}; font-weight: 700; cursor: pointer; font-family: var(--ui-font); text-shadow: 0 0 ${P(3)} #000; }
.craft .carry { position: fixed; pointer-events: none; z-index: 9; width: ${P(CELL)}; height: ${P(CELL)}; display: none; transform: translate(-50%, -50%); }
/* the hotbar is in the panel while it's up */
.hud.crafting .bottom .hotbar { visibility: hidden; }
/* phones held upright: a little smaller */
@media (max-aspect-ratio: 1/1) { .craft { font-size: min(var(--ui-size, 16px), 1.9vw); } }
`;

// One item's icon, as the original's InventoryItem.Draw2D draws it: its count bottom left, and
// for something that wears out, how much is left of it.
function iconHtml(slot, cls = '') {
  if (!slot) return '';
  const it = ITEMS[slot.id];
  const wear = it.uses > 1 && slot.dur != null ? `<span class="wear"><b style="width:calc(${Math.max(0, Math.min(1, slot.dur / it.uses))} * (100% - ${P(2)}))"></b></span>` : '';
  const n = slot.count > 1 ? `<span class="n">${slot.count}</span>` : '';
  return `<span class="ic ${cls}">${wear}<img alt="" draggable="false" src="${iconFor(slot.id)}">${n}</span>`;
}

const SP = (name) => `sp-${name}`;

export class Crafting {
  constructor(parent, game) {
    this.game = game;
    this.page = 'inv';
    this.isOpen = false;
    // the inventory's selector: x 0-7, y 0-3 the backpack's rows, 4 the hotbar
    this.at = { x: 0, y: 4 };
    // crafting: the recipes known, the chosen one, and which of its components (0: none)
    this.known = [];
    this.recipe = null;
    this.ing = 0;
    this.drag = null;
    this.pointer = false;
    const el = document.createElement('div');
    el.className = 'craft ui inv';
    el.innerHTML = `
      <div class="ip">
        <div class="back ${SP('BlockUIBack')}"></div>
        <div class="frame" style="left:${P(GRID.x - 8)};top:${P(GRID.y - 8)};width:${P(CELL * 8 + 8)};height:${P(CELL * 4 + 8)}"></div>
        <div class="frame" style="left:${P(TRAY.x - 8)};top:${P(TRAY.y - 8)};width:${P(CELL * 8 + 8)};height:${P(CELL + 8)}"></div>
        <div class="close">✕</div>
        <div class="t name" style="left:${P(TEXT.x)};top:${P(TEXT.y)}"><div class="big nm"></div><div class="small d1"></div><div class="small d2"></div></div>
        <div class="page inv">
          <div class="t link tocraft" style="left:${P(TO_CRAFT.x)};top:${P(TO_CRAFT.y)}"><div class="big"><span class="btn y">Y</span> To Craft</div></div>
          <div class="t link drop" style="left:${P(DROP.x)};top:${P(DROP.y)}"><div class="big"><span class="btn x">X</span> Drop Item</div></div>
          <div class="t split" style="left:${P(SPLIT.x)};top:${P(SPLIT.y)}"><div class="big">Split Items <span class="btn rs">RS</span></div></div>
        </div>
        <div class="page cr">
          <div class="t" style="left:${P(PRESS.x)};top:${P(PRESS.y - 28)}"><div class="big">Press <span class="btn a">A</span> To Create Item</div><div class="big">Components: </div></div>
          <div class="list"></div>
          <div class="ings"></div>
        </div>
        <div class="grid"></div>
        <div class="sel ${SP('Selector')}"></div>
        <div class="help"></div>
      </div>
      <div class="carry"></div>`;
    parent.appendChild(el);
    this.el = el;
    this.$ = (s) => el.querySelector(s);
    this.panel = this.$('.ip');
    this.selEl = this.$('.sel');
    this.carryEl = this.$('.carry');
    // the backpack and the hotbar's cells (by inventory slot)
    const grid = this.$('.grid');
    this.cells = [];
    for (let i = 0; i < HOTBAR + PACK; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      const { x, y } = this.cellAt(i);
      c.style.left = P(x); c.style.top = P(y);
      c.dataset.slot = i;
      grid.appendChild(c);
      this.cells[i] = c;
    }
    this.$('.close').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); });
    this.$('.tocraft').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.showCrafting(); });
    this.$('.drop').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.dropHeld(false); });
    grid.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-slot]');
      if (!t || !this.isOpen) return;
      e.stopPropagation();
      e.preventDefault();
      this.slotDown(+t.dataset.slot, e);
    });
    grid.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-slot]');
      if (!t || !this.isOpen || this.page !== 'inv') return;
      this.pointer = true;
      const i = +t.dataset.slot;
      this.at = i < HOTBAR ? { x: i, y: 4 } : { x: (i - HOTBAR) % 8, y: Math.floor((i - HOTBAR) / 8) };
      this.render();
    });
    this.$('.list').addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-r]');
      if (!t) return;
      e.stopPropagation();
      this.clickRecipe(+t.dataset.r, e.shiftKey);
    });
    this.$('.ings').addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-g]');
      if (!t) return;
      e.stopPropagation();
      const g = +t.dataset.g;
      if (this.ing === g) this.toComponentRecipe(); else { this.ing = g; this.sound('move'); this.render(); }
    });
    this.$('.ings').addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-g]');
      if (t && this.ing !== +t.dataset.g) { this.ing = +t.dataset.g; this.render(); }
    });
    // a click (or right-click) outside the panel lets go of what's held: onto the ground
    el.addEventListener('pointerdown', (e) => {
      if (e.target !== el || !game.inventory.hand || this.page !== 'inv') return;
      this.dropHeld(e.button === 2);
    });
    el.addEventListener('wheel', (e) => {
      if (this.page !== 'cr') return;
      e.preventDefault();
      this.moveRecipe(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.onMove = (e) => { this.mx = e.clientX; this.my = e.clientY; if (this.isOpen) { this.pointer = true; this.placeCarry(); } };
    this.onUp = (e) => this.slotUp(e);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  // where slot i's cell is on the panel
  cellAt(i) {
    if (i < HOTBAR) return { x: TRAY.x + i * CELL, y: TRAY.y };
    const k = i - HOTBAR;
    return { x: GRID.x + (k % 8) * CELL, y: GRID.y + Math.floor(k / 8) * CELL };
  }

  get slot() { return this.at.y >= 4 ? this.at.x : HOTBAR + this.at.y * 8 + this.at.x; }

  sound(kind) { this.game.audio?.ui?.(kind); }

  open() {
    this.isOpen = true;
    this.drag = null;
    this.page = 'inv';
    this.at = { x: this.game.inventory.selected, y: 4 };
    this.el.classList.add('on');
    this.game.hud.el.classList.add('crafting');
    this.render();
  }

  // quiet: closed by something else (the pause menu), which looks after the mouse itself
  close(quiet = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.drag = null;
    this.putBack();
    this.el.classList.remove('on');
    this.game.hud.el.classList.remove('crafting');
    this.game.closedCrafting(quiet);
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.game.hud.el.classList.remove('crafting');
    this.el.remove();
  }

  // ---- the two pages -------------------------------------------------------------------------------

  // The original's ShowCraftingScreen: what's held goes back first, and the recipes known are
  // worked out afresh, the first of them chosen.
  showCrafting() {
    this.putBack();
    this.page = 'cr';
    this.known = this.game.inventory.discoveredRecipes(RECIPES);
    this.recipe = this.known[0] || null;
    this.ing = 0;
    this.sound('move');
    this.render();
  }

  showInventory() {
    this.page = 'inv';
    this.sound('move');
    this.render();
  }

  get recipeIndex() { return this.known.indexOf(this.recipe); }

  moveRecipe(d) {
    const i = this.recipeIndex + d;
    if (i < 0 || i >= this.known.length) return false;
    this.recipe = this.known[i];
    this.ing = 0;
    this.sound('move');
    this.render();
    return true;
  }

  // A click on one of the recipes on show: the chosen one is made (all you can, with shift);
  // another is gone to.
  clickRecipe(i, all) {
    if (i === this.recipeIndex && !this.ing) { this.craft(all); return; }
    if (!this.known[i]) return;
    this.recipe = this.known[i];
    this.ing = 0;
    this.sound('move');
    this.render();
  }

  // A on a component: over to its recipe, if it has one you know of.
  toComponentRecipe() {
    const want = this.recipe?.in[this.ing - 1]?.[0];
    const r = want && this.known.find((k) => k.out === want);
    if (!r) { this.sound('deny'); return; }
    this.recipe = r;
    this.ing = 0;
    this.sound('move');
    this.render();
  }

  craft(all = false) {
    const r = this.recipe, g = this.game, inv = g.inventory;
    if (!r || !inv.canCraft(r)) { this.sound('deny'); return; }
    let n = 0;
    do {
      if (!inv.craft(r)) break;
      n++;
      g.stats.crafted++;
      if (ITEMS[r.out].kind === 'gun') g.stats.guns = (g.stats.guns || 0) + 1;
    } while (all && inv.canCraft(r) && n < 999);
    if (!n) { this.sound('deny'); return; }
    this.ing = 0;
    g.audio?.craft?.(r.out);
    // what's known now (the same recipe still chosen)
    this.known = inv.discoveredRecipes(RECIPES);
    if (!this.known.includes(r)) this.recipe = this.known[0] || null;
    this.render();
  }

  // ---- the backpack and the hotbar ---------------------------------------------------------------

  // A press on slot i, by mouse or touch (the original's BlockPickerScreen rules).
  slotDown(i, e) {
    if (this.page !== 'inv') return;
    const inv = this.game.inventory;
    this.pointer = true;
    this.mx = e.clientX; this.my = e.clientY;
    let did;
    if (e.button === 2) did = inv.hand ? inv.put(i, true) : inv.lift(i, true);
    else if (e.shiftKey && !inv.hand) did = inv.quickMove(i);
    else if (inv.hand) did = inv.put(i);
    else if ((did = inv.lift(i))) this.drag = { from: i, x: e.clientX, y: e.clientY };
    if (!did) return;
    this.at = i < HOTBAR ? { x: i, y: 4 } : { x: (i - HOTBAR) % 8, y: Math.floor((i - HOTBAR) / 8) };
    this.sound('move');
    this.render();
  }

  // Let go: a click leaves it in the hand, to put down with another; a drag puts it where it's
  // let go (anything it swapped with goes back where it came from), and off the panel drops it.
  slotUp(e) {
    const d = this.drag, inv = this.game.inventory;
    this.drag = null;
    if (!d || !this.isOpen || !inv.hand) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const t = hit?.closest?.('[data-slot]');
    if (t && +t.dataset.slot !== d.from) {
      inv.put(+t.dataset.slot);
      if (inv.hand) inv.put(d.from);
    } else if (!this.panel.contains(hit)) {
      this.dropHeld(false);
      return;
    }
    this.putBack();
    this.sound('move');
    this.render();
  }

  // what's held back in the inventory (and if somehow there's no room, on the ground)
  putBack() {
    const g = this.game, left = g.inventory.restore();
    if (left) { const p = g.player.pos; g.drops.spawn(left.id, left.count, p.x, p.y + 1, p.z, null, left); }
  }

  // X (Q): what's held onto the ground (one: just one of it), or else the chosen stack.
  dropHeld(one) {
    const g = this.game, inv = g.inventory, p = g.player.pos;
    let s = null;
    if (inv.hand) {
      const h = inv.hand;
      if (one && h.s.count > 1) { s = { ...h.s, count: 1 }; h.s.count--; } else { s = h.s; inv.hand = null; }
    } else if (inv.slots[this.slot]) {
      s = inv.slots[this.slot];
      inv.slots[this.slot] = null;
    }
    if (!s) return;
    inv.changed();
    // thrown a little way out in front
    const f = g.player.forward(new Vector3());
    g.drops.spawn(s.id, s.count, p.x + f.x * 0.6, p.y + 1.2, p.z + f.z * 0.6, f.clone().multiplyScalar(4).setY(2), s, true);
    g.audio?.drop?.();
    this.render();
  }

  // the pad's A on the selector: pick up, or put down (joining, or swapping with what's there)
  padUse() {
    const inv = this.game.inventory, i = this.slot;
    this.pointer = false;
    if (!(inv.hand ? inv.put(i) : inv.lift(i))) return;
    this.sound('move');
    this.render();
  }

  // the right stick: pick up half (the smaller half) of the stack, or with something in hand,
  // put one down on an empty slot, or take up half of a stack of the same thing
  padSplit() {
    const inv = this.game.inventory, i = this.slot, h = inv.hand, t = inv.slots[i];
    this.pointer = false;
    let did = false;
    if (!h) did = inv.lift(i, true);
    else if (!t) did = inv.put(i, true);
    else if (t.id === h.s.id && ITEMS[t.id].stack > 1) {
      const n = t.count > 1 ? Math.floor(t.count / 2) : 1;
      const room = ITEMS[t.id].stack - h.s.count;
      const k = Math.min(n, room);
      if (k > 0) { h.s.count += k; t.count -= k; if (t.count <= 0) inv.slots[i] = null; inv.changed(); did = true; }
    } else did = inv.put(i);
    if (!did) return;
    this.sound('move');
    this.render();
  }

  placeCarry() {
    const c = this.carryEl, h = this.game.inventory.hand;
    if (!h || !this.pointer || this.mx == null || this.page !== 'inv') { c.style.display = 'none'; return; }
    c.style.display = 'block';
    c.style.left = `${this.mx}px`;
    c.style.top = `${this.my}px`;
  }

  // ---- drawing ----------------------------------------------------------------------------------------

  render() {
    if (!this.isOpen) return;
    const inv = this.game.inventory, cr = this.page === 'cr';
    this.el.classList.toggle('inv', !cr);
    this.el.classList.toggle('cr', cr);
    // the backpack and the hotbar (in the hand's place, nothing)
    const h = inv.hand;
    for (let i = 0; i < this.cells.length; i++) {
      const s = inv.slots[i];
      const key = s ? `${s.id}|${s.count}|${s.dur ?? ''}` : '';
      if (this.cells[i].dataset.key !== key) { this.cells[i].dataset.key = key; this.cells[i].innerHTML = iconHtml(s); }
    }
    // what's named at the top: on the inventory, what's held or chosen; crafting, the chosen
    // recipe's thing or component
    let named = null;
    if (cr) {
      const r = this.recipe;
      named = r ? (this.ing > 0 ? r.in[this.ing - 1]?.[0] : r.out) : null;
    } else named = h ? h.s.id : inv.slots[this.slot]?.id ?? null;
    const it = named ? ITEMS[named] : null;
    this.$('.nm').textContent = it ? it.name : '';
    this.$('.d1').textContent = it?.desc || '';
    this.$('.d2').textContent = it?.desc2 || '';
    // the selector, and what's held in it (or at the pointer)
    const sel = this.selEl;
    if (cr) {
      const x = this.ing > 0 ? INGS.x + (this.ing - 1) * INGS.step : LIST.x;
      sel.style.left = P(x - 2); sel.style.top = P(LIST.y - 2);
      sel.classList.remove('hold');
      sel.innerHTML = '';
      sel.style.display = this.recipe ? '' : 'none';
      this.renderRecipes();
    } else {
      const { x, y } = this.cellAt(this.slot);
      sel.style.left = P(x - 4); sel.style.top = P(y - 4);
      sel.style.display = '';
      sel.classList.toggle('hold', !!h);
      sel.innerHTML = h && !this.pointer ? iconHtml(h.s) : '';
    }
    this.carryEl.innerHTML = h ? iconHtml(h.s) : '';
    this.placeCarry();
    // the help along the bottom
    const pad = this.game.app.input.lastDevice === 'pad', touch = this.game.app.isTouch;
    this.$('.help').innerHTML = pad ? '' : touch
      ? (cr ? '<span>Tap the chosen thing to make it</span><span>Tap a component for its recipe</span>' : '<span>Tap or drag to move things</span>')
      : cr ? '<span><span class="key">Enter</span> Make it</span><span><span class="key">Shift</span>+click: as many as you can</span><span><span class="key">E</span> / <span class="key">Esc</span> Back</span>'
        : '<span><span class="key">E</span> Crafting</span><span><span class="key">Q</span> Drop</span><span><span class="key">Shift</span>+click: across</span><span>Right-click: split</span><span><span class="key">Esc</span> Close</span>';
  }

  // the recipes on show (two either side of the chosen one) and its components
  renderRecipes() {
    const inv = this.game.inventory, r = this.recipe, at = this.recipeIndex;
    let list = '';
    for (let k = -2; k <= 2; k++) {
      const i = at + k, q = this.known[i];
      if (!q) continue;
      const ok = inv.canCraft(q);
      list += `<div class="tile ${SP('SingleGrid')}${ok ? '' : ' dim'}" data-r="${i}" style="left:${P(LIST.x)};top:${P(LIST.y + k * LIST.step)}">${iconHtml({ id: q.out, count: q.n })}</div>`;
    }
    this.$('.list').innerHTML = list;
    this.$('.ings').innerHTML = !r ? '' : r.in.map(([id, n], j) => {
      const ok = inv.count(id) >= n;
      return `<div class="tile ${SP('SingleGrid')}${ok ? '' : ' dim'}" data-g="${j + 1}" style="left:${P(INGS.x + j * INGS.step)};top:${P(INGS.y)}">${iconHtml({ id, count: n })}</div>`;
    }).join('');
  }

  // ---- pad and keyboard ----------------------------------------------------------------------------

  update(dt, input) {
    if (!this.isOpen) return;
    const inv = this.game.inventory, cr = this.page === 'cr';
    if (input.consume('pause')) {
      // Start: the pause menu (what's held goes back first); Esc, back a page or out
      if (input.lastDevice === 'pad') { this.close(true); this.game.app.pause?.(); return; }
      if (cr) this.showInventory(); else this.close();
      return;
    }
    if (input.consume('back_btn')) {
      if (cr) this.showInventory();
      else if (inv.hand) { this.putBack(); this.sound('move'); this.render(); } else this.close();
      return;
    }
    if (input.consume('inventory')) { if (cr) this.showInventory(); else this.showCrafting(); return; }
    // the stick and the d-pad, with a repeat
    let dx = 0, dy = 0;
    if (input.consume('fwd') || input.consume('up')) dy = -1;
    if (input.consume('back') || input.consume('down')) dy = 1;
    if (input.consume('left') || input.consume('leftpad')) dx = -1;
    if (input.consume('right') || input.consume('rightpad')) dx = 1;
    const sy = -input.move.y, sx = input.move.x;
    const ax = Math.abs(sx) > 0.6 ? Math.sign(sx) : 0, ay = Math.abs(sy) > 0.6 ? Math.sign(sy) : 0;
    const key = `${ax},${ay}`;
    if ((ax || ay) && !dx && !dy) {
      // (the original's: half a second before it repeats, then every tenth)
      if (key !== this.stickKey) this.stickT = 0;
      this.stickT -= dt;
      if (this.stickT <= 0) { this.stickT = key === this.stickKey && this.stickRepeat ? 0.1 : 0.5; this.stickRepeat = key === this.stickKey; dx = ax; dy = ay; }
    } else if (!ax && !ay) this.stickRepeat = false;
    this.stickKey = key;
    if (dx || dy) this.pointer = false;
    if (cr) {
      if (input.consume('prev')) dx = -1;
      if (input.consume('next')) dx = 1;
      if (dy) this.moveRecipe(dy);
      if (dx && this.recipe) {
        const g = Math.max(0, Math.min(this.recipe.in.length, this.ing + dx));
        if (g !== this.ing) { this.ing = g; this.sound('move'); this.render(); }
      }
      if (input.consume('accept') || input.consume('jump')) { if (this.ing > 0) this.toComponentRecipe(); else this.craft(); }
    } else {
      if (dx || dy) {
        const x = (this.at.x + dx + 8) % 8, y = (this.at.y + dy + 5) % 5;
        this.at = { x, y };
        this.sound('move');
        this.render();
      }
      if (input.consume('accept') || input.consume('jump')) this.padUse();
      if (input.consume('crouch')) this.padSplit();
      if (input.consume('reload') || input.consume('drop')) this.dropHeld(false);
      // a number key puts what's held, or what's under the pointer (or the selector), on that slot
      for (let k = 0; k < HOTBAR; k++) {
        if (!input.consume(`slot${k + 1}`)) continue;
        const under = this.pointer ? document.elementFromPoint(this.mx, this.my)?.closest?.('[data-slot]') : null;
        const at = under ? +under.dataset.slot : this.slot;
        if (inv.hand) inv.put(k);
        else if (at !== k && (inv.slots[at] || inv.slots[k])) inv.swap(at, k);
        else continue;
        this.sound('move');
        this.render();
      }
    }
    // keep it fresh (things get picked up while it's open)
    this.t = (this.t || 0) - dt;
    if (this.t <= 0) { this.t = 0.5; this.render(); }
  }
}
