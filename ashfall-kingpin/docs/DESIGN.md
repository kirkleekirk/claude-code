# Ashfall Kingpin — Design

Post-collapse crime-empire sim fused with a top-down real-time action game. One persistent
128x128-tile world; management happens in an overlay (the Ledger) while the world keeps running.

## Architecture

```
src/
  core/      rng (mulberry32, hash noise), util
  data/      ALL content tables: palette, places (master plan), strains, blueprints, mods,
             items, businesses, enemies, events, contracts, perks, achievements, vehicles, ranks
  world/     tiles, layout (module kit + templates), worldgen, pathfind (A*), validator
  sim/       pure simulation (no DOM): state, time, economy, grow, craft, crew, business,
             heat, rivals, events, contracts, progression, tutorial, endgame, save, bot
  action/    real-time layer: entities, player, weapons, AI, missions, vehicles, minigames
  render/    canvas pipeline: font, terrain chunk baking + autotile, structures, paperdoll,
             icons, lighting, particles, camera
  ui/        immediate-mode canvas UI kit, HUD, Ledger tabs, dialogs, menus
  audio/     WebAudio synthesis: SFX + adaptive generative music + ambience
  input/     keyboard/mouse/gamepad with rebinding
  main.js    boot + fixed 60 Hz loop
```

* **Sim/render split.** Everything under `sim/`, `world/`, `data/`, `core/` is DOM-free and imported
  directly by Node tools (`tools/sim.js`, `tools/layout-validate.js`). The browser bundle uses the same files.
* **State.** One plain-JSON object `S` holds the whole game (money, crew, plots, guns, markets, rivals…).
  Transient runtime data lives in `_`-prefixed keys and is stripped on save. RNG state is `S.rng` (an int),
  so a save restores the exact random stream.
* **Time.** Fixed 60 Hz update. 1 game day = 6 real minutes at 1x (1 game minute = 0.25 s). The sim
  advances in whole game minutes; hourly ticks drive growth/crafting/sales, dawn (06:00) drives wages,
  rent, tribute, decay, rival turns, events, the newspaper and the autosave.
  During action missions the clock runs at 1/4 speed so a 3-minute raid costs ~3 game hours.
* **Bundling.** `node build.js` resolves the ES-module graph from `src/main.js`, wraps each module in a
  closure, inlines everything into `dist/ashfall-kingpin.html` (no external fetches) and fails if the
  layout validator fails or the file exceeds 3 MB.

## World & layout (section 3)

* 16 px tiles, integer zoom chosen to fit the window (2x–4x, ~640x360 logical px).
* 128x128 tiles in 16x16-tile chunks pre-baked to canvases. Biomes from a hand-painted 32x32 map,
  upsampled with seeded edge noise. Terrain transitions use a 4-edge + 4-corner neighbour mask
  (16-neighbour autotile) with generated overlay masks, cached per (terrain, mask).
* **Module kit:** wall, corner tower, gate, door, window, roof, floors, fence, crate stack, barrel, bench,
  lamp, sign, banner, stall, well. A building is a record
  `{x, y, w, h, doors:[{x,y,f}], role, roof, style(palette), propsWanted}` — the brief's
  `{footprint, doorTile, doorFacing, interior, roofStyle, propSlots, materialPalette}`.
* **Settlement template:** perimeter wall, 3-wide gate on the main axis, 1-wide service lane ring,
  HQ/vault at the far end of a 3-wide main street (front door on the street, back door on the lane →
  two approach routes), plaza with market stalls, cross street for M+. Lots are packed with a setback
  packer: footprints keep a 1-tile setback from streets and each other, doors face the street with the
  most frontage. Places are generated in a local frame (gate at bottom) and mirrored/transposed into
  the world, so geometry is identical everywhere and only palettes/props/population differ.
* **Validator** (`world/validator.js`): anchors within ±4, integer coordinates, no overlapping places or
  buildings, no road inside a footprint, every door fronts a street, every door A*-reachable from its gate,
  vault reachable through each door independently, ruin loot reachable, every place reachable from the Hollow.

