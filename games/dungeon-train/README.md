# Dungeon Train

A fan-made **third-person extraction RPG** for PC, set on the *Dungeon Train* from *Adventure Time*: an endless train that loops around Ooo, where every car is a dungeon room with monsters and a treasure chest. Pick **Finn** or **Jake**, board a train line, fight car to car, crack chests, beat the boss — and get off before the Loop takes everything. The optional lines leave the train behind: the train stops, and you explore a whole place in Ooo instead.

Open `index.html` in a desktop browser with WebGL (mouse and keyboard). Three.js loads from cdnjs the first time, so you need an internet connection; there is no build step. Progress saves to the browser's local storage, and the Journal can copy or load a save code (`DT1:…`). Saves from the older *Algebraic Express* version are not carried over.

## Controls

| Default key | Action |
| --- | --- |
| W A S D | Move (forward, left, back, right, relative to where you look) |
| Mouse | Look around and aim (the crosshair) |
| Left click (hold) · J | Primary attack — Finn's sword combo, Jake's stretchy punch |
| Space · Left Shift · Right click | Dodge roll / stretch-dash |
| 1 2 3 4 | Abilities (3 and 4 are also on mouse buttons 4 and 5, the side buttons) |
| Q | MATHEMATICAL! super (the meter fills as you fight) |
| E or F (hold) | Open chests, unlock vaults, use exits, pull the brake |
| Z X C V B | Snacks on your belt |
| Tab · I | Backpack (equip finds, drop things, move items into your safe pocket) |
| Esc · P | Pause, settings, controls and key bindings |
| ← → | Turn the camera without the mouse |
| Mouse wheel | Camera distance |

**Every action can be rebound** (Pause → Keys and buttons, or Settings on the title screen): up to three keys per action, and any mouse button counts, including the two side buttons (shown as Mouse 4 and Mouse 5). Click a key, press the new key or button, right-click a key to clear it.

The camera sits **behind your hero, over the right shoulder, and is locked there**: the mouse turns the camera and your hero turns with it, so your hero always faces where you look and your attacks go where the crosshair points (a little aim assist bends them onto a monster near the crosshair). Walking backward is a bit slower than walking forward. The camera pulls in when a wall, the ceiling or a closed gate gets in the way, and tall furniture fades out between the camera and your hero. If the page isn't allowed to capture the mouse (some embedded frames block it), or you'd rather not, turn on *Hold the right mouse button to look* in Settings.

## A trip

1. **Pick a line** on the Train Board. Each trip rolls a car count, maybe a treasure vault, and a modifier (Rush Hour, Express Loop, Treasure Train, Elite Patrol).
2. **Clear cars.** Every dungeon car (crypt, library, armory, banquet, prison, mushroom, mine, wizard lab, vampire ballroom) has monsters and a chest that unlocks when the car is clear. Some chests need a Skeleton Key. Vaults are locked behind a gate you smash or unlock. Elites drop better loot.
3. **Watch the Loop.** A meter fills during the trip. When it's full the train enters the **Loop Tunnel**: it goes dark, you take damage, and after 25 seconds you're *Looped* and lose the trip.
4. **Get off** through a green **jump-off door** (hold E), the **engine brake** (bonus gold and XP), or a **Rainicorn flare**.
5. **Beat the boss.** Each line's boss car sits before the engine behind a gate that opens when the boss falls. Boss cars are much bigger than the other cars (40 × 16 m, 8 m high) so bosses have room for their big attacks. Carry the boss's **trophy** off the train to power up both heroes. Beat Future Finn in the Engine and pull the brake to break the Loop — then take on the Lich, or start a **New Journey** with a permanent perk.

### Off the train

