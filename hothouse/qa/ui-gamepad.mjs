// Gamepad-only walkthrough of the interface. Every step is driven by injected controller actions
// (directions, A/B, LB/RB, holds) through the lab's real Input, and checked against UI state.
// Usage: node qa/ui-gamepad.mjs   →  screenshots in qa/out/ui/gamepad/
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, OUT, startServer } from './lib.mjs';

const dir = resolve(OUT, 'ui', 'gamepad');
mkdirSync(dir, { recursive: true });
const server = await startServer();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
const problems = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(`${server.url}ui-lab.html?qa=1&input=gamepad&screen=clickToStart-ready`);
await page.waitForFunction(() => globalThis.__UILAB__?.ready === true, null, { timeout: 120000 });

let passed = 0;
let failed = 0;
let shot = 0;
const lab = (fn, arg) => page.evaluate(fn, arg);
const press = (action, value = 1) => lab(([a, v]) => globalThis.__UILAB__.press(a, v), [action, value]);
const hold = (action, ms) => lab(([a, m]) => globalThis.__UILAB__.hold(a, m), [action, ms]);
const open = (id) => lab((s) => globalThis.__UILAB__.open(s), id);
const focused = () => lab(() => globalThis.__UILAB__.focusedText());
const state = () => lab(() => {
  const ui = globalThis.__UILAB__.ui;
  return { top: ui.top.value, frontend: ui.frontend.value, layers: ui.layers.value.map((l) => l.kind), phone: ui.phoneOpen.value, route: ui.phoneRoute.value.app, started: ui.started.value };
});
const logHas = (text) => lab((t) => globalThis.__UILAB__.log.some((e) => e.includes(t)), text);
const focusedIn = (sel) => lab((s) => !!document.querySelector('[data-focused]')?.closest(s), sel);
const wait = (ms) => page.waitForTimeout(ms);
const snap = async (name) => page.screenshot({ path: resolve(dir, `${String(++shot).padStart(2, '0')}-${name}.png`) });

function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Press a direction until the focused element's text contains `text` (max `tries`). */
async function navTo(text, dir = 'uiY', value = 1, tries = 10) {
  for (let i = 0; i < tries; i++) {
    if ((await focused()).includes(text)) return true;
    await press(dir, value);
  }
  return (await focused()).includes(text);
}

// 1. Click-to-start with A.
await press('uiConfirm');
check('A starts the game from click-to-start', (await state()).started === true);

// 2. Main menu → New game.
await open('mainMenu');
await wait(300);
check('main menu focuses Continue first', (await focused()).includes('Continue'), await focused());
await snap('main-menu');
check('stick down reaches New game', await navTo('New game'));
await press('uiConfirm');
await wait(250);
check('A opens New Game', (await state()).frontend === 'newGame');

// 3. New Game: pick a look, an outfit and Sweaty, then start.
await wait(250);
check('New Game focuses the selected look', (await focused()).includes('Riviera'), await focused());
await press('uiX', 1);
await press('uiConfirm');
check('right + A picks Boardwalk', (await focused()).includes('Boardwalk'));
// The look grid has several rows: keep pushing down until an outfit swatch has focus.
for (let i = 0; i < 6 && !(await focusedIn('.hh-swatch-row')); i++) await press('uiY', 1);
check('down reaches the outfit row', await focusedIn('.hh-swatch-row'), await focused());
await press('uiX', 1);
await press('uiConfirm');
check('right + A picks the outfit', await lab(() => document.querySelector('[data-focused]')?.getAttribute('aria-pressed') === 'true'));
const palette = await lab(() => {
  const el = document.querySelector('[data-focused]');
  return el ? [...el.parentElement.children].indexOf(el) : -1;
});
await press('uiY', 1);
check('down reaches Difficulty', (await focused()).includes('Difficulty'), await focused());
await press('uiX', 1);
check('right on Difficulty selects Sweaty', (await focused()).includes('Difficulty') && (await lab(() => document.querySelector('[data-focused] .hh-segmented-opt.is-on')?.textContent?.trim())) === 'Sweaty');
await snap('new-game');
const reachedStart = await navTo('Start the season', 'uiY', 1, 4) || await navTo('Start the season', 'uiX', 1, 3);
check('reach Start the season', reachedStart, await focused());
await press('uiConfirm');
check(`Start calls newGame with look 1, outfit ${palette} and Sweaty`, await logHas(`newGame:1:${palette}:sweaty`), JSON.stringify(await lab(() => globalThis.__UILAB__.log.filter((e) => e.startsWith('newGame')))));

