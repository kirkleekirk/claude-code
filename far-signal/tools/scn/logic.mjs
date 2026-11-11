// Exercises the main systems without relying on rendering output.
const give = (o) => `Object.entries(${JSON.stringify(o)}).forEach(([k,v]) => FS.state.inv[k] = (FS.state.inv[k]||0) + v); FS.ui.dirty = true;`;
export default [
  { run: "FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2500); step(5); return FS.phase;" },
  // mine the nearest scrap node with the beam after crafting the gauntlet
  { run: give({ scrap: 3 }) + "step(15); FS.craft('g_gauntlet'); step(2); return {q: FS.state.quest, un: FS.state.unlocks};" },
  { run: `const p = FS.player, w = FS.world; const nd = w.nodes.list.find(n => n.type==='scrap');
      p.pos.set(nd.x + 2.5, w.groundAt(nd.x+2.5, nd.z, 100), nd.z); p.camYaw = Math.PI/2; p.camPitch = -0.25; step(3);
      FS.input.enabled = true; FS.input.held.fire = true; let hits = 0; for (let i=0;i<70;i++){ step(1); if (p.targetNode) hits++; }
      FS.input.held.fire = false; step(40);
      return {target: hits, alive: nd.alive, scrap: FS.state.inv.scrap};` },
  { run: give({ scrap: 6, pod: 5, ferrite: 30, lumen: 30, chitin: 12, fiber: 12, bloom: 10, gland: 8 }) + "const b=FS.world.base; FS.player.pos.set(b.x+3,b.y,b.z+8); step(2); for (const id of ['c_oxy','b_still','b_fabricator','s_mk1','b_biolab','b_refinery','m_alloy','m_alloy','m_alloy','m_alloy','m_alloy','m_alloy','m_alloy','c_regen','c_quick','c_iron','c_symbiote']) FS.craft(id); step(20); return {q: FS.state.quest, st: FS.state.stations, suit: FS.state.suit, inv: FS.state.inv};" },
  { run: "FS.input.press('use1'); FS.input.press('use4'); step(3); return {buffs: FS.player.buffs, o2: FS.player.o2};" },
  // spawn creatures and fight
  { run: `const p = FS.player; const c = FS.spawnCreature('skitter', p.pos.x + 6, p.pos.y, p.pos.z - 6); const d = FS.spawnCreature('drifter', p.pos.x - 8, p.pos.y+3, p.pos.z - 9); const t = FS.spawnCreature('stalker', p.pos.x + 12, p.pos.y, p.pos.z + 10);
      p.pos.set(p.pos.x + 60, p.pos.y, p.pos.z + 60); c.pos.set(p.pos.x+5,p.pos.y,p.pos.z); d.pos.set(p.pos.x-7,p.pos.y+3,p.pos.z-6); t.pos.set(p.pos.x+10,p.pos.y,p.pos.z+9);
      let minHp = p.hp; for (let i=0;i<150;i++){ step(1); minHp = Math.min(minHp, p.hp); }
      return {hp: p.hp, minHp, states: FS.creatures.map(c => c.type+':'+c.state)};` },
  { run: `const p = FS.player; FS.input.held.fire = true; let kills = 0; for (let i=0;i<260;i++){ const c = FS.creatures.find(c=>!c.dead); if (c) { const cc = c.center(new (p.pos.constructor)()); const dx = cc.x-FS.camera.position.x, dy = cc.y-FS.camera.position.y, dz = cc.z-FS.camera.position.z; p.camYaw = Math.atan2(-dx,-dz); p.camPitch = Math.atan2(dy, Math.hypot(dx,dz)); } step(1); }
      FS.input.held.fire = false; step(30); return {left: FS.creatures.filter(c=>!c.dead).length, inv: FS.state.inv, hp: p.hp, dead: p.dead};` },
  // gate + korr
  { run: give({ alloy: 30, lumen: 30, emberglass: 12, chitin: 10 }) + "const b=FS.world.base; FS.player.pos.set(b.x+3,b.y,b.z+8); FS.player.dead=false; FS.player.hp=100; step(2); FS.craft('b_gate'); FS.craft('b_forge'); step(5); return {st: FS.state.stations, q: FS.state.quest};" },
  { run: "FS.travel('korr'); for (let i=0;i<200;i++){ await wait(100); if (!FS.busy) break; } step(10); return {world: FS.world.def.id, pos: FS.player.pos.toArray().map(v=>+v.toFixed(1)), nodes: FS.world.nodes.list.length, q: FS.state.quest};", shot: 'l_korr' },
  { run: give({ korrite: 40, voltite: 40, heliox: 10, core: 10 }) + "step(20); FS.travel('veyra'); for (let i=0;i<200;i++){ await wait(100); if (!FS.busy) break; } step(5); const b=FS.world.base; FS.player.pos.set(b.x+3,b.y,b.z+8); step(2); for (const id of ['s_mk2','g_cipher','g_arc','g_boots','g_aegis','g_dash','g_gauntlet2','s_mk3']) FS.craft(id); step(10); return {suit: FS.state.suit, un: FS.state.unlocks, q: FS.state.quest};" },
  // abilities
  { run: "const p=FS.player; FS.input.press('dash'); step(8); FS.input.press('shield'); step(3); FS.input.press('jump'); step(6); FS.input.press('jump'); step(6); FS.input.held.jump = true; let maxY = 0; for (let i=0;i<60;i++){ step(1); maxY = Math.max(maxY, p.pos.y - FS.world.groundAt(p.pos.x,p.pos.z,1e4)); } FS.input.held.jump=false; step(40); return {maxY, energy: p.energy, shield: p.shieldCool, onGround: p.onGround};" },
  // vault
  { run: "FS.enterVault('echoes'); for (let i=0;i<100;i++){ await wait(100); if (!FS.busy) break; } step(10); return {type: FS.world.type, n: FS.creatures.length, pos: FS.player.pos.toArray().map(v=>+v.toFixed(1)), regions: FS.world.regions};", shot: 'l_vault' },
  { run: `const w = FS.world, p = FS.player; let log = [];
      for (const c of FS.creatures) c.damage(9999); step(30);
      for (const h of w.hoops) { p.pos.set(h.x, h.y - 1.0, h.z); p.vel.set(0,0,0); step(2); }
      step(80); log.push('doors:' + w.doors.map(d => d.open ? 1 : 0).join(''));
      p.pos.set(w.keyPos.x + 2, 0, w.keyPos.z); step(5); log.push('prompt:' + (p.prompt && p.prompt.label));
      w.takeKey(); step(5); log.push('keys:' + FS.state.keystones);
      return log;` },
  { run: "FS.leaveVault(); for (let i=0;i<100;i++){ await wait(100); if (!FS.busy) break; } step(5); return {type: FS.world.type, q: FS.state.quest, pos: FS.player.pos.toArray().map(v=>+v.toFixed(1))};" },
  // spire + warden + ending
  { run: `FS.state.keystones = 3; const w = FS.world, p = FS.player, sb = w.spireBase; p.pos.set(sb.x, sb.y + 6, sb.z + 20); step(30);
      const boss = FS.boss; let hpMin = p.hp; for (let i=0;i<120;i++){ step(1); hpMin = Math.min(hpMin,p.hp); }
      const r = {boss: !!boss, bossState: boss && boss.state, hpMin, flags: FS.state.flags}; if (boss) boss.damage(99999); step(40);
      p.dead = false; p.hp = 100; p.pos.set(sb.x, sb.y + 5.4, sb.z + 13); step(5); r.prompt = p.prompt && p.prompt.label; FS.activateSpire(); step(10); r.flags2 = FS.state.flags; r.q = FS.state.quest; return r;` },
  { run: "FS.ui.openPanel('craft'); step(1); FS.ui.openPanel('journal','map'); step(1); FS.ui.openPanel('journal','notes'); step(1); FS.ui.openPanel('menu','settings'); step(1); FS.ui.closePanel(); FS.save(); return 'panels ok ' + (localStorage.getItem('farsignal.save.v1')||'').length;" },
];
