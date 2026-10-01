# Last Toll — audio list

Every sound effect in the game is synthesized in code right now (`src/core/Audio.js`). Most files below
replace one of those placeholders; the few marked *(new)* would add a sound the game doesn't have yet.
Send them in any order, a few at a time is fine. Anything not supplied keeps its synthesized version.

★ marks the sounds that will make the biggest difference first.

## How to deliver

- **Format:** `.ogg` or `.mp3` (or `.wav`; I'll convert). 44.1 or 48 kHz.
- **Mono** for anything that happens at a place in the world (guns, walkers, footsteps, doors): the game
  positions it in 3D. **Stereo** for ambience beds, music and menu sounds.
- **Trim** the silence off the front; peak around -1 dB. **Loops** must loop without a click.
- **Variations:** where a count is given, that many different takes, so repeated sounds don't sound
  identical (`_01`, `_02`, …).
- **Rights:** only sounds you made or have a licence for (CC0, royalty-free packs such as the Sonniss GDC
  bundles, paid libraries). No sounds ripped from other games.
- **Names:** use the file names below and I'll wire them in. Folder = the heading's folder.

---

## 1. Guns — `weapons/`

One shot per gun, 3 takes each. A close, punchy shot; the game adds distance and the echo off buildings.

| File | Gun | Notes |
|---|---|---|
| ★ `zip_pistol_shot` | Zip Pistol (tier 0) | crude, cracky |
| ★ `pipe_shotgun_shot` | Pipe Shotgun (0) | huge, ragged boom |
| `revolver_38_shot` | Rusty .38 Revolver (1) | |
| `sawed_off_shot` | Sawed-Off Double (1) | |
| `bolt_rifle_old_shot` | Rusted Bolt Rifle (1) | |
| ★ `pistol_9mm_shot` | 9mm Service Pistol (2) | also used by the M17 if no separate file |
| `m1911_shot` | .45 1911 (2) | deeper than the 9mm |
| ★ `pump_shotgun_shot` | Pump Shotgun (2) | also Combat Shotgun if no separate file |
| `lever_carbine_shot` | Lever-Action Carbine (2) | |
| `hunting_rifle_shot` | Scoped Hunting Rifle (2) | long tail |
| `smg_shot` | Compact SMG (2) | short, for full-auto; 5 takes |
| `m17_shot` | M17 Pistol (3) | |
| ★ `ar15_shot` | AR-15 (3) | also M4 if no separate file; 5 takes |
| `m4_shot` | M4 Carbine (3) | 5 takes |
| `combat_shotgun_shot` | Combat Shotgun (3) | |
| `dmr_shot` | Marksman Rifle (3) | |
| ★ `suppressed_pistol` | any pistol with a suppressor | "phut" + slide clack |
| `suppressed_rifle` | any rifle with a suppressor | |
| `scrap_suppressor` | homemade can | still a loud cough |
| ★ `explosion` | pipe bombs, the relay charge | big, with debris |
| `dragons_breath` | Dragon's Breath shells | shot + roaring flame |
| `dry_fire` | empty click | 2 takes |
| `jam` | gun jams | |
| `gunfire_distant` | someone else's fight, far away | 4 takes, stereo, for ambience |

**Bows and crossbows**

| File | What |
|---|---|
| `bow_draw` | string creak while drawing (≈1 s) |
| ★ `bow_release` | twang + arrow whoosh, 3 takes |
| `crossbow_crank` | cocking the crossbow |
| ★ `crossbow_fire` | thunk + bolt whoosh, 2 takes |
| `arrow_hit_flesh` / `arrow_hit_wood` | 3 takes each |

## 2. Reloads and handling — `weapons/`

| File | What |
|---|---|
| ★ `mag_out` / `mag_in` | pistol & rifle magazines, 2 takes each |
| ★ `slide_rack` | pistol slide / rifle charging handle |
| ★ `shotgun_pump` | pump rack |
| `shell_insert` | one shell into a tube or chamber, 3 takes |
| `bolt_cycle` | bolt rifle up-back-forward-down |
| `lever_cycle` | lever-action |
| `cylinder_open` / `cylinder_close` | revolver |
| `round_insert` | one round into a cylinder or magazine, 3 takes |
| `break_open` / `break_close` | break-action guns |
| `brass_eject` | casings hitting the ground, 4 takes |
| `draw_weapon` / `holster` | weapon swap |
| `mod_install` | clicks and a ratchet at the workbench |
| `weapon_break` | a melee weapon snapping |

## 3. Guard energy weapons — `guard/`

| File | What |
|---|---|
| ★ `laser_charge` | rising whine before a shot (≈0.6 s) |
| ★ `laser_shot` | photon pistol / arc carbine, 3 takes |
| `scatter_shot` | Scatter Emitter |
| `beam_lance` | Beam Lance charge + sustained beam (loop) |
| ★ `herder_horn` | the handheld Herder Horn blast |
| `cell_out` / `cell_in` | swapping an energy cell |

## 4. Melee — `melee/`

| File | What |
|---|---|
| ★ `swing_light` / `swing_heavy` | whooshes, 3 takes each |
| ★ `stab_skull` | knife into a head, 3 takes |
| ★ `blunt_skull` | bat / pipe cracking a skull, 3 takes |
| `chop` | machete / axe into flesh, 3 takes |
| `body_hit` | blow to the body, 3 takes |
| `blade_pull_out` | wet pull, 2 takes |
| `hit_helmet` | a blow glancing off a Guard helmet or visor |
| `hit_wall_wood` / `hit_wall_hard` | missed swing into a wall |
| `shove` | pushing a walker back |
| `gore_splat` | 3 takes |
| `head_burst` | a head coming apart |

## 5. The dead — `walkers/`

Mix male and female voices across the takes.

| File | What |
|---|---|
| ★ `groan_idle` | slow, wet groans, 10 takes |
| ★ `growl_chase` | louder, hungrier, 8 takes |
| ★ `snarl_alert` | when one notices you, 4 takes |
| `groan_fresh` | the recently turned: faster, harsher, 4 takes |
| ★ `bite` | teeth + tearing, 3 takes |
| `grab` | lunging grab / struggle vocal, 3 takes |
| `death` | last gurgle, 4 takes |
| `body_fall` | a body hitting the ground, 4 takes |
| `shuffle` | dragging feet, 4 takes |
| `crawl_drag` | a legless one pulling itself along |
| `burning` | shriek + crackle |
| `water_emerge` | climbing out of the swamp |

## 6. The player — `player/`

| File | What |
|---|---|
| ★ `step_dirt` / `step_wood` / `step_metal` | walking, 6 takes each |
| `step_gravel` / `step_grass` | *(new)* 6 takes each |
| `run_dirt` / `run_wood` | running, 6 takes each |
| `step_water` / `wade` | shallow water, 4 takes |
| ★ `breath_heavy` | out of stamina (loop or 3 takes) |
| ★ `hurt` | grunts, 4 takes |
| `bitten_scream` | 2 takes |
| `heartbeat` | low health (loop) |
| `death` | the player dying |
| `eat` / `drink` | 2 takes each |
| `bandage` | cloth tearing and wrapping |
| `pickup` | picking something up, 3 takes |
| `backpack_open` / `backpack_close` | zipper |
| `flashlight_on` / `flashlight_off` | click |
| `guts_smear` | smearing walker guts on yourself |

## 7. Things in the world — `world/`

| File | What |
|---|---|
| ★ `open_drawer` / `open_cabinet` / `open_crate` | wooden containers |
| ★ `open_locker` / `open_filing` / `open_car_trunk` | metal containers |
| `open_fridge` | seal pop |
| `container_doors` | shipping container doors, heavy |
| `door_open` / `door_close` | *(new)* 2 takes each |
| `keycard_ok` / `keycard_denied` | beeps |
| `glass_break` | *(new)* 2 takes |
| `splash_small` / `splash_big` | 2 takes each |
| `fire_crackle` | burning barrel (loop) |
| `charge_beep` | the planted charge's countdown |
| ★ `tower_collapse` | the relay mast groaning and crashing down |

## 8. The Living Guard — `guard/`

| File | What |
|---|---|
| ★ `sweep_siren` | curfew siren, 8–10 s, stereo |
| ★ `herder_pulse` | the mast's horn that drives the dead (long, eerie, 6–8 s) |
| ★ `drone_hum` | searchlight drone (loop) |
| `drone_alarm` | a drone spots you |
| `compound_alarm` | outpost alarm (loop) |
| `radio_chatter` | squelch + garbled voices, 4 takes |
| `soldier_barks` | *(new)* "Contact!", "Moving!", "Clear!", "Reloading!", "Man down!", 2 voices |
| `pa_*` | the PA announcements (see §11) through a megaphone |

## 9. Ambience — `ambience/` (stereo loops, 30–90 s)

| File | Where |
|---|---|
| ★ `wind_light` / `wind_strong` | everywhere, blended by weather |
| ★ `night_insects` | crickets and cicadas, every zone after dusk |
| ★ `swamp_night` | frogs, insects, water — Marais Noir |
| `town_dusk` | distant dogs, a loose sign creaking — Cypress Row, St. Aubin |
| `railyard` | metal ticking, wind through containers — Kessler Rail Yard |
| `outpost` | generator hum, flag, far radio — Guard Outpost 9 |
| `interior_room` | quiet room tone indoors |
| `rain` | light rain (loop) |
| `thunder` | 4 takes (one-shots) |
| `sweep_dread` | a low tension drone while the Sweep is on |
| `water_lapping` | river against pilings and hulls |
| `gator_bellow` / `frog_chorus` | one-shots, 3 takes each |
| `owl` | *(new)* 3 takes |
| `distant_scream` | 3 takes |
| `wood_creak` / `wind_chime` | one-shots, 3 takes each |
| ★ `magnolia_deck` | the riverboat at rest: hull creaks, water on the hull, lamp hiss |

## 10. Menus and the Magnolia's benches — `ui/`

Only the click, error and crafting sounds exist today; the rest are new.

| File | What |
|---|---|
| `click` / `hover` | buttons |
| `error` | can't do that |
| `craft_done` | something made at a bench |
| `item_move` / `equip` | backpack and stash |
| `board_pin` | pinning a destination on the board |
| `page_turn` | captain's log |
| `type_tick` | dialogue typing out |
| `extract_success` | back on the skiff |
| `death_sting` | you died |

## 11. Voices — `voice/` (optional)

The crew and the Guard's loudspeakers speak through the browser's text-to-speech today. Recorded lines
would replace it. I can export a script of every line on request.

- **Remy, Odile, Hale:** 31 dialogue lines + 12 passing barks between them.
- **Guard loudspeakers:** 11 announcements (curfew warnings, the Sweep, the relay alarm), recorded dry;
  the game adds the megaphone and echo.

## 12. Music — `music/` (optional, stereo)

Tracks go in `public/audio/` and are played by `src/core/Music.js`.

| File | What |
|---|---|
| ~~`title`~~ | the title screen. **Done:** `public/audio/title.mp3`, looping on the title, fading out as you board |
| `magnolia` | evenings aboard, quiet (loop) |
| `raid_calm` / `raid_danger` | layered loops the game crossfades by threat |
| `sweep` | the Sweep is coming |
| `extract` / `died` | short stings |
