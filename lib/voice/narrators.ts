'use client';

// Narration engines. Each one turns text into audio the browser can play:
//  - device:  the speech voices already installed on the device. Nothing is downloaded.
//  - kokoro:  Kokoro-82M, a neural voice model (Apache-2.0). Its weights (about 90 MB) download
//             from Hugging Face once, the first time it is used, and are cached by the browser.
//  - espeak:  eSpeak NG through meSpeak.js (GPL-3). The voice data ships with the app, in /public.

import type { Engine, Gender, ResolvedVoice } from './generic';

export const ENGINE_LABEL: Record<Engine, string> = {
  device: 'Device voices',
  kokoro: 'Kokoro',
  espeak: 'eSpeak NG',
};

export const ENGINE_NOTE: Record<Engine, string> = {
  device: 'Uses the speech voices already on this device. Nothing is downloaded.',
  kokoro: 'Natural neural voices. The voice model (about 90 MB) downloads once, the first time you use it, then runs in your browser.',
  espeak: 'Small and offline. The voice data ships with the app. It sounds robotic.',
};

/** Plays one piece of text. `done` resolves true when it finished, and false if it was stopped or failed. */
export interface Clip {
  done: Promise<boolean>;
  stop(): void;
}

export interface Narrator {
  engine: Engine;
  gender: Gender;
  label: string;
  /** Loads the engine (and downloads its model, if needed). Call before `speak`. */
  prepare(onStatus?: (message: string) => void): Promise<void>;
  speak(text: string): Clip;
}

/* ---------- Shared clip helpers ---------- */

/** Plays an audio URL. Blob URLs are released when playback ends. */
function playUrl(url: string): Clip {
  const audio = new Audio(url);
  let finished = false;
  let settle!: (ok: boolean) => void;
  const done = new Promise<boolean>((resolve) => (settle = resolve));
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    audio.onended = null;
    audio.onerror = null;
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    settle(ok);
  };
  audio.onended = () => finish(true);
  audio.onerror = () => finish(false);
  audio.play().catch(() => finish(false));
  return {
    done,
    stop() {
      audio.pause();
      finish(false);
    },
  };
}

/** A clip whose audio is produced asynchronously (model inference). Stopping during inference discards the result. */
function asyncClip(produce: () => Promise<string>): Clip {
  let stopped = false;
  let inner: Clip | null = null;
  let finished = false;
  let settle!: (ok: boolean) => void;
  const done = new Promise<boolean>((resolve) => (settle = resolve));
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    settle(ok);
  };
  produce()
    .then((url) => {
      if (stopped) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        finish(false);
        return;
      }
      inner = playUrl(url);
      inner.done.then(finish);
    })
    .catch(() => finish(false));
  return {
    done,
    stop() {
      stopped = true;
      inner?.stop();
      finish(false);
    },
  };
}

/* ---------- Device voices ---------- */

function deviceNarrator(gender: Gender, voice: ResolvedVoice): Narrator {
  return {
    engine: 'device',
    gender,
    label: voice.label,
    async prepare() {},
    speak(text) {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      if (voice.voice) {
        u.voice = voice.voice;
        u.lang = voice.voice.lang;
      } else {
        u.lang = 'en-US';
      }
      u.pitch = voice.pitch;
      u.rate = voice.rate;

      let finished = false;
      let settle!: (ok: boolean) => void;
      const done = new Promise<boolean>((resolve) => (settle = resolve));
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        settle(ok);
      };
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      synth.speak(u);
      return {
        done,
        stop() {
          synth.cancel();
          finish(false);
        },
      };
    },
  };
}

/* ---------- Kokoro ---------- */

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICE: Record<Gender, { id: string; label: string }> = {
  masculine: { id: 'am_michael', label: 'Michael (Kokoro, deep American male)' },
  feminine: { id: 'af_heart', label: 'Heart (Kokoro, American female)' },
};

interface KokoroModel {
  generate(text: string, options: { voice: string }): Promise<{ toBlob(): Blob }>;
}

let kokoroLoading: Promise<KokoroModel> | null = null;

function loadKokoro(onStatus?: (message: string) => void): Promise<KokoroModel> {
  if (!kokoroLoading) {
    kokoroLoading = import('kokoro-js')
      .then(({ KokoroTTS }) =>
        KokoroTTS.from_pretrained(KOKORO_MODEL, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (p.status === 'progress' && typeof p.progress === 'number') {
              onStatus?.(`Downloading the Kokoro voice model… ${Math.round(p.progress)}%`);
            }
          },
        }),
      )
      .then((tts) => tts as unknown as KokoroModel)
      .catch((e) => {
        kokoroLoading = null; // allow a retry after a failed download
        throw e;
      });
  }
  return kokoroLoading;
}

function kokoroNarrator(gender: Gender): Narrator {
  const voice = KOKORO_VOICE[gender];
  return {
    engine: 'kokoro',
    gender,
    label: voice.label,
    async prepare(onStatus) {
      onStatus?.('Loading the Kokoro voice…');
      await loadKokoro(onStatus);
    },
    speak(text) {
      return asyncClip(async () => {
        const tts = await loadKokoro();
        const audio = await tts.generate(text, { voice: voice.id });
        return URL.createObjectURL(audio.toBlob());
      });
    },
  };
}

