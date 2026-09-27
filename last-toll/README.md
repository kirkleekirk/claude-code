# Last Toll

A first-person zombie extraction survival game with physical, close-up melee and hand-worked guns,
built for desktop first with the architecture laid out for VR (WebXR) next.

You live aboard the *Magnolia*, a beached paddle steamer at the edge of a flooded Louisiana parish.
The parish belongs to the dead, and to the **Living Guard**: a vast army that rose to rebuild the
country, running colonies coast to coast on technology seized from sealed government vaults. The
garrison out here was cut off from its command long ago. Its soldiers still wear the insignia, but
they treat everyone outside their walls as infected.

Each trip starts on a skiff. You scavenge the drowned streets, fight the dead up close, and get back
to the water before curfew. At curfew the Guard runs its **Sweep**: the horns on their herder mast
drive every dead thing in the sector ahead of laser-armed soldiers and searchlight drones. Die out
there and everything you carried stays behind.

Everything is procedural: the city, the models, the textures and every sound are generated in code.
There are no asset files.

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

## How it plays

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
- **The hub.** Stash, workbenches you upgrade (weapons, ammo, infirmary, galley), a recycler for salvage,
  backpack upgrades, and contracts that only pay if you make it back.

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
  core/                input, procedural audio, seeded RNG, math
  data/                items, loot tables, recipes, zones
  world/               city and stilt-town generators, decals, collision + nav/flow fields,
                       sky/fog/water/mist, models, batching
  entities/            player, walkers (skinned single-mesh bodies), horde AI, Living Guard soldiers and drones
  combat/              combat rules and the first-person view model
  game/                raid orchestration, container specs, loot, inventory, profile/saves
  scenes/HubScene.js   the Magnolia backdrop
  ui/                  HUD, backpack, map, hub menus, styles
```

Saves live in `localStorage` (`lasttoll.save.v1`).

## Road to VR

The desktop build is structured so WebXR can slot in without rewriting the game rules:

- **Hit resolution is input-agnostic.** Melee is resolved from an origin, a direction and a power value;
  on desktop the power comes from the wind-up, in VR it will come from controller velocity at contact.
- **Input is read as intents** (`core/Input.js`), so an XR controller backend can feed the same actions.
- **The view model is isolated** (`combat/ViewModel.js`). In VR it gets replaced by tracked hands, with the
  same weapon models attached to the controller grips.

Next steps for the VR build:

1. Enable `renderer.xr`, add an Enter VR button, and parent the camera to an XR rig.
2. Map controllers to hands; drive melee power from hand velocity and blade direction.
3. Body holsters (hip, shoulder, chest) and an over-the-shoulder backpack for physical inventory.
4. Physical reloads: magazine and shell insertion by hand proximity, slide/pump by grip-and-pull.
5. Two-handed aiming for long guns, physical grab of walker collars and helmets.
6. Comfort options: snap/smooth turn, teleport or smooth locomotion, tunneling vignette.

---

An independent project. Its melee and reload feel is inspired by *The Walking Dead: Saints & Sinners*;
its world, story and characters are its own. Not affiliated with Skydance Interactive or AMC.
