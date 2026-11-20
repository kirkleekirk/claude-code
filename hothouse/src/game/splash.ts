/**
 * The boot splash: shown from the first frame until the interface bundle takes over. Plain DOM so
 * it appears before fonts, physics or WebGL are ready, and reports real progress.
 */
export interface Splash {
  set(fraction: number, label: string): void;
  remove(): void;
}

export function showSplash(): Splash {
  const el = document.createElement('div');
  el.id = 'hh-splash';
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9500', 'display:grid', 'place-items:center',
    'background:radial-gradient(120% 90% at 20% 10%,#FF9A3C 0%,#FF3D8B 30%,#3A2A7A 64%,#0B0720 100%)',
    "font-family:'Figtree Variable',Figtree,system-ui,-apple-system,'Segoe UI',sans-serif", 'color:#FFF4E3',
    'transition:opacity 320ms ease',
  ].join(';');
  el.innerHTML = `
    <div style="width:min(28rem,80vw);text-align:left">
      <div style="font:italic 900 clamp(3rem,7vw,5rem)/0.9 'Fraunces Variable',Fraunces,Georgia,serif;letter-spacing:-.02em">Hothouse</div>
      <div style="margin-top:2rem;height:6px;border-radius:999px;background:rgba(255,244,227,.18);overflow:hidden">
        <div data-bar style="height:100%;width:0%;background:#B8F54A;border-radius:999px;transition:width 180ms ease"></div>
      </div>
      <div data-label style="margin-top:.75rem;font-size:1rem;opacity:.85;min-height:1.4em">Waking up the city</div>
    </div>`;
  document.body.appendChild(el);
  const bar = el.querySelector<HTMLElement>('[data-bar]')!;
  const label = el.querySelector<HTMLElement>('[data-label]')!;
  return {
    set(fraction, text) {
      const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      bar.style.width = `${pct}%`;
      el.setAttribute('aria-valuenow', String(pct));
      if (text && label.textContent !== text) label.textContent = text;
    },
    remove() {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 340);
    },
  };
}
