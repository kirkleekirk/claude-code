/* BUNKER '86 — dread, hallucination, and the thing that keeps its distance. */
(function (BK) {
  'use strict';

  const H = BK.Horror = {};

  H.reset = function (st) {
    st.watcher = null;
    st.hallucinations = [];
    st.scareTimer = 90;
    st.whisperTimer = 40;
    st.flickerT = 0;
    st.entities = st.entities.filter(e => e.kind === 'survivor');
  };

  // ---------------------------------------------------------------- dread --
  function updateDread(st, dtMin) {
    const map = st.maps[st.mapId];
    const p = st.player;
    const hours = dtMin / 60;
    let rate = 0;

    if (map.outdoor) rate += BK.isNight(st) ? 7.0 : 1.2;
    else rate += BK.isNight(st) ? 1.4 : -1.6;

    // the dark feeds it
    const light = BK.lightAt(st, p.x, p.y);
    if (light < 0.15) rate += 4.0;
    else if (light > 0.5) rate -= 2.5;

    // a frayed crew feeds it
    const alive = st.crew.filter(c => c.alive);
    const avgSan = alive.length ? alive.reduce((a, c) => a + c.sanity, 0) / alive.length : 0;
    rate += (55 - avgSan) * 0.06;

    // it loses interest in daylight and full rooms
    if (!map.outdoor && !BK.isNight(st) && avgSan > 60) rate -= 2.0;

    st.dread = BK.clamp(st.dread + rate * hours, 0, 100);
  }

  // -------------------------------------------------------------- watcher --
  function phaseFor(dread) {
    if (dread < 22) return 0;
    if (dread < 48) return 1;
    if (dread < 76) return 2;
    return 3;
  }

  function spawnWatcher(st) {
    const map = st.maps[st.mapId];
    const p = st.player;
    // put it at the far edge of sight, somewhere the player is not looking
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 9;
      const x = Math.floor(p.x + Math.cos(ang) * dist);
      const y = Math.floor(p.y + Math.sin(ang) * dist);
      if (!BK.inBounds(map, x, y) || BK.isBlocked(map, x, y)) continue;
      const w = {
        id: BK.uid(), kind: 'watcher', map: st.mapId,
        x: x + 0.5, y: y + 0.5, alive: true,
        opacity: 0, scale: 1.3, seenTimer: 0, repathT: 0, path: null, speed: 1.9,
        dir: 0, frame: 0, animT: 0
      };
      st.watcher = w;
      st.entities.push(w);
      return w;
    }
    return null;
  }

  function despawnWatcher(st) {
    if (!st.watcher) return;
    st.entities = st.entities.filter(e => e !== st.watcher);
    st.watcher = null;
  }

  function isVisibleTo(st, e) {
    const map = st.maps[st.mapId];
    const x = Math.floor(e.x), y = Math.floor(e.y);
    if (!BK.inBounds(map, x, y)) return false;
    return map.vis[y * map.w + x] > 0.35;
  }

  function updateWatcher(st, dt, dtMin) {
    const phase = phaseFor(st.dread);
    const map = st.maps[st.mapId];
    const p = st.player;

    if (phase === 0) {
      if (st.watcher) {
        st.watcher.opacity -= dt * 0.8;
        if (st.watcher.opacity <= 0) despawnWatcher(st);
      }
      return;
    }
    if (!st.watcher) {
      // it does not arrive instantly; it is already there when you turn around
      if (Math.random() < dt * 0.06 * phase) spawnWatcher(st);
      return;
    }

    const w = st.watcher;
    w.map = st.mapId;
    const seen = isVisibleTo(st, w);
    const d = BK.dist(w.x, w.y, p.x, p.y);

    // fade in only once it is inside the world you can perceive
    w.opacity = BK.lerp(w.opacity, seen ? 1 : 0.85, Math.min(1, dt * 2));

    if (seen) {
      w.seenTimer += dt;
      if (!w.announced) {
        w.announced = true;
        st.stats.watcherSeen++;
        BK.log(st, map.outdoor
          ? 'There is something standing at the end of the street. It is facing this way.'
          : 'Something is in the corridor. It is too tall for the corridor.', 'bad');
        BK.Audio.sting(0.5 + phase * 0.15);
        BK.Render.shake(0.25, 0.5);
        st.staticBurst = 1;
      }
      // being looked at costs you
      const drain = (phase * 2.2) * (1 - BK.clamp(d / 20, 0, 1)) * (dtMin / 60) * 14;
      p.sanity = BK.clamp(p.sanity - drain, 0, 100);
      if (Math.random() < dt * 0.5) BK.Audio.sfx('geiger');
      // it does not move while observed
      w.path = null;
    } else {
      w.seenTimer = 0;
      w.announced = false;
      // unobserved: it closes the distance
      const want = phase === 1 ? 16 : phase === 2 ? 9 : 1.2;
      if (d > want + 1) {
        w.repathT -= dt;
        if (!w.path || w.repathT <= 0) {
          w.repathT = 1.2;
          w.path = BK.findPath(map, w.x, w.y, p.x, p.y, 2500);
        }
        if (w.path && w.path.length) {
          const n = w.path[0];
          const dx = n.x - w.x, dy = n.y - w.y, len = Math.hypot(dx, dy) || 1;
          const sp = w.speed * (phase === 3 ? 1.7 : 1) * dt;
          w.x += dx / len * sp; w.y += dy / len * sp;
          if (len < 0.2) w.path.shift();
        }
      } else if (d < want - 2 && phase < 3) {
        // it also will not be crowded
        const dx = w.x - p.x, dy = w.y - p.y, len = Math.hypot(dx, dy) || 1;
        w.x += dx / len * w.speed * dt; w.y += dy / len * w.speed * dt;
      }
    }

    // contact
    if (d < 1.3 && phase >= 3) {
      contact(st, p);
      despawnWatcher(st);
    }

    // it gives up when the lights come on
    if (BK.lightAt(st, w.x, w.y) > 0.65 && phase < 3 && Math.random() < dt * 0.4) {
      despawnWatcher(st);
    }
  }

  function contact(st, p) {
    BK.Render.doFlash(1);
    BK.Render.shake(1.2, 1.2);
    BK.Audio.sting(1.2);
    st.staticBurst = 1;
    p.sanity = 0;
    p.health = Math.max(1, p.health - 32);
    p.rads = BK.clamp(p.rads + 18, 0, 100);
    st.dread = 28;
    BK.log(st, 'It is close enough to touch and then it is not there. Your dosimeter is screaming and you are on the floor.', 'bad');
    for (const c of st.crew) if (c.alive && c !== p) c.sanity = Math.max(0, c.sanity - 14);
  }

  // -------------------------------------------------------- hallucinations --
  function spawnHallucination(st) {
    const map = st.maps[st.mapId];
    const p = st.player;
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 6;
      const x = Math.floor(p.x + Math.cos(ang) * dist), y = Math.floor(p.y + Math.sin(ang) * dist);
      if (!BK.inBounds(map, x, y) || BK.isBlocked(map, x, y)) continue;
      const g = {
        id: BK.uid(), kind: 'survivor', hallucination: true, map: st.mapId,
        x: x + 0.5, y: y + 0.5, alive: true, dir: BK.irange(0, 3), frame: 0,
        look: BK.randomLook(), ttl: 5 + Math.random() * 6, scale: 1
      };
      st.entities.push(g);
      st.hallucinations.push(g);
      BK.log(st, BK.pick(BK.HALLUCINATIONS), 'bad');
      BK.Audio.whisper();
      return;
    }
  }

  function updateHallucinations(st, dt) {
    const p = st.player;
    for (const g of st.hallucinations.slice()) {
      g.ttl -= dt;
      // they never let you get close
      if (BK.dist(g.x, g.y, p.x, p.y) < 3.5) g.ttl = Math.min(g.ttl, 0.15);
      if (g.ttl <= 0) {
        st.entities = st.entities.filter(e => e !== g);
        st.hallucinations = st.hallucinations.filter(e => e !== g);
        st.staticBurst = Math.max(st.staticBurst, 0.6);
      }
    }
  }

  // ---------------------------------------------------------------- scares --
  const SCARES = [
    { w: 14, min: 0, fn: (st) => { BK.Audio.sfx('step'); BK.log(st, 'Footsteps in the next room. Everyone is accounted for.', 'warn'); } },
    { w: 12, min: 15, fn: (st) => { st.flickerT = 2.2; BK.log(st, 'The lights stutter.', 'warn'); } },
    { w: 10, min: 20, fn: (st) => { BK.Audio.knock(); BK.log(st, 'Three knocks on the hatch. Then nothing.', 'bad'); st.dread += 4; } },
    { w: 10, min: 25, fn: (st) => { BK.Audio.whisper(); BK.log(st, '"' + BK.pick(BK.WHISPERS) + '"', 'bad'); st.player.sanity = Math.max(0, st.player.sanity - 4); } },
    { w: 8, min: 35, fn: (st) => { st.staticBurst = 1; BK.Audio.sfx('radio'); BK.log(st, 'Every speaker in the shelter hisses at once: ' + BK.pick(BK.NUMBERS_STATION), 'bad'); } },
    { w: 8, min: 40, fn: (st) => {
      // a door you are sure you closed
      const map = st.maps[st.mapId];
      const doors = map.props.filter(p => p.kind === 'door');
      if (!doors.length) return;
      const d = BK.pick(doors);
      d.open = !d.open; d.blocks = !d.open; d.opaque = !d.open;
      BK.rebuildGrids(map);
      BK.Audio.sfx('door');
      BK.log(st, 'A door moves somewhere behind you.', 'bad');
    } },
    { w: 7, min: 45, fn: (st) => { spawnHallucination(st); } },
    { w: 6, min: 55, fn: (st) => {
      BK.Render.doFlash(0.5); BK.Audio.sting(0.8); st.staticBurst = 1;
      BK.log(st, 'For a moment the shelter is somewhere else and then it is not.', 'bad');
      for (const c of st.crew) if (c.alive) c.sanity = Math.max(0, c.sanity - 7);
    } },
    { w: 5, min: 60, fn: (st) => {
      const alive = st.crew.filter(c => c.alive && c !== st.player);
      if (!alive.length) return;
      const c = BK.pick(alive);
      BK.log(st, c.first + ' is standing in the dark facing the wall. When you say their name they answer from behind you.', 'bad');
      st.player.sanity = Math.max(0, st.player.sanity - 12);
      BK.Audio.whisper(0);
      st.dread += 6;
    } }
  ];

  function maybeScare(st, dt) {
    st.scareTimer -= dt * (1 + st.dread / 40);
    if (st.scareTimer > 0) return;
    st.scareTimer = 55 + Math.random() * 90 - st.dread * 0.35;
    const pool = SCARES.filter(s => st.dread >= s.min);
    if (!pool.length) return;
    const pick = BK.weightedPick(pool.map(s => ({ w: s.w, s: s })), 'w');
    pick.s.fn(st);
  }

  function maybeWhisper(st, dt) {
    const p = st.player;
    const strain = 1 - p.sanity / 100;
    if (strain < 0.4) return;
    st.whisperTimer -= dt * strain * 2;
    if (st.whisperTimer > 0) return;
    st.whisperTimer = 20 + Math.random() * 40;
    BK.Audio.whisper();
    if (Math.random() < 0.4) BK.log(st, '"' + BK.pick(BK.WHISPERS) + '"', 'bad');
  }

  // ----------------------------------------------------------------- tick --
  H.update = function (st, dt, dtMin) {
    if (!st.watcher && st.entities.indexOf(st.watcher) === -1) { /* nothing */ }
    updateDread(st, dtMin);
    updateWatcher(st, dt, dtMin);
    updateHallucinations(st, dt);
    maybeScare(st, dt);
    maybeWhisper(st, dt);
    if (st.flickerT > 0) st.flickerT -= dt;

    // geiger ticking scales with the player's dose
    st.geigerT = (st.geigerT || 0) - dt;
    if (st.geigerT <= 0) {
      const rads = st.player.rads + (st.maps[st.mapId].outdoor ? BK.radAt(st.maps[st.mapId], st.player.x, st.player.y) * 3 : 0);
      if (rads > 6) {
        BK.Audio.sfx('geiger');
        st.geigerT = BK.clamp(2.4 - rads / 45, 0.06, 2.4);
      } else st.geigerT = 1.5;
    }

    // heartbeat when badly hurt
    st.heartT = (st.heartT || 0) - dt;
    if (st.heartT <= 0 && st.player.health < BK.effMaxHealth(st.player) * 0.35) {
      BK.Audio.sfx('heart');
      st.heartT = 0.85;
    } else if (st.heartT <= 0) st.heartT = 1;
  };
})(window.BK = window.BK || {});
