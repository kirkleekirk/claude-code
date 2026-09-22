/* The train: layout generation, collision, and meshes. Cars run along +x; z is across the car. */
(function () {
  'use strict';
  const D = AE.data;
  const R = AE.R;
  const U = AE.U;
  const W = 9, L = 24, GAP = 2, DOOR = 1.3, WALL = 0.25;
  const WD = { W, L, GAP, DOOR, WALL };

  const TRAIN_COLORS = {
    grasslands: ['#c2413a', '#ffcf3d'], candy: ['#ff7ab8', '#ffffff'], fire: ['#7a2a1a', '#ffae00'], ice: ['#3b6fd6', '#e8f6ff'],
    nightosphere: ['#2a0f14', '#e0283a'], crystal: ['#6e5ab8', '#7fe3ff'], blizzard: ['#2e5a99', '#ffffff'],
  };

  function pickTypes(n, offer) {
    const types = ['caboose'];
    const pool = Object.keys(D.CAR_TYPES).filter((k) => D.CAR_TYPES[k].weight);
    for (let i = 1; i < n - 1; i++) types.push(R.weighted(pool.map((k) => [D.CAR_TYPES[k].weight, k])));
    types.push('engine');
    if (offer.vault && n >= 4) types[n - 2] = 'vault';
    return types;
  }

  function box(minX, maxX, minZ, maxZ, kind, ref) { return { minX, maxX, minZ, maxZ, kind, ref, active: true }; }

  /* Build the logical train. Meshes come later (buildMeshes). */
  function generate(G, offer) {
    const route = D.ROUTES.find((r) => r.id === offer.route);
    const n = offer.cars;
    const types = pickTypes(n, offer);
    const train = { route, offer, tier: route.tier, mod: offer.mod, cars: [], obstacles: [], breakables: [], chests: [], inter: [], minX: 0, maxX: 0, W, L, GAP, DOOR };
    let x = 0;
    for (let i = 0; i < n; i++) {
      const car = { i, type: types[i], def: D.CAR_TYPES[types[i]], x0: x, x1: x + L, entered: i === 0, cleared: i === 0, props: [], exits: [], locked: false };
      car.name = car.def.name;
      train.cars.push(car);
      x += L + (i < n - 1 ? GAP : 0);
    }
    train.maxX = x;
    /* end walls with door gaps; the very back and very front are closed */
    for (const car of train.cars) {
      for (const X of [car.x0, car.x1]) {
        const closed = (X === car.x0 && car.i === 0) || (X === car.x1 && car.i === n - 1);
        if (closed) train.obstacles.push(box(X - WALL, X + WALL, -W / 2, W / 2, 'wall'));
        else { train.obstacles.push(box(X - WALL / 2, X + WALL / 2, -W / 2, -DOOR, 'wall')); train.obstacles.push(box(X - WALL / 2, X + WALL / 2, DOOR, W / 2, 'wall')); }
      }
    }
    /* bail-out doors in 1-2 middle cars */
    const middle = train.cars.filter((c) => c.i > 0 && c.i < n - 1 && c.type !== 'vault');
    const bail = R.shuffle(middle).slice(0, n >= 7 ? 2 : 1);
    for (const car of bail) {
      const bx = car.x0 + R.float(6, L - 6);
      car.bailout = { x: bx };
      train.inter.push({ kind: 'bailout', x: bx, z: W / 2 - 1.1, r: 1.5, car: car.i, time: 3.5 });
    }
    /* princess, snail, elite placement */
    if (offer.princess) {
      const pr = D.PRINCESSES.find((p) => p.route === route.id);
      const car = R.pick(train.cars.filter((c) => c.i >= 2 && c.i < n - 1)) || train.cars[Math.min(1, n - 1)];
      if (pr) car.princess = pr;
    }
    const snailCar = R.chance(0.35) ? R.pick(train.cars.slice(1)) : null;
    if (snailCar) snailCar.snail = true;
    const vault = train.cars.find((c) => c.type === 'vault');
    if (vault) vault.elite = true;
    else if (!route.final) { const c = R.pick(train.cars.filter((c) => c.i >= Math.floor(n / 2) && c.i < n - 1)); if (c) c.elite = true; }
    if (route.final) train.cars[n - 1].boss = 'ice_king';
    for (const car of train.cars) layoutCar(train, car);
    return train;
  }

  /* Props, breakables and chests inside a car. */
  function layoutCar(train, car) {
    const x0 = car.x0, x1 = car.x1;
    const prop = (type, x, z, w, d, o) => {
      const p = Object.assign({ type, x, z, w, d, rot: 0 }, o || {});
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
      const c = { x, z, fancy: !!fancy, car: car.i, opened: false, locked: fancy && R.chance(0.3) };
      c.ob = box(x - 0.55, x + 0.55, z - 0.4, z + 0.4, 'chest', c);
      train.obstacles.push(c.ob);
      train.chests.push(c);
      train.inter.push({ kind: 'chest', x, z: z + 0.9, r: 1.3, car: car.i, ref: c, time: 1.2 });
      return c;
    };
    const t = car.def;
    const rows = [-W / 2 + 0.85, W / 2 - 0.85];
    switch (t.layout) {
      case 'caboose':
        prop('sofa', x0 + 6, -W / 2 + 0.8, 1.9, 0.9, { color: '#3fae7a' });
        prop('crate', x1 - 5, -W / 2 + 0.8, 1.2, 1.2, { size: 1.2 });
        break;
      case 'seats':
        for (let x = x0 + 3; x < x1 - 2; x += 3.2) for (const z of rows) if (!(car.bailout && Math.abs(x - car.bailout.x) < 2.2 && z > 0)) prop('seat', x, z, 1.5, 0.9, { rot: z > 0 ? Math.PI : 0, color: R.pick(['#c2413a', '#2f6fd6', '#3fae7a']) });
        break;
      case 'tables':
        for (let x = x0 + 3.5; x < x1 - 3; x += 4.2) for (const z of [-2.4, 2.4]) if (!(car.bailout && Math.abs(x - car.bailout.x) < 2.2 && z > 0)) prop('table', x, z, 1.2, 1.2);
        break;
      case 'crates':
        for (let i = 0; i < 4; i++) { const x = R.float(x0 + 3, x1 - 3); const z = R.pick(rows); if (!(car.bailout && Math.abs(x - car.bailout.x) < 2.2 && z > 0)) prop('crate', x, z, 1.3, 1.3, { size: 1.3, fixed: true }); }
        break;
      case 'bunks':
        for (let x = x0 + 3.5; x < x1 - 3; x += 4.2) prop('bunk', x, -W / 2 + 0.8, 2.2, 1.1);
        break;
      case 'lounge':
        for (let x = x0 + 4; x < x1 - 3; x += 5) prop('sofa', x, -W / 2 + 0.8, 1.9, 0.9, { color: R.pick(['#7a5ab8', '#3fae7a', '#e05a47']) });
        break;
      case 'vault':
        for (let i = 0; i < 4; i++) prop('gold_pile', R.float(x0 + 3, x1 - 3), R.float(-3, 3), 0.8, 0.8, { walk: true });
        car.locked = true;
        { const lockOb = box(x0 - WALL, x0 + WALL, -DOOR, DOOR, 'lock', null); train.obstacles.push(lockOb); car.lock = { ob: lockOb, hp: 10, x: x0, open: false }; lockOb.ref = car.lock;
          train.inter.push({ kind: 'lock', x: x0 - 1.2, z: 0, r: 1.6, car: car.i, ref: car.lock, time: 0.6 }); }
        break;
      case 'engine':
        prop('boiler', x1 - 3.2, 0, 3.4, 2.8);
        prop('coal', x1 - 7, -3, 1.4, 1.2, { walk: true });
        prop('coal', x1 - 7, 3, 1.4, 1.2, { walk: true });
        car.brake = { x: x1 - 6.5, z: 0 };
        prop('lever', x1 - 6.5, 0, 0.7, 0.7);
        train.inter.push({ kind: 'brake', x: x1 - 7.6, z: 0, r: 1.6, car: car.i, time: 2.0 });
        break;
      default: break;
    }
    /* breakables */
    if (t.breakables) {
      const n = R.int(t.breakables[0], t.breakables[1]);
      for (let i = 0; i < n; i++) {
        const type = t.layout === 'crates' ? R.pick(['crate', 'barrel', 'crate']) : R.pick(['luggage', 'luggage', 'crate', 'barrel']);
        const pos = freeSpot(train, car, 0.7);
        if (pos) breakable(type, pos.x, pos.z, type === 'luggage' ? 0.85 : 0.9);
      }
    }
    /* chests */
    if (t.chests) {
      let n = R.int(t.chests[0], t.chests[1]);
      if (train.mod === 'treasure' && car.type !== 'caboose') n += 1;
      for (let i = 0; i < n; i++) { const pos = freeSpot(train, car, 1.1); if (pos) chest(pos.x, pos.z, car.type === 'vault'); }
    }
    if (car.princess) {
      const pos = freeSpot(train, car, 1.2) || { x: (x0 + x1) / 2, z: 0 };
      car.ice = { x: pos.x, z: pos.z, hp: 8, broken: false, princess: car.princess };
      car.ice.ob = box(pos.x - 0.8, pos.x + 0.8, pos.z - 0.8, pos.z + 0.8, 'ice', car.ice);
      train.obstacles.push(car.ice.ob);
    }
    if (car.snail) {
      const pos = freeSpot(train, car, 0.5);
      if (pos) { car.snailSpot = pos; train.inter.push({ kind: 'snail', x: pos.x, z: pos.z, r: 1.2, car: car.i, time: 0.4 }); }
    }
  }

  /* A random spot in a car that doesn't overlap obstacles. */
  function freeSpot(train, car, r, avoid) {
    for (let tries = 0; tries < 40; tries++) {
      const x = R.float(car.x0 + 2 + r, car.x1 - 2 - r);
      const z = R.float(-W / 2 + WALL + r + 0.2, W / 2 - WALL - r - 0.2);
      if (car.bailout && Math.abs(x - car.bailout.x) < 2.4 && z > 1.5) continue;
      if (avoid && U.dist2(x, z, avoid.x, avoid.z) < (avoid.r || 5) * (avoid.r || 5)) continue;
      let ok = true;
      for (const o of train.obstacles) {
        if (!o.active) continue;
        if (x + r > o.minX - 0.2 && x - r < o.maxX + 0.2 && z + r > o.minZ - 0.2 && z - r < o.maxZ + 0.2) { ok = false; break; }
      }
      if (ok && car.brake && U.dist2(x, z, car.brake.x, car.brake.z) < 9) ok = false;
      if (ok) return { x, z };
    }
    return null;
  }

  /* ---------- collision ---------- */
  function carAt(train, x) {
    for (const c of train.cars) if (x >= c.x0 && x <= c.x1) return c;
    return null;
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
  function resolve(train, p, r) {
    p.x = U.clamp(p.x, train.minX + WALL + r, train.maxX - WALL - r);
    const car = carAt(train, p.x);
    const half = car ? W / 2 - WALL - r : DOOR - r;
    p.z = U.clamp(p.z, -half, half);
    for (let pass = 0; pass < 2; pass++) {
      for (const o of train.obstacles) {
        if (!o.active) continue;
        if (p.x + r < o.minX || p.x - r > o.maxX || p.z + r < o.minZ || p.z - r > o.maxZ) continue;
        pushOut(p, r, o);
      }
    }
  }
  /* Is the point inside a solid obstacle (for projectiles)? */
  function solidAt(train, x, z) {
    const car = carAt(train, x);
    if (x < train.minX || x > train.maxX) return { kind: 'wall' };
    if (car ? Math.abs(z) > W / 2 - WALL : Math.abs(z) > DOOR) return { kind: 'wall' };
    for (const o of train.obstacles) if (o.active && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return o;
    return null;
  }

  AE.game.world = { WD, TRAIN_COLORS, generate, freeSpot, carAt, resolve, solidAt, pushOut };
})();

/* ---------- meshes ---------- */
(function () {
  'use strict';
  const GF = AE.game.gfx;
  const MD = AE.game.models;
  const WG = AE.game.world;
  const { W, L, GAP, DOOR, WALL } = WG.WD;
  const FLOOR = { caboose: '#9c6b44', passenger: '#b5835a', dining: '#d9c7a8', cargo: '#8a6b4a', sleeper: '#6d5b8f', lounge: '#3f7a6a', vault: '#6b4f2a', engine: '#4a4f5a' };
  const CREAM = '#f4e6c8', WOOD = '#8b5a2b';
  const P = (geo, color, pos, o) => GF.part(geo, color, pos, Object.assign({ inkT: 0.015 }, o || {}));
  const B = (w, h, d) => GF.geo('box', w, h, d);

  function buildCar(train, car, colors) {
    const g = new THREE.Group();
    const cx = (car.x0 + car.x1) / 2;
    g.add(P(B(L, 0.3, W), FLOOR[car.type], [cx, -0.15, 0], { ink: false }));
    if (car.type === 'passenger' || car.type === 'dining' || car.type === 'lounge') g.add(P(B(L - 1, 0.02, 2.4), car.type === 'lounge' ? '#2f5f52' : '#a8323a', [cx, 0.01, 0], { ink: false }));
    g.add(P(B(L - 1, 0.7, W - 1.5), '#2a2e38', [cx, -0.65, 0], { ink: false }));
    /* far wall with windows */
    const fz = -W / 2 + WALL / 2;
    g.add(P(B(L, 1.4, WALL), CREAM, [cx, 0.7, fz]));
    g.add(P(B(L, 0.12, WALL + 0.04), WOOD, [cx, 1.42, fz], { ink: false }));
    g.add(P(B(L, 0.5, WALL), CREAM, [cx, 3.15, fz]));
    g.add(P(B(L + 0.3, 0.3, 0.8), colors[0], [cx, 3.5, -W / 2 - 0.1]));
    g.add(P(B(L + 0.3, 0.08, 0.82), colors[1], [cx, 3.36, -W / 2 - 0.1], { ink: false }));
    for (let i = 0; i < 6; i++) {
      const px = car.x0 + 1 + i * ((L - 2) / 5);
      g.add(P(B(2.0, 1.5, WALL), CREAM, [px, 2.15, fz]));
      g.add(P(GF.geo('sphere', 0.13, 10, 8), '#fff4c2', [px, 2.55, fz + 0.25], { emissive: '#ffd66b', ei: 0.9, ink: false }));
    }
    /* near wall (low, so we can see in) with the outer skin and wheels */
    const nz = W / 2 - WALL / 2;
    const segs = car.bailout ? [[car.x0, car.bailout.x - 1.3], [car.bailout.x + 1.3, car.x1]] : [[car.x0, car.x1]];
    for (const [a, b] of segs) {
      g.add(P(B(b - a, 0.9, WALL), CREAM, [(a + b) / 2, 0.45, nz]));
      g.add(P(B(b - a, 0.08, WALL + 0.04), WOOD, [(a + b) / 2, 0.92, nz], { ink: false }));
      g.add(P(B(b - a, 1.9, 0.12), colors[0], [(a + b) / 2, -0.05, W / 2 + 0.07], { ink: false }));
      g.add(P(B(b - a, 0.1, 0.14), colors[1], [(a + b) / 2, 0.5, W / 2 + 0.08], { ink: false }));
    }
    for (const wx of [car.x0 + 3, car.x0 + 5, car.x1 - 5, car.x1 - 3]) g.add(P(GF.geo('cyl', 0.55, 0.55, 0.3, 16), '#1d2340', [wx, -1.05, W / 2 - 0.5], { rot: [Math.PI / 2, 0, 0], ink: false }));
    if (car.bailout) {
      const bx = car.bailout.x;
      for (const s of [-1, 1]) g.add(P(B(0.2, 2.6, 0.3), '#3fe07a', [bx + 1.3 * s, 1.3, nz], { emissive: '#22c55e', ei: 0.9 }));
      g.add(P(B(2.8, 0.2, 0.3), '#3fe07a', [bx, 2.6, nz], { emissive: '#22c55e', ei: 0.9 }));
      const pad = new THREE.Mesh(GF.geo('circle', 1.4, 32), GF.basic('#3fe07a', { opacity: 0.25 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, W / 2 - 1.1);
      g.add(pad);
      car.bailoutMesh = pad;
    }
    /* end walls */
    for (const X of [car.x0, car.x1]) {
      const closed = (X === car.x0 && car.i === 0) || (X === car.x1 && car.i === train.cars.length - 1);
      if (closed) g.add(P(B(WALL * 2, 2.2, W), CREAM, [X, 1.1, 0]));
      else {
        const segW = W / 2 - DOOR;
        g.add(P(B(WALL, 2.2, segW), CREAM, [X, 1.1, -DOOR - segW / 2]));
        g.add(P(B(WALL, 2.2, segW), CREAM, [X, 1.1, DOOR + segW / 2]));
        for (const s of [-1, 1]) g.add(P(B(WALL + 0.06, 2.3, 0.16), WOOD, [X, 1.15, DOOR * s], { ink: false }));
      }
    }
    /* gangway to the next car */
    if (car.i < train.cars.length - 1) {
      const gx = car.x1 + GAP / 2;
      g.add(P(B(GAP, 0.2, DOOR * 2 + 0.4), '#3a3f4b', [gx, -0.1, 0], { ink: false }));
      for (const s of [-1, 1]) g.add(P(B(GAP, 1.6, 0.12), '#2a2e38', [gx, 0.8, (DOOR + 0.2) * s]));
    }
    return g;
  }

  function buildMeshes(train) {
    const root = new THREE.Group();
    const colors = WG.TRAIN_COLORS[train.route.id] || ['#c2413a', '#ffcf3d'];
    for (const car of train.cars) {
      car.group = buildCar(train, car, colors);
      root.add(car.group);
      for (const p of car.props) {
        const m = MD.prop(p.type, { color: p.color, size: p.size });
        m.position.set(p.x, 0, p.z);
        m.rotation.y = p.rot || 0;
        car.group.add(m);
        p.mesh = m;
        if (p.type === 'lever') car.leverMesh = m;
      }
      if (car.lock) {
        const gate = new THREE.Group();
        for (let i = -3; i <= 3; i++) gate.add(GF.part(GF.geo('cyl', 0.06, 0.06, 2.6, 8), '#8a8f9a', [0, 1.3, i * 0.36]));
        gate.add(GF.part(GF.geo('box', 0.2, 0.2, DOOR * 2), '#8a8f9a', [0, 2.4, 0]));
        gate.add(GF.part(GF.geo('sphere', 0.25, 12, 10), '#ffcf3d', [-0.2, 1.2, 0], { emissive: '#ffae00', ei: 0.3 }));
        gate.position.set(car.x0, 0, 0);
        car.group.add(gate);
        car.lock.mesh = gate;
      }
      if (car.ice) { const m = MD.iceBlock(car.ice.princess); m.position.set(car.ice.x, 0, car.ice.z); car.group.add(m); car.ice.mesh = m; }
      if (car.snailSpot) { const m = MD.snail(); m.position.set(car.snailSpot.x, 0, car.snailSpot.z); m.rotation.y = Math.PI * 0.8; car.group.add(m); car.snailMesh = m; }
    }
    for (const b of train.breakables) { const m = MD.prop(b.type, { size: b.s }); m.position.set(b.x, 0, b.z); m.rotation.y = Math.random() * 0.6 - 0.3; root.add(m); b.mesh = m; }
    for (const c of train.chests) { const m = MD.chest(c.fancy); m.position.set(c.x, 0, c.z); root.add(m); c.mesh = m; }
    /* world around the train */
    const route = train.route;
    const sceneTex = GF.sceneryTexture(route);
    sceneTex.repeat.set(2.0, 1);
    const sky = new THREE.Mesh(GF.geo('plane', 220, 28), new THREE.MeshBasicMaterial({ map: sceneTex, fog: false }));
    sky.position.set(train.maxX / 2, 7, -W / 2 - 9);
    root.add(sky);
    const groundTex = GF.groundTexture(route);
    const ground = new THREE.Mesh(GF.geo('plane', 420, 90), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(train.maxX / 2, -1.6, 20);
    root.add(ground);
    for (const z of [-1.4, 1.4]) root.add(GF.part(GF.geo('box', train.maxX + 200, 0.12, 0.16), '#6b6f7a', [train.maxX / 2, -1.5, z], { ink: false }));
    train.sky = sky; train.skyTex = sceneTex; train.ground = ground; train.groundTex = groundTex;
    train.root = root;
    return root;
  }

  function disposeTrain(train) {
    if (!train || !train.root) return;
    GF.scene.remove(train.root);
    train.skyTex.dispose();
    train.groundTex.dispose();
    train.sky.material.dispose();
    train.ground.material.dispose();
  }

  Object.assign(WG, { buildMeshes, disposeTrain });
})();
