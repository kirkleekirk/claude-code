# Algebraic Express

A fan-made **3D extraction action RPG** set in the world of *Adventure Time*, loosely based on the episode "Mystery Train". You play as Finn and Jake. The Ice King has kidnapped the princesses, frozen them into blocks of ice, and loaded them onto magic trains that run across Ooo, and he has called up a blizzard to cover his escape. Board a train, fight car to car, grab everything shiny, and bail off before the blizzard freezes you solid.

To play, open `index.html` in a modern browser. It needs WebGL. You also need an internet connection the first time, because Three.js loads from cdnjs. There is no build step. Progress saves to your browser's local storage, and the Journal tab can export or import a save code.

## The loop

1. **Pick a trip** on the mission board in the Tree Fort. There are seven routes: Grasslands, Candy Kingdom, Fire Kingdom, Ice Kingdom, Nightosphere, the Crystal Dimension, and finally the Ice King's own Blizzard Express. A trip can carry a modifier (Crowded, Express, or Treasure).
2. **Fight through the cars.** The train rolls from the caboose toward the engine. Each car is a passenger, dining, cargo, sleeper, or lounge car, or a locked vault. Smash crates and luggage for loot, open chests, and beat up penguins, slimes, gnomes, fire wolves, skeletons, and more. Elites such as Lemongrab and Magic Man carry better drops.
3. **Watch the blizzard.** A meter fills throughout the trip. When it is full, a 25-second **whiteout** starts. If you are still on board when it ends, you are frozen solid and lose the trip.
4. **Get off.** There are three exits:
   - Hold E at a **bail-out door** for 3.5 seconds.
   - Pull the **engine brake** for a ×1.25 gold bonus.
   - Fire a **Rainicorn flare** to be picked up.

   If both heroes are knocked out or the blizzard wins, you **wipe**. A wipe loses all equipped gear, your backpack, and your snack belt. **Jake's Tummy** is the secure container, and whatever is inside it always comes home.
5. **Rescue the princesses.** Each route from Grasslands to Crystal has a frozen princess to thaw and carry home, and each one gives a permanent perk. Once all six are rescued and you reach level 20, the Blizzard Express opens. There you fight a three-phase boss battle against the Ice King. Beating him unlocks the ending and **New Game+**, where you keep a journey perk and one keepsake item.

## Systems

- **Two heroes, one team.** Tag-switch between Finn (fast, sword, crits) and Jake (tanky, stretchy reach, crowd control) at any time. The other hero follows under AI control. A knocked-out buddy can be revived by holding E beside them.
- **Skill tree.** There are 60 nodes across five branches:
  - *Hero* and *Adventurer* are Finn's.
  - *Stretchy* and *Shapeshifter* are Jake's.
  - *Bros* is shared.

  Each branch has four tiers, and the tiers unlock as you spend points. The tree includes **14 active abilities**, such as Sword Beam, Hero's Leap, Giant Jake, Stretchy Slam, Brofist, and the Fastball Special. Each hero gets two ability slots, and a third opens at level 8. Landing hits charges a shared **MATHEMATICAL!** super meter.
- **Leveling.** Heroes go up to level 40. You get 1 skill point per level and 2 on every fifth level. Routes unlock as you extract from them and as your level catches up with them.
- **Items.**
  - There are six rarities: Plain, Radical, Algebraic, Mathematical, Legendary, and Glob-Tier.
  - Swords, knuckles, hats, and trinkets roll random affixes. Rarer gear can also roll a power, such as zapping enemies on a crit or healing on a kill.
  - There are **25 relics**, each with its own hooked power. Examples:
    - The Scarlet sword heals you on crits.
    - The Grass Sword and the Finn Sword fire beams.
    - The Demon Blood Sword ignites enemies.
    - BMO's cartridge summons a drone.
    - The Ice King's crown fires ice bolts.
    - The Nightosphere Amulet makes enemies explode when they die.
    - A Lich fragment drains life from enemies.
- **Snacks and tools.** Bacon pancakes, burritos, candy, ice cream, science potions, Gunter bombs, hot cocoa, Rainicorn flares, and skeleton keys go on a three-slot belt.
- **Economy.** Sell treasure and gear to Choose Goose, buy from Choose Goose's rotating stock, and at BMO's workbench salvage items into dust and shards, then use those to upgrade or reroll gear.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | left stick |
| Attack | J or left click (aims at the cursor) | ⚔ button |
| Dash | Space, Shift, or right click | dash button |
| Switch hero | Q or Tab | swap button |
| Interact / revive | E or F (hold) | hand button |
| Abilities | 1, 2, 3 | ability buttons |
| Snacks | 4, 5, 6 | tap a belt slot |
| MATHEMATICAL! super | R | super button |
| Inventory | I | Inventory button |
| Pause | Esc or P | pause button |

## Code layout

```
index.html          page shell and script order
css/style.css       all styles (inked cartoon theme, HUD, hub, skill tree)
js/core.js          namespace, RNG, save storage, SVG icon set, synthesized sound
js/data/*.js        items, relics, skills and abilities, world (routes, cars, enemies, princesses)
js/meta/*.js        save state, stat computation, loot rolls, hub actions (DOM-free)
js/game/gfx.js      Three.js renderer, toon materials, ink outlines, effects
js/game/models.js   Finn, Jake, enemies, props, and the Tree Fort, built from primitives
js/game/world.js    train generation, car layouts, collision
js/game/input.js    keyboard, mouse, and touch input
js/game/actors.js   hero and enemy movement, AI, animation
js/game/combat.js   damage, statuses, projectiles, zones, abilities, and the Ice King
js/game/raid.js     a single trip: the loop, loot, blizzard, extraction, wipe
js/ui/*.js          components, HUD, hub tabs, skill tree view
js/main.js          boot, render loop, Tree Fort diorama, screen flow, autosave
```

Everything is plain script files that share one `window.AE` namespace, so the page also works when opened straight from disk.

*Adventure Time* and its characters belong to Cartoon Network. This is an unofficial fan project.
