// Turns a chapter into the three things narration and tap-to-read need:
//
//   words   every spoken word, with the paragraph and page it belongs to
//   chunks  the pieces actually handed to the speech synthesiser (a paragraph, or
//           part of a long one), with the character offsets the browser reports
//           word boundaries in
//   text    the chapter's full text, used only for reference
//
// Pure and DOM-free so the indexing can be tested without a browser.

import type { Chapter } from '../types';

export interface WordToken {
  /** Position in the chapter, from 0. This is the index the reader highlights. */
  index: number;
  text: string;
  paragraph: number;
  page?: number;
  chunk: number;
  /** Word start inside its chunk's text, in characters. */
  start: number;
  /** Word start inside its paragraph's text, in characters. */
  paragraphStart: number;
}

export interface AudioChunk {
  index: number;
  paragraph: number;
  page?: number;
  text: string;
  /** First and last word index in this chunk. */
  firstWord: number;
  lastWord: number;
  /** Words of this chunk, with their offset inside `text`. */
  words: { index: number; start: number; length: number }[];
}

export interface ChapterAudio {
  words: WordToken[];
  chunks: AudioChunk[];
  text: string;
}

/** Longer than this and a paragraph is split into several utterances. */
const MAX_CHUNK_CHARS = 480;

/** Roughly how many words a narration voice speaks per second at 1×. */
export const WORDS_PER_SECOND = 2.8;

const SENTENCE_BREAK = /[.!?…]+["'”’)\]]*\s+/g;

/** Character ranges of the sentences in `text`, covering it completely. */
export function sentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  SENTENCE_BREAK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_BREAK.exec(text)) !== null) {
    const end = match.index + match[0].length;
    ranges.push({ start, end });
    start = end;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges.filter((r) => text.slice(r.start, r.end).trim().length > 0);
}

/** Every non-space run, with its character offsets. */
export function tokenizeWords(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function countWordsIn(chapter: Chapter): number {
  return chapter.paragraphs.reduce((n, p) => n + tokenizeWords(p).length, 0);
}

/**
 * Builds the spoken model for one chapter.
 *
 * Chunks are grouped sentences: at least `MIN_CHUNK_WORDS` words where possible,
 * and never more than `MAX_CHUNK_CHARS` characters. A paragraph shorter than that
 * is one chunk, which keeps the number of `speak()` calls low — important on iOS,
 * where chained utterances are less reliable than one longer one.
 */
export function buildChapterAudio(chapter: Chapter): ChapterAudio {
  const words: WordToken[] = [];
  const chunks: AudioChunk[] = [];

  chapter.paragraphs.forEach((raw, paragraph) => {
    // Kept exactly as stored: the reader rebuilds the paragraph from these offsets
    // and the highlight tool measures selections against the same characters.
    const text = raw;
    if (!text.trim()) return;
    const page = chapter.pageNumbers?.[paragraph];
    const paragraphWords = tokenizeWords(text);
    if (paragraphWords.length === 0) return;

    // Sentences, split further if a single sentence is longer than one utterance.
    const pieces: { start: number; end: number; words: number }[] = [];
    for (const sentence of sentenceRanges(text)) {
      const sentenceText = text.slice(sentence.start, sentence.end);
      if (sentenceText.length <= MAX_CHUNK_CHARS) {
        pieces.push({ start: sentence.start, end: sentence.end, words: tokenizeWords(sentenceText).length });
        continue;
      }
      // A long run without full stops (a poem, a transcript) is cut at word breaks.
      let groupStart = -1;
      let groupWords = 0;
      let lastEnd = sentence.start;
      for (const word of paragraphWords) {
        if (word.start < sentence.start || word.start >= sentence.end) continue;
        if (groupWords > 0 && word.end - groupStart > MAX_CHUNK_CHARS) {
          pieces.push({ start: groupStart, end: lastEnd, words: groupWords });
          groupWords = 0;
        }
        if (groupWords === 0) groupStart = word.start;
        groupWords += 1;
        lastEnd = word.end;
      }
      if (groupWords > 0) pieces.push({ start: groupStart, end: lastEnd, words: groupWords });
    }

    // Pack sentences into utterances of up to MAX_CHUNK_CHARS.
    const groups: { start: number; end: number }[] = [];
    let group: { start: number; end: number } | null = null;
    for (const piece of pieces) {
      if (!group) {
        group = { start: piece.start, end: piece.end };
        continue;
      }
      if (piece.end - group.start <= MAX_CHUNK_CHARS) {
        group.end = piece.end;
      } else {
        groups.push(group);
        group = { start: piece.start, end: piece.end };
      }
    }
    if (group) groups.push(group);

    for (const g of groups) {
      const chunkText = text.slice(g.start, g.end);
      const chunkWords = paragraphWords.filter((w) => w.start >= g.start && w.start < g.end);
      if (chunkWords.length === 0) continue;

      const chunkIndex = chunks.length;
      const firstWord = words.length;
      const chunk: AudioChunk = {
        index: chunkIndex,
        paragraph,
        page,
        text: chunkText,
        firstWord,
        lastWord: firstWord + chunkWords.length - 1,
        words: [],
      };
      for (const w of chunkWords) {
        const index = words.length;
        const start = w.start - g.start;
        chunk.words.push({ index, start, length: w.text.length });
        words.push({
          index,
          text: w.text,
          paragraph,
          page,
          chunk: chunkIndex,
          start,
          paragraphStart: w.start,
        });
      }
      chunks.push(chunk);
    }
  });

  return { words, chunks, text: chapter.paragraphs.join('\n\n') };
}

/**
 * The word index a character boundary inside a chunk belongs to. Used to map the
 * browser's `onboundary` event (which reports a character index) to a word.
 *
 * Returns the last word that starts at or before `charIndex`, or `firstWord` when
 * the event arrives before the first word.
 */
export function wordAtCharIndex(chunk: AudioChunk, charIndex: number): number {
  if (chunk.words.length === 0) return chunk.firstWord;
  let found = chunk.words[0].index;
  for (const w of chunk.words) {
    if (w.start > charIndex) break;
    found = w.index;
  }
  return found;
}

/**
 * Words spoken in `seconds` at a given speed. Used by the 10-second skip buttons;
 * an approximation is right, because the exact timbre of a sentence varies.
 */
export function wordsForSeconds(seconds: number, speed: number): number {
  return Math.max(1, Math.round(seconds * WORDS_PER_SECOND * Math.max(0.5, speed)));
}

/** Estimated seconds for the remaining words, for the player's clock. */
export function estimateSeconds(wordCount: number, speed: number): number {
  return wordCount / (WORDS_PER_SECOND * Math.max(0.5, speed));
}
