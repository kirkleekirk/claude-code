/* The world of a trip. The main lines ride the Dungeon Train: rooms in a row (the cars) joined by gangways.
   The optional lines leave the train for a place of their own (the Mystery Dungeon, Wizard City, the Vampire
   Hive, the Lich's Well): rooms on a grid joined by corridors, with the boss room somewhere in the middle
   of it all. Either way the world is a set of walkable rectangles (room floors, doorways, corridors).
   Collision keeps everything inside them, monsters find their way from rectangle to rectangle, and the
   camera stays inside them too. x runs along the train, z across it, y is up. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const WALL = 0.3, DOOR = 1.5, DOORH = 3.4, GAP = 2, SINK = 1.6;
  /* car sizes (length, width, height). The boss car is much bigger, so bosses have room for big attacks. */
  const CARS = { car: { L: 26, W: 10, H: 4.6 }, caboose: { L: 22, W: 10, H: 4.6 }, boss: { L: 40, W: 16, H: 8 }, engine: { L: 24, W: 10, H: 4.6 } };
  const WD = { WALL, DOOR, DOORH, GAP, SINK, CARS };
  const box = (minX, maxX, minZ, maxZ, kind, ref) => ({ minX, maxX, minZ, maxZ, kind, ref, active: true });
  const inRect = (w, x, z, m) => x >= w.x0 + m && x <= w.x1 - m && z >= w.z0 + m && z <= w.z1 - m;

  /* ---------- rooms, doors and walkable rectangles ---------- */
  function newWorld(line, offer, kind) {
    return { line, offer, kind, site: line.site || null, tier: line.tier, mod: offer.mod, cars: [], walk: [], links: [], gates: [], obstacles: [], breakables: [], chests: [], inter: [], minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  function addRoom(T, type, x0, x1, z0, z1, h) {
    const def = D.CAR_TYPES[type];
    const room = { i: T.cars.length, type, def, name: (T.kind === 'site' && def.siteName) || def.name, x0, x1, z0, z1, h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, doors: [], entered: false, cleared: false, props: [], locked: false };
    room.rect = T.walk.length;
    T.walk.push({ x0: x0 + WALL, x1: x1 - WALL, z0: z0 + WALL, z1: z1 - WALL, h, room: room.i, kind: 'room' });
    T.cars.push(room);
    return room;
  }
  /* Join two neighbouring rooms (b east of a, or b south of a) with a doorway, or a corridor if there's a
     gap between them, centred at `at` and `hw` wide on each side. Its rectangle reaches a little way into
     both rooms so the walkable area stays in one piece. */
  function join(T, a, b, at, hw, h) {
    const alongX = b.x0 >= a.x1 - 0.01;
    const L = { a: a.i, b: b.i, at, hw, h, alongX, i: T.links.length };
    let w;
    if (alongX) { w = { x0: a.x1 - WALL - SINK, x1: b.x0 + WALL + SINK, z0: at - hw, z1: at + hw }; L.from = a.x1; L.to = b.x0; }
    else { w = { x0: at - hw, x1: at + hw, z0: a.z1 - WALL - SINK, z1: b.z0 + WALL + SINK }; L.from = a.z1; L.to = b.z0; }
    Object.assign(w, { h, room: -1, kind: 'door', link: L.i });
    L.rect = T.walk.length;
    T.walk.push(w);
    a.doors.push({ side: alongX ? 'x1' : 'z1', at, hw, to: b.i, link: L.i });
    b.doors.push({ side: alongX ? 'x0' : 'z0', at, hw, to: a.i, link: L.i });
    T.links.push(L);
    return L;
  }
  /* Where a door sits on a room's wall, with the normal pointing into the room. */
  function doorPoint(room, d) {
    switch (d.side) {
      case 'x0': return { x: room.x0, z: d.at, nx: 1, nz: 0 };
      case 'x1': return { x: room.x1, z: d.at, nx: -1, nz: 0 };
      case 'z0': return { x: d.at, z: room.z0, nx: 0, nz: 1 };
      default: return { x: d.at, z: room.z1, nx: 0, nz: -1 };
    }
  }
  /* A gate across a doorway: arena gates (open until the boss shows up) or a vault's locked gate. */
  function addGate(T, room, d, kind, open) {
    const p = doorPoint(room, d);
    const acrossZ = d.side === 'x0' || d.side === 'x1';
    const ob = acrossZ ? box(p.x - WALL, p.x + WALL, d.at - d.hw, d.at + d.hw, kind) : box(d.at - d.hw, d.at + d.hw, p.z - WALL, p.z + WALL, kind);
    ob.active = !open;
    const g = { ob, kind, open: !!open, x: p.x, z: p.z, rot: acrossZ ? 0 : Math.PI / 2, w: d.hw * 2, room: room.i, door: d, nx: p.nx, nz: p.nz };
    ob.ref = g;
    T.obstacles.push(ob);
    T.gates.push(g);
    return g;
  }

  /* The pathing graph: which rectangles overlap, the middle of each overlap (a "portal"), and for every
     pair of rectangles the next one to step into on the way. */
  function buildNav(T) {
    const W = T.walk, n = W.length;
    T.portal = [];
    const adj = [];
    for (let a = 0; a < n; a++) { T.portal.push(new Array(n).fill(null)); adj.push([]); }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const A = W[a], B = W[b];
      const x0 = Math.max(A.x0, B.x0), x1 = Math.min(A.x1, B.x1), z0 = Math.max(A.z0, B.z0), z1 = Math.min(A.z1, B.z1);
      if (x1 - x0 < 0.2 || z1 - z0 < 0.2) continue;
      T.portal[a][b] = T.portal[b][a] = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
      adj[a].push(b); adj[b].push(a);
    }
    T.next = [];
    for (let a = 0; a < n; a++) T.next.push(new Int16Array(n).fill(-1));
    for (let t = 0; t < n; t++) {
      const seen = new Uint8Array(n);
      seen[t] = 1;
      const q = [t];
      while (q.length) {
        const u = q.shift();
        for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; T.next[v][t] = u; q.push(v); }
      }
    }
  }

  /* ---------- generation ---------- */
  function generate(G, offer) {
    const line = D.LINES.find((l) => l.id === offer.line);
    const T = newWorld(line, offer, line.site ? 'site' : 'train');
    if (T.kind === 'site') genSite(T, offer, line); else genTrain(T, offer, line);
    for (const room of T.cars) layoutRoom(T, room);
    buildNav(T);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of T.cars) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); z0 = Math.min(z0, c.z0); z1 = Math.max(z1, c.z1); }
    Object.assign(T, { minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
    return T;
  }

  function pickTypes(n, offer, line) {
    const types = ['caboose'];
    /* each line can favor its own rooms (mine cars on the classic line, labs in Wizard City...) */
    const weights = Object.assign({}, ...Object.keys(D.CAR_TYPES).filter((k) => D.CAR_TYPES[k].weight).map((k) => ({ [k]: D.CAR_TYPES[k].weight * (line.rooms ? 0.25 : 1) })), line.rooms || {});
    const pool = Object.keys(weights).filter((k) => weights[k] > 0);
    let last = null;
    for (let i = 1; i < n - 2; i++) {
      const t = R.weighted(pool.map((k) => [k === last ? weights[k] * 0.3 : weights[k], k]));
      types.push(t); last = t;
    }
    types.push('boss', 'engine');
    if (offer.vault && n >= 6) types[n - 3] = 'vault';
    return types;
  }
  function genTrain(T, offer, line) {
    const n = Math.max(5, offer.cars);
    const types = pickTypes(n, offer, line);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const s = CARS[types[i]] || CARS.car;
      addRoom(T, types[i], x, x + s.L, -s.W / 2, s.W / 2, s.H);
      x += s.L + (i < n - 1 ? GAP : 0);
    }
    for (let i = 0; i < n - 1; i++) join(T, T.cars[i], T.cars[i + 1], 0, DOOR, DOORH);
    /* jump-off doors in 1-2 middle cars, in a side wall */
    const middle = T.cars.filter((c) => c.i > 0 && c.i < n - 2 && c.type !== 'vault');
    for (const car of R.shuffle(middle).slice(0, n >= 7 ? 2 : 1)) addExit(T, car, R.pick(['z0', 'z1']), car.x0 + R.float(7, car.x1 - car.x0 - 7));
    extras(T, offer, middle, T.cars.filter((c) => c.i >= 2 && c.i < n - 2 && c.type !== 'vault'));
    const boss = T.cars[n - 2];
    boss.boss = line.boss;
    T.bossRoom = boss.i;
    /* the boss car's doors: the way in shuts behind you when the boss shows up, and the way on to the
       engine stays shut until the boss is beaten */
    boss.gates = boss.doors.map((d) => addGate(T, boss, d, 'gate', d.side === 'x0'));
    boss.spawn = { x: boss.x1 - 10, z: 0 };
    const vault = T.cars.find((c) => c.type === 'vault');
    if (vault) lockVault(T, vault, vault.doors.find((d) => d.side === 'x0'));
    const c0 = T.cars[0];
    T.start = { x: c0.x0 + 4, z: 0, yaw: Math.PI / 2 };
  }
  /* elites and the Waving Snail */
  function extras(T, offer, middle, eliteRooms) {
    const snail = R.chance(0.35) && middle.length ? R.pick(middle) : null;
    if (snail) snail.snail = true;
    const vault = T.cars.find((c) => c.type === 'vault');
    if (vault) vault.elite = true;
    else if (eliteRooms.length && R.chance(0.6)) R.pick(eliteRooms).elite = true;
    if (offer.mod === 'elites' && eliteRooms.length) R.pick(eliteRooms).elite = true;
  }
  function addExit(T, room, side, at) {
    room.bailout = { side, at };
    const p = doorPoint(room, { side, at });
    T.inter.push({ kind: 'bailout', x: p.x + p.nx * (WALL + 1.0), z: p.z + p.nz * (WALL + 1.0), r: 1.6, car: room.i, time: 3.5 });
  }
  function lockVault(T, room, d) {
    if (!d) return;
    room.locked = true;
    const g = addGate(T, room, d, 'lock', false);
    room.lock = g;
    g.hp = 12;
    T.inter.push({ kind: 'lock', x: g.x - g.nx * 1.3, z: g.z - g.nz * 1.3, r: 1.7, car: room.i, ref: g, time: 0.6 });
  }

  /* Off the train: a grid of rooms joined by corridors. plan: 'center' (the boss room sits in the exact
     middle, reached from the far side of a ring of rooms), 'across' (enter on one side, the boss is on the
     other) or 'corner' (corner to corner). */
  function genSite(T, offer, line) {
    const S = line.site;
    const cols = S.grid[0], rows = S.grid[1], slot = S.slot || 32;
    const key = (c, r) => c + ',' + r;
    const cell = (k) => k.split(',').map(Number);
    const inGrid = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
    const nbrs = (c, r) => [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => inGrid(a, b));
    let ent, boss;
    if (S.plan === 'center') { boss = [cols >> 1, rows >> 1]; ent = R.pick([[0, 0], [cols - 1, 0], [0, rows - 1], [cols - 1, rows - 1]]); }
    else if (S.plan === 'corner') { const f = R.chance(0.5); ent = [0, f ? rows - 1 : 0]; boss = [cols - 1, f ? 0 : rows - 1]; }
    else { ent = [0, R.int(0, rows - 1)]; boss = [cols - 1, R.int(0, rows - 1)]; }
    const entK = key(...ent), bossK = key(...boss);
    const used = new Set();
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) used.add(key(c, r));
    const gridReach = () => {
      const seen = new Set([entK]), q = [entK];
      while (q.length) { const k = q.shift(); for (const [a, b] of nbrs(...cell(k))) { const k2 = key(a, b); if (k2 !== bossK && used.has(k2) && !seen.has(k2)) { seen.add(k2); q.push(k2); } } }
      return seen.size;
    };
    /* leave a few cells empty so the map isn't a perfect box (never cutting it in two) */
    for (let tries = 0, dropped = 0; tries < 30 && dropped < (S.drop || 0); tries++) {
      const k = R.pick([...used]);
      if (k === entK || k === bossK) continue;
      used.delete(k);
      const bossOk = nbrs(...boss).some(([a, b]) => used.has(key(a, b)) && key(a, b) !== entK);
      if (gridReach() !== used.size - 1 || !bossOk) used.add(k); else dropped++;
    }
    const edges = new Set();
    const ek = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    if (S.plan === 'center') {
      for (const k of used) if (k !== bossK) for (const [a, b] of nbrs(...cell(k))) { const k2 = key(a, b); if (k2 !== bossK && used.has(k2)) edges.add(ek(k, k2)); }
    } else {
      /* a random maze over the rooms (depth-first), plus a few extra doors so there are loops */
      const seen = new Set([entK]), stack = [entK];
      while (stack.length) {
        const k = stack[stack.length - 1];
        const opts = R.shuffle(nbrs(...cell(k)).map(([a, b]) => key(a, b)).filter((k2) => used.has(k2) && k2 !== bossK && !seen.has(k2)));
        if (!opts.length) { stack.pop(); continue; }
        seen.add(opts[0]); edges.add(ek(k, opts[0])); stack.push(opts[0]);
      }
      let extra = S.loops || 0;
      for (const k of R.shuffle([...used])) {
        if (extra <= 0) break;
        if (k === bossK) continue;
        for (const [a, b] of R.shuffle(nbrs(...cell(k)))) { const k2 = key(a, b); if (!used.has(k2) || k2 === bossK || edges.has(ek(k, k2))) continue; edges.add(ek(k, k2)); extra--; break; }
      }
    }
    /* distances through the doors, from the entrance */
    const edgeList = () => [...edges].map((e) => e.split('|'));
    const walkDist = () => {
      const dist = new Map([[entK, 0]]), q = [entK], E = edgeList();
      while (q.length) { const k = q.shift(); for (const [a, b] of E) { const o = a === k ? b : b === k ? a : null; if (o && o !== bossK && !dist.has(o)) { dist.set(o, dist.get(k) + 1); q.push(o); } } }
      return dist;
    };
    let dist = walkDist();
    /* the boss room has a single way in, from the neighbour farthest from the entrance */
    const inN = nbrs(...boss).map(([a, b]) => key(a, b)).filter((k) => used.has(k) && k !== entK && dist.has(k));
    const far = Math.max(...inN.map((k) => dist.get(k)));
    const bossDoor = R.pick(inN.filter((k) => dist.get(k) === far));
    edges.add(ek(bossK, bossDoor));
    const deg = (k) => edgeList().filter((e) => e.includes(k)).length;
    /* a treasure vault goes in a dead end (the ring around the Mystery Dungeon's center gets one cut) */
    let leaves = [...used].filter((k) => k !== entK && k !== bossK && k !== bossDoor && deg(k) === 1 && (dist.get(k) || 0) >= 2);
    if (offer.vault && !leaves.length && S.plan === 'center') {
      const corner = R.pick([...used].filter((k) => k !== entK && k !== bossK && deg(k) === 2 && !edgeList().some((e) => e.includes(k) && e.includes(bossDoor))));
      if (corner) {
        const cut = R.pick(edgeList().filter((e) => e.includes(corner)));
        edges.delete(ek(cut[0], cut[1]));
        dist = walkDist();
        if (dist.size === used.size - 1) leaves = [corner];
        else edges.add(ek(cut[0], cut[1]));
        dist = walkDist();
      }
    }
    const vaultK = offer.vault && leaves.length ? R.pick(leaves) : null;
    /* rooms: the entrance first, then outward, the boss room last */
    const order = [...used].filter((k) => k !== bossK).sort((a, b) => (dist.get(a) || 0) - (dist.get(b) || 0));
    order.push(bossK);
    const weights = S.rooms;
    const pool = Object.keys(weights);
    const rooms = {};
    const hw = (S.hall || 3.2) / 2;
    /* rooms wobble a little inside their grid cells, but never so far that two neighbours stop
       overlapping by enough for a doorway */
    const minSpan = 2 * (WALL + hw + 1.2) + 1;
    let last = null;
    for (const k of order) {
      const [c, r] = cell(k);
      const isBoss = k === bossK, isEnt = k === entK;
      let type;
      if (isBoss) type = 'boss';
      else if (isEnt) type = 'entrance';
      else if (k === vaultK) type = 'vault';
      else { type = R.weighted(pool.map((t) => [t === last ? weights[t] * 0.3 : weights[t], t])); last = type; }
      const fixed = D.CAR_TYPES[type].size;
      const w = isBoss ? S.arena[0] : isEnt ? 14 : type === 'vault' ? 13 : fixed ? fixed[0] : R.int(S.room[0], S.room[1]);
      const d = isBoss ? S.arena[1] : isEnt ? 14 : type === 'vault' ? 12 : fixed ? fixed[1] : R.int(S.room[0], S.room[1]);
      const jx = U.clamp((w - minSpan) / 2, 0, Math.max(0, (slot - w) / 2 - 2)), jz = U.clamp((d - minSpan) / 2, 0, Math.max(0, (slot - d) / 2 - 2));
      const cx = c * slot + slot / 2 + R.float(-jx, jx), cz = r * slot + slot / 2 + R.float(-jz, jz);
      rooms[k] = addRoom(T, type, cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, S.ceiling || Infinity);
      rooms[k].cell = [c, r];
      rooms[k].depth = isBoss ? 99 : dist.get(k) || 0;
    }
    const doorH = S.ceiling ? Math.min(S.ceiling, 4.4) : Infinity;
    for (const e of edges) {
      let [a, b] = e.split('|').map((k) => rooms[k]);
      const sameRow = a.cell[1] === b.cell[1];
      if (sameRow ? a.cell[0] > b.cell[0] : a.cell[1] > b.cell[1]) [a, b] = [b, a];
      const lo = (sameRow ? Math.max(a.z0, b.z0) : Math.max(a.x0, b.x0)) + WALL + hw + 1.2;
      const hi = (sameRow ? Math.min(a.z1, b.z1) : Math.min(a.x1, b.x1)) - WALL - hw - 1.2;
      const at = lo <= hi ? U.lerp(lo, hi, R.float(0.3, 0.7)) : (lo + hi) / 2;
      join(T, a, b, at, hw, doorH);
    }
    const bossRoom = rooms[bossK];
    bossRoom.boss = line.boss;
    bossRoom.name = S.arenaName || bossRoom.name;
    T.bossRoom = bossRoom.i;
    bossRoom.gates = bossRoom.doors.map((d) => addGate(T, bossRoom, d, 'gate', true));
    /* the boss waits on the far side of the room from the door */
    const bp = doorPoint(bossRoom, bossRoom.doors[0]);
    bossRoom.spawn = { x: bossRoom.cx + bp.nx * 3, z: bossRoom.cz + bp.nz * 3 };
    if (vaultK) lockVault(T, rooms[vaultK], rooms[vaultK].doors[0]);
    /* ways out: a couple of exits in rooms away from the entrance, on a wall with no door */
    const mids = T.cars.filter((c) => c.type !== 'entrance' && c.type !== 'boss' && c.type !== 'vault');
    const farRooms = mids.filter((c) => c.depth >= 2);
    for (const room of R.shuffle(farRooms.length >= 2 ? farRooms : mids).slice(0, S.exits || 2)) {
      const sides = ['x0', 'x1', 'z0', 'z1'].filter((s) => !room.doors.some((d) => d.side === s));
      if (!sides.length) continue;
      const side = R.pick(sides);
      addExit(T, room, side, side[0] === 'x' ? room.cz : room.cx);
    }
    extras(T, offer, mids, mids.filter((c) => c.depth >= 1));
    /* start in the entrance, facing the way in */
    const e0 = rooms[entK], d0 = e0.doors[0];
    const p = d0 ? doorPoint(e0, d0) : { x: e0.cx + 1, z: e0.cz };
    T.start = { x: e0.cx, z: e0.cz, yaw: Math.atan2(p.x - e0.cx, p.z - e0.cz) };
  }

  /* ---------- furnishing rooms ---------- */
  /* props tall enough to hide a hero, with their height (they fade out when they get in the camera's way) */
  const TALL = { mushroom: 1.6, bookshelf: 2.8, cage: 2.4, rack: 1.9, boiler: 3.7, throne: 2.7, crate: 1, crystals: 1.7, shelf: 2.4, pillar: 4.0, minecart: 1.3,
    stall: 2.6, lamppost: 3.4, fountain: 1.4, oven: 1.9, wax: 4.4, subway_car: 3.1, well: 1.1, hedge: 1.6, obelisk: 3.2 };
  const SIDES = ['z0', 'z1', 'x0', 'x1'];
  /* Spots along a room's walls, `depth` out from the wall, about every `step` metres, skipping doors and
     exits. `half` is half the prop's length along the wall. */
  function wallSpots(room, depth, step, o) {
    o = o || {};
    const out = [];
    const half = o.half || 1;
    for (const side of o.sides || SIDES) {
      const alongX = side[0] === 'z';
      const lo = (alongX ? room.x0 : room.z0) + WALL + (o.margin != null ? o.margin : 0.6) + half;
      const hi = (alongX ? room.x1 : room.z1) - WALL - (o.margin != null ? o.margin : 0.6) - half;
      const holes = room.doors.filter((d) => d.side === side).map((d) => [d.at - d.hw - 1.4, d.at + d.hw + 1.4]);
      if (room.bailout && room.bailout.side === side) holes.push([room.bailout.at - 2.4, room.bailout.at + 2.4]);
      const inner = side === 'z0' ? room.z0 + WALL + depth : side === 'z1' ? room.z1 - WALL - depth : side === 'x0' ? room.x0 + WALL + depth : room.x1 - WALL - depth;
      const rot = side === 'z0' ? 0 : side === 'z1' ? Math.PI : side === 'x0' ? Math.PI / 2 : -Math.PI / 2;
      const span = hi - lo;
      if (span < 0) continue;
      const n = Math.max(1, Math.floor(span / step) + 1);
      const gap = n > 1 ? span / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? lo + i * gap : (lo + hi) / 2;
        if (holes.some(([a, b]) => t + half > a && t - half < b)) continue;
        out.push(alongX ? { x: t, z: inner, rot, alongX, side } : { x: inner, z: t, rot, alongX, side });
      }
    }
    return out;
  }
  /* The clear space inside each doorway and exit: nothing solid may stand there. */
  function doorZones(room) {
    const zones = [];
    const add = (side, at, hw) => {
      const p = doorPoint(room, { side, at });
      const depth = WALL + 2.6, half = hw + 0.7;
      if (side[0] === 'x') zones.push(p.nx > 0 ? [p.x, p.x + depth, at - half, at + half] : [p.x - depth, p.x, at - half, at + half]);
      else zones.push(p.nz > 0 ? [at - half, at + half, p.z, p.z + depth] : [at - half, at + half, p.z - depth, p.z]);
    };
    for (const d of room.doors) add(d.side, d.at, d.hw);
    if (room.bailout) add(room.bailout.side, room.bailout.at, 1.2);
    return zones;
  }
  function layoutRoom(T, room) {
    const x0 = room.x0 + WALL, x1 = room.x1 - WALL, z0 = room.z0 + WALL, z1 = room.z1 - WALL;
    const cx = room.cx, cz = room.cz, Lx = x1 - x0, Lz = z1 - z0;
    const onTrain = T.kind === 'train';
    const long = onTrain ? ['z0', 'z1'] : SIDES;
    const S = T.site || {};
    const zones = doorZones(room);
    const blocks = (x, z, w, d) => zones.some(([a, b, c, e]) => x + w / 2 > a && x - w / 2 < b && z + d / 2 > c && z - d / 2 < e);
    const prop = (type, x, z, w, d, o) => {
      if ((!o || !o.walk) && blocks(x, z, w, d)) return null;
      const p = Object.assign({ type, x, z, w, d, rot: 0, tall: !!TALL[type], h: TALL[type] || 1 }, o || {});
      room.props.push(p);
      if (!o || !o.walk) T.obstacles.push(box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 'prop', p));
      return p;
    };
    /* a prop against a wall: w along the wall, d out from it */
    const wallProp = (type, s, w, d, o) => prop(type, s.x, s.z, s.alongX ? w : d, s.alongX ? d : w, Object.assign({ rot: s.rot }, o || {}));
    const scatter = (n, r, fn) => { for (let i = 0; i < n; i++) { const p = freeSpot(T, room, r); if (p) fn(p.x, p.z); } };
    const area = Lx * Lz;
    switch (room.def.layout) {
      case 'caboose':
      case 'entrance':
        for (const s of R.shuffle(wallSpots(room, 0.45, 5, { half: 1.2, sides: long })).slice(0, 3)) wallProp('bench', s, 2.2, 0.8);
        scatter(1, 0.7, (x, z) => prop('crate', x, z, 1.2, 1.2, { size: 1.2 }));
        scatter(1, 0.5, (x, z) => prop('barrel', x, z, 0.85, 0.85));
        if (room.type === 'entrance' && S.sign) scatter(1, 0.8, (x, z) => prop('obelisk', x, z, 1.2, 1.2, { color: S.signColor }));
        break;
      case 'crypt':
        for (const s of wallSpots(room, 0.75, 5.5, { half: 1.1, sides: long })) if (R.chance(0.7)) wallProp('coffin', s, 2.1, 0.9, { rot: s.rot + Math.PI / 2, open: R.chance(0.4) });
        for (let i = 0; i < 3; i++) prop('bones', R.float(x0 + 3, x1 - 3), R.float(cz - Lz / 4, cz + Lz / 4), 1, 1, { walk: true });
        prop('candles', x0 + 3, z1 - 2, 0.4, 0.4, { walk: true });
        break;
      case 'library':
        for (const s of wallSpots(room, 0.4, onTrain ? 5.2 : 3.2, { half: 1.2, sides: onTrain ? ['z0'] : SIDES })) wallProp('bookshelf', s, 2.4, 0.7);
        if (onTrain) { for (const s of wallSpots(room, 0.5, 8, { half: 1.1, sides: ['z1'] })) if (R.chance(0.6)) wallProp('bench', s, 2.2, 0.8); }
        else for (let i = 0; i < Math.floor(Lx / 8); i++) prop('bench', x0 + 5 + i * 7, cz, 2.2, 0.8, { rot: R.chance(0.5) ? 0 : Math.PI });
        prop('candles', R.float(x0 + 5, x1 - 5), cz + 1.2, 0.4, 0.4, { walk: true });
        break;
      case 'armory':
        for (const s of wallSpots(room, 0.25, onTrain ? 6 : 4, { half: 1.0, sides: onTrain ? ['z0'] : SIDES })) wallProp('rack', s, 2.0, 0.4);
        for (const s of wallSpots(room, 0.5, 9, { half: 0.5, sides: onTrain ? ['z1'] : ['z1', 'x1'] })) if (R.chance(0.6)) wallProp('barrel', s, 0.85, 0.85);
        break;
      case 'dining': {
        const n = onTrain ? 1 : Lz > 15 ? 2 : 1;
        for (let i = 0; i < n; i++) prop('banquet', cx + (onTrain ? -3 : 0), n === 1 ? cz - 1.2 : cz + (i ? 3 : -3), 4.2, 1.3);
        prop('candles', cx + 4, cz + 1.8, 0.4, 0.4, { walk: true });
        break;
      }
      case 'prison':
        for (const s of wallSpots(room, 0.8, 3.2, { half: 0.8, sides: onTrain ? ['z0'] : SIDES })) if (R.chance(0.75)) wallProp('cage', s, 1.6, 1.6, { skull: R.chance(0.5) });
        for (let i = 0; i < 2; i++) prop('bones', R.float(x0 + 3, x1 - 3), R.float(cz, z1 - 2), 1, 1, { walk: true });
        break;
      case 'garden':
        scatter(Math.round(area / (onTrain ? 40 : 30)), 0.5, (x, z) => prop('mushroom', x, z, 0.5, 0.5, { size: R.float(0.8, 1.5), color: R.pick(['#e0423a', '#b76bff', '#ffae34']) }));
        break;
      case 'mine': {
        const rz = cz + (onTrain ? 2.2 : R.float(-Lz / 4, Lz / 4));
        prop('rails', cx, rz, Lx - 4, 1.6, { walk: true, size: Lx - 4 });
        prop('minecart', x0 + R.float(5, Lx - 5), rz, 1.7, 1.2, { gold: R.chance(0.5) });
        for (const s of wallSpots(room, 0.6, 6, { half: 0.6, sides: onTrain ? ['z0'] : SIDES })) if (R.chance(0.75)) wallProp('crystals', s, 1.1, 1.1, { color: R.pick(['#ffd84a', '#6ab7ff', '#ff6b8a', '#b77bff']) });
        for (let i = 0; i < 2; i++) prop('rocks', R.float(x0 + 4, x1 - 4), cz + R.pick([-1, 1]) * R.float(1, Lz / 3), 0.9, 0.9, { walk: true });
        break;
      }
      case 'lab':
        for (const s of wallSpots(room, 0.3, onTrain ? 6 : 3.6, { half: 1.1, sides: onTrain ? ['z0'] : SIDES })) wallProp('shelf', s, 2.2, 0.6);
        for (let i = 0; i < (onTrain ? 1 : 2); i++) prop('cauldron', cx + (onTrain ? -2 : i ? 3.5 : -3.5), cz + R.pick([-1.6, 1.6]), 1.3, 1.3, { color: R.pick(['#7dff5a', '#b061ff', '#ff5fb4', '#5ec8ff']) });
        break;
      case 'ballroom':
        for (const s of wallSpots(room, 0.8, 6.5, { half: 0.5, sides: onTrain ? ['z0'] : SIDES })) wallProp('pillar', s, 0.8, 0.8);
        if (room.h < 12) for (let x = x0 + 5.5; x < x1 - 4; x += 8) prop('chandelier', x, cz, 0.5, 0.5, { walk: true, ceiling: true, y: room.h - 4.2 });
        for (const s of wallSpots(room, 1.0, 7, { half: 0.3, sides: ['z1'] })) if (R.chance(0.7)) prop('candles', s.x, s.z, 0.4, 0.4, { walk: true });
        prop('coffin', x1 - 4, z0 + 1.2, 2.1, 0.9, { rot: Math.PI / 2, open: true });
        break;
      case 'vault':
        for (let i = 0; i < 5; i++) prop('gold_pile', R.float(x0 + 2, x1 - 2), R.float(z0 + 2, z1 - 2), 0.8, 0.8, { walk: true });
        break;
      case 'boss': arena(T, room, prop, wallProp); break;
      case 'engine':
        prop('boiler', x1 - 3.1, 0, 3.4, 2.8);
        prop('coal', x1 - 7.2, -3, 1.4, 1.2, { walk: true });
        prop('coal', x1 - 7.2, 3, 1.4, 1.2, { walk: true });
        room.brake = { x: x1 - 6.5, z: 0 };
        prop('lever', x1 - 6.5, 0, 0.7, 0.7);
        T.inter.push({ kind: 'brake', x: x1 - 7.7, z: 0, r: 1.7, car: room.i, time: 2.0 });
        break;
      /* Wizard City */
      case 'plaza':
        prop('fountain', cx, cz, 3.2, 3.2, { color: S.water || '#5ec8ff' });
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop('lamppost', cx + sx * (Lx / 2 - 2.2), cz + sz * (Lz / 2 - 2.2), 0.5, 0.5);
        for (const s of R.shuffle(wallSpots(room, 0.45, 6, { half: 1.2 })).slice(0, 4)) wallProp('bench', s, 2.2, 0.8);
        break;
      case 'market': {
        const rowsN = Lz > 15 ? 2 : 1;
        for (let r = 0; r < rowsN; r++) for (let x = x0 + 4; x < x1 - 3; x += 5) if (R.chance(0.8)) prop('stall', x, rowsN === 1 ? cz : cz + (r ? 3.2 : -3.2), 2.4, 1.4, { color: R.pick(['#e0423a', '#2f6fd6', '#3fae7a', '#f0b429', '#b061ff']), rot: r ? Math.PI : 0 });
        break;
      }
      /* the Vampire Hive */
      case 'hive': {
        const nx = Math.max(1, Math.floor(Lx / 7)), nz = Math.max(1, Math.floor(Lz / 7));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if ((i + j) % 2 === 0) prop('wax', x0 + (i + 0.5) * (Lx / nx), z0 + (j + 0.5) * (Lz / nz), 1.5, 1.5, { color: S.wax });
        break;
      }
      case 'cellar':
        for (const s of wallSpots(room, 0.5, 1.9, { half: 0.45 })) if (R.chance(0.7)) wallProp('barrel', s, 0.85, 0.85);
        prop('banquet', cx, cz, 4.2, 1.3);
        break;
      /* the Lich's Well */
      case 'platform': {
        /* a wrecked subway car along one side: whichever side (and length) leaves the doorways clear */
        let side = R.chance(0.5) ? 1 : -1, placed = null;
        for (const sd of [side, -side]) for (const len of [16, 12, 9]) for (const off of [0, -4, 4, -7, 7]) {
          if (placed) break;
          const w = Math.min(len, Lx - 5);
          if (cx + off - w / 2 < x0 + 0.6 || cx + off + w / 2 > x1 - 0.6) continue;
          placed = prop('subway_car', cx + off, cz + sd * (Lz / 2 - 2.2), w, 3, { color: S.subway || '#8a9a8a' });
          if (placed) side = sd;
        }
        for (let x = x0 + 4; x < x1 - 3; x += 6) prop('pillar', x, cz - side * 1.2, 0.8, 0.8, { plain: true });
        for (const s of wallSpots(room, 0.45, 7, { half: 1.2, sides: [side > 0 ? 'z0' : 'z1'] })) if (R.chance(0.6)) wallProp('bench', s, 2.2, 0.8);
        break;
      }
      case 'subway':
        for (const s of wallSpots(room, 0.45, 3.2, { half: 1.1, sides: ['z0', 'z1'] })) if (R.chance(0.8)) wallProp('bench', s, 2.2, 0.8);
        for (let x = x0 + 3; x < x1 - 2; x += 5) prop('pole', x, cz, 0.2, 0.2);
        break;
      case 'tunnel':
        prop('rails', cx, cz, Lx - 3, 1.6, { walk: true, size: Lx - 3 });
        for (let i = 0; i < 4; i++) prop('rocks', R.float(x0 + 3, x1 - 3), R.float(z0 + 2, z1 - 2), 0.9, 0.9, { walk: true });
        for (const s of wallSpots(room, 0.5, 7, { half: 0.5 })) if (R.chance(0.5)) wallProp('barrel', s, 0.85, 0.85);
        break;
      /* the Mystery Dungeon */
      case 'pool':
        prop('pool', cx, cz, Math.max(4, Lx * 0.42), Math.max(4, Lz * 0.4), { color: S.water || '#5ec8ff' });
        for (const s of wallSpots(room, 0.6, 7, { half: 0.6 })) if (R.chance(0.4)) wallProp('rocks', s, 0.9, 0.9, { walk: true });
        break;
      case 'bakery':
        for (const s of wallSpots(room, 0.5, 4.5, { half: 0.9 })) if (R.chance(0.7)) wallProp('oven', s, 1.6, 1.2);
        prop('banquet', cx, cz, 4.2, 1.3, { pies: true });
        break;
      default: break;
    }
    const def = room.def;
    const big = onTrain ? 1 : U.clamp(area / 250, 1, 1.6);
    if (def.breakables) {
      const nB = Math.round(R.int(def.breakables[0], def.breakables[1]) * big);
      for (let i = 0; i < nB; i++) {
        const type = def.layout === 'armory' ? R.pick(['crate', 'barrel', 'crate']) : def.layout === 'hive' ? R.pick(['urn', 'urn', 'crate']) : R.pick(['urn', 'crate', 'barrel', 'urn']);
        const pos = freeSpot(T, room, 0.7);
        if (pos) breakable(T, room, type, pos.x, pos.z, 0.85);
      }
    }
    if (def.chest) {
      const nC = def.chests || 1;
      for (let i = 0; i < nC; i++) {
        const pos = i === 0 && onTrain && room.type !== 'vault' ? freeSpot(T, room, 1.1, null, { minX: room.x0 + (room.x1 - room.x0) * 0.55 }) || freeSpot(T, room, 1.1) : freeSpot(T, room, 1.1);
        if (!pos) continue;
        const c = chest(T, room, pos.x, pos.z, room.type === 'vault');
        c.keyLocked = room.type === 'vault' ? false : T.mod === 'treasure' ? false : R.chance(0.12);
      }
    }
    if (room.snail) {
      const pos = freeSpot(T, room, 0.5);
      if (pos) { room.snailSpot = pos; T.inter.push({ kind: 'snail', x: pos.x, z: pos.z, r: 1.3, car: room.i, time: 0.4 }); }
    }
  }
  /* The boss room, dressed for each place, with the middle kept clear for the fight. */
  function arena(T, room, prop, wallProp) {
    const x0 = room.x0 + WALL, x1 = room.x1 - WALL, z0 = room.z0 + WALL, z1 = room.z1 - WALL;
    const cx = room.cx, cz = room.cz;
    const style = T.site ? T.site.arenaStyle : 'train';
    const corners = (inset) => [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]];
    const gems = ['#ffd84a', '#6ab7ff', '#ff6b8a', '#b77bff'];
    if (style === 'train') {
      prop('throne', x1 - 2.2, z0 + 3.2, 1.4, 1.2, { rot: -Math.PI / 2 });
      prop('candles', x1 - 4.2, z0 + 2.4, 0.4, 0.4, { walk: true });
      prop('candles', x1 - 3, z1 - 2.4, 0.4, 0.4, { walk: true });
      for (const [x, z] of corners(2.2)) if (x < x1 - 5) prop('candles', x, z, 0.4, 0.4, { walk: true });
    } else if (style === 'crystal') {
      for (const [x, z] of corners(2.6)) prop('crystals', x, z, 1.4, 1.4, { color: R.pick(gems), size: 1.5 });
      for (const s of wallSpots(room, 0.7, 5, { half: 0.6 })) if (R.chance(0.4)) wallProp('crystals', s, 1.1, 1.1, { color: R.pick(gems) });
    } else if (style === 'palace') {
      for (const s of wallSpots(room, 0.7, 5.5, { half: 0.8 })) wallProp('hedge', s, 1.6, 1.2);
      for (const [x, z] of corners(3)) prop('lamppost', x, z, 0.5, 0.5);
    } else if (style === 'throne') {
      const d = room.doors[0];
      const far = !d ? 'x1' : { x0: 'x1', x1: 'x0', z0: 'z1', z1: 'z0' }[d.side];
      const s = wallSpots(room, 1.2, 100, { half: 0.8, sides: [far] })[0];
      if (s) wallProp('throne', s, 1.4, 1.2);
      for (const sp of wallSpots(room, 0.9, 6, { half: 0.5 })) if (!s || Math.hypot(sp.x - s.x, sp.z - s.z) > 3) wallProp('pillar', sp, 0.8, 0.8);
    } else if (style === 'well') {
      prop('well', cx, cz, 5, 5, { color: '#7dff5a' });
      for (const [x, z] of corners(2.4)) prop('pillar', x, z, 0.8, 0.8, { plain: true });
    }
  }
  function breakable(T, room, type, x, z, s) {
    const b = { type, x, z, s: s || 0.9, hp: type === 'crate' ? 3 : 2, car: room.i, alive: true };
    b.ob = box(x - b.s / 2, x + b.s / 2, z - b.s / 2, z + b.s / 2, 'breakable', b);
    T.obstacles.push(b.ob);
    T.breakables.push(b);
    return b;
  }
  function chest(T, room, x, z, fancy) {
    const face = z > room.cz ? -1 : 1;
    const c = { x, z, face, fancy: !!fancy, car: room.i, opened: false, locked: true, keyLocked: false };
    c.ob = box(x - 0.55, x + 0.55, z - 0.4, z + 0.4, 'chest', c);
    T.obstacles.push(c.ob);
    T.chests.push(c);
    T.inter.push({ kind: 'chest', x, z, r: 1.7, car: room.i, ref: c, time: 1.1 });
    return c;
  }

  /* A random clear spot inside a room: away from walls, props, doorways and exits. */
  function freeSpot(T, room, r, avoid, o) {
    o = o || {};
    const x0 = Math.max(room.x0 + WALL + r + 0.4, o.minX != null ? o.minX : -Infinity), x1 = room.x1 - WALL - r - 0.4;
    const z0 = room.z0 + WALL + r + 0.3, z1 = room.z1 - WALL - r - 0.3;
    if (x0 > x1 || z0 > z1) return null;
    const doors = room.doors.map((d) => doorPoint(room, d));
    if (room.bailout) doors.push(doorPoint(room, room.bailout));
    for (let tries = 0; tries < 60; tries++) {
      const x = R.float(x0, x1), z = R.float(z0, z1);
      if (doors.some((p) => U.dist2(x, z, p.x + p.nx, p.z + p.nz) < (2.6 + r) * (2.6 + r))) continue;
      if (avoid && U.dist2(x, z, avoid.x, avoid.z) < (avoid.r || 5) * (avoid.r || 5)) continue;
      if (T.start && U.dist2(x, z, T.start.x, T.start.z) < 2.5 * 2.5) continue;
      if (room.brake && U.dist2(x, z, room.brake.x, room.brake.z) < 9) continue;
      let ok = true;
      for (const ob of T.obstacles) {
        if (!ob.active && ob.kind !== 'gate') continue;
        if (x + r > ob.minX - 0.25 && x - r < ob.maxX + 0.25 && z + r > ob.minZ - 0.25 && z - r < ob.maxZ + 0.25) { ok = false; break; }
      }
      if (ok) return { x, z };
    }
    return null;
  }

  /* ---------- collision ---------- */
  /* The walkable rectangle at a point (-1 if it's inside a wall). `pref` is checked first. */
  function rectAt(T, x, z, pref) {
    const W = T.walk;
    if (pref != null && pref >= 0 && pref < W.length && inRect(W[pref], x, z, 0)) return pref;
    for (let k = 0; k < W.length; k++) if (inRect(W[k], x, z, 0)) return k;
    return -1;
  }
  /* The room (not a doorway or corridor) at a point. */
  function carAt(T, x, z) {
    for (const c of T.cars) if (inRect(T.walk[c.rect], x, z == null ? c.cz : z, 0)) return c;
    return null;
  }
  /* Is a point at least `m` inside a room's floor? */
  function inRoom(T, room, x, z, m) { return inRect(T.walk[room.rect], x, z, m || 0); }
  /* Keep a circle of radius r inside the walkable area (in the nearest rectangle it fits). */
  function keepInside(T, p, r) {
    let bd = Infinity, bx = p.x, bz = p.z;
    for (const w of T.walk) {
      const x0 = w.x0 + r, x1 = w.x1 - r, z0 = w.z0 + r, z1 = w.z1 - r;
      if (x0 > x1 || z0 > z1) continue;
      const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
      const cz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
      const d = (cx - p.x) * (cx - p.x) + (cz - p.z) * (cz - p.z);
      if (d === 0) return;
      if (d < bd) { bd = d; bx = cx; bz = cz; }
    }
    p.x = bx; p.z = bz;
  }
  function pushOut(p, r, o) {
    const cx = U.clamp(p.x, o.minX, o.maxX), cz = U.clamp(p.z, o.minZ, o.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
    else {
      const l = p.x - o.minX, rr = o.maxX - p.x, t = p.z - o.minZ, b = o.maxZ - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) p.x = o.minX - r; else if (m === rr) p.x = o.maxX + r; else if (m === t) p.z = o.minZ - r; else p.z = o.maxZ + r;
    }
    return true;
  }
  const HARD = new Set(['gate', 'lock']);
  /* Keep a circle inside the world and out of obstacles. hardOnly: only walls, gates and locked doors
     (used while something is in the air, so it can fly over tables but never through walls). */
  function resolve(T, p, r, hardOnly) {
    keepInside(T, p, r);
    for (let pass = 0; pass < 2; pass++) {
      for (const o of T.obstacles) {
        if (!o.active || (hardOnly && !HARD.has(o.kind))) continue;
        if (p.x + r < o.minX || p.x - r > o.maxX || p.z + r < o.minZ || p.z - r > o.maxZ) continue;
        pushOut(p, r, o);
      }
    }
    keepInside(T, p, r);
  }
  function fits(T, x, z, m) { for (const w of T.walk) if (inRect(w, x, z, m)) return true; return false; }
  function hardHit(T, x, z, r) {
    if (!fits(T, x, z, r * 0.5)) return true;
    for (const o of T.obstacles) {
      if (!o.active || !HARD.has(o.kind)) continue;
      const cx = U.clamp(x, o.minX, o.maxX), cz = U.clamp(z, o.minZ, o.maxZ);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r * 0.8) return true;
    }
    return false;
  }
  /* Walk from a toward b and stop just before the first wall, gate or locked door.
     Leaps, lunges, blinks, knockbacks and grapples use this so nothing can skip past a closed gate. */
  function clampPath(T, a, b, r) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.2));
    let last = { x: a.x, z: a.z };
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + (dx * i) / n, z: a.z + (dz * i) / n };
      if (hardHit(T, p.x, p.z, r)) return last;
      last = p;
    }
    return last;
  }
  const WALLHIT = { kind: 'wall' };
  function solidAt(T, x, z) {
    if (!fits(T, x, z, 0)) return WALLHIT;
    for (const o of T.obstacles) if (o.active && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return o;
    return null;
  }
  /* Is there a clear line between two points (walls only)? */
  function los(T, ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.5));
    let k = rectAt(T, ax, az, -1);
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (k >= 0 && inRect(T.walk[k], x, z, 0)) continue;
      k = rectAt(T, x, z, -1);
      if (k < 0) return false;
    }
    return true;
  }
  /* Where should a monster at `e` head to reach (tx, tz)? Straight there when they're in the same
     rectangle; otherwise the next doorway on the way. Returns null for "go straight". */
  function steer(T, e, tx, tz) {
    let a = rectAt(T, e.x, e.z, e.rk);
    e.rk = a;
    const b = rectAt(T, tx, tz, e.tk);
    e.tk = b;
    if (a < 0 || b < 0 || a === b) return null;
    for (let guard = 0; guard < 6 && a !== b; guard++) {
      const n = T.next[a][b];
      if (n < 0) return null;
      if (inRect(T.walk[n], e.x, e.z, 0)) { a = n; continue; }
      return T.portal[a][n];
    }
    return null;
  }
  /* Can the camera be here? (inside the walkable space, clear of walls and under the ceiling) */
  function cameraFree(T, x, y, z) {
    if (y < 0.35) return false;
    for (const w of T.walk) if (inRect(w, x, z, 0.3) && y < w.h - 0.3) return true;
    return false;
  }
  /* Where (0..1) the flat segment a→b first enters box o (grown by m), or null if it misses. */
  function segBox2D(a, b, o, m) {
    let t0 = 0, t1 = 1;
    const d = [b.x - a.x, b.z - a.z], p = [a.x, a.z], lo = [o.minX - m, o.minZ - m], hi = [o.maxX + m, o.maxZ + m];
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (p[i] < lo[i] || p[i] > hi[i]) return null; continue; }
      let ta = (lo[i] - p[i]) / d[i], tb = (hi[i] - p[i]) / d[i];
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }
  /* Pull the camera toward the pivot until nothing blocks the view (walls, the ceiling, closed gates). */
  function cameraSafe(T, pivot, want) {
    const steps = 24;
    let tmax = 1;
    for (const o of T.gates) if (o.ob.active) { const t = segBox2D(pivot, want, o.ob, 0.3); if (t != null && t < tmax) tmax = t; }
    if (tmax < 1) { const k = Math.max(0, tmax - 0.02); want = { x: pivot.x + (want.x - pivot.x) * k, y: pivot.y + (want.y - pivot.y) * k, z: pivot.z + (want.z - pivot.z) * k }; }
    let last = { x: pivot.x, y: pivot.y, z: pivot.z };
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const p = { x: pivot.x + (want.x - pivot.x) * k, y: pivot.y + (want.y - pivot.y) * k, z: pivot.z + (want.z - pivot.z) * k };
      if (!cameraFree(T, p.x, p.y, p.z)) return last;
      last = p;
    }
    return last;
  }
  /* Close or open a boss room's gates. */
  function setArena(T, room, closed) {
    for (const g of room.gates || []) {
      g.open = !closed;
      g.ob.active = closed;
      if (g.mesh) g.mesh.visible = closed;
    }
  }
  /* A random point in a room, `m` from the walls (boss attacks that fill the room). */
  function roomPoint(room, m) {
    return { x: R.float(room.x0 + WALL + m, room.x1 - WALL - m), z: R.float(room.z0 + WALL + m, room.z1 - WALL - m) };
  }

  DT.game.world = { WD, generate, freeSpot, carAt, inRoom, rectAt, resolve, solidAt, pushOut, cameraSafe, cameraFree, clampPath, los, steer, setArena, roomPoint, doorPoint };
})();

