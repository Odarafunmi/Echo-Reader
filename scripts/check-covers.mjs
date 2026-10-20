// Cover selection and validation, without a browser.
//
//   node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/check-covers.mjs
//
// The drawing functions need a canvas and are exercised by hand in the app; what is
// tested here is the decision-making that sits around them: which palette colour a
// book gets, whether a rendered first page counts as blank, and whether the palette
// is legible with white text.

import assert from 'node:assert/strict';
import {
  COVER_COLORS,
  analyzePixels,
  chooseCoverColor,
  contrastRatio,
  isBlankPage,
  isValidCoverDataUrl,
  wrapLines,
} from '@/lib/covers';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

/** Builds RGBA pixels from a lightness function; 100x100 by default. */
function pixels(width, height, lightness) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const l = lightness(i);
    data[i * 4] = l;
    data[i * 4 + 1] = l;
    data[i * 4 + 2] = l;
    data[i * 4 + 3] = 255;
  }
  return data;
}

console.log('covers:');

check('a blank white page is rejected as a cover', () => {
  const stats = analyzePixels(pixels(100, 100, () => 255));
  assert.ok(stats.nearWhite > 0.9, 'white pixels not measured as white');
  assert.equal(isBlankPage(stats), true);
});

check('a page with text on it is accepted', () => {
  // 6% of pixels are dark "ink", the rest paper.
  const stats = analyzePixels(pixels(100, 100, (i) => (i % 17 === 0 ? 20 : 250)));
  assert.equal(isBlankPage(stats), false);
});

check('a flat pale wash is rejected even when it is not pure white', () => {
  const stats = analyzePixels(pixels(100, 100, () => 244));
  assert.equal(isBlankPage(stats), true);
});

check('a page that failed to render (flat colour) is rejected', () => {
  assert.equal(isBlankPage(analyzePixels(pixels(100, 100, () => 90))), true);
  assert.equal(isBlankPage(analyzePixels(new Uint8ClampedArray(0))), true);
});

check('transparent areas count as paper, not ink', () => {
  const data = new Uint8ClampedArray(100 * 100 * 4); // all zeroes: transparent
  assert.equal(isBlankPage(analyzePixels(data)), true);
});

check('white text has strong contrast on every palette colour', () => {
  assert.equal(COVER_COLORS.length, 8, 'the palette should have eight colours');
  for (const { name, hex } of COVER_COLORS) {
    const ratio = contrastRatio('#FFFFFF', hex);
    assert.ok(ratio >= 7, `${name} only reaches ${ratio.toFixed(1)}:1 with white text`);
  }
});

check('a shelf of books gets a different colour for each of the eight', () => {
  const used = [];
  for (let i = 0; i < 8; i++) {
    const choice = chooseCoverColor(`Book number ${i}`, used);
    assert.ok(!used.includes(choice), `colour ${choice} repeated before the palette ran out`);
    used.push(choice);
  }
  assert.equal(new Set(used).size, 8);
  // The ninth starts the palette again, still deterministically.
  assert.equal(chooseCoverColor('Book number 0', used), chooseCoverColor('Book number 0', []));
});

check('the same book always gets the same colour', () => {
  assert.equal(chooseCoverColor('The Long Road'), chooseCoverColor('The Long Road'));
});

check('only image data URLs are accepted as covers', () => {
  assert.equal(isValidCoverDataUrl('data:image/jpeg;base64,AAAA'), true);
  assert.equal(isValidCoverDataUrl('data:image/png;base64,AAAA'), true);
  assert.equal(isValidCoverDataUrl('data:text/html;base64,AAAA'), false);
  assert.equal(isValidCoverDataUrl('https://example.com/x.jpg'), false);
  assert.equal(isValidCoverDataUrl(undefined), false);
});

check('titles wrap at the width they are measured against', () => {
  const measure = (text) => text.length * 10; // 10px per character
  assert.deepEqual(wrapLines(measure, 'The Quiet Sea', 80), ['The', 'Quiet', 'Sea']);
  assert.deepEqual(wrapLines(measure, 'One', 80), ['One']);
  assert.deepEqual(wrapLines(measure, '', 80), []);
});

console.log(`\n${passed} checks passed`);
