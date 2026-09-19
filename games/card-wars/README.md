# Floop the Pig

A turn-based **Card Wars** game — the one Finn and Jake play on the treehouse floor in
Adventure Time S4E14, not the mobile game — played on a 3D mat, with [Clash Royale][cr]'s
economy, card cycle and menu bolted on. One self-contained HTML file, no build step, no
dependencies.

```
open games/card-wars/index.html
```

## The mat

Two sides of a 3×3 grid facing each other across a river, with **three bridges** — one per
lane. Every one of the eighteen tiles rolls a random biome at the start of the match, and
you can **floop a tile** for 2 juice, once a turn, to retill it into whatever you like.
That's the loop: bend the ground under your feet toward the deck you brought.

It's built with CSS 3D transforms — the mat is a plane rotated on X, creatures are
counter-rotated standees that stand up off their tiles, and the whole thing is scaled to
fit the viewport by measuring what's actually drawn (the castles and standees lean out past
the board's own box, so fitting to that box alone cuts the near row off).

## Depth means something

- **Every rested creature in a lane swings**, so stacking a lane lands the whole push at once.
- All of it goes at the enemy's **frontmost** creature. Whoever you leave in *your* front row
  is the one who gets hit — so that row is the tank slot, which is what structures are for.
- **Ranged** creatures reach across from any row, so they can shoot from the back.
- The defender hits back for **half its attack, rounded down**, onto your front row, whatever
  is standing there. Nothing with 0 attack ever hits back.
- Kill with damage to spare and it **breaks through** into whatever is behind — and into
  their life if the lane is empty.

## Going indoors

Straight out of the episode: Finn sends the Pig to the Cave of Solitude for a nap, and the
Ancient Scholar to study in the Schoolhouse. Tap a structure, then a creature in the same
lane, and it moves in.

| Structure | What the lodger gets |
| --- | --- |
| **The Cave of Solitude** | Invulnerable to all harm — spells and combat both — and heals 2 a turn. Jake simply could not reach the Pig. |
| **The Schoolhouse** | Studies: 3 juice a turn, and a permanent +1/+1 each turn up to +4/+4. |
| **Spirit Tower** | A ranged creature shoots from inside at +3 attack and cannot be touched. |
| **Silo of Truth** | 2 juice a turn, 3 with a corn creature inside, and it heals its lodger. |

Each structure only takes lodgers it's built for. If the structure falls, the lodger is
turned out into an empty tile in that lane — or goes down with it if there's nowhere to stand.

## Biomes

Six, as in the show. Every tile blesses whoever stands on it. Every card has a **home
biome**: a creature played onto its own biome costs 1 less and arrives with +1/+1, and a
spell costs 1 less and hits 1 harder while you control a tile of its biome.

| Biome | Blessing |
| --- | --- |
| 🌽 Cornfields | +1 ATK |
| 💧 Blue Plains | +2 max HP |
| 🌸 Nice Lands | heals 1 at the start of your turn |
| 🏜️ SandyLands | Rush — attacks the turn it lands |
| 🪵 Useless Swamp | no stats at all, but nobody aims a spell at the swamp: untargetable |
| 🌈 Rainbow | +1/+1, and it counts as every card's home |

## What came from Clash Royale

| Clash Royale | Here |
| --- | --- |
| Elixir regenerating in real time | **Juice** at the top of each turn, 4 → 8, banking to 10 |
| Double elixir | Double juice from round 11 |
| 8-card deck, 4-card hand, next-card preview | 12-card deck, 5-card hand, same cycle — play a card, the next slides into its slot, no drawing or shuffling |
| Lanes, bridges, units auto-fighting | Three bridges, lanes resolving at end of turn |
| Crown towers | Empty lane → damage straight to life |
| 3-minute cap | BMO calls it on round 18, most life wins |
| The menu | Arena banner, trophy road, level badge, gold, chest slots, deck builder, card levels |

Trophies move ±30/22 and carry you through six arenas; chests drop gold and card copies;
copies plus gold level a card up (+1 HP at level 2, +1 ATK at level 3). It all lives in
`localStorage`, wrapped in try/catch so a private window just starts fresh. The opponent's
cards level with your arena, so the ladder keeps pace.

## 36 cards

Card Wars cards actually named on screen in the episode — Husker Knights, the Immortal Maize
Walker, Cool Dog, The Pig, Summon Archer Dan, Legion of Earlings, Ancient Scholar, The Field
Reaper, Wandering Bald Man, Silo of Truth, Spirit Tower, The Cave of Solitude, Cerebral Blood
Storm, Volcano, Field of Nightmares, Reclaim Landscape, Teleport — plus the Schoolhouse, and
the rest built in the same spirit with some Adventure Time deep cuts (Banana Guard, Choose
Goose, Tree Trunks, Cosmic Owl, the snail).

Five decks: **Cornlord**, **Blue Plains Blitz**, **Swamp Doctor**, **Study Hall**, and
**Jake's Spare Deck** — the pile of expensive weirdos Jake lends Finn, which is exactly as
clunky as it sounds and is what the easy opponent plays.

## Tests

```
test/run.sh            # rules, click paths, balance
```

The engine runs headless in a `vm` with a stub DOM, so all three suites test the real code:

- `rules.test.js` — 19 checks on the garrison and biome rules, driven through the actual
  click handlers. The Cave really does make its sleeper untouchable by spells *and* combat.
- `ui.test.js` — 200+ whole matches driven only through `onHandClick` / `onTileClick` /
  `handleAct`, plus the deck builder, chests and upgrades. Asserts nothing crashes and no
  targeting state ever wedges. This is what caught a crash in the card detail sheet.
- `sim.js` — a few hundred matches for pacing and balance.

Current numbers: ~9 rounds a match, 0% draws, opponents winning 20–58%, all four player
decks landing between 54% and 81%.

### What the simulation actually changed

Three rules exist because the numbers said so, not because they were designed in:

- **Whole lanes swing.** With only the frontmost creature attacking, eighteen tiles of
  blocking deadlocked the board: 25% of matches timed out as draws at 16 rounds.
- **Break through.** Without overkill carrying, the deadlock came back in a different shape.
- **The defender hits back at your front row, whoever they are.** Ranged creatures used to be
  exempt, which made cheap-ranged decks strictly dominant.

And one honest caveat: the opponent AI is competent — it garrisons, floops, contests all
three bridges and times its spells — but a strong player will beat it. Its weakness is action
economy: it averages ~3.5 actions a turn against a bot that manages 6. I tuned its
thresholds by sweep (that alone took it from ~1.3 actions a turn to ~3.5, roughly doubling
its win rate), but the remaining gap is in its greedy one-move-at-a-time search, not in a
coefficient. Difficulty also rides on deck matchup more than on the skill setting.

## Controls

`1`–`5` pick a card · `F` floop a tile · `E` end turn · `Esc` cancel · everything is clickable.

## Fan work

Card Wars and Adventure Time belong to Cartoon Network. This is an unofficial fan project
made for fun, not affiliated with or endorsed by anyone who owns any of it.

[cr]: https://en.wikipedia.org/wiki/Clash_Royale
