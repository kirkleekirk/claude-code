/**
 * One-shot voice bookkeeping: per-sound and global limits, oldest-first stealing, and a tiny
 * debounce so the same sound triggered twice in one frame does not phase against itself.
 */

export interface Voice {
  id: string;
  start: number;
  end: number;
  /** Fade out quickly and release nodes. */
  stop(at: number): void;
}

export class VoiceManager {
  private readonly voices: Voice[] = [];
  private readonly lastStart = new Map<string, number>();

  constructor(
    private readonly globalLimit = 56,
    private readonly debounce = 0.012,
  ) {}

  get active(): number {
    return this.voices.length;
  }

  /** Returns false if the sound should be skipped (debounced). Steals voices to make room. */
  admit(id: string, now: number, perIdLimit: number): boolean {
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < this.debounce) return false;
    this.prune(now);
    let count = 0;
    let oldestOfId = -1;
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i]!.id === id) {
        count++;
        if (oldestOfId < 0) oldestOfId = i;
      }
    }
    if (count >= perIdLimit && oldestOfId >= 0) this.steal(oldestOfId, now);
    if (this.voices.length >= this.globalLimit) this.steal(0, now);
    this.lastStart.set(id, now);
    return true;
  }

  add(voice: Voice): void {
    this.voices.push(voice);
  }

  prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i]!.end <= now) this.voices.splice(i, 1);
    }
  }

  stopAll(now: number): void {
    for (const v of this.voices) v.stop(now);
    this.voices.length = 0;
  }

  private steal(index: number, now: number): void {
    const v = this.voices[index];
    if (!v) return;
    v.stop(now);
    this.voices.splice(index, 1);
  }
}
