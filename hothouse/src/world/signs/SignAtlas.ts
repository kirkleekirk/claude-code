import '@fontsource/limelight/latin.css';
import '@fontsource/pacifico/latin.css';
import '@fontsource/monoton/latin.css';
import '@fontsource/alfa-slab-one/latin.css';
import '@fontsource/bungee/latin.css';
import '@fontsource/knewave/latin.css';
import '@fontsource/saira-stencil-one/latin.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/figtree/wght.css';
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { log } from '@/core/log';
import type { TimeSlicer } from '@/core/slicer';
import type { SignRequest } from '../buildings/kit';

/** Font keys used by sign requests. All OFL / Apache, bundled locally. */
const FONTS: Record<string, { family: string; weight: number; italic?: boolean; scale: number }> = {
  deco: { family: 'Limelight', weight: 400, scale: 1 },
  script: { family: 'Pacifico', weight: 400, scale: 0.86 },
  motel: { family: 'Monoton', weight: 400, scale: 0.86 },
  serif: { family: 'Fraunces Variable', weight: 700, italic: true, scale: 1 },
  slab: { family: 'Alfa Slab One', weight: 400, scale: 0.94 },
  retro: { family: 'Bungee', weight: 400, scale: 0.86 },
  brush: { family: 'Knewave', weight: 400, scale: 0.94 },
  block: { family: 'Figtree Variable', weight: 900, scale: 1 },
  stencil: { family: 'Saira Stencil One', weight: 400, scale: 1 },
};

export interface AtlasRegion {
  page: number;
  /** UV rectangle (u0, v0 bottom-left; u1, v1 top-right) in texture space. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Drawn content aspect (width / height). */
  aspect: number;
  /** Neon (glowing, additive) or board (opaque, lit). */
  layer: 'neon' | 'board';
}

const PAGE = 2048;
const PAD = 6;

interface Shelf {
  y: number;
  h: number;
  x: number;
}

/**
 * Renders every distinct sign once into canvas pages and hands out UV regions. Identical signs
 * (same text, kind, font and colours) share a region.
 */
export class SignAtlas {
  readonly pages: CanvasTexture[] = [];
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly ctxs: CanvasRenderingContext2D[] = [];
  private shelves: Shelf[] = [];
  private readonly cache = new Map<string, AtlasRegion>();

  static async create(requests: readonly SignRequest[], slicer: TimeSlicer): Promise<{ atlas: SignAtlas; regions: AtlasRegion[] }> {
    const atlas = new SignAtlas();
    await atlas.loadFonts();
    atlas.newPage();
    const regions: AtlasRegion[] = [];
    for (let i = 0; i < requests.length; i++) {
      regions.push(atlas.region(requests[i]!));
      if (i % 24 === 0) await slicer.breathe();
    }
    for (const t of atlas.pages) t.needsUpdate = true;
    return { atlas, regions };
  }

