# Invincible Adversaries

A fan-made third-person hero shooter prototype starring **Invincible**, **Rex Splode**, **Atom Eve**, **Robot**, **Omni-Man**, **Battle Beast**, **Allen the Alien** and **the Immortal**. It runs in the browser with three.js and needs no build step.

After **PLAY** you pick a mode, then a hero:

- **Payload (6v6)** in **destroyed Chicago**: escort a GDA transport through the ruined Loop, or stop it. Bots fill both teams.
- **Training arena (3v3)**: an open plaza with two bot allies against three bot enemies, no objective and no clock. Use it to learn the heroes, with training toggles in the pause menu.

Teams are role-queued and mirrored. In 3v3 each team fields one duelist, one strategist and one vanguard, nobody twice in a match. In 6v6 each team fields two of each role, all six different. You can swap hero at any time.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```sh
cd invincible-adversaries
npm start
```

Then open <http://localhost:5173> in a desktop browser with WebGL2. Development and testing used Chromium, so Chrome and Edge are the safest picks. Click once to capture the mouse.

Any static file server works too, for example `python3 -m http.server 5173` run inside the folder. Opening `index.html` straight from disk does not work, because browsers block ES modules and model loading on `file://`.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move. Movement follows the camera; in flight, `W` flies where you look. |
| Mouse | Aim |
| `Space` | Jump. Fliers double-tap it to take off or land, and hold it to climb. |
| `Ctrl` / `C` | Descend or land |
| `LMB` / `RMB` | Primary / secondary fire |
| `Shift`, `E`, `F` | Abilities |
| `Q` | Ultimate |
| `H` | Swap hero |
| `U` | Instantly fill your ultimate (training) |
| `Esc` | Pause menu: training options and settings |

## Payload in destroyed Chicago

The attackers escort a GDA transport along a 402 m route through the ruins of the Loop, after Omni-Man's attack on the city. The route follows the hand-drawn plan. It starts on the road at the south end of **State Street** and heads north under the **Chicago Theatre**'s sign to checkpoint **A**. Then it turns east through the west portal of the old **station**, runs south down its concourse and across the skylit **Great Hall**, and leaves through the east wall the blast tore open. Checkpoint **B** is on the **crater**'s rim. The route then curves around the crater Omni-Man punched into the Loop, to the last point under the **Wabash L**.

- **Pushing.** The transport moves while attackers are within 7.5 m of it and no defender is: 2.4 m/s with one attacker, 2.75 with two and 3.1 with three or more. Left alone for 12 s, it rolls back at 0.7 m/s, but never past a checkpoint. Heroes standing on it ride along.
- **Clock.** 2:40 to reach A. Reaching A adds 3:00 and reaching B adds 2:50, and each checkpoint moves both teams' spawn rooms up the route. When time runs out with an attacker on the transport, overtime holds until 3 s after the last one steps off.
- **Setup.** For the first 20 s the attackers are held in their spawn room behind a hard-light door while the defenders set up.
- **Spawn rooms** burn enemies inside them for 140 HP/s and heal their own team for 180 HP/s. Respawns take 7 s for attackers and 8.5 s for defenders, since the attackers walk back further.
- **Lineups.** The two duelists and two strategists play on both teams, and each team draws two of the four vanguards at random. On the mode card you choose to attack, defend or take a random side.

The map is built procedurally at load. It has State Street, the theatre's vertical CHICAGO sign and marquee, and the station's steel-and-glass concourse shed and vaulted Great Hall. The Lake Street and Wabash L tracks run overhead, with one span down as a ramp and a train hanging off the edge. The streets are full of wrecked cars, buses, rubble and fires. The open sky over the crater, about 100 m across, leaves plenty of room for flying and big fights. Towers up to 190 m tall stand shoulder to shoulder around the edge. Nearly all of them rise above the 88 m flight ceiling, so fliers can't leave the map and rarely see past its walls. Nobody can land on a building taller than the ceiling. Beyond the walls are the skyline and its landmarks (Willis Tower, Trump Tower and the John Hancock Center), the river and Lake Michigan.

## The heroes

All eight are meant to feel overpowered: high damage, short cooldowns and huge mobility. They are balanced against each other rather than toned down. Rex Splode and Battle Beast can't fly; they get around with rocket jumps and pounces instead.

