# Holdfast

A third-person zombie survival game in the browser, in the spirit of State of
Decay but with an open map and free-form base building. Instead of fixed base
sites, you plant a **claim flag** anywhere and build inside the area it marks
out, on a 2 m grid, from wall panels you can design yourself.

The first map is **Bridger County**: rolling farm hills in the west (three
farmsteads, a country church, corn and bean fields, county roads) and the
river town of **Harlan's Landing** in the east (brick downtown on Main St,
residential streets, a church, a water tower, a floodwall on the river).

Every building in the world is made from the same grid pieces the player
builds with, so a house inside your claim can be altered or torn down and
rebuilt.

## Run it

It is a static page with no build step. Serve this folder with any static
web server and open `index.html`, for example:

```
cd games/holdfast
python3 -m http.server 8000
# open http://localhost:8000/
```

three.js r170 is loaded from jsDelivr, so the first load needs a network
connection.

## Controls

| Keyboard / mouse | |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Run |
| Space | Jump / vault fences |
| C | Crouch (quieter) |
| Left click / right click | Attack or shoot (hold for automatics) / aim |
| R | Reload |
| Q | Switch between bat and gun |
| E | Open doors, search (hold), pick up, talk |
| F | Flashlight |
| G | Plant claim flag |
| B | Build mode (inside your claim) |
| H | Patch up (meds for wounds, food for strength) |
| I or Tab | Pack and camp storage |
| J | Camp |
| V | Top view |
| M | Map |
| Esc | Menu |

**Phones:** the left side of the screen moves, the right side looks; the
round buttons hit, use, jump, aim, crouch, run and reload. The pills at the
top switch to the top view, swap weapons, patch up and toggle the light;
More holds Pack, Camp, Map, Claim and Build.

## Your group

Everyone in your camp is a person you can play. In the **top view** (V, or
the default on phones) the whole group carries on by itself; pick people to
send them somewhere, point them at a fight and watch, send them on jobs
(scavenge a building, fetch a cache, raid a crew you know about, a supply
run), or call them home to rest or get patched up. *Take control* drops you
into anyone.

Anyone who isn't your leader tires quickly out in the world and is useless
once exhausted, so you rotate people and let the others rest at camp. Hits
can leave injuries (sprains, deep cuts that bleed, cracked ribs, a hurt arm,
a concussion) that lower health and slow, weaken or shake you until treated
and healed.

## Guns and gear

Each survivor carries their own pack (by weight) and one gun in hand; the
camp keeps a separate storage that your pack empties into when you walk into
your claim. Guns use four ammo types: 9mm (1911, Uzi), shotgun shells (pump
shotgun, the rare Street Sweeper), 5.56 (M4, AK) and 7.62 (a light bolt-action
scout rifle and a heavy scoped long rifle).

**Build mode:** pick a tool (floor, wall, roof, stairs, post, furniture,
remove), click or tap to place, R rotates, F flips a wall inside/out, M
mirrors it, E / Q change floor, X removes. The **Wall designer** paints your
own wall panels (solid, window, door, open cells on an 8 × 12 grid).

## Developer checks

- `index.html?validate=1` runs the world-generation validator after loading
  and logs a report (also on `window.__validation`). It checks road grades
  and junctions, ground poking through roads, streets and floors, buildings
  on roads or overlapping, ground heaped against walls, a walk-in test
  through every exterior door, entry steps, trees, props and fences inside
  buildings or on roads, parked-car overlaps, crop fields and cliffs.
- `index.html?still=1` renders on demand and exposes `__shot()` and
  `__sim()` for automated screenshots and play-tests.
- `tools/sandbox.html` shows single buildings; `tools/chars.html` shows the
  rigged characters.

## Credits

Character models, both licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), auto-rigged and
animated in the game:

- "[Proportional Low Poly Man](https://sketchfab.com/3d-models/proportional-low-poly-man-free-download-0bfd0e2b49a348a4b64b20cc8196e3b3)"
  by Robin Butler
- "[FEMALE](https://sketchfab.com/3d-models/female-9a0c634d1a2249d18afbbaecf6305706)"
  by staxegolo

Everything else (terrain, buildings, textures, sound) is generated in code.
