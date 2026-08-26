/* ============================================================================
   BATTLE SCREEN
   ========================================================================== */
function beginBattle(foeKins, opts, onEnd) {
  const roster = GAME.party.filter(k => k.hp > 0);
  if (!roster.length) { toast('No kin able to stand.', 'bad'); return; }
  const bt = newBattle(GAME.party, foeKins, opts);
  UI.battle = { bt, onEnd: onEnd || (() => go('camp')), cmd: 'moves', busy: false };
  bt.say((opts && opts.opening) || 'A wild ' + active(bt.foe).name + ' blocks the path.', 'sys');
  go('battle');
}

function syncParty(bt) { for (const f of bt.you.party) if (f.kin) f.kin.hp = f.hp; }

function battleRewards(bt) {
  let xp = 0, gold = 0;
  for (const f of bt.foe.party) { xp += xpYield(SPECIES[f.sp], f.lv); gold += Math.round(f.lv * 5 + ri(6, 24)); }
  if (bt.warden) gold += WARDENS[bt.warden].reward;
  GAME.gold += gold;
  const lines = [];
  const activeKin = active(bt.you).kin;
  for (const f of bt.you.party) {
    if (!f.kin || f.hp <= 0) continue;
    const share = f.kin === activeKin ? xp : Math.round(xp * 0.55);
    const res = grantXp(f.kin, share);
    const bits = [kinName(f.kin) + ' +' + share + ' xp'];
    if (res.levels.length) bits.push('level ' + res.levels[res.levels.length - 1]);
    if (res.motes) bits.push('+' + res.motes + ' ' + plural(res.motes, 'Mote'));
    lines.push({ text: bits.join(' · '), levelled: res.levels.length > 0, motes: res.motes });
  }
  return { xp, gold, lines };
}

function endBattle(bt) {
  syncParty(bt);
  const finish = UI.battle.onEnd;
  if (bt.result === 'won') {
    GAME.wins++;
    const r = battleRewards(bt);
    saveGame();
    modal('The binding holds.',
      el('div.rows', null,
        el('p', { style: { margin: 0 } }, 'You take ' + r.gold.toLocaleString() + ' aur from the field.'),
        el('div.rows', { style: { gap: '4px' } }, r.lines.map(l =>
          el('p.mono', { style: { margin: 0, fontSize: '13px', color: l.motes ? 'var(--brass-hi)' : 'var(--vellum-2)' } }, l.text))),
        r.lines.some(l => l.motes) ? el('p', { style: { margin: 0, color: 'var(--brass-hi)' } }, 'New Motes are waiting. Spend them in Party → Lattice.') : null),
      [{ label: 'Onward', primary: true, run: finish }]);
  } else if (bt.result === 'caught') {
    const kin = bt.caught;
    kin.caught = ZONES[GAME.zone] ? ZONES[GAME.zone].n : null;
    const where = addKin(kin);
    const r = battleRewards(bt);
    saveGame();
    modal(kinName(kin) + ' is bound.',
      el('div.rows', null,
        el('div.cols', { style: { alignItems: 'center', gap: '16px' } },
          el('div.glyph-wrap', null, glyphEl(kin.sp, 104)),
          el('div.rows', { style: { gap: '6px' } },
            typeChips(SPECIES[kin.sp].t),
            el('span.mono.muted', null, 'Level ' + kin.lv + ' · Resonance ' + resonance(kin) + '%'),
            el('p.muted', { style: { margin: 0, fontSize: '13px' } }, SPECIES[kin.sp].dex))),
        el('p', { style: { margin: 0 } }, where === 'party' ? 'It joins your party.' : 'Your party is full — it waits at camp.'),
        el('div.rows', { style: { gap: '4px' } }, r.lines.map(l => el('p.mono', { style: { margin: 0, fontSize: '13px' } }, l.text)))),
      [{ label: 'Onward', primary: true, run: finish }]);
  } else if (bt.result === 'lost') {
    const lost = Math.round(GAME.gold * 0.35);
    GAME.gold -= lost;
    restParty();
    GAME.step = 0;
    saveGame();
    modal('Your kin are spent.',
      el('div.rows', null,
        el('p', { style: { margin: 0 } }, 'You carry them back to camp. It costs ' + lost.toLocaleString() + ' aur in salve and stone, and the route resets.'),
        el('p.muted', { style: { margin: 0, fontSize: '13px' } }, 'Nothing else is lost. Spend the Motes you have earned before going back out.')),
      [{ label: 'Back to camp', primary: true, run: () => go('camp') }]);
  } else {
    saveGame();
    finish();
  }
}

