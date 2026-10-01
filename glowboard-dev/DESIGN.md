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

## Card list (generated from the engine data table)
Cost = Actions and landscape requirement. B = building DEF.

**Blue Plains** (Floop tricks & mobility)
- Hot Dog Knight — cost 0 1/2 — When destroyed, draw a card.
- Cool Dog — cost 1 3/5 — Too cool: can't be Chilled or Frozen. FLOOP: The enemy creature across gets -2 ATK until your next turn.
- Ancient Scholar — cost 1 2/5 — FLOOP: Study (+2 with a Schoolhouse here). At 3 Study: Raise the Dead - put a creature from your discard pile into an empty lane.
- Sky Pup — cost 1 2/4 — Flying.
- Cloud Ranger — cost 2 4/6 — Whenever it moves, it gets +2 ATK this turn.
- The Pig — Champion, cost 2 (needs 3) 4/7 — FLOOP: Eat the landscape across (flip it face-down) and deal 1 damage to the creature on it. Muddy: if the Pig attacks and destroys a creature on a Useless Swamp, it gets stuck in the mud - that swamp's owner takes control of it.
- Schoolhouse — cost 1 B5 — At the start of your turn, your creature here gains +1 DEF permanently (max +2). Ancient Scholar studies twice as fast here.
- Cave of Solitude — cost 1 B6 — Your flooped creature here naps inside: it can't be attacked, targeted or damaged by enemies.
- Spirit Tower — cost 2 B6 — When an enemy creature with 5+ ATK attacks this lane, cancel the attack and take control of it. Then the Spirit Tower fades.
- Mathematical! — cost 0 — Ready one of your flooped creatures. It can floop or fight again.
- Rainicorn Ride — cost 1 — Move any creature (yours or an enemy's) to an empty lane on its side.
- Adventure Time! — cost 2 — Your creatures get +2 ATK this turn. Draw a card.

**Cornfield** (Swarm & growth)
- Cornball — cost 0 1/2 — Ripen.
- Husker Knight — cost 1 2/4 — Ripen. Collapses (can't attack) while its landscape is face-down.
- Scarecrow — cost 1 1/6 — Guard.
- Husker Worm — cost 2 3/5 — When played, put a 1/1 Earling into each adjacent empty lane.
- Corn Ronin — cost 2 2/5 — +1 ATK for each other creature you control.
- Immortal Maize Walker — Champion, cost 2 (needs 3) 1/7 — Deals triple damage while you control 3+ face-up Cornfields. Immortal.
- Cornucopia — cost 1 B4 — At the start of your turn, put a 1/1 Earling into a random empty lane of yours.
- Silo of Truth — cost 2 B5 — FLOOP: See your opponent's hand and face-down buildings, then steal a Spell from their hand.
- Corn Dome — cost 2 B5 — Your creatures in this lane and adjacent lanes get +1 ATK.
- Plant Corn — cost 0 — Turn one of your landscapes into a face-up Cornfield.
- Cerebral Bloodstorm — cost 1 — Deal 2 damage to every Ready creature - yours too! Flooped creatures are safe.
- Field of Nightmares — cost 2 — Summon the Legion of Earlings: a 1/1 Earling into each of your empty lanes.

**Useless Swamp** (Rot, Zombies & soul-stealing)
- Swamp Wisp — cost 0 1/1 — Flying.
- Mud Slinger — cost 1 2/4 — Creatures it damages in fights Rot.
- Gravedigger — cost 1 1/5 — FLOOP (1 Action): Raise a 1/1 Zombie in an adjacent empty lane.
- Bog Witch — cost 2 3/6 — Lifesteal.
- Grave Gobbler — cost 2 3/5 — Whenever another creature is destroyed, it gets +1 ATK permanently (max +3).
- The Lich — Champion, cost 2 (needs 3) 4/8 — FLOOP (1 Action): Every enemy creature Rots.
- Crypt — cost 1 B5 — When one of your creatures in this or an adjacent lane is destroyed, raise a 1/1 Zombie here.
- Mud Pit — cost 1 B3 — Trap. When an enemy creature enters the opposing lane, it gets Stuck and Rots. Then the pit sinks.
- Witch's Cauldron — cost 2 B5 — FLOOP: Destroy your creature here: draw 2 cards and gain 1 Action.
- Unearth — cost 1 — Put a creature from your discard pile into an empty lane of yours. It Rots.
- Bog Breath — cost 1 — Deal 2 damage to a creature. It Rots.
- The Reaper — cost 2 — Take control of every damaged enemy creature with 2 or less DEF left.

**IcyLands** (Chill, Freeze & control)
- Gunter — cost 0 1/3 — FLOOP: Deal 1 damage to a random enemy creature and Chill it.
- Snow Golem — cost 1 2/6 — Guard.
- Snow Sprite — cost 1 2/4 — Ranged. FLOOP: Chill an enemy creature.
- Abominable Snowman — cost 2 5/7 — Deals +2 damage to Chilled or Frozen creatures.
- Blizzard Wizard — cost 2 3/7 — FLOOP: Push the enemy creature across into an adjacent lane. If an enemy creature is already there, both take 2 damage.
- Ice King — Champion, cost 2 (needs 3) 4/8 — FLOOP (1 Action): Freeze the enemy creature across and Chill every other enemy creature.
- Ice Castle — cost 1 B7 — At the end of your turn, Chill the enemy creature across.
- Frozen Lake — cost 1 B3 — Trap. When an enemy creature enters the opposing lane, Freeze it and deal 2 damage. Then the ice cracks.
- Penguin Igloo — cost 1 B4 — At the start of your turn, if your creature slot here is empty, a 1/1 Penguin waddles out.
- Deep Freeze — cost 1 — Freeze an enemy creature.
- Snow Day — cost 1 — Turn any landscape into IcyLands. Chill the creature on it.
- Blizzard — cost 2 — Deal 2 damage to every enemy creature and Chill them.

**NiceLands** (Shields, buildings & spells)
- Banana Guard — cost 0 1/3 — Guard.
- Peppermint Butler — cost 1 1/4 — FLOOP: Give an ally Shield 2.
- Royal Tart Toter — cost 1 2/5 — FLOOP: Heal 3 damage from an ally.
- Gumball Guardian — cost 2 2/8 — Guard. Ranged.
- Mr. Cupcake — cost 2 4/6 — Enters with Shield 2.
- Princess Bubblegum — Champion, cost 2 (needs 3) 3/8 — FLOOP (1 Action): SCIENCE! Each of your buildings zaps the enemy creature across from it for 2.
- Gumdrop Tower — cost 1 B5 — At the start of your turn, your creature here gets Shield 1 (Shield 2 while you control another Gumdrop Tower - they link).
- Candy Lab — cost 1 B4 — Your first Spell each turn costs 1 less.
- Candy Wall — cost 1 B8 — Creatures that attack this building take 2 damage.
- Science! — cost 0 — Draw a card. If you control a building, draw 2 instead.
- Bubble Barrier — cost 1 — Give a creature and its adjacent allies Shield 2.
- Sweet Justice — cost 2 — Deal 4 damage to an enemy creature in a lane where you have a building.

**LavaFlats** (Burn, siege & aggro)
- Fire Wolf Pup — cost 0 2/1 — A hot-tempered little wolf.
- Cinnamon Bun — cost 1 2/5 — Guard.
- Flambo — cost 1 1/4 — FLOOP: Burn 2 an enemy creature.
- Fire Elemental — cost 1 3/3 — When destroyed, deal 2 damage to the enemy creature across.
- Lava Golem — cost 2 4/7 — Siege 2.
- Flame Princess — Champion, cost 2 (needs 3) 5/6 — FLOOP (1 Action): Burn 2 every enemy creature.
- Fire Forge — cost 1 B5 — At the end of your turn, your creature here gets +1 ATK permanently (max +2).
- Fire Pit — cost 1 B3 — At the end of your turn, Burn 1 the enemy creatures in this lane and adjacent lanes.
- Lava Cannon — cost 2 B4 — At the end of your turn, fire across this lane: 3 damage to a building, else 2 to the creature, else 2 to the hero.
- Fireball — cost 1 — Deal 3 damage to a creature and 1 to the creatures beside it.
- Heat Wave — cost 1 — Deal 2 damage to the enemy hero. Burn 1 every enemy creature.
- Eruption — cost 2 — Turn any landscape into LavaFlats and deal 3 damage to the creature on it.

**Rainbow**
- Wandering Bald Man — cost 0 2/2 — At the start of your turn, wanders into a random empty lane of yours - unless he is stuck in a Useless Swamp.
- Nurse Poundcake — cost 1 1/5 — FLOOP: Heal your hero 2.
- Archer Dan — cost 2 3/5 — Ranged. When played, deal 3 damage to every enemy building.
- Booby Trap — cost 0 B2 — Trap. When an enemy creature enters the opposing lane, deal 3 damage to it. Then it's spent.
- Tree Fort — cost 1 B6 — At the start of your turn, your creature here heals 2.
- Magic Portal — cost 1 B3 — When played, a twin Portal opens in another empty building slot of yours. Your creatures move between Portal lanes for free, at any distance.
- Volcano — cost 2 B6 — FLOOP: Destroy ALL creatures - yours too! Then the Volcano is spent. (Can't floop the turn it's played.)
- Teleport — cost 0 — Move one of your creatures to any lane of yours (swapping if needed). Only works on your own creatures!
- Reclaim Landscape — cost 1 — Restore all your landscapes: flip them face-up and undo enemy conversions.
- Bacon Pancakes — cost 1 — Draw 2 cards.
- For the Glory! — cost 1 — Your creatures get +1 ATK this turn. Draw a card.

Tokens: Earling 1/1 (Cornfield), Zombie 1/1 (Swamp), Penguin 1/1 (Ice, chills).

## Screen flow
Title/BMO welcome -> starter pick (first run) -> Home (Tree Fort table): Play (Table Tour ladder),
Quick Match, Daily Challenge, Pass & Play, Decks, Collection, Settings, Tutorial. Match -> Cool Guy /
Dweeb result -> Sparks + pack reveal -> back.
