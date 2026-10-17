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

export type HighlightColor = 'amber' | 'magenta' | 'cyan';

interface AnnotationBase {
  id: string;
  bookId: string;
  createdAt: number;
}

/** A coloured span inside one paragraph. Offsets are character indexes into the paragraph text. */
export interface Highlight extends AnnotationBase {
  kind: 'highlight';
  chapter: number;
  paragraph: number;
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
}

export interface Bookmark extends AnnotationBase {
  kind: 'bookmark';
  chapter: number;
  ratio: number;
  label: string;
}

/** A note, optionally pinned to a quote and to the highlight it came from. */
export interface Note extends AnnotationBase {
  kind: 'note';
  chapter: number;
  body: string;
  quote?: string;
  highlightId?: string;
  updatedAt: number;
}

export type Annotation = Highlight | Bookmark | Note;
