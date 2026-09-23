/* Item art: small flat cartoon SVG drawings with an ink outline, one per art key.
   Gear uses its base/unique art key; snacks, treasure and trophies are drawn by id. */
(function () {
  'use strict';
  const D = DT.data;
  const INK = '#1d2340';
  const f = (d, fill, w) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w || 2.4}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const ln = (d, color, w) => `<path d="${d}" fill="none" stroke="${color || INK}" stroke-width="${w || 2.4}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const hi = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>`;
  const ci = (x, y, r, fill, w) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${w == null ? 2.4 : w}"/>`;
  const el = (x, y, rx, ry, fill, w) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${w == null ? 2.4 : w}"/>`;
  const re = (x, y, w, h, fill, rx, sw) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 0}" fill="${fill}" stroke="${INK}" stroke-width="${sw == null ? 2.4 : sw}"/>`;
  const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
  const rot = (deg, inner) => `<g transform="rotate(${deg} 32 32)">${inner}</g>`;
  const star = (x, y, r, fill) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1); } return f(d + 'Z', fill, 1.6); };
  const spark = (x, y, s, c) => ln(`M${x} ${y - s}V${y + s}M${x - s} ${y}H${x + s}`, c || '#fff', 1.6);

  /* ---------- Finn: swords (drawn upright, then tilted) ---------- */
  function sword(o) {
    const blades = {
      short: 'M32 5L37 12V41H27V12Z',
      great: 'M32 2L41 11V41H23V11Z',
      rapier: 'M32 3L34 9V42H30V9Z',
      crystal: 'M32 3L40 15L36 41H28L24 15Z',
      bone: 'M32 4L37 10L35 15L38 20L35 26L38 32L35 41H29L26 34L29 28L26 22L29 16L27 10Z',
      wood: 'M32 7L36 12V41H28V12Z',
      root: 'M31 4C36 10 33 14 37 20C40 26 34 30 36 41H28C29 33 25 28 28 22C31 16 26 11 31 4Z',
      wavy: 'M32 3C37 9 33 13 37 19C39 25 34 30 36 41H28C30 30 25 25 27 19C31 13 27 9 32 3Z',
    };
    let s = f(blades[o.shape || 'short'], o.blade);
    if (o.edge) s += hi(o.shape === 'great' ? 'M36 12V38' : 'M34 12V38');
    if (o.speck) s += dot(30, 16, 1.4, '#fff') + dot(33, 25, 1.1, '#fff') + dot(30, 33, 1.3, '#fff');
    if (o.stripe) s += ln('M30 14L34 18M30 22L34 26M30 30L34 34', o.stripe, 2);
    if (o.shape === 'rapier') s += `<path d="M24 42a8 7 0 0 0 16 0Z" fill="${o.guard}" stroke="${INK}" stroke-width="2.4"/>`;
    else s += re(o.shape === 'great' ? 17 : 20, 40, o.shape === 'great' ? 30 : 24, 5, o.guard, 2.5);
    s += re(29, 45, 6, 10, o.grip, 1.5) + ci(32, 58, 3.6, o.pommel || o.guard);
    if (o.gem) s += ci(32, 42.5, 2.4, o.gem, 1.4);
    return rot(45, s);
  }
  const SWORDS = {
    sword_wood: { shape: 'wood', blade: '#c98d4e', guard: '#8a5a2b', grip: '#6b4423' },
    sword_short: { shape: 'short', blade: '#d9e2ec', guard: '#8a8f9a', grip: '#6b4423', edge: 1 },
    sword_bone: { shape: 'bone', blade: '#efe6cf', guard: '#b8a98a', grip: '#6b4423' },
    sword_great: { shape: 'great', blade: '#cfd8e3', guard: '#6b6f7a', grip: '#4a3326', edge: 1 },
    sword_rapier: { shape: 'rapier', blade: '#ffffff', guard: '#ff5a7a', grip: '#e0283a', stripe: '#ff3b5c' },
    sword_crystal: { shape: 'crystal', blade: '#c7a6ff', guard: '#7b5cd6', grip: '#3d2d6b', edge: 1 },
    sword_finn: { shape: 'short', blade: '#ffe27a', guard: '#e0a82e', grip: '#3fa9f5', gem: '#3fa9f5', edge: 1 },
    sword_demon: { shape: 'short', blade: '#e0283a', guard: '#2a1f2e', grip: '#1a1320', gem: '#ffcf3d', edge: 1 },
    sword_grass: { shape: 'wavy', blade: '#7ed957', guard: '#4fa83a', grip: '#2f6b24', edge: 1 },
    sword_root: { shape: 'root', blade: '#9c6b3e', guard: '#6b4423', grip: '#4a3326' },
    sword_scarlet: { shape: 'short', blade: '#ff5a4f', guard: '#ffcf3d', grip: '#8a1f2a', gem: '#ffffff', edge: 1 },
    sword_magma: { shape: 'great', blade: '#ff8a2e', guard: '#3a2a2a', grip: '#2a1a1a', edge: 1, stripe: '#ffe27a' },
    sword_guardian: { shape: 'crystal', blade: '#ff9fd0', guard: '#6fd0ff', grip: '#3a4a7a', gem: '#6fd0ff', edge: 1 },
    sword_night: { shape: 'short', blade: '#3d2d6b', guard: '#1a1330', grip: '#0e0a1c', gem: '#e0283a', speck: 1 },
  };

  /* ---------- Finn: armor ---------- */
  function finnHat(main, glow) {
    return f('M14 46Q12 18 32 15Q52 18 50 46L46 54H18Z', main) + ci(18, 18, 6, main) + ci(46, 18, 6, main) +
      el(32, 40, 12, 10, '#ffd9b3') + dot(27, 39, 1.6, INK) + dot(37, 39, 1.6, INK) + ln('M28 44Q32 47 36 44', INK, 1.8) + (glow ? spark(52, 10, 4, glow) + spark(10, 30, 3, glow) : '');
  }
  const ARMOR = {
    hat: () => finnHat('#ffffff'),
    hat_og: () => finnHat('#fffbe8', '#ffcf3d') + hi('M20 24Q32 18 44 24'),
    hat_magic: () => f('M32 4L46 44H18Z', '#6fd66f') + f('M10 46Q32 38 54 46Q32 56 10 46Z', '#4fa83a') + star(33, 26, 5, '#ffcf3d') + dot(26, 36, 1.5, '#fff') + dot(39, 16, 1.2, '#fff'),
    helm: () => f('M14 44Q12 14 32 12Q52 14 50 44L48 52H16Z', '#b8c2cc') + re(20, 30, 24, 5, '#2a2e38', 2, 1.6) + ln('M32 12V28', '#8a8f9a', 2) + hi('M20 20Q26 15 32 15'),
    wizard_hat: () => f('M34 3L48 44H16Z', '#5b6bd6') + f('M8 46Q32 38 56 46Q32 56 8 46Z', '#3d4aa8') + star(30, 24, 4.5, '#ffe27a') + star(40, 34, 3, '#ffe27a') + dot(24, 38, 1.4, '#fff'),
    skull_helm: () => f('M14 38Q12 12 32 12Q52 12 50 38L46 46H40V52H24V46H18Z', '#efe6cf') + el(24, 32, 5, 6, INK, 0) + el(40, 32, 5, 6, INK, 0) + f('M32 38L29 43H35Z', INK, 1) + ln('M28 48V52M32 48V52M36 48V52', INK, 1.6),
    tunic: () => f('M20 10L28 8Q32 14 36 8L44 10L54 22L46 28L44 24V56H20V24L18 28L10 22Z', '#3fa9f5') + ln('M20 44H44', '#1d6fb0', 3) + hi('M24 16V40'),
    tunic_flame: () => f('M20 10L28 8Q32 14 36 8L44 10L54 22L46 28L44 24V56H20V24L18 28L10 22Z', '#ff7a2e') + f('M32 22C38 28 40 34 36 40Q34 44 32 44Q30 44 28 40C24 34 28 30 32 22Z', '#ffcf3d', 1.8) + f('M32 32C34 35 35 38 33 41H31C29 38 30 35 32 32Z', '#fff4c2', 1.2),
    chainmail: () => f('M18 10L28 8Q32 13 36 8L46 10L54 24L46 28V56H18V28L10 24Z', '#9aa4b1') + [16, 22, 28, 34, 40, 46, 52].map((y) => [22, 28, 34, 40].map((x) => `<circle cx="${x + (y % 12 ? 3 : 0)}" cy="${y}" r="2" fill="none" stroke="#5a6270" stroke-width="1.2"/>`).join('')).join(''),
    chainmail_crystal: () => f('M18 10L28 8Q32 13 36 8L46 10L54 24L46 28V56H18V28L10 24Z', '#b9a2ff') + [16, 24, 32, 40, 48].map((y) => [22, 30, 38].map((x) => f(`M${x + (y % 16 ? 4 : 0)} ${y - 3}L${x + 3 + (y % 16 ? 4 : 0)} ${y}L${x + (y % 16 ? 4 : 0)} ${y + 3}L${x - 3 + (y % 16 ? 4 : 0)} ${y}Z`, '#e3d8ff', 1)).join('')).join(''),
    plate: () => f('M16 12L26 8H38L48 12L54 26L46 30V54L32 58L18 54V30L10 26Z', '#cfd8e3') + ln('M32 10V56', '#8a8f9a', 2) + f('M20 30Q32 36 44 30', 'none') + hi('M22 16Q24 26 22 36'),
    plate_royal: () => f('M16 12L26 8H38L48 12L54 26L46 30V54L32 58L18 54V30L10 26Z', '#ff9fd0') + f('M24 12H40L36 22H28Z', '#ffcf3d', 1.8) + ci(32, 36, 5, '#ffcf3d', 1.8) + dot(32, 36, 2, '#e0283a') + hi('M22 18Q24 28 22 40'),
    robe: () => f('M22 8Q32 14 42 8L50 20L44 24L50 58H14L20 24L14 20Z', '#7b5cd6') + ln('M32 12V58', '#5b3fb0', 2) + star(26, 36, 3, '#ffe27a') + star(38, 46, 3, '#ffe27a') + ln('M18 52H46', '#ffe27a', 2),
    gloves: () => f('M20 58V36Q18 26 22 18Q24 14 27 18L28 28V12Q30 8 33 12V28V10Q35 6 38 10V28V14Q41 10 43 14V34L46 28Q50 26 49 32L44 46V58Z', '#b0763c') + ln('M20 50H44', '#7a4f25', 3),
    gauntlets: () => f('M20 58V36Q18 26 22 18Q24 14 27 18L28 28V12Q30 8 33 12V28V10Q35 6 38 10V28V14Q41 10 43 14V34L46 28Q50 26 49 32L44 46V58Z', '#b8c2cc') + re(18, 46, 28, 12, '#8a8f9a', 2, 2) + hi('M24 22V34'),
    gauntlets_spiked: () => f('M20 58V36Q18 26 22 18Q24 14 27 18L28 28V12Q30 8 33 12V28V10Q35 6 38 10V28V14Q41 10 43 14V34L46 28Q50 26 49 32L44 46V58Z', '#9aa4b1') + f('M26 28L28 20L30 28Z M33 26L35 18L37 26Z M39 28L41 21L43 28Z', '#e6ecf2', 1.4) + re(18, 46, 28, 12, '#6b6f7a', 2, 2),
    gauntlets_billy: () => f('M16 58V34Q14 22 20 14Q23 10 26 14L27 26V8Q30 4 34 8V26V6Q37 2 40 6V26V10Q44 6 46 10V32L50 26Q55 24 53 31L47 46V58Z', '#e0a82e') + re(14, 44, 36, 14, '#b07a1e', 3, 2) + ci(32, 51, 3.5, '#e0283a', 1.6),
    sneakers: () => f('M8 44Q8 34 16 32L28 30Q34 22 42 24L44 36L56 40Q58 48 52 50H10Q8 48 8 44Z', '#2a2e38') + ln('M10 46H54', '#ffffff', 3) + ln('M30 32L34 30M32 36L37 33', '#fff', 1.6),
    boots_iron: () => f('M16 8H36V36L52 40Q58 44 56 52H14L16 36Z', '#9aa4b1') + re(14, 50, 42, 6, '#6b6f7a', 2, 2) + ln('M16 20H36M16 28H36', '#6b6f7a', 2) + hi('M20 12V32'),
    boots_winged: () => f('M18 12H36V38L52 42Q58 46 56 52H16L18 38Z', '#7a4f25') + f('M36 20Q48 8 58 12Q52 16 56 20Q48 20 44 26Q42 22 36 24Z', '#ffffff', 2) + re(16, 50, 40, 5, '#4a3326', 2, 2),
    boots_jet: () => f('M18 8H38V36L52 40Q58 44 56 50H16L18 36Z', '#8a8f9a') + f('M22 50L26 60L30 52L34 62L38 52L42 60L46 50Z', '#ff8a2e', 1.8) + re(20, 16, 16, 8, '#e0283a', 2, 1.8),
    pack: () => f('M16 20Q16 10 32 10Q48 10 48 20V54Q48 58 44 58H20Q16 58 16 54Z', '#4fa83a') + re(20, 34, 24, 16, '#3c8a2d', 3, 2) + ln('M24 10Q24 4 32 4Q40 4 40 10', INK, 2.4) + ln('M20 42H44', '#2f6b24', 1.6),
    pack_big: () => f('M14 22Q14 12 32 12Q50 12 50 22V56Q50 60 46 60H18Q14 60 14 56Z', '#4a8a5c') + el(32, 12, 18, 5, '#c98d4e') + re(18, 34, 28, 18, '#3a6e48', 3, 2) + re(22, 24, 8, 8, '#3a6e48', 2, 1.6) + re(34, 24, 8, 8, '#3a6e48', 2, 1.6),
    pack_snack: () => f('M16 20Q16 10 32 10Q48 10 48 20V54Q48 58 44 58H20Q16 58 16 54Z', '#ff9a3c') + re(20, 34, 24, 16, '#e07a20', 3, 2) + el(32, 42, 7, 4, '#f6d7a0', 1.6) + ln('M24 10Q24 4 32 4Q40 4 40 10', INK, 2.4),
    pack_finn: () => f('M16 20Q16 10 32 10Q48 10 48 20V54Q48 58 44 58H20Q16 58 16 54Z', '#6cc24a') + re(20, 34, 24, 16, '#4fa83a', 3, 2) + ln('M24 10Q24 4 32 4Q40 4 40 10', INK, 2.4) + star(32, 24, 4, '#ffcf3d') + spark(52, 10, 3, '#ffcf3d'),
  };

  /* ---------- Jake: instruments ---------- */
  function violin(body, neck, dark) {
    return rot(35, f('M32 26Q22 24 22 34Q22 40 26 42Q20 46 22 52Q24 60 32 60Q40 60 42 52Q44 46 38 42Q42 40 42 34Q42 24 32 26Z', body) +
      f('M30 4H34V28H30Z', neck) + ci(32, 5, 3, dark) + ln('M28 44Q30 46 28 48M36 44Q34 46 36 48', INK, 1.6) + re(28, 50, 8, 3, dark, 1, 1.4) + ln('M31 8V52M33 8V52', '#f6e6c8', 0.8));
  }
  function guitar(body, neck, extra) {
    return rot(35, f('M32 30Q22 28 21 38Q20 44 25 46Q18 50 21 56Q24 62 32 62Q40 62 43 56Q46 50 39 46Q44 44 43 38Q42 28 32 30Z', body) +
      re(29.5, 4, 5, 30, neck, 1, 2) + re(28, 2, 8, 6, '#2a2e38', 2, 2) + ci(32, 44, 4, INK, 0) + re(27, 52, 10, 3, '#2a2e38', 1, 1.4) + (extra || ''));
  }
  const INSTR = {
    viola: () => violin('#b0612b', '#4a3326', '#2a1a10'),
    viola_jake: () => violin('#e08a2e', '#6b4423', '#2a1a10') + spark(52, 10, 4, '#ffcf3d'),
    guitar: () => guitar('#e0582e', '#8a5a2b'),
    guitar_rainbow: () => guitar('#ff5f7a', '#6b4423', ln('M24 40Q32 36 40 40', '#ffcf3d', 3) + ln('M23 47Q32 43 41 47', '#7ed957', 3) + ln('M24 54Q32 50 40 54', '#4d9bff', 3)),
    drums: () => el(21, 42, 11, 5, '#f2e2c4') + f('M10 42V54Q21 60 32 54V42', '#b0612b') + el(43, 36, 11, 5, '#f2e2c4') + f('M32 36V50Q43 56 54 50V36', '#8a4a20') + ln('M12 46Q21 52 30 46M34 40Q43 46 52 40', '#ffcf3d', 1.6) + ln('M44 8L38 30M52 12L44 30', '#c98d4e', 3),
    drums_party: () => el(32, 26, 18, 6, '#ffffff') + f('M14 26V44Q32 54 50 44V26', '#ff5fb4') + ln('M16 32Q32 42 48 32', '#ffcf3d', 2.4) + star(32, 40, 4, '#7ed957') + el(12, 52, 7, 3, '#ffe27a') + el(52, 52, 7, 3, '#ffe27a') + ln('M12 52V60M52 52V60', INK, 2),
    bass: () => rot(20, f('M32 22Q18 20 18 34Q18 40 23 43Q15 48 17 55Q20 63 32 63Q44 63 47 55Q49 48 41 43Q46 40 46 34Q46 20 32 22Z', '#7a3e1c') + re(29.5, 1, 5, 24, '#2a1a10', 1, 2) + ln('M26 38Q28 41 26 44M38 38Q36 41 38 44', INK, 1.8) + re(27, 50, 10, 3, '#2a1a10', 1, 1.4) + ln('M31 4V52M33 4V52', '#f6e6c8', 0.8)),
    bass_axe: () => rot(30, f('M26 6H38V14Q52 12 56 24Q48 22 44 30Q50 36 46 44Q38 38 36 42V60H28V42Q26 38 18 44Q14 36 20 30Q16 22 8 24Q12 12 26 14Z', '#c01f2e') + ln('M30 16V58M34 16V58', '#ffcf3d', 0.9) + re(27, 44, 10, 4, '#2a1a10', 1, 1.4)),
    trumpet: () => f('M6 30H34V36H6Z', '#e0a82e') + f('M34 26Q46 26 58 16V50Q46 40 34 40Z', '#ffcf3d') + re(18, 22, 4, 8, '#b07a1e', 1, 1.6) + re(24, 22, 4, 8, '#b07a1e', 1, 1.6) + re(12, 36, 18, 8, 'none', 3, 2) + hi('M40 30Q48 26 54 22'),
    trumpet_guardian: () => f('M6 30H34V36H6Z', '#ff9fd0') + f('M34 24Q46 24 58 12V54Q46 42 34 42Z', '#ffcf3d') + ci(46, 33, 4, '#6fd0ff', 1.6) + re(18, 22, 4, 8, '#e0a82e', 1, 1.6) + re(24, 22, 4, 8, '#e0a82e', 1, 1.6) + spark(10, 12, 4, '#ffcf3d'),
    accordion: () => re(6, 18, 12, 28, '#e0283a', 2) + re(46, 18, 12, 28, '#e0283a', 2) + f('M18 20L24 44L30 20L36 44L42 20L46 22V42L42 44L36 20L30 44L24 20L18 42Z', '#f2e2c4', 1.8) + [22, 28, 34, 40].map((y) => dot(12, y, 1.6, '#fff')).join(''),
    accordion_lsp: () => re(6, 18, 12, 28, '#b76bff', 2) + re(46, 18, 12, 28, '#b76bff', 2) + f('M18 20L24 44L30 20L36 44L42 20L46 22V42L42 44L36 20L30 44L24 20L18 42Z', '#d9b8ff', 1.8) + star(12, 32, 4, '#ffcf3d') + star(52, 32, 4, '#ffcf3d'),
    banjo: () => rot(35, ci(32, 46, 14, '#f2e2c4') + `<circle cx="32" cy="46" r="14" fill="none" stroke="#c98d4e" stroke-width="3"/>` + re(29.5, 2, 5, 32, '#8a5a2b', 1, 2) + re(28, 1, 8, 5, '#6b4423', 2, 1.6) + ln('M31 6V56M33 6V56', '#6b4423', 0.8)),
    banjo_trunks: () => rot(35, ci(32, 46, 14, '#fdf3dc') + `<circle cx="32" cy="46" r="14" fill="none" stroke="#6cc24a" stroke-width="3"/>` + ci(32, 46, 5, '#e0283a', 1.6) + re(29.5, 2, 5, 32, '#7a4f25', 1, 2) + re(28, 1, 8, 5, '#4a3326', 2, 1.6)),
    keytar: () => rot(-20, f('M6 28H50L58 20L62 24L54 36H6Z', '#e0283a') + re(10, 30, 36, 6, '#ffffff', 0, 1.6) + [14, 19, 24, 29, 34, 39].map((x) => re(x, 30, 3, 3.5, INK, 0, 0)).join('')),
    keytar_cosmic: () => rot(-20, f('M6 28H50L58 20L62 24L54 36H6Z', '#3d2d6b') + re(10, 30, 36, 6, '#e3d8ff', 0, 1.6) + [14, 19, 24, 29, 34, 39].map((x) => re(x, 30, 3, 3.5, INK, 0, 0)).join('') + dot(20, 24, 1.3, '#fff') + dot(40, 22, 1, '#fff') + star(54, 14, 4, '#ffcf3d')),
  };

  /* ---------- Jake: collars ---------- */
  const collarBand = (fill, d) => f('M8 30Q32 44 56 30L56 38Q32 52 8 38Z', fill) + (d || '');
  const COLLARS = {
    collar: () => collarBand('#e0283a') + ci(32, 50, 6, '#ffcf3d', 2) + ln('M30 50H34', INK, 1.4),
    collar_spiked: () => collarBand('#2a2e38', f('M14 34L12 26L18 33Z M24 38L24 29L28 38Z M36 38L40 29L40 38Z M46 33L52 26L50 34Z', '#e6ecf2', 1.4)),
    collar_bell: () => collarBand('#4d9bff') + f('M26 46Q26 40 32 40Q38 40 38 46L40 54H24Z', '#ffcf3d', 2) + dot(32, 55, 2, INK),
    collar_holding: () => collarBand('#7b5cd6') + re(24, 44, 16, 14, '#5b3fb0', 3, 2) + ln('M24 49H40', '#e3d8ff', 1.6) + spark(50, 50, 3, '#e3d8ff'),
    bow_tie: () => f('M32 32L10 20V44Z', '#e0283a') + f('M32 32L54 20V44Z', '#e0283a') + re(28, 27, 8, 10, '#a01c2a', 2, 2) + hi('M14 26L24 30'),
    scarf_rainbow: () => f('M8 22Q32 34 56 22V30Q32 42 8 30Z', '#ff5f7a') + f('M8 30Q32 42 56 30V36Q32 48 8 36Z', '#ffcf3d') + f('M40 38L48 60H40L36 42Z', '#7ed957') + f('M36 42L40 60H34L32 44Z', '#4d9bff'),
  };

  /* ---------- relics ---------- */
  const RELICS = {
    sock: () => f('M22 6H40V34Q40 40 46 44L50 48Q54 56 46 58Q40 60 32 54L20 44Q16 40 18 34L22 28Z', '#fdf3dc') + ln('M22 12H40', '#e0283a', 3) + ln('M22 18H40', '#4d9bff', 3),
    candy: () => f('M20 32L6 22V42Z', '#ff9fd0') + f('M44 32L58 22V42Z', '#ff9fd0') + ci(32, 32, 13, '#ff5f7a') + ln('M24 24Q32 32 26 42M34 20Q40 30 36 44', '#fff', 2.4),
    ring: () => `<circle cx="32" cy="40" r="14" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="32" cy="40" r="14" fill="none" stroke="#ffcf3d" stroke-width="4.5"/>` + f('M24 20L32 10L40 20L32 30Z', '#4d9bff') + hi('M28 18L32 13'),
    bell: () => f('M20 44Q20 18 32 16Q44 18 44 44L48 50H16Z', '#ffcf3d') + ci(32, 54, 4, '#b07a1e') + ci(32, 13, 3, '#b07a1e', 2) + hi('M25 40Q24 28 30 22'),
    bone: () => f('M16 24A6 6 0 1 1 22 16L42 36A6 6 0 1 1 48 44A6 6 0 1 1 40 48L20 28A6 6 0 1 1 16 24Z', '#f5ecd6'),
    cloud: () => f('M14 44Q6 44 8 36Q10 28 18 30Q18 18 30 20Q36 12 44 20Q56 20 54 32Q60 36 56 42Q54 46 48 46H16Z', '#ffffff') + dot(26, 36, 1.6, INK) + dot(38, 36, 1.6, INK) + ln('M29 40Q32 43 35 40', INK, 1.6),
    shell: () => f('M10 48Q8 22 30 16Q52 14 54 36Q54 50 40 50Q28 50 28 40Q28 30 38 32Q44 34 42 40', '#e0a060') + f('M8 50H54V54H8Z', '#b0763c', 1.8),
    relic_amulet: () => ln('M16 8Q32 30 48 8', '#ffcf3d', 2.4) + f('M32 26L44 38L32 58L20 38Z', '#4fe07a') + hi('M28 36L32 32'),
    relic_bmo: () => re(16, 10, 32, 44, '#6fd0c4', 3) + re(21, 15, 22, 14, '#c9f4e8', 2, 1.8) + dot(27, 21, 1.5, INK) + dot(37, 21, 1.5, INK) + ln('M29 25Q32 27 35 25', INK, 1.4) + re(20, 44, 24, 6, '#3a8a80', 1, 1.6) + ci(38, 36, 2.6, '#e0283a', 1.4),
    relic_book: () => f('M12 12H48Q52 12 52 16V56H16Q12 56 12 52Z', '#4fa83a') + re(16, 50, 36, 6, '#fdf3dc', 0, 1.8) + f('M32 22L40 32L32 42L24 32Z', '#e0283a', 1.8) + ln('M18 18V46', '#2f6b24', 2),
    relic_bottle: () => f('M26 6H38V16Q46 22 46 34V56Q46 60 42 60H22Q18 60 18 56V34Q18 22 26 16Z', '#a8e3ff') + re(24, 3, 16, 6, '#8a5a2b', 2, 1.8) + f('M24 38Q32 34 40 38V52H24Z', '#2a2e38', 1.4) + el(32, 46, 4, 5, '#ffffff', 1.2),
    relic_crown: () => f('M8 46L12 18L22 32L32 12L42 32L52 18L56 46Z', '#ffcf3d') + re(8, 44, 48, 8, '#e0a82e', 1, 2) + ci(32, 30, 4, '#e0283a', 1.8) + ci(18, 36, 3, '#e0283a', 1.6) + ci(46, 36, 3, '#e0283a', 1.6),
    relic_ember: () => f('M32 4C44 16 50 26 46 40Q42 58 32 58Q22 58 18 40C16 30 22 26 24 18C28 24 30 28 32 26C34 20 30 12 32 4Z', '#ff7a2e') + f('M32 26C38 34 40 42 36 50Q34 54 32 54Q28 54 26 48C24 42 28 36 32 26Z', '#ffe27a', 1.8),
    relic_feather: () => f('M48 6Q30 10 22 30Q16 44 14 58Q22 46 30 44Q46 36 48 6Z', '#b9a2ff') + ln('M44 12Q30 30 16 56', '#5b3fb0', 2) + spark(50, 44, 4, '#ffffff') + dot(24, 18, 1.4, '#fff'),
    relic_frost: () => f('M32 56L10 32Q4 22 12 14Q22 6 32 18Q42 6 52 14Q60 22 54 32Z', '#9fe3ff') + hi('M16 20Q18 16 22 16') + ln('M32 26V44M24 35H40M26 29L38 41M38 29L26 41', '#ffffff', 1.6),
    relic_hambo: () => ci(20, 16, 6, '#b0763c') + ci(44, 16, 6, '#b0763c') + ci(32, 26, 14, '#c98d4e') + el(32, 50, 14, 12, '#c98d4e') + dot(27, 24, 1.8, INK) + dot(37, 24, 1.8, INK) + el(32, 31, 4, 3, '#f6d7a0', 1.4) + ln('M22 44L26 50M42 44L38 50', '#7a4f25', 1.6),
    relic_lich: () => f('M32 4L44 22L38 58H26L20 22Z', '#2a2e38') + f('M32 12L38 24L34 48H30L26 24Z', '#7dff6b', 1.6) + dot(32, 26, 2.5, '#eaffe0'),
    relic_pie: () => f('M6 38Q32 20 58 38V44Q32 52 6 44Z', '#e0a060') + f('M10 38Q32 26 54 38', '#b0612b', 1.8) + ln('M18 34L26 40M30 30L36 38M42 32L46 38', '#7a3e1c', 1.8) + f('M10 44Q32 56 54 44V48Q32 58 10 48Z', '#c98d4e', 1.8),
    relic_receipt: () => f('M16 6H48V58L44 54L40 58L36 54L32 58L28 54L24 58L20 54L16 58Z', '#fdfdf6') + ln('M22 14H42M22 20H38M22 26H42M22 32H34', '#8a8f9a', 1.6) + ln('M22 44H42', INK, 2) + star(40, 38, 3, '#ffcf3d'),
    relic_snail: () => f('M8 48Q10 42 20 42H44Q54 42 56 48Z', '#b8e08a') + ci(38, 32, 12, '#e0a060') + ln('M38 32m-6 0a6 6 0 1 0 6-6', '#8a4a20', 1.8) + ln('M14 42L10 30M18 42L18 30', INK, 2) + dot(10, 29, 2, INK) + dot(18, 29, 2, INK) + f('M4 22L10 28L6 30Z', '#ffe27a', 1.2),
  };

  /* ---------- snacks ---------- */
  const SNACKS = {
    bacon_pancakes: () => el(32, 46, 22, 7, '#e0a060') + el(32, 38, 22, 7, '#f2c27a') + el(32, 30, 22, 7, '#e0a060') + f('M18 26Q24 22 30 26T42 26', 'none') + ln('M18 27Q24 22 30 27T44 26', '#c0392b', 4) + ln('M18 27Q24 22 30 27T44 26', '#ff9a8a', 1.4) + re(28, 18, 8, 6, '#ffe27a', 1, 1.6),
    burrito: () => rot(-25, f('M8 26Q8 18 16 18H48Q56 18 56 26V38Q56 46 48 46H16Q8 46 8 38Z', '#f2d49a') + el(52, 32, 5, 12, '#7ed957', 1.8) + dot(52, 26, 2, '#e0283a') + dot(51, 36, 2, '#ffcf3d') + ln('M20 20Q24 32 20 44M32 20Q36 32 32 44', '#d9b070', 1.6)),
    candy: () => f('M20 32L6 22V42Z', '#7ed957') + f('M44 32L58 22V42Z', '#7ed957') + ci(32, 32, 13, '#ffffff') + ln('M22 26Q32 34 24 42M32 20Q42 30 36 44', '#e0283a', 3),
    ice_cream: () => re(10, 18, 44, 10, '#6b3e26', 3) + re(10, 28, 44, 10, '#fdfdf6', 0) + re(10, 38, 44, 10, '#6b3e26', 3) + [16, 26, 36, 46].map((x) => dot(x, 23, 1.6, '#4a2a1a') + dot(x, 43, 1.6, '#4a2a1a')).join('') + spark(54, 10, 4, '#9fe3ff'),
    science_potion: () => f('M26 6H38V22L50 50Q52 58 44 58H20Q12 58 14 50L26 22Z', '#e6f2ff') + f('M19 42H45L49 51Q50 55 45 55H19Q14 55 15 51Z', '#ff5fb4', 1.8) + re(24, 3, 16, 6, '#8a8f9a', 2, 1.8) + dot(30, 36, 2, '#ff9fd0') + dot(36, 30, 1.4, '#ff9fd0'),
    gunter_bomb: () => el(32, 38, 16, 18, '#2a2e38') + el(32, 42, 10, 12, '#ffffff', 0) + dot(27, 30, 2, '#fff') + dot(37, 30, 2, '#fff') + f('M29 35L35 35L32 39Z', '#ffcf3d', 1.4) + ln('M32 20Q34 12 40 10', '#8a5a2b', 2.4) + star(42, 8, 4, '#ff7a2e'),
    pocket_watch: () => ci(32, 36, 20, '#ffcf3d') + ci(32, 36, 15, '#fdfdf6', 2) + ln('M32 36V26M32 36L39 40', INK, 2.2) + re(28, 10, 8, 6, '#e0a82e', 2, 1.8) + ln('M32 6V10', INK, 2),
    rainbow_flare: () => rot(-30, re(26, 22, 12, 36, '#e0283a', 2) + ln('M26 30H38M26 38H38M26 46H38', '#fff', 2) + f('M32 22C24 12 30 6 32 2C34 6 40 12 32 22Z', '#ffcf3d', 1.6)) + ln('M40 10Q50 4 58 12', '#ff5f7a', 2.5) + ln('M42 14Q50 9 56 16', '#7ed957', 2.5) + ln('M44 18Q50 14 54 20', '#4d9bff', 2.5),
    skeleton_key: () => ci(18, 32, 11, '#efe6cf') + ci(18, 32, 4, '#1d2340', 0) + f('M28 29H58V35H54V42H50V35H46V40H42V35H28Z', '#efe6cf'),
  };

  /* ---------- treasure ---------- */
  const gem = (c, c2) => f('M16 24L24 12H40L48 24L32 54Z', c) + f('M16 24H48M24 12L28 24L32 54L36 24L40 12', 'none', 1.6) + `<path d="M24 12L28 24H16Z" fill="${c2}" opacity=".7"/>`;
  const VALUABLES = {
    ruby: () => gem('#e0283a', '#ff9a8a'),
    sapphire: () => gem('#2f6fe0', '#9fc6ff'),
    emerald: () => gem('#23a55a', '#9af0b8'),
    old_coin_purse: () => f('M14 28Q12 56 32 56Q52 56 50 28Q44 22 32 22Q20 22 14 28Z', '#b0763c') + ln('M22 22Q32 28 42 22', '#6b4423', 2.4) + ci(46, 18, 7, '#ffcf3d', 2) + ci(20, 16, 5, '#ffcf3d', 2),
    gold_bar: () => f('M8 44L18 26H52L56 44Z', '#ffcf3d') + f('M8 44H56V52H8Z', '#e0a82e') + hi('M22 30H46'),
    golden_goblet: () => f('M16 8H48Q48 30 32 34Q16 30 16 8Z', '#ffcf3d') + re(29, 34, 6, 12, '#e0a82e', 0, 2) + f('M18 58Q18 48 32 46Q46 48 46 58Z', '#ffcf3d') + ci(32, 18, 3, '#e0283a', 1.4),
    candy_scepter: () => rot(30, re(29, 20, 6, 40, '#ff9fd0', 2) + ln('M29 26L35 30M29 36L35 40M29 46L35 50', '#fff', 2) + ci(32, 14, 9, '#ff5fb4') + star(32, 14, 5, '#ffe27a')),
    dungeon_map: () => f('M10 14L24 10L40 14L54 10V50L40 54L24 50L10 54Z', '#f2e2c4') + ln('M24 10V50M40 14V54', '#c9b58a', 1.6) + ln('M16 40Q24 30 32 34T48 22', '#e0283a', 2) + `<path d="M44 18l6 6m0-6l-6 6" stroke="#e0283a" stroke-width="2.4"/>`,
    magic_jar: () => re(16, 18, 32, 40, '#bfefff', 6) + re(18, 10, 28, 10, '#8a5a2b', 2) + ci(32, 38, 8, '#b76bff', 0) + spark(26, 30, 3) + spark(40, 46, 3),
    crystal_skull: () => f('M14 34Q12 10 32 10Q52 10 50 34L46 40V50H18V40Z', '#bfe8ff') + el(24, 30, 5, 6, '#4d9bff', 0) + el(40, 30, 5, 6, '#4d9bff', 0) + ln('M26 44V50M32 44V50M38 44V50', INK, 1.6) + hi('M20 18Q26 13 32 13'),
    guardian_eye: () => el(32, 32, 24, 16, '#ffffff') + ci(32, 32, 11, '#6fd0ff') + ci(32, 32, 5, INK, 0) + dot(35, 29, 2, '#fff'),
    owl_dust: () => f('M18 26Q16 56 32 56Q48 56 46 26Z', '#3d2d6b') + re(22, 18, 20, 8, '#8a5a2b', 2) + spark(26, 40, 3, '#e3d8ff') + spark(38, 46, 2.5, '#e3d8ff') + dot(34, 36, 1.4, '#fff') + spark(50, 12, 4, '#b9a2ff'),
    crystal_heart: () => f('M32 58L8 32Q2 20 12 12Q22 6 32 18Q42 6 52 12Q62 20 56 32Z', '#ff9fd0') + f('M32 18L24 32L32 58L40 32Z', 'none', 1.4) + ln('M8 32H56', INK, 1.4) + hi('M14 20Q16 15 22 15'),
    golden_ticket: () => f('M6 18H58V28Q52 32 58 36V46H6V36Q12 32 6 28Z', '#ffcf3d') + ln('M16 18V46', INK, 1.4) + star(36, 32, 7, '#e0283a') + ln('M24 24H30M24 40H30', '#b07a1e', 2),
  };

  /* ---------- boss trophies ---------- */
  const TROPHIES = {
    grass: () => f('M8 50Q8 30 32 28Q56 30 56 50Z', '#7ed957') + f('M16 30L20 12L28 24L32 8L36 24L44 12L48 30Z', '#ffcf3d') + dot(26, 42, 2, INK) + dot(38, 42, 2, INK),
    candy: () => el(32, 36, 20, 16, '#ffe27a') + f('M48 26Q56 20 58 26', 'none') + el(52, 30, 5, 3, '#ffe27a', 1.8) + ln('M24 36Q32 32 40 36', '#e0a82e', 2) + f('M28 18Q32 10 38 14Q34 16 32 20Z', '#7ed957', 1.6),
    crypt: () => f('M8 20Q10 50 32 52Q54 50 56 20L48 26Q32 36 16 26Z', '#efe6cf') + [20, 26, 32, 38, 44].map((x) => re(x - 2, 28, 4, 6, '#ffffff', 1, 1.2)).join(''),
    lava: () => RELICS.relic_ember(),
    ice: () => f('M22 6Q30 22 24 36Q20 48 30 58Q18 54 16 40Q14 24 22 6Z', '#e6f7ff') + f('M36 8Q44 26 38 40Q34 50 44 58Q30 54 30 40Q30 26 36 8Z', '#ffffff') + spark(50, 14, 4, '#9fe3ff'),
    night: () => ci(32, 32, 16, '#2a2e38') + ci(32, 32, 10, '#e0283a', 2) + f('M28 28L36 36M36 28L28 36', 'none', 2) + re(4, 30, 12, 4, '#8a8f9a', 1, 1.6) + re(48, 30, 12, 4, '#8a8f9a', 1, 1.6),
    crystal: () => f('M32 4L50 20L44 52L32 60L20 52L14 20Z', '#c7a6ff') + f('M32 4L32 60M14 20L50 20M20 52L44 52', 'none', 1.4) + ci(32, 32, 6, '#ff9fd0', 1.6),
  };

  const ALL = Object.assign({}, ARMOR, INSTR, COLLARS, RELICS);
  for (const k in SWORDS) ALL[k] = () => sword(SWORDS[k]);

  const wrap = (inner, cls) => `<svg class="art${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${inner}</svg>`;
  /* The drawing for an item. */
  function art(it, cls) {
    if (!it) return '';
    let fn = null;
    if (it.kind === 'consumable') fn = SNACKS[it.base];
    else if (it.kind === 'valuable') fn = VALUABLES[it.base];
    else if (it.kind === 'trophy') fn = TROPHIES[it.base];
    else fn = ALL[DT.meta.loot.artOf(it)];
    if (!fn) return `<span class="art art-ico">${DT.icon(DT.meta.loot.iconOf(it))}</span>`;
    return wrap(fn(), cls);
  }
  /* Faint outline art for an empty gear slot. */
  const SLOT_ART = { sword: 'sword_short', helmet: 'hat', armor: 'tunic', gauntlets: 'gloves', boots: 'sneakers', pack: 'pack', instrument: 'viola', collar: 'collar', relic: 'ring' };
  function slotArt(kind) { const fn = ALL[SLOT_ART[kind]]; return fn ? wrap(fn(), 'ghost') : ''; }

  /* Hero portraits for chips, the HUD and the result screen. */
  function portrait(id) {
    if (id === 'finn') return wrap(f('M10 50Q8 16 32 12Q56 16 54 50L50 60H14Z', '#ffffff') + ci(15, 14, 6, '#ffffff') + ci(49, 14, 6, '#ffffff') +
      el(32, 40, 15, 13, '#ffd9b3') + dot(26, 38, 2, INK) + dot(38, 38, 2, INK) + ln('M26 45Q32 50 38 45', INK, 2) + f('M14 58H50V64H14Z', '#3fa9f5', 2), 'portrait');
    return wrap(f('M8 30Q8 8 32 8Q56 8 56 30Q58 46 48 54Q40 60 32 60Q24 60 16 54Q6 46 8 30Z', '#f6b42a') + f('M8 22Q2 30 6 42Q10 38 12 30Z', '#e09a20', 2) + f('M56 22Q62 30 58 42Q54 38 52 30Z', '#e09a20', 2) +
      el(24, 28, 6, 7, '#fff') + el(40, 28, 6, 7, '#fff') + dot(25, 29, 2.6, INK) + dot(39, 29, 2.6, INK) + el(32, 42, 12, 8, '#f9cf6a') + el(32, 38, 4, 3, INK, 0) + ln('M26 47Q32 51 38 47', INK, 2), 'portrait');
  }

  DT.ui = DT.ui || {};
  DT.ui.art = { art, slotArt, portrait, has: (key) => !!ALL[key] };
})();
