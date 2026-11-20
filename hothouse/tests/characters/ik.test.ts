import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { randomAppearance } from '@/content/appearance';
import { Rng } from '@/core/rng';
import { boneTransform, solveArm, solveLeg } from '@/characters/anim/ik';
import { Pose } from '@/characters/anim/pose';
import { ARM, LEG, proportions, restJoints } from '@/characters/rig';

const joints = restJoints(proportions(randomAppearance(new Rng('ik'))));
const p = new Vector3();
const q = new Quaternion();

describe('two-bone IK', () => {
  it('puts the wrist on reachable targets in front of, beside and above the body', () => {
    const rng = new Rng('arms');
    const pose = new Pose();
    for (let i = 0; i < 200; i++) {
      pose.reset();
      const side = (i % 2) as 0 | 1;
      const sx = side ? 1 : -1;
      // Targets a hand can comfortably reach: forward of the shoulder, either side, chest to head.
      const t = new Vector3(sx * rng.range(-0.05, 0.35), rng.range(0.95, 1.6), rng.range(-0.5, -0.1));
      const shoulder = new Vector3(joints[ARM[side][1] * 3]!, joints[ARM[side][1] * 3 + 1]!, joints[ARM[side][1] * 3 + 2]!);
      if (shoulder.distanceTo(t) > 0.52 || shoulder.distanceTo(t) < 0.12) continue;
      solveArm(pose, joints, side, t.x, t.y, t.z, rng.range(0, 0.8));
      boneTransform(pose, joints, ARM[side][3], p, q);
      expect(p.distanceTo(t)).toBeLessThan(0.01);
    }
  });

  it('puts the ankle on reachable targets and keeps the foot flat', () => {
    const rng = new Rng('legs');
    const pose = new Pose();
    const down = new Vector3();
    for (let i = 0; i < 200; i++) {
      pose.reset();
      pose.hips[1] = -rng.range(0, 0.3);
      const side = (i % 2) as 0 | 1;
      const sx = side ? 1 : -1;
      const t = new Vector3(sx * rng.range(0.03, 0.2), rng.range(0.085, 0.3), rng.range(-0.35, 0.35));
      const hip = new Vector3(joints[LEG[side][0] * 3]!, joints[LEG[side][0] * 3 + 1]! + pose.hips[1]!, joints[LEG[side][0] * 3 + 2]!);
      if (hip.distanceTo(t) > 0.8) continue;
      solveLeg(pose, joints, side, t.x, t.y, t.z, 0);
      boneTransform(pose, joints, LEG[side][2], p, q);
      expect(p.distanceTo(t)).toBeLessThan(0.01);
      // A flat foot keeps its own down axis pointing down.
      down.set(0, -1, 0).applyQuaternion(q);
      expect(down.y).toBeLessThan(-0.99);
    }
  });
});
