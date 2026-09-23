/* Rendering: renderer, camera, toon materials, ink outlines, generated textures, lighting moods, effects. */
(function () {
  'use strict';
  const GF = {};
  const OUTLINE = 0x1d2340;
  let renderer, scene, camera, gradient;
  const matCache = new Map();
  const basicCache = new Map();

  GF.ok = false;
  GF.init = function (canvas) {
    if (!window.THREE) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { console.error('WebGL unavailable', e); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(DT.settings.fov || 70, 1, 0.1, 300);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.95);
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-6, 14, 10);
    scene.add(hemi, sun);
    GF.hemi = hemi; GF.sun = sun;
    const steps = new Uint8Array([90, 170, 255]);
    gradient = new THREE.DataTexture(steps, steps.length, 1, THREE.LuminanceFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    GF.renderer = renderer; GF.scene = scene; GF.camera = camera;
    GF.resize();
    window.addEventListener('resize', GF.resize);
    GF.ok = true;
    return true;
  };
  GF.resize = function () {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  GF.setFov = function (f) { if (camera) { camera.fov = f; camera.updateProjectionMatrix(); } };
  /* Lighting mood: level 1 = normal, 0 = pitch dark (the Loop Tunnel). */
  GF.setMood = function (o) {
    if (!GF.hemi) return;
    GF.hemi.intensity = 0.95 * o.light + 0.08;
    GF.sun.intensity = 0.75 * o.light;
    if (o.bg) scene.background = new THREE.Color(o.bg);
    if (o.fog) scene.fog = new THREE.Fog(new THREE.Color(o.fog[0]), o.fog[1], o.fog[2]);
    else if (o.fog === null) scene.fog = null;
  };

  /* ---------- materials ---------- */
  GF.mat = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.emissive || '') + '|' + (o.ei || '') + '|' + (o.opacity || 1);
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: gradient });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 0.6; }
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    matCache.set(key, m);
    return m;
  };
  GF.texMat = function (tex, o) {
    o = o || {};
    const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient, color: new THREE.Color(o.tint || '#ffffff') });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 0.3; }
    return m;
  };
  GF.basic = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.opacity || 1) + '|' + (o.add ? 'a' : '') + '|' + (o.side || '');
    if (basicCache.has(key)) return basicCache.get(key);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.add) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
    if (o.side === 'double') m.side = THREE.DoubleSide;
    basicCache.set(key, m);
    return m;
  };
  const outlineMat = new (window.THREE ? THREE.MeshBasicMaterial : Object)(window.THREE ? { color: OUTLINE, side: THREE.BackSide } : {});
  /* Inverted-hull outline (cartoon ink line). */
  GF.ink = function (mesh, t) {
    const o = new THREE.Mesh(mesh.geometry, outlineMat);
    o.scale.setScalar(1 + (t || 0.08));
    o.userData.outline = true;
    mesh.add(o);
    return mesh;
  };
  GF.part = function (geo, color, pos, o) {
    o = o || {};
    const mesh = new THREE.Mesh(geo, o.mat || (o.basic ? GF.basic(color, o) : GF.mat(color, o)));
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (o.scale) mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (o.rot) mesh.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.ink !== false && !o.basic) GF.ink(mesh, o.inkT);
    return mesh;
  };
  const geoCache = new Map();
  GF.geo = function (kind, a, b, c, d, e) {
    const key = kind + ':' + [a, b, c, d, e].join(',');
    if (geoCache.has(key)) return geoCache.get(key);
    let g;
    switch (kind) {
      case 'sphere': g = new THREE.SphereGeometry(a, b || 16, c || 12); break;
      case 'box': g = new THREE.BoxGeometry(a, b, c); break;
      case 'cyl': g = new THREE.CylinderGeometry(a, b, c, d || 12, 1, false, 0, e || Math.PI * 2); break;
      case 'cone': g = new THREE.ConeGeometry(a, b, c || 12); break;
      case 'torus': g = new THREE.TorusGeometry(a, b, 8, c || 24, d || Math.PI * 2); break;
      case 'ring': g = new THREE.RingGeometry(a, b, c || 32); break;
      case 'circle': g = new THREE.CircleGeometry(a, b || 24); break;
      case 'plane': g = new THREE.PlaneGeometry(a, b); break;
      case 'octa': g = new THREE.OctahedronGeometry(a, 0); break;
      case 'ico': g = new THREE.IcosahedronGeometry(a, 0); break;
      case 'dodeca': g = new THREE.DodecahedronGeometry(a, 0); break;
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    geoCache.set(key, g);
    return g;
  };

  GF.blob = function (r) {
    const m = new THREE.Mesh(GF.geo('circle', 1, 20), GF.basic('#000000', { opacity: 0.25 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.scale.setScalar(r);
    m.renderOrder = -1;
    return m;
  };

  /* ---------- generated textures ---------- */
  function canvasTex(w, h, draw, o) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    if (o && o.repeat) tex.repeat.set(o.repeat[0], o.repeat[1]);
    return tex;
  }
  const shade = (hex, f) => {
    const c = new THREE.Color(hex);
    c.multiplyScalar(f);
    return '#' + c.getHexString();
  };
  GF.brickTexture = function (line) {
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = shade(line.trim, 1); ctx.fillRect(0, 0, w, h);
      const bh = 32, bw = 64;
      for (let row = 0; row < h / bh; row++) {
        for (let col = -1; col < w / bw + 1; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
          ctx.fillStyle = shade(line.wall, 0.85 + ((row * 7 + col * 13) % 5) * 0.06);
          ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        }
      }
    });
  };
  GF.floorTexture = function (line) {
    const wood = line.id === 'grass' || line.id === 'candy' || line.id === 'lava';
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = shade(line.floor, 0.8); ctx.fillRect(0, 0, w, h);
      if (wood) {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = shade(line.floor, 0.9 + (i % 3) * 0.08); ctx.fillRect(0, i * 32 + 2, w, 28); ctx.fillStyle = shade(line.floor, 0.6); ctx.fillRect(((i * 97) % 200) + 20, i * 32 + 2, 3, 28); }
      } else {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = shade(line.floor, 0.86 + ((r + c * 3) % 4) * 0.06); ctx.fillRect(c * 64 + 3, r * 64 + 3, 58, 58); }
      }
    });
  };
  function hillLine(ctx, w, h, base, amp, freq, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base + Math.sin((x / w) * Math.PI * 2 * freq + seed) * amp + Math.sin((x / w) * Math.PI * 2 * freq * 2.7 + seed * 3) * amp * 0.35);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  GF.sceneryTexture = function (line, seed) {
    return canvasTex(2048, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, line.sky[0]); g.addColorStop(1, line.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 9; i++) {
        const cx = (i / 9) * w + 60 + (seed || 0) * 90, cy = 70 + (i % 3) * 30;
        ctx.fillStyle = line.scenery === 'spikes' || line.scenery === 'tunnel' ? 'rgba(255,120,120,.18)' : 'rgba(255,255,255,.9)';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k * 26, cy + (k % 2) * 8, 22 + (k % 2) * 8, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      hillLine(ctx, w, h, 300, 40, 3, line.hills[1], 1.3 + (seed || 0));
      hillLine(ctx, w, h, 360, 34, 5, line.hills[0], 0.4 + (seed || 0));
      ctx.fillStyle = line.ground;
      ctx.fillRect(0, 420, w, h - 420);
      for (let i = 0; i < 26; i++) {
        const x = (i / 26) * w + ((i * 37) % 50);
        const y = 380 + ((i * 53) % 40);
        switch (line.scenery) {
          case 'trees': ctx.fillStyle = '#7a4b2a'; ctx.fillRect(x - 5, y, 10, 40); ctx.fillStyle = i % 2 ? '#3f9a36' : '#56b847'; ctx.beginPath(); ctx.arc(x, y - 6, 26, 0, Math.PI * 2); ctx.fill(); break;
          case 'candy': ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y, 6, 44); ctx.fillStyle = ['#ff5fa2', '#7ed6ff', '#ffe066', '#b18cff'][i % 4]; ctx.beginPath(); ctx.arc(x, y - 8, 22, 0, Math.PI * 2); ctx.fill(); break;
          case 'graves': ctx.fillStyle = i % 2 ? '#8a8f9a' : '#6c717c'; ctx.beginPath(); ctx.moveTo(x - 14, y + 40); ctx.lineTo(x - 14, y); ctx.arc(x, y, 14, Math.PI, 0); ctx.lineTo(x + 14, y + 40); ctx.fill(); break;
          case 'lava': ctx.fillStyle = i % 2 ? '#ffb02e' : '#ff5a1f'; ctx.beginPath(); ctx.moveTo(x - 20, y + 40); ctx.quadraticCurveTo(x, y - 40 - (i % 3) * 20, x + 20, y + 40); ctx.fill(); break;
          case 'ice': ctx.fillStyle = i % 2 ? '#e9f7ff' : '#bfe6fb'; ctx.beginPath(); ctx.moveTo(x - 22, y + 40); ctx.lineTo(x, y - 50 - (i % 3) * 15); ctx.lineTo(x + 22, y + 40); ctx.fill(); break;
          case 'spikes': ctx.fillStyle = i % 2 ? '#1a0508' : '#3b0a14'; ctx.beginPath(); ctx.moveTo(x - 14, y + 40); ctx.lineTo(x, y - 40); ctx.lineTo(x + 14, y + 40); ctx.fill(); break;
          case 'crystals': ctx.fillStyle = ['#e1d6ff', '#a98bff', '#7fe3ff'][i % 3]; ctx.beginPath(); ctx.moveTo(x, y - 50); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 40); ctx.lineTo(x - 16, y); ctx.fill(); break;
          case 'tunnel': ctx.fillStyle = '#ffcf3d'; ctx.globalAlpha = 0.5; ctx.fillRect(x, 120, 8, 8); ctx.globalAlpha = 1; break;
          default: break;
        }
      }
    });
  };
  GF.tunnelTexture = function () {
    return canvasTex(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#07070d'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) { ctx.fillStyle = '#16161f'; ctx.fillRect(i * 88, 0, 40, h); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,207,61,.7)'; ctx.beginPath(); ctx.arc(i * 176 + 60, 90, 6, 0, Math.PI * 2); ctx.fill(); }
    });
  };
  GF.groundTexture = function (line) {
    return canvasTex(512, 512, (ctx) => {
      ctx.fillStyle = line.ground; ctx.fillRect(0, 0, 512, 512);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 140; i++) { ctx.fillStyle = i % 2 ? '#000' : '#fff'; ctx.fillRect((i * 97) % 512, (i * 61) % 512, 18 + (i % 5) * 6, 4); }
    }, { repeat: [24, 6] });
  };

  /* ---------- pooled effects ---------- */
  const fx = [];
  GF.fx = fx;
  GF.ring = function (x, z, radius, color, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(GF.geo('ring', 0.82, 1, 40), GF.basic(color, { opacity: 0.85, add: !!o.add }).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, o.y || 0.06, z);
    m.scale.setScalar(o.from != null ? o.from : 0.2);
    scene.add(m);
    fx.push({ m, t: 0, dur: dur || 0.35, kind: 'ring', r: radius, from: o.from != null ? o.from : 0.2 });
  };
  /* Floor warning that fills up over `dur` (enemy wind-ups). Returns a handle with .alive. */
  GF.telegraph = function (x, z, radius, dur, color) {
    const grp = new THREE.Group();
    const edge = new THREE.Mesh(GF.geo('ring', 0.94, 1, 40), GF.basic(color || '#ff3b3b', { opacity: 0.9 }).clone());
    const fill = new THREE.Mesh(GF.geo('circle', 1, 40), GF.basic(color || '#ff3b3b', { opacity: 0.28 }).clone());
    edge.rotation.x = fill.rotation.x = -Math.PI / 2;
    fill.scale.setScalar(0.01);
    grp.add(edge, fill);
    grp.position.set(x, 0.05, z);
    grp.scale.setScalar(radius);
    scene.add(grp);
    const h = { m: grp, fill, t: 0, dur, kind: 'tele', alive: true };
    fx.push(h);
    return h;
  };
  /* Rectangular floor warning (charges, beams). */
  GF.telegraphRect = function (x, z, dir, len, width, dur, color) {
    const grp = new THREE.Group();
    const back = new THREE.Mesh(GF.geo('plane', 1, 1), GF.basic(color || '#ff3b3b', { opacity: 0.22 }).clone());
    const fill = new THREE.Mesh(GF.geo('plane', 1, 1), GF.basic(color || '#ff3b3b', { opacity: 0.45 }).clone());
    back.rotation.x = fill.rotation.x = -Math.PI / 2;
    back.scale.set(width, len, 1); back.position.z = len / 2;
    fill.scale.set(width, 0.01, 1); fill.position.z = 0;
    grp.add(back, fill);
    grp.position.set(x, 0.06, z);
    grp.rotation.y = dir;
    scene.add(grp);
    const h = { m: grp, fill, len, t: 0, dur, kind: 'teleRect', alive: true };
    fx.push(h);
    return h;
  };
  GF.swoosh = function (x, z, angle, radius, arcRad, color, y) {
    const geo = new THREE.RingGeometry(radius * 0.3, radius, 24, 1, -arcRad / 2, arcRad);
    const m = new THREE.Mesh(geo, GF.basic(color || '#ffffff', { opacity: 0.75, add: true, side: 'double' }).clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = angle - Math.PI / 2;
    m.position.set(x, y || 0.9, z);
    scene.add(m);
    fx.push({ m, t: 0, dur: 0.16, kind: 'fade', dispose: true });
  };
  GF.burst = function (x, y, z, color, n, speed, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const s = o.size || 0.12;
      const m = new THREE.Mesh(GF.geo('box', s, s, s), GF.basic(color, o.add ? { add: true } : {}));
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = o.flat ? 0.5 : 2 + Math.random() * 3;
      fx.push({ m, t: 0, dur: o.dur || 0.6, kind: 'particle', v: new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), up, Math.sin(a) * speed * (0.4 + Math.random())), g: o.gravity != null ? o.gravity : 12 });
      scene.add(m);
    }
  };
  GF.beam = function (color, h) {
    const m = new THREE.Mesh(GF.geo('cyl', 0.12, 0.28, h || 5, 10), GF.basic(color, { opacity: 0.35, add: true }));
    m.position.y = (h || 5) / 2;
    return m;
  };
  /* A quick lightning / tether line between two points. */
  GF.line = function (a, b, color, dur, width) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
    const m = new THREE.Mesh(GF.geo('box', width || 0.08, width || 0.08, 1), GF.basic(color, { add: true }).clone());
    m.scale.z = d;
    m.position.set((a.x + b.x) / 2, (a.y || 1) , (a.z + b.z) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    scene.add(m);
    fx.push({ m, t: 0, dur: dur || 0.15, kind: 'fade' });
  };
  GF.updateFx = function (dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'ring') { f.m.scale.setScalar(f.from + (f.r - f.from) * (1 - Math.pow(1 - k, 2))); f.m.material.opacity = 0.85 * (1 - k); }
      else if (f.kind === 'tele') { f.fill.scale.setScalar(Math.max(0.01, k)); if (!f.alive) f.t = f.dur; }
      else if (f.kind === 'teleRect') { f.fill.scale.y = Math.max(0.01, k * f.len); f.fill.position.z = (k * f.len) / 2; if (!f.alive) f.t = f.dur; }
      else if (f.kind === 'fade') { f.m.material.opacity = 0.75 * (1 - k); }
      else if (f.kind === 'particle') {
        f.v.y -= f.g * dt;
        f.m.position.addScaledVector(f.v, dt);
        if (f.m.position.y < 0.05) { f.m.position.y = 0.05; f.v.multiplyScalar(0.5); f.v.y = Math.abs(f.v.y) * 0.3; }
        f.m.scale.setScalar(1 - k * 0.8);
        f.m.rotation.x += dt * 8; f.m.rotation.y += dt * 6;
      }
      if (f.t >= f.dur) {
        scene.remove(f.m);
        if (f.kind === 'tele' || f.kind === 'teleRect') { f.m.children.forEach((c) => c.material.dispose()); }
        else if (f.kind !== 'particle' && f.m.material && f.m.material.dispose) f.m.material.dispose();
        if (f.dispose && f.m.geometry) f.m.geometry.dispose();
        fx.splice(i, 1);
      }
    }
  };
  GF.clearFx = function () { for (const f of fx) scene.remove(f.m); fx.length = 0; };

  const v3 = window.THREE ? new THREE.Vector3() : null;
  GF.toScreen = function (x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, behind: v3.z > 1 || v3.z < -1 };
  };
  GF.render = function () { if (renderer) renderer.render(scene, camera); };

  DT.game.gfx = GF;
})();
