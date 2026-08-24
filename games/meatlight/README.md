# MEATLIGHT

A single-file browser horror game with sixth-generation-console graphics.

**VOSK & SONS RENDERING CO., PLANT 2 — Friday 6 February 1998, third shift.**
You are the night security guard. You have thirteen cameras, a door panel and
a radio. Dale is on the floor, Sol is on sanitation, and nobody else is in the
building. At 02:14 Line 3 starts on its own.

Open `meatlight.html` in any browser. No install, no server, no network.

---

## The camera conceit

The plant's CCTV *is* the game's camera system. In monitor mode you sit at the
console and switch feeds. When the story pushes you out of the office, the same
fixed cameras are what frame you — you walk through your own surveillance,
and movement is relative to whichever lens currently has you.

| Key | Monitor mode | On foot |
|-----|--------------|---------|
| `0`–`9`, `[`, `]` | select camera | — |
| `Q` | quad view (4 feeds) | — |
| `D` | door control panel | — |
| `P` | plant PA | — |
| `WASD` | — | move (camera-relative) |
| `Shift` | — | run |
| `E` | — | use |
| `Space` | advance dialogue | advance dialogue |

Two endings, decided by your last command at the console.

---

## Rendering

Everything is drawn by a hand-written software rasteriser into a 320×240
framebuffer. There is no WebGL, no engine, and no external asset of any kind —
all textures are generated procedurally at boot, including the signage, which
is rendered to an offscreen canvas and then grimed up.

The sixth-gen look is reproduced rather than filtered:

- **Sub-pixel vertex snapping.** Projected coordinates quantise to half a pixel,
  which is the source of the characteristic edge wobble.
- **Subdivided-affine texture mapping.** Perspective is corrected once every 16
  pixels and interpolated linearly in between, giving textures the slight swim
  that fully perspective-correct hardware does not have.
- **Baked per-vertex lighting.** Static geometry is lit once at build time and
  tessellated so the gradients have somewhere to live. Actors sample a six-tap
  ambient cube at the chest instead, so a moving character costs six light
  evaluations per frame rather than thousands.
- **Ordered-dither fog.** A 4×4 Bayer matrix breaks the fog blend into stipple
  instead of smooth banding.
- **CRT/VHS pass.** Scanlines, vignette, chroma bleed, head-switching noise and
  a drifting tracking bar, all applied per pixel in the same buffer.

Audio is synthesised through WebAudio — room tone, plant hum, the conveyor, and
a distinct voice-blip timbre per character.

## Level construction

The plant is one storey of twelve rectangular rooms. Two rules keep it honest:

1. **Doorways live in one shared table.** Each room asks that table which
   openings fall on the wall it is building, so a hole cannot exist on one face
   of a wall and not the other. Walls are single-sided and face inward, which
   also lets adjoining rooms keep independent ceiling heights and materials.

2. **Every placement is checked before the build ships.** `validate.js` runs in
   Node and fails the build on any error. It verifies that room rectangles do
   not overlap; that every doorway plane is a real shared wall with the span
   inside the overlap and the height under both ceilings; that no two openings
   are cut through each other; that every prop footprint is inside its room,
   clear of other props, and not standing in a doorway; that wall fittings sit
   on real walls and do not hang inside an opening; that no camera is buried in
   a pillar or aimed at its own lens; and that every room is reachable from the
   security office.

```
$ node validate.js
MEATLIGHT level check
  rooms 12  doors 20  props 160  fittings 43  cameras 14
PASS -- every prop, fitting, doorway and camera is where it claims to be.
```

Floor plan, metres, `+X` east and `+Z` north:

```
        z=42  +----------+
              |   COLD   |
              |  STORAGE |
        z=34  +----------+--------------+---------------+
              |                         |    COOKER     |
              |   KILL FLOOR / LINE 3   |    HOUSE      |
        z=30  |                         +---------------+
        z=20  +--------+-----+----------+---------------+
              | RENDER |CORR |  UTILITY / PUMP HOUSE    | INTAKE
              |  PIT   |  B  |                          |  BAY
        z=9   +--------+-----+--------------------------+
              |            CORRIDOR A                   |
        z=6   +-------+--------+-------+----------------+
              |  SEC  | BREAK  |LOCKER | FRONT OFFICE   |
        z=0   +-------+--------+-------+----------------+
             x=0                                     x=30      x=42
```

## Building

```
node validate.js     # placement checks only
node build.js        # validates, then writes meatlight.html

npm install playwright
node play.js                                  # automated playthrough, ending A
node play.js render                           # ...ending B
FF="THROW THE BREAKER" node play.js           # start at a named beat
VERBOSE=1 node play.js                        # log the walker's navigation
```

`play.js` drives the real game through real keypresses in headless Chromium —
switching cameras, working the door panel, walking the plant — and fails if the
script stalls or the page throws. A full run reaches both endings.

`meatlight.html` is generated. Edit the sources in `src/` and rebuild.

| File | |
|---|---|
| `10-core.js` | rasteriser, math, framebuffer, input |
| `20-tex.js` | procedural texture library |
| `30-geom.js` | mesh building, baked lighting, room/doorway builder |
| `35-props.js` | prop catalogue with footprints |
| `40-level.js` | the plant: rooms, doorways, props, fittings, cameras |
| `50-validate.js` | placement checks |
| `60-actors.js` | box humanoids, the Six, the moving hook line |
| `70-audio.js` | WebAudio synthesis |
| `80-script.js` | the story — every line of dialogue |
| `90-game.js` | world construction, rendering, CRT pass |
| `95-loop.js` | script VM, HUD, frame loop |

`window.MEATLIGHT` exposes a small read-mostly debug tap (`state()`, `cam(n)`,
`door(id)`, `warp(room,x,z)`, `nocull(bool)`, `validate()`).

## Content

Graphic violence, strong language throughout, flashing images.
