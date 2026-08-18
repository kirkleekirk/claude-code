# CastleMiner Z

A voxel survival game for the **Xbox 360**, built on XNA Game Studio 4.0 — the same
stack the original Xbox Live Indie Games title shipped on.

Mine, build, and survive. The world is flat, endless, and gets worse the further you
walk from where you started. Everything that scales — which creatures spawn, how hard
they hit, which ores exist in the ground — reads from one number: your distance from
spawn. Diamond does not generate near the origin. Dragon stone does not generate until
six kilometres out, in the part of the map that is on fire and has dragons in it.
The only way to get better gear is to go somewhere that wants you dead.

---

## What's in it

**World**
- Infinite streaming voxel terrain, 128 blocks tall, generated from a seed
- Simplex-noise continents, hills and ridged mountains, blended by a mountain mask
- Six biomes (plains, forest, desert, frozen wastes, mountains, scorched lands)
- Connected cave systems, ore veins, lakes, frozen seas, trees, surface lava
- Flood-filled sky and block lighting with smooth vertex lighting and ambient occlusion
- Full day/night cycle that costs zero re-meshing — sky light is scaled in the shader
- Water, glass and ice in a sorted transparent pass; leaves and torches alpha-tested

**Playing**
- First-person movement: walk, sprint, crouch, jump, swim, auto-step over low ledges
- Mine any block with the right tool tier; place any block you are carrying
- Fall damage, drowning, lava, and slow out-of-combat regeneration
- Handheld flashlight, because caves are genuinely dark

**Progression**
- 27 block types, 40+ items, 42 crafting recipes
- Four tool tiers (stone → iron → diamond → dragon), each gated on an ore that only
  generates past a certain distance
- Six firearms — pistol, shotgun, assault rifle, sniper, rocket launcher, laser rifle —
  with magazines, reloading, recoil, spread, and craftable ammunition
- Rockets that blow real craters in the terrain

**Danger**
- Zombies, runners, skeletons and hell spawn, spawning by darkness and by tier
- Sunlight burns the undead, so daytime is a genuine reprieve
- Dragons: a flying boss that circles, strafes, breathes fire, and drops the dragon
  stone you need for the best gear in the game
- Drop your inventory where you die (optional), which is what makes a long trip a real
  decision rather than a formality

**Console specifics**
- 1280x720, HiDef profile, no MSAA (see *Design notes* for why)
- Terrain generation and meshing on hardware threads 3 and 4, pinned
- Saves through the guide's storage device selector
- Title-safe HUD layout
- Controller-disconnect pause, as the platform requires
- Four-player Xbox LIVE co-op over `NetworkSession`, host authoritative

---

## Controls (Xbox 360)

| Input | Action |
|---|---|
| Left stick | Move |
| Right stick | Look |
| **A** | Jump |
| **B** | Crouch |
| **X** | Reload |
| **Y** | Inventory |
| **RT** | Mine / attack / fire |
| **LT** | Place block |
| **LB / RB** | Cycle hotbar |
| **L3** | Sprint |
| **R3** | Flashlight |
| **BACK** | Crafting |
| **START** | Pause |

The Windows build additionally accepts WASD, mouse look, `1`–`8`, `R`, `F`, `TAB`, `C`
and `Esc`.

---

## Design notes

A few decisions are worth calling out, because they are the ones the whole codebase
bends around.

**The vertex format is 12 bytes.** Terrain vertices pack a chunk-local position in
quarter-block units, an atlas tile index with a 0/1 corner selector, and baked light,
and the shader unpacks all of it. A naive position/normal/uv/colour layout would be
36 bytes; at a full view radius that difference is tens of megabytes on a console with
512 MB total, and the 360's vertex fetch is bandwidth bound, so the small format is
also the fast one.

**Every chunk shares one index buffer.** The quad index pattern is identical for all of
them. Giving each section its own would cost roughly 30 MB for no benefit.

**Light is baked per-vertex, night is applied in the shader.** Sky level and block level
are stored as separate 4-bit channels and scaled by a sun-intensity uniform at draw
time, so a full day/night cycle never touches a vertex buffer.

