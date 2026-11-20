# Characters

Everyone in Halcyon Bay — the player, the named cast, customers, crew, cops and the crowd — is an
`Actor` made procedurally from an `Appearance` (`content/appearance.ts`). No external assets.

```ts
import { createCharacters } from '@/characters';

const people = createCharacters(ctx.kit);         // one per world
const kiki = people.create(appearanceFromSeed('kiki'));
scene.add(kiki.root);
// every frame:
kiki.root.position.copy(pos); kiki.root.rotation.y = yaw;   // the controller owns the root
kiki.loco.speed = v; kiki.loco.turnRate = w; kiki.loco.grounded = onGround; kiki.loco.vy = vy;
kiki.update(dt, camera.position.distanceTo(pos));
```

## Conventions

- **Body space**: people are built at a neutral height of 1.76 m, feet on y = 0, facing **−Z**
  (the game's yaw 0; `root.rotation.y = yaw`). The character's right is +X. The body group under
  the root is scaled to `heightMetres(appearance)`; skates and heels lift it (`proportions().lift`).
- The **controller owns `root`** (position and yaw) and fills `loco` every frame. The actor only
  animates; it never moves itself.
- **Seated postures** (`drive`, `passenger`, `sit`) put the hip joints on the root: the root *is*
  the hip point (H-point).

## Architecture

| Module | Does |
|---|---|
| `rig.ts` | 24-bone skeleton, segment lengths, proportions from a build, rest joints |
| `geometry/SkinBuilder.ts` | typed-array builder: superellipse rings, bridges, caps, lathes, ellipsoids, tubes; skin weights; per-part smooth normals |
| `geometry/body.ts` | torso (clothing as regions + hem lips), neck, head (6 face shapes), arms, mitten hands, legs, shoes (7 styles) |
| `geometry/garments.ts` | skirts and dresses (two-sided), aprons, collars, hoods, lapels, cargo pockets |
| `geometry/hair.ts` | 30 hair styles and 10 hats: scalp shells with shaped hairlines, curtains, strands, buns, crests, crowns, brims, bills |
| `geometry/accessories.ts` | glasses (5), jewellery (4), phone in hand, bags (4), moustache / beard / goatee |
| `geometry/build.ts` | assembles a person; `appearanceKey()` (shape fields only) |
| `shader.ts` + `material.ts` | MaterialKit standard material with a people extension: region palette, prints, hair textures, the painted face, per-pixel clothing openings |
| `anim/pose.ts` | Euler-per-bone pose buffers (Three 'ZXY'), masks, blending |
| `anim/ik.ts` | forward kinematics over a pose; analytic two-bone IK for legs and arms |
| `anim/locomotion.ts` | gait cycle with IK-planted feet, pelvis, spine, arms, air, landing, turning on the spot, idle variants |
| `anim/clips.ts` + `clipPlayer.ts` | the 36 `ClipId`s as pose functions; fades, loops, holds, contact, `onDone` |
| `anim/postures.ts` | seated poses; hands follow the wheel rim |
| `anim/face.ts` | expressions, blinks, lip-flap, saccades, gaze |
| `Actor.ts` | the `Actor`: skeleton, sockets, LOD, look-at, hair spring, events |
| `factory.ts` | `createCharacters()`, the shape-keyed geometry cache, frame stats |
| `ergonomics.ts` | seat and steering-wheel offsets shared with the vehicles |

**One draw call per person.** Body, clothes, hair, hats and accessories are one `SkinnedMesh`.
Colours are not baked: each vertex carries a region (`look.x`), and the shader reads the actor's
palette uniform, so a crowd in the same cut of clothes shares one geometry (`appearanceKey`).
Per-actor uniforms (palette, face, print, clothing cuts) live on a per-actor material; the GPU
program is shared.

**Clothing edges.** Regions are `flat` varyings, so a triangle never blends two regions.
Horizontal edges (hems, cuffs, sleeves, trouser ends, collars) sit on geometry rings. Curved or
narrow ones (necklines, armholes, plackets, track stripes, lapels, sole lines) are cut per pixel
in the shader from the bind-pose position, with anti-aliasing.

**Faces** are painted on the head in the fragment shader in head units: almond eyes with iris,
pupil and glint, an upper lid line, brows, a mouth that smiles, opens, smirks and frets, cheeks
and stubble. They match the dialogue portraits (`ui/portrait`): same palettes, same iris
colours, same expression set (`FaceExpression`).

## Animation stack (per evaluated frame)

1. **Locomotion** (`Locomotor`): cadence rises with speed; the stance length equals the distance
   the body travels, so planted feet never slide. The pelvis drops when a stride would overreach.
   Walk → jog → run → sprint blend on speed; `moveAngle` gives strafing and backpedalling;
   `crouch`; `vy`/`grounded` give jump, fall and landing; `turnRate` gives leaning and stepping
   on the spot. Idle has breathing, weight shifts and variants (look around, check watch, stretch,
   scratch head, hands on hips, tap foot).
2. **Posture** blend (0.35 s) toward the seated pose.
3. **Clips** layered in play order through their bone masks.
4. **Look-at**: chest, neck and head share the turn; the eyes lead.
5. **Hair spring** (near only): long hair, ponytails and braids trail the head.
6. Bones are written once; **face** uniforms updated (near only).

## Level of detail

| Distance | Rate | Skips |
|---|---|---|
| < 20 m | every frame | nothing |
| 20–60 m | every 2nd frame (staggered) | face, hair spring |
| 60–150 m | every 4th frame | face, hair spring, look-at, shadows |
| > 150 m | culled: the body group is detached from the root | everything but clip clocks |

Clip clocks, `onDone` and `contact` always run, so gameplay never waits on an off-screen actor.

## Budgets (measured by `tests/characters/bench.test.ts`, Node, no other load)

- Vertices per person: about 4k on average, 5.4k at most (QA crowd maximum 5,380); test
  ceiling 6.5k. One draw call each (plus its shadow).
- `update` for 60 people (20 near, 20 mid, 20 far, walking, running, idling and gesturing):
  0.45 ms mean, 0.66 ms p95 per frame (budget 2 ms).
- `create`: 3.0 ms median when the shape is new (geometry build ~2.1 ms), ~0.7 ms when the
  shape is cached (`appearanceKey` ignores colours, height and prints).
- No allocation in `update` (module scratch vectors, pooled clip slots, preallocated pose buffers).

## Events

`onEvent(e)` raises `footL`/`footR` at heel strike, `land` on touchdown, `contact` at a clip's
exchange moment (handoff, receive, pickup, putdown), and `seated`/`stood` when a posture blend
completes. For audio:

```ts
actor.onEvent = (e) => {
  const p = actor.root.position;
  if (e === 'footL' || e === 'footR') audio.sfx('footstep', { x: p.x, y: p.y, z: p.z, surface, volume: run ? 1 : 0.6 });
  else if (e === 'land') audio.sfx('land', { x: p.x, y: p.y, z: p.z, surface });
  else if (e === 'contact') audio.sfx('handoff', { x: p.x, y: p.y + 1, z: p.z });
};
```

## Seating someone in a vehicle

```ts
import { seatPoint } from '@/vehicles/defs';
car.group.add(actor.root);                                   // ride with the car
actor.root.position.copy(seatPoint(def.body, 'driver'));     // or 'passenger'
actor.root.rotation.set(0, 0, 0);
actor.posture = 'drive';                                     // 'passenger' for the other seat
actor.steer = steeringWheelAngle;                            // hands follow the rim
```

Getting in: stand the actor at the door (outside, facing the car's forward), play
`enterVehicleL` (driver door) or `enterVehicleR`, move the root along the door path while it
plays, then on `onDone` reparent to the car and set the posture. Getting out is the reverse with
`exitVehicleL/R`, setting `posture = 'stand'` first. `DRIVER_WHEEL` (in `ergonomics.ts`) is the
steering wheel relative to the hip point; `carMesh` builds the convertible's wheel there.

## Adding a clip

1. Add the id to `ClipId` in `api.ts` (additive).
2. Add a `ClipDef` in `anim/clips.ts`: `dur`, `loop`, a bone `mask` (`Mask.*`), optional `hips`
   (full body), `contact`, `talk`, `expression`, and `pose(P, k, t, c)`. `P` arrives holding the
   pose underneath; overwrite what the clip owns. Helpers: `arm()`, `hand()`, `solveArm()`
   (body-space targets), `feet()`/`solveLeg()` after moving the hips, `env()` and `kf()` for
   envelopes and keyframes.
3. It appears in the showcase clip pages automatically; check `node qa/people.mjs clips:0 clips:1`.

## Showcase and QA

`?sandbox=people` (harness: `people(scene, opt)`, `peopleStats()`, `peopleDebug('winding')`).
`node qa/people.mjs` renders every scene into `qa/out/people/` and composes `sheet-*.png`.
`peopleDebug('winding')` paints inverted faces red.

## Known limits

- Hands are mittens with a thumb (one finger-curl bone); there are no individual fingers.
- Clothing is skin-tight geometry plus inflation; skirts and long hair are skinned, not
  simulated, so very wide strides can poke a knee through a skirt.
- Feet are planted on a flat ground plane; slopes and stairs need the controller to pass the
  ground height (not in the contract yet).
- In closed cars the vehicle glass is opaque in game, so drivers are hidden unless the glass
  is made translucent (the showcase uses a cutaway material).
- Long-hair curtains: right beside the cheeks the inner layer can sit a few millimetres in front
  of the outer one; those faces are culled and the outer hair shows, so nothing is visible in
  game, but `peopleDebug('winding')` paints a thin red sliver there.
