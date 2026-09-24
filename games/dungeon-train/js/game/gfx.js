/* Rendering: renderer, camera, toon materials, ink outlines, generated textures, lighting moods, effects. */
(function () {
  'use strict';
  const GF = {};
  const OUTLINE = 0x1d2340;
  let renderer, scene, camera, gradient;
  const matCache = new Map();
  const basicCache = new Map();

  GF.ok = false;
  /* Colors are written as sRGB hex (what you see in a color picker). The renderer lights in linear space
     and converts back to sRGB, so every authored color is converted to linear first. Without this,
     everything comes out washed-out and pastel. */
  const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
  GF.lin = lin;
  GF.init = function (canvas) {
    if (!window.THREE) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { console.error('WebGL unavailable', e); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(DT.settings.fov || 70, 1, 0.1, 300);
    const hemi = new THREE.HemisphereLight(0xffffff, lin('#8a7a6a'), HEMI);
    const sun = new THREE.DirectionalLight(0xffffff, SUN);
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
  /* Toon lighting: sky light + one sun. Lit faces land close to their authored color, shaded faces
     about 70%, the way a cel-shaded cartoon reads. `sun` sets where the light comes from. */
  const HEMI = 0.56, SUN = 0.5;
  GF.setMood = function (o) {
    if (!GF.hemi) return;
    if (o.light != null) { GF.hemi.intensity = HEMI * o.light + 0.05; GF.sun.intensity = SUN * o.light; }
    if (o.sun) GF.sun.position.set(o.sun[0], o.sun[1], o.sun[2]);
    if (o.bg) scene.background = new THREE.Color(o.bg);
    if (o.fog) scene.fog = new THREE.Fog(lin(o.fog[0]), o.fog[1], o.fog[2]);
    else if (o.fog === null) scene.fog = null;
  };

  /* ---------- materials ---------- */
  GF.mat = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.emissive || '') + '|' + (o.ei || '') + '|' + (o.opacity || 1);
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshToonMaterial({ color: lin(color), gradientMap: gradient });
    if (o.emissive) { m.emissive = lin(o.emissive); m.emissiveIntensity = o.ei || 0.6; }
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    matCache.set(key, m);
    return m;
  };
  GF.texMat = function (tex, o) {
    o = o || {};
    const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient, color: lin(o.tint || '#ffffff') });
    if (o.emissive) { m.emissive = lin(o.emissive); m.emissiveIntensity = o.ei || 0.3; }
    return m;
  };
  GF.basic = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.opacity || 1) + '|' + (o.add ? 'a' : '') + '|' + (o.side || '');
    if (basicCache.has(key)) return basicCache.get(key);
    const m = new THREE.MeshBasicMaterial({ color: lin(color) });
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.add) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
    if (o.side === 'double') m.side = THREE.DoubleSide;
    basicCache.set(key, m);
    return m;
  };
  const outlineMat = new (window.THREE ? THREE.MeshBasicMaterial : Object)(window.THREE ? { color: lin(OUTLINE), side: THREE.BackSide } : {});
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
      /* open tubes (capes, robes): 'tube' faces out, 'tubein' faces in (the lining). e = arc */
      case 'tube': case 'tubein': {
        g = new THREE.CylinderGeometry(a, b, c, d || 16, 1, true, 0, e || Math.PI * 2);
        if (kind === 'tubein') {
          const idx = g.index.array;
          for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
          const n = g.attributes.normal.array;
          for (let i = 0; i < n.length; i++) n[i] = -n[i];
        }
        break;
      }
      /* the top of a sphere down to angle b (helmets, domes, hat brims) */
      case 'cap': g = new THREE.SphereGeometry(a, 22, 12, 0, Math.PI * 2, 0, b); break;
      /* a teardrop / flame / gumdrop: round bottom of radius a, pointed top, height b (centered) */
      case 'drop': {
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(t) * a, a + Math.sin(t) * a)); }
        for (let i = 1; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector2(Math.max(0.0001, a * Math.pow(1 - u, c || 1.3) * (1 + 0.22 * Math.sin(u * Math.PI))), a + u * (b - a))); }
        g = new THREE.LatheGeometry(pts, 18);
        g.translate(0, -b / 2, 0);
        break;
      }
      /* a pie slice (peppermint stripes, pizza, clock hands): radius a, from angle b, width c */
      case 'wedge': g = new THREE.CircleGeometry(a, 10, b, c); break;
      /* a flat four-point star (sparkles) */
      case 'star4': {
        const sh = new THREE.Shape();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? a * 0.28 : a, t = (i / 8) * Math.PI * 2 + Math.PI / 2; if (i) sh.lineTo(Math.cos(t) * r, Math.sin(t) * r); else sh.moveTo(Math.cos(t) * r, Math.sin(t) * r); }
        g = new THREE.ShapeGeometry(sh);
        break;
      }
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
        ctx.fillStyle = line.scenery === 'well' ? 'rgba(125,255,90,.1)' : line.scenery === 'spikes' || line.scenery === 'tunnel' || line.scenery === 'castle' ? 'rgba(255,120,120,.18)' : 'rgba(255,255,255,.9)';
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
          case 'rocks': ctx.fillStyle = i % 2 ? '#8c8177' : '#6e645b'; ctx.beginPath(); ctx.moveTo(x - 26, y + 40); ctx.lineTo(x - 18, y - 6); ctx.lineTo(x + 4, y - 22 - (i % 3) * 10); ctx.lineTo(x + 24, y + 2); ctx.lineTo(x + 26, y + 40); ctx.fill(); if (i % 3 === 0) { ctx.fillStyle = ['#ffd84a', '#6ab7ff', '#ff6b8a'][i % 3 === 0 ? (i / 3) % 3 : 0]; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 7, y - 8); ctx.lineTo(x - 7, y - 8); ctx.fill(); } break;
          case 'towers': ctx.fillStyle = ['#6f5fc0', '#8a6fe0', '#5a4a9a'][i % 3]; ctx.fillRect(x - 10, y - 60 - (i % 4) * 18, 20, 100 + (i % 4) * 18); ctx.fillStyle = ['#ff8fc7', '#ffcf3d', '#7fe3ff'][i % 3]; ctx.beginPath(); ctx.moveTo(x - 16, y - 60 - (i % 4) * 18); ctx.lineTo(x, y - 100 - (i % 4) * 18); ctx.lineTo(x + 16, y - 60 - (i % 4) * 18); ctx.fill(); break;
          case 'castle': ctx.fillStyle = i % 2 ? '#2a1020' : '#3a1830'; ctx.fillRect(x - 14, y - 40, 28, 80); for (let k = 0; k < 3; k++) ctx.fillRect(x - 14 + k * 11, y - 50, 7, 10); if (i % 4 === 0) { ctx.fillStyle = '#ffd0e0'; ctx.fillRect(x - 3, y - 20, 6, 9); } if (i % 5 === 1) { ctx.fillStyle = '#1d0a18'; ctx.beginPath(); ctx.arc(x + 10, y - 120, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x, y - 121, 20, 2); } break;
          case 'well': ctx.strokeStyle = i % 2 ? '#1a2a18' : '#243a20'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x, y - 30); ctx.lineTo(x - 16, y - 50); ctx.moveTo(x, y - 18); ctx.lineTo(x + 18, y - 40); ctx.stroke(); if (i % 3 === 0) { ctx.fillStyle = 'rgba(125,255,90,.55)'; ctx.beginPath(); ctx.arc(x + 20, y - 70, 4, 0, Math.PI * 2); ctx.fill(); } break;
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
  /* effects whose materials come from the shared caches (never dispose those) */
  const SHARED_FX = { puff: 1, spark: 1, pop: 1 };
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
  /* An x-ray silhouette, so a boss or a wall in front of the hero never hides them. Pass 1 marks the
     pixels where the hero is visible (stencil = 1); pass 2 draws a flat silhouette only where the hero is
     behind something (depth test GREATER) and not visible, so the hero's own parts never show through. */
  let xrayMark = null;
  const xrayMats = {};
  const xv = window.THREE ? new THREE.Vector3() : null;
  GF.xray = function (root, color) {
    if (!xrayMark) xrayMark = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthFunc: THREE.LessEqualDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, fog: false });
    let sil = xrayMats[color];
    if (!sil) sil = xrayMats[color] = new THREE.MeshBasicMaterial({ color: lin(color), transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth, stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, fog: false });
    root.updateMatrixWorld(true);
    const list = [];
    root.traverse((o) => {
      if (!o.isMesh || o.userData.outline || o.renderOrder === -1 || o.userData.xray) return;
      /* skip the feet: they sit a hair into the floor and would outline themselves */
      xv.setFromMatrixPosition(o.matrixWorld); root.worldToLocal(xv);
      if (xv.y < 0.2) return;
      list.push(o);
    });
    for (const o of list) {
      const a = new THREE.Mesh(o.geometry, xrayMark);
      const b = new THREE.Mesh(o.geometry, sil);
      a.renderOrder = 20; b.renderOrder = 21;
      for (const m of [a, b]) { m.userData.outline = true; m.userData.xray = true; o.add(m); }
    }
  };
  /* A small dust puff (dodge rolls, landings): quick outlined puffs, no sparkles. */
  GF.dust = function (x, z, size, color) {
    size = size || 0.5;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = GF.part(GF.geo('sphere', 1, 10, 8), color || (i % 2 ? '#f2ebdd' : '#ddd3c0'), null, { inkT: 0.08 });
      m.position.set(x + Math.cos(a) * size * 0.3, 0.12 + Math.random() * 0.1, z + Math.sin(a) * size * 0.3);
      m.scale.setScalar(0.001);
      scene.add(m);
      fx.push({ m, t: -i * 0.02, dur: 0.38, kind: 'puff', s: size * (0.32 + Math.random() * 0.18), v: new THREE.Vector3(Math.cos(a) * size * 1.4, size * (0.6 + Math.random() * 0.5), Math.sin(a) * size * 1.4) });
    }
  };
  /* Cartoon smoke puff: ink-outlined cloud balls pop out and shrink away, plus a few sparkles. */
  GF.poof = function (x, y, z, size, color) {
    size = size || 1;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const center = i === 0;
      const r = size * (center ? 0.6 : 0.36 + Math.random() * 0.2);
      const m = GF.part(GF.geo('sphere', 1, 14, 10), color || (i % 3 ? '#f7f4ee' : '#e4dfd6'), null, { inkT: 0.07 });
      const off = center ? 0 : size * 0.34;
      m.position.set(x + Math.cos(a) * off, y + (center ? 0.1 : (Math.random() - 0.2) * size * 0.4), z + Math.sin(a) * off);
      m.scale.setScalar(0.001);
      scene.add(m);
      fx.push({ m, t: -i * 0.012, dur: center ? 0.5 : 0.44, kind: 'puff', s: r, v: new THREE.Vector3(Math.cos(a) * size * (center ? 0 : 1.1), size * (0.5 + Math.random() * 0.6), Math.sin(a) * size * (center ? 0 : 1.1)) });
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GF.geo('star4', 0.2), GF.basic('#fff3a6', { side: 'double' }));
      m.position.set(x, y + size * 0.3, z);
      const a = Math.random() * Math.PI * 2;
      scene.add(m);
      fx.push({ m, t: 0, dur: 0.5, kind: 'spark', s: size * (0.7 + Math.random() * 0.5), v: new THREE.Vector3(Math.cos(a) * size * 3, size * (2 + Math.random() * 2), Math.sin(a) * size * 3) });
    }
  };
  /* A defeated monster stretches up and pops (then the puff covers it). */
  GF.pop = function (mesh, dur) {
    fx.push({ m: mesh, t: 0, dur: dur || 0.16, kind: 'pop', s0: mesh.scale.clone() });
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
      else if (f.kind === 'puff') {
        if (f.t < 0) continue;
        const e = k < 0.25 ? 1 - Math.pow(1 - k / 0.25, 3) : 1 - (k - 0.25) / 0.75;
        f.m.scale.setScalar(Math.max(0.001, f.s * e));
        f.m.position.addScaledVector(f.v, dt);
        f.v.multiplyScalar(Math.pow(0.02, dt));
      } else if (f.kind === 'spark') {
        f.v.y -= 9 * dt;
        f.m.position.addScaledVector(f.v, dt);
        f.m.lookAt(camera.position);
        f.m.rotateZ(f.t * 9);
        f.m.scale.setScalar(Math.max(0.001, f.s * (1 - k) * (k < 0.15 ? k / 0.15 : 1)));
      } else if (f.kind === 'pop') {
        f.m.scale.set(f.s0.x * (1 - k * 0.9), f.s0.y * (1 + k * 0.6) * (1 - k * k), f.s0.z * (1 - k * 0.9));
      }
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
        else if (f.kind !== 'particle' && !SHARED_FX[f.kind] && f.m.material && f.m.material.dispose) f.m.material.dispose();
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

  /* Portraits (bestiary cards): a small second renderer draws one model on a transparent background. */
  let pr = null;
  const portraits = new Map();
  GF.portrait = function (key, build, o) {
    o = o || {};
    if (portraits.has(key)) return portraits.get(key);
    if (!window.THREE) return null;
    if (!pr) {
      const cv = document.createElement('canvas');
      try {
        const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.outputEncoding = THREE.sRGBEncoding;
        r.setPixelRatio(1);
        r.setSize(o.size || 176, o.size || 176, false);
        r.setClearColor(0x000000, 0);
        const sc = new THREE.Scene();
        const hemi = new THREE.HemisphereLight(0xffffff, lin('#8a7a6a'), HEMI + 0.06);
        const sun = new THREE.DirectionalLight(0xffffff, SUN);
        sun.position.set(-5, 12, 10);
        sc.add(hemi, sun);
        pr = { r, sc, cam: new THREE.PerspectiveCamera(32, 1, 0.05, 200) };
      } catch (e) { pr = false; }
    }
    if (!pr) return null;
    const mesh = build();
    mesh.rotation.y = o.yaw != null ? o.yaw : 0.45;
    pr.sc.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3();
    mesh.traverse((c) => { if (c.isMesh && !c.userData.outline && c.renderOrder !== -1 && c.visible && !c.userData.noFrame) { if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); } });
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const rad = Math.max(size.y * 0.6, size.x * 0.55, size.z * 0.4, 0.5);
    const dist = (rad / Math.tan((32 / 2) * Math.PI / 180)) * 1.05;
    pr.cam.position.set(ctr.x, ctr.y + dist * 0.22, ctr.z + dist * 0.975);
    pr.cam.lookAt(ctr.x, ctr.y, ctr.z);
    pr.r.render(pr.sc, pr.cam);
    const url = pr.r.domElement.toDataURL('image/png');
    pr.sc.remove(mesh);
    portraits.set(key, url);
    return url;
  };

  DT.game.gfx = GF;
})();