### Invincible: Duelist (flying dive DPS)
425 HP · ground speed 9.2 · **unlimited flight** at 21 m/s · regenerates 35 HP/s after 3.5 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Viltrumite Barrage | 4-hit combo (44 / 44 / 52 / 80) that lunges onto targets near the crosshair. The finisher launches. |
| RMB | Shockwave Clap | 16 m cone, 65 damage plus knockback. 2 charges, 3.5 s cooldown. |
| Shift | Sonic Boom Dash | 32 m supersonic dash, 75 damage to everything in the path. |
| E | Meteor Dive | Leap onto a point up to 45 m away (or dive straight down from the air): 95 damage in 6 m and a knock-up. |
| F | Skyward Slam | Grab an enemy, rocket upward and slam them down for 110 damage plus a stun. |
| Q | **Mach Breaker** | Launch into the sky, mark a target, then crash down at Mach 10: up to 420 damage in an 11 m crater. It needs open sky overhead, and a tower in the way stops the dive at its foot. |

### Rex Splode: Duelist (explosive skirmisher)
325 HP · ground speed 9.4 · **no flight**: his own explosions launch him (rocket jumps) and never hurt him · regenerates 28 HP/s after 3.5 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Charged Coins | Flicks a kinetically charged coin from alternating hands, about 3 a second: 30 damage plus 15 splash on impact, so 45 on a direct hit. |
| RMB | Sticky Rod | A charged rod that sticks to whatever it hits. Press RMB again, or wait 3 s, to detonate it: up to 110 damage in 5 m, plus 30 to an enemy it is stuck to. |
| Shift | Blast Jump | Blows up the ground under him and launches him about 17 m where he looks: 45 damage where he left. Works in mid-air. 2 charges. |
| E | Concussion Grenade | Lobs the grenade off his belt. It bounces once and blows: up to 80 damage in 6 m, launching enemies and slowing them 35 % for 2 s. |
| F | Pocket Change | Fans out 7 short-fused coins at once, 24 damage each plus splash. Brutal up close. |
| Q | **SPLODE!** | Charges his own body for 2 s (+30 % speed, unstoppable), then detonates: up to 380 damage in 12 m. Rex survives it, blown sky-high. |

### Atom Eve: Strategist (shields and support)
300 HP · 7 s of flight · regenerates 20 HP/s after 3 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Particle Bolts | Rapid bolts that deal 21 damage each. Their splash mends nearby allies (not Eve) for only 5 HP. |
| RMB | Construct Fist | A giant energy fist: 90 damage and heavy knockback. |
| Shift | Atomic Bubble | Bubble the ally under your crosshair, or yourself, absorbing 225 damage for 4 s. 2 charges. |
| E | Disassembly Field | Enemies inside take **+25 % damage from all sources** and are slowed. |
| F | Restoration Pulse | Burst-heals allies within 15 m for 80, plus 40 over 2 s, and cleanses slows. |
| Q | **Unbound** | Eve breaks her mental block, as in the *Atom Eve* special, then you choose. **LMB: Annihilation Beam**, a giant beam at 420 DPS. **RMB: Reconstruction**, which revives every fallen ally and gives the team bubbles and a heal. |

### Robot: Strategist (tactician and tech)
350 HP · ground speed 8.4 · 6.5 s of flight on his hoverbike · self-repairs 18 HP/s after 3.5 s out of combat · **Tactical Uplink**: he and allies within 20 m recharge their abilities 20 % faster.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Wrist Cannons | Alternating plasma shots, 17 damage each, 8 a second. They heal nothing: Robot supports with tech, not his gun. |
| RMB | Micro-Missiles | The back pods fire 8 homing micro-missiles: 14 damage each, plus 12 splash. |
| Shift | Hard-Light Barrier | A 7 m wall of hard light for 5 s (700 HP). It stops all enemy fire from either side, while allies shoot through it. |
| E | EMP Disruptor | A thrown charge: 40 damage in 7 m. It pops bubbles and overhealth and locks enemy abilities and flight for 2 s, dropping fliers out of the sky. |
| F | Repair Drones | 3 drones fly to the most hurt allies within 25 m, Robot included: 25 HP/s for 4 s and 15 % less damage taken. |
| Q | **Tactical Override** | Hack the battlefield. A 35 m wave disrupts enemies for 3 s (no abilities or flight, +20 % damage taken) and overclocks allies for 6 s (cooldowns reset, +20 % damage and speed). |

His hoverbike streaks in under him when he takes off, banks with him in flight, peels away when he lands, and crashes if he dies on it.

