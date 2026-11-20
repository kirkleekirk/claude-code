# HOTHOUSE — Architecture

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language / build | TypeScript 7 (strict; unions instead of enums), ES modules, Vite 8 (Rolldown) | `npm run build` emits `dist/` and a double-click `dist/hothouse.html` |
| Rendering | Three.js r187 `WebGLRenderer` (WebGL2), pmndrs `postprocessing` 6, `n8ao` | custom GLSL for sky, water, wet roads, windows, vegetation, grade |
| Physics | Rapier 0.21 (`rapier3d-compat`, WASM inlined) | custom raycast-suspension vehicles; kinematic character controller |
| UI | DOM + CSS custom properties, **Preact 11 + `@preact/signals`** | see below |
| Audio | Web Audio API, all sound synthesized | no audio files |
| Tests | Vitest 5 (logic), Playwright 1.63 + headless Chromium/SwiftShader (visual, functional, soak) | |
| Assets | 100 % procedural (geometry, textures, animation, audio); OFL fonts bundled via `@fontsource` | no runtime network access |

**Why Preact + signals.** The HUD changes every frame (speed, Flow, cash roll-ups) while menus
change rarely. Signals update exactly the text node that changed with no tree re-render, which keeps
UI cost near zero during play; Preact adds JSX and components in ~5 KB with no compiler plugin, so
the same source runs in Vite, Vitest and the single-file build. Solid and Svelte need a compiler
step and offer nothing extra for this workload.

## 2. Layout and ownership

```
src/
  core/        loop, events, rng, math, pools, tunables, i18n, log, flags, scheduler     (foundation)
  input/       devices, action map, contexts, rebinding, glyphs                          (foundation)
  physics/     Rapier wrapper, collision groups, queries, interpolation                  (foundation)
  save/        save slots, migration, export/import, settings store                      (foundation)
  render/      renderer, env (time of day, weather), post, sky, water, materials, geo, fx, reflection
  world/       map data, road graph, lots, buildings, props, landmarks, interiors, chunks, nav
  vehicles/    defs, physics model, mesh builder, chase camera, Flow, damage, boats
  characters/  human builder, animation, appearance, player controller, cameras, portraits
  ai/          traffic, pedestrians, police, wildlife, rival agents
  sim/         the empire simulation: pure TypeScript, no DOM, no Three (headless-testable)
  content/     typed data: strains, effects, additives, rules, customers, crew, missions, events, radio, strings
  audio/       engine, synths, sfx, radio and score, ambience, mixer
  ui/          tokens, components, icons, HUD, phone, menus, overlays
  game/        composition root: boot, modes, interactions, missions runtime, cameras, bridges
  debug/       test harness (`window.__HOTHOUSE__`), tuning panel, perf overlay
tests/         Vitest suites          qa/  Playwright scripts          tools/  project lint, helpers
```

Rules that keep parallel work safe:

- Each module exposes its public surface from **`<module>/api.ts`** (types) and `<module>/index.ts`
  (factory). Other modules import only from those two files.
- Dependency direction: `core` ← everything. `sim` and `content` import nothing but `core`.
  `render` never imports `sim`. `ui` reads `sim` through `game/bridge`. `game` may import anything.
- Module events are added to the bus by **declaration merging** on `GameEvents`, so no shared file
  needs editing to add an event.
- No file over ~800 lines. No god objects. No `console.*` outside `core/log.ts`.
- `tools/project-lint.mjs` enforces line limits, banned strings (placeholder text, to-do markers),
  stray console calls and import direction.

## 3. Time and the loop

```
requestAnimationFrame
 ├─ input.beginFrame()                    sample devices, compute frame edges
 ├─ accumulate dt × timeScale (clamped)   timeScale: 1 play · 0.2 phone · 0 pause
 ├─ while (acc ≥ 1/60)  fixedUpdate(1/60) player, vehicles, physics.step, AI movers
 │     every 6th step   aiTick(0.1)       traffic and pedestrian decisions, police logic
 │     every 30th step  sim.tick(0.5)     empire simulation (plants, jobs, crew, customers, heat)
 ├─ update(dt, alpha)                     interpolate transforms, animation, cameras, particles, audio
 ├─ render()                              shadows → reflection → HDR scene → post → UI viewports
 └─ input.endFrame()
```

- Physics and gameplay movement run at a fixed 60 Hz with render interpolation (`alpha`).
  At most 4 catch-up steps per frame; beyond that time is dropped rather than spiralling.
