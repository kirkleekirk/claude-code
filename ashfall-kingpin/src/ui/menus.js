// Title, pause, settings (audio/video/accessibility/controls), saves (3 slots + autosave,
// export/import), ending + credits, boot screen.
import { RAMPS } from '../data/palette.js';
import { DIFFICULTY } from '../sim/state.js';
import { exportString, importString, SLOTS } from '../sim/save.js';
import { ACTION_LABELS, keyLabel, DEFAULT_BINDS } from '../input/input.js';
import { drawText, measure } from '../render/font.js';
import { fmtMoney } from '../core/util.js';
import { RANKS, rankOf } from '../data/progress.js';

const K = RAMPS;

export function drawBoot(g, p) {
  const ui = g.ui;
  ui.rect(0, 0, ui.W, ui.H, K.ink[0]);
  drawText(ui.ctx, 'ASHFALL KINGPIN', ui.W / 2, ui.H / 2 - 30, K.rust[3], { align: 'center', scale: 3, shadow: K.ink[1] });
  ui.bar(ui.W / 2 - 100, ui.H / 2 + 10, 200, 8, p, K.amber[2]);
  ui.text(p < 0.2 ? 'Raising the walls...' : p < 0.25 ? 'Validating the master plan...' : 'Baking the wastes...', ui.W / 2, ui.H / 2 + 24, K.bone[1], { align: 'center' });
}

function bigButton(g, id, x, y, w, label, o = {}) { return g.ui.button(id, x, y, w, 16, label, o); }

export function drawTitle(g) {
  const ui = g.ui;
  ui.ctx.fillStyle = 'rgba(18,15,14,0.55)';
  ui.ctx.fillRect(0, 0, ui.W, ui.H);
  drawText(ui.ctx, 'ASHFALL KINGPIN', ui.W / 2, 34, K.rust[3], { align: 'center', scale: 3, shadow: K.ink[0] });
  ui.text('Grow. Forge. Sell. Rob. Launder. Rule.', ui.W / 2, 64, K.sand[3], { align: 'center', shadow: K.ink[0] });
  const w = 170, x = Math.round(ui.W / 2 - w / 2);
  let y = 86;
  if (g.titleMode === 'new') return newGameMenu(g, x, y, w);
  const auto = g.saveMeta('auto');
  const latest = SLOTS.map((s) => [s, g.saveMeta(s)]).filter(([, m]) => m).sort((a, b) => b[1].at - a[1].at)[0];
  if (latest && bigButton(g, 'ti:continue', x, y, w, `Continue (day ${latest[1].day})`, { primary: true, key: 'Enter' })) g.loadSlot(latest[0]);
  if (latest) y += 20;
  if (bigButton(g, 'ti:new', x, y, w, 'New game', { primary: !latest })) g.titleMode = 'new';
  y += 20;
  if (bigButton(g, 'ti:load', x, y, w, 'Load game')) { g.overlay = 'saves'; g.savesFrom = 'title'; }
  y += 20;
  if (bigButton(g, 'ti:settings', x, y, w, 'Settings')) { g.overlay = 'settings'; g.settingsFrom = 'title'; }
  y += 20;
  if (bigButton(g, 'ti:credits', x, y, w, 'Credits')) g.overlay = 'credits';
  void auto;
  ui.text('WASD move | mouse aim | LMB fire | E interact | Tab Ledger | Esc pause', ui.W / 2, ui.H - 22, K.bone[1], { align: 'center', shadow: K.ink[0] });
  ui.text('A fictional post-collapse crime fantasy. Every drug, gun, faction and place is invented.', ui.W / 2, ui.H - 11, K.ink[3], { align: 'center' });
  if (g.overlay === 'saves') drawSaves(g);
  if (g.overlay === 'settings') drawSettings(g);
  if (g.overlay === 'credits') drawCredits(g);
}

