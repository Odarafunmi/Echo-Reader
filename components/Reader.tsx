'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  List,
  NotebookPen,
  Pause,
  Sparkles,
  Type,
  Volume2,
} from 'lucide-react';
import { selectionInfo } from '@/lib/annotations';
import { deleteAnnotation, listAnnotations, putAnnotation } from '@/lib/db';
import type { Annotation, Book, Bookmark, Chapter, Highlight, HighlightColor, Note, ReaderPrefs } from '@/lib/types';
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
import { buildChapterAudio, type ChapterAudio, type WordToken } from '@/lib/audio/text';
import { NarrationEngine, SPEEDS, type Speed } from '@/lib/audio/engine';
import { reacquireWakeLock } from '@/lib/audio/background';
import { useNarration, type ResolvedVoice } from '@/lib/voice/generic';
import { useProfile } from '@/lib/profile/useProfile';
import { ChapterDrawer, SettingsPanel } from './ReaderPanels';
import NotesPanel, { type NotesTab } from './NotesPanel';
import SummaryPanel from './SummaryPanel';
import ChapterText from './ChapterText';
import AudioPlayer from './AudioPlayer';
import SelectionToolbar, { type ToolbarState } from './SelectionToolbar';
import Toast, { type ToastState } from './Toast';

// "Margins" control the measure: wider margins mean a narrower text column.
const COLUMN_WIDTH: Record<ReaderPrefs['margin'], { single: number; double: number }> = {
  narrow: { single: 760, double: 1200 },
  medium: { single: 640, double: 1040 },
  wide: { single: 540, double: 900 },
};

const SPEED_KEY = 'echo-shelf:narration-speed';

/** Used until the device reports its voices, so the first tap still speaks. */
const DEVICE_VOICE: ResolvedVoice = {
  gender: 'feminine',
  label: 'Device voice',
  voice: null,
  pitch: 1,
  rate: 1,
  matched: false,
};

