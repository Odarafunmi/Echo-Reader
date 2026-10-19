'use client';

// Dark and light app themes.
//
// The choice lives on <html data-theme>, is kept in localStorage so the inline
// script in app/layout.tsx can apply it before the first paint, and is mirrored to
// IndexedDB so it survives a cleared cache the way the rest of the app's data
// does. Until someone chooses, the system preference decides and keeps being
// followed. The DOM work itself is in lib/theme/dom.ts.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getSettings, putSettings } from '@/lib/db';
import {
  appliedTheme,
  applyTheme,
  storedTheme,
  systemTheme,
  type Theme,
} from './dom';

export type { Theme };

export interface ThemeApi {
  theme: Theme;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeGate({ children }: { children: ReactNode }) {
  // Starts at dark to match the server render; the effect below adopts whatever the
  // inline script already applied, so the first client render cannot disagree.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const initial = appliedTheme();
    setThemeState(initial);
    getSettings()
      .then((settings) => {
        if (settings && (settings.theme === 'light' || settings.theme === 'dark')) {
          setThemeState(settings.theme);
          applyTheme(settings.theme);
        }
      })
      .catch(() => {
        /* IndexedDB unavailable: the localStorage value already applied stands */
      });

    // Follow the system while the person has not chosen for themselves.
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => {
      if (storedTheme()) return;
      const next = systemTheme();
      setThemeState(next);
      applyTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    putSettings({ id: 'app', theme: next }).catch(() => {
      /* the localStorage copy is enough for the next paint */
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(appliedTheme() === 'light' ? 'dark' : 'light');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeGate>');
  return ctx;
}
