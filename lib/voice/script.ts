// Copy and constants for Voice Studio. Keep the consent text versioned so re-consent is possible later.

export const CONSENT_VERSION = 1;

export const CONSENT_TEXT =
  'I confirm this is my own voice, or that the speaker has given me written permission to clone it. ' +
  'I understand these recordings are used only to create my narration voice in Echo Shelf, ' +
  'and that I can delete them at any time.';

/** Total seconds of recorded script needed before a profile can be verified. */
export const MIN_TOTAL_SECONDS = 60;
/** Upper bound for the whole script. Beyond this, extra recording adds little. */
export const MAX_TOTAL_SECONDS = 180;
/** Upper bound for a single passage clip. */
export const MAX_CLIP_SECONDS = 60;

export interface ScriptPassage {
  id: string;
  title: string;
  hint: string;
  text: string;
}

// Passages cover a range of vowels, consonants and intonation, and read naturally aloud.
export const SCRIPT: ScriptPassage[] = [
  {
    id: 'warm-up',
    title: 'Warm up',
    hint: 'Read at a relaxed, natural pace.',
    text: 'Hello, and welcome. I am going to read a few short passages so Echo Shelf can learn how I sound. There is no need to perform. Just speak the way you would to a friend.',
  },
  {
    id: 'questions',
    title: 'Questions and surprise',
    hint: 'Let your voice rise at the question marks.',
    text: 'Did you remember to bring the map? Wait, is that the lighthouse over there? Oh, I had no idea it was this close to the shore!',
  },
  {
    id: 'numbers',
    title: 'Numbers and dates',
    hint: 'Say the numbers as you would in conversation.',
    text: 'The meeting is on the fourteenth of March at half past nine. We counted 2,375 gulls, 18 boats and three very tired dogs.',
  },
  {
    id: 'story',
    title: 'Narrative',
    hint: 'Read like you are telling a story aloud.',
    text: 'The rain began softly, tapping against the windows of the old library. Mara closed her book, pulled her coat tight, and listened. Somewhere below, a door creaked open, and then everything went quiet again.',
  },
  {
    id: 'emphasis',
    title: 'Emphasis and pauses',
    hint: 'Pause briefly at the commas and dashes.',
    text: 'Read slowly, then quickly. Listen carefully, and then speak clearly. Some ideas need a pause, a breath, and a moment to settle, before the next one arrives.',
  },
  {
    id: 'tongue',
    title: 'Crisp consonants',
    hint: 'Keep the consonants clear without over-pronouncing.',
    text: 'Six sleek swans swam swiftly past the stone bridge. Bright blue bottles glittered on the windowsill, and the thirsty traveller thanked the kind baker.',
  },
];

/** Short phrases for the read-aloud check. One is picked at random so a recording can't simply be replayed. */
export const VERIFY_PHRASES = [
  'Echo Shelf reads my books back in my own voice, one chapter at a time.',
  'Today I am reading slowly, clearly, and in a voice that is truly mine.',
  'Every page I open sounds like me, because I took the time to teach it.',
];

export function pickVerifyPhrase(exclude?: string): string {
  const options = VERIFY_PHRASES.filter((p) => p !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

/** Lower-case words with punctuation removed, used to compare speech recognition output. */
export function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Fraction of the expected words that appear in the transcript, in order-insensitive form. */
export function wordMatchRatio(expected: string, transcript: string): number {
  const want = normaliseWords(expected);
  const have = normaliseWords(transcript);
  if (want.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const w of have) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hits = 0;
  for (const w of want) {
    const n = pool.get(w) ?? 0;
    if (n > 0) {
      hits++;
      pool.set(w, n - 1);
    }
  }
  return hits / want.length;
}

export const VERIFY_THRESHOLD = 0.8;

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
