/* BUNKER '86 — tile maps: the shelter interior and the procedural surface. */
(function (BK) {
  'use strict';

  // Floor ids
  const F = BK.F = { VOID: 0, CONCRETE: 1, GRATE: 2, DIRT: 3, ASPHALT: 4, SIDEWALK: 5, CARPET: 6, TILE: 7, ASH: 8, RUBBLE: 9, LINO: 10, ROAD_LINE: 11 };
  // Wall ids
  const W = BK.W = { NONE: 0, CONCRETE: 1, BRICK: 2, DRYWALL: 3, RUBBLE: 4, WINDOW: 5, FENCE: 6, STUCCO: 7 };

  BK.OPAQUE_WALLS = new Set([W.CONCRETE, W.BRICK, W.DRYWALL, W.RUBBLE, W.STUCCO]);

  BK.makeMap = function (id, w, h, opts) {
    const n = w * h;
    return Object.assign({
      id: id, w: w, h: h,
      floor: new Uint8Array(n),
      wall: new Uint8Array(n),
      seen: new Uint8Array(n),
      vis: new Float32Array(n),
      blocked: new Uint8Array(n),
      opaque: new Uint8Array(n),
      // Tiles deliberately carved as walkable space. Later wall rings refuse to
      // build over these, so a corridor can never brick up the room it serves.
      carved: new Uint8Array(n),
      props: [],
      zones: [],          // named areas, for the location readout
      radZones: [],       // {x,y,r,strength}
      outdoor: false,
      ambient: 0.16
    }, opts || {});
  };

  const idx = (m, x, y) => y * m.w + x;
  BK.idx = idx;
  BK.inBounds = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;

  BK.floorAt = (m, x, y) => (BK.inBounds(m, x, y) ? m.floor[idx(m, x, y)] : 0);
  BK.wallAt = (m, x, y) => (BK.inBounds(m, x, y) ? m.wall[idx(m, x, y)] : W.CONCRETE);

  BK.isBlocked = function (m, x, y) {
    if (!BK.inBounds(m, x, y)) return true;
    return m.blocked[idx(m, x, y)] === 1;
  };
  BK.isOpaque = function (m, x, y) {
    if (!BK.inBounds(m, x, y)) return true;
    return m.opaque[idx(m, x, y)] === 1;
  };

  // Rebuild collision + sight-blocking grids from walls and props.
  BK.rebuildGrids = function (m) {
    const n = m.w * m.h;
    for (let i = 0; i < n; i++) {
      const wl = m.wall[i];
      const solid = wl !== W.NONE;
      m.blocked[i] = (solid || m.floor[i] === F.VOID) ? 1 : 0;
      m.opaque[i] = (solid && (BK.OPAQUE_WALLS.has(wl) || wl === W.FENCE ? BK.OPAQUE_WALLS.has(wl) : false)) ? 1 : 0;
    }
    for (const p of m.props) {
      for (let dy = 0; dy < (p.h || 1); dy++) {
        for (let dx = 0; dx < (p.w || 1); dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (!BK.inBounds(m, x, y)) continue;
          const i = idx(m, x, y);
          if (p.blocks) m.blocked[i] = 1;
          if (p.opaque) m.opaque[i] = 1;
        }
      }
    }
  };

  // -------------------------------------------------------------- carving --
  function fillRect(m, x, y, w, h, floor, wall) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!BK.inBounds(m, i, j)) continue;
        const k = idx(m, i, j);
        if (floor !== undefined) m.floor[k] = floor;
        if (wall !== undefined) m.wall[k] = wall;
      }
    }
  }
  BK.fillRect = fillRect;

  // Carve a room: floor inside, wall ring around it.
  //
  // The ring is laid down first but skips any tile already carved as walkable,
  // so rooms and corridors carved earlier keep their floors and their openings.
  // Without that guard, every corridor's own ring seals the doorways it just
  // made, and the map falls apart into unreachable pockets.
  function room(m, x, y, w, h, floor, wall) {
    for (let j = y - 1; j <= y + h; j++) {
      for (let i = x - 1; i <= x + w; i++) {
        if (!BK.inBounds(m, i, j)) continue;
        if (i >= x && i < x + w && j >= y && j < y + h) continue;   // interior
        const k = idx(m, i, j);
        if (m.carved[k]) continue;                                  // never seal walkable space
        if (floor !== undefined) m.floor[k] = floor;
        if (wall !== undefined) m.wall[k] = wall;
      }
    }
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!BK.inBounds(m, i, j)) continue;
        const k = idx(m, i, j);
        if (floor !== undefined) m.floor[k] = floor;
        m.wall[k] = W.NONE;
        m.carved[k] = 1;
      }
    }
  }
  BK.room = room;

  function corridor(m, x1, y1, x2, y2, floor, wall, width) {
    width = width || 2;
    const half = Math.floor(width / 2);
    if (x1 === x2) {
      const a = Math.min(y1, y2), b = Math.max(y1, y2);
      room(m, x1 - half, a, width, b - a + 1, floor, wall);
    } else {
      const a = Math.min(x1, x2), b = Math.max(x1, x2);
      room(m, a, y1 - half, b - a + 1, width, floor, wall);
    }
  }

  // A gap in a wall. Marked carved so nothing built later can fill it back in.
  function doorway(m, x, y) {
    if (!BK.inBounds(m, x, y)) return;
    const k = idx(m, x, y);
    m.wall[k] = W.NONE;
    if (!m.floor[k]) m.floor[k] = F.CONCRETE;
    m.carved[k] = 1;
  }

  function addProp(m, p) {
    p.id = BK.uid();
    p.w = p.w || 1; p.h = p.h || 1;
    m.props.push(p);
    return p;
  }
  BK.addProp = addProp;

  // ========================================================= connectivity ==
  // Procedural layouts strand rooms: a sofa lands in the only doorway, two
  // buildings share a wall, a crater eats a porch. Rather than trusting the
  // generators to never do that, walk the finished map and repair it.
  //
  // Doors and rubble are treated as passable here — the player can open or
  // clear them — so only permanent blockage counts as stranded.

  function passableGrid(m) {
    const n = m.w * m.h;
    const pass = new Uint8Array(n);
    for (let i = 0; i < n; i++) pass[i] = (m.wall[i] === W.NONE && m.floor[i] !== F.VOID) ? 1 : 0;
    for (const p of m.props) {
      if (!p.blocks || p.kind === 'door' || p.kind === 'rubble') continue;
      for (let dy = 0; dy < (p.h || 1); dy++) {
        for (let dx = 0; dx < (p.w || 1); dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (BK.inBounds(m, x, y)) pass[idx(m, x, y)] = 0;
        }
      }
    }
    return pass;
  }

  function floodFrom(m, pass, sx, sy) {
    const seen = new Uint8Array(m.w * m.h);
    const start = idx(m, Math.floor(sx), Math.floor(sy));
    if (!pass[start]) return seen;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % m.w, y = (i / m.w) | 0;
      if (x > 0) step(i - 1);
      if (x < m.w - 1) step(i + 1);
      if (y > 0) step(i - m.w);
      if (y < m.h - 1) step(i + m.w);
      function step(ni) { if (!seen[ni] && pass[ni]) { seen[ni] = 1; stack.push(ni); } }
    }
    return seen;
  }

  // Cosmetic cleanup after the layout settles: a door that opens into a wall
  // and a lone wall tile stranded in open floor both read as broken geometry
  // even though neither blocks the player.
  BK.tidyGeometry = function (m) {
    let fixed = 0;

    const walkable = (x, y) => BK.inBounds(m, x, y) &&
      m.wall[idx(m, x, y)] === W.NONE && m.floor[idx(m, x, y)] !== F.VOID;

    // doors need somewhere to go on both sides
    m.props = m.props.filter((p) => {
      if (p.kind !== 'door') return true;
      const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([dx, dy]) => walkable(p.x + dx, p.y + dy)).length;
      if (sides >= 2) return true;
      fixed++;
      return false;
    });

    // a wall tile with open floor on all four sides is a leftover pillar
    for (let y = 1; y < m.h - 1; y++) {
      for (let x = 1; x < m.w - 1; x++) {
        const k = idx(m, x, y);
        if (m.wall[k] === W.NONE) continue;
        if (walkable(x + 1, y) && walkable(x - 1, y) && walkable(x, y + 1) && walkable(x, y - 1)) {
          m.wall[k] = W.NONE;
          if (!m.floor[k]) m.floor[k] = F.CONCRETE;
          fixed++;
        }
      }
    }
    return fixed;
  };

  BK.ensureConnected = function (m, sx, sy) {
    let repairs = 0;
    for (let pass_ = 0; pass_ < 12; pass_++) {
      const pass = passableGrid(m);
      const reach = floodFrom(m, pass, sx, sy);

      // collect one stranded pocket
      let seed = -1;
      for (let i = 0; i < pass.length; i++) if (pass[i] && !reach[i]) { seed = i; break; }
      if (seed < 0) break;

      const pocket = floodFrom(m, pass, seed % m.w, (seed / m.w) | 0);

      // 1. cheapest fix: a blocking prop wedged in the gap between the pocket
      //    and somewhere reachable. Drop it and the space opens up on its own.
      let freed = false;
      for (const p of m.props.slice()) {
        if (!p.blocks || p.kind === 'door' || p.kind === 'rubble' || p.kind === 'container') continue;
        let touchesPocket = false, touchesReached = false;
        for (let dy = -1; dy <= (p.h || 1); dy++) {
          for (let dx = -1; dx <= (p.w || 1); dx++) {
            const x = p.x + dx, y = p.y + dy;
            if (!BK.inBounds(m, x, y)) continue;
            const k = idx(m, x, y);
            if (pocket[k]) touchesPocket = true;
            if (reach[k]) touchesReached = true;
          }
        }
        if (touchesPocket && touchesReached) {
          m.props = m.props.filter(q => q !== p);
          freed = true; repairs++;
          break;
        }
      }
      if (freed) continue;

      // 2. otherwise knock a doorway through the thinnest wall between the
      //    pocket and the reachable side.
      let cut = null;
      for (let y = 1; y < m.h - 1 && !cut; y++) {
        for (let x = 1; x < m.w - 1; x++) {
          const k = idx(m, x, y);
          if (m.wall[k] === W.NONE) continue;
          const n1 = k - 1, n2 = k + 1, n3 = k - m.w, n4 = k + m.w;
          const hitsPocket = pocket[n1] || pocket[n2] || pocket[n3] || pocket[n4];
          const hitsReach = reach[n1] || reach[n2] || reach[n3] || reach[n4];
          if (hitsPocket && hitsReach) { cut = { x: x, y: y }; break; }
        }
      }
      if (cut) {
        doorway(m, cut.x, cut.y);
        m.props = m.props.filter(p => !(p.blocks && p.x === cut.x && p.y === cut.y));
        repairs++;
        continue;
      }

      // 3. nothing adjoins it — this pocket is walled off by more than one
      //    tile. Give up on it rather than tunnelling through the whole map.
      break;
    }
    return repairs;
  };

  // ================================================================ BUNKER ==
  BK.buildBunker = function () {
    const m = BK.makeMap('bunker', 40, 34, { ambient: 0.09 });
    const zone = (name, x, y, w, h) => m.zones.push({ name: name, x: x, y: y, w: w, h: h });

    // Entry shaft & decon
    room(m, 15, 2, 8, 6, F.GRATE, W.CONCRETE);
    zone('ENTRY SHAFT', 15, 2, 8, 6);
    // Main hall
    room(m, 9, 13, 20, 9, F.CONCRETE, W.CONCRETE);
    zone('MAIN HALL', 9, 13, 20, 9);
    // Dorm
    room(m, 2, 11, 6, 12, F.CARPET, W.CONCRETE);
    zone('DORM', 2, 11, 6, 12);
    // Utility
    room(m, 30, 10, 7, 8, F.GRATE, W.CONCRETE);
    zone('UTILITY', 30, 10, 7, 8);
    // Stores
    room(m, 10, 25, 8, 7, F.CONCRETE, W.CONCRETE);
    zone('STORES', 10, 25, 8, 7);
    // Infirmary
    room(m, 21, 25, 8, 7, F.TILE, W.CONCRETE);
    zone('INFIRMARY', 21, 25, 8, 7);
    // Maintenance tunnel + deep chamber (sealed behind rubble)
    room(m, 31, 21, 6, 11, F.DIRT, W.CONCRETE);
    zone('SUB-LEVEL', 31, 21, 6, 11);

    // Connections
    corridor(m, 18, 8, 18, 13, F.GRATE, W.CONCRETE, 2);
    corridor(m, 8, 17, 9, 17, F.CONCRETE, W.CONCRETE, 2);
    corridor(m, 29, 14, 30, 14, F.GRATE, W.CONCRETE, 2);
    corridor(m, 14, 22, 14, 25, F.CONCRETE, W.CONCRETE, 2);
    corridor(m, 24, 22, 24, 25, F.CONCRETE, W.CONCRETE, 2);
    corridor(m, 29, 28, 31, 28, F.DIRT, W.CONCRETE, 2);

    for (const d of [[18, 8], [18, 9], [8, 17], [8, 18], [29, 14], [29, 15], [14, 22], [24, 22], [30, 28], [30, 27]]) doorway(m, d[0], d[1]);

    BK.rebuildGrids(m);

    // Ladder to the surface
    addProp(m, { kind: 'hatch', sprite: 'ladder', x: 18, y: 3, blocks: false, label: 'LADDER TO THE SURFACE' });

    // Doors
    addProp(m, { kind: 'door', sprite: 'door', x: 18, y: 12, open: false, blocks: true, opaque: true, dir: 'h', label: 'BLAST DOOR' });
    addProp(m, { kind: 'door', sprite: 'door', x: 8, y: 17, open: true, blocks: false, opaque: false, dir: 'v', label: 'DORM DOOR' });
    addProp(m, { kind: 'door', sprite: 'door', x: 29, y: 14, open: true, blocks: false, opaque: false, dir: 'v', label: 'UTILITY DOOR' });

    // Rubble sealing the sub-level — clearable with scrap and sweat.
    // These sit in the corridor itself (x30, y27-28), not in the wall ring.
    for (let y = 27; y <= 28; y++) addProp(m, { kind: 'rubble', sprite: 'rubble', x: 30, y: y, blocks: true, opaque: true, hp: 100, label: 'COLLAPSED PASSAGE' });

    // Scenery
    addProp(m, { kind: 'debris', sprite: 'barrel', x: 33, y: 12, blocks: true, opaque: false });
    addProp(m, { kind: 'debris', sprite: 'barrel', x: 34, y: 13, blocks: true, opaque: false });
    addProp(m, { kind: 'debris', sprite: 'crate', x: 11, y: 27, blocks: true, opaque: false });
    addProp(m, { kind: 'debris', sprite: 'crate', x: 12, y: 27, blocks: true, opaque: false });
    addProp(m, { kind: 'debris', sprite: 'pipe', x: 16, y: 5, blocks: false, opaque: false });
    addProp(m, { kind: 'poster', sprite: 'poster', x: 10, y: 13, blocks: false, opaque: false, label: 'CIVIL DEFENSE POSTER',
      note: { title: 'CIVIL DEFENSE POSTER', body: 'DUCK. COVER. HOLD. Remain below grade for fourteen days. Your Civil Defense Warden is your friend.' } });

    // A permanently lit emergency light near the ladder so the entry is never pitch black
    addProp(m, { kind: 'fixture', sprite: 'emerglight', x: 20, y: 3, blocks: false, light: 5.0, glow: '#ff4d5e', always: true });

    BK.rebuildGrids(m);
    m.spawn = { x: 18.5, y: 16.5 };
    m.exitTo = { map: 'surface', at: 'hatch' };
    BK.ensureConnected(m, m.spawn.x, m.spawn.y);
    BK.tidyGeometry(m);
    BK.rebuildGrids(m);
    return m;
  };

  // =============================================================== SURFACE ==
  const HOUSE_NAMES = ['A SPLIT-LEVEL', 'A RANCH HOUSE', 'A DUPLEX', 'A BUNGALOW'];
  const SHOP_NAMES = ['VIDEO HUT', 'SUDS-O-MATIC LAUNDRY', 'PIZZA CORRAL', 'RAD SPRINGS DRUG', 'TAPE TRADER', 'BURGER ROCKET'];

  BK.buildSurface = function (seed) {
    const rng = BK.rng(seed || 1986);
    const m = BK.makeMap('surface', 104, 104, { outdoor: true, ambient: 0.5 });

    // Base: ash-covered ground everywhere
    fillRect(m, 0, 0, m.w, m.h, F.ASH, W.NONE);

    // Road grid
    const roadsX = [12, 38, 64, 90], roadsY = [12, 38, 64, 90];
    for (const rx of roadsX) fillRect(m, rx - 2, 0, 5, m.h, F.ASPHALT, W.NONE);
    for (const ry of roadsY) fillRect(m, 0, ry - 2, m.w, 5, F.ASPHALT, W.NONE);
    // Sidewalks
    for (const rx of roadsX) { fillRect(m, rx - 4, 0, 2, m.h, F.SIDEWALK, W.NONE); fillRect(m, rx + 3, 0, 2, m.h, F.SIDEWALK, W.NONE); }
    for (const ry of roadsY) { fillRect(m, 0, ry - 4, m.w, 2, F.SIDEWALK, W.NONE); fillRect(m, 0, ry + 3, m.w, 2, F.SIDEWALK, W.NONE); }
    // Centre lines
    for (const rx of roadsX) for (let y = 1; y < m.h; y += 3) fillRect(m, rx, y, 1, 1, F.ROAD_LINE, W.NONE);
    for (const ry of roadsY) for (let x = 1; x < m.w; x += 3) fillRect(m, x, ry, 1, 1, F.ROAD_LINE, W.NONE);

    // Map border: impassable ash drifts / wreckage
    fillRect(m, 0, 0, m.w, 2, F.ASH, W.RUBBLE);
    fillRect(m, 0, m.h - 2, m.w, 2, F.ASH, W.RUBBLE);
    fillRect(m, 0, 0, 2, m.h, F.ASH, W.RUBBLE);
    fillRect(m, m.w - 2, 0, 2, m.h, F.ASH, W.RUBBLE);

    // ---- the strip mall with the hatch (player's home block) ----
    const mall = { x: 44, y: 44, w: 16, h: 12 };
    room(m, mall.x, mall.y, mall.w, mall.h, F.LINO, W.BRICK);
    m.zones.push({ name: 'RAD SPRINGS PLAZA', x: mall.x, y: mall.y, w: mall.w, h: mall.h });
    // interior divider
    fillRect(m, mall.x + 9, mall.y, 1, mall.h, F.LINO, W.DRYWALL);
    doorway(m, mall.x + 9, mall.y + 8);
    // front doors
    doorway(m, mall.x + 3, mall.y + mall.h); doorway(m, mall.x + 4, mall.y + mall.h);
    // windows along the front
    for (let i = 6; i < 9; i++) m.wall[idx(m, mall.x + i, mall.y + mall.h)] = W.WINDOW;

    addProp(m, { kind: 'hatch', sprite: 'hatch', x: mall.x + 12, y: mall.y + 3, blocks: false, label: 'SHELTER HATCH' });
    addProp(m, { kind: 'fixture', sprite: 'emerglight', x: mall.x + 12, y: mall.y + 1, blocks: false, light: 4.6, glow: '#ff4d5e', always: true });

    // ---- lots ----
    const lots = [];
    for (let li = 0; li < roadsX.length; li++) {
      for (let lj = 0; lj < roadsY.length; lj++) {
        const x0 = roadsX[li] + 6, y0 = roadsY[lj] + 6;
        const x1 = (li + 1 < roadsX.length ? roadsX[li + 1] - 6 : m.w - 4);
        const y1 = (lj + 1 < roadsY.length ? roadsY[lj + 1] - 6 : m.h - 4);
        if (x1 - x0 < 10 || y1 - y0 < 10) continue;
        // skip the plaza lot
        if (x0 < mall.x + mall.w + 2 && x1 > mall.x - 2 && y0 < mall.y + mall.h + 2 && y1 > mall.y - 2) continue;
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }

    for (const lot of lots) {
      const roll = rng();
      if (roll < 0.14) { makeParking(m, lot, rng); continue; }
      if (roll < 0.24) { makeVacant(m, lot, rng); continue; }
      if (roll < 0.45) makeShop(m, lot, rng);
      else makeHouses(m, lot, rng);
    }

    // ---- craters & hot zones ----
    const craters = 5;
    for (let i = 0; i < craters; i++) {
      const cx = rng.irange(8, m.w - 8), cy = rng.irange(8, m.h - 8), r = rng.irange(5, 9);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (!BK.inBounds(m, x, y)) continue;
          const d = BK.dist(x, y, cx, cy);
          if (d > r) continue;
          const k = idx(m, x, y);
          m.wall[k] = W.NONE;
          m.floor[k] = d < r * 0.5 ? F.DIRT : F.RUBBLE;
        }
      }
      m.radZones.push({ x: cx, y: cy, r: r + 6, strength: rng.range(5, 12) });
      addProp(m, { kind: 'debris', sprite: 'wreck', x: cx, y: cy, blocks: true, opaque: false });
    }

    // ---- street clutter ----
    const carCount = 46;
    for (let i = 0; i < carCount; i++) {
      const onX = rng.chance(0.5);
      const rd = rng.pick(onX ? roadsX : roadsY);
      const x = onX ? rd + rng.irange(-2, 2) : rng.irange(6, m.w - 6);
      const y = onX ? rng.irange(6, m.h - 6) : rd + rng.irange(-2, 2);
      if (BK.floorAt(m, x, y) !== F.ASPHALT && BK.floorAt(m, x, y) !== F.ROAD_LINE) continue;
      if (BK.isBlockedRaw(m, x, y)) continue;
      const car = addProp(m, { kind: 'container', sprite: 'car', x: x, y: y, w: 2, h: 1, blocks: true, opaque: false,
        ctype: 'car', label: 'CAR TRUNK', loot: rollLoot(rng, 'car', 0.5) });
      if (rng.chance(0.18)) car.corpseInside = true;
    }

    for (let i = 0; i < 130; i++) {
      const x = rng.irange(3, m.w - 3), y = rng.irange(3, m.h - 3);
      if (BK.isBlockedRaw(m, x, y)) continue;
      const f = BK.floorAt(m, x, y);
      if (f === F.VOID) continue;
      const kind = rng.pick(['deadtree', 'deadtree', 'trash', 'trash', 'hydrant', 'sign', 'pole', 'phonebooth']);
      const blocks = kind !== 'trash';
      addProp(m, { kind: 'debris', sprite: kind, x: x, y: y, blocks: blocks, opaque: false });
    }

    // ---- corpses & notes out in the open ----
    for (let i = 0; i < 14; i++) {
      const x = rng.irange(4, m.w - 4), y = rng.irange(4, m.h - 4);
      if (BK.isBlockedRaw(m, x, y) || BK.floorAt(m, x, y) === F.VOID) continue;
      addProp(m, { kind: 'container', sprite: 'corpse', x: x, y: y, blocks: false, opaque: false,
        ctype: 'corpse', label: 'A BODY', creepy: true, loot: rollLoot(rng, 'corpse', 0.8) });
    }

    BK.rebuildGrids(m);
    m.spawn = { x: mall.x + 12.5, y: mall.y + 4.5 };
    m.hatch = { x: mall.x + 12, y: mall.y + 3 };
    // Craters, overlapping lots and unlucky furniture placement all strand
    // rooms. Walk the finished town and open anything that got sealed in.
    BK.ensureConnected(m, m.spawn.x, m.spawn.y);
    BK.tidyGeometry(m);
    BK.rebuildGrids(m);
    return m;
  };

  // Collision check that ignores props (used during generation).
  BK.isBlockedRaw = function (m, x, y) {
    if (!BK.inBounds(m, x, y)) return true;
    if (m.wall[idx(m, x, y)] !== W.NONE) return true;
    for (const p of m.props) {
      if (x >= p.x && x < p.x + (p.w || 1) && y >= p.y && y < p.y + (p.h || 1)) return true;
    }
    return false;
  };

  function rollLoot(rng, ctype, richness) {
    const def = BK.CONTAINERS.find(c => c.key === ctype) || BK.CONTAINERS[0];
    const out = [];
    const rolls = rng.chance(richness) ? rng.irange(1, 2) : 0;
    for (let i = 0; i < rolls; i++) {
      const pool = BK.LOOT.map(l => Object.assign({}, l, { weight: l.weight * ((def.bias && def.bias[l.key]) || 1) }));
      let total = 0; for (const p of pool) total += p.weight;
      let r = rng() * total, chosen = pool[pool.length - 1];
      for (const p of pool) { r -= p.weight; if (r <= 0) { chosen = p; break; } }
      out.push({ key: chosen.key, label: chosen.label, amount: rng.irange(chosen.min, chosen.max) });
    }
    return out;
  }
  BK.rollLoot = rollLoot;

  // ------------------------------------------------------ lot generators ---
  // A tile is a threshold if it, or an orthogonal neighbour, is a gap in a wall
  // line — the one square you must not drop a refrigerator onto.
  function nearDoorway(m, x, y) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = x + dx, j = y + dy;
      if (!BK.inBounds(m, i, j)) continue;
      const k = idx(m, i, j);
      if (m.wall[k] !== W.NONE) continue;
      // a gap with wall on both sides along either axis is a doorway
      const hor = BK.wallAt(m, i - 1, j) !== W.NONE && BK.wallAt(m, i + 1, j) !== W.NONE;
      const ver = BK.wallAt(m, i, j - 1) !== W.NONE && BK.wallAt(m, i, j + 1) !== W.NONE;
      if (hor || ver) return true;
    }
    return false;
  }

  function furnishInterior(m, x, y, w, h, rng, style) {
    const spots = [];
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) spots.push({ x: i, y: j });
    rng.shuffle(spots);
    const count = Math.max(2, Math.floor(w * h / 12));
    let placed = 0;
    for (const s of spots) {
      if (placed >= count) break;
      if (BK.isBlockedRaw(m, s.x, s.y)) continue;
      if (nearDoorway(m, s.x, s.y)) continue;
      const near = (s.x === x || s.x === x + w - 1 || s.y === y || s.y === y + h - 1);
      const roll = rng();
      if (near && roll < 0.55) {
        const ctype = style === 'shop' ? rng.pick(['locker', 'crate', 'register', 'cabinet'])
          : rng.pick(['fridge', 'cabinet', 'cabinet', 'locker']);
        const def = BK.CONTAINERS.find(c => c.key === ctype);
        addProp(m, { kind: 'container', sprite: ctype, x: s.x, y: s.y, blocks: true, opaque: false,
          ctype: ctype, label: def.name, loot: rollLoot(rng, ctype, style === 'shop' ? 0.85 : 0.7) });
      } else if (roll < 0.75) {
        addProp(m, { kind: 'debris', sprite: rng.pick(['table', 'chair', 'sofa', 'shelfprop', 'tvprop']), x: s.x, y: s.y, blocks: rng.chance(0.7), opaque: false });
      } else if (roll < 0.82) {
        addProp(m, { kind: 'container', sprite: 'corpse', x: s.x, y: s.y, blocks: false, opaque: false,
          ctype: 'corpse', label: 'A BODY', creepy: true, loot: rollLoot(rng, 'corpse', 0.9) });
      } else if (roll < 0.88) {
        const n = rng.pick(BK.NOTES);
        addProp(m, { kind: 'note', sprite: 'note', x: s.x, y: s.y, blocks: false, opaque: false, label: n.title, note: n });
      }
      placed++;
    }
  }

  function makeHouses(m, lot, rng) {
    const cols = lot.w > 22 ? 2 : 1, rows = lot.h > 22 ? 2 : 1;
    const cw = Math.floor(lot.w / cols), ch = Math.floor(lot.h / rows);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng.chance(0.15)) continue; // empty plot
        const bx = lot.x + c * cw + 1, by = lot.y + r * ch + 1;
        const bw = Math.max(7, cw - 4), bh = Math.max(7, ch - 4);
        if (bx + bw >= m.w - 3 || by + bh >= m.h - 3) continue;
        const burned = rng.chance(0.22);
        room(m, bx, by, bw, bh, burned ? F.RUBBLE : F.CARPET, burned ? W.RUBBLE : W.STUCCO);
        m.zones.push({ name: rng.pick(HOUSE_NAMES), x: bx, y: by, w: bw, h: bh });
        // interior wall + doorway
        const split = bx + Math.floor(bw / 2);
        fillRect(m, split, by, 1, bh, undefined, W.DRYWALL);
        doorway(m, split, by + rng.irange(1, bh - 2));
        // front door + windows
        const dx = bx + rng.irange(1, bw - 2);
        doorway(m, dx, by + bh);
        addProp(m, { kind: 'door', sprite: 'door', x: dx, y: by + bh, open: rng.chance(0.45), blocks: true, opaque: true, dir: 'h', label: 'FRONT DOOR' });
        for (let i = 0; i < bw; i++) if (rng.chance(0.22) && bx + i !== dx) m.wall[idx(m, bx + i, by + bh)] = W.WINDOW;
        for (let j = 0; j < bh; j++) if (rng.chance(0.18)) m.wall[idx(m, bx - 1, by + j)] = W.WINDOW;
        if (!burned) furnishInterior(m, bx, by, bw, bh, rng, 'house');
        else if (rng.chance(0.5)) addProp(m, { kind: 'debris', sprite: 'wreck', x: bx + 2, y: by + 2, blocks: true, opaque: false });
      }
    }
  }

  function makeShop(m, lot, rng) {
    const bw = Math.min(lot.w - 3, rng.irange(12, 18)), bh = Math.min(lot.h - 3, rng.irange(9, 13));
    const bx = lot.x + 1, by = lot.y + 1;
    room(m, bx, by, bw, bh, F.LINO, W.BRICK);
    const name = rng.pick(SHOP_NAMES);
    m.zones.push({ name: name, x: bx, y: by, w: bw, h: bh });
    // Storefront glass. Openings are contiguous runs of smashed window rather
    // than a per-tile coin flip, which used to leave single panes standing in
    // the middle of an open frontage like little pillars.
    for (let i = 1; i < bw - 1; i++) m.wall[idx(m, bx + i, by + bh)] = W.WINDOW;
    const dx = bx + Math.floor(bw / 2);
    doorway(m, dx, by + bh);
    const smashes = rng.irange(1, 2);
    for (let n = 0; n < smashes; n++) {
      const start = rng.irange(1, Math.max(1, bw - 4));
      const run = rng.irange(2, 3);
      for (let i = start; i < Math.min(start + run, bw - 1); i++) doorway(m, bx + i, by + bh);
    }
    // back room
    const backY = by + bh - 4;
    fillRect(m, bx, backY, bw, 1, undefined, W.DRYWALL);
    doorway(m, bx + 2, backY);
    furnishInterior(m, bx, by, bw, bh - 5, rng, 'shop');
    furnishInterior(m, bx, backY + 1, bw, 3, rng, 'shop');
    addProp(m, { kind: 'sign', sprite: 'shopsign', x: bx + Math.floor(bw / 2), y: by + bh + 1, blocks: false, opaque: false, label: name });
  }

  function makeParking(m, lot, rng) {
    fillRect(m, lot.x, lot.y, lot.w, lot.h, F.ASPHALT, W.NONE);
    for (let i = 0; i < lot.w; i += 3) fillRect(m, lot.x + i, lot.y + 2, 1, 3, F.ROAD_LINE, W.NONE);
    const cars = rng.irange(3, 8);
    for (let i = 0; i < cars; i++) {
      const x = lot.x + rng.irange(0, lot.w - 2), y = lot.y + rng.irange(0, lot.h - 1);
      if (BK.isBlockedRaw(m, x, y)) continue;
      addProp(m, { kind: 'container', sprite: 'car', x: x, y: y, w: 2, h: 1, blocks: true, opaque: false,
        ctype: 'car', label: 'CAR TRUNK', loot: rollLoot(rng, 'car', 0.55) });
    }
    if (rng.chance(0.5)) {
      addProp(m, { kind: 'container', sprite: 'crate', x: lot.x + 1, y: lot.y + 1, blocks: true, opaque: false,
        ctype: 'crate', label: 'CRATE', loot: rollLoot(rng, 'crate', 0.9) });
    }
  }

  function makeVacant(m, lot, rng) {
    for (let i = 0; i < 16; i++) {
      const x = lot.x + rng.irange(0, lot.w - 1), y = lot.y + rng.irange(0, lot.h - 1);
      if (BK.isBlockedRaw(m, x, y)) continue;
      addProp(m, { kind: 'debris', sprite: rng.pick(['deadtree', 'trash', 'rubblepile']), x: x, y: y, blocks: rng.chance(0.6), opaque: false });
    }
    if (rng.chance(0.6)) {
      const n = rng.pick(BK.NOTES);
      addProp(m, { kind: 'note', sprite: 'note', x: lot.x + 2, y: lot.y + 2, blocks: false, opaque: false, label: n.title, note: n });
    }
  }

  // Find a walkable tile near a target (for spawns and pathing fallbacks).
  BK.nearestFree = function (m, x, y, maxR) {
    maxR = maxR || 8;
    x = Math.round(x); y = Math.round(y);
    if (!BK.isBlocked(m, x, y)) return { x: x, y: y };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (!BK.isBlocked(m, x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x: x, y: y };
  };

  BK.zoneAt = function (m, x, y) {
    for (let i = m.zones.length - 1; i >= 0; i--) {
      const z = m.zones[i];
      if (x >= z.x - 1 && x <= z.x + z.w && y >= z.y - 1 && y <= z.y + z.h) return z.name;
    }
    return m.outdoor ? 'THE STREETS' : 'THE SHELTER';
  };

  BK.radAt = function (m, x, y) {
    let r = 0;
    for (const z of m.radZones) {
      const d = BK.dist(x, y, z.x, z.y);
      if (d < z.r) r += z.strength * (1 - d / z.r);
    }
    return r;
  };
})(window.BK = window.BK || {});
