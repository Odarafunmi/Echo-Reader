'use client';

// Built-in narration voices. They use the speech voices installed on this device (macOS, Windows,
// Android, Chrome's Google voices), so nothing is sent to a server and no API key is needed.
// The browser does not report a voice's gender, so each gender is matched by voice name. If the
// device has no voice that matches a gender, that gender uses the device's default voice with a
// different pitch so the two options still sound distinct.

import { useEffect, useState } from 'react';

export type Gender = 'masculine' | 'feminine';
export const GENDERS: Gender[] = ['masculine', 'feminine'];

export const GENDER_LABEL: Record<Gender, string> = {
  masculine: 'Masculine voice',
  feminine: 'Feminine voice',
};

/** Names of common system voices. Used only to pick a voice for each gender. */
const FEMALE_NAME =
  /\b(female|samantha|karen|moira|tessa|fiona|victoria|zira|hazel|susan|aria|jenny|ana|libby|sonia|catherine|serena|kate|sara|allison|ava|joanna|kendra|kimberly|salli|emma|amy|ivy|olivia|nicole|sky|google us english)\b/i;
const MALE_NAME =
  /\b(male|daniel|alex|fred|tom|david|mark|james|george|guy|ryan|liam|eddy|oliver|thomas|aaron|arthur|brian|matthew|justin|joey|stephen|kevin|rishi)\b/i;

/** Fallback pitch and rate, used when no installed voice matches the gender. */
const FALLBACK: Record<Gender, { pitch: number; rate: number }> = {
  masculine: { pitch: 0.82, rate: 0.95 },
  feminine: { pitch: 1.18, rate: 1 },
};

export interface ResolvedVoice {
  gender: Gender;
  /** Voice name shown to the user, or a generic label when the device has no matching voice. */
  label: string;
  /** The installed voice, or null when the browser has not reported any voices. */
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
  /** True when the voice's name matched this gender. */
  matched: boolean;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function matchesGender(name: string, gender: Gender): boolean {
  const female = FEMALE_NAME.test(name);
  const male = MALE_NAME.test(name);
  if (female === male) return false; // ambiguous or unknown
  return gender === 'feminine' ? female : male;
}

/** Chooses one voice per gender from the device's voices. Pure, so it can be tested without a browser. */
export function resolveVoices(all: SpeechSynthesisVoice[]): Record<Gender, ResolvedVoice> {
  const english = all.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length > 0 ? english : all;
  const fallbackVoice = pool.find((v) => v.default) ?? pool[0] ?? null;

  const result = {} as Record<Gender, ResolvedVoice>;
  for (const gender of GENDERS) {
    const match = pool.find((v) => matchesGender(v.name, gender)) ?? null;
    result[gender] = match
      ? { gender, label: match.name, voice: match, pitch: 1, rate: 1, matched: true }
      : {
          gender,
          label: `${GENDER_LABEL[gender]} (device default)`,
          voice: fallbackVoice,
          ...FALLBACK[gender],
          matched: false,
        };
  }
  return result;
}

/** Loads the device voices, which some browsers report only after `voiceschanged`. */
export function useGenericVoices(): { resolved: Record<Gender, ResolvedVoice> | null; supported: boolean } {
  const [resolved, setResolved] = useState<Record<Gender, ResolvedVoice> | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!speechSupported()) {
      setSupported(false);
      setResolved(resolveVoices([]));
      return;
    }
    const synth = window.speechSynthesis;
    const update = () => setResolved(resolveVoices(synth.getVoices()));
    update();
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);

  return { resolved, supported };
}

const PREF_KEY = 'echo-shelf:narration-voice';

/** The gender the user chose for narration. Defaults to feminine. */
export function getNarrationPreference(): Gender {
  try {
    return localStorage.getItem(PREF_KEY) === 'masculine' ? 'masculine' : 'feminine';
  } catch {
    return 'feminine';
  }
}

export function saveNarrationPreference(g: Gender) {
  try {
    localStorage.setItem(PREF_KEY, g);
  } catch {
    // Storage can be unavailable (private mode). The choice then lasts for this visit only.
  }
}

export function useNarrationPreference(): [Gender, (g: Gender) => void] {
  const [gender, setGender] = useState<Gender>('feminine');
  useEffect(() => {
    setGender(getNarrationPreference());
  }, []);
  const update = (g: Gender) => {
    setGender(g);
    saveNarrationPreference(g);
  };
  return [gender, update];
}

/** One installed voice on this device, as a row the user can pick. */
export interface VoiceOption {
  /** `SpeechSynthesisVoice.voiceURI`, the stable id used to remember the choice. */
  uri: string;
  name: string;
  lang: string;
  /** True when the voice is installed locally rather than fetched by the browser. */
  local: boolean;
  isDefault: boolean;
  voice: SpeechSynthesisVoice | null;
}

function toOption(v: SpeechSynthesisVoice): VoiceOption {
  return {
    uri: v.voiceURI,
    name: v.name,
    lang: v.lang || 'unknown',
    local: v.localService,
    isDefault: v.default,
    voice: v,
  };
}

/**
 * Every voice the device reports, de-duplicated by URI and ordered so the useful
 * ones come first: the default, then the rest of the user's language, then English,
 * then everything else alphabetically.
 */
