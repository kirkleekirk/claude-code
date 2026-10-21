# Invincible Adversaries

A fan-made 3v3 third-person hero shooter prototype starring **Invincible**, **Atom Eve**, **Robot** and **Omni-Man**. It runs in the browser with three.js and needs no build step.

The game drops you into a flat training arena, with two bot allies against three bot enemies. Each match draws its lineups from the four heroes: nobody appears twice on a team, every hero is on the field, and both teams have the same number of strategists. You can swap hero at any time and use training toggles to test kits quickly.

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
| `Space` | Jump. Double-tap to take off or land; hold to climb while flying. |
| `Ctrl` / `C` | Descend or land |
| `LMB` / `RMB` | Primary / secondary fire |
| `Shift`, `E`, `F` | Abilities |
| `Q` | Ultimate |
| `H` | Swap hero (training) |
| `U` | Instantly fill your ultimate (training) |
| `Esc` | Pause menu: training options and settings |

## The heroes

All four are meant to feel overpowered: high damage, short cooldowns and huge mobility. They are balanced against each other rather than toned down.

### Invincible: Duelist (flying dive DPS)
425 HP · ground speed 9.2 · **unlimited flight** at 21 m/s · regenerates 35 HP/s after 3.5 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Viltrumite Barrage | 4-hit combo (44 / 44 / 52 / 80) that lunges onto targets near the crosshair. The finisher launches. |
| RMB | Shockwave Clap | 16 m cone, 65 damage plus knockback. 2 charges, 3.5 s cooldown. |
| Shift | Sonic Boom Dash | 32 m supersonic dash, 75 damage to everything in the path. |
| E | Meteor Dive | Leap onto a point up to 45 m away (or dive straight down from the air): 95 damage in 6 m and a knock-up. |
| F | Skyward Slam | Grab an enemy, rocket upward and slam them down for 110 damage plus a stun. |
| Q | **Mach Breaker** | Launch into the sky, mark a target, then crash down at Mach 10: up to 420 damage in an 11 m crater. |

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

## Design: support without healbots

The game is built so that no team comp, 2-2-2 or otherwise, is mandatory:

- **Everyone sustains themselves.** Each hero regenerates out of combat, health orbs on the map restore 150 HP, and Omni-Man's lifesteal keeps the tank alive by dealing damage rather than by soaking it.
- **Shooting heals almost nothing.** Eve's primary mends allies for 5 HP per bolt, so her best use of left click is the same as everyone else's: shoot the enemy.
- **Support lives in the abilities.** Bubbles that block burst damage, a field that makes a target take more damage from the whole team, a short-cooldown burst heal, and an ultimate that either deletes a team fight or undoes one with a mass revive.
- **Two strategists, two styles.** Atom Eve protects and restores. Robot controls the fight: a wall that blocks the enemy's fire, an EMP that shuts down their abilities and flight, repair drones, faster cooldowns for everyone near him, and an ultimate that disrupts the enemy team while it overclocks his own.
- **Ultimate charge comes from fighting.** Damage dealt, healing, shields, kills and a small passive trickle all charge it. A strategist earns their ultimate the same way a duelist does; Robot's barrier charges his for the damage it soaks.

## Training options (Esc)

- **No cooldowns, fast ultimate charge and god mode.** Buttons also fill your ultimate, reset cooldowns and kill all bots.
- **Bot behavior.** Bots can fight (*active*), only move around (*passive*) or stand still (*idle*), at easy, normal or hard difficulty.
- **Settings.** Graphics quality (low, medium or high), gore, comic sound-effect text, mouse sensitivity, invert Y and volume.

## Under the hood

- **Rendering.** three.js r169 (vendored in `vendor/`) with cel-shaded hero materials, shader outlines and HDR post-processing: bloom, shockwaves, chromatic aberration, radial blur, anime speed lines, ACES tone mapping and film grain. Particles are GPU-instanced, and there are trails, decals and pooled dynamic lights.
- **Animation.** All animation is procedural; none of the models' own animation clips are used. Four different skeletons are normalized into one pose space. On top of that run keyframed attack clips with anticipation and follow-through, two-bone IK for arms and legs, a gait system with planted feet, flight poses driven by velocity, hit reactions, and verlet physics for capes and hair. Robot's hoverbike is a separate prop that tilts with his body, with his hands on its grips.
- **Audio.** Every sound effect is synthesized at load time with the Web Audio API, from 65 recipes with random variations, so the game ships no audio files. A convolution reverb, 3D panning and distance filtering place the sounds, and the wind, beam and hoverbike engine sounds play live.
- **Bots.** Each hero has its own bot logic for targeting, movement, ability use and ultimates, including Eve's beam-or-revive choice and Robot saving his override for a crowd. Invincible and Eve break off fights they are losing to recover, then come back.

