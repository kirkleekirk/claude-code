# StarMiner Z

A voxel survival game in the spirit of the Xbox 360 classic CastleMiner Z (DigitalDNA Games,
2011), set on an alien moon under the giant planet Ember. It runs in the browser with three.js.

StarMiner Z is a fan remake. It is not affiliated with or endorsed by DigitalDNA Games or
Microsoft.

## Playing

The game modes are the later CastleMiner Z's:

- **Endurance**: start by the bedrock tower and see how far you can get from it. It's a new world
  every time and isn't kept; the awards count only here. Alone, dying starts it over (back at
  the tower on the first morning, with nothing travelled).
- **Survival**: a world of your own, kept, to mine and build in, at a difficulty of your choosing:
  No Enemies, Easy (the dead come only at night, and more slowly; dragons don't break your
  blocks), Normal (fresh ground brings them too), or Hardcore (you start with nothing and lose
  everything you carry when you die). You come back at the start when you die, and the pause
  menu's Teleport takes you to the surface, the start, or a friend (not on Hardcore).
- **Dragon Endurance**: your world, kept, and wave after wave of dragons over it, a Fire Dragon
  first, then each kind in turn, each 100 tougher than the last (15 less for each one killed),
  10 to 30 seconds apart. No dead on the surface. Kill the Undead Dragon in Endurance to unlock
  it.
- **Creative**: Survival with nothing used up. Blocks, ammo and grenades last for ever, and
  making something takes nothing from what you carry (though tools wear twice as fast). A world
  played in Creative stays a Creative world.

You can keep as many worlds as you like: Create World, or pick one from the list (Delete A World
removes one). The one world kept before there were several becomes a world of its own in the
list. Options has Brightness, the Release Notes and Erase Storage (every world and award). The
31 awards are the original's, with their progress counted across your Endurance games.

You move as in the original: running once the stick is pushed most of the way (a key is all the
way, at 4 m/s), walking short of it, and a little faster through the air; a jump goes two and a
half metres up, enough for a ledge two blocks high; with Auto Climb on, you walk up a step a
block high. There's no sprint or crouch, as there's none in the original (an exo suit's dodge
and slam are on their keys: see below).

A day lasts 16 minutes, starting mid-morning. The first day is under a clear alien sky; early that
afternoon a storm rolls in for good. The HUD is the later version's: the health bar, the screen
going red as you're hurt, and arrows round the middle pointing to whatever hurt you.

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

The world is built as the original builds it: its world builder (`CastleMinerZBuilder`) and
each of its biomes, ported from its code with its own noise (DNA's Perlin and integer noise,
seeded by .NET's `System.Random`, in single-precision floats), so a seed gives the world the
original would give it, block for block. The zones run in rings out from the tower:

| Distance | Zone |
|---|---|
| 0 - 200 | Classic: rolling hills of grass and trees, sand where they're low, snow on the tops |
| 300 - 900 | Lagoon: lower land, with islands of rock floating over it |
| 1000 - 1600 | Desert |
| 1700 - 2300 | Mountains: steep and high, cut by narrow valleys, snow up high |
| 2400 - 3000 | Arctic: snow over ice, ice where it's low |
| 3000 - 3600 | the land sinks and breaks up, down to Hell's floor |
| 3600 - | Hell: its bloodstone floor and lava, open to a black sky |

with 100 m between each, where both are built. At 4400 the world turns back on itself, and the
zones come round again in reverse. Under everything, 28 or so blocks up from the bottom, a
bloodstone ceiling over Hell's cavern, and its floor of bloodstone and lava; caves through it
all; ore in the rock, more and richer further out (the same in every world, as the original's
ore noise is); and the tower at the origin, 125 high, round and stepping in, lanterns on its
tip. You start by it, at the original's (8, -8). The sky goes black as you go down (from 24
under the old ground level to 32 under), as it does over Hell's floor. Between 300 and 3600 m
out, the later version's crash sites: craters, each with an asteroid of space rock in it (Space
Goo glowing in the rock, more of it further out), the ground hollowed out under them.

