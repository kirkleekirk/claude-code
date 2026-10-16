# Avion Exo Zombies

A round-based zombies game in the browser. Combat and movement follow *Advanced Warfare*'s Exo Zombies: boost jump, boost dodge, exo slam, Exo upgrades, a 3D-printer mystery box and a multi-level weapon forge. The look and sound aim for *Ghosts*: muted dusk grading, heavy fog, grain, and a quiet tactical HUD.

There are two maps, chosen on the map screen:

- **Rainshadow** is Avion's exo-suit test site deep in the Olympic Peninsula forest. A match starts at golden hour and darkens round by round: the sun sets over the ridge, the sky turns purple, and a crescent moon rises by round 15.
- **Ember Hollow** follows Rainshadow's ending. Project Daybreak traced the Nightwarden's power to a tourist cave in the Cascade foothills, a front Avion has owned since 2019. Behind the show cave, Avion dug down to a geothermal reactor deep under the mountain. It is a large map that plays from dawn into morning.

## Play it

The game is plain HTML and JavaScript (ES modules, three.js r170 vendored). There is no build step, but browsers block modules and audio loading from `file://`, so serve the folder:

```bash
cd avion-zombies
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

To host it, turn on GitHub Pages for the repository and open `/avion-zombies/`.

It runs on desktop browsers with WebGL 2. Phones and tablets get on-screen touch controls; controllers work through the Gamepad API. Use **Options → Graphics quality** if the frame rate drops.

## How a match goes (Rainshadow)

1. **Trailhead (spawn).** You start with the M45 Merlin pistol and 500 points near a crashed Avion aircraft. Shoot zombies for points (+10 per hit, +60 per kill, +100 for headshots, +130 for melee kills).
2. **Checkpoint Gate (750).** The **Exo Armory** past the gate gives you the exo suit for free: boost jump, boost dodge and slam.
3. Two routes lead to the hangar: the **Research Wing** door (1000) at the checkpoint, or **Clear Fallen Trees** (1000) from the trailhead out to the **Ridge Overlook**. Either way, one more door (1250) opens the **Hangar**.
4. **Power** is in Hangar 2. It switches on the Exo upgrades and the **Weapon Forge**.
5. Survive. Every 5–6 rounds an **Exo Swarm** rolls the fog in.

Exo upgrades need the exo suit and power. Exo Medic is the exception: it works without power.

| Station | Cost | What it does |
| --- | --- | --- |
| Exo Health | 2500 | 250 health instead of 100 |
| Exo Reload | 3000 | Reloads twice as fast |
| Exo Medic | 500 | Auto-revive when you go down (can be bought 3 times) |
| Exo Slam | 2000 | Slams hit twice as wide and far harder |
| Exo Stabilizer | 2000 | Less recoil and spread, faster aim, bigger headshots |
| Exo Velocity | 2000 | Faster movement and dodge recharge |
| 3D printer (mystery box) | 950 | Random weapon. Can malfunction and relocate |
| Weapon Forge | 5000 / 7500 / 10000 | Three upgrade levels per weapon |

Power-ups drop from kills: Max Ammo, Insta-Kill, Double Points, Kaboom (nuke) and Exo Surge (endless dodges, full-power slams).

Zombie types: walkers, runners and sprinters; **exo zombies** that boost-leap at you (round 6+); **EMZ** that knock your exo suit offline when they die near you (round 9+); and **bloaters** that burst into toxic gas (round 12+).

## Project Daybreak (Easter egg and boss fight)

*Spoilers.* After the power comes on, a radio call from Dr. Ilse Voss sets it up, and a **Project Daybreak** checklist appears under the objective. It works in a normal match and in free roam.

1. **Recover three golden prisms** (each sits in a faint shaft of light): the desk in the **Ranger Station** cabin, a desk in the **Research Wing** east lab, and the bench beside the **Radio Tower** shack.
2. **Install them** at the console of the **Daybreak array** on the Hangar Yard helipad.
3. **Power** must be on.
4. **Shoot the three heliostat mirrors** on posts around the array. Each one swings round to face the array and its lamp turns green.
5. **Activate the array.** It drags the night in, and **the Nightwarden** claws its way out of the ground.

**The fight.** At night its umbral shield blocks about 92% of damage. The array needs about 25 seconds to charge. When it's ready, use the console to **ignite Daybreak**: the sun comes up for 24 seconds, the shield shatters, and the chest plates open over a glowing **core** that takes triple damage. Then night falls, the shield comes back and the array recharges. Repeat until it drops.

Its attacks all have a tell:

- **Swipe.** A huge clawed arm swing up close. Don't stand in front of it.
- **Slam.** Both fists go up, a red ring marks the impact, then a shockwave rolls out. Jump it.
- **Charge.** It crouches, roars, and a red lane appears on the ground. Dodge sideways. If it hits a wall it is stunned for a moment.
- **Shadow orbs.** Homing bolts. Shoot them down or outrun them.
- **Summon.** At health thresholds and through the night it calls in its own zombies.
- **Enraged** below half health: faster, double shockwaves, five orbs.

If you run too far or climb out of reach, it shadow-steps after you.

**Reward.** Every Exo upgrade installed, a Max Ammo, +5000 points, and a sunrise that stays for the rest of the match.

## Ember Hollow

You land in the Ember Hollow Caverns parking lot in Avion's XV-9 Kestrel. The exo suit is on a rack inside its cabin. The surface is a tourist attraction, and in Infinite Warfare style **each area has its own breaker**:

| Breaker | Where | Powers |
| --- | --- | --- |
| Parking lot | Panel by the lot walkway | Lot lights, Exo Velocity |
| Visitor center | Office wall in the lodge | Lodge lights, Exo Health, the souvenir fabricator (the 3D printer's first spot) |
| Gem mine | Pump house | Flume pump, mine lights, Exo Reload |
| Cave entrance | Back of the ticket booth on the plaza | Plaza lights, Exo Slam |

Exo Medic is by the Kestrel and works without power, as on Rainshadow.

The way down:

1. **Visitor Center** (750) and the **Gem Mine** gate (750) open off the lot. The lodge's **Staff Exit** (1000) or the mine's **Upper Trail** (1000) lead up to the **Cave Entrance** plaza under the cliff.
2. **Cave Entrance** or **Tour Exit** (1250 each) into the **show cave**: the 1931 entry tunnel, the Grand Gallery around Mirror Lake and the Sentinels, and the Cathedral Room with the Pipe Organ.
3. **Staff Only** (1500) at the end of the tour path is Avion's real entrance. Behind it are the lamp house, a long decline with a man-car on its track, and Checkpoint 2.
4. From the checkpoint, **Clear the Rockfall** (1500) to the **Crystal Grotto** (giant selenite, hot pools and a survey camp), or take **River Access** (1500) to the **Underground River**. A second rockfall (1250) joins them.
5. **CALDERA** (1750), at the end of the river walkway, opens the reactor dome. A magma pit glows under the core, with turbines, steam mains and the control room.
6. **Start the reactor** at the control room console. Power runs out through every level of the caves as a wave of lights, Exo Stabilizer and the **Weapon Forge** come online, and the **service lift** starts working. It runs between the reactor and the visitor center, so the long walk only happens once.

The 3D printer moves between the lodge, the Cathedral Room, the grotto camp and the reactor dome. Wall-buys: the 1894 Owl (back of the tour bus), MP-22 Wren (snack bar), KV-9 Kestrel (pump house), S-20 Shrike (tour shelter), AR-56 Harrier (entry tunnel), MR-308 Osprey (Cathedral Room), M-54 Heron (lamp house) and AK-12 Goshawk (checkpoint booth).

Down in the dark, a helmet lamp switches itself on wherever there is no other light.

## Controls

| Action | Keyboard / mouse | Controller |
| --- | --- | --- |
| Move / look | WASD / mouse | Left / right stick |
| Fire / aim | Left / right click | RT / LT |
| Jump, boost jump | Space, Space in the air | A |
| Sprint | Shift | L3 |
| Boost dodge | X or Alt, or Shift in the air | LB |
| Crouch, slide, exo slam | C (while sprinting: slide; in the air: slam) | B |
| Reload / use | R / F | X |
| Melee | V | R3 |
| Frag / lure drone | E or G / Q | RB / D-pad |
| Switch weapon | 1, 2, mouse wheel | Y |
| Stats / pause | Tab / Esc | Back / Start |

Touch: drag the left side to move (push far to sprint), drag the right side to look, and hold FIRE while sliding your thumb to aim. A USE button appears next to anything you can buy.

## Project layout

```
index.html, css/style.css     page shell, HUD and menus
js/main.js                    entry point
js/game/                      game loop, player, weapons, zombies, rounds, buyables, power-ups,
                              the Daybreak Easter egg (daybreak.js) and the Nightwarden boss (boss.js)
