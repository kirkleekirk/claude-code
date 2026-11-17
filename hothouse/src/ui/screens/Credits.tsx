import { useRef } from 'preact/hooks';
import { ActionHint } from '../components/Glyph';
import { useFocusScope, useTick, useUi } from '../core/context';
import type { LayerEntry } from '../runtime';
import { tc } from '../strings/common';
import { tCards } from '../strings/menus';
import { Wordmark } from './ClickToStart';

type Entry = Extract<LayerEntry, { kind: 'credits' }>;

const SECTIONS: ReadonlyArray<{ title: string; lines: ReadonlyArray<readonly [string, string?]> }> = [
  {
    title: 'Made with',
    lines: [['Claude Code', 'design, engineering, art, sound and words'], ['Halcyon Bay', 'a fictional city; any resemblance to a real place is the sun’s fault']],
  },
  {
    title: 'Built on open source',
    lines: [
      ['three.js', 'MIT · mrdoob and contributors'],
      ['postprocessing', 'Zlib · Raoul van Rüschen'],
      ['N8AO', 'ISC · N8python'],
      ['Rapier', 'Apache 2.0 · Dimforge'],
      ['Preact and Signals', 'MIT · the Preact team'],
      ['Vite', 'MIT · Evan You and contributors'],
      ['TypeScript', 'Apache 2.0 · Microsoft'],
      ['Vitest', 'MIT · the Vitest team'],
      ['Playwright', 'Apache 2.0 · Microsoft'],
    ],
  },
  {
    title: 'Type (SIL Open Font License 1.1)',
    lines: [
      ['Fraunces', 'The Fraunces Project Authors'],
      ['Figtree', 'The Figtree Project Authors'],
      ['Sacramento', 'Astigmatic'],
      ['Caveat', 'The Caveat Project Authors'],
      ['OpenDyslexic', 'Abbie Gonzalez'],
      ['Limelight', 'Sorkin Type Co'],
      ['Alfa Slab One', 'The Alfa Slab One Project Authors'],
      ['Pacifico', 'The Pacifico Project Authors'],
      ['Bungee', 'The Bungee Project Authors'],
      ['Monoton', 'Vernon Adams'],
      ['Saira Stencil One', 'The Saira Stencil Project Authors'],
      ['Knewave', 'Tyler Finck'],
    ],
  },
  {
    title: 'Special thanks',
    lines: [
      ['Ofelia “Abuela” Ruiz', 'for the notebook'],
      ['Every flamingo on every lawn', 'for standing still'],
      ['The Gulf of Mexico', 'for the sunsets'],
      ['You', 'for playing'],
    ],
  },
];

/** Scrolling credits; they drift on their own and Back skips. */
export function Credits({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const close = () => ui.close(entry.id);
  const reduced = deps.settings.get('a11y.reducedMotion');
  useFocusScope(ref, { name: 'credits', onBack: close });
  useTick((dt) => {
    const el = scroller.current;
    if (!el || reduced) return;
    if (el.matches(':hover')) return;
    el.scrollTop += dt * 34;
  });
  return (
    <div ref={ref} class="hh-overlay hh-credits hh-interactive" onClick={close}>
      <div class="hh-scrim" />
      <div ref={scroller} class="hh-credits-roll hh-scroll" aria-label={tCards('creditsTitle')} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div class="hh-credits-inner">
          <Wordmark size="lg" />
          {SECTIONS.map((s) => (
            <section key={s.title} class="hh-credits-section">
              <h2 class="hh-label">{s.title}</h2>
              {s.lines.map(([name, role]) => (
                <div key={name} class="hh-credits-line">
                  <span class="hh-credits-name">{name}</span>
                  {role && <span class="hh-credits-role">{role}</span>}
                </div>
              ))}
            </section>
          ))}
          <p class="hh-credits-end hh-neon">see you at golden hour</p>
        </div>
      </div>
      <div class="hh-credits-skip">
        <button type="button" class="hh-btn hh-btn-secondary hh-btn-sm" data-focusable="" data-autofocus="" onClick={close}>
          <ActionHint action="uiBack" size="sm">{tc('back')}</ActionHint>
        </button>
      </div>
    </div>
  );
}
