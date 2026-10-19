// PDF via PDF.js. Uses the PDF outline (bookmarks) for chapters when present,
// otherwise falls back to heading detection on the extracted text.
import type { Chapter } from '../types';
import { chaptersFromParagraphs, paragraphsFromLines } from './text';

type PdfItem = { str: string; hasEOL: boolean; transform: number[]; height: number };
type OutlineNode = { title: string; dest: unknown; items?: OutlineNode[] };

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

export async function parsePdf(
  buffer: ArrayBuffer,
  fallbackTitle: string,
): Promise<{ title: string; chapters: Chapter[] }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = meta?.info as { Title?: string } | undefined;
    const title = info?.Title?.trim() || fallbackTitle;

    const pageLines: string[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Drop bare page numbers, which are usually footers.
      const lines = linesFromItems(content.items).filter((l) => !/^\d{1,4}$/.test(l));
      pageLines.push(lines);
    }

    // Resolve top-level outline entries to page indices.
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

    if (unique.length >= 2) {
      const chapters: Chapter[] = [];
      if (unique[0].page > 0) {
        const lines = pageLines.slice(0, unique[0].page).flatMap((l) => [...l, '']);
        chapters.push({ title: 'Opening', paragraphs: paragraphsFromLines(lines) });
      }
      unique.forEach((s, k) => {
        const end = k + 1 < unique.length ? unique[k + 1].page : pageLines.length;
        const lines = pageLines.slice(s.page, end).flatMap((l) => [...l, '']);
        chapters.push({ title: s.title, paragraphs: paragraphsFromLines(lines) });
      });
      const nonEmpty = chapters.filter((c) => c.paragraphs.length > 0);
      if (nonEmpty.length) return { title, chapters: nonEmpty };
    }

    const all = pageLines.flatMap((l) => [...l, '']);
    const chapters = chaptersFromParagraphs(paragraphsFromLines(all), fallbackTitle);
    if (chapters.every((c) => c.paragraphs.length === 0)) {
      throw new Error('No selectable text was found. Scanned PDFs need OCR, which is not supported yet.');
    }
    return { title, chapters };
  } finally {
    await task.destroy();
  }
}
