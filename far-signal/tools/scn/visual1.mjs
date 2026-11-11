const boot = "FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2600); step(3);";
export default [
  { run: boot + "FS.state.stations.gate = true; FS.state.unlocks.gauntlet = true; FS.state.suit = 2; FS.player.rebuild(); FS.travel('korr'); for (let i=0;i<200;i++){ await wait(100); if (!FS.busy) break; } await wait(1500); FS.player.camYaw = 0.5; FS.player.camPitch = 0.05; step(4);", shot: 'k_arrive' },
  { run: "const p = FS.player; p.pos.set(60, FS.world.groundAt(60, -80, 1e4), -80); p.camYaw = -1.2; p.camPitch = 0.0; FS.world.flora.warm(p.pos); step(6);", shot: 'k_field' },
  { run: "FS.travel('veyra'); for (let i=0;i<200;i++){ await wait(100); if (!FS.busy) break; } await wait(1500); FS.state.unlocks.cipher = true; FS.enterVault('echoes'); for (let i=0;i<100;i++){ await wait(100); if (!FS.busy) break; } await wait(1200); step(6);", shot: 'v_start' },
  { run: "const p = FS.player; p.pos.set(34, 0, 10); p.camYaw = -Math.PI/2; p.camPitch = -0.05; step(8);", shot: 'v_hall' },
  { run: "const p = FS.player; p.pos.set(72, 0, 14); p.camYaw = -Math.PI/2 + 0.3; p.camPitch = 0.05; for (const c of FS.creatures) c.damage(9999); step(40);", shot: 'v_rings' },
];