function statusPips(f) {
  const pips = [];
  if (f.status) pips.push(el('span.pip', { style: { color: STATUSES[f.status].hue } }, STATUSES[f.status].name));
  for (const m in f.marks) if (f.marks[m] > 0) pips.push(el('span.pip', { style: { color: STATUSES[m].hue } }, STATUSES[m].name + (STATUSES[m].stacks ? ' x' + f.marks[m] : '')));
  for (const k in f.counters) if (f.counters[k] > 0) pips.push(el('span.pip', { style: { color: 'var(--brass)' } }, cap(k) + ' x' + f.counters[k]));
  return el('div.statuspips', null, pips);
}
const STAGE_SHORT = { frc: 'FRC', grd: 'GRD', arc: 'ARC', wrd: 'WRD', swf: 'SWF', acc: 'AIM', eva: 'EVA', crit: 'FOC' };
function stagePips(f) {
  const out = [];
  for (const k in f.stages) {
    if (!f.stages[k]) continue;
    out.push(el('span.stagepip' + (f.stages[k] > 0 ? '.up' : '.dn'), null, STAGE_SHORT[k] + ' ' + signed(f.stages[k])));
  }
  return el('div.stagepips', null, out);
}

function nameplate(f, mine) {
  return el('div.nameplate', null,
    el('div.spread', { style: { gap: '8px' } },
      el('h4', null, f.name),
      el('span.lv', null, 'Lv ' + f.lv)),
    el('div.chips', { style: { margin: '4px 0 6px' } }, f.types.map(typeChip)),
    el('div.hpline', null,
      hpBar(f.hp, f.maxhp),
      el('span', { style: { minWidth: '68px', textAlign: 'right' } }, mine ? f.hp + '/' + f.maxhp : Math.round(pctOf(f.hp, f.maxhp) * 100) + '%')),
    mine ? el('div.hpline', { style: { marginTop: '4px' } },
      el('span', { style: { color: '#4FA8DE' } }, 'Focus'),
      el('div.bar.focus', null, el('i', { style: { width: (f.focus / f.focusMax * 100) + '%' } })),
      el('span', { style: { minWidth: '30px', textAlign: 'right' } }, f.focus + '/' + f.focusMax)) : null,
    statusPips(f), stagePips(f));
}

