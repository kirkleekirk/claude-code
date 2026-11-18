import { signal, type Signal } from '@preact/signals-core';
import { appearanceFromSeed } from '@/content/appearance';
import type { Input } from '@/input';
import type { SaveManager, SettingCategory } from '@/save';
import type { PhotoStore } from '@/save/photos';
import type { PhoneAppProps } from '../api';
import { ListRow, ScrollArea } from '../components/display';
import { Portrait } from '../portrait/Portrait';
import type { UiRuntime } from '../runtime';
import { createLabPhotoControls, labMinimap, seedPhotos, seedSaves } from './mocks';

/** Every screen and state the lab can open, for QA and screenshots. */
export const SCREENS = [
  'clickToStart', 'clickToStart-ready', 'loading', 'mainMenu', 'mainMenu-empty', 'newGame', 'titleCard', 'goodbye',
  'pause', 'settings-graphics', 'settings-audio', 'settings-controls', 'settings-gameplay', 'settings-accessibility',
  'saveLoad-save', 'saveLoad-load', 'gallery', 'gallery-empty', 'credits', 'confirm', 'confirm-danger',
  'rankUp', 'shiftReport', 'busted', 'wasted', 'dialogue', 'dialogue-choices', 'subtitles',
  'hud', 'hud-vehicle', 'hud-hint', 'toasts', 'quickWheel',
  'phone', 'phone-settings', 'phone-help', 'phone-photos', 'phone-messages', 'phone-map',
  'photoMode', 'photoMode-camera', 'components', 'portraits',
] as const;

export type ScreenId = (typeof SCREENS)[number];

export interface LabContext {
  ui: UiRuntime;
  input: Input;
  saves: SaveManager;
  photos: PhotoStore;
  showcase: Signal<'components' | 'portraits' | null>;
}

const KIKI = appearanceFromSeed('kiki-valdes');
const VALE = appearanceFromSeed('don-ignacio-vale');

function MessagesApp({ open }: PhoneAppProps) {
  const threads = [
    { name: 'Kiki Valdés', text: 'skate party tonight!! bring the good stuff 🛼', a: KIKI, unread: true },
    { name: 'I. Vale', text: 'We should talk about your grandmother’s debt.', a: VALE, unread: true },
    { name: 'Mama Yoli', text: 'Your additives came in. Also eat something.', a: appearanceFromSeed('mama-yoli'), unread: false },
  ];
  return (
    <ScrollArea>
      {threads.map((t, i) => (
        <ListRow
          key={t.name}
          leading={<Portrait appearance={t.a} framing="head" shape="circle" size="2.75rem" blink={false} />}
          title={t.name}
          subtitle={t.text}
          autofocus={i === 0}
          trailing={t.unread ? <span class="hh-badge">1</span> : undefined}
          onPress={() => open('help')}
        />
      ))}
    </ScrollArea>
  );
}

