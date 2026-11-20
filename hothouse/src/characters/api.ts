import type { Object3D, Vector3 } from 'three';
import type { Appearance } from '@/content/appearance';

/**
 * The contract for people: the player, the named cast, customers, crew and the crowd all use the
 * same `Actor`. A controller (player input, AI, cutscene) owns the root transform and fills
 * `loco`; the actor only animates. Everything is procedural: geometry is built from an
 * `Appearance`, motion from layered parametric cycles, with no external assets.
 */

/** Facial expressions; the same set the dialogue portraits use. */
export type FaceExpression = 'neutral' | 'happy' | 'annoyed' | 'surprised' | 'smug' | 'worried';

/**
 * One-shot or looping actions layered over locomotion. Upper-body clips keep the legs on the
 * locomotion cycle; full-body clips take over the whole pose.
 */
export type ClipId =
  // conversation and the deal
  | 'talk' | 'nod' | 'shake' | 'shrug' | 'point' | 'wave' | 'beckon' | 'handoff' | 'receive' | 'count'
  // work at the nursery
  | 'pickup' | 'putdown' | 'kneelWork' | 'water' | 'benchWork' | 'carry'
  // city life
  | 'phoneCall' | 'phoneText' | 'phoneFilm' | 'sitBench' | 'lean' | 'dance' | 'cheer' | 'smoke'
  // trouble (stylized, never gory)
  | 'cower' | 'handsUp' | 'shove' | 'punch' | 'hitReact' | 'knockdown' | 'getUp' | 'flee'
  // vehicles: the side is the door the actor uses
  | 'enterVehicleL' | 'enterVehicleR' | 'exitVehicleL' | 'exitVehicleR';

/** Whole-body stances that replace standing locomotion. */
export type Posture = 'stand' | 'drive' | 'passenger' | 'sit';

export interface Locomotion {
  /** Horizontal ground speed in m/s. 0–1.6 walk, to 4 jog, to 6.5 run, beyond is a sprint. */
  speed: number;
  /** Signed yaw rate in rad/s; the body leans into turns and steps in place when turning still. */
  turnRate: number;
  /** Direction of travel relative to facing, radians (0 = forward, ±π/2 = strafe, π = backpedal). */
  moveAngle: number;
  grounded: boolean;
  /** Vertical velocity in m/s: jump, fall and landing poses. */
  vy: number;
  /** 0 standing … 1 full crouch. */
  crouch: number;
}

export interface PlayOptions {
  loop?: boolean;
  /** Playback rate (1 = authored speed). */
  speed?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Called once when a non-looping clip finishes (not when it is stopped early). */
  onDone?: () => void;
}

/** Events an actor raises while animating (footstep audio, the moment cash changes hands). */
export type ActorEvent = 'footL' | 'footR' | 'land' | 'contact' | 'seated' | 'stood';

export type AttachSlot = 'handR' | 'handL' | 'head' | 'back';

export interface Actor {
  /** Add to the scene. The owner sets its position and yaw (rotation.y); feet sit at local y = 0. */
  readonly root: Object3D;
  readonly appearance: Appearance;
  /** Standing height in metres. */
  readonly height: number;
  /** Written by the controller every frame. */
  readonly loco: Locomotion;
  posture: Posture;
  /**
   * For `drive`: steering-wheel angle in radians (hands follow the rim). The seat itself is the
   * root transform, which the vehicle places at the seat's hip point.
   */
  steer: number;
  play(clip: ClipId, opts?: PlayOptions): void;
  /** Stop one clip, or every clip when omitted. */
  stop(clip?: ClipId, fade?: number): void;
  isPlaying(clip: ClipId): boolean;
  /** Head, eyes and a little spine track a world-space point; null returns to forward. */
  lookAt(target: Vector3 | null): void;
  /** Change expression; with `hold` seconds it returns to neutral afterwards. */
  setExpression(e: FaceExpression, hold?: number): void;
  /** Parent an object to a bone socket; null clears the slot. The caller owns the object. */
  attach(slot: AttachSlot, obj: Object3D | null): void;
  /** World-space position of a socket (for props, particles and the handoff). */
  socketPosition(slot: AttachSlot, out: Vector3): Vector3;
  onEvent: ((e: ActorEvent) => void) | null;
  /**
   * Advance animation. `cameraDistance` picks the level of detail: near actors animate faces and
   * fingers every frame, far ones update at a lower rate and skip secondary motion.
   */
  update(dt: number, cameraDistance: number): void;
  dispose(): void;
}

export interface CharacterStats {
  actors: number;
  /** Actors updated this frame at full rate / reduced rate / culled. */
  full: number;
  reduced: number;
  culled: number;
  /** Cached geometries (built per appearance key). */
  geometries: number;
  updateMs: number;
}

export interface CharacterFactory {
  create(appearance: Appearance, opts?: { name?: string; castShadow?: boolean }): Actor;
  stats(): CharacterStats;
  dispose(): void;
}
