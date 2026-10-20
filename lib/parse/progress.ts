// What a long import is doing, for the shelf's progress line.
export type ImportPhase = 'reading' | 'text' | 'ocr' | 'cover';

export interface ImportProgress {
  phase: ImportPhase;
  /** 1-based page currently being read, when the format has pages. */
  page?: number;
  pageCount?: number;
  /** A sentence the shelf can show as-is. */
  message: string;
}
