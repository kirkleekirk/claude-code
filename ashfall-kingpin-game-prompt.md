# ASHFALL KINGPIN: Complete Build Prompt

You are an autonomous senior game developer. Build the game below from scratch, end to end, with no questions asked. When something is unspecified, make the call that makes the game more fun or more functional, and record it in `docs/DECISIONS.md`.

**"Finished" means:** no TODOs, no stubs, no placeholder art or text, no dead buttons, no unreachable features. A new player must be able to go from a clean start to the ending credits and then into sandbox mode without hitting a wall, a crash, or a soft-lock.

**Tone and content note:** This is a fictional, stylized post-collapse crime fantasy. All drugs, strains, weapons, factions and places are invented. Every mechanic is an abstract game system. Do not include real-world instructions, real formulas, real brands or real firearm specifications. Violence is pixel-art stylized with no gore.

---

## 1. Pitch and Pillars

**Pitch.** Ten years after the Collapse, only a handful of walled settlements survive. You start with a rusted rail depot, a pouch of seeds, one pistol and a plan. Grow, forge, sell, rob, launder and rule, using the oldest rackets in the book: bootleg, fencing, protection, loans, gambling and the smash-and-grab.

**Pillars**
1. **Dirty money is hot money.** Every dollar is either dirty or clean. Converting one to the other is the central tension of the economy.
2. **You use what you make.** The guns you craft are the guns you fight with, and the guns you sell arm the world. That includes your enemies.
3. **Crime pays if you plan.** Raids are prepared with recon, crew and kit, then executed in real time.
4. **Delegate to scale.** Early on you do everything yourself. Late in the game you run an organization.
5. **Readable at a glance.** One grid, one visual language, one set of layout rules.

**Feature Gate.** Every feature must answer one of two questions: "what interesting decision does this create?" or "what friction does this remove?" Write the answer in `docs/FEATURE_RATIONALE.md`. Cut or merge anything that fails the gate. Every shipped feature must also have a UI, a tooltip, a sound, save/load support, a tutorial hint where relevant, and a sim test.

---

## 2. Tech and Deliverables

- **Stack:** vanilla JS (ES2022), HTML5 Canvas 2D, WebAudio. No runtime dependencies. No external assets. All sprites, tiles, icons, portraits, music and SFX are generated procedurally in code. One embedded bitmap or pixel font, with no font fetches.
- **Source layout:** ES modules in `/src`. `node build.js` (zero npm dependencies) bundles everything into one file, `dist/ashfall-kingpin.html`. It must run offline by double-click and weigh 3 MB or less.
- **Simulation:** fixed 60 Hz update, decoupled from rendering. The sim layer (economy, crew, markets, heat, rivals) must have no DOM dependency so `tools/sim.js` can run it headless. Use a seeded RNG (mulberry32) for the world and economy so runs are reproducible.
- **Saves:** versioned JSON in localStorage with 3 slots plus an autosave at every dawn. Include export and import as a copyable string. Saves must round-trip with no loss.
- **Performance:** 60 FPS at 1080p on a mid-range laptop. Pre-bake terrain into chunk canvases. Use a spatial hash for entities, object pools for bullets and particles, and a cap of about 300 active entities.
- **Input:** keyboard and mouse with full rebinding. Basic gamepad support for action mode is optional.
- **Repo outputs:** `/src`, `build.js`, `tools/sim.js`, `tools/layout-validate.js`, `tools/smoke.js` (headless-browser smoke test), `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/FEATURE_RATIONALE.md`, `README.md` (how to run, controls, tips).

---

## 3. World and Layout Rules

All structures and terrain follow one layout system, so the world reads as one coherent place.

### 3.1 The grid
- Logical tile = 16 px, rendered at an integer scale (auto-pick 2x to 4x to fit the window). Terrain, buildings, props, spawn points, doors and UI snap to integer tile coordinates. Nothing is placed off-grid.
- World = **128 x 128 tiles**, divided into 16 x 16-tile chunks.
- The world is a **hand-authored master plan, identical every new game**. Seeded randomness affects only decoration (grass tufts, debris, cracks, rubble), never structure placement.

