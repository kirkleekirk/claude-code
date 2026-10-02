# CARD WARS (as seen in *Adventure Time*, S4E14) — design

Fan-made, offline, single-file game. The director's note wins over the original brief: the game plays like
**Card Wars from the show**, on a big 3D table with small hologram troops, and the brief's systems are mapped
onto it. Where the episode is silent, the official Card Wars rules fill the gaps.

## Show reference (episode "Card Wars")
* Finn and Jake play at the table in the Tree Fort: Total Soda, Crunch chips, a card box, and two cups Jake
  labels **DWEEB** and **COOL GUY** ("the loser is a dweeb and the winner is a cool guy"; "we drink when the
  game is over").
* "How do I get my land on the map?" "You floop your land cards." Finn's land and buildings appear as
  holograms. "Keep those honeys hidden, or I'll get a strategic advantage!"
* "Okay, I go first. I floop the Silo of Truth!" (reveals Finn's hand; "Pfff, you got really lame cards.
  I'll take the Cerebral Bloodstorm, though.")
* "You don't floop a creature to make it fight. You *activate* a creature." Finn floops **the Pig**, which
  eats Jake's Cornfields; Jake's **Husker Knights** "draw energy from corn" and collapse.
* "You're supposed to discard a card and pick up a new one first."
* Finn's Ancient Scholar studies Raise the Dead in the Schoolhouse; the Pig naps in the Cave of Solitude;
  the Spirit Tower takes control of Jake's creature; Jake floops the **Volcano**; "Pigs can't leave mud
  landscapes once they're on them! The Pig is mine!"; Jake plays **Reclaim Landscape** ("my Husker Knights
  revive!") and **Summon Archer Dan**, who destroys Finn's buildings; the Field Reaper steals souls.
* Finn's side glows blue, Jake's orange; stolen creatures change colour.

## Core rules
| Rule | Value |
|---|---|
| Goal | Wipe out the other **kingdom**: all of their creatures and buildings. Empty side at the end of any turn = you lose (both empty = draw) |
| Lanes | 4. Each player's 4 land cards make 4 landscapes; each lane holds 1 creature + 1 building per player |
| Kingdom | Each deck's main landscape brings 2 landmark buildings (Corn Castle + Corn Dome, Schoolhouse + Astral Fortress, ...) that start on the board |
| Setup | Mulligan once, then both players secretly put cards on their lands (2 setup Actions; the second player gets 3 and one extra card). "Floop your land cards!" reveals everything |
| Turn | Ready your cards; **discard a card and pick up a new one** (hand refills to 5; the first player skips this on turn 1); then 2 Actions |
| Actions | Play a card (cost = Actions = face-up landscapes of its type needed; Rainbow needs none), pick up a card (1), move a creature to an adjacent empty lane (1; free for Blue Plains creatures on Blue Plains) |
| Floop | Turn a card left to use its ability. A flooped creature can't attack this turn |
| Activate | Turn a creature right to declare an attack. Then call **BATTLE** |
| Defend | The defender answers "what'll you use to defend?": floop defensive abilities, or activate a ready creature to **block** an attack into its own or an adjacent lane |
| Attacks | Resolve in activation order: the creature across (an untouchable one still holds the lane), else an adjacent Guard, else the building across, else **storm the kingdom** (nearest enemy building). Flying goes over creatures to buildings. Damage stays until healed |
| Overtime | From round 13 every creature and building takes growing damage; at round 24 the judges compare kingdom size, then remaining toughness |
| Deck | 20 cards, max 2 copies (1 for Legendary), plus 4 land cards |

### Keywords
Guard, Flying, Ranged, Siege N, Vampiric, Shield N, Burn N, Chill/Frozen, Rot, Stuck, Ripen, Immortal, Trap
(face-down building), Napping (Cave of Solitude), Studying (Schoolhouse), Collapsed (Husker Knights with
no corn), Token. Exact wording is in `Engine.KEYWORDS` and on the cards.

### Home Advantage (creature of type X standing on face-up landscape X)
| Landscape | Hero | Home Advantage |
|---|---|---|
| Blue Plains | Finn | Breezy: moves cost 0 Actions |
| Cornfield | Jake | Corn-Powered: +1 ATK |
| Useless Swamp | Marceline | Grave Muck: when destroyed a 1/1 Zombie rises in its lane |
| IcyLands | Ice King | Frostbite: creatures it damages in fights are Chilled |
| NiceLands | Princess Bubblegum | Nice Day: heals 1 at your turn start |
| LavaFlats | Flame Princess | Scorch: creatures it damages in fights Burn |

## The 3D table
WebGL scene with no libraries: the Tree Fort floor and wall, the green folding table and the episode's props,
a big arena (each lane is a deep landscape tile, so small troops stand well in front of big structures) made of 8 tiles (procedural textures plus swaying hologram decor: corn stalks, blue
grass, swamp roots, ice spikes, candy, lava rocks), the physical cards on the table edge (they turn left when
flooped and right when activated), decks and discard piles, and the opponent sitting behind the table holding
a fan of red CW cards. Holograms use a cel-shaded team-tinted shader with rim light, scanlines, inverted-hull
outlines and a bottom-up materialize band; creatures are animated with up to 8 bones (legs, arms, heads,
tails, wings). Card art for the DOM cards is rendered from the same models into an offscreen framebuffer.
The camera frames the arena itself and tilts to fit the free screen area: steep on portrait phones, lower on
wide screens. Three layouts: portrait (hand along the bottom), short landscape (hand in a side column) and
desk (big landscape screens: hand along the bottom, the arena gets the full width). Drag to orbit, pinch or
wheel to zoom, two fingers or right-drag to pan, double-tap or the camera button to reset.

## Card list (generated from the engine data table)
Cost = Actions to play = face-up landscapes of its type you need. B = building toughness.

**Blue Plains** (Tricks, defense & the Pig)
- Astral Fortress — Kingdom landmark,  B8 — Kingdom landmark. Your creature in this lane gets +2 DEF.
- Cool Dog — cost 1 4/6 — Your creatures in the lanes next to Cool Dog can't be attacked. Too cool: can't be Chilled or Frozen, and Volcanos don't melt it.
- Ancient Scholar — Rare, cost 1 3/4 — ACTIVATE in a lane with your Schoolhouse to Study: he goes inside (enemies and Volcanos can't touch him) and learns Raise the Dead. FLOOP after studying (even while defending): Raise the Dead - put a creature from your discard pile into an empty lane.
- Sky Pup — cost 1 4/5 — Flying.
- Spirit Soldier — cost 1 4/6 — Your creatures in adjacent lanes get +1 ATK.
- Embarrassing Bard — cost 1 3/5 — FLOOP (even while defending): The enemy creature across is too embarrassed to floop or block until your next turn, and gets -1 ATK.
- Woadic Marauder — Rare, cost 2 5/4 — FLOOP (your turn): Smash the enemy building across for 4 damage.
- Woadic Chief — Epic, cost 2 4/6 — +2 ATK for each Spell you cast this turn.
- Cloud Ranger — Rare, cost 2 6/6 — Whenever it moves, it gets +2 ATK this turn.
- Schoolhouse — cost 1 B7 — Ancient Scholars study here. Volcanos can't touch it. At the start of your turn, your creature in this lane gains +1 DEF (max +2).
- Cave of Solitude — Rare, cost 1 B6 — FLOOP (even while defending): your creature in this lane takes a nap inside and heals 2. Until your next turn enemies can't attack, target or steal it (it can't attack either).
- Spirit Tower — Epic, cost 2 B6 — When an enemy creature with 4 or more ATK attacks this lane, the Tower possesses it: you take control of it. Then the Tower fades.
- Mathematical! — Rare, cost 1 — Ready one of your flooped creatures. It can floop or attack again.
- Rainicorn Ride — cost 1 — Move any creature (yours or an enemy's) to an empty lane on its side.
- Adventure Time! — Epic, cost 2 — Your creatures get +2 ATK this turn. Pick up a card.

**Cornfield** (Corn power & big attacks)
- Corn Castle — Kingdom landmark,  B7 — Kingdom landmark. Your creature in this lane gets +2 ATK.
- Archer Dan — Token, cost 0 3/3 — Ranged.
- Husker Knights — cost 1 0/2 — They draw energy from corn: +2 ATK for each face-up Cornfield you control. No corn and they collapse.
- Legion of Earlings — Rare, cost 1 4/2 — During your Field of Nightmares, the creature they fight is scared to death: destroyed, and it deals no damage back.
- Cornball — cost 1 2/3 — Ripen.
- Scarecrow — cost 1 1/6 — Guard.
- Feed Man — Rare, cost 2 2/5 — +3 ATK while you control a Hay Barn - his power source.
- Field Reaper — Legendary, cost 2 4/4 — Extra cost: discard a card. When he is flooped into play he steals the souls of every damaged enemy creature: you take control of them. Napping and studying creatures are safe.
- Immortal Maize Walker — Legendary, cost 2 5/5 — Hides in the Useless Swamp: can only be played onto your face-up Useless Swamp. Cornfields give it triple ATK (3+ face-up Cornfields). Immortal.
- Corn Dome — Rare, cost 1 B6 — Your creatures in this lane and adjacent lanes get +1 ATK.
- Hay Barn — cost 1 B6 — Feed Man's power source. Your creature in this lane gets +1 DEF.
- Stonehenge — Rare, cost 1 B6 — Your creature in this lane can floop AND attack in the same turn.
- Silo of Truth — Epic, cost 2 B5 — When it's flooped into play: your opponent reveals their hand and you take one card from it.
- Field of Nightmares — Rare, cost 1 — This turn the board is a Field of Nightmares: enemy creatures are too scared to floop or block, and your Legion of Earlings scare what they fight to death.
- Plant Corn — cost 1 — Turn one of your landscapes into a face-up Cornfield.
- Summon Archer Dan — Legendary, cost 2 (needs 3) — Needs 3 Cornfields. Archer Dan (3/3, Ranged) joins an empty lane of yours and shoots a corn-arrow at every enemy building, destroying them all.

**Useless Swamp** (Rot, Zombies & souls)
- Mausoleum — Kingdom landmark,  B7 — Kingdom landmark. Your creature in this lane gets +1 ATK and +1 DEF.
- Zombie — Token, cost 0 1/1 — Token.
- Swamp Wisp — cost 1 2/2 — Flying.
- Mud Slinger — cost 1 2/4 — Creatures it damages in fights Rot.
- Gravedigger — Rare, cost 1 1/5 — FLOOP: Raise a 1/1 Zombie in an adjacent empty lane.
- Bog Witch — Rare, cost 2 3/5 — Vampiric.
- Grave Gobbler — Rare, cost 2 3/5 — Whenever another creature is destroyed, it gets +1 ATK permanently (max +3).
- The Lich — Legendary, cost 2 4/7 — FLOOP (1 Action, your turn): Every enemy creature Rots.
- Crypt — cost 1 B5 — When one of your creatures in this or an adjacent lane is destroyed, a 1/1 Zombie rises here (once per turn).
- Mud Pit — Rare, cost 1 B3 — Trap. When an enemy creature enters or attacks the lane across, it gets Stuck and Rots. Then the pit sinks.
- Witch's Cauldron — Rare, cost 2 B5 — FLOOP (your turn): Destroy your creature in this lane: pick up 2 cards and gain 1 Action.
- Unearth — cost 1 — Put a creature from your discard pile into an empty lane of yours. It Rots.
- Bog Breath — cost 1 — Deal 2 damage to a creature. It Rots.
- Soul Harvest — Epic, cost 2 — Take control of a damaged enemy creature with 2 or less DEF left.

**IcyLands** (Chill, Freeze & control)
- Ice Palace — Kingdom landmark,  B7 — Kingdom landmark. Your creature in this lane gets +2 DEF.
- Penguin — Token, cost 0 1/1 — Token. Chills creatures it damages.
- Gunter — Rare, cost 1 2/3 — FLOOP: Deal 1 damage to a random enemy creature and Chill it.
- Snow Golem — cost 1 2/6 — Guard.
- Snow Sprite — cost 1 3/3 — Ranged. FLOOP: Chill an enemy creature.
- Abominable Snowman — Rare, cost 2 5/7 — Deals +2 damage to Chilled or Frozen creatures.
- Blizzard Wizard — Rare, cost 2 3/6 — FLOOP: Push the enemy creature across into an adjacent lane. If an enemy creature is already there, both take 2 damage.
- Ice King — Legendary, cost 2 4/7 — FLOOP (1 Action, your turn): Freeze the enemy creature across and Chill every other enemy creature.
- Ice Castle — Rare, cost 1 B6 — At the end of your turn, Chill the enemy creature across.
- Frozen Lake — Rare, cost 1 B3 — Trap. When an enemy creature enters or attacks the lane across, Freeze it and deal 2 damage. Then the ice cracks.
- Penguin Igloo — cost 1 B5 — At the start of your turn, if your lane here has no creature, a 1/1 Penguin waddles out.
- Deep Freeze — cost 1 — Freeze an enemy creature.
- Snow Day — Rare, cost 1 — Turn any landscape into IcyLands. Chill the creature on it.
- Blizzard — Epic, cost 2 — Deal 1 damage to every enemy creature and Chill them.

**NiceLands** (Shields, buildings & science)
- Candy Castle — Kingdom landmark,  B8 — Kingdom landmark. At the start of your turn, your creature in this lane heals 2.
- Banana Guard — cost 1 2/4 — Guard.
- Peppermint Butler — Rare, cost 1 2/4 — FLOOP: Give one of your creatures Shield 2.
- Royal Tart Toter — cost 1 2/5 — FLOOP: Heal 3 damage from one of your creatures.
- Gumball Guardian — Rare, cost 2 2/8 — Guard. Ranged.
- Mr. Cupcake — cost 2 4/6 — Enters with Shield 2.
- Princess Bubblegum — Legendary, cost 2 3/8 — FLOOP (1 Action, your turn): SCIENCE! Each of your buildings zaps the enemy creature across from it for 2.
- Gumdrop Tower — cost 1 B5 — At the start of your turn, your creature here gets Shield 1 (Shield 2 while you control another Gumdrop Tower).
- Candy Lab — Rare, cost 1 B5 — Your first Spell each turn costs 1 less Action.
- Candy Wall — cost 1 B8 — Creatures that attack this building take 2 damage.
- Bubble Barrier — cost 1 — Give a creature and its adjacent allies Shield 2.
- Science! — Rare, cost 1 — Pick up a card. If you control a building that isn't a landmark, pick up 2 instead.
- Sweet Justice — Epic, cost 2 — Deal 4 damage to an enemy creature in a lane where you have a building.

**LavaFlats** (Burn & siege)
- Fire Palace — Kingdom landmark,  B7 — Kingdom landmark. Your creature in this lane gets +2 ATK.
- Fire Wolf Pup — cost 1 3/3 — A hot-tempered little wolf.
- Cinnamon Bun — cost 1 3/5 — Guard.
- Flambo — Rare, cost 1 2/4 — FLOOP: Burn 2 an enemy creature.
- Fire Elemental — cost 1 3/3 — When destroyed, deal 2 damage to the enemy creature across.
- Lava Golem — Rare, cost 2 5/7 — Siege 2.
- Flame Princess — Legendary, cost 2 5/7 — FLOOP (1 Action, your turn): Burn 2 every enemy creature.
- Fire Forge — Rare, cost 1 B5 — At the end of your turn, your creature in this lane gets +1 ATK permanently (max +2).
- Fire Pit — cost 1 B4 — At the end of your turn, Burn 1 the enemy creatures in this lane and adjacent lanes.
- Lava Cannon — Rare, cost 2 B5 — At the end of your turn, fire across this lane: 3 damage to the enemy building, or else 2 to the enemy creature.
- Fireball — cost 1 — Deal 3 damage to a creature and 1 to the creatures beside it.
- Heat Wave — Rare, cost 1 — Deal 2 damage to every enemy building. Burn 1 every enemy creature.
- Eruption — Epic, cost 2 — Turn any landscape into LavaFlats and deal 3 damage to the creature on it.

**Rainbow** (Any landscape)
- Wandering Bald Man — cost 0 1/1 — At the start of your turn he wanders into a random empty lane of yours - unless he's stuck in the mud of a Useless Swamp.
- Hot Dog Knight — cost 0 2/3 — When destroyed, pick up a card.
- The Pig — Legendary, cost 1 2/2 — FLOOP (once; even while defending): The Pig eats every enemy Cornfield (they flip face-down). No Cornfields? It eats the landscape across. Can't be attacked while flooped. Pigs can't leave mud: if it wins a fight on an enemy Useless Swamp, it gets stuck there and that player takes it.
- Nurse Poundcake — cost 1 1/5 — FLOOP: Heal 3 damage from one of your creatures.
- The Cooper — Rare, cost 1 1/4 — FLOOP: Unfloop another of your creatures. It can floop or attack again.
- Ultra Dog — Epic, cost 2 2/3 — When played, your strongest other creature gets a mohawk: +2 ATK. FLOOP (your turn): Cold Nose - ice covers every battlefield: Freeze every creature on the board, yours too.
- Booby Trap — cost 0 B2 — Trap. When an enemy creature enters or attacks the lane across, deal 3 damage to it. Then it's spent.
- Tree Fort — cost 1 B6 — At the start of your turn, your creature in this lane heals 2.
- Magic Portal — Rare, cost 1 B4 — When played, a twin Portal opens in another empty building spot of yours. Your creatures move between Portal lanes for free, at any distance.
- Volcano — Legendary, cost 2 B5 — FLOOP (your turn, not the turn it's played): ERUPT! Lava destroys EVERY creature on the board (yours too!) and both buildings in this lane, and scorches every landscape face-down. Studying Scholars, Cool Dogs and Schoolhouses survive.
- Teleport — cost 0 — Move one of your creatures to one of your empty lanes. Only works on your own creatures!
- Reclaim Landscape — Rare, cost 0 — Reconstitute all your landscapes (flip them face-up, undo enemy changes). Husker Knights in your discard pile revive onto empty lanes with a restored Cornfield.
- Cerebral Bloodstorm — Rare, cost 1 — A brain storm rages over this battle: every creature that fights - attacking or defending, yours too - takes 2 damage.
- Bacon Pancakes — cost 1 — Pick up 2 cards.
- For the Glory! — Rare, cost 1 — Your creatures get +1 ATK this turn. Pick up a card.

## Screen flow
Starter pick with BMO (first run) -> Home (the 3D table from the episode behind the menu): Table Tour ladder,
Quick Match, Daily Challenge, Pass & Play, Decks, Collection, How to Play (Jake's tutorial), Settings.
Match: mulligan -> secret kingdom setup -> "FLOOP YOUR LAND CARDS!" -> turns (discard & pick up, Actions,
floop / activate, BATTLE, "what'll you use to defend?") -> COOL GUY / DWEEB cups -> Sparks + card pack -> back.