A world kept from before this builder (marked Old land in the list) keeps the land it was made
on, so nothing built in it moves; a new world is the original's.

The later version's dead come too: the aliens round the crash sites (one every 10 to 20 seconds
near the rock, every 3 to 7 once noise rouses them: digging the rock, shooting inside the
asteroid), and the Felguard, a demon met first deep and far out underground, five minutes or more
apart, and once met, anywhere.

And its dragons, one at a time in the sky: Fire, Forest, Sand, Ice and Undead (20, 100, 300, 600
and 1000 of health). One comes the first time you're 100, 500, 1000, 2600 and 4000 m out, and
another for staying half an hour or so in one place, then the next kind in turn. Each flies in
from 750 m off and over; if it sees you out under the sky, it screams and comes for you, strafing
or hovering and spitting fireballs (an Ice Dragon's freeze what they hit), then circles round
again. Gunfire draws one that hasn't seen you; hitting it makes it angry. Its fireballs break
what that kind of dragon can break (less each time: the Undead's only stop at diamond walls). Shot
down, it falls, lies a few seconds, and leaves explosive powder, ingots, diamonds or bloodstone.
The guided missile locks on to it at the shoulder, slower the further off it is, and fires only
once it has. Online, the machine of the player it came for flies it (and hands it to whoever it's
chasing, if that's far off), everyone sees it, and every machine takes everyone's hits off it.

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

### The alien ship

This one isn't the original's; it's this game's own. Now and then, 20 to 60 minutes of play
apart from the second day on (never with No Enemies, or in Dragon Endurance), an alien mothership
comes in over the horizon, humming, and flies right over someone who's out under the sky. It
stops about 20 m past them, high over everything, sounds its alarm and shines a green light down
from its middle to the ground. Then every 9 seconds one of its eight drones dives out and plunges
into the ground round the foot of the light: pods two blocks high, with a glowing eye on top.

Climb onto a drone and shoot its eye (from the ground it shrugs it off): five hits and it gives
way, and the light takes you up through the middle of the ship. Inside is a round hall, the
ship's core hanging over the hole in its floor, shielded while its four power nodes stand (150 of
health each; the core has 600). Aliens beam in on its pads, and the core shoots at whoever's
there. Break the nodes, then the core (explosives work too), and the ship comes down: everyone in
it is let down the light, it blows apart, and each who was in it gets 2 Advanced Chips (what the
exo suit is made with, and the gadgets still to come), 16 Space Rock, 8 Space Goo and 6
diamonds. The light is the way out, too: drop through the hole
and it lets you down gently. Left alone, the ship leaves seven and a half minutes after it came,
letting down whoever's still in it. Its hull can't be broken or built on, and a game saved with
you up there keeps you on the ground under it.

Online, the host's game sends it: everyone sees the same ship and drones, everyone's hits go to
the host's count, and PVP in the hall goes by the host's setting, as it does anywhere (with PVP on,
the hall is an arena).

### The exo suit

This isn't the original's either: it's this game's own, after the exos of Call of Duty: Advanced
Warfare (Sledgehammer Games and Activision, 2014; StarMiner Z isn't affiliated with either). A
dark alloy frame over your body, cyan where its power runs: struts down your legs, hinged at the
hips, knees and ankles, a spine up your back to a power unit with two thrusters under it, a yoke
over the shoulders, and gauntlets on your forearms.

It's made on the crafting screen, under Gadgets, from 2 Advanced Chips, 12 iron, 4 diamonds and
4 Space Goo (you know the recipe once you carry an Advanced Chip). It's worn in the armor slot, a
slot of the inventory screen's own to the right of the backpack, which takes armor and nothing
else: put the suit there as you'd put anything in a slot, or shift-click it on or off (with a
controller, the armor slot is off either end of the backpack's rows). Worn, it moves you as an
exo moves its wearer:

| | Keyboard | Controller | |
|---|---|---|---|
| Boost Jump | Space, in the air | A, in the air | Up another three metres, once a jump; it takes a fall's speed off too |
| Boost Dodge | Shift | Left stick in | A burst of thrust the way you're going (forward when you aren't), about three metres, on the ground or in the air. Two charges, each back in a second and a half |
| Boost Slam | C | Right stick in | In the air, two metres or more up: straight down at 30 m/s. The dead within 4 m of where you land are hurt, the more the higher you came from and the nearer they are; the fall does you no harm |
| Exo Overclock | X | D-pad down | Half as fast again, the view a little wider, for as long as its battery lasts (five seconds from full; it charges again a second and a half after, an eighth of it a second) |

On a touch screen it has buttons of its own by the others while it's worn (OC, Dash, Slam). As
armor, it takes 35% of a hit (not of a fall or lava) and wears by what it takes: it's worn out
once it has taken 2500, from hits of about 7000 in all (seventy times your health). Its legs
take a landing of up to 20 m/s unhurt (about ten metres of fall; without it, 15 m/s, five and a
half). The HUD shows its battery and dodge charges under your health, and the screen's edge
glows blue while Overclock's on. When you die it stays on you, as the hotbar does; on Hardcore
it falls with everything else.

Online, everyone sees it on you and the flames of your boosts. A slam's landing goes to every
machine: each hurts its own dead with it (the kill is yours), and with PVP on, it takes a quarter
of the health of anyone else that near.

### Playing online

Up to eight players can play together in one world, as in CastleMiner Z:

- To host, choose Host Online and a mode (or Invite Friends from the pause menu of a game you're
  in). Once the world has loaded you get a five-letter code.
- Your friends choose Join Online and type the code (with a controller, A on the code changes it
  a letter at a time).
- Everyone plays in the host's world, mode and difficulty; a kept world is saved on the host's
  machine. Block changes go to everyone, and the time of day is the host's.
- An Endurance game can be joined only until it has begun: the host 100 m out, or into the second
  day. Dying in one, you come back by the nearest friend still standing after 20 seconds; once
  everyone's down, the host starts it over for all.
- The host's Host Options kick or ban a player (a ban keeps out the browser they played in, not
  everyone of that name; Clear Ban List lets them back), start the game over for everyone, and
  turn PVP on: then bullets, laser bolts, swings and an exo suit's slam hurt other players.
- Everyone needs the same version of the game: a friend on an older copy is told so, and gets the
  new `starminer-z-friends.html`.
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
- The game starts on Low graphics there, and draws itself at a lower resolution while frames are
  slow. Turning off Edge's "Apps can add a border" setting helps it run smoothly.
- What can't be seen isn't drawn: half the world's faces are deep underground in the dark (the
  caves and Hell's cavern under everything), and from anywhere not down there with them they're
  left out, the way in closed off by black faces where the light runs out, which is all they'd
  show. That's about half the triangles of a frame.
- Your own copy, with everything ripped from the original (its dragons, zombies, sounds), plays on
  the Xbox from a Windows PC on the same Wi-Fi: keep `Play on Xbox.bat` and `play-on-xbox.ps1`
  next to `starminer-z.html`, double-click the `.bat`, and type the address it shows into Edge on
  the Xbox. It's a small web server for the game, using the PowerShell that comes with Windows,
  and it stops when its window is closed. (A hosted copy, like the Claude artifact, has nothing
  ripped in it: the dragons there are built of the game's own geometry.)

## Developing

```
npm install
npm run dev             # http://localhost:5173 (?play skips the menus; &mode=survival|dragon, &diff=noenemies|easy|normal|hardcore, &creative)
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
`&peer=127.0.0.1:9000` to both players' addresses. `tools/online.mjs` plays two of them against
each other in headless Chromium (`BASE=<dev server url>/ node tools/online.mjs <out dir>`).

`tools/checks/` holds a headless check for each part of the later version: `things.mjs` (the new
items at work), `crash-sites.mjs`, `dragons.mjs`, `modes.mjs` (the modes, worlds, menus and
HUD), `movement.mjs` (the player's movement against the original's numbers), `xbox.mjs` (the game
as an Xbox's Edge has it), `graphics.mjs` (what happens when a browser has no WebGL, or loses
it mid-game), `hidden.mjs` (the faces left undrawn underground: fewer triangles, the same
picture), `mothership.mjs` (the alien ship, played through: its drones, the way up, the fight in
its hall, its end and its loot), `exo.mjs` (the exo suit and the armor slot: making it, putting
it on by mouse, pad and touch, each of its boosts measured, what it takes of a hit, kept in a
save and on dying) and `soak.mjs` (each mode played at random, unattended, for a while). Each takes the dev server's address and a folder for its screenshots
(`node tools/checks/modes.mjs http://localhost:5173 out`), and `&nocmz` as a third argument runs
it without the ripped files (`&ufo` brings the alien ship into the soak).

Test helpers: `tools/shoot.mjs` (screenshots in headless Chromium), `tools/flow.mjs` (walks the
menus with key presses), `tools/sim.mjs` (runs the game and reports what the enemies do),
`tools/eval.mjs` (runs a module in the page), `tools/cmz/hold.html?item=pistol` (the avatar
holding something, posed by the original's clips, from four sides). In the game,
`?play&horde=4&skel=2&archer=1` puts some of the dead in front of you, `&slot=2` picks a hotbar
slot, `&third` starts in third person, `&ads` aims, `&ufo` brings the alien ship at once,
`?seed=N` makes every new world from one seed, and `?nocmz` leaves out everything ripped from the
original.

### The original's sounds, bodies and hands

All the sound in the game but the alien ship's is CastleMiner Z's own: every cue (effects,
ambience and music) plays by the original's rules. So are the zombie and skeleton models, with
their animations and skins. So is how you hold things: in first person you see your avatar's own
arms from its eyes, as the original drew them, posed by its clips (picking, aiming at the
shoulder, firing, reloading) with its models of the pickaxe, guns, knife, compass and the rest in
your hand; in third person the avatar walks, runs and leans with the same clips.

None of these files are in this repository. They come out of your own copy of the game (its
`Content` folder) and go in `local-assets/`, which git ignores:

```
python3 tools/cmz/rip_audio.py  <Content> local-assets/audio    # needs ffmpeg
python3 tools/cmz/rip_models.py <Content> local-assets/models  # the dead, the aliens, the Felguard, the dragons
python3 tools/cmz/rip_player.py <Content> local-assets          # avatar clips, held items, the locator's marker
python3 tools/cmz/rip_ui.py     <Content> local-assets          # the inventory and crafting panel, the HUD's sprites
```

Without them the game is silent (but for the alien ship), the dead are built on the avatar rig,
the dragons are built of blocks, what you hold is drawn from parts, and the inventory has a panel
of its own.

## Credits

- The character rig, avatar part meshes, clothing and face textures and animations come from the
  Avatar Animation Pack for XNA Game Studio 4.0 by Microsoft Corporation, used under the
  Microsoft Permissive License (Ms-PL); see `LICENSE-avatar.txt`.
- The alien ship's hum and alarm (`src/assets/sounds/`): "Spaceship hum, low frequency" by
  audiopapkin and "Extraterrestrial alert sound" by fnx_sound, from Pixabay, cut down and made
  mono for the game.
- three.js and PeerJS (MIT). Fonts: Archivo Black, Open Sans and Saira Semi Condensed (SIL Open Font
  License), from Google Fonts.
- CastleMiner Z's sounds, music, models and animations (when you rip them from your own copy;
  see above) belong to DigitalDNA Games and aren't distributed here.
- Everything else (the world, sky, the alien ship, the exo suit, the stand-in zombies and
  skeletons, interface) is this project's own work.
