/**
 * Last-resort screens when the game cannot run (no WebGL2) or hits an unrecoverable error.
 * Plain DOM and inline styles so they work even if nothing else loaded.
 */

export type FallbackReason = 'webgl' | 'crash' | 'contextLost';

const COPY: Record<FallbackReason, { title: string; body: string; action: string }> = {
  webgl: {
    title: 'This browser can’t paint Halcyon Bay',
    body: 'HOTHOUSE needs WebGL 2 with hardware acceleration. Turn on hardware acceleration in your browser settings, update your graphics drivers, or try a current version of Chrome, Edge, Firefox or Safari.',
    action: 'Try again',
  },
  crash: {
    title: 'Something broke on our end',
    body: 'The game hit an error it couldn’t recover from. Your last save is safe. Reloading usually fixes it.',
    action: 'Reload',
  },
  contextLost: {
    title: 'The graphics card took a break',
    body: 'Your browser reset the graphics context. Reload to pick up from your last save.',
    action: 'Reload',
  },
};

export function showFallback(reason: FallbackReason): void {
  const copy = COPY[reason];
  document.getElementById('hh-fallback')?.remove();
  const el = document.createElement('div');
  el.id = 'hh-fallback';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-labelledby', 'hh-fallback-title');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:10000', 'display:grid', 'place-items:center', 'padding:4vmin',
    'background:radial-gradient(120% 90% at 20% 10%,#FF9A3C 0%,#FF3D8B 28%,#3A2A7A 62%,#0B0720 100%)',
    "font-family:'Figtree Variable',Figtree,system-ui,-apple-system,'Segoe UI',sans-serif", 'color:#FFF4E3',
  ].join(';');
  el.innerHTML = `
    <div style="max-width:34rem;background:rgba(20,11,51,.86);border-radius:24px;padding:2.25rem 2.5rem;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 24px 60px rgba(8,4,30,.55)">
      <div style="font:italic 900 2.75rem/1 'Fraunces Variable',Fraunces,Georgia,serif;letter-spacing:-.02em;margin-bottom:1rem">HOTHOUSE</div>
      <h1 id="hh-fallback-title" style="font:700 1.5rem/1.25 'Fraunces Variable',Fraunces,Georgia,serif;margin:0 0 .75rem">${copy.title}</h1>
      <p style="font-size:1.0625rem;line-height:1.55;margin:0 0 1.5rem;color:rgba(255,244,227,.86)">${copy.body}</p>
      <button type="button" style="font:800 1.0625rem/1 inherit;background:#B8F54A;color:#140B33;border:0;border-radius:14px;
        padding:.95rem 1.5rem;min-height:44px;cursor:pointer">${copy.action}</button>
    </div>`;
  el.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
  el.querySelector('button')!.focus();
}
