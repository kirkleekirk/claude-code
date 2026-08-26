#!/usr/bin/env node
// Drives the built game in a real browser: start a binding, fight wild kin,
// level up, spend a Mote on the lattice, reload from the save.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'tools', 'shots');
mkdirSync(shots, { recursive: true });
const wantShots = process.argv.includes('--shots');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
const failedReqs = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => failedReqs.push(r.url()));
/* this sandbox has no direct route to the font CDN; the fallback stacks cover it */
const isFont = u => /fonts\.(googleapis|gstatic)\.com/.test(u);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const snap = async n => { if (wantShots) await page.screenshot({ path: join(shots, n + '.png') }); };
/* innerText comes back with CSS text-transform applied, so compare lowercased */
const said = async sel => (await page.locator(sel || '#stage').innerText()).replace(/\s+/g, ' ').toLowerCase();
const has = async (needle, sel) => (await said(sel)).includes(needle.toLowerCase());
const inBattle = () => page.locator('.arena').count().then(n => n > 0);
const modalUp = () => page.locator('.veil').count().then(n => n > 0);

async function clearModal() {
  /* an outcome modal lands a beat after the battle screen goes quiet */
  await page.waitForTimeout(220);
  for (let i = 0; i < 4 && await modalUp(); i++) {
    await page.locator('.veil .btn').last().click();
    await page.waitForTimeout(220);
  }
}
/* get back to camp from wherever we are, by whatever door is open */
async function goToCamp() {
  for (let i = 0; i < 14; i++) {
    await clearModal();
    if (await has('the fire is lit')) return true;
    const rail = page.getByRole('button', { name: 'Camp', exact: true });
    if (await rail.count()) { await rail.click(); await page.waitForTimeout(140); continue; }
    const back = page.getByRole('button', { name: 'Back to camp' });
    if (await back.count()) { await back.click(); await page.waitForTimeout(140); continue; }
    await page.waitForTimeout(220);
  }
  return has('the fire is lit');
}
/* play out whatever battle is on screen; returns turns taken */
async function fightItOut() {
  let turns = 0;
  while (turns < 80) {
    if (await modalUp()) break;
    if (!(await inBattle())) break;
    turns++;
    const btns = page.locator('.movebtn:not([disabled])');
    if (await btns.count() === 0) break;
    try { await btns.first().click({ timeout: 4000 }); }
    catch (e) { break; }  /* the outcome modal arrived mid-click */
    await page.waitForTimeout(60);
    if (await modalUp()) break;
  }
  await clearModal();
  return turns;
}

await page.goto(pathToFileURL(join(root, 'dist', 'aetherkin.html')).href);
await page.waitForSelector('.title h1');
ok(await has('aetherkin', '.title h1'), 'title screen renders');
ok(await page.locator('canvas.glyph').count() >= 6, 'creature glyphs draw on the title');
await snap('01-title');

await page.getByRole('button', { name: /Begin|New binding/ }).first().click();
await page.waitForSelector('.starters');
ok(await page.locator('.starter').count() === 4, 'four starters offered');
await page.locator('.starter').nth(0).click();
ok(await has('growth lattice'), 'choosing a starter previews its lattice');
await snap('02-starter');
await page.getByRole('button', { name: /^Bind / }).click();
await page.waitForSelector('.screen');
ok(await has('camp'), 'lands at camp after binding');
await snap('03-camp');

/* --- lattice chart --- */
await page.getByRole('button', { name: 'Party & Lattices' }).click();
await page.waitForSelector('.kincard');
await page.locator('.kincard').first().click();
await page.getByRole('tab', { name: /Lattice/ }).click();
await page.waitForSelector('.latticebox');
ok(await page.locator('.lnode').count() >= 12, `lattice draws all ${await page.locator('.lnode').count()} nodes`);
ok(await page.locator('.latticefield svg path').count() > 10, 'lattice connectors draw');
ok(await page.locator('.lnode[data-state="owned"]').count() === 1, 'only the free core node starts lit');
ok(await page.locator('.lnode.evo').count() === 2, 'both evolution branches appear on the chart');
await page.locator('.lnode[data-state="short"], .lnode[data-state="open"]').first().click();
ok(await has('mote'), 'a node sheet opens with its Mote cost');
await snap('04-lattice');

/* --- go out and fight until the starter levels --- */
await page.getByRole('button', { name: 'Back', exact: true }).click();
await goToCamp();
await page.getByRole('button', { name: 'Go out' }).click();
await page.waitForSelector('.kincard');
await page.locator('.kincard').first().click();
await page.waitForSelector('.screen');
ok(await has('step 0/'), 'route starts at step zero');
await snap('05-route');

