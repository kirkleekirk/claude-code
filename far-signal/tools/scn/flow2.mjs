export default [
  // fresh game: hand-salvage scrap through the interact prompt, craft, save, reload, continue
  { run: `FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2600); step(3);
     const p = FS.player, w = FS.world; let got = [];
     for (let k=0;k<3;k++){ const nd = w.nodes.list.find(n => n.type==='scrap' && n.alive); p.pos.set(nd.x+1.2, w.groundAt(nd.x+1.2,nd.z,1e4), nd.z); step(3); got.push(p.prompt && p.prompt.label); FS.input.press('interact'); step(50); }
     FS.craft('g_gauntlet'); step(5); FS.save();
     return {got, scrap: FS.state.inv.scrap, q: FS.state.quest, un: FS.state.unlocks, o2: Math.round(p.o2)};` },
  { run: "FS.quitToTitle(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='title' && !FS.busy) break; } const t = FS.phase; FS.continueGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } step(5); return {t, phase: FS.phase, q: FS.state.quest, un: FS.state.unlocks, pos: FS.player.pos.toArray().map(v=>+v.toFixed(1))};" },
  // thruster flight to the sea stack from the nearest shore
  { run: `const p = FS.player, w = FS.world; FS.state.suit = 3; FS.state.unlocks.boots = true; p.rebuild(); p.fullRestore(); p.pos.set(-548, w.groundAt(-548,-259,1e4), -259); step(3);
     const tx = -628, tz = -300; FS.input.enabled = true; let reached = false, maxY = 0, t = 0;
     FS.input.press('jump'); step(8);
     for (let i=0;i<700;i++){ p.camYaw = Math.atan2(-(tx-p.pos.x), -(tz-p.pos.z)); FS.input.keys.up = true; const d = Math.hypot(tx-p.pos.x, tz-p.pos.z); FS.input.held.jump = p.pos.y < 50 || d > 30 ? (p.pos.y < 49) : false; step(1); maxY = Math.max(maxY, p.pos.y); t++; if (d < 20 && p.onGround && p.pos.y > 40) { reached = true; break; } if (p.swimming) break; }
     FS.input.keys.up = false; FS.input.held.jump = false;
     return {reached, maxY: Math.round(maxY), energy: Math.round(p.energy), time: (t/30).toFixed(1), y: p.pos.y.toFixed(1), swimming: p.swimming};` },
  // embers dais reachable with double jump
  { run: `const p = FS.player, w = FS.world, v = w.def.pois.vaultEmbers; FS.state.suit = 2; p.rebuild(); p.fullRestore();
     p.pos.set(v.x - 12, w.groundAt(v.x-12, v.z+3, 1e4), v.z + 3); step(3); const y0 = p.pos.y; FS.input.enabled = true;
     p.camYaw = Math.atan2(-(v.x-p.pos.x), -(v.z-p.pos.z)); FS.input.keys.up = true; step(6); FS.input.press('jump'); step(9); FS.input.press('jump'); let maxY = 0; for (let i=0;i<50;i++){ step(1); maxY = Math.max(maxY,p.pos.y-y0); }
     FS.input.keys.up = false; return {y0, rise: (p.pos.y - y0).toFixed(2), maxY: maxY.toFixed(2), onGround: p.onGround, prompt: p.prompt && p.prompt.label};` },
];
