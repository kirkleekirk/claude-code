# HOTHOUSE — Art Bible

## 1. Look statement

**Golden-hour neon-noir in stylized realism.** A real Gulf-coast city as a high-end animated film
would paint it: bold simple forms, one consistent level of detail, sophisticated exaggerated light.
Style comes from **color, shape and light** — never from outlines, noise or retro filters.

Five tests for every frame:

1. **Squint test.** Three clear values: a light mass, a mid mass, a dark mass.
2. **Shadow test.** No shadow is grey. Shadows lean violet-indigo; light leans gold.
3. **Accent test.** One saturated accent owns the frame (a neon sign, a sunset band, tail lights).
4. **Silhouette test.** Palms, signs, cranes and rooftops read as cut paper against the sky.
5. **Thumbnail test.** At 160 px wide you can tell the district and the time of day.

## 2. Signature motifs

| Motif | Rule | Where it lives in code |
|---|---|---|
| **Violet shadows, gold light** | sun ≈ 2600–5200 K by elevation; sky fill pushed to violet; grade splits tones (shadows `#3B1E7A`-ward, highlights `#FFD9A0`-ward) | `render/env`, `render/post/grade` |
| **The Grow-Glow** | owned grow rooms leak magenta-violet (`#E040FF` → `#7A3CFF`) through glass and onto the street; brightness is the Visibility stat | `render/fx/growGlow` |
| **Wet-neon streets** | after rain, asphalt roughness drops, puddle masks open, the planar mirror shows signs and tail lights | `render/materials/wet`, `render/reflection` |
| **Chrome starbursts** | HDR speculars on paint, glass and water feed bloom plus a 6-point star kernel | `render/post/flare` |
| **Kitsch-glam Florida** | flamingo signs, fiberglass gator, pastel motels, hand-painted storefronts, cursive neon | `world/props`, `world/signs` |
| **Heat shimmer and pollen** | midday refraction near the horizon; drifting motes in light shafts at low sun | `render/post/heat`, `render/fx/motes` |
| **Phone-cam culture** | bystanders raise phones at chaos; screens glow; photo flashes | `ai/peds`, `render/fx` |

## 3. Time of day (art-directed keyframes)

Sun azimuth swings east → south → **due west at sunset** (over the bay). Elevation is keyed to the
clock, not to astronomy. Values are the starting keys in `render/env/todKeys.ts` and are tuned live.

| Key | Clock | Sun elev. | Zenith | Mid sky | Horizon | Sun / key light | Fill (sky ambient) | Fog / haze | Grade note |
|---|---|---|---|---|---|---|---|---|---|
| Night | 00:00 | moon 35° | `#070A24` | `#0E1240` | `#1D1650` | moon `#9FB4FF` ×0.25 | `#2A2F7A` | `#141042` | deep indigo, neon saturation +20 % |
| Dawn | 06:15 | 3° | `#5B6FB8` | `#B7A1E0` | `#FFC9A3` | `#FFB98A` ×1.6 | `#8E86D8` | `#C9B4E0` mist | lifted blacks, soft contrast |
| Morning | 09:00 | 35° | `#3D8FE0` | `#7CC4F2` | `#CFEFF7` | `#FFF1DC` ×3.2 | `#9CC8FF` | `#CFE8F5` | crisp, clean whites, aqua bias |
| Midday | 13:00 | 68° | `#2F7FDB` | `#6DB8F0` | `#E3F1F5` | `#FFFBF0` ×3.8 | `#B9D8FF` | `#E6F0F2` | bleached, slightly desaturated |
| **Golden** | 17:30 | 14° | `#3B5FB0` | `#8C74C4` | `#FF9A3C` | `#FFB45A` ×3.4 | `#7C6AE0` | `#FFB27A` sun-side, `#9C7FD0` away | long violet shadows, warm bloom |
| Late gold | 18:40 | 6° | `#34489C` | `#B05FB0` | `#FF7A45` | `#FF8A3A` ×2.6 | `#6E58D0` | `#FF9060` / `#8A62C0` | the title-card look |
| Dusk | 19:45 | −4° | `#1B2A6B` | `#C2459B` | `#FF6B5E` | afterglow `#FF6FA0` ×0.6 | `#4A3FA8` | `#7A3F9A` | magenta → teal, neon ignites |
| Blue hour | 20:30 | −12° | `#0D1440` | `#27307F` | `#3C2E86` | — | `#343A90` | `#231A5C` | teal-indigo, signs dominate |
| Storm | any | — | `#2A3836` | `#44544C` | `#5C6A5E` | `#C9D6C8` ×0.9 | `#5A6C68` | `#3E4C48` | bruised green-grey, shafts, lightning |

