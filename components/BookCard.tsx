'use client';

import Link from 'next/link';
import { Sparkles, Trash2 } from 'lucide-react';
import type { BookMeta, BookFormat } from '@/lib/types';
import { coverGradient } from '@/lib/library';
import ProgressBar from './ProgressBar';

const FORMAT_LABEL: Record<BookFormat, string> = { txt: 'TXT', md: 'MD', docx: 'DOCX', epub: 'EPUB', pdf: 'PDF' };

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
  return (
    <article className="book-card group relative flex flex-col gap-3 rounded-card border border-line bg-card p-3 transition-[translate,scale,border-color,box-shadow] duration-300 ease-soft hover:-translate-y-1.5 hover:scale-[1.02] hover:border-violet/40 hover:shadow-glow">
      <Link href={`/read/${book.id}`} className="block focus:outline-none" aria-label={`Open ${book.title}`}>
        <div
          className="relative aspect-[2/3] overflow-hidden rounded-cover p-4 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
          style={{ background: coverGradient(book.tint) }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/60" />
          <span className="absolute left-3 top-3 rounded-full bg-ink/50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white/90 backdrop-blur">
            {FORMAT_LABEL[book.format]}
          </span>
          <div className="relative flex h-full flex-col justify-end">
            <p className="font-display text-xl leading-tight text-white drop-shadow line-clamp-4">{book.title}</p>
            {book.author && <p className="mt-2 text-xs text-white/80 line-clamp-1">{book.author}</p>}
          </div>
        </div>
      </Link>
      <div className="flex flex-col gap-1 px-1">
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
        className="absolute right-12 top-3 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-fg-2 opacity-0 backdrop-blur transition-opacity duration-300 hover:text-cyan focus:opacity-100 group-hover:opacity-100"
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
      </Link>
      <button
        type="button"
        onClick={() => onRemove(book)}
        aria-label={`Remove ${book.title}`}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-fg-2 opacity-0 backdrop-blur transition-opacity duration-300 hover:text-rose focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </article>
  );
}
