# Last Car Out

A fan-made **extraction RPG** inspired by *Infinity Train*. You wake up on an endless train. Every car is its own pocket world, and there is a glowing Number on your palm. Raid cars for loot, get out alive, and bring your Number down to zero to find the door home.

Play it by opening `index.html` in any modern browser. There is no build step and no dependencies. Progress saves to your browser's local storage, and the Journal tab can export or import a save code.

## The loop

1. **Board a car** from the Departures board. Each car has a theme, a tier (1–10), a **rule** that bends its physics, and a **lesson**: an optional objective that lowers your Number further.
2. **Explore** the car as a grid of compartments under fog of war. Compartments hold caches, fights, elites, curiosities, vaults, merchants, hazards, and rest nooks.
3. **Watch the Instability.** Every step shakes the car apart. At 75% enemies hit harder; at 100% each step hurts; at 150% the car unmakes itself with you inside.
4. **Extract** through the Far Door, a hatch, a locked coupling, or a toll gate to keep everything. If you die, you lose everything you wore and carried. Only the **Secure Pouch** survives.
5. **Grow.** Spend skill points, upgrade gear at the Workbench, sell valuables to the Cat, and push into deeper tiers. With your Number at 30 or lower, the Engine opens: two boss fights stand between you and the door home.

## Systems

- **Skill tree:** 85 nodes across five branches (Passenger, Denizen, Conductor, Reflection, Corruption), seven tiers each, including 27 active abilities. Equip up to six abilities on your bar.
- **Leveling:** 50 levels. You earn 1 skill point per level and 2 every fifth level. Car tiers open as you level up and as you extract from your highest tier.
- **Items:** six rarities (Worn, Sturdy, Fine, Exquisite, Relic, Engine-Forged). Gear rolls random affixes. Exquisite gear adds a minor power. **26 Relics** have unique hooked powers, for example a revive, a summoned corgi knight, extracting from anywhere, or trading HP percentages with a foe. There is also a two-piece set: One-One, Reunited.
- **Combat:** turn-based, built on action points and Focus. Enemies telegraph their intents. There are 17 status effects: bleed, burn, ever-growing Corruption, chill that freezes at 3 stacks, mirror images, and more. Some enemies steal from your pack and run, so kill them before they escape.
- **The Number:** it drops when you extract and when you learn lessons. It rises when you die, kill peaceful denizens, or make certain choices. At 150 or higher, Stewards start hunting you.
- **Ending and New Game+:** go home with a permanent Memory and one keepsake item, then start a new journey.

## Controls

- Click or tap everything.
- In a car, use the arrow keys or WASD to move.
- In a fight, use Q to strike, B to brace, 1–6 for abilities, F to flee, and E to end your turn.

## Code layout

```
index.html          page shell and script order
css/style.css       all styles (a single, intentional night-train theme)
js/core.js          namespace, RNG, save storage, SVG icon set
js/data/*.js        statuses, items, relics, skills, abilities, enemies, cars, events
js/engine/*.js      state, stats, loot, combat, raid, hub (DOM-free game logic)
js/ui/*.js          components, hub, skills, raid and combat views
js/main.js          boot, render loop, input, autosave
```

The engine doesn't touch the DOM, so you can drive it headlessly from Node by setting `global.window = global` and requiring the files in the order that `index.html` lists them.
