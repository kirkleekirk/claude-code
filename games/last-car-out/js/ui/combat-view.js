/* A fight: enemies with telegraphed intents, your vitals, actions and the log. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;

  function foeCard(C, e, target) {
    const gone = e.hp <= 0 || e.fled;
    const cls = ['foe', target ? 'target' : '', e.elite ? 'elite' : '', e.boss ? 'boss' : '', gone ? 'gone' : ''].filter(Boolean).join(' ');
    const def = D.ENEMIES[e.id];
    const tags = [];
    if (e.peaceful) tags.push('<span class="chip lesson" title="Only fights back. Killing it raises your Number.">Peaceful</span>');
    if (e.boss) tags.push('<span class="chip danger">Boss</span>');
    else if (e.elite) tags.push('<span class="chip rule">Elite</span>');
    if (e.armor) tags.push(`<span class="chip" title="Takes ${Math.round(e.armor * 100)}% less damage">Armored</span>`);
    if (e.stolen.length || e.stolenTickets) tags.push(`<span class="chip danger" title="Defeat it before it flees to get this back">Has your ${e.stolen.length ? esc(e.stolen.map((i) => i.name).join(', ')) : e.stolenTickets + ' Tickets'}</span>`);
    if (e.enraged) tags.push('<span class="chip danger">Enraged</span>');
    let intent = '';
    if (!gone) { const it = ENG.combat.intentInfo(C, e); intent = `<div class="intent ${it.cls}" title="What it will do on its turn">${icon(it.icon)}<span>${esc(it.text)}</span></div>`; }
    const status = gone ? `<span class="small muted">${e.fled ? 'Escaped' : 'Defeated'}</span>` : `${UI.hpMeter(e.hp, e.maxHp)}<div class="hpline"><span>${e.hp} / ${e.maxHp}</span>${e.block ? `<span>${icon('shield')} ${e.block}</span>` : ''}</div>${UI.statusChips(e.st)}`;
    return `<button type="button" class="${cls}" ${gone ? 'disabled' : `data-act="c-target" data-uid="${esc(e.uid)}"`} aria-pressed="${target}">
      ${intent}<div class="spr">${UI.denizen(def.sprite, { elite: e.elite, boss: e.boss, mirrored: def.mirrored, num: e.boss ? '0' : '' })}</div>
      <div class="fname">${esc(e.name)}</div>${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}${status}</button>`;
  }

  function actionBar(G, C) {
    const cb = C.cb, p = C.p, S = C.S;
    const W = S.weapon;
    const off = !!cb.over || cb.phase !== 'player';
    const acts = [];
    acts.push(`<button type="button" class="act" data-act="c-strike" ${off || p.ap < W.ap ? 'disabled' : ''}><span class="key">Q</span><span class="an">${icon(W.icon || 'club')}Strike</span><span class="ac">${W.ap} AP · ${W.min}–${W.max}${W.hits > 1 ? ' ×' + W.hits : ''}</span></button>`);
    acts.push(`<button type="button" class="act" data-act="c-brace" ${off || p.ap < 1 ? 'disabled' : ''}><span class="key">B</span><span class="an">${icon('shield')}Brace</span><span class="ac">1 AP · +${ENG.combat.braceValue(S)} Guard</span></button>`);
    const slots = ENG.abilitySlots(G);
    for (let i = 0; i < slots; i++) {
      const id = G.bar[i];
      if (!id) continue;
      const ab = D.ABILITIES[id];
      const st = ENG.combat.abilityState(C, id);
      acts.push(`<button type="button" class="act b-${ab.branch}" data-act="c-ability" data-id="${id}" ${off || !st.ok ? 'disabled' : ''} title="${esc(UI.abilityText(ab, S))}"><span class="key">${i + 1}</span>
        <span class="an">${icon(ab.icon)}${esc(ab.name)}</span><span class="ac">${ab.ap} AP · ${st.cost} Focus${ab.cd ? ' · CD ' + ENG.combat.abilityCooldown(S, ab) : ''}</span>${st.ok ? '' : `<span class="why">${esc(st.reason)}</span>`}</button>`);
    }
    G.belt.forEach((b, i) => {
      if (!b) return;
      const c = D.CONSUMABLES[b.base];
      const usable = c.use === 'combat' || c.use === 'both';
      if (!usable) return;
      acts.push(`<button type="button" class="act" data-act="c-item" data-slot="${i}" ${off || p.ap < 1 ? 'disabled' : ''} title="${esc(c.desc)}"><span class="an">${icon(c.icon)}${esc(c.name)} ×${b.qty}</span><span class="ac">1 AP</span></button>`);
    });
    if (ENG.combat.canSpare(C)) acts.push(`<button type="button" class="act" data-act="c-spare" ${off ? 'disabled' : ''}><span class="an">${icon('heart')}Let them go</span><span class="ac">Mercy — they only want to leave</span></button>`);
    if (cb.kind !== 'boss') acts.push(`<button type="button" class="act" data-act="c-flee" ${off ? 'disabled' : ''}><span class="key">F</span><span class="an">${icon('flee')}Flee</span><span class="ac">${Math.round(ENG.combat.fleeChance(C) * 100)}% · back to the last room</span></button>`);
    acts.push(`<button type="button" class="act end" data-act="c-end" ${off ? 'disabled' : ''}><span class="key">E</span><span class="an">${icon('clock')}End turn</span><span class="ac">${p.ap} AP unused</span></button>`);
    return `<div class="actbar">${acts.join('')}</div>`;
  }

  function banner(G, C) {
    const cb = C.cb;
    if (!cb.over) return '';
    const r = cb.rewards;
    const map = {
      won: ['Victory', 'The way is clear.', ''],
      spared: ['Mercy', 'You let them go. The car feels a little lighter.', ''],
      fled: ['You got away', 'You fall back to the previous room. They are still in there.', ''],
      lost: ['You fall', 'Everything you carried and wore stays in this car. Only your Secure Pouch comes with you.', 'lost'],
    }[cb.over];
    const loot = cb.over === 'won' || cb.over === 'spared' ? `<p class="small">+${U.fmt(r.xp)} XP · +${U.fmt(r.tickets)} Tickets${r.scrap ? ` · +${r.scrap} Scrap` : ''}${r.items.length ? ` · ${r.items.length} item${r.items.length === 1 ? '' : 's'} dropped` : ''}</p>` : '';
    return `<div class="banner ${map[2]}"><h2>${map[0]}</h2><p>${map[1]}</p>${loot}<button type="button" class="btn ${cb.over === 'lost' ? 'danger' : 'primary'}" data-act="c-continue" autofocus>Continue</button></div>`;
  }

  UI.renderCombat = (G) => {
    const C = ENG.combat.api(G);
    const cb = C.cb, p = C.p, S = C.S;
    const alive = C.alive();
    if (!alive.find((e) => e.uid === UI.st.target)) UI.st.target = alive.length ? alive[0].uid : null;
    const foes = cb.enemies.map((e) => foeCard(C, e, e.uid === UI.st.target)).join('');
    const ap = Array.from({ length: Math.max(p.ap, S.ap) }, (_, i) => `<i class="${i < p.ap ? 'on' : ''}"></i>`).join('');
    const summons = p.summons.map((s) => `<span class="chip" title="Acts at the start of your turn">${icon(s.id === 'oneone' ? 'coin' : s.id === 'corgi' ? 'crown' : 'lantern')}${esc(s.name)} · ${s.turns >= 99 ? 'all fight' : s.turns + ' turns'}</span>`).join('');
    const dbl = p.double ? `<span class="chip" title="Repeats your Strikes">${icon('copy')}Mirror Double · ${p.double.turns} turns</span>` : '';
    const log = cb.log.slice(-40).map((l) => `<li class="${l.cls}">${esc(l.t)}</li>`).join('');
    return `<section class="combat">
      <div class="sect-title"><h2>${cb.kind === 'boss' ? 'Boss fight' : cb.kind === 'elite' ? 'Elite fight' : 'Fight'} — Turn ${cb.turn}</h2><span class="small muted">Tap an enemy to target it · keys: Q strike, B brace, 1–6 abilities, E end turn</span></div>
      ${banner(G, C)}
      <div class="foes">${foes}</div>
      <div class="me">
        <div class="panel">
          <div><div class="meterline"><span>HP</span><span>${Math.max(0, p.hp)} / ${p.maxHp}${p.guard ? ` · Guard ${p.guard}` : ''}</span></div>${UI.hpMeter(Math.max(0, p.hp), p.maxHp, p.guard)}</div>
          <div><div class="meterline"><span>Focus</span><span>${p.focus} / ${S.maxFocus} (+${S.focusRegen}/turn)</span></div>${UI.meter(p.focus, S.maxFocus, 'focus')}</div>
          <div class="spread"><div class="row"><span class="eyebrow">Action points</span><div class="ap" aria-label="${p.ap} action points">${ap}</div></div>${UI.statusChips(p.st)}</div>
          ${summons || dbl ? `<div class="summons">${summons}${dbl}</div>` : ''}
        </div>
        <ul class="clog" aria-live="polite">${log}</ul>
      </div>
      ${actionBar(G, C)}
    </section>`;
  };
})();
