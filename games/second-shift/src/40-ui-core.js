/* =====================================================================
   40-ui-core: screens, modals, toasts, dialogue scenes, hero sheet, help
   ===================================================================== */

function show(name) {
  $$('#app > .screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  G.mode = name; $('#app').dataset.screen = name;
  Snd.music(name === 'combat' ? 'combat' : 'hub');
  Bus.emit('screen', name);
}

/* ---------- modals ---------- */
const modalStack = [];
function openModal(content, opt) {
  opt = opt || {};
  const back = h('div.modal-back');
  const box = h('div.modal' + (opt.cls ? '.' + opt.cls.split(' ').join('.') : ''), { role: 'dialog', 'aria-modal': 'true' }, content);
  back.appendChild(box);
  $('#modal-root').appendChild(back);
  const pause = opt.pause !== false; if (pause) G.modals++;
  let resolve; const done = new Promise(r => { resolve = r; });
  const m = { el: back, box, done, closed: false, dismiss: opt.dismiss !== false, pause,
    close(val) {
      if (m.closed) return; m.closed = true;
      const i = modalStack.indexOf(m); if (i >= 0) modalStack.splice(i, 1);
      if (pause) G.modals = Math.max(0, G.modals - 1);
      back.classList.add('out'); setTimeout(() => back.remove(), 160);
      if (opt.onClose) opt.onClose(val);
      resolve(val);
    } };
  back.addEventListener('pointerdown', e => { if (e.target === back && m.dismiss) m.close(null); });
  modalStack.push(m);
  setTimeout(() => { const f = box.querySelector('[data-autofocus]') || box.querySelector('button.primary') || box.querySelector('button'); if (f && !opt.noFocus) f.focus({ preventScroll: true }); }, 30);
  return m;
}
const topModal = () => modalStack[modalStack.length - 1];
function closeTopModal() { const m = topModal(); if (m && m.dismiss) { m.close(null); return true; } return false; }

function confirmBox(title, text, yes, no) {
  return new Promise(res => {
    const m = openModal(h('div.confirm', h('h3', title), h('p', text), h('div.btnrow',
      h('button.btn.ghost', { onclick: () => m.close(false) }, no || 'Cancel'),
      h('button.btn.primary', { 'data-autofocus': '1', onclick: () => m.close(true) }, yes || 'OK'))), { cls: 'small', onClose: v => res(!!v) });
  });
}
function toast(text, kind) {
  const t = h('div.toast' + (kind ? '.' + kind : ''), text);
  $('#toast-root').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3000); setTimeout(() => t.remove(), 3400);
}

/* ---------- small component helpers ---------- */
const statIcon = (s, size) => { const e = icon(s, size); e.style.color = STAT[s].color; return e; };
function tagChip(t, lit) { return h('span.tag' + (lit ? '.lit' : ''), { title: TAGS[t].hint }, icon(t, 14), TAGS[t].label); }
function temperChip(t) { return h('span.temper.t-' + t, { title: 'Responds best to: ' + TEMPERS[t].line }, TEMPERS[t].label); }
function pips(val, max, col, extra) {
  const w = h('span.pips');
  for (let i = 0; i < max; i++) w.appendChild(h('i' + (i < val ? '.on' : '') + (extra && i >= extra[0] && i < extra[1] ? '.new' : ''), { style: i < val ? { background: col } : null }));
  return w;
}
function heroAvatar(id, size, cls) {
  const w = h('div.avatar' + (cls ? '.' + cls : ''), { style: { width: size + 'px', height: size + 'px' } });
  w.appendChild(heroPortrait(id, size, size, 'neutral'));
  return w;
}
function stars(n, max) { const w = h('span.stars'); for (let i = 0; i < max; i++) w.appendChild(icon(i < n ? 'star' : 'starO', 14)); return w; }

/* =====================================================================
   DIALOGUE SCENES
   ===================================================================== */