### 3.2 One module kit, one grammar
Every structure, whether it belongs to a settlement, a rival, a ruin or you, is composed from the same kit: wall, corner, gate, door, window, roof piece, floor types, fence, stairs, crate stack, barrel, bench, lamp, sign, banner. Each building is a data record:

`{ footprint: [w,h], doorTile, doorFacing, interior, roofStyle, propSlots, materialPalette }`

Doors always face the nearest street. Walls, doors, windows and roofs use the same proportions everywhere, so silhouettes stay consistent. Settlements differ by material palette, banners, props and population, not by geometry.

### 3.3 Settlement template (same rules for all six)
- Perimeter wall with a gate on the main axis.
- A main street runs from the gate to the headquarters or vault at the far end.
- A central plaza holds the market.
- Building lots sit in rows on both sides of the streets, with 1-tile setbacks.
- Watchtowers at the corners.
- Sizes: S (24x20), M (32x26), L (40x32), XL (52x40).
- The **layout validator** runs at build time and in dev boot. It asserts: no overlaps, everything tile-aligned, every lot touches a street, every door is reachable from the gate (A\*), and every vault has at least two approach routes. If it fails, the build fails.

### 3.4 Terrain
- Biomes come from a hand-painted 32x32 biome map, upsampled with seeded noise at the edges: dead farmland (south), ash dunes (east), ruined city (north), flooded marsh and coast (west), rocky badlands (center-east).
- Autotile every edge (blob or 16-neighbor mask) so transitions are always clean.
- Roads are 3 tiles wide with consistent curbs: a ring road, spokes to each settlement, and dirt tracks to camps and ruins.
- Water has shoreline autotiling. Cliffs use a consistent edge tile set.

### 3.4b Master plan (use these anchors; shift at most +/-4 tiles only to satisfy the validator)

| Place | Type | Tile (x,y) | Notes |
|---|---|---|---|
| **The Hollow** | Your HQ (old rail depot) | (64,104) | Walled yard, 6x6 buildable interior grid plus yard, spur line and water tower |
| Millbrook Rest | Settlement S | (28,96) | Farming village. Tutorial target |
| Copper Gate | Settlement M | (104,84) | Mining town. Gun market and fence |
| Harbor Nine | Settlement M | (16,58) | Port. Smuggler hub and bulk buyer |
| Saint Verity | Settlement M | (30,28) | Pious enclave. Hates drugs, rich in clean money |
| The Foundry | Settlement L | (106,38) | Industrial fortress. Armory and best materials |
| New Haven | Settlement XL | (64,18) | Last city. Compact capital and endgame |
| **Crossroads Market** | Neutral black market (no-violence zone) | (64,64) | Mags' stall, blueprints, fixers |
| Rustjaw Fort | Rival camp | (96,112) | |
| The Pale Hand Warehouses | Rival camp | (8,78) | |
| The Ash Choir Cathedral | Rival camp | (80,50) | |
| 8 ruin sites | Scavenge and mini-raid | spread, ring-3 tiers | Loot tiers I to IV |

### 3.5 Visual language (consistent everywhere)
- **View:** 3/4 top-down. Buildings show their south wall face (1 tile tall). Y-sorted rendering. Roofs fade out when the player is inside.
- **Light:** sun from the top-left everywhere. Every sprite has the same drop-shadow offset. Entities get a 1 px dark outline and terrain does not.
- **Palette:** a global palette of 48 colors or fewer, in 4-step ramps per hue. The mood is "dust and dusk": warm browns and rust, desaturated teal shadows. Terrain is low-saturation, interactables are high-contrast.
- **Semantic colors, used consistently in the HUD, world and icons:** dirty money = amber-red, clean money = green, heat = orange to red ramp, enemy = red marker, friendly crew = teal marker, loot glint = yellow.
- **Interactables** show a subtle pulsing outline and a key prompt when in range.
- **Day/night:** tint plus a lightmap (muzzle flash, lanterns, neon signs, fires).
- **Characters** use a layered paperdoll generator (body, outfit, hair, hat, held gun) with 4 directions and idle, walk, shoot, hurt and KO frames. Recruit portraits come from the same generator.

