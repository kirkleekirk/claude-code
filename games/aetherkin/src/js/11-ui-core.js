/* ============================================================================
   UI CORE — router, shared parts, and the small chrome around the game.
   ========================================================================== */
const UI = { screen: 'title', ctx: {}, battle: null, tab: 'overview' };
const SCREENS = {};

function go(name, ctx) { UI.screen = name; UI.ctx = ctx || {}; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
function render() {
  const stage = $('#stage');
  if (!stage) return;
  clearNode(stage);
  const build = SCREENS[UI.screen] || SCREENS.title;
  stage.append(build(UI.ctx));
  paintRail();
}
function paintRail() {
  const gold = $('#r-gold'), zone = $('#r-zone'), btns = $('#railbtns');
  const inGame = GAME.started && UI.screen !== 'title' && UI.screen !== 'starter';
  gold.hidden = !inGame; zone.hidden = !inGame;
  if (inGame) {
    gold.lastElementChild.textContent = GAME.gold.toLocaleString() + ' aur';
    const z = ZONES[GAME.zone];
    clearNode(zone).append(el('span', null, z ? z.n + ' — step ' + Math.min(GAME.step, z.steps) + '/' + z.steps : ''));
  }
  clearNode(btns);
  if (inGame && UI.screen !== 'battle') {
    if (UI.screen !== 'camp') btns.append(el('button.btn.small', { onclick: () => go('camp') }, 'Camp'));
    btns.append(el('button.btn.small.ghost', { onclick: () => { saveGame(); toast('Progress saved.', 'good'); } }, 'Save'));
  }
  const tr = $('#tick-right');
  if (tr) tr.textContent = inGame ? GAME.party.length + ' bound · ' + Object.keys(GAME.bound).length + '/' + SPECIES_IDS.length + ' in codex' : '';
}

function toast(msg, tone) {
  const box = $('#toasts');
  if (!box) return;
  const t = el('div.toast' + (tone ? '.' + tone : ''), null, msg);
  box.append(t);
  setTimeout(() => { t.style.transition = 'opacity .35s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 360); }, 2400);
}
let _veil = null;
function modal(title, body, actions) {
  closeModal();
  const card = el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('h3', { style: { marginBottom: '10px' } }, title), body,
    el('div.cols', { style: { marginTop: '16px', justifyContent: 'flex-end' } },
      (actions || [{ label: 'Close' }]).map(a =>
        el('button.btn' + (a.primary ? '.primary' : ''), { onclick: () => { closeModal(); if (a.run) a.run(); } }, a.label))));
  _veil = el('div.veil', { onclick: e => { if (e.target === _veil) closeModal(); } }, card);
  document.body.append(_veil);
  const first = _veil.querySelector('button');
  if (first) first.focus();
  return _veil;
}
function closeModal() { if (_veil) { _veil.remove(); _veil = null; } }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ---------------- shared parts ------------------------------------------ */
const typeChip = t => el('span.chip', { style: { color: typeHue(t) } }, typeName(t));
const typeChips = types => el('div.chips', null, types.map(typeChip));

function hpBar(cur, max) {
  const p = pctOf(cur, max);
  const cls = p <= 0.2 ? '.crit' : p <= 0.45 ? '.low' : '';
  return el('div.bar' + cls, null, el('i', { style: { width: (p * 100).toFixed(1) + '%' } }));
}
function statBlock(kin) {
  const st = statsFor(kin);
  const peak = Math.max(...['frc', 'grd', 'arc', 'wrd', 'swf'].map(k => st[k]), 1);
  return el('div.statgrid', null, ['frc', 'grd', 'arc', 'wrd', 'swf'].map(k =>
    el('div.statrow', null,
      el('em', null, STAT_SHORT[k]),
      el('div.bar', null, el('i', { style: { width: (st[k] / peak * 100).toFixed(0) + '%', background: 'var(--brass)' } })),
      el('b', null, st[k]))));
}
function motesLine(kin) {
  const st = latticeState(kin);
  return el('span.motepip', null, st.free + ' free · ' + st.spent + ' spent');
}
function kinCard(kin, opts) {
  const o = opts || {};
  const sp = SPECIES[kin.sp], st = statsFor(kin), free = latticeState(kin).free;
  const card = el('button.kincard' + (kin.hp <= 0 ? '.down' : ''), {
    onclick: o.onclick, 'aria-current': o.current ? 'true' : null, type: 'button',
  },
    el('div.glyph-wrap', null, glyphEl(kin.sp, 62, { dense: false })),
    el('div.rows', { style: { gap: '5px' } },
      el('div.kinmeta', null,
        el('h4', null, kinName(kin)),
        el('span.lv', null, 'Lv ' + kin.lv),
        free > 0 ? el('span.motepip', null, free + ' ' + plural(free, 'Mote')) : null),
      typeChips(sp.t),
      el('div.hpline', null, el('span', null, kin.hp + '/' + st.hp), hpBar(kin.hp, st.hp)),
      o.xp === false ? null : el('div.bar.xp', null, el('i', { style: { width: (xpProgress(kin) * 100).toFixed(1) + '%' } }))));
  return card;
}
function sectionHead(eyebrow, title, lede) {
  return el('div.rows', { style: { gap: '5px' } },
    eyebrow ? el('div.eyebrow', null, eyebrow) : null,
    el('h2', { style: { fontSize: '25px' } }, title),
    lede ? el('p.lede', { style: { margin: 0 } }, lede) : null);
}
const moveMeta = m => [
  m.c === 'stat' ? 'Status' : (m.c === 'phys' ? 'Close' : 'Arcane'),
  m.p ? m.p + ' pow' : null,
  m.a ? m.a + '%' : 'unerring',
  m.pri ? 'priority ' + signed(m.pri) : null,
  m.cd ? m.cd + '-turn cooldown' : null,
  m.hits ? m.hits[0] + '-' + m.hits[1] + ' hits' : null,
].filter(Boolean).join(' · ');

/* the small sigil that marks what kind of thing a lattice node is */
function nodeSigil(kind, colour) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('class', 'sig'); svg.setAttribute('aria-hidden', 'true');
  const d = {
    core:    'M10 3.5 A6.5 6.5 0 1 0 10 16.5 A6.5 6.5 0 1 0 10 3.5 Z',
    move:    'M3.5 10 L9 4.5 L9 8 L16.5 8 L16.5 12 L9 12 L9 15.5 Z',
    passive: 'M10 2.6 L16.6 6.2 L16.6 12.4 Q10 18.4 10 18.4 Q3.4 12.4 3.4 12.4 L3.4 6.2 Z',
    ability: 'M10 2.4 L17.6 10 L10 17.6 L2.4 10 Z M10 7.2 L12.8 10 L10 12.8 L7.2 10 Z',
    stat:    'M8.4 3 L11.6 3 L11.6 8.4 L17 8.4 L17 11.6 L11.6 11.6 L11.6 17 L8.4 17 L8.4 11.6 L3 11.6 L3 8.4 L8.4 8.4 Z',
    evolve:  'M10 1.8 L13.2 7 L18.2 10 L13.2 13 L10 18.2 L6.8 13 L1.8 10 L6.8 7 Z',
  }[kind] || 'M4 4 H16 V16 H4 Z';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', colour || 'currentColor');
  svg.append(path);
  return svg;
}