function speakerInfo(who) {
  if (HEROES[who]) return { name: HEROES[who].name, look: HEROES[who].look, color: HEROES[who].look.accent };
  if (NPC[who]) return { name: NPC[who].name, look: NPC[who].look, color: NPC[who].color };
  return { name: who === 'you' ? (G.save ? G.save.name : 'You') : '', look: null, color: '#9aa8d6' };
}
function playScene(lines, opt) {
  opt = opt || {};
  return new Promise(resolve => {
    G.modals++;
    const portrait = h('div.sc-portrait'), name = h('div.sc-name'), text = h('p.sc-text'), hint = h('div.sc-hint', 'Click or press Space');
    const el = h('div.scene', { tabindex: '-1' },
      h('div.sc-dim'),
      opt.title ? h('div.sc-title', opt.title) : null,
      h('div.sc-stage', portrait, h('div.sc-box', name, text, hint)),
      h('button.btn.ghost.small.sc-skip', { onclick: e => { e.stopPropagation(); finish(); } }, 'Skip ›'));
    $('#modal-root').appendChild(el); el.focus();
    let i = -1, typing = false, timer = null, full = '', pos = 0, closed = false;
    const reduce = prefersReducedMotion();
    function finish() { if (closed) return; closed = true; clearInterval(timer); window.removeEventListener('keydown', key, true); el.classList.add('out'); G.modals = Math.max(0, G.modals - 1); setTimeout(() => el.remove(), 200); resolve(); }
    function say(line) {
      const [who, raw, expr] = line, sp = speakerInfo(who);
      full = raw.replace(/\{you\}/g, G.save ? G.save.name : 'Dispatcher'); pos = 0; text.textContent = ''; typing = true;
      name.textContent = sp.name; name.style.color = sp.color; name.style.display = sp.name ? '' : 'none';
      portrait.innerHTML = '';
      if (sp.look) { portrait.appendChild(portraitImg(sp.look, 220, 280, expr || 'neutral', 'sc-img')); portrait.classList.remove('pop'); void portrait.offsetWidth; portrait.classList.add('pop'); portrait.style.setProperty('--c', sp.color); }
      hint.style.opacity = 0;
      clearInterval(timer);
      if (reduce) { text.textContent = full; typing = false; hint.style.opacity = 1; return; }
      timer = setInterval(() => {
        pos += 2; text.textContent = full.slice(0, pos);
        if (pos % 6 < 2 && full[pos - 1] && full[pos - 1] !== ' ') sfx('hover');
        if (pos >= full.length) { clearInterval(timer); typing = false; hint.style.opacity = 1; }
      }, 18);
    }
    function next() {
      if (typing) { clearInterval(timer); text.textContent = full; typing = false; hint.style.opacity = 1; return; }
      i++; if (i >= lines.length) return finish();
      say(lines[i]);
    }
    function key(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } }
    window.addEventListener('keydown', key, true);
    el.addEventListener('pointerdown', e => { if (e.target.closest('.sc-skip')) return; next(); });
    next();
  });
}

/* =====================================================================
   ABILITY TEXT + HERO SHEET
   ===================================================================== */