### Omni-Man: Vanguard (brawler tank)
550 HP · ground speed 8.8, faster than a typical tank · 8 s of flight · **heals for 15 % of the damage he deals** · immune to knockback and slows, and stuns on him last half as long.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Brutal Strikes | 3-hit cleaving combo (54 / 54 / 90). The hammer-fist finisher sends out a ground shock. |
| RMB | Seismic Boulder | Rip up a chunk of the ground and throw it: 105 damage plus 45 splash. |
| Shift | Viltrumite Charge | Charge 24 m, carry the first enemy hit and slam them: 120 damage in total. |
| E | Thunderclap | 22 m cone, 85 damage, huge knockback and a 30 % slow. |
| F | Conqueror's Will | 150 overhealth, +20 % damage and 20 % damage reduction for 4 s. |
| Q | **A Fraction of Our Power** | Blitz between up to 5 enemies within 40 m for 150 damage each, ending in a thunderclap. |

### Battle Beast: Vanguard (feral juggernaut)
650 HP · ground speed 8.6 · **no flight**: he jumps high and pounces 30 m, even onto fliers · regenerates 20 HP/s after 5 s out of combat · **Thirst for Battle**: below half health he goes berserk, +25 % damage and 25 % less damage taken.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Rending Claws | 3-hit combo (55 / 55 / 95) that cleaves a wide arc. The double-claw finisher knocks enemies down. |
| RMB | Brace | Hold to guard behind his gauntlets: 65 % less damage from the front while he walks slowly, for up to 4 s. Once he has blocked 80 damage, his next claw is a counter for +50 %. |
| Shift | Pounce | Leaps up to 30 m onto a point or an enemy, even one in the air: up to 90 damage in 5 m on landing, and an enemy landed on directly is pinned for 0.8 s. |
| E | Primal Roar | Enemies within 15 m take 20 damage, deal 30 % less damage and are slowed 30 % for 3 s. He gains 150 overhealth. |
| F | Hurl | Grabs the enemy in front of him, hoists them overhead and hurls them about 20 m where he aims: 60 damage, plus 70 and a stun when they crash. |
| Q | **WORTHY FOE** | Goes berserk for 8 s: he grows 20 % bigger, becomes unstoppable, takes 40 % less damage, claws faster and can Pounce every 2 s. |

### Allen the Alien: Vanguard (comeback juggernaut)
525 HP · ground speed 8.5 · 7 s of flight at 16 m/s · regenerates 18 HP/s after 5 s out of combat · **Unopan Resilience**: the more he survives, the stronger he gets. Every hit he lives through builds Strain, at double the rate below 35 % health. After 3.5 s without taking damage, his Strain turns into Resilience. Each level (400 Strain) gives +4.5 % health, +3 % damage, +2 % speed and +3.5 % flight speed, up to 10 levels. Dying costs him half his levels. A meter by his health bar shows his Strain and level, and enemies see his level over his head.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Haymakers | 3-hit combo (48 / 48 / 82) that lunges onto enemies near the crosshair. The overhand finisher knocks them flat. |
| RMB | Planet Cracker | Hold to wind up, release to lunge and punch: 70 to 160 damage with the charge, and a full charge sends them flying. |
| Shift | Bulldozer | Shoulder-charge 24 m, plowing through everyone in the way: 65 damage each, knocked aside. |
| E | Unbreakable | Brace for 3 s: 50 % less damage taken, unstoppable, and every hit counts double as Strain. Ends in a shockwave of 50 damage plus 30 % of what he took (up to 220). |
| F | Second Wind | Come back now: all his Strain turns into Resilience at once and heals him for 40 % of it. |
| Q | **Beyond the Limit** | A 120-damage blast in 10 m, then 10 s at full Resilience, unstoppable and healed for 40 %. When it ends he keeps 2 extra levels. |

