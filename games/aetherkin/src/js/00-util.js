/* ---------- random ---------- */
let _seed = (Math.random() * 4294967296) >>> 0;
function srand(s) { _seed = (s >>> 0) || 1; }
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const rf = (a, b) => a + rnd() * (b - a);
const chance = p => rnd() < p;
const pick = arr => arr[Math.floor(rnd() * arr.length)];
function weighted(entries) {
  let total = 0; for (const e of entries) total += e[1];
  let r = rnd() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------- math ---------- */
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const pctOf = (a, b) => b <= 0 ? 0 : clamp(a / b, 0, 1);

/* ---------- dom ---------- */
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

function el(tag, props, ...kids) {
  const parts = String(tag).split(/(?=[.#])/);
  const node = document.createElement(parts[0] || 'div');
  for (let i = 1; i < parts.length; i++) {
    if (parts[i][0] === '.') node.classList.add(parts[i].slice(1));
    else node.id = parts[i].slice(1);
  }
  if (props) for (const k in props) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(4)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
const clearNode = node => { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };

/* ---------- text ---------- */
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const signed = n => (n > 0 ? '+' : '') + n;
const plural = (n, one, many) => n === 1 ? one : (many || one + 's');
