'use client';

// Read-aloud check. The browser's speech recognition confirms the user read the phrase.
// Only Chromium-based browsers and Safari expose it. Elsewhere, verification is unavailable.

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => RecognitionLike;

export function speechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Starts listening. Call `finish()` to stop and get the transcript. */
export function listen(lang: string): { finish: () => Promise<string> } | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = false;
  let transcript = '';
  let done: ((t: string) => void) | null = null;
  const settle = () => {
    const resolve = done;
    done = null;
    resolve?.(transcript.trim());
  };

  rec.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) transcript += ' ' + r[0].transcript;
    }
  };
  rec.onerror = () => settle();
  rec.onend = () => settle();

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    finish: () =>
      new Promise<string>((resolve) => {
        done = resolve;
        try {
          rec.stop();
        } catch {
          settle();
        }
        // Recognition sometimes never fires onend; do not wait forever.
        window.setTimeout(settle, 2500);
      }),
  };
}
