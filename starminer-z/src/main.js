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
const start = (data) => app.start(data || {}).catch((err) => {
  console.error(err);
  root.innerHTML = `<div style="color:#fff;font:16px sans-serif;padding:24px">Something went wrong starting the game: ${String(err && err.message || err)}</div>`;
});
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