### Master plan (tile coords, top-left of footprint)

| Place | Kind | Footprint (x,y,w,h) | Gate |
|---|---|---|---|
| The Hollow | HQ | 46,90,36,32 | N (+rail gate S) |
| Millbrook Rest | S | 18,90,24,20 | N |
| Copper Gate | M | 88,71,32,26 | W |
| Harbor Nine | M | 4,49,32,26 | E (sea to the west) |
| Saint Verity | M (rotated 26x32) | 13,14,26,32 | S |
| The Foundry | L (rotated 32x40) | 94,18,32,40 | S |
| New Haven | XL | 40,2,52,40 | S |
| Crossroads Market | market | 55,57,18,14 | N/S/E/W |
| Rustjaw Fort | camp | 88,106,16,12 | N |
| Pale Hand Warehouses | camp | 4,76,16,12 | S |
| Ash Choir Cathedral | camp | 73,48,14,12 | S |
| 8 ruins (tiers I–IV) | ruin | see `data/places.js` | open side |

Roads: a 3-wide ring road (44..90 x 44..86 with an east jog), four spokes into the Crossroads,
spurs to every settlement gate; 2-wide dirt tracks to camps and ruins.

## Simulation (sections 4–5)

* **Money.** `dirty` (stash at the Hollow), `carried` (on your person, 15% lost on death), `clean`
  (front accounts; `frozen` during audits). Black-market goods accept dirty; legit purchases
  (businesses, permits, council seats, tribute, clean-wage crew) need clean.
* **Heat.** Per settlement 0–100 plus global Notoriety (weighted max). Levels: Quiet/Watched/Hunted/
  Wanted/Crackdown with the brief's consequences. Sources and sinks exactly as briefed.
* **Weed chain.** Plot (water/light/nutrients/health) → harvest → dry (6 h) → cure (10 h,
  x1.0–1.4 by curer Farming) → pack (baggie 1 unit / jar 4 / brick 24). Price formula from the brief;
  saturation +0.5·units/dailyDemand, −0.12/day.
* **Gun chain.** Smelter (scrap→iron→steel) → Parts Lathe (5 component types × 4 materials × 1–5 stars)
  → Ammo Press → Assembly Bench (blueprint + 5 components + up to 5 mods). Stats =
  base × component multipliers × mods; grade from mean stars + gunsmith roll.
* **Crew.** 9 skills, 2 traits (hidden until vetted), wage, loyalty, morale, fatigue; stations, dealers,
  squads, managers (Leadership-driven automation).
* **Businesses & laundering.** 11 types; capacity `0.8·legitRev·(1+0.1·acct)`, wash 1–3 days,
  fee `max(8%, 25%−2%·Bookkeeping)`, audit risk `+(excess/legitRev)·15%/day`.
* **Rivals.** Three gangs with their own strength/wealth/arms and a daily AI choice
  (expand, raid convoy, raid Hollow, undercut, poach, negotiate). Diplomacy: truce/tribute/alliance/war.
* **Endings.** Crown (hold 3, repel Operation Daybreak, storm the Council Hall) or Ledger (hold 3,
  $2M clean assets, buy 7 of 12 council seats). Sandbox continues after credits.

## Action layer (section 5.4)

Real time in the same world. Guns behave by stat (spread, recoil, falloff, ammo, jams, noise radius,
suppressors), bullets are pooled projectiles stopped by FULL/LOW tiles. AI: finite state machine
(Calm → Suspicious → Hunting → Retreat/Search) with vision cones, hearing, squad calls, flanking.
Raids are planned at the Job Board (approach, recon, crew, loadout, getaway, timing) and executed in
the world, or delegated (abstract resolution used by the headless sim).

## Determinism & testing

`tools/sim.js` runs the pure sim with a greedy bot (same action API as the UI) for N days with a fixed
seed; `tools/smoke.js` drives the built HTML in headless Chromium (boot, tutorial bot, UI crawl,
save round-trip, endings, perf).
