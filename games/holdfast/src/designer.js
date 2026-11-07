// Wall designer: paint your own wall shapes on the 8 x 12 cell grid (0.25 m
// cells) and mix finishes for each side. Designs join the build palette and
// are saved with your game.
import { shapes, styles, registerShape, registerStyle, SHAPE_COLS, SHAPE_ROWS } from './building/defs.js';
import { matColor } from './buildmode.js';

const WALL_MATS = [
  ['siding', 'Clapboard'], ['brick', 'Brick'], ['paintedBrick', 'Painted brick'], ['boardBatten', 'Board & batten'],
  ['planks', 'Rough planks'], ['metal', 'Sheet metal'], ['cinder', 'Cinder block'], ['stone', 'Fieldstone'],
  ['concrete', 'Concrete'], ['plaster', 'Plaster'], ['wallpaper', 'Wallpaper'], ['tileWhite', 'Tile'],
];
const NATURAL = new Set(['brick', 'stone', 'planks']);
const PAINT = [['#', 'Solid'], ['w', 'Window'], ['d', 'Door'], ['.', 'Open']];

export class WallDesigner {
  constructor(game, build) {
    this.game = game;
    this.build = build;
    this.brush = 'w';
    const el = this.el = document.createElement('div');
    el.className = 'overlay designer';
    el.hidden = true;
    el.innerHTML = `
      <div class="panel wide">
        <div class="d-head"><h2>Wall designer</h2><button id="d-close">Close</button></div>
        <p class="sub">Each wall panel is 2 m wide and 3 m tall, split into 0.25 m cells</p>
        <div class="d-body">
          <div class="d-grid">
            <canvas id="d-canvas" width="240" height="360" aria-label="Wall shape grid"></canvas>
            <div class="d-brushes">${PAINT.map(([c, n]) => `<button data-brush="${c}" class="chipbtn">${n}</button>`).join('')}</div>
            <div class="d-row"><button id="d-clear" class="chipbtn">Fill solid</button><button id="d-mirror" class="chipbtn">Mirror</button></div>
          </div>
          <div class="d-side">
            <label>Start from <select id="d-from"></select></label>
            <label>Shape name <input id="d-name" maxlength="24"></label>
            <button id="d-save-shape" class="primary">Save shape</button>
            <hr>
            <label>Outside <select id="d-amat">${WALL_MATS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><input type="color" id="d-acol"></label>
            <label>Inside <select id="d-bmat">${WALL_MATS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select><input type="color" id="d-bcol"></label>
            <label>Trim <input type="color" id="d-trim"></label>
            <label>Finish name <input id="d-sname" maxlength="24"></label>
            <button id="d-save-style" class="primary">Save finish</button>
            <p class="note" id="d-note"></p>
          </div>
        </div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    const $ = (id) => el.querySelector('#' + id);
    this.$ = $;
    $('d-close').addEventListener('click', () => this.close());
    for (const b of el.querySelectorAll('[data-brush]')) b.addEventListener('click', () => { this.brush = b.dataset.brush; this.refreshBrushes(); });
    $('d-clear').addEventListener('click', () => { this.grid = blank(); this.draw(); });
    $('d-mirror').addEventListener('click', () => { this.grid = this.grid.map((r) => r.slice().reverse()); this.draw(); });
    $('d-from').addEventListener('change', (e) => this.loadShape(e.target.value));
    $('d-save-shape').addEventListener('click', () => this.saveShape());
    $('d-save-style').addEventListener('click', () => this.saveStyle());
    for (const id of ['d-amat', 'd-acol', 'd-bmat', 'd-bcol', 'd-trim']) $(id).addEventListener('input', () => this.draw());
    const cv = $('d-canvas');
    let painting = false;
    const paintAt = (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * SHAPE_COLS, y = ((e.clientY - r.top) / r.height) * SHAPE_ROWS;
      const k = Math.floor(x), row = SHAPE_ROWS - 1 - Math.floor(y);
      if (k < 0 || k >= SHAPE_COLS || row < 0 || row >= SHAPE_ROWS) return;
      if (this.grid[row][k] !== this.brush) { this.grid[row][k] = this.brush; this.draw(); }
    };
    cv.addEventListener('pointerdown', (e) => { painting = true; cv.setPointerCapture(e.pointerId); paintAt(e); });
    cv.addEventListener('pointermove', (e) => { if (painting) paintAt(e); });
    cv.addEventListener('pointerup', () => { painting = false; });
  }
  open(shapeId, styleId) {
    this.game.modalOpen = true;
    this.game.input.uiCapture = true;
    this.el.hidden = false;
    const sel = this.$('d-from');
    sel.innerHTML = Object.entries(shapes).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
    sel.value = shapeId;
    this.loadShape(shapeId);
    const st = styles[styleId] || styles.white_siding;
    this.$('d-amat').value = st.a.mat; this.$('d-acol').value = st.a.color === '#ffffff' ? matColor(st.a.mat) : st.a.color;
    this.$('d-bmat').value = st.b.mat; this.$('d-bcol').value = st.b.color === '#ffffff' ? matColor(st.b.mat) : st.b.color;
    this.$('d-trim').value = st.trim;
    this.$('d-sname').value = 'My finish';
    this.refreshBrushes();
    this.draw();
  }
  close() {
    this.el.hidden = true;
    this.game.modalOpen = false;
    this.game.input.uiCapture = false;
    this.build.renderOptions();
  }
  loadShape(id) {
    const s = shapes[id];
    this.grid = [];
    for (let r = 0; r < SHAPE_ROWS; r++) this.grid.push(s.rows[SHAPE_ROWS - 1 - r].split(''));
    this.$('d-name').value = s.custom ? s.name : s.name + ' (mine)';
    this.draw();
  }
  refreshBrushes() { for (const b of this.el.querySelectorAll('[data-brush]')) b.classList.toggle('on', b.dataset.brush === this.brush); }
  draw() {
    const cv = this.$('d-canvas'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cw = W / SHAPE_COLS, ch = H / SHAPE_ROWS;
    ctx.fillStyle = '#9ab0c4'; ctx.fillRect(0, 0, W, H);
    const wall = this.$('d-acol').value, trim = this.$('d-trim').value;
    for (let r = 0; r < SHAPE_ROWS; r++) for (let k = 0; k < SHAPE_COLS; k++) {
      const c = this.grid[r][k];
      const x = k * cw, y = H - (r + 1) * ch;
      if (c === '#') { ctx.fillStyle = wall; ctx.fillRect(x, y, cw + 0.5, ch + 0.5); }
      else if (c === 'w') { ctx.fillStyle = '#a9c6d4'; ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
      else if (c === 'd') { ctx.fillStyle = '#6b4a32'; ctx.fillRect(x, y, cw + 0.5, ch + 0.5); }
    }
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (let k = 1; k < SHAPE_COLS; k++) { ctx.beginPath(); ctx.moveTo(k * cw, 0); ctx.lineTo(k * cw, H); ctx.stroke(); }
    for (let r = 1; r < SHAPE_ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); ctx.stroke(); }
    // a person for scale (1.8 m)
    ctx.fillStyle = 'rgba(30,30,30,.35)';
    ctx.fillRect(W - cw * 1.2, H - ch * 7.2, cw * 0.7, ch * 7.2);
    // warnings
    const doorRows = this.grid.map((row, r) => row.includes('d') ? r : -1).filter((r) => r >= 0);
    const note = doorRows.length && doorRows[0] > 0 ? 'Doors that start above the floor are fine for lofts, but nobody can walk through them from the floor.' : '';
    this.$('d-note').textContent = note;
  }
  saveShape() {
    const name = this.$('d-name').value.trim() || 'My wall';
    const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36).slice(-4);
    const rows = [];
    for (let r = SHAPE_ROWS - 1; r >= 0; r--) rows.push(this.grid[r].join(''));
    registerShape(id, { name, rows, custom: true });
    this.game.customShapes[id] = { name, rows, custom: true };
    this.build.opt.shape = id;
    this.game.hud.toast(`Saved shape “${name}”`, 2);
    this.game.markDirty && this.game.markDirty();
    this.open(id, this.build.opt.style);
  }
  saveStyle() {
    const name = this.$('d-sname').value.trim() || 'My finish';
    const id = 'customst_' + Date.now().toString(36);
    // naturally coloured materials keep their own colour unless the player changed it
    const tint = (mat, col) => (NATURAL.has(mat) && col.toLowerCase() === matColor(mat).toLowerCase() ? '#ffffff' : col);
    const st = {
      name, custom: true,
      a: { mat: this.$('d-amat').value, color: tint(this.$('d-amat').value, this.$('d-acol').value) },
      b: { mat: this.$('d-bmat').value, color: tint(this.$('d-bmat').value, this.$('d-bcol').value) },
      trim: this.$('d-trim').value,
    };
    registerStyle(id, st);
    this.game.customStyles[id] = st;
    this.build.opt.style = id;
    this.game.hud.toast(`Saved finish “${name}”`, 2);
    this.game.markDirty && this.game.markDirty();
  }
}
function blank() { return Array.from({ length: SHAPE_ROWS }, () => new Array(SHAPE_COLS).fill('#')); }
