/* Skill tree: five branches, four tiers of three skills each. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;
  const icon = AE.icon;
  const esc = U.esc;
  const UI = AE.ui;

  const KEY_ICON = { dmg: 'sword', finisher: 'star', crit: 'target', atkSpd: 'wind', bleedChance: 'flame', riposte: 'dash', finisherBeam: 'bolt', critDmg: 'target', lifesteal: 'heart',
    backpack: 'bag', hpPct: 'heart', tummy: 'tummy', dashCd: 'dash', luck: 'star', interactSpeed: 'hand', lastStand: 'shield', blizzardSlow: 'snow', buyDiscount: 'goose',
    reach: 'hand', stunChance: 'fist', armor: 'shield', rhythm: 'music', aftershock: 'fist', vsDisabled: 'fist', killHeal: 'heart', dodge: 'wind', regen: 'plus', companion: 'swap',
    healPower: 'pancake', cdr: 'clock', reviveSpeed: 'hand', shieldReflect: 'shield', meterGain: 'star', blinkChance: 'ball', tagStrike: 'swap', switchCd: 'swap', companionArmor: 'shield',
    autoRevive: 'heart', healShare: 'heart', ultraSuper: 'star', goldFind: 'coin', bffRage: 'heart' };
  function nodeIcon(n) {
    if (n.ability) return D.ABILITIES[n.ability].icon;
    const keys = Object.keys(n.stats ? n.stats(1) : {});
    for (const k of keys) if (KEY_ICON[k]) return KEY_ICON[k];
    return 'star';
  }

  function detail(G, S, n) {
    const rank = G.skills[n.id] || 0;
    const st = M.hub.skillState(G, n.id);
    const br = D.BRANCHES.find((b) => b.id === n.branch);
    const parts = [`<span class="eyebrow">${esc(br.name)} · Tier ${n.tier} · ${n.ability ? 'Ability' : 'Passive'}</span><h3>${icon(nodeIcon(n))} ${esc(n.name)}</h3><span class="small muted">Rank ${rank} / ${n.max}</span>`];
    if (n.ability) {
      const ab = D.ABILITIES[n.ability];
      const who = ab.hero === 'both' ? 'Finn or Jake' : ab.hero === 'finn' ? 'Finn' : 'Jake';
      parts.push(`<p>${esc(ab.desc)}</p><div class="row"><span class="chip">${esc(who)}</span><span class="chip">${icon('clock')} ${ab.cd}s cooldown</span></div>`);
    } else {
      if (rank) parts.push(`<p><span class="eyebrow">Now</span><br>${esc(n.desc(rank))}</p>`);
      if (rank < n.max) parts.push(`<p><span class="eyebrow">${rank ? 'Next rank' : 'Rank 1'}</span><br>${esc(n.desc(rank + 1))}</p>`);
    }
    if (n.req) parts.push(`<p class="small ${G.skills[n.req] ? 'good' : 'warn'}">Needs ${esc(D.SKILLS[n.req].name)}</p>`);
    parts.push(`<button type="button" class="btn ${st.ok ? 'primary' : ''}" data-act="learn" data-id="${n.id}" ${st.ok ? '' : 'disabled'}>${st.ok ? (rank ? 'Level it up — 1 point' : 'Learn — 1 point') : esc(st.reason)}</button>`);
    return `<div class="card nodedetail" style="--bc:${br.color}">${parts.join('')}</div>`;
  }

  UI.tabSkills = (G, S) => {
    const b = UI.st.branch;
    const br = D.BRANCHES.find((x) => x.id === b);
    const nodes = D.SKILL_LIST.filter((n) => n.branch === b);
    if (!UI.st.node || !D.SKILLS[UI.st.node] || D.SKILLS[UI.st.node].branch !== b) UI.st.node = nodes[0].id;
    const have = M.hub.pointsIn(G, b);
    const tabs = D.BRANCHES.map((x) => `<button type="button" class="branch" style="--bc:${x.color}" data-act="branch" data-branch="${x.id}" aria-pressed="${x.id === b}">${icon(x.icon)} ${x.name} <b class="num">${M.hub.pointsIn(G, x.id)}</b><small>${x.hero === 'both' ? 'Duo' : x.hero === 'finn' ? 'Finn' : 'Jake'}</small></button>`).join('');
    const H = 4 * 104 + 3 * 10;
    const cy = (t) => (t - 1) * 114 + 52;
    const cx = (c) => ((c * 2 + 1) / 6) * 300;
    const links = nodes.filter((n) => n.req).map((n) => { const r = D.SKILLS[n.req]; const on = G.skills[r.id] > 0; return `<line x1="${cx(r.col)}" y1="${cy(r.tier)}" x2="${cx(n.col)}" y2="${cy(n.tier)}" stroke="${on ? br.color : '#b7c3d4'}" stroke-width="4" vector-effect="non-scaling-stroke" stroke-dasharray="${on ? '0' : '6 6'}" stroke-linecap="round"/>`; }).join('');
    const cells = nodes.map((n) => {
      const rank = G.skills[n.id] || 0;
      const st = M.hub.skillState(G, n.id);
      const cls = ['node', n.ability ? 'ability' : '', rank ? 'has' : '', rank >= n.max ? 'max' : '', st.ok ? 'can' : '', st.locked ? 'locked' : '', UI.st.node === n.id ? 'sel' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" style="grid-row:${n.tier};grid-column:${n.col + 1};--bc:${br.color}" data-act="node" data-id="${n.id}" aria-label="${esc(n.name)}, rank ${rank} of ${n.max}">${icon(nodeIcon(n))}<span class="nn">${esc(n.name)}</span><span class="rk">${'●'.repeat(rank)}${'○'.repeat(n.max - rank)}</span></button>`;
    }).join('');
    const tiers = [1, 2, 3, 4].map((t) => `<div><b class="${have >= D.TIER_REQ[t] ? '' : 'muted'}">T${t}</b><span>${D.TIER_REQ[t] ? D.TIER_REQ[t] + ' pts' : 'open'}</span></div>`).join('');
    return `<div class="spread"><h2>Skills</h2><span class="${G.sp ? 'good' : 'muted'}"><b class="num">${G.sp}</b> point${G.sp === 1 ? '' : 's'} to spend · +1 per level, +2 every fifth</span></div>
      <div class="branches">${tabs}</div>
      <p class="small muted"><b style="color:${br.color}">${esc(br.name)}:</b> ${esc(br.motto)} Deeper tiers open as you put points into this branch.</p>
      <div class="treewrap">
        <div class="tree"><div class="tiers">${tiers}</div><div class="nodes"><svg class="links" viewBox="0 0 300 ${H}" preserveAspectRatio="none" aria-hidden="true">${links}</svg>${cells}</div></div>
        <div class="stack">${detail(G, S, D.SKILLS[UI.st.node])}<div class="card"><h3>${AE.ui.hud.face('finn')} Finn’s keys</h3>${UI.barEditor(G, 'finn')}<h3>${AE.ui.hud.face('jake')} Jake’s keys</h3>${UI.barEditor(G, 'jake')}</div></div>
      </div>`;
  };
})();
