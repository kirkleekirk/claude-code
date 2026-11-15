// QA harness for Second Shift. Needs Playwright:  npm i playwright  (then: npx playwright install chromium)
//   node tools/qa.mjs validate          data sanity (encounters, calls, shifts, heroes)
//   node tools/qa.mjs fuzz [iters]      random battles, every ability, invariant checks
//   node tools/qa.mjs bot [smart|mid|lazy] [runs]   plays all shifts through the model, prints a campaign report
//   node tools/qa.mjs sweep             AI-vs-AI win rates / round counts per encounter
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');   // resolves local or globally installed Playwright
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd = 'validate', a1, a2] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
await page.goto(pathToFileURL(join(root, 'index.html')).href);
await page.waitForTimeout(300);

const tasks = {
  validate: () => page.evaluate(() => {
    const out = [];
    for (const [id, e] of Object.entries(ENCOUNTERS)) {
      const occ = new Map(); const add = (k, w) => { if (occ.has(k)) out.push(`${id}: overlap at ${k} (${occ.get(k)} & ${w})`); else occ.set(k, w); };
      HERO_SPAWNS.forEach(([x, y]) => add(x + ',' + y, 'hero spawn'));
      e.en.forEach(([t, x, y]) => { if (!ENEMIES[t]) out.push(`${id}: unknown enemy ${t}`); add(x + ',' + y, 'enemy ' + t); });
      e.obs.forEach(([x, y, t]) => add(x + ',' + y, 'obstacle ' + t));
    }
    for (const [id, c] of Object.entries(CALLS)) {
      if (c.fight && !ENCOUNTERS[c.fight]) out.push(`call ${id}: missing encounter`);
      if (!DISTRICTS[c.d]) out.push(`call ${id}: bad district`);
      (c.bonus || []).forEach(t => { if (!TAGS[t]) out.push(`call ${id}: bad tag ${t}`); });
      ['ok', 'great', 'bad', 'blurb'].forEach(k => { if (!c[k]) out.push(`call ${id}: missing ${k}`); });
    }
    for (let n = 1; n <= 14; n++) buildSchedule(n).forEach(e => { if (!CALLS[e.tpl]) out.push(`shift ${n}: unknown call ${e.tpl}`); });
    HERO_ORDER.forEach(id => { const H = HEROES[id]; if (H.kit.length !== 4 || !H.kit[3].ult) out.push(`${id}: kit shape`); if (H.perks.length !== 3) out.push(`${id}: perks`); });
    return out.length ? out.join('\n') : 'all data valid';
  }),

  fuzz: () => page.evaluate((iters) => {
    G.save = newSave('F'); HERO_ORDER.forEach(id => { G.save.heroes[id].own = true; });
    const problems = [], rnd = a => a[Math.floor(Math.random() * a.length)]; let actions = 0;
    const check = (B, tag) => { const seen = new Set(); for (const u of B.units) { if (!u.alive) continue; const k = u.x + ',' + u.y; if (u.x < 0 || u.x >= BW || u.y < 0 || u.y >= BH) problems.push(tag + ' OOB ' + u.name); if (seen.has(k)) problems.push(tag + ' OVERLAP ' + u.name + ' ' + k); seen.add(k); if (obsAt(B, u.x, u.y)) problems.push(tag + ' ON OBSTACLE ' + u.name); if (!(u.hp >= 0 && u.hp <= u.maxHp + 0.001)) problems.push(tag + ' HP ' + u.name); if (u.hype < 0 || u.hype > 100.001) problems.push(tag + ' HYPE ' + u.name); if (!Number.isFinite(u.nextAct)) problems.push(tag + ' NEXTACT'); } };
    for (let i = 0; i < iters && problems.length < 20; i++) {
      const ids = []; const n = 1 + Math.floor(Math.random() * 3); while (ids.length < n) { const id = rnd(HERO_ORDER); if (!ids.includes(id)) ids.push(id); }
      HERO_ORDER.forEach(id => { const hs = G.save.heroes[id]; hs.spent = { combat: 0, vigor: 0, mobility: 0, charisma: 0, intellect: 0 }; for (let k = 0; k < Math.floor(Math.random() * 8); k++) hs.spent[rnd(STATS)]++; hs.perks = HEROES[id].perks.filter(() => Math.random() < 0.4).map(p => p.id); });
      const B = newBattle({ fight: rnd(Object.keys(ENCOUNTERS)) }, ids);
      for (let step = 0; step < 60 && !B.over; step++) {
        const u = nextUnit(B); if (!u) break; const ev = []; let st;
        try { st = beginTurn(B, u, ev); } catch (e) { problems.push('beginTurn ' + e.message); break; }
        check(B, 'begin'); if (checkOver(B)) break; if (st === 'dead') continue;
        if (st === 'ok') {
          if (Math.random() < 0.6) { const R0 = reachable(B, u); const k = rnd([...R0.dist.keys()]); const [x, y] = k.split(',').map(Number); moveUnitLogic(B, u, pathTo(R0, u, x, y), []); check(B, 'move'); }
          for (const ab of u.kit) for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { if (!isLegalTarget(B, u, ab, { x, y })) continue; try { const C = cloneB(B); useAbility(C, C.units.find(q => q.uid === u.uid), ab, { x, y }, [], true); check(C, 'dry:' + ab.id); } catch (e) { problems.push('DRY ' + u.id + '/' + ab.id + ' ' + e.message); } }
          const usable = u.kit.filter(a => a.ult ? u.hype >= 100 : canUse(u, a));
          if (usable.length) { const ab = rnd(usable), c = []; for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) if (isLegalTarget(B, u, ab, { x, y })) c.push({ x, y }); if (c.length) { try { useAbility(B, u, ab, rnd(c), ev, false); actions++; } catch (e) { problems.push('REAL ' + u.id + '/' + ab.id + ' ' + e.message); break; } check(B, 'after:' + ab.id); } }
        }
        if (u.hype < 100 && Math.random() < 0.3) u.hype = 100;
        if (checkOver(B)) break; endTurn(B, u);
      }
    }
    return problems.length ? problems.slice(0, 15).join('\n') : `ok: ${actions} real actions, no invariant violations`;
  }, +a1 || 300),

  sweep: () => page.evaluate(() => {
    G.save = newSave('T'); HERO_ORDER.forEach(id => { G.save.heroes[id].own = true; });
    const setLv = n => HERO_ORDER.forEach(id => { const hs = G.save.heroes[id]; hs.spent = { combat: 0, vigor: 0, mobility: 0, charisma: 0, intellect: 0 }; for (let i = 0; i < n; i++) hs.spent[i % 3 === 2 ? 'vigor' : HEROES[id].power]++; });
    const cfg = [['armored', 2, ['anvil', 'skylark', 'velvet']], ['docks', 3, ['anvil', 'skylark', 'fuse']], ['gator', 3, ['anvil', 'velvet', 'bulwark']], ['bots', 4, ['anvil', 'skylark', 'fuse']], ['cult', 5, ['anvil', 'cinder', 'bulwark']], ['apex', 5, ['anvil', 'velvet', 'fuse']], ['mecha', 6, ['anvil', 'velvet', 'bulwark']], ['prince', 7, ['anvil', 'fuse', 'bulwark']]];
    return cfg.map(([enc, n, ids]) => { setLv(n); let w = 0, r = 0, k = 0; const N = 24; for (let i = 0; i < N; i++) { const s = simBattle({ fight: enc, tier: 3 }, ids).sum; if (s.win) w++; r += s.rounds; k += s.kos; } return `${enc.padEnd(8)} pts=${n} win ${w}/${N} rounds ${(r / N).toFixed(1)} (par ${ENCOUNTERS[enc].par}) KOs ${(k / N).toFixed(1)}`; }).join('\n');
  }),

  bot: () => page.evaluate(({ mode, runs }) => {
    const combos = (arr, k) => { const out = []; const rec = (s, c) => { if (c.length === k) { out.push(c.slice()); return; } for (let i = s; i < arr.length; i++) { c.push(arr[i]); rec(i + 1, c); c.pop(); } }; rec(0, []); return out; };
    const smart = mode === 'smart' || mode === 'mid', spend = mode === 'smart', lines = [];
    for (let run = 0; run < runs; run++) {
      G.save = newSave('Bot'); G.mode = 'bot'; lines.push(`--- run ${run + 1} (${mode})`);
      for (let no = 1; no <= 12; no++) {
        startShift(no); const sh = G.sh; let guard = 0, n = 0, sum = 0;
        while (!sh.ended && guard++ < 40000) {
          for (const call of openCalls().sort((a, b) => a.deadline - b.deadline)) {
            const avail = readyHeroes(); if (!avail.length) break; let best = null;
            if (smart) { for (let k = 1; k <= call.slots; k++) for (const t of combos(avail, k)) { const ch = calcChance(call, t); const sc = ch.chance - 0.035 * t.length - t.reduce((a, id) => a + (isHurt(id) ? 0.05 : 0), 0); if (!best || sc > best.sc) best = { t, ch, sc }; } }
            else { const id = avail[Math.floor(Math.random() * avail.length)]; best = { t: [id], ch: calcChance(call, [id]), sc: 0 }; }
            if (best && (best.ch.chance >= (smart ? 0.7 : 0) || call.deadline - sh.t < 25)) {
              if (call.fight && (call.boss || smart)) { dispatchTeam(call, best.t, 'command'); const r = simBattle(call, best.t); finishMission(call, r.sum.outcome, { ko: r.sum.koIds, returning: call.trip }); } else dispatchTeam(call, best.t, 'auto');
              n++; sum += best.ch.chance;
            }
          }
          sh.calls.forEach(c => { if (c.status === 'active' && c.checkAt != null && !c.checkDone && sh.t >= c.checkAt) { c.checkDone = true; c.checkBonus = smart ? 0.12 : 0; } });
          tickShift(0.5);
        }
        const t = sh.tally;
        lines.push(`S${String(no).padStart(2)} ${sh.report.grade} ★${sh.report.stars} | F${t.flawless} S${t.success} C${t.scrape} X${t.fail} M${t.missed} of ${sh.total} | avg odds ${n ? Math.round(sum / n * 100) : '-'}% | injuries ${sh.injuries} | +$${sh.earnedFunds} (bank $${G.save.funds})`);
        if (spend) {
          owned().forEach(id => { const hs = hsave(id), H = HEROES[id]; let g = 0; while (hs.pts > 0 && g++ < 12) { const perk = H.perks.find(p => !hs.perks.includes(p.id)); if (hs.pts >= 2 && perk && hs.lv >= 2 && hs.perks.length < Math.floor(hs.lv / 3) + 1) takePerk(id, perk.id); else { const st = [H.power, 'vigor', 'mobility', 'charisma', 'intellect'].find(s => canRaise(id, s)); if (!st) break; raiseStat(id, st); } } });
          recruitable().forEach(id => { if (G.save.funds >= HEROES[id].join.price + 150) hire(id); });
          ['training', 'medbay', 'comms', 'lounge', 'garage'].forEach(k => { const c = facCost(k); if (c != null && G.save.funds >= c + 200) buyFac(k); });
        }
      }
    }
    return lines.join('\n');
  }, { mode: a1 || 'smart', runs: +a2 || 1 }),
};

if (!tasks[cmd]) { console.error('commands: ' + Object.keys(tasks).join(', ')); process.exit(2); }
console.log(await tasks[cmd]());
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; } else console.log('no page errors');
await browser.close();