function describeAbility(ab) {
  const p = [];
  const tg = { adj: 'Melee', line: ab.pierce ? 'Line ' + ab.r + ', pierces' : 'Projectile, range ' + ab.r, tile: 'Range ' + ab.r, self: 'Around self', ally: 'Ally, range ' + ab.r, cone: 'Cone, depth ' + ab.r, row: 'Whole row', none: ab.area === 'all' || ab.area === 'barrage' ? 'Whole field' : 'Instant', empty: 'Empty tile, range ' + ab.r, dash: 'Dash ' + ab.r + ', passes through', charge: 'Charge ' + ab.r }[ab.tgt];
  p.push(tg);
  if (ab.area === 'diamond' && ab.ar) p.push('radius ' + ab.ar); else if (ab.area === 'square' && ab.ar) p.push((2 * ab.ar + 1) + '×' + (2 * ab.ar + 1) + ' blast'); else if (ab.area === 'plus') p.push('plus-shaped');
  if (ab.dmg) p.push(ab.dmg.toFixed(1).replace('.0', '') + '× damage' + (ab.splash ? ' (' + ab.splash + '× splash)' : ''));
  if (ab.chain) p.push('chains to a neighbor');
  if (ab.kb) p.push('knockback ' + ab.kb); if (ab.pull) p.push('pull ' + ab.pull);
  if (ab.heal) p.push('heals ' + ab.heal + '× power'); if (ab.healPct) p.push('heals ' + Math.round(ab.healPct * 100) + '% HP');
  (ab.fx || []).forEach(f => p.push({ burn: 'burns', delay: 'delays turn', slow: 'slows', mark: 'marks (+30% dmg)', shield: 'shield ' + f.v, haste: 'hastes', freeze: 'freezes (skips turn)', cdr: 'refunds cooldowns', hype: '+' + f.v + ' Hype', cleanse: 'cleanses', rally: 'rallies (+30% dmg)' }[f.k] || f.k));
  if (ab.hz) p.push('creates ' + ab.hz + ' tiles'); if (ab.place) p.push('places a ' + (ab.place === 'bomb' ? 'time bomb' : 'powder keg'));
  if (ab.move === 'tp') p.push('teleports'); if (ab.move === 'swap') p.push('swaps places');
  if (ab.extra === 'extraTurn') p.push('grants an extra turn');
  if (ab.area === 'barrage') p.push(ab.n + ' random blasts');
  return p.filter(Boolean).join(' · ');
}
function abilityBlock(ab, i) {
  return h('div.ab' + (ab.ult ? '.ult' : ''), h('div.ab-k', ab.ult ? 'ULT' : (i === 0 ? 'BASIC' : 'SKILL')),
    h('div.ab-b', h('b', ab.name), ab.cd ? h('span.cd', 'CD ' + ab.cd) : null, h('div.ab-d', describeAbility(ab)), ab.flavor ? h('div.ab-f', ab.flavor) : null));
}
/* the full hero sheet. opt.upgrade enables spending points */
function heroSheet(id, opt) {
  opt = opt || {};
  const H = HEROES[id], hs = hsave(id), xi = xpInfo(id);
  const root = h('div.sheet');
  const rerender = () => { const n = heroSheet(id, opt); root.replaceWith(n); if (opt.onChange) opt.onChange(); };
  const stats = h('div.sh-stats');
  STATS.forEach(s => {
    const base = H.stats[s], spent = hs.spent[s], val = base + spent, hurt = isHurt(id);
    const row = h('div.sh-stat', { title: STAT[s].blurb }, statIcon(s, 18), h('span.nm', STAT[s].label), pips(val, MAX_STAT, STAT[s].color, [base, val]), h('b' + (hurt ? '.hurt' : ''), hurt ? (val - 1) + '' : String(val)));
    if (H.power === s) row.appendChild(h('span.pw', { title: 'Power stat: boosts battle damage' }, 'POWER'));
    if (opt.upgrade) row.appendChild(h('button.plus', { disabled: !canRaise(id, s), 'aria-label': 'Raise ' + STAT[s].label, onclick: () => { if (raiseStat(id, s)) rerender(); } }, '+'));
    stats.appendChild(row);
  });
  const perks = h('div.sh-perks');
  H.perks.forEach(pk => {
    const has = hs.perks.includes(pk.id), can = canPerk(id, pk.id);
    perks.appendChild(h('div.perk' + (has ? '.has' : '') + (can && opt.upgrade ? '.can' : ''), h('div.pk-h', h('b', pk.name), has ? h('span.pk-own', 'OWNED') : h('span.pk-c', PERK_COST + ' pts')), h('div.pk-d', pk.desc),
      opt.upgrade && !has ? h('button.btn.small' + (can ? '.primary' : ''), { disabled: !can, onclick: () => { if (takePerk(id, pk.id)) rerender(); } }, can ? 'Unlock' : (hs.pts < PERK_COST ? 'Need ' + PERK_COST + ' pts' : 'Unlock')) : null));
  });
  root.append(
    h('div.sh-top', h('div.sh-pic', portraitImg(H.look, 200, 240, 'grin', 'sh-img')),
      h('div.sh-id', h('h2', H.name), h('div.real', H.real + ' · ' + H.role + ' · age ' + H.age),
        h('div.chips', H.tags.map(t => tagChip(t, true)), temperChip(H.temper)),
        h('div.likes', h('span', 'Likes: ', h('b', TEMPERS[H.likes].label)), h('span', 'Dislikes: ', h('b', TEMPERS[H.dislikes].label))),
        h('div.xp', h('div.xp-t', h('b', 'LEVEL ' + hs.lv), hs.lv >= MAX_LV ? h('span', 'MAX') : h('span', xi.cur + ' / ' + xi.need + ' XP')), h('div.bar', h('i', { style: { width: (xi.frac * 100) + '%' } }))),
        hs.pts > 0 ? h('div.pts', icon('star', 14), hs.pts + (hs.pts === 1 ? ' point' : ' points') + ' to spend') : null,
        h('div.quote', H.quote))),
    h('div.sh-grid', h('div.sh-col', h('h4', 'Stats'), stats, isHurt(id) ? h('div.warn', 'Injured: all stats −1 until healed.') : null,
      h('h4', 'Chemistry'), chemBlock(id)),
      h('div.sh-col', h('h4', 'Perks'), perks)),
    h('h4', 'Battle kit'), h('div.sh-kit', H.kit.map(abilityBlock)),
    h('p.sh-bio', H.bio));
  return root;
}
function chemBlock(id) {
  const w = h('div.chem-list');
  CHEMISTRY.filter(c => c.a === id || c.b === id).forEach(c => { const o = c.a === id ? c.b : c.a; w.appendChild(h('div.chem' + (c.v > 0 ? '.good' : '.bad'), heroAvatar(o, 26), h('span', h('b', HEROES[o].name), ' · ' + c.name), h('i', (c.v > 0 ? '+' : '') + Math.round(c.v * 100) + '%'))); });
  if (!w.children.length) w.appendChild(h('div.muted', 'No strong feelings either way.'));
  return w;
}
function openHeroSheet(id) { openModal(h('div.sheet-wrap', h('button.x', { 'aria-label': 'Close', onclick: () => topModal().close() }, icon('x', 18)), heroSheet(id, {})), { cls: 'wide', pause: false }); }

