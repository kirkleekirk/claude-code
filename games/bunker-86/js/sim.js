/* BUNKER '86 — simulation: time, needs, free will, power, looting, survival. */
(function (BK) {
  'use strict';

  const MIN_PER_SEC = 1.5;      // game minutes per real second at 1x

  const S = BK.Sim = {};

  // ============================================================ new game ====
  BK.newState = function (seed) {
    seed = seed || ((Math.random() * 1e9) | 0);
    const bunker = BK.buildBunker();
    const surface = BK.buildSurface(seed);

    const st = {
      seed: seed,
      version: 1,
      maps: { bunker: bunker, surface: surface },
      mapId: 'bunker',
      time: { minutes: 19 * 60 },      // start at 7pm on day 1. It gets dark fast.
      day: 1,
      speed: 1,
      paused: false,
      res: { food: 26, water: 24, fuel: 22, meds: 5, scrap: 46 },
      crew: [],
      entities: [],
      objects: [],
      lights: [],
      log: [],
      flags: { dread: 0, intel: 0 },
      dread: 0,
      staticBurst: 0,
      eventTimer: 6 * 60,
      autosaveTimer: 0,
      tSec: 0,
      zoom: 1,
      crt: true,
      stats: { looted: 0, daysSurvived: 0, deaths: 0, notesRead: 0, watcherSeen: 0 },
      readNotes: [],
      gameOver: null,
      buildGhost: null,
      focusProp: null,
      pendingEvent: null
    };

    // Starting crew of three
    const rng = BK.rng(seed ^ 0x5f5f);
    for (let i = 0; i < 3; i++) st.crew.push(makeSurvivor(st, rng));
    st.entities = st.crew.slice();
    st.player = st.crew[0];
    st.player.auto = false;          // the one you are driving does not wander off

    // A few things already bolted down when you got here
    placeObject(st, 'generator', 32, 12, true);
    placeObject(st, 'cot', 3, 12, true);
    placeObject(st, 'cot', 3, 14, true);
    placeObject(st, 'cot', 3, 16, true);
    placeObject(st, 'lamp', 18, 15, true);
    placeObject(st, 'latrine', 6, 21, true);
    placeObject(st, 'hotplate', 11, 14, true);
    placeObject(st, 'boombox', 14, 19, true);

    BK.log(st, 'The hatch is bolted. The genny is running. Day one.', 'ok');
    BK.log(st, BK.pick(BK.TIPS), 'tip');
    return st;
  };

  function makeSurvivor(st, rng) {
    const r = rng || BK.rand;
    const first = r.pick ? r.pick(BK.FIRST_NAMES) : BK.pick(BK.FIRST_NAMES);
    const last = r.pick ? r.pick(BK.LAST_NAMES) : BK.pick(BK.LAST_NAMES);
    const traits = [];
    const pool = BK.TRAITS.slice();
    for (let i = 0; i < 2; i++) {
      const t = pool.splice(Math.floor((r.pick ? r() : Math.random()) * pool.length), 1)[0];
      if (t) traits.push(t.key);
    }
    const spawn = st.maps.bunker.spawn;
    const e = {
      id: BK.uid(),
      kind: 'survivor',
      name: first + ' ' + last,
      first: first,
      look: BK.randomLook(r),
      map: 'bunker',
      x: spawn.x + (Math.random() - 0.5) * 3,
      y: spawn.y + (Math.random() - 0.5) * 3,
      dir: 0, frame: 0, animT: 0, lightAngle: 0.785,
      speed: 3.0,
      alive: true,
      needs: { hunger: 72, thirst: 68, energy: 64, bladder: 80, hygiene: 70, fun: 60, social: 62 },
      health: 100, maxHealth: 100, rads: 0, sanity: 82,
      skills: { repair: 1, cooking: 1, medicine: 0, farming: 0, scavenging: 1, nerve: 1 },
      skillXP: { repair: 0, cooking: 0, medicine: 0, farming: 0, scavenging: 0, nerve: 0 },
      traits: traits,
      rel: {},
      auto: true,
      act: null, path: null, pathI: 0, moveTarget: null,
      pack: [], packCap: 8,
      flashlight: true, battery: 100,
      breakdown: 0,
      actIcon: null,
      lastStep: 0
    };
    for (const t of traits) {
      const def = BK.TRAITS.find(x => x.key === t);
      if (def && def.fx.maxHealth) e.maxHealth += def.fx.maxHealth;
      if (def && def.fx.carry) e.packCap += def.fx.carry;
      if (def && def.fx.speed) e.speed *= def.fx.speed;
    }
    e.health = e.maxHealth;
    return e;
  }
  BK.makeSurvivor = makeSurvivor;

  BK.trait = (e, key) => e.traits.indexOf(key) >= 0;
  function traitFx(e, path, dflt) {
    let v = dflt;
    for (const k of e.traits) {
      const d = BK.TRAITS.find(x => x.key === k);
      if (!d) continue;
      let node = d.fx;
      for (const part of path) { node = node && node[part]; }
      if (typeof node === 'number') v *= node;
    }
    return v;
  }

  // ================================================================= log ====
  BK.log = function (st, text, tone) {
    st.log.push({ t: st.time.minutes, text: text, tone: tone || 'ok' });
    if (st.log.length > 160) st.log.shift();
    if (BK.UI && BK.UI.onLog) BK.UI.onLog(st.log[st.log.length - 1]);
  };

  // ============================================================ objects ====
  function placeObject(st, type, x, y, silent) {
    const def = BK.OBJECTS[type];
    const map = st.maps.bunker;
    const p = BK.addProp(map, {
      kind: 'furniture', type: type, sprite: def.sprite,
      x: x, y: y, w: def.w, h: def.h,
      blocks: type !== 'lamp' ? true : false,
      opaque: false,
      lit: false, broken: false,
      light: def.light || 0, glow: def.glow || null,
      label: def.name
    });
    st.objects.push(p);
    BK.rebuildGrids(map);
    if (!silent) BK.Audio.sfx('build');
    return p;
  }
  BK.placeObject = placeObject;

  BK.canPlace = function (st, type, x, y) {
    const def = BK.OBJECTS[type];
    const map = st.maps.bunker;
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!BK.inBounds(map, tx, ty)) return false;
        const k = BK.idx(map, tx, ty);
        if (map.floor[k] === BK.F.VOID) return false;
        if (map.wall[k] !== BK.W.NONE) return false;
        for (const pr of map.props) {
          if (pr.kind === 'fixture' || pr.kind === 'poster') continue;
          if (tx >= pr.x && tx < pr.x + (pr.w || 1) && ty >= pr.y && ty < pr.y + (pr.h || 1)) return false;
        }
      }
    }
    return true;
  };

  BK.sellObject = function (st, prop) {
    const def = BK.OBJECTS[prop.type];
    const map = st.maps.bunker;
    map.props = map.props.filter(p => p !== prop);
    st.objects = st.objects.filter(p => p !== prop);
    for (const e of st.crew) if (e.act && e.act.objId === prop.id) e.act = null;
    BK.rebuildGrids(map);
    BK.gain(st, { scrap: Math.floor(def.cost * 0.6) });
    BK.log(st, 'Stripped the ' + def.name.toLowerCase() + ' for parts.', 'ok');
    BK.Audio.sfx('build');
  };

  // ============================================================ resources ==
  BK.caps = function (st) {
    const c = {};
    for (const r of BK.RESOURCES) c[r.key] = r.base;
    for (const o of st.objects) {
      const def = BK.OBJECTS[o.type];
      if (def && def.capBonus) for (const k in def.capBonus) c[k] += def.capBonus[k];
    }
    return c;
  };

  BK.gain = function (st, obj) {
    const caps = BK.caps(st);
    for (const k in obj) st.res[k] = BK.clamp((st.res[k] || 0) + obj[k], 0, caps[k] || 999);
  };
  BK.take = function (st, obj) {
    for (const k in obj) st.res[k] = Math.max(0, (st.res[k] || 0) - obj[k]);
  };
  BK.spend = function (st, obj) {
    for (const k in obj) if ((st.res[k] || 0) < obj[k]) return false;
    for (const k in obj) st.res[k] -= obj[k];
    return true;
  };

  // ================================================================ power ==
  function updatePower(st) {
    let supply = 0;
    for (const o of st.objects) {
      const def = BK.OBJECTS[o.type];
      if (!def || def.power >= 0 || o.broken) continue;
      if ((st.res.fuel || 0) <= 0) continue;
      supply += -def.power + (o.boost || 0);
    }
    // Priority: lights first, then life support, then luxuries.
    const prio = { lamp: 0, emerglight: 0, heater: 1, filter: 1, hotplate: 1, medstation: 1, growtray: 2, workbench: 2, radiorig: 3, tv: 3, arcade: 3, boombox: 3, shower: 1 };
    const powered = st.objects.filter(o => { const d = BK.OBJECTS[o.type]; return d && d.power > 0 && !o.broken; });
    powered.sort((a, b) => (prio[a.type] || 5) - (prio[b.type] || 5));
    let budget = supply, draw = 0;
    for (const o of powered) {
      const d = BK.OBJECTS[o.type];
      if (budget >= d.power) { o.lit = true; budget -= d.power; draw += d.power; }
      else o.lit = false;
    }
    st.power = { supply: supply, draw: draw, demand: powered.reduce((a, o) => a + BK.OBJECTS[o.type].power, 0) };
    const brown = st.power.demand > supply;
    if (brown && !st.wasBrown) BK.log(st, 'Brownout. Something just went dark.', 'bad');
    st.wasBrown = brown;
  }

  // ======================================================== light queries ==
  function gatherLights(st) {
    const lights = [];
    const map = st.maps[st.mapId];
    // during a flicker the fixed lighting stutters; carried lights do not
    const flick = st.flickerT > 0 ? (Math.random() < 0.45 ? 0.12 : 1) : 1;
    for (const p of map.props) {
      if (!p.light) continue;
      const on = p.always || (p.kind === 'furniture' ? p.lit : true);
      if (!on) continue;
      lights.push({ x: p.x + ((p.w || 1) - 1) / 2, y: p.y + ((p.h || 1) - 1) / 2, r: p.light, color: p.glow, intensity: flick });
    }
    // daylight outdoors is handled by ambient, not by point lights
    for (const e of st.entities) {
      if (e.map !== st.mapId || !e.alive) continue;
      if (e.kind !== 'survivor') continue;
      // a torch is worth nothing at noon; fade it out with the daylight
      const need = BK.clamp(1 - (st.ambientLevel || 0) * 1.15, 0, 1);
      if (need < 0.05) continue;
      if (e.flashlight && e.battery > 0) {
        lights.push({ x: e.x, y: e.y, r: 12, cone: 1.0, angle: e.lightAngle || 0.785, intensity: BK.clamp(e.battery / 40, 0.3, 1) * need });
        lights.push({ x: e.x, y: e.y, r: 3.4, intensity: 0.7 * need, color: '#ffe6b8' });
      } else {
        lights.push({ x: e.x, y: e.y, r: 2.6, intensity: 0.45 * need });
      }
    }
    st.lights = lights;
  }

  BK.lightAt = function (st, x, y) {
    let v = st.ambientLevel || 0;
    for (const L of st.lights) {
      const d = BK.dist(x, y, L.x, L.y);
      if (d < L.r) v += (1 - d / L.r) * (L.intensity || 1) * (L.cone ? 0.6 : 1);
    }
    return BK.clamp(v, 0, 1);
  };

  // ================================================================ time ===
  function ambientFor(st) {
    const map = st.maps[st.mapId];
    if (!map.outdoor) return 0.09;
    const h = (st.time.minutes / 60) % 24;
    // overcast noon, a long sodium dusk, then nothing from 21:00 to 05:00
    if (h >= 9 && h < 16) return 0.90;
    if (h >= 6 && h < 9) return BK.lerp(0.20, 0.90, (h - 6) / 3);
    if (h >= 16 && h < 19) return BK.lerp(0.90, 0.24, (h - 16) / 3);
    if (h >= 19 && h < 21) return BK.lerp(0.24, 0.05, (h - 19) / 2);
    if (h >= 5 && h < 6) return BK.lerp(0.05, 0.20, h - 5);
    return 0.05;
  }
  BK.isNight = (st) => { const h = (st.time.minutes / 60) % 24; return h >= 19 || h < 6; };

  // ========================================================== pathfinding ==
  const heapPush = (h, node) => {
    h.push(node);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p].f <= h[i].f) break; const t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  };
  const heapPop = (h) => {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < h.length && h[l].f < h[m].f) m = l;
        if (r < h.length && h[r].f < h[m].f) m = r;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  };

  BK.findPath = function (map, sx, sy, tx, ty, maxNodes) {
    sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
    if (sx === tx && sy === ty) return [];
    if (BK.isBlocked(map, tx, ty)) {
      const near = BK.nearestFree(map, tx, ty, 4);
      tx = near.x; ty = near.y;
      if (BK.isBlocked(map, tx, ty)) return null;
    }
    const W = map.w, H = map.h, N = W * H;
    const open = [], gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const start = sy * W + sx, goal = ty * W + tx;
    gScore[start] = 0;
    heapPush(open, { i: start, f: BK.dist(sx, sy, tx, ty) });
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let count = 0;
    const cap = maxNodes || 6000;
    while (open.length) {
      const cur = heapPop(open);
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      if (cur.i === goal) break;
      if (++count > cap) break;
      const cx = cur.i % W, cy = (cur.i / W) | 0;
      for (const d of DIRS) {
        const nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (map.blocked[ni]) continue;
        if (d[0] && d[1]) {   // no corner cutting
          if (map.blocked[cy * W + nx] || map.blocked[ny * W + cx]) continue;
        }
        const step = (d[0] && d[1]) ? 1.414 : 1;
        const ng = gScore[cur.i] + step;
        if (ng < gScore[ni]) {
          gScore[ni] = ng; came[ni] = cur.i;
          heapPush(open, { i: ni, f: ng + BK.dist(nx, ny, tx, ty) });
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const path = [];
    let c = goal, guard = 0;
    while (c !== start && c !== -1 && guard++ < 4000) {
      path.push({ x: c % W + 0.5, y: ((c / W) | 0) + 0.5 });
      c = came[c];
    }
    path.reverse();
    return path;
  };

  // ============================================================= movement ==
  function tryMove(map, e, nx, ny) {
    const rad = 0.28;
    const solid = (x, y) => BK.isBlocked(map, Math.floor(x), Math.floor(y));
    let ok = true;
    if (!solid(nx + rad, e.y) && !solid(nx - rad, e.y) && !solid(nx, e.y + rad) && !solid(nx, e.y - rad)) e.x = nx; else ok = false;
    if (!solid(e.x + rad, ny) && !solid(e.x - rad, ny) && !solid(e.x, ny + rad) && !solid(e.x, ny - rad)) e.y = ny; else ok = false;
    return ok;
  }

  function faceDir(e, dx, dy) {
    // Screen-space direction from world delta (iso): 0=SE 1=SW 2=NW 3=NE
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    const sx = dx - dy, sy = dx + dy;
    if (sy >= 0) e.dir = sx >= 0 ? 0 : 1;
    else e.dir = sx >= 0 ? 3 : 2;
    e.lightAngle = Math.atan2(sy * (BK.TH / 2), sx * (BK.TW / 2));
  }

  function moveEntity(st, e, dt) {
    const map = st.maps[e.map];
    let moved = false;

    if (e.input && (e.input.x || e.input.y)) {
      // Joystick: screen-space input mapped into the iso plane.
      const ix = e.input.x, iy = e.input.y;
      let wx = (ix / (BK.TW / 2) + iy / (BK.TH / 2)) / 2;
      let wy = (iy / (BK.TH / 2) - ix / (BK.TW / 2)) / 2;
      const len = Math.hypot(wx, wy) || 1;
      wx /= len; wy /= len;
      const sp = e.speed * (e.sprint ? 1.5 : 1) * dt * (e.encumbered ? 0.75 : 1);
      moved = tryMove(map, e, e.x + wx * sp, e.y + wy * sp);
      faceDir(e, wx, wy);
      e.path = null;
      if (e.act) endAct(st, e);
    } else if (e.path && e.path.length) {
      const node = e.path[0];
      const dx = node.x - e.x, dy = node.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.14) {
        e.path.shift();
        if (!e.path.length) { e.path = null; onArrive(st, e); }
      } else {
        const sp = e.speed * dt;
        moveEntity_step(map, e, dx / d, dy / d, sp);
        faceDir(e, dx, dy);
        moved = true;
      }
    }

    if (moved) {
      e.animT += dt * (e.sprint ? 12 : 8);
      e.frame = Math.floor(e.animT) % 4;
      const now = st.tSec;
      if (now - (e.lastStep || 0) > (e.sprint ? 0.24 : 0.36)) {
        e.lastStep = now;
        if (e === st.player) {
          const f = BK.floorAt(map, Math.floor(e.x), Math.floor(e.y));
          BK.Audio.sfx(f === BK.F.GRATE ? 'stepMetal' : 'step');
        }
      }
    } else {
      e.frame = 0;
    }
  }

  function moveEntity_step(map, e, dx, dy, sp) {
    if (!tryMove(map, e, e.x + dx * sp, e.y + dy * sp)) {
      // slide along whichever axis is free
      tryMove(map, e, e.x + dx * sp, e.y);
      tryMove(map, e, e.x, e.y + dy * sp);
    }
  }

  function onArrive(st, e) {
    if (e.pendingAct) {
      const pa = e.pendingAct;
      e.pendingAct = null;
      startAct(st, e, pa.obj, pa.actId);
    } else if (e.pendingInteract) {
      const p = e.pendingInteract;
      e.pendingInteract = null;
      BK.interactProp(st, e, p);
    }
  }

  BK.goTo = function (st, e, tx, ty) {
    const map = st.maps[e.map];
    const path = BK.findPath(map, e.x, e.y, tx, ty);
    if (!path) { if (e === st.player) BK.Audio.sfx('deny'); return false; }
    e.path = path;
    if (e.act) endAct(st, e);
    return true;
  };

  // ============================================================ activities ==
  function objAt(st, id) { return st.objects.find(o => o.id === id) || null; }

  function adjacentTile(map, prop) {
    const cand = [];
    for (let dy = -1; dy <= (prop.h || 1); dy++) {
      for (let dx = -1; dx <= (prop.w || 1); dx++) {
        const inside = dx >= 0 && dy >= 0 && dx < (prop.w || 1) && dy < (prop.h || 1);
        if (inside) continue;
        const x = prop.x + dx, y = prop.y + dy;
        if (!BK.isBlocked(map, x, y)) cand.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    return cand;
  }

  BK.useObject = function (st, e, prop, actId) {
    const def = BK.OBJECTS[prop.type];
    if (!def) return;
    const act = def.acts && def.acts.find(a => a.id === actId);
    if (!act) return;
    const map = st.maps[e.map];
    const near = adjacentTile(map, prop);
    if (!near.length) { BK.Audio.sfx('deny'); BK.log(st, 'Cannot reach the ' + def.name.toLowerCase() + '.', 'warn'); return; }
    near.sort((a, b) => BK.dist2(a.x, a.y, e.x, e.y) - BK.dist2(b.x, b.y, e.x, e.y));
    const spot = near[0];
    if (BK.dist(e.x, e.y, spot.x, spot.y) < 1.1) {
      startAct(st, e, prop, actId);
    } else {
      e.pendingAct = { obj: prop, actId: actId };
      BK.goTo(st, e, spot.x, spot.y);
    }
  };

  function startAct(st, e, prop, actId) {
    const def = BK.OBJECTS[prop.type];
    const act = def.acts.find(a => a.id === actId);
    if (!act) return;
    if (act.needPower && !prop.lit) { BK.log(st, def.name + ' has no power.', 'warn'); BK.Audio.sfx('deny'); return; }
    e.act = { objId: prop.id, actId: actId, def: act, elapsed: 0 };
    e.input = null; e.path = null;
    e.actIcon = actIcon(act);
    faceDir(e, prop.x + 0.5 - e.x, prop.y + 0.5 - e.y);
    if (act.sleep) BK.Audio.sfx('sleep');
  }

  function actIcon(act) {
    if (act.sleep) return '💤';
    if (act.id === 'eat') return '🍽';
    if (act.id === 'drink') return '💧';
    if (act.id === 'relieve') return '🚽';
    if (act.id === 'shower') return '🚿';
    if (act.work) return '🔧';
    if (act.creepy) return '📺';
    return '⭑';
  }

  function endAct(st, e) {
    e.act = null;
    e.actIcon = null;
  }
  BK.endAct = endAct;

  function runAct(st, e, dtMin) {
    const prop = objAt(st, e.act.objId);
    if (!prop || prop.broken) { endAct(st, e); return; }
    const act = e.act.def;
    const hours = dtMin / 60;
    if (act.needPower && !prop.lit) { BK.log(st, e.first + ' is left in the dark mid-task.', 'warn'); endAct(st, e); return; }

    // consume
    if (act.use) {
      const mult = act.use.food ? traitFx(e, ['foodEfficiency'], 1) : 1;
      for (const k in act.use) {
        const want = act.use[k] * hours * mult;
        if ((st.res[k] || 0) < want) {
          BK.log(st, 'Out of ' + k + '. ' + e.first + ' gives up.', 'warn');
          endAct(st, e); return;
        }
        st.res[k] -= want;
      }
    }
    // produce
    if (act.make) {
      const caps = BK.caps(st);
      let boost = 1;
      if (act.skill) boost *= 1 + (e.skills[act.skill] || 0) * 0.14;
      if (act.skill) boost *= traitFx(e, ['skillBoost', act.skill], 1);
      for (const k in act.make) st.res[k] = BK.clamp((st.res[k] || 0) + act.make[k] * hours * boost, 0, caps[k]);
    }
    // needs
    if (act.gain) {
      for (const k in act.gain) {
        const amt = act.gain[k] * hours;
        if (k === 'health') e.health = BK.clamp(e.health + amt * traitFx(e, ['healMult'], 1), 0, effMaxHealth(e));
        else if (k === 'rads') e.rads = BK.clamp(e.rads + amt, 0, 100);
        else if (k === 'sanity') e.sanity = BK.clamp(e.sanity + amt, 0, 100);
        else if (e.needs[k] !== undefined) e.needs[k] = BK.clamp(e.needs[k] + amt, 0, 100);
      }
    }
    if (act.boostPower) prop.boost = act.boostPower;
    // skills
    if (act.skill) addXP(st, e, act.skill, hours * 3.2);
    // socialising: anyone nearby bonds
    if (act.social || act.id === 'hangout') socialize(st, e, hours);

    e.act.elapsed += dtMin;

    // stop when the driving need is full
    let done = false;
    if (act.gain) {
      const primary = Object.keys(act.gain).filter(k => e.needs[k] !== undefined && act.gain[k] > 0);
      if (primary.length && primary.every(k => e.needs[k] >= 99.5)) done = true;
    }
    if (act.sleep && e.needs.energy >= 99) done = true;
    if (done) {
      endAct(st, e);
      if (prop.boost) prop.boost = 0;
    }
  }

  function effMaxHealth(e) { return Math.max(15, e.maxHealth - e.rads * 0.75); }
  BK.effMaxHealth = effMaxHealth;

  function addXP(st, e, skill, amt) {
    e.skillXP[skill] = (e.skillXP[skill] || 0) + amt;
    const need = 10 + (e.skills[skill] || 0) * 14;
    if (e.skillXP[skill] >= need && e.skills[skill] < 10) {
      e.skillXP[skill] -= need;
      e.skills[skill]++;
      BK.log(st, e.first + ' got better at ' + skill + ' (level ' + e.skills[skill] + ').', 'good');
      BK.Audio.sfx('levelup');
    }
  }

  function socialize(st, e, hours) {
    for (const o of st.crew) {
      if (o === e || !o.alive || o.map !== e.map) continue;
      if (BK.dist(o.x, o.y, e.x, e.y) > 4) continue;
      const mult = traitFx(e, ['relMult'], 1) * traitFx(o, ['relMult'], 1);
      const amt = hours * 7 * mult;
      e.rel[o.id] = BK.clamp((e.rel[o.id] || 0) + amt, -100, 100);
      o.rel[e.id] = BK.clamp((o.rel[e.id] || 0) + amt, -100, 100);
      o.needs.social = BK.clamp(o.needs.social + hours * 12, 0, 100);
      const before = Math.floor((e.rel[o.id] - amt) / 50), after = Math.floor(e.rel[o.id] / 50);
      if (after > before && after === 1) BK.log(st, e.first + ' and ' + o.first + ' have become close.', 'good');
    }
  }

  // ============================================================ free will ==
  function freeWill(st, e) {
    if (e === st.player && !e.auto) return;
    if (e.act || e.path || e.pendingAct) return;
    if (e.breakdown > 0) { wander(st, e); return; }

    // Nobody the player is not driving stays topside by choice.
    if (e.map === 'surface') {
      const surf = st.maps.surface;
      const h = surf.hatch;
      if (BK.dist(e.x, e.y, h.x + 0.5, h.y + 1.5) < 1.6) BK.travel(st, e);
      else BK.goTo(st, e, h.x + 0.5, h.y + 1.5);
      return;
    }

    // pick the most urgent need with a known source
    let worst = null, worstVal = 60;
    for (const n of BK.NEEDS) {
      const v = e.needs[n.key];
      if (v < worstVal) { worstVal = v; worst = n.key; }
    }
    // health and rads take priority when serious
    if (e.health < effMaxHealth(e) * 0.5) {
      const med = findObject(st, 'medstation');
      if (med) { BK.useObject(st, e, med, 'treat'); return; }
    }
    if (e.rads > 45) {
      const med = findObject(st, 'medstation');
      if (med) { BK.useObject(st, e, med, 'scrub'); return; }
    }
    if (worst) {
      const sources = BK.NEED_SOURCES[worst] || [];
      for (const s of sources) {
        const obj = findObject(st, s[0], true);
        if (obj) { BK.useObject(st, e, obj, s[1]); return; }
      }
      if (!e.warnedNeed || st.time.minutes - e.warnedNeed > 600) {
        if (worstVal < 22) {
          e.warnedNeed = st.time.minutes;
          BK.log(st, e.first + ' needs ' + worst + ' and there is nothing here for it.', 'warn');
        }
      }
    }
    // otherwise: pitch in on work, or drift
    if (Math.random() < 0.35) {
      const work = ['workbench', 'growtray', 'filter', 'radiorig'];
      for (const w of BK.rand.shuffle ? BK.rand.shuffle(work.slice()) : work) {
        const obj = findObject(st, w, true);
        if (obj) {
          const def = BK.OBJECTS[w];
          const act = def.acts.find(a => a.work);
          if (act) { BK.useObject(st, e, obj, act.id); return; }
        }
      }
    }
    if (Math.random() < 0.5) wander(st, e);
  }

  function findObject(st, type, needPowered) {
    const list = st.objects.filter(o => o.type === type && !o.broken && (!needPowered || !BK.OBJECTS[type].acts || !BK.OBJECTS[type].acts.some(a => a.needPower) || o.lit));
    if (!list.length) return null;
    // prefer one nobody is using
    const free = list.filter(o => !st.crew.some(c => c.act && c.act.objId === o.id));
    return (free.length ? free : list)[0];
  }

  function wander(st, e) {
    const map = st.maps[e.map];
    for (let i = 0; i < 8; i++) {
      const tx = Math.floor(e.x + BK.irange(-7, 7)), ty = Math.floor(e.y + BK.irange(-7, 7));
      if (!BK.inBounds(map, tx, ty) || BK.isBlocked(map, tx, ty)) continue;
      if (BK.goTo(st, e, tx + 0.5, ty + 0.5)) return;
    }
  }

  // ============================================================== needs ====
  function updateNeeds(st, e, dtMin) {
    const hours = dtMin / 60;
    const sleeping = e.act && e.act.def.sleep;
    for (const n of BK.NEEDS) {
      if (sleeping && (n.key === 'energy' || n.key === 'bladder')) continue;
      let rate = n.decay * traitFx(e, ['decay', n.key], 1);
      if (sleeping) rate *= 0.35;
      if (n.key === 'energy' && BK.trait(e, 'nightowl') && BK.isNight(st)) rate *= 0.6;
      e.needs[n.key] = BK.clamp(e.needs[n.key] - rate * hours, 0, 100);
    }

    // consequences
    const n = e.needs;
    if (n.hunger <= 0) e.health -= 5 * hours;
    if (n.thirst <= 0) e.health -= 9 * hours;
    if (n.bladder <= 0 && !e.hadAccident) {
      e.hadAccident = true;
      n.hygiene = Math.max(0, n.hygiene - 45);
      e.sanity = Math.max(0, e.sanity - 8);
      BK.log(st, e.first + ' did not make it to the head. Nobody says anything.', 'warn');
      setTimeout(() => { e.hadAccident = false; }, 1);
    }
    if (n.bladder > 20) e.hadAccident = false;
    if (n.energy <= 0) { e.sanity -= 5 * hours; e.speed = 2.0; } else e.speed = 3.0 * traitFx(e, ['speed'], 1);
    if (n.hygiene < 15) e.sanity -= 1.5 * hours;

    // radiation
    const map = st.maps[e.map];
    if (map.outdoor) {
      const rad = (0.8 + BK.radAt(map, e.x, e.y)) * traitFx(e, ['radMult'], 1);
      e.rads = BK.clamp(e.rads + rad * hours * 0.55, 0, 100);
    }
    if (e.rads > 60) e.health -= (e.rads - 60) * 0.06 * hours;
    e.health = Math.min(e.health, effMaxHealth(e));

    // sanity: darkness, night, dread, corpses, company
    let sanRate = 0;
    const light = BK.lightAt(st, e.x, e.y);
    if (light < 0.18) sanRate -= 5.5 * (1 - light / 0.18);
    if (map.outdoor && BK.isNight(st)) sanRate -= 4.0;
    sanRate -= (st.dread / 100) * 5.0;
    if (n.fun < 20) sanRate -= 2.0;
    if (n.social < 20) sanRate -= 1.5;
    // company helps
    let near = 0;
    for (const o of st.crew) if (o !== e && o.alive && o.map === e.map && BK.dist(o.x, o.y, e.x, e.y) < 6) { near++; if (BK.trait(o, 'believer')) sanRate += 3; }
    sanRate += Math.min(near, 3) * 1.6;
    if (sleeping && light > 0.2) sanRate += 5;
    if (n.fun > 70) sanRate += 1.4;
    if (sanRate < 0) sanRate *= traitFx(e, ['sanityMult'], 1);
    e.sanity = BK.clamp(e.sanity + sanRate * hours, 0, 100);

    // breakdown
    if (e.sanity <= 0 && e.breakdown <= 0) {
      e.breakdown = 180;
      e.auto = true;
      BK.log(st, e.first + ' has stopped answering. They just keep walking.', 'bad');
      BK.Audio.sting(0.7);
    }
    if (e.breakdown > 0) {
      e.breakdown -= dtMin;
      if (e.breakdown <= 0) { e.sanity = 25; BK.log(st, e.first + ' is talking again. They will not say where they went.', 'warn'); }
    }

    // battery drain
    if (e.flashlight && e.battery > 0 && light < 0.4) e.battery = Math.max(0, e.battery - 2.2 * hours);
    if (e.battery <= 0 && !e.batteryWarned) {
      e.batteryWarned = true;
      if (e === st.player) BK.log(st, 'Your flashlight dies.', 'bad');
    }

    if (e.health <= 0) killSurvivor(st, e);
  }

  function killSurvivor(st, e) {
    if (!e.alive) return;
    e.alive = false;
    e.act = null; e.path = null;
    st.stats.deaths++;
    const map = st.maps[e.map];
    BK.addProp(map, { kind: 'container', sprite: 'corpse', x: Math.floor(e.x), y: Math.floor(e.y), blocks: false, opaque: false,
      ctype: 'corpse', label: e.name.toUpperCase(), creepy: true, loot: [], wasCrew: true });
    BK.rebuildGrids(map);
    BK.log(st, e.name + ' is dead.', 'bad');
    BK.Audio.sting(1);
    BK.Render.shake(0.5, 0.6);
    for (const o of st.crew) if (o.alive) o.sanity = Math.max(0, o.sanity - 22);
    if (st.player === e) {
      const next = st.crew.find(c => c.alive);
      if (next) { st.player = next; BK.log(st, 'You are ' + next.first + ' now.', 'warn'); }
    }
    if (!st.crew.some(c => c.alive)) endGame(st, false);
  }

  function endGame(st, won) {
    st.gameOver = {
      won: won,
      day: st.day,
      stats: st.stats
    };
    st.paused = true;
    if (BK.UI && BK.UI.showGameOver) BK.UI.showGameOver(st);
  }
  BK.endGame = endGame;

  // ============================================================ interact ===
  BK.interactProp = function (st, e, p) {
    const map = st.maps[e.map];
    const d = BK.dist(e.x, e.y, p.x + ((p.w || 1) - 1) / 2, p.y + ((p.h || 1) - 1) / 2);
    if (d > 1.9) {
      const near = adjacentTile(map, p);
      if (!near.length) { BK.Audio.sfx('deny'); return; }
      near.sort((a, b) => BK.dist2(a.x, a.y, e.x, e.y) - BK.dist2(b.x, b.y, e.x, e.y));
      e.pendingInteract = p;
      BK.goTo(st, e, near[0].x, near[0].y);
      return;
    }
    if (p.kind === 'door') {
      p.open = !p.open;
      p.blocks = !p.open;
      p.opaque = !p.open;
      BK.rebuildGrids(map);
      BK.Audio.sfx('door');
      return;
    }
    if (p.kind === 'hatch') {
      BK.travel(st, e);
      return;
    }
    if (p.kind === 'rubble') {
      if (!BK.spend(st, { scrap: 4 })) { BK.log(st, 'Clearing that needs 4 scrap for shoring.', 'warn'); BK.Audio.sfx('deny'); return; }
      p.hp -= 34 + (e.skills.repair || 0) * 6;
      BK.Audio.sfx('build');
      if (p.hp <= 0) {
        map.props = map.props.filter(x => x !== p);
        BK.rebuildGrids(map);
        BK.log(st, 'The passage is open. Cold air comes out of it.', 'warn');
        BK.Audio.sting(0.4);
        st.dread = Math.min(100, st.dread + 6);
      } else BK.log(st, 'You shift some of the rubble. More behind it.', 'ok');
      return;
    }
    if (p.kind === 'note') {
      if (BK.UI) BK.UI.showNote(p.note);
      if (!p.read) { p.read = true; st.stats.notesRead++; e.sanity = Math.max(0, e.sanity - 3); }
      return;
    }
    if (p.kind === 'container') {
      lootContainer(st, e, p);
      return;
    }
    if (p.kind === 'furniture') {
      if (BK.UI) BK.UI.showObjectMenu(p);
      return;
    }
    if (p.note) { if (BK.UI) BK.UI.showNote(p.note); return; }
    BK.Audio.sfx('deny');
  };

  function lootContainer(st, e, p) {
    if (p.looted) { BK.log(st, 'Already picked clean.', 'ok'); BK.Audio.sfx('deny'); return; }
    p.looted = true;
    if (p.creepy) {
      e.sanity = Math.max(0, e.sanity - 6);
      if (p.wasCrew) e.sanity = Math.max(0, e.sanity - 10);
    }
    if (!p.loot || !p.loot.length) {
      BK.log(st, (p.label || 'It') + ': nothing worth carrying.', 'ok');
      BK.Audio.sfx('back');
      return;
    }
    let took = 0;
    for (const it of p.loot) {
      if (e.pack.length >= e.packCap) { BK.log(st, 'Pack is full.', 'warn'); break; }
      e.pack.push({ key: it.key, amount: it.amount, label: it.label });
      took++;
      BK.log(st, e.first + ' took ' + it.label + ' (' + it.amount + ' ' + it.key + ').', 'good');
    }
    if (took) { st.stats.looted += took; BK.Audio.sfx('loot'); }
    e.encumbered = e.pack.length >= e.packCap;
  }

  BK.stash = function (st, e) {
    if (!e.pack.length) return false;
    const caps = BK.caps(st);
    for (const it of e.pack) st.res[it.key] = BK.clamp((st.res[it.key] || 0) + it.amount, 0, caps[it.key]);
    BK.log(st, e.first + ' stashed ' + e.pack.length + ' finds.', 'good');
    e.pack = [];
    e.encumbered = false;
    BK.Audio.sfx('loot');
    return true;
  };

  // ============================================================== travel ===
  BK.travel = function (st, e) {
    const to = e.map === 'bunker' ? 'surface' : 'bunker';
    const map = st.maps[to];
    if (to === 'bunker') {
      BK.stash(st, e);
      e.map = 'bunker';
      e.x = 18.5; e.y = 5.5;
      BK.log(st, e.first + ' comes down the ladder and bolts the hatch.', 'ok');
    } else {
      e.map = 'surface';
      e.x = map.hatch.x + 0.5; e.y = map.hatch.y + 1.5;
      BK.log(st, e.first + ' is topside. ' + (BK.isNight(st) ? 'It is dark out there.' : 'The sky is the colour of a dead television.'), BK.isNight(st) ? 'bad' : 'warn');
      if (BK.isNight(st)) { st.dread = Math.min(100, st.dread + 5); BK.Audio.sting(0.35); }
    }
    e.path = null; e.act = null; e.actIcon = null;
    if (e === st.player) st.mapId = e.map;
    BK.Audio.sfx('door');
  };

  // ============================================================== events ===
  const evtApi = (st) => ({
    spend: (o) => BK.spend(st, o),
    gain: (o) => BK.gain(st, o),
    take: (o) => BK.take(st, o),
    log: (t, tone) => BK.log(st, t, tone),
    crewAlive: () => st.crew.filter(c => c.alive),
    radsAll: (n) => st.crew.forEach(c => { if (c.alive) c.rads = BK.clamp(c.rads + n * traitFx(c, ['radMult'], 1), 0, 100); }),
    sanityAll: (n) => st.crew.forEach(c => { if (c.alive) c.sanity = BK.clamp(c.sanity + n, 0, 100); }),
    funAll: (n) => st.crew.forEach(c => { if (c.alive) c.needs.fun = BK.clamp(c.needs.fun + n, 0, 100); }),
    bondAll: (n) => st.crew.forEach(a => st.crew.forEach(b => { if (a !== b) a.rel[b.id] = BK.clamp((a.rel[b.id] || 0) + n, -100, 100); })),
    hurtRandom: (n) => {
      const alive = st.crew.filter(c => c.alive);
      if (!alive.length) return;
      const v = BK.pick(alive);
      v.health = Math.max(0, v.health - n);
      BK.log(st, v.first + ' is hurt.', 'bad');
      if (v.health <= 0) killSurvivor(st, v);
    },
    addSurvivor: () => {
      const c = makeSurvivor(st);
      st.crew.push(c); st.entities.push(c);
      return c;
    },
    breakObject: (type) => {
      const o = st.objects.find(x => x.type === type && !x.broken);
      if (o) { o.broken = true; o.lit = false; }
    }
  });

  function maybeEvent(st, dtMin) {
    if (st.pendingEvent || st.gameOver) return;
    st.eventTimer -= dtMin;
    if (st.eventTimer > 0) return;
    st.eventTimer = BK.irange(5 * 60, 11 * 60);
    const pool = BK.EVENTS.filter(ev => st.day >= (ev.minDay || 1) && (!ev.cond || ev.cond(st)));
    if (!pool.length) return;
    const ev = BK.weightedPick(pool);
    st.pendingEvent = ev;
    st.paused = true;
    if (BK.UI) BK.UI.showEvent(ev);
  }

  BK.resolveEvent = function (st, ev, choiceIdx) {
    const c = ev.choices[choiceIdx];
    st.pendingEvent = null;
    st.paused = false;
    if (c && c.fx) c.fx(st, evtApi(st));
    BK.Audio.sfx('click');
  };

  // ============================================================ passives ===
  function updatePassives(st, dtMin) {
    const hours = dtMin / 60;
    const caps = BK.caps(st);
    for (const o of st.objects) {
      const def = BK.OBJECTS[o.type];
      if (!def || !def.passive || o.broken) continue;
      const ps = def.passive;
      if (ps.needPower && !o.lit) continue;
      if (def.power < 0 && (st.res.fuel || 0) <= 0) continue;
      let ok = true;
      if (ps.use) {
        for (const k in ps.use) if ((st.res[k] || 0) < ps.use[k] * hours) ok = false;
        if (ok) for (const k in ps.use) st.res[k] -= ps.use[k] * hours;
      }
      if (ok && ps.make) for (const k in ps.make) st.res[k] = BK.clamp((st.res[k] || 0) + ps.make[k] * hours, 0, caps[k]);
    }
    if ((st.res.fuel || 0) <= 0 && !st.fuelWarned) {
      st.fuelWarned = true;
      BK.log(st, 'The generator coughs and dies. No fuel.', 'bad');
    }
    if ((st.res.fuel || 0) > 0) st.fuelWarned = false;
  }

  // ================================================================ update =
  S.update = function (st, dt) {
    st.tSec += dt;
    st.map = st.maps[st.mapId];     // resolved once per tick for the renderer
    st.ambientLevel = ambientFor(st);

    if (!st.paused && !st.gameOver) {
      const dtMin = dt * MIN_PER_SEC * st.speed;
      const prevDay = st.day;
      st.time.minutes += dtMin;
      st.day = Math.floor(st.time.minutes / 1440) + 1;
      if (st.day !== prevDay) {
        st.stats.daysSurvived = st.day - 1;
        BK.log(st, 'Day ' + st.day + '. Everyone is still here.' , 'ok');
        for (const c of st.crew) if (c.alive) c.battery = Math.min(100, c.battery + 40);
      }

      updatePower(st);
      updatePassives(st, dtMin);

      for (const e of st.crew) {
        if (!e.alive) continue;
        updateNeeds(st, e, dtMin);
        if (e.act) runAct(st, e, dtMin);
        else freeWill(st, e);
      }

      maybeEvent(st, dtMin);
      BK.Horror.update(st, dt, dtMin);

      st.autosaveTimer += dtMin;
      if (st.autosaveTimer > 120) { st.autosaveTimer = 0; BK.save(st); }
    }

    // Movement runs for every map so the crew you left behind keeps living,
    // and it keeps running while a card is up so the world never freezes mid-step.
    for (const e of st.entities) {
      if (!e.alive || e.kind !== 'survivor') continue;   // horror.js drives its own
      if (e.hallucination) continue;                     // these do not walk, they wait
      if (st.paused && e !== st.player) continue;
      moveEntity(st, e, dt);
    }

    gatherLights(st);

    // vision
    const p = st.player;
    let vision = st.maps[st.mapId].outdoor ? 26 : 15;
    if (BK.trait(p, 'darkeyes')) vision += 3;
    BK.Render.computeFOV(st.maps[st.mapId], p.x, p.y, vision);

    // what is the player looking at?
    st.focusProp = BK.findFocus(st);

    st.staticBurst = Math.max(0, st.staticBurst - dt * 2);
    BK.Audio.setDread(st.dread, !st.maps[st.mapId].outdoor);
  };

  BK.findFocus = function (st) {
    const p = st.player, map = st.maps[st.mapId];
    let best = null, bestD = 2.2;
    for (const pr of map.props) {
      if (pr.kind === 'debris' || pr.kind === 'fixture') continue;
      const cx = pr.x + ((pr.w || 1) - 1) / 2, cy = pr.y + ((pr.h || 1) - 1) / 2;
      const d = BK.dist(p.x, p.y, cx, cy);
      if (d < bestD) { bestD = d; best = pr; }
    }
    return best;
  };

  // ================================================================= save ==
  const SAVE_KEY = 'bunker86.save.v1';

  function rle(arr) {
    const out = [];
    let cur = arr[0], n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === cur) n++;
      else { out.push(cur, n); cur = arr[i]; n = 1; }
    }
    out.push(cur, n);
    return out;
  }
  function unrle(list, len) {
    const a = new Uint8Array(len);
    let i = 0;
    for (let k = 0; k < list.length; k += 2) {
      const v = list[k], n = list[k + 1];
      for (let j = 0; j < n && i < len; j++) a[i++] = v;
    }
    return a;
  }

  BK.save = function (st) {
    try {
      const data = {
        v: 1, seed: st.seed, mapId: st.mapId, time: st.time, day: st.day,
        res: st.res, flags: st.flags, dread: st.dread, stats: st.stats,
        eventTimer: st.eventTimer, crt: st.crt, zoom: st.zoom,
        log: st.log.slice(-40),
        crew: st.crew.map(c => ({
          id: c.id, name: c.name, first: c.first, look: c.look, map: c.map, x: c.x, y: c.y,
          needs: c.needs, health: c.health, maxHealth: c.maxHealth, rads: c.rads, sanity: c.sanity,
          skills: c.skills, skillXP: c.skillXP, traits: c.traits, rel: c.rel, alive: c.alive,
          auto: c.auto, pack: c.pack, battery: c.battery, flashlight: c.flashlight, breakdown: c.breakdown
        })),
        playerId: st.player ? st.player.id : null,
        maps: {}
      };
      for (const id in st.maps) {
        const m = st.maps[id];
        data.maps[id] = {
          seen: rle(m.seen),
          props: m.props.map(p => {
            const q = {};
            for (const k in p) { const v = p[k]; if (typeof v !== 'function' && k !== 'sheet') q[k] = v; }
            return q;
          })
        };
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) { return false; }
  };

  BK.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  BK.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  };

  BK.load = function () {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
    if (!data || data.v !== 1) return null;
    const st = BK.newState(data.seed);
    st.mapId = data.mapId; st.time = data.time; st.day = data.day;
    st.res = data.res; st.flags = data.flags || {}; st.dread = data.dread || 0;
    st.stats = data.stats || st.stats; st.eventTimer = data.eventTimer;
    st.crt = data.crt !== false; st.zoom = data.zoom || 1;
    st.log = data.log || [];

    for (const id in data.maps) {
      const m = st.maps[id], d = data.maps[id];
      m.seen = unrle(d.seen, m.w * m.h);
      m.props = d.props;
      BK.rebuildGrids(m);
    }
    st.objects = st.maps.bunker.props.filter(p => p.kind === 'furniture');

    st.crew = data.crew.map(c => {
      const e = Object.assign(makeSurvivor(st), c);
      e.sheet = null; e.act = null; e.path = null; e.actIcon = null;
      return e;
    });
    st.entities = st.crew.slice();
    st.player = st.crew.find(c => c.id === data.playerId && c.alive) || st.crew.find(c => c.alive) || st.crew[0];
    BK.Horror.reset(st);
    return st;
  };
})(window.BK = window.BK || {});
