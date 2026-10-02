# Card Wars — dev folder

The game itself is the single self-contained file **`../cardwars.html`** (open it by double-click; works offline).
This folder holds the sources it is built from, the rule tests and the balance harness.

```
src/engine.js    /* ENGINE */   pure, deterministic rules + card data (no DOM)
src/ai.js        /* AI */       beam-search opponent that only sees Engine.redact(state)
src/gl.js        /* GL */       tiny WebGL toolkit (matrices, programs, buffers, context-loss restore)
src/models.js    /* MODELS */   procedural low-poly models for every creature, building, prop and character
src/scene.js     /* SCENE */    the 3D table: board, holograms, table cards, camera, picking, effects, card art
src/art.js       portraits and landscape icons for the 2D UI
src/audio.js     Web Audio SFX + procedural music
src/ui.js        match UI: event director, HUD, hand, phase prompts, input, targeting, AI driver
src/meta.js      saves, Table Tour, decks, collection, packs, settings, results
src/tutorial.js  Jake explains the rules (scripted first match replaying the episode)
src/main.js      boot + frame loop (+ #autoplay/#match/#setup/#tutorial test hooks)
```

| Command | What it does |
|---|---|
| `node build.js` | Inlines everything into `../cardwars.html` |
| `node test/engine.test.js` | Rule tests (extracts the ENGINE block from the built file) |
| `node test/balance.js --games 400 --mirror 100 --nodes 100` | AI-vs-AI balance table: every faction pairing, 200 games in each seat (clean AI) |
| `node test/difficulty.js 300` | Checks Hard > Normal > Easy |
| `node test/smoke.js 6` | Full matches through the real UI in headless Chromium; fails on any console error |
| `node tools/cardstats.js --games 40` | Per-card win rates (what to tune) |
| `node tools/designdoc.js` | Regenerates the card list in `DESIGN.md` |
| `python3 tools/tune.py <id> atk=3 def=5` | Tweak a card's numbers |
| `tools/view3d.html` | Model viewer: every hologram on a sample board |

`DESIGN.md` has the rules and card list; `NOTES.txt` is the assumptions block embedded at the top of the game file.
