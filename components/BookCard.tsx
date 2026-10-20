'use client';

import Link from 'next/link';
import { Sparkles, Trash2 } from 'lucide-react';
import type { BookMeta, BookFormat } from '@/lib/types';
import { paletteHex } from '@/lib/covers';
import ProgressBar from './ProgressBar';

const FORMAT_LABEL: Record<BookFormat, string> = { txt: 'TXT', md: 'MD', docx: 'DOCX', epub: 'EPUB', pdf: 'PDF' };

/**
 * A shelf tile. The cover is always an image: the book's first page when it had
 * one, otherwise the solid-colour title cover drawn at import. If a browser could
 * not draw or load the image, the tile falls back to the same solid colour with the
 * title in white — never a gradient.
 */
export default function BookCard({
  book,
  percent,
  onRemove,
}: {
  book: BookMeta;
  percent: number;
  onRemove: (book: BookMeta) => void;
}) {
  const minutes = Math.max(1, Math.round(book.wordCount / 230));
  const background = paletteHex(book.coverColor);
  return (
    <article className="book-card group relative flex flex-col gap-3 rounded-card border border-line bg-card p-2.5 transition-[translate,scale,border-color,box-shadow] duration-300 ease-soft hover:-translate-y-1.5 hover:scale-[1.02] hover:border-violet/40 hover:shadow-glow sm:p-3">
      <Link href={`/read/${book.id}`} className="block focus:outline-none" aria-label={`Open ${book.title}`}>
        <div
          className="relative aspect-[2/3] overflow-hidden rounded-cover shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
          style={{ backgroundColor: background }}
        >
          {book.cover ? (
            // Covers are stored as data URLs, so this never touches the network.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.cover.dataUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center p-4">
              <p className="text-center font-display text-lg font-bold leading-snug text-white line-clamp-5">
                {book.title}
              </p>
              {book.author && <p className="mt-2 text-center text-xs text-white/75 line-clamp-1">{book.author}</p>}
            </div>
          )}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white/90 backdrop-blur">
            {FORMAT_LABEL[book.format]}
          </span>
        </div>
      </Link>
      <div className="flex flex-col gap-1 px-0.5">
        <Link href={`/read/${book.id}`} className="truncate text-sm font-semibold text-fg hover:text-violet-mist">
          {book.title}
        </Link>
        <p className="text-xs text-fg-3">
          {book.chapterCount} {book.chapterCount === 1 ? 'chapter' : 'chapters'} · {minutes} min read
        </p>
        <div className="mt-2">
          <ProgressBar percent={percent} />
        </div>
      </div>
      <Link
        href={`/read/${book.id}?panel=summary`}
        aria-label={`Summarise ${book.title}`}
        title="Smart summary"
        className="absolute right-10 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-fg-2 opacity-100 backdrop-blur transition-opacity duration-300 hover:text-cyan focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
      </Link>
      <button
        type="button"
        onClick={() => onRemove(book)}
        aria-label={`Remove ${book.title}`}
        className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-fg-2 opacity-100 backdrop-blur transition-opacity duration-300 hover:text-rose focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </article>
  );
}
