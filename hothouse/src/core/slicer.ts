/**
 * Cooperative scheduling for loading. Long jobs call `await slicer.breathe()` inside their loops;
 * when the current slice has used its budget the call yields to the browser so the loading screen
 * keeps animating and the tab never freezes.
 */

type YieldFn = () => Promise<void>;

function makeYield(): YieldFn {
  const g = globalThis as { scheduler?: { yield?: () => Promise<void> } };
  if (g.scheduler?.yield) return () => g.scheduler!.yield!();
  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    const queue: Array<() => void> = [];
    channel.port1.onmessage = () => queue.shift()?.();
    return () =>
      new Promise<void>((resolve) => {
        queue.push(resolve);
        channel.port2.postMessage(0);
      });
  }
  return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const yieldToBrowser = makeYield();
const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export class TimeSlicer {
  private sliceStart = now();
  /** Count of yields, for diagnostics. */
  yields = 0;

  constructor(public budgetMs = 10) {}

  /** Yields if the current slice is over budget. Cheap to call often. */
  async breathe(): Promise<void> {
    if (now() - this.sliceStart < this.budgetMs) return;
    await this.yield();
  }

  /** Always yields once. */
  async yield(): Promise<void> {
    this.yields++;
    await yieldToBrowser();
    this.sliceStart = now();
  }
}

/**
 * Weighted multi-stage progress. Each stage reports 0–1; the tracker maps it into the overall bar.
 */
export class Progress {
  private readonly stages: Array<{ id: string; label: string; weight: number; value: number }> = [];
  private total = 0;
  private current = 0;

  constructor(private readonly onChange: (fraction: number, label: string) => void) {}

  stage(id: string, label: string, weight: number): void {
    this.stages.push({ id, label, weight, value: 0 });
    this.total += weight;
  }

  /** Begin (or continue) a stage and report progress within it. */
  report(id: string, value: number): void {
    const i = this.stages.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.current = i;
    this.stages[i]!.value = Math.min(1, Math.max(0, value));
    for (let j = 0; j < i; j++) this.stages[j]!.value = 1;
    this.emit();
  }

  complete(): void {
    for (const s of this.stages) s.value = 1;
    this.emit();
  }

  fraction(): number {
    if (this.total <= 0) return 0;
    let sum = 0;
    for (const s of this.stages) sum += s.weight * s.value;
    return sum / this.total;
  }

  private emit(): void {
    this.onChange(this.fraction(), this.stages[this.current]?.label ?? '');
  }
}