function newGameMenu(g, x, y, w) {
  const ui = g.ui;
  g.newDiff = g.newDiff || 'normal';
  g.newTut = g.newTut ?? true;
  ui.panel('ng:panel', x - 60, y - 6, w + 120, 180, { title: 'New game' });
  Object.entries(DIFFICULTY).forEach(([id, d], i) => {
    if (ui.button('ng:diff:' + id, x - 52, y + 10 + i * 18, 90, 15, d.name, { active: g.newDiff === id, tip: d.desc })) g.newDiff = id;
  });
  ui.text(DIFFICULTY[g.newDiff].desc, x + 46, y + 12, K.bone[2], { maxW: w + 56 });
  if (g.newDiff === 'ironman') ui.text('One save. Death is permanent.', x + 46, y + 24, K.heat[2]);
  g.newTut = ui.toggle('ng:tut', x + 46, y + 48, 'Play the tutorial (recommended)', g.newTut, { tip: 'Mags walks you through planting, scavenging, crafting, selling, heat, hiring, a robbery and laundering. Every step is real play.' });
  if (ui.button('ng:start', x + 46, y + 92, w, 16, 'Start', { primary: true, key: 'Enter' })) { g.titleMode = null; g.newGame(g.newDiff, g.newTut); }
  if (ui.button('ng:back', x + 46, y + 112, w, 14, 'Back', { sound: 'ui_back', key: 'Escape' })) g.titleMode = null;
}

export function drawPause(g) {
  const ui = g.ui;
  ui.dim('pa:dim', 0.6);
  const w = 160, h = 160, x = Math.round(ui.W / 2 - w / 2), y = Math.round(ui.H / 2 - h / 2);
  ui.panel('pa', x, y, w, h, { title: 'Paused' });
  let yy = y + 18;
  const b = (id, label, o) => { const r = ui.button(id, x + 8, yy, w - 16, 15, label, o); yy += 18; return r; };
  if (b('pa:resume', 'Resume', { primary: true })) g.overlay = null;
  if (b('pa:save', g.S.ironman ? 'Save (Ironman slot)' : 'Save / Load', { disabled: false })) { g.overlay = 'saves'; g.savesFrom = 'pause'; }
  if (b('pa:settings', 'Settings')) { g.overlay = 'settings'; g.settingsFrom = 'pause'; }
  if (b('pa:help', 'Controls & glossary')) { g.ledgerTab = 9; g.jView = 6; g.overlay = 'ledger'; }
  if (b('pa:title', 'Quit to title', { danger: true })) ui.confirm('Quit to the title screen? Unsaved progress since the last dawn autosave is lost.', () => { g.scene = 'title'; g.S = null; g.act = null; g.overlay = null; g.audio.setMood('menu'); });
  ui.text(g.S ? `Day ${g.S.day}  ${RANKS[rankOf(g.S.rep)].name}  ${DIFFICULTY[g.S.diff].name}` : '', x + w / 2, y + h - 12, K.bone[0], { align: 'center' });
}