let battles = 0, sawBattle = false, totalTurns = 0;
for (let i = 0; i < 60 && battles < 4; i++) {
  if (await inBattle()) {
    if (!sawBattle) {
      sawBattle = true;
      ok(await page.locator('.nameplate').count() === 2, 'both nameplates render in battle');
      ok(await page.locator('.movebtn').count() >= 1, 'moves are offered');
      ok(await page.locator('.log p').count() >= 1, 'the battle log has entries');
      await snap('06-battle');
    }
    const t = await fightItOut();
    totalTurns += t;
    if (t > 0) battles++;
    continue;
  }
  if (await modalUp()) { await clearModal(); continue; }
  /* a loss drops you back at camp — rest and head out again */
  if (await has('the fire is lit')) {
    await page.getByRole('button', { name: 'Rest' }).click();
    await page.getByRole('button', { name: 'Go out' }).click();
    await page.waitForSelector('.kincard');
    await page.locator('.kincard').first().click();
    await page.waitForTimeout(80);
    continue;
  }
  if (!(await has('press on')) && !(await has('face the warden'))) break;
  const patrolBtn = page.getByRole('button', { name: 'Patrol for kin' });
  if (await patrolBtn.count()) await patrolBtn.click();
  else await page.getByRole('button', { name: 'Press on' }).click();
  await page.waitForTimeout(90);
}
ok(sawBattle, 'pressing on starts wild battles');
ok(battles >= 2, `fought ${battles} battles to a conclusion (${totalTurns} turns total)`);
await snap('07-after-battles');

/* --- spend a Mote --- */
ok(await goToCamp(), 'you can always get back to camp');
await page.getByRole('button', { name: 'Party & Lattices' }).click();
await page.waitForSelector('.kincard');
await page.locator('.kincard').first().click();
await page.getByRole('tab', { name: /Lattice/ }).click();
await page.waitForSelector('.latticebox');
const freeBefore = Number((await page.locator('.costtag').first().innerText()).match(/(\d+) free/)?.[1] ?? 0);
ok(freeBefore > 0, `battles paid out Motes (${freeBefore} free)`);
const openNode = page.locator('.lnode[data-state="open"]').first();
ok(await openNode.count() > 0, 'at least one node is affordable');
await openNode.click();
const lightBtn = page.getByRole('button', { name: /^Light it/ });
ok(await lightBtn.count() === 1, 'the sheet offers to light the node');
await lightBtn.click();
await page.waitForTimeout(220);
const freeAfter = Number((await page.locator('.costtag').first().innerText()).match(/(\d+) free/)?.[1] ?? -1);
ok(freeAfter >= 0 && freeAfter < freeBefore, `lighting a node spends Motes (${freeBefore} -> ${freeAfter})`);
ok(await page.locator('.lnode[data-state="owned"]').count() >= 2, 'the node is now lit on the chart');
await snap('08-lattice-spent');

/* --- loadout --- */
await page.getByRole('tab', { name: /Loadout/ }).click();
await page.waitForSelector('.slotrow');
ok(await page.locator('.slotrow.on').count() >= 1, 'loadout shows equipped things');
ok(await page.locator('.slotrow').count() >= 4, 'the learned pool lists universal moves too');
await snap('09-loadout');

/* --- save round-trip --- */
await page.goto(pathToFileURL(join(root, 'dist', 'aetherkin.html')).href);
await page.waitForSelector('.title');
ok(await has('continue', '.title'), 'the save is picked up on reload');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('.screen');
ok(await has('camp'), 'continuing restores the game');
await page.getByRole('button', { name: 'Party & Lattices' }).click();
await page.waitForSelector('.kincard');
await page.locator('.kincard').first().click();
await page.getByRole('tab', { name: /Lattice/ }).click();
await page.waitForSelector('.latticebox');
ok(await page.locator('.lnode[data-state="owned"]').count() >= 2, 'the lit node survived the reload');
await snap('10-reloaded');

/* --- shop & codex --- */
await page.getByRole('button', { name: 'Back', exact: true }).click();
await goToCamp();
await page.getByRole('button', { name: 'Quartermaster' }).click();
await page.waitForSelector('.itemrow');
ok(await page.locator('.itemrow').count() === 10, 'the quartermaster stocks ten lines');
await snap('11-shop');
await page.getByRole('button', { name: 'Back to camp' }).click();
await page.getByRole('button', { name: 'Codex' }).click();
await page.waitForSelector('.dexgrid');
ok(await page.locator('.dexcell').count() === 28, 'codex lists all 28 kin');
ok(await page.locator('.dexcell:not(.unknown)').count() >= 1, 'kin you have met are legible in the codex');
await snap('12-codex');

/* --- responsive --- */
await page.setViewportSize({ width: 390, height: 840 });
await page.waitForTimeout(250);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 2, `no horizontal overflow at 390px wide (${overflow}px)`);
await snap('13-mobile');

const badReqs = failedReqs.filter(u => !isFont(u));
ok(badReqs.length === 0, 'no failed requests beyond the offline font CDN' + (badReqs.length ? ': ' + badReqs.slice(0, 4).join(', ') : ''));
ok(errors.length === 0, 'no console or page errors' + (errors.length ? ':\n     ' + errors.slice(0, 10).join('\n     ') : ''));
await browser.close();
console.log(`\n${fails ? 'FAILED' : 'PASSED'}  ${checks - fails}/${checks} browser checks`);
process.exit(fails ? 1 : 0);
