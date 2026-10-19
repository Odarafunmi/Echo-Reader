'use client';

import { Check, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  GENDERS,
  GENDER_LABEL,
  speakPreview,
  useGenericVoices,
  useNarrationPreference,
  type Gender,
} from '@/lib/voice/generic';

const PREVIEW_TEXT = 'Hello, I am your reading voice. Pick the one you like, and I will read your books aloud.';

export default function GenericVoicePicker() {
  const { resolved, supported } = useGenericVoices();
  const [selected, setSelected] = useNarrationPreference();
  const [previewing, setPreviewing] = useState<Gender | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Stop any preview when the page is left.
  useEffect(() => () => stopRef.current?.(), []);

  function togglePreview(g: Gender) {
    if (!resolved) return;
    if (previewing === g) {
      stopRef.current?.();
      stopRef.current = null;
      setPreviewing(null);
      return;
    }
    stopRef.current?.();
    setPreviewing(g);
    stopRef.current = speakPreview(PREVIEW_TEXT, resolved[g], () => {
      setPreviewing((cur) => (cur === g ? null : cur));
    });
  }

  return (
    <section className="card-sheen animate-fade-up mt-10 p-6 sm:p-8" aria-labelledby="generic-voices-title">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Built-in voices</p>
      <h2 id="generic-voices-title" className="mt-2 font-display text-2xl font-semibold">
        Read your books in a generic voice
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">
        These voices come from this device&apos;s speech system. Nothing is sent to a server and no key is needed. Choose the voice you want the reader to use.
      </p>

      {!supported && (
        <p className="mt-4 rounded-input border border-line px-4 py-3 text-sm text-fg-2">
          This browser cannot read text aloud. Try Chrome, Edge or Safari.
        </p>
      )}

      <div role="radiogroup" aria-label="Narration voice" className="mt-6 grid gap-4 sm:grid-cols-2">
        {GENDERS.map((g) => {
          const v = resolved?.[g];
          const active = selected === g;
          const playing = previewing === g;
          return (
            <div
              key={g}
              className={
                'flex flex-col gap-4 rounded-card border p-5 transition-colors duration-300 ease-soft ' +
                (active ? 'border-violet bg-violet/10' : 'border-line bg-raised/40')
              }
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(g)}
                className="flex items-start justify-between gap-3 text-left focus:outline-none"
              >
                <span>
                  <span className="block font-display text-xl font-semibold">{GENDER_LABEL[g].replace(' voice', '')}</span>
                  <span className="mt-1 block truncate text-xs text-fg-3">{v ? v.label : 'Loading voices…'}</span>
                </span>
                <span
                  className={
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border ' +
                    (active ? 'border-violet bg-violet text-white' : 'border-line text-transparent')
                  }
                  aria-hidden
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              </button>

              {v && !v.matched && (
                <p className="text-xs leading-5 text-fg-3">
                  This device has no {g} voice, so this option uses its default voice with a {g === 'masculine' ? 'deeper' : 'higher'} pitch.
                </p>
              )}

              <button
                type="button"
                className="btn-ghost self-start"
                onClick={() => togglePreview(g)}
                disabled={!v || !supported}
                aria-label={playing ? `Stop ${GENDER_LABEL[g]} preview` : `Preview ${GENDER_LABEL[g]}`}
              >
                {playing ? <Square className="h-4 w-4" strokeWidth={1.75} /> : <Volume2 className="h-4 w-4" strokeWidth={1.75} />}
                {playing ? 'Stop' : 'Preview'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
