/* ---------------- boot ---------------------------------------------------- */
function boot() {
  const stage = $('#stage');
  if (!stage) return;
  try { go('title'); }
  catch (e) {
    stage.append(el('div.panel', null, el('h3', null, 'The instrument will not start.'), el('p.mono', null, String(e && e.message))));
    if (window.console) console.error(e);
  }
  window.addEventListener('beforeunload', () => { if (GAME.started) saveGame(); });
  window.addEventListener('resize', () => {
    for (const c of $$('canvas.glyph')) if (c._species) drawGlyph(c, c._species, c._opts);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
