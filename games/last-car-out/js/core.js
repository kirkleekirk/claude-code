/* Last Car Out — core: namespace, helpers, storage, icons. */
(function () {
  'use strict';
  const LCO = (window.LCO = window.LCO || { data: {}, engine: {}, ui: {} });

  /* ---------- random ---------- */
  const R = {
    float: (a, b) => a + Math.random() * (b - a),
    int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /* entries: array of [weight, value] */
    weighted(entries) {
      const list = entries.filter((e) => e[0] > 0);
      const total = list.reduce((s, e) => s + e[0], 0);
      if (!total) return list.length ? list[0][1] : undefined;
      let roll = Math.random() * total;
      for (const e of list) {
        roll -= e[0];
        if (roll <= 0) return e[1];
      }
      return list[list.length - 1][1];
    },
    rangeRoll: (rng) => (Array.isArray(rng) ? R.int(rng[0], rng[1]) : rng),
  };

  /* ---------- utilities ---------- */
  let uidCounter = 0;
  const U = {
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    uid: (p = 'i') => p + '_' + Date.now().toString(36) + '_' + (uidCounter++).toString(36) + Math.random().toString(36).slice(2, 6),
    fmt: (n) => Math.round(n).toLocaleString('en-US'),
    pct: (x, digits = 0) => (x * 100).toFixed(digits) + '%',
    signed: (n) => (n >= 0 ? '+' : '') + n,
    clone: (o) => JSON.parse(JSON.stringify(o)),
    esc: (s) =>
      String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
    carNumber: () => {
      const n = R.int(40, 99999);
      return n.toLocaleString('en-US');
    },
    plural: (n, one, many) => (n === 1 ? one : many || one + 's'),
    sum: (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0),
  };

  /* ---------- storage (localStorage, fail-soft) ---------- */
  const SAVE_KEY = 'lco.save.v1';
  const store = {
    available() {
      try {
        const k = '__lco_probe';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },
    load() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    save(state) {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch (e) {
        /* ignore */
      }
    },
    exportCode(state) {
      const json = JSON.stringify(state);
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return 'LCO1:' + btoa(bin);
    },
    importCode(code) {
      const trimmed = String(code || '').trim();
      if (!trimmed.startsWith('LCO1:')) throw new Error('That is not a Last Car Out save code (it should start with LCO1:).');
      const bin = atob(trimmed.slice(5));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const state = JSON.parse(new TextDecoder().decode(bytes));
      if (!state || !state.player || typeof state.v !== 'number') throw new Error('The save code is damaged or incomplete.');
      return state;
    },
  };

  /* ---------- icons (24px stroke glyphs) ---------- */
  const P = {
    club: '<path d="M5 19L14 10"/><rect x="12.5" y="3.5" width="7" height="7" rx="2" transform="rotate(45 16 7)"/>',
    blade: '<path d="M4 20l3-3M6 16l2 2M8 16L19 5l.5 3.5L10 18z"/>',
    spear: '<path d="M4 20L16 8"/><path d="M14 6l6-2-2 6-2.5.5z"/>',
    sling: '<path d="M12 21v-8M12 13L6.5 4.5M12 13l5.5-8.5"/><path d="M6.5 4.5c2 3 9 3 11 0"/>',
    gauntlet: '<rect x="6" y="9" width="12" height="10" rx="3"/><path d="M8.5 9V6M11 9V5M13.5 9V5M16 9V6.5M6 13h4"/>',
    baton: '<path d="M5 19L17 7"/><circle cx="18" cy="6" r="2.2"/><path d="M3.5 20.5l2-2"/>',
    axe: '<path d="M5 21l9.5-11.5"/><path d="M12.5 7.5l3-3.5c2.5 1 4 3 4.5 5.5L16 11.5z"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    lantern: '<path d="M9 5h6M12 2.5V5M8 7.5h8l-1 10.5H9z"/><path d="M10 21h4M12 11v3.5"/>',
    tool: '<path d="M15 4a4 4 0 0 0-1.2 5.6L4.5 19l.5 1.5 1.5.5 9.4-9.3A4 4 0 0 0 21 10.2l-3.2-.8-.8-3.2z"/>',
    tape: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8.5" cy="11.5" r="2"/><circle cx="15.5" cy="11.5" r="2"/><path d="M7 18l1.5-3h7l1.5 3"/>',
    mirror: '<ellipse cx="12" cy="9" rx="5" ry="6"/><path d="M12 15v6M9 21h6M10 6.5l2-2"/>',
    coat: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7z"/><path d="M12 6v15"/>',
    vest: '<path d="M8 3h2l2 4 2-4h2l3 5v13H5V8z"/><path d="M12 7v14"/>',
    plate: '<path d="M5 5h14v7c0 5-3 8-7 9-4-1-7-4-7-9z"/><path d="M5 10h14M12 5v16"/>',
    sweater: '<path d="M8 4l4 2 4-2 5 4-2 4-2-1v10H7V11l-2 1-2-4z"/><path d="M9.5 14h5M9.5 17h5"/>',
    ring: '<circle cx="12" cy="14" r="6"/><path d="M9.5 5.5L12 8l2.5-2.5L12 3z"/>',
    pendant: '<path d="M5 3c0 5 3 8 7 8s7-3 7-8"/><path d="M12 11l3 4-3 5-3-5z"/>',
    badge: '<circle cx="12" cy="10" r="6"/><path d="M9 15l-2 6 5-3 5 3-2-6"/>',
    coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>',
    watch: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.5 1.5M10 3h4M12 3v3.5"/>',
    ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14.5 7.5v1.5M14.5 11.25v1.5M14.5 15v1.5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    fang: '<path d="M6 4c2-1 4 0 6 0s4-1 6 0c1 4-1 6-2 8l-1 8-2-6-2 6-1-8c-1-2-3-4-2-8z"/>',
    feather: '<path d="M20 4C10 4 5 10 5 19"/><path d="M20 4c0 8-6 13-15 15M9 15h5"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.2 15h9.6"/>',
    bandage: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M10.5 10.5l.01.01M13.5 13.5l.01.01M12 12l.01.01M10.5 13.5l.01.01M13.5 10.5l.01.01"/>',
    can: '<ellipse cx="12" cy="6" rx="6" ry="2"/><path d="M6 6v12c0 1.1 2.7 2 6 2s6-.9 6-2V6M6 11h12"/>',
    bomb: '<circle cx="11" cy="14" r="6"/><path d="M15 10l3-3M18 7l2.5-.5M18 7l.5-2.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14.5 8.5l2 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    crystal: '<path d="M9 2.5h6l4 5.5-7 14L5 8z"/><path d="M5 8h14M9 2.5L12 8l3-5.5M12 8v14"/>',
    cup: '<path d="M4 8h12v5a6 6 0 0 1-12 0z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2M3 21h14"/>',
    globe: '<circle cx="12" cy="10" r="7"/><path d="M6.5 21h11l-2-4.5h-7z"/><path d="M9 8l.01.01M14 11l.01.01M12 6l.01.01"/>',
    jar: '<path d="M8 3h8M7 6h10v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M7 10h10"/>',
    skull: '<path d="M5 11a7 7 0 0 1 14 0v4l-2 1v3H7v-3l-2-1z"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    door: '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r="1"/>',
    hatch: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 10h16M9 14h6"/>',
    chest: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M3 9a9 4.5 0 0 1 18 0M11 12h2v3h-2z"/>',
    swords: '<path d="M4 4l10 10M20 4L10 14M14 14l3 3M10 14l-3 3M16 19.5l3.5-3.5M8 19.5L4.5 16"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17l.01.01"/>',
    bed: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1M12 15v1M8 12h1M15 12h1"/>',
    shrine: '<path d="M12 3l8 6H4z"/><path d="M6 9v10M18 9v10M4 21h16M12 13v4"/>',
    trap: '<path d="M3 17l3-6 3 6 3-6 3 6 3-6 3 6M3 20h18"/>',
    cart: '<path d="M3 5h2l2 10h11l2-7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
    flee: '<path d="M4 12h14M13 6l6 6-6 6"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    bag: '<path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 13h6"/>',
    pouch: '<path d="M7 7h10l2 12H5z"/><path d="M9 7c0-2 1-3 3-3s3 1 3 3"/><rect x="10" y="11" width="4" height="4" rx="1"/>',
    train: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 10h16M8 21l2-4M16 21l-2-4"/><circle cx="8.5" cy="13.5" r="1"/><circle cx="15.5" cy="13.5" r="1"/>',
    anvil: '<path d="M4 7h12c0 3 2 4 4 4v2h-5l1 4H8l1-4H6C5 10 4 9 4 7z"/><path d="M7 21h10"/>',
    book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 2 4 1-2 1-4 1-7z"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
    down: '<path d="M12 4v16M6 14l6 6 6-6"/>',
    up: '<path d="M12 20V4M6 10l6-6 6 6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    tar: '<path d="M4 9c3 0 3 3 6 3s3-3 6-3 4 2 4 2v3c0 4-4 7-8 7s-8-3-8-7z"/><path d="M9 5.5c0 1 .5 1.5 1 1.5M15 3.5c0 1 .5 1.5 1 1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h17"/>',
    ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2z"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="10" r="1"/>',
    thorns: '<path d="M12 2v20M5 7l7 3 7-3M5 17l7-3 7 3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    hand: '<path d="M8 12.5V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5a1.5 1.5 0 0 1 3 0v7.5M17 11a1.5 1.5 0 0 1 3 0v3.5c0 4.1-3 7.5-7.2 7.5-2.6 0-4.3-1.1-5.7-3.2L4.4 14.6a1.5 1.5 0 0 1 2.4-1.8L8 14.3"/>',
  };
  function icon(name, cls) {
    const body = P[name] || P.question;
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  LCO.R = R;
  LCO.U = U;
  LCO.store = store;
  LCO.icon = icon;
  LCO.ICON_NAMES = Object.keys(P);
})();
