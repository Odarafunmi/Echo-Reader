'use client';

// Shared pieces for the built-in narration voices: gender names, the device voice matching,
// and the saved choice. The engines themselves live in narrators.ts.

import { useEffect, useState } from 'react';

export type Gender = 'masculine' | 'feminine';
export const GENDERS: Gender[] = ['masculine', 'feminine'];

export const GENDER_LABEL: Record<Gender, string> = {
  masculine: 'Masculine voice',
  feminine: 'Feminine voice',
};

/** Names of common system voices. Used only to pick a device voice for each gender. */
const FEMALE_NAME =
  /\b(female|samantha|karen|moira|tessa|fiona|victoria|zira|hazel|susan|aria|jenny|ana|libby|sonia|catherine|serena|kate|sara|allison|ava|joanna|kendra|kimberly|salli|emma|amy|ivy|olivia|nicole|sky|google us english)\b/i;
const MALE_NAME =
  /\b(male|daniel|alex|fred|tom|david|mark|james|george|guy|ryan|liam|eddy|oliver|thomas|aaron|arthur|brian|matthew|justin|joey|stephen|kevin|rishi)\b/i;

/** Fallback pitch and rate, used when no device voice matches the gender. */
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

/** Chooses one device voice per gender. Pure, so it can be tested without a browser. */
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
export function useDeviceVoices(): { resolved: Record<Gender, ResolvedVoice> | null; supported: boolean } {
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

/* ---------- Saved choice ---------- */

const GENDER_KEY = 'echo-shelf:narration-voice';
const ENGINE_KEY = 'echo-shelf:narration-engine';

export type Engine = 'device' | 'kokoro' | 'espeak';
export const ENGINES: Engine[] = ['device', 'kokoro', 'espeak'];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode). The choice then lasts for this visit only.
  }
}

/** The engine and gender the user chose for narration. Defaults to device voices, feminine. */
export function useNarrationChoice(): {
  engine: Engine;
  gender: Gender;
  setEngine: (e: Engine) => void;
  setGender: (g: Gender) => void;
} {
  const [engine, setEngineState] = useState<Engine>('device');
  const [gender, setGenderState] = useState<Gender>('feminine');

  useEffect(() => {
    const e = readStored(ENGINE_KEY);
    if (e === 'kokoro' || e === 'espeak' || e === 'device') setEngineState(e);
    setGenderState(readStored(GENDER_KEY) === 'masculine' ? 'masculine' : 'feminine');
  }, []);

  return {
    engine,
    gender,
    setEngine: (e) => {
      setEngineState(e);
      writeStored(ENGINE_KEY, e);
    },
    setGender: (g) => {
      setGenderState(g);
      writeStored(GENDER_KEY, g);
    },
  };
}
