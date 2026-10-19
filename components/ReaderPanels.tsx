'use client';

import { Check, Circle, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Chapter, ReaderFont, ReaderLayout, ReaderMargin, ReaderPrefs, ReaderTheme } from '@/lib/types';
import { READER_THEMES } from '@/lib/library';
import { wordCount } from '@/lib/parse/text';

/* ---------- Chapter list ---------- */

export function ChapterDrawer({
  chapters,
  current,
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  current: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close chapters" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Chapters"
        className="glass animate-slide-in absolute right-0 top-0 flex h-full w-[min(420px,100%)] flex-col"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-mist">Navigator</p>
            <h2 className="font-display text-2xl font-semibold">Chapters</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <ol className="flex-1 overflow-y-auto p-3">
          {chapters.map((c, i) => {
            const words = c.paragraphs.reduce((n, p) => n + wordCount(p), 0);
            const minutes = Math.max(1, Math.round(words / 230));
            const isCurrent = i === current;
            const done = i < current;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={
                    'flex w-full items-center gap-3 rounded-input px-3 py-3 text-left transition-colors duration-150 ' +
                    (isCurrent ? 'bg-violet/15 text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg')
                  }
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center">
                    {done ? (
                      <Check className="h-4 w-4 text-mint" strokeWidth={2} />
                    ) : isCurrent ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-violet shadow-glow" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-fg-3" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-3">{minutes} min</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

/* ---------- Reading settings ---------- */

const FONTS: { id: ReaderFont; label: string; family: string }[] = [
  { id: 'literata', label: 'Literata', family: 'var(--font-reader-literata)' },
  { id: 'inter', label: 'Inter', family: 'var(--font-reader-inter)' },
  { id: 'georgia', label: 'Georgia', family: 'var(--font-reader-georgia)' },
  { id: 'dyslexic', label: 'OpenDyslexic', family: 'var(--font-reader-dyslexic)' },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; style?: CSSProperties }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full border border-line bg-card p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            style={o.style}
            className={
              'flex-1 rounded-full px-3 py-1.5 text-sm transition-colors duration-250 ease-soft ' +
              (value === o.id ? 'bg-violet text-white shadow-glow' : 'text-fg-2 hover:text-fg')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({
  prefs,
  onChange,
  onReset,
  onClose,
}: {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const themeIds = Object.keys(READER_THEMES) as Exclude<ReaderTheme, 'custom'>[];
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Reading settings"
        className="glass animate-slide-in absolute right-0 top-0 flex h-full w-[min(400px,100%)] flex-col"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-mist">Customise</p>
            <h2 className="font-display text-2xl font-semibold">Reading</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto p-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">Font</p>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onChange({ font: f.id })}
                  aria-pressed={prefs.font === f.id}
                  className={
                    'rounded-input border px-3 py-2.5 text-left transition-colors duration-250 ease-soft ' +
                    (prefs.font === f.id ? 'border-violet bg-violet/10' : 'border-line bg-card hover:border-violet/40')
                  }
                >
                  <span className="block text-lg leading-6" style={{ fontFamily: f.family }}>
                    Aa
                  </span>
                  <span className="text-xs text-fg-2">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">
              <label htmlFor="size">Text size</label>
              <span className="tabular-nums text-violet-mist">{prefs.size}px</span>
            </div>
            <input
              id="size"
              type="range"
              min={14}
              max={28}
              step={1}
              value={prefs.size}
              onChange={(e) => onChange({ size: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">
              <label htmlFor="line">Line spacing</label>
              <span className="tabular-nums text-violet-mist">{prefs.lineHeight.toFixed(1)}</span>
            </div>
            <input
              id="line"
              type="range"
              min={1.4}
              max={2.4}
              step={0.1}
              value={prefs.lineHeight}
              onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <Segmented<ReaderMargin>
            label="Margins"
            value={prefs.margin}
            options={[
              { id: 'narrow', label: 'Narrow' },
              { id: 'medium', label: 'Medium' },
              { id: 'wide', label: 'Wide' },
            ]}
            onChange={(margin) => onChange({ margin })}
          />

          <Segmented<ReaderLayout>
            label="Page view"
            value={prefs.layout}
            options={[
              { id: 'single', label: 'Single' },
              { id: 'double', label: 'Double' },
            ]}
            onChange={(layout) => onChange({ layout })}
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-fg-3">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {themeIds.map((id) => {
                const t = READER_THEMES[id];
                const active = prefs.theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ theme: id })}
                    className={
                      'flex flex-col items-center gap-2 rounded-input border p-2 transition-colors duration-250 ease-soft ' +
                      (active ? 'border-violet' : 'border-line hover:border-violet/40')
                    }
                  >
                    <span className="grid h-10 w-full place-items-center rounded-[10px] text-sm font-semibold" style={{ background: t.bg, color: t.fg }}>
                      Aa
                    </span>
                    <span className="text-[11px] text-fg-2">{t.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={prefs.theme === 'custom'}
                onClick={() => onChange({ theme: 'custom' })}
                className={
                  'flex flex-col items-center gap-2 rounded-input border p-2 transition-colors duration-250 ease-soft ' +
                  (prefs.theme === 'custom' ? 'border-violet' : 'border-line hover:border-violet/40')
                }
              >
                <span className="grid h-10 w-full place-items-center rounded-[10px] text-sm font-semibold" style={{ background: prefs.customBg, color: prefs.customFg }}>
                  Aa
                </span>
                <span className="text-[11px] text-fg-2">Custom</span>
              </button>
            </div>
            {prefs.theme === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-fg-2">
                <label className="flex items-center justify-between gap-2 rounded-input border border-line bg-card px-3 py-2">
                  Background
                  <input type="color" value={prefs.customBg} onChange={(e) => onChange({ customBg: e.target.value })} className="h-7 w-10 cursor-pointer rounded bg-transparent" />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-input border border-line bg-card px-3 py-2">
                  Text
                  <input type="color" value={prefs.customFg} onChange={(e) => onChange({ customFg: e.target.value })} className="h-7 w-10 cursor-pointer rounded bg-transparent" />
                </label>
              </div>
            )}
          </div>

        </div>

        <div className="border-t border-line p-6">
          <button type="button" className="btn-ghost w-full" onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </aside>
    </div>
  );
}
