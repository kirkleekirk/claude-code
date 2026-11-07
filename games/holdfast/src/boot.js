// Boot: loading screen, game construction, debug hooks for automated checks.
import { Game } from './main.js';

const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');
const progress = (msg, f) => { text.textContent = msg; fill.style.width = Math.round(f * 100) + '%'; };

const game = new Game(document.getElementById('app'), progress);
window.__game = game;
const params = new URLSearchParams(location.search);

(async () => {
  try {
    await game.init();
  } catch (e) {
    console.error(e);
    text.textContent = 'Something went wrong while building the world: ' + e.message;
    return;
  }
  if (params.get('time')) game.sky.setTime(+params.get('time'));
  if (params.get('weather')) game.sky.setWeather(params.get('weather'), true);
  const cam = params.get('cam');
  if (cam) {
    const v = cam.split(',').map(Number);
    game.camera.position.set(v[0], v[1], v[2]);
    game.camera.lookAt(v[3], v[4], v[5]);
  }
  document.getElementById('loading').classList.add('done');
  if (params.get('validate')) {
    // generation checks (dev): logs a report and keeps it on window.__validation
    const { validateWorld } = await import('./world/validate.js');
    const rep = validateWorld(game.world);
    window.__validation = rep;
    console.log('world validation', JSON.stringify(rep.byCat), JSON.stringify(rep.stats));
  }
  if (params.get('still')) {
    // render a single frame on demand (screenshots)
    window.__shot = (p, t, opts = {}) => {
      game.freeCam = true;
      if (opts.time != null) game.sky.setTime(opts.time);
      if (opts.weather) game.sky.setWeather(opts.weather, true);
      game.camera.position.set(...p);
      game.camera.lookAt(...t);
      if (opts.fov) { game.camera.fov = opts.fov; game.camera.updateProjectionMatrix(); }
      game.focus = game.camera.position;
      game.sky.envTimer = 0;
      for (let i = 0; i < 3; i++) game.update(1 / 60);
      game.render();
    };
    // deterministic simulation for automated play-tests
    window.__sim = (o) => {
      const inp = game.input;
      game.freeCam = false;
      if (o.pos) game.player.spawn(o.pos[0], o.pos[1]);
      if (o.yaw != null) game.tpc.yaw = o.yaw;
      if (o.pitch != null) game.tpc.pitch = o.pitch;
      inp.keys.clear();
      for (const k of o.keys || []) inp.keys.add(k);
      const n = o.steps || 60;
      for (let i = 0; i < n; i++) {
        for (const k of (o.press && o.press[i]) || []) inp.pressedSet.add(k);
        game.update(1 / 60);
        inp.endFrame();
      }
      inp.keys.clear();
      game.render();
      const p = game.player.pos;
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ground: game.player.onGround, inside: game.player.inside };
    };
    window.__ready = true;
  } else {
    game.start();
    window.__ready = true;
  }
})();
