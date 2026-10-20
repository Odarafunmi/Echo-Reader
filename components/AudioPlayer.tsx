'use client';

// The narration bar: a real player, not just a stop button.
//
// It carries the controls the reader needs while listening — back 10 seconds,
// play/pause from the exact word, forward 10 seconds, a draggable position bar,
// four speeds, a follow-the-voice toggle and a way out. It sits above the text and
// stays within thumb reach on a phone.

import { useEffect, useRef, useState } from 'react';
import { FastForward, LocateFixed, LocateOff, Pause, Play, Rewind, X } from 'lucide-react';
import type { Speed } from '@/lib/audio/engine';
import { SPEEDS } from '@/lib/audio/engine';
import { estimateSeconds } from '@/lib/audio/text';

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function AudioPlayer({
  title,
  chapter,
  wordIndex,
  totalWords,
  playing,
  speed,
  follow,
  onToggle,
  onBack,
  onForward,
  onSeek,
  onSpeed,
  onFollow,
  onClose,
}: {
  title: string;
  chapter: string;
  wordIndex: number;
  totalWords: number;
  playing: boolean;
  speed: Speed;
  follow: boolean;
  onToggle: () => void;
  onBack: () => void;
  onForward: () => void;
  onSeek: (word: number) => void;
  onSpeed: (speed: Speed) => void;
  onFollow: () => void;
  onClose: () => void;
}) {
  const max = Math.max(0, totalWords - 1);
  // While a thumb is being dragged the player follows the thumb, not the voice:
  // seeking on every input event would cancel and restart speech dozens of times a
  // second. The seek happens once, when the thumb is released.
  const [draft, setDraftState] = useState<number | null>(null);
  // The ref is what `commit` reads: pointerup can arrive in the same batch as the
  // last input event, before React has re-rendered with the new value.
  const draftRef = useRef<number | null>(null);
  const setDraft = (value: number | null) => {
    draftRef.current = value;
    setDraftState(value);
  };
  const shown = Math.min(draft ?? wordIndex, max);
  const percent = totalWords > 1 ? Math.round((shown / max) * 100) : 0;
  const remaining = estimateSeconds(Math.max(0, totalWords - shown), speed);

  const commit = () => {
    const value = draftRef.current;
    if (value === null) return;
    draftRef.current = null;
    setDraftState(null);
    onSeek(value);
  };

  // A chapter switch or a new book must not leave a stale thumb behind.
  useEffect(() => {
    draftRef.current = null;
    setDraftState(null);
  }, [totalWords, chapter]);

  // A thumb released outside the slider still has to seek: native range inputs
  // keep the pointer capture, but the up event then lands on the window.
  useEffect(() => {
    if (draft === null) return;
    const done = () => {
      const value = draftRef.current;
      if (value === null) return;
      draftRef.current = null;
      setDraftState(null);
      onSeek(value);
    };
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
    return () => {
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
  }, [draft, onSeek]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      <section
        aria-label="Read aloud player"
        className="pointer-events-auto mx-auto w-full max-w-3xl rounded-2xl border border-line bg-card/95 p-2.5 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-3.5"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg sm:text-sm">{title}</p>
            <p className="truncate text-[11px] text-fg-3 sm:text-xs">
              {chapter} · {percent}% · {clock(remaining)} left
            </p>
          </div>

          <label className="sr-only" htmlFor="narration-speed">
            Narration speed
          </label>
          <select
            id="narration-speed"
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value) as Speed)}
            className="h-9 shrink-0 rounded-full border border-line bg-ink/60 pl-2.5 pr-1.5 text-xs font-medium text-fg focus:border-violet focus:outline-none"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onFollow}
            aria-pressed={follow}
            aria-label={follow ? 'Stop following the voice' : 'Follow the voice as it reads'}
            title={follow ? 'Following the voice' : 'Not following the voice'}
            className={
              'grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors duration-200 ' +
              (follow ? 'border-violet/50 bg-violet/15 text-violet-mist' : 'border-line text-fg-3 hover:text-fg')
            }
          >
            {follow ? <LocateFixed className="h-4 w-4" strokeWidth={1.75} /> : <LocateOff className="h-4 w-4" strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close the player and stop reading aloud"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-fg-3 transition-colors duration-200 hover:border-rose/40 hover:text-rose"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back 10 seconds"
              title="Back 10 seconds"
              className="grid h-10 w-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised hover:text-fg sm:h-11 sm:w-11"
            >
              <Rewind className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onToggle}
              aria-label={playing ? 'Pause' : 'Play'}
              aria-pressed={playing}
              className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-violet to-violet-deep text-white shadow-glow transition-transform active:scale-95 sm:h-12 sm:w-12"
            >
              {playing ? <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} /> : <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" strokeWidth={0} />}
            </button>
            <button
              type="button"
              onClick={onForward}
              aria-label="Forward 10 seconds"
              title="Forward 10 seconds"
              className="grid h-10 w-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised hover:text-fg sm:h-11 sm:w-11"
            >
              <FastForward className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <label htmlFor="narration-position" className="sr-only">
              Position in the chapter
            </label>
            <input
              id="narration-position"
              type="range"
              min={0}
              max={max}
              step={1}
              value={shown}
              onChange={(e) => setDraft(Number(e.target.value))}
              onPointerUp={commit}
              onPointerCancel={commit}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) commit();
              }}
              onBlur={commit}
              className="range-audio w-full"
              aria-valuetext={`${percent}% of the chapter`}
            />
            <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-fg-3">
              <span>{clock(estimateSeconds(shown, speed))}</span>
              <span>{clock(estimateSeconds(totalWords, speed))}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