### The Immortal: Vanguard (undying guardian)
575 HP · ground speed 8.7 · 8 s of flight at 17 m/s · regenerates 20 HP/s after 5 s out of combat · **Undying**: a killing blow drops him to one knee instead. For 2.5 s his body knits back together while he takes half damage, then he rises at 50 % health with an 80-damage shockwave. Enemies can still finish him by dealing 450 damage while he is down. 40 s cooldown.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Centuries of War | 3-hit combo (52 / 52 / 90) that lunges onto enemies near the crosshair. The double-fist finisher cracks the ground. |
| RMB | Skybreaker Uppercut | A rising uppercut: 85 damage, launching the enemy high into the air. |
| Shift | Guardian's Dive | Fly to the ally (or spot) under the crosshair, up to 35 m away, and land in front of them with a 55-damage shockwave. The ally gets 120 overhealth. |
| E | Rallying Cry | He and allies within 18 m take 20 % less damage, deal 15 % more and get 60 overhealth for 4 s. |
| F | Hammerfall | Both fists into the ground: 95 damage in 8 m, launching and slowing enemies. From the air he dives down first and hits harder. |
| Q | **I Am Immortal** | For 8 s nothing can kill him: he is unstoppable, deals 20 % more damage and heals for 30 % of it. Undying recharges at once. |

## Design: support without healbots

The game is built so that no team comp, 2-2-2 or otherwise, is mandatory:

- **Everyone sustains themselves.** Each hero regenerates out of combat, and health orbs on the map restore 150 HP. Omni-Man's lifesteal keeps him alive by dealing damage rather than by soaking it, Battle Beast's roar gives him overhealth, and Allen turns the damage he survives into strength.
- **Shooting heals almost nothing.** Eve's primary mends allies for 5 HP per bolt, so her best use of left click is the same as everyone else's: shoot the enemy.
- **Support lives in the abilities.** Bubbles that block burst damage, a field that makes a target take more damage from the whole team, a short-cooldown burst heal, and an ultimate that either deletes a team fight or undoes one with a mass revive. The Immortal dives in to shield an ally and rallies the team around him.
- **At least two heroes per role, each with its own style.** Invincible dives from the air; Rex Splode stays on the ground, bombarding and rocket-jumping. Atom Eve protects and restores. Robot controls the fight: a wall that blocks the enemy's fire, an EMP that shuts down their abilities and flight, repair drones, faster cooldowns for everyone near him, and an ultimate that disrupts the enemy team while it overclocks his own. Among the four vanguards, Omni-Man is a lifestealing brawler, and Battle Beast is a juggernaut who braces against fire, roars to weaken a team and hurls them apart. Allen gets stronger with every fight he walks away from. The Immortal comes back from a killing blow and guards his team.
- **Ultimate charge comes from fighting.** Damage dealt, healing, shields, kills and a small passive trickle all charge it. A strategist earns their ultimate the same way a duelist does; Robot's barrier charges his for the damage it soaks.

## Training options (Esc)

- **No cooldowns, fast ultimate charge and god mode.** Buttons also fill your ultimate, reset cooldowns and kill all bots.
- **Bot behavior.** Bots can fight (*active*), only move around (*passive*) or stand still (*idle*), at easy, normal or hard difficulty.
- **Settings.** Graphics quality (low, medium or high), gore, comic sound-effect text, mouse sensitivity, invert Y and volume.

## Under the hood

- **Rendering.** three.js r169 (vendored in `vendor/`) with cel-shaded hero materials, shader outlines and HDR post-processing: bloom, shockwaves, chromatic aberration, radial blur, anime speed lines, ACES tone mapping and film grain. Particles are GPU-instanced, and there are trails, decals and pooled dynamic lights. Chicago's facades, streets, crater and station share three custom shaders. Its fires light the ruins with flickering point lights, and the skyline beyond the walls is built at a lower level of detail.
- **Animation.** All animation is procedural; none of the models' own animation clips are used. Eight different skeletons are normalized into one pose space. On top of that run keyframed attack clips with anticipation and follow-through, two-bone IK for arms and legs, a gait system with planted feet, flight poses driven by velocity, hit reactions, and verlet physics for capes, hair and Battle Beast's mane and braids. Robot's hoverbike is a separate prop that tilts with his body, with his hands on its grips, and Rex's coins and rods are split off his model to throw. Allen's model came without a skeleton, so the converter rigs it. His hands have no fingers, so the game adds knuckle joints to make his fists.
- **Audio.** Every sound effect is synthesized at load time with the Web Audio API, from 99 recipes with random variations, so the game ships no audio files. A convolution reverb, 3D panning and distance filtering place the sounds, and the wind, beam and hoverbike engine sounds play live. Battle Beast's roar is a formant-synthesized lion's voice.
- **Bots.** Each hero has its own bot logic for targeting, movement, ability use and ultimates. Eve chooses between her beam and a revive, Robot saves his override for a crowd, and Rex blast-jumps in and out of fights and meets divers with a point-blank grenade. Battle Beast braces against fire while he closes in. Allen braces when he's under fire and uses Second Wind once he's taken a beating, and the Immortal dives to allies in trouble. Heroes break off fights they are losing to recover, then come back; for Allen, backing off is how he banks his Strain. Omni-Man never backs off, and the Immortal doesn't while Undying is ready. In Chicago, bots plan routes on a navigation grid with A*. They push or contest the transport, slide along walls and climb down off rooftops.
- **Collision.** Heroes collide with boxes and cylinders on a spatial grid, and stand on whatever they land on. Fast heroes can't tunnel through roofs or slabs. A building taller than the flight ceiling is a wall all the way up. Abilities and effects use the floor under the hero, so under the station's roof they stay inside the hall. The camera's boom shortens ahead of walls, and when a swing past a corner puts the camera inside a building, it comes back out at full speed. With the hero's back to a wall, the camera moves in to the hero's head and hides the hero rather than ending up inside the wall.