function savedSpeed(): Speed {
  try {
    const raw = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as number[]).includes(raw) ? (raw as Speed) : 1;
  } catch {
    return 1;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const newId = () => crypto.randomUUID();

type Panel = null | 'chapters' | 'settings' | 'notes' | 'summary';
interface Jump {
  ratio?: number;
  paragraph?: number;
}

export default function Reader({ id }: { id: string }) {
  const { profile } = useProfile();
  const profileId = profile?.id ?? null;

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

  // Narration.
  const { chosen: narrator, supported: ttsSupported } = useNarration();
  const [reading, setReading] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [follow, setFollow] = useState(true);
  const [audioStarted, setAudioStarted] = useState(false);
  const engineRef = useRef<NarrationEngine | null>(null);
  const wordIndexRef = useRef(0);
  const followRef = useRef(true);
  const activeWordEl = useRef<HTMLElement | null>(null);
  const lastUserScroll = useRef(0);
  const suppressClick = useRef(false);
  /** A single click on a highlighted word, held back in case a double-click follows. */
  const pendingWordClick = useRef<number | undefined>(undefined);

  // Refs mirror state for event handlers and cleanup, so they never see stale values.
  const chapterRef = useRef(0);
  const ratioRef = useRef(0);
  const pendingScroll = useRef<Jump | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => {
    setToast({ id: Date.now(), text, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  // Load the book, its saved position, and its annotations. Scoped to this profile:
  // a book owned by someone else reads as not found.
  useEffect(() => {
    setPrefs(getPrefs());
    setSpeed(savedSpeed());
    if (!profileId) return;
    let alive = true;
    loadBook(id, profileId)
      .then(async (b) => {
        if (!alive) return;
        setBook(b);
        if (!b) return;
        if (new URLSearchParams(window.location.search).get('panel') === 'summary') setPanel('summary');
        const queued = takeJump(id);
        const saved = getProgressMap(profileId)[id];
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
  }, [id, profileId]);

  const chapter: Chapter | undefined = book?.chapters[clamp(chapterIndex, 0, Math.max(0, (book?.chapters.length ?? 1) - 1))];
  const ci = book ? clamp(chapterIndex, 0, book.chapters.length - 1) : 0;

  // The chapter's spoken model. Rebuilt only when the chapter itself changes.
  const audio = useMemo<ChapterAudio | null>(() => (chapter ? buildChapterAudio(chapter) : null), [chapter]);

  const wordsByParagraph = useMemo(() => {
    const map = new Map<number, WordToken[]>();
    if (!audio) return map;
    for (const word of audio.words) {
      const list = map.get(word.paragraph);
      if (list) list.push(word);
      else map.set(word.paragraph, [word]);
    }
    return map;
  }, [audio]);

  const marksByParagraph = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const a of annotations) {
      if (a.kind !== 'highlight' || a.chapter !== ci) continue;
      map.set(a.paragraph, [...(map.get(a.paragraph) ?? []), a]);
    }
    return map;
  }, [annotations, ci]);

  /* ---------- Narration plumbing ---------- */

  /** Paints the highlight on one word, moving it off the previous one. */
  const paintWord = useCallback((index: number, forceScroll = false) => {
    const root = articleRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-w="${index}"]`);
    if (!el) return;
    if (activeWordEl.current !== el) {
      activeWordEl.current?.classList.remove('word-active');
      el.classList.add('word-active');
      activeWordEl.current = el;
    }
    if (!followRef.current && !forceScroll) return;
    if (!forceScroll && performance.now() - lastUserScroll.current < 4000) return;
    const rect = el.getBoundingClientRect();
    const topLimit = 96;
    const bottomLimit = window.innerHeight - (window.innerWidth < 640 ? 220 : 180);
    if (rect.top < topLimit || rect.bottom > bottomLimit) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  const disposeEngine = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    activeWordEl.current?.classList.remove('word-active');
    activeWordEl.current = null;
    setReading(false);
    setAudioStarted(false);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(pendingWordClick.current);
    disposeEngine();
  }, [disposeEngine]);

  /** The first word of the first paragraph in view, for the header's play button. */
  const firstVisibleWord = useCallback((): number => {
    const root = articleRef.current;
    if (!root) return 0;
    const paragraphs = root.querySelectorAll<HTMLElement>('[data-p]');
    for (const paragraph of paragraphs) {
      const rect = paragraph.getBoundingClientRect();
      if (rect.bottom > 120) {
        const word = paragraph.querySelector<HTMLElement>('[data-w]');
        if (word) return Number(word.dataset.w);
      }
    }
    return 0;
  }, []);

  const ensureEngine = useCallback(
    (startWord: number): NarrationEngine | null => {
      if (!audio || !chapter || !book) return null;
      if (engineRef.current) return engineRef.current;
      const engine = new NarrationEngine({
        audio,
        voice: narrator ?? DEVICE_VOICE,
        speed,
        startWord,
        bookTitle: book.title,
        chapterTitle: chapter.title,
        artwork: book.cover?.dataUrl,
        onWord: (index) => {
          wordIndexRef.current = index;
          setWordIndex(index);
          paintWord(index);
        },
        onState: (state) => {
          setReading(state.playing);
          setSpeed(state.speed);
        },
        onFinish: () => notify('Finished this chapter. Tap a word to keep going.'),
        onError: (message) => notify(message, 'error'),
      });
      engineRef.current = engine;
      setAudioStarted(true);
      setWordIndex(startWord);
      wordIndexRef.current = startWord;
      return engine;
    },
    [audio, chapter, narrator, book, speed, paintWord, notify],
  );

  const startFromWord = useCallback(
    (index: number) => {
      if (!ttsSupported) {
        notify('This browser cannot read text aloud. Try Chrome, Edge or Safari.', 'error');
        return;
      }
      const engine = ensureEngine(index);
      engine?.play(index);
    },
    [ttsSupported, narrator, ensureEngine, notify],
  );

  function toggleRead() {
    if (!ttsSupported) {
      notify('This browser cannot read text aloud. Try Chrome, Edge or Safari.', 'error');
      return;
    }
    if (engineRef.current) {
      engineRef.current.toggle();
      return;
    }
    startFromWord(firstVisibleWord());
  }

  const seekWord = useCallback((index: number) => {
    engineRef.current?.seekToWord(index);
    wordIndexRef.current = index;
    setWordIndex(index);
    paintWord(index, true);
  }, [paintWord]);

  const changeSpeed = useCallback((next: Speed) => {
    setSpeed(next);
    engineRef.current?.setSpeed(next);
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {
      // Storage blocked; the speed lasts for this visit.
    }
  }, []);

  // Re-paint the active word after the text re-renders (a settings change, say).
  useLayoutEffect(() => {
    if (audioStarted) paintWord(wordIndexRef.current, true);
  }, [audioStarted, prefs, marksByParagraph, paintWord]);

  // Following the voice stops for a moment when the reader scrolls by hand.
  useEffect(() => {
    const mark = () => {
      lastUserScroll.current = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) mark();
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Coming back from a locked screen: sync the highlight, take the wake lock again,
  // and restart the voice if the browser suspended it while the screen was off.
  useEffect(() => {
    let timer: number | undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const engine = engineRef.current;
      if (!engine?.isPlaying) return;
      void reacquireWakeLock();
      paintWord(wordIndexRef.current, true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => engine.resync(), 500);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      paintWord(wordIndexRef.current, true);
      engineRef.current?.resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [paintWord]);

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

  // Track scroll position and save progress, per profile.
  useEffect(() => {
    if (!book || !profileId) return;
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
          () => saveProgress(profileId, id, { chapter: chapterRef.current, ratio: r, updatedAt: Date.now() }),
          400,
        );
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      saveProgress(profileId, id, { chapter: chapterRef.current, ratio: ratioRef.current, updatedAt: Date.now() });
    };
  }, [book, id, profileId]);

  const goTo = useCallback(
    (n: number, jump: Jump = {}) => {
      if (!book) return;
      const next = clamp(n, 0, book.chapters.length - 1);
      if (next === chapterRef.current && Object.keys(jump).length === 0) return;
      const startRatio = jump.ratio ?? 0;
      engineRef.current?.dispose();
      engineRef.current = null;
      setReading(false);
      setAudioStarted(false);
      chapterRef.current = next;
      ratioRef.current = startRatio;
      pendingScroll.current = jump;
      setChapterIndex(next);
      setRatio(startRatio);
      setNavCount((c) => c + 1);
      setPanel(null);
      setToolbar(null);
      if (profileId) saveProgress(profileId, id, { chapter: next, ratio: startRatio, updatedAt: Date.now() });
    },
    [book, id, profileId],
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
    if (suppressClick.current) return;
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

  /** Opens the colour/note editor for a highlight that was double-clicked or held. */
  function openHighlightToolbar(highlightId: string, rect: DOMRect) {
    const h = annotations.find((a): a is Highlight => a.kind === 'highlight' && a.id === highlightId);
    if (!h) return;
    setToolbar({ mode: 'existing', x: rect.left + rect.width / 2, y: rect.top, highlightId: h.id, color: h.color });
  }

  function handleDoubleClick(e: ReactMouseEvent<HTMLElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-h]');
    if (!el?.dataset.h) return;
    e.preventDefault();
    // Cancel the delayed single-click, so editing a highlight does not begin
    // reading the chapter as a side effect.
    window.clearTimeout(pendingWordClick.current);
    pendingWordClick.current = undefined;
    openHighlightToolbar(el.dataset.h, el.getBoundingClientRect());
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.pointerType !== 'touch') return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-h]');
    if (!target?.dataset.h) return;
    const id = target.dataset.h;
    suppressClick.current = false;
    const timer = window.setTimeout(() => {
      suppressClick.current = true;
      openHighlightToolbar(id, target.getBoundingClientRect());
      if ('vibrate' in navigator) navigator.vibrate?.(10);
    }, 550);
    const cancel = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointermove', moved);
    };
    const moved = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - e.clientX) > 8 || Math.abs(ev.clientY - e.clientY) > 8) cancel();
    };
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('pointermove', moved);
  }

  function handleArticleClick(e: ReactMouseEvent<HTMLElement>) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
    if (!el?.dataset.w) return;
    setToolbar(null);
    const index = Number(el.dataset.w);
    // A highlighted word also answers a double-click (edit the highlight) or a
    // long-press (edit it on a phone), so its single click waits a moment to see
    // whether a second one is coming. Plain words start at once: no lag.
    if (el.dataset.h) {
      if (e.detail > 1) return;
      window.clearTimeout(pendingWordClick.current);
      pendingWordClick.current = window.setTimeout(() => {
        pendingWordClick.current = undefined;
        startFromWord(index);
      }, 240);
      return;
    }
    startFromWord(index);
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
  const currentBookmark = bookmarks.find((b) => b.chapter === chapterIndex && Math.abs(b.ratio - ratio) < 0.03);

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
        <p className="text-fg-2">
          It may belong to a different profile, have been removed from this browser, or the link is out of date.
        </p>
        <Link href="/" className="btn-primary">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back to shelf
        </Link>
      </div>
    );
  }

  const total = book.chapters.length;
  const visibleChapter = book.chapters[ci];
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
  const totalWords = audio?.words.length ?? 0;

  return (
    <div style={rootStyle} className="reader-root min-h-screen transition-colors duration-500 ease-soft">
      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b px-2 py-2 sm:flex-nowrap sm:gap-2 sm:px-6 sm:py-3"
        style={{
          backgroundColor: `color-mix(in srgb, ${colors.bg} 88%, transparent)`,
          borderColor: `color-mix(in srgb, ${colors.fg} 12%, transparent)`,
        }}
      >
        <Link href="/" className="reader-icon shrink-0" aria-label="Back to shelf">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1 px-1 text-center">
          <p className="truncate text-[13px] font-semibold sm:text-sm">{book.title}</p>
          <p className="truncate text-[11px] opacity-60 sm:text-xs">{visibleChapter.title}</p>
        </div>
        <button
          type="button"
          className="reader-icon shrink-0"
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
        {/* On a phone these get a row of their own: seven 40px buttons do not fit
            beside a title at 320px, and shrinking the title to nothing is worse
            than one extra 34px row. */}
        <div className="order-3 flex w-full items-center justify-between gap-0.5 sm:order-none sm:w-auto sm:justify-end sm:gap-2">
          <button type="button" className="reader-icon" aria-label="Notes and highlights" onClick={() => setPanel('notes')}>
            <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {ttsSupported && (
            <button
              type="button"
              className="reader-icon"
              aria-label={reading ? 'Pause reading aloud' : 'Read aloud from this page'}
              aria-pressed={reading}
              onClick={toggleRead}
            >
              {reading ? <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} /> : <Volume2 className="h-4 w-4" strokeWidth={1.75} />}
            </button>
          )}
          <button type="button" className="reader-icon" aria-label="Smart summary" onClick={() => setPanel('summary')}>
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" className="reader-icon" aria-label="Chapters" onClick={() => setPanel('chapters')}>
            <List className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" className="reader-icon" aria-label="Reading settings" onClick={() => setPanel('settings')}>
            <Type className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-gradient-to-r from-violet to-magenta transition-transform duration-500 ease-soft"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </header>

      {/* On a phone the side padding is as wide as the fixed chapter arrows, so an
          arrow never sits on top of a word. On a wide screen the text column is
          narrower than the viewport and the arrows sit beside it anyway. */}
      <main className="mx-auto w-full px-11 pb-40 pt-8 sm:px-6 sm:pt-14" style={{ maxWidth: width }}>
        <article
          ref={articleRef}
          key={`${ci}-${navCount}`}
          className={'reader-article animate-page-in' + (ttsSupported ? ' audio-ready' : '')}
          style={{ columnCount: double ? 2 : 1, columnGap: '4rem' }}
          onMouseUp={handleSelectionEnd}
          onTouchEnd={handleSelectionEnd}
          onClick={handleArticleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
            Chapter {ci + 1} of {total}
          </p>
          <h1 className="mb-6 mt-2 font-display text-[28px] font-semibold leading-9 sm:mb-8 sm:mt-3 sm:text-[32px] sm:leading-10" style={{ breakAfter: 'avoid' }}>
            {visibleChapter.title}
          </h1>
          {ttsSupported && !audioStarted && (
            <p className="mb-6 flex items-start gap-2 rounded-input border px-3 py-2 text-xs leading-5 opacity-70" style={ruleColor}>
              <Volume2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>Tap any word to hear the chapter from that word, or press the speaker to start from this page.</span>
            </p>
          )}
          {chapter && (
            <ChapterText
              chapter={chapter}
              wordsByParagraph={wordsByParagraph}
              marksByParagraph={marksByParagraph}
              font={prefs.font}
              fontSize={prefs.size}
              lineHeight={prefs.lineHeight}
            />
          )}
        </article>

        <nav className="mt-16 flex items-center justify-between gap-3 border-t pt-6" style={ruleColor}>
          <button type="button" className="btn-ghost" style={{ color: colors.fg }} disabled={ci === 0} onClick={() => goTo(ci - 1)}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} /> Previous
          </button>
          <span className="text-xs tabular-nums opacity-60">{percent}% read</span>
          <button type="button" className="btn-primary" disabled={ci >= total - 1} onClick={() => goTo(ci + 1)}>
            Next <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </nav>
      </main>

      {/* Floating chapter arrows: reachable from any scroll position. */}
      <button
        type="button"
        className="reader-nav left-0 sm:left-4"
        style={{ color: colors.fg, borderColor: `color-mix(in srgb, ${colors.fg} 20%, transparent)`, backgroundColor: `color-mix(in srgb, ${colors.bg} 70%, ${colors.fg} 8%)` }}
        onClick={() => goTo(ci - 1)}
        disabled={ci === 0}
        aria-label="Previous chapter"
        title="Previous chapter"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} />
      </button>
      <button
        type="button"
        className="reader-nav right-0 sm:right-4"
        style={{ color: colors.fg, borderColor: `color-mix(in srgb, ${colors.fg} 20%, transparent)`, backgroundColor: `color-mix(in srgb, ${colors.bg} 70%, ${colors.fg} 8%)` }}
        onClick={() => goTo(ci + 1)}
        disabled={ci >= total - 1}
        aria-label="Next chapter"
        title="Next chapter"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2} />
      </button>

      {audioStarted && audio && (
        <AudioPlayer
          title={book.title}
          chapter={visibleChapter.title}
          wordIndex={wordIndex}
          totalWords={totalWords}
          playing={reading}
          speed={speed}
          follow={follow}
          onToggle={() => {
            const engine = engineRef.current;
            if (!engine) return;
            // Pressing play after the chapter has finished starts it again.
            if (!engine.isPlaying && engine.currentWord >= totalWords - 1) engine.seekToWord(0);
            engine.toggle();
          }}
          onBack={() => engineRef.current?.skip(-10)}
          onForward={() => engineRef.current?.skip(10)}
          onSeek={seekWord}
          onSpeed={changeSpeed}
          onFollow={() => {
            // Turning follow back on should bring the voice into view at once,
            // not wait for the next word to be spoken.
            if (!follow) paintWord(wordIndexRef.current, true);
            setFollow((f) => !f);
          }}
          onClose={disposeEngine}
        />
      )}

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
      {panel === 'summary' && <SummaryPanel book={book} currentChapter={ci} onClose={() => setPanel(null)} />}
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
