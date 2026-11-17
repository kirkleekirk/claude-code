import { useRef } from 'preact/hooks';
import { Button } from '../components/Button';
import { useFocusScope, useUi } from '../core/context';
import { tMenu } from '../strings/menus';
import { Wordmark } from './ClickToStart';
import { SunsetArt } from './SunsetArt';

/** Browsers cannot close themselves; this is the polite ending instead. */
export function Goodbye() {
  const { deps } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(ref, { name: 'goodbye' });
  return (
    <div ref={ref} class="hh-screen hh-goodbye hh-interactive">
      <SunsetArt dim={0.35} />
      <div class="hh-goodbye-card hh-glass hh-enter">
        <Wordmark size="md" />
        <h1 class="hh-title">{tMenu('goodbyeTitle')}</h1>
        <p class="hh-body">{tMenu('goodbyeBody')}</p>
        <Button variant="primary" size="lg" autofocus icon="back" onPress={() => deps.actions.quitToMenu()}>
          {tMenu('goodbyeBack')}
        </Button>
      </div>
    </div>
  );
}
