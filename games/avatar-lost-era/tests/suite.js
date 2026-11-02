/* In-page automated test suite. Injected after the game boots; drives the real game code.
   Every check exercises actual behaviour (simulation, collisions, AI, UI) — no mocks. */
(function () {
  const R = []; let group = '';
  const ok = (name, cond, detail) => { R.push({ group, name, ok: !!cond, detail: cond ? '' : String(detail === undefined ? 'assertion failed' : detail) }); return !!cond; };
  const t = async (name, fn) => { try { const r = await fn(); if (r !== undefined && r !== true) ok(name, false, r); else ok(name, true); } catch (e) { ok(name, false, (e && e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); } };
  const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
  const fin = (v) => Number.isFinite(v);
  const walk = (sec, key = 'KeyW') => { Input.keys[key] = true; tick(sec); Input.keys[key] = false; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tick = (sec, dt = 1 / 30) => { const n = Math.max(1, Math.round(sec / dt)); for (let i = 0; i < n; i++) Main.tick(dt); };
  const P = () => G.player;
  const LOOKS = (nation) => Object.assign(defaultLook(nation), {});
  function closeOverlays() { Dialog.close(); UI.closePanel(); document.getElementById('story').classList.add('hidden'); UI.storyOpen = false; document.getElementById('dead').classList.add('hidden'); document.getElementById('pause').classList.add('hidden'); }
  function fresh(nation = 'fire', home, bg = 'hunter', lookOverride) {
    closeOverlays(); const h = home || Object.keys(NATIONS[nation].homes)[0];
    for (const s of G.structures) { if (s.dispose) s.dispose(); else if (s.m) G.scene.remove(s.m); } G.structures = []; for (const p of G.projectiles) if (p.mesh) G.scene.remove(p.mesh); G.projectiles = [];
    for (const f of G.effects) if (f.end) f.end(); G.effects = []; for (const d of G.drops) G.scene.remove(d.m); G.drops = [];
    G.campfires.filter(c => !c.permanent).forEach(c => c.remove()); G.campfires = G.campfires.filter(c => c.permanent);
    if (G.player) G.scene.remove(G.player.H.root);
    Boot.newGame({ name: 'Tester', nation, home: h, bg, look: Object.assign(LOOKS(nation), lookOverride || {}) });
    document.getElementById('storySkip').click(); Game.cooking = null; G.aimOverride = null; Spawner.timer = 0; G.dayLen = 840; return P();
  }
  function isolate() { for (const e of G.ents) if (e.kind !== 'villager') { if (e.model) G.scene.remove(e.model.root); if (e.H) G.scene.remove(e.H.root); e.removed = true; } G.ents = G.ents.filter(e => e.kind === 'villager'); Spawner.timer = 1e9; }
  function grantAll() { const s = Game.state; for (const id in TECH) if (!TECH[id].late && !s.learned.includes(id)) s.learned.push(id); for (const e of ELEMENTS) if (e !== P().native && !s.awakened.includes(e)) s.awakened.push(e); P().maxChi = 1e6; P().chi = 1e6; }
  function place(x, z, yaw = 0) { const p = P(); p.pos.set(x, groundH(x, z), z); p.vel.set(0, 0, 0); p.vy = 0; if (p.hv) p.hv.set(0, 0, 0); p.yaw = yaw; G.camYaw = yaw + Math.PI; G.camPitch = -0.1; p.grounded = true; p.swimming = false; p.meditating = false; p.dash = null; }
  function dummy(x, z, species = 'platypusbear') { const d = new Creature(species, x, z); d.sp = Object.assign({}, d.sp, { aggro: 0, speed: 0, prey: false, passive: false }); d.hp = d.maxHp = 1e5; d.name = 'Dummy'; G.ents.push(d); return d; }
  function clearAll() { for (const s of G.structures) { if (s.dispose) s.dispose(); else if (s.m) G.scene.remove(s.m); } G.structures = []; for (const p of G.projectiles) if (p.mesh) G.scene.remove(p.mesh); G.projectiles = []; for (const f of G.effects) if (f.end) f.end(); G.effects = []; }
  function finiteObj(root) { let bad = 0; root.updateMatrixWorld(true); root.traverse(o => { for (const v of o.matrixWorld.elements) if (!fin(v)) bad++; }); return bad === 0; }
  function finiteGeo(g) { for (const k of ['position', 'normal', 'color']) { const a = g.attributes[k]; if (!a) continue; for (let i = 0; i < a.array.length; i++) if (!fin(a.array[i])) return `${k}[${i}] not finite`; } return true; }
  const AFF = AFF_MULT;
  const CASTABLE = Object.keys(TECH).filter(id => !TECH[id].late && TECH[id].kind && TECH[id].kind !== 'passive' && TECH[id].el !== 'avatar');

  window.TH = { tick, sleep, fresh, isolate, grantAll, place, dummy, clearAll, finiteObj, finiteGeo, closeOverlays, walk, CASTABLE };
  window.SUITE = { results: R, async run(only) {
    const want = (g) => !only || !only.length || only.includes(g);

    /* ================= WORLD ================= */
    if (want('world')) { group = 'World';
      await t('height field is finite everywhere', () => { for (const v of HF.h) assert(fin(v), 'NaN height'); });
      for (const m of World.group.children) { if (!m.geometry || m.isSprite) continue; await t(`geometry finite: ${m.name || m.type}`, () => finiteGeo(m.geometry)); }
      for (const m of World.group.children.filter(m => m.isInstancedMesh)) await t(`instance matrices finite: ${m.name}`, () => { for (const v of m.instanceMatrix.array) assert(fin(v)); });
      for (const k in LOC) { if (k === 'lake') continue; await t(`landmark above water: ${LOC[k].name}`, () => terrainH(LOC[k].x, LOC[k].z) > 0.3 || `h=${terrainH(LOC[k].x, LOC[k].z).toFixed(2)}`); }
      await t('Lake Yue is water', () => terrainH(LOC.lake.x, LOC.lake.z) < -2);
      for (const [i, p] of RIVER.entries()) await t(`river point ${i} is under water`, () => terrainH(p[0], p[1]) < -0.5 || `h=${terrainH(p[0], p[1]).toFixed(2)}`);
      for (const [ri, rd] of ROADS.entries()) await t(`road ${ri} stays dry (except the bridge)`, () => { let wet = 0; for (let i = 0; i < rd.length - 1; i++) { const L = Math.hypot(rd[i + 1][0] - rd[i][0], rd[i + 1][1] - rd[i][1]); for (let s = 0; s <= L; s += 4) { const u = s / L; const x = rd[i][0] + (rd[i + 1][0] - rd[i][0]) * u, z = rd[i][1] + (rd[i + 1][1] - rd[i][1]) * u; if (groundH(x, z) < 0 && Math.hypot(x + 19, z - 148) > 14 && Math.hypot(x, z) < 290) wet++; } } return wet === 0 || `${wet} wet samples`; });
      await t('village plateau is flat (<2.5m range)', () => { let mn = 1e9, mx = -1e9; for (let a = 0; a < 6.28; a += 0.3) for (let r = 0; r < 30; r += 3) { const h = terrainH(Math.cos(a) * r, Math.sin(a) * r); mn = Math.min(mn, h); mx = Math.max(mx, h); } return mx - mn < 2.5 || `range ${(mx - mn).toFixed(2)}`; });
      await t('minimap image baked with varied colour', () => { const c = World.minimapImg; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = new Set(); for (let i = 0; i < d.length; i += 4000) s.add(d[i] >> 4 << 8 | d[i + 1] >> 4); return c.width === 768 && s.size > 20 || `colours ${s.size}`; });
      await t('vegetation populated', () => { const v = World.vegCounts; return v.broad > 300 && v.pine > 200 && v.rock > 200 && v.bush > 60 && v.bamboo > 100 && v.reed > 200 || JSON.stringify(v); });
      for (const z of ['shore', 'meadow', 'forest', 'plains', 'river', 'highforest', 'crags']) await t(`spawn zone has room: ${z}`, () => { let n = 0; for (let i = 0; i < 40; i++) if (Spawner.point(z)) n++; return n >= 35 || `${n}/40`; });

      fresh('fire'); isolate();
      await t('bridge deck is walkable over the river', () => { place(-20.3, 158.5, Math.atan2(0.14, -0.99)); walk(4.5); const p = P(); return (!p.swimming && p.pos.z < 140) || `swim=${p.swimming} z=${p.pos.z.toFixed(1)} y=${p.pos.y.toFixed(2)}`; });
      await t('houses block the player', () => { const h = World.houses[0]; const L = Math.hypot(h.x, h.z); const dx = h.x / L, dz = h.z / L; place(h.x + dx * 11, h.z + dz * 11, Math.atan2(-dx, -dz)); const d0 = Math.hypot(P().pos.x - h.x, P().pos.z - h.z); walk(5); const dist = Math.hypot(P().pos.x - h.x, P().pos.z - h.z); return (dist < d0 - 4 && dist > Math.min(h.w, h.d) / 2) || `from ${d0.toFixed(1)} reached ${dist.toFixed(2)} from centre`; });
      await t('Sun Warrior stair climbs to the top platform', () => { const L = LOC.sunruins; place(L.x + 14.5, L.z, -Math.PI / 2); walk(3.4); const top = World.eternalFlame.y - 1.2; return Math.abs(P().pos.y - top) < 0.7 || `y=${P().pos.y.toFixed(2)} top=${top.toFixed(2)}`; });
      await t('world edge holds the player in', () => { place(280, 0, Math.PI / 2); walk(10); return Math.hypot(P().pos.x, P().pos.z) <= 300.5 && Math.hypot(P().pos.x, P().pos.z) > 290; });
      await t('swimming in deep water', () => { place(-80, 140, 0); tick(1); return P().swimming || `y=${P().pos.y}`; });
      Input.keys = {};
    }

    /* ================= CHARACTER CREATION ================= */
    if (want('creation')) { group = 'Creation';
      for (const n of Object.keys(NATIONS)) for (const h of Object.keys(NATIONS[n].homes)) for (const b of Object.keys(BACKGROUNDS)) await t(`new life: ${n}/${h}/${b}`, () => {
        const p = fresh(n, h, b); const el = NATIONS[n].element; const s = Game.state;
        assert(G.mode === 'play', 'mode ' + G.mode); assert(p.native === el, 'native'); assert(p.element === el, 'element');
        for (const id of STARTING[el]) assert(s.learned.includes(id) && Game.has(id), 'start tech ' + id); assert(s.learned.includes('meditation'), 'meditation');
        for (const e of ELEMENTS) if (e !== el) assert(!Game.elementOpen(e), 'sealed ' + e);
        for (const k in BACKGROUNDS[b].items) assert(Game.count(k) >= BACKGROUNDS[b].items[k], 'bg item ' + k); assert(Game.count('copper') >= 10 && Game.count('wood') === 2, 'kit');
        assert((el === 'fire') === (Game.count('stone') === 0), 'flint stone'); assert(p.maxHp === 100 + (BACKGROUNDS[b].perk.hp || 0), 'hp perk'); assert(p.waterMax === 3 + (BACKGROUNDS[b].perk.skin || 0), 'skin perk');
        assert(s.activeQuest === 'arrival', 'quest'); assert(finiteObj(p.H.root), 'model'); assert(p.perk === NATIONS[n].homes[h].bonus, 'home perk');
        assert(PAST_AVATARS[prevElement(el)].name, 'predecessor');
      });
      for (const n of Object.keys(NATIONS)) await t(`creator UI flow: ${n}`, () => {
        closeOverlays(); if (G.player) G.scene.remove(G.player.H.root); Creator.open(); document.querySelector(`.ncard[data-n="${n}"]`).click(); assert(Creator.profile.nation === n);
        document.querySelector('#creator .tabs button[data-t="looks"]').click(); document.querySelectorAll('[data-hair]')[2].click(); document.querySelectorAll('.sw')[3].click(); document.querySelectorAll('[data-o]')[1].click();
        document.querySelector('#creator .tabs button[data-t="name"]').click(); document.querySelector('[data-nm]').click(); assert(Creator.profile.name.length > 0, 'name');
        tick(0.2); document.getElementById('cNext').click(); assert(document.getElementById('creator').classList.contains('hidden'), 'creator closed'); document.getElementById('storySkip').click();
        return (G.mode === 'play' && P().native === NATIONS[n].element && P().look.outfit === 1) || `mode ${G.mode}`;
      });
      await t('creator refuses an empty name', () => { closeOverlays(); Creator.open(); Creator.tab = 'name'; Creator.profile.name = ''; Creator.render(); document.getElementById('cNext').click(); const still = !document.getElementById('creator').classList.contains('hidden'); document.getElementById('creator').classList.add('hidden'); G.scene.remove(Creator.model.root); Creator.model = null; G.mode = 'play'; return still; });
      for (const n of Object.keys(NATIONS)) for (const hs of Object.keys(HAIR_STYLES)) for (const body of ['A', 'B']) await t(`model ${n} / ${hs} / frame ${body}`, () => { const H = buildHumanoid(Object.assign(defaultLook(n), { hair: hs, body, beard: hs === 'long', arrows: n === 'air' })); for (let i = 0; i < 20; i++) animateHumanoid(H, 0.05, { speed: i % 7, grounded: true, combat: i > 10, element: NATIONS[n].element }); return finiteObj(H.root); });
    }

    /* ================= RULES: affinity, chi, trials, costs ================= */
    if (want('rules')) { group = 'Rules';
      for (const nat of ELEMENTS) { fresh(Object.keys(NATIONS).find(k => NATIONS[k].element === nat)); isolate();
        for (const id of CASTABLE) await t(`chi cost ${id} for a ${nat} Avatar`, () => { const tt = TECH[id]; const a = affinity(nat, tt.el); let c = tt.chi * (a === 'opposite' ? 1.25 : a === 'adjacent' ? 1.1 : 1); if (id === 'healing') c *= P().perk.healCost || 1; if (tt.el === 'air') c *= P().perk.airCost || 1; return chiCost(id) === Math.round(c) || `${chiCost(id)} vs ${Math.round(c)}`; });
        for (const id of Object.keys(TECH).filter(i => TECH[i].trial)) await t(`trial & SP scaling ${id} for a ${nat} Avatar`, () => { const tt = TECH[id]; let need, sp;
          if (tt.awaken) { const opp = affinity(nat, tt.awaken) === 'opposite'; need = Math.ceil(tt.trial.n * (opp ? 1.5 : 1)); sp = opp ? 4 : 2; } else { const a = tt.el === 'avatar' ? 'native' : affinity(nat, tt.el); need = Math.ceil(tt.trial.n * AFF[a]); sp = Math.ceil((tt.sp || 1) * AFF[a]); }
          return (Game.trialNeed(id) === need && Game.spCost(id) === sp) || `need ${Game.trialNeed(id)}/${need} sp ${Game.spCost(id)}/${sp}`; });
        await t(`opposite element is sealed until another awakens (${nat})`, () => { const opp = OPPOSITE[nat]; const r1 = Game.lockReason('awaken_' + opp); Game.state.awakened.push(nextElement(nat)); const r2 = Game.lockReason('awaken_' + opp); Game.state.awakened.pop(); return (!!r1 && !r2) || `${r1} / ${r2}`; });
        await t(`native element cannot be "awakened" (${nat})`, () => !!Game.lockReason('awaken_' + nat));
      }
      fresh('water');
      await t('firebending is stronger by day', () => { G.time = 12; const d = dmgMult('fire'); G.time = 23; const n = dmgMult('fire'); return d > n; });
      await t('waterbending is stronger at night', () => { G.time = 12; const d = dmgMult('water'); G.time = 23; G.day = 2; const n = dmgMult('water'); return n > d; });
      await t('full moon empowers waterbending further', () => { G.time = 23; G.day = 1; const full = dmgMult('water'); G.day = 5; const nw = dmgMult('water'); G.day = 1; return full > nw; });
      await t('native element gets a mastery bonus', () => { G.time = 12; return dmgMult('water') > dmgMult('air') * 0.9 * 1.05; });
      await t('levels raise bending power', () => { G.time = 12; const a = dmgMult('air'); Game.state.level = 5; const b = dmgMult('air'); Game.state.level = 1; return b > a; });
    }

    /* ================= TECHNIQUES (real casts against a target) ================= */
    if (want('techniques')) { group = 'Techniques';
      const setup = (el, dist = 8, species) => { const p = fresh('fire'); isolate(); grantAll(); clearAll(); G.time = 12; place(20, 78, -Math.PI / 2); p.element = el; p.water = 99; tick(0.05); const d = dummy(20 - dist, 78, species); d.yaw = Math.PI / 2; G.aimOverride = { target: d }; tick(0.05); return [p, d]; };
      const dmgTest = (id, el, dist, sec, extra) => t(`${TECH[id].name} hits its target`, () => { const [p, d] = setup(el, dist); const chi0 = p.chi; const ok1 = Tech.cast(id); assert(ok1, 'cast refused'); assert(p.chi < chi0, 'no chi spent'); assert(p.cds[id] > 0, 'no cooldown'); tick(sec, 1 / 60); const dealt = 1e5 - d.hp; if (extra) { const r = extra(p, d); if (r !== true) return r; } return dealt > 0 || 'no damage'; });
      await dmgTest('fire_jab', 'fire', 8, 0.8);
      await dmgTest('fire_blast', 'fire', 8, 1.4, (p, d) => (1e5 - d.hp) > TECH.fire_blast.dmg * 2 || `only ${(1e5 - d.hp).toFixed(1)} (expected 3 blasts)`);
      await dmgTest('fire_arc', 'fire', 4, 0.8, (p, d) => Math.abs(d.pos.x - 16) > 0.3 || 'no knockback');
      await dmgTest('breath_fire', 'fire', 5, 1.4, (p) => p.warmth > 90 || `warmth ${p.warmth}`);
      await dmgTest('rock_toss', 'earth', 9, 1.4);
      await dmgTest('shockwave', 'earth', 5, 1.2, (p, d) => true);
      await dmgTest('water_whip', 'water', 6, 0.6);
      await dmgTest('ice_darts', 'water', 8, 1.0, (p, d) => d.status.slow > 0 || 'not slowed');
      await dmgTest('tidal_push', 'water', 7, 1.0);
      await dmgTest('ice_prison', 'water', 8, 1.0, (p, d) => d.status.frozen > 0 || 'not frozen');
      await dmgTest('air_palm', 'air', 7, 0.8);
      await dmgTest('air_sweep', 'air', 7, 0.8);
      await t('Pillar Launch hurls an aimed enemy skyward', () => { const [p, d] = setup('earth', 8); Tech.cast('earth_pillar'); tick(0.6, 1 / 60); const lift = d.pos.y - terrainH(d.pos.x, d.pos.z); return (lift > 2 && d.hp < 1e5 && d.status.stun > 0) || `lift=${lift.toFixed(2)} hp=${d.hp}`; });
      await t('Pillar Launch vaults you up when nothing is targeted', () => { const [p, d] = setup('earth', 8); G.aimOverride = { point: V3(10, 0, 78) }; tick(1 / 60, 1 / 60); const y0 = p.pos.y; Tech.cast('earth_pillar'); let maxY = y0; for (let i = 0; i < 60; i++) { Main.tick(1 / 60); maxY = Math.max(maxY, p.pos.y); } return maxY - y0 > 4 || `rose ${(maxY - y0).toFixed(2)}m`; });
      await t('Earth Wall rises and blocks a thrown knife', () => { const [p, d] = setup('earth', 12); Tech.cast('earth_wall'); tick(0.9, 1 / 60); assert(G.structures.length === 1, 'no wall'); const from = V3(p.pos.x - 7, p.pos.y + 1.2, p.pos.z); Bending.spawnKnife(from, V3(1, 0, 0), 20, d); const hp0 = p.hp; tick(1.0, 1 / 60); return (p.hp === hp0 && (G.stats.blocked_earth || 0) >= 1) || `hp ${hp0}->${p.hp} blocked ${G.stats.blocked_earth}`; });
      await t('Earth Tent shelters you and keeps predators out', () => { const [p, d] = setup('earth', 30); Tech.cast('rock_shelter'); tick(1.0, 1 / 30); assert(p.sheltered, 'not sheltered'); const bear = new Creature('platypusbear', p.pos.x + 7, p.pos.z); G.ents.push(bear); const hp0 = p.hp; tick(6); const dist = Math.hypot(bear.pos.x - p.pos.x, bear.pos.z - p.pos.z); return (p.hp === hp0 && dist > 2.3) || `hp ${hp0}->${p.hp} bear at ${dist.toFixed(2)}m`; });
      await t('Earth Tent: interact leaves the shelter', () => { const p = P(); assert(p.sheltered, 'precondition'); const it = Game.findInteract(); assert(it && /Leave/.test(it.label), 'no leave prompt: ' + (it && it.label)); it.action(); tick(1); return !p.sheltered; });
      await t('earthbending is impossible mid-air', () => { const [p] = setup('earth', 8); p.pos.y += 5; p.grounded = false; const r = Tech.cast('rock_toss'); return r === false; });
      await t('Air Leap launches you and works once mid-air', () => { const [p] = setup('air', 8); const y0 = p.pos.y; Tech.cast('air_jump'); let top = y0; for (let i = 0; i < 20; i++) { Main.tick(1 / 60); top = Math.max(top, p.pos.y); } p.cds = {}; Input.jump(); const vy = p.vy; return (top - y0 > 1.5 && vy > 5) || `rise ${(top - y0).toFixed(2)} vy ${vy}`; });
      await t('airbenders take no fall damage', () => { const [p] = setup('air', 8); tick(0.3); p.pos.y += 30; p.grounded = false; p.vy = 0; const hp0 = p.hp; tick(3); return p.hp >= hp0 || `hp ${hp0}->${p.hp}`; });
      await t('Wind Step dashes and grants invulnerability', () => { const [p] = setup('air', 8); p.moveDir = V3(0, 0, 1); const z0 = p.pos.z; Tech.cast('wind_step'); const inv = p.invuln > 0; tick(0.4, 1 / 60); return (inv && Math.abs(p.pos.z - z0) > 5) || `moved ${Math.abs(p.pos.z - z0).toFixed(2)} inv ${inv}`; });
      await t('Air Swirl deflects projectiles', () => { const [p, d] = setup('air', 12); Tech.cast('air_shield'); tick(0.2); const hp0 = p.hp; Bending.spawnKnife(V3(p.pos.x - 8, p.pos.y + 1, p.pos.z), V3(1, 0, 0), 20, d); tick(1); return p.hp === hp0 || `hp ${hp0}->${p.hp}`; });
      await t('Healing Waters restores health over time', () => { const [p] = setup('water', 8); p.hp = 30; Tech.cast('healing'); tick(3.2); return p.hp > 60 || `hp ${p.hp.toFixed(1)}`; });
      await t('Draw Water refills the skin by a river', () => { const p = fresh('water'); isolate(); place(95, 128, 0); p.water = 0; p.thirst = 20; const r = Tech.cast('water_draw'); return (r && p.water === p.waterMax && p.thirst > 40) || `r=${r} water ${p.water} thirst ${p.thirst}`; });
      await t('Draw Water fails far from water', () => { const p = fresh('water'); isolate(); place(0, 0, 0); return Tech.cast('water_draw') === false; });
      await t('waterbending spends a skin charge away from water', () => { const p = fresh('water'); isolate(); place(0, 0, 0); p.water = 2; G.aimOverride = { point: V3(0, 4, -10) }; Tech.cast('water_whip'); return p.water === 1 || `water ${p.water}`; });
      await t('waterbending is free next to a river', () => { const p = fresh('water'); isolate(); place(95, 128, 0); p.water = 2; G.aimOverride = { point: V3(95, 5, 118) }; Tech.cast('water_whip'); return p.water === 2 || `water ${p.water}`; });
      await t('waterbending fails with no water and an empty skin', () => { const p = fresh('water'); isolate(); place(0, 0, 0); p.water = 0; return Tech.cast('water_whip') === false; });
      await t('techniques fail without enough chi', () => { const p = fresh('fire'); isolate(); place(0, 0, 0); p.chi = 2; return Tech.cast('fire_jab') === false; });
      await t('cooldown prevents an instant recast', () => { const p = fresh('fire'); isolate(); place(30, 95, 0); G.aimOverride = { point: V3(30, 4, 110) }; const a = Tech.cast('fire_jab'); const b = Tech.cast('fire_jab'); return a && !b; });
      await t('unlearned techniques cannot be cast', () => { fresh('fire'); isolate(); return Tech.cast('rock_toss') === false; });
      await t('Hearth Flame lights a campfire', () => { const p = fresh('fire'); isolate(); place(20, 80, 0); const cf = new Campfire(20, 81.5, false); G.campfires.push(cf); Tech.cast('spark'); return cf.lit; });
      await t('Hearth Flame cooks raw meat in your hands', () => { const p = fresh('fire'); isolate(); place(20, 80, 0); Game.give('meat_raw', 1); Tech.cast('spark'); tick(2); return (Game.count('meat_cooked') >= 3 && Game.count('meat_raw') === 0) || JSON.stringify(Game.state.inv); });
      await t('Hearth Flame makes a hand-light when nothing needs fire', () => { const p = fresh('fire'); isolate(); place(20, 80, 0); Tech.cast('spark'); return p.handFlame > 0; });
      await t('burning damages over time', () => { const [p, d] = setup('fire', 8); d.status.burn = 3; const hp0 = d.hp; tick(2); return d.hp < hp0; });
      G.aimOverride = null;
    }

    /* ================= TRIALS & LEARNING ================= */
    if (want('trials')) { group = 'Trials';
      const learnable = Object.keys(TECH).filter(id => TECH[id].trial && !TECH[id].late);
      for (const id of learnable) await t(`trial gate & ceremony: ${TECH[id].name}`, () => {
        const tt = TECH[id]; const nat = tt.el === 'avatar' ? 'fire' : tt.el; const nation = Object.keys(NATIONS).find(k => NATIONS[k].element === nat); fresh(tt.awaken === 'fire' ? 'water' : nation); isolate();
        const s = Game.state; s.learned = s.learned.filter(x => x !== id); for (const r of (tt.req || [])) if (!s.learned.includes(r)) s.learned.push(r);
        if (tt.awaken && affinity(P().native, tt.awaken) === 'opposite') s.awakened.push(nextElement(P().native));
        s.sp = 20; const need = Game.trialNeed(id); G.stats[tt.trial.stat] = need - 1; assert(!Game.canLearn(id), 'learnable before trial complete');
        G.stats[tt.trial.stat] = need; assert(Game.canLearn(id), 'not learnable after trial: ' + Game.lockReason(id));
        const sp0 = s.sp; assert(Game.learn(id), 'learn failed'); assert(s.sp === sp0 - Game.spCost(id), 'sp');
        assert(document.getElementById('ceremony').classList.contains('show'), 'no ceremony');
        if (tt.awaken) { assert(Game.elementOpen(tt.awaken), 'element not open'); for (const st of STARTING[tt.awaken]) assert(Game.has(st), 'starter ' + st); }
        else assert(Game.has(id) || tt.el === 'avatar', 'not usable');
        tick(4); return true;
      });
      await t('learning needs enough skill points', () => { fresh('fire'); isolate(); Game.state.sp = 0; G.stats.meditate_time = 999; return !Game.canLearn('spirit_sense'); });
      await t('later-journey techniques cannot be learned', () => { fresh('fire'); isolate(); Game.state.sp = 99; return Object.keys(TECH).filter(i => TECH[i].late).every(i => !Game.canLearn(i)); });
      await t('prerequisites are enforced', () => { fresh('fire'); isolate(); Game.state.sp = 99; G.stats.cold_time = 999; return !!Game.lockReason('inner_fire'); });
      await t('completed trial produces a notification', () => { fresh('fire'); isolate(); G.stats.hits_fire = 99; Main.checkTrials(); return (G.flags.trialNotified || []).includes('fire_blast'); });
      const meds = [['sunrise_med', 30, 95, 6.0], ['flame_med', World.eternalFlame.x + 2, World.eternalFlame.z + 2, 12], ['moon_med', LOC.moonpool.x + 2, LOC.moonpool.z + 2, 23], ['cave_med', World.caveCenter.x + 1, World.caveCenter.z + 1, 12], ['peak_med', LOC.bisonpeak.x + 3, LOC.bisonpeak.z + 3, 12]];
      for (const [stat, x, z, time] of meds) await t(`meditation trial counts: ${stat}`, () => { fresh('fire'); isolate(); place(x, z, 0); tick(0.2); G.time = time; G.stats[stat] = 0; Input.meditate(); assert(P().meditating, 'not meditating at ' + groundH(x, z).toFixed(1)); G.dayLen = 1e9; tick(4); P().meditating = false; G.dayLen = 840; return G.stats[stat] >= 3.5 || `${stat}=${G.stats[stat]}`; });
      await t('moon meditation does not count by day', () => { fresh('fire'); isolate(); place(LOC.moonpool.x + 2, LOC.moonpool.z + 2, 0); tick(0.2); G.time = 12; G.stats.moon_med = 0; Input.meditate(); tick(3); P().meditating = false; return !G.stats.moon_med; });
      await t('meditation restores chi quickly', () => { const p = fresh('fire'); isolate(); place(30, 95, 0); p.chi = 0; Input.meditate(); tick(3); return p.chi > 50 || p.chi; });
      await t('moving breaks meditation', () => { const p = fresh('fire'); isolate(); place(30, 95, 0); Input.meditate(); walk(0.5); return !p.meditating; });
    }

    /* ================= SURVIVAL ================= */
    if (want('survival')) { group = 'Survival';
      await t('hunger and thirst fall over time', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); const h = p.hunger, w = p.thirst; G.dayLen = 1e9; tick(30, 1 / 10); return p.hunger < h - 2 && p.thirst < w - 3 || `${p.hunger}/${p.thirst}`; });
      await t('starvation and thirst hurt', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); p.hunger = 0; p.thirst = 0; const hp = p.hp; tick(5, 1 / 10); return p.hp < hp; });
      await t('a warm fire restores warmth at night', () => { const p = fresh('earth'); isolate(); place(60, 60, 0); G.time = 23; p.warmth = 20; G.campfires.push(new Campfire(61, 61, true)); tick(10, 1 / 10); return p.warmth > 45 || p.warmth; });
      await t('cold night saps warmth away from fire', () => { const p = fresh('earth'); isolate(); place(120, -60, 0); G.time = 23; p.warmth = 80; tick(20, 1 / 10); return p.warmth < 70 || p.warmth; });
      await t('high peaks are colder than valleys', () => { const p = fresh('earth'); isolate(); place(LOC.bisonpeak.x + 3, LOC.bisonpeak.z + 3, 0); G.time = 12; p.warmth = 80; tick(20, 1 / 10); const peak = p.warmth; place(0, 0, 0); p.warmth = 80; tick(20, 1 / 10); return peak < p.warmth || `${peak} vs ${p.warmth}`; });
      await t('Southern Water Tribe resists cold', () => { const a = fresh('water', 'south'); isolate(); place(120, -60, 0); G.time = 23; a.warmth = 80; tick(15, 1 / 10); const south = a.warmth; const b = fresh('water', 'north'); isolate(); place(120, -60, 0); G.time = 23; b.warmth = 80; tick(15, 1 / 10); return south > b.warmth || `${south} vs ${b.warmth}`; });
      await t('freezing hurts', () => { const p = fresh('earth'); isolate(); place(LOC.bisonpeak.x + 3, LOC.bisonpeak.z + 3, 0); G.time = 2; p.warmth = 0; const hp = p.hp; tick(4, 1 / 10); return p.hp < hp; });
      await t('eating cooked meat restores hunger', () => { const p = fresh('earth'); isolate(); p.hunger = 20; Game.give('meat_cooked', 1); Game.eatItem('meat_cooked'); return p.hunger > 50 && (G.stats.ate_cooked || 0) >= 1; });
      await t('raw meat can make you sick', () => { let sick = false; for (let i = 0; i < 12 && !sick; i++) { const p = fresh('earth'); isolate(); Game.give('meat_raw', 1); Game.eatItem('meat_raw'); sick = p.status.sick > 0; } return sick; });
      await t('Air Nomads feel uneasy eating meat', () => { const p = fresh('air'); isolate(); p.chi = 100; Game.give('meat_cooked', 1); Game.eatItem('meat_cooked'); return p.chi <= 80; });
      await t('Air Nomads prefer fruit when eating', () => { const p = fresh('air'); isolate(); Game.give('meat_cooked', 1); Game.give('peach', 1); Game.eatBest(); return Game.count('peach') === 0 && Game.count('meat_cooked') >= 1; });
      await t('drinking at the river', () => { const p = fresh('earth'); isolate(); place(95, 123, 0); p.thirst = 10; tick(0.1); const it = Game.findInteract(); assert(it, 'no prompt'); assert(/Drink/.test(it.label), 'prompt: ' + it.label); it.action(); return p.thirst > 40; });
      await t('waterskin drinking uses a charge', () => { const p = fresh('earth'); isolate(); p.water = 2; p.thirst = 10; Game.drinkSkin(); return p.water === 1 && p.thirst > 30; });
      await t('campfire needs 4 firewood', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); Game.state.inv.wood = 3; Game.buildCampfire(); const n1 = G.campfires.length; Game.state.inv.wood = 4; Game.buildCampfire(); return G.campfires.length === n1 + 1 && Game.count('wood') === 0; });
      await t('flint lighting eventually lights the fire', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); Game.state.inv.wood = 4; Game.state.inv.stone = 5; Game.buildCampfire(); const f = G.campfires[G.campfires.length - 1]; for (let i = 0; i < 20 && !f.lit; i++) Game.lightFire(f); return f.lit; });
      await t('cooking at a campfire', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); const f = new Campfire(30, 96.6, true); G.campfires.push(f); Game.give('meat_raw', 1); tick(0.1); const it = Game.findInteract(); assert(it && /Cook/.test(it.label), 'prompt: ' + (it && it.label)); it.action(); tick(3); return Game.count('meat_raw') === 0 && (G.stats.cooked || 0) >= 1; });
      await t('campfires burn out', () => { fresh('earth'); isolate(); const f = new Campfire(30, 96.6, true); G.campfires.push(f); f.fuel = 1; tick(2); return !f.lit; });
      await t('gathering firewood from a tree', () => { const p = fresh('earth'); isolate(); const tr = World.treeRecs.find(t2 => t2.kind === 'tree'); tr.cd = 0; Game.gatherTree(tr); return Game.count('wood') > 2; });
      await t('trees need time to recover', () => { fresh('earth'); isolate(); const tr = World.treeRecs.find(t2 => t2.kind === 'tree'); tr.cd = 0; Game.gatherTree(tr); const w = Game.count('wood'); Game.gatherTree(tr); return Game.count('wood') === w; });
      await t('picking berries', () => { fresh('earth'); isolate(); const b = World.bushRecs[0]; b.berries = 3; Game.pickBush(b); return Game.count('berries') >= 2; });
      await t('moon peaches from the orchard', () => { fresh('earth'); isolate(); const tr = World.treeRecs.find(t2 => t2.kind === 'peach'); tr.cd = 0; Game.gatherTree(tr); return Game.count('peach') === 2; });
      await t('earthbenders pull more stone', () => { fresh('earth'); isolate(); const r = World.rockRecs[5]; r.cd = 0; Game.gatherStone(r); const e = Game.count('stone'); fresh('fire'); isolate(); r.cd = 0; Game.gatherStone(r); return e > Game.count('stone'); });
      await t('sleep is refused during the day', () => { fresh('earth'); isolate(); G.time = 12; return !!Game.canSleep(); });
      await t('sleep needs shelter or fire', () => { fresh('earth'); isolate(); place(120, -60, 0); G.time = 22; return /shelter/.test(Game.canSleep() || ''); });
      await t('sleeping by a fire passes the night', async () => { const p = fresh('earth'); isolate(); place(60, 60, 0); G.campfires.push(new Campfire(61, 61, true)); G.time = 22; const day = G.day; p.hp = 20; Game.sleep(); await sleep(1900); return (G.day === day + 1 && G.time > 6 && G.time < 7 && p.hp === p.maxHp && (G.stats.slept || 0) >= 1) || `day ${G.day} time ${G.time} hp ${p.hp}`; });
      await t('cannot sleep with a predator hunting you', () => { const p = fresh('earth'); isolate(); place(60, 60, 0); G.campfires.push(new Campfire(61, 61, true)); G.time = 22; const bear = new Creature('platypusbear', 70, 60); bear.state = 'chase'; G.ents.push(bear); return /enemies/.test(Game.canSleep() || ''); });
      await t('a long fall hurts non-airbenders', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); tick(0.2); p.pos.y += 25; p.grounded = false; const hp = p.hp; tick(3); return p.hp < hp; });
      await t('swimming chills you', () => { const p = fresh('earth'); isolate(); place(-80, 140, 0); G.time = 12; p.warmth = 80; tick(10, 1 / 10); return p.warmth < 70 || p.warmth; });
      await t('death and respawn', () => { const p = fresh('earth'); isolate(); place(30, 95, 0); Game.give('meat_raw', 3); p.hurt(500, { name: 'test' }); assert(p.dead && G.mode === 'dead', 'not dead'); assert(!document.getElementById('dead').classList.contains('hidden'), 'no death screen'); document.getElementById('bRespawn').click(); return (!p.dead && G.mode === 'play' && p.hp > 0 && Game.count('meat_raw') === 0) || `dead=${p.dead}`; });
      await t('the village is warm at night', () => { const p = fresh('earth'); isolate(); place(5, 5, 0); G.time = 23; p.warmth = 30; tick(15, 1 / 10); return p.warmth > 40 || p.warmth; });
    }

    /* ================= CREATURES ================= */
    if (want('creatures')) { group = 'Creatures';
      for (const sp of Object.keys(SPECIES)) await t(`${SPECIES[sp].name}: animates through every state without NaN`, () => { const C = buildCreature(sp); for (const st of [{ speed: 0 }, { speed: 2, graze: true }, { speed: 8, alert: true }, { speed: 4, rear: true, lunge: 0.5 }, { dead: true }, { frozen: true }]) for (let i = 0; i < 15; i++) animateCreature(C, 0.05, st); return finiteObj(C.root); });
      for (const sp of Object.keys(SPECIES).filter(s => !SPECIES[s].passive)) await t(`${SPECIES[sp].name}: lives in its zone and wanders`, () => { fresh('fire'); isolate(); const pt = Spawner.point(SPECIES[sp].zone); assert(pt, 'no zone point'); const c = new Creature(sp, pt[0], pt[1]); G.ents.push(c); place(pt[0] + 150, pt[1], 0); tick(8, 1 / 20); return (c.alive && finiteObj(c.model.root) && fin(c.pos.x) && c.pos.y > -3) || `y=${c.pos.y}`; });
      for (const sp of Object.keys(SPECIES).filter(s => SPECIES[s].prey)) await t(`${SPECIES[sp].name}: flees from you`, () => { fresh('fire'); isolate(); const pt = Spawner.point(SPECIES[sp].zone); const c = new Creature(sp, pt[0], pt[1]); G.ents.push(c); place(pt[0] + 4, pt[1], -Math.PI / 2); tick(0.3); const d0 = c.distToPlayer(); tick(2.5, 1 / 30); return (c.state === 'flee' || c.state === 'chase') && (c.distToPlayer() > d0 || c.state === 'chase') || `${c.state} ${d0.toFixed(1)}->${c.distToPlayer().toFixed(1)}`; });
      for (const sp of Object.keys(SPECIES).filter(s => !SPECIES[s].prey && !SPECIES[s].passive)) {
        await t(`${SPECIES[sp].name}: hunts you down and attacks`, () => { const p = fresh('fire'); isolate(); const pt = Spawner.point(SPECIES[sp].zone); place(pt[0], pt[1], 0); const c = new Creature(sp, pt[0] + 10, pt[1]); G.ents.push(c); const hp = p.hp; tick(8, 1 / 30); return (p.hp < hp) || `state ${c.state} dist ${c.distToPlayer().toFixed(1)}`; });
        await t(`${SPECIES[sp].name}: will not follow you into the village`, () => { const p = fresh('fire'); isolate(); place(0, 10, 0); const c = new Creature(sp, 0, 52); G.ents.push(c); c.state = 'chase'; tick(6, 1 / 30); return c.state !== 'chase' && c.state !== 'attack' || `${c.state} at ${Math.hypot(c.pos.x, c.pos.z).toFixed(1)}`; });
        await t(`${SPECIES[sp].name}: fears a lit campfire`, () => { const p = fresh('fire'); isolate(); place(60, 60, 0); G.campfires.push(new Campfire(60.5, 60.5, true)); const c = new Creature(sp, 72, 60); G.ents.push(c); const hp = p.hp; tick(8, 1 / 30); return p.hp === hp || `hp ${hp}->${p.hp}, beast ${c.distToPlayer().toFixed(1)}m`; });
      }
      for (const sp of Object.keys(SPECIES).filter(s => !SPECIES[s].passive)) await t(`${SPECIES[sp].name}: can be defeated and harvested`, () => { const p = fresh('fire'); isolate(); place(60, 60, 0); const c = new Creature(sp, 62, 60); G.ents.push(c); c.damage(1e4, 'fire', p); assert(!c.alive, 'alive'); assert(Game.state.bestiary.includes(sp), 'bestiary'); tick(0.2); const it = Game.findInteract(); assert(it && /Harvest/.test(it.label), 'prompt ' + (it && it.label)); it.action(); const meat = Game.count('meat_raw'); const again = Game.findInteract(); return meat >= 1 && !(again && /Harvest/.test(again.label)) || `meat ${meat}`; });
      await t('passive giants ignore damage', () => { fresh('fire'); isolate(); const b = new Creature('skybison', 0, -200); const m = new Creature('badgermole', 160, -120); G.ents.push(b, m); b.damage(9999, 'fire', P()); m.damage(9999, 'fire', P()); return b.alive && m.alive; });
      await t('sky bison stay airborne', () => { fresh('fire'); isolate(); const b = new Creature('skybison', World.peakCenter.x, World.peakCenter.z); G.ents.push(b); let minClear = 1e9; for (let i = 0; i < 60; i++) { Main.tick(0.5); minClear = Math.min(minClear, b.pos.y - terrainH(b.pos.x, b.pos.z)); } return minClear > 5 || minClear; });
      await t('the badgermole stays in its cave', () => { fresh('fire'); isolate(); const m = new Creature('badgermole', World.caveCenter.x, World.caveCenter.z - 1.5); G.ents.push(m); const p0 = m.pos.clone(); tick(10, 1 / 10); return m.pos.distanceTo(p0) < 0.5; });
      await t('a turtle-duck in deep water floats where bending can hit it', () => { fresh('fire'); isolate(); const c = new Creature('turtleduck', LOC.lake.x, LOC.lake.z); G.ents.push(c); place(LOC.lake.x + 40, LOC.lake.z - 30, 0); tick(2, 1 / 20); return (c.pos.y > WORLD.sea - 0.5 && c.swimming) || `y=${c.pos.y.toFixed(2)}`; });
  await t('turtle-ducks float on the water', () => { fresh('fire'); isolate(); const pt = Spawner.point('shore'); const c = new Creature('turtleduck', pt[0], pt[1]); G.ents.push(c); place(pt[0] + 120, pt[1], 0); tick(4, 1 / 20); return c.model.root.position.y > -1.5; });
      await t('predators hunt prey on their own', () => { fresh('fire'); isolate(); place(150, 60, 0); const bear = new Creature('mooselion', 60, 60); const prey = new Creature('possumchicken', 66, 60); G.ents.push(bear, prey); bear.state = 'hunt'; bear.prey = prey; prey.huntedBy = bear; bear.timer = 30; tick(20, 1 / 20); return !prey.alive || `prey hp ${prey.hp}`; });
      await t('wildlife repopulates over time', () => { fresh('fire'); isolate(); Spawner.timer = 0; for (let i = 0; i < 30; i++) { Spawner.timer = 0; Spawner.tick(0.1); } return G.ents.filter(e => e.kind === 'animal').length >= 25; });
      await t('more predators roam at night', () => { fresh('fire'); isolate(); G.time = 23; Spawner.rng = U.rng(9); for (let i = 0; i < 60; i++) { Spawner.timer = 0; Spawner.tick(0.1); } const night = G.ents.filter(e => e.kind === 'animal' && e.hostile).length; const target = Object.values(SPECIES).filter(s => !s.prey && !s.passive).reduce((a, s) => a + s.count + 1, 0); return night === target || `${night} vs ${target}`; });
    }

    /* ================= DAOFEI & VILLAGERS ================= */
    if (want('people')) { group = 'People';
      await t('five daofei hold the camp', () => { fresh('fire'); return G.ents.filter(e => e.kind === 'daofei').length === 5 && G.ents.filter(e => e.kind === 'daofei').every(e => e.pos.distanceTo(V3(LOC.daofei.x, e.pos.y, LOC.daofei.z)) < 12); });
      await t('daofei raise the alarm when you approach', () => { fresh('fire'); place(LOC.daofei.x - 22, LOC.daofei.z, Math.PI / 2); tick(1); return G.flags.daofeiAlert === true; });
      await t('daofei fight back (ranged and melee)', () => { const p = fresh('fire'); place(LOC.daofei.x - 10, LOC.daofei.z, Math.PI / 2); const hp = p.hp; p.maxHp = 1e4; p.hp = 1e4; tick(10, 1 / 30); return p.hp < 1e4 || 'unhurt'; });
      await t('defeating every daofei: yields, copper, and the map fragment', () => { const p = fresh('fire'); place(LOC.daofei.x - 30, LOC.daofei.z, 0); for (const e of G.ents.filter(e => e.kind === 'daofei')) e.damage(1e4, 'fire', p); tick(0.5); assert((G.stats.daofei || 0) === 5, 'count ' + G.stats.daofei); const drops = G.drops.map(d => d.item); assert(drops.includes('map_frag'), 'no map'); for (const d of G.drops) P().pos.copy(d.pos), d.update(0.1); return Game.count('map_frag') === 1 && Game.count('copper') > 10; });
      await t('defeated daofei leave and do not return', () => { const p = fresh('fire'); for (const e of G.ents.filter(e => e.kind === 'daofei')) e.damage(1e4, 'fire', p); tick(27, 1 / 5); assert(G.ents.filter(e => e.kind === 'daofei').length === 0, 'still there'); G.allowSave = true; Game.save(); G.allowSave = false; const d = Game.loadData(); Boot.load(d); return G.ents.filter(e => e.kind === 'daofei').length === 0; });
      await t('eight villagers live in the valley', () => G.ents.filter(e => e.kind === 'villager').length === VILLAGERS.length);
      for (const v of VILLAGERS) await t(`dialogue tree fully walkable: ${v.name}`, () => {
        const p = fresh('fire'); isolate(); Game.state.inv.copper = 500; Game.give('hide', 2); Game.give('meat_raw', 2); Game.give('fish_raw', 1); const npc = G.ents.find(e => e.def && e.def.id === v.id); let visited = 0;
        const walk = (node, depth) => { visited++; assert(node && typeof node.t === 'string' && node.t.length > 10, 'empty node'); if (depth > 4) return; for (const c of (node.c || [])) { if (!c.f) continue; if (/rest|Rent a bed|I will rest/.test(c.t)) continue; const r = c.f(); if (r) walk(r, depth + 1); } };
        for (const q of Object.keys(QUESTS)) { Game.state.activeQuest = q; Game.state.quests[q] = { step: 0 }; walk(DIALOGUE[v.id](npc), 0); }
        Dialog.open(npc); assert(!document.getElementById('dialog').classList.contains('hidden'), 'dialog hidden'); Dialog.pick(0); Dialog.close(); return visited > 3 || visited;
      });
      await t('merchant: buying roast meat costs copper', () => { fresh('fire'); isolate(); const npc = G.ents.find(e => e.def.id === 'mei'); Game.state.inv.copper = 25; const c0 = Game.count('meat_cooked'); DIALOGUE.mei(npc).c[0].f(); return Game.count('copper') === 15 && Game.count('meat_cooked') === c0 + 1; });
      await t('merchant: selling hides pays 6 each', () => { fresh('fire'); isolate(); const npc = G.ents.find(e => e.def.id === 'mei'); Game.state.inv.copper = 0; Game.give('hide', 3); const opt = DIALOGUE.mei(npc).c.find(c => /Sell all Animal Hide/.test(c.t)); opt.f(); return Game.count('copper') === 18 && !Game.count('hide'); });
      await t('merchant: larger waterskin is a one-time upgrade', () => { const p = fresh('fire'); isolate(); const npc = G.ents.find(e => e.def.id === 'mei'); Game.state.inv.copper = 100; const m0 = p.waterMax; DIALOGUE.mei(npc).c.find(c => /waterskin/.test(c.t)).f(); return p.waterMax === m0 + 2 && !DIALOGUE.mei(npc).c.some(c => /waterskin/.test(c.t)); });
      await t('merchant refuses when you are broke', () => { fresh('fire'); isolate(); const npc = G.ents.find(e => e.def.id === 'mei'); Game.state.inv.copper = 0; const r = DIALOGUE.mei(npc).c[0].f(); return /afford/.test(r.t); });
      await t('the inn gives a free first night', async () => { const p = fresh('fire'); isolate(); G.time = 21; place(World.inn.x + 4, World.inn.z + 5, 0); const npc = G.ents.find(e => e.def.id === 'lin'); const day = G.day; DIALOGUE.lin(npc).c[0].f(); await sleep(1900); return G.day === day + 1 && G.flags.innUsed; });
      await t('the cabbage merchant protests', () => { fresh('fire'); isolate(); const cc = World.cabbageCart; const pr = Bending.spawn({ el: 'fire', pos: V3(cc.x, terrainH(cc.x, cc.z) + 0.5, cc.z), vel: V3(0, -1, 0), owner: P(), dmg: 1 }); Bending.endProj(pr, true); return /CABBAGES/.test(G.lastNote || ''); });
      await t('villagers turn to face you', () => { fresh('fire'); isolate(); const npc = G.ents.find(e => e.def.id === 'tam'); place(npc.pos.x + 3, npc.pos.z, 0); tick(2); const want2 = Math.atan2(P().pos.x - npc.pos.x, P().pos.z - npc.pos.z); return Math.abs(U.angDiff(npc.yaw, want2)) < 0.2; });
    }

    /* ================= QUESTS ================= */
    if (want('quests')) { group = 'Quests';
      await t('full early-story playthrough', async () => {
        const p = fresh('earth'); isolate(); const s = Game.state; const step = () => { Game.questTick(); };
        place(0, 20, 0); step(); assert(s.quests.arrival.step === 1, 'arrival step'); G.flags.talkedBao = true; step(); assert(s.activeQuest === 'eat', 'to eat: ' + s.activeQuest);
        G.stats.harvested = 1; G.stats.cooked = 1; G.stats.ate_cooked = 1; G.stats.drinks = 1; const sp = s.sp; step(); assert(s.activeQuest === 'night' && s.sp >= sp + 1, 'eat reward');
        G.stats.campfires = 1; G.stats.slept = 1; step(); assert(s.activeQuest === 'path', 'path');
        G.flags.openedSkills = true; G.stats.learned = 1; step(); assert(s.activeQuest === 'daofei', 'daofei');
        place(LOC.daofei.x - 30, LOC.daofei.z, 0); step(); G.stats.daofei = 5; step(); G.flags.reportedDaofei = true; const c = Game.count('copper'); step(); assert(s.activeQuest === 'teachers' && Game.count('copper') === c + 50, 'daofei reward');
        G.stats.awakened = 1; step(); assert(s.quests.teachers.step === 1, 'awaken step');
        place(World.banyanSeat.x, World.banyanSeat.z, 0); Input.meditate(); for (let i = 0; i < 14; i++) Main.tick(0.5); await sleep(2700);
        assert(G.ui.storyOpen, 'vision did not start'); document.getElementById('storySkip').click(); assert(G.flags.banyanVision, 'vision flag'); step(); await sleep(1400);
        return (s.activeQuest === null && G.flags.chapter1) || `${s.activeQuest} ${G.flags.chapter1}`;
      });
      for (const q of Object.keys(QUESTS)) await t(`quest steps have text: ${q}`, () => QUESTS[q].steps.every(st => (typeof st.text === 'function' ? (fresh('fire'), st.text()) : st.text).length > 8));
      await t('quest tracker shows the current objective', () => { fresh('fire'); UI.lastHud = -1; UI.hud(0.016); return /Reach Tienhai Village/.test(document.getElementById('quest').textContent); });
      await t('quest marker points toward the objective', () => { fresh('fire'); const q = UI.questTarget(); return q && q.x === 0 && q.z === 0; });
      await t('location discovery grants XP and a banner', () => { fresh('fire'); isolate(); const xp = Game.state.xp + Game.state.level * 1000; place(LOC.pagoda.x + 5, LOC.pagoda.z + 15, 0); Main.discover(); return Game.state.discovered.includes('pagoda') && Game.state.xp + Game.state.level * 1000 > xp; });
      await t('levelling up grants skill points', () => { fresh('fire'); const sp = Game.state.sp; Game.addXP(1000); return Game.state.level > 1 && Game.state.sp > sp; });
    }

    /* ================= UI ================= */
    if (want('ui')) { group = 'UI';
      fresh('water'); grantAll();
      for (const tab of ['skills', 'inv', 'map', 'journal', 'char']) await t(`panel renders: ${tab}`, () => { UI.openPanel(tab); const html = document.getElementById('pbody').innerHTML; UI.closePanel(); return html.length > 300 || html.length; });
      for (const el of ['avatar', ...ELEMENTS]) await t(`skill tree tab renders all nodes: ${el}`, () => { UI.treeEl = el; UI.sel = null; UI.openPanel('skills'); const n = document.querySelectorAll('#treeview .node').length; const exp = Object.keys(TECH).filter(id => TECH[id].el === el && TREE_POS[id] && TECH[id].awaken !== P().native).length; UI.closePanel(); return n === exp || `${n} vs ${exp}`; });
      for (const id of Object.keys(TECH).filter(i => TREE_POS[i] && TECH[i].awaken !== P().native)) await t(`technique info card: ${TECH[id].name}`, () => { UI.treeEl = TECH[id].el; UI.sel = id; UI.openPanel('skills'); const html = document.getElementById('tinfo').innerHTML; UI.closePanel(); return html.includes(TECH[id].name) && html.length > 120; });
      await t('skill tree node positions stay inside the view', () => { UI.treeEl = 'fire'; UI.openPanel('skills'); const tv = document.getElementById('treeview').getBoundingClientRect(); const bad = [...document.querySelectorAll('#treeview .node')].filter(n => { const r = n.getBoundingClientRect(); return r.top < tv.top - 2 || r.bottom > tv.bottom + 2; }).length; UI.closePanel(); return bad === 0 || `${bad} clipped`; });
      await t('hotbar lists the element\'s techniques', () => { const p = P(); p.element = 'water'; UI._sh = null; UI.hotbar(); return document.querySelectorAll('#slots .slot').length === Math.min(5, UI.slotsFor('water').length); });
      await t('element switching cycles awakened elements', () => { const p = P(); p.element = 'water'; Input.cycleElement(1); const a = p.element; Input.cycleElement(1); return a !== 'water' && p.element !== a; });
      await t('compass shows N ahead when facing north', () => { isolate(); place(0, 30, Math.PI); G.camYaw = 0; G.camPitch = 0; tick(0.1); UI.lastHud = -1; UI.hud(0.016); const c = [...document.querySelectorAll('#compass .c.m')].find(e => e.textContent === 'N'); const W = document.getElementById('compass').clientWidth; return c && Math.abs(parseFloat(c.style.left) - W / 2) < 6 || (c && c.style.left); });
      await t('camera aim points where the camera looks', () => { G.aimOverride = null; place(0, 30, Math.PI); G.camYaw = 0; G.camPitch = -0.3; tick(0.1); return G.aim.point.z < P().pos.z - 2 || `aim z ${G.aim.point.z.toFixed(1)} player z ${P().pos.z.toFixed(1)}`; });
      await t('auto-aim locks onto a creature in front', () => { G.aimOverride = null; isolate(); place(30, 95, -Math.PI / 2); G.camYaw = -Math.PI / 2 + Math.PI; G.camPitch = -0.06; const d = dummy(18, 95.6); tick(0.2); return G.aim.target === d || 'no lock'; });
      await t('damage numbers and health bars appear', () => { const n0 = document.querySelectorAll('.dmg').length; const d = G.ents.find(e => e.name === 'Dummy'); d.damage(10, 'fire', P()); UI.lastHud = -1; UI.hud(0.016); return document.querySelectorAll('.dmg').length > n0 && document.querySelectorAll('.hpw').length > 0; });
      await t('interaction prompt appears near a villager', () => { isolate(); const npc = G.ents.find(e => e.def.id === 'bao'); place(npc.pos.x + 1.5, npc.pos.z, 0); UI.lastHud = -1; UI.hud(0.016); return /Talk to Elder Bao/.test(document.getElementById('prompt').textContent); });
      await t('pause and resume', () => { UI.pause(true); const a = G.mode === 'paused'; const t0 = G.time; tick(1); const frozen = G.time === t0; UI.pause(false); return a && frozen && G.mode === 'play'; });
      await t('settings panel toggles options', () => { UI.pause(true); UI.settings(); const fp = document.getElementById('sFP'); fp.click(); const on = G.settings.firstPerson; fp.click(); UI.pause(false); return on && !G.settings.firstPerson; });
      await t('first-person camera sits at the eyes', () => { G.settings.firstPerson = true; place(30, 95, 0); tick(0.1); const h = G.camObj.position.y - P().pos.y; G.settings.firstPerson = false; return h > 1.4 && h < 1.9 || h; });
      await t('keyboard: K opens the bending scroll, Esc closes it', () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })); const o = UI.panelOpen; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); return o && !UI.panelOpen; });
      await t('keyboard: WASD moves the Avatar', () => { isolate(); place(30, 95, 0); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); const z0 = P().pos.z; tick(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); return Math.hypot(P().pos.z - z0, 0) > 2; });
      await t('keyboard: C meditates, B builds a fire', () => { isolate(); Input.keys = {}; place(30, 95, 0); tick(0.1); Game.state.inv.wood = 4; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })); const m = P().meditating; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' })); P().meditating = false; const n = G.campfires.length; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' })); return m && G.campfires.length === n + 1; });
      await t('minimap draws every frame without error', () => { for (let i = 0; i < 5; i++) { UI.lastHud = -1; UI.hud(0.016); } return true; });
      await t('ceremony overlay shows and fades', async () => { Game.ceremony('fire_jab'); const shown = document.getElementById('ceremony').classList.contains('show'); await sleep(4400); return shown && !document.getElementById('ceremony').classList.contains('show'); });
    }

    /* ================= SAVE / LOAD ================= */
    if (want('save')) { group = 'Save';
      await t('save → load round-trip restores the journey', () => {
        const p = fresh('air', 'eastern', 'monk'); isolate(); grantAll(); Game.state.level = 4; Game.state.sp = 3; Game.give('peach', 5); G.stats.meditate_time = 77; G.flags.talkedBao = true; G.time = 15.5; G.day = 3; place(40, 60, 1.2); p.hunger = 42;
        G.allowSave = true; Game.save(); G.allowSave = false; const d = Game.loadData(); assert(d && d.v === 1, 'no save');
        fresh('fire'); Boot.load(d); const q = P();
        return (q.native === 'air' && Game.state.level === 4 && Game.count('peach') === 5 && G.stats.meditate_time === 77 && G.flags.talkedBao && G.day === 3 && Math.abs(q.pos.x - 40) < 0.1 && Math.round(q.hunger) === 42 && Game.elementOpen('earth')) || 'mismatch';
      });
      await t('corrupt saves do not crash the title screen', () => { localStorage.setItem('avatar_lost_era_v1', '{oops'); const d = Game.loadData(); localStorage.removeItem('avatar_lost_era_v1'); return d === null; });
      await t('test mode never overwrites real saves', () => { localStorage.removeItem('avatar_lost_era_v1'); Game.save(); return localStorage.getItem('avatar_lost_era_v1') === null; });
    }

    /* ================= ANIMATION ================= */
    if (want('animation')) { group = 'Animation';
      for (const a of Object.keys(ACTIONS)) for (const body of ['A', 'B']) await t(`humanoid action plays and returns to rest: ${a} (frame ${body})`, () => { const H = buildHumanoid(Object.assign(defaultLook('earth'), { body })); playAction(H, a); let n = 0; while (H.action && n < 400) { animateHumanoid(H, 1 / 60, { grounded: true }); n++; } for (let i = 0; i < 30; i++) animateHumanoid(H, 1 / 60, { grounded: true }); return !H.action && finiteObj(H.root) && Math.abs(H.J.shR.rotation.x) < 0.4 || `rest shR ${H.J.shR.rotation.x.toFixed(2)}`; });
      for (const st of ['meditate', 'swim', 'sleep', 'dead']) await t(`humanoid pose: ${st}`, () => { const H = buildHumanoid(defaultLook('fire')); for (let i = 0; i < 60; i++) animateHumanoid(H, 1 / 30, { [st]: true, grounded: true }); return finiteObj(H.root); });
      await t('meditation pose lowers the hips', () => { const H = buildHumanoid(defaultLook('fire')); for (let i = 0; i < 60; i++) animateHumanoid(H, 1 / 30, { meditate: true, grounded: true }); return H.J.hips.position.y < 0.45 || H.J.hips.position.y; });
      await t('knocked-out pose lies down', () => { const H = buildHumanoid(defaultLook('fire')); for (let i = 0; i < 90; i++) animateHumanoid(H, 1 / 30, { dead: true, grounded: true }); return H.J.hips.rotation.x < -1.2 && H.J.hips.position.y < 0.35 || `${H.J.hips.rotation.x} ${H.J.hips.position.y}`; });
      for (const el of ['fire', 'earth', 'water', 'air']) await t(`combat stance: ${el}`, () => { const H = buildHumanoid(defaultLook('air')); for (let i = 0; i < 60; i++) animateHumanoid(H, 1 / 30, { combat: true, element: el, grounded: true }); return H.stance > 0.9 && finiteObj(H.root); });
      await t('walk cycle swings the legs', () => { const H = buildHumanoid(defaultLook('water')); let mx = 0, mn = 0; for (let i = 0; i < 90; i++) { animateHumanoid(H, 1 / 60, { speed: 4.6, grounded: true }); mx = Math.max(mx, H.J.hipL.rotation.x); mn = Math.min(mn, H.J.hipL.rotation.x); } return mx - mn > 0.6 || mx - mn; });
      await t('hit flash fades', () => { const H = buildHumanoid(defaultLook('water')); H.emissiveT = 0.18; animateHumanoid(H, 0.01, {}); const a = H.mat.emissive.r; for (let i = 0; i < 20; i++) animateHumanoid(H, 0.02, {}); return a > 0.3 && H.mat.emissive.r < 0.01; });
    }

    /* ================= RIG & ANIMATION FIT (base-mesh bodies) ================= */
    if (want('rig')) { group = 'Rig & fit';
      const wp = (o) => { const v = V3(); o.getWorldPosition(v); return v; };
      const run = (H, n, st, dt = 1 / 60) => { for (let i = 0; i < n; i++) animateHumanoid(H, dt, Object.assign({ grounded: true }, st)); H.root.updateMatrixWorld(true); };
      await t('both base meshes decode with the 30-bone skeleton', () => BODY_DATA.bones.length === 30 && BODIES.A.nTri > 500 && BODIES.B.nTri > 900 && ['clavL', 'toeR'].every((b) => BODY_DATA.bones.includes(b)) || 'bad body data');
      for (const body of ['A', 'B']) {
        const mk = (n = 'earth', extra = {}) => { const H = buildHumanoid(Object.assign(defaultLook(n), { body }, extra)); G.scene.add(H.root); H.root.position.set(0, 0, 0); return H; };
        const done = (H) => G.scene.remove(H.root);
        await t(`frame ${body}: every vertex is fully weighted to real bones`, () => { const H = mk(); const sw = H.mesh.geometry.attributes.skinWeight, si = H.mesh.geometry.attributes.skinIndex; let bad = 0;
          for (let i = 0; i < sw.count; i++) { const sum = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i); if (Math.abs(sum - 1) > 0.01) bad++; for (const k of [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)]) if (k >= H.mesh.skeleton.bones.length) bad++; } done(H); return bad === 0 || `${bad} bad weights`; });
        await t(`frame ${body}: standing soles rest on the ground`, () => { const H = mk(); run(H, 60, {}); const a = wp(H.J.footL).y, b = wp(H.J.footR).y; done(H); return Math.abs(a) < 0.03 && Math.abs(b) < 0.03 || `${a.toFixed(3)} ${b.toFixed(3)}`; });
        for (const v of [1.4, 2.6]) await t(`frame ${body}: walking at ${v} m/s keeps the planted foot from sliding`, () => { const H = mk('water'); let slip = 0, dist = 0, prev = null;
          let planted = 0; for (let i = 0; i < 240; i++) { H.root.position.z += v / 60; if (i > 60) dist += v / 60; run(H, 1, { speed: v }); const now = { L: wp(H.J.footL), R: wp(H.J.footR) };
            /* a sole on the ground should not move: sum how far each planted sole drifts */
            if (i > 60 && prev) for (const sd of ['L', 'R']) if (now[sd].y < 0.02 && prev[sd].y < 0.02) { slip += Math.hypot(now[sd].x - prev[sd].x, now[sd].z - prev[sd].z); planted++; } prev = now; }
          done(H); const r = slip / dist; return planted > 60 && r < 0.12 || `slip ${(r * 100).toFixed(0)}% of distance over ${planted} planted frames`; });
        await t(`frame ${body}: toes bend and heels lift at push-off`, () => { const H = mk(); let toe = 0; for (let i = 0; i < 120; i++) { run(H, 1, { speed: 2 }); toe = Math.min(toe, H.J.toeL.rotation.x); } done(H); return toe < -0.2 || `toe ${toe.toFixed(2)}`; });
        await t(`frame ${body}: clavicles shrug with the arms overhead`, () => { const H = mk(); playAction(H, 'ceremony'); run(H, 90, {}); const z = H.J.clavL.rotation.z, z2 = H.J.clavR.rotation.z; done(H); return z > 0.12 && z2 < -0.12 || `${z.toFixed(2)} ${z2.toFixed(2)}`; });
        await t(`frame ${body}: meditation sits on the ground, hands on the thighs`, () => { const H = mk('air'); run(H, 120, { meditate: true }, 1 / 30); const hy = H.J.hips.position.y; let worst = 0;
          for (const s of ['L', 'R']) { const hp = wp(H.J['hand' + s]), a = wp(H.J['hip' + s]), k = wp(H.J['kn' + s]); const ab = k.clone().sub(a); const tt = U.clamp(hp.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); worst = Math.max(worst, hp.distanceTo(a.clone().addScaledVector(ab, tt))); }
          const lowFoot = Math.min(wp(H.J.footL).y, wp(H.J.footR).y); done(H); return hy < 0.4 && worst < 0.13 && lowFoot > -0.03 || `hips ${hy.toFixed(2)} hand-thigh ${worst.toFixed(3)} foot ${lowFoot.toFixed(3)}`; });
        await t(`frame ${body}: the bow brings fist and palm together before the chest`, () => { const H = mk(); playAction(H, 'bow'); run(H, 50, {}); const d = wp(H.J.handL).distanceTo(wp(H.J.handR)); done(H); return d < 0.09 || `hands ${d.toFixed(3)} m apart`; });
        await t(`frame ${body}: eating brings the hand to the mouth`, () => { const H = mk(); playAction(H, 'eat'); let best = 9; const R = H.rest;
          for (let i = 0; i < 60; i++) { run(H, 1, {}); const mouth = H.B.head.localToWorld(V3(0, R.mouthY - H.restJ.head.y, R.mouthZ - H.restJ.head.z)); best = Math.min(best, wp(H.J.handR).distanceTo(mouth)); } done(H); return best < 0.09 || `closest ${best.toFixed(3)} m`; });
        await t(`frame ${body}: every IK pose resolves to finite joint angles`, () => { const H = mk(); const keys = [MEDITATE]; for (const a of Object.values(ACTIONS)) for (const k of a.keys) if (k[1] && k[1].ik) keys.push(k[1]);
          const bad = keys.filter((k) => { const r = resolvePose(H, k); return !['shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'].every((j) => !r[j] || r[j].every(Number.isFinite)); }); done(H); return keys.length > 8 && bad.length === 0 || `${bad.length} bad of ${keys.length}`; });
      }
    }

    /* ================= RENDERING ================= */
    if (want('render')) { group = 'Render';
      const shots = [['village at noon', 0, 30, Math.PI, 12], ['village at sunset', 0, 30, Math.PI, 18.3], ['village at night', 0, 30, Math.PI, 23], ['Sun Warrior Ruins', LOC.sunruins.x + 30, LOC.sunruins.z, -Math.PI / 2, 10], ['Sky Bison Peak', LOC.bisonpeak.x, LOC.bisonpeak.z + 25, Math.PI, 12], ['Misty Pillars', LOC.pillars.x + 35, LOC.pillars.z - 20, -2.2, 8], ['Moon Pool at night', LOC.moonpool.x, LOC.moonpool.z + 14, Math.PI, 22], ['Badgermole Cave', LOC.badgercave.x, LOC.badgercave.z + 18, Math.PI, 13], ['Daofei Camp', LOC.daofei.x - 30, LOC.daofei.z, Math.PI / 2, 15], ['Eastern Shore', 225, 70, Math.PI / 2, 17], ['Ember Crags', -150, -100, -Math.PI / 2, 12], ['Lookout Pagoda', 50, -40, 2.3, 16]];
      fresh('fire');
      for (const [name, x, z, yaw, time] of shots) await t(`frame renders with real content: ${name}`, () => { isolate(); place(x, z, yaw); G.time = time; tick(0.3); const s = G.sceneEl; s.renderer.render(s.object3D, s.camera); const gl = s.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, sum2 = 0, n = 0, nan = 0; for (let i = 0; i < px.length; i += 4 * 97) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += l; sum2 += l * l; n++; if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) nan++; } const mean = sum / n, sd = Math.sqrt(sum2 / n - mean * mean);
        return (mean > 18 && mean < 240 && sd > 12 && nan / n < 0.08) || `mean ${mean.toFixed(1)} sd ${sd.toFixed(1)} black ${(nan / n * 100).toFixed(1)}%`; });
    }

    /* ================= PERFORMANCE / STABILITY ================= */
    if (want('perf')) { group = 'Performance';
      await t('simulation tick stays fast in a busy scene', () => { fresh('fire'); place(0, 30, Math.PI); for (let i = 0; i < 30; i++) Main.tick(1 / 60); const t0 = performance.now(); for (let i = 0; i < 300; i++) Main.tick(1 / 60); const ms = (performance.now() - t0) / 300; window.__tickMs = ms; return ms < 12 || `${ms.toFixed(2)}ms/tick`; });
      await t('two minutes of combat leak nothing', () => { const p = fresh('fire'); grantAll(); isolate(); place(30, 95, -Math.PI / 2); const d = dummy(22, 95); G.aimOverride = { target: d }; const ids = CASTABLE.filter(id => TECH[id].el === 'fire' || TECH[id].el === 'air');
        for (let i = 0; i < 120 * 10; i++) { if (i % 6 === 0) { p.cds = {}; p.element = TECH[ids[(i / 6) % ids.length | 0]].el; Tech.cast(ids[(i / 6) % ids.length | 0]); } Main.tick(1 / 10); }
        tick(5); G.aimOverride = null; return (G.projectiles.length < 10 && G.effects.length < 20 && G.structures.length < 5 && FX.add.alive < FX.add.max) || `proj ${G.projectiles.length} fx ${G.effects.length} st ${G.structures.length}`; });
      await t('a full in-game day passes without errors', () => { fresh('earth'); place(0, 30, 0); G.dayLen = 120; const d0 = G.day; for (let i = 0; i < 125 * 4; i++) Main.tick(0.25); G.dayLen = 840; return G.day === d0 + 1 && !G.lastError || `day ${G.day} err ${G.lastError}`; });
    }
    return R;
  } };
})();
