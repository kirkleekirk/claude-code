/* Raids: car generation, movement, rooms, events, extraction and death. */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const ENG = LCO.engine;
  const EXITS = ['far', 'hatch', 'locked', 'toll', 'home'];

  const key = (x, y) => x + ',' + y;
  const cellAt = (raid, x, y) => (x < 0 || y < 0 || x >= raid.w || y >= raid.h ? null : raid.cells[y * raid.w + x]);
  const cellByKey = (raid, k) => { const [x, y] = k.split(',').map(Number); return cellAt(raid, x, y); };
  const here = (raid) => cellAt(raid, raid.pos.x, raid.pos.y);
  const isExit = (t) => EXITS.includes(t);

  function hasPeaceful(theme) { return (D.CARS[theme].fams || []).some((f) => (D.FAMILIES[f] || []).some((id) => (D.ENEMIES[id].tags || []).includes('peaceful'))); }
  function lessonFits(theme, lesson) {
    if (theme === 'engine') return lesson === 'long_way' || lesson === 'resolve' || lesson === 'courage';
    if (lesson === 'mercy') return hasPeaceful(theme);
    return true;
  }

  /* ---------- generation ---------- */
  function genCar(G, offer) {
    const tier = offer.tier;
    const theme = offer.theme;
    const engine = theme === 'engine';
    const w = engine ? 11 : 6 + Math.floor(tier / 2);
    const h = engine ? 3 : tier >= 4 ? 4 : 3;
    const S = ENG.stats.compute(G);
    const cells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y, k: key(x, y), type: 'empty', seen: false, visited: false, done: false });
    const raid = {
      car: { theme, name: D.CARS[theme].name, num: offer.num, tier, mod: offer.mod, lesson: offer.lesson, rumor: offer.rumor },
      w, h, cells, pos: { x: 0, y: 0 }, prev: null, instability: 0, hp: S.maxHp, backpack: [],
      carry: { tickets: 0, scrap: 0, glimmer: 0 }, xp: 0, flags: {}, once: {}, moves: 0, combat: null, view: null,
      pendingFight: null, pendingEnter: false, nextFight: null, log: [], numberDelta: 0, startNumber: G.number, usedEvents: [],
    };
    const at = (x, y) => cells[y * w + x];
    const entryY = R.int(0, h - 1);
    at(0, entryY).type = 'entry';
    raid.pos = { x: 0, y: entryY };
    const farY = R.int(0, h - 1);
    const open = (fn) => cells.filter((c) => c.type === 'empty' && c.x > 0 && (!fn || fn(c)));
    const place = (type, fn) => { const l = open(fn); if (!l.length) return null; const c = R.pick(l); c.type = type; return c; };
    const nearEntry = (c) => Math.abs(c.x - 0) + Math.abs(c.y - entryY) <= 1;

    if (engine) {
      const midY = R.int(0, h - 1);
      for (let y = 0; y < h; y++) { at(5, y).type = y === midY ? 'boss' : 'wall'; at(10, y).type = y === farY ? 'boss' : 'wall'; }
      at(5, midY).boss = 'great_steward';
      at(10, farY).boss = 'conductor_echo';
      place('hatch', (c) => c.x === 3 || c.x === 4);
      place('rest', (c) => c.x >= 6 && c.x <= 9);
      place('rest', (c) => c.x >= 1 && c.x <= 4 && !nearEntry(c));
      place('elite', (c) => c.x >= 6 && c.x <= 9);
      place('elite', (c) => c.x >= 2 && c.x <= 4);
      place('vault', (c) => c.x >= 6 && c.x <= 9);
    } else {
      at(w - 1, farY).type = 'far';
      /* impassable wreckage, never cutting the car in two */
      const walls = tier >= 2 ? R.int(1, 2) : 0;
      for (let i = 0; i < walls; i++) {
        const c = R.pick(open((c) => c.x > 1 && c.x < w - 2));
        if (!c) break;
        c.type = 'wall';
        if (!connected(raid)) c.type = 'empty';
      }
      const hatches = 1 + (tier >= 5 ? 1 : 0);
      for (let i = 0; i < hatches; i++) place('hatch', (c) => c.x >= 2 && c.x <= w - 3);
      if (tier >= 2 && R.chance(0.5)) place('locked', (c) => c.x >= Math.floor(w / 2));
      if (tier >= 3 && R.chance(0.4)) place('toll', (c) => c.x >= 2);
      place('elite', (c) => c.x >= Math.ceil(w / 2));
      if (R.chance(0.7) || offer.rumor === 'relic' || offer.lesson === 'honesty') place('vault', (c) => c.x >= 2);
      place('rest', (c) => !nearEntry(c));
      if (w >= 9) place('rest', (c) => c.x >= Math.floor(w / 2));
      if (R.chance(0.35)) place('shrine', (c) => c.x >= 2);
      if (R.chance(0.3) || S.flags.merchantEveryCar || offer.rumor === 'merchant') place('merchant', (c) => c.x >= 1);
      if (offer.mod === 'hunted' || G.number >= 150) place('hunter', (c) => c.x >= 2 && !nearEntry(c));
      if (offer.lesson === 'kindness') { const c = place('event', (c) => !nearEntry(c)); if (c) c.forceEvent = R.pick(['wounded', 'lost_denizen']); }
    }
    const quiet = offer.rumor === 'quiet', rich = offer.rumor === 'rich';
    for (const c of cells) {
      if (c.type !== 'empty' || c.x === 0 && c.y === entryY) continue;
      c.type = R.weighted([[quiet ? 18 : engine ? 42 : 34, 'fight'], [rich ? 36 : 26, 'cache'], [engine ? 6 : 16, 'event'], [quiet ? 30 : 16, 'empty'], [engine ? 4 : 8, 'trap']]);
      if (nearEntry(c) && c.type === 'fight' && R.chance(0.5)) c.type = 'empty';
    }
    at(0, entryY).visited = true;
    at(0, entryY).done = true;
    at(w - 1, farY).seen = true;
    if (S.flags.revealMap) for (const c of cells) c.seen = true;
    if (S.flags.revealExits) for (const c of cells) if (isExit(c.type)) c.seen = true;
    refreshSight(raid, S);
    return raid;
  }

  function connected(raid) {
    const start = raid.cells.find((c) => c.type === 'entry');
    const seen = new Set([start.k]);
    const q = [start];
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = cellAt(raid, c.x + dx, c.y + dy);
        if (n && n.type !== 'wall' && !seen.has(n.k)) { seen.add(n.k); q.push(n); }
      }
    }
    return raid.cells.every((c) => c.type === 'wall' || seen.has(c.k));
  }

  function sightRadius(raid, S) { return raid.car.mod === 'lights_out' ? 1 : S.sight; }
  function refreshSight(raid, S) {
    const r = sightRadius(raid, S);
    for (const v of raid.cells) {
      if (!v.visited) continue;
      for (const c of raid.cells) if (Math.abs(c.x - v.x) + Math.abs(c.y - v.y) <= r) c.seen = true;
    }
  }

  function moveCost(raid, S, target) {
    let c = (5.5 + 0.25 * raid.car.tier) * (1 - S.instabilitySlow);
    if (raid.car.mod === 'unsteady') c *= 1.3;
    if (raid.car.theme === 'engine') c *= 0.8;
    if (target && target.visited) c *= 0.6;
    return Math.round(c * 10) / 10;
  }

  function log(raid, t, cls) { raid.log.push({ t, cls: cls || '' }); if (raid.log.length > 40) raid.log.shift(); }

  /* ---------- fights ---------- */
  function familyPool(theme) {
    const fams = D.CARS[theme].fams;
    const ids = [].concat(...fams.map((f) => D.FAMILIES[f] || []));
    return { normal: ids.filter((id) => !D.ENEMIES[id].elite && !D.ENEMIES[id].boss && !D.ENEMIES[id].hunter), elite: ids.filter((id) => D.ENEMIES[id].elite && !D.ENEMIES[id].hunter) };
  }
  function genFightIds(G, raid, cell) {
    const tier = raid.car.tier;
    const pool = familyPool(raid.car.theme);
    if (cell.type === 'boss') return cell.boss === 'great_steward' ? ['great_steward', 'static_thing', 'static_thing'] : ['conductor_echo'];
    if (cell.type === 'hunter') return tier >= 5 ? ['steward', R.pick(pool.normal)] : ['steward'];
    if (cell.type === 'elite') {
      const ids = [R.pick(pool.elite.length ? pool.elite : ['steward'])];
      if (tier >= 3) ids.push(R.pick(pool.normal));
      return ids;
    }
    if (raid.car.lesson === 'mercy' && !raid.flags.mercyPlaced && R.chance(0.6)) {
      const peaceful = pool.normal.filter((id) => (D.ENEMIES[id].tags || []).includes('peaceful'));
      if (peaceful.length) { raid.flags.mercyPlaced = true; return [R.pick(peaceful), R.pick(peaceful)]; }
    }
    let n = 1 + (R.chance(0.5 + 0.05 * tier) ? 1 : 0) + (tier >= 4 && R.chance(0.3) ? 1 : 0) + (raid.car.mod === 'garrison' ? 1 : 0);
    n = Math.min(4, n);
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(R.chance(0.08) ? 'scavenger' : R.pick(pool.normal));
    return ids;
  }
  function roomFight(G, cell) {
    const raid = G.raid;
    const live = (cell.enemies || []).filter((e) => e.hp > 0 && !e.fled);
    const kind = cell.type === 'boss' ? 'boss' : cell.type === 'elite' || cell.type === 'hunter' ? 'elite' : 'fight';
    const depthF = cell.x / Math.max(1, raid.w - 1);
    const titles = { boss: cell.boss === 'conductor_echo' ? 'At the very front of the train, someone is waiting in a conductor’s cap.' : 'A Steward the size of a house turns its single eye on you.', elite: 'Something bigger than the rest blocks the way.', fight: 'Denizens block your way.' };
    if (cell.type === 'hunter') titles.elite = 'A Steward swivels toward you. It has been looking for you.';
    if (live.length) ENG.combat.start(G, { enemies: live, kind, roomKey: cell.k, title: 'They are still here, waiting.' });
    else ENG.combat.start(G, { ids: genFightIds(G, raid, cell), kind, depthF, roomKey: cell.k, title: titles[kind] });
    raid.view = null;
  }

  /* ---------- movement ---------- */
  function canMoveTo(raid, x, y) {
    const c = cellAt(raid, x, y);
    if (!c || c.type === 'wall' || raid.combat) return false;
    return Math.abs(raid.pos.x - x) + Math.abs(raid.pos.y - y) === 1;
  }
  function move(G, x, y) {
    const raid = G.raid;
    if (!raid || !canMoveTo(raid, x, y)) return false;
    const S = ENG.stats.compute(G);
    const target = cellAt(raid, x, y);
    raid.instability = Math.round((raid.instability + moveCost(raid, S, target)) * 10) / 10;
    raid.moves += 1;
    raid.view = null;
    raid.pendingFight = null;
    if (raid.car.mod === 'scorching') raid.hp = Math.max(0, raid.hp - Math.max(1, Math.round(S.maxHp * 0.02)));
    if (raid.instability >= 150) return ENG.raid.die(G, 'unmade');
    if (raid.instability >= 100) {
      if (!S.flags.lastCarOut) {
        const d = Math.round(S.maxHp * 0.1);
        raid.hp = Math.max(0, raid.hp - d);
        log(raid, `The car is coming apart. Debris hits you for ${d}.`, 'bad');
      } else if (!raid.flags.lastCarLogged) {
        raid.flags.lastCarLogged = true;
        log(raid, 'Last Car Out: the collapse only makes you faster.', 'good');
      }
    }
    if (raid.hp <= 0) return ENG.raid.die(G, 'collapse');
    raid.prev = { x: raid.pos.x, y: raid.pos.y };
    raid.pos = { x, y };
    target.visited = true;
    refreshSight(raid, S);
    enter(G, target);
    return true;
  }

  function enter(G, cell) {
    const raid = G.raid;
    const S = ENG.stats.compute(G);
    const theme = D.CARS[raid.car.theme];
    const tier = raid.car.tier;
    switch (cell.type) {
      case 'entry': log(raid, 'The door you came through is gone. It always is.'); break;
      case 'empty':
        if (!cell.done) { cell.done = true; log(raid, R.pick(theme.flavor)); }
        if (cell.loot && hasLoot(cell.loot)) raid.view = { type: 'container', key: cell.k, title: 'Left behind' };
        break;
      case 'cache':
        if (!cell.loot) cell.loot = ENG.loot.rollCache(tier, cell.x / Math.max(1, raid.w - 1), S, raid.car.mod);
        cell.done = true;
        raid.view = { type: 'container', key: cell.k, title: R.pick(['A forgotten suitcase', 'A luggage rack', 'A locked-looking crate (it isn’t)', 'Somebody’s picnic basket', 'A cabinet of oddments']) };
        break;
      case 'fight': case 'elite': case 'hunter': case 'boss':
        if (!cell.done) roomFight(G, cell);
        else if (cell.loot && hasLoot(cell.loot)) raid.view = { type: 'container', key: cell.k, title: 'Spoils' };
        break;
      case 'event': case 'shrine':
        if (!cell.done) {
          if (!cell.event) cell.event = pickEvent(G, cell);
          raid.view = { type: 'event', key: cell.k };
        } else if (cell.loot && hasLoot(cell.loot)) raid.view = { type: 'container', key: cell.k, title: 'Left behind' };
        break;
      case 'rest': raid.view = { type: 'rest', key: cell.k }; break;
      case 'vault': raid.view = cell.opened ? { type: 'container', key: cell.k, title: 'The open vault' } : { type: 'vault', key: cell.k }; break;
      case 'merchant':
        if (!cell.stock) cell.stock = merchantStock(tier);
        raid.view = { type: 'merchant', key: cell.k };
        break;
      case 'trap':
        if (!cell.done) {
          cell.done = true;
          if (R.chance(Math.min(0.75, S.dodge * 1.5))) log(raid, 'A floor panel gives way — you leap clear just in time.', 'good');
          else {
            const d = Math.round(S.maxHp * 0.1 + tier * 2);
            raid.hp = Math.max(0, raid.hp - d);
            log(raid, `${R.pick(['A steam vent bursts', 'A loose panel swings down', 'The floor bites'])}. You take ${d} damage.`, 'bad');
            if (raid.hp <= 0) return ENG.raid.die(G, 'hazard');
          }
        }
        break;
      default:
        if (isExit(cell.type)) raid.view = { type: 'exit', key: cell.k };
    }
    return true;
  }

  function pickEvent(G, cell) {
    const raid = G.raid;
    if (cell.forceEvent) { raid.usedEvents.push(cell.forceEvent); return cell.forceEvent; }
    if (cell.type === 'shrine') return 'shrine_offer';
    const pool = Object.values(D.EVENTS).filter((e) => !e.shrine && (e.minTier || 1) <= raid.car.tier && !raid.usedEvents.includes(e.id));
    const ev = pool.length ? R.pick(pool) : D.EVENTS.lost_luggage;
    raid.usedEvents.push(ev.id);
    return ev.id;
  }

  function merchantStock(tier) {
    const L = ENG.loot;
    return [L.rollConsumable(), L.rollConsumable(), L.makeConsumable(R.pick(['bandage', 'beans']), 1), L.rollGear(tier, { minRarity: 1, rarityBoost: 1 })];
  }

  const hasLoot = (l) => l && (l.items.length || l.tickets || l.scrap || l.glimmer);

  Object.assign(ENG, { raid: { genCar, move, enter, canMoveTo, cellAt, cellByKey, here, isExit, refreshSight, moveCost, log, roomFight, lessonFits, hasLoot, key, EXITS } });
})();

