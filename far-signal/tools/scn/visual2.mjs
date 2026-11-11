const boot = "FS.newGame(); for (let i=0;i<60;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2600); step(3);";
export default [
  { run: boot + "FS.state.stations.gate = true; FS.state.unlocks.gauntlet = true; FS.state.unlocks.cipher = true; FS.state.suit = 3; FS.player.rebuild(); FS.enterVault('embers'); for (let i=0;i<100;i++){ await wait(100); if (!FS.busy) break; } await wait(1200); const p = FS.player; p.pos.set(34, 0, 14); p.camYaw = -Math.PI/2; p.camPitch = -0.02; step(8);", shot: 'v2_hall' },
  { run: "const p = FS.player; p.pos.set(40, 0, 36); p.camYaw = -Math.PI/2 + 0.5; p.camPitch = -0.1; step(30);", shot: 'v2_pit' },
  { run: "FS.leaveVault(); for (let i=0;i<100;i++){ await wait(100); if (!FS.busy) break; } FS.travel('korr'); for (let i=0;i<200;i++){ await wait(100); if (!FS.busy) break; } await wait(1500); FS.player.camYaw = 2.4; FS.player.camPitch = 0.12; step(4);", shot: 'k2_arrive' },
  { run: "const p = FS.player; p.pos.set(-90, FS.world.groundAt(-90, 60, 1e4), 60); p.camYaw = 0.6; p.camPitch = 0.08; FS.world.flora.warm(p.pos); step(6);", shot: 'k2_field' },
];
