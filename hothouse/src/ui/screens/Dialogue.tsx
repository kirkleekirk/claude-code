import { useRef, useState } from 'preact/hooks';
import type { VoiceProfile } from '@/audio/api';
import { hashString } from '@/core/rng';
import { Chip, ScrollArea } from '../components/display';
import { ActionHint, Glyph } from '../components/Glyph';
import { Drawer } from '../components/Modal';
import { useFocusScope, useSound, useTick, useUi } from '../core/context';
import { Portrait } from '../portrait/Portrait';
import type { LayerEntry } from '../runtime';
import { tCards } from '../strings/menus';

type Entry = Extract<LayerEntry, { kind: 'dialogue' }>;

const CHARS_PER_SECOND = 52;
const SUBTITLE_HOLD = 2.4;

/** A stable voice per speaker when the script does not provide one. */
function voiceFor(name: string): VoiceProfile {
  const h = hashString(name);
  return { pitch: 110 + (h % 180), brightness: ((h >>> 8) % 100) / 100, expressiveness: 0.3 + ((h >>> 16) % 60) / 100 };
}

export function DialogueCard({ entry }: { entry: Entry }) {
  const { ui, deps } = useUi();
  const play = useSound();
  const script = entry.script;
  const blocking = script.blocking ?? true;
  const skippable = script.skippable ?? true;
  const reduced = deps.settings.get('a11y.reducedMotion');
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const acc = useRef(0);
  const hold = useRef(0);
  const line = script.lines[index]!;
  const full = line.text.length;
  const complete = shown >= full;
  const last = index === script.lines.length - 1;
  const choices = last && complete ? line.choices ?? null : null;

  const finish = (choice: number | null, skipped = false) => ui.resolveLayer(entry.id, { choice, skipped });
  const advance = () => {
    if (!complete) {
      setShown(full);
      return;
    }
    if (choices) return;
    if (last) {
      finish(null);
      return;
    }
    play('focus');
    setIndex((i) => i + 1);
    setShown(0);
    acc.current = 0;
    hold.current = 0;
  };

  useFocusScope(ref, {
    name: 'dialogue',
    context: blocking ? 'cutscene' : null,
    onDetails: () => setLogOpen((o) => !o),
    onSecondary: skippable ? () => finish(null, true) : undefined,
  }, blocking);

  useTick((dt) => {
    if (logOpen) return;
    if (!complete) {
      if (reduced) {
        setShown(full);
        return;
      }
      acc.current += dt * CHARS_PER_SECOND;
      const next = Math.min(full, Math.floor(acc.current));
      if (next !== shown) {
        // One babble syllable every couple of letters.
        const fresh = line.text.slice(shown, next);
        if (/[a-z0-9]/i.test(fresh) && Math.floor(next / 2) !== Math.floor(shown / 2)) {
          const emphasis = /[!?]/.test(line.text.slice(next, next + 2)) ? 1 : 0.4;
          deps.blip?.(line.voice ?? voiceFor(line.speaker), emphasis);
        }
        setShown(next);
      }
      return;
    }
    if (!blocking) {
      hold.current += dt;
      if (hold.current >= SUBTITLE_HOLD + full / 40) advance();
      return;
    }
    if (!choices && deps.input.pressed('uiConfirm')) advance();
  });

  if (!blocking) {
    return (
      <div class="hh-subtitle" role="status" aria-live="polite">
        <span class="hh-subtitle-name">{line.speaker}</span>
        <span class="hh-subtitle-text">{line.text}</span>
      </div>
    );
  }

  const visible = line.text.slice(0, shown);
  return (
    <div class="hh-overlay hh-dialogue hh-interactive" onClick={(e) => !(e.target as HTMLElement).closest('button') && advance()}>
      <div class="hh-dialogue-letterbox" aria-hidden="true" />
      <div ref={ref} class="hh-dialogue-card hh-glass" role="dialog" aria-label={line.speaker}>
        {line.appearance && (
          <div class="hh-dialogue-portrait" key={line.speaker}>
            <Portrait appearance={line.appearance} expression={line.expression ?? 'neutral'} size="9.5rem" framing="bust" shape="rounded" label={line.speaker} />
          </div>
        )}
        <div class="hh-dialogue-body">
          <div class="hh-dialogue-name">{line.speaker}</div>
          <p class="hh-dialogue-text" aria-live="polite">
            {visible}
            <span class="hh-dialogue-ghost" aria-hidden="true">{line.text.slice(shown)}</span>
          </p>
          <div class="hh-dialogue-foot">
            {choices ? (
              <div class="hh-dialogue-choices">
                {choices.map((c, i) => (
                  <Chip key={c} tone="lime" onPress={() => finish(i)}>{c}</Chip>
                ))}
              </div>
            ) : (
              <span class={`hh-dialogue-next${complete ? ' is-ready' : ''}`}>
                <Glyph action="uiConfirm" size="sm" />
                <span>{tCards('next')}</span>
              </span>
            )}
            <span class="hh-spacer" />
            {/* Not focusable: Confirm advances the text; these answer to Details and Secondary. */}
            <button type="button" class="hh-dialogue-aux" onClick={() => setLogOpen(true)}>
              <ActionHint action="uiDetails" size="sm">{tCards('log')}</ActionHint>
            </button>
            {skippable && (
              <button type="button" class="hh-dialogue-aux" onClick={() => finish(null, true)}>
                <ActionHint action="uiSecondary" size="sm">{tCards('skip')}</ActionHint>
              </button>
            )}
          </div>
        </div>
      </div>
      {logOpen && (
        <Drawer title={tCards('logTitle')} onClose={() => setLogOpen(false)}>
          <ScrollArea>
            {script.lines.slice(0, index + 1).map((l, i) => (
              <div key={i} class="hh-log-line">
                <span class="hh-log-name">{l.speaker}</span>
                <span>{i === index ? visible : l.text}</span>
              </div>
            ))}
          </ScrollArea>
          <div class="hh-panel-hints"><ActionHint action="uiBack" size="sm">{tCards('next')}</ActionHint></div>
        </Drawer>
      )}
    </div>
  );
}
