/* Shared UI pieces for the Tree Fort screens. Functions return HTML strings; main.js wires data-act clicks. */
(function () {
  'use strict';
  const D = AE.data;
  const U = AE.U;
  const M = AE.meta;
  const icon = AE.icon;
  const esc = U.esc;
  const UI = AE.ui;

  UI.st = { tab: 'missions', branch: 'hero', node: null, filter: 'all', work: null, inspectSlot: null, confirm: null };

  UI.kindLine = (it) => (it.kind === 'consumable' || it.kind === 'valuable' ? D.KIND_LABEL[it.kind] : `${D.RARITIES[it.rarity].name} ${D.KIND_LABEL[it.kind]}`);
  UI.forWho = (it) => { const h = M.loot.heroFor(it); return h === 'finn' ? 'Finn' : h === 'jake' ? 'Jake' : h === 'both' ? 'Both' : ''; };

  UI.itemCard = (it, o) => {
    o = o || {};
    if (!it) return `<div class="item empty">${esc(o.empty || 'Empty')}</div>`;
    const attrs = `data-act="${o.act || 'inspect'}" data-uid="${esc(it.uid)}" data-from="${esc(o.from || '')}"${o.slot != null ? ` data-slot="${esc(o.slot)}"` : ''}`;
    const who = UI.forWho(it);
    return `<button type="button" class="item r${it.rarity}${o.selected ? ' selected' : ''}" ${attrs} title="${esc(it.name)}">
      <span class="face">${icon(M.loot.iconOf(it))}</span>
      <span class="txt"><span class="nm">${esc(it.name)}${it.upg ? ` <span class="upg">+${it.upg}</span>` : ''}</span>
      <span class="sub">${esc(UI.kindLine(it))}${it.kind !== 'consumable' ? ` · T${it.ilvl}` : ''}${who ? ` · ${who}` : ''}${o.price != null ? ` · <b class="price">${U.fmt(o.price)}g</b>` : ''}</span></span>
      ${it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : ''}
    </button>`;
  };

  UI.itemDetail = (G, it, o) => {
    o = o || {};
    const T = M.stats.compute(G).team;
    const col = D.RARITIES[it.rarity].color;
    const out = [`<div class="dhead"><span class="dface" style="--rc:${col}">${icon(M.loot.iconOf(it))}</span><div><h3 class="rtext r${it.rarity}">${esc(it.name)}${it.upg ? ' +' + it.upg : ''}</h3><p class="muted small">${esc(UI.kindLine(it))}${it.kind !== 'consumable' ? ` · Item tier ${it.ilvl}` : ''}${UI.forWho(it) ? ` · For ${UI.forWho(it)}` : ''}</p></div></div>`];
    if (D.GEAR_KINDS.includes(it.kind)) {
      const b = D.BASES[it.base];
      const lines = M.loot.statLines(it);
      if (lines.length) out.push(`<ul class="lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
      if (b.text) out.push(`<p class="small muted">${esc(b.text)}</p>`);
      if (it.power) { const pw = D.POWERS[it.power]; out.push(`<div class="power" style="--rc:${D.RARITIES[3].color}"><b>${esc(pw.name)}</b>${esc(pw.desc)}</div>`); }
      if (it.relic) { const rd = D.RELICS[it.relic]; out.push(`<div class="power" style="--rc:${col}"><b>${it.rarity === 5 ? 'Glob-Tier Power' : 'Legendary Power'}</b>${esc(rd.desc)}</div><p class="lore">${esc(rd.lore)}</p>`); }
    } else if (it.kind === 'consumable') out.push(`<p>${esc(D.CONSUMABLES[it.base].desc)}</p><p class="small muted">Put snacks on the belt to use them mid-trip with 4, 5 and 6.</p>`);
    else out.push('<p class="lore">Treasure! Sell it to Choose Goose for gold.</p>');
    out.push(`<p class="small">Choose Goose pays <b>${U.fmt(M.loot.sellPrice(it, T))}g</b></p>`);
    if (o.compare) { const cl = M.loot.statLines(o.compare); out.push(`<div class="compare"><span class="eyebrow">Currently equipped</span><b class="rtext r${o.compare.rarity}">${esc(o.compare.name)}</b>${cl.length ? `<ul class="lines">${cl.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>`); }
    return `<div class="detail">${out.join('')}</div>`;
  };

  UI.meter = (v, max, cls) => `<div class="meter ${cls || ''}"><i style="width:${max > 0 ? U.clamp((v / max) * 100, 0, 100).toFixed(1) : 0}%"></i></div>`;
  UI.coins = (G) => `<div class="purse"><span class="coin" title="Gold">${icon('coin')}<b class="num">${U.fmt(G.gold)}</b></span><span class="coin dust" title="Magic Dust — for BMO's upgrades">${icon('dust')}<b class="num">${U.fmt(G.dust)}</b></span><span class="coin shard" title="Crystal Shards — rare, for top-tier upgrades">${icon('crystal')}<b class="num">${U.fmt(G.shards)}</b></span></div>`;

  UI.toast = (msg, kind) => {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    while (root.children.length > 3) root.firstChild.remove();
  };
  UI.openModal = (html, cls) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-back" data-backdrop="1"><div class="modal ${cls || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const f = root.querySelector('button, input, select, textarea');
    if (f) f.focus({ preventScroll: true });
  };
  UI.closeModal = () => { const r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; };
  UI.modalHead = (title, sub) => `<div class="modal-head"><div><h2>${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div><button type="button" class="xbtn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div>`;
})();
