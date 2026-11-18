import { useUi } from '../core/context';
import { AreaBanner, BagStrip, Callout, ClockCash, HeatGauge, Minimap, NowPlayingCard, ObjectiveBanner, PromptBar, VehicleCluster } from './widgets';

/**
 * The in-play HUD. Corners scale from their own corner (HUD size setting) so nothing drifts
 * toward the centre; everything fades with the HUD opacity setting; Clean Mode hides it all.
 */
export function Hud() {
  const { ui } = useUi();
  const hud = ui.hud;
  const visible = hud.visible.value && !hud.clean.value && ui.frontend.value === 'none';
  const covered = ui.layers.value.some((l) => l.kind !== 'dialogue' && l.kind !== 'photoMode');
  const phone = ui.phoneOpen.value;
  if (!visible) return null;
  return (
    <div class={`hh-hud${covered ? ' is-covered' : ''}${phone ? ' is-phone' : ''}`}>
      <div class="hh-hud-corner hh-hud-tl">
        <ObjectiveBanner />
      </div>
      <div class="hh-hud-corner hh-hud-tr">
        <ClockCash />
        <HeatGauge />
      </div>
      <div class="hh-hud-corner hh-hud-bl">
        <Minimap />
        <BagStrip />
      </div>
      <div class="hh-hud-corner hh-hud-br">
        <NowPlayingCard />
        <VehicleCluster />
      </div>
      <div class="hh-hud-top">
        <AreaBanner />
      </div>
      <div class="hh-hud-center">
        <Callout />
      </div>
      <div class="hh-hud-bottom">
        <PromptBar />
      </div>
    </div>
  );
}
