// The reader's word markup, without a browser.
//
//   node scripts/check-reader.mjs
//
// The chapter is rendered to HTML with React's server renderer and parsed with
// jsdom. What is checked:
//   - the paragraph text is reproduced exactly, which is what keeps highlight
//     character offsets (and therefore saved highlights) correct
//   - every word is addressable and in reading order
//   - page separators appear exactly where the source page changes
//   - a highlight is attached to the words it covers

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const outDir = join(ROOT, 'node_modules', '.cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'reader-harness.mjs');

await build({
  entryPoints: [join(HERE, 'reader-harness.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': ROOT },
  // React's server renderer is CommonJS and needs Node's own resolver.
  external: ['react', 'react-dom', 'react-dom/server'],
  outfile,
  logLevel: 'silent',
});

const { renderToStaticMarkup, ChapterText, buildChapterAudio } = await import(pathToFileURL(outfile).href);

const chapter = {
  title: 'A Chapter',
  paragraphs: [
    'The first page begins here, quietly.',
    'The second page carries on. It has two sentences.',
    'The second page ends with this line.',
  ],
  pageNumbers: [1, 2, 2],
};
const audio = buildChapterAudio(chapter);

const wordsByParagraph = new Map();
for (const word of audio.words) {
  const list = wordsByParagraph.get(word.paragraph) ?? [];
  list.push(word);
  wordsByParagraph.set(word.paragraph, list);
}

// A highlight over "second page" in paragraph 1 (character offsets in that text).
const p1 = chapter.paragraphs[1];
const hStart = p1.indexOf('second page');
const highlight = {
  id: 'h1',
  kind: 'highlight',
  bookId: 'b1',
  chapter: 0,
  paragraph: 1,
  start: hStart,
  end: hStart + 'second page'.length,
  text: 'second page',
  color: 'amber',
  createdAt: 1,
};

const html = renderToStaticMarkup(
  createElement(ChapterText, {
    chapter,
    wordsByParagraph,
    marksByParagraph: new Map([[1, [highlight]]]),
    font: 'literata',
    fontSize: 19,
    lineHeight: 1.8,
  }),
);
const dom = new JSDOM(`<div id="root">${html}</div>`);
const root = dom.window.document.getElementById('root');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

console.log('reader markup:');

check('each paragraph reproduces its text exactly', () => {
  const paragraphs = [...root.querySelectorAll('p[data-p]')];
  assert.equal(paragraphs.length, chapter.paragraphs.length);
  paragraphs.forEach((p, i) => {
    assert.equal(p.textContent, chapter.paragraphs[i], `paragraph ${i} changed the text`);
  });
});

check('every word is a span with an index, in reading order', () => {
  const spans = [...root.querySelectorAll('[data-w]')];
  assert.equal(spans.length, audio.words.length);
  spans.forEach((span, i) => {
    assert.equal(Number(span.dataset.w), i, 'word indexes are not in order');
    // A marked word may also hold the space that follows it, so the highlight is
    // continuous; nothing else may be added.
    assert.equal(span.textContent.replace(/ $/, ''), audio.words[i].text);
  });
});

check('a page separator marks each change of page', () => {
  const separators = [...root.querySelectorAll('[role=separator]')];
  assert.equal(separators.length, 1, 'one divider between the two pages');
  assert.deepEqual(separators.map((s) => s.textContent.trim()), ['Page 2']);
  // The chapter opening already has a heading, so page 1 gets no rule above it.
  const first = root.querySelector('p[data-p="0"]');
  assert.equal(first.closest('.chapter-block').querySelector('[role=separator]'), null);
  // The third paragraph continues page 2, so it gets no separator.
  const third = root.querySelector('p[data-p="2"]');
  assert.equal(third.closest('.chapter-block').querySelector('[role=separator]'), null);
});

check('a highlight is attached to the words it covers', () => {
  const marked = [...root.querySelectorAll('[data-h="h1"]')];
  assert.ok(marked.length >= 2, 'the highlighted words were not marked');
  assert.equal(marked.map((s) => s.textContent).join('').trim(), 'second page');
  for (const span of marked) {
    assert.ok(span.getAttribute('class').includes('word-marked'));
    assert.ok(span.getAttribute('style').includes('background-color'));
  }
});

check('words outside the highlight are untouched', () => {
  const plain = root.querySelector('[data-w="0"]');
  assert.equal(plain.textContent, 'The');
  assert.equal(plain.getAttribute('data-h'), null);
  assert.ok(!plain.getAttribute('class').includes('word-marked'));
});

console.log(`\n${passed} checks passed`);