---

## 4. Game Structure

### 4.1 Time
1 game day = 6 real minutes at 1x (1 game hour = 15 s). Speeds are pause, 1x, 2x and 4x. Opening a management menu pauses time by default (a setting toggles this). Action mode is real time. The day cycle matters:
- Night gives stealth bonuses and different patrols.
- Markets open and close.
- Rent, wages and tribute are due at dawn.

### 4.2 Ranks (gated by REP)

| Rank | REP | Unlocks |
|---|---|---|
| Scavenger | 0 | The Hollow, 4 grow plots, Bench I, street sales in Millbrook, Ruin I |
| Hustler | 100 | First hire, first front business, Copper Gate, Bench II, strain crossbreeding |
| Supplier | 400 | Managers, Harbor Nine, bulk smuggling, rackets (protection and loans), Vehicle I |
| Boss | 1,200 | 4-person squad, Saint Verity, Foundry raids, rival diplomacy, casino, Bench IV, Hollow expansion |
| Warlord | 3,000 | Occupy settlements, convoy ambushes, Vehicle III, Compact crackdowns begin |
| Kingpin | 7,000 | New Haven endgame questline |

### 4.3 Two endings
- **The Crown (military):** hold at least 3 settlements, repel Operation Daybreak (a multi-wave siege of the Hollow), then assault New Haven's Council Hall.
- **The Ledger (political):** hold at least 3 settlements, own at least $2,000,000 in clean assets, and buy enough council seats with clean money and favors to legalize your empire.

After the credits, sandbox mode continues with all systems live.

### 4.4 No dead ends
- If the player is broke with no assets, Mags offers a loan ($200 at 20%).
- Dying or being captured is a setback, not a game over: lose 15% of carried cash and the loadout used, and respawn at the Hollow. Capture also offers bail, jailbreak or a crew rescue.
- **Ironman** difficulty makes death permanent.
- Difficulties are Easy, Normal, Hard and Ironman.

