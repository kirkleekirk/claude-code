/**
 * Count-up animation for changing numbers (cash, XP, stats). Pure and frame-driven so it can be
 * unit-tested; components call `step(dt)` from the UI ticker and render `display`.
 */

/** Duration grows gently with the size of the change and is capped so it never drags. */
export function countDuration(delta: number): number {
  const mag = Math.abs(delta);
  if (mag === 0) return 0;
  return Math.min(0.9, 0.22 + 0.13 * Math.log10(mag + 1));
}

/** Ease-out with a quick start: numbers jump toward the target then settle. */
export function easeOutQuart(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u * u;
}

export class CountUp {
  /** Value currently shown (rounded to whole units). */
  display: number;
  private from: number;
  private target: number;
  private t = 1;
  private duration = 0;

  constructor(initial: number, private readonly instant = false) {
    this.display = Math.round(initial);
    this.from = initial;
    this.target = initial;
  }

  get value(): number {
    return this.target;
  }

  get animating(): boolean {
    return this.t < 1;
  }

  /** Retarget. Starts from what is currently shown so mid-animation changes stay smooth. */
  set(target: number, instant = this.instant): void {
    if (target === this.target && this.t >= 1) return;
    this.from = this.display;
    this.target = target;
    this.duration = instant ? 0 : countDuration(target - this.from);
    this.t = this.duration > 0 ? 0 : 1;
    if (this.t >= 1) this.display = Math.round(target);
  }

  /** Advance by `dt` seconds; returns true while the shown value changed this step. */
  step(dt: number): boolean {
    if (this.t >= 1) return false;
    this.t = this.duration > 0 ? Math.min(1, this.t + dt / this.duration) : 1;
    const next = Math.round(this.from + (this.target - this.from) * easeOutQuart(this.t));
    const changed = next !== this.display;
    this.display = this.t >= 1 ? Math.round(this.target) : next;
    return changed || this.t >= 1;
  }
}

/** "+$420" / "−$80" / "+12". The minus is a true minus sign. */
export function formatDelta(value: number, format: (abs: number) => string): string {
  if (value === 0) return format(0);
  return `${value < 0 ? '−' : '+'}${format(Math.abs(value))}`;
}
