# StarMiner Z

A voxel survival game in the spirit of the Xbox 360 classic CastleMiner Z (DigitalDNA Games,
2011), set on an alien moon under the giant planet Ember. It runs in the browser with three.js.

StarMiner Z is a fan remake. It is not affiliated with or endorsed by DigitalDNA Games or
Microsoft.

## Playing

Endurance: start by the bedrock tower and see how far you can get from it. The first day is a
grace period under a clear alien sky; late that afternoon a storm rolls in for good, and the dead
start climbing out of the ground. They swarm at night and sprint; by day they rise as you push
into new ground. Underground, in the pitch dark, skeletons come for you (light keeps them away).
The further out you go, and every fifth day, the harder it gets, and out past the Desert the dead
dig through stone, then copper, iron and gold walls.

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
`tools/eval.mjs` (runs a module in the page).

## Credits

- The character rig, avatar part meshes, clothing and face textures and animations come from the
  Avatar Animation Pack for XNA Game Studio 4.0 by Microsoft Corporation, used under the
  Microsoft Permissive License (Ms-PL); see `LICENSE-avatar.txt`.
- three.js (MIT). Fonts: Archivo Black, Open Sans and Saira Semi Condensed (SIL Open Font
  License), from Google Fonts.
- Everything else (the world, sky, sounds, zombies and skeletons, interface) is this project's
  own work.