// 4. Settings: tabs with LB/RB, adjust a slider, back out.
await open('mainMenu');
await wait(250);
check('stick reaches Settings', await navTo('Settings'));
await press('uiConfirm');
await wait(300);
check('A opens Settings', (await state()).top === 'settings');
const tabs = [];
for (let i = 0; i < 5; i++) {
  tabs.push(await lab(() => document.querySelector('.hh-tab.is-on')?.textContent?.trim() ?? ''));
  await press('uiTabNext');
  await wait(120);
}
check('RB cycles all five settings tabs', new Set(tabs).size === 5, tabs.join(' → '));
// Land on Accessibility: first row is the interface size slider.
while ((await lab(() => document.querySelector('.hh-tab.is-on')?.textContent?.trim())) !== 'Accessibility') await press('uiTabNext');
await wait(250);
const before = await lab(() => globalThis.__UILAB__.settings.get('a11y.uiScale'));
await press('uiX', 1);
const after = await lab(() => globalThis.__UILAB__.settings.get('a11y.uiScale'));
check('right on a slider row adjusts it', after === before + 5, `${before} → ${after}`);
await press('uiX', -1);
await snap('settings-accessibility');
await press('uiBack');
await wait(200);
check('B closes Settings', (await state()).top === 'mainMenu');

// 5. Load and Credits open and close with B.
check('stick reaches Load game', await navTo('Load game', 'uiY', -1));
await press('uiConfirm');
await wait(250);
check('A opens Load', (await state()).top === 'saveLoad');
await snap('load');
await press('uiBack');
await wait(200);
check('B closes Load', (await state()).top === 'mainMenu');
check('stick reaches Credits', await navTo('Credits'));
await press('uiConfirm');
await wait(250);
check('A opens Credits', (await state()).top === 'credits');
await press('uiBack');
await wait(200);
check('B closes Credits', (await state()).top === 'mainMenu');

// 6. In play: Menu opens pause; Controls; B back; B resumes.
await open('hud');
await wait(200);
await press('pause');
await wait(250);
check('Menu opens Pause during play', (await state()).top === 'pause');
check('Pause focuses Resume', (await focused()).includes('Resume'));
check('stick reaches Controls', await navTo('Controls'));
await press('uiConfirm');
await wait(300);
const controlsTab = await lab(() => document.querySelector('.hh-tab.is-on')?.textContent?.trim());
check('Controls opens Settings on the Controls tab', (await state()).top === 'settings' && controlsTab === 'Controls', controlsTab);
await snap('controls');
await press('uiBack');
await wait(200);
check('B returns to Pause', (await state()).top === 'pause');
await press('uiBack');
await wait(200);
check('B on Pause resumes play', (await state()).layers.length === 0);

// 7. Phone: D-pad up opens it, navigate to Help, B back twice closes it.
await press('phone');
await wait(400);
check('Phone opens from play', (await state()).phone === true);
await snap('phone-home');
check('stick reaches the Help app', await navTo('Help', 'uiY', 1, 12));
await press('uiConfirm');
await wait(300);
check('A opens Help', (await state()).route === 'help');
await press('uiTabNext');
await wait(200);
await press('uiBack');
await wait(200);
await press('uiBack');
await wait(200);
await press('uiBack');
await wait(350);
check('B backs out to home and closes the phone', (await state()).phone === false, JSON.stringify(await state()));

