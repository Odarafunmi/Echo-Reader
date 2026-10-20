// The narration engine, against a fake speech synthesiser.
//
//   node scripts/check-engine.mjs
//
// Requirement: pause must resume from the exact word that was being spoken, and
// seeking or changing speed must restart from that word rather than the top of the
// chapter. That logic lives in lib/audio/engine.ts, and it can be checked without a
// browser by driving the same events the browser fires: `start`, `boundary`, `end`.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

/* ---------- a window, and a speech synthesiser that does as it is told ---------- */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.MediaMetadata = window.MediaMetadata ?? class { constructor(init) { Object.assign(this, init); } };

const spoken = [];
const synth = {
  speaking: false,
  pending: false,
  last: null,
  speak(utterance) {
    spoken.push(utterance);
    this.last = utterance;
    this.speaking = true;
  },
  cancel() {
    this.speaking = false;
    this.pending = false;
    // What Chrome does to the utterance that was speaking.
    const previous = this.last;
    this.last = null;
    previous?.onerror?.({ error: 'canceled' });
  },
};
Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
// jsdom has no speech synthesis at all, so the utterance is a stub too: the engine
// only sets voice, lang, pitch and rate on it, and then hands it to `speak`.
class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.pitch = 1;
    this.lang = '';
    this.voice = null;
  }
}
Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
globalThis.SpeechSynthesisUtterance = FakeUtterance;

const mediaSession = {
  metadata: null,
  playbackState: 'none',
  position: null,
  setActionHandler() {},
  setPositionState(state) {
    this.position = state;
  },
};
Object.defineProperty(globalThis.navigator, 'mediaSession', { value: mediaSession, configurable: true });
Object.defineProperty(globalThis.navigator, 'wakeLock', {
  value: { request: async () => ({ released: false, release: async () => undefined, addEventListener() {} }) },
  configurable: true,
});
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => undefined;

/* ---------- the engine, bundled for Node ---------- */

const outDir = join(ROOT, 'node_modules', '.cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'engine-harness.mjs');
await build({
  entryPoints: [join(HERE, 'engine-harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { '@': ROOT },
  outfile,
  logLevel: 'silent',
});
const { NarrationEngine, buildChapterAudio } = await import(pathToFileURL(outfile).href);

const chapter = {
  title: 'A Chapter',
  paragraphs: [
    'The lighthouse keeper wrote a letter to the harbour master every winter, and every winter the sea answered her with the same slow breathing against the rocks.',
    'She kept the lamp burning through the long nights, and the ships came home.',
  ],
  pageNumbers: [1, 2],
};
const audio = buildChapterAudio(chapter);

const voice = { gender: 'feminine', label: 'Test voice', voice: null, pitch: 1, rate: 1, matched: false };

function makeEngine(startWord = 0) {
  const words = [];
  const states = [];
  const engine = new NarrationEngine({
    audio,
    voice,
    speed: 1,
    startWord,
    bookTitle: 'A Book',
    chapterTitle: 'A Chapter',
    onWord: (index) => words.push(index),
    onState: (state) => states.push(state),
    onFinish: () => states.push({ finished: true }),
    onError: (message) => states.push({ error: message }),
  });
  return { engine, words, states };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The text an utterance that starts at `word` should contain. */
function textFrom(word) {
  const chunk = audio.chunks.find((c) => word >= c.firstWord && word <= c.lastWord);
  const position = word - chunk.firstWord;
  return chunk.text.slice(chunk.words[position].start);
}

/** The character offset of `word` inside the utterance that starts at `from`. */
function offsetOf(word, from) {
  const chunk = audio.chunks.find((c) => word >= c.firstWord && word <= c.lastWord);
  const start = chunk.words[from - chunk.firstWord].start;
  return chunk.words[word - chunk.firstWord].start - start;
}

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

console.log('narration engine:');

await check('play speaks the chunk from the requested word', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  assert.equal(spoken.length, 1, 'nothing was spoken');
  assert.equal(spoken[0].text, textFrom(0));
  assert.equal(engine.isPlaying, true);
  engine.dispose();
});

await check('a word boundary moves the highlight to that word', async () => {
  spoken.length = 0;
  const { engine, words } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  spoken[0].onstart();
  spoken[0].onboundary({ name: 'word', charIndex: offsetOf(3, 0) });
  assert.equal(engine.currentWord, 3);
  assert.ok(words.includes(3));
  engine.dispose();
});

await check('pause stops the voice and remembers the word', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  spoken[0].onstart();
  spoken[0].onboundary({ name: 'word', charIndex: offsetOf(4, 0) });
  engine.pause();
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.currentWord, 4, 'the paused word was lost');
  engine.dispose();
});

await check('resume speaks from the paused word, not from the start', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  spoken[0].onstart();
  spoken[0].onboundary({ name: 'word', charIndex: offsetOf(6, 0) });
  engine.pause();
  engine.play();
  await sleep(120);
  const resumed = spoken[spoken.length - 1];
  assert.equal(resumed.text, textFrom(6), 'resume restarted somewhere else');
  engine.dispose();
});

await check('the 10-second buttons move by about ten seconds of words', async () => {
  const { engine } = makeEngine(0);
  const before = engine.currentWord;
  engine.skip(10);
  assert.ok(engine.currentWord - before >= 20, `forward 10s moved ${engine.currentWord - before} words`);
  engine.skip(-10);
  assert.equal(engine.currentWord, before, 'back 10s did not return');
  engine.dispose();
});

await check('seeking while playing restarts at the new word', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  engine.seekToWord(12);
  await sleep(120);
  assert.equal(spoken[spoken.length - 1].text, textFrom(12));
  engine.dispose();
});

await check('changing speed re-speaks the word at the new rate', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  engine.seekToWord(2);
  await sleep(120);
  engine.setSpeed(2);
  await sleep(120);
  const last = spoken[spoken.length - 1];
  assert.ok(last.rate > 1.5, `rate was ${last.rate}`);
  assert.equal(engine.currentWord, 2, 'changing speed moved the position');
  engine.dispose();
});

await check('the end of the last chunk finishes the chapter', async () => {
  spoken.length = 0;
  const { engine, states } = makeEngine(audio.words.length - 1);
  engine.play(audio.words.length - 1);
  await sleep(120);
  const last = spoken[spoken.length - 1];
  last.onstart();
  last.onend();
  assert.ok(states.some((s) => s.finished), 'the chapter did not finish');
  assert.equal(engine.isPlaying, false);
  engine.dispose();
});

await check('a stopped engine ignores stale events from the old utterance', async () => {
  spoken.length = 0;
  const { engine, states } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  const first = spoken[0];
  engine.seekToWord(10);
  await sleep(120);
  first.onend();
  assert.ok(!states.some((s) => s.finished), 'a cancelled utterance ended the chapter');
  assert.equal(engine.isPlaying, true, 'the newer utterance was stopped by a stale event');
  engine.dispose();
});

await check('resync restarts a voice the browser suspended', async () => {
  spoken.length = 0;
  const { engine } = makeEngine(0);
  engine.play(0);
  await sleep(120);
  // The OS suspended speech with no event: the synthesiser is not speaking, but
  // the engine still believes it is playing.
  synth.speaking = false;
  engine.resync();
  await sleep(120);
  assert.equal(spoken.length, 2, 'resync did not re-speak');
  engine.dispose();
});

console.log(`\n${passed} checks passed`);
