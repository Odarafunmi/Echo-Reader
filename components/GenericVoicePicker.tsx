'use client';

import { Check, Search, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { speakPreview, useNarration, type VoiceOption } from '@/lib/voice/generic';

const PREVIEW_TEXT = 'Hello, I am your reading voice. Pick the one you like, and I will read your books aloud.';

/** Chrome reports names like "Google US English"; the useful part is usually the whole string. */
function languageLabel(lang: string): string {
  try {
    const display = new Intl.DisplayNames(['en'], { type: 'language' });
    const base = lang.split('-')[0];
    return display.of(base) ?? lang;
  } catch {
    return lang;
  }
}

function VoiceRow({
  option,
  active,
  playing,
  onPick,
  onPreview,
}: {
  option: VoiceOption;
  active: boolean;
  playing: boolean;
  onPick: () => void;
  onPreview: () => void;
}) {
  return (
    <li
      className={
        'flex items-center gap-3 rounded-input border px-4 py-3 transition-colors duration-300 ease-soft ' +
        (active ? 'border-violet bg-violet/10' : 'border-line bg-raised/40')
      }
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
      >
        <span
          className={
            'grid h-5 w-5 shrink-0 place-items-center rounded-full border ' +
            (active ? 'border-violet bg-violet text-white' : 'border-line text-transparent')
          }
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">{option.name}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-3">
            {languageLabel(option.lang)} · {option.lang}
            {option.isDefault ? ' · device default' : option.local ? '' : ' · online'}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="icon-btn shrink-0"
        onClick={onPreview}
        aria-label={playing ? `Stop ${option.name} preview` : `Preview ${option.name}`}
        aria-pressed={playing}
      >
        {playing ? <Square className="h-4 w-4" strokeWidth={1.75} /> : <Volume2 className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </li>
  );
}

export default function GenericVoicePicker() {
  const { supported, loading, options, chosen, chosenUri, choose } = useNarration();
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const stopRef = useRef<(() => void) | null>(null);

  // Stop any preview when the page is left.
  useEffect(() => () => stopRef.current?.(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.lang.toLowerCase().includes(q),
    );
  }, [options, query]);

  function togglePreview(o: VoiceOption) {
    if (previewing === o.uri) {
      stopRef.current?.();
      stopRef.current = null;
      setPreviewing(null);
      return;
    }
    stopRef.current?.();
    setPreviewing(o.uri);
    const resolved = { gender: 'feminine' as const, label: o.name, voice: o.voice, pitch: 1, rate: 1, matched: true };
    stopRef.current = speakPreview(PREVIEW_TEXT, resolved, () => {
      setPreviewing((cur) => (cur === o.uri ? null : cur));
    });
  }

  return (
    <section className="card-sheen animate-fade-up mt-10 p-6 sm:p-8" aria-labelledby="generic-voices-title">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Device voices</p>
      <h2 id="generic-voices-title" className="mt-2 font-display text-2xl font-semibold">
        Choose a voice from this device
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">
        Every voice installed on this device, read straight from the browser&apos;s speech system.
        Nothing is uploaded and no key is needed. Install more voices in your operating system&apos;s
        accessibility or speech settings and they will appear here.
      </p>

      {!supported && (
        <p className="mt-4 rounded-input border border-line px-4 py-3 text-sm text-fg-2">
          This browser cannot read text aloud. Try Chrome, Edge or Safari.
        </p>
      )}

      {supported && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-2" aria-live="polite">
              {loading
                ? 'Looking for voices on this device…'
                : `${options.length} voice${options.length === 1 ? '' : 's'} found`}
              {chosen && !loading ? (
                <>
                  {' · reading with '}
                  <span className="font-medium text-fg">{chosen.label}</span>
                </>
              ) : null}
            </p>
            {options.length > 6 && (
              <div className="relative w-full sm:w-auto">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" strokeWidth={1.75} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter voices"
                  aria-label="Filter voices"
                  className="h-10 w-full rounded-input border border-line bg-ink/40 pl-9 pr-3 text-base text-fg placeholder:text-fg-3 focus:border-violet focus:outline-none sm:w-48 sm:text-sm"
                />
              </div>
            )}
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-fg-3">Waiting for this device to report its voices.</p>
          ) : options.length === 0 ? (
            <p className="mt-4 rounded-input border border-line px-4 py-3 text-sm leading-6 text-fg-2">
              This device reports no voices. The reader will fall back to its default voice with a
              raised pitch. On Windows add voices under Settings → Time &amp; language → Speech; on
              macOS under System Settings → Accessibility → Spoken Content.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Narration voice" className="mt-4">
              <ul className="grid max-h-[26rem] gap-2 overflow-y-auto pr-1">
                {filtered.map((o) => (
                  <VoiceRow
                    key={o.uri}
                    option={o}
                    active={chosenUri === o.uri}
                    playing={previewing === o.uri}
                    onPick={() => choose(o.uri)}
                    onPreview={() => togglePreview(o)}
                  />
                ))}
              </ul>
              {filtered.length === 0 && (
                <p className="mt-3 text-sm text-fg-3">No voice matches “{query}”.</p>
              )}
              {chosenUri && (
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="mt-4 text-xs text-fg-3 underline-offset-4 hover:text-fg-2 hover:underline"
                >
                  Use the default voice instead
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
