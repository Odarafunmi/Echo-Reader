// Renders the real ThemeGate and ThemeToggle in a DOM and actually clicks the
// button, which is the only way to catch a toggle that is wired up correctly in
// source but does nothing at runtime.
//
//   node scripts/check-theme-toggle.mjs
//
// esbuild bundles the components (JSX cannot be stripped by Node), jsdom provides
// the DOM, and fake-indexeddb backs the settings store. React is left external so
// the test and the components share one instance and act() works.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import 'fake-indexeddb/auto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true },
);
const { window } = dom;
for (const key of [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
  'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'localStorage', 'MutationObserver', 'SVGElement', 'HTMLInputElement',
  'Text', 'DocumentFragment', 'CSS',
]) {
  if (window[key] === undefined) continue;
  // Some of these are getter-only on Node's globalThis, so define rather than assign.
  Object.defineProperty(globalThis, key, { value: window[key], writable: true, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The bundle has to live inside the project so its external `react` imports resolve.
const outDir = join(ROOT, 'node_modules', '.cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'theme-toggle-harness.mjs');

await build({
  entryPoints: [join(HERE, 'theme-toggle-harness.tsx')],
  bundle: true,
  format: 'esm',
  outfile,
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: { '@': ROOT },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  logLevel: 'error',
});

const { act } = await import('react');
const harness = await import(pathToFileURL(outfile).href);
const { THEME_SCRIPT } = await import(pathToFileURL(join(ROOT, 'lib', 'theme', 'dom.ts')).href);

const html = window.document.documentElement;
const host = window.document.getElementById('root');
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

console.log('theme toggle:');

await check('clicking the button actually changes the theme', async () => {
  let root;
  await act(async () => {
    root = harness.render(host);
  });

  const button = host.querySelector('button');
  assert.ok(button, 'the toggle rendered no button');
  assert.equal(button.getAttribute('aria-label'), 'Switch to light mode');
  assert.notEqual(html.dataset.theme, 'light', 'should not start in light mode');

  await click(button);
  assert.equal(html.dataset.theme, 'light', 'the click did not switch the theme');
  assert.equal(window.localStorage.getItem('echo-shelf.theme'), 'light', 'the choice was not remembered');
  assert.equal(button.getAttribute('aria-label'), 'Switch to dark mode');

  await click(button);
  assert.equal(html.dataset.theme, 'dark', 'the second click did not switch back');
  assert.equal(window.localStorage.getItem('echo-shelf.theme'), 'dark');

  await act(async () => root.unmount());
});

await check('a theme chosen before React runs survives hydration', async () => {
  // The bug this guards: the pre-paint script sets the theme, then React resets it.
  window.localStorage.setItem('echo-shelf.theme', 'light');
  delete html.dataset.theme;
  window.eval(THEME_SCRIPT);
  assert.equal(html.dataset.theme, 'light', 'the pre-paint script did not apply');

  host.innerHTML = '';
  let root;
  await act(async () => {
    root = harness.render(host);
  });

  assert.equal(html.dataset.theme, 'light', 'mounting the app reset the theme to dark');
  const button = host.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Switch to dark mode', 'the icon disagreed with the theme');
  await act(async () => root.unmount());
});

console.log(`\n${passed} checks passed`);