/* =====================================================================
   SETTINGS + HELP
   ===================================================================== */
function toggleRow(label, desc, key, after) {
  const b = h('button.switch' + (Settings[key] ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!Settings[key]), onclick: () => { Settings[key] = !Settings[key]; b.classList.toggle('on', Settings[key]); b.setAttribute('aria-checked', String(Settings[key])); Settings.save(); Snd.apply(); sfx('click'); if (after) after(); } }, h('i'));
  return h('div.set-row', h('div', h('b', label), h('div.muted', desc)), b);
}
function openSettings(opt) {
  opt = opt || {};
  const speed = h('div.seg', [1, 1.5, 2].map(v => h('button' + (Settings.combatSpeed === v ? '.on' : ''), { onclick: e => { Settings.combatSpeed = v; Settings.save(); $$('.seg button', m.box).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); sfx('click'); } }, v + '×')));
  const m = openModal(h('div.settings', h('h2', 'Settings'),
    toggleRow('Music', 'Synthesized lo-fi dispatch jazz.', 'music'),
    toggleRow('Sound effects', 'Clicks, radio chirps, and explosions.', 'sfx'),
    toggleRow('Relaxed mode', 'No countdown on radio checks.', 'relaxed'),
    toggleRow('Pause on new call', 'Freezes the clock when a call arrives.', 'autopause'),
    toggleRow('Screen shake', 'Impact shakes in battle.', 'shake'),
    h('div.set-row', h('div', h('b', 'Battle animation speed'), h('div.muted', 'Faster fights for veterans.')), speed),
    h('div.btnrow', opt.noReset ? null : h('button.btn.danger.small', { onclick: async () => { if (await confirmBox('Erase save?', 'All progress will be deleted. This cannot be undone.', 'Erase', 'Keep')) { Store.del('save'); location.reload(); } } }, 'Erase save'),
      h('button.btn.primary', { onclick: () => m.close() }, 'Done'))));
  return m;
}
function openHelp(tab) {
  const pages = {
    'The Shift': [
      ['Calls come in. You decide who goes.', 'Each shift is a workday at Meridian Hero Dispatch. Calls appear on the map and the call list. Each has a countdown ring: if it hits zero, the call is missed.'],
      ['Heroes get busy.', 'A dispatched hero is away until the mission ends, so you cannot send them twice. Injured heroes lose 1 on every stat. Get hurt again and they are Down for a while.'],
      ['Control the clock.', 'Space pauses. 1, 2 and 3 change the speed. You can assign teams while paused. When nothing needs you, time skips ahead on its own.'],
      ['Earn and upgrade.', 'Calls pay Funds and XP. Level-ups give points to spend on stats and perks. Funds buy new heroes and HQ upgrades between shifts.'],
    ],
    'Dispatching': [
      ['Match the stat bars.', 'Every call needs some mix of Combat, Vigor, Mobility, Charisma, and Intellect. The more of each bar your team fills, the higher the success chance.'],
      ['Read the odds.', 'The big percentage is honest. At 80% or more the call is SAFE: it cannot fail. Below that you are rolling dice, and a failure can hurt your heroes.'],
      ['Tags and chemistry.', 'Matching tags (Flight, Tech, Charm…) add a bonus. Some heroes are best buds (+8%), some are rivals (−8%). Look for the chips under the slots.'],
      ['Radio checks.', 'During some missions a hero calls in. Pick the tone they like (Hype, Calm, Joke, or Order) for a bonus. The wrong one costs you.'],
    ],
    'Battles': [
      ['Take Command.', 'Fight calls can be auto-resolved (a dice roll) or fought out on a grid. Commanding pays 25% more and lets you win the clean way.'],
      ['Move, then act.', 'On a hero\'s turn: move up to their range, use one ability, in either order. The timeline on top shows who acts next. Speed (Mobility) decides it.'],
      ['Push, pull, slam.', 'Knockback moves enemies. Hit another unit or an obstacle and both take Slam damage. Barrels explode. Fire, ice and live wires change the floor.'],
      ['Flank and Hype.', 'Attack with an ally on the opposite side of the target for +40% (a FLANK). Dealing and taking damage fills Hype. At 100, unleash your ultimate.'],
      ['Radio support.', 'Once per battle you can call HQ for a medevac, a pep talk, or a roadblock that delays every enemy.'],
    ],
  };
  let cur = tab || 'The Shift';
  const body = h('div.help-body'), tabs = h('div.seg.help-tabs');
  const draw = () => {
    body.innerHTML = ''; tabs.innerHTML = '';
    Object.keys(pages).forEach(k => tabs.appendChild(h('button' + (k === cur ? '.on' : ''), { onclick: () => { cur = k; sfx('click'); draw(); } }, k)));
    pages[cur].forEach(([t, d]) => body.appendChild(h('div.help-item', h('b', t), h('p', d))));
  };
  draw();
  const m = openModal(h('div.help', h('h2', 'How to play'), tabs, body, h('div.btnrow', h('button.btn.primary', { onclick: () => m.close() }, 'Got it'))), { cls: 'wide' });
  return m;
}