/* ---------- raid actions: loot, events, rooms, exits, death ---------- */
(function () {
  'use strict';
  const D = LCO.data;
  const R = LCO.R;
  const U = LCO.U;
  const ENG = LCO.engine;
  const RA = ENG.raid;
  const { cellByKey, here, log, hasLoot } = RA;

  const S_ = (G) => ENG.stats.compute(G);

  /* Put an item in the backpack, or on the floor of the current room when full. */
  function give(G, item) {
    const raid = G.raid;
    const S = S_(G);
    if (item.kind === 'consumable') {
      const stack = raid.backpack.find((i) => i.kind === 'consumable' && i.base === item.base && i.qty < D.STACK_MAX);
      if (stack) {
        const room = D.STACK_MAX - stack.qty;
        const moved = Math.min(room, item.qty);
        stack.qty += moved;
        item.qty -= moved;
        if (item.qty <= 0) return 'pack';
      }
    }
    if (raid.backpack.length < S.backpack) { raid.backpack.push(item); return 'pack'; }
    const cell = here(raid);
    cell.loot = cell.loot || { items: [], tickets: 0, scrap: 0, glimmer: 0 };
    cell.loot.items.push(item);
    return 'floor';
  }

  function finishCombat(G) {
    const raid = G.raid;
    const cb = raid && raid.combat;
    if (!cb || !cb.over) return;
    const S = S_(G);
    raid.hp = U.clamp(cb.p.hp, 0, S.maxHp);
    if (cb.over === 'lost') return die(G, 'fight');
    raid.xp += cb.rewards.xp;
    raid.carry.tickets += cb.rewards.tickets;
    raid.carry.scrap += cb.rewards.scrap;
    raid.instability += 3;
    const cell = cb.roomKey ? cellByKey(raid, cb.roomKey) : here(raid);
    cell.loot = cell.loot || { items: [], tickets: 0, scrap: 0, glimmer: 0 };
    cell.loot.items.push(...cb.rewards.items);
    raid.combat = null;
    if (cb.over === 'won' || cb.over === 'spared') {
      raid.flags.foughtWon = raid.flags.foughtWon || cb.over === 'won';
      cell.done = true;
      cell.enemies = null;
      if (cell.type === 'vault' && !cell.opened) { openVault(G, cell); return; }
      if (cell.type === 'boss' && cell.boss === 'conductor_echo') {
        cell.type = 'home';
        raid.flags.echoBeaten = true;
        log(raid, 'The Echo fades. Behind it, a plain wooden door with a brass knob. It looks like yours.', 'good');
      }
      if (cell.type === 'hunter') cell.type = 'empty';
      raid.view = hasLoot(cell.loot) ? { type: 'container', key: cell.k, title: 'Spoils' } : null;
      if (RA.isExit(cell.type)) raid.view = raid.view || { type: 'exit', key: cell.k };
    } else if (cb.over === 'fled') {
      cell.enemies = cb.enemies.filter((e) => e.hp > 0 && !e.fled);
      if (!cell.enemies.length) { cell.enemies = null; cell.done = true; }
      if (raid.prev && cell.k === RA.key(raid.pos.x, raid.pos.y)) {
        raid.pos = { x: raid.prev.x, y: raid.prev.y };
        log(raid, 'You retreat to the previous room.', 'warn');
      }
      raid.view = null;
    }
  }

  /* ---------- containers ---------- */
  function takeItem(G, k, uid) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    if (!cell || !cell.loot) return 'none';
    const i = cell.loot.items.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const S = S_(G);
    const it = cell.loot.items[i];
    const stackable = it.kind === 'consumable' && raid.backpack.some((b) => b.kind === 'consumable' && b.base === it.base && b.qty + it.qty <= D.STACK_MAX);
    if (!stackable && raid.backpack.length >= S.backpack) return 'full';
    cell.loot.items.splice(i, 1);
    give(G, it);
    if (it.rarity >= 4) G.codex.relics[it.relic || it.base] = true;
    return 'ok';
  }
  function takeCurrency(G, k) {
    const cell = cellByKey(G.raid, k);
    if (!cell || !cell.loot) return;
    const c = G.raid.carry;
    c.tickets += cell.loot.tickets || 0;
    c.scrap += cell.loot.scrap || 0;
    c.glimmer += cell.loot.glimmer || 0;
    cell.loot.tickets = cell.loot.scrap = cell.loot.glimmer = 0;
  }
  function takeAll(G, k) {
    takeCurrency(G, k);
    const cell = cellByKey(G.raid, k);
    if (!cell || !cell.loot) return 0;
    let left = 0;
    for (const it of cell.loot.items.slice().sort((a, b) => ENG.loot.value(b) - ENG.loot.value(a))) if (takeItem(G, k, it.uid) !== 'ok') left++;
    return left;
  }
  function dropItem(G, uid) {
    const raid = G.raid;
    const i = raid.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const it = raid.backpack.splice(i, 1)[0];
    const cell = here(raid);
    cell.loot = cell.loot || { items: [], tickets: 0, scrap: 0, glimmer: 0 };
    cell.loot.items.push(it);
    raid.view = { type: 'container', key: cell.k, title: 'On the floor' };
  }
  function toPouch(G, uid) {
    const raid = G.raid;
    const S = S_(G);
    const i = raid.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    if (G.pouch.length >= S.pouch) return 'full';
    G.pouch.push(raid.backpack.splice(i, 1)[0]);
    return 'ok';
  }
  function fromPouch(G, uid) {
    const raid = G.raid;
    const S = S_(G);
    const i = G.pouch.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    if (raid.backpack.length >= S.backpack) return 'full';
    raid.backpack.push(G.pouch.splice(i, 1)[0]);
    return 'ok';
  }
  function toBelt(G, uid) {
    const raid = G.raid;
    const i = raid.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 'none';
    const it = raid.backpack[i];
    if (it.kind !== 'consumable') return 'none';
    const same = G.belt.findIndex((b) => b && b.base === it.base && b.qty < D.STACK_MAX);
    if (same >= 0) {
      const moved = Math.min(D.STACK_MAX - G.belt[same].qty, it.qty);
      G.belt[same].qty += moved;
      it.qty -= moved;
      if (it.qty <= 0) raid.backpack.splice(i, 1);
      return 'ok';
    }
    const empty = G.belt.findIndex((b) => !b);
    if (empty < 0) return 'full';
    G.belt[empty] = raid.backpack.splice(i, 1)[0];
    return 'ok';
  }

  /* Consumables used outside of a fight (from belt slot index or backpack uid). */
  function useMapItem(G, where, ref) {
    const raid = G.raid;
    const S = S_(G);
    let stack = null, remove = null;
    if (where === 'belt') { stack = G.belt[ref]; remove = () => { if (--stack.qty <= 0) G.belt[ref] = null; }; }
    else { const i = raid.backpack.findIndex((x) => x.uid === ref); stack = raid.backpack[i]; remove = () => { if (--stack.qty <= 0) raid.backpack.splice(raid.backpack.indexOf(stack), 1); }; }
    if (!stack || stack.kind !== 'consumable') return 'none';
    const heal = (pct) => { raid.hp = Math.min(S.maxHp, raid.hp + Math.round(S.maxHp * pct * (1 + (S.flags.consumableHeal || 0)) * (1 + S.healBonus))); };
    switch (stack.base) {
      case 'bandage': heal(0.3); break;
      case 'beans': heal(0.2); break;
      case 'stability_coil': raid.instability = Math.max(0, raid.instability - 20); log(raid, 'The coil hums. The car steadies.', 'good'); break;
      case 'schematic': for (const c of raid.cells) c.seen = true; log(raid, 'You unfold the schematic: every room, labeled.', 'good'); break;
      default: return 'combat';
    }
    remove();
    return 'ok';
  }

  /* ---------- events ---------- */
  function eventApi(G) {
    const raid = G.raid;
    const S = S_(G);
    const X = { G, raid, S, tier: raid.car.tier, maxHp: S.maxHp, notes: [] };
    X.itemName = (it) => (it ? it.name : 'nothing');
    const drop = (it) => { if (give(G, it) === 'floor') X.notes.push(`${it.name} is on the floor — your pack is full.`); return it; };
    X.loot = (o) => drop(ENG.loot.rollAny(X.tier, Object.assign({ lootFind: S.lootFind }, o || {})));
    X.consumable = () => drop(ENG.loot.rollConsumable());
    X.addConsumable = (id, n) => drop(ENG.loot.makeConsumable(id, n || 1));
    X.number = (d) => ENG.changeNumber(G, d, 'A choice in Car ' + raid.car.num, S);
    X.hurt = (n) => { raid.hp = Math.max(0, raid.hp - n); };
    X.heal = (n) => { raid.hp = Math.min(S.maxHp, raid.hp + Math.round(n * (1 + S.healBonus))); };
    X.takeRandomItem = () => (raid.backpack.length ? raid.backpack.splice(R.int(0, raid.backpack.length - 1), 1)[0] : null);
    X.takeBestItem = () => {
      const best = raid.backpack.filter((i) => i.rarity >= 2).sort((a, b) => b.rarity - a.rarity || ENG.loot.value(b) - ENG.loot.value(a))[0];
      if (best) raid.backpack.splice(raid.backpack.indexOf(best), 1);
      return best;
    };
    const findStack = (id) => { const b = G.belt.findIndex((x) => x && x.base === id); if (b >= 0) return ['belt', b]; const p = raid.backpack.findIndex((x) => x.kind === 'consumable' && x.base === id); return p >= 0 ? ['pack', p] : null; };
    X.hasItem = (id) => !!findStack(id);
    X.useItem = (id) => {
      const f = findStack(id);
      if (!f) return false;
      if (f[0] === 'belt') { if (--G.belt[f[1]].qty <= 0) G.belt[f[1]] = null; } else { const st = raid.backpack[f[1]]; if (--st.qty <= 0) raid.backpack.splice(f[1], 1); }
      return true;
    };
    X.flag = (k) => { raid.flags[k] = true; };
    X.nextFight = (o) => { raid.nextFight = Object.assign(raid.nextFight || {}, o); };
    X.instability = (d) => { raid.instability = Math.max(0, raid.instability + d); };
    X.jumpDeeper = () => {
      const opts = raid.cells.filter((c) => c.x > raid.pos.x && (c.type === 'empty' || c.type === 'cache') && !c.visited);
      if (!opts.length) return false;
      const c = R.pick(opts);
      raid.prev = null;
      raid.pos = { x: c.x, y: c.y };
      c.visited = true;
      RA.refreshSight(raid, S);
      raid.pendingEnter = true;
      return true;
    };
    X.carry = (kind, n) => { raid.carry[kind] += n; };
    X.fight = (ids, o) => {
      const pool = D.CARS[raid.car.theme].fams.map((f) => D.FAMILIES[f] || []).flat();
      const elites = pool.filter((id) => D.ENEMIES[id].elite && !D.ENEMIES[id].hunter);
      raid.pendingFight = { ids: ids || [R.pick(elites.length ? elites : ['steward'])], kind: o && o.elite ? 'elite' : 'fight', title: (o && o.title) || 'A fight breaks out.' };
    };
    X.xp = (n) => { raid.xp += Math.round(n); };
    X.revealAll = () => { for (const c of raid.cells) c.seen = true; };
    X.revealExits = () => { for (const c of raid.cells) if (RA.isExit(c.type)) c.seen = true; };
    X.lockpick = () => S.flags.lockpick || 0;
    return X;
  }

  function chooseEvent(G, k, idx) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    if (!cell || cell.done) return;
    const ev = D.EVENTS[cell.event];
    const ch = ev && ev.choices[idx];
    if (!ch) return;
    const X = eventApi(G);
    if (ch.req && ch.req(X)) return;
    const text = ch.run(X);
    cell.done = true;
    raid.view = { type: 'result', key: k, title: ev.title, text, notes: X.notes, fight: !!raid.pendingFight };
    if (raid.hp <= 0) return die(G, 'event');
  }

  /* Close the current panel; start a queued fight or enter a room we jumped to. */
  function closeView(G) {
    const raid = G.raid;
    if (!raid) return;
    raid.view = null;
    if (raid.pendingFight) {
      const pf = raid.pendingFight;
      raid.pendingFight = null;
      ENG.combat.start(G, { ids: pf.ids, kind: pf.kind, roomKey: here(raid).k, title: pf.title, depthF: raid.pos.x / Math.max(1, raid.w - 1) });
      return;
    }
    if (raid.pendingEnter) { raid.pendingEnter = false; RA.enter(G, here(raid)); }
  }

  /* ---------- rest, vault, merchant ---------- */
  function rest(G, k) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    if (!cell || cell.done) return;
    const S = S_(G);
    raid.hp = Math.min(S.maxHp, raid.hp + Math.round(S.maxHp * 0.35 * (1 + S.healBonus)));
    raid.instability += 10;
    raid.flags.rested = true;
    cell.done = true;
    log(raid, 'You rest a while. The car rattles on without you.', 'good');
    raid.view = null;
  }
  function openVault(G, cell) {
    const raid = G.raid;
    cell.opened = true;
    cell.done = true;
    raid.flags.vaultOpened = true;
    const v = ENG.loot.rollVault(raid.car.tier, S_(G), raid.car.rumor);
    cell.loot = cell.loot || { items: [], tickets: 0, scrap: 0, glimmer: 0 };
    cell.loot.items.push(...v.items);
    cell.loot.tickets += v.tickets;
    cell.loot.scrap += v.scrap;
    raid.view = { type: 'container', key: cell.k, title: 'The open vault' };
  }
  function vault(G, k, method) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    if (!cell || cell.opened) return;
    const S = S_(G);
    const X = eventApi(G);
    if (method === 'key') { if (!X.useItem('coupling_key')) return; log(raid, 'The Coupling Key turns with a heavy clunk.', 'good'); return openVault(G, cell); }
    if (method === 'pick') {
      const ch = S.flags.lockpick || 0;
      if (!ch) return;
      if (R.chance(ch)) { log(raid, 'The tumblers fall into place.', 'good'); return openVault(G, cell); }
      raid.instability += 8;
      const pool = D.CARS[raid.car.theme].fams.map((f) => D.FAMILIES[f] || []).flat().filter((id) => !D.ENEMIES[id].elite && !D.ENEMIES[id].boss && !D.ENEMIES[id].hunter);
      ENG.combat.start(G, { ids: [R.pick(pool), R.pick(pool)], kind: 'fight', roomKey: cell.k, title: 'The lock jams and an alarm starts ringing. Guards come running!', depthF: cell.x / Math.max(1, raid.w - 1) });
      raid.view = null;
      return;
    }
    if (method === 'force') {
      raid.hp = Math.max(0, raid.hp - Math.round(S.maxHp * 0.2));
      raid.instability += 10;
      log(raid, 'You wrench the vault door open. Something in your shoulder objects.', 'warn');
      if (raid.hp <= 0) return die(G, 'vault');
      return openVault(G, cell);
    }
  }
  function merchantBuy(G, k, uid) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    const i = cell && cell.stock ? cell.stock.findIndex((x) => x.uid === uid) : -1;
    if (i < 0) return 'none';
    const S = S_(G);
    const price = ENG.loot.buyPrice(cell.stock[i], S);
    const pay = Math.min(raid.carry.tickets, price);
    if (raid.carry.tickets + G.tickets < price) return 'poor';
    if (raid.backpack.length >= S.backpack) return 'full';
    raid.carry.tickets -= pay;
    G.tickets -= price - pay;
    give(G, cell.stock.splice(i, 1)[0]);
    return 'ok';
  }
  function merchantSell(G, uid) {
    const raid = G.raid;
    const i = raid.backpack.findIndex((x) => x.uid === uid);
    if (i < 0) return 0;
    const it = raid.backpack.splice(i, 1)[0];
    const p = ENG.loot.sellPrice(it, S_(G));
    raid.carry.tickets += p;
    return p;
  }

  /* ---------- exits ---------- */
  function exitState(G, cell) {
    const raid = G.raid;
    const S = S_(G);
    const toll = 30 * raid.car.tier;
    switch (cell.type) {
      case 'far': return { ok: true, label: 'Step through the Far Door', note: 'Bonus: +15% Experience, and your Number drops by 1 more.' };
      case 'hatch': return { ok: true, label: 'Climb out through the hatch', note: 'A plain, safe way out.' };
      case 'home': return { ok: true, label: 'Open the door home', note: 'This is the one. Your Number reads 0.' };
      case 'locked': {
        const key = eventApi(G).hasItem('coupling_key');
        const pick = S.flags.lockpick || 0;
        return { ok: key || pick > 0, label: key ? 'Use a Coupling Key' : pick > 0 ? `Pick the coupling lock (${Math.round(Math.min(1, pick) * 100)}%)` : 'Locked', note: key || pick ? 'The coupling leads out between cars.' : 'You need a Coupling Key or lockpicking skill.' };
      }
      case 'toll': return { ok: raid.carry.tickets + G.tickets >= toll, label: `Pay the toll (${toll} Tickets)`, note: 'Paid from carried Tickets first, then your savings.', toll };
      default: return { ok: false };
    }
  }
  function useExit(G, k) {
    const raid = G.raid;
    const cell = cellByKey(raid, k);
    if (!cell || !RA.isExit(cell.type)) return 'none';
    const st = exitState(G, cell);
    if (!st.ok) return 'blocked';
    if (cell.type === 'locked') {
      const X = eventApi(G);
      if (!X.useItem('coupling_key')) {
        const ch = Math.min(1, S_(G).flags.lockpick || 0);
        if (!R.chance(ch)) { raid.instability += 6; log(raid, 'The lock resists. You lose precious time.', 'warn'); return 'failed'; }
      }
    }
    if (cell.type === 'toll') {
      const pay = Math.min(raid.carry.tickets, st.toll);
      raid.carry.tickets -= pay;
      G.tickets -= st.toll - pay;
    }
    return extract(G, cell.type);
  }
  function emergencyOptions(G) {
    const raid = G.raid;
    if (!raid || raid.combat) return [];
    const S = S_(G);
    const out = [];
    if (S.flags.anywhereExtract && !raid.once.ticket) out.push({ id: 'ticket', label: 'Use the Unpunched Ticket', note: 'Leave right now and keep everything.' });
    if (S.flags.emergencyCord && !raid.once.cord) out.push({ id: 'cord', label: 'Pull the Emergency Cord', note: 'Leave right now, but lose a random third of your backpack.' });
    return out;
  }
  function emergency(G, id) {
    const raid = G.raid;
    if (!emergencyOptions(G).some((o) => o.id === id)) return 'none';
    raid.once[id] = true;
    return extract(G, id);
  }

  function lessonMet(G, raid, far) {
    switch (raid.car.lesson) {
      case 'mercy': return !!raid.flags.spared;
      case 'courage': return !!raid.flags.eliteKilled;
      case 'letting_go': return raid.backpack.length <= 4;
      case 'patience': return !!raid.flags.rested;
      case 'honesty': return !raid.flags.vaultOpened;
      case 'kindness': return !!raid.flags.helped;
      case 'resolve': return !!raid.flags.foughtWon && !raid.flags.fled;
      case 'curiosity': { const open = raid.cells.filter((c) => c.type !== 'wall'); return open.filter((c) => c.visited).length / open.length >= 0.6; }
      case 'long_way': return far;
      default: return false;
    }
  }

  function extract(G, how) {
    const raid = G.raid;
    const S = S_(G);
    const tier = raid.car.tier;
    const far = how === 'far' || how === 'home' || (S.flags.allExitsFar && how !== 'cord' && how !== 'ticket');
    const lost = [];
    if (how === 'cord') {
      const n = Math.floor(raid.backpack.length / 3);
      for (let i = 0; i < n; i++) lost.push(raid.backpack.splice(R.int(0, raid.backpack.length - 1), 1)[0]);
    }
    const collapse = raid.instability >= 100 && S.flags.lastCarOut;
    const lessonOk = lessonMet(G, raid, far);
    const items = raid.backpack.splice(0);
    const haul = U.sum(items, (i) => ENG.loot.value(i));
    const overflowBefore = G.overflow.length;
    for (const it of items) ENG.hub.addToStash(G, it);
    const tickets = raid.carry.tickets * (collapse ? 2 : 1);
    G.tickets += tickets;
    G.scrap += raid.carry.scrap;
    G.glimmer += raid.carry.glimmer;
    let xp = raid.xp + 20 * tier + Math.round(haul / 10);
    if (lessonOk) xp += 40 * tier;
    if (far) xp *= 1.15;
    if (collapse) xp *= 2;
    if (raid.car.mod === 'hush') xp *= 1.2;
    xp = Math.round(xp * (1 + S.xpGain));
    const levels = ENG.gainXp(G, xp);
    ENG.changeNumber(G, -(Math.max(1, Math.round(tier * 0.5)) + (far ? 1 : 0)), `Made it out of Car ${raid.car.num}`, S);
    if (lessonOk) { ENG.changeNumber(G, -(2 + Math.round(tier / 2)), `Learned ${D.LESSONS[raid.car.lesson].name}`, S); G.stats.lessons += 1; }
    const wentHome = how === 'home';
    if (wentHome) { G.engineCleared = true; G.number = 0; }
    G.unlockedTier = Math.max(G.unlockedTier, Math.min(10, tier + 1));
    G.stats.extracts += 1;
    G.stats.raids += 1;
    G.stats.bestHaul = Math.max(G.stats.bestHaul, haul + tickets);
    G.stats.deepest = Math.max(G.stats.deepest, tier);
    for (const it of items) if (it.relic) { G.codex.relics[it.relic] = true; G.stats.relics += 1; }
    G.lastResult = {
      outcome: wentHome ? 'home' : 'extracted', how, car: raid.car, items, lost, tickets, scrap: raid.carry.scrap, glimmer: raid.carry.glimmer,
      xp, levels, numberDelta: G.number - raid.startNumber, number: G.number, lesson: { id: raid.car.lesson, ok: lessonOk }, haul, collapse,
      overflow: G.overflow.length - overflowBefore,
    };
    G.raid = null;
    ENG.hub.afterRaid(G);
    return 'extracted';
  }

  function die(G, cause) {
    const raid = G.raid;
    if (!raid) return 'none';
    const S = S_(G);
    const tier = raid.car.tier;
    const lost = [...raid.backpack];
    for (const k in G.equip) if (G.equip[k]) lost.push(G.equip[k]);
    for (const b of G.belt) if (b) lost.push(b);
    const returned = [];
    if (S.flags.lostFound) for (const it of lost) if (R.chance(Math.min(0.9, S.flags.lostFound))) returned.push(it);
    const xp = Math.round(raid.xp * (1 + S.xpGain));
    const levels = ENG.gainXp(G, xp);
    ENG.changeNumber(G, Math.max(1, 4 + Math.ceil(tier / 2) - (S.flags.deathNumberReduce || 0)), `Lost in Car ${raid.car.num}`, S);
    const numberDelta = G.number - raid.startNumber;
    for (const k in G.equip) G.equip[k] = null;
    G.belt = [null, null, null, null];
    for (const it of returned) ENG.hub.addToStash(G, it);
    G.stats.deaths += 1;
    G.stats.raids += 1;
    const causes = { fight: 'You fell in battle.', unmade: 'The car unmade itself around you.', collapse: 'The collapsing car buried you.', hazard: 'A hazard finished you off.', event: 'Your choice cost more than you had.', vault: 'The vault door won.' };
    G.lastResult = { outcome: 'died', cause: causes[cause] || 'You were lost.', car: raid.car, lost, returned, pouch: G.pouch.slice(), xp, levels, numberDelta, number: G.number,
      tickets: raid.carry.tickets, lesson: { id: raid.car.lesson, ok: false } };
    G.raid = null;
    ENG.hub.afterRaid(G);
    return 'died';
  }

  Object.assign(RA, { give, finishCombat, takeItem, takeAll, takeCurrency, dropItem, toPouch, fromPouch, toBelt, useMapItem, eventApi, chooseEvent, closeView, rest, vault, merchantBuy, merchantSell, exitState, useExit, emergencyOptions, emergency, extract, die, lessonMet });
})();
