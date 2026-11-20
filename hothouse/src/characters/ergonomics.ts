/**
 * Seating ergonomics shared by people and the things they sit in. Distances are world metres
 * relative to the seated person's hip point (H-point), facing −Z.
 */

/** Steering wheel centre, rim radius and tilt (the top leans toward the driver). */
export const DRIVER_WHEEL = { y: 0.33, z: -0.43, radius: 0.18, tilt: 0.45 } as const;

/** Chair or bench seat: how far the floor lies below the hip point for the `sit` posture. */
export const SIT_DROP = 0.5;

/** Cushion top below the hip point, and backrest behind it. */
export const SEAT_CUSHION = { below: 0.08, back: 0.13 } as const;
