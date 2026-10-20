// The narration text model, without a browser.
//
//   node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/check-audio.mjs
//
// What matters: every word is addressable, chunks cover the words in order without
// gaps or repeats, and the character offsets the browser reports for word boundaries
// map back to the word actually being spoken.

import assert from 'node:assert/strict';
import {
  buildChapterAudio,
  estimateSeconds,
  sentenceRanges,
  tokenizeWords,
  wordAtCharIndex,
  wordsForSeconds,
} from '@/lib/audio/text';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const chapter = {
  title: 'Chapter One',
  pageNumbers: [1, 1, 2],
  paragraphs: [
    'The sea was quiet that morning. Nobody spoke for a while.',
    'A gull crossed the harbour, then another, and the boats began to move.',
    'Later, the wind rose. It carried the smell of rain from the west, and the harbour lights came on one by one.',
  ],
};
const audio = buildChapterAudio(chapter);

console.log('narration text:');

check('sentences are found without losing any text', () => {
  const two = 'The sea was quiet that morning. Nobody spoke for a while.';
  assert.equal(sentenceRanges(two).length, 2, 'a two-sentence paragraph should split');
  for (const p of chapter.paragraphs) {
    const ranges = sentenceRanges(p);
    assert.ok(ranges.length >= 1);
    assert.equal(p.slice(ranges[0].start, ranges[ranges.length - 1].end), p, 'text was dropped');
  }
});

check('every word is indexed once, in reading order', () => {
  const expected = chapter.paragraphs.flatMap((p) => tokenizeWords(p).map((w) => w.text));
  assert.deepEqual(audio.words.map((w) => w.text), expected);
  audio.words.forEach((w, i) => assert.equal(w.index, i));
});

check('words remember their paragraph and source page', () => {
  const pageOf = (text) => audio.words.find((w) => w.text === text).page;
  assert.equal(pageOf('sea'), 1);
  assert.equal(pageOf('Later,'), 2);
  const paragraphOf = (text) => audio.words.find((w) => w.text === text).paragraph;
  assert.equal(paragraphOf('sea'), 0);
  assert.equal(paragraphOf('gull'), 1);
});

check('chunks tile the words with no gaps or overlaps', () => {
  assert.ok(audio.chunks.length >= 3);
  let next = 0;
  for (const chunk of audio.chunks) {
    assert.equal(chunk.firstWord, next, 'a chunk did not start where the last ended');
    assert.ok(chunk.lastWord >= chunk.firstWord);
    assert.equal(chunk.words.length, chunk.lastWord - chunk.firstWord + 1);
    assert.equal(chunk.words[0].index, chunk.firstWord);
    assert.equal(chunk.words[chunk.words.length - 1].index, chunk.lastWord);
    next = chunk.lastWord + 1;
  }
  assert.equal(next, audio.words.length);
});

check('each chunk speaks exactly the words it indexes', () => {
  for (const chunk of audio.chunks) {
    for (const word of chunk.words) {
      const spoken = chunk.text.slice(word.start, word.start + word.length);
      assert.equal(spoken, audio.words[word.index].text, 'offset and word disagree');
    }
  }
});

check('a character boundary maps to the word being spoken', () => {
  const chunk = audio.chunks[0];
  assert.equal(wordAtCharIndex(chunk, 0), chunk.firstWord);
  const second = chunk.words[1];
  assert.equal(wordAtCharIndex(chunk, second.start), second.index);
  assert.equal(wordAtCharIndex(chunk, second.start + 1), second.index);
  const last = chunk.words[chunk.words.length - 1];
  assert.equal(wordAtCharIndex(chunk, chunk.text.length), last.index);
});

check('a long paragraph is split into speakable chunks', () => {
  const long = { title: 'Long', paragraphs: ['word '.repeat(400).trim()] };
  const model = buildChapterAudio(long);
  assert.ok(model.chunks.length > 1, 'a 400-word paragraph should not be one utterance');
  for (const chunk of model.chunks) {
    assert.ok(chunk.text.length <= 700, 'a chunk grew past a sensible utterance size');
  }
});

check('empty paragraphs produce no words', () => {
  const model = buildChapterAudio({ title: 'Empty', paragraphs: ['', '   ', 'One real sentence here.'] });
  assert.equal(model.words.length, 4);
  assert.equal(model.chunks.length, 1);
});

check('skipping ten seconds moves by about ten seconds of words', () => {
  assert.equal(wordsForSeconds(10, 1), 28);
  assert.equal(wordsForSeconds(10, 2), 56);
  assert.equal(wordsForSeconds(10, 0.5), 14);
  assert.ok(Math.abs(estimateSeconds(28, 1) - 10) < 0.01);
});

console.log(`\n${passed} checks passed`);
