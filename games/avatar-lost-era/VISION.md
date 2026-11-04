# Avatar: Legends of the Lost Era — Design Vision

An unofficial, fan-made open-world survival RPG set in the world of *Avatar: The Last Airbender*.
This document is the long-range plan. The current build is **Chapter One** — the foundation
everything else grows from.

---

## 1. The setting: why "the Lost Era"

The game takes place **about 2,950 years before the Hundred Year War** — roughly 7,000 years after
Avatar Wan closed the spirit portals, and long before any Avatar the show names except Wan.
The show is nearly silent about this stretch of history, so we can tell a new story without
contradicting it. Every choice below is meant to follow from what the show establishes.

| Fact from the show | What it implies for this era (our design) |
|---|---|
| Wan closed the portals ~10,000 years before Korra; spirits rarely cross over afterwards. | Spirits are rumours. Any spirit that *does* appear is a big event — the main story hook. |
| The Avatar Cycle runs Fire → Air → Water → Earth, and Avatars learn in that order. | Your predecessor is always the element before yours. Your second element is always the next one. The scroll and story enforce this. |
| Avatars struggle most with the element opposite their own (Aang with earth). | The opposite element is sealed until you awaken another, and costs ×2.5. Adjacent elements cost ×1.5. |
| The first benders learned from dragons, badgermoles, the Moon and sky bison. | Each element is *awakened* at a trace of its original teacher: the Sun Warrior flame, the badgermole's cave, the Moon Pool, Sky Bison Peak. |
| Firebending is drawn from the sun and breath; it weakens at night and during eclipses. | Fire +15% by day, −20% by night. Inner Fire and Breath of Fire are about warmth, as with Iroh. |
| Waterbending is drawn from the Moon and needs a source; it is strongest under a full moon. | Water techniques need a nearby source or a waterskin charge; +20% at night, +50% at full moon (8-day lunar cycle). |
| Earthbenders need contact with the ground; Toph (and badgermoles) feel vibrations. | No earthbending mid-air. Seismic Sense is a late, badgermole-taught skill. |
| Metalbending is invented by Toph; the air scooter by Aang; bloodbending is forbidden. | Shown on the scroll as "unknown to this era" or "forbidden" — visible but locked forever in this lifetime. |
| Air Nomads are vegetarian and earn arrow tattoos when they master airbending. | Eating meat as an Air Nomad weighs on your spirit (−chi). Arrows are a mastery reward, not a starting look. |
| Avatars are traditionally told at sixteen; the Air Nomads use the test of a thousand toys. | Each homeland reveals you differently: toys, Fire Sages, Earth Sages, the Moon. |
| The Sun Warriors' civilisation is ancient by Aang's time. | Here it is still alive, but secretive; you meet its ruins first and its people later. |
| *Daofei* (outlaws) roam the Earth Kingdom roads in the Kyoshi novels. | The first human enemies are daofei — and you can choose to spare them. |
| Sozin's Comet is a recurring comet that predates Sozin. | **The comet will pass during this era** — an unnamed, terrifying "fire star" event late in the story. |

### Previous Avatars (invented for this era)
Fire: **Kazan** · Air: **Tenpa** · Water: **Siku** · Earth: **Guo-Lin**. You succeed whichever one
comes before your element. They appear in visions, and later as allies in the Avatar State.

---

## 2. Story outline

### Chapter One — The Valley of Four Winds ✅ (this build)
Arrive in Tienhai, a frontier valley where all four peoples trade. Learn to survive, drive off the
daofei of Yao the Breaker, awaken your second element at an ancient teacher's shrine, and meet your
past life beneath the Elder Banyan. He warns that *something is crossing over in the far west*, and
the daofei map shows a spiral-marked island past the Great Divide.

### Chapter Two — The Great Divide
- Cross the canyon (canyon crawler packs, the **Crawler Matriarch** boss, feuding tribes needing a guide).
- Meet the **Order of the Closed Door**: scholars who believe the spirit portals should be reopened,
  and who paid the daofei to watch for you. Morally grey; their leader is a recurring rival.
- Learn your third element (opposite elements still resist).

### Chapter Three — The Spiral Isle
- A spirit-touched island where the human and spirit worlds overlap: shifting terrain, lost villagers.
- First spirit-world excursion (meditation becomes travel).
- **Koh the Face Stealer** encounter: a stealth sequence where showing emotion (panic-running,
  attacking) costs you your face — the lesson from the show turned into gameplay.
