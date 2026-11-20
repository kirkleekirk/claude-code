import { useRef, useState } from 'preact/hooks';
import { HAIR_STYLES, PLAYER_LOOKS, SKIN_TONES, appearanceFromSeed, type Appearance } from '@/content/appearance';
import type { ActionId } from '@/input';
import type { Expression } from '../api';
import { Button, IconButton } from '../components/Button';
import { adjustSlider, CyclerView, Field, SegmentedView, SliderView, StepperView, stepOption, ToggleView, type Option } from '../components/controls';
import { Badge, Card, Chip, EmptyState, ListRow, LockedState, Meter, RadialProgress, ScrollArea, Spinner, Stars } from '../components/display';
import { ActionHint } from '../components/Glyph';
import { MoneyText } from '../components/MoneyText';
import { cycleTab, Tabs, type TabDef } from '../components/Tabs';
import { useFocusScope, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import { ICON_NAMES } from '../icons/names';
import { Portrait } from '../portrait/Portrait';

const SEG: readonly Option<string>[] = [{ value: 'chill', label: 'Chill' }, { value: 'classic', label: 'Classic' }, { value: 'sweaty', label: 'Sweaty' }];
const CYC: readonly Option<string>[] = [{ value: 'a', label: 'Match display' }, { value: 'b', label: '120' }, { value: 'c', label: '60' }, { value: 'd', label: '30' }];
const TABS: readonly TabDef<string>[] = [{ id: 'one', label: 'Graphics', icon: 'display' }, { id: 'two', label: 'Audio', icon: 'volume', badge: 2 }, { id: 'three', label: 'Controls', icon: 'gamepad' }];
const GLYPH_ACTIONS: readonly ActionId[] = ['interact', 'jump', 'sprint', 'phone', 'quickWheel', 'handbrake', 'boost', 'throttle', 'aim', 'fire', 'uiConfirm', 'uiBack', 'uiTabPrev', 'uiTabNext', 'radioNext', 'pause'];
const EXPRESSIONS: readonly Expression[] = ['neutral', 'happy', 'annoyed', 'surprised', 'smug', 'worried'];

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="lab-section">
      <h2 class="hh-label">{title}</h2>
      <div class="lab-row">{children}</div>
    </section>
  );
}

function Components() {
  const [toggle, setToggle] = useState(true);
  const [slider, setSlider] = useState(70);
  const [step, setStep] = useState(3);
  const [seg, setSeg] = useState('classic');
  const [cyc, setCyc] = useState('a');
  const [tab, setTab] = useState('one');
  const [money, setMoney] = useState(1240);
  return (
    <>
      <Section title="Buttons">
        <Button variant="primary" autofocus icon="play">Start the season</Button>
        <Button variant="secondary" icon="download">Load game</Button>
        <Button variant="ghost" icon="back">Back</Button>
        <Button variant="danger" hold glyph="uiConfirm" icon="trash">Delete</Button>
        <Button variant="primary" loading>Saving</Button>
        <Button variant="secondary" disabled="Unlocks at Rank 4">Locked</Button>
        <Button variant="primary" size="lg" iconRight="chevronRight">Cook it</Button>
        <Button variant="secondary" size="sm" glyph="uiSecondary">More</Button>
      </Section>
      <Section title="Icon buttons and badges">
        <IconButton icon="close" label="Close" />
        <IconButton icon="settings" label="Settings" variant="glass" />
        <IconButton icon="messages" label="Messages" variant="glass" badge={3} />
        <IconButton icon="plus" label="Add" variant="primary" />
        <Badge>3</Badge>
        <Badge tone="lime">New</Badge>
        <Badge tone="gold">★ 2</Badge>
      </Section>
      <Section title="Fields">
        <div class="lab-col">
          <Field label="Motion blur" desc="Speed streaks when driving fast." onActivate={() => setToggle(!toggle)} onAdjust={(d) => setToggle(d > 0)} modified={!toggle}>
            <ToggleView checked={toggle} onChange={setToggle} />
          </Field>
          <Field label="Master volume" desc="Everything." onAdjust={(d) => setSlider(adjustSlider(slider, d, 0, 100, 1))}>
            <SliderView value={slider} min={0} max={100} step={1} onChange={setSlider} format={(v) => `${v}%`} />
          </Field>
          <Field label="Crew size" desc="How many to hire." onAdjust={(d) => setStep(Math.max(0, Math.min(9, step + d)))}>
            <StepperView value={step} min={0} max={9} onChange={setStep} />
          </Field>
          <Field label="Difficulty" desc="Change any time." onAdjust={(d) => setSeg(stepOption(SEG, seg, d, false))}>
            <SegmentedView options={SEG} value={seg} onChange={setSeg} />
          </Field>
          <Field label="Frame rate limit" desc="Cap the frame rate to save power." onAdjust={(d) => setCyc(stepOption(CYC, cyc, d, true))}>
            <CyclerView options={CYC} value={cyc} onChange={setCyc} />
          </Field>
          <Field label="Dynamic resolution" desc="Unlocks at Rank 2" disabled="Unlocks at Rank 2">
            <ToggleView checked={false} onChange={() => undefined} />
          </Field>
        </div>
      </Section>
      <Section title="Tabs">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <Button variant="ghost" size="sm" onPress={() => setTab(cycleTab(TABS, tab, 1))}>Next tab</Button>
      </Section>
      <Section title="Cards and rows">
        <Card onPress={() => undefined} selected><div class="hh-h3">Boardwalk Special</div><div class="hh-small">Giggles · Disco Feet · Sunkissed</div><Stars value={3.5} /></Card>
        <Card><div class="hh-h3">Plain card</div><div class="hh-small">Not interactive.</div></Card>
        <div class="lab-col" style={{ width: '24rem' }}>
          <ListRow icon="handshake" title="Kiki Valdés" subtitle="Regular · loves Disco Feet" trailing={<span class="hh-money">$140</span>} chevron onPress={() => undefined} />
          <ListRow icon="lock" title="Cold Still" subtitle="Unlocks at Rank 4" disabled="Unlocks at Rank 4" onPress={() => undefined} />
        </div>
      </Section>
      <Section title="Chips, meters, money">
        <Chip tone="lime" icon="leaf">Sunkissed</Chip>
        <Chip tone="pink" icon="social">Giggles</Chip>
        <Chip tone="lagoon" icon="mind">Laser Focus</Chip>
        <Chip tone="gold" icon="apex">Golden Hour</Chip>
        <Chip tone="danger" icon="dud">Swamp Funk</Chip>
        <Chip tone="neutral" onPress={() => undefined}>Counter</Chip>
        <div style={{ width: '14rem' }}><Meter value={0.62} label="Visibility" valueLabel="62%" tone="pink" segments={5} /></div>
        <div style={{ width: '14rem' }}><Meter value={0.4} label="Security" valueLabel="40%" tone="lagoon" /></div>
        <RadialProgress value={0.66} size={56}>66%</RadialProgress>
        <Spinner />
        <span class="hh-h2"><MoneyText value={money} popups /></span>
        <Button size="sm" variant="secondary" onPress={() => setMoney((m) => m + 420)}>+ $420</Button>
        <Button size="sm" variant="secondary" onPress={() => setMoney((m) => m - 80)}>− $80</Button>
      </Section>
      <Section title="Empty and locked">
        <div style={{ width: '22rem' }}><EmptyState icon="messages" title="Nobody’s texting yet" body="Hand out a free sample." /></div>
        <div style={{ width: '22rem' }}><LockedState rank={4} detail="Sells to Deco Row" /></div>
      </Section>
      <Section title="Glyphs (live device)">
        {GLYPH_ACTIONS.map((a) => <ActionHint key={a} action={a}>{a}</ActionHint>)}
      </Section>
      <Section title={`Icons (${ICON_NAMES.length})`}>
        <div class="lab-icons">
          {ICON_NAMES.map((n) => <span key={n} title={n}><Icon name={n} size="1.5rem" /></span>)}
        </div>
      </Section>
    </>
  );
}

