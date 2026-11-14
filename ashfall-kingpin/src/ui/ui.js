// Immediate-mode canvas UI. Hit-testing uses the previous frame's widget list so the topmost
// widget wins; every frame's clickables are exposed (ui.clickables) for the automated UI crawl.
import { drawText, measure, wrap, LINE_H } from '../render/font.js';
import { RAMPS, SEM } from '../data/palette.js';
import { drawIcon } from '../render/icons.js';

const inside = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const K = RAMPS;
const TIP_COL = { g: SEM.good, r: SEM.bad, y: SEM.warn, d: SEM.textDim, a: SEM.dirty, c: SEM.clean, h: SEM.accent, w: SEM.text };

export class UI {
  constructor(input, audio) {
    this.input = input;
    this.audio = audio;
    this.items = [];
    this.prev = [];
    this.hotId = null;
    this.scroll = {};
    this.dragId = null;
    this.tipText = null;
    this.confirmBox = null;
    this.cursor = 'arrow';
    this.sem = SEM;
    this.clickables = [];
    this.flash = 0;
  }

  begin(ctx, W, H, s) {
    this.ctx = ctx; this.W = W; this.H = H; this.s = s;
    this.mx = this.input.mouse.x / s; this.my = this.input.mouse.y / s;
    this.prev = this.items;
    this.items = [];
    this.hotId = null;
    for (let i = this.prev.length - 1; i >= 0; i--) if (inside(this.mx, this.my, this.prev[i])) { this.hotId = this.prev[i].id; break; }
    this.pressed = this.input.mouse.pressed[0];
    this.wheel = this.input.mouse.wheel;
    this.tipText = null;
    this.cursor = 'arrow';
    if (!this.input.mouse.down[0]) this.dragId = null;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  get overUI() { return this.hotId !== null; }
  reg(id, x, y, w, h, extra) { const it = { id, x, y, w, h, ...extra }; this.items.push(it); return this.hotId === id; }
  isHot(id) { return this.hotId === id; }
  consumeClick() { const p = this.pressed; this.pressed = false; return p; }
  sfx(n) { if (this.audio) this.audio.play(n); }

  // ---------- drawing primitives ----------
  rect(x, y, w, h, c) { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, w, h); }
  text(str, x, y, color = SEM.text, o) { return drawText(this.ctx, str, x, y, color, o); }
  wrapText(str, x, y, w, color = SEM.text, lh = LINE_H) {
    const lines = wrap(str, w);
    lines.forEach((l, i) => drawText(this.ctx, l, x, y + i * lh, color));
    return lines.length * lh;
  }
  icon(name, x, y, tint, scale = 1) { return drawIcon(this.ctx, name, x, y, tint, scale); }
  bevel(x, y, w, h, light, dark) { this.rect(x, y, w, 1, light); this.rect(x, y, 1, h, light); this.rect(x, y + h - 1, w, 1, dark); this.rect(x + w - 1, y, 1, h, dark); }

  panel(id, x, y, w, h, o = {}) {
    this.rect(x, y, w, h, o.bg || SEM.panel);
    this.bevel(x, y, w, h, o.edge || SEM.panelEdge, K.ink[0]);
    if (o.title) {
      this.rect(x + 1, y + 1, w - 2, 12, K.ink[0]);
      this.text(o.title, x + 5, y + 3, o.titleColor || SEM.accent);
    }
    this.reg(id, x, y, w, h, { panel: true });
  }

  dim(id, a = 0.6) {
    this.ctx.fillStyle = `rgba(18,15,14,${a})`;
    this.ctx.fillRect(0, 0, this.W, this.H);
    this.reg(id, 0, 0, this.W, this.H, { panel: true });
  }

  bar(x, y, w, h, frac, color, bg = K.ink[0]) {
    this.rect(x, y, w, h, bg);
    const f = Math.max(0, Math.min(1, frac || 0));
    if (f > 0) this.rect(x + 1, y + 1, Math.max(1, Math.round((w - 2) * f)), h - 2, color);
  }

