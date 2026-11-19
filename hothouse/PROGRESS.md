# HOTHOUSE — Progress Log

Each milestone ends with: a runnable build, screenshots, test output, a written critique of the
five weakest things, and the fixes. Newest entries at the bottom.

---

## M0 — Plan and foundations

**Built**
- Planning documents: `DESIGN.md` (systems, Fun Audit, decisions log), `ART_BIBLE.md`,
  `ARCHITECTURE.md`, `UI_SPEC.md`.
- Toolchain: TypeScript 7 strict, Vite 8 (Rolldown + oxc JSX for Preact), Three r187, pmndrs
  `postprocessing`, Rapier 0.21, Preact 11 + signals. `npm run build` emits `dist/` and a
  self-contained `dist/hothouse.html` (verified running from `file://` with zero console output).
- `core/`: typed event bus, seeded RNG (sfc32, serializable, forkable), math and springs, the
  art-directed clock (16-minute day; golden hour 270 s, midday 90 s), fixed-step loop with
  interpolation and catch-up limits, live tunables, localization-ready strings and `Intl`
  formatting, log ring buffer (no console in production), URL flags, cooperative time slicer,
  pools, deterministic noise.
- `input/`: action map with contexts, keyboard/mouse/gamepad, radial dead zones and response
  curves, menu key-repeat, fixed-step press latching, injection for bots, rebinding with conflict
  detection, per-device glyphs (Xbox / PlayStation / Switch).
- `physics/`: Rapier wrapper with collision layers, allocation-free ray queries, impact events,
  transform interpolation.
- `save/`: three slots + autosave with atomic write, verify, rolling backup, checksum, migration,
  export/import; typed settings schema (graphics, audio, controls, gameplay, accessibility) with
  sanitizing store.
- `render/`: renderer shell, art-directed time-of-day keys (14 keys + storm), sun/moon paths with an
  invisible key-light handover, native cascaded sun shadows, shared-uniform atmosphere (sky and
  fog use one model so the horizon never seams), sky dome (gradient, sun, moon, stars, lit clouds),
  MaterialKit (one fog/wetness/wind/rim patch for every lit material), post stack (bloom + AgX
  tone map + analytic grade with split toning, vignette, grain, dither), quality tiers.
- `debug/`: `window.__HOTHOUSE__` harness (time, weather, camera pin, deterministic advance,
  input injection, screenshots, perf snapshot, state), tuning panel (backquote), pipeline sandbox.
- Shared contracts for parallel work: `audio/api.ts`, `game/actions.ts`, `content/places.ts`
  (8 districts, 44 places), `content/appearance.ts` (12 builds, 20 skin tones, 40 hair/hats,
  72 outfits, 6 player looks).
- QA: `qa/lib.mjs` (server, headless Chromium + SwiftShader, harness helpers, luminance stats),
  `qa/pipeline.mjs`; Vitest suites for core, input map conflicts and saves; `tools/project-lint.mjs`.

**Evidence**
- `npm test`: 32 tests passing; project lint clean.
- `qa/pipeline.mjs`: 9 time/weather cases rendered, zero console output, 163 draw calls.

**Critique (five weakest things) → action**
1. Chrome and paint read black: no environment reflections yet → PMREM sky probe in M1.
2. Night pushes saturated blue on pastel walls ("cyberpunk blue" risk) → lower moon key, shift it
   lavender, lean on neon pools; tune in M1 with real assets.
3. Ground and walls are flat colour → procedural trim atlases and detail normals in M1.
4. Cloud layer smears into streaks near the horizon (planar projection) → fade earlier, add a
   horizon cloud bank in M1.
5. Prewarm warned on GPUs without parallel shader compile → fixed (synchronous path).

---

## M1 — Golden-Hour look-dev slice

**Built**
- City plan: coast, the Bay, eight districts, a road graph with junction fillets and blocks
  extracted as planar faces; `districtAt()`.
- Terrain as a Rapier heightfield; water with planar reflections. The Gulf, the bay and the
  Causeway channel share one surface.
- Roads meshed per chunk with lane paint, medians and curbs. The road shader carries wetness
  and puddles.
- 380 buildings in eight styles (Deco hotels, streamline moderne, Crown towers, bungalows, strip
  malls) on 485 lots. Procedural facades with lit window rhythms.
- 1,344 swaying palms (royal and coconut).
- 588 signs from a generated atlas.
- Street furniture and light pools.
- Landmarks: the Neon Strand beachfront and boardwalk, Pier 9 with a turning Ferris wheel, the
  Causeway arch bridge, and Isla Dorada.
- Look-dev stage and `qa/lookdev.mjs` hero shots with luminance statistics.

**Evidence**
- World build in about 4 s (sliced behind the loading screen).
- 98 chunks, 665k triangles, about 250 draw calls at golden hour.
- Zero console output across the look-dev set.

**Critique (five weakest things) → action**
1. Pink haze washed out distances → thinner fog, a stronger gold key and a lower violet fill. Fixed.
2. Night read royal blue → indigo palette with lower night exposure and saturation. Fixed.
3. Tower windows were noisy confetti → office floors run in cool and warm whites. Fixed.
4. Flat boardwalk → 0.3 m planks. Fixed.
5. No life: no people, no traffic, no rain particles or lightning, no god rays or flare, no
   shrubs, flat sand. People come from Workstream D, traffic in M4, weather and lens effects in M7.

