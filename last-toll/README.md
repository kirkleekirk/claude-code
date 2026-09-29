# Last Toll

A first-person zombie extraction survival game with physical, close-up melee and hand-worked guns,
built for desktop first with the architecture laid out for VR (WebXR) next.

You live aboard the *Magnolia*, a beached paddle steamer at the edge of a flooded Louisiana parish.
The parish belongs to the dead, and to the **Living Guard**: a vast army that rose to rebuild the
country, running colonies coast to coast on technology seized from sealed government vaults. The
garrison out here was cut off from its command long ago. Its soldiers still wear the insignia, but
they treat everyone outside their walls as infected.

Between trips you walk the Magnolia's deck: pick a destination on the rolling bulletin board, build
and mod your weapons at the benches, cook, patch yourself up, and cast off from the skiff at the port
gangway. Each trip starts on that skiff. You scavenge the drowned streets, fight the dead up close, and get back
to the water before curfew. At curfew the Guard runs its **Sweep**: the horns on their herder mast
drive every dead thing in the sector ahead of laser-armed soldiers and searchlight drones. Die out
there and everything you carried stays behind.

The city, the textures and the sound effects are generated in code. The character rig comes from an
open-licensed avatar pack (see Credits), and the only other asset file is the title theme
(`public/audio/title.mp3`).

## Run it

```bash
cd last-toll
npm install
npm run dev          # http://localhost:5173
```

`npm run build` writes a static build to `dist/` that any web server can host.
`npm run build:artifact` writes a single-file page to `dist-artifact/last-toll.html` (three.js is loaded from jsDelivr).

Needs a desktop browser with WebGL2, a mouse and a keyboard. Headphones help: walkers are positional.

## Controls

| Input | Action |
| --- | --- |
| WASD / Shift / C | Move / sprint / crouch |
| Left mouse | Swing or stab (hold to wind up a harder blow) · fire |
| Right mouse | Aim down sights (guns) · grab (melee) |
| Q | Grab a walker by the collar with your off hand; release to shove it away |
| V | Shove · mash to break free when grabbed |
| R | Reload one step at a time (hold to run the whole sequence) |
| E | Search containers · take items · pull a stuck blade · smear guts |
| 1–4 / wheel | Sheath · hip · holster · shoulder |
| F / H | Flashlight / quick heal |
| Tab / M / Esc | Backpack / map / pause |

Aboard the Magnolia: WASD to walk, E to use a station or talk to the crew, Tab for the stash, Esc for the
menu. At a bench, W/S browse, A/D switch categories or mod slots, Enter builds, Esc leaves. In a
conversation, 1–4 pick a reply, Space skips a line, Esc walks away.

## The story

Three people live aboard the Magnolia with you:

- **Remy Theriot**, her captain, who ran her up the bayou when the levees went and keeps the board.
- **Odile Marchand**, a nurse from Marais Noir, who runs the infirmary and will patch you up once a day.
- **Staff Sergeant Isaac Hale**, a signals NCO who deserted the Living Guard's 9th Garrison and is
  living on the aft deck.

