export type BookFormat = 'txt' | 'md' | 'docx' | 'epub' | 'pdf';

export interface Chapter {
  title: string;
  paragraphs: string[];
  /**
   * PDFs only: the 1-based source page each paragraph came from, in the same
   * order as `paragraphs`. The reader uses it to draw the page separators.
   */
  pageNumbers?: number[];
}

/**
 * A book's cover image, stored with the book so the shelf never has to
 * regenerate it. `page` means it is the rendered first page of the PDF;
 * `custom` means the solid-colour title cover made when that page was blank.
 */
export interface BookCover {
  /** A small JPEG or PNG data URL. */
  dataUrl: string;
  kind: 'page' | 'custom';
}

/** Lightweight record used for the shelf. Stored in the `meta` IndexedDB store. */
export interface BookMeta {
  id: string;
  /** The profile that owns this book. Every read and write is scoped to it. */
  profileId: string;
  title: string;
  author: string;
  format: BookFormat;
  addedAt: number;
  wordCount: number;
  chapterCount: number;
  /**
   * The cover image. Optional in the type only because books imported before
   * covers existed are still on shelves; `lib/library.ts` fills those in on
   * first load and saves the result.
   */
  cover?: BookCover;
  /** Index into the solid cover palette, so a card can draw the colour without the image. */
  coverColor?: number;
}

/** Full parsed text. Stored separately so the shelf never loads whole books. */
export interface BookContent {
  id: string;
  chapters: Chapter[];
  /** Source pages, when the format has them (PDF). */
  pageCount?: number;
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

/** The user's voice profile. MVP keeps exactly one, with id `me`. */
export interface VoiceProfile {
  /** The id of the profile that owns this voice. One voice per profile. */
  id: string;
  name: string;
  consentAt: number;
  consentVersion: number;
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type VoiceSampleKind = 'script' | 'verify';

/** One recorded clip. The audio blob lives in IndexedDB, not in localStorage. */
export interface VoiceSample {
  id: string;
  /** The owning profile. Recordings are never shared between profiles. */
  profileId: string;
  kind: VoiceSampleKind;
  label: string;
  seconds: number;
  mimeType: string;
  blob: Blob;
  createdAt: number;
}

/** A generated summary. `scope` is 'doc' for the whole book, or 'ch:<index>' for one chapter. */
export interface Summary {
  id: string;
  bookId: string;
  scope: string;
  text: string;
  source: 'ai' | 'offline';
  createdAt: number;
}

/**
 * A local profile in the `profiles` IndexedDB store.
 *
 * There is no password and nothing is verified: this records who is using the app
 * on this device so their shelf and notes have a name against them. Anyone with the
 * browser can pick any profile, which is the point — see lib/profile/useProfile.tsx.
 */
export interface StoredProfile {
  id: string;
  name: string;
  /** A label, not a login. Optional, and never checked against anything. */
  email: string;
  createdAt: number;
  lastUsedAt: number;
}

/** App-wide settings in the `settings` store, under the key `app`. */
export interface AppSettings {
  id: 'app';
  theme: 'dark' | 'light';
}
