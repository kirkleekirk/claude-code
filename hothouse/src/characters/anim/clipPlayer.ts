import type { ClipId, FaceExpression, PlayOptions } from '../api';
import { CLIPS, type ClipCtx, type ClipDef } from './clips';
import { Pose } from './pose';

interface Active {
  id: ClipId;
  def: ClipDef;
  t: number;
  w: number;
  speed: number;
  loop: boolean;
  fadeIn: number;
  fadeOut: number;
  stopping: boolean;
  finished: boolean;
  contactFired: boolean;
  onDone: (() => void) | null;
}

const MAX_ACTIVE = 6;

/**
 * Plays clips over the base pose: fades in and out, loops, holds, raises the contact moment and
 * calls `onDone` once when a non-looping clip completes. A new full-body clip fades out the
 * previous full-body clip; replaying a clip restarts it.
 */
export class ClipPlayer {
  private readonly active: Active[] = [];
  private readonly pool: Active[] = [];
  private readonly tmp = new Pose();
  /** Weight of the strongest clip that drives the face (lip-flap) this frame. */
  talk = 0;
  expression: FaceExpression | null = null;
  /** Combined weight of full-body clips (locomotion events are muted under them). */
  fullBody = 0;
  /** Head weight owned by clips (look-at yields to it). */
  headOwned = 0;

  play(id: ClipId, opts: PlayOptions = {}): void {
    const def = CLIPS[id];
    for (const a of this.active) {
      if (a.id === id) {
        this.restart(a, def, opts);
        return;
      }
      if (def.hips && a.def.hips && !a.stopping) {
        a.stopping = true;
        a.fadeOut = Math.min(a.fadeOut, 0.25);
      }
    }
    if (this.active.length >= MAX_ACTIVE) this.release(this.active.shift()!);
    const a = this.pool.pop() ?? ({} as Active);
    a.w = 0;
    a.finished = false;
    this.restart(a, def, opts);
    a.id = id;
    this.active.push(a);
  }

  private restart(a: Active, def: ClipDef, opts: PlayOptions): void {
    a.def = def;
    a.t = 0;
    a.w = a.w > 0 && !a.finished ? a.w : 0;
    a.speed = opts.speed ?? 1;
    a.loop = opts.loop ?? def.loop;
    a.fadeIn = opts.fadeIn ?? (def.hips ? 0.22 : 0.18);
    a.fadeOut = opts.fadeOut ?? (def.hips ? 0.3 : 0.22);
    a.stopping = false;
    a.finished = false;
    a.contactFired = false;
    a.onDone = opts.onDone ?? null;
  }

  stop(id?: ClipId, fade?: number): void {
    for (const a of this.active) {
      if (id === undefined || a.id === id) {
        a.stopping = true;
        if (fade !== undefined) a.fadeOut = Math.max(0.001, fade);
      }
    }
  }

  isPlaying(id: ClipId): boolean {
    for (const a of this.active) if (a.id === id && !a.stopping) return true;
    return false;
  }

  /** True while a held full-body clip (knockdown) is resting on its last frame. */
  holding(): boolean {
    for (const a of this.active) if (a.def.hold && a.finished && !a.stopping) return true;
    return false;
  }

  /** Advance clocks and weights; fires `contact` and completion. Runs even for culled actors. */
  advance(dt: number, onContact: () => void): void {
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i]!;
      a.t += dt * a.speed;
      const dur = a.def.dur;
      if (!a.loop && !a.finished && a.t >= dur) {
        a.finished = true;
        a.t = dur;
        if (!a.def.hold) a.stopping = true;
        const done = a.onDone;
        a.onDone = null;
        done?.();
      }
      if (a.def.contact !== undefined && !a.contactFired && a.t >= a.def.contact * dur) {
        a.contactFired = true;
        onContact();
      }
      if (a.loop && a.t >= dur) {
        a.t -= dur * Math.floor(a.t / dur);
        a.contactFired = false;
      }
      const target = a.stopping ? 0 : 1;
      const rate = target > a.w ? 1 / Math.max(0.001, a.fadeIn) : 1 / Math.max(0.001, a.fadeOut);
      a.w = target > a.w ? Math.min(1, a.w + dt * rate) : Math.max(0, a.w - dt * rate);
      if (a.stopping && a.w <= 0) {
        this.active.splice(i, 1);
        this.release(a);
        i--;
      }
    }
    this.talk = 0;
    this.expression = null;
    this.fullBody = 0;
    this.headOwned = 0;
    let best = 0;
    for (const a of this.active) {
      if (a.def.talk) this.talk = Math.max(this.talk, a.w);
      if (a.def.expression && a.w > best) {
        best = a.w;
        this.expression = a.def.expression;
      }
      if (a.def.hips) this.fullBody = Math.max(this.fullBody, a.w);
      this.headOwned = Math.max(this.headOwned, a.w * a.def.mask[4]!);
    }
  }

  /** Layer every active clip over `pose` in play order. */
  apply(pose: Pose, ctx: ClipCtx): void {
    for (const a of this.active) {
      if (a.w <= 0) continue;
      const k = a.def.dur > 0 ? Math.min(1, a.t / a.def.dur) : 1;
      this.tmp.copy(pose);
      a.def.pose(this.tmp, k, a.t, ctx);
      pose.blend(this.tmp, smooth(a.w), a.def.mask, a.def.hips ? smooth(a.w) : 0);
    }
  }

  get count(): number {
    return this.active.length;
  }

  clear(): void {
    while (this.active.length) this.release(this.active.pop()!);
  }

  private release(a: Active): void {
    a.onDone = null;
    this.pool.push(a);
  }
}

function smooth(w: number): number {
  return w * w * (3 - 2 * w);
}
