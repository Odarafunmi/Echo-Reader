// Book covers.
//
// Tier 1: the first page of a PDF, rendered to an image.
// Tier 2: that render is measured; a blank, near-white or failed page is rejected.
// Tier 3: a solid-colour title cover, drawn locally, so no book is ever left with
//         a generic gradient.
//
// The measuring and colour picking here are pure, so they can be tested without a
// browser. Only the drawing functions touch a canvas.

import type { BookCover } from './types';

/**
 * Eight deep, solid colours. All of them are dark enough for white text to pass
 * WCAG AA at large sizes (the lowest contrast here is above 8:1). No gradients.
 */
export const COVER_COLORS = [
  { name: 'Midnight Navy', hex: '#1E3A5F' },
  { name: 'Wine', hex: '#5B2333' },
  { name: 'Forest', hex: '#21503F' },
  { name: 'Indigo', hex: '#3A2A66' },
  { name: 'Chestnut', hex: '#6B3F1F' },
  { name: 'Deep Teal', hex: '#0F5257' },
  { name: 'Plum', hex: '#4B2142' },
  { name: 'Slate', hex: '#2F3E4E' },
] as const;

/** 32-bit string hash (FNV-1a), stable across reloads and devices. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Picks a palette entry for a book. `used` is the colours already on the shelf, so
 * a new book takes the least-used colour and a shelf of five looks varied. Ties are
 * broken by a hash of the title, which keeps the choice stable for the same book.
 */
export function chooseCoverColor(seed: string, used: readonly number[] = []): number {
  const counts = COVER_COLORS.map(() => 0);
  for (const index of used) {
    if (Number.isInteger(index) && index >= 0 && index < counts.length) counts[index] += 1;
  }
  const fewest = Math.min(...counts);
  const candidates = counts.map((n, i) => (n === fewest ? i : -1)).filter((i) => i >= 0);
  return candidates[hashString(seed) % candidates.length];
}

/** Relative luminance of `#rrggbb`, per WCAG 2.1. */
export function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Contrast ratio between two hex colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export interface PixelStats {
  /** Average lightness, 0 (black) to 1 (white). */
  mean: number;
  /** Share of pixels within 6% of white. */
  nearWhite: number;
  /** Standard deviation of lightness; low means the page is one flat colour. */
  deviation: number;
}

/**
 * Measures a rendered page. Samples at most ~40,000 pixels, which is plenty to
 * tell a blank scan from a title page and keeps a 300-page import responsive.
 */
export function analyzePixels(data: Uint8ClampedArray): PixelStats {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return { mean: 1, nearWhite: 1, deviation: 0 };
  const step = Math.max(1, Math.floor(pixels / 40_000));

  let sum = 0;
  let sumSquares = 0;
  let white = 0;
  let count = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const alpha = data[i + 3] / 255;
    // Composite over white, so transparent areas count as blank paper.
    const r = data[i] * alpha + 255 * (1 - alpha);
    const g = data[i + 1] * alpha + 255 * (1 - alpha);
    const b = data[i + 2] * alpha + 255 * (1 - alpha);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sum += l;
    sumSquares += l * l;
    if (l > 0.94) white += 1;
    count += 1;
  }
  const mean = sum / count;
  const variance = Math.max(0, sumSquares / count - mean * mean);
  return { mean, nearWhite: white / count, deviation: Math.sqrt(variance) };
}

/**
 * True when a page is not worth showing as a cover: it is paper-white with almost
 * nothing on it, or one flat block of colour (a scan that failed to render).
 */
export function isBlankPage(stats: PixelStats): boolean {
  if (stats.nearWhite > 0.985) return true; // essentially white
  if (stats.deviation < 0.012 && stats.mean > 0.8) return true; // flat pale wash
  if (stats.deviation < 0.004) return true; // flat colour, including all black
  return false;
}

/** True for image sources the browser can show in an <img>. */
export function isValidCoverDataUrl(url: string | undefined | null): url is string {
  return typeof url === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
}

