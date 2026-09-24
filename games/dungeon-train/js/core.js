/* Dungeon Train — core: namespace, helpers, storage, settings, icons, synthesized sound. */
(function () {
  'use strict';
  const DT = (window.DT = window.DT || { data: {}, meta: {}, game: {}, ui: {} });

  const R = {
    float: (a, b) => a + Math.random() * (b - a),
    int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted(entries) {
      const list = entries.filter((e) => e[0] > 0);
      let roll = Math.random() * list.reduce((s, e) => s + e[0], 0);
      for (const e of list) { roll -= e[0]; if (roll <= 0) return e[1]; }
      return list.length ? list[list.length - 1][1] : undefined;
    },
  };

  let uidN = 0;
  const U = {
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    uid: (p) => (p || 'i') + '_' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6),
    fmt: (n) => Math.round(n).toLocaleString('en-US'),
    fmt1: (n) => (Math.round(n * 10) / 10).toLocaleString('en-US'),
    pct: (x) => Math.round(x * 100) + '%',
    spct: (x) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + '%',
    signed: (n) => (n >= 0 ? '+' : '−') + Math.abs(n),
    clone: (o) => JSON.parse(JSON.stringify(o)),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    sum: (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0),
    angleDiff: (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
    dist2: (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
    plural: (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`,
  };

  const SAVE_KEY = 'dt.save.v1';
  const SETTINGS_KEY = 'dt.settings.v1';
  const DEFAULT_SETTINGS = { volume: 0.6, muted: false, shake: true, sens: 1, invertY: false, fov: 70, numbers: true, invPause: true, freeCam: false, zoom: 1 };
  const store = {
    load() { try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    save(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
    loadSettings() { try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); } },
    saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } },
    exportCode(state) {
      const bytes = new TextEncoder().encode(JSON.stringify(state));
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return 'DT1:' + btoa(bin);
    },
    importCode(code) {
      const t = String(code || '').trim();
      if (!t.startsWith('DT1:')) throw new Error('That is not a Dungeon Train save code (it should start with DT1:).');
      const bin = atob(t.slice(4));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const s = JSON.parse(new TextDecoder().decode(bytes));
      if (!s || s.v !== 2 || !s.chars) throw new Error('The save code is damaged or incomplete.');
      return s;
    },
  };
  const settings = store.loadSettings();
  const saveSettings = () => store.saveSettings(settings);

  /* 24px stroke icons for buttons, stats and small UI */
  const P = {
    sword: '<path d="M14.5 3.5H20.5V9.5L9 21 3 15z"/><path d="M13 5l6 6M5 13l6 6M3 21l2-2"/>',
    fist: '<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V11M10 10V6.5a1.5 1.5 0 0 1 3 0V10M13 10V7a1.5 1.5 0 0 1 3 0v3M16 10.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-3a1.5 1.5 0 0 1 3 0"/>',
    hat: '<path d="M4 17a8 8 0 0 1 16 0v3H4z"/><circle cx="7.5" cy="8" r="2"/><circle cx="16.5" cy="8" r="2"/><path d="M8 17h8"/>',
    helmet: '<path d="M4 15a8 8 0 0 1 16 0v4H4z"/><path d="M12 7v12M4 15h16"/>',
    armor: '<path d="M8 3l4 2 4-2 4 3-2 5v10H6V11L4 6z"/><path d="M9 11h6"/>',
    gauntlet: '<path d="M6 21v-8l-2-3 2-6h4l1 5h3l1-3h3l1 5-2 4v6z"/><path d="M6 13h12"/>',
    boots: '<path d="M7 3h5v10l7 3v4H4v-4l3-2z"/><path d="M4 17h15"/>',
    collar: '<path d="M4 9c4 3 12 3 16 0v4c-4 3-12 3-16 0z"/><circle cx="12" cy="16.5" r="2.5"/>',
    relic: '<path d="M8 3h8l-4 5z"/><circle cx="12" cy="14" r="6"/><circle cx="12" cy="14" r="2.5"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21L8 9l4-6 4 6z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10a2.5 2 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2 0 0 0 5 0"/>',
    dust: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    crystal: '<path d="M9 2.5h6l4 5.5-7 14L5 8z"/><path d="M5 8h14M9 2.5L12 8l3-5.5M12 8v14"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 2 4 1-2 1-4 1-7z"/>',
    drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    vine: '<path d="M12 21V9M12 13c-4 0-6-3-6-6 3 0 6 2 6 6zM12 10c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
    moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>',
    ghost: '<path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="10" r="1"/><circle cx="14.5" cy="10" r="1"/>',
    hook: '<path d="M12 3v11a4 4 0 1 1-8 0M12 3l3 3M12 3l-3 3"/>',
    spin: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>',
    pancake: '<ellipse cx="12" cy="15" rx="9" ry="3.5"/><path d="M3 15v-2.5C3 10.6 7 9 12 9s9 1.6 9 3.5V15"/><path d="M9 7c0-2 3-2 3-4M14 7c0-2 3-2 3-4"/>',
    potion: '<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.2 15h9.6"/>',
    bomb: '<circle cx="11" cy="14" r="6"/><path d="M15 10l3-3M18 7l2.5-.5M18 7l.5-2.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14.5 8.5l2 2"/>',
    rainbow: '<path d="M3 18a9 9 0 0 1 18 0M6 18a6 6 0 0 1 12 0M9 18a3 3 0 0 1 6 0"/>',
    watch: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M10 3h4M12 3v3"/>',
    book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/>',
    chest: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M3 9a9 4.5 0 0 1 18 0M11 12h2v3h-2z"/>',
    door: '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r="1"/>',
    train: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 10h16M8 21l2-4M16 21l-2-4"/><circle cx="8.5" cy="13.5" r="1"/><circle cx="15.5" cy="13.5" r="1"/>',
    loop: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M20 4v5h-5M4 20v-5h5"/>',
    tree: '<path d="M12 22v-7"/><path d="M12 3c-4 0-7 3-7 6.5 0 2 1 3.5 2.5 4.5h9c1.5-1 2.5-2.5 2.5-4.5C19 6 16 3 12 3z"/><rect x="9" y="8" width="6" height="4" rx="1"/>',
    bag: '<path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 13h6"/>',
    tummy: '<ellipse cx="12" cy="13" rx="8" ry="7"/><path d="M9 13a3 3 0 0 0 6 0"/><circle cx="9" cy="10" r=".6"/><circle cx="15" cy="10" r=".6"/>',
    bmo: '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="7.5" y="5.5" width="9" height="7" rx="1"/><path d="M9 16h2M10 15v2M14.5 16h.01M16 17.5h.01"/>',
    goose: '<path d="M14 4c-2 0-3 1.5-3 3 0 2 2 3 2 5-4-1-9 1-9 5 0 2 2 3 5 3h6c3 0 6-2 6-6 0-3-2-5-2-7 0-2-3-3-5-3z"/><path d="M14 4l3-1"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    anvil: '<path d="M3 8h13a5 5 0 0 1-5 5H9l1 4H7l1 4h8l1-4h-3l1-4"/><path d="M16 8h5"/>',
    recycle: '<path d="M7 19H4l3-5M17 19h3l-3-5M12 4l-2 3M12 4l2 3"/><path d="M7 14l-3-5 5-1M17 14l3-5-5-1M9 19h6"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    dash: '<path d="M4 12h9M4 7h6M4 17h6M13 6l6 6-6 6"/>',
    hand: '<path d="M8 12.5V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5a1.5 1.5 0 0 1 3 0v7.5M17 11a1.5 1.5 0 0 1 3 0v3.5c0 4.1-3 7.5-7.2 7.5-2.6 0-4.3-1.1-5.7-3.2L4.4 14.6a1.5 1.5 0 0 1 2.4-1.8L8 14.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h17"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c5 2 12 2 17 0M5 17c4-2 10-2 14 0"/>',
    trap: '<path d="M3 17l3-6 3 6 3-6 3 6 3-6 3 6M3 20h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    snail: '<path d="M3 18h13a5 5 0 0 0 0-10 4 4 0 0 0-4 4 2 2 0 0 0 4 0"/><path d="M16 8l1-4M19 9l2-3"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17l.01.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    skull: '<path d="M5 11a7 7 0 0 1 14 0v4l-2 1v3H7v-3l-2-1z"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>',
    feather: '<path d="M20 4C10 4 5 10 5 19"/><path d="M20 4c0 8-6 13-15 15M9 15h5"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    lantern: '<path d="M9 3h6M12 3v2M8 7h8l-1 11H9z"/><path d="M7 20h10M10 11h4"/>',
    torch: '<path d="M10 21l1-9h2l1 9zM12 3c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z"/>',
    whistle: '<path d="M3 11h9a5 5 0 1 1-5 5v-2H3z"/><path d="M12 11V7h4"/>',
    fan: '<path d="M12 12L4 6M12 12l8-6M12 12V3M12 12v9"/><circle cx="12" cy="12" r="2"/>',
    rain: '<path d="M7 3v5M12 3v8M17 3v5M9 14v4M15 13v5M12 17v4"/>',
    heal: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    sparkle: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>',
  };
  const icon = (name, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[name] || P.question) + '</svg>';

  /* ---------- synthesized sound effects ---------- */
  const sfx = (function () {
    let ctx = null, master = null, noiseBuf = null;
    const last = {};
    function unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = settings.muted ? 0 : settings.volume * 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function tone(f0, f1, dur, type, vol, delay) {
      const t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, freq, delay) {
      const t = ctx.currentTime + (delay || 0);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.02);
    }
    const SOUNDS = {
      swing: () => noise(0.12, 0.25, 2400),
      heavy: () => { noise(0.2, 0.3, 900); tone(160, 70, 0.2, 'sine', 0.2); },
      hit: () => { noise(0.08, 0.4, 900); tone(220, 90, 0.08, 'square', 0.12); },
      crit: () => { noise(0.1, 0.45, 1400); tone(660, 220, 0.14, 'sawtooth', 0.12); },
      punch: () => { noise(0.1, 0.5, 500); tone(140, 60, 0.12, 'sine', 0.3); },
      strum: () => { [196, 247, 294].forEach((f, i) => tone(f, f * 0.99, 0.25, 'triangle', 0.08, i * 0.02)); },
      drum: () => { tone(120, 45, 0.18, 'sine', 0.4); noise(0.08, 0.3, 300); },
      note: () => tone(523, 523, 0.18, 'triangle', 0.12),
      zap: () => { tone(1400, 300, 0.12, 'sawtooth', 0.1); noise(0.1, 0.2, 4000); },
      shatter: () => { noise(0.25, 0.4, 5200); tone(2200, 800, 0.2, 'triangle', 0.1); },
      hurt: () => tone(300, 120, 0.18, 'sawtooth', 0.18),
      coin: () => { tone(988, 988, 0.06, 'square', 0.1); tone(1318, 1318, 0.12, 'square', 0.1, 0.06); },
      pickup: () => tone(520, 880, 0.12, 'triangle', 0.2),
      rare: () => { tone(523, 523, 0.12, 'triangle', 0.2); tone(659, 659, 0.12, 'triangle', 0.2, 0.1); tone(784, 784, 0.12, 'triangle', 0.2, 0.2); tone(1046, 1046, 0.3, 'triangle', 0.22, 0.3); },
      break: () => { noise(0.2, 0.45, 700); tone(180, 70, 0.15, 'square', 0.1); },
      open: () => { tone(330, 660, 0.18, 'triangle', 0.2); tone(660, 990, 0.2, 'triangle', 0.16, 0.12); },
      unlock: () => { tone(440, 880, 0.1, 'square', 0.12); tone(880, 1320, 0.14, 'triangle', 0.14, 0.08); },
      dash: () => noise(0.16, 0.2, 3200),
      ability: () => { tone(300, 900, 0.22, 'sawtooth', 0.12); noise(0.2, 0.15, 2000); },
      explode: () => { noise(0.45, 0.6, 300); tone(120, 40, 0.4, 'sine', 0.4); },
      freeze: () => { tone(1800, 600, 0.3, 'sine', 0.12); noise(0.3, 0.15, 5000); },
      levelup: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, 0.14, 'square', 0.12, i * 0.08)); },
      extract: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, f * 1.01, 0.22, 'triangle', 0.18, i * 0.12)); },
      ko: () => tone(440, 110, 0.6, 'sawtooth', 0.2),
      click: () => tone(700, 700, 0.03, 'square', 0.06),
      equip: () => { noise(0.08, 0.2, 1800); tone(300, 500, 0.08, 'triangle', 0.14); },
      error: () => tone(200, 150, 0.12, 'square', 0.1),
      super: () => { [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, f * 1.5, 0.2, 'sawtooth', 0.12, i * 0.05)); noise(0.6, 0.35, 900, 0.1); },
      enemyShot: () => tone(900, 400, 0.12, 'triangle', 0.08),
      scream: () => { tone(500, 900, 0.5, 'sawtooth', 0.2); tone(510, 880, 0.5, 'square', 0.1); },
      bell: () => { tone(880, 870, 0.8, 'sine', 0.2); tone(1320, 1310, 0.6, 'sine', 0.1); },
      boss: () => { [110, 98, 82].forEach((f, i) => tone(f, f * 0.98, 0.5, 'sawtooth', 0.18, i * 0.35)); },
      door: () => { noise(0.4, 0.3, 400); tone(90, 60, 0.4, 'square', 0.1); },
      tick: () => tone(1200, 1200, 0.02, 'square', 0.05),
    };
    function play(name) {
      if (!ctx || settings.muted || !SOUNDS[name]) return;
      const now = performance.now();
      if (last[name] && now - last[name] < 45) return;
      last[name] = now;
      try { SOUNDS[name](); } catch (e) { /* audio is best-effort */ }
    }
    function setVolume(v) { settings.volume = U.clamp(v, 0, 1); if (master) master.gain.value = settings.muted ? 0 : settings.volume * 0.5; saveSettings(); }
    function toggleMute() { settings.muted = !settings.muted; if (master) master.gain.value = settings.muted ? 0 : settings.volume * 0.5; saveSettings(); return settings.muted; }
    return { unlock, play, setVolume, toggleMute };
  })();

  DT.R = R;
  DT.U = U;
  DT.store = store;
  DT.settings = settings;
  DT.saveSettings = saveSettings;
  DT.icon = icon;
  DT.sfx = sfx;
})();
