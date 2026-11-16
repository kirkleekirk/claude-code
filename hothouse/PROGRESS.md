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