### 4.5 First 15 minutes (scripted tutorial, skippable, every step is a real game action)
1. Wake in the Hollow. Plant and water seeds. Mags, a mentor NPC, introduces herself and the two-wallet idea.
2. First job: scavenge parts from Ruin I. This teaches movement, aiming and a short feral-dog fight with the starting pistol.
3. Guided craft at the bench: your first gun.
4. Harvest, dry, cure and pack. Make your first street sales in Millbrook and see price and saturation in action.
5. Heat tutorial: a witness spots you and you learn to lay low.
6. Hire your first worker (Mags' nephew) and assign him to the plots.
7. First robbery: Millbrook's grain depot, as a stealth tutorial that also allows loud.
8. Buy a Canteen as your first front and launder your first $200.
9. The Ledger fully unlocks. The "What should I do next?" tracker takes over.

---

## 5. Systems

### 5.1 Money, heat and storage
- **Wallets:** Dirty Cash, Clean Cash, plus commodity inventory.
- Cash physically lives in your **Stash** at the Hollow (upgradable with safes). Raiders can steal from it. Clean money lives in **accounts at your fronts**, which are safe from theft but frozen during audits.
- Crime pays dirty. Dirty money can buy most things on the black market but cannot buy legit properties, permits, council seats or Compact goodwill.
- **Heat** is tracked per settlement and as a global Notoriety value (0 to 100).

| Heat | Level | Consequence |
|---|---|---|
| 0-19 | Quiet | Nothing |
| 20-39 | Watched | Extra patrols near your activity |
| 40-59 | Hunted | Fronts get inspected, informants appear |
| 60-79 | Wanted | Bounty hunters and Hollow raids |
| 80+ | Crackdown | Warden strike teams and asset freezes |

- **Heat sources:** street sale unit +0.2 (scaled by visibility), shots fired in witnessed range +1, guard killed +8, civilian witness +5, vault robbery +25, discovered production site +10, a snitching worker up to +15. Heat decays about 4 per day at baseline.
- **Heat sinks:** Lay Low, bribes (dirty), tribute (clean), Scapegoat (frame a rival), a Fixer perk, and killing witnesses (costs crew loyalty and rep).

### 5.2 Weed operation (grow, cure, pack, sell)
- **Facilities:** Grow Plots. Outdoor plots are cheap but visible and raidable. Indoor rooms need Power (generators that use fuel) and Water.
- **Six strains** (fictional): Dust Devil (fast, low yield), Ashleaf (balanced), Rail Rose (high potency, slow), Glowvine (grows well at night), Marrow Kush (high yield), Widow's Veil (legendary, quest reward). Stats: Grow Time, Yield, Potency, Hardiness, Smell (adds heat).
- **Crossbreeding** two strains produces a hybrid with blended stats and a mutation chance. Discoveries are logged in a Strain Codex.
- **Lifecycle:** Seed, Sprout, Veg, Flower, Harvest. Plots need Water, Light and Nutrients (compost from scrap). Neglect makes plants wilt. Events can cause blight or pests.
- **Post-harvest:** Dry rack (time), Cure (time, quality x1.0 to x1.4 based on the curer's skill), then Pack as Baggie, Jar or Brick.
- **Quality tiers:** Schwag, Mid, Prime, Legendary.
- **Selling channels:**
  - **Street dealers** (hired workers) sell at settlement markets.
  - **Bulk smugglers** (Harbor Nine and Crossroads) pay -30% but add no heat.
  - **Named regulars** have preferences and give loyalty bonuses.
- **Price formula:**
  `price = base x qualityMult x (1 - 0.6 x saturation) x (1 + eventMod) x (1 + 0.03 x dealerHustle)`
  Saturation rises by `0.5 x units / dailyDemand` per sale and decays 0.12 per day. Overselling visibly tanks prices, and the Markets overlay shows it.

### 5.3 Gun crafting (modular parts, blueprints, tiers)
*This system is authoritative. It is intended to feel like a deep, satisfying part-by-part gun-builder with a production chain.*

**Materials:** Scrap, Iron Ingot, Steel Ingot, Timber, Spring Coil, Brass, Propellant, Polymer, Alloy (rare). Sources: scavenging ruins, markets, salvaging broken guns, raid loot.

**Chain**
1. **Smelter:** Scrap to Iron or Steel (uses fuel).
2. **Parts Lathe:** Ingots and Timber to **five component types**:
   - Barrel (range, accuracy)
   - Frame (durability)
   - Action (fire rate, reliability)
   - Stock/Grip (recoil, handling)
   - Magazine (capacity, reload speed)
3. **Ammo Press:** Brass + Propellant + Scrap to five ammo types: Light, Medium, Heavy, Shell, Bolt, plus special variants (AP, Incendiary).
4. **Assembly Bench:** combine one of each component with up to **5 mod slots** (Muzzle, Optic, Underbarrel, Mag, Stock) to produce a gun.
5. **Bench tiers I to IV** gate which blueprints and component materials you can use.

**Rules**
- **Blueprints** are unlocked by rank, by loot, by buying at Crossroads, or by Studying (disassembling) an enemy gun.
- Components have **materials** (Scrap x0.8, Iron x1.0, Steel x1.2, Alloy x1.4) and **stars** (1 to 5, which add +/-8% each around 3).
- Final stat = `blueprintBase x (product of the relevant component multipliers) x modMultipliers`.
- Final **Grade** (Junk, Common, Fine, Masterwork, Legendary) comes from average stars plus a gunsmith skill roll.
- A low-skill crafter risks an *Unreliable* tag (random jams). A high-skill crafter has a chance of a Masterwork.
- Guns have durability and need repair or maintenance.
- Craft time is `base x (1 - 0.05 x crafterSkill)`.
- Workers run benches from a queue ("make 5 x Rattler SMG, Fine or better"). Standing orders keep stock topped up.

**Starter blueprint set (tune freely):**

| # | Blueprint | Family | Ammo | Dmg | RPM | Acc | Range | Mag | Noise | Bench |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Pipe Pistol | Sidearm | Light | 12 | 180 | 60 | 10 | 8 | Med | I |
| 2 | Rebar Revolver | Sidearm | Medium | 26 | 120 | 72 | 14 | 6 | High | I |
| 3 | Sawn-Off Scatter | Shotgun | Shell | 8x8 | 70 | 35 | 6 | 2 | V.High | I |
| 4 | Rustler's Lever | Rifle | Medium | 34 | 75 | 82 | 22 | 8 | High | II |
| 5 | Rattler SMG | SMG | Light | 9 | 600 | 45 | 9 | 30 | High | II |
| 6 | Pump Gutter | Shotgun | Shell | 7x9 | 60 | 45 | 8 | 6 | V.High | II |
| 7 | Whisper Crossbow | Silent | Bolt | 40 | 50 | 85 | 20 | 1 | None | II |
| 8 | Marksman's Needle | Rifle | Heavy | 70 | 40 | 95 | 34 | 5 | V.High | III |
| 9 | Ironclad Carbine | Rifle | Medium | 22 | 360 | 70 | 17 | 25 | High | III |
| 10 | Quiet Hand | SMG | Light | 11 | 420 | 62 | 11 | 20 | Low | III |
| 11 | Hailstorm LMG | Heavy | Heavy | 20 | 540 | 50 | 20 | 80 | V.High | IV |
| 12 | Warden-Breaker | Heavy | Heavy | 120 | 25 | 90 | 30 | 3 | Extreme | IV |

**Mods (14):** Iron Sights, Scope, Suppressor, Extended Mag, Drum Mag, Foregrip, Recoil Spring, Polished Action, Muzzle Brake, Choke, Stock Wrap, Bayonet Lug, Laser Dot, Flash Hider.

**Throwables and gadgets:** Molotov, Pipe Bomb, Caltrops, Smoke Pot, Lockpick Set, Bolt Cutters.

**Selling guns**
- `value = blueprintBase x gradeMult x condition x settlementDemand x factionWarMod`
- **Arms-dealing consequences:** guns you sell show up in that faction's hands. Their units get stronger in proportion to your sales. Selling heavily to the Compact makes your raids harder. Selling to rivals makes them dangerous. Selling to nobody leaves money on the table.
- The Pawn Shop and fences buy looted goods at a discount.

### 5.4 Action mode (raids, ambushes, defense)
- **Controls:** WASD move, mouse aim, LMB fire, R reload, Q swap, Shift sprint, C sneak, Space dodge-roll, G throwable, E interact, F squad commands.
- **Guns behave by stat:** spread and recoil from accuracy and handling, falloff by range, ammo types, reloads, jams, noise propagation (shots alert guards within a radius, and suppressors shrink it), bullets blocked by cover, silent takedowns from behind.
- **Interaction minigames:** lockpicking and safecracking (timing-based, with skill widening the window). Bolt cutters, tripwires and alarm panels offer stealth options.
- **Loot:** carry weight limits what you can take. Vehicle upgrades raise capacity. Escape to an extraction point under pursuit.
- **Enemy archetypes (10):** Militia Guard, Watchtower Sniper, Shield Heavy, Guard Dog, Medic, Captain, Warden Elite, Raider Brute, Cultist Zealot, Bounty Hunter. AI is a finite state machine with vision cones, hearing, alert levels (Calm, Suspicious, Hunting), squad calls for reinforcements, flanking and retreat at low HP.
- **Squad:** up to 4 hired gunmen as AI teammates with orders (Follow, Hold, Breach, Focus Target). They equip guns from your inventory. They level up. Deaths are permanent and hit crew morale.
- **Raid planning** at a Job Board per target:
  - *Approach:* Stealth, Assault, Inside Man (bribe), or Convoy Ambush.
  - *Recon:* hire Lookouts to reveal guard counts, patrol times and vault location (more intel means fewer surprises).
  - *Loadout, crew and getaway vehicle.*
  - *Timing:* day or night.
- **Aftermath** of a robbery:
  - Settlement enters **Alarmed**: extra guards and upgrades for N days.
  - Loot respawns as the settlement recovers.
  - Repeated hits make a settlement **Devastated**, which cuts its market output and costs you a customer base.
  - **Occupy:** garrison the settlement to convert it into a protection racket with weekly tribute proportional to its wealth. Rivals and the Compact will contest it.
- **Hollow defense:** the Compact and rivals launch real-time raids on your base. Defenses are walls, turrets, traps and crew posts, and losing means stash theft. Each defense is a short, tense 2 to 4 minute scenario.

### 5.5 Crew and hiring
- **Roster** up to 40. Each recruit has a procedural portrait, name, background, 9 skills (0-10): Farming, Crafting, Salvage, Hustle, Gunplay, Stealth, Driving, Bookkeeping, Leadership. They also have 2 traits (for example Green Thumb, Sticky Fingers, Loose Lips, Veteran, Steady Hands, Coward, Born Leader), a wage, Loyalty (0-100), Morale and Fatigue.
- **Recruiting:** taverns, word of mouth, rescuing prisoners, poaching from rivals. **Vetting** costs money and reveals hidden traits. Unvetted hires can hide a bad trait.
- **Assignment:** to stations, businesses or squads. "Auto-assign" picks sensible defaults and "Priority rules" lets you tune them.
- **Managers:** promote a worker to Manager of a business or district. They restock, rehire and schedule on their own at an efficiency set by Leadership. This is how late-game stays playable.
- **Wages** are paid every dawn. Putting a worker "on the books" at a front reduces laundering risk but costs clean money.
- **Loyalty events:** cards with choices and consequences (raises, favors, discipline, bailing someone out). Low loyalty leads to skimming or snitching, and snitches leak your operations to the Compact or rivals.
- **Training:** practice improves skills. A Training Room and mentor traits speed it up.

### 5.6 Businesses and laundering

| Business | Special mechanic |
|---|---|
| Canteen | Reliable low-risk laundering. Good first front |
| Bathhouse | High foot traffic, informant intel |
| Garage | Vehicle upgrades and repairs, hides cargo |
| Pawn Shop | Fences looted goods |
| Brewery (bootleg) | Moonshine as a third product line, high margin, big heat |
| Fight Pit | Gambling income, spectators boost REP |
| Radio Station | Sways settlement attitudes and heat |
| Clinic | Heals injured crew faster, buys silence |
| Water Co. | Slow, steady, very low audit risk |
| Trading Post | Extra market and bulk-sale outlet |
| Casino | Late game, massive laundering capacity and risk |

- **Rackets** (old-school side income): *Protection* (weekly tribute from small businesses), *Loan Sharking* (lend clean cash at interest, enforce with crew), *Gambling* and *Fencing*.
- **Laundering mechanic:** each business has a legit revenue per day (size x upgrades x foot traffic x staff). You can push dirty money through it up to `0.8 x legitRevenue x (1 + 0.1 x accountantSkill)` per day. The **wash** takes 1 to 3 days, and washing money is visible in the Ledger. The fee is 25% minus 2% per Bookkeeping point, floor 8%.
- **Audit Risk** climbs when you exceed capacity: `+ (excess / legitRevenue) x 15% per day`. A triggered **audit** causes a fine, an account freeze, heat and possible seizure. Hire accountants, bribe auditors or buy a "Clean Books" upgrade to mitigate.
- **Clean money buys:** legit properties and upgrades, permits, tribute (reduces heat and buys goodwill), higher-tier crew, and the political ending.
- Fronts can include a **Hidden Back Room** upgrade that acts as an extra storage, grow or distribution point.

### 5.7 Law, rivals and politics
- **The Compact** is the alliance of settlements. Its law arm is the **Wardens**. Escalation follows the heat table above. The Compact also has a **Goodwill** meter (raised with clean tribute, lowered by crime) that sets how hard Wardens come at you.
- **Three rival gangs**, each with its own simple economy and AI that decides daily whether to expand, raid your convoys or hideout, undercut your prices, poach your workers, or negotiate:
  - **Rustjaw Raiders** (aggressive, hungry for guns), leader Big Tooth Marlo.
  - **The Pale Hand** (smugglers, price wars, poachers), leader Iris Vane.
  - **The Ash Choir** (cult, sabotage and blight, recruits by sermon), leader Sister Cinder.
- **Diplomacy:** truce, tribute, alliance, war. You can attack their camps (action missions), sabotage their operations, or sell them guns.
- **Bosses:** each rival leader and the Compact's Chancellor Orrin Hale is a multi-phase boss encounter.

### 5.8 Progression
- **Perks:** 3 trees, 8 perks each (24 total): *Operator* (economy), *Gunman* (combat), *Fixer* (stealth and social). One point per level.
- **Hollow upgrades:** power, security, storage, workshop tiers, secret tunnel, bunks, Training Room.
- **Vehicles:** Handcart, Dune Buggy, Armored Hauler. They provide speed, carry capacity and getaway options.
- **30 achievements**, difficulty modes, post-game sandbox, and a Stats page.

### 5.9 Events and flavor
- At least **60 event cards** with 2 to 3 choices each. They are weighted by game state (for example drought, blight, informant, rival ambush, caravan tip, wedding party worth robbing, a Warden sweep).
- **Radio and "The Ash Courier"** (daily broadsheet): market news, rumors and humorous flavor that also hint at opportunities.
- **Tip-offs** generate contracts: convoy routes, vault schedules, rival weaknesses. At least 40 contract templates.

---

## 6. UI/UX

- **HUD:** top bar with Dirty $, Clean $, Heat meter, REP/Rank progress, date/time/speed and alerts. Bottom hotbar for weapons and throwables. Minimap with fog of war and toggleable overlays (Turf, Heat, Prices). Context prompts ("E: Interact"). Notification log.
- **The Ledger** (Tab) is a full-screen tabbed management overlay: Overview (dirty/clean income graph), Crew, Production (grow and workshop), Inventory, Map and Markets, Businesses, Rivals and Heat, Jobs, Perks, Journal. Lists are sortable and filterable. **Tooltips show the math** (for example the price breakdown) so players learn the systems. Destructive actions require confirmation.
- **Guidance:** smart objective tracker, in-context first-time hints, glossary.
- **Accessibility:** UI scale 80% to 150%, colorblind-safe icons and modes, reduced shake and flash option, subtitles for audio cues, full rebinding, pause on blur.
- **Juice:** number tweening, coin particles, "ka-ching" on sales, 40 ms hit-stop, muzzle-flash lighting, shell casings, screen shake (with a toggle), animated transitions between screens.

---

## 7. Audio

All audio is WebAudio synthesis. Adaptive layered music (calm, hustle, raid, chase) from a generative sequencer in a dusty minor-pentatonic, western-noir style. Each gun family has a distinct synthesized report. Add UI sounds and ambience (wind, night insects, distant machinery). Volume sliders for Master, Music and SFX. Mute on blur.

---

## 8. Balance Targets

- **Start:** $250 dirty, $0 clean, 5 Dust Devil seeds, one Pipe Pistol ("Old Faithful") with 12 rounds, the Hollow with 4 plots and 1 Bench I.
- **Weed base prices** (tune): Baggie $12, Jar $45, Brick $300, scaled by quality multipliers (0.6, 1.0, 1.5, 2.4).
- **Target time to rank on Normal** (first playthrough):

| Rank | Target time |
|---|---|
| Hustler | 25 to 40 min |
| Supplier | about 1.5 h |
| Boss | 2.5 to 3 h |
| Warlord | about 4 h |
| Kingpin | 5 to 6 h |

- **Balance sim:** `tools/sim.js` runs the headless sim with a greedy bot for 60 game days and reports time-to-rank, money curves and bottlenecks. Assert the ranges above, tune until they pass, and write the output to `docs/BALANCE_REPORT.md`.
- **Safety nets:** Compact response scales with heat, not wealth. Rivals scale with your rank. Never let a single mistake create an unrecoverable state.

---

## 9. Content Counts (minimums)

6 settlements, 3 rival camps, 8 ruin sites, 6 strains plus hybrids, 12 gun blueprints with 4 material tiers, 14 mods, 5 ammo types, 11 business types, 10 enemy archetypes, 3 rival bosses plus the final boss, 60 events, 40 contract templates, 30 achievements, 24 perks, 3 vehicles.

---

## 10. Build Process

Work in phases. After each phase, **run the game in a headless browser** (Playwright/Chromium if available), confirm zero console errors, **take screenshots and inspect them** for alignment, readability and consistency with section 3, then fix problems before moving on.

0. **Plan:** write `docs/DESIGN.md`, data schemas and the layout master plan.
1. **Foundation:** game loop, renderer, input, audio, save system, UI kit, procedural art pipeline, tile/layout system and validator. The whole world renders with all settlements.
2. **Simulation:** time, economy, markets, inventory, crew. Fully headless-capable.
3. **Production:** grow chain, gun chain, and building in the Hollow.
4. **Action mode:** player, guns, AI, raids, defense.
5. **Meta:** heat, rivals, events, laundering, hiring, perks, endings.
6. **Content fill and balance** via the sim.
7. **Polish:** juice, audio, tutorial, accessibility.
8. **QA:** automated and scripted playthrough, then fix everything found. Produce the final build.

---

## 11. Definition of Done (all must pass)

- [ ] `node build.js` produces a working single-file build. Zero console errors during a 30-minute scripted session.
- [ ] Layout validator passes: tile-aligned, no overlaps, all doors reachable, all lots on streets.
- [ ] Headless sim runs 1,000 game days with no NaN, no negative inventory, no infinite loops.
- [ ] Save/load round-trip is exact in all 3 slots plus autosave.
- [ ] A scripted bot completes the tutorial and reaches Hustler. A longer sim reaches Kingpin in the target time window.
- [ ] A UI crawl clicks every button and tab with no errors and no dead ends.
- [ ] Both endings are reachable and verified, and sandbox continues afterward.
- [ ] Every item in section 9 exists, is reachable in normal play, and has art, sound and tooltip.
- [ ] 60 FPS in the late-game worst case (large raid at night with lighting).
- [ ] Screenshot review confirms the grid, light direction, palette and layout rules are respected across all settlements, the Hollow and the rival camps.
- [ ] A final **fun audit:** play each system for 5 minutes, list friction, fix it, and remove or merge any feature that fails the Feature Gate.

---

## 12. Rules for You

- No placeholders, no TODOs, no "coming soon". If you cannot finish a feature, cut it cleanly and record why in `docs/DECISIONS.md`.
- Do not ask questions. Decide, document and keep moving.
- Data-driven: strains, blueprints, businesses, events, enemies and contracts live in data tables, not scattered through code.
- Deterministic and testable: simulation code stays pure and separate from rendering.
- Keep functions short and modules focused. Comment only the non-obvious.
- **Final report** (short): how to run, controls, key design decisions, what the balance sim reports, and anything intentionally cut.
