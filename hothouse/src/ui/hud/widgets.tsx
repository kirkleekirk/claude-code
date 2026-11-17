import { useEffect, useRef, useState } from 'preact/hooks';
import { fmt } from '@/core/i18n';
import { HoldRing } from '../components/Button';
import { Glyph } from '../components/Glyph';
import { MoneyText } from '../components/MoneyText';
import { useTick, useUi } from '../core/context';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tHud } from '../strings/hud';
import type { WeatherIcon } from './model';

const WEATHER: Record<WeatherIcon, IconName> = {
  clear: 'sun', clearNight: 'moon', hazy: 'haze', overcast: 'cloud', rain: 'rain', storm: 'storm', hurricane: 'hurricane',
};

/** Seconds since `value` last changed (drives self-decluttering). */
function useSince(value: unknown): number {
  const [since, setSince] = useState(0);
  const t = useRef(0);
  useEffect(() => {
    t.current = 0;
    setSince(0);
  }, [value]);
  useTick((dt) => {
    const before = t.current;
    t.current += dt;
    // Re-render only when crossing the thresholds the widgets use.
    for (const mark of [2, 4, 6, 8]) {
      if (before < mark && t.current >= mark) setSince(t.current);
    }
  });
  return since;
}

export function ClockCash() {
  const { ui, deps } = useUi();
  const hud = ui.hud;
  const hours = hud.clockHours.value;
  const weather = hud.weather.value;
  const cash = hud.cash.value;
  const clean = hud.cleanCash.value;
  const cleanSince = useSince(clean);
  const cashSince = useSince(cash);
  const h24 = deps.settings.get('game.clock24');
  return (
    <div class="hh-hud-cash">
      <div class="hh-hud-clock hh-chip-glass">
        <Icon name={WEATHER[weather]} label={tHud(`weather.${weather}`)} />
        <span class="hh-num">{fmt.clock(hours, h24)}</span>
      </div>
      <div class={`hh-hud-money${cashSince > 6 ? ' is-idle' : ''}`}>
        <MoneyText value={cash} popups class="hh-money hh-hud-dirty" />
      </div>
      <div class={`hh-hud-clean${cleanSince < 4 ? ' is-shown' : ''}`}>
        {tHud('clean', { amount: fmt.money(clean) })}
      </div>
    </div>
  );
}

