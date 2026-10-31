// Visual tour: captures screenshots of every major visual for manual review.
// usage: node tests/tour.js <outdir> [section,section]
const { launch, step, render, shot, startGame } = require('./harness.js');
const fs = require('fs'); const OUT = process.argv[2] || 'shots'; fs.mkdirSync(OUT, { recursive: true });
const only = (process.argv[3] || '').split(',').filter(Boolean); const want = (s) => !only.length || only.includes(s);
const LOOK = { nation: 'fire', body: 'A', height: 1, build: 1, skin: '#f2d3b0', hair: 'topknot', hairColor: '#111111', eyes: '#c98a1a', outfit: 0 };
async function place(page, x, z, yaw, camYaw, pitch = -0.15, time = 12, dist) {
  await page.evaluate(([x, z, yaw, camYaw, pitch, time, dist]) => { const { G } = GAME; const P = G.player; P.pos.set(x, GAME.groundH(x, z) , z); P.yaw = yaw; G.camYaw = camYaw; G.camPitch = pitch; G.time = time; if (dist) G.camDist = dist; P.hv && P.hv.set(0, 0, 0); P.vel.set(0, 0, 0); }, [x, z, yaw, camYaw, pitch, time, dist || 4.6]);
  await step(page, 0.4);
}
(async () => {
  const g = await launch({ viewport: { width: 960, height: 540 } }); const { page, errors } = g; await render(page);
  const S = async (name) => { await shot(page, `${OUT}/${name}.png`); console.log('shot', name); };
  if (want('creator')) {
    await page.evaluate(() => { document.getElementById('title').classList.add('hidden'); GAME.Creator.open(); }); await step(page, 0.3); await S('c1_origin_water');
    for (const n of ['earth', 'fire', 'air']) { await page.evaluate((n) => GAME.Creator.setNation(n), n); await step(page, 0.3); await S('c1_origin_' + n); }
    await page.evaluate(() => { GAME.Creator.tab = 'looks'; GAME.Creator.look.body = 'B'; GAME.Creator.look.hair = 'long'; GAME.Creator.rebuild(); GAME.Creator.render(); }); await step(page, 0.3); await S('c2_looks');
    await page.evaluate(() => { GAME.Creator.tab = 'name'; GAME.Creator.profile.name = 'Tenzing'; GAME.Creator.render(); }); await step(page, 0.3); await S('c3_name');
    await page.evaluate(() => { document.getElementById('creator').classList.add('hidden'); GAME.G.scene.remove(GAME.Creator.model.root); GAME.Creator.model = null; });
  }
  await startGame(page, { name: 'Tester', nation: 'fire', home: 'capital', bg: 'hunter', look: LOOK });
  await page.evaluate(() => { const s = GAME.Game.state; for (const id of Object.keys(GAME.TECH)) if (!GAME.TECH[id].late && !s.learned.includes(id)) s.learned.push(id); s.awakened = ['air', 'water', 'earth']; GAME.G.player.chi = 1e6; GAME.G.player.maxChi = 1e6; });
  if (want('places')) {
    const P = [['p_village', 6, 26, Math.PI, 0, -0.1, 10], ['p_village_sunset', -6, 30, Math.PI, 0.3, -0.05, 18.2], ['p_village_night', -4, 22, Math.PI, 0.2, -0.05, 22.5],
      ['p_pagoda', 40, -30, 2.3, -2.3 + Math.PI, -0.32, 16.8, 9], ['p_pagoda_top', 82, -70, Math.PI, 0, -0.05, 17.5], ['p_banyan', -30, 70, 2.5, -0.6, -0.25, 17.8],
      ['p_moonpool_night', -36, 113, Math.PI + 0.3, -0.3, -0.4, 23, 7], ['p_sunruins', -170, -25, -Math.PI / 2, Math.PI / 2, -0.12, 9], ['p_ruins_top', -201, -21, -2.4, 0.8, -0.2, 7, 7],
      ['p_bisonpeak', 25, -205, Math.PI, 0, -0.1, 11], ['p_cave', 170, -97, Math.PI, 0, -0.18, 13, 6], ['p_daofei', 116, 30, Math.PI / 2, -Math.PI / 2, -0.3, 15, 9],
      ['p_pillars', -140, 150, -2.2, 0.9, -0.05, 8], ['p_bridge', -19, 165, Math.PI, 0, -0.1, 14], ['p_coast', 215, 70, Math.PI / 2, -Math.PI / 2, -0.1, 17.6], ['p_crags', -150, -100, -Math.PI / 2, Math.PI / 2, -0.1, 12]];
    for (const [n, x, z, y, cy, p, t, d] of P) { await place(page, x, z, y, cy, p, t, d); await page.evaluate(() => document.getElementById('banner').classList.remove('show')); await S(n); }
  }
  if (want('animals')) {
    const sp = ['turtleduck', 'rabbaroo', 'possumchicken', 'hogmonkey', 'ostrichhorse', 'platypusbear', 'mooselion', 'crawler', 'skybison', 'badgermole'];
    await page.evaluate(() => { GAME.G.ents.filter(e => e.kind === 'animal').forEach(e => { e.model.root.visible = false; e.update = () => {}; }); GAME.G.player.H.root.visible = false; GAME.G.mode = 'photo'; document.getElementById('hud').classList.add('hidden'); });
    for (const s of sp) {
      await page.evaluate((s) => { const { G } = GAME; const x = 20, z = 78; const c = new (G.ents.find(e => e.kind === 'animal').constructor)(s, x, z); c.yaw = 2.3; c.update = function (dt) { this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw; }; G.ents.push(c); window.__a = c;
        const sz = c.sp.size; const d = 1.6 + sz * 1.9; G.time = 10.5; const cam = G.camObj; cam.position.set(x + d * 0.75, c.pos.y + sz * 0.9 + 0.6, z + d * 0.85); GAME.aimCam(cam, x, c.pos.y + sz * 0.55, z); }, s);
      await step(page, 0.2); await S('a_' + s);
      await page.evaluate(() => { const c = window.__a; c.model.root.rotation.y = -0.9; }); await render(page); await S('a_' + s + '_side');
      await page.evaluate(() => { GAME.G.scene.remove(window.__a.model.root); GAME.G.ents.splice(GAME.G.ents.indexOf(window.__a), 1); });
    }
    await page.evaluate(() => { GAME.G.mode = 'play'; GAME.G.player.H.root.visible = true; document.getElementById('hud').classList.remove('hidden'); });
  }
  if (want('bending')) {
    const techs = ['fire_jab', 'fire_blast', 'fire_arc', 'breath_fire', 'spark', 'rock_toss', 'earth_wall', 'rock_shelter', 'earth_pillar', 'shockwave', 'water_whip', 'water_draw', 'ice_darts', 'healing', 'tidal_push', 'ice_prison', 'air_palm', 'air_jump', 'wind_step', 'air_sweep', 'air_shield'];
    const delays = { fire_jab: 0.2, fire_blast: 0.62, fire_arc: 0.3, breath_fire: 0.75, spark: 0.5, rock_toss: 0.62, earth_wall: 0.75, rock_shelter: 1.3, earth_pillar: 0.6, shockwave: 0.62, water_whip: 0.2, water_draw: 0.35, ice_darts: 0.33, healing: 0.9, tidal_push: 0.4, ice_prison: 0.32, air_palm: 0.2, air_jump: 0.35, wind_step: 0.18, air_sweep: 0.3, air_shield: 0.6 };
    await page.evaluate(() => { const { G } = GAME; document.getElementById('hud').classList.add('hidden'); G.ents.filter(e => e.kind === 'animal' && !e.sp.fly).forEach(e => { e.model.root.visible = false; e.update = () => {}; e.alive = false; e.removed = true; }); G.ents = G.ents.filter(e => !e.removed);
      const D = new (G.ents.find(e => e.kind === 'animal').constructor)('platypusbear', 11, 78); D.sp = Object.assign({}, D.sp, { aggro: 0, speed: 0, prey: false }); D.hp = D.maxHp = 99999; D.name = 'Target'; G.ents.push(D); window.__dummy = D; });
    const hits = {};
    for (const id of techs) {
      const el = GAME_EL(id);
      await page.evaluate(([el, id]) => { const { G } = GAME; const P = G.player; G.structures.forEach(s => { if (s.m) G.scene.remove(s.m); s.alive = false; }); G.structures = []; P.shelter = null; P.sheltered = false;
        G.projectiles.forEach(p => { p.alive = false; if (p.mesh) G.scene.remove(p.mesh); }); G.projectiles = []; G.effects.forEach(f => f.end && f.end()); G.effects = [];
        P.element = el; P.cds = {}; P.water = 99; P.hp = 60; P.pos.set(20, GAME.groundH(20, 78), 78); P.vy = 0; P.vel.set(0, 0, 0); P.hv && P.hv.set(0, 0, 0); P.yaw = -Math.PI / 2; G.camYaw = P.yaw + Math.PI; G.camPitch = -0.08; G.time = 11; P.handFlame = 0;
        const D = window.__dummy; D.pos.set(11, GAME.groundH(11, 78), 78); D.vel.set(0, 0, 0); D.vy = 0; D.status = { burn: 0, slow: 0, frozen: 0, stun: 0 }; D.yaw = Math.PI / 2; D.hp = 99999;
        if (id === 'spark') { GAME.Game.give('meat_raw', 1); } }, [el, id]);
      await step(page, 0.1, 1 / 60);
      const ok = await page.evaluate((id) => GAME.Tech.cast(id), id); await step(page, delays[id] || 0.3, 1 / 60);
      hits[id] = await page.evaluate(() => Math.round(99999 - window.__dummy.hp));
      await page.evaluate(() => { const { G } = GAME; const P = G.player; const cam = G.camObj; const mid = P.pos.clone().lerp(window.__dummy.pos, 0.45); cam.position.set(mid.x + 1.0, mid.y + 2.6, mid.z + 8.5); GAME.aimCam(cam, mid.x, mid.y + 1.1, mid.z); });
      await S('b_' + id + (ok ? '' : '_FAILED'));
    }
    console.log('dummy damage per technique:', JSON.stringify(hits));
    await page.evaluate(() => { document.getElementById('hud').classList.remove('hidden'); });
  }
  if (want('ui')) {
    await place(page, -2, 20, Math.PI, 0, -0.1, 10);
    for (const t of ['skills', 'inv', 'map', 'journal', 'char']) { await page.evaluate((t) => GAME.UI.openPanel(t), t); await S('u_panel_' + t); }
    await page.evaluate(() => { GAME.UI.treeEl = 'earth'; GAME.UI.openPanel('skills'); }); await S('u_panel_skills_earth');
    await page.evaluate(() => { GAME.UI.closePanel(); const b = GAME.G.ents.find(e => e.def && e.def.id === 'bao'); GAME.G.player.pos.set(b.pos.x, b.pos.y, b.pos.z + 2); GAME.Dialog.open(b); }); await step(page, 0.2); await S('u_dialog');
    await page.evaluate(() => { GAME.Dialog.close(); GAME.Game.ceremony('breath_fire'); }); await step(page, 1.0); await S('u_ceremony');
    await page.evaluate(() => { GAME.G.player.meditating = true; }); await step(page, 0.8); await S('u_meditate');
    await page.evaluate(() => { GAME.G.player.meditating = false; GAME.Game.die({ name: 'a Platypus-Bear' }); }); await step(page, 0.8); await S('u_dead');
    await page.evaluate(() => GAME.Game.respawn());
  }
  console.log('errors:', JSON.stringify(errors.slice(0, 20)), await page.evaluate(() => GAME.G.lastError || 'no tick errors'));
  await g.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
function GAME_EL(id) { if (id.startsWith('fire') || id === 'breath_fire' || id === 'spark') return 'fire'; if (/rock|earth|shock/.test(id)) return 'earth'; if (/water|ice|heal|tidal/.test(id)) return 'water'; return 'air'; }
