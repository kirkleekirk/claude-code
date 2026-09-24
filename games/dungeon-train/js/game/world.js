/* The Dungeon Train: car layout generation, collision (heroes, enemies, projectiles, the camera) and meshes.
   Cars run along +x; z is across the car; y is up. */
(function () {
  'use strict';
  const D = DT.data;
  const R = DT.R;
  const U = DT.U;
  const W = 9, L = 26, GAP = 2, DOOR = 1.4, WALL = 0.3, H = 4.2, DOORH = 3.0;
  const WD = { W, L, GAP, DOOR, WALL, H, DOORH };

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
  function box(minX, maxX, minZ, maxZ, kind, ref) { return { minX, maxX, minZ, maxZ, kind, ref, active: true }; }

  function generate(G, offer) {
    const line = D.LINES.find((l) => l.id === offer.line);
    const n = Math.max(5, offer.cars);
    const types = pickTypes(n, offer, line);
    const train = { line, offer, tier: line.tier, mod: offer.mod, cars: [], obstacles: [], breakables: [], chests: [], inter: [], minX: 0, maxX: 0, W, L, GAP, DOOR, H };
    let x = 0;
    for (let i = 0; i < n; i++) {
      const car = { i, type: types[i], def: D.CAR_TYPES[types[i]], x0: x, x1: x + L, entered: i === 0, cleared: i === 0, props: [], locked: false };
      car.name = car.def.name;
      train.cars.push(car);
      x += L + (i < n - 1 ? GAP : 0);
    }
    train.maxX = x;
    for (const car of train.cars) {
      for (const X of [car.x0, car.x1]) {
        const closed = (X === car.x0 && car.i === 0) || (X === car.x1 && car.i === n - 1);
        if (closed) train.obstacles.push(box(X - WALL, X + WALL, -W / 2, W / 2, 'wall'));
        else { train.obstacles.push(box(X - WALL / 2, X + WALL / 2, -W / 2, -DOOR, 'wall')); train.obstacles.push(box(X - WALL / 2, X + WALL / 2, DOOR, W / 2, 'wall')); }
      }
    }
    /* jump-off doors in 1-2 middle cars */
    const middle = train.cars.filter((c) => c.i > 0 && c.i < n - 2 && c.type !== 'vault');
    for (const car of R.shuffle(middle).slice(0, n >= 7 ? 2 : 1)) {
      const bx = car.x0 + R.float(7, L - 7);
      car.bailout = { x: bx };
      train.inter.push({ kind: 'bailout', x: bx, z: -(W / 2 - 1.2), r: 1.6, car: car.i, time: 3.5 });
    }
    const snailCar = R.chance(0.35) ? R.pick(middle) : null;
    if (snailCar) snailCar.snail = true;
    const vault = train.cars.find((c) => c.type === 'vault');
    const eliteCars = train.cars.filter((c) => c.i >= 2 && c.i < n - 2 && c.type !== 'vault');
    if (vault) vault.elite = true;
    else if (eliteCars.length && R.chance(0.6)) R.pick(eliteCars).elite = true;
    if (offer.mod === 'elites' && eliteCars.length) R.pick(eliteCars).elite = true;
    train.cars[n - 2].boss = line.boss;
    for (const car of train.cars) layoutCar(train, car);
    return train;
  }

  function layoutCar(train, car) {
    const x0 = car.x0, x1 = car.x1, cx = (x0 + x1) / 2;
    /* props tall enough to hide a hero, with their height (they fade out when they get in the camera's way) */
    const TALL = { mushroom: 1.6, bookshelf: 2.8, cage: 2.4, rack: 1.9, boiler: 3.7, throne: 2.7, crate: 1, crystals: 1.7, shelf: 2.4, pillar: 4.0, minecart: 1.3 };
    const prop = (type, x, z, w, d, o) => {
      const p = Object.assign({ type, x, z, w, d, rot: 0, tall: !!TALL[type], h: TALL[type] || 1 }, o || {});
      car.props.push(p);
      if (!o || !o.walk) train.obstacles.push(box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 'prop', p));
      return p;
    };
    const breakable = (type, x, z, s) => {
      const b = { type, x, z, s: s || 0.9, hp: type === 'crate' ? 3 : 2, car: car.i, alive: true };
      b.ob = box(x - b.s / 2, x + b.s / 2, z - b.s / 2, z + b.s / 2, 'breakable', b);
      train.obstacles.push(b.ob);
      train.breakables.push(b);
      return b;
    };
    const chest = (x, z, fancy) => {
      const face = z > 1 ? -1 : 1;
      const c = { x, z, face, fancy: !!fancy, car: car.i, opened: false, locked: true, keyLocked: false };
      c.ob = box(x - 0.55, x + 0.55, z - 0.4, z + 0.4, 'chest', c);
      train.obstacles.push(c.ob);
      train.chests.push(c);
      train.inter.push({ kind: 'chest', x, z, r: 1.7, car: car.i, ref: c, time: 1.1 });
      return c;
    };
    const wallZ = W / 2 - 0.75;
    const avoidDoor = (x, z) => car.bailout && Math.abs(x - car.bailout.x) < 2.4 && z < 0;
    const along = (step, fn) => { for (let x = x0 + 3; x < x1 - 2.5; x += step) fn(x); };
    switch (car.def.layout) {
      case 'caboose':
        prop('bench', x0 + 5, -wallZ + 0.1, 2.2, 0.8);
        prop('crate', x1 - 5, -wallZ, 1.2, 1.2, { size: 1.2 });
        prop('barrel', x1 - 6.5, wallZ, 0.85, 0.85);
        break;
      case 'crypt':
        along(6, (x) => { for (const z of [-wallZ + 0.3, wallZ - 0.3]) if (!avoidDoor(x, z) && R.chance(0.7)) prop('coffin', x, z, 2.1, 0.9, { rot: Math.PI / 2, open: R.chance(0.4) }); });
        for (let i = 0; i < 3; i++) prop('bones', R.float(x0 + 3, x1 - 3), R.float(-2.5, 2.5), 1, 1, { walk: true });
        prop('candles', x0 + 4, 2.8, 0.4, 0.4, { walk: true });
        break;
      case 'library':
        along(5.2, (x) => { const z = -W / 2 + 0.7; if (!avoidDoor(x, z)) prop('bookshelf', x, z, 2.4, 0.7); });
        along(8, (x) => { if (R.chance(0.6)) prop('bench', x + 1.5, W / 2 - 1.1, 2.2, 0.8, { rot: Math.PI }); });
        prop('candles', R.float(x0 + 5, x1 - 5), 1.2, 0.4, 0.4, { walk: true });
        break;
      case 'armory':
        along(6, (x) => { const z = -W / 2 + 0.55; if (!avoidDoor(x, z)) prop('rack', x, z, 2.0, 0.4); });
        along(9, (x) => { if (R.chance(0.6)) prop('barrel', x + 2, W / 2 - 0.95, 0.85, 0.85); });
        break;
      case 'dining':
        prop('banquet', cx - 3, -1.2, 4.2, 1.3);
        prop('candles', cx + 4, 1.8, 0.4, 0.4, { walk: true });
        break;
      case 'prison':
        along(5.5, (x) => { const z = -W / 2 + 1.1; if (!avoidDoor(x, z) && R.chance(0.8)) prop('cage', x, z, 1.6, 1.6, { skull: R.chance(0.5) }); });
        for (let i = 0; i < 2; i++) prop('bones', R.float(x0 + 3, x1 - 3), R.float(1.5, 3), 1, 1, { walk: true });
        break;
      case 'garden':
        for (let i = 0; i < 6; i++) { const x = R.float(x0 + 3, x1 - 3), z = R.pick([-1, 1]) * R.float(1.6, 3.2); if (!avoidDoor(x, z)) prop('mushroom', x, z, 0.5, 0.5, { size: R.float(0.8, 1.5), color: R.pick(['#e0423a', '#b76bff', '#ffae34']) }); }
        break;
      case 'mine':
        prop('rails', (x0 + x1) / 2, 2.2, L - 4, 1.6, { walk: true });
        prop('minecart', x0 + R.float(7, 12), 2.2, 1.7, 1.2, { gold: R.chance(0.5) });
        along(6.5, (x) => { const z = -wallZ + 0.2; if (!avoidDoor(x, z) && R.chance(0.75)) prop('crystals', x + R.float(-1, 1), z, 1.1, 1.1, { color: R.pick(['#ffd84a', '#6ab7ff', '#ff6b8a', '#b77bff']) }); });
        for (let i = 0; i < 2; i++) prop('rocks', R.float(x0 + 4, x1 - 4), R.pick([-1, 1]) * R.float(2, 3), 0.9, 0.9, { walk: true });
        break;
      case 'lab':
        along(6, (x) => { const z = -W / 2 + 0.6; if (!avoidDoor(x, z)) prop('shelf', x, z, 2.2, 0.6); });
        prop('cauldron', (x0 + x1) / 2 - 2, R.pick([-1.6, 1.6]), 1.3, 1.3, { color: R.pick(['#7dff5a', '#b061ff', '#ff5fb4', '#5ec8ff']) });
        break;
      case 'ballroom':
        along(6.5, (x) => { const z = -W / 2 + 0.9; if (!avoidDoor(x, z)) prop('pillar', x, z, 0.8, 0.8); });
        for (let x = x0 + 6; x < x1 - 4; x += 8) prop('chandelier', x, 0, 0.5, 0.5, { walk: true, ceiling: true });
        along(7, (x) => { if (R.chance(0.7)) prop('candles', x + 1, W / 2 - 1.2, 0.4, 0.4, { walk: true }); });
        prop('coffin', x1 - 5, -wallZ + 0.4, 2.1, 0.9, { rot: Math.PI / 2, open: true });
        break;
      case 'vault':
        for (let i = 0; i < 5; i++) prop('gold_pile', R.float(x0 + 3, x1 - 3), R.float(-3, 3), 0.8, 0.8, { walk: true });
        car.locked = true;
        { const lockOb = box(x0 - WALL, x0 + WALL, -DOOR, DOOR, 'lock', null); train.obstacles.push(lockOb); car.lock = { ob: lockOb, hp: 12, x: x0, open: false }; lockOb.ref = car.lock;
          train.inter.push({ kind: 'lock', x: x0 - 1.2, z: 0, r: 1.7, car: car.i, ref: car.lock, time: 0.6 }); }
        break;
      case 'boss':
        prop('throne', x1 - 2.4, -2.9, 1.4, 1.2, { rot: -Math.PI / 2 });
        prop('candles', x1 - 4.2, -3.2, 0.4, 0.4, { walk: true }); prop('candles', x1 - 3, 3.2, 0.4, 0.4, { walk: true });
        { const gOb = box(x1 - WALL, x1 + WALL, -DOOR, DOOR, 'gate', null); train.obstacles.push(gOb); car.gate = { ob: gOb, open: false }; gOb.ref = car.gate; }
        break;
      case 'engine':
        prop('boiler', x1 - 3.4, 0, 3.4, 2.8);
        prop('coal', x1 - 7.5, -3, 1.4, 1.2, { walk: true });
        prop('coal', x1 - 7.5, 3, 1.4, 1.2, { walk: true });
        car.brake = { x: x1 - 6.8, z: 0 };
        prop('lever', x1 - 6.8, 0, 0.7, 0.7);
        train.inter.push({ kind: 'brake', x: x1 - 8, z: 0, r: 1.7, car: car.i, time: 2.0 });
        break;
      default: break;
    }
    const def = car.def;
    if (def.breakables) {
      const nB = R.int(def.breakables[0], def.breakables[1]);
      for (let i = 0; i < nB; i++) {
        const type = def.layout === 'armory' ? R.pick(['crate', 'barrel', 'crate']) : R.pick(['urn', 'crate', 'barrel', 'urn']);
        const pos = freeSpot(train, car, 0.7);
        if (pos) breakable(type, pos.x, pos.z, 0.85);
      }
    }
    if (def.chest) {
      const nC = def.chests || 1;
      for (let i = 0; i < nC; i++) {
        const pos = i === 0 && car.type !== 'vault' ? freeSpot(train, car, 1.1, null, { minX: x0 + L * 0.55 }) || freeSpot(train, car, 1.1) : freeSpot(train, car, 1.1);
        if (pos) { const c = chest(pos.x, pos.z, car.type === 'vault'); if (car.type === 'vault') c.keyLocked = false; else c.keyLocked = train.mod === 'treasure' ? false : R.chance(0.12); }
      }
    }
    if (car.snail) {
      const pos = freeSpot(train, car, 0.5);
      if (pos) { car.snailSpot = pos; train.inter.push({ kind: 'snail', x: pos.x, z: pos.z, r: 1.3, car: car.i, time: 0.4 }); }
    }
  }

  function freeSpot(train, car, r, avoid, o) {
    o = o || {};
    for (let tries = 0; tries < 50; tries++) {
      const x = R.float(Math.max(car.x0 + 2 + r, o.minX || -Infinity), car.x1 - 2 - r);
      const z = R.float(-W / 2 + WALL + r + 0.25, W / 2 - WALL - r - 0.25);
      if (car.bailout && Math.abs(x - car.bailout.x) < 2.4 && z < -1.4) continue;
      if (avoid && U.dist2(x, z, avoid.x, avoid.z) < (avoid.r || 5) * (avoid.r || 5)) continue;
      let ok = true;
      for (const ob of train.obstacles) {
        if (!ob.active) continue;
        if (x + r > ob.minX - 0.25 && x - r < ob.maxX + 0.25 && z + r > ob.minZ - 0.25 && z - r < ob.maxZ + 0.25) { ok = false; break; }
      }
      if (ok && car.brake && U.dist2(x, z, car.brake.x, car.brake.z) < 9) ok = false;
      if (ok) return { x, z };
    }
    return null;
  }

  /* ---------- collision ---------- */
  function carAt(train, x) { for (const c of train.cars) if (x >= c.x0 && x <= c.x1) return c; return null; }
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
  const HARD = new Set(['wall', 'gate', 'lock']);
  /* Keep a circle inside the train and out of obstacles. hardOnly: only walls, gates and locked doors
     (used while something is in the air, so it can fly over tables but never through walls). */
  function resolve(train, p, r, hardOnly) {
    p.x = U.clamp(p.x, train.minX + WALL + r, train.maxX - WALL - r);
    const car = carAt(train, p.x);
    const half = car ? W / 2 - WALL - r : DOOR - r;
    p.z = U.clamp(p.z, -half, half);
    for (let pass = 0; pass < 2; pass++) {
      for (const o of train.obstacles) {
        if (!o.active || (hardOnly && !HARD.has(o.kind))) continue;
        if (p.x + r < o.minX || p.x - r > o.maxX || p.z + r < o.minZ || p.z - r > o.maxZ) continue;
        pushOut(p, r, o);
      }
    }
  }
  function hardHit(train, x, z, r) {
    if (x < train.minX + WALL + r || x > train.maxX - WALL - r) return true;
    const car = carAt(train, x);
    if (!car ? Math.abs(z) > DOOR - r * 0.5 : Math.abs(z) > W / 2 - WALL - r * 0.5) return true;
    for (const o of train.obstacles) {
      if (!o.active || !HARD.has(o.kind)) continue;
      const cx = U.clamp(x, o.minX, o.maxX), cz = U.clamp(z, o.minZ, o.maxZ);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r * 0.8) return true;
    }
    return false;
  }
  /* Walk from a toward b and stop just before the first wall, gate or locked door.
     Leaps, lunges, blinks, knockbacks and grapples use this so nothing can skip past a closed gate. */
  function clampPath(train, a, b, r) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.2));
    let last = { x: a.x, z: a.z };
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + (dx * i) / n, z: a.z + (dz * i) / n };
      if (hardHit(train, p.x, p.z, r)) return last;
      last = p;
    }
    return last;
  }
  function solidAt(train, x, z) {
    if (x < train.minX || x > train.maxX) return { kind: 'wall' };
    const car = carAt(train, x);
    if (car ? Math.abs(z) > W / 2 - WALL : Math.abs(z) > DOOR) return { kind: 'wall' };
    for (const o of train.obstacles) if (o.active && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return o;
    return null;
  }
  /* Can the camera be here? (inside the train's hollow, clear of walls and door frames) */
  function cameraFree(train, x, y, z) {
    if (x < train.minX + 0.4 || x > train.maxX - 0.4 || y < 0.35 || y > H - 0.35) return false;
    const car = carAt(train, x);
    if (!car) return Math.abs(z) < DOOR - 0.3 && y < DOORH - 0.25;
    if (Math.abs(z) > W / 2 - WALL - 0.35) return false;
    const nearEnd = Math.min(Math.abs(x - car.x0), Math.abs(x - car.x1)) < WALL + 0.3;
    if (nearEnd) {
      const closed = (car.i === 0 && Math.abs(x - car.x0) < 1) || (car.i === train.cars.length - 1 && Math.abs(x - car.x1) < 1);
      if (closed || Math.abs(z) > DOOR - 0.3 || y > DOORH - 0.25) return false;
    }
    return true;
  }
  /* Pull the camera toward the pivot until nothing blocks the view. */
  function cameraSafe(train, pivot, want) {
    const steps = 18;
    let last = { x: pivot.x, y: pivot.y, z: pivot.z };
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const p = { x: pivot.x + (want.x - pivot.x) * k, y: pivot.y + (want.y - pivot.y) * k, z: pivot.z + (want.z - pivot.z) * k };
      if (!cameraFree(train, p.x, p.y, p.z)) return last;
      last = p;
    }
    return last;
  }

  DT.game.world = { WD, generate, freeSpot, carAt, resolve, solidAt, pushOut, cameraSafe, cameraFree, clampPath };
})();

