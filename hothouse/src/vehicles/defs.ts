import type { EngineProfile } from '@/audio/api';

/** Body proportions for the procedural car builder (metres; t runs 0 = front bumper → 1 = rear). */
export interface BodyShape {
  length: number;
  width: number;
  /** Roof height (or windshield top for convertibles). */
  height: number;
  wheelbase: number;
  /** Wheel centre position of the front axle as a fraction of length from the nose. */
  frontAxle: number;
  track: number;
  wheelR: number;
  wheelW: number;
  clearance: number;
  /** Hood/deck line: [t, height] keys. */
  belt: ReadonlyArray<readonly [number, number]>;
  /** Plan-view pinch at the nose and tail (0 = boxy, 1 = very rounded). */
  roundness: number;
  /** Cabin: windshield base, roof start, roof end, rear glass base (t), and inward lean of the glass. */
  cabin: { start: number; roofStart: number; roofEnd: number; end: number; tumblehome: number };
  convertible?: boolean;
  /** Pickup bed between t0 and t1 (no greenhouse there). */
  bed?: { t0: number; t1: number; wall: number };
  /** Fins, spoilers and other silhouette accents. */
  spoiler?: number;
  fins?: boolean;
  /** Chrome bumpers (classics) vs body-colour (modern). */
  chrome: boolean;
  rimStyle: 'spokes' | 'wire' | 'disc' | 'star' | 'steel';
  rimColor: string;
  headlights: 'round' | 'quad' | 'slim' | 'popup';
}

/** Arcade handling: every number here was tuned against the drive bot (see BALANCE.md / PROGRESS.md). */
export interface Handling {
  mass: number;
  /** Peak engine force at the wheels in newtons, and the speed (m/s) where it fades to ~25 %. */
  drive: number;
  topSpeed: number;
  brake: number;
  /** Fraction of drive to the front axle (0 = RWD, 1 = FWD). */
  frontDrive: number;
  /** Max steer angle at standstill and at top speed (radians). */
  steerLock: number;
  steerLockFast: number;
  /** Lateral grip coefficient per axle and the handbrake rear-grip multiplier. */
  gripFront: number;
  gripRear: number;
  handbrakeGrip: number;
  /** Suspension spring (N/m per wheel), damper, rest length, travel. */
  spring: number;
  damper: number;
  rest: number;
  travel: number;
  antiRoll: number;
  /** Centre-of-mass height above the chassis origin (lower = more planted). */
  comY: number;
  /** Yaw inertia scale (higher = lazier rotation, easier drifts to hold). */
  yawInertia: number;
  /** Lowrider hydraulics hop strength (0 = none). */
  hydraulics?: number;
}

export type VehicleClass = 'pickup' | 'muscle' | 'tuner' | 'convertible' | 'lowrider' | 'van' | 'suv' | 'exotic' | 'sedan' | 'police' | 'taxi';

export interface VehicleDef {
  readonly id: string;
  readonly make: string;
  readonly model: string;
  readonly cls: VehicleClass;
  readonly body: BodyShape;
  readonly handling: Handling;
  readonly engine: EngineProfile;
  /** Factory colours (sRGB) the generator picks from for traffic. */
  readonly paints: readonly string[];
  readonly seats: number;
}

const sedanBelt = (front: number, rear: number) => [[0, front - 0.18], [0.06, front], [0.3, front + 0.04], [0.7, rear], [0.95, rear], [1, rear - 0.16]] as const;

