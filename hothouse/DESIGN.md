# HOTHOUSE — Game Design

> Source of truth for *what the game is*. Rendering lives in `ART_BIBLE.md`, code structure in
> `ARCHITECTURE.md`, interface in `UI_SPEC.md`, numbers in `BALANCE.md`, history in `PROGRESS.md`.

## 0. Assumptions and decisions log

Decisions made where the brief was open. Each one was chosen for polish first, then ambition.

| # | Decision | Why |
|---|---|---|
| A1 | The game lives in `hothouse/` inside the host repository; it is fully self-contained. | The host repo is unrelated; nothing outside this folder is touched. |
| A2 | Stack is TypeScript 7 strict, Vite 8, Three.js r187 (WebGL2), pmndrs `postprocessing`, `n8ao`, Rapier 0.21, Preact 11 + signals. | Latest stable of the brief's strong defaults; verified building and rendering in headless Chromium. |
| A3 | Plants are **fictional botanicals** ("Ofelia's hybrids"). Street name for the dried flower is **Bloom**. Refined tiers are **Dew** (Tier 2) and **Halos** (Tier 3). All effects are comedic and invented. | §20: nothing real, nothing instructional. |
| A4 | Growth and crew work run on **sim-seconds** (real seconds of play), not on the art-directed clock. | The clock dwells in golden hour; plants must not grow slower because the sky is pretty. |
| A5 | The whole static city is generated **at boot** (time-sliced, with real progress) and kept on the GPU; "streaming" is distance-based LOD and visibility per chunk. | Zero geometry creation during play removes the largest source of frame spikes. The city is compact enough to fit the memory budget. |
| A6 | Color grading is **analytic in the final shader** (parametric grade keyed by time of day and weather) rather than baked 3D LUT textures. | Identical math to a generated LUT, infinitely smooth blending, no banding, no texture regeneration hitches. |
| A7 | Wet-road, water and paint reflections use **one planar reflection** at ground level (quality-tiered), not screen-space reflections. | The city is flat; planar is stable, shimmer-free and gives the mirror-neon money shot. |
| A8 | Mixing uses **per-rule knowledge**: once a rule is seen, every future preview that involves it is exact. Unknown interactions show "?". | Removes blind trial-and-error; discovery is cumulative. |
| A9 | **Fusion** is the signature mixing twist: when a transform would create an effect the product already has, the pair fuses into that family's rare *Apex* effect. | Gives genuine "aha" moments and a mechanic that is this game's own. |
| A10 | Inventory is a **Go-Bag** (carried) and a **Stash** (per property), counts only. One press packs the bag for today's orders. | No carry weight, no Tetris; busts take from the bag, raids from the stash. |
| A11 | Dialogue uses **procedurally illustrated portraits** generated from the same appearance seed as the 3D character. | Expressive cards at any resolution with no external art. |
| A12 | The prologue **pins the clock** to golden hour until the scripted dusk at ~8:00. | The brief's first ten minutes need dusk on cue. |
| A13 | Sidewalk curbs are real colliders (low, beveled). | Wheels thump over them and feet step up; nothing floats or clips. |
| A14 | Saves and settings are in `localStorage` (atomic write with backup); the photo gallery is in IndexedDB. | Synchronous small saves are simplest to make atomic; photos need blob storage. |
| A15 | Combat ships as a tight, optional layer and is the first Tier-1/2 system to be trimmed if polish demands it; avoidance is always viable. | Brief: "crisp, readable, not the star". |

## 1. The game in one page

You inherit **Ofelia's Plants & Bait** and a notebook of strange hybrids. You grow them, mix them
into products nobody else can copy, put your name on the bag, sell to people who become characters
in your life, and reinvest until the coast is yours.

```
          ┌───────────────── REINVEST ─────────────────┐
          ▼                                            │
  GROW ──► MIX & DISCOVER ──► BRAND ──► DEAL ──► cash + rep + XP
  (Hothouse)  (Ofelia's Notebook)  (your logo)  (people, haggle, driving)
          ▲                                            │
          └── EXPAND (property, crew, turf) ◄── DEFEND (heat, raids, rivals)
```

- **Micro (10–60 s):** tend a row, snip a harvest, shake a mix, read a haggle, hold a drift.
- **Meso (3–8 min):** plant → harvest → mix → drive → deal, with one real decision at each step.
- **Macro (30–60 min):** a new property, a hire, a turf, a product tier, a story beat.

