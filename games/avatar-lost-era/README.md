# Avatar: Legends of the Lost Era

An unofficial, fan-made **open-world survival RPG** inspired by *Avatar: The Last Airbender*, built as a
**single HTML file** with A-Frame and WebXR. It plays on desktop (mouse and keyboard), on phones
(touch, landscape) and in VR headsets.

You are a new Avatar, about 3,000 years before the Hundred Year War: an era the show never visits.
Survive the frontier valley of Tienhai with bending, learn new techniques through trials drawn from
the show's lore, and uncover why something is crossing over from the spirit world.

> Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari, or the Quest browser).
> It loads A-Frame 1.6.0 from `aframe.io` and fonts from Google Fonts, so it needs an internet connection.
> Progress saves in your browser automatically (and from the pause menu).

## What's in Chapter One
- **Characters**: every person is built on one of two CC-BY base meshes (a male and a female body, see Credits), re-rigged to a 30-bone skeleton with clavicles and toes. Nation clothing is painted onto the body with crisp hems, belts, cuffs and boot tops, and fitted garments are sized from the body's own cross-sections: fur-trimmed parkas, crossed-collar robes, high collars, pauldrons and bracers, Air Nomad mantles and sashes. Faces are placed by ray casts against the real head: glossy eyes in the sockets, blinking lids, brows and lips. Hair is grown from the mesh's own scalp, and long hair hangs clear of the shoulders. Fingers close into fists for fire and earth strikes and open for air and water.
- **Animation fitted to the bodies**: a ground-contact solver plants the lowest point of the body every frame, so feet stand on the ground, sitting rests on the seat and lying rests on the back. Walking and running use a stance/swing gait whose stride comes from the leg length, so planted feet don't slide. Running has real flight phases. Clavicles shrug when the arms rise, heels peel and toes bend at push-off. Poses that touch the body are two-bone IK targets solved per body: the fist-and-palm bow, bringing food to the mouth, healing hands, gathering, and cross-legged meditation with the hands on the thighs. Limbs blend between poses by swing and twist, so arms move the way arms move.
- **Character creation**: four nations, eleven homelands (each with its own perk and reveal story), four upbringings, two body frames, height, build, skin, eight hair styles, hair and eye colour, and three attire sets per nation.
- **A hand-built valley**: Tienhai Village, the Elder Banyan, the Lookout Pagoda with its spiral stair, Lake Yue and the Moon Pool Shrine, the Sun Warrior Ruins with their Eternal Flame, Sky Bison Peak, the Badgermole Cave, the daofei camp, the Misty Pillars, the Ember Crags and the Eastern Shore. Full day/night cycle with sun, moon phases and stars.
- **Survival**: hunger, thirst, warmth, stamina, cooking, campfires, sleeping, sickness from raw meat, fall damage and swimming. Every element has its own survival tools: firebenders cook in their hands, earthbenders raise stone tents, waterbenders pull water (and fish) from rivers, airbenders leap and fall softly.
- **21 bending techniques** across the four elements, plus meditation, spirit sense and element awakening. Locked "later in your journey" and "unknown to this era" techniques are visible on the scroll as a promise of what's coming.
- **Show-accurate rules**: fire is stronger by day; water is stronger at night and at full moon, and needs a source; earthbending needs ground contact; the opposite element is the hardest to learn; elements are awakened at their original teachers.
- **Wildlife**: turtle-ducks, rabbaroos, possum-chickens, hog-monkeys, ostrich-horses, platypus-bears, saber-tooth moose-lions, canyon crawlers, sky bison and a badgermole. Prey flee, predators hunt you *and* other animals, beasts fear fire, and nothing follows you into the village.
- **People**: eight villagers with dialogue, trade and lore, and five daofei with ranged and melee AI. You can choose to spare them.
- **Story**: six quests from arrival to a vision of your past life.

## Controls
| | Desktop | Touch | VR |
|---|---|---|---|
| Move / look | WASD + mouse (click to capture) | Left stick / drag right side | Left stick / head; right stick turns |
| Bend | LMB, RMB, 3, 4, 5 | Big round buttons | Trigger (selected), grip (second); A cycles |
| Switch element | Q / E / wheel | ELEM | B |
| Jump / Air Leap | Space | ⤒ | Right stick up, or left trigger |
| Interact / harvest / talk | F | ✋ | X |
| Eat / drink skin | X / Z | EAT | Y |
| Campfire / meditate | B / C | — / CALM | — / left grip |
| Bending scroll, satchel, map, journal | K or Tab, I, M, J | BAG, MENU | (exit VR) |

