'use client';

import { Bookmark as BookmarkIcon, Check, Pencil, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HIGHLIGHT_COLORS } from '@/lib/annotations';
import type { Annotation, Bookmark, Chapter, Highlight, Note } from '@/lib/types';

export type NotesTab = 'notes' | 'highlights' | 'bookmarks';

interface Props {
  bookId: string;
  chapters: Chapter[];
  annotations: Annotation[];
  currentChapter: number;
  initialTab: NotesTab;
  focusNoteId: string | null;
  onSave: (a: Annotation) => void;
  onDelete: (a: Annotation) => void;
  onJump: (chapter: number, target: { paragraph?: number; ratio?: number }) => void;
  onClose: () => void;
}

const newId = () => crypto.randomUUID();

function matches(q: string, ...fields: (string | undefined)[]) {
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export default function NotesPanel(props: Props) {
  const { bookId, chapters, annotations, currentChapter, initialTab, focusNoteId, onSave, onDelete, onJump, onClose } = props;
  const [tab, setTab] = useState<NotesTab>(initialTab);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(focusNoteId);
  const [draft, setDraft] = useState('');

  const q = query.trim().toLowerCase();
  const chapterTitle = (i: number) => chapters[i]?.title ?? `Chapter ${i + 1}`;

  const notes = useMemo(
    () =>
      annotations
        .filter((a): a is Note => a.kind === 'note')
        .filter((n) => matches(q, n.body, n.quote, chapterTitle(n.chapter)))
        .sort((a, b) => a.chapter - b.chapter || a.createdAt - b.createdAt),
    // chapterTitle depends on chapters, which is stable for the book
    [annotations, q],
  );
  const highlights = useMemo(
    () =>
      annotations
        .filter((a): a is Highlight => a.kind === 'highlight')
        .filter((h) => matches(q, h.text, chapterTitle(h.chapter)))
        .sort((a, b) => a.chapter - b.chapter || a.paragraph - b.paragraph || a.start - b.start),
    [annotations, q],
  );
  const bookmarks = useMemo(
    () =>
      annotations
        .filter((a): a is Bookmark => a.kind === 'bookmark')
        .filter((b) => matches(q, b.label, chapterTitle(b.chapter)))
        .sort((a, b) => a.chapter - b.chapter || a.ratio - b.ratio),
    [annotations, q],
  );

  const counts = {
    notes: annotations.filter((a) => a.kind === 'note').length,
    highlights: annotations.filter((a) => a.kind === 'highlight').length,
    bookmarks: annotations.filter((a) => a.kind === 'bookmark').length,
  };

  function addQuickNote() {
    const body = draft.trim();
    if (!body) return;
    const now = Date.now();
    onSave({ id: newId(), kind: 'note', bookId, chapter: currentChapter, body, createdAt: now, updatedAt: now });
    setDraft('');
  }

  function noteFromHighlight(h: Highlight) {
    const id = newId();
    const now = Date.now();
    onSave({
      id,
      kind: 'note',
      bookId,
      chapter: h.chapter,
      body: '',
      quote: h.text,
      highlightId: h.id,
      createdAt: now,
      updatedAt: now,
    });
    setTab('notes');
    setEditingId(id);
  }

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close notes" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Notes and highlights"
        className="glass animate-slide-in absolute right-0 top-0 flex h-full w-[min(440px,100%)] flex-col"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">Your margin</p>
            <h2 className="font-display text-2xl font-semibold">Notes</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-4 px-6 pt-5">
          <div role="tablist" aria-label="Notes sections" className="flex gap-1 rounded-full border border-line bg-card p-1">
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
                  'flex-1 rounded-full px-3 py-1.5 text-sm transition-colors duration-250 ease-soft ' +
                  (tab === id ? 'bg-violet text-white shadow-glow' : 'text-fg-2 hover:text-fg')
                }
              >
                {label} <span className="ml-1 text-xs opacity-70">{count}</span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-input border border-line bg-card px-3 focus-within:border-violet/60">
            <Search className="h-4 w-4 text-fg-3" strokeWidth={1.75} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your notes"
              className="h-10 w-full bg-transparent text-base text-fg placeholder:text-fg-3 focus:outline-none sm:text-sm"
            />
          </label>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {tab === 'notes' &&
            (notes.length === 0 ? (
              <Empty text={q ? 'No notes match your search.' : 'No notes yet. Select text to add one, or write a quick note below.'} />
            ) : (
              notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  chapterTitle={chapterTitle(n.chapter)}
                  editing={editingId === n.id}
                  onEdit={() => setEditingId(n.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) => {
                    onSave({ ...n, body, updatedAt: Date.now() });
                    setEditingId(null);
                  }}
                  onDelete={() => onDelete(n)}
                  onJump={() => onJump(n.chapter, {})}
                />
              ))
            ))}

          {tab === 'highlights' &&
            (highlights.length === 0 ? (
              <Empty text={q ? 'No highlights match your search.' : 'Select text in the reader and choose a colour to highlight it.'} />
            ) : (
              highlights.map((h) => (
                <article key={h.id} className="card-sheen p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HIGHLIGHT_COLORS[h.color].hex }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fg-3">{chapterTitle(h.chapter)}</p>
                      <p className="mt-1 font-display text-base italic leading-6 text-fg">“{h.text}”</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => onJump(h.chapter, { paragraph: h.paragraph })}>
                          Jump to text
                        </button>
                        <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => noteFromHighlight(h)}>
                          Add note
                        </button>
                        <button type="button" className="btn-ghost h-8 px-3 text-xs hover:text-rose" aria-label="Delete highlight" onClick={() => onDelete(h)}>
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ))}

          {tab === 'bookmarks' &&
            (bookmarks.length === 0 ? (
              <Empty text={q ? 'No bookmarks match your search.' : 'Use the bookmark button in the reader to save your place.'} />
            ) : (
              bookmarks.map((b) => (
                <article key={b.id} className="card-sheen flex items-center gap-3 p-4">
                  <BookmarkIcon className="h-4 w-4 shrink-0 text-amber" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.label}</p>
                    <p className="text-xs text-fg-3">
                      {chapterTitle(b.chapter)} · {Math.round(b.ratio * 100)}%
                    </p>
                  </div>
                  <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => onJump(b.chapter, { ratio: b.ratio })}>
                    Open
                  </button>
                  <button type="button" className="icon-btn h-8 w-8 hover:text-rose" aria-label="Delete bookmark" onClick={() => onDelete(b)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </article>
              ))
            ))}
        </div>

        {tab === 'notes' && (
          <div className="border-t border-line p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">
                Quick note · {chapterTitle(currentChapter)}
              </span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addQuickNote();
                }}
                rows={2}
                placeholder="Jot down a thought…"
                className="w-full resize-none rounded-input border border-line bg-card px-3 py-2 text-base text-fg placeholder:text-fg-3 focus:border-magenta/60 focus:outline-none sm:text-sm"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-fg-3">Ctrl/⌘ + Enter to save</span>
              <button type="button" className="btn-primary h-10" disabled={!draft.trim()} onClick={addQuickNote}>
                Add note
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-sm text-fg-3">{text}</p>;
}

