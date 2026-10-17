'use client';

import { Check, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ENGINES, GENDERS, GENDER_LABEL, useDeviceVoices, useNarrationChoice, type Engine, type Gender } from '@/lib/voice/generic';
import { ENGINE_LABEL, ENGINE_NOTE, makeNarrator } from '@/lib/voice/narrators';

const PREVIEW_TEXT = 'Hello, I am your reading voice. Pick the one you like, and I will read your books aloud.';

export default function GenericVoicePicker() {
  const { resolved: voices, supported: deviceSupported } = useDeviceVoices();
  const { engine, gender: selected, setEngine, setGender } = useNarrationChoice();
  const [previewing, setPreviewing] = useState<Gender | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const previewId = useRef(0);

  // The label and fallback note for each gender come from the chosen engine.
  const narrators = useMemo(
    () => ({
      masculine: makeNarrator(engine, 'masculine', voices, deviceSupported),
      feminine: makeNarrator(engine, 'feminine', voices, deviceSupported),
    }),
    [engine, voices, deviceSupported],
  );

  function stopPreview() {
    previewId.current++;
    stopRef.current?.();
    stopRef.current = null;
    setPreviewing(null);
    setStatus(null);
  }

  // Stop any preview when the page is left, or when the engine changes.
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  function togglePreview(g: Gender) {
    if (previewing === g) {
      stopPreview();
      return;
    }
    stopPreview();
    const narrator = narrators[g];
    if (!narrator) return;

    const id = previewId.current;
    const live = () => id === previewId.current;
    setPreviewing(g);
    setStatus(narrator.engine === 'device' ? null : 'Loading voice…');
    // Until the clip exists, stopping only needs to mark the preview as cancelled.
    stopRef.current = () => {};

    narrator
      .prepare((message) => live() && setStatus(message))
      .then(() => {
        if (!live()) return;
        setStatus(null);
        const clip = narrator.speak(PREVIEW_TEXT);
        stopRef.current = () => clip.stop();
        return clip.done.then((ok) => {
          if (!live()) return;
          stopRef.current = null;
          setPreviewing(null);
          if (!ok) setStatus('The preview could not play.');
        });
      })
      .catch(() => {
        if (!live()) return;
        stopRef.current = null;
        setPreviewing(null);
        setStatus('That voice could not load. Try another engine.');
      });
  }

  const engineNote = engine === 'device' && !deviceSupported ? null : ENGINE_NOTE[engine];

  return (
    <section className="card-sheen animate-fade-up mt-10 p-6 sm:p-8" aria-labelledby="generic-voices-title">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Narration voices</p>
      <h2 id="generic-voices-title" className="mt-2 font-display text-2xl font-semibold">
        Read your books in a masculine or feminine voice
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">Choose a speech engine, then the voice you want the reader to use. Preview each one before you choose.</p>

      <div role="radiogroup" aria-label="Narration engine" className="mt-6 grid gap-3 sm:grid-cols-3">
        {ENGINES.map((e: Engine) => {
          const active = engine === e;
          return (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setEngine(e)}
              className={
                'rounded-input border px-4 py-3 text-left transition-colors duration-300 ease-soft focus:outline-none ' +
                (active ? 'border-violet bg-violet/10' : 'border-line bg-raised/40 hover:border-line-strong')
              }
            >
              <span className="block text-sm font-semibold text-fg">{ENGINE_LABEL[e]}</span>
              <span className="mt-0.5 block text-xs text-fg-3">{e === 'device' ? 'Nothing to download' : e === 'kokoro' ? 'About 90 MB, once' : 'Bundled, GPL'}</span>
            </button>
          );
        })}
      </div>

      {engineNote && <p className="mt-4 text-sm leading-6 text-fg-2">{engineNote}</p>}
      {engine === 'espeak' && (
        <p className="mt-2 rounded-input border border-line px-4 py-3 text-xs leading-5 text-fg-3">
          eSpeak NG and meSpeak.js are free software under the GNU General Public License (GPL). Because this app bundles them, the
          eSpeak voice data and the code that plays it are GPL-licensed.
        </p>
      )}
      {engine === 'kokoro' && (
        <p className="mt-2 rounded-input border border-line px-4 py-3 text-xs leading-5 text-fg-3">
          Kokoro-82M is released under the Apache 2.0 license. Its model downloads from Hugging Face the first time you use it.
        </p>
      )}

      {!deviceSupported && engine === 'device' && (
        <p className="mt-4 rounded-input border border-line px-4 py-3 text-sm text-fg-2">
          This browser cannot read text aloud with device voices. Try Chrome, Edge or Safari, or pick Kokoro or eSpeak NG.
        </p>
      )}

      <div role="radiogroup" aria-label="Narration voice" className="mt-6 grid gap-4 sm:grid-cols-2">
        {GENDERS.map((g) => {
          const narrator = narrators[g];
          const deviceFallback = engine === 'device' && voices && !voices[g].matched;
          const active = selected === g;
          const playing = previewing === g;
          const canPreview = !!narrator;
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
                onClick={() => setGender(g)}
                className="flex items-start justify-between gap-3 text-left focus:outline-none"
              >
                <span>
                  <span className="block font-display text-xl font-semibold">{GENDER_LABEL[g].replace(' voice', '')}</span>
                  <span className="mt-1 block text-xs text-fg-3">{narrator ? narrator.label : 'Loading voices…'}</span>
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

              {deviceFallback && (
                <p className="text-xs leading-5 text-fg-3">
                  This device has no {g} voice, so this option uses its default voice with a {g === 'masculine' ? 'deeper' : 'higher'} pitch.
                </p>
              )}

              <button
                type="button"
                className="btn-ghost self-start"
                onClick={() => togglePreview(g)}
                disabled={!canPreview}
                aria-label={playing ? `Stop ${GENDER_LABEL[g]} preview` : `Preview ${GENDER_LABEL[g]}`}
              >
                {playing ? <Square className="h-4 w-4" strokeWidth={1.75} /> : <Volume2 className="h-4 w-4" strokeWidth={1.75} />}
                {playing ? 'Stop' : 'Preview'}
              </button>
            </div>
          );
        })}
      </div>

      {status && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-fg-2">
          {status}
        </p>
      )}
    </section>
  );
}
