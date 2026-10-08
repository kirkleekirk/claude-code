// All of the game's interface styles, in the look of the Xbox 360 original: plain white
// type with a dark edge over the world, translucent grey panels, a red highlight on menus.
// Everything is sized in em off one root size that scales with the screen.

export const CSS = /* css */ `
:root {
  --ink: #ffffff;
  --ink-dim: #c9cdd2;
  --edge: rgba(0, 0, 0, 0.85);
  --panel: rgba(28, 30, 33, 0.78);
  --panel-line: rgba(200, 206, 212, 0.55);
  --slot: rgba(40, 42, 46, 0.72);
  --slot-line: rgba(170, 176, 182, 0.6);
  --select: #ffffff;
  --menu-hi: #f0414b;
  --heart: #e21d27;
  --heart-dim: rgba(40, 10, 10, 0.55);
  --dura: #3ccf3c;
  --death: rgba(150, 0, 0, 0.5);
  --ui-font: 'Open Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  --logo-font: 'Archivo Black', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  color-scheme: dark;
}
#app { font-family: var(--ui-font); color: var(--ink); background: #000; }
.ui { position: absolute; inset: 0; pointer-events: none; font-size: var(--ui-size, 16px); -webkit-font-smoothing: antialiased; }
.ui * { box-sizing: border-box; }
.txt { text-shadow: 0 0.06em 0 var(--edge), 0.06em 0 0 var(--edge), -0.06em 0 0 var(--edge), 0 -0.06em 0 var(--edge), 0 0.1em 0.3em rgba(0,0,0,0.6); }

/* ---- HUD ---- */
.hud { position: absolute; inset: 0; }
.hud .look { position: absolute; top: 2.1em; left: 0; right: 0; text-align: center; font-weight: 700; font-size: 0.82em; letter-spacing: 0.01em; }
.hud .dist { position: absolute; top: 2.1em; right: 4.4em; text-align: center; font-weight: 700; font-size: 0.82em; line-height: 1.3; }
.hud .fps { position: absolute; top: 0.6em; left: 0.8em; font-size: 0.7em; opacity: 0.8; }
.hud .cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hud .cross i { position: absolute; background: #fff; box-shadow: 0 0 0.12em rgba(0,0,0,0.9); }
.hud .cross i:nth-child(1) { left: -0.07em; top: -0.62em; width: 0.14em; height: 0.36em; }
.hud .cross i:nth-child(2) { left: -0.07em; top: 0.26em; width: 0.14em; height: 0.36em; }
.hud .cross i:nth-child(3) { top: -0.07em; left: -0.62em; height: 0.14em; width: 0.36em; }
.hud .cross i:nth-child(4) { top: -0.07em; left: 0.26em; height: 0.14em; width: 0.36em; }
.hud .cross.gun i:nth-child(1) { top: calc(-0.62em - var(--spread, 0em)); }
.hud .cross.gun i:nth-child(2) { top: calc(0.26em + var(--spread, 0em)); }
.hud .cross.gun i:nth-child(3) { left: calc(-0.62em - var(--spread, 0em)); }
.hud .cross.gun i:nth-child(4) { left: calc(0.26em + var(--spread, 0em)); }
.hud .hit { position: absolute; left: 50%; top: 50%; width: 1.6em; height: 1.6em; margin: -0.8em; opacity: 0; transition: opacity 0.18s; }
.hud .hit::before, .hud .hit::after { content: ''; position: absolute; left: 50%; top: 0; width: 0.12em; height: 100%; background: #fff; transform: rotate(45deg); box-shadow: 0 0 0.1em #000; }
.hud .hit::after { transform: rotate(-45deg); }
.hud .hit.on { opacity: 1; transition: none; }
.hud .bottom { position: absolute; left: 50%; bottom: 1.6em; transform: translateX(-50%); display: flex; flex-direction: column; align-items: flex-start; gap: 0.2em; }
.hud .iname { font-weight: 700; font-size: 0.82em; padding-left: 0.1em; min-height: 1.2em; white-space: nowrap; }
.hud .hearts { display: flex; gap: 0.08em; padding-left: 0.08em; }
.hud .hearts svg { width: 0.95em; height: 0.86em; display: block; filter: drop-shadow(0 0.05em 0.05em rgba(0,0,0,0.8)); }
.hud .hearts.hurt { animation: shake 0.3s; }
@keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-0.12em); } 75% { transform: translateX(0.12em); } }
.hotbar { display: flex; gap: 0.12em; }
.slot { position: relative; width: 2.75em; height: 2.75em; background: var(--slot); border: 0.08em solid var(--slot-line); pointer-events: auto; }
.slot.sel { border: 0.14em solid var(--select); background: rgba(80, 84, 90, 0.75); box-shadow: 0 0 0.3em rgba(255,255,255,0.35); }
.slot img { position: absolute; inset: 0.18em; width: calc(100% - 0.36em); height: calc(100% - 0.36em); image-rendering: auto; pointer-events: none; }
.slot .n { position: absolute; right: 0.18em; bottom: 0.08em; font-size: 0.62em; font-weight: 700; pointer-events: none; }
.slot .dur { position: absolute; left: 0.25em; right: 0.25em; bottom: 0.2em; height: 0.16em; background: rgba(0,0,0,0.6); pointer-events: none; }
.slot .dur b { display: block; height: 100%; background: var(--dura); }
.hud .day { position: absolute; left: 2.2em; bottom: 2em; font-size: 2.4em; font-weight: 800; opacity: 0; transition: opacity 1.2s; }
.hud .day.on { opacity: 0.85; }
.hud .feed { position: absolute; left: 1.4em; top: 34%; display: flex; flex-direction: column; gap: 0.15em; font-size: 0.72em; font-weight: 600; }
.hud .feed div { transition: opacity 0.6s; }
.hud .award { position: absolute; left: 50%; bottom: 7.4em; transform: translateX(-50%); display: flex; align-items: center; gap: 0.6em; padding: 0.35em 1.1em 0.35em 0.4em; border-radius: 2em; background: rgba(20, 20, 22, 0.82); border: 0.06em solid rgba(255,255,255,0.25); opacity: 0; transition: opacity 0.4s, transform 0.4s; }
.hud .award.on { opacity: 1; transform: translateX(-50%) translateY(-0.3em); }
.hud .award .ic { width: 1.9em; height: 1.9em; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff 0, #c8c8c8 30%, #6a6a6a 100%); display: grid; place-items: center; color: #222; font-weight: 800; font-size: 0.8em; }
.hud .award .t { font-weight: 700; font-size: 0.75em; line-height: 1.25; }
.hud .award .t small { display: block; font-weight: 600; font-size: 0.9em; color: var(--ink-dim); }
.hud .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(170,0,0,0.55) 100%); opacity: 0; transition: opacity 0.25s; }
.hud .vignette.on { opacity: 1; transition: none; }
.hud .scope { position: absolute; inset: 0; display: none; background: radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) 34vh, #000 34.4vh); }
.hud .scope::before { content: ''; position: absolute; left: 50%; top: 14vh; bottom: 14vh; width: 1px; background: rgba(0,0,0,0.9); }
.hud .scope::after { content: ''; position: absolute; top: 50%; left: calc(50% - 36vh); right: calc(50% - 36vh); height: 1px; background: rgba(0,0,0,0.9); }
.hud .scope.on { display: block; }
.hud .hint { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); font-weight: 700; font-size: 0.8em; opacity: 0; transition: opacity 0.4s; text-align: center; }
.hud .hint.on { opacity: 1; }

/* ---- death ---- */
.death { position: absolute; inset: 0; background: var(--death); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 0.15em; pointer-events: auto; }
.death.on { display: flex; }
.death div { font-size: 1.35em; font-weight: 700; }
.death .press { margin-top: 0.2em; display: flex; align-items: center; gap: 0.3em; }

/* button glyphs */
.btn { display: inline-grid; place-items: center; width: 1.25em; height: 1.25em; border-radius: 50%; font-size: 0.85em; font-weight: 800; color: #fff; text-shadow: none; box-shadow: inset 0 -0.12em 0 rgba(0,0,0,0.35), 0 0 0 0.08em rgba(0,0,0,0.5); vertical-align: -0.15em; }
.btn.a { background: radial-gradient(circle at 40% 35%, #8be36a, #2f9a1c); }
.btn.b { background: radial-gradient(circle at 40% 35%, #ff7a7a, #c41c1c); }
.btn.x { background: radial-gradient(circle at 40% 35%, #7ab8ff, #1c58c4); }
.btn.y { background: radial-gradient(circle at 40% 35%, #ffe27a, #c49a1c); }
.key { display: inline-block; min-width: 1.3em; padding: 0 0.3em; height: 1.3em; line-height: 1.25em; border-radius: 0.2em; background: rgba(255,255,255,0.92); color: #1a1a1a; font-size: 0.75em; font-weight: 800; text-align: center; text-shadow: none; vertical-align: 0.05em; box-shadow: 0 0.1em 0 rgba(0,0,0,0.5); }
`;

let injected = false;
export function injectCSS(extra = '') {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = CSS + extra;
  document.head.appendChild(s);
}
