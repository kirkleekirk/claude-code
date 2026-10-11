import { App } from './app.js';

const root = document.getElementById('app');
const app = new App(root);
window.__app = app;

// When the page is updated while someone is playing, save, and carry on from the save after.
const hot = window.claude?.hot;
if (typeof hot?.snapshot === 'function') {
  hot.snapshot(() => {
    app.autosave();
    return { resume: app.state === 'playing' || app.state === 'paused' };
  });
}
// what went wrong, readable from across the room (on a TV too), and for graphics what to try
function showError(err) {
  const box = document.createElement('div');
  box.style.cssText = 'color:#fff;background:#000;font:600 clamp(16px,2.2vw,30px)/1.45 sans-serif;padding:5%;max-width:46em';
  const line = (text, css = '') => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = css; box.appendChild(d); };
  if (err?.webgl) {
    line("StarMiner Z couldn't start its 3D graphics.", 'font-size:1.3em;margin-bottom:0.6em');
    line(err.message);
    line('Things to try:', 'margin-top:0.8em');
    line('• Close the other tabs, especially any other copy of the game, then reload this page.');
    line('• Quit the browser completely and open it again. On an Xbox: press the Xbox button, highlight Edge, press the Menu button and choose Quit.');
    line('• Check that graphics acceleration is on in the browser\'s settings (in Edge: Settings, System and performance, "Use graphics acceleration when available"), then restart the browser.');
    if (err.detail) line(`The browser said: ${err.detail}`, 'margin-top:0.8em;opacity:0.7;font-size:0.8em');
  } else {
    line(`Something went wrong starting the game: ${String(err?.message || err)}`);
  }
  root.replaceChildren(box);
}

const start = (data) => app.start(data || {}).catch((err) => {
  console.error(err);
  showError(err);
});
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
