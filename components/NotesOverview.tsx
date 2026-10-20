'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark as BookmarkIcon, ArrowUpRight, Search, Trash2 } from 'lucide-react';
import { HIGHLIGHT_COLORS } from '@/lib/annotations';
import { deleteAnnotation, getBookContent, listAnnotationsForBooks } from '@/lib/db';
import { listBooks, queueJump } from '@/lib/library';
import { useProfile } from '@/lib/profile/useProfile';
import type { Annotation, Bookmark, BookMeta, Highlight, Note } from '@/lib/types';
import Toast, { type ToastState } from './Toast';

type Tab = 'notes' | 'highlights' | 'bookmarks';

interface Loaded {
  books: Map<string, BookMeta>;
  chapterTitles: Map<string, string[]>;
  annotations: Annotation[];
}

export default function NotesOverview() {
  const router = useRouter();
  const { profile } = useProfile();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('notes');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = (text: string, tone: ToastState['tone'] = 'ok') => setToast({ id: Date.now(), text, tone });

  async function load() {
    if (!profile) return;
    try {
      // Only this profile's books, and only the notes attached to them.
      const books = await listBooks(profile.id);
      const annotations = await listAnnotationsForBooks(books.map((b) => b.id));
      const withNotes = new Set(annotations.map((a) => a.bookId));
      const contents = await Promise.all(
        books.filter((b) => withNotes.has(b.id)).map((b) => getBookContent(b.id)),
      );
      const chapterTitles = new Map<string, string[]>();
      for (const c of contents) if (c) chapterTitles.set(c.id, c.chapters.map((ch) => ch.title));
      setData({ books: new Map(books.map((b) => [b.id, b])), chapterTitles, annotations });
    } catch {
      setData(null);
    }
  }

  useEffect(() => {
    setData(undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!data) return [];
    const titleOf = (bookId: string, chapter: number) => data.chapterTitles.get(bookId)?.[chapter] ?? `Chapter ${chapter + 1}`;
    const bookTitle = (bookId: string) => data.books.get(bookId)?.title ?? 'Untitled book';
    return data.annotations
      .filter((a) => a.kind === (tab === 'notes' ? 'note' : tab === 'highlights' ? 'highlight' : 'bookmark'))
      .map((a) => {
        const chapter = titleOf(a.bookId, a.chapter);
        const searchable =
          a.kind === 'note' ? [a.body, a.quote, chapter, bookTitle(a.bookId)]
          : a.kind === 'highlight' ? [a.text, chapter, bookTitle(a.bookId)]
          : [a.label, chapter, bookTitle(a.bookId)];
        return { annotation: a, chapter, book: bookTitle(a.bookId), matches: !q || searchable.some((f) => f?.toLowerCase().includes(q)) };
      })
      .filter((r) => r.matches);
  }, [data, tab, q]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(r.annotation.bookId, [...(map.get(r.annotation.bookId) ?? []), r]);
    return [...map.entries()].sort((a, b) => (data?.books.get(a[0])?.title ?? '').localeCompare(data?.books.get(b[0])?.title ?? ''));
  }, [rows, data]);

  const counts = useMemo(() => {
    const all = data?.annotations ?? [];
    return {
      notes: all.filter((a) => a.kind === 'note').length,
      highlights: all.filter((a) => a.kind === 'highlight').length,
      bookmarks: all.filter((a) => a.kind === 'bookmark').length,
    };
  }, [data]);

  function open(a: Annotation) {
    if (a.kind === 'note' || a.kind === 'highlight') {
      queueJump({ bookId: a.bookId, chapter: a.chapter, paragraph: a.kind === 'highlight' ? a.paragraph : undefined });
    } else {
      queueJump({ bookId: a.bookId, chapter: a.chapter, ratio: a.ratio });
    }
    router.push(`/read/${a.bookId}`);
  }

  async function remove(a: Annotation) {
    if (a.kind === 'note' && a.body.trim() && !window.confirm('Delete this note? This cannot be undone.')) return;
    try {
      await deleteAnnotation(a.id);
      setData((d) => (d ? { ...d, annotations: d.annotations.filter((x) => x.id !== a.id) } : d));
      notify('Removed');
    } catch {
      notify('Could not remove that. Please try again.', 'error');
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <section className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Your margin</p>
        <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight tracking-tight sm:mt-3 sm:text-[40px] md:text-[48px] md:leading-[56px]">
          Notes, <em className="font-semibold italic text-magenta">across every book.</em>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-fg-2 sm:text-base sm:leading-[26px]">
          Everything you have noted, highlighted or bookmarked, in one place. Open any item to jump back to its spot in the text.
        </p>
      </section>

      {data === undefined && <p className="mt-10 text-sm text-fg-3">Loading your notes…</p>}
      {data === null && (
        <p role="alert" className="mt-10 text-sm text-rose">
          Could not open your library storage in this browser.
        </p>
      )}

      {data && (
        <>
          <div className="mt-8 space-y-4">
            <div role="tablist" aria-label="Notes sections" className="flex w-full max-w-lg gap-1 rounded-full border border-line bg-card p-1">
              {(
                [
                  ['notes', 'Notes', counts.notes],
                  ['highlights', 'Highlights', counts.highlights],
                  ['bookmarks', 'Bookmarks', counts.bookmarks],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={
                    'flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-xs transition-colors duration-250 ease-soft sm:px-3 sm:text-sm ' +
                    (tab === id ? 'bg-violet text-white shadow-glow' : 'text-fg-2 hover:text-fg')
                  }
                >
                  {label} <span className="ml-1 hidden text-xs opacity-70 sm:inline">{count}</span>
                </button>
              ))}
            </div>
            <label className="flex w-full max-w-lg items-center gap-2 rounded-input border border-line bg-card px-3 focus-within:border-violet/60">
              <Search className="h-4 w-4 text-fg-3" strokeWidth={1.75} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes, quotes and chapters"
                className="h-10 w-full bg-transparent text-base text-fg placeholder:text-fg-3 focus:outline-none sm:text-sm"
              />
            </label>
          </div>

          <div className="mt-10 space-y-10">
            {groups.length === 0 && (
              <p className="rounded-card border border-dashed border-line px-5 py-10 text-center text-sm text-fg-3">
                {q
                  ? 'Nothing matches your search.'
                  : tab === 'notes'
                    ? 'No notes yet. Select text in any book to start a note.'
                    : tab === 'highlights'
                      ? 'No highlights yet. Select text in the reader and choose a colour.'
                      : 'No bookmarks yet. Use the bookmark button in the reader to save your place.'}
              </p>
            )}

            {groups.map(([bookId, items]) => (
              <section key={bookId} className="animate-fade-up">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h2 className="truncate font-display text-xl font-semibold">{data.books.get(bookId)?.title ?? 'Untitled book'}</h2>
                  <span className="shrink-0 text-xs text-fg-3">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <ul className="space-y-3">
                  {items.map(({ annotation: a, chapter }) => (
                    <li key={a.id}>
                      <NoteRow annotation={a} chapter={chapter} onOpen={() => open(a)} onDelete={() => remove(a)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function NoteRow({
  annotation: a,
  chapter,
  onOpen,
  onDelete,
}: {
  annotation: Annotation;
  chapter: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const when = new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <article className={'card-sheen p-4 ' + (a.kind === 'note' ? 'border-l-2 border-l-magenta' : '')}>
      <div className="flex items-start gap-3">
        {a.kind === 'highlight' && (
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HIGHLIGHT_COLORS[(a as Highlight).color].hex }} />
        )}
        {a.kind === 'bookmark' && <BookmarkIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" strokeWidth={1.75} />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-violet-mist">
            {chapter} <span className="text-fg-3">· {when}</span>
          </p>
          {a.kind === 'note' && (
            <>
              {(a as Note).quote && (
                <blockquote className="mt-2 border-l-2 border-amber/70 pl-3 font-display text-sm italic leading-6 text-fg-2">
                  “{(a as Note).quote}”
                </blockquote>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg">
                {(a as Note).body || <span className="text-fg-3">Empty note</span>}
              </p>
            </>
          )}
          {a.kind === 'highlight' && (
            <p className="mt-1 font-display text-base italic leading-6 text-fg">“{(a as Highlight).text}”</p>
          )}
          {a.kind === 'bookmark' && (
            <p className="mt-1 text-sm text-fg">
              {(a as Bookmark).label} <span className="text-fg-3">· {Math.round((a as Bookmark).ratio * 100)}%</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onOpen}>
            Open <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn h-8 w-8 hover:text-rose" aria-label="Delete" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </article>
  );
}
