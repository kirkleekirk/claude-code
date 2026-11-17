import { useRef, useState } from 'preact/hooks';
import { OUTFITS, PLAYER_LOOKS, type Appearance } from '@/content/appearance';
import type { Difficulty } from '@/game/actions';
import { Button } from '../components/Button';
import { Field, SegmentedView, stepOption, type Option } from '../components/controls';
import { useFocusScope, useSound, useUi } from '../core/context';
import { Portrait } from '../portrait/Portrait';
import { tc } from '../strings/common';
import { tMenu } from '../strings/menus';

const DIFFICULTIES: readonly Option<Difficulty>[] = [
  { value: 'chill', label: tMenu('difficulty.chill') },
  { value: 'classic', label: tMenu('difficulty.classic') },
  { value: 'sweaty', label: tMenu('difficulty.sweaty') },
];

function lookWithOutfit(look: number, palette: number): Appearance {
  const l = PLAYER_LOOKS[look]!;
  return { ...l.base, outfit: l.outfits[palette] ?? l.base.outfit };
}

function LookCard({ index, selected, onPick }: { index: number; selected: boolean; onPick: () => void }) {
  const play = useSound();
  const look = PLAYER_LOOKS[index]!;
  return (
    <button
      type="button"
      class={`hh-look${selected ? ' is-selected' : ''}`}
      data-focusable=""
      data-autofocus={selected ? '' : undefined}
      aria-pressed={selected}
      onClick={() => {
        play(selected ? 'focus' : 'confirm');
        onPick();
      }}
    >
      <Portrait appearance={look.base} framing="head" shape="circle" size="4.25rem" blink={false} seed={index * 7 + 3} />
      <span class="hh-look-name">{look.name}</span>
    </button>
  );
}

function OutfitSwatch({ look, slot, selected, onPick }: { look: number; slot: number; selected: boolean; onPick: () => void }) {
  const play = useSound();
  const outfit = OUTFITS[PLAYER_LOOKS[look]!.outfits[slot]!]!;
  return (
    <button
      type="button"
      class={`hh-swatch${selected ? ' is-selected' : ''}`}
      data-focusable=""
      aria-pressed={selected}
      onClick={() => {
        play('confirm');
        onPick();
      }}
    >
      <span class="hh-swatch-colors" aria-hidden="true">
        {outfit.colors.slice(0, 3).map((c, i) => <i key={i} style={{ background: c }} />)}
      </span>
      <span class="hh-swatch-name">{outfit.name}</span>
    </button>
  );
}

export function NewGame() {
  const { ui, deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState(0);
  const [palette, setPalette] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>(deps.settings.get('game.difficulty'));
  const back = () => ui.showFrontend('mainMenu');
  useFocusScope(ref, { name: 'new-game', onBack: back });
  const appearance = lookWithOutfit(look, palette);
  const current = PLAYER_LOOKS[look]!;

  const start = () => {
    deps.settings.set('game.difficulty', difficulty);
    deps.actions.newGame({ look, palette, difficulty });
  };

  return (
    <div ref={ref} class="hh-screen hh-newgame hh-interactive">
      <div class="hh-newgame-scrim" aria-hidden="true" />
      <div class="hh-newgame-hero hh-enter-left">
        <div class="hh-newgame-portrait" key={`${look}-${palette}`}>
          <Portrait appearance={appearance} expression="smug" size="min(25rem, 58vh)" framing="bust" shape="rounded" seed={look * 7 + 3} label={current.name} />
        </div>
        <div class="hh-newgame-who">
          <div class="hh-title-italic hh-newgame-name">{current.name}</div>
          <div class="hh-body">{current.tagline}</div>
        </div>
      </div>
      <div class="hh-newgame-panel hh-glass hh-enter-right">
        <h1 class="hh-title">{tMenu('newGameTitle')}</h1>
        <section>
          <h2 class="hh-label">{tMenu('pickLook')}</h2>
          <div class="hh-look-grid">
            {PLAYER_LOOKS.map((_, i) => (
              <LookCard key={i} index={i} selected={i === look} onPick={() => setLook(i)} />
            ))}
          </div>
        </section>
        <section>
          <h2 class="hh-label">{tMenu('outfit')}</h2>
          <div class="hh-swatch-row">
            {[0, 1, 2, 3].map((p) => (
              <OutfitSwatch key={`${look}-${p}`} look={look} slot={p} selected={p === palette} onPick={() => setPalette(p)} />
            ))}
          </div>
        </section>
        <section>
          <Field
            label={tMenu('difficulty')}
            desc={tMenu(`difficulty.${difficulty}.desc`)}
            onAdjust={(d) => setDifficulty(stepOption(DIFFICULTIES, difficulty, d, false))}
            onActivate={() => setDifficulty(stepOption(DIFFICULTIES, difficulty, 1, true))}
            stacked
          >
            <SegmentedView options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
          </Field>
          <p class="hh-small hh-newgame-note">{tMenu('changeAnytime')}</p>
        </section>
        <div class="hh-newgame-actions">
          <Button variant="ghost" icon="back" onPress={back} sound="back">{tc('back')}</Button>
          <Button variant="primary" size="lg" iconRight="chevronRight" onPress={start}>{tMenu('startSeason')}</Button>
        </div>
      </div>
    </div>
  );
}
