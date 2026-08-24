# Building CastleMiner Z

There are three builds in this repository, for three different reasons.

| Build | Runs on | Needs | Purpose |
|---|---|---|---|
| `desktop/` | Windows, macOS, Linux | .NET 8 SDK | Playing and testing it |
| `CastleMinerZ.Xbox360` | Xbox 360 | Windows, VS2010, XNA GS 4.0, dev console | The original target |
| `CastleMinerZ.Windows` | Windows | VS2010, XNA GS 4.0 | XNA iteration without a console |

All three compile the same sources from `src/`.

---

## 1. Desktop — the one you can just run

```bash
tools/run.sh
```

That is the whole procedure. It needs the [.NET 8 SDK](https://dot.net) and nothing else:
no XNA, no Visual Studio, no content pipeline, no shader compiler, no asset downloads.

The reason it is that simple is that the game has essentially no content. Textures, sound
effects and the font are all generated in code at startup by `src/Assets`, and the desktop
renderer uses the framework's built-in `AlphaTestEffect` and `BasicEffect` rather than the
custom `Voxel.fx`. MonoGame can only compile an effect through a tool that needs Wine on
anything but Windows, and requiring that would have defeated the purpose.

What the desktop renderer gives up against the XNA one:

- **No flashlight cone.** It is a per-pixel effect with no fixed-function equivalent.
- **No water surface animation.** Same reason.
- **Day/night costs a re-mesh.** The XNA build stores sky light per vertex and scales it in
  the shader, so a full day is free. Here the lighting is folded into vertex colours at
  upload, so the world is rebuilt when the sun has moved far enough to matter. The
  threshold and mesh budget are in `ChunkWorker`.

Everything else is identical, because it is the same engine.

### Useful switches

`tools/run.sh` passes arguments through to the game:

```bash
tools/run.sh --seed 4242            # start a specific world immediately, skipping the menu
tools/run.sh --debug                # frame rate, queue depths, draw counts, pool occupancy
tools/run.sh --fullbright           # ignore baked lighting, to separate geometry faults from lighting ones
tools/run.sh --dump-assets ./art    # write the generated textures and font out as PNGs
```

### Rendering without a display

`tools/screenshot.sh` runs the game under Xvfb with software OpenGL and writes a PNG. This
is how the renderer is verified on a machine with no GPU and no window server, and how the
screenshots in the README were produced.

```bash
tools/screenshot.sh out.png                             # title screen
tools/screenshot.sh out.png --seed 4242 --warmup 12     # a world, twelve seconds in
tools/screenshot.sh out.png --seed 1 --time 0.05        # the same world at night
```

---

## 2. Xbox 360 — the real target

### Prerequisites

XNA Game Studio 4.0 was retired by Microsoft, so this is a period-correct toolchain:

- Windows (7 through 11; XNA 4.0 installs on modern Windows with the community installer)
- **Visual Studio 2010** — XNA Game Studio 4.0 does not integrate with later versions
- **XNA Game Studio 4.0** ([refresh installer](https://www.microsoft.com/download/details.aspx?id=23714))
- To deploy to a retail console: an **Xbox 360 dev-unlocked** with the XNA Game Studio
  Connect app, paired to the development machine

There is no font or texture prerequisite. The content project builds exactly one asset —
`content/Shaders/Voxel.fx` — so there is nothing to install and nothing to go missing.

### Steps

1. Open `CastleMinerZ.sln` in Visual Studio 2010.
2. Set the solution platform to **Xbox 360**.
3. Set **CastleMinerZ.Xbox360** as the startup project.
4. Connect the console: *Tools → Options → XNA Game Studio → Xbox 360 → Add Device*, and
   enter the key from XNA Game Studio Connect on the console.
5. Build and run (F5).

If the effect fails to compile, check that `<XnaProfile>HiDef</XnaProfile>` is still set in
the game project — `Voxel.fx` targets `vs_3_0` / `ps_3_0`, which Reach does not allow.

---

## 3. Windows (XNA)

Same solution, platform **x86**, startup project **CastleMinerZ.Windows**. Differences from
the console build are compile-time: mouse and keyboard input, a larger default view radius,
no processor affinity on the workers, and saves to a plain file rather than through the
storage device selector.

---

## Tests

```bash
dotnet run --project tests/CastleMinerZ.Tests.csproj      # 122 assertions
./tools/check.sh                                          # compile check only
```

Everything below the renderer — generation, lighting, meshing, physics, inventory,
crafting, saving — has no device dependency, so the suite exercises it directly.

Both the desktop and test projects pin `<LangVersion>4</LangVersion>`, which is what the
VS2010 C# compiler accepts. That is a deliberate guard rail: without it, it is very easy to
write modern C# that builds locally and then fails on the actual target.

What the tests cannot cover is anything that needs a graphics device. That gap is real —
the first time this was actually run, chunk geometry was being built correctly and then
never uploaded to the GPU, and every test still passed. `tools/screenshot.sh` exists to
close it.

---

## Regenerating the art

The art is generated by the game itself, so there is nothing to run as a build step. To
inspect it, or to regenerate the console's title thumbnail:

```bash
tools/run.sh --dump-assets ./art
```

This writes the block atlas, the item icon atlas, the particle sprite, the font sheet and
`GameThumbnail.png`. The generators are seeded, so the output is identical on every run and
on every platform.

`src/Assets/TextureFactory.cs` is the single definition of the atlas layout — the block and
item registries alias its tile constants rather than restating them, and a test checks that
every tile a registry references is one the generator actually draws.

---

## Performance notes for the console

If the frame rate is not holding, these are the knobs, roughly in order of effect:

1. **View radius** (`Constants.ViewRadiusColumns`, default 6, exposed in Options). Resident
   chunk memory grows with the square of this, and so does the visible draw call count.
2. **World height** (`Constants.SectionsPerColumn`, default 8 → 128 blocks). Dropping to 6
   saves a quarter of the voxel memory and speeds up every column's lighting pass.
3. **Mesh jobs per frame** (`ChunkWorker.MeshJobsPerFrame`) and **columns integrated per
   frame** (currently 2). Lighting a column is the expensive part of integration.
4. **Enemy population budget** (`EnemyManager.PopulationBudget`).

The debug overlay (Options → Debug Overlay, or `--debug`) shows frame rate, resident
columns, both worker queue depths, drawn sections and triangles, live particle and enemy
counts, pool occupancy, and managed heap size. Watch the pool numbers in particular: if the
live count climbs without the free count recovering, something is leaking chunk arrays.
