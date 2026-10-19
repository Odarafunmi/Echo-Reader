// check-scene-pause — exercises the pause signal that freezes the 3D background
// while a file is being parsed. The module is plain TypeScript with no JSX, so
// Node can import it directly.
//
//   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-scene-pause.mjs

import assert from 'node:assert/strict';
import {
  isScenePaused,
  pauseScene,
  resumeScene,
  subscribeScenePause,
} from '@/lib/scene/bus';

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message.split('\n')[0]]);
  }
}

check('starts unpaused, so the background animates normally', () => {
  assert.equal(isScenePaused(), false);
});

check('pauseScene freezes it and tells subscribers', () => {
  const seen = [];
  const unsubscribe = subscribeScenePause((v) => seen.push(v));
  pauseScene();
  assert.equal(isScenePaused(), true);
  assert.deepEqual(seen, [true], 'the scene should be told to stop');
  unsubscribe();
});

check('pausing twice does not fire twice', () => {
  const seen = [];
  const unsubscribe = subscribeScenePause((v) => seen.push(v));
  pauseScene();
  pauseScene();
  assert.deepEqual(seen, [], 'an unchanged flag should not re-render anything');
  unsubscribe();
});

check('resumeScene restarts it', () => {
  const seen = [];
  const unsubscribe = subscribeScenePause((v) => seen.push(v));
  resumeScene();
  assert.equal(isScenePaused(), false);
  assert.deepEqual(seen, [false]);
  unsubscribe();
});

check('unsubscribing stops notifications, so an unmounted scene is not called', () => {
  const seen = [];
  const unsubscribe = subscribeScenePause((v) => seen.push(v));
  unsubscribe();
  pauseScene();
  resumeScene();
  assert.deepEqual(seen, []);
  assert.equal(isScenePaused(), false, 'and the flag is left in its normal state');
});

check('a pause that outlives a failed import still resumes', () => {
  pauseScene();
  try {
    throw new Error('simulated import failure');
  } catch {
    // Shelf resumes in a finally block; this mirrors that shape.
  } finally {
    resumeScene();
  }
  assert.equal(isScenePaused(), false, 'a failed import must not leave the page frozen');
});

let failed = 0;
for (const [status, name, message] of results) {
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${message ? `\n    ${message}` : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`${results.length - failed} checks passed`);
process.exit(failed ? 1 : 0);