  // ---------- widgets ----------
  button(id, x, y, w, h, label, o = {}) {
    const hot = this.reg(id, x, y, w, h, { label: String(label), disabled: !!o.disabled, button: true });
    const dis = !!o.disabled;
    const down = hot && this.input.mouse.down[0] && !dis;
    let base = o.active ? K.rust[1] : o.danger ? K.heat[0] : o.primary ? K.rust[2] : K.ink[2];
    if (hot && !dis && !o.active) base = o.danger ? K.heat[1] : o.primary ? K.rust[3] : K.ink[3];
    if (dis) base = K.ink[1];
    this.rect(x, y, w, h, base);
    this.bevel(x, y, w, h, down ? K.ink[0] : dis ? K.ink[2] : K.bone[0], down ? K.bone[0] : K.ink[0]);
    let tx = x + w / 2;
    const col = dis ? SEM.textMute : o.color || SEM.text;
    if (o.icon) {
      const iw = 10;
      const total = iw + (label ? 3 + measure(label) : 0);
      const ix = Math.round(x + (w - total) / 2);
      this.icon(o.icon, ix, y + Math.round((h - 10) / 2), o.tint);
      if (label) this.text(label, ix + iw + 3, y + Math.round((h - 7) / 2), col);
    } else this.text(label, tx, y + Math.round((h - 7) / 2) + (down ? 1 : 0), col, { align: 'center', maxW: w - 4 });
    if (hot) { this.cursor = 'hand'; if (o.tip) this.tip(typeof o.tip === 'function' ? o.tip() : o.tip); }
    if (o.key && !dis && this.input.keyPressed(o.key)) { this.sfx(o.sound || 'ui'); return true; }
    if (hot && this.pressed) {
      this.pressed = false;
      if (dis) { this.sfx('ui_error'); if (o.whyDisabled) this.flashMsg = o.whyDisabled; return false; }
      this.sfx(o.sound || 'ui');
      return true;
    }
    return false;
  }

  // Clickable invisible area (e.g. map markers, grid cells). Returns 'click' | 'hover' | null.
  area(id, x, y, w, h, o = {}) {
    const hot = this.reg(id, x, y, w, h, { label: o.label || id, button: true, disabled: !!o.disabled });
    if (!hot) return null;
    this.cursor = 'hand';
    if (o.tip) this.tip(typeof o.tip === 'function' ? o.tip() : o.tip);
    if (this.pressed) { this.pressed = false; if (!o.silent) this.sfx('ui'); return 'click'; }
    if (this.input.mouse.pressed[2]) return 'rclick';
    return 'hover';
  }

  tabs(id, x, y, w, labels, active, o = {}) {
    const n = labels.length;
    const tw = Math.floor(w / n);
    let out = active;
    labels.forEach((lab, i) => {
      const bx = x + i * tw, bw = i === n - 1 ? w - tw * (n - 1) : tw;
      const sel = i === active;
      const hot = this.reg(`${id}:${i}`, bx, y, bw, 13, { label: lab, button: true });
      this.rect(bx, y, bw, 13, sel ? K.rust[1] : hot ? K.ink[3] : K.ink[2]);
      this.bevel(bx, y, bw, 13, sel ? K.rust[3] : K.bone[0], K.ink[0]);
      this.text(lab, bx + bw / 2, y + 3, sel ? K.bone[3] : SEM.textDim, { align: 'center', maxW: bw - 4 });
      if (hot) this.cursor = 'hand';
      if (hot && this.pressed) { this.pressed = false; this.sfx('tab'); out = i; }
      if (o.keys && o.keys[i] && this.input.keyPressed(o.keys[i])) out = i;
    });
    return out;
  }

