// The crafting screen, laid out like CastleMiner Z's: categories down the left, each with its
// list of kinds and a column of what you can make, the chosen one large with what it takes,
// and the backpack on the right. The hotbar stays where it is, under it all. The world doesn't
// stop while you craft.
//
// Mouse and touch: click a category, a kind, a thing; click it again (or Craft) to make it.
// Click an item in the backpack or hotbar to pick it up, click another slot to put it there.
// Pad and keyboard: up and down in a column, left and right between columns, A / Enter to
// craft, the bumpers to change category, B / Esc / Y / E to close.

import { ITEMS, RECIPES } from '../items/items.js';
import { iconFor } from '../items/icons.js';
import { HOTBAR, PACK } from '../items/inventory.js';

export const CRAFT_CSS = /* css */ `
.craft { position: absolute; inset: 0; display: none; pointer-events: auto; z-index: 4; font-family: 'Saira Semi Condensed', 'Saira Condensed', 'Arial Narrow', var(--ui-font); background: rgba(0, 0, 0, 0.32); }
.craft.on { display: block; }
.craft .cp { position: absolute; background: linear-gradient(180deg, rgba(20, 50, 76, 0.93), rgba(14, 38, 60, 0.93)); border: 0.1em solid rgba(110, 168, 210, 0.8); box-shadow: 0 0.3em 1.2em rgba(0,0,0,0.5), inset 0 0 0 0.06em rgba(0,0,0,0.5); }
.craft .tab { position: absolute; top: -1.7em; left: 1em; height: 1.7em; padding: 0 1.6em; background: linear-gradient(180deg, rgba(24, 58, 86, 0.95), rgba(20, 50, 76, 0.95)); border: 0.1em solid rgba(110, 168, 210, 0.8); border-bottom: none; clip-path: polygon(0.7em 0, calc(100% - 0.7em) 0, 100% 100%, 0 100%); color: #ff7a30; font-weight: 700; font-size: 0.95em; line-height: 1.75em; letter-spacing: 0.02em; text-transform: uppercase; }
.craft .left { left: 15%; top: 7.5%; width: 37.5em; height: 33.6em; }
.craft .right { left: calc(15% + 39.6em); top: 14%; width: 15.8em; height: 30.2em; }
.craft .cats { position: absolute; left: 0.9em; top: 1em; width: 15em; display: flex; flex-direction: column; gap: 0.6em; }
.craft .cat { position: relative; height: 2.25em; background: linear-gradient(180deg, #17405f, #102f4b); border: 0.08em solid #4a7ea6; display: flex; align-items: center; justify-content: flex-end; padding-right: 3.6em; color: #5cb8ff; font-weight: 700; cursor: pointer; text-shadow: 0 0.06em 0.1em rgba(0,0,0,0.6); }
.craft .cat span { font-size: 1.32em; }
.craft .cat svg { position: absolute; right: 0.55em; top: 50%; width: 1.9em; height: 1.9em; transform: translateY(-50%); color: #5cb8ff; }
.craft .cat::after { content: ''; position: absolute; right: 3em; top: 0.35em; bottom: 0.35em; width: 0.06em; background: rgba(120, 170, 210, 0.35); }
.craft .cat.sel { border: 0.12em solid #ffffff; color: #ffffff; background: linear-gradient(180deg, #1d4d72, #133a5a); }
.craft .cat.sel svg { color: #ffffff; }
.craft .focus0 .cat.sel, .craft .focus1 .sub.sel, .craft .focus2 .tile.sel { box-shadow: 0 0 0.6em rgba(140, 200, 255, 0.55); }
.craft .detail { position: absolute; left: 0.9em; top: 12.4em; width: 15em; height: 16.3em; border: 0.08em solid #4a7ea6; background: rgba(10, 30, 48, 0.55); padding: 0.85em; }
.craft .big { width: 7.6em; height: 7.6em; border: 0.1em solid #0a1a28; background: rgba(8, 24, 40, 0.75); box-shadow: inset 0 0 0 0.08em rgba(255,255,255,0.08); display: grid; place-items: center; }
.craft .big img { width: 6.5em; height: 6.5em; }
.craft .comps { position: absolute; left: 9.1em; top: 1.3em; right: 0.5em; color: #a9cfee; font-size: 0.86em; line-height: 1.45; font-weight: 600; }
.craft .comps b { font-weight: 600; color: #a9cfee; }
.craft .comps .no { color: #ff7a6a; }
.craft .dname { margin-top: 0.4em; color: #4fb4ff; font-size: 1.45em; font-weight: 700; line-height: 1.1; }
.craft .ddesc { color: #a9cfee; font-size: 0.86em; font-weight: 600; line-height: 1.35; margin-top: 0.2em; }
.craft .makes { color: #ffd27a; font-size: 0.8em; font-weight: 700; margin-top: 0.25em; }
.craft .cbtn { position: absolute; left: 0.85em; right: 0.85em; bottom: 0.75em; height: 2em; display: flex; align-items: center; justify-content: center; gap: 0.4em; border: 0.08em solid #4a7ea6; background: linear-gradient(180deg, #1f5a86, #154468); color: #fff; font-weight: 700; font-size: 1.05em; cursor: pointer; }
.craft .cbtn.no { opacity: 0.45; cursor: default; }
.craft .cbtn .btn { font-family: var(--ui-font); }
.craft .subs { position: absolute; left: 17.3em; top: 7.3em; width: 6.1em; display: flex; flex-direction: column; gap: 0.38em; }
.craft .sub { height: 1.55em; background: linear-gradient(180deg, #1f5480, #183f62); border: 0.06em solid #2c5f88; color: #6cc3ff; font-weight: 700; font-size: 0.86em; padding-left: 0.55em; line-height: 1.45em; white-space: nowrap; overflow: hidden; cursor: pointer; box-shadow: 0.15em 0.15em 0 rgba(0,0,0,0.35); }
.craft .sub.sel { border: 0.1em solid #ffffff; color: #ffffff; background: transparent; }
.craft .tiles { position: absolute; left: 24.3em; top: 1.5em; width: 3.7em; display: flex; flex-direction: column; gap: 0.4em; }
.craft .tile { position: relative; width: 3.6em; height: 3.6em; background: rgba(24, 62, 92, 0.65); border: 0.06em solid #24506f; display: grid; place-items: center; cursor: pointer; }
.craft .tile img { width: 3em; height: 3em; }
.craft .tile.no img { opacity: 0.35; filter: saturate(0.4); }
.craft .tile.sel { border: 0.12em solid #ffffff; }
.craft .tile .n { position: absolute; right: 0.15em; bottom: 0.05em; font-size: 0.7em; font-weight: 700; color: #fff; text-shadow: 0 0.06em 0.12em #000; }
.craft .need { position: absolute; left: 0.9em; bottom: 0.9em; display: flex; gap: 0.4em; align-items: center; }
.craft .need .arrow { width: 0; height: 0; border-top: 0.75em solid transparent; border-bottom: 0.75em solid transparent; border-left: 0.9em solid #4fb4ff; margin-right: 0.3em; }
.craft .need .tile { width: 3.3em; height: 3.3em; }
.craft .need .tile img { width: 2.7em; height: 2.7em; }
.craft .need .tile .n { font-size: 0.85em; left: 0.2em; right: auto; }
.craft .need .tile.short .n { color: #ff7a6a; }
.craft .grid { position: absolute; left: 0.85em; top: 0.9em; display: grid; grid-template-columns: repeat(4, 3.4em); gap: 0.12em; }
.craft .grid .slot, .craft .carry { width: 3.4em; height: 3.4em; background: rgba(24, 60, 90, 0.55); border: 0.06em solid rgba(60, 100, 130, 0.65); }
.craft .grid .slot.hl { border: 0.1em solid #fff; }
.craft .grid .slot .n, .craft .carry .n { font-size: 0.8em; color: #fff; }
.craft .carry { position: fixed; pointer-events: none; z-index: 9; background: transparent; border: none; display: none; transform: translate(-50%, -50%); }
.craft .carry img { position: absolute; inset: 0.15em; width: calc(100% - 0.3em); height: calc(100% - 0.3em); }
.craft .carry .n { position: absolute; right: 0.15em; bottom: 0.05em; font-weight: 700; text-shadow: 0 0.06em 0.12em #000; }
.craft .help { position: absolute; left: 0; bottom: -2em; display: flex; gap: 1.4em; font-family: var(--ui-font); font-size: 0.78em; font-weight: 700; color: #fff; }
.craft .help span { display: inline-flex; gap: 0.35em; align-items: center; }
.craft .x { position: absolute; right: 0.4em; top: 0.3em; width: 1.6em; height: 1.6em; display: grid; place-items: center; color: #9fd0ff; font-size: 1.1em; font-weight: 700; cursor: pointer; font-family: var(--ui-font); }
@media (max-aspect-ratio: 4/3) {
  .craft .left { left: 2%; }
  .craft .right { left: auto; right: 2%; }
}
`;