js/world/                     terrain, sky and time of day, fog, forest, the Rainshadow map (map_rainshadow.js)
js/world/cave*.js             cave rock (signed-distance field, meshing, collision) and baked cave lighting
js/world/eh_*.js              Ember Hollow (map_emberhollow.js): surface, show cave, Avion's levels, reactor
js/engine/                    audio + procedural sound synthesis, input, physics, nav flow field, particles, post-processing
js/ui/                        HUD, menus, touch controls, vector icons
assets/audio/                 converted gunfire, reloads, zombie voices, menu theme
assets/models/avatars.json    the Kinect crowd avatars, converted to skinned meshes
assets/textures/              zombified avatar texture + eye glow mask
vendor/                       three.js r170 (MIT)
```

## Credits

- Gunfire, reloads and handling: *Snake's Authentic Gun Sounds* and *Snake's SECOND Authentic Gun Sounds* by Snake of [F8 Studios](https://f8studios.itch.io/snakes-authentic-gun-sounds).
- Zombie voices and foley: *Call of Duty: World at War* zombies sound set © Activision / Treyarch.
- Zombie bodies: avatar crowd models from *Kinect Adventures!* (Xbox 360) © Microsoft, re-textured and animated in code. The source files contained the rig and skin weights but no animation clips, so every zombie animation is procedural.
- Main menu theme: supplied by the project's creator.
- Inspired by *Call of Duty: Advanced Warfare* Exo Zombies and *Call of Duty: Ghosts*. Avion, Rainshadow and Ember Hollow are fictional.
- Engine: [three.js](https://threejs.org) r170 (MIT). Fonts: Barlow Condensed and Share Tech Mono (SIL OFL). Everything else is generated in code.

This is a non-commercial fan project. The *World at War* and *Kinect Adventures* assets belong to their owners.
