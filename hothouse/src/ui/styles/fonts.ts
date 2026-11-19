import caveat from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?url';
import figtree from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url';
import frauncesItalic from '@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2?url';
import fraunces from '@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2?url';
import dyslexic700 from '@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url';
import dyslexic400 from '@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url';
import sacramento from '@fontsource/sacramento/files/sacramento-latin-400-normal.woff2?url';

/**
 * Interface fonts (all SIL Open Font License, bundled locally; Latin subsets only, which cover
 * Latin-1, typographic quotes, dashes, the minus sign and the euro). Faces load lazily the first
 * time text uses them; the UI face is preloaded so the first screen paints in it.
 */

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

function face(family: string, url: string, weight: string, style = 'normal', format = 'woff2'): string {
  return `@font-face{font-family:'${family}';src:url(${JSON.stringify(url)}) format('${format}');font-weight:${weight};font-style:${style};font-display:swap;unicode-range:${LATIN}}`;
}

let installed = false;

export function installFonts(doc: Document = document): void {
  if (installed) return;
  installed = true;
  const css = [
    face('Fraunces', fraunces, '100 900', 'normal', 'woff2-variations'),
    face('Fraunces', frauncesItalic, '100 900', 'italic', 'woff2-variations'),
    face('Figtree', figtree, '300 900', 'normal', 'woff2-variations'),
    face('Sacramento', sacramento, '400'),
    face('Caveat', caveat, '400 700', 'normal', 'woff2-variations'),
    face('OpenDyslexic', dyslexic400, '400'),
    face('OpenDyslexic', dyslexic700, '700'),
  ].join('\n');
  const style = doc.createElement('style');
  style.id = 'hh-fonts';
  style.textContent = css;
  doc.head.appendChild(style);

  const preload = doc.createElement('link');
  preload.rel = 'preload';
  preload.as = 'font';
  preload.type = 'font/woff2';
  preload.href = figtree;
  preload.crossOrigin = 'anonymous';
  doc.head.appendChild(preload);
}

/** Resolves when the faces needed for the first screen are ready (or after `timeoutMs`). */
export async function fontsReady(doc: Document = document, timeoutMs = 2500): Promise<void> {
  if (!doc.fonts?.load) return;
  const loads = Promise.all([
    doc.fonts.load("600 16px 'Figtree'"),
    doc.fonts.load("italic 900 48px 'Fraunces'"),
    doc.fonts.load("700 32px 'Fraunces'"),
  ]).then(() => undefined);
  await Promise.race([loads.catch(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
