import { App } from './app.js';

const root = document.getElementById('app');
const app = new App(root);
window.__app = app;
app.start().catch((err) => {
  console.error(err);
  root.innerHTML = `<div style="color:#fff;font:16px sans-serif;padding:24px">Something went wrong starting the game: ${String(err && err.message || err)}</div>`;
});