// 8. Dialogue choices: A reveals, right picks the second choice, A confirms.
await lab(() => {
  const ui = globalThis.__UILAB__.ui;
  globalThis.__dlg = null;
  void ui.dialogue({ lines: [{ speaker: 'Don Ignacio Vale', text: 'Will you pay on time?', choices: ['Yes', 'Give me a month', 'Who’s asking?'] }] }).then((r) => (globalThis.__dlg = r));
});
await wait(200);
await press('uiConfirm');
await wait(300);
await press('uiX', 1);
await snap('dialogue-choices');
await press('uiConfirm');
await wait(200);
const dlg = await lab(() => globalThis.__dlg);
check('dialogue resolves with the chosen line', dlg && dlg.choice === 1, JSON.stringify(dlg));

// 9. Hold-to-confirm: danger confirm starts on Cancel; right then hold A.
await lab(() => {
  globalThis.__conf = null;
  void globalThis.__UILAB__.ui.confirm({ title: 'Delete · Slot 1', body: 'This can’t be undone.', confirm: 'Delete', danger: true }).then((v) => (globalThis.__conf = v));
});
await wait(300);
check('danger confirm focuses Cancel', (await focused()).includes('Cancel'), await focused());
await press('uiX', 1);
await press('uiConfirm');
await wait(150);
check('a tap does not confirm a hold action', (await lab(() => globalThis.__conf)) === null);
await hold('uiConfirm', 850);
await wait(150);
check('holding A confirms', (await lab(() => globalThis.__conf)) === true);

// 10. Quick wheel: hold LB, push right, release to choose.
await open('hud');
await lab(() => {
  const ui = globalThis.__UILAB__.ui;
  const log = globalThis.__UILAB__.log;
  ui.setQuickWheel(['car', 'radio', 'bag', 'wait', 'photo', 'map'].map((id, i) => ({ id, label: id, icon: ['car', 'radio', 'bag', 'hourglass', 'camera', 'map'][i], run: () => log.push(`wheel:${id}`) })));
  globalThis.__UILAB__.input.inject('quickWheel', 1);
  globalThis.__UILAB__.input.inject('lookX', 1);
});
await wait(400);
check('holding LB opens the wheel', await lab(() => globalThis.__UILAB__.ui.wheelOpen.value));
await snap('quick-wheel');
await lab(() => {
  globalThis.__UILAB__.input.inject('quickWheel', null);
  globalThis.__UILAB__.input.inject('lookX', null);
});
await wait(200);
check('releasing chooses the slot under the stick', await logHas('wheel:bag'));

// 11. Cards close with A.
for (const card of ['rankUp', 'shiftReport', 'busted']) {
  await open(card);
  await wait(400);
  await press('uiConfirm');
  await wait(250);
  check(`A closes ${card}`, (await state()).layers.length === 0);
}

// 12. Photo Mode: the panel opens on Take photo; climb to Field of view and adjust it,
// B to the free camera, Y back to the panel.
await open('photoMode');
await wait(300);
check('Photo Mode focuses Take photo', (await focused()).includes('Take photo'), await focused());
const fov0 = await lab(() => globalThis.__UILAB__.ui.layers.value[0].controls.state.value.fov);
check('stick climbs to Field of view', await navTo('Field of view', 'uiY', -1, 10), await focused());
await press('uiX', 1);
const fov1 = await lab(() => globalThis.__UILAB__.ui.layers.value[0].controls.state.value.fov);
check('stick adjusts Photo Mode values', fov1 === fov0 + 1, `${fov0} → ${fov1}`);
await press('uiBack');
await wait(200);
check('B switches to the free camera', (await lab(() => globalThis.__UILAB__.ui.layers.value[0].controls.mode.value)) === 'camera');
await lab(() => globalThis.__UILAB__.input.setBaseContext('photo'));
await press('photoHideUi');
await wait(200);
check('Y brings the panel back', (await lab(() => globalThis.__UILAB__.ui.layers.value[0].controls.mode.value)) === 'panel');

if (problems.length) {
  failed += problems.length;
  console.log(`✗ console problems:\n${problems.join('\n')}`);
}
console.log(`\ngamepad walkthrough: ${passed} passed, ${failed} failed → ${dir}`);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