---

## M2 — Feel slice: driving, on foot, interaction

**Built**
- Five fictional cars on an arcade raycast-suspension model:
  - Bellamar Palmera (convertible);
  - Marsh Gator '84 (pickup);
  - Corsair Hammerhead (muscle);
  - Kaido Brisa (sedan);
  - Corsair Marshal (police).
- Handling model:
  - friction-circle tyres, anti-roll and downforce;
  - a drift latch: a handbrake pull commits to a drift, and otherwise stability control trims
    power oversteer;
  - a drift-angle limiter and slide momentum;
  - roof-scrape recovery and auto-righting.
- Chase camera, engine voices, skid loops, radio, impacts and the horn.
- Flow meter: drifts with a combo, air time, clean landings, near misses (flank rays) and
  flat-out runs fill it; boost burns it; it never punishes a crash.
- On foot:
  - a kinematic capsule on Rapier's character controller, with coyote time and a jump buffer;
  - wall sliding along contact normals;
  - a manual step-up for curbs;
  - wading limits;
  - a shoulder camera with wall pull-in, recentering and a sprint FOV kick.
- Interaction system: one target, sticky, shown as the HUD prompt, tap or hold. "Get in" on any
  parked car: door choice, enter/exit transitions with a camera blend, and bail-outs above 7 m/s.
- The interface is mounted (from Workstream C):
  - click-to-start leads to a main menu over an attract camera;
  - New Game with six looks and difficulty;
  - pause, settings (graphics apply live), save/load with thumbnails, autosave, export/import.
- HudBridge feeds the HUD: clock, weather, cash from the sim, the sim's objective, prompts,
  speed and Flow, the district banner and Flow callouts.
- Photo Mode (F2): tethered free camera, depth of field, exposure, time of day, grades, hiding
  people, watermarked captures.
- Workstreams merged:
  - A, audio: procedural engines, radio, ambience, loudness-calibrated.
  - B, empire sim: 54 + 4 tests; bots hit the pacing targets.
  - C, the interface: 86 tests; a layout matrix of 43 screens × 4 sizes × 3 scales.
  - D, characters: in progress.

**Evidence**
- `npm test`: 134 tests passing; typecheck and project lint clean.
- `qa/drive.mjs all`: every car passes every gate.

  | Car | 0–60 mph | Top | Braking | Skidpad | Handbrake peak | Held drift (mean, kept) | Flow / 2 s drift |
  |---|---|---|---|---|---|---|---|
  | Palmera | 5.0 s | 108 mph | 1.35 g | 0.70 g | 58° | 19°, 0.83 | 0.16 |
  | Gator | 6.25 s | 91 mph | 1.04 g | 0.64 g | 57° | 15°, 0.91 | 0.10 |
  | Hammerhead | 4.5 s | 129 mph | 1.33 g | 0.81 g | 65° | 38°, 1.0 | 0.25 |
  | Brisa | 6.25 s | 91 mph | 1.28 g | 0.67 g | 60° | 6°, 0.95 | (front-drive) |
  | Marshal | 4.25 s | 124 mph | 1.31 g | 0.77 g | 60° | 27°, 0.81 | 0.21 |

- `qa/foot.mjs` gates all pass:
  - walk 1.1, jog 4.2 and sprint 7.0 m/s; stop from a sprint in 0.25 s;
  - jump 0.66 m with 0.45 s of air time;
  - curbs climbed at full jog speed; walls stop the player with no jitter;
  - the camera pulls in to 0.55 m at a wall;
  - "Get in", enter and exit all work.
- `qa/flow.mjs`: click-to-start → menu → New Game → title card → driving HUD → pause, with zero
  console output.
- `qa/photo.mjs`: four looks, a 1.5 MB capture, the clock restored, clean.

**Critique (five weakest things) → action**
1. The car never drew. The paint shader read `modelMatrix` in the fragment stage, which Three
   only declares for vertices. Fixed, and the drive bot now fails on any console error.
2. Handbrake turns spun out to 89° and bled to 3 m/s; the muscle car spun on a skidpad at
   45% throttle. Fixed with the drift latch, stability control, the angle limiter and slide
   momentum. The bot had also measured forward speed instead of ground speed in slides.
3. Vertical rays slipped through the terrain on heightfield grid lines, so ground probes
   returned nothing. Fixed with sub-millimetre ray nudges.
4. The convertible's cockpit was grey boxes, the wheel sat on the passenger side, mirrors
   floated and the fins were shards. Rebuilt from rounded slabs.
5. The player had no body on foot, and convertibles had no driver. Workstream D is building the
   procedural people; seating is wired through `Actor.posture = 'drive'`.

**Also fixed on the way**
- A key pressed and released between two frames never registered; taps now latch until sampled.
- The QA harness rendered idle frames in manual mode and starved the bots: drive runs went from
  timing out to 40 s per car.
- The UI title card held a cutscene input context that large manual steps could not tick past;
  automated runs skip it.
- Cars used to collide with kinematic people as immovable poles; vehicles no longer collide with
  people in the solver.