/** The half-sunburst heat dial: five rays that light teal → gold → orange → red, siren at five. */
export function HeatGauge() {
  const { ui } = useUi();
  const heat = Math.max(0, Math.min(5, ui.hud.heat.value));
  const searching = ui.hud.heatSearching.value;
  const level = Math.ceil(heat - 0.001);
  const [shown, setShown] = useState(heat > 0);
  useEffect(() => {
    if (heat > 0) setShown(true);
    else {
      const t = setTimeout(() => setShown(false), 1600);
      return () => clearTimeout(t);
    }
  }, [heat > 0]);
  if (!shown) return null;
  const rays = [0, 1, 2, 3, 4];
  return (
    <div class={`hh-heat hh-heat-${level}${searching ? ' is-searching' : ''}${heat === 0 ? ' is-cooling' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.round(heat * 10) / 10} aria-label={tHud('heat', { n: level })}>
      <svg viewBox="0 0 120 66" class="hh-heat-dial" aria-hidden="true">
        <path d="M14 62a46 46 0 0 1 92 0" fill="none" stroke="rgba(255,244,227,.18)" stroke-width="3" stroke-linecap="round" />
        {rays.map((i) => {
          const a = Math.PI * (1 - (i + 0.5) / 5);
          const fill = Math.max(0, Math.min(1, heat - i));
          const r0 = 22;
          const r1 = 40 + i * 3.5;
          const w = 0.17;
          const p = (r: number, aa: number) => `${(60 + Math.cos(aa) * r).toFixed(2)} ${(62 - Math.sin(aa) * r).toFixed(2)}`;
          const d = `M${p(r0, a - w * 0.55)}L${p(r1, a - w * 0.28)}L${p(r1 + 3, a)}L${p(r1, a + w * 0.28)}L${p(r0, a + w * 0.55)}Z`;
          return (
            <g key={i}>
              <path d={d} class="hh-heat-ray-bg" />
              <path d={d} class={`hh-heat-ray hh-heat-ray-${i + 1}`} style={{ opacity: fill > 0 ? 0.35 + fill * 0.65 : 0 }} />
              {/* Shape cue for colour-blind players: notches count the level. */}
              {fill >= 1 && <circle cx={60 + Math.cos(a) * (r0 - 7)} cy={62 - Math.sin(a) * (r0 - 7)} r="2.2" class="hh-heat-notch" />}
            </g>
          );
        })}
        <circle cx="60" cy="62" r="12" class="hh-heat-core" />
      </svg>
      <div class="hh-heat-text">
        <span class="hh-heat-level">{tHud('heat', { n: level })}</span>
        <span class="hh-heat-desc">{searching ? tHud('searching') : level > 0 ? tHud(`heat.${level}` as 'heat.1') : ''}</span>
      </div>
    </div>
  );
}

export function ObjectiveBanner() {
  const { ui, deps } = useUi();
  const obj = ui.hud.objective.value;
  const since = useSince(obj?.text);
  if (!obj) return null;
  const compact = since > 8;
  const imperial = deps.settings.get('game.units') === 'mph';
  return (
    <div class={`hh-objective hh-chip-glass${compact ? ' is-compact' : ''}`} role="status">
      <span class="hh-objective-icon"><Icon name={obj.icon} /></span>
      <span class="hh-objective-text">{obj.text}</span>
      {obj.distance !== undefined && obj.distance !== null && <span class="hh-objective-dist hh-num">{fmt.distance(obj.distance, imperial)}</span>}
    </div>
  );
}

export function PromptBar() {
  const { ui } = useUi();
  const p = ui.hud.prompt.value;
  if (!p) return null;
  const holding = p.hold !== undefined && p.hold > 0;
  return (
    <div class={`hh-prompt${p.blocked ? ' is-blocked' : ''}`} key={`${p.action}-${p.verb}-${p.object ?? ''}`}>
      <span class="hh-prompt-glyph">
        {(p.holdable || holding) && <HoldRing progress={p.hold ?? 0} size={44} />}
        <Glyph action={p.action} />
      </span>
      <span class="hh-prompt-text">
        <span class="hh-prompt-verb">{p.blocked ?? p.verb}</span>
        {!p.blocked && p.object && <span class="hh-prompt-object">{p.object}</span>}
      </span>
    </div>
  );
}

export function BagStrip() {
  const { ui } = useUi();
  const bag = ui.hud.bag.value;
  if (bag.length === 0) return null;
  return (
    <div class="hh-bag hh-chip-glass" aria-label={tHud('goBag')}>
      <Icon name="bag" class="hh-bag-icon" />
      {bag.slice(0, 5).map((b) => (
        <span key={b.id} class="hh-bag-item" title={b.label}>
          <i style={{ background: b.color }} />
          <span class="hh-num">{b.count}</span>
        </span>
      ))}
    </div>
  );
}

export function VehicleCluster() {
  const { ui, deps } = useUi();
  const v = ui.hud.vehicle.value;
  if (!v) return null;
  const imperial = deps.settings.get('game.units') === 'mph';
  const speed = fmt.speed(v.speed, imperial);
  return (
    <div class={`hh-vehicle${v.boosting ? ' is-boosting' : ''}${v.boostReady ? ' is-ready' : ''}`}>
      <div class="hh-speed">
        <span class="hh-speed-value hh-num">{speed}</span>
        <span class="hh-speed-unit">{imperial ? tHud('mph') : tHud('kmh')}</span>
      </div>
      <div class="hh-flow">
        <div class="hh-flow-head">
          <Icon name="flow" />
          <span>{v.boosting ? tHud('boost') : v.boostReady ? tHud('boostReady') : tHud('flow')}</span>
          {v.boostReady && <Glyph action="boost" size="sm" />}
        </div>
        <div class="hh-flow-track">
          <div class="hh-flow-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, v.flow)) * 1000) / 10}%` }} />
          <div class="hh-flow-ticks" aria-hidden="true"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

export function NowPlayingCard() {
  const { ui } = useUi();
  const np = ui.nowPlaying.value;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!np) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, [np?.id]);
  if (!np || !visible) return null;
  const info = np.info;
  return (
    <div class={`hh-nowplaying hh-chip-glass hh-station-${info.station}`} role="status" key={np.id}>
      <span class="hh-nowplaying-disc"><Icon name="radio" /></span>
      <span class="hh-nowplaying-text">
        <span class="hh-nowplaying-label">{info.isAd ? tHud('onAir') : tHud('nowPlaying')}</span>
        {info.isAd && info.caption ? (
          <span class="hh-nowplaying-title">{info.caption}</span>
        ) : (
          <>
            <span class="hh-nowplaying-title">{info.title}</span>
            <span class="hh-nowplaying-artist">{info.artist}</span>
          </>
        )}
      </span>
    </div>
  );
}

export function Minimap() {
  const { ui } = useUi();
  const source = ui.minimap.value;
  const canvas = useRef<HTMLCanvasElement>(null);
  useTick(() => {
    const c = canvas.current;
    const src = ui.minimap.peek();
    if (!c || !src) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    src.draw(ctx, w, h, dpr);
  }, !!source);
  if (!source) return null;
  return (
    <div class="hh-minimap">
      <canvas ref={canvas} class="hh-minimap-canvas" aria-hidden="true" />
      <span class="hh-minimap-north" aria-hidden="true">{tHud('north')}</span>
    </div>
  );
}

export function AreaBanner() {
  const { ui } = useUi();
  const area = ui.hud.area.value;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!area) return;
    setShown(area);
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [area]);
  if (!shown) return null;
  return (
    <div class="hh-area" key={shown} role="status">
      <span class="hh-area-text hh-title-italic">{shown}</span>
    </div>
  );
}

export function Callout() {
  const { ui } = useUi();
  const c = ui.hud.callout.value;
  const [id, setId] = useState(0);
  useEffect(() => {
    if (!c) return;
    setId(c.id);
    const t = setTimeout(() => setId(0), 1500);
    return () => clearTimeout(t);
  }, [c?.id]);
  if (!c || id !== c.id) return null;
  return <div class={`hh-callout hh-callout-${c.tone}`} key={c.id}>{c.text}</div>;
}
