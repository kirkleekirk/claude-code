export default [
  { run: "FS.newGame(); for (let i=0;i<40;i++){ await wait(100); if (FS.phase==='intro' && !FS.busy) break; } await wait(1200); step(60, 1/12); return FS.phase + ' ' + (FS.intro && FS.intro.stage);", shot: 'i_city1' },
  { run: "step(100, 1/12); return FS.intro.stageT;", shot: 'i_city2' },
  { run: "step(80, 1/12); await wait(2000); step(40, 1/12); return FS.intro.stage + ' ' + FS.intro.stageT;", shot: 'i_lab1' },
  { run: "step(150, 1/10); return {stage: FS.intro.stage, T: FS.intro.stageT, action: !FS.ui.el.cineAction.hidden && FS.ui.el.cineAction.textContent};", shot: 'i_lab2' },
  { run: "FS.ui.el.cineAction.click(); step(50, 1/10); const a1 = FS.ui.el.cineAction.textContent; FS.ui.el.cineAction.click(); step(50, 1/10); FS.ui.el.cineAction.click(); step(48, 1/10); return {build: FS.intro.build, a1, action: FS.ui.el.cineAction.textContent};", shot: 'i_lab3' },
  { run: "FS.ui.el.cineAction.click(); step(18, 1/10); return FS.intro.build;", shot: 'i_gate' },
  { run: "step(40, 1/10); for (let i=0;i<80;i++){ await wait(100); step(1); if (FS.phase==='play' && !FS.busy) break; } await wait(2500); step(5); return FS.phase + ' q=' + FS.state.quest;", shot: 'i_arrive' },
];
