// Soak: a 3v3 bot match on hard for 10 game-minutes. Nobody may go NaN, leave the arena, sink into
// the ground, get stuck in an ability, a tumble or a carry, or break the HP/ult bounds; dead heroes
// respawn on time; scene objects, effects and projectiles stay bounded; the bots actually fight.
const MINUTES = 10;

T.test(`3v3 bots on hard for ${MINUTES} game-minutes`, () => {
  // every hero on the field, as the game's lineups do: one of each role a side
  const LINEUPS = [['invincible', 'eve', 'omniman'], ['rex', 'robot', 'battlebeast']];
  const spec = [];
  for (const team of [0, 1]) for (const [i, key] of LINEUPS[team].entries()) spec.push({ key, team, bot: true, at: [(i - 1) * 6, 0, team ? 48 : -48], face: [0, team ? -1 : 1] });
  spec[0].player = true; spec[0].bot = false;
  const hs = T.stage(spec, { bots: 'active', settings: { difficulty: 'hard' } });
  // the player's hero is driven by a bot too, as in the game's autobot mode
  const Bot = T.g.bots[0].constructor;
  T.g.bots.push(T.g.playerBot = new Bot(hs[0], T.w));
  const A = T.ARENA, w = T.w, fx = T.g.fx;
  const boxes = w.obstacles.filter((o) => o.type === 'box');
  const st = new Map(hs.map((h) => [h, { ovr: 0, tumble: 0, carried: 0, dead: 0, maxOvr: 0, maxTumble: 0, still: 0, maxStill: 0, last: h.pos.clone() }]));
  const counts = () => ({
    scene: T.g.scene.children.length - fx.decals.length, items: fx.items.length, trails: fx.trails.length,
    updaters: fx.updaters.length, projectiles: w.projectiles.length, zones: w.zones.length, barriers: w.barriers.length, decals: fx.decals.length,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
  });
  const issues = {};
  const flag = (h, msg) => { const k = `${h.key}/${h.team}: ${msg.replace(/[-\d.]+/g, '#')}`; if (!issues[k]) issues[k] = { n: 0, first: `${(w.time / 60).toFixed(2)} min ${h.key}/${h.team}: ${msg}` }; issues[k].n++; };
  const peak = { projectiles: 0, items: 0, updaters: 0 };
  let early = null, stepMs = 0, worstStep = 0;
  const frames = MINUTES * 3600, dt = 1 / 60;
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    T.run(1);
    const ms = performance.now() - t0; stepMs += ms; worstStep = Math.max(worstStep, ms);
    peak.projectiles = Math.max(peak.projectiles, w.projectiles.length);
    peak.items = Math.max(peak.items, fx.items.length);
    peak.updaters = Math.max(peak.updaters, fx.updaters.length);
    if (f === 3600) early = counts();
    for (const h of hs) {
      const s = st.get(h);
      // durations of states that must end
      s.ovr = h.override && !h.dead ? s.ovr + dt : 0; s.maxOvr = Math.max(s.maxOvr, s.ovr);
      s.tumble = h.mode === 'tumble' && !h.carriedBy && !h.dead ? s.tumble + dt : 0; s.maxTumble = Math.max(s.maxTumble, s.tumble);
      s.carried = h.carriedBy ? s.carried + dt : 0;
      s.dead = h.dead ? s.dead + dt : 0;
      if (s.ovr > 12) flag(h, `override stuck for ${s.ovr.toFixed(1)} s`);
      if (s.tumble > 6) flag(h, `tumbling for ${s.tumble.toFixed(1)} s`);
      if (s.carried > 8) flag(h, `carried for ${s.carried.toFixed(1)} s`);
      if (s.dead > T.RULES.respawn + 1) flag(h, `dead for ${s.dead.toFixed(1)} s`);
      if (f % 30) continue;
      if (![h.pos.x, h.pos.y, h.pos.z, h.vel.x, h.vel.y, h.vel.z, h.hp, h.ult].every(Number.isFinite)) { flag(h, 'NaN state'); continue; }
      const r = Math.hypot(h.pos.x, h.pos.z);
      if (r > A.boundR + 0.5) flag(h, `outside the arena (r ${r.toFixed(1)})`);
      const ultRise = h.override && h.override.phase && h.override.phase !== 'fall' && h.key === 'invincible';
      if (h.pos.y > A.ceiling + (ultRise ? 80 : 0.5)) flag(h, `above the ceiling (${h.pos.y.toFixed(1)})`);
      if (!h.dead && h.pos.y < w.groundAt(h.pos.x, h.pos.z) - 0.15) flag(h, `below the ground (${h.pos.y.toFixed(2)}, ground ${w.groundAt(h.pos.x, h.pos.z).toFixed(2)}) [${h.mode}${h.override ? '/override ' + (h.override.phase || (h.override.toPoint ? 'travel-to' : h.override.constructor.name)) : ''}${h.carriedBy ? '/carried by ' + h.carriedBy.key : ''}${h.anim.action ? '/' + h.anim.action.clip.name : ''}, vel ${h.vel.toArray().map((v) => v.toFixed(1))}]`);
      const box = boxes.find((o) => h.pos.x > o.min.x + 0.05 && h.pos.x < o.max.x - 0.05 && h.pos.z > o.min.z + 0.05 && h.pos.z < o.max.z - 0.05 && h.pos.y < o.max.y - 0.2 && h.pos.y + 1 > o.min.y);
      if (!h.dead && box) flag(h, `inside cover at (${h.pos.x.toFixed(1)}, ${h.pos.y.toFixed(2)}, ${h.pos.z.toFixed(1)})`);
      if (h.hp < 0 || h.hp > h.maxHp + 0.01) flag(h, `hp out of range (${h.hp.toFixed(1)})`);
      if (h.ult < 0 || h.ult > h.def.ultCost + 0.01) flag(h, `ult out of range (${h.ult.toFixed(1)})`);
      if (h.overhealth < 0) flag(h, 'negative overhealth');
      if (h.bubble && h.bubble.t > 5.01) flag(h, `bubble timer ${h.bubble.t.toFixed(2)}`);
      // (skipped while the body is still visibly rotating upright out of flight: regular landings are
      // checked frame by frame in transitions.test.js and snaps by the pop check)
      const tiltNow = 2 * Math.acos(Math.min(1, Math.abs(h.visual.quaternion.w)));
      if (!h.dead && tiltNow < 0.7) for (const m of T.poseIssues(h)) flag(h, `${m} [${h.mode}${h.override ? '/override' : ''}${h.anim.action ? '/' + h.anim.action.clip.name : ''}${h.anim.fading.length ? ' fading ' + h.anim.fading.map((a) => a.clip.name).join(',') : ''}, y ${h.pos.y.toFixed(2)} ground ${h.groundY.toFixed(2)}, tilt ${(2 * Math.acos(Math.min(1, Math.abs(h.visual.quaternion.w))) * 57.3).toFixed(0)}°, move ${h.anim.moveBlend.toFixed(2)}, fly ${h.anim.flyBlend.toFixed(2)}, air ${h.anim.airBlend.toFixed(2)}, speed ${Math.hypot(h.vel.x, h.vel.z).toFixed(1)}, vy ${h.vel.y.toFixed(1)}]`);
      if (T.boneNaN(h)) flag(h, 'NaN bones');
      // standing still for a long time while alive (stuck on geometry?)
      s.still = !h.dead && h.pos.distanceTo(s.last) < 0.05 ? s.still + 0.5 : 0; s.maxStill = Math.max(s.maxStill, s.still);
      s.last.copy(h.pos);
      if (s.still > 25) flag(h, `has not moved for ${s.still.toFixed(0)} s`);
    }
  }
  const late = counts();
  for (const k in issues) T.fail(`${issues[k].first} (x${issues[k].n})`);
  // bounded resources: the end of the match must not hold far more than minute one did
  for (const k of ['scene', 'items', 'trails', 'updaters', 'projectiles', 'zones', 'barriers']) {
    if (late[k] > Math.max(early[k] * 2, early[k] + 30)) T.fail(`${k} grew from ${early[k]} (1 min) to ${late[k]} (${MINUTES} min)`);
  }
  T.expect(late.decals <= 64, `${late.decals} decals alive`);
  const kills = T.log.kill.length, ults = T.log.ult.length;
  const byTeam = [0, 1].map((t) => T.log.kill.filter((e) => e.killer && e.killer.team === t).length);
  T.expect(kills >= 10, `only ${kills} kills in ${MINUTES} minutes: are the bots fighting?`);
  T.expect(byTeam[0] > 0 && byTeam[1] > 0, `one-sided match: kills by team ${byTeam}`);
  T.expect(ults >= 2, `only ${ults} ultimates used`);
  const ultBy = {}; for (const e of T.log.ult) ultBy[e.hero.key] = (ultBy[e.hero.key] || 0) + 1;
  T.info(`${kills} kills (team 0: ${byTeam[0]}, team 1: ${byTeam[1]}), ${ults} ults ${JSON.stringify(ultBy)}, score ${w.score}`);
  T.info(`damage by hero: ${hs.map((h) => `${h.key}/${h.team} ${Math.round(T.dmgBy(h))}`).join(', ')}`);
  T.info(`step ${(stepMs / frames).toFixed(2)} ms avg, ${worstStep.toFixed(1)} ms worst; peaks: ${JSON.stringify(peak)}`);
  T.info(`at 1 min ${JSON.stringify(early)}; at ${MINUTES} min ${JSON.stringify(late)}`);
  T.info(`longest override ${Math.max(...[...st.values()].map((s) => s.maxOvr)).toFixed(1)} s, tumble ${Math.max(...[...st.values()].map((s) => s.maxTumble)).toFixed(1)} s, standing still ${Math.max(...[...st.values()].map((s) => s.maxStill)).toFixed(0)} s`);
  T.expect(stepMs / frames < 20, `simulation step averages ${(stepMs / frames).toFixed(1)} ms`);
});
