import { useUi } from '../core/context';
import { LoadingView } from './ClickToStart';

export function Loading() {
  const { ui } = useUi();
  const { progress, label } = ui.loading.value;
  return <LoadingView progress={progress} label={label} />;
}