/* ---------- meshes ---------- */
(function () {
  'use strict';
  const GF = DT.game.gfx;
  const MD = DT.game.models;
  const WG = DT.game.world;
  const { W, L, GAP, DOOR, WALL, H, DOORH } = WG.WD;
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, Object.assign({ inkT: 0.012 }, o || {}));
  const B = (w, h, d) => GF.geo('box', w, h, d);
  const WIN_LO = 1.3, WIN_HI = 2.7;
  /* the locked camera looks in from the aisle side, so that side is cut down like a dollhouse:
     a low sill instead of the near wall, half-height walls between cars and no roof */
  const SILL = 0.5, END_LO = 1.25;
  const addAt = (g, m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };

  function sideWall(g, car, z, line, mats, doorX) {
    const cx = (car.x0 + car.x1) / 2;
    addAt(g, new THREE.Mesh(B(L, WIN_LO, WALL), mats.lower), cx, WIN_LO / 2, z);
    addAt(g, new THREE.Mesh(B(L, H - WIN_HI, WALL), mats.upper), cx, (WIN_HI + H) / 2, z);
    const nWin = 6, step = L / nWin;
    for (let i = 0; i <= nWin; i++) {
      const px = car.x0 + i * step;
      g.add(P(B(i === 0 || i === nWin ? 0.6 : 1.3, WIN_HI - WIN_LO, WALL + 0.02), line.wall, [px, (WIN_LO + WIN_HI) / 2, z], { ink: false }));
    }
    for (let i = 0; i < nWin; i++) {
      const wx = car.x0 + (i + 0.5) * step;
      if (doorX != null && Math.abs(wx - doorX) < step * 0.6) continue;
      for (const o of [-0.45, 0, 0.45]) g.add(P(GF.geo('cyl', 0.035, 0.035, WIN_HI - WIN_LO, 6), '#3a3f4b', [wx + o, (WIN_LO + WIN_HI) / 2, z], { ink: false }));
      const t = MD.torch();
      t.position.set(car.x0 + i * step + (i === 0 ? 0.6 : 0), 2.0, z - Math.sign(z) * (WALL / 2 + 0.05));
      t.rotation.y = z > 0 ? Math.PI : 0;
      if (i > 0) g.add(t);
    }
    g.add(P(B(L, 0.14, WALL + 0.06), line.trim, [cx, WIN_LO, z], { ink: false }));
    g.add(P(B(L, 0.14, WALL + 0.06), line.trim, [cx, WIN_HI, z], { ink: false }));
  }

  function buildCar(train, car, mats) {
    const g = new THREE.Group();
    const line = train.line;
    const cx = (car.x0 + car.x1) / 2;
    /* what only the free camera sees (roof, near wall, full end walls) and the cut-away pieces the
       locked camera sees instead; WG.setCameraMode switches between them */
    const freeG = new THREE.Group(), lockG = new THREE.Group();
    g.add(freeG, lockG);
    car.camGroups = { free: freeG, locked: lockG };
    const floor = new THREE.Mesh(B(L, 0.3, W), mats.floor);
    floor.position.set(cx, -0.15, 0);
    g.add(floor);
    if (car.type !== 'caboose' && car.type !== 'engine') g.add(P(B(L - 2, 0.02, 2.6), car.type === 'boss' ? '#6a1a2a' : line.trim, [cx, 0.01, 0], { ink: false }));
    /* undercarriage and wheels (they spin while the train runs) */
    g.add(P(B(L - 1.2, 0.7, W - 1.4), '#23262f', [cx, -0.65, 0], { ink: false }));
    for (const wx of [car.x0 + 2.6, car.x0 + 4.4, car.x1 - 4.4, car.x1 - 2.6]) {
      for (const s of [-1, 1]) {
        const wh = new THREE.Group();
        wh.position.set(wx, -0.92, s * (W / 2 - 1.1));
        wh.add(P(GF.geo('cyl', 0.52, 0.52, 0.22, 16), '#3a3f4b', [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }));
        wh.add(P(B(0.9, 0.12, 0.24), '#8a8f9a', [0, 0, 0], { ink: false }));
        g.add(wh);
        train.wheels.push(wh);
      }
    }
    sideWall(g, car, -W / 2 + WALL / 2, line, mats, car.bailout ? car.bailout.x : null);
    sideWall(freeG, car, W / 2 - WALL / 2, line, mats, null);
    addAt(lockG, new THREE.Mesh(B(L, SILL, WALL), mats.sill), cx, SILL / 2, W / 2 - WALL / 2);
    lockG.add(P(B(L, 0.12, WALL + 0.1), line.trim, [cx, SILL, W / 2 - WALL / 2]));
    /* ceiling and beams */
    freeG.add(P(B(L, 0.25, W), line.trim, [cx, H + 0.12, 0], { ink: false }));
    for (let x = car.x0 + 1.5; x < car.x1; x += 3.2) freeG.add(P(B(0.35, 0.3, W), '#4a3326', [x, H - 0.1, 0], { ink: false }));
    for (let x = car.x0 + 4; x < car.x1 - 2; x += 6.5) { const lt = MD.lantern(train.line.id === 'night' ? '#ff6b6b' : train.line.id === 'ice' ? '#bfefff' : '#ffd66b'); lt.position.set(x, H - 0.5, 0); freeG.add(lt); }
    /* end walls with door openings */
    for (const X of [car.x0, car.x1]) {
      const closed = (X === car.x0 && car.i === 0) || (X === car.x1 && car.i === train.cars.length - 1);
      if (closed) { addAt(g, new THREE.Mesh(B(WALL * 2, H, W), mats.end), X, H / 2, 0); continue; }
      const segW = W / 2 - DOOR;
      for (const s of [-1, 1]) addAt(freeG, new THREE.Mesh(B(WALL, H, segW), mats.end), X, H / 2, s * (DOOR + segW / 2));
      freeG.add(P(B(WALL, H - DOORH, DOOR * 2), line.wall, [X, (DOORH + H) / 2, 0], { ink: false }));
      for (const s of [-1, 1]) {
        addAt(lockG, new THREE.Mesh(B(WALL, END_LO, segW), mats.endLow), X, END_LO / 2, s * (DOOR + segW / 2));
        lockG.add(P(B(WALL + 0.1, 0.12, segW), line.trim, [X, END_LO, s * (DOOR + segW / 2)]));
      }
      for (const s of [-1, 1]) g.add(P(B(WALL + 0.08, DOORH, 0.18), line.trim, [X, DOORH / 2, DOOR * s]));
      g.add(P(B(WALL + 0.08, 0.18, DOOR * 2 + 0.2), line.trim, [X, DOORH, 0]));
    }
    /* gangway */
    if (car.i < train.cars.length - 1) {
      const gx = car.x1 + GAP / 2;
      g.add(P(B(GAP, 0.2, DOOR * 2 + 0.4), '#3a3f4b', [gx, -0.1, 0], { ink: false }));
      for (const s of [-1, 1]) freeG.add(P(B(GAP, DOORH + 0.2, 0.14), '#2a2e38', [gx, DOORH / 2, (DOOR + 0.2) * s], { ink: false }));
      lockG.add(P(B(GAP, END_LO, 0.14), '#2a2e38', [gx, END_LO / 2, -(DOOR + 0.2)], { ink: false }));
      lockG.add(P(B(GAP, SILL, 0.14), '#2a2e38', [gx, SILL / 2, DOOR + 0.2], { ink: false }));
      freeG.add(P(B(GAP, 0.14, DOOR * 2 + 0.5), '#2a2e38', [gx, DOORH + 0.1, 0], { ink: false }));
    }
    /* jump-off door, in the far wall where the locked camera can always see it */
    if (car.bailout) {
      const bx = car.bailout.x, z = -(W / 2 - WALL - 0.02);
      addAt(g, new THREE.Mesh(B(2.2, 2.6, 0.06), GF.basic('#0b2a14')), bx, 1.3, z);
      for (const s of [-1, 1]) g.add(P(B(0.2, 2.8, 0.3), '#3fe07a', [bx + 1.2 * s, 1.4, z], { emissive: '#22c55e', ei: 0.9 }));
      g.add(P(B(2.6, 0.2, 0.3), '#3fe07a', [bx, 2.8, z], { emissive: '#22c55e', ei: 0.9 }));
      const pad = new THREE.Mesh(GF.geo('circle', 1.4, 32), GF.basic('#3fe07a', { opacity: 0.25 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, -(W / 2 - 1.2));
      g.add(pad);
      car.bailoutMesh = pad;
    }
    return g;
  }

  function buildMeshes(train) {
    const root = new THREE.Group();
    const line = train.line;
    const brick = GF.brickTexture(line);
    const lower = brick.clone(); lower.needsUpdate = true; lower.repeat.set(L / 2.2, WIN_LO / 2.2);
    const upper = brick.clone(); upper.needsUpdate = true; upper.repeat.set(L / 2.2, (H - WIN_HI) / 2.2);
    const end = brick.clone(); end.needsUpdate = true; end.repeat.set(1.6, H / 2.2);
    const sill = brick.clone(); sill.needsUpdate = true; sill.repeat.set(L / 2.2, SILL / 2.2);
    const endLow = brick.clone(); endLow.needsUpdate = true; endLow.repeat.set(1.6, END_LO / 2.2);
    const floorT = GF.floorTexture(line); floorT.repeat.set(L / 3, W / 3);
    const mats = { lower: GF.texMat(lower), upper: GF.texMat(upper), end: GF.texMat(end), sill: GF.texMat(sill), endLow: GF.texMat(endLow), floor: GF.texMat(floorT) };
    train.textures = [brick, lower, upper, end, sill, endLow, floorT];
    train.materials = Object.values(mats);
    train.wheels = [];
    for (const car of train.cars) {
      car.group = buildCar(train, car, mats);
      root.add(car.group);
      for (const p of car.props) {
        const m = MD.prop(p.type, { color: p.color, size: p.size, open: p.open, skull: p.skull, gold: p.gold, accent: line.accent });
        m.position.set(p.x, 0, p.z);
        m.rotation.y = p.rot || 0;
        car.group.add(m);
        p.mesh = m;
        if (p.type === 'lever') car.leverMesh = m;
      }
      if (car.lock) { const gate = MD.gate(DOOR * 2); gate.position.set(car.x0, 0, 0); car.group.add(gate); car.lock.mesh = gate; }
      if (car.gate) { const gate = MD.gate(DOOR * 2, '#6a1a2a'); gate.position.set(car.x1, 0, 0); car.group.add(gate); car.gate.mesh = gate; }
      if (car.snailSpot) { const m = MD.snail(); m.position.set(car.snailSpot.x, 0, car.snailSpot.z); m.rotation.y = Math.PI * 0.8; car.group.add(m); car.snailMesh = m; }
    }
    for (const b of train.breakables) { const m = MD.prop(b.type, { size: b.s }); m.position.set(b.x, 0, b.z); m.rotation.y = Math.random() * 0.6 - 0.3; root.add(m); b.mesh = m; }
    for (const c of train.chests) { const m = MD.chest(c.fancy); m.position.set(c.x, 0, c.z); m.rotation.y = c.face < 0 ? Math.PI : 0; root.add(m); c.mesh = m; }
    /* the world outside the windows (both sides) */
    const skyTex = GF.sceneryTexture(line, 0), skyTex2 = GF.sceneryTexture(line, 1.7);
    skyTex.repeat.set(2.2, 1); skyTex2.repeat.set(2.2, 1);
    train.skyTex = [skyTex, skyTex2];
    train.skies = [];
    for (const [z, tex, rot] of [[-W / 2 - 14, skyTex, 0], [W / 2 + 14, skyTex2, Math.PI]]) {
      const sky = new THREE.Mesh(GF.geo('plane', 260, 34), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      sky.position.set(train.maxX / 2, 6, z);
      sky.rotation.y = rot;
      root.add(sky);
      train.skies.push(sky);
    }
    const groundTex = GF.groundTexture(line);
    const ground = new THREE.Mesh(GF.geo('plane', 460, 90), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(train.maxX / 2, -1.6, 0);
    root.add(ground);
    for (const z of [-(W / 2 - 1.1), W / 2 - 1.1]) root.add(GF.part(GF.geo('box', train.maxX + 200, 0.12, 0.16), '#6b6f7a', [train.maxX / 2, -1.5, z], { ink: false }));
    train.ground = ground; train.groundTex = groundTex;
    train.tunnelTex = GF.tunnelTexture();
    train.tunnelTex.repeat.set(6, 1);
    train.root = root;
    return root;
  }
  /* Locked camera: dollhouse cut-away (no roof, low near wall). Free camera: the whole car. */
  function setCameraMode(train, fixed) {
    for (const car of train.cars) {
      if (car.camGroups) { car.camGroups.free.visible = !fixed; car.camGroups.locked.visible = fixed; }
      for (const p of car.props) if (p.ceiling && p.mesh) p.mesh.visible = !fixed;
    }
  }
  /* Swap the scenery for the dark Loop Tunnel (or back). */
  function setTunnel(train, on) {
    if (!train.skies) return;
    train.skies.forEach((s, i) => { s.material.map = on ? train.tunnelTex : train.skyTex[i]; s.material.needsUpdate = true; });
    train.ground.material.color.copy(GF.lin(on ? '#111118' : '#ffffff'));
  }
  function disposeTrain(train) {
    if (!train || !train.root) return;
    GF.scene.remove(train.root);
    for (const t of train.textures || []) t.dispose();
    for (const t of train.skyTex || []) t.dispose();
    if (train.tunnelTex) train.tunnelTex.dispose();
    train.groundTex.dispose();
    for (const m of train.materials || []) m.dispose();
    for (const s of train.skies || []) s.material.dispose();
    train.ground.material.dispose();
  }

  Object.assign(WG, { buildMeshes, disposeTrain, setTunnel, setCameraMode });
})();
