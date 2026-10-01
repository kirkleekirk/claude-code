# Card Wars: Glowboard — dev folder

The game itself is the single self-contained file **`../glowboard.html`** (open it by double-click; works offline).
This folder holds the sources it is built from, the rule tests and the balance harness.

```
src/engine.js    /* ENGINE */  pure, deterministic rules + card data (no DOM)
src/ai.js        /* AI */      beam-search opponent that only sees Engine.redact(state)
src/art.js       procedural hologram art, portraits, landscape icons
src/render.js    canvas renderer (tabletop camera, felt landscapes, minis, effects)
src/audio.js     Web Audio SFX + procedural music
src/ui.js        match UI: event director, HUD, hand, input, targeting, AI driver
src/meta.js      saves, Table Tour, decks, collection, packs, settings, results
src/tutorial.js  BMO's scripted first match
src/main.js      boot + frame loop (+ #autoplay/#match/#tutorial test hooks)
```

| Command | What it does |
|---|---|
| `node build.js` | Inlines everything into `../glowboard.html` |
| `node test/engine.test.js` | Rule tests (extracts the ENGINE block from the built file) |
| `node test/balance.js --games 200 --mirror 100` | AI-vs-AI balance table, every faction pairing, both seats |
| `node test/difficulty.js 300` | Checks Hard > Normal > Easy |
| `node test/smoke.js 16` | Full matches through the real UI in headless Chromium; fails on any console error |
| `python3 tools/tune.py <id> atk=3 def=5` | Tweak a card's numbers |

`DESIGN.md` has the rules and card list; `NOTES.txt` is the assumptions block embedded at the top of the game file.