/* ---------- eSpeak NG (meSpeak) ---------- */

declare global {
  interface Window {
    meSpeak?: MeSpeak;
  }
}

interface MeSpeak {
  loadConfig(config: object): void;
  loadVoice(voice: object): void;
  speak(text: string, options: Record<string, unknown>): string;
}

const ESPEAK_VOICE: Record<Gender, { variant: string; pitch: number; speed: number; label: string }> = {
  masculine: { variant: 'm3', pitch: 15, speed: 140, label: 'eSpeak NG, deep male (m3)' },
  feminine: { variant: 'f3', pitch: 50, speed: 160, label: 'eSpeak NG, female (f3)' },
};

let espeakLoading: Promise<MeSpeak> | null = null;

/** Loads the generated meSpeak script from /public. It is not bundled, so the bundler never reads it. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.head.appendChild(el);
  });
}

function loadEspeak(): Promise<MeSpeak> {
  if (!espeakLoading) {
    espeakLoading = (async () => {
      if (!window.meSpeak) await loadScript('/mespeak/mespeak.js');
      const meSpeak = window.meSpeak;
      if (!meSpeak) throw new Error('meSpeak did not load');
      const [config, voice] = await Promise.all([
        fetch('/mespeak/mespeak_config.json').then((r) => {
          if (!r.ok) throw new Error('eSpeak config not found');
          return r.json();
        }),
        fetch('/mespeak/voices/en/en-us.json').then((r) => {
          if (!r.ok) throw new Error('eSpeak voice not found');
          return r.json();
        }),
      ]);
      meSpeak.loadConfig(config);
      meSpeak.loadVoice(voice);
      return meSpeak;
    })().catch((e) => {
      espeakLoading = null;
      throw e;
    });
  }
  return espeakLoading;
}

function espeakNarrator(gender: Gender): Narrator {
  const v = ESPEAK_VOICE[gender];
  return {
    engine: 'espeak',
    gender,
    label: v.label,
    async prepare() {
      await loadEspeak();
    },
    speak(text) {
      return asyncClip(async () => {
        const meSpeak = await loadEspeak();
        // rawdata 'mime' returns a WAV data URL, which playUrl can play directly.
        return meSpeak.speak(text, {
          voice: 'en/en-us',
          variant: v.variant,
          pitch: v.pitch,
          speed: v.speed,
          amplitude: 110,
          rawdata: 'mime',
        });
      });
    },
  };
}

/* ---------- Choosing a narrator ---------- */

export function makeNarrator(
  engine: Engine,
  gender: Gender,
  device: Record<Gender, ResolvedVoice> | null,
  deviceSupported: boolean,
): Narrator | null {
  if (engine === 'kokoro') return kokoroNarrator(gender);
  if (engine === 'espeak') return espeakNarrator(gender);
  if (!device || !deviceSupported) return null;
  return deviceNarrator(gender, device[gender]);
}

/**
 * Reads the parts one after another, so long chapters do not hit a single-clip limit.
 * `onStart` fires with each part's index. `onDone(true)` means every part was read.
 * `onDone(false)` means it was stopped or failed. The returned function stops reading.
 */
export function readAloud(
  parts: string[],
  narrator: Narrator,
  cb: { onStart?: (index: number) => void; onDone: (completed: boolean) => void },
): () => void {
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();

  // Device voices queue their own speech, so each part is made when it is needed.
  // Model engines make the next part while the current one plays, so there is no silent gap.
  const lookahead = narrator.engine !== 'device';
  let stopped = false;
  let finished = false;
  let current: Clip | null = null;
  let nextIndex = 0;
  const pending: { index: number; clip: Clip }[] = [];

  const finish = (completed: boolean) => {
    if (finished) return;
    finished = true;
    cb.onDone(completed);
  };
  const halt = () => {
    stopped = true;
    for (const p of pending) p.clip.stop();
    pending.length = 0;
  };
  const makeClip = () => {
    while (!stopped && nextIndex < parts.length) {
      const index = nextIndex++;
      if (!parts[index].trim()) continue;
      pending.push({ index, clip: narrator.speak(parts[index]) });
      return;
    }
  };

  const next = async () => {
    if (stopped) return;
    if (pending.length === 0) makeClip();
    const item = pending.shift();
    if (!item) {
      stopped = true;
      finish(true);
      return;
    }
    current = item.clip;
    cb.onStart?.(item.index);
    if (lookahead) {
      // A timer, not a direct call, so this part's audio starts before the next part is generated.
      setTimeout(() => {
        if (pending.length === 0) makeClip();
      }, 0);
    }
    const ok = await item.clip.done;
    if (stopped) return;
    if (!ok) {
      halt();
      finish(false);
      return;
    }
    void next();
  };

  void next();

  return () => {
    current?.stop();
    halt();
    finish(false);
  };
}