## Project layout
```
index.html        ← the game: one self-contained file (generated)
build.sh          ← concatenates src/ into index.html
src/00_head.html  ← page, styles, UI markup
src/10_core.js    ← math, noise, all lore data (nations, techniques, creatures, places)
src/20_world.js   ← terrain, water, sky, vegetation, landmarks, colliders
src/05_bodies.js  ← the two base-mesh bodies, rigged and packed (generated by tools/build_bodies.py)
src/30_models.js  ← creature models, the action/pose library (incl. IK reach targets), creature animation
src/31_humanoid.js← humanoid builder (body paint, fitted garments, face, hair), IK, ground contact, gait and animation
assets/           ← the CC-BY source meshes (.glb)
tools/            ← glb_read.py and build_bodies.py: GLB → normalised, re-rigged, re-posed body data
src/40_entities.js← particles, sound, creature/daofei/villager AI, projectiles, earth structures
src/50_game.js    ← player, techniques, environment, survival, progression, quests, saving
src/60_ui.js      ← dialogue, HUD, menus, creator, input (keyboard/touch/VR), main loop, boot
tests/            ← automated suite, sweep, visual tour, model close-ups, animation review sheets, mobile layout check
VISION.md         ← the long-term plan: story, regions, bosses, systems
```

## Developing
```bash
./build.sh                          # rebuild index.html after editing src/
npm i playwright                    # or use a global Playwright install with Chromium
mkdir -p tests/.cache && npm pack aframe@1.6.0 && tar xzf aframe-1.6.0.tgz \
  && cp package/dist/aframe-master.min.js tests/.cache/   # offline copy of A-Frame for tests
node tests/run-tests.js             # full automated suite → tests/REPORT.md
node tests/run-tests.js techniques  # one group
node tests/run-sweep.js "" views   # large sweep (~10,000 checks) → tests/SWEEP_REPORT.md, viewpoint screenshots in views/
node tests/tour.js shots            # screenshots of every place, creature, technique and menu
node tests/models.js shots-models   # character close-ups: lineups, faces, fists, poses
node tests/anims.js shots-anims     # every action at four moments, gaits and poses, both body frames
python3 tools/build_bodies.py       # rebuild src/05_bodies.js from assets/*.glb (needs numpy)
node tests/mobile.js shots-mobile   # phone layout screenshots
```
The suite drives the real game in headless Chromium: it walks the stairs and bridges, casts every
technique at targets, lets predators hunt, sleeps through nights, plays through the story, walks
every dialogue tree, checks every model and animation for invalid values, and checks that rendered
frames contain real content. See `tests/REPORT.md` for the latest run.

The sweep (`tests/run-sweep.js`) checks the whole world object by object:
- every tree, rock, bush, reed and bamboo clump, for floating, water, roads, buildings, stairs and overlap;
- every collider, against every road;
- every road, walked end to end in both directions;
- every landmark, reached on foot;
- 1,200 random walks across the map;
- every tree, bush and rock, harvested;
- every animation on every nation/frame/hair combination, for anatomical joint limits, planted feet, and hands and elbows never sinking into the torso, head or ground;
- every creature state, on real terrain;
- every technique, for every native element, by day and night;
- every dialogue line at every story stage;
- randomised save/load round-trips;
- a grid of rendered viewpoints;
- HUD/menu layout at 14 desktop and phone screen sizes.

See `tests/SWEEP_REPORT.md`.

## Credits
The two character bodies are third-party models used under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):
- **"Low-Poly Male Body"** by [Tidominer](https://sketchfab.com/tidominer):
  [source](https://sketchfab.com/3d-models/low-poly-male-body-ddf11918aa8042cf9f43193f33611f47)
- **"Low Poly Female Base Mesh"** by [Mesh-Base](https://sketchfab.com/mesh-base):
  [source](https://sketchfab.com/3d-models/low-poly-female-base-mesh-583d7e9c0de945beb30004eabac92a26)

Changes made: converted from GLB and rescaled. Both meshes are rigged to this game's skeleton: the female's artist
weights are remapped, and the male's are computed. The arms are re-posed from A-pose to hanging, and the
female's legs are brought under the hips and her silhouette softened. At runtime both are painted and dressed
in nation clothing, hair and faces. The original files are in `assets/`; the conversion is `tools/build_bodies.py`.

## Notes
- Fan project, not affiliated with or endorsed by the creators or rights holders of *Avatar: The Last Airbender*. All world details beyond the show are original inventions for this era.
- Menus are 2D and can't be used inside a VR headset yet: open your scroll before entering VR. VR has a wrist display for health, chi, hunger, thirst and warmth.