## 2. Halcyon Bay

World units are metres. **+X is east, −Z is north.** The sun sets due west over the water, so every
west-bound road is a sunset drive. Land is roughly 2 km × 2 km; the generated area is 2.8 km square
including water. The city is identical every playthrough (world seed `0x48414C43`).

```
 N ▲           x=-1300      -700        -200   0    400        1000
 z=-1100  ┌─────────────────────────────────────────────────────────┐
          │  gulf      ░░░░░░░           ▓▓▓▓ COBALT HARBOR ▓▓▓▓▓▓▓│
          │          ░░ ISLA ░░   bay    ▓ quay · cranes · market ▓│
 z=-450   │          ░ DORADA ░═══ THE CAUSEWAY ═══▓ CROWN POINT ▓▓│
          │           ░░░░░░░            ▓▓ towers · bank · arena ▓│
          │  gulf        ▒▒ NEON ▒▒ ▓▓ DECO ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
 z=0      │  pier═══◉════▒ STRAND ▒ ▓▓ ROW ▓▓▓  PALMETTO FLATS  ▓▓▓│
          │  (Ferris)    ▒▒▒▒▒▒▒▒▒ ▓▓▓▓▓▓▓▓▓▓  suburbs · gator golf ▓│
 z=450    │   ·keys·  ══inlet bridge══  ─── Sawgrass Trail ─── ⌂ Ofelia's
          │  ·  · ◎     ≈≈≈≈≈≈≈ THE SAWGRASS ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈│
 z=1100   └──lighthouse──────────────────────────────────────────────┘
```

| District | Where | Feel | Role |
|---|---|---|---|
| **Palmetto Flats** | east / south-east | pastel bungalows, cul-de-sacs, pools, strip malls | start area, loyal regulars, low heat |
| **Neon Strand** | west-facing beach | boardwalk, pier with Ferris wheel, skate park, surf shops | tourists, golden hour and night, heavy night policing |
| **Deco Row** | behind the Strand | pastel Deco hotels, chrome diner, rooftop pools | wealthy customers, moderate heat |
| **Crown Point** | north-east core | glass towers, LED billboards, bank, courthouse, arena | launderers, lawyers, cops, heaviest traffic |
| **Cobalt Harbor** | north waterfront | cranes, container stacks, warehouses, fish market | suppliers, wholesale, Vale's turf |
| **The Sawgrass** | south | mangrove channels, stilt shacks, airboat huts, boardwalk tracks | hidden grow op, Mudflaps, wildlife |
| **Isla Dorada** | island, north-west | mansions, marina, yacht club | VIPs; causeway or boat |
| **Saltwater Keys** | south-west islets | bait shacks, low bridges, the lighthouse | smuggling runs (Tier 2) |