/* ---------- meshes ---------- */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const MD = DT.game.models;
  const WG = DT.game.world;
  const { WALL, DOORH, GAP } = WG.WD;
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, Object.assign({ inkT: 0.012 }, o || {}));
  const B = (w, h, d) => GF.geo('box', w, h, d);
  const put = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  /* A box whose texture repeats every `s` metres on each face, so one texture fits walls of any size. */
  function boxUV(T, w, h, d, s) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * dims[f][0]) / s, (uv.getY(i) * dims[f][1]) / s); }
    uv.needsUpdate = true;
    T.geos.push(g);
    return g;
  }
  /* One side of a room: a wall with openings for its doors, and a lintel over each opening when `lintel`
     is lower than the wall. */
  function sideWall(T, g, room, side, mat, H, lintel, s) {
    const alongX = side[0] === 'z';
    const lo = alongX ? room.x0 : room.z0, hi = alongX ? room.x1 : room.z1;
    const at = side === 'z0' ? room.z0 + WALL / 2 : side === 'z1' ? room.z1 - WALL / 2 : side === 'x0' ? room.x0 + WALL / 2 : room.x1 - WALL / 2;
    const gaps = room.doors.filter((d) => d.side === side).map((d) => [d.at - d.hw, d.at + d.hw]).sort((a, b) => a[0] - b[0]);
    const seg = (a, b, y0, y1) => {
      if (b - a < 0.02 || y1 - y0 < 0.02) return;
      const len = b - a, mid = (a + b) / 2;
      const geo = alongX ? boxUV(T, len, y1 - y0, WALL, s) : boxUV(T, WALL, y1 - y0, len, s);
      put(g, geo, mat, alongX ? mid : at, (y0 + y1) / 2, alongX ? at : mid);
    };
    let t = lo;
    for (const [a, b] of gaps) { seg(t, a, 0, H); if (lintel < H) seg(a, b, lintel, H); t = b; }
    seg(t, hi, 0, H);
  }
  /* Posts on both sides of each doorway, and a bar across the top when `bar`. */
  function doorFrames(g, room, side, color, h, bar) {
    for (const d of room.doors.filter((q) => q.side === side)) {
      const p = WG.doorPoint(room, d);
      const across = side[0] === 'x';
      const px = p.x + p.nx * WALL / 2, pz = p.z + p.nz * WALL / 2;
      for (const s of [-1, 1]) g.add(P(B(across ? WALL + 0.08 : 0.2, h, across ? 0.2 : WALL + 0.08), color, [across ? px : d.at + s * d.hw, h / 2, across ? d.at + s * d.hw : pz]));
      if (bar) g.add(P(across ? B(WALL + 0.08, 0.2, d.hw * 2 + 0.2) : B(d.hw * 2 + 0.2, 0.2, WALL + 0.08), color, [across ? px : d.at, h, across ? d.at : pz]));
    }
  }
  function floor(T, g, x0, x1, z0, z1, mat) { put(g, boxUV(T, x1 - x0, 0.3, z1 - z0, 3), mat, (x0 + x1) / 2, -0.15, (z0 + z1) / 2); }

  /* ---------- the train ---------- */
  function trainSide(T, g, car, side, mats) {
    const line = T.line;
    const L = car.x1 - car.x0, H = car.h, cx = car.cx;
    const z = side === 'z0' ? car.z0 + WALL / 2 : car.z1 - WALL / 2;
    const lo = 1.3, hi = H > 5 ? Math.min(H - 1.6, 2.7 + (H - 4.6) * 0.5) : 2.7;
    put(g, boxUV(T, L, lo, WALL, 2.2), mats.wall, cx, lo / 2, z);
    put(g, boxUV(T, L, H - hi, WALL, 2.2), mats.wall, cx, (hi + H) / 2, z);
    const nWin = Math.max(4, Math.round(L / 4.4)), step = L / nWin;
    const doorX = car.bailout && car.bailout.side === side ? car.bailout.at : null;
    for (let i = 0; i <= nWin; i++) g.add(P(B(i === 0 || i === nWin ? 0.6 : 1.3, hi - lo, WALL + 0.02), line.wall, [car.x0 + i * step, (lo + hi) / 2, z], { ink: false }));
    for (let i = 0; i < nWin; i++) {
      const wx = car.x0 + (i + 0.5) * step;
      if (doorX != null && Math.abs(wx - doorX) < step * 0.8) { g.add(P(B(step - 1.2, hi - lo, WALL), line.wall, [wx, (lo + hi) / 2, z], { ink: false })); continue; }
      for (const o of [-0.45, 0, 0.45]) g.add(P(GF.geo('cyl', 0.035, 0.035, hi - lo, 6), '#3a3f4b', [wx + o, (lo + hi) / 2, z], { ink: false }));
      if (i > 0) { const t = MD.torch(); t.position.set(car.x0 + i * step, 2.0, z - Math.sign(z) * (WALL / 2 + 0.05)); t.rotation.y = z > 0 ? Math.PI : 0; g.add(t); }
    }
    g.add(P(B(L, 0.14, WALL + 0.06), line.trim, [cx, lo, z], { ink: false }));
    g.add(P(B(L, 0.14, WALL + 0.06), line.trim, [cx, hi, z], { ink: false }));
  }
  function buildCar(T, car, mats) {
    const g = new THREE.Group();
    const line = T.line;
    const L = car.x1 - car.x0, W = car.z1 - car.z0, H = car.h, cx = car.cx;
    floor(T, g, car.x0, car.x1, car.z0, car.z1, mats.floor);
    if (car.type !== 'caboose' && car.type !== 'engine') g.add(P(B(L - 2, 0.02, car.type === 'boss' ? 6 : 2.6), car.type === 'boss' ? '#6a1a2a' : line.trim, [cx, 0.01, 0], { ink: false }));
    /* undercarriage and wheels (they spin while the train runs) */
    g.add(P(B(L - 1.2, 0.7, W - 1.4), '#23262f', [cx, -0.65, 0], { ink: false }));
    for (const wx of [car.x0 + 2.6, car.x0 + 4.4, car.x1 - 4.4, car.x1 - 2.6]) {
      for (const s of [-1, 1]) {
        const wh = new THREE.Group();
        wh.position.set(wx, -0.92, s * (W / 2 - 1.1));
        wh.add(P(GF.geo('cyl', 0.52, 0.52, 0.22, 16), '#3a3f4b', [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }));
        wh.add(P(B(0.9, 0.12, 0.24), '#8a8f9a', [0, 0, 0], { ink: false }));
        g.add(wh);
        T.wheels.push(wh);
      }
    }
    trainSide(T, g, car, 'z0', mats);
    trainSide(T, g, car, 'z1', mats);
    /* ceiling, beams and lanterns */
    g.add(P(B(L, 0.25, W), line.trim, [cx, H + 0.12, 0], { ink: false }));
    for (let x = car.x0 + 1.5; x < car.x1; x += 3.2) g.add(P(B(0.35, 0.3, W), '#4a3326', [x, H - 0.1, 0], { ink: false }));
    for (let x = car.x0 + 4; x < car.x1 - 2; x += 6.5) { const lt = MD.lantern(line.id === 'night' ? '#ff6b6b' : line.id === 'ice' ? '#bfefff' : '#ffd66b'); lt.position.set(x, H - 0.5, 0); g.add(lt); }
    /* end walls with door openings */
    for (const side of ['x0', 'x1']) {
      sideWall(T, g, car, side, mats.wall, H, DOORH, 2.2);
      doorFrames(g, car, side, line.trim, DOORH, true);
    }
    /* the gangway to the next car */
    if (T.cars[car.i + 1]) {
      const gx = car.x1 + GAP / 2, dh = WG.WD.DOOR;
      g.add(P(B(GAP, 0.2, dh * 2 + 0.4), '#3a3f4b', [gx, -0.1, 0], { ink: false }));
      for (const s of [-1, 1]) g.add(P(B(GAP, DOORH + 0.2, 0.14), '#2a2e38', [gx, DOORH / 2, (dh + 0.2) * s], { ink: false }));
      g.add(P(B(GAP, 0.14, dh * 2 + 0.5), '#2a2e38', [gx, DOORH + 0.1, 0], { ink: false }));
    }
    return g;
  }

  /* ---------- places off the train ---------- */
  function buildSiteRoom(T, room, mats) {
    const g = new THREE.Group();
    const S = T.site, line = T.line;
    const H = S.ceiling || S.wallH || 6;
    const lintel = S.ceiling ? Math.min(H, 4.4) : H + 1;
    floor(T, g, room.x0, room.x1, room.z0, room.z1, mats.floor);
    for (const side of ['x0', 'x1', 'z0', 'z1']) {
      sideWall(T, g, room, side, mats.wall, H, lintel, S.wallTex || 3);
      doorFrames(g, room, side, line.trim, Math.min(H, 4.4), !!S.ceiling);
    }
    if (S.ceiling) {
      put(g, B(room.x1 - room.x0, 0.3, room.z1 - room.z0), mats.ceil, room.cx, H + 0.15, room.cz);
      for (let x = room.x0 + 3; x < room.x1 - 1; x += 4) g.add(P(B(0.4, 0.35, room.z1 - room.z0), line.trim, [x, H - 0.15, room.cz], { ink: false }));
    } else {
      /* a band of trim along the top of open-air walls */
      for (const side of ['x0', 'x1', 'z0', 'z1']) {
        const alongX = side[0] === 'z';
        const len = alongX ? room.x1 - room.x0 : room.z1 - room.z0;
        const at = side === 'z0' ? room.z0 + WALL / 2 : side === 'z1' ? room.z1 - WALL / 2 : side === 'x0' ? room.x0 + WALL / 2 : room.x1 - WALL / 2;
        g.add(P(alongX ? B(len + 0.2, 0.35, WALL + 0.3) : B(WALL + 0.3, 0.35, len + 0.2), line.trim, [alongX ? room.cx : at, H + 0.17, alongX ? at : room.cz], { ink: false }));
      }
    }
    /* wall lights */
    for (const side of ['x0', 'x1', 'z0', 'z1']) {
      const alongX = side[0] === 'z';
      const len = alongX ? room.x1 - room.x0 : room.z1 - room.z0;
      const n = Math.max(1, Math.floor(len / 7));
      for (let i = 0; i < n; i++) {
        const t = (alongX ? room.x0 : room.z0) + ((i + 0.5) * len) / n;
        if (room.doors.some((d) => d.side === side && Math.abs(d.at - t) < d.hw + 1)) continue;
        if (room.bailout && room.bailout.side === side && Math.abs(room.bailout.at - t) < 2.4) continue;
        const lamp = S.lamp === 'lantern';
        const tr = lamp ? MD.lantern(S.lampColor || '#ffd66b') : MD.torch();
        const p = WG.doorPoint(room, { side, at: t });
        tr.position.set(p.x + p.nx * (WALL + 0.06), lamp ? 3.2 : 2.2, p.z + p.nz * (WALL + 0.06));
        tr.rotation.y = Math.atan2(p.nx, p.nz);
        g.add(tr);
      }
    }
    return g;
  }
  function buildCorridor(T, L, mats, root) {
    const S = T.site;
    const H = S.ceiling || S.wallH || 6;
    const len = L.to - L.from;
    if (len <= 0.05) return;
    const g = new THREE.Group();
    const mid = (L.from + L.to) / 2;
    if (L.alongX) floor(T, g, L.from, L.to, L.at - L.hw, L.at + L.hw, mats.floor);
    else floor(T, g, L.at - L.hw, L.at + L.hw, L.from, L.to, mats.floor);
    for (const s of [-1, 1]) {
      const off = L.at + s * (L.hw + WALL / 2);
      if (L.alongX) put(g, boxUV(T, len, H, WALL, S.wallTex || 3), mats.wall, mid, H / 2, off);
      else put(g, boxUV(T, WALL, H, len, S.wallTex || 3), mats.wall, off, H / 2, mid);
    }
    if (S.ceiling) {
      if (L.alongX) put(g, B(len, 0.3, L.hw * 2 + WALL * 2), mats.ceil, mid, H + 0.15, L.at);
      else put(g, B(L.hw * 2 + WALL * 2, 0.3, len), mats.ceil, L.at, H + 0.15, mid);
    }
    root.add(g);
  }

  /* An exit on a wall: a dark doorway with a glowing green frame (the train's jump-off doors, and the
     ways out of the places off the train). */
  function exitMesh(T, room, g) {
    const b = room.bailout;
    const p = WG.doorPoint(room, b);
    const across = b.side[0] === 'x';
    const inX = p.x + p.nx * (WALL + 0.02), inZ = p.z + p.nz * (WALL + 0.02);
    put(g, across ? B(0.06, 2.6, 2.2) : B(2.2, 2.6, 0.06), GF.basic('#0b2a14'), inX, 1.3, inZ);
    for (const s of [-1, 1]) g.add(P(across ? B(0.3, 2.8, 0.2) : B(0.2, 2.8, 0.3), '#3fe07a', [inX + (across ? 0 : 1.2 * s), 1.4, inZ + (across ? 1.2 * s : 0)], { emissive: '#22c55e', ei: 0.9 }));
    g.add(P(across ? B(0.3, 0.2, 2.6) : B(2.6, 0.2, 0.3), '#3fe07a', [inX, 2.8, inZ], { emissive: '#22c55e', ei: 0.9 }));
    const pad = new THREE.Mesh(GF.geo('circle', 1.4, 32), GF.basic('#3fe07a', { opacity: 0.25 }).clone());
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(p.x + p.nx * (WALL + 1.0), 0.03, p.z + p.nz * (WALL + 1.0));
    g.add(pad);
    T.materials.push(pad.material);
    room.bailoutMesh = pad;
  }

  function buildMeshes(T) {
    const root = new THREE.Group();
    const line = T.line, S = T.site;
    T.geos = []; T.textures = []; T.materials = []; T.wheels = [];
    const wallT = S ? GF.wallTexture(S.walls || 'bricks', line) : GF.brickTexture(line);
    const floorT = S ? GF.siteFloorTexture(S.floor || 'stone', line) : GF.floorTexture(line);
    const mats = { wall: GF.texMat(wallT), floor: GF.texMat(floorT), ceil: GF.mat(S && S.ceilColor ? S.ceilColor : line.trim) };
    T.textures.push(wallT, floorT);
    T.materials.push(mats.wall, mats.floor);
    for (const car of T.cars) {
      car.group = T.kind === 'train' ? buildCar(T, car, mats) : buildSiteRoom(T, car, mats);
      root.add(car.group);
      if (car.bailout) exitMesh(T, car, car.group);
      for (const p of car.props) {
        const m = MD.prop(p.type, { color: p.color, size: p.size, open: p.open, skull: p.skull, gold: p.gold, accent: line.accent, w: p.w, d: p.d, pies: p.pies, plain: p.plain, rot: p.rot });
        m.position.set(p.x, p.y || 0, p.z);
        m.rotation.y = p.rot || 0;
        car.group.add(m);
        p.mesh = m;
        if (p.type === 'lever') car.leverMesh = m;
      }
      if (car.snailSpot) { const m = MD.snail(); m.position.set(car.snailSpot.x, 0, car.snailSpot.z); m.rotation.y = Math.PI * 0.8; car.group.add(m); car.snailMesh = m; }
    }
    if (T.kind === 'site') for (const L of T.links) buildCorridor(T, L, mats, root);
    /* gates: iron bars, or Wizard City's magic barrier */
    for (const g of T.gates) {
      const magic = g.kind === 'gate' && S && S.gate === 'magic';
      const m = magic ? MD.barrier(g.w, S.ceiling || 7, S.gateColor) : MD.gate(g.w, g.kind === 'lock' ? null : '#6a1a2a');
      m.position.set(g.x, 0, g.z);
      m.rotation.y = g.rot;
      m.visible = !g.open;
      root.add(m);
      g.mesh = m;
    }
    for (const b of T.breakables) { const m = MD.prop(b.type, { size: b.s }); m.position.set(b.x, 0, b.z); m.rotation.y = Math.random() * 0.6 - 0.3; root.add(m); b.mesh = m; }
    for (const c of T.chests) { const m = MD.chest(c.fancy); m.position.set(c.x, 0, c.z); m.rotation.y = c.face < 0 ? Math.PI : 0; root.add(m); c.mesh = m; }
    if (T.kind === 'train') outsideTrain(T, root); else outsideSite(T, root);
    T.root = root;
    return root;
  }
  /* The world outside the windows (both sides), the ground rushing by and the rails. */
  function outsideTrain(T, root) {
    const line = T.line;
    const skyTex = GF.sceneryTexture(line, 0), skyTex2 = GF.sceneryTexture(line, 1.7);
    skyTex.repeat.set(2.2, 1); skyTex2.repeat.set(2.2, 1);
    T.skyTex = [skyTex, skyTex2];
    T.skies = [];
    const half = Math.max(...T.cars.map((c) => (c.z1 - c.z0) / 2));
    for (const [z, tex, rot] of [[-half - 14, skyTex, 0], [half + 14, skyTex2, Math.PI]]) {
      const sky = new THREE.Mesh(GF.geo('plane', 260, 40), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      sky.position.set(T.maxX / 2, 7, z);
      sky.rotation.y = rot;
      root.add(sky);
      T.skies.push(sky);
    }
    const groundTex = GF.groundTexture(line);
    const ground = new THREE.Mesh(GF.geo('plane', 460, 90), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(T.maxX / 2, -1.6, 0);
    root.add(ground);
    for (const z of [-3.9, 3.9]) root.add(GF.part(GF.geo('box', T.maxX + 200, 0.12, 0.16), '#6b6f7a', [T.maxX / 2, -1.5, z], { ink: false }));
    T.ground = ground; T.groundTex = groundTex;
    T.tunnelTex = GF.tunnelTexture();
    T.tunnelTex.repeat.set(6, 1);
  }
  /* Off the train: ground all around, and for open-air places a painted horizon. */
  function outsideSite(T, root) {
    const line = T.line, S = T.site;
    const cx = (T.minX + T.maxX) / 2, cz = (T.minZ + T.maxZ) / 2;
    const size = Math.max(T.maxX - T.minX, T.maxZ - T.minZ);
    const groundTex = GF.groundTexture(line);
    groundTex.repeat.set(8, 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size + 400, size + 400), new THREE.MeshBasicMaterial({ map: groundTex }));
    T.geos.push(ground.geometry);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.32, cz);
    root.add(ground);
    T.ground = ground; T.groundTex = groundTex;
    if (!S.ceiling) {
      const tex = GF.sceneryTexture(line, 0.6);
      tex.repeat.set(3, 1);
      const rad = size * 0.75 + 70;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 90, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
      ring.position.set(cx, 22, cz);
      root.add(ring);
      T.geos.push(ring.geometry);
      T.skyTex = [tex];
      T.backdrop = ring;
    }
  }
  /* Swap the scenery for the dark Loop Tunnel (or back). */
  function setTunnel(T, on) {
    if (T.skies) T.skies.forEach((s, i) => { s.material.map = on ? T.tunnelTex : T.skyTex[i]; s.material.needsUpdate = true; });
    if (T.ground) T.ground.material.color.copy(GF.lin(on ? '#111118' : '#ffffff'));
    if (T.backdrop) T.backdrop.material.color.copy(GF.lin(on ? '#553344' : '#ffffff'));
  }
  function disposeTrain(T) {
    if (!T || !T.root) return;
    GF.scene.remove(T.root);
    for (const t of T.textures || []) t.dispose();
    for (const t of T.skyTex || []) t.dispose();
    if (T.tunnelTex) T.tunnelTex.dispose();
    if (T.groundTex) T.groundTex.dispose();
    for (const m of T.materials || []) m.dispose();
    for (const g of T.geos || []) g.dispose();
    for (const s of T.skies || []) s.material.dispose();
    if (T.ground) T.ground.material.dispose();
    if (T.backdrop) T.backdrop.material.dispose();
  }

  Object.assign(WG, { buildMeshes, disposeTrain, setTunnel });
})();
