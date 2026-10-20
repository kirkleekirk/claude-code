# Invincible Adversaries

A fan-made 3v3 third-person hero shooter prototype starring **Invincible**, **Atom Eve** and **Omni-Man**. It runs in the browser with three.js and needs no build step.

The game drops you into a flat training arena. You fight alongside the other two heroes as bots, against bots of all three heroes. You can swap hero at any time and use training toggles to test kits quickly.

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

All three are meant to feel overpowered: high damage, short cooldowns and huge mobility. They are balanced against each other rather than toned down.

### Invincible: Duelist (flying dive DPS)
375 HP · ground speed 9.2 · **unlimited flight** at 21 m/s · regenerates 35 HP/s after 4 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Viltrumite Barrage | 4-hit combo (34 / 34 / 40 / 62) that lunges onto targets near the crosshair. The finisher launches. |
| RMB | Shockwave Clap | 16 m cone, 55 damage plus knockback. 2 charges, 3.5 s cooldown. |
| Shift | Sonic Boom Dash | 32 m supersonic dash, 65 damage to everything in the path. |
| E | Meteor Dive | Dive at a point up to 45 m away: 95 damage in 6 m and a knock-up. |
| F | Skyward Slam | Grab an enemy, rocket upward and slam them down for 110 damage plus a stun. |
| Q | **Mach Breaker** | Launch into the sky, mark a target, then crash down at Mach 10: up to 420 damage in an 11 m crater. |

### Atom Eve: Strategist (shields and support)
300 HP · 7 s of flight · regenerates 20 HP/s after 3 s out of combat.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Particle Bolts | Rapid bolts that deal 24 damage each. Their splash mends allies for only 5 HP. |
| RMB | Construct Fist | A giant energy fist: 90 damage and heavy knockback. |
| Shift | Atomic Bubble | Bubble the ally under your crosshair, or yourself, absorbing 225 damage for 4 s. 2 charges. |
| E | Disassembly Field | Enemies inside take **+25 % damage from all sources** and are slowed. |
| F | Restoration Pulse | Burst-heals allies within 15 m for 80, plus 40 over 2 s, and cleanses slows. |
| Q | **Unbound** | Eve breaks her mental block, as in the *Atom Eve* special, then you choose. **LMB: Annihilation Beam**, a giant beam at 420 DPS. **RMB: Reconstruction**, which revives every fallen ally and gives the team bubbles and a heal. |

### Omni-Man: Vanguard (brawler tank)
650 HP · ground speed 8.8, faster than a typical tank · 8 s of flight · **heals for 25 % of the damage he deals** · immune to knockback and slows, and stuns on him last half as long.

| Key | Ability | Effect |
| --- | --- | --- |
| LMB | Brutal Strikes | 3-hit cleaving combo (58 / 58 / 96). The hammer-fist finisher sends out a ground shock. |
| RMB | Seismic Boulder | Rip up a chunk of the ground and throw it: 105 damage plus 45 splash. |
| Shift | Viltrumite Charge | Charge 24 m, carry the first enemy hit and slam them: 120 damage in total. |
| E | Thunderclap | 22 m cone, 85 damage, huge knockback and a 30 % slow. |
| F | Conqueror's Will | 225 overhealth, +20 % damage and 30 % damage reduction for 4 s. |
| Q | **A Fraction of Our Power** | Blitz between up to 5 enemies within 40 m for 150 damage each, ending in a thunderclap. |

## Design: support without healbots

The game is built so that no team comp, 2-2-2 or otherwise, is mandatory:

- **Everyone sustains themselves.** Each hero regenerates out of combat, health orbs on the map restore 150 HP, and Omni-Man's lifesteal keeps the tank alive by dealing damage rather than by soaking it.
- **Shooting heals almost nothing.** Eve's primary mends allies for 5 HP per bolt, so her best use of left click is the same as everyone else's: shoot the enemy.
- **Support lives in the abilities.** Bubbles that block burst damage, a field that makes a target take more damage from the whole team, a short-cooldown burst heal, and an ultimate that either deletes a team fight or undoes one with a mass revive.
- **Ultimate charge comes from fighting.** Damage dealt, healing, shields, kills and a small passive trickle all charge it. A strategist earns her ultimate the same way a duelist does.

## Training options (Esc)

- **No cooldowns, fast ultimate charge and god mode.** Buttons also fill your ultimate, reset cooldowns and kill all bots.
- **Bot behavior.** Bots can fight (*active*), only move around (*passive*) or stand still (*idle*), at easy, normal or hard difficulty.
- **Settings.** Graphics quality (low, medium or high), gore, comic sound-effect text, mouse sensitivity, invert Y and volume.

## Under the hood

- **Rendering.** three.js r169 (vendored in `vendor/`) with cel-shaded hero materials, shader outlines and HDR post-processing: bloom, shockwaves, chromatic aberration, radial blur, anime speed lines, ACES tone mapping and film grain. Particles are GPU-instanced, and there are trails, decals and pooled dynamic lights.
- **Animation.** All animation is procedural; none of the models' own animation clips are used. Three different skeletons are normalized into one pose space. On top of that run keyframed attack clips with anticipation and follow-through, two-bone IK for arms and legs, a gait system with planted feet, flight poses driven by velocity, hit reactions, and verlet physics for capes and hair.
- **Audio.** Every sound effect is synthesized at load time with the Web Audio API, from 45 recipes with random variations, so the game ships no audio files. A convolution reverb, 3D panning and distance filtering place the sounds, and the wind and beam sounds play live.
- **Bots.** Each hero has its own bot logic for targeting, movement, ability use and ultimates, including Eve's beam-or-revive choice.

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
tools/            model conversion and optimization pipeline
```

Developer URL parameters: `?auto=invincible|eve|omniman` skips the menus, `?quality=low|medium|high` sets the graphics quality and `?autobot` lets a bot drive the player.

## Credits and notice

This is an unofficial, non-commercial fan project. *Invincible* and its characters belong to their respective owners (Robert Kirkman, Cory Walker, Ryan Ottley, Image Comics, Skybound and Amazon). The 3D models are fan-made downloads supplied by the project owner for personal testing. They are not covered by any license in this repository, so check their original terms before you share or publish the game.

- three.js © three.js authors, MIT license (`vendor/three/LICENSE`).
- Anton and Barlow Condensed fonts, SIL Open Font License (`assets/fonts/`).
