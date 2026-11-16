# HOTHOUSE — UI Specification

The interface is a flagship feature. A first-time player reads any screen in three seconds; a
veteran reaches any common action in two inputs. Everything here works with mouse + keyboard
**and** gamepad.

## 1. Sunset Glass — the visual language

Dark ink panels of frosted glass floating over a sunlit world. Cream type. One accent. Springy,
quick motion. Generous spacing. Nothing shouts except money.

### 1.1 Tokens (`src/ui/styles/tokens.css`)

```css
/* ink */      --ink-950:#0B0720; --ink-900:#140B33; --ink-800:#1F1450; --ink-700:#2B1D66; --dusk-600:#3A2A7A;
/* sunset */   --sunset-pink:#FF3D8B; --sunset-coral:#FF6B5E; --sunset-orange:#FF9A3C; --sun-gold:#FFD166;
/* cool */     --lagoon:#17E0C8;
/* accent */   --lime:#B8F54A;   /* money, growth, primary actions, selection */
/* text */     --cream:#FFF4E3; --cream-dim:rgba(255,244,227,.72); --cream-faint:rgba(255,244,227,.48);
/* semantic */ --good:var(--lime); --info:var(--lagoon); --warn:var(--sun-gold); --bad:#FF4D6A; --xp:var(--sun-gold);
/* heat */     --heat-1:#17E0C8; --heat-2:#FFD166; --heat-3:#FF9A3C; --heat-4:#FF5A4D; --heat-5:#FF2E4D; --siren-blue:#3D7BFF;
/* glass */    --glass:rgba(20,11,51,.74); --glass-strong:rgba(15,8,40,.9); --glass-edge:rgba(255,255,255,.14);
/* shape */    --r-chip:10px; --r-card:16px; --r-panel:24px; --r-pill:999px;
/* space */    --s1:.25rem; --s2:.5rem; --s3:.75rem; --s4:1rem; --s5:1.5rem; --s6:2rem; --s7:3rem; --s8:4rem;
/* motion */   --t-fast:120ms; --t-med:180ms; --t-slow:240ms; --spring:cubic-bezier(.2,1.25,.3,1); --ease:cubic-bezier(.2,.7,.2,1);
/* elevation */--shadow-panel:0 24px 60px rgba(8,4,30,.5); --shadow-pop:0 10px 30px rgba(8,4,30,.45);
```

- **One accent rule.** Lime is *the* accent on every interactive screen: primary action, selection,
  money. Other hues appear only as data semantics (heat ramp, lagoon for info, gold for XP and
  stars, coral-red for danger). Exceptions with their own accent: Busted (siren red/blue), the
  Notebook (cream paper, ink, pink stickers), Photo Mode (neutral).
- **Glass.** `--glass` fill, `backdrop-filter: blur(18px) saturate(1.25)`, 1 px inner highlight
  (`inset 0 1px 0 var(--glass-edge)`), deep soft shadow, faint static grain. With *UI blur* off or
  *High contrast* on, panels switch to `--glass-strong` and gain a 1 px cream-faint border.
- **Text over the world** (HUD) always sits on a glass chip or carries a soft ink shadow; contrast
  is ≥ 4.5:1 against the brightest sky.

### 1.2 Type

| Role | Face | Size / weight | Use |
|---|---|---|---|
| Wordmark, title cards | Fraunces italic 900, SOFT 100, WONK 1 | 4.5–7rem | logo, "Halcyon Bay · 6:40 PM", Busted |
| Screen titles | Fraunces 700, SOFT 60 | 1.875–2.75rem | app headers, modals |
| Section titles | Figtree 700 | 1.25rem | cards, groups |
| Body | Figtree 500 | 1rem (min .875rem) | everything else |
| Labels | Figtree 700, +4 % tracking, uppercase | .8125rem at ≥ 3:1 large-text rules only on chips | chips, tabs |
| Money and stats | Figtree 800, `tabular-nums` | contextual | all numerals |
| Neon accent | Sacramento | sparingly | Perfect!, logo tagline, radio card |
| Ofelia's hand | Caveat 600 | Notebook and margin-note hints only | diegetic |

Root size: `16px × uiScale × clamp(.9, viewportHeight/1080, 2)`; `uiScale` 80–150 %. The smallest
text token is `.875rem` (14 px at 1080p / 100 %). The dyslexia option swaps both families to
OpenDyslexic.

### 1.3 Motion and sound

- 120–240 ms, springy; lists stagger 24 ms; nothing repeated exceeds 400 ms. Panels rise 12 px and
  fade; numbers count up with green/red deltas ("+$420 · Heat +1").
