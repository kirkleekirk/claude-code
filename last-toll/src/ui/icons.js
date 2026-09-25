// Small line icons for item categories (24x24, stroke = currentColor).
const P = {
  weapon: '<path d="M4 20l6-6m0 0l9-9 1 3-8 8m-2-2l2 2" /><path d="M6 16l2 2" />',
  gun: '<path d="M3 9h15l1-2h2v4h-4l-1 2h-4l-1 5H7l1-5H3z" />',
  ammo: '<path d="M6 20V9l2-4 2 4v11zM11 20V9l2-4 2 4v11zM16 20V9l2-4 2 4v11z" />',
  food: '<rect x="6" y="5" width="12" height="15" rx="2" /><path d="M6 9h12M6 16h12" />',
  med: '<rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />',
  mat: '<circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />',
  junk: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" />',
  util: '<rect x="8" y="4" width="8" height="17" rx="2" /><path d="M10 2h4M10 9h4" />',
};

export function icon(cat, kind) {
  const key = cat === 'weapon' && kind === 'gun' ? 'gun' : cat;
  const body = P[key] || P.junk;
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
