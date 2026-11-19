import { useRef } from 'preact/hooks';
import { useFocusScope, useTick, useUi } from '../core/context';
import type { LayerEntry } from '../runtime';

type Entry = Extract<LayerEntry, { kind: 'titleCard' }>;

/** "Halcyon Bay · 6:40 PM" with a lens-flare sweep. Skippable with any confirm, back or click. */
export function TitleCard({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const t = useRef(0);
  const duration = entry.spec.duration ?? 2.6;
  const done = () => ui.resolveLayer(entry.id);
  useFocusScope(ref, { name: 'title-card', context: 'cutscene', onBack: done });
  useTick((dt) => {
    t.current += dt;
    if (t.current >= duration || (t.current > 0.25 && deps.input.pressed('uiConfirm'))) done();
  });
  return (
    <div ref={ref} class="hh-titlecard hh-interactive" onPointerDown={() => t.current > 0.25 && done()} style={{ '--tc-dur': `${duration}s` }}>
      <div class="hh-titlecard-bars" />
      <div class="hh-titlecard-text">
        <span class="hh-titlecard-title">{entry.spec.title}</span>
        {entry.spec.subtitle && (
          <span class="hh-titlecard-sub">
            <span class="hh-titlecard-dot">·</span>
            {entry.spec.subtitle}
          </span>
        )}
        <span class="hh-titlecard-flare" aria-hidden="true" />
      </div>
    </div>
  );
}
