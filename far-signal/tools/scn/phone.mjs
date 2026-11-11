const give = (o) => `Object.entries(${JSON.stringify(o)}).forEach(([k,v]) => FS.state.inv[k] = (FS.state.inv[k]||0) + v); FS.ui.dirty = true;`;
export default [
  { run: "step(3);", shot: 'p_title' },
  { run: "FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2600); step(4);", shot: 'p_hud' },
  { run: give({ scrap: 9, pod: 6, ferrite: 30, lumen: 30, chitin: 12, fiber: 12, bloom: 10, gland: 8, korrite: 20, voltite: 20, alloy: 30, emberglass: 8 }) + "for (const id of ['g_gauntlet','c_oxy','b_still','b_fabricator','s_mk1','b_biolab','b_refinery','c_regen','b_gate','b_forge','g_arc','g_aegis']) FS.craft(id); FS.state.unlocks.dash = true; FS.ui.dirty = true; step(6); const nd = FS.world.nodes.list.find(n => n.type==='scrap'); FS.player.pos.set(nd.x+1.5, FS.player.pos.y, nd.z); step(4);", shot: 'p_hud2' },
  { run: "FS.ui.openPanel('craft','gear'); step(1);", shot: 'p_craft' },
  { run: "FS.ui.openPanel('journal','map'); step(1);", shot: 'p_map' },
  { run: "FS.ui.openPanel('menu','settings'); step(1);", shot: 'p_menu' },
];