// the categories, CastleMiner Z's four, and the kinds within each
const CATS = [
  { id: 'materials', name: 'Materials', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 20 14 10M14 10l3-6 3 3-6 3M10 4l10 10M7 7l3-3"/></svg>' },
  { id: 'tools', name: 'Tools', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 21 15 7M4 7c4-4 10-4 15 1-4-2-8-2-11 1"/></svg>' },
  { id: 'weapons', name: 'Weapons', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 7h17l1.5-1.5H22V11h-6.5l-1.2 1.6H11L9.6 19H5.2l1.5-7.4H2z"/></svg>' },
  { id: 'structures', name: 'Structures', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="14" y="3" width="6" height="6"/><rect x="8" y="9" width="6" height="6"/><rect x="14" y="9" width="6" height="6"/><rect x="2" y="15" width="6" height="6"/><rect x="8" y="15" width="6" height="6"/><rect x="14" y="15" width="6" height="6"/></svg>' },
];
const ORDER = {
  materials: ['Wood', 'Metals'],
  tools: ['PickAxes', 'Spades', 'Axes', 'Compass'],
  weapons: ['Ammo', 'Knives', 'Pistols', 'Shotguns', 'Rifles', 'Assault Rifles', "SMG's"],
  structures: ['Lights', 'Walls', 'Blocks'],
};

function groupOf(rec) {
  const it = ITEMS[rec.out];
  if (rec.tab === 'ammo') return ['weapons', 'Ammo'];
  if (it.kind === 'tool') return ['tools', { pick: 'PickAxes', spade: 'Spades', axe: 'Axes', compass: 'Compass' }[it.tool]];
  if (it.kind === 'melee') return ['weapons', 'Knives'];
  if (it.kind === 'gun') return ['weapons', { pistol: 'Pistols', smg: "SMG's", assault: 'Assault Rifles', shotgun: 'Shotguns', rifle: 'Rifles' }[it.gun]];
  if (rec.out === 'wood' || rec.out === 'stick') return ['materials', 'Wood'];
  if (['copper', 'iron', 'gold'].includes(rec.out)) return ['materials', 'Metals'];
  if (rec.out === 'torch' || rec.out === 'lantern') return ['structures', 'Lights'];
  if (rec.out.endsWith('_wall')) return ['structures', 'Walls'];
  return ['structures', 'Blocks'];
}

// category -> [{ name, recipes }]
function buildTree() {
  const tree = {};
  for (const c of CATS) tree[c.id] = ORDER[c.id].map((name) => ({ name, recipes: [] }));
  for (const r of RECIPES) {
    const [cat, sub] = groupOf(r);
    const list = tree[cat];
    let g = list.find((x) => x.name === sub);
    if (!g) { g = { name: sub, recipes: [] }; list.push(g); }
    g.recipes.push(r);
  }
  for (const c of CATS) tree[c.id] = tree[c.id].filter((g) => g.recipes.length);
  return tree;
}

export class Crafting {
  constructor(parent, game) {
    this.game = game;
    this.tree = buildTree();
    this.cat = 2; // Weapons first, as the original opened
    this.sub = 0;
    this.tile = 0;
    this.focus = 2;
    this.isOpen = false;
    this.carry = null; // slot index being carried
    const el = document.createElement('div');
    el.className = 'craft ui';
    el.innerHTML = `
      <div class="cp left"><div class="tab">Crafting</div><div class="x">✕</div>
        <div class="cats"></div><div class="detail"></div><div class="subs"></div><div class="tiles"></div><div class="need"></div>
        <div class="help txt"></div>
      </div>
      <div class="cp right"><div class="tab">Inventory</div><div class="grid"></div></div>
      <div class="carry slot"><img alt=""><span class="n"></span></div>`;
    parent.appendChild(el);
    this.el = el;
    this.$ = (s) => el.querySelector(s);
    this.left = this.$('.left');
    this.carryEl = this.$('.carry');
    this.$('.x').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); });
    // the backpack
    const grid = this.$('.grid');
    this.packEls = [];
    for (let i = 0; i < PACK; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt="" draggable="false"><span class="n"></span>';
      s.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.slotClick(HOTBAR + i); });
      s.addEventListener('pointerenter', () => { this.hover = HOTBAR + i; });
      s.addEventListener('pointerleave', () => { if (this.hover === HOTBAR + i) this.hover = null; });
      grid.appendChild(s);
      this.packEls.push(s);
    }
    el.addEventListener('pointermove', (e) => { this.mx = e.clientX; this.my = e.clientY; this.placeCarry(); });
    // a click on the backdrop drops what's carried back where it came from
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.carry = null; this.renderInv(); });
    // the hotbar takes things too, while this is up
    game.hud.slots.forEach((S, i) => S.el.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      e.stopPropagation();
      this.slotClick(i);
    }, true));
    this.render();
  }

  get group() { return this.tree[CATS[this.cat].id][this.sub]; }
  get recipe() { return this.group?.recipes[this.tile]; }

  open() {
    this.isOpen = true;
    this.carry = null;
    this.el.classList.add('on');
    this.render();
  }

  // quiet: closed by something else (the pause menu), which looks after the mouse itself
  close(quiet = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.carry = null;
    this.el.classList.remove('on');
    this.game.closedCrafting(quiet);
  }

  dispose() { this.el.remove(); }

  // ---- what's chosen -----------------------------------------------------------------------------

  setCat(i) { this.cat = (i + CATS.length) % CATS.length; this.sub = 0; this.tile = 0; this.render(); this.game.audio?.ui?.('move'); }
  setSub(i) { const n = this.tree[CATS[this.cat].id].length; this.sub = (i + n) % n; this.tile = 0; this.render(); this.game.audio?.ui?.('move'); }
  setTile(i) { const n = this.group.recipes.length; this.tile = (i + n) % n; this.render(); this.game.audio?.ui?.('move'); }

  craft() {
    const r = this.recipe, g = this.game;
    if (!r) return;
    if (!g.inventory.craft(r)) { g.audio?.ui?.('deny'); return; }
    g.stats.crafted++;
    if (ITEMS[r.out].kind === 'gun') g.stats.guns = (g.stats.guns || 0) + 1;
    g.audio?.craft?.(r.out);
    this.render();
  }

  // ---- the backpack ---------------------------------------------------------------------------------

  slotClick(i) {
    const inv = this.game.inventory;
    if (this.carry == null) {
      if (inv.slots[i]) { this.carry = i; this.game.audio?.ui?.('move'); }
    } else {
      inv.moveTo(this.carry, i);
      this.carry = null;
      this.game.audio?.ui?.('move');
    }
    this.renderInv();
  }

  placeCarry() {
    const c = this.carryEl;
    if (this.carry == null || this.mx == null) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    c.style.left = `${this.mx}px`;
    c.style.top = `${this.my}px`;
  }

  // ---- drawing ----------------------------------------------------------------------------------------

  render() {
    if (!this.isOpen) return;
    const inv = this.game.inventory;
    const cats = this.$('.cats');
    cats.innerHTML = CATS.map((c, i) => `<div class="cat${i === this.cat ? ' sel' : ''}" data-i="${i}"><span>${c.name}</span>${c.icon}</div>`).join('');
    cats.querySelectorAll('.cat').forEach((d) => d.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.focus = 0; this.setCat(+d.dataset.i); }));
    const groups = this.tree[CATS[this.cat].id];
    const subs = this.$('.subs');
    subs.innerHTML = groups.map((g, i) => `<div class="sub${i === this.sub ? ' sel' : ''}" data-i="${i}">${g.name}</div>`).join('');
    subs.querySelectorAll('.sub').forEach((d) => d.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.focus = 1; this.setSub(+d.dataset.i); }));
    const tiles = this.$('.tiles');
    tiles.innerHTML = this.group.recipes.map((r, i) => {
      const ok = inv.canCraft(r);
      return `<div class="tile${i === this.tile ? ' sel' : ''}${ok ? '' : ' no'}" data-i="${i}"><img alt="" draggable="false" src="${iconFor(r.out)}">${r.n > 1 ? `<span class="n">${r.n}</span>` : ''}</div>`;
    }).join('');
    tiles.querySelectorAll('.tile').forEach((d) => d.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const i = +d.dataset.i;
      this.focus = 2;
      if (i === this.tile) this.craft(); else this.setTile(i);
    }));
    this.left.className = `cp left focus${this.focus}`;
    // the chosen thing
    const r = this.recipe, it = ITEMS[r.out];
    const ok = inv.canCraft(r);
    const comps = r.in.map(([id, n]) => {
      const have = inv.count(id);
      return `<div class="${have >= n ? '' : 'no'}">${ITEMS[id].name} ${n}<b> (${have})</b></div>`;
    }).join('');
    const pad = this.game.app.input.lastDevice === 'pad';
    this.$('.detail').innerHTML = `
      <div class="big"><img alt="" draggable="false" src="${iconFor(r.out)}"></div>
      <div class="comps">Components:${comps}</div>
      <div class="dname">${it.name}</div>
      <div class="ddesc">${it.desc || ''}</div>
      ${r.n > 1 ? `<div class="makes">Makes ${r.n}</div>` : ''}
      <div class="cbtn${ok ? '' : ' no'}">${pad ? '<span class="btn a">A</span>' : ''}Craft</div>`;
    this.$('.detail .cbtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.craft(); });
    this.$('.need').innerHTML = `<div class="arrow"></div>${r.in.map(([id, n]) => {
      const have = inv.count(id);
      return `<div class="tile${have >= n ? '' : ' short'}"><img alt="" draggable="false" src="${iconFor(id)}"><span class="n">${have}</span></div>`;
    }).join('')}`;
    this.$('.help').innerHTML = pad
      ? '<span><span class="btn a">A</span> Craft</span><span>LB / RB Category</span><span><span class="btn b">B</span> Close</span>'
      : this.game.app.isTouch ? '' : '<span><span class="key">Enter</span> Craft</span><span><span class="key">Esc</span> Close</span>';
    this.renderInv();
  }

  renderInv() {
    const inv = this.game.inventory;
    this.packEls.forEach((s, k) => {
      const i = HOTBAR + k;
      const sl = inv.slots[i];
      const img = s.querySelector('img'), n = s.querySelector('.n');
      s.classList.toggle('hl', this.carry === i);
      if (!sl) { img.style.display = 'none'; img.removeAttribute('src'); n.textContent = ''; return; }
      img.style.display = '';
      img.src = iconFor(sl.id);
      n.textContent = ITEMS[sl.id].stack > 1 && sl.count > 1 ? sl.count : '';
    });
    const c = this.carry != null ? inv.slots[this.carry] : null;
    if (c) {
      this.carryEl.querySelector('img').src = iconFor(c.id);
      this.carryEl.querySelector('.n').textContent = c.count > 1 ? c.count : '';
    }
    this.placeCarry();
  }

  // ---- pad and keyboard ----------------------------------------------------------------------------

  update(dt, input) {
    if (!this.isOpen) return;
    if (input.consume('inventory') || input.consume('back_btn') || input.consume('pause')) { this.close(); return; }
    if (input.consume('accept') || input.consume('jump')) {
      if (this.focus === 2) this.craft(); else { this.focus++; this.render(); }
    }
    if (input.consume('next') || input.consume('reload')) this.setCat(this.cat + 1);
    if (input.consume('prev') || input.consume('drop')) this.setCat(this.cat - 1);
    let dy = 0, dx = 0;
    if (input.consume('fwd') || input.consume('up')) dy = -1;
    if (input.consume('back') || input.consume('down')) dy = 1;
    if (input.consume('left') || input.consume('leftpad')) dx = -1;
    if (input.consume('right') || input.consume('rightpad')) dx = 1;
    // the stick, with a repeat
    const sy = -input.move.y, sx = input.move.x;
    const ax = Math.abs(sx) > 0.6 ? Math.sign(sx) : 0, ay = Math.abs(sy) > 0.6 ? Math.sign(sy) : 0;
    const key = `${ax},${ay}`;
    if ((ax || ay) && !dx && !dy) {
      if (key !== this.stickKey) this.stickT = 0;
      this.stickT -= dt;
      if (this.stickT <= 0) { this.stickT = key === this.stickKey ? 0.14 : 0.36; dx = ax; dy = ay; }
    }
    this.stickKey = key;
    if (dx) { this.focus = Math.max(0, Math.min(2, this.focus + dx)); this.render(); }
    if (dy) {
      if (this.focus === 0) this.setCat(this.cat + dy);
      else if (this.focus === 1) this.setSub(this.sub + dy);
      else this.setTile(this.tile + dy);
    }
    // number keys move the hovered backpack item onto that hotbar slot
    if (this.hover != null) for (let i = 0; i < HOTBAR; i++) if (input.consume(`slot${i + 1}`)) { this.game.inventory.swap(this.hover, i); this.renderInv(); }
    // keep counts fresh (things get picked up while the screen is open)
    this.t = (this.t || 0) - dt;
    if (this.t <= 0) { this.t = 0.5; this.renderInv(); }
  }
}