**Arterials.** Bayshore Drive (coast, N–S) · Flamingo Avenue (Deco Row spine) · Halcyon Boulevard
(E–W main street, pier to the eastern beltway) · The Causeway → Crown Avenue (E–W, north) ·
Quay Street and Harbor Road · Palmetto Parkway (N–S, centre) · Route 9 (eastern beltway, 3 lanes) ·
Sawgrass Trail (swamp edge, passes Ofelia's) · Keys Road (low bridges to the lighthouse).

**Landmarks visible from afar.** Ferris wheel on the pier · lighthouse · the giant fiberglass gator
at *Gator Golf* · the pink-neon flamingo of the *Flamingo Court* motel · the Causeway's arched span ·
Crown Tower's animated billboard · lit harbor cranes · the *Starlite* drive-in screen.

**Named places (each is a POI id used by missions, customers and the map).**

| Place | District | Use |
|---|---|---|
| Ofelia's Plants & Bait | Palmetto Flats (south edge) | property 1: shop, back room, greenhouse |
| Sod Almighty Garden & Feed | Palmetto Flats | seeds, soil, equipment (interior) |
| Mama Yoli's Bodega | Palmetto Flats | additives (interior) |
| The Lot (dead-mall car park) | Flats → Strand route | first drift, car meets |
| Gator Golf | Palmetto Flats | landmark, side activity |
| Skate Park and Boardwalk | Neon Strand | Kiki, busker deals, crowds |
| Pier 9 and the Ferris wheel | Neon Strand | night deals, fireworks |
| The Chrome Pelican (diner) | Deco Row | meetings (interior) |
| Flamingo Court Motel | Deco Row | motel room interior, dead drops |
| Drip Tide (clothing) | Deco Row | outfits (interior) |
| Pinkerton Law | Crown Point | Sy; busted respawn (interior) |
| Crown Tower | Crown Point | billboard, helipad |
| Casa Vale | Cobalt Harbor | Don Vale's restaurant (interior) |
| Dex's Wrench & Wax | Cobalt Harbor edge | car shop (interior) |
| The Leaky Tiki | Neon Strand | bar interior; purchasable front |
| Starlite Drive-In | Palmetto Flats east | events, getaway set-piece |
| Airboat Annie's | The Sawgrass | airboat access |

**Properties.** Ofelia's (start) · Palmetto garage · Harbor warehouse · Sawgrass stilt-house ·
Isla Dorada penthouse. **Fronts.** Sudsy Flamingo car wash · Taco Tsunami truck · The Leaky Tiki ·
(later) Club Aftersun.

## 3. Time and weather

- A day is **16 real minutes**. The clock is art-directed: it dwells where the game is prettiest.

| Window | Clock | Real time | Tie-in |
|---|---|---|---|
| Dawn | 05:45–07:30 | 75 s | early-bird customers, empty roads, swamp mist |
| Morning | 07:30–11:00 | 120 s | commuters, deliveries arrive |
| Midday | 11:00–15:00 | 90 s | plants thirstier; heat-wave events |
| **Golden hour** | 15:00–19:00 | **270 s** | boardwalk crowds; +tips on the Strand |
| Dusk | 19:00–20:30 | 105 s | neon ignites; night economy opens |
| Night | 20:30–05:45 | 300 s | best prices, most police, rivals roam |

- **Weather:** Clear · Hazy · Overcast · Rain · Thunderstorm · (finale) Hurricane. Rain wets roads
  (grip −18 %, reflections up), thins crowds, and raises delivery tips. Weather is forecast in the phone.
- **Time controls:** *Wait until…* and *Sleep* at any owned property skip time; the empire is
  simulated during the skip and summarized in a **Shift Report**. Nothing ever forces a wait.

## 4. The Hothouse (growing)

- A **grow room** holds planters in rows. Ofelia's greenhouse starts with 6 (one already ripe).
- Plant state: strain · 5 visible stages (seedling, sprout, leafy, budding, ripe) · water · vigor ·
  quality. Plants sway, perk up when watered and droop when dry.
- **Decisions per cycle:** which strain · feed profile (*Speed* −25 % time / *Yield* +2 units /
  *Quality* +1 star) · room light level (Low / Standard / Blaze: quality vs **Visibility**) ·
  when to harvest (a **peak window** gives a bonus; overripe slowly loses quality).
- **Tend Sweep.** Hold Interact and walk the row: the character waters, feeds and prunes each plant
  in passing; need icons pop. A room takes about ten seconds. Water comes from the room's feed
  station, so there is no refilling. Drip irrigation (first upgrade) removes watering altogether.
- **Harvest: the snip chain.** Three to five snip points appear along the plant on a beat; hit them
  for Perfect / Good / OK. A streak carries across plants. *Hold* to auto-harvest at Good; crew
  harvest at Good−. Easy-timing and auto-success are in Settings.
- **Timing.** The pre-grown plant is harvested inside the first minute. First full cycle 180 s;
  with upgrades 60–90 s.
- **Breeding Cabinet (Rank 5).** Cross two strains → three seedling cards with previews (yield,
  speed, hardiness, bag appeal, affinity), rare mutations, naming. The **Strain Dex** tracks it.

**The twelve base strains** (genes tuned in `BALANCE.md`):
Abuela's Blush (Sunkissed, starter) · Gatorgrass Gold (Mellow Tide, hardy) · Neon Nana (Disco Feet,
high appeal) · Swamp Halo (Dreamy) · Causeway Coral (Chatty) · Midnight Mango (Night Owl) ·
Lighthouse Lime (Laser Focus) · Pelican Punch (Bold) · Hurricane Hibiscus (Electric, fragile) ·
Velvet Manatee (Couch Gravity, high yield) · Flamingo Fever (Giggles) · Ghost Orchid 9 (Third Eye,
slow, premium).

