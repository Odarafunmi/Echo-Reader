#!/usr/bin/env node
/**
 * check-voices — proves the device-voice logic without a browser.
 *
 * The functions under test are pure and take the voice array as an argument, so
 * they can be driven directly from Node.
 */
import assert from 'node:assert/strict';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
  }
}

const { listVoices, resolveVoices, resolveChosen, optionToResolved } = await import(
  '../lib/voice/generic.ts'
);

const v = (name, voiceURI, lang, extra = {}) => ({
  name,
  voiceURI,
  lang,
  localService: true,
  default: false,
  ...extra,
});

// A realistic mixed set: some English, some not, one device default, one duplicate URI.
const DEVICE = [
  v('Amelie', 'com.apple.voice.compact.fr-FR.amelie', 'fr-FR'),
  v('Microsoft Zira', 'Microsoft Zira Desktop', 'en-US'),
  v('Google UK English Female', 'Google UK English Female', 'en-GB'),
  v('Samantha', 'com.apple.voice.compact.en-US.samantha', 'en-US', { default: true }),
  v('Microsoft David', 'Microsoft David Desktop', 'en-US'),
  v('Samantha', 'com.apple.voice.compact.en-US.samantha', 'en-US'), // duplicate, must be dropped
  v('Kyoko', 'com.apple.voice.compact.ja-JP.kyoko', 'ja-JP'),
];

check('lists every installed voice instead of collapsing them to two', () => {
  const options = listVoices(DEVICE);
  assert.equal(options.length, 6, 'expected 6 unique voices');
  assert.ok(options.some((o) => o.uri === 'Microsoft David Desktop'), 'David must be listed');
  assert.ok(options.some((o) => o.uri === 'com.apple.voice.compact.ja-JP.kyoko'), 'Kyoko must be listed');
  assert.ok(options.every((o) => o.voice), 'each option keeps a handle to the real voice object');
});

check('the device default sorts first, then English, then other languages', () => {
  const options = listVoices(DEVICE);
  assert.equal(options[0].name, 'Samantha', 'the default voice should lead the list');
  assert.ok(options[0].isDefault, 'and be marked as the default');
  assert.deepEqual(
    options.map((o) => o.name),
    ['Samantha', 'Google UK English Female', 'Microsoft David', 'Microsoft Zira', 'Amelie', 'Kyoko'],
    'expected default, then English alphabetically, then the non-English voices',
  );
  const en = options.slice(1, 4).map((o) => o.lang);
  assert.ok(en.every((l) => l.startsWith('en')), 'the English group should come before French and Japanese');
});

check('the chosen URI resolves to that exact voice', () => {
  const options = listVoices(DEVICE);
  const chosen = resolveChosen(options, 'Microsoft David Desktop', resolveVoices(DEVICE), 'feminine');
  assert.equal(chosen.label, 'Microsoft David');
  assert.equal(chosen.voice.name, 'Microsoft David');
  assert.equal(chosen.pitch, 1, 'a real device voice is used at its natural pitch');
});

check('a picked voice that is no longer installed falls back to a working voice', () => {
  const options = listVoices(DEVICE);
  const chosen = resolveChosen(options, 'urn:voice:uninstalled', resolveVoices(DEVICE), 'feminine');
  assert.equal(chosen.gender, 'feminine');
  assert.ok(chosen.voice, 'it must still resolve to a real voice, never null');
  assert.ok(
    options.some((o) => o.uri === chosen.voice.voiceURI),
    'the fallback must be one of the voices this device actually has',
  );
});

check('the legacy gender preference still resolves', () => {
  const options = listVoices(DEVICE);
  const chosen = resolveChosen(options, null, resolveVoices(DEVICE), 'masculine');
  assert.equal(chosen.gender, 'masculine');
  assert.ok(chosen.voice, 'a masculine voice is still available as a fallback');
});

check('optionToResolved keeps a working utterance handle', () => {
  const [option] = listVoices(DEVICE);
  const resolved = optionToResolved(option);
  assert.equal(resolved.voice, option.voice);
  assert.ok(resolved.matched);
});

let failed = 0;
for (const [status, name, message] of results) {
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${message ? `\n    ${message}` : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`\n${results.length - failed} passed, ${failed} failed (device voices)`);
process.exit(failed ? 1 : 0);
