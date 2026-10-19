// Checks the theme wiring in a real DOM (jsdom), using the module the app uses
// (lib/theme/dom.ts) and the stylesheet it ships.
//
//   node scripts/check-theme.mjs
//
// This exists because of a bug that only shows up in a browser: <html data-theme>
// was rendered as a JSX prop *and* written imperatively, so React kept reasserting
// its own value and the toggle appeared to do nothing. The last check below guards
// against that coming back.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  appliedTheme,
  applyTheme,
  storedTheme,
  systemTheme,
} from '../lib/theme/dom.ts';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

/** A fresh document, optionally with a stored choice and a stubbed matchMedia. */
function dom({ stored = null, prefersLight = null } = {}) {
  const jsdom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  const { window } = jsdom;
  if (stored) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
  if (prefersLight !== null) {
    window.matchMedia = (query) => ({
      matches: prefersLight && query.includes('light'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    });
  } else {
    // jsdom has no matchMedia, which is the case the script must also survive.
    delete window.matchMedia;
  }
  return window;
}

/** Installs a window as the global one, so the module under test sees it. */
function useWindow(window) {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
}

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

console.log('theme:');

check('the pre-paint script applies a stored choice', () => {
  const window = dom({ stored: 'light' });
  useWindow(window);
  window.eval(THEME_SCRIPT);
  assert.equal(window.document.documentElement.dataset.theme, 'light');
  assert.equal(appliedTheme(), 'light');
});

check('the pre-paint script follows the system when nothing is stored', () => {
  const light = dom({ prefersLight: true });
  useWindow(light);
  light.eval(THEME_SCRIPT);
  assert.equal(light.document.documentElement.dataset.theme, 'light', 'a light system should start light');

  const dark = dom({ prefersLight: false });
  useWindow(dark);
  dark.eval(THEME_SCRIPT);
  assert.equal(dark.document.documentElement.dataset.theme, 'dark');
});

check('the pre-paint script survives a browser with no matchMedia', () => {
  const window = dom(); // no matchMedia at all
  useWindow(window);
  window.eval(THEME_SCRIPT); // must not throw
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
});

check('an unrecognised stored value is ignored rather than trusted', () => {
  const window = dom({ stored: 'neon', prefersLight: false });
  useWindow(window);
  window.eval(THEME_SCRIPT);
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
  assert.equal(storedTheme(), null);
});

check('toggling flips the attribute and remembers it', () => {
  const window = dom({ stored: 'dark' });
  useWindow(window);
  window.eval(THEME_SCRIPT);
  assert.equal(appliedTheme(), 'dark');

  applyTheme('light');
  assert.equal(window.document.documentElement.dataset.theme, 'light');
  assert.equal(window.localStorage.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(storedTheme(), 'light');

  applyTheme('dark');
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
  assert.equal(appliedTheme(), 'dark');
});

check('systemTheme reads the media query', () => {
  useWindow(dom({ prefersLight: true }));
  assert.equal(systemTheme(), 'light');
  useWindow(dom({ prefersLight: false }));
  assert.equal(systemTheme(), 'dark');
});

check('the light stylesheet targets the attribute the script writes', () => {
  const window = dom({ stored: 'light' });
  useWindow(window);
  window.eval(THEME_SCRIPT);
  const root = window.document.documentElement;
  assert.ok(root.matches('[data-theme="light"]'), 'the element does not match the light selector');

  // The override block has to exist and actually redefine the page colours.
  const block = css.match(/:root\[data-theme='light'\] \{([^}]*)\}/);
  assert.ok(block, 'no :root[data-theme=light] token block in globals.css');
  assert.match(block[1], /--color-ink:\s*#f7f5f2/);
  assert.match(block[1], /--color-fg:\s*#17161d/);
  assert.match(css, /color-scheme: light/);
});

check('the surfaces that paint the page read the tokens, not fixed colours', () => {
  assert.match(css, /body \{\s*background-color: var\(--color-ink\)/);
  // Utilities are generated from @theme, which makes them reference the variable at
  // runtime. If the palette were hardcoded instead, the theme could not switch.
  const themeBlock = css.match(/@theme \{([\s\S]*?)\n\}/);
  assert.ok(themeBlock, 'no @theme block in globals.css');
  assert.match(themeBlock[1], /--color-ink: #0a0a0f/);
  assert.match(themeBlock[1], /--color-fg: #f5f5fa/);
});

check('the layout must not render data-theme as a JSX prop', () => {
  // The regression guard: a JSX prop here fights the script and wins.
  const htmlTag = layout.match(/<html[^>]*>/s);
  assert.ok(htmlTag, 'could not find the <html> tag in app/layout.tsx');
  assert.ok(!/data-theme/.test(htmlTag[0]), `<html> carries a data-theme prop: ${htmlTag[0]}`);
  assert.match(layout, /THEME_SCRIPT/, 'the pre-paint script is no longer wired into the layout');
});

console.log(`\n${passed} checks passed`);
