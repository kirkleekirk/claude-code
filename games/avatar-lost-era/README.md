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
src/30_models.js  ← humanoid and creature models and procedural animation
src/40_entities.js← particles, sound, creature/daofei/villager AI, projectiles, earth structures
src/50_game.js    ← player, techniques, environment, survival, progression, quests, saving
src/60_ui.js      ← dialogue, HUD, menus, creator, input (keyboard/touch/VR), main loop, boot
tests/            ← automated suite, visual tour, mobile layout check
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
node tests/tour.js shots            # screenshots of every place, creature, technique and menu
node tests/mobile.js shots-mobile   # phone layout screenshots
```
The suite drives the real game in headless Chromium: it walks the stairs and bridges, casts every
technique at targets, lets predators hunt, sleeps through nights, plays through the story, walks
every dialogue tree, checks every model and animation for invalid values, and checks that rendered
frames contain real content. See `tests/REPORT.md` for the latest run.

## Notes
- Fan project, not affiliated with or endorsed by the creators or rights holders of *Avatar: The Last Airbender*. All world details beyond the show are original inventions for this era.
- Menus are 2D and can't be used inside a VR headset yet: open your scroll before entering VR. VR has a wrist display for health, chi, hunger, thirst and warmth.