```
index.html        screens, HUD markup, import map
src/main.js       boot
src/game.js       game states, player controller, match setup and lineups
src/engine/       renderer and post-FX, camera, input, math
src/anim/         rig retargeting, IK, clips, animator, cape/hair chains
src/world/        arena, world simulation (damage, collision, queries, orbs)
src/world/city/   destroyed Chicago: layout, route, buildings, station, the L, props, fires, sky
src/modes/        the payload mode
src/heroes/       hero data and balance, hero class, materials, kits/
src/combat/       projectiles
src/vfx/          particles and effects
src/audio/        procedural SFX engine
src/ai/           bots, and the navigation grid (nav.js)
src/ui/           HUD, payload HUD, menus, icons, styles
tools/            model conversion/optimization, Allen's auto-rig and the in-engine trailer pipeline
```

Developer URL parameters:

- `?auto=<hero>` skips the menus and starts a match as that hero: `invincible`, `rex`, `eve`, `robot`, `omniman`, `battlebeast`, `allen` or `immortal`.
- `?mode=payload` makes that match payload.
- `?map=chicago` puts the city behind the title screen.
- `?quality=low|medium|high` sets the graphics quality.
- `?autobot` lets a bot drive the player.

## Tests

`tools/tests/` holds headless tests that step the real game in Chromium, far faster than real time. They use Playwright from `tools/package.json` (`npm install` in `tools/`). Serve the game, then run them from `tools/`:

```
npm start                                           # in the project root
cd tools && node tests/run.mjs                      # every suite
node tests/run.mjs "eve" --file abilities.test.js   # tests whose name contains "eve", one file
```

`GAME_URL` points the runner at another server (default `http://localhost:5173/`). Each test reseeds `Math.random`, so short tests repeat exactly. The long bot matches can play out differently from run to run, because a few effects are scheduled on real-time timers.

- **poses** plays every clip and locomotion mode of every hero and checks each frame: no NaN, no stretched limbs, a supporting foot on the ground, knees bending forward, no single-frame pose pops.
- **transitions** covers drops, jumps, flight take-off and landing, flight running out, knockback tumbles on the ground and in the air, death, respawn, revive and teleports, a hero wedged where two boxes meet, an ability cast mid-tumble, plus Omni-Man's cape.
- **abilities** checks every ability's damage, cooldowns and charges and that nothing is left behind afterwards, including when casters or targets die mid-ability, when you swap hero mid-ability, in mirror matches, into walls, at the arena edge and under the ceiling.
  - Robot: the barrier from both sides and against big projectiles and blasts, the EMP lockout, drone targeting, the override wave, the uplink and the hoverbike.
  - Rex: rocket jumps and self-immunity, sticky rods on heroes and walls, the grenade bounce, the point-blank coin fan and surviving his own ult.
  - Battle Beast: the brace from the front and back, the counter, pouncing onto fliers, the roar's weakening, the hurl and its crash, and the berserk ult's size, damage reduction and Pounce cooldown.
  - Allen: Strain banking into Resilience only once the fight is over, the level cap, losing half on death, the charged punch, the bulldozer, Unbreakable's doubled Strain and shockwave, Second Wind and the ult's surge and the levels it leaves.
  - The Immortal: going down on one knee and rising, being finished while down, grabs that can't move him, the uppercut, the dive to an ally, the rallying cry, Hammerfall from the ground and from the air, and the ult.
