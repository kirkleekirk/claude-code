import { useEffect, useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { useFocusScope, useTick, useUi } from '../core/context';
import { LOADING_TIPS, tMenu } from '../strings/menus';
import { SunsetArt } from './SunsetArt';

export function Wordmark({ size = 'xl', ignite = false }: { size?: 'md' | 'lg' | 'xl'; ignite?: boolean }) {
  return (
    <div class={`hh-wordmark-lockup hh-wordmark-${size}${ignite ? ' is-ignited' : ''}`}>
      <span class="hh-wordmark">Hothouse</span>
      <span class="hh-neon hh-wordmark-neon">open late</span>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div class="hh-progress">
      <div class="hh-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
        <div class="hh-progress-fill" style={{ width: `${Math.round(value * 1000) / 10}%` }} />
      </div>
      <div class="hh-progress-label">
        <span>{label}</span>
        <span class="hh-num">{tMenu('loadingPercent', { n: fmt.int(value * 100) })}</span>
      </div>
    </div>
  );
}

/** The very first screen. The click is also the audio-unlock gesture. */
export function ClickToStart() {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const { progress, label } = ui.loading.value;
  const started = ui.started.value;
  const ready = progress >= 1;
  const pad = deps.input.padConnected.value;
  const start = () => ui.markStarted();

  useFocusScope(ref, { name: 'click-to-start', onBack: start });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.key === 'Tab' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') return;
      start();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useTick(() => {
    const i = deps.input;
    if (i.pressed('uiConfirm') || i.pressed('uiBack') || i.pressed('uiSecondary') || i.pressed('uiDetails')) start();
  });

  return (
    <div ref={ref} class="hh-screen hh-start hh-interactive" onPointerDown={start} role="button" aria-label={tMenu('clickToStart')}>
      <SunsetArt />
      <div class="hh-start-scrim" />
      <div class="hh-start-brand hh-enter">
        <Wordmark size="xl" ignite={started} />
        <p class="hh-start-tagline">{tMenu('tagline')}</p>
      </div>
      <div class="hh-start-foot">
        {!ready && <ProgressBar value={progress} label={label || tMenu('warming')} />}
        {ready && !started && <div class="hh-start-cta">{pad ? tMenu('pressToStart') : tMenu('clickToStart')}</div>}
        {ready && started && <div class="hh-start-cta is-started">{tMenu('starting')}</div>}
        {!ready && started && <div class="hh-start-cta is-started">{tMenu('starting')}</div>}
      </div>
    </div>
  );
}

/** Loading between scenes: art card, real progress, rotating tips. */
export function LoadingView({ progress, label }: { progress: number; label: string }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));
  const t = useRef(0);
  useTick((dt) => {
    t.current += dt;
    if (t.current > 7) {
      t.current = 0;
      setTip((i) => (i + 1) % LOADING_TIPS.length);
    }
  });
  return (
    <div class="hh-screen hh-loading hh-interactive">
      <SunsetArt dim={0.25} />
      <div class="hh-loading-brand"><Wordmark size="md" /></div>
      <div class="hh-loading-tip hh-glass" key={tip}>
        <span class="hh-label">Tip</span>
        <p>{LOADING_TIPS[tip]}</p>
      </div>
      <div class="hh-loading-foot">
        <ProgressBar value={progress} label={label || tMenu('warming')} />
      </div>
    </div>
  );
}
