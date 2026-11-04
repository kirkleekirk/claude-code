/* Large-scale sweep suite: checks every object in the world, walks the whole map, and exercises
   every animation/technique combination. Injected after suite.js (uses window.TH helpers). */
(function () {
  const R = []; let group = '';
  const ok = (name, cond, detail) => { R.push({ group, name, ok: !!cond, detail: cond ? '' : String(detail === undefined ? 'assertion failed' : detail) }); return !!cond; };
  const t = async (name, fn) => { try { const r = await fn(); if (r !== undefined && r !== true) ok(name, false, r); else ok(name, true); } catch (e) { ok(name, false, (e && e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); } };
  const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
  const fin = Number.isFinite;
  const H = () => window.TH;
  const roadDist = (x, z) => { let d = 1e9; for (const r of ROADS) d = Math.min(d, U.polyDist(x, z, r)); return d; };
  const near = (x, z, L, pad = 0) => Math.hypot(x - L.x, z - L.z) < L.r + pad;
  const bridge = { x: -19, z: 148 };
  const revive = () => { const p = G.player; p.hp = p.maxHp; p.hunger = p.thirst = 100; p.warmth = 80; p.dead = false; p.status.sick = 0; G.mode = 'play'; document.getElementById('dead').classList.add('hidden'); };
  function insideBox(x, z, c, pad = 0) { const dx = x - c.x, dz = z - c.z; const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; return Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad; }
  function solidAt(x, y, z, ignore) { // is (x,y,z) inside a static solid?
    for (const c of collidersNear(x, z)) { if (c === ignore || c.dead) continue; if (c.top !== undefined && y >= c.top - 0.3) continue; if (c.bottom !== undefined && y + 1.6 < c.bottom) continue;
      if (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r - 0.08 : insideBox(x, z, c, -0.08)) return c; }
    return null;
  }
  function terrainSpread(x, z, r) { let mn = 1e9, mx = -1e9; for (let a = 0; a < 6.28; a += 0.785) for (const k of [0.5, 1]) { const h = terrainH(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k); mn = Math.min(mn, h); mx = Math.max(mx, h); } return [mn, mx]; }
  const RNG = U.rng(20261101);
  function landPoints(n, minH = 0.8) { const out = []; while (out.length < n) { const x = (RNG() - 0.5) * 570, z = (RNG() - 0.5) * 570; if (Math.hypot(x, z) > 285) continue; const h = terrainH(x, z); if (h < minH) continue; out.push([x, z]); } return out; }
  // footprints of hand-built landmarks where vegetation would clip through architecture
  const FOOTPRINTS = () => [
    { x: 0, z: 0, r: 16, name: 'village plaza' }, { x: LOC.moonpool.x, z: LOC.moonpool.z, r: 8, name: 'Moon Pool platform' }, { x: LOC.bisonpeak.x, z: LOC.bisonpeak.z, r: 10, name: 'air shrine platform' },
    { x: LOC.sunruins.x, z: LOC.sunruins.z, r: 21, name: 'Sun Warrior plaza' }, { x: LOC.daofei.x, z: LOC.daofei.z, r: 18, name: 'daofei camp' }, { x: World.caveCenter.x, z: World.caveCenter.z, r: 9.5, name: 'badgermole grotto' },
    { x: LOC.pagoda.x, z: LOC.pagoda.z, r: 9, name: 'pagoda summit' }, { x: World.banyanSeat.x - 5, z: World.banyanSeat.z - 6, r: 9, name: 'Elder Banyan' }];

  window.SWEEP = { results: R, async run(only) {
    const want = (g) => !only || !only.length || only.includes(g);
    const { tick, fresh, isolate, grantAll, place, dummy, clearAll, finiteObj } = H();

    /* ---------- every vegetation instance ---------- */
    if (want('vegetation')) { group = 'Vegetation';
      const V = World.vegRecs; const fps = FOOTPRINTS(); const stairs = World.stairPts || []; const rockSet = new Set(V.rock.concat(V.redrock).map(r => r.x.toFixed(3) + ',' + r.z.toFixed(3))); const rockAt = (c) => rockSet.has(c.x.toFixed(3) + ',' + c.z.toFixed(3));
      const common = (kind, r, i, opt) => t(`${kind} #${i} at (${r.x.toFixed(0)}, ${r.z.toFixed(0)}) sits correctly`, () => {
        const h = terrainH(r.x, r.z); const probs = [];
        if (!fin(r.y) || !fin(r.s)) probs.push('non-finite');
        if (opt.dry && h < opt.dry) probs.push(`in water (h=${h.toFixed(2)})`);
        if (opt.wet && (h < opt.wet[0] || h > opt.wet[1])) probs.push(`not at the waterline (h=${h.toFixed(2)})`);
        if (opt.road !== undefined && roadDist(r.x, r.z) < opt.road) probs.push(`on a road (${roadDist(r.x, r.z).toFixed(1)}m)`);
        for (const f of fps) if (Math.hypot(r.x - f.x, r.z - f.z) < f.r + (opt.pad || 0)) probs.push('inside ' + f.name);
        for (const p of stairs) if (Math.hypot(r.x - p[0], r.z - p[1]) < 1.7 + (opt.pad || 0)) { probs.push('on the pagoda stair'); break; }
        for (const c of collidersNear(r.x, r.z)) if (c.type === 'box' && !c.dead && insideBox(r.x, r.z, c, 0.2)) { probs.push('inside a building/wall'); break; }
        for (const c of collidersNear(r.x, r.z)) { if (c.type !== 'circle' || c.dead || c.r <= 0.8) continue; const d = Math.hypot(c.x - r.x, c.z - r.z); if (d < 0.05) continue; const rockPair = /rock/.test(kind) && rockAt(c); if (rockPair ? d < c.r * 0.6 : d < c.r * 0.85) { probs.push(`inside another object (collider #${c.id})`); break; } }
        if (opt.base) { const [mn] = terrainSpread(r.x, r.z, opt.base * r.s); const baseY = r.y + (opt.baseOff || 0) * r.s * (r.sy || 1); if (baseY - mn > 0.35) probs.push(`floats ${(baseY - mn).toFixed(2)}m above the ground on one side`); }
        return probs.length ? probs.join('; ') : true;
      });
      for (const [i, r] of V.broad.entries()) await common('broadleaf tree', r, i, { dry: 0.5, road: 2.6, base: 0.42 });
      for (const [i, r] of V.pine.entries()) await common('pine', r, i, { dry: 0.5, road: 2.6, base: 0.32 });
      for (const [i, r] of V.peach.entries()) await common('peach tree', r, i, { dry: 0.5, road: 2.2, base: 0.28 });
      for (const [i, r] of V.ash.entries()) await common('ash tree', r, i, { dry: 0.3, road: 2.2, base: 0.35 });
      for (const [i, r] of V.bamboo.entries()) await common('bamboo clump', r, i, { dry: 0.2, road: 2.2, base: 0.5 });
      for (const [i, r] of V.bush.entries()) await common('berry bush', r, i, { dry: 0.4, road: 2.2, base: 0.86, baseOff: 0.168 });
      for (const [i, r] of V.rock.entries()) await common('rock', r, i, { dry: -0.3, road: 1.4 + r.s * 0.9, base: 0.8, baseOff: -0.07 });
      for (const [i, r] of V.redrock.entries()) await common('red rock', r, i, { dry: -0.3, road: 1.4 + r.s * 0.9, base: 0.8, baseOff: -0.13 });
      for (const [i, r] of V.reed.entries()) await common('reed clump', r, i, { wet: [-0.7, 1.0], road: 1.5 });
    }

    /* ---------- every collider: valid, and never blocking a road ---------- */
    if (want('colliders')) { group = 'Colliders';
      const live = COLL.list.filter(c => !c.dead);
      for (const c of live) await t(`collider #${c.id} (${c.type} at ${c.x.toFixed(0)}, ${c.z.toFixed(0)}) is valid and clear of roads`, () => {
        if (![c.x, c.z].every(fin)) return 'non-finite position'; if (c.type === 'circle' && !(c.r > 0)) return 'bad radius'; if (c.type === 'box' && !(c.hw > 0 && c.hd > 0)) return 'bad extents';
        if (Math.hypot(c.x - bridge.x, c.z - bridge.z) < 15) return true; // bridge rails line the deck on purpose
        const ext = c.type === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
        for (const rd of ROADS) for (let i = 0; i < rd.length - 1; i++) { const L = Math.hypot(rd[i + 1][0] - rd[i][0], rd[i + 1][1] - rd[i][1]);
          for (let s2 = 0; s2 <= L; s2 += 0.75) { const u = s2 / L; const x = rd[i][0] + (rd[i + 1][0] - rd[i][0]) * u, z = rd[i][1] + (rd[i + 1][1] - rd[i][1]) * u; if (Math.hypot(x, z) < 15) continue;
            if (Math.hypot(x - c.x, z - c.z) > ext + 2) continue; const clear = c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) - c.r : (insideBox(x, z, c, 1.0) ? 0 : 9);
            if (clear < 1.0) return `blocks the road at (${x.toFixed(1)}, ${z.toFixed(1)})`; } }
        return true; });
    }

    /* ---------- walk every road end to end (and back) ---------- */
    if (want('roads')) { group = 'Roads';
      fresh('earth'); isolate();
      const follow = (pts, label) => t(`walk ${label}`, () => { const p = G.player; revive(); place(pts[0][0], pts[0][1], 0); tick(0.1); let wi = 1, stuck = 0, lastD = 1e9, maxSwim = 0;
        for (let step = 0; step < 30 * 400 && wi < pts.length; step++) { const [tx, tz] = pts[wi]; const dx = tx - p.pos.x, dz = tz - p.pos.z; const d = Math.hypot(dx, dz);
          if (d < 2.5 || (Math.hypot(tx, tz) < 1 && d < 3.6)) { wi++; stuck = 0; lastD = 1e9; continue; } /* the plaza centre is the statue */ G.camYaw = Math.atan2(dx, dz) + Math.PI; Input.keys.KeyW = true; Main.tick(1 / 30); if (p.swimming) maxSwim++;
          if (step % 30 === 0) { if (d > lastD - 0.5) stuck++; else stuck = 0; lastD = d; if (stuck > 4) { Input.keys = {}; return `stuck near (${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)}) heading to waypoint ${wi}`; } } }
        Input.keys = {}; if (wi < pts.length) return 'ran out of time'; return maxSwim < 3 || `had to swim (${maxSwim} frames)`; });
      for (const [i, rd] of ROADS.entries()) { const pts = []; for (let k = 0; k < rd.length - 1; k++) { const L = Math.hypot(rd[k + 1][0] - rd[k][0], rd[k + 1][1] - rd[k][1]); for (let s2 = 0; s2 < L; s2 += 6) { const u = s2 / L; pts.push([rd[k][0] + (rd[k + 1][0] - rd[k][0]) * u, rd[k][1] + (rd[k + 1][1] - rd[k][1]) * u]); } } pts.push(rd[rd.length - 1]);
        const clean = pts.filter(p2 => Math.hypot(p2[0], p2[1]) > 15 || p2 === pts[0] || p2 === pts[pts.length - 1]);
        await follow(clean, `road ${i} forward`); await follow(clean.slice().reverse(), `road ${i} in reverse`); }
      for (const k of Object.keys(LOC)) { if (k === 'lake') continue; const L = LOC[k]; await t(`reach ${L.name} on foot`, () => { const p = G.player; let best = null, bd = 1e9; for (const rd of ROADS) for (const q of rd) { const d = Math.hypot(q[0] - L.x, q[1] - L.z); if (d < bd) { bd = d; best = q; } }
          const start = bd > 60 ? [L.x + (best[0] - L.x) * 60 / bd, L.z + (best[1] - L.z) * 60 / bd] : best; revive(); place(start[0], start[1], 0); tick(0.1); let lastD = 1e9, stuck = 0;
          for (let step = 0; step < 30 * 60; step++) { const dx = L.x - p.pos.x, dz = L.z - p.pos.z; const d = Math.hypot(dx, dz); if (d < Math.max(6, L.r * 0.6)) { Input.keys = {}; return true; } G.camYaw = Math.atan2(dx, dz) + Math.PI; Input.keys.KeyW = true; if (step % 20 === 10 && p.grounded) Input.jump(); Main.tick(1 / 30);
            if (step % 45 === 0) { if (d > lastD - 0.6) stuck++; else stuck = 0; lastD = d; if (stuck > 5) break; } }
          Input.keys = {}; return `stopped ${Math.hypot(L.x - p.pos.x, L.z - p.pos.z).toFixed(1)}m short at (${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)})`; }); }
    }

    /* ---------- random walks across the whole map ---------- */
    if (want('roam')) { group = 'Roam';
      fresh('earth'); isolate(); const p = G.player; const pts = landPoints(150);
      for (const [i, [x, z]] of pts.entries()) for (let d = 0; d < 8; d++) await t(`roam #${i}.${d} from (${x.toFixed(0)}, ${z.toFixed(0)}) heading ${d * 45}°`, () => {
        revive(); place(x, z, 0); const s0 = solidAt(p.pos.x, p.pos.y, p.pos.z); if (s0) { resolveCollisions(p.pos, p.radius, p.pos.y); }
        G.camYaw = d * Math.PI / 4; Input.keys.KeyW = true; if (d % 2) Input.keys.ShiftLeft = true; const probs = [];
        for (let k = 0; k < 60; k++) { if (k % 25 === 12 && d % 3 === 0) Input.jump(); Main.tick(1 / 30);
          const q = p.pos; if (![q.x, q.y, q.z].every(fin)) { probs.push('NaN position'); break; }
          const g = groundH(q.x, q.z, q.y); if (!p.swimming && q.y < terrainH(q.x, q.z) - 0.1) { probs.push(`under the terrain by ${(terrainH(q.x, q.z) - q.y).toFixed(2)}m`); break; }
          const sd = solidAt(q.x, q.y + 0.5, q.z); if (sd) { probs.push(`inside collider #${sd.id} (${sd.type})`); break; }
          if (p.grounded && q.y - g > 0.4) { probs.push(`grounded but floating ${(q.y - g).toFixed(2)}m`); break; }
          if (Math.hypot(q.x, q.z) > 300.6) { probs.push('left the world'); break; } }
        Input.keys = {}; return probs.length ? probs.join('; ') : true; });
    }

    /* ---------- every tree, bush and rock can be used ---------- */
    if (want('interact')) { group = 'Interact'; const labelFor = (r) => r.kind === 'peach' ? 'Pick moon peaches' : r.kind === 'tree' ? 'Gather firewood' : r.kind === 'bush' ? (r.berries > 0 ? 'Pick berries' : 'Bush (picked clean)') : 'Bend stone free';
      fresh('earth'); isolate(); const p = G.player;
      const tryUse = (rec, rad, label, fn) => t(`${label} at (${rec.x.toFixed(0)}, ${rec.z.toFixed(0)}) can be harvested`, () => {
        if (terrainH(rec.x, rec.z) < -0.4) return true; // submerged decorative rocks
        for (const o of World.treeRecs.concat(World.bushRecs, World.rockRecs)) if (Math.abs(o.x - rec.x) < 3 && Math.abs(o.z - rec.z) < 3) { o.cd = 0; if (o.kind === 'bush') o.berries = 3; }
        for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; const x = rec.x + Math.cos(ang) * rad, z = rec.z + Math.sin(ang) * rad; if (terrainH(x, z) < -0.6) continue;
          p.pos.set(x, groundH(x, z), z); resolveCollisions(p.pos, p.radius, p.pos.y); p.pos.y = groundH(p.pos.x, p.pos.z); p.yaw = Math.atan2(rec.x - x, rec.z - z);
          const it = Game.findInteract(); const same = it && it.pos && (Math.hypot(it.pos.x - rec.x, it.pos.z - rec.z) < 0.01 || (it.label === labelFor(rec) && Math.hypot(it.pos.x - rec.x, it.pos.z - rec.z) < 2.2)); /* a touching twin gives the same resource */ if (same) { rec.cd = 0; if (rec.kind === 'bush') rec.berries = 3; const before = JSON.stringify(Game.state.inv); it.action(); return JSON.stringify(Game.state.inv) !== before || 'interaction gave nothing'; } }
        return 'no approach angle selects it'; });
      for (const tr of World.treeRecs) await tryUse(tr, 0.5 * tr.s + 1.1, tr.kind === 'peach' ? 'peach tree' : 'tree', null);
      for (const b of World.bushRecs) await tryUse(b, 1.4, 'berry bush', null);
      for (const r of World.rockRecs.filter(r => r.s > 0.35)) await tryUse(r, r.s * 0.9 + 1.0, 'rock', null);
    }

    /* ---------- anatomy: every action on every nation/frame/hair ---------- */
    if (want('anatomy')) { group = 'Anatomy';
      const lim = { knL: [-0.12, 2.75], knR: [-0.12, 2.75], elL: [-2.75, 0.12], elR: [-2.75, 0.12] };
      const footY = (Hm, side) => { const v = V3(); (Hm.J['foot' + side] || Hm.J['kn' + side]).getWorldPosition(v); return v.y - Hm.root.position.y; };
      const wpos = (o) => { const v = V3(); o.getWorldPosition(v); return v; };
      /* how deep a world point sits inside the torso (0 outside … 1 on the axis), from rest cross-sections carried by the hips / spine / chest bones */
      const torsoDepth = (Hm, p) => { const R = Hm.restJ; let worst = 0;
        for (const [bn, y0, y1] of [['hips', R.hips.y - 0.08, R.spine.y], ['spine', R.spine.y, R.chest.y], ['chest', R.chest.y, R.neck.y - 0.02]]) {
          const lp = Hm.B[bn].worldToLocal(p.clone()).add(R[bn]); if (lp.y < y0 || lp.y > y1) continue; let sec = Hm.fit[0]; for (const f of Hm.fit) if (Math.abs(f.y - lp.y) < Math.abs(sec.y - lp.y)) sec = f;
          worst = Math.max(worst, 1 - Math.hypot((lp.x - sec.cx) / sec.rx, (lp.z - sec.cz) / sec.rz)); }
        return worst; };
      const headDepth = (Hm, p) => { const R = Hm.rest, lp = Hm.B.head.worldToLocal(p.clone()).add(Hm.restJ.head);
        return 1 - Math.hypot(lp.x / R.headHalfW, (lp.y - (R.chin + R.headTop) / 2) / ((R.headTop - R.chin) / 2), (lp.z - R.headZc) / ((R.headFront - R.headBack) / 2)); };
      const clip = (Hm, probs) => { for (const sd of ['L', 'R']) { const hp = wpos(Hm.J['hand' + sd]), ep = wpos(Hm.J['el' + sd]); const th = torsoDepth(Hm, hp), te = torsoDepth(Hm, ep), hh = headDepth(Hm, hp);
        if (th > 0.3) probs.add(`hand${sd} ${(th * 100) | 0}% inside the torso`); if (te > 0.35) probs.add(`elbow${sd} ${(te * 100) | 0}% inside the torso`); if (hh > 0.3) probs.add(`hand${sd} ${(hh * 100) | 0}% inside the head`);
        if (hp.y - Hm.root.position.y < -0.03) probs.add(`hand${sd} ${(hp.y - Hm.root.position.y).toFixed(2)}m under the ground`); } };
      for (const n of Object.keys(NATIONS)) for (const body of ['A', 'B']) for (const hs of Object.keys(HAIR_STYLES)) {
        const Hm = buildHumanoid(Object.assign(defaultLook(n), { body, hair: hs })); G.scene.add(Hm.root); Hm.root.position.set(0, 0, 0);
        for (const a of Object.keys(ACTIONS)) await t(`${n} · frame ${body} · ${HAIR_STYLES[hs]} · "${a}" stays anatomical`, () => {
          playAction(Hm, a); const probs = new Set(); let frames = 0;
          while (Hm.action && frames < 500) { animateHumanoid(Hm, 1 / 60, { grounded: true, element: NATIONS[n].element }); frames++;
            if (frames % 4) continue; for (const j in lim) { const v = Hm.J[j].rotation.x; if (v < lim[j][0] || v > lim[j][1]) probs.add(`${j} ${v.toFixed(2)} out of [${lim[j]}]`); }
            for (const j of ['shL', 'shR', 'hipL', 'hipR', 'spine', 'head']) for (const ax of ['x', 'y', 'z']) if (!fin(Hm.J[j].rotation[ax]) || Math.abs(Hm.J[j].rotation[ax]) > 3.3) probs.add(`${j}.${ax}=${Hm.J[j].rotation[ax]}`);
            Hm.root.updateMatrixWorld(true); const fl = Math.min(footY(Hm, 'L'), footY(Hm, 'R')); if (fl < -0.04) probs.add(`foot sinks ${fl.toFixed(2)}m into the ground`); clip(Hm, probs); }
          for (let i = 0; i < 40; i++) animateHumanoid(Hm, 1 / 60, { grounded: true });
          if (Hm.action) probs.add('action never ended'); if (!finiteObj(Hm.root)) probs.add('non-finite matrices');
          return probs.size ? [...probs].slice(0, 3).join('; ') : true; });
        for (const st of ['idle', 'stroll', 'walk', 'run', 'combat', 'meditate', 'swim', 'air', 'sleep', 'dead']) await t(`${n} · frame ${body} · ${HAIR_STYLES[hs]} · ${st} pose`, () => {
          const flags = { idle: { speed: 0 }, stroll: { speed: 1.4 }, walk: { speed: 4.6 }, run: { speed: 7.8 }, combat: { combat: true, element: 'fire' }, meditate: { meditate: true }, swim: { swim: true, speed: 2.9 }, air: { grounded: false, vy: 4 }, sleep: { sleep: true }, dead: { dead: true } }[st];
          const probs = new Set(); for (let i = 0; i < 90; i++) { animateHumanoid(Hm, 1 / 60, Object.assign({ grounded: true }, flags)); for (const j in lim) { const v = Hm.J[j].rotation.x; if (v < lim[j][0] || v > lim[j][1]) probs.add(`${j} ${v.toFixed(2)}`); }
            if (i % 6 === 5) { Hm.root.updateMatrixWorld(true); const fl = Math.min(footY(Hm, 'L'), footY(Hm, 'R')); if (st !== 'swim' && st !== 'air' && fl < -0.04) probs.add(`foot ${fl.toFixed(2)}m into the ground`); const sole = (sd) => Math.min(footY(Hm, sd), wpos(Hm.J['toe' + sd]).y - Hm.root.position.y - Hm.restJ['toe' + sd].y); const down = Math.min(sole('L'), sole('R'));
              if (st === 'stroll' && down > 0.035) probs.add(`walking with both feet ${down.toFixed(2)}m off the ground`); if ((st === 'walk' || st === 'run') && fl > 0.16) probs.add(`running flight ${fl.toFixed(2)}m high`); clip(Hm, probs); } }
          Hm.root.updateMatrixWorld(true); const fl = Math.min(footY(Hm, 'L'), footY(Hm, 'R')), fh = Math.max(footY(Hm, 'L'), footY(Hm, 'R'));
          if ((st === 'idle' || st === 'combat') && (Math.abs(fl) > 0.03 || fh > 0.06)) probs.add(`standing feet ${fl.toFixed(3)} / ${fh.toFixed(3)}m off the ground`);
          if ((st === 'sleep' || st === 'dead') && Hm.J.hips.position.y > 0.3) probs.add(`lying hips ${Hm.J.hips.position.y.toFixed(2)}m up`);
          if (st === 'meditate' && Hm.J.hips.position.y > 0.4) probs.add(`meditating hips ${Hm.J.hips.position.y.toFixed(2)}m up`);
          for (let i = 0; i < 90; i++) animateHumanoid(Hm, 1 / 60, { grounded: true });
          return probs.size ? [...probs].slice(0, 3).join('; ') : true; });
        G.scene.remove(Hm.root);
      }
    }

    /* ---------- creatures: every species, every state, standing on real terrain ---------- */
    if (want('creatures')) { group = 'Creature anim';
      const lowest = (root) => { root.updateMatrixWorld(true); const b = new THREE.Box3(); let mn = 1e9; root.traverse(o => { if (o.isMesh && o.geometry && o.material && !o.material.map) { b.setFromObject(o, true); mn = Math.min(mn, b.min.y); } }); return mn; }; /* precise: real vertices, not rotated bounding boxes */
      for (const sp of Object.keys(SPECIES)) for (const st of ['idle', 'walk', 'run', 'graze', 'alert', 'rear', 'lunge', 'frozen', 'dead']) await t(`${SPECIES[sp].name} · ${st}`, () => {
        const C = buildCreature(sp); const flags = { idle: { speed: 0 }, walk: { speed: 2 }, run: { speed: SPECIES[sp].speed }, graze: { graze: true }, alert: { alert: true, speed: 5 }, rear: { rear: true }, lunge: { lunge: 0.5 }, frozen: { frozen: true }, dead: { dead: true } }[st];
        for (let i = 0; i < 80; i++) animateCreature(C, 1 / 60, flags); if (!finiteObj(C.root)) return 'non-finite';
        if (C.fly || st === 'dead' || (st === 'rear' && !C.rear) || (C.gait === 'hop' && flags.speed > 0)) return true; /* only platypus-bears rear; hoppers are airborne mid-hop */ const lo = lowest(C.root); return (lo > -0.3 && lo < 0.25) || `lowest point ${lo.toFixed(2)}m (should touch the ground)`; });
      fresh('earth'); isolate();
      for (const sp of Object.keys(SPECIES).filter(s => !SPECIES[s].passive)) for (let i = 0; i < 20; i++) await t(`${SPECIES[sp].name} #${i} stands on its terrain`, () => {
        const pt = Spawner.point(SPECIES[sp].zone); if (!pt) return 'no spawn point'; const c = new Creature(sp, pt[0], pt[1]); G.ents.push(c); G.player.pos.set(pt[0] + 120, groundH(pt[0] + 120, pt[1]), pt[1]);
        c.state = 'wander'; c.timer = 3; for (let k = 0; k < 45; k++) c.update(1 / 30); const lo = lowest(c.model.root); const g = c.swimming ? WORLD.sea : groundH(c.pos.x, c.pos.z, c.pos.y + 0.5);
        G.scene.remove(c.model.root); c.removed = true; G.ents = G.ents.filter(e => !e.removed);
        if (c.swimming) return true; return (lo - g > -0.6 && lo - g < 0.45) || `feet ${(lo - g).toFixed(2)}m from ground at (${c.pos.x.toFixed(0)}, ${c.pos.z.toFixed(0)}), slope ${slopeAt(c.pos.x, c.pos.z).toFixed(2)}`; });
    }

    /* ---------- every technique for every native element, by day and by night ---------- */
    if (want('techniques')) { group = 'Technique matrix';
      const expect = { fire_jab: 'dmg', fire_blast: 'dmg', fire_arc: 'dmg:4', breath_fire: 'dmg:5', spark: 'light', rock_toss: 'dmg', earth_wall: 'struct', rock_shelter: 'shelter', earth_pillar: 'dmg', shockwave: 'dmg:5', water_whip: 'dmg:6', water_draw: 'drink', ice_darts: 'dmg', healing: 'heal', tidal_push: 'dmg:7', ice_prison: 'freeze', air_palm: 'dmg', air_jump: 'jump', wind_step: 'dash', air_sweep: 'dmg:7', air_shield: 'shield' };
      for (const nat of ELEMENTS) for (const night of [false, true]) for (const id of H().CASTABLE) await t(`${TECH[id].name} · ${nat} Avatar · ${night ? 'night' : 'day'}`, () => {
        const nation = Object.keys(NATIONS).find(k => NATIONS[k].element === nat); const p = fresh(nation); isolate(); grantAll(); clearAll(); G.dayLen = 1e9; G.time = night ? 23 : 12;
        const [kind, dd] = expect[id].split(':'); const dist = +(dd || 8); const near = id === 'water_draw'; place(near ? 95 : 20, near ? 123 : 78, -Math.PI / 2); p.element = TECH[id].el; p.water = 99; tick(0.05);
        const d = dummy((near ? 95 : 20) - dist, near ? 123 : 78); G.aimOverride = { target: d }; tick(0.05); const hp0 = p.hp; p.hp = 50; const y0 = p.pos.y, x0 = p.pos.x;
        const cast = Tech.cast(id); if (!cast) return 'cast refused: ' + Tech.can(id);
        tick(1.6, 1 / 60); G.aimOverride = null; G.dayLen = 840; void hp0;
        switch (kind) { case 'dmg': return 1e5 - d.hp > 0 || 'no damage'; case 'light': return p.handFlame > 0 || 'no flame'; case 'struct': return G.structures.length > 0 || 'no wall'; case 'shelter': return p.sheltered || 'not sheltered';
          case 'drink': return p.water === p.waterMax || 'no water'; case 'heal': return p.hp > 60 || `hp ${p.hp.toFixed(1)}`; case 'freeze': return d.status.frozen > 0 || 'not frozen'; case 'jump': return true; case 'dash': return Math.abs(p.pos.x - x0) + Math.abs(p.pos.z - 78) > 4 || 'no dash'; case 'shield': return true; }
        return true; });
    }

    /* ---------- dialogue at every story stage ---------- */
    if (want('dialogue')) { group = 'Dialogue';
      fresh('fire'); isolate();
      for (const v of VILLAGERS) for (const q of [...Object.keys(QUESTS), null]) for (const night of [false, true]) await t(`${v.name} · stage ${q || 'after chapter'} · ${night ? 'night' : 'day'}`, () => {
        const npc = G.ents.find(e => e.def && e.def.id === v.id); Game.state.activeQuest = q; if (q) Game.state.quests[q] = { step: 0 }; G.time = night ? 22 : 10; Game.state.inv.copper = 999;
        const node = DIALOGUE[v.id](npc); assert(node && node.t && node.t.length > 10, 'empty'); assert(!/undefined|NaN|\[object/.test(node.t), 'bad text: ' + node.t.slice(0, 60));
        for (const c of node.c || []) { assert(c.t && !/undefined|NaN/.test(c.t), 'bad choice'); if (c.f && !/rest|Rent a bed/.test(c.t)) { const r = c.f(); if (r) assert(r.t && !/undefined|NaN/.test(r.t), 'bad reply'); } }
        Dialog.open(npc); const html = document.getElementById('dialog').innerHTML; Dialog.close(); return !/undefined|NaN/.test(html) || 'rendered text has undefined/NaN'; });
    }

    /* ---------- save/load fuzzing ---------- */
    if (want('saveload')) { group = 'Save fuzz';
      const nations = Object.keys(NATIONS); const items = Object.keys(ITEMS);
      for (let i = 0; i < 60; i++) await t(`random journey #${i} survives save/load`, () => {
        const n = nations[i % 4]; const homes = Object.keys(NATIONS[n].homes); const p = fresh(n, homes[i % homes.length], Object.keys(BACKGROUNDS)[i % 4]); isolate();
        const s = Game.state; const r = U.rng(i + 77); for (const id in TECH) if (!TECH[id].late && r() < 0.4 && !s.learned.includes(id)) s.learned.push(id); for (const e of ELEMENTS) if (e !== p.native && r() < 0.4) s.awakened.push(e);
        for (const it of items) if (r() < 0.5) s.inv[it] = 1 + Math.floor(r() * 9); s.level = 1 + Math.floor(r() * 8); s.sp = Math.floor(r() * 6); s.xp = Math.floor(r() * 90); G.stats.meditate_time = r() * 300; G.flags.talkedBao = r() < 0.5; G.time = r() * 24; G.day = 1 + Math.floor(r() * 9);
        const [x, z] = landPoints(1)[0]; place(x, z, r() * 6); p.hunger = r() * 100; p.thirst = r() * 100; p.warmth = r() * 100; p.water = Math.floor(r() * 3);
        const snap = JSON.stringify({ s, stats: G.stats, flags: G.flags, t: G.time.toFixed(3), d: G.day, x: p.pos.x.toFixed(2), z: p.pos.z.toFixed(2), h: p.hunger.toFixed(2) });
        G.allowSave = true; Game.save(); G.allowSave = false; const data = Game.loadData(); fresh('fire'); Boot.load(data); const q = G.player;
        const snap2 = JSON.stringify({ s: Game.state, stats: G.stats, flags: G.flags, t: G.time.toFixed(3), d: G.day, x: q.pos.x.toFixed(2), z: q.pos.z.toFixed(2), h: q.hunger.toFixed(2) });
        localStorage.removeItem('avatar_lost_era_v1'); return snap === snap2 || 'state differs after load'; });
    }
    return R;
  } };
})();