The branch lines and the Lich's Well aren't train cars. The train stops and you explore a **place**: a map of rooms and halls, different every trip, with side rooms, loops, dead ends, a treasure vault in a dead end, and the boss room somewhere you have to find (the exact center of the Mystery Dungeon, the far corner of the Vampire Hive, across Wizard City, down the tracks in the Lich's Well). The HUD shows a map of the rooms you've found.

Instead of the Loop, each place has its own **alarm** that fills while you're there (the dungeon stirring, the Wizard Police, the hive waking, the Well rising). Get out through one of the green **exits** before it's full. When you walk into the boss room its gates close behind you: you're locked in until the boss falls, and then a **way home** opens in the middle of the room.

### Bosses

Bosses have three phases, and each phase adds attacks: expanding shockwave rings (**novas**) you dodge-roll through or outrun, **sweeping** beams, **rain** of marked circles, walls of fire or ice that roll across the room (**waves**), and **leaps** onto your spot, on top of slams, charges, spreads, summons and pulls. Every big attack is telegraphed on the floor. Bosses and elites shrug off stuns, freezes, roots and fear for a while after each one, so they can't be stun-locked, and a boss that's still standing after two or three minutes gets **enraged**: it moves faster and attacks a lot more often. Expect to dodge and to eat snacks.

## The lines

| Tier | Line | Monsters | Boss |
| --- | --- | --- | --- |
| 1 | Grassland Cars | slimes, gnome wizards, penguins | King Slime |
| 2 | Candy Cars | candy zombies (gumdrop, peppermint, candy corn, gummy), jelly beans, penguins; elite: Lemongrab | Earl of Lemongrab |
| 2 · branch, off the train | The Mystery Dungeon | Crystal Ants, Geode Warriors, Mud Monsters, Hair Apes (from “Dungeon” and “Dungeon Train”); elite: Dungeon Warrior | The Flesh Beast, in the room that lies exactly center |
| 3 | Dungeon Cars | Bucket Knights, skeletons, ghosts (from “Dungeon”); elites: the Guardian Angel, Magic Man | The Demon Cat (afraid of dogs — bring Jake) |
| 4 | Lava Cars | fire wolves, flame guards | The Flame King |
| 4 · branch, off the train | Wizard City | wizards, laser wizards, forest wizards, the Wizard Police; elites: Bufo, Magic Man | The Grand Master Wizard, in the palace courtyard (pop his bubble) |
| 5 | Ice Cars | snow golems, ice wolves, penguins | The Ice King |
| 6 | Nightmare Cars | imps, chaos demons, skeletons, ghosts | Hunson Abadeer |
| 6 · branch, off the train | The Vampire Hive | vampires, vampire bats; elites: the Fool, the Empress, the Hierophant, the Moon (from “Stakes”) | The Vampire King, in the throne room |
| 7 | Crystal Cars | crystal guardians, crystal bats | A Citadel Guardian (head laser) |
| 8 | The Engine | Crystal Ants and everything else | Future Finn — the Finn who never got off the train |
| 9 · after the Loop, off the train | The Lich's Well (an old subway station) | possessed snails, ghosts, skeletons | The Lich, at the Well of Power |

Main-line trophies open the next tier (all seven open the Engine). Branch-line trophies are optional extra power. The Journal's **Bestiary** has a portrait, where-to-find and a fighting tip for every monster you've beaten.

Knocked out (or Looped)? You lose everything you were wearing and carrying. Only the **safe pocket** comes home: Finn's **Hat Stash** (1 slot) and Jake's **Tummy** (2 slots), both upgradable.

## Two heroes, two ways to grow

Each hero has their own level, skill points, skill tree, gear and ability keys. The stash, gold and trophies are shared. The simulation is driven by per-player *commands*, so more players can be added later.

- **Finn — the gear hero.** A sword (the sword type sets his combo: short sword, greatsword with a floor slam, fast rapier stabs, crystal blade waves), a helmet, body armor, gauntlets, boots, a backpack (how much loot he carries out) and up to four relics. Full **armor sets** (Candy Knight, Crystal Guardian, Flame Knight, Billy's Battle Garb, Dungeon Delver, Bucket Knight, Vampire Hunter, Wizard City Regalia) unlock 2- and 4-piece bonuses. His tree makes his gear better: armor per piece, cheaper set bonuses, stronger item Powers, a fourth relic slot.
- **Jake — the skill hero.** No weapon and barely any armor: just a collar and two relics. He punches by stretching his arm, and his **instrument** changes how the punch works — viola notes, a guitar fist that hangs in the air and follows your aim, exploding drums, a sweeping bass, a trumpet blast, triple accordion fists, super-fast banjo jabs, keytar lightning, bluesy harmonica notes, a huge OOM-PAH tuba blast, a spooky floating theremin fist. His skill tree hits much harder than Finn's, he earns a bonus point every 4 levels, and his magic makes him hit harder and gain armor every level.

## Loot

| Rarity | What it does | Where it turns up |
| --- | --- | --- |
| Plain | Base stats only | Everywhere |
| Radical | Base stats + 1 random bonus | Everywhere |
| Algebraic | Base stats + 2 random bonuses | A good find in a chest; every early boss drops one |
| Mathematical | Stats, 2 bonuses and a **Power** that changes how you fight (sword beams, freezing hits, lingering fists, chain lightning…) | Rare: from the Candy Cars on, mostly from bosses and elites. From the Ice Cars on, every boss drops one |
| Legendary | Named items with signature powers; some come with their own ability | Very rare, from the Dungeon Cars on |
| Glob-Tier | The rarest loot on the train: build-changing powers and their own ability | Only on the last lines |

Good gear is meant to be earned: a first trip usually brings home a few Plain and Radical pieces and one Algebraic prize from King Slime. Levels come slowly too — a trip is worth a level or two at first, and reaching level 24 for the Engine takes a few dozen trips. Choose Goose never sells anything better than Radical on the first line (Algebraic later), and Power items in the shop cost a lot.

Examples: **Rainbow Riff** (a guitar whose fist stays out for seconds and can be dragged through enemies, and grants *Rock Out*), **Frost Heart** (a relic that Freezes enemies you hit), the **Ice King's Crown** (grants *Frost Nova*), the **Citadel Guardian's Blade** (grants a *Citadel Laser*), **The Future Orb** (blocks a hit every 8 seconds), the **Vampire King's Fang**, **Jake's Blues Harp**. Freezes, Chill, Shatter, Burn, Bleed, Shock, Stun, Root and Fear stack into late-game builds.

## Menus

- **Loadout** (styled after ARC Raiders' inventory): equipment on the left, the 3D hero and a live stat sheet in the middle, the stash on the right. Hover any item for a plain-English card: what it is, how it changes your attack, every stat, its Power, its set, and exactly what would change if you equipped it. Drag and drop, double-click to equip, right-click for actions. The **Abilities** tab binds skill-tree abilities and item abilities to keys 1–4 in one place; item abilities leave when the item comes off.
- **Skills:** a node web for each hero (79 and 77 nodes: small bonuses, notables, abilities, ability upgrades, keystones, slot unlocks). Pan, zoom, search, unlock a whole path at once, refund single nodes or reset. Nodes further from the center need a higher **hero level** (level 1 near the start, up to level 22–23 at the edge) and are much stronger: a small bonus on the outer rings is worth up to 2.5 times one near the center. Small bonuses near the center can be bought **up to three times** (each rank needs 2 more levels), so early on it often pays to rank up the nodes you have instead of racing down one branch.
- **Shop** (Choose Goose), **Workshop** (BMO: upgrade to +5, reroll bonuses, imbue a Power, swap a Power, salvage), **Journal** (trophies, bestiary, legendary collection, stats, how to play, glossary, save codes, New Journey).
- **The look:** the menus are drawn like the show: cream paper cards with thick dark-ink outlines and flat offset shadows, big rounded title lettering, and bright Ooo colors. The title screen opens with a camera sweep over Ooo (the Ice King's mountain, the Candy Kingdom, the Tree Fort) like the show's intro, every trip starts with an episode title card, and the trip result ends on a quiet field with bugs like the end credits. `docs/adventure-time-bible.md` collects the research the game's places, monsters, jokes and style are built on.

## Code layout

```
index.html            page shell and script order
css/style.css         menus, item tiles, HUD
js/core.js            namespace, helpers, saves, settings, icons, sound
js/data/              heroes, items and sets, Powers, uniques, abilities, skill trees, train lines and enemies
js/meta/              save state, stats, loot, skill tree rules, inventory/shop/workshop logic
js/game/              renderer, hero models, monster models (bestiary.js), the world (train cars and off-train places), input (commands, key bindings), heroes and enemies, combat, abilities, the trip
js/ui/                item art, shared components, loadout, skill tree view, HUD, hub screens
js/main.js            boot, screens, actions, drag and drop, tooltips, 3D backdrops
docs/                 the Adventure Time research notes the content is based on
```

Fan project; *Adventure Time* belongs to its creators.
