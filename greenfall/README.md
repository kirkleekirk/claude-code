# Greenfall

**A free zombie extraction battle royale for the browser.**

Drop out of a cargo plane over Greenfall County, loot farms, towns and an old coastal
quarter, keep yourself fed, watered and patched up, and get off the island alive. You can't
outrun the dead forever. Instead of a storm, **hordes** close in: green zones where zombies
claw up out of the ground nonstop. They swell when they hear gunfire or spot you, drift
toward noise, and big ones can migrate fast.

There are two ways out:

* **The riverboat *Magnolia*** docks halfway through the match at one of three piers and
  takes the first **3** survivors to board.
* **The evac helicopter** lands when only a few survivors are left. It waits for a short
  time and then leaves without whoever didn't make it. If you eliminate every other survivor
  while it is inbound, it comes to pick you up.

![Lobby](docs/lobby.png)

| | |
|---|---|
| ![Dusk over Cedar Ridge](docs/dusk-country.png) | ![Night at a Hollow Creek farm](docs/night-farm.png) |
| ![Bellerose](docs/bellerose.png) | ![A horde rolling over the hills](docs/horde.png) |
| ![Item shop](docs/item-shop.png) | ![Island map](docs/map.png) |

## Play it locally

```bash
cd greenfall
npm install
npm run dev        # http://localhost:5173
```

You'll need a browser with WebGL 2 (any recent Chrome, Edge, Firefox or Safari). Phones and
tablets get touch controls automatically.

Useful URL flags while testing: `?q=low|medium|high|ultra` forces a graphics preset and
`?autoplay=quick` jumps straight into a match.

## Publish on itch.io (free)

```bash
npm run package:itch          # builds and writes release/greenfall-web.zip (~0.5 MB)
```

On itch.io: **Create new project** → **Kind of project: HTML** → upload
`release/greenfall-web.zip` → tick **This file will be played in the browser**. Recommended
embed options:

* Viewport: **1280 × 720**, with **Mobile friendly** and **Fullscreen button** turned on
  (landscape orientation).
* Leave **SharedArrayBuffer support** off. It isn't needed.
* Pricing: **No payments** or **Donate** for a free game.

The build uses relative paths (`base: './'`), so it works inside itch's iframe. Everything
(textures, models, audio, music) is generated in code, so there are no asset files to host.

## Controls

| Action | Keyboard / mouse |
|---|---|
| Move / sprint / crouch (quiet) | W A S D · Shift · C or Ctrl |
| Jump · vault through a window | Space |
| Fire / use item · aim | Left mouse · Right mouse |
| Reload · interact (hold to board up, search) | R · E |
| Harvesting tool / hotbar | 1 – 6, mouse wheel |
| Build mode · wall / floor / ramp / roof | Q · Z X V F (or 1–4) |
| Change material · rotate piece | G · R |
| Quick heal · quick eat/drink | H · X |
| Inventory & crafting · map · flashlight | Tab · M · L |
| Drop held item · emote · pause | T · B · Esc / P |

## What's in the game

**The island:** a hand-built layout taken from the concept map:

* **Millbrook**: a small town with rural residential lanes (NW)
* **Route 9 Plaza**: the retail strip (gas station, MegaMart, motel, diner, stores)
* **Hollow Creek**: farms and the main country area, with red barns, silos, corn and wheat,
  pastures, an orchard, a horse ranch and the grain co-op
* **Cedar Ridge**: big open country in the middle, with Lake Wren, the sawmill, the county
  fairgrounds and Ferris wheel, Lookout Hill radio tower, the old quarry and Bayou Bend
* **Pelican Harbor**: a deep bay with cranes, warehouses, containers and a lighthouse
* **Bellerose**: an old coastal quarter with wrought-iron balconies, a cathedral square,
  St. Agnes Cemetery and the riverboat wharf
* Open ocean to the east, reserved for the future ocean update

The island is about 3.6 × 2.7 km of land with roughly 1,700 enterable buildings. Every house
has rooms, stairs, furniture, doors and windows, and things to search. Maps are streamed in
chunks with LODs, so the whole island stays visible from the plane.

**Survival:**

* Hunger, thirst and stamina all drain.
* Bleeding needs a bandage, a fractured leg needs a splint (painkillers dull it), and an
  infection from a bite needs antibiotics.
* Raw meat and dirty water can give you food poisoning. Cook them at a campfire.
* Hunt deer, chickens and cows for meat, fill bottles at the lake and ponds, and craft
  bandages, splints, campfires and armor plates.

**The dead:**

