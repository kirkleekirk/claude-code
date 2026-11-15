# Task: Build a hero-dispatch game with tactical battles. Maximum quality.

You are building a complete, polished, playable browser game. Treat it as a shipped product, not a prototype. The bar: a stranger opens the file, understands it within a minute, and is still playing forty minutes later because the loop is fun.

## Priorities (when they conflict, the higher one wins)
1. The gameplay loop and how enjoyable it is to play, moment to moment.
2. It runs and plays correctly: no crashes, soft-locks, dead ends or broken states.
3. It looks and sounds good.
4. Pacing: a slow, welcoming start that ramps into a real late-game rush.

## The game
It plays like the shift gameplay of *Dispatch* (AdHoc Studio, 2025), where you are a dispatcher sending heroes out on calls, and its combat segments play like the grid battles of *South Park: The Fractured But Whole*. Be inspired by them, do not copy them. All characters, names, writing and art must be original.

You are a dispatcher. During a shift, calls come in. Each call needs a mix of stats. You assign heroes from a roster you collect and upgrade. Some calls turn into fights that you can either auto-resolve or command yourself on a tactical grid.

### Part A: the dispatch shift (the core loop)
- Five stats: Combat, Vigor, Mobility, Charisma, Intellect. Each call shows a requirement profile across them. The assigned team's stats fill it, and the success chance comes from how well the team covers the profile.
- Add depth beyond raw stats: hero tags (Flight, Tech, Stealth...) that give bonuses on matching calls, hero-pair chemistry (some pairs +, some -), and hero personalities.
- **Odds must be honest and visible.** Show the real success chance. Guarantee success at or above a clearly shown threshold (around 80%). Dispatch reportedly did something similar because players hated losing at high displayed odds. Never hide how the number is built; offer a "why this number" breakdown.
- Heroes sent out are unavailable until they return. Injuries lower stats (for example -1 across the board), and a second injury puts a hero Down. Sending a hurt hero is a real gamble.
- A shift clock with pause and speed controls, calls with expiry timers, a city map with pins, hero tokens that travel to the call and back. When nothing needs the player, time skips ahead by itself. Never leave dead time.
- The player should make a meaningful decision every 10 to 20 seconds: who to send, who to hold back, which call to sacrifice.
- Personality: funny radio lines, mid-mission radio checks (a dialogue choice where matching the hero's temperament gives a bonus and a mismatch costs), short story scenes between shifts, a supervisor character who teaches.
- Shift report with grade, 3-star goals, earnings and XP. Allow a retry.

### Part B: tactical battle segments (Fractured-But-Whole style)
- About 9x6 grid, axis-aligned tiles, side-on view, 2 to 3 heroes versus 3 to 6 enemies.
- A turn-order timeline shown 8 or more turns ahead, driven by speed. Some abilities delay or haste units, and the preview shows it.
- Each turn: one move and one action, in either order. Actions are a basic attack, two skills with cooldowns, and an ultimate charged by dealing and taking damage.
- Attack shapes with real variety: melee, line projectile, piercing line, cone, burst, plus/row, dash-through, teleport, swap, self-burst, heals and shields.
- Knockback and pull. Pushing a unit into another unit or an obstacle deals slam damage to both. Chain reactions are the highlight. Include explosive barrels, hazards (fire, ice that extends slides, live wires, toxic) and time bombs. Flanking gives a damage bonus.
- **Hover preview before committing:** affected tiles, damage per unit, kills, where each pushed unit ends up, and the resulting timeline order.
- 5 or more enemy archetypes with distinct behaviors. Enemies **telegraph** their target tiles before they strike. Bosses have multiple abilities and summons.
- Juice: damage numbers, comic onomatopoeia bursts, screenshake, hit-stop, projectiles, particles, a full-screen ultimate cut-in, KO and victory moments.
- Fights last about 3 to 6 rounds (45 to 90 seconds) and every turn has a real decision. Rank the result (par rounds, nobody down).
- The first fight is a forgiving tutorial with in-context tips and a no-penalty retry.

### Part C: progression
- 8 to 10 original heroes with distinct roles, each with a 4-ability kit and 3 perks. Heroes level with XP, spend points on stats and perks, and are recruited over time.
- Hub upgrades bought with funds. The economy must be tuned so the player cannot afford everything.
- One stat system drives both modes: the same stats set dispatch odds and battle strength (HP, speed, damage, crit, Hype gain).

### Part D: pacing (slow, then it picks up)
- Shift 1: three calls, one at a time, a guided coach, nothing can go badly wrong. First level-up lands by the end of shift 1.
- Shifts 2 to 3: chemistry and the first fight. Shifts 4 to 6: overlapping, clustered calls, radio checks, recruiting. Late shifts: shorter windows, injuries that bite, crisis calls that need three heroes, a rival that poaches missed calls, a boss finale. Then an endless mode.
- Target about an hour for the story campaign.

### Presentation and art direction
- **Characters: flat-vector superheroes.** Think clean vector super-hero sheets: heroic proportions (small head, broad shoulders, V-torso), flat colour blocks with simple two-tone shading, soft ground shadows, capes, masks, boots and gloves. Then add a bit more detail than a bare flat sheet: costume trim and piping, belts and pouches, shoulder pads, bracers, boot cuffs, muscle shading, hair highlights and readable faces with expressions. Thin tinted edges, never thick cartoon outlines. Every hero and enemy needs a distinct silhouette. Draw them procedurally in code, with portraits and idle animation.
- **Battle scenes must look like real places, not abstract boards.** Give each fight its own painted location in the same flat-vector style, matched to the story (a downtown street, a harbor pier at sunset, a sewer outfall, an old-town square at night, a neon rooftop, a corporate plaza, a power station). Layer sky, skyline, buildings with windows and signs, props, light glows, and a floor with perspective detail. The floor under the grid must match the location (asphalt, planks, cobblestones, marble, metal grating).
- **Battle grid in perspective, like Fractured But Whole.** Lay the grid on the floor as glowing, translucent tiles with white borders, drawn as a trapezoid (back row narrower than the front). Units and props scale with depth and stand on their tiles. Movement, attack and threat ranges are coloured tile overlays in perspective. HP bars sit above heads. Keep enough backdrop visible above the grid so the location reads.
- A committed palette and consistent lighting across characters, backdrops and UI.
- UI hierarchy rules: the success chance and the Dispatch button are always visible, never scrolled or covered. Typography with real fallback stacks. Responsive for desktop and phone, with mouse, keyboard and touch. Honor `prefers-reduced-motion`.
- Synthesized audio (WebAudio): sound effects plus two music loops, started only after a user gesture, with a mute toggle. Settings for relaxed mode (no timers), animation speed, screenshake.

## Technical constraints
- One self-contained HTML file: inline CSS and JS, no external assets or libraries (Google Fonts with fallbacks is allowed), works offline by opening the file. A short README alongside.
- Save progress with `localStorage`, every access wrapped in try/catch.
- Separate game logic from rendering so the logic can be tested headlessly. Make content data-driven. Use a seeded RNG in tests. Make the battle engine produce events that the renderer plays back.
- No `alert`/`confirm`/`prompt`. Build confirmation into the UI.

## Process
1. **Research first.** Look up how Dispatch's shifts work (stat profiles, success odds, injuries, upgrades, pacing) and how Fractured But Whole combat works (grid, timeline, attack patterns, knockback, ultimates, hazards, telegraphing). Write a one-page design note: what you borrow in spirit, what you change, and the concrete numbers (stat ranges, odds formula, damage, HP, timings).
2. **Vertical slice before breadth.** Build one full shift plus one full fight, play it, and fix what is not fun before adding content.
3. **Tune with automation, not by feel.** Write a bot that plays every shift through the game logic (a competent one and a lazy one) and report grades, odds, injuries, misses and economy per shift. Competent play should be challenged late but succeed. Lazy play should struggle. Adjust pay, XP, call volume and requirements until that holds.
4. **Fuzz the battle engine.** Run random battles that execute every ability on every legal target and assert invariants (no overlapping units, no units out of bounds or on obstacles, HP in range, no exceptions). Also run AI-versus-AI battles for win rates and round counts.
5. **Validate data.** Check that every id, encounter, call and hero kit resolves, and that nothing spawns on top of anything else.
6. **Play it for real.** Drive the actual UI with a headless browser (Playwright): new game, intro, briefing, dispatch, radio check, a full battle, retreat, report, hub, continue. Take screenshots at 1280x720, 1920x1080 and 390x844. Zero console errors. Look at the screenshots and fix what looks wrong.

## Failure modes to hunt for
- Key information hidden under buttons or scrolled out of view on a 720px-tall screen.
- Falsy values (such as `0`) silently not rendering; SVG created in the wrong namespace so rings and lines never show.
- Fights that are over in two rounds, passive enemy AI, tutorial fights that are punishing.
- A late game that never gets harder, or an economy where one strategy buys everything by mid-campaign.
- Heroes or units that can be placed on top of obstacles, soft-locks after retreat or defeat, modals that stack or freeze the clock forever.
- Text that is legible only on the background you tested, tiny tap targets on phones, audio that starts without a user gesture.

## Definition of done
- A new player can finish shift 1 with only the in-game coach.
- Every system above exists, works, and has been exercised by the automated tests and by a scripted UI playthrough.
- The competent bot clears the campaign with real late-game pressure, the lazy bot does not, and neither crashes.
- No console errors on any screen at any tested size.
- You played it yourself at least once end to end and the loop feels good. If a part is boring, rework it.

## Final answer
Report briefly: what you built, how to run it, what you verified and how, and anything you could not verify (for example audio you could not listen to). Do not claim anything you did not test.
