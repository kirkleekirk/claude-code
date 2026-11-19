# HOTHOUSE — Balance

Every tuning number of the empire lives in `src/sim/balance.ts` (constants) and `src/content/*`
(content data). This document explains the formulas, lists the tables, and records what the
headless economy simulator measured. To re-run it:

```
npm run sim          # 3 temperaments × 3 seeds × 3 h of game time, ~7 s
```

Results are written to `qa/out/balance/results.json` (medians per temperament and over all runs,
plus every run's rank times, XP curve, XP sources, income and spending). The simulator is a test:
it fails if the pacing targets drift out of their bands or money runs away.

## 1. Pacing: targets and results

Targets (DESIGN.md §10) are for a typical player, read as **the median of all nine runs**.

| Milestone | Target | Median (all runs) | Casual | Optimizer | Risk-taker | Test band |
|---|---|---|---|---|---|---|
| First sale (Kiki) | — | 2.6 min | 3.5 | 2.4 | 2.6 | ≤ 4 |
| First purchase (garden store) | ≤ 4 min | 3.9 min | 5.4 | 3.7 | 3.9 | ≤ 4 |
| Rank 2 | ≈ 10 min | 8.9 min | 11.8 | 7.8 | 8.9 | 7–13 |
| Rank 3 | ≈ 25 min | 23.2 min | 33.0 | 18.8 | 24.7 | 19–31 |
| Rank 4 | — | 43.7 min | 59.4 | 33.0 | 43.7 | — |
| Rank 5 | — | 62.1 min | 84.6 | 50.1 | 62.1 | — |
| Rank 6 | ≈ 90 min | 79.5 min | 115.5 | 63.4 | 79.5 | 75–105 |
| Rank 7 | — | 104.4 min | 143 | 87.1 | 104.4 | — |
| Rank 8 | — | 123.2 min | 156 | 98.8 | 123.2 | — |
| Rank 9 | — | 136 min | 178 | 108.6 | 136 | — |
| Finale ready (Hurricane Night unlocked) | 2–3 h | 145 min | 1 of 3 runs by 180 | 110 | 145 | 120–180 |
| Debt settled (Paid in Full) | — | 145 min | 1 of 3 runs by 180 | 105 | 145 | — |

Every run, per seed (minutes):

| Bot | Seed | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | Finale | Earned by 3 h | Missions | Deals / crew deals |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Casual | 11 | 11.8 | 34.1 | 59.4 | 87.4 | 115.5 | 143 | 156 | 178 | 180 | $78k | 11 | 51 / 390 |
| Casual | 23 | 11.8 | 22.9 | 44.7 | 68.6 | 87.7 | 116 | 141.5 | 168.6 | — | $123k | 10 | 53 / 540 |
| Casual | 37 | 11.8 | 33.0 | 63.6 | 84.6 | 119.2 | 153.6 | 175.4 | — | — | $56k | 10 | 60 / 225 |
| Optimizer | 11 | 7.8 | 18.1 | 33.0 | 50.1 | 63.4 | 85.4 | 94.3 | 105 | 105 | $191k | 13 | 108 / 804 |
| Optimizer | 23 | 7.8 | 18.8 | 30.4 | 41.8 | 59.2 | 87.1 | 98.8 | 111.6 | 115 | $168k | 13 | 100 / 700 |
| Optimizer | 37 | 7.8 | 23.2 | 39.2 | 55.1 | 72.0 | 90.6 | 100.7 | 108.6 | 110 | $172k | 13 | 105 / 708 |
| Risk-taker | 11 | 8.9 | 24.7 | 43.7 | 57.6 | 68.2 | 89.6 | 100.2 | 112.9 | 120 | $180k | 13 | 83 / 850 |
| Risk-taker | 23 | 8.9 | 25.5 | 48.2 | 68.4 | 83.8 | 106.3 | 123.2 | 136 | 145 | $152k | 13 | 98 / 598 |
| Risk-taker | 37 | 9.5 | 23.2 | 41.9 | 62.1 | 79.5 | 104.4 | 125.8 | 145.7 | 165 | $139k | 13 | 89 / 593 |

Median XP on the clock:

| Minute | 10 | 25 | 45 | 65 | 90 | 110 | 130 | 150 | 175 |
|---|---|---|---|---|---|---|---|---|---|
| Casual | 186 | 559 | 1,303 | 1,850 | 2,771 | 3,381 | 4,321 | 5,695 | 7,287 |
| Optimizer | 265 | 1,103 | 2,477 | 3,727 | 5,585 | 8,005 | 12,222 | 13,518 | 15,479 |
| Risk-taker | 265 | 986 | 1,847 | 2,738 | 4,437 | 5,365 | 7,060 | 9,374 | 13,203 |

Reading it: an expert (optimizer) reaches the finale in under two hours, a typical player in about
2.4 h, a relaxed first-timer just past three. Nobody is locked out, and the spread (≈ 1.8× between
optimizer and casual at Rank 6) is a test assertion, not an accident.

### No runaway money

Income over each run's last hour stays between **$700 and $1,550 a minute** (test ceiling: $6,000).
Cash at three hours is $5k–$44k: late sinks (fronts, the warehouse and stilt house, the Secret Page,
the debt, wages and supplies) keep pace with income, and the penthouse ($90k clean) and Club Aftersun
($60k clean) remain post-finale goals.

## 2. The bots

Three temperaments play through the public sim API (`tests/sim/bots/`). Driving uses a district
travel model of the 2.8 km map (crossing town ≈ 70–90 s); texts, menus, the haggle and tutorials take
time; set-pieces take a fixed time with a chance to fail and retry. Bots answer texts while doing
other things, juggle a few requests, restock by phone or in person, tend the garden until a grower
takes over, explore the Notebook with small test batches, cook with crew recipes (mix → Cold Still →
Sun Press), hire and assign crew, buy upgrades, property and fronts, pay Vale on schedule, prepare for
raids, hang out where customers are for walk-ups, and follow the HUD objective into story missions
(resting until a mission's time window when they like).

| | Casual | Optimizer | Risk-taker |
|---|---|---|---|
| Decision time per loop | 5 s | 2.5 s | 4 s |
| Driving time × | 1.25 | 0.9 | 0.85 |
| Menus and texts × | 1.3 | 0.8 | 1.0 |
| Haggle | auto price | reads the band | pushes the top |
| Requests juggled | 2 | 3 | 3 |
| Story mission pick-up per check | 60 % | 95 % | 75 % |
| Rests until a mission window | 50 % | 80 % | 60 % |
| Witnessed handoffs | 3 % | 2 % | 22 % |
| Supplies | drives to the counter | phone orders | phone orders |
| Crew plan | 70 % | 100 % | 90 % |

## 3. Where XP and money come from (medians at 3 h)

| XP source | Casual | Optimizer | Risk-taker |
|---|---|---|---|
| Story missions | 3,090 | 6,390 | 6,390 |
| Player deals | 1,529 | 3,536 | 2,767 |
| Dealer sales | 1,265 | 2,656 | 2,204 |
| Goals | 420 | 632 | 512 |
| Harvests | 439 | 606 | 193 |
| Relationship level-ups | 260 | 540 | 560 |
| Mixing and discoveries | 380 | 472 | 430 |
| Fronts, property, upgrades | 340 | 560 | 560 |
| Other (planting, samples, brand, escapes, tending, prologue) | ~200 | ~330 | ~470 |

| Money in | Casual | Optimizer | Risk-taker |
|---|---|---|---|
| Dealer sales | $54,079 | $114,300 | $98,616 |
| Mission and goal rewards | $14,535 | $30,450 | $29,740 |
| Player deals + tips | $10,082 | $25,788 | $21,412 |
| Legit storefront income | $1,680 | $3,040 | $2,340 |

| Money out | Casual | Optimizer | Risk-taker |
|---|---|---|---|
| Property | $9,350 | $33,550 | $33,550 |
| Supplies (seeds, additives) | $16,584 | $33,239 | $27,177 |
| Upgrades | $15,360 | $29,360 | $29,360 |
| Vale's debt | $18,430 | $19,160 | $24,000 |
| Fronts | $6,000 | $15,000 | $15,000 |
| Wages | $5,351 | $13,483 | $10,610 |
| Build Mode | $2,000 | $2,480 | $2,300 |
| Busts and raids | $50 | $0 | $4,296 |

Laundering ($7k–$27k a run) converts dirty cash to clean (minus the front's 8–12 % fee); it is not income.

## 4. Formulas

**Product value** (`productValue`):

```
value = strain.value × strain.appeal × QUALITY[stars] × max(0.2, 1 + Σ effect values)
        × harmony × tier × brand
QUALITY   = ★0.7 · ★★0.85 · ★★★1.0 · ★★★★1.2 · ★★★★★1.45
tier      = Bloom 1 · Dew 4.5 (3 Bloom → 1 Dew) · Halos 1.5 each (1 Dew → 6 Halos)
brand     = (1 + hype / 200) × packaging value   (hype floor 10, decays 0.6/min)
harmony   = the matching harmony's multiplier, else 1
```

Refining multiplies a batch's worth by 1.5 (Bloom → Dew) and 2 (Dew → Halos); production (pots ×
yield ÷ grow time), station time (18 s per Dew, 10 s per Halo for crew jobs) and selling capacity cap
what that multiplier can earn.

**Fair price in a handoff** (`fairFor`):

```
fair = value × sense × match × prices × (0.9 + 0.1 × demand)        capped at budget ÷ qty
sense = 0.85 + 0.15 × district wealth
match = (1 + 0.12 × loved effects (≤ 3) − 0.25 × disliked) × 0.82 if it misses the request
        × 0.85 below the minimum stars × 0.8 for a tier the buyer does not usually take
```

Party and VIP packages (Skate Night, Helipad Handoff, wholesale) are not capped by one buyer's
budget. The customer walks away above `fair × (1 + tolerance)`:

| Tolerance part | Values |
|---|---|
| Haggle style | easygoing 0.30 · fair 0.22 · shrewd 0.14 · generous 0.38 · flaky 0.26 (+ up to 0.12 noise) |
| Relationship | stranger 0 · regular +0.04 · loyal +0.08 · superfan +0.12 |
| Mood, noise | mood × 0.05 · ±0.06 |
| Difficulty | Chill +0.08 · Classic 0 · Sweaty −0.06 |

The visible band is `fair × fuzz × 2` wide (stranger 0.16 → superfan 0.03). **Auto-price** sells at
`fair × (1 + 0.55 × tolerance)`. A sale at ≥ 94 % of the walk-away point without a counter is
**Perfect**. Over-reaching earns a counter (and −1/−2 affinity); flow adds a tip of up to 22 %.

**Deal XP:** `10 + min(60, (total + tip) ÷ 14) + 15 for a first deal + 10 × min(5, perfect streak)`.
**Dealer sale XP:** `1 + price ÷ 60`.

**Requests and walk-ups.** A new text every 58 s on average (× 0.6–1.4) while there is a free
slot: 2 slots, +2 with the Second Burner Phone (which also texts 30 % faster), +1 at Rank 5, +1 at
Rank 8. Requests last 160–270 s (× 1.2 for easygoing and generous buyers, × 0.85 shrewd). Walk-ups
roll every 75 s (× 0.8–1.3) with a 45 % chance wherever an unlocked customer hangs out. A deal
satisfies a buyer for a few minutes (satiation +0.55, decays 1/300 per second; texts stop above 0.5).

**Dealers.** Sales per minute = `traffic ÷ 6 × speed × 1.2 at night × demand × (1 − strongest rival
influence ÷ 200)`, speed = `(0.6 + 0.2 × skill) × 0.7 if upset × workplace flow`. Each sale moves 1–2
units of the stash's most valuable stack at `value × sense × 0.85` (× 1.1 with a packer). Halos only
sell on Isla Dorada and in Deco.

**Growing.** Water drains in 72 s and food in 160 s at hardiness 1; a thirsty plant grows at 35 %, a
hungry one at 70 %. Feed profiles trade time, yield and quality (Speed ×0.75 time −1 unit; Yield
×1.1 time +2 units; Quality ×1.1 time +0.18 quality); Blaze lights grow 12 % faster and better but
are 1.8× as visible. Harvest inside the peak window for +8 % quality; 90 s and 240 s late cost one and
two notches.

**Vale's debt.** $80,000. After Paella, Vale checks in every 3 in-game days: 6 % of the principal
by the first check, then another 12 % each time. On time: respect +8 (+12 if 1.5× ahead). Missed:
respect −10 and a collector. Paid in Full settles it: pay the rest, partner (respect ≥ 60) or defy.

**Rest.** *Wait* and *Sleep* skip at most 12 in-game hours (480 sim-seconds); the next skip needs
about 7 in-game hours (280 sim-seconds) awake. The empire runs during a skip, so this keeps resting a
breather instead of a money printer.

**Goals.** Three at a time, scaled by rank band; XP = `25 + 15 × (band + 1) + 2 × target` (money
goals: no per-dollar part). Hands-on counters (deals, units, harvests, tends, mixes) count the
player's own work; the crew's output never completes a goal by itself.

## 5. The rank curve

| Rank | Title | XP | Gap | Headline unlocks |
|---|---|---|---|---|
| 1 | Seedling | 0 | — | Ofelia's, workbench, Go-Bag, the Gator |
| 2 | Greenthumb | 250 | 250 | upgrades, Market app, second strain (lands on Marisol's delivery) |
| 3 | Hustler | 900 | 650 | first hire, auto-restock, more planters, free samples |
| 4 | Operator | 1,800 | 900 | Palmetto Garage, Cold Still, dealers, 4-effect cap |
| 5 | Supplier | 2,600 | 800 | Breeding Cabinet, first front, chauffeur |
| 6 | Wholesaler | 3,600 | 1,000 | Harbor Warehouse, Sun Press, dock wholesale |
| 7 | Boss | 5,100 | 1,500 | Stilt House, guards, boats, 5-effect cap |
| 8 | Mogul | 6,400 | 1,300 | Club Aftersun, billboards, yacht VIPs |
| 9 | Kingpin | 7,800 | 1,400 | Dorada Penthouse, hurricane watch |
| 10 | Coast Royalty | 9,800 | 2,000 | the finale's ending; sandbox |

Story missions carry 40–50 % of all XP, and they are gated by rank, so the curve regulates itself:
a player who races ahead runs out of story and earns at the slower everyday rate until the next rank.

| Mission | Unlock | Cash | XP |
|---|---|---|---|
| Inheritance | the prologue | — | — |
| Paella with the Don | after Inheritance, 8–11 AM | $500 | 160 |
| Green Thumb for Hire | R3, after Paella | $300 | 220 |
| Skate Night | R3, after Green Thumb, 7 PM–2 AM | $1,200 | 280 |
| Mud Season | R4, after Green Thumb | $1,500 | 320 |
| Ring Light | R5, after Skate Night, noon–6 PM | $2,000 | 380 |
| Clean Hands | R5, after Paella | $1,000 clean | 340 |
| The Drawbridge | R5, after Clean Hands | $1,500 | 420 |
| Container Night | R6, after Paella and Mud Season, 10 PM–4 AM | $5,000 | 520 |
| Helipad Handoff | R7, after Container Night | $9,000 | 650 |
| Podcast | R7, after Ring Light | — | 450 |
| Paid in Full | R8, after Container Night | — | 800 |
| Hurricane Night | R9, after Paid in Full | $15,000 clean | 1,500 |
| The Morning After | after Hurricane Night | — | 1,000 |

Other XP: harvest 10 + 2 per star (+5 timing bonus, +15 first of a strain) · plant 3 · tend 1 per
need cleared (≤ 3) · buy 2 · brand 25 · upgrade 10 · property and front 100 · sample 4 · escape 20 per
heat level · relationship level-up 20/40/80 · new product 30 + 8 per effect (+80 Apex, +50 harmony,
+4 per new rule) · raid survived 40–60.

## 6. Prices

| Upgrade | Rank | Cost |
|---|---|---|
| Drip Irrigation · Snip-Snap Trimmer · Second Burner Phone | 2 | $240 · $180 · $150 |
| Sun-Grade Lamps · Bigger Mixing Bowl · Auto-Restock · Blackout Retrofit | 3 | $650 · $420 · $300 · $520 |
| Ofelia's Recipe Box · Auto-Feed Lines · Climate Control · Cold Still | 4 | $1,200 · $900 · $1,500 · $2,000 |
| Breeding Cabinet · Chauffeur Service · Crew Van | 5 | $2,500 · $1,800 · $3,000 |
| Sun Press | 6 | $6,000 |
| The Secret Page | 7 | $8,000 |

| Property | Rank | Price | | Front | Rank | Price |
|---|---|---|---|---|---|---|
| Palmetto Garage | 4 | $8,500 (cash +10 %) | | Sudsy Flamingo Car Wash | 5 | $6,000 |
| Harbor Warehouse 7 | 6 | $24,000 clean | | Taco Tsunami | 5 | $9,000 |
| Sawgrass Stilt House | 7 | $22,000 (cash +10 %) | | The Leaky Tiki | 6 | $25,000 clean |
| Dorada Penthouse | 9 | $90,000 clean | | Club Aftersun | 8 | $60,000 clean |

Crew wages per in-game day: grower $120 · cook $140 · packer $110 · dealer $150 · driver $130 ·
guard $170 · accountant $160 · lookout $100 (± skill). Build Mode has 48 placeables from $0 to
$1,100; removing something placed in the same session refunds it in full, anything older 50 %.

## 7. Products

### Strains

| Strain | Effect | Value | Appeal | Yield | Grow | Seed | Rank |
|---|---|---|---|---|---|---|---|
| Abuela’s Blush | Sunkissed | $30 | 1.0 | 4 | 180 s | $15 | 1 |
| Gatorgrass Gold | Mellow Tide | $28 | 0.95 | 5 | 170 s | $14 | 1 |
| Neon Nana | Disco Feet | $38 | 1.35 | 4 | 210 s | $28 | 2 |
| Swamp Halo | Dreamy | $34 | 1.05 | 5 | 200 s | $24 | 2 |
| Causeway Coral | Chatty | $32 | 1.1 | 5 | 190 s | $20 | 2 |
| Midnight Mango | Night Owl | $40 | 1.15 | 5 | 220 s | $32 | 3 |
| Lighthouse Lime | Laser Focus | $42 | 1.1 | 4 | 230 s | $34 | 3 |
| Pelican Punch | Bold | $36 | 1.1 | 5 | 200 s | $26 | 3 |
| Flamingo Fever | Giggles | $38 | 1.25 | 5 | 210 s | $30 | 3 |
| Hurricane Hibiscus | Electric | $52 | 1.3 | 4 | 240 s | $45 | 4 |
| Velvet Manatee | Couch Gravity | $30 | 0.95 | 8 | 260 s | $30 | 4 |
| Ghost Orchid 9 | Third Eye | $75 | 1.4 | 3 | 320 s | $90 | 6 |

### Effects

| Family | Base effects (value) | Apex (fusion only) |
|---|---|---|
| Social | Chatty +0.22 · Giggles +0.25 · Bold +0.30 · Disco Feet +0.34 | Main Character +1.25 |
| Body | Sunkissed +0.20 · Mellow Tide +0.24 · Couch Gravity +0.20 · Electric +0.36 | Golden Hour +1.30 |
| Mind | Laser Focus +0.32 · Dreamy +0.26 · Night Owl +0.30 · Nostalgic +0.22 | Galaxy Brain +1.35 |
| Weird | Third Eye +0.38 · Shimmer +0.30 · Slow-Mo +0.28 · Glowtongue +0.33 | Mermaid Mode +1.45 |
| Duds | Heebie-Jeebies −0.35 · Swamp Funk −0.50 | |

### Additives and rules

Each additive first transforms the effects already present (all at once), then adds its own
effect if there is room (cap 3, 4 with the Recipe Box, 5 with the Secret Page). If two effects land
on the same base effect in one step, they fuse into their family's Apex (once per step).

| Additive | Flavor | Adds | Price | Rank | Counter | Rules |
|---|---|---|---|---|---|---|
| Key Lime Zest | citrus | Laser Focus | $7 | 2 | Mama Yoli’s | Couch Gravity → Laser Focus · Mellow Tide → Night Owl · Sunkissed → Nostalgic · Dreamy → Laser Focus · Giggles → Chatty |
| Blood Orange Fizz | citrus | Chatty | $9 | 2 | Mama Yoli’s | Electric → Night Owl · Couch Gravity → Dreamy · Slow-Mo → Nostalgic · Laser Focus → Bold · Heebie-Jeebies → Giggles |
| Guava Paste | sweet | Giggles | $5 | 1 | Mama Yoli’s | Bold → Giggles · Electric → Mellow Tide · Laser Focus → Dreamy · Third Eye → Shimmer · Night Owl → Couch Gravity |
| Orange-Blossom Honey | sweet | Mellow Tide | $6 | 1 | Sod Almighty | Electric → Sunkissed · Bold → Chatty · Night Owl → Dreamy · Disco Feet → Giggles · Laser Focus → Mellow Tide |
| Saltwater Taffy | sweet | Nostalgic | $6 | 2 | Mama Yoli’s | Chatty → Giggles · Sunkissed → Dreamy · Night Owl → Nostalgic · Slow-Mo → Couch Gravity · Third Eye → Dreamy |
| Gator Tears Hot Sauce | spicy | Bold | $8 | 2 | Mama Yoli’s | Mellow Tide → Electric · Couch Gravity → Disco Feet · Dreamy → Chatty · Slow-Mo → Electric · Nostalgic → Bold |
| Pink Peppercorn | spicy | Disco Feet | $11 | 3 | Mama Yoli’s | Mellow Tide → Disco Feet · Couch Gravity → Electric · Sunkissed → Bold · Night Owl → Electric · Shimmer → Glowtongue |
| Cafecito Shot | buzz | Night Owl | $7 | 2 | Mama Yoli’s | Couch Gravity → Laser Focus · Dreamy → Night Owl · Slow-Mo → Chatty · Mellow Tide → Electric · Sunkissed → Laser Focus |
| Volt! Powder | buzz | Electric | $12 | 3 | Mama Yoli’s | Couch Gravity → Bold · Slow-Mo → Disco Feet · Dreamy → Laser Focus · Mellow Tide → Chatty · Night Owl → Laser Focus |
| Pickle Brine | briny | Couch Gravity | $5 | 2 | Mama Yoli’s | Heebie-Jeebies → gone · Electric → Mellow Tide · Disco Feet → Sunkissed · Bold → Mellow Tide · Night Owl → Dreamy |
| Sea Salt Flakes | briny | Sunkissed | $8 | 2 | Mama Yoli’s | Swamp Funk → gone · Mellow Tide → Sunkissed · Electric → Mellow Tide · Glowtongue → Chatty · Third Eye → Dreamy |
| Moon Jelly | glow | Dreamy | $13 | 3 | Annie’s | Night Owl → Slow-Mo · Mellow Tide → Shimmer · Laser Focus → Third Eye · Chatty → Glowtongue · Couch Gravity → Slow-Mo |
| Firefly Sugar | glow | Shimmer | $15 | 4 | Annie’s | Disco Feet → Glowtongue · Dreamy → Third Eye · Night Owl → Slow-Mo · Electric → Third Eye · Bold → Glowtongue |
| Mystery Bait | glow | Slow-Mo | $4 | 1 | Annie’s | Shimmer → Third Eye · Mellow Tide → Swamp Funk · Sunkissed → Glowtongue · Laser Focus → Heebie-Jeebies · Dreamy → Shimmer · Giggles → Third Eye |

Gulf Direct (the Market app) sells most seeds and additives by phone at +20 % with a 60 s delivery;
the docks sell additives in tens at −25 % once Vale trusts you.

### Harmonies

| Harmony | Needs | × |
|---|---|---|
| Boardwalk Special | Giggles + Disco Feet + Sunkissed | 1.35 |
| Night Shift | Night Owl + Laser Focus + Electric | 1.30 |
| Sunday Porch | Mellow Tide + Couch Gravity + Nostalgic | 1.30 |
| Gallery Opening | Chatty + Dreamy + Shimmer | 1.30 |
| Swamp Prophet | Third Eye + Slow-Mo + Dreamy | 1.40 |
| Big Night Out | Bold + Disco Feet + Chatty | 1.35 |
| Beach Brain | Sunkissed + Laser Focus + Glowtongue | 1.40 |
| Retro Romance | Nostalgic + Dreamy + Giggles | 1.30 |
| Storm Chaser | Electric + Slow-Mo + Third Eye | 1.35 |
| Coast Royalty | any two Apex effects | 1.60 |

Every Apex and every harmony is reachable from some base strain within three additives (a unit test
checks it). With the full additive range there are 83 two-additive Apex recipes; bots found an Apex
in two of nine runs by exploring alone, without the Notebook's hints a player gets.

## 8. Customers

44 adults across eight districts. Per-deal budgets: Flats $85–150 · Strand $95–150 · Sawgrass
$110–150 · Keys $160–200 · Harbor $170–220 · Crown $200–380 · Deco $140–420 · Isla Dorada VIPs
$900–2,200. Relationship levels at 12 / 40 / 75 affinity raise spend (× 1.15 / 1.3 / 1.5), loyalty
tips (3 / 6 / 10 %) and tolerance, and narrow the visible band.

## 9. Exploit review

| Loop | Guard |
|---|---|
| Sleeping for crew income | Skips capped at 12 in-game hours and need ~7 hours awake between them; raids interrupt. |
| Build Mode place/remove | Same-session removals refund the purchase exactly; older placements 50 %. Tested. |
| Refining | ×1.5 then ×2 by design; bounded by Bloom production, station time and selling capacity. |
| Haggling the same buyer | Hidden, fuzzy walk-away; counters shrink and cost affinity; satiation stops repeat texts. |
| Laundering | A conversion with an 8–12 % fee, daily capacity per front, and audit fines (25 % of the day's wash) when over-pushed. |
| Goals from the crew | Goal counters only count the player's own work; laundering goals pay a flat XP. |
| Dealer XP | 1 + $/60 per sale: it grows with the empire but stays a small share. |
| Mission rewards | One-time; failed attempts pay nothing and retry from the checkpoint. |
| Random command fuzz | 3 × 1,500 random actions (bad quantities, negative prices, wrong places) never leave money or stock negative, fractional or NaN, and XP never decreases. Tested. |

## 10. Tuning notes and known limits

- **Rank 2 is anchored** to Marisol's delivery (the prologue tops XP up to 250 there), so the first
  ten minutes pace the same for everyone; the bots follow the brief's beats (store by ~4:00, brand by
  ~7:00, dusk ~8:00).
- **Where to turn next:** `ranks.ts` XP thresholds move every later milestone; `DEALS.xpPerDollar` and
  mission XP shift the expert–casual spread; dealer `traffic` and `REQUESTS.interval` move income.
- The bots model travel by district, not streets; there is no traffic, weather slowdown or getting
  lost. Set-pieces are a fixed duration with a fail/retry chance, so mission pacing assumes a player
  who clears each in one or two tries.
- Bots do not use the Breeding Cabinet, rival actions, event choices or turf wars, and they never
  start fights; those systems are covered by unit tests, not by the pacing numbers.
- Casual players finish the story a little past three hours; that is intended, and the pacing test
  asserts the typical player, not the slowest.
