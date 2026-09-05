# Floop the Pig

A turn-based **Card Wars** game — the one Finn and Jake play on the treehouse floor in
Adventure Time S4E14, not the mobile game — with [Clash Royale][cr]'s economy bolted on.
One self-contained HTML file, no build step, no dependencies.

```
open games/card-wars/index.html
```

## Why those two things go together

The show's game gives you the *board*: four lanes of landscape, creatures that stand on
terrain that blesses them, life points, and flooping. What it never gives you is a reason
to make a decision on any particular turn — Jake's explanation famously takes two hours
and is mostly nonsense.

Clash Royale gives you exactly that missing piece, and it happens to survive being made
turn-based intact:

| Clash Royale | Here |
| --- | --- |
| Elixir regenerating in real time | **Juice** arriving at the top of each turn, 4 → 7, banking up to 10 |
| Double elixir at 2:00 | **Double juice** from round 11 |
| 8-card deck, 4-card hand, next-card preview | Identical. Play a card, the next one slides into its slot, the played card goes to the back |
| Units auto-fight down their lane | Creatures auto-attack the lane opposite them at end of turn |
| Break a tower, hit the King | Empty lane = damage straight to life |
| 3-minute cap, most crowns wins | BMO calls it on round 18, most life wins |

The cycle is the important import. Eight cards means you always know roughly what's coming
back around, so "which lane" and "which turn" become real decisions instead of draw luck.

## Rules

- **25 life.** Take theirs to 0, or be ahead on round 18.
- **Four lanes**, one creature each, and each lane sits on a landscape fixed by your deck.
- Creatures are asleep the turn they land (`zzz`) unless they have Rush.
- At end of turn every rested creature hits the lane opposite it:
  - empty lane → **straight to the face**
  - defended lane → they fight. Yours deals full attack, the defender hits back for **half
    its own attack, rounded down**. A 0-attack creature never hits back, which is what
    makes a wall a wall.
  - **break through** → kill the defender with damage to spare and the leftover carries
    into their life. Chump-blocking only buys you the difference.
- **Floop** a creature to use its ability. It taps: no attack from that one this turn.
  That trade is the whole mechanic. FLOOP THE PIG.

### Landscapes

Every creature standing on a terrain gets its blessing, and a creature played on **its own
home terrain costs 1 less juice**.

| Terrain | Blessing |
| --- | --- |
| 🌽 Cornfields | +1 ATK |
| 💧 Blue Plains | +2 max HP |
| 🌸 Nice Lands | heals 1 at the start of your turn |
| 🏜️ SandyLands | Rush — attacks the turn it lands |
| 🪵 Useless Swamp | no stats at all, but nobody aims a spell at the swamp: creatures here can't be targeted |
| 🌈 Rainbow | +1/+1, and it counts as every creature's home |

Useless Swamp being useless is the joke from the episode — Jake sets Finn up with it. The
spell immunity is the one concession, so the lane is a real choice instead of a dead one,
and `Reclaim Landscape` exists if you'd rather retill it.

## Decks

Four decks, eight cards each, each with its own four landscapes.

- **Cornlord** — Jake's. Husker Knights scale off your Cornfields; the Maize Walker closes.
- **Blue Plains Blitz** — cheap and fast, and yes, one of your four lanes is the swamp.
- **Swamp Doctor** — stall behind the Cave, retill the mat, let the Field Reaper do the talking.
- **Floop Machine** — floop for juice, floop for arrows, ramp into something enormous.

Opponents: **Finn** (easy), **Jake** (normal), **BMO** (hard). Each plays a different deck
with a different search depth.

## Balance

The rules engine runs headless, so the numbers below come from simulation rather than vibes
(800 matches against a board-flooding opponent):

- Jake wins ~50%, BMO ~54%, Finn ~1% — the difficulty ladder does what it says
- ~13 rounds per match, 1.6% draws
- All four decks land between 52% and 82%

Two rules exist purely because the simulation demanded them. Without **retaliation** nothing
ever died and the four lanes deadlocked at 3/4 full by round 6. Without **break through** the
deadlock came back a different way, with 16% of matches timing out as draws.

## Controls

`1`–`4` pick a card · `E` ends your turn · `Esc` cancels a target · everything is clickable.

## Fan work

Card Wars and Adventure Time belong to Cartoon Network. This is an unofficial fan project
made for fun, not affiliated with or endorsed by anyone who owns any of it. The card names
in quotes are the ones actually named on screen in the episode; the rest are invented in the
same spirit.

[cr]: https://en.wikipedia.org/wiki/Clash_Royale
