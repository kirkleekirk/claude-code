import { clamp, damp } from '@/core/math';
import type { Rng } from '@/core/rng';
import type { FaceExpression } from '../api';
import type { PeopleUniforms } from '../material';

/** Expression targets: brow lift, brow tilt, eye open, smile, mouth open, smug, worry. */
const EXPRESSIONS: Readonly<Record<FaceExpression, readonly number[]>> = {
  neutral: [0, 0, 1, 0.15, 0, 0, 0],
  happy: [0.3, -0.2, 0.82, 1, 0.32, 0, 0],
  annoyed: [-0.35, 0.95, 0.74, -0.55, 0, 0, 0],
  surprised: [1, -0.3, 1.32, 0, 0.9, 0, 0],
  smug: [0, 0.25, 0.72, 0.45, 0, 1, 0],
  worried: [0.55, -0.95, 1.05, -0.3, 0.05, 0, 1],
};

/**
 * Blinks, expressions, lip-flap and eye movement, written straight into the actor's face
 * uniforms. Eyes lead the head toward a look-at target and make small saccades otherwise.
 */
export class FaceState {
  private expr: FaceExpression = 'neutral';
  private hold = 0;
  private readonly cur = Float32Array.from(EXPRESSIONS.neutral);
  private blinkT = 0;
  private nextBlink = 2;
  private double = false;
  private gx = 0;
  private gy = 0;
  private sx = 0;
  private sy = 0;
  private sacT = 0;
  private talkT = 0;

  constructor(private readonly rng: Rng) {
    this.nextBlink = 1 + rng.next() * 3;
  }

  set(e: FaceExpression, hold?: number): void {
    this.expr = e;
    this.hold = hold ?? 0;
  }

  get expression(): FaceExpression {
    return this.expr;
  }

  /**
   * `override` is a clip's expression (it wins while the clip plays); `talk` 0–1 drives the
   * mouth; `lookX/lookY` are eye targets (−1…1) and `looking` how strongly to follow them.
   */
  update(dt: number, u: PeopleUniforms, override: FaceExpression | null, talk: number, lookX: number, lookY: number, looking: number): void {
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.expr = 'neutral';
    }
    const target = EXPRESSIONS[override ?? this.expr];
    const c = this.cur;
    for (let i = 0; i < 7; i++) c[i] = damp(c[i]!, target[i]!, 10, dt);
    // Blinks: 2–5.5 s apart, now and then a double.
    this.blinkT += dt;
    let blink = 0;
    if (this.blinkT > this.nextBlink) {
      const b = this.blinkT - this.nextBlink;
      blink = b < 0.06 ? b / 0.06 : 1 - Math.min(1, (b - 0.06) / 0.1);
      if (b > 0.16) {
        if (!this.double && this.rng.chance(0.1)) {
          this.double = true;
          this.blinkT = this.nextBlink - 0.08;
        } else {
          this.double = false;
          this.blinkT = 0;
          this.nextBlink = 2 + this.rng.next() * 3.5;
        }
      }
    }
    // Lip-flap: two incommensurate syllable rates.
    this.talkT += dt;
    const syll = 0.5 + 0.5 * Math.sin(this.talkT * 13.1) * Math.sin(this.talkT * 7.3 + 1.1);
    const open = Math.max(c[4]!, talk * (0.12 + 0.38 * syll));
    // Saccades when not looking at anything in particular.
    this.sacT -= dt;
    if (this.sacT <= 0) {
      this.sacT = 0.8 + this.rng.next() * 2.2;
      this.sx = (this.rng.next() - 0.5) * 0.5;
      this.sy = (this.rng.next() - 0.5) * 0.3;
    }
    const tx = looking * lookX + (1 - looking) * this.sx;
    const ty = looking * lookY + (1 - looking) * this.sy;
    this.gx = damp(this.gx, clamp(tx, -1, 1), 22, dt);
    this.gy = damp(this.gy, clamp(ty, -1, 1), 22, dt);
    u.face[0].set(blink, c[0]!, c[1]!, c[2]!);
    u.face[1].set(c[3]! * (1 - talk * 0.4), open, c[5]!, c[6]!);
    u.face[2].x = this.gx;
    u.face[2].y = this.gy;
  }
}
