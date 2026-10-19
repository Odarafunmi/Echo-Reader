// The DOM half of the theme system, kept free of React and JSX so it can be
// exercised in Node under jsdom (see scripts/check-theme.mjs).
//
// One rule matters more than the rest: `data-theme` is owned only by the code in
// this file. app/layout.tsx must not render it as a JSX prop, or React will keep
// reasserting its own value and silently undo every toggle.

export type Theme = 'dark' | 'light';

/** Where the choice is kept so the pre-paint script can read it. */
export const THEME_STORAGE_KEY = 'echo-shelf.theme';

/**
 * Applied before React runs, so nobody sees a dark page repainted as light.
 * A saved choice wins; otherwise the system preference decides.
 */
export const THEME_SCRIPT = `(function(){var t='dark';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');}catch(e){}document.documentElement.dataset.theme=t;})();`;

/** The theme currently applied, read back off the element. */
export function appliedTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** What the operating system prefers. */
export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The stored choice, or null when the person has not made one. */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Applies a theme. Sets the attribute and nothing else: CSS keys every colour,
 * including color-scheme, off that attribute. Writing an inline style here too
 * would not match the server-rendered HTML and would trip a hydration warning.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the theme still applies for this visit */
  }
}
