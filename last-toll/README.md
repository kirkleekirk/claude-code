# Last Toll

A zombie extraction survival game that plays like *The Walking Dead: Saints & Sinners*, built for
desktop first with the architecture laid out for VR (WebXR) next.

You live aboard the *Magnolia*, a beached paddle steamer at the edge of a flooded Louisiana parish.
Each trip starts at dusk on a skiff. You scavenge the drowned streets, fight the dead up close, and
get back to the water before the bell in the old tower tolls. When it rings, every dead thing in the
parish starts walking toward you. Die out there and everything you carried stays behind.

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

## What makes it play like Saints & Sinners

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
- **The Toll.** A hard clock. After the bell, hunters pour in from the edges; later the parish is overrun.
- **The hub.** Stash, workbenches you upgrade (weapons, ammo, infirmary, galley), a recycler for salvage,
  backpack upgrades, and contracts that only pay if you make it back.

Three areas get harder and richer: Cypress Row (houses and yards), Kessler Rail Yard (warehouses and
freight containers), and St. Aubin Quarter (shops, a clinic, and a fallen National Guard checkpoint full
of riot-gear dead). Every trip generates a new map.

## Code layout

```
src/
  main.js              app shell: title → hub → raid → summary
  core/                input, procedural audio, seeded RNG, math
  data/                items, loot tables, recipes, zones
  world/               city generator, collision + nav/flow fields, sky/fog/water, models, batching
  entities/            player, walkers (skinned single-mesh bodies) and horde AI
  combat/              combat rules and the first-person view model
  game/                raid orchestration, loot/containers, inventory, profile/saves
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

An independent fan project inspired by *The Walking Dead: Saints & Sinners*; not affiliated with Skydance
Interactive or AMC.
