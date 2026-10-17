// Client-side library helpers: importing files, reading progress and reader preferences.
import { deleteBook, getBookContent, getBookMeta, listBooks, saveBook } from './db';
import { parseFile } from './parse';
import { countWords } from './parse/text';
import type { Book, BookMeta, Progress, ReaderPrefs } from './types';

export const COVER_PALETTES = [
  ['#8B5CF6', '#E879F9'],
  ['#22D3EE', '#7C3AED'],
  ['#FBBF24', '#7C3AED'],
  ['#34D399', '#4C1D95'],
  ['#FB7185', '#6D28D9'],
] as const;

export function coverGradient(tint: number): string {
  const [a, b] = COVER_PALETTES[((tint % COVER_PALETTES.length) + COVER_PALETTES.length) % COVER_PALETTES.length];
  return `linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

export async function importFile(file: File): Promise<BookMeta> {
  const parsed = await parseFile(file);
  const id = crypto.randomUUID();
  const meta: BookMeta = {
    id,
    title: parsed.title,
    author: parsed.author,
    format: parsed.format,
    addedAt: Date.now(),
    wordCount: countWords(parsed.chapters),
    chapterCount: parsed.chapters.length,
    tint: Math.floor(Math.random() * COVER_PALETTES.length),
  };
  await saveBook(meta, { id, chapters: parsed.chapters });
  return meta;
}

export async function loadBook(id: string): Promise<Book | null> {
  const [meta, content] = await Promise.all([getBookMeta(id), getBookContent(id)]);
  if (!meta || !content) return null;
  return { ...meta, chapters: content.chapters };
}

export { listBooks, deleteBook };

// ---- Progress (localStorage) ----

const PROGRESS_KEY = 'echo-shelf:progress:v1';
export type ProgressMap = Record<string, Progress>;

export function getProgressMap(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as ProgressMap;
  } catch {
    return {};
  }
}

export function saveProgress(id: string, p: Progress): void {
  const map = getProgressMap();
  map[id] = p;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

export function clearProgress(id: string): void {
  const map = getProgressMap();
  delete map[id];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

/** Overall percent through the book, from chapter index plus scroll position within it. */
export function progressPercent(p: Progress | undefined, chapterCount: number): number {
  if (!p || chapterCount <= 0) return 0;
  const frac = (Math.min(Math.max(p.chapter, 0), chapterCount - 1) + Math.min(Math.max(p.ratio, 0), 1)) / chapterCount;
  return Math.round(Math.min(Math.max(frac, 0), 1) * 100);
}

// ---- Reader preferences (localStorage) ----

const PREFS_KEY = 'echo-shelf:prefs:v1';

export const DEFAULT_PREFS: ReaderPrefs = {
  font: 'literata',
  size: 19,
  lineHeight: 1.8,
  margin: 'medium',
  theme: 'midnight',
  customBg: '#101018',
  customFg: '#E4E4EE',
  layout: 'single',
};

export function getPrefs(): ReaderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ReaderPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: ReaderPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

export const READER_THEMES: Record<Exclude<ReaderPrefs['theme'], 'custom'>, { label: string; bg: string; fg: string }> = {
  midnight: { label: 'Midnight', bg: '#0A0A0F', fg: '#E4E4EE' },
  paper: { label: 'Paper', bg: '#F6F1E7', fg: '#2B2B33' },
  sepia: { label: 'Sepia', bg: '#EADFC8', fg: '#3B2F20' },
  violet: { label: 'Violet Dusk', bg: '#17112B', fg: '#DDD6FE' },
};

export function readerColors(p: ReaderPrefs): { bg: string; fg: string } {
  if (p.theme === 'custom') return { bg: p.customBg, fg: p.customFg };
  return READER_THEMES[p.theme];
}
