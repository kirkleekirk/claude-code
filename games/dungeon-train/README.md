# Dungeon Train

A fan-made **third-person extraction RPG** for PC, set on the *Dungeon Train* from *Adventure Time*: an endless train that loops around Ooo, where every car is a dungeon room with monsters and a treasure chest. Pick **Finn** or **Jake**, board a train line, fight car to car, crack chests, beat the boss — and get off before the Loop takes everything.

Open `index.html` in a desktop browser with WebGL (mouse and keyboard). Three.js loads from cdnjs the first time, so you need an internet connection; there is no build step. Progress saves to the browser's local storage, and the Journal can copy or load a save code (`DT1:…`). Saves from the older *Algebraic Express* version are not carried over.

## Controls

| Key | Action |
| --- | --- |
| WASD · arrow keys | Move (up the screen, down, left, right) |
| Mouse | Aim — point at a monster to lock on |
| Left click (hold) | Primary attack — Finn's sword combo, Jake's stretchy punch |
| Space · Shift · Right click | Dodge roll / stretch-dash |
| 1 2 3 4 | Abilities |
| Q | MATHEMATICAL! super (the meter fills as you fight) |
| E (hold) | Open chests, unlock vaults, jump off, pull the brake |
| Z X C V B | Snacks on your belt |
| Tab | Backpack (equip finds, drop things, move items into your safe pocket) |
| Esc | Pause, settings and controls |
| Mouse wheel | Camera zoom |

The camera is **locked**: it looks into the car from a fixed angle, like a dollhouse with the roof and the near wall cut away, and slides along the train with you. It never turns, so W is always up the screen and D is always toward the engine. Tall furniture fades out when it gets between the camera and your hero, and your hero shows as an outline when a boss stands in front of them.

Prefer the old over-the-shoulder view? Turn on **Free camera** in Settings: the mouse turns the camera (pointer lock). If the page isn't allowed to lock the mouse — some embedded frames block it — you aim with the cursor and turn with right-drag or the arrow keys.

## A trip

1. **Pick a line** on the Train Board. Each trip rolls a car count, maybe a treasure vault, and a modifier (Rush Hour, Express Loop, Treasure Train, Elite Patrol).
2. **Clear cars.** Every dungeon car (crypt, library, armory, banquet, prison, mushroom, mine, wizard lab, vampire ballroom) has monsters and a chest that unlocks when the car is clear. Some chests need a Skeleton Key. Vaults are locked behind a gate you smash or unlock. Elites drop better loot.
3. **Watch the Loop.** A meter fills during the trip. When it's full the train enters the **Loop Tunnel**: it goes dark, you take damage, and after 25 seconds you're *Looped* and lose the trip.
4. **Get off** through a green **jump-off door** (hold E), the **engine brake** (bonus gold and XP), or a **Rainicorn flare**.
5. **Beat the boss.** Each line's boss car sits before the engine behind a gate that opens when the boss falls. Bosses have three phases. Carry the boss's **trophy** off the train to power up both heroes. Beat Future Finn in the Engine and pull the brake to break the Loop — then take on the Lich, or start a **New Journey** with a permanent perk.

## The lines

| Tier | Line | Monsters | Boss |
| --- | --- | --- | --- |
| 1 | Grassland Cars | slimes, gnome wizards, penguins | King Slime |
| 2 | Candy Cars | candy zombies (gumdrop, peppermint, candy corn, gummy), jelly beans, penguins; elite: Lemongrab | Earl of Lemongrab |
| 2 · branch | Classic Dungeon Cars | Crystal Ants, Geode Warriors, Mud Monsters, Hair Apes (from “Dungeon Train”); elite: Dungeon Warrior | The Flesh Beast |
| 3 | Dungeon Cars | Bucket Knights, skeletons, ghosts (from “Dungeon”); elites: the Guardian Angel, Magic Man | The Demon Cat (afraid of dogs — bring Jake) |
| 4 | Lava Cars | fire wolves, flame guards | The Flame King |
| 4 · branch | Wizard City Cars | wizards, laser wizards, forest wizards; elites: Bufo, Magic Man | The Grand Master Wizard (pop his bubble) |
| 5 | Ice Cars | snow golems, ice wolves, penguins | The Ice King |
| 6 | Nightmare Cars | imps, chaos demons, skeletons, ghosts | Hunson Abadeer |
| 6 · branch | Vampire Cars | vampires, vampire bats; elites: the Fool, the Empress, the Hierophant, the Moon (from “Stakes”) | The Vampire King |
| 7 | Crystal Cars | crystal guardians, crystal bats | A Citadel Guardian (head laser) |
| 8 | The Engine | Crystal Ants and everything else | Future Finn — the Finn who never got off the train |
| 9 · after the Loop | The Lich's Well | possessed snails, ghosts, skeletons | The Lich |

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
- **Skills:** a node web for each hero (79 and 77 nodes: small bonuses, notables, abilities, ability upgrades, keystones, slot unlocks). Pan, zoom, search, unlock a whole path at once, refund single nodes or reset.
- **Shop** (Choose Goose), **Workshop** (BMO: upgrade to +5, reroll bonuses, imbue a Power, swap a Power, salvage), **Journal** (trophies, bestiary, legendary collection, stats, how to play, glossary, save codes, New Journey).

## Code layout

```
index.html            page shell and script order
css/style.css         menus, item tiles, HUD
js/core.js            namespace, helpers, saves, settings, icons, sound
js/data/              heroes, items and sets, Powers, uniques, abilities, skill trees, train lines and enemies
js/meta/              save state, stats, loot, skill tree rules, inventory/shop/workshop logic
js/game/              renderer, hero models, monster models (bestiary.js), the train, input (commands), heroes and enemies, combat, abilities, the trip
js/ui/                item art, shared components, loadout, skill tree view, HUD, hub screens
js/main.js            boot, screens, actions, drag and drop, tooltips, 3D backdrops
```

Fan project; *Adventure Time* belongs to its creators.