function MapApp() {
  return (
    <div style={{ flex: 1, borderRadius: '18px', overflow: 'hidden', margin: '0 0 0.75rem', position: 'relative', background: '#123A5C' }}>
      <canvas
        ref={(c) => {
          if (!c) return;
          const r = c.getBoundingClientRect();
          c.width = Math.max(1, Math.round(r.width));
          c.height = Math.max(1, Math.round(r.height));
          const ctx = c.getContext('2d');
          if (ctx) labMinimap.draw(ctx, c.width, c.height, 1);
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

let appsRegistered = false;
const unread = signal(2);

function registerMockApps(ui: UiRuntime): void {
  if (appsRegistered) return;
  appsRegistered = true;
  ui.registerPhoneApp({ id: 'messages', title: 'Messages', icon: 'messages', color: '#17E0C8', order: 10, nav: true, badge: unread, component: MessagesApp });
  ui.registerPhoneApp({ id: 'map', title: 'Map', icon: 'map', color: '#FFD166', order: 20, nav: true, layout: 'landscape', component: MapApp });
  ui.registerPhoneApp({ id: 'empire', title: 'Empire', icon: 'crown', color: '#B8F54A', order: 30, nav: true, component: MessagesApp });
  ui.registerPhoneApp({ id: 'products', title: 'Products', icon: 'jar', color: '#FF3D8B', order: 40, nav: true, component: MessagesApp });
  ui.setNextBestAction(signal({ icon: 'route', title: 'Meet Kiki at the Boardwalk', detail: '6:52 PM · 0.8 mi', cta: 'Set route', run: () => ui.closePhone() }));
}

function reset(c: LabContext): void {
  const { ui, input } = c;
  ui.closeAll();
  ui.showFrontend('none');
  const hud = ui.hud;
  hud.visible.value = false;
  hud.objective.value = null;
  hud.prompt.value = null;
  hud.vehicle.value = null;
  hud.heat.value = 0;
  hud.heatSearching.value = false;
  hud.bag.value = [];
  hud.area.value = null;
  hud.callout.value = null;
  ui.setMinimap(null);
  ui.wheelOpen.value = false;
  ui.toasts.value = [];
  ui.currentHint.value = null;
  ui.nowPlaying.value = null;
  c.showcase.value = null;
  input.setBaseContext('none');
}

function playing(c: LabContext): void {
  const hud = c.ui.hud;
  hud.visible.value = true;
  hud.clockHours.value = 18 + 40 / 60;
  hud.weather.value = 'clear';
  hud.cash.value = 1240;
  hud.cleanCash.value = 380;
  c.input.setBaseContext('foot');
}

export async function openScreen(c: LabContext, id: ScreenId): Promise<void> {
  const { ui } = c;
  reset(c);
  registerMockApps(ui);
  switch (id) {
    case 'clickToStart':
      ui.started.value = false;
      ui.setLoading(0.42, 'Paving the Causeway');
      ui.showFrontend('clickToStart');
      break;
    case 'clickToStart-ready':
      ui.started.value = false;
      ui.setLoading(1, 'Ready');
      ui.showFrontend('clickToStart');
      break;
    case 'loading':
      ui.setLoading(0.67, 'Planting palms');
      ui.showFrontend('loading');
      break;
    case 'mainMenu':
      await seedSaves(c.saves, 3);
      ui.showFrontend('mainMenu');
      break;
    case 'mainMenu-empty':
      for (const s of ['auto', 1, 2, 3] as const) c.saves.remove(s);
      ui.showFrontend('mainMenu');
      break;
    case 'newGame':
      ui.showFrontend('newGame');
      break;
    case 'titleCard':
      void ui.titleCard({ title: 'Halcyon Bay', subtitle: '6:40 PM', duration: 60 });
      break;
    case 'goodbye':
      ui.showFrontend('goodbye');
      break;
    case 'pause':
      playing(c);
      ui.openPause();
      break;
    case 'settings-graphics':
    case 'settings-audio':
    case 'settings-controls':
    case 'settings-gameplay':
    case 'settings-accessibility':
      ui.openSettings(id.slice(9) as SettingCategory);
      break;
    case 'saveLoad-save':
    case 'saveLoad-load':
      await seedSaves(c.saves, 3);
      ui.openSaveLoad(id === 'saveLoad-save' ? 'save' : 'load');
      break;
    case 'gallery':
      if ((await c.photos.list()).length === 0) await seedPhotos(c.photos, 7);
      ui.openGallery();
      break;
    case 'gallery-empty':
      for (const p of await c.photos.list()) await c.photos.remove(p.id);
      ui.openGallery();
      break;
    case 'credits':
      ui.openCredits();
      break;
    case 'confirm':
      void ui.confirm({ title: 'Head back to the main menu?', body: 'Anything since your last save stays behind. The autosave has you covered up to 6:12 PM.', confirm: 'Quit to menu', cancel: 'Stay' });
      break;
    case 'confirm-danger':
      void ui.confirm({ title: 'Delete · Slot 1', body: 'This can’t be undone.', confirm: 'Delete', danger: true });
      break;
    case 'rankUp':
      playing(c);
      void ui.rankUp({
        rank: 2, title: 'Greenthumb',
        unlocks: [
          { icon: 'drop', title: 'Drip irrigation', detail: 'Never refill again. Plants water themselves.' },
          { icon: 'cart', title: 'Market app', detail: 'Order seeds and additives to your Drop Box.' },
          { icon: 'seedling', title: 'Gatorgrass Gold', detail: 'A hardy second strain with a mellow tide.' },
        ],
        note: 'Water twice, worry never. You did both. — O.',
      });
      break;
    case 'shiftReport':
      playing(c);
      void ui.shiftReport({
        title: 'Overnight', span: '11:40 PM → 7:10 AM', earnings: 3240, deals: 14, closeCalls: 1,
        lines: [
          { icon: 'dealer', text: 'Pilar’s turf moved 9 bags of Boardwalk Special', amount: 2160 },
          { icon: 'grower', text: 'The greenhouse finished two cycles' },
          { icon: 'siren', text: 'A patrol slowed down outside the shop. Nobody panicked.' },
          { icon: 'cash', text: 'Crew wages', amount: -420 },
        ],
      });
      break;
    case 'busted':
    case 'wasted':
      playing(c);
      void ui.busted({
        kind: id === 'busted' ? 'busted' : 'wasted',
        costs: [{ label: 'Legal fees', amount: 640 }, { label: 'Confiscated from your Go-Bag', amount: 380 }],
        quip: id === 'busted' ? 'Relax. I’ve gotten people out of worse. One guy was holding a live alligator.' : 'You look great for someone who just did that.',
        respawn: id === 'busted' ? 'Outside Pinkerton Law' : 'Halcyon General, Crown Point',
      });
      break;
    case 'dialogue':
    case 'dialogue-choices':
      playing(c);
      void ui.dialogue({
        lines: id === 'dialogue'
          ? [
              { speaker: 'Kiki Valdés', appearance: KIKI, expression: 'happy', text: 'You came! Okay, so the skate party is at nine and everybody is going to ask me where I got it.' },
              { speaker: 'Kiki Valdés', appearance: KIKI, expression: 'smug', text: 'Make it something that makes people want to dance. Badly.' },
            ]
          : [{ speaker: 'Don Ignacio Vale', appearance: VALE, expression: 'smug', text: 'Your grandmother paid on time for twenty years. Will you?', choices: ['I’ll pay early', 'Give me a month', 'Who’s asking?'] }],
      });
      break;
    case 'subtitles':
      playing(c);
      void ui.dialogue({ blocking: false, lines: [{ speaker: 'Radio', text: 'Busted? Don’t panic. Call Sy Pinkerton. Operators are standing by, mostly.' }] });
      break;
    case 'hud':
      playing(c);
      ui.hud.objective.value = { icon: 'pin', text: 'Meet Kiki at the Boardwalk', distance: 1280 };
      ui.hud.prompt.value = { action: 'interact', verb: 'Harvest', object: 'Abuela’s Blush', holdable: true, hold: 0.35 };
      ui.hud.heat.value = 2;
      ui.hud.bag.value = [
        { id: 'a', label: 'Abuela’s Blush', count: 4, color: '#FF7AAE' },
        { id: 'b', label: 'Boardwalk Special', count: 2, color: '#B8F54A' },
      ];
      ui.setMinimap(labMinimap);
      ui.hud.area.value = 'Palmetto Flats';
      break;
    case 'hud-vehicle':
      playing(c);
      ui.hud.weather.value = 'rain';
      ui.hud.clockHours.value = 21.5;
      ui.hud.objective.value = { icon: 'route', text: 'Lose the cops', distance: null };
      ui.hud.vehicle.value = { speed: 31.3, flow: 0.78, boosting: false, boostReady: true };
      ui.hud.heat.value = 5;
      ui.setMinimap(labMinimap);
      ui.showNowPlaying({ station: 'sunset', title: 'Neon on Wet Asphalt', artist: 'The Velvet Manatees', isAd: false, caption: null });
      ui.hud.callout.value = { text: 'Near miss!', tone: 'flow', id: 1 };
      c.input.setBaseContext('vehicle');
      break;
    case 'hud-hint':
      playing(c);
      ui.hud.prompt.value = { action: 'interact', verb: 'Tend', object: 'the greenhouse row', holdable: true };
      ui.replayHint({ id: 'lab-tend', text: 'Hold it and walk the row. Plants love a drive-by.', action: 'interact' });
      break;
    case 'toasts':
      playing(c);
      ui.toast({ kind: 'event', icon: 'calendar', title: 'Beach party surge tonight', body: 'The Strand wants Party effects after 8 PM.' });
      ui.toast({ kind: 'message', title: 'Kiki Valdés', body: 'skate party tonight!! bring the good stuff', portrait: KIKI });
      ui.toast({ kind: 'money', title: 'Sold to Kiki', deltas: [{ label: '', value: 420, format: 'money' }, { label: 'Heat', value: 1, format: 'int' }] });
      break;
    case 'quickWheel':
      playing(c);
      ui.setQuickWheel([
        { id: 'car', label: 'Call car', icon: 'car', run: () => undefined },
        { id: 'radio', label: 'Radio', icon: 'radio', run: () => undefined },
        { id: 'bag', label: 'Go-Bag', icon: 'bag', run: () => undefined },
        { id: 'wait', label: 'Wait', icon: 'hourglass', run: () => undefined },
        { id: 'photo', label: 'Photo', icon: 'camera', run: () => undefined },
        { id: 'map', label: 'Map', icon: 'map', disabledReason: 'Not during a chase', run: () => undefined },
      ]);
      ui.wheelOpen.value = true;
      ui.wheelSelected.value = 1;
      break;
    case 'phone':
    case 'phone-settings':
    case 'phone-help':
    case 'phone-photos':
    case 'phone-messages':
    case 'phone-map': {
      playing(c);
      if (id === 'phone-photos' && (await c.photos.list()).length === 0) await seedPhotos(c.photos, 5);
      ui.phoneRoute.value = { app: 'home', params: {} };
      ui.openPhone();
      if (id !== 'phone') ui.navigatePhone(id.slice(6));
      break;
    }
    case 'photoMode':
    case 'photoMode-camera': {
      playing(c);
      const controls = createLabPhotoControls(() => ui.closePhotoMode());
      if (id === 'photoMode-camera') controls.setMode('camera');
      ui.openPhotoMode(controls);
      if (id === 'photoMode-camera') c.input.setBaseContext('photo');
      break;
    }
    case 'components':
    case 'portraits':
      c.showcase.value = id;
      break;
  }
}

