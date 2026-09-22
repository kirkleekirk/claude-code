/* The skill tree: five branches, seven tiers each. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;

  const HOOK_ICON = { pa_secondwind: 'heart', de_rampage: 'fang', co_static: 'spark', re_evasion: 'wind', re_grace: 'mirror', re_quicksilver: 'wind', cr_embrace: 'tar', cr_soultax: 'drop', cr_grudge: 'skull' };
  const KEY_ICON = {
    backpack: 'bag', maxHpPct: 'heart', maxHp: 'heart', lootFind: 'chest', pouch: 'pouch', sight: 'eye', instabilitySlow: 'clock', healBonus: 'plus', sellBonus: 'coin', statusResist: 'shield',
    xpGain: 'star', dmgPct: 'club', armor: 'shield', bleedChance: 'drop', critChance: 'target', critDmg: 'target', lifesteal: 'drop', thorns: 'thorns', abilityPower: 'bolt', maxFocus: 'bolt', dodge: 'wind',
    lostFound: 'book', forager: 'chest', emergencyCord: 'hatch', deathNumberReduce: 'hash', lastCarOut: 'door', momentum: 'flee', stunImmune: 'shield', berserk: 'fang', scrapBonus: 'gear', lockpick: 'key',
    jammer: 'spark', braceBonus: 'shield', twinLamps: 'lantern', abilityCrit: 'target', abilityDiscount: 'bolt', backstab: 'blade', twinReflection: 'copy', glassFang: 'crystal', reflectDebuff: 'mirror',
    opportunist: 'eye', corruptLeech: 'tar', bloodPrice: 'drop', spreadRot: 'tar', festering: 'tar', numberGainReduce: 'hash', tarSkin: 'tar', pandemic: 'tar', consumableHeal: 'plus',
  };
  function nodeIcon(n) {
    if (n.ability) return D.ABILITIES[n.ability].icon;
    if (HOOK_ICON[n.id]) return HOOK_ICON[n.id];
    const keys = Object.keys((n.stats && n.stats(1, 1)) || {}).concat(Object.keys((n.flags && n.flags(1)) || {}));
    for (const k of keys) if (KEY_ICON[k]) return KEY_ICON[k];
    return 'star';
  }
  UI.nodeIcon = nodeIcon;

  const abilityKit = (S) => ({ sp: (n) => ENG.stats.spell(n, S), S, L: S.level });
  UI.abilityText = (ab, S) => ab.desc(abilityKit(S));

  function nodeDetail(G, S, n) {
    const rank = G.skills[n.id] || 0;
    const st = ENG.hub.skillState(G, n.id);
    const parts = [`<div class="stack" style="gap:4px"><span class="eyebrow">${esc(n.branch)} · Tier ${n.tier}${n.ability ? ' · Active ability' : ' · Passive'}</span>
      <h3 style="font-size:var(--step-2)">${icon(nodeIcon(n))} ${esc(n.name)}</h3><span class="small muted">Rank ${rank} / ${n.max}</span></div>`];
    if (n.ability) {
      const ab = D.ABILITIES[n.ability];
      const cost = ENG.combat.abilityCost(S, null, ab);
      const cd = ENG.combat.abilityCooldown(S, ab);
      parts.push(`<p>${esc(UI.abilityText(ab, S))}</p><div class="row"><span class="chip">${ab.ap} AP</span><span class="chip">${cost} Focus</span><span class="chip">${ab.oncePerRaid ? 'Once per raid' : cd ? `Cooldown ${cd}` : 'No cooldown'}</span><span class="chip">${{ enemy: 'One enemy', all: 'All enemies', self: 'Yourself', none: 'The whole fight' }[ab.target]}</span></div>`);
    } else {
      if (rank) parts.push(`<p><span class="eyebrow">Now</span><br>${esc(n.desc(rank))}</p>`);
      if (rank < n.max) parts.push(`<p><span class="eyebrow">${rank ? 'Next rank' : 'Rank 1'}</span><br>${esc(n.desc(rank + 1))}</p>`);
    }
    if (n.req) parts.push(`<p class="small ${G.skills[n.req] ? 'good' : 'warn'}">Requires ${esc(D.SKILLS[n.req].name)}</p>`);
    parts.push(`<button type="button" class="btn ${st.ok ? 'primary' : ''}" data-act="learn" data-id="${esc(n.id)}" ${st.ok ? '' : 'disabled'}>${st.ok ? (rank ? 'Improve' : 'Learn') + ' — 1 point' : esc(st.reason)}</button>`);
    return `<div class="panel inset node-detail">${parts.join('')}</div>`;
  }

  UI.tabSkills = (G, S) => {
    const b = UI.st.branch;
    const branchBtns = D.BRANCHES.map((br) => `<button type="button" class="branch-btn b-${br.id}" data-act="branch" data-branch="${br.id}" aria-pressed="${br.id === b}">${icon(br.icon)}${br.name}<span class="pts">${ENG.hub.pointsIn(G, br.id)}</span></button>`).join('');
    const branch = D.BRANCHES.find((x) => x.id === b);
    const nodes = D.SKILL_LIST.filter((n) => n.branch === b);
    const have = ENG.hub.pointsIn(G, b);
    if (!UI.st.node || !D.SKILLS[UI.st.node] || D.SKILLS[UI.st.node].branch !== b) UI.st.node = nodes[0].id;
    const labels = [];
    for (let t = 1; t <= 7; t++) {
      const need = D.TIER_REQ[t];
      labels.push(`<div><b class="${have >= need ? '' : 'muted'}">T${t}</b><span>${need ? `${need} pts` : 'open'}</span></div>`);
    }
    const H = 7 * 100 + 6 * 8;
    const cy = (t) => (t - 1) * 108 + 50;
    const cx = (c) => ((c * 2 + 1) / 6) * 300;
    const links = nodes.filter((n) => n.req).map((n) => {
      const r = D.SKILLS[n.req];
      const on = G.skills[r.id] > 0;
      return `<line x1="${cx(r.col)}" y1="${cy(r.tier)}" x2="${cx(n.col)}" y2="${cy(n.tier)}" stroke="${on ? `var(--b-${b})` : 'var(--line-2)'}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-dasharray="${on ? '0' : '5 5'}"/>`;
    }).join('');
    const cells = nodes.map((n) => {
      const rank = G.skills[n.id] || 0;
      const st = ENG.hub.skillState(G, n.id);
      const cls = ['node', 'b-' + b, n.ability ? 'ability' : '', rank ? 'active' : '', rank >= n.max ? 'maxed' : '', st.ok ? 'can' : '', st.locked ? 'locked' : '', UI.st.node === n.id ? 'sel' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" style="grid-row:${n.tier};grid-column:${n.col + 1}" data-act="node" data-id="${n.id}" aria-label="${esc(n.name)}, rank ${rank} of ${n.max}">${icon(nodeIcon(n))}<span class="nn">${esc(n.name)}</span><span class="rk">${rank}/${n.max}</span></button>`;
    }).join('');
    return `<div class="sect-title"><h2>Skills</h2><span class="${G.sp ? 'glow' : 'muted'}">${G.sp} point${G.sp === 1 ? '' : 's'} to spend · 1 per level, 2 every fifth</span></div>
      <div class="branches">${branchBtns}</div>
      <p class="small muted"><b style="color:var(--b-${b})">${esc(branch.name)}.</b> ${esc(branch.motto)} Deeper tiers open as you invest in the branch.</p>
      <div class="tree-wrap">
        <div class="tree"><div class="tree-labels">${labels.join('')}</div>
          <div class="tree-nodes"><svg class="links" viewBox="0 0 300 ${H}" preserveAspectRatio="none" aria-hidden="true">${links}</svg>${cells}</div></div>
        <div class="stack">${nodeDetail(G, S, D.SKILLS[UI.st.node])}<div class="panel inset"><div class="sect-title"><h3>Ability bar</h3></div>${UI.abilityBarEditor(G)}</div></div>
      </div>`;
  };
})();