export function drawSettings(g) {
  const ui = g.ui, s = g.settings;
  ui.dim('st:dim', 0.6);
  const w = Math.min(420, ui.W - 10), h = Math.min(300, ui.H - 10), x = Math.round(ui.W / 2 - w / 2), y = Math.round(ui.H / 2 - h / 2);
  ui.panel('st', x, y, w, h, { title: 'Settings' });
  const back = () => { g.saveSettings(); g.overlay = g.settingsFrom === 'title' ? null : 'pause'; };
  if (ui.button('st:close', x + w - 14, y + 1, 12, 11, '✗', { sound: 'ui_back' })) back();
  g.setTab = ui.tabs('st:tabs', x + 6, y + 15, w - 12, ['Audio', 'Display', 'Gameplay', 'Controls'], g.setTab || 0);
  let yy = y + 36;
  const row = (label, el) => { ui.text(label, x + 10, yy + 1, K.bone[2]); el(x + 150, yy); yy += 16; };
  if (g.setTab === 0) {
    for (const [k, l] of [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Effects']]) row(l, (xx, yy2) => { const v = ui.slider('st:' + k, xx, yy2, 180, s[k], 0, 1, { step: 0.05 }); if (v !== s[k]) { s[k] = v; g.applyAudio(); } ui.text(Math.round(s[k] * 100) + '%', xx + 188, yy2 + 1, K.bone[1]); });
    row('', (xx) => { s.muteOnBlur = ui.toggle('st:mute', xx, yy, 'Mute when the window loses focus', s.muteOnBlur); });
    row('', (xx) => { s.subtitles = ui.toggle('st:subs', xx, yy, 'Subtitles for important sounds', s.subtitles); });
  } else if (g.setTab === 1) {
    row('UI scale', (xx, yy2) => { [0.8, 1, 1.25, 1.5].forEach((v, i) => { if (ui.button('st:ui:' + v, xx + i * 44, yy2, 40, 13, Math.round(v * 100) + '%', { active: s.uiScale === v, tip: 'Rounded to whole pixels; large values cap at what fits the window.' })) s.uiScale = v; }); });
    row('', (xx) => { s.shake = ui.toggle('st:shake', xx, yy, 'Screen shake', s.shake); });
    row('', (xx) => { s.reduceFlash = ui.toggle('st:flash', xx, yy, 'Reduce flashes (muzzle flash lighting)', s.reduceFlash); });
    row('', (xx) => { const v = ui.toggle('st:cb', xx, yy, 'Colorblind-safe colours (blue/orange)', s.colorblind); if (v !== s.colorblind) { s.colorblind = v; g.saveSettings(); } });
    row('', (xx) => { s.showFps = ui.toggle('st:fps', xx, yy, 'Show FPS', s.showFps); });
  } else if (g.setTab === 2) {
    row('', (xx) => { s.ledgerPause = ui.toggle('st:lp', xx, yy, 'Management menus pause time', s.ledgerPause, { tip: 'On (default): the Ledger and shop panels freeze the world.' }); });
    row('', (xx) => { s.pauseOnBlur = ui.toggle('st:pob', xx, yy, 'Pause when the window loses focus', s.pauseOnBlur); });
    row('', (xx) => { s.hints = ui.toggle('st:hints', xx, yy, 'First-time hints and the morning paper', s.hints); });
  } else {
    const acts = Object.keys(ACTION_LABELS);
    const rowsH = h - 60;
    ui.list('st:binds', x + 8, yy, w - 16, rowsH - 18, 13, acts.length, (i, xx, y2, ww) => {
      const a = acts[i];
      ui.text(ACTION_LABELS[a], xx + 4, y2 + 2, K.bone[2]);
      const waiting = g.rebinding === a;
      if (ui.button('st:bind:' + a, xx + ww - 90, y2, 86, 12, waiting ? 'press a key...' : keyLabel(s.binds[a]), { active: waiting })) { g.rebinding = a; g.input.rebind(a, () => { g.rebinding = null; s.binds = { ...g.input.binds }; g.saveSettings(); }); }
    }, { noClick: true });
    if (ui.button('st:resetbinds', x + 8, y + h - 20, 120, 13, 'Reset to defaults')) { s.binds = { ...DEFAULT_BINDS }; g.input.binds = s.binds; g.saveSettings(); }
  }
  if (ui.button('st:done', x + w - 90, y + h - 20, 82, 14, 'Done', { primary: true })) back();
}

function textArea() { return typeof document !== 'undefined' ? document.getElementById('ak-text') : null; }

export function drawSaves(g) {
  const ui = g.ui;
  ui.dim('sv:dim', 0.6);
  const w = Math.min(380, ui.W - 10), h = 200, x = Math.round(ui.W / 2 - w / 2), y = Math.round(ui.H / 2 - h / 2);
  ui.panel('sv', x, y, w, h, { title: 'Save & load' });
  const close = () => { const ta = textArea(); if (ta) ta.style.display = 'none'; g.overlay = g.savesFrom === 'title' ? null : 'pause'; };
  if (ui.button('sv:close', x + w - 14, y + 1, 12, 11, '✗', { sound: 'ui_back' })) close();
  let yy = y + 18;
  for (const slot of SLOTS) {
    const m = g.saveMeta(slot);
    const name = slot === 'auto' ? 'Autosave (dawn)' : `Slot ${slot.slice(4)}`;
    ui.rect(x + 8, yy, w - 16, 26, K.ink[0]);
    ui.text(name, x + 12, yy + 3, K.bone[3]);
    ui.text(m ? `Day ${m.day}  REP ${m.rep}  ${fmtMoney(m.dirty)} / ${fmtMoney(m.clean)}  ${DIFFICULTY[m.diff] ? DIFFICULTY[m.diff].name : ''}${m.ending ? '  [' + m.ending + ']' : ''}` : 'empty', x + 12, yy + 14, m ? K.bone[1] : K.ink[3], { maxW: w - 140 });
    const ironLock = g.S && g.S.ironman && slot !== 'slot1';
    if (g.S && slot !== 'auto' && ui.button('sv:save:' + slot, x + w - 120, yy + 6, 52, 14, 'Save', { disabled: ironLock || !g.canSave(), tip: !g.canSave() ? "Can't save during a job or a raid." : ironLock ? 'Ironman uses slot 1 only.' : '' })) { if (m) ui.confirm(`Overwrite ${name}?`, () => g.saveSlot(slot), { danger: false }); else g.saveSlot(slot); }
    if (ui.button('sv:load:' + slot, x + w - 64, yy + 6, 52, 14, 'Load', { disabled: !m })) { const doLoad = () => { const ta = textArea(); if (ta) ta.style.display = 'none'; g.loadSlot(slot); }; if (g.S) ui.confirm(`Load ${name}? Unsaved progress is lost.`, doLoad, { danger: false }); else doLoad(); }
    yy += 30;
  }
  const ta = textArea();
  if (g.S && ui.button('sv:export', x + 8, y + h - 20, 110, 14, 'Export string', { tip: 'Shows your save as text (and copies it). Paste it anywhere to back it up.' }) && ta) {
    ta.value = exportString(g.S); ta.style.display = 'block'; ta.focus(); ta.select();
    try { navigator.clipboard && navigator.clipboard.writeText(ta.value); g.toast('Save string copied to the clipboard.', 'good'); } catch (e) { g.toast('Select the text and copy it.', 'info'); }
  }
  if (ui.button('sv:importshow', x + 124, y + h - 20, 110, 14, 'Import string', { tip: 'Paste an export string into the box, then press Load text.' }) && ta) { ta.value = ''; ta.style.display = 'block'; ta.focus(); }
  if (ta && ta.style.display === 'block' && ui.button('sv:importgo', x + 240, y + h - 20, 90, 14, 'Load text', { primary: true })) {
    try { g.S = importString(ta.value); ta.style.display = 'none'; g.beginPlay(); g.toast('Imported save loaded.', 'good'); }
    catch (e) { g.toast(e.message, 'bad'); }
  }
}

export function drawEnding(g) {
  const ui = g.ui, S = g.S;
  ui.dim('en:dim', 0.75);
  const crown = g.endingWhich === 'crown';
  const w = Math.min(420, ui.W - 10), h = 180, x = Math.round(ui.W / 2 - w / 2), y = Math.round(ui.H / 2 - h / 2);
  ui.panel('en', x, y, w, h, { title: crown ? 'THE CROWN' : 'THE LEDGER' });
  drawText(ui.ctx, crown ? 'The Council Hall burns.' : 'The vote passes, 7 to 5.', x + w / 2, y + 22, K.gold[3], { align: 'center', scale: 2, shadow: K.ink[0] });
  ui.wrapText(crown
    ? 'Chancellor Orrin Hale is gone and the Compact answers to you now. The wastes have a king again. Nobody voted for it, but nobody is arguing either.'
    : 'Your fronts are now simply businesses, your crews are simply staff, and your money is simply money. The Ledger balances, and every line of it has your name.', x + 12, y + 46, w - 24, K.bone[3]);
  ui.text(`Day ${S.day}  |  REP ${Math.floor(S.rep)}  |  Crew ${S.crew.length}  |  Fronts ${S.businesses.length}  |  Dirty earned ${fmtMoney(S.stats.dirtyEarned || 0)}`, x + w / 2, y + 104, K.bone[1], { align: 'center', maxW: w - 16 });
  if (ui.button('en:sandbox', x + 12, y + h - 22, w / 2 - 16, 15, 'Credits, then keep playing', { primary: true })) g.toSandbox();
  if (ui.button('en:title', x + w / 2 + 4, y + h - 22, w / 2 - 16, 15, 'Back to title')) { g.saveSlot('auto'); g.scene = 'title'; g.S = null; g.overlay = null; }
}

const CREDITS = [
  'ASHFALL KINGPIN', '', 'Design, code, pixels, synths and words', 'generated procedurally, at runtime, in your browser.', '',
  'Built with: vanilla JavaScript, Canvas 2D, WebAudio.', 'No libraries. No assets. No fonts fetched.', '',
  'Thanks to Mags, who lends at 20%,', 'to Pell, who waters the plots,', 'and to every guard who looked the other way.', '',
  'The wastes keep turning. Sandbox mode: all systems stay live.',
];

export function drawCredits(g) {
  const ui = g.ui;
  ui.dim('cr:dim', 0.85);
  g.creditT = (g.creditT || 0) + 1 / 60;
  const y0 = ui.H - g.creditT * 18;
  CREDITS.forEach((l, i) => ui.text(l, ui.W / 2, Math.round(y0 + i * 14), i === 0 ? K.rust[3] : K.bone[2], { align: 'center' }));
  if (y0 + CREDITS.length * 14 < 0) g.creditT = 0;
  if (ui.button('cr:close', ui.W / 2 - 50, ui.H - 22, 100, 15, g.S ? 'Keep playing' : 'Back', { primary: true, key: 'Escape' })) { g.creditT = 0; g.overlay = null; }
}

export { measure };
