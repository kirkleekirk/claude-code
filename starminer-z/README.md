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

Items and crafting are the later CastleMiner Z's, with its own numbers: the bloodstone tier, light
machine guns, laser guns and swords, rocket launchers, grenades, TNT and C4, crates, doors, the
clock, locator and teleporter, and its 107 recipes. The inventory and crafting screens are laid
out as its are: you learn a recipe once you carry what it makes, one of the things it takes, or
a gun it makes the bullets for. Tools and guns wear out as they're used. When you die, your
backpack falls where you fell; the hotbar stays with you.

The new things work as the original's code has them. Bullets fly at their gun's speed and fall
as they go; laser bolts fly at 200 m/s, glance off bedrock, bloodstone and diamond walls, and
knock out the block they stop in. TNT and C4 go off four seconds after they're lit (B, the right
mouse button, or a swing of anything but a spade), or at once when shot, taking out what's soft
enough round them, setting off any more in reach, and hurting you less through walls. Grenades
cook while the trigger's held and bounce as each block lets them; rockets pop out of the tube and
fly. Doors open and shut both halves; crates hold 32 stacks with the world, and spill them when
they're broken. The locator and teleporter mark a block and point the way to it (with a marker
standing there), and the clock turns with the day.

Controls: keyboard and mouse, an Xbox controller, or touch (see Help & Controls in the game).

### Playing online

Up to eight players can play together in one world, as in CastleMiner Z:

- To host, choose Play Game, then Host Online Game (or Invite Friends from the pause menu of a
  game you're in). Once the world has loaded you get a five-letter code.
- Your friends choose Join Online Game and type the code (with a controller, A on the code
  changes it a letter at a time).
- Everyone plays in the host's world, which is saved on the host's machine. Block changes go to
  everyone, and the time of day is the host's.
- Each player's machine runs the dead that come for that player (as the original does), and the
  others see them and can shoot them. A kill counts for whoever made it.
- What each friend carries is kept with the host's world, for when they come back.
- Shots, grenades and rockets fly on every machine; explosions hurt every player and every
  machine's dead (the kill is whoever set it off). Crates are the same for everyone, and the
  slot a friend is on in one is theirs until they move off it.
- Online, the game goes on behind the pause menu, and Teleport To Player there takes you to a
  friend.

The browsers connect to each other directly (WebRTC, through [PeerJS](https://peerjs.com)). The
public PeerJS server only introduces them, or `?peer=host:port` names another (`npx peerjs
--port 9000` runs one). Online play needs a page that may open connections: the downloaded copy
or any ordinary web address, not the Claude artifact viewer.

### On an Xbox

The game runs in Microsoft Edge on an Xbox Series X|S, from a web address (Edge there can't open
files).

- In Edge, hold the Menu button and choose Use game controls, so the controller plays the game
  instead of moving a pointer.
- B pauses and the d-pad's up changes the camera: Edge keeps the View button for itself.
- The game starts on Medium graphics there. Turning off Edge's "Apps can add a border" setting
  helps it run smoothly.

## Developing

```
npm install
npm run dev             # http://localhost:5173 (add ?play to skip the menus)
npm test                # world generation, meshing and lighting checks
npm run build           # dist/
npm run build:artifact  # one self-contained page: dist-artifact/starminer-z.html
npm run build:download  # files to open straight from disk: dist-download/starminer-z.html, -friends.html
npm run build:avatar -- <path to XNAGameStudio/Samples>   # rebuilds src/assets/avatarData.js
```

A page opened from disk can't fetch the files beside it, so the download build packs
whatever is in `local-assets/` into `starminer-z.html` itself; that copy is yours alone and isn't
for passing round. `starminer-z-friends.html` is the same game with nothing ripped in it, to give
to the friends you play with online.

Online tests run against a local PeerJS server: start one on 127.0.0.1:9000 and add
`&peer=127.0.0.1:9000` to both players' addresses.

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
python3 tools/cmz/rip_player.py <Content> local-assets          # avatar clips, held items, the locator's marker
python3 tools/cmz/rip_ui.py     <Content> local-assets          # the inventory and crafting panel
```

Without them the game is silent, the dead are built on the avatar rig, what you hold is drawn
from parts, and the inventory has a panel of its own.

## Credits

- The character rig, avatar part meshes, clothing and face textures and animations come from the
  Avatar Animation Pack for XNA Game Studio 4.0 by Microsoft Corporation, used under the
  Microsoft Permissive License (Ms-PL); see `LICENSE-avatar.txt`.
- three.js and PeerJS (MIT). Fonts: Archivo Black, Open Sans and Saira Semi Condensed (SIL Open Font
  License), from Google Fonts.
- CastleMiner Z's sounds, music, models and animations (when you rip them from your own copy;
  see above) belong to DigitalDNA Games and aren't distributed here.
- Everything else (the world, sky, the stand-in zombies and skeletons, interface) is this
  project's own work.
