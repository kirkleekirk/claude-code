const boot = "FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2600); FS.ui.el.say.hidden = true; FS.state.suit = 2; FS.state.unlocks.gauntlet = true; FS.player.rebuild(); step(3);";
const go = (x, z, yaw, pitch, time) => `{ const p = FS.player, w = FS.world; p.pos.set(${x}, w.groundAt(${x}, ${z}, 1e4), ${z}); p.vel.set(0,0,0); p.camYaw = ${yaw}; p.camPitch = ${pitch}; ${time !== undefined ? `FS.sky.time = ${time};` : ''} FS.clearEntities(); w.flora.warm(p.pos); step(5); FS.ui.el.toasts.innerHTML = ''; FS.ui.el.banner.hidden = true; }`;
export default [
  { run: boot + go(-20, 262, 0.25, 0.02, 0.705), shot: 'b1_basin_dusk' },
  { run: go(40, 300, 2.7, -0.02, 0.5), shot: 'b2_lagoon_noon' },
  { run: go(-380, 70, 1.2, 0.06, 0.74), shot: 'b3_crystal_sunset' },
  { run: go(-380, 70, 0.3, 0.12, 0.95), shot: 'b4_crystal_night' },
  { run: go(330, 115, -1.3, 0.1, 0.33), shot: 'b5_mesa_morning' },
  { run: go(20, -395, 0.0, 0.3, 0.71), shot: 'b6_spire' },
  { run: go(-452 + 14, 96 + 3, 1.45, 0.08, 0.6), shot: 'b7_vault_entrance' },
];
