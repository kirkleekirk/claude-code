# Aetherkin

A creature-binding game where **levelling up is the whole game**. Play it by opening
`dist/aetherkin.html` in any browser — it is one self-contained file, no server, no build
step, no network. Progress saves to `localStorage`.

Aetherkin is an original game in the creature-collector tradition. Every creature, aspect,
move and name here is its own; it uses no third-party characters or artwork.

---

## The idea

In most games of this kind, a level-up hands you a stat bump and occasionally a move you
did not choose. Here, a level-up pays out **Motes**, and you decide where they go.

Every kin reads a **Growth Lattice** — a constellation chart of nodes unique to its family.
There are twelve lattices across twenty-eight kin, and no two share a node. A lattice holds
five kinds of node:

| Node | What it does |
|---|---|
| **Move** | Adds a move to the kin's learned pool. Four can be equipped. |
| **Passive** | An always-on trait. Slots are scarce — 2, or 3 once evolved — so a full lattice always teaches more than a kin can wear. |
| **Ability** | An active battle command that spends **Focus** rather than dealing damage. Two slots. |
| **Growth** | A flat stat increase. |
| **Evolution** | **Evolution is a node you buy.** Each family forks two ways, and taking one branch permanently seals the other and everything below it. |

That last one is the piece that makes the lattice a real decision. An Emberkit is not
*going* to become anything at level 16 — it becomes **Pyrelisk** (Ember/Iron, armour that
answers back) or **Cinderfox** (Ember/Umbra, a fast knife) because you spent four Motes
saying so, and the other half of its chart goes dark for good.

Nothing is permanent-permanent: **Reforging** at a cost in aur returns every Mote, darkens
the lattice, and puts the kin back in its first shape with both branches open again.

### The maths

- One Mote per level, plus a bonus Mote every tenth level. Level 50 → **54 Motes**.
- Node costs rise by ring: 2 / 3 / 4 / 5 / 8.
- A full run down one branch of an evolving lattice costs about **57 Motes**.

You cannot finish a lattice. That is the point.

---

## Systems

**Battle** — turn-based, party of four, one kin on the field. Damage uses attacker Force or
Arcana against defender Guard or Ward, with stat stages, criticals, and thirteen aspects on
a full effectiveness chart (Mind cannot touch Umbra at all).

**Focus** — a per-battle resource that regenerates each turn and pays for Abilities. It is
what keeps Abilities distinct from moves rather than being more moves.

**Statuses** — Burn, Poison, Chill, Shock, Daze as major statuses (one at a time), plus
Bleed, Root and stacking Smolder alongside them.

**Fields** — seven battlefield states (Emberstorm, Downpour, Thunderhead, Verdant Bloom,
Whiteout, Eclipse, Tremorfield) that shift aspect damage and feed a number of passives.

**Rift Strain** — past turn 24 the rift starts closing on both sides, harder every turn. No
battle can be stalled out indefinitely by regeneration.

**Wild kin build their own lattices.** A level-30 wild is not a bag of base stats — it has
spent its Motes down one branch, evolved, and equipped what it learned. So do Wardens.

**Resonance** — each individual rolls 0–15 per stat when bound, so two of the same species
are not identical.

---

## Content

- **28 kin** across **12 families**, each family reading one lattice with two evolution branches (four families never change shape and have shorter lattices instead).
- **203 lattice nodes**, **96 moves**, **28 abilities**, **52 passives**.
- **13 aspects**, **5 routes**, **5 Wardens** fielding built teams.

Creatures are drawn, not stored: each species has a parametric descriptor (form, palette,
crest, eyes, seed) rendered to canvas as a silhouette filled with the same constellation of
nodes and hairlines the lattice is drawn with. A kin looks like its skill tree.

---

## Development

```
node build.mjs           # src/ -> dist/aetherkin.html and dist/aetherkin.artifact.html
node tools/selftest.mjs  # data integrity + battle-engine fuzzing (headless, no deps)
node tools/smoke.mjs     # plays the built game in Chromium (needs playwright)
node tools/smoke.mjs --shots   # ...and writes screenshots to tools/shots/
```

`selftest.mjs` loads the bundle in a `vm` sandbox and checks every lattice node resolves,
every branch is reachable, no content is orphaned, and then fires **every** move, ability
and passive through real battles before running 240 randomised fights looking for stalls,
crashes and out-of-range state.

### Layout

```
src/styles.css      the single committed dark theme
src/markup.html     the shell
src/js/00..01       utilities, aspects, stats, fields, statuses
src/js/02..06       moves, abilities, passives, species, lattices   <- the content
src/js/07..09       kin and levelling, battle engine, world and saving
src/js/10..14, 99   glyph renderer, UI, screens, boot
```

Files concatenate in filename order into one IIFE. `build.mjs` emits both a standalone
document and a body-only fragment.