export const VEHICLES: Record<string, VehicleDef> = {
  palmera: {
    id: 'palmera', make: 'Bellamar', model: 'Palmera', cls: 'convertible', seats: 2,
    body: {
      length: 4.75, width: 1.86, height: 1.28, wheelbase: 2.72, frontAxle: 0.2, track: 1.56, wheelR: 0.33, wheelW: 0.22, clearance: 0.16,
      belt: [[0, 0.62], [0.05, 0.76], [0.2, 0.86], [0.42, 0.9], [0.8, 0.9], [0.97, 0.86], [1, 0.7]],
      roundness: 0.55, cabin: { start: 0.4, roofStart: 0.48, roofEnd: 0.5, end: 0.72, tumblehome: 0.06 }, convertible: true,
      fins: true, chrome: true, rimStyle: 'wire', rimColor: '#E8EBEF', headlights: 'round',
    },
    handling: {
      mass: 1350, drive: 9200, topSpeed: 58, brake: 14000, frontDrive: 0, steerLock: 0.62, steerLockFast: 0.13,
      gripFront: 1.25, gripRear: 1.12, handbrakeGrip: 0.32, spring: 36000, damper: 3600, rest: 0.34, travel: 0.2, antiRoll: 9000,
      comY: -0.12, yawInertia: 1.15,
    },
    engine: { cylinders: 8, idleRpm: 750, redlineRpm: 5800, rasp: 0.35, bass: 0.75, turbo: 0, pops: 0.25, flavor: 'bigBlock' },
    paints: ['#F7C3D2', '#A8E4EC', '#FFF4E3', '#FF6B5E', '#FFD166'],
  },
  gator: {
    id: 'gator', make: 'Marsh', model: 'Gator ’84', cls: 'pickup', seats: 2,
    body: {
      length: 5.05, width: 1.94, height: 1.82, wheelbase: 3.0, frontAxle: 0.19, track: 1.62, wheelR: 0.39, wheelW: 0.26, clearance: 0.3,
      belt: [[0, 0.82], [0.04, 1.02], [0.3, 1.1], [1, 1.1]],
      roundness: 0.2, cabin: { start: 0.33, roofStart: 0.4, roofEnd: 0.53, end: 0.56, tumblehome: 0.08 },
      bed: { t0: 0.57, t1: 0.98, wall: 0.5 }, chrome: true, rimStyle: 'steel', rimColor: '#DADCE0', headlights: 'quad',
    },
    handling: {
      mass: 1900, drive: 10500, topSpeed: 48, brake: 16000, frontDrive: 0.25, steerLock: 0.6, steerLockFast: 0.12,
      gripFront: 1.15, gripRear: 1.0, handbrakeGrip: 0.36, spring: 42000, damper: 3800, rest: 0.42, travel: 0.28, antiRoll: 7000,
      comY: -0.05, yawInertia: 1.3,
    },
    engine: { cylinders: 6, idleRpm: 700, redlineRpm: 5200, rasp: 0.5, bass: 0.6, turbo: 0, pops: 0.15, flavor: 'piston' },
    paints: ['#3E9C93', '#C9673F', '#E8E2D6', '#4A6B8A'],
  },
  hammerhead: {
    id: 'hammerhead', make: 'Corsair', model: 'Hammerhead', cls: 'muscle', seats: 2,
    body: {
      length: 4.8, width: 1.92, height: 1.32, wheelbase: 2.78, frontAxle: 0.2, track: 1.6, wheelR: 0.35, wheelW: 0.28, clearance: 0.14,
      belt: [[0, 0.66], [0.05, 0.84], [0.35, 0.9], [0.8, 0.92], [1, 0.78]],
      roundness: 0.3, cabin: { start: 0.38, roofStart: 0.5, roofEnd: 0.64, end: 0.8, tumblehome: 0.1 }, spoiler: 0.12,
      chrome: false, rimStyle: 'star', rimColor: '#2A2D33', headlights: 'quad',
    },
    handling: {
      mass: 1550, drive: 13800, topSpeed: 66, brake: 15500, frontDrive: 0, steerLock: 0.6, steerLockFast: 0.11,
      gripFront: 1.25, gripRear: 0.98, handbrakeGrip: 0.3, spring: 40000, damper: 3800, rest: 0.33, travel: 0.18, antiRoll: 10000,
      comY: -0.14, yawInertia: 1.05,
    },
    engine: { cylinders: 8, idleRpm: 800, redlineRpm: 6500, rasp: 0.75, bass: 0.9, turbo: 0, pops: 0.6, flavor: 'bigBlock' },
    paints: ['#FF3D3D', '#140B33', '#FFD166', '#17E0C8', '#FFFFFF'],
  },
  brisa: {
    id: 'brisa', make: 'Kaido', model: 'Brisa', cls: 'sedan', seats: 4,
    body: {
      length: 4.5, width: 1.78, height: 1.46, wheelbase: 2.65, frontAxle: 0.2, track: 1.52, wheelR: 0.31, wheelW: 0.2, clearance: 0.15,
      belt: sedanBelt(0.9, 0.95), roundness: 0.55, cabin: { start: 0.3, roofStart: 0.42, roofEnd: 0.66, end: 0.82, tumblehome: 0.12 },
      chrome: false, rimStyle: 'disc', rimColor: '#B9BEC4', headlights: 'slim',
    },
    handling: {
      mass: 1250, drive: 7200, topSpeed: 50, brake: 13000, frontDrive: 1, steerLock: 0.62, steerLockFast: 0.14,
      gripFront: 1.15, gripRear: 1.15, handbrakeGrip: 0.4, spring: 32000, damper: 3200, rest: 0.33, travel: 0.18, antiRoll: 8000,
      comY: -0.1, yawInertia: 1.1,
    },
    engine: { cylinders: 4, idleRpm: 800, redlineRpm: 6800, rasp: 0.3, bass: 0.3, turbo: 0, pops: 0, flavor: 'piston' },
    paints: ['#E9E6E2', '#9C9AA0', '#2B2F3A', '#7FB6D8', '#C9673F', '#3E8E7E', '#F2E1C8'],
  },
  marshal: {
    id: 'marshal', make: 'Corsair', model: 'Marshal', cls: 'police', seats: 2,
    body: {
      length: 5.0, width: 1.9, height: 1.5, wheelbase: 2.9, frontAxle: 0.2, track: 1.6, wheelR: 0.34, wheelW: 0.24, clearance: 0.16,
      belt: sedanBelt(0.92, 0.98), roundness: 0.35, cabin: { start: 0.31, roofStart: 0.43, roofEnd: 0.66, end: 0.8, tumblehome: 0.1 },
      chrome: false, rimStyle: 'steel', rimColor: '#2A2D33', headlights: 'slim',
    },
    handling: {
      mass: 1650, drive: 13000, topSpeed: 64, brake: 16500, frontDrive: 0, steerLock: 0.6, steerLockFast: 0.12,
      gripFront: 1.3, gripRear: 1.18, handbrakeGrip: 0.34, spring: 42000, damper: 4000, rest: 0.34, travel: 0.18, antiRoll: 11000,
      comY: -0.14, yawInertia: 1.05,
    },
    engine: { cylinders: 8, idleRpm: 750, redlineRpm: 6000, rasp: 0.55, bass: 0.75, turbo: 0, pops: 0.2, flavor: 'piston' },
    paints: ['#F4F0EA'],
  },
};

export type VehicleId = keyof typeof VEHICLES;
