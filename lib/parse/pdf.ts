// PDF via PDF.js.
//
// Three jobs, in this order:
//   1. Read the first page as the book's cover (covers.ts checks it is not blank).
//   2. Lift the text of every page. A page with no selectable text is a scan, so it
//      is rendered at OCR resolution and read with Tesseract (lib/ocr.ts). This is
//      what makes a scanned book readable and speakable instead of a wall of images.
//   3. Chapter the text by the PDF outline when there is one, otherwise by headings.
//
// Each paragraph remembers the page it came from, so the reader can draw page
// separators in the middle of a chapter.
import type { BookCover, Chapter } from '../types';
import { renderPdfCover, type RenderablePage } from '../covers';
import { disposeOcr, ocrSupported, ocrCanvas } from '../ocr';
import type { ImportPhase } from './progress';
import { chapterRanges, paragraphsFromLines } from './text';

type PdfItem = { str: string; hasEOL: boolean; transform: number[]; height: number };
type OutlineNode = { title: string; dest: unknown; items?: OutlineNode[] };

/** A page with fewer words than this is treated as a scan and sent to OCR. */
export const OCR_MIN_WORDS = 12;
/** Share of the page that must carry ink before OCR is worth trying. */
const OCR_MIN_INK = 0.004;

export interface PdfParseOptions {
  onProgress?: (progress: { phase: ImportPhase; page?: number; pageCount?: number; message: string }) => void;
  signal?: AbortSignal;
  /** Turn OCR off to import only the digital text. */
  ocr?: boolean;
}

export interface PdfParseResult {
  title: string;
  author: string;
  chapters: Chapter[];
  pageCount: number;
  cover: BookCover | null;
  /** Pages that needed the scanned-image reader. */
  ocrPages: number;
}

function isTextItem(x: unknown): x is PdfItem {
  return !!x && typeof x === 'object' && 'str' in x && 'transform' in x;
}

/** Rebuilds visual lines from text items. A large vertical gap becomes a blank line (paragraph break). */
function linesFromItems(items: unknown[]): string[] {
  const out: string[] = [];
  let line = '';
  let lastY: number | null = null;
  let lastH = 10;

  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
    line = '';
  };

  for (const raw of items) {
    if (!isTextItem(raw)) continue;
    const y = raw.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > lastH * 0.5) {
      const gap = lastY - y;
      flush();
      if (gap > lastH * 1.9) out.push('');
    }
    line += raw.str;
    if (raw.hasEOL) flush();
    lastY = y;
    lastH = raw.height || lastH;
  }
  flush();
  return out.filter((l, i, arr) => !(l === '' && arr[i - 1] === ''));
}

/** Text lines -> paragraphs for one page, with bare page numbers dropped. */
function pageParagraphsFromLines(lines: string[]): string[] {
  return paragraphsFromLines(lines.filter((l) => !/^\d{1,4}$/.test(l)));
}