* Instanced zombies (walkers, fast runners at night, brutes) that see and hear you.
* They bash doors, barricades and your builds, climb through windows and follow building
  layouts to reach you.
* Every action makes noise: footsteps, doors, hammering, gunfire (suppressed weapons are
  quiet). Shooting a car can trip its alarm. An alarm clock lures the dead away.

**OG-style combat and building:**

* Common-to-Legendary weapons: rifles, SMGs, a pump shotgun, a hunting rifle with bullet
  drop, pistols, a revolver, a silent crossbow and a machete.
* Frags, molotovs and alarm clocks.
* Harvest wood, stone and metal, then build walls, floors, ramps and roofs. Pieces build up
  health over time and collapse when they lose support.

**Rivals:** 29–59 AI survivors with original cosmetics. When they're far away they're
simulated cheaply, so the match pace stays right. Near you they're fully physical: they loot,
fight with human-like aim error, panic-build walls when shot, heal, flee hordes and race you
to the extraction.

**Day and night:**

* Misty mornings, bright stylized days and orange sunsets.
* At dusk the sky turns sickly green and the storm rolls in. Nights bring rain and lightning,
  faster zombies, warm porch and gas-lamp lights, and a flashlight that makes you easier to
  spot.

**Match lengths:**

| Preset | Length | Survivors |
|---|---|---|
| Quick | ~25 min | 30 |
| Standard | ~1 hr | 50 |
| Marathon | 2–3 hr | 60 |

You can pause at any time, since it's single-player.

**Meta:**

* Shards (the in-game currency), XP and levels, career stats and match history.
* An **item shop** that rotates daily at 00:00 UTC, with Featured and Daily sections and
  rarity cards, plus a **locker** for outfits, back blings, harvesting tools, gliders, emotes
  and weapon wraps.
* All 20 outfits and every item are original designs.

## Monetization notes

Right now Shards are only earned by playing: extracting with valuables pays best. The shop is
**cosmetic only**, so there's no pay-to-win. The profile is saved in `localStorage`, which
players can edit, so **don't sell Shards for real money until there's a backend**: a small
server that verifies purchases (Stripe, itch.io's server-side purchase API, etc.) and stores
balances. Practical paths for an itch.io release:

1. Free to play with **"Donate"** pricing turned on.
2. Later, add accounts and a tiny API (`/purchase`, `/profile`) and have the shop read the
   balance from it. `src/core/profile.js` is the single place that reads and writes the
   profile.
3. Put any paid content on a supporter pack page on itch.

## Project layout

```
src/
  main.js            app bootstrap, match lifecycle, frame loop, lighting/fog
  core/              rng, noise, math, input, procedural audio, profile
  world/
    layout.js        the island: coastline, regions, roads, POIs, docks, landing zones
    worldgen.js      heightfield, roads, lots, farms, fields, trees, props (pure data)
    terrain.js       terrain chunks + LODs        water.js   ocean/lake/ponds
    buildings.js     procedural buildings with interiors, colliders, nav graphs
    props.js         cars, fences, power lines, silos, cranes, lighthouse, Ferris wheel...
    vegetation.js    instanced trees, crop rows, grass   sky.js  sky + day/night
    world.js         chunk streaming & LOD           textures.js / materials.js
  game/
    player.js survivor.js character.js weapons.js zombies.js hordes.js bots.js
    interact.js (doors, barricades, loot, campfires) building.js match.js vehicles.js
    animals.js fx.js physics.js graphics.js
  ui/                hud, menus/shop/locker, thumbnails, lobby scene, touch controls
  data/              items & loot tables, cosmetics catalog + shop rotation
scripts/
  package-itch.mjs   zips dist/ for itch.io
  smoke-test.mjs     headless boot + simulated match (needs Playwright)
```

Run `npm run build && npm run test:smoke` for an automated end-to-end check. It boots the
game in headless Chromium and fast-forwards a Quick match through the drop, the riverboat and
the helicopter.

## Roadmap ideas

* Online multiplayer. This needs an authoritative game server; the AI survivors already use
  the same `Survivor` code path a networked player would.
* Duos and squads with AI or friends, plus a spectator view after elimination
* The ocean update: boats, swimming and an underwater area
* Vehicles on the farm roads (pickup trucks, tractors)
* Saving a match in progress so you can finish a Marathon later

## Credits & licenses

Built with [three.js](https://threejs.org) (MIT) and [Vite](https://vitejs.dev) (MIT). Fonts:
Lilita One and Rubik (SIL Open Font License), bundled through Fontsource.

Greenfall is an independent, original game and isn't affiliated with or endorsed by any other
game or company.