```
index.html        screens, HUD markup, import map
src/main.js       boot
src/game.js       game states, player controller, match setup
src/engine/       renderer and post-FX, camera, input, math
src/anim/         rig retargeting, IK, clips, animator, cape/hair chains
src/world/        arena, world simulation (damage, queries, orbs)
src/heroes/       hero data and balance, hero class, materials, kits/
src/combat/       projectiles
src/vfx/          particles and effects
src/audio/        procedural SFX engine
src/ai/           bots
src/ui/           HUD, menus, icons, styles
tools/            model conversion/optimization and the in-engine trailer pipeline
```

Developer URL parameters: `?auto=invincible|eve|robot|omniman` skips the menus, `?quality=low|medium|high` sets the graphics quality and `?autobot` lets a bot drive the player.

## Tests

`tools/tests/` holds headless tests that step the real game in Chromium, far faster than real time. They use Playwright from `tools/package.json` (`npm install` in `tools/`). Serve the game, then run them from `tools/`:

```
npm start                                           # in the project root
cd tools && node tests/run.mjs                      # every suite
node tests/run.mjs "eve" --file abilities.test.js   # tests whose name contains "eve", one file
```

`GAME_URL` points the runner at another server (default `http://localhost:5173/`). Runs are deterministic: each test reseeds `Math.random`.

- **poses** plays every clip and locomotion mode of every hero and checks each frame: no NaN, no stretched limbs, a supporting foot on the ground, knees bending forward, no single-frame pose pops.
- **transitions** covers drops, jumps, flight take-off and landing, flight running out, knockback tumbles on the ground and in the air, death, respawn, revive and teleports, plus Omni-Man's cape.
- **abilities** checks every ability's damage, cooldowns and charges and that nothing is left behind afterwards, including when casters or targets die mid-ability, when you swap hero mid-ability, in mirror matches, into walls, at the arena edge and under the ceiling. Robot's kit gets its own checks: the barrier from both sides and against big projectiles and blasts, the EMP lockout, drone targeting, the override wave, the uplink and the hoverbike.
- **rules** covers shields, overhealth, damage modifiers, lifesteal, ultimate charge, respawns, health orbs, regeneration, the training toggles, friendly fire and Omni-Man's unstoppable passive.
- **camera** feeds the mouse filter bogus pointer-lock spikes and real flicks, then runs each hero past pillars, into cover, through flight, every ability and ult, knockback and death, plus a 2-minute bot match, and fails on any one-frame jump of the camera's boom or follow point, a view turn the player didn't make, or the camera stuck inside a wall.
- **soak** runs a 10-minute 3v3 bot match on hard with all four heroes and fails on NaN, heroes leaving the arena or ending up inside cover, stuck abilities, tumbles or carries, HP or ultimate out of bounds, late respawns, broken poses, and growing scene, effect or projectile counts.

## Credits and notice

This is an unofficial, non-commercial fan project. *Invincible* and its characters belong to their respective owners (Robert Kirkman, Cory Walker, Ryan Ottley, Image Comics, Skybound and Amazon). The 3D models are fan-made downloads supplied by the project owner for personal testing. The Invincible, Atom Eve and Omni-Man models are not covered by any license in this repository, so check their original terms before you share or publish the game.

- Robot model: ["Invincible VS Robot"](https://sketchfab.com/3d-models/invincible-vs-robot-1941b45046394a8abf38599df9865ef1) by th7915562, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed for the game: normals fixed, bones renamed, the hoverbike split off into its own prop, rescaled, the hoverbike simplified, and the file compressed (`assets/models/robot.glb`).

- three.js © three.js authors, MIT license (`vendor/three/LICENSE`).
- Anton and Barlow Condensed fonts, SIL Open Font License (`assets/fonts/`).
