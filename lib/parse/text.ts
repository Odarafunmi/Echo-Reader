// Shared text utilities: paragraph building, chapter-heading detection and fallback splitting.
import type { Chapter } from '../types';

const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty';

// "Chapter 1", "CHAPTER IV", "Part two", "Book 3 The Long Road", "Section 4 ..."
const NUMBERED_HEADING = new RegExp(
  `^(chapter|part|book|section)\\s+(\\d{1,3}|[ivxlcdm]{1,8}|${NUMBER_WORDS})(?![a-z])`,
  'i',
);
// Standalone front/back matter headings: "Prologue", "Epilogue", "Introduction" ...
const STANDALONE_HEADING =
  /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix|acknowledg(e)?ments|contents|table of contents)\s*[.:]?$/i;

export function isHeading(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 90) return false;
  return NUMBERED_HEADING.test(t) || STANDALONE_HEADING.test(t);
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function countWords(chapters: Chapter[]): number {
  return chapters.reduce((n, c) => n + c.paragraphs.reduce((k, p) => k + wordCount(p), 0), 0);
}

/**
 * Turns lines into paragraphs. A blank line ('') ends a paragraph, and so does a chapter
 * heading. Hard-wrapped lines are joined with a space, and a trailing hyphen is removed.
 * With `eachLineIsParagraph`, every non-empty line is its own paragraph (used for DOCX).
 */
export function paragraphsFromLines(lines: string[], eachLineIsParagraph = false): string[] {
  const out: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    let joined = buf[0];
    for (let i = 1; i < buf.length; i++) {
      const next = buf[i];
      if (joined.endsWith('-') && /^[a-z]/.test(next)) joined = joined.slice(0, -1) + next;
      else joined += ' ' + next;
    }
    out.push(joined.replace(/\s+/g, ' ').trim());
    buf = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') {
      flush();
      continue;
    }
    if (eachLineIsParagraph || isHeading(line)) {
      flush();
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.filter((p) => p.length > 0);
}

export function paragraphsFromPlain(text: string): string[] {
  return paragraphsFromLines(text.replace(/\r\n?/g, '\n').split('\n'));
}

const PART_WORDS = 4000;
const SINGLE_CHAPTER_WORDS = 6000;

/**
 * Splits a flat list of paragraphs into chapters.
 * 1. If there are at least two recognisable headings, each heading starts a chapter.
 * 2. Otherwise long text is cut into parts of about 4,000 words at paragraph breaks.
 * 3. Short text becomes a single chapter.
 */
export function chaptersFromParagraphs(paragraphs: string[], fallbackTitle: string): Chapter[] {
  const cleaned = paragraphs.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const headingIdx: number[] = [];
  cleaned.forEach((p, i) => {
    if (isHeading(p)) headingIdx.push(i);
  });

  if (headingIdx.length >= 2) {
    // "CHAPTER I" followed by a short subtitle line ("The Beginning") becomes one title.
    const titleOf = (i: number): { title: string; bodyStart: number } => {
      const head = cleaned[i];
      const next = cleaned[i + 1];
      const bare = /^(chapter|part|book|section)\s+\S+$/i.test(head);
      if (bare && next && next.length <= 60 && !isHeading(next) && !/[.!?:;"”’)]$/.test(next)) {
        return { title: `${head} · ${next}`, bodyStart: i + 2 };
      }
      return { title: head, bodyStart: i + 1 };
    };

    const chapters: Chapter[] = [];
    if (headingIdx[0] > 0) {
      chapters.push({ title: 'Opening', paragraphs: cleaned.slice(0, headingIdx[0]) });
    }
    headingIdx.forEach((start, k) => {
      const end = k + 1 < headingIdx.length ? headingIdx[k + 1] : cleaned.length;
      const { title, bodyStart } = titleOf(start);
      chapters.push({ title, paragraphs: cleaned.slice(Math.min(bodyStart, end), end) });
    });
    return chapters.filter((c) => c.paragraphs.length > 0);
  }

  const total = cleaned.reduce((n, p) => n + wordCount(p), 0);
  if (total <= SINGLE_CHAPTER_WORDS) {
    return cleaned.length ? [{ title: fallbackTitle, paragraphs: cleaned }] : [];
  }

  const parts: Chapter[] = [];
  let cur: string[] = [];
  let curWords = 0;
  for (const p of cleaned) {
    cur.push(p);
    curWords += wordCount(p);
    if (curWords >= PART_WORDS) {
      parts.push({ title: `Part ${parts.length + 1}`, paragraphs: cur });
      cur = [];
      curWords = 0;
    }
  }
  if (cur.length) parts.push({ title: `Part ${parts.length + 1}`, paragraphs: cur });
  return parts;
}