  private async loadFonts(): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return;
    const jobs = Object.values(FONTS).map((f) => document.fonts.load(`${f.italic ? 'italic ' : ''}${f.weight} 48px "${f.family}"`, 'AaBb’È'));
    try {
      await Promise.all(jobs);
    } catch (err) {
      log.warn('signs', `font load failed: ${String(err)}`);
    }
  }

  private newPage(): void {
    const c = document.createElement('canvas');
    c.width = PAGE;
    c.height = PAGE;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, PAGE, PAGE);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    this.canvases.push(c);
    this.ctxs.push(ctx);
    this.pages.push(tex);
    this.shelves = [];
  }

  private alloc(w: number, h: number): { page: number; x: number; y: number } {
    w = Math.ceil(w) + PAD * 2;
    h = Math.ceil(h) + PAD * 2;
    for (const s of this.shelves) {
      if (h <= s.h && s.x + w <= PAGE) {
        const r = { page: this.pages.length - 1, x: s.x + PAD, y: s.y + PAD };
        s.x += w;
        return r;
      }
    }
    const top = this.shelves.length ? this.shelves[this.shelves.length - 1]!.y + this.shelves[this.shelves.length - 1]!.h : 0;
    if (top + h > PAGE) {
      this.newPage();
      return this.alloc(w - PAD * 2, h - PAD * 2);
    }
    this.shelves.push({ y: top, h, x: w });
    return { page: this.pages.length - 1, x: PAD, y: top + PAD };
  }

  region(r: SignRequest): AtlasRegion {
    const key = `${r.kind}|${r.font}|${r.text}|${r.color}|${r.accent}|${r.vertical ? 1 : 0}|${Math.round((r.width / r.height) * 4)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const out = this.draw(r);
    this.cache.set(key, out);
    return out;
  }

  private font(key: string, px: number): string {
    const f = FONTS[key] ?? FONTS.block!;
    return `${f.italic ? 'italic ' : ''}${f.weight} ${Math.round(px * f.scale)}px "${f.family}", system-ui, sans-serif`;
  }

  private draw(r: SignRequest): AtlasRegion {
    if (r.vertical) return this.drawBlade(r);
    if (r.kind === 'neon') return this.drawNeon(r);
    return this.drawBoard(r);
  }

  /** Glowing letters on transparent: filled tube colour with a hot, lighter core. */
  private drawNeon(r: SignRequest): AtlasRegion {
    const H = 72;
    const probe = this.ctxs[this.ctxs.length - 1]!;
    probe.font = this.font(r.font, H * 0.62);
    const textW = Math.min(1600, Math.max(H, probe.measureText(r.text).width + H * 0.4));
    const a = this.alloc(textW, H);
    const ctx = this.ctxs[a.page]!;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.font = this.font(r.font, H * 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = r.color;
    ctx.lineWidth = H * 0.06;
    ctx.strokeText(r.text, textW / 2, H * 0.52);
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, textW / 2, H * 0.52);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = H * 0.02;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(r.text, textW / 2, H * 0.52);
    ctx.restore();
    return this.uv(a, textW, H, 'neon');
  }

  /** Vertical stacked letters for Deco blade signs. */
  private drawBlade(r: SignRequest): AtlasRegion {
    const cell = 64;
    const chars = [...r.text];
    const w = cell;
    const h = cell * chars.length;
    const a = this.alloc(w, h);
    const ctx = this.ctxs[a.page]!;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.font = this.font(r.font, cell * 0.78);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      ctx.fillStyle = r.color;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.strokeText(ch, w / 2, cell * (i + 0.55));
      ctx.fillText(ch, w / 2, cell * (i + 0.55));
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.strokeText(ch, w / 2, cell * (i + 0.55));
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    return this.uv(a, w, h, 'neon');
  }

  /** Opaque boards: painted shop signs, motel marquees and billboards. */
  private drawBoard(r: SignRequest): AtlasRegion {
    const aspect = Math.max(0.5, Math.min(8, r.width / r.height));
    const H = r.kind === 'billboard' ? 200 : r.kind === 'marquee' ? 180 : 76;
    const W = Math.min(1400, Math.round(H * aspect));
    const a = this.alloc(W, H);
    const ctx = this.ctxs[a.page]!;
    ctx.save();
    ctx.translate(a.x, a.y);
    const rad = r.kind === 'billboard' ? 4 : H * 0.18;
    // Board.
    ctx.fillStyle = r.accent;
    roundRect(ctx, 0, 0, W, H, rad);
    ctx.fill();
    ctx.lineWidth = Math.max(2, H * 0.05);
    ctx.strokeStyle = r.kind === 'billboard' ? 'rgba(0,0,0,0)' : r.color;
    roundRect(ctx, ctx.lineWidth, ctx.lineWidth, W - ctx.lineWidth * 2, H - ctx.lineWidth * 2, rad * 0.8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (r.kind === 'billboard') {
      const [headline, sub] = splitBillboard(r.text);
      ctx.fillStyle = r.color;
      ctx.font = this.font('block', H * 0.34);
      fitText(ctx, headline, W * 0.92, H * 0.34, this.font.bind(this, 'block'));
      ctx.fillText(headline, W / 2, H * 0.4);
      if (sub) {
        ctx.font = this.font('block', H * 0.14);
        ctx.globalAlpha = 0.85;
        ctx.fillText(sub, W / 2, H * 0.76);
        ctx.globalAlpha = 1;
      }
    } else {
      if (r.kind === 'marquee') {
        // Chaser bulbs around the edge.
        ctx.fillStyle = '#FFF4E3';
        const step = 18;
        for (let x = step; x < W - step / 2; x += step) {
          bulb(ctx, x, 9);
          bulb(ctx, x, H - 9);
        }
        for (let y = step; y < H - step / 2; y += step) {
          bulb(ctx, 9, y);
          bulb(ctx, W - 9, y);
        }
      }
      ctx.fillStyle = r.color;
      const px = r.kind === 'marquee' ? H * 0.24 : H * 0.56;
      ctx.font = this.font(r.font, px);
      const lines = r.kind === 'marquee' ? wrap(r.text, 2) : [r.text];
      lines.forEach((line, i) => {
        fitText(ctx, line, W * 0.86, px, this.font.bind(this, r.font));
        const y = lines.length === 1 ? H * 0.53 : H * (0.36 + i * 0.32);
        ctx.fillText(line, W / 2, y);
      });
    }
    ctx.restore();
    return this.uv(a, W, H, 'board');
  }

  private uv(a: { page: number; x: number; y: number }, w: number, h: number, layer: 'neon' | 'board'): AtlasRegion {
    return { page: a.page, u0: a.x / PAGE, u1: (a.x + w) / PAGE, v1: 1 - a.y / PAGE, v0: 1 - (a.y + h) / PAGE, aspect: w / h, layer };
  }

  dispose(): void {
    for (const t of this.pages) t.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bulb(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Shrink the current font until the text fits. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number, font: (px: number) => string): void {
  let size = px;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxW && size > 8) {
    size *= 0.92;
    ctx.font = font(size);
  }
}

function wrap(text: string, maxLines: number): string[] {
  const words = text.split(' ');
  if (words.length < 2 || maxLines < 2) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

function splitBillboard(text: string): [string, string] {
  const i = text.indexOf('|');
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)];
}