/** Wraps words into lines that fit `maxWidth`, breaking only at spaces. */
export function wrapLines(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ---------- Drawing (browser only) ---------- */

export const COVER_WIDTH = 600;
export const COVER_HEIGHT = 900;

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Draws the solid-colour title cover. Large centred serif title, author beneath it,
 * and a small wordmark at the foot. Everything is white on a dark flat colour.
 */
export function drawCustomCover(title: string, author: string, colorIndex: number): string {
  const canvas = canvasOf(COVER_WIDTH, COVER_HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const color = COVER_COLORS[((colorIndex % COVER_COLORS.length) + COVER_COLORS.length) % COVER_COLORS.length];

  ctx.fillStyle = color.hex;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // A hairline inset frame gives the flat colour a printed-book finish.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, COVER_WIDTH - 52, COVER_HEIGHT - 52);

  const cleanTitle = title.replace(/\s+/g, ' ').trim() || 'Untitled';
  const cleanAuthor = author.replace(/\s+/g, ' ').trim();
  const maxWidth = COVER_WIDTH - 120;

  // Shrink the title until it fits in at most six lines, then ellipsize.
  let fontSize = 66;
  let lines = [cleanTitle];
  for (; fontSize >= 30; fontSize -= 2) {
    ctx.font = `700 ${fontSize}px Fraunces, Georgia, "Times New Roman", serif`;
    lines = wrapLines((text) => ctx.measureText(text).width, cleanTitle, maxWidth);
    if (lines.length <= 6) break;
  }
  if (lines.length > 6) {
    lines = lines.slice(0, 6);
    const last = lines[5];
    lines[5] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }

  const lineHeight = fontSize * 1.18;
  const authorSize = 26;
  const titleBlock = lines.length * lineHeight;
  const authorBlock = cleanAuthor ? authorSize * 1.9 : 0;
  const total = titleBlock + authorBlock;
  let y = COVER_HEIGHT / 2 - total / 2 + fontSize * 0.82;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${fontSize}px Fraunces, Georgia, "Times New Roman", serif`;
  for (const line of lines) {
    ctx.fillText(line, COVER_WIDTH / 2, y, maxWidth);
    y += lineHeight;
  }

  if (cleanAuthor) {
    ctx.font = `italic 400 ${authorSize}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillText(cleanAuthor, COVER_WIDTH / 2, y + 14, maxWidth);
  }

  // Foot: a short rule and the wordmark.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.fillRect(COVER_WIDTH / 2 - 26, COVER_HEIGHT - 92, 52, 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('ECHO SHELF', COVER_WIDTH / 2, COVER_HEIGHT - 58);
  ctx.letterSpacing = '0px';

  return canvas.toDataURL('image/jpeg', 0.84);
}

/**
 * Renders page 1 of a PDF into a 600x900 cover. The page is fitted inside a thin
 * dark mat so portrait and landscape scans both sit well on the shelf.
 *
 * Returns `null` when the page cannot be rendered, which sends the caller to the
 * custom cover.
 */
export interface RenderablePage {
  getViewport(options: { scale: number }): { width: number; height: number };
  // The real parameter is pdf.js's RenderParameters, whose required fields differ
  // between versions; the page is only ever handed straight back to pdf.js.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(options: any): { promise: Promise<void>; cancel?: () => void };
}

export async function renderPdfCover(
  page: RenderablePage,
): Promise<{ cover: BookCover | null; stats: PixelStats | null }> {
  try {
    const base = page.getViewport({ scale: 1 });
    if (!base.width || !base.height) return { cover: null, stats: null };
    // Render around 1000px on the long edge: enough detail for a cover, small
    // enough to keep a 400-page import quick.
    const scale = Math.max(0.5, 1000 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const pageCanvas = canvasOf(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true });
    if (!pageCtx) return { cover: null, stats: null };
    pageCtx.fillStyle = '#FFFFFF';
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    await page.render({ canvas: pageCanvas, canvasContext: pageCtx, viewport }).promise;

    const stats = analyzePixels(pageCtx.getImageData(0, 0, pageCanvas.width, pageCanvas.height).data);
    if (isBlankPage(stats)) return { cover: null, stats };

    const cover = canvasOf(COVER_WIDTH, COVER_HEIGHT);
    const ctx = cover.getContext('2d');
    if (!ctx) return { cover: null, stats };
    ctx.fillStyle = '#14141C';
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

    const padding = 24;
    const fit = Math.min(
      (COVER_WIDTH - padding * 2) / pageCanvas.width,
      (COVER_HEIGHT - padding * 2) / pageCanvas.height,
    );
    const w = pageCanvas.width * fit;
    const h = pageCanvas.height * fit;
    const x = (COVER_WIDTH - w) / 2;
    const y = (COVER_HEIGHT - h) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.drawImage(pageCanvas, x, y, w, h);

    return { cover: { dataUrl: cover.toDataURL('image/jpeg', 0.86), kind: 'page' }, stats };
  } catch {
    return { cover: null, stats: null };
  }
}

/**
 * Builds the custom cover, or returns null if this browser refuses to draw. The
 * card then falls back to the same solid colour behind its own title text, so a
 * book is never left with a gradient.
 */
export function customCover(title: string, author: string, colorIndex: number): BookCover | null {
  try {
    const dataUrl = drawCustomCover(title, author, colorIndex);
    return dataUrl ? { dataUrl, kind: 'custom' } : null;
  } catch {
    return null;
  }
}

/** The solid colour a book's custom cover uses, for the card's fallback background. */
export function paletteHex(colorIndex: number | undefined): string {
  const index = colorIndex ?? 0;
  return COVER_COLORS[((index % COVER_COLORS.length) + COVER_COLORS.length) % COVER_COLORS.length].hex;
}
