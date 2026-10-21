// Bold 24x24 glyphs for ability tiles.
const P = {
  fist: '<path d="M6 10c0-1.7 1.3-3 3-3h7c1.7 0 3 1.3 3 3v5c0 3-2.5 5-5.5 5H11c-2.8 0-5-2.2-5-5v-5z"/><path d="M9 7V5.5M12 7V5M15 7V5.5" stroke-linecap="round" stroke-width="2.4" fill="none"/><path d="M6 12h4" stroke-width="1.6" fill="none"/>',
  clap: '<path d="M5 13l5-7 3 2-4 7zM19 13l-5-7-3 2 4 7z"/><path d="M12 15v5M8.5 17.5l-2 2M15.5 17.5l2 2M12 3v1.5" stroke-width="2" stroke-linecap="round" fill="none"/>',
  dash: '<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z"/><path d="M2 12h1.5" stroke-width="2" fill="none"/>',
  meteor: '<circle cx="15" cy="15" r="4.5"/><path d="M4 4l8 8M7 3l7 7M3 7l7 7" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M8 21h14" stroke-width="2" fill="none"/>',
  grab: '<path d="M7 20v-7a2 2 0 0 1 4 0v-2a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v4c0 2.5-2 4-4.5 4H9"/><path d="M12 2l3 3h-2v3h-2V5H9z"/>',
  bolt: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
  cfist: '<path d="M7 10c0-1.4 1.1-2.5 2.5-2.5h6C17 7.5 18 8.6 18 10v4.5c0 2.6-2.1 4.5-4.6 4.5H11c-2.2 0-4-1.8-4-4z"/><path d="M3 12H1M4 7L2.5 5.5M4 17l-1.5 1.5" stroke-width="2" stroke-linecap="round" fill="none"/>',
  bubble: '<circle cx="12" cy="12" r="9" fill="none" stroke-width="2.4"/><path d="M12 5.5l5.6 3.25v6.5L12 18.5l-5.6-3.25v-6.5z" fill="none" stroke-width="1.4"/><circle cx="8.5" cy="8.5" r="1.6"/>',
  field: '<ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke-width="1.8"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" fill="none" stroke-width="1.8"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)" fill="none" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2"/>',
  pulse: '<path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z"/><circle cx="12" cy="12" r="10.5" fill="none" stroke-width="1.2" stroke-dasharray="2 2"/>',
  boulder: '<path d="M4 15l2-6 5-3 6 1 3 5-1 6-6 3-6-1z"/><path d="M9 9l2 4 4-1M11 13l-1 4" stroke-width="1.3" fill="none" stroke="#000" stroke-opacity=".45"/>',
  charge: '<path d="M3 12h11l-3-4h4l5 4-5 4h-4l3-4" /><circle cx="6" cy="6.5" r="2.5"/>',
  roar: '<path d="M12 2l2.4 4.8L20 5l-2.8 5L22 13l-5.4 1.2L17 20l-5-3-5 3 .4-5.8L2 13l4.8-3L4 5l5.6 1.8z"/>',
  ult_inv: '<circle cx="12" cy="14" r="7" fill="none" stroke-width="2"/><path d="M12 1v8M9 6l3 3 3-3" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M5 18c2 1 5 1.5 7 1.5s5-.5 7-1.5" stroke-width="1.6" fill="none"/>',
  ult_eve: '<path d="M12 1l2 7 7-2-5 5 5 5-7-2-2 7-2-7-7 2 5-5-5-5 7 2z"/><circle cx="12" cy="12" r="2.5" fill="#fff"/>',
  ult_omni: '<path d="M4 4l8 16 8-16h-4l-4 9-4-9z"/>',
  cannon: '<path d="M3 10h11l3-2h3v8h-3l-3-2H3z"/><path d="M21 9.5l2-1.5M21 12h2.5M21 14.5l2 1.5" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  missiles: '<path d="M6 3l2.5 5v8h-5V8zM12 2l2.5 5v8h-5V7zM18 3l2.5 5v8h-5V8z"/><path d="M6 18v3M12 17v4M18 18v3" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  barrier: '<path d="M3 5c6-2 12-2 18 0v14c-6 2-12 2-18 0z" fill="none" stroke-width="2.2"/><path d="M8 9.5l2-1.2 2 1.2v2.4l-2 1.2-2-1.2zM12 12l2-1.2 2 1.2v2.4l-2 1.2-2-1.2z" fill="none" stroke-width="1.3"/>',
  emp: '<circle cx="12" cy="12" r="9.5" fill="none" stroke-width="2"/><path d="M13 3.5L7.5 13h4l-1 7.5L16.5 11h-4z"/>',
  drones: '<ellipse cx="12" cy="14" rx="9" ry="3" fill="none" stroke-width="1.8"/><path d="M8.5 14a3.5 2.5 0 0 0 7 0z"/><path d="M12 2.5v7M8.5 6h7" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  ult_robot: '<path d="M12 1.5l9 5.2v10.6l-9 5.2-9-5.2V6.7z" fill="none" stroke-width="2"/><path d="M7 11.5c1.5-1.5 3-1.5 4.2 0M12.8 11.5c1.2-1.5 2.7-1.5 4.2 0" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M8 16h8" stroke-width="1.8" fill="none"/>',
  jump: '<path d="M12 3l6 7h-4v6h-4v-6H6z"/><path d="M6 20h12" stroke-width="2" fill="none"/>',
  fly: '<path d="M2 14c4-1 7-3 10-7 3 4 6 6 10 7-4 0-7 1-10 3-3-2-6-3-10-3z"/>',
};
export function icon(name, color = '#fff') {
  const body = P[name] || P.bolt;
  return `<svg viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="0" aria-hidden="true">${body}</svg>`;
}
