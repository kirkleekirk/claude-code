# Decisions

Calls made where the brief was silent or self-contradictory. Newest at the bottom.

1. **Project lives in `ashfall-kingpin/`.** The repository root already holds an unrelated project with its
   own README; the game is a self-contained subfolder with its own `package.json` (no dependencies).
2. **Rotated footprints for Saint Verity (26x32) and The Foundry (32x40).** At the brief's anchors and
   size classes, New Haven's XL 52x40 footprint overlaps both neighbours. A size class keeps its area but
   may be rotated; with rotation every anchor stays within the allowed ±4 tiles (validator-enforced).
3. **Size class = footprint, either orientation.** The main street runs along whichever axis the gate
   sits on; the brief does not say which dimension is "along".
4. **1-wide service lane instead of open setbacks against walls.** Buildings may back directly onto the
   lane ring; the 1-tile setback applies on the street side and between buildings. Without this the
   S/M templates cannot fit their civic buildings and business lots.
5. **Watchtowers occupy the wall corner tile** and are drawn as tall sprites, so the lane ring stays
   continuous.
6. **Business lots are real buildings in each settlement** ("Vacant Lot", FOR SALE sign) that become
   your front when bought; priority is civic buildings > lots > barracks > houses.
7. **Camps use a compact palisade layout** (boss hall with front + back door, two side buildings on a
   yard). The settlement template cannot fit three buildings into 16x12 with setbacks.
8. **Pale Hand gate faces south** onto the Drowned Chapel track; Harbor Nine sits directly north of it.
9. **Rail spur exits the Hollow's south wall** to the map edge (east would cut through Rustjaw Fort).