Hale believes the 9th's Sweeps were never ordered by the Guard's command, and he wants proof. The questline
runs through the existing places: dog tags off dead Guardsmen, a radio codebook from a keycard locker at the
St. Aubin Quarter checkpoint, a priest's ledger hidden in the chapel at Marais Noir, and finally a
demolition charge (built at the workshop from Hale's plans) planted on the relay mast inside Guard Outpost 9.

The relay drives every herder horn in the parish. When it falls, it stays down: the herder mast on the skyline
goes dark, the Sweep has no horns to drive the dead in from the edges, and the 9th Garrison makes up for it
with more soldiers and more drones.

The current objective sits at the top left, aboard and ashore; a gold marker points at the person or bench
it names, a compass marker points at the locker, chest or mast in a raid, and a yellow note on the bulletin
board marks where to go. The captain's log keeps the story so far.

## How it plays

- **Everyone is built on one rig.** The crew, the Guard and the dead share a skeleton and its animations,
  with painted faces and gear fitted to the body. The dead are blocky by default; the captain's log has a
  setting to make them look like the living instead.
- **The dead only die when the brain goes.** Body hits stagger, knock down, or take legs (crawlers).
- **Physical melee, translated to a mouse.** Hold to wind up; power comes from the swing and your stamina.
  A weak stab glances off the skull. Blades lodge in heads and have to be wrenched out (hold click and drag
  down, or mash). Switch weapons and the blade stays in the corpse until you come back for it.
- **Grab and stab.** Grab a walker by the collar, hold it at arm's length while your stamina drains, and
  drive the blade up under its jaw. It's also the only melee answer to a riot helmet (or rip the helmet off).
- **Getting grabbed is dangerous.** Break free, kill it, or get bitten. Three grabbers at once is a death sentence.
- **Manual reloads.** Drop the mag, seat a fresh one, rack the slide. Swing out the revolver cylinder and load
  rounds one at a time. Pump the shotgun, work the bolt, crank the crossbow.
- **Noise draws them.** Gunshots are heard 50–85 m away. Suppressors and the crossbow keep things quiet.
- **Covered in guts.** Smear a corpse's guts on yourself and the dead ignore you until you attack.
- **Durability, stamina, hunger.** Weapons break and guns jam as they wear. Hunger caps your maximum health.
- **The Sweep.** A hard clock. When curfew hits, the herder mast's horns wake the sleepers and push hunters
  in from the edges, drones go up, and a sweep team comes looking. Later the sector is overrun.
- **The Living Guard.** Soldiers on posts and patrols with experimental laser weapons. They burn the dead
  that get close, hunt you by sight and sound, and call in everyone nearby when they spot you. Take them
  from behind with a blade, or knock them down with a shock baton. They carry energy cells, and keycards
  that open their weapons lockers. Their guns reload by ejecting a spent cell, seating a fresh one and
  priming the coil.
- **Weapon tiers.** Tier 0 guns are scrap-built (pipe shotgun, zip pistol, scrap bow, makeshift crossbow).
  Tier 1 are good handmade or worn commercial guns (rusty .38, sawed-off double, an old bolt rifle, a hunting
  bow). Tier 2 are store-bought (9mm, .45 1911, pump shotgun, lever carbine, scoped rifle, SMG). Tier 3 are
  military (M17, AR-15, M4, combat shotgun, marksman rifle). Experimental weapons are Living Guard tech (photon
  pistol, arc carbine, scatter emitter, beam lance, herder horn, thermal knife). Loot follows the zone: the
  better tiers turn up in harder places and in military crates, and Experimental only on the Guard.
- **The weapon workbench.** Every gun has mod slots (sights, muzzle, barrel, magazine, stock, grip, special).
  Point at a part of the gun on the bench to see what fits there; hover a mod to bolt it on and compare the
  numbers before you build it. Scrap guns take shoddy parts with real drawbacks, but also the expensive,
  overpowered specials: a Dragon's Breath cylinder that sets the dead alight (and the fire spreads from one to
  the next), a tungsten rechamber that punches through armour, rebar slugs, pipe-bomb bolts, a twin trigger.
  Military guns take clean, dependable attachments, with a few exceptions like a drop-in auto sear or Frag-12
  rounds. Mods you remove go in the parts drawer and cost nothing to refit.
- **The Magnolia.** A walkable riverboat hub. The workshop builds hand-made weapons and gear, the reloading
  bench makes ammunition, the infirmary and galley make medicine and food, the recycler breaks down salvage,
  and the trunk in the salon is your stash. Benches work like Fallout's: pick a recipe, see what it needs, and
  if you're short on a component the bench breaks your salvage down to cover it.

Five areas, each generated fresh every trip:

| Area | Threat | Time | What's there |
| --- | --- | --- | --- |
| Cypress Row | 1 | dusk | Shotgun houses, overgrown yards, a small cemetery. Food, cloth, salvage. |
| Kessler Rail Yard | 2 | dusk | Warehouses and freight containers, a Guard patrol. Tools, metal, powder. |
| St. Aubin Quarter | 3 | dusk, storm | Shops, a clinic, raised tombs, a fallen Guard checkpoint full of armoured dead. |
| Marais Noir | 3 | night, storm | A fishing village on stilts over the black water. Boardwalks, shacks, a chapel with the Guard's gallows. The dead climb up out of the swamp, and anything shoved off the edge goes under. |
| Guard Outpost 9 | 4 | night | A forward base behind HESCO walls: floodlights, soldiers on the gates, drones before the Sweep, and lockers full of their tech. |

