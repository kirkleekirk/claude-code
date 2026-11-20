import { TooltipLayer } from './components/Modal';
import { UiContext, useUi, type UiEnv } from './core/context';
import { Hud } from './hud/Hud';
import { HintCard } from './overlays/HintCard';
import { QuickWheel } from './overlays/QuickWheel';
import { Toasts } from './overlays/Toasts';
import { Phone } from './phone/Phone';
import { BustedScreen, ConfirmDialog, RankUpCard, ShiftReportCard } from './screens/cards';
import { ClickToStart } from './screens/ClickToStart';
import { Credits } from './screens/Credits';
import { DialogueCard } from './screens/Dialogue';
import { Gallery } from './screens/Gallery';
import { Goodbye } from './screens/Goodbye';
import { Loading } from './screens/Loading';
import { MainMenu } from './screens/MainMenu';
import { NewGame } from './screens/NewGame';
import { PauseMenu } from './screens/Pause';
import { PhotoModePanel } from './screens/PhotoMode';
import { SaveLoad } from './screens/SaveLoad';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { TitleCard } from './screens/TitleCard';
import type { LayerEntry } from './runtime';

function FrontendLayer() {
  const { ui } = useUi();
  const screen = ui.frontend.value;
  return (
    <div class="hh-layer hh-layer-screen">
      {screen === 'clickToStart' && <ClickToStart />}
      {screen === 'loading' && <Loading />}
      {screen === 'mainMenu' && <MainMenu />}
      {screen === 'newGame' && <NewGame />}
      {screen === 'goodbye' && <Goodbye />}
    </div>
  );
}

function Overlay({ entry }: { entry: LayerEntry }) {
  switch (entry.kind) {
    case 'pause':
      return <PauseMenu entry={entry} />;
    case 'settings':
      return <SettingsScreen entry={entry} />;
    case 'saveLoad':
      return <SaveLoad entry={entry} />;
    case 'gallery':
      return <Gallery entry={entry} />;
    case 'credits':
      return <Credits entry={entry} />;
    case 'confirm':
      return <ConfirmDialog entry={entry} />;
    case 'dialogue':
      return <DialogueCard entry={entry} />;
    case 'rankUp':
      return <RankUpCard entry={entry} />;
    case 'shiftReport':
      return <ShiftReportCard entry={entry} />;
    case 'busted':
      return <BustedScreen entry={entry} />;
    case 'titleCard':
      return <TitleCard entry={entry} />;
    case 'photoMode':
      return <PhotoModePanel entry={entry} />;
  }
}

function OverlayLayer() {
  const { ui } = useUi();
  const layers = ui.layers.value;
  return (
    <div class="hh-layer hh-layer-overlay">
      {layers.map((e) => (
        <Overlay key={e.id} entry={e} />
      ))}
    </div>
  );
}

function FeedbackLayer() {
  const { ui, deps } = useUi();
  const showFps = deps.settings.get('gfx.fpsCounter');
  return (
    <div class="hh-layer hh-layer-toast">
      <Toasts />
      <HintCard />
      {showFps && <div class="hh-fps hh-num" aria-hidden="true">{ui.fps.value} FPS</div>}
    </div>
  );
}

export function App({ env }: { env: UiEnv }) {
  return (
    <UiContext.Provider value={env}>
      <div class="hh-layer hh-layer-hud">
        <Hud />
        <QuickWheel />
      </div>
      <div class="hh-layer hh-layer-phone">
        <Phone />
      </div>
      <FrontendLayer />
      <OverlayLayer />
      <FeedbackLayer />
      <TooltipLayer />
    </UiContext.Provider>
  );
}
