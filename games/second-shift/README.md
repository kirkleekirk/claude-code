# Second Shift

A hero-dispatch game for the browser. You are the new dispatcher at Meridian Hero Dispatch, a budget agency staffed by second-chance supers. Calls come in, you read the stat bars, pick a team, and send them out. When a call turns into a fight you can fight it yourself on a tactical grid.

Single self-contained file, no assets, no build step to play: open `index.html`.

## Play

| | |
|---|---|
| **Run** | Open `index.html` in a modern browser (desktop or phone). Audio is synthesized with WebAudio, so click anywhere to start it. |
| **Save** | Automatic, in `localStorage`. |
| **Length** | 10 story shifts (about 5 minutes each) plus endless Overtime shifts. |

### Dispatch desk

| Input | Action |
|---|---|
| Click a call / map pin | Select it. Arrow keys cycle calls. |
| Click a hero (or an empty slot) | Add or remove them. The chip on each hero shows how much they change the odds. |
| `Enter` | Dispatch (or Take Command on a fight). |
| `Space`, `1` `2` `3` | Pause, normal, fast, fastest speed. Time skips ahead by itself when nothing needs you. |

### Battles

| Input | Action |
|---|---|
| Blue tiles / `M` | Move (once per turn, before or after acting). |
| `1`–`4` | Basic, two skills, ultimate (needs 100 Hype). Hover a red tile for a damage, knockback and turn-order preview. |
| `E` / `Space` / `Enter` | End turn. `Esc` or right-click cancels aiming. |
| `R` | Radio HQ: once per battle, a medevac, pep talk or roadblock. |

## What makes it tick

**Dispatch loop.** Five stats (Combat, Vigor, Mobility, Charisma, Intellect). Every call shows a requirement profile; your team's stats fill the bars. Odds come from how well the team covers the profile, plus tag bonuses, hero chemistry, perks and radio-check answers. The displayed number is the real one, and **at 80% or more a call cannot fail** (only the quality of the result is random). Injured heroes lose 1 on every stat and go Down if hurt again, so sending a tired hero is a real gamble.

**Pacing.** Shift 1 is three calls with a coach. Chemistry arrives in shift 2, fights in shift 3, radio checks and recruiting soon after. From shift 5 calls cluster, windows shrink, rivals poach missed calls, crisis calls need three heroes, and shift 10 ends on a boss fight.

**Tactical battles.** 9×6 grid, a speed-based turn timeline you can read ten turns ahead, move + act in either order, line / cone / burst / row / dash / swap attack shapes, knockback and pull with slam damage, explosive barrels, fire, ice, live wires and time bombs, flank bonus (+40%), Hype-charged ultimates with cut-ins, telegraphed enemy attacks, and boss fights. Every hero has a 4-ability kit; enemies use the same ability engine.

**Progression.** XP and levels give points for stats and perks. Funds buy recruits and five HQ upgrades. You cannot afford everything, so the choices matter.

## Layout

```
games/second-shift/
  index.html            built single file (what you play)
  src/                  source, concatenated in filename order by build.mjs
    00-core.js            helpers, RNG, storage, WebAudio synth + music
    10-data.js            heroes, abilities, enemies, encounters, calls, shifts, story
    20-art.js             icons, procedural character renderer, map, arenas
    30-model.js           save, progression, success math, shift simulation
    40-ui-core.js         modals, dialogue scenes, hero sheet, settings, help
    45-hub.js             dispatch desk (clock, map, queue, roster, call panel)
    60-combat-engine.js   battle rules, ability resolver, AI (no DOM)
    65-combat-render.js   canvas board, particles, event playback
    66-combat-flow.js     battle HUD, input, turn loop
    70-flow.js            title, briefing, report, HQ, keyboard, boot
    style.css, body.html
  build.mjs             node build.mjs   (add --artifact for a wrapper-less page)
  tools/qa.mjs          headless QA: validate | fuzz | sweep | bot
```

## QA

`tools/qa.mjs` drives the built page headlessly with Playwright:

- `validate` checks data integrity (encounter overlaps, call ids, kits).
- `fuzz` runs random battles, executes every ability on every legal target and asserts invariants (no overlapping units, HP in range, no exceptions).
- `sweep` runs AI-versus-AI battles for win rates and round counts.
- `bot [smart|mid|lazy] [runs]` plays all shifts through the model and prints grades, odds, injuries and the economy. It is how the difficulty curve and pay were tuned.

## Credits

Inspired by the shift-and-dispatch loop of *Dispatch* (AdHoc Studio) and the grid combat of *South Park: The Fractured But Whole*. All characters, names, writing and art here are original, and everything is drawn and synthesized in code.
