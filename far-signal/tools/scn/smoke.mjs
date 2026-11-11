export default [
  { run: "step(3);", shot: 't_title' },
  { run: "FS.newGame(); for (let i=0;i<40;i++){ await wait(100); step(2); if (FS.phase==='play' && !FS.busy) break; } return FS.phase + ' busy=' + FS.busy;" },
  { run: "await wait(2600); step(20); return {pos: FS.player.pos.toArray().map(v=>+v.toFixed(1)), hp: FS.player.hp, q: FS.state.quest};", shot: 't_spawn' },
];