- **rules** covers shields, overhealth, damage modifiers, lifesteal, ultimate charge, respawns, health orbs, regeneration, the training toggles, friendly fire, Omni-Man's unstoppable passive, Battle Beast's berserk passive, the hero select keys, and the 3v3 lineups: mirrored roles, nobody twice in a match, and every hero getting games.
- **camera** feeds the mouse filter bogus pointer-lock spikes and real flicks, then runs each hero past pillars, into cover, through flight, every ability and ult, knockback and death, backs a flier into a pillar at flight speed and plays a 2-minute bot match. It fails on any one-frame jump of the camera's boom or follow point, a view turn the player didn't make, or the camera stuck inside a wall.
- **payload** checks the mode's rules: setup and its door, pushing, contesting, rollback, checkpoints, overtime, delivery, spawn rooms and riding the transport. It also checks the map:
  - Every spawn reaches every checkpoint on foot, and the route is clear for the transport.
  - Movement abilities thrown at the buildings never end inside one or out of bounds.
  - Spawn points spread across every spawn room, and health orbs stand clear on the floor.
  - Abilities used under the station's roofs stay under them, and Mach Breaker needs open sky.
  - The camera stays out of a wall the hero has backed into.

  It also checks the 6v6 lineups, then plays a whole 6v6 bot match on hard. That match checks every hero every frame. It fails on stuck states, a hero inside a building or sunk into the floor for more than 6 frames (shorter grazes are counted but don't fail), heroes above the ceiling, a match with no result, too few kills, the camera inside buildings for more than 1 % of the time, or a slow simulation step.
- **soak** runs two 3v3 bot matches on hard: the first six heroes for 10 minutes, then Allen and the Immortal on opposite sides for 6. It fails on NaN, heroes leaving the arena or ending up inside cover, stuck abilities, tumbles or carries, HP or ultimate out of bounds, late respawns, broken poses, and growing scene, effect or projectile counts.

## Credits and notice

This is an unofficial, non-commercial fan project. *Invincible* and its characters belong to their respective owners (Robert Kirkman, Cory Walker, Ryan Ottley, Image Comics, Skybound and Amazon). The 3D models are fan-made downloads supplied by the project owner for personal testing. The Invincible, Atom Eve and Omni-Man models are not covered by any license in this repository, so check their original terms before you share or publish the game.

- Robot model: ["Invincible VS Robot"](https://sketchfab.com/3d-models/invincible-vs-robot-1941b45046394a8abf38599df9865ef1) by th7915562, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: normals fixed, bones renamed, the hoverbike split off into its own prop, rescaled, the hoverbike simplified, and the file compressed (`assets/models/robot.glb`).
- Rex Splode model: ["Invincible VS Rex Splode"](https://sketchfab.com/3d-models/invincible-vs-rex-splode-7a07e409d8a8406995bc64b028e2a73a) by th7915562, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: meshes and bones renamed, the coin and rod split off into their own props, rescaled, the body and head simplified, and the file compressed (`assets/models/rex-splode.glb`).
- Battle Beast model: ["Invincible VS Battle Beast"](https://sketchfab.com/3d-models/invincible-vs-battle-beast-43f7b0eebb1c4c798eab3236584a8fd2) by th7915562, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: meshes and bones renamed, rescaled, the mane and head simplified, its largest texture downsized to 2048 px, and the file compressed (`assets/models/battle-beast.glb`).
- Allen the Alien model: ["Allen the Alien - Invincible"](https://sketchfab.com/3d-models/allen-the-alien-invincible-364d57fa931e4b588ee8ee00176cbe0e) by [patmateee](https://sketchfab.com/patmateee), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: the hidden triangles culled and the rest decimated (from 1.4 million to 50,000 triangles), rigged with a skeleton and automatic skin weights, rescaled, stood on the floor, and the file compressed (`assets/models/allen.glb`).
- The Immortal model: ["THE-IMMORTAL"](https://sketchfab.com/3d-models/the-immortal-9293bf603f1f4111ad123d1395ea19e0) by [joaocarrascok](https://sketchfab.com/joaocarrascok), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: meshes renamed, bone numbering stripped, the eyes attached to their eye bones, rescaled, and the file compressed (`assets/models/the-immortal.glb`).

- three.js © three.js authors, MIT license (`vendor/three/LICENSE`).
- Anton and Barlow Condensed fonts, SIL Open Font License (`assets/fonts/`).
