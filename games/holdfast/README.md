# Holdfast

A third-person zombie survival game in the browser, in the spirit of State of
Decay but with an open map and free-form base building. Instead of fixed base
sites, you plant a **claim flag** anywhere and build inside the area it marks
out, on a 2 m grid, from wall panels you can design yourself.

The first map is **Bridger County**, about 1.2 km across: rolling farm
hills in the far west (three farmsteads, a country church, corn and bean
fields, county roads), the river town of **Harlan's Landing** in the east
(brick downtown on Main St, residential streets, a church, a water tower, a
floodwall on the river), and between them 640 m of open country along
Highway 34: **Turkey Creek** winding south through its valley under the
road culverts, three more farms (Ostrander, Lindqvist and Kessler), and the
hamlet of **Carver's Crossing** (a general store and post office, a co-op
grain elevator, a handful of houses and the gravel Carver Road).

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
| K | Everyone's stats |
| V | Top view |
| M | Map |
| Esc | Menu |

| Driving | |
| --- | --- |
| E | Get in at a door / get out |
| W / S | Accelerate / brake, then reverse |
| A / D | Steer |
| Space | Handbrake |
| F | Headlights |
| Q | Horn (the dead hear it) |

**Phones:** the left side of the screen moves, the right side looks; the
round buttons hit, use, jump, aim, crouch, run and reload. The pills at the
top switch to the top view, swap weapons, patch up and toggle the light;
More holds Pack, Camp, Map, Claim and Build. Behind the wheel the stick
steers and drives, and the round buttons become Brake, Exit and Horn.

## Starting out

The survivor screen has four steps: who you were before (one of nine
backgrounds, each a head start on some stats, a camp role and what you
walked out with: the deputy's 1911, the hunter's scout rifle, the
paramedic's meds, the veteran's M4...), your group and the county (start
alone for extra points or with one or two others; how scarce supplies are;
how many of the dead), your strengths (spend points on five stats on a
pentagon, plus traits; weaknesses pay points back), and where to start.

## Stats

Every survivor has five stats, 1 to 10, shown as a pentagon on their card,
in the Stats tab (K) and when you talk to them: **Fighting** (melee damage
and speed), **Shooting** (accuracy and damage), **Endurance** (health,
stamina, how slowly they tire), **Scavenging** (search speed and finds) and
**Charm** (recruiting and talking people round). They grow with use.

## Your group

Everyone in your camp is a person you can play. In the **top view** (V, or
the default on phones) the whole group carries on by itself; pick people to
send them somewhere, point them at a fight and watch, send them on jobs
(scavenge a building, fetch a cache, raid a crew you know about, a supply
run, recruit a stranger you know about, or go looking for survivors), or
call them home to rest or get patched up. A recruiter walks out, talks it
over and comes back with them (or doesn't): their Charm, how the stranger
feels about you and whether camp has what they need set the odds. *Take control* drops you
into anyone.

Everyone finds their own way around the whole map: through doors, up
stairs, over low fences and around buildings, and the dead do too. In a
fight your people pick what matters most (anything on top of a friend
first), fight at their weapon's range, back off to keep shooting, never fire
through a friend, reload in the lulls, strafe against gunmen, fall back when
it's too many or they're hurt, go quiet with a bat when you're sneaking, call
out what's behind you and hand you ammo when you run dry.

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

## Cars

Pickups, sedans and wood-panelled station wagons were left where they
stopped: angled in at the curb on Main St, in farmyards, at the Crossing's
store, piled up on the highway. Most still run if they have gas (each has a
tank that empties with distance); wrecks never will, but can be searched
and stripped for scrap metal. Refuel at the filler cap with Fuel from your
pack (or camp storage at camp) and patch up a battered car at the front
with Metal. Crashes and the dead dent the body; hit something hard enough
and you get hurt too. Driving through the dead knocks them flat.

Your followers ride with you (two seats in a pickup, four in a sedan or
wagon). Loot that doesn't fit your pack goes in the trunk of the car you
came in, and pulling into camp unloads it into storage. A running car with
gas parked inside your claim lets a supply run or a search for survivors go
further and come back sooner with more. Cars you've used are marked on the
map, and every car's place, fuel, damage and trunk are saved.

The models are built in code: side profiles extruded with rounded edges and
real wheel arches, open cabins with pillars, glass, seats and a dashboard
(so you can see who's driving), chrome, lamps that light up at night, door
seams, mirrors and plates. Each car is one mesh plus its glass, with a tiny
region texture telling paint, chrome, rubber, lenses and wood apart, and a
shader that adds mud, rust on the wrecks and woodgrain.

## How it looks

The whole picture is drawn in scene light and finished the way a camera
would: bloom, ambient occlusion, a film tone curve and a colour grade that
follows the hour and the weather.

- **Light and air.** The sun's height drives everything, from blue hour
  through a long golden hour to moonlight. Haze thickens with distance, lies
  in the low ground at dawn and takes the colour of the sky toward the sun;
  clouds drift over and their shadows cross the fields.
- **Shadows** come from a ring of maps centred on what you are looking at:
  sharp at your feet, still there across the valley.
- **Grass** is real blades, placed around the camera from a map of what
  grows where. It moves in gusts, parts around people and the dead, and
  flattens under wheels. **Trees** carry leafy canopies and shed leaves in
  the wind; **corn and soybeans** stand in full rows.
- **Water** mirrors the sky, the clouds and the dark line of the banks, and
  the sun or moon lays a glittering path across the river.
- **Weather.** Rain falls as streaks with rings where it lands, but not
  under a roof, a porch or an awning; open ground darkens, shines and pools
  while covered ground stays dry. Storms throw lightning with thunder that
  arrives late when the strike is far.
- **Small things:** campfires with flames, embers and smoke; dust behind a
  car off the road; muzzle flash and powder smoke; fireflies over the rough
  grass on a dry night.

Graphics has four steps under Menu > Settings (it applies after a reload),
or add `?q=low`, `?q=medium`, `?q=high` or `?q=ultra` to the address. Phones
start on Low, which keeps the same light and colour without the extra
passes; everything else starts on High.

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