SCREENS.battle = () => {
  const S = UI.battle, bt = S.bt;
  const me = active(bt.you), them = active(bt.foe);
  const fd = FIELDS[bt.field];

  const arena = el('div.arena');
  if (fd) arena.append(el('div.fieldbanner', { style: { color: fd.hue, background: 'color-mix(in srgb, ' + fd.hue + ' 12%, transparent)' } },
    fd.name + ' · ' + bt.fieldTurns + ' ' + plural(bt.fieldTurns, 'turn') + ' left'));

  const mySlot = el('div.slot.mine', { style: { position: 'relative' } });
  const theirSlot = el('div.slot.theirs', { style: { position: 'relative' } });
  const myGlyph = el('div.glyph-wrap.float', { style: { flex: '0 0 auto' } }, glyphEl(me.sp, 138));
  const theirGlyph = el('div.glyph-wrap.float', { style: { flex: '0 0 auto' } }, glyphEl(them.sp, 138, { flip: true }));
  theirSlot.append(nameplate(them, false), theirGlyph);
  mySlot.append(myGlyph, nameplate(me, true));
  arena.append(el('div.combat', null, theirSlot, mySlot));

  /* floats and shakes from the turn just resolved */
  if (bt.hits && bt.hits.length) {
    for (const h of bt.hits) {
      const slot = h.target === 'you' ? mySlot : theirSlot;
      const glyph = h.target === 'you' ? myGlyph : theirGlyph;
      const colour = h.crit ? 'var(--brass-hi)' : h.eff > 1 ? 'var(--ok)' : h.eff < 1 ? 'var(--vellum-3)' : 'var(--crit)';
      slot.append(el('div.dmgfloat', { style: { color: colour, left: (18 + rnd() * 46) + '%', top: '26%' } }, '-' + h.amount));
      glyph.classList.add('shake');
      setTimeout(() => glyph.classList.remove('shake'), 360);
    }
  }

  const logBox = el('div.log', null, bt.log.slice(-40).map(l => el('p' + (l.tone !== 'plain' ? '.' + l.tone : ''), null, l.s)));
  requestAnimationFrame(() => { logBox.scrollTop = logBox.scrollHeight; });

  /* ---- commands ---- */
  const cmdBox = el('div.rows');
  const take = act => {
    if (S.busy || bt.over) return;
    S.busy = true;
    resolveTurn(bt, act);
    syncParty(bt);
    S.busy = false;
    if (bt.over) { render(); setTimeout(() => endBattle(bt), 420); return; }
    render();
  };

  if (bt.over) {
    cmdBox.append(el('div.panel', { style: { textAlign: 'center', color: 'var(--vellum-3)' } },
      bt.result === 'won' ? 'The field settles.' : bt.result === 'caught' ? 'The stone closes.'
        : bt.result === 'lost' ? 'Your kin are spent.' : 'You break away.'));
  } else if (bt.pending === 'replace') {
    cmdBox.append(el('div.eyebrow', null, kinName(me.kin || me) + ' is down — send out another'),
      el('div.cmd', null, bt.you.party.map((f, i) =>
        el('button.movebtn', {
          disabled: isDown(f) || i === bt.you.idx,
          style: { borderLeftColor: typeHue(f.types[0]) },
          onclick: () => { bt.you.idx = i; f.justSwitchedIn = true; bt.pending = null; bt.say(f.name + ' takes the field.', 'sys'); hookRun(bt, f, 'onEnter'); render(); }
        }, el('b', null, f.name), el('span.meta', null, 'Lv ' + f.lv, f.hp + '/' + f.maxhp)))));
  } else {
    const tabs = [['moves', 'Moves'], ['abilities', 'Abilities'], ['bag', 'Bag'], ['kin', 'Kin'], bt.canFlee ? ['flee', 'Withdraw'] : null].filter(Boolean);
    cmdBox.append(el('div.cols', { style: { gap: '4px' } }, tabs.map(([id, label]) =>
      el('button.btn.small' + (S.cmd === id ? '.primary' : '.ghost'), { onclick: () => { S.cmd = id; render(); } }, label))));

    if (S.cmd === 'moves') {
      cmdBox.append(el('div.cmd', null, me.moves.map(id => {
        const m = MOVES[id]; if (!m) return null;
        const cd = me.cds[id] || 0;
        const eff = m.c === 'stat' ? 1 : typeMult(m.t, them.types);
        const lab = effLabel(eff);
        return el('button.movebtn', {
          disabled: cd > 0, style: { borderLeftColor: typeHue(m.t) }, title: m.d,
          onclick: () => take({ type: 'move', id }),
        }, el('b', null, m.n),
           el('span.meta', null,
             el('span', { style: { color: typeHue(m.t) } }, typeName(m.t)),
             el('span', null, moveMeta(m)),
             cd > 0 ? el('span', { style: { color: 'var(--warn)' } }, cd + 't') : null),
           m.c !== 'stat' && lab.text ? el('span.eff.' + lab.tone, null, lab.text) : null);
      }).filter(Boolean)));
    } else if (S.cmd === 'abilities') {
      cmdBox.append(me.abil.length
        ? el('div.cmd', null, me.abil.map(id => {
            const a = ABILITIES[id];
            const cd = me.cds['@' + id] || 0, poor = me.focus < a.cost;
            return el('button.movebtn', {
              disabled: cd > 0 || poor, style: { borderLeftColor: '#4FA8DE' },
              onclick: () => take({ type: 'ability', id }),
            }, el('b', null, a.n),
               el('span.meta', null, a.cost + ' Focus', cd > 0 ? cd + 't cooldown' : null, poor ? 'not enough Focus' : null),
               el('span.muted', { style: { fontSize: '12px' } }, a.d));
          }))
        : el('p.muted', { style: { margin: 0 } }, 'This kin has no abilities yet. They are lattice nodes — light one in Party → Lattice.'));
    } else if (S.cmd === 'bag') {
      const ids = Object.keys(GAME.bag).filter(id => GAME.bag[id] > 0);
      cmdBox.append(ids.length
        ? el('div.cmd', null, ids.map(id => {
            const it = ITEMS[id];
            const useless = it.kind === 'stone' && !bt.wild;
            return el('button.movebtn', {
              disabled: useless, style: { borderLeftColor: 'var(--brass)' },
              onclick: () => {
                if (it.kind === 'revive') { pickTarget(id, f => isDown(f)); return; }
                if (it.kind === 'heal' || it.kind === 'cure' || it.kind === 'focus') { pickTarget(id, f => !isDown(f)); return; }
                takeItem(id); take({ type: 'item', id });
              },
            }, el('b', null, it.n + ' ×' + GAME.bag[id]),
               el('span.muted', { style: { fontSize: '12px' } }, useless ? 'A warden’s kin cannot be bound.' : it.d));
          }))
        : el('p.muted', { style: { margin: 0 } }, 'The bag is empty.'));
    } else if (S.cmd === 'kin') {
      cmdBox.append(el('div.cmd', null, bt.you.party.map((f, i) => {
        const blocked = i === bt.you.idx || isDown(f) || (me.marks.root > 0);
        return el('button.movebtn', {
          disabled: blocked, style: { borderLeftColor: typeHue(f.types[0]) },
          onclick: () => take({ type: 'switch', idx: i }),
        }, el('b', null, f.name),
           el('span.meta', null, 'Lv ' + f.lv, f.hp + '/' + f.maxhp,
             i === bt.you.idx ? 'on the field' : isDown(f) ? 'unbound' : me.marks.root > 0 ? 'rooted — cannot recall' : null));
      })));
    } else if (S.cmd === 'flee') {
      cmdBox.append(el('div.rows', null,
        el('p.muted', { style: { margin: 0 } }, 'Break off and keep what you have. Faster kin get away more reliably, and each attempt improves the odds.'),
        el('button.btn', { style: { alignSelf: 'flex-start' }, onclick: () => take({ type: 'flee' }) }, 'Withdraw')));
    }
  }

  function pickTarget(itemId, ok) {
    modal('Use ' + ITEMS[itemId].n + ' on which kin?',
      el('div.rows', null, bt.you.party.map((f, i) =>
        el('button.movebtn', {
          disabled: !ok(f), style: { borderLeftColor: typeHue(f.types[0]) },
          onclick: () => { closeModal(); takeItem(itemId); take({ type: 'item', id: itemId, targetIdx: i }); }
        }, el('b', null, f.name), el('span.meta', null, f.hp + '/' + f.maxhp, isDown(f) ? 'unbound' : null)))),
      [{ label: 'Cancel' }]);
  }

  return el('div.screen', null,
    el('div.spread', null,
      el('div.rows', { style: { gap: '2px' } },
        el('div.eyebrow', null, bt.warden ? WARDENS[bt.warden].n + ' · ' + WARDENS[bt.warden].title : 'Wild binding'),
        el('h2', { style: { fontSize: '21px' } }, bt.warden ? 'Warden battle' : them.name + ' of the ' + (ZONES[GAME.zone] ? ZONES[GAME.zone].n : 'wild'))),
      el('span.mono.muted', null, 'Turn ' + Math.max(1, bt.turn))),
    arena, cmdBox, logBox);
};
