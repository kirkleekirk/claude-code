const { chromium } = require('playwright');
const SHOTS = '/tmp/claude-0/-home-user-claude-code/da11c2d4-5c4f-5705-b91f-6081aec954a4/scratchpad/shots';
const URL = 'file:///home/user/claude-code/games/meatlight/meatlight.html';
const ENDING = process.argv[2] === 'render' ? 1 : 0;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 1000, height: 760 } });
  const errs = [], logs = [];
  pg.on('console', m => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errs.push(m.text()); });
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));

  await pg.goto(URL);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: SHOTS + '/00-title.png' });
  await pg.click('#start');
  await pg.waitForTimeout(1200);

  // FF="<objective text>" starts the run at that beat instead of the top,
  // so the back half can be exercised without replaying the prologue.
  if (process.env.FF) {
    const at = await pg.evaluate(t => {
      const i = window.MEATLIGHT.indexOfObjective(t);
      return i < 0 ? null : window.MEATLIGHT.fastForward(i + 1);
    }, process.env.FF);
    if (!at) { console.log('FF: no beat named "' + process.env.FF + '"'); await b.close(); return; }
    console.log('FF -> ' + JSON.stringify(at));
    await pg.waitForTimeout(400);
  }

  const st = () => pg.evaluate(() => window.MEATLIGHT.state());
  const shot = n => pg.screenshot({ path: SHOTS + '/' + n + '.png' });
  const tap = async (k, ms=35) => { await pg.keyboard.press(k); await pg.waitForTimeout(ms); };

  let lastSc = -1, stuck = 0, shotN = 0, beats = [], wp = 0, routeKey = '';
  // The harness has no pathfinder. Each patrol leg gets an explicit route of
  // [room, x, z] waypoints through the doorways the level graph provides; a
  // waypoint is only retired once we are actually standing in its room, so we
  // cannot skip a doorway and then steer at the far target through a wall.
  const ROUTE = {
    CORA: [['SEC',3.00,5.30],['CORA',3.00,7.10],['CORA',12.00,7.10]],
    UTL:  [['SEC',3.00,5.30],['CORA',3.00,7.10],['CORA',12.00,7.10],['CORA',21.70,7.30],
           ['UTL',21.70,9.60],['UTL',18.00,9.40]],
    COO:  [['UTL',20.50,9.50],['UTL',23.00,11.00],['UTL',23.00,15.00],['UTL',25.20,15.00],
           ['UTL',25.20,19.20],['COO',25.00,20.60],['COO',30.20,20.55],
           ['COO',33.20,20.55],['COO',33.20,25.20]],
    SEC:  [['COO',33.20,20.55],['COO',30.20,20.55],['COO',25.00,20.60],
           ['UTL',25.20,19.20],['UTL',25.20,15.00],['UTL',23.00,15.00],['UTL',23.00,11.00],
           ['UTL',21.70,9.60],['CORA',21.70,7.30],['CORA',12.00,7.10],['CORA',3.00,7.10],
           ['SEC',3.00,5.30],['SEC',3.60,4.20]]
  };
  for (let i = 0; i < 9000; i++) {
    const s = await st();
    if (s.over) { await pg.waitForTimeout(1600); await shot('95-ending'); beats.push('ENDING:' + s.over); break; }
    if (s.sc === lastSc) stuck++; else { stuck = 0; lastSc = s.sc; if (s.obj) { const t='OBJ: '+s.obj; if(beats[beats.length-1]!==t) beats.push(t); } }

    if (s.scm === 'needdoor' && s.goal && s.goal.door) {
      await tap('KeyD', 140);
      const idx = await pg.evaluate(id => window.MEATLIGHT.doors.filter(d=>d.id!=='D_FRONT').findIndex(d=>d.id===id), s.goal.door);
      for (let k = 0; k < Math.max(0, idx); k++) await tap('ArrowDown', 60);
      await tap('Enter', 120);
      await tap('KeyD', 140);
    } else if (s.scm === 'until') {
      for (const k of ['Digit3','Digit8','KeyP']) await tap(k, 110);
    } else if ((s.scm === 'reach' || s.scm === 'use') && s.goal && s.camf) {
      // The harness has no pathfinder, so each leg gets an explicit route
      // through the doorways the level graph actually provides.
      const key = s.goal.room;
      if (routeKey !== key + '@' + s.sc) { routeKey = key + '@' + s.sc; wp = 0; }
      const legs = ROUTE[key] || [];
      while (wp < legs.length && legs[wp][0] === s.room &&
             Math.hypot(legs[wp][1]-s.x, legs[wp][2]-s.z) < 0.7) wp++;
      // Last-resort recovery only: if we have made no progress for a while,
      // re-anchor to the nearest waypoint in the room we are actually in.
      // Doing this eagerly bounces the walker off doorways it is mid-way
      // through, so it is gated on being genuinely stuck.
      if (stuck > 0 && stuck % 40 === 39) {
        let best = -1, bd = 1e9;
        legs.forEach((l, i) => { if (l[0] === s.room) {
          const d = Math.hypot(l[1]-s.x, l[2]-s.z); if (d < bd) { bd = d; best = i; } } });
        if (best >= 0) wp = best;
      }
      const tgt = wp < legs.length ? [legs[wp][1], legs[wp][2]] : [s.goal.x, s.goal.z];
      const dx = tgt[0] - s.x, dz = tgt[1] - s.z;
      const fl = Math.hypot(s.camf[0], s.camf[1]) || 1;
      const fx = s.camf[0]/fl, fz = s.camf[1]/fl;
      const iz = dx*fx + dz*fz, ix = dx*(-fz) + dz*(fx);
      const keys = [];
      if (iz > 0.25) keys.push('KeyW'); else if (iz < -0.25) keys.push('KeyS');
      if (ix > 0.25) keys.push('KeyD'); else if (ix < -0.25) keys.push('KeyA');
      if (process.env.VERBOSE && stuck % 8 === 0)
        console.log('  nav pos(' + s.x + ',' + s.z + ') room=' + s.room + ' wp=' + wp +
                    ' tgt(' + tgt[0] + ',' + tgt[1] + ') keys=' + (keys.filter(k=>k[0]!=='S').join('+') || 'none') +
                    ' iz=' + iz.toFixed(2) + ' ix=' + ix.toFixed(2));
      if (!keys.length) { await tap('KeyE', 110); }
      else {
        keys.push('ShiftLeft');            // a player being chased would run
        for (const k of keys) await pg.keyboard.down(k);
        await pg.waitForTimeout(260);
        for (const k of keys) await pg.keyboard.up(k);
        if (s.goal.use) await tap('KeyE', 30);
      }
      if (stuck > 0 && stuck % 25 === 24) { // nudge out of a corner
        await pg.keyboard.down('KeyA'); await pg.waitForTimeout(240); await pg.keyboard.up('KeyA');
      }
    } else if (s.scm === 'choice') {
      await shot('90-choice');
      await pg.waitForTimeout(650);               // clear the input lockout
      let sel = (await st()).sel, guard = 0;
      while (sel !== ENDING && guard++ < 6) { await tap('ArrowDown', 150); sel = (await st()).sel; }
      await tap('Enter', 400);
    } else {
      await tap('Space', 28);
    }

    if (i % 150 === 0) { await shot(String(10+shotN).padStart(2,'0')+'-'+(s.mode)+'-ch'+s.ch+'-'+s.scm); shotN++; }
    if (stuck > 300) { beats.push('STUCK ' + JSON.stringify(s)); await shot('99-stuck'); break; }
  }
  const fin = await st();
  console.log('FINAL  ' + JSON.stringify(fin));
  console.log('\nBEATS REACHED:'); beats.forEach(x => console.log('  ' + x));
  console.log('\nLEVEL CHECK:'); logs.filter(l=>l.includes('meatlight')).forEach(l=>console.log('  '+l));
  console.log('\nERRORS (' + errs.length + '):'); errs.slice(0,10).forEach(e=>console.log('  '+e));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