## 5. Ofelia's Notebook (mixing and discovery)

**Effects** — 16 base in four families, 4 Apex, 2 duds. Every effect has an icon, color, one-liner,
value and tags that customers react to.

| Family | Base effects | Apex (fusion only) |
|---|---|---|
| **Social** | Chatty · Giggles · Bold · Disco Feet | **Main Character** |
| **Body** | Sunkissed · Mellow Tide · Couch Gravity · Electric | **Golden Hour** |
| **Mind** | Laser Focus · Dreamy · Night Owl · Nostalgic | **Galaxy Brain** |
| **Weird** | Third Eye · Shimmer · Slow-Mo · Glowtongue | **Mermaid Mode** |
| Duds | Heebie-Jeebies · Swamp Funk | — |

**Additives** — 14 kitchen-and-kitsch ingredients in six *flavors*. Each adds one effect and
transforms some existing ones. Flavors behave consistently, so rules can be reasoned about:

| Flavor | Additives | Tendency |
|---|---|---|
| Citrus | Key Lime Zest · Blood Orange Fizz | sharpens: Body → Mind |
| Sweet | Guava Paste · Orange-Blossom Honey · Saltwater Taffy | softens: anything → mellow or giggly |
| Spicy | Gator Tears Hot Sauce · Pink Peppercorn | energizes: mellow → loud |
| Buzz | Cafecito Shot · Volt! Powder | wakes: sleepy → focused or wired |
| Briny | Pickle Brine · Sea Salt Flakes | grounds: cancels duds, calms extremes |
| Glow | Moon Jelly · Firefly Sugar · Mystery Bait | weirds: pushes into the Weird family (Mystery Bait risks Swamp Funk) |

**The mixing algorithm** (deterministic; ≥ 60 rules in `content/mixRules.ts`):

1. Every effect on the product is checked against the additive's transform table, simultaneously.
2. If a transform lands on an effect the product already has, the two **fuse** into that family's
   Apex effect (once per mix). This is the route to Main Character, Golden Hour, Galaxy Brain and
   Mermaid Mode.
3. If there is room (cap 3 → 4 → 5 with station upgrades), the additive's own effect is added.
4. **Harmonies** — named effect sets such as *Boardwalk Special* (Giggles + Disco Feet + Sunkissed)
   — multiply value and earn a Notebook sticker.

