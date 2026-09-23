# Dungeon Train

A fan-made **third-person extraction RPG** for PC, set on the *Dungeon Train* from *Adventure Time*: an endless train that loops around Ooo, where every car is a dungeon room with monsters and a treasure chest. Pick **Finn** or **Jake**, board a train line, fight car to car, crack chests, beat the boss — and get off before the Loop takes everything.

Open `index.html` in a desktop browser with WebGL (mouse and keyboard). Three.js loads from cdnjs the first time, so you need an internet connection; there is no build step. Progress saves to the browser's local storage, and the Journal can copy or load a save code (`DT1:…`). Saves from the older *Algebraic Express* version are not carried over.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look and aim (the camera sits over your shoulder) |
| Left click (hold) | Primary attack — Finn's sword combo, Jake's stretchy punch |
| Space · Shift · Right click | Dodge roll / stretch-dash |
| 1 2 3 4 | Abilities |
| Q | MATHEMATICAL! super (the meter fills as you fight) |
| E (hold) | Open chests, unlock vaults, jump off, pull the brake |
| Z X C V B | Snacks on your belt |
| Tab | Backpack (equip finds, drop things, move items into your safe pocket) |
| Esc | Pause, settings and controls |
| Mouse wheel | Camera zoom |

The game captures the mouse (pointer lock) for mouse-look. If the page isn't allowed to — some embedded frames block it — it switches to **cursor aiming**: aim with the cursor and turn the camera with right-drag, the arrow keys or the screen edges. You can pick cursor aiming in Settings too.

## A trip

1. **Pick a line** on the Train Board: Grassland, Candy, Crypt, Lava, Ice, Nightmare and Crystal cars, then the Engine. Each trip rolls a car count, maybe a treasure vault, and a modifier (Rush Hour, Express Loop, Treasure Train, Elite Patrol).
2. **Clear cars.** Every dungeon car (crypt, library, armory, banquet, prison, mushroom) has monsters and a chest that unlocks when the car is clear. Some chests need a Skeleton Key. Vaults are locked behind a gate you smash or unlock. Elites (Lemongrab, Magic Man, king-sized monsters) drop better loot.
3. **Watch the Loop.** A meter fills during the trip. When it's full the train enters the **Loop Tunnel**: it goes dark, you take damage, and after 25 seconds you're *Looped* and lose the trip.
4. **Get off** through a green **jump-off door** (hold E), the **engine brake** (bonus gold and XP), or a **Rainicorn flare**.
5. **Beat the boss.** Each line's boss car sits before the engine behind a gate that opens when the boss falls (King Slime, the Earl of Lemongrab, the Bone Baron, the Flame King, the Ice King, Hunson Abadeer, the Crystal Colossus, the Conductor). Bosses have three phases. Carry the boss's **trophy** off the train to power up both heroes and open the next line. Stop the Conductor and pull the brake to break the Loop — then start a **New Journey** with a permanent perk.

Knocked out (or Looped)? You lose everything you were wearing and carrying. Only the **safe pocket** comes home: Finn's **Hat Stash** (1 slot) and Jake's **Tummy** (2 slots), both upgradable.

## Two heroes, two ways to grow

Each hero has their own level, skill points, skill tree, gear and ability keys. The stash, gold and trophies are shared. The simulation is driven by per-player *commands*, so more players can be added later.

- **Finn — the gear hero.** A sword (the sword type sets his combo: short sword, greatsword with a floor slam, fast rapier stabs, crystal blade waves), a helmet, body armor, gauntlets, boots, a backpack (how much loot he carries out) and up to four relics. Full **armor sets** (Candy Knight, Crystal Guardian, Flame Knight, Billy's Battle Garb, Dungeon Delver) unlock 2- and 4-piece bonuses. His tree makes his gear better: armor per piece, cheaper set bonuses, stronger item Powers, a fourth relic slot.
- **Jake — the skill hero.** No weapon and barely any armor: just a collar and two relics. He punches by stretching his arm, and his **instrument** changes how the punch works — viola notes, a guitar fist that hangs in the air and follows your aim, exploding drums, a sweeping bass, a trumpet blast, triple accordion fists, super-fast banjo jabs, keytar lightning. His skill tree hits much harder than Finn's, he earns a bonus point every 4 levels, and his magic makes him hit harder and gain armor every level.

## Loot

| Rarity | What it does |
| --- | --- |
| Plain | Base stats only |
| Radical | Base stats + 1 random bonus |
| Algebraic | Base stats + 2 random bonuses |
| Mathematical | Stats, 2 bonuses and a **Power** that changes how you fight (sword beams, freezing hits, lingering fists, chain lightning…) |
| Legendary | Named items with signature powers; some come with their own ability |
| Glob-Tier | The rarest loot on the train: build-changing powers and their own ability |

Examples: **Rainbow Riff** (a guitar whose fist stays out for seconds and can be dragged through enemies, and grants *Rock Out*), **Frost Heart** (a relic that Freezes enemies you hit), the **Ice King's Crown** (grants *Frost Nova*). Freezes, Chill, Shatter, Burn, Bleed, Shock, Stun, Root and Fear stack into late-game builds.

## Menus

- **Loadout** (styled after ARC Raiders' inventory): equipment on the left, the 3D hero and a live stat sheet in the middle, the stash on the right. Hover any item for a plain-English card: what it is, how it changes your attack, every stat, its Power, its set, and exactly what would change if you equipped it. Drag and drop, double-click to equip, right-click for actions. The **Abilities** tab binds skill-tree abilities and item abilities to keys 1–4 in one place; item abilities leave when the item comes off.
- **Skills:** a node web for each hero (79 and 77 nodes: small bonuses, notables, abilities, ability upgrades, keystones, slot unlocks). Pan, zoom, search, unlock a whole path at once, refund single nodes or reset.
- **Shop** (Choose Goose), **Workshop** (BMO: upgrade to +5, reroll bonuses, imbue a Power, swap a Power, salvage), **Journal** (trophies, legendary collection, stats, how to play, glossary, save codes, New Journey).

## Code layout

```
index.html            page shell and script order
css/style.css         menus, item tiles, HUD
js/core.js            namespace, helpers, saves, settings, icons, sound
js/data/              heroes, items and sets, Powers, uniques, abilities, skill trees, train lines and enemies
js/meta/              save state, stats, loot, skill tree rules, inventory/shop/workshop logic
js/game/              renderer, models, the train, input (commands), heroes and enemies, combat, abilities, the trip
js/ui/                item art, shared components, loadout, skill tree view, HUD, hub screens
js/main.js            boot, screens, actions, drag and drop, tooltips, 3D backdrops
```

Fan project; *Adventure Time* belongs to its creators.
