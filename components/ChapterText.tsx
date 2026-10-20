'use client';

// The chapter's text, with every word addressable.
//
// Each word is its own span carrying `data-w` (its index in the chapter's spoken
// word list), so tapping a word can start narration at exactly that word, and so
// narration can paint a highlight on the word it is speaking without re-rendering
// the whole chapter.
//
// The spans reproduce the paragraph character for character (the spaces between
// words are plain text), which keeps selection offsets, and therefore highlights,
// identical to the original text.
//
// This component is memoised: the reader's per-word state changes on every spoken
// word, and the chapter must not be reconciled each time.

import { memo, type ReactNode } from 'react';
import type { Chapter, Highlight, ReaderPrefs } from '@/lib/types';
import type { WordToken } from '@/lib/audio/text';
import { HIGHLIGHT_COLORS } from '@/lib/annotations';

const FONT_FAMILY: Record<ReaderPrefs['font'], string> = {
  literata: 'var(--font-reader-literata)',
  inter: 'var(--font-reader-inter)',
  georgia: 'var(--font-reader-georgia)',
  dyslexic: 'var(--font-reader-dyslexic)',
};

interface Props {
  chapter: Chapter;
  wordsByParagraph: Map<number, WordToken[]>;
  marksByParagraph: Map<number, Highlight[]>;
  font: ReaderPrefs['font'];
  fontSize: number;
  lineHeight: number;
}

function Paragraph({
  text,
  paragraph,
  words,
  marks,
  font,
  fontSize,
  lineHeight,
}: {
  text: string;
  paragraph: number;
  words: WordToken[];
  marks: Highlight[];
  font: ReaderPrefs['font'];
  fontSize: number;
  lineHeight: number;
}) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const sorted = [...marks].sort((a, b) => a.start - b.start);

  for (const word of words) {
    const start = word.paragraphStart;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    let end = start + word.text.length;
    const mark = sorted.find((m) => m.start < end && m.end > start);
    const color = mark ? HIGHLIGHT_COLORS[mark.color].hex : null;
    // A highlighted word also takes the space after it when that space is inside
    // the highlight. Otherwise the background would stop at every word and the
    // sentence would look striped rather than marked.
    const takesSpace = !!(mark && text[end] === ' ' && mark.end > end);
    const body = takesSpace ? `${word.text} ` : word.text;
    if (takesSpace) end += 1;
    nodes.push(
      <span
        key={word.index}
        data-w={word.index}
        data-h={mark?.id}
        className={'word' + (mark ? ' word-marked cursor-pointer' : '')}
        style={mark ? { backgroundColor: `${color}59` } : undefined}
      >
        {body}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <p
      data-p={paragraph}
      style={{
        fontFamily: FONT_FAMILY[font],
        fontSize: `${fontSize}px`,
        lineHeight,
        marginBottom: '1em',
        hyphens: 'auto',
        WebkitHyphens: 'auto',
      }}
    >
      {nodes}
    </p>
  );
}

function ChapterTextView({ chapter, wordsByParagraph, marksByParagraph, font, fontSize, lineHeight }: Props) {
  let previousPage: number | null = null;
  return (
    <>
      {chapter.paragraphs.map((text, i) => {
        const page = chapter.pageNumbers?.[i];
        const startsPage = page !== undefined && page !== previousPage;
        if (page !== undefined) previousPage = page;
        return (
          <div key={i} className="chapter-block">
            {/* A divider belongs between pages. Before the first paragraph it would
                read as a rule under the chapter title. */}
            {startsPage && i > 0 && (
              <div className="page-break" role="separator" aria-label={`Page ${page}`}>
                <span className="page-break-line" aria-hidden />
                <span className="page-break-label">Page {page}</span>
                <span className="page-break-line" aria-hidden />
              </div>
            )}
            <Paragraph
              text={text}
              paragraph={i}
              words={wordsByParagraph.get(i) ?? []}
              marks={marksByParagraph.get(i) ?? []}
              font={font}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          </div>
        );
      })}
    </>
  );
}

export default memo(ChapterTextView);