Every container is a hollow shell with real shelves, drawers and lids. Loot rests on those surfaces,
scaled to fit, and drawer contents ride out with the drawer, so the same containers work when you open
them by hand in VR.

## Code layout

```
src/
  main.js              app shell: title → hub → raid → summary
  core/                input, procedural audio, music, seeded RNG, math
  data/                items, loot tables, recipes, zones, the story and crew dialogue
  world/               city and stilt-town generators, decals, collision + nav/flow fields,
                       sky/fog/water/mist, models, batching
  entities/            player, walkers, horde AI, Living Guard soldiers and drones, the Magnolia's crew;
                       WalkerModel.js puts every one of them on the avatar rig
  entities/avatar/     the character bodies: avatar-style people on one rig with painted faces, fitted
                       gear, a pose layer (reaching dead, rifles held, arms folded) and the blocky dead
  assets/avatarData.js the rig, body parts and animations those bodies use (generated; see below)
  combat/              combat rules and the first-person view model
  game/                raid and hub orchestration, weapon stats and mods, container specs, loot,
                       inventory, profile/saves
  scenes/Magnolia.js   the walkable riverboat: deck, salon, stations and their camera framings
  ui/                  HUD, backpack, map, styles; ui/hub/ holds the station panels
```

Saves live in `localStorage` (`lasttoll.save.v1`).

Every sound effect is synthesized in `core/Audio.js` for now. [`docs/AUDIO.md`](docs/AUDIO.md) lists the recorded
sounds that would replace them, with file names. Music tracks go in `public/audio/` and are played by
`core/Music.js`; the title theme starts on the title screen and fades out as you board the Magnolia.

## Road to VR

The desktop build is structured so WebXR can slot in without rewriting the game rules:

- **Hit resolution is input-agnostic.** Melee is resolved from an origin, a direction and a power value;
  on desktop the power comes from the wind-up, in VR it will come from controller velocity at contact.
- **Input is read as intents** (`core/Input.js`), so an XR controller backend can feed the same actions.
- **The view model is isolated** (`combat/ViewModel.js`). In VR it gets replaced by tracked hands, with the
  same weapon models attached to the controller grips.
- **Stations are physical.** Every bench on the Magnolia is an object with a camera framing and a spot on the
  bench where the item sits. The weapon workbench marks each mod slot on the gun itself, so in VR you can
  point at (or touch) the barrel to see barrels.

Next steps for the VR build:

1. Enable `renderer.xr`, add an Enter VR button, and parent the camera to an XR rig.
2. Map controllers to hands; drive melee power from hand velocity and blade direction.
3. Body holsters (hip, shoulder, chest) and an over-the-shoulder backpack for physical inventory.
4. Physical reloads: magazine and shell insertion by hand proximity, slide/pump by grip-and-pull.
5. Two-handed aiming for long guns, physical grab of walker collars and helmets.
6. Comfort options: snap/smooth turn, teleport or smooth locomotion, tunneling vignette.

## Credits

The character rig, body meshes and animations in `src/assets/avatarData.js` are derived from Microsoft's
Avatar Animation Pack and Avatar Rig for XNA Game Studio 4.0, used under the Microsoft Permissive License.
See [`LICENSE-avatar.txt`](LICENSE-avatar.txt) for the full license and notices, and
`tools/avatar/build-avatar.mjs` for how the file is built from the pack's FBX files. The faces, gear,
colours and blocky bodies are this project's own.

The title theme (`public/audio/title.mp3`) was made for the game by its author.

---

An independent project. Its melee and reload feel is inspired by *The Walking Dead: Saints & Sinners*;
its world, story and characters are its own. Not affiliated with Skydance Interactive, AMC or Microsoft.
