import { Sphere, Vector3, type BufferGeometry } from 'three';
import { OUTFITS, type Appearance } from '@/content/appearance';
import { proportions, restJoints, type Proportions } from '../rig';
import { buildBag, buildFacialHair, buildGlasses, buildJewelry, buildPhone } from './accessories';
import { buildArm, buildHead, buildLeg, buildNeck, buildShoe, buildTorso, headShape, type BodyCtx } from './body';
import { clothSpec, Region, type ClothSpec } from './cloth';
import { buildApron, buildCollar, buildHood, buildLapels, buildPockets, buildSkirt } from './garments';
import { buildHair } from './hair';
import { SkinBuilder } from './SkinBuilder';

/** Everything an actor needs from its shape. Colours live in the material, not here. */
export interface PersonGeometry {
  readonly key: string;
  readonly geometry: BufferGeometry;
  readonly proportions: Proportions;
  readonly cloth: ClothSpec;
  /** Rest joint positions (body space, neutral height). */
  readonly joints: Float32Array;
  readonly vertices: number;
  readonly triangles: number;
  /** Top of the head without hair or hats (body space). */
  readonly crown: number;
}

/**
 * Cache key: only the fields that change the mesh. Skin, hair colour, outfit colours and prints
 * are material parameters, so a crowd in the same cut of clothes shares one geometry.
 */
export function appearanceKey(a: Appearance): string {
  const o = OUTFITS[a.outfit] ?? OUTFITS[0]!;
  const eyes = a.glasses > 0 ? Math.round(a.eyes * 8) : 0;
  return `${a.build}|${a.face}|${a.hair}|${a.facialHair}|${o.top}.${o.bottom}.${o.shoes}|${a.glasses}.${eyes}|${a.jewelry}|${a.phone ? 1 : 0}|${a.bag}`;
}

const HEAD_REGIONS: ReadonlySet<number> = new Set([Region.HEAD]);

export function buildPerson(a: Appearance): PersonGeometry {
  const p = proportions(a);
  const outfit = OUTFITS[a.outfit] ?? OUTFITS[0]!;
  const c = clothSpec(outfit);
  const joints = restJoints(p);
  const b = new SkinBuilder();
  const ctx: BodyCtx = { b, p, c, joints };
  const h = headShape(a.face);
  buildTorso(ctx);
  buildNeck(ctx);
  buildHead(ctx, a.face);
  buildArm(ctx, 0);
  buildArm(ctx, 1);
  buildLeg(ctx, 0);
  buildLeg(ctx, 1);
  buildShoe(ctx, 0);
  buildShoe(ctx, 1);
  buildSkirt(ctx);
  buildApron(ctx);
  buildCollar(ctx);
  buildHood(ctx);
  buildLapels(ctx);
  buildPockets(ctx);
  buildHair(ctx, h, a.hair);
  buildFacialHair(ctx, h, a.facialHair);
  buildGlasses(ctx, h, a.glasses, a.eyes);
  buildJewelry(ctx, h, a.jewelry);
  if (a.phone) buildPhone(ctx);
  buildBag(ctx, a.bag);
  const crown = b.bounds(HEAD_REGIONS).maxY;
  const geometry = b.build();
  // A generous static sphere: poses never leave it, and Three never has to skin on the CPU.
  geometry.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.45);
  return {
    key: appearanceKey(a),
    geometry,
    proportions: p,
    cloth: c,
    joints,
    vertices: b.vertexCount,
    triangles: b.indexCount / 3,
    crown,
  };
}
