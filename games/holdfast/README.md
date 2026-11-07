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
| Left click / right click | Attack or shoot / aim |
| Q | Switch weapon |
| E | Open doors, search (hold), pick up |
| F | Flashlight |
| G | Plant claim flag |
| B | Build mode (inside your claim) |
| H | Eat / use meds |
| M | Map |
| Esc | Menu |

**Phones:** the left side of the screen moves, the right side looks; the
round buttons hit, use, jump, aim, crouch and run. Build, Pack and Map are on
the right.

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
