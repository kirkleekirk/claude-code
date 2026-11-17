import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { defineStrings, fmt } from '@/core/i18n';
import type { PhoneAppDef, PhoneSearchResult } from '../api';
import { Button, IconButton } from '../components/Button';
import { ActionHint } from '../components/Glyph';
import { ListRow, ScrollArea } from '../components/display';
import { SearchField } from '../components/SearchField';
import { useFocusScope, useSound, useUi } from '../core/context';
import { createTabHost, TabHostContext } from '../core/tabhost';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/names';
import { tc } from '../strings/common';
import { GLOSSARY } from '../strings/menus';

export const tPhone = defineStrings('ui.phone', {
  home: 'Home',
  nextBest: 'Next best move',
  apps: 'Apps',
  results: 'Results',
  goodMorning: 'Good morning',
  goodAfternoon: 'Good afternoon',
  goodEvening: 'Good evening',
  lateNight: 'Up late',
  nothingUrgent: 'Nothing urgent. Go make something beautiful.',
  phone: 'Phone',
});

const EXIT_MS = 220;

function greeting(h: number): string {
  if (h >= 5 && h < 12) return tPhone('goodMorning');
  if (h >= 12 && h < 17) return tPhone('goodAfternoon');
  if (h >= 17 && h < 22) return tPhone('goodEvening');
  return tPhone('lateNight');
}

function StatusBar() {
  const { ui, deps } = useUi();
  const hours = ui.hud.clockHours.value;
  const heat = ui.hud.heat.value;
  return (
    <div class="hh-phone-status" aria-hidden="true">
      <span class="hh-num">{fmt.clock(hours, deps.settings.get('game.clock24'))}</span>
      <span class="hh-spacer" />
      {heat > 0 && <span class={`hh-phone-heat hh-heat-${Math.ceil(heat)}`}><Icon name="flame" /></span>}
      <svg viewBox="0 0 18 12" class="hh-phone-signal"><path d="M1 11h2V8H1zM5 11h2V6H5zM9 11h2V4H9zM13 11h2V1h-2z" fill="currentColor" /></svg>
      <svg viewBox="0 0 26 12" class="hh-phone-battery"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" /><rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" /><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" /></svg>
    </div>
  );
}

function AppTile({ app, onOpen }: { app: PhoneAppDef; onOpen: () => void }) {
  const play = useSound();
  const badge = app.badge?.value ?? 0;
  return (
    <button
      type="button"
      class="hh-app-tile"
      data-focusable=""
      onClick={() => {
        play('open');
        onOpen();
      }}
      style={{ '--app': app.color }}
    >
      <span class="hh-app-icon"><Icon name={app.icon} size="1.6rem" />{badge > 0 && <span class="hh-badge hh-badge-dot">{badge > 99 ? '99+' : badge}</span>}</span>
      <span class="hh-app-name">{app.title}</span>
    </button>
  );
}

function Home() {
  const { ui } = useUi();
  const apps = ui.apps.value;
  const nbaSignal = ui.nba.value;
  const nba = nbaSignal?.value ?? null;
  const [query, setQuery] = useState('');
  const hours = ui.hud.clockHours.value;

  const results = useMemo<PhoneSearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: PhoneSearchResult[] = [];
    for (const a of apps) {
      if (a.title.toLowerCase().includes(q)) out.push({ id: `app-${a.id}`, title: a.title, icon: a.icon, appId: a.id });
      if (a.search) out.push(...a.search(q));
    }
    for (const g of GLOSSARY) {
      if (g.term.toLowerCase().includes(q) || g.body.toLowerCase().includes(q)) {
        out.push({ id: `help-${g.term}`, title: g.term, detail: g.body, icon: g.icon as IconName, appId: 'help', params: { term: g.term } });
      }
    }
    return out.slice(0, 24);
  }, [query, apps]);

  return (
    <ScrollArea class="hh-phone-home">
      <div class="hh-phone-greeting">
        <span class="hh-label">{greeting(hours)}</span>
      </div>
      <SearchField value={query} onInput={setQuery} />
      {query.trim() ? (
        <div class="hh-phone-results">
          <div class="hh-label">{tPhone('results')}</div>
          {results.length === 0 && <p class="hh-small">{tc('noResults', { query })}</p>}
          {results.map((r) => (
            <ListRow key={r.id} icon={r.icon} title={r.title} subtitle={r.detail} chevron onPress={() => ui.navigatePhone(r.appId, r.params ?? {})} />
          ))}
        </div>
      ) : (
        <>
          <div class="hh-nba hh-card">
            <div class="hh-label">{tPhone('nextBest')}</div>
            {nba ? (
              <div class="hh-nba-body">
                <span class="hh-nba-icon"><Icon name={nba.icon} /></span>
                <span class="hh-nba-text">
                  <span class="hh-nba-title">{nba.title}</span>
                  {nba.detail && <span class="hh-nba-detail">{nba.detail}</span>}
                </span>
                {nba.run && (
                  <Button variant="primary" size="sm" autofocus onPress={() => nba.run?.()}>{nba.cta ?? tc('continue')}</Button>
                )}
              </div>
            ) : (
              <p class="hh-small">{tPhone('nothingUrgent')}</p>
            )}
          </div>
          <div class="hh-app-grid">
            {apps.map((a) => <AppTile key={a.id} app={a} onOpen={() => ui.navigatePhone(a.id)} />)}
          </div>
        </>
      )}
    </ScrollArea>
  );
}