- **Sim-seconds** drive the empire; the **clock** is derived from sim-seconds through the
  art-directed rate table (`core/clock.ts`). Time skips advance the sim in coarse steps.
- Tab hidden: loop pauses, audio suspends, held keys are cleared. On return, dt is clamped.
- In test mode the harness can take the loop over: `advance(seconds)` steps deterministically.

## 4. State model

| Kind | Lives in | Saved | Notes |
|---|---|---|---|
| **SimState** | `sim/` | yes | plain JSON-serializable data; the only source of truth for the empire |
| World runtime | `world/`, `vehicles/`, `characters/`, `ai/` | player pose, owned vehicles, clock, weather | traffic, crowds and particles are ephemeral |
| Presentation | `render/`, `ui/`, `audio/` | no | derived every frame from the two above |
| Settings | `save/settings.ts` | separately | typed schema drives the Settings UI |

- All player intent reaches the sim through **commands** (`sim.cmd.*`) that validate and return
  `Result` values the UI can explain. The sim emits **events** and marks dirty **channels**;
  `game/bridge.ts` turns those into signals (`simRev.cash`, `simRev.plants`, …) for the UI.
- The sim is deterministic for a given seed and command sequence (seeded `Rng`, saved RNG state).

## 5. Module contracts (binding versions are the `api.ts` files)

- **core** — `EventBus<GameEvents>`, `Rng`, `GameLoop`, `Clock`, `tunables.group()`, `defineStrings()`,
  `log`, `flags`, `TimeSlicer`, math helpers (`damp`, `spring`, `remap` …), `Pool<T>`.
- **input** — action-based: `value(action)`, `down`, `pressed`, `released`, fixed-step latched edges,
  context stack (`gameplay`, `vehicle`, `menu`, `phone`, `minigame`, `build`, `photo`),
  `device` signal, `glyph(action)`, rebinding with persistence, rumble, pointer lock.
- **physics** — `PhysicsWorld`: fixed step, collision groups, static box / trimesh / heightfield
  helpers, allocation-free ray and shape queries, contact events, body ↔ entity lookup.
- **render** — `Gfx`: renderer, scene, camera, `env` (sun, sky, fog, wetness, wind, night factor),
  `mats` (**MaterialKit: every lit material is created through it** so fog, cascades, wetness
  and wind are uniform), `geo` (`MeshBuilder` for merged procedural meshes), `fx` (particles,
  decals, glow cards, light budget), `reflection`, `preview` (3D viewports inside UI), `stats()`.
- **world** — `World`: `map` (districts, turfs, POIs, roads, lots), `nav` (lane graph, sidewalk
  graph, `route()`), `height()`, `districtAt()`, `isWater()`, interiors, chunk visibility, 2D map data.
- **vehicles** — `Vehicles.spawn(def, pose, opts) → Vehicle` with `controls`, `state`, seats, lights;
  `ChaseCamera`; `FlowMeter`.
- **characters** — `Characters.create(appearance) → Actor` (locomotion, clips, look-at, attach,
  expression), `PlayerController`, `ThirdPersonCamera`, `portraitSvg()`.
- **ai** — traffic (lane following, signals, yielding, deadlock recovery), pedestrians (archetypes,
  schedules, reactions), police (patrol, pursuit tiers, search), wildlife.
- **sim** — `Sim`: `state`, `content`, `tick()`, `cmd`, `query`, `skipTime()`, `serialize()`.
- **audio** — `AudioApi`: `unlock`, `sfx`, `ui`, loops, `engine()` voices, `radio`, `score`,
  `ambience`, bus volumes and ducking, listener.
- **ui** — `UiApi`: screen router, HUD model signals, toasts, prompts, phone, dialogue, overlays
  (handoff, mixing, snip chain, build, photo), hints. UI calls back through `GameActions`.
- **save** — slots, autosave, atomic write + backup, validation, migration, export/import; settings.
- **game** — boot sequence, mode machine, interaction system, camera director, mission runtime,
  bridges between sim, world and UI.

## 6. Rendering pipeline

```
env.update(clock, weather)        sun/moon, sky keys, fog, exposure target, grade parameters
shadows                           3 cascades (addon CSM, texel-snapped), PCF
planar reflection (tiered)        mirrored camera at ground level, half-res, reflect layer only
main pass → HDR half-float        sky dome · opaque (merged chunks, instanced props) · water · transparents
N8AO (half-res, tiered)
effects                           god rays · bloom + star flare · DOF (menus/photo) · speed blur · heat haze
final                             eye adaptation · AgX-style tonemap · analytic grade · vignette · grain · dither
preview viewports                 brand turntable, garage, look picker
```

