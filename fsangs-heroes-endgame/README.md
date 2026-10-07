# Heroes Endgame

An endgame addon for **FSang18's Heroes** on Minecraft Java 1.20.1 (Forge).

> Your powers grow. So do your enemies.

In FSang18's Heroes you can become a Viltrumite, a Kryptonian, a speedster or a mutant, and by the late game those
powers make everything trivial. Heroes Endgame adds **nemeses**: canon villains who come for you once your powers
reach a certain point. They scale themselves against you and fight the way they do in the comics and shows. Each one
has a story trigger, a counter you can learn, and a reward.

| Storyline | Who it hunts | Trigger |
|---|---|---|
| The Viltrumite Empire | Viltrumites | Days survived (FSang's `fsang_age`): 18 → trial, 50 → Conquest, 100 → Thragg |
| The Infinity Saga | The whole world | Someone claims the first Infinity Stone |
| Doctor Doom | Anyone strong | FSang skill level 30, 3 major nemeses beaten, or wearing FSang's Doom suit |
| Doomsday | Kryptonians | FSang skill level 15 |
| Zoom | Speedsters | 25,000 blocks run at super speed, or skill level 25 |
| Sentinels / Master Mold | Mutants (X-Gene powers) | FSang skill level 10 |
| Ghost Rider | The guilty | FSang karma at or below -300 |

## Requirements

| Mod | Tested version | |
|---|---|---|
| Minecraft | 1.20.1 | |
| Forge | 47.4.0 (any 47.x) | required |
| FSang18's Heroes (`fsang`) | 12.5.6 | strongly recommended: power detection, suits, effects, skill points |
| Palladium (`palladium`) | 4.5.9 | comes with FSang18's Heroes; used to read powers and properties |
| Ad Astra (`ad_astra`) | 1.15.21 | optional: Vormir is Glacio, the Power Stone is on Mars |
| Rick's Portal Gun (`ricksportalgun`) | 1.4.10 | optional: see [Rick's Portal Gun](#ricks-portal-gun) |

Only Forge is a hard dependency. Without FSang18's Heroes the bosses, the Infinity Saga, Doctor Doom, spawn eggs and
commands still work; the power-based triggers just never fire.

Install: drop `heroes_endgame-1.0.0.jar` into `mods/` next to FSang18's Heroes. The mod must be on both the server and
the clients.

## How the scaling works

- **Damage is solved backwards from you.** A nemesis hit is tuned to take a fixed share of your max health (for
  example Thanos needs 6 clean hits). It accounts for your armor, Protection and FSang's `damage_resistance`
  abilities, then ignores 75% of that reduction (`durabilityPierce`). A 1,000-health god still feels every punch,
  and armor still buys you a few extra hits.
- **Health is sized from your damage.** Boss health comes from your estimated damage output (attack damage and speed,
  FSang skill level, number of powers) times how long the fight should last. Each extra player in the fight adds 50%.
- **No one-shots.** A single hit can only remove a few percent of a boss's health (`perHitDamageCap`).
- **No cheese.** Bosses ignore crowd control, teleport after you if you run (48 blocks) or get stuck, smash through
  soft blocks, follow you to other dimensions and come back later if you log out mid-fight (with the damage you
  dealt still on them). Minions disband when their leader falls.
- **Rewards:** FSang skill points (+1 to +6 per victory), advancements, trophies and loot. Everyone who took part
  gets the reward.

## The nemeses

### The Viltrumite Empire (Viltrumites)

FSang's Viltrumites grow a little stronger every day they survive (`fsang_age`, reset on death). The Empire tests its
own the way it does in *Invincible*:

| Age | What happens |
|---|---|
| 17 | Omen: "Tomorrow you come of age by Viltrumite reckoning..." |
| 18 | **The coming-of-age trial**: a Viltrumite Soldier and a Scout (in FSang's Viltrumite uniforms) dive out of the sky |
| 50 | **Conquest**, the Empire's most brutal veteran. He gets stronger the more he bleeds |
| 100 | **Grand Regent Thragg**. He reads your attacks and counters, then calls the Empire in when the fight turns |

The tiers are at least 3 in-game days apart. Die and your age resets (that's FSang), so the Empire tries again when
you come of age again. Viltrumites fight with grab-and-slams (deal 5% of their health to break free), dive bombs,
punch barrages and thunderclaps. Every third punch is a haymaker that sends you flying.

**Counter:** FSang's **Scourge Virus**. Infected Viltrumites deal half damage, take 50% more, fly slower and stop
regenerating.

### The Infinity Saga (world-wide)

The six stones are hidden in the world. Each one exists exactly once and only appears while it is unclaimed:

| Stone | Where to find it |
|---|---|
| Tesseract (Space) | End City treasure chests (25%) |
| Aether (Reality) | Ancient City chests (15%) |
| Orb (Power) | Ad Astra's Mars Temple chest, like Morag (50%). Without Ad Astra: big ocean ruin chests (15%) |
| Time | A **sealed Eye of Agamotto** in Stronghold libraries (35%). Open it in the Nether: "Dormammu, I've come to bargain" |
| Soul | **Vormir**: Ad Astra's Glacio above Y 70 (without Ad Astra: mountain peaks above Y 175 at night). The Stonekeeper (Red Skull) demands a soul for a soul: one of your tamed pets, or a fellow player who dies at your side |
| Mind | Loki's scepter: defeat Loki |

**Act I: Loki.** Claiming the first stone wakes Thanos. A minute later Loki arrives with a Chitauri army to take it.
He uses illusions that swap places with him, and his scepter's mind control (nausea, slowness, FSang metaphysical
dampening, and nearby mobs turn on you). Hulks deal him double damage ("Puny god"). Beat him for the Mind Stone.

**Act II: the Infinity clock.** Every 7 in-game days Thanos claims an unclaimed stone, in *Infinity War* order (Power,
Space, Reality, Soul, Time, Mind). The **Black Order** raids whoever carries the most stones: Ebony Maw (telekinesis,
disarms you) with Cull Obsidian (shield arm, so go around him), then Proxima Midnight (spear throws, leaps at
kiters) with Corvus Glaive (his glaive heals him until a burst of damage cracks it).

**Act III: "Fine. I'll do it myself."** Once Thanos holds 3 stones, or none are left to claim, he comes personally.
He fights with the stones he has: Power (beam, shockwave), Space (portals), Reality (your projectiles turn to
bubbles), Soul (life drain), Time (rewinds his own wounds once), Mind (control). If a villain kills a stone carrier,
they take the stones.

**The Snap.** If Thanos completes the Gauntlet, he snaps. Half of all unnamed, untamed creatures turn to dust, and
every player loses 20% max health and attack damage (the *Snapped* effect). It lasts until Thanos is defeated or a
hero snaps back with a full Gauntlet. Then the dusted come back as their chunks load. Defeating Thanos drops his
Gauntlet with every stone he held.

**The Infinity Gauntlet** is crafted from FSang's Uru ingots (netherite without FSang), a nether star and gold blocks.
Hold the Gauntlet in your main hand and a stone in your off hand, then use it to socket the stone. Sneak and use to
pick a stone, use to unleash it:

| Stone | Held (passive) | Through the Gauntlet |
|---|---|---|
| Power | Strength II, but it burns you unless another player is within 4 blocks (the Guardians on Xandar). Safe in a gauntlet | Blast everything in front of you |
| Space | Use to blink 24 blocks | Teleport up to 96 blocks where you look |
| Reality | Resistance I | Erase up to 12 hostile mobs around you |
| Soul | Regeneration I | Drain 15% of a target's max health and heal |
| Time | Haste II | Rewind yourself about 5 seconds: position, health, hunger, harmful effects |
| Mind | Hostile mobs near you glow | Make a mob your thrall for a minute |

Hold use with all six stones to **snap**. It dusts every hostile mob and minion within 128 blocks and takes half the
health of every nemesis there (nothing resists it), or it reverses Thanos' snap. It has a price, though. Below 40 max health it kills you (Tony Stark didn't survive it).
Otherwise it takes 80% of your health, withers you, and burns the Gauntlet out for 3 days.

**Dormammu** can't be beaten, only bargained with. While he lives, the sorcerer who opened the Eye can't die. Every
killing blow loops time back to the start of the fight, and each loop wears him down. After 5 loops he gives up the
Time Stone just to make it stop.

### Doctor Doom (rivals)

Doom does not tolerate rivals. He notices you at FSang skill level 30, or after you beat 3 major nemeses. Wear FSang's
Doctor Doom suit and he sends Doombots at once ("an impostor wears the mask of Doom").

1. **The Doombots** come first. Everything they learn is sent to Latveria: Doom resists 50% of whatever kind of
   damage you used most on them.
2. **Doctor Doom** arrives 2 days later in FSang's Doom suit:
   - a force field that soaks a quarter of his health and recharges if you let up (lightning overloads it)
   - mystic bolts, demons, and an EMP (FSang tech dampening)
   - a power-siphon channel. Interrupt it, or he steals your powers (FSang full suppression) and grows stronger
   - below a third of his health he becomes **God Emperor Doom** (FSang's Doom God suit)

Doom always returns: he challenges you again every 40 days.

### Doomsday (Kryptonians)

At FSang skill level 15 a Kryptonian feels two tremors half a day apart, then Doomsday claws his way out of the
ground.

- **Reactive evolution.** Every hit of a kind of damage (melee, projectile, fire, explosion, magic, cold, powers)
  makes him 3.5% more resistant to it, up to 75%. Mix it up.
- **He comes back once,** completely immune to whatever killed him.
- Bone spikes hurt anyone who punches him.
- **Counter:** FSang's kryptonite weapons ignore his adaptation and hit 50% harder, like the spear in *Batman v
  Superman*.

### Zoom (speedsters)

Zoom notices a speedster who has run 25,000 blocks at super speed or reached skill level 25. He watches by day and
comes at night.

- Hit and run: he blitzes in, strikes and is gone. Every hit steals speed (FSang speed inhibitor).
- He is a blur. Most of your damage misses unless you are a speedster at speed, you slow him (cold and slowness get
  through), or you catch him while he gloats.
- At half health his time remnants join the fight. When he falls, the Time Wraiths take him.
- Lose, and he keeps your speed for half a day. He drops Velocity-9 (huge speed, at a cost).

### The Sentinels and Master Mold (mutants)

At FSang skill level 10 a mutant (Wolverine, Storm, Cyclops, Magneto... see the config list) shows up on Trask's
scanners. Sentinel raids follow every ~4 days, 1 to 3 Sentinels depending on your skill. They hover out of reach and
fire inhibitor beams (FSang genetic dampening). Their plating adapts if you keep hitting them the same way.

Destroy 6 Sentinels and **Master Mold** comes for you: colossal, slow, and building new Sentinels mid-fight. Its head
is the weak point and takes double damage.

### Ghost Rider (karma)

If your FSang karma sinks to -300 (killing villagers, golems and other players), the Spirit of Vengeance comes at
night. The Penance Stare burns harder the more innocent blood is on your hands, and hellfire keeps burning. If your
karma recovers while he hunts you, he leaves. Beat him and your karma is wiped clean. Die to him and your death pays
off part of the debt. Spirits of Vengeance themselves are never hunted.

## Items

| Item | |
|---|---|
| Infinity Stones, Infinity Gauntlet | See above. Stones are indestructible, never despawn and come back up if they fall into the void |
| Sealed Eye of Agamotto | Opens the way to Dormammu in the Nether |
| Watcher's Log | Book + Eye of Ender + Spyglass. Shows which nemeses are watching you and the state of the Infinity Saga |
| Trophies | Viltrumite Sigil, Conquest's Medal, Regent's Crest, Black Order Insignia, Doombot Core, Doom's Mask, Doomsday Bone, Sentinel Eye, Master Mold Core, Penance Chain. Collectibles for quest packs |
| Velocity-9 | Zoom's drug: Speed IV, Haste and Jump Boost for 90 seconds, paid for with hunger and wither |
| Spawn eggs | Every boss, for map makers (creative tab "Heroes Endgame") |

Every boss also drops vanilla loot such as diamonds, netherite and golden apples.

## Advancements

Each nemesis has an advancement ("Coming of Age", "We Have a Hulk", "Should Have Gone for the Head", "Doom Bows to No
One", "Reign of the Supermen", "Fastest Alive", "Days of Future Past", "Penance", ...). There are also Infinity
Saga goals: "Infinite Possibilities", "A Soul for a Soul", "I've Come to Bargain", "Perfectly Balanced", "Snap",
"Bring Them Back" and "Puny God". The capstone is **Endgame**: defeat Thanos, Doctor Doom and three other major
nemeses.

For quest packs there are hidden advancements for every boss kill: `heroes_endgame:kills/<entity>` (for example
`heroes_endgame:kills/thanos`).

## Rick's Portal Gun

Reference mod: **Rick's Portal Gun [Forge/NeoForge]** by JamesLeDolphin. Mod id `ricksportalgun`, tested with 1.4.10
for 1.20.1.

- CurseForge: https://www.curseforge.com/projects/908191
- Modrinth: https://modrinth.com/mod/ricks-portal-gun
- Source: https://github.com/JamesLeDolphin/ricks-portal-gun-multiloader

What the integration does:

- **No portalling out of a boss fight.** Portal guns jam while a nemesis is within 48 blocks (`jamPortalGuns`).
- **The Tesseract is a fuel source.** With the Tesseract in your off hand, the portal gun in your main hand refuels
  by 1 charge per second (`tesseractRefuelsPortalGuns`).

It works through the `ricksportalgun:portal_guns` item tag and the gun's `Fuel` data, so every gun variant is covered
and there is no hard dependency.

## Ad Astra

- **Vormir is Glacio**, the frozen planet around Proxima Centauri (`vormirDimension`, default `ad_astra:glacio`).
- **The Power Stone is on Mars**, in the Mars Temple chest, like the Orb on Morag.
- Every boss is in Ad Astra's "lives without oxygen / survives space, heat, cold and acid rain" tags. If you fight on
  another planet, they follow you there.

## Configuration

Server config: `world/serverconfig/heroes_endgame-server.toml`. Every value is commented in the file. The main ones:

| Section | Keys |
|---|---|
| `general` | `enabled`, `checkIntervalSeconds`, `bossHealthMultiplier`, `bossDamageMultiplier`, `multiplayerHealthBonus`, `perHitDamageCap`, `bossBlockBreaking` (also needs `mobGriefing`), `globalAnnouncements`, `skillPointRewards`, `durabilityPierce`, `leashDistance` |
| `viltrumite` | `trialAge` 18, `conquestAge` 50, `thraggAge` 100, `tierCooldownDays`, `powers` |
| `infinity` | `failsafeStartDay` (start the saga on a given day even if no one finds a stone), `clockIntervalDays`, `thanosArrivalStones`, `blackOrderRaids`, `snapEnabled`, `snapDustFraction`, `snapPenalty`, `snapKillsPlayers`, `powerStoneBurns`, stone chances, `vormirDimension`, `vormirMinY`, `dormammuLoopsToYield` |
| `doom` | `skillLevelTrigger`, `nemesesDefeatedTrigger`, `impostorTrigger`, `daysAfterDoombots`, `rematchDays`, `doombotCount` |
| `doomsday` | `skillLevelTrigger`, `resurrections`, `maxAdaptation`, `adaptationPerHit`, `kryptonianPowers` |
| `zoom` | `speedDistanceTrigger`, `skillLevelTrigger`, `speedsterPowers` |
| `sentinels` | `skillLevelTrigger`, `raidIntervalDays`, `sentinelsBeforeMasterMold`, `mutantPowers` |
| `ghost_rider` | `karmaThreshold`, `spiritOfVengeancePowers` |
| `compat` | `useFsangSuits`, `jamPortalGuns`, `tesseractRefuelsPortalGuns`, `hulkPowers` |

The power lists use Palladium power ids. A trailing `*` matches any suffix, so `fsang:viltrumite*` covers every
Viltrumite variant.

## Commands

| Command | |
|---|---|
| `/endgame status [player]` | The Watcher's Log in chat (anyone can check themselves) |
| `/endgame infinity status` | The state of the Infinity Saga |
| `/endgame summon <nemesis> [player]` | Bring a nemesis in now (op) |
| `/endgame schedule <nemesis> <player> [seconds]` | Schedule an arrival (op) |
| `/endgame reset <player> [nemesis]` | Reset a player's records (op) |
| `/endgame infinity start\|advance\|snap\|unsnap\|reset` | Drive the saga (op). `reset` doesn't remove stones that are already out in the world |
| `/endgame infinity owner <stone> <unclaimed\|found\|thanos>` | Set who holds a stone (op) |
| `/endgame debug age\|karma\|skill\|speedforce\|sentinels <player> <value>` | Fake the trigger values (op) |
| `/endgame debug powers <player>` | The Palladium powers the mod detects |
| `/endgame debug bosses` | Every nemesis loaded: health, phase, target, current ability |
| `/endgame debug dormammu <player>` | Start the Dormammu bargain without an Eye (player must be in the Nether) |

## Building from source

Needs JDK 17.

```sh
./gradlew build          # -> build/libs/heroes_endgame-1.0.0.jar
```

Palladium is a compile-only dependency from the Modrinth maven. All Palladium calls sit behind a mod-loaded check, so
the jar runs without it.

The textures (boss skins, items, effect icons) and most of the data (loot tables, global loot modifiers, damage types,
tags, advancements, recipes, item models) are generated by two scripts. Run them from this folder after changing
them:

```sh
python3 tools/generate_textures.py   # needs Pillow
python3 tools/generate_data.py
```

## Credits

- FSang18's Heroes by FSang18. Bosses wear its suits when it is installed, and its powers, properties and effects
  drive the triggers and counters. No FSang assets are copied into this mod.
- Palladium by Threetag, Ad Astra by Terrarians, Rick's Portal Gun by JamesLeDolphin.
- Characters belong to Marvel, DC and Skybound/Image (*Invincible*). This is a non-commercial fan addon.

License: MIT.
