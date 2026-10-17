'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, Bookmark as BookmarkIcon, BookmarkCheck, ChevronLeft, ChevronRight, List, NotebookPen, Type } from 'lucide-react';
import { HIGHLIGHT_COLORS, selectionInfo, splitByHighlights } from '@/lib/annotations';
import { deleteAnnotation, listAnnotations, putAnnotation } from '@/lib/db';
import type { Annotation, Book, Bookmark, Highlight, HighlightColor, Note, ReaderPrefs } from '@/lib/types';
import {
  DEFAULT_PREFS,
  getPrefs,
  getProgressMap,
  loadBook,
  readerColors,
  takeJump,
  savePrefs,
  saveProgress,
} from '@/lib/library';
import { ChapterDrawer, SettingsPanel } from './ReaderPanels';
import NotesPanel, { type NotesTab } from './NotesPanel';
import SelectionToolbar, { type ToolbarState } from './SelectionToolbar';
import Toast, { type ToastState } from './Toast';

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
const newId = () => crypto.randomUUID();

type Panel = null | 'chapters' | 'settings' | 'notes';
interface Jump {
  ratio?: number;
  paragraph?: number;
}

export default function Reader({ id }: { id: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [ratio, setRatio] = useState(0);
  const [navCount, setNavCount] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>('notes');
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Refs mirror state for event handlers and cleanup, so they never see stale values.
  const chapterRef = useRef(0);
  const ratioRef = useRef(0);
  const pendingScroll = useRef<Jump | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => {
    setToast({ id: Date.now(), text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Load the book, its saved position, and its annotations.
  useEffect(() => {
    setPrefs(getPrefs());
    let alive = true;
    loadBook(id)
      .then(async (b) => {
        if (!alive) return;
        setBook(b);
        if (!b) return;
        const queued = takeJump(id);
        const saved = getProgressMap()[id];
        const start = queued
          ? clamp(queued.chapter, 0, b.chapters.length - 1)
          : saved
            ? clamp(saved.chapter, 0, b.chapters.length - 1)
            : 0;
        const startRatio = queued ? queued.ratio ?? 0 : saved && saved.chapter === start ? saved.ratio : 0;
        chapterRef.current = start;
        ratioRef.current = startRatio;
        pendingScroll.current = queued ? { ratio: startRatio, paragraph: queued.paragraph } : { ratio: startRatio };
        setChapterIndex(start);
        setRatio(startRatio);
        const list = await listAnnotations(id);
        if (alive) setAnnotations(list);
      })
      .catch(() => alive && setBook(null));
    return () => {
      alive = false;
    };
  }, [id]);

  // Restore the scroll position (or jump to a paragraph) after a chapter is rendered.
  useLayoutEffect(() => {
    if (!book) return;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    if (target?.paragraph !== undefined) {
      const el = document.querySelector<HTMLElement>(`[data-p="${target.paragraph}"]`);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35;
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        return;
      }
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: target?.ratio ? target.ratio * Math.max(0, max) : 0, behavior: 'auto' });
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
        setToolbar((t) => (t?.mode === 'new' ? null : t));
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
    (n: number, jump: Jump = {}) => {
      if (!book) return;
      const next = clamp(n, 0, book.chapters.length - 1);
      const startRatio = jump.ratio ?? 0;
      chapterRef.current = next;
      ratioRef.current = startRatio;
      pendingScroll.current = jump;
      setChapterIndex(next);
      setRatio(startRatio);
      setNavCount((c) => c + 1);
      setPanel(null);
      setToolbar(null);
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

  // Clicking outside the floating toolbar dismisses it.
  useEffect(() => {
    if (!toolbar) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[role=toolbar]')) setToolbar(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [toolbar]);

  function updatePrefs(patch: Partial<ReaderPrefs>) {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }

  /* ---------- Annotations ---------- */

  const persist = useCallback(async (a: Annotation) => {
    await putAnnotation(a);
    setAnnotations((list) => {
      const i = list.findIndex((x) => x.id === a.id);
      if (i === -1) return [...list, a];
      const copy = [...list];
      copy[i] = a;
      return copy;
    });
  }, []);

  const removeAnnotation = useCallback(
    async (a: Annotation) => {
      try {
        await deleteAnnotation(a.id);
        setAnnotations((list) => list.filter((x) => x.id !== a.id));
        const label = a.kind === 'highlight' ? 'Highlight' : a.kind === 'bookmark' ? 'Bookmark' : 'Note';
        notify(`${label} removed`);
      } catch {
        notify('Could not remove that. Please try again.', 'error');
      }
    },
    [notify],
  );

  function handleSelectionEnd() {
    window.setTimeout(() => {
      const sel = window.getSelection();
      const root = articleRef.current;
      if (!sel || !root) return;
      if (sel.isCollapsed) {
        setToolbar((t) => (t?.mode === 'new' ? null : t));
        return;
      }
      const info = selectionInfo(sel, root);
      if (!info) {
        notify('Highlights work within one paragraph at a time.', 'error');
        setToolbar(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setToolbar({
        mode: 'new',
        x: rect.left + rect.width / 2,
        y: rect.top,
        chapter: chapterRef.current,
        ...info,
      });
    }, 0);
  }

  function handleArticleClick(e: ReactMouseEvent<HTMLElement>) {
    const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-h]');
    if (!mark || !book) return;
    const h = annotations.find((a): a is Highlight => a.kind === 'highlight' && a.id === mark.dataset.h);
    if (!h) return;
    const rect = mark.getBoundingClientRect();
    setToolbar({ mode: 'existing', x: rect.left + rect.width / 2, y: rect.top, highlightId: h.id, color: h.color });
  }

  async function createHighlight(t: Extract<ToolbarState, { mode: 'new' }>, color: HighlightColor): Promise<Highlight> {
    const h: Highlight = {
      id: newId(),
      kind: 'highlight',
      bookId: id,
      chapter: t.chapter,
      paragraph: t.paragraph,
      start: t.start,
      end: t.end,
      text: t.text,
      color,
      createdAt: Date.now(),
    };
    await persist(h);
    return h;
  }

  async function handleColorPick(color: HighlightColor) {
    if (!toolbar) return;
    try {
      if (toolbar.mode === 'new') {
        await createHighlight(toolbar, color);
        notify('Highlighted');
      } else {
        const h = annotations.find((a): a is Highlight => a.kind === 'highlight' && a.id === toolbar.highlightId);
        if (h) await persist({ ...h, color });
      }
    } catch {
      notify('Could not save that highlight.', 'error');
    }
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  }

  async function handleNoteFromToolbar() {
    if (!toolbar) return;
    try {
      const now = Date.now();
      const note: Note = { id: newId(), kind: 'note', bookId: id, chapter: chapterRef.current, body: '', createdAt: now, updatedAt: now };
      if (toolbar.mode === 'new') {
        const h = await createHighlight(toolbar, 'amber');
        note.chapter = h.chapter;
        note.quote = h.text;
        note.highlightId = h.id;
      } else {
        const h = annotations.find((a): a is Highlight => a.kind === 'highlight' && a.id === toolbar.highlightId);
        if (h) {
          note.chapter = h.chapter;
          note.quote = h.text;
          note.highlightId = h.id;
        }
      }
      await persist(note);
      setFocusNoteId(note.id);
      setNotesTab('notes');
      setPanel('notes');
    } catch {
      notify('Could not create that note.', 'error');
    }
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  }

  async function handleDeleteHighlight() {
    if (!toolbar || toolbar.mode !== 'existing') return;
    const h = annotations.find((a) => a.id === toolbar.highlightId);
    setToolbar(null);
    if (h) await removeAnnotation(h);
  }

  const bookmarks = useMemo(
    () => annotations.filter((a): a is Bookmark => a.kind === 'bookmark'),
    [annotations],
  );
  const currentBookmark = bookmarks.find(
    (b) => b.chapter === chapterIndex && Math.abs(b.ratio - ratio) < 0.03,
  );

  async function toggleBookmark() {
    if (!book) return;
    if (currentBookmark) {
      await removeAnnotation(currentBookmark);
      return;
    }
    const b: Bookmark = {
      id: newId(),
      kind: 'bookmark',
      bookId: id,
      chapter: chapterIndex,
      ratio: clamp(ratio, 0, 1),
      label: book.chapters[chapterIndex]?.title ?? `Chapter ${chapterIndex + 1}`,
      createdAt: Date.now(),
    };
    try {
      await persist(b);
      notify('Bookmarked this spot');
    } catch {
      notify('Could not save that bookmark.', 'error');
    }
  }

  const highlightsByChapter = useMemo(() => {
    const map = new Map<number, Map<number, Highlight[]>>();
    for (const a of annotations) {
      if (a.kind !== 'highlight') continue;
      const byPara = map.get(a.chapter) ?? new Map<number, Highlight[]>();
      byPara.set(a.paragraph, [...(byPara.get(a.paragraph) ?? []), a]);
      map.set(a.chapter, byPara);
    }
    return map;
  }, [annotations]);

  /* ---------- Render ---------- */

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
  const chapterHighlights = highlightsByChapter.get(ci);

  return (
    <div style={rootStyle} className="min-h-screen transition-colors duration-500 ease-soft">
      <header className="glass sticky top-0 z-30 flex items-center gap-2 bg-[rgb(20_20_28/0.92)] px-4 py-3 sm:gap-3 sm:px-6">
        <Link href="/" className="icon-btn shrink-0" aria-label="Back to shelf">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-fg">{book.title}</p>
          <p className="truncate text-xs text-fg-3">{chapter.title}</p>
        </div>
        <button
          type="button"
          className="icon-btn shrink-0"
          aria-label={currentBookmark ? 'Remove bookmark' : 'Bookmark this spot'}
          aria-pressed={!!currentBookmark}
          onClick={toggleBookmark}
        >
          {currentBookmark ? (
            <BookmarkCheck className="h-4 w-4 text-amber" strokeWidth={1.75} />
          ) : (
            <BookmarkIcon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
        <button type="button" className="icon-btn shrink-0" aria-label="Notes and highlights" onClick={() => setPanel('notes')}>
          <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
        </button>
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
          ref={articleRef}
          key={`${ci}-${navCount}`}
          className="animate-page-in"
          style={{ columnCount: double ? 2 : 1, columnGap: '4rem' }}
          onMouseUp={handleSelectionEnd}
          onTouchEnd={handleSelectionEnd}
          onClick={handleArticleClick}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
            Chapter {ci + 1} of {total}
          </p>
          <h1 className="mb-10 mt-3 font-display text-[32px] font-semibold leading-10" style={{ breakAfter: 'avoid' }}>
            {chapter.title}
          </h1>
          {chapter.paragraphs.map((p: string, i: number) => {
            const marks = chapterHighlights?.get(i) ?? [];
            return (
              <p
                key={i}
                data-p={i}
                style={{
                  fontFamily: FONT_FAMILY[prefs.font],
                  fontSize: `${prefs.size}px`,
                  lineHeight: prefs.lineHeight,
                  marginBottom: '1em',
                  hyphens: 'auto',
                }}
              >
                {marks.length === 0
                  ? p
                  : splitByHighlights(p, marks).map((seg, k) =>
                      seg.highlight ? (
                        <mark
                          key={k}
                          data-h={seg.highlight.id}
                          className="cursor-pointer rounded-[3px] text-inherit"
                          style={{
                            background: `${HIGHLIGHT_COLORS[seg.highlight.color].hex}59`,
                            color: 'inherit',
                          }}
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={k}>{seg.text}</span>
                      ),
                    )}
              </p>
            );
          })}
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

      {toolbar && (
        <SelectionToolbar
          state={toolbar}
          onColor={handleColorPick}
          onNote={handleNoteFromToolbar}
          onDelete={handleDeleteHighlight}
          onClose={() => setToolbar(null)}
        />
      )}

      {panel === 'chapters' && (
        <ChapterDrawer chapters={book.chapters} current={ci} onSelect={(i) => goTo(i)} onClose={() => setPanel(null)} />
      )}
      {panel === 'notes' && (
        <NotesPanel
          bookId={id}
          chapters={book.chapters}
          annotations={annotations}
          currentChapter={ci}
          initialTab={notesTab}
          focusNoteId={focusNoteId}
          onSave={(a) => void persist(a).catch(() => notify('Could not save that note.', 'error'))}
          onDelete={(a) => {
            if (a.kind === 'note' && a.body.trim() && !window.confirm('Delete this note? This cannot be undone.')) return;
            void removeAnnotation(a);
          }}
          onJump={(chapter, target) => goTo(chapter, target)}
          onClose={() => setPanel(null)}
        />
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

      <Toast toast={toast} onDone={dismissToast} />
    </div>
  );
}
