/* Shared UI pieces. Every function returns an HTML string; main.js wires clicks via data-act. */
(function () {
  'use strict';
  const D = LCO.data;
  const U = LCO.U;
  const ENG = LCO.engine;
  const icon = LCO.icon;
  const esc = U.esc;
  const UI = LCO.ui;

  UI.st = { tab: 'departures', branch: 'passenger', node: null, target: null, filter: 'all', workItem: null, modal: null };

  const KIND = { weapon: 'Weapon', offhand: 'Off-hand', armor: 'Armor', charm: 'Charm', consumable: 'Consumable', valuable: 'Valuable' };
  UI.kindLabel = (it) => (it.kind === 'consumable' || it.kind === 'valuable' ? KIND[it.kind] : `${D.RARITIES[it.rarity].name} ${KIND[it.kind]}`);

  UI.itemCard = (it, o) => {
    o = o || {};
    if (!it) return `<div class="item empty">${esc(o.emptyLabel || 'Empty')}</div>`;
    const qty = it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : '';
    const upg = it.upg ? ` <span class="upg">+${it.upg}</span>` : '';
    const price = o.price != null ? `<span class="price">${U.fmt(o.price)} tix</span>` : '';
    const attrs = `data-act="${o.act || 'inspect'}" data-uid="${esc(it.uid)}" data-from="${esc(o.from || '')}"${o.slot != null ? ` data-slot="${esc(o.slot)}"` : ''}${o.key ? ` data-key="${esc(o.key)}"` : ''}`;
    const sel = o.selected ? ' selected' : '';
    return `<button type="button" class="item r${it.rarity}${sel}" ${attrs} title="${esc(it.name)}">
      <span class="face">${icon(ENG.loot.iconOf(it))}</span>
      <span class="txt"><span class="nm">${esc(it.name)}${upg}</span><span class="sub"><span>${esc(UI.kindLabel(it))}</span>${it.kind !== 'consumable' ? `<span>T${it.ilvl}</span>` : ''}${price}</span></span>${qty}
    </button>`;
  };

  UI.itemDetail = (it, S, o) => {
    o = o || {};
    const rc = `var(--r${it.rarity})`;
    const parts = [];
    parts.push(`<div class="title"><div class="face" style="background:color-mix(in srgb, ${rc} 16%, #0b1714);color:${rc}">${icon(ENG.loot.iconOf(it))}</div>
      <div class="stack" style="gap:2px"><h3 class="rtext r${it.rarity}">${esc(it.name)}${it.upg ? ` <span class="upg mono">+${it.upg}</span>` : ''}</h3>
      <span class="muted small">${esc(UI.kindLabel(it))}${it.kind !== 'consumable' ? ` · Item tier ${it.ilvl}` : ''}${it.qty > 1 ? ` · ×${it.qty}` : ''}</span></div></div>`);
    if (ENG.loot.GEAR.includes(it.kind)) {
      const b = D.BASES[it.base];
      const lines = ENG.loot.statLines(it);
      if (lines.length) parts.push(`<ul class="lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
      if (b.text) parts.push(`<p class="small muted">${esc(b.text)}</p>`);
      if (it.power) { const pw = D.MINOR_POWERS[it.power]; parts.push(`<div class="power" style="--rc:var(--r3)"><b>${esc(pw.name)}</b>${esc(pw.desc)}</div>`); }
      if (it.relic) {
        const rd = D.RELICS[it.relic];
        parts.push(`<div class="power" style="--rc:${rc}"><b>${it.rarity === 5 ? 'Engine-Forged Power' : 'Relic Power'}</b>${esc(rd.desc)}</div>`);
        if (rd.set) { const set = D.SETS[rd.set]; parts.push(`<div class="power" style="--rc:var(--glow)"><b>Set: ${esc(set.name)}</b>${esc(set.desc)}</div>`); }
        parts.push(`<p class="lore">${esc(rd.lore)}</p>`);
      }
    } else if (it.kind === 'consumable') {
      const c = D.CONSUMABLES[it.base];
      parts.push(`<p>${esc(c.desc)}</p><p class="small muted">${c.use === 'combat' ? 'Use in a fight from your belt.' : c.use === 'map' ? 'Use while exploring a car.' : c.use === 'key' ? 'Used automatically on locks and couplings.' : 'Use in a fight or while exploring.'}</p>`);
    } else if (it.kind === 'valuable') {
      parts.push('<p class="lore">Worth more to someone else than to you. Carry it home and sell it.</p>');
    }
    if (S) parts.push(`<p class="small">Sells for <b class="mono">${U.fmt(ENG.loot.sellPrice(it, S))}</b> Tickets</p>`);
    if (o.compare) {
      const cl = ENG.loot.statLines(o.compare);
      parts.push(`<div class="compare"><div class="eyebrow">Currently equipped</div><div class="rtext r${o.compare.rarity}" style="font-weight:700">${esc(o.compare.name)}${o.compare.upg ? ' +' + o.compare.upg : ''}</div>${cl.length ? `<ul class="lines">${cl.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>`);
    }
    return `<div class="detail">${parts.join('')}</div>`;
  };

  UI.meter = (v, max, cls, extra) => {
    const pct = max > 0 ? U.clamp((v / max) * 100, 0, 100) : 0;
    return `<div class="meter ${cls || ''}" role="meter" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="${Math.round(max)}"><i style="width:${pct.toFixed(1)}%"></i>${extra || ''}</div>`;
  };
  UI.hpMeter = (hp, max, guard) => {
    const f = max ? hp / max : 0;
    const cls = 'hp ' + (f > 0.6 ? 'high' : f > 0.3 ? 'mid' : '');
    const g = guard ? `<span class="ghost-guard" style="width:${U.clamp((guard / max) * 100, 0, 100).toFixed(1)}%"></span>` : '';
    return UI.meter(hp, max, cls, g);
  };

  const PALM = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M21 60c-6-7-9-15-9-24V24c0-3 4-3 4 0v9h2V13c0-3 4-3 4 0v17h2V9c0-3 4-3 4 0v21h2V11c0-3 4-3 4 0v21h2V19c0-3 4-3 4 0v19c0 3 1 4 3 2l4-5c2-2 5 0 4 2l-6 10c-3 6-6 10-10 13z" fill="#0f2622" stroke="#3a8f7b" stroke-width="1.6" stroke-linejoin="round"/><circle cx="29" cy="42" r="7" fill="rgba(127,240,208,.18)"/></svg>';
  UI.palm = (n, big) => `<span class="palm${big ? ' big' : ''}" title="Your Number. Growth lowers it; harm raises it. Reach 0 to go home.">${PALM}<span class="n num">${n}</span><span class="lbl">Your Number</span></span>`;

  UI.statusChips = (st) => {
    const out = [];
    for (const id of D.STATUS_ORDER) {
      const n = st && st[id];
      if (!n) continue;
      const def = D.STATUSES[id];
      out.push(`<span class="st ${def.kind}" title="${esc(def.name + ': ' + def.desc(n))}">${icon(def.icon)}${n}</span>`);
    }
    return `<div class="sts">${out.join('')}</div>`;
  };

  UI.coins = (G, carry) => {
    const c = carry || G;
    return `<div class="purse">
      <span class="coin" title="Tickets — the train's currency">${icon('ticket')}<span>${U.fmt(c.tickets)}</span></span>
      <span class="coin scrap" title="Scrap — for upgrading gear">${icon('gear')}<span>${U.fmt(c.scrap)}</span></span>
      <span class="coin glimmer" title="Glimmer — rare; for high-end upgrades and rerolls">${icon('crystal')}<span>${U.fmt(c.glimmer)}</span></span>
    </div>`;
  };

  /* ---------- procedural denizens ---------- */
  const ANCHOR = { round: [50, 66, 26], square: [48, 66, 28], tall: [40, 58, 16], blob: [50, 66, 26], tri: [60, 74, 18], hex: [46, 64, 16], orb: [50, 66, 20], shell: [56, 66, 32] };
  UI.denizen = (sp, o) => {
    o = o || {};
    const c = sp.color, a = sp.accent;
    const [ey, my, top] = ANCHOR[sp.body] || ANCHOR.round;
    const dark = 'rgba(0,0,0,.28)';
    let body = '';
    switch (sp.body) {
      case 'square': body = `<rect x="22" y="28" width="56" height="58" rx="10" fill="${c}"/>`; break;
      case 'tall': body = `<rect x="30" y="16" width="40" height="72" rx="18" fill="${c}"/>`; break;
      case 'blob': body = `<path d="M20 70Q16 40 38 30Q52 18 66 30Q86 40 80 70Q84 88 64 86Q50 92 36 86Q16 88 20 70Z" fill="${c}"/>`; break;
      case 'tri': body = `<path d="M50 16L86 84L14 84Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`; break;
      case 'hex': body = `<path d="M50 16L80 33V69L50 86L20 69V33Z" fill="${c}"/>`; break;
      case 'orb': body = `<circle cx="50" cy="52" r="32" fill="${c}"/><circle cx="50" cy="52" r="26" fill="none" stroke="${a}" stroke-width="1.5" opacity=".45"/>`; break;
      case 'shell': body = `<path d="M14 72Q18 32 50 30Q82 32 86 72Z" fill="${c}"/><path d="M26 72L34 42M50 72V32M74 72L66 42" stroke="${dark}" stroke-width="3"/><path d="M22 72l-8 12M36 74l-4 12M64 74l4 12M78 72l8 12" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`; break;
      default: body = `<circle cx="50" cy="56" r="30" fill="${c}"/>`;
    }
    const shade = `<ellipse cx="50" cy="94" rx="26" ry="3.5" fill="#000" opacity=".35"/>`;
    let extra = '';
    switch (sp.extra) {
      case 'ears': extra = `<path d="M30 ${top + 8}L26 ${top - 12}L42 ${top + 2}ZM70 ${top + 8}L74 ${top - 12}L58 ${top + 2}Z" fill="${c}"/><path d="M31 ${top + 3}L29 ${top - 5}L37 ${top + 1}ZM69 ${top + 3}L71 ${top - 5}L63 ${top + 1}Z" fill="${a}"/>`; break;
      case 'crown': extra = `<path d="M34 ${top + 2}L36 ${top - 12}L43 ${top - 4}L50 ${top - 15}L57 ${top - 4}L64 ${top - 12}L66 ${top + 2}Z" fill="${a}" stroke="#0b1714" stroke-width="1"/>`; break;
      case 'hat': extra = `<rect x="30" y="${top - 3}" width="40" height="5" rx="2" fill="#1a1a1a"/><rect x="38" y="${top - 17}" width="24" height="15" rx="2" fill="#1a1a1a"/><rect x="38" y="${top - 7}" width="24" height="3" fill="${a}"/>`; break;
      case 'antenna': extra = `<path d="M50 ${top + 2}V${top - 12}" stroke="${a}" stroke-width="2.5"/><circle cx="50" cy="${top - 14}" r="4" fill="${a}"/>`; break;
      case 'horns': extra = `<path d="M34 ${top + 6}Q24 ${top - 6} 30 ${top - 14}Q32 ${top - 2} 40 ${top + 2}ZM66 ${top + 6}Q76 ${top - 6} 70 ${top - 14}Q68 ${top - 2} 60 ${top + 2}Z" fill="${a}"/>`; break;
      case 'halo': extra = `<ellipse cx="50" cy="${top - 8}" rx="16" ry="4" fill="none" stroke="${a}" stroke-width="2.5"/>`; break;
      case 'spikes': extra = `<path d="M26 ${top + 12}l-8-6 10 0M74 ${top + 12}l8-6-10 0M50 ${top}l0-10M38 ${top + 3}l-5-8M62 ${top + 3}l5-8" stroke="${a}" stroke-width="3" stroke-linecap="round"/>`; break;
      case 'tape': extra = `<path d="M24 ${ey + 12}Q50 ${ey + 24} 78 ${ey + 8}M28 ${ey - 12}Q52 ${ey - 2} 74 ${ey - 16}" stroke="${a}" stroke-width="3" fill="none" opacity=".8"/>`; break;
      case 'wire': extra = `<path d="M30 30V86M50 20V90M70 30V86M22 45H78M22 65H78" stroke="${a}" stroke-width="1" opacity=".45"/>`; break;
      case 'number': extra = `<text x="50" y="${my + 16}" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="14" fill="${a}">${o.num || '#'}</text>`; break;
      case 'tie': extra = `<path d="M46 ${my + 6}h8l-2 4 3 10-5 4-5-4 3-10z" fill="${a}"/>`; break;
      case 'leaf': extra = `<path d="M50 ${top + 2}C44 ${top - 10} 58 ${top - 16} 62 ${top - 12}C60 ${top - 4} 54 ${top} 50 ${top + 2}Z" fill="${a}"/>`; break;
      default: break;
    }
    let eyes = '';
    const W = '#f4efe2', K = '#0b1714';
    switch (sp.eyes) {
      case 'one': eyes = `<circle cx="50" cy="${ey}" r="10" fill="${W}"/><circle cx="50" cy="${ey}" r="5" fill="${a}"/><circle cx="50" cy="${ey}" r="2.2" fill="${K}"/>`; break;
      case 'many': eyes = [[38, -3, 4], [50, -7, 5], [62, -3, 4], [44, 5, 3], [57, 5, 3]].map(([x, dy, r]) => `<circle cx="${x}" cy="${ey + dy}" r="${r}" fill="${W}"/><circle cx="${x}" cy="${ey + dy}" r="${r / 2}" fill="${K}"/>`).join(''); break;
      case 'visor': eyes = `<rect x="30" y="${ey - 6}" width="40" height="11" rx="5" fill="${K}"/><rect x="33" y="${ey - 3}" width="34" height="5" rx="2.5" fill="${a}"/>`; break;
      case 'slits': eyes = `<path d="M34 ${ey - 3}l10 4M66 ${ey - 3}l-10 4" stroke="${a}" stroke-width="3.5" stroke-linecap="round"/>`; break;
      case 'x': eyes = `<path d="M36 ${ey - 5}l8 8M44 ${ey - 5}l-8 8M56 ${ey - 5}l8 8M64 ${ey - 5}l-8 8" stroke="${K}" stroke-width="3" stroke-linecap="round"/>`; break;
      case 'none': break;
      default: eyes = `<circle cx="40" cy="${ey}" r="6" fill="${W}"/><circle cx="60" cy="${ey}" r="6" fill="${W}"/><circle cx="41" cy="${ey + 1}" r="3" fill="${K}"/><circle cx="61" cy="${ey + 1}" r="3" fill="${K}"/>`;
    }
    let mouth = '';
    switch (sp.mouth) {
      case 'line': mouth = `<path d="M43 ${my}h14" stroke="${K}" stroke-width="2.5" stroke-linecap="round"/>`; break;
      case 'o': mouth = `<ellipse cx="50" cy="${my}" rx="4" ry="5" fill="${K}"/>`; break;
      case 'teeth': mouth = `<path d="M38 ${my - 2}h24v6H38z" fill="${K}"/><path d="M40 ${my - 2}l3 4 3-4 3 4 3-4 3 4 3-4 3 4" fill="${W}"/>`; break;
      case 'smile': mouth = `<path d="M41 ${my - 2}Q50 ${my + 7} 59 ${my - 2}" stroke="${K}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; break;
      case 'beak': mouth = `<path d="M43 ${my - 5}L57 ${my - 5}L50 ${my + 5}Z" fill="${a}"/>`; break;
      default: break;
    }
    const ring = o.boss ? `<circle cx="50" cy="52" r="46" fill="none" stroke="#ff6a4a" stroke-width="1.5" stroke-dasharray="3 5" opacity=".6"/>` : o.elite ? `<circle cx="50" cy="52" r="45" fill="none" stroke="#f0b43c" stroke-width="1.2" stroke-dasharray="2 5" opacity=".6"/>` : '';
    const shimmer = o.mirrored ? `<path d="M26 28L74 84" stroke="#fff" stroke-width="2" opacity=".25"/>` : '';
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${ring}${shade}${body}${extra}${eyes}${mouth}${shimmer}</svg>`;
  };

  /* ---------- toasts & modals ---------- */
  UI.toast = (msg, kind) => {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 2400);
    while (root.children.length > 3) root.firstChild.remove();
  };
  UI.openModal = (html, cls) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-back" data-backdrop="1"><div class="modal ${cls || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const f = root.querySelector('button, [tabindex], input, select, textarea');
    if (f) f.focus({ preventScroll: true });
  };
  UI.closeModal = () => { const root = document.getElementById('modal-root'); if (root) root.innerHTML = ''; UI.st.modal = null; };
  UI.modalHead = (title, sub) => `<div class="modal-head"><div class="stack" style="gap:4px"><h2>${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div><button type="button" class="xbtn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div>`;
})();
