// The StarMiner Z logo: chrome lettering over a red, dripping brush-stroke Z, with the giant
// planet Ember rising behind it. Drawn as one inline SVG so it stays sharp at any size.

// a brush stroke from a to b, w thick, with ragged edges (deterministic)
function stroke(ax, ay, bx, by, w, seed) {
  const n = 14;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = 0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5 + 0.35);
    const x = ax + dx * t, y = ay + dy * t;
    const w1 = (w / 2) * taper * (0.86 + rnd() * 0.28), w2 = (w / 2) * taper * (0.86 + rnd() * 0.28);
    top.push(`${(x + nx * w1).toFixed(1)},${(y + ny * w1).toFixed(1)}`);
    bot.push(`${(x - nx * w2).toFixed(1)},${(y - ny * w2).toFixed(1)}`);
  }
  return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
}

function drip(x, y, len, w) {
  return `M${x - w / 2},${y} L${x - w / 2},${y + len - w / 2} A${w / 2},${w / 2} 0 0 0 ${x + w / 2},${y + len - w / 2} L${x + w / 2},${y} Z`;
}

export function logoSVG() {
  const z = [
    stroke(38, 40, 188, 30, 34, 7),
    stroke(178, 46, 52, 160, 32, 11),
    stroke(36, 168, 196, 174, 36, 23),
    drip(62, 182, 26, 7), drip(94, 186, 40, 6), drip(141, 188, 18, 8), drip(176, 186, 30, 6),
    drip(118, 52, 22, 6), drip(160, 42, 14, 5),
  ].join(' ');
  return `
<svg class="logo" viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="StarMiner Z">
  <defs>
    <linearGradient id="lgChrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.42" stop-color="#d9dde2"/>
      <stop offset="0.5" stop-color="#6d737a"/>
      <stop offset="0.62" stop-color="#b9bec4"/>
      <stop offset="1" stop-color="#f4f6f8"/>
    </linearGradient>
    <linearGradient id="lgBlood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff3a2e"/>
      <stop offset="0.55" stop-color="#c0110c"/>
      <stop offset="1" stop-color="#6e0504"/>
    </linearGradient>
    <radialGradient id="lgEmber" cx="0.38" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#ffc2a6"/>
      <stop offset="0.5" stop-color="#f07a62"/>
      <stop offset="0.85" stop-color="#9a3b40" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#4a1a30" stop-opacity="0"/>
    </radialGradient>
    <filter id="lgShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity="0.75"/>
    </filter>
  </defs>
  <circle cx="600" cy="58" r="56" fill="url(#lgEmber)" opacity="0.9"/>
  <g transform="translate(468 22) scale(1.02)" filter="url(#lgShadow)">
    <path d="${z}" fill="url(#lgBlood)"/>
  </g>
  <g filter="url(#lgShadow)">
    <text x="14" y="150" font-family="'Archivo Black', 'Arial Black', sans-serif" font-size="90" letter-spacing="-1"
      fill="url(#lgChrome)" stroke="#1c1f23" stroke-width="5" paint-order="stroke">StarMiner</text>
  </g>
</svg>`;
}