**Why it stays fun.** Known rules preview exactly; unknown interactions show "?". Each new product
becomes a hand-drawn Notebook page (doodle, Ofelia's margin note, stars, sticker) and pays XP, cash
and rep. Favorites and *Cook again* repeat a recipe in one input; saved recipes are what crew
replicate. Jobs queue and finish while you do something else.

**Value.** `strain base × quality × (1 + Σ effect values) × harmony × brand hype`; duds subtract.

**Tiers.** Tier 1 **Bloom** (workbench) → Tier 2 **Dew** (Cold Still, Rank 4: three Bloom condense
into one Dew, 4.5× value, +potency) → Tier 3 **Halos** (Sun Press, Rank 6: one Dew presses six
logo-stamped Halos for the VIP market). Stations are abstract mini-games; nothing models real
chemistry.

## 6. Brand

- Name the brand (suggestions offered), build a logo (8 shapes × 24 icons × 8 palettes × 4 type
  styles), pick packaging (bag, tin, box, sticker roll) on a live 3D turntable. ≤ 45 s, editable later.
- The logo appears on packaging, the phone, product cards, crew shirts, graffiti and bought billboards.
- **Brand Hype (0–100)** rises with consistent quality, happy customers and stunts (beach-party
  sponsorship, graffiti blitz, influencer collab); it lifts price and demand, and dents on busts.

## 7. Customers and deals

- **44 named adults** (`content/customers.ts`), each with archetype, district, hangouts, schedule,
  budget, 2–3 loved and 1–2 disliked effects, haggle temperament, a texting voice, an appearance
  seed and story beats. Relationship: Stranger → Regular → Loyal → Superfan.
- **Demand** = taste match × quality × brand × price × time of day × weather × event × district mood.
  The Empire app shows a plain **Demand Forecast** ("Strand wants Party tonight ▲").
- **Deal flow.** Text arrives with chips (Accept / Counter / Decline) → GPS line → meet →
  **Handoff** (≈ 5 s): the best-matching product is pre-selected, then one **Haggle** slider against
  the customer's mood meter. The tolerance edge is fuzzy; it sharpens with relationship. Inside the
  band = sale (+bonus near the edge = **Perfect Deal**, streaks pay). Outside = they counter lower
  and you lose a sliver of goodwill. *Auto-price* is always one press.
- **Street awareness.** Cops and nosy witnesses show vision cones. If one covers you mid-handoff the
  pair slides into an *act casual* bit until it passes; forcing the handoff adds Heat.
- **Variety:** street handoff · drive-by window · busker deal · house-party multi-buyer · yacht VIP
  package · dock wholesale · dead-drop locker · crew delivery. **Free samples** to passers-by unlock
  new named customers.

## 8. Heat, police, raids

- **Street Heat 0–5** (immediate). 1 a patrol takes interest · 2 pursuit units · 3 roadblocks and
  spike strips · 4 helicopter with searchlight · 5 SWAT vans. Escape by breaking line of sight
  (search circle shrinks), hiding in garages and alleys, swapping or respraying the car (drive
  through your own car wash), taking to the water, or paying off via the phone.
- **Notoriety 0–100** (long-term) rises with volume, witnessed deals, property Visibility and busts;
  it falls with time, bribes, Sy, and clean fronts. Crossing 40 / 65 / 85 schedules a **raid**.
- **Raids are telegraphed:** a tipster texts hours ahead → move stock, hire guards, bribe, or stand
  your ground → **Raid Night** set-piece → at worst partial confiscation and a short lockdown.
- **Busted:** stylish and quick: a fee (≤ 8 % of cash, capped), part of the Go-Bag, respawn outside
  Pinkerton Law, one press to retry. Never a game over.

## 9. Crew, properties, money, rivals, events

- **Crew.** Grower · Cook · Packer · Dealer · Driver · Guard (+ Accountant, Lookout). Each has a
  portrait, quirk, 1–5 skill stars, wage and morale, and is visible working. One **Crew board**:
  role → property → recipe or turf, status chips, **Auto-assign**. Unhappy crew quit with a flourish
  and can be won back. First hire: **Pilar** (Grower).
- **Dealers and turf.** The map is divided into ~30 turfs. Dealers auto-serve regulars from stock,
  build **Influence**, and bank dirty cash. Rival pressure erodes it; guards, escorts or retaliation
  defend it.
- **Properties.** Five, each with Power · Climate · Security · Capacity · Style tracks and three
  visible states (ramshackle → tidy → gleaming). **Build Mode** (B): top-down, grid snap, ghost
  validity, rotate, undo/redo, instant refund, 40+ placeables, a **Flow Score** for crew walking
  distance. **Visibility** and **Security** are two gauges per property.
- **Money.** Dirty and Clean cash. Fronts convert up to a daily capacity with one slider; exceeding
  it risks an audit. Property, vehicles and fronts need clean money; street costs take either.
- **Debt.** $80,000 to Don Vale. Paying early earns respect and unlocks his wholesale contacts;
  missing a week brings collectors (story pressure, never a fail state).
- **Rivals.** **Vale Imports** (old money, controls the harbor) · **The Mudflaps** (airboat bikers,
  raid supply lines in the Sawgrass) · **Zenith Wellness** (Chase "Zen" Montrose; undercuts and
  poaches with marketing). Answers: out-brand, out-price, ambush, ally, bribe, expose, sabotage.
- **Living events (≥ 15, forecast in the phone):** beach-party surge · car meet · parade · concert ·
  heat wave · police crackdown · supplier shortage · customer in trouble · rival ambush · boat chase
  · street race · fireworks festival · influencer pop-up · audit week · king tide · hurricane watch.

## 10. Progression and economy targets

| Rank | Title | Headline unlocks |
|---|---|---|
| 1 | Seedling | Ofelia's, workbench, Go-Bag, the Gator |
| 2 | Greenthumb | upgrades (drip irrigation), Market app, second strain |
| 3 | Hustler | first hire (Pilar), auto-restock, more planters, free samples |
| 4 | Operator | Palmetto garage, Cold Still (Dew), dealers and turf, 4-effect cap |
| 5 | Supplier | Breeding Cabinet, first front, chauffeur |
| 6 | Wholesaler | Harbor warehouse, Sun Press (Halos), dock wholesale |
| 7 | Boss | Sawgrass stilt-house, guards, boats, 5-effect cap |
| 8 | Mogul | nightclub front, billboards, yacht VIPs |
| 9 | Kingpin | Isla Dorada penthouse, hurricane watch begins |
| 10 | Coast Royalty | finale and the ending choice; sandbox |

- XP comes from everything (deals, discoveries, harvest streaks, drifts, escapes, expansions).
- **Pacing targets:** first purchase ≤ 4 min · Rank 2 ≈ 10 min · Rank 3 ≈ 25 min · Rank 6 ≈ 90 min ·
  finale-ready 2–3 h. Verified by the headless economy simulator with three bots (casual,
  optimizer, risk-taker); no infinite-money loop. Results in `BALANCE.md`.
- **Difficulty:** *Chill* (heat decays fast, generous haggles) · *Classic* · *Sweaty* (aggressive
  cops and rivals, stingier buyers). Granular assists live in Settings.

## 11. Story, cast, missions

**Premise.** You arrive with a duffel bag, a reputation you did not earn, and the keys to your late
grandmother's failing plant-and-bait shop. She left a debt to Don Ignacio Vale and a notebook of
cuttings that make her plants special. You have a season.

| Cast | Voice |
|---|---|
| **Ofelia "Abuela" Ruiz** (notebook margins) | fierce, funny, wise. "Water twice, worry never." |
| **Don Ignacio Vale** | silver-haired, warm, terrifying; speeches over paella |
| **Chase "Zen" Montrose** | ring-light humility, real menace |
| **Det. Imani Reyes** | relentless; hosts a true-crime podcast |
| **Sy Pinkerton** | billboard lawyer. "Busted? Don't Panic." |
| **Pilar** | botanist prodigy, names every plant |
| **Dex** | garage genius; cars are therapy |
| **Tank** | gentle giant guard who bakes |
| **Kiki Valdés** | roller-skate instructor, first customer, thrower of parties |

**Acts and missions** (each has one set-piece; all are skippable, checkpointed, instantly retryable):

1. *Inheritance* — the first ten minutes.
2. *Paella with the Don* — Cobalt Harbor, 9 AM; the debt, a favor, a tail through the container yard.
3. *Green Thumb for Hire* — recruit Pilar; drive her orchids across town without bruising them.
4. *Skate Night* — Kiki's house party; multi-buyer handoffs; lights-and-sirens exit.
5. *Mud Season* — the Mudflaps hit your supply run; airboat chase through the mangroves.
6. *Ring Light* — Zenith's boardwalk pop-up; sabotage it during the parade.
7. *Clean Hands* — Sy and the car wash; a getaway through the drive-in.
8. *The Drawbridge* — meet Dex; a race that ends with the inlet bridge opening.
9. *Container Night* — a night job on a ship for Vale.
10. *Helipad Handoff* — Crown Tower roof, a helicopter and a searchlight.
11. *Podcast* — Det. Reyes makes an offer; feed her a rival, or don't.
12. *Paid in Full* — settle with Vale: pay, partner, or defy.
13. *Hurricane Night* — the city boards up; move the stash before the bridges flood while Montrose
    makes his move.
14. *Morning After* — **Go Legit** or **Take the Crown**; both continue as a sandbox.

## 12. Controls (defaults; all rebindable)

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / look | WASD / mouse | left stick / right stick |
| Sprint · Jump · Crouch | Shift · Space · C | L3 · A · B |
| **Interact** (context) | E | X |
| Enter / exit vehicle | F (or E at the door) | Y |
| Throttle · Brake/reverse · Steer | W · S · A/D | RT · LT · left stick |
| Handbrake · Flow boost · Horn | Space · Shift · H | A · X · L3 |
| Radio next / previous | `.` / `,` | D-pad right / left |
| Camera cycle · look back | V · hold C | D-pad down · R3 |
| Aim · Fire · Reload | RMB · LMB · R | LT · RT · X |
| **Phone** · Map | Tab · M | D-pad up · View |
| **Quick Wheel** (hold) | Q | LB |
| Build Mode (in a property) | B | hold View |
| Pause | Esc | Menu |
| Menus: move · confirm · back · tabs · details | arrows/WASD · Enter · Esc · Q/E · I | D-pad/stick · A · B · LB/RB · Y |

## 13. Fun Audit

Verb · feedback · decision · cycle · scales by · failure · anti-tedium. Tuning notes are appended
per milestone in `PROGRESS.md`.

| Feature | Verb | Feedback (≤ 100 ms) | Decision | Cycle | Scales / delegates | Failure mode | Anti-tedium check |
|---|---|---|---|---|---|---|---|
| Driving | steer, slide, boost | body roll, tire smoke, FOV kick, engine note, Flow fill | line, when to slide, when to spend Flow | continuous | fast travel, chauffeur (Rank 5) | spin-out, auto-right in 1.5 s | never mandatory after hour one; no fuel or repairs |
| Flow meter | drift, near-miss, air, draft | meter pulse, pitch rise, sparkle on fill | bank Flow for the delivery tip or burn it for boost | 5–20 s | — | meter cools slowly, never punishes | pure upside |
| Tend Sweep | hold and walk | watering arc, leaf perk, icon pops, rising chime | when to sweep vs let crew | ~10 s / room | drip, sprinklers, Grower | skipped care lowers quality a little | no refills, no per-plant menus |
| Harvest | snip on the beat | snip, petal burst, combo counter | manual for Perfect or hold for Good | 3 s / plant | hold-to-harvest, Grower | OK grade | easy-timing option |
| Planting | pick strain, feed profile | soil puff, seed pop | strain × profile | 2 s / pot; "Plant all" | Grower follows the room plan | none | one press plants a row |
| Mixing | drop, shake, reveal | clink, slosh, reveal flash, Notebook page | which additives, in what order | 6–8 s | Cook again, queue, Cook crew | dud product still sells cheap | exact previews for known rules |
| Discovery | try an unknown | "?" resolves with a flourish; sticker | chase a harmony or a fusion | per mix | rule knowledge is permanent | — | no blind grinding |
| Branding | pick, tweak | live turntable, stamp thunk | identity | ≤ 45 s once | — | — | suggestions offered; editable |
| Deal handoff | choose, haggle | mood meter, cash flick, portrait reaction | push price vs loyalty | ~5 s | Auto-price; dealers | counter-offer, −goodwill sliver | drive-by window; no walking required |
| Messages | tap a chip | bubble pop, GPS line appears | accept, counter, decline | 2 s | dealers take routine orders | request expires politely | no typing |
| Free sample | offer | NPC reaction bark, contact card | who to court | 3 s | — | they shrug | optional |
| Heat and pursuit | evade | sirens, light wash, search circle | run, hide, swap, water, pay | 30–120 s | Lookout crew, car wash front | busted: fee + some bag | instant retry, never game over |
| Raids | prepare, choose | countdown chip, tipster text | move, guard, bribe, fight | telegraphed hours ahead | Guards, Security track | partial confiscation | always warned |
| Crew board | assign | chip turns lime, worker walks to station | who does what | 5 s | Auto-assign | idle chip explains why | one board, no sub-menus |
| Build Mode | place, rotate | ghost snaps, thunk, Flow Score tick | layout | seconds per item | presets per room | red ghost explains | undo / instant refund |
| Fronts | set today's wash | bar fills, clean counter ticks | how hard to push capacity | 3 s / day | Accountant | audit event | one bar, one slider |
| Supply | order / subscribe | cart chip, drop-box thump | buy in store (cheaper) or deliver | 5 s | auto-restock (Rank 3) | shortage event raises price | never stalls production |
| Time skip | wait / sleep | sky sweep, Shift Report | when to skip | 3 s | — | — | never forced |
| Phone | open, glance, act | slide-up, world slows | which app | ≤ 2 inputs to anything | Next Best Action | — | remembers last app |
| Combat (optional) | aim, fire, cover | hit-marker, recoil, stagger | fight or flee | 20–60 s | Guards | wasted: same as busted | every fight can be avoided |
| Photo Mode | frame, grade | instant | composition | free | — | — | pure delight |

## 14. Scope tiers and cut order

Tier 0 → Tier 1 are non-negotiable and ship polished. Tier 2 ships at the same bar or not at all.
Cut order when budget binds: collectibles and mini-golf → cosmetics and achievements → extra
cinematics → Saltwater Keys → boats beyond the airboat mission → weapons beyond three → story
missions from the middle of Act II (never the opening or the finale). Every cut is logged in
`PROGRESS.md` and listed in the final report.
