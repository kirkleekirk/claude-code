# `src/ui` — integration notes

The contract is `src/ui/api.ts`; this page is the short version for wiring it into the game.

## Mount and frame loop

```ts
import { createUi } from '@/ui';
import { openPhotoStore } from '@/save/photos';

const ui = createUi(document.getElementById('ui')!, {
  input, settings, saves, actions,          // Input, Settings, SaveManager, GameActions
  sound: audio,                             // AudioApi satisfies { ui(sound) }: menu cues
  blip: (voice, emphasis) => audio.blip(voice, emphasis), // dialogue typewriter
  photos: await openPhotoStore(),           // falls back to memory without IndexedDB
  applyGraphicsPreset: (p) => applyPreset(settings, p),   // render/quality.ts
  onUserGesture: () => audio.unlock(),      // runs inside click-to-start and menu activations
  version: __BUILD_TIME__,
});

// every frame
input.beginFrame(dtReal);
const uiOwnsInput = ui.wantsInput.value;   // skip gameplay input while true
const timeScale = ui.pausesWorld.value ? 0 : 1;
// … game update …
ui.update(dtReal);                          // navigation, typewriters, count-ups, toasts, hints
input.endFrame();
```

`createUi` restores saved key bindings (`settings.blob('bindings')`), applies every visual setting
live (UI scale, contrast, motion, dyslexia font, colour-blind palette, flashing, blur, subtitles,
HUD scale/opacity, button-icon style), and registers the built-in phone apps (Settings, Photos, Help).

## Start-up flow

```ts
ui.showFrontend('clickToStart');
ui.setLoading(0.4, 'Pouring the concrete');    // real progress, 0–1
await ui.waitForStart();                       // loading reached 1 and the player clicked / pressed
ui.showFrontend('mainMenu');                   // menu calls actions.newGame / continueGame / loadSlot
// when play begins:
ui.showFrontend('none');
ui.hud.visible.value = true;
await ui.titleCard({ title: 'Palmetto Flats', subtitle: 'Day 1' });
```

## What the game provides

| Interface | Where | Used for |
| --- | --- | --- |
| `GameActions` | `src/game/actions.ts` | every menu action (new / continue / load / save / delete / export / import, pause, resume, retry, quit, fullscreen, waypoint, travel, photo/build mode, benchmark) |
| `UiSoundSink` | `deps.sound` | `UiSound` cues: focus, confirm, back, tab, toggles, slider, error, phone, toast, hint, hold, wheel ticks |
| `BlipSink` | `deps.blip` | voice blips while dialogue types |
| `PhotoStore` | `deps.photos` | gallery and Photos app |
| `PhotoModeControls` | `ui.openPhotoMode(controls)` | camera state signal, `set`, `mode`/`setMode`, `capture()`, `exit()` |
| `MinimapSource` | `ui.setMinimap(source)` | `draw(ctx, w, h, dpr)` into the HUD minimap each frame |
| `PhoneAppDef` | `ui.registerPhoneApp(def)` | game apps (Messages, Map, Empire, Products…); returns an unregister function |
| `NextBestAction` | `ui.setNextBestAction(signal)` | the phone home card |
| `QuickWheelSlot[]` | `ui.setQuickWheel(slots)` | radial quick actions (hold the quick-wheel button) |

The HUD is `ui.hud`, a `HudModel` of signals the game writes: `visible`, `clean`, `clockHours`,
`weather`, `cash`, `cleanCash`, `heat` (0–5), `heatSearching`, `objective`, `prompt`, `bag`,
`vehicle` (speed in m/s; the UI converts units), `area` (banner on change) and `callout`
(`showCallout(ui.hud, 'Perfect drift!', 'flow')`). Round per-frame values before writing.

## What the UI handles itself

- While the HUD is visible and nothing is open: `pause`, `phone`, `map` and `quickWheel` actions.
  Call `ui.setHotkeysEnabled(false)` for cutscenes and scripted moments.
- In Photo Mode: `photoCapture`, `photoHideUi` and `photoExit`.
- Input contexts: menus and the phone push `menu` / `phone`; dialogue pushes `cutscene` when blocking.
- Persistence in the settings store: bindings (`bindings`), learned hints (`hints`, `hintTexts`).
- Hints (`ui.hint`, `ui.learnHint`) show one at a time during play only, never repeat once learned,
  and come back after a menu if they were cut short.

## Verification

```sh
open ui-lab.html?screen=mainMenu&scale=100&input=gamepad&bg=bright&set.a11y.highContrast=true
node qa/ui-shots.mjs --size 1920x1080 --scale 150 --input gamepad [--set a11y.dyslexiaFont=true] [screens…]
node qa/ui-layout.mjs [--quick] [--screens a,b] [--sizes 1280x720] [--scales 80,150] [--set k=v]
node qa/ui-gamepad.mjs                      # controller-only walkthrough, 47 checks
node qa/ui-icons.mjs                        # icon contact sheet
npx vitest run tests/ui
```

Screenshots and reports land in `qa/out/ui/`.