- *Reduced motion*: fades only, no parallax, no screen shake, counts jump.
- Every component has a UI sound from one family: focus tick, confirm, back, toggle, slider detent,
  tab, error thud, toast, cash roll, rank-up fanfare.

### 1.4 Icons

Custom inline SVG set, 24 px grid, 2 px stroke, round caps and joins, `currentColor`; ≥ 80 icons
shared by HUD, phone, map and world markers (`src/ui/icons/`). Icons never appear without a label
or tooltip.

## 2. Interaction model

- **Focus.** One focused element per scope, shown with a 2 px lime ring and 2 px ink gap whenever
  the last input was keyboard or gamepad. Spatial navigation picks the nearest focusable in the
  pressed direction. Scopes stack (screen → modal → menu); closing restores the previous focus.
  Opening a screen focuses its primary action. Hover highlights but does not steal focus.
- **Universal keys.** Confirm (Enter / A) · Back (Esc / B) · Tabs (Q,E / LB,RB) · Details (I / Y) ·
  Secondary (R / X). Back always goes one level up and never loses work.
- **Glyphs.** Prompts show the live binding for the device last used: keycaps for keyboard,
  Xbox / PlayStation / Switch button art for pads (auto-detected, overridable).
- **Hold vs tap.** Tap for everything; hold (ring fills, 0.6 s) only for destructive or risky
  actions. *Hold → toggle* is available for every hold.
- **Undo over confirm.** Reversible actions show an Undo toast; modals confirm only destructive ones.
- **Tooltips.** Rich on hover; the same content via Details on a pad.
- **States.** Every component defines default, hover, focus, active, disabled and loading. Every
  list defines empty, loading, error and **locked** ("Unlocks at Rank 4 · Sells to Deco Row").

## 3. Components (`src/ui/components/`)

Button (primary · secondary · ghost · danger) · IconButton · Toggle · Slider · Stepper · Tabs ·
Segmented · Card · ListRow · Chip · Badge · Meter · RadialProgress · Toast · Tooltip · Modal ·
Drawer · ContextMenu · SearchField · KeyGlyph · PadGlyph · QuickWheel · Stars · MoneyText (count-up)
· Portrait · EffectChip · EmptyState · LockedState · HoldRing · ScrollArea (styled scrollbars).

## 4. HUD

```
┌────────────────────────────────────────────────────────────────────────┐
│ ◈ Objective banner                                   6:40 PM ☀  $1,240 │
│   toast feed (max 3)                                 Heat ◜◜◜◜◜        │
│                                                                        │
│                                                                        │
│                        [E] Harvest Abuela's Blush                      │
│ ┌──────┐                                                               │
│ │ mini │  Go-Bag: ▣×4 ▣×2                      72 mph  Flow ▰▰▰▱  ♪ FM │
│ │ map  │                                                               │
│ └──────┘                                                               │
└────────────────────────────────────────────────────────────────────────┘
```

- **Top right:** clock, weather icon, cash (dirty; clean on hover/Details) with animated deltas.
- **Heat gauge:** a half-sunburst of five rays; rays light teal → gold → orange → red and the whole
  dial alternates siren red/blue at 5. Number and label accompany color.
- **Minimap (bottom left):** rounded square, north-up or heading-up, district tints, roads,
  customers, properties, police cones, the glowing route; zoom follows speed.
- **Objective banner (top left):** one line, icon, distance; collapses to an icon when idle.
- **Prompt (lower centre):** glyph + verb + object. One prompt at a time.
- **Go-Bag strip:** up to five product chips with counts.
- **Vehicle cluster (bottom right):** speed, Flow meter, radio *Now Playing* card (fades after 4 s).
- **Toast feed:** texts, events, deltas; max three; newest on top; never covers the prompt.
- The HUD declutters itself (elements fade when irrelevant), has scale and opacity settings, and
  **Clean Mode** hides it entirely.

## 5. The Phone

A sun-faded burner with a cracked corner. Opens with Tab / D-pad up, slides up from the lower
right, the world slows to 20 % and softly blurs (setting: pause / slow / real-time).

- **Frame:** status bar (clock, weather, heat pip) · header (back, title, search) · content
  (scrolls) · bottom nav (Home · Messages · Map · Empire · Products) with badges.
- **Home:** *Next Best Action* card, app grid, global search (customers, products, places, help).
- The phone remembers the last app and scroll position. The Map opens in landscape (the phone
  turns and grows to fill most of the screen).