- The antagonist revealed: **Mo Ying, the Drowned Tide**, a spirit of forgotten memories leaking
  through a tear Wan's seal never fully closed.

### Chapter Four — The Four Teachers, Truly
Travel to the real homes of the original teachers:
- **Fire Nation isles** — the living Sun Warriors, the masters **Ran and Shaw**, the Dancing Dragon trial (a rhythm/form duel, not a fight), and lightning from a Fire Sage who distrusts you.
- **The North Pole** — the Moon and Ocean spirits (Tui and La), healing mastery, Octopus Form.
- **The badgermole tunnels under Omashu** — Seismic Sense; the legend of Oma and Shu as a playable memory.
- **An Air Temple** — glider staff crafting and flight, arrow tattoos for air mastery.

### Chapter Five — The Fire Star
The recurring comet arrives. Firebenders across the world become dangerously strong; a rogue Fire
Sage faction tries to use it to burn open a portal. The Avatar State becomes available in a
controlled trial with all four past lives.

### Finale — Bridge or Seal
At the Spiral Isle, choose whether to seal the tear (protect humans, abandon the spirits in it) or
stabilise it (a dangerous bridge). The ending echoes forward: it explains why, in the show's time,
the world has nearly forgotten the spirits — or why some still remember.

---

## 3. Bosses (planned; none in Chapter One)
| Boss | Where | Mechanic |
|---|---|---|
| Yao the Breaker (rematch) | Old east road | Earthbending duel: break his armour of stone with water or air before damage lands. |
| Platypus-Bear Mother | River delta | Protects eggs; non-lethal resolution possible with fire (scare) or food (calm). |
| Crawler Matriarch | Great Divide | Pack fight on narrow ledges; earthbending reshapes the arena. |
| The Hollow Fire Sage | Fire isles, comet night | Escalating lightning; redirect it (requires learning the technique first). |
| Koh the Face Stealer | Spirit world | Stealth / composure check, not combat. |
| Mo Ying, the Drowned Tide | Spiral Isle | Multi-phase: each phase favours a different element; the Avatar State finishes it. |

---

## 4. Systems roadmap

**Bending & combat**
- More techniques per element (≈12 each), plus element **combos** (fire + air firestorm, water + earth mud trap, earth + fire magma — era-locked as legendary).
- Blocking, parrying and redirection; lock-on targeting; combo strings with the stances the build already animates.
- **VR gesture bending**: perform the real forms with tracked hands or controllers (punch for a fire jab, lift both hands for a rock, push for a wave). Button casting stays as an accessible option.
- The Avatar State: a meter filled by meditation and danger, gated by story.

**Survival & world**
- Seasons and weather (winter solstice events, storms that strengthen airbending, rain that refills waterskins).
- Cooking recipes (Air Nomad fruit pies, Water Tribe sea prunes, Earth Kingdom dumplings), clothing for warmth.
- Earthbent homesteads: raise a permanent stone home and expand it.
- Mounts and companions: tame an ostrich-horse, then earn a sky bison companion (flight across the map).
- Reputation with each nation; the daofei you spared can return as allies or enemies.

**Character**
- Full customisation: faces, scars, markings, more hair, outfits as found or crafted items, arrow tattoos and other mastery marks.
- Companions with their own small quest lines (a Sun Warrior scout, a Water Tribe healer, a reformed daofei).

**World map** (each region about the size of today's valley)
Great Divide → Si Wong Desert edge (sandbenders, buzzard-wasps) → Foggy Swamp → Omashu → Ba Sing Se outskirts → Fire Nation isles → North & South Poles → an Air Temple → Spirit World.

---

## 5. Technical direction
- Stays a **single self-contained HTML file** for players (A-Frame 1.6, WebXR), assembled from `src/` by `build.sh`.
- Regions stream in as separate world chunks as the map grows; the current heightfield, collider grid and instancing approach scale to that.
- Mobile budget: about 400 draw calls, under 800k triangles, a 1.5× pixel-ratio cap. Quest-class standalone VR is the reference headset.
- Every new system lands with tests in `tests/suite.js`; the visual tour (`tests/tour.js`) gets a shot for every new effect, creature and place.