function PhoneScreen({ closing }: { closing: boolean }) {
  const { ui } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const route = ui.phoneRoute.value;
  const apps = ui.apps.value;
  const app = route.app === 'home' ? null : apps.find((a) => a.id === route.app) ?? null;
  const navApps = apps.filter((a) => a.nav).slice(0, 4);
  const host = useMemo(() => createTabHost(), []);
  const landscape = app?.layout === 'landscape';

  useFocusScope(ref, {
    name: 'phone',
    context: 'phone',
    onBack: () => ui.phoneBack(),
    onTab: (d) => {
      if (host.current) {
        host.current(d);
        return;
      }
      const ids = ['home', ...navApps.map((a) => a.id)];
      const i = Math.max(0, ids.indexOf(route.app));
      ui.navigatePhone(ids[(i + d + ids.length) % ids.length]!);
    },
  }, !closing);

  const AppComponent = app?.component;
  return (
    <div class={`hh-phone${landscape ? ' is-landscape' : ''}${closing ? ' is-closing' : ''}`}>
      <div ref={ref} class="hh-phone-device hh-interactive" role="dialog" aria-label={app?.title ?? tPhone('phone')}>
        <div class="hh-phone-crack" aria-hidden="true">
          <svg viewBox="0 0 120 90"><path d="M120 6L92 22l-9 17-18 6-11 19M92 22l14 19 3 22M83 39l-21-9-17 4M65 45l4 23" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1" /><path d="M120 6L92 22l-9 17" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3.5" /></svg>
        </div>
        <div class="hh-phone-screen">
          <StatusBar />
          <header class="hh-phone-head">
            {app ? (
              <IconButton icon="back" label={tc('back')} size="sm" sound="back" onPress={() => ui.phoneBack()} />
            ) : (
              <span class="hh-phone-head-icon"><Icon name="home" /></span>
            )}
            <h1 class="hh-phone-title">{app?.title ?? tPhone('home')}</h1>
            <IconButton icon="close" label={tc('close')} size="sm" sound={null} onPress={() => ui.closePhone()} />
          </header>
          <div class="hh-phone-body" key={`${route.app}`}>
            <TabHostContext.Provider value={host}>
              {AppComponent ? (
                <AppComponent
                  params={route.params}
                  open={(id, params) => ui.navigatePhone(id, params ?? {})}
                  back={() => ui.phoneBack()}
                  close={() => ui.closePhone()}
                />
              ) : (
                <Home />
              )}
            </TabHostContext.Provider>
          </div>
          <nav class="hh-phone-nav">
            {[{ id: 'home', title: tPhone('home'), icon: 'home' as IconName, badge: undefined }, ...navApps].map((a) => {
              const badge = 'badge' in a && a.badge ? a.badge.value : 0;
              const on = route.app === a.id;
              return (
                <button key={a.id} type="button" class={`hh-phone-navbtn${on ? ' is-on' : ''}`} tabIndex={-1} aria-current={on ? 'page' : undefined} onClick={() => ui.navigatePhone(a.id)}>
                  <Icon name={a.icon} />
                  <span>{a.title}</span>
                  {badge > 0 && <span class="hh-badge hh-badge-dot">{badge}</span>}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      <div class="hh-phone-hints" aria-hidden="true">
        <ActionHint action="uiTabPrev" size="sm">{tc('tabsHint')}</ActionHint>
        <ActionHint action="uiBack" size="sm">{tc('back')}</ActionHint>
      </div>
    </div>
  );
}

/** Mounted while open, plus a short exit animation. */
export function Phone() {
  const { ui } = useUi();
  const open = ui.phoneOpen.value;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return <PhoneScreen closing={!open} />;
}