| App | Job | Primary action | Empty / locked state |
|---|---|---|---|
| Messages | threads and requests | Accept (chips: Accept · Counter · Decline) | "Nobody's texting yet. Hand out a free sample." |
| Map | navigate | Set route | — |
| Empire | Today, Operations, Next Best Action, Goals, Upgrades, Territory, Forecasts | context | per-section locks with rank |
| Products | Strain Dex + Recipe Notebook | Make more | "Mix something at the workbench." |
| Crew | roster, board, hiring, morale | Auto-assign | "First hire unlocks at Rank 3." |
| Market | suppliers, orders, subscriptions | Order | closed-hours note with next opening |
| Garage | call a car, customize | Bring it round | "Only the Gator, for now." |
| Bank | dirty/clean, laundering, debt | Pay Vale | fronts locked until Rank 5 |
| Photos | gallery | Open | "Press F2 anywhere to take one." |
| Help | glossary, replay hints | — | — |
| Settings | everything in §7 | — | — |

## 6. Screens and overlays

| Screen | Layout | Primary action |
|---|---|---|
| Click-to-start | wordmark, one line, pulse | Start (unlocks audio) |
| Loading | art card, real progress bar, rotating hint cards | — |
| Main menu | left-aligned list over the live world; Continue shows thumbnail, playtime, cash, place | Continue / New Game |
| New Game | six looks (3D preview), outfit palette, difficulty in plain words | Start |
| Title card | "Halcyon Bay · 6:40 PM", lens-flare sweep, 2.5 s, skippable | — |
| Pause | Resume (focused), Map, Phone, Save, Settings, Controls, Quit to menu | Resume |
| Save / Load | three slots + autosave: thumbnail, rank, cash, place, playtime | Save / Load |
| Settings | tabs: Graphics · Audio · Controls · Gameplay · Accessibility; schema-driven rows with live preview | — |
| Dialogue | bottom card: portrait, name, typewriter line, choice chips, Skip, Log | Continue |
| Handoff | product pick (best match pre-selected) → haggle slider under the mood meter | Offer |
| Snip chain | world-space rings on the plant; combo counter | Snip |
| Mixing Station | ingredient tray, slots, outcome preview with "?" for unknowns | Cook it |
| Notebook | paper spread: doodle, effects, stars, Ofelia's note, stickers; rules appendix | Cook again |
| Brand studio | name, logo builder, packaging, turntable | Make it official |
| Build Mode | bottom shelf by category with search, ghost, cost, rotate, Undo/Redo, Flow Score | Place |
| Shift Report | digest card: earnings, deals, close calls, crew notes | Collect |
| Rank up | banner, unlock cards (max 3), one line from Ofelia | Nice |
| Busted / Wasted | siren wash, itemized cost, Sy quip | Retry |
| Quick Wheel | radial: Call car · Radio · Go-Bag · Wait · Photo · Map | release to choose |
| Photo Mode | free camera, FOV, DOF, exposure, time of day, grades (Golden · Noir · Neon), hide UI/characters, watermark | Capture |
| Credits | scrolling, skippable | Back |

## 7. Settings (schema in `src/save/settingsSchema.ts`)

- **Graphics:** preset, resolution scale, dynamic resolution, shadows, reflections, AO, effects,
  FPS cap, FOV, fullscreen, FPS counter, UI blur.
- **Audio:** master, music/radio, SFX, ambience, UI, barks; default station; mute on blur.
- **Controls:** rebinding (keyboard, gamepad), sensitivities, invert Y, vibration, glyph style.
- **Gameplay:** difficulty, aim assist, driving assists (traction, steering, auto-countersteer),
  auto-tend, easy timing / auto-success, phone time behaviour, hold → toggle.
- **Accessibility:** UI scale, subtitle size and background, colorblind-safe palette, high-contrast
  text, reduced motion, reduce flashing, screen-shake amount, dyslexia-friendly font, HUD scale and
  opacity.

## 8. Onboarding

One contextual hint at a time, dismissible, never repeated once the action is performed, never a
blocking modal. Ofelia's margin notes (Caveat on a paper slip) carry the mentor voice. Help holds a
glossary and can replay any hint.

## 9. Layout rules and verification

- Rem-based layout; 4 % safe margins; 16:9, 16:10 and 21:9 (HUD anchors to a centred 16:9-ish safe
  frame on ultrawide, menus stay left-aligned).
- No fixed heights for text containers; long strings wrap or truncate with a tooltip; +35 % length
  budget for localization.
- **Checks (`qa/layout.mjs`):** every screen at 1280×720, 1920×1080, 2560×1440, 3440×1440 and at
  80 / 100 / 150 % UI scale: no element overflows its parent or the viewport, no clipped text, no
  layout shift on open, contrast ≥ 4.5:1 (≥ 3:1 large), hit targets ≥ 40 px, body ≥ 14 px at 1080p.
- **Fresh-Eyes test** and a **gamepad-only walkthrough** are logged in `PROGRESS.md` each milestone.
