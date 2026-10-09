# StarMiner Z

A voxel survival game in the spirit of the Xbox 360 classic CastleMiner Z (DigitalDNA Games,
2011), set on an alien moon under the giant planet Ember. It runs in the browser with three.js.

StarMiner Z is a fan remake. It is not affiliated with or endorsed by DigitalDNA Games or
Microsoft.

## Playing

Endurance: start by the bedrock tower and see how far you can get from it. A day lasts 16
minutes, starting mid-morning. The first day is under a clear alien sky; early that afternoon a
storm rolls in for good.

The dead follow CastleMiner Z's own rules, read from the original's code:

- At night they climb out of the ground around you, more often the deeper the night and the
  further out you are. Near the start that means only late in the evening. Each day survived
  counts as another 120 m out. At dusk some are skeleton archers. A lantern stops them coming up
  near it.
- Every 40 m or so of new ground you reach in daylight, two to four of them come for you.
- They walk until they've chased you for 45 s (or for a few seconds of you running), then they
  run, faster than you can. Just after midnight they all run.
- A zombie that's stuck, or has you above or below it, digs toward you. Only the toughest get
  through rock, and nothing gets through a wall.
- In the dark underground, skeletons drop out of the cave roof near you, unless it's lit there.
  They come in waves, a minute on and a minute off.
- Which of the dead you meet, and how tough it is, goes by distance, from the original's table
  of 18 zombies, 8 archers and 24 skeletons.

The zones run in rings out from the tower, as in the original:

| Distance | Zone |
|---|---|
| 0 - 200 | The Hills |
| 200 - 950 | Floating Islands and dry riverbeds |
| 950 - 1600 | The Desert |
| 1600 - 2300 | The Mountains |
| 2300 - 3000 | The Snowfields |
| 3000 - 3400 | World's Edge (ore everywhere; pits into the Underworld) |
| 3400 - 5000 | Hell on Earth (endless night) |

Then the zones come round again in reverse. Under everything, about forty blocks down, a
bloodstone roof over the Underworld.

Controls: keyboard and mouse, an Xbox controller, or touch (see Help & Controls in the game).

## Developing

```
npm install
npm run dev             # http://localhost:5173 (add ?play to skip the menus)
npm test                # world generation, meshing and lighting checks
npm run build           # dist/
npm run build:artifact  # one self-contained page: dist-artifact/starminer-z.html
npm run build:avatar -- <path to XNAGameStudio/Samples>   # rebuilds src/assets/avatarData.js
```

Test helpers: `tools/shoot.mjs` (screenshots in headless Chromium), `tools/flow.mjs` (walks the
menus with key presses), `tools/sim.mjs` (runs the game and reports what the enemies do),
`tools/eval.mjs` (runs a module in the page), `tools/cmz/hold.html?item=pistol` (the avatar
holding something, posed by the original's clips, from four sides). In the game,
`?play&horde=4&skel=2&archer=1` puts some of the dead in front of you, `&slot=2` picks a hotbar
slot, `&third` starts in third person, `&ads` aims, and `?nocmz` leaves out everything ripped
from the original.

### The original's sounds, bodies and hands

All the sound in the game is CastleMiner Z's own: every cue (effects, ambience and music) plays
by the original's rules. So are the zombie and skeleton models, with their animations and skins.
So is how you hold things: in first person you see your avatar's own arms from its eyes, as the
original drew them, posed by its clips (picking, aiming at the shoulder, firing, reloading) with
its models of the pickaxe, guns, knife, compass and the rest in your hand; in third person the
avatar walks, runs and leans with the same clips.

None of these files are in this repository. They come out of your own copy of the game (its
`Content` folder) and go in `local-assets/`, which git ignores:

```
python3 tools/cmz/rip_audio.py  <Content> local-assets/audio    # needs ffmpeg
python3 tools/cmz/rip_models.py <Content> local-assets/models
python3 tools/cmz/rip_player.py <Content> local-assets          # avatar clips and held items
```

Without them the game is silent, the dead are built on the avatar rig, and what you hold is drawn
from parts.

## Credits

- The character rig, avatar part meshes, clothing and face textures and animations come from the
  Avatar Animation Pack for XNA Game Studio 4.0 by Microsoft Corporation, used under the
  Microsoft Permissive License (Ms-PL); see `LICENSE-avatar.txt`.
- three.js (MIT). Fonts: Archivo Black, Open Sans and Saira Semi Condensed (SIL Open Font
  License), from Google Fonts.
- CastleMiner Z's sounds, music, models and animations (when you rip them from your own copy;
  see above) belong to DigitalDNA Games and aren't distributed here.
- Everything else (the world, sky, the stand-in zombies and skeletons, interface) is this
  project's own work.
