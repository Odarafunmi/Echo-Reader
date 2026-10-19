'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookPlus, Loader2, UploadCloud } from 'lucide-react';
import type { BookMeta } from '@/lib/types';
import {
  clearProgress,
  deleteBook,
  getProgressMap,
  importFile,
  listBooks,
  progressPercent,
  type ProgressMap,
} from '@/lib/library';
import { ACCEPT_ATTR } from '@/lib/parse';
import { pauseScene, resumeScene } from '@/lib/scene/bus';
import BookCard from './BookCard';
import Toast, { type ToastState } from './Toast';
import ProgressBar from './ProgressBar';

export default function Shelf() {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [importing, setImporting] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks());
    } catch {
      setBooks([]);
      setToast({ id: Date.now(), tone: 'error', text: 'Could not open your library storage in this browser.' });
    }
    setProgress(getProgressMap());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = (text: string, tone: ToastState['tone']) => setToast({ id: Date.now(), text, tone });

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    let added = 0;
    // Parsing competes with the animating background for this tab's memory and CPU,
    // so the 3D scene holds its last frame until the work is done. On a phone that
    // is the difference between a working import and a memory error.
    pauseScene();
    try {
      for (const file of list) {
        setImporting(file.name);
        try {
          const meta = await importFile(file);
          added++;
          notify(`Added “${meta.title}” to your shelf`, 'ok');
        } catch (err) {
          notify(err instanceof Error ? err.message : `Could not import ${file.name}`, 'error');
        }
      }
    } finally {
      // A failed import must not leave the background frozen.
      resumeScene();
    }
    setImporting(null);
    if (added > 0) await refresh();
  }

  async function handleRemove(book: BookMeta) {
    if (!window.confirm(`Remove “${book.title}” from your shelf? This cannot be undone.`)) return;
    try {
      await deleteBook(book.id);
      clearProgress(book.id);
      notify(`Removed “${book.title}”`, 'ok');
      await refresh();
    } catch {
      notify('Could not remove that book. Please try again.', 'error');
    }
  }

  const continueReading = (books ?? [])
    .map((b) => ({ book: b, p: progress[b.id] }))
    .filter(({ book, p }) => p && progressPercent(p, book.chapterCount) > 0 && progressPercent(p, book.chapterCount) < 100)
    .sort((a, b) => (b.p?.updatedAt ?? 0) - (a.p?.updatedAt ?? 0))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-10">
      <section className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-mist">Your shelf</p>
        <h1 className="mt-3 font-display text-[40px] font-semibold leading-tight tracking-tight sm:text-[48px] sm:leading-[56px]">
          Your books. <em className="font-semibold italic text-violet-mist">Your way.</em>
        </h1>
        <p className="mt-3 max-w-xl text-base leading-[26px] text-fg-2">
          Upload PDF, EPUB, DOCX or TXT files. They stay private in this browser, and you can read them in a layout you control.
        </p>
      </section>

      <section
        className={
          'animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed px-6 py-10 text-center transition-colors duration-250 ease-soft ' +
          (dragOver ? 'border-violet bg-violet/10' : 'border-line bg-card/60 hover:border-violet/40')
        }
        style={{ animationDelay: '60ms' }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-violet/15 text-violet-mist shadow-glow">
          {importing ? (
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
          ) : (
            <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
          )}
        </span>
        <div>
          <p className="font-display text-xl font-semibold">
            {importing ? `Reading “${importing}”…` : 'Drop books here'}
          </p>
          <p className="mt-1 text-sm text-fg-3">PDF, EPUB, DOCX, TXT or MD. Files are processed on your device.</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!!importing}
          onClick={() => inputRef.current?.click()}
        >
          <BookPlus className="h-4 w-4" strokeWidth={1.75} />
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </section>

      {continueReading.length > 0 && (
        <section className="mt-14 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <h2 className="mb-4 font-display text-2xl font-semibold">Continue reading</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {continueReading.map(({ book, p }) => (
              <Link
                key={book.id}
                href={`/read/${book.id}`}
                className="card-sheen group flex items-center gap-4 p-4 transition-[border-color,box-shadow] duration-300 ease-soft hover:border-violet/40 hover:shadow-glow"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{book.title}</p>
                  <p className="truncate text-xs text-fg-3">
                    Chapter {(p?.chapter ?? 0) + 1} of {book.chapterCount}
                  </p>
                  <div className="mt-3">
                    <ProgressBar percent={progressPercent(p, book.chapterCount)} />
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-fg-3 transition-transform duration-250 ease-soft group-hover:translate-x-0.5 group-hover:text-violet-mist" strokeWidth={1.75} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold">My library</h2>
          {books && books.length > 0 && (
            <span className="text-sm text-fg-3">
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </span>
          )}
        </div>

        {books === null ? (
          <p className="text-sm text-fg-3">Loading your shelf…</p>
        ) : books.length === 0 ? (
          <div className="card-sheen flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="font-display text-xl">Your shelf is empty</p>
            <p className="max-w-sm text-sm text-fg-3">Upload your first book above. Chapters are detected automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book, i) => (
              <div key={book.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 60}ms` }}>
                <BookCard
                  book={book}
                  percent={progressPercent(progress[book.id], book.chapterCount)}
                  onRemove={handleRemove}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <Toast toast={toast} onDone={dismissToast} />
    </div>
  );
}