  toggle(id, x, y, label, value, o = {}) {
    const w = 12 + measure(label) + 4;
    const hot = this.reg(id, x, y, w, 10, { label, button: true });
    this.rect(x, y, 9, 9, K.ink[0]);
    this.rect(x + 1, y + 1, 7, 7, hot ? K.ink[3] : K.ink[2]);
    if (value) this.rect(x + 2, y + 2, 5, 5, SEM.accent);
    this.text(label, x + 13, y + 1, o.color || SEM.text);
    if (hot) { this.cursor = 'hand'; if (o.tip) this.tip(o.tip); }
    if (hot && this.pressed) { this.pressed = false; this.sfx('ui'); return !value; }
    return value;
  }

  slider(id, x, y, w, value, min, max, o = {}) {
    const hot = this.reg(id, x, y - 2, w, 11, { label: o.label || id, button: true, slider: true });
    const t = (value - min) / (max - min || 1);
    this.rect(x, y + 3, w, 3, K.ink[0]);
    this.rect(x, y + 3, Math.round(w * t), 3, o.color || SEM.accent);
    const hx = Math.round(x + w * t) - 2;
    this.rect(hx, y, 5, 9, hot || this.dragId === id ? K.bone[3] : K.bone[1]);
    if (hot && this.pressed) { this.pressed = false; this.dragId = id; }
    if (hot && o.tip) this.tip(o.tip);
    if (this.dragId === id) {
      let v = min + Math.max(0, Math.min(1, (this.mx - x) / w)) * (max - min);
      if (o.step) v = Math.round(v / o.step) * o.step;
      return Math.max(min, Math.min(max, v));
    }
    if (hot && this.wheel) { this.wheel = 0; return Math.max(min, Math.min(max, value - Math.sign(this.input.mouse.wheel) * (o.step || (max - min) / 20))); }
    return value;
  }

  // Scrollable list. drawRow(i, x, y, w, h, hot). Returns clicked row index or -1.
  list(id, x, y, w, h, rowH, n, drawRow, o = {}) {
    const contentH = n * rowH;
    const maxScroll = Math.max(0, contentH - h);
    let sc = Math.min(this.scroll[id] || 0, maxScroll);
    const over = inside(this.mx, this.my, { x, y, w, h });
    if (over && this.wheel) { sc = Math.max(0, Math.min(maxScroll, sc + this.wheel * rowH * 2)); this.wheel = 0; }
    this.scroll[id] = sc;
    this.reg(id, x, y, w, h, { panel: true });
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    let clicked = -1;
    const rw = maxScroll > 0 ? w - 5 : w;
    const first = Math.floor(sc / rowH), last = Math.min(n - 1, Math.ceil((sc + h) / rowH));
    for (let i = first; i <= last; i++) {
      const ry = y + i * rowH - sc;
      const vy = Math.max(y, ry), vh = Math.min(y + h, ry + rowH) - vy;
      let hot = false;
      if (vh > 2) hot = this.reg(`${id}:row:${i}`, x, vy, rw, vh, { label: `${id} row ${i}`, button: !o.noClick });
      if (o.selected === i) this.rect(x, ry, rw, rowH, K.rust[0]);
      else if (hot && !o.noClick) this.rect(x, ry, rw, rowH, K.ink[2]);
      else if (o.zebra !== false && i % 2) this.rect(x, ry, rw, rowH, 'rgba(255,255,255,0.025)');
      drawRow(i, x, ry, rw, rowH, hot);
      if (hot && this.pressed && !o.noClick) { this.pressed = false; this.sfx('ui'); clicked = i; }
    }
    ctx.restore();
    if (maxScroll > 0) {
      this.rect(x + w - 4, y, 4, h, K.ink[0]);
      const th = Math.max(8, h * (h / contentH));
      this.rect(x + w - 4, y + (h - th) * (sc / maxScroll), 4, th, K.ink[3]);
    }
    if (n === 0 && o.empty) this.text(o.empty, x + w / 2, y + h / 2 - 4, SEM.textMute, { align: 'center' });
    return clicked;
  }

