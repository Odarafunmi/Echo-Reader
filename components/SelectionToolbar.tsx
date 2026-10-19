'use client';

import { NotebookPen, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { HIGHLIGHT_COLORS } from '@/lib/annotations';
import type { HighlightColor } from '@/lib/types';

export type ToolbarState =
  | { mode: 'new'; x: number; y: number; paragraph: number; start: number; end: number; text: string; chapter: number }
  | { mode: 'existing'; x: number; y: number; highlightId: string; color: HighlightColor };

/** Floating toolbar shown above a text selection, or above an existing highlight. */
export default function SelectionToolbar({
  state,
  onColor,
  onNote,
  onDelete,
  onClose,
}: {
  state: ToolbarState;
  onColor: (c: HighlightColor) => void;
  onNote: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeColor = state.mode === 'existing' ? state.color : null;
  const x = Math.min(Math.max(state.x, 180), (typeof window !== 'undefined' ? window.innerWidth : 1280) - 180);

  return (
    <div
      role="toolbar"
      aria-label="Highlight options"
      className="glass animate-toast fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full px-2 py-1.5 shadow-lg"
      style={{ left: x, top: Math.max(state.y - 10, 72) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Highlight ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
          aria-pressed={activeColor === c}
          onClick={() => onColor(c)}
          className="grid h-8 w-8 place-items-center rounded-full transition-transform duration-150 ease-soft hover:scale-110"
        >
          <span
            className="h-5 w-5 rounded-full ring-offset-2 ring-offset-ink transition-shadow duration-250"
            style={{
              background: HIGHLIGHT_COLORS[c].hex,
              boxShadow: activeColor === c ? `0 0 0 2px ${HIGHLIGHT_COLORS[c].hex}` : 'none',
            }}
          />
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button
        type="button"
        onClick={onNote}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-fg-2 transition-colors duration-150 hover:text-magenta"
      >
        <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
        {state.mode === 'new' ? 'Note' : 'Add note'}
      </button>
      {state.mode === 'existing' && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete highlight"
          className="grid h-8 w-8 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-rose"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
