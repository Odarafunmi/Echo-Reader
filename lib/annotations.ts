// Pure helpers for highlights: splitting paragraphs and reading the user's selection.
import type { Highlight, HighlightColor } from './types';

export interface Segment {
  text: string;
  highlight?: Highlight;
}

/** Splits paragraph text into plain and highlighted runs. Overlaps keep the earlier highlight. */
export function splitByHighlights(text: string, highlights: Highlight[]): Segment[] {
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const h of sorted) {
    const start = Math.max(h.start, cursor);
    const end = Math.min(h.end, text.length);
    if (end <= start) continue;
    if (start > cursor) out.push({ text: text.slice(cursor, start) });
    out.push({ text: text.slice(start, end), highlight: h });
    cursor = end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

export interface SelectionInfo {
  paragraph: number;
  start: number;
  end: number;
  text: string;
}

function paragraphOf(node: Node, root: HTMLElement): HTMLElement | null {
  let el: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (el && el !== root) {
    if (el instanceof HTMLElement && el.dataset.p !== undefined) return el;
    el = el.parentNode;
  }
  return null;
}

/** Converts the current selection into paragraph-relative offsets. Returns null if it spans paragraphs. */
export function selectionInfo(sel: Selection, root: HTMLElement): SelectionInfo | null {
  if (sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const startP = paragraphOf(range.startContainer, root);
  const endP = paragraphOf(range.endContainer, root);
  if (!startP || startP !== endP) return null;

  const before = document.createRange();
  before.selectNodeContents(startP);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const text = (startP.textContent ?? '').slice(start, start + range.toString().length);
  if (!text.trim()) return null;
  return { paragraph: Number(startP.dataset.p), start, end: start + text.length, text };
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; hex: string }> = {
  amber: { label: 'Amber', hex: '#FBBF24' },
  magenta: { label: 'Magenta', hex: '#E879F9' },
  cyan: { label: 'Cyan', hex: '#22D3EE' },
};