  tip(text) { if (text && !this.tipText) this.tipText = text; }
  tipArea(x, y, w, h, text) {
    if (!inside(this.mx, this.my, { x, y, w, h })) return;
    const hotIt = this.prev.find((it) => it.id === this.hotId);
    if (!hotIt || hotIt.panel) this.tip(typeof text === 'function' ? text() : text);
  }

  confirm(text, onYes, o = {}) { this.confirmBox = { text, onYes, yes: o.yes || 'Confirm', no: o.no || 'Cancel', danger: o.danger !== false }; }

  drawConfirm() {
    const cb = this.confirmBox;
    if (!cb) return;
    this.dim('confirm:dim', 0.5);
    const w = 220, lines = wrap(cb.text, w - 16), h = 34 + lines.length * LINE_H;
    const x = Math.round((this.W - w) / 2), y = Math.round((this.H - h) / 2);
    this.panel('confirm:panel', x, y, w, h, { title: 'Are you sure?' });
    lines.forEach((l, i) => this.text(l, x + 8, y + 17 + i * LINE_H, SEM.text));
    if (this.button('confirm:yes', x + 8, y + h - 16, 98, 12, cb.yes, { danger: cb.danger, key: 'Enter' })) { this.confirmBox = null; cb.onYes(); }
    else if (this.button('confirm:no', x + w - 106, y + h - 16, 98, 12, cb.no, { key: 'Escape', sound: 'ui_back' })) this.confirmBox = null;
  }

  end() {
    this.drawConfirm();
    if (this.tipText) this.drawTip(this.tipText);
    this.clickables = this.items.filter((it) => it.button);
  }

  drawTip(text) {
    const lines = [];
    for (const raw of String(text).split('\n')) {
      let col = SEM.text, s = raw;
      const m = /^!([a-z]) ?/.exec(raw);
      if (m && TIP_COL[m[1]]) { col = TIP_COL[m[1]]; s = raw.slice(m[0].length); }
      for (const l of wrap(s, 200)) lines.push([l, col]);
    }
    const w = Math.min(212, Math.max(...lines.map(([l]) => measure(l))) + 10);
    const h = lines.length * LINE_H + 6;
    let x = Math.round(this.mx + 10), y = Math.round(this.my + 12);
    if (x + w > this.W - 2) x = Math.round(this.mx - w - 6);
    if (y + h > this.H - 2) y = Math.round(this.H - h - 2);
    this.rect(x, y, w, h, 'rgba(18,15,14,0.94)');
    this.bevel(x, y, w, h, SEM.accent, K.ink[0]);
    lines.forEach(([l, c], i) => this.text(l, x + 5, y + 4 + i * LINE_H, c));
  }

  drawCursor(kind) {
    const c = this.ctx;
    const x = Math.round(this.mx), y = Math.round(this.my);
    if (kind === 'cross') {
      c.fillStyle = K.ink[0];
      c.fillRect(x - 5, y - 1, 4, 3); c.fillRect(x + 2, y - 1, 4, 3); c.fillRect(x - 1, y - 5, 3, 4); c.fillRect(x - 1, y + 2, 3, 4);
      c.fillStyle = K.bone[3];
      c.fillRect(x - 4, y, 3, 1); c.fillRect(x + 2, y, 3, 1); c.fillRect(x, y - 4, 1, 3); c.fillRect(x, y + 2, 1, 3);
      c.fillStyle = SEM.enemy; c.fillRect(x, y, 1, 1);
      return;
    }
    const rows = kind === 'hand' ? ['k.....', 'kk....', 'kwk...', 'kwwk..', 'kwwwk.', 'kwwwwk', 'kwwkkk', 'kkwk..', '..kk..'] : ['k.....', 'kk....', 'kwk...', 'kwwk..', 'kwwwk.', 'kwwwwk', 'kwwkkk', 'kwk...', 'kk....'];
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { if (r[i] === '.') continue; c.fillStyle = r[i] === 'k' ? K.ink[0] : kind === 'hand' ? K.gold[3] : K.bone[3]; c.fillRect(x + i, y + j, 1, 1); } });
  }
}
