'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, List, Type } from 'lucide-react';
import type { Book, ReaderPrefs } from '@/lib/types';
import {
  DEFAULT_PREFS,
  getPrefs,
  getProgressMap,
  loadBook,
  readerColors,
  savePrefs,
  saveProgress,
} from '@/lib/library';
import { ChapterDrawer, SettingsPanel } from './ReaderPanels';

const FONT_FAMILY: Record<ReaderPrefs['font'], string> = {
  literata: 'var(--font-reader-literata)',
  inter: 'var(--font-reader-inter)',
  georgia: 'var(--font-reader-georgia)',
  dyslexic: 'var(--font-reader-dyslexic)',
};

// "Margins" control the measure: wider margins mean a narrower text column.
const COLUMN_WIDTH: Record<ReaderPrefs['margin'], { single: number; double: number }> = {
  narrow: { single: 760, double: 1200 },
  medium: { single: 640, double: 1040 },
  wide: { single: 540, double: 900 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function Reader({ id }: { id: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [ratio, setRatio] = useState(0);
  const [navCount, setNavCount] = useState(0);
  const [panel, setPanel] = useState<null | 'chapters' | 'settings'>(null);

  // Refs mirror state for event handlers and cleanup, so they never see stale values.
  const chapterRef = useRef(0);
  const ratioRef = useRef(0);
  const pendingScroll = useRef<number | null>(null);

  // Load the book and the saved position.
  useEffect(() => {
    setPrefs(getPrefs());
    let alive = true;
    loadBook(id)
      .then((b) => {
        if (!alive) return;
        setBook(b);
        if (!b) return;
        const saved = getProgressMap()[id];
        const start = saved ? clamp(saved.chapter, 0, b.chapters.length - 1) : 0;
        const startRatio = saved && saved.chapter === start ? saved.ratio : 0;
        chapterRef.current = start;
        ratioRef.current = startRatio;
        pendingScroll.current = startRatio;
        setChapterIndex(start);
        setRatio(startRatio);
      })
      .catch(() => alive && setBook(null));
    return () => {
      alive = false;
    };
  }, [id]);

  // Restore the scroll position after a chapter is rendered.
  useLayoutEffect(() => {
    if (!book) return;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: target ? target * Math.max(0, max) : 0, behavior: 'auto' });
  }, [book, chapterIndex, navCount]);

  // Track scroll position and save progress.
  useEffect(() => {
    if (!book) return;
    let frame = 0;
    let timer: number | undefined;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const r = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
        ratioRef.current = r;
        setRatio(r);
        window.clearTimeout(timer);
        timer = window.setTimeout(
          () => saveProgress(id, { chapter: chapterRef.current, ratio: r, updatedAt: Date.now() }),
          400,
        );
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      saveProgress(id, { chapter: chapterRef.current, ratio: ratioRef.current, updatedAt: Date.now() });
    };
  }, [book, id]);

  const goTo = useCallback(
    (n: number, startRatio = 0) => {
      if (!book) return;
      const next = clamp(n, 0, book.chapters.length - 1);
      chapterRef.current = next;
      ratioRef.current = startRatio;
      pendingScroll.current = startRatio;
      setChapterIndex(next);
      setRatio(startRatio);
      setNavCount((c) => c + 1);
      setPanel(null);
      saveProgress(id, { chapter: next, ratio: startRatio, updatedAt: Date.now() });
    },
    [book, id],
  );

  // Left and right arrows change chapter when no field has focus.
  useEffect(() => {
    if (!book) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === 'ArrowRight') goTo(chapterRef.current + 1);
      else if (e.key === 'ArrowLeft') goTo(chapterRef.current - 1);
      else if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book, goTo]);

  function updatePrefs(patch: Partial<ReaderPrefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }

  if (book === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="animate-breathe rounded-full px-4 py-2 text-sm text-fg-3">Opening your book…</p>
      </div>
    );
  }

  if (book === null) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl font-semibold">We couldn’t find that book</h1>
        <p className="text-fg-2">It may have been removed from this browser, or the link is out of date.</p>
        <Link href="/" className="btn-primary">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back to shelf
        </Link>
      </div>
    );
  }

  const total = book.chapters.length;
  const ci = clamp(chapterIndex, 0, total - 1);
  const chapter = book.chapters[ci];
  const percent = clamp(Math.round(((ci + ratio) / total) * 100), 0, 100);
  const colors = readerColors(prefs);
  const double = prefs.layout === 'double';
  const width = COLUMN_WIDTH[prefs.margin][double ? 'double' : 'single'];
  const rootStyle = {
    backgroundColor: colors.bg,
    color: colors.fg,
    '--reader-fg': colors.fg,
  } as CSSProperties;
  const ruleColor = { borderColor: `color-mix(in srgb, ${colors.fg} 15%, transparent)` };

  return (
    <div style={rootStyle} className="min-h-screen transition-colors duration-500 ease-soft">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 bg-[rgb(20_20_28/0.92)] px-4 py-3 sm:px-6">
        <Link href="/" className="icon-btn shrink-0" aria-label="Back to shelf">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-fg">{book.title}</p>
          <p className="truncate text-xs text-fg-3">{chapter.title}</p>
        </div>
        <button type="button" className="icon-btn shrink-0" aria-label="Chapters" onClick={() => setPanel('chapters')}>
          <List className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button type="button" className="icon-btn shrink-0" aria-label="Reading settings" onClick={() => setPanel('settings')}>
          <Type className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-px w-full origin-left bg-gradient-to-r from-violet to-magenta transition-transform duration-500 ease-soft"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </header>

      <main className="mx-auto px-6 pb-32 pt-14" style={{ maxWidth: width }}>
        <article
          key={`${ci}-${navCount}`}
          className="animate-page-in"
          style={{ columnCount: double ? 2 : 1, columnGap: '4rem' }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
            Chapter {ci + 1} of {total}
          </p>
          <h1 className="mb-10 mt-3 font-display text-[32px] font-semibold leading-10" style={{ breakAfter: 'avoid' }}>
            {chapter.title}
          </h1>
          {chapter.paragraphs.map((p: string, i: number) => (
            <p
              key={i}
              style={{
                fontFamily: FONT_FAMILY[prefs.font],
                fontSize: `${prefs.size}px`,
                lineHeight: prefs.lineHeight,
                marginBottom: '1em',
                hyphens: 'auto',
              }}
            >
              {p}
            </p>
          ))}
        </article>

        <nav className="mt-16 flex items-center justify-between gap-4 border-t pt-6" style={ruleColor}>
          <button
            type="button"
            className="btn-ghost"
            style={{ color: colors.fg }}
            disabled={ci === 0}
            onClick={() => goTo(ci - 1)}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} /> Previous
          </button>
          <span className="text-xs tabular-nums opacity-60">{percent}% read</span>
          <button
            type="button"
            className="btn-primary"
            disabled={ci >= total - 1}
            onClick={() => goTo(ci + 1)}
          >
            Next <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </nav>
      </main>

      {panel === 'chapters' && (
        <ChapterDrawer chapters={book.chapters} current={ci} onSelect={(i) => goTo(i)} onClose={() => setPanel(null)} />
      )}
      {panel === 'settings' && (
        <SettingsPanel
          prefs={prefs}
          onChange={updatePrefs}
          onReset={() => {
            savePrefs(DEFAULT_PREFS);
            setPrefs(DEFAULT_PREFS);
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