function Portraits() {
  const base = PLAYER_LOOKS[2]!.base;
  const withHair = (i: number): Appearance => ({ ...base, hair: i, hairColor: (i * 5) % 14, facialHair: 0, glasses: 0 });
  return (
    <>
      <Section title="Player looks">
        {PLAYER_LOOKS.map((l, i) => (
          <figure key={l.name} class="lab-fig"><Portrait appearance={l.base} size="12rem" seed={i * 7 + 3} expression="smug" /><figcaption>{l.name}</figcaption></figure>
        ))}
      </Section>
      <Section title="Expressions">
        {EXPRESSIONS.map((e) => (
          <figure key={e} class="lab-fig"><Portrait appearance={appearanceFromSeed('kiki-valdes')} size="9rem" expression={e} blink={false} /><figcaption>{e}</figcaption></figure>
        ))}
      </Section>
      <Section title="Hair and hats">
        {HAIR_STYLES.map((h, i) => (
          <figure key={h.name} class="lab-fig"><Portrait appearance={withHair(i)} size="6.5rem" framing="head" shape="circle" blink={false} seed={i} /><figcaption>{h.name}</figcaption></figure>
        ))}
      </Section>
      <Section title="Skin tones">
        {SKIN_TONES.map((_, i) => (
          <Portrait key={i} appearance={{ ...base, skin: i }} size="4.5rem" framing="head" shape="circle" blink={false} seed={i + 3} />
        ))}
      </Section>
      <Section title="Street crowd">
        {Array.from({ length: 18 }, (_, i) => (
          <Portrait key={i} appearance={appearanceFromSeed(`crowd-${i}`)} size="6rem" framing="head" shape="rounded" blink={false} />
        ))}
      </Section>
    </>
  );
}

/** Lab-only gallery of every component state and the portrait art. */
export function Showcase({ kind }: { kind: 'components' | 'portraits' }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(ref, { name: 'lab-showcase', onBack: () => ui.toast({ title: 'Back pressed' }) });
  return (
    <div ref={ref} class="lab-showcase hh-interactive">
      <ScrollArea class="lab-scroll">
        <h1 class="hh-title">{kind === 'components' ? 'Components' : 'Portraits'}</h1>
        {kind === 'components' ? <Components /> : <Portraits />}
      </ScrollArea>
    </div>
  );
}