**Nothing allocates during play.** The Xbox 360 CLR runs a non-generational collector
roughly every megabyte allocated, which is a visible hitch. Voxel arrays, mesh scratch
buffers and mesh jobs all come from pools; particles, projectiles and dropped items are
fixed-capacity arrays; the random number generators are structs.

**Workers never read live world state.** Terrain generation is pure computation and runs
entirely on a worker thread. Meshing runs on a worker too, but from an 18³ snapshot the
main thread captured, so no worker can race a block edit or a column eviction. A version
counter per section catches the case where the world changed while a mesh was in flight.

**Player edits outlive their chunks.** The edit table is owned by the world, not by the
columns, keyed by column and packed local index. Build a base at the edge of your view
distance, walk away, and it is still there — and it is the only thing the save file
stores about terrain. Everything you did not touch is reproduced from the seed, which
is what keeps a heavily explored world down to a few hundred kilobytes.

**No MSAA.** The 360 has 10 MB of EDRAM, which holds a 720p colour and depth buffer
without tiling. Turning on multisampling forces predicated tiling, which means
submitting the entire scene twice. For a renderer whose cost is dominated by chunk draw
calls, that is the most expensive setting available.

---

## Repository layout

```
castleminer-z/
  CastleMinerZ.sln                 VS2010 solution (Xbox 360 + Windows + content)
  CastleMinerZ.Xbox360/            Xbox 360 game project — the shipping target
  CastleMinerZ.Windows/            Windows game project, same sources by link
  content/                         XNA content project and all source assets
    CastleMinerZContent.contentproj
    Shaders/Voxel.fx               Terrain and water, vs_3_0 / ps_3_0
    Textures/ Audio/ Fonts/        Generated assets (see tools/)
  src/                             The entire engine and game, shared by both projects
    Core/                          Constants, pooling, input, settings
    World/                         Chunks, generation, lighting, meshing, streaming
    Entities/                      Player, enemies, dragon, projectiles, drops
    Items/                         Items, inventory, crafting
    Graphics/                      Camera, terrain renderer, sky, entities, particles
    UI/                            Screen stack, HUD, menus, inventory and crafting
    Save/  Net/  Audio/            Persistence, LIVE co-op, sound
  tools/                           Asset generators and the compile-check script
  desktop/                         MonoGame project used to compile-verify on CI
  tests/                           Headless engine test suite
```

---

## Building

See [BUILD.md](BUILD.md). Short version: open `CastleMinerZ.sln` in Visual Studio 2010
with XNA Game Studio 4.0 installed, pick the `Xbox 360` platform, and deploy.

---

## Verification status

Being straight about what has and has not been run:

- **Compiles clean** against the XNA 4.0 API surface, at C# language level 4 (what
  VS2010 accepts), verified through the MonoGame-based project in `desktop/`.
- **110 assertions pass** in `tests/`, headless: noise determinism, terrain
  well-formedness, distance-gated ore, lighting propagation and unwinding, mesh packing
  bounds, raycasting, player collision and step-up, inventory and crafting arithmetic,
  edit persistence across chunk eviction, a save/load round trip, and a run of the whole
  session loop — walking, mining, and a night's worth of enemy spawning — driven by
  synthetic input. A further set checks the couplings that have no compile-time check:
  every atlas tile index a registry references against a manifest of the tiles the
  generator actually draws, and the two shared constants in `Voxel.fx` against their C#
  counterparts.
- **Not run on hardware.** Building the Xbox 360 configuration needs Windows, Visual
  Studio 2010 and XNA Game Studio 4.0; deploying to a console needs a dev-unlocked
  360. None of that exists in the environment this was written in, so the shader, the
  content build and the on-console frame rate are unverified. The `desktop/` project
  compiles the same sources but does not ship the built content, so it is a compile
  check, not a playable build.

One bug the test suite caught during development, as an illustration of what it covers:
sections below the terrain were reporting full sunlight, because the sunlight column
pass exited early and left their light arrays unallocated — and "unallocated" is a
memory optimisation that means *full sky*, which is only true above ground.
