// Client-side library helpers: importing files, covers, reading progress and
// reader preferences.
//
// Everything here is profile aware. A book records its owner at import time, every
// shelf read is filtered by the signed-in profile, and reading positions are kept
// under a per-profile key so two people sharing a browser do not inherit each
// other's place in a book.

import { deleteBook, getBookContent, getBookMeta, listBooks, putBookMeta, saveBook } from './db';
import { parseFile, type ImportProgress } from './parse';
import { countWords } from './parse/text';
import { chooseCoverColor, customCover, isValidCoverDataUrl } from './covers';
import type { Book, BookMeta, BookCover, Progress, ReaderPrefs } from './types';

export { listBooks, deleteBook, putBookMeta };

export interface ImportOptions {
  /** Called as a long import moves through pages, so the shelf can say what it is doing. */
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Parses a file and saves it under `profileId`, with a cover.
 *
 * The cover is the PDF's first page when that page has something on it, and a
 * solid-colour title cover otherwise. The palette entry is chosen from the colours
 * already on this profile's shelf, so a new book balances the shelf.
 */
export async function importFile(file: File, profileId: string, opts: ImportOptions = {}): Promise<BookMeta> {
  const parsed = await parseFile(file, opts);
  const id = crypto.randomUUID();

  const shelf = await listBooks(profileId);
  const usedColors = shelf.map((b) => b.coverColor).filter((n): n is number => Number.isInteger(n));
  const coverColor = chooseCoverColor(`${parsed.title}:${id}`, usedColors);

  let cover: BookCover | null = null;
  if (parsed.cover && isValidCoverDataUrl(parsed.cover.dataUrl)) {
    cover = parsed.cover;
  } else {
    cover = customCover(parsed.title, parsed.author, coverColor);
  }

  const meta: BookMeta = {
    id,
    profileId,
    title: parsed.title,
    author: parsed.author,
    format: parsed.format,
    addedAt: Date.now(),
    wordCount: countWords(parsed.chapters),
    chapterCount: parsed.chapters.length,
    coverColor,
    ...(cover ? { cover } : {}),
  };
  await saveBook(meta, { id, chapters: parsed.chapters, pageCount: parsed.pageCount });
  return meta;
}

/** Loads a book, but only when the signed-in profile owns it. */
export async function loadBook(id: string, profileId: string): Promise<Book | null> {
  const [meta, content] = await Promise.all([getBookMeta(id), getBookContent(id)]);
  if (!meta || !content || meta.profileId !== profileId) return null;
  return { ...withColor(meta), chapters: content.chapters };
}

function withColor(meta: BookMeta): BookMeta {
  if (Number.isInteger(meta.coverColor)) return meta;
  return { ...meta, coverColor: chooseCoverColor(`${meta.title}:${meta.id}`) };
}

/**
 * Fills in a cover for books saved before covers existed (or whose drawing failed
 * on a browser that blocked canvas). The result is saved, so this runs once.
 */
export async function ensureCovers(books: BookMeta[], profileId: string): Promise<BookMeta[]> {
  const used = books.map((b) => b.coverColor).filter((n): n is number => Number.isInteger(n));
  const out: BookMeta[] = [];
  for (const book of books) {
    if (book.profileId !== profileId) continue;
    if (book.cover && isValidCoverDataUrl(book.cover.dataUrl)) {
      out.push(book);
      continue;
    }
    const color = Number.isInteger(book.coverColor)
      ? (book.coverColor as number)
      : chooseCoverColor(`${book.title}:${book.id}`, used);
    const cover = customCover(book.title, book.author, color);
    const next: BookMeta = { ...book, profileId, coverColor: color, ...(cover ? { cover } : {}) };
    try {
      await putBookMeta(next);
    } catch {
      // If the write fails the shelf still shows the colour and the title.
    }
    out.push(next);
  }
  return out;
}

// ---- Progress (localStorage, one map per profile) ----

const progressKey = (profileId: string) => `echo-shelf:progress:v2:${profileId}`;
/** The key used before libraries were split by profile. */
const LEGACY_PROGRESS_KEY = 'echo-shelf:progress:v1';

export type ProgressMap = Record<string, Progress>;

function readMap(key: string): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as ProgressMap;
  } catch {
    return {};
  }
}

export function getProgressMap(profileId: string): ProgressMap {
  return readMap(progressKey(profileId));
}

export function saveProgress(profileId: string, id: string, p: Progress): void {
  const map = getProgressMap(profileId);
  map[id] = p;
  localStorage.setItem(progressKey(profileId), JSON.stringify(map));
}

export function clearProgress(profileId: string, id: string): void {
  const map = getProgressMap(profileId);
  delete map[id];
  localStorage.setItem(progressKey(profileId), JSON.stringify(map));
}

/**
 * Moves reading positions saved before profiles were introduced to the profile
 * signing in now, so an older shelf does not lose its bookmarks. Runs once; the
 * old key is removed afterwards so a second profile cannot inherit them.
 */
export function migrateLegacyProgress(profileId: string): void {
  try {
    const legacy = localStorage.getItem(LEGACY_PROGRESS_KEY);
    if (!legacy) return;
    const target = progressKey(profileId);
    if (!localStorage.getItem(target)) localStorage.setItem(target, legacy);
    localStorage.removeItem(LEGACY_PROGRESS_KEY);
  } catch {
    // No storage: nothing to migrate.
  }
}

/** Overall percent through the book, from chapter index plus scroll position within it. */
export function progressPercent(p: Progress | undefined, chapterCount: number): number {
  if (!p || chapterCount <= 0) return 0;
  const frac = (Math.min(Math.max(p.chapter, 0), chapterCount - 1) + Math.min(Math.max(p.ratio, 0), 1)) / chapterCount;
  return Math.round(Math.min(Math.max(frac, 0), 1) * 100);
}

// ---- Reader preferences (localStorage, shared by the device) ----

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

// ---- Jump handoff (Notes page -> reader) ----

const JUMP_KEY = 'echo-shelf:jump';

export interface QueuedJump {
  bookId: string;
  chapter: number;
  paragraph?: number;
  ratio?: number;
}

/** Remember where the reader should open next. Read once by the reader on load. */
export function queueJump(jump: QueuedJump): void {
  sessionStorage.setItem(JUMP_KEY, JSON.stringify(jump));
}

/** Returns the queued jump for this book, if any, and clears it. */
export function takeJump(bookId: string): QueuedJump | null {
  try {
    const raw = sessionStorage.getItem(JUMP_KEY);
    if (!raw) return null;
    const jump = JSON.parse(raw) as QueuedJump;
    if (jump.bookId !== bookId) return null;
    sessionStorage.removeItem(JUMP_KEY);
    return jump;
  } catch {
    return null;
  }
}
