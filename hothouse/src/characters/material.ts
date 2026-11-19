import { Color, Vector4, type MeshStandardMaterial } from 'three';
import { BUILDS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES, type Appearance } from '@/content/appearance';
import { hash2 } from '@/core/rng';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import { HEAD, soleHeight } from './geometry/body';
import { CREW_NECK, clothSpec, printId, Region, REGION_COUNT, type Neckline } from './geometry/cloth';
import { PEOPLE_FRAGMENT_COLOR, PEOPLE_FRAGMENT_EMISSIVE, PEOPLE_FRAGMENT_PARS, PEOPLE_FRAGMENT_SURFACE, PEOPLE_VERTEX_MAIN, PEOPLE_VERTEX_PARS } from './shader';

/** Iris colours, shared with the dialogue portraits. */
export const IRIS = ['#3B2416', '#5A3A22', '#2E4A3A', '#2C3E66', '#4A3A2A', '#1E1418'] as const;
const BAGS = ['#C9673F', '#2B3F78', '#F3E3C3', '#1F2937', '#FF6B5E', '#3E8E7E', '#8E6BEA', '#E8C987'] as const;

/** The live uniform values of one person's material. */
export interface PeopleUniforms {
  readonly pal: Color[];
  /** blink, brow lift, brow tilt, eye open | smile, open, smug, worry | gaze x, gaze y, spread, brow weight | iris rgb, stubble */
  readonly face: [Vector4, Vector4, Vector4, Vector4];
  readonly head: Vector4;
  readonly print: Vector4;
  /** neckline id, flags (1 bare shoulders, 2 lapels, 4 side stripes), placket y, crew neckline y */
  readonly cloth: Vector4;
  /** armhole |x|, sole height */
  readonly cloth2: Vector4;
}

const NECKLINES: readonly Neckline[] = ['crew', 'v', 'collar', 'scoop', 'high', 'open', 'strap'];

export function createUniforms(): PeopleUniforms {
  const pal: Color[] = [];
  for (let i = 0; i < REGION_COUNT; i++) pal.push(new Color());
  return {
    pal,
    face: [new Vector4(0, 0, 0, 1), new Vector4(0.2, 0, 0, 0), new Vector4(0, 0, 0.33, 0.5), new Vector4(0.2, 0.12, 0.08, 0)],
    head: new Vector4(HEAD.x, HEAD.y, HEAD.z, HEAD.r),
    print: new Vector4(),
    cloth: new Vector4(),
    cloth2: new Vector4(),
  };
}

const _c = new Color();

/** Fill the palette and static face parameters from an appearance. */
export function applyAppearance(u: PeopleUniforms, a: Appearance): void {
  const o = OUTFITS[a.outfit] ?? OUTFITS[0]!;
  const [top, accent, bottom, shoes] = o.colors;
  const style = HAIR_STYLES[a.hair] ?? HAIR_STYLES[0]!;
  const skin = SKIN_TONES[a.skin] ?? SKIN_TONES[0]!;
  const p = u.pal;
  const set = (r: number, hex: string) => p[r]!.set(hex);
  set(Region.SKIN, skin);
  set(Region.HEAD, skin);
  set(Region.TOP, top);
  set(Region.TRIM, accent);
  set(Region.BOTTOM, bottom);
  set(Region.BOTTOM_TRIM, accent);
  set(Region.SHOE, shoes);
  set(Region.SOLE, o.shoes === 'sneakers' || o.shoes === 'skates' ? '#F4F1EA' : o.shoes === 'sandals' ? '#D9C3A0' : o.shoes === 'flipflops' ? '#2C2C34' : '#2A2220');
  set(Region.HAIR, HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0]!);
  set(Region.HAT, style.hatColor ?? accent);
  p[Region.HAT_TRIM]!.copy(p[Region.HAT]!).multiplyScalar(0.55);
  if (a.hair === 37 || a.hair === 39) set(Region.HAT_TRIM, '#16171C');
  if (a.hair === 33) set(Region.HAT_TRIM, '#3A2418');
  set(Region.METAL, a.jewelry === 3 ? '#D9DDE2' : '#E9C46A');
  set(Region.LENS, a.glasses === 1 ? '#5A3A28' : a.glasses === 4 ? '#25366A' : '#2A1E3A');
  set(Region.FRAME, '#1E1622');
  const bag = BAGS[hash2(a.outfit, a.bag * 31 + a.skin, 77) % BAGS.length]!;
  set(Region.BAG, bag);
  p[Region.STRAP]!.copy(p[Region.BAG]!).multiplyScalar(0.62);
  set(Region.PHONE, '#1A1C22');
  set(Region.SCREEN, '#7FD8FF');
  set(Region.APRON, top);
  set(Region.WHEEL, accent);
  set(Region.UNDER, accent);
  // Light-coloured accents on light tops would vanish as a print: deepen them a little.
  if (Math.abs(_c.set(top).getHSL({ h: 0, s: 0, l: 0 }).l - p[Region.TRIM]!.getHSL({ h: 0, s: 0, l: 0 }).l) < 0.12) p[Region.TRIM]!.multiplyScalar(0.7);
  const iris = _c.set(IRIS[Math.min(IRIS.length - 1, Math.floor(a.eyes * IRIS.length))]!);
  u.face[2].z = 0.3 + 0.06 * a.eyes;
  u.face[2].w = a.brow;
  u.face[3].set(iris.r, iris.g, iris.b, a.facialHair === 1 ? 1 : a.facialHair >= 3 ? 0.45 : 0);
  u.print.x = printId(o);
  const c = clothSpec(o);
  u.cloth.set(NECKLINES.indexOf(c.neckline), (c.bareShoulders ? 1 : 0) + (c.lapels ? 2 : 0) + (c.sideStripes ? 4 : 0), c.placket, CREW_NECK);
  u.cloth2.set(0.112 * (BUILDS[a.build]?.shoulders ?? 1), soleHeight(o.shoes), 0, 0);
}

/** A MaterialKit material wired to the people shader and the given uniform values. */
export function createPeopleMaterial(kit: MaterialKit, u: PeopleUniforms): MeshStandardMaterial {
  return kit.standard({
    roughness: 0.8,
    metalness: 0,
    rim: 0.35,
    wet: true,
    extend: {
      key: 'people-v1',
      uniforms: { uPal: { value: u.pal }, uFace: { value: u.face }, uHeadC: { value: u.head }, uPrint: { value: u.print }, uCloth: { value: u.cloth }, uCloth2: { value: u.cloth2 } },
      vertexPars: PEOPLE_VERTEX_PARS,
      vertexMain: PEOPLE_VERTEX_MAIN,
      fragmentPars: PEOPLE_FRAGMENT_PARS,
      fragmentColor: PEOPLE_FRAGMENT_COLOR,
      fragmentSurface: PEOPLE_FRAGMENT_SURFACE,
      fragmentEmissive: PEOPLE_FRAGMENT_EMISSIVE,
    },
  });
}