Rules: horizon haze always shifts distant geometry toward blue-violet; the anti-solar horizon at
golden hour carries a pink belt (`#F6A3B5`); the sky is dithered to kill banding.

## 4. Palettes

**Global accents:** sunset pink `#FF3D8B` · coral `#FF6B5E` · tangerine `#FF9A3C` · sun gold
`#FFD166` · lagoon `#17E0C8` · hothouse lime `#B8F54A` · grow magenta `#E040FF` · cream `#FFF4E3`.

| District | Walls | Trim / accents | Roofs | Signage and neon |
|---|---|---|---|---|
| Palmetto Flats | `#F6D8C2` `#CFE8D8` `#F9E7A8` `#D9D2F0` `#F4B8A8` | white, `#3E8E7E` shutters | terracotta `#C96A4A`, grey shingle | hand-painted, sun-faded |
| Neon Strand | `#FFE9D0` `#8FE3D8` `#FFB3C8` `#FFD47A` | `#17E0C8`, `#FF3D8B` | flat, striped awnings | dense cursive neon, bulbs |
| Deco Row | `#FBE3EE` `#D5F1EC` `#FFF1C9` `#E3DBFA` `#FFD9C2` | chrome, `#2CC7B8`, `#FF7FAE` eyebrows and fins | flat with parapets, rooftop pools | vertical blade signs |
| Crown Point | glass `#7FB6D8` → `#2B3F78`, stone `#D8D2CC` | brushed steel | mech penthouses, helipads | LED billboards, cool white |
| Cobalt Harbor | `#3F6FA8` `#B24A3A` `#D8B23A` corrugate, concrete | hazard yellow, rust | saw-tooth | stencil type, sodium `#FFB05A` |
| The Sawgrass | weathered wood `#8A7A66` `#5E6E5A`, tin | faded turquoise | rusty tin | painted boards, bug-zapper violet |
| Isla Dorada | white `#FFFAF2`, coral stone `#F2D6C2` | brass, `#0E7C86` | barrel tile `#D9825A` | discreet warm white, pool cyan |

## 5. Shape language

- **Buildings:** big clean masses first, then one layer of readable detail (window insets, eyebrows,
  balconies, parapets, awnings, rooftop kit). 30+ archetypes, 12 facade styles: Streamline Deco ·
  Tropical Deco · Mediterranean Revival · mid-century motel · bungalow · ranch · stilt house ·
  strip-mall · glass tower · stone civic · corrugated warehouse · beach shack.
- **Windows** are interior-mapped: daytime sky reflections, at night varied warm/cool rooms with
  about 40 % lit, flicker of TV blue, the odd grow-magenta.
- **Roads:** warm dark asphalt (`#3A3540`), cream lane paint, coral curbs on the Strand, worn
  centre lines, oil stains and cracks at low contrast. Never pure black, never noisy.
- **Vegetation:** six palms (coconut, royal, sabal, date, areca clump, foxtail), sea grape,
  bougainvillea and hibiscus hedges, mangroves with prop roots, sawgrass clumps, lawn. Fronds are
  cut-paper shapes with gold rim light; everything sways on three wind frequencies.
