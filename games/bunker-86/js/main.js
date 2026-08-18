/* BUNKER '86 — boot, input, and the loop. */
(function (BK) {
  'use strict';

  let ST = null;
  let last = 0, raf = 0;
  const canvas = document.getElementById('view');
  const $ = (id) => document.getElementById(id);

  // ================================================================ boot ===
  function boot() {
    BK.preloadArt();
    BK.Render.init(canvas);
    BK.UI.init();

    if (BK.hasSave()) $('btn-continue').classList.remove('hidden');

    $('btn-new').addEventListener('click', () => { startAudio(); playIntro(); });
    $('btn-continue').addEventListener('click', () => {
      startAudio();
      const st = BK.load();
      if (st) beginGame(st);
      else playIntro();
    });
    $('btn-help-title').addEventListener('click', () => { startAudio(); BK.UI.showHelp(); });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* offline is a bonus, not a requirement */ });
      });
    }
  }

  function startAudio() {
    BK.Audio.init();
    BK.Audio.resume();
  }

  // =============================================================== intro ===
  function playIntro() {
    $('title').classList.add('hidden');
    $('intro').classList.remove('hidden');
    const box = $('intro-text');
    box.innerHTML = '';
    BK.INTRO.forEach((line, i) => {
      const p = document.createElement('p');
      p.textContent = line;
      p.style.animationDelay = (i * 1.1) + 's';
      box.appendChild(p);
    });
    $('btn-intro-skip').onclick = () => beginGame(BK.newState());
  }

  function beginGame(st) {
    ST = st;
    window.__ST = st;               // handy in the console, harmless in play
    BK.UI.bind(st);
    BK.Horror.reset(st);
    $('title').classList.add('hidden');
    $('intro').classList.add('hidden');
    $('game').classList.remove('hidden');
    BK.Render.resize();
    BK.Render.cam.x = st.player.x;
    BK.Render.cam.y = st.player.y;
    wireInput();
    last = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  // ================================================================ loop ===
  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;         // a backgrounded tab must not fast-forward the night

    BK.Sim.update(ST, dt);
    BK.Render.draw(ST, dt);
    BK.Audio.tick(now / 1000, ST.dread);

    hudT += dt;
    if (hudT > 0.12) { hudT = 0; BK.UI.updateHUD(ST); }
  }
  let hudT = 0;

  // =============================================================== input ===
  let wired = false;
  function wireInput() {
    if (wired) return;
    wired = true;

    // ---- virtual stick ----
    const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
    let stickId = null, cx = 0, cy = 0;
    const MAXR = 46;

    zone.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId;
      zone.setPointerCapture(stickId);
      const r = zone.getBoundingClientRect();
      cx = e.clientX - r.left; cy = e.clientY - r.top;
      base.style.left = (cx - 58) + 'px';
      base.style.bottom = (r.height - cy - 58) + 'px';
      base.classList.add('active');
      moveKnob(0, 0);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      const r = zone.getBoundingClientRect();
      let dx = (e.clientX - r.left) - cx, dy = (e.clientY - r.top) - cy;
      const d = Math.hypot(dx, dy);
      if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; }
      moveKnob(dx, dy);
      const p = ST.player;
      p.input = { x: dx / MAXR, y: dy / MAXR };
      p.sprint = running || d > MAXR * 0.92;
      e.preventDefault();
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      base.classList.remove('active');
      moveKnob(0, 0);
      if (ST) { ST.player.input = null; ST.player.sprint = false; }
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);
    function moveKnob(dx, dy) { knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }

    // ---- action buttons ----
    $('btn-act').addEventListener('click', () => {
      const st = ST, p = st.player;
      if (st.focusProp) BK.interactProp(st, p, st.focusProp);
      else if (p.pack.length && p.map === 'bunker') BK.stash(st, p);
      else BK.Audio.sfx('deny');
    });
    $('btn-torch').addEventListener('click', () => {
      const p = ST.player;
      if (p.battery <= 0) { BK.log(ST, 'The batteries are dead.', 'warn'); BK.Audio.sfx('deny'); return; }
      p.flashlight = !p.flashlight;
      BK.Audio.sfx('click');
    });
    let running = false;
    $('btn-run').addEventListener('click', () => {
      running = !running;
      $('btn-run').classList.toggle('on', running);
      if (ST) ST.player.sprint = running;
      BK.Audio.sfx('click');
    });

    // ---- world taps, drags and pinch ----
    let downAt = null, downTime = 0, dragging = false, pinchStart = null;
    const pts = new Map();

    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const it = [...pts.values()];
        pinchStart = { d: Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y), z: ST.zoom || 1 };
        return;
      }
      downAt = { x: e.clientX, y: e.clientY };
      downTime = performance.now();
      dragging = false;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 2 && pinchStart) {
        const it = [...pts.values()];
        const d = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
        ST.zoom = BK.clamp(pinchStart.z * (d / pinchStart.d), 0.7, 2.0);
        return;
      }
      if (!downAt) return;
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) dragging = true;
      if (dragging && ST.buildGhost) aimGhost(e);
    });

    const endPointer = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchStart = null;
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const quick = performance.now() - downTime < 500;
      if (moved < 14 && quick) tapWorld(e);
      downAt = null; dragging = false;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); downAt = null; pinchStart = null; });

    function localPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function aimGhost(e) {
      const l = localPos(e);
      const w = BK.Render.screenToWorld(l.x, l.y);
      const def = BK.OBJECTS[ST.buildGhost.type];
      ST.buildGhost.x = Math.floor(w.x) - Math.floor((def.w - 1) / 2);
      ST.buildGhost.y = Math.floor(w.y) - Math.floor((def.h - 1) / 2);
      BK.UI.updateGhost();
    }

    function tapWorld(e) {
      const st = ST;
      if (st.buildGhost) { aimGhost(e); return; }
      const l = localPos(e);
      const w = BK.Render.screenToWorld(l.x, l.y);
      const map = st.maps[st.mapId];
      const tx = Math.floor(w.x), ty = Math.floor(w.y);

      // did they tap something interactive?
      let hit = null, bestD = 1.4;
      for (const p of map.props) {
        if (p.kind === 'debris' || p.kind === 'fixture') continue;
        const cx = p.x + ((p.w || 1) - 1) / 2, cy = p.y + ((p.h || 1) - 1) / 2;
        const d = BK.dist(w.x - 0.5, w.y - 0.5, cx, cy);
        if (d < bestD) { bestD = d; hit = p; }
      }
      if (hit) {
        const k = Math.floor(hit.y) * map.w + Math.floor(hit.x);
        if (map.seen[k]) { BK.interactProp(st, st.player, hit); return; }
      }
      // otherwise walk there
      if (BK.inBounds(map, tx, ty) && map.seen[ty * map.w + tx]) {
        st.player.input = null;
        BK.goTo(st, st.player, tx + 0.5, ty + 0.5);
      }
    }

    // ---- keyboard (desktop testing and Bluetooth keyboards) ----
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      const st = ST;
      if (!st) return;
      const k = e.key.toLowerCase();
      if (k === 'e' || k === 'enter') { if (st.focusProp) BK.interactProp(st, st.player, st.focusProp); }
      if (k === 'f') { st.player.flashlight = !st.player.flashlight; }
      if (k === ' ') { st.paused = !st.paused; e.preventDefault(); }
      if (k === '1') st.speed = 1;
      if (k === '2') st.speed = 2;
      if (k === '3') st.speed = 4;
      if (k === 'escape') { BK.UI.closePanel(); BK.UI.exitBuild(); }
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    setInterval(() => {
      if (!ST) return;
      const up = keys['w'] || keys['arrowup'], dn = keys['s'] || keys['arrowdown'];
      const lf = keys['a'] || keys['arrowleft'], rt = keys['d'] || keys['arrowright'];
      if (up || dn || lf || rt) {
        ST.player.input = { x: (rt ? 1 : 0) - (lf ? 1 : 0), y: (dn ? 1 : 0) - (up ? 1 : 0) };
        ST.player.sprint = !!keys['shift'];
      } else if (ST.player.input && !stickId) {
        ST.player.input = null;
      }
    }, 33);

    // pause the world when the phone is put away
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ST) { BK.save(ST); }
      else last = performance.now();
    });
  }

  let booted = false;
  function bootOnce() { if (booted) return; booted = true; boot(); }
  document.addEventListener('DOMContentLoaded', bootOnce);
  if (document.readyState !== 'loading') bootOnce();
})(window.BK = window.BK || {});