export function listVoices(all: SpeechSynthesisVoice[], preferredLang = 'en'): VoiceOption[] {
  const seen = new Set<string>();
  const options: VoiceOption[] = [];
  for (const v of all) {
    if (!v || !v.voiceURI || seen.has(v.voiceURI)) continue;
    seen.add(v.voiceURI);
    options.push(toOption(v));
  }
  const norm = (l: string) => l.toLowerCase();
  const nav = norm(navigator?.language || preferredLang).slice(0, 2);
  const rank = (o: VoiceOption) => {
    const l = norm(o.lang).slice(0, 2);
    if (o.isDefault) return 0;
    if (l === nav) return 1;
    if (l === 'en') return 2;
    return 3;
  };
  return options.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang),
  );
}

const URI_KEY = 'echo-shelf:narration-voice-uri';

/** The remembered voice URI, or null to use the gender default. */
export function getChosenVoiceUri(): string | null {
  try {
    return window.localStorage.getItem(URI_KEY);
  } catch {
    return null;
  }
}

export function saveChosenVoiceUri(uri: string | null) {
  try {
    if (uri) window.localStorage.setItem(URI_KEY, uri);
    else window.localStorage.removeItem(URI_KEY);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
}

/** Wraps a specific device voice in the shape the reader already speaks aloud with. */
export function optionToResolved(o: VoiceOption): ResolvedVoice {
  const gender: Gender = matchesGender(o.name, 'masculine') ? 'masculine' : 'feminine';
  return { gender, label: o.name, voice: o.voice, pitch: 1, rate: 1, matched: true };
}

/**
 * Works out which voice will actually be used: the one the user picked when it is
 * still installed, otherwise the gender default. An old install stored a gender
 * rather than a URI, which is read as "keep using the default".
 */
export function resolveChosen(
  options: VoiceOption[],
  uri: string | null,
  fallbacks: Record<Gender, ResolvedVoice> | null,
  legacyGender: Gender = 'feminine',
): ResolvedVoice | null {
  if (uri) {
    const found = options.find((o) => o.uri === uri);
    if (found) return optionToResolved(found);
  }
  return fallbacks ? fallbacks[legacyGender] : null;
}

/** Everything the voice UI and the reader need, in one place. */
export function useNarration(): {
  supported: boolean;
  loading: boolean;
  options: VoiceOption[];
  chosen: ResolvedVoice | null;
  chosenUri: string | null;
  choose: (uri: string | null) => void;
} {
  const [options, setOptions] = useState<VoiceOption[]>([]);
  const [fallbacks, setFallbacks] = useState<Record<Gender, ResolvedVoice> | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<Gender>('feminine');
  const [supported, setSupported] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLegacy(getNarrationPreference());
    setUri(getChosenVoiceUri());
    if (!speechSupported()) {
      setSupported(false);
      setFallbacks(resolveVoices([]));
      setLoaded(true);
      return;
    }
    const synth = window.speechSynthesis;
    const update = () => {
      const all = synth.getVoices();
      setOptions(listVoices(all));
      setFallbacks(resolveVoices(all));
      setLoaded(true);
    };
    update();
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);

  const choose = (next: string | null) => {
    setUri(next);
    saveChosenVoiceUri(next);
  };

  const chosen = fallbacks ? resolveChosen(options, uri, fallbacks, legacy) : null;
  return { supported, loading: !loaded, options, chosen, chosenUri: uri, choose };
}

function utteranceFor(text: string, v: ResolvedVoice): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  if (v.voice) {
    u.voice = v.voice;
    u.lang = v.voice.lang;
  } else {
    u.lang = 'en-US';
  }
  u.pitch = v.pitch;
  u.rate = v.rate;
  return u;
}

/**
 * Reads the parts one after another, so long chapters do not hit the browser's per-utterance limit.
 * `onStart` fires with each part's index. `onDone(true)` means the whole list was read, and
 * `onDone(false)` means it was stopped or failed. The returned function stops reading.
 */
export function readAloud(
  parts: string[],
  v: ResolvedVoice,
  cb: { onStart?: (index: number) => void; onDone: (completed: boolean) => void },
): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();

  let index = 0;
  let stopped = false;
  let finished = false;
  const finish = (completed: boolean) => {
    if (finished) return;
    finished = true;
    cb.onDone(completed);
  };

  const next = () => {
    if (stopped) return;
    while (index < parts.length && !parts[index].trim()) index++;
    if (index >= parts.length) {
      stopped = true;
      finish(true);
      return;
    }
    const current = index++;
    cb.onStart?.(current);
    const u = utteranceFor(parts[current], v);
    u.onend = next;
    u.onerror = () => {
      if (stopped) return;
      stopped = true;
      finish(false);
    };
    synth.speak(u);
  };

  next();

  return () => {
    stopped = true;
    synth.cancel();
    finish(false);
  };
}

/** Speaks one short phrase, for previews. Returns a function that stops it. */
export function speakPreview(text: string, v: ResolvedVoice, onDone?: () => void): () => void {
  return readAloud([text], v, { onDone: () => onDone?.() });
}
