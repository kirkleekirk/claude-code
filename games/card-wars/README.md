# Floop the Pig

A real-time **Card Wars** game — the one Finn and Jake play on the treehouse floor in
Adventure Time S4E14, not the mobile game — played on a 3D mat with blocky creatures that
walk, cross bridges and fight on their own, and a [Clash Royale][cr]-shaped shell around it.
One self-contained HTML file, no build step, no dependencies, no libraries.

```
open games/card-wars/index.html
```

## No turns

Juice fills on its own. Creatures fight the moment they land. The clock runs the whole time.

- **150 seconds**, double juice for the last minute, then sudden death if nobody is ahead.
- Tap a card, tap your half of the mat, and it walks in. Creatures pick the nearest bridge,
  cross, and attack whatever they meet.
- Four cards in hand out of a twelve-card deck; play one and the next slides in.

## The objective is the wall

Each side has **three walls**, one per bridge, and a **keep** behind them.

- The keep is sealed while its walls stand. Break a wall and two things happen: the keep
  opens up, and **that lane opens for you** — you can deploy past the river in it.
- Destroy the keep and you win outright. At time, whoever broke more walls wins.
- Walls shoot back, so a lane is genuinely defensible. Keeping them off yours is half the game.

## The creatures are models, not cards

Every creature is an original blocky puppet assembled from real CSS 3D boxes — each box is
three faces (top, front, side) standing up off the tilted ground plane, so they have actual
volume, catch the light differently per face, and sort by depth against each other. Body
plans (`brute`, `scamp`, `lanky`, `crawler`, `hulk`, `tower`, `bunker`) give each card its
silhouette, and each card its own colour. Nothing is a picture; it's all geometry.

No Three.js, no WebGL, no sprites. The whole thing is transformed DOM, which keeps the text
crisp and every creature clickable.

Screen↔world is a closed form: the ground is a plane tilted on X inside a perspective
container, so two invisible markers on the plane give the centre and the scale, and the
projection inverts exactly. Round-trip error measures **0.00 world pixels**, which is what
makes tap-to-deploy land precisely where you tapped.

## The ground still matters

Your half is nine patches of biome, rolled at random each match. Creatures take the blessing
of whatever they're standing on — and it updates as they walk. A card deployed onto **its own
biome** costs 1 less and arrives stronger. **Floop a patch** for 2 juice to retill it.

| Biome | Blessing |
| --- | --- |
| 🌽 Cornfields | +20% attack while standing on it |
| 💧 Blue Plains | +25% health on arrival |
| 🌸 Nice Lands | regenerates 2% a second |
| 🏜️ SandyLands | +30% move speed |
| 🪵 Useless Swamp | no stats at all — but enemy spells simply don't land there |
| 🌈 Rainbow | +15% everything, and it counts as every card's home |

## Going indoors, automatically

From the episode: Finn sends the Pig to the Cave of Solitude for a nap, and the Ancient
Scholar to study in the Schoolhouse. Here creatures walk in **by themselves** when they pass
a structure that will take them:

| Structure | What the lodger gets |
| --- | --- |
| **The Cave of Solitude** | Safe from everything — spells and combat both — and heals fast, then walks back out |
| **The Schoolhouse** | A scholar studies, growing steadily stronger, then graduates onto the field |
| **Spirit Tower** | A ranged creature shoots from inside, harder, and can't be touched |
| **Silo of Truth** | Pays juice while it stands, more with a corn creature inside |

Each structure only takes lodgers it's built for. If it falls, the lodger is turned out
rather than lost — and gets a spell out of doors before it'll go back in.

## The shell

The menu is the original Clash Royale layout: arena banner and trophy road over six arenas,
level badge, gold, four chest slots, deck builder, card levels bought with duplicates plus
gold. It all lives in `localStorage`, wrapped in try/catch so a private window just starts
fresh. The opponent's card levels scale with your arena.

36 cards, five decks, five opponents.

## Tests

```
test/run.sh            # rules, click paths, balance
```

The engine runs headless in a `vm` with a stub DOM and is stepped at a fixed `dt`, so all
three suites drive the real code:

- **rules.test.js** — 25 checks: walls sealing and unsealing the keep, creatures funnelling
  onto bridges and reaching the far wall, every biome blessing, the swamp turning spells away,
  and the whole lodger cycle from walking in to graduating back out.
- **ui.test.js** — 100 whole matches driven only through `onHandClick` / `onFieldPoint` /
  `handleAct`, plus the menu, deck builder, chests and upgrades. 10,000 simulated clicks,
  asserting nothing crashes and no selection is ever left hanging.
- **sim.js** — a few hundred matches for pacing and balance.

Current numbers: ~100s a match, no draws to speak of, opponents winning 34–91%.

### What testing actually caught

- A graduate walked straight back into the Schoolhouse on the next tick and studied forever.
- Destroyed walls were filtered out of the sim list, so the lane they guarded could never be
  recognised as open — the reward for breaking a wall silently did nothing.
- The ground overflowed its container, because a perspective projection isn't symmetric about
  the layout box: the near edge reaches further than the far edge contracts. It sat under the
  card dock and swallowed every deploy tap.

**Honest caveat:** the opponent reacts on a timer, defends the lane being pushed and commits
when it has juice to spare, but it doesn't read a push the way a person does. Against the
benchmark bot it wins around 76%, though that bot is deliberately simple. Difficulty still
rides on deck matchup more than on the reaction-speed setting.

## Controls

`1`–`4` pick a card · `F` floop a patch · `Esc` cancel · everything is tappable.

## Fan work

Card Wars and Adventure Time belong to Cartoon Network. This is an unofficial fan project
made for fun, not affiliated with or endorsed by anyone who owns any of it. All the creature
models are original geometry.

[cr]: https://en.wikipedia.org/wiki/Clash_Royale