- **Props (80+):** lawn flamingos, bus shelters, vending machines, beach umbrellas, loungers,
  lifeguard towers, surf racks, newspaper boxes, hydrants, mailboxes, bins, benches, planters,
  bollards, traffic lights, street lamps (3 styles), power poles, billboards, cones, barriers,
  pallets, containers, forklifts, boats on trailers, buoys, crab traps, ice chests, satellite
  dishes, AC units, water towers, tiki torches, string lights …
- **Signage humor:** every sign is written. Tone is affectionate satire: *Sod Almighty*, *The Leaky
  Tiki*, *Emotional Support Bait*, Sy Pinkerton billboards, Zenith Wellness ads ("Breathe. Buy.").

## 6. Characters

Stylized adults, slightly elongated, smooth simplified forms, soft rim light, matte materials.
Variation: 12 body builds × 20 skin tones × 40 hair or hats × 60 outfits × accessories (sunglasses,
phones, bags, skates). Faces are simple and expressive (blink, brows, mouth). Named cast have fixed
seeds and a signature item (Kiki's skates and visor, Sy's pink suit, Vale's linen and silver hair,
Montrose's ring-light halo). Dialogue portraits are flat vector illustrations from the same seed.

## 7. Vehicles (fictional makes)

Clear-coat paint, dark glass, chrome trim, emissive lamps, readable silhouettes.

| Vehicle | Class | Character |
|---|---|---|
| **Marsh Gator '84** | pickup (starter, sun-faded teal) | floaty, tough, lovable |
| **Corsair Hammerhead** | muscle coupe | power oversteer |
| **Kaido Sprint-R** | tuner | razor turn-in |
| **Bellamar Palmera** | convertible | cruiser, golden-hour hero |
| **Santos Elegante** | lowrider | hydraulic bounce |
| **Otter Loaf** | van | top-heavy hauler, hidden compartments |
| **Monarch Grandeza** | SUV | planted, heavy |
| **Aurelio Tramonto** | exotic | fast, twitchy, loud |
| **Piccola Zest** | scooter | nimble, silly |
| **Ronin 650** | motorbike | leans, quick |
| **Corsair Marshal** | police cruiser | pursuit AI |
| **Brisa / Sunny Cab / box truck** | traffic fill | variety |
| **Marlin Skipjack** · **Skeeter airboat** | water | planing · swamp slides |

## 8. Effects language

Tire smoke is warm white turning lilac in shade. Sparks are gold. Rain is long, thin, lit by signs.
Lightning lights the whole scene for two frames (reduced by the flash setting). Money pops are
lime; heat is the teal → gold → orange → `#FF2E4D` ramp, then siren red/blue. Police lights wash
walls. Fireworks are pink, lagoon and gold.

## 9. UI alignment

The interface is *Sunset Glass* (see `UI_SPEC.md`): ink-violet frosted panels, cream text, one
accent per screen, lime for money and primary actions. Display type **Fraunces** (soft, slightly
wonky italic for titles), UI type **Figtree** with tabular numerals, neon accent **Sacramento**,
Ofelia's handwriting **Caveat** (Notebook only). In-world signs add Limelight, Alfa Slab One,
Pacifico, Bungee, Monoton, Saira Stencil One and Knewave for variety.

## 10. Hero shots (captured and critiqued every milestone)

1. Causeway at golden hour with the Palmera. 2. Neon boardwalk at dusk. 3. Wet Crown Point at
night. 4. Sawgrass at dawn with mist and an airboat. 5. Thunderstorm over the bay. 6. Greenhouse
interior at night in grow-light. 7. Police chase under a helicopter searchlight. 8. Main-menu
panorama. 9. City skyline from Isla Dorada at dusk. 10. Pool-lit mansion party.

## 11. Guardrails

No outline shaders. No noisy random textures. No low-res retro look. No flat default lighting,
interiors included. No neutral grey shadows. No pure black, no pure white. No unlit default
materials. No lorem ipsum. Nothing resembles a real brand, a real car, or another game's map.
