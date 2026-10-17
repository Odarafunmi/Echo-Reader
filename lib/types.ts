export type BookFormat = 'txt' | 'md' | 'docx' | 'epub' | 'pdf';

export interface Chapter {
  title: string;
  paragraphs: string[];
}

/** Lightweight record used for the shelf. Stored in the `meta` IndexedDB store. */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  addedAt: number;
  wordCount: number;
  chapterCount: number;
  /** Index into the cover gradient palette, chosen at import time. */
  tint: number;
}

/** Full parsed text. Stored separately so the shelf never loads whole books. */
export interface BookContent {
  id: string;
  chapters: Chapter[];
}

/** A book with its full text, used by the reader. */
export interface Book extends BookMeta {
  chapters: Chapter[];
}

export interface Progress {
  chapter: number;
  /** 0 to 1, how far down the current chapter the reader has scrolled. */
  ratio: number;
  updatedAt: number;
}

export type ReaderFont = 'literata' | 'inter' | 'georgia' | 'dyslexic';
export type ReaderTheme = 'midnight' | 'paper' | 'sepia' | 'violet' | 'custom';
export type ReaderMargin = 'narrow' | 'medium' | 'wide';
export type ReaderLayout = 'single' | 'double';

export interface ReaderPrefs {
  font: ReaderFont;
  size: number;
  lineHeight: number;
  margin: ReaderMargin;
  theme: ReaderTheme;
  customBg: string;
  customFg: string;
  layout: ReaderLayout;
}