function NoteCard({
  note,
  chapterTitle,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onJump,
}: {
  note: Note;
  chapterTitle: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (body: string) => void;
  onDelete: () => void;
  onJump: () => void;
}) {
  return (
    <article className="card-sheen border-l-2 border-l-magenta p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onJump} className="truncate text-xs text-violet-mist hover:underline">
          {chapterTitle}
        </button>
        <div className="flex shrink-0 gap-1">
          {!editing && (
            <button type="button" className="grid h-7 w-7 place-items-center rounded-full text-fg-3 hover:text-fg" aria-label="Edit note" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button type="button" className="grid h-7 w-7 place-items-center rounded-full text-fg-3 hover:text-rose" aria-label="Delete note" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {note.quote && (
        <blockquote className="mt-2 border-l-2 border-amber/70 pl-3 font-display text-sm italic leading-6 text-fg-2">“{note.quote}”</blockquote>
      )}
      {editing ? (
        <NoteEditor initial={note.body} onSave={onSave} onCancel={onCancel} />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg">{note.body || <span className="text-fg-3">Empty note</span>}</p>
      )}
    </article>
  );
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (body: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="mt-3">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        rows={3}
        className="w-full resize-none rounded-input border border-line bg-ink px-3 py-2 text-base text-fg focus:border-magenta/60 focus:outline-none sm:text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => onSave(value.trim())}>
          <Check className="h-3.5 w-3.5" strokeWidth={2} /> Save
        </button>
      </div>
    </div>
  );
}
