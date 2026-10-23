import * as THREE from 'three';

// The Chicago Theatre's sign over State Street: the tall vertical blade with CHICAGO spelled down
// it in bulbs, and the marquee under it. A few bulbs are dead, a few flicker; the rest still burn.

function bulbs(g, x, y, w, h, gap, r, R, dead = 0.08) {
  for (let yy = y; yy <= y + h + 0.01; yy += gap) for (let xx = x; xx <= x + w + 0.01; xx += gap) {
    if (R() < dead) continue;
    g.beginPath(); g.arc(xx, yy, r, 0, Math.PI * 2); g.fill();
  }
}
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** a canvas with the blade's face: colour (red panel, cream letters) and glow (the bulbs) */
function bladeTextures() {
  const W = 256, H = 1536, R = rng(5);
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = make(), glow = make();
  const g = col.getContext('2d'), e = glow.getContext('2d');
  g.fillStyle = '#7a0f12'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d8c48a'; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, H - 20);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // border bulbs
  e.fillStyle = '#fff3c8'; g.fillStyle = '#f5e3b0';
  for (const ctx of [e, g]) { bulbs(ctx, 22, 22, W - 44, 0, 18, 5, R); bulbs(ctx, 22, H - 22, W - 44, 0, 18, 5, R); bulbs(ctx, 22, 22, 0, H - 44, 18, 5, R); bulbs(ctx, W - 22, 22, 0, H - 44, 18, 5, R); }
  // the letters, each traced in bulbs over a cream face
  const letters = 'CHICAGO';
  const lh = (H - 80) / letters.length;
  letters.split('').forEach((ch, i) => {
    const cy = 40 + lh * (i + 0.5);
    const m = make().getContext('2d');
    m.canvas.width = W; m.canvas.height = Math.ceil(lh);
    m.fillStyle = '#000'; m.fillRect(0, 0, W, lh);
    m.font = `bold ${Math.round(lh * 0.88)}px Georgia, 'Times New Roman', serif`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillStyle = '#fff'; m.fillText(ch, W / 2, lh * 0.53);
    const px = m.getImageData(0, 0, W, Math.ceil(lh)).data;
    g.save(); g.font = m.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#efe0b8'; g.fillText(ch, W / 2, cy + lh * 0.03); g.restore();
    e.fillStyle = '#fff1c4'; g.fillStyle = '#fffbe8';
    for (let yy = 4; yy < lh - 4; yy += 11) for (let xx = 8; xx < W - 8; xx += 11) {
      if (px[(Math.round(yy) * W + Math.round(xx)) * 4] < 128 || R() < 0.07) continue;
      for (const ctx of [e, g]) { ctx.beginPath(); ctx.arc(xx, cy - lh / 2 + yy, 3.6, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  const tc = new THREE.CanvasTexture(col), te = new THREE.CanvasTexture(glow);
  tc.colorSpace = te.colorSpace = THREE.SRGBColorSpace; tc.anisotropy = te.anisotropy = 8;
  return [tc, te];
}

function marqueeTextures() {
  const W = 1024, H = 192, R = rng(9);
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = make(), glow = make();
  const g = col.getContext('2d'), e = glow.getContext('2d');
  g.fillStyle = '#1b1712'; g.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  g.fillStyle = '#d9b968'; g.fillRect(0, 0, W, 16); g.fillRect(0, H - 16, W, 16);
  e.fillStyle = '#ffe9b0'; g.fillStyle = '#fff4d2';
  for (const ctx of [e, g]) { bulbs(ctx, 14, 30, W - 28, 0, 20, 5, R, 0.12); bulbs(ctx, 14, H - 30, W - 28, 0, 20, 5, R, 0.12); }
  // the readerboard: black letters on a lit panel, half of them shaken loose
  g.fillStyle = '#efe7cf'; g.fillRect(40, 48, W - 80, H - 96);
  e.fillStyle = '#6d6248'; e.fillRect(40, 48, W - 80, H - 96);
  g.fillStyle = '#141414'; g.font = 'bold 68px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const msg = 'EVACUATE  ·  STAY SAFE CHICAGO';
  let x = W / 2 - g.measureText(msg).width / 2;
  for (const ch of msg) { const w = g.measureText(ch).width; if (R() > 0.12) { g.save(); g.translate(x + w / 2, H / 2 + 2); g.rotate((R() - 0.5) * 0.12); g.fillText(ch, 0, 0); g.restore(); } x += w; }
  const tc = new THREE.CanvasTexture(col), te = new THREE.CanvasTexture(glow);
  tc.colorSpace = te.colorSpace = THREE.SRGBColorSpace; tc.anisotropy = te.anisotropy = 8;
  return [tc, te];
}

/** the sign on a wall at x (facing -x, onto the street), centred at z, blade from y0 to y1 */
export function makeTheatreSign({ x, z, y0, y1 }) {
  const g = new THREE.Group();
  const [bc, be] = bladeTextures();
  const face = new THREE.MeshStandardMaterial({ map: bc, emissiveMap: be, emissive: new THREE.Color(2.4, 2.1, 1.6), roughness: 0.5, metalness: 0.1 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x5a1012, roughness: 0.55, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb8964a, roughness: 0.35, metalness: 0.8 });
  const H = y1 - y0, D = 3.4, T = 0.7;
  // the blade: two lettered faces, a narrow edge, a crown
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(D, H), face);
    p.position.set(x - D / 2 - 0.15, y0 + H / 2, z + s * T / 2);
    p.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(p);
  }
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, T), frame); edge.position.set(x - D - 0.25, y0 + H / 2, z); g.add(edge);
  const back = new THREE.Mesh(new THREE.BoxGeometry(D, H, T - 0.04), frame); back.position.set(x - D / 2 - 0.15, y0 + H / 2, z); g.add(back);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.2, 1.8, 4, 1), trim); crown.position.set(x - D / 2, y1 + 0.9, z); crown.rotation.y = Math.PI / 4; g.add(crown);
  for (const yy of [y0, y1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(D + 0.4, 0.35, T + 0.25), trim); b.position.set(x - D / 2 - 0.1, yy, z); g.add(b); }
  // the marquee: a deep box over the sidewalk, angled readerboards on its front
  const [mc, me] = marqueeTextures();
  const board = new THREE.MeshStandardMaterial({ map: mc, emissiveMap: me, emissive: new THREE.Color(2.0, 1.8, 1.4), roughness: 0.6 });
  const MW = 15, MD = 3.6, MY = 3.9, MH = 2.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(MD, MH, MW), frame); body.position.set(x - MD / 2, MY + MH / 2, z); g.add(body);
  const half = MW / 2;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(half, 0.9), MH * 0.92), board);
    p.position.set(x - MD - 0.47, MY + MH / 2, z + s * half / 2);
    p.rotation.y = -Math.PI / 2 + s * Math.atan2(0.9, half);
    g.add(p);
  }
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(MD, MH * 0.92), board); sideL.position.set(x - MD / 2, MY + MH / 2, z - half - 0.01); sideL.rotation.y = Math.PI; g.add(sideL);
  const sideR = sideL.clone(); sideR.position.z = z + half + 0.01; sideR.rotation.y = 0; g.add(sideR);
  // its underside: rows of bulbs
  const under = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: new THREE.Color(1.6, 1.3, 0.8), emissiveMap: underBulbs(), roughness: 0.6 });
  const u = new THREE.Mesh(new THREE.PlaneGeometry(MD, MW), under); u.rotation.x = Math.PI / 2; u.position.set(x - MD / 2, MY - 0.01, z); g.add(u);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(MD + 0.3, 0.3, MW + 0.3), trim); tb.position.set(x - MD / 2, MY + MH + 0.15, z); g.add(tb);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, boxes: [[x - D - 0.4, y0, z - T / 2 - 0.15, x, y1 + 1.8, z + T / 2 + 0.15], [x - MD - 0.5, MY, z - half - 0.2, x, MY + MH + 0.3, z + half + 0.2]] };
}

function underBulbs() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d'), R = rng(3);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 512);
  g.fillStyle = '#fff';
  bulbs(g, 10, 10, 108, 492, 14, 3.5, R, 0.15);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
