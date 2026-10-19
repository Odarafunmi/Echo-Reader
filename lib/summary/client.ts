'use client';

// Builds summaries for a book. Calls the server when AI is configured and falls back to the
// offline summarizer when it is not. Results are cached per book in IndexedDB.
import { listSummaries, putSummary } from '@/lib/db';
import type { Book, Summary } from '@/lib/types';
import { offlineSummaryText } from './extractive';
import { sampleText } from './sample';

/** Per-chapter input budget, in characters. */
const CHAPTER_CHARS = 12_000;
/** Whole-book input budget: the chapter summaries combined. */
const DOCUMENT_CHARS = 40_000;
/** Most chapters summarised individually in one whole-book pass. Evenly spaced if the book is longer. */
const MAX_CHAPTERS = 40;

export class SummaryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummaryUnavailableError';
  }
}

class NotConfiguredError extends Error {}

export const chapterScope = (i: number) => `ch:${i}`;
export const DOC_SCOPE = 'doc';

type Payload = { title: string; text: string; scope: 'chapter' | 'document' };

async function callServer(payload: Payload): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new SummaryUnavailableError('Could not reach the summary service. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; message?: string };
  if (res.status === 503 && data.error === 'not_configured') throw new NotConfiguredError(data.message);
  if (!res.ok || !data.text) {
    throw new SummaryUnavailableError(data.message ?? 'The summary could not be created. Please try again.');
  }
  return data.text;
}

const chapterText = (book: Book, i: number) => book.chapters[i].paragraphs.join('\n\n');

function evenlySpaced(total: number, max: number): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: max }, (_, k) => Math.floor((k * (total - 1)) / (max - 1)));
}

async function summariseChapter(book: Book, i: number): Promise<string> {
  return callServer({
    title: `${book.title}: ${book.chapters[i].title}`,
    text: sampleText(chapterText(book, i), CHAPTER_CHARS),
    scope: 'chapter',
  });
}

async function buildAi(book: Book, scope: string, onStatus?: (s: string) => void): Promise<string> {
  if (scope !== DOC_SCOPE) {
    const i = Number(scope.slice(3));
    return summariseChapter(book, i);
  }

  if (book.chapters.length === 1) {
    return callServer({
      title: book.title,
      text: sampleText(chapterText(book, 0), DOCUMENT_CHARS),
      scope: 'document',
    });
  }

  // Chapter summaries first (cached where they exist), then one overall pass over them.
  const cached = new Map((await listSummaries(book.id)).map((s) => [s.scope, s]));
  const picks = evenlySpaced(book.chapters.length, MAX_CHAPTERS);
  const parts: string[] = [];
  for (let n = 0; n < picks.length; n++) {
    const i = picks[n];
    const hit = cached.get(chapterScope(i));
    let text = hit?.text;
    if (!text) {
      onStatus?.(`Summarising chapter ${n + 1} of ${picks.length}…`);
      text = await summariseChapter(book, i);
      await putSummary({
        id: `${book.id}:${chapterScope(i)}`,
        bookId: book.id,
        scope: chapterScope(i),
        text,
        source: 'ai',
        createdAt: Date.now(),
      });
    }
    parts.push(`## ${book.chapters[i].title}\n${text}`);
  }
  onStatus?.('Writing the whole-book summary…');
  return callServer({
    title: book.title,
    text: sampleText(parts.join('\n\n'), DOCUMENT_CHARS),
    scope: 'document',
  });
}

function buildOffline(book: Book, scope: string): string {
  if (scope !== DOC_SCOPE) {
    return offlineSummaryText(chapterText(book, Number(scope.slice(3))), 'chapter');
  }
  const all = book.chapters.map((c) => c.paragraphs.join(' ')).join(' ');
  return offlineSummaryText(all, 'document');
}

/**
 * Generates a summary for one scope ('doc' or 'ch:<n>'), stores it, and returns it.
 * Falls back to the offline summary when the server has no AI key.
 */
export async function generateSummary(
  book: Book,
  scope: string,
  onStatus?: (s: string) => void,
): Promise<Summary> {
  let text: string;
  let source: Summary['source'];
  try {
    text = await buildAi(book, scope, onStatus);
    source = 'ai';
  } catch (e) {
    if (!(e instanceof NotConfiguredError)) throw e;
    text = buildOffline(book, scope);
    source = 'offline';
  }

  const summary: Summary = {
    id: `${book.id}:${scope}`,
    bookId: book.id,
    scope,
    text,
    source,
    createdAt: Date.now(),
  };
  await putSummary(summary);
  return summary;
}
