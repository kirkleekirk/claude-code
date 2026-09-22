/* Rendering: renderer, camera, toon materials, outlines, scenery textures, pooled effects. */
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
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

  /* ---------- materials ---------- */
  GF.mat = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.emissive || '') + '|' + (o.opacity || 1);
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: gradient });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 0.6; }
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    matCache.set(key, m);
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
  /* Inverted-hull outline on a mesh (cartoon ink line). */
  GF.ink = function (mesh, t) {
    const o = new THREE.Mesh(mesh.geometry, outlineMat);
    o.scale.setScalar(1 + (t || 0.08));
    o.userData.outline = true;
    mesh.add(o);
    return mesh;
  };
  /* Primitive helper: part(geometry, color, position, opts). */
  GF.part = function (geo, color, pos, o) {
    o = o || {};
    const mesh = new THREE.Mesh(geo, o.basic ? GF.basic(color, o) : GF.mat(color, o));
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (o.scale) mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (o.rot) mesh.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.ink !== false && !o.basic) GF.ink(mesh, o.inkT);
    return mesh;
  };
  const geoCache = new Map();
  GF.geo = function (kind, a, b, c, d) {
    const key = kind + ':' + [a, b, c, d].join(',');
    if (geoCache.has(key)) return geoCache.get(key);
    let g;
    switch (kind) {
      case 'sphere': g = new THREE.SphereGeometry(a, b || 16, c || 12); break;
      case 'box': g = new THREE.BoxGeometry(a, b, c); break;
      case 'cyl': g = new THREE.CylinderGeometry(a, b, c, d || 12); break;
      case 'cone': g = new THREE.ConeGeometry(a, b, c || 12); break;
      case 'torus': g = new THREE.TorusGeometry(a, b, 8, c || 24, d || Math.PI * 2); break;
      case 'ring': g = new THREE.RingGeometry(a, b, c || 32); break;
      case 'circle': g = new THREE.CircleGeometry(a, b || 24); break;
      case 'plane': g = new THREE.PlaneGeometry(a, b); break;
      case 'octa': g = new THREE.OctahedronGeometry(a, 0); break;
      case 'ico': g = new THREE.IcosahedronGeometry(a, 0); break;
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    geoCache.set(key, g);
    return g;
  };

  /* Blob shadow under an actor. */
  GF.blob = function (r) {
    const m = new THREE.Mesh(GF.geo('circle', 1, 20), GF.basic('#000000', { opacity: 0.22 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.scale.setScalar(r);
    m.renderOrder = -1;
    return m;
  };

  /* ---------- scenery ---------- */
  function hillLine(ctx, w, h, base, amp, freq, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin((x / w) * Math.PI * 2 * freq + seed) * amp + Math.sin((x / w) * Math.PI * 2 * freq * 2.7 + seed * 3) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  GF.sceneryTexture = function (route) {
    const w = 2048, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, route.sky[0]); g.addColorStop(1, route.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 9; i++) {
      const cx = (i / 9) * w + 60, cy = 70 + (i % 3) * 30;
      ctx.fillStyle = route.scenery === 'spikes' ? 'rgba(255,120,120,.25)' : 'rgba(255,255,255,.9)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k * 26, cy + (k % 2) * 8, 22 + (k % 2) * 8, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    hillLine(ctx, w, h, 300, 40, 3, route.hills[1], 1.3);
    hillLine(ctx, w, h, 360, 34, 5, route.hills[0], 0.4);
    const ground = route.ground;
    ctx.fillStyle = ground;
    ctx.fillRect(0, 420, w, h - 420);
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * w + ((i * 37) % 50);
      const y = 380 + ((i * 53) % 40);
      switch (route.scenery) {
        case 'trees':
          ctx.fillStyle = '#7a4b2a'; ctx.fillRect(x - 5, y, 10, 40);
          ctx.fillStyle = i % 2 ? '#3f9a36' : '#56b847'; ctx.beginPath(); ctx.arc(x, y - 6, 26, 0, Math.PI * 2); ctx.fill();
          break;
        case 'candy':
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y, 6, 44);
          ctx.fillStyle = ['#ff5fa2', '#7ed6ff', '#ffe066', '#b18cff'][i % 4]; ctx.beginPath(); ctx.arc(x, y - 8, 22, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, Math.PI * 1.5); ctx.stroke();
          break;
        case 'lava':
          ctx.fillStyle = i % 2 ? '#ffb02e' : '#ff5a1f'; ctx.beginPath(); ctx.moveTo(x - 20, y + 40); ctx.quadraticCurveTo(x, y - 40 - (i % 3) * 20, x + 20, y + 40); ctx.fill();
          break;
        case 'ice':
          ctx.fillStyle = i % 2 ? '#e9f7ff' : '#bfe6fb'; ctx.beginPath(); ctx.moveTo(x - 22, y + 40); ctx.lineTo(x, y - 50 - (i % 3) * 15); ctx.lineTo(x + 22, y + 40); ctx.fill();
          break;
        case 'spikes':
          ctx.fillStyle = i % 2 ? '#1a0508' : '#3b0a14'; ctx.beginPath(); ctx.moveTo(x - 14, y + 40); ctx.lineTo(x, y - 40); ctx.lineTo(x + 14, y + 40); ctx.fill();
          break;
        case 'crystals':
          ctx.fillStyle = ['#e1d6ff', '#a98bff', '#7fe3ff'][i % 3]; ctx.beginPath(); ctx.moveTo(x, y - 50); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 40); ctx.lineTo(x - 16, y); ctx.fill();
          break;
        default: break;
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  };
  GF.groundTexture = function (route) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = route.ground;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = i % 2 ? '#000' : '#fff';
      const x = (i * 97) % 512, y = (i * 61) % 512;
      ctx.fillRect(x, y, 18 + (i % 5) * 6, 4);
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 6);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  };

  /* ---------- pooled effects ---------- */
  const fx = [];
  GF.fx = fx;
  /* Expanding ring on the floor. */
  GF.ring = function (x, z, radius, color, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(GF.geo('ring', 0.82, 1, 40), GF.basic(color, { opacity: 0.85, add: !!o.add }).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, (o.y || 0.06), z);
    m.scale.setScalar(o.from != null ? o.from : 0.2);
    scene.add(m);
    fx.push({ m, t: 0, dur: dur || 0.35, kind: 'ring', r: radius, from: o.from != null ? o.from : 0.2 });
  };
  /* Filled telegraph disc that fills up over `dur` (enemy wind-ups). Returns handle. */
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
  /* Sword swoosh arc in front of an actor. */
  GF.swoosh = function (x, z, angle, radius, arcRad, color) {
    const geo = new THREE.RingGeometry(radius * 0.35, radius, 24, 1, -arcRad / 2, arcRad);
    const m = new THREE.Mesh(geo, GF.basic(color || '#ffffff', { opacity: 0.75, add: true, side: 'double' }).clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = angle - Math.PI / 2;
    m.position.set(x, 0.7, z);
    scene.add(m);
    fx.push({ m, t: 0, dur: 0.16, kind: 'fade', dispose: true });
  };
  /* Particle burst of little cubes. */
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
  /* Vertical beam (loot beam / spawn column). */
  GF.beam = function (color, h) {
    const m = new THREE.Mesh(GF.geo('cyl', 0.12, 0.28, h || 5, 10), GF.basic(color, { opacity: 0.35, add: true }));
    m.position.y = (h || 5) / 2;
    return m;
  };
  GF.updateFx = function (dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.kind === 'ring') { f.m.scale.setScalar(f.from + (f.r - f.from) * (1 - Math.pow(1 - k, 2))); f.m.material.opacity = 0.85 * (1 - k); }
      else if (f.kind === 'tele') { f.fill.scale.setScalar(Math.max(0.01, k)); if (!f.alive) f.t = f.dur; }
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
        if (f.m.material && f.kind !== 'particle') f.m.material.dispose && f.kind !== 'tele' && f.m.material.dispose();
        if (f.kind === 'tele') { f.fill.material.dispose(); f.m.children[0].material.dispose(); }
        if (f.dispose && f.m.geometry) f.m.geometry.dispose();
        fx.splice(i, 1);
      }
    }
  };
  GF.clearFx = function () { for (const f of fx) scene.remove(f.m); fx.length = 0; };

  const v3 = window.THREE ? new THREE.Vector3() : null;
  GF.toScreen = function (x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, behind: v3.z > 1 };
  };
  GF.render = function () { if (renderer) renderer.render(scene, camera); };

  AE.game.gfx = GF;
})();