function wordCountOf(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

function abortError(): Error {
  const err = new Error('Import cancelled.');
  err.name = 'AbortError';
  return err;
}

/**
 * Renders one page at a readable size and reads it with OCR. Returns '' when the
 * page is blank or the engine cannot start, so the digital text is kept instead.
 */
async function ocrPage(page: RenderablePage, report?: (message: string) => void): Promise<string> {
  if (!ocrSupported()) return '';
  try {
    const base = page.getViewport({ scale: 1 });
    // About 1,700px on the long edge: reliable for body text without making a
    // 300-page scan take all afternoon.
    const scale = Math.max(1, 1700 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Skip pages that are genuinely empty: OCR would only return nothing.
    const { analyzePixels, isBlankPage } = await import('../covers');
    const stats = analyzePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    if (isBlankPage(stats) && 1 - stats.nearWhite < OCR_MIN_INK) return '';

    return await ocrCanvas(canvas, (progress) => {
      const status = progress.status.toLowerCase();
      if (status.includes('core') || status.includes('traineddata') || status.includes('initializing')) {
        report?.('Preparing the scanned-text reader…');
      } else if (status.includes('recognizing')) {
        report?.(`Recognising the text on this page… ${Math.round(progress.progress * 100)}%`);
      }
    });
  } catch {
    return '';
  }
}

export async function parsePdf(
  buffer: ArrayBuffer,
  fallbackTitle: string,
  options: PdfParseOptions = {},
): Promise<PdfParseResult> {
  const { onProgress, signal, ocr = true } = options;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = meta?.info as { Title?: string; Author?: string } | undefined;
    const title = info?.Title?.trim() || fallbackTitle;
    const author = info?.Author?.trim() || '';

    const total = doc.numPages;
    onProgress?.({ phase: 'text', page: 0, pageCount: total, message: `Opening ${total} pages…` });

    // ---- Tier 1 & 2: the first page as a cover ----
    let cover: BookCover | null = null;
    if (typeof document !== 'undefined') {
      onProgress?.({ phase: 'cover', page: 1, pageCount: total, message: 'Making the cover…' });
      try {
        const first = await doc.getPage(1);
        const rendered = await renderPdfCover(first);
        cover = rendered.cover;
        first.cleanup();
      } catch {
        cover = null;
      }
    }

    // ---- Text, page by page, with OCR where a page has none ----
    const pages: { page: number; paragraphs: string[] }[] = [];
    let ocrPages = 0;
    const canOcr = ocr && ocrSupported();

    for (let i = 1; i <= total; i++) {
      if (signal?.aborted) throw abortError();
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let paragraphs = pageParagraphsFromLines(linesFromItems(content.items));
      const nativeWords = paragraphs.reduce((n, p) => n + wordCountOf(p), 0);

      if (canOcr && nativeWords < OCR_MIN_WORDS) {
        onProgress?.({
          phase: 'ocr',
          page: i,
          pageCount: total,
          message: `Reading the scanned text on page ${i} of ${total}…`,
        });
        const recognised = await ocrPage(page, (message) =>
          onProgress?.({ phase: 'ocr', page: i, pageCount: total, message }),
        );
        const ocrParagraphs = pageParagraphsFromLines(recognised.split(/\r?\n/));
        const ocrWords = ocrParagraphs.reduce((n, p) => n + wordCountOf(p), 0);
        if (ocrWords > nativeWords) {
          paragraphs = ocrParagraphs;
          ocrPages += 1;
        }
      }

      pages.push({ page: i, paragraphs });
      onProgress?.({
        phase: 'text',
        page: i,
        pageCount: total,
        message:
          ocrPages > 0
            ? `Read ${i} of ${total} pages (${ocrPages} scanned)…`
            : `Reading page ${i} of ${total}…`,
      });
      page.cleanup();
      // Hand the main thread back now and then so the browser can keep painting.
      if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // A flat list of paragraphs and the page each came from, ready to be sliced.
    const allParagraphs: string[] = [];
    const allPageNumbers: number[] = [];
    for (const p of pages) {
      for (const paragraph of p.paragraphs) {
        allParagraphs.push(paragraph);
        allPageNumbers.push(p.page);
      }
    }

    // ---- Chapters ----
    const outline = (await doc.getOutline().catch(() => null)) as OutlineNode[] | null;
    const starts: { page: number; title: string }[] = [];
    if (outline && outline.length) {
      const nodes = outline.length >= 2 ? outline : (outline[0]?.items ?? outline);
      for (const node of nodes) {
        if (!node.dest) continue;
        try {
          const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
          const ref = Array.isArray(dest) ? dest[0] : null;
          if (!ref) continue;
          const page = await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
          if (node.title?.trim()) starts.push({ page, title: node.title.trim() });
        } catch {
          // Skip entries whose destinations cannot be resolved.
        }
      }
    }
    starts.sort((a, b) => a.page - b.page);
    const unique = starts.filter((s, i) => i === 0 || s.page !== starts[i - 1].page);

    let chapters: Chapter[] = [];
    if (unique.length >= 2) {
      const sliceChapter = (titleText: string, fromPage: number, toPage: number): Chapter | null => {
        const paragraphs: string[] = [];
        const pageNumbers: number[] = [];
        for (const p of pages) {
          if (p.page < fromPage || p.page > toPage) continue;
          for (const paragraph of p.paragraphs) {
            paragraphs.push(paragraph);
            pageNumbers.push(p.page);
          }
        }
        return paragraphs.length ? { title: titleText, paragraphs, pageNumbers } : null;
      };

      if (unique[0].page > 0) {
        const opening = sliceChapter('Opening', 1, unique[0].page); // page indices are 0-based in the outline
        if (opening) chapters.push(opening);
      }
      unique.forEach((s, k) => {
        const end = k + 1 < unique.length ? unique[k + 1].page : pages.length;
        // Outline page indices are 0-based; pages are 1-based.
        const chapter = sliceChapter(s.title, s.page + 1, end);
        if (chapter) chapters.push(chapter);
      });
    }

    if (chapters.length === 0) {
      chapters = chapterRanges(allParagraphs, fallbackTitle).map((range) => ({
        title: range.title,
        paragraphs: allParagraphs.slice(range.start, range.end),
        pageNumbers: allPageNumbers.slice(range.start, range.end),
      }));
    }

    chapters = chapters.filter((c) => c.paragraphs.length > 0);
    if (chapters.length === 0) {
      // No text anywhere, and OCR found nothing either. Make a readable book out of
      // the empty pages beside a generated title cover, so the import says what
      // happened rather than failing with a stack trace.
      const message =
        'This PDF has no selectable text and the scanned-image reader found nothing. It may be image-only at too low a resolution to read.';
      if (!canOcr) throw new Error(`${message} OCR is unavailable in this browser.`);
      throw new Error(message);
    }

    return { title, author, chapters, pageCount: total, cover, ocrPages };
  } finally {
    await disposeOcr();
    await task.destroy();
  }
}
