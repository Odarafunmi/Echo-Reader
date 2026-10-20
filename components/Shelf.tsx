'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookPlus, Loader2, UploadCloud, X } from 'lucide-react';
import type { BookMeta } from '@/lib/types';
import type { ImportProgress } from '@/lib/parse';
import {
  clearProgress,
  deleteBook,
  ensureCovers,
  getProgressMap,
  importFile,
  listBooks,
  progressPercent,
  type ProgressMap,
} from '@/lib/library';
import { ACCEPT_ATTR } from '@/lib/parse';
import { useProfile } from '@/lib/profile/useProfile';
import { pauseScene, resumeScene } from '@/lib/scene/bus';
import BookCard from './BookCard';
import Toast, { type ToastState } from './Toast';
import ProgressBar from './ProgressBar';

interface Importing {
  name: string;
  progress: ImportProgress;
}

export default function Shelf() {
  const { profile } = useProfile();
  const profileId = profile?.id ?? null;

  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [importing, setImporting] = useState<Importing | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    try {
      // Only this profile's books, then make sure every one of them has a cover.
      const mine = await listBooks(profileId);
      setBooks(await ensureCovers(mine, profileId));
    } catch {
      setBooks([]);
      setToast({ id: Date.now(), tone: 'error', text: 'Could not open your library storage in this browser.' });
    }
    setProgress(getProgressMap(profileId));
  }, [profileId]);

  useEffect(() => {
    setBooks(null);
    void refresh();
  }, [refresh]);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = (text: string, tone: ToastState['tone']) => setToast({ id: Date.now(), text, tone });

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || !profileId) return;
    let added = 0;
    // Parsing competes with the animating background for this tab's memory and CPU,
    // so the 3D scene holds its last frame until the work is done. On a phone that
    // is the difference between a working import and a memory error.
    pauseScene();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for (const file of list) {
        if (controller.signal.aborted) break;
        setImporting({
          name: file.name,
          progress: { phase: 'reading', message: `Opening “${file.name}”…` },
        });
        try {
          const meta = await importFile(file, profileId, {
            signal: controller.signal,
            onProgress: (progress) => setImporting((current) => (current ? { ...current, progress } : current)),
          });
          added++;
          notify(`Added “${meta.title}” to your shelf`, 'ok');
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            notify('Import cancelled.', 'error');
            break;
          }
          notify(err instanceof Error ? err.message : `Could not import ${file.name}`, 'error');
        }
      }
    } finally {
      // A failed import must not leave the background frozen.
      resumeScene();
      abortRef.current = null;
    }
    setImporting(null);
    if (added > 0) await refresh();
  }

  async function handleRemove(book: BookMeta) {
    if (!profileId) return;
    if (!window.confirm(`Remove “${book.title}” from your shelf? This cannot be undone.`)) return;
    try {
      await deleteBook(book.id);
      clearProgress(profileId, book.id);
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

  const importPage =
    importing?.progress.pageCount && importing.progress.page
      ? Math.round((importing.progress.page / importing.progress.pageCount) * 100)
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <section className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-mist">Your shelf</p>
        <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight tracking-tight sm:mt-3 sm:text-[40px] md:text-[48px] md:leading-[56px]">
          Your books. <em className="font-semibold italic text-violet-mist">Your way.</em>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-fg-2 sm:text-base">
          Upload PDF, EPUB, DOCX or TXT files. They stay private in this browser, under your profile.
        </p>
      </section>

      <section
        className={
          'animate-fade-up mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed px-4 py-8 text-center transition-colors duration-250 ease-soft sm:mt-10 sm:px-6 sm:py-10 ' +
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
        <span className="grid h-12 w-12 place-items-center rounded-full bg-violet/15 text-violet-mist shadow-glow sm:h-14 sm:w-14">
          {importing ? (
            <Loader2 className="h-5 w-5 animate-spin sm:h-6 sm:w-6" strokeWidth={1.75} />
          ) : (
            <UploadCloud className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 max-w-full">
          <p className="font-display text-lg font-semibold sm:text-xl">
            {importing ? `Reading “${importing.name}”…` : 'Drop books here'}
          </p>
          <p className="mt-1 break-words text-sm text-fg-3">
            {importing
              ? importing.progress.message
              : 'PDF, EPUB, DOCX, TXT or MD. Files are processed on your device.'}
          </p>
          {importPage !== null && (
            <div className="mx-auto mt-3 w-full max-w-xs">
              <ProgressBar percent={importPage} />
            </div>
          )}
        </div>
        {importing ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => abortRef.current?.abort()}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
            Cancel
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
            <BookPlus className="h-4 w-4" strokeWidth={1.75} />
            Choose files
          </button>
        )}
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
        <section className="mt-12 animate-fade-up sm:mt-14" style={{ animationDelay: '120ms' }}>
          <h2 className="mb-4 font-display text-xl font-semibold sm:text-2xl">Continue reading</h2>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
            {continueReading.map(({ book, p }) => (
              <Link
                key={book.id}
                href={`/read/${book.id}`}
                className="card-sheen group flex items-center gap-3 p-3.5 transition-[border-color,box-shadow] duration-300 ease-soft hover:border-violet/40 hover:shadow-glow sm:gap-4 sm:p-4"
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
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-fg-3 transition-transform duration-250 ease-soft group-hover:translate-x-0.5 group-hover:text-violet-mist"
                  strokeWidth={1.75}
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12 sm:mt-14">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">My library</h2>
          {books && books.length > 0 && (
            <span className="shrink-0 text-sm text-fg-3">
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </span>
          )}
        </div>

        {books === null ? (
          <p className="text-sm text-fg-3">Loading your shelf…</p>
        ) : books.length === 0 ? (
          <div className="card-sheen flex flex-col items-center gap-2 px-4 py-12 text-center sm:px-6 sm:py-14">
            <p className="font-display text-lg sm:text-xl">Your shelf is empty</p>
            <p className="max-w-sm text-sm text-fg-3">
              {profile ? `${profile.name.split(' ')[0]}, upload` : 'Upload'} your first book above. Chapters are detected
              automatically, and scanned pages are read with OCR.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book, i) => (
              <div key={book.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 60}ms` }}>
                <BookCard book={book} percent={progressPercent(progress[book.id], book.chapterCount)} onRemove={handleRemove} />
              </div>
            ))}
          </div>
        )}
      </section>

      <Toast toast={toast} onDone={dismissToast} />
    </div>
  );
}