- **Fog is in-material** (height-exponential with forward scattering toward the sun) via the
  MaterialKit shader patch, so transparents and particles fog correctly.
- **Layers:** 0 = world that appears in reflections; 1 = main view only (ground, roads, water,
  small props, particles).
- **Batching:** static world geometry is merged per 128 m chunk per material; one *uber surface*
  material (vertex color + per-vertex roughness/metal/emissive/detail id) covers most opaque
  geometry. Props, vegetation, vehicles' wheels and crowds are instanced.
- **Quality tiers** (Low / Medium / High / Ultra) scale resolution, shadows, reflection, AO, effects
  and draw distance; a first-run benchmark picks one; dynamic resolution holds frame time.
- **Budgets:** ≤ 1,500 draws, ≤ 3–4 M triangles, ≤ 8 real lights, ≤ 512 MB textures.
- Everything is created during loading and pre-warmed (`compileAsync`, texture uploads); nothing
  allocates GPU resources during play.

## 7. Loading

Cooperative, time-sliced on the main thread (`TimeSlicer`, ~10 ms slices) so the loading screen
animates and reports real progress: fonts → physics → renderer → procedural textures → world layout
→ chunk meshes → colliders → vegetation and props → vehicles and characters → audio graph → warm-up.
The main menu runs on the loaded live world.

## 8. Save format

```jsonc
{ "format": "hothouse-save", "version": 1, "savedAt": 0, "playtime": 0,
  "meta": { "slot": 1, "rank": 2, "cash": 1234, "location": "Palmetto Flats", "thumb": "data:image/jpeg…" },
  "sim": { /* SimState */ }, "world": { /* player pose, vehicles, weather */ }, "checksum": "…" }
```

Write path: serialize → checksum → write `key.tmp` → read back and validate → copy current to
`key.bak` → commit. Load path: validate → migrate by version → on failure fall back to `.bak` and
tell the player plainly. Slots: 3 manual + autosave. Export/import as a `.hothouse` JSON file.

## 9. Test harness

Enabled by `?test=1` or `?debug=1` (never visible otherwise). URL flags: `seed`, `time`, `weather`,
`gfx`, `skipIntro`, `pos`. `window.__HOTHOUSE__` exposes:

`ready` · `setTime(h)` · `setWeather(id)` · `teleport(x,y,z | poiId)` · `setCamera(pos, look, fov)` ·
`spawn(kind, opts)` · `advance(seconds)` · `grantCash(n)` · `unlockAll()` · `triggerEvent(id)` ·
`setHeat(n)` · `screenshot(name)` · `perfSnapshot()` · `getState()` · `loadSave(json)` · `input(action, value)`.

The **tuning panel** (`` ` `` in debug mode) lists every `tunables.group()` live: handling, cameras,
lighting keys, post, economy; values can be exported as JSON and pasted back into config.

## 10. Verification

| Layer | Tool | What |
|---|---|---|
| Logic | Vitest | rule-table determinism, economy invariants, save roundtrip and migration, world invariants, nav validity |
| Balance | `npm run sim` | headless economy with casual / optimizer / risk-taker bots → `BALANCE.md` |
| Visual | `qa/shots.mjs` | hero shots and every UI screen at 1280×720, 1920×1080, 3440×1440 |
| Functional | `qa/playthrough.mjs` | new game → harvest → sell → mix → brand → hire → save → reload → verify |
| Layout | `qa/layout.mjs` | overflow / clipping / contrast scan at 4 resolutions × 3 UI scales |
| Input | `qa/gamepad.mjs` | full menu walk with a simulated gamepad |
| Soak | `qa/soak.mjs` | long scripted run; heap, geometry and texture counts flat; zero log entries |

Software rendering makes absolute FPS meaningless, so performance is judged by draw calls,
triangles, per-system CPU milliseconds and memory counts from `perfSnapshot()`.

## 11. Coding standards

- Hot paths allocate nothing: module-level scratch vectors, typed arrays, pooled objects.
- Every `create*` has a `dispose`; listeners are removed; render targets and geometries are freed.
- Tunable numbers live in `tunables.group()` or in `content/`, never inline.
- Strings shown to the player come from string tables (`defineStrings`), formatted with `Intl`.
- Errors never reach the player as exceptions: commands return `Result`, the loop is guarded, and
  `core/log` records problems for the harness (`getState().log` must stay empty in QA).
