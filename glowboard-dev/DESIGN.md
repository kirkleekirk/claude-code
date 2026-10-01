# GLOWBOARD — Card Wars (as seen in *Adventure Time*, S4E14) — design pass

Fan-made, offline, single-file game. Director's note wins over the original brief: the game plays like
**Card Wars from the show** (and its official 2014 adaptations), and the brief's systems are mapped onto it.

## Show reference (episode "Card Wars")
* Jake & Finn play in the Tree Fort; holograms rise from a game board when cards are "flooped" onto it.
* Stakes: loser is the **Dweeb** (drinks the gross cup), winner is the **Cool Guy**.
* Jake (Cornfield + a Useless Swamp): Husker Knights ("draw energy from corn"), Silo of Truth (floop: see
  Finn's hand, steal Cerebral Bloodstorm), Field of Nightmares + Legion of Earlings, Teleport, Volcano (floop:
  lava wipes the board), Reclaim Landscape, Immortal Maize Walker ("Cornfields give triple damage"),
  Wandering Bald Man (gets stuck in the mud), Summon Archer Dan (destroys buildings), the Reaper (steals souls).
* Finn (Blue Plains): Cool Dog, Ancient Scholar (studies in the Schoolhouse, learns Raise the Dead),
  **the Pig** (floop: runs over and eats Jake's cornfields; "pigs can't leave mud landscapes"), Spirit Tower
  (takes control of the Maize Walker), Cave of Solitude (the Pig naps there, untouchable).
* Finn's side glows blue, Jake's glows yellow/orange; stolen creatures change colour.

## Core rules (official Card Wars + show)
| Rule | Value |
|---|---|
| Hero HP | 25 each. Reduce the other hero to 0 to win |
| Lanes | 4. Each player has a Landscape per lane; each lane holds 1 Creature + 1 Building per player |
| Deck | 20 cards, max 2 copies, max 1 Champion. Deck also lists its 4 Landscapes |
| Hand | Start 5, one free mulligan, draw 1 each turn (first player too), hand max 8 |
| Actions | 2 per turn (no banking). Spend on cards (cost 0-2), 1 Action = draw a card, 1 Action = move a creature to an adjacent lane |
| Landscape requirement | A card of cost N needs N face-up Landscapes of its type. Champions cost 2 but need 3. Rainbow = no requirement |
| Floop | A creature/building ability: turn the card sideways. Once per turn, allowed the turn it is played. Flooped creatures do not attack but still defend |
| Fight | When you end your turn every Ready (un-flooped) creature attacks the lane across. Defender hits back simultaneously. Empty lane: a face-up enemy Building absorbs the hit (excess spills to the hero), otherwise the hero takes it |
| First turn | The first player may not Floop or Fight on turn 1 (official rule) |
| Replace | Playing onto your occupied slot discards the old card (a creature must be Ready to be replaced) |
| Overtime | From round 15, the active hero takes (round-14) damage at turn start |

### Keywords
Guard (attacks into your adjacent empty lanes hit it instead), Flying (ignores non-flying defenders and Guards,
takes no hit back), Ranged (takes no hit back when attacking non-ranged), Siege N (+N vs buildings),
Lifesteal (fight damage heals your hero), Shield N (absorbs damage), Burn N (N dmg at end of its controller's
turn, then -1), Chill (-1 ATK per stack; 2 stacks = Frozen; wears off at end of its controller's turn),
Frozen (can't fight, floop, move or hit back; thaws at end of its controller's next turn), Rot (1 dmg at end
of its controller's turn, can't heal, spreads to adjacent allies on death), Stuck (can't move or be moved),
Ripen (end of turn, if it didn't floop/move and stands on a face-up Cornfield: +1/+1, max +2/+2),
Immortal (returns to hand when destroyed), Trap (face-down building, springs when an enemy creature is
played or moved into the opposing lane).

### Home Advantage (creature of type X standing on face-up landscape X)
| Landscape | Hero | Home Advantage | Signature |
|---|---|---|---|
| Blue Plains | Finn | Breezy: moves cost 0 Actions | Floop tricks, mobility, landscape-eating, mind control |
| Cornfield | Jake | Corn-Powered: +1 ATK | Swarm (Earlings) and growth (Ripen) |
| Useless Swamp | Marceline | Grave Muck: when destroyed a 1/1 Zombie rises in its lane | Rot, Zombies, soul stealing |
| IcyLands | Ice King | Frostbite: creatures it damages in fights are Chilled | Chill/Freeze control, push |
| NiceLands | Princess Bubblegum | Nice Day: heals 1 at your turn start | Shields, buildings, spells |
| LavaFlats | Flame Princess | Scorch: creatures it damages in fights Burn 1 | Burn, siege, aggro |

### Structure <-> creature systems (brief section 8)
Garrison: Cave of Solitude, Tree Fort, Schoolhouse. Auras: Corn Dome, Gumdrop Tower. Forges: Fire Forge,
Schoolhouse. Spawners/reanimators: Cornucopia, Crypt, Penguin Igloo. Traps: Mud Pit, Frozen Lake, Booby Trap
(+ Spirit Tower reacts). Siege: Archer Dan, Lava Golem, Lava Cannon, Candy Wall thorns. Links: Gumdrop
Towers, Magic Portal pairs. Control zones: Ice Castle, Fire Pit, Blizzard Wizard push.

## Card list (cost = Actions and landscape requirement; L = Champion)
Numbers are tuned by the balance harness; the engine data table is the source of truth.

**Blue Plains** — Hot Dog Knight 0 1/2 (destroyed: draw) · Cool Dog 1 2/5 (floop: enemy across -2 ATK
until your next turn) · Ancient Scholar 1 1/5 (floop: Study; at 3, Raise the Dead) · Sky Pup 1 2/3 Flying ·
Cloud Ranger 2 3/7 (+2 ATK when it moves) · **The Pig** L 3/7 (floop: eat the landscape across, 1 dmg; muddy) ·
Schoolhouse 1 B5 · Spirit Tower 2 B6 · Cave of Solitude 1 B6 · Mathematical! 0 · Adventure Time! 2 ·
Rainicorn Ride 1.

**Cornfield** — Cornball 0 1/2 Ripen · Husker Knight 1 2/4 Ripen, collapses · Scarecrow 1 1/6 Guard ·
Husker Worm 2 3/6 (Earlings beside it) · Corn Ronin 2 2/6 (+1 ATK per other ally) · **Immortal Maize
Walker** L 1/8 (triple damage with 3+ Cornfields, Immortal) · Silo of Truth 2 B5 · Cornucopia 1 B4 ·
Corn Dome 2 B5 · Cerebral Bloodstorm 1 · Field of Nightmares 2 · Plant Corn 0.

**Useless Swamp** — Swamp Wisp 0 1/1 Flying · Mud Slinger 1 2/4 (Rot) · Gravedigger 1 1/5 (floop 1: Zombie) ·
Bog Witch 2 3/7 Lifesteal · Grave Gobbler 2 3/6 (grows on deaths) · **The Lich** L 4/8 (floop 1: all enemies
Rot) · Crypt 1 B5 · Mud Pit 1 trap · Witch's Cauldron 2 B5 · The Reaper 2 · Unearth 1 · Bog Breath 1.

**IcyLands** — Gunter 0 1/2 (floop: 1 dmg + Chill random enemy) · Snow Golem 1 1/6 Guard · Snow Sprite 1 1/4
Ranged (floop: Chill) · Abominable Snowman 2 4/7 (+2 vs Chilled) · Blizzard Wizard 2 3/6 (floop: push) ·
**Ice King** L 3/8 (floop 1: Freeze across, Chill others) · Ice Castle 2 B8 · Frozen Lake 1 trap ·
Penguin Igloo 1 B4 · Deep Freeze 1 · Blizzard 2 · Snow Day 1.

**NiceLands** — Banana Guard 0 1/2 Guard · Peppermint Butler 1 1/4 (floop: Shield 2) · Royal Tart Toter 1 1/5
(floop: heal 3) · Gumball Guardian 2 3/8 Guard Ranged · Mr. Cupcake 2 4/6 Shield 2 · **Princess Bubblegum** L
3/8 (floop 1: each building zaps for 2) · Gumdrop Tower 1 B5 · Candy Lab 1 B4 · Candy Wall 1 B8 ·
Bubble Barrier 1 · Science! 0 · Sweet Justice 2.

**LavaFlats** — Fire Wolf Pup 0 2/1 · Cinnamon Bun 1 2/5 Guard · Flambo 1 1/4 (floop: Burn 2) · Fire Elemental
1 3/3 (explodes) · Lava Golem 2 4/7 Siege 2 · **Flame Princess** L 5/6 (floop 1: Burn 2 all enemies) ·
Fire Forge 1 B5 · Lava Cannon 2 B4 · Fire Pit 1 B3 · Fireball 1 · Eruption 2 · Heat Wave 1.

**Rainbow** — Wandering Bald Man 0 2/2 · Archer Dan 2 3/5 Ranged (3 dmg to every enemy building) · Nurse
Poundcake 1 1/5 · Teleport 0 · Reclaim Landscape 1 · Bacon Pancakes 1 · For the Glory! 1 · Volcano 2 B6 ·
Tree Fort 1 B6 · Magic Portal 1 B3 · Booby Trap 0 trap.

Tokens: Earling 1/1 (Cornfield), Zombie 1/1 (Swamp), Penguin 1/1 (Ice, chills).

## Screen flow
Title/BMO welcome -> starter pick (first run) -> Home (Tree Fort table): Play (Table Tour ladder),
Quick Match, Daily Challenge, Pass & Play, Decks, Collection, Settings, Tutorial. Match -> Cool Guy /
Dweeb result -> Sparks + pack reveal -> back.
